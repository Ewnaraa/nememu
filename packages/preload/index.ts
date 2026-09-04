import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  IPCEvents,
  GameContext,
  NativeNotificationPayload,
  AppUpdateStatus,
  AccountCapture,
  AccountSecrets,
  SavedAccount,
  LocalServerInfo
} from '@nememu/shared'

const nememuApi = {
  fetchGameContext: async (): Promise<GameContext> => {
    const data = await ipcRenderer.invoke(IPCEvents.GET_GAME_CONTEXT)
    return JSON.parse(data)
  },

  appReadyToShow: () => {
    ipcRenderer.send(IPCEvents.APP_READY_TO_SHOW)
  },

  openExternal: (url: string) => {
    ipcRenderer.send(IPCEvents.OPEN_EXTERNAL, url)
  },

  setAudioMute: (value: boolean) => {
    ipcRenderer.send(IPCEvents.SET_AUDIO_MUTE, value)
  },

  setResolution: (width: number, height: number) => {
    ipcRenderer.send(IPCEvents.SET_RESOLUTION, width, height)
  },

  setConnectedTabs: (count: number) => {
    ipcRenderer.send(IPCEvents.SET_CONNECTED_TABS, count)
  },

  stepZoom: (direction: number) => {
    ipcRenderer.send(IPCEvents.SET_ZOOM, direction)
  },

  resetZoom: () => {
    ipcRenderer.send(IPCEvents.RESET_ZOOM)
  },

  toggleFullScreen: () => {
    ipcRenderer.send(IPCEvents.TOGGLE_FULLSCREEN)
  },

  setWindowTitle: (title: string) => {
    ipcRenderer.send(IPCEvents.SET_WINDOW_TITLE, title)
  },

  requestAttention: () => {
    ipcRenderer.send(IPCEvents.NOTIFY_ATTENTION)
  },

  setSoundOnFocus: (value: boolean) => {
    ipcRenderer.send(IPCEvents.SET_SOUND_ON_FOCUS, value)
  },

  minimize: () => {
    ipcRenderer.send(IPCEvents.WINDOW_MINIMIZE)
  },

  maximize: () => {
    ipcRenderer.send(IPCEvents.WINDOW_MAXIMIZE)
  },

  close: () => {
    ipcRenderer.send(IPCEvents.WINDOW_CLOSE)
  },

  getServerInfo: async (): Promise<LocalServerInfo> => {
    return ipcRenderer.invoke(IPCEvents.GET_SERVER_INFO)
  },

  getSettings: async (): Promise<string> => {
    return ipcRenderer.invoke(IPCEvents.GET_SETTINGS)
  },

  setSettings: (settings: string) => {
    ipcRenderer.send(IPCEvents.SET_SETTINGS, settings)
  },

  checkGameInstalled: async (): Promise<boolean> => {
    return ipcRenderer.invoke(IPCEvents.CHECK_GAME_INSTALLED)
  },

  downloadGame: async (): Promise<void> => {
    await ipcRenderer.invoke(IPCEvents.DOWNLOAD_GAME)
  },

  launchGameWindow: () => {
    ipcRenderer.send(IPCEvents.OPEN_GAME_WINDOW)
  },

  showLauncher: () => {
    ipcRenderer.send(IPCEvents.SHOW_LAUNCHER)
  },

  isGameRunning: async (): Promise<boolean> => {
    return ipcRenderer.invoke(IPCEvents.IS_GAME_RUNNING)
  },

  onGameRunningChanged: (cb: (running: boolean) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, running: boolean) => cb(running)
    ipcRenderer.on(IPCEvents.GAME_RUNNING_CHANGED, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.GAME_RUNNING_CHANGED, listener) }
  },

  onAuthCallback: (cb: (url: string) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, url: string) => cb(url)
    ipcRenderer.on(IPCEvents.AUTH_CALLBACK, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.AUTH_CALLBACK, listener) }
  },

  onSelectTab: (cb: (index: number) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, index: number) => cb(index)
    ipcRenderer.on(IPCEvents.SELECT_TAB, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.SELECT_TAB, listener) }
  },

  onDownloadProgress: (cb: (message: string, percent: number) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, message: string, percent: number) => cb(message, percent)
    ipcRenderer.on(IPCEvents.DOWNLOAD_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.DOWNLOAD_PROGRESS, listener) }
  },

  saveCharacterImage: (name: string, imageData: string) => {
    ipcRenderer.send(IPCEvents.SAVE_CHARACTER_IMAGE, name, imageData)
  },

  getAppUpdateStatus: async (): Promise<AppUpdateStatus> => {
    return ipcRenderer.invoke(IPCEvents.GET_APP_UPDATE_STATUS)
  },

  checkAppUpdate: async (): Promise<AppUpdateStatus> => {
    return ipcRenderer.invoke(IPCEvents.CHECK_APP_UPDATE)
  },

  installAppUpdate: () => {
    ipcRenderer.send(IPCEvents.INSTALL_APP_UPDATE)
  },

  onAppUpdateStatus: (cb: (status: AppUpdateStatus) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, status: AppUpdateStatus) => cb(status)
    ipcRenderer.on(IPCEvents.APP_UPDATE_STATUS, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.APP_UPDATE_STATUS, listener) }
  },

  showNativeNotification: (payload: NativeNotificationPayload) => {
    ipcRenderer.send(IPCEvents.SHOW_NATIVE_NOTIFICATION, payload)
  },

  onNativeNotificationClick: (cb: (tabId?: string) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, tabId?: string) => cb(tabId)
    ipcRenderer.on(IPCEvents.NATIVE_NOTIFICATION_CLICK, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.NATIVE_NOTIFICATION_CLICK, listener) }
  },

  storeGet: async (key: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPCEvents.STORE_GET, key)
  },

  storeSet: (key: string, value: string) => {
    ipcRenderer.send(IPCEvents.STORE_SET, key, value)
  },

  storeDelete: (key: string) => {
    ipcRenderer.send(IPCEvents.STORE_DELETE, key)
  },

  listAccounts: async (): Promise<SavedAccount[]> => {
    return ipcRenderer.invoke(IPCEvents.ACCOUNTS_LIST)
  },

  captureAccount: async (payload: AccountCapture): Promise<SavedAccount | null> => {
    return ipcRenderer.invoke(IPCEvents.ACCOUNTS_CAPTURE, payload)
  },

  renameAccount: async (id: string, label: string): Promise<SavedAccount | null> => {
    return ipcRenderer.invoke(IPCEvents.ACCOUNTS_RENAME, id, label)
  },

  forgetAccount: async (id: string): Promise<void> => {
    await ipcRenderer.invoke(IPCEvents.ACCOUNTS_FORGET, id)
  },

  getAccountSecrets: async (id: string): Promise<AccountSecrets | null> => {
    return ipcRenderer.invoke(IPCEvents.ACCOUNTS_GET_SECRETS, id)
  },

  onAccountsChanged: (cb: (accounts: SavedAccount[]) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, accounts: SavedAccount[]) => cb(accounts)
    ipcRenderer.on(IPCEvents.ACCOUNTS_CHANGED, listener)
    return () => { ipcRenderer.removeListener(IPCEvents.ACCOUNTS_CHANGED, listener) }
  },

  logger: {
    info: (...args: unknown[]) => console.log('[renderer]', ...args),
    warn: (...args: unknown[]) => console.warn('[renderer]', ...args),
    error: (...args: unknown[]) => console.error('[renderer]', ...args),
    debug: (...args: unknown[]) => console.debug('[renderer]', ...args)
  }
}

contextBridge.exposeInMainWorld('nememu', nememuApi)
