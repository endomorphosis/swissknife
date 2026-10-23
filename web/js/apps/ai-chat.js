/**
 * Enhanced AI Chat App for SwissKnife Web Desktop
 * Advanced conversational AI with multi-model support, context awareness, and smart features
 */

let nextAIChatInstance = 0;

export class AIChatApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.instanceId = `ai-chat-instance-${++nextAIChatInstance}`;
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
    this.selectedFileContext = [];
    
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
    // Instance ownership is separate from stable, window-scoped control IDs.
    
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
            <label for="ai-chat-model-select">Model:</label>
            <select id="ai-chat-model-select" data-ai-chat-control="model" aria-label="Chat model" class="enhanced-select"
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
            <output data-chat-context-status role="status">Only available local observations are included; unavailable sources are identified explicitly.</output>
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
            <div class="welcome-message sk-empty">
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
                <button class="quick-action-btn" data-native-gateway-binding="ai-chat.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendQuickAction('Analyze my desktop state', this)">🖥️ Desktop Analysis</button>
                <button class="quick-action-btn" data-native-gateway-binding="ai-chat.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendQuickAction('Help me write code', this)">💻 Code Assistant</button>
                <button class="quick-action-btn" data-native-gateway-binding="ai-chat.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" onclick="window.aiChatInstances?.['${this.instanceId}']?.sendQuickAction('Explain system performance', this)">📊 System Health</button>
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
                <textarea id="ai-chat-input" data-ai-chat-control="input" aria-label="Chat message"
                          class="enhanced-input" 
                          placeholder="Ask me anything... (Shift+Enter for new line)"
                          rows="1"
                          oninput="window.aiChatInstances?.['${this.instanceId}']?.handleInputChange(this.value)"
                          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.aiChatInstances?.['${this.instanceId}']?.sendMessage();}"></textarea>
                <button class="input-btn voice-input" onclick="window.aiChatInstances?.['${this.instanceId}']?.startVoiceInput()" title="Voice Input">🎤</button>
                <button class="send-btn" id="ai-chat-send-btn" data-ai-chat-control="send" data-native-gateway-binding="ai-chat.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" disabled onclick="window.aiChatInstances?.['${this.instanceId}']?.sendMessage(this)" title="Send Message">
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
          background: linear-gradient(135deg, var(--sk-bg-deep, #0e1412), var(--sk-bg-panel, #101b18));
          color: var(--sk-text, #edf7f2);
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
          background: rgba(139, 216, 189, 0.25);
          color: var(--sk-text, #edf7f2);
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s ease;
        }

        .new-chat-btn:hover {
          background: rgba(139, 216, 189, 0.4);
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
          background: rgba(94, 227, 161, 0.18);
          border: 1px solid rgba(94, 227, 161, 0.4);
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
          background: var(--sk-ok, #5ee3a1);
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
          background: var(--sk-accent, #8bd8bd);
          color: #0e1412;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .send-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(139, 216, 189, 0.3);
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
          background: var(--sk-bg-inset, #17241f);
          border: 1px solid var(--sk-accent, #8bd8bd);
        }

        .message.assistant .message-avatar {
          background: var(--sk-bg-inset, #17241f);
          border: 1px solid var(--sk-ok, #5ee3a1);
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
          background: rgba(255, 107, 107, 0.3) !important;
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

    // Register before insertion so the first input/click event has an owner.
    window.aiChatInstances ||= {};
    window.aiChatInstances[this.instanceId] = this;

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
      const modelSelect = container.querySelector(`#ai-chat-model-select`);
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
    const textarea = container.querySelector(`#ai-chat-input`);
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    // Enable/disable send button
    const sendBtn = container.querySelector('#ai-chat-send-btn') || container.querySelector(`#${this.instanceId}-send-btn`);
    if (sendBtn) {
      sendBtn.disabled = !value.trim();
    }
  }

  async sendMessage() {
    const container = this.getContainer();
    if (!container) return;
    
    const input = container.querySelector(`#ai-chat-input`);
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

  sendQuickAction(prompt, trigger = null) {
    const container = this.getContainer();
    if (!container) return;
    
    const input = container.querySelector(`#ai-chat-input`);
    if (input) {
      input.value = prompt;
      this.handleInputChange(prompt);
      return this.sendMessage(trigger);
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
    const provider = this.aiProviders[providerId];
    if (!provider) return;
    this.selectedProvider = providerId;
    this.selectedModel = provider.models[0];
    const container = this.getContainer();
    if (!container) return;
    container.querySelectorAll('.provider-card').forEach(card => card.classList.toggle('active', card.dataset.provider === providerId));
    const modelSelect = container.querySelector('#ai-chat-model-select');
    if (modelSelect) {
      modelSelect.innerHTML = provider.models.map(model => `<option value="${model}">${model}</option>`).join('');
      modelSelect.value = this.selectedModel;
    }
    this.updateModelCapabilities();
  }

  updateModelCapabilities() {
    const provider = this.aiProviders[this.selectedProvider];
    const status = this.getContainer()?.querySelector('.status-text');
    if (status && provider) status.textContent = `${provider.name} selected; owner requests require confirmation.`;
  }

  async toggleContextSource(contextId, enabled) {
    if (!this.contextSources[contextId]) return;
    this.contextSources[contextId].enabled = enabled;
    const container = this.getContainer();
    container?.querySelector(`[data-context="${contextId}"]`)?.classList.toggle('enabled', enabled);
    const state = enabled ? await this.gatherContextData(contextId) : { status: 'disabled' };
    const status = container?.querySelector('[data-chat-context-status]');
    if (status) status.textContent = `${this.contextSources[contextId].name}: ${state.status}${state.reason ? ` — ${state.reason}` : ''}.`;
    return state;
  }

  async gatherContextData(contextId) {
    const getters = {
      desktop: 'getDesktopContext', files: 'getFileContext', code: 'getCodeContext',
      system: 'getSystemContext', p2p: 'getP2PContext', ipfs: 'getIPFSContext',
    };
    try {
      const getter = getters[contextId];
      return getter ? await this[getter]() : { type: contextId, status: 'unavailable', reason: 'Unknown local context source' };
    } catch (error) {
      return { type: contextId, status: 'unavailable', reason: error.message || String(error) };
    }
  }

  getDesktopContext() {
    const windows = this.desktop?.windows;
    if (!(windows instanceof Map) && typeof this.desktop?.getOpenApps !== 'function') return { type: 'desktop', status: 'unavailable', reason: 'The desktop does not expose its current windows' };
    const apps = windows instanceof Map ? [...windows.values()] : this.desktop.getOpenApps();
    return {
      type: 'desktop', status: 'available',
      openApps: apps.map(app => ({ id: app.appId || app.id || null, title: app.title || null })),
      activeApp: windows instanceof Map ? apps.find(app => app.element === this.desktop.activeWindow)?.appId || null : this.desktop.getActiveApp?.() || null,
      observed_at: new Date().toISOString(),
    };
  }

  updateDesktopContext() {
    return this.getDesktopContext();
  }

  addFileContext(data) {
    const source = data?.file || data;
    if (!source || typeof source !== 'object') return;
    const file = Object.fromEntries(['name', 'path', 'cid', 'content'].filter(key => typeof source[key] === 'string').map(key => [key, source[key]]));
    if (Object.keys(file).length) this.selectedFileContext.push(file);
  }

  getFileContext() {
    return this.selectedFileContext.length
      ? { type: 'files', status: 'available', files: this.selectedFileContext.map(file => ({ ...file })) }
      : { type: 'files', status: 'unavailable', reason: 'No local file selection has supplied contents or metadata to this chat' };
  }

  getCodeContext() {
    const editor = document.querySelector('.vibecode-container #code-editor');
    return editor ? { type: 'code', status: 'available', source: 'open-local-editor', content: editor.value }
      : { type: 'code', status: 'unavailable', reason: 'No local editor is open' };
  }

  getSystemContext() {
    const browser = window.navigator;
    if (!browser) return { type: 'system', status: 'unavailable', reason: 'Browser system information is unavailable' };
    return { type: 'system', status: 'available', scope: 'browser', user_agent: browser.userAgent, language: browser.language, online: browser.onLine };
  }

  getP2PContext() {
    return { type: 'p2p', status: 'unavailable', reason: 'No observed local peer state is exposed to this chat' };
  }

  getIPFSContext() {
    return { type: 'ipfs', status: 'unavailable', reason: 'No verified IPFS content has been selected for this chat' };
  }

  handleInputChange(value) {
    const container = this.getContainer();
    if (!container) return;
    const text = String(value || '');
    const charCount = container.querySelector(`#${this.instanceId}-char-count`) || container.querySelector('#char-count');
    const tokenCount = container.querySelector(`#${this.instanceId}-estimated-tokens`) || container.querySelector('#estimated-tokens');
    if (charCount) charCount.textContent = String(text.length);
    if (tokenCount) tokenCount.textContent = `~${Math.ceil(text.length / 4)} tokens`;

    const textarea = container.querySelector(`#ai-chat-input`) || container.querySelector('#chat-input');
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    const sendBtn = container.querySelector('#ai-chat-send-btn') || container.querySelector('#send-btn');
    if (sendBtn) sendBtn.disabled = !text.trim();
  }

  async sendMessage(trigger = null) {
    const container = this.getContainer();
    const input = container?.querySelector('#ai-chat-input');
    const message = input?.value.trim();
    if (!message || this.isSending) return;
    this.isSending = true;
    input.value = '';
    this.handleInputChange('');
    this.addMessage('user', message);
    this.showTypingIndicator();
    try {
      const context = await this.gatherEnabledContext();
      const response = await this.sendToAI(message, context, trigger);
      if (response === null) {
        input.value = message;
        this.handleInputChange(message);
        return;
      }
      this.addMessage('assistant', response);
      this.updateUsageStats();
    } catch (error) {
      this.addMessage('error', `AI request failed: ${error.message}`);
    } finally {
      this.hideTypingIndicator();
      this.isSending = false;
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
    if (!container) return;
    const messagesContainer = container.querySelector(`#${this.instanceId}-messages`) || container.querySelector('#chat-messages') || container.querySelector('.chat-messages');
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
    if (!container) return;
    const messagesContainer = container.querySelector(`#${this.instanceId}-messages`) || container.querySelector('#chat-messages') || container.querySelector('.chat-messages');
    if (!messagesContainer) return;
    
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
    const typingIndicator = this.getContainer()?.querySelector('#typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  async sendToAI(message, context, trigger = null) {
    if (!String(message || '').trim()) return null;
    const { invokeNativeTool } = await import('../live-tool-gateway.js');
    const container = this.getContainer();
    const response = await invokeNativeTool(container, 'ai-chat', 'ai-chat.ipfs_accelerate_py.submit_inference', {
      toolId: 'submit_task',
      trigger: trigger || container?.querySelector('#ai-chat-send-btn'),
      payload: {
        task_type: 'inference', model_id: this.selectedModel, prompt: message,
        payload: { model_id: this.selectedModel, prompt: message, context },
      },
    });
    if (response === null) return null;
    if (!response?.ok || response.outcome !== 'executed') {
      throw new Error(response?.error || response?.result?.error || response?.outcome || 'Inference owner did not execute the request.');
    }
    const pending = [response.result];
    let jobId = '';
    let dryRun = false;
    for (let index = 0; index < pending.length && index < 24; index++) {
      const value = pending[index];
      if (!value || typeof value !== 'object') continue;
      for (const field of ['message', 'generated_text', 'response_text']) {
        if (typeof value[field] === 'string' && value[field]) return value[field];
      }
      jobId ||= value.task_id || value.job_id || '';
      dryRun ||= value.dry_run === true || value.receipt?.dry_run === true;
      if (value.result && typeof value.result === 'object') pending.push(value.result);
      for (const part of Array.isArray(value.content) ? value.content : []) {
        if (part.json && typeof part.json === 'object') pending.push(part.json);
        else if (part.type === 'text' && typeof part.text === 'string') {
          try { pending.push(JSON.parse(part.text)); }
          catch { return part.text; }
        }
      }
    }
    const receipt = response.receipt?.receipt_id || 'unavailable';
    if (dryRun) return `Inference request validated as a dry run. Correlation: ${response.correlation_id}; receipt: ${receipt}.`;
    if (jobId) return `Inference task submitted: ${jobId}. Correlation: ${response.correlation_id}; receipt: ${receipt}.`;
    return `Inference owner acknowledged the request. Correlation: ${response.correlation_id}; receipt: ${receipt}.`;
  }

  updateUsageStats() {
    const container = this.getContainer();
    const messageCountElement = container?.querySelector(`#${this.instanceId}-message-count`) || container?.querySelector('#message-count');
    const tokenCountElement = container?.querySelector(`#${this.instanceId}-token-count`) || container?.querySelector('#token-count');

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
      if (!container) return;
      const voiceBtn = container.querySelector('#voice-input-btn') || container.querySelector('.voice-input');
      if (voiceBtn) {
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '🔴';
      }
    }
  }

  handleVoiceInput(transcript) {
    const container = this.getContainer();
    if (!container) return;
    const input = container.querySelector(`#ai-chat-input`) || container.querySelector('#chat-input');
    if (input) input.value = transcript;
    this.handleInputChange(transcript);

    // Stop recording
    this.voiceEnabled = false;
    const voiceBtn = container.querySelector('#voice-input-btn') || container.querySelector('.voice-input');
    if (voiceBtn) {
      voiceBtn.classList.remove('recording');
      voiceBtn.textContent = '🎤';
    }
  }

  getContainer() {
    return document.getElementById(this.instanceId);
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
    const messagesContainer = container?.querySelector(`#${this.instanceId}-messages`)
      || container?.querySelector('#chat-messages')
      || container?.querySelector('.chat-messages');
    if (messagesContainer) messagesContainer.innerHTML = `
      <div class="welcome-message sk-empty">
        <div class="welcome-icon">🤖</div>
        <h3>New Conversation Started</h3>
        <p>I'm ready to help! What would you like to discuss?</p>
      </div>
    `;

    this.updateConversationList();
  }

  updateConversationList() {
    const container = this.getContainer();
    const listContainer = container?.querySelector('#conversation-list') || container?.querySelector('.conversation-list');
    if (!listContainer) return;

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
