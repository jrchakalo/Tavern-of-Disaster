# Harness de caos (6 clientes) — P1-QA-2

Script standalone que simula uma mesa inteira (1 mestre + 5 jogadores) contra o
backend real e verifica o contrato de `docs/REALTIME_PROTOCOL.md` (§5, §6, §7,
§11, §12 e §14).

Ele **não** precisa de navegador nem de frontend: sobe um MongoDB em memória,
sobe o backend (`npm run start:test`) em uma porta livre e fala com ele por
REST + Socket.IO.

## Rodar

```bash
cd tests/e2e
npm ci                 # socket.io-client e mongodb-memory-server já são devDependencies
node chaos/run.mjs
```

Requisitos: `backend/node_modules` instalado (`cd backend && npm ci`) e Node 22+
(o script usa `fetch` nativo).

Variáveis de ambiente opcionais:

| Variável | Padrão | Significado |
|---|---|---|
| `CHAOS_JWT_SECRET` | `chaos-secret` | Segredo usado para assinar os tokens de teste e para o backend da execução |
| `CHAOS_BACKEND_DIR` | `<repo>/backend` | Diretório do backend sob teste (permite validar outro checkout/branch) |

## O que o script faz

1. Sobe `mongodb-memory-server` e o backend em porta livre (`3210 + rand`),
   com `JWT_SECRET`, `MONGO_URI`, `NODE_ENV=test`, `STORAGE_DRIVER=local` e
   `LOCAL_UPLOAD_DIR` apontando para um diretório temporário.
2. Espera `GET /metrics` responder.
3. Registra 1 DM + 5 jogadores (`POST /api/auth/register`), cria a mesa, cria
   uma cena e adiciona os jogadores pelo código de convite.
4. Conecta 6 sockets `socket.io-client` e faz `joinTable` com ack.
5. Verifica que os 6 receberam `sessionSnapshot` com a mesma `revision` e o
   mesmo `tableId`.
6. O DM coloca tokens e o harness confere que o estado chega a todos os
   clientes pelo caminho canônico `sessionPatch` (§7).
7. O DM avança o turno e o harness confere que todos convergem na mesma
   entrada de iniciativa.
8. Derruba 2 sockets, reconecta, pede `requestResync` e confere que os dois
   recuperam a revisão atual.
9. Dispara dois `requestNextTurn` concorrentes com o mesmo `expectedRevision` e
   exige exatamente 1 `{ ok: true }` + 1 `CONFLICT` (§11).
10. Confere a convergência final (mesma revisão, mesmo hash de tokens, mesmo
    hash de iniciativa) e imprime o relatório em JSON.

O script **sempre** encerra o backend, o MongoDB, os sockets e o diretório
temporário, inclusive em caso de falha, e **sai com código diferente de zero**
se qualquer item do contrato falhar.

## Saída

O relatório JSON é impresso no stdout entre os marcadores
`===== RELATÓRIO DE CAOS (JSON) =====` e `===== FIM DO RELATÓRIO =====`, com:

- `clients`: lista por cliente (label, `userId`, `revision`, `tokenHash`,
  `initiativeHash`, contadores de snapshot/patch/eventos legados);
- `revision`, `tokenHash`, `initiativeHash`: valores convergidos (ou `null`);
- `errors`: itens de contrato que falharam;
- `checks`: cada item do contrato com `PASS`/`FAIL` e evidência.

Exemplo (resumo):

```json
{
  "result": "PASS",
  "clients": [{ "label": "dm", "revision": 7, "tokenHash": "…", "initiativeHash": "…" }],
  "revision": 7,
  "tokenHash": "…",
  "initiativeHash": "…",
  "errors": []
}
```

## Interpretar as falhas

As mensagens apontam o item do contrato ausente, por exemplo:

- `joinTable responde ack para os 6 clientes — sem ack: dm, player1…` →
  falta o envelope de ack (§5);
- `sessionSnapshot no join …` → falta o evento `sessionSnapshot` (§6);
- `sessionPatch em 0/6; evento legado em 6/6` → o caminho canônico §7 não está
  implementado (o legado ainda funciona);
- `requestNextTurn concorrente: 1 ok + 1 CONFLICT — ok=0 conflict=0` → falta o
  CAS por revisão (§11).

## Notas de implementação

- **JWT local.** O login REST é limitado a 5 requisições a cada 5 min por IP
  (`backend/src/middleware/rateLimit.ts`) e o harness precisa de 6 tokens. Os
  tokens são assinados localmente (HS256, mesmo payload `{ user: { id,
  username } }` do backend) e o script valida o token contra um endpoint
  protegido antes de usá-lo.
- **Formato do payload de `joinTable`.** O contrato não fixa o formato. O
  script sonda `{ tableId }` e, se não houver ack, `tableId` (string, formato
  legado), memorizando o que funciona.
- **Eventos legados.** O estado é reconstruído também a partir de
  `initialSessionState`/`sessionStateUpdated`, `tokenPlaced`, `tokenMoved` e
  `initiative*`, para que a diagnose continue útil antes da Fase 1 estar
  integrada. A asserção do caminho canônico (`sessionPatch`) continua
  obrigatória.
