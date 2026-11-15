# Ordem Paranormal 2 — Contrato em preparação

> Status: **aguardando PDFs** em `references/ordem-paranormal/`.
> Prioridade: **primeira sessão de teste (one-shot)**.
> Esta frente revisa/expande a Fase 3 antes da Fase 4.
> Última atualização: 2026-11-15.

## 1. Por que a Fase 3 precisa de revisão

A Fase 3 foi entregue com D&D 5e e Cyberpunk RED. O sistema principal real é
**Ordem Paranormal 2 (OP2)**, que não usa a mesma base:

- OP2 usa **dados graduados** (d4–d12) para atributos e perícias.
- O teste básico soma **um dado de atributo + um dado de perícia**, compara com
  uma dificuldade (DT 7 no Alpha) e usa Resultado Alto (RA) / Resultado Baixo
  (RB).
- Atributos são **Físico, Mente e Emoção** (não STR/DEX/...).
- Perfis (Executor, Analista, Vigilante) substituem classes no Alpha.
- Nível e NEX são progressões separadas.
- Vida e PD são os recursos centrais; PD veio de *Sobrevivendo ao Horror*.
- A ficha tem 20 perícias próprias e campos de idade, ocupação, perfil,
  descrição/histórico, armas, rituais, condições etc.

Portanto, a ficha D&D e o motor de dados atual não atendem ao one-shot. A Fase 3
continua válida para D&D/Cyberpunk, mas OP2 precisa ser first-class.

## 2. Escopo da revisão (Fase 3.1)

1. Sistema `ordem-paranormal-2` no seed, selecionável na mesa.
2. Ficha OP2 completa para o beta:
   - identidade: nome, idade, ocupação, perfil, nível, NEX, descrição/histórico;
   - atributos Físico/Mente/Emoção como dados;
   - 20 perícias como dados, com treinamento/graduação;
   - Vida, PD, Defesa, Iniciativa, Deslocamento;
   - armas/ataques, dano, alcance;
   - rituais, inventário, condições, traumas/medo;
   - notas.
3. Motor de teste OP2:
   - rolar dado de atributo + dado de perícia;
   - somar, comparar com DT;
   - RA = maior, RB = menor;
   - crítico quando os dados empatam em valor alto (regra exata do PDF);
   - falha crítica quando todos os dados são 1;
   - modificadores que sobem/descem o dado (d4→d6 etc.);
   - presets por perfil/perícia.
4. *Sobrevivendo ao Horror*: suportar as partes que a mesa usar (PD, medo,
   traumas, lesões), conforme confirmação do usuário.
5. UI mobile/desktop da ficha OP2.
6. E2E do one-shot: DM + jogadores, ficha, testes de perícia, combate
   simplificado, PD/medo, dados e log.
7. Manter D&D 5e e Cyberpunk RED funcionando; OP2 vira o sistema padrão de
   teste.

## 3. Modelo de dados proposto (sujeito aos PDFs)

```ts
systemKey: 'ordem-paranormal-2';

attributes: {
  fisico: DieSize;   // 4 | 6 | 8 | 10 | 12 | 20
  mente: DieSize;
  emocao: DieSize;
};

skills: Record<string, DieSize>; // 20 perícias
profile: {
  perfil?: 'Executor' | 'Analista' | 'Vigilante' | string;
  ocupacao?: string;
  idade?: number;
  nivel?: number;
  nex?: number;
  descricao?: string;
  historico?: string;
};

stats: {
  vidaAtual?: number;
  vidaMax?: number;
  pdAtual?: number;
  pdMax?: number;
  defesa?: number;
  iniciativa?: number;
  deslocamento?: number;
};

conditions?: string[];
fear?: { medo?: number; traumas?: string[] };
attacks?: Array<{ name; test?: string; damage?: string; range?: string; notes?: string }>;
rituals?: Array<{ name; cost?: string; description?: string }>;
inventory?: Array<{ name; quantity?: number; notes?: string }>;
notes?: string;
```

O modelo final será ajustado após leitura dos PDFs. Campos existentes de D&D
(`attributes` numérico, `stats.currentHP`, etc.) precisam de uma camada
system-aware para não quebrar as fichas antigas.

## 4. Protocolo de dados OP2

Novo tipo de rolagem no backend e frontend:

```ts
type StepRollRequest = {
  tableId: string;
  attribute: 'fisico' | 'mente' | 'emocao';
  skill?: string;
  attributeDie: DieSize;
  skillDie: DieSize;
  modifierSteps?: number; // sobe/desce dados
  difficulty?: number;    // default da mesa
  metadata?: string;
};

type StepRollResult = {
  attributeDie: DieSize;
  skillDie: DieSize;
  attributeValue: number;
  skillValue: number;
  total: number;
  high: number;  // RA
  low: number;   // RB
  critical: boolean;
  fumble: boolean;
  success: boolean;
  difficulty: number;
};
```

Regras exatas de crítico/falha/modificadores virão dos PDFs. O log de rolagens
continua persistido e aparece na TV/chat.

## 5. Ficha e UI

- Abas: Identidade, Atributos, Perícias, Recursos, Combate, Rituais,
  Inventário, Condições/Medo, Notas.
- Dados representados visualmente (d4/d6/d8/d10/d12), clicáveis para rolar.
- Cálculo de Vida/PD/Defesa/Iniciativa por atributo/nível/perfil conforme PDF.
- Mobile: alvos ≥44px, safe areas, sem overflow.
- Ficha completa dono/DM; resumo (Vida/PD/Defesa) para TV/jogadores.

## 6. Testes

- Unitários do motor de dados OP2 (RA/RB/crítico/falha/step up-down).
- Seed `ordem-paranormal-2` e presets.
- Ficha: campos, cálculos, persistência, PV/PD no token.
- E2E one-shot: DM + 2–4 jogadores, cena, tokens, ficha OP2, testes de
  perícia, combate simplificado, PD/medo, log, reconexão.
- E2E online: 2 contextos remotos, sem TV.

## 7. Bloqueio atual

Aguardando os PDFs em `references/ordem-paranormal/` para extrair:

- versão exata do playtest (Alpha, Beta/Contos da Vigília, outro);
- fórmulas de Vida/PD/Defesa/Iniciativa;
- lista e vínculo das 20 perícias;
- regras de crítico, falha, RA/RB, step up/down;
- combate, armas, dano, condições, medo;
- rituais e progressão;
- o que de *Sobrevivendo ao Horror* será usado e como adaptar ao OP2.

Sem esses arquivos, qualquer implementação seria chute. O PO não vai inventar
regras.

## 8. Ordem de fases revisada

1. Fase 3 (D&D/Cyberpunk) — concluída.
2. **Fase 3.1 (OP2)** — one-shot, prioridade máxima.
3. Fase 4 (mídia/cenas) — pausada até OP2 fechar.
4. Fase 5 (online/comunicação).
5. Fase 6 (deploy/beta).

## 9. Perguntas para o usuário

1. O one-shot usa o **playtest Alpha** ou o **Beta/Contos da Vigília**?
2. *Sobrevivendo ao Horror* entra inteiro (PD, medo, traumas, lesões) ou só
   algumas regras? Quais?
3. Existem adaptações caseiras/playtest posters que devemos suportar?
4. A ficha precisa de rituais completos ou só nome/custo/descrição no beta?
5. O combate do one-shot é simplificado (Alpha) ou usa uma versão mais recente?
