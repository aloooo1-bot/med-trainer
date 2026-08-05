/**
 * BMI: the arithmetic, the category bands, and the rule for when the number
 * means nothing at all.
 *
 * That last part is the reason this module exists. BMI is derived from measured
 * height, and in patients whose habitus distorts height — severe kyphoscoliosis,
 * amputation, achondroplasia — the measured value is not their true height, so
 * the BMI computed from it is not a nutritional metric. Reporting a reassuring
 * "Normal" is most misleading in exactly the population where the metric breaks:
 * a 4'9" kyphoscoliotic woman at 106 lb computes to 22.9, and is probably
 * underweight. Real practice estimates true height from arm span or ulnar length.
 *
 * Pure + testable: no server-only import, no I/O, safe on both sides of the
 * network boundary.
 */

/**
 * Category bands. First band whose ceiling the value falls under wins, so the
 * boundaries are `< ceiling` — 18.5 is Normal, not Underweight. That is the
 * pre-existing behaviour of the two call sites this module replaces and it is
 * deliberately preserved; changing it here would be a silent clinical change
 * riding along with a display fix.
 */
const BMI_BANDS = [
  { ceiling: 18.5, label: 'Underweight', colorClass: 'text-primary-400' },
  { ceiling: 25, label: 'Normal', colorClass: 'text-confirmed' },
  { ceiling: 30, label: 'Overweight', colorClass: 'text-caution' },
  { ceiling: Infinity, label: 'Obese', colorClass: 'text-critical' },
] as const

export type BmiCategory = (typeof BMI_BANDS)[number]['label']

/** Shown wherever an uninterpretable BMI is displayed. Teaches the workaround. */
export const BMI_UNINTERPRETABLE_NOTE =
  'Measured height is not true height in this patient, so BMI derived from it is not ' +
  'interpretable. Estimate true height from arm span or ulnar length before judging ' +
  'nutritional status.'

export interface BmiReading {
  /** Rounded to one decimal place. */
  value: number
  interpretable: boolean
  /** null when not interpretable — there is no honest category to report. */
  category: BmiCategory | null
  /** Band colour, or a de-emphasised tone when not interpretable. */
  colorClass: string
  /** Explanation to surface (tooltip / screen reader), or null. */
  note: string | null
}

/**
 * Parse a weight that may arrive as `106`, `"106"`, `"106 lbs"` or `"Wt 106 lb"`.
 * Strip-then-parse is the union of the two behaviours this replaces — the
 * trainer used a bare parseFloat, the admin preview stripped non-numerics first.
 */
function parseWeightLb(weight?: string | number): number | null {
  if (typeof weight === 'number') return Number.isFinite(weight) ? weight : null
  if (!weight) return null
  const n = parseFloat(String(weight).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** BMI from imperial inputs, or null when either input is missing/unusable. */
export function computeBmi(heightInches?: number, weight?: string | number): number | null {
  const lb = parseWeightLb(weight)
  if (!heightInches || heightInches <= 0 || lb === null || lb <= 0) return null
  return Math.round((lb / (heightInches * heightInches)) * 703 * 10) / 10
}

/**
 * A displayable BMI, or null when it cannot be computed at all.
 *
 * When `interpretable` is false the number is still returned — hiding it would
 * leave the height and weight on screen beside it, letting a student compute
 * 22.9 themselves and self-reassure with nothing to correct them. The category
 * and its colour are what get withheld, because those are the claim.
 */
export function readBmi(
  heightInches?: number,
  weight?: string | number,
  interpretable = true,
): BmiReading | null {
  const value = computeBmi(heightInches, weight)
  if (value === null) return null
  if (!interpretable) {
    return {
      value,
      interpretable: false,
      category: null,
      // Not caution-amber: amber means "abnormal value", and this is the
      // different claim "not a finding, do not read this".
      colorClass: 'text-ink-tertiary',
      note: BMI_UNINTERPRETABLE_NOTE,
    }
  }
  const band = BMI_BANDS.find(b => value < b.ceiling) ?? BMI_BANDS[BMI_BANDS.length - 1]
  return { value, interpretable: true, category: band.label, colorClass: band.colorClass, note: null }
}

/**
 * Conditions under which a measured height is not the patient's true height.
 *
 * Kept deliberately narrow. This drives what a student sees, so a false
 * "not interpretable" is itself a small teaching error: `contracture` is
 * qualified because Dupuytren's contracture of the hand does not affect standing
 * height, and Paget's is qualified because Paget's disease of the breast does not
 * either.
 */
const HEIGHT_INVALIDATING = [
  /kyphoscoliosis|scoliosis|kyphosis/i,
  /amputat/i,
  /achondroplasia|dwarfism|skeletal dysplasia/i,
  /osteogenesis imperfecta/i,
  /(?:flexion|joint|limb|hip|knee|lower[-\s]?limb)\s+contracture/i,
  /spinal fusion|vertebral collapse|vertebral compression fracture/i,
  /paget'?s? disease of (?:the )?bone|osteitis deformans/i,
]

/** True when measured height can be trusted as true height for this text. */
export function heightIsMeasurable(text: string): boolean {
  return !HEIGHT_INVALIDATING.some(re => re.test(text))
}

/**
 * Case-level convenience: does this case's own description imply a habitus that
 * invalidates measured height?
 *
 * Reads diagnosis, the difficulty-specific HPIs and past medical history —
 * the deformity is not always the diagnosis, and can sit only in PMH. Physical
 * exam prose is deliberately NOT consulted: a General exam reading "no scoliosis"
 * would match and produce a false invalidation.
 */
export function caseBmiIsInterpretable(c: {
  diagnosis?: string
  hpi?: string
  clinicalHpi?: string
  advancedHpi?: string
  pastMedicalHistory?: { conditions?: string }
}): boolean {
  return heightIsMeasurable([
    c.diagnosis ?? '',
    c.hpi ?? '',
    c.clinicalHpi ?? '',
    c.advancedHpi ?? '',
    c.pastMedicalHistory?.conditions ?? '',
  ].join(' '))
}
