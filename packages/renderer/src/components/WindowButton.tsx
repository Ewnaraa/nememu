import React from 'react'
import { colors } from '@/theme'

interface Props {
  onClick: () => void
  title?: string
  hoverBg?: string
  children: React.ReactNode
}

export function WindowButton({ onClick, title, hoverBg, children }: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: '100%',
        background: 'none',
        border: 'none',
        color: colors.textMuted,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg || colors.surfaceActive
        e.currentTarget.style.color = colors.white
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.color = colors.textMuted
      }}
    >
      {children}
    </button>
  )
}
