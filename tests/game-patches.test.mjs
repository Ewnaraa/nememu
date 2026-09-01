import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'assert'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const tmpDir = path.join(root, 'tests/.tmp')

function setup() {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(tmpDir, 'build'), { recursive: true })

  for (const file of ['index.html', 'fixes.js', 'fixes.css', 'regex.json', 'keymaster2.js']) {
    fs.copyFileSync(
      path.join(root, 'packages/main/game-base', file),
      path.join(tmpDir, file)
    )
  }

  console.log('Downloading fresh script.js...')
  execSync(`curl -s "https://dt-proxy-production-login.ankama-games.com/build/script.js" -o "${path.join(tmpDir, 'build/script.js')}"`, { timeout: 30000 })
  execSync(`curl -s "https://dt-proxy-production-login.ankama-games.com/build/styles-native.css" -o "${path.join(tmpDir, 'build/styles-native.css')}"`, { timeout: 30000 })
  console.log('Downloaded.')
}

function applyRegexPatches() {
  const regexPath = path.join(tmpDir, 'regex.json')
  const regex = JSON.parse(fs.readFileSync(regexPath, 'utf-8'))
  const results = {}

  for (const filename in regex) {
    const filePath = path.join(tmpDir, filename)
    if (!fs.existsSync(filePath)) continue
    let content = fs.readFileSync(filePath, 'utf-8')
    let applied = 0
    for (const [pattern, replacement] of regex[filename]) {
      const before = content
      content = content.replace(new RegExp(pattern, 'g'), replacement)
      if (content !== before) applied++
    }
    fs.writeFileSync(filePath, content)
    results[filename] = { applied, total: regex[filename].length }
  }
  return results
}

function applyProcessGamePatches() {
  const buildPath = path.join(tmpDir, 'build/script.js')
  let build = fs.readFileSync(buildPath, 'utf-8')
  const results = []

  if (!build.includes('$_haapiModule')) {
    const m = build.match(/(\w)\.getHaapiKeyManager\s*=\s*function\s*\(\)/)
    if (m) {
      build = build.replace(m[0], `window.$_haapiModule=${m[1]},${m[0]}`)
      results.push('$_haapiModule')
    }
  }

  if (!build.includes('$_authManager')) {
    const m = build.match(/(\w)\.requestWebAuthToken\s*=\s*function/)
    if (m) {
      build = build.replace(m[0], `window.$_authManager=${m[1]},${m[0]}`)
      results.push('$_authManager')
    }
  }

  if (!build.includes('$_haapiAccount')) {
    const m = build.match(/(\w)\.account\s*=\s*new\s+(\w)\((\w),\s*(\w)\)/)
    if (m) {
      build = build.replace(m[0], `${m[0]},window.$_haapiAccount=${m[1]}.account`)
      results.push('$_haapiAccount')
    }
  }

  if (!build.includes('Ignoring blocked delete for ')) {
    const m = build.match(
      /(\w+)\.onblocked\s*=\s*function\(\)\s*\{\s*return\s+(\w+)\((\w+)\("Delete database operation was blocked, name: "\s*\+\s*(\w+)\)\)\s*\}/
    )
    if (m) {
      build = build.replace(
        m[0],
        `${m[1]}.onblocked = function() { return console.warn("Ignoring blocked delete for " + ${m[4]}), ${m[2]}() }`
      )
      results.push('blockedIndexedDbDelete')
    }
  }

  fs.writeFileSync(buildPath, build)
  return results
}

function runTests() {
  let passed = 0
  let failed = 0

  function test(name, fn) {
    try {
      fn()
      console.log(`  \u2713 ${name}`)
      passed++
    } catch (e) {
      console.log(`  \u2717 ${name}: ${e.message}`)
      failed++
    }
  }

  // --- Game base files ---
  console.log('\nGame base files:')

  test('index.html exists and has cordova mock', () => {
    const html = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf-8')
    assert(html.includes('window.cordova'), 'missing cordova mock')
    assert(html.includes('InAppBrowser'), 'missing InAppBrowser mock')
    assert(html.includes('initDofus'), 'missing initDofus')
    assert(html.includes('$appSchemeLinkCalled'), 'missing $appSchemeLinkCalled')
    assert(html.includes('IonicDeeplink'), 'missing IonicDeeplink mock')
    assert(html.includes('browsertab'), 'missing browsertab mock')
    assert(html.includes('_deepLinkCallbacks'), 'missing deeplink callback bridge')
  })

  test('fixes.js has mouse-to-touch conversion', () => {
    const fixes = fs.readFileSync(path.join(tmpDir, 'fixes.js'), 'utf-8')
    assert(fixes.includes('TouchEvent'), 'missing TouchEvent creation')
    assert(fixes.includes('mousedown'), 'missing mousedown handler')
  })

  test('fixes.css has base styles', () => {
    const css = fs.readFileSync(path.join(tmpDir, 'fixes.css'), 'utf-8')
    assert(css.includes('background: black'), 'missing background')
    assert(css.includes('scrollbar'), 'missing scrollbar styles')
  })

  // --- Regex patches ---
  console.log('\nRegex patches:')
  const regexResults = applyRegexPatches()

  test('script.js regex patches all applied', () => {
    const r = regexResults['build/script.js']
    assert(r, 'no script.js results')
    assert(r.applied === r.total, `only ${r.applied}/${r.total} patches applied`)
  })

  test('script.js is valid syntax after regex patches', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    new Function(src)
  })

  test('singletons exposed via regex', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('window.singletons'), 'missing window.singletons')
  })

  test('analytics disabled', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(!src.includes('window.Config.analytics'), 'analytics not replaced with null')
  })

  test('client set to android', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('client:"android"'), 'client not set to android')
  })

  // --- processGame patches ---
  console.log('\nprocessGame patches:')
  const pgResults = applyProcessGamePatches()

  test('$_haapiModule exposed', () => {
    assert(pgResults.includes('$_haapiModule'), '$_haapiModule not patched')
  })

  test('$_authManager exposed', () => {
    assert(pgResults.includes('$_authManager'), '$_authManager not patched')
  })

  test('blocked IndexedDB deletes are downgraded', () => {
    assert(pgResults.includes('blockedIndexedDbDelete'), 'blocked delete patch not applied')
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('Ignoring blocked delete for '), 'missing blocked delete downgrade')
  })

  test('script.js still valid after processGame patches', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    new Function(src)
  })

  // --- Auth flow ---
  console.log('\nAuth flow:')

  test('game has loginWithHaapiKey', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('loginWithHaapiKey'), 'missing loginWithHaapiKey')
  })

  test('game has requestWebAuthToken', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('requestWebAuthToken'), 'missing requestWebAuthToken')
  })

  test('game has CODE_VERIFIER storage', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('CODE_VERIFIER'), 'missing CODE_VERIFIER')
  })

  test('game uses deepLink for auth callback detection', () => {
    const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
    assert(src.includes('deepLink+"?code="'), 'missing deepLink code detection')
  })

  // --- Client mod API ---
  // These are the game internals the client drives directly. They are read from
  // the live build rather than assumed, so an Ankama update that renames one is
  // caught here instead of silently breaking a shortcut in someone's fight.
  console.log('\nClient mod API:')

  const modApi = [
    ['toggleReadyForFight', 'ready button'],
    ['finishTurn', 'end turn'],
    ['GameFightTurnFinishMessage', 'end turn message'],
    ['GameFightReadyMessage', 'ready message'],
    ['getSpellSlotByIndex', 'spell slot lookup'],
    ['_selectSlot', 'spell slot selection'],
    ['shortcutBarManager', 'shortcut bar manager'],
    ['isInBattle', 'fight state'],
    ['isFightersTurn', 'turn ownership'],
    ['getIsTurnEndRequestPending', 'pending end of turn'],
    ['closeAll', 'window manager closeAll'],
    ['addWindow', 'window manager addWindow'],
    ['CurrentMapMessage', 'auto-group map change'],
    ['PartyInvitationRequestMessage', 'auto-invite'],
    ['_tacticalModeBtn', 'tactical mode button'],
    ['_creatureModeButton', 'creature mode button'],
    ['_transparentModeButton', 'transparent mode button'],
    ['_interactiveBlink', 'interactive highlight button'],
    ['_mapInfoButton', 'map info button'],
    ['_nicknamesButton', 'player names button'],
    ['_monsterInfoButton', 'monster group info button'],
    ['areNicknamesOn', 'player names state'],
    ['turnNicknamesOn', 'player names on'],
    ['showAllMonsterGroupAndNpcTooltips', 'monster tooltips on'],
    ['removeAllMonsterGroupAndNpcTooltips', 'monster tooltips off'],
    ['setCreatureMode', 'creature mode setter'],
    ['setTransparentMode', 'transparent mode setter'],
    ['setInteractiveBlink', 'interactive highlight setter'],
    ['setMapInfoVisibility', 'map info setter'],
    ['addWindow("equipment"', 'inventory window id'],
    ['addWindow("grimoire"', 'grimoire window id'],
    ['addWindow("worldMap"', 'world map window id'],
    ['addWindow("characteristics"', 'characteristics window id'],
    ['addWindow("social"', 'social window id'],
    ['addWindow("options"', 'options window id'],
    ['addWindow("arena"', 'kolossium window id'],
    ['addWindow("mount"', 'mount window id'],
    ['addWindow("social"', 'social window id'],
    ['tabId:"spells"', 'grimoire spells tab'],
    ['tabId:"quests"', 'grimoire quests tab'],
    ['tabId:"jobs"', 'grimoire jobs tab'],
    ['tabId:"friends"', 'social friends tab'],
    ['tabId:"guild"', 'social guild tab'],
    // The disconnection warning listens for this event and reads its reason to
    // tell a real drop from the client closing the socket on purpose. If Ankama
    // renames either, the warning goes quiet instead of going wrong — which is
    // exactly the failure a test has to catch.
    ['emit("disconnect"', 'connection manager disconnect event'],
    ['"SOCKET_LOST"', 'disconnect reason for a dropped socket'],
    ['"CLIENT_CLOSING"', 'disconnect reason for a deliberate close'],
    ['"SWITCHING_TO_GAME"', 'disconnect reason for the login handover'],
    // Arrow-key map travel calls the game's own method, the one its tap and
    // swipe gestures use, so the character walks to the edge normally. If it is
    // renamed the shortcut stops working and this test says so.
    ['gotoNeighbourMap', 'walk to the neighbouring map'],
    ['getChangeMapFlags', 'map edges available from a cell'],
    // The chat shortcut calls what a tap on the chat calls.
    ['gui.chat.activate', 'open and focus the chat'],
    // The ready shortcut must never call toggleReadyForFight blind: it sends a
    // protocol message with no state check of its own.
    ['isReadyForFightButtonVisible', 'guard telling when ready can be pressed']
  ]

  for (const [symbol, label] of modApi) {
    test(`game still exposes ${symbol} (${label})`, () => {
      const src = fs.readFileSync(path.join(tmpDir, 'build/script.js'), 'utf-8')
      assert(src.includes(symbol), `missing ${symbol}`)
    })
  }

  test('index.html makes IndexedDB deletes non-blocking', () => {
    const html = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf-8')
    assert(html.includes('deleteDatabase'), 'missing deleteDatabase shim')
    assert(html.includes('nativeDeleteDatabase'), 'shim does not keep the real delete')
  })

  test('keymaster carries no obfuscated payload loader', () => {
    const js = fs.readFileSync(path.join(tmpDir, 'keymaster2.js'), 'utf-8')
    assert(!js.includes('atob'), 'keymaster2.js contains base64-decoded strings again')
    assert(!js.includes('lindoAPI'), 'keymaster2.js references lindoAPI again')
  })

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

setup()
runTests()
fs.rmSync(tmpDir, { recursive: true, force: true })
