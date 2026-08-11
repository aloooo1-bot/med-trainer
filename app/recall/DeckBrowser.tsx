'use client'

import { useState, useMemo, useEffect } from 'react'
import type { ReviewItem, ReviewTag } from '@/app/lib/reasoning/types'
import { buildAnkiTsv, ankiExportFilename } from '@/app/lib/reasoning/ankiExport'

const TAG_LABEL: Record<ReviewTag, string> = {
  discriminator: 'Discriminator', management: 'Management', cutoff: 'Cutoff', mechanism: 'Mechanism',
}
const DAY = 86_400_000
const RENDER_STEP = 100
const LAST_EXPORT_KEY = 'medtrainer_last_anki_export'

function loadLastExport(): number | null {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

function saveLastExport(ms: number): void {
  try { localStorage.setItem(LAST_EXPORT_KEY, String(ms)) } catch {}
}

function dueLabel(dueAt: number, now: number): { text: string; due: boolean } {
  const ms = dueAt - now
  if (ms <= 0) return { text: 'due now', due: true }
  const days = Math.ceil(ms / DAY)
  return { text: days <= 1 ? 'due tomorrow' : `due in ${days}d`, due: false }
}

/** Trigger a client-side download of the given cards as an Anki-importable TSV. */
function downloadAnkiExport(items: ReviewItem[], now: number): void {
  const blob = new Blob([buildAnkiTsv(items)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ankiExportFilename(now)
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Browse + search the full spaced-repetition deck.
 *
 * Rows expand on click to show the full answer (read-only — reading a card
 * here never touches its schedule). Cards are selectable for a partial Anki
 * export; each export stamps a timestamp so "New since last export" can pick
 * up exactly the cards minted since.
 */
export default function DeckBrowser({ items, now }: { items: ReviewItem[]; now: number }) {
  const [q, setQ] = useState('')
  const [tagFilter, setTagFilter] = useState<'all' | ReviewTag>('all')
  const [dueOnly, setDueOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renderCap, setRenderCap] = useState(RENDER_STEP)
  const [lastExport, setLastExport] = useState<number | null>(null)
  const [exportedTick, setExportedTick] = useState(false)

  useEffect(() => {
    // Mount-only read (localStorage is unavailable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastExport(loadLastExport())
  }, [])

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim()
    const base = items.filter(i => {
      if (tagFilter !== 'all' && i.tag !== tagFilter) return false
      if (dueOnly && i.dueAt > now) return false
      if (needle && !(
        i.diagnosis.toLowerCase().includes(needle) ||
        i.system.toLowerCase().includes(needle) ||
        i.prompt.toLowerCase().includes(needle) ||
        i.tag.toLowerCase().includes(needle)
      )) return false
      return true
    })
    return [...base].sort((a, b) => a.dueAt - b.dueAt)
  }, [items, q, tagFilter, dueOnly, now])

  const dueNow = useMemo(() => items.filter(i => i.dueAt <= now).length, [items, now])
  const mature = useMemo(() => items.filter(i => i.intervalDays >= 21).length, [items])
  // No export stamp yet → every card counts as new.
  const newSinceExport = useMemo(
    () => items.filter(i => lastExport == null || i.createdAt > lastExport),
    [items, lastExport],
  )

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doExport = () => {
    const chosen = selected.size > 0 ? items.filter(i => selected.has(i.id)) : items
    if (chosen.length === 0) return
    const t = Date.now()
    downloadAnkiExport(chosen, t)
    saveLastExport(t)
    setLastExport(t)
    setSelected(new Set())
    setExportedTick(true)
    setTimeout(() => setExportedTick(false), 2500)
  }

  if (items.length === 0) return null

  const visible = filtered.slice(0, renderCap)

  return (
    <div className="dx-card">
      <div className="dx-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Your deck</div>
        <div
          style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}
          title="Mature = review interval of 3+ weeks, i.e. reliably remembered"
        >
          {items.length} cards · {dueNow} due · {mature} mature
        </div>
      </div>
      <div className="dx-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={q}
            onChange={e => { setQ(e.target.value); setRenderCap(RENDER_STEP) }}
            placeholder="Search by diagnosis, system, tag, or prompt…"
            aria-label="Search review deck"
            style={{ flex: '1 1 200px', minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
          />
          <select
            className="dx-select"
            value={tagFilter}
            onChange={e => { setTagFilter(e.target.value as 'all' | ReviewTag); setRenderCap(RENDER_STEP) }}
            aria-label="Filter by card type"
            style={{ fontSize: 12, padding: '6px 8px' }}
          >
            <option value="all">All types</option>
            {(Object.keys(TAG_LABEL) as ReviewTag[]).map(t => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
          </select>
          <button
            className={`dx-chip${dueOnly ? ' active' : ''}`}
            onClick={() => { setDueOnly(v => !v); setRenderCap(RENDER_STEP) }}
          >
            Due now
          </button>
        </div>

        {/* Selection + export toolbar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
          <button className="dx-chip" onClick={() => setSelected(new Set(filtered.map(i => i.id)))}>
            Select all ({filtered.length})
          </button>
          <button
            className="dx-chip"
            onClick={() => setSelected(new Set(newSinceExport.map(i => i.id)))}
            disabled={newSinceExport.length === 0}
            title={lastExport == null ? 'No export recorded yet — every card counts as new' : `Cards created since your last export on ${new Date(lastExport).toLocaleDateString()}`}
          >
            New since last export ({newSinceExport.length})
          </button>
          {selected.size > 0 && (
            <button className="dx-chip" onClick={() => setSelected(new Set())} style={{ color: 'var(--muted)' }}>
              Clear
            </button>
          )}
          <span style={{ flex: 1 }} />
          {exportedTick && <span style={{ color: 'var(--green)', fontWeight: 600 }}>Exported ✓</span>}
          <button
            type="button"
            onClick={doExport}
            title="Download as an Anki plain-text import (File → Import). Cards arrive as new; your review schedule stays here."
            style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}
          >
            {selected.size > 0 ? `Export ${selected.size} selected` : `Export all ${items.length}`}
          </button>
        </div>

        {filtered.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No cards match these filters.</p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0, maxHeight: 420, overflowY: 'auto' }}>
            {visible.map(item => {
              const d = dueLabel(item.dueAt, now)
              const open = expandedId === item.id
              return (
                <li key={item.id} style={{ borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setExpandedId(open ? null : item.id)}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(open ? null : item.id) }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      onClick={e => e.stopPropagation()}
                      aria-label={`Select ${item.diagnosis} ${item.tag} card for export`}
                      style={{ flexShrink: 0, accentColor: 'var(--accent)' }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.prompt}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                        {TAG_LABEL[item.tag]} · {item.diagnosis} · {item.system}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: d.due ? 'var(--red)' : 'var(--muted)' }}>{d.text}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>×{item.repetitions}</div>
                    </div>
                    <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)', transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </div>
                  {open && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px 10px 38px', background: 'var(--surface2)' }}>
                      {/* Reading a card here never touches its schedule. */}
                      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{item.answer}</p>
                      <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                        ease {item.ease} · interval {item.intervalDays}d · {item.repetitions} review{item.repetitions === 1 ? '' : 's'}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {filtered.length > renderCap && (
          <button
            className="dx-chip"
            onClick={() => setRenderCap(c => c + RENDER_STEP)}
            style={{ alignSelf: 'center' }}
          >
            Show {Math.min(RENDER_STEP, filtered.length - renderCap)} more of {filtered.length - renderCap}
          </button>
        )}
      </div>
    </div>
  )
}
