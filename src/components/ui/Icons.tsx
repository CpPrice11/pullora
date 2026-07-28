interface IconProps {
  className?: string
}

export type StatusIconKind = 'info' | 'success' | 'warning' | 'error'

export function StatusIcon({ kind, className = 'ui-icon' }: IconProps & { kind: StatusIconKind }) {
  const path = {
    info: 'M10 8.3v5.2M10 5.8h.01',
    success: 'm5.5 10 3 3 6-6',
    warning: 'M10 7.2v3.8M10 13.6h.01',
    error: 'm6.5 6.5 7 7m0-7-7 7',
  }[kind]

  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      {kind === 'warning' && <path d="M10 2.8 18 17H2L10 2.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />}
      {kind !== 'warning' && <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />}
      <path d={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'ui-icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m7.5 4.5 5 5.5-5 5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function MoreHorizontalIcon({ className = 'ui-icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="4" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="16" cy="10" r="1.4" />
    </svg>
  )
}

export function CloseIcon({ className = 'ui-icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m5 5 10 10M15 5 5 15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}
