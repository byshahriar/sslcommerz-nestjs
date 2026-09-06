/**
 * @file Small type aliases shared across the package.
 */
import type { SSLCOMMERZ_ENDPOINTS } from '../constants/endpoint.constant';

/** Transport signature, narrow enough for `globalThis.fetch` and test doubles. */
export type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

/** Name of one entry in {@link SSLCOMMERZ_ENDPOINTS}. */
export type SslCommerzEndpoint = keyof typeof SSLCOMMERZ_ENDPOINTS;

/** Free-form gateway parameter map; `undefined` and `null` are dropped before sending. */
export type GatewayParams = Record<string, unknown>;

/** A value that can be sent as a form field. */
export type FormValue = string | number | boolean;

/** Request overrides with headers narrowed to a record, so they merge predictably. */
export type SslCommerzRequestInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};
