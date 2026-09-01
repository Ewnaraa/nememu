import type { DofusWindow } from '@/types/dofus-window'
import { tr } from '@/i18n'

const FOCUS_DEBOUNCE_MS = 1200
const lastFocusByTab = new Map<string, number>()

interface EventSourceLike {
  on: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
  off?: (event: string, cb: (...args: unknown[]) => void) => void
}

interface NotificationFocusCallbacks {
  shouldNotify: () => boolean
  isActiveTab: (tabId: string) => boolean
  focusTab: (tabId: string) => void
  markActivity: (tabId: string) => void
  /** The session dropped: the tab is no longer signed in. */
  markDisconnected: (tabId: string) => void
}

/**
 * Reasons the game gives when *it* closes the connection on purpose. Every
 * other reason — `SOCKET_LOST` above all — is a drop the player did not ask
 * for, and is the only case worth interrupting them about. Notifying on a
 * deliberate close would fire on every quit and on the login-to-game handover,
 * which is how a useful warning becomes one people learn to ignore.
 */
const DELIBERATE_DISCONNECTS = new Set(['CLIENT_CLOSING', 'SWITCHING_TO_GAME'])

interface NotificationPayload {
  title: string
  body?: string
  focus?: boolean
}

interface ChatMessage {
  channel?: number
  senderName?: string
  content?: string
}

interface PartyInvitationMessage {
  fromName?: string
}

interface FightTurnMessage {
  id?: number
}

interface AggressionMessage {
  defenderId?: number
}

interface TextInformationMessage {
  msgId?: number
  parameters?: string[]
}

interface TaxCollectorAttackedMessage {
  guild?: { guildName?: string }
  worldX?: number
  worldY?: number
  enrichData?: {
    subAreaName?: string
    firstName?: string
    lastName?: string
  }
}

type NotificationMatcher = (msg: unknown, gameWindow: DofusWindow) => NotificationPayload | null

const getPlayerId = (gameWindow: DofusWindow): number | undefined => {
  const playerData = gameWindow.gui?.playerData as unknown as {
    characterBaseInformations?: { id?: number }
  }
  return playerData?.characterBaseInformations?.id
}

const getPlayerName = (gameWindow: DofusWindow): string | undefined => {
  const playerData = gameWindow.gui?.playerData as unknown as {
    characterBaseInformations?: { name?: string }
  }
  return playerData?.characterBaseInformations?.name
}

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const isWindowFocused = (gameWindow: DofusWindow) => {
  try {
    return document.hasFocus() && gameWindow.document.hasFocus()
  } catch {
    return document.hasFocus()
  }
}

const connectionMatchers: Record<string, NotificationMatcher> = {
  ChatServerMessage: (raw) => {
    const msg = raw as ChatMessage
    if (msg.channel !== 9) return null

    return {
      title: tr('Private message from {name}', { name: text(msg.senderName) ?? tr('Unknown') }),
      body: text(msg.content),
      focus: true
    }
  },

  PartyInvitationMessage: (raw) => {
    const msg = raw as PartyInvitationMessage
    return {
      title: tr('Party invitation'),
      body: text(msg.fromName) ? tr('{name} invited you to a party.', { name: msg.fromName as string }) : undefined,
      focus: true
    }
  },

  TaxCollectorAttackedMessage: (raw) => {
    const msg = raw as TaxCollectorAttackedMessage
    const zone = text(msg.enrichData?.subAreaName)
    const coords = typeof msg.worldX === 'number' && typeof msg.worldY === 'number'
      ? `[${msg.worldX}, ${msg.worldY}]`
      : undefined
    const guild = text(msg.guild?.guildName)
    const collectorName = [text(msg.enrichData?.firstName), text(msg.enrichData?.lastName)].filter(Boolean).join(' ')

    return {
      title: tr('Tax collector attacked'),
      body: [zone, coords, guild, collectorName].filter(Boolean).join(' - '),
      focus: true
    }
  },

  GameRolePlayArenaFightPropositionMessage: () => ({
    title: tr('Kolossium fight ready'),
    focus: true
  }),

  GameRolePlayAggressionMessage: (raw, gameWindow) => {
    const msg = raw as AggressionMessage
    if (msg.defenderId !== getPlayerId(gameWindow)) return null

    return {
      title: tr('Aggression'),
      body: tr('Your character is being attacked.'),
      focus: true
    }
  },

  TextInformationMessage: (raw) => {
    const msg = raw as TextInformationMessage
    if (msg.msgId !== 65) return null

    const kamas = text(msg.parameters?.[0])
    const quantity = text(msg.parameters?.[3])
    return {
      title: tr('Item sold'),
      body: [
        kamas ? tr('+{kamas} kamas', { kamas }) : undefined,
        quantity ? tr('quantity {quantity}', { quantity }) : undefined
      ].filter(Boolean).join(' - '),
      focus: false
    }
  },

  ExchangeRequestedTradeMessage: () => ({
    title: tr('Trade request'),
    focus: true
  }),

  NotificationByServerMessage: () => ({
    title: tr('Game notification'),
    focus: true
  })
}

const guiMatchers: Record<string, NotificationMatcher> = {
  GameFightTurnStartMessage: (raw, gameWindow) => {
    const msg = raw as FightTurnMessage
    if (msg.id !== getPlayerId(gameWindow)) return null

    return {
      title: tr('Your turn'),
      body: getPlayerName(gameWindow),
      focus: true
    }
  }
}

function addListener(
  source: EventSourceLike | undefined,
  eventName: string,
  handler: (...args: unknown[]) => void,
  cleanups: Array<() => void>
) {
  if (!source?.on) return

  source.on(eventName, handler)
  cleanups.push(() => {
    if (source.removeListener) {
      source.removeListener(eventName, handler)
      return
    }
    source.off?.(eventName, handler)
  })
}

function fireNotification(
  gameWindow: DofusWindow,
  tabId: string,
  callbacks: NotificationFocusCallbacks,
  payload: NotificationPayload
) {
  if (!callbacks.shouldNotify()) return

  const active = callbacks.isActiveTab(tabId)
  const focused = isWindowFocused(gameWindow)

  // Flag the tab even when it is not focused enough to interrupt the player:
  // a glance at the tab strip beats being yanked out of another account.
  if (!active) callbacks.markActivity(tabId)
  const shouldFocus = payload.focus !== false && !active
  const shouldShowNative = !active || !focused

  if (shouldFocus) {
    const now = Date.now()
    const last = lastFocusByTab.get(tabId) ?? 0
    if (now - last > FOCUS_DEBOUNCE_MS) {
      lastFocusByTab.set(tabId, now)
      callbacks.focusTab(tabId)
    }
  }

  if (shouldShowNative) {
    window.nememu.showNativeNotification({
      title: payload.title,
      body: payload.body,
      tabId
    })

    // The notification toast vanishes on its own; a flashing taskbar entry
    // waits for the player to come back.
    window.nememu.requestAttention()
  }
}

export function initNotificationFocus(
  gameWindow: DofusWindow,
  tabId: string,
  callbacks: NotificationFocusCallbacks
): () => void {
  const cleanups: Array<() => void> = []
  const connectionManager = gameWindow.dofus?.connectionManager as EventSourceLike | undefined
  const gui = gameWindow.gui as unknown as EventSourceLike | undefined

  // Losing the connection was invisible until now: a player who had alt-tabbed
  // came back to a dead window with no idea when it had died.
  addListener(connectionManager, 'disconnect', (rawReason) => {
    const reason = typeof rawReason === 'string' ? rawReason : ''
    if (DELIBERATE_DISCONNECTS.has(reason)) return

    callbacks.markDisconnected(tabId)
    window.nememu.logger.warn(`Disconnected from the game server (reason: ${reason || 'unknown'}).`)

    fireNotification(gameWindow, tabId, callbacks, {
      title: tr('Disconnected'),
      body: getPlayerName(gameWindow)
        ? tr('{name} lost the connection to the server.', { name: getPlayerName(gameWindow) as string })
        : tr('The connection to the server was lost.'),
      focus: true
    })
  }, cleanups)

  for (const [eventName, matcher] of Object.entries(connectionMatchers)) {
    addListener(connectionManager, eventName, (msg) => {
      const payload = matcher(msg, gameWindow)
      if (payload) fireNotification(gameWindow, tabId, callbacks, payload)
    }, cleanups)
  }

  for (const [eventName, matcher] of Object.entries(guiMatchers)) {
    addListener(gui, eventName, (msg) => {
      const payload = matcher(msg, gameWindow)
      if (payload) fireNotification(gameWindow, tabId, callbacks, payload)
    }, cleanups)
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
