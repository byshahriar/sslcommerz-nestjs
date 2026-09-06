# sslcommerz-nestjs

[![CI](https://github.com/byshahriar/sslcommerz-nestjs/actions/workflows/ci.yml/badge.svg)](https://github.com/byshahriar/sslcommerz-nestjs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sslcommerz-nestjs.svg)](https://www.npmjs.com/package/sslcommerz-nestjs)
[![node](https://img.shields.io/node/v/sslcommerz-nestjs.svg)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The SSLCommerz payment gateway as a first-class NestJS module: validated DTOs, a callback
controller, IPN signature verification, order verification, events, a guard, an exception filter
and a health indicator.

Everything a payment integration ends up writing anyway — written once, tested, and documented.

No runtime dependencies — it talks to the gateway over `fetch`.

```sh
npm i sslcommerz-nestjs class-validator class-transformer
```

Requires Node 20+ and NestJS 10 or 11. `class-validator` and `class-transformer` are peer
dependencies — the same pair a NestJS app already installs for its own `ValidationPipe`.

<details>
<summary>Installing from GitHub Packages instead</summary>

The package is published to both registries. GitHub Packages requires the owner's scope, so the
name differs there:

```sh
echo "@byshahriar:registry=https://npm.pkg.github.com" >> .npmrc
npm i @byshahriar/sslcommerz-nestjs
```

</details>

## Layout

Declarations are segregated by kind, implementations by layer:

```
src/
├─ constants/   endpoints, event names, DI tokens, defaults
├─ enums/       TransactionStatus, PaymentState, ProductProfile, ShippingMethod, RefundStatus, …
├─ interfaces/  config, client, gateway request/response, module options, events, payment verdicts
├─ types/       FetchLike, GatewayParams and other aliases
├─ errors/      SslCommerzError, SslCommerzConfigurationError, SslCommerzValidationError
├─ utils/       signature, money/order verification, status reading, form encoding, env parsing
├─ core/        the client, config resolution, health probes — no framework imports
├─ dto/         class-validator shapes and the flattener to gateway field names
└─ nest/        module, service, controller, guard, filter, health indicator, decorators
```

Dependencies point one way: `nest/ → dto/ → core/ → utils/ → interfaces|enums|constants|types`.

## Quick start

```ts
// app.module.ts
import { SslCommerzModule } from 'sslcommerz-nestjs';

@Module({
  imports: [
    SslCommerzModule.forRoot({
      controller: {
        path: 'payments/sslcommerz',
        redirect: {
          success: 'https://shop.example.com/checkout/done',
          fail: 'https://shop.example.com/checkout/failed',
          cancel: 'https://shop.example.com/cart',
        },
      },
    }),
  ],
})
export class AppModule {}
```

```dotenv
SSLCOMMERZ_STORE_ID=testbox
SSLCOMMERZ_STORE_PASSWORD=testbox@ssl
SSLCOMMERZ_SANDBOX=true
```

```ts
// checkout.service.ts
import { SslCommerzService } from 'sslcommerz-nestjs';

@Injectable()
export class CheckoutService {
  constructor(private readonly ssl: SslCommerzService) {}

  async pay(order: Order): Promise<string> {
    const { redirectUrl } = await this.ssl.createSession({
      amount: order.total,
      currency: 'BDT',
      transactionId: order.id,
      urls: {
        success: 'https://api.example.com/payments/sslcommerz/success',
        fail: 'https://api.example.com/payments/sslcommerz/fail',
        cancel: 'https://api.example.com/payments/sslcommerz/cancel',
        ipn: 'https://api.example.com/payments/sslcommerz/ipn',
      },
      product: { name: order.title, category: 'books', profile: 'physical-goods' },
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        address: order.customer.address,
        city: 'Dhaka',
        postcode: '1205',
        country: 'Bangladesh',
        phone: order.customer.phone,
      },
    });

    return redirectUrl; // send the customer here
  }
}
```

That's the whole happy path: the DTO is validated before a request is made, the session is opened,
and the callback controller handles what comes back.

## The callback controller

`controller: { … }` mounts six routes — SSLCommerz POSTs form bodies by default, and sends a GET
when the store is configured for redirect-only:

| Route | Method | Purpose |
| --- | --- | --- |
| `<path>/ipn` | POST | Server-to-server notification. Always answers 200. |
| `<path>/success` | POST, GET | Customer returns after paying |
| `<path>/fail` | POST, GET | Payment failed |
| `<path>/cancel` | POST, GET | Customer abandoned the gateway |

Every route runs the same sequence: **verify the signature → confirm with the gateway → compare →
publish an event**. With `redirect` configured the customer-facing routes 302 to your frontend
(with `?tran_id=…&status=…` appended); without it they answer JSON.

Paths are all configurable (`ipnPath`, `successPath`, `failPath`, `cancelPath`), as are
`verifySignature` and `validateOnCallback` — both default to `true` and there is no good reason to
turn either off.

**Body parsing:** Express (Nest's default) parses urlencoded bodies out of the box. On Fastify,
register [`@fastify/formbody`](https://github.com/fastify/fastify-formbody) or the routes receive
an empty body.

## Events

Every outcome is published. `EventEmitter2` from `@nestjs/event-emitter` satisfies the emitter
interface as-is:

```ts
SslCommerzModule.forRootAsync({
  imports: [EventEmitterModule.forRoot()],
  inject: [EventEmitter2],
  useFactory: (emitter: EventEmitter2) => ({ events: { emitter } }),
});
```

```ts
@Injectable()
export class OrderListener {
  @OnEvent(SSLCOMMERZ_EVENTS.paymentValidated)
  async onPaid(event: PaymentEvent): Promise<void> {
    await this.orders.markPaid(event.transactionId, event.bankTransactionId!);
  }
}
```

| Event | When |
| --- | --- |
| `sslcommerz.session.created` | A session was opened; nobody has paid yet |
| `sslcommerz.session.failed` | The gateway refused to open a session |
| `sslcommerz.callback.received` | A callback arrived, before any verification |
| `sslcommerz.callback.rejected` | Its signature didn't verify — treat as a forgery attempt |
| `sslcommerz.payment.validated` | **Confirmed paid.** The only event safe to fulfil on |
| `sslcommerz.payment.failed` | Didn't complete, or validation disagreed with the callback |
| `sslcommerz.payment.mismatch` | Validated, but for the wrong order, amount or currency |
| `sslcommerz.payment.cancelled` | Customer abandoned the gateway page |
| `sslcommerz.refund.initiated` | Refund accepted (often still processing at the bank) |
| `sslcommerz.refund.failed` | Refund refused |

Without an emitter, a private Node `EventEmitter` is provided under `getSslCommerzEmitterToken()`,
so listeners can still subscribe. A listener that throws is logged and swallowed — it can never
fail the payment that triggered it. `events: { enabled: false }` turns publication off entirely.

## Writing your own routes

Skip `controller` and wire it yourself. `SslCommerzIpnGuard` rejects forged callbacks before your
handler runs; `handleCallback` does the rest:

```ts
@Post('ipn')
@HttpCode(200)
@UseGuards(SslCommerzIpnGuard)
async ipn(@Body() body: IpnPayloadDto): Promise<{ ok: boolean }> {
  const order = await this.orders.find(body.tran_id);

  const outcome = await this.ssl.handleCallback(body, {
    skipSignatureCheck: true,            // the guard already checked
    expect: { amount: order.total, currency: 'BDT' },
  });

  if (outcome.isPaid) {
    await this.orders.markPaid(order.id, outcome.bankTransactionId!);
  }
  return { ok: true };                   // always 200, or SSLCommerz retries
}
```

`handleCallback` resolves to a `PaymentState`, and only `Paid` is safe to act on:

| State | Meaning |
| --- | --- |
| `PaymentState.Paid` | Signature verified, gateway confirmed, order and amounts agree |
| `PaymentState.Mismatch` | A real, validated payment — for the wrong order, amount or currency |
| `PaymentState.Failed` | Gateway says it didn't complete |
| `PaymentState.Cancelled` | Customer walked away |
| `PaymentState.Unverified` | Signature didn't verify. Possibly forged |

## What gets checked, and why

Confirming a payment is four checks, not one. Each exists because the previous one is
insufficient, and skipping any of them is a live way to lose money:

1. **Signature** — `verify_sign` reproduces against the store password. Rejects forged callbacks before a round trip.
2. **Status** — `VALID` or `VALIDATED` from a `validate()` call to the gateway. A callback's own status is not evidence.
3. **Order identity** — the validated `tran_id` equals the one you're fulfilling. The gateway confirms *a* transaction, not necessarily yours; without this, a `val_id` from any cheap order validates perfectly well. Checked automatically against the callback's own `tran_id`, even if you pass no `expect`.
4. **Amount and currency** — within `amountTolerance` (default 1 unit, which absorbs the gateway's rounding; set `0` to demand exactness). For an order in a currency other than the store's, the comparison uses `currency_amount`/`currency_type`: `amount` holds the settled figure in the store's currency and would fail every foreign-currency order.

Pass `expect: { amount, currency }` whenever you know the order total. Without it, checks 1–3 still
run, but a customer who edits the amount mid-flow resolves to `Paid`.

## Security

Payment callbacks are public URLs that anyone can POST to. This package's defaults assume that:

- **Signatures are verified** against `verify_sign` / `verify_key` (SSLCommerz's MD5 scheme), with a constant-time digest comparison.
- **A signature is not enough.** Every callback is confirmed with a `validate()` call to the gateway before it can resolve to `paid` — a signed payload is still a claim.
- **Amounts are compared** when you pass `expect`, at two decimal places rather than by float equality.
- **No request URL is ever logged or put in an error message.** Except for session init, SSLCommerz requires the store password in the query string; `describeSslCommerzTarget` logs the host, environment and store id only.
- **Callback responses are summaries** — no validation body, no signature detail, no raw payload.

Make your handlers idempotent: SSLCommerz retries IPNs, and the success redirect can land
alongside one.

## API

The client covers every SSLCommerz operation, named the way the gateway's documentation names them:

| Client method | Gateway call |
| --- | --- |
| `init(data)` | POST `/gwprocess/v4/api.php` |
| `validate({ val_id })` | GET `/validator/api/validationserverAPI.php` |
| `transactionQueryByTransactionId({ tran_id })` | GET `/validator/api/merchantTransIDvalidationAPI.php` |
| `transactionQueryBySessionId({ sessionkey })` | GET `/validator/api/merchantTransIDvalidationAPI.php` |
| `initiateRefund({ refund_amount, refund_remarks, bank_tran_id, refe_id? })` | GET `/validator/api/merchantTransIDvalidationAPI.php` |
| `refundQuery({ refund_ref_id })` | GET `/validator/api/merchantTransIDvalidationAPI.php` |

`SslCommerzService` wraps these with DTO validation and events — `createSession`, `validate`,
`handleCallback`, `initiateRefund`, `refundQuery`, `queryByTransactionId`, `queryBySessionId`,
`verifySignature`, `health` — and exposes the raw client as `.client` for anything it doesn't wrap.

**Refunds key on `bank_tran_id`** — the gateway's transaction id from the validation response, not
your own `tran_id`. Keep it when a payment validates; `PaymentOutcome.bankTransactionId` is it.

**A rejection is not an exception.** SSLCommerz answers HTTP 200 with `status: 'FAILED'` for
business refusals and, as in the SDK, that reply is returned to you. `SslCommerzError` is thrown
only for transport failures: non-2xx, network error, timeout, or a non-JSON body.

## DTOs

`CreateSessionDto` groups the gateway's flat `cus_*` / `ship_*` field list into `customer`,
`shipping`, `product` and `urls`, and `toSessionInitRequest` flattens it back at the boundary. Also
exported: `ValidateTransactionDto`, `InitiateRefundDto`, `RefundQueryDto`,
`TransactionQueryByIdDto`, `TransactionQueryBySessionDto`, `IpnPayloadDto`.

Enum-backed fields are validated against the gateway's fixed sets (`ProductProfile`,
`ShippingMethod`), so a typo fails locally instead of coming back as a gateway rejection.
Optional gateway features are modelled too:

```ts
await this.ssl.createSession({
  ...session,
  allowedPaymentMethods: ['visa', 'master', 'bkash'],   // multi_card_name
  emi: { enabled: true, maxInstalment: 9, selectedInstalment: 3 },
});
```

`createSession` validates its DTO itself and throws `SslCommerzValidationError` listing every bad
field, so it works the same whether or not you have a global `ValidationPipe`. Gateway fields the
DTO doesn't model go through `extra`, which is merged last.

## Multiple stores

```ts
imports: [
  SslCommerzModule.forRoot(),                                    // default
  SslCommerzModule.forRoot({ name: 'marketplace', config: { storeId, storePassword } }),
];
```

```ts
constructor(
  private readonly ssl: SslCommerzService,                        // default store
  @InjectSslCommerz('marketplace') private readonly market: SslCommerzService,
) {}
```

The default registration also provides `SslCommerzHealthIndicator` and `SslCommerzIpnGuard` under
their class tokens. Named registrations get `getSslCommerzServiceToken(name)`,
`getSslCommerzClientToken(name)` and `getSslCommerzEmitterToken(name)`.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `SSLCOMMERZ_STORE_ID` | — | Required |
| `SSLCOMMERZ_STORE_PASSWORD` | — | Required |
| `SSLCOMMERZ_SANDBOX` | `true` | Selects the host |
| `SSLCOMMERZ_URL` | derived | Pin a host or proxy |
| `SSLCOMMERZ_TIMEOUT_MS` | `15000` | Per-request bound |
| `SSLCOMMERZ_AMOUNT_TOLERANCE` | `1` | Allowed amount difference, in currency units |

SSLCommerz issues **separate credentials per environment**, so the flag and the credentials must
move together — flipping `SSLCOMMERZ_SANDBOX` alone points a test store at the live gateway.
Precedence per field, highest first: `forRoot({ config })` → environment → defaults. Missing
credentials fail fast at boot with every problem listed, and starting against the live gateway logs
a warning.

Other module options: `startup: { timeoutMs, required }`, `shutdownGraceMs`, `serviceName`,
`global`, and `options` (extra headers, or a `fetch` override for tests).

## Health

```ts
@Get('health')
@HealthCheck()
check() {
  return this.health.check([() => this.sslcommerz.isHealthy('sslcommerz')]);
}
```

`SslCommerzHealthIndicator` returns a terminus-shaped result without depending on terminus. It
proves the host answers — the probe carries no credentials, so it says nothing about whether they
are valid. Keep it non-critical.

## Exception filter

```ts
app.useGlobalFilters(new SslCommerzExceptionFilter());
```

Bad DTO → 400 (with the offending fields), gateway failure → 502, misconfigured store → 500. Works
on Express and Fastify.

## Outside NestJS

`core/` and `utils/` have no framework dependency:

```ts
import {
  createSslCommerzClient,
  resolveSslCommerzConfig,
  verifyIpnSignature,
  verifyOrder,
} from 'sslcommerz-nestjs';

const client = createSslCommerzClient(resolveSslCommerzConfig());
const session = await client.init({ /* … */ });

// The same four checks, without the framework:
if (verifyIpnSignature(payload, storePassword).valid) {
  const validation = await client.validate({ val_id: payload.val_id });
  const { valid, reason } = verifyOrder(validation, { transactionId, amount, currency });
}
```

## Tests

```sh
npm test                                         # unit tests, fully offline
TEST_SSLCOMMERZ_STORE_ID=testbox \
TEST_SSLCOMMERZ_STORE_PASSWORD=testbox@ssl \
  npm test                                       # + sandbox integration suite
```

The integration suite forces `sandbox: true`, so a live credential in the environment cannot move
real money.

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the setup
and what a good change looks like, and [AGENTS.md](AGENTS.md) for the invariants that must survive
a refactor. Release notes live in [CHANGELOG.md](CHANGELOG.md).

Found a security issue? Please report it privately: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © byshahriar
