/**
 * Browser libp2p runtime status mirror (SWR-027 browser-truth policy).
 *
 * This is a hand-maintained plain-JavaScript mirror of
 * `src/services/mcp/libp2p-browser-runtime.ts`. The SwissKnife desktop web
 * bundle (`web/`) is served as static files without a TypeScript build step,
 * so browser app modules (`web/js/apps/mcp-control.js`,
 * `web/js/apps/p2p-network.js`) cannot `import` the canonical `.ts` module
 * directly at runtime — the same constraint documented next to
 * `MCP_DASHBOARD_BROWSER_POLICY` in `mcp-control.js`. This module keeps the
 * exported names, default capability order, and default-status report shape
 * identical to the canonical TypeScript source so the two never silently
 * drift; `scripts/test-mcp-dashboard-consumer.cjs` and the Playwright
 * `meta-glasses-virtual-os.spec.ts` gate both exercise this file directly.
 *
 * Only the optional transport/encryption/muxer/service packages and the core
 * `libp2p` package are probed here (via dynamic `import()`); this module
 * never constructs a live libp2p node, matching `getBrowserLibp2pDefaultStatus`
 * in the canonical source.
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

const DEFAULT_LISTEN_MULTIADDRS = ['/webrtc'];

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

function gapReason(error) {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
}

async function loadOptionalModule(spec, statuses, gaps) {
    const reasons = [];

    for (const packageName of spec.packageNames) {
        try {
            const module = await import(/* @vite-ignore */ packageName);
            const exportedName = spec.exportNames.find(name => typeof module[name] === 'function');
            if (exportedName) {
                statuses.push({
                    name: spec.name,
                    packageName,
                    exportName: exportedName,
                    installed: true,
                    configured: false
                });
                return;
            }

            const reason = `Installed package ${packageName} does not export ${spec.exportNames.join(' or ')}`;
            statuses.push({
                name: spec.name,
                packageName,
                installed: true,
                configured: false,
                reason
            });
            gaps.push({ name: spec.name, packageName, reason });
            return;
        } catch (err) {
            reasons.push(`${packageName}: ${gapReason(err)}`);
        }
    }

    const packageName = spec.packageNames.join(' | ');
    const reason = `Optional libp2p package unavailable (${reasons.join('; ')})`;
    statuses.push({
        name: spec.name,
        packageName,
        installed: false,
        configured: false,
        reason
    });
    gaps.push({ name: spec.name, packageName, reason });
}

/**
 * Build the default browser libp2p capability status used by the MCP
 * Control and P2P Network desktop apps. Mirrors
 * `getBrowserLibp2pDefaultStatus` from `src/services/mcp/libp2p-browser-runtime.ts`.
 */
export async function getBrowserLibp2pDefaultStatus() {
    const statuses = [];
    const gaps = [];

    for (const key of ['webrtc', 'websockets', 'relay', 'noise', 'yamux', 'identify', 'gossipsub', 'libp2p']) {
        await loadOptionalModule(MODULES[key], statuses, gaps);
    }

    return {
        report: {
            enabled: true,
            capabilities: statuses,
            gaps
        },
        listenMultiaddrs: [...DEFAULT_LISTEN_MULTIADDRS],
        generatedAt: new Date().toISOString()
    };
}

/**
 * Mirrors `summarizeBrowserLibp2pGaps` from the canonical TypeScript source.
 */
export function summarizeBrowserLibp2pGaps(report) {
    return (report?.gaps || []).map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}
