/**
 * @file DTOs for validation, queries and refunds.
 */
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/** Confirms one transaction. `val_id` comes from an IPN or a success callback. */
export class ValidateTransactionDto {
  @IsString()
  @IsNotEmpty()
  val_id!: string;
}

/** Looks a transaction up by the merchant's own order id. */
export class TransactionQueryByIdDto {
  @IsString()
  @IsNotEmpty()
  tran_id!: string;
}

/** Looks a transaction up by the session key returned at init. */
export class TransactionQueryBySessionDto {
  @IsString()
  @IsNotEmpty()
  sessionkey!: string;
}

/**
 * Starts a refund.
 *
 * Keyed by `bank_tran_id` — the gateway's own transaction id from the
 * validation response — **not** your `tran_id`. Getting this wrong is the
 * most common refund bug.
 */
export class InitiateRefundDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  refund_amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  refund_remarks!: string;

  @IsString()
  @IsNotEmpty()
  bank_tran_id!: string;

  /** Your own reference for this refund, echoed back on query. */
  @IsOptional()
  @IsString()
  refe_id?: string;
}

/** Checks a refund's progress. Refunds are asynchronous at the bank. */
export class RefundQueryDto {
  @IsString()
  @IsNotEmpty()
  refund_ref_id!: string;
}
