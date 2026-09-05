/**
 * @file Refund outcomes.
 */

/**
 * Status of a refund, as the gateway reports it.
 *
 * A refund is asynchronous at the bank: {@link RefundStatus.Processing} is a
 * normal, non-terminal answer, and the only way to learn the end state is to
 * poll `refundQuery` with the `refund_ref_id`.
 */
export enum RefundStatus {
  Success = 'success',
  Failed = 'failed',
  Processing = 'processing',
  /** Reported by a refund status query once the money has gone back. */
  Refunded = 'refunded',
  /** The bank declined the refund. */
  Cancelled = 'cancelled',
}
