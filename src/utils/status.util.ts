/**
 * @file Reading the gateway's status strings.
 *
 * SSLCommerz varies the casing between endpoints (`VALID` on a validation,
 * `success` on a refund), so every comparison goes through here rather than
 * being written out ad hoc.
 */
import { RefundStatus } from '../enums/refund-status.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';

/** The only two statuses that mean money moved. */
const PAID_STATUSES: readonly string[] = [TransactionStatus.Valid, TransactionStatus.Validated];

/**
 * Reads a status field as an upper-case string.
 *
 * @param value - Raw status field.
 * @returns The status, upper-cased, or an empty string when absent.
 */
export function normaliseStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/**
 * Whether a transaction status means the payment completed.
 *
 * `VALID` and `VALIDATED` only. Everything else, including `PENDING`-like
 * values a future gateway release might add, is treated as not paid — an
 * unknown status must never open a fulfilment path.
 *
 * @param status - Status from a callback or validation reply.
 * @returns Whether the payment completed.
 */
export function isPaidStatus(status: unknown): boolean {
  return PAID_STATUSES.includes(normaliseStatus(status));
}

/**
 * Whether a status means the customer abandoned the payment.
 *
 * @param status - Status from a callback.
 * @returns Whether it was cancelled.
 */
export function isCancelledStatus(status: unknown): boolean {
  return normaliseStatus(status) === TransactionStatus.Cancelled;
}

/**
 * Whether the gateway accepted a refund request.
 *
 * `processing` counts as accepted: refunds settle asynchronously at the
 * bank, and only `failed` is a refusal.
 *
 * @param status - Status from a refund reply.
 * @returns Whether the refund was accepted.
 */
export function isRefundAccepted(status: unknown): boolean {
  return normaliseStatus(status) !== RefundStatus.Failed.toUpperCase();
}
