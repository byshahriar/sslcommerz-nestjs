/**
 * @file IPN signature verification result.
 */

/** Outcome of a `verify_sign` check. */
export interface IpnSignatureResult {
  /** True only when a signature was present and reproduced exactly. */
  valid: boolean;
  /** Why verification failed, for logs. Absent when valid. */
  reason?: string;
}
