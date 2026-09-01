/**
 * Checks the CSS variables the interface cannot work without.
 *
 * This test exists because of a bug that shipped in every release so far:
 * --font-sans and --font-mono were declared inside Tailwind's `@theme` block,
 * which decides for itself which variables reach the stylesheet, and it did not
 * emit those two. `body { font-family: var(--font-sans) }` was therefore an
 * invalid declaration, silently dropped — and the whole client rendered in the
 * browser default, Times New Roman on Windows.
 *
 * Nothing failed. The build was green, the CSS was "there", and reading the
 * source showed a perfectly correct font stack. The only way to see it was to
 * ask the running page what font it was actually using.
 *
 * So this asserts on the COMPILED stylesheet, not the source: that each
 * variable is declared somewhere Tailwind cannot drop it, and that every
 * var(--x) used in it resolves to a declaration. A variable that vanishes takes
 * its whole declaration with it, which is why these failures are invisible.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'dist/renderer/assets')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`)
    failed++
  }
}

if (!fs.existsSync(outDir)) {
  console.log('Building the renderer first...')
  execSync('npm run build', { cwd: root, stdio: 'ignore' })
}

const cssFile = fs
  .readdirSync(outDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => path.join(outDir, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]

if (!cssFile) {
  console.error('No compiled stylesheet in dist/renderer/assets — run `npm run build`.')
  process.exit(1)
}

const css = fs.readFileSync(cssFile, 'utf-8')

console.log(`\nCompiled stylesheet (${path.basename(cssFile)}):`)

/*
 * Only :root counts.
 *
 * The first version of this test looked for the variable anywhere in the file,
 * and passed against the very build that was broken: the declaration was there,
 * inside an unprocessed `@theme` block that browsers skip whole. A declaration
 * the browser never reads is not a declaration.
 *
 * So the search is scoped to `:root { … }` rules, and each variable is checked
 * against the value that actually wins — the last one — rather than the first
 * one that happens to match.
 */
const rootBlocks = [...css.matchAll(/:root(?:\s*,\s*:host)?\s*\{([^}]*)\}/g)].map((m) => m[1])

function effectiveValue(name) {
  let value = null
  for (const block of rootBlocks) {
    for (const m of block.matchAll(new RegExp(`${name}\\s*:\\s*([^;}]+)`, 'g'))) value = m[1].trim()
  }
  return value
}

// Each of these, if missing, silently invalidates every declaration reading it.
const required = {
  '--font-sans': /^"Segoe UI"/,
  '--font-mono': /Consolas/,
  '--ease-out': /^cubic-bezier/,
  '--ease-in-out': /^cubic-bezier/
}

for (const [name, expected] of Object.entries(required)) {
  test(`${name} resolves from a :root rule`, () => {
    const value = effectiveValue(name)
    if (value === null) {
      const anywhere = css.includes(`${name}:`)
      throw new Error(
        anywhere
          ? 'declared, but not in a :root rule — a browser never reads it'
          : 'never declared, so every var() using it is dropped'
      )
    }
    if (!expected.test(value)) {
      throw new Error(`resolves to "${value}", which does not match ${expected}`)
    }
  })
}

test('no unprocessed at-rule survived into the built stylesheet', () => {
  const leftovers = ['@theme', '@tailwind', '--theme('].filter((token) => css.includes(token))
  if (leftovers.length) {
    throw new Error(
      `${leftovers.join(', ')} reached the browser unprocessed — everything inside is ignored`
    )
  }
})

test('every var(--x) in the stylesheet resolves to a declaration', () => {
  const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]))
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
  const missing = [...used].filter((v) => !declared.has(v))
  if (missing.length) {
    throw new Error(`used but never declared: ${missing.join(', ')}`)
  }
})

test('the document still asks for the sans stack', () => {
  if (!/html,body\{[^}]*font-family:var\(--font-sans\)/.test(css.replace(/\s+/g, ''))) {
    throw new Error('html/body no longer set font-family from --font-sans')
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
