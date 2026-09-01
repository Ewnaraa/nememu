import React, { useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'
import { HOTKEY_ACTIONS, HOTKEY_ACTION_LABELS, HOTKEY_GROUPS } from '@nememu/shared'
import { colors } from '@/theme'
import { useSettingsStore } from '@/stores/settingsStore'
import { useT } from '@/i18n'

/**
 * The shortcuts cheat sheet.
 *
 * Dofus Touch is a touch client with no keyboard shortcuts of its own, so every
 * binding here is something a new player has no way of guessing. The sheet is
 * shown once on first launch and stays one click away afterwards.
 *
 * It lists the *current* bindings from the settings store rather than the
 * defaults, so a rebound key is never described wrongly, and it hides unbound
 * actions instead of showing empty rows.
 */

interface Props {
  onClose: () => void
  onOpenSettings: () => void
}

export function ShortcutsOverlay({ onClose, onOpenSettings }: Props) {
  const t = useT()
  const hotkeys = useSettingsStore((s) => s.hotkeys)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    // Capture phase: the sheet must close before the Escape binding reaches the
    // game and starts closing its windows behind the overlay.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  // Same fallback as the hotkeys settings screen: an action that nobody put in
  // a group must still show up, otherwise adding one silently hides it here.
  const grouped = new Set(HOTKEY_GROUPS.flatMap((group) => group.actions))
  const ungrouped = HOTKEY_ACTIONS.filter((action) => !grouped.has(action))
  const source = ungrouped.length > 0
    ? [...HOTKEY_GROUPS, { title: 'Other', actions: ungrouped }]
    : HOTKEY_GROUPS

  const groups = source
    .map((group) => ({
      title: group.title,
      rows: group.actions
        .map((action) => ({ action, combo: hotkeys[action] }))
        .filter((row) => !!row.combo)
    }))
    .filter((group) => group.rows.length > 0)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: colors.modalOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: colors.modalShadow,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 16px',
            borderBottom: `1px solid ${colors.borderSubtle}`
          }}
        >
          <Keyboard size={15} color={colors.accent} />
          <span style={{ fontSize: 14, color: colors.text, fontWeight: 500 }}>{t('Keyboard shortcuts')}</span>
          <span style={{ fontSize: 12, color: colors.textDim }}>
            {t('the game has none of its own')}
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 2
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = colors.white }}
            onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: '0 24px',
            alignContent: 'start'
          }}
        >
          {groups.map((group) => (
            <div key={group.title} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: colors.brandMuted,
                  padding: '6px 0'
                }}
              >
                {t(group.title)}
              </div>
              {group.rows.map((row) => (
                <div
                  key={row.action}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '3px 0',
                    fontSize: 12.5
                  }}
                >
                  <span style={{ color: colors.textMember, flex: 1, minWidth: 0 }}>
                    {t(HOTKEY_ACTION_LABELS[row.action])}
                  </span>
                  <kbd
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: colors.accentText,
                      background: colors.surface,
                      border: `1px solid ${colors.borderSubtle}`,
                      borderRadius: 4,
                      padding: '1px 6px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {row.combo}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderTop: `1px solid ${colors.borderSubtle}`
          }}
        >
          <span style={{ fontSize: 12, color: colors.textDim }}>
            {t('Every key here can be changed.')}
          </span>
          <button
            onClick={() => { onClose(); onOpenSettings() }}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: colors.accentText,
              background: 'none',
              border: `1px solid ${colors.accentBorder}`,
              borderRadius: 4,
              padding: '5px 12px',
              cursor: 'pointer'
            }}
          >
            {t('Change shortcuts')}
          </button>
        </div>
      </div>
    </div>
  )
}
