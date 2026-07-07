import React from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

/** Review status -> label + semantic tone + icon. Shared by Archive & Review. */
export const STATUS = {
  ok:          { label: 'Clear',       tone: 'ok',     Icon: CheckCircle2 },
  needs_check: { label: 'Needs check', tone: 'warn',   Icon: AlertTriangle },
  blocked:     { label: 'Blocked',     tone: 'danger', Icon: XCircle },
}

const TONE = {
  ok:     'text-ok bg-ok-tint',
  warn:   'text-warn bg-warn-tint',
  danger: 'text-danger bg-danger-tint',
  accent: 'text-accent bg-accent-tint',
}

export function StatusPill({ status, size = 'md' }) {
  const s = STATUS[status] || STATUS.needs_check
  const Icon = s.Icon
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${pad} ${TONE[s.tone]}`}>
      <Icon style={{ width: 13, height: 13 }} /> {s.label}
    </span>
  )
}

export { TONE }
