import {
    APP_CAPABILITY_CONTRACT_VERSION,
    AppCapabilityLifecycle
} from '../contracts/app-capability-contract.js';

export const mcpControlDescriptor = {
    contractVersion: APP_CAPABILITY_CONTRACT_VERSION,
    lifecycle: AppCapabilityLifecycle,
    compatibilityPolicy: {
        semver: true,
        allowMinorAdditiveOnly: true,
        deprecationsRequired: true
    },
    meta: {
        id: 'mcp-control',
        name: 'MCP Control',
        version: '1.0.0',
        description: 'Descriptor-driven control center for MCP service discovery and operations.'
    },
    services: [
        {
            name: 'mcp_registry',
            version: '1.0.0',
            endpoint: 'mcp://registry',
            operations: ['interfaces/list', 'interfaces/get', 'interfaces/compat'],
            streams: ['notifications/tools/list_changed', 'notifications/resources/list_changed']
        },
        {
            name: 'mcp_transport',
            version: '1.0.0',
            endpoint: 'mcp://transport',
            operations: ['capabilities/list', 'tools/list', 'ping'],
            streams: ['notifications/progress']
        }
    ],
    ui: {
        template: 'dashboard',
        template_candidates: ['dashboard', 'explorer'],
        window: {
            title: 'MCP Control',
            icon: '🔌',
            singleton: true
        },
        regions: [
            { name: 'Service Overview', description: 'Status of local and remote MCP services' },
            { name: 'Connection Health', description: 'Current transport health and retry posture' },
            { name: 'Audit Trail', description: 'Correlated service events and operations' }
        ],
        commands: [
            { action: 'refreshServices', label: 'Refresh Services' },
            { action: 'openMetrics', label: 'Open Metrics' }
        ]
    },
    dataContracts: {
        entities: {
            service: { fields: ['id', 'name', 'status', 'version', 'interface_cid'] },
            connection: { fields: ['id', 'status', 'latency_ms', 'peer_did'] }
        },
        provenance: {
            fields: ['correlation_id', 'event_cid', 'decision_cid', 'source']
        }
    },
    permissions: ['mcp:discover', 'mcp:invoke', 'mcp:stream'],
    stateModel: {
        conflictPolicy: 'last-write-wins'
    },
    actions: {
        refreshServices: {
            service: 'mcp_registry',
            operation: 'interfaces/list'
        },
        openMetrics: {
            service: 'mcp_transport',
            operation: 'capabilities/list'
        }
    }
};
