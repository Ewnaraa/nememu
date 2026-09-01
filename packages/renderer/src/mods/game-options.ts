import type { DofusWindow } from '@/types/dofus-window'

/**
 * The game's own settings, the ones its options menu writes.
 *
 * `changeValue` is the single entry point the game uses itself: it stores the
 * value, persists it under `option-<name>`, runs the option's onChange hook and
 * emits the change. Setting the property directly would do none of that, so
 * everything here goes through it.
 *
 * The module is not exposed on `window.gui`, so it is found by shape in the
 * webpack cache that regex.json publishes as `window.singletons`.
 */

export interface GameOptions extends Record<string, unknown> {
  optionDefs: Record<string, { init: unknown }>
  changeValue: (name: string, value: unknown, source?: unknown) => void
}

const optionsCache = new WeakMap<DofusWindow, GameOptions>()

function isGameOptions(value: unknown): value is GameOptions {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.changeValue === 'function' &&
    !!candidate.optionDefs &&
    typeof candidate.optionDefs === 'object'
  )
}

export function findGameOptions(gameWindow: DofusWindow): GameOptions | null {
  const cached = optionsCache.get(gameWindow)
  if (cached) return cached

  try {
    const modules = gameWindow.singletons?.c
    if (!modules) return null

    for (const key of Object.keys(modules)) {
      const exported = (modules as unknown as Record<string, { exports?: unknown } | undefined>)[key]?.exports
      if (isGameOptions(exported)) {
        optionsCache.set(gameWindow, exported)
        return exported
      }
    }
  } catch (err) {
    window.nememu.logger.warn('Could not locate the game options module', err)
  }

  return null
}

export function getGameOption(gameWindow: DofusWindow, name: string): boolean | null {
  const options = findGameOptions(gameWindow)
  if (!options || !(name in options.optionDefs)) return null

  return options[name] === true
}

export function setGameOption(gameWindow: DofusWindow, name: string, value: boolean): boolean {
  const options = findGameOptions(gameWindow)
  if (!options) return false

  if (!(name in options.optionDefs)) {
    window.nememu.logger.warn(`Game option "${name}" does not exist in this build.`)
    return false
  }

  try {
    options.changeValue(name, value)
    return true
  } catch (err) {
    window.nememu.logger.warn(`Setting game option "${name}" failed`, err)
    return false
  }
}

export function toggleGameOption(gameWindow: DofusWindow, name: string): boolean {
  const current = getGameOption(gameWindow, name)
  if (current === null) return false

  return setGameOption(gameWindow, name, !current)
}

/**
 * The grid option differs inside and outside a fight, so one shortcut has to
 * pick the right one rather than surprising the player with the wrong toggle.
 */
export function toggleGrid(gameWindow: DofusWindow): boolean {
  const inFight = gameWindow.gui?.fightManager?.isInBattle?.() === true
  return toggleGameOption(gameWindow, inFight ? 'fightAlwaysShowGrid' : 'alwaysShowGrid')
}
