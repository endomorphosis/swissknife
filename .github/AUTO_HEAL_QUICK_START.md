# Auto-Heal System Quick Start Guide

## What is the Auto-Heal System?

The Auto-Heal System automatically detects failed GitHub Actions workflows and creates pull requests to fix them using GitHub Copilot agents. It's a self-healing CI/CD mechanism that helps maintain code quality and reduce manual intervention.

## How to Use

### 1. The System is Already Active

Once the auto-heal workflow is merged, it automatically monitors all workflows. No additional setup is required!

### 2. When a Workflow Fails

When any workflow fails, the auto-heal system will:

1. **Detect the failure** within seconds
2. **Analyze the error logs** to identify the issue
3. **Create a new branch** named `auto-heal/[workflow-name]-[timestamp]`
4. **Open a Pull Request** with:
   - Detailed failure analysis
   - Extracted error messages
   - Instructions for GitHub Copilot
   - A checklist of items to fix

### 3. Fixing with GitHub Copilot

Once the auto-heal PR is created:

#### Option A: Use GitHub Copilot (Recommended)

1. Navigate to the auto-heal PR
2. Review the failure details in the PR description
3. GitHub Copilot can analyze the errors and suggest fixes
4. Review the suggested changes
5. Merge when ready

#### Option B: Manual Fix

1. Navigate to the auto-heal PR
2. Review the tracking file in `.github/auto-heal-tracking/`
3. Check the error logs and failure summary
4. Make fixes directly in the PR branch
5. Push your commits to the auto-heal branch
6. Merge when ready

### 4. After Merging

Once the auto-heal PR is merged:
- The related tracking issue (if created) will be closed
- The auto-heal branch will be deleted
- The original workflow should now pass

## Example Scenarios

### Scenario 1: Linting Error

**What happens:**
1. CI workflow fails due to ESLint errors
2. Auto-heal creates PR with error details:
   ```
   ESLint found 3 errors:
   - src/utils/helper.ts:45 - Missing semicolon
   - src/components/App.tsx:89 - Unused variable 'data'
   ```
3. GitHub Copilot or developer fixes the linting issues
4. PR is merged, CI passes

### Scenario 2: Test Failure

**What happens:**
1. Test suite fails with 2 failing tests
2. Auto-heal creates PR with test failure details:
   ```
   FAIL src/utils/parser.test.ts
   - parseJSON should handle invalid input
   - parseJSON should throw on malformed data
   ```
3. Developer reviews test failures
4. Fixes the `parseJSON` function or updates tests
5. PR is merged, tests pass

### Scenario 3: Build Error

**What happens:**
1. Build fails with TypeScript compilation errors
2. Auto-heal creates PR with error details:
   ```
   src/App.tsx:42:5 - error TS2322: 
   Type 'string' is not assignable to type 'number'
   ```
3. GitHub Copilot or developer fixes the type error
4. PR is merged, build succeeds

## Testing the Auto-Heal System

### Method 1: Use the Test Workflow

We've included a test workflow for demonstrating the auto-heal system:

1. Go to Actions tab → "Test Auto-Heal System (Example)"
2. Click "Run workflow"
3. Choose a failure type (e.g., "syntax_error")
4. Watch the auto-heal system create a PR

### Method 2: Trigger a Real Failure

Alternatively, you can trigger a real failure:

1. Make a small breaking change (e.g., add a syntax error)
2. Push to a branch
3. Wait for CI to fail
4. Observe the auto-heal PR being created

## Understanding the Auto-Heal PR

### PR Structure

```markdown
# 🤖 Auto-Heal: Fix [Workflow Name] workflow failure

## Workflow Failure Details
- Failed Workflow: [Name]
- Run ID: [Link to failed run]
- Source Branch: [Branch name]

## Task for GitHub Copilot Agent
[Detailed instructions for fixing]

## Extracted Error Messages
[Actual error logs and messages]

## Checklist for Fixing
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Test changes
- [ ] Verify no regressions
```

### Tracking File

Each PR includes a tracking file at `.github/auto-heal-tracking/[workflow]-[timestamp].md`:

```markdown
# Auto-Heal Tracking
- Workflow: CI Tests
- Failed Run ID: 123456
- Source Branch: main
- Created: 2024-01-15 14:30:00 UTC

## Instructions for GitHub Copilot Agent
[Detailed context and instructions]

## Failure Summary
[Complete failure analysis]

## Error Details
[Extracted errors from logs]
```

## Best Practices

### DO:
✅ Review auto-heal PRs promptly  
✅ Close false positives quickly  
✅ Merge successful fixes to prevent duplicates  
✅ Use auto-heal PRs as learning opportunities  
✅ Clean up old tracking files periodically  

### DON'T:
❌ Ignore auto-heal PRs for too long  
❌ Create manual PRs for issues that auto-heal already detected  
❌ Disable auto-heal without understanding the impact  
❌ Merge auto-heal PRs without reviewing the changes  
❌ Let tracking files accumulate indefinitely  

## Monitoring Auto-Heal Activity

### View All Auto-Heal PRs

```bash
gh pr list --label auto-heal
```

### View Auto-Heal PRs for Specific Workflow

```bash
gh pr list --label auto-heal --search "Fix CI"
```

### Check Tracking Files

```bash
ls -la .github/auto-heal-tracking/
cat .github/auto-heal-tracking/[filename].md
```

### View Auto-Heal Workflow Runs

```bash
gh run list --workflow=auto-heal-failed-workflows.yml
```

## Troubleshooting

### "Auto-heal PR wasn't created"

**Possible causes:**
1. Workflow is excluded (e.g., auto-heal workflow itself)
2. Branch pattern is excluded (e.g., `auto-heal/*` branches)
3. Auto-heal PR already exists for this workflow
4. Workflow didn't actually fail (check conclusion)

**Solution:**
Check auto-heal workflow run logs for details.

### "Too many auto-heal PRs"

**Possible causes:**
1. Multiple workflows failing repeatedly
2. Same workflow failing on multiple branches

**Solution:**
1. Fix the underlying issues causing failures
2. Consider adding workflows to exclusion list if needed

### "Copilot isn't responding"

**Possible causes:**
1. PR description doesn't include clear instructions
2. Error logs aren't properly formatted

**Solution:**
1. Review the PR description and tracking file
2. Add a manual comment with `@github-copilot` mention

## Advanced Configuration

### Exclude Specific Workflows

Edit `.github/workflows/auto-heal-failed-workflows.yml`:

```yaml
# In the check-failure job
- name: Check if auto-heal should be triggered
  run: |
    # Add workflows to exclude
    if [[ "${{ github.event.workflow_run.name }}" == "Deploy Production" ]]; then
      echo "should_create_pr=false" >> $GITHUB_OUTPUT
      exit 0
    fi
```

### Customize PR Template

Modify the PR body template in the `Create Pull Request` step to customize the format and instructions.

### Change Branch Naming

Update the branch name generation in the `Create auto-heal branch` step:

```bash
branch_name="fix/${workflow_slug}-${timestamp}"  # Instead of auto-heal/
```

## Cleanup and Maintenance

### Clean Up Old Tracking Files

Remove tracking files older than 30 days:

```bash
find .github/auto-heal-tracking/ -name "*.md" -mtime +30 -delete
```

### Clean Up Merged Auto-Heal Branches

```bash
git branch -r | grep "auto-heal/" | sed 's/origin\///' | xargs -r git push origin --delete
```

### Archive Old Auto-Heal PRs

Periodically review and close stale auto-heal PRs:

```bash
gh pr list --label auto-heal --state open --json number,createdAt
```

## FAQ

**Q: Will this create infinite loops?**  
A: No, the system has multiple safeguards to prevent loops:
- Auto-heal workflows don't trigger auto-heal
- `auto-heal/*` branches don't trigger auto-heal
- Duplicate detection prevents multiple PRs for the same failure

**Q: What if the auto-heal PR is wrong?**  
A: Simply close the PR and fix the issue manually. The tracking file remains for reference.

**Q: Can I use this for private repositories?**  
A: Yes, as long as you have GitHub Actions and Copilot access.

**Q: Does this work with external workflows?**  
A: The system monitors workflows in the same repository. For external workflows, you'd need to set up auto-heal in each repository.

**Q: What permissions does auto-heal need?**  
A: Auto-heal needs `contents: write`, `pull-requests: write`, `actions: read`, and `issues: write` permissions.

## Support

For issues or questions:

1. Check the [AUTO_HEAL_README.md](AUTO_HEAL_README.md) for detailed documentation
2. Review existing auto-heal PRs for examples
3. Check workflow run logs for error details
4. Open an issue with the `auto-heal` label

## Next Steps

1. ✅ Merge this PR to enable auto-heal
2. 🧪 Test with the example workflow
3. 📊 Monitor auto-heal activity
4. 🔧 Customize as needed for your workflow
5. 📚 Share feedback and improvements

Happy auto-healing! 🤖✨
