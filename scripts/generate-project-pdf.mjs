#!/usr/bin/env node
/**
 * Generates docs/Minimal-Ledger-Service-Documentation.pdf from src sources.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs');
const htmlPath = join(outDir, 'Minimal-Ledger-Service-Documentation.html');
const pdfPath = join(outDir, 'Minimal-Ledger-Service-Documentation.pdf');

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readSrc(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const techStack = [
  ['Runtime', 'Node.js 22 LTS'],
  ['Language', 'TypeScript 5.x (strict, noUncheckedIndexedAccess)'],
  ['HTTP', 'Fastify 5'],
  ['Database', 'PostgreSQL 16'],
  ['ORM / migrations', 'Drizzle ORM + drizzle-kit'],
  ['Pool', 'pg (node-postgres)'],
  ['Validation', 'Zod'],
  ['API docs', '@fastify/swagger + swagger-ui (OpenAPI 3.1)'],
  ['Logging', 'pino (+ pino-pretty in dev)'],
  ['Metrics', 'prom-client'],
  ['Testing', 'Vitest, Supertest, Testcontainers, fast-check'],
  ['Lint / format', 'ESLint (typescript-eslint strict) + Prettier'],
  ['IDs', 'UUID v7 (uuid package)'],
  ['Money', 'native bigint (minor units)'],
  ['Containers', 'Docker multi-stage + docker-compose'],
];

const projectBreakdown = [
  ['Entry & config', 'index.ts, app.ts, config.ts', 'Boot, Fastify assembly, env validation'],
  ['Database', 'db/schema.ts, client.ts, migrate.ts', 'Drizzle schema, pool, SQL migrations'],
  ['Domain', 'domain/*.ts', 'Money, accounts, posting rules, errors'],
  ['Repositories', 'repositories/*.ts', 'Dumb SQL accessors'],
  ['Services', 'services/*.ts', 'Business orchestration + transactions'],
  ['HTTP', 'http/routes, plugins, schemas, error-handler', 'REST API + idempotency'],
  ['Jobs', 'jobs/balance-verification.ts', 'Journal vs materialised reconciliation'],
  ['Observability', 'observability/*.ts', 'Structured logs + Prometheus'],
  ['Migrations', 'migrations/0001_init.sql', 'Schema + deferred double-entry trigger'],
];

const fileCatalog = [
  {
    section: 'Entry & Configuration',
    icon: '⚙️',
    color: '#1e3a5f',
    files: [
      {
        path: 'src/index.ts',
        purpose: 'Process entrypoint',
        explanation:
          'Loads config, runs migrations in development, builds Fastify, schedules idempotency cleanup and optional balance verification, listens on PORT, and implements graceful shutdown on SIGTERM/SIGINT with pool drain.',
      },
      {
        path: 'src/app.ts',
        purpose: 'Application factory',
        explanation:
          'buildApp() wires Swagger, request context, idempotency plugin, health/metrics routes, and v1 API routes. Records HTTP Prometheus metrics on every response without coupling domain code to HTTP.',
      },
      {
        path: 'src/config.ts',
        purpose: 'Environment validation',
        explanation:
          'Zod schema over process.env; fails fast at boot if DATABASE_URL or other required settings are invalid. Centralises shutdown timeout, idempotency TTL, and scheduler intervals.',
      },
    ],
  },
  {
    section: 'Database Layer',
    icon: '🗄️',
    color: '#0f4c5c',
    files: [
      {
        path: 'src/db/schema.ts',
        purpose: 'Drizzle table definitions',
        explanation:
          'Maps Postgres enums and tables: accounts, account_balances, transactions, entries (append-only journal), idempotency_keys. Uses bigint mode for money columns and documents relations for query ergonomics.',
      },
      {
        path: 'src/db/client.ts',
        purpose: 'Connection pool + Drizzle',
        explanation:
          'Creates pg.Pool and Drizzle Database instance. Exposes checkDbConnectivity() for /readyz readiness probes.',
      },
      {
        path: 'src/db/migrate.ts',
        purpose: 'Programmatic migrations',
        explanation:
          'Applies ordered SQL files from migrations/, tracking applied files in schema_migrations. Splits on drizzle-kit statement breakpoints so triggers run as separate statements.',
      },
      {
        path: 'migrations/0001_init.sql',
        purpose: 'Authoritative SQL + trigger',
        explanation:
          'Non-negotiable schema plus assert_double_entry_balanced() deferrable constraint trigger — the primary correctness guarantee that debits equal credits per currency at COMMIT.',
      },
    ],
  },
  {
    section: 'Domain Layer',
    icon: '🏛️',
    color: '#5c4033',
    files: [
      {
        path: 'src/domain/money.ts',
        purpose: 'Currency & amount primitives',
        explanation:
          'Supported ISO currencies (USD, EUR, GBP, AED), parse/format of minor-unit bigint amounts from wire strings, and safe add/subtract helpers. No floats anywhere.',
      },
      {
        path: 'src/domain/account.ts',
        purpose: 'Account model & balance math',
        explanation:
          'Normal-balance rules (DEBIT-normal for ASSET/EXPENSE, CREDIT-normal otherwise), journal balance derivation, and applying entries to materialised balances.',
      },
      {
        path: 'src/domain/transaction.ts',
        purpose: 'Posting validation',
        explanation:
          'App-side per-currency double-entry check before INSERT; complements the database trigger with friendlier 422 errors.',
      },
      {
        path: 'src/domain/errors.ts',
        purpose: 'Domain error hierarchy',
        explanation:
          'Typed errors (AccountNotFound, UnbalancedTransaction, IdempotencyConflict, etc.) with stable codes. Only the HTTP error handler maps these to RFC 7807 problem+json.',
      },
    ],
  },
  {
    section: 'Repositories',
    icon: '📦',
    color: '#4a4e69',
    files: [
      {
        path: 'src/repositories/accounts.repo.ts',
        purpose: 'Account & balance persistence',
        explanation:
          'Insert/find accounts, SELECT FOR UPDATE in sorted order (deadlock prevention), optimistic versioned balance updates.',
      },
      {
        path: 'src/repositories/entries.repo.ts',
        purpose: 'Journal access',
        explanation:
          'Append-only entry inserts, statement pagination, and journal SUM aggregates for verification. No UPDATE/DELETE on entries.',
      },
      {
        path: 'src/repositories/transactions.repo.ts',
        purpose: 'Transaction headers',
        explanation:
          'Insert and fetch logical transaction rows grouping journal lines.',
      },
      {
        path: 'src/repositories/idempotency.repo.ts',
        purpose: 'Idempotency cache storage',
        explanation:
          'Lookup/insert cached responses by client key; TTL cleanup by created_at.',
      },
    ],
  },
  {
    section: 'Services',
    icon: '⚡',
    color: '#9a031e',
    files: [
      {
        path: 'src/services/accounts.service.ts',
        purpose: 'Account lifecycle',
        explanation:
          'createAccount in a DB transaction (account + zero balance row + optional idempotency record). getBalance returns materialised and journal balances for audit.',
      },
      {
        path: 'src/services/transactions.service.ts',
        purpose: 'Double-entry posting (core)',
        explanation:
          'Single Postgres transaction: lock accounts, validate ACTIVE/currency, insert transaction + entries, update materialised balances, persist idempotency cache, increment ledger metrics. COMMIT fires deferred balance trigger.',
      },
      {
        path: 'src/services/idempotency.service.ts',
        purpose: 'Idempotency helpers',
        explanation:
          'Canonical JSON hashing (sorted keys), cache lookup, conflict detection, and persist-in-transaction API used by services.',
      },
    ],
  },
  {
    section: 'HTTP Layer',
    icon: '🌐',
    color: '#006466',
    files: [
      {
        path: 'src/http/routes/accounts.routes.ts',
        purpose: 'Account REST API',
        explanation:
          'POST/GET /v1/accounts, balance, cursor-paginated entries. Thin handlers: Zod parse → service → JSON.',
      },
      {
        path: 'src/http/routes/transactions.routes.ts',
        purpose: 'Transaction REST API',
        explanation:
          'POST /v1/transactions and GET by id. Delegates posting rules to TransactionsService.',
      },
      {
        path: 'src/http/routes/health.routes.ts',
        purpose: 'Ops endpoints',
        explanation:
          '/healthz liveness, /readyz DB check, /metrics Prometheus exposition with pool gauges.',
      },
      {
        path: 'src/http/idempotency.plugin.ts',
        purpose: 'Idempotency-Key enforcement',
        explanation:
          'Requires header on POST, hashes body, returns cached response on replay, 409 on key/body mismatch. Business persist happens inside service transaction.',
      },
      {
        path: 'src/http/request-context.plugin.ts',
        purpose: 'Request tracing',
        explanation:
          'Propagates request_id and trace_id into Pino child loggers; logs route, method, status, duration_ms on response.',
      },
      {
        path: 'src/http/error-handler.ts',
        purpose: 'RFC 7807 mapping',
        explanation:
          'Maps DomainError and Zod failures to problem+json; surfaces Postgres double-entry violation messages without rewriting DB text.',
      },
      {
        path: 'src/http/schemas/accounts.schema.ts',
        purpose: 'Account wire contracts',
        explanation:
          'Zod request/response shapes for accounts, balances, and statement entries — shared types for routes and tests.',
      },
      {
        path: 'src/http/schemas/transactions.schema.ts',
        purpose: 'Transaction wire contracts',
        explanation:
          'Zod schemas for posting payloads (amount as string) and transaction responses.',
      },
    ],
  },
  {
    section: 'Jobs',
    icon: '🔍',
    color: '#bc6c25',
    files: [
      {
        path: 'src/jobs/balance-verification.ts',
        purpose: 'Balance reconciliation',
        explanation:
          'Compares materialised account_balances to journal-derived totals per account. CLI via npm run verify-balances; optional interval scheduler; emits ledger_balance_drift_total on mismatch.',
      },
    ],
  },
  {
    section: 'Observability',
    icon: '📊',
    color: '#2d6a4f',
    files: [
      {
        path: 'src/observability/logger.ts',
        purpose: 'Structured logging',
        explanation:
          'Pino with JSON in production, pretty in dev. Redacts Idempotency-Key and auth headers from logs.',
      },
      {
        path: 'src/observability/metrics.ts',
        purpose: 'Prometheus metrics',
        explanation:
          'http_requests_total, http_request_duration_seconds, ledger_* counters, db_pool_* gauges for operability dashboards.',
      },
    ],
  },
];

function buildHtml() {
  const techRows = techStack
    .map(
      ([k, v]) =>
        `<tr><td><span class="pill">${escapeHtml(k)}</span></td><td>${escapeHtml(v)}</td></tr>`,
    )
    .join('');

  const breakdownRows = projectBreakdown
    .map(
      ([area, files, role]) =>
        `<tr><td><strong>${escapeHtml(area)}</strong></td><td><code>${escapeHtml(files)}</code></td><td>${escapeHtml(role)}</td></tr>`,
    )
    .join('');

  const sectionsHtml = fileCatalog
    .map((sec) => {
      const filesHtml = sec.files
        .map((f) => {
          let code;
          try {
            code = readSrc(f.path);
          } catch {
            code = '// File not found';
          }
          const lines = code.split('\n').length;
          return `
        <article class="file-card">
          <header class="file-header">
            <span class="file-path">${escapeHtml(f.path)}</span>
            <span class="file-meta">${lines} lines · ${escapeHtml(f.purpose)}</span>
          </header>
          <div class="file-purpose">${escapeHtml(f.explanation)}</div>
          <pre class="code-block"><code>${escapeHtml(code)}</code></pre>
        </article>`;
        })
        .join('');
      return `
      <section class="doc-section" id="${escapeHtml(sec.section.toLowerCase().replace(/\s+/g, '-'))}">
        <div class="section-banner" style="--accent:${sec.color}">
          <span class="section-icon">${sec.icon}</span>
          <h2>${escapeHtml(sec.section)}</h2>
        </div>
        ${filesHtml}
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Minimal Ledger Service — Technical Documentation</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1a1a2e;
      line-height: 1.55;
      font-size: 10.5pt;
      margin: 0;
      background: #f8f9fc;
    }
    .page { max-width: 210mm; margin: 0 auto; background: #fff; }

    /* Cover */
    .cover {
      min-height: 260mm;
      background: linear-gradient(145deg, #0f172a 0%, #1e3a5f 45%, #0d9488 100%);
      color: #fff;
      padding: 48px 40px;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .cover-badge {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 9pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .cover h1 {
      font-size: 32pt;
      font-weight: 700;
      margin: 24px 0 12px;
      line-height: 1.15;
    }
    .cover .subtitle { font-size: 14pt; opacity: 0.9; max-width: 90%; }
    .cover-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 40px;
    }
    .stat-box {
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .stat-box .num { font-size: 22pt; font-weight: 700; color: #5eead4; }
    .stat-box .lbl { font-size: 8.5pt; opacity: 0.85; margin-top: 4px; }
    .cover-footer { font-size: 9pt; opacity: 0.7; }

    /* Content blocks */
    .content { padding: 32px 36px; }
    h2.page-title {
      font-size: 18pt;
      color: #0f172a;
      border-bottom: 3px solid #0d9488;
      padding-bottom: 8px;
      margin: 0 0 20px;
      page-break-after: avoid;
    }
    .summary-box {
      background: linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%);
      border-left: 4px solid #0d9488;
      padding: 20px 24px;
      border-radius: 0 12px 12px 0;
      margin-bottom: 28px;
    }
    .summary-box p { margin: 0 0 10px; }
    .summary-box ul { margin: 8px 0 0; padding-left: 20px; }
    .summary-box li { margin-bottom: 6px; }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 28px;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    table.data-table th {
      background: #0f172a;
      color: #fff;
      text-align: left;
      padding: 10px 12px;
      font-weight: 600;
    }
    table.data-table td {
      padding: 9px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    table.data-table tr:nth-child(even) td { background: #f8fafc; }
    .pill {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8.5pt;
      font-weight: 600;
    }
    code { font-family: 'SF Mono', Consolas, monospace; font-size: 8.5pt; color: #0f766e; }

    .toc {
      background: #f1f5f9;
      padding: 20px 24px;
      border-radius: 12px;
      margin-bottom: 28px;
      page-break-after: always;
    }
    .toc h3 { margin: 0 0 12px; font-size: 12pt; }
    .toc ol { margin: 0; padding-left: 22px; columns: 2; column-gap: 24px; }
    .toc li { margin-bottom: 6px; font-size: 9.5pt; }

    .doc-section { margin-bottom: 36px; page-break-before: auto; }
    .section-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--accent);
      color: #fff;
      padding: 14px 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      page-break-after: avoid;
    }
    .section-banner h2 { margin: 0; font-size: 14pt; }
    .section-icon { font-size: 20pt; }

    .file-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      margin-bottom: 20px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .file-header {
      background: #f8fafc;
      padding: 10px 14px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
    }
    .file-path { font-family: monospace; font-weight: 700; color: #0f172a; font-size: 9pt; }
    .file-meta { font-size: 8pt; color: #64748b; }
    .file-purpose {
      padding: 12px 14px;
      background: #fffbeb;
      border-bottom: 1px solid #fde68a;
      font-size: 9.5pt;
      color: #78350f;
    }
    pre.code-block {
      margin: 0;
      padding: 12px 14px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: 'SF Mono', Consolas, 'Liberation Mono', monospace;
      font-size: 6.8pt;
      line-height: 1.35;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: none;
    }
    pre.code-block code { color: inherit; background: none; font-size: inherit; }

    .architecture-diagram {
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      font-family: monospace;
      font-size: 8.5pt;
      line-height: 1.8;
      margin: 20px 0;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="cover">
    <div>
      <span class="cover-badge">Technical Documentation</span>
      <h1>Minimal Ledger Service</h1>
      <p class="subtitle">Production-grade double-entry ledger API — architecture, stack, and source reference</p>
      <div class="cover-stats">
        <div class="stat-box"><div class="num">28</div><div class="lbl">Source modules</div></div>
        <div class="stat-box"><div class="num">4</div><div class="lbl">Core API capabilities</div></div>
        <div class="stat-box"><div class="num">1</div><div class="lbl">DB-enforced invariant</div></div>
      </div>
    </div>
    <div class="cover-footer">Generated ${new Date().toISOString().slice(0, 10)} · Node.js 22 · PostgreSQL 16</div>
  </div>

  <div class="content">
    <h2 class="page-title">Executive Summary</h2>
    <div class="summary-box">
      <p><strong>Minimal Ledger Service</strong> is a take-home-grade banking core: a HTTP API for creating accounts, posting atomic double-entry transactions, reading balances and statements, and guaranteeing exactly-once writes via idempotency keys.</p>
      <p>Correctness is enforced in layers:</p>
      <ul>
        <li><strong>Database:</strong> deferrable Postgres trigger ensures debits = credits per currency at COMMIT.</li>
        <li><strong>Application:</strong> row locks (sorted account order), currency checks, optimistic balance versions.</li>
        <li><strong>Operations:</strong> journal vs materialised balance verifier, Prometheus metrics, structured logs.</li>
      </ul>
      <p>Money is represented as <code>bigint</code> minor units end-to-end; the journal (<code>entries</code>) is append-only and authoritative.</p>
    </div>

    <div class="architecture-diagram">
      Client (curl / SDK)<br/>↓ Idempotency-Key + JSON<br/>
      <strong>HTTP Layer</strong> (Fastify routes, plugins, RFC 7807 errors)<br/>↓<br/>
      <strong>Services</strong> (accounts · transactions · idempotency)<br/>↓<br/>
      <strong>Repositories</strong> (Drizzle SQL)<br/>↓<br/>
      <strong>PostgreSQL 16</strong> (journal + trigger + idempotency cache)
    </div>

    <nav class="toc">
      <h3>Table of Contents</h3>
      <ol>
        <li>Executive Summary</li>
        <li>Tech Stack</li>
        <li>Project Breakdown</li>
        ${fileCatalog.map((s) => `<li>${escapeHtml(s.section)}</li>`).join('')}
      </ol>
    </nav>

    <h2 class="page-title" style="page-break-before: always;">Tech Stack</h2>
    <table class="data-table">
      <thead><tr><th>Concern</th><th>Technology</th></tr></thead>
      <tbody>${techRows}</tbody>
    </table>

    <h2 class="page-title">Project Breakdown</h2>
    <table class="data-table">
      <thead><tr><th>Area</th><th>Key paths</th><th>Responsibility</th></tr></thead>
      <tbody>${breakdownRows}</tbody>
    </table>

    <h2 class="page-title" style="page-break-before: always;">Source Code Reference</h2>
    <p style="color:#64748b;font-size:9.5pt;margin-bottom:24px;">Full source listings for application code under <code>src/</code> and the initial migration. Infrastructure-only directories (e.g. <code>dist/</code>, <code>.github/</code>, <code>tests/</code>) are omitted by design.</p>
    ${sectionsHtml}
  </div>
</div>
</body>
</html>`;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const html = buildHtml();
  writeFileSync(htmlPath, html);
  console.log('Wrote', htmlPath);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
  });
  await browser.close();
  console.log('Wrote', pdfPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
