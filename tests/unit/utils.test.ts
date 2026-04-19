/**
 * mcp-gateway — Utils Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  sha256,
  randomHex,
  safeCompare,
  sleep,
  retry,
  truncate,
  deepClone,
  isPlainObject,
} from '../../src/utils/index.js';

describe('utils', () => {
  describe('sha256', () => {
    it('produces consistent hash', () => {
      const hash1 = sha256('test-input');
      const hash2 = sha256('test-input');
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', () => {
      const hash1 = sha256('input1');
      const hash2 = sha256('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('produces 64-character hex string', () => {
      const hash = sha256('any input');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('randomHex', () => {
    it('generates hex string of specified length', () => {
      const hex = randomHex(8);
      expect(hex).toMatch(/^[a-f0-9]{16}$/);
    });

    it('generates default 16 bytes (32 chars)', () => {
      const hex = randomHex();
      expect(hex).toMatch(/^[a-f0-9]{32}$/);
    });

    it('generates different values each call', () => {
      const hex1 = randomHex(16);
      const hex2 = randomHex(16);
      expect(hex1).not.toBe(hex2);
    });
  });

  describe('safeCompare', () => {
    it('returns true for equal strings', () => {
      expect(safeCompare('test', 'test')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(safeCompare('test', 'other')).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(safeCompare('short', 'muchlonger')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(safeCompare('', '')).toBe(true);
      expect(safeCompare('', 'a')).toBe(false);
    });
  });

  describe('sleep', () => {
    it('waits for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('retry', () => {
    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const result = await retry(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));
      await expect(retry(fn, { maxAttempts: 3 })).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('stops retrying when shouldRetry returns false', async () => {
      const recoverable = new Error('recoverable');
      const fatal = new Error('fatal');
      const fn = vi.fn()
        .mockRejectedValueOnce(recoverable)
        .mockRejectedValueOnce(fatal)
        .mockResolvedValue('success');

      await expect(retry(fn, {
        maxAttempts: 3,
        shouldRetry: (e) => e === recoverable,
      })).rejects.toThrow('fatal');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('truncate', () => {
    it('returns original string if shorter than maxLength', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('truncates longer strings with ellipsis', () => {
      expect(truncate('this is a long string', 10)).toBe('this is...');
    });

    it('handles exact maxLength', () => {
      expect(truncate('abc', 3)).toBe('abc');
    });
  });

  describe('deepClone', () => {
    it('clones plain objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('clones arrays', () => {
      const original = [1, [2, 3], { a: 4 }];
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
    });

    it('handles primitives', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('string')).toBe('string');
    });
  });

  describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
    });

    it('returns false for non-plain objects like Date', () => {
      expect(isPlainObject(new Date())).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });
  });
});