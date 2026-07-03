// Structured logger utility with configurable log levels and transports

export enum LogLevel {
  DEBUG = 0,
  INFO  = 1,
  WARN  = 2,
  ERROR = 3,
  NONE  = 4,   // suppress all output
}

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]:  'INFO',
  [LogLevel.WARN]:  'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]:  'NONE',
};

export type LogTransport = (level: LogLevel, timestamp: string, message: string, params: unknown[]) => void;

const consoleTransport: LogTransport = (level, timestamp, message, params) => {
  const line = `[${timestamp}] [${LEVEL_NAMES[level]}] ${message}`;
  switch (level) {
    case LogLevel.DEBUG: console.debug(line, ...params); break;
    case LogLevel.WARN:  console.warn(line, ...params);  break;
    case LogLevel.ERROR: console.error(line, ...params); break;
    default:             console.log(line, ...params);
  }
};

class Logger {
  private minLevel: LogLevel;
  private transports: LogTransport[];

  constructor(minLevel: LogLevel = LogLevel.INFO, transports: LogTransport[] = [consoleTransport]) {
    this.minLevel   = minLevel;
    this.transports = transports;
  }

  setLevel(level: LogLevel): void   { this.minLevel = level; }
  getLevel(): LogLevel              { return this.minLevel; }
  addTransport(t: LogTransport): void { this.transports.push(t); }

  private emit(level: LogLevel, message: string, params: unknown[]): void {
    if (level < this.minLevel) return;
    const ts = new Date().toISOString();
    for (const t of this.transports) t(level, ts, message, params);
  }

  debug(message: string, ...optionalParams: unknown[]): void { this.emit(LogLevel.DEBUG, message, optionalParams); }
  info (message: string, ...optionalParams: unknown[]): void { this.emit(LogLevel.INFO,  message, optionalParams); }
  warn (message: string, ...optionalParams: unknown[]): void { this.emit(LogLevel.WARN,  message, optionalParams); }
  error(message: string, ...optionalParams: unknown[]): void { this.emit(LogLevel.ERROR, message, optionalParams); }
}

// Respect LOG_LEVEL env var at startup
const _envLevel = typeof process !== 'undefined'
  ? ({ debug: LogLevel.DEBUG, info: LogLevel.INFO, warn: LogLevel.WARN, error: LogLevel.ERROR, none: LogLevel.NONE } as Record<string, LogLevel>)
    [(process.env['LOG_LEVEL'] ?? 'info').toLowerCase()]
  : LogLevel.INFO;

export const logger = new Logger(_envLevel ?? LogLevel.INFO);
export { Logger };
