/**
 * @file Gateway hosts and API paths.
 *
 * Entries are named by purpose rather than by file, because the paths do not
 * map one to one: `merchantTransIDvalidationAPI.php` serves transaction
 * lookups *and* both refund operations. Reading `refundStatus` at a call site
 * says more than reading the filename would.
 */

/** Sandbox gateway host — test store credentials only. */
export const SSLCOMMERZ_SANDBOX_URL = 'https://sandbox.sslcommerz.com';

/** Live gateway host — real money. */
export const SSLCOMMERZ_LIVE_URL = 'https://securepay.sslcommerz.com';

/** API paths, resolved against the environment's host. */
export const SSLCOMMERZ_ENDPOINTS = {
  /** Opens a payment session (POST, form-encoded). */
  makePayment: '/gwprocess/v4/api.php',
  /** Confirms a transaction by `val_id` — the authoritative check. */
  orderValidate: '/validator/api/validationserverAPI.php',
  /** Transaction lookup by `tran_id` or `sessionkey`. */
  transactionStatus: '/validator/api/merchantTransIDvalidationAPI.php',
  /** Starts a refund, keyed by `bank_tran_id`. */
  refundPayment: '/validator/api/merchantTransIDvalidationAPI.php',
  /** Refund progress, keyed by `refund_ref_id`. */
  refundStatus: '/validator/api/merchantTransIDvalidationAPI.php',
} as const;
