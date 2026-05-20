import { validateDescriptor } from './idl-contracts.js';
import { renderTemplate } from './ui-templates.js';
import { OrbClient } from './orb-client.js';

export class DescriptorAppRuntime {
    constructor(options = {}) {
        this.orbClient = options.orbClient || new OrbClient();
        this.descriptors = new Map();
        this.appStates = new Map();
        this.replayLog = [];
        this.sequence = 0;
        this.streams = new Map();
        this.streamStartQueue = new Map();
        this.streamGeneration = new Map();

        (options.descriptors || []).forEach((descriptor) => this.registerDescriptor(descriptor));
    }

    registerDescriptor(descriptor) {
        const validation = validateDescriptor(descriptor);
        if (!validation.valid) {
            throw new Error(`Invalid descriptor "${descriptor?.meta?.id || 'unknown'}": ${validation.errors.join(', ')}`);
        }

        this.descriptors.set(descriptor.meta.id, descriptor);
        return descriptor.meta.id;
    }

    getDescriptor(appId) {
        return this.descriptors.get(appId);
    }

    getDesktopRegistrations() {
        const registrations = [];
        for (const descriptor of this.descriptors.values()) {
            registrations.push({
                appId: descriptor.meta.id,
                name: descriptor.ui.window.title || descriptor.meta.name,
                icon: descriptor.ui.window.icon || '🧩',
                component: 'DescriptorAppComponent',
                singleton: descriptor.ui.window.singleton ?? true,
                descriptorApp: true
            });
        }
        return registrations;
    }

    ensureState(appId, descriptor) {
        if (!this.appStates.has(appId)) {
            this.appStates.set(appId, {
                local: {},
                remote: {},
                derived: {},
                conflictPolicy: descriptor?.stateModel?.conflictPolicy || 'last-write-wins'
            });
        }
        return this.appStates.get(appId);
    }

    recordReplay(appId, event, payload = {}, correlationId = null) {
        const entry = {
            seq: ++this.sequence,
            ts: Date.now(),
            appId,
            event,
            correlationId,
            payload
        };
        this.replayLog.push(entry);
        return entry;
    }

    getReplayLog(appId = null) {
        if (!appId) return [...this.replayLog];
        return this.replayLog.filter((entry) => entry.appId === appId);
    }

    async renderApp(appId, options = {}) {
        const descriptor = this.getDescriptor(appId);
        if (!descriptor) throw new Error(`Descriptor not found for app: ${appId}`);

        const state = this.ensureState(appId, descriptor);
        const correlationId = this.orbClient.createCorrelationId(appId);

        this.recordReplay(appId, 'discover', {}, correlationId);

        const serviceStatuses = [];
        for (const service of descriptor.services) {
            try {
                await this.orbClient.discover(service);
                await this.orbClient.bind(service);
                await this.orbClient.authorize(service, {
                    claims: descriptor.permissions || [],
                    correlationId
                });
                serviceStatuses.push({ name: service.name, status: 'connected' });
            } catch (error) {
                await this.orbClient.recover(service, 'service_bind_failure');
                serviceStatuses.push({ name: service.name, status: `error: ${error.message}` });
            }
        }

        const html = renderTemplate(descriptor.ui.template, {
            title: descriptor.ui.window.title || descriptor.meta.name,
            description: descriptor.meta.description,
            regions: descriptor.ui.regions || [],
            commands: descriptor.ui.commands || [],
            services: serviceStatuses,
            policyState: 'ready'
        });

        if (options.contentElement) {
            options.contentElement.innerHTML = html;
            this.bindActions(appId, descriptor, options.contentElement, correlationId);
        }

        await this.scheduleStartStreams(appId, descriptor, correlationId);
        this.recordReplay(appId, 'rendered', { serviceStatuses }, correlationId);

        return { html, state, correlationId };
    }

    bindActions(appId, descriptor, container, correlationId) {
        const actionMap = descriptor.actions || {};
        container.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action;
                const actionConfig = actionMap[action];
                if (!actionConfig) return;

                const serviceRef = descriptor.services.find((service) => service.name === actionConfig.service);
                if (!serviceRef) return;

                this.recordReplay(appId, 'invoke', { action }, correlationId);
                await this.orbClient.invoke(serviceRef, actionConfig.operation, actionConfig.payload || {}, { correlationId });
            });
        });
    }

    hasStreamStateChanged(appId, generation, streamBucket) {
        return this.streamGeneration.get(appId) !== generation || this.streams.get(appId) !== streamBucket;
    }

    async startStreams(appId, descriptor, correlationId) {
        const generation = (this.streamGeneration.get(appId) || 0) + 1;
        this.streamGeneration.set(appId, generation);

        const active = this.streams.get(appId) || [];
        active.forEach((stream) => stream?.close?.());

        const streamBucket = [];
        this.streams.set(appId, streamBucket);

        const streamDefs = descriptor.services.flatMap((service) =>
            (service.streams || []).map((streamName) => ({ service, streamName }))
        );

        await Promise.all(streamDefs.map(async ({ service, streamName }) => {
            const streamHandle = await this.orbClient.stream(service, streamName, (event) => {
                this.recordReplay(appId, 'stream', { streamName, event }, correlationId);
            });

            if (this.hasStreamStateChanged(appId, generation, streamBucket)) {
                streamHandle?.close?.();
                return;
            }

            streamBucket.push(streamHandle);
        }));
    }

    async scheduleStartStreams(appId, descriptor, correlationId) {
        const previous = this.streamStartQueue.get(appId) || Promise.resolve();
        const queuedStart = previous
            .catch((error) => {
                console.warn(`Previous stream initialization failed for ${appId}:`, error);
            })
            .then(() => this.startStreams(appId, descriptor, correlationId));

        this.streamStartQueue.set(appId, queuedStart);
        await queuedStart;
    }
}
