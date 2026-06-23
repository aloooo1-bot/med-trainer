/**
 * Loader for authored knowledge-spine profiles. Used by generation scripts and
 * the admin regenerate route to fetch a diagnosis's profile (if one exists) and
 * pass it to generateManifest for constrained, profile-conformant generation.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROFILE_DIR = path.join(__dirname, 'profiles')

const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

/** Returns the DiagnosisProfile for a diagnosis, or null if none authored yet. */
export function loadProfile(diagnosis) {
  const p = path.join(PROFILE_DIR, `${slug(diagnosis)}.json`)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

/** How many profiles have been authored, and how many are human-verified. */
export function profileStats() {
  if (!fs.existsSync(PROFILE_DIR)) return { total: 0, verified: 0 }
  const files = fs.readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json'))
  let verified = 0
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, f), 'utf8'))
      if (p.review?.status === 'human-verified') verified++
    } catch { /* ignore */ }
  }
  return { total: files.length, verified }
}
