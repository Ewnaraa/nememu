import type { DofusWindow } from '@/types/dofus-window'
import type { AutoGroupState } from '@nememu/shared'

const MAP_CHANGE_TIMEOUT = 15000

interface AutoGroupCallbacks {
  onLeaderMapChange: (mapId: number, position: { x: number; y: number }) => void
  onFollowerMoved: (tabId: string, mapId: number) => void
}

interface ConnectionManagerLike {
  on: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void
}

interface CurrentMapMessage {
  mapId: number
}

/**
 * Every disposer handed out, so `destroyAutoGroup` can tear the whole feature
 * down at once. `initAutoGroup` must NOT clear this: it is called once per game
 * window in a loop, and clearing here made each call unregister the previous
 * window — only the last tab ever stayed wired up, which is why auto-group
 * never worked past a single follower.
 */
const listeners: Array<() => void> = []

export function initAutoGroup(
  gameWindow: DofusWindow,
  tabId: string,
  state: AutoGroupState,
  callbacks: AutoGroupCallbacks
): () => void {
  if (!state.enabled) return () => {}

  const connectionManager = gameWindow.dofus.connectionManager as ConnectionManagerLike

  if (tabId === state.leaderTabId) {
    return initLeader(connectionManager, callbacks)
  }

  if (state.followerTabIds.includes(tabId)) {
    return initFollower(gameWindow, connectionManager, tabId, state, callbacks)
  }

  return () => {}
}

function register(dispose: () => void): () => void {
  let disposed = false

  const wrapped = () => {
    if (disposed) return
    disposed = true
    dispose()
    const index = listeners.indexOf(wrapped)
    if (index !== -1) listeners.splice(index, 1)
  }

  listeners.push(wrapped)
  return wrapped
}

function initLeader(
  connectionManager: ConnectionManagerLike,
  callbacks: AutoGroupCallbacks
): () => void {
  const onCurrentMap = (...args: unknown[]) => {
    const msg = args[0] as CurrentMapMessage
    if (!msg || !msg.mapId) return
    callbacks.onLeaderMapChange(msg.mapId, { x: 0, y: 0 })
  }

  connectionManager.on('CurrentMapMessage', onCurrentMap)

  return register(() => {
    connectionManager.removeListener('CurrentMapMessage', onCurrentMap)
  })
}

function initFollower(
  gameWindow: DofusWindow,
  connectionManager: ConnectionManagerLike,
  tabId: string,
  state: AutoGroupState,
  callbacks: AutoGroupCallbacks
): () => void {
  let isMoving = false
  let pendingMapId: number | null = null

  const moveToMap = (targetMapId: number) => {
    if (isMoving) {
      pendingMapId = targetMapId
      return
    }

    isMoving = true

    try {
      const isoEngine = gameWindow.isoEngine as Record<string, unknown>
      const mapRenderer = isoEngine.mapRenderer as Record<string, unknown>
      const currentMapId = mapRenderer.mapId as number

      if (currentMapId === targetMapId) {
        isMoving = false
        callbacks.onFollowerMoved(tabId, targetMapId)
        return
      }

      const dofus = gameWindow.dofus as Record<string, (...args: unknown[]) => void>
      if (typeof dofus.sendMessage === 'function') {
        dofus.sendMessage('ChangeMapMessage', { mapId: targetMapId })
      }

      const onMapChanged = () => {
        connectionManager.removeListener('CurrentMapMessage', onMapChanged)
        isMoving = false
        callbacks.onFollowerMoved(tabId, targetMapId)

        if (pendingMapId !== null && pendingMapId !== targetMapId) {
          const next = pendingMapId
          pendingMapId = null
          moveToMap(next)
        }
      }

      connectionManager.on('CurrentMapMessage', onMapChanged)

      setTimeout(() => {
        if (isMoving) {
          connectionManager.removeListener('CurrentMapMessage', onMapChanged)
          isMoving = false
        }
      }, MAP_CHANGE_TIMEOUT)
    } catch {
      isMoving = false
    }
  }

  const channel = new BroadcastChannel('nememu-autogroup')

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type: string; mapId: number }
    if (data.type === 'leader-map-change' && data.mapId) {
      moveToMap(data.mapId)
    }
  }

  channel.addEventListener('message', onMessage)

  return register(() => {
    channel.removeEventListener('message', onMessage)
    channel.close()
  })
}

export function broadcastLeaderPosition(mapId: number, position: { x: number; y: number }) {
  try {
    const channel = new BroadcastChannel('nememu-autogroup')
    channel.postMessage({
      type: 'leader-map-change',
      mapId,
      position
    })
    channel.close()
  } catch {}
}

export function sendPartyInvite(gameWindow: DofusWindow, targetName: string): void {
  try {
    const dofus = gameWindow.dofus as Record<string, (...args: unknown[]) => void>
    if (typeof dofus.sendMessage === 'function') {
      dofus.sendMessage('PartyInvitationRequestMessage', { name: targetName })
    }
  } catch (e) {
    window.nememu?.logger.error('Failed to send party invite:', e)
  }
}

export function autoAcceptPartyInvite(gameWindow: DofusWindow, leaderName: string): () => void {
  const connectionManager = gameWindow.dofus.connectionManager as ConnectionManagerLike

  const onInvitation = (...args: unknown[]) => {
    const msg = args[0] as { partyId?: number; fromName?: string }
    if (msg?.fromName === leaderName && msg?.partyId) {
      const dofus = gameWindow.dofus as Record<string, (...args: unknown[]) => void>
      if (typeof dofus.sendMessage === 'function') {
        dofus.sendMessage('PartyAcceptInvitationMessage', { partyId: msg.partyId })
      }
    }
  }

  connectionManager.on('PartyInvitationMessage', onInvitation)

  return register(() => {
    connectionManager.removeListener('PartyInvitationMessage', onInvitation)
  })
}

export function destroyAutoGroup() {
  // Copied first: each disposer removes itself from the list as it runs.
  for (const dispose of [...listeners]) {
    dispose()
  }
  listeners.length = 0
}
