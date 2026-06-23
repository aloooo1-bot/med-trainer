import type { DifferentialPrior, TestImpacts } from '../../lib/reasoning/types'

export interface CaseData {
  patientInfo: { name: string; age: number; gender: string; chiefComplaint: string; height?: string; heightInches?: number }
  hpi: string
  clinicalHpi?: string
  advancedHpi?: string
  vitals: { bp: string; hr: number; rr: number; temp: number; spo2: number; weight: string }
  pastMedicalHistory?: { conditions?: string; surgeries?: string; hospitalizations?: string }
  currentMedications?: { medications?: string; otc?: string }
  socialHistory?: { smoking?: string; alcohol?: string; drugs?: string; occupation?: string; living?: string; other?: string }
  reviewOfSystems: Record<string, string>
  physicalExam: Record<string, string>
  relevantExamRegions?: string[]
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
  // ── Reasoning engine (optional; cases generated before this feature lack them) ──
  /** Pre-test weights for the correct diagnosis + every differential. */
  differentialPriors?: DifferentialPrior[]
  /** How THIS case's result for each test moves each tracked hypothesis. */
  testImpacts?: TestImpacts
  /** 2-3 sentence pathophysiology for the "Why" layer. */
  mechanism?: string
  imagingCategory?: string
  ecgFindings?: string
  hematologyFindings?: string
  urineFindings?: string
  skinFindings?: string
  fundusFindings?: string
  biopsyFindings?: string
  expectedLabs?: string[]
  expectedImaging?: string[]
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

export interface TimerState {
  totalSeconds: number
  remainingSeconds: number
  elapsedSeconds: number
  pausedSeconds: number
  status: 'idle' | 'running' | 'paused' | 'expired' | 'completed'
}

export interface NotesState {
  mode: 'free' | 'soap'
  content: string
  open: boolean
}

export function selectHpi(c: CaseData, difficulty: string): string {
  if (difficulty === 'Clinical' && c.clinicalHpi) return c.clinicalHpi
  if (difficulty === 'Advanced' && c.advancedHpi) return c.advancedHpi
  return c.hpi
}

export const SOAP_TEMPLATE = `SUBJECTIVE
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
