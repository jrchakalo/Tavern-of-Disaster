# Fase 3.1 — OP2 + OPSH: relatório de QA

> Branch: `restore/phase-3-op2`. Contrato: `docs/ORDEM_PARANORMAL.md`.
> Data: 2026-11-15. Veredito do PO: **aprovado para o one-shot**.

## 1. Escopo validado

- Sistemas `ordem-paranormal-2` (Beta/Contos da Vigília) e
  `ordem-paranormal-sobrevivendo-ao-horror` (OP1 core v1.1 + suplemento).
- Ficha OP2 completa: atributos/perícias em dado, PV/PD/armadura, perfil,
  vocação, nível, idade, medo/pavor, relações, rituais, condições, traumas,
  lesões, ataques, inventário e notas.
- Motor `step`: atributo + perícia, dados bônus, pavor, passo, DT, RA/RB,
  crítico (empate ≥6), falha crítica (todos 1 ou tudo anulado), dano de
  crítico e limite de 4 rolados/3 somados.
- Tabelas de lesão (`1d20`), trauma (`1d20`) e falha crítica (`1d8`).
- Ficha OPSH: 5 atributos, 28 perícias, treino `+0/+5/+10/+15`, pools
  `Nd20kh1`, 20 natural, Defesa `10+AGI`, modos SAN/PD, progressão
  NEX/patente/estágio, ferimentos debilitantes, medo e rituais.
- Token/TV com PV, PD, PE/SAN e armadura; reconexão e autorização por ficha.

## 2. Evidência de execução

| Gate | Resultado |
|---|---|
| Backend (`npm test`) | **19 suites, 154/154** |
| Backend (`npm run build`) | `tsc` limpo |
| Frontend (`npm run test:unit`) | **31 arquivos, 223/223** |
| Frontend (`npm run type-check`) | `vue-tsc --build` limpo |
| Frontend (`npm run build`) | Vite OK |
| E2E completo (8 specs) | **45/45**, 0 falhas, 0 skips |
| E2E novos (`op2-one-shot` + `op2-online`) | **11/11** |
| Caos (`node chaos/run.mjs`) | **14/14 PASS**, `result: PASS` |

Comando do E2E:

```bash
cd tests/e2e
MONGOMS_SYSTEM_BINARY=<...>/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome npx playwright test --workers=1
```

## 3. Cobertura dos E2E novos

`op2-one-shot.spec.ts` (8 testes) — DM desktop + 2 celulares + TV:

1. Seeds OP2/OPSH, sistema da mesa, cena, tokens e LIVE.
2. Fichas OP2 completas via REST, persistência de atributos/perícias,
   perfil/vocação, medo, relações, rituais, condições, traumas, lesões
   (normalizadas) e ataques com alcance.
3. Merge de PD/armadura via `requestUpdateCharacter` sem perder campos.
4. Snapshot e `token.character` com PD/armadura e vínculo de token.
5. Ficha OP2 na UI: abas, PV/PD/armadura e rolagem `Rolar Luta` com
   invariantes de RA/RB/crítico/falha/soma e persistência no log.
6. Tabelas de lesão/trauma/falha crítica, faixas e persistência; resumo na
   ficha.
7. PD no card/TV, convergência por socket, revisão e reconexão.
8. Autorização: ficha de outro jogador e de outra mesa → `FORBIDDEN`, sem
   `Roll` e sem incremento de revisão.
9. Smoke OPSH: ficha, Profissão, PE/SAN, `3d20kh1+5` e log.

`op2-online.spec.ts` (3 testes) — 2 contextos remotos, sem TV: convite,
ficha OP2 do jogador, `Rolar Percepção` chegando ao DM, PD convergindo nos
dois sentidos e reconexão preservando PD + última rolagem de passo.

## 4. Correções feitas durante a revisão

- Validação de atributos por sistema no backend (OP2 4/6/8/10/12/20; OPSH 0..5).
- Preservação de perícias de legado do Alpha no OP2.
- Alinhamento de `profissao`, `progressionMode`, NEX/círculo texto,
  `attacks.range` e lesões texto/estruturadas.
- Erro de ack de rolagem visível uma única vez na ficha.
- DT do OP2 limitada a 1..100.
- Ataque do OPSH usando pool de d20 do atributo (não um d20 único).
- Leitura de `note`/`notes` de lesões nas duas fichas.
- Rótulo do sistema prioriza `character.systemKey` (ficha OPSH em mesa OP2
  mostra o sistema correto) e nome acessível dos campos não inclui o hint.

## 5. Limitações conhecidas (não bloqueiam o one-shot)

- O modificador de patamar das tabelas de lesão/trauma não tem campo na UI;
  o GM pode enviar `modifier` pelo socket ou ajustar a DT manualmente.
- “Invocar relação 1×/missão” e o gasto de PD para controlar/abraçar o pavor
  são registrados manualmente; não há contador automático.
- A ficha não aplica automaticamente o efeito da tabela (o GM narra e edita
  condições/lesões).
- Opsh: a progressão por patente/estágio exibe a fórmula, mas os valores
  continuam preenchidos pelo jogador (como no OP1/OP2).

## 6. Veredito

Os critérios de aceite de `docs/ORDEM_PARANORMAL.md` §7 estão cobertos:
fichas, dados de passo, tabelas, PV/PD no token/TV, OPSH, E2E presencial e
online, D&D/Cyberpunk preservados e nenhum PDF versionado. **Fase 3.1
aprovada.**
