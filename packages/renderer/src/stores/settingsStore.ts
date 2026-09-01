import { create } from 'zustand'
import { DEFAULT_HOTKEYS } from '@nememu/shared'
import type {
  AppSettings,
  Language,
  ProxySettings,
  GameSettings,
  HotkeyAction
} from '@nememu/shared'

interface HotkeyMap extends Record<HotkeyAction, string> {}

interface SettingsState {
  language: Language
  window: AppSettings['window']
  hotkeys: HotkeyMap
  proxy: ProxySettings
  game: GameSettings
  version: string
  shortcutsSeen: boolean
  autoPlay: boolean
  isLoading: boolean
  isHydrated: boolean

  loadSettings: () => Promise<void>
  setLanguage: (lang: Language) => void
  setWindowSettings: (settings: Partial<AppSettings['window']>) => void
  setHotkey: (action: HotkeyAction, combo: string) => void
  resetHotkeys: () => void
  setProxySettings: (settings: Partial<ProxySettings>) => void
  setGameSettings: (settings: Partial<GameSettings>) => void
  setResolution: (width: number, height: number) => void
  toggleAudioMute: () => void
  toggleSoundOnFocus: () => void
  toggleAutoGroup: () => void
  toggleAutoInvite: () => void
  toggleNotifications: () => void
  toggleFpsCounter: () => void
  markShortcutsSeen: () => void
  setAutoPlay: (value: boolean) => void
}

/**
 * The defaults live in the shared package, not here.
 *
 * This file used to carry its own copy of the table. Both were identical, which
 * is exactly why the duplication was dangerous: adding an action in one place
 * left the other silently short, and the only thing that caught it was the type
 * checker complaining about four missing keys. One table, one source.
 */
const defaultHotkeys: HotkeyMap = { ...DEFAULT_HOTKEYS }

/**
 * Saved settings can hold bindings for actions that no longer exist (a shortcut
 * that was removed or renamed). They would keep swallowing their key without
 * doing anything — and worse, hide the game's own shortcut on that key — so
 * anything the current build does not know about is dropped on load.
 */
function pruneHotkeys(saved: unknown): Partial<HotkeyMap> {
  if (!saved || typeof saved !== 'object') return {}
  const known = new Set(Object.keys(defaultHotkeys))
  const result: Record<string, string> = {}
  for (const [action, combo] of Object.entries(saved as Record<string, unknown>)) {
    if (known.has(action) && typeof combo === 'string') result[action] = combo
  }
  return result as Partial<HotkeyMap>
}

const defaultState = {
  language: 'en' as Language,
  window: {
    audioMuted: false,
    soundOnFocus: true,
    resolution: { width: 1280, height: 720 }
  },
  hotkeys: { ...defaultHotkeys },
  proxy: {
    enabled: false,
    host: '',
    port: 8080,
    username: '',
    password: '',
    protocol: 'http' as const
  },
  game: {
    autoGroupEnabled: false,
    autoInviteEnabled: true,
    notificationsEnabled: true,
    showFpsCounter: false
  },
  version: '0.1.0',
  // La feuille de raccourcis s'ouvre une fois, au tout premier lancement.
  shortcutsSeen: false,
  // Le launcher attend un clic par défaut. C'est tout son intérêt : sans ça il
  // n'est qu'un écran de chargement qui passe trop vite pour être lu. Ceux que
  // le clic agace le désactivent depuis le launcher lui-même.
  autoPlay: false
}

/**
 * Pushes the settings the main process acts on.
 *
 * The main process holds its own copy of a few settings — muted audio, sound
 * only when focused, the proxy — and resets them to its defaults on every
 * launch. They used to be sent only when the player *changed* them, so a saved
 * value was never re-applied at startup: the settings screen showed audio
 * muted while the game played sound, "sound only when focused" silently came
 * back on, and a configured proxy was ignored until it was touched again.
 *
 * A setting that reverts on restart while still displaying its saved value is
 * worse than one that does nothing, because the interface asserts something
 * false. So hydration ends by applying, not just by reading.
 *
 * The window resolution is deliberately NOT re-applied: `setResolution` resizes
 * and re-centres the window, which would throw away the remembered position.
 * Saved bounds already restore the size on their own.
 */
function applyToMain(state: {
  window: { audioMuted: boolean; soundOnFocus: boolean }
}) {
  try {
    window.nememu.setAudioMute(state.window.audioMuted)
    window.nememu.setSoundOnFocus(state.window.soundOnFocus)
  } catch {}
}

function persist(state: SettingsState) {
  try {
    const payload = JSON.stringify({
      language: state.language,
      window: state.window,
      hotkeys: state.hotkeys,
      proxy: state.proxy,
      game: state.game,
      version: state.version,
      shortcutsSeen: state.shortcutsSeen,
      autoPlay: state.autoPlay
    })
    window.nememu.setSettings(payload)
  } catch {}
}

export const useSettingsStore = create<SettingsState>()((set, get) => {
  const mutate = (updater: (s: SettingsState) => Partial<SettingsState>) => {
    set((state) => {
      const patch = updater(state)
      const merged = { ...state, ...patch } as SettingsState
      persist(merged)
      return patch
    })
  }

  return {
    ...defaultState,
    isLoading: false,
    isHydrated: false,

    loadSettings: async () => {
      try {
        const raw = await window.nememu.getSettings()
        const parsed = JSON.parse(raw)
        set({
          language: parsed.language ?? defaultState.language,
          window: { ...defaultState.window, ...parsed.window },
          hotkeys: { ...defaultHotkeys, ...pruneHotkeys(parsed.hotkeys) },
          proxy: { ...defaultState.proxy, ...parsed.proxy },
          game: { ...defaultState.game, ...parsed.game },
          version: parsed.version ?? defaultState.version,
          shortcutsSeen: parsed.shortcutsSeen === true,
          autoPlay: parsed.autoPlay === true,
          isHydrated: true
        })

        const hydrated = get()
        applyToMain(hydrated)
        // Re-sending the whole payload is what makes the main process apply the
        // proxy, which it only ever does on receiving settings. It also means a
        // future setting read from this payload cannot silently miss startup.
        persist(hydrated)
      } catch {
        set({ isHydrated: true })
      }
    },

    setLanguage: (lang) => mutate(() => ({ language: lang })),

    setWindowSettings: (settings) =>
      mutate((s) => ({ window: { ...s.window, ...settings } })),

    setHotkey: (action, combo) =>
      mutate((s) => ({ hotkeys: { ...s.hotkeys, [action]: combo } })),

    resetHotkeys: () => mutate(() => ({ hotkeys: { ...defaultHotkeys } })),

    setProxySettings: (settings) =>
      mutate((s) => ({ proxy: { ...s.proxy, ...settings } })),

    setGameSettings: (settings) =>
      mutate((s) => ({ game: { ...s.game, ...settings } })),

    setResolution: (width, height) => {
      mutate((s) => ({
        window: { ...s.window, resolution: { width, height } }
      }))
      window.nememu.setResolution(width, height)
    },

    toggleAudioMute: () => {
      const newVal = !get().window.audioMuted
      mutate((s) => ({ window: { ...s.window, audioMuted: newVal } }))
      window.nememu.setAudioMute(newVal)
    },

    toggleSoundOnFocus: () => {
      const newVal = !get().window.soundOnFocus
      mutate((s) => ({ window: { ...s.window, soundOnFocus: newVal } }))
      window.nememu.setSoundOnFocus(newVal)
    },

    toggleAutoGroup: () =>
      mutate((s) => ({
        game: { ...s.game, autoGroupEnabled: !s.game.autoGroupEnabled }
      })),

    toggleAutoInvite: () =>
      mutate((s) => ({
        game: { ...s.game, autoInviteEnabled: !s.game.autoInviteEnabled }
      })),

    toggleFpsCounter: () => mutate((s) => ({
      game: { ...s.game, showFpsCounter: !s.game.showFpsCounter }
    })),

    markShortcutsSeen: () => mutate(() => ({ shortcutsSeen: true })),
    setAutoPlay: (value) => mutate(() => ({ autoPlay: value })),

    toggleNotifications: () =>
      mutate((s) => ({
        game: { ...s.game, notificationsEnabled: !s.game.notificationsEnabled }
      }))
  }
})
