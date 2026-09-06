import { ForbiddenException, Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CallbackChannel,
  PaymentState,
  SslCommerzIpnGuard,
  createSslCommerzController,
  type PaymentOutcome,
  type SslCommerzService,
} from '../../src';

/** A service stand-in that returns a fixed verdict. */
function fakeService(outcome: Partial<PaymentOutcome>): SslCommerzService {
  return {
    handleCallback: vi.fn(async () => ({
      state: PaymentState.Paid,
      isPaid: true,
      transactionId: 'order-1',
      signature: { valid: true },
      raw: {},
      ...outcome,
    })),
    verifySignature: vi.fn(() => ({ valid: true })),
  } as unknown as SslCommerzService;
}

/**
 * Instantiates the generated controller with a stub service.
 */
function controllerFor(
  options: Parameters<typeof createSslCommerzController>[0],
  outcome: Partial<PaymentOutcome> = {},
): { controller: any; service: SslCommerzService } {
  const Controller = createSslCommerzController(options, 'TOKEN') as new (
    service: SslCommerzService,
  ) => any;
  const service = fakeService(outcome);
  return { controller: new Controller(service), service };
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('callback controller', () => {
  it('answers the IPN route with a summary and never the raw payload', async () => {
    const { controller } = controllerFor({}, { amount: 1000, currency: 'BDT' });

    const response = await controller.ipn({ tran_id: 'order-1' });

    expect(response).toEqual({
      received: true,
      state: PaymentState.Paid,
      isPaid: true,
      transactionId: 'order-1',
      amount: 1000,
      currency: 'BDT',
      reason: undefined,
    });
    expect(response).not.toHaveProperty('raw');
    expect(response).not.toHaveProperty('signature');
  });

  it('tells the service which route a callback arrived on', async () => {
    const { controller, service } = controllerFor({});

    await controller.cancelPost({ tran_id: 'order-1' });

    expect(service.handleCallback).toHaveBeenCalledWith(
      { tran_id: 'order-1' },
      expect.objectContaining({ channel: CallbackChannel.Cancel }),
    );
  });

  it('answers with JSON when no redirect is configured', async () => {
    const { controller } = controllerFor({});
    await expect(controller.successPost({ tran_id: 'order-1' })).resolves.toMatchObject({
      received: true,
    });
  });

  it('redirects a paid customer to the success url, tagged with the order id', async () => {
    const { controller } = controllerFor({
      redirect: {
        success: 'https://shop.example.com/done',
        fail: 'https://shop.example.com/failed',
        cancel: 'https://shop.example.com/cart',
      },
    });

    const response = await controller.successPost({ tran_id: 'order-1' });

    expect(response).toEqual({
      url: 'https://shop.example.com/done?tran_id=order-1&status=paid',
      statusCode: 302,
    });
  });

  it('sends an unverified callback to the failure url, not the success one', async () => {
    const { controller } = controllerFor(
      {
        redirect: {
          success: 'https://shop.example.com/done',
          fail: 'https://shop.example.com/failed',
          cancel: 'https://shop.example.com/cart',
        },
      },
      { state: PaymentState.Unverified, isPaid: false },
    );

    const response = await controller.successPost({ tran_id: 'order-1' });
    expect(response.url).toMatch(/^https:\/\/shop\.example\.com\/failed/);
  });

  it('sends a cancellation to the cancel url', async () => {
    const { controller } = controllerFor(
      {
        redirect: {
          success: 'https://shop.example.com/done',
          fail: 'https://shop.example.com/failed',
          cancel: 'https://shop.example.com/cart',
        },
      },
      { state: PaymentState.Cancelled, isPaid: false },
    );

    const response = await controller.cancelGet({ tran_id: 'order-1' });
    expect(response.url).toMatch(/^https:\/\/shop\.example\.com\/cart/);
  });

  it('leaves a relative redirect target untouched', async () => {
    const { controller } = controllerFor({
      redirect: { success: '/checkout/done', fail: '/checkout/failed', cancel: '/cart' },
    });

    const response = await controller.successPost({ tran_id: 'order-1' });
    expect(response.url).toBe('/checkout/done');
  });

  it('passes validateOnCallback: false through as skipValidation', async () => {
    const { controller, service } = controllerFor({ validateOnCallback: false });

    await controller.ipn({ tran_id: 'order-1' });

    expect(service.handleCallback).toHaveBeenCalledWith(
      { tran_id: 'order-1' },
      expect.objectContaining({ skipValidation: true }),
    );
  });
});

describe('SslCommerzIpnGuard', () => {
  /** Builds an execution context around a request body. */
  function contextFor(body: unknown): any {
    return { switchToHttp: () => ({ getRequest: () => ({ body }) }) };
  }

  it('allows a callback whose signature verifies', () => {
    const service = fakeService({});
    expect(new SslCommerzIpnGuard(service).canActivate(contextFor({ tran_id: 'x' }))).toBe(true);
  });

  it('rejects a callback whose signature does not verify', () => {
    const service = {
      verifySignature: vi.fn(() => ({ valid: false, reason: 'verify_sign does not match' })),
    } as unknown as SslCommerzService;

    expect(() => new SslCommerzIpnGuard(service).canActivate(contextFor({ tran_id: 'x' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no body at all', () => {
    const service = {
      verifySignature: vi.fn(() => ({ valid: false, reason: 'payload carries no verify_sign' })),
    } as unknown as SslCommerzService;

    expect(() => new SslCommerzIpnGuard(service).canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
