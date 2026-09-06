import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ClientStatus,
  checkSslCommerzHealth,
  createSslCommerzClient,
  resolveSslCommerzConfig,
  type SslCommerzClient,
} from '../../src';

/**
 * Integration suite — runs only against the sandbox, with real test-store
 * credentials, e.g.
 *   TEST_SSLCOMMERZ_STORE_ID=testbox \
 *   TEST_SSLCOMMERZ_STORE_PASSWORD=testbox@ssl pnpm test
 *
 * It never runs against the live gateway: `sandbox` is forced on below, so a
 * stray live credential in the environment cannot move real money. Nothing
 * here completes a payment — a session is opened and then abandoned, which
 * costs nothing and settles nothing.
 */
const storeId = process.env.TEST_SSLCOMMERZ_STORE_ID;
const storePassword = process.env.TEST_SSLCOMMERZ_STORE_PASSWORD;
const configured = Boolean(storeId && storePassword);

describe.runIf(configured)('sslcommerz integration (sandbox)', () => {
  let client: SslCommerzClient;

  beforeAll(async () => {
    client = createSslCommerzClient(
      resolveSslCommerzConfig({
        overrides: {
          storeId,
          storePassword,
          sandbox: true,
          clientName: 'sslcommerz-nestjs-tests',
        },
        env: {},
      }),
    );
    await client.connect();
  });

  afterAll(async () => {
    await client?.close();
  });

  it('connects and reports healthy', async () => {
    expect(client.status).toBe(ClientStatus.Ready);
    const health = await checkSslCommerzHealth(client);
    expect(health).toMatchObject({ healthy: true, status: 'ready' });
  });

  it('opens a session and gets a gateway page url', async () => {
    const reply = await client.init({
      total_amount: 100,
      currency: 'BDT',
      tran_id: `it_${Date.now()}`,
      success_url: 'https://example.com/success',
      fail_url: 'https://example.com/fail',
      cancel_url: 'https://example.com/cancel',
      shipping_method: 'NO',
      product_name: 'Integration test',
      product_category: 'test',
      product_profile: 'general',
      cus_name: 'Test Customer',
      cus_email: 'test@example.com',
      cus_add1: 'Road 1',
      cus_city: 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: '01700000000',
    });

    expect(reply.status).toBe('SUCCESS');
    expect(reply.GatewayPageURL).toMatch(/^https:\/\//);
    expect(reply.sessionkey).toBeTruthy();
  });

  it('reports a structured reply for an unknown transaction', async () => {
    const reply = await client.transactionQueryByTransactionId({ tran_id: 'does-not-exist' });
    expect(reply.APIConnect).toBeTruthy();
  });

  it('rejects bad credentials with a FAILED status rather than throwing', async () => {
    const wrong = createSslCommerzClient({
      storeId: 'not-a-store',
      storePassword: 'not-a-password',
      sandbox: true,
      baseUrl: 'https://sandbox.sslcommerz.com',
    });
    const reply = await wrong.init({ tran_id: `it_${Date.now()}` } as never);
    expect(reply.status).toBe('FAILED');
  });
});

describe.runIf(!configured)('sslcommerz integration (skipped)', () => {
  it.skip('set TEST_SSLCOMMERZ_STORE_ID and TEST_SSLCOMMERZ_STORE_PASSWORD to run', () => {});
});
