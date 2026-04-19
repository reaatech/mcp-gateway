/**
 * mcp-gateway — Structured Logger
 * Pino-based JSON logging with request_id/tenant_id context and PII redaction
 */

import pinoDefault, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pino = (pinoDefault as any).default || pinoDefault;
import { env } from '../config/env.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../config/constants.js';

/**
 * Paths that should be redacted from logs to protect PII/secrets
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'headers.authorization',
  'headers["x-api-key"]',
  'headers.cookie',
  '*.apiKey',
  '*.api_key',
  '*.password',
  '*.secret',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.clientSecret',
];

/**
 * Build pino options with structured defaults
 */
function buildOptions(): LoggerOptions {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  return options;
}

/**
 * Root logger instance (singleton)
 */
export const logger: PinoLogger = pino(buildOptions());

/**
 * Fields attached to every log line in a request scope
 */
export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Create a child logger with bound context
 */
export function childLogger(context: LogContext): PinoLogger {
  return logger.child(context);
}

/**
 * Redact a token for logging (show first/last 4 chars)
 */
export function redactToken(token: string): string {
  if (!token) {
    return '';
  }
  if (token.length <= 8) {
    return '***';
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Type alias for convenience
 */
export type Logger = PinoLogger;
