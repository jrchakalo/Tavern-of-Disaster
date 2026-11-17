/** Categoria canônica do Histórico: tudo, rolagens ou o resto das ações. */
export type ActionLogCategory = 'all' | 'roll' | 'action';

/** Aba do histórico único (F0-9). */
export interface HistoryTabDefinition {
  key: ActionLogCategory;
  label: string;
}
