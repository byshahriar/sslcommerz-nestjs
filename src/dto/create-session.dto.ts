/**
 * @file The session-init DTO — the one shape an application builds by hand.
 */
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { DEFAULT_CURRENCY } from '../constants/default.constant';
import { ShippingMethod } from '../enums/shipping-method.enum';
import type { SessionInitRequest } from '../interfaces/gateway.interface';
import { CustomerDto, EmiOptionsDto, ProductDto, ShippingDto } from './customer.dto';

/**
 * URLs the gateway sends the customer back to.
 *
 * All four must be absolute — the gateway redirects a browser to them from
 * its own origin, so a path alone goes nowhere. `require_tld` stays off so a
 * `http://localhost:3000/...` callback works in development.
 */
export class CallbackUrlsDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  success!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  fail!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  cancel!: string;

  /**
   * Server-to-server notification URL. Strongly recommended: a customer who
   * closes the browser after paying never triggers the success redirect, and
   * the IPN is then the only signal the payment happened.
   */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  ipn?: string;
}

/**
 * Everything needed to open a payment session.
 *
 * Use `SslCommerzService.createSession(dto)`, which validates, flattens to
 * the gateway's field names and returns the redirect URL.
 */
export class CreateSessionDto {
  /** Order total. Validation later compares the paid amount against this. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  /** ISO 4217 code, e.g. `BDT`. */
  @IsString()
  @Length(3, 3)
  currency: string = DEFAULT_CURRENCY;

  /** Your own order id. Must be unique per store — SSLCommerz rejects reuse. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  transactionId!: string;

  @ValidateNested()
  @Type(() => CallbackUrlsDto)
  urls!: CallbackUrlsDto;

  @ValidateNested()
  @Type(() => ProductDto)
  product!: ProductDto;

  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingDto)
  shipping?: ShippingDto;

  /** Defaults to `YES` when a shipping address is given, `NO` otherwise. */
  @IsOptional()
  @IsEnum(ShippingMethod)
  shippingMethod?: ShippingMethod;

  /**
   * Restrict the gateway page to named channels, e.g. `['visa', 'bkash']`.
   * Omit to offer everything the store has enabled (`multi_card_name`).
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedPaymentMethods?: string[];

  /** Instalment options, for stores with EMI enabled. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EmiOptionsDto)
  emi?: EmiOptionsDto;

  /**
   * Passthrough values echoed back on validation and IPN — the supported way
   * to correlate a gateway callback with your own records.
   */
  @IsOptional()
  @IsString()
  valueA?: string;

  @IsOptional()
  @IsString()
  valueB?: string;

  @IsOptional()
  @IsString()
  valueC?: string;

  @IsOptional()
  @IsString()
  valueD?: string;

  /**
   * Escape hatch for gateway fields this DTO doesn't model. Merged last, so
   * it can override anything.
   */
  @IsOptional()
  extra?: Record<string, string | number | boolean>;
}

/**
 * Flattens a {@link CreateSessionDto} into the gateway's field names.
 *
 * @param dto - The validated session request.
 * @returns The flat field map SSLCommerz expects.
 */
export function toSessionInitRequest(dto: CreateSessionDto): SessionInitRequest {
  const { customer, shipping, product, urls, emi } = dto;

  return {
    total_amount: dto.amount,
    currency: dto.currency,
    tran_id: dto.transactionId,
    success_url: urls.success,
    fail_url: urls.fail,
    cancel_url: urls.cancel,
    ipn_url: urls.ipn,

    shipping_method: dto.shippingMethod ?? (shipping ? ShippingMethod.Yes : ShippingMethod.No),
    product_name: product.name,
    product_category: product.category,
    product_profile: product.profile,

    cus_name: customer.name,
    cus_email: customer.email,
    cus_add1: customer.address,
    cus_add2: customer.address2,
    cus_city: customer.city,
    cus_state: customer.state,
    cus_postcode: customer.postcode,
    cus_country: customer.country,
    cus_phone: customer.phone,
    cus_fax: customer.fax,

    ship_name: shipping?.name,
    ship_add1: shipping?.address,
    ship_add2: shipping?.address2,
    ship_city: shipping?.city,
    ship_state: shipping?.state,
    ship_postcode: shipping?.postcode,
    ship_country: shipping?.country,
    num_of_item: shipping?.itemCount,

    multi_card_name: dto.allowedPaymentMethods?.join(','),
    // The gateway reads these as 1/0 rather than true/false.
    emi_option: flag(emi?.enabled),
    emi_max_inst_option: emi?.maxInstalment,
    emi_selected_inst: emi?.selectedInstalment,
    emi_allow_only: flag(emi?.allowOnly),

    value_a: dto.valueA,
    value_b: dto.valueB,
    value_c: dto.valueC,
    value_d: dto.valueD,

    ...dto.extra,
  };
}

/**
 * Renders an optional boolean as the 1/0 the gateway expects, leaving it out
 * entirely when unset.
 *
 * @param value - The flag, if the caller set one.
 * @returns 1, 0, or undefined.
 */
function flag(value: boolean | undefined): number | undefined {
  return value === undefined ? undefined : value ? 1 : 0;
}
