import { app, BrowserWindow, dialog, screen, shell, BeforeSendResponse } from 'electron'
import path, { join } from 'path'
import fs from 'fs'
import { EventEmitter } from 'events'
import { MOBILE_UA_BASE, type ProxySettings } from '@nememu/shared'
import { appIconPath } from '../app-icon'
import { get } from '../constants'
import { logger } from '../logger'
import { getHelperSnippet, getRuntimeHelperSnippet } from '../scripts'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

interface GameWindowOptions {
  url: string
  index: number
  proxy?: ProxySettings | null
  resolution?: { width: number; height: number } | null
  bounds?: WindowBounds | null
  zoom?: number | null
  onBoundsChange?: (bounds: WindowBounds) => void
  onZoomChange?: (zoom: number) => void
}

export interface ProxyCredentials {
  username: string
  password: string
}

const INITIAL_WIDTH = 1280
const INITIAL_HEIGHT = 720
const MIN_WIDTH = 640
const MIN_HEIGHT = 480
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

/**
 * Saved bounds are only reused when they still land on a screen that exists —
 * otherwise unplugging the monitor the app was on would open it off-screen,
 * where it cannot be reached or moved back.
 */
function boundsAreVisible(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    )
  })
}
const HTTP_PROGRESS_EVERY = 25
const DEFAULT_PROXY_PORTS: Record<string, number> = { http: 8080, https: 8080, socks5: 1080 }

/** Strips query strings and fragments so credentials/tokens never reach the logs. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split('?')[0]
  }
}

export class GameWindow extends EventEmitter {
  private readonly _win: BrowserWindow
  private _globalMuted = false
  private _soundOnFocus = true
  private _proxyCredentials: ProxyCredentials | null = null
  private _connectedTabs = 0
  private _gpuStatusLogged = false
  private readonly _savedZoom: number
  private _closeConfirmed = false
  private readonly _onBoundsChange?: (bounds: WindowBounds) => void
  private readonly _onZoomChange?: (zoom: number) => void
  private _requestCount = 0
  private _failureCount = 0

  constructor(opts: GameWindowOptions) {
    super()

    this._onBoundsChange = opts.onBoundsChange
    this._onZoomChange = opts.onZoomChange

    const saved = opts.bounds && boundsAreVisible(opts.bounds) ? opts.bounds : null
    this._savedZoom =
      typeof opts.zoom === 'number' && opts.zoom >= MIN_ZOOM && opts.zoom <= MAX_ZOOM ? opts.zoom : 0

    this._win = new BrowserWindow({
      show: true,
      x: saved?.x,
      y: saved?.y,
      width: saved?.width ?? opts.resolution?.width ?? INITIAL_WIDTH,
      height: saved?.height ?? opts.resolution?.height ?? INITIAL_HEIGHT,
      frame: false,
      resizable: true,
      fullscreenable: true,
      title: 'Nememu',
      icon: appIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        backgroundThrottling: false,
        partition: 'persist:' + opts.index,
        // The game is a Cordova app served from the local static server while it
        // talks to Ankama's origins, and the shell reaches into the iframe's
        // document. Both require the relaxed settings below. contextIsolation
        // and nodeIntegration keep their secure Electron defaults.
        sandbox: false,
        webSecurity: false,
        allowRunningInsecureContent: true,
        // No <webview> anywhere in the renderer, so this was an attack surface
        // switched on for nothing.
        webviewTag: false
      }
    })

    this._win.webContents.setUserAgent(
      `${MOBILE_UA_BASE} DofusTouch Client 3.10.1`
    )

    if (saved?.maximized) this._win.maximize()

    this._setupRequestInterceptors()
    this._setupEventHandlers()
    this.processGame()

    void this._applyProxyThenLoad(opts.url, opts.proxy ?? null)
  }

  get id() {
    return this._win.webContents.id
  }

  /** Read by the app-level 'login' handler to answer proxy authentication challenges. */
  get proxyCredentials(): ProxyCredentials | null {
    return this._proxyCredentials
  }

  focus() {
    this._win.focus()
  }

  isMinimized() {
    return this._win.isMinimized()
  }

  restore() {
    this._win.restore()
  }

  close() {
    this._win.close()
  }

  setAudioMute(value: boolean) {
    if (this._globalMuted !== value) logger.info(`Audio ${value ? 'muted' : 'unmuted'}`)
    this._globalMuted = value
    this._win.webContents.setAudioMuted(value)
  }

  /** Resizes the game window; the setting screen had no effect before this. */
  setResolution(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    if (width < MIN_WIDTH || height < MIN_HEIGHT) return
    if (this._win.isDestroyed() || this._win.isFullScreen()) return

    if (this._win.isMaximized()) this._win.unmaximize()
    this._win.setSize(Math.round(width), Math.round(height))
    this._win.center()
    logger.info(`Resolution set to ${Math.round(width)}x${Math.round(height)}`)
  }

  /** Kept up to date by the renderer so the close guard knows what is at stake. */
  setConnectedTabs(count: number) {
    this._connectedTabs = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
  }

  /**
   * Chromium's own zoom, rather than a CSS transform on the shell: the game
   * computes pointer positions from the viewport, and a CSS zoom desynchronises
   * them from where the player actually clicked.
   */
  stepZoom(direction: number) {
    if (this._win.isDestroyed()) return

    const current = this._win.webContents.getZoomFactor()
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + direction * ZOOM_STEP))
    this._win.webContents.setZoomFactor(next)
    this._onZoomChange?.(next)
  }

  resetZoom() {
    if (this._win.isDestroyed()) return
    this._win.webContents.setZoomFactor(1)
    this._onZoomChange?.(1)
  }

  toggleFullScreen() {
    if (this._win.isDestroyed()) return
    this._win.setFullScreen(!this._win.isFullScreen())
  }

  /** Shown in the taskbar and on Alt+Tab; the character name is far more useful. */
  setTitle(title: string) {
    if (this._win.isDestroyed()) return
    this._win.setTitle(title ? `${title} — Nememu` : 'Nememu')
  }

  /**
   * Draws attention without stealing focus. A system notification disappears
   * after a few seconds; a flashing taskbar entry waits for the player.
   */
  requestAttention() {
    if (this._win.isDestroyed() || this._win.isFocused()) return
    this._win.flashFrame(true)
  }

  setSoundOnFocus(value: boolean) {
    if (this._soundOnFocus !== value) logger.info(`Sound only when focused: ${value}`)
    this._soundOnFocus = value
  }

  async applyProxy(proxy: ProxySettings | null | undefined): Promise<void> {
    const session = this._win.webContents.session
    const host = proxy?.host?.trim() ?? ''

    if (!proxy?.enabled || !host) {
      this._proxyCredentials = null
      await session.setProxy({ mode: 'direct' })
      await session.closeAllConnections()
      logger.info('Proxy disabled — using a direct connection.')
      return
    }

    const protocol = proxy.protocol === 'socks5' ? 'socks5' : proxy.protocol === 'https' ? 'https' : 'http'
    const port = Number(proxy.port) > 0 ? Number(proxy.port) : DEFAULT_PROXY_PORTS[protocol]

    this._proxyCredentials = proxy.username
      ? { username: proxy.username, password: proxy.password ?? '' }
      : null

    await session.setProxy({
      proxyRules: `${protocol}://${host}:${port}`,
      proxyBypassRules: '<local>'
    })
    await session.closeAllConnections()

    // Host and port only — credentials are never logged.
    logger.info(`Proxy applied: ${protocol}://${host}:${port}`)
  }

  private async _applyProxyThenLoad(url: string, proxy: ProxySettings | null) {
    try {
      await this.applyProxy(proxy)
    } catch (err) {
      logger.error('Failed to apply proxy settings', err)
    }
    if (this._win.isDestroyed()) return
    logger.info(`Loading URL: ${safeUrl(url)}`)
    this._win.loadURL(url)
  }

  processAuthCallback(url: string) {
    const escaped = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const js = `
      (function() {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try {
            var win = iframes[i].contentWindow;
            if (win && typeof win.$appSchemeLinkCalled === 'function') {
              win.$appSchemeLinkCalled('${escaped}');
              return 'dispatched to iframe ' + i;
            }
          } catch(e) {}
        }
        if (typeof window.$appSchemeLinkCalled === 'function') {
          window.$appSchemeLinkCalled('${escaped}');
          return 'dispatched to window';
        }
        return 'no handler found';
      })()
    `
    this._win.webContents
      .executeJavaScript(js)
      .then((result: string) => logger.info('Auth callback:', result))
      .catch((err: Error) => logger.error('Auth callback inject failed', err))
  }

  processGame() {
    const buildPath = path.join(get.GAME_PATH(), 'build', 'script.js')
    if (!fs.existsSync(buildPath)) return

    let build = fs.readFileSync(buildPath, 'utf-8')
    let changed = false

    const patches: Array<{ name: string; re: RegExp; template: (m: RegExpExecArray) => string }> = [
      {
        name: '$_haapiModule',
        re: /(\w)\.getHaapiKeyManager\s*=\s*function\s*\(\)/,
        template: (m) => `window.$_haapiModule=${m[1]},${m[0]}`
      },
      {
        name: '$_authManager',
        re: /(\w)\.requestWebAuthToken\s*=\s*function/,
        template: (m) => `window.$_authManager=${m[1]},${m[0]}`
      },
      {
        name: '$_haapiAccount',
        re: /(\w)\.account\s*=\s*new\s+(\w)\((\w),\s*(\w)\)/,
        template: (m) => `${m[0]},window.$_haapiAccount=${m[1]}.account`
      }
    ]

    for (const patch of patches) {
      if (build.includes(patch.name)) continue
      const match = patch.re.exec(build)
      if (!match) continue
      build = build.replace(match[0], patch.template(match))
      changed = true
      logger.info(`Patched: ${patch.name} exposed`)
    }

    if (!build.includes('Ignoring blocked delete for ')) {
      const blockedDeleteMatch =
        /(\w+)\.onblocked\s*=\s*function\(\)\s*\{\s*return\s+(\w+)\((\w+)\("Delete database operation was blocked, name: "\s*\+\s*(\w+)\)\)\s*\}/.exec(build)

      if (blockedDeleteMatch) {
        build = build.replace(
          blockedDeleteMatch[0],
          `${blockedDeleteMatch[1]}.onblocked = function() { return console.warn("Ignoring blocked delete for " + ${blockedDeleteMatch[4]}), ${blockedDeleteMatch[2]}() }`
        )
        changed = true
        logger.info('Patched: blocked IndexedDB delete downgraded')
      }
    }

    const helperStart = Math.max(build.lastIndexOf(';(function () {'), build.lastIndexOf(';(() => {'))
    if (helperStart !== -1 && build.includes('$_deExposeLoginAndCert_v2', helperStart)) {
      build = build.slice(0, helperStart).replace(/\s+$/, '')
      changed = true
    }

    if (!build.includes('$_deExposeLoginAndCert_v2')) {
      build = build.replace(/\s*$/, '') + '\n' + getHelperSnippet()
      changed = true
      logger.info('Patched: helper snippet appended')
    }

    if (changed) {
      fs.writeFileSync(buildPath, build)
      logger.info('processGame: wrote patched script.js')
    }
  }

  private _setupRequestInterceptors() {
    this._win.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.ankama.com/*', 'https://*.ankama-games.com/*'] },
      (details, callback) => {
        const requestHeaders = { ...(details.requestHeaders ?? {}) }
        delete requestHeaders['Referer']
        for (const key of Object.keys(requestHeaders)) {
          if (key.startsWith('Sec-')) delete requestHeaders[key]
        }
        callback({ requestHeaders } as BeforeSendResponse)
      }
    )

    this._win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https:') || url.startsWith('http:')) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    // Successful requests are counted rather than listed: a running total is
    // enough to tell "still downloading" from "stuck", without a log line per
    // asset (and without URLs that may carry tokens).
    this._win.webContents.session.webRequest.onCompleted((details) => {
      if (details.url.startsWith('http://127.0.0.1')) return

      if (details.statusCode >= 400) {
        this._failureCount++
        logger.error(`[HTTP ERR] ${details.method} ${details.statusCode} ${safeUrl(details.url)}`)
        return
      }

      this._requestCount++
      if (this._requestCount % HTTP_PROGRESS_EVERY === 0) {
        logger.info(`[HTTP] ${this._requestCount} requests done, ${this._failureCount} failed`)
      }
    })

    this._win.webContents.session.webRequest.onErrorOccurred((details) => {
      if (details.url.startsWith('http://127.0.0.1')) return
      this._failureCount++
      logger.error(`[HTTP FAIL] ${details.method} ${safeUrl(details.url)} — ${details.error}`)
    })
  }

  /**
   * Records whether the GPU is actually doing the drawing.
   *
   * The game renders through canvas/WebGL, so a fall back to software rendering
   * is the one thing that genuinely destroys its frame rate, and it is
   * invisible from inside the app — it just feels sluggish.
   *
   * This MUST be read after a window has rendered, never at `app.whenReady()`.
   * Before the first window exists Chromium has not brought up its compositing
   * pipeline and reports every feature as `disabled_software`, which reads
   * exactly like a broken GPU. Measured too early it produces a false alarm on
   * a perfectly healthy machine — which is worse than no diagnostic at all,
   * because it sends people hunting for driver problems they do not have.
   */
  private _logGpuStatusOnce() {
    if (this._gpuStatusLogged) return
    this._gpuStatusLogged = true

    try {
      const status = app.getGPUFeatureStatus() as unknown as Record<string, string> | undefined
      if (!status) return

      const interesting = ['gpu_compositing', 'rasterization', '2d_canvas', 'webgl', 'webgl2']
      const summary = interesting
        .filter((key) => key in status)
        .map((key) => `${key}=${status[key]}`)
        .join(' ')

      logger.info(`GPU: ${summary}`)

      // Only the features that matter to this game are worth warning about;
      // several others are off by design on Windows (desktop GL, Vulkan, WebGPU).
      const degraded = interesting.filter((key) => status[key]?.includes('software'))
      if (degraded.length > 0) {
        logger.warn(
          `Rendering on the CPU for: ${degraded.join(', ')} — the game will feel slow.`
        )
      }
    } catch (err) {
      logger.warn('Could not read the GPU status', err)
    }
  }

  private _setupEventHandlers() {
    this._win.webContents.on('did-finish-load', () => {
      this._injectHelperBridge()
      this._logGpuStatusOnce()

      // The zoom factor resets on every load, so a remembered value has to be
      // reapplied here rather than once at startup.
      if (this._savedZoom) this._win.webContents.setZoomFactor(this._savedZoom)
    })

    this._win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) logger.error(`[renderer] ${message}`)
    })

    // Failures that leave no console message at all.
    //
    // Until these were added the log could not answer the one question people
    // actually ask — "it crashed, what happened?" — because a dead renderer
    // writes nothing to its own console on the way out. A shortcut bug that
    // took the client down left the log looking like a perfectly normal
    // session, which is worse than useless: it points the investigation away
    // from the crash.
    this._win.webContents.on('render-process-gone', (_e, details) => {
      logger.error(
        `Game window died: reason=${details.reason} exitCode=${details.exitCode}. ` +
          'Everything above this line is what led to it.'
      )
    })

    this._win.webContents.on('unresponsive', () => {
      logger.error('Game window stopped responding (frozen).')
    })

    this._win.webContents.on('responsive', () => {
      logger.info('Game window is responding again.')
    })

    this._win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, url) => {
      // A cancelled navigation is routine, not a failure worth reporting.
      if (errorCode === -3) return
      logger.error(`Load failed (${errorCode} ${errorDescription}): ${safeUrl(url)}`)
    })

    this._win.webContents.on('preload-error', (_e, preloadPath, error) => {
      logger.error(`Preload script failed: ${preloadPath}`, error)
    })

    this._win.on('focus', () => {
      if (!this._globalMuted) this._win.webContents.setAudioMuted(false)
      this._win.flashFrame(false)
    })

    this._win.on('blur', () => {
      if (this._soundOnFocus) this._win.webContents.setAudioMuted(true)
    })

    this._win.on('close', (event) => {
      this._rememberBounds()

      // Closing the window quits the app and drops every signed-in account at
      // once, so an accidental click is expensive. Only ask when it actually is.
      if (this._closeConfirmed || this._connectedTabs <= 1) return

      event.preventDefault()

      void dialog
        .showMessageBox(this._win, {
          type: 'question',
          buttons: ['Close Nememu', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Close Nememu',
          message: `Disconnect ${this._connectedTabs} accounts?`,
          detail: 'Every tab currently signed in will be disconnected.'
        })
        .then(({ response }) => {
          if (response !== 0 || this._win.isDestroyed()) return
          this._closeConfirmed = true
          this._win.close()
        })
    })

    this._win.on('closed', () => this.emit('closed'))
  }

  private _rememberBounds() {
    if (!this._onBoundsChange || this._win.isDestroyed()) return

    try {
      const maximized = this._win.isMaximized()
      // getNormalBounds gives the restored geometry, so a window closed while
      // maximised still reopens at a sensible size once un-maximised.
      const { x, y, width, height } = this._win.getNormalBounds()
      this._onBoundsChange({ x, y, width, height, maximized })
    } catch (err) {
      logger.warn('Could not record the window position', err)
    }
  }

  private _injectHelperBridge() {
    this._win.webContents.executeJavaScript(getRuntimeHelperSnippet()).catch(() => {})
  }
}
