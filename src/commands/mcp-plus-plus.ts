/**
 * MCP++ CLI Sub-commands
 *
 * Adds `swissknife mcp p2p connect <multiaddr>`,
 *      `swissknife mcp idl list`,
 *      `swissknife mcp receipts [--output-cid <cid>]`
 * as a LocalCommand that the existing `mcp` command registry can import.
 */

import type { LocalCommand } from '../types/command.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { InterfaceRepository } from '../services/mcp-idl.js';
import { EventDAG } from '../services/event-dag.js';
import chalk from 'chalk';

/** Number of CID characters to display in listings (truncated for readability). */
const CID_DISPLAY_LENGTH = 20;

// ---------------------------------------------------------------------------
// `mcp-plus-plus` top-level command with sub-commands
// ---------------------------------------------------------------------------

const mcpPlusPlusCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-plus-plus',
  description: 'MCP++ peer-to-peer, UCAN auth, CID-envelopes, and policy features',
  isEnabled: true,
  isHidden: false,
  options: [
    {
      name: 'subcommand',
      type: 'string',
      description: 'Sub-command: p2p|idl|receipts|config',
      required: false,
    },
    {
      name: 'action',
      type: 'string',
      description: 'Action under sub-command (e.g. connect, list)',
      required: false,
    },
    {
      name: 'arg',
      type: 'string',
      description: 'Positional argument (e.g. multiaddr, interface-cid)',
      required: false,
    },
    {
      name: 'output-cid',
      type: 'string',
      description: 'Filter receipts by output CID',
      required: false,
    },
  ],

  async handler(args) {
    const sub = String(args['subcommand'] ?? '').toLowerCase();
    const action = String(args['action'] ?? '').toLowerCase();

    // ------------------------------------------------------------------
    // mcp-plus-plus p2p connect <multiaddr>
    // ------------------------------------------------------------------
    if (sub === 'p2p') {
      if (action === 'connect') {
        const multiaddr = String(args['arg'] ?? '');
        if (!multiaddr) {
          return chalk.red('Usage: mcp-plus-plus p2p connect <multiaddr>');
        }
        try {
          const { MCPTransportFactory } = await import('../services/mcp/mcp-transport.js');
          const transport = MCPTransportFactory.create({
            type: 'libp2p',
            endpoint: multiaddr,
          });
          const connected = await transport.connect();
          if (connected) {
            return chalk.green(`✓ Connected to ${multiaddr}`);
          } else {
            return chalk.red(`✗ Failed to connect to ${multiaddr}`);
          }
        } catch (err) {
          return chalk.red(
            `Error connecting: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return `Usage: mcp-plus-plus p2p connect <multiaddr>`;
    }

    // ------------------------------------------------------------------
    // mcp-plus-plus idl list
    // ------------------------------------------------------------------
    if (sub === 'idl') {
      if (action === 'list' || action === '') {
        const repo = InterfaceRepository.getInstance();
        const cids = repo.list();
        if (cids.length === 0) {
          return 'No Interface Descriptors registered.';
        }
        const lines = cids.map(cid => {
          const desc = repo.getDescriptor(cid);
          const label = desc ? `${desc.name}@${desc.version} (${desc.namespace})` : '<unknown>';
          return `  ${chalk.cyan(cid.slice(0, CID_DISPLAY_LENGTH) + '…')}  ${label}`;
        });
        return ['Interface Descriptors:', ...lines].join('\n');
      }
      if (action === 'get') {
        const cid = String(args['arg'] ?? '');
        const repo = InterfaceRepository.getInstance();
        const bytes = repo.get(cid);
        if (!bytes) return chalk.red(`Interface not found: ${cid}`);
        return bytes.toString('utf8');
      }
      if (action === 'compat') {
        const cid = String(args['arg'] ?? '');
        const repo = InterfaceRepository.getInstance();
        const verdict = repo.compat(cid);
        const icon = verdict.compatible ? chalk.green('✓ compatible') : chalk.red('✗ incompatible');
        const lines = [icon];
        if (verdict.reasons.length > 0) {
          lines.push('Reasons: ' + verdict.reasons.join(', '));
        }
        if (verdict.requiresMissing.length > 0) {
          lines.push('Missing: ' + verdict.requiresMissing.join(', '));
        }
        if (verdict.suggestedAlternatives.length > 0) {
          lines.push('Alternatives: ' + verdict.suggestedAlternatives.join(', '));
        }
        return lines.join('\n');
      }
      return 'Usage: mcp-plus-plus idl list|get <cid>|compat <cid>';
    }

    // ------------------------------------------------------------------
    // mcp-plus-plus receipts [--output-cid <cid>]
    // ------------------------------------------------------------------
    if (sub === 'receipts') {
      const outputCidFilter = args['output-cid'] as string | undefined;
      const dag = EventDAG.getInstance();

      let nodes;
      if (outputCidFilter) {
        nodes = dag.getProvenance(outputCidFilter);
      } else {
        nodes = dag.getTips();
      }

      if (nodes.length === 0) {
        return 'No execution history found.';
      }

      const lines = nodes.map(n => {
        const outputs = n.outputs.join(', ') || 'none';
        return [
          `  Event: ${chalk.cyan(n.cid.slice(0, CID_DISPLAY_LENGTH) + '…')}`,
          `    Interface: ${n.interface_cid.slice(0, 20)}…`,
          `    Outputs:   ${outputs}`,
          `    Timestamp: ${n.timestamp}`,
        ].join('\n');
      });

      const header = outputCidFilter
        ? `Provenance for output ${outputCidFilter.slice(0, 20)}…:`
        : 'Recent execution events:';
      return [header, ...lines].join('\n');
    }

    // ------------------------------------------------------------------
    // mcp-plus-plus config [enable|disable] [feature]
    // ------------------------------------------------------------------
    if (sub === 'config') {
      const feature = String(args['arg'] ?? '');
      const enable = action === 'enable';
      const disable = action === 'disable';

      if ((enable || disable) && feature) {
        const validFeatures = [
          'enableP2P', 'enableUCAN', 'enableIDL', 'enableCIDEnvelopes',
          'enableEventDAG', 'enablePolicyEval', 'enablePubSub',
        ] as const;
        if (!validFeatures.includes(feature as typeof validFeatures[number])) {
          return chalk.red(
            `Unknown feature: ${feature}. Valid: ${validFeatures.join(', ')}`,
          );
        }
        const config = getGlobalConfig();
        config.mcpPlusPlus = {
          ...(config.mcpPlusPlus ?? {}),
          [feature]: enable,
        };
        saveGlobalConfig(config);
        return chalk.green(
          `MCP++ feature '${feature}' ${enable ? 'enabled' : 'disabled'}.`,
        );
      }

      // Show current config
      const config = getGlobalConfig();
      const pp = config.mcpPlusPlus ?? {};
      const featureList = [
        ['enableP2P',          pp.enableP2P],
        ['enableUCAN',         pp.enableUCAN],
        ['enableIDL',          pp.enableIDL],
        ['enableCIDEnvelopes', pp.enableCIDEnvelopes],
        ['enableEventDAG',     pp.enableEventDAG],
        ['enablePolicyEval',   pp.enablePolicyEval],
        ['enablePubSub',       pp.enablePubSub],
      ];
      const lines = featureList.map(([name, val]) => {
        const icon = val ? chalk.green('✓') : chalk.gray('○');
        return `  ${icon}  ${name}`;
      });
      return ['MCP++ Feature Flags:', ...lines].join('\n');
    }

    // ------------------------------------------------------------------
    // Default: show help
    // ------------------------------------------------------------------
    return [
      'MCP++ Integration Commands:',
      '',
      '  mcp-plus-plus p2p connect <multiaddr>',
      '    Dial a remote MCP++ peer via libp2p',
      '',
      '  mcp-plus-plus idl list',
      '  mcp-plus-plus idl get <interface-cid>',
      '  mcp-plus-plus idl compat <interface-cid>',
      '    Manage CID-addressed Interface Descriptors (MCP-IDL)',
      '',
      '  mcp-plus-plus receipts [--output-cid <cid>]',
      '    Show execution history / provenance for an output CID',
      '',
      '  mcp-plus-plus config',
      '  mcp-plus-plus config enable|disable <feature>',
      '    Manage MCP++ feature flags',
    ].join('\n');
  },

  userFacingName() {
    return 'mcp-plus-plus';
  },
};

export default mcpPlusPlusCommand;
