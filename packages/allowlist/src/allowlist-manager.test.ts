/**
 * mcp-gateway — Tool Allowlist Unit Tests
 */

import { describe, expect, it } from 'vitest';
import { checkToolAccess, matchesPattern, validateAllowlist } from './allowlist-manager.js';
import type { ToolAllowlist } from './types.js';

describe('matchesPattern', () => {
  it('matches exact tool names', () => {
    expect(matchesPattern('glean_search', 'glean_search')).toBe(true);
    expect(matchesPattern('glean_search', 'other_tool')).toBe(false);
  });

  it('matches wildcard * patterns', () => {
    expect(matchesPattern('glean_search', 'glean_*')).toBe(true);
    expect(matchesPattern('glean_query', 'glean_*')).toBe(true);
    expect(matchesPattern('serval_search', 'glean_*')).toBe(false);
  });

  it('matches suffix wildcard patterns', () => {
    expect(matchesPattern('glean_search', '*_search')).toBe(true);
    expect(matchesPattern('serval_search', '*_search')).toBe(true);
    expect(matchesPattern('glean_query', '*_search')).toBe(false);
  });

  it('matches full wildcard', () => {
    expect(matchesPattern('any_tool', '*')).toBe(true);
    expect(matchesPattern('another_tool', '*')).toBe(true);
  });

  it('matches single char wildcard ?', () => {
    expect(matchesPattern('tool1', 'tool?')).toBe(true);
    expect(matchesPattern('toolX', 'tool?')).toBe(true);
    expect(matchesPattern('tool12', 'tool?')).toBe(false);
  });

  it('handles special regex characters in tool names', () => {
    expect(matchesPattern('tool.test', 'tool.test')).toBe(true);
    expect(matchesPattern('tool+test', 'tool+test')).toBe(true);
    expect(matchesPattern('tool[test]', 'tool[test]')).toBe(true);
  });
});

describe('checkToolAccess', () => {
  describe('allow mode', () => {
    const allowAllowlist: ToolAllowlist = {
      mode: 'allow',
      tools: ['glean_*', 'serval_*', 'internal_admin'],
    };

    it('allows tools matching patterns', () => {
      const result = checkToolAccess('glean_search', allowAllowlist);
      expect(result.allowed).toBe(true);
      expect(result.matchedPattern).toBe('glean_*');
    });

    it('allows exact match tools', () => {
      const result = checkToolAccess('internal_admin', allowAllowlist);
      expect(result.allowed).toBe(true);
    });

    it('denies tools not matching any pattern', () => {
      const result = checkToolAccess('admin_delete_all', allowAllowlist);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the allowed list');
    });
  });

  describe('deny mode', () => {
    const denyAllowlist: ToolAllowlist = {
      mode: 'deny',
      tools: ['admin_*', 'dangerous_tool'],
    };

    it('allows tools not matching deny patterns', () => {
      const result = checkToolAccess('glean_search', denyAllowlist);
      expect(result.allowed).toBe(true);
    });

    it('denies tools matching deny patterns', () => {
      const result = checkToolAccess('admin_delete_all', denyAllowlist);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('denies exact match tools', () => {
      const result = checkToolAccess('dangerous_tool', denyAllowlist);
      expect(result.allowed).toBe(false);
    });
  });

  describe('no allowlist', () => {
    it('allows all tools when no allowlist configured', () => {
      const result = checkToolAccess('any_tool', undefined);
      expect(result.allowed).toBe(true);
    });

    it('allows all tools when allowlist is empty', () => {
      const result = checkToolAccess('any_tool', { mode: 'allow', tools: [] });
      expect(result.allowed).toBe(true);
    });
  });
});

describe('validateAllowlist', () => {
  it('validates correct allowlist', () => {
    const errors = validateAllowlist({ mode: 'allow', tools: ['tool1'] });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid mode', () => {
    const errors = validateAllowlist({ mode: 'invalid' as 'allow', tools: ['tool1'] });
    expect(errors).toContainEqual(expect.stringContaining('mode must be'));
  });

  it('rejects non-array tools', () => {
    const errors = validateAllowlist({ mode: 'allow', tools: 'tool1' as unknown as string[] });
    expect(errors).toContainEqual(expect.stringContaining('must be an array'));
  });

  it('rejects empty tools array', () => {
    const errors = validateAllowlist({ mode: 'allow', tools: [] });
    expect(errors).toContainEqual(expect.stringContaining('must not be empty'));
  });
});
