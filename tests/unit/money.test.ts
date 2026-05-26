import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  assertSupportedCurrency,
  formatAmount,
  isSupportedCurrency,
  parseAmount,
  subtractAmounts,
} from '../../src/domain/money.js';
import { InvalidAmountError, UnsupportedCurrencyError } from '../../src/domain/errors.js';

describe('money', () => {
  it('parses positive integer strings', () => {
    expect(parseAmount('10000')).toBe(10000n);
  });

  it('rejects non-integer and non-positive amounts', () => {
    expect(() => parseAmount('10.5')).toThrow(InvalidAmountError);
    expect(() => parseAmount('0')).toThrow(InvalidAmountError);
    expect(() => parseAmount('-5')).toThrow(InvalidAmountError);
  });

  it('formats bigint amounts', () => {
    expect(formatAmount(42n)).toBe('42');
  });

  it('validates supported currencies', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('XXX')).toBe(false);
    expect(assertSupportedCurrency('EUR')).toBe('EUR');
    expect(() => assertSupportedCurrency('ZZZ')).toThrow(UnsupportedCurrencyError);
  });

  it('adds and subtracts large bigint values safely', () => {
    expect(addAmounts(5n, 3n)).toBe(8n);
    expect(subtractAmounts(10n, 4n)).toBe(6n);
    const large = 10n ** 24n;
    expect(addAmounts(large, large)).toBe(2n * large);
    expect(subtractAmounts(large, 1n)).toBe(large - 1n);
  });
});
