import type { DofusWindow, GameWindowManager } from '@/types/dofus-window'

/**
 * Closing open game windows (inventory, spells, map…) with a single key.
 *
 * The game keeps no reference to its window manager on `window.gui`, but
 * `regex.json` already exposes the webpack module cache as `window.singletons`,
 * so the manager can be found there by its shape. The result is cached per game
 * window because the scan walks every module.
 */

const managerCache = new WeakMap<DofusWindow, GameWindowManager>()

function isWindowManager(value: unknown): value is GameWindowManager {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.getWindow === 'function' &&
    typeof candidate.closeAll === 'function' &&
    typeof candidate.addWindow === 'function'
  )
}

export function findWindowManager(gameWindow: DofusWindow): GameWindowManager | null {
  const cached = managerCache.get(gameWindow)
  if (cached) return cached

  try {
    const modules = gameWindow.singletons?.c
    if (!modules) return null

    for (const key of Object.keys(modules)) {
      const exported = (modules as unknown as Record<string, { exports?: unknown } | undefined>)[key]?.exports
      if (isWindowManager(exported)) {
        managerCache.set(gameWindow, exported)
        return exported
      }
    }
  } catch (err) {
    window.nememu.logger.warn('Could not locate the game window manager', err)
  }

  return null
}

/**
 * Closes every open game window. The game's own `closeAll` is used, which
 * deliberately leaves popups alone — a confirmation dialog should not be
 * dismissed by a stray Escape.
 */
export function closeOpenWindows(gameWindow: DofusWindow): boolean {
  let closedSomething = false

  // The chat is not one of the manager's windows, so `closeAll` leaves it open.
  // Escape opening it via Enter but never closing it is the kind of half-bound
  // key that makes a shortcut feel broken.
  try {
    const chat = gameWindow.gui?.chat
    if (chat?.active && typeof chat.deactivate === 'function') {
      chat.deactivate()
      closedSomething = true
    }
  } catch (err) {
    window.nememu.logger.warn('Could not close the chat', err)
  }

  const manager = findWindowManager(gameWindow)
  if (!manager) return closedSomething

  try {
    manager.closeAll()
    return true
  } catch (err) {
    window.nememu.logger.warn('Close windows shortcut failed', err)
    return closedSomething
  }
}

/**
 * Opens, focuses or closes one of the game's windows by id — exactly what its
 * own `switch` does, which is the behaviour a keyboard shortcut wants: press
 * once to open, press again to close.
 *
 * The game registers 128 windows; only a handful are bound by default, but any
 * id from `addWindow` works. Several of them are containers with tabs, so
 * `params.tabId` avoids landing on a menu the player still has to click.
 */
export function switchGameWindow(
  gameWindow: DofusWindow,
  id: string,
  params?: Record<string, unknown>
): boolean {
  const manager = findWindowManager(gameWindow)

  if (!manager) {
    window.nememu.logger.warn(`Game window "${id}": no window manager found.`)
    return false
  }

  if (typeof manager.switch !== 'function') {
    window.nememu.logger.warn(
      `Game window "${id}": the manager has no switch(). It exposes:`,
      Object.keys(manager).join(', ')
    )
    return false
  }

  try {
    // The params reach the window's open(): `tabId` lands it straight on the
    // right tab instead of a landing page the player has to click through.
    manager.switch(id, params)
    return true
  } catch (err) {
    window.nememu.logger.warn(`Could not switch to the "${id}" game window`, err)
    return false
  }
}
