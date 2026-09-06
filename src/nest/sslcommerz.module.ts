/**
 * @file The NestJS dynamic module.
 *
 * One registration wires one store: a client, a service, an event emitter,
 * a lifecycle, a health indicator and — optionally — the callback routes.
 * Register it again with a different `name` for a second store.
 */
import { EventEmitter } from 'node:events';
import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';

import { DEFAULT_SSLCOMMERZ_CLIENT } from '../constants/default.constant';
import {
  getSslCommerzClientToken,
  getSslCommerzEmitterToken,
  getSslCommerzLifecycleToken,
  getSslCommerzOptionsToken,
  getSslCommerzServiceToken,
} from '../constants/token.constant';
import { createSslCommerzClient } from '../core/client';
import { describeSslCommerzTarget, resolveSslCommerzConfig } from '../core/config';
import type { SslCommerzClient } from '../interfaces/client.interface';
import type { SslCommerzEventEmitter } from '../interfaces/event.interface';
import type {
  SslCommerzModuleAsyncOptions,
  SslCommerzModuleOptions,
} from '../interfaces/module.interface';
import { createSslCommerzController } from './sslcommerz.controller';
import { SslCommerzHealthIndicator } from './sslcommerz.health';
import { SslCommerzIpnGuard } from './sslcommerz.guard';
import { SslCommerzClientLifecycle } from './sslcommerz.lifecycle';
import { SslCommerzService } from './sslcommerz.service';

/**
 * Builds one client: resolves config (environment + overrides + service
 * identity) and logs the credential-free target through the Nest logger.
 *
 * @param name - Registered client name.
 * @param options - Resolved module options.
 * @returns The gateway client.
 */
function createClient(name: string, options: SslCommerzModuleOptions): SslCommerzClient {
  const logger = new Logger(`SslCommerz:${name}`);
  const config = resolveSslCommerzConfig({
    overrides: options.config,
    serviceName: options.serviceName,
  });
  // Gateway logs show e.g. "core:default", "core:marketplace".
  const clientName = config.clientName ? `${config.clientName}:${name}` : name;
  logger.log(`Using ${describeSslCommerzTarget(config)}`);
  if (!config.sandbox) {
    logger.warn('Live gateway — payments are real');
  }

  return createSslCommerzClient({ ...config, clientName }, options.options);
}

/**
 * SSLCommerz for NestJS.
 *
 * @example
 * ```ts
 * // app.module.ts
 * imports: [
 *   SslCommerzModule.forRoot({
 *     controller: {
 *       path: 'payments/sslcommerz',
 *       redirect: {
 *         success: 'https://shop.example.com/checkout/done',
 *         fail: 'https://shop.example.com/checkout/failed',
 *         cancel: 'https://shop.example.com/cart',
 *       },
 *     },
 *   }),
 * ]
 * ```
 */
@Module({})
export class SslCommerzModule {
  /**
   * Registers a store with static (or environment-driven) options.
   *
   * @param options - Module options.
   * @returns The NestJS dynamic module definition.
   */
  static forRoot(options: SslCommerzModuleOptions = {}): DynamicModule {
    const name = options.name ?? DEFAULT_SSLCOMMERZ_CLIENT;
    return this.buildModule(name, options, {
      provide: getSslCommerzOptionsToken(name),
      useValue: options,
    });
  }

  /**
   * Registers a store with options produced by an injected factory — the
   * form to use with `ConfigService`.
   *
   * `name`, `controller` and `global` are read at module-definition time, so
   * they are given on the async options rather than returned by the factory.
   *
   * @param options - Async module options.
   * @returns The NestJS dynamic module definition.
   *
   * @example
   * ```ts
   * SslCommerzModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     config: {
   *       storeId: config.getOrThrow('SSLCOMMERZ_STORE_ID'),
   *       storePassword: config.getOrThrow('SSLCOMMERZ_STORE_PASSWORD'),
   *       sandbox: config.get('NODE_ENV') !== 'production',
   *     },
   *   }),
   * })
   * ```
   */
  static forRootAsync(options: SslCommerzModuleAsyncOptions): DynamicModule {
    const name = options.name ?? DEFAULT_SSLCOMMERZ_CLIENT;
    return this.buildModule(
      name,
      { name, controller: options.controller, global: options.global },
      {
        provide: getSslCommerzOptionsToken(name),
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      options.imports,
    );
  }

  /**
   * Assembles the providers, controllers and exports for one registration.
   *
   * @param name - Registered client name.
   * @param staticOptions - Options known before the factory runs.
   * @param optionsProvider - Provider yielding the full module options.
   * @param imports - Modules the options factory needs.
   * @returns The NestJS dynamic module definition.
   */
  private static buildModule(
    name: string,
    staticOptions: SslCommerzModuleOptions,
    optionsProvider: Provider,
    imports: DynamicModule['imports'] = [],
  ): DynamicModule {
    const isDefault = name === DEFAULT_SSLCOMMERZ_CLIENT;
    const optionsToken = getSslCommerzOptionsToken(name);
    const clientToken = getSslCommerzClientToken(name);
    const serviceToken = getSslCommerzServiceToken(name);
    const emitterToken = getSslCommerzEmitterToken(name);

    const providers: Provider[] = [
      optionsProvider,
      {
        provide: clientToken,
        inject: [optionsToken],
        useFactory: (options: SslCommerzModuleOptions) => createClient(name, options),
      },
      {
        // Falls back to a private Node EventEmitter, so listeners can always
        // subscribe even when the app has no event library.
        provide: emitterToken,
        inject: [optionsToken],
        useFactory: (options: SslCommerzModuleOptions): SslCommerzEventEmitter =>
          options.events?.emitter ?? new EventEmitter(),
      },
      {
        provide: serviceToken,
        inject: [clientToken, optionsToken, emitterToken],
        useFactory: (
          client: SslCommerzClient,
          options: SslCommerzModuleOptions,
          emitter: SslCommerzEventEmitter,
        ) => new SslCommerzService(name, client, options, emitter),
      },
      {
        // Per-client lifecycle: Nest invokes hooks on factory-created
        // instances, giving each registration its own bootstrap/shutdown.
        provide: getSslCommerzLifecycleToken(name),
        inject: [clientToken, optionsToken],
        useFactory: (client: SslCommerzClient, options: SslCommerzModuleOptions) =>
          new SslCommerzClientLifecycle(name, client, options),
      },
    ];

    const exports: (string | symbol | Provider)[] = [
      clientToken,
      serviceToken,
      emitterToken,
      optionsToken,
    ];

    if (isDefault) {
      // The default registration is also reachable by class token, so
      // `constructor(private readonly ssl: SslCommerzService)` just works.
      providers.push(
        { provide: SslCommerzService, useExisting: serviceToken },
        {
          provide: SslCommerzHealthIndicator,
          inject: [serviceToken],
          useFactory: (service: SslCommerzService) => new SslCommerzHealthIndicator(service),
        },
        {
          provide: SslCommerzIpnGuard,
          inject: [serviceToken],
          useFactory: (service: SslCommerzService) => new SslCommerzIpnGuard(service),
        },
      );
      exports.push(SslCommerzService, SslCommerzHealthIndicator, SslCommerzIpnGuard);
    }

    const controllerOptions = staticOptions.controller;
    const mountController = controllerOptions && controllerOptions.enabled !== false;

    return {
      module: SslCommerzModule,
      global: staticOptions.global !== false,
      imports,
      providers,
      controllers: mountController
        ? [createSslCommerzController(controllerOptions, serviceToken)]
        : [],
      exports,
    };
  }
}
