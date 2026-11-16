# Fase 4 — Mídia e cenas: relatório de QA

> Branch: `restore/phase-4-media-scenes`. Contrato: `docs/MEDIA_SCENES.md`.
> Data: 2026-11-16. Veredito do PO: **aprovado**.

## 1. Escopo validado

- Upload de mapa/token/avatar com `sharp` → WebP, driver `local` (padrão) e
  `supabase` (quando configurado), limites por arquivo e **quota de 200 MB por
  mesa** (`TABLE_STORAGE_QUOTA_BYTES`).
- Registro `Asset`, endpoint de uso, remoção do asset antigo ao trocar mapa,
  token ou avatar, varredura de órfãos e proteção contra apagar asset
  compartilhado.
- Upload pelo celular do Mestre com progresso real, câmera/galeria, uso/quota
  no painel e erro visível.
- Troca de cena com estado de carregamento e erro de imagem, presencial e
  online.
- Medições persistentes e auras em Mongo (`SceneOverlay`), sobrevivem a
  restart do backend e são limpas ao excluir cena/mesa.
- Painéis órfãos removidos; vendor separado no build.

## 2. Evidência de execução

| Gate | Resultado |
|---|---|
| Backend (`npm test`) | **24 suites, 204/204** |
| Backend (`npm run build`) | `tsc` limpo |
| Frontend (`npm run test:unit`) | **33 arquivos, 244/244** |
| Frontend (`npm run type-check`) | `vue-tsc --build` limpo |
| Frontend (`npm run build`) | Vite OK; `TableView` ~105 kB |
| E2E completo (10 specs) | **57/57**, 0 falhas |
| E2E novos (`media-scenes` + `media-scenes-online`) | **12/12** |
| Caos | **14/14 PASS**, `result: PASS` |
| `tsc --noEmit` (tests/e2e) | exit 0 |

## 3. Cobertura dos E2E novos

`media-scenes.spec.ts` (8 testes) — DM desktop + DM mobile 390×844 + jogador
mobile + TV:

1. Uso inicial zerado, quota > 0, não-membro recebe 403.
2. Upload de mapa pelo celular do Mestre; `201`, URL `/uploads/...webp`,
   toast, `Armazenamento:` no painel; TV e jogador convergem.
3. Troca de mapa: URL nova em todos, URL antiga 404, uso de mapa continua 1.
4. Arquivo não-imagem: 400, erro visível, mapa e uso inalterados.
5. Segunda cena com imagem distinta: ativação converge TV/jogador, revisão
   aumenta; voltar restaura a primeira.
6. Medição persistente + aura aparecem no resync e nos overlays; remoção
   desaparece dos dois.
7. Autorização: jogador não sobe mapa (403), não apaga asset (403), não-membro
   não lê uso (403); estado/revisão intactos.
8. Reconexão do jogador recupera cena, mapa, revisão, medições e aura.

`media-scenes-online.spec.ts` (4 testes) — 2 contextos remotos, sem TV:
convite, upload visível sem reload, troca de cena convergente, reconexão
preservando mapa/cena e URLs relativas (sem `localhost` fixo).

## 4. Correções feitas durante a revisão

- `deleteAssetByUrl`/`deleteAssetById` não apagam asset ainda referenciado por
  outra cena/token/avatar/template (409 ou no-op).
- Overlays vazios são removidos após clear/remoção, em vez de ficarem como
  documentos órfãos.
- Upload XHR com timeout de 120 s.
- Testes de asset compartilhado e de remoção protegida.

## 5. Limitações conhecidas (não bloqueiam a fase)

- Quota e varredura de órfãos são provadas por testes de serviço/integração,
  não por E2E de arquivo gigante (evita uploads de centenas de MB no CI).
- Driver `supabase` não é exercitado no CI (sem credenciais); o caminho local é
  o padrão e está coberto. A interface de delete é a mesma.
- Varredura de órfãos roda em intervalo (6 h por padrão); a remoção direta na
  troca/exclusão é imediata.
- Templates de cena/token continuam disponíveis no backend, mas os painéis
  órfãos do frontend foram removidos; religar é trabalho futuro.

## 6. Veredito

Critérios de `docs/MEDIA_SCENES.md` §6 cobertos: upload/quota/órfãos,
persistência de overlays, mobile, cenas online, remoção de órfãos, vendor split,
suíte existente e caos verdes. **Fase 4 aprovada.**
