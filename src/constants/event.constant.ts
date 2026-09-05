/**
 * @file Event names, all under the `sslcommerz.` namespace.
 */

/** Events published for every gateway outcome. */
export const SSLCOMMERZ_EVENTS = {
  /** A session was opened; nobody has paid yet. */
  sessionCreated: 'sslcommerz.session.created',
  /** The gateway refused to open a session. */
  sessionFailed: 'sslcommerz.session.failed',
  /** A callback arrived, before any verification. */
  callbackReceived: 'sslcommerz.callback.received',
  /** A callback's signature did not verify — treat as a forgery attempt. */
  callbackRejected: 'sslcommerz.callback.rejected',
  /** Payment confirmed by a validation call. The only event safe to fulfil on. */
  paymentValidated: 'sslcommerz.payment.validated',
  /** Payment did not complete, or validation disagreed with the callback. */
  paymentFailed: 'sslcommerz.payment.failed',
  /** A validated payment that doesn't match the order — amount, currency or id. */
  paymentMismatch: 'sslcommerz.payment.mismatch',
  /** The customer abandoned the gateway page. */
  paymentCancelled: 'sslcommerz.payment.cancelled',
  /** A refund was accepted (often still processing at the bank). */
  refundInitiated: 'sslcommerz.refund.initiated',
  /** The gateway refused the refund. */
  refundFailed: 'sslcommerz.refund.failed',
} as const;

/** One of the {@link SSLCOMMERZ_EVENTS} names. */
export type SslCommerzEventName = (typeof SSLCOMMERZ_EVENTS)[keyof typeof SSLCOMMERZ_EVENTS];
