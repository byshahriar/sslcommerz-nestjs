/**
 * @file A health indicator shaped for `@nestjs/terminus`, without depending
 * on it.
 *
 * The return value is a `HealthIndicatorResult` structurally, so it drops
 * straight into a terminus health check; apps without terminus can read the
 * same object directly.
 */
import { Injectable } from '@nestjs/common';

import { DEFAULT_HEALTH_TIMEOUT_MS } from '../constants/default.constant';
import type { SslCommerzHealthIndicatorResult } from '../interfaces/health.interface';
import { SslCommerzService } from './sslcommerz.service';

/**
 * Reports whether the gateway host is reachable.
 *
 * This proves reachability only — the probe carries no credentials, so it
 * cannot tell you they are valid. Wire it as a non-critical check: a
 * readiness endpoint that fails because SSLCommerz is briefly slow will pull
 * a healthy service out of rotation for no reason.
 *
 * @example
 * ```ts
 * @Get('health')
 * @HealthCheck()
 * check() {
 *   return this.health.check([() => this.sslcommerz.isHealthy('sslcommerz')]);
 * }
 * ```
 */
@Injectable()
export class SslCommerzHealthIndicator {
  constructor(private readonly service: SslCommerzService) {}

  /**
   * Probes the gateway.
   *
   * @param key - Key this indicator reports under. @default 'sslcommerz'
   * @param timeoutMs - Upper bound on the probe. @default 2000
   * @returns A terminus-shaped result; never throws.
   */
  async isHealthy(
    key = 'sslcommerz',
    timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS,
  ): Promise<SslCommerzHealthIndicatorResult> {
    const health = await this.service.health(timeoutMs);
    return {
      [key]: {
        status: health.healthy ? 'up' : 'down',
        latencyMs: health.latencyMs,
        environment: this.service.client.config.sandbox ? 'sandbox' : 'live',
        ...(health.error ? { error: health.error } : {}),
      },
    };
  }
}
