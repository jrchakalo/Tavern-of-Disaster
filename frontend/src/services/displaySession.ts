import { socketService } from './socketService';

export type DisplayConnection = {
  tableId: string;
  token: string;
};

/**
 * Wrapper fino sobre `socketService` para a TV (`/display/:tableId`).
 * Conecta com token de display (sem JWT, sem refresh de sessão) e aplica
 * snapshot/patch no `tableStore` como qualquer cliente. A implementação
 * real vive em `socketService.connectDisplay/disconnectDisplay`.
 */
export function connectDisplay(connection: DisplayConnection): void {
  socketService.connectDisplay(connection.tableId, connection.token);
}

export function disconnectDisplay(): void {
  socketService.disconnectDisplay();
}

export function isDisplayMode(): boolean {
  return socketService.isDisplayMode();
}
