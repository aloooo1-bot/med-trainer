/**
 * Run the Supabase SQL migrations over a direct Postgres connection.
 *
 * DDL (CREATE TABLE / ALTER / GRANT / POLICY) can't go through the PostgREST
 * API — it needs a real Postgres connection. Provide the connection string as
 * SUPABASE_DB_URL in .env.local (Supabase dashboard → Settings → Database →
 * Connection string → URI; use the "Session"/direct or the pooler URI, it must
 * include the DB password). The value stays in your env file.
 *
 * Idempotent: each statement runs independently and "already exists" errors are
 * skipped, so re-running is safe.
 *
 * Usage:
 *   node scripts/run-migrations.mjs                 # run 0001 then 0002
 *   node scripts/run-migrations.mjs 0002            # run only files matching "0002"
 *   node scripts/run-migrations.mjs --dry-run       # list statements, don't execute
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import pkg from 'pg'
const { Client } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const filter = args.find(a => !a.startsWith('--'))

const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!DB_URL && !dryRun) {
  console.error(`SUPABASE_DB_URL not set in .env.local.

Add it (value stays in your env file — never printed):
  Supabase dashboard → Settings → Database → Connection string → URI
  SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

Then re-run: node scripts/run-migrations.mjs`)
  process.exit(1)
}

const MIG_DIR = path.join(ROOT, 'supabase', 'migrations')
let files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()
if (filter) files = files.filter(f => f.includes(filter))
if (!files.length) { console.error('No migration files matched.'); process.exit(1) }

// Split a .sql file into individual statements. Our migrations contain no
// dollar-quoted function bodies (those live in schema.sql, not run here), so a
// comment-stripped split on ';' is safe.
function splitStatements(sql) {
  const noComments = sql.replace(/^\s*--.*$/gm, '')
  return noComments.split(';').map(s => s.trim()).filter(Boolean)
}

// Postgres "already exists / does not need doing" codes → skip, don't fail.
const SKIP_CODES = new Set(['42P07', '42710', '42701', '42P06', '42P16', '42723'])

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

try {
  if (!dryRun) { await client.connect(); console.log('connected to Postgres') }
  for (const file of files) {
    const statements = splitStatements(fs.readFileSync(path.join(MIG_DIR, file), 'utf8'))
    console.log(`\n── ${file} — ${statements.length} statements ──`)
    let ran = 0, skipped = 0
    for (const stmt of statements) {
      const label = stmt.replace(/\s+/g, ' ').slice(0, 70)
      if (dryRun) { console.log(`  · ${label}…`); continue }
      try {
        await client.query(stmt)
        ran++
        console.log(`  ✓ ${label}…`)
      } catch (e) {
        if (SKIP_CODES.has(e.code)) { skipped++; console.log(`  – ${label}… (already applied: ${e.code})`) }
        else { console.error(`  ✗ ${label}…\n    ${e.code} ${e.message}`); throw e }
      }
    }
    console.log(`  ${dryRun ? 'planned' : `${ran} applied, ${skipped} skipped`}`)
  }
  console.log(dryRun ? '\n[dry-run] nothing executed.' : '\nMigrations complete.')
} finally {
  if (!dryRun) await client.end().catch(() => {})
}
