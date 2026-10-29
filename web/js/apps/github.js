import { invokeNativeTool } from '../live-tool-gateway.js';
import { unwrapNetworkToolResult } from './network-native-tools.js';
import { contentCidForBytes } from '../core/mcp-plus-plus-desktop-client.js';

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
                        <button onclick="githubApp.refreshData()" class="btn-primary sk-btn sk-btn-primary">🔄 Refresh</button>
                        <button onclick="githubApp.showCreateRepo()" class="btn-secondary sk-btn">➕ New Repo</button>
                        <button onclick="githubApp.showSettings()" class="btn-secondary sk-btn">⚙️ Settings</button>
                        <button onclick="githubApp.disconnect()" class="btn-danger sk-btn sk-btn-danger">🚪 Logout</button>
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
                                    <span class="sk-status-dot ${this.mcpConnection ? 'is-ok' : 'is-err'}"></span>${this.mcpConnection ? '🟢 Connected' : '🔴 Disconnected'}
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
                <style>
                    .window[data-app-id="github"] .window-content { display:flex; flex-direction:column; min-height:0; overflow:hidden; padding-bottom:56px; scroll-padding-bottom:64px; box-sizing:border-box; }
                    .window[data-app-id="github"] .window-app-content { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden; }
                    .window[data-app-id="github"] .window-app-content > [id$="-content"] { flex:1 1 0; min-height:0; min-width:0; overflow:hidden; }
                    .window[data-app-id="github"] .github-auth { flex:1 1 auto; width:100%; align-self:stretch; height:100%; max-height:100%; min-height:0; box-sizing:border-box; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; display:flex !important; flex-direction:column; align-items:stretch; justify-content:flex-start; padding-bottom:128px; scroll-padding-bottom:128px; background:#0f172a; }
                    .window[data-app-id="github"] .github-auth .auth-container { flex:0 0 auto; min-height:0; height:auto !important; max-height:none !important; overflow:visible !important; box-sizing:border-box; width:100%; max-width:none; margin:0; display:flex; flex-direction:column; align-items:stretch; }
                    .window[data-app-id="github"] .auth-header, .window[data-app-id="github"] .auth-header h2, .window[data-app-id="github"] .auth-header p { position:static !important; display:block !important; height:auto !important; max-height:none !important; overflow:visible !important; transform:none !important; clip:auto !important; clip-path:none !important; text-align:left !important; white-space:normal !important; line-height:1.35 !important; color:#e2e8f0 !important; margin:0 0 8px 0; }
                    .window[data-app-id="github"] #github-review-panel { flex:0 0 auto; height:auto; min-height:0; width:100%; min-width:0; display:flex; flex-direction:column; align-items:stretch; position:relative; z-index:1; overflow:visible; background:transparent; }
                    .window[data-app-id="github"] #github-review-panel .form-group { position:static !important; display:block; width:100%; margin:0 0 8px 0; }
                    .window[data-app-id="github"] #github-repo-context,
                    .window[data-app-id="github"] #github-file-path { width:100%; max-width:100%; box-sizing:border-box; color:CanvasText; background:Field; border:1px solid GrayText; position:static !important; }
                    .window[data-app-id="github"] #github-repo-context:focus-visible,
                    .window[data-app-id="github"] #github-file-path:focus-visible,
                    .window[data-app-id="github"] #github-retrieve-content:focus-visible { outline:2px solid #58a6ff; outline-offset:2px; }
                    .window[data-app-id="github"] #github-retrieve-content { color:#fff; background:#0969da; border:1px solid #0550ae; opacity:1; cursor:pointer; align-self:flex-start; }
                    .window[data-app-id="github"] #github-review-identity { display:block !important; position:static !important; height:auto !important; min-height:1.4em; max-height:none !important; overflow:visible !important; color:#e2e8f0 !important; margin:8px 0; line-height:1.4; white-space:normal !important; }
                    .window[data-app-id="github"] #github-retrieved-content { display:block !important; position:static !important; flex:0 0 auto !important; width:100%; max-width:100%; min-width:0; height:auto !important; min-height:0 !important; max-height:none !important; margin:8px 0 16px; overflow:visible !important; white-space:pre-wrap !important; overflow-wrap:anywhere !important; word-break:break-word !important; line-height:1.45 !important; color:#e2e8f0 !important; background:rgba(15,23,42,0.95); border:1px solid #334155; border-radius:6px; padding:10px 12px 20px; box-sizing:border-box; }
                    .window[data-app-id="github"] details.github-account-setup { position:static !important; display:block !important; clear:both; width:100%; margin:12px 0 0 0 !important; transform:none !important; background:transparent !important; z-index:0; }
                    .window[data-app-id="github"] details.github-account-setup > summary { position:static !important; display:list-item !important; cursor:pointer; color:#e2e8f0 !important; background:transparent !important; }
                    .window[data-app-id="github"] details.github-account-setup:not([open]) > :not(summary) { display:none !important; }
                    .window[data-app-id="github"] #github-tool-confirm-host:empty { display:none !important; height:0 !important; margin:0 !important; padding:0 !important; background:transparent !important; }
                </style>
                <div class="auth-container" style="min-height:0">
                    <div class="auth-header">
                        <h2>🐙 GitHub Integration</h2>
                        <p role="status">GitHub account not connected. Repository review can use the stored file below; sign-in setup is optional.</p>
                    </div>

                    <div class="auth-method" id="github-review-panel">
                        <h3>Repository review</h3>
                        <p>Select a repository and a known file. The identity below is that selection. Retrieve stays confirmation-bound.</p>
                        <div class="form-group">
                            <label for="github-repo-context">Repository</label>
                            <input type="text" id="github-repo-context" class="sk-input" aria-label="Repository" placeholder="owner/repository" value="${this.escapeReviewText(this.reviewArtifact && this.reviewArtifact.repository)}">
                        </div>
                        <div class="form-group">
                            <label for="github-file-path">File</label>
                            <input type="text" id="github-file-path" class="sk-input" aria-label="Repository file" placeholder="README.md" value="${this.escapeReviewText(this.reviewArtifact && this.reviewArtifact.file)}" onkeydown="if(event.key==='Enter'){event.preventDefault();githubApp.inspectRepositoryContext();}">
                        </div>
                        <button type="button" id="github-retrieve-content" class="btn-primary sk-btn sk-btn-primary" onclick="githubApp.retrieveSelectedContent(event)">Retrieve selected file</button>
                        <div id="github-tool-confirm-host"></div>
                        <p id="github-review-identity" role="status">${this.escapeReviewText(this.reviewIdentityText())}</p>
                        ${typeof this.reviewArtifact?.content === 'string' ? `<p>Stored README preview; retrieve again to verify current content.</p><pre id="github-retrieved-content">${this.escapeReviewText(this.reviewArtifact.content)}</pre>` : ''}
                        <p id="github-review-error" role="alert"></p>
                    </div>
                    
                    <details class="github-account-setup">
                        <summary>Connect GitHub account (not connected)</summary>
                    <div class="auth-methods">
                        <div class="auth-method">
                            <h3>🔑 Personal Access Token</h3>
                            <p>Use a GitHub Personal Access Token for authentication.</p>
                            <div class="form-group">
                                <label for="github-token">GitHub Token:</label>
                                <input type="password" id="github-token" name="github-token" class="sk-input" aria-label="GitHub token" autocomplete="off" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" style="color:CanvasText;background-color:Field;caret-color:CanvasText;border:1px solid GrayText">
                                <small>Generate a token at <a href="https://github.com/settings/tokens" target="_blank">GitHub Settings → Developer settings → Personal access tokens</a></small>
                            </div>
                            <button onclick="githubApp.authenticateWithToken()" class="btn-primary sk-btn sk-btn-primary">Connect with Token</button>
                        </div>
                        
                        <div class="auth-divider">OR</div>
                        
                        <div class="auth-method">
                            <h3>🔐 OAuth</h3>
                            <p>Sign in with your GitHub account using OAuth (requires OAuth Login app configuration).</p>
                            <button type="button" id="github-oauth" onclick="githubApp.authenticateWithOAuth()" class="btn-primary sk-btn sk-btn-primary" aria-label="Sign in with GitHub">
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
                    </details>
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
                    <input type="text" id="repo-search" class="sk-input" placeholder="Search repositories..." onkeyup="githubApp.searchRepositories()">
                    <select id="repo-sort" class="sk-select" onchange="githubApp.sortRepositories()">
                        <option value="updated">Recently Updated</option>
                        <option value="created">Recently Created</option>
                        <option value="name">Name</option>
                        <option value="stars">Stars</option>
                    </select>
                `;
            case 'issues':
                return `
                    <input type="text" id="issue-search" class="sk-input" placeholder="Search issues..." onkeyup="githubApp.searchIssues()">
                    <select id="issue-filter" class="sk-select" onchange="githubApp.filterIssues()">
                        <option value="all">All Issues</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="assigned">Assigned to me</option>
                    </select>
                `;
            case 'pulls':
                return `
                    <input type="text" id="pr-search" class="sk-input" placeholder="Search pull requests..." onkeyup="githubApp.searchPullRequests()">
                    <select id="pr-filter" class="sk-select" onchange="githubApp.filterPullRequests()">
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
                <div class="empty-state sk-empty">
                    <div class="empty-icon">📚</div>
                    <h3>No repositories found</h3>
                    <p>Create your first repository or check your GitHub token permissions.</p>
                    <button onclick="githubApp.showCreateRepo()" class="btn-primary sk-btn sk-btn-primary">📚 Create Repository</button>
                </div>
            `;
        }

        const visibleRepos = this.filteredRepositories();
        return `
            <div class="repositories-grid">
                ${visibleRepos.map(repo => `
                    <div class="repository-card sk-card">
                        <div class="repo-header">
                            <div class="repo-info">
                                <h4>${repo.name}</h4>
                                <div class="repo-meta">
                                    <span class="repo-owner">${repo.owner.login}</span>
                                    ${repo.private ? '<span class="private-badge sk-badge">🔒 Private</span>' : '<span class="public-badge sk-badge">🌍 Public</span>'}
                                </div>
                            </div>
                            <div class="repo-actions">
                                <button onclick="githubApp.openRepository('${repo.full_name}')" class="btn-sm btn-primary sk-btn sk-btn-primary">📖 Open</button>
                                <button onclick="githubApp.cloneRepository('${repo.clone_url}')" class="btn-sm btn-secondary sk-btn">📥 Clone</button>
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
                <div class="empty-state sk-empty">
                    <div class="empty-icon">🐛</div>
                    <h3>No issues found</h3>
                    <p>No issues match your current filter criteria.</p>
                </div>
            `;
        }

        return `
            <div class="issues-list">
                ${this.filteredIssues().map(issue => `
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
                                <button onclick="githubApp.openIssue('${issue.html_url}')" class="btn-sm btn-primary sk-btn sk-btn-primary">📖 Open</button>
                                <button onclick="githubApp.editIssue(${issue.id})" class="btn-sm btn-secondary sk-btn">✏️ Edit</button>
                            </div>
                        </div>
                        
                        <div class="issue-labels">
                            ${(issue.labels || []).map(label => `
                                <span class="label sk-badge" style="background-color: #${label.color}">
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
                <div class="empty-state sk-empty">
                    <div class="empty-icon">🔀</div>
                    <h3>No pull requests found</h3>
                    <p>No pull requests match your current filter criteria.</p>
                </div>
            `;
        }

        return `
            <div class="pulls-list">
                ${this.filteredPullRequests().map(pr => `
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
                                <button onclick="githubApp.openPullRequest('${pr.html_url}')" class="btn-sm btn-primary sk-btn sk-btn-primary">📖 Open</button>
                                ${pr.state === 'open' ? `
                                    <button onclick="githubApp.mergePullRequest(${pr.id})" class="btn-sm btn-success sk-btn sk-btn-primary">🔀 Merge</button>
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
                <div class="empty-state sk-empty">
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
                <div class="empty-state sk-empty">
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
                <div class="empty-state sk-empty">
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
                        <button onclick="githubApp.createRepository()" class="btn-primary sk-btn sk-btn-primary">📚 Create Repository</button>
                        <button onclick="githubApp.hideCreateRepo()" class="btn-secondary sk-btn">Cancel</button>
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
                                <button onclick="githubApp.updateToken()" class="btn-sm btn-primary sk-btn sk-btn-primary">Update Token</button>
                            </div>
                        </div>
                        
                        <div class="settings-section">
                            <h4>🔌 MCP Connection</h4>
                            <div class="mcp-status">
                                Status: <span class="${this.mcpConnection ? 'connected' : 'disconnected'}">
                                    ${this.mcpConnection ? '🟢 Connected' : '🔴 Disconnected'}
                                </span>
                            </div>
                            <button onclick="githubApp.reconnectMCP()" class="btn-secondary sk-btn">🔄 Reconnect MCP</button>
                        </div>
                        
                        <div class="settings-section">
                            <h4>📊 Data Management</h4>
                            <button onclick="githubApp.clearCache()" class="btn-secondary sk-btn">🗑️ Clear Cache</button>
                            <button onclick="githubApp.exportData()" class="btn-secondary sk-btn">📤 Export Data</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    escapeReviewText(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[ch]);
    }

    reviewIdentityText() {
        const artifact = this.reviewArtifact;
        if (!artifact || !artifact.repository || !artifact.file) return '';
        return `${artifact.repository} · ${artifact.file}`;
    }

    setReviewMessage(errorText) {
        const error = document.getElementById('github-review-error');
        const identity = document.getElementById('github-review-identity');
        if (error) error.textContent = errorText || '';
        if (errorText && identity) identity.textContent = '';
    }

    inspectRepositoryContext() {
        const repository = (document.getElementById('github-repo-context')?.value || '').trim();
        const file = (document.getElementById('github-file-path')?.value || '').trim();
        const ownerRepo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
        if (!ownerRepo || !file) {
            this.reviewArtifact = null;
            this.saveSettings();
            this.setReviewMessage('Repository not found. Select an accessible repository and retry.');
            return;
        }
        this.reviewArtifact = { repository, file };
        this.saveSettings();
        const error = document.getElementById('github-review-error');
        const identity = document.getElementById('github-review-identity');
        if (error) error.textContent = '';
        if (identity) identity.textContent = this.reviewIdentityText();
    }

    nativeInvoke(surface) {
        return invokeNativeTool;
    }

    async retrieveSelectedContent(event) {
        if (!this.reviewArtifact?.repository || !this.reviewArtifact?.file) {
            this.setReviewMessage('Repository not found. Select an accessible repository and retry.');
            return;
        }
        const trigger = event?.currentTarget || event?.target || null;
        const surface = trigger?.closest?.('.window-app-content')
            || document.querySelector('.window[data-app-id="github"] .window-app-content');
        if (!surface) { this.setReviewMessage('The originating GitHub window is unavailable.'); return; }
        const identity = surface.querySelector('#github-review-identity');
        if (identity) identity.textContent = 'Retrieving selected file…';
        try {
            const catalogResponse = await fetch('/mcp/tools/bindings?app_id=github', { cache: 'no-store' });
            const catalog = await catalogResponse.json();
            const bindingId = 'github.ipfs_kit_py.retrieve_content';
            const control = catalog.controls?.find(item => item.binding_id === bindingId);
            const cid = control?.safe_payloads?.ipfs_cat?.cid;
            if (!catalogResponse.ok || control?.status !== 'available' || typeof cid !== 'string') throw new Error('No reviewed repository artifact CID is available.');
            const result = await invokeNativeTool(surface, 'github', bindingId, {
                executionMode: 'execute', toolId: 'ipfs_cat', payload: { cid, fixture_scope: 'svf-github-review' }, trigger
            });
            if (result === null) throw new Error('Retrieve cancelled before dispatch.');
            if (result.ok !== true || result.outcome !== 'executed') throw new Error('The native repository retrieve failed.');
            const actual = unwrapNetworkToolResult(result.result);
            if (actual?.cid !== cid || typeof actual.bytes_base64 !== 'string') throw new Error('The owner returned no matching repository bytes.');
            const bytes = Uint8Array.from(atob(actual.bytes_base64), char => char.charCodeAt(0));
            if (await contentCidForBytes(bytes) !== cid) throw new Error('Repository artifact bytes do not match their CID.');
            const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            if (record.repository !== this.reviewArtifact.repository || record.file !== this.reviewArtifact.file || typeof record.content !== 'string') {
                throw new Error('The stored repository artifact does not match the selected repository and file.');
            }
            this.reviewArtifact = { ...this.reviewArtifact, cid, content: record.content };
            let preview = surface.querySelector('#github-retrieved-content');
            if (!preview) {
                preview = document.createElement('pre');
                preview.id = 'github-retrieved-content';
                const anchor = identity || surface.querySelector('#github-retrieve-content');
                if (anchor) anchor.after(preview);
                else surface.querySelector('#github-review-panel')?.append(preview);
            }
            preview.style.cssText = 'display:block;position:static;flex:0 0 auto;width:100%;height:auto;min-height:0;max-height:none;overflow:visible;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.45;color:#e2e8f0;background:rgba(15,23,42,0.95);border:1px solid #334155;border-radius:6px;padding:10px 12px 20px;margin:8px 0 16px;box-sizing:border-box';
            preview.textContent = record.content;
            this.setReviewMessage('');
            if (identity) identity.textContent = this.reviewIdentityText();
            this.saveSettings();
        } catch (error) {
            if (identity) identity.textContent = 'Selected file has not been verified.';
            this.setReviewMessage(`Content retrieve failed: ${error.message}`);
        }
    }

    initializeEventHandlers() {
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
        this.reviewArtifact = null;
        try {
            if (typeof localStorage !== 'undefined') {
                const settings = JSON.parse(localStorage.getItem('github-app-settings') || '{}');
                this.accessToken = settings.accessToken;
                this.user = settings.user;
                const artifact = settings.reviewArtifact;
                if (artifact && artifact.repository && artifact.file) {
                    this.reviewArtifact = {
                        repository: String(artifact.repository),
                        file: String(artifact.file),
                        ...(typeof artifact.content === 'string' && artifact.content.length <= 65536 ? { content: artifact.content } : {})
                    };
                }
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
                    user: this.user,
                    reviewArtifact: this.reviewArtifact || null
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

    // Real local search/filter/sort over the GitHub API data already
    // fetched into this.repositories / this.issues / this.pullRequests.
    refreshViewContent() {
        const content = document.querySelector('.github-app .view-content, .view-content');
        if (content) content.innerHTML = this.renderCurrentView();
    }

    searchRepositories() {
        const input = document.getElementById('repo-search');
        this.repoQuery = (input?.value || '').toLowerCase();
        this.refreshViewContent();
    }

    sortRepositories() {
        const select = document.getElementById('repo-sort');
        this.repoSort = select?.value || 'updated';
        this.refreshViewContent();
    }

    filteredRepositories() {
        const query = this.repoQuery || '';
        let repos = Array.from(this.repositories.values());
        if (query) {
            repos = repos.filter(repo =>
                (repo.name || '').toLowerCase().includes(query) ||
                (repo.description || '').toLowerCase().includes(query) ||
                (repo.full_name || '').toLowerCase().includes(query));
        }
        const sort = this.repoSort || 'updated';
        const byDate = key => new Date(b[key] || 0) - new Date(a[key] || 0);
        repos.sort((a, b) => {
            switch (sort) {
                case 'created': return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                case 'name': return (a.name || '').localeCompare(b.name || '');
                case 'stars': return (b.stargazers_count || 0) - (a.stargazers_count || 0);
                default: return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
            }
        });
        return repos;
    }

    searchIssues() {
        const input = document.getElementById('issue-search');
        this.issueQuery = (input?.value || '').toLowerCase();
        this.refreshViewContent();
    }

    filterIssues() {
        const select = document.getElementById('issue-filter');
        this.issueFilter = select?.value || 'all';
        this.refreshViewContent();
    }

    filteredIssues() {
        const query = this.issueQuery || '';
        const filter = this.issueFilter || 'all';
        return Array.from(this.issues.values()).filter(issue => {
            if (query && !((issue.title || '').toLowerCase().includes(query) ||
                String(issue.number || '').includes(query))) return false;
            switch (filter) {
                case 'open': return issue.state === 'open';
                case 'closed': return issue.state === 'closed';
                case 'assigned': return issue.assignee && issue.assignee.login === this.user?.login;
                default: return true;
            }
        });
    }

    searchPullRequests() {
        const input = document.getElementById('pr-search');
        this.prQuery = (input?.value || '').toLowerCase();
        this.refreshViewContent();
    }

    filterPullRequests() {
        const select = document.getElementById('pr-filter');
        this.prFilter = select?.value || 'all';
        this.refreshViewContent();
    }

    filteredPullRequests() {
        const query = this.prQuery || '';
        const filter = this.prFilter || 'all';
        return Array.from(this.pullRequests.values()).filter(pr => {
            if (query && !((pr.title || '').toLowerCase().includes(query) ||
                String(pr.number || '').includes(query))) return false;
            switch (filter) {
                case 'open': return pr.state === 'open';
                case 'closed': return pr.state === 'closed' && !pr.merged;
                case 'merged': return pr.merged === true;
                default: return true;
            }
        });
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
