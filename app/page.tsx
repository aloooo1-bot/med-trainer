'use client'

import { useState, useRef, useEffect } from 'react'
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
} from './lib/rosDetector'
import { CLINICAL_CATEGORIES, MASTER_TEST_LIST, searchTests } from './lib/testMasterList'
import { type OpenIResult, fetchImagingResults } from './lib/imagingSearch'
import { type ECGImage, getECGCategory, getRandomECGImage } from './lib/ecgImageLookup'
import {
  type SpecialImage, type SpecialModality,
  getSpecialModality, getSpecialCategory, getRandomSpecialImage,
  isSmearTest, isBiopsyTest, isFundusTest, isDermTest, isUrineTest,
} from './lib/specialImageLookup'
import { useSpeechInput } from './lib/useSpeechInput'
import { type GradingResult, type GradingInput } from './grading/types'
import { calcEfficiency } from './grading/efficiency'
import { gradeCase, type GradingUsageCallback } from './grading/grader'
import {
  type RawUsage, type APICallType, type ActiveSession,
  makeCallRecord, recordToSession, createActiveSession, finalizeSession,
  recordAbandonedSession,
} from './lib/analytics'

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

const PENDING_TESTS = new Set([
  'Blood Culture', 'Blood Cultures', 'Urine Culture', 'ANA', 'Anti-dsDNA', 'Complement Levels',
  'C3', 'C4', 'ANCA', 'SPEP', 'UPEP', 'Bone Marrow Biopsy', 'Flow Cytometry',
  'Hepatitis B Surface Antigen', 'Hepatitis C Antibody', 'HIV Antigen/Antibody',
  'RPR', 'Lyme Disease Antibody', 'Lyme Serology', 'EBV Antibody', 'CMV IgG/IgM',
  'QuantiFERON-TB Gold', 'QFT-TB', 'CSF Culture', 'Anti-CCP', 'Anti-PLA2R Antibody',
  '24-Hour Urine Protein', '24-Hour Urine Cortisol', 'ACTH Stimulation Test',
  'Genetic Panel', 'Chromosomal Microarray', 'Factor V Leiden', 'Prothrombin Gene Mutation',
  'Biopsy Pathology', 'Surgical Pathology', 'Tissue Pathology',
])
const PENDING_HOURS: Record<string, string> = {
  'Blood Culture': '48-72h', 'Blood Cultures': '48-72h', 'Urine Culture': '24-48h',
  'ANA': '24-48h', 'Anti-dsDNA': '24-48h', 'Complement Levels': '24h', 'C3': '24h', 'C4': '24h',
  'ANCA': '48-72h', 'SPEP': '24-48h', 'UPEP': '24-48h', 'Bone Marrow Biopsy': '5-7 days',
  'Flow Cytometry': '2-3 days', 'Hepatitis B Surface Antigen': '24h', 'Hepatitis C Antibody': '24h',
  'HIV Antigen/Antibody': '24h', 'RPR': '24h', 'Lyme Disease Antibody': '48-72h',
  'Lyme Serology': '48-72h', 'EBV Antibody': '48h', 'CMV IgG/IgM': '48h',
  'QuantiFERON-TB Gold': '48-72h', 'QFT-TB': '48-72h', 'CSF Culture': '48-72h',
  'Anti-CCP': '24-48h', 'Anti-PLA2R Antibody': '48-72h', '24-Hour Urine Protein': '24h',
  '24-Hour Urine Cortisol': '24-48h', 'ACTH Stimulation Test': '24h',
  'Biopsy Pathology': '3-5 days', 'Surgical Pathology': '2-4 days', 'Tissue Pathology': '3-5 days',
}
function isPendingTest(name: string): boolean {
  return PENDING_TESTS.has(name) ||
    [...PENDING_TESTS].some(p => name.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(name.toLowerCase()))
}
function pendingHours(name: string): string {
  return PENDING_HOURS[name] ?? [...Object.entries(PENDING_HOURS)].find(([k]) => name.toLowerCase().includes(k.toLowerCase()))?.[1] ?? '24-72h'
}

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

const SOAP_TEMPLATE = `SUBJECTIVE
Chief Complaint:
HPI:
PMH / Meds / Allergies / Social:

OBJECTIVE
Vitals:
Exam:
Labs / Imaging:

ASSESSMENT
Primary Dx:
Differentials:
Reasoning:

PLAN
Immediate:
Further workup:
Disposition: `

interface CaseData {
  patientInfo: { name: string; age: number; gender: string; chiefComplaint: string; height?: string; heightInches?: number }
  hpi: string
  vitals: { bp: string; hr: number; rr: number; temp: number; spo2: number; weight: string }
  pastMedicalHistory?: { conditions?: string; surgeries?: string; hospitalizations?: string }
  currentMedications?: { medications?: string; otc?: string }
  socialHistory?: { smoking?: string; alcohol?: string; drugs?: string; occupation?: string; living?: string; other?: string }
  reviewOfSystems: Record<string, string>
  physicalExam: Record<string, string>
  availableLabs: string[]
  availableImaging: string[]
  labGroups?: Array<{ name: string; tests: string[] }>
  labResults: Record<string, {
    components?: Array<{ name: string; value: string; unit: string; referenceRange: string; status: 'normal' | 'abnormal' | 'critical' }>
    result?: string; value?: string; unit?: string; referenceRange?: string; status?: string
  }>
  imagingResults: Record<string, string>
  procedureResults?: Record<string, string>
  hiddenHistory: {
    fullHistory: string
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
  imagingCategory?: string
  ecgFindings?: string
  hematologyFindings?: string
  urineFindings?: string
  skinFindings?: string
  fundusFindings?: string
  biopsyFindings?: string
  relevantTests?: Array<{
    name: string
    category: string
    isImaging: boolean
    labResult?: {
      components?: Array<{ name: string; value: string; unit: string; referenceRange: string; status: 'normal' | 'abnormal' | 'critical' }>
      result?: string; value?: string; unit?: string; referenceRange?: string; status?: string
    }
    imagingResult?: string
  }>
}

interface TimerState {
  totalSeconds: number
  remainingSeconds: number
  elapsedSeconds: number
  pausedSeconds: number
  status: 'idle' | 'running' | 'paused' | 'expired' | 'completed'
}

interface NotesState {
  mode: 'free' | 'soap'
  content: string
  open: boolean
}

interface CaseHistoryEntry {
  id: string
  date: string
  difficulty: string
  system: string
  diagnosis: string
  userDiagnosis: string
  correct: boolean
  score: number
}

const HISTORY_KEY = 'medtrainer_history'
function getHistory(): CaseHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as CaseHistoryEntry[] } catch { return [] }
}
function addHistoryEntry(entry: CaseHistoryEntry) {
  try {
    const h = getHistory(); h.unshift(entry); if (h.length > 50) h.splice(50)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
  } catch {}
}

const ROS_HINT_KEY = 'medtrainer_has_used_ros'
function hasUsedROSBefore(): boolean {
  try { return localStorage.getItem(ROS_HINT_KEY) === 'true' } catch { return false }
}
function markROSUsed(): void {
  try { localStorage.setItem(ROS_HINT_KEY, 'true') } catch {}
}

const USED_NAMES_KEY = 'medtrainer_used_names'
function getUsedNames(): string[] {
  try { return JSON.parse(localStorage.getItem(USED_NAMES_KEY) ?? '[]') as string[] } catch { return [] }
}
function recordUsedName(name: string) {
  try {
    const names = getUsedNames()
    if (!names.includes(name)) {
      names.push(name)
      if (names.length > 30) names.splice(0, names.length - 30)
      localStorage.setItem(USED_NAMES_KEY, JSON.stringify(names))
    }
  } catch {}
}

// ── Case library helpers ──────────────────────────────────────────────────────
const SEEN_CASES_KEY = 'medtrainer_seen_cases'
type LibraryEntry = { id: string; system: string; difficulty: string; diagnosis: string; variantIndex: number; patientName: string }

function getSeenCases(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_CASES_KEY) ?? '[]') as string[] } catch { return [] }
}
function markCaseSeen(id: string) {
  try {
    const seen = getSeenCases()
    if (!seen.includes(id)) {
      seen.push(id)
      if (seen.length > 200) seen.splice(0, seen.length - 200)
      localStorage.setItem(SEEN_CASES_KEY, JSON.stringify(seen))
    }
  } catch {}
}

let _libraryIndex: LibraryEntry[] | null = null
let _libraryFetchPromise: Promise<LibraryEntry[]> | null = null

async function fetchLibraryIndex(): Promise<LibraryEntry[]> {
  if (_libraryIndex !== null) return _libraryIndex
  if (_libraryFetchPromise) return _libraryFetchPromise
  _libraryFetchPromise = fetch('/cases/index.json')
    .then(r => r.ok ? r.json() as Promise<LibraryEntry[]> : Promise.resolve([]))
    .then(data => { _libraryIndex = data; return data })
    .catch(() => { _libraryIndex = []; return [] })
  return _libraryFetchPromise
}

async function loadFromLibrary(system: string, difficulty: string): Promise<CaseData | null> {
  try {
    const index = await fetchLibraryIndex()
    if (!index || index.length === 0) return null
    const seen = new Set(getSeenCases())
    const candidates = index.filter(e =>
      e.difficulty === difficulty &&
      (system === 'Any' || e.system === system) &&
      !seen.has(e.id)
    )
    if (candidates.length === 0) return null
    const entry = candidates[Math.floor(Math.random() * candidates.length)]
    const res = await fetch(`/cases/${entry.id}.json`)
    if (!res.ok) return null
    const caseData = await res.json() as CaseData
    markCaseSeen(entry.id)
    return caseData
  } catch {
    return null
  }
}

const DIFFICULTY_INFO: Record<string, string> = {
  Foundations: 'Foundations — Common textbook diagnoses, classic presentations, no timer. Output: diagnosis only.',
  Clinical:    'Clinical — Moderate diagnoses, 1-2 atypical features, 22-minute timer. Output: diagnosis + reasoning.',
  Advanced:    'Advanced — Rare/complex diagnoses, multiple red herrings, 15-minute timer. Output: SOAP note + oral presentation.',
}

const DIAGNOSIS_LIST: string[] = [
  // Cardiovascular
  'Acute coronary syndrome (ACS)', 'Acute decompensated heart failure', 'Aortic dissection',
  'Aortic regurgitation', 'Aortic stenosis', 'Atrial fibrillation', 'Atrial flutter',
  'Cardiac tamponade', 'Congestive heart failure (CHF)', 'Deep vein thrombosis (DVT)',
  'Dilated cardiomyopathy', 'Endocarditis (infective)', 'Heart block (first-degree)',
  'Heart block (second-degree, Mobitz II)', 'Heart block (third-degree, complete)',
  'Hypertensive emergency', 'Hypertensive urgency', 'Hypertrophic cardiomyopathy (HCM)',
  'Mitral regurgitation', 'Mitral stenosis', 'Myocarditis',
  'NSTEMI (Non-ST elevation myocardial infarction)', 'Pericarditis',
  'STEMI (ST-elevation myocardial infarction)', 'Stable angina',
  'Supraventricular tachycardia (SVT)', 'Unstable angina', 'Ventricular tachycardia (VT)',
  'Wolff-Parkinson-White syndrome',
  // Pulmonary
  'Acute respiratory distress syndrome (ARDS)', 'Asthma exacerbation', 'Bronchitis',
  'COPD exacerbation', 'Community-acquired pneumonia (CAP)', 'Hospital-acquired pneumonia',
  'Aspiration pneumonia', 'Interstitial lung disease', 'Lung cancer',
  'Obstructive sleep apnea', 'Pleural effusion', 'Pneumothorax (spontaneous)',
  'Pneumothorax (tension)', 'Pulmonary edema', 'Pulmonary embolism (PE)',
  'Pulmonary hypertension', 'Sarcoidosis',
  // Gastrointestinal
  'Acute liver failure', 'Appendicitis', 'Bowel obstruction (large bowel)',
  'Bowel obstruction (small bowel)', 'Cholangitis', 'Cholecystitis', 'Choledocholithiasis',
  'Cirrhosis', 'C. difficile colitis', 'Colon cancer', "Crohn's disease",
  'Diverticulitis', 'GERD', 'Gastric cancer', 'Gastritis', 'GI bleeding (lower)',
  'GI bleeding (upper)', 'Hepatic encephalopathy', 'Hepatitis A', 'Hepatitis B',
  'Hepatitis C', 'Intestinal ischemia', 'Irritable bowel syndrome (IBS)',
  'Mallory-Weiss tear', 'Pancreatitis (acute)', 'Pancreatitis (chronic)',
  'Peptic ulcer disease', 'Spontaneous bacterial peritonitis', 'Ulcerative colitis',
  'Esophageal variceal bleeding',
  // Neurologic
  "Bell's palsy", 'Brain abscess', 'Cauda equina syndrome', 'Encephalitis',
  'Epidural hematoma', 'Guillain-Barré syndrome', 'Hemorrhagic stroke',
  'Ischemic stroke (CVA)', 'Lumbar radiculopathy', 'Meningitis (bacterial)',
  'Meningitis (viral)', 'Migraine', 'Multiple sclerosis', 'Myasthenia gravis',
  'Normal pressure hydrocephalus', "Parkinson's disease", 'Seizure disorder / Epilepsy',
  'Status epilepticus', 'Subarachnoid hemorrhage (SAH)', 'Subdural hematoma',
  'Tension headache', 'TIA (transient ischemic attack)', "Wernicke's encephalopathy",
  // Renal / Urologic
  'Acute kidney injury (AKI)', 'Benign prostatic hyperplasia', 'Bladder cancer',
  'Chronic kidney disease (CKD)', 'Glomerulonephritis', 'IgA nephropathy',
  'Nephrolithiasis (kidney stones)', 'Nephrotic syndrome', 'Polycystic kidney disease',
  'Prostate cancer', 'Pyelonephritis', 'Renal cell carcinoma', 'UTI (uncomplicated)',
  // Endocrine / Metabolic
  'Adrenal crisis', "Cushing's syndrome", 'Diabetic ketoacidosis (DKA)',
  'Hyperaldosteronism', 'Hypercalcemia', 'Hyperkalemia', 'Hypernatremia',
  'Hyperosmolar hyperglycemic state (HHS)', 'Hyperthyroidism', 'Hypocalcemia',
  'Hypoglycemia', 'Hypokalemia', 'Hyponatremia', 'Hypothyroidism',
  'Metabolic acidosis', 'Metabolic alkalosis', 'Myxedema coma', 'Thyroid storm',
  'Type 1 diabetes mellitus', 'Type 2 diabetes mellitus',
  // Infectious
  'COVID-19', 'Cellulitis', 'Influenza', 'Lyme disease', 'Malaria',
  'MRSA skin infection', 'Necrotizing fasciitis', 'Osteomyelitis',
  'Sepsis', 'Septic arthritis', 'Septic shock', 'Skin abscess',
  'Tuberculosis (TB)', 'HIV / AIDS',
  // Hematology / Oncology
  'Anemia of chronic disease', 'DIC (disseminated intravascular coagulation)',
  'Hemolytic anemia', 'Hodgkin lymphoma', 'Iron deficiency anemia',
  'Leukemia (acute myeloid)', 'Leukemia (chronic lymphocytic)', 'Multiple myeloma',
  'Neutropenic fever', 'Non-Hodgkin lymphoma', 'Polycythemia vera',
  'Sickle cell crisis', 'Thrombocytopenia',
  'Thrombotic thrombocytopenic purpura (TTP)', 'Vitamin B12 deficiency anemia',
  // Musculoskeletal / Rheumatology
  'Ankylosing spondylitis', 'Fibromyalgia', 'Giant cell arteritis', 'Gout',
  'Hip fracture', 'Osteoarthritis', 'Polymyalgia rheumatica', 'Psoriatic arthritis',
  'Pseudogout', 'Rhabdomyolysis', 'Rheumatoid arthritis',
  'Systemic lupus erythematosus (SLE)', 'Vertebral compression fracture',
  // Psychiatric / Toxicology
  'Alcohol use disorder', 'Alcohol withdrawal', 'Bipolar disorder', 'Delirium',
  'Delirium tremens', "Dementia (Alzheimer's disease)", 'Generalized anxiety disorder',
  'Major depressive disorder', 'Neuroleptic malignant syndrome', 'Opioid overdose',
  'Panic disorder', 'Schizophrenia', 'Serotonin syndrome',
  // OB/GYN
  'Ectopic pregnancy', 'Eclampsia', 'HELLP syndrome', 'Ovarian torsion',
  'Pelvic inflammatory disease', 'Placental abruption', 'Preeclampsia',
  'Ruptured ovarian cyst',
  // Dermatology / Other
  'Basal cell carcinoma', 'Contact dermatitis', 'Herpes zoster (shingles)',
  'Melanoma', 'Squamous cell carcinoma', 'Stevens-Johnson syndrome',
  'Toxic epidermal necrolysis', 'Urticaria (hives)',
]

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
  maxTokens = 1000,
  onUsage?: (usage: RawUsage) => void
): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`)
  if (onUsage && data.usage) onUsage(data.usage as RawUsage)
  return data.content[0].text as string
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-4 bg-surface-1 p-5">
      <h2 className="mb-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

function Badge({ text, color = 'blue' }: { text: string; color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' }) {
  const colors = {
    blue:   'bg-insight-bg text-insight border-insight-border',
    green:  'bg-confirmed-bg text-confirmed border-confirmed-border',
    yellow: 'bg-caution-bg text-caution border-caution-border',
    red:    'bg-critical-bg text-critical border-critical-border',
    purple: 'bg-insight-bg text-insight border-insight-border',
  }
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${colors[color]}`}>
      {text}
    </span>
  )
}

function NotesResultPanel({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-yellow-900/50 bg-yellow-950/20">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-yellow-400">Your Case Notes</span>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-yellow-900/30 px-5 py-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-300">{content}</pre>
          <p className="mt-3 text-xs text-gray-500 italic border-t border-gray-800 pt-3">
            Compare your notes with the teaching points and differential discussion above to identify gaps in your reasoning.
          </p>
        </div>
      )}
    </div>
  )
}

function DiagnosisInput({ value, onChange, onKeyDown, disabled }: {
  value: string
  onChange: (val: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  const matches = value.trim().length >= 2
    ? DIAGNOSIS_LIST.filter(d => d.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectItem = (d: string) => { onChange(d); setOpen(false); setActiveIdx(-1) }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(-1) }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder="e.g., Community-acquired pneumonia"
        className="w-full rounded-md border border-surface-4 bg-surface-2 px-4 py-3 text-[15px] text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/20 transition-colors"
        onKeyDown={e => {
          if (open && matches.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, matches.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
            else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectItem(matches[activeIdx]) }
            else if (e.key === 'Escape') setOpen(false)
            else onKeyDown?.(e)
          } else onKeyDown?.(e)
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-surface-4 bg-surface-2 shadow-2xl">
          {matches.map((d, i) => (
            <button
              key={d}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectItem(d) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full px-4 py-2.5 text-left text-[13px] transition-colors ${i === activeIdx ? 'bg-primary-600/30 text-primary-100' : 'text-ink-primary hover:bg-surface-3'}`}
            >
              {d}
            </button>
          ))}
          <p className="border-t border-surface-4 px-4 py-1.5 text-[11px] text-ink-tertiary italic">
            Select or keep typing your own diagnosis
          </p>
        </div>
      )}
    </div>
  )
}

function MicButton({
  onTranscript,
  paused = false,
  className = '',
}: {
  onTranscript: (text: string) => void
  paused?: boolean
  className?: string
}) {
  const { listening, supported, startListening, stopListening } = useSpeechInput(onTranscript)

  useEffect(() => {
    if (paused && listening) stopListening()
  }, [paused, listening, stopListening])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={() => (listening ? stopListening() : startListening())}
      disabled={paused}
      title={listening ? 'Stop recording' : 'Dictate'}
      className={`flex-shrink-0 rounded-md border px-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        listening
          ? 'border-red-600 bg-red-900/30 text-red-400 animate-pulse'
          : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-500 hover:text-gray-300'
      } ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
      </svg>
    </button>
  )
}

function normalizeTestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')  // strip parenthetical abbreviations e.g. "(PT)"
    .replace(/[/\-]/g, ' ')            // treat slash and hyphen as word separators (e.g. "PT/INR" → "pt inr")
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const TEST_ALIASES: Array<[string[], string]> = [
  // ── Procedures ──
  [['ecg', 'ekg', 'electrocardiogram', '12 lead ecg', '12 lead ekg'], 'ECG'],
  [['upper endoscopy', 'egd', 'esophagogastroduodenoscopy', 'upper gi endoscopy', 'gastroscopy'], 'upper endoscopy'],
  [['colonoscopy', 'lower endoscopy', 'coloscopy'], 'colonoscopy'],
  [['bronchoscopy', 'flexible bronchoscopy'], 'bronchoscopy'],
  [['lumbar puncture', 'lp', 'spinal tap', 'csf analysis'], 'lumbar puncture'],
  [['bone marrow biopsy', 'bmb', 'bone marrow aspirate', 'bone marrow'], 'bone marrow biopsy'],
  [['renal biopsy', 'kidney biopsy'], 'renal biopsy'],
  [['liver biopsy', 'hepatic biopsy'], 'liver biopsy'],
  [['paracentesis', 'abdominal tap', 'ascites tap'], 'paracentesis'],
  [['thoracentesis', 'pleural tap', 'pleural fluid analysis'], 'thoracentesis'],
  [['arthrocentesis', 'joint aspiration', 'synovial fluid analysis', 'synovial fluid'], 'arthrocentesis'],
  // ── Cardiac biomarkers ──
  [['troponin', 'troponin i', 'troponin t', 'troponin i or t', 'high sensitivity troponin', 'hs troponin', 'hstroponin', 'cardiac troponin'], 'Troponin'],
  [['bnp', 'nt probnp', 'ntprobnp', 'brain natriuretic peptide', 'nt pro bnp'], 'BNP'],
  [['ck mb', 'ckmb', 'creatine kinase mb', 'creatine kinase myocardial band'], 'CK-MB'],
  // ── CBC / panels ──
  [['cbc', 'complete blood count', 'full blood count', 'hemogram', 'cbc with differential', 'cbc with diff'], 'CBC'],
  [['cmp', 'comprehensive metabolic panel', 'comprehensive metabolic'], 'CMP'],
  [['bmp', 'basic metabolic panel', 'basic metabolic', 'renal panel', 'electrolytes panel'], 'BMP'],
  [['hba1c', 'hemoglobin a1c', 'a1c', 'glycated hemoglobin', 'glycosylated hemoglobin'], 'HbA1c'],
  // ── Liver / metabolic ──
  [['lfts', 'lft', 'liver function tests', 'liver function', 'liver panel', 'hepatic panel', 'alt ast bilirubin'], 'LFTs'],
  [['ldh', 'lactate dehydrogenase', 'lactic dehydrogenase'], 'LDH'],
  [['lipase', 'amylase', 'lipase amylase', 'pancreatic enzymes', 'pancreatic panel'], 'Lipase/Amylase'],
  [['tsh', 'thyroid stimulating hormone', 'thyroid function test', 'thyroid screen'], 'TSH'],
  [['crp', 'c reactive protein', 'creactive protein', 'c-reactive protein'], 'CRP'],
  [['esr', 'erythrocyte sedimentation rate', 'sed rate', 'sedimentation rate', 'westergren'], 'ESR'],
  // ── Coagulation ──
  [['pt inr', 'pt', 'inr', 'prothrombin time', 'prothrombin time inr', 'coagulation pt', 'coags pt'], 'PT/INR'],
  [['ptt', 'aptt', 'partial thromboplastin time', 'activated partial thromboplastin time', 'coagulation ptt', 'coags ptt'], 'PTT'],
  [['d dimer', 'ddimer', 'fibrin degradation products', 'fibrin split products', 'fdp'], 'D-Dimer'],
  [['fibrinogen', 'clotting factor fibrinogen', 'plasma fibrinogen'], 'Fibrinogen'],
  // ── Immunology ──
  [['ana', 'antinuclear antibody', 'antinuclear ab', 'fana', 'fluorescent ana'], 'ANA'],
  [['rf', 'rheumatoid factor', 'ra factor', 'rheumatoid arthritis factor'], 'RF'],
  [['anca', 'canca', 'panca', 'c anca', 'p anca', 'antineutrophil cytoplasmic antibody', 'antineutrophil cytoplasmic ab'], 'ANCA'],
  [['anti ccp', 'anticcp', 'acpa', 'anti citrullinated protein', 'ccp antibody'], 'Anti-CCP'],
  [['complement', 'c3 c4', 'complement levels', 'complement c3 c4'], 'Complement'],
  // ── Urinalysis ──
  [['ua', 'urinalysis', 'urinalysis with microscopy', 'urine analysis', 'urine microscopy', 'urine dipstick', 'complete urinalysis'], 'UA'],
  [['urine culture', 'ucx', 'u cx', 'urine cx', 'uti culture', 'urine culture and sensitivity'], 'Urine Cx'],
  // ── Respiratory / Blood gas ──
  [['abg', 'arterial blood gas', 'blood gas', 'blood gases', 'arterial blood gases'], 'ABG'],
  [['pfts', 'spirometry', 'pulmonary function tests', 'pulmonary function', 'fev1 fvc', 'spirometry pfts'], 'PFTs'],
  // ── Imaging abbreviations ──
  [['cxr', 'chest xray', 'chest x ray', 'chest radiograph', 'chest radiography', 'pa lateral chest', 'pa and lateral'], 'CXR'],
  [['kub', 'abdominal xray', 'abdominal x ray', 'plain abdominal film', 'kidney ureter bladder'], 'KUB'],
  // ── Neurology ──
  [['eeg', 'electroencephalogram', 'electroencephalography', 'brain wave test'], 'EEG'],
  [['ncs', 'nerve conduction study', 'nerve conduction', 'nerve conduction velocity', 'ncv'], 'NCS'],
]

function findResultKey(orderedName: string, results: Record<string, unknown>): string | null {
  if (orderedName in results) return orderedName
  const normOrdered = normalizeTestName(orderedName)
  for (const key of Object.keys(results)) {
    if (normalizeTestName(key) === normOrdered) return key
  }
  for (const [aliases] of TEST_ALIASES) {
    if (aliases.includes(normOrdered)) {
      for (const key of Object.keys(results)) {
        if (aliases.includes(normalizeTestName(key))) return key
      }
    }
  }
  // Substring fallback: handles master-list names like "CT Chest without Contrast"
  // matching a case-generated key of "CT Chest"
  if (normOrdered.length >= 4) {
    for (const key of Object.keys(results)) {
      const normKey = normalizeTestName(key)
      if (normKey.length >= 4 && (normOrdered.includes(normKey) || normKey.includes(normOrdered))) return key
    }
  }
  return null
}

function getPanelSummary(components: Array<{ name: string; value: string; unit: string; referenceRange: string; status: string }>): string {
  const abnormal = components.filter(c => c.status === 'abnormal' || c.status === 'critical')
  if (abnormal.length === 0) return 'All values within normal limits'
  return abnormal
    .slice(0, 3)
    .map(c => `${c.name} ${c.value}${c.unit ? ' ' + c.unit : ''} (${c.status === 'critical' ? 'CRIT' : 'A'})`)
    .join(', ')
}

function isECGTest(name: string): boolean {
  const n = normalizeTestName(name)
  return n.includes('ecg') || n.includes('ekg') || n.includes('electrocardiogram')
}

function ECGPanel({ ecgFindings, aiReport, image, onZoom }: {
  ecgFindings?: string
  aiReport: string
  image: ECGImage | null | 'none'
  onZoom?: (src: string, alt: string) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const machineRead = ecgFindings ?? aiReport

  if (image === null) {
    return (
      <div className="bg-gray-900 px-4 py-5">
        <div className="mb-4 flex h-48 items-center justify-center rounded bg-gray-800 text-xs text-gray-600 animate-pulse">
          Loading ECG…
        </div>
        <p className="text-sm leading-relaxed text-gray-300">{machineRead}</p>
      </div>
    )
  }

  if (image === 'none') {
    return (
      <div className="bg-gray-900 px-4 py-4 space-y-2">
        <p className="text-sm leading-relaxed text-gray-300">{machineRead}</p>
        <p className="text-xs italic text-gray-500">
          Reference ECG image for this rhythm pattern is not yet in our library. Use the interpretation above to guide your reasoning.
        </p>
      </div>
    )
  }

  const isStemi = image.path.includes('/stemi/')
  return (
    <div className="bg-gray-900 px-4 py-4 space-y-3">
      <div
        className="overflow-hidden rounded border border-gray-700 cursor-zoom-in"
        onClick={() => onZoom?.(image.path, '12-lead ECG')}
        title="Click to enlarge"
      >
        <img
          src={image.path}
          alt="12-lead ECG"
          className="w-full max-h-[420px] object-contain bg-[#fafaf5]"
        />
      </div>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Machine Read</p>
          <p className="text-sm leading-relaxed text-gray-300">{machineRead}</p>
        </div>
        {isStemi && (
          <p className="text-xs text-yellow-600 italic">
            Note: PTB-XL dataset STEMI recordings may show varying acuity — some represent chronic or old MI patterns rather than hyperacute changes.
          </p>
        )}
        {image.report && (
          <div>
            <button
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
              onClick={() => setSourceOpen(v => !v)}
            >
              {sourceOpen ? 'Hide' : 'View'} original cardiologist report ↕
            </button>
            {sourceOpen && (
              <p className="mt-1 text-xs leading-relaxed text-gray-600 italic border-l-2 border-gray-700 pl-3">
                PTB-XL dataset report (original language preserved — may be German, Portuguese, or English): {image.report}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-700 border-t border-gray-800 pt-2">
        ECG image from{' '}
        <a
          href="https://physionet.org/content/ptb-xl/1.0.3/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-gray-400 transition-colors underline"
        >
          PTB-XL dataset (PhysioNet)
        </a>
        . Used for educational purposes.
      </div>
    </div>
  )
}

function ImagingPanel({ report, results }: {
  report: string
  results: OpenIResult[] | null
}) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setSelectedIdx(0)
    setImgError(false)
  }, [results])

  if (results === null) {
    return (
      <div className="bg-gray-900 px-4 py-5">
        <div className="mb-4 flex h-48 items-center justify-center rounded bg-gray-800 text-xs text-gray-600 animate-pulse">
          Loading imaging results…
        </div>
        <p className="text-sm leading-relaxed text-gray-300">{report}</p>
      </div>
    )
  }

  const nextIdx = (selectedIdx + 1) % results.length
  const selected = results[selectedIdx]

  if (!selected || imgError) {
    const canTryNext = results.length > 1
    return (
      <div className="bg-gray-900 px-4 py-4">
        {results.length > 0 && (
          <div className="mb-2 flex items-center gap-3">
            <p className="text-xs italic text-gray-600">Image failed to load.</p>
            {canTryNext && (
              <button
                onClick={() => { setSelectedIdx(nextIdx); setImgError(false) }}
                className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                Try next image →
              </button>
            )}
          </div>
        )}
        {results.length === 0 && (
          <p className="mb-2 text-xs italic text-gray-600">No representative image found. Narrative finding shown below.</p>
        )}
        <p className="text-sm leading-relaxed text-gray-300">{report}</p>
      </div>
    )
  }

  const others = results.filter((_, i) => i !== selectedIdx).slice(0, 4)

  return (
    <div className="bg-gray-900 px-4 py-4 space-y-3">
      <div className="overflow-hidden rounded bg-black">
        <img
          src={selected.imageUrl}
          alt={selected.caption}
          className="w-full max-h-96 object-contain"
          onError={() => setImgError(true)}
        />
      </div>
      {others.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1">
          {others.map(img => (
            <button
              key={img.uid}
              onClick={() => { setSelectedIdx(results.indexOf(img)); setImgError(false) }}
              className="h-14 w-14 flex-shrink-0 overflow-hidden rounded border border-gray-700 bg-black transition-colors hover:border-blue-500"
            >
              <img src={img.thumbnailUrl} alt={img.caption} className="h-full w-full object-cover opacity-70 transition-opacity hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-3">
          <span>Image courtesy of NIH Open-i / NLM</span>
          <a
            href={`https://openi.nlm.nih.gov/detailedresult?img=${selected.uid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 transition-colors hover:text-blue-400"
          >
            View source ↗
          </a>
        </div>
        {results.length > 1 && (
          <button
            onClick={() => { setSelectedIdx(nextIdx); setImgError(false) }}
            className="text-gray-500 hover:text-blue-400 transition-colors"
          >
            {selectedIdx + 1}/{results.length} — Try next →
          </button>
        )}
      </div>
      <p className="border-t border-gray-700 pt-3 text-sm leading-relaxed text-gray-300">{report}</p>
    </div>
  )
}

const SPECIAL_LABELS: Record<SpecialModality, string> = {
  smear:  'Peripheral Blood Smear',
  biopsy: 'H&E Biopsy',
  fundus: 'Fundoscopy',
  derm:   'Dermoscopy',
  urine:  'Urine Microscopy',
}

function SpecialPanel({ modality, report, image, findings, onZoom }: {
  modality: SpecialModality
  report: string
  image: SpecialImage | null | 'none'
  findings?: string
  onZoom?: (src: string, alt: string) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const displayText = findings ?? report

  if (image === null) {
    return (
      <div className="bg-gray-900 px-4 py-5">
        <div className="mb-4 flex h-48 items-center justify-center rounded bg-gray-800 text-xs text-gray-600 animate-pulse">
          Loading {SPECIAL_LABELS[modality]} image…
        </div>
        <p className="text-sm leading-relaxed text-gray-300">{displayText}</p>
      </div>
    )
  }

  if (image === 'none') {
    return (
      <div className="bg-gray-900 px-4 py-4 space-y-2">
        <p className="text-sm leading-relaxed text-gray-300">{displayText}</p>
        <p className="text-xs italic text-gray-500">
          Reference image for this finding is not yet in our library. Use the report above to guide your reasoning.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 px-4 py-4 space-y-3">
      <div
        className="overflow-hidden rounded border border-gray-700 bg-black cursor-zoom-in"
        onClick={() => onZoom?.(image.path, image.label || SPECIAL_LABELS[modality])}
        title="Click to enlarge"
      >
        <img
          src={image.path}
          alt={image.label || SPECIAL_LABELS[modality]}
          className="w-full max-h-[400px] object-contain"
        />
      </div>
      <div className="space-y-2">
        {image.source && (
          <button
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
            onClick={() => setSourceOpen(v => !v)}
          >
            {sourceOpen ? 'Hide' : 'View'} source attribution ↕
          </button>
        )}
        {sourceOpen && image.source && (
          <p className="text-xs leading-relaxed text-gray-600 italic border-l-2 border-gray-700 pl-3">
            {image.source}
          </p>
        )}
      </div>
      <p className="border-t border-gray-700 pt-3 text-sm leading-relaxed text-gray-300">{displayText}</p>
    </div>
  )
}

function useTimer(onExpire: () => void) {
  const [state, setState] = useState<TimerState>({
    totalSeconds: 0, remainingSeconds: 0, elapsedSeconds: 0, pausedSeconds: 0, status: 'idle',
  })
  const pauseStartRef = useRef<number>(0)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => {
      setState(prev => {
        if (prev.status !== 'running') return prev
        const newRemaining = prev.remainingSeconds - 1
        const newElapsed = prev.elapsedSeconds + 1
        if (newRemaining <= 0) return { ...prev, remainingSeconds: 0, elapsedSeconds: newElapsed, status: 'expired' }
        return { ...prev, remainingSeconds: newRemaining, elapsedSeconds: newElapsed }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state.status])

  useEffect(() => {
    if (state.status === 'expired') onExpireRef.current()
  }, [state.status])

  const startTimer = (diff: string) => {
    const total = diff === 'Clinical' ? 1320 : diff === 'Advanced' ? 900 : 0
    if (total === 0) return
    setState({ totalSeconds: total, remainingSeconds: total, elapsedSeconds: 0, pausedSeconds: 0, status: 'running' })
  }
  const pauseTimer = () => {
    pauseStartRef.current = Date.now()
    setState(prev => prev.status === 'running' ? { ...prev, status: 'paused' } : prev)
  }
  const resumeTimer = () => {
    setState(prev => {
      if (prev.status !== 'paused') return prev
      const added = Math.round((Date.now() - pauseStartRef.current) / 1000)
      return { ...prev, status: 'running', pausedSeconds: prev.pausedSeconds + added }
    })
  }
  const completeTimer = () => setState(prev => prev.status === 'running' || prev.status === 'paused' ? { ...prev, status: 'completed' } : prev)
  const resetTimer   = () => setState({ totalSeconds: 0, remainingSeconds: 0, elapsedSeconds: 0, pausedSeconds: 0, status: 'idle' })

  return { timerState: state, startTimer, pauseTimer, resumeTimer, completeTimer, resetTimer }
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Help system ───────────────────────────────────────────────────────────────

interface HelpSectionItem { heading: string; body: string }
interface HelpEntry { title: string; sections: HelpSectionItem[]; tip: string }

const HELP_CONTENT: Record<string, HelpEntry> = {
  hpi: {
    title: 'History of Present Illness',
    sections: [
      {
        heading: 'What\'s pre-revealed',
        body: 'Patient information and vitals are already displayed. You do not need to ask for them.',
      },
      {
        heading: 'Background history',
        body: 'Past medical history, medications, social history, and family history are locked. Ask the patient about relevant areas in the chat to unlock each field.',
      },
      {
        heading: 'How fields unlock',
        body: 'Fields reveal as you ask relevant questions. The more targeted your questions, the more efficiently the history comes together.',
      },
      {
        heading: 'Why it matters',
        body: 'The HPI sets the clinical context for everything that follows — diagnosis, test selection, and grading all reference back to this stage.',
      },
    ],
    tip: 'Note the chief complaint and vitals before asking any questions — they should guide what you ask first.',
  },
  ros: {
    title: 'Review of Systems',
    sections: [
      {
        heading: 'How ROS unlocks',
        body: 'Each system reveals when you ask the patient about symptoms in that category via the chat. Systems stay locked until you ask.',
      },
      {
        heading: 'Be selective, not exhaustive',
        body: 'Not every system needs review. Targeted questioning is scored higher than a rote checklist of every possible symptom.',
      },
      {
        heading: 'High-yield systems',
        body: 'Neurological and vascular symptoms are commonly missed but frequently change management. Prioritize these when they could be relevant to your working diagnosis.',
      },
    ],
    tip: 'Ask about symptoms that would change your management if present, not every possible symptom.',
  },
  exam: {
    title: 'Physical Examination',
    sections: [
      {
        heading: 'All findings pre-revealed',
        body: 'The complete physical exam is already displayed. No action is required — everything is available from the start.',
      },
      {
        heading: 'How to use it',
        body: 'Read carefully before ordering tests. Exam findings should confirm or challenge your working hypothesis from the HPI.',
      },
      {
        heading: 'What to look for',
        body: 'Vital sign trends, focal vs. diffuse findings, and lateralizing signs are the most diagnostically useful patterns.',
      },
    ],
    tip: 'The extremities and neurological sections contain the most discriminating findings in most cases.',
  },
  order: {
    title: 'Order Tests',
    sections: [
      {
        heading: 'For This Case section',
        body: 'The top section contains tests specifically relevant to this case and its comorbidities — check here before the standard panels.',
      },
      {
        heading: 'Standard panels',
        body: 'Common laboratory and imaging panels are organized below. Check anything that is clinically indicated.',
      },
      {
        heading: 'Scoring and penalties',
        body: 'You are penalized only for tests that are clearly unnecessary or contraindicated, not for reasonable clinical judgment calls.',
      },
      {
        heading: 'Custom tests',
        body: 'Use the free-text input for anything not in the standard panels — specific cultures, genetic tests, specialist studies, etc.',
      },
    ],
    tip: 'Order the confirmatory test for your working diagnosis plus the tests that would rule out your top differential.',
  },
  results: {
    title: 'Test Results',
    sections: [
      {
        heading: 'Reading results',
        body: 'Abnormal values are flagged. Radiology results appear as structured reports with Findings and Impression sections.',
      },
      {
        heading: 'Missing results',
        body: 'If a test returns no result, use the on-demand generate button to request it.',
      },
      {
        heading: 'Normal results matter',
        body: 'Normal results are clinically meaningful — they help narrow the differential just as much as abnormal ones.',
      },
    ],
    tip: 'A normal result that rules out a dangerous alternative diagnosis is as valuable as an abnormal one.',
  },
  diagnosis: {
    title: 'Diagnosis',
    sections: [
      {
        heading: 'Name the full entity',
        body: 'Your primary diagnosis should name the complete clinical entity — not just the condition, but the qualifier (e.g., "Acute traumatic hemarthrosis with ACL tear" not just "ACL tear").',
      },
      {
        heading: 'Clinical reasoning',
        body: 'Reference specific values from the history, exam, and labs in your reasoning. Vague reasoning scores poorly even when the diagnosis is correct.',
      },
      {
        heading: 'How you\'re graded',
        body: 'The rubric rewards targeted history, selective testing, accurate diagnosis, complete reasoning, and efficiency. Each dimension carries a fixed point weight.',
      },
    ],
    tip: 'Mention the pathognomonic finding explicitly in your reasoning — the grader looks for it.',
  },
}

function HelpModal({ section, onClose }: { section: string; onClose: () => void }) {
  const content = HELP_CONTENT[section]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!content) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-100">How to use: {content.title}</h2>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {content.sections.map(s => (
            <div key={s.heading}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-400">{s.heading}</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{s.body}</p>
            </div>
          ))}
          <div className="rounded-lg border border-blue-800/60 bg-blue-950/40 px-4 py-3">
            <div className="mb-1 text-xs font-semibold text-blue-400">Pro tip</div>
            <p className="text-sm text-blue-200 leading-relaxed">{content.tip}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

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
  const [gradingLoading, setGradingLoading] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const [caseDifficulty, setCaseDifficulty] = useState<string>('')
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set())
  const [rosState, setRosState] = useState<ROSState>(makeInitialROSState())
  const [userPresentation, setUserPresentation] = useState('')

  const [hpiUnlocked, setHpiUnlocked] = useState<Record<HPIField, boolean>>(makeInitialHPIFieldState())
  const [imagingCache, setImagingCache] = useState<Record<string, OpenIResult[] | null>>({})
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

  // True when a Clinical/Advanced case exists but the timer hasn't been started yet
  const locked = !caseStarted

  const recordApiCall = (type: APICallType, usage: RawUsage) => {
    const session = analyticsSessionRef.current
    if (!session) return
    recordToSession(session, makeCallRecord(type, usage))
  }

  const handleTimerExpire = useRef(() => {
    setTimedOutToast(true)
    setTimeout(() => {
      setTimedOutToast(false)
      timerExpireRef.current?.()
    }, 2000)
  })

  const { timerState, startTimer, pauseTimer, resumeTimer, completeTimer, resetTimer } = useTimer(handleTimerExpire.current)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const terminalInputRef = useRef<HTMLInputElement>(null)
  const prevSectionRef = useRef<string>(activeSection)

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
    if (!generating) { setGenerationPhase(0); return }
    const id = setInterval(() => {
      setGenerationPhase(p => Math.min(p + 1, GENERATION_PHASES.length - 1))
    }, 3000)
    return () => clearInterval(id)
  }, [generating])

  useEffect(() => {
    if (activeSection === 'diagnosis' && notes.content.trim()) {
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
        } catch {
          setImagingCache(prev => ({ ...prev, [t]: [] }))
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, caseData])

  useEffect(() => {
    if (activeSection !== 'results' || !caseData) return
    const orderedArr = Array.from(orderedTests)
    const ecgTests = orderedArr.filter(t =>
      findResultKey(t, caseData.imagingResults) !== null && isECGTest(t)
    )
    const toFetch = ecgTests.filter(t => !(t in ecgCache))
    if (toFetch.length === 0) return

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
          const image = await getRandomECGImage(category)
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
          const isLikelyImaging = /\b(x.?ray|xray|mri|ct\b|ultrasound|echo|scan|radiograph|pet|mibg|dexa|bone scan|doppler|angiograph)\b/i.test(testName)
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
        } finally {
          setGeneratingOnDemand(prev => { const n = new Set(prev); n.delete(testName); return n })
        }
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedTests, caseData])

  const generateCase = async (overrideSystem?: string, overrideDifficulty?: string): Promise<CaseData | null> => {
    setGenerationError(null)
    setGradingError(null)
    setGenerating(true)
    resetTimer()
    setCaseStarted(true)
    setCaseData(null)
    setOrderedTests(new Set())
    setSelectedTests(new Set())
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
    onDemandQueuedRef.current = new Set()
    setRosState(makeInitialROSState())
    setHpiUnlocked(makeInitialHPIFieldState())
    setImagingCache({})
    setEcgCache({})
    setSmearCache({})
    setBiopsyImgCache({})
    setFundusCache({})
    setDermCache({})
    setUrineImgCache({})

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

    // If a case was in progress, record it as abandoned before replacing the session
    if (analyticsSessionRef.current !== null) {
      recordAbandonedSession(analyticsSessionRef.current, activeSectionRef.current)
    }
    analyticsSessionRef.current = createActiveSession(resolvedSystem, resolvedDifficulty)

    const recentNames = getUsedNames()
    const namesClause = recentNames.length > 0
      ? `Do NOT use any of the following recently used names: ${recentNames.join(', ')}. Choose a name from a different ethnic/cultural background than the most recent entries to ensure diversity.`
      : 'Draw from a different ethnicity or country each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.).'

    const claudeSystem = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. ${namesClause} Never reuse first names or last names across cases.`

    const difficultyRules: Record<string, string> = {
      Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis
- Classic textbook symptom presentation
- No significant comorbidities
- Lab values clearly point toward diagnosis
- 1-2 obvious differentials
- Output required: Diagnosis only`,
      Clinical: `DIFFICULTY — CLINICAL:
- Moderate prevalence diagnosis
- DIAGNOSIS SCOPE: Must be a diagnosis a general internist, hospitalist, or emergency physician encounters regularly. DO NOT generate rare diseases (prevalence <1:10,000), subspecialty-only diagnoses, or conditions requiring fellowship-level expertise (e.g., antisynthetase syndrome, Erdheim-Chester disease, HLH, Castleman disease). Appropriate examples: community-acquired pneumonia, CHF exacerbation, DVT/PE, type 2 diabetes complication, UTI/pyelonephritis, appendicitis, cellulitis, migraine, hypertensive urgency, GERD, pancreatitis, asthma exacerbation, ACS, hepatitis.
- 1-2 atypical or missing classic features
- One comorbidity that adds complexity
- Some lab values are ambiguous or mildly misleading
- 3-4 differentials worth considering
- Output required: SOAP note + Diagnosis`,
      Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon or rare diagnosis (not multiple stacked rare conditions)
- Comorbidities must be common conditions (hypertension, diabetes, COPD, CKD, etc.) — never combine multiple rare diagnoses
- Atypical presentation with red herrings
- Lab/imaging findings require synthesis
- The case MUST contain at least one pathognomonic or definitively discriminating result that rules in the correct diagnosis over the top differential
- Must justify top 3 differentials with evidence
- Output required: SOAP note + Diagnosis + Differential justification`,
    }

    const hpiSpec =
      resolvedDifficulty === 'Foundations'
        ? '"<detailed 4-5 sentence HPI: onset, duration, character, radiation, associated symptoms, timing, exacerbating/relieving factors>"'
        : resolvedDifficulty === 'Clinical'
        ? '"<2-3 sentences ONLY. MAXIMUM 40 WORDS TOTAL. State age, sex, primary symptom, and duration. STOP THERE. Do NOT include associated symptoms, characterization, radiation, pertinent positives or negatives — all additional detail belongs in hiddenHistory.fullHistory>"'
        : '"<1-2 sentences ONLY. MAXIMUM 20 WORDS TOTAL. State age and sex. Include ONE non-specific symptom with NO duration or characterization. Add ONE misleading or incidental detail that does NOT point toward the primary diagnosis. Include nothing else>"'

    const prompt = `Generate a realistic ${resolvedSystem} clinical case. Strictly follow the difficulty rules below.

${difficultyRules[resolvedDifficulty] ?? difficultyRules['Foundations']}

Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component (e.g. CBC must expand into WBC, Hemoglobin, Hematocrit, Platelets, etc.). Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result. Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs — copy it character-for-character. Do NOT use abbreviations or shortened names as keys. For example if availableLabs contains "Prothrombin Time (PT) / INR", the labResults key must be "Prothrombin Time (PT) / INR" not "PT/INR" or "PT" or "Coagulation Panel".
CRITICAL: The lab/imaging results must include at least one finding that definitively confirms the correct diagnosis over its closest differential (e.g. for gout: monosodium urate crystals on synovial fluid; for PE: filling defect on CT-PA; for MI: ST elevation + troponin). Do not generate ambiguous results that leave the diagnosis unconfirmable from the data provided.
STEMI RULE: When the diagnosis is any form of STEMI (inferior, anterior, lateral, posterior, STEMI equivalent), the ecgFindings field MUST explicitly state the affected leads with millimeter elevation (e.g. "2mm ST elevation in leads II, III, and aVF with reciprocal ST depression in I and aVL, consistent with inferior STEMI"). Never write borderline or possible ST elevation for a STEMI diagnosis — the ECG must be unambiguously diagnostic.
AIN/DRUG-INDUCED NEPHRITIS RULE: When the diagnosis is Acute Interstitial Nephritis (AIN), drug-induced nephropathy, or similar medication-triggered renal injury, the causative agent (NSAID, antibiotic, PPI, etc.) MUST appear prominently in currentMedications.otc or currentMedications.medications with duration (e.g. "Ibuprofen 600mg TID × 3 weeks"). It must be listed as a recent or current medication, not just mentioned in passing.
FIBRILLARY GN EXCLUSION: Do NOT generate Fibrillary Glomerulonephritis as a diagnosis at any difficulty. For Advanced Renal cases, choose instead: IgA Nephropathy (Berger's Disease), Focal Segmental Glomerulosclerosis (FSGS), Membranous Nephropathy, ANCA-associated vasculitis, or Thrombotic Microangiopathy.
WHIPPLE'S BIOPSY RULE: When the diagnosis is Whipple's Disease (Tropheryma whipplei), "Upper Endoscopy (EGD) with Small Bowel Biopsy" MUST be included in availableImaging, and the procedureResults entry for it MUST explicitly describe PAS-positive macrophages with foamy cytoplasm distending the lamina propria — the pathognomonic histological finding without which the diagnosis cannot be confirmed.
CLL DISCRIMINATOR RULE: When the diagnosis is Chronic Lymphocytic Leukemia (CLL) or CLL with AIHA, "Flow Cytometry (Peripheral Blood)" MUST be included in availableLabs and its labResults MUST show CD5+/CD19+/CD23+ lymphocyte population — the immunophenotype that distinguishes CLL from PNH, lymphoma, and other B-cell malignancies.
WALDENSTRÖM DISCRIMINATOR RULE: When the diagnosis is Waldenström Macroglobulinemia, "Serum Protein Electrophoresis (SPEP) with Immunofixation" MUST be in availableLabs and its labResults MUST show an IgM monoclonal spike. The hiddenHistory.fullHistory or hiddenSymptoms MUST include at least one hyperviscosity symptom (blurred vision, headache, epistaxis, or neurological changes) to distinguish from Multiple Myeloma (which produces IgG/IgA, not IgM).
{
  "patientInfo": {
    "name": "First Last",
    "age": <number>,
    "gender": "Male or Female",
    "chiefComplaint": "<brief chief complaint>",
    "height": "<height in feet and inches e.g. 5'9\">",
    "heightInches": <total height in inches as integer e.g. 69>
  },
  "hpi": ${hpiSpec},
  "vitals": {
    "bp": "<systolic/diastolic mmHg>",
    "hr": <beats per minute>,
    "rr": <breaths per minute>,
    "temp": <Fahrenheit decimal>,
    "spo2": <percent integer>,
    "weight": "<lbs>"
  },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", "<dx 3>", "<dx 4>", "<dx 5>"],
  "keyQuestions": [
    "<important question the physician should have asked the patient>",
    "<important question>",
    "<important question>",
    "<important question>",
    "<important question>"
  ],
  "teachingPoints": ["<clinical pearl 1>", "<clinical pearl 2>", "<clinical pearl 3>", "<clinical pearl 4>"],
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
  "hematologyFindings": "<If peripheral blood smear is clinically relevant, describe what it shows — e.g. 'Parasitized RBCs with ring forms visible, consistent with Plasmodium falciparum.' or 'Microcytic hypochromic red cells with target cells, consistent with iron deficiency anemia.' Omit or leave blank if not relevant to the case.>",
  "urineFindings": "<If urinalysis or urine microscopy is clinically relevant, describe the microscopy findings — e.g. 'WBCs and bacteria visible; leukocyte esterase positive. Consistent with UTI.' or 'RBC casts present; dysmorphic RBCs noted. Consistent with glomerulonephritis.' Omit or leave blank if not relevant.>",
  "skinFindings": "<If a skin lesion or biopsy is relevant, describe the dermoscopic appearance — e.g. 'Irregular border with atypical pigment network and regression areas, concerning for melanoma.' Omit or leave blank if not relevant.>",
  "fundusFindings": "<If ophthalmoscopy or fundoscopy is relevant, describe fundus findings — e.g. 'Bilateral flame hemorrhages, disc swelling, and AV nicking consistent with hypertensive retinopathy.' or 'Increased cup-to-disc ratio >0.7 with superior rim thinning, suspicious for glaucoma.' Omit or leave blank if not relevant.>",
  "biopsyFindings": "<If histopathology (H&E biopsy) is relevant, describe what the pathology shows — e.g. 'Dysplastic glandular epithelium with nuclear pleomorphism and cribriform architecture, consistent with adenocarcinoma.' Omit or leave blank if not relevant.>",
  "pastMedicalHistory": {
    "conditions": "<chronic diagnoses and health problems, or 'None'>",
    "surgeries": "<prior surgeries and procedures, or 'None'>",
    "hospitalizations": "<prior hospitalizations and ER visits, or 'None'>"
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
      // Try the pre-generated library first — instant load, no API cost
      const libraryCase = await loadFromLibrary(resolvedSystem, resolvedDifficulty)
      if (libraryCase) {
        if (libraryCase.patientInfo?.name) recordUsedName(libraryCase.patientInfo.name)
        setCaseData(libraryCase)
        setCaseStarted(resolvedDifficulty === 'Foundations')
        return libraryCase
      }

      // Fall back to live Claude generation
      const text = await callClaude(claudeSystem, [{ role: 'user', content: prompt }], 12000,
        (u) => recordApiCall('generation', u))
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response')
      const parsed = JSON.parse(match[0]) as CaseData

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
      setCaseData(parsed)
      setCaseStarted(resolvedDifficulty === 'Foundations')
      return parsed
    } catch (e) {
      console.error('Case generation failed:', e)
      setGenerationError(
        e instanceof Error && e.message.includes('429')
          ? 'API rate limit reached. Wait a moment and try again.'
          : 'Failed to generate case. Check your connection and try again.'
      )
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

What you have told them so far: ${caseData.hpi}${fullHistorySection}

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
    const backgroundHistory = backgroundParts.length ? backgroundParts.join('\n') : '(none recorded)'

    const reasoningText = (overridePresentation !== undefined ? overridePresentation : userPresentation).trim()

    const gradingInput: GradingInput = {
      patientInfo: `${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"`,
      hpi: caseData.hpi,
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
      timedOut,
    }

    const gradingUsageCb: GradingUsageCallback = (type, usage) => recordApiCall(type, usage)

    try {
      const result = await gradeCase(gradingInput, gradingUsageCb)

      // Merge client-side efficiency score (not sent to AI)
      if (caseDifficulty !== 'Foundations' && timerState.status !== 'idle') {
        const eff = calcEfficiency(caseDifficulty, timerState.remainingSeconds, timedOut)
        if (eff.feedback) {
          result.efficiency = {
            score: eff.score,
            feedback: eff.feedback,
            elapsedSeconds: timerState.elapsedSeconds,
            pausedSeconds: timerState.pausedSeconds,
            timedOut,
          }
          result.score = (result.score ?? 0) + eff.score
        }
      }

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
        finalizeSession(analyticsSessionRef.current, {
          diagnosis: caseData.diagnosis,
          userDiagnosis: diagnosisToGrade,
          correct: result.correct ?? false,
          score: result.score ?? 0,
          gradingResult: result,
        })
        analyticsSessionRef.current = null
      }

      setGradingResult(result)
      return result
    } catch {
      setGradingError('Grading failed. Please try again.')
      return null
    } finally {
      setGradingLoading(false)
    }
  }

  // Wire the expire callback so it can call submitDiagnosis (defined above)
  timerExpireRef.current = () => submitDiagnosis('Time expired', '', true)

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
      case 'hpi': {
        const weightLbs = parseFloat(caseData.vitals.weight)
        const heightIn = caseData.patientInfo.heightInches
        const bmi = heightIn && !isNaN(weightLbs) && heightIn > 0
          ? Math.round((weightLbs / (heightIn * heightIn)) * 703 * 10) / 10
          : null
        const bmiLabel = bmi === null ? null
          : bmi < 18.5 ? 'Underweight'
          : bmi < 25 ? 'Normal'
          : bmi < 30 ? 'Overweight'
          : 'Obese'
        const bmiColor = bmi === null ? '' : bmi < 18.5 ? 'text-blue-400' : bmi < 25 ? 'text-green-400' : bmi < 30 ? 'text-yellow-400' : 'text-red-400'

        const isGatedHPI = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'

        const bgGroups = [
          {
            key: 'pmh', label: 'Past Medical History',
            fields: [
              { field: 'pmh_conditions' as HPIField, label: 'Conditions', value: caseData.pastMedicalHistory?.conditions },
              { field: 'pmh_surgeries' as HPIField, label: 'Surgeries', value: caseData.pastMedicalHistory?.surgeries },
              { field: 'pmh_hospitalizations' as HPIField, label: 'Hospitalizations', value: caseData.pastMedicalHistory?.hospitalizations },
            ],
          },
          {
            key: 'med', label: 'Current Medications',
            fields: [
              { field: 'med_medications' as HPIField, label: 'Rx', value: caseData.currentMedications?.medications },
              { field: 'med_otc' as HPIField, label: 'OTC / Supplements', value: caseData.currentMedications?.otc },
            ],
          },
          {
            key: 'soc', label: 'Social History',
            fields: [
              { field: 'soc_smoking' as HPIField, label: 'Smoking', value: caseData.socialHistory?.smoking },
              { field: 'soc_alcohol' as HPIField, label: 'Alcohol', value: caseData.socialHistory?.alcohol },
              { field: 'soc_drugs' as HPIField, label: 'Drugs', value: caseData.socialHistory?.drugs },
              { field: 'soc_occupation' as HPIField, label: 'Occupation', value: caseData.socialHistory?.occupation },
              { field: 'soc_living' as HPIField, label: 'Living', value: caseData.socialHistory?.living },
              { field: 'soc_other' as HPIField, label: 'Other', value: caseData.socialHistory?.other },
            ],
          },
        ]
        const totalBgFields = bgGroups.reduce((s, g) => s + g.fields.length, 0)
        const unlockedHPICount = isGatedHPI
          ? Object.values(hpiUnlocked).filter(Boolean).length
          : totalBgFields

        return (
          <div className="space-y-4">
            {!caseStarted && (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && (
              <div className="rounded-lg border border-insight-border bg-insight-bg px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-insight">
                    Timer not started — {caseDifficulty === 'Clinical' ? '22 minutes' : '15 minutes'} allotted
                  </p>
                  <p className="text-[11px] text-insight/70 mt-0.5">Read the case first. Start the timer when you are ready to begin the clinical encounter.</p>
                </div>
                <button
                  onClick={() => { startTimer(caseDifficulty); setCaseStarted(true); setTimeout(() => chatInputRef.current?.focus(), 50) }}
                  className="flex-shrink-0 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-primary-400 transition-colors"
                >
                  Start Timer
                </button>
              </div>
            )}
            <SectionCard title="Patient Information">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Name', caseData.patientInfo.name],
                  ['Age', `${caseData.patientInfo.age} years`],
                  ['Gender', caseData.patientInfo.gender],
                  ['Chief Complaint', caseData.patientInfo.chiefComplaint],
                  ...(caseData.patientInfo.height ? [['Height', caseData.patientInfo.height]] : []),
                  ...(bmi !== null ? [['BMI', `${bmi} — ${bmiLabel}`]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-surface-2 p-3">
                    <div className="text-[11px] text-ink-tertiary uppercase tracking-wider mb-1">{label}</div>
                    <div className={`text-sm font-medium ${label === 'BMI' ? bmiColor : 'text-ink-primary'}`}>{value}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
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
                  const isAbnormal = (() => {
                    if (label === 'HR')   return Number(value) > 100 || Number(value) < 60
                    if (label === 'RR')   return Number(value) > 20  || Number(value) < 12
                    if (label === 'Temp') return Number(value) > 99.5 || Number(value) < 97
                    if (label === 'SpO₂') return Number(value) < 95
                    if (label === 'BP') {
                      const parts = value.replace(/[^\d/]/g, '').split('/')
                      const sys = parseInt(parts[0] ?? '')
                      const dia = parseInt(parts[1] ?? '')
                      return !isNaN(sys) && !isNaN(dia) && (sys > 139 || sys < 90 || dia > 89 || dia < 60)
                    }
                    return false
                  })()
                  return (
                    <div key={label} className={`rounded-lg p-4 text-center font-mono ${isAbnormal ? 'bg-critical-bg border border-critical-border' : 'bg-surface-2'}`}>
                      <div className="text-[11px] text-ink-tertiary uppercase tracking-wider mb-1">{label}</div>
                      <div className={`text-2xl font-bold tabular-nums ${isAbnormal ? 'text-critical' : 'text-ink-primary'}`}>{value}</div>
                      {unit && <div className="text-[11px] text-ink-tertiary mt-0.5">{unit}</div>}
                    </div>
                  )
                })}
              </div>
            </SectionCard>
            <SectionCard title="History of Present Illness">
              <p className="font-serif text-[15px] leading-relaxed text-ink-primary max-w-[70ch]">{caseData.hpi}</p>
            </SectionCard>
            {(caseData.pastMedicalHistory || caseData.currentMedications || caseData.socialHistory) && (
              <SectionCard title="Background History">
                {isGatedHPI && (
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{unlockedHPICount} / {totalBgFields} background fields reviewed</span>
                    {unlockedHPICount === 0 && (
                      <span className="text-xs text-gray-600 italic">Ask the patient about their history to reveal fields</span>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {bgGroups.map(({ key, label, fields }) => (
                    <div key={key} className="rounded-md bg-surface-2 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-400 mb-2">{label}</div>
                      <div className="space-y-1.5">
                        {fields.map(({ field, label: fLabel, value }) => {
                          const unlocked = !isGatedHPI || hpiUnlocked[field]
                          return (
                            <div key={field} className="flex gap-2">
                              <span className="text-[11px] text-ink-tertiary uppercase tracking-wide w-32 flex-shrink-0 pt-0.5">{fLabel}</span>
                              {unlocked ? (
                                <span className="text-[13px] text-ink-primary">{value ?? 'None documented.'}</span>
                              ) : (
                                <span className="text-ink-tertiary/40 text-sm select-none">—</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )
      }

      case 'ros': {
        const isGatedDifficulty = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'
        if (isGatedDifficulty) {
          const unlockedCount = ROS_CATEGORIES.filter(c => rosState[c].status !== 'locked').length
          return (
            <SectionCard title="Review of Systems">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {unlockedCount} / {ROS_CATEGORIES.length} systems reviewed
                </span>
                {unlockedCount === 0 && (
                  <span className="text-xs text-gray-600 italic">Ask the patient about each system to reveal findings</span>
                )}
              </div>
              <div className="space-y-1.5">
                {ROS_CATEGORIES.map(cat => {
                  const entry = rosState[cat]
                  const isLocked = entry.status === 'locked'
                  const isPositive = entry.status === 'positive'
                  return (
                    <div
                      key={cat}
                      className={`flex gap-3 rounded-md px-3 py-2.5 ${
                        isLocked
                          ? 'bg-gray-900/40'
                          : isPositive
                          ? 'bg-yellow-950/30 border border-yellow-900/50'
                          : 'bg-gray-900'
                      }`}
                    >
                      <span className={`w-44 flex-shrink-0 text-xs font-semibold uppercase tracking-wide pt-0.5 ${
                        isLocked ? 'text-gray-600' : isPositive ? 'text-yellow-400' : 'text-blue-400'
                      }`}>
                        {cat}
                      </span>
                      {isLocked ? (
                        <span className="text-gray-600 text-sm select-none">—</span>
                      ) : entry.derivedFinding === undefined ? (
                        <span className="text-xs text-gray-500 italic">Recording…</span>
                      ) : !gradingResult ? (
                        <span className={`text-sm leading-relaxed ${isPositive ? 'text-yellow-100' : 'text-gray-400'}`}>
                          {entry.derivedFinding}
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className={`text-sm leading-relaxed ${isPositive ? 'text-yellow-100' : 'text-gray-300'}`}>
                            {entry.derivedFinding}
                          </span>
                          <span className="text-xs text-gray-500 italic leading-relaxed">
                            <span className="not-italic text-gray-600 uppercase tracking-wide mr-1">Full:</span>
                            {entry.finding}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )
        }
        return (
          <SectionCard title="Review of Systems">
            <div className="space-y-1.5">
              {Object.entries(caseData.reviewOfSystems).map(([cat, findings]) => (
                <div key={cat} className="flex gap-3 rounded-md bg-gray-900 px-3 py-2.5">
                  <span className="w-44 flex-shrink-0 text-xs font-semibold text-blue-400 uppercase tracking-wide pt-0.5">{cat}</span>
                  <span className="text-sm text-gray-300">{findings}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )
      }

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
        // ── FOUNDATIONS: curated checklist (unchanged) ──
        if (caseDifficulty === 'Foundations') {
          const allOrdered = (name: string) => orderedTests.has(name)
          return (
            <div className="space-y-4">
              <SectionCard title="Laboratory Studies">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {caseData.availableLabs.map(lab => {
                    const isOrdered = allOrdered(lab)
                    const isSelected = selectedTests.has(lab)
                    return (
                      <label key={lab} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${isOrdered ? 'border-green-700 bg-green-900/20 cursor-default' : isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>
                        <input type="checkbox" checked={isSelected || isOrdered} disabled={isOrdered} onChange={() => !isOrdered && toggleTest(lab)} className="accent-blue-500" />
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
                      <label key={img} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${isOrdered ? 'border-green-700 bg-green-900/20 cursor-default' : isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>
                        <input type="checkbox" checked={isSelected || isOrdered} disabled={isOrdered} onChange={() => !isOrdered && toggleTest(img)} className="accent-blue-500" />
                        <span className="text-sm text-gray-200">{img}</span>
                        {isOrdered && <Badge text="Ordered" color="green" />}
                      </label>
                    )
                  })}
                </div>
              </SectionCard>
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
                <p className="text-xs text-gray-400 mb-2">Order a custom test not listed above:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTestInput}
                    onChange={e => setCustomTestInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') orderCustomTest() }}
                    placeholder="e.g. Factor VIII Activity, Knee MRI..."
                    className="flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button onClick={orderCustomTest} disabled={!customTestInput.trim()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">
                    Order
                  </button>
                </div>
              </div>
              {selectedTests.size > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-blue-700 bg-blue-900/20 px-4 py-3">
                  <span className="text-sm text-blue-300">{selectedTests.size} test{selectedTests.size > 1 ? 's' : ''} selected</span>
                  <button onClick={orderTests} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
                    Order Selected Tests
                  </button>
                </div>
              )}
            </div>
          )
        }

        // ── CLINICAL: curated case tests + master-list search ──
        if (caseDifficulty === 'Clinical') {
          const orderedList = Array.from(orderedTests)
          const caseSpecificTests = (caseData.relevantTests ?? [])
            .filter(rt => !MASTER_TEST_LIST.some(m => m.name === rt.name))
            .map(rt => ({ name: rt.name, abbreviations: [] as string[], synonyms: [] as string[], category: rt.category }))
          const combinedTestList = [...MASTER_TEST_LIST, ...caseSpecificTests]
          const searchResults = testSearchQuery.length >= 2 ? searchTests(testSearchQuery, combinedTestList) : []
          // Only show search results that aren't already in the curated case lists
          const caseTestSet = new Set([...caseData.availableLabs, ...caseData.availableImaging])
          const extraSearchResults = searchResults.filter(r => !caseTestSet.has(r.name))

          return (
            <div className="space-y-4">

              {/* Search bar — finds any test from the master list */}
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={testSearchQuery}
                  onChange={e => { setTestSearchQuery(e.target.value); setShowSearchDropdown(true) }}
                  onFocus={() => setShowSearchDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSearchDropdown(false), 150)}
                  disabled={locked}
                  placeholder={locked ? 'Start the timer to order tests' : 'Search for any additional test or study…'}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 py-2.5 pl-9 pr-4 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {testSearchQuery && (
                  <button
                    onMouseDown={() => { setTestSearchQuery(''); setShowSearchDropdown(false) }}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-300"
                  >
                    ✕
                  </button>
                )}
                {/* Master-list search dropdown */}
                {showSearchDropdown && extraSearchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {extraSearchResults.slice(0, 10).map(result => {
                      const isOrdered = orderedTests.has(result.name)
                      return (
                        <button
                          key={result.name}
                          onMouseDown={() => {
                            if (!isOrdered && !locked) {
                              addOrderedTest(result.name)
                              setTestSearchQuery('')
                            }
                          }}
                          disabled={isOrdered || locked}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${isOrdered ? 'opacity-50 cursor-default bg-gray-800' : 'hover:bg-gray-700 cursor-pointer'}`}
                        >
                          <span className="text-gray-200">{result.name}</span>
                          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                            {isOrdered ? <Badge text="Ordered" color="green" /> : result.category}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {showSearchDropdown && testSearchQuery.length >= 2 && extraSearchResults.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 shadow-xl overflow-hidden">
                    <button
                      onMouseDown={() => {
                        const name = testSearchQuery.trim()
                        if (name && !locked) { addOrderedTest(name); setTestSearchQuery(''); setShowSearchDropdown(false) }
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-700 transition-colors"
                    >
                      <span className="text-gray-200">Order &ldquo;{testSearchQuery.trim()}&rdquo;</span>
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0">custom</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Curated labs for this case */}
              <SectionCard title="Laboratory Studies">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {caseData.availableLabs.map(lab => {
                    const isOrdered = orderedTests.has(lab)
                    const isSelected = selectedTests.has(lab)
                    return (
                      <label key={lab} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${isOrdered ? 'border-green-700 bg-green-900/20 cursor-default' : locked ? 'border-gray-700 bg-gray-800 opacity-50 cursor-not-allowed' : isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>
                        <input type="checkbox" checked={isSelected || isOrdered} disabled={isOrdered || locked} onChange={() => !isOrdered && !locked && toggleTest(lab)} className="accent-blue-500" />
                        <span className="text-sm text-gray-200">{lab}</span>
                        {isOrdered && <Badge text="Ordered" color="green" />}
                      </label>
                    )
                  })}
                </div>
              </SectionCard>

              {/* Curated imaging for this case */}
              <SectionCard title="Imaging Studies">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {caseData.availableImaging.map(img => {
                    const isOrdered = orderedTests.has(img)
                    const isSelected = selectedTests.has(img)
                    return (
                      <label key={img} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${isOrdered ? 'border-green-700 bg-green-900/20 cursor-default' : locked ? 'border-gray-700 bg-gray-800 opacity-50 cursor-not-allowed' : isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>
                        <input type="checkbox" checked={isSelected || isOrdered} disabled={isOrdered || locked} onChange={() => !isOrdered && !locked && toggleTest(img)} className="accent-blue-500" />
                        <span className="text-sm text-gray-200">{img}</span>
                        {isOrdered && <Badge text="Ordered" color="green" />}
                      </label>
                    )
                  })}
                </div>
              </SectionCard>

              {/* Order button */}
              {selectedTests.size > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-blue-700 bg-blue-900/20 px-4 py-3">
                  <span className="text-sm text-blue-300">{selectedTests.size} test{selectedTests.size > 1 ? 's' : ''} selected</span>
                  <button onClick={orderTests} disabled={locked} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">
                    Order Selected Tests
                  </button>
                </div>
              )}

              {/* Ordered tests */}
              {orderedList.length > 0 && (
                <SectionCard title={`Ordered Tests (${orderedList.length})`}>
                  <div className="flex flex-wrap gap-2">
                    {orderedList.map(t => (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-md border border-green-700 bg-green-900/20 px-2.5 py-1 text-xs text-green-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )
        }

        // ── ADVANCED: free-text search ──
        // Include relevantTests (specialty tests pre-generated for this case) as searchable items
        const caseSpecificTests = (caseData.relevantTests ?? [])
          .filter(rt => !MASTER_TEST_LIST.some(m => m.name === rt.name))
          .map(rt => ({ name: rt.name, abbreviations: [] as string[], synonyms: [] as string[], category: rt.category }))
        const combinedTestList = [...MASTER_TEST_LIST, ...caseSpecificTests]
        const searchResults = searchTests(testSearchQuery, combinedTestList)
        const orderedList = Array.from(orderedTests)
        return (
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={testSearchQuery}
                onChange={e => { setTestSearchQuery(e.target.value); setShowSearchDropdown(true) }}
                onFocus={() => setShowSearchDropdown(true)}
                onBlur={() => setTimeout(() => setShowSearchDropdown(false), 150)}
                disabled={locked}
                placeholder={locked ? 'Start the timer to order tests' : 'Search for a test or study...'}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 shadow-xl overflow-hidden">
                  {searchResults.map(result => {
                    const isOrdered = orderedTests.has(result.name)
                    return (
                      <button
                        key={result.name}
                        onMouseDown={() => {
                          if (!isOrdered && !locked) {
                            addOrderedTest(result.name)
                            setTestSearchQuery('')
                          }
                        }}
                        disabled={isOrdered || locked}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${isOrdered ? 'opacity-50 cursor-default bg-gray-800' : 'hover:bg-gray-700 cursor-pointer'}`}
                      >
                        <span className="text-gray-200">{result.name}</span>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {isOrdered ? <Badge text="Ordered" color="green" /> : result.category}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {showSearchDropdown && testSearchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 shadow-xl overflow-hidden">
                  <button
                    onMouseDown={() => {
                      const name = testSearchQuery.trim()
                      if (name && !locked) {
                        addOrderedTest(name)
                        setTestSearchQuery('')
                        setShowSearchDropdown(false)
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-gray-200">Order &ldquo;{testSearchQuery.trim()}&rdquo;</span>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">custom</span>
                  </button>
                </div>
              )}
            </div>

            {orderedList.length > 0 ? (
              <SectionCard title={`Ordered Tests (${orderedList.length})`}>
                <div className="space-y-2">
                  {orderedList.map(t => (
                    <div key={t} className="flex items-center justify-between rounded-md border border-gray-700 bg-gray-900 px-3 py-2">
                      <span className="text-sm text-gray-200">{t}</span>
                      <button onClick={() => removeOrderedTest(t)} className="text-gray-500 hover:text-red-400 text-xs transition-colors ml-3 flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                <p className="text-sm">No tests ordered yet.</p>
                <p className="text-xs mt-1">Search for a test above to add it.</p>
              </div>
            )}
          </div>
        )
      }

      case 'results': {
        const orderedArr = Array.from(orderedTests)
        const orderedLabs = orderedArr.filter(t => findResultKey(t, caseData.labResults) !== null)
        const orderedImaging = orderedArr.filter(t => findResultKey(t, caseData.imagingResults) !== null)
        const orderedProcedures = orderedArr.filter(t =>
          caseData.procedureResults != null && findResultKey(t, caseData.procedureResults) !== null
        )
        const pendingLabs = orderedArr.filter(t =>
          findResultKey(t, caseData.labResults) === null &&
          findResultKey(t, caseData.imagingResults) === null &&
          (caseData.procedureResults == null || findResultKey(t, caseData.procedureResults) === null) &&
          isPendingTest(t)
        )
        const loadingOnDemand = orderedArr.filter(t => generatingOnDemand.has(t))
        const diagnosisSubmitted = !!gradingResult

        orderedArr.forEach(t => {
          if (findResultKey(t, caseData.labResults) === null &&
              findResultKey(t, caseData.imagingResults) === null &&
              (caseData.procedureResults == null || findResultKey(t, caseData.procedureResults) === null) &&
              !isPendingTest(t) &&
              !generatingOnDemand.has(t)) {
            console.error(`[MedTrainer] No result found for ordered test: "${t}" (not in labResults, imagingResults, procedureResults, pendingTests, or generatingOnDemand)`)
          }
        })

        const allResultPanels = [...orderedLabs, ...orderedImaging, ...orderedProcedures]
        const allCollapsed = allResultPanels.length > 0 && allResultPanels.every(p => collapsedPanels.has(p))
        const toggleAllPanels = () => {
          setCollapsedPanels(allCollapsed ? new Set() : new Set(allResultPanels))
        }
        const togglePanel = (name: string) => {
          setCollapsedPanels(prev => {
            const next = new Set(prev)
            next.has(name) ? next.delete(name) : next.add(name)
            return next
          })
        }

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
            {allResultPanels.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={toggleAllPanels}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {allCollapsed ? 'Expand all' : 'Collapse all'}
                </button>
              </div>
            )}
            {(orderedLabs.length > 0 || pendingLabs.length > 0 || loadingOnDemand.length > 0) && (
              <SectionCard title="Laboratory Results">
                <div className="space-y-2">
                  {orderedLabs.map(lab => {
                    const key = findResultKey(lab, caseData.labResults)!
                    const raw = caseData.labResults[key]
                    const components: Array<{ name: string; value: string; unit: string; referenceRange: string; status: string }> =
                      Array.isArray(raw?.components) && raw.components.length > 0
                        ? raw.components
                        : raw?.value
                          ? [{ name: lab, value: raw.value, unit: raw.unit ?? '', referenceRange: raw.referenceRange ?? '—', status: raw.status ?? 'normal' }]
                          : raw?.result
                            ? [{ name: lab, value: raw.result, unit: '', referenceRange: raw.referenceRange ?? '—', status: raw.status ?? 'normal' }]
                            : []
                    const panelAbnormal = components.some(c => c.status === 'abnormal' || c.status === 'critical')
                    const isCollapsed = collapsedPanels.has(lab)
                    const summary = getPanelSummary(components)
                    return (
                      <div key={lab} className="rounded-md border border-gray-700 overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-700/60 hover:bg-gray-700 transition-colors text-left"
                          onClick={() => togglePanel(lab)}
                        >
                          <span className={`text-xs font-semibold uppercase tracking-wide ${panelAbnormal ? 'text-yellow-300' : 'text-gray-300'}`}>{lab}</span>
                          <div className="flex items-center gap-3 min-w-0">
                            {isCollapsed && <span className="text-xs text-gray-500 truncate max-w-xs">{summary}</span>}
                            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {!isCollapsed && (
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-900 border-b border-gray-700">
                                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Test</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Result</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Flag</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Unit</th>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Ref Range</th>
                              </tr>
                            </thead>
                            <tbody>
                              {components.map((c, j) => {
                                const isCritical = c.status === 'critical'
                                const isAbnormal = c.status === 'abnormal' || isCritical
                                return (
                                  <tr key={j} className={`border-b border-gray-700/40 last:border-0 ${j % 2 === 0 ? 'bg-gray-800' : 'bg-gray-800/60'}`}>
                                    <td className="pl-5 pr-4 py-2.5 text-gray-300">{c.name}</td>
                                    <td className={`px-4 py-2.5 font-semibold tabular-nums ${isCritical ? 'text-red-400' : isAbnormal ? 'text-yellow-300' : 'text-gray-100'}`}>{c.value}</td>
                                    <td className="px-4 py-2.5 w-12 text-xs font-bold">
                                      {isCritical && <span className="text-red-400">CRIT</span>}
                                      {c.status === 'abnormal' && <span className="text-yellow-300">A</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400">{c.unit}</td>
                                    <td className="px-4 py-2.5 text-gray-400">{c.referenceRange}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                  {pendingLabs.map(lab => (
                    <div key={lab} className={`rounded-md border border-gray-700 px-4 py-3 ${diagnosisSubmitted ? 'bg-gray-800/60' : 'bg-yellow-950/10 border-yellow-900/30'}`}>
                      {diagnosisSubmitted ? (
                        <>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{lab}</span>
                            <span className="text-xs text-gray-600 italic">(returned after your diagnosis — typically {pendingHours(lab)})</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-400">Result not modeled for this case.</div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 animate-pulse flex-shrink-0" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-yellow-600">{lab}</span>
                          <span className="text-xs text-gray-600">Result pending — typically available in {pendingHours(lab)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {loadingOnDemand.map(t => (
                    <div key={t} className="rounded-md border border-blue-900/40 bg-blue-950/20 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-xs font-semibold uppercase tracking-wide text-blue-400">{t}</span>
                        <span className="text-xs text-gray-500">Generating result...</span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
            {(orderedImaging.length > 0 || orderedProcedures.length > 0) && (
              <SectionCard title="Imaging & Studies">
                <div className="space-y-2">
                  {orderedImaging.map(img => {
                    const key = findResultKey(img, caseData.imagingResults)!
                    const report = caseData.imagingResults[key]
                    const isCollapsed = collapsedPanels.has(img)

                    if (isECGTest(img)) {
                      const ecgImage = img in ecgCache ? ecgCache[img] : null
                      const ecgSummary = (caseData.ecgFindings ?? report).split(/[.!?]/)[0].trim()
                      return (
                        <div key={img} className="rounded-md border border-gray-700 overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-700/60 hover:bg-gray-700 transition-colors text-left"
                            onClick={() => togglePanel(img)}
                          >
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">ECG / Electrocardiogram</span>
                            <div className="flex items-center gap-3 min-w-0">
                              {isCollapsed && <span className="text-xs text-gray-500 truncate max-w-xs">ECG | {ecgSummary}</span>}
                              <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>
                          {!isCollapsed && (
                            <ECGPanel
                              ecgFindings={caseData.ecgFindings}
                              aiReport={report}
                              image={ecgImage}
                              onZoom={(src, alt) => setZoomedImage({ src, alt })}
                            />
                          )}
                        </div>
                      )
                    }

                    const specialModality = getSpecialModality(img)
                    if (specialModality) {
                      const specialCacheMap: Record<SpecialModality, Record<string, SpecialImage | null | 'none'>> = {
                        smear: smearCache, biopsy: biopsyImgCache,
                        fundus: fundusCache, derm: dermCache, urine: urineImgCache,
                      }
                      const findingsMap: Record<SpecialModality, string | undefined> = {
                        smear:  caseData.hematologyFindings,
                        biopsy: caseData.biopsyFindings,
                        fundus: caseData.fundusFindings,
                        derm:   caseData.skinFindings,
                        urine:  caseData.urineFindings,
                      }
                      const specialImage = img in specialCacheMap[specialModality] ? specialCacheMap[specialModality][img] : null
                      const firstLine = report.split(/[.\n]/)[0].trim()
                      const isBiopsyGated = specialModality === 'biopsy' && !diagnosisSubmitted
                      return (
                        <div key={img} className="rounded-md border border-gray-700 overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-700/60 hover:bg-gray-700 transition-colors text-left"
                            onClick={() => togglePanel(img)}
                          >
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">
                              {SPECIAL_LABELS[specialModality]}
                              {isBiopsyGated && <span className="ml-2 text-xs font-normal text-yellow-600 normal-case">(results after diagnosis)</span>}
                            </span>
                            <div className="flex items-center gap-3 min-w-0">
                              {isCollapsed && <span className="text-xs text-gray-500 truncate max-w-xs">{firstLine}</span>}
                              <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>
                          {!isCollapsed && (
                            isBiopsyGated ? (
                              <div className="bg-gray-900 px-4 py-4">
                                <p className="text-sm text-gray-500 italic">H&E biopsy results are typically available after clinical assessment. Submit your diagnosis to view pathology findings.</p>
                              </div>
                            ) : (
                              <SpecialPanel
                                modality={specialModality}
                                report={report}
                                image={specialImage}
                                findings={findingsMap[specialModality]}
                                onZoom={(src, alt) => setZoomedImage({ src, alt })}
                              />
                            )
                          )}
                        </div>
                      )
                    }

                    const firstLine = report.split(/[.\n]/)[0].trim()
                    const cachedResults = imagingCache[img] ?? null
                    return (
                      <div key={img} className="rounded-md border border-gray-700 overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-700/60 hover:bg-gray-700 transition-colors text-left"
                          onClick={() => togglePanel(img)}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">{img}</span>
                          <div className="flex items-center gap-3 min-w-0">
                            {isCollapsed && <span className="text-xs text-gray-500 truncate max-w-xs">{firstLine}</span>}
                            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {!isCollapsed && (
                          <ImagingPanel report={report} results={cachedResults} />
                        )}
                      </div>
                    )
                  })}
                  {orderedProcedures.map(proc => {
                    const key = findResultKey(proc, caseData.procedureResults!)!
                    const report = caseData.procedureResults![key]
                    const isCollapsed = collapsedPanels.has(proc)
                    const firstLine = report.split(/[.\n]/)[0].trim()
                    return (
                      <div key={proc} className="rounded-md border border-gray-700 overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-700/60 hover:bg-gray-700 transition-colors text-left"
                          onClick={() => togglePanel(proc)}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">{proc}</span>
                          <div className="flex items-center gap-3 min-w-0">
                            {isCollapsed && <span className="text-xs text-gray-500 truncate max-w-xs">{firstLine}</span>}
                            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {!isCollapsed && (
                          <div className="rounded-b-md bg-gray-900 px-4 py-3">
                            <p className="text-sm leading-relaxed text-gray-300">{report}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </SectionCard>
            )}
          </div>
        )
      }

      case 'diagnosis':
        return (
          <div className="space-y-4">
            {gradingLoading ? (
              <SectionCard title="Evaluating Diagnosis">
                <div className="flex flex-col items-center justify-center py-14 gap-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-gray-200">Evaluating your diagnosis…</p>
                    <p className="text-xs text-gray-500">Reviewing history, workup, and clinical reasoning</p>
                  </div>
                </div>
              </SectionCard>
            ) : gradingError ? (
              <SectionCard title="Submit Your Diagnosis">
                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-800 bg-red-950/50">
                    <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-red-400 mb-0.5">{gradingError}</p>
                    <p className="text-xs text-gray-600">Your diagnosis and reasoning are still saved above.</p>
                  </div>
                  <button
                    onClick={() => submitDiagnosis()}
                    className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </SectionCard>
            ) : !gradingResult ? (
              <SectionCard title="Submit Your Diagnosis">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 flex items-center justify-between text-sm text-gray-400">
                      <span>Primary diagnosis:</span>
                      <MicButton
                        onTranscript={text => setUserDiagnosis(prev => prev ? prev + ' ' + text : text)}
                        paused={timerState.status === 'paused' || gradingLoading || locked}
                        className="py-1"
                      />
                    </label>
                    <DiagnosisInput
                      value={userDiagnosis}
                      onChange={setUserDiagnosis}
                      onKeyDown={e => e.key === 'Enter' && caseDifficulty === 'Foundations' && submitDiagnosis()}
                      disabled={gradingLoading || locked}
                    />
                  </div>

                  {caseDifficulty === 'Clinical' && (
                    <div>
                      <label className="mb-2 flex items-center justify-between text-sm text-gray-400">
                        <span>Clinical Reasoning <span className="text-gray-600">(required)</span></span>
                        <MicButton
                          onTranscript={text => setUserPresentation(prev => prev ? prev + ' ' + text : text)}
                          paused={timerState.status === 'paused' || gradingLoading || locked}
                          className="py-1"
                        />
                      </label>
                      <textarea
                        value={userPresentation}
                        onChange={e => setUserPresentation(e.target.value)}
                        disabled={locked}
                        placeholder="Explain what findings support your diagnosis. Reference specific values from the history, exam, or test results that led you to this conclusion."
                        rows={5}
                        className="w-full rounded-md border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  )}

                  {caseDifficulty === 'Advanced' && (
                    <div>
                      <label className="mb-2 flex items-center justify-between text-sm text-gray-400">
                        <span>Oral Presentation <span className="text-gray-600">(required)</span></span>
                        <div className="flex items-center gap-2">
                          <MicButton
                            onTranscript={text => setUserPresentation(prev => prev ? prev + ' ' + text : text)}
                            paused={timerState.status === 'paused' || gradingLoading || locked}
                            className="py-1"
                          />
                          <span className={`text-xs tabular-nums ${userPresentation.trim().split(/\s+/).filter(Boolean).length < 50 ? 'text-gray-600' : 'text-gray-400'}`}>
                            {userPresentation.trim() === '' ? 0 : userPresentation.trim().split(/\s+/).filter(Boolean).length} words
                          </span>
                        </div>
                      </label>
                      <textarea
                        value={userPresentation}
                        onChange={e => setUserPresentation(e.target.value)}
                        disabled={locked}
                        placeholder={"Patient summary: [Name] is a [age]yo [gender] presenting with [chief complaint].\n\nKey findings: [Most significant positives and pertinent negatives from history, exam, and results — cite actual values.]\n\nAssessment: [Your diagnosis and why the findings support it. Address top differentials and why you ruled them out.]\n\nPlan: [Immediate management steps — treatment, further workup, disposition, safety considerations.]"}
                        rows={10}
                        className="w-full rounded-md border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none resize-y font-mono leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  )}

                  <p className="text-xs text-gray-500 italic">
                    {caseDifficulty === 'Advanced'
                      ? 'Tip: Be specific — cite actual values (e.g. "UPCR 5.8", "eGFR 48") rather than general terms.'
                      : 'Tip: Consider including the underlying cause in your diagnosis (e.g. "X secondary to Y").'}
                  </p>

                  {/* Pre-submission history checklist — most commonly missed question categories */}
                  <div className="rounded-md border border-gray-700/60 bg-gray-800/40 px-3 py-2.5">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Before submitting — have you asked about:</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {[
                        'Family history of similar conditions',
                        'Recent medication changes or new drugs',
                        'OTC medications, NSAIDs, or supplements',
                        'Recent travel or sick contacts',
                      ].map((q) => (
                        <div key={q} className="flex items-start gap-1.5 text-xs text-gray-600">
                          <span className="mt-px flex-shrink-0 text-gray-700">□</span>
                          <span>{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => submitDiagnosis()}
                    disabled={
                      !userDiagnosis.trim() ||
                      gradingLoading ||
                      locked ||
                      ((caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && !userPresentation.trim())
                    }
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
                {/* 1. Score header + benchmark label */}
                {(() => {
                  const s = gradingResult.score
                  const d = caseDifficulty
                  const label =
                    d === 'Foundations'
                      ? s >= 90 ? 'Excellent' : s >= 75 ? 'Strong pass' : s >= 60 ? 'Pass' : 'Needs review'
                      : d === 'Clinical'
                      ? s >= 88 ? 'Excellent' : s >= 72 ? 'Strong pass' : s >= 55 ? 'Pass' : 'Needs review'
                      : s >= 85 ? 'Excellent' : s >= 68 ? 'Strong pass' : s >= 50 ? 'Pass' : 'Needs review'
                  return (
                    <div className={`rounded-lg border p-5 ${gradingResult.correct ? 'border-green-700 bg-green-950/30' : 'border-red-700 bg-red-950/30'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-bold text-gray-100">
                          {gradingResult.correct ? '✓ Correct Diagnosis' : '✗ Incorrect Diagnosis'}
                        </h3>
                        <div className="text-right">
                          <div className={`text-3xl font-bold tabular-nums ${s >= 70 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {s}/100
                          </div>
                          <div className={`text-xs mt-0.5 ${s >= 70 ? 'text-green-500' : s >= 50 ? 'text-yellow-500' : 'text-gray-500'}`}>
                            {label}
                          </div>
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
                      {gradingResult.efficiency && (() => {
                        const eff = gradingResult.efficiency!
                        const total = eff.elapsedSeconds + eff.pausedSeconds
                        return (
                          <p className="mt-2 text-xs text-gray-600">
                            Active time: {fmtTime(eff.elapsedSeconds)}
                            {eff.pausedSeconds > 0 ? `  |  Paused: ${fmtTime(eff.pausedSeconds)}  |  Total elapsed: ${fmtTime(total)}` : ''}
                          </p>
                        )
                      })()}
                    </div>
                  )
                })()}

                {/* 2. What you did well */}
                {(gradingResult.strengths?.length > 0 || gradingResult.efficiency?.score === 10) && (
                  <SectionCard title="What You Did Well">
                    <ul className="space-y-2">
                      {gradingResult.strengths?.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-300">
                          <span className="text-green-400 flex-shrink-0">✓</span>
                          {s}
                        </li>
                      ))}
                      {gradingResult.efficiency?.score === 10 && (
                        <li className="flex gap-2 text-sm text-gray-300">
                          <span className="text-green-400 flex-shrink-0">✓</span>
                          Completed the case efficiently within the allotted time
                        </li>
                      )}
                    </ul>
                    {gradingResult.efficiency?.timedOut && (
                      <p className="mt-3 text-xs text-gray-500 italic border-t border-gray-700 pt-3">
                        The case timed out before submission. Time management is a clinical skill that improves with practice. Focus on high-yield questions early and order targeted tests rather than a broad workup.
                      </p>
                    )}
                  </SectionCard>
                )}

                {/* 3. Scorecard */}
                {gradingResult.dimensions && (
                  <SectionCard title="Scorecard">
                    <div className="space-y-4">
                      {([
                        ['historyInterview',      'History & Interview',    18],
                        ['testOrdering',          'Test Ordering',          18],
                        ['diagnosisAccuracy',     'Diagnosis Accuracy',     27],
                        ['diagnosisCompleteness', 'Diagnosis Completeness', 13],
                        ['clinicalReasoning',     'Clinical Reasoning',     14],
                      ] as const).map(([key, label, max]) => {
                        const dim = gradingResult.dimensions![key]
                        if (!dim) return null
                        const pct = Math.min(100, (dim.score / max) * 100)
                        const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        const scoreColor = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'
                        return (
                          <div key={key}>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="w-44 flex-shrink-0 text-sm font-medium text-gray-200">{label}</span>
                              <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`w-14 text-right text-sm font-bold tabular-nums ${scoreColor}`}>{dim.score}/{max}</span>
                            </div>
                            <p className="pl-44 text-xs text-gray-400">{dim.feedback}</p>
                          </div>
                        )
                      })}
                      {/* Dimension sum verification */}
                      {(() => {
                        const dims = [
                          ['historyInterview', 18],
                          ['testOrdering', 18],
                          ['diagnosisAccuracy', 27],
                          ['diagnosisCompleteness', 13],
                          ['clinicalReasoning', 14],
                        ] as const
                        const scores = dims.map(([k]) => gradingResult.dimensions![k]?.score ?? 0)
                        const total = scores.reduce((a, b) => a + b, 0)
                        return (
                          <div className="border-t border-gray-700/60 pt-3 mt-1">
                            <div className="flex items-center gap-3">
                              <span className="w-44 flex-shrink-0 text-xs text-gray-500">AI-graded subtotal</span>
                              <span className="text-xs text-gray-600 flex-1">
                                {scores.join(' + ')} = <span className="text-gray-400 font-semibold">{total}/90</span>
                              </span>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Efficiency axis — Clinical/Advanced only */}
                      {gradingResult.efficiency && (() => {
                        const eff = gradingResult.efficiency!
                        const pct = (eff.score / 10) * 100
                        const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        const scoreColor = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'
                        return (
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="w-44 flex-shrink-0 text-sm font-medium text-gray-200">Efficiency</span>
                              <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`w-14 text-right text-sm font-bold tabular-nums ${scoreColor}`}>{eff.score}/10</span>
                            </div>
                            <p className="pl-44 text-xs text-gray-400">{eff.feedback}</p>
                            <p className="pl-44 text-xs text-gray-600 mt-0.5">
                              Completed in {fmtTime(eff.elapsedSeconds)} active time
                              {eff.pausedSeconds > 0 ? ` (${fmtTime(eff.pausedSeconds)} paused)` : ''}
                            </p>
                            <p className="pl-44 text-xs text-gray-700 mt-1">
                              Scoring: {caseDifficulty === 'Clinical'
                                ? '>9 min left → 10pts | >5 min → 8pts | >2 min → 6pts | <2 min → 4pts | timed out → 2pts'
                                : '>6 min left → 10pts | >3 min → 8pts | >1 min → 6pts | <1 min → 4pts | timed out → 2pts'}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  </SectionCard>
                )}

                {/* Oral Presentation (Advanced difficulty only) */}
                {gradingResult.presentation?.scores && (
                  <SectionCard title="Oral Presentation">
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`text-2xl font-bold ${(gradingResult.presentation.presentationTotal ?? 0) >= 70 ? 'text-green-400' : (gradingResult.presentation.presentationTotal ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {gradingResult.presentation.presentationTotal ?? 0}/100
                      </div>
                      <span className="text-xs text-gray-500">Presentation Score</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {(
                        [
                          ['Accuracy', gradingResult.presentation.scores.accuracy],
                          ['Completeness', gradingResult.presentation.scores.completeness],
                          ['Conciseness', gradingResult.presentation.scores.conciseness],
                          ['Safety', gradingResult.presentation.scores.safety],
                        ] as [string, number][]
                      ).map(([axis, score]) => (
                        <div key={axis} className="rounded-md bg-gray-900 p-3">
                          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{axis}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${score >= 18 ? 'text-green-400' : score >= 12 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {score}/25
                            </span>
                            <div className="flex-1 rounded-full bg-gray-700 h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${score >= 18 ? 'bg-green-500' : score >= 12 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${(score / 25) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {gradingResult.presentation.presentationFeedback && (
                      <p className="text-sm leading-relaxed text-gray-300 mb-3">{gradingResult.presentation.presentationFeedback}</p>
                    )}
                    {gradingResult.presentation.criticalMisses && gradingResult.presentation.criticalMisses.length > 0 && (
                      <div className="mt-3 rounded-md border border-red-800 bg-red-950/30 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-400">Critical Misses</div>
                        <ul className="space-y-1">
                          {gradingResult.presentation.criticalMisses.map((miss, i) => (
                            <li key={i} className="flex gap-2 text-sm text-red-300">
                              <span className="flex-shrink-0">!</span>
                              {miss}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </SectionCard>
                )}

                {/* 4. Missed questions */}
                {gradingResult.missedQuestions?.length > 0 && (
                  <SectionCard title="Questions That Would Have Changed Management">
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

                {/* 5. Teaching points */}
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

                {/* Your Case Notes */}
                {notes.content.trim() && notes.content !== SOAP_TEMPLATE && (
                  <NotesResultPanel content={notes.content} />
                )}

                {/* Case feedback widget */}
                {(() => {
                  const FEEDBACK_DIMS = [
                    { key: 'overall',               label: 'Overall Case' },
                    { key: 'clinicalRealism',        label: 'Clinical Realism' },
                    { key: 'gradingFairness',        label: 'Grading Fairness' },
                    { key: 'patientCommunication',   label: 'Patient Communication' },
                    { key: 'difficultyAccuracy',     label: 'Difficulty Accuracy' },
                  ]
                  const submitFeedback = async () => {
                    setFeedbackSubmitting(true)
                    try {
                      await fetch('/api/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          diagnosis: caseData?.diagnosis,
                          difficulty: caseDifficulty,
                          system: caseData?.patientInfo ? resolvedSystemRef.current : undefined,
                          patientName: caseData?.patientInfo?.name,
                          ratings: feedbackRatings,
                          feedback: feedbackText,
                        }),
                      })
                    } catch {}
                    setFeedbackSubmitted(true)
                    setFeedbackSubmitting(false)
                  }
                  const hasAnyRating = Object.values(feedbackRatings).some(v => v > 0)
                  return (
                    <div className="rounded-lg border border-surface-4 bg-surface-1 p-5">
                      <div className="mb-4 text-sm font-semibold text-ink-primary">Rate This Case</div>
                      {feedbackSubmitted ? (
                        <p className="text-sm text-green-400 text-center py-2">Thank you for your feedback!</p>
                      ) : (
                        <>
                          <div className="space-y-3 mb-4">
                            {FEEDBACK_DIMS.map(({ key, label }) => {
                              const active = feedbackRatings[key] ?? 0
                              const hov = feedbackHover[key] ?? 0
                              return (
                                <div key={key} className="flex items-center justify-between gap-3">
                                  <span className="text-xs text-ink-secondary w-40 shrink-0">{label}</span>
                                  <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <button
                                        key={star}
                                        onMouseEnter={() => setFeedbackHover(h => ({ ...h, [key]: star }))}
                                        onMouseLeave={() => setFeedbackHover(h => ({ ...h, [key]: 0 }))}
                                        onClick={() => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                                        className="text-xl leading-none transition-colors"
                                        aria-label={`${star} star`}
                                      >
                                        <span className={(hov || active) >= star ? 'text-yellow-400' : 'text-gray-600'}>
                                          ★
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <textarea
                            value={feedbackText}
                            onChange={e => setFeedbackText(e.target.value)}
                            placeholder="Any comments or suggestions? (optional)"
                            rows={3}
                            className="w-full rounded-md border border-surface-4 bg-surface-2 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted focus:border-primary-400 focus:outline-none resize-none mb-3"
                          />
                          <button
                            onClick={submitFeedback}
                            disabled={!hasAnyRating || feedbackSubmitting}
                            className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {feedbackSubmitting ? 'Submitting…' : 'Submit Feedback'}
                          </button>
                        </>
                      )}
                    </div>
                  )
                })()}

                <button
                  onClick={() => {
                    setGradingResult(null)
                    setUserDiagnosis('')
                    setUserPresentation('')
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
    <div className="relative flex h-screen flex-col overflow-hidden bg-surface-0 text-ink-primary">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-surface-4 bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2 mr-2">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary-400 to-primary-700 flex items-center justify-center text-ink-inverse text-sm font-bold shadow-lg shadow-primary-900/30">Rx</div>
          <span className="font-serif text-[15px] font-semibold text-ink-primary whitespace-nowrap">MedTrainer</span>
        </div>
        <select
          value={system}
          onChange={e => setSystem(e.target.value)}
          className="rounded-md border border-surface-4 bg-surface-2 px-3 py-1.5 text-[11px] text-ink-secondary focus:border-primary-400 focus:outline-none transition-colors"
        >
          {SYSTEMS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="relative group">
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value)}
            className="rounded-md border border-surface-4 bg-surface-2 px-3 py-1.5 text-[11px] text-ink-secondary focus:border-primary-400 focus:outline-none transition-colors"
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
        <button
          onClick={() => {
            if (notes.content.trim() && notes.content !== SOAP_TEMPLATE) {
              setPendingGenerateWithNotes(true)
            } else {
              generateCase()
            }
          }}
          disabled={generating}
          className="rounded-md bg-primary-500 px-4 py-1.5 text-[11px] font-semibold text-ink-inverse hover:bg-primary-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-900/20"
        >
          {generating ? 'Generating...' : 'Generate Case'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* History link */}
          <a
            href="/history"
            title="Case history"
            className="rounded-md border border-surface-4 bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink-secondary hover:border-surface-5 hover:text-ink-primary transition-colors"
          >
            History
          </a>
          {/* Timer display — Clinical/Advanced only */}
          {caseData && (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && !caseStarted && (
            <button
              onClick={() => { startTimer(caseDifficulty); setCaseStarted(true); setTimeout(() => chatInputRef.current?.focus(), 50) }}
              className="rounded-md border border-primary-600 bg-primary-900/30 px-2.5 py-1 text-[11px] font-medium text-primary-300 hover:bg-primary-900/50 transition-colors"
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
                  className="flex items-center gap-1 rounded-md border border-primary-600 bg-primary-900/30 px-2.5 py-1 text-[11px] font-medium text-primary-300 hover:bg-primary-900/50 transition-colors"
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
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top row: nav + main content */}
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

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
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
                  <h1 className="font-serif text-2xl font-semibold text-ink-primary">Medical Diagnosis Trainer</h1>
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
                {HELP_CONTENT[activeSection] && (
                  <button
                    onClick={() => setHelpSection(activeSection)}
                    className="absolute -top-1 right-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-surface-4 bg-surface-2/80 text-xs font-semibold text-ink-tertiary hover:border-surface-5 hover:text-ink-primary transition-colors"
                    aria-label="Help"
                    title="How to use this section"
                  >
                    ?
                  </button>
                )}
                {renderMain()}
              </div>
            )}
          </main>
        </div>

        {/* Bottom panel: patient interview (60%) + notes (40%) */}
        <div
          className="flex flex-col border-t border-surface-4 bg-surface-1 flex-shrink-0 relative"
          style={{ height: chatPanelCollapsed ? '40px' : `${chatPanelHeight}vh` }}
        >
          {/* Drag handle */}
          {!chatPanelCollapsed && (
            <div
              onMouseDown={handleChatDragStart}
              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 flex items-center justify-center group"
            >
              <div className="w-10 h-0.5 rounded-full bg-surface-4 group-hover:bg-primary-400 transition-colors mt-0.5" />
            </div>
          )}

          {chatPanelCollapsed ? (
            <button
              className="flex h-10 w-full items-center gap-3 px-4 text-left hover:bg-surface-2/50 transition-colors"
              onClick={() => setChatPanelCollapsed(false)}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-ink-tertiary" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-[11px] text-ink-secondary truncate flex-1">
                {chatMessages.length > 0
                  ? chatMessages[chatMessages.length - 1].content
                  : caseData ? `Patient Interview — ${caseData.patientInfo.name}` : 'Patient Interview'}
              </span>
              <span className="text-[10px] text-ink-tertiary flex-shrink-0">▲ expand</span>
            </button>
          ) : (
            <div className="flex flex-1 overflow-hidden min-h-0 pt-1.5">

              {/* Chat column (60%) */}
              <div className="flex flex-col border-r border-surface-4" style={{ width: '60%' }}>
                <div className="flex items-center justify-between border-b border-surface-4 px-4 py-2 flex-shrink-0">
                  <div>
                    <h2 className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Patient Interview</h2>
                    {caseData && <p className="text-[11px] text-ink-tertiary mt-0.5">{caseData.patientInfo.name}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {caseData && <div className="h-2 w-2 rounded-full bg-confirmed" title="Patient available" />}
                    <button
                      onClick={() => setChatPanelCollapsed(true)}
                      className="text-ink-tertiary hover:text-ink-primary text-xs transition-colors"
                      title="Collapse panel"
                    >
                      ▼
                    </button>
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
                            ? 'bg-primary-600 text-primary-50'
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

              {/* Notes column (40%) */}
              <div className="flex flex-col" style={{ width: '40%' }}>
                <div className="flex items-center justify-between border-b border-surface-4 px-4 py-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-caution">Case Notes</span>
                    {notes.mode === 'soap' && (
                      <span className="rounded bg-caution-bg px-1.5 py-0.5 text-[10px] text-caution border border-caution-border">SOAP</span>
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
                  className="flex-1 resize-none bg-surface-0 p-4 text-[11px] leading-relaxed text-ink-primary placeholder-ink-tertiary focus:outline-none font-mono"
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

            </div>
          )}
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

      {/* Image zoom modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-h-screen max-w-screen-xl p-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-2 -right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors shadow-lg text-xl leading-none"
            >
              ×
            </button>
            <img
              src={zoomedImage.src}
              alt={zoomedImage.alt}
              className="max-h-[90vh] max-w-full rounded-lg object-contain bg-[#fafaf5] shadow-2xl"
            />
            <p className="mt-2 text-center text-xs text-gray-500">{zoomedImage.alt} — click outside to close</p>
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
          <div className="mx-4 w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-100">Case History</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none">×</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {historyEntries.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-600">No cases completed yet. Generate a case to get started.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b border-gray-800 text-gray-500 uppercase tracking-wide">
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
                      <tr key={entry.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-2.5 text-gray-500">{new Date(entry.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5">
                          <span className={`font-medium ${entry.difficulty === 'Advanced' ? 'text-red-400' : entry.difficulty === 'Clinical' ? 'text-yellow-400' : 'text-green-400'}`}>{entry.difficulty}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`font-bold tabular-nums ${entry.score >= 70 ? 'text-green-400' : entry.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{entry.score}/100</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={entry.correct ? 'text-green-400' : 'text-red-400'}>{entry.correct ? '✓ Correct' : '✗ Incorrect'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 max-w-[160px] truncate" title={entry.diagnosis}>{entry.diagnosis}</td>
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
                <div className="border-t border-gray-800 px-5 py-3 flex gap-6 text-xs text-gray-500">
                  <span>{historyEntries.length} cases</span>
                  <span>Avg score: <span className="text-gray-300 font-medium">{avg}/100</span></span>
                  <span>Accuracy: <span className="text-gray-300 font-medium">{Math.round((correctCount / historyEntries.length) * 100)}%</span></span>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
