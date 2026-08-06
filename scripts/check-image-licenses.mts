/**
 * Does every image we serve have a licence that permits selling access to it?
 *
 * This exists because the answer was recorded as prose and the prose was not a
 * licence. "NIH Open-i / PubMed Central (open access)" describes how an article
 * may be READ; the PMC open-access subset mixes CC BY with CC BY-NC and
 * CC BY-ND, and only the first of those permits a product that is sold. A
 * dataset-level "ISIC Archive — CC-BY license" was likewise a guess, because
 * ISIC licenses each image separately.
 *
 * The check is deliberately unforgiving in one direction: an image with no
 * established licence is an error, not a warning. Unknown provenance is the
 * state that gets a product into trouble, and it is indistinguishable from
 * "nobody has looked yet" unless something refuses to pass.
 *
 *   npx tsx scripts/check-image-licenses.mts
 *   npx tsx scripts/check-image-licenses.mts --detail   # every file, not a summary
 *   npx tsx scripts/check-image-licenses.mts --json
 */
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

const { resolveProvenance, licenseProblem, isCommerciallyUsable } =
  await import('../app/lib/imageAttributes')
type DatasetProvenance = import('../app/lib/imageAttributes').DatasetProvenance
type ImageProvenance = import('../app/lib/imageAttributes').ImageProvenance

const args = process.argv.slice(2)
const detail = args.includes('--detail')
const asJson = args.includes('--json')

/**
 * Every directory a student can be served an image from.
 *
 * `keyed` datasets list their files in index.json under `category/file` keys,
 * which is also how their metadata and blocklists are keyed. `flat` datasets
 * are a directory of files bound to cases directly (the chest films), so the
 * key is the bare filename.
 */
const DATASETS: Array<{ dir: string; kind: 'keyed' | 'flat' }> = [
  { dir: 'ecg', kind: 'keyed' },
  { dir: 'images/derm', kind: 'keyed' },
  { dir: 'images/fundus', kind: 'keyed' },
  { dir: 'images/smear', kind: 'keyed' },
  { dir: 'images/biopsy', kind: 'keyed' },
  { dir: 'images/urine', kind: 'keyed' },
  { dir: 'imaging', kind: 'flat' },
]

async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, rel), 'utf8')) as T
  } catch {
    return null
  }
}

/** The `category/file` keys a dataset actually serves, minus anything blocked. */
async function servedKeys(dir: string, kind: 'keyed' | 'flat'): Promise<string[]> {
  const blocked = new Set((await readJson<string[]>(`${dir}/blocklist.json`)) ?? [])
  if (kind === 'flat') {
    try {
      const files = await fs.readdir(path.join(PUBLIC_DIR, dir))
      return files.filter(f => /\.(png|jpe?g|svg|webp)$/i.test(f) && !blocked.has(f))
    } catch {
      return []
    }
  }
  const index = (await readJson<Record<string, string[]>>(`${dir}/index.json`)) ?? {}
  return Object.entries(index)
    .flatMap(([cat, files]) => files.map(f => `${cat}/${f}`))
    .filter(k => !blocked.has(k))
}

/** Whatever the per-image metadata entry claims for itself. */
function inlineProvenance(entry: unknown): Partial<ImageProvenance> | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const f of ['source', 'sourceId', 'license', 'licenseUrl', 'attribution']) {
    if (e[f] != null) out[f] = e[f]
  }
  return Object.keys(out).length ? (out as Partial<ImageProvenance>) : undefined
}

interface Finding { dataset: string; key: string; problem: string; license: string }

const findings: Finding[] = []
const summary: Array<{ dataset: string; total: number; ok: number; license: string }> = []

for (const { dir, kind } of DATASETS) {
  const keys = await servedKeys(dir, kind)
  if (!keys.length) continue

  const dataset = await readJson<DatasetProvenance>(`${dir}/provenance.json`)
  const meta = (await readJson<Record<string, unknown>>(`${dir}/metadata.json`)) ?? {}

  let ok = 0
  for (const key of keys) {
    const prov = resolveProvenance(dataset ?? undefined, key, inlineProvenance(meta[key]))
    const problem = licenseProblem(prov)
    if (!problem) { ok++; continue }
    findings.push({ dataset: dir, key, problem, license: prov?.license ?? 'none' })
  }
  summary.push({ dataset: dir, total: keys.length, ok, license: dataset?.default.license ?? 'none' })
}

if (asJson) {
  console.log(JSON.stringify({ summary, findings }, null, 2))
  process.exit(findings.length ? 1 : 0)
}

const totalImages = summary.reduce((s, d) => s + d.total, 0)
const totalOk = summary.reduce((s, d) => s + d.ok, 0)

console.log(`\nscanned ${totalImages} served image(s) across ${summary.length} dataset(s)\n`)
for (const d of summary) {
  const mark = d.ok === d.total ? 'OK  ' : 'FAIL'
  console.log(`  ${mark} ${d.dataset.padEnd(16)} ${String(d.ok).padStart(4)}/${String(d.total).padEnd(4)} cleared   [${d.license}]`)
}

if (findings.length) {
  // Group by the reason: 87 images failing for one reason is one decision to
  // make, not 87, and the per-file list only obscures that.
  const byProblem = new Map<string, Finding[]>()
  for (const f of findings) {
    const bucket = `${f.dataset}: ${f.problem}`
    byProblem.set(bucket, [...(byProblem.get(bucket) ?? []), f])
  }
  console.log('\n── not cleared for commercial use ──')
  for (const [problem, group] of [...byProblem].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${group.length} image(s) — ${problem}`)
    const show = detail ? group : group.slice(0, 3)
    for (const f of show) console.log(`      ${f.key}`)
    if (!detail && group.length > show.length) console.log(`      … ${group.length - show.length} more (use --detail)`)
  }
}

console.log(`\n${totalOk}/${totalImages} cleared, ${findings.length} not cleared`)
if (findings.length) {
  console.log('\nAn image is only cleared when its licence is recorded AND permits commercial use')
  console.log('AND, where the licence requires it, an attribution line is recorded to display.')
}
process.exit(findings.length ? 1 : 0)
