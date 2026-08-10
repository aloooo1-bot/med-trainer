import 'server-only'
import type { CaseData } from '../../trainer/_lib/types'
import type { CasePresentation, CaseReveal } from '../../trainer/_lib/sessionTypes'
import { caseBmiIsInterpretable } from '../bmi'
import { splitCase as _splitCase, joinCase as _joinCase } from './caseTiers.mjs'

export type { CasePresentation, CaseReveal }

export interface CaseTiers {
  presentation: Record<string, unknown>
  patientKnowledge: Record<string, unknown>
  clinicalFindings: Record<string, unknown>
  groundTruth: Record<string, unknown>
}

export function splitCase(caseData: CaseData): CaseTiers {
  return _splitCase(caseData as unknown as Record<string, unknown>) as CaseTiers
}

export function joinCase(tiers: Partial<CaseTiers>): CaseData {
  return _joinCase(tiers) as unknown as CaseData
}

export function selectHpiForDifficulty(c: CaseData, difficulty: string): string {
  if (difficulty === 'Clinical' && c.clinicalHpi) return c.clinicalHpi
  if (difficulty === 'Advanced' && c.advancedHpi) return c.advancedHpi
  return c.hpi
}

/**
 * Shape the client-visible slice of a case per difficulty.
 *
 * Foundations is deliberately permissive (training wheels): full ROS, full
 * exam, the curated order lists, and the live differential board's priors.
 * Clinical/Advanced ship only the presenting story — everything else is
 * revealed through the session routes as the student earns it.
 */
export function buildPresentation(caseData: CaseData, difficulty: string): CasePresentation {
  const foundations = difficulty === 'Foundations'
  // Gating depends on difficulty ALONE. It previously also required
  // relevantExamRegions to be non-empty, but that field exists to score exam
  // focus at grading time, not to decide whether findings are withheld — and
  // no cached case actually carries it (it postdates the library). The result
  // was the worst of both: findings withheld because this is not Foundations,
  // yet examGated false, so the client rendered every region heading with a
  // blank finding and no way to reveal it. A dead section on every Clinical
  // and Advanced case.
  const examGated = !foundations

  const base: CasePresentation = {
    patientInfo: caseData.patientInfo,
    hpi: selectHpiForDifficulty(caseData, difficulty),
    vitals: caseData.vitals,
    examRegions: Object.keys(caseData.physicalExam ?? {}),
    examGated,
    // Depends on the diagnosis, which never reaches the client — so the client
    // cannot decide this for itself and it has to travel with the presentation.
    bmiInterpretable: caseBmiIsInterpretable(caseData),
    // 5.3: scaffolding tier travels separately from case complexity; today the
    // caller (buildPresentation is invoked with difficulty) keeps them equal.
    scaffoldingLevel: (difficulty as CasePresentation['scaffoldingLevel']),
  }

  if (foundations) {
    base.pastMedicalHistory = caseData.pastMedicalHistory
    base.currentMedications = caseData.currentMedications
    base.socialHistory = caseData.socialHistory
    base.reviewOfSystems = caseData.reviewOfSystems
    base.physicalExam = caseData.physicalExam
    base.availableLabs = caseData.availableLabs
    base.availableImaging = caseData.availableImaging
    base.labGroups = caseData.labGroups
    base.differentialPriors = caseData.differentialPriors
    base.testImpacts = caseData.testImpacts
    base.predictionCandidates = caseData.differentialPriors?.map(p => p.name)
  } else {
    // Clinical shows curated reference lists client-side (not case-derived);
    // Advanced is free recall. Neither gets the case's own test menus, which
    // would fingerprint the diagnosis in the network tab.
    if (difficulty === 'Advanced') {
      base.caseSearchTests = (caseData.relevantTests ?? []).map(t => ({ name: t.name, category: t.category }))
    }
  }

  return base
}

export function buildReveal(caseData: CaseData): CaseReveal {
  return {
    diagnosis: caseData.diagnosis,
    differentials: caseData.differentials ?? [],
    differentialExplanations: (caseData as unknown as { differentialExplanations?: string[] }).differentialExplanations,
    teachingPoints: caseData.teachingPoints ?? [],
    keyQuestions: caseData.keyQuestions ?? [],
    mechanism: caseData.mechanism,
    recallCards: caseData.recallCards,
    differentialPriors: caseData.differentialPriors,
    testImpacts: caseData.testImpacts,
    reviewOfSystems: caseData.reviewOfSystems ?? {},
    expectedLabs: caseData.expectedLabs,
    expectedImaging: caseData.expectedImaging,
  }
}
