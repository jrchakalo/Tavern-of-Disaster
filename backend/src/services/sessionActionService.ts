import { FilterQuery, Types } from 'mongoose';
import SessionAction, {
  ISessionAction,
  SessionActionType,
} from '../models/SessionAction.model';
import Token from '../models/Token.model';
import Character from '../models/Character.model';
import type { SessionActionDTO, SessionPatchChanges } from '../dto/session.dto';

/** Teto exposto no snapshot e na listagem REST/socket. */
export const ACTION_LOG_LIMIT = 50;
export const ACTION_LOG_RETENTION_DAYS = 7;
export const ACTION_CONTENT_MAX = 200;
/** Um único outcome nunca vira despejo de estado no histórico. */
export const ACTION_LOG_MAX_PER_OUTCOME = 3;

const STATUS_LABELS: Record<string, string> = {
  LIVE: 'Ao vivo',
  PAUSED: 'Pausado',
  ENDED: 'Encerrado',
  PREPARING: 'Preparando',
};

/**
 * Eventos que geram entrada no Histórico. Tudo o que não está aqui
 * (joinTable, resync, chat, medição, ping, mídia, transição) é efêmero ou
 * leitura e não deve poluir o log canônico.
 */
const ACTION_EVENTS = new Set([
  'requestSetActiveScene',
  'requestUpdateSessionStatus',
  'requestMoveToken',
  'requestNextTurn',
  'requestRemoveFromInitiative',
  'requestDeleteToken',
  'requestUpdateCharacter',
  'requestUpdateCharacterHp',
]);

/**
 * Contexto opcional que os handlers capturam ANTES da mutação, para nomes que
 * deixam de existir depois dela (token removido, entrada removida) e para
 * detectar de fato a troca de turno.
 */
export interface SessionActionMeta {
  tokenName?: string;
  entryName?: string;
  previousCurrentTurnId?: string | null;
}

/** Subconjunto do outcome de `runAction` necessário para derivar o log. */
export interface SessionActionOutcome {
  tableId: string;
  revision: number;
  changes?: SessionPatchChanges;
  actionMeta?: SessionActionMeta;
}

type LeanSessionAction = {
  _id?: unknown;
  type: SessionActionType;
  content: string;
  authorId?: unknown;
  authorName?: string | null;
  revision?: number | null;
  createdAt?: Date | string;
};

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return ACTION_LOG_LIMIT;
  return Math.min(Math.max(Math.trunc(limit as number), 1), ACTION_LOG_LIMIT);
}

function truncateContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= ACTION_CONTENT_MAX) return trimmed;
  return `${trimmed.slice(0, ACTION_CONTENT_MAX - 1)}…`;
}

function toObjectId(value: string | null | undefined): Types.ObjectId | undefined {
  if (!value || !Types.ObjectId.isValid(value)) return undefined;
  return new Types.ObjectId(value);
}

export function mapSessionAction(action: LeanSessionAction): SessionActionDTO {
  return {
    id: action._id ? String(action._id) : '',
    type: action.type,
    content: action.content,
    authorId: action.authorId ? String(action.authorId) : null,
    authorName: action.authorName ?? null,
    revision: typeof action.revision === 'number' ? action.revision : null,
    createdAt:
      action.createdAt instanceof Date
        ? action.createdAt.toISOString()
        : new Date(action.createdAt ?? Date.now()).toISOString(),
  };
}

export interface RecordSessionActionInput {
  tableId: string;
  type: SessionActionType;
  content: string;
  authorId?: string | null;
  authorName?: string | null;
  revision?: number | null;
}

/**
 * Persiste uma ação e devolve o DTO serializável. Entradas idênticas
 * consecutivas na MESMA revisão são idempotentes (retorna `null`), o que
 * protege contra retry de ack/patch e reemissão do mesmo outcome.
 */
export async function recordSessionAction(
  input: RecordSessionActionInput
): Promise<SessionActionDTO | null> {
  const content = truncateContent(input.content);
  if (!content) return null;
  const tableId = toObjectId(input.tableId);
  if (!tableId) return null;

  const revision =
    typeof input.revision === 'number' && Number.isFinite(input.revision)
      ? Math.max(0, Math.trunc(input.revision))
      : null;

  if (revision !== null) {
    // Mesma revisão = mesmo outcome: entrada idêntica já registrada é retry,
    // não uma ação nova (protege batches de múltiplas entradas também).
    const previous = await SessionAction.findOne({
      tableId,
      revision,
      type: input.type,
      content,
    }).lean();
    if (previous) return null;
  }

  const created = await SessionAction.create({
    tableId,
    type: input.type,
    content,
    authorId: toObjectId(input.authorId ?? null) ?? null,
    authorName: input.authorName ? input.authorName.slice(0, 80) : null,
    revision,
  });

  return mapSessionAction(created.toObject() as unknown as LeanSessionAction);
}

/** Histórico da mesa em ordem cronológica (mais antigo → mais novo). */
export async function listTableActions(
  tableId: string,
  limit = ACTION_LOG_LIMIT
): Promise<SessionActionDTO[]> {
  const filter: FilterQuery<ISessionAction> = { tableId };
  const actions = await SessionAction.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(normalizeLimit(limit))
    .lean();
  return actions
    .map((action) => mapSessionAction(action as unknown as LeanSessionAction))
    .reverse();
}

// Memória auxiliar do último turno registrado, usada apenas quando o handler
// não fornece o contexto anterior (ex.: chamadas diretas em testes).
const lastCurrentTurn = new Map<string, string | null>();

async function tokenNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
  if (unique.length === 0) return new Map();
  const tokens = await Token.find({ _id: { $in: unique } })
    .select('name')
    .lean();
  return new Map(tokens.map((token) => [String(token._id), token.name]));
}

async function characterNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
  if (unique.length === 0) return new Map();
  const characters = await Character.find({ _id: { $in: unique } })
    .select('name')
    .lean();
  return new Map(characters.map((character) => [String(character._id), character.name]));
}

type DerivedAction = { type: SessionActionType; content: string };

function dedupeAndCap(actions: DerivedAction[]): DerivedAction[] {
  const result: DerivedAction[] = [];
  for (const action of actions) {
    const last = result[result.length - 1];
    if (last && last.type === action.type && last.content === action.content) continue;
    result.push(action);
    if (result.length >= ACTION_LOG_MAX_PER_OUTCOME) break;
  }
  return result;
}

/**
 * Traduz mutações reais em entradas legíveis (pt-BR) do Histórico.
 * Consulta o banco só quando o patch não carrega o nome (movimento, ficha sem
 * nome) e nunca lança por documento ausente — logging não derruba mutação.
 */
export async function deriveActionsFromOutcome(input: {
  event: string;
  // Aceito por compatibilidade com o helper de ack; a derivação usa o outcome.
  socket?: unknown;
  outcome: SessionActionOutcome;
}): Promise<DerivedAction[]> {
  const { event, outcome } = input;
  if (!ACTION_EVENTS.has(event)) return [];
  const changes = outcome.changes;
  if (!changes) return [];

  switch (event) {
    case 'requestSetActiveScene': {
      const scene = changes.activeScene;
      if (!scene) return [];
      const name = scene.name?.trim() || scene._id;
      return [{ type: 'system', content: `Cena ativa: ${name}` }];
    }

    case 'requestUpdateSessionStatus': {
      const status = changes.sessionStatus?.status ?? changes.table?.status;
      if (!status) return [];
      const label = STATUS_LABELS[status] ?? status;
      return [{ type: 'system', content: `Sessão: ${label}` }];
    }

    case 'requestMoveToken': {
      const updates = (changes.tokenUpdates ?? []).filter(
        (update) => typeof update?.patch?.squareId === 'string'
      );
      if (updates.length === 0) return [];
      const names = await tokenNamesByIds(updates.map((update) => update.tokenId));
      return updates.map((update) => ({
        type: 'movement' as const,
        content: `Token ${names.get(update.tokenId) ?? update.tokenId} moveu para ${update.patch.squareId}`,
      }));
    }

    case 'requestNextTurn': {
      const current = changes.initiative?.find((entry) => entry.isCurrentTurn);
      if (!current) {
        lastCurrentTurn.delete(outcome.tableId);
        return [];
      }
      const currentId = current._id;
      const previous = outcome.actionMeta
        ? outcome.actionMeta.previousCurrentTurnId ?? null
        : lastCurrentTurn.get(outcome.tableId) ?? null;
      if (previous && previous === currentId) {
        lastCurrentTurn.set(outcome.tableId, currentId);
        return [];
      }
      lastCurrentTurn.set(outcome.tableId, currentId);
      return [{ type: 'system', content: `Turno de ${current.characterName}` }];
    }

    case 'requestRemoveFromInitiative': {
      const name = outcome.actionMeta?.entryName;
      if (!name) return [];
      return [{ type: 'system', content: `${name} saiu do turno` }];
    }

    case 'requestDeleteToken': {
      const tokenId = changes.tokensRemoved?.[0];
      if (!tokenId) return [];
      const name =
        outcome.actionMeta?.tokenName ??
        (await tokenNamesByIds([tokenId])).get(tokenId) ??
        tokenId;
      return [{ type: 'system', content: `Token ${name} removido` }];
    }

    case 'requestUpdateCharacter':
    case 'requestUpdateCharacterHp': {
      const updates = changes.characterUpdates ?? [];
      if (updates.length === 0) return [];
      const missingNames = updates
        .filter((update) => !update.patch?.name)
        .map((update) => update.characterId);
      const names =
        missingNames.length > 0
          ? await characterNamesByIds(missingNames)
          : new Map<string, string>();
      return updates.map((update) => {
        const name = update.patch?.name ?? names.get(update.characterId) ?? update.characterId;
        if (event === 'requestUpdateCharacterHp') {
          const current = update.patch?.currentHP;
          const max = update.patch?.maxHP;
          if (typeof current === 'number' && typeof max === 'number') {
            return { type: 'system' as const, content: `Ficha ${name}: PV ${current}/${max}` };
          }
        }
        return { type: 'system' as const, content: `Ficha ${name} atualizada` };
      });
    }

    default:
      return [];
  }
}

/** Deriva + deduplica uma leva de ações de um outcome. */
export async function deriveAndDedupeActions(input: {
  event: string;
  socket?: unknown;
  outcome: SessionActionOutcome;
}): Promise<DerivedAction[]> {
  const derived = await deriveActionsFromOutcome(input);
  return dedupeAndCap(derived);
}

/** Limpa o cache auxiliar de turno (usado em testes e ao encerrar a mesa). */
export function resetSessionActionTurnCache(tableId?: string): void {
  if (tableId) {
    lastCurrentTurn.delete(tableId);
    return;
  }
  lastCurrentTurn.clear();
}
