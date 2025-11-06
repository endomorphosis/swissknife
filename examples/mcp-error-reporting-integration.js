/**
 * MCP Server Error Reporting Integration Example
 * 
 * This file demonstrates how to integrate error reporting with the MCP server.
 * Add this code to your MCP server initialization to enable automatic error reporting.
 */

import { initializeErrorReporting } from '../src/utils/error-reporting/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.error-reporting' });

/**
 * Initialize error reporting for MCP server
 */
export function initializeMCPErrorReporting() {
  try {
    // Initialize with environment variables
    const errorReporting = initializeErrorReporting({
      enabled: process.env.ERROR_REPORTING_ENABLED === 'true',
      github: {
        token: process.env.GITHUB_TOKEN,
        owner: process.env.GITHUB_REPO_OWNER || 'endomorphosis',
        repo: process.env.GITHUB_REPO_NAME || 'swissknife',
        labels: ['auto-generated', 'bug', 'mcp-server'],
      },
      javascript: {
        enableGlobalHandler: true,
        enableUnhandledRejection: true,
        enableConsoleErrors: false, // Don't report all console.error calls
      },
    });

    if (errorReporting.isEnabled()) {
      console.log('[MCP Server] Error reporting enabled - errors will be automatically reported to GitHub');
    } else {
      console.log('[MCP Server] Error reporting disabled - set ERROR_REPORTING_ENABLED=true to enable');
    }

    return errorReporting;
  } catch (error) {
    console.error('[MCP Server] Failed to initialize error reporting:', error);
    return null;
  }
}

/**
 * Example: Manually report MCP server error
 */
export async function reportMCPError(error, context = {}) {
  const errorReporting = initializeMCPErrorReporting();
  
  if (!errorReporting) {
    console.error('[MCP Server] Error reporting not initialized');
    return;
  }

  const handler = errorReporting.getJavaScriptErrorHandler();
  if (!handler) {
    console.error('[MCP Server] JavaScript error handler not available');
    return;
  }

  const report = handler.createErrorReport(error, {
    component: 'mcp-server',
    severity: context.severity || 'high',
    ...context,
  });

  await handler.reportError(report);
}

/**
 * Example usage in MCP server code:
 * 
 * // At server startup:
 * import { initializeMCPErrorReporting } from './examples/mcp-error-reporting-integration.js';
 * 
 * const errorReporting = initializeMCPErrorReporting();
 * 
 * // In error handlers:
 * import { reportMCPError } from './examples/mcp-error-reporting-integration.js';
 * 
 * try {
 *   // MCP server operation
 * } catch (error) {
 *   await reportMCPError(error, {
 *     operation: 'connection',
 *     severity: 'critical',
 *     serverUrl: 'ws://localhost:8765'
 *   });
 * }
 */
