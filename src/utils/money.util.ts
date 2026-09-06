/**
 * @file Amount comparison, and the order check the gateway can't do for you.
 */
import { DEFAULT_AMOUNT_TOLERANCE, DEFAULT_CURRENCY } from '../constants/default.constant';
import type { ValidationResponse } from '../interfaces/gateway.interface';
import type { ExpectedPayment, OrderVerification } from '../interfaces/payment.interface';
import { isPaidStatus, normaliseStatus } from './status.util';

/**
 * Whether two amounts agree within a tolerance.
 *
 * The gateway rounds, so an exact comparison rejects genuine payments: a
 * transaction settled at 999.50 against a 1000 order is the same payment.
 * The comparison is therefore `abs(expected - paid) < tolerance`, with a
 * tolerance of `0` treated as demanding exact equality rather than as an
 * impossible `< 0`.
 *
 * @param expected - The order's amount.
 * @param actual - The gateway's amount; strings are accepted, as the API returns them.
 * @param tolerance - Allowed absolute difference. @default DEFAULT_AMOUNT_TOLERANCE
 * @returns Whether the two agree.
 */
export function amountsMatch(
  expected: number,
  actual: unknown,
  tolerance: number = DEFAULT_AMOUNT_TOLERANCE,
): boolean {
  const paid = Number(actual);
  if (!Number.isFinite(paid) || !Number.isFinite(expected)) {
    return false;
  }
  const difference = Math.abs(expected - paid);
  return tolerance === 0 ? difference === 0 : difference < tolerance;
}

/**
 * Picks the amount and currency the customer was actually charged.
 *
 * For a transaction in the store's own currency, that's `amount`/`currency`.
 * For a foreign-currency transaction those two hold the *settled* figure in
 * the store's currency, while `currency_amount`/`currency_type` hold what the
 * customer was actually charged. Comparing a USD order against `amount`
 * therefore compares dollars to taka, and rejects every genuine payment.
 *
 * @param validation - The validation reply.
 * @param expectedCurrency - Currency the order was placed in. @default DEFAULT_CURRENCY
 * @returns The charged amount and currency, as far as the reply reveals them.
 */
export function resolveChargedAmount(
  validation: ValidationResponse,
  expectedCurrency: string = DEFAULT_CURRENCY,
): { amount?: string; currency?: string } {
  const isStoreCurrency =
    normaliseStatus(expectedCurrency) === normaliseStatus(validation.currency ?? DEFAULT_CURRENCY);

  return isStoreCurrency
    ? { amount: validation.amount, currency: validation.currency }
    : {
        amount: validation.currency_amount ?? validation.amount,
        currency: validation.currency_type ?? validation.currency,
      };
}

/**
 * The check the gateway cannot do for you: that this validated transaction
 * is *your* order, for *your* amount.
 *
 * A validation call confirms that *a* transaction succeeded. It does not
 * confirm that the transaction was yours: a `val_id` belonging to any other
 * order of the same store validates just as cleanly. So four things must
 * agree — status is VALID or VALIDATED, the transaction id is the one being
 * fulfilled, and the amount and currency match within tolerance (against
 * `currency_amount`/`currency_type` for a foreign-currency order).
 *
 * @param validation - The gateway's validation reply.
 * @param expected - What the order says this payment should be.
 * @param tolerance - Allowed absolute amount difference. @default DEFAULT_AMOUNT_TOLERANCE
 * @returns Whether it matches, and what disagreed when it doesn't.
 */
export function verifyOrder(
  validation: ValidationResponse,
  expected: ExpectedPayment = {},
  tolerance: number = DEFAULT_AMOUNT_TOLERANCE,
): OrderVerification {
  if (!isPaidStatus(validation.status)) {
    return {
      valid: false,
      reason: `validation returned ${validation.status ?? 'no status'}`,
    };
  }

  if (expected.transactionId !== undefined) {
    const reported = String(validation.tran_id ?? '').trim();
    if (reported !== expected.transactionId.trim()) {
      const seen = reported || 'nothing';
      return {
        valid: false,
        reason: `transaction id mismatch: expected ${expected.transactionId}, gateway reported ${seen}`,
      };
    }
  }

  const charged = resolveChargedAmount(validation, expected.currency);

  if (expected.currency !== undefined) {
    const reported = String(charged.currency ?? '').trim();
    if (reported.toUpperCase() !== expected.currency.trim().toUpperCase()) {
      const seen = reported || 'nothing';
      return {
        valid: false,
        reason: `currency mismatch: expected ${expected.currency}, gateway reported ${seen}`,
      };
    }
  }

  if (expected.amount !== undefined && !amountsMatch(expected.amount, charged.amount, tolerance)) {
    const seen = charged.amount ?? 'nothing';
    return {
      valid: false,
      reason: `amount mismatch: expected ${expected.amount}, gateway reported ${seen}`,
    };
  }

  return { valid: true };
}
