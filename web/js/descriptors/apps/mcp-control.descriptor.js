import {
    APP_CAPABILITY_CONTRACT_VERSION,
    AppCapabilityLifecycle
} from '../contracts/app-capability-contract.js';

export const mcpControlDescriptor = {
    contractVersion: APP_CAPABILITY_CONTRACT_VERSION,
    lifecycle: AppCapabilityLifecycle,
    compatibilityPolicy: {
        semver: true,
        additiveMinorOnly: true,
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
            operations: ['list_servers', 'inspect_server', 'restart_server'],
            streams: ['server_health', 'connection_activity']
        },
        {
            name: 'mcp_transport',
            version: '1.0.0',
            endpoint: 'mcp://transport',
            operations: ['list_connections', 'disconnect'],
            streams: ['transport_events']
        }
    ],
    ui: {
        template: 'dashboard',
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
            service: { fields: ['id', 'name', 'status', 'version'] },
            connection: { fields: ['id', 'status', 'latencyMs'] }
        },
        provenance: {
            fields: ['correlationId', 'timestamp', 'source']
        }
    },
    permissions: ['mcp:discover', 'mcp:invoke', 'mcp:stream'],
    stateModel: {
        conflictPolicy: 'last-write-wins'
    },
    actions: {
        refreshServices: {
            service: 'mcp_registry',
            operation: 'list_servers'
        },
        openMetrics: {
            service: 'mcp_transport',
            operation: 'list_connections'
        }
    }
};

