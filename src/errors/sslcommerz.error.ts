/**
 * @file Error types thrown by `sslcommerz-nestjs`.
 */

/**
 * Thrown when configuration is missing or invalid.
 *
 * Raised during config resolution so a misconfigured service fails fast at
 * boot with an actionable message, instead of failing on its first payment.
 * The message aggregates every detected problem.
 */
export class SslCommerzConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SslCommerzConfigurationError';
  }
}

/**
 * Thrown when a gateway request fails at the transport level — a non-2xx
 * response, a network error, a timeout, or a body that isn't JSON.
 *
 * A gateway reply that parses but reports `status: 'FAILED'` is *not* an
 * error here: SSLCommerz signals business-level rejections in the body with
 * HTTP 200, so they are returned to the caller as data. Check `status` on
 * the result.
 *
 * Messages never carry the request URL — for every operation except session
 * init, the store password travels in the query string.
 */
export class SslCommerzError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SslCommerzError';
  }
}

/**
 * Thrown when a DTO handed to the service fails validation before anything
 * reaches the gateway — a bad request caught locally rather than paid for
 * with a round trip.
 */
export class SslCommerzValidationError extends Error {
  constructor(
    message: string,
    /** One entry per invalid field, in `field: problem` form. */
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'SslCommerzValidationError';
  }
}
