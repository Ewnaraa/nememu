/**
 * Keyboard-layout regression tests for hotkey matching.
 *
 * The bug these exist for: on AZERTY the top row produces `&`, `é`, `"`… and
 * the digits only appear with Shift. A binding of `1` matched on `event.key`
 * is therefore unreachable on a French keyboard — unshifted the key is `&`,
 * shifted it is `1` but carries `shiftKey`, which the modifier check rejects.
 * Every default spell binding (1-8) and tab binding (Ctrl+1..5) was dead for
 * French players until they rebound all of them by hand.
 *
 * These tests run the real matcher against synthetic events for both layouts.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const SRC = path.resolve('packages/renderer/src/hooks/use-hotkeys.ts')

// The module imports React and shared types; only the pure matching helpers are
// under test, so the file is transpiled with those imports stubbed away.
const source = readFileSync(SRC, 'utf-8')
  .split('\n')
  .filter((line) => !/^import\s/.test(line))
  .join('\n')

const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'esm' })
const dir = mkdtempSync(path.join(tmpdir(), 'nememu-hotkeys-'))
const outFile = path.join(dir, 'use-hotkeys.mjs')
// Only the pure matchers are exercised; the React hooks and the held-action
// list are stubbed so the module can evaluate outside a browser.
const stubs = [
  'const useEffect = () => {}',
  'const useRef = () => ({})',
  'const HOLD_HOTKEY_ACTIONS = []'
].join('; ')
writeFileSync(outFile, stubs + ';\n' + code)

const { matchesCombo, normalizeKeyCombo } = await import(pathToFileURL(outFile).href)

let passed = 0
let failed = 0

function check(name, actual, expected) {
  const ok = actual === expected
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`)
}

/** An AZERTY top-row key: unshifted gives a symbol, shifted gives the digit. */
const azerty = (digit, symbol, mods = {}) => ({
  code: `Digit${digit}`,
  key: mods.shiftKey ? digit : symbol,
  ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
  ...mods
})

/** A QWERTY top-row key: unshifted gives the digit. */
const qwerty = (digit, mods = {}) => ({
  code: `Digit${digit}`,
  key: digit,
  ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
  ...mods
})

const letter = (ch, code, mods = {}) => ({
  code,
  key: ch,
  ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
  ...mods
})

console.log('\nSpell keys 1-8:')
check('AZERTY: pressing the "1" key (gives &) triggers spell 1', matchesCombo(azerty('1', '&'), '1'), true)
check('AZERTY: pressing the "2" key (gives e-acute) triggers spell 2', matchesCombo(azerty('2', 'é'), '2'), true)
check('AZERTY: Shift on that key still triggers spell 1', matchesCombo(azerty('1', '&', { shiftKey: true }), '1'), true)
check('QWERTY: pressing 1 still triggers spell 1', matchesCombo(qwerty('1'), '1'), true)
check('numpad 1 triggers spell 1', matchesCombo({ code: 'Numpad1', key: '1', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }, '1'), true)
check('the "2" key does not trigger spell 1', matchesCombo(azerty('2', 'é'), '1'), false)

console.log('\nTab switching (Ctrl+digit):')
check('AZERTY: Ctrl + the "1" key switches to tab 1', matchesCombo(azerty('1', '&', { ctrlKey: true }), 'Ctrl+1'), true)
check('QWERTY: Ctrl+1 switches to tab 1', matchesCombo(qwerty('1', { ctrlKey: true }), 'Ctrl+1'), true)
check('the "1" key without Ctrl does not switch tabs', matchesCombo(azerty('1', '&'), 'Ctrl+1'), false)
check('Ctrl + the "1" key does not also cast spell 1', matchesCombo(azerty('1', '&', { ctrlKey: true }), '1'), false)

console.log('\nLetters and modifiers are untouched:')
check('S opens the grimoire', matchesCombo(letter('s', 'KeyS'), 'S'), true)
check('Shift+S does not', matchesCombo(letter('S', 'KeyS', { shiftKey: true }), 'S'), false)
check('AZERTY A (physical KeyQ) matches its printed letter', matchesCombo(letter('a', 'KeyQ'), 'A'), true)
check('Ctrl+Shift+N matches', matchesCombo(letter('N', 'KeyN', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+N'), true)
check('Alt is still discriminated', matchesCombo(letter('s', 'KeyS', { altKey: true }), 'S'), false)

console.log('\nArrow keys (map travel):')
{
  const arrow = (key, mods = {}) => ({
    code: key,
    key,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    ...mods
  })
  check('ArrowLeft matches its binding', matchesCombo(arrow('ArrowLeft'), 'ArrowLeft'), true)
  check('ArrowRight matches its binding', matchesCombo(arrow('ArrowRight'), 'ArrowRight'), true)
  check('ArrowUp matches its binding', matchesCombo(arrow('ArrowUp'), 'ArrowUp'), true)
  check('ArrowDown matches its binding', matchesCombo(arrow('ArrowDown'), 'ArrowDown'), true)
  check('ArrowLeft does not match ArrowRight', matchesCombo(arrow('ArrowLeft'), 'ArrowRight'), false)
  check('Ctrl+ArrowLeft does not match a bare ArrowLeft', matchesCombo(arrow('ArrowLeft', { ctrlKey: true }), 'ArrowLeft'), false)
  check('rebinding on an arrow records it', normalizeKeyCombo(arrow('ArrowLeft')), 'ArrowLeft')
}

console.log('\nRebinding records a reproducible combo:')
check('AZERTY: rebinding on the "1" key records "1", not "&"', normalizeKeyCombo(azerty('1', '&')), '1')
check('AZERTY: rebinding with Shift held still records "1"', normalizeKeyCombo(azerty('1', '&', { shiftKey: true })), '1')
check('QWERTY: rebinding on 1 records "1"', normalizeKeyCombo(qwerty('1')), '1')
check('Ctrl + the "1" key records "Ctrl+1"', normalizeKeyCombo(azerty('1', '&', { ctrlKey: true })), 'Ctrl+1')
check('a letter still records normally', normalizeKeyCombo(letter('s', 'KeyS')), 'S')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
