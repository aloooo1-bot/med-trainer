'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { MasteryRecord } from '@/app/lib/reasoning/types'
import { isMastered } from '@/app/lib/reasoning/mastery'

/**
 * Mastery as anatomy: each trained organ system fills in on a schematic figure,
 * tinted by how well it is going, so a student sees their coverage as a body
 * rather than a table of numbers.
 *
 * DESIGN NOTE — only 7 of the 12 tracked systems are anatomically localizable.
 * Infectious, Toxicologic, Psychiatric, Hematologic/Oncologic and Trauma are
 * systemic or cross-cutting; pinning them to an organ would be arbitrary
 * (Psychiatric would collide with Neurologic at the head, Toxicologic on a
 * liver is a guess) and would teach a wrong mental model. They are shown
 * honestly as a systemic band beneath the figure instead of being forced onto
 * the anatomy.
 */

export interface SystemMastery {
  system: string
  /** Attempts-weighted mean score across the difficulties attempted (0-100). */
  score: number
  attempts: number
  /** How many of the three difficulty slots meet the mastery bar. */
  masteredSlots: number
  attempted: boolean
}

/** Systems that map to a drawn region, in render order. */
const BODY_SYSTEMS = [
  'Neurologic',
  'Endocrine / Metabolic',
  'Respiratory',
  'Cardiovascular',
  'Gastrointestinal',
  'Renal',
  'Musculoskeletal',
] as const

/** Tracked systems with no single anatomical home. */
const SYSTEMIC_SYSTEMS = [
  'Infectious',
  'Hematologic / Oncologic',
  'Psychiatric',
  'Toxicologic',
  'Trauma',
] as const

export function aggregateMastery(records: MasteryRecord[], systems: readonly string[]): Map<string, SystemMastery> {
  const out = new Map<string, SystemMastery>()
  for (const system of systems) {
    const rows = records.filter(r => r.system === system)
    const attempts = rows.reduce((a, r) => a + r.attempts, 0)
    // Weight by attempts so a single lucky Advanced run can't outrank a solid
    // body of Foundations work.
    const score = attempts > 0
      ? Math.round(rows.reduce((a, r) => a + r.score * r.attempts, 0) / attempts)
      : 0
    out.set(system, {
      system,
      score,
      attempts,
      masteredSlots: rows.filter(isMastered).length,
      attempted: rows.length > 0,
    })
  }
  return out
}

function tone(m: SystemMastery | undefined): { stroke: string; fill: string; fillOpacity: number } {
  if (!m?.attempted) {
    return { stroke: 'var(--color-surface-4)', fill: 'var(--color-surface-3)', fillOpacity: 0.35 }
  }
  const c = m.score < 60 ? 'var(--color-critical)' : m.score < 75 ? 'var(--color-caution)' : 'var(--color-confirmed)'
  // Stronger fill as the score climbs — the body visibly "fills in" with skill.
  return { stroke: c, fill: c, fillOpacity: 0.18 + (Math.min(100, m.score) / 100) * 0.5 }
}

/** The drawn regions. Paths are schematic, not clinical illustration. */
function regionShapes(system: string) {
  switch (system) {
    case 'Neurologic':
      return (
        <>
          <ellipse cx="110" cy="48" rx="21" ry="19" />
          <path d="M110,30 C104,36 104,42 110,48 C116,54 116,60 110,66" fill="none" strokeWidth="1.2" />
        </>
      )
    case 'Endocrine / Metabolic':
      return (
        <>
          <ellipse cx="103" cy="92" rx="5.5" ry="6.5" />
          <ellipse cx="117" cy="92" rx="5.5" ry="6.5" />
          <path d="M108,92 h4" fill="none" strokeWidth="1.4" />
        </>
      )
    case 'Respiratory':
      return (
        <>
          <path d="M97,110 C88,116 84,133 85,152 C86,166 92,173 99,170 C103,167 104,150 104,132 C104,119 103,110 97,110 Z" />
          <path d="M123,110 C132,116 136,133 135,152 C134,166 128,173 121,170 C117,167 116,150 116,132 C116,119 117,110 123,110 Z" />
        </>
      )
    case 'Cardiovascular':
      return (
        <path d="M110,140 C106,131 95,131 95,142 C95,152 105,159 110,165 C115,159 125,152 125,142 C125,131 114,131 110,140 Z" />
      )
    case 'Gastrointestinal':
      return (
        <path d="M93,181 Q110,174 127,181 Q134,193 127,205 Q110,213 93,205 Q86,193 93,181 Z" />
      )
    case 'Renal':
      return (
        <>
          <path d="M89,176 C82,179 80,190 85,197 C90,202 93,197 93,190 C93,183 94,176 89,176 Z" />
          <path d="M131,176 C138,179 140,190 135,197 C130,202 127,197 127,190 C127,183 126,176 131,176 Z" />
        </>
      )
    case 'Musculoskeletal':
      return (
        <>
          <path d="M76,108 Q62,152 55,208 Q53,216 61,217 Q67,215 70,208 Q78,154 84,114 Z" />
          <path d="M144,108 Q158,152 165,208 Q167,216 159,217 Q153,215 150,208 Q142,154 136,114 Z" />
          <path d="M85,224 Q81,300 79,392 Q79,401 89,401 Q97,401 97,392 Q101,300 105,226 Z" />
          <path d="M135,224 Q139,300 141,392 Q141,401 131,401 Q123,401 123,392 Q119,300 115,226 Z" />
        </>
      )
    default:
      return null
  }
}

export function MasteryBodyMap({ records, tier = 'free' }: { records: MasteryRecord[]; tier?: string }) {
  const all = useMemo(
    () => aggregateMastery(records, [...BODY_SYSTEMS, ...SYSTEMIC_SYSTEMS]),
    [records],
  )
  const [active, setActive] = useState<string | null>(null)

  const attemptedCount = [...all.values()].filter(m => m.attempted).length
  const masteredCount = [...all.values()].filter(m => m.masteredSlots > 0).length
  const shown = active ? all.get(active) : undefined
  // Free accounts train at Foundations only.
  const practiceHref = shown
    ? `/trainer?system=${encodeURIComponent(shown.system)}&difficulty=${tier === 'pro' ? 'Clinical' : 'Foundations'}`
    : '/trainer'

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <svg
        viewBox="0 0 220 415"
        width="188"
        height="355"
        role="group"
        aria-label="Mastery by body system"
        style={{ flexShrink: 0, overflow: 'visible' }}
      >
        {/* Silhouette — the body itself, always faint. */}
        <g fill="var(--color-surface-2)" stroke="var(--color-surface-4)" strokeWidth="1">
          <ellipse cx="110" cy="48" rx="31" ry="37" />
          <rect x="100" y="80" width="20" height="16" rx="5" />
          <path d="M76,102 Q110,92 144,102 L140,216 Q110,227 80,216 Z" />
          <path d="M76,108 Q62,152 55,208 Q53,216 61,217 Q67,215 70,208 Q78,154 84,114 Z" />
          <path d="M144,108 Q158,152 165,208 Q167,216 159,217 Q153,215 150,208 Q142,154 136,114 Z" />
          <path d="M85,224 Q81,300 79,392 Q79,401 89,401 Q97,401 97,392 Q101,300 105,226 Z" />
          <path d="M135,224 Q139,300 141,392 Q141,401 131,401 Q123,401 123,392 Q119,300 115,226 Z" />
        </g>

        {BODY_SYSTEMS.map(system => {
          const m = all.get(system)
          const t = tone(m)
          const isActive = active === system
          const label = m?.attempted
            ? `${system}: average ${m.score} of 100 across ${m.attempts} attempt${m.attempts === 1 ? '' : 's'}`
            : `${system}: not yet attempted`
          return (
            <g
              key={system}
              role="button"
              tabIndex={0}
              aria-label={label}
              onMouseEnter={() => setActive(system)}
              onMouseLeave={() => setActive(a => (a === system ? null : a))}
              onFocus={() => setActive(system)}
              onBlur={() => setActive(a => (a === system ? null : a))}
              style={{ cursor: 'pointer', outline: 'none' }}
              fill={t.fill}
              fillOpacity={isActive ? Math.min(0.95, t.fillOpacity + 0.2) : t.fillOpacity}
              stroke={t.stroke}
              strokeWidth={isActive ? 2.2 : 1.4}
              strokeLinejoin="round"
              className="motion-safe:transition-all motion-safe:duration-300"
            >
              {regionShapes(system)}
            </g>
          )
        })}
      </svg>

      {/* Detail panel — replaces a floating tooltip so it is keyboard-reachable. */}
      <div style={{ flex: '1 1 210px', minWidth: 200 }}>
        {shown ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{shown.system}</div>
            {shown.attempted ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 26, fontWeight: 700,
                    color: shown.score < 60 ? 'var(--red)' : shown.score < 75 ? 'var(--amber)' : 'var(--green)',
                  }}>{shown.score}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>avg / 100</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {shown.attempts} attempt{shown.attempts === 1 ? '' : 's'} · {shown.masteredSlots}/3 levels mastered
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Not attempted yet.</div>
            )}
            <Link
              href={practiceHref}
              style={{ display: 'inline-block', marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
            >
              Practice this →
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {attemptedCount} of 12 systems trained
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {masteredCount > 0 ? `${masteredCount} with a mastered level.` : 'No systems mastered yet.'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
              Hover or focus a region for detail. Colour shows your average score;
              regions fill in as you improve.
            </div>
          </div>
        )}

        {/* Systemic domains — deliberately not pinned to anatomy. */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 6 }}>
            Systemic
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {SYSTEMIC_SYSTEMS.map(system => {
              const m = all.get(system)
              const c = !m?.attempted
                ? 'var(--muted)'
                : m.score < 60 ? 'var(--red)' : m.score < 75 ? 'var(--amber)' : 'var(--green)'
              return (
                <button
                  key={system}
                  onMouseEnter={() => setActive(system)}
                  onMouseLeave={() => setActive(a => (a === system ? null : a))}
                  onFocus={() => setActive(system)}
                  onBlur={() => setActive(a => (a === system ? null : a))}
                  aria-label={m?.attempted ? `${system}: average ${m.score} of 100` : `${system}: not yet attempted`}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${active === system ? c : 'var(--border)'}`,
                    background: m?.attempted ? 'color-mix(in srgb, ' + c + ' 12%, transparent)' : 'transparent',
                    color: m?.attempted ? c : 'var(--muted)',
                    fontWeight: m?.attempted ? 600 : 400,
                  }}
                >
                  {system.split(' / ')[0]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
