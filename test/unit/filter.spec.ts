import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  SslCommerzConfigurationError,
  SslCommerzError,
  SslCommerzExceptionFilter,
  SslCommerzValidationError,
} from '../../src';

/** An Express-shaped response recorder. */
function expressResponse() {
  let captured: unknown;
  let status = 0;
  const json = vi.fn((body: unknown) => {
    captured = body;
  });
  const statusFn = vi.fn((value: number) => {
    status = value;
    return { json };
  });
  return { status: statusFn, body: () => captured, code: () => status };
}

/** An arguments host wrapping a response object. */
function hostFor(response: unknown): any {
  return { switchToHttp: () => ({ getResponse: () => response }) };
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('SslCommerzExceptionFilter', () => {
  it('maps a gateway failure to 502 — not the caller’s fault', () => {
    const response = expressResponse();
    new SslCommerzExceptionFilter().catch(
      new SslCommerzError('validate — gateway responded 500'),
      hostFor(response),
    );

    expect(response.code()).toBe(502);
    expect(response.body()).toMatchObject({
      statusCode: 502,
      error: 'SslCommerzError',
      message: 'validate — gateway responded 500',
    });
  });

  it('maps a bad DTO to 400 and lists the offending fields', () => {
    const response = expressResponse();
    new SslCommerzExceptionFilter().catch(
      new SslCommerzValidationError('Invalid session request: amount must be positive', [
        'amount must be positive',
      ]),
      hostFor(response),
    );

    expect(response.code()).toBe(400);
    expect(response.body()).toMatchObject({ details: ['amount must be positive'] });
  });

  it('maps a misconfigured store to 500', () => {
    const response = expressResponse();
    new SslCommerzExceptionFilter().catch(
      new SslCommerzConfigurationError('storeId is required'),
      hostFor(response),
    );
    expect(response.code()).toBe(500);
  });

  it('speaks Fastify’s code().send() as well', () => {
    let sent: unknown;
    let status = 0;
    const fastify = {
      code: (value: number) => {
        status = value;
        return {
          send: (body: unknown) => {
            sent = body;
          },
        };
      },
    };

    new SslCommerzExceptionFilter().catch(new SslCommerzError('boom'), hostFor(fastify));

    expect(status).toBe(502);
    expect(sent).toMatchObject({ statusCode: 502 });
  });
});
