/**
 * @file Which route a gateway callback arrived on.
 */

/**
 * SSLCommerz sends the same payload shape to four different URLs. The
 * channel is what tells them apart, and it changes how a callback is read:
 * a payload on {@link CallbackChannel.Cancel} is a cancellation even when it
 * carries no status field.
 */
export enum CallbackChannel {
  /** Server-to-server notification — the only one that survives a closed browser. */
  Ipn = 'ipn',
  Success = 'success',
  Fail = 'fail',
  Cancel = 'cancel',
}
