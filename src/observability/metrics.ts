import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type pg from 'pg';

const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const ledgerTransactionsPostedTotal = new Counter({
  name: 'ledger_transactions_posted_total',
  help: 'Total ledger transactions posted',
  registers: [register],
});

export const ledgerEntriesPostedTotal = new Counter({
  name: 'ledger_entries_posted_total',
  help: 'Total ledger entries posted',
  registers: [register],
});

export const ledgerBalanceDriftTotal = new Counter({
  name: 'ledger_balance_drift_total',
  help: 'Accounts where materialised balance diverges from journal',
  registers: [register],
});

const poolSizeGauge = new Gauge({
  name: 'db_pool_size',
  help: 'Database pool total connections',
  registers: [register],
});

const poolIdleGauge = new Gauge({
  name: 'db_pool_idle',
  help: 'Database pool idle connections',
  registers: [register],
});

const poolWaitingGauge = new Gauge({
  name: 'db_pool_waiting',
  help: 'Database pool waiting requests',
  registers: [register],
});

export function updatePoolMetrics(pool: pg.Pool): void {
  poolSizeGauge.set(pool.totalCount);
  poolIdleGauge.set(pool.idleCount);
  poolWaitingGauge.set(pool.waitingCount);
}

export function getMetricsRegistry(): Registry {
  return register;
}

export async function getMetricsText(): Promise<string> {
  return register.metrics();
}
