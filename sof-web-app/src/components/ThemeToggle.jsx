import React, { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

function initialTheme() {
  if (typeof document === 'undefined') return 'light'
  const set = document.documentElement.getAttribute('data-theme')
  if (set === 'light' || set === 'dark') return set
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('sof-theme', theme) } catch { /* noop */ }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label="Toggle theme"
      className="grid place-items-center w-9 h-9 rounded-lg border border-line text-ink-soft
                 hover:text-accent hover:border-accent transition-colors"
    >
      {theme === 'dark'
        ? <Sun style={{ width: 17, height: 17 }} />
        : <Moon style={{ width: 17, height: 17 }} />}
    </button>
  )
}
