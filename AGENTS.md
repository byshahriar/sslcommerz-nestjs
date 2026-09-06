# AGENTS.md — sslcommerz-nestjs

Working notes for anyone (human or agent) changing this package. Usage docs live in
[`README.md`](README.md); this file is about how to change the code without breaking the parts that
handle money.

## What this is

A NestJS integration for the SSLCommerz payment gateway. It owns four things: talking to the
gateway, proving a callback is genuine, turning that into a verdict an application can branch on,
and publishing an event for it. It deliberately owns nothing about orders — no persistence, no
idempotency store, no order state machine. Those belong to the application.

## Layout

Declarations are segregated by kind, implementations by layer:

- `constants/` — endpoints, event names, DI tokens, every default value.
- `enums/` — gateway vocabularies (`TransactionStatus`, `ProductProfile`, `ShippingMethod`, `RefundStatus`) and ours (`PaymentState`, `ClientStatus`, `CallbackChannel`).
- `interfaces/` — config, client, gateway request/response, module options, events, payment verdicts.
- `types/` — aliases only (`FetchLike`, `GatewayParams`).
- `errors/` — the three error classes.
- `utils/` — pure functions: signature, money and order verification, status reading, form encoding, env parsing.
- `core/` — the client, config resolution, health probes. No framework imports.
- `dto/` — `class-validator` shapes and the flattener to gateway field names.
- `nest/` — module, service, controller factory, guard, filter, health indicator, decorators.

Dependencies point one way: `nest/ → dto/ → core/ → utils/ → interfaces|enums|constants|types`.
Nothing below `core/` may import from above it. A new magic number belongs in
`constants/default.constant.ts`, not inline; a new gateway vocabulary belongs in an enum, not a
string union.

## Change discipline

Security first — these are not style preferences:

- **Never let a request URL reach a log, an error message or an exception.** SSLCommerz requires `store_passwd` in the query string on every call except session init. Errors name the operation (`validate — gateway responded 500`), never the url. `describeSslCommerzTarget` is the only sanctioned description of a target.
- **Never weaken the four checks in `handleCallback`** — signature, status, order identity, amount and currency. Each exists because the previous one is insufficient: a signature proves the payload wasn't forged, a status proves *a* payment happened, the id check proves it was *this* order, the amount check proves it was for the right sum. `skipValidation` and `skipSignatureCheck` are for callers who did the work elsewhere; they must stay opt-in and stay documented as untrustworthy.
- **The order-id cross-check defaults on.** `handleCallback` falls back to the callback's own `tran_id` when the caller passes no `expect`. Removing that default reopens the "validate someone else's cheaper transaction" hole.
- **Amount tolerance is deliberate, not sloppiness.** The gateway rounds; an exact comparison rejects genuine payments. It is configurable per store (`amountTolerance`), and `0` means exact. Don't quietly tighten or widen the default.
- **Foreign-currency orders compare against `currency_amount`/`currency_type`**, not `amount`/`currency` — the latter is the settled figure in the store's currency and would reject every foreign-currency payment. `resolveChargedAmount` owns that rule.
- **Refunds key on `bank_tran_id`**, not `tran_id` — an easy and expensive thing to get wrong.
- **A `FAILED` reply is not an exception.** SSLCommerz signals business rejections in the body with HTTP 200, so they are returned as data. `SslCommerzError` is transport-only. Changing this silently breaks every caller's control flow.
- **Callback responses stay summaries.** No validation body, no signature detail, no raw payload back over HTTP.
- **A listener must never break a payment.** Event emission is wrapped in try/catch on purpose.
- Response interfaces carry index signatures deliberately: SSLCommerz adds fields without versioning the API. Don't tighten them into exact shapes.
- Integration tests must force `sandbox: true`. Never add one that can run against the live gateway.
- Update [`README.md`](README.md) for any new or changed env var, default, endpoint, event, enum member or option.

## Tests

```bash
npm test          # unit suite, fully offline
npm run lint      # eslint, with --fix
npm run typecheck
```

Unit tests run offline — the transport is injected via `options.fetch`, never stubbed globally.
`test/helpers.ts` signs payloads the way the gateway does, so signature tests verify against the
documented algorithm rather than against our own implementation. `money.util.spec.ts` and
`status.util.spec.ts` pin the verification rules case by case; if you change a comparison, a named
test should be the thing that fails. The integration suite needs sandbox test-store credentials and
skips cleanly without them.

## Conventions

- Every exported symbol carries TSDoc: what it does, `@param`/`@returns`, and `@throws` where it can throw. Comments explain *why*, not what the next line already says.
- Every file opens with an `@file` block stating what lives there and, where it matters, what deliberately does not.
- Tests are named as sentences about behaviour (`rejects a val_id that validates against a different order`), not as method names.
