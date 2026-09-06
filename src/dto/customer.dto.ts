/**
 * @file Customer, shipping and product DTOs.
 *
 * SSLCommerz's API is a flat `cus_*` / `ship_*` field list. These DTOs group
 * it the way an application actually holds the data; `toSessionInitRequest`
 * flattens it back at the boundary.
 */
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { ProductProfile } from '../enums/product-profile.enum';

/** The paying customer. Every field here is required by the gateway. */
export class CustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address2?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsString()
  @IsNotEmpty()
  postcode!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  /** Local format is fine — SSLCommerz does not normalise it. */
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsString()
  fax?: string;
}

/** Delivery address, when the order ships. */
export class ShippingDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsString()
  @IsNotEmpty()
  postcode!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  /** Line-item count SSLCommerz shows on the gateway page. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  itemCount?: number;
}

/** What is being sold. SSLCommerz uses this for risk scoring. */
export class ProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  /** One of SSLCommerz's fixed profiles; the gateway rejects anything else. */
  @IsEnum(ProductProfile)
  profile!: ProductProfile;
}

/**
 * Instalment options offered on the gateway page.
 *
 * EMI has to be enabled for the store before any of this takes effect —
 * sending the fields on a store without it is silently ignored rather than
 * rejected, which is worth knowing when it appears not to work.
 */
export class EmiOptionsDto {
  /** Offer EMI at all (`emi_option`). */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Largest instalment count to offer (`emi_max_inst_option`). */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxInstalment?: number;

  /** Pre-select an instalment count (`emi_selected_inst`). */
  @IsOptional()
  @IsInt()
  @Min(0)
  selectedInstalment?: number;

  /** Allow *only* EMI payment, no one-off card payment (`emi_allow_only`). */
  @IsOptional()
  @IsBoolean()
  allowOnly?: boolean;
}
