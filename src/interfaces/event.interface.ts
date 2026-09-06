/**
 * @file Event payloads.
 *
 * The emitter is an interface rather than a dependency: `EventEmitter2` from
 * `@nestjs/event-emitter` satisfies it as-is, which makes
 * `@OnEvent('sslcommerz.*')` work, and a bare Node `EventEmitter` is used
 * when the app supplies nothing.
 */
import type { PaymentState } from '../enums/payment-state.enum';
import type { ValidationResponse } from './gateway.interface';
import type { IpnSignatureResult } from './signature.interface';

/** Anything with an `emit(event, payload)` method. */
export interface SslCommerzEventEmitter {
  emit(event: string, payload: unknown): unknown;
}

/** Fields carried by every event, so a listener can always correlate. */
export interface SslCommerzEventBase {
  /** Registered client name this came from (`default` unless named). */
  client: string;
  /** The merchant's own order id. */
  transactionId: string;
  /** When the event was emitted. */
  at: Date;
}

/** Payload of `sslcommerz.session.created` / `.failed`. */
export interface SessionEvent extends SslCommerzEventBase {
  amount: number;
  currency: string;
  sessionKey?: string;
  redirectUrl?: string;
  reason?: string;
}

/** Payload of `sslcommerz.callback.received` / `.rejected`. */
export interface CallbackEvent extends SslCommerzEventBase {
  /** Which route it arrived on. */
  channel: string;
  signature: IpnSignatureResult;
  payload: Record<string, unknown>;
}

/** Payload of `sslcommerz.payment.*`. */
export interface PaymentEvent extends SslCommerzEventBase {
  /** Resolved state after verification and validation. */
  state: PaymentState;
  amount?: number;
  currency?: string;
  /** The gateway's transaction id — the handle refunds are keyed on. */
  bankTransactionId?: string;
  validation?: ValidationResponse;
  reason?: string;
}

/** Payload of `sslcommerz.refund.*`. */
export interface RefundEvent extends SslCommerzEventBase {
  amount: number;
  bankTransactionId: string;
  refundRefId?: string;
  status?: string;
  reason?: string;
}
