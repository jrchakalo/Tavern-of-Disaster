import { Types } from 'mongoose';
import Token, { IToken } from '../models/Token.model';
import Scene, { IScene } from '../models/Scene.model';
import Character from '../models/Character.model';
import { assertCondition, ServiceError } from './serviceErrors';

type HydratedToken = IToken & {
  save: () => Promise<IToken>;
  populate: (path: string, fields?: string) => Promise<IToken>;
};

const sizeMap: Record<string, number> = {
  'Pequeno/Médio': 1,
  'Grande': 2,
  'Enorme': 3,
  'Descomunal': 4,
  'Colossal': 5,
};

export type GridContext = {
  gridWidth: number;
  gridHeight: number;
  metersPerSquare: number;
};

export function squareIdToIndex(squareId: string) {
  const numericPart = parseInt(squareId.replace('sq-', ''), 10);
  if (Number.isNaN(numericPart)) {
    throw new ServiceError('Identificador de quadrado inválido.', 400);
  }
  return numericPart;
}

export function getCoords(squareId: string, gridWidth: number) {
  const index = squareIdToIndex(squareId);
  return { x: index % gridWidth, y: Math.floor(index / gridWidth) };
}

export function getFootprintSize(sizeLabel: string) {
  return sizeMap[sizeLabel] || 1;
}

export function isSquareInsideGrid(squareId: string, gridWidth: number, gridHeight: number) {
  const idx = squareIdToIndex(squareId);
  const maxIndex = gridWidth * gridHeight - 1;
  return idx >= 0 && idx <= maxIndex;
}

export function isFootprintWithinGrid(squareId: string, sizeLabel: string, gridWidth: number, gridHeight: number) {
  const anchor = getCoords(squareId, gridWidth);
  const footprint = getFootprintSize(sizeLabel);
  return anchor.x + footprint <= gridWidth && anchor.y + footprint <= gridHeight;
}

export function buildFootprintSquares(squareId: string, sizeLabel: string, gridWidth: number, gridHeight: number) {
  const anchor = getCoords(squareId, gridWidth);
  const footprint = getFootprintSize(sizeLabel);
  const squares: string[] = [];
  for (let dy = 0; dy < footprint; dy++) {
    for (let dx = 0; dx < footprint; dx++) {
      const nx = anchor.x + dx;
      const ny = anchor.y + dy;
      if (nx >= gridWidth || ny >= gridHeight) {
        throw new ServiceError('Token não cabe dentro do grid.', 400);
      }
      squares.push(`sq-${ny * gridWidth + nx}`);
    }
  }
  return squares;
}

export async function isFootprintColliding(sceneId: Types.ObjectId | string, footprintSquares: string[], tokenIdToIgnore?: string) {
  const tokens = await Token.find({ sceneId, squareId: { $in: footprintSquares } });
  return tokens.some((token: IToken) => token._id.toString() !== tokenIdToIgnore);
}

export function calculateMovementCost(
  fromSquare: string,
  toSquare: string,
  gridWidth: number,
  metersPerSquare: number
) {
  const from = getCoords(fromSquare, gridWidth);
  const to = getCoords(toSquare, gridWidth);
  const chebyshevDistance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return chebyshevDistance * metersPerSquare;
}

async function resolveCharacterForTable(characterId: string | null | undefined, tableId: Types.ObjectId | string) {
  if (!characterId) return null;
  assertCondition(Types.ObjectId.isValid(characterId), 'Personagem inválido.', 400);
  const character = await Character.findById(characterId);
  assertCondition(!!character, 'Personagem não encontrado.', 404);
  const normalizedTableId = typeof tableId === 'string' ? tableId : tableId.toString();
  assertCondition(character!.tableId.toString() === normalizedTableId, 'Personagem não pertence à mesa informada.', 400);
  return character!._id;
}

export async function createToken(payload: {
  tableId: string;
  sceneId: string;
  squareId: string;
  ownerId: string;
  name: string;
  imageUrl?: string;
  movement: number;
  remainingMovement?: number;
  size: string;
  canOverlap?: boolean;
  color?: string;
  characterId?: string | null;
}) {
  const scene = await Scene.findById(payload.sceneId);
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const gridWidth = (scene as any).gridWidth ?? 30;
  const gridHeight = (scene as any).gridHeight ?? 30;
  assertCondition(isSquareInsideGrid(payload.squareId, gridWidth, gridHeight), 'Quadrado fora dos limites da grade.', 400);
  const footprintSquares = buildFootprintSquares(payload.squareId, payload.size, gridWidth, gridHeight);
  const colliding = await isFootprintColliding(payload.sceneId, footprintSquares);
  assertCondition(!colliding || !!payload.canOverlap, 'Área ocupada por outro token.', 400);
  const characterRef = await resolveCharacterForTable(payload.characterId, payload.tableId);

  const token = new Token({
    tableId: payload.tableId,
    sceneId: payload.sceneId,
    squareId: payload.squareId,
    color: payload.color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
    ownerId: payload.ownerId,
    name: payload.name,
    imageUrl: payload.imageUrl,
    movement: payload.movement,
    remainingMovement: payload.remainingMovement ?? payload.movement,
    size: payload.size,
    canOverlap: !!payload.canOverlap,
    characterId: characterRef,
  });
  await token.save();
  return token.populate('ownerId', '_id username');
}

export async function moveToken(
  token: HydratedToken,
  targetSquareId: string,
  scene: IScene,
  canOverlap: boolean
) {
  const gridWidth = (scene as any).gridWidth ?? 30;
  const gridHeight = (scene as any).gridHeight ?? 30;
  assertCondition(isSquareInsideGrid(targetSquareId, gridWidth, gridHeight), 'Destino fora dos limites do grid.', 400);

  const footprintSquares = buildFootprintSquares(targetSquareId, token.size, gridWidth, gridHeight);
  const colliding = await isFootprintColliding(token.sceneId!, footprintSquares, token._id.toString());
  assertCondition(!colliding || canOverlap, 'Destino ocupado por outro token.', 400);

  const movementCost = calculateMovementCost(token.squareId, targetSquareId, gridWidth, (scene as any).metersPerSquare ?? 1.5);
  assertCondition(token.remainingMovement >= movementCost, 'Movimento insuficiente.', 400);

  if (!Array.isArray(token.moveHistory)) {
    token.moveHistory = [];
  }
  token.moveHistory.push(token.squareId);
  token.squareId = targetSquareId;
  token.remainingMovement -= movementCost;
  await token.save();
  return token.populate('ownerId', '_id username');
}

export async function undoLastMove(token: HydratedToken, scene: IScene) {
  if (!Array.isArray(token.moveHistory)) {
    token.moveHistory = [];
  }
  assertCondition(token.moveHistory.length > 0, 'Nenhum movimento para desfazer.', 400);
  const previousSquare = token.moveHistory.pop()!;
  const gridWidth = (scene as any).gridWidth ?? 30;
  const metersPerSquare = (scene as any).metersPerSquare ?? 1.5;
  const cost = calculateMovementCost(token.squareId, previousSquare, gridWidth, metersPerSquare);
  token.squareId = previousSquare;
  token.remainingMovement += cost;
  await token.save();
  return token.populate('ownerId', '_id username');
}

export type TokenUpdatePayload = Partial<Pick<IToken, 'name' | 'movement' | 'imageUrl' | 'size' | 'canOverlap'>> & {
  ownerId?: string;
  characterId?: string | null;
};

export async function updateToken(tokenId: string, payload: TokenUpdatePayload, options: { resetRemainingMovement?: boolean } = {}) {
  const token = await Token.findById(tokenId);
  assertCondition(!!token, 'Token não encontrado.', 404);

  if (payload.name !== undefined) token!.name = payload.name.trim();
  if (payload.movement !== undefined) {
    token!.movement = payload.movement;
    if (options.resetRemainingMovement) {
      token!.remainingMovement = payload.movement;
    } else if (token!.remainingMovement > token!.movement) {
      token!.remainingMovement = token!.movement;
    }
  }
  if (payload.imageUrl !== undefined) token!.imageUrl = payload.imageUrl;
  if (payload.ownerId !== undefined) token!.ownerId = new Types.ObjectId(payload.ownerId) as any;
  if (payload.size !== undefined) token!.size = payload.size;
  if (payload.canOverlap !== undefined) token!.canOverlap = payload.canOverlap;
  if (payload.characterId !== undefined) {
    const resolvedCharacter = await resolveCharacterForTable(payload.characterId, token!.tableId);
    token!.characterId = resolvedCharacter;
  }

  await token!.save();
  return token!.populate('ownerId', '_id username');
}

export async function deleteToken(tokenId: string) {
  await Token.findByIdAndDelete(tokenId);
}

export async function resetMovementForScene(sceneId: string) {
  await Token.updateMany(
    { sceneId },
    [
      {
        $set: {
          remainingMovement: '$movement',
          moveHistory: ['squareId'],
        },
      },
    ]
  );
}
