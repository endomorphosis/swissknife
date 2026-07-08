# SwissKnife Test Lanes

SwissKnife has five active test lanes. Active gates intentionally use explicit
test lists or scoped globs so archived configs, debug artifacts, generated
backup files, and timeout-fixed copies do not enter release checks by accident.

| Lane | Command | Scope |
| --- | --- | --- |
| Fast | `npm run test:fast` | Deterministic curated Jest unit suite for fast local and CI feedback. This is also the default `npm test` lane. |
| Service | `npm run test:service` | Stable service-level Jest coverage for agent, task, config, model execution, and command helper behavior. |
| Browser compatibility | `npm run test:browser-compat` | Static Jest compatibility checks plus mocked Vitest DOM runtime checks for browser APIs and WebGPU fallbacks. |
| E2E/MCP | `npm run test:e2e` and `npm run test:e2e:mcp` | End-to-end Jest coverage and the MCP dashboard Playwright/consumer gate. |
| Release | `npm run test:release` | Sequential release gate: fast, service, browser compatibility, and E2E/MCP. `npm run release:prepare` adds build and audit checks. |

## Archive Policy

The active lanes exclude these paths and file classes:

- `test/archived/`, `cleanup-archive/`, `emergency-archive/`, `swissknife_old/`, and `dist-test/`
- backup and local recovery suffixes such as `.bak`, `.backup`, `.old`, `.orig`, `.tmp`, and `.bak.N`
- superseded timeout-fixed copies matching `*_timeout_fixed.test.*` or `*-timeout-fixed.test.*`

Legacy one-off scripts can remain in the repository for reference, but they are
not part of active gates unless they are moved into one of the named lane configs
under `config/jest/` or `build-tools/configs/`.
