# Actual Budget Extension API + Telegram Bot

REST extension API and optional Telegram bot for [Actual Budget](https://actualbudget.org/), built with Node 24, TypeScript, Express 5, Zod, and grammY.

## Architecture

- **Shared Service Layer (`src/services/`)**: Business logic for accounts, categories, transactions, and budgets shared between REST endpoints and Telegram bot handlers.
- **Serialized Actual Client (`src/actual/client.ts`)**: FIFO mutex (`withActual`) serializing access to `@actual-app/api`, with throttled on-demand sync, background sync, and safe reload ordering.
- **REST API (`src/routes/`)**: API-key authenticated HTTP endpoints (`X-API-Key`). Only `GET /health` is unauthenticated; `POST /reload` and all financial endpoints require `X-API-Key`.
- **Telegram Bot (`src/telegram/`)**: Optional long-polling bot (starts automatically when `TELEGRAM_BOT_TOKEN` is set). Locked down to private chats and an explicit numeric user ID allowlist. Failures in Telegram never take down the HTTP API.

---

## Quick Start

### 1. Install Dependencies

Requires Node.js >= 24.

```bash
npm ci
cp .env.example .env
```

### 2. Configure Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACTUAL_SERVER_URL` | Yes | — | URL of your Actual server (e.g., `http://localhost:5006`) |
| `ACTUAL_PASSWORD` | Yes | — | Actual server password |
| `ACTUAL_BUDGET_ID` | Yes | — | Budget Sync ID from Actual Settings -> Show Advanced Settings |
| `ACTUAL_DATA_DIR` | No | `./data` | Local SQLite cache directory for `@actual-app/api` |
| `ACTUAL_E2E_PASSWORD` | No | — | End-to-end encryption password, if enabled |
| `ACTUAL_SYNC_THROTTLE_MS` | No | `30000` | Minimum interval before reads trigger `api.sync()` |
| `ACTUAL_SYNC_INTERVAL_MS` | No | `300000` | Background sync interval in ms (`0` disables) |
| `API_KEY` | Yes | — | Secret key (>= 18 chars) passed via `X-API-Key` header |
| `PORT` | No | `3000` | HTTP server port |
| `APP_TIMEZONE` | No | System TZ | IANA timezone for local dates/months (e.g., `Asia/Manila`) |
| `APP_LOCALE` | No | `en-US` | `Intl` locale for currency and date formatting |
| `CURRENCY_CODE` | No | `USD` | ISO 4217 3-letter currency code (e.g., `USD`, `PHP`) |
| `TELEGRAM_BOT_TOKEN` | No | — | Bot token from `@BotFather`; omit to run REST-only |
| `TELEGRAM_ALLOWED_USERS` | If token set | — | Comma-separated numeric Telegram user IDs (required when token is set) |

### 3. Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`, and copy the bot token into `TELEGRAM_BOT_TOKEN`.
2. Message [@userinfobot](https://t.me/userinfobot) to find your numeric Telegram user ID and add it to `TELEGRAM_ALLOWED_USERS`.
3. Only private 1-on-1 chats with listed user IDs are permitted; group chats and unauthorized users are silently ignored.

Available bot commands: `/start`, `/help`, `/accounts`, `/categories`, `/transactions`, `/add`, `/budget`, `/setbudget`, `/cancel`.

In `/add`, numbers default to expenses (`25.50` or `-25.50` saves `-25.50`); prefix `+` for income (`+500`).

### 4. Custom / Self-Signed TLS Certificates

Do **not** set `NODE_TLS_REJECT_UNAUTHORIZED=0` (which disables certificate checks for Telegram API traffic as well). Instead, trust your internal CA certificate via Node's native flag:

```bash
NODE_EXTRA_CA_CERTS=/path/to/internal-ca.pem npm start
```

### 5. Run & Verify

```bash
npm run dev          # Development with watch reload
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript check
npm test             # Vitest test suite (does not require .env)
npm run build        # Compile to dist/
npm start            # Run compiled production build
```

Or with Docker Compose:

```bash
docker compose up -d --build
```
