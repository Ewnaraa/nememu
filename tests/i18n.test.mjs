/**
 * Translation coverage.
 *
 * The English source string is the key, so a typo or a reworded English string
 * does not fail loudly — it silently falls back to English for French players,
 * which is exactly the kind of half-translated interface nobody notices until a
 * user asks why one button is in the wrong language. This test walks every
 * `t('...')` call in the renderer and requires a French entry for each.
 *
 * It also checks the reverse: an entry nobody calls is dead weight left behind
 * by a reworded string, and points at a call site that has gone untranslated.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('packages/renderer/src')
const DICT = path.join(SRC, 'i18n/index.ts')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

// Keys of the `fr` dictionary object: the source is a plain object literal, so
// the quoted keys at the start of a line are read directly.
const dictSource = readFileSync(DICT, 'utf-8')
const frBody = dictSource.slice(dictSource.indexOf('const fr: Dict = {'), dictSource.indexOf('const DICTIONARIES'))
const dictKeys = new Set(
  [...frBody.matchAll(/^\s{2}(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)]
    .map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
)

// `t('...')` and `tr('...')` calls with a literal argument. `tr` is the
// non-React form used by the notification matchers, which run on game events;
// it was added precisely because those strings had escaped translation once,
// so the scan has to cover it too. Calls with a computed argument —
// t(group.title), t(HOTKEY_ACTION_LABELS[action]), t(message) — are checked
// separately below, since their values come from data rather than source text.
const used = new Set()
const files = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !f.includes(`${path.sep}i18n${path.sep}`))
for (const file of files) {
  const source = readFileSync(file, 'utf-8')
  for (const m of source.matchAll(/\btr?\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    used.add(m[1].replace(/\\'/g, "'"))
  }
  for (const m of source.matchAll(/\btr?\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    used.add(m[1].replace(/\\"/g, '"'))
  }
}

// Values reaching t() from data rather than from a literal at the call site.
// Each of these ends up on screen through t(), so each needs an entry just the
// same — and collecting them from source means a new one cannot be forgotten.
const read = (p) => readFileSync(path.resolve(p), 'utf-8')
const literals = (text, re) => [...text.matchAll(re)].map((m) => m[1])

const sharedTypes = read('packages/shared/types/index.ts')
const labelsBody = sharedTypes.slice(
  sharedTypes.indexOf('HOTKEY_ACTION_LABELS'),
  sharedTypes.indexOf('DEFAULT_HOTKEYS')
)
const labels = literals(labelsBody, /:\s*'([^']+)'/g)
// The 'Other' fallback group is declared in the screens, not in the shared list.
const groupTitles = [
  ...literals(sharedTypes, /title:\s*'([^']+)'/g),
  ...literals(read('packages/renderer/src/screens/SettingsScreen.tsx'), /title:\s*'([^']+)'/g),
  ...literals(read('packages/renderer/src/components/ShortcutsOverlay.tsx'), /title:\s*'([^']+)'/g)
]

const settingsSource = read('packages/renderer/src/screens/SettingsScreen.tsx')
const tabIds = literals(
  settingsSource.slice(settingsSource.indexOf('const TABS = [')),
  /id:\s*'([^']+)'/g
)

const setupSource = read('packages/renderer/src/screens/SetupScreen.tsx')
const stepTitles = literals(
  setupSource.slice(setupSource.indexOf('const STEPS = ['), setupSource.indexOf('function ')),
  /title:\s*'([^']+)'/g
)
// Progress text is produced in the main process and translated on render.
const progress = [
  ...literals(read('packages/main/updater/game-updater.ts'), /_onProgress\(\s*'([^']+)'/g),
  ...literals(read('packages/main/updater/app-updater.ts'), /message:\s*'([^']+)'/g),
  // A setMessage call can carry several literals (a ternary, a ?? fallback), so
  // each call's whole argument list is scanned rather than just its first string.
  ...[...setupSource.matchAll(/setMessage\(([^)]*)\)/g)].flatMap((m) =>
    literals(m[1], /'([^']+)'/g)
  )
]

const dynamic = [
  ['hotkey label', labels],
  ['hotkey group title', groupTitles],
  ['settings tab name', tabIds],
  ['setup step title', stepTitles],
  ['progress message', progress]
]

let failed = 0
const report = (label, items) => {
  if (items.length === 0) {
    console.log(`  ✓ ${label}`)
    return
  }
  failed += items.length
  console.log(`  ✗ ${label}`)
  for (const item of items) console.log(`      ${JSON.stringify(item)}`)
}

console.log('\nFrench coverage:')
report('every t()/tr() literal has a French entry', [...used].filter((k) => !dictKeys.has(k)))
for (const [what, values] of dynamic) {
  report(`every ${what} has a French entry`, [...new Set(values)].filter((k) => !dictKeys.has(k)))
}

const known = new Set([...used, ...dynamic.flatMap(([, values]) => values)])
report('no French entry is orphaned', [...dictKeys].filter((k) => !known.has(k)))

console.log(`\n${dictKeys.size} entries, ${used.size} literal call sites, ${failed} problem${failed === 1 ? '' : 's'}`)
process.exit(failed === 0 ? 0 : 1)
