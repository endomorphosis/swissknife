#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/explicit-function-return-type */

/**
 * SVD-102: build a name-level all-app/all-tool live-binding gap ledger.
 *
 * The ledger deliberately keeps declaration, discovery, binding, execution,
 * and evidence freshness as separate facts. In particular, a manifest family,
 * a descriptor, or a coverage count can never turn into an executed state.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

require('tsx/cjs');

const {
  VIRTUAL_DESKTOP_APP_MANIFEST,
} = require('../src/services/apps/virtual-desktop-app-manifest.ts');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'all-app-live-binding-gap-ledger.json');
const documentationPath = path.join(projectRoot, 'docs', 'all-app-live-binding-gap-ledger.md');
const peerEvidencePath = path.join(evidenceRoot, 'swissknife-all-tools-peer-evidence.json');
const appContractPath = path.join(evidenceRoot, 'app-backend-contract.json');
const bindingMatrixPath = path.join(evidenceRoot, 'all-tools-app-bindings.json');
const manifestPath = path.join(projectRoot, 'src', 'services', 'apps', 'virtual-desktop-app-manifest.ts');
const maxEvidenceAgeMs = positiveNumber(process.env.SVD_102_MAX_EVIDENCE_AGE_MS, 24 * 60 * 60 * 1000);

const owners = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];
const gapStates = ['stale', 'missing', 'static-only', 'denied', 'unsupported', 'unreachable'];
const terminalStates = [...gapStates, 'executed'];
const statePriority = ['missing', 'stale', 'unreachable', 'unsupported', 'static-only', 'denied', 'executed'];
const serviceConfigs = {
  ipfs_kit_py: {
    endpoint: process.env.IPFS_KIT_MCP_ENDPOINT || 'http://127.0.0.1:8014/mcp',
    descriptor: 'src/services/ipfs/mcp-ipfs-kit-tools-manifest.json',
    kind: 'json-manifest',
  },
  ipfs_datasets_py: {
    endpoint: process.env.IPFS_DATASETS_MCP_ENDPOINT || 'http://127.0.0.1:3002/mcp',
    descriptor: 'src/services/ipfs/mcp-ipfs-datasets-descriptor-pack.ts',
    kind: 'typescript-descriptor-pack',
  },
  ipfs_accelerate_py: {
    endpoint: process.env.IPFS_ACCELERATE_MCP_ENDPOINT || 'http://127.0.0.1:3003/mcp',
    descriptor: 'src/services/ipfs/mcp-ipfs-accelerate-descriptor-pack.ts',
    kind: 'typescript-descriptor-pack',
  },
};

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}

async function main() {
  const now = new Date();
  const generatedAt = now.toISOString();
  const descriptorCatalog = readDescriptorCatalog();
  const directDiscovery = await discoverLiveTools(generatedAt);
  const peerInput = readEvidence(peerEvidencePath, [
    path.join(projectRoot, 'scripts', 'capture-swissknife-all-tools-peer-evidence.cjs'),
    ...owners.map(owner => path.join(projectRoot, serviceConfigs[owner].descriptor)),
  ], now);
  const contractInput = readEvidence(appContractPath, [manifestPath], now);
  const bindingInput = readEvidence(bindingMatrixPath, [
    manifestPath,
    path.join(projectRoot, 'src', 'services', 'apps', 'all-tools-app-binding-matrix.ts'),
  ], now);

  const bindingRows = explicitRows(bindingInput.data);
  const peerTools = normalizePeerTools(peerInput.data);
  const tools = buildToolLedger({
    descriptorCatalog,
    directDiscovery,
    peerTools,
    peerInput,
    bindingInput,
    bindingRows,
  });
  const assignments = buildAssignmentLedger({
    contractInput,
    bindingInput,
    bindingRows,
    tools,
  });
  const applications = buildApplicationLedger(assignments, contractInput);
  const gaps = buildGaps(applications, assignments, tools, peerInput, bindingInput);
  const validation = validateLedger(applications, assignments, tools, descriptorCatalog, directDiscovery);

  const ledger = {
    schema: 'swissknife.all-app-live-binding-gap-ledger.v1',
    task_id: 'SVD-102',
    generated_at: generatedAt,
    decision: gaps.length === 0 && validation.valid ? 'go' : 'no_go',
    scope: {
      manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
      manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
      backend_owners: owners,
      canonical_app_source: rel(manifestPath),
      canonical_app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      declared_assignment_definition: 'One row for every canonical manifest backend_capability owned by one of the three Python services.',
      tool_candidate_definition: 'Exact-name union of local descriptors, direct HTTP discovery, and SVD-100 HTTP/libp2p/remote-descriptor observations.',
    },
    evidence_policy: {
      maximum_age_ms: maxEvidenceAgeMs,
      freshness_rule: 'Evidence is fresh only when it has a valid generated_at, is within maximum_age_ms, and is not future-dated. Local source hashes and mtimes are recorded as provenance; checkout mtimes are not treated as proof of semantic staleness.',
      success_rule: 'executed requires an exact tool name with an explicit successful invocation observation. Manifest declarations, descriptor presence, binding rows, and counts are never execution evidence.',
      count_only_inference_forbidden: true,
      declaration_is_not_binding: true,
      descriptor_is_not_live_discovery: true,
      binding_is_not_execution: true,
      states: {
        stale: 'The supporting artifact is too old, future-dated, or predates one of its source files.',
        missing: 'Required name-level binding or execution evidence is absent or unreadable.',
        'static-only': 'The exact tool exists in a local descriptor but has no current live name-level discovery observation.',
        denied: 'The exact discovered tool was not invoked because policy or the approved fixture allowlist denied the attempt.',
        unsupported: 'The owner was reachable but did not advertise/describe the exact tool, or an attempted invocation did not satisfy its contract.',
        unreachable: 'A selected owner/transport could not be reached; no fallback is credited.',
        executed: 'The exact discovered and descriptor-backed tool has an explicit successful invocation observation.',
      },
    },
    provenance: {
      generator: rel(__filename),
      canonical_manifest: fileProvenance(manifestPath),
      peer_evidence: inputProvenance(peerInput),
      app_contract: inputProvenance(contractInput),
      binding_matrix: inputProvenance(bindingInput),
      descriptors: Object.fromEntries(owners.map(owner => [owner, fileProvenance(path.join(projectRoot, serviceConfigs[owner].descriptor))])),
      direct_discovery: Object.fromEntries(owners.map(owner => [owner, directDiscovery[owner].provenance])),
    },
    backend_owners: owners.map(owner => ({
      owner,
      direct_discovery_state: directDiscovery[owner].state,
      direct_discovery_error: directDiscovery[owner].error,
      direct_discovered_tool_names: directDiscovery[owner].tools.map(tool => tool.name),
      descriptor_discovered_tool_names: descriptorCatalog[owner].map(tool => tool.name),
      peer_evidence_freshness: peerInput.freshness,
      counts_are_indexes_only: true,
    })),
    summary: summarize(applications, assignments, tools, gaps, peerInput, bindingInput),
    validation,
    applications,
    application_backend_assignments: assignments,
    tools,
    gaps,
  };

  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.mkdirSync(path.dirname(documentationPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fs.writeFileSync(documentationPath, renderMarkdown(ledger), 'utf8');

  console.log(JSON.stringify({
    decision: ledger.decision,
    canonical_apps: applications.length,
    declared_app_backend_assignments: assignments.length,
    exact_tool_records: tools.length,
    state_counts: ledger.summary.state_counts,
    gap_count: gaps.length,
    validation: validation.valid ? 'valid' : 'invalid',
    outputs: [rel(outputPath), rel(documentationPath)],
  }, null, 2));

  if (!validation.valid) process.exitCode = 1;
  return ledger;
}

function readDescriptorCatalog() {
  const result = {};
  for (const owner of owners) {
    const config = serviceConfigs[owner];
    const filePath = path.join(projectRoot, config.descriptor);
    const source = fs.readFileSync(filePath, 'utf8');
    let records;
    if (config.kind === 'json-manifest') {
      const manifest = JSON.parse(source);
      records = (manifest.tools ?? []).map(tool => ({
        name: tool.name,
        description: tool.description ?? null,
        input_schema: tool.inputSchema ?? null,
        descriptor_location: `${config.descriptor}#tools[name=${tool.name}]`,
      }));
    } else {
      records = Array.from(source.matchAll(/tool_function:\s*(['"])([^'"]+)\1/g), match => ({
        name: match[2],
        description: null,
        input_schema: null,
        descriptor_location: `${config.descriptor}:${lineNumber(source, match.index)}`,
      }));
    }
    result[owner] = dedupeByName(records).sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}

async function discoverLiveTools(observedAt) {
  const entries = await Promise.all(owners.map(async owner => [owner, await discoverOwner(owner, observedAt)]));
  return Object.fromEntries(entries);
}

async function discoverOwner(owner, observedAt) {
  const endpoint = serviceConfigs[owner].endpoint;
  const started = Date.now();
  try {
    const discovery = await requestToolList(endpoint);
    const payload = discovery.payload;
    const method = discovery.method;
    const tools = dedupeByName((toolArray(payload) ?? []).map(tool => ({
      name: tool.name,
      description: tool.description ?? null,
      input_schema: tool.inputSchema ?? tool.input_schema ?? null,
      descriptor_present: Boolean(tool.inputSchema ?? tool.input_schema),
    }))).sort((a, b) => a.name.localeCompare(b.name));
    return {
      owner,
      state: 'reachable',
      observed_at: observedAt,
      tools,
      error: null,
      provenance: {
        kind: 'direct-name-level-http-discovery',
        endpoint,
        method,
        observed_at: observedAt,
        duration_ms: Date.now() - started,
        tool_names: tools.map(tool => tool.name),
        count_is_index_only: true,
      },
    };
  } catch (error) {
    return {
      owner,
      state: 'unreachable',
      observed_at: observedAt,
      tools: [],
      error: errorMessage(error),
      provenance: {
        kind: 'direct-name-level-http-discovery',
        endpoint,
        method: 'GET /mcp/tools/list then POST tools/list',
        observed_at: observedAt,
        duration_ms: Date.now() - started,
        error: errorMessage(error),
        count_is_index_only: true,
      },
    };
  }
}

async function requestToolList(endpoint) {
  const errors = [];
  try {
    const response = await fetch(endpoint.replace(/\/$/, '') + '/tools/list', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const payload = await response.json();
      if (toolArray(payload)) return { payload, method: 'GET /mcp/tools/list' };
      errors.push('GET response did not contain a tools array');
    } else {
      errors.push(`GET returned HTTP ${response.status}`);
    }
  } catch (error) {
    errors.push(`GET failed: ${errorMessage(error)}`);
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'svd-102-tools-list', method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!toolArray(payload)) throw new Error('response did not contain a tools array');
    return { payload, method: 'POST tools/list' };
  } catch (error) {
    errors.push(`POST failed: ${errorMessage(error)}`);
  }
  throw new Error(errors.join('; '));
}

function buildToolLedger({ descriptorCatalog, directDiscovery, peerTools, peerInput, bindingInput, bindingRows }) {
  const records = new Map();
  const get = (owner, name) => {
    const key = `${owner}:${name}`;
    if (!records.has(key)) records.set(key, { owner, name, local: null, direct: null, peer: null });
    return records.get(key);
  };
  for (const owner of owners) {
    for (const tool of descriptorCatalog[owner]) get(owner, tool.name).local = tool;
    for (const tool of directDiscovery[owner].tools) get(owner, tool.name).direct = tool;
  }
  for (const tool of peerTools) get(tool.service, tool.name).peer = tool;

  return [...records.values()]
    .sort((a, b) => `${a.owner}:${a.name}`.localeCompare(`${b.owner}:${b.name}`))
    .map(candidate => {
      const rows = bindingRows.filter(row => rowOwner(row) === candidate.owner && rowName(row) === candidate.name);
      const observedState = normalizeState(candidate.peer?.disposition);
      const directState = candidate.direct ? 'live-discovered' : directDiscovery[candidate.owner].state;
      const stale = Boolean(candidate.peer) && peerInput.freshness.state !== 'fresh';
      let currentState;
      if (observedState && !stale) currentState = observedState;
      else if (candidate.direct) currentState = 'missing';
      else if (directDiscovery[candidate.owner].state === 'unreachable') currentState = 'unreachable';
      else currentState = 'static-only';

      const states = stateFlags({
        stale,
        missing: currentState === 'missing' || bindingInput.freshness.state === 'missing',
        'static-only': Boolean(candidate.local) && !candidate.direct && !peerWasDiscovered(candidate.peer),
        denied: observedState === 'denied',
        unsupported: observedState === 'unsupported',
        unreachable: currentState === 'unreachable' || observedState === 'unreachable',
        executed: observedState === 'executed' && !stale,
      });
      return {
        tool_id: `${candidate.owner}:${candidate.name}`,
        owner: candidate.owner,
        name: candidate.name,
        current_state: currentState,
        release_state: stale ? 'stale' : currentState,
        observed_execution_state: observedState ?? 'missing',
        discovery_state: directState,
        states,
        local_descriptor: candidate.local ? {
          present: true,
          location: candidate.local.descriptor_location,
          description: candidate.local.description,
          input_schema_present: Boolean(candidate.local.input_schema),
          input_schema_sha256: candidate.local.input_schema ? sha256(stableJson(candidate.local.input_schema)) : null,
        } : { present: false },
        live_discovery: {
          directly_discovered: Boolean(candidate.direct),
          direct_descriptor_present: candidate.direct?.descriptor_present ?? false,
          direct_description: candidate.direct?.description ?? null,
          direct_input_schema_sha256: candidate.direct?.input_schema ? sha256(stableJson(candidate.direct.input_schema)) : null,
          peer_http: candidate.peer?.observations?.http ?? null,
          peer_libp2p: candidate.peer?.observations?.libp2p ?? null,
          peer_service_provenance: candidate.peer?.peer_service_provenance ?? null,
        },
        binding: {
          explicit_row_count: rows.length,
          rows: rows.map(bindingRowProvenance),
          state: rows.length > 0 ? 'materialized-unproven' : 'missing',
          count_only_inference_used: false,
        },
        current_binding_state: rows.length > 0 ? 'materialized-unproven' : 'missing',
        evidence_freshness: {
          direct_discovery: {
            state: candidate.direct ? 'fresh' : directDiscovery[candidate.owner].state,
            observed_at: directDiscovery[candidate.owner].observed_at,
          },
          peer: peerInput.freshness,
          binding: bindingInput.freshness,
        },
        provenance: compact([
          candidate.local && { kind: 'local-descriptor', ref: candidate.local.descriptor_location },
          candidate.direct && { kind: 'direct-http-discovery', ref: serviceConfigs[candidate.owner].endpoint, observed_at: directDiscovery[candidate.owner].observed_at },
          candidate.peer && { kind: 'svd-100-peer-evidence', ref: rel(peerEvidencePath), disposition: candidate.peer.disposition },
          ...rows.map(row => ({ kind: 'explicit-binding-row', ref: rel(bindingMatrixPath), app_id: row.app_id, tool_id: row.tool_id ?? null })),
        ]),
        availability_inferred_from_count: false,
        success_inferred_from_declaration: false,
      };
    });
}

function buildAssignmentLedger({ contractInput, bindingInput, bindingRows, tools }) {
  const contractApps = new Map((contractInput.data?.apps ?? []).map(app => [app.app_id ?? app.canonical_id, app]));
  return VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => app.backend_capabilities
    .filter(capability => owners.includes(capability.service))
    .map(capability => {
      const rows = bindingRows.filter(row => row.app_id === app.id && rowOwner(row) === capability.service);
      const contractService = contractApps.get(app.id)?.assigned_backend_capabilities?.[capability.service] ?? null;
      const boundTools = rows.map(row => tools.find(tool => tool.owner === capability.service && (
        tool.name === rowName(row) || tool.tool_id === row.tool_id
      ))).filter(Boolean);
      let currentState = 'missing';
      if (rows.length > 0 && boundTools.length > 0) {
        currentState = selectState(boundTools.map(tool => tool.release_state));
      } else if (rows.length > 0) {
        currentState = 'unsupported';
      }
      const stale = contractInput.freshness.state === 'stale' || bindingInput.freshness.state === 'stale';
      const states = stateFlags({
        stale,
        missing: rows.length === 0 || bindingInput.freshness.state === 'missing',
        'static-only': boundTools.length > 0 && boundTools.every(tool => tool.states['static-only']),
        denied: boundTools.some(tool => tool.states.denied),
        unsupported: currentState === 'unsupported' || boundTools.some(tool => tool.states.unsupported),
        unreachable: boundTools.some(tool => tool.states.unreachable),
        executed: currentState === 'executed' && !stale,
      });
      const reasons = [];
      if (rows.length === 0) reasons.push('No explicit app/tool binding row exists; the manifest assignment is declaration only.');
      if (contractService?.coverage_status === 'declared_no_tool_binding') reasons.push('The app backend contract explicitly reports declared_no_tool_binding.');
      if (stale) reasons.push('At least one binding projection artifact is stale.');
      if (currentState === 'executed') reasons.push('An exact bound tool has fresh explicit execution evidence.');
      return {
        assignment_id: `${app.id}:${capability.service}:${capability.id}`,
        app_id: app.id,
        app_title: app.title,
        backend_owner: capability.service,
        capability_id: capability.id,
        capability: capability.capability,
        transport_policy: {
          mcp: capability.mcp_transport,
          mcp_plus_plus: capability.mcp_plus_plus_transport,
        },
        policy_class: capability.policy_class,
        receipt_strategy: capability.receipt_strategy,
        current_binding_state: currentState,
        release_state: stale && currentState !== 'missing' ? 'stale' : currentState,
        states,
        explicit_binding_rows: rows.map(bindingRowProvenance),
        exact_bound_tool_ids: boundTools.map(tool => tool.tool_id),
        contract_observation: contractService ? {
          coverage_status: contractService.coverage_status ?? null,
          explicit_tool_ids: Array.isArray(contractService.tool_ids) ? contractService.tool_ids : [],
          tool_count_is_evidence: false,
        } : null,
        evidence_freshness: {
          app_contract: contractInput.freshness,
          binding_matrix: bindingInput.freshness,
        },
        reasons,
        provenance: [
          { kind: 'canonical-manifest-backend-capability', ref: `${rel(manifestPath)}#${capability.id}` },
          ...(contractService ? [{ kind: 'app-contract-observation', ref: `${rel(appContractPath)}#apps/${app.id}/${capability.service}` }] : []),
          ...rows.map(row => ({ kind: 'explicit-binding-row', ref: rel(bindingMatrixPath), tool_id: row.tool_id ?? null })),
        ],
        success_inferred_from_manifest: false,
        success_inferred_from_count: false,
      };
    }));
}

function buildApplicationLedger(assignments, contractInput) {
  return VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => {
    const appAssignments = assignments.filter(row => row.app_id === app.id);
    const currentState = appAssignments.length === 0
      ? 'not-applicable'
      : selectState(appAssignments.map(row => row.release_state));
    return {
      app_id: app.id,
      canonical_id: app.canonical_id,
      title: app.title,
      aliases: app.aliases,
      category: app.category,
      owner_module: app.owner_module,
      launch_kind: app.launch_kind,
      component: app.component ?? null,
      declared_service_families: app.service_families,
      declared_backend_owners: unique(appAssignments.map(row => row.backend_owner)),
      declared_assignment_ids: appAssignments.map(row => row.assignment_id),
      declared_assignment_count: appAssignments.length,
      current_binding_state: currentState,
      states: stateFlags(Object.fromEntries(terminalStates.map(state => [state, appAssignments.some(row => row.states[state])]))),
      local_only: appAssignments.length === 0,
      local_only_rationale: appAssignments.length === 0 ? app.local_only_rationale ?? null : null,
      evidence_freshness: { app_contract: contractInput.freshness },
      provenance: [{ kind: 'canonical-manifest-app', ref: `${rel(manifestPath)}#${app.id}` }],
      success_inferred_from_manifest: false,
    };
  });
}

function buildGaps(applications, assignments, tools, peerInput, bindingInput) {
  const gaps = [];
  if (peerInput.freshness.state !== 'fresh') gaps.push({
    gap_id: `evidence:svd-100:${peerInput.freshness.state}`,
    kind: 'evidence', state: peerInput.freshness.state, owner: 'SVD-100',
    reason: peerInput.freshness.reason,
  });
  if (bindingInput.freshness.state !== 'fresh') gaps.push({
    gap_id: `evidence:binding-matrix:${bindingInput.freshness.state}`,
    kind: 'evidence', state: bindingInput.freshness.state, owner: 'SVD-104',
    reason: bindingInput.freshness.reason,
  });
  for (const row of assignments) {
    for (const state of gapStates.filter(state => row.states[state])) gaps.push({
      gap_id: `assignment:${row.assignment_id}:${state}`,
      kind: 'application-backend-assignment', state, app_id: row.app_id,
      backend_owner: row.backend_owner, capability_id: row.capability_id,
      reason: row.reasons.join(' ') || `Assignment is ${state}.`,
    });
  }
  for (const tool of tools) {
    for (const state of gapStates.filter(state => tool.states[state])) gaps.push({
      gap_id: `tool:${tool.tool_id}:${state}`,
      kind: 'tool', state, backend_owner: tool.owner, tool_id: tool.tool_id,
      reason: toolGapReason(tool, state),
    });
  }
  for (const app of applications.filter(item => item.current_binding_state === 'not-applicable' && !item.local_only_rationale)) gaps.push({
    gap_id: `app:${app.app_id}:missing-local-rationale`, kind: 'application', state: 'missing', app_id: app.app_id,
    reason: 'App has no declared Python backend assignment and no explicit local-only rationale.',
  });
  return gaps.sort((a, b) => a.gap_id.localeCompare(b.gap_id));
}

function summarize(applications, assignments, tools, gaps, peerInput, bindingInput) {
  return {
    canonical_application_count: applications.length,
    declared_application_backend_assignment_count: assignments.length,
    exact_tool_record_count: tools.length,
    descriptor_discovered_tool_count: tools.filter(tool => tool.local_descriptor.present
      || tool.live_discovery.direct_descriptor_present
      || tool.live_discovery.peer_http?.descriptor_method
      || tool.live_discovery.peer_libp2p?.descriptor_method).length,
    local_descriptor_tool_count: tools.filter(tool => tool.local_descriptor.present).length,
    remote_or_live_descriptor_tool_count: tools.filter(tool => tool.live_discovery.direct_descriptor_present
      || tool.live_discovery.peer_http?.descriptor_method
      || tool.live_discovery.peer_libp2p?.descriptor_method).length,
    directly_live_discovered_tool_count: tools.filter(tool => tool.live_discovery.directly_discovered).length,
    peer_observed_tool_count: tools.filter(tool => tool.provenance.some(item => item.kind === 'svd-100-peer-evidence')).length,
    explicitly_bound_tool_count: tools.filter(tool => tool.binding.explicit_row_count > 0).length,
    executed_tool_count: tools.filter(tool => tool.states.executed).length,
    assignment_state_counts: countStates(assignments),
    tool_state_counts: countStates(tools),
    state_counts: Object.fromEntries(terminalStates.map(state => [state,
      assignments.filter(row => row.states[state]).length + tools.filter(tool => tool.states[state]).length,
    ])),
    owner_tool_counts: countBy(tools, tool => tool.owner),
    owner_assignment_counts: countBy(assignments, row => row.backend_owner),
    gap_count: gaps.length,
    gap_counts: countBy(gaps, gap => gap.state),
    peer_evidence_freshness: peerInput.freshness.state,
    binding_evidence_freshness: bindingInput.freshness.state,
    counts_are_indexes_only: true,
  };
}

function validateLedger(applications, assignments, tools, descriptorCatalog, directDiscovery) {
  const errors = [];
  const expectedApps = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
  const actualApps = applications.map(app => app.app_id).sort();
  if (stableJson(expectedApps) !== stableJson(actualApps)) errors.push('Application rows do not exactly match the canonical manifest IDs.');
  const expectedAssignments = VIRTUAL_DESKTOP_APP_MANIFEST.apps.reduce((sum, app) => sum
    + app.backend_capabilities.filter(capability => owners.includes(capability.service)).length, 0);
  if (assignments.length !== expectedAssignments) errors.push(`Expected ${expectedAssignments} declared assignments; found ${assignments.length}.`);
  for (const owner of owners) {
    const manifestOwner = VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => app.backend_capabilities
      .filter(capability => capability.service === owner)
      .map(capability => `${app.id}:${capability.id}`));
    const familyOwner = VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => app.service_families.includes(owner) ? [app.id] : []);
    const capabilityApps = new Set(manifestOwner.map(value => value.split(':')[0]));
    for (const appId of familyOwner) if (!capabilityApps.has(appId)) errors.push(`Manifest app ${appId} declares ${owner} without a backend_capability assignment.`);
    const expectedNames = unique([
      ...descriptorCatalog[owner].map(tool => tool.name),
      ...directDiscovery[owner].tools.map(tool => tool.name),
    ]);
    const actualNames = tools.filter(tool => tool.owner === owner).map(tool => tool.name);
    for (const name of expectedNames) if (!actualNames.includes(name)) errors.push(`Missing exact tool row ${owner}:${name}.`);
  }
  if (new Set(tools.map(tool => tool.tool_id)).size !== tools.length) errors.push('Duplicate exact tool IDs are present.');
  if (assignments.some(row => row.states.executed && row.exact_bound_tool_ids.length === 0)) errors.push('An assignment was marked executed without an exact bound tool.');
  if (tools.some(tool => tool.states.executed && tool.observed_execution_state !== 'executed')) errors.push('A tool was marked executed without explicit execution evidence.');
  return { valid: errors.length === 0, errors };
}

function renderMarkdown(ledger) {
  const lines = [
    '# All-App Live-Binding Gap Ledger',
    '',
    `Generated by \`${ledger.provenance.generator}\` for SVD-102 at \`${ledger.generated_at}\`.`,
    '',
    `Release decision: **${ledger.decision.toUpperCase()}**. This is an inventory decision, not a declaration that coverage counts are executable proof.`,
    '',
    '## Evidence policy',
    '',
    ledger.evidence_policy.success_rule,
    '',
    `Freshness window: ${ledger.evidence_policy.maximum_age_ms} ms. Peer evidence is **${ledger.summary.peer_evidence_freshness}**; binding evidence is **${ledger.summary.binding_evidence_freshness}**.`,
    '',
    '## Summary',
    '',
    '| Inventory | Count |',
    '| --- | ---: |',
    `| Canonical applications | ${ledger.summary.canonical_application_count} |`,
    `| Declared app/backend assignments | ${ledger.summary.declared_application_backend_assignment_count} |`,
    `| Exact tool records | ${ledger.summary.exact_tool_record_count} |`,
    `| Descriptor-discovered tools | ${ledger.summary.descriptor_discovered_tool_count} |`,
    `| Local descriptor tools | ${ledger.summary.local_descriptor_tool_count} |`,
    `| Remote/live descriptor tools | ${ledger.summary.remote_or_live_descriptor_tool_count} |`,
    `| Directly live-discovered tools | ${ledger.summary.directly_live_discovered_tool_count} |`,
    `| Explicitly bound tools | ${ledger.summary.explicitly_bound_tool_count} |`,
    `| Explicitly executed tools | ${ledger.summary.executed_tool_count} |`,
    `| Named gaps | ${ledger.summary.gap_count} |`,
    '',
    'State counts overlap intentionally: a descriptor-only tool can also be unreachable, and a missing binding can also have stale projection evidence.',
    '',
    '| State | App/backend assignments | Tools | Combined |',
    '| --- | ---: | ---: | ---: |',
    ...terminalStates.map(state => `| ${state} | ${ledger.summary.assignment_state_counts[state]} | ${ledger.summary.tool_state_counts[state]} | ${ledger.summary.state_counts[state]} |`),
    '',
    '## Canonical applications',
    '',
    '| App | Declared backend owners | Assignments | Current state |',
    '| --- | --- | ---: | --- |',
    ...ledger.applications.map(app => `| ${escapeCell(app.app_id)} | ${escapeCell(app.declared_backend_owners.join(', ') || 'none')} | ${app.declared_assignment_count} | ${escapeCell(app.current_binding_state)} |`),
    '',
    '## Declared application/backend assignments',
    '',
    '| Application | Backend owner | Capability | Binding state | Freshness/gap flags |',
    '| --- | --- | --- | --- | --- |',
    ...ledger.application_backend_assignments.map(row => `| ${escapeCell(row.app_id)} | ${escapeCell(row.backend_owner)} | ${escapeCell(row.capability)} | ${escapeCell(row.current_binding_state)} | ${escapeCell(activeStates(row.states).join(', ') || 'none')} |`),
    '',
    '## Exact-name tool inventory',
    '',
    '| Owner | Tool | Discovery | Current state | Binding | Flags |',
    '| --- | --- | --- | --- | --- | --- |',
    ...ledger.tools.map(tool => `| ${escapeCell(tool.owner)} | ${escapeCell(tool.name)} | ${escapeCell(tool.discovery_state)} | ${escapeCell(tool.release_state)} | ${escapeCell(tool.binding.state)} | ${escapeCell(activeStates(tool.states).join(', ') || 'none')} |`),
    '',
    '## Named gap roll-up',
    '',
    '| State | Count |',
    '| --- | ---: |',
    ...gapStates.map(state => `| ${state} | ${ledger.summary.gap_counts[state] ?? 0} |`),
    '',
    'The JSON artifact contains the complete per-row provenance, transport observations, freshness reasons, and named gap records. Refresh SVD-100 evidence with `node scripts/capture-swissknife-all-tools-peer-evidence.cjs`, then rebuild this ledger; the builder also performs a bounded read-only HTTP `tools/list` discovery so newly advertised exact names cannot disappear behind an old catalog count.',
    '',
  ];
  return lines.join('\n');
}

function readEvidence(filePath, sourcePaths, now) {
  let data = null;
  let error = null;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (readError) {
    error = fs.existsSync(filePath) ? `Invalid JSON: ${errorMessage(readError)}` : 'Evidence artifact does not exist.';
  }
  return { filePath, data, freshness: assessFreshness(filePath, data, sourcePaths, now, error) };
}

function assessFreshness(filePath, data, sourcePaths, now, readError) {
  if (readError) return { state: 'missing', generated_at: null, age_ms: null, reason: readError };
  const timestamp = Date.parse(data?.generated_at ?? '');
  if (!Number.isFinite(timestamp)) return { state: 'stale', generated_at: data?.generated_at ?? null, age_ms: null, reason: 'Evidence has no valid generated_at timestamp.' };
  const age = now.getTime() - timestamp;
  const existingSources = sourcePaths.filter(fs.existsSync);
  const newestSource = Math.max(...existingSources.map(source => fs.statSync(source).mtimeMs), 0);
  const sourceFingerprint = sha256(existingSources.sort().map(source => `${rel(source)}:${sha256(fs.readFileSync(source))}`).join('\n'));
  const reasons = [];
  if (age < -60_000) reasons.push('Evidence timestamp is in the future.');
  if (age > maxEvidenceAgeMs) reasons.push(`Evidence age ${age} ms exceeds ${maxEvidenceAgeMs} ms.`);
  return {
    state: reasons.length > 0 ? 'stale' : 'fresh',
    generated_at: new Date(timestamp).toISOString(),
    age_ms: age,
    newest_source_mtime: newestSource ? new Date(newestSource).toISOString() : null,
    current_source_fingerprint: sourceFingerprint,
    source_fingerprint_comparison: 'not-available-in-input-artifact',
    reason: reasons.join(' ') || 'Evidence is within the freshness window and is not future-dated.',
  };
}

function normalizePeerTools(data) {
  if (!Array.isArray(data?.tools)) return [];
  const serviceByOwner = new Map((data.services ?? []).map(service => [service.service, service]));
  return data.tools
    .filter(tool => owners.includes(tool.service) && typeof tool.name === 'string')
    .map(tool => {
      const service = serviceByOwner.get(tool.service);
      return {
        ...tool,
        peer_service_provenance: service ? {
          http_endpoint: service.transports?.http?.endpoint ?? service.http?.endpoint ?? null,
          libp2p_endpoint: service.transports?.libp2p?.endpoint ?? service.libp2p?.endpoint ?? null,
          http_descriptor_cids: service.transports?.http?.descriptor?.retrieved_cids ?? service.http?.descriptor?.retrieved_cids ?? [],
          libp2p_descriptor_cids: service.transports?.libp2p?.descriptor?.retrieved_cids ?? service.libp2p?.descriptor?.retrieved_cids ?? [],
          http_remote_did: service.transports?.http?.identity?.remote_did ?? service.http?.identity?.remote_did ?? null,
          libp2p_remote_did: service.transports?.libp2p?.identity?.remote_did ?? service.libp2p?.identity?.remote_did ?? null,
        } : null,
      };
    });
}

function explicitRows(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.bindings) ? data.bindings : [];
  return rows.filter(row => row && typeof row === 'object' && typeof row.app_id === 'string' && rowOwner(row));
}

function inputProvenance(input) {
  return { ...fileProvenance(input.filePath), freshness: input.freshness };
}

function fileProvenance(filePath) {
  if (!fs.existsSync(filePath)) return { path: rel(filePath), present: false, sha256: null, mtime: null };
  const stat = fs.statSync(filePath);
  return { path: rel(filePath), present: true, sha256: sha256(fs.readFileSync(filePath)), mtime: stat.mtime.toISOString() };
}

function toolArray(payload) {
  const value = payload?.tools ?? payload?.result?.tools ?? payload?.data?.tools;
  return Array.isArray(value) ? value : null;
}

function peerWasDiscovered(peer) {
  return Boolean(peer?.observations?.http?.discovered || peer?.observations?.libp2p?.discovered);
}

function bindingRowProvenance(row) {
  return {
    app_id: row.app_id,
    service_id: rowOwner(row),
    tool_id: row.tool_id ?? null,
    name: rowName(row),
    disposition: row.disposition ?? null,
    app_visible: row.app_visible === true,
  };
}

function rowOwner(row) {
  const owner = row?.service_id ?? row?.service;
  return owners.includes(owner) ? owner : null;
}

function rowName(row) {
  return row?.name ?? row?.mcp_tool_name ?? (typeof row?.tool_id === 'string' ? row.tool_id.split(':').at(-1) : null);
}

function normalizeState(value) {
  return terminalStates.includes(value) ? value : null;
}

function selectState(states) {
  for (const state of statePriority) if (states.includes(state)) return state;
  return states[0] ?? 'missing';
}

function stateFlags(values) {
  return Object.fromEntries(terminalStates.map(state => [state, Boolean(values[state])]));
}

function activeStates(states) {
  return terminalStates.filter(state => states[state]);
}

function countStates(rows) {
  return Object.fromEntries(terminalStates.map(state => [state, rows.filter(row => row.states[state]).length]));
}

function toolGapReason(tool, state) {
  if (state === 'missing') return 'No fresh exact-name execution and/or binding row proves this discovered tool is executable from an application.';
  if (state === 'static-only') return 'The exact name is present only in a local descriptor, not a current live discovery.';
  if (state === 'unreachable') return `The ${tool.owner} direct discovery or recorded transport was unreachable.`;
  if (state === 'stale') return 'The exact-name peer observation is stale.';
  if (state === 'denied') return 'The recorded exact-name invocation was denied or intentionally withheld by policy.';
  return 'The reachable backend did not support the exact advertised/descriptor/invocation contract.';
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function dedupeByName(records) {
  const byName = new Map();
  for (const record of records) if (record && typeof record.name === 'string' && record.name) byName.set(record.name, record);
  return [...byName.values()];
}

function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined))].sort();
}

function compact(values) {
  return values.filter(Boolean);
}

function lineNumber(source, offset) {
  return source.slice(0, offset ?? 0).split('\n').length;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function rel(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function errorMessage(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : error.cause ? String(error.cause) : '';
  return cause ? `${error.message}: ${cause}` : error.message;
}

module.exports = {
  main,
  assessFreshness,
  validateLedger,
  readDescriptorCatalog,
};
