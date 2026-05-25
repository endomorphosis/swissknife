const UI_PROFILE = 'swissknife.mcp++/ui-profile';

export async function discoverGeneratedApps(registry, options = {}) {
    if (!registry) {
        return [];
    }

    const entries = await discoverRegistryEntries(registry);
    const apps = [];
    for (const entry of entries) {
        const descriptor = entry.ui_profile || entry.descriptor || entry;
        if (!isGeneratedAppDescriptor(descriptor)) {
            continue;
        }
        if (options.app_id && descriptor.meta.app_id !== options.app_id) {
            continue;
        }
        if (options.interface_type && !descriptor.services.some(service => service.interface_type === options.interface_type)) {
            continue;
        }
        if (options.required_methods && !hasRequiredMethods(descriptor, options.required_methods)) {
            continue;
        }

        const compatibility = entry.compatibility || await compat(registry, entry.cid);
        if (compatibility && compatibility.compatible === false && options.compatible_only !== false) {
            continue;
        }
        const trust = evaluateGeneratedAppTrust(descriptor, options.trust_policy);
        if (!trust.launch_allowed) {
            continue;
        }

        apps.push({
            app_id: descriptor.meta.app_id,
            title: descriptor.meta.title,
            icon: descriptor.meta.icon || iconForTemplate(descriptor.ui.primary_template),
            interface_cid: entry.cid || descriptor.schema_hash || descriptor.schemaHash || descriptor.name,
            descriptor,
            compatibility,
            trust,
            template: selectTemplate(descriptor),
        });
    }

    return apps.sort((a, b) => {
        const appDelta = a.app_id.localeCompare(b.app_id);
        if (appDelta !== 0) return appDelta;
        return compareVersions(b.descriptor.version, a.descriptor.version);
    });
}

export async function resolveGeneratedAppLaunch(registry, request = {}) {
    const candidates = await discoverGeneratedApps(registry, {
        ...request,
        compatible_only: request.compatible_only,
        trust_policy: request.trust_policy,
    });

    const exact = request.preferred_version
        ? candidates.find(candidate => candidate.descriptor.version === request.preferred_version)
        : undefined;
    const selected = exact || candidates[0];
    if (!selected) {
        return null;
    }

    return {
        ...selected,
        fallback: Boolean(request.preferred_version && !exact),
        reason: exact ? 'preferred version matched' : 'latest compatible generated app selected',
    };
}

export function renderGeneratedApp(app, context = {}) {
    const descriptor = app.descriptor;
    const capabilities = new Set(context.capabilities || globalCapabilities());
    const operations = descriptor.data_contracts.operations;
    const regions = descriptor.ui.sections?.length
        ? descriptor.ui.sections
        : descriptor.ui.templates.flatMap(template => template.regions || []);
    const appInstanceId = context.app_instance_id || app.app_instance_id || `${descriptor.meta.app_id}:default`;
    const replayLog = loadReplayLog(appInstanceId, context.replay_storage);
    const projection = projectReplayLog(descriptor.meta.app_id, appInstanceId, replayLog);
    const trust = context.trust || app.trust || evaluateGeneratedAppTrust(descriptor, context.trust_policy);
    const policyDecisions = context.policy_decisions || {};
    const auditCorrelationCount = Object.keys(projection.audit?.by_correlation_id || {}).length;
    const auditArtifacts = Object.keys(projection.audit?.artifact_lineage || {});

    return `
        <div class="generated-mcp-app" data-app-id="${escapeHtml(descriptor.meta.app_id)}" data-app-instance-id="${escapeHtml(appInstanceId)}" data-trust-status="${escapeHtml(trust.status)}">
            <div class="generated-mcp-toolbar">
                ${operations.map(operation => renderCommand(descriptor, operation, capabilities, trust, policyDecisions[operation.method])).join('')}
            </div>
            <div class="generated-mcp-regions generated-mcp-template-${escapeHtml(app.template.kind)}">
                ${regions.map(region => renderRegion(descriptor, region, capabilities, trust, policyDecisions)).join('')}
            </div>
            <div class="generated-mcp-audit" data-region="audit">
                <div class="generated-mcp-audit-line" data-field="interface_cid">${escapeHtml(app.interface_cid)}</div>
                <div class="generated-mcp-audit-line" data-field="template">${escapeHtml(app.template.kind)}</div>
                <div class="generated-mcp-audit-line" data-field="trust_status">${escapeHtml(trust.status)}</div>
                <div class="generated-mcp-audit-line" data-field="trust_reason">${escapeHtml(trust.reasons.join('; '))}</div>
                <div class="generated-mcp-audit-line" data-field="replay_events">${escapeHtml(replayLog.length)}</div>
                <div class="generated-mcp-audit-line" data-field="audit_correlations">${escapeHtml(auditCorrelationCount)}</div>
                <div class="generated-mcp-audit-line" data-field="audit_artifacts">${escapeHtml(auditArtifacts.join(', '))}</div>
            </div>
        </div>
    `;
}

export function createGeneratedAppState(app, options = {}) {
    const descriptor = app.descriptor || app;
    const appId = options.app_id || descriptor.meta?.app_id || app.app_id || 'generated-mcp-app';
    const appInstanceId = options.app_instance_id || app.app_instance_id || `${appId}:${createReplayId()}`;
    const storage = options.replay_storage || browserReplayStorage();
    const descriptorName = options.descriptor_name || descriptor.name;
    const descriptorVersion = options.descriptor_version || descriptor.version;
    const interfaceCid = options.interface_cid || app.interface_cid;
    const strictStreamGuards = options.strict_stream_guards !== false;
    let replayLog = loadReplayLog(appInstanceId, storage);
    let projection = projectReplayLog(appId, appInstanceId, replayLog);

    const append = (type, payload) => {
        const event = {
            id: `${appInstanceId}:${replayLog.length + 1}`,
            app_id: appId,
            app_instance_id: appInstanceId,
            descriptor_name: descriptorName,
            descriptor_version: descriptorVersion,
            interface_cid: interfaceCid,
            sequence: replayLog.length + 1,
            type,
            at: new Date().toISOString(),
            payload,
        };
        replayLog = [...replayLog, event];
        projection = projectReplayLog(appId, appInstanceId, replayLog);
        saveReplayLog(appInstanceId, replayLog, storage);
        return clone(event);
    };

    return {
        app_id: appId,
        app_instance_id: appInstanceId,
        get replay_log() {
            return clone(replayLog);
        },
        get state() {
            return clone(projection);
        },
        restore() {
            replayLog = loadReplayLog(appInstanceId, storage);
            projection = projectReplayLog(appId, appInstanceId, replayLog);
            return clone(projection);
        },
        recordCommand(operation, input, options = {}) {
            return append('command.dispatched', {
                operation,
                input,
                correlation_id: options.correlation_id || `${appInstanceId}:command:${replayLog.length + 1}`,
            });
        },
        resolveCommand(correlationId, output, receipt) {
            return append('command.resolved', {
                correlation_id: correlationId,
                output,
                receipt_cid: receipt?.receipt_cid,
                receipt,
            });
        },
        startStream(stream) {
            return append('stream.started', { ...stream });
        },
        recoverStream(stream) {
            return append('stream.recovered', { ...stream });
        },
        recordStreamEvent(operation, correlationId, event) {
            const reason = staleStreamReason(operation, correlationId, event, projection, strictStreamGuards)
                || duplicateStreamReason(operation, correlationId, event, projection);
            if (reason) {
                append('stream.stale_rejected', {
                    operation,
                    correlation_id: correlationId,
                    reason,
                    event,
                });
                return { accepted: false, reason };
            }
            append('stream.event', {
                operation,
                correlation_id: correlationId,
                event,
                binding_handle: event?.binding_handle,
                binding_generation: event?.binding_generation,
                generation_key: event?.generation_key,
            });
            return { accepted: true };
        },
        recordWorkflowStep(step) {
            return append('workflow.step.completed', {
                workflow_id: step.workflow_id,
                step_id: step.step_id,
                operation: step.operation,
                correlation_id: step.correlation_id,
                status: step.status,
                output: step.output,
                receipt_cid: step.receipt?.receipt_cid,
                receipt: step.receipt,
                artifact_cids: step.artifact_cids,
                shared_state_updates: step.shared_state_updates,
            });
        },
        updateProjection(name, value) {
            return append('projection.updated', { name, value });
        },
    };
}

export function restoreGeneratedAppState(app, options = {}) {
    const state = createGeneratedAppState(app, options);
    state.restore();
    return state;
}

export function projectReplayLog(appId, appInstanceId, replayLog = []) {
    const projection = {
        app_id: appId,
        app_instance_id: appInstanceId,
        replay_event_count: 0,
        commands: {},
        command_order: [],
        active_streams: {},
        stream_events: [],
        stale_stream_events: [],
        workflows: {},
        projections: {},
        audit: {
            entries: [],
            by_correlation_id: {},
            artifact_lineage: {},
        },
    };

    for (const event of [...replayLog].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))) {
        projection.replay_event_count += 1;
        applyReplayEvent(projection, event);
    }
    return projection;
}

export function evaluateGeneratedAppTrust(descriptor, policy = {}) {
    const publisher = descriptor.meta?.publisher;
    const trust = descriptor.trust;
    const reasons = [];
    if (policy.allowed_publishers?.length && (!publisher || !policy.allowed_publishers.includes(publisher))) {
        reasons.push(`Publisher ${publisher || '<missing>'} is not allowlisted.`);
        return {
            status: 'rejected',
            launch_allowed: false,
            reasons,
            publisher,
            signed_by: trust?.signed_by,
        };
    }
    if (!trust) {
        if (policy.require_signature) {
            reasons.push('Descriptor signature is required for this launch path.');
        }
        return {
            status: 'unsigned',
            launch_allowed: !policy.require_signature,
            reasons: reasons.length ? reasons : ['Descriptor is unsigned.'],
            publisher,
        };
    }
    if (policy.allowed_signers?.length && !policy.allowed_signers.includes(trust.signed_by)) {
        reasons.push(`Signer ${trust.signed_by} is not allowlisted.`);
        return {
            status: 'rejected',
            launch_allowed: false,
            reasons,
            publisher,
            signed_by: trust.signed_by,
        };
    }
    return {
        status: 'trusted',
        launch_allowed: true,
        reasons: ['Descriptor signature is present.'],
        publisher,
        signed_by: trust.signed_by,
        canonical_cid: trust.canonical_cid,
    };
}

function renderCommand(descriptor, operation, capabilities, trust, policyDecision) {
    if (policyDecision?.visibility === 'hidden') {
        return '';
    }
    const reasons = operationDenialReasons(descriptor, operation, capabilities, trust, policyDecision);
    const disabled = reasons.length > 0;
    const reason = reasons.join('; ');
    return `
        <button
            class="generated-mcp-command"
            data-operation="${escapeHtml(operation.method)}"
            data-control-surface="mouse"
            data-surface-event="click"
            data-interaction-envelope="interaction_envelope"
            data-trust-status="${escapeHtml(trust.status)}"
            ${disabled ? 'disabled' : ''}
            ${reason ? `title="${escapeHtml(reason)}" data-denial-reason="${escapeHtml(reason)}"` : ''}
        >${escapeHtml(operation.title || humanize(operation.method))}</button>
    `;
}

export function buildGeneratedControlSurfaceContext(descriptor, operation, surface = 'mouse', surfaceEvent = 'click', rawEvent = {}) {
    const binding = descriptor.control_surface_contract?.intent_bindings?.find?.((candidate) => candidate.method === operation);
    return {
        control_surface_contract: descriptor.control_surface_contract,
        control_surface_mediator: 'swissknife.generated_app.control_surface_mediator',
        interaction_envelope: {
            surface,
            surface_event: surfaceEvent,
            intent: binding?.intent || `${descriptor.meta?.app_id || descriptor.name}.${operation}`,
            method: operation,
            target_ref: binding?.target_ref || `${descriptor.name}.${operation}`,
            raw_payload: rawEvent
        }
    };
}

function renderRegion(descriptor, region, capabilities, trust, policyDecisions = {}) {
    const operation = descriptor.data_contracts.operations.find(candidate => candidate.method === region.operation);
    if (!operation) {
        return `
            <section class="generated-mcp-region generated-mcp-region-${escapeHtml(region.kind)}" data-region="${escapeHtml(region.id)}">
                <h3>${escapeHtml(region.title || humanize(region.id))}</h3>
            </section>
        `;
    }

    const policyDecision = policyDecisions[operation.method];
    if (policyDecision?.visibility === 'hidden') {
        return '';
    }
    const reasons = operationDenialReasons(descriptor, operation, capabilities, trust, policyDecision);
    return `
        <section class="generated-mcp-region generated-mcp-region-${escapeHtml(region.kind)}" data-region="${escapeHtml(region.id)}" data-operation="${escapeHtml(operation.method)}" data-trust-status="${escapeHtml(trust.status)}">
            <h3>${escapeHtml(region.title || humanize(region.id))}</h3>
            ${reasons.length > 0 ? renderPolicyDenial(reasons) : ''}
            ${renderForm(operation)}
            ${renderResultShell(operation)}
        </section>
    `;
}

function operationDenialReasons(descriptor, operation, capabilities, trust, policyDecision) {
    const required = descriptor.permissions.operations[operation.method] || [];
    const missing = required.filter(capability => !capabilities.has(capability));
    const policyReasons = policyDecision && policyDecision.outcome !== 'permit'
        ? sanitizeReasonList(policyDecision.reasons?.length ? policyDecision.reasons : ['Operation is denied by policy.'])
        : [];
    return [
        ...(!trust.launch_allowed ? trust.reasons : []),
        ...(descriptor.permissions.default_deny ? missing.map(capability => `Missing capability: ${capability}`) : []),
        ...policyReasons,
    ];
}

function renderPolicyDenial(reasons) {
    return `
        <div class="generated-mcp-policy-denial" role="status">
            ${escapeHtml(`Denied: ${reasons.join('; ')}`)}
        </div>
    `;
}

function sanitizeReasonList(reasons) {
    return reasons.map(reason => String(reason));
}

function renderForm(operation) {
    const fields = schemaFields(operation.input_schema || {});
    if (fields.length === 0) {
        return '';
    }
    return `
        <form class="generated-mcp-form" data-operation="${escapeHtml(operation.method)}">
            ${fields.map(field => renderInputField(operation, field)).join('')}
        </form>
    `;
}

function renderInputField(operation, field) {
    const widget = inputWidget(field.name, field.schema);
    const label = escapeHtml(humanize(field.name));
    const path = escapeHtml(field.path);
    if (widget === 'checkbox') {
        return `<label class="generated-mcp-field"><input type="checkbox" data-path="${path}" data-widget="${widget}"> ${label}</label>`;
    }
    if (widget === 'select') {
        return `
            <label class="generated-mcp-field">${label}
                <select data-path="${path}" data-widget="${widget}">
                    ${(field.schema.enum || []).map(value => `<option value="${escapeHtml(String(value))}">${escapeHtml(String(value))}</option>`).join('')}
                </select>
            </label>
        `;
    }
    if (widget === 'json-editor' || widget === 'list-editor') {
        return `<label class="generated-mcp-field">${label}<textarea data-path="${path}" data-widget="${widget}"></textarea></label>`;
    }
    const type = widget === 'number-input' ? 'number' : 'text';
    return `<label class="generated-mcp-field">${label}<input type="${type}" data-path="${path}" data-widget="${widget}" data-operation="${escapeHtml(operation.method)}"></label>`;
}

function renderResultShell(operation) {
    const fields = schemaFields(operation.output_schema || {});
    if (fields.length === 0) {
        return '';
    }
    return `
        <div class="generated-mcp-result" data-operation="${escapeHtml(operation.method)}">
            ${fields.map(field => `<div class="generated-mcp-result-field" data-path="${escapeHtml(field.path)}" data-widget="${outputWidget(field.name, field.schema)}"></div>`).join('')}
        </div>
    `;
}

function applyReplayEvent(projection, event) {
    const payload = event.payload || {};
    if (event.type === 'command.dispatched') {
        const correlationId = payload.correlation_id;
        if (!correlationId) return;
        if (!projection.commands[correlationId]) {
            projection.command_order.push(correlationId);
        }
        projection.commands[correlationId] = {
            correlation_id: correlationId,
            operation: payload.operation,
            status: 'dispatched',
            input: payload.input,
            updated_at: event.at,
        };
        indexAuditEntry(projection, auditEntry(event, {
            kind: 'command',
            correlation_id: correlationId,
            operation: payload.operation,
        }));
        return;
    }
    if (event.type === 'command.resolved') {
        const correlationId = payload.correlation_id;
        if (!correlationId) return;
        const receipt = payload.receipt || {};
        projection.commands[correlationId] = {
            ...(projection.commands[correlationId] || { correlation_id: correlationId, operation: 'unknown' }),
            status: 'resolved',
            output: payload.output,
            receipt_cid: payload.receipt_cid,
            updated_at: event.at,
        };
        indexAuditEntry(projection, auditEntry(event, {
            kind: 'receipt',
            correlation_id: correlationId,
            operation: receipt.operation || projection.commands[correlationId].operation,
            receipt_cid: payload.receipt_cid,
            interface_cid: receipt.interface_cid,
            artifact_cids: artifactCidsFrom(payload.output),
            provenance_refs: stringArray(receipt.provenance_refs),
            output_refs: stringArray(receipt.output_refs),
        }));
        return;
    }
    if (event.type === 'stream.started' || event.type === 'stream.recovered') {
        const key = streamKey(payload.operation, payload.correlation_id);
        projection.active_streams[key] = {
            operation: payload.operation,
            correlation_id: payload.correlation_id,
            binding_handle: payload.binding_handle,
            binding_generation: payload.binding_generation,
            generation_key: payload.generation_key,
            recovered_at: event.type === 'stream.recovered' ? event.at : undefined,
        };
        return;
    }
    if (event.type === 'stream.event') {
        projection.stream_events.push(payload.event);
        indexAuditEntry(projection, auditEntry(event, {
            kind: 'stream',
            correlation_id: payload.event?.correlation_id || payload.correlation_id,
            operation: payload.event?.operation || payload.operation,
            interface_cid: payload.event?.interface_cid,
            event_cid: payload.event?.event_cid,
            binding_handle: payload.event?.binding_handle,
            binding_generation: payload.event?.binding_generation,
            artifact_cids: artifactCidsFrom(payload.event?.event),
            provenance_refs: provenanceRefsFrom(payload.event?.event),
        }));
        return;
    }
    if (event.type === 'stream.stale_rejected') {
        projection.stale_stream_events.push({
            operation: payload.operation,
            correlation_id: payload.correlation_id,
            reason: payload.reason,
            event: payload.event,
            rejected_at: event.at,
        });
        indexAuditEntry(projection, auditEntry(event, {
            kind: 'stale_stream',
            correlation_id: payload.correlation_id,
            operation: payload.operation,
            status: 'rejected',
            artifact_cids: artifactCidsFrom(payload.event),
        }));
        return;
    }
    if (event.type === 'workflow.step.completed') {
        const receipt = payload.receipt || {};
        const workflowId = payload.workflow_id || 'default';
        const workflow = projection.workflows[workflowId] || {
            workflow_id: workflowId,
            step_order: [],
            steps: {},
            shared_state: {},
        };
        if (!workflow.steps[payload.step_id]) {
            workflow.step_order.push(payload.step_id);
        }
        workflow.steps[payload.step_id] = {
            step_id: payload.step_id,
            operation: payload.operation,
            status: payload.status || 'completed',
            output: payload.output,
            receipt_cid: payload.receipt_cid,
            updated_at: event.at,
        };
        if (payload.shared_state_updates && typeof payload.shared_state_updates === 'object') {
            workflow.shared_state = {
                ...workflow.shared_state,
                ...payload.shared_state_updates,
            };
        }
        workflow.updated_at = event.at;
        projection.workflows[workflowId] = workflow;
        indexAuditEntry(projection, auditEntry(event, {
            kind: 'workflow_step',
            correlation_id: payload.correlation_id,
            operation: payload.operation,
            step_id: payload.step_id,
            status: payload.status,
            receipt_cid: payload.receipt_cid,
            interface_cid: receipt.interface_cid,
            artifact_cids: uniqueStrings([...stringArray(payload.artifact_cids), ...artifactCidsFrom(payload.output)]),
            provenance_refs: stringArray(receipt.provenance_refs),
            output_refs: stringArray(receipt.output_refs),
        }));
        return;
    }
    if (event.type === 'projection.updated' && payload.name) {
        projection.projections[payload.name] = payload.value;
    }
}

function staleStreamReason(operation, correlationId, event, projection, strictStreamGuards) {
    const guard = projection.active_streams[streamKey(operation, correlationId)];
    if (!guard) {
        return strictStreamGuards ? `No active stream guard for ${operation}:${correlationId}.` : '';
    }
    if (event?.binding_handle && event.binding_handle !== guard.binding_handle) {
        return `Stale stream handle ${event.binding_handle}; expected ${guard.binding_handle}.`;
    }
    if (event?.binding_generation !== undefined && event.binding_generation !== guard.binding_generation) {
        return `Stale stream generation ${event.binding_generation}; expected ${guard.binding_generation}.`;
    }
    if (event?.generation_key && guard.generation_key && event.generation_key !== guard.generation_key) {
        return `Stale stream generation key ${event.generation_key}; expected ${guard.generation_key}.`;
    }
    return '';
}

function duplicateStreamReason(operation, correlationId, event, projection) {
    const fingerprint = streamEventFingerprint(operation, correlationId, event);
    return projection.stream_events.some(candidate => (
        streamEventFingerprint(
            candidate.operation,
            candidate.correlation_id,
            candidate,
        ) === fingerprint
    ))
        ? `Duplicate stream event for ${operation}:${correlationId}.`
        : '';
}

function streamEventFingerprint(operation, correlationId, event) {
    if (event?.event_cid) {
        return `event:${event.event_cid}`;
    }
    return stableStringify({
        operation,
        correlation_id: correlationId,
        binding_handle: event?.binding_handle,
        binding_generation: event?.binding_generation,
        generation_key: event?.generation_key,
        event: event?.event,
    });
}

function auditEntry(event, entry) {
    return {
        ...entry,
        artifact_cids: uniqueStrings(entry.artifact_cids || []),
        provenance_refs: uniqueStrings(entry.provenance_refs || []),
        output_refs: uniqueStrings(entry.output_refs || []),
        at: event.at,
        source_sequence: event.sequence,
    };
}

function indexAuditEntry(projection, entry) {
    if (!entry.correlation_id) return;
    projection.audit.entries.push(entry);
    if (!projection.audit.by_correlation_id[entry.correlation_id]) {
        projection.audit.by_correlation_id[entry.correlation_id] = [];
    }
    projection.audit.by_correlation_id[entry.correlation_id].push(entry);
    for (const artifactCid of entry.artifact_cids || []) {
        if (!projection.audit.artifact_lineage[artifactCid]) {
            projection.audit.artifact_lineage[artifactCid] = [];
        }
        projection.audit.artifact_lineage[artifactCid].push(entry.correlation_id);
    }
}

function artifactCidsFrom(value) {
    const cids = [];
    collectArtifactCids(value, '', cids);
    return uniqueStrings(cids);
}

function collectArtifactCids(value, key, cids) {
    if (typeof value === 'string') {
        if (key.toLowerCase().includes('artifact') && isCidLike(value)) {
            cids.push(value);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectArtifactCids(item, key, cids);
        }
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [childKey, childValue] of Object.entries(value)) {
        collectArtifactCids(childValue, childKey, cids);
    }
}

function provenanceRefsFrom(value) {
    const provenance = value?.provenance;
    return provenance && typeof provenance === 'object'
        ? uniqueStrings(Object.values(provenance).filter(item => typeof item === 'string'))
        : [];
}

function stringArray(value) {
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function uniqueStrings(values) {
    return Array.from(new Set(values)).sort();
}

function isCidLike(value) {
    return value.startsWith('bafy') || value.startsWith('sha256:');
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    return '{' + Object.keys(value)
        .sort()
        .filter(key => value[key] !== undefined)
        .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
        .join(',') + '}';
}

function loadReplayLog(appInstanceId, storage = browserReplayStorage()) {
    try {
        const raw = storage.getItem(replayStorageKey(appInstanceId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveReplayLog(appInstanceId, replayLog, storage = browserReplayStorage()) {
    try {
        storage.setItem(replayStorageKey(appInstanceId), JSON.stringify(replayLog));
    } catch {
        // Replay persistence is diagnostic; rendering should continue if storage is unavailable.
    }
}

function browserReplayStorage() {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
    }
    const memory = new Map();
    return {
        getItem(key) {
            return memory.has(key) ? memory.get(key) : null;
        },
        setItem(key, value) {
            memory.set(key, String(value));
        },
    };
}

function replayStorageKey(appInstanceId) {
    return `swissknife:mcp-generated-app:${appInstanceId}:replay`;
}

function streamKey(operation, correlationId) {
    return `${operation}:${correlationId}`;
}

function createReplayId() {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function discoverRegistryEntries(registry) {
    if (typeof registry.discover === 'function') {
        return await registry.discover({ ui_only: true });
    }

    const cids = typeof registry.list === 'function'
        ? await registry.list()
        : await callRegistry(registry, 'interfaces/list', {});

    const entries = [];
    for (const cid of cids || []) {
        const payload = typeof registry.get === 'function'
            ? await registry.get(cid)
            : await callRegistry(registry, 'interfaces/get', { interface_cid: cid });
        const descriptor = decodeDescriptor(payload);
        if (descriptor) {
            entries.push({
                cid,
                descriptor,
                compatibility: await compat(registry, cid),
            });
        }
    }
    return entries;
}

async function compat(registry, cid) {
    if (!cid) return undefined;
    if (typeof registry.compat === 'function') {
        return await registry.compat(cid);
    }
    return await callRegistry(registry, 'interfaces/compat', { interface_cid: cid });
}

async function callRegistry(registry, method, params) {
    if (typeof registry.call !== 'function') {
        return undefined;
    }
    return await registry.call(method, params);
}

function decodeDescriptor(payload) {
    if (!payload) return null;
    if (typeof payload === 'object' && !ArrayBuffer.isView(payload)) return payload;
    if (typeof payload === 'string') return JSON.parse(payload);
    if (ArrayBuffer.isView(payload)) {
        return JSON.parse(new TextDecoder().decode(payload));
    }
    return null;
}

function isGeneratedAppDescriptor(descriptor) {
    return Boolean(
        descriptor
        && descriptor.meta?.profile === UI_PROFILE
        && descriptor.meta?.app_id
        && descriptor.ui?.primary_template
        && Array.isArray(descriptor.services)
        && descriptor.data_contracts?.operations,
    );
}

function hasRequiredMethods(descriptor, requiredMethods) {
    const methods = new Set((descriptor.methods || []).map(method => method.name));
    return requiredMethods.every(method => methods.has(method));
}

function selectTemplate(descriptor) {
    const explicit = descriptor.ui.templates?.find(template => template.kind === descriptor.ui.primary_template);
    if (explicit) {
        return {
            kind: explicit.kind,
            reason: 'descriptor primary_template mapping',
            required_operations: explicit.operations || [],
        };
    }

    const operations = descriptor.data_contracts.operations || [];
    const streams = operations.map(operation => operation.stream?.kind || 'none');
    const names = operations.map(operation => operation.method.toLowerCase());
    if (streams.some(kind => kind === 'progress' || kind === 'job-status')) {
        return { kind: 'job-console', reason: 'progress stream', required_operations: names };
    }
    if (names.some(name => name.includes('graph') || name.includes('lineage') || name.includes('provenance'))) {
        return { kind: 'graph-viewer', reason: 'graph operation shape', required_operations: names };
    }
    if (names.some(name => ['browse', 'list', 'get', 'search'].some(token => name.includes(token)))) {
        return { kind: 'explorer', reason: 'explorer operation shape', required_operations: names };
    }
    if (streams.some(kind => kind === 'telemetry' || kind === 'events')) {
        return { kind: 'dashboard', reason: 'telemetry stream', required_operations: names };
    }
    return { kind: 'form-wizard', reason: 'schema-driven form operation', required_operations: names };
}

function schemaFields(schema, prefix = '') {
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);
    return Object.entries(properties).flatMap(([name, fieldSchema]) => {
        const path = prefix ? `${prefix}.${name}` : name;
        if (fieldSchema?.type === 'object' && fieldSchema.properties && fieldSchema.additionalProperties === false) {
            return schemaFields(fieldSchema, path);
        }
        return [{ name, path, schema: fieldSchema || {}, required: required.has(name) }];
    });
}

function inputWidget(name, schema) {
    const normalized = name.toLowerCase();
    if (normalized.includes('cid')) return 'cid-picker';
    if (normalized.includes('did')) return 'did-input';
    if (Array.isArray(schema.enum)) return 'select';
    if (schema.type === 'boolean') return 'checkbox';
    if (schema.type === 'number' || schema.type === 'integer') return 'number-input';
    if (schema.type === 'array') return 'list-editor';
    if (schema.type === 'object') return 'json-editor';
    return 'text-input';
}

function outputWidget(name, schema) {
    const normalized = name.toLowerCase();
    if (normalized.includes('provenance')) return 'provenance-panel';
    if (normalized.includes('progress')) return 'progress-timeline';
    if (normalized.includes('status')) return 'status-badge';
    if (normalized.includes('cid')) return 'cid-picker';
    if (schema.type === 'array') return 'list-editor';
    if (schema.type === 'object') return 'json-editor';
    return 'text-input';
}

function compareVersions(a, b) {
    const left = String(a).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
    const right = String(b).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const delta = (left[index] || 0) - (right[index] || 0);
        if (delta !== 0) return delta;
    }
    return String(a).localeCompare(String(b));
}

function iconForTemplate(template) {
    return {
        dashboard: '📊',
        explorer: '🗂️',
        'form-wizard': '📝',
        'job-console': '⚙️',
        'graph-viewer': '🕸️',
    }[template] || '🧩';
}

function globalCapabilities() {
    return Array.isArray(globalThis.swissknifeCapabilities) ? globalThis.swissknifeCapabilities : [];
}

function humanize(value) {
    return String(value)
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
    window.MCPGeneratedAppLauncher = {
        discoverGeneratedApps,
        resolveGeneratedAppLaunch,
        renderGeneratedApp,
        buildGeneratedControlSurfaceContext,
        createGeneratedAppState,
        restoreGeneratedAppState,
        projectReplayLog,
        evaluateGeneratedAppTrust,
    };
}
