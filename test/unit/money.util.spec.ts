import { describe, expect, it } from 'vitest';

import { TransactionStatus, amountsMatch, resolveChargedAmount, verifyOrder } from '../../src';

describe('amountsMatch', () => {
  it('accepts a difference under one unit, absorbing the gateway’s rounding', () => {
    expect(amountsMatch(1000, '999.50')).toBe(true);
    expect(amountsMatch(1000, '1000.00')).toBe(true);
  });

  it('rejects a difference of a whole unit or more', () => {
    expect(amountsMatch(1000, '999.00')).toBe(false);
    expect(amountsMatch(1000, '1001.00')).toBe(false);
  });

  it('treats a zero tolerance as demanding exactness, not as an impossible test', () => {
    expect(amountsMatch(1000, '1000.00', 0)).toBe(true);
    expect(amountsMatch(1000, '999.99', 0)).toBe(false);
  });

  it('honours a wider tolerance', () => {
    expect(amountsMatch(1000, '995.00', 10)).toBe(true);
  });

  it('rejects an unparseable amount instead of coercing it to zero', () => {
    expect(amountsMatch(1000, 'not-a-number')).toBe(false);
    expect(amountsMatch(1000, undefined)).toBe(false);
    expect(amountsMatch(1000, '')).toBe(false);
  });
});

describe('resolveChargedAmount', () => {
  it('reads amount/currency for a transaction in the store currency', () => {
    expect(
      resolveChargedAmount({ status: 'VALID', amount: '1000.00', currency: 'BDT' }, 'BDT'),
    ).toEqual({ amount: '1000.00', currency: 'BDT' });
  });

  it('reads currency_amount/currency_type for a foreign-currency transaction', () => {
    // The gateway settles in BDT but the customer was charged in USD.
    expect(
      resolveChargedAmount(
        {
          status: 'VALID',
          amount: '11000.00',
          currency: 'BDT',
          currency_type: 'USD',
          currency_amount: '100.00',
        },
        'USD',
      ),
    ).toEqual({ amount: '100.00', currency: 'USD' });
  });

  it('falls back to the store figures when no foreign amount is reported', () => {
    expect(
      resolveChargedAmount({ status: 'VALID', amount: '1000.00', currency: 'BDT' }, 'USD'),
    ).toEqual({ amount: '1000.00', currency: 'BDT' });
  });
});

describe('verifyOrder', () => {
  const validated = {
    status: TransactionStatus.Valid,
    tran_id: 'order-1',
    amount: '1000.00',
    currency: 'BDT',
  };

  it('accepts a transaction that matches the order', () => {
    expect(
      verifyOrder(validated, { transactionId: 'order-1', amount: 1000, currency: 'BDT' }),
    ).toEqual({ valid: true });
  });

  it('accepts VALIDATED as well as VALID', () => {
    expect(verifyOrder({ ...validated, status: TransactionStatus.Validated }).valid).toBe(true);
  });

  it('rejects every other status', () => {
    for (const status of [
      TransactionStatus.Failed,
      TransactionStatus.Cancelled,
      TransactionStatus.Unattempted,
      TransactionStatus.Expired,
      TransactionStatus.InvalidTransaction,
    ]) {
      expect(verifyOrder({ ...validated, status }).valid).toBe(false);
    }
  });

  it('rejects a val_id that belongs to a different order', () => {
    const result = verifyOrder(validated, { transactionId: 'order-2' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/transaction id mismatch/);
  });

  it('ignores surrounding whitespace on the transaction id, as the SDK does', () => {
    expect(
      verifyOrder({ ...validated, tran_id: ' order-1 ' }, { transactionId: 'order-1' }).valid,
    ).toBe(true);
  });

  it('rejects a payment for the wrong amount', () => {
    const result = verifyOrder(validated, { transactionId: 'order-1', amount: 5000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/amount mismatch/);
  });

  it('rejects a payment in the wrong currency', () => {
    const result = verifyOrder(validated, { transactionId: 'order-1', currency: 'USD' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/currency mismatch/);
  });

  it('compares a foreign-currency order against what the customer was charged', () => {
    const foreign = {
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '11000.00',
      currency: 'BDT',
      currency_type: 'USD',
      currency_amount: '100.00',
    };
    expect(
      verifyOrder(foreign, { transactionId: 'order-1', amount: 100, currency: 'USD' }),
    ).toEqual({ valid: true });
    // The BDT settlement figure must not be what a USD order is checked against.
    expect(
      verifyOrder(foreign, { transactionId: 'order-1', amount: 11_000, currency: 'USD' }).valid,
    ).toBe(false);
  });

  it('checks only what the caller supplied', () => {
    expect(verifyOrder(validated).valid).toBe(true);
    expect(verifyOrder(validated, { amount: 1000 }).valid).toBe(true);
  });

  it('honours a custom tolerance', () => {
    expect(verifyOrder(validated, { amount: 1005 }, 10).valid).toBe(true);
    expect(verifyOrder(validated, { amount: 1005 }, 0).valid).toBe(false);
  });
});
