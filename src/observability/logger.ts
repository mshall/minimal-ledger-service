import pino from 'pino';
import type { AppConfig } from '../config.js';

let rootLogger: pino.Logger | undefined;

export function createLogger(config: AppConfig): pino.Logger {
  const isDev = config.nodeEnv === 'development';
  const options: pino.LoggerOptions = {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["idempotency-key"]',
        'req.headers.idempotency-key',
        'headers.authorization',
        'headers["idempotency-key"]',
        'headers.idempotency-key',
      ],
      censor: '[REDACTED]',
    },
  };
  if (isDev) {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    };
  }
  rootLogger = pino(options);
  return rootLogger;
}

export function getLogger(): pino.Logger {
  rootLogger ??= pino({ level: 'info' });
  return rootLogger;
}
