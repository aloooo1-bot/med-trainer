'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Laterality = 'left' | 'right' | 'bilateral' | 'midline' | 'unknown'

interface ReviewImage {
  key: string
  category: string
  file: string
  publicPath: string
  attribute?: {
    laterality?: Laterality
    features?: string[]
    confidence?: number
    review?: 'auto' | 'human'
    reason?: string
  }
  blocked: boolean
}

const LATERALITIES: Laterality[] = ['left', 'right', 'bilateral', 'midline', 'unknown']

/**
 * Human review queue for image ↔ laterality tagging. Confirms/edits/rejects the
 * attributes the automated pass (scripts/review-images.mjs) produced, writing
 * the sidecars the serve-time fail-safe reads. Admin-gated by proxy.ts.
 * Sidecar writes work in local dev only — commit the results.
 */
export default function ImageReviewPage() {
  const [datasets, setDatasets] = useState<string[]>([])
  const [dataset, setDataset] = useState<string>('')
  const [images, setImages] = useState<ReviewImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'untagged' | 'auto' | 'human' | 'blocked'>('all')

  const load = useCallback(async (ds: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/images/review${ds ? `?dataset=${ds}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setDatasets(data.datasets ?? [])
      if (data.dataset) setImages(data.images ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Data-fetch effects: load() only sets state after an await, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load('') }, [load])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (dataset) void load(dataset) }, [dataset, load])

  const act = async (img: ReviewImage, action: 'confirm' | 'reject' | 'edit', laterality?: Laterality) => {
    setError(null)
    try {
      const res = await fetch('/api/admin/images/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, key: img.key, action, laterality }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      // Optimistic local update.
      setImages(prev => prev.map(x => {
        if (x.key !== img.key) return x
        if (action === 'reject') return { ...x, blocked: true }
        if (action === 'confirm') return { ...x, blocked: false, attribute: { ...x.attribute, review: 'human' } }
        return { ...x, blocked: false, attribute: { ...x.attribute, laterality, review: 'human' } }
      }))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const shown = images.filter(img => {
    if (filter === 'blocked') return img.blocked
    if (img.blocked) return filter === 'all'
    if (filter === 'untagged') return !img.attribute
    if (filter === 'auto') return img.attribute?.review === 'auto'
    if (filter === 'human') return img.attribute?.review === 'human'
    return true
  })

  const counts = {
    total: images.length,
    tagged: images.filter(i => i.attribute).length,
    human: images.filter(i => i.attribute?.review === 'human').length,
    blocked: images.filter(i => i.blocked).length,
  }

  return (
    <div className="min-h-screen bg-surface-0 text-ink-primary p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-serif text-xl font-semibold">Image Review — laterality tagging</h1>
          <Link href="/admin/cases" className="text-sm text-primary-400 hover:text-primary-300">← Cases</Link>
        </div>

        <p className="mb-4 text-sm text-ink-secondary max-w-3xl">
          Confirm, correct, or reject the side each image depicts. Verdicts write the
          <code className="mx-1 rounded bg-surface-2 px-1 text-xs">attributes.json</code> /
          <code className="mx-1 rounded bg-surface-2 px-1 text-xs">blocklist.json</code> sidecars the serve-time
          fail-safe reads. Run <code className="rounded bg-surface-2 px-1 text-xs">scripts/review-images.mjs</code> first
          to pre-tag automatically. Sidecar writes work in local dev only — commit the results.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={dataset}
            onChange={e => setDataset(e.target.value)}
            className="rounded-md border border-surface-4 bg-surface-2 px-3 py-1.5 text-sm"
          >
            <option value="">Select dataset…</option>
            {datasets.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {dataset && (
            <>
              <div className="flex gap-1 text-xs">
                {(['all', 'untagged', 'auto', 'human', 'blocked'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md border px-2.5 py-1 transition-colors ${filter === f ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-surface-4 text-ink-secondary hover:text-ink-primary'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-xs text-ink-tertiary">
                {counts.tagged}/{counts.total} tagged · {counts.human} human-confirmed · {counts.blocked} blocked
              </span>
            </>
          )}
        </div>

        {error && <div className="mb-4 rounded-md border border-critical-border bg-critical-bg px-3 py-2 text-sm text-critical">{error}</div>}
        {loading && <p className="text-sm text-ink-tertiary">Loading…</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(img => (
            <div key={img.key} className={`rounded-lg border p-2 ${img.blocked ? 'border-critical-border bg-critical-bg/30' : 'border-surface-4 bg-surface-1'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.publicPath} alt={img.key} className="mb-2 h-40 w-full rounded object-contain bg-black" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-tertiary truncate" title={img.key}>{img.category}</span>
                <span className={`rounded px-1.5 py-0.5 ${
                  img.blocked ? 'bg-critical-bg text-critical'
                  : img.attribute?.review === 'human' ? 'bg-confirmed-bg text-confirmed'
                  : img.attribute ? 'bg-caution-bg text-caution'
                  : 'bg-surface-2 text-ink-tertiary'
                }`}>
                  {img.blocked ? 'blocked' : img.attribute ? `${img.attribute.laterality ?? '?'} · ${img.attribute.review}` : 'untagged'}
                </span>
              </div>
              {img.attribute?.reason && <p className="mt-1 text-[11px] text-ink-tertiary line-clamp-2">{img.attribute.reason}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button onClick={() => act(img, 'confirm')} className="rounded border border-confirmed-border px-2 py-0.5 text-[11px] text-confirmed hover:bg-confirmed-bg">✓ confirm</button>
                <select
                  value=""
                  onChange={e => { if (e.target.value) act(img, 'edit', e.target.value as Laterality) }}
                  className="rounded border border-surface-4 bg-surface-2 px-1.5 py-0.5 text-[11px]"
                >
                  <option value="">set side…</option>
                  {LATERALITIES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button onClick={() => act(img, 'reject')} className="rounded border border-critical-border px-2 py-0.5 text-[11px] text-critical hover:bg-critical-bg">✗ reject</button>
              </div>
            </div>
          ))}
        </div>
        {dataset && !loading && shown.length === 0 && <p className="text-sm text-ink-tertiary">No images match this filter.</p>}
      </div>
    </div>
  )
}
