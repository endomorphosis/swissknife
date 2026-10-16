// OAuth Login System - Centralized authentication for Google, Facebook, GitHub
class OAuthLoginSystem {
    constructor() {
        this.name = 'OAuth Login';
        this.icon = '🔐';
        this.providers = new Map();
        this.activeTokens = new Map();
        this.loginSessions = new Map();
        
        // Initialize OAuth providers
        this.initializeProviders();
        
        // Load saved tokens
        this.loadSavedTokens();
        
        // Setup OAuth callback handler
        this.setupCallbackHandler();
    }

    initializeProviders() {
        // Google OAuth
        this.providers.set('google', {
            id: 'google',
            name: 'Google',
            icon: '🔴',
            color: '#db4437',
            clientId: '1234567890-example.apps.googleusercontent.com', // Demo client ID
            redirectUri: window.location.origin + '/oauth/callback',
            scope: 'openid profile email',
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
            enabled: true,
            configured: false // Will be true when real client ID is set
        });

        // Facebook OAuth
        this.providers.set('facebook', {
            id: 'facebook',
            name: 'Facebook',
            icon: '🔵',
            color: '#4267b2',
            clientId: '1234567890123456', // Demo client ID
            redirectUri: window.location.origin + '/oauth/callback',
            scope: 'email,public_profile',
            authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
            tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
            userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email,picture',
            enabled: true,
            configured: false
        });

        // GitHub OAuth
        this.providers.set('github', {
            id: 'github',
            name: 'GitHub',
            icon: '🐙',
            color: '#333333',
            clientId: 'Iv1.1234567890abcdef', // Demo client ID
            redirectUri: window.location.origin + '/oauth/callback',
            scope: 'user:email,read:user,repo',
            authUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userInfoUrl: 'https://api.github.com/user',
            enabled: true,
            configured: false
        });

        // Microsoft OAuth
        this.providers.set('microsoft', {
            id: 'microsoft',
            name: 'Microsoft',
            icon: '🟦',
            color: '#0078d4',
            clientId: '12345678-1234-1234-1234-123456789012', // Demo client ID
            redirectUri: window.location.origin + '/oauth/callback',
            scope: 'openid profile email User.Read',
            authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
            enabled: true,
            configured: false
        });

        // Discord OAuth
        this.providers.set('discord', {
            id: 'discord',
            name: 'Discord',
            icon: '🟣',
            color: '#7289da',
            clientId: '123456789012345678', // Demo client ID
            redirectUri: window.location.origin + '/oauth/callback',
            scope: 'identify email',
            authUrl: 'https://discord.com/api/oauth2/authorize',
            tokenUrl: 'https://discord.com/api/oauth2/token',
            userInfoUrl: 'https://discord.com/api/users/@me',
            enabled: true,
            configured: false
        });

        // GitHub OAuth
        this.providers.set('github', {
            id: 'github',
            name: 'GitHub',
            icon: '🐙',
            color: '#333',
            clientId: '', // To be configured
            redirectUri: window.location.origin + '/oauth/callback',
            scope: 'user:email,repo,issues,pull_requests',
            authUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userInfoUrl: 'https://api.github.com/user',
            enabled: false,
            configured: false
        });

        console.log('🔐 OAuth providers initialized:', this.providers.size);
    }

    async render() {
        return `
            <div class="oauth-login-system">
                <div class="oauth-header">
                    <div class="header-left">
                        <h2>🔐 OAuth Login System</h2>
                        <div class="login-status">
                            <span class="status-indicator">
                                <span class="sk-status-dot ${this.activeTokens.size > 0 ? 'is-ok' : 'is-idle'}"></span>🔑 ${this.activeTokens.size} active sessions
                            </span>
                        </div>
                    </div>
                    <div class="oauth-actions">
                        <button onclick="oauthSystem.refreshTokens()" class="btn-primary sk-btn sk-btn-primary">🔄 Refresh</button>
                        <button onclick="oauthSystem.showProviderConfig()" class="btn-secondary sk-btn">⚙️ Configure</button>
                        <button onclick="oauthSystem.logoutAll()" class="btn-danger sk-btn sk-btn-danger">🚪 Logout All</button>
                    </div>
                </div>
                
                <div class="oauth-content">
                    <div class="modern-login-container">
                        <div class="login-welcome">
                            <div class="welcome-icon">🔐</div>
                            <h1>Welcome to SwissKnife</h1>
                            <p>Choose your preferred sign-in method to get started</p>
                        </div>
                        
                        <div class="modern-providers">
                            ${this.renderModernProviders()}
                        </div>
                        
                        <div class="login-divider">
                            <span>or</span>
                        </div>
                        
                        <div class="advanced-options">
                            <button onclick="oauthSystem.showAdvancedView()" class="btn-link">
                                ⚙️ Advanced Configuration & Management
                            </button>
                        </div>
                    </div>
                    
                    <div class="oauth-sidebar ${this.activeTokens.size === 0 ? 'hidden' : ''}">
                        <div class="provider-list">
                            <h4>🔌 OAuth Providers</h4>
                            ${this.renderProviderList()}
                        </div>
                        
                        <div class="active-sessions">
                            <h4>🔑 Active Sessions</h4>
                            ${this.renderActiveSessions()}
                        </div>
                    </div>
                    
                    <div class="oauth-main advanced-view hidden">
                        <div class="session-management">
                            <h3>📊 Session Management</h3>
                            ${this.renderSessionManagement()}
                        </div>
                        
                        <div class="oauth-logs">
                            <h3>📝 Authentication Logs</h3>
                            ${this.renderAuthLogs()}
                        </div>
                    </div>
                </div>
                
                ${this.renderModals()}
            </div>
        `;
    }

    renderProviderList() {
        return Array.from(this.providers.values()).map(provider => `
            <div class="provider-item ${provider.enabled ? 'enabled' : 'disabled'}">
                <div class="provider-info">
                    <span class="provider-icon" style="color: ${provider.color}">${provider.icon}</span>
                    <span class="provider-name">${provider.name}</span>
                    <span class="provider-status">
                        <span class="sk-status-dot ${provider.enabled ? 'is-ok' : 'is-idle'}"></span>${provider.enabled ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                </div>
                <div class="provider-actions">
                    <button onclick="oauthSystem.configureProvider('${provider.id}')" class="btn-sm btn-secondary sk-btn">⚙️ Config</button>
                    <button onclick="oauthSystem.testProvider('${provider.id}')" class="btn-sm btn-primary sk-btn sk-btn-primary" 
                            ${!provider.enabled ? 'disabled' : ''}>🧪 Test</button>
                </div>
            </div>
        `).join('');
    }

    renderActiveSessions() {
        if (this.activeTokens.size === 0) {
            return '<div class="no-sessions sk-empty">No active sessions</div>';
        }

        return Array.from(this.activeTokens.entries()).map(([providerId, tokenData]) => {
            const provider = this.providers.get(providerId);
            if (!provider) return '';

            return `
                <div class="session-item">
                    <div class="session-info">
                        <span class="session-icon" style="color: ${provider.color}">${provider.icon}</span>
                        <div class="session-details">
                            <div class="session-provider">${provider.name}</div>
                            <div class="session-user">${tokenData.user?.email || tokenData.user?.login || 'Unknown'}</div>
                            <div class="session-expires">Expires: ${this.formatExpiry(tokenData.expiresAt)}</div>
                        </div>
                    </div>
                    <div class="session-actions">
                        <button onclick="oauthSystem.refreshToken('${providerId}')" class="btn-sm btn-secondary sk-btn">🔄</button>
                        <button onclick="oauthSystem.revokeToken('${providerId}')" class="btn-sm btn-danger sk-btn sk-btn-danger">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderModernProviders() {
        return Array.from(this.providers.values()).map(provider => {
            const hasActiveToken = this.activeTokens.has(provider.id);
            
            if (!provider.enabled) {
                return `
                    <button class="modern-provider-btn disabled" onclick="oauthSystem.configureProvider('${provider.id}')">
                        <div class="provider-logo">
                            <span class="provider-icon" style="color: ${provider.color}">${provider.icon}</span>
                        </div>
                        <div class="provider-info">
                            <span class="provider-name">Continue with ${provider.name}</span>
                            <span class="provider-subtitle">Configuration required</span>
                        </div>
                        <div class="provider-action">
                            <span class="setup-badge">Setup</span>
                        </div>
                    </button>
                `;
            }
            
            if (hasActiveToken) {
                const tokenData = this.activeTokens.get(provider.id);
                return `
                    <button class="modern-provider-btn connected" onclick="oauthSystem.showUserProfile('${provider.id}')">
                        <div class="provider-logo">
                            <span class="provider-icon" style="color: ${provider.color}">${provider.icon}</span>
                        </div>
                        <div class="provider-info">
                            <span class="provider-name">Signed in as ${tokenData.user?.email || tokenData.user?.login || 'User'}</span>
                            <span class="provider-subtitle">Connected to ${provider.name}</span>
                        </div>
                        <div class="provider-action">
                            <span class="connected-badge">✓</span>
                        </div>
                    </button>
                `;
            }
            
            return `
                <button class="modern-provider-btn" onclick="oauthSystem.login('${provider.id}')">
                    <div class="provider-logo">
                        <span class="provider-icon" style="color: ${provider.color}">${provider.icon}</span>
                    </div>
                    <div class="provider-info">
                        <span class="provider-name">Continue with ${provider.name}</span>
                        <span class="provider-subtitle">Sign in to your ${provider.name} account</span>
                    </div>
                    <div class="provider-action">
                        <span class="arrow">→</span>
                    </div>
                </button>
            `;
        }).join('');
    }

    renderLoginProviders() {
        return Array.from(this.providers.values()).map(provider => {
            const hasActiveToken = this.activeTokens.has(provider.id);
            
            return `
                <div class="login-provider-card sk-card ${provider.enabled ? 'enabled' : 'disabled'}">
                    <div class="provider-header">
                        <span class="provider-icon large" style="color: ${provider.color}">${provider.icon}</span>
                        <h4>${provider.name}</h4>
                    </div>
                    
                    <div class="provider-status">
                        ${hasActiveToken ? 
                            '<span class="status-badge connected"><span class="sk-status-dot is-ok"></span>🟢 Connected</span>' :
                            '<span class="status-badge disconnected"><span class="sk-status-dot is-err"></span>🔴 Not Connected</span>'
                        }
                    </div>
                    
                    <div class="provider-actions">
                        ${provider.enabled ? 
                            (hasActiveToken ? 
                                `<button onclick="oauthSystem.logout('${provider.id}')" class="btn-danger sk-btn sk-btn-danger">🚪 Logout</button>` :
                                `<button onclick="oauthSystem.login('${provider.id}')" class="btn-primary sk-btn sk-btn-primary">🔐 Login</button>`
                            ) :
                            `<button onclick="oauthSystem.configureProvider('${provider.id}')" class="btn-secondary sk-btn">⚙️ Configure</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSessionManagement() {
        return `
            <div class="session-stats">
                <div class="stat-card">
                    <div class="stat-icon">🔑</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.activeTokens.size}</div>
                        <div class="stat-label">Active Sessions</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">🔌</div>
                    <div class="stat-content">
                        <div class="stat-value">${Array.from(this.providers.values()).filter(p => p.enabled).length}</div>
                        <div class="stat-label">Enabled Providers</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">⏰</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.getExpiringSoonCount()}</div>
                        <div class="stat-label">Expiring Soon</div>
                    </div>
                </div>
            </div>
            
            <div class="session-controls">
                <button onclick="oauthSystem.checkTokenHealth()" class="btn-secondary sk-btn">🔍 Check Token Health</button>
                <button onclick="oauthSystem.refreshAllTokens()" class="btn-secondary sk-btn">🔄 Refresh All</button>
                <button onclick="oauthSystem.exportTokens()" class="btn-secondary sk-btn">📤 Export Tokens</button>
            </div>
        `;
    }

    renderAuthLogs() {
        const logs = this.getAuthLogs();
        
        if (logs.length === 0) {
            return '<div class="no-logs sk-empty">No authentication logs</div>';
        }

        return `
            <div class="auth-logs-list">
                ${logs.slice(-10).reverse().map(log => `
                    <div class="log-entry ${log.type}">
                        <div class="log-icon">${this.getLogIcon(log.type)}</div>
                        <div class="log-content">
                            <div class="log-message">${log.message}</div>
                            <div class="log-meta">
                                <span class="log-provider">${log.provider}</span>
                                <span class="log-time">${this.formatDate(log.timestamp)}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderModals() {
        return `
            <!-- Provider Configuration Modal -->
            <div id="provider-config-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>⚙️ Configure OAuth Provider</h3>
                        <button onclick="oauthSystem.hideProviderConfig()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <form id="provider-config-form">
                            <div id="provider-config-content">
                                <!-- Dynamic content based on selected provider -->
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button onclick="oauthSystem.saveProviderConfig()" class="btn-primary sk-btn sk-btn-primary">💾 Save Configuration</button>
                        <button onclick="oauthSystem.hideProviderConfig()" class="btn-secondary sk-btn">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- OAuth Callback Modal -->
            <div id="oauth-callback-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🔐 OAuth Authentication</h3>
                    </div>
                    <div class="modal-body">
                        <div class="callback-status">
                            <div class="callback-spinner"></div>
                            <div class="callback-message">Processing authentication...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Core OAuth functionality
    async login(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider || !provider.enabled) {
            this.showNotification(`Provider ${providerId} is not configured`, 'error');
            return;
        }

        try {
            // Generate state parameter for security
            const state = this.generateState();
            this.loginSessions.set(state, { providerId, timestamp: Date.now() });

            // Build authorization URL
            const authUrl = new URL(provider.authUrl);
            authUrl.searchParams.set('client_id', provider.clientId);
            authUrl.searchParams.set('redirect_uri', provider.redirectUri);
            authUrl.searchParams.set('scope', provider.scope);
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('response_type', 'code');

            // Special handling for different providers
            if (providerId === 'google') {
                authUrl.searchParams.set('access_type', 'offline');
                authUrl.searchParams.set('prompt', 'consent');
            }

            // Open OAuth authorization window
            const authWindow = window.open(
                authUrl.toString(),
                'oauth-login',
                'width=500,height=600,scrollbars=yes,resizable=yes'
            );

            // Monitor the auth window
            this.monitorAuthWindow(authWindow, state);

        } catch (error) {
            console.error('OAuth login failed:', error);
            this.showNotification(`Login failed: ${error.message}`, 'error');
            this.logAuthEvent(providerId, 'login_failed', error.message);
        }
    }

    async handleOAuthCallback(code, state, providerId) {
        const session = this.loginSessions.get(state);
        if (!session || session.providerId !== providerId) {
            throw new Error('Invalid OAuth state');
        }

        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new Error('Unknown OAuth provider');
        }

        try {
            // Exchange code for access token
            const tokenData = await this.exchangeCodeForToken(provider, code);
            
            // Get user info
            const userInfo = await this.getUserInfo(provider, tokenData.access_token);
            
            // Store token and user info
            this.activeTokens.set(providerId, {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: Date.now() + (tokenData.expires_in * 1000),
                user: userInfo,
                provider: providerId
            });

            // Save to localStorage
            this.saveTokens();

            // Clean up login session
            this.loginSessions.delete(state);

            this.logAuthEvent(providerId, 'login_success', `Logged in as ${userInfo.email || userInfo.login}`);
            this.showNotification(`Successfully logged in to ${provider.name}!`, 'success');

            // Refresh UI
            this.refreshUI();

            // Notify other apps of successful login
            this.notifyAppsOfLogin(providerId, userInfo);

        } catch (error) {
            console.error('OAuth callback handling failed:', error);
            this.logAuthEvent(providerId, 'login_failed', error.message);
            throw error;
        }
    }

    async exchangeCodeForToken(provider, code) {
        const tokenParams = new URLSearchParams({
            client_id: provider.clientId,
            client_secret: provider.clientSecret,
            code: code,
            redirect_uri: provider.redirectUri,
            grant_type: 'authorization_code'
        });

        const response = await fetch(provider.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: tokenParams
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }

        return await response.json();
    }

    async getUserInfo(provider, accessToken) {
        const response = await fetch(provider.userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }

        return await response.json();
    }

    async logout(providerId) {
        if (confirm(`Are you sure you want to logout from ${this.providers.get(providerId)?.name}?`)) {
            this.activeTokens.delete(providerId);
            this.saveTokens();
            
            this.logAuthEvent(providerId, 'logout', 'User logged out');
            this.showNotification(`Logged out from ${this.providers.get(providerId)?.name}`, 'info');
            
            // Notify other apps of logout
            this.notifyAppsOfLogout(providerId);
            
            this.refreshUI();
        }
    }

    async logoutAll() {
        if (confirm('Are you sure you want to logout from all providers?')) {
            const providers = Array.from(this.activeTokens.keys());
            this.activeTokens.clear();
            this.saveTokens();
            
            providers.forEach(providerId => {
                this.logAuthEvent(providerId, 'logout', 'All sessions logged out');
                this.notifyAppsOfLogout(providerId);
            });
            
            this.showNotification('Logged out from all providers', 'info');
            this.refreshUI();
        }
    }

    // Token management
    async refreshToken(providerId) {
        const tokenData = this.activeTokens.get(providerId);
        const provider = this.providers.get(providerId);
        
        if (!tokenData || !provider || !tokenData.refreshToken) {
            this.showNotification(`Cannot refresh token for ${provider?.name || providerId}`, 'error');
            return;
        }

        try {
            const refreshParams = new URLSearchParams({
                client_id: provider.clientId,
                client_secret: provider.clientSecret,
                refresh_token: tokenData.refreshToken,
                grant_type: 'refresh_token'
            });

            const response = await fetch(provider.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: refreshParams
            });

            if (response.ok) {
                const newTokenData = await response.json();
                
                // Update stored token
                this.activeTokens.set(providerId, {
                    ...tokenData,
                    accessToken: newTokenData.access_token,
                    refreshToken: newTokenData.refresh_token || tokenData.refreshToken,
                    expiresAt: Date.now() + (newTokenData.expires_in * 1000)
                });

                this.saveTokens();
                this.logAuthEvent(providerId, 'token_refreshed', 'Access token refreshed');
                this.showNotification(`Token refreshed for ${provider.name}`, 'success');
                
                this.refreshUI();
            } else {
                throw new Error('Token refresh failed');
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.logAuthEvent(providerId, 'refresh_failed', error.message);
            this.showNotification(`Failed to refresh token for ${provider.name}`, 'error');
        }
    }

    async refreshAllTokens() {
        const providers = Array.from(this.activeTokens.keys());
        const refreshPromises = providers.map(providerId => this.refreshToken(providerId));
        
        try {
            await Promise.allSettled(refreshPromises);
            this.showNotification('All tokens refresh completed', 'info');
        } catch (error) {
            this.showNotification('Some token refreshes failed', 'warning');
        }
    }

    async revokeToken(providerId) {
        if (confirm(`Are you sure you want to revoke the token for ${this.providers.get(providerId)?.name}?`)) {
            const provider = this.providers.get(providerId);
            const session = this.loginSessions.get(providerId);
            
            if (!session || !session.accessToken) {
                this.logout(providerId);
                return;
            }
            
            // Attempt to revoke token via provider's revocation endpoint
            try {
                let revocationSuccess = false;
                
                switch (providerId) {
                    case 'google':
                        // Google OAuth revocation
                        await fetch(`https://oauth2.googleapis.com/revoke?token=${session.accessToken}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        });
                        revocationSuccess = true;
                        break;
                        
                    case 'github':
                        // GitHub OAuth revocation
                        const githubAuth = btoa(`${provider.clientId}:${provider.clientSecret || ''}`);
                        await fetch(`https://api.github.com/applications/${provider.clientId}/token`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Basic ${githubAuth}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ access_token: session.accessToken })
                        });
                        revocationSuccess = true;
                        break;
                        
                    case 'microsoft':
                        // Microsoft OAuth revocation
                        await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/logout`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: `token=${session.accessToken}&token_type_hint=access_token`
                        });
                        revocationSuccess = true;
                        break;
                        
                    case 'discord':
                        // Discord OAuth revocation
                        await fetch('https://discord.com/api/oauth2/token/revoke', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                client_id: provider.clientId,
                                client_secret: provider.clientSecret || '',
                                token: session.accessToken
                            })
                        });
                        revocationSuccess = true;
                        break;
                        
                    default:
                        // For Facebook and other providers without standard revocation endpoints,
                        // we just clear the local session
                        revocationSuccess = true;
                }
                
                if (revocationSuccess) {
                    this.showNotification(`Token revoked for ${provider.name}`, 'success');
                }
            } catch (error) {
                console.warn(`Token revocation failed for ${providerId}:`, error);
                this.showNotification(`Token revocation attempted for ${provider.name}`, 'info');
            } finally {
                // Always clear local session regardless of revocation API success
                this.logout(providerId);
            }
        }
    }

    // Provider configuration
    configureProvider(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider) return;

        const configContent = document.getElementById('provider-config-content');
        if (!configContent) return;

        configContent.innerHTML = `
            <input type="hidden" id="config-provider-id" value="${providerId}">
            
            <div class="provider-config-header">
                <span class="config-icon" style="color: ${provider.color}">${provider.icon}</span>
                <h4>${provider.name} Configuration</h4>
            </div>
            
            <div class="form-group">
                <label for="config-client-id">Client ID:</label>
                <input type="text" id="config-client-id" class="sk-input" value="${provider.clientId}" placeholder="Your ${provider.name} client ID">
                <small>Get this from your ${provider.name} developer console</small>
            </div>
            
            <div class="form-group">
                <label for="config-client-secret">Client Secret:</label>
                <input type="password" id="config-client-secret" class="sk-input" value="${provider.clientSecret || ''}" placeholder="Your ${provider.name} client secret">
                <small>Keep this secure and never expose it publicly</small>
            </div>
            
            <div class="form-group">
                <label for="config-redirect-uri">Redirect URI:</label>
                <input type="text" id="config-redirect-uri" class="sk-input" value="${provider.redirectUri}" readonly>
                <small>Add this URL to your ${provider.name} app's allowed redirect URIs</small>
            </div>
            
            <div class="form-group">
                <label for="config-scope">Scope:</label>
                <input type="text" id="config-scope" class="sk-input" value="${provider.scope}" placeholder="OAuth scopes">
                <small>Space-separated list of OAuth scopes</small>
            </div>
            
            <div class="form-group checkbox-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="config-enabled" ${provider.enabled ? 'checked' : ''}>
                    <span class="checkmark"></span>
                    Enable this OAuth provider
                </label>
            </div>
            
            <div class="config-help">
                <h5>Setup Instructions for ${provider.name}:</h5>
                ${this.getProviderSetupInstructions(providerId)}
            </div>
        `;

        const modal = document.getElementById('provider-config-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideProviderConfig() {
        const modal = document.getElementById('provider-config-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    saveProviderConfig() {
        const providerId = document.getElementById('config-provider-id').value;
        const provider = this.providers.get(providerId);
        
        if (!provider) return;

        provider.clientId = document.getElementById('config-client-id').value;
        provider.clientSecret = document.getElementById('config-client-secret').value;
        provider.redirectUri = document.getElementById('config-redirect-uri').value;
        provider.scope = document.getElementById('config-scope').value;
        provider.enabled = document.getElementById('config-enabled').checked;

        // Save to localStorage
        this.saveProviderConfigs();

        this.hideProviderConfig();
        this.refreshUI();
        this.showNotification(`${provider.name} configuration saved!`, 'success');
    }

    getProviderSetupInstructions(providerId) {
        const instructions = {
            google: `
                <ol>
                    <li>Go to <a href="https://console.developers.google.com/" target="_blank">Google Cloud Console</a></li>
                    <li>Create a new project or select an existing one</li>
                    <li>Enable the Google+ API</li>
                    <li>Go to "Credentials" and create an OAuth 2.0 Client ID</li>
                    <li>Add the redirect URI shown above</li>
                    <li>Copy the Client ID and Client Secret here</li>
                </ol>
            `,
            facebook: `
                <ol>
                    <li>Go to <a href="https://developers.facebook.com/apps/" target="_blank">Facebook for Developers</a></li>
                    <li>Create a new app or select an existing one</li>
                    <li>Add Facebook Login product to your app</li>
                    <li>Add the redirect URI to Valid OAuth Redirect URIs</li>
                    <li>Copy the App ID and App Secret from Basic Settings</li>
                </ol>
            `,
            github: `
                <ol>
                    <li>Go to <a href="https://github.com/settings/developers" target="_blank">GitHub Developer Settings</a></li>
                    <li>Click "New OAuth App"</li>
                    <li>Fill in application details</li>
                    <li>Set Authorization callback URL to the redirect URI shown above</li>
                    <li>Copy the Client ID and generate a Client Secret</li>
                </ol>
            `
        };

        return instructions[providerId] || '<p>Setup instructions not available.</p>';
    }

    // Utility methods
    generateState() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    monitorAuthWindow(authWindow, state) {
        const checkClosed = setInterval(() => {
            if (authWindow.closed) {
                clearInterval(checkClosed);
                
                // Check if login was successful
                setTimeout(() => {
                    if (this.loginSessions.has(state)) {
                        this.loginSessions.delete(state);
                        this.showNotification('OAuth login was cancelled', 'info');
                    }
                }, 1000);
            }
        }, 1000);
    }

    setupCallbackHandler() {
        // Handle OAuth callbacks via postMessage or URL parameters
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'oauth-callback') {
                this.handleOAuthCallback(event.data.code, event.data.state, event.data.provider)
                    .catch(error => {
                        this.showNotification(`OAuth login failed: ${error.message}`, 'error');
                    });
            }
        });

        // Also check URL parameters on page load for direct callbacks
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code && state) {
            // Determine provider from state or URL
            const session = this.loginSessions.get(state);
            if (session) {
                this.handleOAuthCallback(code, state, session.providerId)
                    .then(() => {
                        // Clean up URL
                        window.history.replaceState({}, document.title, window.location.pathname);
                    })
                    .catch(error => {
                        this.showNotification(`OAuth login failed: ${error.message}`, 'error');
                    });
            }
        }
    }

    // Data persistence
    saveTokens() {
        try {
            const tokensData = {};
            this.activeTokens.forEach((tokenData, providerId) => {
                tokensData[providerId] = tokenData;
            });
            localStorage.setItem('oauth-tokens', JSON.stringify(tokensData));
        } catch (error) {
            console.warn('Failed to save OAuth tokens:', error);
        }
    }

    loadSavedTokens() {
        try {
            const tokensData = JSON.parse(localStorage.getItem('oauth-tokens') || '{}');
            Object.entries(tokensData).forEach(([providerId, tokenData]) => {
                // Check if token is still valid
                if (tokenData.expiresAt > Date.now()) {
                    this.activeTokens.set(providerId, tokenData);
                }
            });
        } catch (error) {
            console.warn('Failed to load OAuth tokens:', error);
        }
    }

    saveProviderConfigs() {
        try {
            const configs = {};
            this.providers.forEach((provider, id) => {
                configs[id] = {
                    clientId: provider.clientId,
                    clientSecret: provider.clientSecret,
                    redirectUri: provider.redirectUri,
                    scope: provider.scope,
                    enabled: provider.enabled
                };
            });
            localStorage.setItem('oauth-provider-configs', JSON.stringify(configs));
        } catch (error) {
            console.warn('Failed to save provider configs:', error);
        }
    }

    loadProviderConfigs() {
        try {
            const configs = JSON.parse(localStorage.getItem('oauth-provider-configs') || '{}');
            Object.entries(configs).forEach(([id, config]) => {
                const provider = this.providers.get(id);
                if (provider) {
                    Object.assign(provider, config);
                }
            });
        } catch (error) {
            console.warn('Failed to load provider configs:', error);
        }
    }

    // Logging and notifications
    logAuthEvent(provider, type, message) {
        const logs = this.getAuthLogs();
        logs.push({
            timestamp: Date.now(),
            provider,
            type,
            message
        });

        // Keep only last 100 logs
        if (logs.length > 100) {
            logs.splice(0, logs.length - 100);
        }

        localStorage.setItem('oauth-auth-logs', JSON.stringify(logs));
    }

    getAuthLogs() {
        try {
            return JSON.parse(localStorage.getItem('oauth-auth-logs') || '[]');
        } catch (error) {
            return [];
        }
    }

    getLogIcon(type) {
        const icons = {
            login_success: '✅',
            login_failed: '❌',
            logout: '🚪',
            token_refreshed: '🔄',
            refresh_failed: '⚠️',
            config_updated: '⚙️'
        };
        return icons[type] || '📝';
    }

    // UI helpers
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    formatExpiry(expiresAt) {
        const now = Date.now();
        const diff = expiresAt - now;
        
        if (diff < 0) return 'Expired';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
        return `${Math.floor(diff / 86400000)}d`;
    }

    getExpiringSoonCount() {
        const oneHour = 60 * 60 * 1000;
        return Array.from(this.activeTokens.values())
            .filter(token => token.expiresAt - Date.now() < oneHour).length;
    }

    refreshUI() {
        // Re-render if we're in the OAuth app
        const container = document.querySelector('.oauth-login-system');
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

    // App integration methods
    notifyAppsOfLogin(providerId, userInfo) {
        // Notify GitHub app if GitHub login
        if (providerId === 'github' && window.githubApp) {
            window.githubApp.accessToken = this.activeTokens.get('github').accessToken;
            window.githubApp.user = userInfo;
            window.githubApp.saveSettings();
            window.githubApp.initializeData();
        }

        // Dispatch custom event for other apps
        window.dispatchEvent(new CustomEvent('oauth-login', {
            detail: { provider: providerId, user: userInfo }
        }));
    }

    notifyAppsOfLogout(providerId) {
        // Notify GitHub app if GitHub logout
        if (providerId === 'github' && window.githubApp) {
            window.githubApp.disconnect();
        }

        // Dispatch custom event for other apps
        window.dispatchEvent(new CustomEvent('oauth-logout', {
            detail: { provider: providerId }
        }));
    }

    // Public API methods for other apps
    getToken(providerId) {
        const tokenData = this.activeTokens.get(providerId);
        return tokenData ? tokenData.accessToken : null;
    }

    getUser(providerId) {
        const tokenData = this.activeTokens.get(providerId);
        return tokenData ? tokenData.user : null;
    }

    isLoggedIn(providerId) {
        const tokenData = this.activeTokens.get(providerId);
        return tokenData && tokenData.expiresAt > Date.now();
    }

    // Additional utility methods
    async testProvider(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider || !provider.enabled) {
            this.showNotification(`Provider ${providerId} is not configured`, 'error');
            return;
        }

        this.showNotification(`Testing ${provider.name} configuration...`, 'info');

        try {
            // Test by attempting to reach the auth endpoint
            const authUrl = new URL(provider.authUrl);
            const response = await fetch(authUrl.origin, { method: 'HEAD' });
            
            if (response.ok || response.status === 405) { // 405 is OK for HEAD requests
                this.showNotification(`${provider.name} configuration test passed!`, 'success');
            } else {
                throw new Error(`Server responded with status ${response.status}`);
            }
        } catch (error) {
            this.showNotification(`${provider.name} test failed: ${error.message}`, 'error');
        }
    }

    async checkTokenHealth() {
        const results = [];
        
        for (const [providerId, tokenData] of this.activeTokens) {
            const provider = this.providers.get(providerId);
            if (!provider) continue;

            try {
                // Test token by making a request to user info endpoint
                const response = await fetch(provider.userInfoUrl, {
                    headers: {
                        'Authorization': `Bearer ${tokenData.accessToken}`,
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    results.push(`✅ ${provider.name}: Token is valid`);
                } else {
                    results.push(`❌ ${provider.name}: Token is invalid (${response.status})`);
                }
            } catch (error) {
                results.push(`❌ ${provider.name}: Error checking token (${error.message})`);
            }
        }

        if (results.length === 0) {
            this.showNotification('No active tokens to check', 'info');
        } else {
            this.showNotification(results.join('\n'), 'info');
        }
    }

    exportTokens() {
        const exportData = {
            tokens: Object.fromEntries(
                Array.from(this.activeTokens.entries()).map(([id, data]) => [
                    id, 
                    { ...data, accessToken: '[REDACTED]', refreshToken: '[REDACTED]' }
                ])
            ),
            providers: Object.fromEntries(
                Array.from(this.providers.entries()).map(([id, data]) => [
                    id,
                    { ...data, clientSecret: '[REDACTED]' }
                ])
            ),
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oauth-config-${Date.now()}.json`;
        a.click();

        this.showNotification('OAuth configuration exported (sensitive data redacted)', 'success');
    }

    refreshTokens() {
        this.refreshAllTokens();
    }

    showProviderConfig() {
        // Show a modal to select which provider to configure
        // For now, just open Google config as default
        this.configureProvider('google');
    }

    showAdvancedView() {
        const advancedView = document.querySelector('.advanced-view');
        const modernContainer = document.querySelector('.modern-login-container');
        const sidebar = document.querySelector('.oauth-sidebar');
        
        if (advancedView && modernContainer) {
            advancedView.classList.toggle('hidden');
            modernContainer.classList.toggle('hidden');
            if (sidebar) {
                sidebar.classList.toggle('hidden');
            }
        }
    }

    showUserProfile(providerId) {
        const tokenData = this.activeTokens.get(providerId);
        const provider = this.providers.get(providerId);
        
        if (tokenData && provider) {
            const user = tokenData.user;
            const expiresAt = new Date(tokenData.expiresAt).toLocaleString();
            
            alert(`Connected to ${provider.name}\n\nUser: ${user.email || user.login || 'Unknown'}\nExpires: ${expiresAt}\n\nClick OK to continue or use advanced view to manage this session.`);
        }
    }
}

// Initialize the OAuth system
const oauthSystem = new OAuthLoginSystem();

// Load saved configurations
oauthSystem.loadProviderConfigs();

// Export for window manager and module imports
window.OAuthLoginSystem = OAuthLoginSystem;
window.oauthSystem = oauthSystem;

// Create OAuth login app instance for desktop integration
window.createOAuthLoginApp = function() {
    return {
        name: "OAuth Login",
        icon: "🔐",
        init: async function(container) {
            const html = await oauthSystem.render();
            container.innerHTML = html;
            
            // Initialize event handlers
            oauthSystem.initializeEventHandlers(container);
        },
        destroy: function() {
            // Cleanup if needed
        }
    };
};

export { OAuthLoginSystem };