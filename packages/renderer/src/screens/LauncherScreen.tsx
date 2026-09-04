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

type Status = 'checking' | 'app-downloading' | 'app-ready' | 'app-installing' | 'downloading' | 'done' | 'error'

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
  if (status === 'app-installing') return t('Installing the update')
  if (status === 'done') return t('Ready to play')
  if (status === 'error') return installed ? t('Update failed') : t('Install failed')
  return installed ? t('Updating game') : t('Installing game')
}

function getSummary(t: Translate, status: Status, installed: boolean): string {
  if (status === 'checking') return t('Checking the desktop app first, then game files.')
  if (status === 'app-downloading') return t('Downloading the latest published release artifact.')
  if (status === 'app-ready') return t('Restart Nememu to install the downloaded app update.')
  if (status === 'app-installing') return t('Nememu closes and reopens on the new version. Nothing to click.')
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
  return status.phase === 'checking' || status.phase === 'downloading' ||
    status.phase === 'downloaded' || status.phase === 'installing'
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
  cursor: 'pointer',
  // Without this the title-bar buttons snap between states while everything
  // else on the screen eases. One abrupt element is enough to make a whole
  // interface feel cheap.
  transition: 'background 0.18s var(--ease-out), color 0.18s var(--ease-out)'
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
  const [gameRunning, setGameRunning] = useState(false)
  const didStartRef = useRef(false)
  const gameUpdateStartedRef = useRef(false)
  const installedRef = useRef(false)
  const launchedRef = useRef(false)
  // True once the game files have finished, one way or the other. A ref, not
  // state, because the app-update callbacks read it from closures that were
  // created before it changed.
  const settledRef = useRef(false)

  // The launcher owns the settings now: it reads autoPlay, and its gear opens
  // the same panel the game window uses. Nothing hydrated them here before,
  // because this screen used to have nothing to configure.
  //
  // This is a separate window from the game, with its own renderer process and
  // therefore its own copy of the store, so hydrating here does not consume the
  // game window's own startup hydration — which is what re-applies the audio
  // and proxy settings once that window actually exists.
  useEffect(() => { if (!isHydrated) void loadSettings() }, [isHydrated, loadSettings])

  // Whether a game window exists. The launcher is no longer destroyed when the
  // game opens, so it can be looking at either situation: a game still to
  // start, or one already running that the button should raise instead.
  useEffect(() => {
    void window.nememu.isGameRunning().then(setGameRunning)
    return window.nememu.onGameRunningChanged(setGameRunning)
  }, [])

  // Opening the game and coming back to it are the same call: the main process
  // creates the window the first time and focuses the existing one afterwards.
  // There is no longer a reason to fire this only once — the launcher stays
  // open behind the game, so its button has to keep working.
  const launch = () => {
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
      settledRef.current = true
      setStatus('done')
    } catch (err: unknown) {
      settledRef.current = true

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

    // Once the game files are settled, an app-update push must not drag the
    // screen backwards.
    //
    // This is what left the launcher stuck. Two checks run at startup — one the
    // updater schedules 1.8s in, one this screen asks for — so a "checking"
    // push can land *after* the game download has already finished. It reset
    // the screen to "Checking for app update…" at 0%, and when the check ended,
    // the branch below handed off to runUpdate, which had already run and
    // returned immediately without restoring anything. Dead end, forever, while
    // the log cheerfully reported that everything had succeeded.
    //
    // The app update is optional and runs beside the game, not in front of it.
    // Only 'checking' is dropped once the game files are settled. It is the one
    // phase that can arrive late from a check nobody is waiting for any more,
    // and letting it through rewound a finished screen back to "Checking
    // updates…" — the freeze this guard was written for.
    //
    // 'downloading' used to be dropped with it, and that was the bug: nothing
    // downloads on its own, so a download push only ever follows a click on
    // "Download and install". Swallowing it meant the one thing the player
    // asked for was also the one thing the launcher refused to show — the
    // window simply sat there until the installer took over the screen.
    if (settledRef.current && update.phase === 'checking') {
      return
    }

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

    if (update.phase === 'installing') {
      setStatus('app-installing')
      setMessage(update.message ?? 'Installing the update...')
      setPercent(100)
      return
    }

    // A failed app update, once the game is already playable, must give the
    // screen back. Falling through to runUpdate does nothing here — it has
    // already run — and the launcher would stay frozen on a progress bar for a
    // download that is not happening any more.
    if (update.phase === 'error' && settledRef.current) {
      window.nememu.logger.warn('App update failed', update.error)
      setStatus('done')
      setPercent(100)
      setMessage(update.message ?? '')
      return
    }

    if (shouldRunGameUpdate(update)) {
      if (update.phase === 'error') {
        window.nememu.logger.warn('App update failed, continuing with game update', update.error)
      }
      void runUpdate(installed)
    }
  }

  // The app-update check is not allowed to hold the game hostage.
  //
  // The startup path hands off to the game download only once the update check
  // reaches a terminal state. That check is a network call to GitHub: behind a
  // captive portal, a blocking firewall or a dead connection it can simply
  // never answer, and nothing downstream has a timeout of its own. The player
  // would sit in front of "Checking for app update…" with no way forward and
  // nothing in the log, because from the app's point of view nothing failed.
  //
  // Updates are optional. The game is not. After this grace period the game
  // update starts regardless; if the check answers later, its result is still
  // shown, and an available update still announces itself.
  const APP_UPDATE_GRACE_MS = 8000
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (gameUpdateStartedRef.current) return
      window.nememu.logger.warn(
        `App update check did not answer within ${APP_UPDATE_GRACE_MS} ms — starting the game update without it.`
      )
      void runUpdate(installedRef.current)
    }, APP_UPDATE_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [])

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
  //
  // It fires once per run: the launcher now survives the game, so without the
  // guard, closing the game would drop the player back on this screen and it
  // would immediately push them into a new one.
  //
  // An announced app update holds it. Skipping the launcher is a convenience;
  // skipping past the only screen that offers the update turns the client into
  // one that can never update itself again — which is exactly what happened:
  // 0.3.4 was published, the log said "0.3.4 is available (running 0.3.3)",
  // and the launcher jumped into the game 400 ms later, twice, with nobody
  // able to see it.
  const ready = status === 'done'
  const appUpdateWaiting =
    appUpdate?.phase === 'available' || appUpdate?.phase === 'downloading' ||
    appUpdate?.phase === 'downloaded' || appUpdate?.phase === 'installing'
  useEffect(() => {
    if (!ready || !isHydrated || !autoPlay || gameRunning || launchedRef.current) return
    if (appUpdateWaiting) return
    launchedRef.current = true
    const id = window.setTimeout(launch, 400)
    return () => window.clearTimeout(id)
  }, [ready, isHydrated, autoPlay, gameRunning, appUpdateWaiting])

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
          <button
            onClick={() => setSettingsOpen(true)}
            title={t('Settings')}
            aria-label={t('Settings')}
            style={chromeButton}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceActive; e.currentTarget.style.color = colors.white }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textMuted }}
          >
            <Settings size={12} />
          </button>
          <button
            onClick={() => window.nememu.minimize()}
            title={t('Minimize')}
            aria-label={t('Minimize')}
            style={chromeButton}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceActive; e.currentTarget.style.color = colors.white }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textMuted }}
          >
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
        {/* 48s, alternating, so neither end of the drift is ever a visible
            stop. It starts already scaled up: the edges must never come into
            frame while it moves. */}
        <img
          src={bgImg}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            animation: 'nememu-drift 48s ease-in-out infinite alternate',
            willChange: 'transform'
          }}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                animation: 'nememu-rise 0.5s ease-out both'
              }}
            >
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

            {/* Staggered by a beat behind the wordmark, so the eye lands on the
                name first and the state second. */}
            <div style={{ marginTop: 'auto', animation: 'nememu-rise 0.5s ease-out 0.12s both' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.text, marginBottom: 3 }}>
                {headline}
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                {summary}
              </div>

              {/* Nothing left to report once the files are ready: the headline
                  above already says so, and a full progress bar under it is a
                  control that cannot be acted on. It collapses rather than
                  unmounting, so the Play button glides up instead of jumping
                  the height of this whole block. */}
              <div className="nememu-collapse" data-hidden={ready ? 'true' : 'false'} style={{ marginBottom: 16 }}>
              <div
                style={{
                  border: `1px solid ${failure ? 'rgba(255,68,68,0.25)' : colors.border}`,
                  borderRadius: 8,
                  background: failure ? 'rgba(244,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                  padding: 12,
                  transition: 'border-color 0.3s var(--ease-out), background 0.3s var(--ease-out)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {failure ? (
                    <AlertTriangle size={16} color={colors.danger} />
                  ) : status === 'app-ready' || ready ? (
                    <CheckCircle2 size={16} color={colors.accentText} />
                  ) : (
                    <LoaderCircle size={16} color={colors.accentText} style={{ animation: 'nememu-spin 1.2s linear infinite' }} />
                  )}
                  <div style={{ fontSize: 12, color: failure ? colors.danger : colors.textSecondary, minWidth: 0 }}>
                    {failure ? failure.headline : primaryMessage}
                  </div>
                </div>

                <div style={{ position: 'relative', height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    style={{
                      width: `${safePercent}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${colors.brandMuted}, ${colors.accent})`,
                      transition: 'width 0.3s ease'
                    }}
                  />
                  {/* A sheen crossing the bar. Some steps sit at the same
                      percentage for a long time — unpacking a big archive, a
                      slow manifest — and a bar that has not moved in twenty
                      seconds looks like a hung app. This says "still working"
                      without pretending progress that has not happened. */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '25%',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
                      animation: 'nememu-sheen 2.4s ease-in-out infinite',
                      pointerEvents: 'none'
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
              </div>

              {appUpdate?.phase === 'available' && status !== 'app-downloading' && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: colors.textMuted, minWidth: 0 }}>
                    {t('Nememu {version} is available. Nothing is downloaded unless you ask.', { version: appUpdate.version ?? '' })}
                    {autoPlay && ` ${t('Automatic launch is on hold until you decide.')}`}
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
                {status === 'app-installing' ? (
                  // Not a button: there is nothing to press, and the app is
                  // about to close. It stands in the same place the Play button
                  // occupies so the screen does not jump on the way out.
                  <div
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '13px 30px', borderRadius: 9,
                      border: `1px solid ${colors.accentBorder}`, background: 'rgba(201,162,77,0.10)',
                      color: colors.accentText, fontSize: 14, fontWeight: 700
                    }}
                  >
                    <LoaderCircle size={16} style={{ animation: 'nememu-spin 1.2s linear infinite' }} />
                    <span>{t('Installing...')}</span>
                  </div>
                ) : status === 'app-ready' ? (
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
                    className="nememu-play"
                    // The glow breathes only once the button can be pressed: it
                    // is an invitation, and inviting a click that does nothing
                    // is worse than sitting still.
                    data-ready={ready ? 'true' : 'false'}
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
                      transition:
                        'background 0.45s var(--ease-out), color 0.45s var(--ease-out), ' +
                        'filter 0.2s var(--ease-out), transform 0.2s var(--ease-out)'
                    }}
                    onMouseEnter={(e) => {
                      if (!ready) return
                      e.currentTarget.style.filter = 'brightness(1.07)'
                      e.currentTarget.style.transform = 'translateY(-1.5px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = 'none'
                      e.currentTarget.style.transform = 'none'
                    }}
                    onMouseDown={(e) => { if (ready) e.currentTarget.style.transform = 'translateY(0.5px)' }}
                    onMouseUp={(e) => { if (ready) e.currentTarget.style.transform = 'translateY(-1.5px)' }}
                  >
                    <Play size={16} fill="currentColor" />
                    <span>{gameRunning ? t('Back to the game') : t('Play')}</span>
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
                  {t('Launch the game automatically')}
                </label>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex', flexDirection: 'column', minHeight: 0,
              border: `1px solid ${colors.brandBorderFaint}`, borderRadius: 10,
              background: 'rgba(8,10,16,0.62)', backdropFilter: 'blur(6px)', overflow: 'hidden',
              animation: 'nememu-rise 0.5s ease-out 0.22s both'
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
