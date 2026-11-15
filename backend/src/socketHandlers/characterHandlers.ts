import { Server, Socket } from 'socket.io';
import {
  assertCharacterBelongsToTable,
  createCharacter,
  deleteCharacterByContext,
  findTokensLinkedToCharacter,
  loadCharacterContext,
  updateCharacterByContext,
  updateCharacterHp,
  CharacterContext,
} from '../services/characterService';
import { getCharacterSummariesForTable } from '../services/sessionService';
import { mapCharacterSummary, mapCharacterSummaryLite } from '../dto/sessionAssembler';
import { SessionPatchChanges } from '../dto/session.dto';
import { assertCondition } from '../services/serviceErrors';
import { assertExpectedRevision, bumpRevision } from '../services/revisionService';
import { extractAck, runAction } from './ack';
import { createLogger } from '../logger';
import { validate } from '../validation/validate';
import {
  zCreateCharacterPayload,
  zUpdateCharacterPayload,
  zDeleteCharacterPayload,
  zUpdateCharacterHpPayload,
} from '../validation/schemas';
import type {
  CreateCharacterSocketPayload,
  UpdateCharacterSocketPayload,
  DeleteCharacterSocketPayload,
  UpdateCharacterHpSocketPayload,
} from '../validation/schemas';

function hintTableId(payload: unknown): string | undefined {
  const raw = payload as { tableId?: unknown } | undefined;
  return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
}

function tokenCharacterPatches(
  linkedTokens: Array<{ _id: unknown }>,
  context: CharacterContext
): SessionPatchChanges['tokenUpdates'] {
  const lite = mapCharacterSummaryLite(context.character);
  return linkedTokens.map((token) => ({
    tokenId: String(token._id),
    patch: { character: lite },
  }));
}

function linkedTokenId(linkedTokens: Array<{ _id: unknown }>): string | null {
  return linkedTokens.length > 0 ? String(linkedTokens[0]._id) : null;
}

/**
 * Eventos realtime de ficha (P3): criar, editar, excluir e atalho de PV.
 * O caminho canônico é sempre `sessionPatch` + ack com revisão.
 */
export function registerCharacterHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:character', socketId: socket.id, userId: socket.data.user?.id });

  const requestCreateCharacter = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestCreateCharacter',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zCreateCharacterPayload, payload) as CreateCharacterSocketPayload;
        const character = await createCharacter(userId!, data.tableId, data.character, {
          ownerId: data.ownerId,
        });
        const revision = await bumpRevision(data.tableId);

        const characters = await getCharacterSummariesForTable(data.tableId);
        const summary = characters.find((item) => item._id === character._id.toString());

        io.to(data.tableId).emit('characterCreated', {
          tableId: data.tableId,
          revision,
          character: summary ?? mapCharacterSummary(character),
        });

        return {
          tableId: data.tableId,
          revision,
          changes: { characters },
        };
      },
    });
  };

  const requestUpdateCharacter = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUpdateCharacter',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zUpdateCharacterPayload, payload) as UpdateCharacterSocketPayload;

        // Resolve a ficha antes de confiar no tableId do payload.
        const context = await loadCharacterContext(data.characterId);
        assertCharacterBelongsToTable(context.character, data.tableId);
        await assertExpectedRevision(data.tableId, data.expectedRevision);

        const character = await updateCharacterByContext(userId!, context, data.patch);
        const linkedTokens = await findTokensLinkedToCharacter(character._id.toString());
        const revision = await bumpRevision(data.tableId);

        const summary = mapCharacterSummary(character, linkedTokenId(linkedTokens));
        const changes: SessionPatchChanges = {
          characterUpdates: [{ characterId: character._id.toString(), patch: summary }],
          tokenUpdates: tokenCharacterPatches(linkedTokens, context),
        };

        io.to(data.tableId).emit('characterUpdated', {
          tableId: data.tableId,
          revision,
          characterId: character._id.toString(),
          character: summary,
        });

        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  const requestDeleteCharacter = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestDeleteCharacter',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zDeleteCharacterPayload, payload) as DeleteCharacterSocketPayload;

        const context = await loadCharacterContext(data.characterId);
        assertCharacterBelongsToTable(context.character, data.tableId);

        const characterId = context.character._id.toString();
        const result = await deleteCharacterByContext(userId!, context);
        const revision = await bumpRevision(data.tableId);

        const changes: SessionPatchChanges = {
          charactersRemoved: [characterId],
          tokenUpdates: result.tokens.map((token) => ({
            tokenId: String(token._id),
            patch: { character: null, characterId: null },
          })),
        };

        io.to(data.tableId).emit('characterRemoved', {
          tableId: data.tableId,
          revision,
          characterId,
        });

        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  const requestUpdateCharacterHp = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUpdateCharacterHp',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zUpdateCharacterHpPayload, payload) as UpdateCharacterHpSocketPayload;

        const context = await loadCharacterContext(data.characterId);
        assertCharacterBelongsToTable(context.character, data.tableId);
        await assertExpectedRevision(data.tableId, data.expectedRevision);

        const updated = await updateCharacterHp(userId!, data.characterId, data.currentHP, data.tableId);
        const linkedTokens = await findTokensLinkedToCharacter(updated.character._id.toString());
        const revision = await bumpRevision(data.tableId);

        const summary = mapCharacterSummary(updated.character, linkedTokenId(linkedTokens));
        const changes: SessionPatchChanges = {
          characterUpdates: [{ characterId: updated.character._id.toString(), patch: summary }],
          tokenUpdates: tokenCharacterPatches(linkedTokens, updated),
        };

        io.to(data.tableId).emit('characterUpdated', {
          tableId: data.tableId,
          revision,
          characterId: updated.character._id.toString(),
          character: summary,
        });

        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  socket.on('requestCreateCharacter', requestCreateCharacter);
  socket.on('requestUpdateCharacter', requestUpdateCharacter);
  socket.on('requestDeleteCharacter', requestDeleteCharacter);
  socket.on('requestUpdateCharacterHp', requestUpdateCharacterHp);
}
