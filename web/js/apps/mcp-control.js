// MCP Server Control App
window.MCPControlApp = class MCPControlApp {
    constructor() {
        this.name = 'MCP Control';
        this.icon = '🔌';
        this.servers = new Map();
        this.refreshInterval = null;
    }

    async render() {
        return `
            <div class="mcp-control-app">
                <div class="mcp-header">
                    <h2>🔌 MCP Server Control</h2>
                    <div class="mcp-actions">
                        <button onclick="mcpControlApp.refreshServers()" class="btn-primary">🔄 Refresh</button>
                        <button onclick="mcpControlApp.showAddServer()" class="btn-secondary">➕ Add Server</button>
                    </div>
                </div>
                
                <div class="mcp-content">
                    <div class="server-list" id="mcp-server-list">
                        <div class="loading">Loading MCP servers...</div>
                    </div>
                </div>
                
                <!-- Add Server Modal -->
                <div id="add-server-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Add MCP Server</h3>
                            <button onclick="mcpControlApp.hideAddServer()" class="modal-close">✕</button>
                        </div>
                        <div class="modal-body">
                            <form id="add-server-form">
                                <div class="form-group">
                                    <label for="server-name">Server Name:</label>
                                    <input type="text" id="server-name" placeholder="my-mcp-server" required>
                                </div>
                                <div class="form-group">
                                    <label for="server-command">Command:</label>
                                    <input type="text" id="server-command" placeholder="node server.js" required>
                                </div>
                                <div class="form-group">
                                    <label for="server-args">Arguments (JSON):</label>
                                    <textarea id="server-args" placeholder='["--port", "3000"]' rows="3"></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="server-env">Environment Variables (JSON):</label>
                                    <textarea id="server-env" placeholder='{"NODE_ENV": "production"}' rows="3"></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button onclick="mcpControlApp.addServer()" class="btn-primary">Add Server</button>
                            <button onclick="mcpControlApp.hideAddServer()" class="btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async onMount() {
        await this.loadServers();
        this.refreshInterval = setInterval(() => this.refreshServers(), 5000);
    }

    onUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    async loadServers() {
        try {
            // Load servers from localStorage or IndexedDB
            const savedServers = localStorage.getItem('mcp-servers');
            if (savedServers) {
                const servers = JSON.parse(savedServers);
                for (const server of servers) {
                    this.servers.set(server.name, {
                        ...server,
                        status: 'stopped',
                        pid: null,
                        lastCheck: null
                    });
                }
            }
            
            // Check for running MCP servers
            await this.checkServerStatuses();
            this.renderServerList();
        } catch (error) {
            console.error('Error loading MCP servers:', error);
            this.renderError('Failed to load MCP servers');
        }
    }

    async checkServerStatuses() {
        // In a real implementation, this would check actual server processes
        // For now, simulate some servers
        const mockServers = [
            { name: 'my-mcp-server', command: 'uvicorn main:app', status: 'running', port: 8765 },
            { name: 'my-mcp-server4', command: 'python server.py', status: 'stopped', port: 8766 }
        ];

        for (const server of mockServers) {
            if (!this.servers.has(server.name)) {
                this.servers.set(server.name, server);
            } else {
                const existing = this.servers.get(server.name);
                existing.status = server.status;
                existing.port = server.port;
            }
        }
    }

    renderServerList() {
        const container = document.getElementById('mcp-server-list');
        if (!container) return;

        if (this.servers.size === 0) {
            container.innerHTML = `
                <div class="no-servers">
                    <h3>No MCP servers configured</h3>
                    <p>Add your first MCP server to get started.</p>
                    <button onclick="mcpControlApp.showAddServer()" class="btn-primary">➕ Add Server</button>
                </div>
            `;
            return;
        }

        const serversHtml = Array.from(this.servers.entries()).map(([name, server]) => `
            <div class="server-card ${server.status}">
                <div class="server-header">
                    <div class="server-info">
                        <h4>${name}</h4>
                        <span class="server-status status-${server.status}">${server.status.toUpperCase()}</span>
                    </div>
                    <div class="server-actions">
                        ${server.status === 'running' ? 
                            `<button onclick="mcpControlApp.stopServer('${name}')" class="btn-danger">⏹️ Stop</button>` :
                            `<button onclick="mcpControlApp.startServer('${name}')" class="btn-success">▶️ Start</button>`
                        }
                        <button onclick="mcpControlApp.editServer('${name}')" class="btn-secondary">✏️ Edit</button>
                        <button onclick="mcpControlApp.removeServer('${name}')" class="btn-danger">🗑️ Remove</button>
                    </div>
                </div>
                <div class="server-details">
                    <div class="detail-row">
                        <strong>Command:</strong> <code>${server.command}</code>
                    </div>
                    ${server.port ? `<div class="detail-row"><strong>Port:</strong> ${server.port}</div>` : ''}
                    ${server.pid ? `<div class="detail-row"><strong>PID:</strong> ${server.pid}</div>` : ''}
                    <div class="detail-row">
                        <strong>Last Check:</strong> ${new Date().toLocaleTimeString()}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = serversHtml;
    }

    renderError(message) {
        const container = document.getElementById('mcp-server-list');
        if (container) {
            container.innerHTML = `<div class="error">${message}</div>`;
        }
    }

    showAddServer() {
        const modal = document.getElementById('add-server-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideAddServer() {
        const modal = document.getElementById('add-server-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Clear form
        document.getElementById('add-server-form').reset();
    }

    async addServer() {
        const form = document.getElementById('add-server-form');
        const formData = new FormData(form);
        
        const name = document.getElementById('server-name').value;
        const command = document.getElementById('server-command').value;
        const args = document.getElementById('server-args').value;
        const env = document.getElementById('server-env').value;

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
                status: 'stopped',
                pid: null,
                port: null
            };

            this.servers.set(name, server);
            this.saveServers();
            this.renderServerList();
            this.hideAddServer();
            
            console.log('Added MCP server:', server);
        } catch (error) {
            alert('Error adding server: ' + error.message);
        }
    }

    async startServer(name) {
        const server = this.servers.get(name);
        if (!server) return;

        try {
            // In a real implementation, this would start the actual process
            // For now, simulate starting
            server.status = 'starting';
            this.renderServerList();
            
            setTimeout(() => {
                server.status = 'running';
                server.pid = Math.floor(Math.random() * 10000) + 1000;
                server.port = server.port || 8765;
                this.renderServerList();
                this.showNotification(`Server "${name}" started successfully`, 'success');
            }, 2000);
            
        } catch (error) {
            server.status = 'error';
            this.renderServerList();
            this.showNotification(`Failed to start server "${name}": ${error.message}`, 'error');
        }
    }

    async stopServer(name) {
        const server = this.servers.get(name);
        if (!server) return;

        try {
            server.status = 'stopping';
            this.renderServerList();
            
            setTimeout(() => {
                server.status = 'stopped';
                server.pid = null;
                this.renderServerList();
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
            this.saveServers();
            this.renderServerList();
            this.showNotification(`Server "${name}" removed`, 'info');
        }
    }

    async refreshServers() {
        await this.checkServerStatuses();
        this.renderServerList();
    }

    saveServers() {
        const servers = Array.from(this.servers.values());
        localStorage.setItem('mcp-servers', JSON.stringify(servers));
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
