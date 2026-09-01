import type { DofusWindow, MapDirection } from '@/types/dofus-window'

/**
 * Changing map with the arrow keys.
 *
 * Dofus Touch already lets you change map by swiping toward an edge: the
 * gesture ends by calling `isoEngine.gotoNeighbourMap`, which queues a
 * `changeMap` action and walks the character to the edge cell before crossing.
 * This binds the same call to a key, so the keyboard gets what the touch client
 * already offers the finger — one press equals one swipe.
 *
 * It deliberately goes through that method rather than sending the protocol's
 * `ChangeMapMessage` directly. The message is what the game sends once the
 * character has *arrived*; firing it from a key would skip the walk entirely,
 * which is a different thing from a shortcut. The character here walks the whole
 * way, at the same speed, and the move can be interrupted like any other.
 */

/** Dofus maps are a fixed 14×40 grid. */
const MAP_CELL_COUNT = 560

export function changeMapDirection(gameWindow: DofusWindow, direction: MapDirection): boolean {
  const iso = gameWindow.isoEngine
  const renderer = iso?.mapRenderer

  if (typeof iso?.gotoNeighbourMap !== 'function') {
    window.nememu.logger.warn('Map travel: the game exposes no gotoNeighbourMap.')
    return false
  }

  if (typeof renderer?.getChangeMapFlags !== 'function') {
    window.nememu.logger.warn('Map travel: the map renderer exposes no getChangeMapFlags.')
    return false
  }

  if (renderer.isReady === false) return false

  const cellId = findEdgeCell(renderer, direction)
  if (cellId === null) {
    // Not every map has an exit on every side — a dead end is a normal answer,
    // not a failure, so it stays quiet.
    return false
  }

  try {
    iso.gotoNeighbourMap(direction, cellId)
    return true
  } catch (err) {
    window.nememu.logger.warn(`Map travel: could not head ${direction}`, err)
    return false
  }
}

/**
 * The first cell of the map flagged as an exit on that side.
 *
 * The game picks the cell under the swipe; with a key there is no pointer, so
 * any flagged cell will do — the game's own pathfinding walks there.
 *
 * `getChangeMapFlags` MUST be called as a method: it reads `this.map` and
 * `this.mapId` internally, so a detached reference throws on every cell. That
 * mistake is invisible from the outside — 560 swallowed exceptions look exactly
 * like a map with no exit at all — which is why a run that never once succeeded
 * is reported instead of being silently treated as a dead end.
 */
function findEdgeCell(
  renderer: NonNullable<DofusWindow['isoEngine']>['mapRenderer'],
  direction: MapDirection
): number | null {
  const getFlags = renderer.getChangeMapFlags
  if (typeof getFlags !== 'function') return null

  let answered = false

  for (let cellId = 0; cellId < MAP_CELL_COUNT; cellId += 1) {
    try {
      const flags = getFlags.call(renderer, cellId)
      answered = true
      if (flags?.[direction]) return cellId
    } catch {
      // A single malformed cell is not worth aborting the scan for.
    }
  }

  if (!answered) {
    window.nememu.logger.warn(
      'Map travel: getChangeMapFlags failed on every cell — the map data is not readable.'
    )
  }

  return null
}
