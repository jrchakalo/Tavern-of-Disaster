import { Server, Socket } from 'socket.io';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { ServiceError } from '../services/serviceErrors';
import {
  Ack,
  AckErrorBody,
  ErrorCode,
  SessionPatchChanges,
} from '../dto/session.dto';
import { emitSessionPatch } from '../services/sessionService';
import { getRevisionSafe } from '../services/revisionService';

export type AckCallback = (ack: Ack) => void;

/**
 * O Socket.IO entrega o callback de ack como último argumento posicional.
 * Este helper aceita o valor cru e devolve a função apenas quando for válida.
 */
export function extractAck(lastArg: unknown): AckCallback | undefined {
  return typeof lastArg === 'function' ? (lastArg as AckCallback) : undefined;
}

export function toErrorCode(error: unknown): ErrorCode {
  if (error instanceof ServiceError) {
    switch (error.status) {
      case 400:
        return 'VALIDATION';
      case 401:
        return 'UNAUTHENTICATED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMITED';
      default:
        return error.status >= 500 ? 'INTERNAL' : 'VALIDATION';
    }
  }
  if (error instanceof ZodError) return 'VALIDATION';
  return 'INTERNAL';
}

const INTERNAL_MESSAGE = 'Erro interno do servidor.';

/**
 * Converte qualquer erro em um corpo de ack seguro (pt-BR, sem stack nem segredos).
 */
export function toAckError(error: unknown): AckErrorBody {
  if (error instanceof ServiceError) {
    return {
      code: toErrorCode(error),
      message: error.message || INTERNAL_MESSAGE,
      details: error.details,
    };
  }
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join('.') || undefined,
      message: issue.message,
      code: issue.code,
    }));
    const first = issues[0]?.message ? ` ${issues[0].message}` : '';
    return {
      code: 'VALIDATION',
      message: `Payload inválido.${first}`,
      details: { issues },
    };
  }
  return { code: 'INTERNAL', message: INTERNAL_MESSAGE };
}

export type ActionOutcome = {
  tableId: string;
  revision: number;
  changes?: SessionPatchChanges;
};

export type RunActionParams = {
  io: Server;
  socket: Socket;
  event: string;
  ack?: AckCallback;
  log: Logger;
  /** tableId do payload, usado apenas para preencher a revisão em caso de erro. */
  tableIdHint?: string;
  body: () => Promise<ActionOutcome>;
};

/**
 * Executa uma ação realtime garantindo exatamente uma resposta:
 * - sucesso: `sessionPatch` (quando há mudança) + ack `{ ok: true, revision }`;
 * - falha: ack `{ ok: false, error }` ou, sem callback, `actionError` no socket.
 */
export async function runAction(params: RunActionParams): Promise<void> {
  const { io, socket, event, ack, log, tableIdHint, body } = params;
  let answered = false;

  const respondOk = (revision: number) => {
    if (answered) return;
    answered = true;
    if (!ack) return;
    ack({ ok: true, revision, serverNowMs: Date.now() });
  };

  const respondError = (revision: number, error: AckErrorBody) => {
    if (answered) return;
    answered = true;
    const serverNowMs = Date.now();
    if (ack) {
      ack({ ok: false, error, revision, serverNowMs });
      return;
    }
    socket.emit('actionError', { event, error, revision, serverNowMs });
  };

  try {
    const outcome = await body();
    if (outcome.changes && Object.keys(outcome.changes).length > 0) {
      emitSessionPatch(io, outcome.tableId, outcome.revision, outcome.changes);
    }
    respondOk(outcome.revision);
  } catch (error) {
    log.error({ err: error, event, tableId: tableIdHint }, 'Ação realtime falhou');
    const errorBody = toAckError(error);
    // Nunca devolver a revisão de uma mesa que o usuário não pode acessar.
    const revision = errorBody.code === 'FORBIDDEN' ? 0 : await getRevisionSafe(tableIdHint);
    respondError(revision, errorBody);
  }
}

/**
 * Variante para handlers que já manipulam o ack manualmente (ex.: joinTable).
 */
export function emitAckErrorWithoutCallback(
  socket: Socket,
  event: string,
  error: AckErrorBody,
  revision = 0
): void {
  socket.emit('actionError', { event, error, revision, serverNowMs: Date.now() });
}
