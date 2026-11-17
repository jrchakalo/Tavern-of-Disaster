# Tavern of Disaster — Reformulação de UX/UI (Fase 7)

> Status: **em implementação** (2026-11-16). Base: beta `v1.0.0-beta`.
> Branch: `design/overhaul-v1`. Este documento é a fonte da verdade visual e
> funcional da reformulação. O beta em produção continua congelado até a nova
> UI passar pelos gates.

## 1. Por que

As auditorias independentes (UX/IA, visual, mobile, acessibilidade, funções)
deram **4/10** para a experiência atual. O motor (estado/revisão, tabuleiro
DOM/SVG, display token, dados server-authoritative, chamada, mídia) está bom; o
que falha é a camada em volta:

- DM cockpit: painel flutuante de 375 px cobre o mapa, 1.500 px de scroll,
  ferramentas sem label, criar token só por clique direito, “remover da
  iniciativa” apaga o token.
- Jogador: tela secundária, sem navegação, turno invisível, rodapé engole o
  tabuleiro, sem criar/vincular personagem.
- Home logada é beco sem saída; “Minhas mesas” abre `/table` até para jogador.
- Login sem identidade, sem olho de senha, sem confirmação; não aceita usuário.
- Contraste de 1,70–2,40:1 em textos essenciais; foco, teclado e leitores de
  tela quebrados em tarefas centrais.
- Paleta ameixa/marrom sem hierarquia, Cinzel cenográfica, microtexto de 10 px,
  gradientes em tudo, vídeos de 7 MB, logo de 1,78 MB.

## 2. Direção visual: **Arquivo Morto**

> “A mesa é um dossiê. A sessão é um caso em aberto.”

Burocracia do sobrenatural: arquivo frio, réguas, fichas, carimbos, papel
manila como **estado**, não decoração. O tabuleiro é a mesa de trabalho; os
painéis são fichas; o log é um livro de registro. Cobre OP2 (investigação), D&D
(masmorra como sítio), OPSH (protocolo) e Cyberpunk (arquivo corporativo) sem
virar tema de fantasia.

### 2.1 Paleta (primitivos)

| Token | Hex | Uso |
|---|---|---|
| `--ink-0` | `#0B0D0F` | fundo do app, board, TV |
| `--panel` | `#12171A` | painéis |
| `--raised` | `#1A2125` | hover/input/sheet |
| `--raised-2` | `#232C31` | seleção sutil |
| `--text` | `#E9E7E0` | texto principal |
| `--text-muted` | `#9AA4A6` | secundário |
| `--text-faint` | `#6E7B7E` | meta não essencial |
| `--accent` | `#2F6C84` | ação primária |
| `--accent-hover` | `#387C97` | hover |
| `--accent-ink` | `#7FB6C9` | links, foco, ícones |
| `--manila` | `#D9B45B` | aviso/estado DM |
| `--danger` | `#B23A32` | fill destrutivo |
| `--danger-ink` | `#E86A5E` | texto destrutivo |
| `--success` | `#5C9B85` | presença/sucesso |
| `--success-ink` | `#7DB69E` | texto de sucesso |
| `--paper` | `#E7E2D4` | ficha/QR/handout (exceção, ≤15% da tela) |
| `--line` | `#2B343A` | divisores |
| `--line-strong` | `#56656F` | bordas de controle (≈3:1) |
| `--focus` | `#7FB6C9` | anel de foco 2 px |

**Proibido:** roxo/lavanda, gradiente de UI, glassmorphism, cream+terracota,
sombras em painéis, caps em labels, emoji como ícone.

### 2.2 Tipografia

| Papel | Fonte | Pesos |
|---|---|---|
| Display | **Spectral** | 500/600 |
| UI | **IBM Plex Sans** | 400/500/600 |
| Dados | **IBM Plex Mono** | 400/500 |

Escala: 11/16 mono meta · 12/16 label · 13/18 dado pequeno · 14/20 UI DM ·
16/24 corpo · 18/28 lead · 22/28 título de painel · 28/34 h3 · 36/42 h2 ·
44/48 h1 · 56/56 display · 72/72 TV · 96–160 número de dado.
Números sempre `tabular-nums`; `--font-data` em PV/CA/iniciativa/rolagens.

### 2.3 Forma, densidade e movimento

- Espaço: 2/4/8/12/16/24/32/48/64/96.
- Raios: 2/3/4/6; pill só avatar/dot/token circular.
- Sombra: nenhuma em painel; `--elev-3` só overlay/modal.
- DM: painel 380–420 px, fonte 14, labels 12, linhas 36, máximo 2 níveis de card.
- Celular: padding 16, alvos 48, corpo 16, meta 13, barra inferior 72–80.
- TV: piso 20 px, turno 32–40, dado 96–160, 3 zonas.
- Movimento: 90 press, 120 hover, 160 pop, 240 panel, 280 sheet, 480 dice;
  `--ease-settle` só para o dado; `prefers-reduced-motion` desliga loops.

## 3. Arquitetura de informação

### 3.1 Rotas e shell

- `/` — landing quando deslogado; **Lobby** quando logado (mesas recentes,
  `Mestrar`/`Jogar`/`TV` por papel, `+ Nova mesa`, `Entrar por link/código`).
- `/tables` continua funcionando (redirect/alias para o Lobby ou mesma view).
- `/login` e `/register` — shell dividido com marca/contexto; sem header global.
- `/table/:id` — cockpit DM; header próprio de 56 px, sem nav global.
- `/play/:id` — shell mobile próprio; header 48 px, bottom nav.
- `/display/:id` — TV; sem header global; 3 zonas.
- `/profile` — conta + preferências; user menu.
- `/systems` — catálogo de sistemas no padrão de arquivo.

Header global (home/auth/tables/profile/systems): 64 px desktop/48 mobile,
wordmark, breadcrumb, usuário (`Perfil`, `Sair`), sem “Home/Login/Logout” em
inglês. Skip link primeiro focável; `main#conteudo`.

### 3.2 DM — 3 zonas

```
[ rail de ferramentas ] [ tabuleiro + turn bar ] [ painel dockado 4 abas ]
```

- Rail: ícone **+ label**, 44 px, atalhos 1–7, `+ Token` sempre visível.
- Turn bar persistente no board: ator atual, movimento restante, `Passar turno`,
  `Desfazer`.
- Painel dockado (não flutua, não cobre o mapa), 4 abas:
  **Cena · Iniciativa · Sessão · Convidar**.
  - Cena: upload/drag, preview, cols/rows/escala, calibrar grade, lista com
    thumbnails, criar/ativar em um passo.
  - Iniciativa: roster de tokens, adicionar/remover **sem apagar o token**,
    reordenar, rolar iniciativa, dono/PV/CA inline.
  - Sessão: iniciar/pausar/encerrar (confirmação), sistema.
  - Convidar: QR 120 px + ampliar, link e código, TV.
- Fichas: aba/seção no painel, com `+ Nova ficha` e abrir por personagem.
- Histórico: um drawer com abas **Rolagens / Ações / Chat**.
- Chat e chamada: drawers/barras, nunca cards permanentes sobre o mapa.

### 3.3 Jogador mobile

```
header 48 (mesa/cena/status)
tabuleiro (≥55% da tela, pinça/pan, anel “VOCÊ”)
turn bar 56 (só na sua vez; “SEU TURNO”, movimento, Encerrar)
bottom nav 64: Ficha · Tabuleiro · Dados · Chat · Chamada
```

- Sem `rev`, role ou telemetria.
- Toque no token abre detalhes; long-press é secundário.
- `Ficha`: 4 abas (Resumo/Combate/Inventário/Notas), sticky save.
- `Dados`: presets da ficha + expressão livre; resultado no overlay assinatura.
- `Mesa`: chat, chamada compacta, presença, ping, pedir ao Mestre.
- Começar sem token/personagem: CTAs claros (`Criar ficha`, `Vincular token`,
  `Pedir ao Mestre`), nunca “Sem token” seco.
- Mover: confirmação “3 quad · 4,5 m” + Desfazer 5 s.
- Safe area real (`viewport-fit=cover`), teclado sem cobrir composer/salvar.

### 3.4 TV

- 3 zonas: board + rail de iniciativa + ticker de 3 rolagens; rodapé discreto.
- Sem `rev`, role, “Mestre”, controles ou debug.
- Turno atual em 32–40 px; log 20 px; empty state falando com jogadores
  (“Entrem em /play com o código X”).
- Dado em tela cheia por ~5 s, depois volta ao board.

## 4. Backlog funcional consolidado

Fonte detalhada: `/tmp/opencode/audit-functions.md` (inventário de cada
controle, flags DEAD/DUP/DESTR/HIDDEN/NOFB e critérios completos).
Aqui ficam só os itens que bloqueiam a fase e a onda responsável.

### 4.1 P0 — bloqueiam “jogável por uma mesa nova”

| ID | Item | Onda | Aceite |
|---|---|---|---|
| F0-1 | **Ficha**: criar/listar/abrir/vincular. Nenhuma view chama `createCharacter` hoje. | D3/D4 | DM cria ficha D&D/OP2/OPSH para um jogador, persiste, aparece na iniciativa/token; jogador vê a própria ficha e não a de outro; criar não exige token. |
| F0-2 | **Token**: criar/editar/atribuir/excluir por toque e teclado, não só `contextmenu`; inspetor com excluir + confirmar. | D3 | Em 390×844 o DM faz o ciclo completo sem clique direito; remover da iniciativa **não** apaga o token; excluir token some do mapa/iniciativa em todos os clientes com 1 revision. |
| F0-3 | **Iniciativa não destrutiva**: `requestRemoveFromInitiative` deixa de apagar; novo `requestDeleteToken` separado. | D7 (backend) | Remover do turno mantém o token e não emite `tokenRemoved`; delete exige DM e confirmação; ack/erro em ambos. |
| F0-4 | **Roteamento por papel**: lobby abre `/table` só para DM; PLAYER vai a `/play`; `/play` tem saída. | D2/D4 | Jogador clicando na mesa cai em `/play` com token card e nav; consegue sair sem botão do navegador; `/table` direto como PLAYER redireciona. |
| F0-5 | **Ações destrutivas**: encerrar sessão, excluir cena, remover jogador, aplicar grade, rotacionar TV — todas nomeiam objeto/consequência e pedem confirmação. | D3 | Nenhuma ação destrutiva commita em um clique; confirm acessível por teclado e devolve foco. |
| F0-6 | **Entrar por link ou código**: colar URL extrai o código; sucesso navega para a rota certa. | D2 | Link de convite e código funcionam no mobile; erro de rede aparece com retry. |
| F0-7 | **Sessão visível**: status, rodada, quem está conectado e TV na barra do DM. | D3 | DM responde “está ao vivo? de quem é o turno? quem está online? a TV está ligada?” sem abrir aba. |
| F0-8 | **Cena em um passo**: upload + grade + ativar, com thumbnails e feedback em todos os clientes. | D3 | Criar/ativar cena não deixa jogador/TV com board em branco sem explicação; grade tem “Aplicar”. |
| F0-9 | **Histórico único**: um drawer com Rolagens/Ações/Chat; sem ActionLog + RollLog duplicados. | D3/D5 | Uma rolagem aparece uma vez por superfície (DM, TV, jogador). |
| F0-10 | **Estados**: loading, erro, offline/reconnect e vazio com CTA em todas as ações; toast `aria-live`. | D1/D2/D3/D4 | Falha de rede nunca vira “você não tem mesas”; reconexão não deixa estado divergente. |
| F0-11 | **Auth**: login por usuário/email, olho na senha, registro com confirmação e login automático. | D2 | Backend já aceita `{identifier}`; frontend usa; erros inline; sem 429 silencioso. |

### 4.2 P1 — primeira sessão normal

- Medir/ping no `/play` + pinça/pan no tabuleiro (`TABLE_MODE.md` prevê escrita
  do jogador; hoje não existe UI — decidir e alinhar contrato).
- Criar mesa com seletor de sistema visível (D&D padrão) + checklist de primeira
  mesa (convidar → cena → token → iniciar).
- Estado do link da TV após reload (`sessionStorage`; rotação só com aviso).
- Ficha suja: indicador, confirmar ao fechar, não sobrescrever digitação remota.
- Chamada: roster/kick para o DM, sem card permanente sobre o mapa.
- Upload de token/avatar com progresso e retry.

### 4.3 Remover/encerrar agora
- Paleta de cor do DM no toolbar (controle morto; jogador pode escolher roxo).
- Superfície de dados duplicada no DM (popup + embutida).
- Pills flutuantes de Chat/Log sobre o painel.
- `rev`, role e telemetria no `/play` e na TV.
- Micro-labels em caixa alta e emoji como ícone.

### 4.4 Varredura final D6 (componentes legados)

Ainda carregam gradiente/blur/emoji ou modal sem foco e precisam da passagem
final antes do deploy:

- `DiceAnimation.vue` (D5a), `DiceRoller.vue` (painel DM/TV) e
  `DiceSandboxView.vue`.
- `chat/ChatPanel.vue`, `chat/ChatToggle.vue`.
- `media/MediaDock.vue`, `media/ParticipantGrid.vue`.
- `character/VitalsBar.vue`.
- `AuraDialog.vue` (modal em `div`, sem foco/Esc).
- `SceneManager`/`DMSessionControls`/`TableSharePanel` restos de estilo antigo
  (D3b).
- Garantir que nenhum `linear-gradient`/`radial-gradient`/`backdrop-filter`
  sobre em UI (exceto os aliases inertes do `main.css`).

## 5. Acessibilidade (não negociável)

- `lang="pt-BR"`, títulos por rota, skip link, landmarks corretos.
- Contraste AA: texto ≥4,5:1; controles ≥3:1; foco 2 px `--focus`.
- Teclado: abrir mesa, tokens via lista `sr-only`, diálogos com foco preso/Esc,
  toggles `<button aria-expanded>`, logout `<button>`.
- Labels programáticos em todos os campos; erros inline.
- Toast `role=status`/`alert`; ícones decorativos `aria-hidden`.
- Alvos ≥44×44; zoom/reflow 200% e 320 px sem scroll horizontal.
- `prefers-reduced-motion` em vídeos/loops; sem autoplay infinito.
- Matriz: 320×568, 390×844, 768×1024, 1024×768 (200%), 1440×900,
  1920×1080 TV, 844×390 landscape.

## 6. Orçamento de mídia

| Item | Alvo |
|---|---|
| Landing inicial | ≤350 KB |
| Logo | ≤20 KB WebP/AVIF em 256 px |
| Favicon | ≤15 KB |
| Overlay videos | ≤400 KB cada, `preload=none`, poster, ou CSS |
| Fontes | 2–3 famílias, woff2, swap |
| JS inicial gz | ≤200 KB |
| CSS gz | ≤30 KB |
| LCP/CLS/INP | ≤2,5 s / ≤0,05 / ≤200 ms |
| Lighthouse a11y | 100 (mín. 98) |
| axe serious+ | 0 nas 8 rotas + estados |

Estado após a otimização (`coder/assets`, `4c0f64b`): logo 45 KB PNG +
`logo-256.webp`/`.avif` ~19 KB; favicons 2,9–60 KB; vídeos 118–384 KB com
posters JPG. `frontend/public` caiu de ~18 MB para 1,6 MB. As telas novas devem
usar `/logo-256.webp`, `<video preload="none" poster="/media/x.jpg">` e nunca
autoplay infinito sem `prefers-reduced-motion`.

## 7. Ondas de implementação

| Onda | Entrega | Responsável |
|---|---|---|
| D1 | tokens, base CSS, fontes, shell, Toast, Icon, BaseDialog/Sheet | concluída (`468768f`) |
| D2 | Home/Lobby, Login, Registro, Mesas, Perfil, Sistemas | concluída (`6be97f1`) |
| D3a | layout 3 zonas, top bar, rail, painel 4 abas, turn bar, token (criar/editar/excluir) | concluída (`b89deb7`) |
| D3b | cena em um passo, grade, convite/TV e sessão | concluída (`eb5c105`) |
| D3c | fichas do Mestre (criar/listar/vincular) e histórico único | concluída (`ce25129`) |
| D4a | shell do jogador, bottom nav, turn bar, câmera do tabuleiro, saída | concluída (`89954c2`) |
| D4b | ficha (criar/listar), dados, chat/chamada no nav | concluída (`cd06c79`) |
| D5a | TV em 3 zonas + dado assinatura (SVG, papel, sem loop) | concluída (`d35e27d`) |
| D5b | momento do dado no celular | concluída (`e523503`) |
| D6a | E2E atualizado + axe + correções de teste | QA |
| D6b | cockpit compacto: mídia, chat e dados | QA |
| D6c | varredura visual final, medição do jogador e deploy | QA |
| D7 | backend: iniciativa não destrutiva + `requestDeleteToken` | concluído (`4e8798b`) |

Cada onda tem branch/worktree própria a partir de `design/overhaul-v1`, revisão
do PO e merge `--no-ff`. A produção só é atualizada após a onda D6.

## 8. Critérios de aceite da fase

- [x] Home logada é Lobby com mesas/ações por papel; sem becos sem saída.
- [x] Login por usuário ou email; olho de senha; registro com confirmação e
      login automático.
- [x] DM cria token e ficha, vê turno, remove da iniciativa sem apagar token,
      cria/ativa cena com upload/grade em um fluxo.
- [x] Painel DM dockado, 4 abas, sem cobrir o board; mídia compacta e chat/log em dock.
- [x] Jogador mobile: tabuleiro ≥55%, bottom nav, turno visível, ficha/dados/
      chat/chamada; sem `rev`/role visível.
- [x] TV legível a 3 m, sem debug; dado aparece na TV/jogador.
- [x] Contraste AA, teclado, foco, labels, toasts, 44 px, 320 px, reduced motion.
      (guard `npm run check:contrast`; auditoria axe final em D6a.)
- [x] E2E (80/80), caos, axe (8/8 rotas), unitários e build verdes.
- [x] Deploy Render/Vercel e smoke de produção (2026-11-17).

### 8.1 Resultados dos gates (2026-11-17)

| Gate | Resultado |
|---|---|
| Backend (Jest) | **265/265** |
| Frontend (Vitest) | **512/512** |
| Type-check + build | verdes |
| ESLint (frontend) | 0 erros |
| Contraste (`check:contrast`) | 45/45 pares AA |
| E2E (Playwright, Chrome) | **80/80** |
| axe (8 rotas) | **0 critical/serious** |
| Caos (6 clientes) | **PASS** |
| Assets públicos | 1,6 MB (logo 45 KB, vídeos 118–384 KB) |
| Produção | frontend Vercel + API Render no ar; login por identificador validado |

## 8.2 Correções pós-beta (feedback do PO)

- Home online-first: presencial e online no mesmo peso; TV como opção.
- Logo da taverna no rodapé da landing e no login.
- `/` logado redireciona para `/tables`; “Início” some da navegação.
- Perfil com 15 cores de régua (inclui roxo/violeta) + cor personalizada.
- Cena: “Trocar imagem” da cena ativa sem recriar cena.
- Ficha D&D: vitais + 4 abas fixas (Identidade/Atributos/Combate/Inventário & Notas).
- Token vence a ferramenta de medição ao clicar num token editável.
- Chat com ícone no dock; vídeos/GIFs de overlay removidos.
- Um único `＋ Token` por superfície; Convidar/Sessão/Fichas/Dados sem duplicatas.
- TV/jogador: cena de imagem sem grade, tokens, iniciativa ou turno; batalha inalterada.
- Seletor de cena e botão “Mesas” visíveis; sistema da mesa só nas configurações do lobby.

## 9. Invariantes

- Não trocar o renderizador DOM/SVG; não reintroduzir Pixi.
- Não unificar `/table` e `/play`; corrigir entradas e shells.
- Coordenadas de grade e REALTIME_PROTOCOL permanecem.
- Não confiar no cliente para autorização; toda mutação responde ack/erro.
- Não commitar PDFs nem segredos.
