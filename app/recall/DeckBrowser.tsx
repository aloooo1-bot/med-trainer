'use client'

import { useState, useMemo } from 'react'
import type { ReviewItem, ReviewTag } from '@/app/lib/reasoning/types'

const TAG_LABEL: Record<ReviewTag, string> = {
  discriminator: 'Discriminator', management: 'Management', cutoff: 'Cutoff', mechanism: 'Mechanism',
}
const DAY = 86_400_000

function dueLabel(dueAt: number, now: number): { text: string; due: boolean } {
  const ms = dueAt - now
  if (ms <= 0) return { text: 'due now', due: true }
  const days = Math.ceil(ms / DAY)
  return { text: days <= 1 ? 'due tomorrow' : `due in ${days}d`, due: false }
}

/** Browse + search the full spaced-repetition deck with each card's schedule. */
export default function DeckBrowser({ items, now }: { items: ReviewItem[]; now: number }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim()
    const base = needle
      ? items.filter(i =>
          i.diagnosis.toLowerCase().includes(needle) ||
          i.system.toLowerCase().includes(needle) ||
          i.prompt.toLowerCase().includes(needle) ||
          i.tag.toLowerCase().includes(needle))
      : items
    return [...base].sort((a, b) => a.dueAt - b.dueAt)
  }, [items, q])

  const dueNow = useMemo(() => items.filter(i => i.dueAt <= now).length, [items, now])
  const mature = useMemo(() => items.filter(i => i.intervalDays >= 21).length, [items])

  if (items.length === 0) return null

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
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by diagnosis, system, tag, or prompt…"
          aria-label="Search review deck"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
        />
        {filtered.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No cards match “{q}”.</p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0, maxHeight: 360, overflowY: 'auto' }}>
            {filtered.map(item => {
              const d = dueLabel(item.dueAt, now)
              return (
                <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
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
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
