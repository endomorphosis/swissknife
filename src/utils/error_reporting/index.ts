/**
 * Error Reporting Configuration
 * Central configuration for error reporting system
 */

import { GitHubIssueReporter, GitHubIssueReporterConfig } from './github-issue-reporter.js';
import { JavaScriptErrorHandler, JavaScriptErrorHandlerConfig } from './javascript-error-handler.js';

export interface ErrorReportingConfig {
  enabled: boolean;
  github: {
    token?: string;
    owner: string;
    repo: string;
    labels?: string[];
    assignees?: string[];
  };
  javascript?: {
    enableGlobalHandler?: boolean;
    enableUnhandledRejection?: boolean;
    enableConsoleErrors?: boolean;
  };
  rateLimit?: {
    maxIssuesPerHour?: number;
    deduplicateWindow?: number;
  };
}

export class ErrorReportingSystem {
  private static instance: ErrorReportingSystem;
  private config: ErrorReportingConfig;
  private githubReporter?: GitHubIssueReporter;
  private jsErrorHandler?: JavaScriptErrorHandler;

  private constructor(config: ErrorReportingConfig) {
    this.config = config;
    this.initialize();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: ErrorReportingConfig): ErrorReportingSystem {
    if (!ErrorReportingSystem.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      ErrorReportingSystem.instance = new ErrorReportingSystem(config);
    }
    return ErrorReportingSystem.instance;
  }

  /**
   * Initialize error reporting system
   */
  private initialize(): void {
    if (!this.config.enabled) {
      console.log('[ErrorReporting] Error reporting is disabled');
      return;
    }

    // Initialize GitHub reporter
    const githubConfig: GitHubIssueReporterConfig = {
      enabled: this.config.enabled,
      githubToken: this.config.github.token || process.env.GITHUB_TOKEN,
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      labels: this.config.github.labels,
      assignees: this.config.github.assignees,
      maxIssuesPerHour: this.config.rateLimit?.maxIssuesPerHour,
      deduplicateWindow: this.config.rateLimit?.deduplicateWindow,
    };

    this.githubReporter = new GitHubIssueReporter(githubConfig);

    // Initialize JavaScript error handler if configuration provided
    if (this.config.javascript) {
      const jsConfig: JavaScriptErrorHandlerConfig = {
        enableGlobalHandler: this.config.javascript.enableGlobalHandler ?? true,
        enableUnhandledRejection: this.config.javascript.enableUnhandledRejection ?? true,
        enableConsoleErrors: this.config.javascript.enableConsoleErrors ?? false,
        reporter: this.githubReporter,
      };

      this.jsErrorHandler = new JavaScriptErrorHandler(jsConfig);
      this.jsErrorHandler.install();
    }

    console.log('[ErrorReporting] Error reporting system initialized');
  }

  /**
   * Get GitHub reporter instance
   */
  getGitHubReporter(): GitHubIssueReporter | undefined {
    return this.githubReporter;
  }

  /**
   * Get JavaScript error handler
   */
  getJavaScriptErrorHandler(): JavaScriptErrorHandler | undefined {
    return this.jsErrorHandler;
  }

  /**
   * Check if error reporting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.githubReporter?.isEnabled();
  }

  /**
   * Shutdown error reporting system
   */
  shutdown(): void {
    if (this.jsErrorHandler) {
      this.jsErrorHandler.uninstall();
    }
    console.log('[ErrorReporting] Error reporting system shut down');
  }

  /**
   * Load configuration from file
   */
  static loadConfigFromFile(filePath: string): ErrorReportingConfig {
    // This would load configuration from a file
    // For now, return a default configuration
    return {
      enabled: false,
      github: {
        owner: 'endomorphosis',
        repo: 'swissknife',
        labels: ['auto-generated', 'bug'],
      },
    };
  }

  /**
   * Load configuration from environment variables
   */
  static loadConfigFromEnv(): ErrorReportingConfig {
    return {
      enabled: process.env.ERROR_REPORTING_ENABLED === 'true',
      github: {
        token: process.env.GITHUB_TOKEN,
        owner: process.env.GITHUB_REPO_OWNER || 'endomorphosis',
        repo: process.env.GITHUB_REPO_NAME || 'swissknife',
        labels: process.env.ERROR_REPORTING_LABELS?.split(',') || ['auto-generated', 'bug'],
        assignees: process.env.ERROR_REPORTING_ASSIGNEES?.split(','),
      },
      javascript: {
        enableGlobalHandler: process.env.ERROR_REPORTING_JS_GLOBAL !== 'false',
        enableUnhandledRejection: process.env.ERROR_REPORTING_JS_REJECTION !== 'false',
        enableConsoleErrors: process.env.ERROR_REPORTING_JS_CONSOLE === 'true',
      },
      rateLimit: {
        maxIssuesPerHour: parseInt(process.env.ERROR_REPORTING_MAX_ISSUES || '10', 10),
        deduplicateWindow: parseInt(process.env.ERROR_REPORTING_DEDUPE_WINDOW || '3600000', 10),
      },
    };
  }
}

/**
 * Initialize error reporting from environment
 */
export function initializeErrorReporting(customConfig?: Partial<ErrorReportingConfig>): ErrorReportingSystem {
  const envConfig = ErrorReportingSystem.loadConfigFromEnv();
  const config: ErrorReportingConfig = {
    ...envConfig,
    ...customConfig,
    github: {
      ...envConfig.github,
      ...customConfig?.github,
    },
  };

  return ErrorReportingSystem.getInstance(config);
}
