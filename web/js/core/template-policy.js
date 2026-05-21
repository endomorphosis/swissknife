const DEFAULT_TEMPLATE = 'dashboard';

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

    if (
        hasAny(capabilities.operations, ['run_inference_job', 'job_status']) ||
        hasAny(capabilities.streams, ['job_progress', 'hardware_telemetry'])
    ) {
        return {
            template: 'job-console',
            reason: 'inference_or_progress_stream_detected'
        };
    }

    if (
        hasAny(capabilities.operations, ['browse_datasets', 'get_dataset', 'index_dataset', 'pin_content', 'publish_content']) ||
        hasAny(capabilities.streams, ['dataset_index_progress', 'dataset_sync_events', 'notifications/resources/list_changed'])
    ) {
        return {
            template: 'explorer',
            reason: 'content_exploration_capabilities_detected'
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
