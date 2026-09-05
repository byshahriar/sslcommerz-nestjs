/**
 * @file Shipping methods SSLCommerz accepts.
 */

/**
 * The `shipping_method` a session declares. Required even for digital goods,
 * where {@link ShippingMethod.No} is the answer.
 */
export enum ShippingMethod {
  /** The order ships; shipping fields are then required. */
  Yes = 'YES',
  /** Nothing ships — digital goods and services. */
  No = 'NO',
  /** Shipped by courier. */
  Courier = 'Courier',
}
