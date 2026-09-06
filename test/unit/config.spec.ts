import { describe, expect, it } from 'vitest';

import {
  SSLCOMMERZ_LIVE_URL,
  SSLCOMMERZ_SANDBOX_URL,
  SslCommerzConfigurationError,
  describeSslCommerzTarget,
  resolveSslCommerzConfig,
  validateSslCommerzConfig,
} from '../../src';

const credentials = {
  SSLCOMMERZ_STORE_ID: 'testbox',
  SSLCOMMERZ_STORE_PASSWORD: 'testbox@ssl',
};

describe('resolveSslCommerzConfig', () => {
  it('reads the SSLCOMMERZ_* block from the environment', () => {
    const config = resolveSslCommerzConfig({
      env: { ...credentials, SSLCOMMERZ_TIMEOUT_MS: '2500' },
    });
    expect(config).toMatchObject({
      storeId: 'testbox',
      storePassword: 'testbox@ssl',
      sandbox: true,
      timeoutMs: 2_500,
    });
  });

  it('defaults to the sandbox gateway', () => {
    const config = resolveSslCommerzConfig({ env: credentials });
    expect(config.sandbox).toBe(true);
    expect(config.baseUrl).toBe(SSLCOMMERZ_SANDBOX_URL);
    expect(config.timeoutMs).toBe(15_000);
  });

  it('switches to the live host when the sandbox flag is off', () => {
    const config = resolveSslCommerzConfig({
      env: { ...credentials, SSLCOMMERZ_SANDBOX: 'false' },
    });
    expect(config.sandbox).toBe(false);
    expect(config.baseUrl).toBe(SSLCOMMERZ_LIVE_URL);
  });

  it('derives the host from an overridden sandbox flag, not just the env', () => {
    const config = resolveSslCommerzConfig({ overrides: { sandbox: false }, env: credentials });
    expect(config.baseUrl).toBe(SSLCOMMERZ_LIVE_URL);
  });

  it('lets an explicit baseUrl win over the derived host', () => {
    const config = resolveSslCommerzConfig({
      env: { ...credentials, SSLCOMMERZ_URL: 'https://proxy.internal' },
    });
    expect(config.baseUrl).toBe('https://proxy.internal');
    expect(config.sandbox).toBe(true);
  });

  it('lets overrides win over the environment', () => {
    const config = resolveSslCommerzConfig({
      overrides: { storeId: 'live_store' },
      env: credentials,
    });
    expect(config.storeId).toBe('live_store');
  });

  it('derives clientName from the service identity', () => {
    expect(resolveSslCommerzConfig({ env: { ...credentials, APP_NAME: 'core' } }).clientName).toBe(
      'core',
    );
    expect(
      resolveSslCommerzConfig({ serviceName: 'worker', env: { ...credentials, APP_NAME: 'core' } })
        .clientName,
    ).toBe('worker');
  });

  it('lists missing credentials in one error', () => {
    expect(() => resolveSslCommerzConfig({ env: {} })).toThrowError(
      /storeId is required.*storePassword is required/s,
    );
  });

  it('reads the amount tolerance from the environment', () => {
    expect(
      resolveSslCommerzConfig({ env: { ...credentials, SSLCOMMERZ_AMOUNT_TOLERANCE: '0' } })
        .amountTolerance,
    ).toBe(0);
  });

  it('defaults the amount tolerance to one unit', () => {
    expect(resolveSslCommerzConfig({ env: credentials }).amountTolerance).toBe(1);
  });

  it('rejects a negative amount tolerance', () => {
    expect(() =>
      resolveSslCommerzConfig({ env: { ...credentials, SSLCOMMERZ_AMOUNT_TOLERANCE: '-1' } }),
    ).toThrowError(/amountTolerance must be zero or greater/);
  });

  it('treats any sandbox value but the exact string "false" as sandbox', () => {
    // SSLCOMMERZ_SANDBOX=0 must not silently arm the live gateway.
    expect(
      resolveSslCommerzConfig({ env: { ...credentials, SSLCOMMERZ_SANDBOX: '0' } }).sandbox,
    ).toBe(true);
    expect(
      resolveSslCommerzConfig({ env: { ...credentials, SSLCOMMERZ_SANDBOX: 'FALSE' } }).sandbox,
    ).toBe(false);
  });

  it('throws when a numeric variable is not a number', () => {
    expect(() =>
      resolveSslCommerzConfig({ env: { ...credentials, SSLCOMMERZ_TIMEOUT_MS: 'soon' } }),
    ).toThrowError(SslCommerzConfigurationError);
  });
});

describe('validateSslCommerzConfig', () => {
  it('lists every problem in one error', () => {
    expect(() =>
      validateSslCommerzConfig({
        storeId: 'testbox',
        storePassword: 'testbox@ssl',
        sandbox: true,
        baseUrl: 'not-a-url',
        timeoutMs: 0,
      }),
    ).toThrowError(/baseUrl is not a valid URL.*timeoutMs must be a positive integer/s);
  });
});

describe('describeSslCommerzTarget', () => {
  it('names the environment and store without leaking the password', () => {
    const description = describeSslCommerzTarget({
      storeId: 'testbox',
      storePassword: 'testbox@ssl',
      sandbox: true,
      baseUrl: SSLCOMMERZ_SANDBOX_URL,
    });
    expect(description).toBe('https://sandbox.sslcommerz.com (sandbox, store=testbox)');
    expect(description).not.toContain('testbox@ssl');
  });
});
