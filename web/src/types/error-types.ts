export interface ErrorLogEntry {
  timestamp: string;
  message: string;
  stack?: string;
  level: 'error' | 'warn' | 'info';
  context?: Record<string, any>;
}
