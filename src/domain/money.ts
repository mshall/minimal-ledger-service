import { InvalidAmountError, UnsupportedCurrencyError } from './errors.js';

export const CURRENCIES = {
  USD: { code: 'USD', minorUnits: 2 },
  EUR: { code: 'EUR', minorUnits: 2 },
  GBP: { code: 'GBP', minorUnits: 2 },
  AED: { code: 'AED', minorUnits: 2 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return code in CURRENCIES;
}

export function assertSupportedCurrency(code: string): CurrencyCode {
  if (!isSupportedCurrency(code)) {
    throw new UnsupportedCurrencyError(code);
  }
  return code;
}

/** Parse wire-format minor-unit amount (integer string) to bigint. */
export function parseAmount(value: string): bigint {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidAmountError(`Amount must be an integer string: ${value}`);
  }
  try {
    const amount = BigInt(value);
    if (amount <= 0n) {
      throw new InvalidAmountError('Amount must be positive');
    }
    return amount;
  } catch {
    throw new InvalidAmountError(`Amount out of range: ${value}`);
  }
}

export function formatAmount(amount: bigint): string {
  return amount.toString();
}

export function addAmounts(a: bigint, b: bigint): bigint {
  const result = a + b;
  if (result < a && b > 0n) {
    throw new InvalidAmountError('Amount overflow on addition');
  }
  if (result > a && b < 0n) {
    throw new InvalidAmountError('Amount underflow on addition');
  }
  return result;
}

export function subtractAmounts(a: bigint, b: bigint): bigint {
  const result = a - b;
  if (result > a && b > 0n) {
    throw new InvalidAmountError('Amount underflow on subtraction');
  }
  if (result < a && b < 0n) {
    throw new InvalidAmountError('Amount overflow on subtraction');
  }
  return result;
}
