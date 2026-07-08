/**
 * Logging utility functions
 * Provides consistent logging throughout the application
 */

/**
 * Log levels
 */
export const LogLevel = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
});

// Current log level - can be adjusted at runtime
let currentLogLevel = LogLevel.INFO;

/**
 * Sets the current log level
 */
export function setLogLevel(level) {
  currentLogLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel() {
  return currentLogLevel;
}

/**
 * Format a log message with timestamp and level
 */
function formatLogMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Log a debug message
 */
export function logDebug(message, ...args) {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.debug(formatLogMessage('DEBUG', message), ...args);
  }
}

/**
 * Log an info message
 */
export function logInfo(message, ...args) {
  if (currentLogLevel <= LogLevel.INFO) {
    console.info(formatLogMessage('INFO', message), ...args);
  }
}

/**
 * Log a warning message
 */
export function logWarn(message, ...args) {
  if (currentLogLevel <= LogLevel.WARN) {
    console.warn(formatLogMessage('WARN', message), ...args);
  }
}

/**
 * Log an error message
 */
export function logError(message, ...args) {
  if (currentLogLevel <= LogLevel.ERROR) {
    const errorMessage = message instanceof Error 
      ? `${message.message}\n${message.stack}` 
      : message;
    console.error(formatLogMessage('ERROR', errorMessage), ...args);
  }
}

export function logEvent(event, properties = {}) {
  if (currentLogLevel <= LogLevel.INFO) {
    console.info(formatLogMessage('EVENT', event), properties);
  }
}

export function logMCPError(serverName, message, ...args) {
  logError(`[MCP:${serverName}] ${message}`, ...args);
}
