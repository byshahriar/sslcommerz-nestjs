# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/byshahriar/sslcommerz-nestjs/security/advisories/new)
rather than opening a public issue. Include the version, a description of the impact, and
reproduction steps if you have them. You can expect an initial response within a few days.

## What this package guarantees

- **Store credentials never reach a log, an error message or an exception.** SSLCommerz requires
  `store_passwd` in the query string on every call except session init, so no request URL is ever
  logged or embedded in an error. Log lines describe a target as host, environment and store id.
- **Callbacks are verified before they can be believed.** `verify_sign` is checked against the
  store password with a constant-time digest comparison, and a signed payload is still confirmed
  with a validation call to the gateway before it can resolve to a paid state.
- **A validated payment is checked against the order** — transaction id, amount and currency — so a
  `val_id` belonging to a different transaction cannot be replayed against your order.
- **Callback responses are summaries.** No validation body, signature detail or raw payload is
  echoed back over HTTP.

## What it does not

- It does not store anything, so it cannot make your handlers idempotent. SSLCommerz retries IPNs,
  and a success redirect can arrive alongside one — deduplicate on your side.
- The health probe carries no credentials, so a healthy result says nothing about whether they are
  valid.
- `skipSignatureCheck` and `skipValidation` disable the guarantees above. They exist for callers
  that verified separately; using them otherwise means trusting an unauthenticated public POST.

## Supported versions

The latest minor release receives security fixes.
