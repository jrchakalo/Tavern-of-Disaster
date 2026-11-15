import { Schema, model, Document, Types } from 'mongoose';

export type CharacterSanityMode = 'san' | 'pd';
export type CharacterRelationGrade = 1 | 2 | 3;

export interface CharacterStats {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  baseInitiative?: number;
  /** Ordem Paranormal 2 / Sobrevivendo ao Horror. */
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
  currentPE?: number;
  maxPE?: number;
  currentSAN?: number;
  maxSAN?: number;
}

export interface CharacterProfile {
  className?: string;
  level?: number;
  race?: string;
  background?: string;
  alignment?: string;
  speed?: number;
  hitDice?: string;
  /** Ordem Paranormal 2. */
  perfil?: string;
  vocacao?: string;
  idade?: number;
  /** OPSH (e aliases do OP1). */
  classe?: string;
  origem?: string;
  trilha?: string;
  nex?: number;
  patente?: string;
  conceito?: string;
}

export interface CharacterAttack {
  name: string;
  bonus?: string;
  damage?: string;
  notes?: string;
}

export interface CharacterFeature {
  name: string;
  description?: string;
}

export interface CharacterInventoryItem {
  name: string;
  quantity?: number;
  notes?: string;
}

export interface CharacterSpellSlot {
  used?: number;
  max?: number;
}

export interface CharacterFear {
  dreadDie?: number | null;
  active?: boolean;
  notes?: string;
}

export interface CharacterRelation {
  name: string;
  grade: CharacterRelationGrade;
  note?: string;
}

export interface CharacterRitual {
  name: string;
  cost?: string;
  circle?: number;
  description?: string;
}

export interface CharacterInjury {
  attribute: string;
  penalty: number;
  note?: string;
}

export interface ICharacter extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  tableId: Types.ObjectId;
  name: string;
  avatarUrl?: string;
  systemKey?: string;
  profile?: CharacterProfile;
  attributes?: Record<string, number>;
  stats?: CharacterStats;
  skills?: Record<string, number | string>;
  proficientSaves?: string[];
  proficientSkills?: string[];
  expertiseSkills?: string[];
  attacks?: CharacterAttack[];
  features?: CharacterFeature[];
  inventory?: CharacterInventoryItem[];
  spellSlots?: Record<string, CharacterSpellSlot>;
  /** Ordem Paranormal 2 / OPSH. */
  fear?: CharacterFear;
  relations?: CharacterRelation[];
  rituals?: CharacterRitual[];
  conditions?: string[];
  traumas?: string[];
  injuries?: CharacterInjury[];
  sanityMode?: CharacterSanityMode;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterProfileSchema = new Schema<CharacterProfile>(
  {
    className: { type: String },
    level: { type: Number, min: 0, max: 100 },
    race: { type: String },
    background: { type: String },
    alignment: { type: String },
    speed: { type: Number, min: 0 },
    hitDice: { type: String },
    perfil: { type: String },
    vocacao: { type: String },
    idade: { type: Number, min: 0, max: 1000 },
    classe: { type: String },
    origem: { type: String },
    trilha: { type: String },
    nex: { type: Number, min: 0, max: 100 },
    patente: { type: String },
    conceito: { type: String },
  },
  { _id: false }
);

const CharacterAttackSchema = new Schema<CharacterAttack>(
  {
    name: { type: String, required: true },
    bonus: { type: String },
    damage: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const CharacterFeatureSchema = new Schema<CharacterFeature>(
  {
    name: { type: String, required: true },
    description: { type: String },
  },
  { _id: false }
);

const CharacterInventoryItemSchema = new Schema<CharacterInventoryItem>(
  {
    name: { type: String, required: true },
    quantity: { type: Number, min: 0 },
    notes: { type: String },
  },
  { _id: false }
);

const CharacterSpellSlotSchema = new Schema<CharacterSpellSlot>(
  {
    used: { type: Number, min: 0 },
    max: { type: Number, min: 0 },
  },
  { _id: false }
);

const CharacterFearSchema = new Schema<CharacterFear>(
  {
    dreadDie: { type: Number, min: 0, default: undefined },
    active: { type: Boolean },
    notes: { type: String },
  },
  { _id: false }
);

const CharacterRelationSchema = new Schema<CharacterRelation>(
  {
    name: { type: String, required: true },
    grade: { type: Number, required: true, enum: [1, 2, 3] },
    note: { type: String },
  },
  { _id: false }
);

const CharacterRitualSchema = new Schema<CharacterRitual>(
  {
    name: { type: String, required: true },
    cost: { type: String },
    circle: { type: Number, min: 0, max: 5 },
    description: { type: String },
  },
  { _id: false }
);

const CharacterInjurySchema = new Schema<CharacterInjury>(
  {
    attribute: { type: String, required: true },
    penalty: { type: Number, required: true },
    note: { type: String },
  },
  { _id: false }
);

const CharacterSchema = new Schema<ICharacter>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    systemKey: { type: String, trim: true },
    profile: { type: CharacterProfileSchema, default: undefined },
    attributes: { type: Map, of: Number, default: {} },
    stats: {
      currentHP: { type: Number, min: 0 },
      maxHP: { type: Number, min: 0 },
      defense: { type: Number, min: 0 },
      baseInitiative: { type: Number },
      currentPD: { type: Number, min: 0 },
      maxPD: { type: Number, min: 0 },
      armorPoints: { type: Number, min: 0 },
      armorPointsMax: { type: Number, min: 0 },
      currentPE: { type: Number, min: 0 },
      maxPE: { type: Number, min: 0 },
      currentSAN: { type: Number, min: 0 },
      maxSAN: { type: Number, min: 0 },
    },
    skills: { type: Map, of: Schema.Types.Mixed, default: {} },
    proficientSaves: [{ type: String }],
    proficientSkills: [{ type: String }],
    expertiseSkills: [{ type: String }],
    attacks: { type: [CharacterAttackSchema], default: [] },
    features: { type: [CharacterFeatureSchema], default: [] },
    inventory: { type: [CharacterInventoryItemSchema], default: [] },
    spellSlots: { type: Map, of: CharacterSpellSlotSchema, default: {} },
    fear: { type: CharacterFearSchema, default: undefined },
    relations: { type: [CharacterRelationSchema], default: [] },
    rituals: { type: [CharacterRitualSchema], default: [] },
    conditions: { type: [String], default: [] },
    traumas: { type: [String], default: [] },
    injuries: { type: [CharacterInjurySchema], default: [] },
    sanityMode: { type: String, enum: ['san', 'pd'] },
    notes: { type: String },
  },
  { timestamps: true }
);

CharacterSchema.index({ ownerId: 1, tableId: 1 });

export default model<ICharacter>('Character', CharacterSchema);
