/**
 * Tags the current version and pushes it, which is what starts the release.
 *
 * The actual build and publish happen in GitHub Actions (.github/workflows/
 * release.yml). This script exists for the checks in front of that: once a tag
 * is pushed, the release runs, and every mistake it could carry is easier to
 * refuse here than to undo on a page other people are already downloading.
 *
 *   pnpm run tag
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()

function fail(message, hint) {
  console.error(`\n  ${message}`)
  if (hint) console.error(`  ${hint}`)
  console.error('')
  process.exit(1)
}

const { version } = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf-8')
)
const tag = `v${version}`

// A dirty tree means the commit being tagged is not the code that was tested.
// The build in CI comes from the commit, so anything uncommitted is simply
// absent from the release — silently.
if (git('status', '--porcelain')) {
  fail(
    'Des modifications ne sont pas commitees.',
    'La release est construite depuis le commit, pas depuis ton dossier : commit ou stash d abord.'
  )
}

// The changelog section becomes the release body AND the launcher's "what's
// new" panel. CI checks this too; catching it here saves a failed run.
// Normalised: with CRLF the line ends in "\r", so an anchored `$` never matches.
const changelog = fs
  .readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8')
  .replace(/\r\n/g, '\n')
if (!new RegExp(`^## ${version.replace(/\./g, '\\.')}$`, 'm').test(changelog)) {
  fail(
    `CHANGELOG.md n a pas de section "## ${version}".`,
    'Ajoute-la : elle sert de description a la release et de panneau Nouveautes dans le launcher.'
  )
}

// Locally AND on the remote. A release created through the GitHub web form
// tags server-side, so a repository that has only ever published that way has
// no local tags at all — `git tag --list` would wave every one of them through
// and the push would fail afterwards, once the branch had already moved.
if (git('tag', '--list', tag)) {
  fail(
    `Le tag ${tag} existe deja en local.`,
    'Une version publiee ne se remplace pas : monte le numero dans package.json.'
  )
}

try {
  if (git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) {
    fail(
      `Le tag ${tag} existe deja sur GitHub.`,
      'Une version publiee ne se remplace pas : monte le numero dans package.json.'
    )
  }
} catch (err) {
  // Unreachable remote is not a reason to refuse: the push below will say so
  // far more clearly than a guard guessing at why it could not look.
  console.warn(`\n  (impossible de verifier les tags distants : ${err.message.split('\n')[0]})`)
}

// Pushing a tag carries the commits it points at, but leaves the branch behind.
// The release would then exist for a commit that is on nobody's main.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
console.log(`\n  Version   ${version}`)
console.log(`  Tag       ${tag}`)
console.log(`  Branche   ${branch}`)

console.log('\n  Envoi de la branche...')
execFileSync('git', ['push', 'origin', branch], { cwd: root, stdio: 'inherit' })

console.log('  Creation du tag...')
git('tag', '-a', tag, '-m', `Nememu ${version}`)

console.log('  Envoi du tag...')
execFileSync('git', ['push', 'origin', tag], { cwd: root, stdio: 'inherit' })

const remote = git('remote', 'get-url', 'origin')
  .replace(/\.git$/, '')
  .replace(/^git@github\.com:/, 'https://github.com/')

console.log(`\n  C est parti. La construction et la publication tournent ici :`)
console.log(`  ${remote}/actions`)
console.log(`\n  La release apparaitra ici quand ce sera fini :`)
console.log(`  ${remote}/releases/tag/${tag}\n`)
