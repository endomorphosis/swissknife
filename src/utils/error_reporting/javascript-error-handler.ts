/**
 * JavaScript Error Handler
 * Captures and reports JavaScript runtime errors
 */

import { GitHubIssueReporter, ErrorReport } from './github-issue-reporter.js';

export interface JavaScriptErrorHandlerConfig {
  enableGlobalHandler: boolean;
  enableUnhandledRejection: boolean;
  enableConsoleErrors: boolean;
  reporter?: GitHubIssueReporter;
  onError?: (error: Error, context: any) => void;
}

export class JavaScriptErrorHandler {
  private config: JavaScriptErrorHandlerConfig;
  private originalConsoleError?: typeof console.error;
  private isInstalled = false;

  constructor(config: JavaScriptErrorHandlerConfig) {
    this.config = config;
  }

  /**
   * Install global error handlers
   */
  install(): void {
    if (this.isInstalled) {
      console.warn('[JavaScriptErrorHandler] Already installed');
      return;
    }

    // Handle uncaught exceptions (Node.js)
    if (this.config.enableGlobalHandler && typeof process !== 'undefined') {
      process.on('uncaughtException', this.handleUncaughtException.bind(this));
    }

    // Handle unhandled promise rejections
    if (this.config.enableUnhandledRejection) {
      if (typeof process !== 'undefined') {
        process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
      } else if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', this.handleUnhandledRejectionEvent.bind(this));
      }
    }

    // Handle browser errors
    if (this.config.enableGlobalHandler && typeof window !== 'undefined') {
      window.addEventListener('error', this.handleWindowError.bind(this));
    }

    // Intercept console.error
    if (this.config.enableConsoleErrors) {
      this.interceptConsoleError();
    }

    this.isInstalled = true;
    console.log('[JavaScriptErrorHandler] Error handlers installed');
  }

  /**
   * Uninstall global error handlers
   */
  uninstall(): void {
    if (!this.isInstalled) {
      return;
    }

    // Restore console.error
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = undefined;
    }

    this.isInstalled = false;
    console.log('[JavaScriptErrorHandler] Error handlers uninstalled');
  }

  /**
   * Handle uncaught exceptions (Node.js)
   */
  private async handleUncaughtException(error: Error): Promise<void> {
    console.error('[JavaScriptErrorHandler] Uncaught Exception:', error);

    const report: ErrorReport = {
      title: `Uncaught Exception: ${error.message}`,
      error,
      context: {
        component: 'global',
        runtime: 'javascript',
        timestamp: new Date().toISOString(),
        stackTrace: error.stack,
        nodeVersion: process.version,
        platform: process.platform,
      },
      severity: 'critical',
    };

    await this.reportError(report);

    // Call custom handler
    if (this.config.onError) {
      this.config.onError(error, report.context);
    }

    // Don't exit the process - let it continue running
    // process.exit(1);
  }

  /**
   * Handle unhandled promise rejections (Node.js)
   */
  private async handleUnhandledRejection(reason: any, promise: Promise<any>): Promise<void> {
    console.error('[JavaScriptErrorHandler] Unhandled Rejection:', reason);

    const error = reason instanceof Error ? reason : new Error(String(reason));

    const report: ErrorReport = {
      title: `Unhandled Promise Rejection: ${error.message}`,
      error,
      context: {
        component: 'promise',
        runtime: 'javascript',
        timestamp: new Date().toISOString(),
        stackTrace: error.stack,
        reason: String(reason),
        nodeVersion: process.version,
        platform: process.platform,
      },
      severity: 'high',
    };

    await this.reportError(report);

    // Call custom handler
    if (this.config.onError) {
      this.config.onError(error, report.context);
    }
  }

  /**
   * Handle unhandled promise rejections (Browser)
   */
  private async handleUnhandledRejectionEvent(event: PromiseRejectionEvent): Promise<void> {
    console.error('[JavaScriptErrorHandler] Unhandled Rejection:', event.reason);

    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

    const report: ErrorReport = {
      title: `Unhandled Promise Rejection: ${error.message}`,
      error,
      context: {
        component: 'promise',
        runtime: 'browser',
        timestamp: new Date().toISOString(),
        stackTrace: error.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      severity: 'high',
    };

    await this.reportError(report);

    // Call custom handler
    if (this.config.onError) {
      this.config.onError(error, report.context);
    }
  }

  /**
   * Handle window errors (Browser)
   */
  private async handleWindowError(event: ErrorEvent): Promise<void> {
    console.error('[JavaScriptErrorHandler] Window Error:', event.error || event.message);

    const error = event.error || new Error(event.message);

    const report: ErrorReport = {
      title: `Window Error: ${error.message}`,
      error,
      context: {
        component: event.filename ? event.filename.split('/').pop() : 'unknown',
        runtime: 'browser',
        timestamp: new Date().toISOString(),
        stackTrace: error.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        line: event.lineno,
        column: event.colno,
      },
      severity: 'high',
    };

    await this.reportError(report);

    // Call custom handler
    if (this.config.onError) {
      this.config.onError(error, report.context);
    }
  }

  /**
   * Intercept console.error calls
   */
  private interceptConsoleError(): void {
    this.originalConsoleError = console.error;

    console.error = (...args: any[]) => {
      // Call original console.error
      this.originalConsoleError!.apply(console, args);

      // Extract error from arguments
      const error = args.find((arg) => arg instanceof Error);
      if (error) {
        const report: ErrorReport = {
          title: `Console Error: ${error.message}`,
          error,
          context: {
            component: 'console',
            runtime: typeof window !== 'undefined' ? 'browser' : 'javascript',
            timestamp: new Date().toISOString(),
            stackTrace: error.stack,
            arguments: args.map((arg) => (arg instanceof Error ? arg.message : String(arg))),
          },
          severity: 'medium',
        };

        // Report async to avoid blocking
        this.reportError(report).catch((err) =>
          this.originalConsoleError!('[JavaScriptErrorHandler] Failed to report error:', err)
        );
      }
    };
  }

  /**
   * Manually report an error
   */
  async reportError(report: ErrorReport): Promise<void> {
    if (this.config.reporter) {
      try {
        await this.config.reporter.reportError(report);
      } catch (err) {
        console.error('[JavaScriptErrorHandler] Failed to report error:', err);
      }
    }
  }

  /**
   * Create error report from caught error
   */
  createErrorReport(
    error: Error,
    context: {
      component?: string;
      severity?: 'critical' | 'high' | 'medium' | 'low';
      [key: string]: any;
    }
  ): ErrorReport {
    return {
      title: error.message,
      error,
      context: {
        runtime: typeof window !== 'undefined' ? 'browser' : 'javascript',
        timestamp: new Date().toISOString(),
        stackTrace: error.stack,
        ...context,
      },
      severity: context.severity || 'medium',
    };
  }
}
