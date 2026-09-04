import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { join } from 'path'
import { IPCEvents } from '@nememu/shared'
import { appIconPath } from '../app-icon'
import { logger } from '../logger'

interface LauncherWindowOptions {
  url: string
}

/**
 * The window shown before the game.
 *
 * It used to be a 700x190 strip called the updater window: a progress bar that
 * appeared, filled, and closed itself into the game. Nothing could be read at
 * that speed and nothing could be clicked, so the client had no front door —
 * the first thing a new player saw was a Dofus Touch login screen in a window,
 * with no sign of what had put it there.
 *
 * It outlives the game. The first version destroyed itself the moment the game
 * window opened, which made "launch the game automatically" a one-way door —
 * the only control that could turn it back off lived on the screen it removed.
 * It now drops into the taskbar instead, the way the launcher of any other
 * game does, and a click brings it back. Closing it while the game runs is
 * allowed; the game window's logo calls it back.
 *
 * Frameless, like the game window, because it draws its own title bar. The
 * window controls work without any extra wiring: the main process resolves
 * minimise/close against `BrowserWindow.fromWebContents(event.sender)`, so they
 * act on whichever window asked.
 */
export class LauncherWindow extends EventEmitter {
  private readonly _win: BrowserWindow

  constructor(opts: LauncherWindowOptions) {
    super()

    this._win = new BrowserWindow({
      show: false,
      width: 900,
      height: 580,
      minWidth: 900,
      minHeight: 580,
      maxWidth: 900,
      maxHeight: 580,
      center: true,
      frame: false,
      title: 'Nememu',
      autoHideMenuBar: true,
      backgroundColor: '#111218',
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      icon: appIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        backgroundThrottling: false,
        sandbox: false
      }
    })

    this._win.on('closed', () => this.emit('closed'))

    // Everything this window says goes to the log file.
    //
    // It said nothing at all before. `window.nememu.logger` writes to the
    // renderer's console, and only the *game* window forwarded its console to
    // the file — so the one screen a player can get stuck on was the one window
    // whose messages went nowhere. A launcher frozen at "Checking for app
    // update…" produced a log in which every line reported success.
    //
    // Unlike the game window, which is filtered to warnings and errors because
    // Dofus Touch shouts hundreds of times a second, this window is quiet
    // enough to keep everything: its whole startup story is a handful of lines,
    // and that story is exactly what is missing when someone reports a launcher
    // that never gets anywhere.
    this._win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3) logger.error(`[launcher] ${message}`)
      else if (level >= 2) logger.warn(`[launcher] ${message}`)
      else logger.info(`[launcher] ${message}`)
    })

    // A renderer that dies writes nothing to its own console on the way out,
    // so these are the only trace such a failure would ever leave. The launcher
    // had none of them: if it died before drawing, the window simply sat there
    // and the log ended mid-startup with no explanation.
    this._win.webContents.on('render-process-gone', (_e, details) => {
      logger.error(
        `Launcher window died: reason=${details.reason} exitCode=${details.exitCode}. ` +
          'Everything above this line is what led to it.'
      )
    })

    this._win.webContents.on('unresponsive', () => {
      logger.error('Launcher window stopped responding (frozen).')
    })

    this._win.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
      if (errorCode === -3) return
      logger.error(`Launcher failed to load (${errorCode} ${errorDescription}).`)
    })

    this._win.webContents.on('preload-error', (_e, preloadPath, error) => {
      logger.error(`Launcher preload script failed: ${preloadPath}`, error)
    })

    this._win.loadURL(opts.url)
    logger.info(`Loading launcher URL: ${opts.url}`)
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

  minimize() {
    this._win.minimize()
  }

  /**
   * Bring the window back into view, whatever state it was left in.
   *
   * The launcher now survives the game, so it can be sitting minimised in the
   * taskbar, or hidden behind a maximised game window. `show()` handles the
   * second case and `restore()` the first; neither one covers both.
   */
  reveal() {
    if (this._win.isMinimized()) this._win.restore()
    this._win.show()
    this._win.focus()
  }

  close() {
    this._win.close()
  }

  sendProgress(message: string, percent: number) {
    this._win.webContents.send(IPCEvents.DOWNLOAD_PROGRESS, message, percent)
  }

  /** Tell the launcher whether a game window is currently open. */
  sendGameRunning(running: boolean) {
    if (this._win.isDestroyed()) return
    this._win.webContents.send(IPCEvents.GAME_RUNNING_CHANGED, running)
  }
}
