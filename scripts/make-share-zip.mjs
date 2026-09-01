/**
 * Builds the archive to hand to other people: the installer plus a LISEZ-MOI
 * whose SHA256 is filled in from the file that was actually just built.
 *
 * The point is that the fingerprint cannot go stale. Written by hand it had to
 * be recopied after every build, and a fingerprint that no longer matches is
 * worse than none at all: it teaches people that the check "always fails
 * anyway", which is precisely the habit the check exists to prevent.
 *
 * The template lives in docs/ rather than release/, because release/ is wiped
 * on every package run — the first version of this file was deleted that way.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const releaseDir = path.join(root, 'release')
const template = path.join(root, 'docs', 'LISEZ-MOI.template.txt')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
const version = pkg.version

const installer = fs
  .readdirSync(releaseDir)
  .find((name) => name.endsWith('.exe') && name.includes('Setup'))

if (!installer) {
  console.error(`No installer found in ${releaseDir}. Run the packaging step first.`)
  process.exit(1)
}

const installerPath = path.join(releaseDir, installer)
const bytes = fs.readFileSync(installerPath)
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
const size = bytes.length.toLocaleString('fr-FR').replace(/ | /g, ' ')

const readme = fs
  .readFileSync(template, 'utf-8')
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{INSTALLER}}', installer)
  .replaceAll('{{SHA256}}', sha256)
  .replaceAll('{{SIZE}}', size)

// CRLF so Notepad shows it properly for someone who just double-clicks it.
const readmePath = path.join(releaseDir, 'LISEZ-MOI.txt')
fs.writeFileSync(readmePath, readme.replace(/\r?\n/g, '\r\n'), 'utf-8')

const stageDir = path.join(releaseDir, '_share')
fs.rmSync(stageDir, { recursive: true, force: true })
fs.mkdirSync(stageDir)
fs.copyFileSync(installerPath, path.join(stageDir, installer))
fs.copyFileSync(readmePath, path.join(stageDir, 'LISEZ-MOI.txt'))

const zipPath = path.join(releaseDir, `Nememu-${version}.zip`)
fs.rmSync(zipPath, { force: true })

execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal`
], { stdio: 'inherit' })

fs.rmSync(stageDir, { recursive: true, force: true })

/*
 * Release notes, generated rather than retyped.
 *
 * The body of a GitHub release has to carry the fingerprint of the file that is
 * attached to that release. Written by hand it drifts on the first rebuild, and
 * a fingerprint that no longer matches is worse than none at all — it teaches
 * people that the check "always fails anyway". So it is assembled here, from
 * the file that was actually just built, next to the section of CHANGELOG.md
 * that matches this version.
 */
function changelogSection() {
  const file = path.join(root, 'CHANGELOG.md')
  if (!fs.existsSync(file)) return ''
  const text = fs.readFileSync(file, 'utf-8')
  const start = text.indexOf(`\n## ${version}\n`)
  if (start === -1) return ''
  const rest = text.slice(start + 1)
  const next = rest.indexOf('\n## ', 1)
  return rest.slice(rest.indexOf('\n') + 1, next === -1 ? undefined : next).trim()
}

const section = changelogSection()
if (!section) {
  console.warn(`\n/!\\ CHANGELOG.md n'a pas de section "## ${version}" — notes de version incompletes.`)
}

const notes = [
  section,
  '',
  '---',
  '',
  '### Installation',
  '',
  `Telecharge \`${installer}\` et lance-le. Windows affichera un avertissement`,
  'SmartScreen : le binaire n\'est pas signe (un certificat d\'editeur coute',
  'plusieurs centaines d\'euros par an). Pour verifier que le fichier est bien',
  'celui publie ici, dans PowerShell :',
  '',
  '```powershell',
  `Get-FileHash "$HOME\\Downloads\\${installer}" -Algorithm SHA256`,
  '```',
  '',
  'Le resultat doit etre exactement :',
  '',
  '```',
  sha256,
  '```',
  '',
  `Taille attendue : ${size} octets.`,
  '',
  'Si les deux correspondent, le fichier est intact. Si non, ne le lance pas.',
  '',
  '> Nememu est un client tiers non officiel. L\'utiliser est contraire aux CGU',
  '> d\'Ankama et expose a une sanction sur le compte.',
  ''
].join('\n')

const notesPath = path.join(releaseDir, 'NOTES.md')
fs.writeFileSync(notesPath, notes, 'utf-8')

// latest.yml is what the in-app updater reads. electron-builder only writes it
// when build.publish is configured, and a release published without it is
// invisible to every copy already installed — the update button simply never
// finds anything. Worth failing loudly over rather than discovering months later.
const feed = path.join(releaseDir, 'latest.yml')
const hasFeed = fs.existsSync(feed)

console.log(`\nA partager : ${path.relative(root, zipPath)}`)
console.log(`  ${installer}`)
console.log(`  LISEZ-MOI.txt`)
console.log(`\nSHA256 : ${sha256}`)
console.log(`Taille : ${size} octets`)
console.log(`\nNotes de version : ${path.relative(root, notesPath)}`)
console.log('\nA joindre a la release GitHub :')
console.log(`  ${installer}`)
console.log(`  ${installer}.blockmap`)
if (hasFeed) {
  console.log('  latest.yml')
} else {
  console.log('  latest.yml  <-- ABSENT : sans lui, aucune copie deja installee')
  console.log('                 ne verra cette mise a jour. Verifie build.publish.')
}
