# Auto-Heal Workflow Documentation

## Overview

The Auto-Heal workflow automatically creates issues and draft PRs when GitHub Actions workflows fail, then invokes @github-copilot to implement fixes.

## How It Works

When a workflow fails, the auto-heal system follows this simple pattern (similar to VS Code):

### 1. **Create Issue with Failure Logs** 🚨

The workflow automatically creates a GitHub issue containing:
- Complete failure information (workflow name, run ID, branch)
- Full failure summary and analysis
- Extracted error messages from logs
- Links to the failed run and workflow file

**Example Issue Title:** `🚨 Workflow Failure: SwissKnife CI`

### 2. **Create Draft PR** 📝

A draft PR is created that:
- References the issue with `Fixes #<issue_number>`
- Contains `@github-copilot` mention in the description
- Includes clear instructions for fixing the failure
- Links back to the issue for complete details

**Example PR Title:** `🤖 Auto-heal: Fix SwissKnife CI workflow failure`

### 3. **Invoke GitHub Copilot** 🤖

The PR description includes `@github-copilot please fix this workflow failure`, which:
- Invokes the GitHub Copilot agent on the PR
- Provides clear task instructions
- References the issue for complete failure details
- May trigger automatic fix implementation

### 4. **Monitor & Merge** ✅

Once the fix is implemented:
- Review the changes made by Copilot or manually
- Ensure all CI checks pass
- Mark the PR as ready for review
- Merge the PR (this will automatically close the issue)

## Workflow Flow

```
Workflow Failure
       ↓
Create Issue with Logs (#123)
       ↓
Create Branch (auto-heal/workflow-name-timestamp)
       ↓
Create Draft PR (references issue #123)
       ↓
@github-copilot invoked in PR description
       ↓
Monitor PR for Copilot's response
       ↓
Review & Merge (closes issue #123)
```

## Key Features

### ✅ **Simplicity**
- Issue → Draft PR → @github-copilot
- All failure details in the issue
- PR references issue for context

### ✅ **Security**
- Environment variables prevent code injection
- No untrusted code execution
- Safe branch naming and file handling

### ✅ **Loop Prevention**
- Skips auto-heal for auto-heal workflows
- Skips if existing auto-heal PR found
- Skips for auto-heal branches

### ✅ **Complete Information**
- Full failure logs in issue
- Error analysis and extraction
- Links to runs and workflow files

## Example Usage

When `SwissKnife CI` workflow fails:

1. **Issue Created:**
   - Title: `🚨 Workflow Failure: SwissKnife CI`
   - Body: Contains complete logs and error analysis
   - Labels: `workflow-failure`, `auto-heal`, `needs-fix`

2. **PR Created:**
   - Title: `🤖 Auto-heal: Fix SwissKnife CI workflow failure`
   - Body: `Fixes #123` + `@github-copilot please fix...`
   - Labels: `auto-heal`, `workflow-failure`, `automated`

3. **Copilot Invoked:**
   - Copilot sees the @mention in PR description
   - Can access issue #123 for complete details
   - May automatically implement fixes

## Configuration

The workflow monitors these workflows (can be customized):
- SwissKnife CD (Deployment)
- SwissKnife CI - Robust
- SwissKnife CI
- Docker Integration CI
- Documentation Automation
- Multi-Architecture Build
- Build and Publish
- Production Deployment
- Release Management
- Self-Hosted ARM64 Build
- SonarQube Analysis
- Version Bump
- Test Auto-Heal System

## Permissions Required

```yaml
permissions:
  contents: write
  pull-requests: write
  actions: read
  issues: write
```

## Customization

To add more workflows to monitor, edit `.github/workflows/auto-heal-failed-workflows.yml`:

```yaml
on:
  workflow_run:
    workflows:
      - "Your Workflow Name"
      - "Another Workflow"
    types:
      - completed
```

## Manual Testing

Use the test workflow to simulate failures:

```bash
# Trigger via GitHub Actions UI
# Go to Actions → Test Auto-Heal System (Example) → Run workflow
# Choose failure type: syntax_error, test_failure, build_error, or lint_error
```

## Troubleshooting

### Copilot doesn't respond
- Open the PR in GitHub Copilot Workspace
- Manually reference the issue number in Copilot
- Implement fixes manually using the issue details

### Multiple auto-heal PRs
- The workflow checks for existing PRs
- If multiple PRs exist, close duplicates

### Issue not closed after merge
- PRs using `Fixes #123` should auto-close issues
- Manually close if needed

## Benefits vs Previous Implementation

### Before (676 lines):
- Created branch with tracking files
- Created complex PR with embedded logs
- Created separate Copilot task file
- Added Copilot comment separately
- Created duplicate issue at the end
- Complex tracking system

### After (433 lines):
- **35% smaller** - Simpler and easier to maintain
- **Issue-first approach** - All details in one place
- **Direct @github-copilot mention** - In PR description (like VS Code)
- **Single source of truth** - Issue contains all logs
- **Cleaner PR** - References issue instead of duplicating content
- **No duplicate tracking** - Issue serves as tracking mechanism

## Related Files

- `.github/workflows/auto-heal-failed-workflows.yml` - Main workflow
- `.github/workflows/test-auto-heal-example.yml` - Test workflow
- This document - Usage and design documentation
