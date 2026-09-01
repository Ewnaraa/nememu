import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Console logging, mirrored to a file.
 *
 * A packaged Windows build has no console anyone can read, so without a file on
 * disk a player who hits a problem has nothing to send back — "it doesn't work"
 * and no way to find out why. The file lives beside the settings, in the app's
 * own data directory.
 *
 * One previous run is kept as `.1`, and the current file is capped, so the log
 * stays useful without growing forever on a machine nobody is watching.
 */

const MAX_BYTES = 2 * 1024 * 1024

let stream: fs.WriteStream | null = null
let written = 0
let filePath = ''

function openLogFile() {
  if (stream) return stream

  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    filePath = path.join(dir, 'nememu.log')

    // Keep the previous run: the interesting failure is often the one before
    // the player relaunched to "try again".
    try {
      if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.1`)
    } catch {}

    stream = fs.createWriteStream(filePath, { flags: 'a' })
    stream.on('error', () => { stream = null })
  } catch {
    stream = null
  }

  return stream
}

function format(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

// The game is chatty: it repeats the same renderer warning hundreds of times a
// second while it boots. Written out one line each, that noise buries the one
// error worth reading and eats the size cap on its own, so identical
// consecutive messages are collapsed into a single counted line.
let lastBody = ''
let repeats = 0

function flushRepeats(out: fs.WriteStream) {
  if (repeats === 0) return
  const line = `  ... previous line repeated ${repeats} more time${repeats > 1 ? 's' : ''}`
  try {
    out.write(line + '\n')
    written += line.length + 1
  } catch {}
  repeats = 0
}

function toFile(prefix: string, body: string) {
  if (written > MAX_BYTES) return
  const out = openLogFile()
  if (!out) return

  if (body === lastBody) {
    repeats += 1
    return
  }

  flushRepeats(out)
  lastBody = body

  const line = `${prefix} ${body}`
  try {
    out.write(line + '\n')
    written += line.length + 1
    if (written > MAX_BYTES) out.write(`[log capped at ${MAX_BYTES} bytes]\n`)
  } catch {}
}

function ts() {
  return new Date().toISOString()
}

function safe(fn: (...a: unknown[]) => void, prefix: string, args: unknown[]) {
  try { fn(prefix, ...args) } catch {}
  toFile(prefix, args.map(format).join(' '))
}

export const logger = {
  info: (...args: unknown[]) => safe(console.log, `[${ts()}] [INFO]`, args),
  warn: (...args: unknown[]) => safe(console.warn, `[${ts()}] [WARN]`, args),
  error: (...args: unknown[]) => safe(console.error, `[${ts()}] [ERROR]`, args),
  debug: (...args: unknown[]) => safe(console.debug, `[${ts()}] [DEBUG]`, args),

  /** Where the log file is, so the app can tell the player where to find it. */
  logPath: () => filePath
}
