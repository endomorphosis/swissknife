# Root file permanent locations

Historical one-shot notes, cleanup phase scripts, demos, and runner guides
previously lived in the repository root. They now live under stable project
paths aligned with `docs/PHASED_CLEANUP_PLAN.md`.

## Core root (intentionally retained)

| Path | Role |
| --- | --- |
| `README.md`, `CHANGELOG.md`, `FUNDING.json` | Project card / legal / funding |
| `package.json`, lockfiles, `.npmrc`, `.nvmrc` | Package manager |
| `cli.mjs` | Published bin entry (`swissknife` / `kode`) |
| `docker-compose.yml` | Local compose entry |
| `tsconfig*.json`, `playwright.config.ts` | Tooling entrypoints |
| `.eslintrc.cjs`, `.eslintignore`, `.env.error-reporting.example` | Tooling / env samples |
| Symlinks (`jest.config.cjs`, `vite.config.ts`, …) | Compatibility aliases into `config/` / `build-tools/` |

## Relocations

| Former root path | Permanent location |
| --- | --- |
| `ARM64_RUNNER_SUCCESS.md` | `docs/reports/ARM64_RUNNER_SUCCESS.md` |
| `CLEANUP_COMPLETION_CERTIFICATE.md` | `docs/reports/CLEANUP_COMPLETION_CERTIFICATE.md` |
| `DESKTOP_VERIFICATION_REPORT.md` | `docs/reports/DESKTOP_VERIFICATION_REPORT.md` |
| `MULTI_ARCH_IMPLEMENTATION.md` | `docs/reports/MULTI_ARCH_IMPLEMENTATION.md` |
| `PULL_REQUEST_COMPLETION_SUMMARY.md` | `docs/reports/PULL_REQUEST_COMPLETION_SUMMARY.md` |
| `IMPLEMENTATION_PLAN.md` | `docs/plans/IMPLEMENTATION_PLAN.md` |
| `AUTO_HEAL_IMPROVEMENTS.md` | `docs/plans/AUTO_HEAL_IMPROVEMENTS.md` |
| `AUTO_HEAL_WORKFLOW.md` | `docs/plans/AUTO_HEAL_WORKFLOW.md` |
| `RUNNER_REGISTRATION_GUIDE.md` | `docs/ci/RUNNER_REGISTRATION_GUIDE.md` |
| `RUNNER_SETUP_GUIDE.md` | `docs/ci/RUNNER_SETUP_GUIDE.md` |
| `phase1-create-structure.sh` … `phase6-final-validation.sh` | `scripts/maintenance/` |
| `cleanup-empty-docs.sh` | `scripts/maintenance/cleanup-empty-docs.sh` |
| `preflight-check.sh` | `scripts/maintenance/preflight-check.sh` |
| `setup-swissknife-runner.sh` | `scripts/ci/setup-swissknife-runner.sh` |
| `cinema-virtual-desktop-demo.html` | `demo/cinema-virtual-desktop-demo.html` |
| `neural-photoshop-*.html` | `demo/` |
| `package.unified.json` | `config/package.unified.json` |
| `.gitignore.pre-phase6` | `config/archive/gitignore.pre-phase6` |
| `run-core-tests.js.new` | `scripts/archive/run-core-tests.js.new` |
| `auth_audit.log`, `server.log` | Untracked runtime logs under `logs/` (gitignored) |

## Conventions

- **docs/reports/** — point-in-time reports, certificates, verification summaries
- **docs/plans/** — living or historical plans / workflow designs
- **docs/ci/** — runner and CI operator guides
- **scripts/maintenance/** — reorganization / preflight / cleanup automation
- **scripts/ci/** — CI and self-hosted runner automation
- **demo/** — standalone HTML demos and manual browser checks
- **config/** — non-entrypoint configuration artifacts

Runtime logs belong in `logs/` and must not be committed.
