/**
 * @file Building gateway requests.
 *
 * SSLCommerz takes form-encoded bodies for session init and query strings
 * for everything else, so both paths share one rule: `undefined` and `null`
 * are dropped rather than sent as the literal strings "undefined" and
 * "null", which the gateway would happily store.
 */
import type { GatewayParams } from '../types/gateway.type';

/**
 * Encodes fields as an `application/x-www-form-urlencoded` body.
 *
 * @param fields - Field map to encode.
 * @returns The encoded body.
 */
export function encodeForm(fields: GatewayParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

/**
 * Adds parameters to a URL's query string, in place.
 *
 * @param url - URL to extend.
 * @param params - Parameters to add.
 * @returns The same URL, for chaining.
 */
export function appendParams(url: URL, params: GatewayParams): URL {
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/**
 * Removes `undefined` entries so spreads never clobber lower-precedence values.
 *
 * @param obj - Object to copy.
 * @returns A copy with undefined values removed.
 */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
