import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT          = path.resolve(__dirname, '..', '..', '..')
export const AUDIT_DIR     = path.resolve(__dirname, '..')
export const ARTIFACTS_DIR = path.join(AUDIT_DIR, 'artifacts')
export const TRANSCRIPTS_DIR = path.join(ARTIFACTS_DIR, 'transcripts')
export const TABS_DIR      = path.join(ARTIFACTS_DIR, 'tabs')
export const FINDINGS_JSON = path.join(ARTIFACTS_DIR, 'findings.json')
export const FINDINGS_MD   = path.join(ARTIFACTS_DIR, 'findings.md')

export function ensureDirs() {
  for (const d of [ARTIFACTS_DIR, TRANSCRIPTS_DIR, TABS_DIR]) {
    fs.mkdirSync(d, { recursive: true })
  }
}

export function transcriptPath(caseNum) {
  return path.join(TRANSCRIPTS_DIR, `case-${String(caseNum).padStart(2, '0')}.json`)
}

export function tabArtifactPath(tabName, ext) {
  return path.join(TABS_DIR, `${tabName}.${ext}`)
}

export function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

export function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

export function listTranscripts() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) return []
  return fs.readdirSync(TRANSCRIPTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => readJSON(path.join(TRANSCRIPTS_DIR, f)))
    .filter(Boolean)
}

export function listTabArtifacts() {
  if (!fs.existsSync(TABS_DIR)) return []
  const names = new Set(
    fs.readdirSync(TABS_DIR)
      .map(f => f.replace(/\.(json|html|png)$/, ''))
  )
  return [...names].map(name => {
    const json = readJSON(tabArtifactPath(name, 'json')) ?? {}
    const htmlPath = tabArtifactPath(name, 'html')
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : ''
    return { name, json, html }
  })
}
