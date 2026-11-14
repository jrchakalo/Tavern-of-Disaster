import { defineStore } from 'pinia';
import type { Ref, ComputedRef } from 'vue';
import { ref, computed } from 'vue';
import { tokenSizes } from '../types';
import type {
    IScene,
    ITable,
    IInitiativeEntry,
    GridSquare,
    TokenInfo,
    PlayerInfo,
    AuraInfo,
    SessionStateDTO,
    SceneDTO,
    TokenDTO,
    InitiativeEntryDTO,
    TableInfoDTO,
    MeasurementDTO,
    AuraDTO,
    DiceRolledPayload,
    LogEntry,
} from '../types';
import { currentUser } from '../services/authService';

const DEFAULT_GRID = 30;
const DEFAULT_METERS_PER_SQUARE = 1.5;
const LOG_CAP = 200;
type MeasurementShape = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
type PersistentMeasurement = {
    id: string;
    userId: string;
    username: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    distance: string;
    color: string;
    type?: MeasurementShape;
    affectedSquares?: string[];
    sceneId: string;
};
type IncomingPersistentMeasurement = Omit<PersistentMeasurement, 'sceneId'> & { sceneId?: string };
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

type TokenMovePayload = {
    tableId?: string;
    sceneId: string;
    tokenId: string;
    oldSquareId: string;
    squareId: string;
    remainingMovement?: number;
    movement?: number;
};

type TokenPatchPayload = {
    tableId?: string;
    sceneId?: string;
    tokenId: string;
    patch: Partial<TokenInfo>;
};

type TokensMovementResetPayload = {
    tableId?: string;
    sceneId: string;
    updates: Array<{ tokenId: string; remainingMovement: number; movement?: number }>;
};

type InitiativeEntryAddedPayload = {
    tableId?: string;
    sceneId: string;
    entry: InitiativeEntryDTO;
    order: string[];
};

type InitiativeEntryRemovedPayload = {
    tableId?: string;
    sceneId: string;
    entryId: string;
    order: string[];
};

type InitiativeEntryUpdatedPayload = {
    tableId?: string;
    sceneId: string;
    entryId: string;
    patch: Partial<IInitiativeEntry>;
};

type InitiativeOrderUpdatedPayload = {
    tableId?: string;
    sceneId: string;
    order: string[];
    currentTurnId?: string | null;
};

type InitiativeTurnAdvancedPayload = {
    tableId?: string;
    sceneId: string;
    currentEntryId: string;
    previousEntryId?: string;
    newRound?: boolean;
};

function isTokenSizeValue(value: string): value is TokenInfo['size'] {
    return (tokenSizes as readonly string[]).includes(value);
}

function normalizeSceneType(type?: string): 'battlemap' | 'image' {
    return type === 'image' ? 'image' : 'battlemap';
}

function mapTableDTO(dto: TableInfoDTO): ITable {
    return {
        _id: dto._id,
        name: dto.name,
        dm: dto.dm,
        players: dto.players,
        inviteCode: dto.inviteCode,
        status: dto.status,
        activeSceneId: dto.activeSceneId ?? null,
        pauseUntil: dto.pauseUntil,
        systemId: dto.systemId ?? null,
        systemKey: dto.systemKey ?? null,
        systemName: dto.systemName ?? null,
    };
}

function mapSceneDTO(dto: SceneDTO): IScene {
    return {
        _id: dto._id,
        tableId: dto.tableId,
        name: dto.name,
        imageUrl: dto.imageUrl,
        gridWidth: dto.gridWidth ?? DEFAULT_GRID,
        gridHeight: dto.gridHeight ?? DEFAULT_GRID,
        type: normalizeSceneType(dto.type),
        initiative: [],
        metersPerSquare: dto.metersPerSquare ?? DEFAULT_METERS_PER_SQUARE,
    };
}

function toTokenSize(value: string): TokenInfo['size'] {
    return isTokenSizeValue(value) ? value : 'Pequeno/Médio';
}

function mapTokenDTO(dto: TokenDTO): TokenInfo {
    return {
        _id: dto._id,
        tableId: dto.tableId,
        squareId: dto.squareId,
        color: dto.color,
        ownerId: dto.owner,
        name: dto.name,
        imageUrl: dto.imageUrl,
        sceneId: dto.sceneId || '',
        movement: dto.movement,
        remainingMovement: dto.remainingMovement,
        size: toTokenSize(dto.size),
        canOverlap: dto.canOverlap,
        characterId: dto.characterId ?? null,
    };
}

function mapInitiativeDTO(dto: InitiativeEntryDTO): IInitiativeEntry {
    return {
        _id: dto._id,
        characterName: dto.characterName,
        tokenId: dto.tokenId,
        characterId: dto.characterId,
        isCurrentTurn: dto.isCurrentTurn,
    };
}

function mapMeasurementDTO(dto: MeasurementDTO): PersistentMeasurement {
    return {
        id: dto.id ?? `${dto.userId}-${dto.sceneId}`,
        userId: dto.userId,
        username: dto.username,
        start: dto.start,
        end: dto.end,
        distance: dto.distance,
        color: dto.color,
        type: dto.type,
        affectedSquares: dto.affectedSquares,
        sceneId: dto.sceneId,
    };
}

function mapAuraDTO(dto: AuraDTO): AuraInfo {
    return {
        id: dto.id,
        tokenId: dto.tokenId,
        tableId: dto.tableId,
        sceneId: dto.sceneId,
        name: dto.name,
        color: dto.color,
        radiusMeters: dto.radiusMeters,
        ownerId: dto.ownerId,
        difficultTerrain: dto.difficultTerrain,
    };
}

export const useTableStore = defineStore('table', () => {
    // STATE
    const currentTable: Ref<ITable | null> = ref(null);
    const scenes: Ref<IScene[]> = ref([]);
    const activeSceneId: Ref<string | null> = ref(null);
    const initiativeList: Ref<IInitiativeEntry[]> = ref([]);
    const squares: Ref<GridSquare[]> = ref([]);
    const gridWidth: Ref<number> = ref(30); // Largura (colunas)
    const gridHeight: Ref<number> = ref(30); // Altura (linhas)
    const sessionStatus: Ref<'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'> = ref('PREPARING');
    const pauseUntil: Ref<Date | null> = ref(null);
    const connectionStatus: Ref<ConnectionStatus> = ref('disconnected');
    // Transição curta antes do LIVE
    const transitionMs: Ref<number> = ref(0);
    const transitionAt: Ref<number> = ref(0);
    const currentMapUrl: Ref<string | null> = ref(null);
    const metersPerSquare: Ref<number> = ref(1.5);
    // Diferença entre o relógio do servidor e do cliente
    const clockSkewMs: Ref<number> = ref(0);
    // Pings efêmeros
    const pings: Ref<Array<{ id: string; userId: string; username: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string; ts: number }>> = ref([]); // Efeito visual transitório
    // Auras ancoradas a tokens (por cena)
    const auras: Ref<AuraInfo[]> = ref([]); // Auras persistentes ancoradas a tokens
    // Medições compartilhadas: chave = userId, valor = Measurement
    const sharedMeasurements: Ref<Record<string, {
        userId: string;
        username: string;
        start: { x: number; y: number };
        end: { x: number; y: number };
        distance: string; // "Xm (Yft)"
        color: string;
    type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
        affectedSquares?: string[];
    }>> = ref({});

    // Cores preferidas de medição por usuário (fallback quando servidor não ecoa a cor)
    const userMeasurementColors: Ref<Record<string, string>> = ref({}); // Preferência local de cor

        // Medições persistentes (lista) – não são limpas ao mudar de turno
    const persistentMeasurements: Ref<PersistentMeasurement[]> = ref([]);
    const logs: Ref<LogEntry[]> = ref([]);
    const diceAnimationHook: Ref<((payload: DiceRolledPayload) => void) | null> = ref(null);

    function setScenesFromDTO(sceneDtos: SceneDTO[]) {
        scenes.value = sceneDtos.map(mapSceneDTO);
    }

    function setInitiativeFromDTO(entries: InitiativeEntryDTO[]) {
        initiativeList.value = entries.map(mapInitiativeDTO);
    }

    // GETTERS
    const isDM: ComputedRef<boolean> = computed(() => {
      return currentUser.value?.id === currentTable.value?.dm._id;
    });

    const activeScene = computed(() => {
        return scenes.value.find(s => s._id === activeSceneId.value) || null;
    });

    const tokensOnMap = computed(() => 
    squares.value
        .map(sq => sq.token)
        .filter((token): token is TokenInfo => token !== null && token !== undefined)
    );

    const currentTurnTokenId = computed(() => {
        const currentEntry = initiativeList.value.find(entry => entry.isCurrentTurn);
        return currentEntry?.tokenId || null;
    });

    const myActiveToken = computed(() => {
        const activeEntry = initiativeList.value.find(entry => entry.isCurrentTurn);
        if (!activeEntry || !activeEntry.tokenId) return null;
        const tokenOnBoard = squares.value
            .map(sq => sq.token)
            .find(token => token?._id === activeEntry.tokenId);
        if (tokenOnBoard && tokenOnBoard.ownerId?._id === currentUser.value?.id) {
            return tokenOnBoard;
        }

        return null;
    });

    //ACTIONS
    function _rebuildGridRectangular(width: number, height: number, tokens: TokenInfo[]) {
        const total = width * height;
        const newSquares: GridSquare[] = new Array(total).fill(null).map((_, i) => ({ id: `sq-${i}`, token: null }));
        tokens.forEach(token => {
            const square = newSquares.find(s => s.id === token.squareId);
            if (square) square.token = token;
        });
        squares.value = newSquares;
    }

    function setPersistentsFromDTO(items: MeasurementDTO[], sceneId: string | null) {
        if (!sceneId) {
            persistentMeasurements.value = [];
            return;
        }
        persistentMeasurements.value = items
            .filter(item => item.sceneId === sceneId)
            .map(mapMeasurementDTO);
    }

    function setAurasFromDTO(items: AuraDTO[], sceneId: string | null) {
        if (!sceneId) {
            auras.value = [];
            return;
        }
        auras.value = items
            .filter(item => item.sceneId === sceneId)
            .map(mapAuraDTO);
    }

    function applySessionSnapshot(snapshot: SessionStateDTO) {
        currentTable.value = mapTableDTO(snapshot.table);
        scenes.value = snapshot.scenes.map(mapSceneDTO);
        const nextActiveSceneId = snapshot.activeScene?._id || snapshot.table.activeSceneId || null;
        activeSceneId.value = nextActiveSceneId;
        currentMapUrl.value = snapshot.activeScene?.imageUrl || null;
        const derivedGridWidth = snapshot.activeScene?.gridWidth ?? DEFAULT_GRID;
        const derivedGridHeight = snapshot.activeScene?.gridHeight ?? DEFAULT_GRID;
        gridWidth.value = derivedGridWidth;
        gridHeight.value = derivedGridHeight;
        metersPerSquare.value = snapshot.activeScene?.metersPerSquare ?? DEFAULT_METERS_PER_SQUARE;
        sessionStatus.value = snapshot.table.status;
        pauseUntil.value = snapshot.table.pauseUntil ? new Date(snapshot.table.pauseUntil) : null;
        const mappedTokens = snapshot.tokens.map(mapTokenDTO);
        _rebuildGridRectangular(derivedGridWidth, derivedGridHeight, mappedTokens);
        initiativeList.value = snapshot.initiative.map(mapInitiativeDTO);
        setPersistentsFromDTO(snapshot.measurements, nextActiveSceneId);
        setAurasFromDTO(snapshot.auras, nextActiveSceneId);
        return nextActiveSceneId;
    }

    function setInitialState(snapshot: SessionStateDTO) {
        applySessionSnapshot(snapshot);
        sharedMeasurements.value = {};
        pings.value = [];
    }

    function setConnectionStatus(status: ConnectionStatus) {
        connectionStatus.value = status;
    }

    function createLogId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function addLogEntry(entry: LogEntry) {
        const trimmed = logs.value.slice(- (LOG_CAP - 1));
        logs.value = [...trimmed, entry];
    }

    function clearLogs() {
        logs.value = [];
    }

    function buildRollLogEntry(payload: DiceRolledPayload): LogEntry {
        const label = payload.metadata || payload.tags?.[0] || 'Rolagem';
        const rollsDisplay = payload.rolls.length
            ? payload.rolls.map(r => r.kept === 'kept' ? `${r.value}` : `(${r.value})`).join(', ')
            : '—';
        const modifierText = payload.modifier === 0
            ? ''
            : payload.modifier > 0
                ? ` + ${payload.modifier}`
                : ` - ${Math.abs(payload.modifier)}`;
        const detail = `${payload.expression} → [${rollsDisplay}]${modifierText} = ${payload.total}`;
        return {
            id: createLogId(),
            type: 'roll',
            authorId: payload.userId,
            authorName: payload.username,
            createdAt: payload.createdAt,
            content: `${label}: ${detail}`,
            raw: payload,
        };
    }

    function handleDiceRoll(payload: DiceRolledPayload) {
        addLogEntry(buildRollLogEntry(payload));
        if (payload.userId === currentUser.value?.id) {
            diceAnimationHook.value?.(payload);
        }
    }

    function registerDiceAnimationHook(handler: ((payload: DiceRolledPayload) => void) | null) {
        diceAnimationHook.value = handler;
    }

    function updateSessionState(snapshot: SessionStateDTO) {
        const previousSceneId = activeSceneId.value;
        const newSceneId = applySessionSnapshot(snapshot);
        if (previousSceneId !== newSceneId) {
            sharedMeasurements.value = {};
            pings.value = [];
            logs.value = [];
        }
    }

    function placeToken(newToken: TokenInfo) {
        if (newToken.sceneId === activeSceneId.value) {
        const squareToUpdate = squares.value.find(sq => sq.id === newToken.squareId);
        if (squareToUpdate) squareToUpdate.token = newToken;
        }
    }

    function moveToken(moved: TokenMovePayload) {
        if (moved.sceneId !== activeSceneId.value) return;
        let oldSquare = squares.value.find((sq) => sq.id === moved.oldSquareId);
        if (!oldSquare) {
            oldSquare = squares.value.find((sq) => sq.token?._id === moved.tokenId);
        }
        const token = oldSquare?.token;
        if (!token) return;
        oldSquare!.token = null;
        token.squareId = moved.squareId;
        if (typeof moved.remainingMovement === 'number') {
            token.remainingMovement = moved.remainingMovement;
        }
        if (typeof moved.movement === 'number') {
            token.movement = moved.movement;
        }
        const newSquare = squares.value.find((sq) => sq.id === moved.squareId);
        if (newSquare) {
            newSquare.token = token;
        }
    }

    function removeToken(tokenId: string) {
        const squareWithToken = squares.value.find(sq => sq.token?._id === tokenId);
        if (squareWithToken) squareWithToken.token = null;
    // Remove aura se ancorada ao token retirado
    auras.value = auras.value.filter(a => a.tokenId !== tokenId);
    }

    function updateTokenOwner(tokenId: string, newOwner: PlayerInfo) {
        const token = tokensOnMap.value.find(t => t._id === tokenId);
        if (token) {
        token.ownerId = newOwner;
        }
    }

    function applyTokenUpdate(payload: TokenPatchPayload) {
        const square = squares.value.find((sq) => sq.token?._id === payload.tokenId);
        if (!square || !square.token) return;
        Object.assign(square.token, payload.patch);
    }

    function applyTokensMovementReset(payload: TokensMovementResetPayload) {
        if (payload.sceneId !== activeSceneId.value) return;
        payload.updates.forEach((item) => {
            const tokenSquare = squares.value.find((sq) => sq.token?._id === item.tokenId);
            if (!tokenSquare?.token) return;
            tokenSquare.token.remainingMovement = item.remainingMovement;
            if (typeof item.movement === 'number') {
                tokenSquare.token.movement = item.movement;
            }
        });
    }

    // Ação para o evento de reset de rodada
    function updateAllTokens(updatedTokens: TokenInfo[]) {
        updatedTokens.forEach(updatedToken => {
        const tokenOnGrid = tokensOnMap.value.find(t => t._id === updatedToken._id);
        if (tokenOnGrid) {
            Object.assign(tokenOnGrid, updatedToken);
        }
        });
    }

    // Medições compartilhadas
    function upsertSharedMeasurement(m: { userId: string; username: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square'; affectedSquares?: string[] }) {
        sharedMeasurements.value = { ...sharedMeasurements.value, [m.userId]: m };
    }
    function removeSharedMeasurement(userId: string) {
        if (sharedMeasurements.value[userId]) {
            const clone = { ...sharedMeasurements.value };
            delete clone[userId];
            sharedMeasurements.value = clone;
        }
    }
    function clearSharedMeasurements() { sharedMeasurements.value = {}; }

    // Preferências de cor
    function setUserMeasurementColor(userId: string, color: string) {
        if (!userId || !color) return;
        userMeasurementColors.value = { ...userMeasurementColors.value, [userId]: color };
    }
    function getUserMeasurementColor(userId: string): string | undefined { return userMeasurementColors.value[userId]; }

    // --- Auras ---
    function setAurasForScene(sceneId: string, items: AuraInfo[]) {
        if (sceneId === activeSceneId.value) {
            auras.value = items;
        }
    }
    function upsertAuraLocal(a: AuraInfo) {
        if (a.sceneId !== activeSceneId.value) return;
        const idx = auras.value.findIndex(x => x.tokenId === a.tokenId);
        if (idx >= 0) auras.value[idx] = a; else auras.value.push(a);
        auras.value = [...auras.value];
    }
    function removeAuraLocal(tokenId: string) {
        auras.value = auras.value.filter(a => a.tokenId !== tokenId);
    }

        // Persistentes
    function addPersistentMeasurement(m: PersistentMeasurement) {
            // Garante vínculo à cena ativa
            if (m.sceneId === activeSceneId.value) {
                persistentMeasurements.value = [...persistentMeasurements.value, m];
            }
        }
        function removePersistentMeasurement(id: string) {
            persistentMeasurements.value = persistentMeasurements.value.filter(pm => pm.id !== id);
        }
        function clearPersistentMeasurementsForScene(sceneId: string) {
            persistentMeasurements.value = persistentMeasurements.value.filter(pm => pm.sceneId !== sceneId);
        }
    function setPersistentMeasurementsForScene(sceneId: string, items: IncomingPersistentMeasurement[]) {
            // Normaliza sceneId ausente (defesa contra payload incompleto do servidor)
            const normalized: PersistentMeasurement[] = items.map(i => ({ ...i, sceneId: i.sceneId || sceneId }));
            const others = persistentMeasurements.value.filter(pm => pm.sceneId !== sceneId);
            const currentForScene = persistentMeasurements.value.filter(pm => pm.sceneId === sceneId);
            // Se lista recebida é vazia e já temos itens, não sobrescreve (evita wipe indevido por corrida)
            const replacement = normalized.filter(i => i.sceneId === sceneId);
            const finalForScene = (replacement.length === 0 && currentForScene.length > 0) ? currentForScene : replacement;
            persistentMeasurements.value = [...others, ...finalForScene];
        }

    function setCurrentTurnEntry(entryId?: string | null) {
        if (entryId === undefined) return;
        let changed = false;
        initiativeList.value.forEach((entry) => {
            const shouldBeCurrent = entryId !== null && entry._id === entryId;
            if (entry.isCurrentTurn !== shouldBeCurrent) {
                entry.isCurrentTurn = shouldBeCurrent;
                changed = true;
            }
        });
        if (changed) {
            initiativeList.value = [...initiativeList.value];
        }
    }

    function reorderInitiativeList(order: string[] | undefined | null, currentTurnId?: string | null) {
        if (!order || order.length === 0) {
            setCurrentTurnEntry(currentTurnId);
            return;
        }
        const byId = new Map(initiativeList.value.map((entry) => [entry._id, entry]));
        const reordered: IInitiativeEntry[] = [];
        order.forEach((id) => {
            const entry = byId.get(id);
            if (entry) reordered.push(entry);
        });
        initiativeList.value.forEach((entry) => {
            if (!order.includes(entry._id)) {
                reordered.push(entry);
            }
        });
        initiativeList.value = reordered;
        setCurrentTurnEntry(currentTurnId);
    }

    function handleInitiativeEntryAdded(payload: InitiativeEntryAddedPayload) {
        if (payload.sceneId !== activeSceneId.value) return;
        const mapped = mapInitiativeDTO(payload.entry);
        const withoutEntry = initiativeList.value.filter((entry) => entry._id !== mapped._id);
        initiativeList.value = [...withoutEntry, mapped];
        reorderInitiativeList(payload.order, mapped.isCurrentTurn ? mapped._id : undefined);
    }

    function handleInitiativeEntryRemoved(payload: InitiativeEntryRemovedPayload) {
        if (payload.sceneId !== activeSceneId.value) return;
        initiativeList.value = initiativeList.value.filter((entry) => entry._id !== payload.entryId);
        reorderInitiativeList(payload.order);
    }

    function handleInitiativeEntryUpdated(payload: InitiativeEntryUpdatedPayload) {
        if (payload.sceneId !== activeSceneId.value) return;
        const entry = initiativeList.value.find((item) => item._id === payload.entryId);
        if (!entry) return;
        Object.assign(entry, payload.patch);
        initiativeList.value = [...initiativeList.value];
        if (payload.patch.isCurrentTurn !== undefined) {
            setCurrentTurnEntry(payload.patch.isCurrentTurn ? entry._id : null);
        }
    }

    function handleInitiativeOrderUpdated(payload: InitiativeOrderUpdatedPayload) {
        if (payload.sceneId !== activeSceneId.value) return;
        reorderInitiativeList(payload.order, payload.currentTurnId ?? undefined);
    }

    function handleInitiativeTurnAdvanced(payload: InitiativeTurnAdvancedPayload) {
        if (payload.sceneId !== activeSceneId.value) return;
        setCurrentTurnEntry(payload.currentEntryId);
    }

    function handleInitiativeReset(sceneId: string) {
        if (sceneId !== activeSceneId.value) return;
        initiativeList.value = [];
    }

    function updateSceneScale(sceneId: string, newScale: number) {
        const scene = scenes.value.find(s => s._id === sceneId);
        if (scene) scene.metersPerSquare = newScale;
        if (sceneId === activeSceneId.value) metersPerSquare.value = newScale;
    }

    // Pings
    function addPing(p: { id: string; userId: string; username: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string; ts: number }) {
        if (p.sceneId !== activeSceneId.value) return;
        pings.value.push(p);
    // Auto remove em ~1.1s (sincronizado com animação CSS)
    setTimeout(() => { pings.value = pings.value.filter(x => x.id !== p.id); }, 1100);
    }
    function clearPings() { pings.value = []; }

    return {
        // State
        currentTable,
        scenes,
        activeSceneId,
        initiativeList,
        squares,
    gridWidth,
    gridHeight,
        sessionStatus,
        pauseUntil,
        transitionMs,
        transitionAt,
        currentMapUrl,
        sharedMeasurements,
    userMeasurementColors,
    persistentMeasurements,
    metersPerSquare,
    auras,
    pings,
    clockSkewMs,
        // Getters
        isDM,
        activeScene,
        tokensOnMap,
        currentTurnTokenId,
        myActiveToken,
        // Actions
        setInitialState,
        updateSessionState,
        placeToken,
        moveToken,
        removeToken,
        updateTokenOwner,
    applyTokenUpdate,
    applyTokensMovementReset,
        updateAllTokens,
        upsertSharedMeasurement,
        removeSharedMeasurement,
    clearSharedMeasurements,
    logs,
    addLogEntry,
    clearLogs,
    buildRollLogEntry,
    handleDiceRoll,
    registerDiceAnimationHook,
    setUserMeasurementColor,
    getUserMeasurementColor,
    updateSceneScale,
    // Auras
    setAurasForScene,
    upsertAuraLocal,
    removeAuraLocal,
    addPersistentMeasurement,
    removePersistentMeasurement,
    clearPersistentMeasurementsForScene,
    setPersistentMeasurementsForScene,
    addPing,
    clearPings,
    setScenesFromDTO,
    setInitiativeFromDTO,
    handleInitiativeEntryAdded,
    handleInitiativeEntryRemoved,
    handleInitiativeEntryUpdated,
    handleInitiativeOrderUpdated,
    handleInitiativeTurnAdvanced,
    handleInitiativeReset,
        connectionStatus,
        setConnectionStatus,
    };
});