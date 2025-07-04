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
export function logDebug(message: string, data?: Record<string, any>): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.debug(formatLogMessage('DEBUG', message), data);
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, data?: Record<string, any>): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.info(formatLogMessage('INFO', message), data);
  }
}

/**
 * Log a warning message
 */
export function logWarn(message: string, data?: Record<string, any>): void {
  if (currentLogLevel <= LogLevel.WARN) {
    console.warn(formatLogMessage('WARN', message), data);
  }
}

/**
 * Log an error message
 */
export function logError(message: string | Error, data?: Record<string, any>): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    const errorMessage = message instanceof Error 
      ? `${message.message}\n${message.stack}` 
      : message;
    console.error(formatLogMessage('ERROR', errorMessage), data);
  }
}

/**
 * Represents a log entry option for display.
 */
export interface LogOption {
  date: string;
  forkNumber?: number;
  messages: any[]; // Using any[] for now, can be more specific later
}

/**
 * Props for the LogList component.
 */
export interface LogListProps {
  context: any; // Using any for now
  type: 'messages' | 'errors';
  logNumber: any; // Using any for now
}

/**
 * Placeholder function to get the next available log fork number.
 * This needs to be properly implemented based on the project's logging strategy.
 */
export function getNextAvailableLogForkNumber(logDate: string, currentForkNumber: number, offset: number): number {
  // Placeholder implementation: simply increments the currentForkNumber
  // A real implementation would check existing log files to find the next available number
  return currentForkNumber + offset;
}
