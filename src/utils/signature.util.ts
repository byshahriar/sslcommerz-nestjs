/**
 * @file IPN signature verification.
 *
 * SSLCommerz signs its IPN payloads: `verify_key` lists the fields that were
 * signed, `verify_sign` is the MD5 of those fields — sorted, joined as
 * `key=value&…` — with the MD5 of the store password appended as
 * `store_passwd`. Reproducing that hash proves the payload came from
 * SSLCommerz and was not tampered with in transit.
 *
 * What it does *not* prove is that the payment succeeded, or that it was for
 * the amount you expected: a signed payload is still a claim. Verify the
 * signature to reject forgeries cheaply, then confirm with a validation call
 * (`client.validate({ val_id })`) before fulfilling anything.
 *
 * MD5 is SSLCommerz's choice, not ours — it is the algorithm the gateway
 * signs with, so it is the algorithm we must check against.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { IpnSignatureResult } from '../interfaces/signature.interface';

/**
 * Verifies the `verify_sign` MD5 on an IPN payload.
 *
 * @param payload - The raw IPN form fields, exactly as received.
 * @param storePassword - The store password for the store the IPN names.
 * @returns Whether the signature reproduces, and why not when it doesn't.
 */
export function verifyIpnSignature(
  payload: Record<string, unknown>,
  storePassword: string,
): IpnSignatureResult {
  const signature = asString(payload.verify_sign);
  const keyList = asString(payload.verify_key);

  if (!signature) {
    return { valid: false, reason: 'payload carries no verify_sign' };
  }
  if (!keyList) {
    return { valid: false, reason: 'payload carries no verify_key' };
  }
  if (!storePassword) {
    return { valid: false, reason: 'no store password configured to verify against' };
  }

  const fields = new Map<string, string>();
  for (const key of keyList.split(',')) {
    const name = key.trim();
    if (name !== '') {
      fields.set(name, asString(payload[name]) ?? '');
    }
  }
  fields.set('store_passwd', md5(storePassword));

  const hashString = [...fields.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return equals(md5(hashString), signature)
    ? { valid: true }
    : { valid: false, reason: 'verify_sign does not match the computed hash' };
}

/**
 * MD5 hex digest — the gateway's signing algorithm.
 *
 * @param value - Value to hash.
 * @returns The lowercase hex digest.
 */
function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

/**
 * Length-safe, constant-time comparison of two hex digests.
 *
 * @param a - First digest.
 * @param b - Second digest.
 * @returns Whether they are equal.
 */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Reads a field as a string, tolerating the numbers a form body can yield.
 *
 * @param value - Raw field value.
 * @returns The value as a string, or undefined when absent or empty.
 */
function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value === '' ? undefined : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}
