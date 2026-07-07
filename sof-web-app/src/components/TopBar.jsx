import React from 'react'
import { useNavigate } from 'react-router-dom'
import Brand from './Brand'
import ThemeToggle from './ThemeToggle'

/** Bar global: brand (klik = home) · aksi halaman · toggle tema. */
export default function TopBar({ children }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 border-b border-line"
      style={{ background: 'color-mix(in oklab, var(--bg) 82%, transparent)', backdropFilter: 'blur(10px)' }}>
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="rounded-lg -ml-1 px-1 py-1 hover:opacity-80 transition-opacity">
          <Brand />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
