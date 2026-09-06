/**
 * @file Configuration resolution for the SSLCommerz gateway.
 *
 * SSLCommerz issues separate store credentials per environment, so the
 * environment flag and the credentials must always move together. The
 * canonical environment contract is:
 *
 * ```dotenv
 * SSLCOMMERZ_STORE_ID=
 * SSLCOMMERZ_STORE_PASSWORD=
 * SSLCOMMERZ_SANDBOX=true
 * ```
 */
import { DEFAULT_AMOUNT_TOLERANCE, DEFAULT_TIMEOUT_MS } from '../constants/default.constant';
import { SSLCOMMERZ_LIVE_URL, SSLCOMMERZ_SANDBOX_URL } from '../constants/endpoint.constant';
import { SslCommerzConfigurationError } from '../errors/sslcommerz.error';
import type {
  ResolveSslCommerzConfigInput,
  SslCommerzConfig,
} from '../interfaces/config.interface';
import { envBoolean, envNumber } from '../utils/env.util';
import { stripUndefined } from '../utils/form.util';

/**
 * The gateway host for an environment.
 *
 * @param sandbox - Whether the sandbox gateway is wanted.
 * @returns The gateway origin.
 */
export function gatewayUrl(sandbox: boolean): string {
  return sandbox ? SSLCOMMERZ_SANDBOX_URL : SSLCOMMERZ_LIVE_URL;
}

/**
 * Resolves a validated {@link SslCommerzConfig} from the environment.
 *
 * Precedence for every field, highest first:
 * 1. explicit `overrides`
 * 2. `SSLCOMMERZ_*` variables — `SSLCOMMERZ_STORE_ID`,
 *    `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_SANDBOX`, `SSLCOMMERZ_URL`,
 *    `SSLCOMMERZ_TIMEOUT_MS`, `SSLCOMMERZ_AMOUNT_TOLERANCE`
 * 3. defaults — sandbox on, the host implied by it, and `clientName` derived
 *    from `serviceName ?? APP_NAME`.
 *
 * `SSLCOMMERZ_URL` exists for a pinned proxy or a gateway host SSLCommerz
 * moves; leave it unset and the host follows the sandbox flag.
 *
 * @param input - Optional overrides, environment map and service identity.
 * @returns A validated configuration.
 * @throws {SslCommerzConfigurationError} Listing every problem at once.
 */
export function resolveSslCommerzConfig(
  input: ResolveSslCommerzConfigInput = {},
): SslCommerzConfig {
  const env = input.env ?? process.env;
  const serviceName = input.serviceName ?? env.APP_NAME;

  const fromVars = stripUndefined({
    storeId: env.SSLCOMMERZ_STORE_ID,
    storePassword: env.SSLCOMMERZ_STORE_PASSWORD,
    sandbox: envBoolean(env, 'SSLCOMMERZ_SANDBOX'),
    baseUrl: env.SSLCOMMERZ_URL,
    timeoutMs: envNumber(env, 'SSLCOMMERZ_TIMEOUT_MS'),
    amountTolerance: envNumber(env, 'SSLCOMMERZ_AMOUNT_TOLERANCE'),
  });

  const merged = {
    storeId: '',
    storePassword: '',
    sandbox: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    amountTolerance: DEFAULT_AMOUNT_TOLERANCE,
    clientName: serviceName,
    ...fromVars,
    ...stripUndefined(input.overrides ?? {}),
  };

  const config: SslCommerzConfig = {
    ...merged,
    // Derived last: an explicit baseUrl wins, otherwise the host follows
    // whichever environment the credentials belong to.
    baseUrl: merged.baseUrl ?? gatewayUrl(merged.sandbox),
  };

  return validateSslCommerzConfig(config);
}

/**
 * Validates a config, throwing a single error that lists every problem.
 *
 * @param config - The candidate configuration.
 * @returns The same config when valid.
 * @throws {SslCommerzConfigurationError} Aggregating all validation failures.
 */
export function validateSslCommerzConfig(config: SslCommerzConfig): SslCommerzConfig {
  const problems: string[] = [];
  if (!config.storeId) {
    problems.push('storeId is required (SSLCOMMERZ_STORE_ID)');
  }
  if (!config.storePassword) {
    problems.push('storePassword is required (SSLCOMMERZ_STORE_PASSWORD)');
  }
  if (!config.baseUrl) {
    problems.push('baseUrl is required (SSLCOMMERZ_URL)');
  } else {
    try {
      new URL(config.baseUrl);
    } catch {
      problems.push(`baseUrl is not a valid URL, got "${config.baseUrl}"`);
    }
  }
  if (
    config.timeoutMs !== undefined &&
    (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1)
  ) {
    problems.push(`timeoutMs must be a positive integer, got ${config.timeoutMs}`);
  }
  if (
    config.amountTolerance !== undefined &&
    (!Number.isFinite(config.amountTolerance) || config.amountTolerance < 0)
  ) {
    problems.push(`amountTolerance must be zero or greater, got ${config.amountTolerance}`);
  }
  if (problems.length > 0) {
    throw new SslCommerzConfigurationError(
      `Invalid SSLCommerz configuration: ${problems.join('; ')}`,
    );
  }
  return config;
}

/**
 * Password-free target description, safe for log lines. The store id is an
 * identifier, not a secret, and naming it is the only way to tell which
 * store a service is transacting against.
 *
 * @param config - Resolved configuration to use.
 * @returns The resolved string value.
 *
 * @example `https://sandbox.sslcommerz.com (sandbox, store=testbox)`
 */
export function describeSslCommerzTarget(config: SslCommerzConfig): string {
  const environment = config.sandbox ? 'sandbox' : 'live';
  return `${new URL(config.baseUrl).origin} (${environment}, store=${config.storeId})`;
}
