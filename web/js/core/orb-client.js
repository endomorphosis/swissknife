const STREAM_HEARTBEAT_INTERVAL_MS = 5000;

export class OrbClient {
    constructor(options = {}) {
        this.options = options;
        this.registry = new Map();
        this.transport = options.transport || null;
        this.idCounter = 0;
    }

    createCorrelationId(scope = 'orb') {
        const uuidSegment = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : this.generateFallbackId();

        return `${scope}-${uuidSegment}`;
    }

    generateFallbackId() {
        this.idCounter += 1;
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(8);
            crypto.getRandomValues(bytes);
            const randomHex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
            return `${Date.now().toString(16)}-${this.idCounter.toString(16)}-${randomHex}`;
        }

        return `${Date.now().toString(16)}-${this.idCounter.toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
    }

    registerService(serviceName, descriptor = {}) {
        this.registry.set(serviceName, descriptor);
    }

    async discover(serviceRef) {
        const discovered = this.registry.get(serviceRef.name) || {
            name: serviceRef.name,
            endpoint: serviceRef.endpoint || 'mcp://local',
            capabilities: serviceRef.capabilities || []
        };
        return { discovered: true, service: discovered };
    }

    async bind(serviceRef) {
        return {
            bound: true,
            sessionId: this.createCorrelationId(`${serviceRef.name}-session`),
            service: serviceRef.name
        };
    }

    async authorize(serviceRef, context = {}) {
        return {
            authorized: true,
            service: serviceRef.name,
            claims: context.claims || []
        };
    }

    async invoke(serviceRef, operation, payload = {}, context = {}) {
        const correlationId = context.correlationId || this.createCorrelationId(serviceRef.name);
        const invokeContext = {
            ...context,
            correlationId,
            correlation_id: context.correlation_id || correlationId
        };
        const mediation = control_surface_mediator(serviceRef, operation, payload, invokeContext);
        if (!mediation.canInvoke) {
            return {
                ok: false,
                denied: true,
                correlationId,
                operation,
                service: serviceRef.name,
                error: 'CONTROL_SURFACE_MEDIATION_DENIED',
                policy_decision: mediation.policy_decision,
                interaction_envelope: mediation.interaction_envelope,
                mediation_receipt: mediation.mediation_receipt
            };
        }

        if (this.transport && typeof this.transport.invoke === 'function') {
            return this.transport.invoke(serviceRef, operation, mediation.invocationPayload, correlationId, invokeContext);
        }

        return {
            ok: true,
            correlationId,
            operation,
            service: serviceRef.name,
            payload: mediation.invocationPayload,
            timestamp: new Date().toISOString(),
            policy_decision: mediation.policy_decision,
            interaction_envelope: mediation.interaction_envelope,
            mediation_receipt: mediation.mediation_receipt
        };
    }

    async stream(serviceRef, streamName, onEvent) {
        if (!serviceRef || !serviceRef.name) {
            throw new Error('serviceRef.name is required for stream');
        }
        if (!streamName) {
            throw new Error('streamName is required');
        }

        const timer = setInterval(() => {
            if (typeof onEvent === 'function') {
                onEvent({
                    service: serviceRef.name,
                    stream: streamName,
                    ts: Date.now(),
                    status: 'heartbeat'
                });
            }
        }, STREAM_HEARTBEAT_INTERVAL_MS);

        return {
            close: () => clearInterval(timer)
        };
    }

    async recover(serviceRef, reason = 'retry') {
        return {
            recovered: true,
            service: serviceRef.name,
            strategy: reason
        };
    }
}

export function control_surface_mediator(serviceRef, operation, payload = {}, context = {}) {
    const descriptor = context.descriptor || serviceRef.descriptor || {};
    const contract = descriptor.control_surface_contract || createDefaultControlSurfaceContract(descriptor, operation);
    const controlSurface = context.control_surface || context.metadata?.control_surface || payload.control_surface || {};
    const surface = controlSurface.surface || controlSurface.id || context.surface || 'mouse';
    const surfaceEvent = controlSurface.surface_event || controlSurface.event || context.surface_event || defaultSurfaceEvent(surface);
    const surfaces = Array.isArray(contract.control_surfaces) ? contract.control_surfaces : [];
    const declaredSurface = surfaces.find((candidate) => candidate.id === surface);
    const intentBindings = Array.isArray(contract.intent_bindings) ? contract.intent_bindings : [];
    const intentBinding = intentBindings.find((candidate) => candidate.method === operation);
    const reasons = [];

    if (!declaredSurface) {
        reasons.push(`Surface ${surface} is not declared in control_surface_contract.`);
    } else if (Array.isArray(declaredSurface.event_types) && !declaredSurface.event_types.includes(surfaceEvent)) {
        reasons.push(`Surface event ${surfaceEvent} is not allowed for ${surface}.`);
    }
    if (!intentBinding) {
        reasons.push(`Operation ${operation} has no control_surface_contract intent binding.`);
    } else if (Array.isArray(intentBinding.allowed_surfaces) && !intentBinding.allowed_surfaces.includes(surface)) {
        reasons.push(`Surface ${surface} is not allowed to invoke ${operation}.`);
    }

    const now = new Date().toISOString();
    const policyRef = firstPolicyRef(contract, declaredSurface, intentBinding);
    const compiledPolicyCid = firstCompiledPolicyCid(contract, declaredSurface, intentBinding);
    const interactionId = controlSurface.interaction_id || context.correlation_id || context.correlationId || localCid({ operation, payload, now });
    const contractRef = `${descriptor.schema_hash || descriptor.schemaHash || serviceRef.name || 'browser'}#control_surface_contract`;
    const interaction_envelope = {
        interaction_id: interactionId,
        surface,
        surface_event: surfaceEvent,
        raw_payload: objectPayload(payload),
        normalized_intent: {
            intent: controlSurface.intent || intentBinding?.intent || `${descriptor.meta?.id || descriptor.meta?.app_id || serviceRef.name}.${operation}`,
            method: operation,
            target_ref: intentBinding?.target_ref || `${serviceRef.name}.${operation}`,
            arguments: objectPayload(payload),
            confidence: typeof controlSurface.confidence === 'number' ? controlSurface.confidence : 1
        },
        actor: {
            type: controlSurface.actor?.type || controlSurface.actor_type || (surface === 'agent' ? 'agent' : 'user'),
            id: controlSurface.actor?.id || controlSurface.actor_id || context.caller_did || (surface === 'agent' ? 'swissknife-agent' : 'local-user'),
            delegation_chain: Array.isArray(controlSurface.actor?.delegation_chain)
                ? controlSurface.actor.delegation_chain
                : []
        },
        context: {
            local_time: controlSurface.context?.local_time || now,
            state_frames: Array.isArray(controlSurface.context?.state_frames) ? controlSurface.context.state_frames : [],
            device_mode: controlSurface.context?.device_mode || 'active',
            platform: controlSurface.context?.platform || 'swissknife_web',
            location_context: objectPayload(controlSurface.context?.location_context),
            device_context: objectPayload(controlSurface.context?.device_context)
        },
        control_surface_contract_ref: contractRef,
        policy_bundle_ref: policyRef,
        compiled_policy_cid: compiledPolicyCid,
        logic_bindings: selectedLogicBindings(contract, declaredSurface, intentBinding, surface, operation)
    };
    const outcome = reasons.length > 0 ? 'deny' : 'allow';
    const explanation = reasons.length > 0
        ? reasons.join('; ')
        : `control_surface_mediator allowed ${surface}:${surfaceEvent} for ${operation}.`;
    const policy_decision = {
        decision_id: localCid({ interaction_id: interactionId, outcome, reasons, compiled_policy_cid: compiledPolicyCid }),
        interaction_id: interactionId,
        interaction_envelope,
        outcome,
        policy_bundle_ref: policyRef,
        compiled_policy_cid: compiledPolicyCid,
        decided_at: now,
        matched_norms: [],
        effects: [{
            outcome,
            method: operation,
            target_ref: interaction_envelope.normalized_intent.target_ref,
            arguments: objectPayload(payload),
            confirmation_required: false,
            reason: explanation
        }],
        frame_facts: [
            frameFact(interactionId, 'surface', 'surface.id', surface),
            frameFact(interactionId, 'event', 'surface_event', surfaceEvent),
            frameFact(interactionId, 'method', 'intent.method', operation)
        ],
        reasons: reasons.length > 0 ? reasons : ['Descriptor control_surface_contract binding allowed invocation.'],
        explanation,
        confidence: interaction_envelope.normalized_intent.confidence,
        metadata: { control_surface_mediator: 'swissknife.web.control_surface_mediator' }
    };
    const mediation_receipt = {
        receipt_id: localCid({ interaction_id: interactionId, decision_id: policy_decision.decision_id, contractRef }),
        emitted_at: now,
        control_surface_contract_ref: contractRef,
        interaction_envelope,
        policy_decision,
        policy_refs: [{
            policy_bundle_ref: policyRef,
            compiled_policy_cid: compiledPolicyCid,
            matched_norm_refs: []
        }],
        mediation_result: {
            outcome,
            invoked: outcome === 'allow',
            final_method: operation,
            final_target_ref: interaction_envelope.normalized_intent.target_ref,
            confirmation_required: false
        },
        explanation,
        metadata: {
            source: 'orb-client',
            schema_refs: ['control_surface_contract', 'interaction_envelope', 'policy_decision', 'mediation_receipt']
        }
    };

    return {
        canInvoke: outcome === 'allow',
        invocationPayload: payload,
        interaction_envelope,
        policy_decision,
        mediation_receipt
    };
}

function createDefaultControlSurfaceContract(descriptor, operation) {
    const appId = descriptor.meta?.id || descriptor.meta?.app_id || descriptor.name || 'swissknife-browser';
    const policyBundleRef = {
        policy_id: `policy:${appId}:control-surface-default`,
        policy_cid: `local:${appId}:control-surface-default`,
        version: '0.1.0',
        scope: 'descriptor',
        source: 'descriptor'
    };
    const logicBinding = {
        binding_id: `${appId}.intent.${operation}`,
        policy_bundle_ref: policyBundleRef,
        compiled_policy_cid: `local:${appId}:compiled-control-surface-default`,
        norm_refs: [`${appId}.${operation}.allow_by_default`]
    };
    return {
        version: '0.1.0',
        control_surfaces: [
            { id: 'voice', kind: 'voice_command', event_types: ['utterance', 'confirm', 'cancel'], intent_resolver: 'nl_policy_compiler', logic_bindings: [logicBinding] },
            { id: 'gesture', kind: 'captouch_or_wrist', event_types: ['tap', 'swipe', 'hold', 'wrist_raise'], intent_resolver: 'gesture_mapping_table', logic_bindings: [logicBinding] },
            { id: 'mouse', kind: 'pointer', event_types: ['click', 'double_click', 'hover', 'focus'], intent_resolver: 'pointer_mapping_table', logic_bindings: [logicBinding] },
            { id: 'agent', kind: 'ai_agent', event_types: ['proposal', 'autonomous_invoke', 'scheduled_action'], intent_resolver: 'structured_agent_intent', logic_bindings: [logicBinding] }
        ],
        intent_bindings: [{
            intent: `${appId}.${operation}`,
            method: operation,
            allowed_surfaces: ['voice', 'gesture', 'mouse', 'agent'],
            logic_bindings: [logicBinding]
        }],
        policy_hooks: {
            compile_api: 'hallucinate_app.control_surface_policy.compile_control_surface_policy_rule',
            evaluate_api: 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction',
            decision_receipt: true
        },
        logic_bindings: [logicBinding],
        mediation_receipts: {
            decision_schema_ref: 'policy_decision',
            receipt_schema_ref: 'mediation_receipt',
            emit_for_outcomes: ['allow', 'deny', 'require_confirmation', 'defer', 'rewrite', 'fallback_surface', 'rate_limit'],
            store: 'audit_log'
        }
    };
}

function selectedLogicBindings(contract, surface, intentBinding, surfaceId, method) {
    return [
        ...(Array.isArray(contract.logic_bindings) ? contract.logic_bindings : []),
        ...(Array.isArray(surface?.logic_bindings) ? surface.logic_bindings : []),
        ...(Array.isArray(intentBinding?.logic_bindings) ? intentBinding.logic_bindings : [])
    ].filter((binding) => {
        const surfaceMatch = !Array.isArray(binding.surface_refs) || binding.surface_refs.includes(surfaceId);
        const methodMatch = !Array.isArray(binding.method_refs) || binding.method_refs.includes(method);
        return surfaceMatch && methodMatch;
    }).map((binding) => ({
        binding_id: binding.binding_id,
        policy_bundle_ref: binding.policy_bundle_ref,
        compiled_policy_cid: binding.compiled_policy_cid,
        surface_ref: surfaceId,
        method_ref: method,
        norm_refs: Array.isArray(binding.norm_refs) ? binding.norm_refs : []
    }));
}

function firstPolicyRef(contract, surface, intentBinding) {
    return selectedBindingValue(contract, surface, intentBinding, 'policy_bundle_ref') || {
        policy_id: 'policy:browser-control-surface-default',
        policy_cid: 'local:browser-control-surface-default',
        version: '0.1.0',
        scope: 'descriptor',
        source: 'descriptor'
    };
}

function firstCompiledPolicyCid(contract, surface, intentBinding) {
    return selectedBindingValue(contract, surface, intentBinding, 'compiled_policy_cid') || 'local:browser-compiled-control-surface-default';
}

function selectedBindingValue(contract, surface, intentBinding, key) {
    return [
        ...(Array.isArray(contract.logic_bindings) ? contract.logic_bindings : []),
        ...(Array.isArray(surface?.logic_bindings) ? surface.logic_bindings : []),
        ...(Array.isArray(intentBinding?.logic_bindings) ? intentBinding.logic_bindings : [])
    ].find((binding) => binding && binding[key])?.[key];
}

function defaultSurfaceEvent(surface) {
    return {
        voice: 'utterance',
        gesture: 'tap',
        mouse: 'click',
        agent: 'autonomous_invoke'
    }[surface] || 'click';
}

function frameFact(interactionId, kind, predicate, value) {
    return {
        fact_id: localCid({ interactionId, kind, predicate, value }),
        kind,
        subject: interactionId,
        predicate,
        value,
        attrs: {}
    };
}

function objectPayload(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function localCid(value) {
    return `local:${hashString(stableStringify(value))}`;
}

function hashString(input) {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(16);
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
