import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, XCircle, CheckCircle2, ShieldCheck, ArrowLeft, FileText, Ship, Eye, X, Download, ExternalLink } from 'lucide-react'
import TopBar from '../components/TopBar'

import { API } from '../lib/api'

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
const setPath = (obj, path, value) => {
  const keys = path.split('.')
  const next = structuredClone(obj)
  let cur = next
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
  return next
}

const SECTIONS = [
  { title: 'Header', fields: [
    ['header.vessel_name', 'Vessel Name'], ['header.eta_next_port', 'ETA Next Port'],
  ]},
  { title: 'Timings', fields: [
    ['timings.end_of_sea_passage.datetime', 'End of Sea Passage'],
    ['timings.pilot_on_board.datetime', 'Pilot On Board'],
    ['timings.anchored_location.place', 'Anchored Location'],
    ['timings.anchored_location.datetime', 'Anchored Time'],
    ['timings.pilot_off.datetime', 'Pilot Off'],
  ]},
  { title: 'Draft & ROB Arrival', fields: [
    ['draft_arrival.fwd_m', 'Draft FWD (m)'], ['draft_arrival.aft_m', 'Draft AFT (m)'],
    ['rob_arrival.ifo_mt', 'ROB IFO (MT)'], ['rob_arrival.mdo_mt', 'ROB MDO (MT)'], ['rob_arrival.fw_mt', 'ROB FW (MT)'],
  ]},
  { title: 'Bunker IFO', fields: [
    ['bunker_ifo.barge_alongside', 'Barge Alongside'], ['bunker_ifo.commence', 'Commence'],
    ['bunker_ifo.completed', 'Completed'], ['bunker_ifo.cast_off', 'Cast Off'], ['bunker_ifo.qty_mt', 'Qty (MT)'],
  ]},
  { title: 'Bunker MGO', fields: [
    ['bunker_mgo.barge_alongside', 'Barge Alongside'], ['bunker_mgo.commence', 'Commence'],
    ['bunker_mgo.completed', 'Completed'], ['bunker_mgo.cast_off', 'Cast Off'], ['bunker_mgo.qty_mt', 'Qty (MT)'],
  ]},
  { title: 'Supply (type selects the template)', fields: [
    ['supply.type', 'Type (FRESH_WATER / LUB_OIL)'], ['supply.barge_alongside', 'Barge Alongside'],
    ['supply.commence', 'Commence'], ['supply.stop', 'Stop'], ['supply.cast_off', 'Cast Off'], ['supply.qty_recvd_mt', 'Qty Received (MT)'],
  ]},
  { title: 'Draft & ROB Departure', fields: [
    ['draft_departure.fwd_m', 'Draft FWD (m)'], ['draft_departure.aft_m', 'Draft AFT (m)'],
    ['rob_departure.ifo_mt', 'ROB IFO (MT)'], ['rob_departure.mgo_mt', 'ROB MGO (MT)'], ['rob_departure.fw_mt', 'ROB FW (MT)'],
    ['pilot_ob_departure', 'Pilot O/B Departure'], ['pilot_op_departure', 'Pilot O/P Departure'],
  ]},
  { title: 'Signature (typed name; signature is never auto-applied)', fields: [
    ['signature.master_name', "Master's Name"], ['signature.agent_name', "Agent's Name"],
  ]},
]

const FLAG_STYLE = {
  error: { bg: 'var(--danger-tint)', fg: 'var(--danger)', Icon: XCircle },
  warn:  { bg: 'var(--warn-tint)',   fg: 'var(--warn)',   Icon: AlertTriangle },
  info:  { bg: 'var(--accent-tint)', fg: 'var(--accent-strong)', Icon: Info },
}

export default function Review() {
  const [data, setData] = useState(null)
  const [sources, setSources] = useState([])
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [preview, setPreview] = useState(null) // { url, name } — PDF ditampilkan di layar, tanpa unduh
  const navigate = useNavigate()

  // Bebaskan blob URL saat modal ditutup / komponen dilepas.
  useEffect(() => () => { if (preview?.url) window.URL.revokeObjectURL(preview.url) }, [preview])

  useEffect(() => {
    const stored = localStorage.getItem('sof_extraction')
    if (stored) {
      try {
        const p = JSON.parse(stored)
        if (p && typeof p === 'object' && !Array.isArray(p)) setData(p)
      } catch { /* noop */ }
    }
    const s = localStorage.getItem('sof_sources')
    if (s) { try { const a = JSON.parse(s); if (Array.isArray(a)) setSources(a) } catch { /* noop */ } }
  }, [])

  const update = (path, value) => setData((d) => setPath(d, path, value))

  const exportName = (fmt) => {
    const today = new Date().toISOString().slice(0, 10)
    const vessel = (data?.header?.vessel_name || 'SOF').replace(/[\\/:*?"<>|]+/g, '').trim() || 'SOF'
    return `${vessel} ${today}.${fmt}`
  }

  // Preview: generate PDF resmi lalu tampilkan di layar (modal), TANPA mengunduh.
  const handlePreview = async () => {
    if (!data || busy) return
    setBusy('preview'); setMsg(null)
    try {
      const res = await fetch(`${API}/api/generate-pdf?format=pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!res.ok) {
        let detail = 'Failed to build the preview'
        try { detail = (await res.json())?.error || detail } catch { /* noop */ }
        throw new Error(detail)
      }
      const blob = await res.blob()
      // Buka blob PDF (bukan attachment) supaya bisa dirender di dalam iframe.
      const url = window.URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }))
      setPreview({ url, name: exportName('pdf') })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(null)
    }
  }

  const closePreview = () => setPreview(null)

  const handleGenerate = async (fmt) => {
    if (!data || busy) return
    setBusy(fmt); setMsg(null)
    try {
      const res = await fetch(`${API}/api/generate-pdf?format=${fmt}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!res.ok) {
        let detail = 'Failed to generate the document'
        try { detail = (await res.json())?.error || detail } catch { /* noop */ }
        throw new Error(detail)
      }
      const today = new Date().toISOString().slice(0, 10)
      const vessel = (data?.header?.vessel_name || 'SOF').replace(/[\\/:*?"<>|]+/g, '').trim() || 'SOF'
      const fallback = `${vessel} ${today}.${fmt}`
      const fromHeader = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fromHeader || fallback
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
      setMsg({ ok: true, text: `${fmt.toUpperCase()} downloaded: ${fromHeader || fallback}` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(null)
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="flex flex-col items-center justify-center gap-3 pt-32 text-ink-soft">
          No extraction data.
          <button onClick={() => navigate('/')} className="text-accent font-medium hover:underline">Back to upload</button>
        </div>
      </div>
    )
  }

  const flags = data.flags || []
  const decision = data._decision || { mode: 'review', blocking: false, warn_count: flags.filter(f => f.severity === 'warn').length, error_count: flags.filter(f => f.severity === 'error').length }
  const isAuto = decision.mode === 'auto'
  const blocked = decision.blocking

  const banner = blocked
    ? { bg: 'var(--danger-tint)', fg: 'var(--danger)', Icon: XCircle, title: 'Cannot generate',
        body: 'A blocking error was found (e.g. the document is not a Bunker Form 2). Fix the source.' }
    : isAuto
    ? { bg: 'var(--ok-tint)', fg: 'var(--ok)', Icon: ShieldCheck, title: 'Passed automatically, ready to export',
        body: 'No flags and high confidence. You can Approve & Export directly.' }
    : { bg: 'var(--warn-tint)', fg: 'var(--warn)', Icon: AlertTriangle, title: `Needs review: ${decision.warn_count || 0} finding${(decision.warn_count || 0) === 1 ? '' : 's'}`,
        body: 'Check and correct the flagged fields below before exporting.' }

  return (
    <div className="min-h-screen">
      <TopBar>
        <button
          onClick={handlePreview}
          disabled={!!busy || blocked}
          title={blocked ? 'Resolve the blocking error first' : 'See the finished SOF on screen — no download'}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          <Eye style={{ width: 16, height: 16 }} />
          {busy === 'preview' ? 'Building…' : 'Preview'}
        </button>
        <button
          onClick={() => handleGenerate('docx')}
          disabled={!!busy || blocked}
          title={blocked ? 'Resolve the blocking error first' : 'Download as DOCX'}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ background: isAuto ? 'var(--ok)' : 'var(--surface-2)', color: isAuto ? '#fff' : 'var(--ink)', border: isAuto ? 'none' : '1px solid var(--line)' }}
        >
          <FileText style={{ width: 16, height: 16 }} />
          {busy === 'docx' ? 'Processing…' : isAuto ? 'Approve & Export' : 'Fix & Export'}
        </button>
      </TopBar>

      <main className="mx-auto max-w-5xl px-5 pt-8 pb-24">
        {/* Title */}
        <div className="anim-in flex items-center gap-3">
          <button onClick={() => navigate('/documents')}
            className="grid place-items-center w-9 h-9 rounded-lg border border-line text-ink-soft hover:text-accent hover:border-accent transition-colors shrink-0">
            <ArrowLeft style={{ width: 17, height: 17 }} />
          </button>
          <div>
            <span className="eyebrow">Extraction review</span>
            <h1 className="text-ink font-extrabold tracking-tight flex items-center gap-2" style={{ fontSize: '1.5rem' }}>
              <Ship style={{ width: 20, height: 20, color: 'var(--ink-faint)' }} />
              {data?.header?.vessel_name || 'Unknown vessel'}
            </h1>
            <p className="text-[13px] text-ink-soft mt-0.5 font-mono">
              {data?.meta?.sof_type || 'BUNKER_FORM2'}
              {sources.length > 1 && <span style={{ color: 'var(--accent)' }}> · {sources.length} sources (cross-source)</span>}
              {typeof decision.confidence === 'number' && <span> · confidence {(decision.confidence * 100).toFixed(0)}%</span>}
            </p>
          </div>
        </div>

        {/* Decision banner */}
        <div className="anim-in mt-6 rounded-2xl p-4 flex items-start gap-3" style={{ background: banner.bg, animationDelay: '.04s' }}>
          <banner.Icon style={{ width: 22, height: 22, color: banner.fg, flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="font-display font-bold" style={{ color: banner.fg }}>{banner.title}</p>
            <p className="text-sm text-ink-soft mt-0.5">{banner.body}</p>
          </div>
        </div>

        {/* Flags */}
        {flags.length > 0 && (
          <div className="anim-in mt-4 flex flex-col gap-2" style={{ animationDelay: '.08s' }}>
            {flags.map((f, i) => {
              const s = FLAG_STYLE[f.severity] || FLAG_STYLE.info
              const Icon = s.Icon
              return (
                <div key={i} className="flex items-start gap-3 rounded-xl p-3" style={{ background: s.bg }}>
                  <Icon style={{ width: 18, height: 18, color: s.fg, flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p className="text-[13px] font-semibold font-mono" style={{ color: s.fg }}>{f.code}</p>
                    <p className="text-sm text-ink mt-0.5">{f.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-xl px-3.5 py-3 flex items-center gap-2 text-sm"
            style={{ background: msg.ok ? 'var(--ok-tint)' : 'var(--danger-tint)', color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>
            {msg.ok ? <CheckCircle2 style={{ width: 17, height: 17 }} /> : <XCircle style={{ width: 17, height: 17 }} />}{msg.text}
          </div>
        )}

        {/* Editable form */}
        <div className="mt-6 flex flex-col gap-4">
          {SECTIONS.map((section, si) => (
            <div key={section.title} className="anim-in card p-5" style={{ animationDelay: `${.1 + si * 0.03}s` }}>
              <h2 className="eyebrow mb-4">{section.title}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {section.fields.map(([path, label]) => (
                  <div key={path}>
                    <label className="block text-xs font-medium text-ink-soft mb-1.5">{label}</label>
                    <input type="text" value={get(data, path) ?? ''}
                      onChange={(e) => update(path, e.target.value === '' ? null : e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm text-ink font-mono tnum transition-colors"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--line)'} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="anim-in card p-5">
            <h2 className="eyebrow mb-3">Remarks</h2>
            <textarea value={data.remarks || ''} onChange={(e) => update('remarks', e.target.value)} rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm text-ink transition-colors"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--line)'} />
          </div>

          <details className="card p-5">
            <summary className="text-sm text-ink-soft cursor-pointer select-none hover:text-ink">Raw JSON</summary>
            <pre className="mt-3 text-xs font-mono overflow-x-auto rounded-lg p-4"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      </main>

      {/* Preview PDF di layar — klien lihat hasil jadi tanpa mengunduh. */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={closePreview}>
          <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col min-h-0 p-3 sm:p-5"
            onClick={(e) => e.stopPropagation()}>
            {/* Bar atas modal */}
            <div className="flex items-center justify-between gap-2 rounded-t-2xl px-4 py-3"
              style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
              <span className="flex items-center gap-2 min-w-0">
                <Eye style={{ width: 17, height: 17, color: 'var(--accent)' }} className="shrink-0" />
                <span className="truncate text-sm font-semibold text-ink">{preview.name}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <a href={preview.url} target="_blank" rel="noreferrer" title="Open in a new tab"
                  className="grid place-items-center w-9 h-9 rounded-lg text-ink-soft hover:text-accent hover:bg-accent-tint transition-colors">
                  <ExternalLink style={{ width: 16, height: 16 }} />
                </a>
                <a href={preview.url} download={preview.name} title="Download PDF"
                  className="grid place-items-center w-9 h-9 rounded-lg text-ink-soft hover:text-ok transition-colors">
                  <Download style={{ width: 16, height: 16 }} />
                </a>
                <button onClick={closePreview} title="Close"
                  className="grid place-items-center w-9 h-9 rounded-lg text-ink-soft hover:text-danger transition-colors">
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </span>
            </div>
            {/* Dokumen */}
            <div className="flex-1 min-h-0 rounded-b-2xl overflow-hidden" style={{ background: '#525659' }}>
              <iframe src={preview.url} title="SOF preview" className="w-full h-full" style={{ border: 0 }} />
            </div>
            {/* Fallback bila iframe PDF kosong (sebagian browser HP) */}
            <a href={preview.url} target="_blank" rel="noreferrer"
              className="mt-2 text-center text-xs text-white/80 hover:text-white sm:hidden">
              Tidak tampil? Ketuk untuk buka di tab baru
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
