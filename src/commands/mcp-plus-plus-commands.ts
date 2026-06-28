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
 */

import type { Command as PublicCommand } from '../types/command.js';
import { createMCPPlusPlusClient, IPFS_KIT_INTERFACE, IPFS_ACCELERATE_INTERFACE, IPFS_DATASETS_INTERFACE } from '../services/mcp-plus-plus.js';

// Singleton client initialized with placeholder DID (replaced at runtime)
let mcpppClient: ReturnType<typeof createMCPPlusPlusClient> | null = null;

function getClient(): ReturnType<typeof createMCPPlusPlusClient> {
  if (!mcpppClient) {
    mcpppClient = createMCPPlusPlusClient('did:key:z6MkswissknifeCLI');
  }
  return mcpppClient;
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

      default:
        return { error: `Unknown subcommand: ${subcommand}. Available: interfaces, execute, dag, delegate, policy, profiles, p2p` };
    }
  },
};

export default [mcpppCommand];
