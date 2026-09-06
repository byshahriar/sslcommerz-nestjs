import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';

import { ClientStatus, SslCommerzClientLifecycle } from '../../src';
import { FakeSslCommerzClient } from '../helpers';

describe('SslCommerzClientLifecycle', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('connects the client at bootstrap', async () => {
    const client = new FakeSslCommerzClient();
    await new SslCommerzClientLifecycle('default', client, {}).onApplicationBootstrap();
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.status).toBe('ready');
  });

  it('skips connecting a client that is already ready', async () => {
    const client = new FakeSslCommerzClient();
    client.status = ClientStatus.Ready;
    await new SslCommerzClientLifecycle('default', client, {}).onApplicationBootstrap();
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('aborts bootstrap when a required client cannot connect', async () => {
    const client = new FakeSslCommerzClient();
    client.connect.mockRejectedValue(new Error('unauthorized'));
    await expect(
      new SslCommerzClientLifecycle('default', client, {}).onApplicationBootstrap(),
    ).rejects.toThrowError(/unauthorized/);
  });

  it('times out instead of stalling bootstrap forever', async () => {
    const client = new FakeSslCommerzClient();
    client.connect.mockReturnValue(new Promise(() => {}));
    await expect(
      new SslCommerzClientLifecycle('default', client, {
        startup: { timeoutMs: 20 },
      }).onApplicationBootstrap(),
    ).rejects.toThrowError(/not ready within 20ms/);
  });

  it('degrades gracefully when the client is not required', async () => {
    const client = new FakeSslCommerzClient();
    client.connect.mockRejectedValue(new Error('unreachable'));
    await expect(
      new SslCommerzClientLifecycle('default', client, {
        startup: { required: false },
      }).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
  });

  it('closes the client at shutdown', async () => {
    const client = new FakeSslCommerzClient();
    await new SslCommerzClientLifecycle('default', client, {}).onApplicationShutdown();
    expect(client.close).toHaveBeenCalledOnce();
    expect(client.status).toBe('closed');
  });

  it('gives up on a close that outlives the grace period', async () => {
    const client = new FakeSslCommerzClient();
    client.close.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    await new SslCommerzClientLifecycle('default', client, {
      shutdownGraceMs: 20,
    }).onApplicationShutdown();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
