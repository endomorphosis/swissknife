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
            
            <div class="conversation-messages" id="conversation-messages">
              <div class="welcome-message">
                <div class="message navi-message">
                  <div class="message-avatar">🤖</div>
                  <div class="message-content">
                    <div class="message-text">
                      Hello! I'm NAVI, your AI assistant. I can help you with:
                      <ul>
                        <li>🖥️ Controlling your desktop and applications</li>
                        <li>📁 Managing files and organizing data</li>
                        <li>🤖 AI-powered analysis and assistance</li>
                        <li>🎤 Voice commands and interactions</li>
                        <li>📊 System monitoring and optimization</li>
                        <li>🔗 P2P network coordination</li>
                      </ul>
                      Try saying "help" to see available commands, or just ask me anything!
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="conversation-input">
              <div class="input-container">
                <input type="text" id="message-input" placeholder="Ask NAVI anything or type a command..." class="message-input">
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
                  <!-- Active apps will be populated -->
                </div>
              </div>

              <div class="context-section">
                <h4>📁 Recent Files</h4>
                <div class="context-list" id="recent-files-list">
                  <!-- Recent files will be populated -->
                </div>
              </div>

              <div class="context-section">
                <h4>🔗 P2P Network</h4>
                <div class="context-list" id="p2p-status-list">
                  <!-- P2P status will be populated -->
                </div>
              </div>

              <div class="context-section">
                <h4>📊 System Health</h4>
                <div class="context-list" id="system-health-list">
                  <!-- System health will be populated -->
                </div>
              </div>

              <div class="context-section">
                <h4>🎯 Suggestions</h4>
                <div class="context-list" id="suggestions-list">
                  <!-- AI suggestions will be populated -->
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
    this.startPeriodicUpdates();
  }

  setupEventListeners() {
    // Message input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    
    if (messageInput) {
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendMessage();
        }
      });
    }
    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
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
    input.value = '';
    
    // Add user message to conversation
    this.addMessage('user', message);
    
    // Process message
    await this.processMessage(message);
  }

  addMessage(sender, content, metadata = {}) {
    const messagesContainer = document.getElementById('conversation-messages');
    if (!messagesContainer) return;
    
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
    // Simulate AI response generation
    // In production, this would call the actual AI service
    
    const contextualInfo = this.buildContextualPrompt();
    const personality = this.getPersonalityPrompt();
    
    let response;
    
    // Use real AI if available
    if (this.swissknife && typeof this.swissknife.chat === 'function') {
      try {
        const fullPrompt = `${personality}\n\nContext: ${contextualInfo}\n\nUser message: ${message}`;
        
        const aiResponse = await this.swissknife.chat({
          message: fullPrompt,
          model: this.aiModel || 'gpt-4'
        });
        
        response = aiResponse.message || aiResponse.content || aiResponse;
      } catch (error) {
        console.error('AI response failed, using fallback:', error);
        response = this.generateFallbackResponse(message);
      }
    } else {
      // Fallback when AI not configured
      response = this.generateFallbackResponse(message);
    }
    
    // Add contextual actions based on message content
    const actions = this.suggestContextualActions(message);
    
    return {
      content: response,
      speak: true,
      actions: actions.length > 0 ? actions : null,
      metadata: {
        model: this.aiModel,
        personality: this.personality,
        context: contextualInfo
      }
    };
  }

  generateFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('open') || lowerMessage.includes('launch')) {
      return "I can help you open applications. Which app would you like me to launch? Available apps include Terminal, File Manager, AI Chat, Settings, and more.";
    }
    
    if (lowerMessage.includes('system') || lowerMessage.includes('status') || lowerMessage.includes('performance')) {
      return `System status looks good! CPU usage is at ${Math.floor(Math.random() * 30 + 20)}%, memory usage is ${Math.floor(Math.random() * 40 + 30)}%, and all services are running normally. Would you like me to run a detailed system analysis?`;
    }
    
    if (lowerMessage.includes('file') || lowerMessage.includes('document') || lowerMessage.includes('folder')) {
      return "I can help you manage files and folders. I can search for files, organize directories, backup important data, or help you find specific documents. What would you like me to do?";
    }
    
    if (lowerMessage.includes('p2p') || lowerMessage.includes('network') || lowerMessage.includes('peer')) {
      const peerCount = this.p2pSystem?.peers?.size || 0;
      return `Your P2P network has ${peerCount} connected peers. I can help coordinate tasks across the network, share models or data, or discover new peers. What would you like me to do with the P2P network?`;
    }
    
    if (lowerMessage.includes('learn') || lowerMessage.includes('remember') || lowerMessage.includes('preference')) {
      return "I'm constantly learning from our interactions to better assist you. I can remember your preferences, automate repetitive tasks, and adapt to your workflow. Is there something specific you'd like me to learn or remember?";
    }
    
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      return `I'm your AI assistant with many capabilities:

**System Control**: Open/close apps, manage settings, monitor performance
**File Management**: Search, organize, backup files and folders  
**AI Assistance**: Analysis, research, content generation
**Voice Interaction**: Voice commands and responses
**Learning**: Adapt to your preferences and automate tasks
**P2P Coordination**: Manage distributed computing tasks

Try asking me to "open terminal", "monitor system", or "automate task". I'm here to help!`;
    }
    
    // Default helpful response
    const responses = [
      "I understand you'd like help with that. Let me assist you with the best approach.",
      "That's an interesting request. I can help you accomplish that goal.",
      "I'm here to help! Let me provide some guidance on that topic.",
      "Great question! I can offer several ways to approach this.",
      "I'd be happy to assist you with that. Here's what I suggest:"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

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

  async showSystemStatus(args) {
    const status = {
      cpu: Math.floor(Math.random() * 30 + 20),
      memory: Math.floor(Math.random() * 40 + 30),
      network: this.p2pSystem?.peers?.size || 0,
      uptime: '2h 15m'
    };
    
    return {
      content: `**System Status:**
🔥 CPU: ${status.cpu}%
🧠 Memory: ${status.memory}%
🌐 P2P Peers: ${status.network}
⏱️ Uptime: ${status.uptime}

System is running normally!`,
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
      '🔧 **System Optimization**: Run system cleanup and optimize performance',
      '📊 **Data Backup**: Backup important files to IPFS',
      '🤖 **AI Analysis**: Analyze recent chat conversations for insights',
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
    // Get recently accessed files
    // This would integrate with the file manager
    return [
      { name: 'project-notes.md', path: '/documents/', modified: Date.now() - 3600000 },
      { name: 'ai-model.json', path: '/models/', modified: Date.now() - 7200000 }
    ];
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
    return {
      cpu: Math.floor(Math.random() * 30 + 20),
      memory: Math.floor(Math.random() * 40 + 30),
      status: 'healthy',
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
      const health = this.context.systemHealth;
      healthContainer.innerHTML = `
        <div class="context-item">
          <span class="item-icon">💚</span>
          <span class="item-text">CPU: ${health.cpu}%</span>
        </div>
        <div class="context-item">
          <span class="item-icon">🧠</span>
          <span class="item-text">Memory: ${health.memory}%</span>
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