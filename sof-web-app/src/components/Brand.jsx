import React from 'react'

/**
 * Mark PACMAR: jarum kompas berfaset di dalam badge.
 * Mengandung dua makna proyek: navigasi maritim + "menetapkan arah / memverifikasi".
 */
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true"
      style={{ display: 'block' }}>
      <rect x="0.5" y="0.5" width="27" height="27" rx="8"
        fill="var(--accent)" stroke="var(--accent-strong)" strokeOpacity="0.5" />
      <circle cx="14" cy="14" r="8.4" stroke="var(--accent-ink)" strokeOpacity="0.28" strokeWidth="1" />
      {/* jarum utara (terang) */}
      <path d="M14 5 L11.4 14 L14 14 Z" fill="var(--accent-ink)" fillOpacity="0.95" />
      <path d="M14 5 L16.6 14 L14 14 Z" fill="var(--accent-ink)" fillOpacity="0.6" />
      {/* jarum selatan (redup) */}
      <path d="M14 23 L11.4 14 L14 14 Z" fill="var(--accent-ink)" fillOpacity="0.4" />
      <path d="M14 23 L16.6 14 L14 14 Z" fill="var(--accent-ink)" fillOpacity="0.25" />
      <circle cx="14" cy="14" r="1.7" fill="var(--accent-ink)" />
    </svg>
  )
}

export default function Brand({ size = 28, compact = false }) {
  return (
    <span className="flex items-center gap-2.5 select-none">
      <Mark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-display font-extrabold tracking-tight text-ink"
          style={{ fontSize: '1.02rem', letterSpacing: '-0.01em' }}>
          PACMAR
        </span>
        {!compact && (
          <span className="eyebrow" style={{ fontSize: '0.58rem', marginTop: '3px' }}>
            SOF&nbsp;·&nbsp;Automation
          </span>
        )}
      </span>
    </span>
  )
}
