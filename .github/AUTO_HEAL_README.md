# Auto-Heal Workflow System

## Overview

The Auto-Heal Workflow System is an automated self-healing mechanism for GitHub Actions workflows. When any workflow fails, this system automatically:

1. Detects the failure
2. Analyzes the error logs and failure details
3. Creates a new pull request with comprehensive failure information
4. Provides instructions for GitHub Copilot agents to automatically fix the issues

## How It Works

### Workflow Monitoring

The system uses GitHub's `workflow_run` event to monitor all workflows in the repository. When a workflow completes with a `failure` conclusion, the auto-heal workflow is triggered.

```yaml
on:
  workflow_run:
    workflows: ["*"]  # Monitor all workflows
    types:
      - completed
```

### Failure Analysis

When a failure is detected, the system:

1. **Checks for loops**: Prevents creating auto-heal PRs for auto-heal workflows themselves
2. **Checks for duplicates**: Avoids creating multiple PRs for the same failure
3. **Gathers failure details**: 
   - Workflow run information
   - Failed job details
   - Error logs from failed jobs
   - Specific error messages

### Auto-Heal PR Creation

The system creates a new branch and pull request with:

- **Comprehensive failure summary**: Workflow name, run ID, branch, conclusion
- **Error analysis**: Extracted error messages and patterns
- **Instructions for fixing**: Step-by-step guidance for GitHub Copilot agents
- **Tracking file**: Detailed failure information stored in `.github/auto-heal-tracking/`

### GitHub Copilot Integration

The PR is specifically formatted to work with GitHub Copilot agents:

1. Clear task description in the PR body
2. Specific instructions as a PR comment mentioning `@github-copilot`
3. Checklist of items to fix
4. Error logs and context for analysis

## Usage

### Automatic Triggering

The auto-heal system runs automatically when any workflow fails. No manual intervention is required for it to trigger.

### With GitHub Copilot Agents

Once an auto-heal PR is created:

1. Navigate to the PR
2. GitHub Copilot can analyze the failure details
3. Copilot can automatically implement fixes based on the error analysis
4. Review and merge the fixes

### Manual Fixing

Alternatively, developers can:

1. Review the auto-heal PR
2. Examine the failure details in the PR description
3. Check the tracking file in `.github/auto-heal-tracking/`
4. Manually implement fixes
5. Push commits to the auto-heal branch

## Configuration

### Permissions Required

The workflow requires the following permissions:

```yaml
permissions:
  contents: write       # To create branches and commit files
  pull-requests: write  # To create and comment on PRs
  actions: read        # To read workflow run details
  issues: write        # To create tracking issues
```

### Secrets Required

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions (no setup needed)

### Optional: Prevent Auto-Heal for Specific Workflows

To prevent auto-heal from triggering for specific workflows, you can:

1. Add the workflow name to the exclusion list in the `check-failure` job
2. Or use branch name patterns to exclude certain branches

Example modification:

```yaml
- name: Check if auto-heal should be triggered
  run: |
    # Add workflow names to exclude
    excluded_workflows=("Deploy Production" "Release")
    
    for excluded in "${excluded_workflows[@]}"; do
      if [[ "${{ github.event.workflow_run.name }}" == "$excluded" ]]; then
        echo "Skipping auto-heal for excluded workflow"
        echo "should_create_pr=false" >> $GITHUB_OUTPUT
        exit 0
      fi
    done
```

## Loop Prevention

The system includes multiple safeguards to prevent infinite loops:

1. **Self-exclusion**: Auto-heal workflows don't trigger auto-heal for themselves
2. **Branch pattern exclusion**: Branches starting with `auto-heal/` don't trigger auto-heal
3. **Duplicate detection**: Checks for existing auto-heal PRs before creating new ones

## File Structure

```
.github/
├── workflows/
│   └── auto-heal-failed-workflows.yml  # Main auto-heal workflow
├── auto-heal-tracking/                  # Tracking files for auto-heal attempts
│   └── [workflow-slug]-[timestamp].md   # Individual tracking files
└── AUTO_HEAL_README.md                  # This documentation
```

## Tracking Files

Each auto-heal attempt creates a tracking file in `.github/auto-heal-tracking/` containing:

- Workflow name and run ID
- Source branch
- Timestamp
- Failure summary
- Error details
- Recommended actions

These files serve as:
- Historical record of auto-heal attempts
- Context for GitHub Copilot agents
- Reference for manual debugging

## Monitoring and Maintenance

### View Auto-Heal PRs

Filter PRs with the label `auto-heal`:

```bash
gh pr list --label auto-heal
```

### View Tracking Files

```bash
ls -la .github/auto-heal-tracking/
```

### Clean Up Old Tracking Files

Periodically remove old tracking files for merged or closed PRs:

```bash
# Remove tracking files older than 30 days
find .github/auto-heal-tracking/ -name "*.md" -mtime +30 -delete
```

## Troubleshooting

### Auto-Heal PR Not Created

Check:
1. Workflow run logs for the auto-heal workflow
2. Whether the workflow name or branch is excluded
3. If an auto-heal PR already exists for the same failure

### Copilot Not Responding

Ensure:
1. The PR description includes clear instructions
2. Error logs are properly extracted
3. The comment mentions `@github-copilot` correctly

### Too Many Auto-Heal PRs

If you're getting too many auto-heal PRs:
1. Add specific workflows to the exclusion list
2. Adjust the duplicate detection logic
3. Set up branch protection rules

## Best Practices

1. **Review auto-heal PRs promptly**: Don't let them accumulate
2. **Close false positives**: If auto-heal triggered incorrectly, close the PR
3. **Merge successful fixes**: When fixes work, merge them to prevent duplicate PRs
4. **Monitor the tracking directory**: Clean up old tracking files periodically
5. **Update exclusion lists**: Add workflows that shouldn't trigger auto-heal

## Examples

### Example Auto-Heal PR

```markdown
# 🤖 Auto-Heal: Fix CI Workflow failure

## Workflow Failure Details

**Failed Workflow**: SwissKnife CI  
**Run ID**: [123456](https://github.com/owner/repo/actions/runs/123456)  
**Source Branch**: main  

## Task for GitHub Copilot Agent

Please analyze the build failure and fix the linting errors.

### Error Details

- ESLint errors in src/utils/helper.js
- Missing semicolons on lines 45, 67, 89
...
```

### Example Tracking File

```markdown
# Auto-Heal Tracking

- **Workflow**: SwissKnife CI
- **Failed Run ID**: 123456
- **Source Branch**: main
- **Created**: 2024-01-15 14:30:00 UTC

## Instructions for GitHub Copilot Agent

Review the ESLint errors and fix the code style issues...
```

## Future Enhancements

Potential improvements to the auto-heal system:

1. **ML-based failure prediction**: Predict likely causes based on error patterns
2. **Automatic testing**: Test fixes before creating PR
3. **Smart fix suggestions**: Suggest specific fixes based on error type
4. **Integration with issue tracking**: Link auto-heal PRs to related issues
5. **Metrics and analytics**: Track auto-heal success rates and common failures

## Contributing

To improve the auto-heal system:

1. Test with various failure scenarios
2. Improve error extraction patterns
3. Enhance Copilot instructions
4. Add support for specific workflow types
5. Improve loop prevention logic

## Support

For issues or questions about the auto-heal system:

1. Check existing auto-heal PRs for examples
2. Review tracking files for failure patterns
3. Examine workflow run logs
4. Open an issue with the `auto-heal` label
