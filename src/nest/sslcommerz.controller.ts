/**
 * @file The built-in callback controller.
 *
 * Route paths are configuration, not constants, so the controller class is
 * built by a factory at module-definition time rather than declared once.
 *
 * SSLCommerz POSTs form-encoded bodies to these routes, so the app needs a
 * urlencoded body parser: Express (Nest's default) has one; on Fastify,
 * register `@fastify/formbody`. The customer-facing routes also answer GET,
 * because a store configured for "redirect only" sends the browser back with
 * a query string instead.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Redirect,
  type Type,
} from '@nestjs/common';

import { DEFAULT_ROUTES } from '../constants/default.constant';
import type { IpnPayloadDto } from '../dto/ipn.dto';
import { CallbackChannel } from '../enums/callback-channel.enum';
import { PaymentState } from '../enums/payment-state.enum';
import type { SslCommerzControllerOptions } from '../interfaces/module.interface';
import type { PaymentOutcome } from '../interfaces/payment.interface';
import type { SslCommerzService } from './sslcommerz.service';

/** What a callback route answers with when no redirect is configured. */
export interface CallbackResponse {
  received: true;
  state: string;
  isPaid: boolean;
  transactionId: string;
  amount?: number;
  currency?: string;
  reason?: string;
}

/**
 * Builds a controller that mounts the four gateway callback routes.
 *
 * @param options - Route paths, redirect targets and verification switches.
 * @param serviceToken - Injection token for the service the routes call.
 * @returns A controller class for the module's `controllers` array.
 */
export function createSslCommerzController(
  options: SslCommerzControllerOptions,
  serviceToken: string,
): Type<unknown> {
  const basePath = options.path ?? DEFAULT_ROUTES.path;
  const ipnPath = options.ipnPath ?? DEFAULT_ROUTES.ipn;
  const successPath = options.successPath ?? DEFAULT_ROUTES.success;
  const failPath = options.failPath ?? DEFAULT_ROUTES.fail;
  const cancelPath = options.cancelPath ?? DEFAULT_ROUTES.cancel;
  const redirect = options.redirect;
  const skipValidation = options.validateOnCallback === false;

  @Controller(basePath)
  class SslCommerzCallbackController {
    constructor(@Inject(serviceToken) private readonly service: SslCommerzService) {}

    /**
     * Server-to-server notification. Always answers 200: a non-2xx makes
     * SSLCommerz retry, and a forged or failed payment is not a reason to
     * ask for the same payload again.
     *
     * @param body - The IPN form fields.
     * @returns A summary of how the callback resolved.
     */
    @Post(ipnPath)
    @HttpCode(HttpStatus.OK)
    async ipn(@Body() body: IpnPayloadDto): Promise<CallbackResponse> {
      return summarise(await this.resolve(body, CallbackChannel.Ipn));
    }

    /**
     * Success return, as a POST (the gateway's default).
     *
     * @param body - The callback form fields.
     * @returns A redirect, or a summary when no redirect is configured.
     */
    @Post(successPath)
    async successPost(@Body() body: IpnPayloadDto): Promise<unknown> {
      return this.browser(body, CallbackChannel.Success);
    }

    /**
     * Success return, as a GET (stores configured for redirect-only).
     *
     * @param query - The callback query parameters.
     * @returns A redirect, or a summary when no redirect is configured.
     */
    @Get(successPath)
    async successGet(@Query() query: IpnPayloadDto): Promise<unknown> {
      return this.browser(query, CallbackChannel.Success);
    }

    /**
     * Failure return, as a POST.
     *
     * @param body - The callback form fields.
     * @returns A redirect, or a summary when no redirect is configured.
     */
    @Post(failPath)
    async failPost(@Body() body: IpnPayloadDto): Promise<unknown> {
      return this.browser(body, CallbackChannel.Fail);
    }

    /**
     * Failure return, as a GET.
     *
     * @param query - The callback query parameters.
     * @returns A redirect, or a summary when no redirect is configured.
     */
    @Get(failPath)
    async failGet(@Query() query: IpnPayloadDto): Promise<unknown> {
      return this.browser(query, CallbackChannel.Fail);
    }

    /**
     * Cancellation return, as a POST.
     *
     * @param body - The callback form fields.
     * @returns A redirect, or a summary when no redirect is configured.
     */
    @Post(cancelPath)
    async cancelPost(@Body() body: IpnPayloadDto): Promise<unknown> {
      return this.browser(body, CallbackChannel.Cancel);
    }

    /**
     * Cancellation return, as a GET.
     *
     * @param query - The callback query parameters.
     * @returns A redirect, or a summary when no redirect is configured.
     */
    @Get(cancelPath)
    async cancelGet(@Query() query: IpnPayloadDto): Promise<unknown> {
      return this.browser(query, CallbackChannel.Cancel);
    }

    /**
     * Resolves a callback through the service.
     *
     * @param payload - The callback body or query.
     * @param channel - Which route it arrived on.
     * @returns The verdict.
     */
    private async resolve(
      payload: IpnPayloadDto,
      channel: CallbackChannel,
    ): Promise<PaymentOutcome> {
      return this.service.handleCallback(payload, { channel, skipValidation });
    }

    /**
     * Resolves a customer-facing callback and decides where the browser goes.
     *
     * @param payload - The callback body or query.
     * @param channel - Which route it arrived on.
     * @returns A `{ url, statusCode }` redirect, or a summary object.
     */
    private async browser(payload: IpnPayloadDto, channel: CallbackChannel): Promise<unknown> {
      const outcome = await this.resolve(payload, channel);
      if (!redirect) {
        return summarise(outcome);
      }
      const target =
        outcome.state === PaymentState.Paid
          ? redirect.success
          : outcome.state === PaymentState.Cancelled
            ? redirect.cancel
            : redirect.fail;
      return { url: withOutcome(target, outcome), statusCode: HttpStatus.FOUND };
    }
  }

  if (redirect) {
    // @Redirect() is applied here rather than on the methods because the
    // routes must answer with JSON when no redirect target is configured,
    // and a @Redirect() handler that returns no url breaks the response.
    for (const method of [
      'successPost',
      'successGet',
      'failPost',
      'failGet',
      'cancelPost',
      'cancelGet',
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(
        SslCommerzCallbackController.prototype,
        method,
      );
      if (descriptor) {
        Redirect()(SslCommerzCallbackController.prototype, method, descriptor);
      }
    }
  }

  return SslCommerzCallbackController;
}

/**
 * Reduces an outcome to what is safe to return over HTTP — no validation
 * body, no signature detail, no raw payload.
 *
 * @param outcome - The resolved outcome.
 * @returns The response body.
 */
function summarise(outcome: PaymentOutcome): CallbackResponse {
  return {
    received: true,
    state: outcome.state,
    isPaid: outcome.isPaid,
    transactionId: outcome.transactionId,
    amount: outcome.amount,
    currency: outcome.currency,
    reason: outcome.reason,
  };
}

/**
 * Appends the order id and state to a redirect target, so the page the
 * customer lands on can show something specific. Nothing sensitive is
 * added — `val_id` in particular stays server-side.
 *
 * @param target - Configured redirect URL.
 * @param outcome - The resolved outcome.
 * @returns The URL to redirect to.
 */
function withOutcome(target: string, outcome: PaymentOutcome): string {
  try {
    const url = new URL(target);
    if (outcome.transactionId) {
      url.searchParams.set('tran_id', outcome.transactionId);
    }
    url.searchParams.set('status', outcome.state);
    return url.toString();
  } catch {
    // A relative path is a legitimate target; leave it exactly as given.
    return target;
  }
}
