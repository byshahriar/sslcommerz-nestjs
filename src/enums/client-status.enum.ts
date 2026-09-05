/**
 * @file Client connection state.
 */

/**
 * State of a gateway client. SSLCommerz is stateless — nothing is held open
 * — so this reflects the lifecycle, not a socket.
 */
export enum ClientStatus {
  /** Constructed, not yet proven reachable. */
  Idle = 'idle',
  /** The gateway host answered at bootstrap. */
  Ready = 'ready',
  /** Shut down. */
  Closed = 'closed',
}
