/** The four map edges, named as the game names them. */
export type MapDirection = 'left' | 'right' | 'top' | 'bottom'

export interface DofusWindow extends Window {
  initDofus: (callback: () => void) => void
  openDatabase: unknown
  dofus: {
    connectionManager: unknown
    login: (cb: (err: unknown, state: { disconnected?: boolean }) => void) => void
    disconnect: () => void
    setCredentials: (accountId: string, token: string, forced: string) => void
    start: () => void
  }
  gui: {
    loginScreen: {
      _login: (opts: { accessKey: string; refreshKey: string; save: boolean }) => void
      displayAppropriateForm: () => void
    }
    splashScreen: { show: () => void; hide: () => void }
    /**
     * `activate()` opens the chat and focuses its input; `active` is the state.
     * The input is a real textarea, so once it has focus the hotkey layer stays
     * out of the way and Enter reaches the game to send the message.
     */
    chat?: {
      active?: boolean
      activate?: () => void
      deactivate?: () => void
    } & Record<string, unknown>
    backgroundScreen: unknown
    playerData: {
      setForcedAccount: (v: string) => void
      setLoginName: (v: string) => void
    }
    _resizeUi: () => void
    initializeAfterLogin: (cb: (err: unknown) => void) => void
    isConnected: () => boolean
    initialize: () => void
    windowsContainer: { rootElement: HTMLElement }
    on: (event: string, cb: (...args: unknown[]) => void) => void
    emit: (event: string, ...args: unknown[]) => void
    openSimplePopup: (text: string) => void
    getText: (key: string) => string

    // Combat control surfaces, verified against the shipped game build.
    timeline?: {
      fightControlButtons?: {
        toggleReadyForFight?: () => void
        /**
         * The game's own answer to "is pressing ready valid right now": it
         * checks the fight state, the button's visibility, and the tutorial
         * lock. `toggleReadyForFight` itself checks none of that.
         */
        isReadyForFightButtonVisible?: () => boolean
      }
    }
    fightManager?: {
      isInBattle?: () => boolean
      isFightersTurn?: (fighterId: number) => boolean
      getIsTurnEndRequestPending?: () => boolean
      finishTurn?: () => void
    }
    shortcutBarManager?: {
      shortcutBars?: {
        playerBar?: SpellBar
      }
    }
    /** The bottom control bar; its buttons own the display toggles. */
    mainControls?: Record<string, unknown>
    mapCoordinateDisplay?: { setMapInfoVisibility?: (visible: boolean) => void }
  }
  isoEngine: {
    /**
     * Walks the character to a map-change cell and crosses over — the exact
     * method the game's own tap and swipe gestures call, queued through
     * `actionQueue` like any other player action.
     */
    gotoNeighbourMap?: (
      direction: MapDirection,
      cellId: number,
      canvasX?: number,
      canvasY?: number
    ) => void
    mapRenderer: {
      isReady?: boolean
      mapId?: number
      getChangeMapFlags?: (cellId: number) => Partial<Record<MapDirection, boolean>>
    } & Record<string, unknown>
    actorManager: {
      setCreatureMode?: (enabled: boolean) => void
      setTransparentMode?: (enabled: boolean) => void
    } & Record<string, unknown>
    tacticalMode?: { show?: () => void; hide?: () => void }
    interactiveBlink?: boolean
    setInteractiveBlink?: (enabled: boolean) => void
    highlightInteractivesWithDifferentType?: () => void
  }
  /** `userId` is the player's own fighter id, used to tell whose turn it is. */
  actorManager: {
    userId?: number
    areNicknamesOn?: () => boolean
    turnNicknamesOn?: () => void
    turnNicknamesOff?: () => void
  } & Record<string, unknown>
  foreground?: {
    showAllMonsterGroupAndNpcTooltips?: () => void
    removeAllMonsterGroupAndNpcTooltips?: () => void
  }
  Config: {
    language: string
    assetsUrl: string
    dataUrl: string
    [key: string]: unknown
  }
  singletons: {
    /** Webpack module cache, exposed by a regex patch in regex.json. */
    c: Array<{ exports: { prototype: Record<string, unknown> } & Record<string, unknown> }>
  }
  $game_id: string
  $appSchemeLinkCalled: (payload: string) => void
  $_authManager: {
    requestWebAuthToken: (
      code: string,
      cb: (err: unknown, accessKey: string, refreshKey: string) => void
    ) => void
    account?: unknown
    getHaapiKeyManager?: () => HaapiKeyManager
  }
  $_haapiModule: {
    getHaapiKeyManager: () => HaapiKeyManager
    loginWithHaapiKey?: (...args: unknown[]) => void
    account?: unknown
    $_touchEmuPatched?: boolean
  }
  $_haapiAccount: {
    createToken: (params: Record<string, unknown>, cb: (err: unknown, res: unknown) => void) => void
    createTokenWithCertificate?: (cb: (err: unknown, res: unknown) => void) => void
  }
  $_haapiKeyManager: HaapiKeyManager

  // Injected by packages/main/scripts/helper-attach.js once the game is up.
  $_getHaapiKey?: () => { key: string; refreshToken: string } | null
  $_setLoginName?: (name: string) => void
  $_primeHaapiKey?: (
    apiKey: string,
    refreshKey: string,
    accountId: number | null,
    certificateId: string,
    certificateHash: string
  ) => void
  $_haapiDirectLogin?: (
    opts: {
      apiKey: string
      refreshKey: string
      accountId: number | null
      certificateId: string
      certificateHash: string
      save?: boolean
      params?: Record<string, unknown>
    },
    cb: (err: unknown, res: unknown) => void
  ) => void
  $_finishDirectLogin?: (options: { token: string; loginName?: string; forcedAccount?: string }) => void
}

/** The player's shortcut bar; `_selectSlot` is what a tap on a spell calls. */
export interface SpellBar {
  openPanel?: (panel: string) => void
  getSpellSlotByIndex?: (index: number) => SpellSlot | null | undefined
  _selectSlot?: (slot: SpellSlot, clearSpellDisplay: boolean) => void
  isOrganizing?: boolean
}

export interface SpellSlot {
  isEmpty?: () => boolean
  data?: { id?: number }
}

/** The game's window manager, reached through the exposed webpack module cache. */
export interface GameWindowManager {
  getWindow: (id: string) => unknown
  closeAll: () => void
  addWindow: (...args: unknown[]) => unknown
  /** Opens a closed window, focuses a background one, closes the focused one. */
  switch?: (id: string, params?: unknown) => void
}

export interface HaapiKeyManager {
  setHaapiKey: (key: string, refresh: string, opts?: { save?: boolean }) => void
  getHaapiKey: () => { key: string; refreshToken: string } | null
  setHaapiAccountId: (id: number, opts?: { save?: boolean }) => void
  getHaapiAccountId: () => number | null
  $_touchEmuApiKeyOnlyPatch?: boolean
}

export interface HTMLIFrameElementWithDofus extends HTMLIFrameElement {
  contentWindow: DofusWindow
}
