import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// The version is read from package.json at build time rather than requested over
// IPC. It is a build-time constant, and the one place it has to be right — the
// line a player reads back when reporting a problem — is on screen before any
// IPC round-trip has had time to answer.
const { version } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')
) as { version: string }

/**
 * The CHANGELOG section for this version, shown in the launcher.
 *
 * Read at build time from the same file the release notes are generated from,
 * so there is exactly one place where a version's changes are written. Copying
 * them into the UI by hand would give the launcher and the release page two
 * different accounts of the same build, and the launcher's would rot first.
 *
 * An empty string is a valid result: the launcher then shows nothing rather
 * than a stale section, and the build warns.
 */
function changelogForVersion(): string {
  const file = path.resolve(__dirname, '../../CHANGELOG.md')
  if (!fs.existsSync(file)) return ''

  // Normalised first: Git checks this out with CRLF on Windows, so on a fresh
  // clone — a CI runner, say — the file holds "\r\n## 0.3.1\r\n" and a search
  // for "\n## 0.3.1\n" silently finds nothing. The launcher's "what's new"
  // panel would then be empty in every build except the ones made on the
  // machine where the changelog was written.
  const text = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
  const start = text.indexOf(`\n## ${version}\n`)
  if (start === -1) {
    console.warn(`[nememu] CHANGELOG.md has no "## ${version}" section — the launcher will show no release notes.`)
    return ''
  }

  const rest = text.slice(start + 1)
  const next = rest.indexOf('\n## ', 1)
  return rest.slice(rest.indexOf('\n') + 1, next === -1 ? undefined : next).trim()
}

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_CHANGELOG__: JSON.stringify(changelogForVersion())
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/renderer'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@nememu/shared': path.resolve(__dirname, '../shared/index.ts')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  css: {
    postcss: {
      plugins: []
    }
  }
})
