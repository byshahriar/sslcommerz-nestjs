import { describe, expect, it, vi } from 'vitest';

import { ClientStatus, SslCommerzError, createSslCommerzClient } from '../../src';
import { queryOf, stubFetch, testConfig } from '../helpers';

describe('lifecycle surface', () => {
  it('starts idle, reports ready once connected, and closes', async () => {
    const client = createSslCommerzClient(testConfig, { fetch: stubFetch() });
    expect(client.status).toBe(ClientStatus.Idle);
    await client.connect();
    expect(client.status).toBe(ClientStatus.Ready);
    await client.close();
    expect(client.status).toBe(ClientStatus.Closed);
  });

  it('pings the host without sending credentials', async () => {
    const fetch = stubFetch();
    await createSslCommerzClient(testConfig, { fetch }).ping();

    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.toString()).toBe('https://sandbox.sslcommerz.com/');
    expect(url.searchParams.get('store_passwd')).toBeNull();
  });

  it('sends the service identity as User-Agent', async () => {
    const fetch = stubFetch();
    await createSslCommerzClient(testConfig, { fetch, headers: { 'x-trace': 'abc' } }).ping();
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      'user-agent': 'core',
      'x-trace': 'abc',
    });
  });
});

describe('init', () => {
  it('POSTs a form body with the store credentials merged in', async () => {
    const fetch = stubFetch(200, '{"status":"SUCCESS","GatewayPageURL":"https://pay/x"}');
    const client = createSslCommerzClient(testConfig, { fetch });

    const reply = await client.init({
      total_amount: 1000,
      currency: 'BDT',
      tran_id: 'order-1',
      success_url: 'https://shop/ok',
      fail_url: 'https://shop/no',
      cancel_url: 'https://shop/cancel',
      shipping_method: 'NO',
      product_name: 'Book',
      product_category: 'general',
      product_profile: 'general',
      cus_name: 'A Customer',
      cus_email: 'a@example.com',
      cus_add1: 'Road 1',
      cus_city: 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: '01700000000',
    });

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe('https://sandbox.sslcommerz.com/gwprocess/v4/api.php');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/x-www-form-urlencoded' });

    const body = new URLSearchParams(String(init?.body));
    expect(body.get('store_id')).toBe('testbox');
    expect(body.get('store_passwd')).toBe('testbox@ssl');
    expect(body.get('total_amount')).toBe('1000');
    expect(body.get('tran_id')).toBe('order-1');
    expect(reply.GatewayPageURL).toBe('https://pay/x');
  });

  it('returns a FAILED reply instead of throwing (SDK semantics)', async () => {
    const client = createSslCommerzClient(testConfig, {
      fetch: stubFetch(200, '{"status":"FAILED","failedreason":"Store Credential Error"}'),
    });
    const reply = await client.init({} as never);
    expect(reply.status).toBe('FAILED');
    expect(reply.failedreason).toBe('Store Credential Error');
  });
});

describe('validate', () => {
  it('GETs the validation endpoint with val_id and credentials', async () => {
    const fetch = stubFetch(200, '{"status":"VALID","amount":"1000.00"}');
    const client = createSslCommerzClient(testConfig, { fetch });

    const reply = await client.validate({ val_id: 'val-1' });

    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe('/validator/api/validationserverAPI.php');
    expect(queryOf(fetch)).toEqual({
      val_id: 'val-1',
      store_id: 'testbox',
      store_passwd: 'testbox@ssl',
      format: 'json',
    });
    expect(reply.status).toBe('VALID');
  });
});

describe('transaction queries', () => {
  it('queries by tran_id against the merchant endpoint', async () => {
    const fetch = stubFetch(200, '{"APIConnect":"DONE","no_of_trans_found":1,"element":[]}');
    await createSslCommerzClient(testConfig, { fetch }).transactionQueryByTransactionId({
      tran_id: 'order-1',
    });

    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe(
      '/validator/api/merchantTransIDvalidationAPI.php',
    );
    expect(queryOf(fetch)).toMatchObject({ tran_id: 'order-1', format: 'json' });
  });

  it('queries by sessionkey against the merchant endpoint', async () => {
    const fetch = stubFetch(200, '{"APIConnect":"DONE"}');
    await createSslCommerzClient(testConfig, { fetch }).transactionQueryBySessionId({
      sessionkey: 'sess-1',
    });
    expect(queryOf(fetch)).toMatchObject({ sessionkey: 'sess-1' });
  });
});

describe('refunds', () => {
  it('initiates a refund keyed by bank_tran_id', async () => {
    const fetch = stubFetch(200, '{"APIConnect":"DONE","status":"success","refund_ref_id":"r-1"}');
    const reply = await createSslCommerzClient(testConfig, { fetch }).initiateRefund({
      refund_amount: 500,
      refund_remarks: 'customer request',
      bank_tran_id: 'bank-1',
      refe_id: 'refund-1',
    });

    expect(queryOf(fetch)).toMatchObject({
      refund_amount: '500',
      refund_remarks: 'customer request',
      bank_tran_id: 'bank-1',
      refe_id: 'refund-1',
    });
    expect(reply.refund_ref_id).toBe('r-1');
  });

  it('queries a refund by refund_ref_id', async () => {
    const fetch = stubFetch(200, '{"APIConnect":"DONE","status":"refunded"}');
    await createSslCommerzClient(testConfig, { fetch }).refundQuery({ refund_ref_id: 'r-1' });
    expect(queryOf(fetch)).toMatchObject({ refund_ref_id: 'r-1' });
  });
});

describe('failure handling', () => {
  it('throws SslCommerzError on a non-2xx response, without leaking the url', async () => {
    const client = createSslCommerzClient(testConfig, { fetch: stubFetch(500, 'boom') });
    const error = await client.validate({ val_id: 'v' }).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(SslCommerzError);
    expect((error as Error).message).toBe('validate — gateway responded 500');
    expect((error as Error).message).not.toContain('testbox@ssl');
  });

  it('explains a non-JSON body rather than surfacing a syntax error', async () => {
    const client = createSslCommerzClient(testConfig, {
      fetch: stubFetch(200, '<html>Not Found</html>'),
    });
    await expect(client.refundQuery({ refund_ref_id: 'r' })).rejects.toThrowError(
      /refundQuery — gateway returned a non-JSON body/,
    );
  });

  it('throws SslCommerzError when the request itself fails', async () => {
    const client = createSslCommerzClient(testConfig, {
      fetch: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await expect(client.init({} as never)).rejects.toThrowError(/init failed: network down/);
  });

  it('aborts a request that outlives the timeout', async () => {
    const client = createSslCommerzClient(
      { ...testConfig, timeoutMs: 10 },
      {
        fetch: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      },
    );
    await expect(client.validate({ val_id: 'v' })).rejects.toThrowError(SslCommerzError);
  });

  it('drops undefined parameters instead of sending the string "undefined"', async () => {
    const fetch = stubFetch();
    await createSslCommerzClient(testConfig, { fetch }).validate({
      val_id: 'v',
      optional: undefined,
    });
    expect(queryOf(fetch)).not.toHaveProperty('optional');
  });
});
