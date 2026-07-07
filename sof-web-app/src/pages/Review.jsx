import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, XCircle, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react'

const API = 'http://localhost:8000'

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
  { title: 'Supply (type memilih template)', fields: [
    ['supply.type', 'Type (FRESH_WATER / LUB_OIL)'], ['supply.barge_alongside', 'Barge Alongside'],
    ['supply.commence', 'Commence'], ['supply.stop', 'Stop'], ['supply.cast_off', 'Cast Off'], ['supply.qty_recvd_mt', 'Qty Received (MT)'],
  ]},
  { title: 'Draft & ROB Departure', fields: [
    ['draft_departure.fwd_m', 'Draft FWD (m)'], ['draft_departure.aft_m', 'Draft AFT (m)'],
    ['rob_departure.ifo_mt', 'ROB IFO (MT)'], ['rob_departure.mgo_mt', 'ROB MGO (MT)'], ['rob_departure.fw_mt', 'ROB FW (MT)'],
    ['pilot_ob_departure', 'Pilot O/B Departure'], ['pilot_op_departure', 'Pilot O/P Departure'],
  ]},
  { title: 'Signature (nama ketik — ttd tidak dibubuhkan otomatis)', fields: [
    ['signature.master_name', "Master's Name"], ['signature.agent_name', "Agent's Name"],
  ]},
]

const FLAG_STYLE = {
  error: { cls: 'bg-red-50 border-red-200 text-red-800', Icon: XCircle },
  warn: { cls: 'bg-yellow-50 border-yellow-200 text-yellow-800', Icon: AlertTriangle },
  info: { cls: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Info },
}

export default function Review() {
  const [data, setData] = useState(null)
  const [sources, setSources] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [msg, setMsg] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const stored = localStorage.getItem('sof_extraction')
    if (stored) { try { setData(JSON.parse(stored)) } catch { /* noop */ } }
    const s = localStorage.getItem('sof_sources')
    if (s) { try { setSources(JSON.parse(s)) } catch { /* noop */ } }
  }, [])

  const update = (path, value) => setData((d) => setPath(d, path, value))

  const handleGenerate = async () => {
    if (!data) return
    setIsGenerating(true); setMsg(null)
    try {
      const res = await fetch(`${API}/api/generate-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!res.ok) {
        let detail = 'Gagal generate dokumen'
        try { detail = (await res.json())?.error || detail } catch { /* noop */ }
        throw new Error(detail)
      }
      const skipped = res.headers.get('X-Pdf-Skipped')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '')
        || (skipped ? 'SOF_FINAL.docx' : 'SOF_FINAL.pdf')
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
      setMsg({ ok: true, text: skipped ? 'Dokumen DOCX terisi diunduh (PDF dilewati: LibreOffice belum terpasang).' : 'PDF final diunduh.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setIsGenerating(false)
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
        Tidak ada data ekstraksi.
        <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">Kembali ke upload</button>
      </div>
    )
  }

  const flags = data.flags || []
  const decision = data._decision || { mode: 'review', blocking: false, warn_count: flags.filter(f => f.severity === 'warn').length, error_count: flags.filter(f => f.severity === 'error').length }
  const isAuto = decision.mode === 'auto'
  const blocked = decision.blocking

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Review Ekstraksi SOF</h1>
            <p className="text-sm text-slate-500">
              {data?.header?.vessel_name || 'Unknown vessel'} · {data?.meta?.sof_type || 'BUNKER_FORM2'}
              {sources.length > 1 && <span className="ml-1 text-blue-600">· {sources.length} sumber (cross-source)</span>}
            </p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || blocked}
          title={blocked ? 'Ada error yang harus diselesaikan dulu' : ''}
          className={`px-4 py-2 rounded-lg text-white shadow-sm transition-colors disabled:opacity-50 ${
            isAuto ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isGenerating ? 'Memproses...' : isAuto ? 'Approve & Generate' : 'Koreksi & Generate'}
        </button>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* Decision banner */}
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          blocked ? 'bg-red-50 border-red-200' : isAuto ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
        }`}>
          {blocked ? <XCircle className="w-6 h-6 text-red-600 shrink-0" />
            : isAuto ? <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" />
            : <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0" />}
          <div className="flex-1">
            <p className={`font-semibold ${blocked ? 'text-red-800' : isAuto ? 'text-green-800' : 'text-yellow-800'}`}>
              {blocked ? 'Tidak bisa digenerate' : isAuto ? 'Lolos otomatis — siap generate' : `Perlu review — ${decision.warn_count || 0} temuan`}
            </p>
            <p className="text-sm text-slate-600 mt-0.5">
              {blocked ? 'Ada error yang memblokir (mis. dokumen bukan Bunker Form 2). Perbaiki sumbernya.'
                : isAuto ? 'Tidak ada flag & confidence tinggi. Bisa langsung Approve & Generate.'
                : 'Periksa & koreksi field yang ditandai di bawah sebelum generate.'}
              {typeof decision.confidence === 'number' && (
                <span className="ml-1 text-slate-400">· confidence {(decision.confidence * 100).toFixed(0)}%</span>
              )}
            </p>
          </div>
        </div>

        {/* Flags */}
        {flags.length > 0 && (
          <div className="space-y-2">
            {flags.map((f, i) => {
              const s = FLAG_STYLE[f.severity] || FLAG_STYLE.info
              const Icon = s.Icon
              return (
                <div key={i} className={`p-3 border rounded-lg flex items-start gap-3 ${s.cls}`}>
                  <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                  <div><p className="text-sm font-semibold">{f.code}</p><p className="text-sm">{f.detail}</p></div>
                </div>
              )
            })}
          </div>
        )}

        {msg && (
          <div className={`p-3 rounded-lg border flex items-center gap-2 text-sm ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {msg.ok ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}{msg.text}
          </div>
        )}

        {/* Form */}
        {SECTIONS.map((section) => (
          <div key={section.title} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">{section.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {section.fields.map(([path, label]) => (
                <div key={path}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                  <input type="text" value={get(data, path) ?? ''}
                    onChange={(e) => update(path, e.target.value === '' ? null : e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
          <textarea value={data.remarks || ''} onChange={(e) => update('remarks', e.target.value)} rows={2}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" />
        </div>

        <details className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <summary className="text-sm text-slate-500 cursor-pointer">Data mentah JSON</summary>
          <pre className="mt-3 text-xs text-slate-500 bg-slate-50 p-4 rounded border border-slate-200 overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </main>
    </div>
  )
}
