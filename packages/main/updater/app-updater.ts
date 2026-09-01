import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateStatus } from '@nememu/shared'
import { logger } from '../logger'

type StatusCallback = (status: AppUpdateStatus) => void

/**
 * Where this build looks for updates.
 *
 * Set explicitly, never inherited. It used to be inherited: `build.publish` in
 * package.json still carried the upstream project's repository, so every copy
 * handed to someone was one button away from replacing itself with a binary
 * nobody here had read — undoing the audit this fork exists for. A build may
 * only update itself from a place whoever ships it controls, and naming that
 * place here rather than letting electron-builder decide is what makes the rule
 * checkable.
 *
 * This must stay in step with `build.publish` in package.json: that field is
 * what writes `app-update.yml` into the installer and what uploads `latest.yml`
 * beside a release. A release without `latest.yml` is invisible to the updater.
 *
 * Set to `null` to ship a build that never looks for updates at all.
 */
const UPDATE_FEED: { provider: 'github'; owner: string; repo: string } | null = {
  provider: 'github',
  owner: 'Ewnaraa',
  repo: 'nememu'
}

export class AppUpdater {
  private readonly _onStatus: StatusCallback
  private _status: AppUpdateStatus = { phase: 'idle', message: 'Waiting to check for app updates.' }
  private _started = false
  private _checking: Promise<AppUpdateStatus> | null = null
  private _installRequested = false

  constructor(onStatus: StatusCallback) {
    this._onStatus = onStatus

    // Updates are never fetched or installed behind the user's back: a new
    // release is only downloaded once they explicitly ask for it. A self-built
    // copy therefore stays the binary its owner compiled.
    if (UPDATE_FEED) autoUpdater.setFeedURL(UPDATE_FEED)

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      this._setStatus({ phase: 'checking', message: 'Checking for app update...' })
    })

    // Both outcomes are logged, not just the failures.
    //
    // Until now a check that worked left no trace at all, so "the update button
    // does nothing" was unanswerable from a player's log: it could not tell a
    // check that ran and found nothing from a check that never fired. Silence
    // is not evidence, and this is the one file a player is asked to send back.
    autoUpdater.on('update-available', (info) => {
      logger.info(`Update check: ${info.version} is available (running ${app.getVersion()}).`)
      this._setStatus({
        phase: 'available',
        version: info.version,
        percent: 0,
        message: `App update ${info.version} is available — nothing is downloaded until you ask.`
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      // Both numbers, because they are not always equal: this branch also fires
      // on a dev or pre-release build that is ahead of anything published, and
      // "already on the latest release (0.2.0)" while running 0.2.1 reads like
      // the check got it wrong.
      logger.info(`Update check: nothing newer than ${app.getVersion()} (latest published: ${info.version}).`)
      this._setStatus({
        phase: 'not-available',
        version: info.version,
        message: 'Nememu is up to date.'
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this._setStatus({
        phase: 'downloading',
        percent: progress.percent,
        message: `Downloading app update ${Math.round(progress.percent)}%...`
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this._setStatus({
        phase: 'downloaded',
        version: info.version,
        percent: 100,
        message: `App update ${info.version} is ready to install.`
      })

      if (this._installRequested) {
        this._installRequested = false
        autoUpdater.quitAndInstall(false, true)
      }
    })

    autoUpdater.on('error', (err) => {
      this._installRequested = false
      this._reportFailure(err)
    })
  }

  /**
   * Turns an update failure into a line worth keeping and a state worth showing.
   *
   * Two problems with reporting these raw. The error electron-updater raises on
   * an HTTP failure stringifies to the whole exchange — request, response
   * headers, `set-cookie` included — so a single 404 wrote a GitHub session
   * cookie into a log file players are asked to send back. And a 404 is the
   * normal answer while no release exists yet, or while the repository is still
   * private; surfacing that as "update check failed" greets a first-time player
   * with a broken-looking client over something that is not their problem and
   * costs them nothing.
   *
   * So: one line in the log, and a 404 reported as "nothing to update to".
   */
  private _reportFailure(err: unknown) {
    const raw = err instanceof Error ? err.message : String(err)
    const summary = raw.split('\n')[0].trim() || 'unknown error'
    const notPublished = /\b404\b/.test(raw)

    if (notPublished) {
      logger.info(`No release feed to update from yet (${summary}).`)
      this._setStatus({
        phase: 'not-available',
        message: 'No update available.'
      })
      return
    }

    logger.warn(`App update check failed: ${summary}`)
    this._setStatus({
      phase: 'error',
      error: summary,
      message: 'App update check failed.'
    })
  }

  getStatus(): AppUpdateStatus {
    return this._status
  }

  start() {
    if (this._started) return
    this._started = true

    if (!UPDATE_FEED) {
      this._setStatus({
        phase: 'disabled',
        message: 'This build does not update itself. Get new versions from whoever gave it to you.'
      })
      return
    }

    if (!app.isPackaged) {
      this._setStatus({
        phase: 'disabled',
        message: 'App auto-update is enabled only in packaged builds.'
      })
      return
    }

    setTimeout(() => {
      void this.checkNow()
    }, 1800)
  }

  async checkNow(): Promise<AppUpdateStatus> {
    if (!UPDATE_FEED) {
      this._setStatus({
        phase: 'disabled',
        message: 'This build does not update itself. Get new versions from whoever gave it to you.'
      })
      return this._status
    }

    if (!app.isPackaged) {
      this._setStatus({
        phase: 'disabled',
        message: 'App auto-update is enabled only in packaged builds.'
      })
      return this._status
    }

    if (this._checking) return this._checking

    this._checking = autoUpdater.checkForUpdates()
      .then(() => this._status)
      .catch((err) => {
        this._reportFailure(err)
        return this._status
      })
      .finally(() => {
        this._checking = null
      })

    return this._checking
  }

  /** Only ever called from an explicit user action in the updater screen. */
  installNow() {
    if (this._status.phase === 'downloaded') {
      autoUpdater.quitAndInstall(false, true)
      return
    }

    if (this._status.phase !== 'available' || this._installRequested) return

    this._installRequested = true
    this._setStatus({
      phase: 'downloading',
      version: this._status.version,
      percent: 0,
      message: 'Downloading app update...'
    })

    autoUpdater.downloadUpdate().catch((err) => {
      this._installRequested = false
      logger.warn('App update download failed', err)
      this._setStatus({
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
        message: 'App update download failed.'
      })
    })
  }

  private _setStatus(status: AppUpdateStatus) {
    this._status = status
    this._onStatus(status)
  }
}
