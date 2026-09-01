/**
 * Disconnection detection.
 *
 * The game emits `connectionManager.emit("disconnect", reason)` — verified in
 * its own script.js — where the reason is `SOCKET_LOST` for a real drop, and
 * `CLIENT_CLOSING` / `SWITCHING_TO_GAME` when the client itself is closing the
 * socket on purpose (quitting, and the login-to-game handover).
 *
 * Getting that filter wrong is what decides whether the warning is useful or
 * noise: notify on the deliberate ones and it fires on every launch and every
 * quit, and people learn to ignore it. A drop is also rare by nature, so it is
 * never exercised by accident — hence this test.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const SRC = path.resolve('packages/renderer/src/mods/notification-focus.ts')

// Only the event wiring is under test; the translation helper is stubbed so the
// module evaluates without pulling in the store and React.
const source = readFileSync(SRC, 'utf-8')
  .split('\n')
  .filter((line) => !/^import\s/.test(line))
  .join('\n')

const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'esm' })
const dir = mkdtempSync(path.join(tmpdir(), 'nememu-notif-'))
const outFile = path.join(dir, 'notification-focus.mjs')
// The stub substitutes placeholders like the real translator does, so the test
// checks that the matcher passes the right variables and not merely the key.
const trStub = [
  'const tr = (text, vars) => {',
  '  let out = text',
  '  for (const [k, v] of Object.entries(vars ?? {})) out = out.split(`{${k}}`).join(String(v))',
  '  return out',
  '}'
].join('\n')
writeFileSync(outFile, trStub + '\n' + code)

/** Minimal event source with the shape the module expects. */
function emitter() {
  const handlers = new Map()
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(cb)
    },
    removeListener(event, cb) {
      const list = handlers.get(event) ?? []
      const i = list.indexOf(cb)
      if (i >= 0) list.splice(i, 1)
    },
    emit(event, ...args) {
      for (const cb of [...(handlers.get(event) ?? [])]) cb(...args)
    },
    count(event) {
      return (handlers.get(event) ?? []).length
    }
  }
}

const notifications = []
const warnings = []

globalThis.document = { hasFocus: () => false }
globalThis.window = {
  nememu: {
    showNativeNotification: (payload) => notifications.push(payload),
    requestAttention: () => {},
    logger: { warn: (msg) => warnings.push(String(msg)) }
  }
}

const { initNotificationFocus } = await import(pathToFileURL(outFile).href)

function scenario(reason, { activeTab = false } = {}) {
  notifications.length = 0
  warnings.length = 0

  const connectionManager = emitter()
  const gui = emitter()
  const disconnected = []

  const gameWindow = {
    dofus: { connectionManager },
    gui: Object.assign(gui, {
      playerData: { characterBaseInformations: { id: 7, name: 'Aranwe' } }
    }),
    document: { hasFocus: () => false }
  }

  const dispose = initNotificationFocus(gameWindow, 'tab-1', {
    shouldNotify: () => true,
    isActiveTab: () => activeTab,
    focusTab: () => {},
    markActivity: () => {},
    markDisconnected: (id) => disconnected.push(id)
  })

  connectionManager.emit('disconnect', reason)
  return { notifications: [...notifications], warnings: [...warnings], disconnected, dispose, connectionManager }
}

let passed = 0
let failed = 0
const check = (name, ok, extra) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || extra === undefined ? '' : ` (${JSON.stringify(extra)})`}`)
}

console.log('\nA real drop is reported:')
{
  const r = scenario('SOCKET_LOST')
  check('the tab is marked as no longer signed in', r.disconnected.length === 1, r.disconnected)
  check('a notification is shown', r.notifications.length === 1, r.notifications)
  check('it names the character', r.notifications[0]?.body?.includes('Aranwe') === true, r.notifications[0])
  check('the reason is written to the log', r.warnings.some((w) => w.includes('SOCKET_LOST')), r.warnings)
  r.dispose()
}

console.log('\nA deliberate close is not:')
for (const reason of ['CLIENT_CLOSING', 'SWITCHING_TO_GAME']) {
  const r = scenario(reason)
  check(`${reason} marks nothing`, r.disconnected.length === 0, r.disconnected)
  check(`${reason} notifies nobody`, r.notifications.length === 0, r.notifications)
  r.dispose()
}

console.log('\nAn unknown reason is treated as a drop:')
{
  const r = scenario('')
  check('an empty reason still reports', r.disconnected.length === 1 && r.notifications.length === 1)
  check('the log says the reason is unknown', r.warnings.some((w) => w.includes('unknown')), r.warnings)
  r.dispose()
}

console.log('\nCleanup:')
{
  const r = scenario('SOCKET_LOST')
  const before = r.connectionManager.count('disconnect')
  r.dispose()
  check('the disconnect listener is removed', before === 1 && r.connectionManager.count('disconnect') === 0)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
