import crypto from 'crypto'
import type ElectronStore from 'electron-store'
import type { AccountCapture, AccountSecrets, SavedAccount } from '@nememu/shared'
import { decryptSecret, encryptSecret } from '../secure'
import { logger } from '../logger'

const STORE_KEY = 'accounts'
const MAX_ACCOUNTS = 20
const MAX_LABEL_LENGTH = 40

interface StoredAccount {
  id: string
  label: string
  accountId: number | null
  lastUsedAt: number | null
  /** AccountSecrets as JSON, sealed by the OS keychain. */
  secretsEnc?: string
}

function sanitiseLabel(label: unknown, fallback: string): string {
  const text = typeof label === 'string' ? label.trim() : ''
  return (text || fallback).slice(0, MAX_LABEL_LENGTH)
}

function isUsableSecrets(secrets: AccountSecrets | null): secrets is AccountSecrets {
  return !!secrets && typeof secrets.apiKey === 'string' && secrets.apiKey.length > 0
}

/**
 * Stores the Ankama device credentials of each saved account so a tab can
 * reconnect without a fresh emailed code — the same certificate mechanism the
 * official client relies on.
 *
 * Nothing here is ever logged: only counts, ids and labels reach the log.
 */
export class AccountVault {
  constructor(private readonly _store: ElectronStore<Record<string, unknown>>) {}

  private _read(): StoredAccount[] {
    const raw = this._store.get(STORE_KEY, [])
    return Array.isArray(raw) ? (raw as StoredAccount[]) : []
  }

  private _write(accounts: StoredAccount[]) {
    this._store.set(STORE_KEY, accounts.slice(0, MAX_ACCOUNTS))
  }

  private _toPublic(account: StoredAccount): SavedAccount {
    return {
      id: account.id,
      label: account.label,
      accountId: account.accountId ?? null,
      hasSecrets: !!account.secretsEnc,
      lastUsedAt: account.lastUsedAt ?? null
    }
  }

  list(): SavedAccount[] {
    return this._read().map((account) => this._toPublic(account))
  }

  /**
   * Saves (or refreshes) an account from a session the user just signed into.
   * Matching is done on the Ankama account id so re-capturing the same account
   * updates it instead of piling up duplicates.
   */
  capture(payload: AccountCapture): SavedAccount | null {
    const secrets = payload?.secrets ?? null

    if (!isUsableSecrets(secrets)) {
      logger.warn('Account capture ignored: no usable credentials in the session.')
      return null
    }

    const secretsEnc = encryptSecret(JSON.stringify(secrets))
    if (!secretsEnc) {
      logger.warn('Account capture ignored: the OS refused to encrypt the credentials.')
      return null
    }

    const accounts = this._read()
    const accountId =
      typeof payload.accountId === 'number'
        ? payload.accountId
        : typeof secrets.accountId === 'number'
          ? secrets.accountId
          : null
    const existing = accountId !== null ? accounts.find((a) => a.accountId === accountId) : undefined

    if (existing) {
      existing.label = sanitiseLabel(payload.label, existing.label)
      existing.secretsEnc = secretsEnc
      existing.lastUsedAt = Date.now()
      this._write(accounts)
      logger.info(`Account refreshed: ${existing.label}`)
      return this._toPublic(existing)
    }

    if (accounts.length >= MAX_ACCOUNTS) {
      logger.warn(`Account capture ignored: the ${MAX_ACCOUNTS} account limit is reached.`)
      return null
    }

    const account: StoredAccount = {
      id: crypto.randomUUID(),
      label: sanitiseLabel(payload.label, `Account ${accounts.length + 1}`),
      accountId,
      lastUsedAt: Date.now(),
      secretsEnc
    }

    accounts.push(account)
    this._write(accounts)
    logger.info(`Account saved: ${account.label}`)
    return this._toPublic(account)
  }

  getSecrets(id: string): AccountSecrets | null {
    const account = this._read().find((a) => a.id === id)
    if (!account?.secretsEnc) return null

    const decrypted = decryptSecret(account.secretsEnc)
    if (!decrypted) return null

    try {
      const secrets = JSON.parse(decrypted) as AccountSecrets
      return isUsableSecrets(secrets) ? secrets : null
    } catch {
      logger.warn(`Stored credentials for account ${id} could not be parsed.`)
      return null
    }
  }

  touch(id: string) {
    const accounts = this._read()
    const account = accounts.find((a) => a.id === id)
    if (!account) return

    account.lastUsedAt = Date.now()
    this._write(accounts)
  }

  rename(id: string, label: string): SavedAccount | null {
    const accounts = this._read()
    const account = accounts.find((a) => a.id === id)
    if (!account) return null

    account.label = sanitiseLabel(label, account.label)
    this._write(accounts)
    return this._toPublic(account)
  }

  forget(id: string) {
    const accounts = this._read()
    const remaining = accounts.filter((a) => a.id !== id)
    if (remaining.length === accounts.length) return

    this._write(remaining)
    logger.info(`Account forgotten: ${id}`)
  }
}
