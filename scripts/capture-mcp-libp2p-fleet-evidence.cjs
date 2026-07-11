#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const python = process.env.IPFS_ACCELERATE_PYTHON || '/home/barberb/ipfs_accelerate_py/.venv/bin/python3';
const probeTimeoutMs = Number(process.env.MCPPLUSPLUS_FLEET_PROBE_TIMEOUT_MS || 180000);
const announceFiles = [
  'ipfs-kit-mcp-p2p-announce.json',
  'ipfs-datasets-mcp-p2p-announce.json',
  'ipfs-accelerate-mcp-p2p-announce.json',
];

main();

function main() {
  const bootstrap = spawnSync(process.execPath, [path.join(__dirname, 'ensure-ipfs-mcp-libp2p-bridges.cjs')], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (bootstrap.error || bootstrap.status !== 0) {
    fail({ error: bootstrap.error?.message || `bridge bootstrap exited ${bootstrap.status}` });
    return;
  }

  const announces = announceFiles.map(fileName => JSON.parse(fs.readFileSync(path.join(evidenceRoot, fileName), 'utf8')));
  const result = spawnSync(python, ['-c', pythonProbe(announces)], {
    cwd: '/home/barberb/ipfs_accelerate_py',
    env: process.env,
    encoding: 'utf8',
    timeout: Number.isFinite(probeTimeoutMs) && probeTimeoutMs >= 60000
      ? probeTimeoutMs
      : 180000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = parseTrailingJson(result.stdout);
  if (result.status !== 0 || !parsed) {
    fail({ error: result.error?.message || result.stderr || result.stdout || `python exited ${result.status}` });
    return;
  }

  writeEvidence(parsed);
  console.log(JSON.stringify({
    decision: parsed.decision,
    service_count: parsed.services.length,
    total_unique_callable_tools: parsed.total_unique_callable_tools,
    output: path.relative(projectRoot, path.join(evidenceRoot, 'mcpplusplus-libp2p-fleet-reachability.json')),
  }, null, 2));
  if (parsed.decision !== 'go') process.exitCode = 1;
}

function pythonProbe(announces) {
  return `
import json
import base64
import hashlib
import re
import trio
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_client import MCPP2PClient, open_libp2p_stream_by_multiaddr, trio_libp2p_host_listen
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_protocol import PROTOCOL_MCP_P2P_V1

announces = json.loads(${JSON.stringify(JSON.stringify(announces))})
safe_tools = {
    'ipfs_kit_py': 'files_stat',
    'ipfs_datasets_py': 'list_indices',
    'ipfs_accelerate_py': 'get_server_status',
}

def cid_for_bytes(value):
    digest = hashlib.sha256(value).digest()
    return 'b' + base64.b32encode(b'\x01\x55\x12\x20' + digest).decode('ascii').lower().rstrip('=')

def cid_for_value(value):
    return cid_for_bytes(canonical_json_bytes(value))

def canonical_json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

def is_cid(value):
    return isinstance(value, str) and re.fullmatch(r'(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})', value) is not None

async def main():
    rows = []
    async with trio_libp2p_host_listen(listen_multiaddr='/ip4/127.0.0.1/tcp/0') as host:
        for announce in announces:
            stream = await open_libp2p_stream_by_multiaddr(host, peer_multiaddr=announce['multiaddr'], protocols=[PROTOCOL_MCP_P2P_V1])
            client = MCPP2PClient(stream)
            initialize = await client.initialize({
                'protocolVersion': '2024-11-05',
                'client': {'name': 'swissknife-independent-libp2p-fleet-probe'},
                'clientInfo': {'name': 'swissknife-independent-libp2p-fleet-probe', 'version': '1.0.0'},
                'capabilities': {
                    'tools': {},
                    'experimental': {
                        'mcp++/mcp-idl': True,
                        'mcp++/cid-envelope': True,
                        'mcp++/ucan': True,
                        'mcp++/deontic-policy': True,
                        'mcp++/event-dag': True,
                        'mcp++/p2p-transport': True,
                    },
                },
                'mcpPlusPlusProfiles': ['mcp++/profile-a-idl'],
            })
            tools = await client.tools_list()
            names = [tool.get('name') for tool in tools if isinstance(tool, dict) and isinstance(tool.get('name'), str)]
            interfaces_response = await client.request('interfaces/list', {})
            interfaces_result = interfaces_response.get('result') or {}
            interface_cids = interfaces_result.get('interface_cids') or interfaces_result.get('interfaces') or []
            interface_cids = [cid for cid in interface_cids if isinstance(cid, str)]
            interface_cid = interface_cids[0] if interface_cids else None
            descriptor_response = await client.request('interfaces/get', {'interface_cid': interface_cid}) if interface_cid else {}
            descriptor_result = descriptor_response.get('result') or {}
            compatibility_response = await client.request('interfaces/compat', {
                'client_cid': interface_cid,
                'server_cid': interface_cid,
            }) if interface_cid else {}
            compatibility_result = compatibility_response.get('result') or {}
            canonical_bytes = b''
            try:
                canonical_bytes = base64.b64decode(descriptor_result.get('canonical_bytes_base64') or '', validate=True)
            except Exception:
                canonical_bytes = b''
            canonical_descriptor = descriptor_result.get('canonical_descriptor')
            descriptor = descriptor_result.get('descriptor')
            method_names = [method.get('name') for method in (descriptor or {}).get('methods', []) if isinstance(method, dict) and isinstance(method.get('name'), str)]
            descriptor_valid = (
                isinstance(interface_cid, str)
                and isinstance(canonical_descriptor, dict)
                and isinstance(descriptor, dict)
                and canonical_bytes
                and cid_for_bytes(canonical_bytes) == interface_cid
                and json.loads(canonical_bytes.decode('utf-8')) == canonical_descriptor
                and descriptor.get('interface_cid') == interface_cid
            )
            profile_a_persistence = descriptor_result.get('artifact_persistence') or {}
            profile_a_persisted = (
                profile_a_persistence.get('complete') is True
                and (profile_a_persistence.get('interface_descriptor') or {}).get('persisted') is True
                and (profile_a_persistence.get('interface_descriptor') or {}).get('verified') is True
            )
            profile_a_artifact_response = await client.request('mcp++/artifacts/get', {'cid': interface_cid}) if interface_cid else {}
            profile_a_artifact = profile_a_artifact_response.get('result') or {}
            try:
                profile_a_retrievable = (
                    profile_a_artifact.get('found') is True
                    and profile_a_artifact.get('verified') is True
                    and profile_a_artifact.get('cid') == interface_cid
                    and base64.b64decode(profile_a_artifact.get('bytes_base64') or '', validate=True) == canonical_bytes
                )
            except Exception:
                profile_a_retrievable = False
            safe_tool = safe_tools[announce['service']]
            profile_b_params = {
                'interface_cid': interface_cid,
                'tool': safe_tool,
                'arguments': {},
                'parents': [],
                'timestamp': '2026-07-10T00:00:00.000Z',
                'correlation_id': f"profile-b-parity-{announce['service']}",
            }
            profile_b_response = await client.request('mcp++/execute', profile_b_params)
            profile_b = profile_b_response.get('result') or {}
            profile_b_receipt = profile_b.get('receipt') or {}
            profile_b_persistence = profile_b.get('artifact_persistence') or {}
            profile_b_artifacts = profile_b_persistence.get('artifacts') or {}
            profile_b_persisted = (
                profile_b_persistence.get('complete') is True
                and all(
                    (profile_b_artifacts.get(kind) or {}).get('persisted') is True
                    and (profile_b_artifacts.get(kind) or {}).get('verified') is True
                    for kind in ('input', 'intent', 'envelope', 'output', 'receipt', 'event')
                )
            )
            profile_b_valid = (
                all(is_cid(profile_b.get(field)) for field in ('input_cid', 'intent_cid', 'envelope_cid', 'output_cid', 'event_cid'))
                and is_cid(profile_b_receipt.get('receipt_cid'))
                and cid_for_value(profile_b.get('output')) == profile_b.get('output_cid')
                and cid_for_value(profile_b.get('envelope')) == profile_b.get('envelope_cid')
                and cid_for_value(profile_b.get('receipt_artifact')) == profile_b_receipt.get('receipt_cid')
                and cid_for_value(profile_b.get('event')) == profile_b.get('event_cid')
                and profile_b_receipt.get('success') is True
                and profile_b_persisted
            )
            profile_b_artifact_response = await client.request('mcp++/artifacts/get', {'cid': profile_b.get('envelope_cid')})
            profile_b_artifact = profile_b_artifact_response.get('result') or {}
            try:
                profile_b_retrieved_bytes = base64.b64decode(profile_b_artifact.get('bytes_base64') or '', validate=True)
                profile_b_expected_bytes = canonical_json_bytes(profile_b.get('envelope'))
                profile_b_retrievable = (
                    profile_b_artifact.get('found') is True
                    and profile_b_artifact.get('verified') is True
                    and profile_b_artifact.get('cid') == profile_b.get('envelope_cid')
                    and profile_b_retrieved_bytes == profile_b_expected_bytes
                )
            except Exception as exc:
                profile_b_retrievable = False
                profile_b_retrieved_bytes = b''
                profile_b_expected_bytes = b''
                profile_b_retrieval_error = str(exc)
            dag_history_response = await client.request('mcp++/dag/history', {'limit': 20})
            dag_history = (dag_history_response.get('result') or {}).get('events') or []
            profile_f = {
                'advertised': initialize.get('result', {}).get('capabilities', {}).get('experimental', {}).get('mcp++/event-dag') is True,
                'history_count': len(dag_history),
                'execution_event_present': any(
                    isinstance(event, dict) and event.get('event_cid') == profile_b.get('event_cid')
                    for event in dag_history
                ),
            }
            safe_call = await client.tools_call(safe_tool, {})
            peers = await client.request('mcp++/p2p/peers', {})
            await client.aclose()
            init = initialize.get('result', {})
            canonical_initialize = (
                init.get('protocolVersion') == '2024-11-05'
                and isinstance(init.get('serverInfo'), dict)
                and init.get('capabilities', {}).get('experimental', {}).get('mcp++/p2p-transport') is True
            )
            peer_rows = (peers.get('result') or {}).get('peers')
            rows.append({
                'service': announce['service'],
                'announce_file': announce.get('announce_file'),
                'multiaddr': announce['multiaddr'],
                'announced_tool_count': announce['tool_count'],
                'listed_tool_count': len(names),
                'unique_tool_name_count': len(set(names)),
                'tool_count_matches_announce': len(names) == announce['tool_count'],
                'initialize_ok': canonical_initialize,
                'protocol': announce.get('protocol'),
                'active_profile': 'mcp++/p2p-transport' if canonical_initialize else None,
                'profile_negotiation': {'negotiated': ['mcp++/p2p-transport']} if canonical_initialize else None,
                'canonical_initialize_result': {
                    'protocol_version_present': init.get('protocolVersion') == '2024-11-05',
                    'server_info_present': isinstance(init.get('serverInfo'), dict),
                    'experimental_capabilities_present': init.get('capabilities', {}).get('experimental', {}).get('mcp++/p2p-transport') is True,
                    'profile_a_capability_present': init.get('capabilities', {}).get('experimental', {}).get('mcp++/mcp-idl') is True,
                    'profile_b_capability_present': init.get('capabilities', {}).get('experimental', {}).get('mcp++/cid-envelope') is True,
                    'profile_f_capability_present': init.get('capabilities', {}).get('experimental', {}).get('mcp++/event-dag') is True,
                },
                'profile_a': {
                    'advertised': init.get('capabilities', {}).get('experimental', {}).get('mcp++/mcp-idl') is True,
                    'interface_count': len(interface_cids),
                    'interface_cid': interface_cid,
                    'descriptor_valid': descriptor_valid,
                    'persisted': profile_a_persisted,
                    'retrievable': profile_a_retrievable,
                    'persistence_backend': (profile_a_persistence.get('interface_descriptor') or {}).get('backend'),
                    'method_count': len(method_names),
                    'method_count_matches_tools': len(method_names) == len(names) and set(method_names) == set(names),
                    'compatible': compatibility_result.get('compatible') is True,
                    'available': (
                        init.get('capabilities', {}).get('experimental', {}).get('mcp++/mcp-idl') is True
                        and len(interface_cids) == 1
                        and descriptor_valid
                        and profile_a_persisted
                        and profile_a_retrievable
                        and len(method_names) == len(names)
                        and set(method_names) == set(names)
                        and compatibility_result.get('compatible') is True
                    ),
                },
                'profile_b': {
                    'advertised': init.get('capabilities', {}).get('experimental', {}).get('mcp++/cid-envelope') is True,
                    'valid': profile_b_valid,
                    'persisted': profile_b_persisted,
                    'retrievable': profile_b_retrievable,
                    'retrieval_status': profile_b_artifact_response.get('error', {}).get('message') if isinstance(profile_b_artifact_response.get('error'), dict) else None,
                    'retrieval_error': profile_b_retrieval_error if not profile_b_retrievable else None,
                    'retrieval_cid': profile_b_artifact.get('cid'),
                    'retrieval_bytes': len(profile_b_artifact.get('bytes_base64') or ''),
                    'retrieval_sha256': hashlib.sha256(profile_b_retrieved_bytes).hexdigest(),
                    'expected_sha256': hashlib.sha256(profile_b_expected_bytes).hexdigest(),
                    'persistence_backends': sorted({
                        artifact.get('backend') for artifact in profile_b_artifacts.values()
                        if isinstance(artifact, dict) and isinstance(artifact.get('backend'), str)
                    }),
                    'interface_cid': profile_b.get('envelope', {}).get('interface_cid'),
                    'input_cid': profile_b.get('input_cid'),
                    'envelope_cid': profile_b.get('envelope_cid'),
                    'receipt_cid': profile_b_receipt.get('receipt_cid'),
                    'success': profile_b_receipt.get('success') is True,
                },
                'profile_f': profile_f,
                'peer_discovery_returned': isinstance(peer_rows, list) and len(peer_rows) == 1 and peer_rows[0].get('id') == announce.get('peer_id'),
                'safe_tool': safe_tool,
                'safe_call_returned': safe_call is not None,
                'safe_call_sample': safe_call,
                'sample_tools': names[:20],
            })
    ok = all(
        row['initialize_ok']
        and row['protocol'] == '/mcp+p2p/1.0.0'
        and row['tool_count_matches_announce']
        and row['unique_tool_name_count'] == row['listed_tool_count']
        and row['safe_call_returned']
        and row['peer_discovery_returned']
        and row['profile_a']['advertised']
        and row['profile_a']['interface_count'] == 1
        and row['profile_a']['descriptor_valid']
        and row['profile_a']['persisted']
        and row['profile_a']['retrievable']
        and row['profile_a']['method_count_matches_tools']
        and row['profile_a']['compatible']
        and row['profile_b']['advertised']
        and row['profile_b']['valid']
        and row['profile_b']['persisted']
        and row['profile_b']['retrievable']
        and row['profile_b']['success']
        and row['profile_f']['advertised']
        and row['profile_f']['execution_event_present']
        for row in rows
    )
    print(json.dumps({
        'schema': 'swissknife.mcpplusplus_libp2p_fleet_reachability.v2',
        'generated_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'decision': 'go' if ok else 'no_go',
        'protocol': PROTOCOL_MCP_P2P_V1,
        'service_count': len(rows),
        'total_unique_callable_tools': sum(row['listed_tool_count'] for row in rows),
        'services': rows,
    }, sort_keys=True))

trio.run(main)
`;
}

function writeEvidence(evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'mcpplusplus-libp2p-fleet-reachability.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}

function fail(error) {
  const evidence = {
    schema: 'swissknife.mcpplusplus_libp2p_fleet_reachability.v2',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    service_count: 0,
    total_unique_callable_tools: 0,
    error: error.error,
    services: [],
  };
  writeEvidence(evidence);
  console.error(error.error);
  process.exitCode = 1;
}

function parseTrailingJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch (_error) {}
  const start = trimmed.lastIndexOf('\n{');
  if (start >= 0) {
    try { return JSON.parse(trimmed.slice(start + 1)); } catch (_error) {}
  }
  const brace = trimmed.indexOf('{');
  if (brace >= 0) {
    try { return JSON.parse(trimmed.slice(brace)); } catch (_error) {}
  }
  return null;
}
