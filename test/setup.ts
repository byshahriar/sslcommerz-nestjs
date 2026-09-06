/**
 * Vitest setup, run before every suite.
 *
 * NestJS dependency injection and `class-validator` both read decorator
 * metadata through `Reflect`, which Node does not provide on its own. An
 * application loads the polyfill in `main.ts`; the test suite loads it here.
 */
import 'reflect-metadata';
