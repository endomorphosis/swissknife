/**
 * Logging utility functions
 * Provides consistent logging throughout the application
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// Current log level - can be adjusted at runtime
let currentLogLevel = LogLevel.INFO;

/**
 * Sets the current log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Format a log message with timestamp and level
 */
function formatLogMessage(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Log a debug message
 */
export function logDebug(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.debug(formatLogMessage('DEBUG', message), ...args);
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.info(formatLogMessage('INFO', message), ...args);
  }
}

/**
 * Log a warning message
 */
export function logWarn(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.WARN) {
    console.warn(formatLogMessage('WARN', message), ...args);
  }
}

/**
 * Log an error message
 */
export function logError(message: string | Error, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    const errorMessage = message instanceof Error 
      ? `${message.message}\n${message.stack}` 
      : message;
    console.error(formatLogMessage('ERROR', errorMessage), ...args);
  }
}
