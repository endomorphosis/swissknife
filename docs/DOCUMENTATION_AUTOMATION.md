# Documentation Automation System

This document describes the autonomous documentation maintenance system implemented for the SwissKnife repository.

## Overview

The SwissKnife repository now has a comprehensive GitHub Actions workflow that automatically maintains documentation for both users and programming agents. The workflow runs **weekly** (every Sunday at 2 AM UTC) and also triggers on code changes.

## Workflow Location

`.github/workflows/documentation-automation.yml`

## What Gets Automated

### 1. **For Users** 📖

- **Screenshots**: Automatic capture of the virtual desktop and all 27+ applications
- **Application Documentation**: Detailed documentation for each desktop application
- **User Guides**: Updated guides and tutorials
- **Quality Reports**: Code quality metrics and performance reports
- **Link Validation**: Ensures all documentation links are valid

### 2. **For Programming Agents** 🤖

- **API Documentation** (`docs/api/`): Comprehensive API overview generated from the codebase
- **Codebase Map** (`docs/agents/codebase-map.md` & `.json`): Structured project overview including:
  - Project structure and organization
  - Entry points for each component
  - Key features and capabilities
  - Build commands and workflows
  - Documentation locations
  - Architecture patterns
- **Agent Guide** (`docs/agents/README.md`): Instructions for programming agents on how to work with the codebase

## Automation Schedule

The documentation automation runs:

1. **Weekly**: Every Sunday at 2:00 AM UTC (cron: `0 2 * * 0`)
2. **On Push**: When code changes are pushed to `main` or `develop` branches
3. **On Pull Requests**: When PRs are opened to `main` branch
4. **Manual Trigger**: Via workflow_dispatch for on-demand updates

## What Gets Generated

### Documentation Files

- `docs/api/README.md` - API documentation overview
- `docs/agents/README.md` - Guide for programming agents
- `docs/agents/codebase-map.md` - Human-readable codebase structure
- `docs/agents/codebase-map.json` - Machine-parsable codebase structure
- `docs/screenshots/` - Application screenshots
- `docs/applications/` - Application documentation
- `docs/automation/performance-report.md` - Performance metrics
- `docs/automation/quality-report.md` - Quality analysis
- `docs/automation/link-validation-report.md` - Link validation results
- `docs/automation/dashboard.html` - Interactive documentation dashboard

### Artifacts

Each workflow run uploads artifacts containing:
- Performance reports
- Quality metrics
- Analytics data
- API documentation
- Agent documentation
- Test results
- Change summaries

Artifacts are retained for 30 days.

## How It Works

### Step 1: Setup
1. Checkout repository
2. Install Node.js dependencies
3. Install Playwright browsers (for screenshots)

### Step 2: Screenshot Capture
1. Start virtual desktop server
2. Capture screenshots of all applications
3. Generate screenshot reports

### Step 3: Documentation Generation
1. Run complete system analysis (`npm run docs:complete-system`)
2. Generate API documentation (TypeDoc with fallback)
3. Generate agent codebase map
4. Extract quality metrics
5. Extract performance metrics

### Step 4: Quality Checks
1. Validate all documentation links
2. Check documentation quality score
3. Generate analytics and reports

### Step 5: Commit and Push
1. Detect changes in documentation
2. Commit with detailed message
3. Push to repository
4. Upload artifacts

## API Documentation Generation

The workflow uses a two-tier approach:

1. **Primary**: TypeDoc generation from TypeScript source code
2. **Fallback**: Simple documentation generator (`scripts/automation/generate-api-docs-simple.cjs`) that creates a comprehensive overview from package.json

This ensures documentation is always generated even if TypeDoc has issues.

## Agent Documentation

The agent documentation is specifically designed to help AI assistants and programming agents:

### Codebase Map (JSON Format)
```json
{
  "generated": "2025-10-29T...",
  "purpose": "Help programming agents understand and interact with the codebase",
  "structure": {
    "cli": { "path": "src/", "description": "..." },
    "web": { "path": "web/", "description": "..." },
    ...
  },
  "entryPoints": { ... },
  "keyFeatures": [ ... ],
  "buildCommands": { ... },
  "documentation": { ... }
}
```

This structured format allows agents to quickly parse and understand:
- Where different components are located
- How to build and test the project
- What the key features are
- Where to find additional documentation

## Configuration

The workflow has configurable inputs for manual dispatch:

- `force_update`: Force update all screenshots (default: false)
- `skip_screenshots`: Skip screenshot capture, docs only (default: false)
- `notification_level`: Notification level - none/errors/all (default: errors)

## Quality Thresholds

The workflow enforces a quality threshold:
- **Minimum Quality Score**: 70/100
- If quality falls below threshold, a warning is generated
- Quality is based on:
  - Documentation completeness
  - Link validity
  - Code coverage
  - Performance metrics

## Benefits

### For Repository Maintainers
- ✅ Always up-to-date documentation
- ✅ Automated quality checks
- ✅ No manual screenshot management
- ✅ Consistent documentation format
- ✅ Quality tracking over time

### For Users
- ✅ Current screenshots and guides
- ✅ Accurate API documentation
- ✅ Valid links in all documentation
- ✅ Clear getting started guides

### For Programming Agents
- ✅ Structured codebase information
- ✅ Clear entry points and build commands
- ✅ Architecture pattern documentation
- ✅ Machine-parsable project structure
- ✅ Up-to-date API references

## Maintenance

The documentation automation system is:

- **Self-maintaining**: Runs automatically on schedule
- **Self-correcting**: Includes error handling and fallbacks
- **Self-documenting**: Generates reports on its own operation
- **Fault-tolerant**: Continues even if individual steps fail

No manual intervention is required for routine operation.

## Troubleshooting

If the workflow fails:

1. Check the workflow run logs in GitHub Actions
2. Review uploaded artifacts for partial results
3. Check the quality reports for specific issues
4. Manually trigger the workflow with different options

## Future Enhancements

Potential improvements:
- Generate code examples from tests
- Create interactive API explorer
- Add changelog generation
- Generate dependency graphs
- Create video tutorials from screenshots
- Add AI-generated code summaries

## Related Files

- `.github/workflows/documentation-automation.yml` - Main workflow
- `scripts/automation/generate-api-docs-simple.cjs` - Fallback API doc generator
- `scripts/automation/generate-docs-only.js` - Main documentation generator
- `scripts/automation/documentation-analytics.js` - Analytics and quality tracking
- `scripts/automation/link-validator.js` - Link validation
- `scripts/automation/dashboard-generator.js` - Dashboard generation

## Summary

The SwissKnife documentation automation system provides:

1. **Weekly automated updates** to keep documentation current
2. **Dual-audience support** for both human users and AI agents
3. **Comprehensive coverage** including screenshots, API docs, and guides
4. **Quality assurance** with automated validation and metrics
5. **Fault tolerance** to ensure documentation is always available

This system significantly reduces the maintenance burden while ensuring high-quality, up-to-date documentation for all audiences.
