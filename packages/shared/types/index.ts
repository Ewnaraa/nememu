export interface GameContext {
  gameSrc: string
  characterImagesSrc: string
  windowId: number
  hash: string
  platform: string
  buildVersion: string
  appVersion: string
}

export interface WindowSettings {
  audioMuted: boolean
  soundOnFocus: boolean
  resolution: Resolution
}

export interface Resolution {
  width: number
  height: number
}

export interface ProxySettings {
  enabled: boolean
  host: string
  port: number
  username: string
  password: string
  protocol: 'http' | 'https' | 'socks5'
}

export interface GameSettings {
  autoGroupEnabled: boolean
  autoInviteEnabled: boolean
  notificationsEnabled: boolean
  /** Overlay showing the frames actually delivered by the game window. */
  showFpsCounter: boolean
}

export interface AppSettings {
  language: Language
  window: WindowSettings
  proxy: ProxySettings
  game: GameSettings
  version: string
}

/** What the accounts list shows. Secrets are deliberately absent. */
export interface SavedAccount {
  id: string
  label: string
  accountId: number | null
  hasSecrets: boolean
  lastUsedAt: number | null
}

/**
 * The Ankama device credentials that let a saved account reconnect without a
 * new emailed code. Stored encrypted by the OS keychain, and only ever sent to
 * the game window that is about to use them.
 */
export interface AccountSecrets {
  apiKey: string
  refreshToken: string
  certificateId: string
  certificateHash: string
  /** Kept alongside the secrets: the game looks the certificate up by this id. */
  accountId: number | null
}

export interface AccountCapture {
  label: string
  accountId: number | null
  secrets: AccountSecrets
}

export interface NativeNotificationPayload {
  title: string
  body?: string
  tabId?: string
}

export type AppUpdatePhase =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateStatus {
  phase: AppUpdatePhase
  version?: string
  percent?: number
  message?: string
  error?: string
}

export type HotkeyAction =
  | 'switch-tab-1'
  | 'switch-tab-2'
  | 'switch-tab-3'
  | 'switch-tab-4'
  | 'switch-tab-5'
  | 'new-tab'
  | 'close-tab'
  | 'toggle-mute'
  | 'toggle-notifications'
  | 'next-tab'
  | 'prev-tab'
  | 'zoom-in'
  | 'zoom-out'
  | 'reload-tab'
  | 'close-windows'
  | 'fight-ready'
  | 'fight-end-turn'
  | 'spell-1'
  | 'spell-2'
  | 'spell-3'
  | 'spell-4'
  | 'spell-5'
  | 'spell-6'
  | 'spell-7'
  | 'spell-8'
  | 'toggle-tactical-mode'
  | 'toggle-creature-mode'
  | 'toggle-transparent-mode'
  | 'toggle-interactives'
  | 'toggle-map-info'
  | 'toggle-nicknames'
  | 'toggle-monster-info'
  | 'toggle-fullscreen'
  | 'toggle-spell-effects'
  | 'toggle-grid'
  | 'window-inventory'
  | 'window-characteristics'
  | 'focus-chat'
  | 'map-left'
  | 'map-right'
  | 'map-up'
  | 'map-down'
  | 'window-grimoire'
  | 'window-map'
  | 'window-social'
  | 'window-options'
  | 'window-arena'
  | 'window-guild'
  | 'window-jobs'
  | 'window-quests'
  | 'window-mount'
  | 'zoom-reset'

export interface Character {
  id: string
  name: string
  server: string
  accountId: string
  class?: string
  level?: number
}

export interface Team {
  id: string
  name: string
  leaderId: string
  memberIds: string[]
}

export interface AutoGroupState {
  enabled: boolean
  leaderTabId: string | null
  leaderMapId: number | null
  leaderPosition: { x: number; y: number } | null
  followerTabIds: string[]
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  'switch-tab-1',
  'switch-tab-2',
  'switch-tab-3',
  'switch-tab-4',
  'switch-tab-5',
  'new-tab',
  'close-tab',
  'toggle-mute',
  'toggle-notifications',
  'next-tab',
  'prev-tab',
  'zoom-in',
  'zoom-out',
  'reload-tab',
  'close-windows',
  'fight-ready',
  'fight-end-turn',
  'spell-1',
  'spell-2',
  'spell-3',
  'spell-4',
  'spell-5',
  'spell-6',
  'spell-7',
  'spell-8',
  'toggle-tactical-mode',
  'toggle-creature-mode',
  'toggle-transparent-mode',
  'toggle-interactives',
  'toggle-map-info',
  'toggle-nicknames',
  'toggle-monster-info',
  'toggle-fullscreen',
  'toggle-spell-effects',
  'toggle-grid',
  'window-inventory',
  'window-characteristics',
  'focus-chat',
  'map-left',
  'map-right',
  'map-up',
  'map-down',
  'window-grimoire',
  'window-map',
  'window-social',
  'window-options',
  'window-arena',
  'window-guild',
  'window-jobs',
  'window-quests',
  'window-mount',
  'zoom-reset'
]

export const HOTKEY_ACTION_LABELS: Record<HotkeyAction, string> = {
  'switch-tab-1': 'Switch to Tab 1',
  'switch-tab-2': 'Switch to Tab 2',
  'switch-tab-3': 'Switch to Tab 3',
  'switch-tab-4': 'Switch to Tab 4',
  'switch-tab-5': 'Switch to Tab 5',
  'new-tab': 'New Tab',
  'close-tab': 'Close Tab',
  'toggle-mute': 'Toggle Mute',
  'toggle-notifications': 'Toggle Notifications',
  'next-tab': 'Next Tab',
  'prev-tab': 'Previous Tab',
  'zoom-in': 'Zoom In',
  'zoom-out': 'Zoom Out',
  'reload-tab': 'Reload Tab',
  'close-windows': 'Close Open Windows',
  'fight-ready': 'Ready for Fight',
  'fight-end-turn': 'End Turn',
  'spell-1': 'Spell 1',
  'spell-2': 'Spell 2',
  'spell-3': 'Spell 3',
  'spell-4': 'Spell 4',
  'spell-5': 'Spell 5',
  'spell-6': 'Spell 6',
  'spell-7': 'Spell 7',
  'spell-8': 'Spell 8',
  'toggle-tactical-mode': 'Tactical Mode',
  'toggle-creature-mode': 'Creature Mode',
  'toggle-transparent-mode': 'Transparent Mode',
  'toggle-interactives': 'Highlight Interactives',
  'toggle-map-info': 'Map Coordinates',
  'toggle-nicknames': 'Player Names',
  'toggle-monster-info': 'Monster Group Info (hold)',
  'toggle-fullscreen': 'Fullscreen',
  'toggle-spell-effects': 'Spell Animations',
  'toggle-grid': 'Battle Grid',
  'window-inventory': 'Inventory',
  'window-characteristics': 'Characteristics',
  'focus-chat': 'Open the chat',
  'map-left': 'Map to the left',
  'map-right': 'Map to the right',
  'map-up': 'Map above',
  'map-down': 'Map below',
  'window-grimoire': 'Spells',
  'window-map': 'World Map',
  'window-social': 'Friends',
  'window-options': 'Game Options',
  'window-arena': 'Kolossium',
  'window-guild': 'Guild',
  'window-jobs': 'Jobs',
  'window-quests': 'Quests',
  'window-mount': 'Mount',
  'zoom-reset': 'Reset Zoom'
}

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  'switch-tab-1': 'Ctrl+1',
  'switch-tab-2': 'Ctrl+2',
  'switch-tab-3': 'Ctrl+3',
  'switch-tab-4': 'Ctrl+4',
  'switch-tab-5': 'Ctrl+5',
  'new-tab': 'Ctrl+T',
  'close-tab': 'Ctrl+W',
  'toggle-mute': 'Ctrl+M',
  'toggle-notifications': 'Ctrl+Shift+N',
  'next-tab': 'Ctrl+Tab',
  'prev-tab': 'Ctrl+Shift+Tab',
  'zoom-in': 'Ctrl+=',
  'zoom-out': 'Ctrl+-',
  'reload-tab': 'Ctrl+R',
  'close-windows': 'Escape',
  'fight-ready': 'F1',
  'fight-end-turn': 'Space',
  'spell-1': '1',
  'spell-2': '2',
  'spell-3': '3',
  'spell-4': '4',
  'spell-5': '5',
  'spell-6': '6',
  'spell-7': '7',
  'spell-8': '8',
  'toggle-tactical-mode': 'F2',
  'toggle-creature-mode': '',
  'toggle-transparent-mode': '',
  'toggle-interactives': 'F5',
  'toggle-map-info': '',
  'toggle-nicknames': 'F7',
  'toggle-monster-info': 'F8',
  'toggle-fullscreen': 'F11',
  'toggle-spell-effects': '',
  'toggle-grid': 'F10',
  'window-inventory': 'I',
  'window-characteristics': 'C',
  'focus-chat': 'Enter',
  'map-left': 'ArrowLeft',
  'map-right': 'ArrowRight',
  'map-up': 'ArrowUp',
  'map-down': 'ArrowDown',
  'window-grimoire': 'S',
  'window-map': 'M',
  'window-social': 'F',
  'window-options': 'O',
  'window-arena': 'K',
  'window-guild': 'G',
  'window-jobs': 'J',
  'window-quests': 'Q',
  'window-mount': 'D',
  'zoom-reset': 'Ctrl+0'
}

/** Drives the grouping of the hotkeys screen; every action must appear once. */
export const HOTKEY_GROUPS: { title: string; actions: HotkeyAction[] }[] = [
  {
    title: 'Tabs',
    actions: [
      'switch-tab-1', 'switch-tab-2', 'switch-tab-3', 'switch-tab-4', 'switch-tab-5',
      'next-tab', 'prev-tab', 'new-tab', 'close-tab', 'reload-tab'
    ]
  },
  {
    title: 'Window',
    actions: ['toggle-fullscreen', 'zoom-in', 'zoom-out', 'zoom-reset', 'toggle-mute', 'toggle-notifications', 'close-windows']
  },
  {
    title: 'Combat',
    actions: [
      'fight-ready', 'fight-end-turn',
      'spell-1', 'spell-2', 'spell-3', 'spell-4', 'spell-5', 'spell-6', 'spell-7', 'spell-8'
    ]
  },
  {
    title: 'Travel',
    actions: ['map-left', 'map-right', 'map-up', 'map-down']
  },
  {
    title: 'Game windows',
    actions: ['focus-chat', 'window-inventory', 'window-characteristics', 'window-grimoire', 'window-map', 'window-social', 'window-options', 'window-arena', 'window-guild', 'window-jobs', 'window-quests', 'window-mount']
  },
  {
    title: 'Display',
    actions: [
      'toggle-tactical-mode', 'toggle-creature-mode', 'toggle-transparent-mode',
      'toggle-interactives', 'toggle-map-info', 'toggle-nicknames', 'toggle-monster-info',
      'toggle-spell-effects', 'toggle-grid'
    ]
  }
]

/**
 * Settings that are chosen once rather than flipped mid-game ship without a
 * default key: they live as switches in the settings screen, and the function
 * keys stay free for what actually gets toggled while playing. Any of them can
 * still be bound by hand.
 */

/**
 * Actions that act while the key is held: pressing shows, releasing hides.
 * They mirror game buttons that have no tap handler at all — only press and
 * release — so a plain toggle would misrepresent them.
 */
export const HOLD_HOTKEY_ACTIONS: HotkeyAction[] = ['toggle-monster-info']

export const RESOLUTIONS = [
  '800x600',
  '960x600',
  '1280x720',
  '1024x768',
  '1366x768',
  '1440x900',
  '1600x900',
  '1280x1024',
  '1920x1080',
  '2560x1440'
] as const

/**
 * Only languages the interface is actually translated into are listed. Offering
 * one without a dictionary would show an English interface under a Spanish
 * label \u2014 the same lie as a setting that does nothing.
 */
export const LANGUAGES = [
  { name: 'English', value: 'en' },
  { name: 'Fran\u00e7ais', value: 'fr' }
] as const

export type Language = (typeof LANGUAGES)[number]['value']

/** What the renderer needs to warn about a fallback port. */
export interface LocalServerInfo {
  port: number
  preferredPort: number
  usingPreferredPort: boolean
}

export enum IPCEvents {
  GET_GAME_CONTEXT = 'get_game_context',
  APP_READY_TO_SHOW = 'app_ready_to_show',
  SET_SETTINGS = 'set_settings',
  GET_SETTINGS = 'get_settings',
  GET_SERVER_INFO = 'get_server_info',
  OPEN_EXTERNAL = 'open_external',
  AUTH_CALLBACK = 'auth_callback',
  SELECT_TAB = 'select_tab',
  SET_AUDIO_MUTE = 'set_audio_mute',
  SET_RESOLUTION = 'set_resolution',
  SET_CONNECTED_TABS = 'set_connected_tabs',
  SET_ZOOM = 'set_zoom',
  RESET_ZOOM = 'reset_zoom',
  TOGGLE_FULLSCREEN = 'toggle_fullscreen',
  SET_WINDOW_TITLE = 'set_window_title',
  NOTIFY_ATTENTION = 'notify_attention',
  SET_SOUND_ON_FOCUS = 'set_sound_on_focus',
  WINDOW_MINIMIZE = 'window_minimize',
  WINDOW_MAXIMIZE = 'window_maximize',
  WINDOW_CLOSE = 'window_close',
  DOWNLOAD_PROGRESS = 'download_progress',
  CHECK_GAME_INSTALLED = 'check_game_installed',
  DOWNLOAD_GAME = 'download_game',
  OPEN_GAME_WINDOW = 'open_game_window',
  SHOW_LAUNCHER = 'show_launcher',
  IS_GAME_RUNNING = 'is_game_running',
  GAME_RUNNING_CHANGED = 'game_running_changed',
  SAVE_CHARACTER_IMAGE = 'save_character_image',
  GET_APP_UPDATE_STATUS = 'get_app_update_status',
  CHECK_APP_UPDATE = 'check_app_update',
  INSTALL_APP_UPDATE = 'install_app_update',
  APP_UPDATE_STATUS = 'app_update_status',
  SHOW_NATIVE_NOTIFICATION = 'show_native_notification',
  NATIVE_NOTIFICATION_CLICK = 'native_notification_click',
  STORE_GET = 'store_get',
  STORE_SET = 'store_set',
  STORE_DELETE = 'store_delete',
  ACCOUNTS_LIST = 'accounts_list',
  ACCOUNTS_CAPTURE = 'accounts_capture',
  ACCOUNTS_RENAME = 'accounts_rename',
  ACCOUNTS_FORGET = 'accounts_forget',
  ACCOUNTS_GET_SECRETS = 'accounts_get_secrets',
  ACCOUNTS_CHANGED = 'accounts_changed'
}
