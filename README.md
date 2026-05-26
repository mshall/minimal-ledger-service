# Minimal Ledger Service

This is a minimal production-grade ledger service: a double-entry accounting core exposed over HTTP, with database-enforced invariants, idempotent writes, materialised balances reconciled against an append-only journal, and the operational scaffolding (migrations, tests, metrics, OpenAPI, Docker) expected of a real banking subsystem.

## Architecture decisions

- **Postgres** — ACID transactions, row-level locking, deferrable constraint triggers, and mature operability; the ledger truth lives in SQL, not in application memory.
- **`bigint` minor units, not `decimal`** — Exact integer arithmetic end-to-end avoids floating-point and scale surprises; amounts on the wire are decimal strings parsed to `bigint`.
- **Deferred constraint trigger** — Double-entry balance per currency is enforced at `COMMIT` via a deferrable `AFTER INSERT` trigger on `entries`, so a bug in application code cannot persist an unbalanced transaction.
- **Materialised balance + verifier** — `account_balances` is a read-optimised cache updated in the same transaction as postings; `npm run verify-balances` recomputes from the journal and alarms on drift.
- **Idempotency inside the business transaction** — Cached responses are written in the same Postgres transaction as accounts/transactions, eliminating “cached 201 but rolled-back work” failure modes.

## Setup

```bash
docker compose up -d
cp .env.example .env
npm ci
npm run migrate
npm run dev
```

The API listens on `http://localhost:3000`. OpenAPI UI: `http://localhost:3000/docs`. Metrics: `http://localhost:3000/metrics`.

## npm scripts

| Script            | Description                                |
| ----------------- | ------------------------------------------ |
| `dev`             | Start API with hot reload (`tsx watch`)    |
| `build`           | Compile TypeScript to `dist/`              |
| `start`           | Run compiled production build              |
| `test`            | Vitest suite (Testcontainers Postgres)     |
| `test:cov`        | Tests with ≥90% coverage gate on `src/`    |
| `lint`            | ESLint (strict TypeScript rules)           |
| `typecheck`       | `tsc --noEmit` for app + tests             |
| `migrate`         | Apply SQL migrations from `migrations/`    |
| `verify-balances` | Reconcile materialised vs journal balances |

## API quickstart

Create two accounts and post a balanced $100.00 (10000 cents) transfer:

```bash
# Create liability wallet
curl -s -X POST http://localhost:3000/v1/accounts \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-wallet-1' \
  -d '{"name":"Customer wallet","type":"LIABILITY","currency":"USD"}'

# Create asset cash account (use returned id)
curl -s -X POST http://localhost:3000/v1/accounts \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-cash-1' \
  -d '{"name":"Cash","type":"ASSET","currency":"USD"}'

# Balanced transaction (replace ACCOUNT_IDs)
curl -s -X POST http://localhost:3000/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-txn-1' \
  -d '{
    "description":"Funding",
    "entries":[
      {"account_id":"ASSET_ID","direction":"DEBIT","amount":"10000","currency":"USD"},
      {"account_id":"LIABILITY_ID","direction":"CREDIT","amount":"10000","currency":"USD"}
    ]
  }'

# Unbalanced (rejected 422)
curl -s -X POST http://localhost:3000/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-txn-bad' \
  -d '{"entries":[
    {"account_id":"ASSET_ID","direction":"DEBIT","amount":"10000","currency":"USD"},
    {"account_id":"LIABILITY_ID","direction":"CREDIT","amount":"5000","currency":"USD"}
  ]}'

# Idempotency replay (same key + body → identical response)
curl -s -X POST http://localhost:3000/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-txn-1' \
  -d '{ ... same body ... }'

# Balance (materialised + journal)
curl -s http://localhost:3000/v1/accounts/LIABILITY_ID/balance
```

## What's deliberately minimal

| Omission                | Production extension                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| **No auth**             | JWT/OAuth2 + mTLS at the edge; service accounts for internal posters |
| **Single-region**       | Active-passive or active-active Postgres with conflict detection     |
| **No event publishing** | Transactional outbox → Kafka for downstream projections              |
| **No FX**               | Cross-currency as two linked transactions via a clearing account     |

## Verification

```bash
npm run verify-balances
```

Emits JSON with `drifts: []` when healthy. Any row where `account_balances.balance` ≠ journal-derived balance appears in `drifts` and exits non-zero. The job increments `ledger_balance_drift_total` and logs at `error`.

## Testing strategy

| Layer                     | Guards against                                                           |
| ------------------------- | ------------------------------------------------------------------------ |
| **Unit**                  | Money parsing/overflow; posting validation without I/O                   |
| **Integration**           | HTTP contracts, idempotency, DB trigger + routes on real Postgres        |
| **Concurrency**           | Lost updates / torn writes under 50 parallel posters                     |
| **Property (fast-check)** | Journal ≡ materialised balance across random valid transaction sequences |
