/**
 * @file Connectivity probes for readiness/liveness endpoints.
 */
import { DEFAULT_HEALTH_TIMEOUT_MS } from '../constants/default.constant';
import type { SslCommerzClient } from '../interfaces/client.interface';
import type { SslCommerzHealth } from '../interfaces/health.interface';

/**
 * Bounded health probe: pings the gateway and reports latency plus the
 * client's state. Never throws — failures (including the timeout) are
 * reported in the result, which is what a readiness endpoint wants.
 *
 * The probe only proves the gateway host answers — it carries no store
 * credentials, so a healthy result says nothing about whether they are
 * valid. Keep it non-critical.
 *
 * @param client - The client to probe.
 * @param timeoutMs - Upper bound on the probe. @default DEFAULT_HEALTH_TIMEOUT_MS
 * @returns The health result.
 */
export async function checkSslCommerzHealth(
  client: SslCommerzClient,
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS,
): Promise<SslCommerzHealth> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Health check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref();
  });
  try {
    await Promise.race([client.ping(), timeout]);
    return { healthy: true, latencyMs: Date.now() - started, status: client.status };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - started,
      status: client.status,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
