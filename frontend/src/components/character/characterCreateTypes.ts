import type { CharacterProfile } from '../../types';

/** Membro da mesa que pode ser dono de uma ficha criada pelo Mestre. */
export interface CharacterOwner {
  _id: string;
  username: string;
  /** Marca o Mestre para o rótulo “(Mestre)”, nunca por ordem do array. */
  isDM?: boolean;
}

/** Payload mínimo do diálogo de criação; o servidor fixa o dono do jogador. */
export interface CharacterCreatePayload {
  name: string;
  systemKey: string;
  profile?: CharacterProfile;
  notes?: string;
  ownerId?: string;
}
