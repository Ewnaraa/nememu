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

  close() {
    this._win.close()
  }

  sendProgress(message: string, percent: number) {
    this._win.webContents.send(IPCEvents.DOWNLOAD_PROGRESS, message, percent)
  }
}
