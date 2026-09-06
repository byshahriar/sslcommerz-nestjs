/**
 * @file Application lifecycle management for one client.
 */
import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import {
  DEFAULT_SHUTDOWN_GRACE_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
} from '../constants/default.constant';
import { ClientStatus } from '../enums/client-status.enum';
import type { SslCommerzClient } from '../interfaces/client.interface';
import type { SslCommerzModuleOptions } from '../interfaces/module.interface';

/**
 * Connects the client at bootstrap and closes it gracefully at shutdown.
 * Instantiated once per registered client.
 *
 * With `startup.required` (the default) an unreachable service aborts the
 * application; opt out for services that can degrade gracefully.
 */
export class SslCommerzClientLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger: Logger;

  constructor(
    private readonly name: string,
    private readonly client: SslCommerzClient,
    private readonly options: SslCommerzModuleOptions,
  ) {
    this.logger = new Logger(`SslCommerz:${name}`);
  }

  /**
   * Gates application start on the client connecting, bounded by a timeout so
   * an unreachable gateway can never hang bootstrap indefinitely.
   */
  async onApplicationBootstrap(): Promise<void> {
    const { timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS, required = true } = this.options.startup ?? {};
    if (this.client.status === ClientStatus.Ready) {
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Client "${this.name}" not ready within ${timeoutMs}ms`)),
        timeoutMs,
      );
      timer.unref();
    });

    try {
      await Promise.race([this.client.connect(), timeout]);
      this.logger.log('Client ready');
    } catch (error) {
      if (required) {
        throw error;
      }
      this.logger.error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Closes the client: a graceful `close()` bounded by `shutdownGraceMs`, so
   * a dead gateway can never hang shutdown.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === ClientStatus.Closed) {
      return;
    }
    const graceMs = this.options.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
    const grace = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), graceMs).unref();
    });
    try {
      if ((await Promise.race([this.client.close(), grace])) === 'timeout') {
        this.logger.warn(`Close did not finish within ${graceMs}ms`);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
    this.logger.log('Client closed');
  }
}
