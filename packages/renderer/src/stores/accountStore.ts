import { create } from 'zustand'
import type { AccountCapture, SavedAccount } from '@nememu/shared'

interface AccountState {
  accounts: SavedAccount[]
  isHydrated: boolean

  load: () => Promise<void>
  setAccounts: (accounts: SavedAccount[]) => void
  capture: (payload: AccountCapture) => Promise<SavedAccount | null>
  rename: (id: string, label: string) => Promise<void>
  forget: (id: string) => Promise<void>
  getAccount: (id: string | undefined) => SavedAccount | undefined
}

export const useAccountStore = create<AccountState>()((set, get) => ({
  accounts: [],
  isHydrated: false,

  load: async () => {
    try {
      const accounts = await window.nememu.listAccounts()
      set({ accounts, isHydrated: true })
    } catch {
      set({ isHydrated: true })
    }
  },

  setAccounts: (accounts) => set({ accounts }),

  capture: async (payload) => {
    const saved = await window.nememu.captureAccount(payload)
    if (saved) await get().load()
    return saved
  },

  rename: async (id, label) => {
    await window.nememu.renameAccount(id, label)
    await get().load()
  },

  forget: async (id) => {
    await window.nememu.forgetAccount(id)
    await get().load()
  },

  getAccount: (id) => (id ? get().accounts.find((a) => a.id === id) : undefined)
}))
