/**
 * mcp-gateway — Auth Module Barrel Export
 */

export type { ApiKeyValidationResult } from './api-key-validator.js';
// API Key
export { findTenantForApiKey, hashApiKey, validateApiKey } from './api-key-validator.js';
// Express middleware
export {
  authMiddleware,
  getAuth,
  optionalAuthMiddleware,
  requireAuth,
} from './auth.middleware.js';
// Types
export type { AuthContext, AuthMethod } from './auth-context.js';
export {
  createAuthContext,
  generateTokenFingerprint,
  generateTokenFingerprintSync,
  getRedactedAuthContext,
  hasAllScopes,
  hasAnyScope,
  hasScope,
} from './auth-context.js';
// Framework-agnostic core
export type { AuthDecision } from './auth-core.js';
export {
  AuthenticationError,
  authenticateRequest,
  evaluateAuth,
  evaluateOptionalAuth,
} from './auth-core.js';
export type { JwtValidationResult } from './jwt-validator.js';
// JWT
export { decodeJwtUnsafe, isJwtExpired, validateJwt } from './jwt-validator.js';
export type { IntrospectionResult } from './oauth-introspection.js';
// OAuth
export {
  clearIntrospectionCache,
  getIntrospectionCacheStats,
  introspectToken,
  shutdownOAuthIntrospection,
} from './oauth-introspection.js';
export type { OidcValidationResult } from './oidc-validator.js';
// OIDC
export {
  extractUserInfoFromIdToken,
  validateNonce,
  validateOidcIdToken,
} from './oidc-validator.js';
