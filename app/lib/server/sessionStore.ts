import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { createAdminClient } from '../supabase/admin'
import type { CaseData } from '../../trainer/_lib/types'

/**
 * Server-authoritative session state + event log.
 *
 * The event log — not React state — is the record of what a student asked,
 * examined, ordered, and predicted. Grading reads exclusively from it, and a
 * page refresh resumes from it.
 *
 * Backends:
 *  - Supabase (`trainer_sessions` + `session_events`, service-role writes) —
 *    the production path; see supabase/migrations/.
 *  - Local JSON files under .data/sessions/ — development fallback used when
 *    SESSION_STORE=file or when Supabase is unreachable in dev (the original
 *    project was deleted; see README note in supabase/migrations/).
 */

export type SessionPhase = 'active' | 'presentation' | 'graded'

export type SessionEventType =
  | 'start'
  | 'ask'
  | 'exam'
  | 'order'
  | 'prediction'
  | 'enter_presentation'
  | 'submit'

export interface SessionEvent {
  ts: string
  type: SessionEventType
  payload: Record<string, unknown>
}

export interface TrainerSessionRecord {
  id: string
  userId: string
  caseId: string | null
  system: string
  /** Legacy combined axis — kept as the primary field while UX still couples them. */
  difficulty: string
  /** How hard the case content is (5.3 — today always equals difficulty). */
  caseComplexity?: string
  /** How much interface scaffolding the student gets (5.3 — today always equals difficulty). */
  scaffoldingLevel?: string
  phase: SessionPhase
  createdAt: string
  /** Full jittered case snapshot — server-only, never returned to the client. */
  caseData: CaseData
  /** Pre-verified imaging results keyed by test name (served via /api/session/images). */
  imagingCache?: Record<string, unknown[]>
}

export interface SessionWithEvents {
  session: TrainerSessionRecord
  events: SessionEvent[]
}

export interface SessionStore {
  create(session: TrainerSessionRecord): Promise<void>
  get(id: string): Promise<SessionWithEvents | null>
  appendEvent(id: string, event: SessionEvent): Promise<void>
  setPhase(id: string, phase: SessionPhase): Promise<void>
  /** Persist snapshot changes (e.g. on-demand generated results merged in). */
  updateCaseData(id: string, caseData: CaseData): Promise<void>
  /** Most recent non-graded session for resume-on-refresh. */
  latestActiveFor(userId: string): Promise<SessionWithEvents | null>
}

// ── File store (dev fallback) ─────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), '.data', 'sessions')

class FileSessionStore implements SessionStore {
  private async filePath(id: string): Promise<string> {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid session id')
    await fs.mkdir(DATA_DIR, { recursive: true })
    return path.join(DATA_DIR, `${id}.json`)
  }

  async create(session: TrainerSessionRecord): Promise<void> {
    const fp = await this.filePath(session.id)
    await fs.writeFile(fp, JSON.stringify({ session, events: [] }, null, 2), 'utf8')
  }

  async get(id: string): Promise<SessionWithEvents | null> {
    try {
      const fp = await this.filePath(id)
      return JSON.parse(await fs.readFile(fp, 'utf8')) as SessionWithEvents
    } catch {
      return null
    }
  }

  async appendEvent(id: string, event: SessionEvent): Promise<void> {
    const data = await this.get(id)
    if (!data) throw new Error(`Session ${id} not found`)
    data.events.push(event)
    await fs.writeFile(await this.filePath(id), JSON.stringify(data, null, 2), 'utf8')
  }

  async setPhase(id: string, phase: SessionPhase): Promise<void> {
    const data = await this.get(id)
    if (!data) throw new Error(`Session ${id} not found`)
    data.session.phase = phase
    await fs.writeFile(await this.filePath(id), JSON.stringify(data, null, 2), 'utf8')
  }

  async updateCaseData(id: string, caseData: CaseData): Promise<void> {
    const data = await this.get(id)
    if (!data) throw new Error(`Session ${id} not found`)
    data.session.caseData = caseData
    await fs.writeFile(await this.filePath(id), JSON.stringify(data, null, 2), 'utf8')
  }

  async latestActiveFor(userId: string): Promise<SessionWithEvents | null> {
    try {
      const files = await fs.readdir(DATA_DIR)
      let best: SessionWithEvents | null = null
      for (const f of files) {
        if (!f.endsWith('.json')) continue
        try {
          const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8')) as SessionWithEvents
          if (data.session.userId !== userId || data.session.phase === 'graded') continue
          if (!best || data.session.createdAt > best.session.createdAt) best = data
        } catch { /* skip corrupt file */ }
      }
      return best
    } catch {
      return null
    }
  }
}

// ── Supabase store (production) ───────────────────────────────────────────────

class SupabaseSessionStore implements SessionStore {
  private db = createAdminClient()

  async create(session: TrainerSessionRecord): Promise<void> {
    const { error } = await this.db.from('trainer_sessions').insert({
      id: session.id,
      user_id: session.userId,
      case_id: session.caseId,
      system: session.system,
      difficulty: session.difficulty,
      case_complexity: session.caseComplexity ?? session.difficulty,
      scaffolding_level: session.scaffoldingLevel ?? session.difficulty,
      phase: session.phase,
      case_snapshot: { caseData: session.caseData, imagingCache: session.imagingCache ?? null } as unknown as Record<string, unknown>,
      created_at: session.createdAt,
    })
    if (error) throw new Error(`trainer_sessions insert failed: ${error.message}`)
  }

  async get(id: string): Promise<SessionWithEvents | null> {
    const { data: row, error } = await this.db
      .from('trainer_sessions').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`trainer_sessions read failed: ${error.message}`)
    if (!row) return null
    const { data: events, error: evErr } = await this.db
      .from('session_events').select('ts, type, payload')
      .eq('session_id', id).order('ts', { ascending: true }).order('id', { ascending: true })
    if (evErr) throw new Error(`session_events read failed: ${evErr.message}`)
    return { session: this.rowToSession(row), events: (events ?? []) as SessionEvent[] }
  }

  async appendEvent(id: string, event: SessionEvent): Promise<void> {
    const { error } = await this.db.from('session_events').insert({
      session_id: id, ts: event.ts, type: event.type, payload: event.payload,
    })
    if (error) throw new Error(`session_events insert failed: ${error.message}`)
  }

  async setPhase(id: string, phase: SessionPhase): Promise<void> {
    const { error } = await this.db.from('trainer_sessions').update({ phase }).eq('id', id)
    if (error) throw new Error(`trainer_sessions update failed: ${error.message}`)
  }

  async updateCaseData(id: string, caseData: CaseData): Promise<void> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`Session ${id} not found`)
    const { error } = await this.db.from('trainer_sessions')
      .update({ case_snapshot: { caseData, imagingCache: existing.session.imagingCache ?? null } as unknown as Record<string, unknown> })
      .eq('id', id)
    if (error) throw new Error(`trainer_sessions update failed: ${error.message}`)
  }

  async latestActiveFor(userId: string): Promise<SessionWithEvents | null> {
    const { data: row, error } = await this.db
      .from('trainer_sessions').select('id')
      .eq('user_id', userId).neq('phase', 'graded')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(`trainer_sessions read failed: ${error.message}`)
    return row ? this.get(row.id as string) : null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToSession(row: any): TrainerSessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      caseId: row.case_id,
      system: row.system,
      difficulty: row.difficulty,
      caseComplexity: row.case_complexity ?? row.difficulty,
      scaffoldingLevel: row.scaffolding_level ?? row.difficulty,
      phase: row.phase,
      createdAt: row.created_at,
      caseData: (row.case_snapshot?.caseData ?? row.case_snapshot) as CaseData,
      imagingCache: row.case_snapshot?.imagingCache ?? undefined,
    }
  }
}

// ── Store selection ───────────────────────────────────────────────────────────

let _store: SessionStore | null = null

export async function getSessionStore(): Promise<SessionStore> {
  if (_store) return _store

  if (process.env.SESSION_STORE === 'file' || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _store = new FileSessionStore()
    return _store
  }

  const supa = new SupabaseSessionStore()
  try {
    // Cheap reachability probe — the configured project may no longer exist.
    await Promise.race([
      supa.get('00000000-0000-0000-0000-000000000000'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 4000)),
    ])
    _store = supa
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[sessionStore] Supabase unreachable (${(e as Error).message}) — falling back to local file store (.data/sessions/). ` +
        'Set SESSION_STORE=file to silence this, or restore the Supabase project for production.',
      )
      _store = new FileSessionStore()
    } else {
      throw e
    }
  }
  return _store
}

export function makeEvent(type: SessionEventType, payload: Record<string, unknown>): SessionEvent {
  return { ts: new Date().toISOString(), type, payload }
}
