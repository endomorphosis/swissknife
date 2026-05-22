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
        if (this.transport && typeof this.transport.invoke === 'function') {
            return this.transport.invoke(serviceRef, operation, payload, correlationId);
        }

        return {
            ok: true,
            correlationId,
            operation,
            service: serviceRef.name,
            payload,
            timestamp: new Date().toISOString()
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
