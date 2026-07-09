'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Stethoscope, ListChecks, Hand, FlaskConical, Activity, ClipboardCheck } from 'lucide-react'
import {
  ROS_CATEGORIES,
  type ROSState,
  type HPIField,
  makeInitialROSState,
  classifyFinding,
} from '../lib/rosDetector'
import { type OpenIResult } from '../lib/imagingSearch'
import { type ECGImage } from '../lib/ecgImageLookup'
import {
  type SpecialImage, type SpecialModality,
  getSpecialModality,
} from '../lib/specialImageLookup'
import { ANON_CASE_IDS, ANON_CASE_LIMIT } from '../lib/anonymousCases'
import { type GradingResult, stripToBasic } from '../grading/types'
import { type DimensionKey } from '../grading/rubric'
import {
  type RawUsage, type APICallType, type ActiveSession,
  makeCallRecord, recordToSession, createActiveSession, finalizeSession, syncSessionToSupabase,
  recordAbandonedSession,
} from '../lib/analytics'
import { recordCaseOutcome, recordCalibration } from '../lib/reasoning/store'
import { computeBeliefs } from '../lib/reasoning/differential'
import { scorePrediction } from '../lib/reasoning/prediction'
import { type CaseData, type NotesState, selectHpi, SOAP_TEMPLATE } from './_lib/types'
import {
  type CasePresentation, type CaseReveal, type StartResponse, type AskResponse,
  type OrderResponse, type OrderedTestResult, type GradeResponse, type ResumeResponse,
  type UsageEntry,
} from './_lib/sessionTypes'
import { findResultKey, getVitalStatus, isECGTest } from './_lib/testUtils'
import { type CaseHistoryEntry, addHistoryEntry, hasUsedROSBefore, markROSUsed } from './_lib/localHistory'
import { useTimer, fmtTime } from './_lib/useTimer'
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

// Client-side view of the active server session. The server holds the full
// case (including the answer); the client only ever sees the presentation
// slice plus whatever it has earned through /api/session/* calls.
interface SessionMeta {
  examGated: boolean
  hasReasoningModel: boolean
  predictionCandidates: string[]
  caseSearchTests?: Array<{ name: string; category: string }>
}

const EMPTY_SESSION_META: SessionMeta = { examGated: false, hasReasoningModel: false, predictionCandidates: [] }

/** Build the client's working CaseData view from a server presentation slice. */
function presentationToClientCase(p: CasePresentation): CaseData {
  return {
    patientInfo: p.patientInfo,
    hpi: p.hpi,
    vitals: p.vitals,
    pastMedicalHistory: p.pastMedicalHistory,
    currentMedications: p.currentMedications,
    socialHistory: p.socialHistory,
    reviewOfSystems: p.reviewOfSystems ?? {},
    physicalExam: p.physicalExam ?? Object.fromEntries(p.examRegions.map(r => [r, ''])),
    availableLabs: p.availableLabs ?? [],
    availableImaging: p.availableImaging ?? [],
    labGroups: p.labGroups,
    labResults: {},
    imagingResults: {},
    procedureResults: {},
    hiddenHistory: { fullHistory: '', socialHistory: '', familyHistory: '', medications: '', hiddenSymptoms: '', allergies: '' },
    diagnosis: '',
    differentials: [],
    teachingPoints: [],
    keyQuestions: [],
    differentialPriors: p.differentialPriors,
    testImpacts: p.testImpacts,
  }
}

/** Merge one ordered-test result from the server into the client case view. */
function mergeOrderResult(prev: CaseData, r: OrderedTestResult): CaseData {
  const next = { ...prev }
  if (r.kind === 'lab' && r.labResult) {
    next.labResults = { ...next.labResults, [r.test]: r.labResult }
  } else if (r.kind === 'imaging' && r.report !== undefined) {
    next.imagingResults = { ...next.imagingResults, [r.test]: r.report }
    if (r.ecgFindings) next.ecgFindings = r.ecgFindings
  } else if (r.kind === 'procedure' && r.report !== undefined) {
    next.procedureResults = { ...(next.procedureResults ?? {}), [r.test]: r.report }
  }
  if (r.specialFindings && r.specialModality) {
    const field = ({
      smear: 'hematologyFindings', biopsy: 'biopsyFindings', fundus: 'fundusFindings',
      derm: 'skinFindings', urine: 'urineFindings',
    } as const)[r.specialModality]
    next[field] = r.specialFindings
  }
  return next
}

/** Merge the post-grading reveal into the client case view. */
function mergeReveal(prev: CaseData, reveal: CaseReveal): CaseData {
  return {
    ...prev,
    diagnosis: reveal.diagnosis,
    differentials: reveal.differentials,
    teachingPoints: reveal.teachingPoints,
    keyQuestions: reveal.keyQuestions,
    mechanism: reveal.mechanism,
    differentialPriors: reveal.differentialPriors ?? prev.differentialPriors,
    testImpacts: reveal.testImpacts ?? prev.testImpacts,
    reviewOfSystems: Object.keys(reveal.reviewOfSystems).length ? reveal.reviewOfSystems : prev.reviewOfSystems,
    expectedLabs: reveal.expectedLabs,
    expectedImaging: reveal.expectedImaging,
  }
}

async function postSession<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim()
    throw new Error(`Server error (${res.status}) — unexpected non-JSON response: ${preview || '(empty)'}`)
  }
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data?.error ?? `API error ${res.status}`) as Error & { status?: number; data?: unknown }
    err.status = res.status
    err.data = data
    throw err
  }
  return data as T
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
  // Pre-test differential ranking + confidence the student commits before ordering tests (null = not yet locked).
  const [prediction, setPrediction] = useState<string[] | null>(null)
  const [predictionConfidence, setPredictionConfidence] = useState<number | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<DimensionKey | null>(null)
  const [gradingLoading, setGradingLoading] = useState(false)

  const [caseDifficulty, setCaseDifficulty] = useState<string>('')
  const [revealedExamRegions, setRevealedExamRegions] = useState<Set<string>>(new Set())
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set())
  const [rosState, setRosState] = useState<ROSState>(makeInitialROSState())
  const [userPresentation, setUserPresentation] = useState('')

  // Server-side session id — the authoritative case + event log live behind it.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionMeta, setSessionMeta] = useState<SessionMeta>(EMPTY_SESSION_META)
  // True once the student has committed to the write-up phase: the case timer
  // is stopped and ask/exam/order are locked (server-enforced) so the stopped
  // clock can't be exploited to keep working the case.
  const [inPresentation, setInPresentation] = useState(false)
  // Background-history values the server has revealed (gated difficulties).
  const [hpiValues, setHpiValues] = useState<Partial<Record<HPIField, string>>>({})
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
  // Free-typed orders whose fuzzy match was contested — the student confirms
  // the canonical name instead of being silently penalized (4.3).
  const [ambiguousOrders, setAmbiguousOrders] = useState<Record<string, string[]>>({})
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
  const [historyEntries] = useState<CaseHistoryEntry[]>([])
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

  // Image lookup for ordered imaging tests. Selection runs SERVER-side
  // (/api/session/images) because it depends on the case diagnosis; the client
  // only routes the returned image into the right panel cache by test name.
  useEffect(() => {
    if (activeSection !== 'results' || !caseData || !sessionId) return
    const orderedArr = Array.from(orderedTests)
    const cacheMap: Record<SpecialModality, {
      cache: Record<string, SpecialImage | null | 'none'>
      setter: React.Dispatch<React.SetStateAction<Record<string, SpecialImage | null | 'none'>>>
    }> = {
      smear:  { cache: smearCache,     setter: setSmearCache },
      biopsy: { cache: biopsyImgCache, setter: setBiopsyImgCache },
      fundus: { cache: fundusCache,    setter: setFundusCache },
      derm:   { cache: dermCache,      setter: setDermCache },
      urine:  { cache: urineImgCache,  setter: setUrineImgCache },
    }

    const imagingTests = orderedArr.filter(t => findResultKey(t, caseData.imagingResults) !== null)
    const toFetch = imagingTests.filter(t => {
      if (isECGTest(t)) return !(t in ecgCache)
      const m = getSpecialModality(t)
      if (m) return !(t in cacheMap[m].cache)
      return !(t in imagingCache)
    })
    if (toFetch.length === 0) return

    /* eslint-disable react-hooks/set-state-in-effect --
       mark newly-ordered tests as loading before the async fetch resolves
       (same pattern as the previous per-modality effects) */
    for (const t of toFetch) {
      if (isECGTest(t)) setEcgCache(prev => ({ ...prev, [t]: null }))
      else {
        const m = getSpecialModality(t)
        if (m) cacheMap[m].setter(prev => ({ ...prev, [t]: null }))
        else setImagingCache(prev => ({ ...prev, [t]: null }))
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    void Promise.all(
      toFetch.map(async t => {
        try {
          const data = await postSession<{
            kind: 'ecg' | 'special' | 'imaging'
            ecg?: ECGImage | null
            modality?: SpecialModality
            special?: SpecialImage | null
            results?: OpenIResult[]
          }>('/api/session/images', { sessionId, test: t })
          if (data.kind === 'ecg') {
            setEcgCache(prev => ({ ...prev, [t]: data.ecg ?? 'none' }))
          } else if (data.kind === 'special' && data.modality) {
            cacheMap[data.modality].setter(prev => ({ ...prev, [t]: data.special ?? 'none' }))
          } else {
            setImagingCache(prev => ({ ...prev, [t]: data.results ?? [] }))
          }
        } catch {
          if (isECGTest(t)) setEcgCache(prev => ({ ...prev, [t]: 'none' }))
          else {
            const m = getSpecialModality(t)
            if (m) cacheMap[m].setter(prev => ({ ...prev, [t]: 'none' }))
            else setImagingCache(prev => ({ ...prev, [t]: [] }))
          }
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, caseData, sessionId])

  /** Record the token usage entries a session route returns. */
  const recordUsages = (usages: UsageEntry[] | undefined) => {
    for (const u of usages ?? []) recordApiCall(u.type as APICallType, u.usage)
  }

  /** Apply a /api/session/start response to local state. */
  const applyStartResponse = (data: StartResponse) => {
    resolvedSystemRef.current = data.system
    setSessionId(data.sessionId)
    setActiveCaseId(null)
    setCaseDifficulty(data.difficulty)
    setSessionMeta({
      examGated: data.presentation.examGated,
      hasReasoningModel: data.presentation.hasReasoningModel,
      predictionCandidates: data.presentation.predictionCandidates ?? [],
      caseSearchTests: data.presentation.caseSearchTests,
    })
    setCaseData(presentationToClientCase(data.presentation))
    setCaseStarted(data.difficulty === 'Foundations')
    setGateStatus(prev => ({
      ...prev,
      tier: data.gate.tier as 'anonymous' | 'free' | 'pro',
      casesLeft: data.gate.casesLeft ?? prev.casesLeft,
      firstCaseDone: data.gate.firstCaseDone,
    }))
    if (data.usage) recordApiCall('generation', data.usage)
  }

  /** Rehydrate a refreshed page from the server-side event log. */
  const applyResume = (data: ResumeResponse) => {
    if (!data.session || !data.presentation) return
    resolvedSystemRef.current = data.session.system
    setSessionId(data.session.sessionId)
    setCaseDifficulty(data.session.difficulty)
    setSessionMeta({
      examGated: data.presentation.examGated,
      hasReasoningModel: data.presentation.hasReasoningModel,
      predictionCandidates: data.presentation.predictionCandidates ?? [],
      caseSearchTests: data.presentation.caseSearchTests,
    })

    let clientCase = presentationToClientCase(data.presentation)
    for (const r of data.results ?? []) clientCase = mergeOrderResult(clientCase, r)
    setAmbiguousOrders(Object.fromEntries(
      (data.results ?? [])
        .filter(r => r.kind === 'ambiguous' && r.suggestions?.length)
        .map(r => [r.test, r.suggestions!]),
    ))
    for (const e of data.exams ?? []) {
      clientCase = { ...clientCase, physicalExam: { ...clientCase.physicalExam, [e.region]: e.finding } }
    }
    if (data.reveal) clientCase = mergeReveal(clientCase, data.reveal)
    setCaseData(clientCase)

    setChatMessages(data.chat ?? [])
    setRosState(() => {
      const next = makeInitialROSState()
      for (const u of data.ros ?? []) {
        next[u.category] = {
          status: u.status,
          finding: data.reveal?.reviewOfSystems?.[u.category] ?? '',
          derivedFinding: u.derivedFinding,
        }
      }
      return next
    })
    setHpiValues(data.hpi ?? {})
    setRevealedExamRegions(new Set((data.exams ?? []).map(e => e.region)))
    setOrderedTests(new Set(data.orderedTests ?? []))
    if (data.prediction) {
      setPrediction(data.prediction.ranking)
      setPredictionConfidence(data.prediction.confidence)
    }
    if (data.gradingResult) {
      setGradingResult(data.gradingResult)
      if (data.submittedDiagnosis) setUserDiagnosis(data.submittedDiagnosis)
    }
    setInPresentation(data.session.phase === 'presentation')
    // Timer state is not persisted server-side yet — resume unlocked so the
    // student can continue (the server log still bounds what counts as elicited).
    setCaseStarted(true)
    analyticsSessionRef.current = createActiveSession(data.session.system, data.session.difficulty)
  }

  const generateCase = async (overrideSystem?: string, overrideDifficulty?: string, overrideDiagnosis?: string): Promise<CaseData | null> => {
    setGenerationError(null)
    setGradingError(null)
    setGenerating(true)
    resetTimer()
    setCaseStarted(true)
    setSessionId(null)
    setSessionMeta(EMPTY_SESSION_META)
    setCaseData(null)
    setOrderedTests(new Set())
    setSelectedTests(new Set())
    setRevealedExamRegions(new Set())
    setChatMessages([])
    setGradingResult(null)
    setPrediction(null)
    setPredictionConfidence(null)
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
    setAmbiguousOrders({})
    onDemandQueuedRef.current = new Set()
    setRosState(makeInitialROSState())
    setHpiValues({})
    setInPresentation(false)
    setImagingCache({})
    setActiveCaseId(null)
    setEcgCache({})
    setSmearCache({})
    setBiopsyImgCache({})
    setFundusCache({})
    setDermCache({})
    setUrineImgCache({})

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
    pendingDiagnosisRef.current = null
    pendingRedoOfRef.current = null
    activeRedoOfRef.current = capturedRedoOf

    // If a case was in progress, record it as abandoned before replacing the session
    if (analyticsSessionRef.current !== null) {
      recordAbandonedSession(analyticsSessionRef.current, activeSectionRef.current)
    }

    try {
      // Everything else — gate consumption, diagnosis selection, cache lookup,
      // live generation, prompt construction — happens SERVER-side. The client
      // receives only the difficulty-stripped presentation slice.
      const data = await postSession<StartResponse>('/api/session/start', {
        system: overrideSystem ?? system,
        difficulty: resolvedDifficulty,
        ...(overrideDx ? { diagnosis: overrideDx } : {}),
        ...(capturedRedoOf ? { redo: true } : {}),
      })
      applyStartResponse(data)
      analyticsSessionRef.current = createActiveSession(data.system, data.difficulty)
      // Presentation slice is intentionally partial — components treat the
      // merged client view as CaseData with server-only fields absent.
      return presentationToClientCase(data.presentation)
    } catch (e) {
      const err = e as Error & { status?: number; data?: { gate?: { tier?: string } } }
      console.error('Case generation failed:', err)
      if (err.status === 401) {
        setGenerationError('Please sign in to start a case — anonymous access is no longer available for live cases.')
      } else if (err.status === 403 && err.message === 'gate_blocked') {
        setGateBlocked(true)
      } else if (err.message?.includes('429')) {
        setGenerationError('API rate limit reached. Wait a moment and try again.')
      } else {
        setGenerationError(`Failed to generate case: ${err.message}`)
      }
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

  /**
   * Submit test orders to the server session. Results come back from the
   * server-side case snapshot (which the client never holds in full); missing
   * results are generated on demand server-side.
   */
  const submitOrders = async (tests: string[]) => {
    if (!sessionId) return
    const newTests = tests.filter(t => t.trim() && !orderedTests.has(t))
    if (newTests.length === 0) return
    setOrderedTests(prev => new Set([...prev, ...newTests]))
    setGeneratingOnDemand(prev => new Set([...prev, ...newTests]))
    try {
      const data = await postSession<OrderResponse>('/api/session/order', { sessionId, tests: newTests })
      recordUsages(data.usages)
      setCaseData(prev => {
        if (!prev) return prev
        let next = prev
        for (const r of data.results) next = mergeOrderResult(next, r)
        return next
      })
      const failed = data.results.filter(r => r.kind === 'none').map(r => r.test)
      if (failed.length) setFailedOnDemand(prev => new Set([...prev, ...failed]))
      const ambiguous = data.results.filter(r => r.kind === 'ambiguous' && r.suggestions?.length)
      if (ambiguous.length) {
        setAmbiguousOrders(prev => ({
          ...prev,
          ...Object.fromEntries(ambiguous.map(r => [r.test, r.suggestions!])),
        }))
      }
    } catch (e) {
      console.error('[MedTrainer] order failed:', e)
      setFailedOnDemand(prev => new Set([...prev, ...newTests]))
    } finally {
      setGeneratingOnDemand(prev => {
        const n = new Set(prev)
        newTests.forEach(t => n.delete(t))
        return n
      })
    }
  }

  const orderTests = () => {
    if (selectedTests.size === 0) return
    const toOrder = Array.from(selectedTests)
    setSelectedTests(new Set())
    setActiveSection('results')
    void submitOrders(toOrder)
  }

  const addOrderedTest = (name: string) => {
    void submitOrders([name])
  }

  const orderCustomTest = () => {
    const name = customTestInput.trim()
    if (!name) return
    addOrderedTest(name)
    setCustomTestInput('')
    setActiveSection('results')
  }

  const removeOrderedTest = (name: string) => {
    // Local view only — the server event log keeps the order on record, so
    // grading still counts it (you can't un-ring the bell).
    setOrderedTests(prev => { const next = new Set(prev); next.delete(name); return next })
  }

  const examineRegion = async (region: string) => {
    if (!sessionId || inPresentation) return
    try {
      const data = await postSession<{ region: string; finding: string }>('/api/session/exam', { sessionId, region })
      setCaseData(prev => prev
        ? { ...prev, physicalExam: { ...prev.physicalExam, [region]: data.finding } }
        : prev)
      setRevealedExamRegions(prev => { const next = new Set(prev); next.add(region); return next })
    } catch (e) {
      console.error('[MedTrainer] exam failed:', e)
    }
  }

  const lockPrediction = (ranking: string[], confidence: number) => {
    setPrediction(ranking)
    setPredictionConfidence(confidence)
    if (sessionId) {
      postSession('/api/session/predict', { sessionId, ranking, confidence }).catch(() => {})
    }
  }

  /**
   * Enter the diagnosis/presentation phase (Clinical/Advanced): stops the case
   * timer and locks further questions, exams, and orders — the write-up itself
   * is untimed so a 50-word oral presentation no longer eats diagnostic time.
   */
  const enterPresentation = async () => {
    if (!sessionId || inPresentation) return
    setInPresentation(true)
    completeTimer()
    try {
      await postSession('/api/session/present', {
        sessionId,
        diagnosticSeconds: timerState.elapsedSeconds,
      })
    } catch (e) {
      console.error('[MedTrainer] enter_presentation failed:', e)
    }
  }

  // Deep link to open a specific existing case by id (server-side lookup only),
  // e.g. /trainer?caseId=cardiovascular-advanced-acute-pericarditis-0.
  // Otherwise, try to resume the most recent in-flight server session so a
  // page refresh never loses a case (the event log is the source of truth).
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('caseId')
    let cancelled = false
    ;(async () => {
      if (cid) {
        setGenerating(true)
        setGenerationError(null)
        try {
          const data = await postSession<StartResponse>('/api/session/start', { caseId: cid })
          if (cancelled) return
          applyStartResponse(data)
          setActiveSection('order')
        } catch (e) {
          if (!cancelled) {
            const status = (e as { status?: number }).status
            setGenerationError(status === 401
              ? 'Sign in to open this case.'
              : 'Could not load that case — make sure you are signed in and the id is correct.')
          }
        } finally {
          if (!cancelled) setGenerating(false)
        }
        return
      }

      // No deep link — attempt session resume.
      try {
        const res = await fetch('/api/session/resume')
        if (!res.ok) return
        const data = await res.json() as ResumeResponse
        if (cancelled || !data.session) return
        applyResume(data)
      } catch { /* no resumable session */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const sendChat = async (overrideMessage?: string): Promise<string | undefined> => {
    const msg = (overrideMessage !== undefined ? overrideMessage : chatInput).trim()
    if (!msg || !caseData || !sessionId || chatLoading) return
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    if (overrideMessage === undefined) setChatInput('')
    setChatLoading(true)

    try {
      // The patient-agent prompt (hidden history included) is assembled
      // SERVER-side from the session snapshot; the client sends only the
      // student's message. ROS/HPI unlock classification also runs there.
      const data = await postSession<AskResponse>('/api/session/ask', { sessionId, message: msg })
      recordUsages(data.usages)
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      if (analyticsSessionRef.current) analyticsSessionRef.current.questionCount++

      if (data.rosUnlocks.length > 0) {
        setRosState(prev => {
          const next = { ...prev }
          for (const u of data.rosUnlocks) {
            // Canonical `finding` stays empty until the post-grading reveal.
            next[u.category] = { status: u.status, finding: '', derivedFinding: u.derivedFinding }
          }
          return next
        })
      }
      if (Object.keys(data.hpiUnlocks).length > 0) {
        setHpiValues(prev => ({ ...prev, ...data.hpiUnlocks }))
      }

      return data.reply
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
    if (!diagnosisToGrade || !caseData || !sessionId || gradingLoading) return null
    if (overrideDiagnosis !== undefined) setUserDiagnosis(overrideDiagnosis)
    completeTimer()
    setGradingLoading(true)

    const reasoningText = (overridePresentation !== undefined ? overridePresentation : userPresentation).trim()

    try {
      // Grading input is assembled SERVER-side from the session event log +
      // ground truth — the client contributes only its diagnosis text and
      // written reasoning, so it cannot inflate what it asked or ordered.
      const data = await postSession<GradeResponse>('/api/session/grade', {
        sessionId, diagnosis: diagnosisToGrade, reasoningText, timedOut,
      })
      recordUsages(data.usages)
      const result = data.result
      const reveal = data.reveal

      // Teaching reveal: fold ground truth into the client case view and the
      // canonical ROS findings into the unlocked rows.
      setCaseData(prev => (prev ? mergeReveal(prev, reveal) : prev))
      setRosState(prev => {
        const next = { ...prev }
        for (const cat of ROS_CATEGORIES) {
          if (next[cat].status !== 'locked') {
            const canonical = reveal.reviewOfSystems[cat] ?? ''
            // Post-grading the full finding is revealed, so the row color may
            // now reflect the canonical content (no longer a cueing risk).
            next[cat] = { ...next[cat], finding: canonical, status: classifyFinding(canonical) }
          }
        }
        return next
      })

      // Save to history
      try {
        const entry: CaseHistoryEntry = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          difficulty: caseDifficulty,
          system: caseData.patientInfo.chiefComplaint
            ? caseData.patientInfo.chiefComplaint.split(' ').slice(0, 3).join(' ')
            : 'Unknown',
          diagnosis: reveal.diagnosis,
          userDiagnosis: diagnosisToGrade,
          correct: result.correct ?? false,
          score: result.score ?? 0,
        }
        addHistoryEntry(entry)
      } catch {}

      // Finalize analytics session
      if (analyticsSessionRef.current) {
        const record = finalizeSession(analyticsSessionRef.current, {
          diagnosis: reveal.diagnosis,
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

      // Update mastery + extract spaced-repetition cards from the reveal payload
      try {
        recordCaseOutcome(
          {
            diagnosis: reveal.diagnosis,
            teachingPoints: reveal.teachingPoints,
            mechanism: reveal.mechanism,
            testImpacts: reveal.testImpacts,
          },
          resolvedSystemRef.current || system,
          caseDifficulty,
          result.score ?? 0,
          result.correct ?? false,
          Date.now(),
        )
        // Record pre-test calibration if the student committed a prediction.
        if (prediction && prediction[0] && (reveal.differentialPriors?.length ?? 0) > 0) {
          const beliefs = computeBeliefs(reveal.differentialPriors!, reveal.testImpacts ?? {}, Array.from(orderedTests))
          const ps = scorePrediction(prediction, beliefs)
          // Normalized match: did the student's leading pick equal the actual diagnosis?
          const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
          const np = norm(prediction[0]), nd = norm(reveal.diagnosis)
          const topCorrect = np.length > 1 && (np === nd || nd.includes(np) || np.includes(nd))
          if (caseDifficulty === 'Foundations' && ps.comparedCount > 0) {
            // Ranked mode: rank-agreement + Brier.
            recordCalibration(ps.score, ps.topHit, Date.now(), predictionConfidence ?? undefined, topCorrect)
          } else {
            // Open mode (Clinical/Advanced): no candidate ranking — record leading-pick accuracy + Brier.
            recordCalibration(topCorrect ? 100 : 0, topCorrect, Date.now(), predictionConfidence ?? undefined, topCorrect)
          }
        }
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
        else if (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') {
          // Gated: only systems the student has actually asked about are visible.
          addTerminalLines({ type: 'info', content: 'REVIEW OF SYSTEMS (asked systems only)' })
          const unlocked = ROS_CATEGORIES.filter(c => rosState[c].status !== 'locked')
          if (unlocked.length === 0) {
            addTerminalLines({ type: 'info', content: '  Nothing reviewed yet — ask the patient about each system.' })
          } else {
            unlocked.forEach(c =>
              addTerminalLines({ type: 'output', content: `  ${c.padEnd(18)} ${rosState[c].derivedFinding ?? '(recorded)'}` })
            )
          }
        } else {
          addTerminalLines({ type: 'info', content: 'REVIEW OF SYSTEMS' })
          Object.entries(caseData.reviewOfSystems).forEach(([s, val]) =>
            addTerminalLines({ type: 'output', content: `  ${s.padEnd(18)} ${val}` })
          )
        }
        break

      case 'exam':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else if (sessionMeta.examGated) {
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
        else if (caseData.availableLabs.length === 0) {
          addTerminalLines({ type: 'info', content: 'No pre-listed labs at this difficulty — order by name with "order <test>".' })
        } else {
          addTerminalLines({ type: 'info', content: 'AVAILABLE LABORATORY TESTS' })
          caseData.availableLabs.forEach(lab =>
            addTerminalLines({ type: 'output', content: `  [${orderedTests.has(lab) ? 'ordered' : 'pending'}] ${lab}` })
          )
        }
        break

      case 'imaging':
        if (!caseData) addTerminalLines({ type: 'error', content: 'No case loaded.' })
        else if (caseData.availableImaging.length === 0) {
          addTerminalLines({ type: 'info', content: 'No pre-listed studies at this difficulty — order by name with "order <test>".' })
        } else {
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
        const match = allTests.find(t => t.toLowerCase().includes(args.toLowerCase())) ?? args
        if (orderedTests.has(match)) {
          addTerminalLines({ type: 'error', content: `Already ordered: ${match}` })
        } else {
          void submitOrders([match])
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
          hpiValues={hpiValues}
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
          examGated={sessionMeta.examGated}
          revealedExamRegions={revealedExamRegions}
          revealExamRegion={(r) => { void examineRegion(r) }}
        />
      case 'order':
        return <OrderView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
          prediction={prediction}
          predictionConfidence={predictionConfidence}
          onLockPrediction={lockPrediction}
          predictionCandidates={sessionMeta.predictionCandidates}
          hasReasoningModel={sessionMeta.hasReasoningModel}
          caseSearchTests={sessionMeta.caseSearchTests}
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
          locked={locked || inPresentation}
        />
      case 'results':
        return <ResultsView
          caseData={caseData}
          caseDifficulty={caseDifficulty}
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
          ambiguousOrders={ambiguousOrders}
          onConfirmAmbiguous={(typed, canonical) => {
            setAmbiguousOrders(prev => { const n = { ...prev }; delete n[typed]; return n })
            setOrderedTests(prev => { const n = new Set(prev); n.delete(typed); return n })
            void submitOrders([canonical])
          }}
          onDismissAmbiguous={(typed) => {
            // Keep the typed order as-is; grading treats it as neutral.
            setAmbiguousOrders(prev => { const n = { ...prev }; delete n[typed]; return n })
            setFailedOnDemand(prev => new Set([...prev, typed]))
          }}
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
          prediction={prediction}
          predictionConfidence={predictionConfidence}
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
          inPresentation={inPresentation}
          enterPresentation={() => { void enterPresentation() }}
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
                  disabled={!caseData || chatLoading || locked || inPresentation}
                  title={inPresentation ? 'The chart is locked during the write-up phase' : locked ? 'Start the timer to begin the clinical encounter' : undefined}
                  placeholder={inPresentation ? 'Chart locked — you are in the write-up phase' : locked ? 'Start the timer to begin the clinical encounter' : caseData ? 'Ask the patient...' : 'Generate a case first'}
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
                  disabled={!caseData || chatLoading || !chatInput.trim() || locked || inPresentation}
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