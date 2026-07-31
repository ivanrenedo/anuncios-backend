import { DEFAULT_PIN, hashPin, verifyPin } from './pin.util';

describe('pin.util', () => {
  describe('hashPin', () => {
    it('returns a string in "salt:hash" format', () => {
      const out = hashPin('1234');
      const [salt, hash] = out.split(':');
      expect(salt).toMatch(/^[0-9a-f]{32}$/); // 16 bytes hex
      expect(hash).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    });

    it('produces a different hash every time (fresh salt)', () => {
      // Two consecutive hashes of the same PIN must not collide — otherwise
      // the salt isn't doing its job and rainbow tables win.
      expect(hashPin('1234')).not.toBe(hashPin('1234'));
    });
  });

  describe('verifyPin', () => {
    it('accepts the exact PIN it hashed', () => {
      const stored = hashPin('987654');
      expect(verifyPin('987654', stored)).toBe(true);
    });

    it('rejects a wrong PIN', () => {
      const stored = hashPin('987654');
      expect(verifyPin('000000', stored)).toBe(false);
    });

    it('rejects when the stored value is null/undefined/empty', () => {
      expect(verifyPin('1234', null)).toBe(false);
      expect(verifyPin('1234', undefined)).toBe(false);
      expect(verifyPin('1234', '')).toBe(false);
    });

    it('rejects a malformed stored value (no colon)', () => {
      expect(verifyPin('1234', 'notavalidhash')).toBe(false);
    });

    it('rejects a stored value missing salt or hash', () => {
      expect(verifyPin('1234', ':abcd')).toBe(false);
      expect(verifyPin('1234', 'salt:')).toBe(false);
    });

    it('is case-sensitive to the PIN chars', () => {
      const stored = hashPin('AbCd');
      expect(verifyPin('abcd', stored)).toBe(false);
    });
  });

  describe('DEFAULT_PIN', () => {
    it('is a stable, well-known constant so we can seed with it', () => {
      expect(DEFAULT_PIN).toBe('246810');
    });
    it('verifies against its own hash', () => {
      expect(verifyPin(DEFAULT_PIN, hashPin(DEFAULT_PIN))).toBe(true);
    });
  });
});
