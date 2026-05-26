import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
  IDEMPOTENCY_CLEANUP_INTERVAL_MS: z.coerce.number().int().nonnegative().default(3_600_000),
  BALANCE_VERIFY_INTERVAL_MS: z.coerce.number().int().nonnegative().default(0),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  shutdownTimeoutMs: number;
  idempotencyTtlHours: number;
  idempotencyCleanupIntervalMs: number;
  balanceVerifyIntervalMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${message}`);
  }

  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    idempotencyTtlHours: e.IDEMPOTENCY_TTL_HOURS,
    idempotencyCleanupIntervalMs: e.IDEMPOTENCY_CLEANUP_INTERVAL_MS,
    balanceVerifyIntervalMs: e.BALANCE_VERIFY_INTERVAL_MS,
  };
}
