import type { DofusWindow } from '@/types/dofus-window'

/**
 * Frame-rate measurement.
 *
 * Measured here rather than read from the game's own debug counter: the game
 * draws on `requestAnimationFrame`, so counting those callbacks inside the game
 * window measures exactly the frames the player actually sees, and it depends on
 * nothing in Ankama's minified build that a patch could rename.
 *
 * The game's render loop is gated at its own `FPS = 60` constant, so 60 is the
 * ceiling by design, not a limit of the client. The number is worth showing
 * anyway — the useful question was never "can we go past 60" but "are we even
 * reaching it".
 */

const SAMPLE_MS = 500

export function startFpsMeter(
  gameWindow: DofusWindow,
  onSample: (fps: number) => void
): () => void {
  const raf = gameWindow.requestAnimationFrame?.bind(gameWindow)
  const cancel = gameWindow.cancelAnimationFrame?.bind(gameWindow)

  if (typeof raf !== 'function') {
    window.nememu.logger.warn('FPS meter: the game window has no requestAnimationFrame.')
    return () => {}
  }

  let handle = 0
  let frames = 0
  let windowStart = gameWindow.performance?.now?.() ?? Date.now()
  let stopped = false

  const now = () => gameWindow.performance?.now?.() ?? Date.now()

  const tick = () => {
    if (stopped) return

    frames += 1
    const elapsed = now() - windowStart

    if (elapsed >= SAMPLE_MS) {
      onSample(Math.round((frames * 1000) / elapsed))
      frames = 0
      windowStart = now()
    }

    handle = raf(tick)
  }

  handle = raf(tick)

  return () => {
    stopped = true
    // Without this the callback keeps running on a window the player has closed.
    if (typeof cancel === 'function' && handle) cancel(handle)
  }
}
