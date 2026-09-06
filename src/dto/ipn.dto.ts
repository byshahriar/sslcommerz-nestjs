/**
 * @file The IPN / callback payload DTO.
 *
 * SSLCommerz POSTs form-encoded fields to `ipn_url`, and to the success,
 * fail and cancel URLs. The shape is the same in all four cases, which is
 * why one DTO serves them all.
 *
 * Validation here is deliberately loose: rejecting a malformed IPN with a
 * 400 makes SSLCommerz retry it, and a payload we can't parse is exactly the
 * one worth recording. Only `tran_id` is required — everything downstream
 * hangs off `val_id`, which the service checks explicitly.
 */
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import type { IpnPayload } from '../interfaces/gateway.interface';

/** One gateway callback, as received. */
export class IpnPayloadDto implements IpnPayload {
  /** Your order id, echoed back. */
  @IsString()
  @IsNotEmpty()
  tran_id!: string;

  /** `VALID`, `VALIDATED`, `FAILED`, `CANCELLED`, `UNATTEMPTED`, `EXPIRED`. */
  @IsOptional()
  @IsString()
  status?: string;

  /** The handle for the authoritative validation call. Absent on cancel. */
  @IsOptional()
  @IsString()
  val_id?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  /** Currency the customer was charged in, when it isn't the store's. */
  @IsOptional()
  @IsString()
  currency_type?: string;

  /** Amount the customer was charged, in `currency_type`. */
  @IsOptional()
  @IsString()
  currency_amount?: string;

  /** The gateway's transaction id — what refunds are keyed on. */
  @IsOptional()
  @IsString()
  bank_tran_id?: string;

  @IsOptional()
  @IsString()
  card_type?: string;

  @IsOptional()
  @IsString()
  store_id?: string;

  /** MD5 of the signed fields; see `verifyIpnSignature`. */
  @IsOptional()
  @IsString()
  verify_sign?: string;

  /** Comma-separated list of the fields covered by `verify_sign`. */
  @IsOptional()
  @IsString()
  verify_key?: string;

  @IsOptional()
  @IsString()
  value_a?: string;

  @IsOptional()
  @IsString()
  value_b?: string;

  @IsOptional()
  @IsString()
  value_c?: string;

  @IsOptional()
  @IsString()
  value_d?: string;

  /** Undeclared fields SSLCommerz adds; kept so signature checks still work. */
  [field: string]: unknown;
}
