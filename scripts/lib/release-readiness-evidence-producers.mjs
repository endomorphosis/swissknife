#!/usr/bin/env node
/**
 * SVD-131: canonical, single source of truth for the release-readiness
 * evidence producers that must run once, for real, from an empty evidence
 * root before the release-readiness gate is allowed to aggregate to a `GO`
 * decision.
 *
 * Both `scripts/release-readiness-gate.mjs` (the real orchestration) and
 * `test/architecture/release-readiness-hermetic.test.ts` (the cold-start
 * regression test) import this module so the wiring under test is the exact
 * same wiring that runs in production -- the test cannot pass by
 * re-implementing or simulating a parallel copy of the orchestration logic.
 *
 * Every entry below corresponds to one of the evidence classes named in the
 * SVD-131 acceptance criteria:
 *   - "all-tools peer observations"          -> all-tools-peer-interoperability
 *   - "live app/tool binding catalog"        -> application-live-tool-bindings
 *   - "all-tools disposition catalog"        -> all-tools-disposition-catalog
 *   - "live binding gap ledger"              -> application-live-binding-gap-ledger
 *   - "current real app behavior"            -> application-live-behavior-proof
 *   - "application-originated gateway"        -> application-gateway-evidence
 *   - "Profiles A-H"                          -> mcpplusplus-profile-interoperability
 *   - "Meta simulator"                        -> meta-device-simulator-replay
 *   - "UI/UX accessibility recovery"          -> application-ui-ux-accessibility
 *   - "dispatch-artifact"                     -> dispatch-artifact-persistence
 *   - "merge-reconciliation"                  -> submodule-merge-reconciliation
 *   - "refactor main reconciliation"          -> refactor-main-reconciliation
 * ("freshness" and "independent closeout receipts" are already-wired gates
 * elsewhere in `release-readiness-gate.mjs`; they run immediately after
 * these producers and after the aggregator.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const evidenceRoot = path.join(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');

/**
 * @typedef {object} ProducerOwnership
 * @property {string} owner Stable code owner for the entrypoint.
 * @property {'host-release'|'browser-playwright'|'browser-libp2p'|'universal-helper'} runtime Runtime boundary.
 * @property {string} auditDecision Concrete ownership/audit decision for release maintainers.
 *
 * @typedef {object} EvidenceJsonCheck
 * @property {string} path Dot-separated JSON path to inspect.
 * @property {unknown=} equals Required exact value.
 * @property {unknown[]=} oneOf Required set membership.
 * @property {boolean=} present Whether a non-null/non-undefined value must exist.
 * @property {boolean=} truthy Whether the value must be truthy.
 * @property {number=} arrayMinLength Required minimum array length.
 * @property {number=} arrayMaxLength Required maximum array length.
 *
 * @typedef {object} EvidenceFileVerification
 * @property {string} file Evidence file path relative to `evidenceRoot`.
 * @property {boolean=} json Whether the file must parse as JSON.
 * @property {boolean=} generatedAt Whether `generated_at` must be a concrete timestamp.
 * @property {EvidenceJsonCheck[]=} checks Content checks that reject timestamp-only receipts.
 *
 * @typedef {object} EvidenceVerification
 * @property {'json-content-and-artifact-presence'} mode Verification strategy enforced by this module.
 * @property {EvidenceFileVerification[]} files Per-file JSON/content checks.
 * @property {'non-empty'=} directories Directory verification mode.
 *
 * @typedef {object} ReleaseEvidenceProducerGate
 * @property {string} id Stable gate ID.
 * @property {string} label Human-readable label.
 * @property {string} npmScript Production command.
 * @property {string[]} evidenceFiles Evidence files owned by this producer.
 * @property {string[]=} evidenceDirs Evidence directories owned by this producer.
 * @property {string[]=} dependsOn Producer dependencies by `id`.
 * @property {string} schema Primary receipt schema.
 * @property {string} taskId Owning SVD/SWR task.
 * @property {true} defaultEnabled SVD-131 release producers must be default-enabled.
 * @property {ProducerOwnership} ownership Ownership/runtime decision.
 * @property {EvidenceVerification} evidenceVerification Verification policy consumed by the gate and tests.
 *
 * @typedef {object} ReleaseReadinessEntrypointOwnership
 * @property {string} path Entrypoint path relative to the SwissKnife package root.
 * @property {string} owner Stable code owner.
 * @property {'host-release'|'browser-playwright'|'browser-libp2p'|'universal-helper'|'architecture-test'} runtime Runtime boundary.
 * @property {string} auditDecision Concrete ownership/audit decision for release maintainers.
 *
 * @typedef {object} ReleaseReadinessGateFinding
 * @property {string} id Stable finding ID.
 * @property {string} message Human-readable finding text.
 * @property {string=} file File path tied to the finding.
 * @property {string=} detail Extra deterministic detail.
 *
 * @typedef {object} ReleaseReadinessGateEntry
 * @property {string} id Gate ID.
 * @property {string} label Gate label.
 * @property {ReleaseEvidenceProducerGate} producer Producer manifest row backing this gate.
 * @property {() => {ok: boolean, status: number|string, durationMs: number, tail: string[], findings?: ReleaseReadinessGateFinding[]}} run Gate runner.
 */

function requiredReceiptChecks({ schema, taskId, extra = [] }) {
  return [
    { path: 'schema', equals: schema },
    { path: 'task_id', equals: taskId },
    ...extra,
  ];
}

/**
 * Ordered producer gates. Order matters: `mcpplusplus-profile-interoperability`
 * reads the JSON written by `application-gateway-evidence`
 * (`all-app-live-gateway-executions.json`) as its own input, so it must run
 * strictly after it.
 *
 * @type {ReleaseEvidenceProducerGate[]}
 */
export const RELEASE_EVIDENCE_PRODUCER_GATES = [
  {
    id: 'all-tools-peer-interoperability',
    label: 'All-tools HTTP/browser-libp2p peer interoperability evidence (SVD-100)',
    npmScript: 'evidence:all-tools-peer',
    evidenceFiles: ['swissknife-all-tools-peer-evidence.json'],
    schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
    taskId: 'SVD-100',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-libp2p',
      auditDecision: 'owned JavaScript/libp2p producer; starts isolated bridges and records exact name-level HTTP/libp2p tool observations',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'swissknife-all-tools-peer-evidence.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
          taskId: 'SVD-100',
          extra: [
            { path: 'decision', equals: 'go' },
            { path: 'services', arrayMinLength: 1 },
            { path: 'tools', arrayMinLength: 1 },
            { path: 'summary.explicitly_observed_tool_count', truthy: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'application-live-tool-bindings',
    label: 'All-app executable live tool binding catalog (SVD-104)',
    npmScript: 'evidence:live-tool-bindings',
    evidenceFiles: ['all-app-live-tool-bindings.json'],
    schema: 'swissknife.all-app-live-tool-bindings-evidence.v1',
    taskId: 'SVD-104',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'host-release',
      auditDecision: 'owned TypeScript catalog producer; materializes executable browser binding rows from the canonical app binding contract',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'all-app-live-tool-bindings.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-app-live-tool-bindings-evidence.v1',
          taskId: 'SVD-104',
          extra: [
            { path: 'capture_mode', equals: 'executable-browser-binding-catalog' },
            { path: 'bindings', arrayMinLength: 1 },
            { path: 'source_contract.schema', present: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'all-tools-disposition-catalog',
    label: 'All backend tools disposition catalog (SVD-105)',
    npmScript: 'evidence:all-tools-disposition',
    evidenceFiles: ['all-tools-disposition-catalog.json'],
    dependsOn: ['all-tools-peer-interoperability'],
    schema: 'swissknife.all-tools-disposition-catalog.v1',
    taskId: 'SVD-105',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'host-release',
      auditDecision: 'owned TypeScript disposition producer; consumes fresh exact-name peer observations and classifies every backend tool without count inference',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'all-tools-disposition-catalog.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-tools-disposition-catalog.v1',
          taskId: 'SVD-105',
          extra: [
            { path: 'decision', equals: 'GO' },
            { path: 'entries', arrayMinLength: 1 },
            { path: 'source_peer_evidence.path', equals: 'test-results/virtual-desktop-ipfs-mcp-orb/swissknife-all-tools-peer-evidence.json' },
          ],
        }),
      }],
    },
  },
  {
    id: 'application-live-binding-gap-ledger',
    label: 'All-app live binding gap ledger (SVD-102)',
    npmScript: 'evidence:live-binding-gap-ledger',
    evidenceFiles: ['all-app-live-binding-gap-ledger.json'],
    dependsOn: ['all-tools-peer-interoperability', 'application-live-tool-bindings'],
    schema: 'swissknife.all-app-live-binding-gap-ledger.v1',
    taskId: 'SVD-102',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'host-release',
      auditDecision: 'owned JavaScript ledger producer; recomputes declaration, discovery, binding, and freshness gaps from current source and evidence',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'all-app-live-binding-gap-ledger.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-app-live-binding-gap-ledger.v1',
          taskId: 'SVD-102',
          extra: [
            { path: 'validation.valid', equals: true },
            { path: 'applications', arrayMinLength: 1 },
            { path: 'application_backend_assignments', arrayMinLength: 1 },
          ],
        }),
      }],
    },
  },
  {
    id: 'application-live-behavior-proof',
    label: 'Current real application behavior proof (SVD-106)',
    npmScript: 'evidence:live-behavior-proof',
    evidenceFiles: ['all-app-live-behavior-proof.json'],
    evidenceDirs: ['app-screenshots/live-behavior-proof'],
    schema: 'swissknife.all-app-live-behavior-proof.v1',
    taskId: 'SVD-106',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-playwright',
      auditDecision: 'owned Playwright evidence producer; real browser fixture writes fresh behavior proof and screenshots',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      directories: 'non-empty',
      files: [{
        file: 'all-app-live-behavior-proof.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-app-live-behavior-proof.v1',
          taskId: 'SVD-106',
          extra: [
            { path: 'status', equals: 'passed' },
            { path: 'apps', arrayMinLength: 1 },
            { path: 'summary.passed', truthy: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'application-gateway-evidence',
    label: 'Application-originated browser gateway calls (SVD-126)',
    npmScript: 'evidence:live-gateway',
    evidenceFiles: ['all-app-live-gateway-executions.json'],
    schema: 'swissknife.all-app-live-gateway-executions.v2',
    taskId: 'SVD-126',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-playwright',
      auditDecision: 'owned Playwright evidence producer; leases a private app port and captures same-origin browser gateway calls',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'all-app-live-gateway-executions.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-app-live-gateway-executions.v2',
          taskId: 'SVD-126',
          extra: [
            { path: 'status', equals: 'passed' },
            { path: 'execution_origin', equals: 'canonical-virtual-desktop-browser' },
            { path: 'executions', arrayMinLength: 1 },
            { path: 'summary.executed_count', truthy: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'mcpplusplus-profile-interoperability',
    label: 'Profiles A-H HTTP/browser-libp2p transport matrix (SVD-127)',
    npmScript: 'evidence:profile-interoperability',
    evidenceFiles: ['all-app-mcpplusplus-profile-interoperability.json'],
    dependsOn: ['application-gateway-evidence'],
    schema: 'swissknife.all-app-mcpplusplus-profile-interoperability.v2',
    taskId: 'SVD-127',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-libp2p',
      auditDecision: 'owned TypeScript/browser-libp2p evidence producer; consumes the live gateway receipt and rejects simulated transport success',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'all-app-mcpplusplus-profile-interoperability.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-app-mcpplusplus-profile-interoperability.v2',
          taskId: 'SVD-127',
          extra: [
            { path: 'decision', equals: 'GO' },
            { path: 'live_network_claimed', equals: true },
            { path: 'desktop_paths', arrayMinLength: 1 },
            { path: 'application_evidence.schema', equals: 'swissknife.all-app-live-gateway-executions.v2' },
          ],
        }),
      }],
    },
  },
  {
    id: 'meta-device-simulator-replay',
    label: 'Hardware-free Meta glasses device simulator replay (SVD-099/SVD-111)',
    npmScript: 'evidence:meta-simulator',
    evidenceFiles: ['all-app-meta-device-simulator.json', 'all-app-meta-device-simulator-proof.json'],
    evidenceDirs: ['app-screenshots/meta-device-simulator', 'app-screenshots/meta-device-simulator-proof'],
    schema: 'swissknife.all-app-meta-device-simulator-proof.v1',
    taskId: 'SVD-111',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-playwright',
      auditDecision: 'owned Playwright simulator producer; replays compiled packets in the browser and records screenshots without hardware claims',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      directories: 'non-empty',
      files: [
        {
          file: 'all-app-meta-device-simulator.json',
          json: true,
          generatedAt: true,
          checks: requiredReceiptChecks({
            schema: 'swissknife.all-app-meta-device-simulator.v1',
            taskId: 'SVD-099',
            extra: [
              { path: 'status', equals: 'passed' },
              { path: 'boundary.hardware_free', equals: true },
              { path: 'packets', arrayMinLength: 1 },
            ],
          }),
        },
        {
          file: 'all-app-meta-device-simulator-proof.json',
          json: true,
          generatedAt: true,
          checks: requiredReceiptChecks({
            schema: 'swissknife.all-app-meta-device-simulator-proof.v1',
            taskId: 'SVD-111',
            extra: [
              { path: 'status', equals: 'passed' },
              { path: 'boundary.hardware_free', equals: true },
              { path: 'boundary.physical_hardware_claimed', equals: false },
              { path: 'packets', arrayMinLength: 1 },
            ],
          }),
        },
      ],
    },
  },
  {
    id: 'dispatch-artifact-persistence',
    label: 'Supervisor dispatch artifact CID/event-DAG persistence (SVD-113)',
    npmScript: 'evidence:dispatch-artifact',
    evidenceFiles: ['supervisor-dispatch-artifact-store.json'],
    schema: 'swissknife.supervisor-dispatch-artifact-store-evidence.v1',
    taskId: 'SVD-113',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-libp2p',
      auditDecision: 'owned TypeScript/WASM-safe persistence producer; verifies real CIDs, event DAG references, and approved peer retrieval semantics',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'supervisor-dispatch-artifact-store.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.supervisor-dispatch-artifact-store-evidence.v1',
          taskId: 'SVD-113',
          extra: [
            { path: 'decision', equals: 'GO' },
            { path: 'runtime_boundary.browser_safe', equals: true },
            { path: 'persistence.dispatch_cid', truthy: true },
            { path: 'retrieval.local.verified', equals: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'application-ui-ux-accessibility',
    label: 'All-app UI/UX accessibility and recovery evidence (SVD-112)',
    npmScript: 'evidence:ui-ux-accessibility',
    evidenceFiles: ['all-app-ui-ux-accessibility.json'],
    dependsOn: ['meta-device-simulator-replay'],
    schema: 'swissknife.all-app-ui-ux-accessibility.v1',
    taskId: 'SVD-112',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'browser-playwright',
      auditDecision: 'owned Playwright browser producer; captures desktop/mobile accessibility and recovery state evidence for every app',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'all-app-ui-ux-accessibility.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.all-app-ui-ux-accessibility.v1',
          taskId: 'SVD-112',
          extra: [
            { path: 'status', equals: 'passed' },
            { path: 'applications', arrayMinLength: 1 },
            { path: 'acceptance.zero_browser_errors', equals: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'submodule-merge-reconciliation',
    label: 'Submodule/workspace merge reconciliation (SVD-116)',
    npmScript: 'evidence:submodule-reconciliation',
    evidenceFiles: ['submodule-merge-reconciliation.json'],
    schema: 'swissknife.submodule-merge-reconciliation-evidence.v1',
    taskId: 'SVD-116',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'host-release',
      auditDecision: 'owned host release receipt; observes git reconciliation state without mutating or cleaning another worktree',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'submodule-merge-reconciliation.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.submodule-merge-reconciliation-evidence.v1',
          taskId: 'SVD-116',
          extra: [
            { path: 'repositories', arrayMinLength: 1 },
            { path: 'reconciliation.unresolved_conflicts_absent', equals: true },
          ],
        }),
      }],
    },
  },
  {
    id: 'refactor-main-reconciliation',
    label: 'Validated refactor-lane main reconciliation receipt (SWR-162)',
    npmScript: 'evidence:refactor-main-reconciliation',
    evidenceFiles: ['refactor-main-reconciliation.json'],
    schema: 'swissknife.refactor-main-reconciliation.v1',
    taskId: 'SWR-162',
    defaultEnabled: true,
    ownership: {
      owner: 'release-readiness',
      runtime: 'host-release',
      auditDecision: 'owned host release receipt; records accepted integration commits and rejected stale/recovery refs without merging candidate branches wholesale',
    },
    evidenceVerification: {
      mode: 'json-content-and-artifact-presence',
      files: [{
        file: 'refactor-main-reconciliation.json',
        json: true,
        generatedAt: true,
        checks: requiredReceiptChecks({
          schema: 'swissknife.refactor-main-reconciliation.v1',
          taskId: 'SWR-162',
          extra: [
            { path: 'decision', equals: 'GO' },
            { path: 'task_status.tasks.SWR-160.status', equals: 'completed' },
            { path: 'task_status.tasks.SWR-161.status', equals: 'completed' },
            { path: 'checkout.unmerged_paths', arrayMaxLength: 0 },
            { path: 'checkout.conflict_marker_paths', arrayMaxLength: 0 },
            { path: 'integration.ref_dispositions', arrayMinLength: 1 },
            { path: 'integration.rejected_stale_or_recovery_branches', arrayMinLength: 1 },
          ],
        }),
      }],
    },
  },
];

export const INDEPENDENT_REPLAY_EVIDENCE_FILE = 'independent-all-app-release-replay.json';

/**
 * Ownership decisions for the SVD-131 release orchestration entrypoints.
 * This gives docs and architecture tests one source of truth for script/config
 * ownership instead of maintaining a second audit table by hand.
 *
 * @type {ReleaseReadinessEntrypointOwnership[]}
 */
export const RELEASE_READINESS_ENTRYPOINT_OWNERSHIP = [
  {
    path: 'scripts/lib/release-readiness-evidence-producers.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'authoritative producer manifest for ownership, dependencies, artifact paths, default enablement, and evidence verification',
  },
  {
    path: 'scripts/release-readiness-gate.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'production release gate imports the manifest, cold-resets owned artifacts, enforces dependencies, and reports invalid evidence',
  },
  {
    path: 'scripts/lib/release-reproduction-attestation.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'SWR-141 provenance helper that captures clean-checkout reproduction, source fingerprints, evidence fingerprints, output hashes, and GO/NO_GO blockers',
  },
  {
    path: 'scripts/capture-refactor-main-reconciliation.cjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'SWR-162 merge receipt producer that classifies integrated commits and rejects stale attempt, diagnostic, rescue, and recovery refs without mutating branch state',
  },
  {
    path: 'scripts/lib/pick-free-port.mjs',
    owner: 'release-readiness',
    runtime: 'universal-helper',
    auditDecision: 'small endpoint lease helper that proves bind ownership without reusing, inspecting, killing, or masquerading as a foreign listener',
  },
  {
    path: 'scripts/run-with-owned-port.mjs',
    owner: 'release-readiness',
    runtime: 'host-release',
    auditDecision: 'host wrapper exports one verified-free leased port to one child command and leaves occupied preferred ports untouched',
  },
  {
    path: 'build-tools/configs/playwright.live-behavior-proof.config.ts',
    owner: 'release-readiness',
    runtime: 'browser-playwright',
    auditDecision: 'dedicated current-behavior Playwright config; spec owns its in-process fixture and writes real browser evidence and screenshots',
  },
  {
    path: 'build-tools/configs/playwright.live-gateway.config.ts',
    owner: 'release-readiness',
    runtime: 'browser-playwright',
    auditDecision: 'dedicated same-origin gateway Playwright config using a strict leased port with reuseExistingServer disabled',
  },
  {
    path: 'test/architecture/release-readiness-hermetic.test.ts',
    owner: 'release-readiness',
    runtime: 'architecture-test',
    auditDecision: 'hermetic regression coverage imports the production manifest and owned-port helper instead of a task-local producer list',
  },
];

/**
 * Post-producer receipts that are regenerated by later release-readiness gates
 * and must also be cleared for a one-pass clean-root release run. They are not
 * returned by `producerEvidenceAbsolutePaths()` because no producer manifest
 * entry owns them.
 */
export const RELEASE_READINESS_POST_PRODUCER_EVIDENCE_FILES = [
  INDEPENDENT_REPLAY_EVIDENCE_FILE,
];

export function validateReleaseReadinessManifest({
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  entrypoints = RELEASE_READINESS_ENTRYPOINT_OWNERSHIP,
  repoRoot: repoRootDir = repoRoot,
} = {}) {
  const findings = [];
  const producerIds = new Set();
  const completedProducerIds = new Set();
  const evidenceFiles = new Map();
  const allowedProducerRuntimes = new Set(['host-release', 'browser-playwright', 'browser-libp2p', 'universal-helper']);
  const allowedEntrypointRuntimes = new Set([...allowedProducerRuntimes, 'architecture-test']);
  const packageJsonPath = path.join(repoRootDir, 'package.json');
  const packageScripts = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts ?? {}
    : {};

  for (const producer of producers) {
    if (!producer.id || producerIds.has(producer.id)) {
      findings.push(`duplicate or missing producer id: ${producer.id ?? '<missing>'}`);
    }
    producerIds.add(producer.id);
    if (producer.defaultEnabled !== true) findings.push(`${producer.id}: producer must be defaultEnabled`);
    if (!producer.npmScript) {
      findings.push(`${producer.id}: missing npmScript`);
    } else if (fs.existsSync(packageJsonPath) && !packageScripts[producer.npmScript]) {
      findings.push(`${producer.id}: npmScript ${producer.npmScript} is not declared in package.json`);
    }
    if (!producer.schema || !producer.schema.startsWith('swissknife.')) findings.push(`${producer.id}: missing swissknife schema`);
    if (!/^S(?:VD|WR)-\d+$/.test(producer.taskId ?? '')) findings.push(`${producer.id}: missing SVD/SWR taskId`);
    if (producer.ownership?.owner !== 'release-readiness') findings.push(`${producer.id}: owner must be release-readiness`);
    if (!allowedProducerRuntimes.has(producer.ownership?.runtime)) findings.push(`${producer.id}: invalid runtime ${producer.ownership?.runtime}`);
    if (!producer.ownership?.auditDecision) findings.push(`${producer.id}: missing ownership audit decision`);
    if (
      ['browser-playwright', 'browser-libp2p'].includes(producer.ownership?.runtime)
      && !/browser|playwright|libp2p|typescript|wasm|javascript|same-origin|screenshots/i.test(producer.ownership.auditDecision ?? '')
    ) {
      findings.push(`${producer.id}: browser producer audit decision must state the real browser/libp2p/TypeScript/WASM ownership boundary`);
    }

    for (const dependencyId of producer.dependsOn ?? []) {
      if (!producerIds.has(dependencyId)) findings.push(`${producer.id}: unknown dependency ${dependencyId}`);
      if (!completedProducerIds.has(dependencyId)) findings.push(`${producer.id}: dependency ${dependencyId} must appear earlier in manifest order`);
    }

    const declaredFiles = new Set(producer.evidenceFiles ?? []);
    const verificationFiles = new Set((producer.evidenceVerification?.files ?? []).map((entry) => entry.file));
    if (declaredFiles.size === 0) findings.push(`${producer.id}: must declare at least one evidence file`);
    for (const file of declaredFiles) {
      if (path.isAbsolute(file) || file.split(/[\\/]+/).includes('..')) {
        findings.push(`${producer.id}: evidence file must be relative to evidence root: ${file}`);
      }
      if (evidenceFiles.has(file)) {
        findings.push(`${producer.id}: evidence file ${file} already owned by ${evidenceFiles.get(file)}`);
      }
      evidenceFiles.set(file, producer.id);
      if (!verificationFiles.has(file)) findings.push(`${producer.id}: evidence file ${file} is missing verification rules`);
    }
    for (const file of verificationFiles) {
      if (!declaredFiles.has(file)) findings.push(`${producer.id}: verification file ${file} is not declared as producer evidence`);
    }
    if (producer.evidenceVerification?.mode !== 'json-content-and-artifact-presence') {
      findings.push(`${producer.id}: unsupported evidence verification mode ${producer.evidenceVerification?.mode}`);
    }
    if ((producer.evidenceDirs ?? []).length > 0 && producer.evidenceVerification?.directories !== 'non-empty') {
      findings.push(`${producer.id}: evidence directories must be verified as non-empty`);
    }
    for (const verification of producer.evidenceVerification?.files ?? []) {
      const checks = verification.checks ?? [];
      if (verification.json !== true) findings.push(`${producer.id}: ${verification.file} must be JSON-verified`);
      if (verification.generatedAt !== true) findings.push(`${producer.id}: ${verification.file} must verify generated_at`);
      if (!checks.some((check) => check.path === 'schema')) findings.push(`${producer.id}: ${verification.file} must verify schema`);
      if (!checks.some((check) => check.path === 'task_id')) findings.push(`${producer.id}: ${verification.file} must verify task_id`);
      if (checks.length <= 2) findings.push(`${producer.id}: ${verification.file} must reject timestamp-only receipts with content checks`);
    }

    completedProducerIds.add(producer.id);
  }

  const entrypointPaths = new Set();
  for (const entrypoint of entrypoints) {
    if (!entrypoint.path || entrypointPaths.has(entrypoint.path)) {
      findings.push(`duplicate or missing entrypoint path: ${entrypoint.path ?? '<missing>'}`);
    }
    entrypointPaths.add(entrypoint.path);
    if (entrypoint.owner !== 'release-readiness') findings.push(`${entrypoint.path}: owner must be release-readiness`);
    if (!allowedEntrypointRuntimes.has(entrypoint.runtime)) findings.push(`${entrypoint.path}: invalid runtime ${entrypoint.runtime}`);
    if (!entrypoint.auditDecision) findings.push(`${entrypoint.path}: missing audit decision`);
    if (entrypoint.path && !fs.existsSync(path.join(repoRootDir, entrypoint.path))) {
      findings.push(`${entrypoint.path}: entrypoint path does not exist`);
    }
  }

  return findings;
}

/**
 * Absolute paths to every evidence file `producers` owns, resolved against
 * `evidenceRootDir`. Both arguments default to the real production manifest
 * and evidence root so existing callers do not need to change, but the
 * SVD-131 cold-start regression test overrides both with an isolated,
 * throwaway directory so it never touches (or races with) the real
 * `test-results/virtual-desktop-ipfs-mcp-orb` evidence root.
 */
export function producerEvidenceAbsolutePaths(
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRootDir = evidenceRoot,
) {
  const files = new Set();
  for (const gate of producers) {
    for (const file of gate.evidenceFiles ?? []) files.add(path.join(evidenceRootDir, file));
  }
  return [...files];
}

export function releaseReadinessEvidenceAbsolutePaths(
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRootDir = evidenceRoot,
) {
  const files = new Set(producerEvidenceAbsolutePaths(producers, evidenceRootDir));
  for (const file of RELEASE_READINESS_POST_PRODUCER_EVIDENCE_FILES) {
    files.add(path.join(evidenceRootDir, file));
  }
  return [...files];
}

/** Absolute paths to every evidence directory (e.g. screenshot corpora) `producers` owns. */
export function producerEvidenceDirectories(
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRootDir = evidenceRoot,
) {
  const dirs = new Set();
  for (const gate of producers) {
    for (const dir of gate.evidenceDirs ?? []) dirs.add(path.join(evidenceRootDir, dir));
  }
  return [...dirs];
}

/**
 * Deletes every evidence file/directory the producer manifest owns if
 * present. This is the "cold start" guarantee: a candidate cannot pass by
 * coincidentally finding these gitignored receipts already sitting in the
 * working tree from a prior run -- they are removed before the producers run
 * again, so their presence afterward proves this invocation regenerated
 * them.
 *
 * Only files the producer manifest explicitly owns are ever touched; every other
 * evidence artifact (including git-tracked catalogues owned by earlier
 * SVD/SWR tasks) is left completely untouched.
 */
export function resetReleaseEvidenceProducers({
  log,
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
} = {}) {
  const cleared = [];
  for (const filePath of producerEvidenceAbsolutePaths(producers, evidenceRootDir)) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      cleared.push(path.relative(repoRootDir, filePath));
    }
  }
  for (const dirPath of producerEvidenceDirectories(producers, evidenceRootDir)) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      cleared.push(`${path.relative(repoRootDir, dirPath)}/`);
    }
  }
  if (cleared.length > 0 && typeof log === 'function') log(cleared);
  return cleared;
}

/**
 * Deletes all release-readiness evidence that must be regenerated during a
 * clean-root release run: producer-owned evidence plus explicitly declared
 * downstream closeout receipts. This is broader than
 * `resetReleaseEvidenceProducers()` by design, but still path-owned by this
 * module and never a wildcard cleanup of the evidence root.
 */
export function resetReleaseReadinessEvidence({
  log,
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
} = {}) {
  const cleared = [];
  for (const filePath of releaseReadinessEvidenceAbsolutePaths(producers, evidenceRootDir)) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      cleared.push(path.relative(repoRootDir, filePath));
    }
  }
  for (const dirPath of producerEvidenceDirectories(producers, evidenceRootDir)) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      cleared.push(`${path.relative(repoRootDir, dirPath)}/`);
    }
  }
  if (cleared.length > 0 && typeof log === 'function') log(cleared);
  return cleared;
}

/**
 * Checks whether `producer`'s declared evidence files/directories actually
 * exist under `evidenceRootDir` (non-empty for directories). This is the
 * "no stale/copy fallback" guarantee: it is called *after* a producer's
 * command reports success, independently of that exit code, so a producer
 * cannot pass by leaving a previously-existing receipt untouched (it was
 * already deleted by `resetReleaseEvidenceProducers`) or by exiting 0
 * without actually writing what it claims to produce.
 */
export function verifyProducerEvidence(producer, evidenceRootDir = evidenceRoot, repoRootDir = repoRoot) {
  const missingFiles = (producer.evidenceFiles ?? [])
    .map((file) => path.join(evidenceRootDir, file))
    .filter((filePath) => !fs.existsSync(filePath));
  const missingDirs = (producer.evidenceDirs ?? [])
    .map((dir) => path.join(evidenceRootDir, dir))
    .filter((dirPath) => !fs.existsSync(dirPath) || fs.readdirSync(dirPath).length === 0);
  const invalidFiles = verifyProducerEvidenceContent(producer, evidenceRootDir, repoRootDir);
  return {
    ok: missingFiles.length === 0 && missingDirs.length === 0 && invalidFiles.length === 0,
    missingFiles: missingFiles.map((filePath) => path.relative(repoRootDir, filePath)),
    missingDirs: missingDirs.map((dirPath) => path.relative(repoRootDir, dirPath)),
    invalidFiles,
  };
}

function verifyProducerEvidenceContent(producer, evidenceRootDir, repoRootDir) {
  const invalidFiles = [];
  const verificationFiles = producer.evidenceVerification?.files ?? [];
  for (const verification of verificationFiles) {
    const absolutePath = path.join(evidenceRootDir, verification.file);
    const relativePath = path.relative(repoRootDir, absolutePath);
    if (!fs.existsSync(absolutePath)) continue;
    let data = null;
    if (verification.json) {
      try {
        data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
      } catch (error) {
        invalidFiles.push({
          file: relativePath,
          reason: `evidence is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
    }
    if (verification.generatedAt && !isConcreteTimestamp(data?.generated_at)) {
      invalidFiles.push({
        file: relativePath,
        reason: 'generated_at must be a concrete ISO timestamp',
      });
    }
    for (const check of verification.checks ?? []) {
      const value = readJsonPath(data, check.path);
      const reason = jsonCheckFailure(value, check);
      if (reason) {
        invalidFiles.push({
          file: relativePath,
          path: check.path,
          reason,
        });
      }
    }
  }
  return invalidFiles;
}

function readJsonPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, segment) => {
    if (current === null || current === undefined) return undefined;
    return current[segment];
  }, value);
}

function jsonCheckFailure(value, check) {
  if (check.present && (value === null || value === undefined)) {
    return 'required value is missing';
  }
  if (check.truthy && !value) {
    return 'required value is not truthy';
  }
  if (Number.isInteger(check.arrayMinLength) && (!Array.isArray(value) || value.length < check.arrayMinLength)) {
    return `expected array with at least ${check.arrayMinLength} item(s)`;
  }
  if (Number.isInteger(check.arrayMaxLength) && (!Array.isArray(value) || value.length > check.arrayMaxLength)) {
    return `expected array with at most ${check.arrayMaxLength} item(s)`;
  }
  if (Object.hasOwn(check, 'equals') && value !== check.equals) {
    return `expected ${JSON.stringify(check.equals)}; observed ${JSON.stringify(value)}`;
  }
  if (Array.isArray(check.oneOf) && !check.oneOf.includes(value)) {
    return `expected one of ${check.oneOf.map((entry) => JSON.stringify(entry)).join(', ')}; observed ${JSON.stringify(value)}`;
  }
  return null;
}

function isConcreteTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Runs a single producer gate: invokes `runProducer(producer)` (an
 * injectable command executor returning `{ ok, status, durationMs, tail }`,
 * the same shape `runNpmScript`/`runCommand` in `release-readiness-gate.mjs`
 * return) and then independently verifies the producer's declared evidence
 * now exists. Exported so both the real gate script and the hermetic
 * regression test exercise the exact same pass/fail semantics -- the test
 * cannot pass by re-implementing a looser check than production uses.
 */
export function runSingleProducerGate(
  producer,
  { runProducer, evidenceRoot: evidenceRootDir = evidenceRoot, repoRoot: repoRootDir = repoRoot } = {},
) {
  if (typeof runProducer !== 'function') {
    throw new Error('runSingleProducerGate requires a runProducer(producer) function');
  }
  const outcome = runProducer(producer);
  if (!outcome.ok) {
    return {
      ok: false,
      status: outcome.status ?? 1,
      durationMs: outcome.durationMs ?? 0,
      tail: outcome.tail ?? [],
      missingFiles: [],
      missingDirs: [],
    };
  }

  const verification = verifyProducerEvidence(producer, evidenceRootDir, repoRootDir);
  if (!verification.ok) {
    const detail = [
      ...verification.missingFiles.map((file) => `missing evidence file: ${file}`),
      ...verification.missingDirs.map((dir) => `missing or empty evidence directory: ${dir}`),
      ...verification.invalidFiles.map((entry) => (
        `invalid evidence content: ${entry.file}${entry.path ? ` (${entry.path})` : ''}: ${entry.reason}`
      )),
    ];
    return {
      ok: false,
      status: 1,
      durationMs: outcome.durationMs ?? 0,
      tail: [
        ...(outcome.tail ?? []),
        `${producer.id}: npm script "${producer.npmScript}" exited successfully but did not produce its declared evidence.`,
        'This is not permitted to fall back to a stale or previously-copied receipt.',
        ...detail,
      ],
      missingFiles: verification.missingFiles,
      missingDirs: verification.missingDirs,
      invalidFiles: verification.invalidFiles,
    };
  }

  return {
    ok: true,
    status: 0,
    durationMs: outcome.durationMs ?? 0,
    tail: [],
    missingFiles: [],
    missingDirs: [],
    invalidFiles: [],
  };
}

export function producerEvidenceFindings(producer, outcome) {
  const findings = [];
  for (const file of outcome.missingFiles ?? []) {
    findings.push({
      id: `${producer.id}-missing-evidence-file`,
      message: `${producer.label} did not produce required evidence`,
      file,
    });
  }
  for (const dir of outcome.missingDirs ?? []) {
    findings.push({
      id: `${producer.id}-missing-evidence-dir`,
      message: `${producer.label} did not produce required (non-empty) evidence directory`,
      file: dir,
    });
  }
  for (const invalid of outcome.invalidFiles ?? []) {
    findings.push({
      id: `${producer.id}-invalid-evidence-content`,
      message: `${producer.label} produced invalid evidence content: ${invalid.reason}`,
      file: invalid.file,
      detail: invalid.path ? `jsonPath=${invalid.path}` : undefined,
    });
  }
  return findings;
}

/**
 * Builds the production release gate entries for every default-enabled
 * producer in the authoritative manifest. Keeping this closure in the manifest
 * module prevents the release gate from growing a second dependency/order list:
 * it supplies only the command executor, while this function owns dependency
 * enforcement, evidence verification, and finding shape.
 *
 * @returns {ReleaseReadinessGateEntry[]}
 */
export function createReleaseEvidenceProducerGateEntries({
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
  runProducer,
} = {}) {
  if (typeof runProducer !== 'function') {
    throw new Error('createReleaseEvidenceProducerGateEntries requires a runProducer(producer) function');
  }

  const completedProducerIds = new Set();
  return producers.filter((producer) => producer.defaultEnabled).map((producer) => ({
    id: producer.id,
    label: producer.label,
    producer,
    run: () => {
      const unmetDependencies = (producer.dependsOn ?? []).filter((dependencyId) => !completedProducerIds.has(dependencyId));
      if (unmetDependencies.length > 0) {
        const tail = [
          `${producer.id} is blocked: unmet producer dependencies ${unmetDependencies.join(', ')}`,
          'Producer dependencies are declared in scripts/lib/release-readiness-evidence-producers.mjs and enforced by the release gate.',
        ];
        return {
          ok: false,
          status: 1,
          durationMs: 0,
          tail,
          missingFiles: [],
          missingDirs: [],
          invalidFiles: [],
          findings: unmetDependencies.map((dependencyId) => ({
            id: `${producer.id}-unmet-dependency`,
            message: `${producer.label} cannot run before producer dependency ${dependencyId}`,
            file: 'scripts/lib/release-readiness-evidence-producers.mjs',
            detail: `producer=${producer.id}; dependency=${dependencyId}`,
          })),
        };
      }

      const outcome = runSingleProducerGate(producer, {
        runProducer,
        evidenceRoot: evidenceRootDir,
        repoRoot: repoRootDir,
      });
      const findings = producerEvidenceFindings(producer, outcome);
      if (outcome.ok) completedProducerIds.add(producer.id);
      return { ...outcome, findings };
    },
  }));
}

/**
 * Runs every producer gate, in manifest order, starting from a cold-start
 * reset of the evidence root. Stops at the first failed or dependency-blocked
 * gate, mirroring the real gate script's fail-fast behavior. This is the
 * single function that proves "one invocation produces every required
 * receipt starting from an empty evidence root": both the real orchestration
 * (via individual per-producer gate entries built with `runSingleProducerGate`
 * in `release-readiness-gate.mjs`) and the SVD-131 hermetic regression test
 * (via this batch entry point, with an isolated `evidenceRoot`/`repoRoot` and
 * a stub `runProducer`) exercise identical reset -> run -> verify wiring.
 */
export function runReleaseEvidenceProducers({
  producers = RELEASE_EVIDENCE_PRODUCER_GATES,
  evidenceRoot: evidenceRootDir = evidenceRoot,
  repoRoot: repoRootDir = repoRoot,
  runProducer,
  log,
} = {}) {
  const cleared = resetReleaseEvidenceProducers({
    producers,
    evidenceRoot: evidenceRootDir,
    repoRoot: repoRootDir,
    log,
  });

  const completed = new Set();
  const results = [];
  for (const producer of producers) {
    const unmetDependencies = (producer.dependsOn ?? []).filter((dependencyId) => !completed.has(dependencyId));
    if (unmetDependencies.length > 0) {
      results.push({
        id: producer.id,
        label: producer.label,
        ok: false,
        status: 'blocked',
        durationMs: 0,
        tail: [`${producer.id} is blocked: unmet dependencies ${unmetDependencies.join(', ')}`],
        missingFiles: [],
        missingDirs: [],
        unmetDependencies,
      });
      break;
    }

    const outcome = runSingleProducerGate(producer, { runProducer, evidenceRoot: evidenceRootDir, repoRoot: repoRootDir });
    results.push({ id: producer.id, label: producer.label, unmetDependencies: [], ...outcome });
    if (!outcome.ok) break;
    completed.add(producer.id);
  }

  return {
    ok: results.length === producers.length && results.every((result) => result.ok),
    cleared,
    results,
  };
}
