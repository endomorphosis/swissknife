/**
 * Structured audit logging for logic proof and security events.
 *
 * TypeScript port of ipfs_datasets_py/logic/security/audit_log.py.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AuditEvent {
  timestamp: string;
  event_type: string;
  user_id: string;
  success: boolean;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuditLoggerOptions {
  logPath?: string | null;
  clock?: () => Date;
}

export class AuditLogger {
  readonly logPath: string | null;
  readonly events: AuditEvent[] = [];
  private readonly clock: () => Date;

  constructor(options: string | null | AuditLoggerOptions = {}) {
    if (typeof options === 'string') {
      this.logPath = options;
      this.clock = () => new Date();
    } else if (options === null) {
      this.logPath = null;
      this.clock = () => new Date();
    } else {
      this.logPath = options.logPath ?? null;
      this.clock = options.clock ?? (() => new Date());
    }

    if (this.logPath) {
      mkdirSync(dirname(this.logPath), { recursive: true });
    }
  }

  logEvent(
    eventType: string,
    userId: string,
    success: boolean,
    details: Record<string, unknown> | null = null,
    extra: Record<string, unknown> = {},
  ): AuditEvent {
    const event: AuditEvent = {
      timestamp: this.clock().toISOString(),
      event_type: eventType,
      user_id: userId,
      success,
      ...extra,
    };
    if (details && Object.keys(details).length > 0) {
      event.details = { ...details };
    }

    this.events.push(event);
    if (this.logPath) {
      appendFileSync(this.logPath, `${JSON.stringify(event)}\n`, 'utf8');
    }
    return event;
  }

  logProofAttempt(
    userId: string,
    formula: string,
    prover: string,
    success: boolean,
    durationMs: number,
    cached = false,
    error: string | null = null,
  ): AuditEvent {
    const details: Record<string, unknown> = {
      formula: String(formula).slice(0, 100),
      prover,
      duration_ms: durationMs,
      cached,
    };
    if (error) details.error = error;
    return this.logEvent('proof_attempt', userId, success, details);
  }

  logSecurityEvent(
    userId: string,
    eventType: string,
    severity: string,
    message: string,
    details: Record<string, unknown> | null = null,
  ): AuditEvent {
    return this.logEvent(`security.${eventType}`, userId, false, {
      severity,
      message,
      ...(details ?? {}),
    });
  }

  logRateLimitExceeded(userId: string, calls: number, period: number): AuditEvent {
    return this.logSecurityEvent(
      userId,
      'rate_limit_exceeded',
      'medium',
      `User exceeded rate limit of ${calls} calls per ${period}s`,
      { limit_calls: calls, limit_period: period },
    );
  }

  logValidationError(userId: string, validationType: string, errorMessage: string): AuditEvent {
    return this.logSecurityEvent(
      userId,
      'validation_error',
      'low',
      `Input validation failed: ${validationType}`,
      { validation_type: validationType, error: errorMessage },
    );
  }

  log_event = this.logEvent.bind(this);
  log_proof_attempt = this.logProofAttempt.bind(this);
  log_security_event = this.logSecurityEvent.bind(this);
  log_rate_limit_exceeded = this.logRateLimitExceeded.bind(this);
  log_validation_error = this.logValidationError.bind(this);
}

let auditLogger: AuditLogger | null = null;

export function getAuditLogger(options: string | null | AuditLoggerOptions = {}): AuditLogger {
  const requestedPath = typeof options === 'string' || options === null
    ? options
    : options.logPath ?? null;
  if (!auditLogger || (requestedPath && auditLogger.logPath !== requestedPath)) {
    auditLogger = new AuditLogger(options);
  }
  return auditLogger;
}

export function resetAuditLogger(options: string | null | AuditLoggerOptions = {}): AuditLogger {
  auditLogger = new AuditLogger(options);
  return auditLogger;
}

export function logProofAttempt(
  userId: string,
  formula: string,
  prover: string,
  success: boolean,
  durationMs: number,
  cached = false,
  error: string | null = null,
): AuditEvent {
  return getAuditLogger().logProofAttempt(userId, formula, prover, success, durationMs, cached, error);
}

export function logSecurityEvent(
  userId: string,
  eventType: string,
  severity: string,
  message: string,
  details: Record<string, unknown> | null = null,
): AuditEvent {
  return getAuditLogger().logSecurityEvent(userId, eventType, severity, message, details);
}

export const get_audit_logger = getAuditLogger;
export const log_proof_attempt = logProofAttempt;
export const log_security_event = logSecurityEvent;
