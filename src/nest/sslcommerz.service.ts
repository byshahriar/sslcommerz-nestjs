/**
 * @file The injectable service — the API an application actually uses.
 *
 * It wraps the low-level client with the work every integration ends up
 * writing anyway: DTO validation before a request is spent, signature
 * verification, the mandatory validation round trip, the cross-check that
 * the confirmed transaction is the order being fulfilled, and an event for
 * each outcome.
 */
import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { DEFAULT_AMOUNT_TOLERANCE, DEFAULT_CURRENCY } from '../constants/default.constant';
import { SSLCOMMERZ_EVENTS } from '../constants/event.constant';
import { checkSslCommerzHealth } from '../core/health';
import { CallbackChannel } from '../enums/callback-channel.enum';
import { PaymentState } from '../enums/payment-state.enum';
import { SslCommerzValidationError } from '../errors/sslcommerz.error';
import type { SslCommerzClient } from '../interfaces/client.interface';
import type { SslCommerzEventEmitter } from '../interfaces/event.interface';
import type {
  IpnPayload,
  RefundInitiateResponse,
  RefundQueryResponse,
  SessionInitRequest,
  SessionInitResponse,
  TransactionQueryResponse,
  ValidationResponse,
} from '../interfaces/gateway.interface';
import type { SslCommerzHealth } from '../interfaces/health.interface';
import type { SslCommerzModuleOptions } from '../interfaces/module.interface';
import type {
  CallbackContext,
  ExpectedPayment,
  PaymentOutcome,
  SessionResult,
} from '../interfaces/payment.interface';
import type { IpnSignatureResult } from '../interfaces/signature.interface';
import { CreateSessionDto, toSessionInitRequest } from '../dto/create-session.dto';
import type {
  InitiateRefundDto,
  RefundQueryDto,
  TransactionQueryByIdDto,
  TransactionQueryBySessionDto,
  ValidateTransactionDto,
} from '../dto/transaction.dto';
import { resolveChargedAmount, verifyOrder } from '../utils/money.util';
import { verifyIpnSignature } from '../utils/signature.util';
import {
  isCancelledStatus,
  isPaidStatus,
  isRefundAccepted,
  normaliseStatus,
} from '../utils/status.util';

/**
 * The SSLCommerz gateway, as an injectable service.
 *
 * @example
 * ```ts
 * constructor(private readonly ssl: SslCommerzService) {}
 * ```
 */
@Injectable()
export class SslCommerzService {
  private readonly logger: Logger;

  constructor(
    /** Registered name this service speaks for. */
    readonly name: string,
    /** The low-level client, for calls this service doesn't wrap. */
    readonly client: SslCommerzClient,
    private readonly options: SslCommerzModuleOptions = {},
    private readonly emitter?: SslCommerzEventEmitter,
  ) {
    this.logger = new Logger(`SslCommerz:${name}`);
  }

  /**
   * Opens a payment session from a validated DTO.
   *
   * @param dto - The session request; validated before anything is sent.
   * @returns The redirect URL, session key and the channels the store offers.
   * @throws {SslCommerzValidationError} When the DTO is invalid, or the gateway refuses the session.
   */
  async createSession(dto: CreateSessionDto): Promise<SessionResult> {
    const request = plainToInstance(CreateSessionDto, dto);
    const problems = validateSync(request, { whitelist: true, forbidUnknownValues: false });
    if (problems.length > 0) {
      const details = problems.flatMap((problem) => describeProblem(problem));
      throw new SslCommerzValidationError(
        `Invalid session request: ${details.join('; ')}`,
        details,
      );
    }

    const reply = await this.client.init(toSessionInitRequest(request));
    const base = {
      client: this.name,
      transactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      at: new Date(),
    };

    if (normaliseStatus(reply.status) !== 'SUCCESS' || !reply.GatewayPageURL) {
      const reason = reply.failedreason ?? `gateway answered ${reply.status}`;
      this.emit(SSLCOMMERZ_EVENTS.sessionFailed, { ...base, reason });
      throw new SslCommerzValidationError(`SSLCommerz refused the session: ${reason}`);
    }

    this.emit(SSLCOMMERZ_EVENTS.sessionCreated, {
      ...base,
      sessionKey: reply.sessionkey,
      redirectUrl: reply.GatewayPageURL,
    });

    return {
      redirectUrl: reply.GatewayPageURL,
      sessionKey: reply.sessionkey,
      channels: reply.desc ?? [],
      directPaymentUrls: {
        bank: reply.directPaymentURLBank,
        card: reply.directPaymentURLCard,
      },
      raw: reply,
    };
  }

  /**
   * Opens a session from the gateway's own flat field names, for the fields
   * {@link CreateSessionDto} doesn't model.
   *
   * @param request - Raw session init fields.
   * @returns The gateway's reply, unexamined.
   */
  async initSession(request: SessionInitRequest): Promise<SessionInitResponse> {
    return this.client.init(request);
  }

  /**
   * Confirms a transaction with the gateway. This is the authoritative check
   * — a callback on its own proves nothing.
   *
   * @param dto - Carries the `val_id` from a callback, or the id itself.
   * @returns The validation reply.
   */
  async validate(dto: ValidateTransactionDto | string): Promise<ValidationResponse> {
    const valId = typeof dto === 'string' ? dto : dto.val_id;
    return this.client.validate({ val_id: valId });
  }

  /**
   * Verifies a callback's `verify_sign` against the store password.
   *
   * @param payload - The callback body, exactly as received.
   * @returns Whether the signature reproduces.
   */
  verifySignature(payload: Record<string, unknown>): IpnSignatureResult {
    return verifyIpnSignature(payload, this.client.config.storePassword);
  }

  /**
   * Resolves one callback — IPN, success, fail or cancel — into a verdict.
   *
   * The sequence is deliberate, and each step exists because the previous
   * one is insufficient: verify the signature (cheap, rejects forgeries),
   * confirm with the gateway (a signature proves origin, not payment), then
   * check that the confirmed transaction is *this* order for *this* amount
   * (the gateway confirms a transaction, not yours). Publishes an event
   * either way.
   *
   * Never throws for a failed payment — a rejected or forged callback is a
   * result, not an exception, because the caller must still answer the
   * gateway with a 200.
   *
   * @param payload - The callback body.
   * @param context - Channel, expected amounts, and verification opt-outs.
   * @returns The verdict; act only on `isPaid`.
   */
  async handleCallback(
    payload: IpnPayload,
    context: CallbackContext = {},
  ): Promise<PaymentOutcome> {
    const channel = context.channel ?? CallbackChannel.Ipn;
    const transactionId = String(payload.tran_id ?? '');
    const signature = context.skipSignatureCheck ? { valid: true } : this.verifySignature(payload);

    this.emit(SSLCOMMERZ_EVENTS.callbackReceived, {
      client: this.name,
      transactionId,
      at: new Date(),
      channel,
      signature,
      payload,
    });

    const verifyRequired = this.options.controller?.verifySignature !== false;
    if (verifyRequired && !context.skipSignatureCheck && !signature.valid) {
      this.logger.warn(
        `Rejected ${channel} callback for ${transactionId || '(no tran_id)'}: ${signature.reason}`,
      );
      this.emit(SSLCOMMERZ_EVENTS.callbackRejected, {
        client: this.name,
        transactionId,
        at: new Date(),
        channel,
        signature,
        payload,
      });
      return this.outcome(PaymentState.Unverified, payload, signature, {
        reason: signature.reason ?? 'signature verification failed',
      });
    }

    if (isCancelledStatus(payload.status) || channel === CallbackChannel.Cancel) {
      const outcome = this.outcome(PaymentState.Cancelled, payload, signature, {
        reason: 'customer cancelled at the gateway',
      });
      this.emit(SSLCOMMERZ_EVENTS.paymentCancelled, this.paymentEvent(outcome));
      return outcome;
    }

    if (!payload.val_id) {
      const status = normaliseStatus(payload.status);
      const outcome = this.outcome(PaymentState.Failed, payload, signature, {
        reason: status ? `gateway reported ${status}` : 'callback carried no val_id',
      });
      this.emit(SSLCOMMERZ_EVENTS.paymentFailed, this.paymentEvent(outcome));
      return outcome;
    }

    if (context.skipValidation) {
      const paid = isPaidStatus(payload.status);
      const outcome = this.outcome(
        paid ? PaymentState.Paid : PaymentState.Failed,
        payload,
        signature,
        { reason: 'validation skipped by caller' },
      );
      this.emit(
        paid ? SSLCOMMERZ_EVENTS.paymentValidated : SSLCOMMERZ_EVENTS.paymentFailed,
        this.paymentEvent(outcome),
      );
      return outcome;
    }

    const validation = await this.validate(String(payload.val_id));

    if (!isPaidStatus(validation.status)) {
      const outcome = this.outcome(PaymentState.Failed, payload, signature, {
        validation,
        reason: `validation returned ${validation.status ?? 'no status'}`,
      });
      this.emit(SSLCOMMERZ_EVENTS.paymentFailed, this.paymentEvent(outcome));
      return outcome;
    }

    // The gateway confirms a transaction, not *your* transaction: without
    // this, a val_id belonging to a different (or cheaper) order validates
    // perfectly well. The transaction id defaults to the callback's own, so
    // the check happens even when the caller passes no expectations.
    const expected: ExpectedPayment = {
      transactionId: context.expect?.transactionId ?? (transactionId || undefined),
      amount: context.expect?.amount,
      currency: context.expect?.currency,
    };
    const verification = verifyOrder(
      validation,
      expected,
      this.client.config.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE,
    );

    if (!verification.valid) {
      this.logger.error(`Payment ${transactionId} validated but ${verification.reason}`);
      const outcome = this.outcome(PaymentState.Mismatch, payload, signature, {
        validation,
        reason: verification.reason,
        expectedCurrency: expected.currency,
      });
      this.emit(SSLCOMMERZ_EVENTS.paymentMismatch, this.paymentEvent(outcome));
      return outcome;
    }

    const outcome = this.outcome(PaymentState.Paid, payload, signature, {
      validation,
      expectedCurrency: expected.currency,
    });
    this.emit(SSLCOMMERZ_EVENTS.paymentValidated, this.paymentEvent(outcome));
    return outcome;
  }

  /**
   * Starts a refund. Note the key: `bank_tran_id` from the validation
   * response, not your own `tran_id`.
   *
   * @param dto - Refund amount, remarks and the gateway transaction id.
   * @returns The gateway's reply, carrying `refund_ref_id` when accepted.
   */
  async initiateRefund(dto: InitiateRefundDto): Promise<RefundInitiateResponse> {
    const reply = await this.client.initiateRefund({
      refund_amount: dto.refund_amount,
      refund_remarks: dto.refund_remarks,
      bank_tran_id: dto.bank_tran_id,
      refe_id: dto.refe_id,
    });

    const accepted = isRefundAccepted(reply.status);
    this.emit(accepted ? SSLCOMMERZ_EVENTS.refundInitiated : SSLCOMMERZ_EVENTS.refundFailed, {
      client: this.name,
      transactionId: reply.trans_id ?? dto.refe_id ?? '',
      at: new Date(),
      amount: Number(dto.refund_amount),
      bankTransactionId: dto.bank_tran_id,
      refundRefId: reply.refund_ref_id,
      status: reply.status,
      reason: reply.errorReason,
    });
    return reply;
  }

  /**
   * Checks a refund's progress.
   *
   * @param dto - Carries the `refund_ref_id` from the initiation.
   * @returns The gateway's reply.
   */
  async refundQuery(dto: RefundQueryDto): Promise<RefundQueryResponse> {
    return this.client.refundQuery({ refund_ref_id: dto.refund_ref_id });
  }

  /**
   * Looks a transaction up by your own order id.
   *
   * @param dto - Carries `tran_id`.
   * @returns The gateway's reply.
   */
  async queryByTransactionId(dto: TransactionQueryByIdDto): Promise<TransactionQueryResponse> {
    return this.client.transactionQueryByTransactionId({ tran_id: dto.tran_id });
  }

  /**
   * Looks a transaction up by session key.
   *
   * @param dto - Carries `sessionkey`.
   * @returns The gateway's reply.
   */
  async queryBySessionId(dto: TransactionQueryBySessionDto): Promise<TransactionQueryResponse> {
    return this.client.transactionQueryBySessionId({ sessionkey: dto.sessionkey });
  }

  /**
   * Bounded reachability probe for readiness endpoints. Never throws.
   *
   * @param timeoutMs - Upper bound on the probe.
   * @returns The health result.
   */
  async health(timeoutMs?: number): Promise<SslCommerzHealth> {
    return checkSslCommerzHealth(this.client, timeoutMs);
  }

  /**
   * Assembles an outcome from a callback and whatever was learned about it.
   *
   * @param state - Resolved state.
   * @param payload - The callback body.
   * @param signature - Signature check result.
   * @param extra - Validation reply, expected currency and failure reason.
   * @returns The outcome.
   */
  private outcome(
    state: PaymentState,
    payload: IpnPayload,
    signature: IpnSignatureResult,
    extra: {
      validation?: ValidationResponse;
      reason?: string;
      expectedCurrency?: string;
    } = {},
  ): PaymentOutcome {
    const charged = extra.validation
      ? resolveChargedAmount(extra.validation, extra.expectedCurrency ?? DEFAULT_CURRENCY)
      : { amount: payload.currency_amount ?? payload.amount, currency: payload.currency };
    const amount = charged.amount === undefined ? undefined : Number(charged.amount);

    return {
      state,
      isPaid: state === PaymentState.Paid,
      transactionId: String(payload.tran_id ?? extra.validation?.tran_id ?? ''),
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: charged.currency,
      bankTransactionId: extra.validation?.bank_tran_id ?? payload.bank_tran_id,
      signature,
      validation: extra.validation,
      reason: extra.reason,
      raw: payload,
    };
  }

  /**
   * Projects an outcome into a payment event payload.
   *
   * @param outcome - The resolved outcome.
   * @returns The event payload.
   */
  private paymentEvent(outcome: PaymentOutcome): Record<string, unknown> {
    return {
      client: this.name,
      transactionId: outcome.transactionId,
      at: new Date(),
      state: outcome.state,
      amount: outcome.amount,
      currency: outcome.currency,
      bankTransactionId: outcome.bankTransactionId,
      validation: outcome.validation,
      reason: outcome.reason,
    };
  }

  /**
   * Publishes an event, if events are enabled and an emitter exists. A
   * listener that throws must never fail the payment that triggered it.
   *
   * @param event - Event name.
   * @param payload - Event payload.
   */
  private emit(event: string, payload: unknown): void {
    if (this.options.events?.enabled === false || !this.emitter) {
      return;
    }
    try {
      this.emitter.emit(event, payload);
    } catch (error) {
      this.logger.error(
        `Listener for ${event} threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Flattens a class-validator error (and its children) into readable lines.
 *
 * @param problem - A validation error, possibly nested.
 * @param path - Parent property path.
 * @returns One line per failed constraint.
 */
function describeProblem(
  problem: { property: string; constraints?: Record<string, string>; children?: any[] },
  path = '',
): string[] {
  const property = path ? `${path}.${problem.property}` : problem.property;
  const own = Object.values(problem.constraints ?? {}).map((message) =>
    message.replace(problem.property, property),
  );
  const nested = (problem.children ?? []).flatMap((child) => describeProblem(child, property));
  return [...own, ...nested];
}
