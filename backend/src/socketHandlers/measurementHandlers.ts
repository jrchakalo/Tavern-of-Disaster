import { Server, Socket } from 'socket.io';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';
import Token from '../models/Token.model';
import { setMeasurement, removeMeasurement, clearAllForUser, getTablesForUser, addPersistent, removePersistent, listPersistents } from './measurementStore';
import { nanoid } from 'nanoid';

export function registerMeasurementHandlers(io: Server, socket: Socket) {
  const requestShareMeasurement = async (data: { tableId: string; sceneId: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler' | 'cone'; affectedSquares?: string[]; }) => {
    try {
      const user = socket.data.user;
      if (!user) return;
      const { tableId, sceneId, start, end, distance, type, affectedSquares } = data;
      const table = await Table.findById(tableId).populate('dm', '_id username').populate('players', '_id username').populate('activeScene');
      if (!table) return;
      if (!table.activeScene || table.activeScene._id.toString() !== sceneId) return; // only for active scene

      // Permissão: DM sempre pode; jogador apenas se for o dono do token em turno
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

      const color = isDM ? '#3c096c' : '#ffbf00'; // Mestre roxo, jogadores amarelo base
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

  const requestRemoveMeasurement = (data: { tableId: string; sceneId: string }) => {
    const user = socket.data.user;
    if (!user) return;
    const { tableId } = data;
    removeMeasurement(tableId, user.id);
    io.to(tableId).emit('measurementRemoved', { userId: user.id });
  };

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
  socket.on('requestAddPersistentMeasurement', async (data: { tableId: string; sceneId: string; payload: { id?: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler'|'cone'|'circle'|'square'; affectedSquares?: string[] } }) => {
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
  const color = isDM ? '#3c096c' : '#ffbf00';
  const id = payload.id || nanoid(8);
  addPersistent(tableId, sceneId, { id, userId: user.id, username: user.username, color, sceneId, start: payload.start, end: payload.end, distance: payload.distance, type: payload.type, affectedSquares: payload.affectedSquares });
  io.to(tableId).emit('persistentMeasurementAdded', { tableId, sceneId, ownerId: user.id, userId: user.id, id, start: payload.start, end: payload.end, distance: payload.distance, type: payload.type, affectedSquares: payload.affectedSquares, color, username: user.username });
    } catch (e) { console.error('requestAddPersistentMeasurement', e);} 
  });

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
}