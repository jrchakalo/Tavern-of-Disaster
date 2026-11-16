# Fase 4 — Mídia e cenas: contrato

> Status: **em implementação** (2026-11-16).
> Branch: `restore/phase-4-media-scenes`. Depende de
> `docs/REALTIME_PROTOCOL.md`, `docs/TABLE_MODE.md` e `docs/ONLINE_MODE.md`.
> Objetivo: o Mestre sobe mapas do celular ou do desktop, troca de cena com
> progresso/erro visíveis, e medições/auras sobrevivem a restart — presencial e
> online.

## 1. Baseline (o que já existe)

- Upload de mapa, token e avatar com `sharp` → WebP, perfis de tamanho e
  limites por arquivo (`storageService.ts`).
- Driver `local` (padrão, `LOCAL_UPLOAD_DIR`) e `supabase` (quando configurado).
- UI de cena: lista, ativar, criar, editar, excluir, reordenar, URL do mapa e
  upload de arquivo (`SceneManager.vue` + `TableView.vue`).
- Rotas REST de cenas e templates de cena/token.
- Medições efêmeras em memória; medições persistentes e auras em memória ou
  Redis, **não em Mongo** — hoje não sobrevivem a restart sem Redis.
- `SceneTemplatePanel.vue` e `TokenLibraryPanel.vue` existem, mas **não são
  usados** por nenhuma view.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Storage | `local` continua padrão e grátis; `supabase` opcional |
| Quota | **200 MB por mesa** (`TABLE_STORAGE_QUOTA_BYTES`), por arquivo os limites atuais |
| Registro | novo modelo `Asset` para uso, quota; URL pública continua compatível |
| Órfãos | apagar o asset antigo ao trocar/remover mapa, token ou avatar; varredura periódica de segurança |
| Overlays | persistir medições persistentes e auras em **Mongo** (`SceneOverlay`) |
| Efêmero | medições temporárias continuam em memória (não são estado de cena) |
| Mobile | upload com progresso real (XHR), câmera/galeria, erro visível |
| Templates | remover os painéis órfãos do frontend; rotas/backend ficam para o futuro |
| Bundle | code-split de vendor no Vite; views já são lazy |

## 3. API de assets

### 3.1 Upload (compatível com o atual)

`POST /api/assets/maps/:tableId` (DM), `POST /api/assets/tokens/:tableId`
(DM), `POST /api/assets/avatar` (autenticado). `multipart/form-data` no campo
`file`.

Resposta `201`:

```ts
{
  publicUrl: string;   // mantém o campo atual
  assetId: string;
  bytes: number;
  usage: { usedBytes: number; quotaBytes: number; remainingBytes: number };
}
```

Erros:

- `400` arquivo ausente/inválido/não-imagem.
- `413` arquivo acima do limite **ou** quota da mesa excedida, com mensagem
  clara (`"A mesa atingiu o limite de armazenamento."`).
- `403` jogador tentando subir mapa/token.

### 3.2 Uso

`GET /api/assets/tables/:tableId/usage` — membro da mesa:

```ts
{
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  count: number;
  byKind: { map: number; token: number; avatar: number };
}
```

### 3.3 Remoção

`DELETE /api/assets/:assetId` — DM da mesa do asset ou dono do avatar. Remove
o objeto no driver ativo e o registro. Usado também internamente na troca de
mapa/token/avatar.

### 3.4 Modelo `Asset`

```ts
{
  _id; tableId?; ownerId; kind: 'map'|'token'|'avatar';
  objectPath: string; publicUrl: string; bytes: number;
  mimeType: string; width: number; height: number;
  createdAt; updatedAt;
}
```

`tableId` ausente em avatar. Índices: `{tableId, kind}`, `{publicUrl}`,
`{createdAt}`.

### 3.5 Órfãos

- Ao trocar `Scene.imageUrl`, apagar o asset anterior (se registrado).
- Ao excluir cena, apagar o mapa da cena.
- Ao trocar `Token.imageUrl`/excluir token, apagar a imagem anterior.
- Ao trocar `User.avatarUrl`/`Character.avatarUrl`, apagar a anterior.
- Varredura periódica (`ASSET_ORPHAN_SWEEP_INTERVAL_MS`, padrão 6h) apaga
  assets sem referência em Scene/Token/User/Character com mais de
  `ASSET_ORPHAN_TTL_MS` (padrão 24h). Nunca apaga asset referenciado.
- Falha de storage ao apagar não derruba a operação principal (log + registro
  permanece para nova tentativa).

## 4. Overlays persistentes (Mongo)

### 4.1 Modelo `SceneOverlay`

```ts
{
  tableId: ObjectId; sceneId: ObjectId;   // unique composto
  measurements: PersistentMeasurementPayload[]; // id, userId, username, start, end,
                                                // distance, color, type, affectedSquares
  auras: AuraPayload[];                         // id/tokenId, name, color, radiusMeters...
  createdAt; updatedAt;
}
```

- `measurements` e `auras` usam o mesmo payload do contrato realtime; nada
  muda no snapshot (`measurements`, `auras`).
- `addPersistent`, `removePersistent`, `upsertAura`, `removeAura` fazem
  write-through no Mongo (await) e devolvem o estado atualizado.
- `listPersistents` e `listAuras` leem do Mongo.
- `clearAllMeasurements(scene)` apaga o overlay da cena; exclusão de cena e de
  mesa também apaga.
- Se `REDIS_URL` estiver configurado, o Redis pode continuar como cache, mas o
  Mongo é a **fonte da verdade**. Nesta fase o caminho padrão é Mongo; o store
  em memória fica só para efêmeras.
- Migração: overlays antigos em memória não são migrados (não há dados de
  produção); a hidratação acontece por leitura do Mongo.

### 4.2 Contrato de funções

As funções de persistência/aura passam a ser **assíncronas**; os handlers já
são assíncronos e devem `await`. O snapshot (`loadSessionState`) também.

## 5. UI

- `SceneManager.vue`:
  - input de arquivo com `accept="image/*"`, câmera/galeria no celular;
  - progresso de upload (0–100%) e estado “Enviando…”;
  - erro visível (toast + texto no painel);
  - uso da mesa (`usado / quota`) e aviso de limite;
  - upload por URL continua.
- Troca de cena: estado de carregamento no mapa, erro visível se a imagem
  falhar, sem travar o painel.
- `TableView.vue`: carregar uso ao abrir o painel e após upload; não enviar
  arquivos gigantes sem feedback.
- Remover `SceneTemplatePanel.vue`, `TokenLibraryPanel.vue` e
  `services/sceneTemplateService.ts` (órfãos). As rotas de backend ficam.
- Vite: separar vendor (`vue`, `pinia`, `socket.io`, `vuedraggable`) para
  reduzir o chunk do `TableView`; views continuam lazy.
- Online: as mesmas rotas `/table/:id` e `/play/:id`; nada de HTTP local.

## 6. Critérios de aceite

- [ ] Upload de mapa/token/avatar registra `Asset`, respeita quota e devolve
      uso; erros 400/413/403 visíveis.
- [ ] Trocar/excluir mapa, token ou avatar apaga o asset anterior; varredura
      não apaga asset referenciado.
- [ ] Medições persistentes e auras sobrevivem a restart do backend (Mongo),
      com snapshot/reconexão idênticos.
- [ ] Excluir cena/mesa limpa overlays e assets correspondentes.
- [ ] Mestre sobe mapa pelo celular (390×844) com progresso e erro visíveis;
      jogador e TV recebem a cena nova.
- [ ] Troca de cena funciona online (2 contextos remotos) e presencial.
- [ ] Painéis órfãos removidos; build com vendor separado.
- [ ] D&D/OP2/Cyberpunk e E2E existentes continuam verdes; caos 14/14.
- [ ] Nenhum PDF/arquivo de referência versionado.

## 7. Quadro de coders

| ID | Entrega | Área |
|---|---|---|
| F4-BE-1 | `Asset`, quota, uso, remoção, hooks de troca/exclusão, varredura | backend |
| F4-BE-2 | `SceneOverlay` + store Mongo + refactor async + testes de restart | backend |
| F4-FE-1 | upload com progresso, câmera, uso/quota, erro de cena, remoção de órfãos, vendor split | frontend |
| F4-QA-1 | E2E mídia/cenas presencial + online; gate completo | QA |

## 8. Fora de escopo

- Fog of war, iluminação dinâmica, múltiplas TVs.
- Compêndio de mapas/tokens e templates avançados.
- SFU/TURN (Fase 5).
