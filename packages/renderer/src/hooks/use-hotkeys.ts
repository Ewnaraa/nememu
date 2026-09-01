import { useEffect, useRef } from 'react'
import { HOLD_HOTKEY_ACTIONS, type HotkeyAction } from '@nememu/shared'

type HotkeyHandler = (action: HotkeyAction) => void

interface HotkeyConfig {
  hotkeys: Record<HotkeyAction, string>
  onAction: HotkeyHandler
  /** Called when a held action's key is released. */
  onRelease?: HotkeyHandler
  enabled?: boolean
}

const HELD = new Set<HotkeyAction>(HOLD_HOTKEY_ACTIONS)

/**
 * Physical key identity, used to pair a release with its press. `code` is
 * preferred over `key` because modifiers and layouts change `key` between the
 * two events, which would strand an action in its pressed state.
 */
function keyIdentity(event: KeyboardEvent): string {
  return event.code || event.key
}

/**
 * The digit printed on a physical key, whatever the layout produces.
 *
 * On an AZERTY keyboard the top row is unshifted `&`, `é`, `"`, `'`… and the
 * digits only appear with Shift held. Matching a bare `1` binding on
 * `event.key` therefore fails twice over: unshifted the key is `&`, and
 * shifted it is `1` but with `shiftKey` set, which the modifier check rejects.
 * The result is that the default spell bindings 1-8 — and `Ctrl+1`..`Ctrl+5`
 * for the tabs — are unreachable for every French player until they rebind all
 * of them by hand.
 *
 * So a digit binding is matched on the key's *position* instead, which is the
 * same physical key on both layouts, and Shift is ignored for it since AZERTY
 * requires Shift to produce that digit at all.
 */
function physicalDigit(event: KeyboardEvent): string | null {
  const code = event.code
  if (!code) return null
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  return m ? m[1] : null
}

function isDigitKey(key: string): boolean {
  return key.length === 1 && key >= '0' && key <= '9'
}

export function normalizeKeyCombo(event: KeyboardEvent): string {
  const digit = physicalDigit(event)

  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  // Shift is not recorded for a digit: on AZERTY it is what produces the digit,
  // so recording it would store a binding the player cannot reproduce.
  if (event.shiftKey && !digit) parts.push('Shift')
  if (event.altKey) parts.push('Alt')

  if (digit) {
    parts.push(digit)
    return parts.join('+')
  }

  let key = event.key
  if (key === ' ') key = 'Space'
  else if (key === 'Tab') key = 'Tab'
  else if (key === '+') key = '+'
  else if (key === '-') key = '-'
  else if (key === '=') key = '='
  else if (key.length === 1) key = key.toUpperCase()

  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    parts.push(key)
  }

  return parts.join('+')
}

function parseCombo(combo: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = combo.split('+').map((p) => p.trim())
  let ctrl = false
  let shift = false
  let alt = false
  let key = ''

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'cmd' || lower === 'cmdorctrl') {
      ctrl = true
    } else if (lower === 'shift') {
      shift = true
    } else if (lower === 'alt') {
      alt = true
    } else {
      key = part.toUpperCase()
    }
  }

  return { ctrl, shift, alt, key }
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo)
  const hasCtrl = event.ctrlKey || event.metaKey
  if (parsed.ctrl !== hasCtrl) return false
  if (parsed.alt !== event.altKey) return false

  if (isDigitKey(parsed.key)) {
    // Shift is deliberately not compared here — see physicalDigit above.
    if (physicalDigit(event) === parsed.key) return true
    return event.key === parsed.key
  }

  if (parsed.shift !== event.shiftKey) return false

  let eventKey = event.key
  if (eventKey === ' ') eventKey = 'SPACE'
  else if (eventKey.length === 1) eventKey = eventKey.toUpperCase()
  else eventKey = eventKey.toUpperCase()

  return eventKey === parsed.key.toUpperCase()
}

/**
 * Binds the hotkeys on one window and returns a disposer.
 *
 * This is exported because the game runs in an iframe with its own document:
 * key presses there never reach the shell's window, so the same bindings have
 * to be attached inside each game window as well. Both paths share this
 * function so the shell and the game can never drift apart on what a combo
 * means.
 */
export function attachHotkeys(target: Window, getConfig: () => HotkeyConfig): () => void {
  /** Held actions awaiting their release, keyed by the physical key. */
  const held = new Map<string, HotkeyAction>()

  const releaseAll = () => {
    if (held.size === 0) return

    const { onRelease } = getConfig()
    for (const action of held.values()) onRelease?.(action)
    held.clear()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return

    // Auto-repeat would fire an action dozens of times while a key is held,
    // which turns any toggle into a flicker.
    if (event.repeat) return

    const element = event.target as HTMLElement | null
    if (
      element &&
      (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)
    ) {
      // Never steal a key while the player is typing — chat included.
      return
    }

    const { hotkeys, onAction } = getConfig()
    const entries = Object.entries(hotkeys) as [HotkeyAction, string][]

    for (const [action, combo] of entries) {
      if (!combo) continue
      if (!matchesCombo(event, combo)) continue

      event.preventDefault()
      event.stopPropagation()

      if (HELD.has(action)) {
        const identity = keyIdentity(event)
        if (held.has(identity)) return
        held.set(identity, action)
      }

      onAction(action)
      return
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    const identity = keyIdentity(event)
    const action = held.get(identity)
    if (!action) return

    held.delete(identity)
    event.preventDefault()
    event.stopPropagation()
    getConfig().onRelease?.(action)
  }

  // Losing focus never delivers the keyup, so a held action would stay stuck on.
  target.addEventListener('keydown', onKeyDown, true)
  target.addEventListener('keyup', onKeyUp, true)
  target.addEventListener('blur', releaseAll, true)

  return () => {
    releaseAll()
    target.removeEventListener('keydown', onKeyDown, true)
    target.removeEventListener('keyup', onKeyUp, true)
    target.removeEventListener('blur', releaseAll, true)
  }
}

export function useHotkeys(config: HotkeyConfig) {
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    if (config.enabled === false) return
    return attachHotkeys(window, () => configRef.current)
  }, [config.enabled])
}

export function recordKeyCombo(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
  return normalizeKeyCombo(event)
}
