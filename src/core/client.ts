/**
 * @file The gateway client — one method per SSLCommerz operation, named the
 * way the gateway's own documentation names them.
 *
 * Three properties every method shares:
 *
 * - **Bounded.** Every request aborts at `timeoutMs`; a gateway that stops
 *   answering can never hang a checkout.
 * - **Honest about failure.** Transport problems — a non-2xx, a dropped
 *   connection, a timeout, an HTML error page — raise
 *   {@link SslCommerzError}. They are not folded into the return value.
 * - **Transparent about rejection.** SSLCommerz signals business-level
 *   refusals in the body (HTTP 200 with `status: 'FAILED'`), not in the
 *   status code, so those are returned to the caller rather than thrown.
 *   Check `status` on the result.
 *
 * The transport itself is injectable, which is what lets the whole suite run
 * without a network.
 */
import { DEFAULT_TIMEOUT_MS } from '../constants/default.constant';
import { SSLCOMMERZ_ENDPOINTS } from '../constants/endpoint.constant';
import { ClientStatus } from '../enums/client-status.enum';
import { SslCommerzError } from '../errors/sslcommerz.error';
import type { SslCommerzClient, SslCommerzClientOptions } from '../interfaces/client.interface';
import type { SslCommerzConfig } from '../interfaces/config.interface';
import type {
  RefundInitiateRequest,
  RefundInitiateResponse,
  RefundQueryResponse,
  SessionInitRequest,
  SessionInitResponse,
  TransactionQueryResponse,
  ValidationResponse,
} from '../interfaces/gateway.interface';
import type { GatewayParams } from '../types/gateway.type';
import { appendParams, encodeForm } from '../utils/form.util';

/**
 * Creates a client with production defaults: a bounded request timeout, the
 * store credentials on every call, and the service identity as `User-Agent`
 * so gateway logs attribute calls per service.
 *
 * @param config - Validated settings (see `resolveSslCommerzConfig`).
 * @param options - Header and transport overrides, applied last.
 * @returns An idle client — call `connect()` (the Nest lifecycle does this for you).
 */
export function createSslCommerzClient(
  config: SslCommerzConfig,
  options: SslCommerzClientOptions = {},
): SslCommerzClient {
  const transport = options.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let status: ClientStatus = ClientStatus.Idle;

  /**
   * One bounded request. `label` names the operation for error messages —
   * the URL never appears in them, because for every operation except
   * session init the store password is in the query string.
   *
   * @param label - Operation name, used in error messages.
   * @param url - Fully-built request URL.
   * @param init - Request overrides (method, body, extra headers).
   * @returns The parsed JSON reply.
   * @throws {SslCommerzError} On a non-2xx response, a network failure, a timeout, or a non-JSON body.
   */
  async function request<T>(label: string, url: URL, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await transport(url, {
        ...init,
        headers: { ...buildHeaders(config, options), ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (error) {
      throw new SslCommerzError(
        `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new SslCommerzError(`${label} — gateway responded ${response.status}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      // An HTML body here is almost always a wrong path or an environment
      // mismatch — say so instead of surfacing a bare JSON syntax error.
      throw new SslCommerzError(
        `${label} — gateway returned a non-JSON body: ${text.slice(0, 200)}`,
        error,
      );
    }
  }

  /**
   * Builds a GET url for the validator APIs: the operation's parameters plus
   * the store credentials, which SSLCommerz requires in the query string.
   *
   * @param path - Gateway path to call.
   * @param params - Operation parameters.
   * @returns The request url.
   */
  function queryUrl(path: string, params: GatewayParams): URL {
    const url = appendParams(new URL(path, config.baseUrl), params);
    url.searchParams.set('store_id', config.storeId);
    url.searchParams.set('store_passwd', config.storePassword);
    url.searchParams.set('format', 'json');
    return url;
  }

  /**
   * Bare GET on the host: any HTTP answer proves reachability. No
   * credentials are sent, so this says nothing about their validity.
   *
   * @throws {SslCommerzError} When the host cannot be reached at all.
   */
  async function ping(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await transport(new URL('/', config.baseUrl), {
        method: 'GET',
        headers: buildHeaders(config, options),
        signal: controller.signal,
      });
    } catch (error) {
      throw new SslCommerzError(
        `ping failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    config,
    get status(): ClientStatus {
      return status;
    },

    async connect(): Promise<void> {
      await ping();
      status = ClientStatus.Ready;
    },

    ping,

    async close(): Promise<void> {
      status = ClientStatus.Closed;
    },

    async init(data: SessionInitRequest): Promise<SessionInitResponse> {
      return request<SessionInitResponse>(
        'init',
        new URL(SSLCOMMERZ_ENDPOINTS.makePayment, config.baseUrl),
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: encodeForm({
            ...data,
            store_id: config.storeId,
            store_passwd: config.storePassword,
          }),
        },
      );
    },

    async validate(data: { val_id: string } & GatewayParams): Promise<ValidationResponse> {
      return request<ValidationResponse>(
        'validate',
        queryUrl(SSLCOMMERZ_ENDPOINTS.orderValidate, data),
      );
    },

    async initiateRefund(data: RefundInitiateRequest): Promise<RefundInitiateResponse> {
      return request<RefundInitiateResponse>(
        'initiateRefund',
        queryUrl(SSLCOMMERZ_ENDPOINTS.refundPayment, data),
      );
    },

    async refundQuery(
      data: { refund_ref_id: string } & GatewayParams,
    ): Promise<RefundQueryResponse> {
      return request<RefundQueryResponse>(
        'refundQuery',
        queryUrl(SSLCOMMERZ_ENDPOINTS.refundStatus, data),
      );
    },

    async transactionQueryByTransactionId(
      data: { tran_id: string } & GatewayParams,
    ): Promise<TransactionQueryResponse> {
      return request<TransactionQueryResponse>(
        'transactionQueryByTransactionId',
        queryUrl(SSLCOMMERZ_ENDPOINTS.transactionStatus, data),
      );
    },

    async transactionQueryBySessionId(
      data: { sessionkey: string } & GatewayParams,
    ): Promise<TransactionQueryResponse> {
      return request<TransactionQueryResponse>(
        'transactionQueryBySessionId',
        queryUrl(SSLCOMMERZ_ENDPOINTS.transactionStatus, data),
      );
    },
  };
}

/**
 * Builds the default header set: caller-supplied headers first, then the
 * identity this package owns. Credentials travel in the body or query
 * string, never a header.
 *
 * @param config - Resolved configuration to use.
 * @param options - Construction options carrying extra headers.
 * @returns Headers for one request.
 */
function buildHeaders(
  config: SslCommerzConfig,
  options: SslCommerzClientOptions,
): Record<string, string> {
  const headers: Record<string, string> = { ...options.headers };
  if (config.clientName) {
    headers['user-agent'] = config.clientName;
  }
  return headers;
}
