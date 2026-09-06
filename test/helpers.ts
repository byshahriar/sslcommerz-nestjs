/**
 * Shared test doubles: a transport stub, a signing helper that reproduces
 * the gateway's own algorithm, and an in-memory client — so unit tests never
 * reach the gateway.
 */
import { createHash } from 'node:crypto';
import { vi, type Mock } from 'vitest';

import {
  ClientStatus,
  ProductProfile,
  type FetchLike,
  type SslCommerzClient,
  type SslCommerzConfig,
} from '../src';

/** Baseline config used across unit tests. */
export const testConfig: SslCommerzConfig = {
  storeId: 'testbox',
  storePassword: 'testbox@ssl',
  sandbox: true,
  baseUrl: 'https://sandbox.sslcommerz.com',
  timeoutMs: 5_000,
  amountTolerance: 1,
  clientName: 'core',
};

/**
 * A transport that answers every request with the given status and body.
 *
 * @param status - HTTP status to answer with. @default 200
 * @param body - Response body. @default '{"status":"SUCCESS"}'
 * @returns A mock usable as `options.fetch`.
 */
export function stubFetch(status = 200, body = '{"status":"SUCCESS"}'): Mock<FetchLike> {
  return vi.fn<FetchLike>(async () => new Response(body, { status }));
}

/**
 * The query parameters of the request a stub recorded.
 *
 * @param fetch - The transport stub to read.
 * @param call - Index of the call to read. @default 0
 * @returns The url's query parameters as a plain object.
 */
export function queryOf(fetch: Mock<FetchLike>, call = 0): Record<string, string> {
  const url = new URL(String(fetch.mock.calls[call][0]));
  return Object.fromEntries(url.searchParams);
}

/**
 * Signs a payload the way SSLCommerz signs an IPN, so signature tests verify
 * against the documented algorithm rather than against our implementation.
 *
 * @param fields - The fields to sign.
 * @param storePassword - Store password to sign with. @default the test store's
 * @returns The fields plus `verify_key` and `verify_sign`.
 */
export function sign(
  fields: Record<string, string>,
  storePassword: string = testConfig.storePassword,
): Record<string, string> {
  const hashFields: Record<string, string> = {
    ...fields,
    store_passwd: createHash('md5').update(storePassword).digest('hex'),
  };
  const hashString = Object.keys(hashFields)
    .sort()
    .map((key) => `${key}=${hashFields[key]}`)
    .join('&');

  return {
    ...fields,
    verify_key: Object.keys(fields).join(','),
    verify_sign: createHash('md5').update(hashString).digest('hex'),
  };
}

/** Minimal stand-in for a client, driven by tests. */
export class FakeSslCommerzClient implements SslCommerzClient {
  config: SslCommerzConfig;
  status: ClientStatus = ClientStatus.Idle;
  connect: Mock = vi.fn(async () => {
    this.status = ClientStatus.Ready;
  });
  ping: Mock = vi.fn(async () => {});
  close: Mock = vi.fn(async () => {
    this.status = ClientStatus.Closed;
  });
  init: Mock = vi.fn(async () => ({ status: 'SUCCESS' }));
  validate: Mock = vi.fn(async () => ({ status: 'VALID' }));
  initiateRefund: Mock = vi.fn(async () => ({ status: 'success' }));
  refundQuery: Mock = vi.fn(async () => ({ status: 'refunded' }));
  transactionQueryByTransactionId: Mock = vi.fn(async () => ({ APIConnect: 'DONE' }));
  transactionQueryBySessionId: Mock = vi.fn(async () => ({ APIConnect: 'DONE' }));

  constructor(config: Partial<SslCommerzConfig> = {}) {
    this.config = { ...testConfig, ...config };
  }
}

/** A complete, valid session request used across service and DTO tests. */
export const validSession = {
  amount: 1000,
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
