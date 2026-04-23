# Actual Budget Extension API — Implementation Plan

> **Goal:** Expose a secure, self-hosted HTTP REST API that wraps the official `@actual-app/api`
> Node.js library, enabling external automation tools (n8n, Home Assistant, scripts, etc.) to
> interact with an Actual Budget instance without needing to write Node.js code directly.

---

## Background

Actual Budget does **not** expose native HTTP/REST endpoints. It ships a Node.js NPM package
(`@actual-app/api`) that communicates with the Actual server by downloading a local copy of the
budget and operating on it in-process. This project builds a thin HTTP wrapper around that
library — essentially a "sidecar API" that runs alongside the Actual server.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  External Automation  (n8n / Home Assistant / curl)  │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP REST (JSON)
┌────────────────────────▼─────────────────────────────┐
│           actual-budget-extension-api                 │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Express.js  │  │  Services  │  │   Middleware  │  │
│  │  Router      │  │  (domain)  │  │  (auth/val.) │  │
│  └──────┬───────┘  └─────┬──────┘  └──────────────┘  │
│         └────────────────▼──────────────────────────  │
│                  @actual-app/api (NPM)                 │
└────────────────────────┬─────────────────────────────┘
                         │ Internal TCP / local file
┌────────────────────────▼─────────────────────────────┐
│                 Actual Budget Server                   │
└──────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Concern         | Choice                                      |
|-----------------|---------------------------------------------|
| Runtime         | Node.js 20 LTS                              |
| Language        | TypeScript (strict mode)                    |
| Framework       | Express.js 5                                |
| Budget client   | `@actual-app/api` (official)                |
| Validation      | `zod`                                       |
| Auth            | Static API-Key header (`X-API-Key`)         |
| Logging         | `pino` + `pino-http`                        |
| Testing         | Vitest + Supertest                          |
| Containerization| Docker (multi-stage, `node:20-alpine`)      |
| Linting         | ESLint + Prettier (Conventional Commits)    |

---

## Project Structure

```
actual-budget-extension-api/
├── src/
│   ├── index.ts                 # Entry point — bootstrap & graceful shutdown
│   ├── app.ts                   # Express app factory (used in tests too)
│   ├── config.ts                # Env vars via zod (validated at startup)
│   ├── actual/
│   │   └── client.ts            # Singleton wrapper around @actual-app/api
│   ├── middleware/
│   │   ├── auth.ts              # X-API-Key guard
│   │   ├── errorHandler.ts      # Global error -> JSON response
│   │   └── requestLogger.ts     # pino-http
│   ├── routes/
│   │   ├── index.ts             # Mount all routers
│   │   ├── health.ts            # GET /health
│   │   ├── accounts.ts          # /accounts endpoints
│   │   ├── transactions.ts      # /transactions endpoints
│   │   ├── budgets.ts           # /budgets endpoints
│   │   └── categories.ts        # /categories endpoints
│   ├── services/
│   │   ├── accountService.ts
│   │   ├── transactionService.ts
│   │   ├── budgetService.ts
│   │   └── categoryService.ts
│   └── types/
│       └── api.ts               # Shared request/response types
├── tests/
│   ├── health.test.ts
│   ├── accounts.test.ts
│   └── transactions.test.ts
├── ai/
│   └── plan.md                  # This file
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── Dockerfile
├── docker-compose.yml
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Phase 1 — Project Scaffold & Configuration

### Tasks
- [ ] `npm init`, install dependencies (`express`, `@actual-app/api`, `zod`, `pino`, `pino-http`)
- [ ] Install dev-dependencies (`typescript`, `tsx`, `vitest`, `supertest`, `eslint`, `prettier`)
- [ ] `tsconfig.json` — strict mode, `moduleResolution: "bundler"` (required by `@actual-app/api`)
- [ ] `src/config.ts` — parse & validate all env vars via `zod`:
  - `ACTUAL_SERVER_URL` — URL of the running Actual server
  - `ACTUAL_PASSWORD` — Actual server password
  - `ACTUAL_BUDGET_ID` — Sync ID from Actual settings
  - `ACTUAL_DATA_DIR` — local cache dir for the API client (default: `./data`)
  - `ACTUAL_E2E_PASSWORD` — optional, for end-to-end encrypted budgets
  - `API_KEY` — secret key callers must send in `X-API-Key`
  - `PORT` — HTTP port (default: `3000`)
- [ ] `.env.example` with all variables documented

---

## Phase 2 — Actual Client Singleton

### `src/actual/client.ts`

The API client **must not** be initialised multiple times (it manages a local file lock).
Expose a single initialised instance, with retry logic on startup.

```ts
// Pseudocode
let _ready = false;

export async function initActual() {
  await api.init({
    dataDir:   config.ACTUAL_DATA_DIR,
    serverURL: config.ACTUAL_SERVER_URL,
    password:  config.ACTUAL_PASSWORD,
  });
  await api.downloadBudget(config.ACTUAL_BUDGET_ID, {
    password: config.ACTUAL_E2E_PASSWORD,   // undefined if not set
  });
  _ready = true;
}

export function getActualApi() {
  if (!_ready) throw new Error('Actual client not initialised');
  return api;
}
```

> **Important:** `api.shutdown()` must be called on `SIGTERM`/`SIGINT` for clean exits inside Docker.

---

## Phase 3 — Middleware

### `src/middleware/auth.ts`
- Read `X-API-Key` header on every request (except `/health`).
- Compare with `config.API_KEY` using constant-time comparison (`crypto.timingSafeEqual`).
- Return `401` on mismatch.

### `src/middleware/errorHandler.ts`
- Catch-all Express error handler.
- Returns structured JSON: `{ error: string, details?: unknown }`.
- Zod validation errors → `400`, unhandled → `500`.

### `src/middleware/requestLogger.ts`
- `pino-http` for structured request/response logs.

---

## Phase 4 — REST Endpoints

### Health

| Method | Path      | Auth | Description              |
|--------|-----------|------|--------------------------|
| GET    | `/health` | No   | Liveness / readiness check |

Response: `{ status: "ok", ready: boolean }`

---

### Accounts

| Method | Path            | Auth | Description        |
|--------|-----------------|------|--------------------|
| GET    | `/accounts`     | Yes  | List all accounts  |
| GET    | `/accounts/:id` | Yes  | Get single account |

---

### Transactions

| Method | Path                             | Auth | Description                              |
|--------|----------------------------------|------|------------------------------------------|
| GET    | `/transactions`                  | Yes  | List transactions (query: `accountId`, `startDate`, `endDate`) |
| POST   | `/transactions`                  | Yes  | Import one or more transactions          |
| PATCH  | `/transactions/:id`              | Yes  | Update a transaction                     |
| DELETE | `/transactions/:id`              | Yes  | Delete a transaction                     |

**POST body schema (zod):**
```ts
z.object({
  accountId: z.string(),
  transactions: z.array(z.object({
    date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount:  z.number(),           // In dollars, converted to integer internally
    payee:   z.string().optional(),
    notes:   z.string().optional(),
    cleared: z.boolean().default(false),
  })),
})
```

---

### Budgets

| Method | Path               | Auth | Description              |
|--------|--------------------|------|--------------------------|
| GET    | `/budgets/:month`  | Yes  | Get budget for `YYYY-MM` |
| PATCH  | `/budgets/:month`  | Yes  | Set budget amount for category |

---

### Categories

| Method | Path            | Auth | Description          |
|--------|-----------------|------|----------------------|
| GET    | `/categories`   | Yes  | List all categories  |

---

## Phase 5 — Dockerisation

### `Dockerfile` (multi-stage)
```dockerfile
# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build   # tsc → dist/

# --- Runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json .
VOLUME ["/app/data"]   # Actual local cache dir
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### `docker-compose.yml` (development helper)
```yaml
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      ACTUAL_SERVER_URL: http://actual:5006
      ACTUAL_PASSWORD:   ${ACTUAL_PASSWORD}
      ACTUAL_BUDGET_ID:  ${ACTUAL_BUDGET_ID}
      API_KEY:           ${API_KEY}
    volumes:
      - actual-data:/app/data
    depends_on: [actual]

  actual:
    image: actualbudget/actual-server:latest
    ports: ["5006:5006"]
    volumes:
      - actual-server-data:/data

volumes:
  actual-data:
  actual-server-data:
```

---

## Phase 6 — Testing

### Strategy
- **Unit tests** — service layer logic (mocked `@actual-app/api`)
- **Integration tests** — HTTP layer via `supertest` (mocked client singleton)
- **No live Actual server required** for CI

### Test coverage targets
| Area         | Coverage |
|--------------|----------|
| Routes       | 90 %+    |
| Services     | 85 %+    |
| Middleware   | 90 %+    |

---

## Phase 7 — CI/CD (GitHub Actions)

### `.github/workflows/ci.yml`
```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t actual-budget-extension-api .
```

---

## Environment Variables Reference

| Variable              | Required | Default  | Description                                     |
|-----------------------|----------|----------|-------------------------------------------------|
| `ACTUAL_SERVER_URL`   | ✅       | —        | URL of your Actual Budget server                |
| `ACTUAL_PASSWORD`     | ✅       | —        | Actual server login password                    |
| `ACTUAL_BUDGET_ID`    | ✅       | —        | Sync ID from Settings → Advanced               |
| `ACTUAL_DATA_DIR`     | ❌       | `./data` | Local path for budget file cache                |
| `ACTUAL_E2E_PASSWORD` | ❌       | —        | E2E encryption password (if enabled)            |
| `API_KEY`             | ✅       | —        | Bearer key for `X-API-Key` header               |
| `PORT`                | ❌       | `3000`   | HTTP port to listen on                          |

---

## Security Considerations

- **API Key** is the only auth mechanism; use a long random secret (32+ chars).
- API Key should be passed via `X-API-Key` header, **never** in the query string.
- Actual passwords stored only in env vars, never hard-coded or logged.
- Docker image runs as a **non-root user** (`node` user from the Alpine image).
- Rate limiting (`express-rate-limit`) to be added in a follow-up if exposed publicly.

---

## Implementation Order (Recommended)

1. Scaffold + `tsconfig` + `config.ts`
2. Actual client singleton
3. Express app + middleware
4. `/health` endpoint + first passing test
5. Accounts routes + service + tests
6. Transactions routes + service + tests
7. Budgets + Categories routes
8. Dockerfile + docker-compose
9. GitHub Actions CI

---

## Open Questions / Decisions Needed

| # | Question | Default Assumption | Answer   |
|---|----------|--------------------|--------|
| 1 | Should the API reconnect to Actual automatically on budget sync? | Re-download on startup only; add `POST /reload` endpoint for manual sync | yes.  |
| 2 | Should pagination be supported for `/transactions`? | Yes — `limit` + `offset` query params | yes. |
| 3 | Do you need webhook support (Actual → external)? | Out of scope for v1 | no |
| 4 | Should this be deployed alongside the existing infrastructure (Docker Compose in `uniq-infrastructure`)? | Yes — add service definition in follow-up PR | no |
