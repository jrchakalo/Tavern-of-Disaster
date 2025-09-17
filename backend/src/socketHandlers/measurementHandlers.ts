import { Server, Socket } from 'socket.io';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';
import Token from '../models/Token.model';
import { setMeasurement, removeMeasurement, clearAllForUser, getTablesForUser, addPersistent, removePersistent, listPersistents, upsertAura, removeAura, listAuras, clearPersistentsForScene } from './measurementStore';
import { nanoid } from 'nanoid';

export function registerMeasurementHandlers(io: Server, socket: Socket) {
  // Compartilha medição efêmera. Jogador só pode se for turno do seu token; Mestre sempre.
  const requestShareMeasurement = async (data: { tableId: string; sceneId: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam'; affectedSquares?: string[]; color?: string; }) => {
    try {
      const user = socket.data.user;
      if (!user) return;
      const { tableId, sceneId, start, end, distance, type, affectedSquares } = data;
      const table = await Table.findById(tableId).populate('dm', '_id username').populate('players', '_id username').populate('activeScene');
      if (!table) return;
      if (!table.activeScene || table.activeScene._id.toString() !== sceneId) return; // only for active scene

  // Permissão: Mestre sempre; jogador apenas se é dono do token em turno
      const isDM = table.dm._id.toString() === user.id;
      let canShare = isDM;
      if (!isDM) {
        const scene = await Scene.findById(sceneId);
        const currentEntry = scene?.initiative?.find((e: any) => e.isCurrentTurn);
        if (currentEntry?.tokenId) {
          const token = await Token.findById(currentEntry.tokenId);
          if (token && token.ownerId?.toString() === user.id) {
            canShare = true;
          }
        }
      }
      if (!canShare) return; // silencioso

  // Cor padrão: Mestre roxo; jogador mantém cor enviada/fallback
      const color = isDM ? '#3c096c' : (data.color || '#ff8c00');
      const measurement = {
        userId: user.id,
        username: user.username,
        start, end, distance, color,
        type: type || 'ruler',
        affectedSquares: Array.isArray(affectedSquares) ? affectedSquares : undefined,
        sceneId
      };
      setMeasurement(tableId, user.id, measurement);
      io.to(tableId).emit('measurementShared', measurement);
    } catch (e) { console.error('Erro share measurement', e); }
  };

  // Remove medição efêmera própria.
  const requestRemoveMeasurement = (data: { tableId: string; sceneId: string }) => {
    const user = socket.data.user;
    if (!user) return;
    const { tableId } = data;
    removeMeasurement(tableId, user.id);
    io.to(tableId).emit('measurementRemoved', { userId: user.id });
  };

  // Limpa medições efêmeras do usuário ao desconectar.
  const handleDisconnect = () => {
    const user = socket.data.user;
    if (!user) return;
    // Emite remoção para todas as mesas onde o usuário tinha medição, e limpa
    const tables = getTablesForUser(user.id);
    tables.forEach(tid => io.to(tid).emit('measurementRemoved', { userId: user.id }));
    clearAllForUser(user.id);
  };

  socket.on('requestShareMeasurement', requestShareMeasurement);
  socket.on('requestRemoveMeasurement', requestRemoveMeasurement);
  socket.on('disconnect', handleDisconnect);

  // --- Persistentes ---
  // Cria/guarda medição persistente associada à cena. Mestre sempre; jogador apenas no seu turno.
  socket.on('requestAddPersistentMeasurement', async (data: { tableId: string; sceneId: string; payload: { id?: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler'|'cone'|'circle'|'square'|'line'|'beam'; affectedSquares?: string[]; color?: string } }) => {
    try {
      const user = socket.data.user;
      if (!user) return;
      const { tableId, sceneId, payload } = data;
      const table = await Table.findById(tableId).populate('dm','_id');
      if (!table) return;
      const isDM = table.dm._id.toString() === user.id;
      // Jogador pode adicionar no próprio turno; DM sempre
      let canAdd = isDM;
      if (!isDM) {
        const scene = await Scene.findById(sceneId);
        const currentEntry = scene?.initiative?.find((e:any)=>e.isCurrentTurn);
        if (currentEntry?.tokenId) {
          const tok = await Token.findById(currentEntry.tokenId);
          canAdd = tok?.ownerId?.toString() === user.id;
        }
      }
    if (!canAdd) return;
  const color = isDM ? '#3c096c' : (payload.color || '#ff8c00');
  const id = payload.id || nanoid(8);
  addPersistent(tableId, sceneId, { id, userId: user.id, username: user.username, color, sceneId, start: payload.start, end: payload.end, distance: payload.distance, type: payload.type, affectedSquares: payload.affectedSquares });
  io.to(tableId).emit('persistentMeasurementAdded', { tableId, sceneId, ownerId: user.id, userId: user.id, id, start: payload.start, end: payload.end, distance: payload.distance, type: payload.type, affectedSquares: payload.affectedSquares, color, username: user.username });
    } catch (e) { console.error('requestAddPersistentMeasurement', e);} 
  });

  // Remove medição persistente (Mestre ou autor).
  socket.on('requestRemovePersistentMeasurement', async (data: { tableId: string; sceneId: string; id: string }) => {
    try {
      const user = socket.data.user; if (!user) return;
      const { tableId, sceneId, id } = data;
      const table = await Table.findById(tableId).populate('dm','_id');
      if (!table) return;
      const isDM = table.dm._id.toString() === user.id;
      // Permitir DM sempre; autor pode remover seu próprio
      const items = listPersistents(tableId, sceneId);
      const item = items.find(i => i.id === id);
      if (!item) return;
      if (!(isDM || item.userId === user.id)) return;
      removePersistent(tableId, sceneId, id);
      io.to(tableId).emit('persistentMeasurementRemoved', { sceneId, id });
    } catch (e) { console.error('requestRemovePersistentMeasurement', e);} 
  });

  // Limpar todas as medições compartilhadas da mesa (DM apenas)
  // Limpa (Mestre) tudo: efêmeras + persistentes + auras da cena.
  socket.on('requestClearAllMeasurements', async (data: { tableId: string; sceneId: string }) => {
    try {
      const user = socket.data.user; if (!user) return;
      const { tableId, sceneId } = data;
      const table = await Table.findById(tableId).populate('dm','_id');
      if (!table) return;
      const isDM = table.dm._id.toString() === user.id;
      if (!isDM) return;
      // Limpa em memória e notifica os clientes
      const { clearMeasurementsForTable, clearAurasForScene } = await import('./measurementStore');
      clearMeasurementsForTable(tableId);
      if (sceneId) clearPersistentsForScene(tableId, sceneId);
      if (sceneId) clearAurasForScene(tableId, sceneId);
      io.to(tableId).emit('allMeasurementsCleared', { sceneId });
    } catch (e) { console.error('requestClearAllMeasurements', e); }
  });

  // --- Auras ancoradas ao token ---
  // Inclui/atualiza aura ancorada a token. Permissão: Mestre, dono do token ou dono do token em turno.
  socket.on('requestUpsertAura', async (data: { tableId: string; sceneId: string; tokenId: string; name: string; color: string; radiusMeters: number; difficultTerrain?: boolean }) => {
    try {
      const user = socket.data.user; if (!user) return;
  const { tableId, sceneId, tokenId, name, color, radiusMeters, difficultTerrain } = data;
      const table = await Table.findById(tableId).populate('dm','_id');
      if (!table) return;
      const token = await Token.findById(tokenId);
      if (!token) return;
      const isDM = table.dm._id.toString() === user.id;
      const isOwner = token.ownerId?.toString() === user.id;
      // Permitir também o jogador cujo token está no turno atual
      let isTurnOwner = false;
      try {
        const scene = await Scene.findById(sceneId);
        const currentEntry: any = scene?.initiative?.find((e: any) => e.isCurrentTurn);
        if (currentEntry?.tokenId) {
          const turnTok = await Token.findById(currentEntry.tokenId);
          if (turnTok && turnTok.ownerId?.toString() === user.id) isTurnOwner = true;
        }
      } catch {}
      if (!(isDM || isOwner || isTurnOwner)) return;
  const aura = { id: tokenId, tokenId, tableId, sceneId, name: name?.trim() || 'Aura', color, radiusMeters: Math.max(0, radiusMeters || 0), ownerId: token.ownerId?.toString() || user.id, difficultTerrain: !!difficultTerrain };
      upsertAura(aura);
      io.to(tableId).emit('auraUpserted', aura);
    } catch (e) { console.error('requestUpsertAura', e); }
  });

  // Remove aura (apenas Mestre).
  socket.on('requestRemoveAura', async (data: { tableId: string; sceneId: string; tokenId: string }) => {
    try {
      const user = socket.data.user; if (!user) return;
      const { tableId, sceneId, tokenId } = data;
      const table = await Table.findById(tableId).populate('dm','_id');
      if (!table) return;
      const isDM = table.dm._id.toString() === user.id;
      if (!isDM) return; // Apenas DM remove
      removeAura(tableId, sceneId, tokenId);
      io.to(tableId).emit('auraRemoved', { sceneId, tokenId });
    } catch (e) { console.error('requestRemoveAura', e); }
  });

  // Ping efêmero (ripple). Apenas verifica se usuário está na mesa e cena ativa bate.
  // Ping visual curto (ripple). Apenas se cena for a ativa.
  socket.on('requestPing', async (data: { tableId: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string }) => {
    try {
      const user = socket.data.user; if (!user) return;
      const { tableId, sceneId, squareId, x, y, color } = data;
      const table = await Table.findById(tableId).populate('activeScene','_id');
      if (!table) return;
      if (!table.activeScene || table.activeScene._id.toString() !== sceneId) return;
      const payload = { id: nanoid(6), userId: user.id, username: user.username, sceneId, squareId, x, y, color, ts: Date.now() };
      io.to(tableId).emit('pingBroadcast', payload);
    } catch (e) { console.error('requestPing', e); }
  });
}