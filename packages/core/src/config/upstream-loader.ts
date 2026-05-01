/**
 * mcp-gateway — Upstream Server Loader
 * Loads upstream server definitions with SSRF protection
 */

import { lookup as dnsLookup } from 'node:dns';
import { URL } from 'node:url';
import type { UpstreamServer } from '../types/schemas.js';
import { getTenant, listTenants } from './tenant-loader.js';

/**
 * Extended upstream with health status (mutable at runtime)
 */
export interface UpstreamServerWithHealth extends UpstreamServer {
  healthy?: boolean;
}

/**
 * URL validation result type (from validateUpstreamUrl)
 */
export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validation result type (with upstream name)
 */
export interface ValidationResult {
  name: string;
  valid: boolean;
  reason?: string;
}

/**
 * All upstreams validation result type
 */
export interface AllUpstreamsResult {
  tenantId: string;
  name: string;
  valid: boolean;
  reason?: string;
}

/**
 * Private IP ranges that should be rejected for upstream URLs (SSRF protection)
 */
const PRIVATE_IP_RANGES = [
  // IPv4 private ranges
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^127\./, // 127.0.0.0/8 (loopback)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^0\./, // 0.0.0.0/8
  // IPv6 private ranges
  /^::1$/, // ::1 (loopback)
  /^fc00:/, // fc00::/7 (unique local)
  /^fe80:/, // fe80::/10 (link-local)
];

/**
 * Localhost patterns
 */
const LOCALHOST_PATTERNS = [/^localhost$/i, /^::1$/, /^0\.+\.+\.+\.?$/];

const DNS_RESOLVE_TIMEOUT_MS = 2000;

function parseIPAddress(hostname: string): { ip: string; family: 'IPv4' | 'IPv6' } | null {
  // Try IPv4 first
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = hostname.match(ipv4Regex);
  if (ipv4Match) {
    const a = ipv4Match[1] ?? '';
    const b = ipv4Match[2] ?? '';
    const c = ipv4Match[3] ?? '';
    const d = ipv4Match[4] ?? '';

    const parseOctet = (o: string): number => {
      if (o.startsWith('0x') || o.startsWith('0X')) {
        return Number.parseInt(o, 16);
      }
      if (o.startsWith('0') && o.length > 1) {
        return Number.parseInt(o, 8);
      }
      return Number.parseInt(o, 10);
    };

    const ip = [parseOctet(a), parseOctet(b), parseOctet(c), parseOctet(d)].join('.');
    return { ip, family: 'IPv4' };
  }

  // Try IPv6
  const ipv6Patterns = [
    /^::1$/,
    /^::$/,
    /^fe80:/i,
    /^fc00:/i,
    /^fd00:/i,
    /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
    /^([0-9a-fA-F]{1,4}:){1,7}:$/,
    /^:(:[0-9a-fA-F]{1,4}){1,7}$/,
  ];

  for (const pattern of ipv6Patterns) {
    if (pattern.test(hostname)) {
      return { ip: hostname, family: 'IPv6' };
    }
  }

  // Check if it's an IPv6 compressed form
  if (hostname.includes(':') && hostname.split(':').length >= 3) {
    return { ip: hostname, family: 'IPv6' };
  }

  return null;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) {
    return false;
  }
  const [a, b, c, d] = parts as [number, number, number, number];

  // 10.0.0.0/8
  if (a === 10) {
    return true;
  }
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  // 192.168.0.0/16
  if (a === 192 && b === 168) {
    return true;
  }
  // 127.0.0.0/8
  if (a === 127) {
    return true;
  }
  // 169.254.0.0/16
  if (a === 169 && b === 254) {
    return true;
  }
  // 0.0.0.0/8
  if (a === 0) {
    return true;
  }
  // 100.64.0.0/10 (CGN)
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  void c;
  void d;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc00:') ||
    lower.startsWith('fd00:') ||
    lower.startsWith('fc')
  );
}

function isLoopbackIP(ip: string, family: 'IPv4' | 'IPv6'): boolean {
  if (family === 'IPv4') {
    return ip.startsWith('127.') || ip === '0.0.0.0';
  }
  return ip === '::1' || ip === '::';
}

/**
 * Check if an IP address is private or localhost
 */
function isPrivateOrLocalhost(hostname: string): boolean {
  // Check if hostname is an IP address
  const parsed = parseIPAddress(hostname);
  if (parsed) {
    if (isLoopbackIP(parsed.ip, parsed.family)) {
      return true;
    }
    if (parsed.family === 'IPv4' && isPrivateIPv4(parsed.ip)) {
      return true;
    }
    if (parsed.family === 'IPv6' && isPrivateIPv6(parsed.ip)) {
      return true;
    }
    return false;
  }

  // Check localhost patterns
  for (const pattern of LOCALHOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Check private IP range regex patterns (for hostnames that are IPs)
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve hostname to IP addresses and check for private IPs
 */
function resolveAndCheckSSRF(hostname: string): Promise<UrlValidationResult> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ valid: false, reason: `DNS resolution timeout for ${hostname}` });
    }, DNS_RESOLVE_TIMEOUT_MS);

    dnsLookup(hostname, { family: 4 }, (err, address) => {
      clearTimeout(timeoutId);
      if (err || !address) {
        // Try IPv6
        dnsLookup(hostname, { family: 6 }, (err6, address6) => {
          if (err6 || !address6) {
            resolve({ valid: false, reason: `DNS resolution failed for ${hostname}` });
            return;
          }
          if (isPrivateOrLocalhost(address6)) {
            resolve({
              valid: false,
              reason: `SSRF protection: ${hostname} resolves to private IP ${address6}`,
            });
            return;
          }
          resolve({ valid: true });
        });
        return;
      }
      if (isPrivateOrLocalhost(address)) {
        resolve({
          valid: false,
          reason: `SSRF protection: ${hostname} resolves to private IP ${address}`,
        });
        return;
      }
      resolve({ valid: true });
    });
  });
}

/**
 * Validate an upstream URL for SSRF protection
 * Returns true if the URL is safe to use
 */
export function validateUpstreamUrl(urlString: string): UrlValidationResult {
  try {
    const url = new URL(urlString);

    // Only allow HTTP and HTTPS
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        valid: false,
        reason: `Invalid protocol: ${url.protocol}. Only http/https allowed.`,
      };
    }

    const hostname = url.hostname;

    // First check if hostname is already a private/localhost IP
    if (isPrivateOrLocalhost(hostname)) {
      return {
        valid: false,
        reason: `SSRF protection: Upstream URL cannot point to localhost or private IP ranges (${hostname})`,
      };
    }

    // If hostname is not an IP, we need to resolve DNS to check for private IPs
    if (!parseIPAddress(hostname)) {
      // Synchronous check failed, but we need to do async DNS lookup
      // This is a limitation - for config loading we do sync validation
      // So we just validate the hostname string pattern for known bad patterns
      // Real SSRF protection with DNS requires async validation at request time
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: `Invalid URL: ${urlString}` };
  }
}

/**
 * Async SSRF validation that resolves DNS
 */
export async function validateUpstreamUrlAsync(urlString: string): Promise<UrlValidationResult> {
  try {
    const url = new URL(urlString);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        valid: false,
        reason: `Invalid protocol: ${url.protocol}. Only http/https allowed.`,
      };
    }

    const hostname = url.hostname;

    // Check if hostname is already a private/localhost IP
    if (isPrivateOrLocalhost(hostname)) {
      return {
        valid: false,
        reason: `SSRF protection: Upstream URL cannot point to localhost or private IP ranges (${hostname})`,
      };
    }

    // If hostname is not an IP, resolve DNS
    if (!parseIPAddress(hostname)) {
      return resolveAndCheckSSRF(hostname);
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: `Invalid URL: ${urlString}` };
  }
}

/**
 * Get upstream servers for a specific tenant
 */
export function getUpstreams(tenantId: string): UpstreamServerWithHealth[] {
  const tenant = getTenant(tenantId);
  if (!tenant) {
    return [];
  }

  // Return a mutable copy with health status tracking
  return tenant.upstreams.map((u) => ({ ...u }));
}

/**
 * Get healthy upstream servers for a specific tenant
 */
export function getHealthyUpstreams(tenantId: string): UpstreamServerWithHealth[] {
  const upstreams = getUpstreams(tenantId);
  return upstreams.filter((upstream) => upstream.healthy !== false);
}

/**
 * Mark an upstream as healthy or unhealthy
 */
export function markUpstreamHealthy(
  tenantId: string,
  upstreamName: string,
  healthy: boolean,
): void {
  const tenant = getTenant(tenantId);
  if (!tenant) {
    return;
  }

  const upstream = tenant.upstreams.find((u) => u.name === upstreamName);
  if (upstream) {
    (upstream as UpstreamServerWithHealth).healthy = healthy;
  }
}

/**
 * Validate all upstream URLs for a tenant
 * Returns validation results for each upstream
 */
export function validateTenantUpstreams(tenantId: string): ValidationResult[] {
  const upstreams = getUpstreams(tenantId);
  return upstreams.map((upstream) => {
    const validation = validateUpstreamUrl(upstream.url);
    const result: ValidationResult = {
      name: upstream.name,
      valid: validation.valid,
    };
    if (validation.reason !== undefined) {
      result.reason = validation.reason;
    }
    return result;
  });
}

/**
 * Validate all upstream URLs across all tenants
 */
export function validateAllUpstreams(): AllUpstreamsResult[] {
  const tenants = listTenants();
  const results: AllUpstreamsResult[] = [];

  for (const tenant of tenants) {
    const upstreamValidations = validateTenantUpstreams(tenant.tenantId);
    for (const validation of upstreamValidations) {
      const entry: AllUpstreamsResult = {
        tenantId: tenant.tenantId,
        name: validation.name,
        valid: validation.valid,
      };
      if (validation.reason !== undefined) {
        entry.reason = validation.reason;
      }
      results.push(entry);
    }
  }

  return results;
}

/**
 * Get upstream by name for a specific tenant
 */
export function getUpstreamByName(
  tenantId: string,
  upstreamName: string,
): UpstreamServerWithHealth | undefined {
  const upstreams = getUpstreams(tenantId);
  return upstreams.find((u) => u.name === upstreamName);
}

/**
 * Select upstreams based on weights (for load balancing)
 * Returns upstreams sorted by weight (descending)
 */
export function getWeightedUpstreams(tenantId: string): UpstreamServerWithHealth[] {
  const upstreams = getHealthyUpstreams(tenantId);
  return upstreams.sort((a, b) => (b.weight || 0) - (a.weight || 0));
}
