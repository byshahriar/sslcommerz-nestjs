import { describe, expect, it } from 'vitest';

import { ClientStatus, checkSslCommerzHealth } from '../../src';
import { FakeSslCommerzClient } from '../helpers';

describe('checkSslCommerzHealth', () => {
  it('reports healthy with latency and status when the ping succeeds', async () => {
    const client = new FakeSslCommerzClient();
    client.status = ClientStatus.Ready;
    const health = await checkSslCommerzHealth(client);
    expect(health).toMatchObject({ healthy: true, status: 'ready' });
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.error).toBeUndefined();
  });

  it('reports unhealthy with the failure message when the ping fails', async () => {
    const client = new FakeSslCommerzClient();
    client.ping.mockRejectedValue(new Error('Connection refused'));
    const health = await checkSslCommerzHealth(client);
    expect(health).toMatchObject({ healthy: false, status: 'idle' });
    expect(health.error).toContain('Connection refused');
  });

  it('times out instead of hanging forever', async () => {
    const client = new FakeSslCommerzClient();
    client.ping.mockReturnValue(new Promise(() => {}));
    const health = await checkSslCommerzHealth(client, 20);
    expect(health.healthy).toBe(false);
    expect(health.error).toMatch(/timed out after 20ms/);
  });
});
