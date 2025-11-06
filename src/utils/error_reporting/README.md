# Error Reporting System

Automated error reporting system that converts runtime errors into GitHub issues.

## Features

- **Automatic Error Capture**: Captures errors from JavaScript, Python, and browser environments
- **GitHub Integration**: Automatically creates GitHub issues from errors
- **Smart Deduplication**: Prevents duplicate issues for the same error
- **Rate Limiting**: Configurable limits to prevent issue spam
- **Rich Context**: Includes stack traces, environment info, and custom context
- **Severity Levels**: Categorizes errors by severity (critical, high, medium, low)
- **Multi-Runtime Support**: Works in Node.js, browser, and Python environments

## Installation

### JavaScript/Node.js

```bash
npm install @octokit/rest
```

### Python

```bash
pip install requests
```

## Configuration

### Environment Variables

```bash
# Enable error reporting
ERROR_REPORTING_ENABLED=true

# GitHub credentials
GITHUB_TOKEN=your_github_token_here
GITHUB_REPO_OWNER=endomorphosis
GITHUB_REPO_NAME=swissknife

# Optional configuration
ERROR_REPORTING_LABELS=auto-generated,bug
ERROR_REPORTING_ASSIGNEES=username1,username2
ERROR_REPORTING_MAX_ISSUES=10
ERROR_REPORTING_DEDUPE_WINDOW=3600000

# JavaScript-specific
ERROR_REPORTING_JS_GLOBAL=true
ERROR_REPORTING_JS_REJECTION=true
ERROR_REPORTING_JS_CONSOLE=false
```

### Configuration File (.env)

Create a `.env` file in your project root:

```env
ERROR_REPORTING_ENABLED=true
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO_OWNER=endomorphosis
GITHUB_REPO_NAME=swissknife
```

## Usage

### JavaScript/TypeScript

```typescript
import { initializeErrorReporting } from './src/utils/error-reporting/index.js';

// Initialize with environment variables
const errorReporting = initializeErrorReporting();

// Or with custom configuration
const errorReporting = initializeErrorReporting({
  enabled: true,
  github: {
    token: 'your_github_token',
    owner: 'endomorphosis',
    repo: 'swissknife',
    labels: ['auto-generated', 'bug'],
  },
  javascript: {
    enableGlobalHandler: true,
    enableUnhandledRejection: true,
    enableConsoleErrors: false,
  },
});

// Manually report an error
try {
  // Your code here
} catch (error) {
  const handler = errorReporting.getJavaScriptErrorHandler();
  const report = handler.createErrorReport(error, {
    component: 'my-component',
    severity: 'high',
    customData: 'any additional context',
  });
  await handler.reportError(report);
}
```

### Python

```python
from src.utils.error_reporting import initialize_error_reporting

# Initialize with environment variables
error_handler = initialize_error_reporting()

# Or with custom configuration
error_handler = initialize_error_reporting({
    'enableReporting': True,
    'reporterConfig': {
        'enabled': True,
        'githubToken': 'your_github_token',
        'owner': 'endomorphosis',
        'repo': 'swissknife',
        'labels': ['auto-generated', 'bug'],
        'maxIssuesPerHour': 10,
    }
})

# Manually report an error
try:
    # Your code here
    pass
except Exception as e:
    error_handler.report_error(
        e,
        context={
            'component': 'my-component',
            'severity': 'high',
            'customData': 'any additional context',
        }
    )
```

### MCP Server Dashboard Integration

Add to your MCP server initialization:

```javascript
import { initializeErrorReporting } from './src/utils/error-reporting/index.js';

// Initialize error reporting when MCP server starts
const errorReporting = initializeErrorReporting();

// The error handler will automatically capture uncaught errors
// and create GitHub issues
```

### Docker Container Integration

Add to your Dockerfile or entrypoint script:

```dockerfile
# Set environment variables
ENV ERROR_REPORTING_ENABLED=true
ENV GITHUB_TOKEN=${GITHUB_TOKEN}
```

Or in your Python entrypoint:

```python
import os
from src.utils.error_reporting import initialize_error_reporting

# Initialize at startup
error_handler = initialize_error_reporting()

# Your application code
```

## Error Report Format

Automatically generated GitHub issues include:

- **Title**: `[SEVERITY][runtime] component: Error message`
- **Error Description**: Detailed error message
- **Error Details**: Error name, message, timestamp, component, runtime
- **Stack Trace**: Full stack trace with syntax highlighting
- **Additional Context**: Any custom context provided
- **Labels**: Auto-generated labels based on severity, runtime, and component

Example issue:

```
[HIGH][javascript] mcp-control: Uncaught Exception: Cannot read property 'x' of undefined

## Error Description
Cannot read property 'x' of undefined

## Error Details
Name: TypeError
Message: Cannot read property 'x' of undefined
Timestamp: 2025-11-06T08:23:50.403Z
Component: mcp-control
Runtime: javascript

## Stack Trace
TypeError: Cannot read property 'x' of undefined
    at MCPControlApp.handleError (mcp-control.js:123:45)
    at process._tickCallback (internal/process/next_tick.js:68:7)

## Additional Context
- **userAgent**: Mozilla/5.0 ...
- **url**: http://localhost:3001

---
*This issue was automatically generated by the SwissKnife error reporting system.*
```

## Deduplication

The system automatically deduplicates errors to prevent creating multiple issues for the same error:

- **Deduplication Window**: Default 1 hour (configurable)
- **Error Key**: Generated from error name, message, component, and runtime
- **Duplicate Detection**: Errors with the same key within the deduplication window are skipped

## Rate Limiting

Prevents creating too many issues:

- **Default Limit**: 10 issues per hour (configurable)
- **Automatic Reset**: Counter resets every hour
- **Protection**: Prevents accidental issue spam from cascading errors

## Severity Levels

- **critical**: System-breaking errors, uncaught exceptions
- **high**: Unhandled promise rejections, major errors
- **medium**: Caught errors, console errors
- **low**: Warnings and minor issues

## Security Considerations

- **GitHub Token**: Store in environment variables, never commit to repository
- **Sensitive Data**: Error handler automatically sanitizes sensitive information
- **Privacy**: No user data or credentials are included in error reports
- **Rate Limiting**: Prevents abuse and excessive API usage

## Disabling Error Reporting

Set `ERROR_REPORTING_ENABLED=false` in your environment or configuration to disable error reporting.

## Troubleshooting

### Issues Not Being Created

1. Check `ERROR_REPORTING_ENABLED` is `true`
2. Verify `GITHUB_TOKEN` is set and valid
3. Check GitHub token has `repo` scope
4. Verify repository owner and name are correct
5. Check rate limiting hasn't been exceeded

### Too Many Issues

1. Reduce `ERROR_REPORTING_MAX_ISSUES`
2. Increase `ERROR_REPORTING_DEDUPE_WINDOW`
3. Disable console error capturing (`ERROR_REPORTING_JS_CONSOLE=false`)

### Missing Stack Traces

1. Ensure source maps are available in production
2. Check error objects have stack traces
3. Verify error is being caught properly

## License

This error reporting system is part of SwissKnife and follows the same license.
