export const tokenSizes = ['Pequeno/Médio', 'Grande', 'Enorme', 'Descomunal', 'Colossal'] as const;
export type TokenSize = typeof tokenSizes[number];

export type KeptFlag = 'kept' | 'dropped';

export type AttributeType = 'number' | 'text' | 'boolean';
export type DiagonalRule = '5-10-5' | '5' | 'euclidean';

export interface SystemDTO {
  _id: string;
  key: string;
  name: string;
  description?: string;
  defaultAttributes?: Array<{
    key: string;
    label: string;
    type: AttributeType;
  }>;
  movementRules?: {
    baseSpeedFeet?: number;
    diagonalRule?: DiagonalRule;
    gridSizeFeet?: number;
  };
  dicePresets?: Array<{
    key: string;
    label: string;
    expression: string;
    category?: string;
  }>;
  docsUrl?: string | null;
}

export interface SingleDieRoll {
  die: number;
  value: number;
  kept: KeptFlag;
}

export interface TokenInfo {
  _id: string;
  tableId?: string;
  squareId: string;
  color: string;
  ownerId?: TokenOwner | null;
  name: string; 
  imageUrl?: string; 
  sceneId: string;
  movement: number;
  remainingMovement: number;
  size: TokenSize;
  canOverlap?: boolean;
  characterId?: string | null;
  /** Resumo da ficha vinculada (PV/CA em tempo real); `null` quando desvinculado. */
  character?: CharacterSummaryLite | null;
}

export interface TokenOwner {
    _id: string;
    username: string;
}

export interface GridSquare {
  id: string;
  token?: TokenInfo | null;
}

export interface ITable {
  _id: string;
  name: string;
  dm: PlayerInfo;
  players: PlayerInfo[];
  inviteCode: string;
  activeSceneId?: string | null | undefined;
  status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
  pauseUntil?: string | null;
  systemId?: string | null;
  systemKey?: string | null;
  systemName?: string | null;
}

export interface PlayerInfo {
  _id: string;
  username: string;
}

export interface IInitiativeEntry {
  _id: string;
  characterName: string;
  tokenId?: string;
  characterId?: string;
  isCurrentTurn: boolean;
}

export interface IScene {
  _id: string; 
  tableId: string;
  name: string;
  imageUrl?: string;
  gridWidth?: number; // Número de colunas (largura) da grade
  gridHeight?: number; // Número de linhas (altura) da grade
  type?: 'battlemap' | 'image';
  initiative?: IInitiativeEntry[];
  metersPerSquare?: number;
}

// Auras persistentes ancoradas a tokens
export interface AuraInfo {
  id: string; // normalmente igual ao tokenId
  tokenId: string;
  sceneId: string;
  tableId: string;
  name: string;
  color: string;
  radiusMeters: number;
  ownerId: string; // dono do token (ou de quem criou)
  difficultTerrain?: boolean;
}

/** Tamanho de dado usado pelas fichas de Ordem Paranormal. */
export type DieSize = 4 | 6 | 8 | 10 | 12 | 20;

export interface CharacterStats {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  baseInitiative?: number;
  /** Ordem Paranormal 2: Pontos de Determinação. */
  currentPD?: number;
  maxPD?: number;
  /** Ordem Paranormal 2: pontos de armadura atuais/máximos (−10 dano cada). */
  armorPoints?: number;
  armorPointsMax?: number;
  /** Ordem Paranormal: Sobrevivendo ao Horror — modo Sanidade. */
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
  /** Ordem Paranormal 2 — identidade (campos aditivos; D&D ignora). */
  perfil?: 'executor' | 'analista' | 'vigilante';
  vocacao?: string;
  idade?: number;
  /** Ordem Paranormal: Sobrevivendo ao Horror (base OP1). */
  classe?: string;
  origem?: string;
  trilha?: string;
  nex?: string;
  patente?: string;
  conceito?: string;
  /** Campo livre da perícia Profissão (OP1/OPSH). */
  profissao?: string;
}

export interface CharacterAttack {
  name: string;
  bonus?: string;
  /** Dano no formato do sistema; OP2 usa `RA+3`, D&D usa `1d8+3`. */
  damage?: string;
  /** Alcance textual (OP2: corpo a corpo, curto, longo…). */
  range?: string;
  notes?: string;
}

/** Medo/pavor do OP2: dado de pavor que acompanha o teste sem somar. */
export interface CharacterFear {
  dreadDie?: DieSize | null;
  active?: boolean;
  notes?: string;
}

/** Relação do OP2 — graus 1 (afinidade), 2 (vínculo) e 3 (devoção). */
export interface CharacterRelation {
  name: string;
  grade: 1 | 2 | 3;
  note?: string;
}

export interface CharacterRitual {
  name: string;
  /** Custo em PE/PD, quando houver. */
  cost?: string;
  description?: string;
  /** OPSH: círculo do ritual (1..5 ou texto livre). */
  circle?: string;
}

/**
 * Ferimento debilitante do OPSH. No OP2 a lista de lesões é textual
 * (`string[]`); o tipo da ficha aceita as duas formas para não quebrar fichas
 * antigas nem a variante sem Sanidade.
 */
export interface CharacterInjury {
  attribute: string;
  penalty: number;
  /** Campo persistido pelo backend (OP2/OPSH). */
  note?: string;
  /** Alias usado pelo editor da ficha. */
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

export interface CharacterDTO {
  _id: string;
  ownerId: string;
  tableId: string;
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
  /** Medo/pavor (OP2) e efeitos relacionados. */
  fear?: CharacterFear;
  relations?: CharacterRelation[];
  rituals?: CharacterRitual[];
  conditions?: string[];
  traumas?: string[];
  /** OP2: texto das lesões; OPSH: ferimentos debilitantes estruturados. */
  injuries?: Array<string | CharacterInjury>;
  /** OPSH: `san` usa PE/SAN; `pd` usa um único pool de PD. */
  sanityMode?: 'san' | 'pd';
  /** OPSH: progressão por NEX (padrão), patente (opcional) ou estágio. */
  progressionMode?: 'nex' | 'patente' | 'estagio';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CharacterSummaryDTO {
  _id: string;
  name: string;
  ownerId: string;
  systemKey?: string;
  level?: number;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
  currentPE?: number;
  maxPE?: number;
  currentSAN?: number;
  maxSAN?: number;
  sanityMode?: 'san' | 'pd';
  tokenId?: string | null;
}

export interface CharacterSummaryLite {
  _id: string;
  name: string;
  systemKey?: string;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
  currentPE?: number;
  maxPE?: number;
  currentSAN?: number;
  maxSAN?: number;
  sanityMode?: 'san' | 'pd';
}

export interface CharacterUpdateDTO {
  characterId: string;
  patch: Partial<CharacterSummaryDTO>;
}

export type Character = CharacterDTO;

// Session DTOs espelhados do backend
export interface UserSummaryDTO {
  _id: string;
  username: string;
}

export interface UserProfileDTO {
  _id: string;
  username: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  preferredSystemId?: string | null;
  measurementColor?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TableInfoDTO {
  _id: string;
  name: string;
  dm: UserSummaryDTO;
  players: UserSummaryDTO[];
  inviteCode: string;
  status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
  pauseUntil: string | null;
  activeSceneId?: string | null;
  systemId?: string | null;
  systemKey?: string | null;
  systemName?: string | null;
}

export interface InitiativeEntryDTO {
  _id: string;
  characterName: string;
  tokenId?: string;
  characterId?: string;
  isCurrentTurn: boolean;
}

export interface SceneDTO {
  _id: string;
  tableId: string;
  name: string;
  imageUrl?: string;
  gridWidth?: number;
  gridHeight?: number;
  type: string;
  metersPerSquare?: number;
}

export interface TokenDTO {
  _id: string;
  tableId: string;
  sceneId?: string;
  squareId: string;
  color: string;
  owner: UserSummaryDTO | null;
  name: string;
  imageUrl?: string;
  movement: number;
  remainingMovement: number;
  size: TokenSize;
  canOverlap: boolean;
  /** `string` quando vinculado; `null` explicitamente quando desvinculado. */
  characterId?: string | null;
  /** Resumo da ficha vinculada; `null` quando desvinculado. */
  character?: CharacterSummaryLite | null;
}

export interface TokenTemplateDTO {
  _id: string;
  ownerId: string;
  systemId?: string | null;
  name: string;
  imageUrl?: string;
  size?: TokenSize;
  color?: string;
  tags?: string[];
  baseMovement?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SceneTemplateDTO {
  _id: string;
  ownerId: string;
  systemId?: string | null;
  name: string;
  mapUrl: string;
  gridWidth?: number;
  gridHeight?: number;
  type?: 'battlemap' | 'image';
  defaultMetersPerSquare?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MeasurementDTO {
  id?: string;
  userId: string;
  username: string;
  sceneId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  affectedSquares?: string[];
  color: string;
}

export interface AuraDTO {
  id: string;
  tokenId: string;
  tableId: string;
  sceneId: string;
  ownerId: string;
  name: string;
  color: string;
  radiusMeters: number;
  difficultTerrain?: boolean;
}

export interface SessionStateDTO {
  table: TableInfoDTO;
  activeScene: SceneDTO | null;
  scenes: SceneDTO[];
  tokens: TokenDTO[];
  initiative: InitiativeEntryDTO[];
  measurements: MeasurementDTO[];
  auras: AuraDTO[];
}

/** Pedido de teste por passo (OP2): atributo + perícia, RA/RB e pavor. */
export interface StepRollRequest {
  attribute: 'fisico' | 'mente' | 'emocao';
  attributeDie: DieSize;
  skillKey: string;
  skillDie: DieSize;
  /** Dados extras (relações/habilidades); o servidor limita a 2. */
  bonusDice?: DieSize[];
  /** Aumento/redução de passo, aplicado ao alvo e limitado a d4..d12. */
  stepDelta?: number;
  stepTarget?: 'attribute' | 'skill';
  /** DT do teste; padrão 7. */
  difficulty?: number;
  /** Dado de pavor (d6 por padrão), quando o personagem está sob medo. */
  dreadDie?: DieSize | null;
  label?: string;
  /** Modificador de dano da arma, ex.: +3 de `RA+3`. */
  damageModifier?: number;
  /** `true` em ataques: o resultado traz `damageBase` (RA ou 2 maiores). */
  damageMode?: boolean;
}

export type TableRollKey = 'lesao' | 'trauma' | 'falha-critica';

export interface StepRollSummary {
  attribute: { key: string; die: DieSize; value: number };
  skill: { key: string; die: DieSize; value: number };
  bonusDice: Array<{ die: DieSize; value: number }>;
  dread?: { die: DieSize; value: number };
  canceledValues: number[];
  high: number;
  low: number;
  difficulty: number;
  success: boolean;
  critical: boolean;
  fumble: boolean;
  dreadEnds: boolean;
  summedDice: number[];
  damageBase?: number;
  label?: string;
}

/** Resultado do passo: espelha `StepRollResult` do contrato do backend. */
export interface StepRollResult {
  kind: 'step';
  expression: string;
  rolls: Array<SingleDieRoll & { role?: 'attribute' | 'skill' | 'bonus' | 'dread' }>;
  modifier: number;
  total: number;
  step: StepRollSummary;
}

/** Resultado de tabela de lesão/trauma/falha crítica. */
export interface TableRollResult {
  kind: 'table';
  table: TableRollKey;
  expression: string;
  die: number;
  /** Alguns caminhos serializam só o valor; aceitamos os dois formatos. */
  roll: number | SingleDieRoll;
  key: string;
  summary: string;
  modifier?: number;
  total?: number;
}

export interface DiceRollBaseParams {
  tableId: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  metadata?: string;
}

export interface ExpressionRollParams extends DiceRollBaseParams {
  expression: string;
  step?: never;
  table?: never;
}

export interface StepRollParams extends DiceRollBaseParams {
  step: StepRollRequest;
  expression?: never;
  table?: never;
}

export interface TableRollParams extends DiceRollBaseParams {
  table: TableRollKey;
  modifier?: number;
  expression?: never;
  step?: never;
}

/**
 * O evento continua `requestRollDice`; o payload aceita expressão (D&D,
 * Cyberpunk), passo (OP2) ou tabela (lesão/trauma/falha crítica).
 */
export type RollDiceParams = ExpressionRollParams | StepRollParams | TableRollParams;

export interface DiceRolledPayload {
  tableId: string;
  expression: string;
  /** Testes de passo marcam o papel de cada dado; expressões comuns não. */
  rolls: Array<SingleDieRoll & { role?: 'attribute' | 'skill' | 'bonus' | 'dread' }>;
  modifier: number;
  total: number;
  metadata?: string;
  userId: string;
  username: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  createdAt: string;
  revision?: number;
  /** Discrimina o motor que produziu o resultado. */
  kind?: 'expression' | 'step' | 'table';
  /** Espelho do bloco `step` do `StepRollResult`. */
  step?: StepRollSummary;
  /** Resultado de tabela de lesão/trauma/falha crítica. */
  tableResult?: TableRollResult;
  /** Atalho serializado pelo backend para o histórico/TV. */
  table?: TableRollKey;
}

export type RollLogEntryDTO = DiceRolledPayload;

export type LogEntryType = 'roll' | 'system' | 'movement' | 'chat';

export interface LogEntry {
  id: string;
  type: LogEntryType;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  content: string;
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Contrato realtime (docs/REALTIME_PROTOCOL.md, protocolVersion: 1)
// ---------------------------------------------------------------------------

export type SessionRole = 'DM' | 'PLAYER' | 'DISPLAY' | 'SPECTATOR';

export interface SessionYou {
  userId: string;
  username: string;
  role: SessionRole;
  permissions: string[];
}

export interface PresenceEntry {
  userId: string;
  username: string;
  role: SessionRole;
  socketCount: number;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AckOk {
  ok: true;
  revision: number;
  serverNowMs: number;
}

export interface AckError {
  ok: false;
  error: {
    code: ErrorCode;
    /** pt-BR, pronta para toast. */
    message: string;
    /** Nunca inclui segredo. */
    details?: unknown;
  };
  revision: number;
  serverNowMs: number;
}

export type Ack = AckOk | AckError;

export interface SessionSnapshot {
  protocolVersion: 1;
  tableId: string;
  revision: number;
  serverNowMs: number;
  you: SessionYou;
  presence: PresenceEntry[];
  table: TableInfoDTO;
  activeScene: SceneDTO | null;
  scenes: SceneDTO[];
  tokens: TokenDTO[];
  initiative: InitiativeEntryDTO[];
  measurements: MeasurementDTO[];
  auras: AuraDTO[];
  characters?: CharacterSummaryDTO[];
  recentRolls?: RollLogEntryDTO[];
}

export interface TokenUpdateDTO {
  tokenId: string;
  patch: Partial<TokenDTO>;
}

export interface SessionStatusChangeDTO {
  status: string;
  pauseUntil: string | null;
  serverNowMs: number;
}

export interface SessionPatchChanges {
  table?: Partial<TableInfoDTO>;
  activeScene?: SceneDTO | null;
  scenes?: SceneDTO[];
  /** Substitui a lista inteira. */
  tokens?: TokenDTO[];
  /** Merge por tokenId. */
  tokenUpdates?: TokenUpdateDTO[];
  /** Remove por tokenId. */
  tokensRemoved?: string[];
  /** Substitui a lista inteira. */
  initiative?: InitiativeEntryDTO[];
  /** Substitui a lista inteira. */
  measurements?: MeasurementDTO[];
  /** Substitui a lista inteira. */
  auras?: AuraDTO[];
  sessionStatus?: SessionStatusChangeDTO;
  /** Substitui a lista inteira. */
  characters?: CharacterSummaryDTO[];
  /** Merge por characterId. */
  characterUpdates?: CharacterUpdateDTO[];
  /** Remove por characterId. */
  charactersRemoved?: string[];
  /** Substitui a lista inteira (máx. 50). */
  recentRolls?: RollLogEntryDTO[];
}

export interface SessionPatch {
  protocolVersion: 1;
  tableId: string;
  /** Revisão depois da mudança. */
  revision: number;
  /** Revisão antes da mudança. */
  baseRevision: number;
  serverNowMs: number;
  changes: SessionPatchChanges;
}

// ---------------------------------------------------------------------------
// Fase 5 — mídia (docs/PHASE5_ONLINE_CALL.md §2)
//
// Mídia é efêmera: nada aqui incrementa `revision` nem gera `sessionPatch`.
// Os tipos espelham o contrato do servidor e são usados pela sinalização,
// pelo mesh WebRTC e pela UI da chamada.
// ---------------------------------------------------------------------------

/** Estado de mídia publicado por um peer (não persistido). */
export interface MediaState {
  mic: 'on' | 'muted';
  deafened: boolean;
  camera: 'on' | 'off';
  screen: boolean;
  speaking: boolean;
}

/** Peer presente na sala de mídia, como o servidor o descreve. */
export interface MediaPeer {
  peerId: string;
  userId: string;
  username: string;
  mediaState: MediaState;
}

/** Qualidade observada localmente via `RTCPeerConnection.getStats()`. */
export type MediaConnectionQuality = 'good' | 'fair' | 'poor';

/** Servidor ICE retornado por `GET /api/tables/:id/ice-servers`. */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MediaIceServersResponse {
  iceServers: IceServerConfig[];
  /** Informativo; o cliente deve renovar antes de expirar (3600 s). */
  ttlSeconds: number;
  mode: 'mesh';
  turnConfigured: boolean;
  maxPeers: number;
}

export type MediaDeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

/** Payloads da sinalização WebRTC (Socket.IO). */
export interface MediaRoomStatePayload {
  tableId: string;
  peers: MediaPeer[];
}

export interface MediaPeerJoinedPayload {
  tableId: string;
  peer: MediaPeer;
}

export interface MediaPeerLeftPayload {
  tableId: string;
  peerId: string;
  userId: string;
}

export interface MediaSignalPayload {
  tableId: string;
  toPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

/** Sinal recebido do servidor: o peer remetente vem em `fromPeerId`. */
export interface MediaIncomingSignalPayload {
  tableId: string;
  fromPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface MediaIcePayload {
  tableId: string;
  toPeerId: string;
  candidate: RTCIceCandidateInit | null;
}

export interface MediaIncomingIcePayload {
  tableId: string;
  fromPeerId: string;
  candidate: RTCIceCandidateInit | null;
}

export interface MediaStateUpdatedPayload {
  tableId: string;
  peerId: string;
  userId: string;
  mediaState: MediaState;
}

export interface MediaKickedPayload {
  tableId: string;
  reason: string;
}

export interface MediaErrorPayload {
  code: string;
  message: string;
}

/** Mapa dos eventos server → cliente da chamada. */
export interface MediaSocketEventMap {
  mediaRoomState: MediaRoomStatePayload;
  mediaPeerJoined: MediaPeerJoinedPayload;
  mediaPeerLeft: MediaPeerLeftPayload;
  mediaOffer: MediaIncomingSignalPayload;
  mediaAnswer: MediaIncomingSignalPayload;
  mediaIce: MediaIncomingIcePayload;
  mediaStateUpdated: MediaStateUpdatedPayload;
  mediaKicked: MediaKickedPayload;
  mediaError: MediaErrorPayload;
}

export type MediaSocketEventName = keyof MediaSocketEventMap;

/** Peer com estado local de transporte, consumido pela store/UI. */
export interface MediaPeerView extends MediaPeer {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  quality: MediaConnectionQuality;
}