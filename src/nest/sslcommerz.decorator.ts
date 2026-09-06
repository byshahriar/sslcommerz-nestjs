/**
 * @file Injection decorators.
 *
 * The tokens themselves live in `constants/token.constant.ts`; these are the
 * NestJS-flavoured way to use them.
 */
import { Inject } from '@nestjs/common';

import {
  getSslCommerzClientToken,
  getSslCommerzEmitterToken,
  getSslCommerzOptionsToken,
  getSslCommerzServiceToken,
} from '../constants/token.constant';

/**
 * Injects a named {@link SslCommerzService}. The default one needs no
 * decorator — inject the class.
 *
 * @param name - Named registration to inject; omit for the default.
 * @returns A parameter decorator for dependency injection.
 *
 * @example
 * ```ts
 * constructor(@InjectSslCommerz('marketplace') private readonly ssl: SslCommerzService) {}
 * ```
 */
export const InjectSslCommerz = (name?: string): ParameterDecorator =>
  Inject(getSslCommerzServiceToken(name));

/**
 * Injects the low-level gateway client, for calls the service doesn't wrap.
 *
 * @param name - Named registration to inject; omit for the default.
 * @returns A parameter decorator for dependency injection.
 */
export const InjectSslCommerzClient = (name?: string): ParameterDecorator =>
  Inject(getSslCommerzClientToken(name));

/**
 * Injects the event emitter a registration publishes to.
 *
 * @param name - Named registration; omit for the default.
 * @returns A parameter decorator for dependency injection.
 */
export const InjectSslCommerzEmitter = (name?: string): ParameterDecorator =>
  Inject(getSslCommerzEmitterToken(name));

/**
 * Injects a registration's resolved module options.
 *
 * @param name - Named registration; omit for the default.
 * @returns A parameter decorator for dependency injection.
 */
export const InjectSslCommerzOptions = (name?: string): ParameterDecorator =>
  Inject(getSslCommerzOptionsToken(name));
