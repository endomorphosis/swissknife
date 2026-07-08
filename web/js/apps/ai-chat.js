/**
 * Enhanced AI Chat App for SwissKnife Web Desktop
 * Advanced conversational AI with multi-model support, context awareness, and smart features
 */

export class AIChatApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentConversation = null;
    this.conversations = [];
    this.selectedModel = 'gpt-4';
    this.selectedProvider = 'openai';
    this.contextMode = 'desktop'; // 'desktop', 'code', 'files', 'system'
    this.voiceEnabled = false;
    this.recognition = null;
    this.synthesis = null;
    this.messageCount = 0;
    this.tokenUsage = { input: 0, output: 0 };
    this.conversationMetrics = new Map();
    
    // Enhanced AI providers and models
    this.aiProviders = {
      openai: {
        name: 'OpenAI',
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        icon: '🤖',
        features: ['chat', 'vision', 'function-calling']
      },
      anthropic: {
        name: 'Anthropic',
        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
        icon: '🧠',
        features: ['chat', 'analysis', 'reasoning']
      },
      google: {
        name: 'Google',
        models: ['gemini-pro', 'gemini-pro-vision'],
        icon: '🌟',
        features: ['chat', 'vision', 'multimodal']
      },
      local: {
        name: 'Local Models',
        models: ['llama-2-7b', 'mistral-7b', 'phi-2'],
        icon: '🏠',
        features: ['chat', 'privacy', 'offline']
      }
    };

    // Context sources
    this.contextSources = {
      desktop: { icon: '🖥️', name: 'Desktop State', enabled: true },
      files: { icon: '📁', name: 'File Contents', enabled: false },
      code: { icon: '💻', name: 'Code Context', enabled: false },
      system: { icon: '⚙️', name: 'System Info', enabled: false },
      p2p: { icon: '🌐', name: 'P2P Network', enabled: false },
      ipfs: { icon: '📦', name: 'IPFS Content', enabled: false }
    };

    // Smart features
    this.smartFeatures = {
      autoComplete: true,
      contextualSuggestions: true,
      grammarCorrection: true,
      translationMode: false,
      codeGeneration: true,
      voiceInteraction: false
    };
    
    this.initializeEnhancedFeatures();
  }

  initializeEnhancedFeatures() {
    // Setup voice recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      
      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.handleVoiceInput(transcript);
      };
    }

    // Setup speech synthesis
    if ('speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    }

    // Initialize conversation metrics
    this.conversationMetrics.set('currentSession', {
      startTime: Date.now(),
      messageCount: 0,
      tokenUsage: { input: 0, output: 0 },
      averageResponseTime: 0
    });

    // Setup desktop integration
    this.setupDesktopIntegration();
  }

  setupDesktopIntegration() {
    // Listen for desktop events
    if (this.desktop && this.desktop.eventBus) {
      this.desktop.eventBus.on('app:opened', (data) => {
        if (this.contextSources.desktop.enabled) {
          this.updateDesktopContext();
        }
      });

      this.desktop.eventBus.on('file:selected', (data) => {
        if (this.contextSources.files.enabled) {
          this.addFileContext(data);
        }
      });
    }
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadConversations();
  }

  async render() {
    // Generate a unique ID for this instance
    this.instanceId = 'ai-chat-' + Date.now();
    
    const content = `
      <div class="ai-chat-container" id="${this.instanceId}">
        <!-- Enhanced Sidebar with Provider/Model Selection -->
        <div class="chat-sidebar">
          <div class="chat-header">
            <h3>🤖 AI Assistant</h3>
            <button class="new-chat-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.createNewConversation()" title="New Conversation">+</button>
          </div>
          
          <!-- Provider Selection -->
          <div class="provider-section">
            <label>AI Provider:</label>
            <div class="provider-grid">
              ${Object.entries(this.aiProviders).map(([key, provider]) => `
                <div class="provider-card ${key === this.selectedProvider ? 'active' : ''}" 
                     onclick="window.aiChatInstances?.['${this.instanceId}']?.selectProvider('${key}')" 
                     data-provider="${key}" title="${provider.name}">
                  <span class="provider-icon">${provider.icon}</span>
                  <span class="provider-name">${provider.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Model Selection -->
          <div class="model-section">
            <label for="${this.instanceId}-model-select">Model:</label>
            <select id="${this.instanceId}-model-select" class="enhanced-select" 
                    onchange="window.aiChatInstances?.['${this.instanceId}']?.updateSelectedModel(this.value)">
              ${this.aiProviders[this.selectedProvider].models.map(model => 
                `<option value="${model}" ${model === this.selectedModel ? 'selected' : ''}>${model}</option>`
              ).join('')}
            </select>
          </div>

          <!-- Context Sources -->
          <div class="context-section">
            <label>Context Sources:</label>
            <div class="context-sources">
              ${Object.entries(this.contextSources).map(([key, source]) => `
                <div class="context-source ${source.enabled ? 'enabled' : ''}" data-context="${key}">
                  <span class="context-icon">${source.icon}</span>
                  <span class="context-name">${source.name}</span>
                  <input type="checkbox" ${source.enabled ? 'checked' : ''} class="context-toggle"
                         onchange="window.aiChatInstances?.['${this.instanceId}']?.toggleContextSource('${key}', this.checked)">
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Conversation List -->
          <div class="conversation-list">
            <div class="conversation-item active" data-id="current">
              <div class="conversation-title">Current Session</div>
              <div class="conversation-meta">Just now</div>
            </div>
          </div>

          <!-- Usage Statistics -->
          <div class="usage-stats">
            <div class="stat-item">
              <span class="stat-label">Messages:</span>
              <span class="stat-value" id="${this.instanceId}-message-count">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Tokens:</span>
              <span class="stat-value" id="${this.instanceId}-token-count">0</span>
            </div>
          </div>
        </div>

        <!-- Enhanced Main Chat Area -->
        <div class="chat-main">
          <!-- Advanced Toolbar -->
          <div class="chat-toolbar">
            <div class="toolbar-left">
              <button class="toolbar-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.toggleVoiceInput()" title="Voice Input">
                <span class="btn-icon">🎤</span>
                <span class="btn-text">Voice</span>
              </button>
              <button class="toolbar-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.showContextMenu()" title="Smart Context">
                <span class="btn-icon">🧠</span>
                <span class="btn-text">Context</span>
              </button>
              <button class="toolbar-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.toggleTranslationMode()" title="Translation Mode">
                <span class="btn-icon">🌐</span>
                <span class="btn-text">Translate</span>
              </button>
            </div>
            <div class="toolbar-center">
              <div class="connection-status">
                <span class="status-dot connected"></span>
                <span class="status-text">Connected</span>
              </div>
            </div>
            <div class="toolbar-right">
              <button class="toolbar-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.exportConversation()" title="Export Conversation">
                <span class="btn-icon">📤</span>
              </button>
              <button class="toolbar-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.showSettings()" title="Chat Settings">
                <span class="btn-icon">⚙️</span>
              </button>
            </div>
          </div>

          <!-- Messages Area -->
          <div class="chat-messages" id="${this.instanceId}-messages">
            <div class="welcome-message">
              <div class="welcome-icon">🤖</div>
              <h3>Enhanced AI Assistant</h3>
              <p>I'm your intelligent assistant with access to your desktop context, files, and system information.</p>
              <div class="welcome-features">
                <div class="feature-chip">🎤 Voice Input</div>
                <div class="feature-chip">🧠 Smart Context</div>
                <div class="feature-chip">💻 Code Generation</div>
                <div class="feature-chip">🌐 Multi-language</div>
              </div>
              <div class="quick-actions">
                <button class="quick-action-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendQuickAction('Analyze my desktop state')">🖥️ Desktop Analysis</button>
                <button class="quick-action-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendQuickAction('Help me write code')">💻 Code Assistant</button>
                <button class="quick-action-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendQuickAction('Explain system performance')">📊 System Health</button>
              </div>
            </div>
          </div>

          <!-- Enhanced Input Area -->
          <div class="chat-input-area">
            <div class="input-enhancements">
              <div class="suggestion-chips" style="display: none;">
                <!-- Dynamic suggestions will appear here -->
              </div>
              <div class="context-preview" style="display: none;">
                <!-- Context information preview -->
              </div>
            </div>
            
            <div class="input-container">
              <div class="input-attachments" style="display: none;">
                <!-- File attachments, context items -->
              </div>
              
              <div class="input-row">
                <button class="input-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.attachFile()" title="Attach File">📎</button>
                <button class="input-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.toggleCodeMode()" title="Code Mode">💻</button>
                <textarea id="${this.instanceId}-input" 
                          class="enhanced-input" 
                          placeholder="Ask me anything... (Shift+Enter for new line)"
                          rows="1"
                          oninput="window.aiChatInstances?.['${this.instanceId}']?.handleInputChange(this.value)"
                          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.aiChatInstances?.['${this.instanceId}']?.sendMessage();}"></textarea>
                <button class="input-btn voice-input" onclick="window.aiChatInstances?.['${this.instanceId}']?.startVoiceInput()" title="Voice Input">🎤</button>
                <button class="send-btn" id="${this.instanceId}-send-btn" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendMessage()" title="Send Message">
                  <span class="send-icon">➤</span>
                </button>
              </div>
              
              <div class="input-footer">
                <div class="input-stats">
                  <span id="${this.instanceId}-char-count">0</span> characters
                  <span class="separator">•</span>
                  <span id="${this.instanceId}-estimated-tokens">~0 tokens</span>
                </div>
                <div class="input-shortcuts">
                  <span class="shortcut">Ctrl+K: Commands</span>
                  <span class="separator">•</span>
                  <span class="shortcut">Ctrl+/: Help</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Enhanced CSS Styles -->
      <style>
        .ai-chat-container {
          display: flex;
          height: 100%;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          color: #e8eaed;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
        }

        .chat-sidebar {
          width: 300px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .chat-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .new-chat-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: rgba(74, 144, 226, 0.3);
          color: white;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s ease;
        }

        .new-chat-btn:hover {
          background: rgba(74, 144, 226, 0.5);
          transform: scale(1.05);
        }

        .provider-section, .model-section, .context-section {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .provider-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
        }

        .provider-card {
          padding: 8px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          font-size: 12px;
        }

        .provider-card:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
        }

        .provider-card.active {
          background: rgba(74, 144, 226, 0.3);
          border-color: rgba(74, 144, 226, 0.6);
        }

        .provider-icon {
          display: block;
          font-size: 16px;
          margin-bottom: 4px;
        }

        .enhanced-select {
          width: 100%;
          padding: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          margin-top: 8px;
        }

        .context-sources {
          margin-top: 8px;
        }

        .context-source {
          display: flex;
          align-items: center;
          padding: 6px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .context-source:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .context-source.enabled {
          background: rgba(34, 139, 34, 0.2);
        }

        .context-icon {
          margin-right: 8px;
        }

        .context-name {
          flex: 1;
        }

        .context-toggle {
          margin-left: auto;
        }

        .conversation-list {
          flex: 1;
          padding: 8px;
        }

        .conversation-item {
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .conversation-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .conversation-item.active {
          background: rgba(74, 144, 226, 0.2);
          border: 1px solid rgba(74, 144, 226, 0.3);
        }

        .conversation-title {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .conversation-meta {
          font-size: 11px;
          opacity: 0.7;
        }

        .usage-stats {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .chat-toolbar {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .toolbar-btn {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          margin-right: 8px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s ease;
        }

        .toolbar-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .chat-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          scroll-behavior: smooth;
        }

        .welcome-message {
          text-align: center;
          padding: 32px;
          max-width: 600px;
          margin: 0 auto;
        }

        .welcome-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .welcome-features {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin: 16px 0;
          flex-wrap: wrap;
        }

        .feature-chip {
          padding: 4px 8px;
          background: rgba(74, 144, 226, 0.2);
          border-radius: 12px;
          font-size: 11px;
          border: 1px solid rgba(74, 144, 226, 0.3);
        }

        .quick-actions {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-top: 20px;
          flex-wrap: wrap;
        }

        .quick-action-btn {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }

        .quick-action-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .chat-input-area {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
        }

        .input-container {
          padding: 16px;
        }

        .input-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }

        .input-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .input-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }

        .enhanced-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 12px 16px;
          color: white;
          resize: none;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.4;
          min-height: 36px;
          max-height: 120px;
        }

        .enhanced-input:focus {
          outline: none;
          border-color: rgba(74, 144, 226, 0.6);
          box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
        }

        .enhanced-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #4ade80, #22c55e);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .send-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
        }

        .send-btn:disabled {
          background: rgba(255, 255, 255, 0.1);
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .input-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 16px 12px;
          font-size: 11px;
          opacity: 0.7;
        }

        .separator {
          margin: 0 8px;
        }

        /* Message styles */
        .message {
          margin-bottom: 16px;
          display: flex;
          gap: 12px;
        }

        .message.user {
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .message.user .message-avatar {
          background: linear-gradient(135deg, #60a5fa, #3b82f6);
        }

        .message.assistant .message-avatar {
          background: linear-gradient(135deg, #34d399, #10b981);
        }

        .message-content {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          padding: 12px 16px;
          border-radius: 16px;
          max-width: 80%;
        }

        .message.user .message-content {
          background: rgba(74, 144, 226, 0.2);
          border: 1px solid rgba(74, 144, 226, 0.3);
        }

        .message-text {
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .message-meta {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 8px;
          display: flex;
          justify-content: space-between;
        }

        /* Typing indicator */
        .typing-dots {
          display: flex;
          gap: 4px;
          padding: 8px 0;
        }

        .typing-dots span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes typing {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }

        .recording {
          animation: pulse 1s infinite;
          background: rgba(239, 68, 68, 0.3) !important;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .chat-sidebar {
            width: 100%;
            height: 30%;
          }
          
          .ai-chat-container {
            flex-direction: column;
          }
        }
      </style>
    `;

    // Register this instance globally for inline event handlers AFTER render completes
    // This needs to be delayed to avoid issues during HTML parsing
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        if (!window.aiChatInstances) {
          window.aiChatInstances = {};
        }
        window.aiChatInstances[this.instanceId] = this;
      }
    }, 0);

    return content;
  }

  getContainer() {
    return document.getElementById(this.instanceId);
  }

  updateSelectedModel(model) {
    this.selectedModel = model;
    this.updateModelCapabilities();
  }

  selectProvider(providerId) {
    this.selectedProvider = providerId;
    
    // Update UI
    const container = this.getContainer();
    if (container) {
      container.querySelectorAll('.provider-card').forEach(card => {
        card.classList.toggle('active', card.dataset.provider === providerId);
      });

      // Update model options
      const modelSelect = container.querySelector(`#${this.instanceId}-model-select`);
      const provider = this.aiProviders[providerId];
      modelSelect.innerHTML = provider.models.map(model => 
        `<option value="${model}">${model}</option>`
      ).join('');
      
      this.selectedModel = provider.models[0];
      this.updateModelCapabilities();
    }
  }

  updateModelCapabilities() {
    const provider = this.aiProviders[this.selectedProvider];
    const container = this.getContainer();
    
    if (container) {
      // Update connection status
      const statusText = container.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = `Connected to ${provider.name}`;
      }
    }
  }

  toggleContextSource(contextId, enabled) {
    this.contextSources[contextId].enabled = enabled;
    
    const container = this.getContainer();
    if (container) {
      const sourceElement = container.querySelector(`[data-context="${contextId}"]`);
      if (sourceElement) {
        sourceElement.classList.toggle('enabled', enabled);
      }
    }
    
    // Update context preview if needed
    if (enabled) {
      this.gatherContextData(contextId);
    }
  }

  handleInputChange(value) {
    const container = this.getContainer();
    if (!container) return;
    
    const charCount = container.querySelector(`#${this.instanceId}-char-count`);
    const tokenCount = container.querySelector(`#${this.instanceId}-estimated-tokens`);
    
    if (charCount) charCount.textContent = value.length;
    if (tokenCount) tokenCount.textContent = `~${Math.ceil(value.length / 4)} tokens`;

    // Auto-resize textarea
    const textarea = container.querySelector(`#${this.instanceId}-input`);
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    // Enable/disable send button
    const sendBtn = container.querySelector(`#${this.instanceId}-send-btn`);
    if (sendBtn) {
      sendBtn.disabled = !value.trim();
    }
  }

  async sendMessage() {
    const container = this.getContainer();
    if (!container) return;
    
    const input = container.querySelector(`#${this.instanceId}-input`);
    const message = input.value.trim();
    
    if (!message) return;

    // Clear input
    input.value = '';
    this.handleInputChange('');

    // Add user message to chat
    this.addMessage('user', message);

    // Gather context if enabled
    const context = await this.gatherEnabledContext();

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Send to AI using real API
      const response = await this.sendToAI(message, context);
      this.hideTypingIndicator();
      this.addMessage('assistant', response);

      // Update statistics
      this.updateUsageStats();
    } catch (error) {
      this.hideTypingIndicator();
      this.addMessage('error', 'Sorry, I encountered an error: ' + error.message);
    }
  }

  addMessage(type, content, timestamp = Date.now()) {
    const container = this.getContainer();
    if (!container) return;
    
    const messagesContainer = container.querySelector(`#${this.instanceId}-messages`);
    if (!messagesContainer) return;

    // Remove welcome message
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    const avatar = type === 'user' ? '👤' : (type === 'error' ? '⚠️' : '🤖');
    const timeStr = new Date(timestamp).toLocaleTimeString();

    messageElement.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-text">${this.formatMessage(content)}</div>
        <div class="message-meta">
          <span>${timeStr}</span>
          ${type === 'assistant' ? '<span>✓ Delivered</span>' : ''}
        </div>
      </div>
    `;

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    this.messageCount++;
  }

  showTypingIndicator() {
    const container = this.getContainer();
    if (!container) return;
    
    const messagesContainer = container.querySelector(`#${this.instanceId}-messages`);
    if (!messagesContainer) return;
    
    const typingElement = document.createElement('div');
    typingElement.className = 'message assistant typing';
    typingElement.id = `${this.instanceId}-typing-indicator`;
    typingElement.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    messagesContainer.appendChild(typingElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  hideTypingIndicator() {
    const typingIndicator = document.querySelector(`#${this.instanceId}-typing-indicator`);
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  updateUsageStats() {
    const container = this.getContainer();
    if (!container) return;
    
    const messageCountElement = container.querySelector(`#${this.instanceId}-message-count`);
    const tokenCountElement = container.querySelector(`#${this.instanceId}-token-count`);

    if (messageCountElement) messageCountElement.textContent = this.messageCount;
    // Token usage updated from API responses in sendToAI()
    if (tokenCountElement) tokenCountElement.textContent = this.tokenUsage.input + this.tokenUsage.output;
  }

  sendQuickAction(prompt) {
    const container = this.getContainer();
    if (!container) return;
    
    const input = container.querySelector(`#${this.instanceId}-input`);
    if (input) {
      input.value = prompt;
      this.handleInputChange(prompt);
      this.sendMessage();
    }
  }

  // Placeholder methods for additional functionality
  toggleVoiceInput() {
    console.log('Voice input toggled');
  }

  showContextMenu() {
    console.log('Context menu shown');
  }

  toggleTranslationMode() {
    console.log('Translation mode toggled');
  }

  exportConversation() {
    console.log('Conversation exported');
  }

  showSettings() {
    console.log('Settings shown');
  }

  attachFile() {
    console.log('File attachment');
  }

  toggleCodeMode() {
    console.log('Code mode toggled');
  }

  startVoiceInput() {
    console.log('Voice input started');
  }

  async gatherEnabledContext() {
    const enabledSources = Object.entries(this.contextSources)
      .filter(([_, source]) => source.enabled)
      .map(([key, _]) => key);

    const contextData = {};
    for (const source of enabledSources) {
      contextData[source] = await this.gatherContextData(source);
    }

    return contextData;
  }

  selectProvider(providerId) {
    this.selectedProvider = providerId;
    
    // Update UI
    const container = this.getContainer();
    container.querySelectorAll('.provider-card').forEach(card => {
      card.classList.toggle('active', card.dataset.provider === providerId);
    });

    // Update model options
    const modelSelect = container.querySelector('#model-select');
    const provider = this.aiProviders[providerId];
    modelSelect.innerHTML = provider.models.map(model => 
      `<option value="${model}">${model}</option>`
    ).join('');
    
    this.selectedModel = provider.models[0];
    this.updateModelCapabilities();
  }

  updateModelCapabilities() {
    const provider = this.aiProviders[this.selectedProvider];
    const container = this.getContainer();
    
    // Update connection status
    const statusText = container.querySelector('.status-text');
    statusText.textContent = `Connected to ${provider.name}`;
  }

  toggleContextSource(contextId, enabled) {
    this.contextSources[contextId].enabled = enabled;
    
    // Update context preview if needed
    if (enabled) {
      this.gatherContextData(contextId);
    }
  }

  async gatherContextData(contextId) {
    switch (contextId) {
      case 'desktop':
        return this.getDesktopContext();
      case 'files':
        return this.getFileContext();
      case 'system':
        return this.getSystemContext();
      case 'p2p':
        return this.getP2PContext();
      default:
        return null;
    }
  }

  getDesktopContext() {
    const openApps = this.desktop.getOpenApps ? this.desktop.getOpenApps() : [];
    return {
      type: 'desktop',
      openApps: openApps.map(app => app.title),
      activeApp: this.desktop.getActiveApp ? this.desktop.getActiveApp() : null,
      timestamp: Date.now()
    };
  }

  handleInputChange(value) {
    const container = this.getContainer();
    const charCount = container.querySelector('#char-count');
    const tokenCount = container.querySelector('#estimated-tokens');
    
    charCount.textContent = value.length;
    tokenCount.textContent = `~${Math.ceil(value.length / 4)} tokens`;

    // Auto-resize textarea
    const textarea = container.querySelector('#chat-input');
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';

    // Enable/disable send button
    const sendBtn = container.querySelector('#send-btn');
    sendBtn.disabled = !value.trim();
  }

  async sendMessage() {
    const container = this.getContainer();
    const input = container.querySelector('#chat-input');
    const message = input.value.trim();
    
    if (!message) return;

    // Clear input
    input.value = '';
    this.handleInputChange('');

    // Add user message to chat
    this.addMessage('user', message);

    // Gather context if enabled
    const context = await this.gatherEnabledContext();

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Send to AI using real API
      const response = await this.sendToAI(message, context);
      this.hideTypingIndicator();
      this.addMessage('assistant', response);

      // Update statistics
      this.updateUsageStats();
    } catch (error) {
      this.hideTypingIndicator();
      this.addMessage('error', 'Sorry, I encountered an error: ' + error.message);
    }
  }

  async gatherEnabledContext() {
    const enabledSources = Object.entries(this.contextSources)
      .filter(([_, source]) => source.enabled)
      .map(([key, _]) => key);

    const contextData = {};
    for (const source of enabledSources) {
      contextData[source] = await this.gatherContextData(source);
    }

    return contextData;
  }

  addMessage(type, content, timestamp = Date.now()) {
    const container = this.getContainer();
    const messagesContainer = container.querySelector('#chat-messages');

    // Remove welcome message
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    const avatar = type === 'user' ? '👤' : (type === 'error' ? '⚠️' : '🤖');
    const timeStr = new Date(timestamp).toLocaleTimeString();

    messageElement.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-text">${this.formatMessage(content)}</div>
        <div class="message-meta">
          <span>${timeStr}</span>
          ${type === 'assistant' ? '<span>✓ Delivered</span>' : ''}
        </div>
      </div>
    `;

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    this.messageCount++;
  }

  formatMessage(content) {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  showTypingIndicator() {
    const container = this.getContainer();
    const messagesContainer = container.querySelector('#chat-messages');
    
    const typingElement = document.createElement('div');
    typingElement.className = 'message assistant typing';
    typingElement.id = 'typing-indicator';
    typingElement.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    messagesContainer.appendChild(typingElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  hideTypingIndicator() {
    const typingIndicator = document.querySelector('#typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  async sendToAI(message, context) {
    try {
      // Use real SwissKnife AI integration
      if (this.swissknife && typeof this.swissknife.chat === 'function') {
        // Prepare context string if available
        let contextStr = '';
        if (context && Object.keys(context).length > 0) {
          contextStr = '\n\nContext:\n' + JSON.stringify(context, null, 2);
        }

        // Send to real AI API
        const response = await this.swissknife.chat({
          message: message + contextStr,
          model: this.selectedModel,
          provider: this.selectedProvider
        });

        // Extract message from response
        const aiMessage = response.message || response.content || response;
        
        // Update token usage if available
        if (response.usage) {
          this.tokenUsage.input += response.usage.prompt_tokens || 0;
          this.tokenUsage.output += response.usage.completion_tokens || 0;
        } else {
          // Estimate tokens if not provided
          this.tokenUsage.input += Math.ceil(message.length / 4);
          this.tokenUsage.output += Math.ceil(aiMessage.length / 4);
        }

        return aiMessage;
      } else {
        // Fallback: Try to use window.swissknife if available
        if (window.swissknife && typeof window.swissknife.chat === 'function') {
          const response = await window.swissknife.chat({
            message: message,
            model: this.selectedModel
          });
          return response.message || response.content || response;
        }

        // If no AI API available, provide helpful message
        return `AI integration is not configured. To use AI Chat:

1. Configure API keys in Settings
2. Ensure SwissKnife backend is running
3. Select an AI provider from the dropdown

Currently selected: ${this.selectedProvider} / ${this.selectedModel}

For testing, you can:
- Use the Terminal AI commands
- Configure OpenAI, Anthropic, or local models
- Check the API Keys app for configuration`;
      }
    } catch (error) {
      console.error('AI Error:', error);
      throw new Error(`AI request failed: ${error.message}`);
    }
  }

  updateUsageStats() {
    const container = this.getContainer();
    const messageCountElement = container.querySelector('#message-count');
    const tokenCountElement = container.querySelector('#token-count');

    if (messageCountElement) {
      messageCountElement.textContent = this.messageCount;
    }
    
    if (tokenCountElement) {
      tokenCountElement.textContent = this.tokenUsage.input + this.tokenUsage.output;
    }
  }

  startVoiceInput() {
    if (this.recognition && !this.voiceEnabled) {
      this.voiceEnabled = true;
      this.recognition.start();
      
      const container = this.getContainer();
      const voiceBtn = container.querySelector('#voice-input-btn');
      voiceBtn.classList.add('recording');
      voiceBtn.textContent = '🔴';
    }
  }

  handleVoiceInput(transcript) {
    const container = this.getContainer();
    const input = container.querySelector('#chat-input');
    input.value = transcript;
    this.handleInputChange(transcript);

    // Stop recording
    this.voiceEnabled = false;
    const voiceBtn = container.querySelector('#voice-input-btn');
    voiceBtn.classList.remove('recording');
    voiceBtn.textContent = '🎤';
  }

  getContainer() {
    return document.querySelector('.ai-chat-container');
  }

  async loadConversations() {
    // Load conversation history from storage
    try {
      const stored = localStorage.getItem('swissknife-ai-conversations');
      this.conversations = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load conversations:', error);
      this.conversations = [];
    }
  }

  createNewConversation() {
    const conversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      created: Date.now(),
      updated: Date.now()
    };

    this.conversations.unshift(conversation);
    this.currentConversation = conversation;
    
    // Clear current chat
    const container = this.getContainer();
    const messagesContainer = container.querySelector('#chat-messages');
    messagesContainer.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🤖</div>
        <h3>New Conversation Started</h3>
        <p>I'm ready to help! What would you like to discuss?</p>
      </div>
    `;

    this.updateConversationList();
  }

  updateConversationList() {
    const container = this.getContainer();
    const listContainer = container.querySelector('#conversation-list');
    
    listContainer.innerHTML = this.conversations.map(conv => `
      <div class="conversation-item ${conv.id === this.currentConversation?.id ? 'active' : ''}" 
           data-id="${conv.id}">
        <div class="conversation-title">${conv.title}</div>
        <div class="conversation-meta">${this.formatTime(conv.updated)}</div>
      </div>
    `).join('');

    // Add click handlers
    listContainer.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        this.loadConversation(item.dataset.id);
      });
    });
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString();
  }

}
