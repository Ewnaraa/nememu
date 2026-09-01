import type { AccountCapture, AccountSecrets } from '@nememu/shared'
import type { DofusWindow } from '@/types/dofus-window'

const HELPER_POLL_INTERVAL = 250
const HELPER_POLL_TIMEOUT = 20000
const LOGIN_TIMEOUT = 30000

/**
 * Reads the Ankama device credentials out of a game window that is already
 * signed in. These are the same values the official client keeps so it does not
 * ask for a new emailed code on every launch: the HAAPI key pair plus the
 * per-account device certificate.
 *
 * Returns null when the session is not far enough along to hold real
 * credentials, so a half-finished login is never saved as a working account.
 */
export function captureSession(gameWindow: DofusWindow, label: string): AccountCapture | null {
  try {
    const keyData = gameWindow.$_getHaapiKey?.() ?? null
    const accountId = readAccountId(gameWindow)

    const apiKey = keyData?.key || readStorage(gameWindow, 'HAAPI_KEY')
    if (!apiKey) return null

    const refreshToken = keyData?.refreshToken || readStorage(gameWindow, 'HAAPI_REFRESH_TOKEN')

    const secrets: AccountSecrets = {
      apiKey,
      refreshToken,
      certificateId: accountId !== null ? readStorage(gameWindow, `${accountId}_CERTIFICATE_ID`) : '',
      certificateHash: accountId !== null ? readStorage(gameWindow, `${accountId}_CERTIFICATE_HASH`) : '',
      accountId
    }

    return { label, accountId, secrets }
  } catch (err) {
    window.nememu.logger.warn('Could not read the session credentials', err)
    return null
  }
}

/**
 * True when the captured session carries a device certificate. Without one the
 * account is still saved, but Ankama may ask for a fresh emailed code.
 */
export function hasDeviceCertificate(capture: AccountCapture): boolean {
  return !!capture.secrets.certificateId && !!capture.secrets.certificateHash
}

/**
 * Signs a game window in with saved credentials. Resolves false on any problem
 * so the caller can simply leave the normal login screen in place — a failed
 * restore must never leave the user stuck on a blank screen.
 */
export async function restoreSession(
  gameWindow: DofusWindow,
  secrets: AccountSecrets,
  loginName?: string
): Promise<boolean> {
  const accountId = typeof secrets.accountId === 'number' ? secrets.accountId : null

  const ready = await waitForHelpers(gameWindow)
  if (!ready) {
    window.nememu.logger.warn('Auto-login skipped: the game helpers never became available.')
    return false
  }

  try {
    // The account id matters here: primeHaapiKey writes the certificate to the
    // game's storage under `<accountId>_CERTIFICATE_*`, which is where the game
    // looks for it. Without it the certificate is stored nowhere useful and
    // Ankama falls back to emailing a code.
    gameWindow.$_primeHaapiKey?.(
      secrets.apiKey,
      secrets.refreshToken,
      accountId,
      secrets.certificateId,
      secrets.certificateHash
    )
  } catch (err) {
    window.nememu.logger.warn('Auto-login: priming the HAAPI key failed', err)
  }

  const token = await requestToken(gameWindow, secrets, accountId)
  if (!token) return false

  try {
    gameWindow.$_finishDirectLogin?.({ token, loginName })
    return true
  } catch (err) {
    window.nememu.logger.warn('Auto-login: finishing the direct login failed', err)
    return false
  }
}

function requestToken(
  gameWindow: DofusWindow,
  secrets: AccountSecrets,
  accountId: number | null
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false

    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      resolve(token)
    }

    const timer = window.setTimeout(() => {
      window.nememu.logger.warn('Auto-login: the token request timed out.')
      finish(null)
    }, LOGIN_TIMEOUT)

    try {
      gameWindow.$_haapiDirectLogin?.(
        {
          apiKey: secrets.apiKey,
          refreshKey: secrets.refreshToken,
          accountId,
          certificateId: secrets.certificateId,
          certificateHash: secrets.certificateHash,
          save: true
        },
        (err, res) => {
          window.clearTimeout(timer)

          if (err) {
            window.nememu.logger.warn('Auto-login refused by the server, falling back to the login screen.')
            finish(null)
            return
          }

          const token = extractToken(res)
          if (!token) {
            // Shapes only — never the values, which are credentials.
            window.nememu.logger.warn(
              'Auto-login: no token found in the response. Fields seen:',
              describeShape(res)
            )
          }
          finish(token)
        }
      )
    } catch (err) {
      window.clearTimeout(timer)
      window.nememu.logger.warn('Auto-login: the direct login call threw', err)
      finish(null)
    }
  })
}

/**
 * The token has moved around between game builds, so every plausible location
 * is tried rather than pinning one shape that a future update would break.
 */
function extractToken(res: unknown): string | null {
  if (typeof res === 'string') return res || null
  if (!res || typeof res !== 'object') return null

  const record = res as Record<string, unknown>
  const candidates = [
    record.token,
    record.access_token,
    record.accessToken,
    (record.result as Record<string, unknown> | undefined)?.token,
    (record.data as Record<string, unknown> | undefined)?.token
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }

  return null
}

/** Field names and types only, so diagnostics never leak a credential. */
function describeShape(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value !== 'object') return typeof value

  return Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => `${key}:${entry === null ? 'null' : typeof entry}`)
    .join(', ')
}

function waitForHelpers(gameWindow: DofusWindow): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + HELPER_POLL_TIMEOUT

    const check = () => {
      if (typeof gameWindow.$_haapiDirectLogin === 'function' && typeof gameWindow.$_finishDirectLogin === 'function') {
        resolve(true)
        return
      }
      if (Date.now() > deadline) {
        resolve(false)
        return
      }
      window.setTimeout(check, HELPER_POLL_INTERVAL)
    }

    check()
  })
}

function readAccountId(gameWindow: DofusWindow): number | null {
  try {
    const manager = gameWindow.$_haapiModule?.getHaapiKeyManager?.()
    const fromManager = manager?.getHaapiAccountId?.()
    if (typeof fromManager === 'number' && fromManager > 0) return fromManager
  } catch {
    // fall through to storage
  }

  const stored = Number(readStorage(gameWindow, 'HAAPI_ACCOUNTID'))
  return Number.isFinite(stored) && stored > 0 ? stored : null
}

function readStorage(gameWindow: DofusWindow, key: string): string {
  try {
    return gameWindow.localStorage?.getItem(key) ?? ''
  } catch {
    return ''
  }
}
