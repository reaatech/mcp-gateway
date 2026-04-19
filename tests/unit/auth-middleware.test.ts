/**
 * mcp-gateway — Auth Middleware Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { AuthenticationError } from '../../src/auth/auth.middleware.js';

describe('authMiddleware', () => {
  describe('AuthenticationError', () => {
    it('creates error with default values', () => {
      const error = new AuthenticationError('test error');
      expect(error.message).toBe('test error');
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.statusCode).toBe(401);
    });

    it('creates error with custom values', () => {
      const error = new AuthenticationError('custom error', 'CUSTOM_CODE', 403);
      expect(error.message).toBe('custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(403);
    });

    it('is instance of Error', () => {
      const error = new AuthenticationError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AuthenticationError');
    });
  });
});