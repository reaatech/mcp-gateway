/**
 * mcp-gateway — Quota Manager
 * Manages daily quota tracking and reset scheduling
 */

import type { QuotaResult } from './types.js';

/**
 * Quota tracking entry
 */
interface QuotaEntry {
  count: number;
  resetAt: number;
  limit: number;
}

/**
 * Quota manager for tracking daily limits
 */
export class QuotaManager {
  private readonly quotas = new Map<string, QuotaEntry>();

  /**
   * Check and consume quota
   */
  checkQuota(key: string, dailyLimit: number): QuotaResult {
    const now = Date.now();
    let entry = this.quotas.get(key);

    // Initialize or reset if needed
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + 86400000, // 24 hours
        limit: dailyLimit,
      };
      this.quotas.set(key, entry);
    }

    // Check if quota exceeded
    if (entry.count >= entry.limit) {
      return {
        allowed: false,
        remaining: 0,
        limit: entry.limit,
        reset: entry.resetAt,
      };
    }

    // Consume quota
    entry.count++;

    return {
      allowed: true,
      remaining: entry.limit - entry.count,
      limit: entry.limit,
      reset: entry.resetAt,
    };
  }

  /**
   * Get remaining quota without consuming
   */
  getRemaining(key: string, dailyLimit: number): number {
    const entry = this.quotas.get(key);
    const now = Date.now();

    if (!entry || now >= entry.resetAt) {
      return dailyLimit;
    }

    return Math.max(0, entry.limit - entry.count);
  }

  /**
   * Reset quota for a key
   */
  reset(key: string): void {
    this.quotas.delete(key);
  }

  /**
   * Get usage statistics for a key
   */
  getUsage(key: string): { used: number; limit: number; resetAt: number } | null {
    const entry = this.quotas.get(key);
    if (!entry) {
      return null;
    }

    return {
      used: entry.count,
      limit: entry.limit,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.quotas.entries()) {
      if (now >= entry.resetAt) {
        this.quotas.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all quotas
   */
  clear(): void {
    this.quotas.clear();
  }
}
