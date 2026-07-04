/**
 * Central logic-module configuration.
 *
 * TypeScript port of ipfs_datasets_py/logic/config.py.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { ConfigurationError } from './logic-errors.js';

export type ProverOptions = Record<string, unknown>;
export type ProverMap = Record<string, ProverConfig>;
export type EnvMap = Record<string, string | undefined>;

export interface ProverConfigInput {
  enabled?: boolean;
  timeout?: number;
  max_memory_mb?: number;
  maxMemoryMb?: number;
  options?: ProverOptions;
}

export interface CacheConfigInput {
  backend?: string;
  maxsize?: number;
  ttl?: number;
  redis_url?: string | null;
  redisUrl?: string | null;
  redis_db?: number;
  redisDb?: number;
  enable_persistence?: boolean;
  enablePersistence?: boolean;
  persistence_path?: string | null;
  persistencePath?: string | null;
}

export interface SecurityConfigInput {
  rate_limit_calls?: number;
  rateLimitCalls?: number;
  rate_limit_period?: number;
  rateLimitPeriod?: number;
  max_text_length?: number;
  maxTextLength?: number;
  max_formula_depth?: number;
  maxFormulaDepth?: number;
  max_formula_complexity?: number;
  maxFormulaComplexity?: number;
  enable_audit_log?: boolean;
  enableAuditLog?: boolean;
  audit_log_path?: string | null;
  auditLogPath?: string | null;
  enable_input_validation?: boolean;
  enableInputValidation?: boolean;
}

export interface MonitoringConfigInput {
  enabled?: boolean;
  port?: number;
  log_level?: string;
  logLevel?: string;
  metrics_backend?: string;
  metricsBackend?: string;
  enable_tracing?: boolean;
  enableTracing?: boolean;
  tracing_backend?: string;
  tracingBackend?: string;
}

export interface LogicConfigInput {
  provers?: Record<string, ProverConfig | ProverConfigInput>;
  cache?: CacheConfig | CacheConfigInput;
  security?: SecurityConfig | SecurityConfigInput;
  monitoring?: MonitoringConfig | MonitoringConfigInput;
}

export class ProverConfig {
  readonly enabled: boolean;
  readonly timeout: number;
  readonly maxMemoryMb: number;
  readonly options: ProverOptions;

  constructor(input: ProverConfigInput = {}) {
    this.enabled = input.enabled ?? true;
    this.timeout = input.timeout ?? 5.0;
    this.maxMemoryMb = input.maxMemoryMb ?? input.max_memory_mb ?? 2048;
    this.options = { ...(input.options ?? {}) };
  }

  toDict(): Record<string, unknown> {
    return {
      enabled: this.enabled,
      timeout: this.timeout,
      max_memory_mb: this.maxMemoryMb,
      options: { ...this.options },
    };
  }
}

export class CacheConfig {
  readonly backend: string;
  readonly maxsize: number;
  readonly ttl: number;
  readonly redisUrl: string | null;
  readonly redisDb: number;
  readonly enablePersistence: boolean;
  readonly persistencePath: string | null;

  constructor(input: CacheConfigInput = {}) {
    this.backend = input.backend ?? 'memory';
    this.maxsize = input.maxsize ?? 10000;
    this.ttl = input.ttl ?? 3600;
    this.redisUrl = input.redisUrl ?? input.redis_url ?? null;
    this.redisDb = input.redisDb ?? input.redis_db ?? 0;
    this.enablePersistence = input.enablePersistence ?? input.enable_persistence ?? false;
    this.persistencePath = input.persistencePath ?? input.persistence_path ?? null;
  }

  toDict(): Record<string, unknown> {
    return {
      backend: this.backend,
      maxsize: this.maxsize,
      ttl: this.ttl,
      redis_url: this.redisUrl,
      redis_db: this.redisDb,
      enable_persistence: this.enablePersistence,
      persistence_path: this.persistencePath,
    };
  }
}

export class SecurityConfig {
  readonly rateLimitCalls: number;
  readonly rateLimitPeriod: number;
  readonly maxTextLength: number;
  readonly maxFormulaDepth: number;
  readonly maxFormulaComplexity: number;
  readonly enableAuditLog: boolean;
  readonly auditLogPath: string | null;
  readonly enableInputValidation: boolean;

  constructor(input: SecurityConfigInput = {}) {
    this.rateLimitCalls = input.rateLimitCalls ?? input.rate_limit_calls ?? 100;
    this.rateLimitPeriod = input.rateLimitPeriod ?? input.rate_limit_period ?? 60;
    this.maxTextLength = input.maxTextLength ?? input.max_text_length ?? 10000;
    this.maxFormulaDepth = input.maxFormulaDepth ?? input.max_formula_depth ?? 100;
    this.maxFormulaComplexity = input.maxFormulaComplexity ?? input.max_formula_complexity ?? 1000;
    this.enableAuditLog = input.enableAuditLog ?? input.enable_audit_log ?? true;
    this.auditLogPath = input.auditLogPath ?? input.audit_log_path ?? null;
    this.enableInputValidation = input.enableInputValidation ?? input.enable_input_validation ?? true;
  }

  toDict(): Record<string, unknown> {
    return {
      rate_limit_calls: this.rateLimitCalls,
      rate_limit_period: this.rateLimitPeriod,
      max_text_length: this.maxTextLength,
      max_formula_depth: this.maxFormulaDepth,
      max_formula_complexity: this.maxFormulaComplexity,
      enable_audit_log: this.enableAuditLog,
      audit_log_path: this.auditLogPath,
      enable_input_validation: this.enableInputValidation,
    };
  }
}

export class MonitoringConfig {
  readonly enabled: boolean;
  readonly port: number;
  readonly logLevel: string;
  readonly metricsBackend: string;
  readonly enableTracing: boolean;
  readonly tracingBackend: string;

  constructor(input: MonitoringConfigInput = {}) {
    this.enabled = input.enabled ?? true;
    this.port = input.port ?? 9090;
    this.logLevel = input.logLevel ?? input.log_level ?? 'INFO';
    this.metricsBackend = input.metricsBackend ?? input.metrics_backend ?? 'prometheus';
    this.enableTracing = input.enableTracing ?? input.enable_tracing ?? false;
    this.tracingBackend = input.tracingBackend ?? input.tracing_backend ?? 'opentelemetry';
  }

  toDict(): Record<string, unknown> {
    return {
      enabled: this.enabled,
      port: this.port,
      log_level: this.logLevel,
      metrics_backend: this.metricsBackend,
      enable_tracing: this.enableTracing,
      tracing_backend: this.tracingBackend,
    };
  }
}

export class LoggingConfig {
  readonly logLevel: string;

  constructor(input: { log_level?: string; logLevel?: string } = {}) {
    this.logLevel = input.logLevel ?? input.log_level ?? 'INFO';
  }

  toDict(): Record<string, unknown> {
    return { log_level: this.logLevel };
  }
}

export class LogicConfig {
  readonly provers: ProverMap;
  readonly cache: CacheConfig;
  readonly security: SecurityConfig;
  readonly monitoring: MonitoringConfig;

  constructor(input: LogicConfigInput = {}) {
    this.provers = normalizeProvers(input.provers ?? defaultProvers());
    this.cache = input.cache instanceof CacheConfig ? input.cache : new CacheConfig(input.cache);
    this.security = input.security instanceof SecurityConfig ? input.security : new SecurityConfig(input.security);
    this.monitoring = input.monitoring instanceof MonitoringConfig ? input.monitoring : new MonitoringConfig(input.monitoring);
  }

  static defaults(): LogicConfig {
    return new LogicConfig();
  }

  static fromFile(path: string): LogicConfig {
    if (!existsSync(path)) {
      throw new ConfigurationError(`Configuration file not found: ${path}`, { path });
    }
    try {
      return new LogicConfig(parseConfigText(readFileSync(path, 'utf8')));
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ConfigurationError(`Failed to parse config file: ${message}`, { path });
    }
  }

  static fromEnv(env: EnvMap = process.env): LogicConfig {
    return new LogicConfig(applyEnvOverrides({}, env, true));
  }

  toDict(): Record<string, unknown> {
    return {
      provers: Object.fromEntries(Object.entries(this.provers).map(([name, config]) => [name, config.toDict()])),
      cache: this.cache.toDict(),
      security: this.security.toDict(),
      monitoring: this.monitoring.toDict(),
    };
  }

  save(path: string): void {
    writeFileSync(path, JSON.stringify(this.toDict(), null, 2) + '\n', 'utf8');
  }
}

export interface LoadConfigOptions {
  path?: string;
  env?: EnvMap;
}

let globalConfig: LogicConfig | null = null;

export function loadConfig(options: LoadConfigOptions = {}): LogicConfig {
  const env = options.env ?? process.env;
  const path = options.path ?? 'config.yaml';
  const base = existsSync(path) ? LogicConfig.fromFile(path).toDict() : LogicConfig.defaults().toDict();
  return new LogicConfig(applyEnvOverrides(base, env, false));
}

export function getConfig(options: LoadConfigOptions = {}): LogicConfig {
  if (!globalConfig) globalConfig = loadConfig(options);
  return globalConfig;
}

export function setConfig(config: LogicConfig): void {
  globalConfig = config;
}

export function reloadConfig(options: LoadConfigOptions = {}): LogicConfig {
  globalConfig = loadConfig(options);
  return globalConfig;
}

export const load_config = loadConfig;
export const get_config = getConfig;
export const set_config = setConfig;
export const reload_config = reloadConfig;

function defaultProvers(): ProverMap {
  return {
    native: new ProverConfig({ enabled: true, timeout: 5.0 }),
    z3: new ProverConfig({ enabled: true, timeout: 5.0 }),
    cvc5: new ProverConfig({ enabled: false, timeout: 10.0 }),
    lean: new ProverConfig({ enabled: false, timeout: 30.0 }),
    coq: new ProverConfig({ enabled: false, timeout: 30.0 }),
    symbolicai: new ProverConfig({ enabled: false, timeout: 10.0 }),
  };
}

function normalizeProvers(input: Record<string, ProverConfig | ProverConfigInput>): ProverMap {
  return Object.fromEntries(
    Object.entries(input).map(([name, config]) => [
      name,
      config instanceof ProverConfig ? config : new ProverConfig(config),
    ]),
  );
}

function parseConfigText(text: string): LogicConfigInput {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as LogicConfigInput;
  return parseSimpleYaml(trimmed) as LogicConfigInput;
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];
  for (const rawLine of text.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, '');
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const line = withoutComment.trim();
    const match = /^([^:]+):(.*)$/.exec(line);
    if (!match) throw new ConfigurationError(`Unsupported YAML line: ${rawLine}`);
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.value;
    const key = match[1]!.trim();
    const valueText = match[2]!.trim();
    if (!valueText) {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else {
      parent[key] = parseScalar(valueText);
    }
  }
  return root;
}

function parseScalar(value: string): unknown {
  const lowered = value.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  if (lowered === 'null' || lowered === 'none') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^['"]|['"]$/g, '');
}

function applyEnvOverrides(input: Record<string, unknown>, env: EnvMap, includeDefaults: boolean): LogicConfigInput {
  const base = includeDefaults ? LogicConfig.defaults().toDict() : deepClone(input);
  const config = base as Record<string, unknown>;
  const provers = objectAt(config, 'provers');
  const cache = objectAt(config, 'cache');
  const security = objectAt(config, 'security');
  const monitoring = objectAt(config, 'monitoring');

  setNested(provers, 'native', 'timeout', parseEnvNumber(env.NATIVE_TIMEOUT));
  setNested(provers, 'z3', 'enabled', parseEnvBool(env.Z3_ENABLED));
  setNested(provers, 'z3', 'timeout', parseEnvNumber(env.Z3_TIMEOUT));
  setNested(provers, 'z3', 'max_memory_mb', parseEnvInt(env.Z3_MAX_MEMORY_MB));
  setNested(provers, 'cvc5', 'enabled', parseEnvBool(env.CVC5_ENABLED));
  setNested(provers, 'cvc5', 'timeout', parseEnvNumber(env.CVC5_TIMEOUT));

  if (env.SYMBOLICAI_API_KEY !== undefined) setNested(provers, 'symbolicai', 'enabled', Boolean(env.SYMBOLICAI_API_KEY));
  setNested(provers, 'symbolicai', 'timeout', parseEnvNumber(env.SYMBOLICAI_TIMEOUT));
  if (env.SYMBOLICAI_MODEL !== undefined || env.SYMBOLICAI_TEMPERATURE !== undefined) {
    const symbolic = objectAt(provers, 'symbolicai');
    const options = objectAt(symbolic, 'options');
    if (env.SYMBOLICAI_MODEL !== undefined) options.model = env.SYMBOLICAI_MODEL;
    const temperature = parseEnvNumber(env.SYMBOLICAI_TEMPERATURE);
    if (temperature !== undefined) options.temperature = temperature;
  }

  setIfDefined(cache, 'backend', env.CACHE_BACKEND);
  setIfDefined(cache, 'maxsize', parseEnvInt(env.CACHE_MAXSIZE));
  setIfDefined(cache, 'ttl', parseEnvInt(env.CACHE_TTL));
  setIfDefined(cache, 'redis_url', env.REDIS_URL);
  setIfDefined(cache, 'redis_db', parseEnvInt(env.REDIS_DB));

  setIfDefined(security, 'rate_limit_calls', parseEnvInt(env.RATE_LIMIT_CALLS));
  setIfDefined(security, 'rate_limit_period', parseEnvInt(env.RATE_LIMIT_PERIOD));
  setIfDefined(security, 'max_text_length', parseEnvInt(env.MAX_TEXT_LENGTH));
  setIfDefined(security, 'max_formula_depth', parseEnvInt(env.MAX_FORMULA_DEPTH));
  setIfDefined(security, 'max_formula_complexity', parseEnvInt(env.MAX_FORMULA_COMPLEXITY));
  setIfDefined(security, 'enable_audit_log', parseEnvBool(env.ENABLE_AUDIT_LOG));
  setIfDefined(security, 'audit_log_path', env.AUDIT_LOG_PATH);

  setIfDefined(monitoring, 'enabled', parseEnvBool(env.ENABLE_MONITORING));
  setIfDefined(monitoring, 'port', parseEnvInt(env.METRICS_PORT));
  setIfDefined(monitoring, 'log_level', env.LOG_LEVEL);
  setIfDefined(monitoring, 'enable_tracing', parseEnvBool(env.ENABLE_TRACING));

  return config as LogicConfigInput;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function objectAt(record: Record<string, unknown>, key: string): Record<string, unknown> {
  if (!record[key] || typeof record[key] !== 'object' || Array.isArray(record[key])) record[key] = {};
  return record[key] as Record<string, unknown>;
}

function setNested(record: Record<string, unknown>, first: string, second: string, value: unknown): void {
  if (value === undefined) return;
  objectAt(record, first)[second] = value;
}

function setIfDefined(record: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) record[key] = value;
}

function parseEnvBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value.toLowerCase() === 'true';
}

function parseEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseEnvInt(value: string | undefined): number | undefined {
  const parsed = parseEnvNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}
