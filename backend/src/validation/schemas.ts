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
// Campos de URL opcionais chegam do formulário como `''` quando vazios.
// Tratar `''` como ausência evita erro de validação ao criar token/cena sem imagem.
const optionalUrlInput = z
  .union([optionalUrl, z.literal('')])
  .transform((value) => (value === '' ? undefined : value))
  .optional();
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
// Login aceita o formato novo `{ identifier, password }` (usuário OU email) e
// o formato legado `{ email, password }` de clientes antigos. Os dois são
// normalizados para `{ identifier, password }` antes de chegar ao handler.
const loginIdentifier = sanitizeText(z.string().trim().min(3).max(254));
const loginLegacyEmail = sanitizeText(z.string().trim().email().max(254));
const loginPassword = z.string().min(6).max(128);

export const zLoginRequest = z
  .object({
    identifier: loginIdentifier.optional(),
    email: loginLegacyEmail.optional(),
    password: loginPassword,
  })
  .superRefine((value, ctx) => {
    if (value.identifier === undefined && value.email === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identifier'],
        message: 'Informe seu nome de usuário ou email.',
      });
    }
  })
  .transform((value) => ({
    identifier: value.identifier ?? (value.email as string),
    password: value.password,
  }));

export const zRegisterRequest = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

// Realtime session ---------------------------------------------------------
// Compatibilidade: o cliente antigo enviava apenas a string do tableId.
export const zJoinTablePayload = z
  .union([z.object({ tableId }), z.string().trim().min(1).max(48)])
  .transform((value) => (typeof value === 'string' ? { tableId: value } : value));

export const zRequestResyncPayload = z.object({
  tableId,
  sinceRevision: z.number().int().min(0).optional(),
});

const expectedRevisionField = z.number().int().min(0).optional();

export const zSetActiveScenePayload = z.object({
  tableId,
  sceneId,
  expectedRevision: expectedRevisionField,
});

export const zUpdateSessionStatusPayload = z.object({
  tableId,
  newStatus: z.enum(['PREPARING', 'LIVE', 'PAUSED', 'ENDED']),
  pauseSeconds: z.number().int().min(0).max(86400).optional(),
});

export const zStartTransitionPayload = z.object({
  tableId,
  durationMs: z.number().int().min(0).max(60000).optional(),
});

export const zSetMapPayload = z.object({
  tableId,
  mapUrl: sanitizeText(z.string().trim().min(1).max(2048)),
});

export const zReorderScenesPayload = z.object({
  tableId,
  orderedSceneIds: z.array(objectId).min(1).max(200),
});

export const zUpdateGridDimensionsPayload = z.object({
  tableId,
  sceneId,
  newGridWidth: z.number().int().min(1).max(5000),
  newGridHeight: z.number().int().min(1).max(5000),
});

export const zUpdateSceneScalePayload = z.object({
  tableId,
  sceneId,
  metersPerSquare: z.number().positive().max(10000),
});

// Tokens -------------------------------------------------------------------
export const zPlaceTokenPayload = z.object({
  tableId,
  sceneId,
  squareId: z.string().trim().min(1).max(64),
  name: nameString,
  imageUrl: optionalUrlInput,
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
  expectedRevision: expectedRevisionField,
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
    imageUrl: optionalUrlInput,
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

export const zDeleteTokenPayload = z.object({
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
  expectedRevision: expectedRevisionField,
});

export const zEditInitiativeEntryPayload = z.object({
  tableId,
  sceneId,
  initiativeEntryId: objectId,
  newName: nameString,
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

export const zRemoveMeasurementPayload = z.object({
  tableId,
  sceneId,
});

// Auras --------------------------------------------------------------------
export const zUpsertAuraPayload = z.object({
  tableId,
  sceneId,
  tokenId: objectId,
  name: z.string().trim().min(1).max(100),
  color: hexColor,
  radiusMeters: z.number().min(0).max(10000),
  difficultTerrain: z.boolean().optional(),
});

export const zRemoveAuraPayload = z.object({
  tableId,
  sceneId,
  tokenId: objectId,
});

// Ping (efêmero) -----------------------------------------------------------
// `x`/`y` são unidades de grade (1 = uma célula), nunca pixels do dispositivo.
export const zPingPayload = z.object({
  tableId,
  sceneId,
  squareId: z.string().trim().min(1).max(64).optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  color: z.string().trim().min(1).max(32).optional(),
});

// Dice ---------------------------------------------------------------------
const dieSizeSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
  z.literal(20),
]);
const stepAttributeEnum = z.enum(['fisico', 'mente', 'emocao']);
const stepTargetEnum = z.enum(['attribute', 'skill']);
const opTableEnum = z.enum(['lesao', 'trauma', 'falha-critica']);

/** Payload do motor de passo do OP2 (ver docs/ORDEM_PARANORMAL.md §4). */
export const zStepRollPayload = z.object({
  attribute: stepAttributeEnum,
  attributeDie: dieSizeSchema,
  skillKey: trimmedString(1, 64),
  skillDie: dieSizeSchema,
  bonusDice: z.array(dieSizeSchema).max(2, { message: 'Limite de 2 dados bônus.' }).optional(),
  stepDelta: z.number().int().min(-2).max(2).optional(),
  stepTarget: stepTargetEnum.optional(),
  difficulty: z.number().int().min(1).max(100).optional(),
  dreadDie: dieSizeSchema.nullable().optional(),
  label: optionalTrimmedString(100).optional(),
  damageModifier: z.number().int().min(-100).max(100).optional(),
  damageMode: z.boolean().optional(),
});

/**
 * Compatibilidade: `expression` continua válida e sozinha. O payload aceita
 * exatamente um entre `expression`, `step` e `table`.
 */
export const zRollDicePayload = z
  .object({
    tableId,
    expression: trimmedString(1, 80).optional(),
    step: zStepRollPayload.optional(),
    table: opTableEnum.optional(),
    modifier: z.number().int().min(-10).max(10).optional(),
    tokenId: objectId.optional(),
    characterId: objectId.optional(),
    metadata: optionalTrimmedString(128).optional(),
    tags: z.array(tagSchema).max(8).optional(),
  })
  .superRefine((value, ctx) => {
    const modes = [value.expression, value.step, value.table].filter(
      (entry) => entry !== undefined
    ).length;
    if (modes === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expression'],
        message: 'Informe "expression", "step" ou "table".',
      });
    }
    if (modes > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expression'],
        message: 'Use apenas um entre "expression", "step" e "table".',
      });
    }
    if (value.modifier !== undefined && value.table === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modifier'],
        message: 'O modificador só se aplica a rolagens de tabela.',
      });
    }
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
const statValue = (max = 100000) => z.number().finite().min(0).max(max).optional();
const armorValue = () => z.number().finite().min(0).max(10000).optional();
export const zCharacterStats = z
  .object({
    currentHP: statValue(),
    maxHP: statValue(),
    defense: z.number().finite().min(0).max(10000).optional(),
    baseInitiative: z.number().finite().min(-50).max(1000).optional(),
    currentPD: statValue(),
    maxPD: statValue(),
    armorPoints: armorValue(),
    armorPointsMax: armorValue(),
    currentPE: statValue(),
    maxPE: statValue(),
    currentSAN: statValue(),
    maxSAN: statValue(),
  })
  .superRefine((stats, ctx) => {
    const pairs: Array<{
      current: keyof typeof stats;
      max: keyof typeof stats;
      message: string;
    }> = [
      { current: 'currentHP', max: 'maxHP', message: 'HP atual não pode exceder o máximo.' },
      { current: 'currentPD', max: 'maxPD', message: 'PD atual não pode exceder o máximo.' },
      { current: 'currentPE', max: 'maxPE', message: 'PE atual não pode exceder o máximo.' },
      { current: 'currentSAN', max: 'maxSAN', message: 'SAN atual não pode exceder o máximo.' },
      {
        current: 'armorPoints',
        max: 'armorPointsMax',
        message: 'Pontos de armadura atuais não podem exceder o máximo.',
      },
    ];
    pairs.forEach(({ current, max, message }) => {
      const currentValue = stats[current];
      const maxValue = stats[max];
      if (currentValue != null && maxValue != null && currentValue > maxValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [current as string],
          message,
        });
      }
    });
  });
const characterNotes = optionalTrimmedString(1024);
const characterKeyList = z
  .array(characterAttributeKey)
  .max(64, { message: 'Limite de 64 chaves.' })
  .optional();
const characterSystemKey = trimmedString(1, 64).optional();
const zCharacterProfile = z
  .object({
    className: optionalTrimmedString(100).optional(),
    level: z.number().int().min(0).max(100).optional(),
    race: optionalTrimmedString(100).optional(),
    background: optionalTrimmedString(100).optional(),
    alignment: optionalTrimmedString(100).optional(),
    speed: z.number().finite().min(0).max(100000).optional(),
    hitDice: optionalTrimmedString(32).optional(),
    perfil: z.enum(['executor', 'analista', 'vigilante']).optional(),
    vocacao: optionalTrimmedString(100).optional(),
    idade: z.number().int().min(0).max(1000).optional(),
    classe: optionalTrimmedString(100).optional(),
    origem: optionalTrimmedString(100).optional(),
    trilha: optionalTrimmedString(100).optional(),
    nex: z
      .union([z.number().int().min(0).max(100), trimmedString(1, 16)])
      .optional(),
    patente: optionalTrimmedString(100).optional(),
    conceito: optionalTrimmedString(500).optional(),
    profissao: optionalTrimmedString(100).optional(),
  })
  .optional();
const zCharacterFear = z
  .object({
    dreadDie: dieSizeSchema.nullable().optional(),
    active: z.boolean().optional(),
    notes: optionalTrimmedString(500).optional(),
  })
  .optional();
const zCharacterRelations = z
  .array(
    z.object({
      name: trimmedString(1, 100),
      grade: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      note: optionalTrimmedString(500).optional(),
    })
  )
  .max(20, { message: 'Limite de 20 relações.' })
  .optional();
const zCharacterRituals = z
  .array(
    z.object({
      name: trimmedString(1, 100),
      cost: optionalTrimmedString(100).optional(),
      circle: z
        .union([z.number().int().min(0).max(5), trimmedString(1, 16)])
        .optional(),
      description: optionalTrimmedString(2048).optional(),
    })
  )
  .max(50, { message: 'Limite de 50 rituais.' })
  .optional();
const zCharacterStringList = z
  .array(trimmedString(1, 100))
  .max(50, { message: 'Limite de 50 itens.' })
  .optional();
const zCharacterInjuries = z
  .array(
    z.union([
      trimmedString(1, 200),
      z.object({
        attribute: trimmedString(1, 100),
        penalty: z.number().finite().min(-100).max(100),
        note: optionalTrimmedString(500).optional(),
        /** Alguns clientes usam `notes`; aceitamos como alias. */
        notes: optionalTrimmedString(500).optional(),
      }),
    ])
  )
  .max(20, { message: 'Limite de 20 ferimentos.' })
  .optional();
const zCharacterSanityMode = z.enum(['san', 'pd']).optional();
const zCharacterProgressionMode = z.enum(['nex', 'patente', 'estagio']).optional();
const zCharacterAttacks = z
  .array(
    z.object({
      name: trimmedString(1, 100),
      bonus: optionalTrimmedString(64).optional(),
      damage: optionalTrimmedString(64).optional(),
      range: optionalTrimmedString(64).optional(),
      notes: optionalTrimmedString(1024).optional(),
    })
  )
  .max(50, { message: 'Limite de 50 ataques.' })
  .optional();
const zCharacterFeatures = z
  .array(
    z.object({
      name: trimmedString(1, 100),
      description: optionalTrimmedString(2048).optional(),
    })
  )
  .max(100, { message: 'Limite de 100 características.' })
  .optional();
const zCharacterInventory = z
  .array(
    z.object({
      name: trimmedString(1, 100),
      quantity: z.number().int().min(0).max(100000).optional(),
      notes: optionalTrimmedString(512).optional(),
    })
  )
  .max(200, { message: 'Limite de 200 itens.' })
  .optional();
const zCharacterSpellSlots = z
  .record(
    trimmedString(1, 16),
    z
      .object({
        used: z.number().int().min(0).max(1000).optional(),
        max: z.number().int().min(0).max(1000).optional(),
      })
      .superRefine((slot, ctx) => {
        if (slot.used !== undefined && slot.max !== undefined && slot.used > slot.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['used'],
            message: 'Espaços usados não podem exceder o máximo.',
          });
        }
      })
  )
  .refine((value) => Object.keys(value).length <= 20, {
    message: 'Limite de 20 níveis de magia.',
  })
  .optional();

const characterBodyBase = {
  name: nameString,
  avatarUrl: optionalUrlInput,
  systemKey: characterSystemKey,
  profile: zCharacterProfile,
  attributes: characterAttributes.optional(),
  stats: zCharacterStats.optional(),
  skills: characterSkills.optional(),
  proficientSaves: characterKeyList,
  proficientSkills: characterKeyList,
  expertiseSkills: characterKeyList,
  attacks: zCharacterAttacks,
  features: zCharacterFeatures,
  inventory: zCharacterInventory,
  spellSlots: zCharacterSpellSlots,
  fear: zCharacterFear,
  relations: zCharacterRelations,
  rituals: zCharacterRituals,
  conditions: zCharacterStringList,
  traumas: zCharacterStringList,
  injuries: zCharacterInjuries,
  sanityMode: zCharacterSanityMode,
  progressionMode: zCharacterProgressionMode,
  notes: characterNotes.optional(),
};

/** Campos de posse/escopo nunca podem ser trocados por patch de ficha. */
export const CHARACTER_FORBIDDEN_PATCH_FIELDS = ['ownerId', 'tableId'] as const;

function rejectForbiddenCharacterFields(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  CHARACTER_FORBIDDEN_PATCH_FIELDS.forEach((field) => {
    if (field in value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `O campo "${field}" não pode ser alterado por aqui.`,
      });
    }
  });
}

export const zCreateCharacter = z.object({
  ...characterBodyBase,
});

export const zUpdateCharacter = z
  .object({
    name: nameString.optional(),
    avatarUrl: optionalUrlInput,
    systemKey: characterSystemKey,
    profile: zCharacterProfile,
    attributes: characterAttributes.optional(),
    stats: zCharacterStats.optional(),
    skills: characterSkills.optional(),
    proficientSaves: characterKeyList,
    proficientSkills: characterKeyList,
    expertiseSkills: characterKeyList,
    attacks: zCharacterAttacks,
    features: zCharacterFeatures,
    inventory: zCharacterInventory,
    spellSlots: zCharacterSpellSlots,
    fear: zCharacterFear,
    relations: zCharacterRelations,
    rituals: zCharacterRituals,
    conditions: zCharacterStringList,
    traumas: zCharacterStringList,
    injuries: zCharacterInjuries,
    sanityMode: zCharacterSanityMode,
    progressionMode: zCharacterProgressionMode,
    notes: characterNotes.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    rejectForbiddenCharacterFields(value as Record<string, unknown>, ctx);
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe ao menos um campo para atualizar.',
      });
    }
  });

// Fichas em tempo real -----------------------------------------------------
const characterId = objectId;

export const zCreateCharacterPayload = z.object({
  tableId,
  character: zCreateCharacter,
  /** Só o Mestre pode criar ficha para outro membro da mesa. */
  ownerId: objectId.optional(),
});

export const zUpdateCharacterPayload = z.object({
  tableId,
  characterId,
  patch: zUpdateCharacter,
  expectedRevision: expectedRevisionField,
});

export const zDeleteCharacterPayload = z.object({
  tableId,
  characterId,
});

export const zUpdateCharacterHpPayload = z.object({
  tableId,
  characterId,
  currentHP: z.number().int().min(0).max(100000),
  expectedRevision: expectedRevisionField,
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
    mapUrl: optionalUrlInput,
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
  imageUrl: optionalUrlInput,
  size: tokenSizeEnum.optional(),
  color: optionalTrimmedString(32).optional(),
  systemId: templateSystemId,
  tags: z.array(tagSchema).max(16).optional(),
  baseMovement: z.number().positive().max(10000).optional(),
});

export const zUpdateTokenTemplate = z
  .object({
    name: nameString.optional(),
    imageUrl: optionalUrlInput,
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
    docsUrl: optionalUrlInput,
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  });

  export const zTableIdParams = z.object({
    tableId,
  });

  export const zRollHistoryQuery = z.object({
    limit: queryLimit,
    /** Paginação por cursor: retorna rolagens estritamente mais antigas que este instante. */
    before: coerceQueryValue(
      z
        .string()
        .trim()
        .min(1)
        .refine((value) => !Number.isNaN(Date.parse(value)), {
          message: 'Data "before" inválida.',
        })
    ).optional(),
  });

// Media (Fase 5) -----------------------------------------------------------
// Sinalização WebRTC é efêmera: os payloads abaixo não alteram `revision`.
const mediaPeerId = trimmedString(1, 64);
const SDP_MAX_BYTES = 64 * 1024;
const ICE_CANDIDATE_MAX_BYTES = 4 * 1024;

export const zMediaJoinPayload = z.object({
  tableId,
});

export const zMediaLeavePayload = z.object({
  tableId,
});

export const zMediaStatePayload = z.object({
  tableId,
  mic: z.enum(['on', 'muted']),
  deafened: z.boolean(),
  camera: z.enum(['on', 'off']),
  screen: z.boolean(),
});

export const zMediaSpeakingPayload = z.object({
  tableId,
  speaking: z.boolean(),
});

export const zMediaSignalPayload = z.object({
  tableId,
  toPeerId: mediaPeerId,
  /** RTCSessionDescriptionInit: `{ type, sdp }` (mesma forma que o browser usa). */
  sdp: z
    .object({
      type: z.enum(['offer', 'answer']),
      sdp: sanitizeText(z.string().min(1).max(SDP_MAX_BYTES)),
    })
    .superRefine((value, ctx) => {
      if (Buffer.byteLength(value.sdp, 'utf8') > SDP_MAX_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sdp'],
          message: 'SDP excede o limite de 64 KB.',
        });
      }
    }),
});

export const zMediaIcePayload = z
  .object({
    tableId,
    toPeerId: mediaPeerId,
    /** RTCIceCandidateInit (objeto), string ou null (fim dos candidatos). */
    candidate: z.unknown(),
  })
  .superRefine((value, ctx) => {
    if (value.candidate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidate'],
        message: 'Candidate ICE ausente.',
      });
      return;
    }
    let size = Number.POSITIVE_INFINITY;
    try {
      size = Buffer.byteLength(JSON.stringify(value.candidate ?? null) ?? '', 'utf8');
    } catch {
      size = Number.POSITIVE_INFINITY;
    }
    if (!Number.isFinite(size) || size > ICE_CANDIDATE_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidate'],
        message: 'Candidate ICE excede o limite de 4 KB.',
      });
    }
  });

export const zMediaKickPayload = z.object({
  tableId,
  peerId: mediaPeerId,
});

// Chat (Fase 5) ------------------------------------------------------------
// Texto puro: o servidor nunca renderiza HTML; o cliente escapa na exibição.
export const zSendChatMessagePayload = z.object({
  tableId,
  text: trimmedString(1, 1000),
  mentions: z.array(trimmedString(1, 64)).max(10).optional(),
});

export const zChatHistoryQuery = z.object({
  limit: coerceQueryValue(z.coerce.number().int().min(1).max(100)).optional(),
  /** Paginação por cursor: mensagens estritamente mais antigas que este instante. */
  before: coerceQueryValue(
    z
      .string()
      .trim()
      .min(1)
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'Data "before" inválida.',
      })
  ).optional(),
});

// Types --------------------------------------------------------------------
export type LoginRequest = z.infer<typeof zLoginRequest>;
export type RegisterRequest = z.infer<typeof zRegisterRequest>;
export type JoinTablePayload = z.infer<typeof zJoinTablePayload>;
export type RequestResyncPayload = z.infer<typeof zRequestResyncPayload>;
export type SetActiveScenePayload = z.infer<typeof zSetActiveScenePayload>;
export type UpdateSessionStatusPayload = z.infer<typeof zUpdateSessionStatusPayload>;
export type StartTransitionPayload = z.infer<typeof zStartTransitionPayload>;
export type SetMapPayload = z.infer<typeof zSetMapPayload>;
export type ReorderScenesPayload = z.infer<typeof zReorderScenesPayload>;
export type UpdateGridDimensionsPayload = z.infer<typeof zUpdateGridDimensionsPayload>;
export type UpdateSceneScalePayload = z.infer<typeof zUpdateSceneScalePayload>;
export type EditInitiativeEntryPayload = z.infer<typeof zEditInitiativeEntryPayload>;
export type RemoveMeasurementPayload = z.infer<typeof zRemoveMeasurementPayload>;
export type UpsertAuraPayload = z.infer<typeof zUpsertAuraPayload>;
export type RemoveAuraPayload = z.infer<typeof zRemoveAuraPayload>;
export type PingPayload = z.infer<typeof zPingPayload>;
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
export type StepRollPayload = z.infer<typeof zStepRollPayload>;
export type OpTableKey = z.infer<typeof opTableEnum>;
export type CharacterStatsInput = z.infer<typeof zCharacterStats>;
export type CharacterFearInput = z.infer<typeof zCharacterFear>;
export type CharacterRelationInput = z.infer<typeof zCharacterRelations>;
export type CharacterRitualInput = z.infer<typeof zCharacterRituals>;
export type CharacterInjuryInput = z.infer<typeof zCharacterInjuries>;
export type CreateCharacterPayload = z.infer<typeof zCreateCharacter>;
export type UpdateCharacterPayload = z.infer<typeof zUpdateCharacter>;
export type CharacterProfileInput = z.infer<typeof zCharacterProfile>;
export type CreateCharacterSocketPayload = z.infer<typeof zCreateCharacterPayload>;
export type UpdateCharacterSocketPayload = z.infer<typeof zUpdateCharacterPayload>;
export type DeleteCharacterSocketPayload = z.infer<typeof zDeleteCharacterPayload>;
export type UpdateCharacterHpSocketPayload = z.infer<typeof zUpdateCharacterHpPayload>;
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
export type MediaJoinPayload = z.infer<typeof zMediaJoinPayload>;
export type MediaLeavePayload = z.infer<typeof zMediaLeavePayload>;
export type MediaStatePayload = z.infer<typeof zMediaStatePayload>;
export type MediaSpeakingPayload = z.infer<typeof zMediaSpeakingPayload>;
export type MediaSignalPayload = z.infer<typeof zMediaSignalPayload>;
export type MediaIcePayload = z.infer<typeof zMediaIcePayload>;
export type MediaKickPayload = z.infer<typeof zMediaKickPayload>;
export type SendChatMessagePayload = z.infer<typeof zSendChatMessagePayload>;
export type ChatHistoryQuery = z.infer<typeof zChatHistoryQuery>;

export const schemas = {
  zLoginRequest,
  zRegisterRequest,
  zJoinTablePayload,
  zRequestResyncPayload,
  zSetActiveScenePayload,
  zUpdateSessionStatusPayload,
  zStartTransitionPayload,
  zSetMapPayload,
  zReorderScenesPayload,
  zUpdateGridDimensionsPayload,
  zUpdateSceneScalePayload,
  zEditInitiativeEntryPayload,
  zRemoveMeasurementPayload,
  zUpsertAuraPayload,
  zRemoveAuraPayload,
  zPingPayload,
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
  zStepRollPayload,
  zCharacterStats,
  zCreateCharacter,
  zUpdateCharacter,
  zCreateCharacterPayload,
  zUpdateCharacterPayload,
  zDeleteCharacterPayload,
  zUpdateCharacterHpPayload,
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
  zMediaJoinPayload,
  zMediaLeavePayload,
  zMediaStatePayload,
  zMediaSpeakingPayload,
  zMediaSignalPayload,
  zMediaIcePayload,
  zMediaKickPayload,
  zSendChatMessagePayload,
  zChatHistoryQuery,
};
