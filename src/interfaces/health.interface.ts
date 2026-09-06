/**
 * @file Health probe results.
 */

/** Result of a bounded reachability probe. */
export interface SslCommerzHealth {
  /** False when the probe failed or timed out. */
  healthy: boolean;
  /** Probe round-trip time (or time until failure/timeout). */
  latencyMs: number;
  /** Client state at probe time. */
  status: string;
  /** Failure description when unhealthy. */
  error?: string;
}

/** One indicator entry, shaped the way `@nestjs/terminus` expects. */
export type SslCommerzHealthIndicatorResult = Record<
  string,
  { status: 'up' | 'down'; latencyMs?: number; environment?: string; error?: string }
>;
