/**
 * @file Product profiles SSLCommerz accepts.
 */

/**
 * The `product_profile` a session declares. SSLCommerz uses it for risk
 * scoring and rejects values outside this set.
 */
export enum ProductProfile {
  General = 'general',
  PhysicalGoods = 'physical-goods',
  NonPhysicalGoods = 'non-physical-goods',
  AirlineTickets = 'airline-tickets',
  TravelVertical = 'travel-vertical',
  TelecomVertical = 'telecom-vertical',
}
