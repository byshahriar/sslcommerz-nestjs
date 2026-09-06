/**
 * @file Reading environment variables, strictly.
 *
 * A misconfigured store should fail at boot with a clear message, not on the
 * first payment — so a non-numeric timeout is an error here rather than a
 * silent `NaN` that surfaces hours later.
 */
import { SslCommerzConfigurationError } from '../errors/sslcommerz.error';

/**
 * Reads an optional numeric variable, failing fast on non-numeric input.
 *
 * @param env - Environment variables to read from.
 * @param name - Variable to resolve.
 * @returns The number, or undefined when unset.
 * @throws {SslCommerzConfigurationError} When the value is not a number.
 */
export function envNumber(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new SslCommerzConfigurationError(`${name} must be a number, got "${raw}"`);
  }
  return value;
}

/**
 * Reads an optional boolean variable. Anything but the exact string `false`
 * is true, so `SSLCOMMERZ_SANDBOX=0` does not silently arm the live gateway.
 *
 * @param env - Environment variables to read from.
 * @param name - Variable to resolve.
 * @returns The boolean, or undefined when unset.
 */
export function envBoolean(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  return raw.trim().toLowerCase() !== 'false';
}
