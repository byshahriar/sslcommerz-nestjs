import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateSessionDto, ProductProfile, ShippingMethod, toSessionInitRequest } from '../../src';

const validSession = {
  amount: 1500.5,
  currency: 'BDT',
  transactionId: 'order-1',
  urls: {
    success: 'https://shop.example.com/ok',
    fail: 'https://shop.example.com/no',
    cancel: 'https://shop.example.com/cart',
    ipn: 'https://shop.example.com/ipn',
  },
  product: { name: 'Paperback', category: 'books', profile: ProductProfile.PhysicalGoods },
  customer: {
    name: 'A Customer',
    email: 'customer@example.com',
    address: 'Road 1, House 2',
    city: 'Dhaka',
    postcode: '1205',
    country: 'Bangladesh',
    phone: '01700000000',
  },
};

/**
 * Validates a plain object as a CreateSessionDto.
 */
function check(input: unknown): string[] {
  const dto = plainToInstance(CreateSessionDto, input);
  return validateSync(dto, { whitelist: true, forbidUnknownValues: false }).flatMap((error) => [
    error.property,
    ...(error.children ?? []).map((child) => `${error.property}.${child.property}`),
  ]);
}

describe('CreateSessionDto', () => {
  it('accepts a complete session request', () => {
    expect(check(validSession)).toEqual([]);
  });

  it('rejects a negative amount', () => {
    expect(check({ ...validSession, amount: -5 })).toContain('amount');
  });

  it('rejects more than two decimal places on money', () => {
    expect(check({ ...validSession, amount: 10.123 })).toContain('amount');
  });

  it('rejects a malformed customer email through the nested DTO', () => {
    expect(
      check({ ...validSession, customer: { ...validSession.customer, email: 'not-an-email' } }),
    ).toContain('customer.email');
  });

  it('rejects a product profile the gateway does not accept', () => {
    expect(
      check({ ...validSession, product: { ...validSession.product, profile: 'made-up' } }),
    ).toContain('product.profile');
  });

  it('rejects a shipping method outside the gateway\u2019s fixed set', () => {
    expect(check({ ...validSession, shippingMethod: 'DRONE' })).toContain('shippingMethod');
  });

  it('rejects an empty allowed-payment-method list', () => {
    expect(check({ ...validSession, allowedPaymentMethods: [] })).toContain(
      'allowedPaymentMethods',
    );
  });

  it('rejects a fractional EMI instalment count', () => {
    expect(check({ ...validSession, emi: { enabled: true, maxInstalment: 1.5 } })).toContain(
      'emi.maxInstalment',
    );
  });

  it('rejects a callback url that is not a url', () => {
    expect(check({ ...validSession, urls: { ...validSession.urls, success: 'nope' } })).toContain(
      'urls.success',
    );
  });

  it('rejects a currency code that is not three characters', () => {
    expect(check({ ...validSession, currency: 'TAKA' })).toContain('currency');
  });
});

describe('toSessionInitRequest', () => {
  it('flattens nested DTOs into the gateway field names', () => {
    const request = toSessionInitRequest(plainToInstance(CreateSessionDto, validSession));

    expect(request).toMatchObject({
      total_amount: 1500.5,
      currency: 'BDT',
      tran_id: 'order-1',
      success_url: 'https://shop.example.com/ok',
      ipn_url: 'https://shop.example.com/ipn',
      product_name: 'Paperback',
      product_profile: ProductProfile.PhysicalGoods,
      cus_name: 'A Customer',
      cus_email: 'customer@example.com',
      cus_add1: 'Road 1, House 2',
      cus_city: 'Dhaka',
      cus_phone: '01700000000',
    });
  });

  it('defaults shipping_method from whether a shipping address was given', () => {
    const digital = toSessionInitRequest(plainToInstance(CreateSessionDto, validSession));
    expect(digital.shipping_method).toBe(ShippingMethod.No);

    const shipped = toSessionInitRequest(
      plainToInstance(CreateSessionDto, {
        ...validSession,
        shipping: {
          name: 'A Customer',
          address: 'Road 1',
          city: 'Dhaka',
          postcode: '1205',
          country: 'Bangladesh',
          itemCount: 2,
        },
      }),
    );
    expect(shipped.shipping_method).toBe(ShippingMethod.Yes);
    expect(shipped.ship_name).toBe('A Customer');
    expect(shipped.num_of_item).toBe(2);
  });

  it('joins allowed payment methods into multi_card_name', () => {
    const request = toSessionInitRequest(
      plainToInstance(CreateSessionDto, {
        ...validSession,
        allowedPaymentMethods: ['visa', 'master', 'bkash'],
      }),
    );
    expect(request.multi_card_name).toBe('visa,master,bkash');
  });

  it('omits multi_card_name entirely when no methods are restricted', () => {
    const request = toSessionInitRequest(plainToInstance(CreateSessionDto, validSession));
    expect(request.multi_card_name).toBeUndefined();
  });

  it('renders EMI flags as the 1/0 the gateway expects', () => {
    const request = toSessionInitRequest(
      plainToInstance(CreateSessionDto, {
        ...validSession,
        emi: { enabled: true, maxInstalment: 9, selectedInstalment: 3, allowOnly: false },
      }),
    );
    expect(request.emi_option).toBe(1);
    expect(request.emi_allow_only).toBe(0);
    expect(request.emi_max_inst_option).toBe(9);
    expect(request.emi_selected_inst).toBe(3);
  });

  it('leaves EMI fields out when the caller sets none', () => {
    const request = toSessionInitRequest(plainToInstance(CreateSessionDto, validSession));
    expect(request.emi_option).toBeUndefined();
    expect(request.emi_allow_only).toBeUndefined();
  });

  it('passes through extra gateway fields last so they can override', () => {
    const request = toSessionInitRequest(
      plainToInstance(CreateSessionDto, {
        ...validSession,
        valueA: 'internal-ref',
        extra: { emi_option: 1, shipping_method: 'Courier' },
      }),
    );
    expect(request.value_a).toBe('internal-ref');
    expect(request.emi_option).toBe(1);
    expect(request.shipping_method).toBe('Courier');
  });
});
