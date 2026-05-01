# Authentication

## Capability
Multi-method authentication with API keys, JWT, OAuth2, and OIDC support.

## Package
`@reaatech/mcp-gateway-auth` — `packages/auth/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `api-key-validator.ts` | SHA-256 hashed API key validation |
| `jwt-validator.ts` | RS256/ES256 JWT signature verification |
| `oauth-introspection.ts` | RFC 7662 token introspection |
| `oidc-validator.ts` | OIDC ID token validation |
| `auth.middleware.ts` | Express middleware orchestrating all methods |
| `auth-context.ts` | AuthContext type, scope checking, token fingerprinting |

## Auth Methods
| Method | Validation | Use Case |
|--------|------------|----------|
| API Key | Hash comparison (SHA-256) | Service-to-service |
| JWT | Signature verification (jose) | User authentication |
| OAuth2 | Token introspection (RFC 7662) | Third-party apps |
| OIDC | ID token validation | SSO integration |

## Error Handling
- **401 Unauthorized** — Invalid or missing credentials
- **403 Forbidden** — Valid credentials but insufficient permissions
- `AuthenticationError` class with `code` and `statusCode`

## Security Considerations
- API keys stored as SHA-256 hashes, never plaintext
- JWT signatures verified with proper crypto (RS256/ES256)
- Token revocation checked via introspection
- Key rotation supported through JWKS endpoints
- Clock skew tolerance configurable (default: 30s)
