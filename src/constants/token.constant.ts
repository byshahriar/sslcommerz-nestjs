/**
 * @file Dependency-injection tokens.
 *
 * Every registration gets its own set, derived from its name, so a second
 * store never collides with the first.
 */
import { DEFAULT_SSLCOMMERZ_CLIENT } from './default.constant';

/** Token for the resolved module options of a registration. */
export const SSLCOMMERZ_MODULE_OPTIONS = 'SSLCOMMERZ_MODULE_OPTIONS';

/** Token for the event emitter a registration publishes to. */
export const SSLCOMMERZ_EVENT_EMITTER = 'SSLCOMMERZ_EVENT_EMITTER';

/**
 * Builds the injection token for a (possibly named) client.
 *
 * @param name - Registration name. @default DEFAULT_SSLCOMMERZ_CLIENT
 * @returns The resolved string value.
 */
export function getSslCommerzClientToken(name: string = DEFAULT_SSLCOMMERZ_CLIENT): string {
  return `SSLCOMMERZ_CLIENT:${name}`;
}

/**
 * Builds the injection token for a (possibly named) service.
 *
 * The default registration also provides the service under its own class
 * token, so `constructor(private readonly ssl: SslCommerzService)` works
 * without a decorator.
 *
 * @param name - Registration name. @default DEFAULT_SSLCOMMERZ_CLIENT
 * @returns The resolved string value.
 */
export function getSslCommerzServiceToken(name: string = DEFAULT_SSLCOMMERZ_CLIENT): string {
  return `SSLCOMMERZ_SERVICE:${name}`;
}

/**
 * Builds the injection token for a registration's options.
 *
 * @param name - Registration name. @default DEFAULT_SSLCOMMERZ_CLIENT
 * @returns The resolved string value.
 */
export function getSslCommerzOptionsToken(name: string = DEFAULT_SSLCOMMERZ_CLIENT): string {
  return `${SSLCOMMERZ_MODULE_OPTIONS}:${name}`;
}

/**
 * Builds the injection token for a registration's event emitter.
 *
 * @param name - Registration name. @default DEFAULT_SSLCOMMERZ_CLIENT
 * @returns The resolved string value.
 */
export function getSslCommerzEmitterToken(name: string = DEFAULT_SSLCOMMERZ_CLIENT): string {
  return `${SSLCOMMERZ_EVENT_EMITTER}:${name}`;
}

/**
 * Builds the injection token for a registration's lifecycle hook holder.
 *
 * @param name - Registration name. @default DEFAULT_SSLCOMMERZ_CLIENT
 * @returns The resolved string value.
 */
export function getSslCommerzLifecycleToken(name: string = DEFAULT_SSLCOMMERZ_CLIENT): string {
  return `${getSslCommerzClientToken(name)}:LIFECYCLE`;
}
