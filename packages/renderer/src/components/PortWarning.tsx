import React, { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { LocalServerInfo } from '@nememu/shared'
import { colors } from '@/theme'
import { useT } from '@/i18n'

/**
 * Warns when the local server could not take its preferred port.
 *
 * The game stores Ankama's device certificate in the localStorage of
 * `http://127.0.0.1:<port>`. A different port means a different origin, so the
 * certificate is orphaned and Ankama emails a fresh code at every launch — the
 * original bug this client fixed by pinning the port. When something else on
 * the machine already holds it, that bug comes back, and the player has no way
 * to connect the two facts on their own: they just see a code request they were
 * promised would stop.
 *
 * Until now this only reached the log file. It has to reach the player.
 */

export function PortWarning() {
  const t = useT()
  const [info, setInfo] = useState<LocalServerInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.nememu
      .getServerInfo()
      .then((value) => {
        if (cancelled) return
        setInfo(value)
        if (!value.usingPreferredPort) {
          // Recorded so the log says whether the player was actually told, not
          // just that the fallback happened.
          window.nememu.logger.warn(
            `Fallback port in use (${value.port} instead of ${value.preferredPort}) — warning shown to the player.`
          )
        }
      })
      .catch((err) => {
        window.nememu.logger.warn('Could not read the local server info', err)
      })
    return () => { cancelled = true }
  }, [])

  if (!info || info.usingPreferredPort || dismissed) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '9px 12px',
        background: 'rgba(201,162,77,0.08)',
        borderBottom: `1px solid ${colors.brandBorder}`,
        fontSize: 12,
        lineHeight: 1.5,
        color: colors.textLight
      }}
    >
      <AlertTriangle size={14} color={colors.accent} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: colors.accentText, fontWeight: 500 }}>
          {t('Port {port} is taken by another program.', { port: info.preferredPort })}
        </div>
        <div style={{ color: colors.textMuted }}>
          {t(
            'Nememu fell back to port {port}, so the game starts from a different address each time and Ankama will email you a code at every launch. Close whatever is using port {preferred} and restart Nememu.',
            { port: info.port, preferred: info.preferredPort }
          )}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        title={t('Dismiss')}
        style={{
          flexShrink: 0,
          display: 'flex',
          background: 'none',
          border: 'none',
          color: colors.textFaint,
          cursor: 'pointer',
          padding: 2
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.white }}
        onMouseLeave={(e) => { e.currentTarget.style.color = colors.textFaint }}
      >
        <X size={13} />
      </button>
    </div>
  )
}
