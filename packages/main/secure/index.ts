import { safeStorage } from 'electron'
import { logger } from '../logger'

/**
 * Secrets never touch disk in plain text. They are sealed with the OS keychain
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux), which ties them to
 * this user account on this machine — copying the settings file to another
 * machine yields nothing usable.
 *
 * When the OS offers no encryption, the secret is dropped rather than written
 * in the clear: losing a saved session is preferable to leaking credentials.
 */
export function encryptSecret(value: string): string | null {
  if (!value) return null

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('OS encryption unavailable — secret will not be saved to disk.')
      return null
    }
    return safeStorage.encryptString(value).toString('base64')
  } catch (err) {
    logger.warn('Failed to encrypt secret', err)
    return null
  }
}

export function decryptSecret(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''

  try {
    if (!safeStorage.isEncryptionAvailable()) return ''
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch (err) {
    logger.warn('Failed to decrypt secret', err)
    return ''
  }
}

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}
