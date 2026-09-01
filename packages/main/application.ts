import { app, BrowserWindow, ipcMain, Notification, powerSaveBlocker, shell } from 'electron'
import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import crypto from 'crypto'
import { Server } from 'http'
import { AddressInfo } from 'net'
import path, { join } from 'path'
import fs from 'fs'
import ElectronStore from 'electron-store'
import {
  IPCEvents,
  GameContext,
  NativeNotificationPayload,
  LocalServerInfo,
  AppUpdateStatus,
  type AccountCapture,
  type ProxySettings
} from '@nememu/shared'
import { get } from './constants'
import { GameWindow, type WindowBounds } from './windows/game-window'
import { LauncherWindow } from './windows/launcher-window'
import { AppUpdater, GameUpdater } from './updater'
import { AccountVault } from './accounts'
import { decryptSecret, encryptSecret } from './secure'
import { logger } from './logger'
import { platform } from 'os'

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  js: 'application/javascript',
  css: 'text/css',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  webp: 'image/webp'
}

/**
 * Serves a single directory over the loopback-only server. Everything the app
 * needs is same-origin, so no CORS header is emitted: that keeps pages opened
 * in the user's regular browser from reading these files over localhost.
 */
function createStaticHandler(basePath: string, urlPrefix: string) {
  const root = path.resolve(basePath)

  return async (c: Context) => {
    let filePath: string
    try {
      filePath = path.resolve(root, decodeURIComponent(c.req.path.slice(urlPrefix.length)))
    } catch {
      return c.text('Bad Request', 400)
    }

    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      return c.text('Forbidden', 403)
    }

    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return c.text('Not Found', 404)
    } catch {
      return c.text('Not Found', 404)
    }

    const content = fs.readFileSync(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''

    return new Response(content, {
      headers: { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' }
    })
  }
}

/** Settings are persisted on every keystroke; wait for the field to settle before re-dialling. */
const PROXY_APPLY_DEBOUNCE = 800

/**
 * The game is served from http://127.0.0.1:<port>, and the browser keys
 * localStorage and IndexedDB by origin — port included. A random port therefore
 * gave the game a brand new, empty storage on every launch, losing the HAAPI key
 * and the device certificate it had just saved, which is why Ankama kept asking
 * for a fresh emailed code.
 *
 * A stable port keeps the origin stable, so the game's own session survives a
 * restart. The alternatives are only used when the preferred port is taken;
 * 0 is the last resort so the app still starts rather than refusing to run.
 */
const SERVER_PORTS = [27615, 27616, 27617, 27618, 0]

function listen(port: number, fetchHandler: Hono['fetch']): Promise<Server | null> {
  return new Promise((resolve) => {
    let settled = false

    const server = serve({ fetch: fetchHandler, port, hostname: '127.0.0.1' }) as Server

    server.on('listening', () => {
      if (settled) return
      settled = true
      resolve(server)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      if (err.code !== 'EADDRINUSE') logger.warn(`Local server on port ${port} failed`, err)
      resolve(null)
    })
  })
}

const STORE_NAME = 'nememu-data'

type StoreSchema = Record<string, unknown>

/**
 * Opens the settings store without ever letting a damaged file stop the app.
 *
 * electron-store throws when the JSON cannot be parsed, and that throw happens
 * before any window exists — the app then runs with no UI at all, which looks
 * exactly like a silent crash. A settings file is never worth that: the broken
 * one is kept aside for inspection and the app starts from defaults.
 */
function openStore(): ElectronStore<StoreSchema> {
  try {
    return new ElectronStore<StoreSchema>({ name: STORE_NAME, clearInvalidConfig: true })
  } catch (err) {
    logger.error('Settings file could not be read — starting from defaults', err)

    try {
      const storePath = join(app.getPath('userData'), `${STORE_NAME}.json`)
      if (fs.existsSync(storePath)) {
        const backupPath = `${storePath}.corrupt-${Date.now()}`
        fs.renameSync(storePath, backupPath)
        logger.warn(`Unreadable settings kept at ${backupPath}`)
      }
    } catch (backupErr) {
      logger.warn('Could not set the unreadable settings file aside', backupErr)
    }

    return new ElectronStore<StoreSchema>({ name: STORE_NAME })
  }
}
type StoredSettings = Record<string, unknown>

export class Application {
  private static _instance: Application | null = null
  private _gameWindow: GameWindow | null = null
  private _launcherWindow: LauncherWindow | null = null
  private _appUpdater: AppUpdater | null = null
  private readonly _server: Server
  private readonly _hash: string
  private _buildVersion = ''
  private _appVersion = ''
  private _store: ElectronStore<StoreSchema>
  private _accounts: AccountVault
  private _startupComplete = false
  private _powerSaveBlockerId: number | null = null
  private _proxyTimer: NodeJS.Timeout | null = null
  /**
   * The port actually obtained. When it is not the preferred one the game runs
   * from a different origin at every launch, which orphans Ankama's device
   * certificate and brings back the emailed code — the exact bug this fixed
   * port was chosen to solve. The renderer needs to know so it can say so.
   */
  private static _serverPort = 0
  private _lastProxySignature: string | null = null

  static async init() {
    if (Application._instance) throw new Error('Application already initialized')

    const hash = crypto.createHash('sha256').update(app.getName() + app.getVersion()).digest('hex')

    const honoApp = new Hono()

    honoApp.get('/game/*', createStaticHandler(get.GAME_PATH(), '/game/'))
    honoApp.get('/character-images/*', createStaticHandler(get.CHARACTER_IMAGES_PATH(), '/character-images/'))
    honoApp.get('/renderer/*', createStaticHandler(join(__dirname, '../renderer/'), '/renderer/'))

    let server: Server | null = null
    for (const port of SERVER_PORTS) {
      server = await listen(port, honoApp.fetch)
      if (server) break
      logger.warn(`Port ${port} is already in use, trying the next one.`)
    }

    if (!server) throw new Error('Could not start the local game server on any port.')

    const address = server.address() as AddressInfo
    Application._serverPort = address.port
    logger.info(`Local server on port ${address.port}`)
    if (address.port !== SERVER_PORTS[0]) {
      logger.warn(
        `Preferred port ${SERVER_PORTS[0]} was unavailable — the game starts from a different origin, ` +
          'so it will ask to sign in again.'
      )
    }

    Application._instance = new Application(server, hash)
  }

  static get instance(): Application {
    return Application._instance!
  }

  private constructor(server: Server, hash: string) {
    this._server = server
    this._hash = hash
    this._store = openStore()
    this._accounts = new AccountVault(this._store)
  }

  get gameWindow(): GameWindow | null {
    return this._gameWindow
  }

  get serverPort(): number {
    return (this._server.address() as AddressInfo).port
  }

  get localBase(): string {
    return `http://127.0.0.1:${this.serverPort}`
  }

  run() {
    this._loadVersions()
    this._setupIPCHandlers()
    this._setupProxyAuth()
    this._appUpdater = new AppUpdater((status) => this._broadcastAppUpdateStatus(status))
    this.ensureWindow()
    this._appUpdater.start()
  }

  private _loadVersions() {
    try {
      if (fs.existsSync(get.LOCAL_VERSIONS_PATH())) {
        const data = JSON.parse(fs.readFileSync(get.LOCAL_VERSIONS_PATH(), 'utf-8'))
        if (data.buildVersion) this._buildVersion = data.buildVersion
        if (data.appVersion) this._appVersion = data.appVersion
        logger.info(`Loaded versions: build=${this._buildVersion} app=${this._appVersion}`)
      }
    } catch (err) {
      logger.warn('Failed to load versions.json', err)
    }
  }

  ensureWindow() {
    if (this._launcherWindow) {
      if (this._launcherWindow.isMinimized()) this._launcherWindow.restore()
      this._launcherWindow.focus()
      return
    }

    if (this._gameWindow) {
      if (this._gameWindow.isMinimized()) this._gameWindow.restore()
      this._gameWindow.focus()
      return
    }

    if (this._startupComplete) this._createGameWindow()
    else this._createLauncherWindow()
  }

  setBuildVersion(v: string) { this._buildVersion = v }
  setAppVersion(v: string) { this._appVersion = v }

  processAuthCallback(url: string) {
    logger.info(`Auth callback: ${url.length} chars`)
    this._gameWindow?.processAuthCallback(url)
  }

  // ---------------------------------------------------------------- settings

  private _readStoredSettings(): StoredSettings {
    const raw = this._store.get('settings', {})
    return raw && typeof raw === 'object' ? (raw as StoredSettings) : {}
  }

  private _settingsForRenderer(): StoredSettings {
    const settings = { ...this._readStoredSettings() }
    const stored = settings.proxy

    if (stored && typeof stored === 'object') {
      const { passwordEnc, ...proxy } = stored as Record<string, unknown>
      settings.proxy = { ...proxy, password: decryptSecret(passwordEnc) }
    }

    return settings
  }

  private _savedBounds(): WindowBounds | null {
    const raw = this._store.get('windowBounds')
    if (!raw || typeof raw !== 'object') return null

    const bounds = raw as Partial<WindowBounds>
    const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

    if (!isNumber(bounds.x) || !isNumber(bounds.y) || !isNumber(bounds.width) || !isNumber(bounds.height)) {
      return null
    }

    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: bounds.maximized === true
    }
  }

  private _currentResolution(): { width: number; height: number } | null {
    const windowSettings = this._settingsForRenderer().window as
      | { resolution?: { width?: number; height?: number } }
      | undefined
    const resolution = windowSettings?.resolution

    if (typeof resolution?.width !== 'number' || typeof resolution?.height !== 'number') return null
    return { width: resolution.width, height: resolution.height }
  }

  private _currentProxySettings(): ProxySettings | null {
    const proxy = this._settingsForRenderer().proxy
    return proxy && typeof proxy === 'object' ? (proxy as unknown as ProxySettings) : null
  }

  private _saveSettings(incoming: StoredSettings) {
    const settings = { ...incoming }
    const proxy = settings.proxy

    if (proxy && typeof proxy === 'object') {
      const { password, ...rest } = proxy as Record<string, unknown>
      const passwordEnc = encryptSecret(typeof password === 'string' ? password : '')
      settings.proxy = passwordEnc ? { ...rest, passwordEnc } : rest
    }

    this._store.set('settings', settings)
  }

  private _scheduleProxyUpdate(proxy: ProxySettings | null) {
    const signature = JSON.stringify([
      proxy?.enabled ?? false,
      proxy?.host ?? '',
      proxy?.port ?? 0,
      proxy?.protocol ?? '',
      proxy?.username ?? '',
      proxy?.password ?? ''
    ])

    if (signature === this._lastProxySignature) return
    this._lastProxySignature = signature

    if (this._proxyTimer) clearTimeout(this._proxyTimer)
    this._proxyTimer = setTimeout(() => {
      this._proxyTimer = null
      void this._gameWindow?.applyProxy(proxy)
    }, PROXY_APPLY_DEBOUNCE)
  }

  private _setupProxyAuth() {
    app.on('login', (event, _webContents, _details, authInfo, callback) => {
      if (!authInfo.isProxy) return

      const credentials = this._gameWindow?.proxyCredentials
      if (!credentials) return

      event.preventDefault()
      logger.info('Answering proxy authentication challenge.')
      callback(credentials.username, credentials.password)
    })
  }

  // ----------------------------------------------------------------- windows

  private _createGameWindow() {
    this._gameWindow = new GameWindow({
      url: this._getRendererUrl('/game'),
      index: 0,
      proxy: this._currentProxySettings(),
      resolution: this._currentResolution(),
      bounds: this._savedBounds(),
      zoom: typeof this._store.get('windowZoom') === 'number' ? (this._store.get('windowZoom') as number) : null,
      onBoundsChange: (bounds) => this._store.set('windowBounds', bounds),
      onZoomChange: (zoom) => this._store.set('windowZoom', zoom)
    })

    this._gameWindow.on('closed', () => {
      this._gameWindow = null
      if (!this._launcherWindow) app.quit()
    })
  }

  private _createLauncherWindow() {
    this._launcherWindow = new LauncherWindow({ url: this._getRendererUrl('/launcher') })

    this._launcherWindow.on('closed', () => {
      this._launcherWindow = null
      if (!this._gameWindow) app.quit()
    })
  }

  private _getRendererUrl(route: '/game' | '/launcher') {
    const devServer = process.env['VITE_DEV_SERVER_HOST'] && process.env['VITE_DEV_SERVER_PORT']
    return devServer
      ? `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}#${route}`
      : `${this.localBase}/renderer/index.html#${route}`
  }

  private _openGameWindow() {
    this._startupComplete = true

    if (!this._gameWindow) {
      this._createGameWindow()
    } else {
      this._gameWindow.focus()
    }

    if (this._launcherWindow) {
      const launcherWindow = this._launcherWindow
      this._launcherWindow = null
      launcherWindow.close()
    }
  }

  private _setupIPCHandlers() {
    ipcMain.handle(IPCEvents.GET_GAME_CONTEXT, (event) => {
      const context: GameContext = {
        gameSrc: `${this.localBase}/game/index.html?delayed=true`,
        characterImagesSrc: `${this.localBase}/character-images/`,
        windowId: event.sender.id,
        hash: this._hash,
        platform: platform(),
        buildVersion: this._buildVersion,
        appVersion: this._appVersion
      }
      return JSON.stringify(context)
    })

    ipcMain.handle(IPCEvents.GET_SERVER_INFO, (): LocalServerInfo => ({
      port: Application._serverPort,
      preferredPort: SERVER_PORTS[0],
      usingPreferredPort: Application._serverPort === SERVER_PORTS[0]
    }))

    ipcMain.handle(IPCEvents.GET_SETTINGS, () => {
      return JSON.stringify(this._settingsForRenderer())
    })

    ipcMain.on(IPCEvents.SET_SETTINGS, (_event, settings: string) => {
      try {
        const parsed = JSON.parse(settings) as StoredSettings
        this._saveSettings(parsed)

        const proxy = parsed.proxy
        this._scheduleProxyUpdate(
          proxy && typeof proxy === 'object' ? (proxy as unknown as ProxySettings) : null
        )
      } catch (err) {
        logger.warn('Failed to save settings', err)
      }
    })

    ipcMain.handle(IPCEvents.STORE_GET, (_event, key: string) => {
      const val = this._store.get(key)
      return val !== undefined ? JSON.stringify(val) : null
    })

    ipcMain.on(IPCEvents.STORE_SET, (_event, key: string, value: string) => {
      try {
        this._store.set(key, JSON.parse(value))
      } catch {}
    })

    ipcMain.on(IPCEvents.STORE_DELETE, (_event, key: string) => {
      this._store.delete(key)
    })

    ipcMain.on(IPCEvents.OPEN_EXTERNAL, (_event, url: string) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url)
      }
    })

    ipcMain.on(IPCEvents.SET_AUDIO_MUTE, (_event, value: boolean) => {
      this._gameWindow?.setAudioMute(value)
    })

    ipcMain.on(IPCEvents.SET_RESOLUTION, (_event, width: number, height: number) => {
      this._gameWindow?.setResolution(width, height)
    })

    ipcMain.on(IPCEvents.SET_CONNECTED_TABS, (_event, count: number) => {
      this._gameWindow?.setConnectedTabs(count)
      this._updatePowerSaveBlocker(count)
    })

    ipcMain.on(IPCEvents.RESET_ZOOM, () => {
      this._gameWindow?.resetZoom()
    })

    ipcMain.on(IPCEvents.TOGGLE_FULLSCREEN, () => {
      this._gameWindow?.toggleFullScreen()
    })

    ipcMain.on(IPCEvents.SET_WINDOW_TITLE, (_event, title: string) => {
      this._gameWindow?.setTitle(typeof title === 'string' ? title.slice(0, 60) : '')
    })

    ipcMain.on(IPCEvents.NOTIFY_ATTENTION, () => {
      this._gameWindow?.requestAttention()
    })

    ipcMain.on(IPCEvents.SET_ZOOM, (_event, direction: number) => {
      this._gameWindow?.stepZoom(direction >= 0 ? 1 : -1)
    })

    ipcMain.on(IPCEvents.SET_SOUND_ON_FOCUS, (_event, value: boolean) => {
      this._gameWindow?.setSoundOnFocus(value)
    })

    ipcMain.on(IPCEvents.WINDOW_MINIMIZE, (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
    })

    ipcMain.on(IPCEvents.WINDOW_MAXIMIZE, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.isMaximized() ? win.unmaximize() : win.maximize()
      }
    })

    ipcMain.on(IPCEvents.WINDOW_CLOSE, (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close()
    })

    ipcMain.on(IPCEvents.APP_READY_TO_SHOW, (event) => {
      BrowserWindow.fromWebContents(event.sender)?.show()
    })

    ipcMain.on(IPCEvents.SAVE_CHARACTER_IMAGE, (_event, name: string, imageData: string) => {
      const safeName = path.basename(name).replace(/[^\w\-. ]/g, '_')
      if (!safeName || safeName === '.' || safeName === '..') return

      const charImagesPath = get.CHARACTER_IMAGES_PATH()
      fs.mkdirSync(charImagesPath, { recursive: true })
      const base64 = imageData.replace(/^data:image\/png;base64,/, '')
      const filePath = join(charImagesPath, `${safeName}.png`)
      fs.writeFile(filePath, base64, 'base64', (err) => {
        if (err) logger.error('Failed to save character image', err)
        else logger.info(`Saved character image: ${safeName}.png`)
      })
    })

    ipcMain.handle(IPCEvents.GET_APP_UPDATE_STATUS, () => {
      return this._appUpdater?.getStatus() ?? {
        phase: 'idle',
        message: 'App updater is not initialized.'
      } satisfies AppUpdateStatus
    })

    ipcMain.handle(IPCEvents.CHECK_APP_UPDATE, () => {
      return this._appUpdater?.checkNow() ?? {
        phase: 'idle',
        message: 'App updater is not initialized.'
      } satisfies AppUpdateStatus
    })

    ipcMain.on(IPCEvents.INSTALL_APP_UPDATE, () => {
      this._appUpdater?.installNow()
    })

    ipcMain.on(IPCEvents.SHOW_NATIVE_NOTIFICATION, (event, payload: NativeNotificationPayload) => {
      if (!Notification.isSupported() || !payload?.title) return

      const win = BrowserWindow.fromWebContents(event.sender)
      const notification = new Notification({
        title: payload.title.slice(0, 120),
        body: payload.body?.slice(0, 260)
      })

      notification.on('click', () => {
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
          win.webContents.send(IPCEvents.NATIVE_NOTIFICATION_CLICK, payload.tabId)
        }
      })

      notification.show()
    })

    ipcMain.handle(IPCEvents.CHECK_GAME_INSTALLED, () => {
      return ['index.html', join('build', 'script.js')].every((file) => fs.existsSync(join(get.GAME_PATH(), file)))
    })

    ipcMain.handle(IPCEvents.DOWNLOAD_GAME, async (event) => {
      const sender = event.sender
      const updater = new GameUpdater((message, percent) => {
        sender.send(IPCEvents.DOWNLOAD_PROGRESS, message, percent)
      })
      try {
        const versions = await updater.run()
        this._buildVersion = versions.buildVersion
        this._appVersion = versions.appVersion
        logger.info(`Game downloaded: build=${versions.buildVersion} app=${versions.appVersion}`)
        this._gameWindow?.processGame()
      } catch (err) {
        logger.error('Game download failed', err)
        throw err
      }
    })

    ipcMain.on(IPCEvents.OPEN_GAME_WINDOW, () => {
      this._openGameWindow()
    })

    ipcMain.handle(IPCEvents.ACCOUNTS_LIST, () => this._accounts.list())

    ipcMain.handle(IPCEvents.ACCOUNTS_CAPTURE, (_event, payload: AccountCapture) => {
      const saved = this._accounts.capture(payload)
      if (saved) this._broadcastAccounts()
      return saved
    })

    ipcMain.handle(IPCEvents.ACCOUNTS_RENAME, (_event, id: string, label: string) => {
      const renamed = this._accounts.rename(id, label)
      if (renamed) this._broadcastAccounts()
      return renamed
    })

    ipcMain.handle(IPCEvents.ACCOUNTS_FORGET, (_event, id: string) => {
      this._accounts.forget(id)
      this._broadcastAccounts()
    })

    // The only path by which credentials leave the vault, and only towards the
    // game window that is about to sign in with them.
    ipcMain.handle(IPCEvents.ACCOUNTS_GET_SECRETS, (_event, id: string) => {
      const secrets = this._accounts.getSecrets(id)
      if (secrets) this._accounts.touch(id)
      return secrets
    })
  }

  /**
   * A signed-in account is a live connection, and letting the display sleep
   * eventually drops it. The blocker is released as soon as nothing is
   * connected, so an idle launcher does not keep the machine awake.
   */
  private _updatePowerSaveBlocker(connectedTabs: number) {
    const shouldBlock = connectedTabs > 0

    try {
      if (shouldBlock && this._powerSaveBlockerId === null) {
        this._powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
        logger.info('Display sleep blocked while an account is connected.')
        return
      }

      if (!shouldBlock && this._powerSaveBlockerId !== null) {
        powerSaveBlocker.stop(this._powerSaveBlockerId)
        this._powerSaveBlockerId = null
        logger.info('Display sleep no longer blocked.')
      }
    } catch (err) {
      logger.warn('Could not change the power save blocker', err)
      this._powerSaveBlockerId = null
    }
  }

  private _broadcastAccounts() {
    const accounts = this._accounts.list()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPCEvents.ACCOUNTS_CHANGED, accounts)
    }
  }

  private _broadcastAppUpdateStatus(status: AppUpdateStatus) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPCEvents.APP_UPDATE_STATUS, status)
    }
  }
}
