import { BrowserStorageAdapter } from '../adapters/browser-storage-adapter';
import { ErrorLogEntry } from '../types/error-types';

let storageAdapter: BrowserStorageAdapter | null = null;

export function initializeErrorLogger(adapter: BrowserStorageAdapter): void {
  storageAdapter = adapter;
}

export async function logError(error: Error | string, context?: Record<string, any>): Promise<void> {
  if (!storageAdapter) {
    console.error('ErrorLogger not initialized. Cannot log error:', error);
    return;
  }

  const errorEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'string' ? undefined : error.stack,
    level: 'error',
    context,
  };

  try {
    await storageAdapter.saveErrorLog(errorEntry);
  } catch (e) {
    console.error('Failed to save error log:', e);
  }
}

export async function getErrorLogs(): Promise<ErrorLogEntry[]> {
  if (!storageAdapter) {
    console.error('ErrorLogger not initialized. Cannot retrieve error logs.');
    return [];
  }
  return storageAdapter.getErrorLogs();
}

export async function clearErrorLogs(): Promise<void> {
  if (!storageAdapter) {
    console.error('ErrorLogger not initialized. Cannot clear error logs.');
    return;
  }
  await storageAdapter.clearErrorLogs();
}
