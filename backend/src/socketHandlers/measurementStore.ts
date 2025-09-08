// Centraliza o armazenamento em memória de medições por mesa/cena
// Chave: tableId -> userId -> measurement
export type Measurement = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  type?: 'ruler' | 'cone';
  affectedSquares?: string[];
  sceneId: string;
};

const tableMeasurements: Record<string, Record<string, Measurement>> = {};

export function setMeasurement(tableId: string, userId: string, measurement: Measurement) {
  if (!tableMeasurements[tableId]) tableMeasurements[tableId] = {};
  tableMeasurements[tableId][userId] = measurement;
}

export function removeMeasurement(tableId: string, userId: string) {
  if (tableMeasurements[tableId] && tableMeasurements[tableId][userId]) {
    delete tableMeasurements[tableId][userId];
  }
}

export function clearMeasurementsForTable(tableId: string) {
  if (tableMeasurements[tableId]) {
    tableMeasurements[tableId] = {};
  }
}

export function clearAllForUser(userId: string) {
  Object.keys(tableMeasurements).forEach(tid => {
    if (tableMeasurements[tid] && tableMeasurements[tid][userId]) {
      delete tableMeasurements[tid][userId];
    }
  });
}

export function getTablesForUser(userId: string): string[] {
  const tables: string[] = [];
  Object.keys(tableMeasurements).forEach(tid => {
    if (tableMeasurements[tid] && tableMeasurements[tid][userId]) tables.push(tid);
  });
  return tables;
}

export function getMeasurementsForTable(tableId: string): Record<string, Measurement> {
  return tableMeasurements[tableId] || {};
}
