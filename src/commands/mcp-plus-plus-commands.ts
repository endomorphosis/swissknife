/**
 * MCP++ CLI Commands for SwissKnife
 * 
 * Exposes MCP++ protocol operations via the CLI:
 * - mcp++ interfaces  - List registered interface descriptors
 * - mcp++ execute     - Execute with CID-native envelope
 * - mcp++ dag         - Query event DAG provenance
 * - mcp++ delegate    - Create UCAN delegation
 * - mcp++ policy      - Manage deontic policies
 * - mcp++ p2p         - P2P transport operations
 * - mcp++ connect     - Connect to real MCP++ servers
 * - mcp++ status      - Show connection status
 */

import type { Command as PublicCommand } from '../types/command.js';
import { createMCPPlusPlusClient, IPFS_KIT_INTERFACE, IPFS_ACCELERATE_INTERFACE, IPFS_DATASETS_INTERFACE } from '../services/mcp-plus-plus.js';
import { createMultiServerConnector, IPFS_KIT_SERVER, IPFS_DATASETS_SERVER, IPFS_ACCELERATE_SERVER, mcpppToolTotal } from '../services/mcp-plus-plus-connector.js';
import type { MCPPPMultiServerConnector, MultiServerConnectorOptions } from '../services/mcp-plus-plus-connector.js';
import { WasmProverHub } from '../services/mcp-wasm-prover-hub.js';

// Singleton client initialized with placeholder DID (replaced at runtime)
let mcpppClient: ReturnType<typeof createMCPPlusPlusClient> | null = null;
let mcpppConnector: MCPPPMultiServerConnector | null = null;
let mcpppConnectorTransport: 'http' | 'libp2p' = 'http';

function getClient(): ReturnType<typeof createMCPPlusPlusClient> {
  if (!mcpppClient) {
    mcpppClient = createMCPPlusPlusClient('did:key:z6MkswissknifeCLI');
  }
  return mcpppClient;
}

function getConnector(opts?: MultiServerConnectorOptions): MCPPPMultiServerConnector {
  if (!mcpppConnector) {
    mcpppConnector = createMultiServerConnector('did:key:z6MkswissknifeCLI', opts);
    mcpppConnectorTransport = opts?.libp2p ? 'libp2p' : 'http';
  }
  return mcpppConnector;
}

/** Force a fresh connector (used when switching transports at runtime). */
function resetConnector(opts?: MultiServerConnectorOptions): MCPPPMultiServerConnector {
  mcpppConnector = createMultiServerConnector('did:key:z6MkswissknifeCLI', opts);
  mcpppConnectorTransport = opts?.libp2p ? 'libp2p' : 'http';
  return mcpppConnector;
}

export const mcpppCommand: PublicCommand = {
  type: 'local',
  name: 'mcp++',
  description: 'MCP++ protocol operations (CID-native contracts, UCAN, Event DAG, P2P)',
  aliases: ['mcppp'],
  options: [],
  subcommands: [
    {
      name: 'interfaces',
      description: 'List registered MCP++ interface descriptors',
      options: [
        { name: 'namespace', type: 'string', description: 'Filter by namespace' },
        { name: 'tag', type: 'string', description: 'Filter by semantic tag' },
      ],
    },
    {
      name: 'execute',
      description: 'Execute a method with CID-native envelope',
      options: [
        { name: 'interface', type: 'string', description: 'Interface name (ipfs-kit, ipfs-accelerate, ipfs-datasets)' },
        { name: 'method', type: 'string', description: 'Method name (e.g. ipfs.add, accelerate.inference)' },
        { name: 'input', type: 'string', description: 'JSON input' },
        { name: 'proof', type: 'string', description: 'Optional proof CID for UCAN validation' },
      ],
    },
    {
      name: 'dag',
      description: 'Query the execution Event DAG',
      options: [
        { name: 'frontier', type: 'boolean', description: 'Show current DAG frontier' },
        { name: 'history', type: 'boolean', description: 'Show full event history' },
        { name: 'provenance', type: 'string', description: 'Trace provenance from event CID' },
      ],
    },
    {
      name: 'delegate',
      description: 'Create a UCAN capability delegation',
      options: [
        { name: 'to', type: 'string', description: 'Audience DID' },
        { name: 'interface', type: 'string', description: 'Interface CID to delegate' },
        { name: 'method', type: 'string', description: 'Method to allow (* for all)' },
        { name: 'hours', type: 'string', description: 'Expiration in hours (default: 24)' },
      ],
    },
    {
      name: 'policy',
      description: 'Manage temporal deontic policies',
      options: [
        { name: 'list', type: 'boolean', description: 'List active policies' },
        { name: 'add', type: 'string', description: 'JSON policy to register' },
      ],
    },
    {
      name: 'profiles',
      description: 'Show supported MCP++ profiles',
      options: [],
    },
    {
      name: 'p2p',
      description: 'P2P transport operations',
      options: [
        { name: 'peer', type: 'string', description: 'Remote peer ID' },
        { name: 'addrs', type: 'string', description: 'Multiaddrs (comma-separated)' },
      ],
    },
    {
      name: 'connect',
      description: 'Connect to real MCP++ servers (ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py)',
      options: [
        { name: 'transport', type: 'string', description: "Transport: 'http' (default) or 'libp2p'" },
        { name: 'multiaddr', type: 'string', description: 'libp2p multiaddr applied to all servers (transport=libp2p)' },
        { name: 'kit-addr', type: 'string', description: 'libp2p multiaddr for ipfs-kit-mcp++' },
        { name: 'datasets-addr', type: 'string', description: 'libp2p multiaddr for ipfs-datasets-mcp++' },
        { name: 'accelerate-addr', type: 'string', description: 'libp2p multiaddr for ipfs-accelerate-mcp++' },
      ],
    },
    {
      name: 'categories',
      description: 'List hierarchical tool categories on a connected MCP++ server',
      options: [
        { name: 'server', type: 'string', description: 'Server name (default: ipfs-kit-mcp++)' },
        { name: 'category', type: 'string', description: 'Optional: list tools within this category' },
      ],
    },
    {
      name: 'status',
      description: 'Show MCP++ server connection status',
      options: [],
    },
    {
      name: 'call',
      description: 'Call a tool on a connected MCP++ server with CID envelope',
      options: [
        { name: 'server', type: 'string', description: 'Server name (ipfs-datasets-mcp++ or ipfs-accelerate-mcp++)' },
        { name: 'tool', type: 'string', description: 'Tool name to call' },
        { name: 'args', type: 'string', description: 'JSON arguments' },
      ],
    },
  ],
  isEnabled: true,
  isHidden: false,
  userFacingName: () => 'mcp++',
  execute: async (args: string[], options: Record<string, any>) => {
    const client = getClient();
    const subcommand = args[0] || 'profiles';

    switch (subcommand) {
      case 'interfaces': {
        const filter: any = {};
        if (options.namespace) filter.namespace = options.namespace;
        if (options.tag) filter.tags = [options.tag];
        const interfaces = Object.keys(filter).length > 0 
          ? client.queryInterfaces(filter)
          : client.listInterfaces();
        
        return {
          output: interfaces.map(i => 
            `┌─ ${i.name} (${i.namespace}) v${i.version}\n` +
            `│  CID: ${i.interface_cid}\n` +
            `│  Methods: ${i.methods.map(m => m.name).join(', ')}\n` +
            `│  Tags: ${i.semantic_tags.join(', ')}\n` +
            `│  Requires: ${i.requires.join(', ')}\n` +
            `└─ Errors: ${i.errors.map(e => e.name).join(', ')}`
          ).join('\n\n'),
        };
      }

      case 'execute': {
        if (!options.interface || !options.method) {
          return { error: 'Usage: mcp++ execute --interface <name> --method <method> --input <json>' };
        }
        const ifaceMap: Record<string, string> = {
          'ipfs-kit': IPFS_KIT_INTERFACE.interface_cid,
          'ipfs-accelerate': IPFS_ACCELERATE_INTERFACE.interface_cid,
          'ipfs-datasets': IPFS_DATASETS_INTERFACE.interface_cid,
        };
        const interfaceCid = ifaceMap[options.interface] || options.interface;
        const input = options.input ? JSON.parse(options.input) : {};
        
        try {
          const envelope = await client.executeWithEnvelope(interfaceCid, options.method, input, options.proof);
          return {
            output: [
              `Execution Envelope:`,
              `  CID: ${envelope.envelope_cid}`,
              `  Decision: ${envelope.decision.decision}`,
              `  Event CID: ${envelope.event_cid || 'N/A'}`,
              envelope.receipt ? [
                `  Receipt:`,
                `    Duration: ${envelope.receipt.duration_ms}ms`,
                `    Success: ${envelope.receipt.success}`,
                `    Output CID: ${envelope.receipt.output_cid}`,
              ].join('\n') : '',
              envelope.output ? `  Output: ${JSON.stringify(envelope.output).slice(0, 200)}` : '',
            ].filter(Boolean).join('\n'),
          };
        } catch (e: any) {
          return { error: `Execution failed: ${e.message}` };
        }
      }

      case 'dag': {
        if (options.frontier) {
          const frontier = client.getDAGFrontier();
          return { output: frontier.length > 0 ? `DAG Frontier:\n${frontier.map(c => `  • ${c}`).join('\n')}` : 'Event DAG is empty' };
        }
        if (options.provenance) {
          const chain = client.getProvenanceChain(options.provenance);
          return {
            output: chain.length > 0
              ? `Provenance chain (${chain.length} events):\n${chain.map(n => `  ${n.timestamp} | ${n.method} | ${n.event_cid.slice(0, 20)}...`).join('\n')}`
              : `No events found for CID: ${options.provenance}`,
          };
        }
        // Default: show history
        const history = client.getEventHistory();
        return {
          output: history.length > 0
            ? `Event DAG (${history.length} events):\n${history.slice(-20).map(n => `  ${n.timestamp} | ${n.agent_did.slice(0,20)} → ${n.method} [${n.event_cid.slice(0,16)}...]`).join('\n')}`
            : 'Event DAG is empty. Execute methods with mcp++ execute to build the DAG.',
        };
      }

      case 'delegate': {
        if (!options.to || !options.interface) {
          return { error: 'Usage: mcp++ delegate --to <did> --interface <name> --method <method> [--hours <n>]' };
        }
        const ifaceMap: Record<string, string> = {
          'ipfs-kit': IPFS_KIT_INTERFACE.interface_cid,
          'ipfs-accelerate': IPFS_ACCELERATE_INTERFACE.interface_cid,
          'ipfs-datasets': IPFS_DATASETS_INTERFACE.interface_cid,
        };
        const delegation = client.createDelegation(options.to, [{
          interface_cid: ifaceMap[options.interface] || options.interface,
          method: options.method || '*',
          caveats: {
            time_window: {
              not_before: new Date().toISOString(),
              expires_at: new Date(Date.now() + (parseInt(options.hours || '24') * 3600000)).toISOString(),
            },
          },
        }], parseInt(options.hours || '24'));

        return {
          output: [
            `UCAN Delegation Created:`,
            `  Issuer: ${delegation.issuer}`,
            `  Audience: ${delegation.audience}`,
            `  Proof CID: ${delegation.proof_cid}`,
            `  Expires: ${new Date(delegation.expiration * 1000).toISOString()}`,
            `  Capabilities: ${delegation.capabilities.map(c => `${c.interface_cid.slice(0,16)}.../${c.method}`).join(', ')}`,
          ].join('\n'),
        };
      }

      case 'policy': {
        if (options.add) {
          try {
            const policy = JSON.parse(options.add);
            client.registerPolicy(policy);
            return { output: `Policy registered: ${policy.policy_cid}` };
          } catch (e: any) {
            return { error: `Invalid policy JSON: ${e.message}` };
          }
        }
        return { output: 'Temporal deontic policy manager. Use --add <json> to register a policy.' };
      }

      case 'profiles': {
        const profiles = client.getSupportedProfiles();
        return {
          output: [
            'Supported MCP++ Profiles:',
            ...profiles.map(p => `  ✓ ${p}`),
            '',
            'Profile Details:',
            '  A: MCP-IDL        — CID-addressed interface contracts',
            '  B: CID-Envelope   — Immutable execution artifacts & receipts',
            '  C: UCAN           — Capability delegation chains',
            '  D: Deontic Policy — Temporal permission/prohibition/obligation',
            '  E: mcp+p2p        — P2P transport binding (libp2p)',
            '  +  Event DAG      — Append-only provenance graph',
          ].join('\n'),
        };
      }

      case 'p2p': {
        if (!options.peer) {
          return { output: 'P2P Transport: Use --peer <id> --addrs <multiaddrs> to create a session' };
        }
        const addrs = (options.addrs || '').split(',').filter(Boolean);
        const session = client.createP2PSession(options.peer, addrs);
        return {
          output: [
            `P2P Session Created:`,
            `  Protocol: ${session.protocol_id}`,
            `  Peer: ${session.peer_id}`,
            `  Addrs: ${session.multiaddrs.join(', ') || 'none'}`,
            `  Capabilities: ${session.capabilities.join(', ')}`,
          ].join('\n'),
        };
      }

      case 'connect': {
        let connectorOpts: MultiServerConnectorOptions | undefined;
        if (options.transport === 'libp2p') {
          const libp2p: Record<string, string> = {};
          if (options['kit-addr']) libp2p[IPFS_KIT_SERVER.name] = options['kit-addr'];
          if (options['datasets-addr']) libp2p[IPFS_DATASETS_SERVER.name] = options['datasets-addr'];
          if (options['accelerate-addr']) libp2p[IPFS_ACCELERATE_SERVER.name] = options['accelerate-addr'];
          if (options.multiaddr) {
            connectorOpts = { libp2p: options.multiaddr };
          } else if (Object.keys(libp2p).length > 0) {
            connectorOpts = { libp2p };
          } else {
            return { error: 'transport=libp2p requires --multiaddr or a per-server --<name>-addr multiaddr' };
          }
        }
        const connector = connectorOpts ? resetConnector(connectorOpts) : getConnector();
        const results = await connector.connectAll();
        const lines: string[] = [`MCP++ Server Connection Results (transport: ${mcpppConnectorTransport}):`];
        for (const [name, result] of results) {
          lines.push(`  ${result.success ? '✅' : '❌'} ${name}`);
          if (result.success) {
            const c = connector.getConnector(name);
            lines.push(`     Transport: ${c?.transportKind ?? mcpppConnectorTransport} (${c?.endpoint ?? ''})`);
            lines.push(`     Profiles: ${result.profiles.join(', ')}`);
            // result.tools is the raw tools/list surface (includes the 4
            // hierarchical facade meta-tools); report the true callable count.
            const toolTotal = await mcpppToolTotal(result.tools, c);
            lines.push(`     Tools: ${toolTotal} available`);
          }
        }
        return { output: lines.join('\n') };
      }

      case 'categories': {
        const connector = getConnector();
        const serverName = options.server || IPFS_KIT_SERVER.name;
        const c = connector.getConnector(serverName);
        if (!c || !c.isConnected) {
          return { error: `Server not connected: ${serverName}. Run: mcp++ connect` };
        }
        try {
          if (options.category) {
            const tools = await c.listToolsInCategory(options.category);
            return { output: `Tools in '${options.category}' on ${serverName}:\n${JSON.stringify(tools, null, 2)}` };
          }
          const cats = await c.listCategories(true);
          return { output: `Tool categories on ${serverName}:\n${JSON.stringify(cats, null, 2)}` };
        } catch (e: any) {
          return { error: `categories failed: ${e.message}` };
        }
      }

      case 'status': {
        const connector = getConnector();
        const connected = connector.connectedServers;
        // WASM prover health (T-42)
        let proverLines: string[] = [];
        try {
          const hub = await WasmProverHub.getInstance();
          const ps = hub.proverStatus();
          const cs = hub.cacheStats();
          proverLines = [
            '',
            'Local WASM provers:',
            `  z3-wasm:    ${ps.z3_wasm    ? '\u2705 loaded' : '\u274c not loaded (z3-solver npm required)'}`,
            `  cvc5-wasm:  ${ps.cvc5_wasm  ? '\u2705 loaded (Z3 SMT-LIB2 shim)' : '\u274c not loaded'}`,
            `  coq-jscoq:  ${ps.coq_jscoq  ? '\u2705 loaded' : '\u274c not loaded (coqc required)'}`,
            `  lean4-wasm: ${ps.lean4_wasm ? '\u2705 loaded' : '\u274c not loaded (lean/lake required)'}`,
            `  lurk-wasm:  ${ps.lurk_wasm  ? '\u2705 loaded' : '\u274c not loaded (Phase 6 \u2014 build lurk-beta WASM)'}`,
            `  neural:     ${(ps as Record<string, unknown>).neural ? '\u2705 loaded' : '\u274c not loaded (provide neuralConnector option)'}`,
            `  Proof cache: ${cs.size} entries, ${cs.hits} hits, ${cs.misses} misses (${cs.time_saved_ms}ms saved)`,
          ];
        } catch {
          proverLines = ['', 'Local WASM provers: unavailable (hub not initialized)'];
        }
        return {
          output: [
            'MCP++ Connection Status:',
            `  Transport: ${mcpppConnectorTransport}`,
            `  Connected servers: ${connected.length > 0 ? connected.join(', ') : 'None (run: mcp++ connect)'}`,
            `  ipfs_kit_py: ${IPFS_KIT_SERVER.baseUrl} (port 8014) | p2p ${IPFS_KIT_SERVER.p2pProtocolId}`,
            `  ipfs_datasets_py: ${IPFS_DATASETS_SERVER.baseUrl} (port 3002) | p2p ${IPFS_DATASETS_SERVER.p2pProtocolId}`,
            `  ipfs_accelerate_py: ${IPFS_ACCELERATE_SERVER.baseUrl} (port 3003) | p2p ${IPFS_ACCELERATE_SERVER.p2pProtocolId}`,
            '',
            'Server capabilities:',
            '  ipfs_kit_py: hierarchical tools, MCP+p2p (/mcp+p2p/1.0.0)',
            '  ipfs_datasets_py: MCP-IDL, CID-Envelope, UCAN, Deontic Policy, Event DAG, P2P',
            '  ipfs_accelerate_py: Trio-native MCP++, P2P taskqueue, workflow tools',
            '',
            'Connect over libp2p: mcp++ connect --transport libp2p --multiaddr <addr>',
            ...proverLines,
          ].join('\n'),
        };
      }

      case 'conformance': {
        // Show the MCP++ Profile A-E conformance status inline.
        // All statuses reflect the swissknife implementation state as of the
        // last conformance-matrix update.
        const profiles = [
          { profile: 'A', area: 'MCP-IDL interface contracts',            status: 'PASS' },
          { profile: 'B', area: 'CID-native envelopes & receipts',        status: 'PASS' },
          { profile: 'C', area: 'UCAN capability delegation',             status: 'PASS' },
          { profile: 'D', area: 'Temporal deontic policy',                status: 'PASS' },
          { profile: 'E', area: 'P2P transport/session',                  status: 'PASS' },
        ];
        const pass  = profiles.filter(p => p.status === 'PASS').length;
        const partial = profiles.filter(p => p.status === 'PARTIAL').length;
        const gap   = profiles.filter(p => p.status === 'GAP').length;

        // WASM prover capabilities (T-30)
        let proverStatusLine = 'unavailable';
        let proverDetail: string[] = [];
        try {
          const hub = await WasmProverHub.getInstance();
          const ps = hub.proverStatus();
          const loaded = Object.entries(ps)
            .filter(([, v]) => v === true)
            .map(([k]) => k);
          proverStatusLine = loaded.length > 0
            ? `${loaded.length} loaded (${loaded.join(', ')})`
            : 'none loaded';
          proverDetail = [
            '  Local WASM provers (formal-logic pre-check before Python TDFOL):',
            `    z3-wasm:    ${ps.z3_wasm    ? '✅' : '❌'}  (npm: z3-solver)`,
            `    cvc5-wasm:  ${ps.cvc5_wasm  ? '✅' : '❌'}  (Z3 SMT-LIB2 shim / native when available)`,
            `    coq-jscoq:  ${ps.coq_jscoq  ? '✅' : '❌'}  (coqc subprocess)`,
            `    lean4-wasm: ${ps.lean4_wasm ? '✅' : '❌'}  (lean/lake subprocess)`,
            `    lurk-wasm:  ${ps.lurk_wasm  ? '✅' : '❌'}  (Phase 6 — build lurk-beta WASM first)`,
            `    neural:     ${(ps as Record<string, unknown>).neural     ? '✅' : '❌'}  (LLM sketch + Lean4/Coq local verify)`,
          ];
        } catch {
          proverDetail = ['  Local WASM provers: unavailable'];
        }

        const lines = [
          '=== MCP++ Conformance Status ===',
          '',
          ...profiles.map(p => {
            const icon = p.status === 'PASS' ? '\u2705' : p.status === 'PARTIAL' ? '\u26a0\ufe0f' : '\u274c';
            return `  ${icon}  Profile ${p.profile} — ${p.area}  [${p.status}]`;
          }),
          '',
          `Summary: ${pass}/5 PASS, ${partial} PARTIAL, ${gap} GAP`,
          '',
          'Key implementations:',
          '  Profile A: mcp-idl.ts (InterfaceRepository, CID canonicalisation)',
          '  Profile B: mcp-envelope.ts (ExecutionEnvelope, ExecutionReceipt)',
          '  Profile C: ucan-auth.ts + delegation-manager.ts (UCAN lifecycle)',
          '  Profile D: mcp-policy.ts + mcp-deontic-interface-broker.ts +',
          '             policy-audit-log.ts + compliance-checker.ts',
          '  Profile E: mcp-p2p-session.ts + mcp-pubsub-bus.ts',
          '             (framing, state machine, error codes, backoff,',
          '              capability negotiation, PubSubBus)',
          '',
          `Provers: ${proverStatusLine}`,
          ...proverDetail,
          '',
          'Full details: docs/mcp-plus-plus/CONFORMANCE_MATRIX.md',
        ];
        return { output: lines.join('\n') };
      }

      case 'call': {
        if (!options.tool) {
          return { error: 'Usage: mcp++ call --server <name> --tool <tool> --args <json>' };
        }
        const connector = getConnector();
        const serverName = options.server || 'ipfs-datasets-mcp++';
        const toolArgs = options.args ? JSON.parse(options.args) : {};
        
        try {
          const { result, envelope } = await connector.callToolWithEnvelope(serverName, options.tool, toolArgs);
          return {
            output: [
              `Tool call: ${options.tool} on ${serverName}`,
              envelope.envelope_cid ? `Envelope CID: ${envelope.envelope_cid}` : '',
              envelope.event_cid ? `Event CID: ${envelope.event_cid}` : '',
              `Result: ${JSON.stringify(result).slice(0, 500)}`,
            ].filter(Boolean).join('\n'),
          };
        } catch (e: any) {
          return { error: `Call failed: ${e.message}` };
        }
      }

      case 'provers': {
        // Detailed WASM prover management and diagnostics
        const action = args[1] ?? 'status';
        if (action === 'build-lurk') {
          const { lurkBetaBuildInstructions } = await import('../services/provers/lurk-wasm-bridge.js');
          return { output: lurkBetaBuildInstructions() };
        }
        if (action === 'build-ix') {
          const { ixBuildInstructions } = await import('../services/provers/lean4-wasm-bridge.js');
          return { output: ixBuildInstructions() };
        }

        // Default: show full prover status and installation guide
        let hubInfo: string[] = [];
        try {
          const hub = await WasmProverHub.getInstance();
          const ps = hub.proverStatus();
          const cs = hub.cacheStats();
          hubInfo = [
            '=== WASM Prover Stack ===',
            '',
            'Local prover backends (checked before Python TDFOL remote engine):',
            '',
            `  z3-wasm    ${ps.z3_wasm    ? '\u2705 loaded (lazy, ~34 MB on first proof)' : '\u274c not loaded'}`,
            `             Install: npm install z3-solver (in swissknife)`,
            '',
            `  cvc5-wasm  ${ps.cvc5_wasm  ? '\u2705 loaded (Z3 SMT-LIB2 shim)' : '\u274c not loaded'}`,
            `             Status: Uses Z3 as SMT-LIB2 compatibility shim`,
            '',
            `  coq-jscoq  ${ps.coq_jscoq  ? '\u2705 loaded' : '\u274c not loaded'}`,
            `             Install: opam install coq (then coqc must be in PATH)`,
            '',
            `  lean4-wasm ${ps.lean4_wasm ? '\u2705 loaded' : '\u274c not loaded'}`,
            `             Install: https://leanprover.github.io/lean4/doc/setup.html`,
            '',
            `  lurk-wasm  ${ps.lurk_wasm  ? '\u2705 loaded' : '\u274c not loaded (Phase 6 \u2014 build from source)'}`,
            `             Build:   mcp++ provers build-lurk`,
            '',
            `  neural     ${(ps as Record<string, unknown>).neural ? '\u2705 loaded' : '\u274c not loaded (provide neuralConnector)'}`,
            `             Enable:  WasmProverHub.create({ neuralConnector: connector })`,
            '',
            `  ix-backed  \u274c not loaded (Phase 7b \u2014 requires ix + SP1/Zisk)`,
            `             Build:   mcp++ provers build-ix`,
            '',
            'Proof cache:',
            `  Size: ${cs.size} entries | Hits: ${cs.hits} | Misses: ${cs.misses}`,
            `  Time saved: ${cs.time_saved_ms}ms | Evictions: ${cs.evictions}`,
            '',
            'Subcommands:',
            '  mcp++ provers           — this overview',
            '  mcp++ provers build-lurk — lurk-beta WASM build instructions',
            '  mcp++ provers build-ix   — ix CLI + SP1 build instructions',
          ];
        } catch {
          hubInfo = ['WASM prover hub unavailable'];
        }
        return { output: hubInfo.join('\n') };
      }

      default:
        return { error: `Unknown subcommand: ${subcommand}. Available: interfaces, execute, dag, delegate, policy, profiles, p2p, connect, categories, status, call, conformance, provers` };
    }
  },
};

export default [mcpppCommand];
