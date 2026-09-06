import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyIpnSignature } from '../../src';

const STORE_PASSWORD = 'testbox@ssl';

/**
 * Signs a payload exactly the way SSLCommerz does, so the test proves the
 * verifier against the documented algorithm rather than against itself.
 */
function sign(
  fields: Record<string, string>,
  storePassword = STORE_PASSWORD,
): Record<string, string> {
  const keys = Object.keys(fields);
  const signed: Record<string, string> = { ...fields };
  const hashFields: Record<string, string> = { ...fields };
  hashFields.store_passwd = createHash('md5').update(storePassword).digest('hex');

  const hashString = Object.keys(hashFields)
    .sort()
    .map((key) => `${key}=${hashFields[key]}`)
    .join('&');

  signed.verify_key = keys.join(',');
  signed.verify_sign = createHash('md5').update(hashString).digest('hex');
  return signed;
}

describe('verifyIpnSignature', () => {
  it('accepts a payload signed the way the gateway signs it', () => {
    const payload = sign({
      tran_id: 'order-1',
      val_id: 'val-1',
      amount: '1000.00',
      currency: 'BDT',
      status: 'VALID',
    });
    expect(verifyIpnSignature(payload, STORE_PASSWORD)).toEqual({ valid: true });
  });

  it('accepts an uppercase signature (the digest is case-insensitive hex)', () => {
    const payload = sign({ tran_id: 'order-1', status: 'VALID' });
    payload.verify_sign = payload.verify_sign.toUpperCase();
    expect(verifyIpnSignature(payload, STORE_PASSWORD).valid).toBe(true);
  });

  it('rejects a payload whose amount was tampered with', () => {
    const payload = sign({ tran_id: 'order-1', amount: '1000.00', status: 'VALID' });
    payload.amount = '1.00';
    const result = verifyIpnSignature(payload, STORE_PASSWORD);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });

  it('rejects a payload signed with a different store password', () => {
    const payload = sign({ tran_id: 'order-1' }, 'someone-elses-password');
    expect(verifyIpnSignature(payload, STORE_PASSWORD).valid).toBe(false);
  });

  it('rejects an unsigned payload rather than passing it through', () => {
    expect(verifyIpnSignature({ tran_id: 'order-1' }, STORE_PASSWORD)).toMatchObject({
      valid: false,
      reason: 'payload carries no verify_sign',
    });
  });

  it('rejects a payload with a signature but no key list', () => {
    expect(verifyIpnSignature({ tran_id: 'x', verify_sign: 'abc' }, STORE_PASSWORD)).toMatchObject({
      valid: false,
      reason: 'payload carries no verify_key',
    });
  });

  it('reports a missing store password instead of silently failing', () => {
    const payload = sign({ tran_id: 'order-1' });
    expect(verifyIpnSignature(payload, '')).toMatchObject({
      valid: false,
      reason: 'no store password configured to verify against',
    });
  });

  it('treats a signed field that is absent from the payload as empty', () => {
    // The gateway lists optional fields in verify_key even when unset.
    const payload = sign({ tran_id: 'order-1', value_a: '' });
    delete payload.value_a;
    expect(verifyIpnSignature(payload, STORE_PASSWORD).valid).toBe(true);
  });
});
