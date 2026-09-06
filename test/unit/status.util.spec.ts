import { describe, expect, it } from 'vitest';

import {
  RefundStatus,
  TransactionStatus,
  isCancelledStatus,
  isPaidStatus,
  isRefundAccepted,
  normaliseStatus,
} from '../../src';

describe('isPaidStatus', () => {
  it('accepts exactly VALID and VALIDATED', () => {
    expect(isPaidStatus(TransactionStatus.Valid)).toBe(true);
    expect(isPaidStatus(TransactionStatus.Validated)).toBe(true);
  });

  it('rejects every other status the gateway reports', () => {
    for (const status of [
      TransactionStatus.Failed,
      TransactionStatus.Cancelled,
      TransactionStatus.Unattempted,
      TransactionStatus.Expired,
      TransactionStatus.InvalidTransaction,
    ]) {
      expect(isPaidStatus(status)).toBe(false);
    }
  });

  it('rejects an absent or non-string status rather than guessing', () => {
    expect(isPaidStatus(undefined)).toBe(false);
    expect(isPaidStatus(null)).toBe(false);
    expect(isPaidStatus(1)).toBe(false);
  });

  it('tolerates the casing and padding the gateway varies', () => {
    expect(isPaidStatus(' valid ')).toBe(true);
  });
});

describe('isCancelledStatus', () => {
  it('recognises a cancellation', () => {
    expect(isCancelledStatus('CANCELLED')).toBe(true);
    expect(isCancelledStatus('cancelled')).toBe(true);
    expect(isCancelledStatus('FAILED')).toBe(false);
  });
});

describe('isRefundAccepted', () => {
  it('treats processing as accepted — refunds settle asynchronously', () => {
    expect(isRefundAccepted(RefundStatus.Success)).toBe(true);
    expect(isRefundAccepted(RefundStatus.Processing)).toBe(true);
  });

  it('treats only failed as a refusal', () => {
    expect(isRefundAccepted(RefundStatus.Failed)).toBe(false);
  });
});

describe('normaliseStatus', () => {
  it('upper-cases and trims, and yields an empty string for nothing', () => {
    expect(normaliseStatus(' valid ')).toBe('VALID');
    expect(normaliseStatus(undefined)).toBe('');
  });
});
