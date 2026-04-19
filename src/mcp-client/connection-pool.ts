/**
 * mcp-gateway — Connection Pool
 * Manages reusable connections to upstream servers
 */

import type { ConnectionPoolConfig, UpstreamConfig } from './types.js';

/**
 * Connection entry in the pool
 */
interface PoolEntry {
  url: string;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
}

/**
 * Default connection pool configuration
 */
export const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnectionsPerHost: 10,
  idleTimeoutMs: 60000,
  maxLifetimeMs: 300000,
};

/**
 * Connection pool for upstream servers
 * Note: With native fetch API, we manage logical connections/stats
 * rather than actual TCP connections
 */
export class ConnectionPool {
  private connections = new Map<string, PoolEntry>();
  private config: ConnectionPoolConfig;

  constructor(config: ConnectionPoolConfig = DEFAULT_POOL_CONFIG) {
    this.config = config;
  }

  /**
   * Get or create a connection for an upstream
   */
  getConnection(upstream: UpstreamConfig): PoolEntry {
    const existing = this.connections.get(upstream.url);

    if (existing) {
      const now = Date.now();
      const idleTime = now - existing.lastUsed;
      const lifetime = now - existing.createdAt;

      if (idleTime > this.config.idleTimeoutMs || lifetime > this.config.maxLifetimeMs) {
        this.connections.delete(upstream.url);
        return this.createConnection(upstream.url);
      }

      existing.lastUsed = now;
      existing.requestCount++;
      return existing;
    }

    // Count connections by host
    let hostConnections = 0;
    try {
      const url = new URL(upstream.url);
      for (const conn of this.connections.values()) {
        try {
          const connUrl = new URL(conn.url);
          if (connUrl.host === url.host) {
            hostConnections++;
          }
        } catch {
          // Ignore parse errors
        }
      }
    } catch {
      hostConnections = Array.from(this.connections.values()).filter(
        c => c.url === upstream.url,
      ).length;
    }

    if (hostConnections >= this.config.maxConnectionsPerHost) {
      let lruConn: PoolEntry | null = null;
      let lruTime = Date.now();

      try {
        const targetHost = new URL(upstream.url).host;
        for (const conn of this.connections.values()) {
          try {
            const connUrl = new URL(conn.url);
            if (connUrl.host === targetHost && conn.lastUsed < lruTime) {
              lruTime = conn.lastUsed;
              lruConn = conn;
            }
          } catch {
            // Ignore parse errors
          }
        }
      } catch {
        const exactMatches = Array.from(this.connections.values()).filter(
          c => c.url === upstream.url,
        );
        lruConn = exactMatches.length > 0
          ? exactMatches.reduce((a, b) =>
              a.lastUsed < b.lastUsed ? a : b)
          : null;
      }

      if (lruConn) {
        lruConn.lastUsed = Date.now();
        lruConn.requestCount++;
        return lruConn;
      }
    }

    return this.createConnection(upstream.url);
  }

  private createConnection(url: string): PoolEntry {
    const entry: PoolEntry = {
      url,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      requestCount: 1,
    };
    this.connections.set(url, entry);
    return entry;
  }

  /**
   * Release a connection (mark as available)
   */
  release(url: string): void {
    const entry = this.connections.get(url);
    if (entry) {
      entry.lastUsed = Date.now();
    }
  }

  /**
   * Remove a connection
   */
  remove(url: string): boolean {
    return this.connections.delete(url);
  }

  /**
   * Clean up idle and expired connections
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [url, entry] of this.connections.entries()) {
      const idleTime = now - entry.lastUsed;
      const lifetime = now - entry.createdAt;

      if (idleTime > this.config.idleTimeoutMs || lifetime > this.config.maxLifetimeMs) {
        this.connections.delete(url);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    uniqueHosts: number;
    connections: PoolEntry[];
  } {
    const hosts = new Set<string>();
    const connections = Array.from(this.connections.values());

    for (const conn of connections) {
      try {
        const url = new URL(conn.url);
        hosts.add(url.host);
      } catch {
        hosts.add(conn.url);
      }
    }

    return {
      totalConnections: connections.length,
      uniqueHosts: hosts.size,
      connections,
    };
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.connections.clear();
  }
}
