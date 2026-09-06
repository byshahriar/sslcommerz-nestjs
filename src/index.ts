/**
 * @file Public API of `sslcommerz-nestjs`.
 *
 * @packageDocumentation
 *
 * The SSLCommerz payment gateway as a NestJS module. Three layers, each
 * usable on its own:
 *
 * - **`core/` + `utils/`** — the gateway client, config resolution,
 *   signature and order verification, health probes. No framework imports,
 *   so scripts and workers can use them directly.
 * - **`dto/`** — validated request shapes, and the flattener that turns them
 *   into the gateway's own field names.
 * - **`nest/`** — the dynamic module, service, callback controller, guard,
 *   exception filter, health indicator and events.
 *
 * Declarations are segregated by kind — `constants/`, `enums/`,
 * `interfaces/`, `types/`, `errors/` — so a consumer can import a type
 * without pulling in an implementation.
 *
 * @example Registering the module and taking a payment
 * ```ts
 * // app.module.ts
 * @Module({ imports: [SslCommerzModule.forRoot()] })
 * export class AppModule {}
 *
 * // checkout.service.ts
 * const { redirectUrl } = await this.ssl.createSession({ ... });
 * ```
 */
export * from './constants';
export * from './enums';
export * from './interfaces';
export * from './types';
export * from './errors';
export * from './utils';

export * from './core/config';
export * from './core/client';
export * from './core/health';

export * from './dto';

export * from './nest/sslcommerz.decorator';
export * from './nest/sslcommerz.service';
export * from './nest/sslcommerz.controller';
export * from './nest/sslcommerz.guard';
export * from './nest/sslcommerz.filter';
export * from './nest/sslcommerz.health';
export * from './nest/sslcommerz.lifecycle';
export * from './nest/sslcommerz.module';
