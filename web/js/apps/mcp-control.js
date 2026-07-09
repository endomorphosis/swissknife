import { getHallucinateBackendBridge } from '../hallucinate-backend-bridge.js';
import {
    BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER,
    getBrowserLibp2pDefaultStatus,
    summarizeBrowserLibp2pGaps
} from '../core/libp2p-browser-runtime-browser.js';

const LIBP2P_BROWSER_CAPABILITY_LABELS = {
    webrtc: 'WebRTC',
    websockets: 'WebSockets',
    'circuit-relay-v2': 'Circuit Relay v2',
    identify: 'Identify',
    noise: 'Noise',
    yamux: 'Yamux',
    gossipsub: 'GossipSub'
};

// ---------------------------------------------------------------------------
// MCP dashboard browser-truth policy (SWR-027)
//
// The MCP Control dashboard renders two fundamentally different kinds of
// "server" entries and must never blur the line between them:
//
//   - "browser-remote"      HTTP(S), WebSocket, or libp2p endpoints that the
//                           SwissKnife browser build connects to directly
//                           (fetch / WebSocket / browser libp2p).
//   - "host-daemon-command" A shell command (npx ..., uvicorn main:app,
//                           python server.py, ...) that only a host process
//                           (Electron main process, desktop app, CLI, or a
//                           configured MCP daemon) can execute. The command
//                           text is a *record*, never something the browser
//                           runs — this is true even when the command text
//                           references a Python interpreter/server.
//
// This block is a literal, hand-maintained mirror of the canonical policy in
// `src/services/mcp/mcp-dashboard-browser-policy.ts` (this file is plain
// browser JavaScript and is not compiled from TypeScript, so it cannot
// `import` that module at runtime). `scripts/test-mcp-dashboard-consumer.cjs`
// cross-checks the two sources so they cannot silently drift. See
// `docs/mcp-dashboard-browser-policy.md` for the full policy writeup.
// ---------------------------------------------------------------------------

const MCP_DASHBOARD_BROWSER_POLICY = Object.freeze({
    schema: 'swissknife.mcp_dashboard_browser_policy.v1',
    browserConnectableTransports: Object.freeze(['http', 'https', 'websocket', 'libp2p']),
    hostDaemonCommandDisclaimer:
        'Host-managed daemon command \u2014 record only. SwissKnife web builds never execute this command in the browser; a host process (desktop app, CLI, or configured MCP daemon) must run it.',
    pythonHostDaemonCommandDisclaimer:
        'Host-managed daemon command \u2014 record only. SwissKnife web builds never execute this command in the browser; a host process (desktop app, CLI, or configured MCP daemon) must run it. This example text references a Python interpreter/server; it documents the host command only and is never parsed or executed by any in-browser Python code interpreter.',
    hostCommandInterpreters: Object.freeze([
        'python3', 'python', 'uvicorn', 'gunicorn', 'pip3', 'pip',
        'node', 'npx', 'npm', 'deno', 'bun', 'java', 'dotnet', 'ruby', 'php', 'go', 'cargo',
    ]),
});

const MCP_DASHBOARD_PYTHON_HOST_INTERPRETERS = new Set(['python', 'python3', 'uvicorn', 'gunicorn', 'pip', 'pip3']);
const MCP_DASHBOARD_PYTHON_TEXT_PATTERN = /\bpython[0-9.]*\b/i;

/** Extracts the leading interpreter/launcher token from a host command string. */
function detectMcpDashboardHostCommandInterpreter(command) {
    const first = String(command || '').trim().split(/\s+/)[0] || '';
    if (!first) return null;
    const base = first.split('/').pop() || first;
    return base || null;
}

/** True when a host daemon command string references a Python-family interpreter/server. */
function isPythonHostDaemonCommand(command) {
    const interpreter = detectMcpDashboardHostCommandInterpreter(command);
    if (interpreter && MCP_DASHBOARD_PYTHON_HOST_INTERPRETERS.has(interpreter)) return true;
    return MCP_DASHBOARD_PYTHON_TEXT_PATTERN.test(String(command || ''));
}

/**
 * Classifies a host-managed daemon launch command for dashboard rendering.
 * Never executes the command; only labels the text so it cannot be mistaken
 * for something the browser runs.
 */
function describeMcpDashboardHostDaemonCommand(command, args) {
    const interpreter = detectMcpDashboardHostCommandInterpreter(command);
    const isPython = isPythonHostDaemonCommand(command);
    return {
        kind: 'host-daemon-command',
        command,
        args: args || [],
        interpreter,
        isPythonCommand: isPython,
        browserExecutable: false,
        badgeLabel: 'HOST DAEMON COMMAND',
        disclaimer: isPython
            ? MCP_DASHBOARD_BROWSER_POLICY.pythonHostDaemonCommandDisclaimer
            : MCP_DASHBOARD_BROWSER_POLICY.hostDaemonCommandDisclaimer,
    };
}

/** Normalizes a user-supplied protocol/URL pair to a canonical transport name. */
function normalizeMcpDashboardTransport(transport, url) {
    const normalized = String(transport || '').toLowerCase().trim();
    if (normalized === 'ws' || normalized === 'wss') return 'websocket';
    if (normalized) return normalized;
    if (/^wss?:\/\//i.test(url || '')) return 'websocket';
    if (/^https:\/\//i.test(url || '')) return 'https';
    if (/^http:\/\//i.test(url || '')) return 'http';
    if (/^\/(?:dnsaddr|ip4|ip6|dns4|dns6)\//i.test(url || '') || /^libp2p:/i.test(url || '')) return 'libp2p';
    return normalized || 'http';
}

/** Classifies a remote MCP endpoint URL/protocol pair as a browser-connectable remote. */
function describeMcpDashboardRemoteEntry(url, transport) {
    const resolved = normalizeMcpDashboardTransport(transport, url);
    return {
        kind: 'browser-remote',
        transport: resolved,
        url,
        browserExecutable: MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports.includes(resolved),
        badgeLabel: 'BROWSER REMOTE',
    };
}

// Enhanced MCP Server Control App with Real-Time Monitoring and External Connections
class MCPControlApp {
    constructor() {
        this.name = 'MCP Control';
        this.icon = '🔌';
        this.servers = new Map();
        this.connections = new Map(); // Active WebSocket connections
        this.refreshInterval = null;
        this.discoveryInterval = null;
        this.serverTemplates = new Map();
        this.connectionHistory = [];
        this.performanceMetrics = new Map();
        this.autoDiscovery = true;
        this.remoteServers = new Map(); // Remote MCP servers
        this.hallucinateBridge = getHallucinateBackendBridge();
        this.hallucinateSnapshot = null;
        this.libp2pBrowserDefaults = null;
        this.libp2pBrowserDefaultsError = null;
        this.libp2pBrowserDefaultsLoading = false;
        this.libp2pBrowserDefaultsPromise = null;
        
        // Initialize common server templates
        this.initializeServerTemplates();
        
        // Start auto-discovery
        this.startAutoDiscovery();
        
        // Load saved servers and connections
        this.loadSavedData();

        // Reconcile Electron-supervised Hallucinate/IPFS daemons when hosted in the app.
        this.syncHallucinateDaemons().catch(error => {
            console.warn('Failed to sync Hallucinate daemon catalog:', error);
        });
        this.refreshLibp2pBrowserDefaults({ silent: true }).catch(error => {
            console.warn('Failed to load browser libp2p defaults:', error);
        });
    }

    initializeServerTemplates() {
        // Common MCP server configurations
        this.serverTemplates.set('filesystem', {
            name: 'File System Server',
            description: 'Access and manage local file system',
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem'],
            env: {},
            autoStart: false,
            category: 'core',
            icon: '📁'
        });
        
        this.serverTemplates.set('github', {
            name: 'GitHub Integration',
            description: 'Access GitHub repositories and issues',
            command: 'npx',
            args: ['@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '' },
            autoStart: false,
            category: 'integration',
            icon: '🐙'
        });
        
        this.serverTemplates.set('sqlite', {
            name: 'SQLite Database',
            description: 'Query and manage SQLite databases',
            command: 'npx',
            args: ['@modelcontextprotocol/server-sqlite'],
            env: {},
            autoStart: false,
            category: 'database',
            icon: '🗄️'
        });
        
        this.serverTemplates.set('google-drive', {
            name: 'Google Drive',
            description: 'Access Google Drive files and folders',
            command: 'npx',
            args: ['@modelcontextprotocol/server-gdrive'],
            env: { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
            autoStart: false,
            category: 'cloud',
            icon: '☁️'
        });
        
        this.serverTemplates.set('brave-search', {
            name: 'Brave Search',
            description: 'Web search capabilities via Brave Search API',
            command: 'npx',
            args: ['@modelcontextprotocol/server-brave-search'],
            env: { BRAVE_API_KEY: '' },
            autoStart: false,
            category: 'search',
            icon: '🔍'
        });
        
        this.serverTemplates.set('postgres', {
            name: 'PostgreSQL Database',
            description: 'Connect to PostgreSQL databases',
            command: 'npx',
            args: ['@modelcontextprotocol/server-postgres'],
            env: { POSTGRES_CONNECTION_STRING: '' },
            autoStart: false,
            category: 'database',
            icon: '🐘'
        });
        
        this.serverTemplates.set('puppeteer', {
            name: 'Web Automation',
            description: 'Browser automation with Puppeteer',
            command: 'npx',
            args: ['@modelcontextprotocol/server-puppeteer'],
            env: {},
            autoStart: false,
            category: 'automation',
            icon: '🎭'
        });
        
        this.serverTemplates.set('fetch', {
            name: 'HTTP Fetch',
            description: 'Make HTTP requests and fetch web content',
            command: 'npx',
            args: ['@modelcontextprotocol/server-fetch'],
            env: {},
            autoStart: false,
            category: 'network',
            icon: '🌐'
        });
    }

    async render() {
        await this.refreshLibp2pBrowserDefaults({ silent: true });
        return `
            <div class="mcp-control-app enhanced">
                ${this.renderLibp2pBrowserStyles()}
                <div class="mcp-header">
                    <div class="header-left">
                        <h2>🔌 MCP Server Control Center</h2>
                        <div class="server-status">
                            <span class="status-indicator" title="${MCP_DASHBOARD_BROWSER_POLICY.hostDaemonCommandDisclaimer}">
                                🟢 ${this.getActiveServerCount()} host daemon commands running
                            </span>
                            <span class="status-indicator" title="Browser-connectable remotes: ${MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports.join(', ')}">
                                🌐 ${this.connections.size} browser-connected remotes
                            </span>
                            <span class="discovery-status">
                                ${this.autoDiscovery ? '🔍 Auto-discovery ON' : '🔍 Auto-discovery OFF'}
                            </span>
                        </div>
                    </div>
                    <div class="mcp-actions">
                        <button onclick="mcpControlApp.refreshServers()" class="btn-primary">🔄 Refresh</button>
                        <button onclick="mcpControlApp.showServerTemplates()" class="btn-secondary">📋 Templates</button>
                        <button onclick="mcpControlApp.showAddServer()" class="btn-secondary" title="${MCP_DASHBOARD_BROWSER_POLICY.hostDaemonCommandDisclaimer}">🖥️ Add Host Daemon</button>
                        <button onclick="mcpControlApp.showAddRemote()" class="btn-secondary" title="Browser-connectable remotes: ${MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports.join(', ')}">🌐 Add Browser Remote</button>
                        <button onclick="mcpControlApp.showDiscovery()" class="btn-secondary">🔍 Discovery</button>
                        <button onclick="mcpControlApp.showMetrics()" class="btn-secondary">📊 Metrics</button>
                        <button onclick="mcpControlApp.refreshLibp2pBrowserDefaults()" class="btn-secondary">🔄 libp2p</button>
                    </div>
                </div>
                
                <div class="mcp-content">
                    <div class="mcp-sidebar">
                        <div class="server-categories">
                            <h4>📂 Categories</h4>
                            <div class="category-list">
                                <div class="category-item active" data-category="all">
                                    <span class="category-icon">🔍</span>
                                    <span class="category-name">All Servers</span>
                                    <span class="category-count">${this.servers.size + this.remoteServers.size}</span>
                                </div>
                                <div class="category-item" data-category="local" title="${MCP_DASHBOARD_BROWSER_POLICY.hostDaemonCommandDisclaimer}">
                                    <span class="category-icon">🖥️</span>
                                    <span class="category-name">Host Daemon</span>
                                    <span class="category-count">${this.servers.size}</span>
                                </div>
                                <div class="category-item" data-category="remote" title="Browser-connectable remotes: ${MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports.join(', ')}">
                                    <span class="category-icon">🌐</span>
                                    <span class="category-name">Browser Remote</span>
                                    <span class="category-count">${this.remoteServers.size}</span>
                                </div>
                                <div class="category-item" data-category="core">
                                    <span class="category-icon">⚙️</span>
                                    <span class="category-name">Core</span>
                                    <span class="category-count">${this.getCategoryCount('core')}</span>
                                </div>
                                <div class="category-item" data-category="integration">
                                    <span class="category-icon">🔗</span>
                                    <span class="category-name">Integrations</span>
                                    <span class="category-count">${this.getCategoryCount('integration')}</span>
                                </div>
                                <div class="category-item" data-category="database">
                                    <span class="category-icon">🗄️</span>
                                    <span class="category-name">Databases</span>
                                    <span class="category-count">${this.getCategoryCount('database')}</span>
                                </div>
                                <div class="category-item" data-category="cloud">
                                    <span class="category-icon">☁️</span>
                                    <span class="category-name">Cloud</span>
                                    <span class="category-count">${this.getCategoryCount('cloud')}</span>
                                </div>
                                <div class="category-item" data-category="custom">
                                    <span class="category-icon">🛠️</span>
                                    <span class="category-name">Custom</span>
                                    <span class="category-count">${this.getCategoryCount('custom')}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="quick-stats">
                            <h4>📊 Quick Stats</h4>
                            <div class="stat-item">
                                <span>Active Host Daemons:</span>
                                <span class="stat-value">${this.getActiveServerCount()}</span>
                            </div>
                            <div class="stat-item">
                                <span>Browser Remote Connections:</span>
                                <span class="stat-value">${this.connections.size}</span>
                            </div>
                            <div class="stat-item">
                                <span>Total Connections:</span>
                                <span class="stat-value">${this.connectionHistory.length}</span>
                            </div>
                            <div class="stat-item">
                                <span>Auto-start Enabled:</span>
                                <span class="stat-value">${this.getAutoStartCount()}</span>
                            </div>
                            <div class="stat-item">
                                <span>Templates Available:</span>
                                <span class="stat-value">${this.serverTemplates.size}</span>
                            </div>
                        </div>

                        <div id="mcp-libp2p-browser-panel">
                            ${this.renderLibp2pBrowserDefaultsPanel()}
                        </div>
                        
                        <div class="recent-activity">
                            <h4>🔔 Recent Activity</h4>
                            <div class="activity-list">
                                ${this.renderRecentActivity()}
                            </div>
                        </div>
                    </div>
                    
                    <div class="server-list-container">
                        <div class="list-header">
                            <div class="search-filter-bar">
                                <input type="text" id="server-search" placeholder="Search servers..." 
                                       onkeyup="mcpControlApp.filterServers()">
                                <select id="status-filter" onchange="mcpControlApp.filterServers()">
                                    <option value="">All Status</option>
                                    <option value="running">Running</option>
                                    <option value="connected">Connected</option>
                                    <option value="stopped">Stopped</option>
                                    <option value="error">Error</option>
                                </select>
                                <select id="type-filter" onchange="mcpControlApp.filterServers()">
                                    <option value="">All Types</option>
                                    <option value="local">Host Daemon</option>
                                    <option value="remote">Browser Remote</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="server-list" id="mcp-server-list">
                            ${this.renderServerList()}
                        </div>
                    </div>
                </div>
                
                ${this.renderModals()}
            </div>
        `;
    }

    renderLibp2pBrowserStyles() {
        return `
            <style>
                .libp2p-browser-defaults {
                    margin-top: 16px;
                    padding: 12px;
                    border: 1px solid #d8dee8;
                    border-radius: 8px;
                    background: #f8fafc;
                    color: #243041;
                }

                .libp2p-browser-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .libp2p-browser-header h4 {
                    margin: 0;
                    font-size: 14px;
                }

                .libp2p-browser-status {
                    font-weight: 600;
                    margin-bottom: 6px;
                }

                .libp2p-browser-meta {
                    color: #5d6b7c;
                    font-size: 12px;
                    line-height: 1.4;
                    margin-bottom: 10px;
                }

                .libp2p-browser-meta code,
                .libp2p-capability code {
                    white-space: normal;
                    word-break: break-word;
                }

                .libp2p-browser-capabilities,
                .libp2p-browser-gap-list {
                    display: grid;
                    gap: 8px;
                }

                .libp2p-capability,
                .libp2p-gap-row {
                    padding: 8px;
                    border: 1px solid #d8dee8;
                    border-left: 4px solid #94a3b8;
                    border-radius: 6px;
                    background: #ffffff;
                    font-size: 12px;
                }

                .libp2p-capability.configured {
                    border-left-color: #16a34a;
                }

                .libp2p-capability.gap,
                .libp2p-gap-row {
                    border-left-color: #d97706;
                    background: #fff7ed;
                }

                .libp2p-capability strong,
                .libp2p-capability code {
                    display: block;
                    margin-bottom: 3px;
                }

                .btn-sm {
                    padding: 4px 8px;
                    font-size: 12px;
                }
            </style>
        `;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async refreshLibp2pBrowserDefaults(options = {}) {
        if (this.libp2pBrowserDefaultsPromise) {
            return this.libp2pBrowserDefaultsPromise;
        }

        this.libp2pBrowserDefaultsLoading = true;
        this.libp2pBrowserDefaultsError = null;
        const shouldUpdate = options.silent !== true;
        if (shouldUpdate) this.refreshUI();

        this.libp2pBrowserDefaultsPromise = getBrowserLibp2pDefaultStatus()
            .then(status => {
                this.libp2pBrowserDefaults = status;
                this.libp2pBrowserDefaultsError = null;
                return status;
            })
            .catch(error => {
                this.libp2pBrowserDefaults = null;
                this.libp2pBrowserDefaultsError = error instanceof Error ? error.message : String(error);
                return null;
            })
            .finally(() => {
                this.libp2pBrowserDefaultsLoading = false;
                this.libp2pBrowserDefaultsPromise = null;
                if (shouldUpdate) this.refreshUI();
            });

        return this.libp2pBrowserDefaultsPromise;
    }

    getLibp2pCapability(name) {
        return this.libp2pBrowserDefaults?.report?.capabilities?.find(capability => capability.name === name) || null;
    }

    getLibp2pGap(name) {
        return this.libp2pBrowserDefaults?.report?.gaps?.find(gap => gap.name === name) || null;
    }

    renderLibp2pBrowserDefaultsPanel() {
        const report = this.libp2pBrowserDefaults?.report || null;
        const configuredCount = report?.capabilities?.filter(capability => capability.configured).length || 0;
        const gapCount = report?.gaps?.length || 0;
        const statusText = this.libp2pBrowserDefaultsLoading
            ? 'Checking browser packages'
            : this.libp2pBrowserDefaultsError
                ? 'Capability check failed'
                : report?.enabled === false
                    ? 'Disabled'
                    : `${configuredCount} configured, ${gapCount} gaps`;
        const listen = this.libp2pBrowserDefaults?.listenMultiaddrs?.length
            ? this.libp2pBrowserDefaults.listenMultiaddrs.join(', ')
            : 'not resolved yet';
        const updated = this.libp2pBrowserDefaults?.generatedAt
            ? new Date(this.libp2pBrowserDefaults.generatedAt).toLocaleTimeString()
            : 'pending';

        return `
            <div class="libp2p-browser-defaults" data-testid="mcp-libp2p-browser-defaults">
                <div class="libp2p-browser-header">
                    <h4>Browser libp2p Defaults</h4>
                    <button onclick="mcpControlApp.refreshLibp2pBrowserDefaults()" class="btn-secondary btn-sm">Refresh</button>
                </div>
                <div class="libp2p-browser-status" data-testid="mcp-libp2p-browser-status">
                    ${this.escapeHtml(statusText)}
                </div>
                <div class="libp2p-browser-meta">
                    Listen: <code>${this.escapeHtml(listen)}</code><br>
                    Updated: ${this.escapeHtml(updated)}
                </div>
                ${this.libp2pBrowserDefaultsError ? `
                    <div class="libp2p-capability gap">
                        <strong>Runtime status unavailable</strong>
                        <div>${this.escapeHtml(this.libp2pBrowserDefaultsError)}</div>
                    </div>
                ` : ''}
                <div class="libp2p-browser-capabilities">
                    ${BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER.map(name => {
                        const capability = this.getLibp2pCapability(name);
                        const gap = this.getLibp2pGap(name);
                        const state = capability?.configured ? 'configured' : 'gap';
                        const packageName = capability?.packageName || gap?.packageName || 'package check pending';
                        const detail = capability?.configured
                            ? `configured from ${capability.exportName || 'default export'}`
                            : gap?.reason || (this.libp2pBrowserDefaultsLoading ? 'checking installed package' : 'not configured');
                        return `
                            <div class="libp2p-capability ${state}" data-testid="mcp-libp2p-capability-${name}" data-installed="${Boolean(capability?.installed)}" data-configured="${Boolean(capability?.configured)}">
                                <strong>${this.escapeHtml(LIBP2P_BROWSER_CAPABILITY_LABELS[name] || name)}</strong>
                                <code>${this.escapeHtml(packageName)}</code>
                                <div>${this.escapeHtml(detail)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${report && report.gaps.length > 0 ? `
                    <div class="libp2p-browser-gap-list">
                        ${summarizeBrowserLibp2pGaps(report).map(summary => `
                            <div class="libp2p-gap-row">${this.escapeHtml(summary)}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderServerList() {
        const allServers = new Map([...this.servers, ...this.remoteServers]);
        
        if (allServers.size === 0) {
            return `
                <div class="no-servers">
                    <div class="no-servers-icon">🔌</div>
                    <h3>No MCP Servers Configured</h3>
                    <p>Add your first MCP server to get started with Model Context Protocol integration.</p>
                    <p class="browser-truth-note">
                        "Host Daemon" entries record a command line for a host process to run \u2014 the
                        browser never executes it. "Browser Remote" entries are HTTP(S), WebSocket, or
                        libp2p endpoints the browser build connects to directly.
                    </p>
                    <div class="quick-actions">
                        <button onclick="mcpControlApp.showServerTemplates()" class="btn-primary">
                            📋 Browse Templates
                        </button>
                        <button onclick="mcpControlApp.showAddServer()" class="btn-secondary">
                            🖥️ Add Host Daemon Command
                        </button>
                        <button onclick="mcpControlApp.showAddRemote()" class="btn-secondary">
                            🌐 Add Browser Remote
                        </button>
                    </div>
                </div>
            `;
        }
        
        return Array.from(allServers.entries()).map(([name, server]) => {
            const metrics = this.performanceMetrics.get(name) || {};
            const statusIcon = this.getStatusIcon(server.status);
            const statusClass = server.status || 'stopped';
            const isRemote = this.remoteServers.has(name);
            const entryDescriptor = isRemote
                ? describeMcpDashboardRemoteEntry(server.url, server.protocol)
                : describeMcpDashboardHostDaemonCommand(server.command, server.args);
            
            return `
                <div class="server-card ${statusClass} ${isRemote ? 'remote-server' : 'local-server'}">
                    <div class="server-header">
                        <div class="server-info">
                            <div class="server-title">
                                <span class="server-icon">${server.icon || (isRemote ? '🌐' : '🖥️')}</span>
                                <h4>${server.displayName || name}</h4>
                                <span class="server-category">${server.category || 'custom'}</span>
                                <span class="server-type ${isRemote ? 'server-type-remote' : 'server-type-host-daemon'}" title="${isRemote ? `Browser-connectable remote (${entryDescriptor.transport})` : entryDescriptor.disclaimer}">
                                    ${isRemote ? `BROWSER REMOTE \u00b7 ${entryDescriptor.transport.toUpperCase()}` : 'HOST DAEMON COMMAND'}
                                </span>
                            </div>
                            <div class="server-description">${server.description || 'No description'}</div>
                            <div class="server-command">
                                ${isRemote ?
                                    `<code>🌐 ${server.url}</code>` :
                                    `<code>${entryDescriptor.isPythonCommand ? '🐍' : '🖥️'} ${server.command} ${(server.args || []).join(' ')}</code>`
                                }
                            </div>
                            ${isRemote ? '' : `
                                <div class="host-daemon-disclaimer${entryDescriptor.isPythonCommand ? ' python-command-disclaimer' : ''}">
                                    ⚠️ ${entryDescriptor.disclaimer}
                                </div>
                            `}
                        </div>
                        <div class="server-actions">
                            ${isRemote ? this.renderRemoteActions(name, server) : this.renderLocalActions(name, server)}
                        </div>
                    </div>
                    
                    <div class="server-details">
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Status:</strong>
                                <span class="status-badge ${statusClass}">
                                    ${statusIcon} ${(server.status || 'stopped').toUpperCase()}
                                </span>
                            </div>
                            ${isRemote ? `
                                <div class="detail-item">
                                    <strong>URL:</strong>
                                    <span>${server.url}</span>
                                </div>
                                <div class="detail-item">
                                    <strong>Protocol:</strong>
                                    <span>${server.protocol || 'WebSocket'}</span>
                                </div>
                                <div class="detail-item">
                                    <strong>Connected:</strong>
                                    <span>${server.connectedAt ? new Date(server.connectedAt).toLocaleTimeString() : 'Never'}</span>
                                </div>
                            ` : `
                                <div class="detail-item">
                                    <strong>PID:</strong>
                                    <span>${server.pid || 'N/A'}</span>
                                </div>
                                <div class="detail-item">
                                    <strong>Uptime:</strong>
                                    <span>${this.formatUptime(server.startTime)}</span>
                                </div>
                                <div class="detail-item">
                                    <strong>Auto-start:</strong>
                                    <span>${server.autoStart ? '✅ Enabled' : '❌ Disabled'}</span>
                                </div>
                            `}
                            <div class="detail-item">
                                <strong>Last Check:</strong>
                                <span>${server.lastCheck ? new Date(server.lastCheck).toLocaleTimeString() : 'Never'}</span>
                            </div>
                            <div class="detail-item">
                                <strong>Messages:</strong>
                                <span>${metrics.messages || 0}</span>
                            </div>
                        </div>
                        
                        ${server.status === 'running' || server.status === 'connected' ? `
                            <div class="performance-metrics">
                                <div class="metric-item">
                                    <span class="metric-label">${isRemote ? 'Latency:' : 'CPU Usage:'}</span>
                                    <div class="metric-bar">
                                        <div class="metric-fill" style="width: ${isRemote ? Math.min((metrics.latency || 0) / 10, 100) : (metrics.cpu || 0)}%"></div>
                                    </div>
                                    <span class="metric-value">${isRemote ? (metrics.latency || 0) + 'ms' : (metrics.cpu || 0) + '%'}</span>
                                </div>
                                <div class="metric-item">
                                    <span class="metric-label">Memory:</span>
                                    <div class="metric-bar">
                                        <div class="metric-fill" style="width: ${(metrics.memory || 0) / 10}%"></div>
                                    </div>
                                    <span class="metric-value">${metrics.memory || 0}MB</span>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${server.lastError ? `
                            <div class="error-info">
                                <strong>Last Error:</strong>
                                <div class="error-message">${server.lastError}</div>
                            </div>
                        ` : ''}
                        
                        ${server.capabilities && server.capabilities.length > 0 ? `
                            <div class="server-capabilities">
                                <strong>Capabilities:</strong>
                                <div class="capabilities-list">
                                    ${server.capabilities.map(cap => `<span class="capability-tag">${cap}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    startAutoDiscovery() {
        if (!this.autoDiscovery) return;
        
        this.discoveryInterval = setInterval(() => {
            this.discoverServers();
        }, 30000); // Check every 30 seconds
    }

    async discoverServers() {
        try {
            // Suggest common MCP server packages that a host process (desktop app,
            // CLI, or configured MCP daemon) could install/launch. The browser
            // cannot enumerate host filesystem paths or installed binaries, so
            // this is a static catalog of well-known host-daemon packages, not a
            // real filesystem/network scan. Use "🔍 Scan Network" (scanNetwork())
            // to actually probe for browser-connectable HTTP/WebSocket remotes.
            const knownHostDaemonPackages = [
                '@modelcontextprotocol/server-filesystem',
                '@modelcontextprotocol/server-github',
                '@modelcontextprotocol/server-sqlite'
            ];

            for (const pkg of knownHostDaemonPackages) {
                const serverName = pkg.split('/').pop().replace('server-', '');
                if (!this.servers.has(serverName)) {
                    // Found new server, add as template suggestion
                    this.addDiscoveredServer(serverName, pkg);
                }
            }
        } catch (error) {
            console.warn('Auto-discovery error:', error);
        }
    }

    addDiscoveredServer(name, packageName) {
        // Add to discovered servers list for user review. These are always
        // host-daemon-command suggestions (a host process would run `npx
        // <packageName>`); the browser never installs or executes them.
        const discovered = JSON.parse(localStorage.getItem('mcp-discovered') || '[]');
        const existing = discovered.find(s => s.name === name);
        
        if (!existing) {
            discovered.push({
                name,
                packageName,
                kind: 'host-daemon-command',
                discoveredAt: new Date().toISOString(),
                status: 'discovered'
            });
            localStorage.setItem('mcp-discovered', JSON.stringify(discovered));
        }
    }

    getActiveServerCount() {
        return Array.from(this.servers.values()).filter(s => s.status === 'running').length;
    }

    getAutoStartCount() {
        return Array.from(this.servers.values()).filter(s => s.autoStart).length;
    }

    getCategoryCount(category) {
        return Array.from(this.servers.values()).filter(s => s.category === category).length;
    }

    getStatusIcon(status) {
        const icons = {
            running: '🟢',
            stopped: '🔴',
            starting: '🟡',
            stopping: '🟡',
            error: '🔴',
            unknown: '⚪'
        };
        return icons[status] || '⚪';
    }

    formatUptime(startTime) {
        if (!startTime) return 'N/A';
        
        const now = Date.now();
        const diff = now - startTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    renderRecentActivity() {
        if (this.connectionHistory.length === 0) {
            return '<div class="no-activity">No recent activity</div>';
        }
        
        return this.connectionHistory.slice(-5).reverse().map(event => `
            <div class="activity-item">
                <div class="activity-icon">${this.getEventIcon(event.type)}</div>
                <div class="activity-details">
                    <div class="activity-description">${event.description}</div>
                    <div class="activity-time">${this.formatTime(event.timestamp)}</div>
                </div>
            </div>
        `).join('');
    }

    getEventIcon(type) {
        const icons = {
            server_started: '▶️',
            server_stopped: '⏹️',
            server_error: '❌',
            server_added: '➕',
            server_removed: '🗑️',
            connection_established: '🔗',
            connection_lost: '🔌'
        };
        return icons[type] || '📝';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    renderModals() {
        return `
            <!-- Add Server Modal -->
            <div id="add-server-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🖥️ Add Host Daemon Command</h3>
                        <button onclick="mcpControlApp.hideAddServer()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <p class="browser-truth-note">
                            This records a <strong>host-managed daemon command</strong>. SwissKnife's
                            browser build never executes this command \u2014 a host process (desktop app,
                            CLI, or configured MCP daemon supervisor) must run it separately. This applies
                            even when the command references an interpreter such as Python.
                        </p>
                        <form id="add-server-form">
                            <div class="form-group">
                                <label for="server-name">Server Name:</label>
                                <input type="text" id="server-name" placeholder="my-mcp-server" required>
                            </div>
                            <div class="form-group">
                                <label for="server-command">Host Command:</label>
                                <input type="text" id="server-command" placeholder="npx @modelcontextprotocol/server-filesystem" required oninput="mcpControlApp.updateAddServerCommandWarning()">
                                <div id="server-command-warning" class="host-daemon-disclaimer hidden"></div>
                            </div>
                            <div class="form-group">
                                <label for="server-args">Arguments (JSON):</label>
                                <textarea id="server-args" placeholder='["--root", "/path/to/directory"]' rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="server-env">Environment Variables (JSON):</label>
                                <textarea id="server-env" placeholder='{"NODE_ENV": "production"}' rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="server-description">Description:</label>
                                <input type="text" id="server-description" placeholder="Brief description of the server">
                            </div>
                            <div class="form-group">
                                <label for="server-category">Category:</label>
                                <select id="server-category">
                                    <option value="custom">Custom</option>
                                    <option value="core">Core</option>
                                    <option value="integration">Integration</option>
                                    <option value="database">Database</option>
                                    <option value="cloud">Cloud</option>
                                    <option value="automation">Automation</option>
                                </select>
                            </div>
                            <div class="form-group checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="server-autostart">
                                    <span class="checkmark"></span>
                                    Auto-start with application
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button onclick="mcpControlApp.addServer()" class="btn-primary">Add Host Daemon Command</button>
                        <button onclick="mcpControlApp.hideAddServer()" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Add Remote Server Modal -->
            <div id="add-remote-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🌐 Add Browser-Connectable Remote</h3>
                        <button onclick="mcpControlApp.hideAddRemote()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <p class="browser-truth-note">
                            SwissKnife's browser build connects to these endpoints <strong>directly</strong>
                            using ${MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports.join(', ')}.
                            Unlike host daemon commands, no separate host process is required to reach them.
                        </p>
                        <form id="add-remote-form">
                            <div class="form-group">
                                <label for="remote-name">Server Name:</label>
                                <input type="text" id="remote-name" placeholder="remote-mcp-server" required>
                            </div>
                            <div class="form-group">
                                <label for="remote-url">Server URL / Multiaddr:</label>
                                <input type="text" id="remote-url" placeholder="ws://localhost:8765, https://api.example.com/mcp, or /dns4/host/tcp/4001/p2p/<peerId>" required>
                            </div>
                            <div class="form-group">
                                <label for="remote-protocol">Browser-Connectable Transport:</label>
                                <select id="remote-protocol">
                                    <option value="websocket">WebSocket</option>
                                    <option value="http">HTTP</option>
                                    <option value="https">HTTPS</option>
                                    <option value="libp2p">libp2p (peer-to-peer)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="remote-auth">Authentication:</label>
                                <select id="remote-auth">
                                    <option value="none">None</option>
                                    <option value="bearer">Bearer Token</option>
                                    <option value="api-key">API Key</option>
                                    <option value="oauth">OAuth</option>
                                </select>
                            </div>
                            <div class="form-group auth-details hidden" id="auth-details">
                                <label for="auth-token">Token/Key:</label>
                                <input type="password" id="auth-token" placeholder="Enter authentication token">
                            </div>
                            <div class="form-group">
                                <label for="remote-description">Description:</label>
                                <input type="text" id="remote-description" placeholder="Brief description of the remote server">
                            </div>
                            <div class="form-group">
                                <label for="remote-category">Category:</label>
                                <select id="remote-category">
                                    <option value="integration">Integration</option>
                                    <option value="cloud">Cloud</option>
                                    <option value="database">Database</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>
                            <div class="form-group checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="remote-autoconnect">
                                    <span class="checkmark"></span>
                                    Auto-connect on startup
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button onclick="mcpControlApp.testRemoteConnection()" class="btn-secondary">🧪 Test Connection</button>
                        <button onclick="mcpControlApp.addRemoteServer()" class="btn-primary">Add Browser Remote</button>
                        <button onclick="mcpControlApp.hideAddRemote()" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Server Templates Modal -->
            <div id="templates-modal" class="modal hidden">
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3>📋 MCP Server Templates</h3>
                        <button onclick="mcpControlApp.hideServerTemplates()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="templates-grid">
                            ${this.renderServerTemplates()}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Discovery Modal -->
            <div id="discovery-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🔍 Server Discovery</h3>
                        <button onclick="mcpControlApp.hideDiscovery()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="discovery-settings">
                            <label class="checkbox-label">
                                <input type="checkbox" id="auto-discovery-toggle" 
                                       ${this.autoDiscovery ? 'checked' : ''}
                                       onchange="mcpControlApp.toggleAutoDiscovery(this.checked)">
                                <span class="checkmark"></span>
                                Enable automatic server discovery
                            </label>
                        </div>
                        
                        <div class="discovered-servers">
                            <h4>Discovered Servers</h4>
                            <div id="discovered-list">
                                ${this.renderDiscoveredServers()}
                            </div>
                        </div>
                        
                        <div class="network-discovery">
                            <h4>🌐 Network Discovery</h4>
                            <button onclick="mcpControlApp.scanNetwork()" class="btn-primary">🔍 Scan Network</button>
                            <div id="network-scan-results" class="scan-results">
                                <!-- Network scan results will appear here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Metrics Modal -->
            <div id="metrics-modal" class="modal hidden">
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3>📊 Performance Metrics</h3>
                        <button onclick="mcpControlApp.hideMetrics()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="metrics-dashboard">
                            ${this.renderMetricsDashboard()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderServerTemplates() {
        return Array.from(this.serverTemplates.entries()).map(([id, template]) => {
            const entryDescriptor = describeMcpDashboardHostDaemonCommand(template.command, template.args);
            return `
            <div class="template-card">
                <div class="template-header">
                    <span class="template-icon">${template.icon}</span>
                    <h4>${template.name}</h4>
                    <span class="template-category">${template.category}</span>
                    <span class="server-type server-type-host-daemon" title="${entryDescriptor.disclaimer}">HOST DAEMON COMMAND</span>
                </div>
                <div class="template-description">
                    ${template.description}
                </div>
                <div class="template-command">
                    <code>${entryDescriptor.isPythonCommand ? '🐍' : '🖥️'} ${template.command} ${template.args.join(' ')}</code>
                </div>
                <div class="host-daemon-disclaimer${entryDescriptor.isPythonCommand ? ' python-command-disclaimer' : ''}">
                    ⚠️ ${entryDescriptor.disclaimer}
                </div>
                <div class="template-actions">
                    <button onclick="mcpControlApp.useTemplate('${id}')" class="btn-primary">
                        ➕ Use Template
                    </button>
                </div>
            </div>
        `;
        }).join('');
    }

    renderDiscoveredServers() {
        const discovered = JSON.parse(localStorage.getItem('mcp-discovered') || '[]');
        
        if (discovered.length === 0) {
            return '<div class="no-discovered">No servers discovered yet</div>';
        }
        
        return discovered.map(server => `
            <div class="discovered-server">
                <div class="server-info">
                    <h5>${server.name}</h5>
                    <span class="server-type server-type-host-daemon">HOST DAEMON COMMAND</span>
                    <div class="server-package">Suggested host command: <code>npx ${server.packageName}</code></div>
                    <div class="discovered-time">Discovered: ${new Date(server.discoveredAt).toLocaleString()}</div>
                </div>
                <div class="server-actions">
                    <button onclick="mcpControlApp.addDiscoveredServer('${server.name}')" class="btn-primary">
                        ➕ Add
                    </button>
                    <button onclick="mcpControlApp.ignoreDiscovered('${server.name}')" class="btn-secondary">
                        ✕ Ignore
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderMetricsDashboard() {
        return `
            <div class="metrics-grid">
                <div class="metric-card">
                    <h4>📊 Server Performance</h4>
                    <div class="performance-chart">
                        <!-- Performance chart would go here -->
                        <div class="chart-placeholder">Performance charts coming soon</div>
                    </div>
                </div>
                
                <div class="metric-card">
                    <h4>🔗 Connection Health</h4>
                    <div class="connection-metrics">
                        <div class="metric-item">
                            <span>Active Connections:</span>
                            <span class="metric-value">${this.getActiveServerCount()}</span>
                        </div>
                        <div class="metric-item">
                            <span>Total Uptime:</span>
                            <span class="metric-value">${this.getTotalUptime()}</span>
                        </div>
                        <div class="metric-item">
                            <span>Connection Success Rate:</span>
                            <span class="metric-value">95%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getTotalUptime() {
        const totalUptime = Array.from(this.servers.values())
            .filter(s => s.startTime)
            .reduce((total, server) => total + (Date.now() - server.startTime), 0);
        
        const hours = Math.floor(totalUptime / (1000 * 60 * 60));
        return `${hours}h`;
    }

    // Remote server management methods
    renderRemoteActions(name, server) {
        return `
            ${server.status === 'connected' ? 
                `<button onclick="mcpControlApp.disconnectRemote('${name}')" class="btn-danger">🔌 Disconnect</button>` :
                `<button onclick="mcpControlApp.connectRemote('${name}')" class="btn-primary">🔗 Connect</button>`
            }
            <button onclick="mcpControlApp.testRemoteConnection('${name}')" class="btn-secondary">🧪 Test</button>
            <button onclick="mcpControlApp.editRemoteServer('${name}')" class="btn-secondary">✏️ Edit</button>
            <button onclick="mcpControlApp.removeRemoteServer('${name}')" class="btn-danger">🗑️ Remove</button>
        `;
    }

    renderLocalActions(name, server) {
        if (server.managedBy === 'hallucinate_app.electron.daemon') {
            return `
                ${server.status === 'running' ? 
                    `<button onclick="mcpControlApp.stopServer('${name}')" class="btn-danger">Stop</button>` :
                    `<button onclick="mcpControlApp.startServer('${name}')" class="btn-primary">Start</button>`
                }
                <button onclick="mcpControlApp.restartServer('${name}')" class="btn-secondary">Restart</button>
                <button onclick="mcpControlApp.testConnection('${name}')" class="btn-secondary">Health</button>
                ${server.dashboardUrl ? `<button onclick="window.open('${server.dashboardUrl}', '_blank', 'noopener,noreferrer')" class="btn-secondary">Dashboard</button>` : ''}
            `;
        }

        return `
            ${server.status === 'running' ? 
                `<button onclick="mcpControlApp.stopServer('${name}')" class="btn-danger">⏹️ Stop</button>` :
                `<button onclick="mcpControlApp.startServer('${name}')" class="btn-primary">▶️ Start</button>`
            }
            <button onclick="mcpControlApp.restartServer('${name}')" class="btn-secondary">🔄 Restart</button>
            <button onclick="mcpControlApp.editServer('${name}')" class="btn-secondary">✏️ Edit</button>
            <button onclick="mcpControlApp.testConnection('${name}')" class="btn-secondary">🧪 Test</button>
            <button onclick="mcpControlApp.removeServer('${name}')" class="btn-danger">🗑️ Remove</button>
        `;
    }

    loadSavedData() {
        try {
            // Load saved local servers
            const savedServers = JSON.parse(localStorage.getItem('mcp-servers') || '[]');
            savedServers.forEach(server => {
                this.servers.set(server.name, { ...server, status: 'stopped' });
            });

            // Load saved remote servers
            const savedRemoteServers = JSON.parse(localStorage.getItem('mcp-remote-servers') || '[]');
            savedRemoteServers.forEach(server => {
                this.remoteServers.set(server.name, { ...server, status: 'disconnected' });
            });

            // Load connection history
            this.connectionHistory = JSON.parse(localStorage.getItem('mcp-connection-history') || '[]');
        } catch (error) {
            console.warn('Failed to load saved MCP data:', error);
        }
    }

    saveSavedData() {
        try {
            localStorage.setItem('mcp-servers', JSON.stringify(Array.from(this.servers.values())));
            localStorage.setItem('mcp-remote-servers', JSON.stringify(Array.from(this.remoteServers.values())));
            localStorage.setItem('mcp-connection-history', JSON.stringify(this.connectionHistory));
        } catch (error) {
            console.warn('Failed to save MCP data:', error);
        }
    }

    showAddRemote() {
        const modal = document.getElementById('add-remote-modal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // Setup auth field toggle
            const authSelect = document.getElementById('remote-auth');
            const authDetails = document.getElementById('auth-details');
            
            if (authSelect && authDetails) {
                authSelect.addEventListener('change', (e) => {
                    if (e.target.value === 'none') {
                        authDetails.classList.add('hidden');
                    } else {
                        authDetails.classList.remove('hidden');
                    }
                });
            }
        }
    }

    hideAddRemote() {
        const modal = document.getElementById('add-remote-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        document.getElementById('add-remote-form').reset();
    }

    async addRemoteServer() {
        const name = document.getElementById('remote-name').value;
        const url = document.getElementById('remote-url').value;
        const protocol = document.getElementById('remote-protocol').value;
        const auth = document.getElementById('remote-auth').value;
        const token = document.getElementById('auth-token').value;
        const description = document.getElementById('remote-description').value;
        const category = document.getElementById('remote-category').value;
        const autoConnect = document.getElementById('remote-autoconnect').checked;

        if (!name || !url) {
            alert('Please provide server name and URL');
            return;
        }

        try {
            const server = {
                name,
                url,
                protocol,
                auth: auth !== 'none' ? { type: auth, token } : null,
                description,
                category,
                autoConnect,
                status: 'disconnected',
                type: 'remote',
                connectedAt: null,
                lastCheck: null
            };

            this.remoteServers.set(name, server);
            this.saveSavedData();
            this.addConnectionEvent(`Remote server "${name}" added`, 'server_added');
            this.refreshUI();
            this.hideAddRemote();
            
            console.log('Added remote MCP server:', server);
            this.showNotification(`Remote server "${name}" added successfully`, 'success');

            // Auto-connect if enabled
            if (autoConnect) {
                await this.connectRemote(name);
            }
        } catch (error) {
            console.error('Error adding remote server:', error);
            this.showNotification('Error adding remote server: ' + error.message, 'error');
        }
    }

    async connectRemote(name) {
        const server = this.remoteServers.get(name);
        if (!server) return;

        try {
            server.status = 'connecting';
            this.refreshUI();

            // Create a connection using one of the browser-connectable
            // transports (HTTP(S), WebSocket, or libp2p). Any other protocol
            // value is rejected rather than silently treated as HTTP, so the
            // dashboard never pretends a non-browser-connectable transport
            // is reachable directly from the browser.
            const transport = normalizeMcpDashboardTransport(server.protocol, server.url);
            let connection;

            if (transport === 'websocket') {
                connection = await this.createWebSocketConnection(server);
            } else if (transport === 'libp2p') {
                connection = await this.createLibp2pConnection(server);
            } else if (transport === 'http' || transport === 'https') {
                connection = await this.createHTTPConnection(server);
            } else {
                throw new Error(
                    `Unsupported browser-connectable transport "${transport}". ` +
                    `Supported: ${MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports.join(', ')}.`
                );
            }

            this.connections.set(name, connection);
            server.status = 'connected';
            server.connectedAt = Date.now();
            server.lastCheck = Date.now();

            this.addConnectionEvent(`Connected to remote server "${name}"`, 'connection_established');
            this.showNotification(`Connected to "${name}"`, 'success');

            // Query server capabilities
            await this.queryServerCapabilities(name);

        } catch (error) {
            server.status = 'error';
            server.lastError = error.message;
            this.addConnectionEvent(`Failed to connect to "${name}": ${error.message}`, 'server_error');
            this.showNotification(`Failed to connect to "${name}": ${error.message}`, 'error');
        }

        this.refreshUI();
    }

    async createWebSocketConnection(server) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(server.url);
            
            ws.onopen = () => {
                console.log(`WebSocket connected to ${server.url}`);
                
                // Send authentication if required
                if (server.auth) {
                    const authMessage = {
                        jsonrpc: '2.0',
                        method: 'auth',
                        params: {
                            type: server.auth.type,
                            token: server.auth.token
                        }
                    };
                    ws.send(JSON.stringify(authMessage));
                }
                
                resolve(ws);
            };

            ws.onerror = (error) => {
                console.error(`WebSocket error for ${server.url}:`, error);
                reject(new Error('WebSocket connection failed'));
            };

            ws.onclose = () => {
                console.log(`WebSocket disconnected from ${server.url}`);
                this.handleConnectionClosed(server.name);
            };

            ws.onmessage = (event) => {
                this.handleServerMessage(server.name, JSON.parse(event.data));
            };

            // Timeout after 10 seconds
            setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    async createHTTPConnection(server) {
        // For HTTP connections, we'll create a connection object that handles requests
        const connection = {
            type: 'http',
            url: server.url,
            auth: server.auth,
            async send(message) {
                const headers = {
                    'Content-Type': 'application/json',
                };

                if (server.auth) {
                    switch (server.auth.type) {
                        case 'bearer':
                            headers['Authorization'] = `Bearer ${server.auth.token}`;
                            break;
                        case 'api-key':
                            headers['X-API-Key'] = server.auth.token;
                            break;
                    }
                }

                const response = await fetch(server.url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(message)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            }
        };

        // Test the connection
        const testMessage = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'SwissKnife MCP Client',
                    version: '1.0.0'
                }
            }
        };

        await connection.send(testMessage);
        return connection;
    }

    /**
     * Connects to a browser-connectable libp2p MCP remote. Unlike a
     * host-daemon command, this is a real transport the SwissKnife browser
     * build can dial directly once a browser libp2p runtime/bridge is
     * available (see `docs/browser-libp2p-evidence.md` and
     * `src/services/mcp/libp2p-browser-runtime.ts`). If no browser libp2p
     * capability is wired into this build/host, the connection attempt
     * fails honestly instead of faking a successful connection.
     */
    async createLibp2pConnection(server) {
        const libp2pBridge = this.desktop?.swissknife?.mcp?.libp2p || this.desktop?.swissknife?.p2p;
        const hasDialCapability = typeof libp2pBridge?.dialMultiaddr === 'function' || typeof libp2pBridge?.connect === 'function';
        if (!libp2pBridge || !hasDialCapability) {
            throw new Error(
                'libp2p transport requires a browser libp2p runtime/bridge capability that is not ' +
                'available in this build. See docs/browser-libp2p-evidence.md.'
            );
        }

        const dial = libp2pBridge.dialMultiaddr
            ? (addr) => libp2pBridge.dialMultiaddr(addr)
            : (addr) => libp2pBridge.connect(addr);

        const peerConnection = await dial(server.url);

        return {
            type: 'libp2p',
            url: server.url,
            peerConnection,
            async send(message) {
                if (typeof peerConnection?.send === 'function') {
                    return await peerConnection.send(message);
                }
                throw new Error('libp2p peer connection does not support send()');
            },
            close() {
                if (typeof peerConnection?.close === 'function') {
                    peerConnection.close();
                }
            },
        };
    }

    async queryServerCapabilities(name) {
        const connection = this.connections.get(name);
        const server = this.remoteServers.get(name) || this.servers.get(name);
        
        if (!connection || !server) return;

        try {
            const message = {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'SwissKnife MCP Client',
                        version: '1.0.0'
                    }
                }
            };

            let response;
            if (connection.send) {
                response = await connection.send(message);
            } else if (connection.readyState === WebSocket.OPEN) {
                connection.send(JSON.stringify(message));
                // For WebSocket, we'll handle the response in the message handler
                return;
            }

            if (response && response.result) {
                server.capabilities = Object.keys(response.result.capabilities || {});
                this.refreshUI();
            }
        } catch (error) {
            console.warn(`Failed to query capabilities for ${name}:`, error);
        }
    }

    handleServerMessage(serverName, message) {
        const server = this.remoteServers.get(serverName) || this.servers.get(serverName);
        if (!server) return;

        // Update metrics
        const metrics = this.performanceMetrics.get(serverName) || { messages: 0 };
        metrics.messages = (metrics.messages || 0) + 1;
        this.performanceMetrics.set(serverName, metrics);

        // Handle specific message types
        if (message.method === 'initialize' && message.result) {
            server.capabilities = Object.keys(message.result.capabilities || {});
        }

        console.log(`Message from ${serverName}:`, message);
    }

    handleConnectionClosed(serverName) {
        const server = this.remoteServers.get(serverName);
        if (server) {
            server.status = 'disconnected';
            this.connections.delete(serverName);
            this.addConnectionEvent(`Disconnected from "${serverName}"`, 'connection_lost');
            this.refreshUI();
        }
    }

    async disconnectRemote(name) {
        const connection = this.connections.get(name);
        const server = this.remoteServers.get(name);

        if (connection) {
            if (connection.close) {
                connection.close();
            }
            this.connections.delete(name);
        }

        if (server) {
            server.status = 'disconnected';
            this.addConnectionEvent(`Disconnected from "${name}"`, 'connection_lost');
        }

        this.refreshUI();
    }

    async testRemoteConnection(nameOrUseForm) {
        let server;
        
        if (typeof nameOrUseForm === 'string') {
            // Testing existing server
            server = this.remoteServers.get(nameOrUseForm);
        } else {
            // Testing from form
            server = {
                url: document.getElementById('remote-url').value,
                protocol: document.getElementById('remote-protocol').value,
                auth: document.getElementById('remote-auth').value !== 'none' ? {
                    type: document.getElementById('remote-auth').value,
                    token: document.getElementById('auth-token').value
                } : null
            };
        }

        if (!server || !server.url) {
            this.showNotification('Please provide a valid server URL', 'error');
            return;
        }

        try {
            const transport = normalizeMcpDashboardTransport(server.protocol, server.url);
            let connection;
            if (transport === 'websocket') {
                connection = await this.createWebSocketConnection(server);
            } else if (transport === 'libp2p') {
                connection = await this.createLibp2pConnection(server);
            } else {
                connection = await this.createHTTPConnection(server);
            }

            this.showNotification('Connection test successful!', 'success');
            
            // Close test connection
            if (connection.close) {
                connection.close();
            }
        } catch (error) {
            this.showNotification(`Connection test failed: ${error.message}`, 'error');
        }
    }

    async scanNetwork() {
        const resultsDiv = document.getElementById('network-scan-results');
        if (!resultsDiv) return;

        resultsDiv.innerHTML = '<div class="scanning">🔍 Scanning network for MCP servers...</div>';

        try {
            // Common MCP server ports and endpoints to scan
            const commonPorts = [8765, 8766, 8767, 3000, 3001, 8000, 8080];
            const localhost = 'localhost';
            const foundServers = [];

            for (const port of commonPorts) {
                try {
                    const wsUrl = `ws://${localhost}:${port}`;
                    const httpUrl = `http://${localhost}:${port}`;
                    
                    // Quick test for WebSocket
                    const wsTest = this.quickConnectionTest(wsUrl, 'websocket');
                    const httpTest = this.quickConnectionTest(httpUrl, 'http');
                    
                    const results = await Promise.allSettled([wsTest, httpTest]);
                    
                    results.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            foundServers.push({
                                url: index === 0 ? wsUrl : httpUrl,
                                type: index === 0 ? 'WebSocket' : 'HTTP',
                                port: port
                            });
                        }
                    });
                } catch (error) {
                    // Continue scanning
                }
            }

            if (foundServers.length > 0) {
                resultsDiv.innerHTML = `
                    <h5>🎉 Found ${foundServers.length} potential MCP servers:</h5>
                    ${foundServers.map(server => `
                        <div class="found-server">
                            <span class="server-info">${server.type}: ${server.url}</span>
                            <button onclick="mcpControlApp.addFoundServer('${server.url}', '${server.type.toLowerCase()}')" class="btn-sm btn-primary">➕ Add</button>
                        </div>
                    `).join('')}
                `;
            } else {
                resultsDiv.innerHTML = '<div class="no-results">No MCP servers found on local network</div>';
            }
        } catch (error) {
            resultsDiv.innerHTML = `<div class="scan-error">Scan failed: ${error.message}</div>`;
        }
    }

    async quickConnectionTest(url, type) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 2000);

            if (type === 'websocket') {
                const ws = new WebSocket(url);
                ws.onopen = () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                };
                ws.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Connection failed'));
                };
            } else {
                fetch(url, { 
                    method: 'GET',
                    signal: AbortSignal.timeout(2000)
                })
                .then(() => {
                    clearTimeout(timeout);
                    resolve(true);
                })
                .catch(() => {
                    clearTimeout(timeout);
                    reject(new Error('Connection failed'));
                });
            }
        });
    }

    addFoundServer(url, type) {
        document.getElementById('remote-url').value = url;
        document.getElementById('remote-protocol').value = type === 'websocket' ? 'websocket' : 'http';
        
        // Close discovery modal and open add remote modal
        this.hideDiscovery();
        this.showAddRemote();
    }

    addConnectionEvent(description, type) {
        this.connectionHistory.push({
            timestamp: Date.now(),
            description,
            type
        });

        // Keep only last 100 events
        if (this.connectionHistory.length > 100) {
            this.connectionHistory = this.connectionHistory.slice(-100);
        }

        this.saveSavedData();
    }

    refreshUI() {
        // Re-render the server list if we're in the MCP Control app
        const container = document.getElementById('mcp-server-list');
        if (container) {
            container.innerHTML = this.renderServerList();
        }
        const libp2pPanel = document.getElementById('mcp-libp2p-browser-panel');
        if (libp2pPanel) {
            libp2pPanel.innerHTML = this.renderLibp2pBrowserDefaultsPanel();
        }
    }

    async checkServerStatuses() {
        await this.syncHallucinateDaemons();

        // Check local servers (existing implementation)
        // Check for real server processes via SwissKnife API
        // If API is available, get actual server status
        if (this.desktop && this.desktop.swissknife && this.desktop.swissknife.listMCPServers) {
            try {
                const realServers = await this.desktop.swissknife.listMCPServers();
                for (const server of realServers) {
                    if (!this.servers.has(server.name)) {
                        this.servers.set(server.name, server);
                    } else {
                        const existing = this.servers.get(server.name);
                        Object.assign(existing, server);
                    }
                }
            } catch (error) {
                console.log('MCP Control: Using fallback server detection');
            }
        }
        
        // Fallback: Show example servers if no real ones detected
        if (this.servers.size === 0) {
            const fallbackServers = [
                { name: 'example-mcp-server', command: 'uvicorn main:app', status: 'stopped', port: 8765 },
                { name: 'example-mcp-server-2', command: 'python server.py', status: 'stopped', port: 8766 }
            ];

            for (const server of fallbackServers) {
                if (!this.servers.has(server.name)) {
                    this.servers.set(server.name, server);
                }
            }
        }

        // Check remote server connections
        for (const [name, server] of this.remoteServers) {
            const connection = this.connections.get(name);
            if (connection) {
                try {
                    // Ping remote server to check health
                    if (connection.readyState === WebSocket.OPEN) {
                        server.status = 'connected';
                    } else if (connection.readyState === WebSocket.CLOSED) {
                        server.status = 'disconnected';
                        this.connections.delete(name);
                    }
                } catch (error) {
                    server.status = 'error';
                    server.lastError = error.message;
                }
            }
            server.lastCheck = Date.now();
        }
    }

    filterServers() {
        // Implementation would filter the server list based on search and filter criteria
        console.log('Filtering servers...');
    }

    toggleAutoDiscovery(enabled) {
        this.autoDiscovery = enabled;
        if (enabled) {
            this.startAutoDiscovery();
        } else if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }
    }

    showServerTemplates() {
        const modal = document.getElementById('templates-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideServerTemplates() {
        const modal = document.getElementById('templates-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showDiscovery() {
        const modal = document.getElementById('discovery-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideDiscovery() {
        const modal = document.getElementById('discovery-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showMetrics() {
        const modal = document.getElementById('metrics-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideMetrics() {
        const modal = document.getElementById('metrics-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    useTemplate(templateId) {
        const template = this.serverTemplates.get(templateId);
        if (template) {
            // Fill the add server form with template data
            document.getElementById('server-name').value = template.name.toLowerCase().replace(/\s+/g, '-');
            document.getElementById('server-command').value = template.command;
            document.getElementById('server-args').value = JSON.stringify(template.args);
            document.getElementById('server-env').value = JSON.stringify(template.env);
            document.getElementById('server-description').value = template.description;
            document.getElementById('server-category').value = template.category;
            document.getElementById('server-autostart').checked = template.autoStart;
            
            this.hideServerTemplates();
            this.showAddServer();
        }
    }

    editServer(name) {
        const server = this.servers.get(name);
        if (server) {
            // Fill form with existing server data for editing
            document.getElementById('server-name').value = name;
            document.getElementById('server-command').value = server.command;
            document.getElementById('server-args').value = JSON.stringify(server.args || []);
            document.getElementById('server-env').value = JSON.stringify(server.env || {});
            document.getElementById('server-description').value = server.description || '';
            document.getElementById('server-category').value = server.category || 'custom';
            document.getElementById('server-autostart').checked = server.autoStart || false;
            
            this.showAddServer();
        }
    }

    editRemoteServer(name) {
        const server = this.remoteServers.get(name);
        if (server) {
            // Fill form with existing remote server data for editing
            document.getElementById('remote-name').value = name;
            document.getElementById('remote-url').value = server.url;
            document.getElementById('remote-protocol').value = server.protocol;
            document.getElementById('remote-auth').value = server.auth ? server.auth.type : 'none';
            document.getElementById('auth-token').value = server.auth ? server.auth.token : '';
            document.getElementById('remote-description').value = server.description || '';
            document.getElementById('remote-category').value = server.category || 'integration';
            document.getElementById('remote-autoconnect').checked = server.autoConnect || false;
            
            this.showAddRemote();
        }
    }

    removeRemoteServer(name) {
        if (confirm(`Are you sure you want to remove remote server "${name}"?`)) {
            // Disconnect if connected
            this.disconnectRemote(name);
            
            this.remoteServers.delete(name);
            this.saveSavedData();
            this.addConnectionEvent(`Remote server "${name}" removed`, 'server_removed');
            this.refreshUI();
            this.showNotification(`Remote server "${name}" removed`, 'info');
        }
    }

    restartServer(name) {
        const server = this.servers.get(name);
        if (server && server.status === 'running') {
            this.stopServer(name).then(() => {
                setTimeout(() => {
                    this.startServer(name);
                }, 2000);
            });
        }
    }

    testConnection(name) {
        const server = this.servers.get(name);
        if (server) {
            // Simulate connection test for local servers
            this.showNotification(`Testing connection to "${name}"...`, 'info');
            setTimeout(() => {
                this.showNotification(`Connection test ${Math.random() > 0.3 ? 'successful' : 'failed'} for "${name}"`, 
                    Math.random() > 0.3 ? 'success' : 'error');
            }, 2000);
        }
    }

    showAddServer() {
        const modal = document.getElementById('add-server-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
        this.updateAddServerCommandWarning();
    }

    hideAddServer() {
        const modal = document.getElementById('add-server-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Clear form
        document.getElementById('add-server-form').reset();
    }

    /**
     * Live-updates the host-daemon-command warning shown under the command
     * input in the "Add Host Daemon Command" modal. Never executes the
     * command; only classifies the command text via
     * `describeMcpDashboardHostDaemonCommand()` so a Python-referencing
     * command (e.g. `python server.py`, `uvicorn main:app`) is always
     * labeled as a host-managed record, never as something the browser runs.
     */
    updateAddServerCommandWarning() {
        const input = document.getElementById('server-command');
        const warning = document.getElementById('server-command-warning');
        if (!input || !warning) return;

        const command = input.value.trim();
        if (!command) {
            warning.classList.add('hidden');
            warning.textContent = '';
            return;
        }

        const entryDescriptor = describeMcpDashboardHostDaemonCommand(command, []);
        warning.classList.remove('hidden');
        warning.classList.toggle('python-command-disclaimer', entryDescriptor.isPythonCommand);
        warning.textContent = `⚠️ ${entryDescriptor.disclaimer}`;
    }

    async addServer() {
        const name = document.getElementById('server-name').value;
        const command = document.getElementById('server-command').value;
        const args = document.getElementById('server-args').value;
        const env = document.getElementById('server-env').value;
        const description = document.getElementById('server-description').value;
        const category = document.getElementById('server-category').value;
        const autoStart = document.getElementById('server-autostart').checked;

        if (!name || !command) {
            alert('Please provide server name and command');
            return;
        }

        try {
            const server = {
                name,
                command,
                args: args ? JSON.parse(args) : [],
                env: env ? JSON.parse(env) : {},
                description,
                category,
                autoStart,
                status: 'stopped',
                pid: null,
                port: null,
                type: 'local'
            };

            this.servers.set(name, server);
            this.saveSavedData();
            this.addConnectionEvent(`Local server "${name}" added`, 'server_added');
            this.refreshUI();
            this.hideAddServer();
            
            console.log('Added MCP server:', server);
            this.showNotification(`Server "${name}" added successfully`, 'success');
        } catch (error) {
            console.error('Error adding server:', error);
            this.showNotification('Error adding server: ' + error.message, 'error');
        }
    }

    async startServer(name) {
        const server = this.servers.get(name);
        if (!server) return;

        try {
            if (server.managedBy === 'hallucinate_app.electron.daemon') {
                server.status = 'starting';
                this.refreshUI();
                await this.hallucinateBridge.start(server.daemonId || name);
                await this.syncHallucinateDaemons();
                this.addConnectionEvent(`Hallucinate daemon "${name}" started`, 'server_started');
                this.showNotification(`Daemon "${name}" start requested`, 'success');
                return;
            }

            // In a real implementation, this would start the actual process
            // For now, simulate starting
            server.status = 'starting';
            this.refreshUI();
            
            setTimeout(() => {
                server.status = 'running';
                server.pid = Math.floor(Math.random() * 10000) + 1000;
                server.port = server.port || 8765;
                server.startTime = Date.now();
                this.addConnectionEvent(`Server "${name}" started`, 'server_started');
                this.refreshUI();
                this.showNotification(`Server "${name}" started successfully`, 'success');
            }, 2000);
            
        } catch (error) {
            server.status = 'error';
            server.lastError = error.message;
            this.addConnectionEvent(`Failed to start "${name}": ${error.message}`, 'server_error');
            this.refreshUI();
            this.showNotification(`Failed to start server "${name}": ${error.message}`, 'error');
        }
    }

    async stopServer(name) {
        const server = this.servers.get(name);
        if (!server) return;

        try {
            if (server.managedBy === 'hallucinate_app.electron.daemon') {
                server.status = 'stopping';
                this.refreshUI();
                await this.hallucinateBridge.stop(server.daemonId || name);
                await this.syncHallucinateDaemons();
                this.addConnectionEvent(`Hallucinate daemon "${name}" stopped`, 'server_stopped');
                this.showNotification(`Daemon "${name}" stop requested`, 'info');
                return;
            }

            server.status = 'stopping';
            this.refreshUI();
            
            setTimeout(() => {
                server.status = 'stopped';
                server.pid = null;
                server.startTime = null;
                this.addConnectionEvent(`Server "${name}" stopped`, 'server_stopped');
                this.refreshUI();
                this.showNotification(`Server "${name}" stopped`, 'info');
            }, 1000);
            
        } catch (error) {
            this.showNotification(`Failed to stop server "${name}": ${error.message}`, 'error');
        }
    }

    async removeServer(name) {
        if (confirm(`Are you sure you want to remove server "${name}"?`)) {
            const server = this.servers.get(name);
            if (server && server.status === 'running') {
                await this.stopServer(name);
            }
            
            this.servers.delete(name);
            this.saveSavedData();
            this.addConnectionEvent(`Server "${name}" removed`, 'server_removed');
            this.refreshUI();
            this.showNotification(`Server "${name}" removed`, 'info');
        }
    }

    async refreshServers() {
        await this.checkServerStatuses();
        this.refreshUI();
    }

    async restartServer(name) {
        const server = this.servers.get(name);
        if (!server) return;

        if (server.managedBy === 'hallucinate_app.electron.daemon') {
            try {
                server.status = 'starting';
                this.refreshUI();
                await this.hallucinateBridge.restart(server.daemonId || name);
                await this.syncHallucinateDaemons();
                this.addConnectionEvent(`Hallucinate daemon "${name}" restarted`, 'server_started');
                this.showNotification(`Daemon "${name}" restart requested`, 'success');
            } catch (error) {
                server.status = 'error';
                server.lastError = error.message;
                this.refreshUI();
                this.showNotification(`Failed to restart daemon "${name}": ${error.message}`, 'error');
            }
            return;
        }

        await this.stopServer(name);
        await this.startServer(name);
    }

    async testConnection(name) {
        const server = this.servers.get(name);
        if (!server) return;

        if (server.managedBy === 'hallucinate_app.electron.daemon') {
            try {
                const health = await this.hallucinateBridge.checkHealth(server.daemonId || name);
                server.lastHealth = health;
                server.status = health?.healthy ? 'running' : 'degraded';
                server.lastCheck = Date.now();
                this.refreshUI();
                this.showNotification(`Daemon "${name}" health: ${server.status}`, health?.healthy ? 'success' : 'warning');
            } catch (error) {
                server.status = 'error';
                server.lastError = error.message;
                this.refreshUI();
                this.showNotification(`Health check failed for "${name}": ${error.message}`, 'error');
            }
            return;
        }

        this.showNotification(`No managed health bridge for "${name}"`, 'info');
    }

    async syncHallucinateDaemons() {
        if (!this.hallucinateBridge?.isAvailable()) {
            return null;
        }

        const snapshot = await this.hallucinateBridge.getSnapshot();
        this.hallucinateSnapshot = snapshot;

        for (const server of snapshot.servers || []) {
            this.servers.set(server.name, {
                ...(this.servers.get(server.name) || {}),
                ...server,
            });
        }

        if (snapshot.ready && !this._hallucinateReadyEventRecorded) {
            this.addConnectionEvent(
                'Hallucinate App MCP dashboard catalog connected to SwissKnife',
                'connection_established'
            );
            this._hallucinateReadyEventRecorded = true;
        }

        this.refreshUI();
        return snapshot;
    }

    showNotification(message, type = 'info') {
        // Use the global notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Create global instance
const mcpControlApp = new MCPControlApp();

// Export for window manager and module imports
window.MCPControlApp = MCPControlApp;
window.mcpControlApp = mcpControlApp;

export { MCPControlApp };
