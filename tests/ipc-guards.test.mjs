/**
 * The guards standing between the game's own code and everything it should not
 * reach.
 *
 * Why this file exists. The game window loads the shell, and the shell embeds
 * Dofus Touch in an iframe served from the *same* origin — same host, same
 * port. `window.nememu` is exposed into that window, so every function on it is
 * callable from Ankama's own bundle through `parent.nememu`. `webSecurity` is
 * off as well, so there is no origin barrier left either.
 *
 * That is not a bug in itself: the shell needs the API, and the game needs to
 * live in that window. It does mean the API surface *is* the security boundary,
 * and two doors in it were wide open — `getAccountSecrets(anyId)`, which handed
 * out the decrypted credentials of every saved account, and `storeSet(anyKey)`,
 * which could rewrite the proxy settings the app then dials.
 *
 * These assertions run against the built main bundle rather than the source,
 * because what ships is what matters. They are deliberately blunt: if a future
 * change reopens one of these doors, this file fails rather than the player
 * finding out later.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const BUNDLE = path.resolve('dist/main/index.cjs')

if (!existsSync(BUNDLE)) {
  console.error(`\nCannot audit the IPC guards: ${BUNDLE} does not exist.`)
  console.error('Run `npm run build` first — this test reads the built bundle, not the source.\n')
  process.exit(1)
}

const source = readFileSync(BUNDLE, 'utf-8')

let passed = 0
let failed = 0

function check(name, fn) {
  let detail = ''
  let ok = false
  try {
    const result = fn()
    ok = result === true
    if (!ok) detail = String(result)
  } catch (err) {
    detail = err.message
  }

  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}`)
    if (detail) console.log(`      ${detail}`)
  }
}

/**
 * The registration for one IPC channel, up to the next one. Enough to see
 * whether the handler validates anything before it acts.
 */
function handlerBody(member) {
  const re = new RegExp(`ipcMain\\.(?:handle|on)\\(\\s*\\w+\\.${member}\\b`)
  const match = re.exec(source)
  if (!match) return null

  const next = source.indexOf('ipcMain.', match.index + 8)
  return source.slice(match.index, next === -1 ? source.length : next)
}

console.log('\nBuilt main bundle:')

check('the account vault answers per tab, not per account id', () => {
  return source.includes('accounts_secrets_for_tab') ||
    'the ACCOUNTS_SECRETS_FOR_TAB channel is missing from the bundle'
})

check('the old "any account id" channel is gone', () => {
  return !source.includes('accounts_get_secrets') ||
    'accounts_get_secrets is still in the bundle: the game can ask for any account'
})

check('the secrets handler resolves the account from the tab itself', () => {
  const body = handlerBody('ACCOUNTS_SECRETS_FOR_TAB')
  if (!body) return 'no handler registered for ACCOUNTS_SECRETS_FOR_TAB'
  return /_accountIdForTab|accountIdForTab/.test(body) ||
    'the handler does not resolve the tab link — it may be trusting its argument'
})

check('the renderer store allowlist exists', () => {
  return /RENDERER_STORE_KEYS\s*=/.test(source) ||
    'RENDERER_STORE_KEYS is missing: the store is open to any key again'
})

check('the allowlist holds only the two persisted stores', () => {
  const match = /RENDERER_STORE_KEYS\s*=\s*(?:\/\*[^*]*\*\/\s*)?new Set\(\[([^\]]*)\]\)/.exec(source)
  if (!match) return 'could not read the allowlist contents'

  const keys = [...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).sort()
  const expected = ['nememu-tabs', 'nememu-teams']
  return (
    JSON.stringify(keys) === JSON.stringify(expected) ||
    `the allowlist is ${JSON.stringify(keys)}, expected ${JSON.stringify(expected)}`
  )
})

for (const channel of ['STORE_GET', 'STORE_SET', 'STORE_DELETE']) {
  check(`${channel} refuses a key outside the allowlist`, () => {
    const body = handlerBody(channel)
    if (!body) return `no handler registered for ${channel}`
    return body.includes('isRendererStoreKey') ||
      `${channel} acts on its key without checking it`
  })
}

check('settings cannot be rewritten through the store door', () => {
  const body = handlerBody('STORE_SET')
  if (!body) return 'no handler registered for STORE_SET'
  // The proxy lives under `settings`, and the app dials whatever it finds.
  const match = /RENDERER_STORE_KEYS\s*=\s*(?:\/\*[^*]*\*\/\s*)?new Set\(\[([^\]]*)\]\)/.exec(source)
  return (match && !match[1].includes('settings')) ||
    'settings is reachable from the renderer store door — the proxy can be rewritten from the game'
})

check('external links are still restricted to http and https', () => {
  const body = handlerBody('OPEN_EXTERNAL')
  if (!body) return 'no handler registered for OPEN_EXTERNAL'
  return (body.includes('https://') && body.includes('http://')) ||
    'openExternal no longer checks the scheme: file:// and friends would open'
})

check('the game window does not enable <webview>', () => {
  return /webviewTag:\s*(?:false|!1)/.test(source) || !/webviewTag/.test(source) ||
    'webviewTag is enabled again, and nothing in the renderer uses it'
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
