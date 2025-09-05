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
    const gridSize: Ref<number> = ref(30); // Legado (ainda usado em watchers / UI antiga)
    const gridWidth: Ref<number> = ref(30); // Novo: número de colunas
    const gridHeight: Ref<number> = ref(30); // Novo: número de linhas
    const sessionStatus: Ref<'PREPARING' | 'LIVE' | 'ENDED'> = ref('PREPARING');
    const currentMapUrl: Ref<string | null> = ref(null);

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
        // Resolve width/height com fallback para gridSize legado
        gridSize.value = data.activeScene?.gridSize || 30;
        gridWidth.value = data.activeScene?.gridWidth || data.activeScene?.gridSize || 30;
        gridHeight.value = data.activeScene?.gridHeight || data.activeScene?.gridSize || 30;
        _rebuildGridRectangular(gridWidth.value, gridHeight.value, data.tokens);
    }

    function updateSessionState(newState: { activeScene: IScene | null, tokens: TokenInfo[] }) {
        activeSceneId.value = newState.activeScene?._id || null;
        currentMapUrl.value = newState.activeScene?.imageUrl || null;
        initiativeList.value = newState.activeScene?.initiative || [];
        gridSize.value = newState.activeScene?.gridSize || 30;
        gridWidth.value = newState.activeScene?.gridWidth || newState.activeScene?.gridSize || 30;
        gridHeight.value = newState.activeScene?.gridHeight || newState.activeScene?.gridSize || 30;
        _rebuildGridRectangular(gridWidth.value, gridHeight.value, newState.tokens);
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

    // Ação para o evento de reset de rodada
    function updateAllTokens(updatedTokens: TokenInfo[]) {
        updatedTokens.forEach(updatedToken => {
        const tokenOnGrid = tokensOnMap.value.find(t => t._id === updatedToken._id);
        if (tokenOnGrid) {
            Object.assign(tokenOnGrid, updatedToken); // Atualiza o token com os novos dados
        }
        });
    }

    return {
        // State
        currentTable,
        scenes,
        activeSceneId,
        initiativeList,
        squares,
    gridSize,
    gridWidth,
    gridHeight,
        sessionStatus,
        currentMapUrl,
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
        updateAllTokens
    };
});