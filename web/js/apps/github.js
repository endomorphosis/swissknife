// GitHub Integration App - Full GitHub management via MCP
class GitHubApp {
    constructor() {
        this.name = 'GitHub';
        this.icon = '🐙';
        this.repositories = new Map();
        this.issues = new Map();
        this.pullRequests = new Map();
        this.currentRepo = null;
        this.currentView = 'repositories';
        this.mcpConnection = null;
        this.accessToken = null;
        this.user = null;
        
        // Load saved settings
        this.loadSettings();
        
        // Try to connect to GitHub MCP server
        this.initializeMCPConnection();
    }

    async render() {
        if (!this.accessToken) {
            return this.renderAuthenticationScreen();
        }

        return `
            <div class="github-app">
                <div class="github-header">
                    <div class="header-left">
                        <h2>🐙 GitHub Integration</h2>
                        <div class="user-info">
                            ${this.user ? `
                                <img src="${this.user.avatar_url}" alt="${this.user.login}" class="user-avatar">
                                <span class="username">@${this.user.login}</span>
                            ` : ''}
                        </div>
                    </div>
                    <div class="github-actions">
                        <button onclick="githubApp.refreshData()" class="btn-primary">🔄 Refresh</button>
                        <button onclick="githubApp.showCreateRepo()" class="btn-secondary">➕ New Repo</button>
                        <button onclick="githubApp.showSettings()" class="btn-secondary">⚙️ Settings</button>
                        <button onclick="githubApp.disconnect()" class="btn-danger">🚪 Logout</button>
                    </div>
                </div>
                
                <div class="github-content">
                    <div class="github-sidebar">
                        <div class="nav-menu">
                            <div class="nav-item ${this.currentView === 'repositories' ? 'active' : ''}" 
                                 onclick="githubApp.setView('repositories')">
                                <span class="nav-icon">📚</span>
                                <span class="nav-label">Repositories</span>
                                <span class="nav-count">${this.repositories.size}</span>
                            </div>
                            <div class="nav-item ${this.currentView === 'issues' ? 'active' : ''}" 
                                 onclick="githubApp.setView('issues')">
                                <span class="nav-icon">🐛</span>
                                <span class="nav-label">Issues</span>
                                <span class="nav-count">${this.issues.size}</span>
                            </div>
                            <div class="nav-item ${this.currentView === 'pulls' ? 'active' : ''}" 
                                 onclick="githubApp.setView('pulls')">
                                <span class="nav-icon">🔀</span>
                                <span class="nav-label">Pull Requests</span>
                                <span class="nav-count">${this.pullRequests.size}</span>
                            </div>
                            <div class="nav-item ${this.currentView === 'organizations' ? 'active' : ''}" 
                                 onclick="githubApp.setView('organizations')">
                                <span class="nav-icon">🏢</span>
                                <span class="nav-label">Organizations</span>
                            </div>
                            <div class="nav-item ${this.currentView === 'gists' ? 'active' : ''}" 
                                 onclick="githubApp.setView('gists')">
                                <span class="nav-icon">📝</span>
                                <span class="nav-label">Gists</span>
                            </div>
                            <div class="nav-item ${this.currentView === 'workflows' ? 'active' : ''}" 
                                 onclick="githubApp.setView('workflows')">
                                <span class="nav-icon">⚡</span>
                                <span class="nav-label">Actions</span>
                            </div>
                        </div>
                        
                        <div class="quick-stats">
                            <h4>📊 Quick Stats</h4>
                            <div class="stat-item">
                                <span>Public Repos:</span>
                                <span class="stat-value">${this.user?.public_repos || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span>Followers:</span>
                                <span class="stat-value">${this.user?.followers || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span>Following:</span>
                                <span class="stat-value">${this.user?.following || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span>MCP Status:</span>
                                <span class="stat-value ${this.mcpConnection ? 'connected' : 'disconnected'}">
                                    ${this.mcpConnection ? '🟢 Connected' : '🔴 Disconnected'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="github-main">
                        <div class="view-header">
                            <h3>${this.getViewTitle()}</h3>
                            <div class="view-actions">
                                ${this.renderViewActions()}
                            </div>
                        </div>
                        
                        <div class="view-content">
                            ${this.renderCurrentView()}
                        </div>
                    </div>
                </div>
                
                ${this.renderModals()}
            </div>
        `;
    }

    renderAuthenticationScreen() {
        return `
            <div class="github-auth">
                <div class="auth-container">
                    <div class="auth-header">
                        <h2>🐙 GitHub Integration</h2>
                        <p>Connect your GitHub account to manage repositories, issues, and pull requests.</p>
                    </div>
                    
                    <div class="auth-methods">
                        <div class="auth-method">
                            <h3>🔑 Personal Access Token</h3>
                            <p>Use a GitHub Personal Access Token for authentication.</p>
                            <div class="form-group">
                                <label for="github-token">GitHub Token:</label>
                                <input type="password" id="github-token" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                                <small>Generate a token at <a href="https://github.com/settings/tokens" target="_blank">GitHub Settings → Developer settings → Personal access tokens</a></small>
                            </div>
                            <button onclick="githubApp.authenticateWithToken()" class="btn-primary">Connect with Token</button>
                        </div>
                        
                        <div class="auth-divider">OR</div>
                        
                        <div class="auth-method">
                            <h3>🔐 OAuth</h3>
                            <p>Sign in with your GitHub account using OAuth (requires OAuth Login app configuration).</p>
                            <button onclick="githubApp.authenticateWithOAuth()" class="btn-secondary">
                                🔐 Sign in with GitHub
                            </button>
                        </div>
                    </div>
                    
                    <div class="auth-help">
                        <h4>Required Permissions</h4>
                        <ul>
                            <li>✅ <code>repo</code> - Access to repositories</li>
                            <li>✅ <code>issues</code> - Manage issues</li>
                            <li>✅ <code>pull_requests</code> - Manage pull requests</li>
                            <li>✅ <code>user</code> - Access user information</li>
                            <li>✅ <code>workflow</code> - Access GitHub Actions</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    getViewTitle() {
        const titles = {
            repositories: '📚 Repositories',
            issues: '🐛 Issues',
            pulls: '🔀 Pull Requests', 
            organizations: '🏢 Organizations',
            gists: '📝 Gists',
            workflows: '⚡ GitHub Actions'
        };
        return titles[this.currentView] || 'GitHub';
    }

    renderViewActions() {
        switch (this.currentView) {
            case 'repositories':
                return `
                    <input type="text" id="repo-search" placeholder="Search repositories..." onkeyup="githubApp.searchRepositories()">
                    <select id="repo-sort" onchange="githubApp.sortRepositories()">
                        <option value="updated">Recently Updated</option>
                        <option value="created">Recently Created</option>
                        <option value="name">Name</option>
                        <option value="stars">Stars</option>
                    </select>
                `;
            case 'issues':
                return `
                    <input type="text" id="issue-search" placeholder="Search issues..." onkeyup="githubApp.searchIssues()">
                    <select id="issue-filter" onchange="githubApp.filterIssues()">
                        <option value="all">All Issues</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="assigned">Assigned to me</option>
                    </select>
                `;
            case 'pulls':
                return `
                    <input type="text" id="pr-search" placeholder="Search pull requests..." onkeyup="githubApp.searchPullRequests()">
                    <select id="pr-filter" onchange="githubApp.filterPullRequests()">
                        <option value="all">All PRs</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="merged">Merged</option>
                        <option value="mine">Created by me</option>
                    </select>
                `;
            default:
                return '';
        }
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'repositories':
                return this.renderRepositories();
            case 'issues':
                return this.renderIssues();
            case 'pulls':
                return this.renderPullRequests();
            case 'organizations':
                return this.renderOrganizations();
            case 'gists':
                return this.renderGists();
            case 'workflows':
                return this.renderWorkflows();
            default:
                return '<div class="loading">Loading...</div>';
        }
    }

    renderRepositories() {
        if (this.repositories.size === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📚</div>
                    <h3>No repositories found</h3>
                    <p>Create your first repository or check your GitHub token permissions.</p>
                    <button onclick="githubApp.showCreateRepo()" class="btn-primary">📚 Create Repository</button>
                </div>
            `;
        }

        return `
            <div class="repositories-grid">
                ${Array.from(this.repositories.values()).map(repo => `
                    <div class="repository-card">
                        <div class="repo-header">
                            <div class="repo-info">
                                <h4>${repo.name}</h4>
                                <div class="repo-meta">
                                    <span class="repo-owner">${repo.owner.login}</span>
                                    ${repo.private ? '<span class="private-badge">🔒 Private</span>' : '<span class="public-badge">🌍 Public</span>'}
                                </div>
                            </div>
                            <div class="repo-actions">
                                <button onclick="githubApp.openRepository('${repo.full_name}')" class="btn-sm btn-primary">📖 Open</button>
                                <button onclick="githubApp.cloneRepository('${repo.clone_url}')" class="btn-sm btn-secondary">📥 Clone</button>
                            </div>
                        </div>
                        
                        <div class="repo-description">
                            ${repo.description || 'No description available'}
                        </div>
                        
                        <div class="repo-stats">
                            <div class="stat">
                                <span class="stat-icon">⭐</span>
                                <span class="stat-value">${repo.stargazers_count}</span>
                            </div>
                            <div class="stat">
                                <span class="stat-icon">🍴</span>
                                <span class="stat-value">${repo.forks_count}</span>
                            </div>
                            <div class="stat">
                                <span class="stat-icon">👀</span>
                                <span class="stat-value">${repo.watchers_count}</span>
                            </div>
                            ${repo.language ? `
                                <div class="stat">
                                    <span class="language-dot" style="background-color: ${this.getLanguageColor(repo.language)}"></span>
                                    <span class="stat-value">${repo.language}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="repo-updated">
                            Updated ${this.formatDate(repo.updated_at)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderIssues() {
        if (this.issues.size === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">🐛</div>
                    <h3>No issues found</h3>
                    <p>No issues match your current filter criteria.</p>
                </div>
            `;
        }

        return `
            <div class="issues-list">
                ${Array.from(this.issues.values()).map(issue => `
                    <div class="issue-card ${issue.state}">
                        <div class="issue-header">
                            <div class="issue-info">
                                <h4>${issue.title}</h4>
                                <div class="issue-meta">
                                    <span class="issue-number">#${issue.number}</span>
                                    <span class="issue-repo">${issue.repository ? issue.repository.full_name : 'Unknown repo'}</span>
                                    <span class="issue-state state-${issue.state}">${issue.state}</span>
                                </div>
                            </div>
                            <div class="issue-actions">
                                <button onclick="githubApp.openIssue('${issue.html_url}')" class="btn-sm btn-primary">📖 Open</button>
                                <button onclick="githubApp.editIssue(${issue.id})" class="btn-sm btn-secondary">✏️ Edit</button>
                            </div>
                        </div>
                        
                        <div class="issue-labels">
                            ${(issue.labels || []).map(label => `
                                <span class="label" style="background-color: #${label.color}">
                                    ${label.name}
                                </span>
                            `).join('')}
                        </div>
                        
                        <div class="issue-assignees">
                            ${(issue.assignees || []).map(assignee => `
                                <img src="${assignee.avatar_url}" alt="${assignee.login}" class="assignee-avatar" title="${assignee.login}">
                            `).join('')}
                        </div>
                        
                        <div class="issue-updated">
                            Updated ${this.formatDate(issue.updated_at)} by ${issue.user.login}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderPullRequests() {
        if (this.pullRequests.size === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">🔀</div>
                    <h3>No pull requests found</h3>
                    <p>No pull requests match your current filter criteria.</p>
                </div>
            `;
        }

        return `
            <div class="pulls-list">
                ${Array.from(this.pullRequests.values()).map(pr => `
                    <div class="pull-card ${pr.state}">
                        <div class="pull-header">
                            <div class="pull-info">
                                <h4>${pr.title}</h4>
                                <div class="pull-meta">
                                    <span class="pull-number">#${pr.number}</span>
                                    <span class="pull-repo">${pr.base ? pr.base.repo.full_name : 'Unknown repo'}</span>
                                    <span class="pull-state state-${pr.state}">${pr.merged ? 'merged' : pr.state}</span>
                                </div>
                            </div>
                            <div class="pull-actions">
                                <button onclick="githubApp.openPullRequest('${pr.html_url}')" class="btn-sm btn-primary">📖 Open</button>
                                ${pr.state === 'open' ? `
                                    <button onclick="githubApp.mergePullRequest(${pr.id})" class="btn-sm btn-success">🔀 Merge</button>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div class="pull-branches">
                            <span class="branch">${pr.head ? pr.head.ref : 'unknown'}</span>
                            <span class="arrow">→</span>
                            <span class="branch">${pr.base ? pr.base.ref : 'unknown'}</span>
                        </div>
                        
                        <div class="pull-stats">
                            <span class="stat">✅ ${pr.commits || 0} commits</span>
                            <span class="stat">📝 ${pr.comments || 0} comments</span>
                            <span class="stat">✏️ ${pr.review_comments || 0} review comments</span>
                            <span class="stat">➕ ${pr.additions || 0} additions</span>
                            <span class="stat">➖ ${pr.deletions || 0} deletions</span>
                        </div>
                        
                        <div class="pull-updated">
                            Updated ${this.formatDate(pr.updated_at)} by ${pr.user.login}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderOrganizations() {
        return `
            <div class="organizations-grid">
                <div class="empty-state">
                    <div class="empty-icon">🏢</div>
                    <h3>Organizations</h3>
                    <p>Organization management coming soon!</p>
                </div>
            </div>
        `;
    }

    renderGists() {
        return `
            <div class="gists-grid">
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <h3>Gists</h3>
                    <p>Gist management coming soon!</p>
                </div>
            </div>
        `;
    }

    renderWorkflows() {
        return `
            <div class="workflows-grid">
                <div class="empty-state">
                    <div class="empty-icon">⚡</div>
                    <h3>GitHub Actions</h3>
                    <p>Workflow management coming soon!</p>
                </div>
            </div>
        `;
    }

    renderModals() {
        return `
            <!-- Create Repository Modal -->
            <div id="create-repo-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>📚 Create New Repository</h3>
                        <button onclick="githubApp.hideCreateRepo()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-repo-form">
                            <div class="form-group">
                                <label for="repo-name">Repository Name:</label>
                                <input type="text" id="repo-name" placeholder="my-awesome-project" required>
                            </div>
                            <div class="form-group">
                                <label for="repo-description">Description:</label>
                                <textarea id="repo-description" placeholder="A short description of your project" rows="3"></textarea>
                            </div>
                            <div class="form-group checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="repo-private">
                                    <span class="checkmark"></span>
                                    Private repository
                                </label>
                            </div>
                            <div class="form-group checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="repo-init-readme" checked>
                                    <span class="checkmark"></span>
                                    Initialize with README
                                </label>
                            </div>
                            <div class="form-group">
                                <label for="repo-gitignore">Add .gitignore:</label>
                                <select id="repo-gitignore">
                                    <option value="">None</option>
                                    <option value="Node">Node.js</option>
                                    <option value="Python">Python</option>
                                    <option value="Java">Java</option>
                                    <option value="Go">Go</option>
                                    <option value="Rust">Rust</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="repo-license">License:</label>
                                <select id="repo-license">
                                    <option value="">None</option>
                                    <option value="mit">MIT License</option>
                                    <option value="apache-2.0">Apache License 2.0</option>
                                    <option value="gpl-3.0">GNU GPLv3</option>
                                    <option value="bsd-3-clause">BSD 3-Clause</option>
                                </select>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button onclick="githubApp.createRepository()" class="btn-primary">📚 Create Repository</button>
                        <button onclick="githubApp.hideCreateRepo()" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Settings Modal -->
            <div id="github-settings-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>⚙️ GitHub Settings</h3>
                        <button onclick="githubApp.hideSettings()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="settings-section">
                            <h4>🔑 Authentication</h4>
                            <div class="form-group">
                                <label for="settings-token">GitHub Token:</label>
                                <input type="password" id="settings-token" value="${this.accessToken || ''}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                                <button onclick="githubApp.updateToken()" class="btn-sm btn-primary">Update Token</button>
                            </div>
                        </div>
                        
                        <div class="settings-section">
                            <h4>🔌 MCP Connection</h4>
                            <div class="mcp-status">
                                Status: <span class="${this.mcpConnection ? 'connected' : 'disconnected'}">
                                    ${this.mcpConnection ? '🟢 Connected' : '🔴 Disconnected'}
                                </span>
                            </div>
                            <button onclick="githubApp.reconnectMCP()" class="btn-secondary">🔄 Reconnect MCP</button>
                        </div>
                        
                        <div class="settings-section">
                            <h4>📊 Data Management</h4>
                            <button onclick="githubApp.clearCache()" class="btn-secondary">🗑️ Clear Cache</button>
                            <button onclick="githubApp.exportData()" class="btn-secondary">📤 Export Data</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Authentication methods
    async authenticateWithToken() {
        const token = document.getElementById('github-token').value;
        if (!token) {
            alert('Please enter a GitHub token');
            return;
        }

        try {
            // Test the token by fetching user info
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                this.accessToken = token;
                this.user = await response.json();
                this.saveSettings();
                await this.initializeData();
                this.showNotification('Successfully connected to GitHub!', 'success');
                
                // Re-render the app
                this.refreshUI();
            } else {
                throw new Error('Invalid token or insufficient permissions');
            }
        } catch (error) {
            console.error('GitHub authentication failed:', error);
            this.showNotification(`Authentication failed: ${error.message}`, 'error');
        }
    }

    async authenticateWithOAuth() {
        // OAuth implementation would go here
        this.showNotification('OAuth authentication coming soon!', 'info');
    }

    // Core functionality methods
    async initializeMCPConnection() {
        try {
            console.log('🔗 Connecting to GitHub MCP server...');
            
            // Try to connect to GitHub MCP server through MCP Control app
            if (typeof window !== 'undefined' && window.mcpControlApp) {
                const githubServer = Array.from(window.mcpControlApp.remoteServers.values())
                    .find(server => server.name.toLowerCase().includes('github'));
                
                if (githubServer && githubServer.status === 'connected') {
                    this.mcpConnection = githubServer;
                    console.log('✅ Connected to GitHub MCP server');
                    await this.connectToGitHubAPI();
                    return;
                }
            }
            
            // Fallback to direct API connection
            console.log('⚠️ GitHub MCP server not available - using direct API');
            await this.initializeDirectAPI();
            
        } catch (error) {
            console.warn('❌ Failed to connect to GitHub MCP server:', error);
            await this.initializeDirectAPI();
        }
    }

    async initializeDirectAPI() {
        console.log('🔧 Initializing direct GitHub API connection...');
        
        // Set up GitHub API client with stored token
        if (this.accessToken) {
            try {
                // Test API connection with user info
                const response = await this.makeAPIRequest('/user');
                if (response.ok) {
                    this.user = await response.json();
                    console.log('✅ GitHub API connected successfully');
                    await this.loadInitialData();
                } else if (response.status === 401) {
                    console.log('⚠️ GitHub token expired - requires re-authentication');
                    this.accessToken = null;
                    this.saveSettings();
                }
            } catch (error) {
                console.error('❌ GitHub API connection failed:', error);
            }
        }
    }

    async makeAPIRequest(endpoint, options = {}) {
        const baseURL = 'https://api.github.com';
        const url = endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`;
        
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SwissKnife-Desktop/1.0',
            ...options.headers
        };

        if (this.accessToken) {
            headers['Authorization'] = `token ${this.accessToken}`;
        }

        return fetch(url, {
            ...options,
            headers
        });
    }

    async loadInitialData() {
        console.log('📊 Loading GitHub data...');
        
        try {
            // Load repositories
            await this.loadRepositories();
            
            // Load issues
            await this.loadIssues();
            
            // Load pull requests
            await this.loadPullRequests();
            
            console.log('✅ GitHub data loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load GitHub data:', error);
        }
    }

    async initializeData() {
        if (!this.accessToken) return;

        await this.loadInitialData();
    }

    async loadRepositories() {
        try {
            const response = await this.makeAPIRequest('/user/repos?per_page=100&sort=updated');
            if (response.ok) {
                const repos = await response.json();
                this.repositories.clear();
                repos.forEach(repo => {
                    this.repositories.set(repo.id, repo);
                });
                console.log(`📚 Loaded ${repos.length} repositories`);
            }
        } catch (error) {
            console.error('❌ Failed to load repositories:', error);
        }
    }

    async loadIssues() {
        try {
            const response = await this.makeAPIRequest('/issues?filter=all&state=open&per_page=50');
            if (response.ok) {
                const issues = await response.json();
                this.issues.clear();
                issues.forEach(issue => {
                    if (!issue.pull_request) { // Exclude pull requests
                        this.issues.set(issue.id, issue);
                    }
                });
                console.log(`🐛 Loaded ${this.issues.size} issues`);
            }
        } catch (error) {
            console.error('❌ Failed to load issues:', error);
        }
    }

    async loadPullRequests() {
        try {
            const response = await this.makeAPIRequest('/issues?filter=all&state=open&per_page=50');
            if (response.ok) {
                const issues = await response.json();
                this.pullRequests.clear();
                issues.forEach(issue => {
                    if (issue.pull_request) { // Only pull requests
                        this.pullRequests.set(issue.id, issue);
                    }
                });
                console.log(`🔀 Loaded ${this.pullRequests.size} pull requests`);
            }
        } catch (error) {
            console.error('❌ Failed to load pull requests:', error);
        }
    }

    async connectToGitHubAPI() {
        // Enhanced connection method when MCP is available
        if (this.mcpConnection) {
            console.log('🔗 Using GitHub MCP connection for API calls');
            // MCP-based API calls would go here
        }
        
        // Fallback to direct API
        await this.initializeDirectAPI();
        
        try {
            // Load repositories
            await this.loadRepositories();
            
            // Load issues
            await this.loadIssues();
            
            // Load pull requests
            await this.loadPullRequests();
            
        } catch (error) {
            console.error('Failed to initialize GitHub data:', error);
            this.showNotification('Failed to load GitHub data', 'error');
        }
    }

    async loadRepositories() {
        try {
            const response = await this.githubRequest('/user/repos?sort=updated&per_page=100');
            const repos = await response.json();
            
            this.repositories.clear();
            repos.forEach(repo => {
                this.repositories.set(repo.id, repo);
            });
            
        } catch (error) {
            console.error('Failed to load repositories:', error);
        }
    }

    async loadIssues() {
        try {
            const response = await this.githubRequest('/issues?filter=all&state=all&per_page=100');
            const issues = await response.json();
            
            this.issues.clear();
            issues.forEach(issue => {
                this.issues.set(issue.id, issue);
            });
            
        } catch (error) {
            console.error('Failed to load issues:', error);
        }
    }

    async loadPullRequests() {
        try {
            const response = await this.githubRequest('/search/issues?q=type:pr+author:' + this.user.login);
            const result = await response.json();
            
            this.pullRequests.clear();
            (result.items || []).forEach(pr => {
                this.pullRequests.set(pr.id, pr);
            });
            
        } catch (error) {
            console.error('Failed to load pull requests:', error);
        }
    }

    async githubRequest(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
        
        return fetch(url, {
            ...options,
            headers: {
                'Authorization': `token ${this.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
    }

    // UI interaction methods
    setView(view) {
        this.currentView = view;
        this.refreshUI();
    }

    showCreateRepo() {
        const modal = document.getElementById('create-repo-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideCreateRepo() {
        const modal = document.getElementById('create-repo-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        document.getElementById('create-repo-form').reset();
    }

    showSettings() {
        const modal = document.getElementById('github-settings-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideSettings() {
        const modal = document.getElementById('github-settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    async createRepository() {
        const name = document.getElementById('repo-name').value;
        const description = document.getElementById('repo-description').value;
        const isPrivate = document.getElementById('repo-private').checked;
        const initReadme = document.getElementById('repo-init-readme').checked;
        const gitignore = document.getElementById('repo-gitignore').value;
        const license = document.getElementById('repo-license').value;

        if (!name) {
            alert('Please enter a repository name');
            return;
        }

        try {
            const repoData = {
                name,
                description: description || undefined,
                private: isPrivate,
                auto_init: initReadme,
                gitignore_template: gitignore || undefined,
                license_template: license || undefined
            };

            const response = await this.githubRequest('/user/repos', {
                method: 'POST',
                body: JSON.stringify(repoData)
            });

            if (response.ok) {
                const newRepo = await response.json();
                this.repositories.set(newRepo.id, newRepo);
                this.hideCreateRepo();
                this.setView('repositories');
                this.showNotification(`Repository "${name}" created successfully!`, 'success');
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create repository');
            }
        } catch (error) {
            console.error('Failed to create repository:', error);
            this.showNotification(`Failed to create repository: ${error.message}`, 'error');
        }
    }

    async refreshData() {
        this.showNotification('Refreshing GitHub data...', 'info');
        await this.initializeData();
        this.refreshUI();
        this.showNotification('GitHub data refreshed!', 'success');
    }

    disconnect() {
        if (confirm('Are you sure you want to disconnect from GitHub?')) {
            this.accessToken = null;
            this.user = null;
            this.repositories.clear();
            this.issues.clear();
            this.pullRequests.clear();
            this.saveSettings();
            this.refreshUI();
            this.showNotification('Disconnected from GitHub', 'info');
        }
    }

    // Utility methods
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
        return date.toLocaleDateString();
    }

    getLanguageColor(language) {
        const colors = {
            'JavaScript': '#f1e05a',
            'TypeScript': '#2b7489',
            'Python': '#3572A5',
            'Java': '#b07219',
            'Go': '#00ADD8',
            'Rust': '#dea584',
            'HTML': '#e34c26',
            'CSS': '#563d7c',
            'C++': '#f34b7d',
            'C#': '#239120',
            'PHP': '#4F5D95',
            'Ruby': '#701516',
            'Swift': '#ffac45',
            'Kotlin': '#F18E33'
        };
        return colors[language] || '#586069';
    }

    loadSettings() {
        try {
            if (typeof localStorage !== 'undefined') {
                const settings = JSON.parse(localStorage.getItem('github-app-settings') || '{}');
                this.accessToken = settings.accessToken;
                this.user = settings.user;
            }
        } catch (error) {
            console.warn('Failed to load GitHub settings:', error);
        }
    }

    saveSettings() {
        try {
            if (typeof localStorage !== 'undefined') {
                const settings = {
                    accessToken: this.accessToken,
                    user: this.user
                };
                localStorage.setItem('github-app-settings', JSON.stringify(settings));
            }
        } catch (error) {
            console.warn('Failed to save GitHub settings:', error);
        }
    }

    refreshUI() {
        // Re-render if we're in the GitHub app
        const container = document.querySelector('.github-app');
        if (container && container.closest('.window')) {
            this.render().then(html => {
                container.outerHTML = html;
            });
        }
    }

    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // Additional methods for repository management
    openRepository(fullName) {
        window.open(`https://github.com/${fullName}`, '_blank');
    }

    cloneRepository(cloneUrl) {
        // Copy clone URL to clipboard
        navigator.clipboard.writeText(`git clone ${cloneUrl}`).then(() => {
            this.showNotification('Clone command copied to clipboard!', 'success');
        });
    }

    openIssue(htmlUrl) {
        window.open(htmlUrl, '_blank');
    }

    openPullRequest(htmlUrl) {
        window.open(htmlUrl, '_blank');
    }

    // Search and filter methods (placeholder implementations)
    searchRepositories() {
        // Implementation would filter repositories based on search input
        console.log('Searching repositories...');
    }

    sortRepositories() {
        // Implementation would sort repositories based on selected criteria
        console.log('Sorting repositories...');
    }

    searchIssues() {
        console.log('Searching issues...');
    }

    filterIssues() {
        console.log('Filtering issues...');
    }

    searchPullRequests() {
        console.log('Searching pull requests...');
    }

    filterPullRequests() {
        console.log('Filtering pull requests...');
    }

    // Settings methods
    updateToken() {
        const newToken = document.getElementById('settings-token').value;
        if (newToken && newToken !== this.accessToken) {
            this.accessToken = newToken;
            this.saveSettings();
            this.initializeData();
            this.showNotification('GitHub token updated!', 'success');
        }
    }

    reconnectMCP() {
        this.initializeMCPConnection();
        this.showNotification('Attempting to reconnect to GitHub MCP server...', 'info');
    }

    clearCache() {
        this.repositories.clear();
        this.issues.clear();
        this.pullRequests.clear();
        this.refreshUI();
        this.showNotification('Cache cleared!', 'info');
    }

    exportData() {
        const data = {
            repositories: Array.from(this.repositories.values()),
            issues: Array.from(this.issues.values()),
            pullRequests: Array.from(this.pullRequests.values()),
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `github-data-${Date.now()}.json`;
        a.click();
        
        this.showNotification('GitHub data exported!', 'success');
    }
}

// Create global instance only when in browser context
let githubApp;
if (typeof window !== 'undefined') {
    githubApp = new GitHubApp();
    
    // Export for window manager and module imports
    window.GitHubApp = GitHubApp;
    window.githubApp = githubApp;

    // Create GitHub app instance for desktop integration
    window.createGitHubApp = function() {
        return {
            name: "GitHub",
            icon: "🐙",
            init: async function(container) {
                const html = await githubApp.render();
                container.innerHTML = html;
                
                // Initialize event handlers
                githubApp.initializeEventHandlers(container);
            },
            destroy: function() {
                // Cleanup if needed
            }
        };
    };
}

export { GitHubApp };