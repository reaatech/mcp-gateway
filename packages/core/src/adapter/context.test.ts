/**
 * mcp-gateway — Adapter Context Unit Tests
 * Covers the shared, framework-neutral request-context helpers consumed by
 * every concern's Express and Fastify adapter.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../types/domain.js';
import {
  buildHeaderAccessor,
  buildRequestContext,
  extractToolName,
  getTenantIdFromContext,
} from './context.js';

const authCtx = (tenantId: string): AuthContext => ({
  tenantId,
  scopes: [],
  authMethod: 'api-key',
});

const toolCallBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'weather_get', arguments: { city: 'sf' } },
};

describe('buildHeaderAccessor', () => {
  it('resolves a mixed-case query against lowercase header keys', () => {
    // Node http lowercases incoming header names, so the accessor normalizes
    // the *query* rather than the stored keys.
    const get = buildHeaderAccessor({ 'x-api-key': 'secret' });
    expect(get('x-api-key')).toBe('secret');
    expect(get('X-Api-Key')).toBe('secret');
  });

  it('returns the first value for array-valued headers', () => {
    const get = buildHeaderAccessor({ 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] });
    expect(get('x-forwarded-for')).toBe('1.1.1.1');
  });

  it('returns undefined for a missing header', () => {
    const get = buildHeaderAccessor({});
    expect(get('authorization')).toBeUndefined();
  });
});

describe('extractToolName', () => {
  it('returns the tool name for a tools/call request', () => {
    expect(extractToolName(toolCallBody)).toBe('weather_get');
  });

  it('returns null for non-tools/call methods', () => {
    expect(extractToolName({ method: 'tools/list' })).toBeNull();
  });

  it('returns null when params or name are missing/invalid', () => {
    expect(extractToolName({ method: 'tools/call' })).toBeNull();
    expect(extractToolName({ method: 'tools/call', params: { name: 42 } })).toBeNull();
  });

  it('returns null for non-object bodies', () => {
    expect(extractToolName(undefined)).toBeNull();
    expect(extractToolName('nope')).toBeNull();
    expect(extractToolName(null)).toBeNull();
  });
});

describe('getTenantIdFromContext', () => {
  it('prefers an explicit tenantId', () => {
    const ctx = buildRequestContext({
      path: '/mcp',
      headers: {},
      tenantId: 'explicit',
      authContext: authCtx('from-auth'),
    });
    expect(getTenantIdFromContext(ctx)).toBe('explicit');
  });

  it('falls back to the auth context tenant', () => {
    const ctx = buildRequestContext({
      path: '/mcp',
      headers: {},
      authContext: authCtx('from-auth'),
    });
    expect(getTenantIdFromContext(ctx)).toBe('from-auth');
  });

  it('is undefined when neither is present', () => {
    const ctx = buildRequestContext({ path: '/mcp', headers: {} });
    expect(getTenantIdFromContext(ctx)).toBeUndefined();
  });
});

describe('buildRequestContext', () => {
  it('derives method and toolName from the body', () => {
    const ctx = buildRequestContext({
      httpMethod: 'POST',
      path: '/mcp',
      headers: { 'x-api-key': 'k' },
      body: toolCallBody,
    });
    expect(ctx.method).toBe('tools/call');
    expect(ctx.toolName).toBe('weather_get');
    expect(ctx.httpMethod).toBe('POST');
    expect(ctx.path).toBe('/mcp');
    expect(ctx.getHeader('X-API-KEY')).toBe('k');
  });

  it('prefers an explicit method over the body method', () => {
    const ctx = buildRequestContext({
      path: '/mcp',
      headers: {},
      method: 'override',
      body: { method: 'tools/list' },
    });
    expect(ctx.method).toBe('override');
  });

  it('leaves toolName undefined for non-tool-call bodies', () => {
    const ctx = buildRequestContext({
      path: '/mcp',
      headers: {},
      body: { method: 'tools/list' },
    });
    expect(ctx.toolName).toBeUndefined();
  });

  it('derives tenantId from the auth context when not given explicitly', () => {
    const ctx = buildRequestContext({
      path: '/mcp',
      headers: {},
      authContext: authCtx('tenant-x'),
    });
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.authContext?.tenantId).toBe('tenant-x');
  });
});
