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
const clockSkewToleranceMs = positiveNumber(process.env.SVD_102_CLOCK_SKEW_TOLERANCE_MS, 60 * 1000);

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
  ], now, {
    schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
    validate: data => Array.isArray(data?.services) && Array.isArray(data?.tools),
    shape: 'services[] and tools[]',
  });
  const contractInput = readEvidence(appContractPath, [manifestPath], now, {
    schema: 'swissknife.virtual-desktop-app-backend-contract.v1',
    validate: data => Array.isArray(data?.apps),
    shape: 'apps[]',
  });
  const bindingInput = readEvidence(bindingMatrixPath, [
    manifestPath,
    path.join(projectRoot, 'src', 'services', 'apps', 'all-tools-app-binding-matrix.ts'),
  ], now, {
    schema: 'swissknife.all_tools_app_bindings.v2',
    validate: data => Array.isArray(data?.rows) || Array.isArray(data?.bindings),
    shape: 'rows[] or bindings[]',
  });

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
  const gaps = buildGaps(applications, assignments, tools, peerInput, contractInput, bindingInput);
  const validation = validateLedger(applications, assignments, tools, descriptorCatalog, directDiscovery, peerTools);

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
      clock_skew_tolerance_ms: clockSkewToleranceMs,
      freshness_rule: 'Evidence is fresh only when it is readable, has its expected schema and name-level shape, has a valid generated_at within maximum_age_ms, and is not future-dated beyond clock_skew_tolerance_ms. Current source hashes are recorded; source alignment is verified only when an input publishes comparable source hashes, and checkout mtimes alone never prove semantic staleness.',
      success_rule: 'A tool is executed only with an exact-name successful invocation observation. An application/backend assignment additionally requires an application-originated invocation observation; SVD-100 connector execution does not prove the app route. Manifest declarations, descriptor presence, static binding rows, fixtures, and counts are never execution evidence.',
      application_binding_execution_input: 'none; the current inputs contain static app-route declarations but no application-originated invocation observations',
      count_only_inference_forbidden: true,
      declaration_is_not_binding: true,
      descriptor_is_not_live_discovery: true,
      binding_is_not_execution: true,
      states: {
        stale: 'The supporting artifact is too old, future-dated beyond allowed skew, or publishes a source fingerprint that differs from the current source snapshot.',
        missing: 'Required name-level binding or execution evidence is absent or unreadable.',
        'static-only': 'A tool exists only in a local descriptor, or an application assignment has only a static app/tool route without an application-originated invocation observation.',
        denied: 'The exact discovered tool was not invoked because policy/allowlist withheld it, or it has only a governed non-app association rather than an app-visible binding.',
        unsupported: 'The owner was reachable but did not advertise/describe the exact tool, or an attempted invocation did not satisfy its contract.',
        unreachable: 'A selected owner/transport could not be reached; no fallback is credited.',
        executed: 'The exact discovered and descriptor-backed tool has an explicit successful invocation observation. Application assignments require separate application-originated proof.',
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
    summary: summarize(applications, assignments, tools, gaps, peerInput, contractInput, bindingInput),
    validation,
    applications,
    application_backend_assignments: assignments,
    tools,
    gaps,
  };

  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.mkdirSync(path.dirname(documentationPath), { recursive: true });
  writeFileAtomic(outputPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileAtomic(documentationPath, renderMarkdown(ledger));

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
      const descriptorModule = require(filePath);
      const bindings = Object.entries(descriptorModule)
        .filter(([name, value]) => /BackendBindings$/.test(name) && Array.isArray(value))
        .flatMap(([, value]) => value);
      records = bindings.map((binding, index) => ({
        name: binding.tool_function,
        description: binding.notes ?? binding.backend_contract ?? null,
        input_schema: null,
        descriptor_location: `${config.descriptor}#backend_bindings/${index}`,
        descriptor_contract: binding.backend_contract ?? null,
        surface: binding.surface ?? null,
        operation: binding.operation ?? null,
      }));
    }
    if (records.some(record => typeof record.name !== 'string' || record.name.length === 0)) {
      throw new Error(`Descriptor ${config.descriptor} contains a tool without a non-empty exact name.`);
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
    const method = discovery.method;
    const tools = dedupeByName(discovery.tools.map(tool => ({
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
        page_count: discovery.pageCount,
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
    return await paginatedToolList({ endpoint, method: 'GET' });
  } catch (error) {
    errors.push(`GET failed: ${errorMessage(error)}`);
  }
  try {
    return await paginatedToolList({ endpoint, method: 'POST' });
  } catch (error) {
    errors.push(`POST failed: ${errorMessage(error)}`);
  }
  throw new Error(errors.join('; '));
}

async function paginatedToolList({ endpoint, method }) {
  const tools = [];
  const seenCursors = new Set();
  let cursor = null;
  let pageCount = 0;
  do {
    if (pageCount >= 100) throw new Error('tools/list exceeded the 100-page safety limit');
    const response = method === 'GET'
      ? await fetch(toolListGetUrl(endpoint, cursor), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      })
      : await fetch(endpoint, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `svd-102-tools-list-${pageCount + 1}`,
          method: 'tools/list',
          params: cursor === null ? {} : { cursor },
        }),
        signal: AbortSignal.timeout(4000),
      });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const pageTools = toolArray(payload);
    if (!pageTools) throw new Error('response did not contain a tools array');
    tools.push(...pageTools);
    pageCount += 1;
    cursor = toolListCursor(payload);
    if (cursor !== null) {
      if (seenCursors.has(cursor)) throw new Error(`tools/list repeated cursor ${JSON.stringify(cursor)}`);
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
  return {
    tools,
    method: method === 'GET' ? 'GET /mcp/tools/list' : 'POST tools/list',
    pageCount,
  };
}

function toolListGetUrl(endpoint, cursor) {
  const url = new URL(endpoint.replace(/\/$/, '') + '/tools/list');
  if (cursor !== null) url.searchParams.set('cursor', cursor);
  return url;
}

function toolListCursor(payload) {
  const cursor = payload?.nextCursor ?? payload?.result?.nextCursor ?? payload?.data?.nextCursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
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
      const appVisibleRows = rows.filter(row => row.app_visible === true);
      const governedRows = rows.filter(row => row.app_visible !== true);
      const claimedPeerState = normalizeState(candidate.peer?.disposition);
      const peerAssessment = assessPeerTool(candidate.peer);
      const observedState = peerAssessment.state;
      const directState = candidate.direct ? 'live-discovered' : directDiscovery[candidate.owner].state;
      const stale = (Boolean(candidate.peer) && peerInput.freshness.state !== 'fresh')
        || (rows.length > 0 && bindingInput.freshness.state === 'stale');
      let currentState;
      // A current failed discovery is stronger evidence about present reachability
      // than a previously successful (but still fresh) SVD-100 observation. Keep
      // the historical execution flag below, but never label the current release
      // state executed while the owner cannot be reached now.
      if (directDiscovery[candidate.owner].state === 'unreachable') currentState = 'unreachable';
      else if (observedState && !stale) currentState = observedState;
      else if (candidate.direct) currentState = 'missing';
      else currentState = 'static-only';

      const states = stateFlags({
        stale,
        missing: currentState === 'missing' || rows.length === 0 || bindingInput.freshness.state === 'missing',
        'static-only': Boolean(candidate.local) && !candidate.direct
          && (!peerWasDiscovered(candidate.peer) || peerInput.freshness.state !== 'fresh'),
        denied: observedState === 'denied' || (rows.length > 0 && appVisibleRows.length === 0),
        unsupported: observedState === 'unsupported',
        unreachable: directDiscovery[candidate.owner].state === 'unreachable'
          || currentState === 'unreachable' || observedState === 'unreachable',
        executed: observedState === 'executed' && !stale,
      });
      return {
        tool_id: `${candidate.owner}:${candidate.name}`,
        owner: candidate.owner,
        name: candidate.name,
        current_state: currentState,
        release_state: stale ? 'stale' : currentState,
        peer_claimed_state: claimedPeerState ?? 'missing',
        observed_execution_state: observedState ?? 'missing',
        peer_observation_assessment: peerAssessment,
        discovery_state: directState,
        states,
        local_descriptor: candidate.local ? {
          present: true,
          location: candidate.local.descriptor_location,
          description: candidate.local.description,
          input_schema_present: Boolean(candidate.local.input_schema),
          input_schema_sha256: candidate.local.input_schema ? sha256(stableJson(candidate.local.input_schema)) : null,
          descriptor_contract: candidate.local.descriptor_contract ?? null,
          surface: candidate.local.surface ?? null,
          operation: candidate.local.operation ?? null,
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
          app_visible_row_count: appVisibleRows.length,
          governed_non_app_row_count: governedRows.length,
          rows: rows.map(bindingRowProvenance),
          state: appVisibleRows.length > 0
            ? 'static-app-route-declared-unproven'
            : rows.length > 0 ? 'governed-non-app-association' : 'missing',
          count_only_inference_used: false,
        },
        current_binding_state: appVisibleRows.length > 0
          ? 'static-app-route-declared-unproven'
          : rows.length > 0 ? 'governed-non-app-association' : 'missing',
        evidence_freshness: {
          direct_discovery: {
            state: directDiscovery[candidate.owner].state === 'reachable' ? 'fresh' : 'missing',
            observation_state: directDiscovery[candidate.owner].state,
            exact_name_observed: Boolean(candidate.direct),
            observed_at: directDiscovery[candidate.owner].observed_at,
            reason: directDiscovery[candidate.owner].state === 'reachable'
              ? candidate.direct
                ? 'The exact name was observed by this ledger run.'
                : 'The owner was queried by this ledger run, but did not advertise the exact name.'
              : directDiscovery[candidate.owner].error,
          },
          local_descriptor: {
            state: candidate.local ? 'fresh' : 'missing',
            source: candidate.local?.descriptor_location ?? null,
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
      const appVisibleRows = rows.filter(row => row.app_visible === true);
      const governedRows = rows.filter(row => row.app_visible !== true);
      const contractService = contractApps.get(app.id)?.assigned_backend_capabilities?.[capability.service] ?? null;
      const associatedTools = rows.map(row => tools.find(tool => tool.owner === capability.service && (
        tool.name === rowName(row) || tool.tool_id === row.tool_id
      ))).filter(Boolean);
      const boundTools = appVisibleRows.map(row => tools.find(tool => tool.owner === capability.service && (
        tool.name === rowName(row) || tool.tool_id === row.tool_id
      ))).filter(Boolean);
      let currentState = 'missing';
      if (appVisibleRows.length > 0 && boundTools.length > 0) {
        const observedToolFailure = selectState(boundTools
          .map(tool => tool.release_state)
          .filter(state => ['stale', 'unreachable', 'unsupported', 'denied'].includes(state)));
        // all-tools-app-bindings.json is a static route catalog. Even when its
        // exact tool was executed by SVD-100, that invocation originated in the
        // connector probe rather than this application. Therefore the strongest
        // assignment state available from these inputs is static-only.
        currentState = observedToolFailure === 'missing' ? 'static-only' : observedToolFailure;
      } else if (appVisibleRows.length > 0) {
        currentState = 'unsupported';
      } else if (rows.length > 0) {
        currentState = 'denied';
      }
      const stale = contractInput.freshness.state === 'stale' || bindingInput.freshness.state === 'stale';
      const states = stateFlags({
        stale,
        missing: rows.length === 0 || bindingInput.freshness.state === 'missing',
        'static-only': currentState === 'static-only',
        denied: currentState === 'denied' || boundTools.some(tool => tool.states.denied),
        unsupported: currentState === 'unsupported' || boundTools.some(tool => tool.states.unsupported),
        unreachable: boundTools.some(tool => tool.states.unreachable),
        executed: false,
      });
      const reasons = [];
      if (rows.length === 0) reasons.push('No explicit app/tool binding row exists; the manifest assignment is declaration only.');
      if (rows.length > 0 && appVisibleRows.length === 0) reasons.push('Binding rows exist only as governed non-app associations; none exposes a mediated application operation.');
      if (appVisibleRows.length > boundTools.length) reasons.push('At least one app-visible binding row names no inventoried exact tool for this owner.');
      if (contractService?.coverage_status === 'declared_no_tool_binding') reasons.push('The app backend contract explicitly reports declared_no_tool_binding.');
      if (stale) reasons.push('At least one supporting contract or binding projection artifact is stale.');
      if (currentState === 'static-only') reasons.push('Exact static app/tool routes exist, but no application-originated invocation observation proves a live binding. SVD-100 tool execution is not application-binding execution.');
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
        binding_materialization_state: appVisibleRows.length > 0
          ? 'static-app-route-declared-unproven'
          : rows.length > 0 ? 'governed-non-app-association' : 'missing',
        release_state: stale && currentState !== 'missing' ? 'stale' : currentState,
        states,
        explicit_binding_rows: rows.map(bindingRowProvenance),
        app_visible_binding_rows: appVisibleRows.map(bindingRowProvenance),
        governed_non_app_rows: governedRows.map(bindingRowProvenance),
        exact_associated_tool_ids: unique(associatedTools.map(tool => tool.tool_id)),
        exact_bound_tool_ids: unique(boundTools.map(tool => tool.tool_id)),
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
          ...rows.map(row => ({
            kind: row.app_visible === true ? 'app-visible-binding-row' : 'governed-non-app-association',
            ref: rel(bindingMatrixPath),
            tool_id: row.tool_id ?? null,
          })),
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

function buildGaps(applications, assignments, tools, peerInput, contractInput, bindingInput) {
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
  if (contractInput.freshness.state !== 'fresh') gaps.push({
    gap_id: `evidence:app-contract:${contractInput.freshness.state}`,
    kind: 'evidence', state: contractInput.freshness.state, owner: 'SVD-103',
    reason: contractInput.freshness.reason,
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

function summarize(applications, assignments, tools, gaps, peerInput, contractInput, bindingInput) {
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
    app_contract_evidence_freshness: contractInput.freshness.state,
    binding_evidence_freshness: bindingInput.freshness.state,
    counts_are_indexes_only: true,
  };
}

function validateLedger(applications, assignments, tools, descriptorCatalog, directDiscovery, peerTools = []) {
  const errors = [];
  const expectedApps = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
  const actualApps = applications.map(app => app.app_id).sort();
  if (stableJson(expectedApps) !== stableJson(actualApps)) errors.push('Application rows do not exactly match the canonical manifest IDs.');
  if (new Set(actualApps).size !== actualApps.length) errors.push('Duplicate canonical application rows are present.');
  const expectedAssignmentIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => app.backend_capabilities
    .filter(capability => owners.includes(capability.service))
    .map(capability => `${app.id}:${capability.service}:${capability.id}`)).sort();
  const actualAssignmentIds = assignments.map(row => row.assignment_id).sort();
  if (stableJson(expectedAssignmentIds) !== stableJson(actualAssignmentIds)) {
    errors.push('Declared assignment rows do not exactly match every canonical manifest app/backend capability assignment.');
  }
  for (const owner of owners) {
    const manifestOwner = VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => app.backend_capabilities
      .filter(capability => capability.service === owner)
      .map(capability => `${app.id}:${capability.id}`));
    const familyOwner = VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => app.service_families.includes(owner) ? [app.id] : []);
    const capabilityApps = new Set(manifestOwner.map(value => value.split(':')[0]));
    for (const appId of familyOwner) if (!capabilityApps.has(appId)) errors.push(`Manifest app ${appId} declares ${owner} without a backend_capability assignment.`);
    for (const appId of capabilityApps) if (!familyOwner.includes(appId)) errors.push(`Manifest app ${appId} has a ${owner} backend_capability without declaring the service family.`);
    const expectedNames = unique([
      ...descriptorCatalog[owner].map(tool => tool.name),
      ...directDiscovery[owner].tools.map(tool => tool.name),
      ...peerTools.filter(tool => tool.service === owner).map(tool => tool.name),
    ]);
    const actualNames = tools.filter(tool => tool.owner === owner).map(tool => tool.name).sort();
    if (stableJson(expectedNames) !== stableJson(actualNames)) {
      const missing = expectedNames.filter(name => !actualNames.includes(name));
      const unexpected = actualNames.filter(name => !expectedNames.includes(name));
      errors.push(`${owner} exact tool rows do not match the descriptor/live/peer union (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}).`);
    }
  }
  if (new Set(tools.map(tool => tool.tool_id)).size !== tools.length) errors.push('Duplicate exact tool IDs are present.');
  if (new Set(assignments.map(row => row.assignment_id)).size !== assignments.length) errors.push('Duplicate declared assignment IDs are present.');
  if (assignments.some(row => row.states.executed && row.exact_bound_tool_ids.length === 0)) errors.push('An assignment was marked executed without an exact bound tool.');
  if (assignments.some(row => row.states.executed && row.app_visible_binding_rows.length === 0)) errors.push('An assignment was marked executed without an app-visible binding row.');
  if (assignments.some(row => row.states.executed)) {
    errors.push('An assignment was marked executed even though this ledger has no application-originated live invocation evidence input.');
  }
  if (tools.some(tool => tool.states.executed && (tool.observed_execution_state !== 'executed'
    || !tool.live_discovery.peer_http?.discovered
    || !tool.live_discovery.peer_http?.descriptor_method
    || !tool.live_discovery.peer_http?.invocation_succeeded
    || !tool.live_discovery.peer_libp2p?.discovered
    || !tool.live_discovery.peer_libp2p?.descriptor_method
    || !tool.live_discovery.peer_libp2p?.invocation_succeeded))) {
    errors.push('A tool was marked executed without exact successful HTTP and libp2p invocation observations.');
  }
  if (tools.some(tool => tool.availability_inferred_from_count || tool.success_inferred_from_declaration)) {
    errors.push('A tool row inferred availability or success from a count/declaration.');
  }
  if (assignments.some(row => row.success_inferred_from_manifest || row.success_inferred_from_count)) {
    errors.push('An assignment inferred success from a manifest declaration or count.');
  }
  if (tools.some(tool => terminalStates.some(state => typeof tool.states[state] !== 'boolean'))) {
    errors.push('A tool row is missing an explicit boolean terminal-state flag.');
  }
  if (assignments.some(row => terminalStates.some(state => typeof row.states[state] !== 'boolean'))) {
    errors.push('An assignment row is missing an explicit boolean terminal-state flag.');
  }
  if (applications.some(app => terminalStates.some(state => typeof app.states[state] !== 'boolean'))) {
    errors.push('An application row is missing an explicit boolean terminal-state flag.');
  }
  if (tools.some(tool => !Array.isArray(tool.provenance) || tool.provenance.length === 0)) {
    errors.push('A tool row has no name-level provenance.');
  }
  if (assignments.some(row => !Array.isArray(row.provenance) || row.provenance.length === 0)) {
    errors.push('An assignment row has no name-level provenance.');
  }
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
    `Freshness window: ${ledger.evidence_policy.maximum_age_ms} ms. Peer evidence is **${ledger.summary.peer_evidence_freshness}**; app-contract evidence is **${ledger.summary.app_contract_evidence_freshness}**; binding evidence is **${ledger.summary.binding_evidence_freshness}**.`,
    '',
    '### Evidence inputs',
    '',
    '| Input | Present | Freshness | Generated at | Source alignment |',
    '| --- | --- | --- | --- | --- |',
    ...[
      ['SVD-100 peer evidence', ledger.provenance.peer_evidence],
      ['Application contract', ledger.provenance.app_contract],
      ['Binding matrix', ledger.provenance.binding_matrix],
    ].map(([label, input]) => `| ${label} | ${input.present ? 'yes' : 'no'} | ${escapeCell(input.freshness.state)} | ${escapeCell(input.freshness.generated_at ?? 'none')} | ${escapeCell(input.freshness.source_alignment ?? 'not-assessed')} |`),
    '',
    '### Backend discovery',
    '',
    '| Owner | Direct state | Direct names | Local descriptor names | Error |',
    '| --- | --- | ---: | ---: | --- |',
    ...ledger.backend_owners.map(owner => `| ${escapeCell(owner.owner)} | ${escapeCell(owner.direct_discovery_state)} | ${owner.direct_discovered_tool_names.length} | ${owner.descriptor_discovered_tool_names.length} | ${escapeCell(owner.direct_discovery_error ?? '')} |`),
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
    '| Application | Backend owner | Capability | App-visible rows | Exact bound tools | Binding state | Freshness/gap flags |',
    '| --- | --- | --- | ---: | ---: | --- | --- |',
    ...ledger.application_backend_assignments.map(row => `| ${escapeCell(row.app_id)} | ${escapeCell(row.backend_owner)} | ${escapeCell(row.capability)} | ${row.app_visible_binding_rows.length} | ${row.exact_bound_tool_ids.length} | ${escapeCell(row.current_binding_state)} | ${escapeCell(activeStates(row.states).join(', ') || 'none')} |`),
    '',
    '## Exact-name tool inventory',
    '',
    '| Owner | Tool | Local descriptor | Direct discovery | Peer observation | Release state | Binding | Flags |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...ledger.tools.map(tool => `| ${escapeCell(tool.owner)} | ${escapeCell(tool.name)} | ${tool.local_descriptor.present ? 'yes' : 'no'} | ${escapeCell(tool.discovery_state)} | ${escapeCell(tool.observed_execution_state)} | ${escapeCell(tool.release_state)} | ${escapeCell(tool.binding.state)} | ${escapeCell(activeStates(tool.states).join(', ') || 'none')} |`),
    '',
    '## Named gap roll-up',
    '',
    '| State | Count |',
    '| --- | ---: |',
    ...gapStates.map(state => `| ${state} | ${ledger.summary.gap_counts[state] ?? 0} |`),
    '',
    '## Named gaps',
    '',
    '| Gap ID | Kind | State | Reason |',
    '| --- | --- | --- | --- |',
    ...ledger.gaps.map(gap => `| ${escapeCell(gap.gap_id)} | ${escapeCell(gap.kind)} | ${escapeCell(gap.state)} | ${escapeCell(gap.reason)} |`),
    '',
    'The JSON artifact contains the complete per-row provenance, transport observations, freshness reasons, and machine-readable named gap records. Refresh SVD-100 evidence with `node scripts/capture-swissknife-all-tools-peer-evidence.cjs`, then rebuild this ledger; the builder also performs a bounded read-only HTTP `tools/list` discovery so newly advertised exact names cannot disappear behind an old catalog count.',
    '',
  ];
  return lines.join('\n');
}

function readEvidence(filePath, sourcePaths, now, expectation = {}) {
  let data = null;
  let error = null;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (expectation.schema && data?.schema !== expectation.schema) {
      error = `Expected schema ${expectation.schema}; found ${JSON.stringify(data?.schema ?? null)}.`;
    } else if (expectation.validate && !expectation.validate(data)) {
      error = `Evidence does not contain the required name-level shape (${expectation.shape ?? 'invalid shape'}).`;
    }
  } catch (readError) {
    error = fs.existsSync(filePath) ? `Invalid JSON: ${errorMessage(readError)}` : 'Evidence artifact does not exist.';
  }
  return {
    filePath,
    data: error ? null : data,
    freshness: assessFreshness(filePath, data, sourcePaths, now, error),
  };
}

function assessFreshness(filePath, data, sourcePaths, now, readError) {
  if (readError) return {
    state: 'missing', generated_at: null, age_ms: null,
    source_alignment: 'not-assessed', reason: readError,
  };
  const timestamp = Date.parse(data?.generated_at ?? '');
  if (!Number.isFinite(timestamp)) return {
    state: 'stale', generated_at: data?.generated_at ?? null, age_ms: null,
    source_alignment: 'not-assessed', reason: 'Evidence has no valid generated_at timestamp.',
  };
  const age = now.getTime() - timestamp;
  const existingSources = sourcePaths.filter(fs.existsSync);
  const newestSource = Math.max(...existingSources.map(source => fs.statSync(source).mtimeMs), 0);
  const sourceFiles = existingSources.sort().map(source => ({
    path: rel(source),
    sha256: sha256(fs.readFileSync(source)),
  }));
  const sourceFingerprint = sha256(sourceFiles.map(source => `${source.path}:${source.sha256}`).join('\n'));
  const recordedFingerprint = evidenceSourceFingerprint(data);
  const sourceAlignment = recordedFingerprint === null
    ? 'unverifiable-input-does-not-publish-source-fingerprint'
    : recordedFingerprint === sourceFingerprint ? 'verified' : 'mismatch';
  const reasons = [];
  if (age < -clockSkewToleranceMs) reasons.push('Evidence timestamp is in the future beyond the allowed clock skew.');
  if (age > maxEvidenceAgeMs) reasons.push(`Evidence age ${age} ms exceeds ${maxEvidenceAgeMs} ms.`);
  if (sourceAlignment === 'mismatch') reasons.push('Evidence source fingerprint does not match the current source snapshot.');
  return {
    state: reasons.length > 0 ? 'stale' : 'fresh',
    generated_at: new Date(timestamp).toISOString(),
    age_ms: age,
    newest_source_mtime: newestSource ? new Date(newestSource).toISOString() : null,
    current_source_fingerprint: sourceFingerprint,
    current_source_files: sourceFiles,
    recorded_source_fingerprint: recordedFingerprint,
    source_alignment: sourceAlignment,
    reason: reasons.join(' ') || 'Evidence is within the freshness window and is not future-dated.',
  };
}

function normalizePeerTools(data) {
  const services = Array.isArray(data?.services) ? data.services : [];
  const serviceByOwner = new Map(services.map(service => [service.service, service]));
  const candidates = [
    ...(Array.isArray(data?.tools) ? data.tools : []),
    ...services.flatMap(service => (Array.isArray(service?.tools) ? service.tools : [])
      .map(tool => ({ service: service.service, ...tool }))),
  ];
  const toolsById = new Map();
  for (const tool of candidates) {
    if (!owners.includes(tool?.service) || typeof tool?.name !== 'string') continue;
    toolsById.set(`${tool.service}:${tool.name}`, tool);
  }
  return [...toolsById.values()]
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
  // Non-app dispositions may intentionally omit app_id. Retain them so a
  // denied, diagnostic, or server-only tool cannot disappear from the tool
  // ledger. Application assignment joins still require an exact app_id.
  return rows.filter(row => row && typeof row === 'object' && rowOwner(row) && rowName(row));
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

/** Derive the state from exact transport observations; disposition is only a claim. */
function assessPeerTool(peer) {
  if (!peer) return { state: null, credible: false, reason: 'No SVD-100 exact-name peer observation exists.' };
  const http = peer?.observations?.http;
  const libp2p = peer?.observations?.libp2p;
  if (!http || !libp2p) return {
    state: null,
    credible: false,
    reason: 'Peer row lacks separate HTTP and libp2p exact-name observations.',
  };
  const observations = [http, libp2p];
  if (observations.some(item => item.connected !== true || item.status === 'unreachable')) return {
    state: 'unreachable',
    credible: true,
    reason: 'At least one required transport has an explicit unreachable observation.',
  };
  if (observations.every(item => item.discovered === true
      && item.descriptor_method === true
      && item.invocation_succeeded === true
      && item.status === 'executed')) return {
    state: 'executed',
    credible: true,
    reason: 'Both transports explicitly discovered, described, and successfully invoked the exact name.',
  };
  if (observations.some(item => item.discovered !== true
      || item.descriptor_method !== true
      || item.status === 'unsupported')) return {
    state: peer.static_descriptor_present === true
        && observations.every(item => item.discovered !== true)
      ? 'static-only'
      : 'unsupported',
    credible: true,
    reason: 'At least one reachable transport did not both discover and describe the exact name.',
  };
  if (observations.every(item => item.status === 'denied'
      && item.invocation_attempted !== true
      && item.invocation_succeeded !== true)) return {
    state: 'denied',
    credible: true,
    reason: 'Both transports discovered and described the exact name but explicitly withheld invocation.',
  };
  return {
    state: 'unsupported',
    credible: true,
    reason: 'Transport observations do not satisfy a recognized exact-name execution or governed-denial contract.',
  };
}

function evidenceSourceFingerprint(data) {
  const candidates = [
    data?.source_fingerprint,
    data?.provenance?.source_fingerprint,
    data?.generated_from?.source_fingerprint,
    data?.source_snapshot?.fingerprint,
  ];
  return candidates.find(value => typeof value === 'string' && value.startsWith('sha256:')) ?? null;
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
  if (state === 'stale') return 'The exact-name peer execution observation and/or its explicit binding row is stale.';
  if (state === 'denied' && tool.binding.explicit_row_count > 0 && tool.binding.app_visible_row_count === 0) {
    return 'The tool has governed ownership associations but no app-visible binding; it is withheld from application invocation by policy.';
  }
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

function writeFileAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch {}
  }
}

module.exports = {
  main,
  assessFreshness,
  validateLedger,
  readDescriptorCatalog,
  normalizePeerTools,
  requestToolList,
  assessPeerTool,
};
