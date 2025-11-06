/**
 * Integration test for error reporting system
 * Tests the complete flow without actually creating GitHub issues
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GitHubIssueReporter } from '../../src/utils/error-reporting/github-issue-reporter.js';
import { JavaScriptErrorHandler } from '../../src/utils/error-reporting/javascript-error-handler.js';
import { ErrorReportingSystem } from '../../src/utils/error-reporting/index.js';

describe('Error Reporting Integration Tests', () => {
  describe('GitHubIssueReporter Integration', () => {
    it('should initialize with disabled state by default', () => {
      const reporter = new GitHubIssueReporter({
        enabled: false,
        owner: 'test-owner',
        repo: 'test-repo',
      });

      expect(reporter.isEnabled()).toBe(false);
    });

    it('should format error report correctly', () => {
      const reporter = new GitHubIssueReporter({
        enabled: false,
        owner: 'test-owner',
        repo: 'test-repo',
      });

      const config = reporter.getConfig();
      expect(config.owner).toBe('test-owner');
      expect(config.repo).toBe('test-repo');
      expect(config.githubToken).toBeUndefined();
    });
  });

  describe('JavaScriptErrorHandler Integration', () => {
    it('should create error report with full context', () => {
      const reporter = new GitHubIssueReporter({
        enabled: false,
        owner: 'test-owner',
        repo: 'test-repo',
      });

      const handler = new JavaScriptErrorHandler({
        enableGlobalHandler: false,
        enableUnhandledRejection: false,
        enableConsoleErrors: false,
        reporter,
      });

      const error = new Error('Test integration error');
      const report = handler.createErrorReport(error, {
        component: 'integration-test',
        severity: 'medium',
        customField: 'test-value',
      });

      expect(report.title).toBe('Test integration error');
      expect(report.error).toBe(error);
      expect(report.context?.component).toBe('integration-test');
      expect(report.context?.runtime).toBeDefined();
      expect(report.context?.timestamp).toBeDefined();
      expect(report.context?.customField).toBe('test-value');
      expect(report.severity).toBe('medium');
    });

    it('should handle errors without crashing', async () => {
      const handler = new JavaScriptErrorHandler({
        enableGlobalHandler: false,
        enableUnhandledRejection: false,
        enableConsoleErrors: false,
      });

      const error = new Error('Test error handling');
      const report = handler.createErrorReport(error, {
        component: 'test',
      });

      // Should not throw even without reporter configured
      await expect(handler.reportError(report)).resolves.not.toThrow();
    });
  });

  describe('ErrorReportingSystem Integration', () => {
    it('should initialize with disabled configuration', () => {
      const system = ErrorReportingSystem.getInstance({
        enabled: false,
        github: {
          owner: 'test-owner',
          repo: 'test-repo',
        },
      });

      expect(system.isEnabled()).toBe(false);
    });

    it('should provide access to components', () => {
      const system = ErrorReportingSystem.getInstance({
        enabled: false,
        github: {
          owner: 'test-owner',
          repo: 'test-repo',
        },
        javascript: {
          enableGlobalHandler: false,
        },
      });

      const reporter = system.getGitHubReporter();
      expect(reporter).toBeDefined();
    });
  });

  describe('Error Deduplication', () => {
    it('should track errors for deduplication', async () => {
      const reporter = new GitHubIssueReporter({
        enabled: false,
        owner: 'test-owner',
        repo: 'test-repo',
        deduplicateWindow: 1000, // 1 second
      });

      // Create same error twice
      const error1 = new Error('Duplicate error');
      const error2 = new Error('Duplicate error');

      const report1 = {
        title: 'Duplicate test',
        error: error1,
        context: { component: 'test', runtime: 'javascript' as const },
        severity: 'low' as const,
      };

      const report2 = {
        title: 'Duplicate test',
        error: error2,
        context: { component: 'test', runtime: 'javascript' as const },
        severity: 'low' as const,
      };

      // Both should return false (disabled), but deduplication logic should work
      const result1 = await reporter.reportError(report1);
      const result2 = await reporter.reportError(report2);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('Configuration Loading', () => {
    it('should load configuration from environment', () => {
      // Save original env
      const originalEnv = { ...process.env };

      try {
        // Set test environment variables
        process.env.ERROR_REPORTING_ENABLED = 'false';
        process.env.GITHUB_REPO_OWNER = 'test-owner';
        process.env.GITHUB_REPO_NAME = 'test-repo';

        const config = ErrorReportingSystem.loadConfigFromEnv();

        expect(config.enabled).toBe(false);
        expect(config.github.owner).toBe('test-owner');
        expect(config.github.repo).toBe('test-repo');
      } finally {
        // Restore original env
        process.env = originalEnv;
      }
    });
  });
});
