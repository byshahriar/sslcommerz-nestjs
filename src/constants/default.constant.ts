/**
 * @file Defaults, in one place so a change is visible rather than buried in
 * a dozen `?? 15_000`s.
 */

/** Registration name used when the module is registered without one. */
export const DEFAULT_SSLCOMMERZ_CLIENT = 'default';

/** Upper bound on one gateway request. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** How long bootstrap waits for the gateway host to answer. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;

/** How long a graceful shutdown may take. */
export const DEFAULT_SHUTDOWN_GRACE_MS = 3_000;

/** Upper bound on a health probe. */
export const DEFAULT_HEALTH_TIMEOUT_MS = 2_000;

/** Default ISO currency. */
export const DEFAULT_CURRENCY = 'BDT';

/**
 * How far a validated amount may differ from the order before it counts as a
 * mismatch, in currency units.
 *
 * The gateway rounds: a transaction settled at 999.50 against an order of
 * 1000 is the same payment, not a fraud signal. One unit is the allowance
 * that covers that rounding without letting a real discrepancy through —
 * a customer cannot meaningfully underpay by less than one taka.
 *
 * Set `amountTolerance: 0` to demand an exact match instead.
 */
export const DEFAULT_AMOUNT_TOLERANCE = 1;

/** Route defaults for the built-in callback controller. */
export const DEFAULT_ROUTES = {
  path: 'payments/sslcommerz',
  ipn: 'ipn',
  success: 'success',
  fail: 'fail',
  cancel: 'cancel',
} as const;
