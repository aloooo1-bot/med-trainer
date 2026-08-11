'use client'

import { useState } from 'react'

export const WORKING_DIFF_MAX = 10
export const WORKING_DIFF_ENTRY_MAX = 80

/**
 * The student's own living differential — a free-text list they build and
 * revise throughout the case, the way a working differential actually behaves
 * on the floor. Purely student-authored: no candidates are suggested (that
 * would cue the answer at gated difficulties).
 *
 * The list is private during the encounter, rides the grade request as
 * context for the grader (never penalized if absent — rubric rule), and is
 * echoed on the scorecard against the revealed differential.
 */
export function WorkingDifferential({
  items,
  onChange,
  disabled = false,
}: {
  items: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(true)

  const add = () => {
    const v = draft.trim().slice(0, WORKING_DIFF_ENTRY_MAX)
    if (!v || items.length >= WORKING_DIFF_MAX) return
    if (items.some(x => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return }
    onChange([...items, v])
    setDraft('')
  }
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="border-t border-surface-4">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left"
        >
          <svg
            className="h-3 w-3 flex-shrink-0 text-ink-tertiary"
            style={{ transition: 'transform 200ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">Your differential</span>
          {items.length > 0 && (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary border border-surface-4">{items.length}</span>
          )}
        </button>
        <span className="text-[10px] text-ink-tertiary">revise as results return</span>
      </div>
      {open && (
        <div className="px-4 pb-3">
          {items.length > 0 && (
            <ol className="mb-2 flex flex-col gap-1">
              {items.map((name, i) => (
                <li key={`${name}-${i}`} className="flex items-center gap-1.5 rounded border border-surface-3 bg-surface-0 px-2 py-1 text-[12px] text-ink-primary">
                  <span className="flex h-4.5 w-4.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px] text-ink-secondary">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
                  {!disabled && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${name} up`}
                        className="px-1 text-[11px] text-ink-tertiary hover:text-ink-primary disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${name} down`}
                        className="px-1 text-[11px] text-ink-tertiary hover:text-ink-primary disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => remove(i)} aria-label={`Remove ${name}`}
                        className="px-1 text-[12px] text-ink-tertiary hover:text-critical">×</button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!disabled && items.length < WORKING_DIFF_MAX && (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={draft}
                maxLength={WORKING_DIFF_ENTRY_MAX}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
                placeholder={items.length === 0 ? 'Add a diagnosis you’re considering…' : 'Add another…'}
                aria-label="Add a diagnosis to your differential"
                className="min-w-0 flex-1 rounded border border-surface-3 bg-surface-0 px-2 py-1 text-[12px] text-ink-primary placeholder-ink-tertiary focus:border-primary-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={add}
                disabled={!draft.trim()}
                className="rounded bg-surface-3 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary hover:bg-surface-4 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          )}
          {items.length === 0 && (
            <p className="mt-1.5 text-[10.5px] leading-snug text-ink-tertiary">
              Private while you work; shared with the grader as context when you submit. Never required.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
