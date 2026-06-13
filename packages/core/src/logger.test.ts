import { describe, expect, it } from 'vitest';
import { childLogger, logger, redactToken } from './logger.js';

describe('logger', () => {
  describe('childLogger', () => {
    it('returns a child logger with bound context', () => {
      const child = childLogger({ requestId: 'req-123', tenantId: 'tenant-a' });
      expect(child).toBeDefined();
      expect(child).not.toBe(logger);
    });
  });

  describe('redactToken', () => {
    it('returns empty string for empty token', () => {
      expect(redactToken('')).toBe('');
    });

    it('returns masked value for tokens 8 chars or fewer', () => {
      expect(redactToken('abc')).toBe('***');
      expect(redactToken('12345678')).toBe('***');
    });

    it('shows first 4 and last 4 chars for longer tokens', () => {
      const result = redactToken('abcdefghijklmnop');
      expect(result).toBe('abcd...mnop');
    });

    it('handles nullish token gracefully', () => {
      expect(redactToken(undefined as unknown as string)).toBe('');
      expect(redactToken(null as unknown as string)).toBe('');
    });
  });
});
