# Automated Error Reporting System - Setup Guide

This guide explains how to set up and use the automated error reporting system that converts runtime errors into GitHub issues.

## Overview

The error reporting system automatically captures errors from:
- **JavaScript/Node.js**: MCP server, web applications, CLI tools
- **Python**: Docker container, Python interpreters
- **Browser**: Frontend web applications

All captured errors are converted into GitHub issues with detailed context, stack traces, and metadata.

## Prerequisites

1. **GitHub Personal Access Token**: Required for creating issues
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with `repo` scope
   - Save the token securely

2. **Repository Access**: Token must have write access to the repository

## Quick Start

### 1. Configure Environment Variables

Copy the example configuration:

```bash
cp .env.error-reporting.example .env.error-reporting
```

Edit `.env.error-reporting` and set:

```env
ERROR_REPORTING_ENABLED=true
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO_OWNER=endomorphosis
GITHUB_REPO_NAME=swissknife
```

### 2. Install Dependencies

```bash
npm install
```

This will install `@octokit/rest` for GitHub API integration and `requests` for Python.

### 3. Enable Error Reporting

#### For MCP Server (JavaScript)

Add to your MCP server initialization:

```javascript
import { initializeMCPErrorReporting } from './examples/mcp-error-reporting-integration.js';

// Initialize at server startup
const errorReporting = initializeMCPErrorReporting();
```

#### For Docker Container (Python)

Add to your Python application entry point:

```python
from examples.docker_error_reporting_integration import initialize_docker_error_reporting

# Initialize at application startup
error_handler = initialize_docker_error_reporting()
```

#### For Web Dashboard (Browser)

Add to your web application initialization:

```javascript
import { initializeErrorReporting } from './src/utils/error-reporting/index.js';

// Initialize error reporting
const errorReporting = initializeErrorReporting({
  enabled: true,
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: 'endomorphosis',
    repo: 'swissknife',
    labels: ['auto-generated', 'bug', 'dashboard'],
  },
});
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ERROR_REPORTING_ENABLED` | Enable/disable error reporting | `false` |
| `GITHUB_TOKEN` | GitHub personal access token | - |
| `GITHUB_REPO_OWNER` | Repository owner | `endomorphosis` |
| `GITHUB_REPO_NAME` | Repository name | `swissknife` |
| `ERROR_REPORTING_LABELS` | Comma-separated issue labels | `auto-generated,bug` |
| `ERROR_REPORTING_ASSIGNEES` | Comma-separated assignees | - |
| `ERROR_REPORTING_MAX_ISSUES` | Max issues per hour | `10` |
| `ERROR_REPORTING_DEDUPE_WINDOW` | Deduplication window (ms) | `3600000` (1 hour) |
| `ERROR_REPORTING_JS_GLOBAL` | Capture global JS errors | `true` |
| `ERROR_REPORTING_JS_REJECTION` | Capture unhandled rejections | `true` |
| `ERROR_REPORTING_JS_CONSOLE` | Capture console.error calls | `false` |

### Programmatic Configuration

JavaScript:

```javascript
const errorReporting = initializeErrorReporting({
  enabled: true,
  github: {
    token: 'ghp_...',
    owner: 'endomorphosis',
    repo: 'swissknife',
    labels: ['auto-generated', 'bug', 'custom-label'],
    assignees: ['username1', 'username2'],
  },
  javascript: {
    enableGlobalHandler: true,
    enableUnhandledRejection: true,
    enableConsoleErrors: false,
  },
  rateLimit: {
    maxIssuesPerHour: 10,
    deduplicateWindow: 3600000,
  },
});
```

Python:

```python
error_handler = initialize_error_reporting({
    'enableReporting': True,
    'reporterConfig': {
        'enabled': True,
        'githubToken': 'ghp_...',
        'owner': 'endomorphosis',
        'repo': 'swissknife',
        'labels': ['auto-generated', 'bug', 'python'],
        'maxIssuesPerHour': 10,
        'deduplicateWindow': 3600000,
    }
})
```

## Usage Examples

### Automatic Error Capture

Once initialized, errors are automatically captured:

```javascript
// This error will be automatically reported
throw new Error('Something went wrong');

// Unhandled promise rejection will be reported
Promise.reject(new Error('Async error'));
```

### Manual Error Reporting

JavaScript:

```javascript
import { reportMCPError } from './examples/mcp-error-reporting-integration.js';

try {
  // Your code
  await connectToServer();
} catch (error) {
  await reportMCPError(error, {
    operation: 'connection',
    severity: 'critical',
    serverUrl: 'ws://localhost:8765',
    retryCount: 3,
  });
}
```

Python:

```python
from examples.docker_error_reporting_integration import report_docker_error

try:
    # Your code
    process_data(input_data)
except Exception as e:
    report_docker_error(e, {
        'component': 'data-processor',
        'severity': 'high',
        'operation': 'data-processing',
        'inputSize': len(input_data),
    })
    raise  # Re-raise if needed
```

## Error Severity Levels

- **critical**: System-breaking errors, uncaught exceptions
- **high**: Unhandled promise rejections, major errors
- **medium**: Caught errors, expected errors
- **low**: Warnings, minor issues

## Deduplication

The system prevents duplicate issues:

1. **Error Key**: Generated from error name, message, component, and runtime
2. **Time Window**: Default 1 hour (configurable)
3. **Duplicate Check**: Errors with same key within window are skipped

Example:
```javascript
// First error creates an issue
throw new Error('Connection failed');

// Same error within 1 hour is skipped
throw new Error('Connection failed');

// Same error after 1 hour creates new issue
// (after deduplication window expires)
```

## Rate Limiting

Prevents issue spam:

- **Default**: 10 issues per hour
- **Configurable**: Set `ERROR_REPORTING_MAX_ISSUES`
- **Auto-reset**: Counter resets every hour

## GitHub Issue Format

Created issues include:

```markdown
[HIGH][javascript] mcp-server: Connection timeout

## Error Description
Connection timeout after 30 seconds

## Error Details
Name: TimeoutError
Message: Connection timeout after 30 seconds
Timestamp: 2025-11-06T08:23:50.403Z
Component: mcp-server
Runtime: javascript

## Stack Trace
TimeoutError: Connection timeout after 30 seconds
    at connectToServer (server.js:45:11)
    at async main (index.js:23:5)

## Additional Context
- **serverUrl**: ws://localhost:8765
- **retryCount**: 3
- **operation**: connection

---
*This issue was automatically generated by the SwissKnife error reporting system.*
```

Labels applied:
- `auto-generated`
- `bug`
- `severity:high`
- `runtime:javascript`
- `component:mcp-server`

## Docker Integration

### Dockerfile Changes

Add environment variables to your Dockerfile:

```dockerfile
# Error reporting configuration
ENV ERROR_REPORTING_ENABLED=false
ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=${GITHUB_TOKEN}
```

### Docker Compose

```yaml
services:
  swissknife:
    environment:
      - ERROR_REPORTING_ENABLED=true
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    env_file:
      - .env.error-reporting
```

### Running with Docker

```bash
# Build with error reporting support
docker build --build-arg GITHUB_TOKEN=${GITHUB_TOKEN} -t swissknife .

# Run with error reporting enabled
docker run -e ERROR_REPORTING_ENABLED=true -e GITHUB_TOKEN=${GITHUB_TOKEN} swissknife
```

## Testing

### Test Error Reporting

JavaScript:

```bash
node -e "
import { initializeErrorReporting } from './src/utils/error-reporting/index.js';
const er = initializeErrorReporting({ enabled: true });
throw new Error('Test error');
"
```

Python:

```bash
python -c "
from examples.docker_error_reporting_integration import initialize_docker_error_reporting
eh = initialize_docker_error_reporting()
raise ValueError('Test error')
"
```

### Run Tests

```bash
npm test test/unit/utils/error-reporting.test.ts
```

## Troubleshooting

### Issues Not Being Created

1. **Check if enabled**: `ERROR_REPORTING_ENABLED=true`
2. **Verify token**: Token must have `repo` scope
3. **Check logs**: Look for error reporting messages in console
4. **Test connection**: Try creating issue manually via GitHub API
5. **Rate limit**: Check if rate limit was exceeded

### Too Many Issues

1. **Increase deduplication window**: Set `ERROR_REPORTING_DEDUPE_WINDOW=7200000` (2 hours)
2. **Reduce rate limit**: Set `ERROR_REPORTING_MAX_ISSUES=5`
3. **Disable console errors**: Set `ERROR_REPORTING_JS_CONSOLE=false`
4. **Add filters**: Only report critical/high severity errors

### Missing Context

1. **Add custom context**: Pass additional context when reporting
2. **Check environment**: Ensure environment variables are set
3. **Verify stack traces**: Check error objects have stack traces

## Security

### Best Practices

1. **Never commit tokens**: Add `.env.error-reporting` to `.gitignore`
2. **Use environment variables**: Store token in secure environment
3. **Rotate tokens**: Regularly rotate GitHub tokens
4. **Limit scope**: Use minimal required token scope (`repo`)
5. **Monitor usage**: Review created issues regularly

### Data Privacy

- No user data or credentials are included in error reports
- Stack traces may contain file paths - review before enabling
- Custom context is included as-is - sanitize sensitive data
- Error messages may contain sensitive information - handle carefully

## Disabling Error Reporting

### Temporary Disable

```bash
export ERROR_REPORTING_ENABLED=false
```

### Permanent Disable

Edit `.env.error-reporting`:

```env
ERROR_REPORTING_ENABLED=false
```

### Remove Integration

Comment out or remove initialization code:

```javascript
// const errorReporting = initializeMCPErrorReporting();
```

```python
# error_handler = initialize_docker_error_reporting()
```

## Support

For issues or questions:

1. Check this documentation
2. Review created GitHub issues
3. Check console logs for error messages
4. Open an issue in the repository

## License

This error reporting system is part of SwissKnife and follows the same license.
