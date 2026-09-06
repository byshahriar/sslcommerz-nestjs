/**
 * @file Verdicts and results the service produces.
 */
import type { CallbackChannel } from '../enums/callback-channel.enum';
import type { PaymentState } from '../enums/payment-state.enum';
import type {
  GatewayChannel,
  IpnPayload,
  SessionInitResponse,
  ValidationResponse,
} from './gateway.interface';
import type { IpnSignatureResult } from './signature.interface';

/** What a session request produced. */
export interface SessionResult {
  /** Send the customer's browser here. */
  redirectUrl: string;
  /** Handle for `queryBySessionId`. */
  sessionKey?: string;
  /** Channels the store may offer — what an embedded checkout renders. */
  channels: GatewayChannel[];
  /** Direct per-channel URLs, when the store is configured for them. */
  directPaymentUrls: { bank?: string; card?: string };
  /** The gateway's untouched reply. */
  raw: SessionInitResponse;
}

/** What the caller expected the payment to be, checked against the gateway. */
export interface ExpectedPayment {
  /** The order total. A mismatch resolves to `mismatch`, never `paid`. */
  amount?: number;
  /** Expected currency, e.g. `BDT`. */
  currency?: string;
  /**
   * The order id this callback should belong to. Defaults to the `tran_id`
   * on the callback itself, so a `val_id` naming a different order is caught
   * even when the caller passes nothing.
   */
  transactionId?: string;
}

/** Why a validated payment was rejected. */
export interface OrderVerification {
  /** True only when status, order id, amount and currency all agree. */
  valid: boolean;
  /** What disagreed, for logs and events. */
  reason?: string;
}

/** The verdict on one callback — the value an application acts on. */
export interface PaymentOutcome {
  /** Only `paid` is safe to fulfil on. */
  state: PaymentState;
  /** True for `paid` alone; a convenience for the common branch. */
  isPaid: boolean;
  transactionId: string;
  /** Amount in the currency the customer was charged. */
  amount?: number;
  /** The currency the customer was charged in. */
  currency?: string;
  /** The gateway's transaction id — what a refund is keyed on. Keep it. */
  bankTransactionId?: string;
  /** Signature check result; `valid: false` means the payload may be forged. */
  signature: IpnSignatureResult;
  /** The validation call's reply, when one was made. */
  validation?: ValidationResponse;
  /** Why the outcome isn't `paid`. */
  reason?: string;
  /** The callback exactly as received. */
  raw: IpnPayload;
}

/** Extra context for a callback. */
export interface CallbackContext {
  /** Which route it arrived on. @default CallbackChannel.Ipn */
  channel?: CallbackChannel | string;
  /** Cross-check the gateway's numbers against your own order. */
  expect?: ExpectedPayment;
  /** Skip the signature check. Only for a caller that authenticated it another way. */
  skipSignatureCheck?: boolean;
  /** Skip the validation round trip. Leaves the result untrustworthy. */
  skipValidation?: boolean;
}
