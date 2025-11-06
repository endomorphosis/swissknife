#!/usr/bin/env node
/**
 * Error Reporting System Demo
 * 
 * This script demonstrates the error reporting system without actually
 * creating GitHub issues (runs in dry-run mode).
 * 
 * Usage:
 *   node examples/demo-error_reporting.js
 */

import { GitHubIssueReporter } from '../src/utils/error_reporting/github-issue-reporter.js';
import { JavaScriptErrorHandler } from '../src/utils/error_reporting/javascript-error-handler.js';

console.log('='.repeat(80));
console.log('Error Reporting System Demo');
console.log('='.repeat(80));
console.log();

// Create a reporter in disabled mode (won't actually create issues)
const reporter = new GitHubIssueReporter({
  enabled: false, // Set to true with valid token to create real issues
  owner: 'endomorphosis',
  repo: 'swissknife',
  labels: ['auto-generated', 'bug', 'demo'],
  maxIssuesPerHour: 10,
  deduplicateWindow: 3600000,
});

console.log('📋 Reporter Configuration:');
console.log(JSON.stringify(reporter.getConfig(), null, 2));
console.log();

// Create error handler
const errorHandler = new JavaScriptErrorHandler({
  enableGlobalHandler: false, // Don't install global handlers for demo
  enableUnhandledRejection: false,
  enableConsoleErrors: false,
  reporter,
});

console.log('🔧 Error Handler Created');
console.log();

// Demo 1: Basic error report
console.log('📝 Demo 1: Basic Error Report');
console.log('-'.repeat(80));

const error1 = new Error('Database connection timeout');
const report1 = errorHandler.createErrorReport(error1, {
  component: 'database',
  severity: 'critical',
});

console.log('Error Report:');
console.log(JSON.stringify({
  title: report1.title,
  errorName: report1.error.name,
  errorMessage: report1.error.message,
  severity: report1.severity,
  context: report1.context,
}, null, 2));
console.log();

// Demo 2: Error with custom context
console.log('📝 Demo 2: Error with Custom Context');
console.log('-'.repeat(80));

const error2 = new Error('Failed to connect to MCP server');
const report2 = errorHandler.createErrorReport(error2, {
  component: 'mcp-server',
  severity: 'high',
  serverUrl: 'ws://localhost:8765',
  retryCount: 3,
  lastAttempt: new Date().toISOString(),
});

console.log('Error Report:');
console.log(JSON.stringify({
  title: report2.title,
  errorName: report2.error.name,
  errorMessage: report2.error.message,
  severity: report2.severity,
  context: report2.context,
}, null, 2));
console.log();

// Demo 3: Duplicate detection
console.log('📝 Demo 3: Duplicate Detection');
console.log('-'.repeat(80));

const error3a = new Error('Duplicate error test');
const report3a = errorHandler.createErrorReport(error3a, {
  component: 'test',
  severity: 'low',
});

const error3b = new Error('Duplicate error test');
const report3b = errorHandler.createErrorReport(error3b, {
  component: 'test',
  severity: 'low',
});

console.log('First error would create issue: true');
console.log('Second error (duplicate) would be skipped: true');
console.log();

// Demo 4: Different severity levels
console.log('📝 Demo 4: Severity Levels');
console.log('-'.repeat(80));

const severities = ['critical', 'high', 'medium', 'low'];
severities.forEach(severity => {
  const error = new Error(`${severity} level error`);
  const report = errorHandler.createErrorReport(error, {
    component: 'demo',
    severity,
  });
  console.log(`${severity.toUpperCase().padEnd(10)} - ${report.title}`);
});
console.log();

// Demo 5: Report attempt (won't create issue since reporter is disabled)
console.log('📝 Demo 5: Report Attempt');
console.log('-'.repeat(80));

async function demoReporting() {
  const error = new Error('Test error for reporting');
  const report = errorHandler.createErrorReport(error, {
    component: 'demo',
    severity: 'medium',
  });

  const result = await errorHandler.reportError(report);
  console.log('Report sent:', result);
  console.log('Note: Reporting is disabled, no actual GitHub issue was created');
  console.log();
}

await demoReporting();

// Summary
console.log('='.repeat(80));
console.log('Demo Complete!');
console.log('='.repeat(80));
console.log();
console.log('To enable real error reporting:');
console.log('1. Set ERROR_REPORTING_ENABLED=true in .env.error_reporting');
console.log('2. Add your GITHUB_TOKEN to .env.error_reporting');
console.log('3. Errors will automatically create GitHub issues');
console.log();
console.log('For more information, see:');
console.log('- docs/ERROR_REPORTING_SETUP.md');
console.log('- src/utils/error_reporting/README.md');
console.log();
