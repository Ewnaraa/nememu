/// <reference types="vite/client" />
import type { GameContext } from '@nememu/shared'
import type { NativeNotificationPayload } from '@nememu/shared'
import type { AppUpdateStatus } from '@nememu/shared'
import type { AccountCapture, AccountSecrets, SavedAccount } from '@nememu/shared'
import type { LocalServerInfo } from '@nememu/shared'

interface NememuAPI {
  fetchGameContext(): Promise<GameContext>
  appReadyToShow(): void
  openExternal(url: string): void
  setAudioMute(value: boolean): void
  setResolution(width: number, height: number): void
  setConnectedTabs(count: number): void
  stepZoom(direction: number): void
  resetZoom(): void
  toggleFullScreen(): void
  setWindowTitle(title: string): void
  requestAttention(): void
  minimize(): void
  maximize(): void
  close(): void
  getServerInfo(): Promise<LocalServerInfo>
  getSettings(): Promise<string>
  setSettings(settings: string): void
  checkGameInstalled(): Promise<boolean>
  downloadGame(): Promise<void>
  launchGameWindow(): void
  showLauncher(): void
  isGameRunning(): Promise<boolean>
  onGameRunningChanged(cb: (running: boolean) => void): () => void
  onAuthCallback(cb: (url: string) => void): () => void
  onSelectTab(cb: (index: number) => void): () => void
  onDownloadProgress(cb: (message: string, percent: number) => void): () => void
  saveCharacterImage(name: string, imageData: string): void
  getAppUpdateStatus(): Promise<AppUpdateStatus>
  checkAppUpdate(): Promise<AppUpdateStatus>
  installAppUpdate(): void
  onAppUpdateStatus(cb: (status: AppUpdateStatus) => void): () => void
  showNativeNotification(payload: NativeNotificationPayload): void
  onNativeNotificationClick(cb: (tabId?: string) => void): () => void
  setSoundOnFocus(value: boolean): void
  storeGet(key: string): Promise<string | null>
  storeSet(key: string, value: string): void
  storeDelete(key: string): void
  listAccounts(): Promise<SavedAccount[]>
  captureAccount(payload: AccountCapture): Promise<SavedAccount | null>
  renameAccount(id: string, label: string): Promise<SavedAccount | null>
  forgetAccount(id: string): Promise<void>
  getSecretsForTab(tabId: string): Promise<AccountSecrets | null>
  onAccountsChanged(cb: (accounts: SavedAccount[]) => void): () => void
  logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}

declare global {
  /**
   * Nememu's own version, injected by Vite from package.json at build time.
   *
   * Not to be confused with `window.buildVersion` / `window.appVersion` below,
   * which are Dofus Touch's versions and come from the game manifest.
   */
  const __APP_VERSION__: string

  /**
   * The CHANGELOG.md section for this version, verbatim, injected by Vite.
   * Empty when the file has no section matching the version.
   */
  const __APP_CHANGELOG__: string

  interface Window {
    nememu: NememuAPI
    buildVersion: string
    appVersion: string
    appInfo: { version: string }
  }
}
