import { z } from 'zod';

// Helpers ------------------------------------------------------------------
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
const sanitizeText = (schema: z.ZodString) =>
  schema.refine((value) => !CONTROL_CHAR_REGEX.test(value), { message: 'Texto contém caracteres inválidos.' });
const trimmedString = (min: number, max: number) => sanitizeText(z.string().trim().min(min).max(max));
const optionalTrimmedString = (max: number) => sanitizeText(z.string().trim().max(max));
const coerceQueryValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) return value[0];
    return value;
  }, schema);

const objectId = trimmedString(1, 48);
const nullableObjectId = objectId.nullable();
const tableId = objectId;
const sceneId = objectId;
const nameString = trimmedString(1, 100);
const optionalUrl = sanitizeText(z.string().trim().url().max(2048));
const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
const measurementTypes = z.enum(['ruler', 'cone', 'circle', 'square', 'line', 'beam']);
const tagSchema = z.string().trim().min(1).max(32);
const tokenSizeValues = ['Pequeno/Médio', 'Grande', 'Enorme', 'Descomunal', 'Colossal'] as const;
const tokenSizeEnum = z.enum([...tokenSizeValues]);
const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Cor inválida. Use #RGB ou #RRGGBB.');
const nullableHexColor = hexColor.nullable();
const nullableString = (max: number) => z.union([optionalTrimmedString(max), z.null()]);
const queryLimit = z.coerce.number().int().min(1).max(200).optional();

// Auth ---------------------------------------------------------------------
export const zLoginRequest = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

export const zRegisterRequest = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

// Tokens -------------------------------------------------------------------
export const zPlaceTokenPayload = z.object({
  tableId,
  sceneId,
  squareId: z.string().trim().min(1).max(64),
  name: nameString,
  imageUrl: optionalUrl.optional(),
  movement: z.number().int().min(0).max(1000).optional(),
  remainingMovement: z.number().int().min(0).max(1000).optional(),
  ownerId: objectId.optional(),
  size: tokenSizeEnum,
  canOverlap: z.boolean().optional(),
  characterId: z.union([objectId, z.null()]).optional(),
});

export const zMoveTokenPayload = z.object({
  tableId,
  tokenId: objectId,
  targetSquareId: z.string().trim().min(1).max(64),
});

export const zAssignTokenPayload = z.object({
  tableId,
  tokenId: objectId,
  newOwnerId: objectId,
});

const tokenEditPatch = z
  .object({
    name: nameString.optional(),
    movement: z.number().int().min(0).max(1000).optional(),
    imageUrl: optionalUrl.optional(),
    ownerId: objectId.optional(),
    size: tokenSizeEnum.optional(),
    resetRemainingMovement: z.boolean().optional(),
    canOverlap: z.boolean().optional(),
    characterId: z.union([objectId, z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo para atualizar.' });

export const zEditTokenPayload = z.object({
  tableId,
  tokenId: objectId,
  patch: tokenEditPatch,
});

export const zUndoMovePayload = z.object({
  tableId,
  tokenId: objectId,
});

// Initiative ---------------------------------------------------------------
const initiativeEntryShape = z
  .object({
    _id: objectId.optional(),
    tokenId: objectId.optional(),
    characterId: objectId.optional(),
    characterName: z.string().trim().min(1).max(100).optional(),
    isCurrentTurn: z.boolean().optional(),
  })
  .passthrough();

export const zAddInitiativeEntryPayload = z.object({
  tableId,
  sceneId,
  tokenId: objectId,
});

export const zRemoveInitiativeEntryPayload = z.object({
  tableId,
  sceneId,
  initiativeEntryId: objectId,
});

export const zReorderInitiativePayload = z.object({
  tableId,
  sceneId,
  newOrder: z.array(initiativeEntryShape).min(1),
});

export const zNextTurnPayload = z.object({
  tableId,
  sceneId,
});

// Measurements -------------------------------------------------------------
const measurementBase = z.object({
  start: pointSchema,
  end: pointSchema,
  distance: z.string().trim().min(1).max(64),
  type: measurementTypes.optional(),
  affectedSquares: z.array(z.string().trim().min(1).max(64)).max(256).optional(),
  color: z.string().trim().min(1).max(32).optional(),
});

export const zShareMeasurementPayload = z
  .object({ tableId, sceneId })
  .merge(measurementBase);

export const zAddPersistentMeasurementPayload = z.object({
  tableId,
  sceneId,
  payload: measurementBase.extend({ id: z.string().trim().min(1).max(64).optional() }),
});

export const zRemovePersistentMeasurementPayload = z.object({
  tableId,
  sceneId,
  id: z.string().trim().min(1).max(64),
});

export const zClearAllMeasurementsPayload = z.object({
  tableId,
  sceneId,
});

// Dice ---------------------------------------------------------------------
export const zRollDicePayload = z.object({
  tableId,
  expression: trimmedString(1, 64),
  tokenId: objectId.optional(),
  characterId: objectId.optional(),
  metadata: optionalTrimmedString(128).optional(),
  tags: z.array(tagSchema).max(8).optional(),
});

// Characters ---------------------------------------------------------------
const characterAttributeKey = trimmedString(1, 64);
const characterAttributes = z
  .record(characterAttributeKey, z.number().finite())
  .refine((value) => Object.keys(value).length <= 64, { message: 'Limite de 64 atributos.' });
const characterSkillValue = z.union([z.number().finite(), trimmedString(1, 256)]);
const characterSkills = z
  .record(characterAttributeKey, characterSkillValue)
  .refine((value) => Object.keys(value).length <= 64, { message: 'Limite de 64 perícias.' });
const zCharacterStats = z
  .object({
    currentHP: z.number().finite().min(0).max(100000).optional(),
    maxHP: z.number().finite().min(0).max(100000).optional(),
    defense: z.number().finite().min(0).max(10000).optional(),
    baseInitiative: z.number().finite().min(-50).max(1000).optional(),
  })
  .superRefine((stats, ctx) => {
    if (
      stats.currentHP !== undefined &&
      stats.maxHP !== undefined &&
      stats.currentHP > stats.maxHP
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentHP'],
        message: 'HP atual não pode exceder o máximo.',
      });
    }
  });
const characterNotes = optionalTrimmedString(1024);

const characterBodyBase = {
  name: nameString,
  avatarUrl: optionalUrl.optional(),
  attributes: characterAttributes.optional(),
  stats: zCharacterStats.optional(),
  skills: characterSkills.optional(),
  notes: characterNotes.optional(),
};

export const zCreateCharacter = z.object({
  ...characterBodyBase,
});

export const zUpdateCharacter = z
  .object({
    name: nameString.optional(),
    avatarUrl: optionalUrl.optional(),
    attributes: characterAttributes.optional(),
    stats: zCharacterStats.optional(),
    skills: characterSkills.optional(),
    notes: characterNotes.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

// Templates ---------------------------------------------------------------
const templateSystemId = nullableObjectId.optional();
const gridDimension = z.number().int().min(1).max(5000);
const metersPerSquare = z.number().positive().max(10000);
const sceneTemplateTypes = z.enum(['battlemap', 'image']);

export const zCreateSceneTemplate = z.object({
  name: nameString,
  mapUrl: optionalUrl,
  type: sceneTemplateTypes.optional(),
  gridWidth: gridDimension.optional(),
  gridHeight: gridDimension.optional(),
  defaultMetersPerSquare: metersPerSquare.optional(),
  systemId: templateSystemId,
});

export const zUpdateSceneTemplate = z
  .object({
    name: nameString.optional(),
    mapUrl: optionalUrl.optional(),
    type: sceneTemplateTypes.optional(),
    gridWidth: gridDimension.optional(),
    gridHeight: gridDimension.optional(),
    defaultMetersPerSquare: metersPerSquare.optional(),
    systemId: templateSystemId,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export const zCreateTokenTemplate = z.object({
  name: nameString,
  imageUrl: optionalUrl.optional(),
  size: tokenSizeEnum.optional(),
  color: optionalTrimmedString(32).optional(),
  systemId: templateSystemId,
  tags: z.array(tagSchema).max(16).optional(),
  baseMovement: z.number().positive().max(10000).optional(),
});

export const zUpdateTokenTemplate = z
  .object({
    name: nameString.optional(),
    imageUrl: optionalUrl.optional(),
    size: tokenSizeEnum.optional(),
    color: optionalTrimmedString(32).optional(),
    systemId: templateSystemId,
    tags: z.array(tagSchema).max(16).optional(),
    baseMovement: z.number().positive().max(10000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export const zTemplateListQuery = z.object({
  systemId: coerceQueryValue(objectId).optional(),
});

// Profile -----------------------------------------------------------------
export const zUpdateProfilePayload = z
  .object({
    displayName: nullableString(80).optional(),
    avatarUrl: nullableString(1024).optional(),
    bio: nullableString(1024).optional(),
    preferredSystemId: nullableObjectId.optional(),
    measurementColor: nullableHexColor.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

// Systems -----------------------------------------------------------------
export const zSystemKeyParams = z.object({
    key: trimmedString(1, 64),
});

export const zSystemIdParams = z.object({
  id: objectId,
});

  const attributeTypeEnum = z.enum(['number', 'text', 'boolean']);
  const diagonalRuleEnum = z.enum(['5-10-5', '5', 'euclidean']);

  export const zSystemDTO = z.object({
    _id: objectId,
    key: trimmedString(1, 64),
    name: nameString,
    description: optionalTrimmedString(2048).optional(),
    defaultAttributes: z
      .array(
        z.object({
          key: trimmedString(1, 64),
          label: trimmedString(1, 100),
          type: attributeTypeEnum,
        })
      )
      .optional(),
    movementRules: z
      .object({
        baseSpeedFeet: z.number().positive().max(10000).optional(),
        diagonalRule: diagonalRuleEnum.optional(),
        gridSizeFeet: z.number().positive().max(1000).optional(),
      })
      .optional(),
    dicePresets: z
      .array(
        z.object({
          key: trimmedString(1, 64),
          label: trimmedString(1, 100),
          expression: trimmedString(1, 64),
          category: optionalTrimmedString(64).optional(),
        })
      )
      .optional(),
    docsUrl: optionalUrl.optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  });

  export const zTableIdParams = z.object({
    tableId,
  });

  export const zRollHistoryQuery = z.object({
    limit: queryLimit,
  });

// Types --------------------------------------------------------------------
export type LoginRequest = z.infer<typeof zLoginRequest>;
export type RegisterRequest = z.infer<typeof zRegisterRequest>;
export type PlaceTokenPayloadInput = z.infer<typeof zPlaceTokenPayload>;
export type MoveTokenPayload = z.infer<typeof zMoveTokenPayload>;
export type AssignTokenPayload = z.infer<typeof zAssignTokenPayload>;
export type EditTokenPayload = z.infer<typeof zEditTokenPayload>;
export type UndoMovePayload = z.infer<typeof zUndoMovePayload>;
export type AddInitiativeEntryPayload = z.infer<typeof zAddInitiativeEntryPayload>;
export type RemoveInitiativeEntryPayload = z.infer<typeof zRemoveInitiativeEntryPayload>;
export type ReorderInitiativePayload = z.infer<typeof zReorderInitiativePayload>;
export type NextTurnPayload = z.infer<typeof zNextTurnPayload>;
export type ShareMeasurementPayload = z.infer<typeof zShareMeasurementPayload>;
export type AddPersistentMeasurementPayload = z.infer<typeof zAddPersistentMeasurementPayload>;
export type RemovePersistentMeasurementPayload = z.infer<typeof zRemovePersistentMeasurementPayload>;
export type ClearAllMeasurementsPayload = z.infer<typeof zClearAllMeasurementsPayload>;
export type RollDicePayload = z.infer<typeof zRollDicePayload>;
export type CharacterStatsInput = z.infer<typeof zCharacterStats>;
export type CreateCharacterPayload = z.infer<typeof zCreateCharacter>;
export type UpdateCharacterPayload = z.infer<typeof zUpdateCharacter>;
export type CreateSceneTemplatePayload = z.infer<typeof zCreateSceneTemplate>;
export type UpdateSceneTemplatePayload = z.infer<typeof zUpdateSceneTemplate>;
export type CreateTokenTemplatePayload = z.infer<typeof zCreateTokenTemplate>;
export type UpdateTokenTemplatePayload = z.infer<typeof zUpdateTokenTemplate>;
export type TemplateListQuery = z.infer<typeof zTemplateListQuery>;
export type UpdateProfilePayload = z.infer<typeof zUpdateProfilePayload>;
export type SystemKeyParams = z.infer<typeof zSystemKeyParams>;
export type SystemIdParams = z.infer<typeof zSystemIdParams>;
export type SystemDTO = z.infer<typeof zSystemDTO>;
export type TableIdParams = z.infer<typeof zTableIdParams>;
export type RollHistoryQuery = z.infer<typeof zRollHistoryQuery>;

export const schemas = {
  zLoginRequest,
  zRegisterRequest,
  zPlaceTokenPayload,
  zMoveTokenPayload,
  zAssignTokenPayload,
  zEditTokenPayload,
  zUndoMovePayload,
  zAddInitiativeEntryPayload,
  zRemoveInitiativeEntryPayload,
  zReorderInitiativePayload,
  zNextTurnPayload,
  zShareMeasurementPayload,
  zAddPersistentMeasurementPayload,
  zRemovePersistentMeasurementPayload,
  zClearAllMeasurementsPayload,
  zRollDicePayload,
  zCharacterStats,
  zCreateCharacter,
  zUpdateCharacter,
  zCreateSceneTemplate,
  zUpdateSceneTemplate,
  zCreateTokenTemplate,
  zUpdateTokenTemplate,
  zTemplateListQuery,
  zUpdateProfilePayload,
  zSystemKeyParams,
  zSystemIdParams,
  zSystemDTO,
  zTableIdParams,
  zRollHistoryQuery,
};
