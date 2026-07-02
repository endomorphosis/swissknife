/**
 * Structured Logging — T-216 (Sprint 48)
 *
 * Port of ipfs_datasets_py/logic/observability/structured_logging.py
 *
 * Provides structured JSON-compatible logging with:
 *  - `LogField` enum of standard field names
 *  - `EventType` enum of well-known event categories
 *  - Thread-local-like `LogContext` (per-call-stack context map)
 *  - `getLogger()` factory returning a structured logger
 *  - `structuredLog()` convenience function
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Standard structured-log field names. */
export enum LogField {
  TIMESTAMP          = 'timestamp',
  LEVEL              = 'level',
  LOGGER             = 'logger',
  MESSAGE            = 'message',
  EVENT_TYPE         = 'event_type',
  TRACE_ID           = 'trace_id',
  SPAN_ID            = 'span_id',
  COMPONENT          = 'component',
  OPERATION          = 'operation',
  DURATION_MS        = 'duration_ms',
  ERROR              = 'error',
  ERROR_TYPE         = 'error_type',
  STACK_TRACE        = 'stack_trace',
  USER_ID            = 'user_id',
  SESSION_ID         = 'session_id',
  FORMULA            = 'formula',
  PROVER             = 'prover',
  PROOF_STATUS       = 'proof_status',
  CONFIDENCE         = 'confidence',
  CACHE_HIT          = 'cache_hit',
  POLICY_CID         = 'policy_cid',
  ACTOR              = 'actor',
  TOOL               = 'tool',
  DECISION           = 'decision',
}

/** Well-known event type categories. */
export enum EventType {
  PROOF_STARTED    = 'proof_started',
  PROOF_COMPLETED  = 'proof_completed',
  PROOF_FAILED     = 'proof_failed',
  CACHE_HIT        = 'cache_hit',
  CACHE_MISS       = 'cache_miss',
  POLICY_EVALUATED = 'policy_evaluated',
  POLICY_CONFLICT  = 'policy_conflict',
  ZKP_GENERATED    = 'zkp_generated',
  ZKP_VERIFIED     = 'zkp_verified',
  ERROR            = 'error',
  AUDIT            = 'audit',
  METRICS          = 'metrics',
  PROVER_SELECTED  = 'prover_selected',
  FORMULA_ANALYZED = 'formula_analyzed',
  NL_CONVERTED     = 'nl_converted',
}

// ---------------------------------------------------------------------------
// LogContext — lightweight per-"thread" context store
// ---------------------------------------------------------------------------

/**
 * A context map that is automatically included in every structured log call.
 *
 * Because JavaScript is single-threaded, this is implemented as a simple
 * module-level Map rather than a true thread-local.  For async code, callers
 * should `clear()` between unrelated request chains.
 */
export interface LogContext {
  get(): Record<string, unknown>;
  set(fields: Record<string, unknown>): void;
  clear(): void;
}

const _contextStore = new Map<string, unknown>();

export const logContext: LogContext = {
  get():                   Record<string, unknown> { return Object.fromEntries(_contextStore); },
  set(f: Record<string, unknown>): void { for (const [k, v] of Object.entries(f)) _contextStore.set(k, v); },
  clear():                 void { _contextStore.clear(); },
};

// Convenience module-level helpers matching the Python API
export function getCurrentContext(): Record<string, unknown> { return logContext.get(); }
export function setContext(fields: Record<string, unknown>): void { logContext.set(fields); }
export function clearContext(): void { logContext.clear(); }

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10, info: 20, warning: 30, error: 40, critical: 50,
};

// ---------------------------------------------------------------------------
// Structured log entry
// ---------------------------------------------------------------------------

export interface LogEntry {
  [LogField.TIMESTAMP]: string;
  [LogField.LEVEL]:     LogLevel;
  [LogField.LOGGER]:    string;
  [LogField.MESSAGE]:   string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// StructuredLogger
// ---------------------------------------------------------------------------

export interface StructuredLogger {
  readonly name: string;
  readonly minLevel: LogLevel;
  debug   (message: string, fields?: Record<string, unknown>): void;
  info    (message: string, fields?: Record<string, unknown>): void;
  warning (message: string, fields?: Record<string, unknown>): void;
  error   (message: string, fields?: Record<string, unknown>): void;
  critical(message: string, fields?: Record<string, unknown>): void;
  log     (level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  /** Emit a structured JSON line to the sink. */
  emit(entry: LogEntry): void;
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

export type LogSink = (entry: LogEntry) => void;

const DEFAULT_SINK: LogSink = (entry) => {
  // Use console.error for warning+ so it goes to stderr in Node; info → stdout
  const method = entry.level === 'debug' || entry.level === 'info' ? 'log' : 'error';
  console[method](JSON.stringify(entry));
};

/** All loggers keyed by name. */
const _loggerRegistry = new Map<string, StructuredLogger>();

/**
 * Get (or create) a structured logger for `name`.
 *
 * @param name     - Logger name / component identifier.
 * @param minLevel - Minimum level to emit (default `'info'`).
 * @param sink     - Where to write log entries (default: `console`).
 */
export function getLogger(
  name: string,
  minLevel: LogLevel = 'info',
  sink: LogSink = DEFAULT_SINK,
): StructuredLogger {
  if (_loggerRegistry.has(name)) return _loggerRegistry.get(name)!;

  const logger: StructuredLogger = {
    name,
    minLevel,

    emit(entry: LogEntry): void {
      if (LEVEL_PRIORITY[entry.level] >= LEVEL_PRIORITY[this.minLevel]) {
        sink(entry);
      }
    },

    log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
      this.emit({
        [LogField.TIMESTAMP]: new Date().toISOString(),
        [LogField.LEVEL]:     level,
        [LogField.LOGGER]:    this.name,
        [LogField.MESSAGE]:   message,
        ...logContext.get(),
        ...fields,
      });
    },

    debug   (m, f?) { this.log('debug',    m, f); },
    info    (m, f?) { this.log('info',     m, f); },
    warning (m, f?) { this.log('warning',  m, f); },
    error   (m, f?) { this.log('error',    m, f); },
    critical(m, f?) { this.log('critical', m, f); },
  };

  _loggerRegistry.set(name, logger);
  return logger;
}

// ---------------------------------------------------------------------------
// Module-level convenience
// ---------------------------------------------------------------------------

/**
 * Emit a single structured log entry.
 *
 * @param level   - Log level.
 * @param event   - Event type (`EventType` value or arbitrary string).
 * @param message - Human-readable log message.
 * @param fields  - Additional structured fields.
 */
export function structuredLog(
  level: LogLevel,
  event: EventType | string,
  message: string,
  fields: Record<string, unknown> = {},
): LogEntry {
  const entry: LogEntry = {
    [LogField.TIMESTAMP]:  new Date().toISOString(),
    [LogField.LEVEL]:      level,
    [LogField.LOGGER]:     'root',
    [LogField.MESSAGE]:    message,
    [LogField.EVENT_TYPE]: event,
    ...logContext.get(),
    ...fields,
  };
  DEFAULT_SINK(entry);
  return entry;
}
