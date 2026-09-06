# Contributing

Thanks for helping. This package handles payments, so the bar for a change is a little higher than
usual — the notes below are the shortest path to a mergeable pull request.

## Getting set up

```sh
npm install
npm run check     # lint, format, typecheck and the unit suite
```

Node 22 or newer (see `.nvmrc`). The unit suite runs entirely offline: the HTTP transport is
injected, so nothing reaches the gateway.

To exercise the integration suite, register for sandbox credentials at
[developer.sslcommerz.com](https://developer.sslcommerz.com/registration/) and run:

```sh
TEST_SSLCOMMERZ_STORE_ID=... TEST_SSLCOMMERZ_STORE_PASSWORD=... npm test
```

It forces `sandbox: true`, so a live credential in your environment cannot move real money.

## What a good change looks like

- **Tests come with it.** A behaviour change that no test would catch is a behaviour change nobody
  will notice breaking later. Name tests as sentences about behaviour.
- **Public API is documented.** Every exported symbol carries TSDoc with `@param`, `@returns` and
  `@throws` where it applies — ESLint enforces this for `src/`.
- **Comments explain why.** The code already says what it does.
- **Defaults stay safe.** Anything that makes it easier to accept an unverified payment needs a
  strong argument and an opt-in flag, not a changed default.

[`AGENTS.md`](AGENTS.md) lists the invariants that must survive a refactor — worth reading before
touching `utils/money.util.ts`, `utils/signature.util.ts` or `SslCommerzService.handleCallback`.

## Reporting a security issue

Please don't open a public issue. See [`SECURITY.md`](SECURITY.md).

## Commits and pull requests

Small, logically separate commits, present tense (`add refund status enum`). Update
[`CHANGELOG.md`](CHANGELOG.md) under *Unreleased* for anything a user would notice.
