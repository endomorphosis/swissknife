# Auto-Heal System Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Workflows                      │
│  (CI, Tests, Build, Deploy, etc.)                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ workflow_run event (on completion)
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Auto-Heal Failed Workflows                          │
│                                                                   │
│  Step 1: Check Failure                                           │
│  ├─ Workflow concluded with 'failure'? ─────No───► Exit         │
│  ├─ Is this the auto-heal workflow? ────────Yes──► Exit (loop)  │
│  ├─ Is this an auto-heal/* branch? ─────────Yes──► Exit (loop)  │
│  └─ Auto-heal PR already exists? ───────────Yes──► Exit (dup)   │
│                 │                                                 │
│                 │ Yes, proceed                                    │
│                 ▼                                                 │
│  Step 2: Analyze Failure                                         │
│  ├─ Fetch workflow run details                                   │
│  ├─ Get failed job information                                   │
│  ├─ Download job logs (up to 3 failed jobs)                      │
│  ├─ Extract error messages and patterns                          │
│  └─ Create failure summary                                       │
│                 │                                                 │
│                 ▼                                                 │
│  Step 3: Create Auto-Heal Branch                                 │
│  ├─ Generate unique branch name                                  │
│  │   Format: auto-heal/[workflow-name]-[timestamp]               │
│  ├─ Create tracking file in .github/auto-heal-tracking/          │
│  └─ Push branch to origin                                        │
│                 │                                                 │
│                 ▼                                                 │
│  Step 4: Create Pull Request                                     │
│  ├─ Format PR with failure details                               │
│  ├─ Add instructions for GitHub Copilot                          │
│  ├─ Include extracted errors and logs                            │
│  ├─ Add checklist for fixing                                     │
│  └─ Apply labels: auto-heal, workflow-failure, automated         │
│                 │                                                 │
│                 ▼                                                 │
│  Step 5: Add Copilot Instructions                                │
│  ├─ Comment on PR with @github-copilot mention                   │
│  ├─ Provide specific analysis instructions                       │
│  └─ Include fixing guidelines                                    │
│                 │                                                 │
│                 ▼                                                 │
│  Step 6: Create Tracking Issue (Optional)                        │
│  └─ Link issue to auto-heal PR for visibility                    │
│                                                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ PR Created
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Auto-Heal Pull Request                         │
│                                                                   │
│  PR Contents:                                                     │
│  ├─ Title: 🤖 Auto-heal: Fix [workflow] failure                  │
│  ├─ Description with failure details                             │
│  ├─ Instructions for GitHub Copilot Agent                        │
│  ├─ Extracted error messages                                     │
│  ├─ Checklist of items to fix                                    │
│  └─ Links to failed workflow run                                 │
│                                                                   │
│  Branch: auto-heal/[workflow-name]-[timestamp]                   │
│  ├─ Tracking file: .github/auto-heal-tracking/[...].md           │
│  └─ Ready for fixes                                              │
│                                                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Developers or Copilot can now fix
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Fix Implementation                           │
│                                                                   │
│  Option A: GitHub Copilot Agent                                  │
│  ├─ @github-copilot analyzes the PR                              │
│  ├─ Copilot implements fixes based on error analysis             │
│  ├─ Pushes commits to auto-heal branch                           │
│  └─ Developer reviews and approves                               │
│                                                                   │
│  Option B: Manual Fix                                            │
│  ├─ Developer reviews failure details                            │
│  ├─ Developer implements fixes                                   │
│  ├─ Pushes commits to auto-heal branch                           │
│  └─ Developer approves when ready                                │
│                                                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Fixes implemented and tested
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Merge & Cleanup                             │
│                                                                   │
│  ├─ PR is merged to source branch                                │
│  ├─ Tracking issue is closed (if created)                        │
│  ├─ Auto-heal branch is deleted                                  │
│  └─ Original workflow runs and (hopefully) passes ✅              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Workflow Monitoring

- **Event**: `workflow_run` with type `completed`
- **Scope**: All workflows in the repository (`workflows: ["*"]`)
- **Trigger**: Only when conclusion is `failure`

### 2. Loop Prevention

Three layers of protection:

1. **Self-Exclusion**: Auto-heal workflow doesn't trigger auto-heal
   ```yaml
   if: ${{ github.event.workflow_run.name != 'Auto-Heal Failed Workflows' }}
   ```

2. **Branch Pattern**: Auto-heal branches don't trigger auto-heal
   ```yaml
   if: ${{ !startsWith(github.event.workflow_run.head_branch, 'auto-heal/') }}
   ```

3. **Duplicate Detection**: Check for existing auto-heal PRs
   ```bash
   gh pr list --search "Auto-heal: $workflow_name"
   ```

### 3. Failure Analysis Pipeline

```
Failed Workflow Run
    ├─ Get Run Details (JSON)
    ├─ Identify Failed Jobs
    ├─ Download Job Logs (first 3)
    ├─ Extract Error Patterns
    │   ├─ "Error:", "ERROR:"
    │   ├─ "Failed", "FAILED"
    │   ├─ "fatal:", "Exception"
    │   └─ "npm ERR!"
    └─ Generate Summary
```

### 4. Tracking File Structure

```
.github/auto-heal-tracking/
└── [workflow-slug]-[timestamp].md
    ├─ Workflow Information
    ├─ Failed Run ID & Link
    ├─ Source Branch
    ├─ Failure Summary
    ├─ Error Details
    └─ Recommended Actions
```

### 5. PR Content Template

```markdown
# Header
🤖 Auto-heal: Fix [Workflow Name] workflow failure

# Failure Details
- Workflow Name
- Run ID (with link)
- Source Branch
- Timestamp

# Copilot Instructions
Clear, actionable steps for fixing

# Error Extraction
Relevant error messages from logs

# Checklist
- [ ] Root cause analysis
- [ ] Implementation
- [ ] Testing
- [ ] Verification
```

### 6. GitHub Copilot Integration

The PR is designed to work seamlessly with GitHub Copilot:

1. **Structured Instructions**: Clear task description
2. **Error Context**: Relevant error messages and logs
3. **Actionable Steps**: Specific guidance on what to fix
4. **Comment Trigger**: `@github-copilot` mention for activation
5. **Checklist Format**: Easy to track progress

## Data Flow

```
Workflow Failure Event
    ↓
Failure Details (JSON)
    ↓
Error Extraction & Analysis
    ↓
Tracking File (.md)
    ↓
PR Description (Markdown)
    ↓
Copilot Instructions (Comment)
    ↓
Fix Implementation (Commits)
    ↓
Merge & Resolution
```

## Security Considerations

1. **Permissions**: Minimal required permissions
   - `contents: write` - Create branches
   - `pull-requests: write` - Create PRs
   - `actions: read` - Read workflow data
   - `issues: write` - Create tracking issues

2. **Token Usage**: Uses `${{ github.token }}` (automatic, scoped)

3. **Branch Protection**: Respects branch protection rules

4. **No Secrets Exposure**: Logs are filtered for sensitive data

## Scalability

- **Rate Limiting**: Max 3 failed job logs per auto-heal run
- **Deduplication**: Prevents duplicate PRs
- **Cleanup**: Tracking files can be archived periodically

## Extension Points

Future enhancements can be added:

1. **Custom Analyzers**: Add specialized analysis for specific error types
2. **ML Predictions**: Predict likely fixes based on patterns
3. **Auto-Testing**: Test fixes before creating PR
4. **Priority System**: Prioritize critical workflow failures
5. **Metrics Dashboard**: Track auto-heal success rates

## Usage Patterns

### Development Workflow
```
Developer pushes code → CI fails → Auto-heal creates PR → 
Copilot fixes → Developer reviews → Merge → CI passes
```

### Production Workflow
```
Deployment fails → Auto-heal creates PR → Team reviews → 
Manual fix + testing → Merge → Deploy retry → Success
```

### Maintenance Workflow
```
Dependency update breaks tests → Auto-heal creates PR → 
Copilot updates tests → CI validates → Auto-merge
```

## Monitoring

Track auto-heal effectiveness:

```bash
# View all auto-heal PRs
gh pr list --label auto-heal

# Check success rate
merged=$(gh pr list --label auto-heal --state merged --json number | jq 'length')
total=$(gh pr list --label auto-heal --state all --json number | jq 'length')
echo "Success Rate: $((merged * 100 / total))%"

# View tracking files
ls -lh .github/auto-heal-tracking/
```
