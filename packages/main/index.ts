import { app, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'path'
import { APP_SCHEME_PROTOCOLS } from '@nememu/shared'
import { appIconPath } from './app-icon'
import { Application } from './application'
import { logger } from './logger'

process.on('uncaughtException', (err) => {
  if (err.message?.includes('EPIPE')) return
  logger.error('Uncaught exception:', err)
})

const APP_NAME = 'Nememu'
const LEGACY_APP_NAME = 'DofEmu'
const userDataDir = path.join(app.getPath('appData'), APP_NAME)

/**
 * One-time move of the data directory, left over from the rename to Nememu.
 *
 * Everything that makes the client feel already set up lives in that folder:
 * the saved account, the hotkeys, the remembered window size, and — inside
 * Chromium's Local Storage — the Ankama device certificate that stops the game
 * asking for an emailed code at every launch. Renaming the app without moving
 * the folder would silently reset all of it.
 *
 * This runs before app.setPath, so nothing has opened a file in the new
 * location yet. It returns a message rather than logging one, because the log
 * file itself lives in userData and userData is precisely what has not been
 * pointed at the new folder yet.
 */
function migrateLegacyUserData(): string | null {
  const legacyDir = path.join(app.getPath('appData'), LEGACY_APP_NAME)

  try {
    if (fs.existsSync(userDataDir)) return null
    if (!fs.existsSync(legacyDir)) return null
    fs.renameSync(legacyDir, userDataDir)
  } catch (err) {
    return `Could not move the old ${LEGACY_APP_NAME} data folder: ${String(err)}`
  }

  // The settings file and two of the keys inside it carry the old name too.
  try {
    const legacyStore = path.join(userDataDir, 'dofemu-data.json')
    const store = path.join(userDataDir, 'nememu-data.json')
    if (fs.existsSync(legacyStore) && !fs.existsSync(store)) fs.renameSync(legacyStore, store)

    if (fs.existsSync(store)) {
      const parsed = JSON.parse(fs.readFileSync(store, 'utf8')) as Record<string, unknown>
      let changed = false
      for (const [from, to] of [['dofemu-tabs', 'nememu-tabs'], ['dofemu-teams', 'nememu-teams']]) {
        if (from in parsed && !(to in parsed)) {
          parsed[to] = parsed[from]
          delete parsed[from]
          changed = true
        }
      }
      if (changed) fs.writeFileSync(store, JSON.stringify(parsed, null, '\t'))
    }
  } catch (err) {
    return `Data folder moved, but its settings file could not be renamed: ${String(err)}`
  }

  return `Moved the old ${LEGACY_APP_NAME} data folder to ${userDataDir} — accounts, shortcuts and the saved device are kept.`
}

const migrationNote = migrateLegacyUserData()

app.setName(APP_NAME)
app.setPath('userData', userDataDir)

if (migrationNote) logger.info(migrationNote)

app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('max-active-webgl-contexts', '32')

if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  logger.warn('Another instance is already running — exiting.')
  app.exit(0)
  process.exit(0)
}

for (const scheme of APP_SCHEME_PROTOCOLS) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient(scheme)
  }
  logger.info(`Registered protocol: ${scheme}`)
}

function isAuthUrl(url: string): boolean {
  if (!url) return false
  return APP_SCHEME_PROTOCOLS.some((s) => url.startsWith(s + '://'))
}

let pendingAuthUrl: string | null = null

function handleAuthUrl(url: string) {
  if (!isAuthUrl(url)) return
  // The query string carries a single-use authorisation code — length only.
  logger.info(`Auth URL received (${url.length} chars)`)
  const instance = Application.instance
  if (!instance || !instance.gameWindow) {
    logger.info('Application not ready — queueing auth URL for replay.')
    pendingAuthUrl = url
    return
  }
  instance.processAuthCallback(url)
}

if (process.platform === 'darwin') {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthUrl(url)
  })
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine[commandLine.length - 1]
    handleAuthUrl(url)
    Application.instance?.ensureWindow()
  })
}

app.whenReady().then(async () => {
  logger.info('App ready')

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath()))
  }

  await Application.init()
  Application.instance.run()

  if (pendingAuthUrl) {
    const url = pendingAuthUrl
    pendingAuthUrl = null
    logger.info('Replaying queued auth URL after app ready.')
    handleAuthUrl(url)
  }
})

/**
 * The GPU and utility processes crash independently of the window: the game
 * keeps a window on screen while its renderer silently loses hardware
 * acceleration. Recorded so a session that "suddenly got slow" has an entry
 * explaining why, rather than a shrug.
 */
app.on('child-process-gone', (_event, details) => {
  if (details.reason === 'clean-exit') return
  logger.error(
    `${details.type} process gone: reason=${details.reason} exitCode=${details.exitCode}` +
      (details.name ? ` name=${details.name}` : '')
  )
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  Application.instance?.ensureWindow()
})
