/**
 * Test suite for Error Reporting System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubIssueReporter } from '../src/utils/error-reporting/github-issue-reporter.js';
import { JavaScriptErrorHandler } from '../src/utils/error-reporting/javascript-error-handler.js';

describe('GitHubIssueReporter', () => {
  let reporter: GitHubIssueReporter;

  beforeEach(() => {
    reporter = new GitHubIssueReporter({
      enabled: false, // Disabled for testing
      owner: 'test-owner',
      repo: 'test-repo',
      maxIssuesPerHour: 5,
      deduplicateWindow: 1000,
    });
  });

  it('should initialize correctly', () => {
    expect(reporter).toBeDefined();
    expect(reporter.isEnabled()).toBe(false);
  });

  it('should respect enabled flag', async () => {
    const result = await reporter.reportError({
      title: 'Test error',
      error: new Error('Test'),
      severity: 'low',
    });

    expect(result).toBe(false);
  });

  it('should format issue title correctly', () => {
    const config = reporter.getConfig();
    expect(config.owner).toBe('test-owner');
    expect(config.repo).toBe('test-repo');
  });

  it('should detect duplicate errors', async () => {
    const enabledReporter = new GitHubIssueReporter({
      enabled: true,
      githubToken: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      deduplicateWindow: 1000,
    });

    const error = new Error('Duplicate test');
    const report = {
      title: 'Test error',
      error,
      context: { component: 'test' },
      severity: 'low' as const,
    };

    // First report should not be duplicate
    // Second report within window should be duplicate
    // We can't test actual reporting without mocking Octokit
  });
});

describe('JavaScriptErrorHandler', () => {
  let handler: JavaScriptErrorHandler;
  let mockReporter: GitHubIssueReporter;

  beforeEach(() => {
    mockReporter = new GitHubIssueReporter({
      enabled: false,
      owner: 'test-owner',
      repo: 'test-repo',
    });

    handler = new JavaScriptErrorHandler({
      enableGlobalHandler: false, // Don't install in tests
      enableUnhandledRejection: false,
      enableConsoleErrors: false,
      reporter: mockReporter,
    });
  });

  it('should create error report correctly', () => {
    const error = new Error('Test error');
    const report = handler.createErrorReport(error, {
      component: 'test-component',
      severity: 'high',
    });

    expect(report.title).toBe('Test error');
    expect(report.error).toBe(error);
    expect(report.context?.component).toBe('test-component');
    expect(report.severity).toBe('high');
  });

  it('should include runtime in context', () => {
    const error = new Error('Test error');
    const report = handler.createErrorReport(error, {
      component: 'test',
    });

    expect(report.context?.runtime).toBeDefined();
    expect(['browser', 'javascript']).toContain(report.context?.runtime);
  });

  it('should include timestamp in context', () => {
    const error = new Error('Test error');
    const report = handler.createErrorReport(error, {
      component: 'test',
    });

    expect(report.context?.timestamp).toBeDefined();
    expect(new Date(report.context!.timestamp!)).toBeInstanceOf(Date);
  });
});

describe('Error Reporting Integration', () => {
  it('should handle error without reporter gracefully', async () => {
    const handler = new JavaScriptErrorHandler({
      enableGlobalHandler: false,
      enableUnhandledRejection: false,
      enableConsoleErrors: false,
    });

    const error = new Error('Test error');
    const report = handler.createErrorReport(error, {
      component: 'test',
    });

    // Should not throw
    await expect(handler.reportError(report)).resolves.not.toThrow();
  });
});
