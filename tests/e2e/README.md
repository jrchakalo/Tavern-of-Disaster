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
