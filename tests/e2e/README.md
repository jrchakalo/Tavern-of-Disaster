# E2E — Tavern of Disaster

Playwright test that drives a real DM browser and a real player browser against a
fresh in-memory MongoDB, exercising login, table creation/join, scene, token,
movement, initiative and dice sync.

## Run

```bash
cd tests/e2e
npm ci

# Download Playwright's Chromium (recommended for CI/clean machines):
npx playwright install chromium
npx playwright test

# Or use an already-installed Google Chrome:
E2E_CHANNEL=chrome npx playwright test
```

The global setup starts the backend (`ts-node`, port 3100), an in-memory MongoDB
and Vite (port 4173), then shuts everything down. No external services needed.

Useful env vars:

| Variable | Default | Meaning |
|---|---|---|
| `E2E_CHANNEL` | — | `chrome` / `msedge` to reuse a system browser |
| `E2E_BACKEND_PORT` | `3100` | Backend port |
| `E2E_FRONTEND_PORT` | `4173` | Vite port |
| `E2E_BASE_URL` | `http://127.0.0.1:4173` | URL used by browser tests |
| `E2E_BACKEND_URL` | `http://127.0.0.1:3100` | URL used by API helpers |

Artifacts (screenshots, traces, videos) go to `test-results/` and
`playwright-report/`, both ignored by Git.

## Realtime protocol tests (Phase 1)

`specs/realtime-authz.spec.ts` checks the authorization and ack contract of
`docs/REALTIME_PROTOCOL.md` (join rules, `FORBIDDEN` on DM-only mutations,
cross-table IDOR, `actionError` without an ack callback, monotonic `revision`).
It drives REST + `socket.io-client` only — no browser needed.

```bash
npx playwright test specs/realtime-authz.spec.ts --reporter=list
```

The 6-client chaos harness is standalone (it boots its own backend and an
in-memory MongoDB) and lives in `chaos/`:

```bash
cd tests/e2e
node chaos/run.mjs
```

See `chaos/README.md` for the checklist and how to read its JSON report.

## Table mode tests (Phase 2)

`specs/table-mode.spec.ts` drives 1 TV (1920×1080) + 5 mobile players (390×844)
through `docs/TABLE_MODE.md`: display token, invite join, convergence, movement,
turn ownership, dice log, reload and an accelerated 60-minute loop.
`specs/display-security.spec.ts` checks display read-only enforcement, display
token rotation/revocation and grid-coordinate pings (2 clients).

```bash
# Chrome do sistema (evita baixar o Chromium do Playwright)
E2E_CHANNEL=chrome npx playwright test specs/table-mode.spec.ts --workers=1
E2E_CHANNEL=chrome npx playwright test specs/display-security.spec.ts --workers=1
```

Both specs use `test.describe.configure({ mode: 'serial' })` because they share
a table/token/page world. Run them with `--workers=1` and do not enable retries:
the scenario already consumes the `limitCreate` bucket (20 req / 5 min).

> Phase 2 status: validated against `restore/phase-2-table-mode` (`e67e730`) —
> **14/14 passed** (`table-mode` 9/9 + `display-security` 5/5) in 38.7 s.
> See `docs/qa/PHASE2-TABLE-MODE-REPORT.md` for evidence, execution commands and
> the PO verdict fields.

## Sheets, dice and systems tests (Phase 3)

`specs/sheets-dice.spec.ts` drives a DM (desktop), 2 players and a TV through
`docs/SHEETS_DICE.md`: sheet creation/linking, HP propagation, HP validation,
`2d6+3` log persistence, Cyberpunk RED `1d10!` preset/explosion, reconnect and
cross-table character authorization.
`specs/sheets-dice-online.spec.ts` repeats the core flow with two remote browser
contexts and no TV (online-aware smoke; voice/video is Phase 5).

```bash
# Chrome do sistema, Mongo em memória e um worker (describes são serial)
E2E_CHANNEL=chrome npx playwright test \
  specs/sheets-dice.spec.ts specs/sheets-dice-online.spec.ts --workers=1
```

Both specs detect missing Phase 3 surfaces up front and fail with the contract
items that are absent instead of reporting false passes. See
`docs/qa/PHASE3-SHEETS-DICE-REPORT.md` for the current (pre-integration) status,
known selector risks and the PO fields to fill after the integration.
