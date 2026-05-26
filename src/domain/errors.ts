export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'account_not_found';

  constructor(accountId: string) {
    super(`Account not found: ${accountId}`);
  }
}

export class AccountFrozenError extends DomainError {
  readonly code = 'account_frozen';

  constructor(accountId: string) {
    super(`Account is frozen: ${accountId}`);
  }
}

export class UnbalancedTransactionError extends DomainError {
  readonly code = 'unbalanced_transaction';

  constructor(currency: string) {
    super(`Transaction is unbalanced for currency ${currency}`);
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'currency_mismatch';

  constructor(accountId: string, expected: string, actual: string) {
    super(
      `Currency mismatch for account ${accountId}: account currency ${expected}, entry currency ${actual}`,
    );
  }
}

export class UnsupportedCurrencyError extends DomainError {
  readonly code = 'unsupported_currency';

  constructor(currency: string) {
    super(`Unsupported currency: ${currency}`);
  }
}

export class IdempotencyConflictError extends DomainError {
  readonly code = 'idempotency_conflict';

  constructor() {
    super('Idempotency key was used with a different request body');
  }
}

export class IdempotencyKeyRequiredError extends DomainError {
  readonly code = 'idempotency_key_required';

  constructor() {
    super('Idempotency-Key header is required for POST requests');
  }
}

export class TransactionNotFoundError extends DomainError {
  readonly code = 'transaction_not_found';

  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
  }
}

export class DoubleEntryViolationError extends DomainError {
  readonly code = 'double_entry_violation';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidAmountError extends DomainError {
  readonly code = 'invalid_amount';

  constructor(message: string) {
    super(message);
  }
}
