import {
    APP_CAPABILITY_CONTRACT_VERSION,
    AppCapabilityLifecycle
} from '../contracts/app-capability-contract.js';

export const ipfsExplorerDescriptor = {
    contractVersion: APP_CAPABILITY_CONTRACT_VERSION,
    lifecycle: AppCapabilityLifecycle,
    compatibilityPolicy: {
        semver: true,
        allowMinorAdditiveOnly: true,
        deprecationsRequired: true
    },
    meta: {
        id: 'ipfs-explorer',
        name: 'IPFS Explorer',
        version: '1.0.0',
        description: 'Descriptor-driven explorer for datasets, content retrieval, pinning, and publish workflows.'
    },
    services: [
        {
            name: 'ipfs_datasets',
            version: '1.0.0',
            endpoint: 'mcp://ipfs-datasets',
            operations: ['browse_datasets', 'get_dataset', 'index_dataset', 'pin_content', 'publish_content'],
            streams: ['dataset_index_progress', 'dataset_sync_events']
        },
        {
            name: 'ipfs_accelerate',
            version: '1.0.0',
            endpoint: 'mcp://ipfs-accelerate',
            operations: ['hardware_profile', 'run_inference_job', 'job_status'],
            streams: ['job_progress', 'hardware_telemetry']
        }
    ],
    ui: {
        template: 'explorer',
        window: {
            title: 'IPFS Explorer',
            icon: '🌐',
            singleton: true
        },
        regions: [
            { name: 'Datasets', description: 'Dataset catalog and metadata inspection' },
            { name: 'Pinned Content', description: 'CID pin status and publish actions' },
            { name: 'Inference Jobs', description: 'Model acceleration and job progress' }
        ],
        commands: [
            { action: 'browseDatasets', label: 'Browse Datasets' },
            { action: 'pinSelection', label: 'Pin Selection' },
            { action: 'startJob', label: 'Start Inference Job' }
        ]
    },
    dataContracts: {
        entities: {
            dataset: { fields: ['id', 'name', 'cid', 'size', 'createdAt'] },
            task: { fields: ['id', 'status', 'progress', 'worker'] },
            result: { fields: ['id', 'taskId', 'artifactCid', 'completedAt'] }
        },
        provenance: {
            fields: ['correlationId', 'timestamp', 'source', 'cid']
        }
    },
    permissions: ['ipfs:read', 'ipfs:pin', 'ipfs:publish', 'inference:run'],
    stateModel: {
        conflictPolicy: 'remote-authoritative'
    },
    actions: {
        browseDatasets: {
            service: 'ipfs_datasets',
            operation: 'browse_datasets'
        },
        pinSelection: {
            service: 'ipfs_datasets',
            operation: 'pin_content'
        },
        startJob: {
            service: 'ipfs_accelerate',
            operation: 'run_inference_job'
        }
    }
};
