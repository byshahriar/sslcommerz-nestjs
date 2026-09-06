/**
 * @file Resolved gateway configuration.
 */

/** Fully-resolved settings for one SSLCommerz store. */
export interface SslCommerzConfig {
  /** Merchant store id, issued per environment. */
  storeId: string;
  /** Store password (`store_passwd`) — a credential; never log it. */
  storePassword: string;
  /** Sandbox gateway rather than live. @default true */
  sandbox: boolean;
  /** Gateway host; derived from {@link SslCommerzConfig.sandbox} unless set explicitly. */
  baseUrl: string;
  /** Upper bound on one gateway request. @default DEFAULT_TIMEOUT_MS */
  timeoutMs?: number;
  /**
   * How far a validated amount may differ from the order before it counts as
   * a mismatch, in currency units. @default DEFAULT_AMOUNT_TOLERANCE
   */
  amountTolerance?: number;
  /** Identity reported to the gateway (`User-Agent`). Defaults to the service name. */
  clientName?: string;
}

/** Input to `resolveSslCommerzConfig`. */
export interface ResolveSslCommerzConfigInput {
  /** Highest-precedence explicit values. */
  overrides?: Partial<SslCommerzConfig>;
  /** Environment map to read from. @default process.env */
  env?: NodeJS.ProcessEnv;
  /**
   * Service identity used to default {@link SslCommerzConfig.clientName}.
   * @default env.APP_NAME
   */
  serviceName?: string;
}
