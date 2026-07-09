import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Default PIN assigned to new users. Single source of truth. */
export const DEFAULT_PIN = '246810';

/**
 * One-way hash for sensitive PINs using scrypt + a random per-record salt.
 * A PIN is a credential, so we hash it (not reversibly encrypt) — we only ever
 * need to verify it, never recover it. Stored as `salt:hash` (hex).
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

/** Timing-safe verification of a plaintext PIN against a stored `salt:hash`. */
export function verifyPin(pin: string, stored?: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(pin, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
