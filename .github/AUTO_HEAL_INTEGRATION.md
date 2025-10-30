# Auto-Heal System Integration Guide

This guide explains how to integrate and use the Auto-Heal Workflow System with GitHub Copilot agents.

## Table of Contents

1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [Using with GitHub Copilot](#using-with-github-copilot)
4. [Configuration](#configuration)
5. [Monitoring](#monitoring)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

## System Overview

The Auto-Heal System consists of:

- **Main Workflow**: `.github/workflows/auto-heal-failed-workflows.yml`
- **Test Workflow**: `.github/workflows/test-auto-heal-example.yml`
- **Tracking Directory**: `.github/auto-heal-tracking/`
- **Documentation**:
  - `AUTO_HEAL_README.md` - Comprehensive system documentation
  - `AUTO_HEAL_QUICK_START.md` - Quick start guide
  - `AUTO_HEAL_ARCHITECTURE.md` - System architecture and flow
  - `AUTO_HEAL_INTEGRATION.md` - This file

## Getting Started

### Prerequisites

- GitHub repository with Actions enabled
- GitHub Copilot access (recommended)
- Repository permissions for creating branches and PRs

### Installation

The auto-heal system is automatically active once the workflow file is in `.github/workflows/`. No additional installation is required.

### Verification

To verify the system is working:

1. Check that the workflow file exists:
   ```bash
   ls -la .github/workflows/auto-heal-failed-workflows.yml
   ```

2. View workflow in Actions tab:
   - Go to repository → Actions
   - Look for "Auto-Heal Failed Workflows" in the workflows list

3. Test with example workflow:
   ```bash
   # Trigger the test workflow
   gh workflow run test-auto-heal-example.yml -f failure_type=syntax_error
   ```

## Using with GitHub Copilot

### Automatic Fix Flow

1. **Workflow Fails** → Auto-heal PR is created automatically
2. **Review PR** → Check failure details and error logs
3. **Invoke Copilot** → Comment with `@github-copilot` or use Copilot features
4. **Review Fixes** → Copilot implements fixes based on error analysis
5. **Merge** → Once validated, merge the PR

### Manual Invocation

If Copilot doesn't auto-respond, you can manually invoke it:

```markdown
@github-copilot Please analyze the workflow failure and implement fixes:

1. Review the error logs in the PR description
2. Check the tracking file: .github/auto-heal-tracking/[filename].md
3. Implement minimal fixes to resolve the errors
4. Test that the fixes work correctly

Focus on:
- [Specific error or component from the logs]
- [Any additional context]
```

### Copilot Best Practices

1. **Be Specific**: Point Copilot to specific errors or files
2. **Provide Context**: Include relevant information from error logs
3. **Iterate**: If first fix doesn't work, provide feedback and ask for refinement
4. **Review Carefully**: Always review Copilot's changes before merging

## Configuration

### Basic Configuration

No configuration required - the system works out of the box with sensible defaults.

### Advanced Configuration

#### Exclude Specific Workflows

Edit `.github/workflows/auto-heal-failed-workflows.yml`:

```yaml
- name: Check if auto-heal should be triggered
  id: check
  run: |
    # Add workflows to exclude
    excluded_workflows=(
      "Deploy Production"
      "Release to NPM"
      "Critical Security Scan"
    )
    
    for excluded in "${excluded_workflows[@]}"; do
      if [[ "${{ github.event.workflow_run.name }}" == "$excluded" ]]; then
        echo "Skipping auto-heal for excluded workflow: $excluded"
        echo "should_create_pr=false" >> $GITHUB_OUTPUT
        exit 0
      fi
    done
```

#### Customize Branch Naming

Change the branch name format in the "Create auto-heal branch" step:

```bash
# Current: auto-heal/[workflow-slug]-[timestamp]
branch_name="auto-heal/${workflow_slug}-${timestamp}"

# Alternative: fix/[workflow-slug]-[timestamp]
branch_name="fix/${workflow_slug}-${timestamp}"

# Alternative: bot/auto-fix-[workflow-slug]
branch_name="bot/auto-fix-${workflow_slug}-${timestamp}"
```

#### Adjust Log Extraction Limit

Modify how many failed job logs are downloaded:

```bash
# Current: First 3 failed jobs
cat /tmp/failure-analysis/failed-jobs.json | jq -s -r '.[:3][] | .databaseId'

# Alternative: First 5 failed jobs
cat /tmp/failure-analysis/failed-jobs.json | jq -s -r '.[:5][] | .databaseId'

# Alternative: All failed jobs (warning: may be slow)
cat /tmp/failure-analysis/failed-jobs.json | jq -s -r '.[] | .databaseId'
```

#### Customize Error Patterns

Add more error patterns to extract:

```bash
# Current patterns
grep -E "Error:|ERROR:|Failed|FAILED|fatal:|Exception|npm ERR!" "$logfile"

# Add custom patterns
grep -E "Error:|ERROR:|Failed|FAILED|fatal:|Exception|npm ERR!|WARN:|⚠️|❌|Build failed" "$logfile"
```

#### Disable Issue Creation

Comment out or remove the "Create GitHub Issue" step:

```yaml
# - name: Create GitHub Issue for Manual Review
#   if: steps.create-pr.outputs.pr_number != ''
#   env:
#     GH_TOKEN: ${{ github.token }}
#   run: |
#     # Issue creation code...
```

## Monitoring

### View Auto-Heal Activity

#### List All Auto-Heal PRs

```bash
# All auto-heal PRs
gh pr list --label auto-heal

# Open auto-heal PRs
gh pr list --label auto-heal --state open

# Merged auto-heal PRs
gh pr list --label auto-heal --state merged
```

#### View Workflow Runs

```bash
# List auto-heal workflow runs
gh run list --workflow=auto-heal-failed-workflows.yml

# View specific run details
gh run view [run-id]
```

#### Check Tracking Files

```bash
# List all tracking files
ls -la .github/auto-heal-tracking/

# View recent tracking files
ls -lt .github/auto-heal-tracking/ | head -10

# Read a tracking file
cat .github/auto-heal-tracking/[filename].md
```

### Metrics and Analytics

#### Calculate Success Rate

```bash
#!/bin/bash
# Calculate auto-heal PR success rate

merged=$(gh pr list --label auto-heal --state merged --json number --jq 'length')
closed=$(gh pr list --label auto-heal --state closed --json number --jq 'length')
open=$(gh pr list --label auto-heal --state open --json number --jq 'length')
total=$((merged + closed + open))

if [ $total -gt 0 ]; then
  success_rate=$((merged * 100 / total))
  echo "Auto-Heal Success Rate: ${success_rate}%"
  echo "  Merged: $merged"
  echo "  Closed: $closed"
  echo "  Open: $open"
  echo "  Total: $total"
else
  echo "No auto-heal PRs found"
fi
```

#### Track Common Failures

```bash
#!/bin/bash
# Find most common workflow failures

gh pr list --label auto-heal --state all --limit 100 --json title \
  | jq -r '.[].title' \
  | grep -oP 'Fix \K[^w]+workflow' \
  | sort | uniq -c | sort -rn | head -10
```

### Dashboard Integration

Create a simple dashboard script:

```bash
#!/bin/bash
# Auto-Heal Dashboard

echo "======================================"
echo "   Auto-Heal System Dashboard"
echo "======================================"
echo ""

# Active PRs
open_prs=$(gh pr list --label auto-heal --state open --json number --jq 'length')
echo "📊 Open Auto-Heal PRs: $open_prs"

# Recent Activity
echo ""
echo "📋 Recent Auto-Heal PRs:"
gh pr list --label auto-heal --limit 5 --json number,title,createdAt,state \
  | jq -r '.[] | "  #\(.number) - \(.title) (\(.state)) - \(.createdAt | split("T")[0])"'

# Tracking Files
echo ""
tracking_files=$(ls .github/auto-heal-tracking/*.md 2>/dev/null | wc -l)
echo "📁 Tracking Files: $tracking_files"

# Recent Workflow Runs
echo ""
echo "🔄 Recent Auto-Heal Workflow Runs:"
gh run list --workflow=auto-heal-failed-workflows.yml --limit 5 --json status,conclusion,createdAt \
  | jq -r '.[] | "  \(.status) - \(.conclusion // "in_progress") - \(.createdAt | split("T")[0])"'

echo ""
echo "======================================"
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: Auto-Heal PR Not Created

**Symptoms**: Workflow fails but no auto-heal PR is created

**Possible Causes**:
1. Workflow is excluded (e.g., auto-heal workflow itself)
2. Branch pattern excluded (e.g., `auto-heal/*`)
3. Auto-heal PR already exists
4. Permissions issue

**Solutions**:
```bash
# Check auto-heal workflow run logs
gh run list --workflow=auto-heal-failed-workflows.yml
gh run view [run-id]

# Check for existing PRs
gh pr list --search "Auto-heal"

# Verify workflow file
cat .github/workflows/auto-heal-failed-workflows.yml | grep -A 5 "Check if auto-heal"
```

#### Issue: Too Many Auto-Heal PRs

**Symptoms**: Multiple auto-heal PRs created for same issue

**Possible Causes**:
1. Workflow failing on multiple branches
2. Duplicate detection not working
3. Different workflow runs with same failure

**Solutions**:
```bash
# Review and close duplicate PRs
gh pr list --label auto-heal --state open

# Update duplicate detection logic if needed
# (Edit the workflow file)

# Set up branch protection to prevent auto-merges
```

#### Issue: Copilot Not Responding

**Symptoms**: Auto-heal PR created but Copilot doesn't suggest fixes

**Possible Causes**:
1. Copilot not mentioned correctly
2. Insufficient context in PR
3. Error logs not properly formatted

**Solutions**:
```bash
# Manually comment on PR
gh pr comment [pr-number] --body "@github-copilot Please analyze and fix the workflow failure"

# Add more context to PR
gh pr edit [pr-number] --body "$(cat tracking-file.md)"

# Check Copilot availability
# (Visit PR in browser and check Copilot suggestions)
```

#### Issue: Workflow Permissions Error

**Symptoms**: Auto-heal workflow fails with permission error

**Possible Causes**:
1. Insufficient permissions in workflow
2. Repository settings restrict Actions
3. Branch protection rules prevent push

**Solutions**:
```yaml
# Verify permissions in workflow file
permissions:
  contents: write        # For creating branches
  pull-requests: write   # For creating PRs
  actions: read         # For reading workflow data
  issues: write         # For creating issues

# Check repository settings
# Settings → Actions → General → Workflow permissions
# Ensure "Read and write permissions" is enabled
```

### Debug Mode

Enable debug logging:

```yaml
# Add to auto-heal workflow
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

### Testing Changes

Test workflow changes safely:

```bash
# 1. Create test branch
git checkout -b test-auto-heal-changes

# 2. Modify workflow
vim .github/workflows/auto-heal-failed-workflows.yml

# 3. Commit and push
git commit -am "Test: auto-heal workflow changes"
git push origin test-auto-heal-changes

# 4. Trigger test workflow
gh workflow run test-auto-heal-example.yml -f failure_type=syntax_error

# 5. Monitor results
gh run watch
```

## Best Practices

### For Developers

1. **Review Promptly**: Check auto-heal PRs within 24 hours
2. **Provide Feedback**: If Copilot's fix isn't right, guide it with comments
3. **Close False Positives**: Immediately close PRs for non-issues
4. **Learn from Patterns**: Review tracking files to understand common failures
5. **Update Documentation**: Document recurring issues and their fixes

### For Teams

1. **Set Up Notifications**: Configure Slack/Teams alerts for auto-heal PRs
2. **Assign Ownership**: Designate team members to review auto-heal PRs
3. **Track Metrics**: Monitor success rates and common failure types
4. **Regular Cleanup**: Archive old tracking files monthly
5. **Continuous Improvement**: Update error patterns and fix strategies

### For Repositories

1. **Maintain Workflow Quality**: Keep workflows up-to-date and tested
2. **Use Branch Protection**: Require reviews for auto-heal PRs
3. **Set Up CI Checks**: Ensure auto-heal PRs run through CI before merge
4. **Document Exclusions**: Clearly document which workflows skip auto-heal
5. **Version Control**: Track changes to auto-heal configuration

## Integration with CI/CD Pipeline

### Example: Integration with Main CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  # ... existing CI jobs ...

  # Add notification if auto-heal is available
  notify-auto-heal:
    runs-on: ubuntu-latest
    if: failure()
    needs: [test, build, lint]  # Depends on your CI jobs
    steps:
      - name: Notify about auto-heal
        run: |
          echo "::notice::This workflow failure will trigger auto-heal"
          echo "::notice::Check for auto-heal PR in a few minutes"
```

### Example: Pre-Merge Validation

```yaml
# Ensure auto-heal PRs pass CI before allowing merge
# .github/workflows/validate-auto-heal-pr.yml
name: Validate Auto-Heal PR

on:
  pull_request:
    branches: [main, develop]

jobs:
  validate:
    if: contains(github.event.pull_request.labels.*.name, 'auto-heal')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run full test suite
        run: npm test
      
      - name: Verify fix resolves original failure
        run: |
          # Custom validation logic
          echo "Validating that the fix resolves the original failure"
```

## Advanced Features

### Custom Error Analyzers

Create specialized analyzers for different error types:

```bash
# In auto-heal workflow, add:
- name: Analyze error type
  run: |
    if grep -q "ESLint" /tmp/failure-analysis/errors.txt; then
      echo "ERROR_TYPE=linting" >> $GITHUB_ENV
    elif grep -q "Test.*failed" /tmp/failure-analysis/errors.txt; then
      echo "ERROR_TYPE=testing" >> $GITHUB_ENV
    elif grep -q "Build.*failed" /tmp/failure-analysis/errors.txt; then
      echo "ERROR_TYPE=build" >> $GITHUB_ENV
    else
      echo "ERROR_TYPE=unknown" >> $GITHUB_ENV
    fi

- name: Add type-specific instructions
  run: |
    case "$ERROR_TYPE" in
      linting)
        echo "Run 'npm run lint:fix' to automatically fix linting errors"
        ;;
      testing)
        echo "Review test failures and update tests or implementation"
        ;;
      build)
        echo "Check for TypeScript errors or missing dependencies"
        ;;
    esac
```

### Auto-Merge for Simple Fixes

For simple, safe fixes (optional):

```yaml
# Add to auto-heal workflow
- name: Auto-merge if simple fix
  if: env.ERROR_TYPE == 'linting' && env.FIX_APPLIED == 'true'
  run: |
    # Wait for CI to pass
    sleep 60
    
    # Check if CI passed
    if gh pr checks [pr-number] | grep -q "All checks have passed"; then
      gh pr merge [pr-number] --auto --squash
    fi
```

## Resources

- **Documentation**:
  - [AUTO_HEAL_README.md](AUTO_HEAL_README.md) - Full documentation
  - [AUTO_HEAL_QUICK_START.md](AUTO_HEAL_QUICK_START.md) - Quick start guide
  - [AUTO_HEAL_ARCHITECTURE.md](AUTO_HEAL_ARCHITECTURE.md) - System architecture

- **GitHub Resources**:
  - [GitHub Actions Documentation](https://docs.github.com/en/actions)
  - [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
  - [Workflow Syntax Reference](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)

- **Community**:
  - Open issues with `auto-heal` label for questions
  - Review existing auto-heal PRs for examples
  - Check workflow run logs for troubleshooting

## Support

For help with the auto-heal system:

1. Check this integration guide
2. Review [AUTO_HEAL_QUICK_START.md](AUTO_HEAL_QUICK_START.md)
3. Search existing issues with `auto-heal` label
4. Open a new issue with detailed information

## Contributing

To improve the auto-heal system:

1. Test with various failure scenarios
2. Improve error pattern detection
3. Enhance Copilot instructions
4. Add support for new workflow types
5. Share your improvements via PR

---

**Happy auto-healing! 🤖✨**
