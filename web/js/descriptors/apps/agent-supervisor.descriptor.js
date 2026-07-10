import {
    APP_CAPABILITY_CONTRACT_VERSION,
    AppCapabilityLifecycle
} from '../contracts/app-capability-contract.js';

export const agentSupervisorDescriptor = {
    contractVersion: APP_CAPABILITY_CONTRACT_VERSION,
    lifecycle: AppCapabilityLifecycle,
    compatibilityPolicy: {
        semver: true,
        allowMinorAdditiveOnly: true,
        deprecationsRequired: true
    },
    meta: {
        id: 'agent-supervisor',
        name: 'Agent Supervisor',
        version: '0.1.0',
        description: 'Browser-safe supervisor console for goals, queue state, health, receipts, and governed control requests.'
    },
    services: [
        {
            name: 'agent_supervisor_state',
            version: '0.1.0',
            endpoint: 'mcp++://ipfs_accelerate_py/agent-supervisor',
            operations: [
                'agent_supervisor.health.read',
                'agent_supervisor.queue.read',
                'agent_supervisor.goals.read',
                'agent_supervisor.subgoals.read',
                'agent_supervisor.logs.read'
            ],
            streams: ['agent_supervisor.queue.changed', 'agent_supervisor.health.changed']
        },
        {
            name: 'agent_supervisor_indexes',
            version: '0.1.0',
            endpoint: 'mcp++://ipfs_datasets_py/agent-supervisor-indexes',
            operations: [
                'agent_supervisor.taskboard.links.read',
                'agent_supervisor.run_history.search'
            ],
            streams: ['agent_supervisor.index.changed']
        },
        {
            name: 'agent_supervisor_receipts',
            version: '0.1.0',
            endpoint: 'mcp++://ipfs_kit_py/agent-supervisor-receipts',
            operations: ['agent_supervisor.receipts.read'],
            streams: ['agent_supervisor.receipt.persisted']
        }
    ],
    ui: {
        template: 'supervisor-console',
        template_candidates: ['supervisor-console', 'dashboard'],
        window: {
            title: 'Agent Supervisor',
            icon: 'AS',
            singleton: true
        },
        regions: [
            { name: 'Goals Tree', description: 'Goal and subgoal hierarchy with queue bindings' },
            { name: 'Taskboard Queue', description: 'Taskboard-linked queue with active task selection' },
            { name: 'Receipts and Health', description: 'Immutable receipt references plus server, MCP++, and libp2p health' },
            { name: 'Contract Links', description: 'Compact links to the application and backend gateway contract' }
        ],
        commands: [
            { action: 'refreshSupervisor', label: 'Refresh' },
            { action: 'openContract', label: 'Contract' },
            { action: 'openReceipts', label: 'Receipts' }
        ]
    },
    dataContracts: {
        entities: {
            goal: { fields: ['goal_id', 'title', 'status', 'subgoal_ids', 'task_ids', 'taskboard_url', 'receipt'] },
            subgoal: { fields: ['subgoal_id', 'goal_id', 'title', 'status', 'task_ids', 'taskboard_url', 'receipt'] },
            queue_item: { fields: ['task_id', 'title', 'status', 'goal_id', 'subgoal_id', 'dependencies', 'taskboard_url', 'receipt'] },
            receipt: { fields: ['receipt_id', 'cid', 'owner', 'created_at'] },
            health: { fields: ['status', 'active_goal_count', 'queued_task_count', 'running_task_count', 'backends'] }
        },
        provenance: {
            fields: ['correlation_id', 'receipt_id', 'owner', 'capability_id', 'policy_class']
        }
    },
    permissions: [
        'supervisor:read',
        'supervisor:receipt:read',
        'supervisor:index:read',
        'supervisor:governed-request:draft'
    ],
    stateModel: {
        conflictPolicy: 'server-authoritative-with-cached-index-fallback'
    },
    actions: {
        refreshSupervisor: {
            service: 'agent_supervisor_state',
            operation: 'agent_supervisor.health.read'
        },
        openContract: {
            service: 'agent_supervisor_state',
            operation: 'agent_supervisor.goals.read'
        },
        openReceipts: {
            service: 'agent_supervisor_receipts',
            operation: 'agent_supervisor.receipts.read'
        }
    }
};
