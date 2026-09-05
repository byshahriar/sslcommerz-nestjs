/**
 * @file The verdict this package reaches about a callback.
 */

/**
 * How a callback resolved after signature verification, gateway validation
 * and comparison against the order.
 *
 * These are *our* states, not the gateway's: they fold the signature check,
 * the validation call and the amount comparison into one value an
 * application can branch on.
 */
export enum PaymentState {
  /** Signature verified, gateway confirmed, and the numbers agree. Fulfil on this alone. */
  Paid = 'paid',
  /** A real, validated payment — for the wrong amount, currency or order. Never fulfil. */
  Mismatch = 'mismatch',
  /** The gateway says the payment did not complete. */
  Failed = 'failed',
  /** The customer abandoned the gateway page. */
  Cancelled = 'cancelled',
  /** The signature did not verify: the payload may be forged. */
  Unverified = 'unverified',
}
