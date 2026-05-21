const DEFAULT_TEMPLATE = 'dashboard';
const INFERENCE_OPERATIONS = Object.freeze(['run_inference_job', 'job_status']);
const INFERENCE_STREAMS = Object.freeze(['job_progress', 'hardware_telemetry']);
const EXPLORER_OPERATIONS = Object.freeze([
    'browse_datasets',
    'get_dataset',
    'index_dataset',
    'pin_content',
    'publish_content'
]);
const EXPLORER_STREAMS = Object.freeze(['dataset_index_progress', 'dataset_sync_events']);

function collectCapabilities(descriptor = {}) {
    const services = Array.isArray(descriptor.services) ? descriptor.services : [];
    const operations = services.flatMap((service) => service?.operations || []);
    const streams = services.flatMap((service) => service?.streams || []);
    const actions = Object.values(descriptor.actions || {});

    return {
        operations,
        streams,
        actions,
        serviceCount: services.length
    };
}

function hasAny(values, probes) {
    return probes.some((probe) => values.includes(probe));
}

export function resolveDescriptorTemplate(descriptor = {}) {
    const explicitTemplate = descriptor?.ui?.template;
    const generationPolicy = descriptor?.ui?.generation_policy || {};
    const inferTemplate = explicitTemplate === 'auto' || generationPolicy.mode === 'capability_inferred';

    if (!inferTemplate && explicitTemplate) {
        return {
            template: explicitTemplate,
            reason: 'explicit_template'
        };
    }

    const capabilities = collectCapabilities(descriptor);
    const hasInferenceOperations = hasAny(capabilities.operations, INFERENCE_OPERATIONS);
    const hasExplorerOperations = hasAny(capabilities.operations, EXPLORER_OPERATIONS);
    const hasInferenceStreams = hasAny(capabilities.streams, INFERENCE_STREAMS);
    const hasExplorerStreams = hasAny(capabilities.streams, EXPLORER_STREAMS);

    if (hasInferenceOperations) {
        return {
            template: 'job-console',
            reason: hasInferenceStreams ? 'inference_or_progress_stream_detected' : 'inference_capabilities_detected'
        };
    }

    if (hasExplorerOperations) {
        return {
            template: 'explorer',
            reason: hasExplorerStreams ? 'content_exploration_capabilities_detected' : 'content_exploration_operations_detected'
        };
    }

    if (capabilities.actions.some((action) => action?.payload_schema)) {
        return {
            template: 'form-wizard',
            reason: 'schema_driven_actions_detected'
        };
    }

    if (capabilities.serviceCount > 1) {
        return {
            template: 'dashboard',
            reason: 'multi_service_descriptor'
        };
    }

    return {
        template: explicitTemplate || DEFAULT_TEMPLATE,
        reason: explicitTemplate ? 'explicit_template' : 'default_fallback'
    };
}
