import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, Minus, Play, RefreshCw, RotateCw, Settings, X } from 'lucide-react'
import { colors } from '@/theme'
import logoImg from '@/assets/logo.png'
import bgImg from '@/assets/game-loading-bg.jpg'
import type { AppUpdateStatus } from '@nememu/shared'
import { useT, type Translate } from '@/i18n'
import { useSettings } from '@/App'
import { useSettingsStore } from '@/stores/settingsStore'
import { ReleaseNotes } from '@/components/ReleaseNotes'

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
  if (status === 'done') return t('Ready to play')
  if (status === 'error') return installed ? t('Update failed') : t('Install failed')
  return installed ? t('Updating game') : t('Installing game')
}

function getSummary(t: Translate, status: Status, installed: boolean): string {
  if (status === 'checking') return t('Checking the desktop app first, then game files.')
  if (status === 'app-downloading') return t('Downloading the latest published release artifact.')
  if (status === 'app-ready') return t('Restart Nememu to install the downloaded app update.')
  if (status === 'done') return t('The game files are up to date.')
  if (status === 'error') return installed ? t('The existing install can still be opened.') : t('Retry the install.')
  return installed ? t('Applying only the required file updates.') : t('Downloading and patching the game files.')
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

// 'available' is deliberately non-blocking: an app update is announced, but the
// game still starts normally until the user chooses to install it.
function shouldRunGameUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'disabled' || status.phase === 'not-available' || status.phase === 'error' || status.phase === 'idle' || status.phase === 'available'
}

function isActiveAppUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'downloaded'
}

const chromeButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: '100%',
  background: 'none',
  border: 'none',
  color: colors.textMuted,
  cursor: 'pointer'
}

export function LauncherScreen() {
  const t = useT()
  const { setSettingsOpen } = useSettings()
  const autoPlay = useSettingsStore((s) => s.autoPlay)
  const setAutoPlay = useSettingsStore((s) => s.setAutoPlay)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const isHydrated = useSettingsStore((s) => s.isHydrated)

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
  const launchedRef = useRef(false)

  // The launcher owns the settings now: it reads autoPlay, and its gear opens
  // the same panel the game window uses. Nothing hydrated them here before,
  // because this screen used to have nothing to configure.
  //
  // This is a separate window from the game, with its own renderer process and
  // therefore its own copy of the store, so hydrating here does not consume the
  // game window's own startup hydration — which is what re-applies the audio
  // and proxy settings once that window actually exists.
  useEffect(() => { if (!isHydrated) void loadSettings() }, [isHydrated, loadSettings])

  const launch = () => {
    if (launchedRef.current) return
    launchedRef.current = true
    window.nememu.launchGameWindow()
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
    } catch (err: unknown) {
      if (installed) {
        window.nememu.logger.warn('Game update failed, existing install can still be launched', err)
        setStatus('done')
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
      if (pct >= 100) setStatus('done')
    })
    return () => {
      unsubAppUpdate()
      unsub()
    }
  }, [])

  // Auto-launch waits for the settings to arrive. Firing on the default before
  // hydration would ignore the saved preference on every launch, which is the
  // whole setting.
  const ready = status === 'done'
  useEffect(() => {
    if (!ready || !isHydrated || !autoPlay) return
    const id = window.setTimeout(launch, 400)
    return () => window.clearTimeout(id)
  }, [ready, isHydrated, autoPlay])

  const startDownload = async () => {
    gameUpdateStartedRef.current = false
    await runUpdate(hasExistingInstall)
  }

  const safePercent = Math.max(0, Math.min(100, status === 'done' || status === 'app-ready' ? 100 : percent))
  const headline = getHeadline(t, status, hasExistingInstall)
  const summary = getSummary(t, status, hasExistingInstall)
  const primaryMessage = message
    ? t(message)
    : status === 'checking' ? t('Waiting for updater...') : t('Preparing updater...')
  const failure = status === 'error' ? explainError(t, error) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bg }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 32,
          flexShrink: 0,
          background: colors.titlebarSolid,
          borderBottom: `1px solid ${colors.brandBorder}`,
          WebkitAppRegion: 'drag'
        } as CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <img src={logoImg} alt="" style={{ width: 15, height: 15, opacity: 0.9 }} />
          <span style={{ fontSize: 12, color: colors.textLight, fontWeight: 500 }}>Nememu</span>
          <span style={{ fontSize: 11, color: colors.textDim, fontFamily: 'var(--font-mono)' }}>{__APP_VERSION__}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', height: '100%', WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button onClick={() => setSettingsOpen(true)} title={t('Settings')} aria-label={t('Settings')} style={chromeButton}>
            <Settings size={12} />
          </button>
          <button onClick={() => window.nememu.minimize()} title={t('Minimize')} aria-label={t('Minimize')} style={chromeButton}>
            <Minus size={12} />
          </button>
          <button
            onClick={() => window.nememu.close()}
            title={t('Close')}
            aria-label={t('Close')}
            style={chromeButton}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.dangerClose; e.currentTarget.style.color = colors.white }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textMuted }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <img
          src={bgImg}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Two passes rather than one. A single flat scrim dark enough to read
            white text over kills the artwork; this keeps the left column dark
            where the text lives and lets the picture come back on the right. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(100deg, rgba(9,10,15,0.96) 0%, rgba(9,10,15,0.86) 34%, rgba(9,10,15,0.44) 100%)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(0deg, rgba(9,10,15,0.90) 0%, rgba(9,10,15,0.28) 40%, rgba(9,10,15,0) 66%)'
          }}
        />

        <div
          style={{
            position: 'relative',
            height: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 26,
            padding: 28,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img
                src={logoImg}
                alt=""
                style={{ width: 62, height: 62, filter: 'drop-shadow(0 0 22px rgba(201,162,77,0.35))' }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 27,
                    fontWeight: 800,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: colors.white,
                    lineHeight: 1.1
                  }}
                >
                  Nememu
                </div>
                <div style={{ fontSize: 12, color: colors.textDim, marginTop: 3 }}>
                  {t('Unofficial Dofus Touch client')}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.text, marginBottom: 3 }}>
                {headline}
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                {summary}
              </div>

              {/* Nothing left to report once the files are ready: the headline
                  above already says so, and a full progress bar under it is a
                  control that cannot be acted on. */}
              {!ready && (
              <div
                style={{
                  border: `1px solid ${failure ? 'rgba(255,68,68,0.25)' : colors.border}`,
                  borderRadius: 8,
                  background: failure ? 'rgba(244,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                  padding: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {failure ? (
                    <AlertTriangle size={16} color={colors.danger} />
                  ) : status === 'app-ready' ? (
                    // 'done' cannot reach here — the block only renders while
                    // the files are not ready — so this is the app update's
                    // own finished state, not the game download's.
                    <CheckCircle2 size={16} color={colors.accentText} />
                  ) : (
                    <LoaderCircle size={16} color={colors.accentText} style={{ animation: 'nememu-spin 1.2s linear infinite' }} />
                  )}
                  <div style={{ fontSize: 12, color: failure ? colors.danger : colors.textSecondary, minWidth: 0 }}>
                    {failure ? failure.headline : primaryMessage}
                  </div>
                </div>

                <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
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
                  {/* The step *number*, not its title: the title is already the
                      line above, word for word, and repeating it told a player
                      nothing they could not read two lines up. How far along
                      the whole install is, is information the percentage of the
                      current step does not carry. */}
                  <span>
                    {status.startsWith('app-')
                      ? `Nememu ${appUpdate?.version ?? ''}`.trim()
                      : t('Step {current} of {total}', {
                          current: Math.min(currentStep, STEPS.length - 1) + 1,
                          total: STEPS.length
                        })}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{safePercent.toFixed(0)}%</span>
                </div>
              </div>
              )}

              {appUpdate?.phase === 'available' && status !== 'app-downloading' && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: colors.textMuted, minWidth: 0 }}>
                    {t('Nememu {version} is available. Nothing is downloaded unless you ask.', { version: appUpdate.version ?? '' })}
                  </span>
                  <button
                    onClick={() => window.nememu.installAppUpdate()}
                    style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, flexShrink: 0,
                      border: `1px solid ${colors.accentBorder}`, background: 'rgba(201,162,77,0.10)',
                      color: colors.accentText, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    <RotateCw size={14} />
                    <span>{t('Download and install')}</span>
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
                {status === 'app-ready' ? (
                  <button
                    onClick={() => window.nememu.installAppUpdate()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '13px 30px', borderRadius: 9,
                      border: `1px solid ${colors.accentBorder}`, background: 'rgba(201,162,77,0.16)',
                      color: colors.accentText, fontSize: 14, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    <RotateCw size={16} />
                    <span>{t('Restart and Update')}</span>
                  </button>
                ) : failure ? (
                  <button
                    onClick={startDownload}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '13px 30px', borderRadius: 9,
                      border: `1px solid ${colors.accentBorder}`, background: 'rgba(201,162,77,0.10)',
                      color: colors.accentText, fontSize: 14, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={16} />
                    <span>{hasExistingInstall ? t('Retry Update') : t('Retry Download')}</span>
                  </button>
                ) : (
                  <button
                    onClick={launch}
                    disabled={!ready}
                    title={ready ? undefined : t('The game files are still being prepared.')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '13px 38px', borderRadius: 9, border: 'none',
                      background: ready
                        ? `linear-gradient(135deg, ${colors.accentText} 0%, ${colors.accent} 100%)`
                        : 'rgba(255,255,255,0.05)',
                      color: ready ? '#14151e' : colors.textDisabled,
                      fontSize: 15, fontWeight: 800, letterSpacing: '0.04em',
                      cursor: ready ? 'pointer' : 'not-allowed',
                      boxShadow: ready ? '0 8px 26px rgba(201,162,77,0.28)' : 'none',
                      transition: 'filter 0.15s'
                    }}
                    onMouseEnter={(e) => { if (ready) e.currentTarget.style.filter = 'brightness(1.08)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
                  >
                    <Play size={16} fill="currentColor" />
                    <span>{t('Play')}</span>
                  </button>
                )}

                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 11.5, color: colors.textMuted, cursor: 'pointer', userSelect: 'none'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoPlay}
                    onChange={(e) => setAutoPlay(e.target.checked)}
                    style={{ accentColor: colors.accent, cursor: 'pointer', margin: 0 }}
                  />
                  {t('Skip this screen next time')}
                </label>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex', flexDirection: 'column', minHeight: 0,
              border: `1px solid ${colors.brandBorderFaint}`, borderRadius: 10,
              background: 'rgba(8,10,16,0.62)', backdropFilter: 'blur(6px)', overflow: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                padding: '12px 14px 10px', borderBottom: `1px solid ${colors.borderFaint}`
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.text }}>{t("What's new")}</span>
              <span style={{ fontSize: 11, color: colors.textDim, fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                {__APP_VERSION__}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 14px' }}>
              {__APP_CHANGELOG__
                ? <ReleaseNotes source={__APP_CHANGELOG__} />
                : <div style={{ fontSize: 12, color: colors.textDim }}>{t('No release notes for this version.')}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
