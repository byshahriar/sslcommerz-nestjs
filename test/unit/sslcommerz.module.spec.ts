import { EventEmitter } from 'node:events';
import { Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ClientStatus,
  SSLCOMMERZ_EVENTS,
  SSLCOMMERZ_LIVE_URL,
  SslCommerzHealthIndicator,
  SslCommerzIpnGuard,
  SslCommerzModule,
  SslCommerzService,
  getSslCommerzClientToken,
  getSslCommerzEmitterToken,
  getSslCommerzServiceToken,
  type SslCommerzClient,
  type SslCommerzEventEmitter,
} from '../../src';
import { stubFetch } from '../helpers';

// A stubbed transport keeps unit tests off the gateway; the short startup
// timeout keeps a failed connect from slowing the suite down.
const offline = {
  config: { storeId: 'testbox', storePassword: 'testbox@ssl' },
  options: { fetch: stubFetch() },
  startup: { required: false, timeoutMs: 50 },
  shutdownGraceMs: 20,
};

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('SslCommerzModule.forRoot', () => {
  it('provides the client, the service and its class token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SslCommerzModule.forRoot({ ...offline })],
    }).compile();
    await moduleRef.init();

    const client = moduleRef.get<SslCommerzClient>(getSslCommerzClientToken());
    const service = moduleRef.get(SslCommerzService);

    expect(client.status).toBe(ClientStatus.Ready);
    expect(service).toBeInstanceOf(SslCommerzService);
    expect(service.client).toBe(client);
    expect(moduleRef.get(getSslCommerzServiceToken())).toBe(service);

    await moduleRef.close();
    expect(client.status).toBe(ClientStatus.Closed);
  });

  it('provides the health indicator and the IPN guard', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SslCommerzModule.forRoot({ ...offline })],
    }).compile();

    expect(moduleRef.get(SslCommerzHealthIndicator)).toBeInstanceOf(SslCommerzHealthIndicator);
    expect(moduleRef.get(SslCommerzIpnGuard)).toBeInstanceOf(SslCommerzIpnGuard);

    await moduleRef.close();
  });

  it('reports health in the shape terminus expects', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SslCommerzModule.forRoot({ ...offline })],
    }).compile();

    const result = await moduleRef.get(SslCommerzHealthIndicator).isHealthy('sslcommerz');

    expect(result.sslcommerz).toMatchObject({ status: 'up', environment: 'sandbox' });

    await moduleRef.close();
  });

  it('falls back to a private EventEmitter listeners can subscribe to', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SslCommerzModule.forRoot({ ...offline })],
    }).compile();

    const emitter = moduleRef.get<SslCommerzEventEmitter>(getSslCommerzEmitterToken());
    expect(emitter).toBeInstanceOf(EventEmitter);

    const seen: unknown[] = [];
    (emitter as EventEmitter).on(SSLCOMMERZ_EVENTS.sessionCreated, (payload) => seen.push(payload));
    emitter.emit(SSLCOMMERZ_EVENTS.sessionCreated, { transactionId: 'order-1' });
    expect(seen).toHaveLength(1);

    await moduleRef.close();
  });

  it('publishes to an emitter the app supplies (e.g. EventEmitter2)', async () => {
    const provided = new EventEmitter();
    const moduleRef = await Test.createTestingModule({
      imports: [SslCommerzModule.forRoot({ ...offline, events: { emitter: provided } })],
    }).compile();

    expect(moduleRef.get(getSslCommerzEmitterToken())).toBe(provided);

    await moduleRef.close();
  });

  it('registers a second store side by side under its own tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SslCommerzModule.forRoot({ ...offline }),
        SslCommerzModule.forRoot({ ...offline, name: 'marketplace' }),
      ],
    }).compile();

    const main = moduleRef.get<SslCommerzClient>(getSslCommerzClientToken());
    const marketplace = moduleRef.get<SslCommerzClient>(getSslCommerzClientToken('marketplace'));
    const marketplaceService = moduleRef.get<SslCommerzService>(
      getSslCommerzServiceToken('marketplace'),
    );

    expect(marketplace).not.toBe(main);
    expect(marketplaceService.name).toBe('marketplace');
    // The class token stays bound to the default store.
    expect(moduleRef.get(SslCommerzService).name).toBe('default');

    await moduleRef.close();
  });

  it('stamps the service identity into the client name', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SslCommerzModule.forRoot({ ...offline, serviceName: 'core', name: 'marketplace' })],
    }).compile();

    const client = moduleRef.get<SslCommerzClient>(getSslCommerzClientToken('marketplace'));
    expect(client.config.clientName).toBe('core:marketplace');

    await moduleRef.close();
  });
});

describe('module definition', () => {
  it('mounts no controller unless asked', () => {
    expect(SslCommerzModule.forRoot({ ...offline }).controllers).toEqual([]);
  });

  it('mounts the callback controller when configured', () => {
    const definition = SslCommerzModule.forRoot({
      ...offline,
      controller: { path: 'pay/ssl' },
    });
    expect(definition.controllers).toHaveLength(1);
  });

  it('honours controller.enabled: false', () => {
    const definition = SslCommerzModule.forRoot({
      ...offline,
      controller: { enabled: false, path: 'pay/ssl' },
    });
    expect(definition.controllers).toEqual([]);
  });

  it('is global by default and local when asked', () => {
    expect(SslCommerzModule.forRoot({ ...offline }).global).toBe(true);
    expect(SslCommerzModule.forRoot({ ...offline, global: false }).global).toBe(false);
  });
});

describe('SslCommerzModule.forRootAsync', () => {
  it('resolves options through useFactory with injected deps', async () => {
    @Module({
      providers: [{ provide: 'SSLCOMMERZ_LIVE', useValue: true }],
      exports: ['SSLCOMMERZ_LIVE'],
    })
    class DepsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        SslCommerzModule.forRootAsync({
          imports: [DepsModule],
          inject: ['SSLCOMMERZ_LIVE'],
          useFactory: (live: boolean) => ({
            ...offline,
            config: { ...offline.config, sandbox: !live },
          }),
        }),
      ],
    }).compile();

    const client = moduleRef.get<SslCommerzClient>(getSslCommerzClientToken());
    expect(client.config.sandbox).toBe(false);
    expect(client.config.baseUrl).toBe(SSLCOMMERZ_LIVE_URL);

    await moduleRef.close();
  });

  it('mounts the controller declared on the async options', () => {
    const definition = SslCommerzModule.forRootAsync({
      useFactory: () => ({ ...offline }),
      controller: { path: 'pay/ssl' },
    });
    expect(definition.controllers).toHaveLength(1);
  });
});
