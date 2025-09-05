import { Server, Socket } from 'socket.io';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';

// In-memory per table scene measurements (not persisted)
// Key: tableId -> userId -> measurement
const tableMeasurements: Record<string, Record<string, any>> = {};

export function registerMeasurementHandlers(io: Server, socket: Socket) {
  const requestShareMeasurement = async (data: { tableId: string; sceneId: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; }) => {
    try {
      const user = socket.data.user;
      if (!user) return;
      const { tableId, sceneId, start, end, distance } = data;
      const table = await Table.findById(tableId).populate('dm', '_id username').populate('players', '_id username').populate('activeScene');
      if (!table) return;
      if (!table.activeScene || table.activeScene._id.toString() !== sceneId) return; // only for active scene

      // Permissão: DM sempre pode; jogador apenas se for turno dele
      let isDM = table.dm._id.toString() === user.id;
      let canShare = isDM;
      if (!isDM) {
        // Checa iniciativa na cena ativa
        const scene = await Scene.findById(sceneId);
        const currentEntry = scene?.initiative?.find((e: any) => e.isCurrentTurn);
        if (currentEntry) {
          // Precisamos verificar se o token do turno pertence ao usuário
          // Simplificação: backend ainda não popula dono aqui; confiamos no front? Poderíamos adicionar uma checagem mais robusta posteriormente.
          canShare = true; // Aceita provisoriamente. TODO: refinar com token lookup.
        }
      }
      if (!canShare) return; // silencioso

      if (!tableMeasurements[tableId]) tableMeasurements[tableId] = {};

      const color = isDM ? '#3c096c' : '#ffbf00'; // Mestre roxo, jogadores amarelo base (pode ajustar no front por usuário)
      const measurement = {
        userId: user.id,
        username: user.username,
        start, end, distance, color,
        sceneId
      };
      tableMeasurements[tableId][user.id] = measurement;
      io.to(tableId).emit('measurementShared', measurement);
    } catch (e) { console.error('Erro share measurement', e); }
  };

  const requestRemoveMeasurement = (data: { tableId: string; sceneId: string }) => {
    const user = socket.data.user;
    if (!user) return;
    const { tableId } = data;
    if (tableMeasurements[tableId] && tableMeasurements[tableId][user.id]) {
      delete tableMeasurements[tableId][user.id];
      io.to(tableId).emit('measurementRemoved', { userId: user.id });
    }
  };

  const handleDisconnect = () => {
    const user = socket.data.user;
    if (!user) return;
    // Remove medições do usuário em todas as mesas onde estiver
    Object.keys(tableMeasurements).forEach(tableId => {
      if (tableMeasurements[tableId][user.id]) {
        delete tableMeasurements[tableId][user.id];
        io.to(tableId).emit('measurementRemoved', { userId: user.id });
      }
    });
  };

  socket.on('requestShareMeasurement', requestShareMeasurement);
  socket.on('requestRemoveMeasurement', requestRemoveMeasurement);
  socket.on('disconnect', handleDisconnect);
}