import type { DofusWindow } from '@/types/dofus-window'

/**
 * Opening the chat with a key.
 *
 * On the touch client the chat is opened by tapping it. `gui.chat.activate()`
 * is what that tap calls: it opens the panel and focuses the input. Binding it
 * to Enter gives the keyboard the same thing, and matches what every PC game
 * has trained players to expect.
 *
 * Sending stays the game's business. The chat input is a real `<textarea>`, so
 * once it holds focus the hotkey layer ignores every key — including this one —
 * and Enter reaches the game to send the message. That is why this only ever
 * opens: a toggle would fight the player mid-sentence the moment focus moved.
 */
export function focusChat(gameWindow: DofusWindow): boolean {
  const chat = gameWindow.gui?.chat

  if (typeof chat?.activate !== 'function') {
    window.nememu.logger.warn('Chat shortcut: the game exposes no gui.chat.activate.')
    return false
  }

  try {
    // Calling it while already open simply re-focuses the input, which is the
    // useful answer when the player clicked away and wants to type again.
    chat.activate()
    return true
  } catch (err) {
    window.nememu.logger.warn('Chat shortcut: could not open the chat', err)
    return false
  }
}
