/**
 * @file Request and response shapes for the SSLCommerz API.
 *
 * The documented fields are typed; every shape also carries an index
 * signature, because SSLCommerz adds response fields (new card types, new
 * risk metadata) without versioning the API. A consumer reading an
 * undocumented field keeps working; a consumer relying on one is on its own.
 */

/** Fields SSLCommerz requires or documents for a session init. */
export interface SessionInitRequest {
  /** Order total. Sent verbatim — validation compares against it later. */
  total_amount: number | string;
  /** ISO currency code, e.g. `BDT`. */
  currency: string;
  /** The merchant's own order id; must be unique per store. */
  tran_id: string;
  success_url: string;
  fail_url: string;
  cancel_url: string;
  /** Server-to-server callback. Strongly recommended — a customer can close the browser mid-redirect. */
  ipn_url?: string;
  /** `YES`, `NO` or `Courier` — required even for digital goods. */
  shipping_method: string;
  product_name: string;
  product_category: string;
  /** One of SSLCommerz's fixed profiles; the gateway rejects unknown values. */
  product_profile: string;
  cus_name: string;
  cus_email: string;
  cus_add1: string;
  cus_add2?: string;
  cus_city: string;
  cus_state?: string;
  cus_postcode: string;
  cus_country: string;
  cus_phone: string;
  cus_fax?: string;
  ship_name?: string;
  ship_add1?: string;
  ship_add2?: string;
  ship_city?: string;
  ship_state?: string;
  ship_postcode?: string;
  ship_country?: string;
  num_of_item?: number | string;
  /** Restricts the gateway page to named channels, e.g. `visa,master,bkash`. */
  multi_card_name?: string;
  /** `1` offers EMI on the gateway page. */
  emi_option?: number | string;
  emi_max_inst_option?: number | string;
  emi_selected_inst?: number | string;
  emi_allow_only?: number | string;
  /** Merchant passthrough fields, echoed back on validation and IPN. */
  value_a?: string;
  value_b?: string;
  value_c?: string;
  value_d?: string;
  [field: string]: unknown;
}

/** One payment channel offered on the gateway page. */
export interface GatewayChannel {
  name?: string;
  type?: string;
  logo?: string;
  gw?: string;
  redirectGatewayURL?: string;
  [field: string]: unknown;
}

/** Reply to a session init. */
export interface SessionInitResponse {
  /** `SUCCESS` or `FAILED`. */
  status: string;
  /** Populated when `status` is `FAILED`. */
  failedreason?: string;
  sessionkey?: string;
  /** Where to redirect the customer. Absent on failure. */
  GatewayPageURL?: string;
  /** Per-channel direct URLs, when the store is configured for them. */
  directPaymentURLBank?: string;
  directPaymentURLCard?: string;
  redirectGatewayURL?: string;
  /** Channels the store may offer — what an embedded checkout renders. */
  desc?: GatewayChannel[];
  gw?: Record<string, unknown>;
  [field: string]: unknown;
}

/**
 * Reply to a validation call — the authoritative record of a transaction.
 *
 * For a transaction in a currency other than the store's, `amount` and
 * `currency` describe the settled BDT figure while `currency_amount` and
 * `currency_type` describe what the customer was actually charged. Compare
 * against the right pair; `verifyOrder` does.
 */
export interface ValidationResponse {
  status: string;
  tran_date?: string;
  tran_id?: string;
  val_id?: string;
  /** Amount in the store's own currency. */
  amount?: string;
  /** Amount settled to the store, after gateway charges. */
  store_amount?: string;
  currency?: string;
  bank_tran_id?: string;
  card_type?: string;
  card_no?: string;
  card_issuer?: string;
  card_brand?: string;
  /** The currency the customer was charged in. */
  currency_type?: string;
  /** The amount the customer was charged, in `currency_type`. */
  currency_amount?: string;
  risk_level?: string;
  risk_title?: string;
  value_a?: string;
  value_b?: string;
  value_c?: string;
  value_d?: string;
  error?: string;
  [field: string]: unknown;
}

/** One transaction record in a query result. */
export interface TransactionElement {
  tran_id?: string;
  val_id?: string;
  status?: string;
  amount?: string;
  store_amount?: string;
  currency?: string;
  bank_tran_id?: string;
  tran_date?: string;
  [field: string]: unknown;
}

/** Reply to a transaction query, by `tran_id` or by `sessionkey`. */
export interface TransactionQueryResponse {
  /** `DONE` when the query itself reached the gateway. */
  APIConnect?: string;
  no_of_trans_found?: number;
  element?: TransactionElement[];
  errorReason?: string;
  [field: string]: unknown;
}

/** Fields for a refund initiation. */
export interface RefundInitiateRequest {
  /** Partial refunds are allowed; must not exceed the settled amount. */
  refund_amount: number | string;
  refund_remarks: string;
  /** From the validation response — not `tran_id`. */
  bank_tran_id: string;
  /** Merchant's own reference for this refund. */
  refe_id?: string;
  [field: string]: unknown;
}

/** Reply to a refund initiation. */
export interface RefundInitiateResponse {
  APIConnect?: string;
  /** `success`, `failed` or `processing` — a refund is often asynchronous. */
  status?: string;
  /** Keep this: it is the only handle for {@link RefundQueryResponse}. */
  refund_ref_id?: string;
  bank_tran_id?: string;
  trans_id?: string;
  errorReason?: string;
  [field: string]: unknown;
}

/** Reply to a refund status query. */
export interface RefundQueryResponse {
  APIConnect?: string;
  status?: string;
  refund_ref_id?: string;
  initiated_on?: string;
  refunded_on?: string;
  bank_tran_id?: string;
  errorReason?: string;
  [field: string]: unknown;
}

/**
 * The IPN payload SSLCommerz POSTs to `ipn_url`, and to the success, fail
 * and cancel URLs.
 *
 * Treat it as a notification that *something happened*, never as proof of
 * payment: it is an unauthenticated POST to a public URL.
 */
export interface IpnPayload {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  currency?: string;
  currency_type?: string;
  currency_amount?: string;
  bank_tran_id?: string;
  card_type?: string;
  store_id?: string;
  verify_sign?: string;
  verify_key?: string;
  value_a?: string;
  value_b?: string;
  value_c?: string;
  value_d?: string;
  [field: string]: unknown;
}
