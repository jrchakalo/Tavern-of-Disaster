# Ordem Paranormal 2 + Sobrevivendo ao Horror — contrato da Fase 3.1

> Status: **contrato aprovado para implementação** (2026-11-15).
> Fontes lidas localmente em `references/ordem-paranormal/` (não versionadas):
> `op2-playtest-beta-contos-da-vigilia.pdf`, `op2-maldicao-do-idolo-de-pedra.pdf`
> (Alpha), fichas prontas do Beta (Missão 1 e Elite) e
> `op1-sobrevivendo-ao-horror.pdf`.
> Branch: `restore/phase-3-op2`. Prioridade: **one-shot da primeira sessão**.
> Nada de texto protegido no repositório: aqui só ficam resumos mecânicos.

## 1. Decisões de produto

| Decisão | Escolha |
|---|---|
| Sistema padrão da plataforma | **D&D 5e** (continua default) |
| Sistemas de peso igual | **OP2** e **OPSH** |
| Sistema secundário | Cyberpunk RED |
| Futuro | Call of Cthulhu (fora da Fase 3.1) |
| Variante do OP2 | **Beta / Contos da Vigília** como primária; nomes do Alpha aceitos como aliases |
| Conteúdo de OPSH | Tudo que o suplemento traz (PD, medo, traumas, ferimentos, origens, classes, regras opcionais) |
| Homebrew / adaptações de mesa | Nenhum nesta fase |
| Combate | Regras do PDF de referência (Beta): três fases, dano = RA + modificador, pontos de armadura |
| Rituais | Nome, custo e descrição (sem compêndio completo) |
| OP1 puro | Fora de escopo; OPSH usa a base do OP1 |

## 2. Chaves de sistema

| `systemKey` | Nome | Observação |
|---|---|---|
| `ordem-paranormal-2` | Ordem Paranormal 2 (Playtest) | foco do one-shot |
| `ordem-paranormal-sobrevivendo-ao-horror` | Ordem Paranormal: Sobrevivendo ao Horror | OP1 + suplemento |

As duas chaves entram no `SYSTEM_SEEDS` de forma idempotente. As fichas
guardam `systemKey`; trocar o sistema da mesa **não migra** fichas antigas.

## 3. OP2 — regras mecânicas

### 3.1 Atributos e perícias

Três atributos, cada um com um **dado** (não um número):
`fisico`, `mente`, `emocao` — valores 4, 6, 8, 10, 12 (20 só por efeito
paranormal).

Escala: `d4` abaixo da média · `d6` média · `d8` acima da média · `d10` muito
acima · `d12` ápice humano · `d20` sobre-humano.

Vinte perícias, cada uma com atributo-base e dado próprio:

| Perícia | Atributo | Perícia | Atributo |
|---|---|---|---|
| acrobacia | fisico | medicina | mente |
| animais | emocao | metalurgia | mente |
| aptidao | mente | percepcao | mente |
| atletismo | fisico | persuasao | emocao |
| bruxaria | mente | pontaria | fisico |
| crime | fisico | sobrevivencia | mente |
| disciplina | emocao | vigor | fisico |
| enganacao | emocao | furtividade | fisico |
| intimidar | emocao | intuicao | emocao |
| inspecionar | mente | luta | fisico |

`aptidao` aceita um campo livre (artes, erudição, folclore, guerra, nobreza,
religião, ou o campo do Alpha).

**Aliases do Alpha** (mesma ficha, nomes antigos):

```
ocultismo   -> bruxaria
oficio      -> metalurgia
maquinas    -> metalurgia
tecnologia  -> metalurgia
pesquisar   -> inspecionar
```

Perícias desconhecidas são preservadas e exibidas como “legado”, sem quebrar a
ficha.

### 3.2 Teste básico

1. O Mestre escolhe atributo + perícia e a DT (padrão **7**).
2. Rola-se **1 dado de atributo + 1 dado de perícia**.
3. Soma-se os dados (máximo 4 rolados, máximo 3 somados).
4. `total >= DT` → sucesso.
5. **RA** = maior dado; **RB** = menor dado.

Dados extras (habilidades, relações) somam ao total. Aumento/redução de passo
segue `d4 < d6 < d8 < d10 < d12`; mínimo `d4`, máximo `d12` (salvo `d20`
paranormal explícito). Aumentos de passo **não** contam como dados extras.

### 3.3 Crítico e falha crítica

- **Crítico:** dois ou mais dados do teste com o **mesmo valor e valor ≥ 6**.
  Passa automaticamente, independente da DT. Em ataque/teste estendido, o dano
  ou a pontuação usa a **soma dos dois maiores** em vez de só o maior.
- **Falha crítica:** todos os dados do teste valem 1. Falha automaticamente e
  rola `1d8` na tabela de falhas críticas.
- O dado de pavor não entra na soma nem na checagem de crítico; ele pode anular
  dados (ver 3.4).

### 3.4 Dado de pavor (medo)

Quando o personagem está sob efeito de pavor, rola-se um **dado de pavor**
(padrão `d6`) junto com o teste. Ele **não soma**:

- anula todos os dados do teste com valor **menor** que o resultado do pavor;
- se anular todos, o teste é **falha crítica**;
- se o pavor rolar **1**, o efeito de medo termina depois do teste;
- antes de um teste, gastar **1 PD** reduz o pavor em um passo;
- antes de um teste, gastar **5 PD** converte o pavor em **dado bônus**.

### 3.5 Ataque, dano e armadura

- Ataque corpo a corpo = `Luta` + `Fisico`; à distância = `Pontaria` + `Fisico`.
- DT base 7; alcance longo `+3`; cobertura/ocultação alteram passos/DT.
- **Dano = RA + modificador da arma** (ex.: `RA+3`). No crítico, usa a soma dos
  dois maiores dados + modificador.
- **Pontos de armadura:** gastar 1 ponto (ação livre) reduz o dano em **10**.
  Pontos gastos não voltam durante o playtest. Anotar `armorPoints` atuais e
  máximos.
- Não existe iniciativa: a rodada tem **fase geral → ataques à distância →
  ataques corpo a corpo**. Ação dentro de uma fase não age nas seguintes.
- PV 0 → **teste de lesão**; PD 0 por efeito externo → **teste de trauma**
  (ver 3.6).

### 3.6 Lesão, trauma e tabelas

Teste de lesão: `Fisico + Vigor`, DT `7 + 3 × testes anteriores na cena`.
Teste de trauma: `Emocao + Disciplina`, mesma progressão.

Resultados (resumo mecânico):

- **Lesão** — crítico: recupera 1 PV; sucesso: inconsciente/moribundo; falha:
  rola `1d20` na tabela de lesões; falha crítica: morte.
- **Trauma** — sucesso: sem efeito; falha: rola `1d20` na tabela de traumas.
- Patamar acima de iniciante dá `+1` por patamar (veterano +1, elite +2,
  lenda +3).

Tabelas (resumo, não texto do livro):

| d20 | Lesão | Trauma |
|---|---|---|
| 1–4 | morte súbita | colapso total (novo personagem) |
| 5–9 | morte lenta (age 1 rodada e morre) | TEPT (+1 dano emocional) |
| 10 | laceração profunda (−2 PV, acumula) | — |
| 11 | sem olho (−1 Percepção/Pontaria) | — |
| 12 | sem mão (1 item; tarefas de 2 mãos penalizadas) | — |
| 13 | sem pé (2 reduções em movimento/perseguição) | −2 Persuasão/Intuição |
| 14 | tendão comprometido (−2 Acrobacia) | −2 Persuasão/Intuição |
| 15 | músculo comprometido (−2 Atletismo) | pânico (ganha dado de pavor) |
| 16 | órgão interno comprometido (−2 Vigor) | pânico |
| 17 | órgão sensorial comprometido (−2 Percepção) | pânico |
| 18 | cicatriz assustadora (−2 Persuasão, +1 Intimidar) | estupor (perde a próxima ação) |
| 19 | contusão (Físico −1 passo até fim da cena) | estupor |
| 20+ | surto de adrenalina (+1 PV) | injeção de ânimo (+1 PD) |

Traumas 7–8: −1 Mente; 9–10: −1 Emoção; 11–12: −2 PD; 13–14:
−2 Persuasão/Intuição (ver tabela acima).

Falha crítica (`1d8`): 1 vexame; 2 Físico −1 passo até fim da cena; 3 Mente −1
passo; 4 Emoção −1 passo; 5 perde `1d4` PV; 6 perde `1d4` PD; 7 perde um item;
8 sem efeito adicional.

### 3.7 Relações

Até 3 graus: 1 (afinidade), 2 (vínculo), 3 (devoção). Invocar uma relação, uma
vez por missão:

| Grau | Bônus em teste | Ajuda | Recuperar PD |
|---|---|---|---|
| 1 | +1d6 | +1d6 | — |
| 2 | +1d8 | +1d8 | 2d4 PD (ação) |
| 3 | +1d12 | +1d12 | 2d6 PD (ação) ou ação extra se a pessoa estiver em perigo |

### 3.8 Ficha OP2 (campos)

Reaproveita o que já existe e adiciona o que falta (tudo aditivo):

```ts
systemKey: 'ordem-paranormal-2';
attributes: { fisico: DieSize; mente: DieSize; emocao: DieSize };
skills: Record<SkillKey, DieSize>;
profile: {
  perfil?: 'executor' | 'analista' | 'vigilante';
  vocacao?: string;      // Beta; `background`/`className` do Alpha viram alias
  nivel?: number;        // 1..10 (campo `level` existente)
  idade?: number;
};
stats: {
  currentHP?: number; maxHP?: number;
  currentPD?: number; maxPD?: number;
  armorPoints?: number; armorPointsMax?: number;
};
fear?: { dreadDie?: DieSize | null; active?: boolean; notes?: string };
relations?: Array<{ name: string; grade: 1 | 2 | 3; note?: string }>;
rituals?: Array<{ name: string; cost?: string; description?: string }>;
conditions?: string[];
traumas?: string[];
injuries?: string[];
attacks?: Array<{ name: string; damage?: string; range?: string; notes?: string }>;
inventory?: Array<{ name: string; quantity?: number; notes?: string }>;
notes?: string;
```

PV/PD **não têm fórmula oficial** no Alpha nem no Beta: são preenchidos
manualmente (as fichas prontas trazem os valores impressos). A UI pode exibir
um lembrete, nunca inventar cálculo.

## 4. API de dados OP2

O evento continua `requestRollDice` (compatibilidade com o cliente e com o log).
O payload passa a aceitar `step` **ou** `table`; `expression` continua válida.

```ts
type DieSize = 4 | 6 | 8 | 10 | 12 | 20;

type StepRollRequest = {
  tableId: string;
  step: {
    attribute: 'fisico' | 'mente' | 'emocao';
    attributeDie: DieSize;
    skillKey: string;
    skillDie: DieSize;
    bonusDice?: DieSize[];        // máx. 2 (limite de 4 dados rolados)
    stepDelta?: number;           // -2..+2, aplicado ao dado da perícia
    stepTarget?: 'attribute' | 'skill';
    difficulty?: number;          // padrão 7
    dreadDie?: DieSize | null;
    label?: string;               // ex.: "Luta (Físico)"
    damageModifier?: number;      // ex.: +3 de "RA+3"
    damageMode?: boolean;         // true em ataques
  };
  tokenId?: string;
  characterId?: string;
  metadata?: string;
  tags?: string[];
};

type StepRollResult = {
  kind: 'step';
  expression: string;             // legível, para o log
  rolls: Array<SingleDieRoll & { role?: 'attribute' | 'skill' | 'bonus' | 'dread' }>;
  modifier: number;
  total: number;
  step: {
    attribute: { key: string; die: DieSize; value: number };
    skill: { key: string; die: DieSize; value: number };
    bonusDice: Array<{ die: DieSize; value: number }>;
    dread?: { die: DieSize; value: number };
    canceledValues: number[];
    high: number;                 // RA
    low: number;                  // RB
    difficulty: number;
    success: boolean;
    critical: boolean;
    fumble: boolean;
    dreadEnds: boolean;
    summedDice: number[];
    damageBase?: number;          // RA, ou soma dos 2 maiores no crítico
    label?: string;
  };
};
```

Tabelas:

```ts
type TableRollRequest = {
  tableId: string;
  table: 'lesao' | 'trauma' | 'falha-critica';
  modifier?: number;              // ex.: +1 por patamar
  characterId?: string;
  tokenId?: string;
  metadata?: string;
};
```

Resultado: `kind: 'table'`, `table`, `roll`, `key`, `summary`, `die`, mais o
`expression` legível. Persistir no mesmo `Roll` (histórico/TV).

Algoritmo do passo:

1. Validar dados (4–12; 20 só se explicitamente permitido), perícia conhecida,
   `bonusDice.length <= 2`.
2. Aplicar `stepDelta` no alvo (`skill` por padrão) respeitando 4..12.
3. Rolar atributo, perícia, bônus e pavor.
4. Pavor anula dados de teste com valor menor que o dele (não bônus).
5. `fumble` se todos os dados de teste restantes valem 1 **ou** todos foram
   anulados.
6. `critical` se ≥2 dados de teste têm o mesmo valor ≥6.
7. `summedDice` = até 3 maiores dados de teste não anulados.
8. `total` = soma; `success` = crítico ou `total >= DT` (falha crítica sempre
   falha).
9. `high`/`low` = maior/menor dado de teste não anulado.
10. `damageBase` (se `damageMode`): crítico → soma dos dois maiores; senão RA.

## 5. OPSH — contrato (base OP1 + suplemento)

> **Lacuna conhecida:** o PDF do OP1 core não está em
> `references/ordem-paranormal/`. A base abaixo é a base pública do OP1
> (atributos, classes, NEX, perícias e testes de d20) e **precisa ser validada**
> contra o livro core antes do playtest de OPSH. O suplemento em si está
> integralmente coberto.

### 5.1 Base OP1 usada

- Cinco atributos (1–5): `agilidade`, `forca`, `intelecto`, `presenca`, `vigor`.
- Classes: `combatente`, `especialista`, `ocultista`, `sobrevivente`.
- NEX 5%–99% (ou patentes: recruta, operador, agente especial, oficial de
  operações, agente de elite).
- Teste: rola **N d20** (N = atributo), mantém o maior, soma o bônus de
  treinamento da perícia (`0`, `+5`, `+10`, `+15`) e outros mods vs DT. 20
  natural = sucesso crítico; todos 1 = falha crítica.
- Perícias do OP1 (26): acrobacia, adestramento, artes, atletismo, ciencias,
  crime, diplomacia, enganacao, fortitude, furtividade, iniciativa,
  intimidacao, intuicao, investigacao, luta, medicina, ocultismo, percepcao,
  pilotagem, pontaria, reflexos, religiao, sobrevivencia, tatica, tecnologia,
  vontade.

### 5.2 O que o suplemento acrescenta

- **Origens novas** e opções para as três classes.
- **Nova classe `sobrevivente`** (estágios 1–5, PV `8+VIG`, PE `2+PRE`,
  Sanidade 8; ou PD `4+PRE` +2/estágio na regra sem Sanidade).
- **Jogando sem Sanidade (opcional):** PE + SAN viram **PD**.
  - NEX: Combatente `6+PRE` (+3+PRE por NEX), Especialista `8+PRE` (+4+PRE),
    Ocultista `10+PRE` (+5+PRE), Sobrevivente `4+PRE` (+2/estágio).
  - Patentes: Combatente `8+PRE` (+4+PRE), Especialista `12+PRE` (+6+PRE),
    Ocultista `16+PRE` (+8+PRE), Sobrevivente `4+PRE` (+2/estágio).
  - Dano mental reduz um passo por dado e divide a quantidade de dados pela
    metade (arredonda para cima).
  - Dormir recupera PV; relaxar recupera PD.
- **Medo em jogo:** testes de Vontade contra DT; falha gera abalo/pânico e
  perda de SAN/PD; visões de medo causam dano mental.
- **Ferimentos debilitantes (opcional):** ao falhar no teste de Fortitude de
  dano massivo, rola `1d6` (1 Agi, 2 For, 3 Int, 4 Pre, 5 Vig, 6 superficial).
  Penalidade `−O` no atributo; se Vigor, reduz PV máx. em `−1` por 5% de NEX.
  Cura: Medicina DT 20 em interlúdio.
- **Traumas/insanidade** e as demais regras opcionais do capítulo 2.

### 5.3 Ficha OPSH (campos)

```ts
systemKey: 'ordem-paranormal-sobrevivendo-ao-horror';
attributes: { agilidade; forca; intelecto; presenca; vigor }; // 1..5
skills: Record<SkillKey, 0 | 5 | 10 | 15>;                     // bônus de treino
profile: { classe; origem; trilha?; nex?; patente?; nivel?; idade?; conceito? };
stats: {
  currentHP; maxHP; defense;
  currentPE; maxPE;            // modo SAN
  currentSAN; maxSAN;          // modo SAN
  currentPD; maxPD;            // modo PD (sem Sanidade)
};
sanityMode: 'san' | 'pd';
conditions?: string[];
traumas?: string[];
injuries?: Array<{ attribute: string; penalty: number }>;
rituals?: Array<{ name; circle?; cost?; description? }>;
attacks?: Array<{ name; bonus?; damage?; notes? }>;
inventory?: Array<{ name; quantity?; notes? }>;
notes?: string;
```

O mesmo motor de expressão do backend atende OPSH (`4d20kh1+5`), então **não
há engine nova** para OPSH; a ficha calcula a expressão a partir do atributo e
do treino.

## 6. UI

### OP2

- Aba **Identidade:** nome, perfil, vocação, nível, idade, descrição.
- Aba **Atributos & Perícias:** três atributos como dados grandes; 20 perícias
  agrupadas por atributo, com dado e botão de rolar (atributo + perícia).
- Aba **Recursos:** PV, PD, pontos de armadura, dado de pavor.
- Aba **Combate:** ataques com dano `RA+X`, botão de ataque e de dano.
- Aba **Rituais:** nome, custo, descrição.
- Aba **Relações:** nome, grau, observação; botão “invocar” (rola bônus).
- Aba **Condições:** condições, traumas, lesões; botões para rolar
  lesão/trauma/falha crítica.
- Aba **Inventário** e **Notas**.
- Resumo no token/TV: PV/PD e pontos de armadura.
- Mobile: alvos ≥44px, sem overflow horizontal, safe areas.

### OPSH

- Aba de atributos com 5 atributos numéricos e pools de d20.
- Perícias com bônus de treino e botão de teste (`Nd20kh1+bônus`).
- Recursos: PV, Defesa, PE/SAN **ou** PD conforme `sanityMode`.
- Ferimentos debilitantes com atributo e penalidade.
- Origens/classes/trilhas como texto estruturado (sem compêndio).

## 7. Critérios de aceite (Fase 3.1)

- [ ] Seed `ordem-paranormal-2` e `ordem-paranormal-sobrevivendo-ao-horror`
      idempotente; D&D 5e continua default.
- [ ] Ficha OP2 cria, edita, persiste, reabre e sincroniza entre 2 clientes.
- [ ] Motor de passo: RA/RB, crítico, falha crítica, pavor, step up/down,
      limite de 4 rolados/3 somados, dano no crítico — cobertos por unitários.
- [ ] Tabelas de lesão/trauma/falha crítica rolam e voltam com chave/resumo.
- [ ] PV/PD no token/TV e reconexão sem divergência.
- [ ] Ficha OPSH com Sanidade **e** PD, ferimentos debilitantes e testes d20.
- [ ] E2E do one-shot: DM + 2 jogadores, cena, tokens, fichas OP2, testes de
      perícia, ataque/dano, PD/medo, log e reconexão.
- [ ] E2E online: 2 contextos remotos (sem TV).
- [ ] D&D 5e e Cyberpunk RED verdes; backend, frontend, build e type-check
      verdes.
- [ ] Nenhum PDF ou texto protegido commitado.

## 8. Quadro de coders

| ID | Entrega | Área |
|---|---|---|
| P3.1-BE-1 | modelo/validação/seed OP2 + OPSH, stats PD/armadura, perfil, relações, rituais, condições | backend |
| P3.1-BE-2 | motor `step` + tabelas + log persistido + testes unitários | backend |
| P3.1-FE-1 | tipos, `socketService`, `sheetTypes`, store | frontend |
| P3.1-FE-2 | ficha OP2 (dados, recursos, relações, rituais, condições, rolagens) | frontend |
| P3.1-FE-3 | ficha OPSH (d20, SAN/PD, ferimentos) | frontend |
| P3.1-QA-1 | unitários de regra + E2E one-shot presencial | QA |
| P3.1-QA-2 | E2E online 2 contextos + caos | QA |

## 9. Pendências

1. PDF do **OP1 core** para validar a base do OPSH (perícias, classes,
   progressão, Defesa, medo). Sem ele, a base acima é a referência pública.
2. Confirmar se o one-shot usará os **dois** PDFs do Beta (Missão 1 e Missão 2)
   ou só um; a implementação cobre os dois.
3. Rituais: só nome/custo/descrição (confirmado).
