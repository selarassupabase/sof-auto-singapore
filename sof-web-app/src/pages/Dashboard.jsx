import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, Loader2, FileText, X, Layers, ArrowRight, Archive } from 'lucide-react'
import TopBar from '../components/TopBar'

const API = 'http://localhost:8000'

const STEPS = [
  ['01', 'Upload', 'A handwritten form photo or an email log'],
  ['02', 'Validate', 'Fuel balance, chronology & signatures checked automatically'],
  ['03', 'Export', 'Review what is flagged, download the official DOCX'],
]

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

  // Automatic flow: extract -> validate -> auto-generate -> archive.
  const process = async () => {
    if (!files.length) return
    setIsBusy(true); setError(null)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const res = await fetch(`${API}/api/process`, { method: 'POST', body: form })
      const rec = await res.json()
      if (!res.ok) throw new Error(rec?.error || 'Processing failed')
      navigate('/documents')
    } catch (e) {
      setError(e.message || 'Could not reach the server.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar>
        <button onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-line text-sm
                     text-ink-soft hover:text-accent hover:border-accent transition-colors">
          <Archive style={{ width: 16, height: 16 }} /> Archive
        </button>
      </TopBar>

      <main className="mx-auto max-w-3xl px-5 pt-14 pb-20">
        {/* Hero */}
        <div className="anim-in text-center max-w-xl mx-auto">
          <span className="eyebrow">Statement of Facts · Bunker Form 2</span>
          <h1 className="mt-3 text-ink font-extrabold tracking-tight"
            style={{ fontSize: 'clamp(1.9rem, 5vw, 2.6rem)', lineHeight: 1.05 }}>
            From a form photo to an<br />
            <span className="text-accent">official SOF</span>, automatically.
          </h1>
          <p className="mt-4 text-ink-soft text-[15px] leading-relaxed">
            Upload one handwritten photo — or several sources for the same voyage.
            The system extracts, cross-checks, and flags whatever a human should look at.
          </p>
        </div>

        {/* Dropzone */}
        <div className="anim-in card mt-9 p-2" style={{ animationDelay: '.06s' }}>
          <form
            onDragEnter={handleDrag} onDragLeave={handleDrag}
            onDragOver={handleDrag} onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl px-6 py-11 flex flex-col items-center text-center cursor-pointer
                       border-2 border-dashed transition-colors"
            style={{
              borderColor: isDragging ? 'var(--accent)' : 'var(--line-strong)',
              background: isDragging ? 'var(--accent-tint)' : 'transparent',
            }}
          >
            <input ref={inputRef} type="file" multiple className="hidden"
              onChange={(e) => addFiles(e.target.files)} accept=".jpg,.jpeg,.png,.pdf,.txt" />
            <span className="grid place-items-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>
              <UploadCloud style={{ width: 30, height: 30 }} />
            </span>
            <h3 className="font-display font-bold text-ink text-lg">Drag &amp; drop here</h3>
            <p className="text-sm text-ink-soft mt-1">or <span className="text-accent font-medium">browse files</span> — JPG, PNG, PDF, TXT</p>
          </form>
        </div>

        {/* Selected files */}
        {files.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {files.map((f, i) => (
              <li key={f.name + i}
                className="anim-in flex items-center justify-between gap-3 card px-3.5 py-2.5">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-faint)' }}>
                    <FileText style={{ width: 15, height: 15 }} />
                  </span>
                  <span className="truncate text-sm text-ink">{f.name}</span>
                  {i === 0 && files.length > 1 && (
                    <span className="eyebrow shrink-0" style={{ color: 'var(--accent)' }}>primary</span>
                  )}
                </span>
                <button onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                  className="grid place-items-center w-7 h-7 rounded-md text-ink-faint hover:text-danger transition-colors">
                  <X style={{ width: 15, height: 15 }} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 1 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px]"
            style={{ background: 'var(--accent-tint)', color: 'var(--accent-strong)' }}>
            <Layers style={{ width: 16, height: 16, marginTop: 1 }} className="shrink-0" />
            <span><b>Cross-source mode:</b> {files.length} sources merged — the first file is the primary reference, conflicts get flagged.</span>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl px-3.5 py-3 text-sm"
            style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}>{error}</div>
        )}

        <button
          onClick={process}
          disabled={!files.length || isBusy}
          className="group mt-5 w-full rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2
                     transition-all disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', height: '3.25rem',
            boxShadow: files.length && !isBusy ? 'var(--shadow-md)' : 'none' }}
        >
          {isBusy
            ? (<><Loader2 style={{ width: 19, height: 19 }} className="animate-spin" /> Processing &amp; generating…</>)
            : (<>Process automatically{files.length ? ` · ${files.length} file${files.length > 1 ? 's' : ''}` : ''}
                <ArrowRight style={{ width: 18, height: 18 }} className="transition-transform group-hover:translate-x-0.5" /></>)}
        </button>

        {/* Pipeline (a real sequence) */}
        <div className="mt-14 grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden"
          style={{ background: 'var(--line)' }}>
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="p-5" style={{ background: 'var(--surface)' }}>
              <div className="font-mono text-xs tnum" style={{ color: 'var(--accent)' }}>{n}</div>
              <div className="mt-1.5 font-display font-bold text-ink">{t}</div>
              <div className="mt-1 text-[13px] text-ink-soft leading-snug">{d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
