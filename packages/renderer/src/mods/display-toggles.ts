import type { DofusWindow } from '@/types/dofus-window'

/**
 * Shortcuts for the display toggles that live in the game's bottom control bar:
 * tactical mode, creature mode, transparent mode, interactive highlighting and
 * the map coordinates panel.
 *
 * The button itself is tapped whenever it can be found, rather than calling the
 * engine method underneath. That keeps everything the button does — the "on"
 * state, the saved preference, the tooltip — in sync. The engine call is only a
 * fallback, and it has to track its own state, which can drift from the button's
 * appearance; that is why it is second choice.
 */

export type DisplayToggle =
  | 'tactical-mode'
  | 'creature-mode'
  | 'transparent-mode'
  | 'interactives'
  | 'map-info'
  | 'nicknames'
  | 'monster-info'

interface ToggleBinding {
  /** Property holding the button on `gui.mainControls`, read from the game build. */
  button: string
  /**
   * How the game's own button behaves. 'tap' means one handler flips it.
   * 'hold' means the game shows on press and hides on release — the monster
   * group tooltips work that way — so a key press has to emit one or the other
   * depending on the state we are tracking.
   */
  style?: 'tap' | 'hold'
  fallback: (gameWindow: DofusWindow, enabled: boolean) => boolean
}

const BINDINGS: Record<DisplayToggle, ToggleBinding> = {
  'tactical-mode': {
    button: '_tacticalModeBtn',
    fallback: (gameWindow, enabled) => {
      const tactical = gameWindow.isoEngine?.tacticalMode
      if (!tactical) return false
      if (enabled) tactical.show?.()
      else tactical.hide?.()
      return true
    }
  },
  'creature-mode': {
    button: '_creatureModeButton',
    fallback: (gameWindow, enabled) => {
      const setter = gameWindow.isoEngine?.actorManager?.setCreatureMode
      if (typeof setter !== 'function') return false
      setter.call(gameWindow.isoEngine.actorManager, enabled)
      return true
    }
  },
  'transparent-mode': {
    button: '_transparentModeButton',
    fallback: (gameWindow, enabled) => {
      const setter = gameWindow.isoEngine?.actorManager?.setTransparentMode
      if (typeof setter !== 'function') return false
      setter.call(gameWindow.isoEngine.actorManager, enabled)
      return true
    }
  },
  interactives: {
    button: '_interactiveBlink',
    fallback: (gameWindow, enabled) => {
      const engine = gameWindow.isoEngine
      if (typeof engine?.setInteractiveBlink !== 'function') return false
      engine.setInteractiveBlink(enabled)
      if (enabled) engine.highlightInteractivesWithDifferentType?.()
      return true
    }
  },
  'map-info': {
    button: '_mapInfoButton',
    fallback: (gameWindow, enabled) => {
      const setter = gameWindow.gui?.mapCoordinateDisplay?.setMapInfoVisibility
      if (typeof setter !== 'function') return false
      setter.call(gameWindow.gui.mapCoordinateDisplay, enabled)
      return true
    }
  },
  nicknames: {
    button: '_nicknamesButton',
    fallback: (gameWindow) => {
      // The game tracks this one itself, so no local state is needed.
      const actors = gameWindow.actorManager
      if (typeof actors?.areNicknamesOn !== 'function') return false

      if (actors.areNicknamesOn()) actors.turnNicknamesOff?.()
      else actors.turnNicknamesOn?.()
      return true
    }
  },
  'monster-info': {
    button: '_monsterInfoButton',
    style: 'hold',
    fallback: (gameWindow, enabled) => {
      const foreground = gameWindow.foreground
      if (!foreground) return false

      if (enabled) foreground.showAllMonsterGroupAndNpcTooltips?.()
      else foreground.removeAllMonsterGroupAndNpcTooltips?.()
      return true
    }
  }
}

/** Fallback state, per game window, for toggles driven without their button. */
const fallbackState = new WeakMap<DofusWindow, Partial<Record<DisplayToggle, boolean>>>()

function emitOn(candidate: unknown, event: string): boolean {
  if (!candidate || typeof candidate !== 'object') return false
  const button = candidate as { tap?: unknown; emit?: unknown }

  try {
    if (event === 'tap' && typeof button.tap === 'function') {
      ;(button.tap as () => void).call(button)
      return true
    }
    if (typeof button.emit === 'function') {
      ;(button.emit as (name: string) => void).call(button, event)
      return true
    }
  } catch (err) {
    window.nememu.logger.warn('Display toggle: driving the game button failed', err)
  }

  return false
}

/**
 * Current state of a toggle, so the settings screen shows what the game is
 * actually doing rather than a mirror that can drift.
 *
 * The game marks an active button with an "on" class, which is the same signal
 * the player reads on screen. Nicknames are asked directly, since the game
 * exposes a getter for them.
 */
export function getDisplayOption(gameWindow: DofusWindow, toggle: DisplayToggle): boolean | null {
  if (toggle === 'nicknames') {
    try {
      const actors = gameWindow.actorManager
      return typeof actors?.areNicknamesOn === 'function' ? actors.areNicknamesOn() : null
    } catch {
      return null
    }
  }

  const binding = BINDINGS[toggle]
  const button = gameWindow.gui?.mainControls?.[binding?.button ?? ''] as
    | { rootElement?: { classList?: DOMTokenList } }
    | undefined

  const classList = button?.rootElement?.classList
  if (classList) return classList.contains('on')

  const tracked = fallbackState.get(gameWindow)?.[toggle]
  return typeof tracked === 'boolean' ? tracked : null
}

function drive(gameWindow: DofusWindow, toggle: DisplayToggle, enabled: boolean): boolean {
  const binding = BINDINGS[toggle]
  if (!binding) return false

  const controls = gameWindow.gui?.mainControls

  if (controls) {
    // A 'hold' button has no tap handler at all: press and release are separate
    // events, so which one to send depends on the state being asked for.
    const event = binding.style === 'hold' ? (enabled ? 'tapstart' : 'tapend') : 'tap'
    if (emitOn(controls[binding.button], event)) return true
  }

  if (binding.fallback(gameWindow, enabled)) return true

  // Names only — useful when a game update renames a button, and it leaks
  // nothing about the account.
  window.nememu.logger.warn(
    `Display toggle "${toggle}" unavailable. Control bar exposes:`,
    controls ? Object.keys(controls).filter((key) => key.startsWith('_')).join(', ') : 'no control bar'
  )
  return false
}

/** Flips a toggle. For 'hold' buttons, prefer setDisplayOption. */
export function toggleDisplayOption(gameWindow: DofusWindow, toggle: DisplayToggle): boolean {
  const state = fallbackState.get(gameWindow) ?? {}
  const next = !state[toggle]

  if (!drive(gameWindow, toggle, next)) return false

  state[toggle] = next
  fallbackState.set(gameWindow, state)
  return true
}

/**
 * Drives a toggle to an explicit state. This is what a held key uses: press
 * asks for on, release asks for off, and no state has to be inferred.
 */
export function setDisplayOption(
  gameWindow: DofusWindow,
  toggle: DisplayToggle,
  enabled: boolean
): boolean {
  // A 'tap' button flips whatever state it is in, so asking for a state it is
  // already in has to do nothing — otherwise a switch in the settings would
  // turn the option off the moment you tried to turn it on.
  if (BINDINGS[toggle]?.style !== 'hold') {
    const current = getDisplayOption(gameWindow, toggle)
    if (current === enabled) return true
  }

  if (!drive(gameWindow, toggle, enabled)) return false

  const state = fallbackState.get(gameWindow) ?? {}
  state[toggle] = enabled
  fallbackState.set(gameWindow, state)
  return true
}
