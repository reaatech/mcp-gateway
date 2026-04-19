# Contributing Guide

## Development Setup

```bash
# Clone the repository
git clone https://github.com/reaatech/mcp-gateway.git
cd mcp-gateway

# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm test

# Start development server
npm run dev
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── types/                # Core domain types
├── config/               # Configuration management
├── auth/                 # Authentication middleware
├── rate-limit/           # Rate limiting
├── validation/           # Schema validation
├── allowlist/            # Tool allowlists
├── fanout/               # Fan-out router
├── cache/                # Response caching
├── audit/                # Audit trail
├── mcp-client/           # Upstream MCP client
├── middleware/           # Express middleware pipeline
├── observability/        # OTel, logging
└── utils/                # Shared utilities

tests/
├── unit/                 # Unit tests
├── integration/          # Integration tests
└── fixtures/             # Test fixtures
```

## Adding New Middleware

1. Create the middleware file in `src/middleware/`
2. Follow the pattern: `(req, res, next, context) => { ... }`
3. Add unit tests in `tests/unit/middleware.test.ts`
4. Register in the pipeline

## Adding New Auth Providers

1. Create validator in `src/auth/`
2. Implement the `AuthValidator` interface
3. Add to `src/auth/auth.middleware.ts`
4. Add unit tests

## Code Quality

- **TypeScript**: Strict mode enabled
- **ESLint**: Flat config with typescript-eslint
- **Prettier**: Single quotes, trailing commas, 2-space indent
- **Pre-commit hooks**: Lint + typecheck + test

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/auth.test.ts
```

## Pull Request Process

1. Create a feature branch
2. Make changes with tests
3. Ensure all checks pass (lint, typecheck, test)
4. Submit PR with clear description
5. Address review feedback

## Commit Messages

Follow conventional commits:
- `feat: add OAuth2 token introspection`
- `fix: handle missing auth header`
- `docs: update configuration reference`
- `test: add rate limit edge cases`
