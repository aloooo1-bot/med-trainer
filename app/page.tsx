'use client'

import { useState, useRef, useEffect } from 'react'

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
  { id: 'hpi', label: 'History of Present Illness' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'ros', label: 'Review of Systems' },
  { id: 'exam', label: 'Physical Examination' },
  { id: 'order', label: 'Order Tests' },
  { id: 'results', label: 'Test Results' },
  { id: 'diagnosis', label: 'Diagnosis' },
]

interface CaseData {
  patientInfo: { name: string; age: number; gender: string; chiefComplaint: string }
  hpi: string
  vitals: { bp: string; hr: number; rr: number; temp: number; spo2: number; weight: string }
  reviewOfSystems: Record<string, string>
  physicalExam: Record<string, string>
  availableLabs: string[]
  availableImaging: string[]
  labResults: Record<string, { result: string; referenceRange: string; status: 'normal' | 'abnormal' | 'critical' }>
  imagingResults: Record<string, string>
  hiddenHistory: {
    socialHistory: string
    familyHistory: string
    medications: string
    hiddenSymptoms: string
    allergies: string
  }
  diagnosis: string
  differentials: string[]
  teachingPoints: string[]
  keyQuestions: string[]
}

interface GradingResult {
  score: number
  correct: boolean
  feedback: string
  missedQuestions: string[]
  teachingPoints: string[]
  differentials: string[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'success' | 'info'
  content: string
}

async function callClaude(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens = 1000
): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error('API error')
  const data = await res.json()
  return data.content[0].text as string
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
      <h2 className="mb-4 text-base font-semibold text-blue-400 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

function Badge({ text, color = 'blue' }: { text: string; color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' }) {
  const colors = {
    blue: 'bg-blue-900/50 text-blue-300 border-blue-700',
    green: 'bg-green-900/50 text-green-300 border-green-700',
    yellow: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    red: 'bg-red-900/50 text-red-300 border-red-700',
    purple: 'bg-purple-900/50 text-purple-300 border-purple-700',
  }
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${colors[color]}`}>
      {text}
    </span>
  )
}

function ImagingResult({ name, report }: { name: string; report: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [finding, setFinding] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams({ study: name, report })
    fetch(`/api/imaging?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.url) { setImageUrl(data.url); setFinding(data.finding) }
      })
      .catch(() => {})
  }, [name, report])

  return (
    <div className="rounded-md bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-blue-400">{name}</div>
      {imageUrl && !imgError ? (
        <div className="mb-3">
          <img
            src={imageUrl}
            alt={`${name} — ${finding}`}
            className="w-full max-w-lg rounded border border-gray-700 grayscale"
            onError={() => setImgError(true)}
          />
          {finding && <p className="mt-1 text-xs text-gray-500">NIH ChestX-ray14 · {finding}</p>}
        </div>
      ) : imageUrl === null ? (
        <div className="mb-3 flex h-48 max-w-lg items-center justify-center rounded border border-gray-700 bg-gray-800 text-xs text-gray-500">
          Loading image…
        </div>
      ) : null}
      <p className="text-sm leading-relaxed text-gray-300">{report}</p>
    </div>
  )
}

export default function MedTrainer() {
  const [system, setSystem] = useState('Any')
  const [difficulty, setDifficulty] = useState('Resident')
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
  const [gradingLoading, setGradingLoading] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { type: 'info', content: 'MedTrainer Terminal — type "help" for commands' },
  ])
  const [terminalInput, setTerminalInput] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalLoading, setTerminalLoading] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const terminalInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  const generateCase = async (overrideSystem?: string, overrideDifficulty?: string): Promise<CaseData | null> => {
    setGenerating(true)
    setCaseData(null)
    setOrderedTests(new Set())
    setSelectedTests(new Set())
    setChatMessages([])
    setGradingResult(null)
    setRevealed(false)
    setUserDiagnosis('')
    setActiveSection('hpi')

    const baseSystem = overrideSystem ?? system
    const resolvedSystem = baseSystem === 'Any'
      ? SYSTEMS.filter(s => s !== 'Any')[Math.floor(Math.random() * (SYSTEMS.length - 1))]
      : baseSystem
    const resolvedDifficulty = overrideDifficulty ?? difficulty

    const claudeSystem = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.`

    const prompt = `Generate a realistic ${resolvedSystem} clinical case appropriate for a ${resolvedDifficulty} level learner.

Return this exact JSON structure with all fields populated:
{
  "patientInfo": {
    "name": "First Last",
    "age": <number>,
    "gender": "Male or Female",
    "chiefComplaint": "<brief chief complaint>"
  },
  "hpi": "<detailed 4-5 sentence HPI including onset, duration, character, radiation, associated symptoms, timing, exacerbating/relieving factors>",
  "vitals": {
    "bp": "<systolic/diastolic mmHg>",
    "hr": <beats per minute>,
    "rr": <breaths per minute>,
    "temp": <Fahrenheit decimal>,
    "spo2": <percent integer>,
    "weight": "<lbs>"
  },
  "reviewOfSystems": {
    "Constitutional": "<positive and negative findings>",
    "Cardiovascular": "<positive and negative findings>",
    "Pulmonary": "<positive and negative findings>",
    "GI": "<positive and negative findings>",
    "GU": "<positive and negative findings>",
    "Musculoskeletal": "<positive and negative findings>",
    "Neurological": "<positive and negative findings>",
    "Skin": "<positive and negative findings>",
    "Psychiatric": "<positive and negative findings>"
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
  "labResults": {
    "<each lab from availableLabs>": { "result": "<value with units e.g. 14.2 g/dL>", "referenceRange": "<normal range with units e.g. 13.5-17.5 g/dL>", "status": "<normal|abnormal|critical>" }
  },
  "imagingResults": {
    "<each study from availableImaging>": "<radiology-style report impression, 2-3 sentences>"
  },
  "hiddenHistory": {
    "socialHistory": "<smoking pack-years, alcohol drinks/week, recreational drugs, occupation, living situation, recent travel>",
    "familyHistory": "<relevant family history with relationships and conditions>",
    "medications": "<current medications with doses and frequencies>",
    "hiddenSymptoms": "<1-2 symptoms patient hasn't mentioned but will confirm if asked directly>",
    "allergies": "<drug allergies with reaction type, or NKDA>"
  },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", "<dx 3>", "<dx 4>", "<dx 5>"],
  "teachingPoints": ["<clinical pearl 1>", "<clinical pearl 2>", "<clinical pearl 3>", "<clinical pearl 4>"],
  "keyQuestions": [
    "<important question the physician should have asked the patient>",
    "<important question>",
    "<important question>",
    "<important question>",
    "<important question>"
  ]
}`

    try {
      const text = await callClaude(claudeSystem, [{ role: 'user', content: prompt }], 6000)
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response')
      const parsed = JSON.parse(match[0]) as CaseData
      setCaseData(parsed)
      return parsed
    } catch (e) {
      console.error('Case generation failed:', e)
      alert('Failed to generate case. Check your API key and try again.')
      return null
    } finally {
      setGenerating(false)
    }
  }

  const toggleTest = (name: string) => {
    setSelectedTests(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
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

  const sendChat = async (overrideMessage?: string): Promise<string | undefined> => {
    const msg = (overrideMessage !== undefined ? overrideMessage : chatInput).trim()
    if (!msg || !caseData || chatLoading) return
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    if (overrideMessage === undefined) setChatInput('')
    setChatLoading(true)

    const system = `You are roleplaying as a patient named ${caseData.patientInfo.name}, a ${caseData.patientInfo.age}-year-old ${caseData.patientInfo.gender} who came to the clinic/ED with "${caseData.patientInfo.chiefComplaint}".

Your presenting story: ${caseData.hpi}

Hidden information — only reveal if the physician asks directly:
- Social history: ${caseData.hiddenHistory.socialHistory}
- Family history: ${caseData.hiddenHistory.familyHistory}
- Current medications: ${caseData.hiddenHistory.medications}
- Allergies: ${caseData.hiddenHistory.allergies}
- Additional symptoms (if asked): ${caseData.hiddenHistory.hiddenSymptoms}

Rules:
- Respond naturally as a patient, NOT as a medical expert
- Do not volunteer hidden information unless directly asked about that specific topic
- Be realistic: slightly anxious, use lay terms, may downplay or overemphasize symptoms
- Keep answers concise (2-4 sentences)
- Stay in character at all times`

    const history = [...chatMessages, { role: 'user' as const, content: msg }]

    try {
      const reply = await callClaude(system, history, 300)
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }])
      return reply
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I'm not feeling well enough to answer right now." }])
      return undefined
    } finally {
      setChatLoading(false)
      chatInputRef.current?.focus()
    }
  }

  const submitDiagnosis = async (overrideDiagnosis?: string): Promise<GradingResult | null> => {
    const diagnosisToGrade = (overrideDiagnosis !== undefined ? overrideDiagnosis : userDiagnosis).trim()
    if (!diagnosisToGrade || !caseData || gradingLoading) return null
    if (overrideDiagnosis !== undefined) setUserDiagnosis(overrideDiagnosis)
    setGradingLoading(true)

    const orderedLabResults = Array.from(orderedTests)
      .filter(t => caseData.labResults[t])
      .map(t => `${t}: ${caseData.labResults[t].result} (ref: ${caseData.labResults[t].referenceRange}) [${caseData.labResults[t].status}]`)
      .join('\n')
    const orderedImagingResults = Array.from(orderedTests)
      .filter(t => caseData.imagingResults[t])
      .map(t => `${t}: ${caseData.imagingResults[t]}`)
      .join('\n')
    const chatSummary = chatMessages
      .map(m => `${m.role === 'user' ? 'Physician' : 'Patient'}: ${m.content}`)
      .join('\n')

    const system = `You are a medical education evaluator grading a trainee's diagnostic performance.
Return ONLY valid JSON. No markdown, no code fences, no explanation.`

    const prompt = `Case: ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"
HPI: ${caseData.hpi}

Tests ordered:
${orderedLabResults || '(no labs ordered)'}
${orderedImagingResults || '(no imaging ordered)'}

Patient interview transcript:
${chatSummary || '(physician did not interview the patient)'}

Trainee's submitted diagnosis: "${diagnosisToGrade}"
Correct diagnosis: "${caseData.diagnosis}"
Key clinical information that should have been elicited: ${caseData.keyQuestions.join(' | ')}
Teaching points: ${caseData.teachingPoints.join(' | ')}
Differentials: ${caseData.differentials.join(', ')}

Grading instructions:
- For each piece of key clinical information above, carefully read the FULL interview transcript to determine whether the trainee obtained that information — regardless of how they phrased the question. Credit should be given if the patient's response conveyed the same clinical information, even through a different question.
- Only mark information as missed if it was truly never surfaced in the interview.
- Do NOT penalise the trainee for asking a different question if the answer revealed the same clinical finding.

Return:
{
  "score": <integer 0-100>,
  "correct": <true if diagnosis is correct or clinically equivalent, false otherwise>,
  "feedback": "<2-3 sentences of direct, constructive feedback on their overall performance>",
  "missedQuestions": ["<only information that was genuinely never elicited during the interview>", ...omit anything the trainee did uncover],
  "teachingPoints": ${JSON.stringify(caseData.teachingPoints)},
  "differentials": ["<dx>: <1 sentence explanation of why it's on the differential and how to distinguish>", ...]
}`

    try {
      const text = await callClaude(system, [{ role: 'user', content: prompt }], 2000)
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON')
      const result = JSON.parse(match[0]) as GradingResult
      setGradingResult(result)
      return result
    } catch {
      alert('Failed to grade. Please try again.')
      return null
    } finally {
      setGradingLoading(false)
    }
  }

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
          { type: 'output', content: caseData.hpi },
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
        else {
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
          if (caseData.labResults[t]) {
            const r = caseData.labResults[t]
            const flag = r.status === 'critical' ? ' [CRITICAL]' : r.status === 'abnormal' ? ' [ABN]' : ''
            addTerminalLines({ type: r.status === 'normal' ? 'output' : 'error', content: `  ${t}: ${r.result} (${r.referenceRange})${flag}` })
          } else if (caseData.imagingResults[t]) {
            addTerminalLines({ type: 'output', content: `  ${t}: ${caseData.imagingResults[t]}` })
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
        return (
          <div className="space-y-4">
            <SectionCard title="Patient Information">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Name', caseData.patientInfo.name],
                  ['Age', `${caseData.patientInfo.age} years`],
                  ['Gender', caseData.patientInfo.gender],
                  ['Chief Complaint', caseData.patientInfo.chiefComplaint],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-gray-900 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-sm text-gray-100 font-medium">{value}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="History of Present Illness">
              <p className="text-sm leading-relaxed text-gray-300">{caseData.hpi}</p>
            </SectionCard>
          </div>
        )

      case 'vitals':
        return (
          <SectionCard title="Vital Signs">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                ['BP', caseData.vitals.bp, 'mmHg'],
                ['HR', String(caseData.vitals.hr), 'bpm'],
                ['RR', String(caseData.vitals.rr), '/min'],
                ['Temp', String(caseData.vitals.temp), '°F'],
                ['SpO₂', String(caseData.vitals.spo2), '%'],
                ['Weight', caseData.vitals.weight, ''],
              ].map(([label, value, unit]) => {
                const isAbnormal =
                  (label === 'HR' && (Number(value) > 100 || Number(value) < 60)) ||
                  (label === 'RR' && (Number(value) > 20 || Number(value) < 12)) ||
                  (label === 'Temp' && (Number(value) > 99.5 || Number(value) < 97)) ||
                  (label === 'SpO₂' && Number(value) < 95)
                return (
                  <div key={label} className={`rounded-lg p-4 text-center ${isAbnormal ? 'bg-red-950/50 border border-red-800' : 'bg-gray-900'}`}>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
                    <div className={`text-2xl font-bold ${isAbnormal ? 'text-red-300' : 'text-gray-100'}`}>{value}</div>
                    {unit && <div className="text-xs text-gray-600 mt-0.5">{unit}</div>}
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )

      case 'ros':
        return (
          <SectionCard title="Review of Systems">
            <div className="space-y-3">
              {Object.entries(caseData.reviewOfSystems).map(([system, findings]) => (
                <div key={system} className="flex gap-3 rounded-md bg-gray-900 p-3">
                  <span className="w-36 flex-shrink-0 text-xs font-semibold text-blue-400 uppercase tracking-wide pt-0.5">{system}</span>
                  <span className="text-sm text-gray-300">{findings}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )

      case 'exam':
        return (
          <SectionCard title="Physical Examination">
            <div className="space-y-3">
              {Object.entries(caseData.physicalExam).map(([system, findings]) => (
                <div key={system} className="flex gap-3 rounded-md bg-gray-900 p-3">
                  <span className="w-36 flex-shrink-0 text-xs font-semibold text-blue-400 uppercase tracking-wide pt-0.5">{system}</span>
                  <span className="text-sm text-gray-300">{findings}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )

      case 'order': {
        const allOrdered = (name: string) => orderedTests.has(name)
        return (
          <div className="space-y-4">
            <SectionCard title="Laboratory Studies">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {caseData.availableLabs.map(lab => {
                  const isOrdered = allOrdered(lab)
                  const isSelected = selectedTests.has(lab)
                  return (
                    <label
                      key={lab}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                        isOrdered
                          ? 'border-green-700 bg-green-900/20 cursor-default'
                          : isSelected
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || isOrdered}
                        disabled={isOrdered}
                        onChange={() => !isOrdered && toggleTest(lab)}
                        className="accent-blue-500"
                      />
                      <span className="text-sm text-gray-200">{lab}</span>
                      {isOrdered && <Badge text="Ordered" color="green" />}
                    </label>
                  )
                })}
              </div>
            </SectionCard>
            <SectionCard title="Imaging Studies">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {caseData.availableImaging.map(img => {
                  const isOrdered = allOrdered(img)
                  const isSelected = selectedTests.has(img)
                  return (
                    <label
                      key={img}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                        isOrdered
                          ? 'border-green-700 bg-green-900/20 cursor-default'
                          : isSelected
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || isOrdered}
                        disabled={isOrdered}
                        onChange={() => !isOrdered && toggleTest(img)}
                        className="accent-blue-500"
                      />
                      <span className="text-sm text-gray-200">{img}</span>
                      {isOrdered && <Badge text="Ordered" color="green" />}
                    </label>
                  )
                })}
              </div>
            </SectionCard>
            {selectedTests.size > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-blue-700 bg-blue-900/20 px-4 py-3">
                <span className="text-sm text-blue-300">{selectedTests.size} test{selectedTests.size > 1 ? 's' : ''} selected</span>
                <button
                  onClick={orderTests}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                >
                  Order Selected Tests
                </button>
              </div>
            )}
          </div>
        )
      }

      case 'results': {
        const orderedLabs = Array.from(orderedTests).filter(t => caseData.labResults[t])
        const orderedImaging = Array.from(orderedTests).filter(t => caseData.imagingResults[t])
        if (orderedTests.size === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <svg className="mb-3 h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No tests ordered yet.</p>
              <button onClick={() => setActiveSection('order')} className="mt-2 text-sm text-blue-400 hover:text-blue-300">
                Go to Order Tests →
              </button>
            </div>
          )
        }
        return (
          <div className="space-y-4">
            {orderedLabs.length > 0 && (
              <SectionCard title="Laboratory Results">
                <div className="overflow-hidden rounded-md border border-gray-700">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-900">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-700">Parameter</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-700">Result</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-700">Reference Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedLabs.map((lab, i) => {
                        const raw = caseData.labResults[lab]
                        const isObj = raw && typeof raw === 'object'
                        const result = isObj ? (raw as {result:string}).result : (raw as unknown as string)
                        const referenceRange = isObj ? (raw as {referenceRange:string}).referenceRange : '—'
                        const status = isObj ? (raw as {status:string}).status : (/abnormal|high|low|elevated|decreased|positive|critical/i.test(result) ? 'abnormal' : 'normal')
                        const isCritical = status === 'critical'
                        const isAbnormal = status === 'abnormal' || isCritical
                        return (
                          <tr key={lab} className={`border-b border-gray-700/50 last:border-0 ${i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-800/50'} ${isAbnormal ? 'bg-red-950/30' : ''}`}>
                            <td className="px-4 py-3 font-medium text-gray-200">{lab}</td>
                            <td className={`px-4 py-3 font-semibold ${isCritical ? 'text-red-400' : isAbnormal ? 'text-yellow-300' : 'text-gray-100'}`}>
                              {result}
                              {isCritical && <Badge text="Critical" color="red" />}
                              {status === 'abnormal' && <span className="ml-2"><Badge text="Abnormal" color="yellow" /></span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400">{referenceRange}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}
            {orderedImaging.length > 0 && (
              <SectionCard title="Imaging Results">
                <div className="space-y-4">
                  {orderedImaging.map(img => (
                    <ImagingResult key={img} name={img} report={caseData.imagingResults[img]} />
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )
      }

      case 'diagnosis':
        return (
          <div className="space-y-4">
            {!gradingResult ? (
              <SectionCard title="Submit Your Diagnosis">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm text-gray-400">
                      Enter your primary diagnosis:
                    </label>
                    <input
                      type="text"
                      value={userDiagnosis}
                      onChange={e => setUserDiagnosis(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitDiagnosis()}
                      placeholder="e.g., Acute ST-elevation myocardial infarction"
                      className="w-full rounded-md border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={submitDiagnosis}
                    disabled={!userDiagnosis.trim() || gradingLoading}
                    className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  >
                    {gradingLoading ? 'Grading...' : 'Submit Diagnosis'}
                  </button>
                  {orderedTests.size === 0 && (
                    <p className="text-xs text-yellow-500">
                      Tip: Order some tests first to improve your workup.
                    </p>
                  )}
                </div>
              </SectionCard>
            ) : (
              <div className="space-y-4">
                {/* Score card */}
                <div className={`rounded-lg border p-5 ${gradingResult.correct ? 'border-green-700 bg-green-950/30' : 'border-red-700 bg-red-950/30'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-gray-100">
                      {gradingResult.correct ? '✓ Correct Diagnosis' : '✗ Incorrect Diagnosis'}
                    </h3>
                    <div className={`text-3xl font-bold ${gradingResult.score >= 70 ? 'text-green-400' : gradingResult.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {gradingResult.score}/100
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-sm">
                    <span className="text-gray-400">Your diagnosis:</span>
                    <span className="font-medium text-gray-200">{userDiagnosis}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-gray-400">Correct:</span>
                    <span className="font-medium text-green-300">{caseData.diagnosis}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-300">{gradingResult.feedback}</p>
                </div>

                {/* Missed questions */}
                {gradingResult.missedQuestions?.length > 0 && (
                  <SectionCard title="Key Questions You Should Have Asked">
                    <ul className="space-y-2">
                      {gradingResult.missedQuestions.map((q, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-300">
                          <span className="text-yellow-500 flex-shrink-0">•</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                )}

                {/* Teaching points */}
                <SectionCard title="Teaching Points">
                  <ul className="space-y-2">
                    {gradingResult.teachingPoints?.map((pt, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-300">
                        <span className="text-blue-400 flex-shrink-0 font-bold">{i + 1}.</span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </SectionCard>

                {/* Differentials */}
                <SectionCard title="Differential Diagnosis Discussion">
                  <div className="space-y-3">
                    {gradingResult.differentials?.map((dx, i) => {
                      const [name, explanation] = dx.includes(':') ? dx.split(/: (.+)/) : [dx, '']
                      return (
                        <div key={i} className="rounded-md bg-gray-900 p-3">
                          <div className="mb-1 text-sm font-semibold text-purple-300">{name}</div>
                          {explanation && <p className="text-sm text-gray-400">{explanation}</p>}
                        </div>
                      )
                    })}
                  </div>
                </SectionCard>

                <button
                  onClick={() => {
                    setGradingResult(null)
                    setUserDiagnosis('')
                  }}
                  className="w-full rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-2.5">
        <div className="flex items-center gap-2 mr-2">
          <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs font-bold">Rx</div>
          <span className="text-sm font-semibold text-gray-100 whitespace-nowrap">MedTrainer</span>
        </div>
        <select
          value={system}
          onChange={e => setSystem(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          {SYSTEMS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select
          value={difficulty}
          onChange={e => setDifficulty(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
        </select>
        <button
          onClick={generateCase}
          disabled={generating}
          className="ml-1 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? 'Generating...' : 'Generate Case'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {caseData && (
            <>
              <span className="text-xs text-gray-500">{caseData.patientInfo.name}</span>
              <Badge text={`${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}`} color="blue" />
              <Badge text={system === 'Any' ? 'Random' : system} color="purple" />
            </>
          )}
          <button
            onClick={() => setShowTerminal(v => !v)}
            className={`ml-2 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
              showTerminal
                ? 'border-green-600 bg-green-900/30 text-green-400'
                : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-400 hover:text-gray-200'
            }`}
          >
            {'> _'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="flex w-48 flex-shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-gray-800 bg-gray-900 p-2">
          {NAV.map(({ id, label }) => {
            const isActive = activeSection === id
            const isDisabled = !caseData
            return (
              <button
                key={id}
                onClick={() => !isDisabled && setActiveSection(id)}
                disabled={isDisabled}
                className={`flex w-full items-start rounded-md px-3 py-2.5 text-left text-xs transition-colors ${
                  isDisabled
                    ? 'cursor-not-allowed text-gray-700'
                    : isActive
                    ? 'bg-blue-700/30 text-blue-300 font-semibold'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5">
          {generating ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
              <p className="text-sm">Generating {system === 'Any' ? 'random' : system} case ({difficulty})...</p>
            </div>
          ) : !caseData ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="h-16 w-16 rounded-full bg-gray-800 flex items-center justify-center text-3xl">🏥</div>
              <div>
                <h1 className="text-xl font-semibold text-gray-200">Medical Diagnosis Trainer</h1>
                <p className="mt-1 text-sm text-gray-500">Select a system and difficulty, then generate a clinical case to begin.</p>
              </div>
              <button
                onClick={generateCase}
                className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                Generate Your First Case
              </button>
            </div>
          ) : (
            renderMain()
          )}
        </main>

        {/* Patient chat sidebar */}
        <aside className="flex w-72 flex-shrink-0 flex-col border-l border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <div>
              <h2 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">Patient Interview</h2>
              {caseData && (
                <p className="text-xs text-gray-500 mt-0.5">{caseData.patientInfo.name}</p>
              )}
            </div>
            {caseData && (
              <div className="h-2 w-2 rounded-full bg-green-500" title="Patient available" />
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!caseData && (
              <p className="text-xs text-gray-600 text-center pt-8">Generate a case to start interviewing the patient.</p>
            )}
            {caseData && chatMessages.length === 0 && (
              <div className="rounded-md bg-gray-800 p-3">
                <p className="text-xs text-gray-400">
                  Ask the patient questions to gather additional history. Try asking about medications, family history, social history, or other symptoms.
                </p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-700 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-700 px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-gray-800 p-3">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                disabled={!caseData || chatLoading}
                placeholder={caseData ? 'Ask the patient...' : 'Generate a case first'}
                className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                onClick={sendChat}
                disabled={!caseData || chatLoading || !chatInput.trim()}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Ask
              </button>
            </div>
            {caseData && (
              <p className="mt-1.5 text-[10px] text-gray-600">
                Patient won&apos;t volunteer hidden history — ask directly.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Command terminal panel */}
      {showTerminal && (
        <div className="flex h-56 flex-shrink-0 flex-col border-t border-green-900 bg-gray-950 font-mono">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1.5">
            <span className="text-xs text-green-500 font-semibold tracking-widest uppercase">Terminal</span>
            {terminalLoading && (
              <span className="text-xs text-yellow-500 animate-pulse">processing…</span>
            )}
            <button
              onClick={() => setShowTerminal(false)}
              className="text-gray-600 hover:text-gray-300 text-xs px-1"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 text-xs leading-relaxed">
            {terminalLines.map((line, i) => (
              <div
                key={i}
                className={
                  line.type === 'input'   ? 'text-gray-400' :
                  line.type === 'error'   ? 'text-red-400' :
                  line.type === 'success' ? 'text-green-400' :
                  line.type === 'info'    ? 'text-cyan-400' :
                  'text-gray-200'
                }
              >
                {line.content}
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-gray-800 px-3 py-2">
            <span className="text-green-500 text-xs select-none">{'>'}</span>
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
              className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-700 focus:outline-none disabled:opacity-50"
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  )
}
