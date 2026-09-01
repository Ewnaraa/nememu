import type { DofusWindow } from '@/types/dofus-window'

/**
 * Combat shortcuts.
 *
 * Everything here drives the game's own UI the way a tap would — the same
 * methods its buttons call. Nothing decides *what* to do: selecting a spell
 * still leaves the player to pick a target and confirm, exactly like clicking
 * the slot. These are shortcuts, not automation.
 *
 * Method names were read from the shipped game build rather than guessed, but
 * a game update can still move them, so every call is guarded and simply does
 * nothing if the surface is missing.
 */

export function isInFight(gameWindow: DofusWindow): boolean {
  try {
    return gameWindow.gui?.fightManager?.isInBattle?.() === true
  } catch {
    return false
  }
}

/** True when it is this player's turn and no end-of-turn request is pending. */
export function isPlayersTurn(gameWindow: DofusWindow): boolean {
  try {
    const fightManager = gameWindow.gui?.fightManager
    const userId = gameWindow.actorManager?.userId

    if (!fightManager || typeof userId !== 'number') return false
    if (fightManager.getIsTurnEndRequestPending?.()) return false

    return fightManager.isFightersTurn?.(userId) === true
  } catch {
    return false
  }
}

/**
 * Toggles the "ready" button shown during fight placement.
 *
 * `toggleReadyForFight()` is NOT safe to call blind: it sends
 * `GameFightReadyMessage` to the server unconditionally, without looking at the
 * fight state at all. Pressing the key outside a fight therefore fired a
 * protocol message that makes no sense at that moment, and took the client
 * down with it.
 *
 * The guard is the game's own `isReadyForFightButtonVisible()` — it checks the
 * fight state, the button's visibility and the tutorial lock in one call.
 * Deliberately NOT `isInFight()` from this file: that one is
 * `fightState === BATTLE`, which is false during placement — exactly when the
 * ready button is the one thing you want. A tighter guard would have silently
 * killed the shortcut instead of the client.
 */
export function toggleReady(gameWindow: DofusWindow): boolean {
  try {
    const buttons = gameWindow.gui?.timeline?.fightControlButtons
    if (typeof buttons?.toggleReadyForFight !== 'function') return false

    if (typeof buttons.isReadyForFightButtonVisible === 'function') {
      if (!buttons.isReadyForFightButtonVisible()) return false
    } else if (!isInFight(gameWindow)) {
      // Older build without the predicate: fall back to the coarse check rather
      // than sending the message unguarded.
      return false
    }

    buttons.toggleReadyForFight()
    return true
  } catch (err) {
    window.nememu.logger.warn('Ready shortcut failed', err)
    return false
  }
}

/**
 * Ends the turn. Guarded on the player's turn so a stray key press during an
 * opponent's turn cannot queue anything.
 */
export function endTurn(gameWindow: DofusWindow): boolean {
  try {
    if (!isInFight(gameWindow) || !isPlayersTurn(gameWindow)) return false

    const finish = gameWindow.gui?.fightManager?.finishTurn
    if (typeof finish !== 'function') return false

    gameWindow.gui.fightManager!.finishTurn!()
    return true
  } catch (err) {
    window.nememu.logger.warn('End turn shortcut failed', err)
    return false
  }
}

/**
 * Selects the spell in slot `index` (0-based) — the same thing tapping the slot
 * does. Targeting and confirmation stay with the player.
 */
export function selectSpellSlot(gameWindow: DofusWindow, index: number): boolean {
  try {
    const bar = gameWindow.gui?.shortcutBarManager?.shortcutBars?.playerBar
    if (!bar || typeof bar.getSpellSlotByIndex !== 'function' || typeof bar._selectSlot !== 'function') {
      return false
    }
    if (bar.isOrganizing) return false

    // The spell panel has to be the visible one, otherwise selecting a slot
    // that is not on screen leaves the bar in an odd state.
    try {
      bar.openPanel?.('spell')
    } catch {
      // Not fatal: the panel is usually already open in a fight.
    }

    const slot = bar.getSpellSlotByIndex(index)
    if (!slot || slot.isEmpty?.()) return false

    bar._selectSlot(slot, true)
    return true
  } catch (err) {
    window.nememu.logger.warn('Spell shortcut failed', err)
    return false
  }
}
