'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Stethoscope, ListChecks, Hand, FlaskConical, Activity, ClipboardCheck } from 'lucide-react'
import {
  ROS_CATEGORIES,
  type ROSCategory,
  type ROSState,
  type HPIField,
  makeInitialROSState,
  scanMessageForROS,
  scanMessageForHPIFields,
  makeInitialHPIFieldState,
  looksClinical,
  classifyFinding,
} from '../lib/rosDetector'
import { type OpenIResult, fetchImagingResults } from '../lib/imagingSearch'
import { type ECGImage, getECGCategory, getBestECGImage } from '../lib/ecgImageLookup'
import {
  type SpecialImage, type SpecialModality,
  getSpecialModality, getSpecialCategory, getRandomSpecialImage,
} from '../lib/specialImageLookup'
import { MANIFEST, makeCaseId, findCaseInManifest } from '../lib/caseManifest'
import { ANON_CASE_IDS, ANON_CASE_LIMIT } from '../lib/anonymousCases'
import { jitterCase } from '../lib/caseJitter'
import { reconcileHistoryConsistency, sanitizePmhLeak, DIFFICULTY_RULES } from '../lib/generators/shared'
import { type GradingResult, type GradingInput, stripToBasic } from '../grading/types'
import { gradeCase, type GradingUsageCallback } from '../grading/grader'
import { type DimensionKey } from '../grading/rubric'
import {
  type RawUsage, type APICallType, type ActiveSession,
  makeCallRecord, recordToSession, createActiveSession, finalizeSession, syncSessionToSupabase,
  recordAbandonedSession,
} from '../lib/analytics'
import { recordCaseOutcome } from '../lib/reasoning/store'
import { type CaseData, type NotesState, selectHpi, SOAP_TEMPLATE } from './_lib/types'
import { isPendingTest } from './_lib/pendingTests'
import { findResultKey, getVitalStatus, isECGTest } from './_lib/testUtils'
import { type CaseHistoryEntry, addHistoryEntry, hasUsedROSBefore, markROSUsed, getUsedNames, recordUsedName } from './_lib/localHistory'
import { useTimer, fmtTime } from './_lib/useTimer'
import { callClaude } from './_lib/callClaude'
import { Badge } from './_components/Badge'
import { MicButton } from './_components/MicButton'
import { HelpModal, hasHelpContent } from './_components/HelpModal'
import { HPIView } from './_components/HPIView'
import { ROSView } from './_components/ROSView'
import { ExamView } from './_components/ExamView'
import { OrderView } from './_components/OrderView'
import { ResultsView } from './_components/ResultsView'
import { DiagnosisView } from './_components/DiagnosisView'

const SYSTEMS = [
  'Any',
  'Cardiovascular',
  'Respiratory',
  'Neurologic',
  'Gastrointestinal',
  'Renal',
  'Endocrine / Metabolic',
  'Infectious',
  'Hematologic / Oncologic',
  'Musculoskeletal',
  'Psychiatric',
  'Toxicologic',
  'Trauma',
]

const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']


const NAV = [
  { id: 'hpi',       label: 'History of Present Illness', icon: Stethoscope },
  { id: 'ros',       label: 'Review of Systems',          icon: ListChecks },
  { id: 'exam',      label: 'Physical Examination',       icon: Hand },
  { id: 'order',     label: 'Order Tests',                icon: FlaskConical },
  { id: 'results',   label: 'Test Results',               icon: Activity },
  { id: 'diagnosis', label: 'Diagnosis',                  icon: ClipboardCheck },
]

const GENERATION_PHASES = [
  'Selecting clinical scenario…',
  'Building patient presentation…',
  'Generating lab and imaging results…',
  'Writing background history…',
  'Finalizing case details…',
] as const



const DIFFICULTY_INFO: Record<string, string> = {
  Foundations: 'Foundations — Common textbook diagnoses, classic presentations, no timer. Output: diagnosis only.',
  Clinical:    'Clinical — Moderate diagnoses, 1-2 atypical features, 22-minute timer. Output: diagnosis + reasoning.',
  Advanced:    'Advanced — Rare/complex diagnoses, multiple red herrings, 15-minute timer. Output: SOAP note + oral presentation.',
}


interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'success' | 'info'
  content: string
}


// Components extracted to _components/ and hooks/utils to _lib/


export default function MedTrainer() {
  const [system, setSystem] = useState('Any')
  const [difficulty, setDifficulty] = useState('Foundations')
  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [activeSection, setActiveSection] = useState('hpi')
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set())
  const [orderedTests, setOrderedTests] = useState<Set<string>>(new Set())
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [userDiagnosis, setUserDiagnosis] = useState('')
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<DimensionKey | null>(null)
  const [gradingLoading, setGradingLoading] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const [caseDifficulty, setCaseDifficulty] = useState<string>('')
  const [revealedExamRegions, setRevealedExamRegions] = useState<Set<string>>(new Set())
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set())
  const [rosState, setRosState] = useState<ROSState>(makeInitialROSState())
  const [userPresentation, setUserPresentation] = useState('')

  const [hpiUnlocked, setHpiUnlocked] = useState<Record<HPIField, boolean>>(makeInitialHPIFieldState())
  const [imagingCache, setImagingCache] = useState<Record<string, OpenIResult[] | null>>({})
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [ecgCache, setEcgCache] = useState<Record<string, ECGImage | null | 'none'>>({})
  const [smearCache, setSmearCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [biopsyImgCache, setBiopsyImgCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [fundusCache, setFundusCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [dermCache, setDermCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [urineImgCache, setUrineImgCache] = useState<Record<string, SpecialImage | null | 'none'>>({})

  // Clinical accordion state
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  // Advanced search state
  const [testSearchQuery, setTestSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [customTestInput, setCustomTestInput] = useState('')
  const [generatingOnDemand, setGeneratingOnDemand] = useState<Set<string>>(new Set())
  const [failedOnDemand, setFailedOnDemand] = useState<Set<string>>(new Set())
  const [showRosHint, setShowRosHint] = useState(false)
  const onDemandQueuedRef = useRef<Set<string>>(new Set())

  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { type: 'info', content: 'MedTrainer Terminal — type "help" for commands' },
  ])
  const [terminalInput, setTerminalInput] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalLoading, setTerminalLoading] = useState(false)

  const [timedOutToast, setTimedOutToast] = useState(false)
  const [notes, setNotes] = useState<NotesState>({ mode: 'free', content: '', open: false })
  const [caseStarted, setCaseStarted] = useState(true)
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<CaseHistoryEntry[]>([])
  const [pendingGenerateWithNotes, setPendingGenerateWithNotes] = useState(false)
  const [helpSection, setHelpSection] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [generationPhase, setGenerationPhase] = useState(0)
  const [gradingError, setGradingError] = useState<string | null>(null)
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, number>>({})
  const [feedbackHover, setFeedbackHover] = useState<Record<string, number>>({})
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [chatPanelHeight, setChatPanelHeight] = useState(28)
  const [chatPanelCollapsed, setChatPanelCollapsed] = useState(false)
  const chatDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const timerExpireRef = useRef<(() => void) | null>(null)
  const analyticsSessionRef = useRef<ActiveSession | null>(null)
  const activeSectionRef = useRef<string>('hpi')
  const resolvedSystemRef = useRef<string>('')
  const pendingDiagnosisRef = useRef<string | null>(null)
  const pendingRedoOfRef = useRef<string | null>(null)
  const activeRedoOfRef = useRef<string | null>(null)

  // Pre-select system/difficulty from URL params; capture redo diagnosis and lineage
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const s = p.get('system')
    // Pre-selection comes from URL query params, only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s && SYSTEMS.includes(s)) setSystem(s)
    const d = p.get('difficulty')
    if (d === 'Foundations' || d === 'Clinical' || d === 'Advanced') setDifficulty(d)
    const dx = p.get('diagnosis')
    if (dx) pendingDiagnosisRef.current = dx
    const redo = p.get('redoOf')
    if (redo) pendingRedoOfRef.current = redo
  }, [])

  // Gate / tier state
  type GateStatus = { tier: 'anonymous' | 'free' | 'pro'; casesLeft: number; firstCaseDone: boolean; loaded: boolean; nextCaseId?: string }
  const [gateStatus, setGateStatus] = useState<GateStatus>({ tier: 'anonymous', casesLeft: ANON_CASE_LIMIT, firstCaseDone: false, loaded: false })
  const [gateBlocked, setGateBlocked] = useState(false)

  // True when a Clinical/Advanced case exists but the timer hasn't been started yet
  const locked = !caseStarted

  const recordApiCall = (type: APICallType, usage: RawUsage) => {
    const session = analyticsSessionRef.current
    if (!session) return
    recordToSession(session, makeCallRecord(type, usage))
  }

  const handleTimerExpire = useCallback(() => {
    setTimedOutToast(true)
    setTimeout(() => {
      setTimedOutToast(false)
      timerExpireRef.current?.()
    }, 2000)
  }, [])

  const { timerState, startTimer, pauseTimer, resumeTimer, completeTimer, resetTimer } = useTimer(handleTimerExpire)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const terminalInputRef = useRef<HTMLInputElement>(null)
  const prevSectionRef = useRef<string>(activeSection)

  // Load gate status once on mount
  useEffect(() => {
    fetch('/api/gate/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setGateStatus({ tier: data.tier, casesLeft: data.casesLeft ?? 0, firstCaseDone: data.firstCaseDone ?? false, loaded: true, nextCaseId: data.nextCaseId })
        if (data.tier === 'free' || data.tier === 'anonymous') {
          setDifficulty('Foundations')
          setSystem('Any')
        }
      })
      .catch(() => setGateStatus(g => ({ ...g, loaded: true })))
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  useEffect(() => {
    if (prevSectionRef.current === 'results' && activeSection !== 'results') {
      setCollapsedPanels(new Set())
    }
    prevSectionRef.current = activeSection
    activeSectionRef.current = activeSection
  }, [activeSection])

  useEffect(() => {
    const handler = () => {
      if (analyticsSessionRef.current !== null) {
        recordAbandonedSession(analyticsSessionRef.current, activeSectionRef.current)
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('medtrainer_chat_height')
      // Mount-only restore of the persisted chat panel height from localStorage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setChatPanelHeight(Number(saved) || 28)
    } catch {}
  }, [])

  const handleChatDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    chatDragRef.current = { startY: e.clientY, startHeight: chatPanelHeight }
    const handleMove = (ev: MouseEvent) => {
      if (!chatDragRef.current) return
      const deltaPercent = ((chatDragRef.current.startY - ev.clientY) / window.innerHeight) * 100
      const newH = Math.min(50, Math.max(15, chatDragRef.current.startHeight + deltaPercent))
      setChatPanelHeight(newH)
      try { localStorage.setItem('medtrainer_chat_height', String(Math.round(newH))) } catch {}
    }
    const handleUp = () => {
      chatDragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  useEffect(() => {
    // Reset/advance the generation phase indicator in response to the generating flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!generating) { setGenerationPhase(0); return }
    const id = setInterval(() => {
      setGenerationPhase(p => Math.min(p + 1, GENERATION_PHASES.length - 1))
    }, 3000)
    return () => clearInterval(id)
  }, [generating])

  useEffect(() => {
    if (activeSection === 'diagnosis' && notes.content.trim()) {
      // Auto-open the notes panel when the user reaches the diagnosis step.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotes(prev => ({ ...prev, open: true }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  // ROS onboarding hint — show when user first visits ROS tab before asking anything
  useEffect(() => {
    if (activeSection === 'ros' && caseData && !hasUsedROSBefore()) {
      // Defer by one tick so the tab-click itself doesn't immediately trigger click-away
      const id = setTimeout(() => setShowRosHint(true), 50)
      return () => clearTimeout(id)
    } else {
      // Hide the ROS hint whenever the active section is not the ROS tab.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowRosHint(false)
    }
  }, [activeSection, caseData])

  // Auto-dismiss after 30 s
  useEffect(() => {
    if (!showRosHint) return
    const id = setTimeout(() => { setShowRosHint(false); markROSUsed() }, 30000)
    return () => clearTimeout(id)
  }, [showRosHint])

  // Permanently dismiss once any ROS field is unlocked
  useEffect(() => {
    const anyUnlocked = ROS_CATEGORIES.some(c => rosState[c]?.status !== 'locked')
    // Permanently dismiss the hint once the user interacts with any ROS field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (anyUnlocked) { setShowRosHint(false); markROSUsed() }
  }, [rosState])

  // Click-away dismissal (document-level, deferred so the triggering click doesn't count)
  useEffect(() => {
    if (!showRosHint) return
    const dismiss = () => { setShowRosHint(false); markROSUsed() }
    const id = setTimeout(() => document.addEventListener('click', dismiss, { once: true }), 100)
    return () => { clearTimeout(id); document.removeEventListener('click', dismiss) }
  }, [showRosHint])

  useEffect(() => {
    if (activeSection !== 'results' || !caseData) return
    const orderedArr = Array.from(orderedTests)
    // Exclude ECG — handled by the ECG-specific effect below
    const imagingTests = orderedArr.filter(t =>
      findResultKey(t, caseData.imagingResults) !== null && !isECGTest(t)
    )
    const toFetch = imagingTests.filter(t => !(t in imagingCache))
    if (toFetch.length === 0) return

    // Mark newly-ordered imaging as loading before the async fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImagingCache(prev => {
      const next = { ...prev }
      for (const t of toFetch) next[t] = null
      return next
    })

    void Promise.all(
      toFetch.map(async t => {
        try {
          const results = await fetchImagingResults({
            orderedTest: t,
            caseDiagnosis: caseData.diagnosis,
            imagingCategory: caseData.imagingCategory,
          })
          setImagingCache(prev => ({ ...prev, [t]: results }))
          // Write-back: persist to Supabase so next load serves from cache
          if (activeCaseId && results.length > 0) {
            fetch('/api/cases/cache-imaging', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: activeCaseId, testName: t, results }),
            }).catch(() => {})
          }
        } catch {
          setImagingCache(prev => ({ ...prev, [t]: [] }))
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, caseData, activeCaseId])

  useEffect(() => {
    if (activeSection !== 'results' || !caseData) return
    const orderedArr = Array.from(orderedTests)
    const ecgTests = orderedArr.filter(t =>
      findResultKey(t, caseData.imagingResults) !== null && isECGTest(t)
    )
    const toFetch = ecgTests.filter(t => !(t in ecgCache))
    if (toFetch.length === 0) return

    // Mark newly-ordered ECGs as loading before the async fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEcgCache(prev => {
      const next = { ...prev }
      for (const t of toFetch) next[t] = null
      return next
    })

    void Promise.all(
      toFetch.map(async t => {
        try {
          const ecgReport = caseData.imagingResults[findResultKey(t, caseData.imagingResults)!] ?? ''
          const category = getECGCategory(caseData.diagnosis, caseData.ecgFindings ?? ecgReport)
          const image = await getBestECGImage(category, caseData.ecgFindings ?? ecgReport)
          setEcgCache(prev => ({ ...prev, [t]: image ?? 'none' }))
        } catch {
          setEcgCache(prev => ({ ...prev, [t]: 'none' }))
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, caseData])

  useEffect(() => {
    if (activeSection !== 'results' || !caseData) return
    const orderedArr = Array.from(orderedTests)
    const cacheMap: Record<SpecialModality, {
      cache: Record<string, SpecialImage | null | 'none'>
      setter: React.Dispatch<React.SetStateAction<Record<string, SpecialImage | null | 'none'>>>
      findingField: keyof CaseData
    }> = {
      smear:  { cache: smearCache,     setter: setSmearCache,     findingField: 'hematologyFindings' },
      biopsy: { cache: biopsyImgCache, setter: setBiopsyImgCache, findingField: 'biopsyFindings'    },
      fundus: { cache: fundusCache,    setter: setFundusCache,    findingField: 'fundusFindings'     },
      derm:   { cache: dermCache,      setter: setDermCache,      findingField: 'skinFindings'       },
      urine:  { cache: urineImgCache,  setter: setUrineImgCache,  findingField: 'urineFindings'      },
    }
    const specialTests = orderedArr.filter(t => {
      const m = getSpecialModality(t)
      if (!m) return false
      const { cache } = cacheMap[m]
      return !(t in cache)
    })
    if (specialTests.length === 0) return

    for (const t of specialTests) {
      const modality = getSpecialModality(t)!
      const { setter } = cacheMap[modality]
      setter(prev => ({ ...prev, [t]: null }))
    }

    void Promise.all(
      specialTests.map(async t => {
        const modality = getSpecialModality(t)!
        const { setter, findingField } = cacheMap[modality]
        try {
          const finding = (caseData[findingField] as string | undefined) ?? ''
          const category = getSpecialCategory(modality, caseData.diagnosis, finding)
          const image = await getRandomSpecialImage(modality, category)
          setter(prev => ({ ...prev, [t]: image ?? 'none' }))
        } catch {
          setter(prev => ({ ...prev, [t]: 'none' }))
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, caseData])

  // On-demand result generation: if a test was ordered but has no pre-generated result,
  // call Claude to generate one rather than silently dropping it from the results view.
  useEffect(() => {
    if (!caseData || orderedTests.size === 0) return
    const missing = Array.from(orderedTests).filter(t => {
      if (onDemandQueuedRef.current.has(t)) return false
      if (findResultKey(t, caseData.labResults) !== null) return false
      if (findResultKey(t, caseData.imagingResults) !== null) return false
      if (caseData.procedureResults && findResultKey(t, caseData.procedureResults) !== null) return false
      if (isPendingTest(t)) return false
      return true
    })
    if (missing.length === 0) return

    for (const testName of missing) {
      onDemandQueuedRef.current.add(testName)
      console.error(`[MedTrainer] No pre-generated result for "${testName}" — generating on demand`)
      setGeneratingOnDemand(prev => new Set([...prev, testName]))
      ;(async () => {
        try {
          const isLikelyImaging = /\b(x.?ray|xray|mri|ct\b|ultrasound|echo|scan|radiograph|pet|mibg|dexa|bone scan|doppler|angiograph|spirometry|pfts|pulmonary function|ecg|ekg|holter|stress test|endoscopy|colonoscopy|bronchoscopy|biopsy|lumbar puncture|paracentesis|thoracentesis|arthrocentesis|nerve conduction|electromyography|emg\b|eeg\b|tilt table)\b/i.test(testName)
          const prompt = `Case context: ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, diagnosis: "${caseData.diagnosis}", comorbidities: "${caseData.pastMedicalHistory?.conditions ?? 'none'}"

Generate a realistic result for the ordered test: "${testName}"
The result should be clinically appropriate for this patient's diagnosis and comorbidities.

Return ONLY valid JSON — no markdown, no explanation:
{
  "isImaging": ${isLikelyImaging},
  "labResult": {
    "components": [
      { "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }
    ]
  },
  "imagingResult": "<2-3 sentence radiology-style report — only include if isImaging is true>"
}`
          const text = await callClaude(
            'You are a medical simulator. Generate realistic, clinically consistent test results. Return ONLY valid JSON.',
            [{ role: 'user', content: prompt }],
            400,
            (u) => recordApiCall('on_demand', u)
          )
          const m = text.match(/\{[\s\S]*\}/)
          if (!m) throw new Error('No JSON in on-demand result response')
          const data = JSON.parse(m[0])
          setCaseData(prev => {
            if (!prev) return prev
            if (data.isImaging && data.imagingResult) {
              return { ...prev, imagingResults: { ...prev.imagingResults, [testName]: data.imagingResult } }
            } else if (data.labResult) {
              return { ...prev, labResults: { ...prev.labResults, [testName]: data.labResult } }
            }
            return prev
          })
        } catch (e) {
          console.error(`[MedTrainer] On-demand generation failed for "${testName}":`, e)
          setFailedOnDemand(prev => new Set([...prev, testName]))
        } finally {
          setGeneratingOnDemand(prev => { const n = new Set(prev); n.delete(testName); return n })
        }
      })()
    }
  }, [orderedTests, caseData])

  const generateCase = async (overrideSystem?: string, overrideDifficulty?: string, overrideDiagnosis?: string): Promise<CaseData | null> => {
    let gateTier: string | undefined
    let gateNextCaseId: string | undefined
    try {
      const gateRes = await fetch('/api/gate/check', { method: 'POST', signal: AbortSignal.timeout(5_000) })
      const gate = await gateRes.json()
      if (!gate.allowed) {
        setGateBlocked(true)
        return null
      }
      gateTier = gate.tier
      gateNextCaseId = gate.nextCaseId
      setGateStatus(prev => ({ ...prev, tier: gate.tier, casesLeft: gate.casesLeft ?? 0, firstCaseDone: gate.firstCaseDone ?? false, nextCaseId: gate.nextCaseId }))
    } catch {
      // Network error — fail open
    }

    setGenerationError(null)
    setGradingError(null)
    setGenerating(true)
    resetTimer()
    setCaseStarted(true)
    setCaseData(null)
    setOrderedTests(new Set())
    setSelectedTests(new Set())
    setRevealedExamRegions(new Set())
    setChatMessages([])
    setGradingResult(null)
    setRevealed(false)
    setUserDiagnosis('')
    setFeedbackRatings({})
    setFeedbackHover({})
    setFeedbackText('')
    setFeedbackSubmitted(false)
    setFeedbackSubmitting(false)
    setUserPresentation('')
    setActiveSection('hpi')
    setCollapsedPanels(new Set())
    setOpenCategories(new Set())
    setGeneratingOnDemand(new Set())
    setFailedOnDemand(new Set())
    onDemandQueuedRef.current = new Set()
    setRosState(makeInitialROSState())
    setHpiUnlocked(makeInitialHPIFieldState())
    setImagingCache({})
    setActiveCaseId(null)
    setEcgCache({})
    setSmearCache({})
    setBiopsyImgCache({})
    setFundusCache({})
    setDermCache({})
    setUrineImgCache({})

    // ── Anonymous demo path — serve one of the 3 fixed cases from Supabase, no Claude ──
    if (gateTier === 'anonymous' && gateNextCaseId) {
      const anonCaseId = gateNextCaseId
      const found = findCaseInManifest(anonCaseId)
      resolvedSystemRef.current = found?.system ?? 'Cardiovascular'
      setCaseDifficulty(found?.difficulty ?? 'Foundations')
      setNotes({ mode: 'free', content: '', open: false })
      setActiveCaseId(anonCaseId)
      try {
        const lookupRes = await fetch(`/api/cases/lookup?id=${encodeURIComponent(anonCaseId)}`)
        if (lookupRes.ok) {
          const { status, caseData: cached, imagingCache: prefetched } = await lookupRes.json()
          if (status === 'hit' && cached) {
            setImagingCache(prefetched ?? {})
            setCaseData(cached as CaseData)
            setGenerating(false)
            return cached as CaseData
          }
        }
      } catch { /* fall through to error */ }
      setGenerationError('Demo case unavailable — please try again or sign up for full access.')
      setGenerating(false)
      return null
    }

    const baseSystem = overrideSystem ?? system
    const resolvedSystem = baseSystem === 'Any'
      ? SYSTEMS.filter(s => s !== 'Any')[Math.floor(Math.random() * (SYSTEMS.length - 1))]
      : baseSystem
    resolvedSystemRef.current = resolvedSystem
    const resolvedDifficulty = overrideDifficulty ?? difficulty

    setCaseDifficulty(resolvedDifficulty)
    setNotes({
      mode: resolvedDifficulty === 'Advanced' ? 'soap' : 'free',
      content: resolvedDifficulty === 'Advanced' ? SOAP_TEMPLATE : '',
      open: false,
    })

    // Capture pending redo params and clear refs for this generation
    const overrideDx = overrideDiagnosis ?? pendingDiagnosisRef.current
    const capturedRedoOf = pendingRedoOfRef.current
    const isRedo = !!capturedRedoOf
    pendingDiagnosisRef.current = null
    pendingRedoOfRef.current = null
    activeRedoOfRef.current = capturedRedoOf

    // 40% of the time: try an image-anchored case (skip when redo-ing a specific diagnosis)
    if (!overrideDx && Math.random() < 0.4) {
      try {
        const t0 = performance.now()
        const imgRes = await fetch(
          `/api/cases/image-first?system=${encodeURIComponent(resolvedSystem)}&difficulty=${encodeURIComponent(resolvedDifficulty)}`,
          { signal: AbortSignal.timeout(10_000) }
        )
        if (imgRes.ok) {
          const imgData = await imgRes.json()
          console.log(`[gen] image-first ${imgData.status} in ${Math.round(performance.now() - t0)}ms`)
          if (imgData.status === 'hit' && imgData.caseData) {
            if (imgData.caseData.patientInfo?.name) recordUsedName(imgData.caseData.patientInfo.name)
            setActiveCaseId(imgData.caseId)
            setCaseData(jitterCase(imgData.caseData))
            if (imgData.imagingCache && typeof imgData.imagingCache === 'object') {
              const seed: Record<string, OpenIResult[] | null> = {}
              for (const [k, v] of Object.entries(imgData.imagingCache)) {
                if (Array.isArray(v)) seed[k] = v as OpenIResult[]
              }
              if (Object.keys(seed).length > 0) setImagingCache(seed)
            }
            setCaseStarted(resolvedDifficulty === 'Foundations')
            setGenerating(false)
            return imgData.caseData
          }
        }
      } catch (e) {
        const name = (e as { name?: string } | null)?.name
        if (name === 'TimeoutError' || name === 'AbortError') console.warn('[gen] image-first fetch timed out — falling through to manifest')
        // fall through to manifest
      }
    }

    // Pick a specific diagnosis from the manifest so we can use the Supabase cache
    // When redo-ing, use the override diagnosis and skip the cache lookup
    const manifestDiagnoses = MANIFEST[resolvedSystem]?.[resolvedDifficulty] ?? []
    const diagnosis = overrideDx ?? (manifestDiagnoses.length > 0
      ? manifestDiagnoses[Math.floor(Math.random() * manifestDiagnoses.length)]
      : null)
    const caseId = diagnosis && !overrideDx ? makeCaseId(resolvedSystem, resolvedDifficulty, diagnosis, 0) : null
    setActiveCaseId(caseId)

    // If a case was in progress, record it as abandoned before replacing the session
    if (analyticsSessionRef.current !== null) {
      recordAbandonedSession(analyticsSessionRef.current, activeSectionRef.current)
    }
    analyticsSessionRef.current = createActiveSession(resolvedSystem, resolvedDifficulty)

    const recentNames = getUsedNames()
    const nationalityPool = [
      'Nigerian','Brazilian','Filipino','Vietnamese','Pakistani','Ukrainian','Mexican',
      'Korean','Ghanaian','Indian','Egyptian','Peruvian','Ethiopian','Polish','Somali',
      'Bangladeshi','Colombian','Haitian','Indonesian','Moroccan','Kenyan','Argentinian',
      'Cambodian','Senegalese','Romanian','Bolivian','Uzbek','Sudanese','Guatemalan',
      'Congolese','Thai','Algerian','Salvadoran','Ugandan','Afghan','Nepali','Ecuadorian',
      'Tanzanian','Mongolian','Serbian','Azerbaijani','Honduran','Rwandan','Belarusian',
      'Tunisian','Paraguayan','Lithuanian','Zambian','Myanmarese','Jordanian'
    ]
    const namesClause = `Pick ONE nationality at random from this list for the patient: ${nationalityPool.join(', ')}. Use a realistic first name and last name that fits that nationality. Every case must use a different nationality — do not repeat. ${recentNames.length > 0 ? `ALREADY USED NAMES (do not reuse): ${recentNames.join(', ')}.` : ''}`

    const claudeSystem = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. ${namesClause} Never reuse first names or last names across cases.`

    const diffCount = resolvedDifficulty === 'Foundations' ? '2-3' : resolvedDifficulty === 'Clinical' ? '3-4' : '4-5'
    const redoClause = isRedo ? ' Use a fresh patient demographic profile and a different clinical presentation than a typical textbook case for this diagnosis.' : ''
    const diagnosisLine = diagnosis ? ` for the diagnosis: "${diagnosis}"` : ''
    const prompt = `Generate a realistic ${resolvedSystem} clinical case${diagnosisLine}.${redoClause} Strictly follow the difficulty rules below.

${DIFFICULTY_RULES[resolvedDifficulty] ?? DIFFICULTY_RULES['Foundations']}

Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component (e.g. CBC must expand into WBC, Hemoglobin, Hematocrit, Platelets, etc.). Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result. Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs — copy it character-for-character. Do NOT use abbreviations or shortened names as keys. For example if availableLabs contains "Prothrombin Time (PT) / INR", the labResults key must be "Prothrombin Time (PT) / INR" not "PT/INR" or "PT" or "Coagulation Panel".
CRITICAL: The lab/imaging results must include at least one finding that, when interpreted clinically, points to the correct diagnosis over its closest differential — describe findings objectively (e.g. 'monosodium urate crystals on synovial fluid', 'filling defect in the right pulmonary artery on CT-PA', 'ST elevation in leads II/III/aVF'). Do not name the diagnosis in result text, and do not generate ambiguous results that leave the diagnosis unconfirmable.
STEMI RULE: When the diagnosis is any form of STEMI (inferior, anterior, lateral, posterior, STEMI equivalent), the ecgFindings field MUST explicitly state the affected leads with millimeter elevation (e.g. "2mm ST elevation in leads II, III, and aVF with reciprocal ST depression in I and aVL, consistent with inferior STEMI"). Never write borderline or possible ST elevation for a STEMI diagnosis — the ECG must be unambiguously diagnostic.
AIN/DRUG-INDUCED NEPHRITIS RULE: When the diagnosis is Acute Interstitial Nephritis (AIN), drug-induced nephropathy, or similar medication-triggered renal injury, the causative agent (NSAID, antibiotic, PPI, etc.) MUST appear prominently in currentMedications.otc or currentMedications.medications with duration (e.g. "Ibuprofen 600mg TID × 3 weeks"). It must be listed as a recent or current medication, not just mentioned in passing.
FIBRILLARY GN EXCLUSION: Do NOT generate Fibrillary Glomerulonephritis as a diagnosis at any difficulty. For Advanced Renal cases, choose instead: IgA Nephropathy (Berger's Disease), Focal Segmental Glomerulosclerosis (FSGS), Membranous Nephropathy, ANCA-associated vasculitis, or Thrombotic Microangiopathy.
WHIPPLE'S BIOPSY RULE: When the diagnosis is Whipple's Disease (Tropheryma whipplei), "Upper Endoscopy (EGD) with Small Bowel Biopsy" MUST be included in availableImaging, and the procedureResults entry for it MUST explicitly describe PAS-positive macrophages with foamy cytoplasm distending the lamina propria — the pathognomonic histological finding without which the diagnosis cannot be confirmed.
CLL DISCRIMINATOR RULE: When the diagnosis is Chronic Lymphocytic Leukemia (CLL) or CLL with AIHA, "Flow Cytometry (Peripheral Blood)" MUST be included in availableLabs and its labResults MUST show CD5+/CD19+/CD23+ lymphocyte population — the immunophenotype that distinguishes CLL from PNH, lymphoma, and other B-cell malignancies.
WALDENSTRÖM DISCRIMINATOR RULE: When the diagnosis is Waldenström Macroglobulinemia, "Serum Protein Electrophoresis (SPEP) with Immunofixation" MUST be in availableLabs and its labResults MUST show an IgM monoclonal spike. The hiddenHistory.fullHistory or hiddenSymptoms MUST include at least one hyperviscosity symptom (blurred vision, headache, epistaxis, or neurological changes) to distinguish from Multiple Myeloma (which produces IgG/IgA, not IgM).
PAST HISTORY CONSISTENCY RULE: The pastMedicalHistory fields shown to the patient (conditions, surgeries, hospitalizations) MUST NOT contradict hiddenHistory.fullHistory. If pastMedicalHistory.surgeries states "None" or "No prior surgeries", then hiddenHistory.fullHistory MUST NOT reveal any surgeries. The patient's visible history and hidden history must be completely consistent — the hidden history may ADD detail, but must never contradict what was already stated.
PHYSICAL EXAM OBJECTIVITY RULE: Every physicalExam field MUST describe only objective, observable findings (e.g., "dullness to percussion at right base", "pitting edema 2+ bilateral lower extremities", "JVD at 45 degrees"). NEVER include diagnostic interpretations, disease names, or phrases like "consistent with X", "suggesting X", or "findings of X". The exam reports what the clinician sees, hears, and feels — not what it means. Diagnosis is the user's task.
INTERPRETATION OBJECTIVITY RULE: In imagingResults, procedureResults, hematologyFindings, urineFindings, fundusFindings, skinFindings, biopsyFindings, and relevantTests[].imagingResult — NEVER include phrases like "consistent with [disease]", "suggestive of [disease]", "suggesting [disease]", "indicative of [disease]", "compatible with [disease]", "characteristic of [disease]", "diagnostic of [disease]", "concerning for [disease]", or "findings of [disease]". Do NOT name the diagnosis anywhere in these fields. Describe only what is physically observed: specific morphological features, measurements, signal characteristics, distribution, color, and density. The student infers the diagnosis — the findings must not hand it to them. STEMI EXCEPTION: ecgFindings for STEMI cases must retain "consistent with [anatomic-area] STEMI" as required by the STEMI RULE.
HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 40 words for Clinical and 20 words for Advanced — count every word and cut if over. For Clinical: 2-3 sentences stating age, sex, primary symptom(s), and duration only. For Advanced: 1-2 sentences stating age, sex, and one vague complaint only. STRICTLY FORBIDDEN in hpi regardless of difficulty: substance or toxin names, ingestion or exposure details, witness or bystander accounts, symptom progression or timeline, pertinent positives/negatives, characterization, radiation, aggravating/relieving factors, physical findings on arrival. Everything forbidden here belongs in hiddenHistory.fullHistory instead.
MANAGEMENT TEACHING POINT RULE: At least ONE of the four teachingPoints MUST be a concrete management/treatment point — name a specific first-line agent, dose, threshold, target, or guideline-anchored decision rule (e.g., "Initiate IV labetalol; reduce MAP by no more than 25% in the first hour" | "tPA window is 4.5h from last-known-well; absolute contraindications include BP >185/110, recent surgery <14 days, active bleeding"). A pearl that only describes pathophysiology, epidemiology, or diagnostic criteria does NOT satisfy this rule. Generic statements like "treat the underlying cause" are insufficient.
KEY QUESTIONS COVERAGE RULE: Every clinically pivotal item in hiddenHistory (predisposing structural lesion, prior TIA or sentinel event, critical precipitant, key exposure, family thrombophilia, prior episode) MUST be elicitable through at least one entry in keyQuestions. Walk through hiddenHistory.fullHistory, familyHistory, medications, and hiddenSymptoms — for any finding that materially changes the diagnosis, risk stratification, or management, write a directed question that would surface it. Generic questions like "Any other symptoms?" do NOT count.
DANGEROUS MIMIC RULE: At least ONE differential MUST be the single most dangerous "can't-miss" mimic of the primary diagnosis — a condition that, if missed, causes serious immediate harm and shares enough features to plausibly mislead a clinician before the key discriminating test is ordered (e.g., STEMI for Acute Pericarditis; Cauda Equina Syndrome for Lumbar Disc Herniation with Radiculopathy; Pulmonary Embolism for PCP Pneumonia; HHS for DKA). Identify this mimic explicitly in differentialExplanations and name the one finding or test that definitively distinguishes it from the correct diagnosis.
PMH LEAK RULE: The pastMedicalHistory fields (conditions, surgeries, hospitalizations) MUST NOT leak the diagnosis through negation or denial. NEVER write phrases like "No prior [organ/system] disease", "No history of [organ/system]", "Denies [organ/system] disorders", "Never had [organ/system]", "Negative for [organ/system]", or any similar exclusion where the organ/system overlaps the diagnosis. Negative pertinents belong in reviewOfSystems, NEVER in pastMedicalHistory. If the patient has no chronic conditions, conditions MUST be EXACTLY "None." — no extra text, no negative pertinents, no medication mentions. Field lane enforcement: conditions = chronic diagnoses ONLY (never medications); surgeries = prior procedures ONLY; hospitalizations = prior inpatient stays ONLY. Medications including oral contraceptives, vitamins, and supplements belong in currentMedications.medications or currentMedications.otc, NEVER in pastMedicalHistory.conditions.
{
  "patientInfo": {
    "name": "First Last",
    "age": <number>,
    "gender": "Male or Female",
    "chiefComplaint": "<brief chief complaint>",
    "height": "<height in feet and inches e.g. 5'9\">",
    "heightInches": <total height in inches as integer e.g. 69>
  },
  "hpi": "<2-3 sentences. HARD MAXIMUM 60 WORDS — count every word and cut if over. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN: associated symptoms, review of systems positives, family history, social history details, exam findings, and ANY detail that narrows the differential to a single diagnosis (e.g. heat intolerance, exophthalmos, tremor, toxin/substance names, radiation, aggravating/relieving factors). Everything forbidden here belongs in hiddenHistory.fullHistory.>",
  "clinicalHpi": "<2-3 sentences. HARD MAXIMUM 40 WORDS — count every word and cut if over. State ONLY: age, sex, primary symptom(s), and duration. STRICTLY FORBIDDEN: toxin or substance names, ingestion or exposure details, witness accounts, progression timeline, pertinent positives/negatives, characterization, radiation, aggravating/relieving factors, physical findings on arrival, and comorbidity adjectives (diabetic, hypertensive, obese, asthmatic, cirrhotic, hypothyroid, alcoholic) or chronic disease names — those belong only in pastMedicalHistory.conditions. CORRECT EXAMPLE (32 words): A 34-year-old male presents to the emergency department with a 6-hour history of tinnitus, nausea, vomiting, and confusion. His girlfriend reports he has been increasingly agitated since this afternoon.>",
  "advancedHpi": "<1 sentence. HARD MAXIMUM 20 WORDS. State age, sex, and ONE vague non-specific complaint (+ optional duration). STRICTLY FORBIDDEN: contextual hooks, recent events, exposures, travel, dental or surgical history, medication names, lab/vital values, family/social context, comorbidity adjectives (diabetic, hypertensive, obese, asthmatic, cirrhotic, hypothyroid, alcoholic), or chronic disease names — every such detail belongs in hiddenHistory.fullHistory. ALWAYS write 'X-year-old', NEVER 'Xyo'. CORRECT EXAMPLE: '52-year-old male with three weeks of fatigue.'>",
  "vitals": {
    "bp": "<systolic/diastolic mmHg>",
    "hr": <beats per minute>,
    "rr": <breaths per minute>,
    "temp": <Fahrenheit decimal>,
    "spo2": <percent integer>,
    "weight": "<lbs>"
  },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", ...GENERATE EXACTLY ${diffCount} DIFFERENTIALS — no more, no fewer],
  "differentialExplanations": ["<dx 1>: <why it belongs on the differential and the one finding that distinguishes it from the correct diagnosis>", ...one entry per differential matching the differentials array length],
  "expectedLabs": ["<exact lab name copied character-for-character from availableLabs that a competent physician MUST order>", ...3-7 key labs in clinical priority order],
  "expectedImaging": ["<exact imaging study name copied from availableImaging that should be ordered>", ...0-3 key studies — use empty array [] if imaging is not standard for this diagnosis],
  "keyQuestions": [
    "<directed question that elicits a pivotal hiddenHistory item — see KEY QUESTIONS COVERAGE RULE>",
    "<directed question that elicits a pivotal hiddenHistory item>",
    "<directed question>",
    "<directed question>",
    "<directed question>"
  ],
  "teachingPoints": ["<clinical pearl 1 — diagnosis or pathophysiology>", "<clinical pearl 2>", "<clinical pearl 3>", "<management pearl — concrete first-line agent, dose, threshold, target, or guideline rule. See MANAGEMENT TEACHING POINT RULE>"],
  "reviewOfSystems": {
    "Constitutional":          "<explicit findings — state positives first, then denials. e.g. 'Fatigue present. Denies fever, chills, night sweats, weight loss.'>",
    "HEENT":                   "<explicit findings — state positives first, then denials>",
    "Cardiovascular":          "<explicit findings — state positives first, then denials>",
    "Respiratory":             "<explicit findings — state positives first, then denials>",
    "Gastrointestinal":        "<explicit findings — state positives first, then denials>",
    "Genitourinary":           "<explicit findings — state positives first, then denials>",
    "Musculoskeletal":         "<explicit findings — state positives first, then denials>",
    "Neurological":            "<explicit findings — state positives first, then denials>",
    "Psychiatric":             "<explicit findings — state positives first, then denials>",
    "Integumentary":           "<explicit findings — state positives first, then denials>",
    "Endocrine":               "<explicit findings — state positives first, then denials>",
    "Hematologic/Lymphatic":   "<explicit findings — state positives first, then denials>",
    "Allergic/Immunologic":    "<explicit findings — state positives first, then denials>"
  },
  "physicalExam": {
    "General": "<appearance and demeanor>",
    "HEENT": "<findings>",
    "Neck": "<findings>",
    "Cardiovascular": "<auscultation, pulses, JVD, edema>",
    "Pulmonary": "<auscultation, percussion, work of breathing>",
    "Abdomen": "<inspection, auscultation, palpation, organomegaly>",
    "Extremities": "<findings>",
    "Neurological": "<findings>",
    "Skin": "<findings>"
  },
  "availableLabs": ["<lab name>", "<lab name>", ...include 10-14 relevant and distractor labs],
  "availableImaging": ["<study name>", ...include 3-5 relevant and distractor studies],
  CARDIAC TEST RULE: When the case involves cardiovascular pathology, chest pain, dyspnea, or syncope — always include "Electrocardiogram (ECG/EKG)" in availableImaging (NEVER in availableLabs) with a narrative ECG report in imagingResults describing rhythm, rate, PR/QRS/QTc intervals, axis, and any ST or T-wave changes. Also include "Troponin I or T (high sensitivity)" and "BNP / NT-proBNP" in availableLabs with numeric values in labResults.
  "labGroups": [
    { "name": "<panel name e.g. Complete Blood Count (CBC)>", "tests": ["<exact lab name from availableLabs>", ...] },
    ...group every lab from availableLabs into a named panel; standalone tests get their own single-item group
  ],
  "labResults": {
    "<panel name from availableLabs e.g. Complete Blood Count (CBC)>": {
      "components": [
        { "name": "<analyte e.g. WBC>", "value": "<numeric value e.g. 7.2>", "unit": "<unit e.g. x10³/µL>", "referenceRange": "<range e.g. 4.5-11.0>", "status": "<normal|abnormal|critical>" },
        { "name": "<analyte e.g. Hemoglobin>", "value": "...", "unit": "...", "referenceRange": "...", "status": "..." }
      ]
    }
  },
  "imagingResults": {
    "<each imaging study from availableImaging e.g. Chest X-Ray, CT Chest, MRI Brain>": "<radiology-style report impression, 2-3 sentences>"
  },
  "procedureResults": {
    "<procedure name exactly as listed in availableImaging e.g. Upper Endoscopy (EGD), Colonoscopy, Bronchoscopy, Lumbar Puncture>": "<narrative procedure report describing visualized findings, 2-4 sentences — include what was seen, any specimens taken, and immediate impression>"
  },
  PROCEDURE RULE: For any diagnostic procedure in availableImaging (endoscopy, colonoscopy, bronchoscopy, lumbar puncture, paracentesis, thoracentesis, arthrocentesis), generate a narrative result in procedureResults using the EXACT same procedure name as the key, copied character-for-character from availableImaging. Only include procedures clinically relevant to the diagnosis. Imaging studies (X-ray, CT, MRI, ultrasound, echo) go in imagingResults, NOT procedureResults.
  "hiddenHistory": {
    "fullHistory": "${
      resolvedDifficulty === 'Foundations'
        ? 'N/A'
        : resolvedDifficulty === 'Clinical'
        ? '<Full detailed clinical history withheld from HPI: all associated symptoms, true onset, duration, character, radiation, aggravating/relieving factors, pertinent positives, pertinent negatives. Reveal only when the physician asks directly about each specific finding.>'
        : '<Complete clinical history withheld from the vague HPI: all associated symptoms including the most pathognomonic finding, B-symptoms if present, any symptom that significantly narrows the differential. Gate the most diagnostic finding — only reveal it if the physician asks about it specifically by name or direct description.>'
    }",
    "socialHistory": "<smoking pack-years, alcohol drinks/week, recreational drugs, occupation, living situation, recent travel>",
    "familyHistory": "<relevant family history with relationships and conditions>",
    "medications": "<current medications with doses and frequencies>",
    "hiddenSymptoms": "<1-2 symptoms patient hasn't mentioned but will confirm if asked directly>",
    "allergies": "<drug allergies with reaction type, or NKDA>"
  },
  "imagingCategory": "<1-3 word radiological descriptor of the key imaging finding expected in this case, using radiology terminology — e.g. 'bilateral pleural effusion', 'pneumothorax', 'pulmonary consolidation', 'sigmoid mass', 'renal cortical thinning'. This should reflect what an imaging study would show, not the diagnosis name.>",
  "ecgFindings": "<1-2 sentence description of what the ECG shows in this case, using standard ECG terminology. Examples: 'Sinus tachycardia at 108 bpm. No ST changes or arrhythmia.' | 'Atrial fibrillation with rapid ventricular response at 130 bpm. No ST changes.' | 'Normal sinus rhythm with ST elevation in leads V2-V5 consistent with anterior STEMI. Reciprocal ST depression in inferior leads.' | 'Sinus bradycardia at 48 bpm. First-degree AV block with PR interval 220ms.' This field drives ECG image selection and display.>",
  "hematologyFindings": "<If peripheral blood smear is clinically relevant, describe objectively what is seen — e.g. 'Microcytic hypochromic red cells with anisopoikilocytosis, target cells, and central pallor exceeding 50% of cell diameter.' or 'Ring-form intraerythrocytic inclusions present; multiple infected cells visible per field.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "urineFindings": "<If urinalysis or urine microscopy is clinically relevant, describe objectively what is seen — e.g. 'Pyuria with bacteria visible on microscopy; positive leukocyte esterase and nitrites.' or 'RBC casts and dysmorphic red cells present on microscopy.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "skinFindings": "<If a skin lesion or biopsy is relevant, describe objectively what is observed — e.g. 'Irregular border, asymmetric pigment distribution, multiple shades of brown and black, regression areas on dermoscopy.' or 'Pearly, translucent papule with rolled border and central ulceration; superficial telangiectasias on dermoscopy.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "fundusFindings": "<If ophthalmoscopy or fundoscopy is relevant, describe objectively what is seen — e.g. 'Bilateral flame hemorrhages, cotton-wool spots, disc swelling, and AV nicking on dilated funduscopy.' or 'Increased cup-to-disc ratio >0.7 with superior rim thinning and temporal pallor.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "biopsyFindings": "<If histopathology (H&E biopsy) is relevant, describe objectively what the pathology shows — e.g. 'Dysplastic glandular epithelium with nuclear pleomorphism, increased mitotic figures, and cribriform architecture.' or 'Bridging fibrosis with nodular regeneration and hepatocyte ballooning on H&E.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "pastMedicalHistory": {
    "conditions": "<chronic diagnoses ONLY. If none, write exactly 'None.' and nothing else. NEVER negate a disease category ('No prior X disease', 'Denies X'). NEVER include medications — those go in currentMedications. See PMH LEAK RULE>",
    "surgeries": "<prior surgeries ONLY. If none, write exactly 'None.' and nothing else. NEVER negate a procedure category. See PMH LEAK RULE>",
    "hospitalizations": "<prior inpatient stays ONLY. If none, write exactly 'None.' and nothing else. NEVER write 'No prior hospitalizations for X'. See PMH LEAK RULE>"
  },
  "currentMedications": {
    "medications": "<prescription medications with doses and frequencies, or 'None'>",
    "otc": "<OTC drugs, vitamins, and supplements, or 'None'>"
  },
  "socialHistory": {
    "smoking": "<tobacco or vaping use with pack-years if applicable, or 'Never smoker'>",
    "alcohol": "<alcohol use in drinks per week, or 'Denies'>",
    "drugs": "<recreational drug use, or 'Denies'>",
    "occupation": "<current job and work environment>",
    "living": "<living situation, family members, marital status>",
    "other": "<relevant travel, exercise habits, diet, chemical exposures>"
  },
  "relevantTests": [
    RELEVANT TESTS RULE: Generate 5-10 tests that are specifically relevant to THIS case's primary diagnosis AND each significant comorbidity. Include both the gold-standard confirmatory test and 1-2 meaningful alternatives. These supplement the standard availableLabs/availableImaging — focus on specialty tests a student might miss (e.g. vWF Antigen + Ristocetin Cofactor + Factor VIII Activity for von Willebrand disease, or X-Ray Knee + MRI Knee for a musculoskeletal knee case, or ESR + CRP + RF + Anti-CCP for a rheumatoid arthritis case). Provide realistic result values appropriate to the diagnosis.
    {
      "name": "<exact test name as it would appear on an order — e.g. 'vWF Antigen', 'X-Ray Knee (AP/Lateral)', 'Factor VIII Activity'>",
      "category": "<one of: Hematology | Metabolic & Chemistry | Urinalysis & Renal | Coagulation | Immunology & Serology | Infectious Disease | Cardiac | Arterial Blood Gas & Respiratory | Toxicology & Drug Levels | Imaging | Procedures & Special Tests>",
      "isImaging": <true for X-ray, CT, MRI, US, nuclear study, ECG, endoscopy; false for all lab tests>,
      "labResult": {
        "components": [
          { "name": "<analyte name>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }
        ]
      },
      "imagingResult": "<radiology or procedure narrative — omit if isImaging is false>"
    }
  ]
}`

    try {
      // Check Supabase cache first — instant if this case slot was already generated
      if (caseId) {
        try {
          const t0 = performance.now()
          const lookupRes = await fetch(`/api/cases/lookup?id=${encodeURIComponent(caseId)}`, { signal: AbortSignal.timeout(10_000) })
          if (lookupRes.ok) {
            const { status, caseData: cached, imagingCache: prefetched } = await lookupRes.json()
            console.log(`[gen] lookup id=${caseId} status=${status} in ${Math.round(performance.now() - t0)}ms`)
            if (status === 'hit' && cached) {
              if (cached.patientInfo?.name) recordUsedName(cached.patientInfo.name)
              setCaseData(jitterCase(cached))
              // Pre-populate imagingCache from DB — avoids live Open-i fetch on Results tab
              if (prefetched && typeof prefetched === 'object') {
                const seed: Record<string, OpenIResult[] | null> = {}
                for (const [k, v] of Object.entries(prefetched)) {
                  if (Array.isArray(v)) seed[k] = v as OpenIResult[]
                }
                if (Object.keys(seed).length > 0) setImagingCache(seed)
              }
              setCaseStarted(resolvedDifficulty === 'Foundations')
              setGenerating(false)
              return cached
            }
          }
        } catch (e) {
          const name = (e as { name?: string } | null)?.name
          if (name === 'TimeoutError' || name === 'AbortError') console.warn('[gen] lookup fetch timed out — falling through to Claude')
          // Supabase unavailable — fall through to Claude
        }
      }

      // Cache miss — generate live with Claude
      console.log(`[gen] cache miss for id=${caseId} diagnosis="${diagnosis}" — falling through to live Claude`)
      const tClaude = performance.now()
      const text = await callClaude(claudeSystem, [{ role: 'user', content: prompt }], 12000,
        (u) => recordApiCall('generation', u))
      console.log(`[gen] Claude generated in ${Math.round(performance.now() - tClaude)}ms`)
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response')
      const rawParsed = JSON.parse(match[0]) as CaseData
      const parsed = sanitizePmhLeak(
        reconcileHistoryConsistency(rawParsed as unknown as Record<string, unknown>)
      ) as unknown as CaseData

      // Merge relevantTests results into labResults/imagingResults and the available lists
      // so that ordering them works the same as any other case-generated test.
      if (Array.isArray(parsed.relevantTests)) {
        for (const rt of parsed.relevantTests) {
          if (!rt.name) continue
          if (rt.isImaging && rt.imagingResult) {
            parsed.imagingResults[rt.name] = rt.imagingResult
            if (!parsed.availableImaging.includes(rt.name)) {
              parsed.availableImaging.push(rt.name)
            }
          } else if (!rt.isImaging && rt.labResult) {
            parsed.labResults[rt.name] = rt.labResult
            if (!parsed.availableLabs.includes(rt.name)) {
              parsed.availableLabs.push(rt.name)
            }
          }
        }
      }

      if (parsed.patientInfo?.name) recordUsedName(parsed.patientInfo.name)
      const view = jitterCase(parsed)
      setCaseData(view)
      setCaseStarted(resolvedDifficulty === 'Foundations')

      // Fire-and-forget save to Supabase so the next request for this slot is instant
      if (caseId && diagnosis) {
        fetch('/api/cases/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: caseId,
            system: resolvedSystem,
            difficulty: resolvedDifficulty,
            diagnosis,
            variantIndex: 0,
            caseData: parsed,
          }),
        }).catch(() => {})
      }

      return parsed
    } catch (e) {
      console.error('Case generation failed:', e)
      const msg = e instanceof Error ? e.message : String(e)
      setGenerationError(
        msg.includes('429')
          ? 'API rate limit reached. Wait a moment and try again.'
          : `Failed to generate case: ${msg}`
      )
      return null
    } finally {
      setGenerating(false)
    }
  }

  const toggleTest = (name: string) => {
    setSelectedTests(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const orderTests = () => {
    if (selectedTests.size === 0) return
    setOrderedTests(prev => {
      const next = new Set(prev)
      selectedTests.forEach(t => next.add(t))
      return next
    })
    setSelectedTests(new Set())
    setActiveSection('results')
  }

  const addOrderedTest = (name: string) => {
    setOrderedTests(prev => new Set([...prev, name]))
  }

  const orderCustomTest = () => {
    const name = customTestInput.trim()
    if (!name) return
    addOrderedTest(name)
    setCustomTestInput('')
    setActiveSection('results')
  }

  const removeOrderedTest = (name: string) => {
    setOrderedTests(prev => { const next = new Set(prev); next.delete(name); return next })
  }

  const sendChat = async (overrideMessage?: string): Promise<string | undefined> => {
    const msg = (overrideMessage !== undefined ? overrideMessage : chatInput).trim()
    if (!msg || !caseData || chatLoading) return
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    if (overrideMessage === undefined) setChatInput('')
    setChatLoading(true)

    const isGated = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'
    const fullHistorySection = isGated && caseData.hiddenHistory.fullHistory !== 'N/A'
      ? `\nYour complete history (only reveal specific details when the physician asks about that finding directly — do NOT volunteer these proactively):\n${caseData.hiddenHistory.fullHistory}`
      : ''

    const pmh = caseData.pastMedicalHistory
    const pmhLines = [
      pmh?.conditions      && `Conditions: ${pmh.conditions}`,
      pmh?.surgeries       && `Prior surgeries: ${pmh.surgeries}`,
      pmh?.hospitalizations && `Prior hospitalizations: ${pmh.hospitalizations}`,
    ].filter(Boolean)
    const pmhSection = pmhLines.length
      ? pmhLines.join('\n')
      : 'No significant past medical history.'

    const isExamGated =
      (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') &&
      (caseData.relevantExamRegions?.length ?? 0) > 0
    const examEntries = isExamGated
      ? Object.entries(caseData.physicalExam).filter(([region]) => revealedExamRegions.has(region))
      : Object.entries(caseData.physicalExam)
    const examSection = examEntries.map(([region, finding]) => `${region}: ${finding}`).join('\n')

    const behaviorRules = caseDifficulty === 'Advanced'
      ? `- You have NOT shared most of your symptoms — only mention what's in your presenting story above
- Answer ONLY the specific question asked; never add related details unprompted
- Occasionally be hesitant or uncertain: "I'm not sure", "maybe", "I think so" — as a real patient would
- Sometimes give a slightly incomplete or redirected answer, as patients do when they don't realise something is important
- Never volunteer information; wait to be asked directly`
      : caseDifficulty === 'Clinical'
      ? `- You have only told them your chief complaint so far — do not volunteer anything else
- Answer ONLY the specific question asked; do not add context, related symptoms, or background unprompted
- Respond conversationally, not clinically — use lay terms`
      : `- Be naturally forthcoming; you may mention a related detail if it feels organic`

    const system = `You are roleplaying as a patient named ${caseData.patientInfo.name}, a ${caseData.patientInfo.age}-year-old ${caseData.patientInfo.gender} who came to the clinic/ED with "${caseData.patientInfo.chiefComplaint}".

What you have told them so far: ${selectHpi(caseData, caseDifficulty)}${fullHistorySection}

Your known medical background (share when asked):
${pmhSection}

What the physical exam would reveal — you know what you FEEL (pain, tenderness, shortness of breath, weakness) but not objective measurements (liver size, percussion notes, exact findings). Respond based on this when asked about physical sensations:
${examSection}

Other information — only reveal if the physician asks directly about that specific topic:
- Social history: ${caseData.hiddenHistory.socialHistory}
- Family history: ${caseData.hiddenHistory.familyHistory}
- Current medications: ${caseData.hiddenHistory.medications}
- Allergies: ${caseData.hiddenHistory.allergies}
- Additional symptoms if asked: ${caseData.hiddenHistory.hiddenSymptoms}

Rules:
- Respond naturally as a patient, NOT as a medical expert
- Use lay terms; be slightly anxious or uncertain as a real patient would
- Keep answers concise (2-4 sentences)
- Stay in character at all times
- Answer only what the student directly asks you about. Do not volunteer symptoms or findings from body systems the student has not yet asked about. Never summarize your full symptom list unprompted.
- For physical exam questions (palpation, auscultation, etc.): report what you feel, not clinical terminology
${behaviorRules}`

    const history = [...chatMessages, { role: 'user' as const, content: msg }]

    try {
      const reply = await callClaude(system, history, 300, (u) => recordApiCall('chat', u))
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (analyticsSessionRef.current) analyticsSessionRef.current.questionCount++

      // ROS gating: scan the student's message for body systems
      // Only student messages are scanned — never patient replies.
      const unlockROSWithSummary = (categories: ROSCategory[]) => {
        const toUnlock = categories.filter(cat => rosState[cat]?.status === 'locked')
        if (!toUnlock.length) return

        // Immediately set status + pre-generated finding (for grading/reveal), derivedFinding undefined = loading
        setRosState(prev => {
          const next = { ...prev }
          for (const cat of toUnlock) {
            const finding = caseData.reviewOfSystems[cat] ?? 'No findings documented for this system.'
            next[cat] = { status: classifyFinding(finding), finding, derivedFinding: undefined }
          }
          return next
        })

        // Fire-and-forget: derive each summary from the actual conversation
        void Promise.all(toUnlock.map(async (cat) => {
          const summarySystem = `You are a clinical documentation assistant. Write a concise clinical sentence summarizing only what the patient actually reported about a specific body system, based on the interview excerpt provided.

Rules:
- Only include what the patient explicitly said or confirmed
- Do NOT include denials of things that were never asked about
- Do NOT add clinical language or findings not present in the conversation
- Do NOT infer or assume — only document what was stated
- If the patient only confirmed one symptom, document only that symptom
- Format: plain clinical prose, no quotes, no preamble
- Maximum 2 sentences`
          const summaryPrompt = `Body system: ${cat}
Interview excerpt:
Student: ${msg}
Patient: ${reply}

Summarize only what the patient reported about ${cat}.`
          try {
            const derived = await callClaude(summarySystem, [{ role: 'user', content: summaryPrompt }], 150,
              (u) => recordApiCall('ros_derived', u))
            setRosState(prev => ({ ...prev, [cat]: { ...prev[cat], derivedFinding: derived.trim() || `${cat}: finding recorded` } }))
          } catch {
            setRosState(prev => ({ ...prev, [cat]: { ...prev[cat], derivedFinding: `${cat}: Finding recorded — review after submission` } }))
          }
        }))
      }

      const keywordMatches = scanMessageForROS(msg)
      if (keywordMatches.length > 0) {
        unlockROSWithSummary(keywordMatches)
      } else if (looksClinical(msg)) {
        // AI fallback: classify via Claude when keywords don't match
        try {
          const classifierPrompt = `You are a clinical NLP classifier for a medical training app.
Given the following student message from a patient interview, identify which Review of Systems (ROS) categories were addressed. Return ONLY a JSON array of matched categories from this list:
["Constitutional","HEENT","Cardiovascular","Respiratory","Gastrointestinal","Genitourinary","Musculoskeletal","Neurological","Psychiatric","Integumentary","Endocrine","Hematologic/Lymphatic","Allergic/Immunologic"]
Rules:
- Only include a category if the student ASKED about it
- If no ROS category was addressed, return []
- Return raw JSON only, no explanation, no markdown
Student message: "${msg}"`
          const raw = await callClaude('You are a JSON-only ROS classifier.', [{ role: 'user', content: classifierPrompt }], 100,
            (u) => recordApiCall('ros_classifier', u))
          const aiMatches = JSON.parse(raw.trim()) as ROSCategory[]
          unlockROSWithSummary(aiMatches.filter(c => (ROS_CATEGORIES as readonly string[]).includes(c)))
        } catch {
          // classifier failure is non-fatal
        }
      }

      // HPI field gating: unlock individual background fields when student asks
      const hpiFieldMatches = scanMessageForHPIFields(msg)
      if (hpiFieldMatches.length > 0) {
        setHpiUnlocked(prev => {
          const next = { ...prev }
          for (const field of hpiFieldMatches) next[field] = true
          return next
        })
      }

      return reply
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I'm not feeling well enough to answer right now." }])
      return undefined
    } finally {
      setChatLoading(false)
      chatInputRef.current?.focus()
    }
  }

  const submitDiagnosis = async (overrideDiagnosis?: string, overridePresentation?: string, timedOut = false): Promise<GradingResult | null> => {
    setGradingError(null)
    const diagnosisToGrade = (overrideDiagnosis !== undefined ? overrideDiagnosis : userDiagnosis).trim()
    if (!diagnosisToGrade || !caseData || gradingLoading) return null
    if (overrideDiagnosis !== undefined) setUserDiagnosis(overrideDiagnosis)
    completeTimer()
    setGradingLoading(true)

    const allOrdered = Array.from(orderedTests)
    const orderedLabResults = allOrdered
      .flatMap(t => {
        const key = findResultKey(t, caseData.labResults)
        const r = key ? caseData.labResults[key] : null
        if (!r) return [`${t}: (no result available for this case)`]
        if (Array.isArray(r?.components) && r.components.length > 0) {
          return [`${t}:\n` + r.components.map(c => `  ${c.name}: ${c.value} ${c.unit} (ref: ${c.referenceRange}) [${c.status}]`).join('\n')]
        }
        const display = r?.value ? `${r.value} ${r.unit ?? ''}`.trim() : (r?.result ?? '')
        return [`${t}: ${display} (ref: ${r?.referenceRange ?? '—'}) [${r?.status ?? 'unknown'}]`]
      })
      .join('\n')
    const orderedImagingResults = allOrdered
      .flatMap(t => {
        const imgKey = findResultKey(t, caseData.imagingResults)
        if (imgKey) return [`${t}: ${caseData.imagingResults[imgKey]}`]
        const procKey = caseData.procedureResults ? findResultKey(t, caseData.procedureResults) : null
        return procKey ? [`${t}: ${caseData.procedureResults![procKey]}`] : []
      })
      .join('\n')
    const chatSummary = chatMessages
      .map(m => `${m.role === 'user' ? 'Physician' : 'Patient'}: ${m.content}`)
      .join('\n')

    // Build pre-presented info — these structured fields were visible in the HPI panel
    // from the start. The grader must not penalize the student for not eliciting them.
    const prePresentedParts: string[] = []
    if (caseData.pastMedicalHistory) {
      const pmh = caseData.pastMedicalHistory
      if (pmh.conditions) prePresentedParts.push(`Past Medical History: ${pmh.conditions}`)
      if (pmh.surgeries) prePresentedParts.push(`Surgeries: ${pmh.surgeries}`)
      if (pmh.hospitalizations) prePresentedParts.push(`Hospitalizations: ${pmh.hospitalizations}`)
    }
    if (caseData.currentMedications) {
      const meds = caseData.currentMedications
      if (meds.medications) prePresentedParts.push(`Medications: ${meds.medications}`)
      if (meds.otc) prePresentedParts.push(`OTC/Supplements: ${meds.otc}`)
    }
    if (caseData.socialHistory) {
      const soc = caseData.socialHistory
      const socParts = [
        soc.smoking && `Smoking: ${soc.smoking}`,
        soc.alcohol && `Alcohol: ${soc.alcohol}`,
        soc.drugs && `Drugs: ${soc.drugs}`,
        soc.occupation && `Occupation: ${soc.occupation}`,
        soc.living && `Living: ${soc.living}`,
        soc.other && `Other: ${soc.other}`,
      ].filter(Boolean)
      if (socParts.length) prePresentedParts.push(`Social History: ${socParts.join('; ')}`)
    }
    const prePresentedInfo = prePresentedParts.length ? prePresentedParts.join('\n') : undefined

    // Compile ALL available background history so the grader never flags referenced
    // fields as fabricated. Includes both the structured UI-visible fields and the
    // hiddenHistory block (what the patient could have revealed during interview).
    const backgroundParts: string[] = []
    if (caseData.pastMedicalHistory) {
      const pmh = caseData.pastMedicalHistory
      if (pmh.conditions) backgroundParts.push(`Past Medical History: ${pmh.conditions}`)
      if (pmh.surgeries) backgroundParts.push(`Surgeries: ${pmh.surgeries}`)
      if (pmh.hospitalizations) backgroundParts.push(`Hospitalizations: ${pmh.hospitalizations}`)
    }
    if (caseData.currentMedications) {
      const meds = caseData.currentMedications
      if (meds.medications) backgroundParts.push(`Current Medications: ${meds.medications}`)
      if (meds.otc) backgroundParts.push(`OTC/Supplements: ${meds.otc}`)
    }
    if (caseData.socialHistory) {
      const soc = caseData.socialHistory
      const socParts = [
        soc.smoking && `Smoking: ${soc.smoking}`,
        soc.alcohol && `Alcohol: ${soc.alcohol}`,
        soc.drugs && `Drugs: ${soc.drugs}`,
        soc.occupation && `Occupation: ${soc.occupation}`,
        soc.living && `Living: ${soc.living}`,
        soc.other && `Other: ${soc.other}`,
      ].filter(Boolean)
      if (socParts.length) backgroundParts.push(`Social History: ${socParts.join('; ')}`)
    }
    if (caseData.hiddenHistory.familyHistory) backgroundParts.push(`Family History: ${caseData.hiddenHistory.familyHistory}`)
    if (caseData.hiddenHistory.socialHistory && !caseData.socialHistory) backgroundParts.push(`Social History (hidden): ${caseData.hiddenHistory.socialHistory}`)
    if (caseData.hiddenHistory.medications && !caseData.currentMedications?.medications) backgroundParts.push(`Medications (hidden): ${caseData.hiddenHistory.medications}`)
    if (caseData.hiddenHistory.hiddenSymptoms) backgroundParts.push(`Additional Symptoms (available if asked): ${caseData.hiddenHistory.hiddenSymptoms}`)
    if (caseData.hiddenHistory.allergies) backgroundParts.push(`Allergies: ${caseData.hiddenHistory.allergies}`)
    if (caseData.hiddenHistory.fullHistory) backgroundParts.push(`Full Background History: ${caseData.hiddenHistory.fullHistory}`)

    // Fix 1a: Vitals — needed to validate student reasoning references and apply the
    // "do not penalise for questions whose answer was apparent from exam" rubric rule
    const v = caseData.vitals
    backgroundParts.push(`Vitals: BP ${v.bp}, HR ${v.hr}, RR ${v.rr}, Temp ${v.temp}°C, SpO2 ${v.spo2}%`)

    // Fix 1b: Physical exam — needed for the ANTI-FABRICATION RULE and the history
    // interview rubric rule ("do not penalise if info was apparent from physical exam")
    const examLines = Object.entries(caseData.physicalExam)
      .map(([region, finding]) => `${region}: ${finding}`)
      .join('\n')
    if (examLines) backgroundParts.push(`Physical Exam:\n${examLines}`)

    const backgroundHistory = backgroundParts.length ? backgroundParts.join('\n') : '(none recorded)'

    const reasoningText = (overridePresentation !== undefined ? overridePresentation : userPresentation).trim()

    // expectedLabs/expectedImaging = the case-designated MUST-ORDER acute workup (scored against).
    // supplementaryTests = relevantTests beyond that set (advanced/specialty follow-up —
    //   shown to grader as teaching context only, not penalized if missing).
    const expectedLabs    = caseData.expectedLabs?.length    ? caseData.expectedLabs    : undefined
    const expectedImaging = caseData.expectedImaging?.length ? caseData.expectedImaging : undefined
    const coreLabs = new Set([...(expectedLabs ?? []), ...(expectedImaging ?? [])])
    const supplementaryTests = caseData.relevantTests
      ?.filter(t => !coreLabs.has(t.name))
      .map(t => t.name)

    const gradingInput: GradingInput = {
      patientInfo: `${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"`,
      hpi: selectHpi(caseData, caseDifficulty),
      backgroundHistory,
      difficulty: caseDifficulty,
      orderedLabResults: orderedLabResults || '(no labs ordered)',
      orderedImagingResults: orderedImagingResults || '(no imaging ordered)',
      chatSummary: chatSummary || '(physician did not interview the patient)',
      reasoningText,
      submittedDiagnosis: diagnosisToGrade,
      correctDiagnosis: caseData.diagnosis,
      keyQuestions: caseData.keyQuestions,
      teachingPoints: caseData.teachingPoints,
      differentials: caseData.differentials,
      prePresentedInfo,
      timedOut,
      revealedExamRegions: Array.from(revealedExamRegions),
      relevantExamRegions: caseData.relevantExamRegions ?? [],
      ...(expectedLabs?.length        ? { expectedLabs }        : {}),
      ...(expectedImaging?.length     ? { expectedImaging }     : {}),
      ...(supplementaryTests?.length  ? { supplementaryTests }  : {}),
    }

    const gradingUsageCb: GradingUsageCallback = (type, usage) => recordApiCall(type, usage)

    try {
      const result = await gradeCase(gradingInput, gradingUsageCb)

      // Save to history
      try {
        const entry: CaseHistoryEntry = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          difficulty: caseDifficulty,
          system: caseData.patientInfo.chiefComplaint
            ? caseData.patientInfo.chiefComplaint.split(' ').slice(0, 3).join(' ')
            : 'Unknown',
          diagnosis: caseData.diagnosis,
          userDiagnosis: diagnosisToGrade,
          correct: result.correct ?? false,
          score: result.score ?? 0,
        }
        addHistoryEntry(entry)
      } catch {}

      // Finalize analytics session
      if (analyticsSessionRef.current) {
        const record = finalizeSession(analyticsSessionRef.current, {
          diagnosis: caseData.diagnosis,
          userDiagnosis: diagnosisToGrade,
          correct: result.correct ?? false,
          score: result.score ?? 0,
          gradingResult: result,
        })
        if (activeRedoOfRef.current) {
          record.parentSessionId = activeRedoOfRef.current
          activeRedoOfRef.current = null
        }
        syncSessionToSupabase(record)
        analyticsSessionRef.current = null
      }

      // Update mastery + extract spaced-repetition cards for the retention features
      try {
        recordCaseOutcome(
          caseData,
          resolvedSystemRef.current || system,
          caseDifficulty,
          result.score ?? 0,
          result.correct ?? false,
          Date.now(),
        )
      } catch {}

      // Mark first case done for free users
      const isFirstCase = gateStatus.tier === 'free' && !gateStatus.firstCaseDone
      if (isFirstCase) {
        setGateStatus(prev => ({ ...prev, firstCaseDone: true }))
        fetch('/api/gate/mark-first-case', { method: 'POST' }).catch(() => {})
      }

      // Strip result for free/anon users unless it's their first case
      const showFull = gateStatus.tier === 'pro' || isFirstCase
      setGradingResult(showFull ? result : stripToBasic(result))
      return result
    } catch {
      setGradingError('Grading failed. Please try again.')
      return null
    } finally {
      setGradingLoading(false)
    }
  }

  // Wire the expire callback so it can call submitDiagnosis (defined above).
  // Updated in an effect (not during render) so the ref always points at the latest closure.
  useEffect(() => {
    timerExpireRef.current = () => submitDiagnosis('Time expired', '', true)
  })

  const addTerminalLines = (...lines: TerminalLine[]) => {
    setTerminalLines(prev => [...prev, ...lines])
  }

  const processCommand = async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    addTerminalLines({ type: 'input', content: `> ${trimmed}` })

    const spaceIdx = trimmed.indexOf(' ')
    const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
    const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    switch (cmd) {
      case 'help':
        addTerminalLines(
          { type: 'info', content: 'Commands:' },
          { type: 'output', content: '  generate [system] [difficulty] — new case' },
          { type: 'output', content: '  status                        — current case info' },
          { type: 'output', content: '  hpi | vitals | ros | exam     — clinical data' },
          { type: 'output', content: '  labs | imaging                 — available tests' },
          { type: 'output', content: '  order <test>                   — order a test' },
          { type: 'output', content: '  results                        — ordered test results' },
          { type: 'output', content: '  ask <question>                 — interview patient' },
          { type: 'output', content: '  diagnose <diagnosis>           — submit diagnosis' },
          { type: 'output', content: '  clear                          — clear terminal' },
        )
        break

      case 'generate': {
        const words = args.split(/\s+/).filter(Boolean)
        const diffMatch = words.find(w => DIFFICULTIES.map(d => d.toLowerCase()).includes(w.toLowerCase()))
        const diff = diffMatch ? DIFFICULTIES.find(d => d.toLowerCase() === diffMatch.toLowerCase()) : undefined
        const sysWords = words.filter(w => w.toLowerCase() !== (diffMatch?.toLowerCase() ?? ''))
        const sysInput = sysWords.join(' ').toLowerCase()
        const sys = sysInput
          ? (SYSTEMS.find(s => s.toLowerCase().includes(sysInput)) ?? undefined)
          : undefined
        addTerminalLines({ type: 'info', content: `Generating ${sys ?? system} case (${diff ?? difficulty})…` })
        setTerminalLoading(true)
        const result = await generateCase(sys, diff)
        setTerminalLoading(false)
        if (result) {
          addTerminalLines({ type: 'success', content: `Case ready: ${result.patientInfo.name}, ${result.patientInfo.age}yo ${result.patientInfo.gender} — "${result.patientInfo.chiefComplaint}"` })
        } else {
          addTerminalLines({ type: 'error', content: 'Case generation failed.' })
        }
        break
      }

      case 'status':
        if (!caseData) {
          addTerminalLines({ type: 'error', content: 'No case loaded. Run "generate" first.' })
        } else {
          addTerminalLines(
            { type: 'success', content: `${caseData.patientInfo.name} · ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}` },
            { type: 'output', content: `CC: ${caseData.patientInfo.chiefComplaint}` },
            { type: 'output', content: `Tests ordered: ${orderedTests.size}  |  Chat messages: ${chatMessages.length}` },
            { type: 'output', content: gradingResult ? `Score: ${gradingResult.score}/100 (${gradingResult.correct ? 'Correct' : 'Incorrect'})` : 'Diagnosis: not yet submitted' },
          )
        }
        break

      case 'hpi':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else addTerminalLines(
          { type: 'info', content: 'HISTORY OF PRESENT ILLNESS' },
          { type: 'output', content: selectHpi(caseData, caseDifficulty) },
        )
        break

      case 'vitals':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else {
          const v = caseData.vitals
          addTerminalLines(
            { type: 'info', content: 'VITAL SIGNS' },
            { type: 'output', content: `BP ${v.bp}  HR ${v.hr}  RR ${v.rr}  Temp ${v.temp}°F  SpO₂ ${v.spo2}%  Wt ${v.weight}` },
          )
        }
        break

      case 'ros':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else {
          addTerminalLines({ type: 'info', content: 'REVIEW OF SYSTEMS' })
          Object.entries(caseData.reviewOfSystems).forEach(([s, val]) =>
            addTerminalLines({ type: 'output', content: `  ${s.padEnd(18)} ${val}` })
          )
        }
        break

      case 'exam':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else if (
          (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') &&
          (caseData.relevantExamRegions?.length ?? 0) > 0
        ) {
          addTerminalLines({ type: 'info', content: 'PHYSICAL EXAMINATION (revealed regions only)' })
          const revealed = Array.from(revealedExamRegions)
          if (revealed.length === 0) {
            addTerminalLines({ type: 'info', content: '  No regions examined yet. Use the Exam tab to examine regions.' })
          } else {
            revealed.forEach(area => {
              const val = caseData.physicalExam[area] ?? ''
              addTerminalLines({ type: 'output', content: `  ${area.padEnd(18)} ${val}` })
            })
          }
          const unrevealed = Object.keys(caseData.physicalExam).filter(r => !revealedExamRegions.has(r))
          if (unrevealed.length > 0)
            addTerminalLines({ type: 'info', content: `  Not yet examined: ${unrevealed.join(', ')}` })
        } else {
          addTerminalLines({ type: 'info', content: 'PHYSICAL EXAMINATION' })
          Object.entries(caseData.physicalExam).forEach(([area, val]) =>
            addTerminalLines({ type: 'output', content: `  ${area.padEnd(18)} ${val}` })
          )
        }
        break

      case 'labs':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else {
          addTerminalLines({ type: 'info', content: 'AVAILABLE LABORATORY TESTS' })
          caseData.availableLabs.forEach(lab =>
            addTerminalLines({ type: 'output', content: `  [${orderedTests.has(lab) ? 'ordered' : 'pending'}] ${lab}` })
          )
        }
        break

      case 'imaging':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else {
          addTerminalLines({ type: 'info', content: 'AVAILABLE IMAGING STUDIES' })
          caseData.availableImaging.forEach(img =>
            addTerminalLines({ type: 'output', content: `  [${orderedTests.has(img) ? 'ordered' : 'pending'}] ${img}` })
          )
        }
        break

      case 'order': {
        if (!caseData) { addTerminalLines({ type: 'error', content: 'No case loaded.' }); break }
        if (!args) { addTerminalLines({ type: 'error', content: 'Usage: order <test name>' }); break }
        const allTests = [...caseData.availableLabs, ...caseData.availableImaging]
        const match = allTests.find(t => t.toLowerCase().includes(args.toLowerCase()))
        if (!match) {
          addTerminalLines({ type: 'error', content: `Not found: "${args}". Use "labs" or "imaging" to list tests.` })
        } else if (orderedTests.has(match)) {
          addTerminalLines({ type: 'error', content: `Already ordered: ${match}` })
        } else {
          setOrderedTests(prev => { const n = new Set(prev); n.add(match); return n })
          addTerminalLines({ type: 'success', content: `Ordered: ${match}` })
        }
        break
      }

      case 'results': {
        if (!caseData) { addTerminalLines({ type: 'error', content: 'No case loaded.' }); break }
        if (orderedTests.size === 0) { addTerminalLines({ type: 'error', content: 'No tests ordered. Use "order <test>" first.' }); break }
        addTerminalLines({ type: 'info', content: 'TEST RESULTS' })
        Array.from(orderedTests).forEach(t => {
          const labKey = findResultKey(t, caseData.labResults)
          const imgKey = findResultKey(t, caseData.imagingResults)
          const procKey = caseData.procedureResults ? findResultKey(t, caseData.procedureResults) : null
          if (labKey) {
            const r = caseData.labResults[labKey]
            const flag = r.status === 'critical' ? ' [CRITICAL]' : r.status === 'abnormal' ? ' [ABN]' : ''
            addTerminalLines({ type: r.status === 'normal' ? 'output' : 'error', content: `  ${t}: ${r.result ?? r.value} (${r.referenceRange ?? '—'})${flag}` })
          } else if (imgKey) {
            addTerminalLines({ type: 'output', content: `  ${t}: ${caseData.imagingResults[imgKey]}` })
          } else if (procKey) {
            addTerminalLines({ type: 'output', content: `  ${t}: ${caseData.procedureResults![procKey]}` })
          }
        })
        break
      }

      case 'ask': {
        if (!caseData) { addTerminalLines({ type: 'error', content: 'No case loaded.' }); break }
        if (!args) { addTerminalLines({ type: 'error', content: 'Usage: ask <question>' }); break }
        setTerminalLoading(true)
        const reply = await sendChat(args)
        setTerminalLoading(false)
        if (reply) addTerminalLines({ type: 'success', content: `Patient: ${reply}` })
        break
      }

      case 'diagnose': {
        if (!caseData) { addTerminalLines({ type: 'error', content: 'No case loaded.' }); break }
        if (!args) { addTerminalLines({ type: 'error', content: 'Usage: diagnose <your diagnosis>' }); break }
        addTerminalLines({ type: 'info', content: `Grading: "${args}"…` })
        setTerminalLoading(true)
        const result = await submitDiagnosis(args)
        setTerminalLoading(false)
        if (result) {
          addTerminalLines(
            { type: result.correct ? 'success' : 'error', content: `Score: ${result.score}/100 — ${result.correct ? 'CORRECT' : 'INCORRECT'}` },
            { type: 'output', content: result.feedback },
          )
        }
        break
      }

      case 'clear':
        setTerminalLines([{ type: 'info', content: 'MedTrainer Terminal — type "help" for commands' }])
        break

      default:
        addTerminalLines({ type: 'error', content: `Unknown command: "${cmd}". Type "help" for available commands.` })
    }
  }

  const renderMain = () => {
    if (!caseData) return null

    switch (activeSection) {
      case 'hpi':
        return <HPIView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
          hpiUnlocked={hpiUnlocked}
          caseStarted={caseStarted}
          startTimer={startTimer}
          setCaseStarted={setCaseStarted}
          chatInputRef={chatInputRef}
        />
      case 'ros':
        return <ROSView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
          rosState={rosState}
          gradingResult={gradingResult}
        />
      case 'exam':
        return <ExamView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
          revealedExamRegions={revealedExamRegions}
          revealExamRegion={(r) => setRevealedExamRegions(prev => { const next = new Set(prev); next.add(r); return next })}
        />
      case 'order':
        return <OrderView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
          orderedTests={orderedTests}
          selectedTests={selectedTests}
          toggleTest={toggleTest}
          orderTests={orderTests}
          addOrderedTest={addOrderedTest}
          orderCustomTest={orderCustomTest}
          removeOrderedTest={removeOrderedTest}
          openCategories={openCategories}
          setOpenCategories={setOpenCategories}
          testSearchQuery={testSearchQuery}
          setTestSearchQuery={setTestSearchQuery}
          showSearchDropdown={showSearchDropdown}
          setShowSearchDropdown={setShowSearchDropdown}
          customTestInput={customTestInput}
          setCustomTestInput={setCustomTestInput}
          locked={locked}
        />
      case 'results':
        return <ResultsView
          caseData={caseData}
          orderedTests={orderedTests}
          imagingCache={imagingCache}
          ecgCache={ecgCache}
          smearCache={smearCache}
          biopsyImgCache={biopsyImgCache}
          fundusCache={fundusCache}
          dermCache={dermCache}
          urineImgCache={urineImgCache}
          collapsedPanels={collapsedPanels}
          setCollapsedPanels={setCollapsedPanels}
          generatingOnDemand={generatingOnDemand}
          failedOnDemand={failedOnDemand}
          setFailedOnDemand={setFailedOnDemand}
          gradingResult={gradingResult}
          setZoomedImage={setZoomedImage}
          setActiveSection={setActiveSection}
          setOrderedTests={setOrderedTests}
          onRetryFailed={(t) => {
            setFailedOnDemand(prev => { const n = new Set(prev); n.delete(t); return n })
            onDemandQueuedRef.current.delete(t)
            setOrderedTests(prev => new Set(prev))
          }}
        />
      case 'diagnosis':
        return <DiagnosisView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
          resolvedSystem={resolvedSystemRef.current}
          gradingLoading={gradingLoading}
          gradingError={gradingError}
          gradingResult={gradingResult}
          userDiagnosis={userDiagnosis}
          setUserDiagnosis={setUserDiagnosis}
          userPresentation={userPresentation}
          setUserPresentation={setUserPresentation}
          timerState={timerState}
          locked={locked}
          expandedCategory={expandedCategory}
          setExpandedCategory={setExpandedCategory}
          feedbackRatings={feedbackRatings}
          setFeedbackRatings={setFeedbackRatings}
          feedbackHover={feedbackHover}
          setFeedbackHover={setFeedbackHover}
          feedbackText={feedbackText}
          setFeedbackText={setFeedbackText}
          feedbackSubmitted={feedbackSubmitted}
          setFeedbackSubmitted={setFeedbackSubmitted}
          feedbackSubmitting={feedbackSubmitting}
          setFeedbackSubmitting={setFeedbackSubmitting}
          notes={notes}
          setNotes={setNotes}
          submitDiagnosis={submitDiagnosis}
          generateCase={generateCase}
          orderedTests={orderedTests}
        />
      default:
        return null
    }
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-surface-0 text-ink-primary">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-surface-4 bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2 mr-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-white text-sm font-bold">Rx</div>
          <span className="font-serif text-[15px] font-semibold text-ink-primary whitespace-nowrap">MedTrainer</span>
        </div>
        {gateStatus.tier !== 'anonymous' && (<>
          <select
            value={system}
            onChange={e => setSystem(e.target.value)}
            disabled={gateStatus.tier !== 'pro'}
            title={gateStatus.tier !== 'pro' ? 'Upgrade to Pro to choose a specific system' : undefined}
            className="rounded-md border border-surface-4 bg-surface-2 px-3 py-1.5 text-[11px] text-ink-secondary focus:border-primary-400 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {SYSTEMS.map(s => <option key={s}>{s}</option>)}
          </select>
          <div className="relative group">
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              disabled={gateStatus.tier !== 'pro'}
              title={gateStatus.tier !== 'pro' ? 'Upgrade to Pro to access Clinical and Advanced difficulties' : undefined}
              className="rounded-md border border-surface-4 bg-surface-2 px-3 py-1.5 text-[11px] text-ink-secondary focus:border-primary-400 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
            </select>
            <div className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block w-80 rounded-md border border-surface-4 bg-surface-2 px-4 py-3 shadow-xl pointer-events-none">
              {DIFFICULTIES.map(d => (
                <div key={d} className={`py-1 text-[11px] leading-snug ${d === difficulty ? 'text-primary-300' : 'text-ink-tertiary'}`}>
                  {DIFFICULTY_INFO[d]}
                </div>
              ))}
            </div>
          </div>
        </>)}
        <button
          onClick={() => {
            if (notes.content.trim() && notes.content !== SOAP_TEMPLATE) {
              setPendingGenerateWithNotes(true)
            } else {
              generateCase()
            }
          }}
          disabled={generating}
          title={caseData && !gradingResult ? 'A case is in progress — generating a new case will replace it' : undefined}
          className="rounded-md bg-primary-500 px-4 py-1.5 text-[11px] font-semibold text-ink-inverse hover:bg-primary-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-900/20"
        >
          {generating ? 'Generating...' : 'Generate Case'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {gateStatus.loaded && gateStatus.tier === 'anonymous' && (() => {
            const idx = activeCaseId ? ANON_CASE_IDS.indexOf(activeCaseId as typeof ANON_CASE_IDS[number]) : -1
            const label = idx >= 0 ? `Case ${idx + 1} of ${ANON_CASE_LIMIT}` : `${ANON_CASE_LIMIT} sample cases`
            return (
              <span className="text-[10px] text-ink-tertiary border border-surface-4 rounded px-2 py-1">
                Free preview: {label} —{' '}
                <a href="/auth/login" className="underline hover:text-ink-secondary">Sign up for full access</a>
              </span>
            )
          })()}
          {gateStatus.loaded && gateStatus.tier === 'free' && (
            <span className="text-[10px] text-ink-tertiary border border-surface-4 rounded px-2 py-1">
              {gateStatus.casesLeft} case{gateStatus.casesLeft !== 1 ? 's' : ''} left today
            </span>
          )}
          <Link href="/" className="rounded-md border border-surface-4 bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink-secondary hover:border-surface-5 hover:text-ink-primary transition-colors">Home</Link>
          {gateStatus.tier !== 'anonymous' && (
            <form action="/auth/logout" method="POST">
              <button type="submit" className="rounded-md border border-surface-4 bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink-secondary hover:border-surface-5 hover:text-ink-primary transition-colors">
                Sign Out
              </button>
            </form>
          )}
          {/* Timer display — Clinical/Advanced only */}
          {caseData && (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && !caseStarted && (
            <button
              onClick={() => { startTimer(caseDifficulty); setCaseStarted(true); setTimeout(() => chatInputRef.current?.focus(), 50) }}
              className="rounded-md border border-primary-300 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 transition-colors"
            >
              Start Timer
            </button>
          )}
          {caseData && (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && caseStarted && timerState.status !== 'idle' && timerState.status !== 'completed' && (
            <div className="flex items-center gap-1.5">
              {timerState.status === 'paused' ? (
                <span className="text-[11px] font-mono text-ink-tertiary tracking-widest">PAUSED</span>
              ) : (() => {
                const rem = timerState.remainingSeconds
                const isWarning  = rem <= 300 && rem > 120
                const isCritical = rem <= 120
                const cls = isCritical
                  ? 'text-critical animate-pulse'
                  : isWarning
                  ? 'text-caution animate-pulse'
                  : 'text-ink-secondary'
                return <span className={`text-[13px] font-mono tabular-nums ${cls}`}>{fmtTime(rem)}</span>
              })()}
              {timerState.status === 'paused' ? (
                <button
                  onClick={resumeTimer}
                  className="flex items-center gap-1 rounded-md border border-primary-300 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                >
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
                  Resume
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  title="Pause case"
                  className="rounded-md border border-surface-4 bg-surface-2 px-2 py-1 text-ink-tertiary hover:border-surface-5 hover:text-ink-primary transition-colors"
                >
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>
                </button>
              )}
            </div>
          )}
          {caseData && (
            <>
              <span className="text-[11px] text-ink-tertiary">{caseData.patientInfo.name}</span>
              <Badge text={`${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}`} color="blue" />
              <Badge text={system === 'Any' ? 'Random' : system} color="purple" />
            </>
          )}
          <button
            onClick={() => setShowTerminal(v => !v)}
            className={`ml-2 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
              showTerminal
                ? 'border-confirmed-border bg-confirmed-bg text-confirmed'
                : 'border-surface-4 bg-surface-2 text-ink-tertiary hover:border-surface-5 hover:text-ink-primary'
            }`}
          >
            {'> _'}
          </button>
        </div>
      </header>

      {/* Timed-out toast */}
      {timedOutToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-critical-border bg-critical-bg px-5 py-3 text-sm font-medium text-critical shadow-xl">
          Time&apos;s up — submitting your case…
        </div>
      )}

      {/* Pause overlay — covers body but not header */}
      {timerState.status === 'paused' && (
        <div className="absolute inset-0 top-[49px] z-40 flex items-center justify-center bg-surface-0/90 backdrop-blur-sm">
          <div className="rounded-xl border border-surface-4 bg-surface-1 px-10 py-8 text-center shadow-2xl">
            <div className="mb-2 text-3xl">⏸</div>
            <h2 className="mb-1 text-lg font-bold text-ink-primary">CASE PAUSED</h2>
            <p className="mb-1 text-sm text-ink-secondary">Your case has been paused.</p>
            <p className="mb-6 text-sm text-ink-tertiary">No time is running while paused.</p>
            <button
              onClick={resumeTimer}
              className="flex items-center gap-2 rounded-lg bg-primary-500 px-6 py-2.5 text-sm font-semibold text-ink-inverse hover:bg-primary-400 transition-colors mx-auto"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
              Resume Case
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left nav */}
          <nav className="flex w-52 flex-shrink-0 flex-col overflow-y-auto border-r border-surface-4 bg-surface-1 p-3">
            <div className="border-l-2 border-surface-4 ml-[7px]">
              {NAV.map(({ id, label, icon: Icon }) => {
                const isActive = activeSection === id
                const isDisabled = !caseData
                return (
                  <button
                    key={id}
                    onClick={() => !isDisabled && setActiveSection(id)}
                    disabled={isDisabled}
                    title={isDisabled ? 'Generate a case to enable this step' : label}
                    className={`flex w-full items-center gap-2.5 py-2.5 pl-3 pr-2 text-left text-[11px] transition-colors -ml-[2px] ${
                      isDisabled
                        ? 'cursor-not-allowed text-ink-tertiary/50'
                        : isActive
                        ? 'text-primary-300 font-semibold border-l-2 border-primary-400'
                        : 'text-ink-secondary hover:text-ink-primary border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary-400' : 'opacity-60'}`} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Center column */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Patient info header bar */}
            {caseData && (() => {
              const wLbs = parseFloat(caseData.vitals.weight)
              const hIn = caseData.patientInfo.heightInches
              const bmi = hIn && !isNaN(wLbs) && hIn > 0 ? Math.round((wLbs / (hIn * hIn)) * 703 * 10) / 10 : null
              const bmiLabel = bmi === null ? null : bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'
              const bmiColor = bmi === null ? '' : bmi < 18.5 ? 'text-primary-400' : bmi < 25 ? 'text-confirmed' : bmi < 30 ? 'text-caution' : 'text-critical'
              return (
                <div className="flex flex-shrink-0 items-center gap-3 border-b border-surface-4 bg-surface-1 px-4 py-2.5 overflow-x-auto">
                  <span className="text-[13px] font-semibold text-ink-primary whitespace-nowrap">{caseData.patientInfo.name}</span>
                  <span className="text-surface-5 select-none">·</span>
                  <span className="text-[12px] text-ink-secondary whitespace-nowrap">{caseData.patientInfo.age}yo {caseData.patientInfo.gender}</span>
                  {caseData.patientInfo.height && (
                    <>
                      <span className="text-surface-5 select-none">·</span>
                      <span className="text-[12px] text-ink-secondary whitespace-nowrap">{caseData.patientInfo.height}</span>
                    </>
                  )}
                  <span className="text-surface-5 select-none">·</span>
                  <span className="text-[12px] text-ink-secondary whitespace-nowrap">{caseData.vitals.weight}</span>
                  {bmi !== null && (
                    <>
                      <span className="text-surface-5 select-none">·</span>
                      <span className={`text-[12px] whitespace-nowrap ${bmiColor}`}>BMI {bmi} ({bmiLabel})</span>
                    </>
                  )}
                  <span className="ml-auto flex-shrink-0 rounded-full border border-surface-4 bg-surface-2 px-3 py-1 text-[11px] text-ink-secondary whitespace-nowrap">
                    {caseData.patientInfo.chiefComplaint}
                  </span>
                </div>
              )
            })()}
            {/* Vitals strip */}
            {caseData && (
              <div className="flex flex-shrink-0 items-center border-b border-surface-4 bg-surface-1 overflow-x-auto">
                {[
                  ['BP', caseData.vitals.bp, 'mmHg'],
                  ['HR', String(caseData.vitals.hr), 'bpm'],
                  ['RR', String(caseData.vitals.rr), '/min'],
                  ['SpO₂', String(caseData.vitals.spo2), '%'],
                  ['Temp', String(caseData.vitals.temp), '°F'],
                  ['Wt', caseData.vitals.weight, ''],
                ].map(([label, value, unit], i) => {
                  const { abnormal: isAbnormal, direction } = getVitalStatus(label, value)
                  return (
                    <div key={label} className={`flex items-center gap-2 px-4 py-2${isAbnormal ? ' bg-critical-bg' : ''}${i > 0 ? ' border-l border-surface-4' : ''}`}>
                      <span className="text-[11px] font-medium text-ink-tertiary uppercase tracking-tight whitespace-nowrap">{label}</span>
                      <span className={`text-[15px] font-semibold tabular-nums whitespace-nowrap ${isAbnormal ? 'text-critical' : 'text-ink-primary'}`}>
                        {value}
                        {isAbnormal && direction && (
                          <span className="ml-0.5 text-[12px]">{direction === 'high' ? '↑' : '↓'}</span>
                        )}
                      </span>
                      {unit && <span className="text-[11px] text-ink-tertiary whitespace-nowrap">{unit}</span>}
                    </div>
                  )
                })}
              </div>
            )}
            {/* Main content */}
            <main className="flex-1 overflow-y-auto py-6 pl-6 pr-4">
            {generating ? (
              <div className="flex h-full flex-col items-center justify-center gap-6">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-surface-4 border-t-primary-400" />
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-medium text-ink-primary">
                    Generating {caseDifficulty ? caseDifficulty.toLowerCase() + ' ' : ''}{system === 'Any' ? '' : system + ' '}case
                  </p>
                  <p className="text-[11px] text-primary-400 min-h-[1.2em]">{GENERATION_PHASES[generationPhase]}</p>
                  <p className="text-[11px] text-ink-tertiary">Typically takes about 15 seconds</p>
                </div>
                <div className="flex gap-1.5">
                  {GENERATION_PHASES.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        i <= generationPhase ? 'bg-primary-500 w-6' : 'bg-surface-4 w-3'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : generationError ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-critical-border bg-critical-bg">
                  <svg className="h-5 w-5 text-critical" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-primary mb-1">Case generation failed</p>
                  <p className="text-[11px] text-ink-secondary max-w-xs">{generationError}</p>
                </div>
                <button
                  onClick={() => generateCase()}
                  className="rounded-md bg-primary-500 px-5 py-2 text-sm font-semibold text-ink-inverse hover:bg-primary-400 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : !caseData ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <div className="h-20 w-20 rounded-full bg-surface-2 flex items-center justify-center text-4xl border border-surface-4">🏥</div>
                <div>
                  <h1 className="heading-display text-[26px]">Clinical <span className="heading-accent">reasoning</span> practice</h1>
                  <p className="mt-2 text-[13px] text-ink-secondary max-w-md">Select a system and difficulty, then generate a clinical case to begin your diagnostic journey.</p>
                </div>
                <button
                  onClick={() => generateCase()}
                  className="rounded-md bg-primary-500 px-8 py-3 text-[13px] font-semibold text-ink-inverse hover:bg-primary-400 transition-colors shadow-lg shadow-primary-900/20"
                >
                  Generate Your First Case
                </button>
              </div>
            ) : (
              <div className="relative">
                {hasHelpContent(activeSection) && (
                  <button
                    onClick={() => setHelpSection(activeSection)}
                    className="absolute -top-1 right-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-surface-4 bg-surface-2/80 text-xs font-semibold text-ink-tertiary hover:border-surface-5 hover:text-ink-primary transition-colors"
                    aria-label="Help"
                    title="How to use this section"
                  >
                    ?
                  </button>
                )}
                {/* renderMain reads resolvedSystemRef.current, set during async generation
                    alongside the setCaseData that drives this render — value is current. */}
                {/* eslint-disable-next-line react-hooks/refs */}
                {renderMain()}
              </div>
            )}
          </main>
          </div>

          {/* Right chat panel */}
          <div className="flex w-[420px] flex-shrink-0 flex-col border-l border-surface-4 bg-surface-1">
            {/* Panel header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-surface-4 px-4 py-2">
              <div>
                <h2 className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Patient Interview</h2>
                {caseData && <p className="text-[11px] text-ink-tertiary mt-0.5">{caseData.patientInfo.name}</p>}
              </div>
              <div className="flex items-center gap-2">
                {caseData && <div className="h-2 w-2 rounded-full bg-confirmed" title="Patient available" />}
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {!caseData && (
                <p className="text-[11px] text-ink-tertiary text-center pt-8">Generate a case to start interviewing the patient.</p>
              )}
              {caseData && chatMessages.length === 0 && (
                <div className="rounded-md bg-insight-bg border border-insight-border p-3">
                  <p className="text-[11px] text-insight leading-relaxed">
                    Ask the patient questions to gather additional history. Try asking about medications, family history, social history, or other symptoms.
                  </p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-2 text-ink-primary border border-surface-4'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-surface-2 border border-surface-4 px-3 py-2">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Notes */}
            <div className="flex flex-col border-t border-surface-4">
              <div className="flex items-center justify-between border-b border-surface-4 px-4 py-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">Case Notes</span>
                  {notes.mode === 'soap' && (
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-secondary border border-surface-4">SOAP</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {notes.mode === 'soap' ? (
                    <button
                      onClick={() => setNotes(prev => ({ ...prev, mode: 'free', content: prev.content === SOAP_TEMPLATE ? '' : prev.content }))}
                      className="text-[10px] text-ink-tertiary hover:text-ink-primary transition-colors"
                    >
                      Switch to free text
                    </button>
                  ) : (
                    <button
                      onClick={() => setNotes(prev => ({ ...prev, mode: 'soap', content: prev.content.trim() ? prev.content : SOAP_TEMPLATE }))}
                      className="text-[10px] text-ink-tertiary hover:text-ink-primary transition-colors"
                    >
                      SOAP template
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={notes.content}
                onChange={e => setNotes(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Your case notes…"
                className="resize-y min-h-[120px] w-full bg-surface-0 p-4 text-[11px] leading-relaxed text-ink-primary placeholder-ink-tertiary focus:outline-none font-mono"
                style={{ height: '180px' }}
              />
              <div className="border-t border-surface-4 px-4 py-2 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-tertiary">Notes are private — not graded</span>
                  <MicButton
                    onTranscript={text => setNotes(prev => ({ ...prev, content: prev.content ? prev.content + ' ' + text : text }))}
                    paused={timerState.status === 'paused' || gradingLoading}
                    className="py-1"
                  />
                </div>
                {notes.content.trim() && notes.content !== SOAP_TEMPLATE && (
                  <button
                    onClick={() => setNotes(prev => ({ ...prev, content: prev.mode === 'soap' ? SOAP_TEMPLATE : '' }))}
                    className="text-[10px] text-ink-tertiary hover:text-critical transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {/* Chat input */}
            <div className="border-t border-surface-4 p-3 flex-shrink-0">
              {showRosHint && (
                <div className="mb-2 flex items-start gap-2 rounded-md border border-insight-border bg-insight-bg px-3 py-2 text-[11px] text-insight animate-fade-in">
                  <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Ask the patient about their symptoms in the chat to populate this section.
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  disabled={!caseData || chatLoading || locked}
                  title={locked ? 'Start the timer to begin the clinical encounter' : undefined}
                  placeholder={locked ? 'Start the timer to begin the clinical encounter' : caseData ? 'Ask the patient...' : 'Generate a case first'}
                  className={`flex-1 rounded-md border px-3 py-2 text-[11px] text-ink-primary placeholder-ink-tertiary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-all ${showRosHint ? 'border-insight bg-insight-bg animate-pulse' : 'border-surface-4 bg-surface-2 focus:border-primary-400'}`}
                />
                {caseData && (
                  <MicButton
                    onTranscript={text => setChatInput(prev => prev ? prev + ' ' + text : text)}
                    paused={timerState.status === 'paused' || gradingLoading || locked}
                    className="py-2"
                  />
                )}
                <button
                  onClick={() => sendChat()}
                  disabled={!caseData || chatLoading || !chatInput.trim() || locked}
                  className="rounded-md bg-primary-500 px-3 py-2 text-[11px] font-medium text-ink-inverse hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Ask
                </button>
              </div>
              {caseData && (
                <p className="mt-1.5 text-[10px] text-ink-tertiary">
                  Patient won&apos;t volunteer hidden history — ask directly.
                </p>
              )}
            </div>
          </div>
      </div>

      {/* Command terminal panel */}
      {showTerminal && (
        <div className="flex h-56 flex-shrink-0 flex-col border-t border-confirmed-border bg-surface-0 font-mono">
          <div className="flex items-center justify-between border-b border-surface-4 px-3 py-1.5">
            <span className="text-xs text-confirmed font-semibold tracking-widest uppercase">Terminal</span>
            {terminalLoading && (
              <span className="text-xs text-caution animate-pulse">processing…</span>
            )}
            <button
              onClick={() => setShowTerminal(false)}
              className="text-ink-tertiary hover:text-ink-primary text-xs px-1 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 text-xs leading-relaxed">
            {terminalLines.map((line, i) => (
              <div
                key={i}
                className={
                  line.type === 'input'   ? 'text-ink-secondary' :
                  line.type === 'error'   ? 'text-critical' :
                  line.type === 'success' ? 'text-confirmed' :
                  line.type === 'info'    ? 'text-primary-500' :
                  'text-ink-primary'
                }
              >
                {line.content}
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-surface-4 px-3 py-2">
            <span className="text-confirmed text-xs select-none">{'>'}</span>
            <input
              ref={terminalInputRef}
              type="text"
              value={terminalInput}
              onChange={e => setTerminalInput(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && !terminalLoading) {
                  const val = terminalInput
                  setTerminalInput('')
                  await processCommand(val)
                  terminalInputRef.current?.focus()
                }
              }}
              disabled={terminalLoading}
              placeholder="type a command…"
              className="flex-1 bg-transparent text-xs text-ink-primary placeholder-ink-tertiary focus:outline-none disabled:opacity-50"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Gate-blocked modal */}
      {gateBlocked && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-surface-4 bg-surface-1 p-6 shadow-2xl text-center">
            <div className="text-3xl mb-3">&#x1F512;</div>
            {gateStatus.tier === 'anonymous' ? (
              <>
                <h3 className="text-base font-semibold text-ink-primary mb-2">You&apos;ve completed your 3 demo cases</h3>
                <p className="text-sm text-ink-secondary mb-5">Create a free account to unlock all systems, difficulty levels, and case history tracking.</p>
                <div className="flex gap-3">
                  <a href="/auth/login" className="flex-1 rounded-md bg-primary-500 py-2 text-sm font-semibold text-ink-inverse hover:bg-primary-400 transition-colors">Create Account</a>
                  <button onClick={() => setGateBlocked(false)} className="flex-1 rounded-md border border-surface-4 py-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors">Close</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-ink-primary mb-2">Daily limit reached</h3>
                <p className="text-sm text-ink-secondary mb-5">You&apos;ve used your 2 free cases for today. Upgrade to Pro for unlimited access.</p>
                <div className="flex gap-3">
                  <Link href="/" className="flex-1 rounded-md bg-primary-500 py-2 text-sm font-semibold text-ink-inverse hover:bg-primary-400 transition-colors">Upgrade to Pro</Link>
                  <button onClick={() => setGateBlocked(false)} className="flex-1 rounded-md border border-surface-4 py-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Image zoom modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-h-screen max-w-screen-xl p-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-2 -right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-secondary hover:bg-surface-3 hover:text-white transition-colors shadow-lg text-xl leading-none"
            >
              ×
            </button>
            <img
              src={zoomedImage.src}
              alt={zoomedImage.alt}
              className="max-h-[90vh] max-w-full rounded-lg object-contain bg-surface-2 shadow-2xl"
            />
            <p className="mt-2 text-center text-xs text-ink-tertiary">{zoomedImage.alt} — click outside to close</p>
          </div>
        </div>
      )}

      {/* Confirm: clear notes on new case */}
      {pendingGenerateWithNotes && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-caution-border bg-surface-1 p-6 shadow-2xl">
            <h3 className="mb-2 text-base font-semibold text-caution">Clear case notes?</h3>
            <p className="mb-5 text-sm text-ink-secondary">Generating a new case will permanently clear your current notes. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPendingGenerateWithNotes(false); generateCase() }}
                className="flex-1 rounded-md bg-caution px-4 py-2 text-sm font-semibold text-ink-inverse hover:opacity-90 transition-colors"
              >
                Clear & Generate
              </button>
              <button
                onClick={() => setPendingGenerateWithNotes(false)}
                className="flex-1 rounded-md border border-surface-4 px-4 py-2 text-sm text-ink-secondary hover:border-surface-5 hover:text-ink-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpSection && (
        <HelpModal section={helpSection} onClose={() => setHelpSection(null)} />
      )}

      {/* Case history modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div className="mx-4 w-full max-w-xl rounded-xl border border-surface-4 bg-surface-1 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface-4 px-5 py-4">
              <h3 className="text-base font-semibold text-ink-primary">Case History</h3>
              <button onClick={() => setShowHistory(false)} className="text-ink-tertiary hover:text-ink-secondary transition-colors text-xl leading-none">×</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {historyEntries.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-ink-tertiary">No cases completed yet. Generate a case to get started.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b border-surface-4 text-ink-tertiary uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Date</th>
                      <th className="px-4 py-2.5 text-left font-medium">Difficulty</th>
                      <th className="px-4 py-2.5 text-left font-medium">Score</th>
                      <th className="px-4 py-2.5 text-left font-medium">Result</th>
                      <th className="px-4 py-2.5 text-left font-medium">Correct Dx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEntries.map(entry => (
                      <tr key={entry.id} className="border-b border-surface-4/50 hover:bg-surface-2/30 transition-colors">
                        <td className="px-4 py-2.5 text-ink-tertiary">{new Date(entry.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5">
                          <span className={`font-medium ${entry.difficulty === 'Advanced' ? 'text-critical' : entry.difficulty === 'Clinical' ? 'text-caution' : 'text-confirmed'}`}>{entry.difficulty}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`font-bold tabular-nums ${entry.score >= 70 ? 'text-confirmed' : entry.score >= 50 ? 'text-caution' : 'text-critical'}`}>{entry.score}/100</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={entry.correct ? 'text-confirmed' : 'text-critical'}>{entry.correct ? '✓ Correct' : '✗ Incorrect'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-secondary max-w-[160px] truncate" title={entry.diagnosis}>{entry.diagnosis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {historyEntries.length > 0 && (() => {
              const avg = Math.round(historyEntries.reduce((s, entry) => s + entry.score, 0) / historyEntries.length)
              const correctCount = historyEntries.filter(entry => entry.correct).length
              return (
                <div className="border-t border-surface-4 px-5 py-3 flex gap-6 text-xs text-ink-tertiary">
                  <span>{historyEntries.length} cases</span>
                  <span>Avg score: <span className="text-ink-secondary font-medium">{avg}/100</span></span>
                  <span>Accuracy: <span className="text-ink-secondary font-medium">{Math.round((correctCount / historyEntries.length) * 100)}%</span></span>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}