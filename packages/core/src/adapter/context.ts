/**
 * mcp-gateway — Framework-Agnostic Adapter Context
 *
 * Normalized request shape and decision result shared by every gateway concern
 * (auth, rate-limit, allowlist, audit, cache). Each concern's core logic
 * consumes a {@link GatewayRequestContext} and returns a {@link GatewayDecision},
 * leaving framework-specific glue (Express middleware, Fastify hooks) to thin
 * adapters. These are types + pure helpers only — no Express/Fastify imports —
 * so `-core` stays framework-neutral and every package keys on the same tenant.
 */

import type { AuthContext } from '../types/domain.js';

/**
 * Raw header bag as exposed by both Express (`req.headers`) and Fastify
 * (`request.headers`).
 */
export type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * Normalized request context consumed by each concern's core function.
 */
export interface GatewayRequestContext {
  /** JSON-RPC method extracted from the body (used by allowlist/cache). */
  method?: string;
  /** HTTP verb, if relevant. */
  httpMethod?: string;
  /** Request path. */
  path: string;
  /** Raw header bag (case preserved as received). */
  headers: HeaderBag;
  /** Case-insensitive single-value header accessor. */
  getHeader(name: string): string | undefined;
  /** Tenant identifier — populated by auth, read by rate-limit/allowlist/cache. */
  tenantId?: string;
  /** Tool name for `tools/call` requests. */
  toolName?: string;
  /** Parsed request body (typically the JSON-RPC envelope). */
  body?: unknown;
  /** Auth context attached by the auth adapter (annotation flows here). */
  authContext?: AuthContext;
}

/**
 * Annotations a concern can attach to the request when it allows it through.
 */
export interface GatewayAnnotations {
  /** Auth context resolved by the auth concern. */
  authContext?: AuthContext;
  /** Tenant identifier resolved by the auth concern. */
  tenantId?: string;
  [key: string]: unknown;
}

/**
 * Decision returned by a concern's core function.
 *
 * - `allow`  — let the request continue; `headers`/`annotations` may be applied.
 * - `deny`   — short-circuit with `status` + `body` (+ optional `headers`).
 */
export interface GatewayDecision {
  action: 'allow' | 'deny';
  /** HTTP status for a deny (or replayed cache hit). */
  status?: number;
  /** Response body for a deny (or replayed cache hit). */
  body?: unknown;
  /** Headers to set on the response (applies to both allow and deny). */
  headers?: Record<string, string>;
  /** Values to attach to the request when allowing it through. */
  annotations?: GatewayAnnotations;
}

/**
 * Build a case-insensitive, single-value header accessor over a raw header bag.
 * Mirrors the lookup that the Express middleware performed inline.
 */
export function buildHeaderAccessor(headers: HeaderBag): (name: string) => string | undefined {
  return (name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };
}

/**
 * Extract the tool name from an MCP JSON-RPC request body.
 * Returns the tool name for `tools/call` requests, otherwise `null`.
 *
 * Single shared copy of the extractor previously duplicated in the allowlist
 * and cache middleware.
 */
export function extractToolName(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const req = body as Record<string, unknown>;
  if (req.method !== 'tools/call') {
    return null;
  }
  const params = req.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== 'object') {
    return null;
  }
  const name = params.name;
  return typeof name === 'string' ? name : null;
}

/**
 * Resolve the tenant id for a request context, preferring an explicit
 * `tenantId` and falling back to the attached auth context. Header values are
 * intentionally ignored here — tenant must come from authenticated state, not a
 * spoofable header.
 */
export function getTenantIdFromContext(ctx: GatewayRequestContext): string | undefined {
  return ctx.tenantId ?? ctx.authContext?.tenantId;
}

/**
 * Options shared by adapter builders for constructing a request context from a
 * framework-specific request object.
 */
export interface BuildContextInput {
  method?: string;
  httpMethod?: string;
  path: string;
  headers: HeaderBag;
  body?: unknown;
  tenantId?: string;
  authContext?: AuthContext;
}

/**
 * Construct a normalized {@link GatewayRequestContext} from a framework request.
 * Derives the JSON-RPC `method`/`toolName` from the body when not supplied.
 */
export function buildRequestContext(input: BuildContextInput): GatewayRequestContext {
  const bodyMethod =
    input.body && typeof input.body === 'object'
      ? ((input.body as Record<string, unknown>).method as string | undefined)
      : undefined;

  return {
    method: input.method ?? bodyMethod,
    httpMethod: input.httpMethod,
    path: input.path,
    headers: input.headers,
    getHeader: buildHeaderAccessor(input.headers),
    tenantId: input.tenantId ?? input.authContext?.tenantId,
    toolName: extractToolName(input.body) ?? undefined,
    body: input.body,
    authContext: input.authContext,
  };
}
