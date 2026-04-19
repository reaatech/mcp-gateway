/**
 * mcp-gateway — Auth Module Barrel Export
 */

// Types
export type { AuthContext, AuthMethod } from './auth-context.js';
export {
  createAuthContext,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  getRedactedAuthContext,
  generateTokenFingerprint,
  generateTokenFingerprintSync,
} from './auth-context.js';

// API Key
export { hashApiKey, validateApiKey, findTenantForApiKey } from './api-key-validator.js';
export type { ApiKeyValidationResult } from './api-key-validator.js';

// JWT
export { validateJwt, decodeJwtUnsafe, isJwtExpired } from './jwt-validator.js';
export type { JwtValidationResult } from './jwt-validator.js';

// OAuth
export {
  introspectToken,
  clearIntrospectionCache,
  getIntrospectionCacheStats,
} from './oauth-introspection.js';
export type { IntrospectionResult } from './oauth-introspection.js';

// OIDC
export {
  validateOidcIdToken,
  validateNonce,
  extractUserInfoFromIdToken,
} from './oidc-validator.js';
export type { OidcValidationResult } from './oidc-validator.js';

// Middleware
export {
  authMiddleware,
  optionalAuthMiddleware,
  requireAuth,
  getAuth,
  AuthenticationError,
} from './auth.middleware.js';
