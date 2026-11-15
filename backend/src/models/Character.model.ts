import { Schema, model, Document, Types } from 'mongoose';

export interface CharacterStats {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  baseInitiative?: number;
}

export interface CharacterProfile {
  className?: string;
  level?: number;
  race?: string;
  background?: string;
  alignment?: string;
  speed?: number;
  hitDice?: string;
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
    },
    skills: { type: Map, of: Schema.Types.Mixed, default: {} },
    proficientSaves: [{ type: String }],
    proficientSkills: [{ type: String }],
    expertiseSkills: [{ type: String }],
    attacks: { type: [CharacterAttackSchema], default: [] },
    features: { type: [CharacterFeatureSchema], default: [] },
    inventory: { type: [CharacterInventoryItemSchema], default: [] },
    spellSlots: { type: Map, of: CharacterSpellSlotSchema, default: {} },
    notes: { type: String },
  },
  { timestamps: true }
);

CharacterSchema.index({ ownerId: 1, tableId: 1 });

export default model<ICharacter>('Character', CharacterSchema);
