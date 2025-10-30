# GitHub Copilot Task Files

This directory contains structured task files created by the Auto-Heal system for GitHub Copilot to work on.

## Purpose

When a GitHub Actions workflow fails, the Auto-Heal system automatically:
1. Creates a new branch for fixing the issue
2. Generates a structured task file in this directory
3. Creates a PR with references to the task file
4. Provides all necessary context for GitHub Copilot to fix the issue

## Task File Format

Each task file follows this structure:

```markdown
# GitHub Copilot Task: Fix [Workflow Name] Workflow Failure

## Task Overview
- Type, Priority, Created date
- Failed workflow and run information

## Objective
Clear description of what needs to be fixed

## Context
Failure summary and background information

## Error Details
Extracted error messages and logs

## Required Actions
Step-by-step checklist of what needs to be done

## Guidelines
Best practices and constraints for implementing fixes

## Success Criteria
How to verify the fix is complete

## Resources
Links to relevant files and documentation
```

## How to Use

### For GitHub Copilot Workspace

1. Open the PR created by Auto-Heal
2. Click "Open in GitHub Copilot Workspace"
3. Reference the task file path in your prompt:
   ```
   Please review and complete the task in .github/copilot-tasks/fix-[workflow-name].md
   ```
4. Let Copilot analyze and implement the fixes

### For Manual Fixes

1. Open the task file and review the failure analysis
2. Check the error logs in `.github/auto-heal-tracking/`
3. Implement the fixes according to the guidelines
4. Verify against the success criteria
5. Push your changes to the auto-heal branch

### For Copilot-Assisted Manual Fixes

1. Review the task file to understand the issue
2. Use `@github-copilot` in PR comments to ask for help
3. Reference specific sections from the task file
4. Collaborate with Copilot to implement and test fixes

## Task File Lifecycle

1. **Created** - When a workflow fails and Auto-Heal triggers
2. **Active** - While the PR is open and being worked on
3. **Completed** - When the PR is merged and workflow passes
4. **Archived** - Old task files can be moved to an archive subdirectory

## Cleanup

Task files can be archived or deleted after the corresponding PR is merged:

```bash
# Move completed task files to archive
mkdir -p .github/copilot-tasks/archive
mv .github/copilot-tasks/fix-*.md .github/copilot-tasks/archive/

# Or delete old completed tasks
find .github/copilot-tasks -name "fix-*.md" -mtime +30 -delete
```

## Related Documentation

- [Auto-Heal System README](../AUTO_HEAL_README.md)
- [Auto-Heal Architecture](../AUTO_HEAL_ARCHITECTURE.md)
- [Auto-Heal Integration Guide](../AUTO_HEAL_INTEGRATION.md)
- [Auto-Heal Quick Start](../AUTO_HEAL_QUICK_START.md)

## Examples

See the task files created by the Auto-Heal system for real examples of how workflow failures are analyzed and structured for fixing.

---

*This directory is managed by the Auto-Heal workflow system.*
