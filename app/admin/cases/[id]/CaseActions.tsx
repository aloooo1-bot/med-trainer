'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'idle' | 'editing' | 'confirm-delete' | 'regenerating'

interface Props {
  caseId: string
  caseData: Record<string, unknown> | null
  source: string
}

export default function CaseActions({ caseId, caseData, source }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [editJson, setEditJson] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  function openEdit() {
    setEditJson(JSON.stringify(caseData ?? {}, null, 2))
    setJsonError('')
    setMode('editing')
  }

  function validateJson(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text)
    } catch (e) {
      setJsonError((e as Error).message)
      return null
    }
  }

  async function saveEdit() {
    const parsed = validateJson(editJson)
    if (!parsed) return
    setJsonError('')
    setStatusMsg('Saving…')
    try {
      const res = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_data: parsed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setStatusMsg('')
      setMode('idle')
      startTransition(() => router.refresh())
    } catch (e) {
      setStatusMsg('')
      setJsonError((e as Error).message)
    }
  }

  async function confirmDelete() {
    setStatusMsg('Deleting…')
    try {
      const res = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      router.push('/admin/cases')
    } catch (e) {
      setStatusMsg((e as Error).message)
      setMode('idle')
    }
  }

  async function regenerate() {
    setMode('regenerating')
    setStatusMsg('Generating with Claude…')
    try {
      const res = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}/regenerate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setStatusMsg('Done — reloading…')
      startTransition(() => {
        router.refresh()
        setMode('idle')
        setStatusMsg('')
      })
    } catch (e) {
      setStatusMsg((e as Error).message)
      setMode('idle')
    }
  }

  if (mode === 'editing') {
    return (
      <div className="rounded-lg border border-surface-3 bg-surface-1 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-secondary">Edit case_data JSON</span>
          <button onClick={() => setMode('idle')} className="text-xs text-ink-tertiary hover:text-ink-secondary">Cancel</button>
        </div>
        <textarea
          value={editJson}
          onChange={e => { setEditJson(e.target.value); setJsonError('') }}
          className="w-full h-96 bg-surface-0 border border-surface-3 rounded p-3 text-xs font-mono text-ink-primary focus:outline-none focus:border-primary-500 resize-y"
          spellCheck={false}
        />
        {jsonError && (
          <p className="text-xs text-red-400 font-mono">{jsonError}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={saveEdit}
            disabled={!!isPending || !!statusMsg}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-4 py-2 transition-colors"
          >
            {statusMsg || 'Save'}
          </button>
          <button onClick={() => setMode('idle')} className="text-xs border border-surface-3 hover:border-surface-4 text-ink-secondary rounded px-4 py-2 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-delete') {
    return (
      <div className="rounded-lg border border-red-800/60 bg-red-900/10 p-5 space-y-3">
        <p className="text-sm text-red-300">
          Delete <span className="font-mono text-xs">{caseId}</span>?
          <span className="text-ink-secondary text-xs ml-2">Ratings will be preserved with case_id=NULL.</span>
        </p>
        {statusMsg && <p className="text-xs text-ink-secondary">{statusMsg}</p>}
        <div className="flex gap-2">
          <button
            onClick={confirmDelete}
            disabled={!!statusMsg}
            className="text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded px-4 py-2 transition-colors"
          >
            {statusMsg || 'Delete'}
          </button>
          <button onClick={() => setMode('idle')} className="text-xs border border-surface-3 hover:border-surface-4 text-ink-secondary rounded px-4 py-2 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'regenerating') {
    return (
      <div className="rounded-lg border border-surface-3 bg-surface-1 p-5">
        <p className="text-sm text-ink-secondary">{statusMsg}</p>
        <p className="text-xs text-ink-tertiary mt-1">This may take 30–60 seconds. Do not navigate away.</p>
      </div>
    )
  }

  // idle
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={openEdit}
        className="text-xs border border-surface-3 hover:border-blue-500 text-ink-secondary hover:text-blue-300 rounded px-4 py-2 transition-colors"
      >
        Edit JSON
      </button>
      <button
        onClick={() => { setMode('confirm-delete'); setStatusMsg('') }}
        className="text-xs border border-surface-3 hover:border-red-500 text-ink-secondary hover:text-red-300 rounded px-4 py-2 transition-colors"
      >
        Delete
      </button>
      {source !== 'img' ? (
        <button
          onClick={regenerate}
          className="text-xs border border-surface-3 hover:border-green-500 text-ink-secondary hover:text-green-300 rounded px-4 py-2 transition-colors"
        >
          Regenerate
        </button>
      ) : (
        <span className="text-xs text-ink-tertiary px-4 py-2" title="Image-anchored cases must be regenerated via scripts/image-first-cases.mjs">
          Regen (script only)
        </span>
      )}
    </div>
  )
}
