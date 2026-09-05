/**
 * @file Statuses the gateway reports for a transaction.
 */

/**
 * Transaction status as SSLCommerz reports it, on a callback and in a
 * validation reply.
 *
 * Only {@link TransactionStatus.Valid} and {@link TransactionStatus.Validated}
 * mean money moved. Everything else — including a status a future gateway
 * release might add — is treated as not paid, which is the safe direction to
 * be wrong in.
 */
export enum TransactionStatus {
  /** Payment succeeded. */
  Valid = 'VALID',
  /** Payment succeeded and was already validated once — equally final. */
  Validated = 'VALIDATED',
  /** The customer tried and the payment did not go through. */
  Failed = 'FAILED',
  /** The customer abandoned the gateway page. */
  Cancelled = 'CANCELLED',
  /** A session was opened but the customer never attempted payment. */
  Unattempted = 'UNATTEMPTED',
  /** The session expired before the customer paid. */
  Expired = 'EXPIRED',
  /** The `val_id` names no transaction the store owns. */
  InvalidTransaction = 'INVALID_TRANSACTION',
}
