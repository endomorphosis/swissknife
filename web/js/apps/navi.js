import { contentCidForBytes } from '../core/mcp-plus-plus-desktop-client.js';
/**
 * NAVI - Advanced AI Assistant App for SwissKnife Web Desktop
 * Context-aware AI assistant with voice interaction, learning capabilities, and deep system integration
 */

export class NAVIApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.conversations = [];
    this.currentConversation = null;
    this.context = {
      apps: [],
      files: [],
      settings: {},
      p2pPeers: [],
      recentActions: []
    };
    this.voiceEnabled = false;
    this.speechRecognition = null;
    this.speechSynthesis = null;
    this.isListening = false;
    this.learningData = new Map();
    this.personality = 'helpful'; // 'helpful', 'casual', 'professional', 'creative'
    this.aiModel = 'gpt-4';
    this.p2pSystem = null;
    
    // NAVI capabilities
    this.capabilities = [
      'system-control',      // Control desktop apps and settings
      'file-management',     // File operations and organization
      'ai-assistance',       // AI-powered help and analysis
      'voice-interaction',   // Voice commands and responses
      'learning',            // Learn user preferences and patterns
      'p2p-coordination',    // Coordinate tasks across P2P network
      'automation',          // Automate repetitive tasks
      'monitoring',          // System and performance monitoring
      'code-assistance',     // Programming help and code review
      'research',            // Information gathering and analysis
    ];
    
    // Built-in commands
    this.commands = new Map([
      ['open', { handler: this.openApp.bind(this), description: 'Open an application' }],
      ['close', { handler: this.closeApp.bind(this), description: 'Close an application' }],
      ['help', { handler: this.showHelp.bind(this), description: 'Show available commands' }],
      ['search', { handler: this.searchSystem.bind(this), description: 'Search files, apps, or settings' }],
      ['monitor', { handler: this.showSystemStatus.bind(this), description: 'Show system status' }],
      ['learn', { handler: this.learnFromUser.bind(this), description: 'Learn user preferences' }],
      ['automate', { handler: this.automateTask.bind(this), description: 'Automate a task' }],
      ['analyze', { handler: this.analyzeContent.bind(this), description: 'Analyze content or data' }],
      ['suggest', { handler: this.suggestActions.bind(this), description: 'Suggest actions based on context' }],
      ['remember', { handler: this.rememberInformation.bind(this), description: 'Remember information for later' }]
    ]);
    
    this.initializeIntegrations();
  }

  async initializeIntegrations() {
    try {
      this.swissknife = this.desktop.swissknife;
      
      // Connect to P2P system for distributed intelligence
      if (window.p2pMLSystem) {
        this.p2pSystem = window.p2pMLSystem;
        this.setupP2PIntelligence();
      }
      
      // Initialize voice capabilities
      await this.initializeVoice();
      
      // Load learning data
      this.loadLearningData();
      
      // Start context monitoring
      this.startContextMonitoring();
      
      console.log('✅ NAVI integrations initialized');
    } catch (error) {
      console.error('❌ NAVI integration error:', error);
    }
  }

  createWindow() {
    const content = `
      <div class="navi-container">
      <style>
        .window[data-app-id="navi"] .window-content { display:flex; flex-direction:column; min-height:0; overflow:hidden; padding-bottom:0; }
        .window[data-app-id="navi"] .window-app-content { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="navi"] .window-app-content > [id$="-content"] { flex:1 1 0; min-height:0; min-width:0; overflow:hidden; }
        .navi-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          min-width: 0;
          box-sizing: border-box;
          position: relative;
          background: var(--sk-bg-deep, #0e1412);
          color: var(--sk-text, #edf7f2);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          overflow: hidden;
        }
        .navi-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--sk-bg-panel, #101b18);
          border-bottom: 1px solid var(--sk-border, #263a34);
          flex-shrink: 0;
        }
        .navi-avatar { position: relative; flex-shrink: 0; }
        .avatar-image {
          width: 40px; height: 40px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          background: var(--sk-bg-inset, #17241f);
          border: 1px solid var(--sk-border, #263a34);
        }
        .avatar-status {
          position: absolute; right: 0; bottom: 0;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: var(--sk-idle, #7c8f87);
          border: 2px solid var(--sk-bg-panel, #101b18);
        }
        .avatar-status.voice-enabled { background: var(--sk-ok, #5ee3a1); }
        .navi-info { flex: 1; min-width: 0; }
        .navi-name { font-weight: 700; font-size: 16px; }
        .navi-status { font-size: 12px; color: var(--sk-text-faint, #9eb2aa); }
        .navi-controls { display: flex; gap: 8px; }
        .navi-btn {
          width: 36px; height: 36px;
          border-radius: 8px;
          border: 1px solid var(--sk-border, #263a34);
          background: var(--sk-bg-header, #12211d);
          color: var(--sk-text, #edf7f2);
          cursor: pointer; font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s ease;
        }
        .navi-btn:hover { background: var(--sk-bg-inset, #17241f); }
        .navi-btn.active {
          background: rgba(139, 216, 189, 0.22);
          border-color: var(--sk-accent, #8bd8bd);
          color: var(--sk-accent, #8bd8bd);
        }
        .navi-content {
          flex: 1; display: flex;
          min-height: 0; overflow: hidden;
        }
        .navi-container .conversation-area {
          flex: 1; display: flex; flex-direction: column;
          min-width: 0; min-height: 0; overflow: hidden;
        }
        .conversation-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; padding: 10px 16px;
          border-bottom: 1px solid var(--sk-border, #263a34);
          flex-wrap: wrap;
        }
        .conversation-header h3 { margin: 0; font-size: 14px; }
        .conversation-controls { display: flex; gap: 8px; }
        .conversation-controls select {
          padding: 6px 8px;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 6px;
          color: var(--sk-text, #edf7f2);
          font-size: 12px;
        }
        .navi-container .conversation-messages {
          flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain;
          padding: 16px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .navi-container .message { display: flex; gap: 10px; max-width: 88%; }
        .navi-container .message.user-message { align-self: flex-end; flex-direction: row-reverse; }
        .navi-container .message-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
          background: var(--sk-bg-inset, #17241f);
          border: 1px solid var(--sk-border, #263a34);
        }
        .navi-container .message-content {
          background: var(--sk-bg-panel, #101b18);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px; line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .navi-container .message.user-message .message-content {
          background: rgba(139, 216, 189, 0.14);
          border-color: var(--sk-accent, #8bd8bd);
        }
        .navi-container .message-text ul { margin: 8px 0; padding-left: 20px; }
        .navi-container .message-text li { margin-bottom: 4px; }
        .navi-container .message-text code {
          background: rgba(0, 0, 0, 0.35);
          padding: 1px 5px; border-radius: 4px;
          font-family: ui-monospace, monospace; font-size: 13px;
          color: var(--sk-accent, #8bd8bd);
        }
        .navi-container .message-time {
          font-size: 11px; color: var(--sk-text-faint, #9eb2aa);
          margin-top: 6px; opacity: 0.8;
        }
        .navi-container .message-actions {
          display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
        }
        .navi-container .action-btn {
          padding: 6px 10px;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 6px;
          color: var(--sk-accent, #8bd8bd);
          cursor: pointer; font-size: 12px;
        }
        .navi-container .action-btn:hover { background: var(--sk-bg-inset, #17241f); }
        .navi-container .typing-dots { display: flex; gap: 4px; padding: 6px 0; }
        .navi-container .typing-dots span {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--sk-text-faint, #9eb2aa);
          animation: navi-typing 1.4s infinite ease-in-out;
        }
        .navi-container .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
        .navi-container .typing-dots span:nth-child(3) { animation-delay: -0.32s; }
        @keyframes navi-typing {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        .navi-container .conversation-header,
        .navi-container .navi-resolution,
        .navi-container .conversation-input { flex: 0 0 auto; }
        .conversation-input {
          padding: 12px 16px;
          border-top: 1px solid var(--sk-border, #263a34);
          background: var(--sk-bg-panel, #101b18);
        }
        .navi-container .input-container {
          display: flex; gap: 8px; align-items: center;
        }
        .navi-container .message-input {
          flex: 1; min-width: 0;
          padding: 10px 12px;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px;
          color: var(--sk-text, #edf7f2);
          font-size: 14px; font-family: inherit;
        }
        .navi-container .message-input::placeholder { color: var(--sk-text-faint, #9eb2aa); }
        .navi-container .message-input:focus,
        .navi-container button:focus-visible,
        .navi-container select:focus-visible {
          outline: 2px solid var(--sk-accent, #8bd8bd);
          outline-offset: 2px;
          border-color: var(--sk-accent, #8bd8bd);
        }
        .navi-container [hidden] { display: none !important; }
        .navi-resolution { padding: 8px 16px 0; display: flex; flex-direction: column; gap: 6px; }
        .navi-intent-status, .navi-retained-intent, .navi-selected-target {
          margin: 0; font-size: 12px; line-height: 1.4; color: var(--sk-text, #edf7f2);
        }
        .navi-match-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .navi-container .voice-btn,
        .navi-container .send-btn {
          width: 38px; height: 38px; flex-shrink: 0;
          border-radius: 8px;
          border: 1px solid var(--sk-border, #263a34);
          background: var(--sk-bg-header, #12211d);
          color: var(--sk-text, #edf7f2);
          cursor: pointer; font-size: 16px;
          display: flex; align-items: center; justify-content: center;
        }
        .navi-container .send-btn {
          background: var(--sk-accent, #8bd8bd);
          border-color: var(--sk-accent, #8bd8bd);
          color: #0e1412;
        }
        .navi-container .voice-btn.listening {
          background: rgba(255, 107, 107, 0.2);
          border-color: var(--sk-err, #ff6b6b);
          animation: navi-pulse 1s infinite;
        }
        @keyframes navi-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .navi-container .quick-actions {
          display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;
        }
        .navi-container .quick-btn {
          padding: 6px 12px;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 16px;
          color: var(--sk-text-faint, #9eb2aa);
          cursor: pointer; font-size: 12px;
        }
        .navi-container .quick-btn:hover {
          color: var(--sk-accent, #8bd8bd);
          border-color: var(--sk-accent, #8bd8bd);
        }
        .context-panel {
          width: 260px; flex-shrink: 0;
          border-left: 1px solid var(--sk-border, #263a34);
          background: var(--sk-bg-panel, #101b18);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .context-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--sk-border, #263a34);
        }
        .context-header h3 { margin: 0; font-size: 13px; }
        .context-toggle {
          background: none; border: none; cursor: pointer; font-size: 16px;
          color: var(--sk-text-faint, #9eb2aa);
        }
        .context-content { flex: 1; overflow-y: auto; padding: 10px 14px; }
        .context-section { margin-bottom: 16px; }
        .context-section h4 { margin: 0 0 8px; font-size: 12px; color: var(--sk-text-faint, #9eb2aa); }
        .context-list { display: flex; flex-direction: column; gap: 6px; }
        .context-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 8px; border-radius: 6px;
          font-size: 12px;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
        }
        .context-item.clickable { cursor: pointer; }
        .context-item.clickable:hover { border-color: var(--sk-accent, #8bd8bd); }
        .item-text { overflow-wrap: anywhere; min-width: 0; }
        .context-empty {
          font-size: 12px; color: var(--sk-text-faint, #9eb2aa);
          font-style: italic; padding: 4px 8px;
        }
        .voice-visualization {
          display: none;
          align-items: center; justify-content: center; gap: 6px;
          padding: 10px;
          background: rgba(255, 107, 107, 0.08);
          border-top: 1px solid var(--sk-border, #263a34);
        }
        .voice-visualization.active { display: flex; }
        .voice-wave {
          width: 6px; border-radius: 3px;
          background: var(--sk-err, #ff6b6b);
          animation: navi-wave 1s infinite ease-in-out;
        }
        .voice-wave:nth-child(1) { height: 18px; }
        .voice-wave:nth-child(2) { height: 30px; animation-delay: -0.2s; }
        .voice-wave:nth-child(3) { height: 22px; animation-delay: -0.4s; }
        @keyframes navi-wave {
          0%, 100% { transform: scaleY(0.6); }
          50% { transform: scaleY(1.2); }
        }
        .listening-text { font-size: 12px; color: var(--sk-err, #ff6b6b); margin-left: 8px; }
        .learning-panel {
          position: absolute; right: 12px; bottom: 12px;
          width: 320px; max-height: 70%;
          overflow-y: auto;
          background: var(--sk-bg-panel, #101b18);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
          z-index: 50;
        }
        .learning-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--sk-border, #263a34);
        }
        .learning-header h3 { margin: 0; font-size: 14px; }
        .close-learning {
          background: none; border: none; cursor: pointer; font-size: 14px;
          color: var(--sk-text-faint, #9eb2aa);
        }
        .learning-content { padding: 12px 14px; }
        .learning-stats { display: flex; gap: 12px; margin-bottom: 14px; }
        .learning-stats .stat-item {
          flex: 1; text-align: center;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px; padding: 8px 4px;
        }
        .learning-stats .stat-label { display: block; font-size: 10px; color: var(--sk-text-faint, #9eb2aa); margin-bottom: 4px; }
        .learning-stats .stat-value { display: block; font-size: 16px; font-weight: 700; color: var(--sk-accent, #8bd8bd); }
        .learned-preferences h4 { margin: 0 0 8px; font-size: 12px; color: var(--sk-text-faint, #9eb2aa); }
        .preferences-list { display: flex; flex-direction: column; gap: 6px; }
        @media (max-width: 760px) {
          .context-panel { display: none; width: 100%; max-height: 42%; }
          .context-panel.navi-context-open { display: flex; }
          .navi-content { flex-direction: column; }
          .navi-container .message-input { font-size: 13px; }
          .navi-container .quick-btn { font-size: 11px; padding: 6px 8px; }
        }
      </style>
        <div class="navi-header">
          <div class="navi-avatar">
            <div class="avatar-image">🤖</div>
            <div class="avatar-status ${this.voiceEnabled ? 'voice-enabled' : ''}"></div>
          </div>
          <div class="navi-info">
            <div class="navi-name">NAVI</div>
            <div class="navi-status">Your AI Assistant</div>
          </div>
          <div class="navi-controls">
            <button class="navi-btn ${this.voiceEnabled ? 'active' : ''}" id="toggle-voice" title="Toggle Voice">🎤</button>
            <button class="navi-btn" id="navi-settings" title="Settings">⚙️</button>
            <button class="navi-btn" id="clear-conversation" title="Clear Conversation">🗑️</button>
          </div>
        </div>

        <div class="navi-content">
          <div class="conversation-area">
            <div class="conversation-header">
              <h3>💬 Conversation</h3>
              <div class="conversation-controls">
                <button type="button" class="quick-btn" id="show-context">Context</button>
                <select id="personality-select" title="AI Personality">
                  <option value="helpful" ${this.personality === 'helpful' ? 'selected' : ''}>Helpful</option>
                  <option value="casual" ${this.personality === 'casual' ? 'selected' : ''}>Casual</option>
                  <option value="professional" ${this.personality === 'professional' ? 'selected' : ''}>Professional</option>
                  <option value="creative" ${this.personality === 'creative' ? 'selected' : ''}>Creative</option>
                </select>
                <select id="ai-model-select" title="AI Model">
                  <option value="gpt-4" ${this.aiModel === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
                  <option value="claude-3" ${this.aiModel === 'claude-3' ? 'selected' : ''}>Claude 3</option>
                  <option value="llama-2" ${this.aiModel === 'llama-2' ? 'selected' : ''}>LLaMA 2</option>
                </select>
              </div>
            </div>
            
            <div class="navi-resolution" id="navi-resolution">
              <p id="navi-retained-intent" class="navi-retained-intent"></p>
              <p id="navi-selected-target" class="navi-selected-target">No target selected</p>
              <p id="navi-intent-status" class="navi-intent-status" hidden></p>
              <div id="navi-match-list" class="navi-match-list" hidden></div>
            </div>
            <div class="conversation-messages" id="conversation-messages">
              <div class="welcome-message">
                <div class="message navi-message">
                  <div class="message-avatar">🤖</div>
                  <div class="message-content">
                    <div class="message-text">Ask NAVI for a catalog target, or say help for local commands.</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="conversation-input">
              <div class="input-container">
                <input type="text" id="message-input" aria-label="Intent" placeholder="Ask NAVI" class="message-input">
                <button class="voice-btn ${this.isListening ? 'listening' : ''}" id="voice-input-btn" title="Voice Input">🎤</button>
                <button class="send-btn" id="send-message-btn" title="Send Message">📤</button>
              </div>
              <div class="quick-actions">
                <button class="quick-btn" data-command="help">❓ Help</button>
                <button class="quick-btn" data-command="monitor">📊 Status</button>
                <button class="quick-btn" data-command="suggest">💡 Suggest</button>
                <button class="quick-btn" data-command="automate">⚙️ Automate</button>
              </div>
            </div>
          </div>

          <div class="context-panel">
            <div class="context-header">
              <h3>🧠 Context Awareness</h3>
              <button class="context-toggle" id="toggle-context">👁️</button>
            </div>
            
            <div class="context-content" id="context-content">
              <div class="context-section">
                <h4>🖥️ Active Apps</h4>
                <div class="context-list" id="active-apps-list">
                  <div class="context-empty">No active apps</div>
                </div>
              </div>

              <div class="context-section">
                <h4>📁 Recent Files</h4>
                <div class="context-list" id="recent-files-list">
                  <div class="context-empty">No recent files</div>
                </div>
              </div>

              <div class="context-section">
                <h4>🔗 P2P Network</h4>
                <div class="context-list" id="p2p-status-list">
                  <div class="context-empty">No peers connected</div>
                </div>
              </div>

              <div class="context-section">
                <h4>📊 System Health</h4>
                <div class="context-list" id="system-health-list">
                  <div class="context-empty">Local signals pending</div>
                </div>
              </div>

              <div class="context-section">
                <h4>🎯 Suggestions</h4>
                <div class="context-list" id="suggestions-list">
                  <div class="context-empty">No suggestions yet</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Voice Visualization -->
        <div class="voice-visualization ${this.isListening ? 'active' : ''}" id="voice-visualization">
          <div class="voice-wave"></div>
          <div class="voice-wave"></div>
          <div class="voice-wave"></div>
          <div class="listening-text">Listening...</div>
        </div>

        <!-- Learning Panel -->
        <div class="learning-panel" id="learning-panel" style="display: none;">
          <div class="learning-header">
            <h3>🧠 Learning & Preferences</h3>
            <button class="close-learning" id="close-learning">❌</button>
          </div>
          <div class="learning-content">
            <div class="learning-stats">
              <div class="stat-item">
                <span class="stat-label">Interactions</span>
                <span class="stat-value" id="interaction-count">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Learned Patterns</span>
                <span class="stat-value" id="pattern-count">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Success Rate</span>
                <span class="stat-value" id="success-rate">0%</span>
              </div>
            </div>
            
            <div class="learned-preferences">
              <h4>📚 What I've Learned About You</h4>
              <div class="preferences-list" id="preferences-list">
                <!-- Learned preferences will be populated -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    return content;
  }

  async initialize() {
    await this.initializeIntegrations();
    this.setupEventListeners();
    await this.loadInitialContext();
    this.restoreWorkflowState();
    this.startPeriodicUpdates();
  }

  setupEventListeners(container = null) {
    // Message input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    
    if (messageInput) {
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const status = document.getElementById('navi-intent-status');
          const list = document.getElementById('navi-match-list');
          if (status) {
            status.hidden = true;
            status.textContent = '';
          }
          if (list) {
            list.hidden = true;
            list.innerHTML = '';
          }
          this.sendMessage();
        }
      });
    }
    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    const showContext = document.getElementById('show-context');
    if (showContext) {
      showContext.addEventListener('click', () => {
        const panel = showContext.closest('.navi-container')?.querySelector('.context-panel');
        if (panel) panel.classList.toggle('navi-context-open');
      });
    }

    const nativeRoot = container?.matches?.('.navi-container') ? container
      : container?.querySelector?.('.navi-container') || document.querySelector('.navi-container');
    if (nativeRoot && nativeRoot.dataset.naviTargetBound !== 'true') {
      nativeRoot.dataset.naviTargetBound = 'true';
      nativeRoot.addEventListener('click', (e) => {
        const choice = e.target.closest && e.target.closest('.navi-target-choice');
        if (!choice || !nativeRoot.contains(choice)) return;
        e.preventDefault();
        this.commitSelectedTarget(choice.getAttribute('data-target') || '');
      });
    }

    // Voice controls
    const voiceToggle = document.getElementById('toggle-voice');
    const voiceInputBtn = document.getElementById('voice-input-btn');
    
    if (voiceToggle) {
      voiceToggle.addEventListener('click', () => this.toggleVoice());
    }
    
    if (voiceInputBtn) {
      voiceInputBtn.addEventListener('click', () => this.toggleListening());
    }

    // Quick actions
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('quick-btn')) {
        const command = e.target.dataset.command;
        this.executeQuickCommand(command);
      }
    });

    // Settings and controls
    document.addEventListener('click', (e) => {
      const buttonHandlers = {
        'navi-settings': () => this.showSettings(),
        'clear-conversation': () => this.clearConversation(),
        'toggle-context': () => this.toggleContextPanel(),
        'close-learning': () => this.hideLearningPanel()
      };

      if (buttonHandlers[e.target.id]) {
        e.preventDefault();
        buttonHandlers[e.target.id]();
      }
    });

    // Personality and model changes
    const personalitySelect = document.getElementById('personality-select');
    const modelSelect = document.getElementById('ai-model-select');
    
    if (personalitySelect) {
      personalitySelect.addEventListener('change', (e) => {
        this.personality = e.target.value;
        this.saveSettings();
      });
    }
    
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        this.aiModel = e.target.value;
        this.saveSettings();
      });
    }
    // The desktop initializes the model before inserting createWindow() HTML.
    // Apply retained selection again only after its actual native root exists.
    if (nativeRoot) this.restoreWorkflowState();
  }

  async initializeVoice() {
    try {
      // Speech Recognition
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = false;
        this.speechRecognition.interimResults = false;
        this.speechRecognition.lang = 'en-US';
        
        this.speechRecognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          this.handleVoiceInput(transcript);
        };
        
        this.speechRecognition.onend = () => {
          this.isListening = false;
          this.updateVoiceUI();
        };
        
        this.speechRecognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          this.isListening = false;
          this.updateVoiceUI();
        };
      }
      
      // Speech Synthesis
      if ('speechSynthesis' in window) {
        this.speechSynthesis = window.speechSynthesis;
      }
      
      this.voiceEnabled = true;
      console.log('✅ Voice capabilities initialized');
    } catch (error) {
      console.error('❌ Voice initialization error:', error);
      this.voiceEnabled = false;
    }
  }

  async sendMessage() {
    const input = document.getElementById('message-input');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();
    this.addMessage('user', message);

    const commandMatch = this.parseCommand(message);
    if (commandMatch) {
      input.value = '';
      await this.processMessage(message);
      return;
    }

    input.value = message;
    await this.resolveCatalogIntent(message);
  }

  catalogLabel(entry, index) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim().slice(0, 160);
    if (entry && typeof entry === 'object') {
      for (const key of ['name', 'title', 'path', 'id', 'dataset', 'cid', 'label', 'text']) {
        if (typeof entry[key] === 'string' && entry[key].trim()) return entry[key].trim().slice(0, 160);
      }
    }
    return '';
  }

  decodeCatalogResult(output) {
    let value = output;
    for (let depth = 0; depth < 8; depth++) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Catalog owner returned no structured result.');
      if (value.ok === false || value.success === false || value.isError === true || value.error
          || ['error', 'failed', 'unavailable'].includes(value.status)) throw new Error(value.error?.message || value.error || 'Catalog owner rejected the read.');
      if (Array.isArray(value.content)) {
        const blocks = value.content.filter(item => item?.type === 'json' && item.json && typeof item.json === 'object');
        if (blocks.length === 1 && value.content.length === 1) { value = blocks[0].json; continue; }
        const texts = value.content.filter(item => item?.type === 'text' && typeof item.text === 'string');
        if (texts.length === 1 && value.content.length === 1) { value = JSON.parse(texts[0].text); continue; }
        throw new Error('Catalog owner returned ambiguous result blocks.');
      }
      if (value.result && typeof value.result === 'object') { value = value.result; continue; }
      return value;
    }
    throw new Error('Catalog owner result nesting exceeded its bound.');
  }

  extractCatalogMatches(output) {
    const value = this.decodeCatalogResult(output);
    if (typeof value.content !== 'string' || value.content.length > 65536) throw new Error('Catalog owner returned no bounded JSON content.');
    const rows = JSON.parse(value.content);
    if (!Array.isArray(rows) || rows.length > 256) throw new Error('Catalog content is not a bounded row list.');
    return rows;
  }

  escapeText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  showIntentOutcome(message, statusText, labels) {
    const status = document.getElementById('navi-intent-status');
    const list = document.getElementById('navi-match-list');
    const input = document.getElementById('message-input');
    if (input) input.value = message;
    this.lastIntent = message;
    this.lastStatus = statusText;
    this.lastLabels = Array.isArray(labels) ? labels.slice(0, 8) : [];
    if (status) {
      status.hidden = false;
      status.textContent = statusText;
    }
    if (list) {
      if (!labels || labels.length === 0) {
        list.hidden = true;
        list.innerHTML = '';
      } else if (labels.length === 1) {
        const label = labels[0];
        list.hidden = false;
        list.innerHTML = `<span class="navi-match-text">${this.escapeText(message)} → ${this.escapeText(label)}</span> <button type="button" class="action-btn navi-target-choice" id="navi-use-target" data-target="${this.escapeText(label)}">Use this target</button>`;
      } else {
        list.hidden = false;
        list.innerHTML = `<span class="navi-match-text">${this.escapeText(message)}</span> ` + labels.map((label, index) => `<button type="button" class="action-btn navi-target-choice"${index === 0 ? ' id="navi-use-target"' : ''} data-target="${this.escapeText(label)}">${this.escapeText(label)}</button>`).join('');
      }
    }
    this.addMessage('navi', statusText);
    this.saveWorkflowState();
  }

  commitSelectedTarget(label) {
    const clean = String(label || '').trim();
    if (!clean) return;
    this.selectedTarget = clean;
    const node = document.getElementById('navi-selected-target');
    if (node) node.textContent = `Selected target: ${clean}`;
    this.saveWorkflowState();
  }

  saveWorkflowState() {
    try {
      localStorage.setItem('navi-workflow-state', JSON.stringify({
        selectedTarget: this.selectedTarget || '',
        lastIntent: this.lastIntent || '',
        lastStatus: this.lastStatus || '',
        lastLabels: Array.isArray(this.lastLabels) ? this.lastLabels.slice(0, 8) : [],
        transcript: (this.conversations || []).slice(-8).map((entry) => ({
          sender: entry.sender === 'user' ? 'user' : 'navi',
          content: String(entry.content || '').slice(0, 400)
        }))
      }));
    } catch (error) {
      console.error('Error saving NAVI workflow state:', error);
    }
  }

  restoreWorkflowState() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('navi-workflow-state') || '{}');
    } catch (error) {
      console.error('Error loading NAVI workflow state:', error);
      return;
    }
    this.selectedTarget = typeof saved.selectedTarget === 'string' ? saved.selectedTarget : '';
    this.lastIntent = typeof saved.lastIntent === 'string' ? saved.lastIntent : '';
    this.lastStatus = typeof saved.lastStatus === 'string' ? saved.lastStatus : '';
    this.lastLabels = Array.isArray(saved.lastLabels) ? saved.lastLabels.filter(label => typeof label === 'string').slice(0, 8) : [];
    const selected = document.getElementById('navi-selected-target');
    if (selected && this.selectedTarget) selected.textContent = `Selected target: ${this.selectedTarget}`;
    const retained = document.getElementById('navi-retained-intent');
    if (retained && this.lastIntent) retained.textContent = `Last intent: ${this.lastIntent}`;
    const input = document.getElementById('message-input');
    if (input && this.lastIntent && !input.value) input.value = this.lastIntent;
    const status = document.getElementById('navi-intent-status');
    const list = document.getElementById('navi-match-list');
    if (status && this.lastStatus) {
      status.hidden = false;
      status.textContent = this.lastStatus;
    }
    if (list && this.lastIntent && this.lastLabels.length) {
      const labels = this.lastLabels;
      list.hidden = false;
      if (labels.length === 1) {
        const label = labels[0];
        list.innerHTML = `<span class="navi-match-text">${this.escapeText(this.lastIntent)} → ${this.escapeText(label)}</span> <button type="button" class="action-btn navi-target-choice" id="navi-use-target" data-target="${this.escapeText(label)}">Use this target</button>`;
      } else {
        list.innerHTML = `<span class="navi-match-text">${this.escapeText(this.lastIntent)}</span> ` + labels.map((label, index) => `<button type="button" class="action-btn navi-target-choice"${index === 0 ? ' id="navi-use-target"' : ''} data-target="${this.escapeText(label)}">${this.escapeText(label)}</button>`).join('');
      }
    }
    const transcript = Array.isArray(saved.transcript) ? saved.transcript.filter((entry) => entry && (entry.sender === 'user' || entry.sender === 'navi') && typeof entry.content === 'string').slice(-8) : [];
    if (transcript.length) {
      this.conversations = transcript.map((entry) => ({
        sender: entry.sender,
        content: entry.content.slice(0, 400),
        metadata: {},
        timestamp: 0
      }));
      const messagesContainer = document.getElementById('conversation-messages');
      if (messagesContainer) {
        messagesContainer.replaceChildren();
        for (const entry of this.conversations) {
          const messageElement = document.createElement('div');
          messageElement.className = `message ${entry.sender}-message`;
          const avatar = document.createElement('div');
          avatar.className = 'message-avatar';
          avatar.textContent = entry.sender === 'user' ? '👤' : '🤖';
          const content = document.createElement('div');
          content.className = 'message-content';
          const text = document.createElement('div');
          text.className = 'message-text';
          text.textContent = entry.content;
          content.appendChild(text);
          messageElement.append(avatar, content);
          messagesContainer.appendChild(messageElement);
        }
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }
  }

  async resolveCatalogIntent(message) {
    this.lastIntent = message;
    const status = document.getElementById('navi-intent-status');
    const list = document.getElementById('navi-match-list');
    if (status) status.hidden = true;
    if (list) list.hidden = true;
    this.saveWorkflowState();

    if (!/[0-9A-Za-z]/.test(message)) {
      this.showIntentOutcome(message, 'Not resolved: no catalog match. Original intent kept.', []);
      return;
    }

    let envelope, requestedCid;
    try {
      const { invokeNativeTool } = await import('../live-tool-gateway.js');
      const trigger = document.getElementById('message-input');
      const container = trigger?.closest('.window-app-content') || document.getElementById('navi-resolution');
      const discovery = await fetch('/mcp/tools/bindings?app_id=navi');
      if (!discovery.ok) throw new Error('Catalog binding discovery is unavailable.');
      const control = (await discovery.json()).controls?.find(item => item.binding_id === 'navi.ipfs_datasets_py.query_catalog' && item.owner === 'ipfs_datasets_py');
      const payload = control?.safe_payloads?.get_from_ipfs;
      if (!control?.preferred_tool_ids?.includes('get_from_ipfs') || typeof payload?.cid !== 'string'
          || !/^bafkrei[a-z2-7]{52}$/.test(payload.cid)) throw new Error('No qualified catalog CID is configured for this owner.');
      requestedCid = payload.cid;
      envelope = await invokeNativeTool(container, 'navi', 'navi.ipfs_datasets_py.query_catalog', {
        executionMode: 'execute', toolId: 'get_from_ipfs', payload: { ...payload }, trigger
      });
    } catch (error) {
      this.showIntentOutcome(message, 'Not resolved: catalog owner unavailable. Original intent kept.', []);
      console.warn('Catalog query failed:', error?.message || error);
      return;
    }

    const payload = envelope && (envelope.output != null ? envelope.output : envelope.result);
    const outcome = String(envelope?.status || envelope?.outcome || '').toLowerCase();
    const accepted = outcome === 'ok' || outcome === 'executed' || outcome === 'success' || outcome === 'completed';
    if (!envelope || !accepted || payload == null || payload === '') {
      const reason = envelope?.error?.message || envelope?.summary || 'catalog owner unavailable';
      const unavailable = /unavailable|outage|timeout|denied|failed/i.test(String(reason));
      const statusText = unavailable
        ? 'Not resolved: catalog owner unavailable. Original intent kept.'
        : 'Not resolved: no catalog match. Original intent kept.';
      this.showIntentOutcome(message, statusText, []);
      return;
    }

    let labels;
    try {
      const record = this.decodeCatalogResult(payload);
      if (record.cid !== requestedCid || typeof record.content !== 'string'
          || await contentCidForBytes(new TextEncoder().encode(record.content)) !== requestedCid) throw new Error('Catalog bytes do not match the requested CID.');
      labels = this.extractCatalogMatches(payload).map((entry, index) => this.catalogLabel(entry, index)).filter(Boolean);
      const terms = message.toLowerCase().trim().split(/\s+/).filter(Boolean);
      labels = labels.filter(label => terms.every(term => label.toLowerCase().includes(term)));
    } catch (error) {
      this.showIntentOutcome(message, 'Not resolved: catalog result could not be verified. Original intent kept.', []);
      return;
    }
    if (labels.length > 1) {
      const folded = message.toLowerCase();
      const narrowed = labels.filter((label) => label.toLowerCase().includes(folded));
      if (narrowed.length === 1) labels = narrowed;
    }
    if (labels.length === 0) {
      this.showIntentOutcome(message, 'Not resolved: no catalog match. Original intent kept.', []);
      return;
    }
    if (labels.length > 1) {
      this.showIntentOutcome(message, 'Not resolved: ambiguous catalog targets. Choose one explicitly.', labels);
      return;
    }
    this.showIntentOutcome(message, `Matched catalog context: ${labels[0]}`, labels);
  }

  addMessage(sender, content, metadata = {}) {
    const messagesContainer = document.getElementById('conversation-messages');
    if (!messagesContainer) return;
    messagesContainer.querySelector('.welcome-message')?.remove();

    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;
    
    const isUser = sender === 'user';
    const avatar = isUser ? '👤' : '🤖';
    
    messageElement.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-text">${this.formatMessage(content)}</div>
        ${metadata.actions ? this.renderMessageActions(metadata.actions) : ''}
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
      </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store in conversation history
    this.conversations.push({
      id: Date.now(),
      sender,
      content,
      metadata,
      timestamp: Date.now()
    });
    
    // Learn from interaction
    this.learnFromInteraction(sender, content, metadata);
  }

  formatMessage(content) {
    // Convert markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  renderMessageActions(actions) {
    return `
      <div class="message-actions">
        ${actions.map(action => `
          <button class="action-btn" onclick="naviApp.executeAction('${action.type}', '${action.data}')">
            ${action.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  async processMessage(message) {
    try {
      // Show typing indicator
      this.showTyping();
      
      // Parse command or natural language
      const response = await this.generateResponse(message);
      
      // Hide typing indicator
      this.hideTyping();
      
      // Add NAVI response
      this.addMessage('navi', response.content, response.metadata);
      
      // Execute any actions
      if (response.actions) {
        await this.executeActions(response.actions);
      }
      
      // Speak response if voice is enabled
      if (this.voiceEnabled && response.speak) {
        this.speak(response.content);
      }
      
    } catch (error) {
      this.hideTyping();
      this.addMessage('navi', 'I encountered an error processing your request. Please try again.', {
        error: true
      });
      console.error('Message processing error:', error);
    }
  }

  async generateResponse(message) {
    // Check for direct commands first
    const commandMatch = this.parseCommand(message);
    if (commandMatch) {
      return await this.executeCommand(commandMatch.command, commandMatch.args);
    }
    
    // Use AI for natural language processing
    return await this.generateAIResponse(message);
  }

  parseCommand(message) {
    const words = message.toLowerCase().split(' ');
    const command = words[0];
    const args = words.slice(1);
    
    if (this.commands.has(command)) {
      return { command, args };
    }
    
    return null;
  }

  async executeCommand(command, args) {
    try {
      const commandHandler = this.commands.get(command);
      if (commandHandler) {
        return await commandHandler.handler(args);
      }
    } catch (error) {
      console.error('Command execution error:', error);
      return {
        content: `Error executing command "${command}": ${error.message}`,
        speak: true
      };
    }
  }

  async generateAIResponse(message) {
    const contextualInfo = this.buildContextualPrompt();
    const personality = this.getPersonalityPrompt();

    let response;
    let source = 'local';

    // 1) Real AI backend when the desktop exposes one.
    if (this.swissknife && typeof this.swissknife.chat === 'function') {
      try {
        const fullPrompt = `${personality}\n\nContext: ${JSON.stringify(contextualInfo)}\n\nUser message: ${message}`;
        const aiResponse = await this.swissknife.chat({
          message: fullPrompt,
          model: this.aiModel || 'gpt-4'
        });
        response = aiResponse.message || aiResponse.content || aiResponse;
        source = 'swissknife-chat';
      } catch (error) {
        console.error('AI response failed:', error);
      }
    }

    // 2) Real MCP++ backend: ipfs_accelerate_py inference through the app
    // capability gateway. The envelope reports honestly; a degraded envelope
    // carries the backend's verbatim reason and is never masked.
    if (response === undefined) {
      try {
        const { invokeDescriptorOperation } = await import('../core/mcp-descriptor-registry.js');
        const envelope = await invokeDescriptorOperation({
          descriptor_id: 'ipfs_accelerate_py',
          operation: 'run_inference_job',
          input: {
            model: this.aiModel || 'gpt-4',
            input: `${personality}\n\nUser message: ${message}`,
            max_tokens: 256
          },
          app_id: 'navi',
          desktop: this.desktop,
          execution_mode: 'confirmed'
        });
        if (envelope && envelope.status === 'ok' && envelope.output) {
          const output = envelope.output;
          response = output.text || output.result || output.response
            || (typeof output === 'string' ? output : JSON.stringify(output));
          source = `accelerate:${output.job_id || 'inference'}`;
          const jobId = output.job_id;
          if (jobId) {
            try {
              const statusEnvelope = await invokeDescriptorOperation({
                descriptor_id: 'ipfs_accelerate_py',
                operation: 'job_status',
                input: { job_id: jobId },
                app_id: 'navi',
                desktop: this.desktop
              });
              const jobOutput = statusEnvelope?.output;
              if (jobOutput && (jobOutput.text || jobOutput.result)) {
                response = jobOutput.text || jobOutput.result;
              }
            } catch (pollError) {
              console.warn('Inference job status poll failed:', pollError.message);
            }
          }
        } else {
          const reason = envelope?.error?.message || envelope?.summary || 'inference backend unavailable';
          console.warn('Accelerate inference unavailable:', reason);
        }
      } catch (error) {
        console.warn('Accelerate inference call failed:', error.message);
      }
    }

    // 3) No backend reachable: say so plainly. Local slash-commands below
    // still work; nothing canned is presented as an AI answer.
    if (response === undefined) {
      response = 'No AI backend is reachable in this session (desktop chat and the ipfs_accelerate_py inference gateway are both unavailable), so I cannot generate an AI answer right now. My local commands still work — try "help", "open <app>", "search <query>" or "monitor".';
      source = 'unavailable';
    }

    // Add contextual actions based on message content
    const actions = this.suggestContextualActions(message);

    return {
      content: typeof response === 'string' ? response : String(response),
      speak: true,
      actions: actions.length > 0 ? actions : null,
      metadata: {
        model: this.aiModel,
        personality: this.personality,
        context: contextualInfo,
        source
      }
    };
  }

  // NOTE: the old generateFallbackResponse() (canned replies with fabricated
  // CPU/memory figures) was removed in the no-mocks pass. When no AI backend
  // is reachable, generateAIResponse() says so plainly instead.

  suggestContextualActions(message) {
    const actions = [];
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('open') || lowerMessage.includes('launch')) {
      actions.push(
        { type: 'open-app', data: 'terminal', label: '🖥️ Open Terminal' },
        { type: 'open-app', data: 'file-manager', label: '📁 Open Files' },
        { type: 'open-app', data: 'settings', label: '⚙️ Open Settings' }
      );
    }
    
    if (lowerMessage.includes('system') || lowerMessage.includes('monitor')) {
      actions.push(
        { type: 'open-app', data: 'task-manager', label: '📊 Task Manager' },
        { type: 'open-app', data: 'device-manager', label: '🔧 Device Manager' },
        { type: 'system-scan', data: 'full', label: '🔍 Full System Scan' }
      );
    }
    
    if (lowerMessage.includes('file') || lowerMessage.includes('search')) {
      actions.push(
        { type: 'open-app', data: 'file-manager', label: '📁 File Manager' },
        { type: 'search-files', data: '', label: '🔍 Search Files' }
      );
    }
    
    return actions;
  }

  buildContextualPrompt() {
    return {
      activeApps: this.context.apps.length,
      recentFiles: this.context.files.length,
      p2pPeers: this.context.p2pPeers.length,
      systemHealth: 'good'
    };
  }

  getPersonalityPrompt() {
    const personalities = {
      helpful: 'Be helpful, clear, and solution-oriented',
      casual: 'Be friendly, conversational, and relaxed',
      professional: 'Be formal, precise, and business-like',
      creative: 'Be imaginative, expressive, and innovative'
    };
    
    return personalities[this.personality] || personalities.helpful;
  }

  // Command handlers
  async openApp(args) {
    const appName = args.join(' ') || 'terminal';
    
    try {
      this.desktop.launchApp(appName);
      return {
        content: `Opening ${appName}...`,
        speak: true,
        actions: [{ type: 'app-opened', data: appName }]
      };
    } catch (error) {
      return {
        content: `I couldn't open "${appName}". Available apps include: Terminal, File Manager, AI Chat, Settings, Model Browser, and more.`,
        speak: true
      };
    }
  }

  async closeApp(args) {
    const appName = args.join(' ');
    
    // This would interface with the desktop to close apps
    return {
      content: `I'd need access to the window manager to close "${appName}". You can close apps using the X button in their title bar.`,
      speak: true
    };
  }

  async showHelp(args) {
    const commands = Array.from(this.commands.entries())
      .map(([cmd, info]) => `**${cmd}**: ${info.description}`)
      .join('\n');
    
    return {
      content: `Here are my available commands:\n\n${commands}\n\nYou can also just ask me questions in natural language!`,
      speak: false
    };
  }

  async searchSystem(args) {
    const query = args.join(' ');
    
    if (!query) {
      return {
        content: 'What would you like me to search for? I can search apps, files, settings, and more.',
        speak: true
      };
    }
    
    // Perform real search across available resources
    const results = [];
    
    // Search in apps (if available)
    if (this.desktop?.apps) {
      const appMatches = Object.keys(this.desktop.apps).filter(app => 
        app.toLowerCase().includes(query.toLowerCase())
      );
      if (appMatches.length > 0) {
        results.push(`Found ${appMatches.length} app${appMatches.length > 1 ? 's' : ''} matching "${query}"`);
      }
    }
    
    // Search in localStorage for files/data
    const fileMatches = Object.keys(localStorage).filter(key => 
      key.toLowerCase().includes(query.toLowerCase())
    );
    if (fileMatches.length > 0) {
      results.push(`Found ${fileMatches.length} item${fileMatches.length > 1 ? 's' : ''} in storage containing "${query}"`);
    }
    
    // Add default message if no results
    if (results.length === 0) {
      results.push(`No results found for "${query}"`);
    }
    
    return {
      content: `Search results for "${query}":\n\n${results.join('\n')}`,
      speak: true,
      actions: [
        { type: 'open-search', data: query, label: '🔍 Open Search' }
      ]
    };
  }

  // Real browser-side signals only. CPU/network percentages are not
  // measurable from a browser; they are reported as n/a, never fabricated.
  readLocalSystemSignals() {
    const heap = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
    return {
      cpuCores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 'n/a',
      jsHeapUsedMB: heap ? Number((heap.usedJSHeapSize / 1048576).toFixed(1)) : 'n/a',
      jsHeapTotalMB: heap ? Number((heap.totalJSHeapSize / 1048576).toFixed(1)) : 'n/a',
      p2pPeers: this.p2pSystem?.peers?.size ?? 0,
      sessionUptimeMin: (typeof performance !== 'undefined')
        ? Math.floor(performance.now() / 60000)
        : 'n/a'
    };
  }

  async showSystemStatus(args) {
    const signals = this.readLocalSystemSignals();
    const uptime = typeof signals.sessionUptimeMin === 'number'
      ? `${Math.floor(signals.sessionUptimeMin / 60)}h ${signals.sessionUptimeMin % 60}m (this session)`
      : 'n/a';

    return {
      content: `**System Status (local browser signals):**
🧠 CPU cores: ${signals.cpuCores}
💾 JS heap: ${signals.jsHeapUsedMB} / ${signals.jsHeapTotalMB} MB
🌐 P2P Peers: ${signals.p2pPeers}
⏱️ Uptime: ${uptime}

CPU % and network throughput are not measurable from a browser and are not shown.`,
      speak: true,
      actions: [
        { type: 'open-app', data: 'task-manager', label: '📊 View Details' }
      ]
    };
  }

  async learnFromUser(args) {
    const preference = args.join(' ');
    
    if (preference) {
      this.learningData.set(`user_preference_${Date.now()}`, {
        type: 'preference',
        content: preference,
        timestamp: Date.now()
      });
      this.saveLearningData();
      
      return {
        content: `I've learned that you prefer: "${preference}". I'll remember this for future interactions!`,
        speak: true
      };
    }
    
    return {
      content: 'I can learn your preferences to provide better assistance. Just tell me something you\'d like me to remember!',
      speak: true,
      actions: [
        { type: 'show-learning', data: '', label: '🧠 View Learning' }
      ]
    };
  }

  async automateTask(args) {
    const task = args.join(' ');
    
    return {
      content: `I can help automate "${task}". I'll analyze the steps needed and create an automation workflow. Would you like me to proceed?`,
      speak: true,
      actions: [
        { type: 'open-app', data: 'cron', label: '⏰ Schedule Task' },
        { type: 'create-automation', data: task, label: '⚙️ Create Automation' }
      ]
    };
  }

  async analyzeContent(args) {
    const content = args.join(' ');
    
    return {
      content: `I can analyze various types of content including text, code, data, and files. What would you like me to analyze?`,
      speak: true,
      actions: [
        { type: 'open-app', data: 'ai-chat', label: '🤖 AI Analysis' },
        { type: 'upload-file', data: '', label: '📎 Upload File' }
      ]
    };
  }

  async suggestActions(args) {
    const suggestions = this.generateSmartSuggestions();
    
    return {
      content: `Based on your current context, here are some suggestions:\n\n${suggestions.join('\n')}`,
      speak: true,
      actions: suggestions.map((suggestion, index) => ({
        type: 'execute-suggestion',
        data: index.toString(),
        label: `✨ ${suggestion.split(':')[0]}`
      }))
    };
  }

  async rememberInformation(args) {
    const info = args.join(' ');
    
    if (info) {
      this.learningData.set(`memory_${Date.now()}`, {
        type: 'memory',
        content: info,
        timestamp: Date.now()
      });
      this.saveLearningData();
      
      return {
        content: `I've remembered: "${info}". I can recall this information whenever you need it.`,
        speak: true
      };
    }
    
    return {
      content: 'What would you like me to remember? I can store information for later recall.',
      speak: true
    };
  }

  generateSmartSuggestions() {
    const suggestions = [
      '🔧 System Optimization: Run system cleanup and optimize performance',
      '📊 Data Backup: Backup important files to IPFS',
      '🤖 AI Analysis: Analyze recent chat conversations for insights',
      '🔗 **P2P Tasks**: Distribute ML training across network peers',
      '📅 **Schedule Automation**: Set up recurring tasks with AI Cron'
    ];
    
    // Filter based on context
    return suggestions.slice(0, 3);
  }

  executeQuickCommand(command) {
    const commands = {
      'help': () => this.executeCommand('help', []),
      'monitor': () => this.executeCommand('monitor', []),
      'suggest': () => this.executeCommand('suggest', []),
      'automate': () => this.executeCommand('automate', [])
    };
    
    if (commands[command]) {
      commands[command]().then(response => {
        this.addMessage('navi', response.content, response.metadata);
        if (response.speak && this.voiceEnabled) {
          this.speak(response.content);
        }
      });
    }
  }

  async executeAction(type, data) {
    switch (type) {
      case 'open-app':
        this.desktop.launchApp(data);
        break;
      case 'search-files':
        this.desktop.launchApp('file-manager');
        break;
      case 'system-scan':
        this.desktop.launchApp('device-manager');
        break;
      case 'show-learning':
        this.showLearningPanel();
        break;
      default:
        console.log('Executing action:', type, data);
    }
  }

  // Voice interaction methods
  toggleVoice() {
    this.voiceEnabled = !this.voiceEnabled;
    this.updateVoiceUI();
    
    const message = this.voiceEnabled ? 'Voice enabled' : 'Voice disabled';
    this.addMessage('navi', message, { system: true });
  }

  toggleListening() {
    if (!this.voiceEnabled || !this.speechRecognition) {
      this.addMessage('navi', 'Voice recognition is not available.', { system: true });
      return;
    }
    
    if (this.isListening) {
      this.speechRecognition.stop();
    } else {
      this.speechRecognition.start();
      this.isListening = true;
      this.updateVoiceUI();
    }
  }

  handleVoiceInput(transcript) {
    this.addMessage('user', transcript, { voice: true });
    this.processMessage(transcript);
  }

  speak(text) {
    if (!this.voiceEnabled || !this.speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    this.speechSynthesis.speak(utterance);
  }

  updateVoiceUI() {
    const voiceToggle = document.getElementById('toggle-voice');
    const voiceBtn = document.getElementById('voice-input-btn');
    const voiceViz = document.getElementById('voice-visualization');
    const avatar = document.querySelector('.avatar-status');
    
    if (voiceToggle) {
      voiceToggle.classList.toggle('active', this.voiceEnabled);
    }
    
    if (voiceBtn) {
      voiceBtn.classList.toggle('listening', this.isListening);
    }
    
    if (voiceViz) {
      voiceViz.classList.toggle('active', this.isListening);
    }
    
    if (avatar) {
      avatar.classList.toggle('voice-enabled', this.voiceEnabled);
    }
  }

  // Context awareness methods
  async loadInitialContext() {
    await this.updateContext();
    this.updateContextUI();
  }

  async updateContext() {
    // Update context from various sources
    this.context.apps = this.getActiveApps();
    this.context.files = this.getRecentFiles();
    this.context.p2pPeers = this.getP2PPeers();
    this.context.recentActions = this.getRecentActions();
    
    // Update system health
    this.context.systemHealth = await this.getSystemHealth();
  }

  getActiveApps() {
    // Get list of active desktop applications
    const windows = document.querySelectorAll('.window');
    return Array.from(windows).map(window => ({
      name: window.querySelector('.window-title')?.textContent || 'Unknown',
      id: window.id,
      active: window.classList.contains('active')
    }));
  }

  getRecentFiles() {
    // Honest local recency: derive from learning data recorded in this
    // browser, or report none. Never fabricate file entries.
    try {
      const names = [];
      for (const [, entry] of this.learningData) {
        if (entry && entry.type === 'file' && entry.content) names.push(entry.content);
        if (names.length >= 5) break;
      }
      return names.map(name => ({ name, path: '', modified: Date.now() }));
    } catch {
      return [];
    }
  }

  getP2PPeers() {
    if (!this.p2pSystem?.peers) return [];
    
    return Array.from(this.p2pSystem.peers.values()).map(peer => ({
      id: peer.id,
      connected: peer.connected,
      capabilities: peer.capabilities || []
    }));
  }

  getRecentActions() {
    // Track recent user actions
    return this.conversations.slice(-5).map(conv => ({
      type: 'conversation',
      content: conv.content.slice(0, 50) + '...',
      timestamp: conv.timestamp
    }));
  }

  async getSystemHealth() {
    // Real local signals only; unmeasurable fields are n/a, never random.
    const signals = this.readLocalSystemSignals();
    return {
      cpuCores: signals.cpuCores,
      jsHeapUsedMB: signals.jsHeapUsedMB,
      jsHeapTotalMB: signals.jsHeapTotalMB,
      p2pPeers: signals.p2pPeers,
      status: 'local-signals',
      alerts: []
    };
  }

  updateContextUI() {
    // Update active apps
    const appsContainer = document.getElementById('active-apps-list');
    if (appsContainer) {
      appsContainer.innerHTML = this.context.apps.slice(0, 3).map(app => `
        <div class="context-item">
          <span class="item-icon">🖥️</span>
          <span class="item-text">${app.name}</span>
        </div>
      `).join('') || '<div class="context-empty">No active apps</div>';
    }
    
    // Update recent files
    const filesContainer = document.getElementById('recent-files-list');
    if (filesContainer) {
      filesContainer.innerHTML = this.context.files.slice(0, 3).map(file => `
        <div class="context-item">
          <span class="item-icon">📄</span>
          <span class="item-text">${file.name}</span>
        </div>
      `).join('') || '<div class="context-empty">No recent files</div>';
    }
    
    // Update P2P status
    const p2pContainer = document.getElementById('p2p-status-list');
    if (p2pContainer) {
      const peerCount = this.context.p2pPeers.length;
      p2pContainer.innerHTML = `
        <div class="context-item">
          <span class="item-icon">🔗</span>
          <span class="item-text">${peerCount} peers connected</span>
        </div>
      `;
    }
    
    // Update system health
    const healthContainer = document.getElementById('system-health-list');
    if (healthContainer) {
      healthContainer.innerHTML = `
        <div class="context-item">
          <span class="item-icon">💚</span>
          <span class="item-text">Local signals only</span>
        </div>
      `;

    }
    
    // Update suggestions
    const suggestionsContainer = document.getElementById('suggestions-list');
    if (suggestionsContainer) {
      const suggestions = this.generateSmartSuggestions().slice(0, 2);
      suggestionsContainer.innerHTML = suggestions.map(suggestion => `
        <div class="context-item clickable" onclick="naviApp.executeSuggestion('${suggestion}')">
          <span class="item-icon">💡</span>
          <span class="item-text">${suggestion.split(':')[0]}</span>
        </div>
      `).join('') || '<div class="context-empty">No suggestions</div>';
    }
  }

  // Learning and adaptation methods
  learnFromInteraction(sender, content, metadata) {
    if (sender === 'user') {
      const interaction = {
        type: 'user_input',
        content: content,
        timestamp: Date.now(),
        context: { ...this.context }
      };
      
      this.learningData.set(`interaction_${Date.now()}`, interaction);
      this.saveLearningData();
    }
  }

  loadLearningData() {
    try {
      const saved = localStorage.getItem('navi-learning-data');
      if (saved) {
        const data = JSON.parse(saved);
        this.learningData = new Map(data);
      }
    } catch (error) {
      console.error('Error loading learning data:', error);
    }
  }

  saveLearningData() {
    try {
      const data = Array.from(this.learningData.entries());
      localStorage.setItem('navi-learning-data', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving learning data:', error);
    }
  }

  showLearningPanel() {
    const panel = document.getElementById('learning-panel');
    if (panel) {
      panel.style.display = 'block';
      this.updateLearningStats();
    }
  }

  hideLearningPanel() {
    const panel = document.getElementById('learning-panel');
    if (panel) {
      panel.style.display = 'none';
    }
  }

  updateLearningStats() {
    const interactions = Array.from(this.learningData.values()).filter(d => d.type === 'user_input');
    const preferences = Array.from(this.learningData.values()).filter(d => d.type === 'preference');
    
    // Calculate real success rate from interactions
    const successfulInteractions = interactions.filter(i => i.successful !== false).length;
    const successRate = interactions.length > 0 
      ? Math.round((successfulInteractions / interactions.length) * 100) + '%'
      : 'N/A';
    
    const elements = {
      'interaction-count': interactions.length,
      'pattern-count': preferences.length,
      'success-rate': successRate
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
    
    // Update preferences list
    const preferencesList = document.getElementById('preferences-list');
    if (preferencesList) {
      preferencesList.innerHTML = preferences.slice(0, 5).map(pref => `
        <div class="preference-item">
          <span class="preference-text">${pref.content}</span>
          <span class="preference-date">${new Date(pref.timestamp).toLocaleDateString()}</span>
        </div>
      `).join('') || '<div class="no-preferences">No learned preferences yet</div>';
    }
  }

  // P2P integration methods
  setupP2PIntelligence() {
    if (!this.p2pSystem) return;
    
    this.p2pSystem.on('peer:connected', () => {
      this.updateContext();
      this.updateContextUI();
    });
    
    this.p2pSystem.on('peer:disconnected', () => {
      this.updateContext();
      this.updateContextUI();
    });
    
    this.p2pSystem.on('intelligence:request', (request) => {
      this.handleP2PIntelligenceRequest(request);
    });
  }

  handleP2PIntelligenceRequest(request) {
    // Handle requests for AI assistance from P2P peers
    console.log('P2P Intelligence request:', request);
  }

  // UI utility methods
  showTyping() {
    const messagesContainer = document.getElementById('conversation-messages');
    if (!messagesContainer) return;
    
    const typingElement = document.createElement('div');
    typingElement.id = 'typing-indicator';
    typingElement.className = 'message navi-message typing';
    typingElement.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(typingElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  hideTyping() {
    const typingElement = document.getElementById('typing-indicator');
    if (typingElement) {
      typingElement.remove();
    }
  }

  showSettings() {
    const host = document.getElementById('conversation-messages') || document.querySelector('.navi-app, .navi-container');
    if (!host) return;
    let note = document.getElementById('navi-settings-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'navi-settings-note';
      host.prepend(note);
    }
    note.textContent = 'NAVI settings stay on this desktop. No backend call was made.';
  }

  clearConversation() {
    if (confirm('Clear conversation history?')) {
      this.conversations = [];
      const messagesContainer = document.getElementById('conversation-messages');
      if (messagesContainer) {
        messagesContainer.innerHTML = `
          <div class="welcome-message">
            <div class="message navi-message">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <div class="message-text">
                  Conversation cleared! How can I help you today?
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
  }

  toggleContextPanel() {
    const contextContent = document.getElementById('context-content');
    const toggleBtn = document.getElementById('toggle-context');
    
    if (contextContent && toggleBtn) {
      const isVisible = contextContent.style.display !== 'none';
      contextContent.style.display = isVisible ? 'none' : 'block';
      toggleBtn.textContent = isVisible ? '👁️' : '🙈';
    }
  }

  saveSettings() {
    const settings = {
      personality: this.personality,
      aiModel: this.aiModel,
      voiceEnabled: this.voiceEnabled
    };
    
    localStorage.setItem('navi-settings', JSON.stringify(settings));
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('navi-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.personality = settings.personality || 'helpful';
        this.aiModel = settings.aiModel || 'gpt-4';
        this.voiceEnabled = settings.voiceEnabled !== false;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  startContextMonitoring() {
    // Update context every 30 seconds
    setInterval(() => {
      this.updateContext();
      this.updateContextUI();
    }, 30000);
  }

  startPeriodicUpdates() {
    // Update UI every 5 seconds
    setInterval(() => {
      this.updateContextUI();
    }, 5000);
  }

  onDestroy() {
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
    
    if (this.p2pSystem) {
      this.p2pSystem.off('peer:connected');
      this.p2pSystem.off('peer:disconnected');
      this.p2pSystem.off('intelligence:request');
    }
  }
}

// Export for global access
if (typeof window !== 'undefined') {
  window.NAVIApp = NAVIApp;
  window.createNAVIApp = (desktop) => new NAVIApp(desktop);
}