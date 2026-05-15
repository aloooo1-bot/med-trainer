export const ANON_CASE_IDS = [
  'cardiovascular-foundations-st-elevation-myocardial-infarction-inferior-stemi-0',
  'gastrointestinal-foundations-acute-appendicitis-0',
  'neurologic-foundations-acute-ischemic-stroke-0',
] as const

export const ANON_CASE_LIMIT = ANON_CASE_IDS.length

export function isAnonymousCaseId(id: string): boolean {
  return (ANON_CASE_IDS as readonly string[]).includes(id)
}
