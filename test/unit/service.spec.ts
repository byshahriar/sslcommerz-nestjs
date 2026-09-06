import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CallbackChannel,
  PaymentState,
  SSLCOMMERZ_EVENTS,
  SslCommerzService,
  SslCommerzValidationError,
  TransactionStatus,
  type IpnPayloadDto,
} from '../../src';
import { FakeSslCommerzClient, sign, validSession } from '../helpers';

/** Records every event the service publishes. */
function recorder() {
  const emit = vi.fn();
  return { emit, names: () => emit.mock.calls.map(([name]) => name as string) };
}

let client: FakeSslCommerzClient;
let events: ReturnType<typeof recorder>;
let service: SslCommerzService;

beforeAll(() => {
  Logger.overrideLogger(false);
});

beforeEach(() => {
  client = new FakeSslCommerzClient();
  events = recorder();
  service = new SslCommerzService('default', client, {}, events);
});

describe('createSession', () => {
  it('validates the DTO before touching the gateway', async () => {
    await expect(
      service.createSession({ ...validSession, amount: -1 } as never),
    ).rejects.toThrowError(SslCommerzValidationError);
    expect(client.init).not.toHaveBeenCalled();
  });

  it('names every invalid field in the error', async () => {
    const error = await service
      .createSession({ ...validSession, amount: -1, currency: 'TAKA' } as never)
      .catch((caught: SslCommerzValidationError) => caught);
    expect((error as SslCommerzValidationError).details.join(' ')).toMatch(/amount/);
    expect((error as SslCommerzValidationError).details.join(' ')).toMatch(/currency/);
  });

  it('returns the redirect url and emits session.created', async () => {
    client.init.mockResolvedValue({
      status: 'SUCCESS',
      sessionkey: 'sess-1',
      GatewayPageURL: 'https://sandbox.sslcommerz.com/pay/abc',
    });

    const result = await service.createSession(validSession as never);

    expect(result.redirectUrl).toBe('https://sandbox.sslcommerz.com/pay/abc');
    expect(result.sessionKey).toBe('sess-1');
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.sessionCreated);
  });

  it('throws and emits session.failed when the gateway refuses', async () => {
    client.init.mockResolvedValue({ status: 'FAILED', failedreason: 'Store Credential Error' });

    await expect(service.createSession(validSession as never)).rejects.toThrowError(
      /Store Credential Error/,
    );
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.sessionFailed);
  });
});

describe('handleCallback', () => {
  /** A signed, successful callback. */
  function paidCallback(overrides: Record<string, string> = {}): IpnPayloadDto {
    return sign({
      tran_id: 'order-1',
      val_id: 'val-1',
      amount: '1000.00',
      currency: 'BDT',
      status: 'VALID',
      bank_tran_id: 'bank-1',
      ...overrides,
    }) as unknown as IpnPayloadDto;
  }

  it('rejects an unsigned callback without calling the gateway', async () => {
    const outcome = await service.handleCallback({ tran_id: 'order-1' } as IpnPayloadDto);

    expect(outcome.state).toBe(PaymentState.Unverified);
    expect(outcome.isPaid).toBe(false);
    expect(client.validate).not.toHaveBeenCalled();
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.callbackRejected);
  });

  it('rejects a callback whose amount was tampered with', async () => {
    const payload = paidCallback();
    payload.amount = '1.00';
    const outcome = await service.handleCallback(payload);
    expect(outcome.state).toBe(PaymentState.Unverified);
  });

  it('confirms a signed callback with a validation call before reporting paid', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '1000.00',
      currency: 'BDT',
      bank_tran_id: 'bank-1',
    });

    const outcome = await service.handleCallback(paidCallback());

    expect(client.validate).toHaveBeenCalledWith({ val_id: 'val-1' });
    expect(outcome).toMatchObject({
      state: PaymentState.Paid,
      isPaid: true,
      transactionId: 'order-1',
      amount: 1000,
      currency: 'BDT',
      bankTransactionId: 'bank-1',
    });
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.paymentValidated);
  });

  it('does not report paid when validation disagrees with the callback', async () => {
    client.validate.mockResolvedValue({ status: TransactionStatus.InvalidTransaction });

    const outcome = await service.handleCallback(paidCallback());

    expect(outcome.state).toBe(PaymentState.Failed);
    expect(outcome.reason).toMatch(/INVALID_TRANSACTION/);
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.paymentFailed);
  });

  it('flags a genuine payment for the wrong amount as a mismatch', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '10.00',
      currency: 'BDT',
    });

    const outcome = await service.handleCallback(paidCallback(), {
      expect: { amount: 1000, currency: 'BDT' },
    });

    expect(outcome.state).toBe(PaymentState.Mismatch);
    expect(outcome.isPaid).toBe(false);
    expect(outcome.reason).toMatch(/amount mismatch/);
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.paymentMismatch);
  });

  it('flags a currency mismatch', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '1000.00',
      currency: 'USD',
    });

    const outcome = await service.handleCallback(paidCallback(), {
      expect: { amount: 1000, currency: 'BDT' },
    });

    expect(outcome.state).toBe(PaymentState.Mismatch);
    expect(outcome.reason).toMatch(/currency mismatch/);
  });

  it('rejects a val_id that validates against a different order', async () => {
    // The gateway confirms *a* transaction, not necessarily yours: without
    // the id cross-check, a val_id from any cheap order would validate here.
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'someone-elses-order',
      amount: '1000.00',
      currency: 'BDT',
    });

    const outcome = await service.handleCallback(paidCallback());

    expect(outcome.state).toBe(PaymentState.Mismatch);
    expect(outcome.reason).toMatch(/transaction id mismatch/);
  });

  it('cross-checks the order id even when the caller passes no expectations', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '1000.00',
      currency: 'BDT',
    });

    await expect(service.handleCallback(paidCallback())).resolves.toMatchObject({
      state: PaymentState.Paid,
    });
  });

  it('checks a foreign-currency order against what the customer was charged', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '11000.00',
      currency: 'BDT',
      currency_type: 'USD',
      currency_amount: '100.00',
    });

    const outcome = await service.handleCallback(paidCallback(), {
      expect: { amount: 100, currency: 'USD' },
    });

    expect(outcome.state).toBe(PaymentState.Paid);
    expect(outcome.amount).toBe(100);
    expect(outcome.currency).toBe('USD');
  });

  it('accepts the sub-unit rounding the gateway applies', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '999.50',
      currency: 'BDT',
    });

    const outcome = await service.handleCallback(paidCallback(), { expect: { amount: 1000 } });
    expect(outcome.state).toBe(PaymentState.Paid);
  });

  it('demands an exact amount when the store configures a zero tolerance', async () => {
    const strictClient = new FakeSslCommerzClient({ amountTolerance: 0 });
    strictClient.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '999.50',
      currency: 'BDT',
    });
    const strict = new SslCommerzService('default', strictClient, {}, events);

    const outcome = await strict.handleCallback(paidCallback(), { expect: { amount: 1000 } });
    expect(outcome.state).toBe(PaymentState.Mismatch);
  });

  it('compares money at two decimal places, not by float equality', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '1500.50',
      currency: 'BDT',
    });

    const outcome = await service.handleCallback(paidCallback(), {
      expect: { amount: 1500.5 },
    });

    expect(outcome.state).toBe(PaymentState.Paid);
  });

  it('resolves a cancel callback without a validation call', async () => {
    const outcome = await service.handleCallback(sign({ tran_id: 'order-1' }) as never, {
      channel: CallbackChannel.Cancel,
    });

    expect(outcome.state).toBe(PaymentState.Cancelled);
    expect(client.validate).not.toHaveBeenCalled();
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.paymentCancelled);
  });

  it('reports failed when a signed callback carries no val_id', async () => {
    const outcome = await service.handleCallback(
      sign({ tran_id: 'order-1', status: 'FAILED' }) as never,
    );

    expect(outcome.state).toBe(PaymentState.Failed);
    expect(outcome.reason).toMatch(/FAILED/);
  });

  it('honours skipSignatureCheck for a caller that authenticated another way', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Validated,
      tran_id: 'order-1',
      amount: '1000.00',
    });

    const outcome = await service.handleCallback(
      { tran_id: 'order-1', val_id: 'val-1' } as IpnPayloadDto,
      { skipSignatureCheck: true },
    );

    expect(outcome.state).toBe(PaymentState.Paid);
  });

  it('never lets a throwing listener break the payment', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '1000.00',
    });
    const angry = {
      emit: vi.fn(() => {
        throw new Error('listener exploded');
      }),
    };
    const withAngryListener = new SslCommerzService('default', client, {}, angry);

    const outcome = await withAngryListener.handleCallback(paidCallback());
    expect(outcome.state).toBe(PaymentState.Paid);
  });

  it('publishes nothing when events are disabled', async () => {
    client.validate.mockResolvedValue({
      status: TransactionStatus.Valid,
      tran_id: 'order-1',
      amount: '1000.00',
    });
    const quiet = new SslCommerzService('default', client, { events: { enabled: false } }, events);

    await quiet.handleCallback(paidCallback());
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('refunds', () => {
  it('emits refund.initiated when the gateway accepts', async () => {
    client.initiateRefund.mockResolvedValue({ status: 'success', refund_ref_id: 'r-1' });

    const reply = await service.initiateRefund({
      refund_amount: 500,
      refund_remarks: 'returned item',
      bank_tran_id: 'bank-1',
    });

    expect(reply.refund_ref_id).toBe('r-1');
    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.refundInitiated);
  });

  it('emits refund.failed when the gateway refuses', async () => {
    client.initiateRefund.mockResolvedValue({ status: 'failed', errorReason: 'already refunded' });

    await service.initiateRefund({
      refund_amount: 500,
      refund_remarks: 'returned item',
      bank_tran_id: 'bank-1',
    });

    expect(events.names()).toContain(SSLCOMMERZ_EVENTS.refundFailed);
  });
});

describe('signature helper', () => {
  it('verifies against the configured store password', () => {
    const payload = sign({ tran_id: 'order-1' });
    expect(service.verifySignature(payload).valid).toBe(true);

    const forged = { ...payload, verify_sign: createHash('md5').update('nope').digest('hex') };
    expect(service.verifySignature(forged).valid).toBe(false);
  });
});
