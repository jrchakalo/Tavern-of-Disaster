import { Server, Socket } from 'socket.io';
import {
  placeTokenForTable,
  PlaceTokenPayload,
  moveTokenForUser,
  assignTokenOwnerForTable,
  editTokenForTable,
  undoTokenMoveForUser,
} from '../services/tokenSocketService';
import { IInitiativeEntry } from '../models/Scene.model';
import { createLogger } from '../logger';
import { recordTokenMove, recordTokenMoveError } from '../metrics';
import { assertCondition } from '../services/serviceErrors';
import { assertExpectedRevision, bumpRevision, getRevision } from '../services/revisionService';
import { getTokensForScene, getUserSummary } from '../services/sessionService';
import { mapInitiativeEntry } from '../dto/sessionAssembler';
import { SessionPatchChanges, TokenDTO } from '../dto/session.dto';
import { extractAck, runAction } from './ack';
import { validate } from '../validation/validate';
import {
  zPlaceTokenPayload,
  zMoveTokenPayload,
  zAssignTokenPayload,
  zEditTokenPayload,
  zUndoMovePayload,
} from '../validation/schemas';
import type {
  PlaceTokenPayloadInput,
  MoveTokenPayload,
  AssignTokenPayload,
  EditTokenPayload,
  UndoMovePayload,
} from '../validation/schemas';

function toInitiativeEntryDTO(entry: IInitiativeEntry) {
  return {
    _id: entry._id?.toString() || '',
    characterName: entry.characterName,
    tokenId: entry.tokenId ? entry.tokenId.toString() : undefined,
    characterId: entry.characterId ? entry.characterId.toString() : undefined,
    isCurrentTurn: !!entry.isCurrentTurn,
  };
}

function hintTableId(payload: unknown): string | undefined {
  const raw = payload as { tableId?: unknown } | undefined;
  return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
}

function tokenPatchFromUpdated(token: any): Partial<TokenDTO> {
  return {
    sceneId: token.sceneId ? token.sceneId.toString() : undefined,
    squareId: token.squareId,
    remainingMovement: token.remainingMovement,
    movement: token.movement,
  };
}

export function registerTokenHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:token', socketId: socket.id, userId: socket.data.user?.id });

  // Coloca um novo token no grid + adiciona entrada na iniciativa. Valida footprint e ocupação.
  const requestPlaceToken = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestPlaceToken',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zPlaceTokenPayload, payload) as PlaceTokenPayloadInput;
        const result = await placeTokenForTable(userId!, data as PlaceTokenPayload);
        const revision = await bumpRevision(data.tableId);

        const tokenPayload = {
          ...(typeof (result.token as any).toObject === 'function' ? (result.token as any).toObject() : result.token),
          revision,
        };
        io.to(data.tableId).emit('tokenPlaced', tokenPayload);

        if (result.initiative) {
          const createdEntry = result.initiative.find(
            (entry) => entry.tokenId?.toString() === result.token._id.toString()
          );
          if (createdEntry) {
            io.to(data.tableId).emit('initiativeEntryAdded', {
              tableId: data.tableId,
              sceneId: data.sceneId,
              revision,
              entry: toInitiativeEntryDTO(createdEntry),
              order: result.initiative.map((entry) => entry._id?.toString()).filter(Boolean),
            });
          }
        }

        const changes: SessionPatchChanges = {
          tokens: await getTokensForScene(data.sceneId),
          initiative: result.initiative ? result.initiative.map(mapInitiativeEntry) : [],
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  // Move token validando turno (jogador só move no seu turno) + movimento restante + footprint.
  const requestMoveToken = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestMoveToken',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zMoveTokenPayload, payload) as MoveTokenPayload;
        await assertExpectedRevision(data.tableId, data.expectedRevision);

        let result;
        try {
          result = await moveTokenForUser(userId!, data);
        } catch (error) {
          recordTokenMoveError();
          throw error;
        }
        const { updated, oldSquareId } = result;
        const moved = oldSquareId !== updated.squareId;
        const revision = moved ? await bumpRevision(data.tableId) : await getRevision(data.tableId);

        if (moved) {
          recordTokenMove();
          io.to(data.tableId).emit('tokenMoved', {
            tableId: data.tableId,
            revision,
            sceneId: updated.sceneId ? updated.sceneId.toString() : '',
            tokenId: updated._id.toString(),
            oldSquareId,
            squareId: updated.squareId,
            remainingMovement: updated.remainingMovement,
            movement: updated.movement,
          });
        }

        const changes: SessionPatchChanges | undefined = moved
          ? { tokenUpdates: [{ tokenId: updated._id.toString(), patch: tokenPatchFromUpdated(updated) }] }
          : undefined;
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  // Atribui novo dono a um token (apenas Mestre) para permitir controle ao jogador.
  const requestAssignToken = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestAssignToken',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zAssignTokenPayload, payload) as AssignTokenPayload;
        const updatedToken = await assignTokenOwnerForTable(userId!, data);
        assertCondition(!!updatedToken, 'Token não encontrado.', 404);
        const revision = await bumpRevision(data.tableId);

        const owner = getUserSummary((updatedToken as any).ownerId);
        io.to(data.tableId).emit('tokenOwnerUpdated', {
          tokenId: updatedToken!._id.toString(),
          newOwner: (updatedToken as any).ownerId,
          revision,
        });

        const changes: SessionPatchChanges = {
          tokenUpdates: [{ tokenId: updatedToken!._id.toString(), patch: { owner } }],
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  // Edita atributos do token (apenas Mestre). Se nome muda, reflete na iniciativa.
  const requestEditToken = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestEditToken',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zEditTokenPayload, payload) as EditTokenPayload;
        const { tableId, tokenId, patch } = data;
        const result = await editTokenForTable(userId!, { tableId, tokenId, ...patch });
        assertCondition(!!result?.updated, 'Token não encontrado.', 404);
        const { updated, initiative } = result!;
        const revision = await bumpRevision(tableId);

        const patchPayload: Record<string, unknown> = {};
        if (typeof patch.name === 'string') patchPayload.name = updated.name;
        if (typeof patch.movement === 'number') {
          patchPayload.movement = updated.movement;
          patchPayload.remainingMovement = updated.remainingMovement;
        }
        if (typeof patch.imageUrl === 'string') patchPayload.imageUrl = updated.imageUrl;
        if (typeof patch.ownerId === 'string') patchPayload.ownerId = updated.ownerId;
        if (typeof patch.size === 'string') patchPayload.size = updated.size;
        if (typeof patch.canOverlap === 'boolean') patchPayload.canOverlap = updated.canOverlap;
        if (patch.characterId !== undefined) patchPayload.characterId = updated.characterId?.toString() || null;
        if (patch.resetRemainingMovement) patchPayload.remainingMovement = updated.remainingMovement;

        io.to(tableId).emit('tokenUpdated', {
          tableId,
          revision,
          sceneId: updated.sceneId?.toString() || '',
          tokenId: updated._id.toString(),
          patch: patchPayload,
        });

        const changes: SessionPatchChanges = {
          tokenUpdates: [
            {
              tokenId: updated._id.toString(),
              patch: {
                name: updated.name,
                movement: updated.movement,
                remainingMovement: updated.remainingMovement,
                imageUrl: updated.imageUrl,
                size: updated.size,
                canOverlap: updated.canOverlap,
                characterId: updated.characterId ? updated.characterId.toString() : undefined,
                ...(typeof patch.ownerId === 'string'
                  ? { owner: getUserSummary((updated as any).ownerId) }
                  : {}),
              },
            },
          ],
        };

        if (initiative) {
          const changedEntry = initiative.find((entry) => entry.tokenId?.toString() === updated._id.toString());
          if (changedEntry && updated.sceneId) {
            io.to(tableId).emit('initiativeEntryUpdated', {
              tableId,
              revision,
              sceneId: updated.sceneId.toString(),
              entryId: changedEntry._id.toString(),
              patch: { characterName: changedEntry.characterName },
            });
          }
          changes.initiative = initiative.map(mapInitiativeEntry);
        }

        return { tableId, revision, changes };
      },
    });
  };

  // Desfaz último movimento restaurando custo de deslocamento. Permite apenas Mestre ou dono.
  const requestUndoMove = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUndoMove',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const data = validate(zUndoMovePayload, payload) as UndoMovePayload;
        const result = await undoTokenMoveForUser(userId!, data);
        assertCondition(!!result, 'Nenhum movimento para desfazer.', 400);
        const { updated, previousSquare } = result!;
        const revision = await bumpRevision(data.tableId);

        io.to(data.tableId).emit('tokenMoved', {
          tableId: data.tableId,
          revision,
          sceneId: updated.sceneId ? updated.sceneId.toString() : '',
          tokenId: updated._id.toString(),
          oldSquareId: previousSquare,
          squareId: updated.squareId,
          remainingMovement: updated.remainingMovement,
          movement: updated.movement,
        });
        recordTokenMove();

        const changes: SessionPatchChanges = {
          tokenUpdates: [{ tokenId: updated._id.toString(), patch: tokenPatchFromUpdated(updated) }],
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  socket.on('requestPlaceToken', requestPlaceToken);
  socket.on('requestMoveToken', requestMoveToken);
  socket.on('requestAssignToken', requestAssignToken);
  socket.on('requestUndoMove', requestUndoMove);
  socket.on('requestEditToken', requestEditToken);
}
