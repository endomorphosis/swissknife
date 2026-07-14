# Browser validation Node toolchain

SwissKnife browser builds and compatibility tests require a Node release that
satisfies:

```text
^20.19.0 || >=22.12.0
```

This is the runtime boundary required by the repository's Vite 7 toolchain.
Node 20.18 and older, Node 21, and Node 22.11 and older are unsupported. The
portable baseline in [`.nvmrc`](../.nvmrc) is Node 20.19.0. It is a release
identifier, not a path from one workstation. `package.json`, the root package
in `package-lock.json`, and the verifier carry the same policy. The repository
uses the npm lockfile and declares npm 10.8.2 as its package-manager baseline.
A newer npm supplied with a supported newer Node release is valid and is
recorded in the receipt.

## Preparing a checkout

With nvm installed, the normal interactive setup is:

```sh
cd swissknife
nvm install
nvm use
node scripts/verify-browser-toolchain.mjs
npm ci --legacy-peer-deps
```

`nvm use` alone is not evidence: it changes only the current shell. The
verifier independently checks the process that launched it, the first `node`
and `npm` on `PATH`, executable symlink targets, any version label in a
version-manager path, repository metadata, and the lockfile. A shell alias or
login-shell initialization cannot substitute for this check.

Run browser validation only after verification succeeds:

```sh
npm run build:web
npm run test:browser-compat
```

Both npm commands have a `pre` hook that runs the same verifier. This protects
direct developer and CI use in addition to supervisor lane startup. The same
`pre` hook pattern covers every other Vite build target
(`build:cli`, `build:ipfs`, `build:collaborative`, `build:workers`) and every
other browser-proof command (`test:browser`, `test:ai-inference`,
`browser:compat:inventory`). `scripts/run_playwright_test.mjs` — the shared
launcher behind `test:e2e:mcp`, `test:e2e:meta-glasses`, and
`test:e2e:libp2p-browser` — verifies the toolchain against
`process.execPath` before it ever spawns the Playwright CLI, and
`test:e2e:playwright` carries the equivalent `pretest:e2e:playwright` hook.
No Vite, Playwright, or libp2p browser command in this repository can start
without first resolving and verifying a supported Node runtime.

## Supervisor and clean-checkout resolution

The supervisor resolves `node` from its inherited `PATH` without sourcing an
interactive shell. It keeps the absolute lexical executable path so a
mislabeled symlink remains detectable, prepends that executable's directory to
the child `PATH`, and invokes:

```text
ABS_NODE scripts/verify-browser-toolchain.mjs \
  --check-node-executable ABS_NODE \
  --receipt RECEIPT_PATH
```

Lane startup records
`tmp/browser-validation-toolchain/lane-startup.json`. Clean-checkout validation
performs a new resolution and records
`tmp/browser-validation-toolchain/clean-checkout-validation.json`. Validation
commands run in a non-login, non-interactive shell with the verified Node
directory first on `PATH`. Therefore an absent runtime, an unsupported system
fallback, and a fix that exists only in shell startup files fail before npm,
Vite, Playwright, libp2p, or browser proof commands run.

CI must use the same order: install a version matching `.nvmrc`, run the
verifier (passing the selected absolute executable where the runner exposes
it), and only then invoke npm. A broad `20.x` setup without verification is not
sufficient because releases below 20.19 do not meet the toolchain boundary.
The compatibility matrix jobs exercise both boundary releases, Node 20.19.0
and Node 22.12.0; the remaining jobs use the exact `.nvmrc` baseline. Docker
builders use the same 20.19.0 baseline and verify it before `npm ci`.

## Verification contract and receipt

The verifier has no third-party imports, so it works before `npm ci`:

```text
node scripts/verify-browser-toolchain.mjs [--receipt PATH] [--check-node-executable PATH] [--json]
```

Without `--receipt`, the ignored path
`test-results/browser-toolchain/verification-receipt.json` is used. Pass
`--receipt -` for a check that does not write a file. Relative receipt paths are
resolved against the caller's working directory. Receipt writes are atomic.
The command exits nonzero and writes an `ok: false` receipt when a runnable but
invalid toolchain is found.

A successful `swissknife.browser-validation-toolchain.v1` receipt records:

- the selected, canonical, and `PATH` Node executable paths;
- the exact Node semantic version and the supported-version policy;
- the resolved and canonical npm executable and npm semantic version;
- the declared `.nvmrc` and package-manager baselines;
- the SHA-256 fingerprint, byte count, and lockfile format version of
  `package-lock.json`; and
- deterministic policy boundary checks proving the minimum supported and
  adjacent unsupported versions.

The check fails when:

- the running Node does not satisfy `^20.19.0 || >=22.12.0`;
- `--check-node-executable`, `process.execPath`, and the first `node` on `PATH`
  do not identify the same underlying executable;
- a path component such as `v20.19.0` or `node-v22.12.0-linux-x64` claims a
  version different from the executable's own report;
- npm is missing, older than 10.8.2, or not resolved beside the selected Node
  command;
- `.nvmrc`, `package.json`, and `package-lock.json` disagree with the policy;
  or
- the npm lockfile is absent or malformed.

Receipts are evidence for one invocation, not a durable approval. Run the
verifier again after switching Node, changing `PATH`, or modifying package
metadata or the lockfile. Receipts deliberately record the absolute executable
that actually ran, but receipt destinations are ignored build/lane evidence;
those host paths are never repository toolchain configuration.
