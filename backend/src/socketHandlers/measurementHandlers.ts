import { Server, Socket } from 'socket.io';


export function registerMeasurementHandlers(io: Server, socket: Socket) {
  const broadcastMeasurement = (data: { tableId: string, measurementData: any }) => {
    socket.to(data.tableId).emit('measurementUpdated', data.measurementData);
  };

  // Registro do listener no socket
  socket.on('broadcastMeasurement', broadcastMeasurement);
}