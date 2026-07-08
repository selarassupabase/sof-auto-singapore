import React from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Menangkap error render agar satu komponen yang gagal tidak membuat
 * seluruh app menjadi layar putih. Menampilkan fallback + tombol pulih.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Terlihat di console dev; di produksi bisa dikirim ke logging service.
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
        <div className="card anim-in" style={{ maxWidth: 440, padding: '2rem', textAlign: 'center' }}>
          <span className="grid place-items-center" style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 1rem',
            background: 'var(--danger-tint)', color: 'var(--danger)',
          }}>
            <AlertTriangle style={{ width: 26, height: 26 }} />
          </span>
          <h1 className="font-display font-bold text-ink" style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
          <p className="text-ink-soft text-sm" style={{ marginTop: 6 }}>
            The page hit an unexpected error. Your data is safe. Reloading usually fixes it.
          </p>
          <pre className="tnum" style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 10, textAlign: 'left',
            background: 'var(--surface-2)', color: 'var(--ink-soft)', fontSize: 11,
            fontFamily: 'var(--font-mono)', overflowX: 'auto', maxHeight: 120,
          }}>{String(this.state.error?.message || this.state.error)}</pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
            <button onClick={() => window.location.reload()}
              className="h-10 px-4 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Reload</button>
            <button onClick={() => { this.setState({ error: null }); window.location.assign('/') }}
              className="h-10 px-4 rounded-lg text-sm font-medium border border-line text-ink-soft">Go home</button>
          </div>
        </div>
      </div>
    )
  }
}
