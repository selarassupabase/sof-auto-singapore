import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, XCircle, Download, Pencil, RefreshCw, UploadCloud } from 'lucide-react'

const API = 'http://localhost:8000'

const STATUS = {
  ok: { label: 'Aman', cls: 'bg-green-100 text-green-700 border-green-200', Icon: CheckCircle2 },
  needs_check: { label: 'Perlu dicek', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', Icon: AlertTriangle },
  blocked: { label: 'Tak bisa digenerate', cls: 'bg-red-100 text-red-700 border-red-200', Icon: XCircle },
}

const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso || '-' }
}

export default function Documents() {
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    setError(null)
    try {
      const res = await fetch(`${API}/api/documents`)
      if (!res.ok) throw new Error('Gagal memuat arsip')
      setDocs(await res.json())
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const openReview = async (id) => {
    try {
      const res = await fetch(`${API}/api/documents/${id}`)
      const doc = await res.json()
      localStorage.setItem('sof_extraction', JSON.stringify(doc.extracted || {}))
      localStorage.setItem('sof_sources', JSON.stringify(doc.sources || []))
      navigate('/review/' + id)
    } catch { setError('Gagal membuka dokumen') }
  }

  const counts = docs ? docs.reduce((a, d) => { a[d.review_status] = (a[d.review_status] || 0) + 1; return a }, {}) : {}

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Arsip Dokumen SOF</h1>
          <p className="text-sm text-slate-500">
            {docs ? `${docs.length} dokumen` : 'memuat...'}
            {docs && <> · <span className="text-green-700">{counts.ok || 0} aman</span>
              · <span className="text-yellow-700">{counts.needs_check || 0} perlu dicek</span>
              · <span className="text-red-700">{counts.blocked || 0} blocked</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-500 hover:text-slate-800" title="Muat ulang"><RefreshCw className="w-5 h-5" /></button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            <UploadCloud className="w-4 h-4" /> Upload baru
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        {docs && docs.length === 0 && (
          <div className="text-center text-slate-400 py-20">
            Belum ada dokumen. <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">Upload SOF pertama</button>.
          </div>
        )}

        {docs && docs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Vessel</th>
                  <th className="px-4 py-3 font-medium">Jenis</th>
                  <th className="px-4 py-3 font-medium">Sumber</th>
                  <th className="px-4 py-3 font-medium">Temuan</th>
                  <th className="px-4 py-3 font-medium">Waktu</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((d) => {
                  const s = STATUS[d.review_status] || STATUS.needs_check
                  const Icon = s.Icon
                  const flagN = (d.flags || []).length
                  const fileHref = d.file_url || (d.file ? `${API}/api/documents/${d.id}/file` : null)
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${s.cls}`}>
                          <Icon className="w-3.5 h-3.5" /> {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{d.vessel_name}</td>
                      <td className="px-4 py-3 text-slate-500">{d.sof_type}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {(d.sources || []).join(', ') || '-'}
                        {(d.sources || []).length > 1 && <span className="ml-1 text-blue-600 text-xs">(cross-source)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {flagN === 0 ? <span className="text-green-600">—</span>
                          : <span className={d.review_status === 'blocked' ? 'text-red-600' : 'text-yellow-700'}>{flagN} flag</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(d.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openReview(d.id)} title="Review / edit"
                            className="p-2 text-slate-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                          {fileHref
                            ? <a href={fileHref} title="Unduh" className="p-2 text-slate-500 hover:text-green-600"><Download className="w-4 h-4" /></a>
                            : <span className="p-2 text-slate-300" title="Tak ada file"><Download className="w-4 h-4" /></span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
