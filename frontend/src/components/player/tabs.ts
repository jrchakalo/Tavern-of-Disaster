export type PlayerTab = 'mesa' | 'ficha' | 'dados' | 'chat' | 'chamada';

export const PLAYER_TABS: Array<{ key: PlayerTab; label: string }> = [
  { key: 'mesa', label: 'Mesa' },
  { key: 'ficha', label: 'Ficha' },
  { key: 'dados', label: 'Dados' },
  { key: 'chat', label: 'Chat' },
  { key: 'chamada', label: 'Chamada' },
];
