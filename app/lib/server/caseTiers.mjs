/**
 * Tiered case-data split (security boundary).
 *
 * A full generated case contains the answer. To keep ground truth off the
 * client, every case is split into four tiers:
 *
 *   presentation_data   — safe to ship to the browser at case start
 *   patient_knowledge   — what the simulated patient "knows" (hidden history);
 *                         server-only, feeds the patient-agent prompt
 *   clinical_findings   — exam findings + all test results; server-only,
 *                         revealed piecemeal through /api/session/exam|order
 *   ground_truth        — diagnosis, teaching points, priors, test impacts;
 *                         server-only until grading reveals it
 *
 * Plain JS (like rubric.mjs) so seed/audit scripts in scripts/ can import it.
 */

/** @typedef {Record<string, any>} AnyCase */

/** Split a full case_data object into the four storage tiers. */
export function splitCase(/** @type {AnyCase} */ caseData) {
  const {
    // ── presentation ──
    patientInfo, hpi, clinicalHpi, advancedHpi, vitals,
    pastMedicalHistory, currentMedications, socialHistory,
    availableLabs, availableImaging, labGroups,
    // ── patient knowledge ──
    hiddenHistory,
    // ── clinical findings ──
    reviewOfSystems, physicalExam, relevantExamRegions,
    labResults, imagingResults, procedureResults,
    imagingCategory, ecgFindings, hematologyFindings, urineFindings,
    skinFindings, fundusFindings, biopsyFindings,
    localChestImage, localChestCategory,
    // ── ground truth ──
    diagnosis, differentials, differentialExplanations, teachingPoints,
    keyQuestions, expectedLabs, expectedImaging, relevantTests,
    differentialPriors, testImpacts, mechanism,
    ...rest
  } = caseData

  return {
    presentation: prune({
      patientInfo, hpi, clinicalHpi, advancedHpi, vitals,
      pastMedicalHistory, currentMedications, socialHistory,
      availableLabs, availableImaging, labGroups,
      ...rest,
    }),
    patientKnowledge: prune({ hiddenHistory }),
    clinicalFindings: prune({
      reviewOfSystems, physicalExam, relevantExamRegions,
      labResults, imagingResults, procedureResults,
      imagingCategory, ecgFindings, hematologyFindings, urineFindings,
      skinFindings, fundusFindings, biopsyFindings,
      // Image-first binding: the exact local film this case was authored from.
      // Result-level data — revealed only after the study is ordered.
      localChestImage, localChestCategory,
    }),
    groundTruth: prune({
      diagnosis, differentials, differentialExplanations, teachingPoints,
      keyQuestions, expectedLabs, expectedImaging, relevantTests,
      differentialPriors, testImpacts, mechanism,
    }),
  }
}

/** Recombine the four tiers back into a full case_data object. */
export function joinCase(/** @type {{presentation?: AnyCase, patientKnowledge?: AnyCase, clinicalFindings?: AnyCase, groundTruth?: AnyCase}} */ tiers) {
  return {
    ...(tiers.presentation ?? {}),
    ...(tiers.patientKnowledge ?? {}),
    ...(tiers.clinicalFindings ?? {}),
    ...(tiers.groundTruth ?? {}),
  }
}

function prune(/** @type {AnyCase} */ obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}
