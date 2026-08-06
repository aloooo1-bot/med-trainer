/**
 * Migrate public/ecg/metadata.json to the entry shape that can hold provenance.
 *
 * The file was `path -> report string`, which left nowhere to record which
 * PTB-XL record a tracing came from. PTB-XL is CC BY 4.0 and that licence is
 * granted on condition the source is credited, so the string shape made a
 * condition of the licence impossible to satisfy per image.
 *
 * The `ecg_id` is recoverable without refetching anything: the filename stem IS
 * the record id (afib/00351.svg is ecg_id 351). Source and licence come from
 * the dataset default in public/ecg/provenance.json, so only the identifier is
 * written here — the part that differs per image.
 *
 *   npx tsx scripts/backfill-ecg-provenance.mts --dry-run
 *   npx tsx scripts/backfill-ecg-provenance.mts
 */
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const META = path.join(ROOT, 'public', 'ecg', 'metadata.json')
const dryRun = process.argv.includes('--dry-run')

type Entry = { report: string; sourceId?: string }

const raw = JSON.parse(await fs.readFile(META, 'utf8')) as Record<string, string | Entry>
const out: Record<string, Entry> = {}
let migrated = 0, already = 0, unparsed = 0

for (const [key, value] of Object.entries(raw)) {
  // afib/00351.svg -> "351". Zero-padding is presentational; the dataset's own
  // ecg_id is the integer, and that is what a reader would look up.
  const stem = path.basename(key).replace(/\.[^.]+$/, '')
  const id = /^\d+$/.test(stem) ? String(Number(stem)) : null
  if (!id) unparsed++

  if (typeof value === 'string') {
    out[key] = { report: value, ...(id ? { sourceId: `ptb-xl:${id}` } : {}) }
    migrated++
  } else {
    out[key] = { ...value, ...(id && !value.sourceId ? { sourceId: `ptb-xl:${id}` } : {}) }
    already++
  }
}

console.log(`${migrated} migrated from string shape, ${already} already objects`)
if (unparsed) console.log(`WARNING: ${unparsed} filename(s) are not a numeric ecg_id — no sourceId written for those`)
const sample = Object.entries(out)[0]
console.log(`\nsample:\n  ${sample[0]}\n  ${JSON.stringify(sample[1])}`)

if (dryRun) { console.log('\n--dry-run: nothing written.'); process.exit(0) }
await fs.writeFile(META, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(`\nwrote ${Object.keys(out).length} entries -> ${path.relative(ROOT, META)}`)
