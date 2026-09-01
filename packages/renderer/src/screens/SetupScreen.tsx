import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, RotateCw } from 'lucide-react'
import { colors } from '@/theme'
import logoImg from '@/assets/logo.png'
import type { AppUpdateStatus } from '@nememu/shared'
import { useT, type Translate } from '@/i18n'

type Status = 'checking' | 'app-downloading' | 'app-ready' | 'downloading' | 'done' | 'error'

const STEPS = [
  { title: 'Copying base files' },
  { title: 'Downloading manifests' },
  { title: 'Downloading assets' },
  { title: 'Downloading game files' },
  { title: 'Finding versions' },
  { title: 'Applying patches' },
  { title: 'Writing files' },
  { title: 'Cleaning up' },
  { title: 'Saving manifests' },
  { title: 'Done' }
] as const

const shellStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 14,
  background: colors.bg
}

function stepFromMessage(msg: string): number {
  const lower = msg.toLowerCase()
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (lower.includes(STEPS[i].title.toLowerCase())) return i
  }
  return 0
}

function getHeadline(t: Translate, status: Status, installed: boolean): string {
  if (status === 'checking') return t('Checking updates')
  if (status === 'app-downloading') return t('Updating Nememu')
  if (status === 'app-ready') return t('App update ready')
  if (status === 'done') return installed ? t('Update complete') : t('Install complete')
  if (status === 'error') return installed ? t('Update failed') : t('Install failed')
  return installed ? t('Updating game') : t('Installing game')
}

/**
 * Turns a raw failure into something a player can act on.
 *
 * What reaches this screen is whatever Node threw — "fetch failed",
 * "getaddrinfo ENOTFOUND", "ENOSPC". Shown as-is it tells a player nothing
 * except that something is broken, and it tells them nothing about whether the
 * problem is theirs to fix. The raw text is kept underneath, because that is
 * what is worth sending back when someone asks for help.
 */
function explainError(t: Translate, raw: string): { headline: string; detail: string } {
  const lower = raw.toLowerCase()

  const network = [
    'fetch failed', 'enotfound', 'econnrefused', 'econnreset', 'etimedout',
    'eai_again', 'network', 'socket hang up', 'certificate'
  ]
  if (network.some((needle) => lower.includes(needle))) {
    return {
      headline: t('Could not reach the Ankama servers.'),
      detail: t('Check your internet connection, then try again. A VPN, a firewall or an antivirus can also block the download.')
    }
  }

  if (lower.includes('enospc') || lower.includes('no space')) {
    return {
      headline: t('Not enough free disk space.'),
      detail: t('The game files need a few hundred megabytes. Free some space and try again.')
    }
  }

  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('permission')) {
    return {
      headline: t('Windows refused access to a file.'),
      detail: t('An antivirus or a running copy of Nememu may be holding the game files. Close Nememu everywhere and try again.')
    }
  }

  if (lower.includes('ebusy') || lower.includes('locked')) {
    return {
      headline: t('A game file is in use by another program.'),
      detail: t('Close any other running copy of Nememu and try again.')
    }
  }

  return { headline: t('The download failed.'), detail: raw }
}

function getSummary(t: Translate, status: Status, installed: boolean): string {
  if (status === 'checking') return t('Checking the desktop app first, then game files.')
  if (status === 'app-downloading') return t('Downloading the latest published release artifact.')
  if (status === 'app-ready') return t('Restart Nememu to install the downloaded app update.')
  if (status === 'done') return t('Launching the game.')
  if (status === 'error') return installed ? t('The existing install can still be opened.') : t('Retry the install.')
  return installed ? t('Applying only the required file updates.') : t('Downloading and patching the game files.')
}

// 'available' is deliberately non-blocking: an app update is announced, but the
// game still starts normally until the user chooses to install it.
function shouldRunGameUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'disabled' || status.phase === 'not-available' || status.phase === 'error' || status.phase === 'idle' || status.phase === 'available'
}

function isActiveAppUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'downloaded'
}

export function SetupScreen() {
  const t = useT()
  const [status, setStatus] = useState<Status>('checking')
  const [percent, setPercent] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const [hasExistingInstall, setHasExistingInstall] = useState(false)
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus | null>(null)
  const didStartRef = useRef(false)
  const gameUpdateStartedRef = useRef(false)
  const installedRef = useRef(false)
  const launchTimeoutRef = useRef<number | null>(null)

  const scheduleLaunch = () => {
    if (launchTimeoutRef.current !== null) return
    launchTimeoutRef.current = window.setTimeout(() => {
      window.nememu.launchGameWindow()
    }, 800)
  }

  const runUpdate = async (installed: boolean) => {
    if (gameUpdateStartedRef.current) return
    gameUpdateStartedRef.current = true
    setHasExistingInstall(installed)
    setStatus('downloading')
    setError('')
    setPercent(0)
    setCurrentStep(0)
    setMessage(installed ? 'Checking for updates...' : 'Preparing initial download...')

    try {
      await window.nememu.downloadGame()
      setStatus('done')
      scheduleLaunch()
    } catch (err: unknown) {
      if (installed) {
        window.nememu.logger.warn('Game update failed, launching existing install', err)
        window.nememu.launchGameWindow()
        return
      }

      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const handleAppUpdateStatus = (update: AppUpdateStatus, installed: boolean) => {
    setAppUpdate(update)

    if (update.phase === 'checking') {
      setStatus('checking')
      setMessage(update.message ?? 'Checking for app update...')
      setPercent(0)
      return
    }

    if (update.phase === 'downloading') {
      setStatus('app-downloading')
      setMessage(update.message ?? 'Downloading app update...')
      setPercent(update.percent ?? 0)
      return
    }

    if (update.phase === 'downloaded') {
      setStatus('app-ready')
      setMessage(update.message ?? 'App update ready.')
      setPercent(100)
      return
    }

    if (shouldRunGameUpdate(update)) {
      if (update.phase === 'error') {
        window.nememu.logger.warn('App update failed, continuing with game update', update.error)
      }
      void runUpdate(installed)
    }
  }

  useEffect(() => {
    if (didStartRef.current) return
    didStartRef.current = true

    window.nememu.checkGameInstalled().then(async (installed) => {
      installedRef.current = installed
      setHasExistingInstall(installed)

      const current = await window.nememu.getAppUpdateStatus()
      handleAppUpdateStatus(current, installed)
      if (isActiveAppUpdate(current)) return

      const checked = await window.nememu.checkAppUpdate()
      handleAppUpdateStatus(checked, installed)
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    })
  }, [])

  useEffect(() => {
    const unsubAppUpdate = window.nememu.onAppUpdateStatus((update) => {
      handleAppUpdateStatus(update, installedRef.current)
    })
    const unsub = window.nememu.onDownloadProgress((msg, pct) => {
      setMessage(msg)
      setPercent(pct)
      setCurrentStep(stepFromMessage(msg))
      if (pct >= 100) {
        setStatus('done')
        scheduleLaunch()
      }
    })
    return () => {
      unsubAppUpdate()
      unsub()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current !== null) {
        window.clearTimeout(launchTimeoutRef.current)
      }
    }
  }, [])

  const startDownload = async () => {
    gameUpdateStartedRef.current = false
    await runUpdate(hasExistingInstall)
  }

  const installAppUpdate = () => {
    window.nememu.installAppUpdate()
  }

  const safePercent = Math.max(0, Math.min(100, status === 'done' || status === 'app-ready' ? 100 : percent))
  const headline = getHeadline(t, status, hasExistingInstall)
  const summary = getSummary(t, status, hasExistingInstall)
  const primaryMessage = message
    ? t(message)
    : status === 'checking' ? t('Waiting for updater...') : t('Preparing updater...')
  const failure = status === 'error' ? explainError(t, error) : null

  return (
    <div style={shellStyle}>
      <div
        style={{
          width: '100%',
          border: `1px solid ${colors.brandBorderFaint}`,
          borderRadius: 10,
          background: colors.bg,
          boxShadow: colors.modalShadow,
          padding: 14
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <img
            src={logoImg}
            alt=""
            style={{ width: 30, height: 30, filter: 'drop-shadow(0 0 12px rgba(201,162,77,0.28))' }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, letterSpacing: '0.02em' }}>Nememu</div>
            {/* The version, not the mode. This screen is the one a player is
                looking at when something goes wrong, so it is the one place
                where the build number has to be readable without digging. */}
            <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'var(--font-mono)' }}>
              {__APP_VERSION__}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, marginBottom: 4 }}>
          {headline}
        </div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
          {summary}
        </div>

        <div
          style={{
            border: `1px solid ${status === 'error' ? 'rgba(255,68,68,0.25)' : colors.border}`,
            borderRadius: 8,
            background: status === 'error' ? 'rgba(244,68,68,0.05)' : colors.surface,
            padding: 12,
            marginBottom: status === 'error' ? 10 : 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {failure ? (
              <AlertTriangle size={16} color={colors.danger} />
            ) : status === 'done' || status === 'app-ready' ? (
              <CheckCircle2 size={16} color={colors.accentText} />
            ) : (
              <LoaderCircle size={16} color={colors.accentText} style={{ animation: 'nememu-spin 1.2s linear infinite' }} />
            )}
            <div style={{ fontSize: 12, color: failure ? colors.danger : colors.textSecondary, minWidth: 0 }}>
              {failure ? failure.headline : primaryMessage}
            </div>
          </div>

          <div
            style={{
              height: 8,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.06)'
            }}
          >
            <div
              style={{
                width: `${safePercent}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${colors.brandMuted}, ${colors.accent})`,
                transition: 'width 0.3s ease'
              }}
            />
          </div>

          {failure && (
            <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.55, color: colors.textMuted }}>
              <div>{failure.detail}</div>
              {failure.detail !== error && (
                <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: colors.textDisabled, wordBreak: 'break-word' }}>
                  {error}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 11, color: colors.textMuted }}>
            <span>{status.startsWith('app-') ? `Nememu ${appUpdate?.version ?? 'update'}` : t(STEPS[Math.min(currentStep, STEPS.length - 1)]?.title ?? '')}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{safePercent.toFixed(0)}%</span>
          </div>
        </div>

        {appUpdate?.phase === 'available' && status !== 'app-downloading' && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 11, color: colors.textMuted }}>
              {t('Nememu {version} is available. Nothing is downloaded unless you ask.', { version: appUpdate.version ?? '' })}
            </span>
            <button
              onClick={installAppUpdate}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${colors.accentBorder}`,
                background: 'rgba(201,162,77,0.10)',
                color: colors.accentText,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <RotateCw size={14} />
              <span>{t('Download and install')}</span>
            </button>
          </div>
        )}

        {status === 'app-ready' && (
          <button
            onClick={installAppUpdate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.accentBorder}`,
              background: 'rgba(201,162,77,0.14)',
              color: colors.accentText,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RotateCw size={14} />
            <span>{t('Restart and Update')}</span>
          </button>
        )}

        {status === 'error' && (
          <button
            onClick={startDownload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.accentBorder}`,
              background: 'rgba(201,162,77,0.10)',
              color: colors.accentText,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} />
            <span>{hasExistingInstall ? t('Retry Update') : t('Retry Download')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
