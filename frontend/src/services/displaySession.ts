import { socketService } from './socketService';

export type DisplayConnection = {
  tableId: string;
  token: string;
};

type DisplaySocketService = {
  connectDisplay?: (tableId: string, token: string) => void;
  disconnectDisplay?: () => void;
  isDisplayMode?: () => boolean;
};

function service(): DisplaySocketService {
  return socketService as unknown as DisplaySocketService;
}

/**
 * Conecta a TV usando token de display (sem JWT).
 * A implementação real vive em `socketService` (branch `restore/phase-2-frontend`).
 */
export function connectDisplay(connection: DisplayConnection): void {
  const target = service();
  if (!target.connectDisplay) {
    throw new Error('Conexão de display ainda não implementada.');
  }
  target.connectDisplay(connection.tableId, connection.token);
}

export function disconnectDisplay(): void {
  service().disconnectDisplay?.();
}

export function isDisplayMode(): boolean {
  return service().isDisplayMode?.() === true;
}
