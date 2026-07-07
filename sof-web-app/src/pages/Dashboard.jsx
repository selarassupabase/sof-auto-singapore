import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, Loader2, FileText, X, Layers } from 'lucide-react'

const API = 'http://localhost:8000'

export default function Dashboard() {
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const addFiles = (list) => {
    const incoming = Array.from(list || [])
    setError(null)
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...incoming.filter((f) => !names.has(f.name + f.size))]
    })
  }

  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true)
    else if (e.type === 'dragleave') setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }, [])

  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))

  // Alur OTOMATIS: ekstrak -> validasi -> auto-generate -> arsip. Selalu kirim
  // sebagai `files` (1 atau banyak); server merge otomatis kalau >1.
  const process = async () => {
    if (!files.length) return
    setIsBusy(true); setError(null)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const res = await fetch(`${API}/api/process`, { method: 'POST', body: form })
      const rec = await res.json()
      if (!res.ok) throw new Error(rec?.error || 'Proses gagal')
      // langsung ke arsip; dokumen baru tampil dengan status-nya
      navigate('/documents')
    } catch (e) {
      setError(e.message || 'Gagal menghubungi server.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl p-8 border border-slate-100">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">PACMAR SOF Automation</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Unggah foto form tulis tangan atau email log. Pilih <b>lebih dari satu file</b>
            {' '}untuk voyage sama (mis. form + email) — sistem akan menggabungkan & menandai konflik.
          </p>
        </div>

        <form
          onDragEnter={handleDrag} onDragLeave={handleDrag}
          onDragOver={handleDrag} onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center text-center cursor-pointer transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50 hover:border-blue-400'
          }`}
        >
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            accept=".jpg,.jpeg,.png,.pdf,.txt" />
          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h3 className="font-medium text-slate-700">Drag & drop file di sini, atau klik untuk memilih</h3>
          <p className="text-xs text-slate-400 mt-1">JPG, PNG, PDF, atau TXT. Bisa banyak file.</p>
        </form>

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f, i) => (
              <li key={f.name + i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-slate-700 truncate">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </span>
                <button onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                  className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 1 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <Layers className="w-4 h-4" />
            Mode cross-source: {files.length} sumber akan digabung (file pertama = primer/otoritatif).
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          onClick={process}
          disabled={!files.length || isBusy}
          className="mt-5 w-full py-3 rounded-lg text-white font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {isBusy ? (<><Loader2 className="w-5 h-5 animate-spin" /> Memproses & generate otomatis...</>)
            : (`Proses otomatis ${files.length || ''} file`.trim())}
        </button>

        <button onClick={() => navigate('/documents')}
          className="mt-3 w-full text-sm text-slate-500 hover:text-blue-600">
          Lihat arsip dokumen tergenerate →
        </button>
      </div>
    </div>
  )
}
