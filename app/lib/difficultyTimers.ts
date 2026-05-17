export type Difficulty = 'Foundations' | 'Clinical' | 'Advanced'

export const DIFFICULTY_TIME_LIMITS: Record<Difficulty, number> = {
  Foundations: 0,
  Clinical: 1320,   // 22 minutes
  Advanced: 900,    // 15 minutes
}
