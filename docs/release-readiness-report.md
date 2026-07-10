# Release Readiness Report

Generated: 2026-07-10T05:49:13.057Z
Commit: 9ea0c8e40e86b1e1822e38658b4dd28420430a30
Overall status: ❌ FAILED
Duration: 0.8s

| Gate | Status | Duration |
| --- | --- | --- |
| Service-boundary audit (services:audit) | ❌ failed | 0.8s |

## Virtual Desktop Release Evidence

Path: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`
Decision: `go`
Representative decision: `go`
All-tools decision: `go`
Blockers: 0
Warnings: 1

### Hierarchical MCP

Release gate decision: `go`
Evidence decision: `go`
Services live: 3 / 3
Expected live services: none
Full facade services: 3 / 3
Dispatch probes: 3 / 3
Direct-only descriptors: 232
Unexplained flat hierarchy gaps: 0
Stale live-service expectations ignored: 0

Release evidence warnings:
- 232 MCP descriptors remain direct-only and are explicitly accounted for in hierarchical MCP evidence.

## Failure detail

### Service-boundary audit (services:audit)

```
> swissknife@0.0.53 services:audit
> node scripts/audit-source-modules.mjs --fail-on-unknown --fail-on-forbidden --fail-on-legacy --json docs/service-boundary-audit.json && node scripts/audit-release-evidence-freshness.mjs --update module-boundary-audit --json docs/release-evidence-freshness.json --report docs/release-evidence-freshness.md
source modules:audit
manifest: src/module-ownership.json (schema 1, version 2026-07-08)
modules: 46
root files: 15
unknown files: 0
forbidden imports: 3
legacy compatibility shims: 0
legacy root import specifiers: 0
root files: 15
  - src/cli-phase1.ts [entrypoints]: root source compatibility file with an explicit owner
  - src/cli-simple.ts [entrypoints]: root source compatibility file with an explicit owner
  - src/cli.ts [entrypoints]: root source compatibility file with an explicit owner
  - src/command-registry.ts [commands]: root source compatibility file with an explicit owner
  - src/commands.ts [commands]: root source compatibility file with an explicit owner
  - src/context.ts [commands]: root source compatibility file with an explicit owner
  - src/cost-tracker.ts [utils]: root source compatibility file with an explicit owner
  - src/history.ts [commands]: root source compatibility file with an explicit owner
  - src/index.ts [entrypoints]: root source compatibility file with an explicit owner
  - src/messages.ts [commands]: root source compatibility file with an explicit owner
  - src/permissions.ts [utils]: root source compatibility file with an explicit owner
  - src/ProjectOnboarding.tsx [components]: root source compatibility file with an explicit owner
  - src/query.ts [commands]: root source compatibility file with an explicit owner
  - src/Tool.ts [tools]: root source compatibility file with an explicit owner
  - src/tools.ts [tools]: root source compatibility file with an explicit owner
unknown files: 0
  - none
forbidden imports: 3
  - src/services/mcp/mcpClient.ts:38 [service-mcp] -> src/commands.ts (static-import "../../commands.js"): service-mcp forbids imports from commands
  - src/services/platform/claude.ts:11 [services] -> src/query.ts (static-import "../../query.js"): services forbids imports from commands
  - src/services/platform/vcr.ts:4 [services] -> src/query.ts (static-import "../../query.js"): services forbids imports from commands
legacy compatibility shims: 0
  - none
legacy root import specifiers: 0
  - none
source modules:audit failed on forbidden imports
```

