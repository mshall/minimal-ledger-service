import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, DoubleEntryViolationError } from '../domain/errors.js';

type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
};

function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return '';
  }
  let message = err.message;
  let cause: unknown = err.cause;
  while (cause instanceof Error) {
    message += ` ${cause.message}`;
    cause = cause.cause;
  }
  return message;
}

function isPostgresError(err: unknown): err is { code: string; message: string } {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const record = err as Record<string, unknown>;
  return typeof record['code'] === 'string' && typeof record['message'] === 'string';
}

function mapDomainError(error: DomainError, instance: string): ProblemDetails {
  const base = {
    type: `https://ledger.local/problems/${error.code}`,
    detail: error.message,
    instance,
    code: error.code,
  };

  switch (error.code) {
    case 'account_not_found':
    case 'transaction_not_found':
      return { ...base, title: 'Not Found', status: 404 };
    case 'account_frozen':
    case 'idempotency_conflict':
      return { ...base, title: 'Conflict', status: 409 };
    case 'idempotency_key_required':
      return { ...base, title: 'Bad Request', status: 400 };
    case 'unbalanced_transaction':
    case 'currency_mismatch':
    case 'unsupported_currency':
    case 'invalid_amount':
    case 'double_entry_violation':
      return { ...base, title: 'Unprocessable Entity', status: 422 };
    default:
      return { ...base, title: 'Bad Request', status: 400 };
  }
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const instance = request.url;

  if (error instanceof DomainError) {
    const problem = mapDomainError(error, instance);
    void reply.status(problem.status).type('application/problem+json').send(problem);
    return;
  }

  if (error instanceof ZodError) {
    const problem: ProblemDetails = {
      type: 'https://ledger.local/problems/validation_error',
      title: 'Validation Error',
      status: 400,
      detail: error.message,
      instance,
      code: 'validation_error',
    };
    void reply.status(400).type('application/problem+json').send(problem);
    return;
  }

  const pgMessage = extractErrorMessage(error);
  if (
    (isPostgresError(error) && error.message.includes('Double-entry violation')) ||
    pgMessage.includes('Double-entry violation')
  ) {
    const problem = mapDomainError(
      new DoubleEntryViolationError(pgMessage || error.message),
      instance,
    );
    void reply.status(problem.status).type('application/problem+json').send(problem);
    return;
  }

  if (error.validation) {
    const problem: ProblemDetails = {
      type: 'https://ledger.local/problems/validation_error',
      title: 'Validation Error',
      status: 400,
      detail: error.message,
      instance,
      code: 'validation_error',
    };
    void reply.status(400).type('application/problem+json').send(problem);
    return;
  }

  request.log.error({ err: error }, 'Unhandled error');
  const problem: ProblemDetails = {
    type: 'https://ledger.local/problems/internal_error',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred',
    instance,
    code: 'internal_error',
  };
  void reply.status(500).type('application/problem+json').send(problem);
}
