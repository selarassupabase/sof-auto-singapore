import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Pencil, RefreshCw, UploadCloud, Ship, Inbox, Search, X, SearchX } from 'lucide-react'
import TopBar from '../components/TopBar'
import { STATUS, StatusPill } from '../components/status'

import { API } from '../lib/api'

const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso || '-' }
}

const STRIPE = { ok: 'var(--ok)', needs_check: 'var(--warn)', blocked: 'var(--danger)' }

const TILES = [
  { key: 'total',       label: 'Total',       tone: 'var(--accent)' },
  { key: 'ok',          label: 'Clear',       tone: 'var(--ok)' },
  { key: 'needs_check', label: 'Needs check', tone: 'var(--warn)' },
  { key: 'blocked',     label: 'Blocked',     tone: 'var(--danger)' },
]

export default function Documents() {
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState(null)
  const [spin, setSpin] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(null) // null | 'ok' | 'needs_check' | 'blocked'
  const navigate = useNavigate()

  const load = async () => {
    setError(null); setSpin(true)
    try {
      const res = await fetch(`${API}/api/documents`)
      if (!res.ok) throw new Error('Failed to load the archive')
      setDocs(await res.json())
    } catch (e) { setError(e.message) }
    finally { setSpin(false) }
  }
  useEffect(() => { load() }, [])

  const openReview = async (id) => {
    try {
      const res = await fetch(`${API}/api/documents/${id}`)
      const doc = await res.json()
      localStorage.setItem('sof_extraction', JSON.stringify(doc.extracted || {}))
      localStorage.setItem('sof_sources', JSON.stringify(doc.sources || []))
      navigate('/review/' + id)
    } catch { setError('Could not open the document') }
  }

  const counts = docs ? docs.reduce((a, d) => { a[d.review_status] = (a[d.review_status] || 0) + 1; return a }, {}) : {}
  const tileVal = (k) => k === 'total' ? (docs?.length ?? 0) : (counts[k] || 0)

  // Filter: status tile + free-text search across vessel / type / sources / status label.
  const filtered = useMemo(() => {
    if (!docs) return []
    const q = query.trim().toLowerCase()
    return docs.filter((d) => {
      if (statusFilter && d.review_status !== statusFilter) return false
      if (!q) return true
      const hay = [
        d.vessel_name, d.sof_type, (d.sources || []).join(' '),
        STATUS[d.review_status]?.label, d.id,
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [docs, query, statusFilter])

  const filtering = !!(query.trim() || statusFilter)

  return (
    <div className="min-h-screen">
      <TopBar>
        <button onClick={load} title="Reload"
          className="grid place-items-center w-9 h-9 rounded-lg border border-line text-ink-soft hover:text-accent hover:border-accent transition-colors">
          <RefreshCw style={{ width: 16, height: 16 }} className={spin ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          <UploadCloud style={{ width: 16, height: 16 }} /> New upload
        </button>
      </TopBar>

      <main className="mx-auto max-w-6xl px-5 pt-10 pb-20">
        <div className="anim-in flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Audit trail</span>
            <h1 className="mt-2 text-ink font-extrabold tracking-tight" style={{ fontSize: '1.9rem' }}>Document Archive</h1>
            <p className="mt-1.5 text-ink-soft text-sm">Every SOF is generated automatically and tagged by status. Amber and red need a human eye.</p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search style={{ width: 16, height: 16 }} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--ink-faint)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vessel, type, source…"
              className="w-full h-11 pl-9 pr-9 rounded-xl text-sm text-ink transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--line)'}
            />
            {query && (
              <button onClick={() => setQuery('')} title="Clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded-md text-ink-faint hover:text-ink transition-colors">
                <X style={{ width: 15, height: 15 }} />
              </button>
            )}
          </div>
        </div>

        {/* Stat tiles = status filters */}
        <div className="anim-in mt-6 grid grid-cols-2 md:grid-cols-4 gap-3" style={{ animationDelay: '.05s' }}>
          {TILES.map((t) => {
            const active = t.key === 'total' ? !statusFilter : statusFilter === t.key
            return (
              <button key={t.key} type="button"
                onClick={() => setStatusFilter(t.key === 'total' ? null : (statusFilter === t.key ? null : t.key))}
                className="card p-4 relative overflow-hidden text-left rise cursor-pointer"
                style={{ borderColor: active ? t.tone : 'var(--line)', boxShadow: active ? `0 0 0 1px ${t.tone} inset, var(--shadow-sm)` : 'var(--shadow-sm)' }}>
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: t.tone, opacity: active ? 1 : 0.5 }} />
                <div className="font-mono font-medium tnum text-ink" style={{ fontSize: '1.75rem', lineHeight: 1 }}>
                  {docs === null ? '–' : tileVal(t.key)}
                </div>
                <div className="mt-1.5 text-[13px] text-ink-soft flex items-center gap-1.5">
                  {t.label}
                  {active && t.key !== 'total' && <span className="eyebrow" style={{ color: t.tone, fontSize: '0.55rem' }}>filtered</span>}
                </div>
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mt-5 rounded-xl px-3.5 py-3 text-sm" style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}>{error}</div>
        )}

        {/* Result count when filtering */}
        {docs && docs.length > 0 && filtering && (
          <div className="mt-5 flex items-center gap-2 text-[13px] text-ink-soft">
            <span>Showing <b className="text-ink tnum">{filtered.length}</b> of <span className="tnum">{docs.length}</span></span>
            <button onClick={() => { setQuery(''); setStatusFilter(null) }}
              className="text-accent hover:underline font-medium">Clear filters</button>
          </div>
        )}

        {/* Empty archive */}
        {docs && docs.length === 0 && (
          <div className="anim-in card mt-6 py-16 flex flex-col items-center text-center">
            <span className="grid place-items-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--surface-2)', color: 'var(--ink-faint)' }}>
              <Inbox style={{ width: 26, height: 26 }} />
            </span>
            <p className="text-ink font-medium">No documents yet</p>
            <button onClick={() => navigate('/')} className="mt-3 text-accent text-sm font-medium hover:underline">Upload your first SOF →</button>
          </div>
        )}

        {/* No matches for filter */}
        {docs && docs.length > 0 && filtered.length === 0 && (
          <div className="anim-in card mt-4 py-14 flex flex-col items-center text-center">
            <span className="grid place-items-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--surface-2)', color: 'var(--ink-faint)' }}>
              <SearchX style={{ width: 26, height: 26 }} />
            </span>
            <p className="text-ink font-medium">No matches</p>
            <p className="text-ink-soft text-sm mt-1">
              {query ? <>Nothing matches “<span className="text-ink">{query}</span>”.</> : 'No documents with this status.'}
            </p>
            <button onClick={() => { setQuery(''); setStatusFilter(null) }} className="mt-3 text-accent text-sm font-medium hover:underline">Clear filters</button>
          </div>
        )}

        {/* Table */}
        {docs && docs.length > 0 && filtered.length > 0 && (
          <div className="anim-in card mt-4 overflow-hidden" style={{ animationDelay: '.1s' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr className="text-left" style={{ color: 'var(--ink-faint)' }}>
                    {['Status', 'Vessel', 'Type', 'Sources', 'Findings', 'Time', ''].map((h, i) => (
                      <th key={i} className="eyebrow font-semibold px-4 py-3 whitespace-nowrap"
                        style={{ fontSize: '0.62rem', borderBottom: '1px solid var(--line)', textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const flagN = (d.flags || []).length
                    const fileHref = d.file_url || (d.file ? `${API}/api/documents/${d.id}/file` : null)
                    return (
                      <tr key={d.id} className="group transition-colors"
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <td className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--line)', boxShadow: `inset 3px 0 0 ${STRIPE[d.review_status] || 'transparent'}` }}>
                          <StatusPill status={d.review_status} size="sm" />
                        </td>
                        <td className="px-4 py-3.5 font-medium text-ink whitespace-nowrap" style={{ borderBottom: '1px solid var(--line)' }}>
                          <span className="inline-flex items-center gap-2">
                            <Ship style={{ width: 15, height: 15, color: 'var(--ink-faint)' }} />{d.vessel_name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap" style={{ borderBottom: '1px solid var(--line)' }}>
                          <span className="font-mono text-xs">{d.sof_type || '-'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-ink-soft" style={{ borderBottom: '1px solid var(--line)' }}>
                          {(d.sources || []).join(', ') || '-'}
                          {(d.sources || []).length > 1 && <span className="ml-1.5 text-xs" style={{ color: 'var(--accent)' }}>cross-source</span>}
                        </td>
                        <td className="px-4 py-3.5 tnum" style={{ borderBottom: '1px solid var(--line)' }}>
                          {flagN === 0
                            ? <span style={{ color: 'var(--ok)' }}>None</span>
                            : <span style={{ color: d.review_status === 'blocked' ? 'var(--danger)' : 'var(--warn)' }}>{flagN} flag{flagN > 1 ? 's' : ''}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap tnum text-[13px]" style={{ borderBottom: '1px solid var(--line)' }}>{fmtDate(d.created_at)}</td>
                        <td className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openReview(d.id)} title="Review / edit"
                              className="grid place-items-center w-8 h-8 rounded-lg text-ink-soft hover:text-accent hover:bg-accent-tint transition-colors">
                              <Pencil style={{ width: 15, height: 15 }} />
                            </button>
                            {fileHref
                              ? <a href={fileHref} title="Download DOCX"
                                  className="grid place-items-center w-8 h-8 rounded-lg text-ink-soft hover:text-ok transition-colors">
                                  <Download style={{ width: 15, height: 15 }} /></a>
                              : <span className="grid place-items-center w-8 h-8 text-ink-faint opacity-40" title="No file"><Download style={{ width: 15, height: 15 }} /></span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
