/**
 * @file The gateway client's contract.
 */
import type { ClientStatus } from '../enums/client-status.enum';
import type { FetchLike, GatewayParams } from '../types/gateway.type';
import type { SslCommerzConfig } from './config.interface';
import type {
  RefundInitiateRequest,
  RefundInitiateResponse,
  RefundQueryResponse,
  SessionInitRequest,
  SessionInitResponse,
  TransactionQueryResponse,
  ValidationResponse,
} from './gateway.interface';

/** Construction options applied on top of the resolved config. */
export interface SslCommerzClientOptions {
  /** Extra headers merged into every request (lowest precedence). */
  headers?: Record<string, string>;
  /** Transport override — injected by tests to stay off the network. @default globalThis.fetch */
  fetch?: FetchLike;
}

/**
 * The full gateway surface. `connect`/`ping`/`close` serve the Nest
 * lifecycle and health probe; the six named operations mirror the official
 * Node SDK one for one, so an existing integration ports across unchanged.
 */
export interface SslCommerzClient {
  /** Settings this client was built from. */
  readonly config: SslCommerzConfig;
  /** Current client state. */
  readonly status: ClientStatus;
  /** Proves the gateway is reachable (SSLCommerz is stateless — nothing is held open). */
  connect(): Promise<void>;
  /** Cheap round-trip used by bootstrap and the health probe. */
  ping(): Promise<void>;
  /** Releases the client; safe to call twice. */
  close(): Promise<void>;

  /**
   * Opens a payment session. On success the reply carries `GatewayPageURL`,
   * where the customer is redirected.
   */
  init(data: SessionInitRequest): Promise<SessionInitResponse>;
  /**
   * Confirms a transaction by `val_id`. The only trustworthy signal that a
   * payment completed — never fulfil on a callback alone.
   */
  validate(data: { val_id: string } & GatewayParams): Promise<ValidationResponse>;
  /** Starts a full or partial refund, keyed by `bank_tran_id`. */
  initiateRefund(data: RefundInitiateRequest): Promise<RefundInitiateResponse>;
  /** Checks a refund's progress by the `refund_ref_id` the initiation returned. */
  refundQuery(data: { refund_ref_id: string } & GatewayParams): Promise<RefundQueryResponse>;
  /** Looks a transaction up by the merchant's own `tran_id`. */
  transactionQueryByTransactionId(
    data: { tran_id: string } & GatewayParams,
  ): Promise<TransactionQueryResponse>;
  /** Looks a transaction up by the `sessionkey` from session init. */
  transactionQueryBySessionId(
    data: { sessionkey: string } & GatewayParams,
  ): Promise<TransactionQueryResponse>;
}
