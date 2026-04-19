/**
 * mcp-gateway — In-Memory LRU Cache
 * In-memory cache implementation for development and testing
 */

import type { CacheEntry, CacheStats } from './types.js';
import { createHash } from 'node:crypto';

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {return '';}
  if (typeof value !== 'object') {return JSON.stringify(value);}
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function escapeKeyPart(part: string): string {
  return part.replace(/=/g, '=3D').replace(/\|/g, '=1P');
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, evictions: 0 };
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  static generateKey(tenantId: string, method: string, params?: unknown): string {
    const paramsStr = params ? stableStringify(params) : '';
    const raw = `${escapeKeyPart(tenantId)}|${escapeKeyPart(method)}|${paramsStr}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Get value from cache
   */
  get(key: string): { value: unknown | undefined; expiresAt: number | undefined } {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return { value: undefined, expiresAt: undefined };
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return { value: undefined, expiresAt: undefined };
    }

    // Move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return { value: entry.value, expiresAt: entry.expiresAt };
  }

  /**
   * Set value in cache
   */
  set(key: string, value: unknown, ttlSeconds: number, metadata?: Partial<CacheEntry>): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    const now = Date.now();
    const entry: CacheEntry = {
      key,
      value,
      expiresAt: now + ttlSeconds * 1000,
      createdAt: now,
      ...metadata,
    };

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {return false;}
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.updateStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get all keys (for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  private updateStats(): void {
    this.stats.size = this.cache.size;
  }
}
