import type { CharacterProfile } from '../../types';

/** Payload mínimo do diálogo de criação; o servidor fixa o dono do jogador. */
export interface CharacterCreatePayload {
  name: string;
  systemKey: string;
  profile?: CharacterProfile;
  notes?: string;
  ownerId?: string;
}
