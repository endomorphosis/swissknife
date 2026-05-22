const PROFILE = 'swissknife.mcp++/ui-profile';

export function inspectDescriptor(descriptor, options = {}) {
    const validation = validateDescriptor(descriptor);
    const template = selectTemplate(descriptor, validation);
    const granted = new Set(options.granted_capabilities || []);
    const policyDecisions = options.policy_decisions || {};
    const operations = (descriptor.data_contracts?.operations || []).map(operation => ({
        method: operation.method,
        title: operation.title || humanize(operation.method),
        input_fields: schemaFields(operation.input_schema),
        output_fields: schemaFields(operation.output_schema),
        stream_kind: operation.stream?.kind || 'none',
        permissions: descriptor.permissions?.operations?.[operation.method] || [],
    }));
    return {
        name: descriptor.name,
        app_id: descriptor.meta?.app_id,
        title: descriptor.meta?.title,
        namespace: descriptor.namespace,
        version: descriptor.version,
        services: descriptor.services || [],
        template,
        template_mappings: descriptor.ui?.templates || [],
        operations,
        permissions: descriptor.permissions || { operations: {} },
        state_model: descriptor.state_model || { keys: [], events: [] },
        workflow_graph: descriptor.workflow_graph,
        policy_decisions: policyDecisions,
        ui_mapping: inspectUIMapping(descriptor, operations, granted, policyDecisions),
        validation,
    };
}

export function inspectReplayLog(replayLog = [], options = {}) {
    const first = replayLog[0] || {};
    const appId = options.app_id || first.app_id || 'generated-mcp-app';
    const appInstanceId = options.app_instance_id || first.app_instance_id || 'unknown-instance';
    const sorted = [...replayLog].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    const commands = new Set();
    const workflows = new Set();
    const artifacts = new Set();
    let streamEvents = 0;
    let staleStreamEvents = 0;
    let auditEntries = 0;
    for (const event of sorted) {
        const payload = event.payload || {};
        if (payload.correlation_id && (event.type === 'command.dispatched' || event.type === 'command.resolved')) {
            commands.add(payload.correlation_id);
            auditEntries += 1;
        }
        if (event.type === 'stream.event') {
            streamEvents += 1;
            auditEntries += 1;
            collectArtifactCids(payload.event?.event, artifacts);
        }
        if (event.type === 'stream.stale_rejected') {
            staleStreamEvents += 1;
            auditEntries += 1;
        }
        if (event.type === 'workflow.step.completed') {
            workflows.add(payload.workflow_id || 'default');
            auditEntries += 1;
            collectArtifactCids(payload.output, artifacts);
        }
        collectArtifactCids(payload.output, artifacts);
    }
    return {
        app_id: appId,
        app_instance_id: appInstanceId,
        descriptor_name: options.descriptor_name || first.descriptor_name,
        descriptor_version: options.descriptor_version || first.descriptor_version,
        interface_cid: options.interface_cid || first.interface_cid,
        replay_event_count: sorted.length,
        command_count: commands.size,
        stream_event_count: streamEvents,
        stale_stream_event_count: staleStreamEvents,
        audit_entry_count: auditEntries,
        workflow_ids: Array.from(workflows).sort(),
        artifact_cids: Array.from(artifacts).sort(),
    };
}

export function renderDescriptorInspector(descriptorOrInspection, replaySummary) {
    const inspection = descriptorOrInspection.validation && descriptorOrInspection.operations
        ? descriptorOrInspection
        : inspectDescriptor(descriptorOrInspection);
    const replay = replaySummary || inspection.replay;
    return `
        <section class="mcp-descriptor-inspector" data-app-id="${escapeHtml(inspection.app_id || '')}" data-conformant="${inspection.validation.conformant}">
            <header class="mcp-descriptor-inspector__header">
                <h2>${escapeHtml(inspection.title || inspection.name)}</h2>
                <div class="mcp-descriptor-inspector__meta">${escapeHtml(`${inspection.namespace}@${inspection.version}`)}</div>
            </header>
            ${renderValidation(inspection.validation)}
            <section class="mcp-descriptor-inspector__section" data-section="template">
                <h3>Template Mapping</h3>
                <p>${escapeHtml(`${inspection.template.kind}: ${inspection.template.reason}`)}</p>
                ${renderList(inspection.template.required_operations, 'Required operations')}
                ${renderTemplateMappings(inspection.template_mappings)}
            </section>
            <section class="mcp-descriptor-inspector__section" data-section="services">
                <h3>Services</h3>
                ${inspection.services.map(renderService).join('')}
            </section>
            <section class="mcp-descriptor-inspector__section" data-section="operations">
                <h3>Operations</h3>
                ${inspection.operations.map(renderOperation).join('')}
            </section>
            <section class="mcp-descriptor-inspector__section" data-section="permissions">
                <h3>Permissions</h3>
                ${renderPermissions(inspection.permissions)}
            </section>
            ${inspection.ui_mapping ? renderUIMapping(inspection.ui_mapping, inspection.policy_decisions || {}) : ''}
            <section class="mcp-descriptor-inspector__section" data-section="state">
                <h3>State Events</h3>
                ${renderList(inspection.state_model.keys || [], 'State keys')}
                ${renderList(inspection.state_model.events || [], 'Events')}
                ${renderList(inspection.state_model.projections || [], 'Projections')}
            </section>
            ${inspection.workflow_graph ? renderWorkflowGraph(inspection.workflow_graph) : ''}
            ${replay ? renderReplaySummary(replay) : ''}
        </section>
    `;
}

function renderValidation(validation) {
    const issues = [
        ...validation.errors.map(issue => ({ ...issue, level: 'error' })),
        ...validation.warnings.map(issue => ({ ...issue, level: 'warning' })),
    ];
    if (issues.length === 0) {
        return '<section class="mcp-descriptor-inspector__section" data-section="validation"><h3>Validation</h3><p>Descriptor conforms.</p></section>';
    }
    return `
        <section class="mcp-descriptor-inspector__section" data-section="validation">
            <h3>Validation</h3>
            <ol class="mcp-descriptor-inspector__issues">
                ${issues.map(issue => `
                    <li data-level="${escapeHtml(issue.level)}">
                        <strong>${escapeHtml(issue.path)}</strong>
                        <span>${escapeHtml(issue.message)}</span>
                    </li>
                `).join('')}
            </ol>
        </section>
    `;
}

function renderTemplateMappings(mappings) {
    return `
        <div class="mcp-descriptor-inspector__template-list">
            ${mappings.map(mapping => `
                <div class="mcp-descriptor-inspector__template" data-template="${escapeHtml(mapping.kind)}">
                    <strong>${escapeHtml(mapping.title || mapping.kind)}</strong>
                    ${renderList(mapping.operations || [], 'Operations')}
                </div>
            `).join('')}
        </div>
    `;
}

function renderService(service) {
    return `
        <div class="mcp-descriptor-inspector__service" data-service="${escapeHtml(service.id)}">
            <strong>${escapeHtml(service.id)}</strong>
            <span>${escapeHtml(service.interface_type || 'generic')}</span>
            <span>${escapeHtml(service.transport || 'local')}</span>
            ${service.endpoint ? `<code>${escapeHtml(service.endpoint)}</code>` : ''}
            ${renderList(service.operations || [], 'Operations')}
        </div>
    `;
}

function renderOperation(operation) {
    return `
        <details class="mcp-descriptor-inspector__operation" data-operation="${escapeHtml(operation.method)}" open>
            <summary>${escapeHtml(operation.title)} <span>${escapeHtml(operation.stream_kind)}</span></summary>
            ${renderList(operation.input_fields, 'Input schema fields')}
            ${renderList(operation.output_fields, 'Output schema fields')}
            ${renderList(operation.permissions, 'Required permissions')}
        </details>
    `;
}

function renderPermissions(permissions) {
    return Object.entries(permissions.operations || {}).map(([operation, grants]) => `
        <div class="mcp-descriptor-inspector__permission" data-operation="${escapeHtml(operation)}">
            <strong>${escapeHtml(operation)}</strong>
            <span>${escapeHtml((grants || []).join(', ') || 'none')}</span>
        </div>
    `).join('');
}

function renderUIMapping(mapping, policyDecisions) {
    return `
        <section class="mcp-descriptor-inspector__section" data-section="ui-mapping">
            <h3>Generated UI Mapping</h3>
            ${mapping.commands.map(command => `
                <div class="mcp-descriptor-inspector__command" data-operation="${escapeHtml(command.operation)}" data-hidden="${escapeHtml(command.hidden)}">
                    <strong>${escapeHtml(command.command_id)}</strong>
                    ${command.disabled_reason ? `<span>${escapeHtml(command.disabled_reason)}</span>` : ''}
                    ${renderList(command.missing_capabilities || [], 'Missing capabilities')}
                    ${policyDecisions[command.operation] ? `<code>${escapeHtml(policyDecisions[command.operation].outcome)}</code>` : ''}
                </div>
            `).join('')}
            ${renderList(mapping.forms || [], 'Forms')}
            ${renderList(mapping.renderers || [], 'Renderers')}
            ${renderList(mapping.widgets || [], 'Widgets')}
            ${mapping.failures?.length ? `
                <ol class="mcp-descriptor-inspector__issues">
                    ${mapping.failures.map(failure => `
                        <li data-level="error"><strong>${escapeHtml(failure.path)}</strong><span>${escapeHtml(failure.message)}</span></li>
                    `).join('')}
                </ol>
            ` : ''}
        </section>
    `;
}

function renderWorkflowGraph(graph) {
    return `
        <section class="mcp-descriptor-inspector__section" data-section="workflow">
            <h3>Workflow Graph</h3>
            ${renderList(graph.shared_state_keys || [], 'Shared state')}
            <ol>
                ${(graph.steps || []).map(step => `
                    <li data-step="${escapeHtml(step.id)}">
                        <strong>${escapeHtml(step.id)}</strong>
                        <span>${escapeHtml(step.operation)}</span>
                        ${renderList(step.depends_on || [], 'Depends on')}
                    </li>
                `).join('')}
            </ol>
        </section>
    `;
}

function renderReplaySummary(replay) {
    return `
        <section class="mcp-descriptor-inspector__section" data-section="replay">
            <h3>Replay Log</h3>
            <p>${escapeHtml(`${replay.app_id}:${replay.app_instance_id}`)}</p>
            <div class="mcp-descriptor-inspector__replay-counts">
                <span data-field="replay_events">${escapeHtml(replay.replay_event_count)}</span>
                <span data-field="commands">${escapeHtml(replay.command_count)}</span>
                <span data-field="stream_events">${escapeHtml(replay.stream_event_count)}</span>
                <span data-field="stale_stream_events">${escapeHtml(replay.stale_stream_event_count)}</span>
                <span data-field="audit_entries">${escapeHtml(replay.audit_entry_count)}</span>
            </div>
            ${renderList(replay.workflow_ids || [], 'Workflows')}
            ${renderList(replay.artifact_cids || [], 'Artifacts')}
        </section>
    `;
}

function validateDescriptor(descriptor) {
    const errors = [];
    const warnings = [];
    if (descriptor?.meta?.profile !== PROFILE) errors.push({ path: 'meta.profile', message: `Expected ${PROFILE}.` });
    if (!descriptor?.meta?.app_id) errors.push({ path: 'meta.app_id', message: 'Generated app id is required.' });
    if (!Array.isArray(descriptor?.methods) || descriptor.methods.length === 0) errors.push({ path: 'methods', message: 'At least one method is required.' });
    if (!Array.isArray(descriptor?.services) || descriptor.services.length === 0) errors.push({ path: 'services', message: 'At least one service is required.' });
    if (!Array.isArray(descriptor?.data_contracts?.operations) || descriptor.data_contracts.operations.length === 0) {
        errors.push({ path: 'data_contracts.operations', message: 'At least one operation contract is required.' });
    }
    const methodNames = new Set((descriptor?.methods || []).map(method => method.name));
    for (const operation of descriptor?.data_contracts?.operations || []) {
        if (!methodNames.has(operation.method)) errors.push({ path: `operations.${operation.method}`, message: 'Operation does not reference an MCP-IDL method.' });
        if (operation.stream && operation.stream.kind !== 'none' && !operation.stream.event_schema && !operation.stream.event_schema_cid) {
            errors.push({ path: `operations.${operation.method}.stream`, message: 'Streaming operations need an event schema or schema CID.' });
        }
    }
    if (descriptor?.permissions?.default_deny) {
        for (const method of methodNames) {
            if (!descriptor.permissions.operations?.[method]) warnings.push({ path: `permissions.operations.${method}`, message: 'Default-deny descriptor should declare explicit grants.' });
        }
    }
    return { conformant: errors.length === 0, errors, warnings };
}

function selectTemplate(descriptor, validation) {
    if (!validation.conformant) {
        return { kind: descriptor?.ui?.primary_template || 'form-wizard', reason: 'descriptor has validation errors', required_operations: [] };
    }
    const explicit = descriptor.ui?.templates?.find(template => template.kind === descriptor.ui.primary_template);
    if (explicit) return { kind: explicit.kind, reason: 'descriptor primary_template mapping', required_operations: explicit.operations || [] };
    const operations = descriptor.data_contracts?.operations || [];
    const names = operations.map(operation => operation.method.toLowerCase());
    const streams = operations.map(operation => operation.stream?.kind || 'none');
    if (streams.some(kind => kind === 'progress' || kind === 'job-status')) return { kind: 'job-console', reason: 'progress or job-status stream', required_operations: names };
    if (names.some(name => name.includes('graph') || name.includes('lineage') || name.includes('provenance'))) return { kind: 'graph-viewer', reason: 'graph operation shape', required_operations: names };
    if (names.some(name => ['browse', 'list', 'get', 'search'].some(token => name.includes(token)))) return { kind: 'explorer', reason: 'explorer operation shape', required_operations: names };
    if (streams.some(kind => kind === 'telemetry' || kind === 'events')) return { kind: 'dashboard', reason: 'telemetry stream', required_operations: names };
    return { kind: 'form-wizard', reason: 'schema-driven form operation', required_operations: names };
}

function inspectUIMapping(descriptor, operations, granted, policyDecisions) {
    const commands = operations.map(operation => {
        const decision = policyDecisions[operation.method];
        const missing = operation.permissions.filter(capability => !granted.has(capability));
        const denied = decision && decision.outcome !== 'permit';
        return {
            operation: operation.method,
            command_id: `${operation.method}.command`,
            hidden: decision?.visibility === 'hidden',
            disabled_reason: denied && decision?.visibility !== 'hidden'
                ? (decision.reasons || ['Operation is denied by policy.']).join('; ')
                : (missing.length > 0 ? `Requires ${operation.permissions.join(', ')}` : undefined),
            missing_capabilities: missing,
        };
    });
    const regions = descriptor.ui?.sections || (descriptor.ui?.templates || []).flatMap(template => template.regions || []);
    const operationNames = new Set(operations.map(operation => operation.method));
    const failures = [];
    for (const region of regions) {
        if (region.operation && !operationNames.has(region.operation)) {
            failures.push({ path: `ui.regions.${region.id}`, message: `Region references unknown operation: ${region.operation}.` });
        }
    }
    return {
        commands,
        forms: operations.map(operation => `${operation.method}.form`),
        renderers: operations.map(operation => `${operation.method}.result`),
        regions: regions.map(region => region.id),
        widgets: operations.flatMap(operation => [
            `${operation.method}.command`,
            ...operation.input_fields.map(field => `${operation.method}.input.${field}`),
            ...operation.output_fields.map(field => `${operation.method}.result.${field}`),
        ]),
        failures,
    };
}

function schemaFields(schema, prefix = '') {
    const properties = schema?.properties || {};
    return Object.entries(properties).flatMap(([name, child]) => {
        const path = prefix ? `${prefix}.${name}` : name;
        if (child?.type === 'object' && child.properties && child.additionalProperties === false) {
            return [path, ...schemaFields(child, path)];
        }
        return [path];
    });
}

function renderList(values, label) {
    if (!values || values.length === 0) return '';
    return `
        <div class="mcp-descriptor-inspector__list">
            <span>${escapeHtml(label)}</span>
            <ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>
        </div>
    `;
}

function collectArtifactCids(value, artifacts) {
    if (typeof value === 'string') {
        if (value.startsWith('bafy') || value.startsWith('sha256:')) {
            artifacts.add(value);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectArtifactCids(item, artifacts));
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        if (key.toLowerCase().includes('artifact')) {
            collectArtifactCids(child, artifacts);
        } else if (child && typeof child === 'object') {
            collectArtifactCids(child, artifacts);
        }
    }
}

function humanize(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
    window.MCPDescriptorInspector = {
        inspectDescriptor,
        inspectReplayLog,
        renderDescriptorInspector,
    };
}
