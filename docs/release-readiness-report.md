# Release Readiness Report

Generated: 2026-07-08T10:36:53.641Z
Commit: f752f53b9ebff975f9d3856b278dd34b0eaabfd8
Overall status: ❌ FAILED
Duration: 32.3s

| Gate | Status | Duration |
| --- | --- | --- |
| Service-boundary audit (services:audit) | ✅ passed | 0.7s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 0.6s |
| TypeScript project typecheck (typecheck) | ✅ passed | 5.2s |
| Fast unit test lane (test:fast) | ✅ passed | 4.1s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 7.8s |
| Web bundle build + host-leakage/budget audit (build:web) | ✅ passed | 6.9s |
| Web bundle host-leakage re-audit (audit:bundle-host-leakage) | ✅ passed | 4.5s |
| Browser/libp2p release evidence freshness (evidence:freshness:check) | ✅ passed | 0.3s |
| MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses) | ❌ failed | 2.2s |

## Failure detail

### MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses)

```
> swissknife@0.0.53 evidence:mcp-glasses
> npm run test:run -- test/mcp-plus-plus/glasses-manifest-coverage.test.ts test/mcp-plus-plus/mobile-orb-edge-all-apps.test.ts
> swissknife@0.0.53 test:run
> vitest run --config build-tools/configs/vitest.config.ts test/mcp-plus-plus/glasses-manifest-coverage.test.ts test/mcp-plus-plus/mobile-orb-edge-all-apps.test.ts
 RUN  v3.2.7 /home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure/swissknife
 ❯ test/mcp-plus-plus/glasses-manifest-coverage.test.ts (2 tests | 1 failed) 17ms
   ✓ SWR-006 glasses manifest ownership and coverage > keeps product surface files under their owning service directories 7ms
   × SWR-006 glasses manifest ownership and coverage > rebuilds ORB/IDL and glasses coverage from app-owned manifest inputs 8ms
     → ENOENT: no such file or directory, open '/home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure/swissknife/test-results/virtual-desktop-ipfs-mcp-orb/all-tools-ledger.json'
 ✓ test/mcp-plus-plus/mobile-orb-edge-all-apps.test.ts (1 test) 147ms
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 2 passed (3)
   Start at  03:36:52
   Duration  1.13s (transform 453ms, setup 122ms, collect 631ms, tests 164ms, environment 1ms, prepare 331ms)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/mcp-plus-plus/glasses-manifest-coverage.test.ts > SWR-006 glasses manifest ownership and coverage > rebuilds ORB/IDL and glasses coverage from app-owned manifest inputs
Error: ENOENT: no such file or directory, open '/home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure/swissknife/test-results/virtual-desktop-ipfs-mcp-orb/all-tools-ledger.json'
 ❯ readJson test/mcp-plus-plus/glasses-manifest-coverage.test.ts:114:21
    112| 
    113| function readJson<T>(fileName: string): T {
    114|   return JSON.parse(readFileSync(join(evidenceRoot, fileName), 'utf8')…
       |                     ^
    115| }
    116| 
 ❯ test/mcp-plus-plus/glasses-manifest-coverage.test.ts:80:20
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

