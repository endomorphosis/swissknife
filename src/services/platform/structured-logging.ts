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

import * as fs from 'fs';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as typeof fs | undefined;
const runtimeFs = nodeFs ?? fs;

export const LOG_SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Standard structured-log field names. */
export enum LogField {
  TIMESTAMP          = 'timestamp',
  SCHEMA_VERSION     = 'schema_version',
  LEVEL              = 'level',
  LOGGER             = 'logger',
  LOGGER_NAME        = 'logger',
  MESSAGE            = 'message',
  EVENT_TYPE         = 'event_type',
  REQUEST_ID         = 'request_id',
  TRACE_ID           = 'trace_id',
  SPAN_ID            = 'span_id',
  COMPONENT          = 'component',
  FUNCTION           = 'function',
  OPERATION          = 'operation',
  DURATION_MS        = 'duration_ms',
  CPU_TIME_MS        = 'cpu_time_ms',
  MEMORY_MB          = 'memory_mb',
  ERROR              = 'error',
  ERROR_TYPE         = 'error_type',
  ERROR_MESSAGE      = 'error_message',
  ERROR_STACK        = 'error_stack',
  ERROR_CODE         = 'error_code',
  STACK_TRACE        = 'stack_trace',
  USER_ID            = 'user_id',
  SESSION_ID         = 'session_id',
  FORMULA            = 'formula',
  PROVER             = 'prover',
  PROOF_STATUS       = 'proof_status',
  CONFIDENCE         = 'confidence',
  CACHE_HIT          = 'cache_hit',
  POLICY_CID         = 'policy_cid',
  TOOL_NAME          = 'tool_name',
  INTENT_CID         = 'intent_cid',
  DECISION_CID       = 'decision_cid',
  RECEIPT_CID        = 'receipt_cid',
  POLICY_NAME        = 'policy_name',
  COMPLIANCE_STATUS  = 'compliance_status',
  ACTOR              = 'actor',
  TOOL               = 'tool',
  DECISION           = 'decision',
}

/** Well-known event type categories. */
export enum EventType {
  SYSTEM_START     = 'system.start',
  SYSTEM_STOP      = 'system.stop',
  COMPONENT_INIT   = 'component.init',
  COMPONENT_SHUTDOWN = 'component.shutdown',
  TOOL_INVOKED     = 'mcp.tool.invoked',
  TOOL_COMPLETED   = 'mcp.tool.completed',
  TOOL_FAILED      = 'mcp.tool.failed',
  POLICY_EVALUATED_MCP = 'mcp.policy.evaluated',
  COMPLIANCE_CHECKED = 'mcp.compliance.checked',
  ENTITY_EXTRACTED = 'graphrag.entity.extracted',
  ENTITY_DEDUPLICATED = 'graphrag.entity.deduplicated',
  GRAPH_TRAVERSED  = 'graphrag.graph.traversed',
  QUERY_EXECUTED   = 'graphrag.query.executed',
  ERROR_OCCURRED   = 'error.occurred',
  ERROR_RECOVERED  = 'error.recovered',
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker.closed',
  CUSTOM           = 'custom',
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

export interface JSONLogRecordInput {
  level?: LogLevel | string;
  levelname?: LogLevel | string;
  logger?: string;
  name?: string;
  message?: string;
  msg?: string;
  component?: string;
  function?: string;
  error?: unknown;
  [key: string]: unknown;
}

export class JSONLogFormatter {
  format(record: JSONLogRecordInput): string {
    const error = record.error instanceof Error ? record.error : undefined;
    const entry: Record<string, unknown> = {
      [LogField.TIMESTAMP]: new Date().toISOString(),
      [LogField.SCHEMA_VERSION]: LOG_SCHEMA_VERSION,
      [LogField.LEVEL]: String(record.levelname ?? record.level ?? 'INFO').toUpperCase(),
      [LogField.LOGGER]: record.name ?? record.logger ?? 'root',
      [LogField.MESSAGE]: record.message ?? record.msg ?? '',
      ...logContext.get(),
    };

    for (const [key, value] of Object.entries(record)) {
      if (['level', 'levelname', 'logger', 'name', 'message', 'msg', 'error'].includes(key)) continue;
      if (!key.startsWith('_')) entry[key] = value;
    }

    if (error) {
      entry[LogField.ERROR_TYPE] = error.name;
      entry[LogField.ERROR_MESSAGE] = error.message;
      entry[LogField.ERROR_STACK] = error.stack;
    }

    return JSON.stringify(entry);
  }
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

function emitWithLogger(
  logger: StructuredLogger,
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): LogEntry {
  const entry: LogEntry = {
    [LogField.TIMESTAMP]: new Date().toISOString(),
    [LogField.LEVEL]: level,
    [LogField.LOGGER]: logger.name,
    [LogField.MESSAGE]: message,
    ...logContext.get(),
    ...fields,
  };
  logger.emit(entry);
  return entry;
}

export function log_event(
  event_type: EventType | string,
  logger: StructuredLogger = getLogger('root'),
  level: LogLevel = 'info',
  fields: Record<string, unknown> = {},
): LogEntry {
  return emitWithLogger(logger, level, `Event: ${event_type}`, {
    ...fields,
    [LogField.EVENT_TYPE]: event_type,
  });
}

export const logEvent = log_event;

export function log_error(
  error: Error,
  logger: StructuredLogger = getLogger('root'),
  fields: Record<string, unknown> = {},
): LogEntry {
  return emitWithLogger(logger, 'error', `Error: ${error.name}: ${error.message}`, {
    ...fields,
    [LogField.EVENT_TYPE]: EventType.ERROR_OCCURRED,
    [LogField.ERROR_TYPE]: error.name,
    [LogField.ERROR_MESSAGE]: error.message,
    [LogField.ERROR_STACK]: error.stack,
  });
}

export const logError = log_error;

export function log_performance(
  operation: string,
  duration_ms: number,
  logger: StructuredLogger = getLogger('root'),
  fields: Record<string, unknown> = {},
): LogEntry {
  return emitWithLogger(logger, 'info', `Performance: ${operation} completed in ${duration_ms.toFixed(2)}ms`, {
    ...fields,
    [LogField.EVENT_TYPE]: 'performance.measured',
    [LogField.OPERATION]: operation,
    [LogField.DURATION_MS]: duration_ms,
  });
}

export const logPerformance = log_performance;

export function log_mcp_tool(
  tool_name: string,
  status: 'invoked' | 'completed' | 'failed' | string,
  duration_ms?: number,
  logger: StructuredLogger = getLogger('root'),
  fields: Record<string, unknown> = {},
): LogEntry {
  const eventType = status === 'invoked'
    ? EventType.TOOL_INVOKED
    : status === 'completed'
      ? EventType.TOOL_COMPLETED
      : status === 'failed'
        ? EventType.TOOL_FAILED
        : EventType.CUSTOM;

  return emitWithLogger(logger, 'info', `Tool ${tool_name} ${status}`, {
    ...fields,
    [LogField.TOOL_NAME]: tool_name,
    [LogField.EVENT_TYPE]: eventType,
    ...(duration_ms === undefined ? {} : { [LogField.DURATION_MS]: duration_ms }),
  });
}

export const logMcpTool = log_mcp_tool;

export class LogPerformance {
  private startTime = 0;
  readonly extra: Record<string, unknown>;

  constructor(
    readonly operation: string,
    readonly logger: StructuredLogger = getLogger('root'),
    extra: Record<string, unknown> = {},
  ) {
    this.extra = { ...extra };
  }

  start(): this {
    this.startTime = Date.now();
    return this;
  }

  end(status: 'success' | 'failed' = 'success'): LogEntry {
    const duration = Date.now() - this.startTime;
    return log_performance(this.operation, duration, this.logger, {
      ...this.extra,
      status,
    });
  }

  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    this.start();
    try {
      const result = await fn();
      this.end('success');
      return result;
    } catch (error) {
      this.end('failed');
      throw error;
    }
  }
}

export function parse_json_log_file(log_file: string): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  const content = runtimeFs.readFileSync(log_file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Match Python behavior: skip malformed log lines.
    }
  }
  return records;
}

export const parseJsonLogFile = parse_json_log_file;

export interface LogFilterCriteria {
  level?: string;
  event_type?: string;
  component?: string;
  request_id?: string;
}

export function filter_logs(
  records: Array<Record<string, unknown>>,
  criteria: LogFilterCriteria = {},
): Array<Record<string, unknown>> {
  return records.filter(record => {
    if (criteria.level !== undefined && record[LogField.LEVEL] !== criteria.level) return false;
    if (criteria.event_type !== undefined && record[LogField.EVENT_TYPE] !== criteria.event_type) return false;
    if (criteria.component !== undefined && record[LogField.COMPONENT] !== criteria.component) return false;
    if (criteria.request_id !== undefined && record[LogField.REQUEST_ID] !== criteria.request_id) return false;
    return true;
  });
}

export const filterLogs = filter_logs;
