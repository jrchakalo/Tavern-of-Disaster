import { defineStore } from 'pinia';
import type { Ref, ComputedRef } from 'vue';
import { ref, computed } from 'vue';
import type { IScene, ITable, IInitiativeEntry, GridSquare, TokenInfo, PlayerInfo } from '../types';
import { currentUser } from '../services/authService';

export const useTableStore = defineStore('table', () => {
    // STATE
    const currentTable: Ref<ITable | null> = ref(null);
    const scenes: Ref<IScene[]> = ref([]);
    const activeSceneId: Ref<string | null> = ref(null);
    const initiativeList: Ref<IInitiativeEntry[]> = ref([]);
    const squares: Ref<GridSquare[]> = ref([]);
    const gridWidth: Ref<number> = ref(30); // Novo: número de colunas
    const gridHeight: Ref<number> = ref(30); // Novo: número de linhas
    const sessionStatus: Ref<'PREPARING' | 'LIVE' | 'ENDED'> = ref('PREPARING');
    const currentMapUrl: Ref<string | null> = ref(null);
    const metersPerSquare: Ref<number> = ref(1.5);
    // Medições compartilhadas: chave = userId, valor = Measurement
    const sharedMeasurements: Ref<Record<string, {
        userId: string;
        username: string;
        start: { x: number; y: number };
        end: { x: number; y: number };
        distance: string; // "Xm (Yft)"
        color: string;
        type?: 'ruler' | 'cone' | 'circle' | 'square';
        affectedSquares?: string[];
    }>> = ref({});

        // Medições persistentes (lista) – não são limpas ao mudar de turno
        const persistentMeasurements: Ref<Array<{
            id: string;
            userId: string;
            username: string;
            start: { x: number; y: number };
            end: { x: number; y: number };
            distance: string;
            color: string;
            type?: 'ruler' | 'cone' | 'circle' | 'square';
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
        // Encontra a entrada da iniciativa que está no turno atual
        const activeEntry = initiativeList.value.find(entry => entry.isCurrentTurn);
        if (!activeEntry || !activeEntry.tokenId) return null;

        // Encontra o token correspondente no grid
        const tokenOnBoard = squares.value
            .map(sq => sq.token)
            .find(token => token?._id === activeEntry.tokenId);

        // Retorna o token apenas se ele pertencer ao usuário logado
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
            if (square) square.token = token; // Coloca token no quadrado correspondente
        });
        squares.value = newSquares;
    }

    function setInitialState(data: { tableInfo: ITable; activeScene: IScene | null; tokens: TokenInfo[]; allScenes: IScene[] }) {
        currentTable.value = data.tableInfo;
        scenes.value = data.allScenes;
        activeSceneId.value = data.activeScene?._id || null;
        currentMapUrl.value = data.activeScene?.imageUrl || null;
        initiativeList.value = data.activeScene?.initiative || [];
        sessionStatus.value = data.tableInfo.status as 'PREPARING' | 'LIVE' | 'ENDED';
    gridWidth.value = data.activeScene?.gridWidth ?? 30;
    gridHeight.value = data.activeScene?.gridHeight ?? 30;
    metersPerSquare.value = data.activeScene?.metersPerSquare ?? 1.5;
        _rebuildGridRectangular(gridWidth.value, gridHeight.value, data.tokens);
    }

    function updateSessionState(newState: { activeScene: IScene | null, tokens: TokenInfo[] }) {
        activeSceneId.value = newState.activeScene?._id || null;
        currentMapUrl.value = newState.activeScene?.imageUrl || null;
        initiativeList.value = newState.activeScene?.initiative || [];
    gridWidth.value = newState.activeScene?.gridWidth ?? 30;
    gridHeight.value = newState.activeScene?.gridHeight ?? 30;
    metersPerSquare.value = newState.activeScene?.metersPerSquare ?? metersPerSquare.value;
        _rebuildGridRectangular(gridWidth.value, gridHeight.value, newState.tokens);
    // Ao mudar de cena limpamos medições compartilhadas (escopo por cena)
    sharedMeasurements.value = {};
    // Não limpamos persistentes aqui para evitar condição de corrida.
    // A lista correta virá via evento 'persistentsListed' e substituirá a cena ativa.
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
            Object.assign(tokenOnGrid, updatedToken); // Atualiza o token com os novos dados
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

        // Persistentes
        function addPersistentMeasurement(m: { id: string; userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square'; affectedSquares?: string[]; sceneId: string; }) {
            // Escopo por cena ativa
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
        function setPersistentMeasurementsForScene(sceneId: string, items: Array<{ id: string; userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square'; affectedSquares?: string[]; sceneId?: string; }>) {
            // Normaliza sceneId ausente para evitar descartar itens vindos do servidor
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
        currentMapUrl,
        sharedMeasurements,
    persistentMeasurements,
    metersPerSquare,
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
    updateSceneScale,
    addPersistentMeasurement,
    removePersistentMeasurement,
    clearPersistentMeasurementsForScene,
    setPersistentMeasurementsForScene
    };
});