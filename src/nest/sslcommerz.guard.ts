/**
 * @file A guard that rejects unsigned or forged gateway callbacks.
 *
 * For applications that write their own IPN route instead of mounting the
 * built-in controller. It checks `verify_sign` only — a signed payload is
 * still just a claim, so the handler must go on to call
 * `SslCommerzService.handleCallback` (or `validate`) before fulfilling.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { SslCommerzService } from './sslcommerz.service';

/**
 * Verifies the SSLCommerz signature on the request body.
 *
 * @example
 * ```ts
 * @Post('ipn')
 * @UseGuards(SslCommerzIpnGuard)
 * async ipn(@Body() body: IpnPayloadDto) {
 *   const outcome = await this.ssl.handleCallback(body, { skipSignatureCheck: true });
 * }
 * ```
 */
@Injectable()
export class SslCommerzIpnGuard implements CanActivate {
  private readonly logger = new Logger('SslCommerzIpnGuard');

  constructor(private readonly service: SslCommerzService) {}

  /**
   * Allows the request only when the body's signature reproduces.
   *
   * @param context - The execution context.
   * @returns True when the callback is genuine.
   * @throws {ForbiddenException} When the signature is missing or wrong.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ body?: Record<string, unknown> }>();
    const body = request.body ?? {};
    const result = this.service.verifySignature(body);

    if (!result.valid) {
      // Log the order id, never the payload: it carries the signature and
      // the customer's details.
      this.logger.warn(
        `Rejected callback for ${String(body.tran_id ?? '(no tran_id)')}: ${result.reason}`,
      );
      throw new ForbiddenException('Invalid SSLCommerz signature');
    }
    return true;
  }
}
