import Table from '../models/Table.model';
import { ServiceError } from './serviceErrors';

const TABLE_NOT_FOUND = 'Mesa não encontrada.';

/**
 * Incrementa a revisão da mesa exatamente uma vez e retorna o novo valor.
 * Deve ser chamado depois que a escrita de estado teve sucesso.
 */
export async function bumpRevision(tableId: string): Promise<number> {
  const table = await Table.findByIdAndUpdate(
    tableId,
    { $inc: { revision: 1 } },
    { new: true, projection: { revision: 1 } }
  ).exec();
  if (!table) {
    throw new ServiceError(TABLE_NOT_FOUND, 404);
  }
  return table.revision ?? 0;
}

/**
 * Lê a revisão atual sem alterá-la.
 */
export async function getRevision(tableId: string): Promise<number> {
  const table = await Table.findById(tableId).select('revision').lean().exec();
  if (!table) {
    throw new ServiceError(TABLE_NOT_FOUND, 404);
  }
  return table.revision ?? 0;
}

/**
 * Lê a revisão atual de forma tolerante: qualquer falha retorna 0.
 * Usado apenas para preencher o ack de erro sem vazar informação de outra mesa.
 */
export async function getRevisionSafe(tableId: string | undefined): Promise<number> {
  if (!tableId) return 0;
  try {
    return await getRevision(tableId);
  } catch {
    return 0;
  }
}

/**
 * Conflito otimista opcional: se o cliente enviou a revisão que conhece e ela
 * diverge da atual, responde 409 CONFLICT antes de aplicar a mutação.
 */
export async function assertExpectedRevision(tableId: string, expected?: number): Promise<void> {
  if (expected === undefined || expected === null) return;
  const current = await getRevision(tableId);
  if (current !== expected) {
    throw new ServiceError(
      'A mesa mudou desde a sua última ação. Atualize o estado e tente novamente.',
      409,
      { expectedRevision: expected, currentRevision: current }
    );
  }
}
