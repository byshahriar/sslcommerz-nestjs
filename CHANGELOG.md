# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

Initial release.

### Added

- `SslCommerzModule` with `forRoot` / `forRootAsync`, multi-store registration, global toggle, and
  per-registration lifecycle (bootstrap readiness, graceful shutdown).
- `SslCommerzService` — session creation from a validated DTO, callback resolution, refunds and
  transaction queries.
- Gateway client covering every SSLCommerz operation: session init, order validation, transaction
  lookup by id or session key, refund initiation and refund status.
- Callback controller factory mounting IPN, success, fail and cancel routes on configurable paths,
  with optional browser redirects.
- IPN signature verification (`verify_sign` / `verify_key`) with a constant-time digest comparison.
- Order verification: status, transaction-id, amount and currency checks, with a configurable
  amount tolerance and correct handling of foreign-currency transactions.
- Events for every outcome, publishable through any `EventEmitter`-shaped emitter.
- `SslCommerzIpnGuard`, `SslCommerzExceptionFilter` and `SslCommerzHealthIndicator`.
- Validated DTOs for sessions, validation, queries and refunds, including EMI and payment-method
  restrictions.

[Unreleased]: https://github.com/byshahriar/sslcommerz-nestjs/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/byshahriar/sslcommerz-nestjs/releases/tag/v0.1.0
