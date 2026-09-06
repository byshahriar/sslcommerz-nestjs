/**
 * @file Options for the NestJS module.
 */
import type { FactoryProvider, ModuleMetadata } from '@nestjs/common';

import type { SslCommerzClientOptions } from './client.interface';
import type { SslCommerzConfig } from './config.interface';
import type { SslCommerzEventEmitter } from './event.interface';

/** Startup readiness behaviour. */
export interface SslCommerzStartupOptions {
  /** How long to wait for the gateway to answer at bootstrap. @default DEFAULT_STARTUP_TIMEOUT_MS */
  timeoutMs?: number;
  /** Abort application bootstrap if the gateway stays unreachable. @default true */
  required?: boolean;
}

/** Event publication. */
export interface SslCommerzEventOptions {
  /** Publish events at all. @default true */
  enabled?: boolean;
  /**
   * Where to publish. `EventEmitter2` from `@nestjs/event-emitter` satisfies
   * this interface. When omitted, a private Node `EventEmitter` is created
   * and provided under `getSslCommerzEmitterToken`, so listeners can still
   * subscribe.
   */
  emitter?: SslCommerzEventEmitter;
}

/** Where the gateway sends the customer's browser after each outcome. */
export interface SslCommerzRedirectOptions {
  success: string;
  fail: string;
  cancel: string;
}

/** The built-in callback controller. */
export interface SslCommerzControllerOptions {
  /** Mount the controller. @default true when `controller` is given at all */
  enabled?: boolean;
  /** Route prefix for every callback route. @default DEFAULT_ROUTES.path */
  path?: string;
  /** Server-to-server notification route. @default 'ipn' */
  ipnPath?: string;
  /** Customer-facing routes. @default 'success' / 'fail' / 'cancel' */
  successPath?: string;
  failPath?: string;
  cancelPath?: string;
  /**
   * Where to send the browser after a customer-facing callback. Omit and the
   * routes answer with JSON instead — useful for an API-only backend.
   */
  redirect?: SslCommerzRedirectOptions;
  /**
   * Reject callbacks whose `verify_sign` doesn't reproduce. @default true
   *
   * Only defensible behind a network that already authenticates the caller —
   * the routes are public otherwise.
   */
  verifySignature?: boolean;
  /**
   * Confirm every callback with a validation call before reporting a payment
   * as complete. @default true — turning it off means trusting an
   * unauthenticated POST, so don't.
   */
  validateOnCallback?: boolean;
}

/** Options for `SslCommerzModule.forRoot`. */
export interface SslCommerzModuleOptions {
  /**
   * Registration name. Register the module once per store and inject named
   * services with `@InjectSslCommerz(name)`. @default DEFAULT_SSLCOMMERZ_CLIENT
   */
  name?: string;
  /** Service identity — drives the `User-Agent` sent to the gateway. @default env.APP_NAME */
  serviceName?: string;
  /** Explicit config overrides merged over the environment (highest precedence). */
  config?: Partial<SslCommerzConfig>;
  /** Raw client options, applied last (extra headers, transport override). */
  options?: SslCommerzClientOptions;
  /** Startup readiness behaviour. */
  startup?: SslCommerzStartupOptions;
  /** How long a graceful `close()` may take at shutdown. @default DEFAULT_SHUTDOWN_GRACE_MS */
  shutdownGraceMs?: number;
  /** Register providers globally. @default true */
  global?: boolean;
  /** Event publication. */
  events?: SslCommerzEventOptions;
  /** Mount the built-in callback controller. Omit to wire your own routes. */
  controller?: SslCommerzControllerOptions;
}

/** Options for `SslCommerzModule.forRootAsync`. */
export interface SslCommerzModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /** Registration name; must be static even when the rest of the options are async. */
  name?: string;
  /**
   * Controller mounting is resolved at module-definition time, before the
   * factory runs, so it stays here rather than in the factory's result.
   */
  controller?: SslCommerzControllerOptions;
  /** Register providers globally. @default true */
  global?: boolean;
  /** Factory producing {@link SslCommerzModuleOptions}; may be async. */
  useFactory: (...args: any[]) => Promise<SslCommerzModuleOptions> | SslCommerzModuleOptions;
  /** Providers injected into `useFactory`, resolved from `imports`. */
  inject?: FactoryProvider['inject'];
}
