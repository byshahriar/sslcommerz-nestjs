/**
 * @file Maps this package's errors onto HTTP responses.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import {
  SslCommerzConfigurationError,
  SslCommerzError,
  SslCommerzValidationError,
} from '../errors/sslcommerz.error';

/**
 * Turns gateway failures into honest status codes:
 *
 * - a bad DTO is the caller's fault — 400;
 * - a gateway that timed out or answered badly is not the caller's fault — 502;
 * - a misconfigured store is ours — 500.
 *
 * Messages are passed through unchanged, which is safe: this package's
 * errors never contain a request URL (the store password rides in the query
 * string on most calls).
 *
 * @example
 * ```ts
 * app.useGlobalFilters(new SslCommerzExceptionFilter());
 * ```
 */
@Catch(SslCommerzError, SslCommerzConfigurationError, SslCommerzValidationError)
export class SslCommerzExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('SslCommerz');

  /**
   * Writes the mapped response.
   *
   * @param exception - The caught error.
   * @param host - Arguments host for the current context.
   */
  catch(
    exception: SslCommerzError | SslCommerzConfigurationError | SslCommerzValidationError,
    host: ArgumentsHost,
  ): void {
    const status = statusFor(exception);
    if (status >= 500) {
      this.logger.error(exception.message);
    }

    const body = {
      statusCode: status,
      error: exception.name,
      message: exception.message,
      ...(exception instanceof SslCommerzValidationError && exception.details.length > 0
        ? { details: exception.details }
        : {}),
    };

    const context = host.switchToHttp();
    const response = context.getResponse<{
      status?: (code: number) => { json: (body: unknown) => void };
      code?: (code: number) => { send: (body: unknown) => void };
    }>();

    // Express exposes status().json(); Fastify exposes code().send().
    if (typeof response.status === 'function') {
      response.status(status).json(body);
      return;
    }
    if (typeof response.code === 'function') {
      response.code(status).send(body);
      return;
    }
    throw new HttpException(body, status);
  }
}

/**
 * Chooses the status code for an error.
 *
 * @param exception - The caught error.
 * @returns The HTTP status to answer with.
 */
function statusFor(exception: Error): number {
  if (exception instanceof SslCommerzValidationError) {
    return HttpStatus.BAD_REQUEST;
  }
  if (exception instanceof SslCommerzConfigurationError) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  return HttpStatus.BAD_GATEWAY;
}
