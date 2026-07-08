/**
 * Browser-safe mirror of `src/services/mcp/libp2p-browser-runtime.ts` for the
 * SwissKnife `web/` static bundle.
 *
 * `web/js/apps/mcp-control.js` and `web/js/apps/p2p-network.js` are
 * `browser-safe` app modules (see `browserSafe()` in
 * `src/services/apps/app-manifest-registry.ts`): they must remain plain,
 * directly executable ES modules with no TypeScript-only syntax, because
 * they are served as-is both by the Vite `web/` bundle (`vite.web.config.ts`
 * sets `root: web/`) and by the raw static file server used by
 * `build-tools/configs/playwright.meta-glasses.config.ts`
 * (`python3 -m http.server --directory web`). A plain static file server has
 * no TypeScript transform and no special MIME type mapping for `.ts` files,
 * so importing the canonical `src/services/mcp/libp2p-browser-runtime.ts`
 * module (which uses `export type`/`interface` syntax) directly from these
 * app files is not viable. This file is the browser-safe counterpart that
 * both serving strategies can load unmodified, and it intentionally mirrors
 * the same runtime behavior as the canonical TypeScript module.
 *
 * The browser stack intentionally uses real libp2p modules only. Optional
 * packages that are not installed are reported as capability gaps and are
 * left out of the config instead of being replaced by local stand-ins.
 */

/**
 * @typedef {'libp2p'|'webrtc'|'websockets'|'circuit-relay-v2'|'noise'|'yamux'|'identify'|'gossipsub'} BrowserLibp2pCapabilityName
 * @typedef {(specifier: string) => Promise<Record<string, unknown>>} BrowserLibp2pImport
 * @typedef {{ name: BrowserLibp2pCapabilityName, packageName: string, reason: string }} BrowserLibp2pCapabilityGap
 * @typedef {{ name: BrowserLibp2pCapabilityName, packageName: string, installed: boolean, configured: boolean, exportName?: string, reason?: string }} BrowserLibp2pCapabilityStatus
 * @typedef {{ enabled: boolean, capabilities: BrowserLibp2pCapabilityStatus[], gaps: BrowserLibp2pCapabilityGap[] }} BrowserLibp2pRuntimeReport
 * @typedef {{ enabled?: boolean, includeWebRTC?: boolean, includeWebSockets?: boolean, includeCircuitRelay?: boolean, includeNoise?: boolean, includeYamux?: boolean, includeIdentify?: boolean, includeGossipSub?: boolean, libp2pOptions?: Record<string, unknown>, importModule?: BrowserLibp2pImport }} BrowserLibp2pRuntimeOptions
 * @typedef {{ config: Record<string, unknown>, report: BrowserLibp2pRuntimeReport }} BrowserLibp2pRuntimeConfig
 * @typedef {BrowserLibp2pRuntimeConfig & { node: unknown }} BrowserLibp2pNodeRuntime
 * @typedef {{ report: BrowserLibp2pRuntimeReport, listenMultiaddrs: string[], generatedAt: string }} BrowserLibp2pDefaultStatus
 */

const DEFAULT_LISTEN_MULTIADDRS = ['/webrtc'];

/** Order matches `BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER` below. */
const MODULES = {
    libp2p: {
        name: 'libp2p',
        packageNames: ['libp2p'],
        exportNames: ['createLibp2p']
    },
    webrtc: {
        name: 'webrtc',
        packageNames: ['@libp2p/webrtc'],
        exportNames: ['webRTC']
    },
    websockets: {
        name: 'websockets',
        packageNames: ['@libp2p/websockets'],
        exportNames: ['webSockets']
    },
    relay: {
        name: 'circuit-relay-v2',
        packageNames: ['@libp2p/circuit-relay-v2'],
        exportNames: ['circuitRelayTransport']
    },
    noise: {
        name: 'noise',
        packageNames: ['@chainsafe/libp2p-noise'],
        exportNames: ['noise']
    },
    yamux: {
        name: 'yamux',
        packageNames: ['@chainsafe/libp2p-yamux'],
        exportNames: ['yamux']
    },
    identify: {
        name: 'identify',
        packageNames: ['@libp2p/identify'],
        exportNames: ['identify']
    },
    gossipsub: {
        name: 'gossipsub',
        packageNames: ['@libp2p/gossipsub', '@chainsafe/libp2p-gossipsub'],
        exportNames: ['gossipsub']
    }
};

/**
 * Canonical capability probe order used by `BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER`
 * consumers (`web/js/apps/mcp-control.js`, `web/js/apps/p2p-network.js`) to
 * render a deterministic capability list.
 * @type {BrowserLibp2pCapabilityName[]}
 */
export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = [
    'libp2p',
    'webrtc',
    'websockets',
    'circuit-relay-v2',
    'noise',
    'yamux',
    'identify',
    'gossipsub'
];

/** @type {BrowserLibp2pImport} */
const defaultImportModule = async specifier => {
    return import(/* @vite-ignore */ specifier);
};

function enabled(value) {
    return value !== false;
}

function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function asArray(value) {
    return Array.isArray(value) ? [...value] : [];
}

function gapReason(error) {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
}

/**
 * @param {{name: BrowserLibp2pCapabilityName, packageNames: string[], exportNames: string[]}} spec
 * @param {BrowserLibp2pImport} importModule
 * @param {BrowserLibp2pCapabilityStatus[]} statuses
 * @param {BrowserLibp2pCapabilityGap[]} gaps
 */
async function loadOptionalModule(spec, importModule, statuses, gaps) {
    const reasons = [];

    for (const packageName of spec.packageNames) {
        try {
            const module = await importModule(packageName);
            for (const exportName of spec.exportNames) {
                const exported = module[exportName];
                if (typeof exported === 'function') {
                    statuses.push({
                        name: spec.name,
                        packageName,
                        exportName,
                        installed: true,
                        configured: false
                    });
                    return { spec, packageName, exportName, factory: exported };
                }
            }

            const reason = `Installed package ${packageName} does not export ${spec.exportNames.join(' or ')}`;
            statuses.push({ name: spec.name, packageName, installed: true, configured: false, reason });
            gaps.push({ name: spec.name, packageName, reason });
            return null;
        } catch (err) {
            reasons.push(`${packageName}: ${gapReason(err)}`);
        }
    }

    const packageName = spec.packageNames.join(' | ');
    const reason = `Optional libp2p package unavailable (${reasons.join('; ')})`;
    statuses.push({ name: spec.name, packageName, installed: false, configured: false, reason });
    gaps.push({ name: spec.name, packageName, reason });
    return null;
}

function markConfigured(statuses, load) {
    const status = statuses.find(
        candidate =>
            candidate.name === load.spec.name &&
            candidate.packageName === load.packageName &&
            candidate.exportName === load.exportName
    );
    if (status) status.configured = true;
}

function addFactory(key, config, load, statuses, gaps) {
    try {
        config[key] = [...asArray(config[key]), load.factory()];
        markConfigured(statuses, load);
    } catch (err) {
        const reason = `Failed to initialize ${load.packageName}: ${gapReason(err)}`;
        gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
    }
}

function addServiceFactory(serviceName, config, load, statuses, gaps) {
    try {
        const services = asRecord(config.services);
        services[serviceName] = load.factory();
        config.services = services;
        markConfigured(statuses, load);
    } catch (err) {
        const reason = `Failed to initialize ${load.packageName}: ${gapReason(err)}`;
        gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
    }
}

/**
 * @param {BrowserLibp2pRuntimeOptions} [options]
 * @returns {Promise<BrowserLibp2pRuntimeConfig>}
 */
export async function buildBrowserLibp2pConfig(options = {}) {
    const config = { ...(options.libp2pOptions || {}) };
    const statuses = [];
    const gaps = [];
    const importModule = options.importModule || defaultImportModule;

    if (!enabled(options.enabled)) {
        return { config, report: { enabled: false, capabilities: statuses, gaps } };
    }

    const addresses = asRecord(config.addresses);
    if (!Array.isArray(addresses.listen)) {
        addresses.listen = DEFAULT_LISTEN_MULTIADDRS;
        config.addresses = addresses;
    }

    if (enabled(options.includeWebRTC)) {
        const webrtc = await loadOptionalModule(MODULES.webrtc, importModule, statuses, gaps);
        if (webrtc) addFactory('transports', config, webrtc, statuses, gaps);
    }

    if (enabled(options.includeWebSockets)) {
        const websockets = await loadOptionalModule(MODULES.websockets, importModule, statuses, gaps);
        if (websockets) addFactory('transports', config, websockets, statuses, gaps);
    }

    if (enabled(options.includeCircuitRelay)) {
        const relay = await loadOptionalModule(MODULES.relay, importModule, statuses, gaps);
        if (relay) addFactory('transports', config, relay, statuses, gaps);
    }

    if (enabled(options.includeNoise)) {
        const noise = await loadOptionalModule(MODULES.noise, importModule, statuses, gaps);
        if (noise) addFactory('connectionEncryption', config, noise, statuses, gaps);
    }

    if (enabled(options.includeYamux)) {
        const yamux = await loadOptionalModule(MODULES.yamux, importModule, statuses, gaps);
        if (yamux) addFactory('streamMuxers', config, yamux, statuses, gaps);
    }

    if (enabled(options.includeIdentify)) {
        const identify = await loadOptionalModule(MODULES.identify, importModule, statuses, gaps);
        if (identify) addServiceFactory('identify', config, identify, statuses, gaps);
    }

    if (enabled(options.includeGossipSub)) {
        const gossipSub = await loadOptionalModule(MODULES.gossipsub, importModule, statuses, gaps);
        if (gossipSub) addServiceFactory('pubsub', config, gossipSub, statuses, gaps);
    }

    return { config, report: { enabled: true, capabilities: statuses, gaps } };
}

/**
 * @param {BrowserLibp2pRuntimeOptions} [options]
 * @returns {Promise<BrowserLibp2pNodeRuntime>}
 */
export async function createBrowserLibp2pNode(options = {}) {
    const importModule = options.importModule || defaultImportModule;
    const runtime = await buildBrowserLibp2pConfig({ ...options, importModule });
    const statuses = [...runtime.report.capabilities];
    const gaps = [...runtime.report.gaps];

    const libp2p = await loadOptionalModule(MODULES.libp2p, importModule, statuses, gaps);
    if (!libp2p) {
        throw new Error(`Browser libp2p unavailable: ${gaps.map(gap => gap.reason).join('; ')}`);
    }

    const node = await libp2p.factory(runtime.config);
    markConfigured(statuses, libp2p);

    return {
        node,
        config: runtime.config,
        report: { enabled: runtime.report.enabled, capabilities: statuses, gaps }
    };
}

/**
 * Produces a best-effort capability status report for every capability in
 * `BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER`, including the core `libp2p`
 * package itself (which `buildBrowserLibp2pConfig()` alone does not probe,
 * since that package is only loaded lazily by `createBrowserLibp2pNode()`).
 * Used by `web/js/apps/mcp-control.js` and `web/js/apps/p2p-network.js` to
 * render the "Browser libp2p Defaults" panel without dialing a real node.
 * @param {BrowserLibp2pRuntimeOptions} [options]
 * @returns {Promise<BrowserLibp2pDefaultStatus>}
 */
export async function getBrowserLibp2pDefaultStatus(options = {}) {
    const importModule = options.importModule || defaultImportModule;
    const runtime = await buildBrowserLibp2pConfig({
        includeWebRTC: true,
        includeWebSockets: true,
        includeCircuitRelay: true,
        includeNoise: true,
        includeYamux: true,
        includeIdentify: true,
        includeGossipSub: true,
        ...options,
        importModule
    });

    const capabilities = [...runtime.report.capabilities];
    const gaps = [...runtime.report.gaps];
    await loadOptionalModule(MODULES.libp2p, importModule, capabilities, gaps);

    const addresses = asRecord(runtime.config && runtime.config.addresses);
    const listenMultiaddrs = Array.isArray(addresses.listen)
        ? [...addresses.listen]
        : [...DEFAULT_LISTEN_MULTIADDRS];

    return {
        report: { enabled: runtime.report.enabled, capabilities, gaps },
        listenMultiaddrs,
        generatedAt: new Date().toISOString()
    };
}

/**
 * @param {BrowserLibp2pRuntimeReport} report
 * @returns {string[]}
 */
export function summarizeBrowserLibp2pGaps(report) {
    return report.gaps.map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}
