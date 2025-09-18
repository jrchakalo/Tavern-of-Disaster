import { defineStore } from 'pinia';
import type { Ref, ComputedRef } from 'vue';
import { ref, computed } from 'vue';
import type { IScene, ITable, IInitiativeEntry, GridSquare, TokenInfo, PlayerInfo, AuraInfo } from '../types';
import { currentUser } from '../services/authService';

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
    const persistentMeasurements: Ref<Array<{
            id: string;
            userId: string;
            username: string;
            start: { x: number; y: number };
            end: { x: number; y: number };
            distance: string;
            color: string;
            type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
            affectedSquares?: string[];
            sceneId: string;
        }>> = ref([]);

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

    function setInitialState(data: { tableInfo: ITable; activeScene: IScene | null; tokens: TokenInfo[]; allScenes: IScene[] }) {
        currentTable.value = data.tableInfo;
        scenes.value = data.allScenes;
        activeSceneId.value = data.activeScene?._id || null;
        currentMapUrl.value = data.activeScene?.imageUrl || null;
        initiativeList.value = data.activeScene?.initiative || [];
    sessionStatus.value = data.tableInfo.status as 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
    pauseUntil.value = (data.tableInfo as any).pauseUntil ? new Date((data.tableInfo as any).pauseUntil) : null;
    gridWidth.value = data.activeScene?.gridWidth ?? 30;
    gridHeight.value = data.activeScene?.gridHeight ?? 30;
    metersPerSquare.value = data.activeScene?.metersPerSquare ?? 1.5;
    _rebuildGridRectangular(gridWidth.value, gridHeight.value, data.tokens);
    auras.value = [];
    }

    function updateSessionState(newState: { activeScene: IScene | null, tokens: TokenInfo[] }) {
        activeSceneId.value = newState.activeScene?._id || null;
        currentMapUrl.value = newState.activeScene?.imageUrl || null;
        initiativeList.value = newState.activeScene?.initiative || [];
    gridWidth.value = newState.activeScene?.gridWidth ?? 30;
    gridHeight.value = newState.activeScene?.gridHeight ?? 30;
    metersPerSquare.value = newState.activeScene?.metersPerSquare ?? metersPerSquare.value;
        _rebuildGridRectangular(gridWidth.value, gridHeight.value, newState.tokens);
    // Ao mudar de cena limpamos medições efêmeras (escopo por cena)
    sharedMeasurements.value = {};
    auras.value = [];
    // Persistentes são substituídas via evento específico (evita condição de corrida)
    }

    function placeToken(newToken: TokenInfo) {
        if (newToken.sceneId === activeSceneId.value) {
        const squareToUpdate = squares.value.find(sq => sq.id === newToken.squareId);
        if (squareToUpdate) squareToUpdate.token = newToken;
        }
    }

    function moveToken(movedTokenData: TokenInfo & { oldSquareId: string }) {
        if (movedTokenData.sceneId === activeSceneId.value) {
        const oldSquare = squares.value.find(sq => sq.id === movedTokenData.oldSquareId);
        if (oldSquare) oldSquare.token = null;
        
        const newSquare = squares.value.find(sq => sq.id === movedTokenData.squareId);
        if (newSquare) newSquare.token = movedTokenData;
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

    function applyTokenUpdate(updated: TokenInfo) {
        const square = squares.value.find(sq => sq.token?._id === updated._id);
        if (square && square.token) {
            Object.assign(square.token, updated);
        }
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
    function addPersistentMeasurement(m: { id: string; userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam'; affectedSquares?: string[]; sceneId: string; }) {
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
    function setPersistentMeasurementsForScene(sceneId: string, items: Array<{ id: string; userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam'; affectedSquares?: string[]; sceneId?: string; }>) {
            // Normaliza sceneId ausente (defesa contra payload incompleto do servidor)
            const normalized = items.map(i => ({ ...i, sceneId: i.sceneId || sceneId }));
            const others = persistentMeasurements.value.filter(pm => pm.sceneId !== sceneId);
            const currentForScene = persistentMeasurements.value.filter(pm => pm.sceneId === sceneId);
            // Se lista recebida é vazia e já temos itens, não sobrescreve (evita wipe indevido por corrida)
            const replacement = normalized.filter(i => i.sceneId === sceneId);
            const finalForScene = (replacement.length === 0 && currentForScene.length > 0) ? currentForScene : replacement;
            persistentMeasurements.value = [...others, ...finalForScene as any];
        }

    function updateSceneScale(sceneId: string, newScale: number) {
        const scene = scenes.value.find(s => s._id === sceneId);
        if (scene) (scene as any).metersPerSquare = newScale;
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
        updateAllTokens,
        upsertSharedMeasurement,
        removeSharedMeasurement,
    clearSharedMeasurements,
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
    setPersistentMeasurementsForScene
    ,addPing, clearPings
    };
});