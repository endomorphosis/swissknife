/**
 * AI Chat App for SwissKnife Web Desktop
 */

export class AIChatApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentConversation = null;
    this.conversations = [];
    this.selectedModel = 'gpt-4';
  }

  async initialize(contentElement) {
    this.contentElement = contentElement;
    this.swissknife = this.desktop.swissknife;
    await this.loadConversations();
    
    // Initialize with a default conversation if none exists
    if (!this.currentConversation) {
      this.startNewConversation(this.contentElement);
    }

    // Populate and update model status after content is rendered
    this.populateModelSelector(this.contentElement);
    this.updateModelStatus(this.contentElement);
  }

  populateModelSelector(containerElement) {
    const modelSelect = containerElement.querySelector('#model-select');
    if (!modelSelect) {
        console.error('AIChatApp: #model-select element not found in containerElement.');
        return;
    }
    modelSelect.innerHTML = '';
    if (this.swissknife && this.swissknife.isSwissKnifeReady) {
      try {
        const models = this.swissknife.getAvailableModels(); // Fixed: Removed double swissknife
        if (models && models.length > 0) {
          // Check for user's default model first
          const defaultModelId = localStorage.getItem('swissknife_default_model');
          if (defaultModelId && models.find(m => m.id === defaultModelId)) {
            this.selectedModel = defaultModelId;
          } else {
            this.selectedModel = models[0].id;
          }
        }
      } catch (error) {
        console.warn('AIChatApp: Could not get available models:', error);
      }
    }
  }

  createWindow() {
    const content = `
      <div class="ai-chat-container">
        <div class="chat-sidebar">
          <div class="chat-header">
            <h3>Conversations</h3>
            <button class="new-chat-btn" title="New Chat">+</button>
          </div>
          <div class="conversation-list">
            <!-- Conversations will be populated here -->
          </div>
          <div class="model-selector">
            <label for="model-select">Model:</label>
            <select id="model-select">
              <!-- Models will be populated dynamically -->
            </select>
            <div class="model-status" id="model-status">
              <span id="model-status-indicator">🔄</span>
              <span id="model-status-text">Loading...</span>
            </div>
          </div>
        </div>
        <div class="chat-main">
          <div class="chat-messages" id="chat-messages">
            <div class="welcome-message">
              <h3>Welcome to SwissKnife AI Chat</h3>
              <p>Start a new conversation or select an existing one from the sidebar.</p>
            </div>
          </div>
          <div class="chat-input-container">          <div class="chat-input-toolbar">
            <button class="tool-btn" id="attach-btn" title="Attach File">📎</button>
            <button class="tool-btn" id="voice-btn" title="Voice Input">🎤</button>
            <button class="tool-btn" id="code-btn" title="Code Mode">💻</button>
            <button class="tool-btn" id="api-key-btn" title="Configure API Keys">🔑</button>
          </div>
            <div class="chat-input-wrapper">
              <textarea id="chat-input" placeholder="Type your message... (Shift+Enter for new line, Enter to send)" rows="3"></textarea>
              <button id="send-btn" class="send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    return content;
  }

  setupEventListeners(containerElement) {
    const chatInput = containerElement.querySelector('#chat-input');
    const sendBtn = containerElement.querySelector('#send-btn');
    const newChatBtn = containerElement.querySelector('.new-chat-btn');
    const modelSelect = containerElement.querySelector('#model-select');
    const apiKeyBtn = containerElement.querySelector('#api-key-btn');

    // Send message on Enter (but allow Shift+Enter for new lines)
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(containerElement);
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage(containerElement));
    newChatBtn.addEventListener('click', () => this.startNewConversation(containerElement));
    
    modelSelect.addEventListener('change', (e) => {
      this.selectedModel = e.target.value;
      this.updateModelStatus(containerElement);
    });

    // API Key button
    apiKeyBtn.addEventListener('click', () => {
      if (this.desktop && this.desktop.openApp) {
        this.desktop.openApp('api-keys');
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });

    // Update send button state
    const updateSendButton = () => {
      const hasText = chatInput.value.trim().length > 0;
      const isReady = this.swissknife && this.swissknife.isSwissKnifeReady;
      sendBtn.disabled = !hasText || !isReady;
    };

    chatInput.addEventListener('input', updateSendButton);
    updateSendButton();

    // Periodically check if SwissKnife becomes ready
    const checkReadiness = () => {
      updateSendButton();
      if (!this.swissknife || !this.swissknife.isSwissKnifeReady) {
        setTimeout(checkReadiness, 1000);
      }
    };
    checkReadiness();
  }

  async sendMessage(containerElement) {
    const chatInput = containerElement.querySelector('#chat-input');
    const message = chatInput.value.trim();
    
    if (!message) return;

    // Check if SwissKnife is ready
    if (!this.swissknife || !this.swissknife.isSwissKnifeReady) {
      this.addMessageToChat(containerElement, 'SwissKnife AI is still initializing. Please wait a moment and try again.', 'error');
      return;
    }

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Add user message to chat
    this.addMessageToChat(containerElement, message, 'user');

    // Show typing indicator
    const typingIndicator = this.addTypingIndicator(containerElement);

    try {
      // Send to SwissKnife AI using the correct API
      const response = await this.swissknife.swissknife.chat(message);

      // Remove typing indicator
      typingIndicator.remove();

      if (response.success) {
        // Add AI response
        const responseText = response.response.content || response.response;
        this.addMessageToChat(containerElement, responseText, 'assistant');

        // Update conversation
        if (!this.currentConversation) {
          this.currentConversation = {
            id: Date.now().toString(),
            title: this.generateConversationTitle(message),
            messages: [],
            createdAt: new Date().toISOString()
          };
        }

        this.currentConversation.messages.push(
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
        );
        
        await this.saveConversation(this.currentConversation);
        this.populateConversationList(containerElement);
      } else {
        this.addMessageToChat(containerElement, `Error: ${response.error}`, 'error');
      }

    } catch (error) {
      typingIndicator.remove();
      console.error('AI Chat error:', error);
      this.addMessageToChat(containerElement, `Error: ${error.message}`, 'error');
    }
  }

  addMessageToChat(containerElement, message, role) {
    const chatMessages = containerElement.querySelector('#chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚠️';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    if (role === 'assistant' && message.includes('```')) {
      // Handle code blocks
      content.innerHTML = this.formatCodeBlocks(message);
    } else {
      content.textContent = message;
    }
    
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = new Date().toLocaleTimeString();
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messageDiv.appendChild(timestamp);
    
    // Remove welcome message if present
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv;
  }

  addTypingIndicator(containerElement) {
    const chatMessages = containerElement.querySelector('#chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant-message typing';
    typingDiv.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return typingDiv;
  }

  formatCodeBlocks(text) {
    return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
      return `<pre><code class="language-${language || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  startNewConversation(containerElement) {
    this.currentConversation = null;
    
    // Only update DOM if containerElement is provided and chat-messages exists
    if (containerElement) {
      const chatMessages = containerElement.querySelector('#chat-messages');
      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="welcome-message">
            <h3>New Conversation</h3>
            <p>What would you like to talk about?</p>
          </div>
        `;
      }
    }
  }

  generateConversationTitle(firstMessage) {
    // Generate a title from the first message
    const words = firstMessage.split(' ').slice(0, 5);
    return words.join(' ') + (firstMessage.split(' ').length > 5 ? '...' : '');
  }

  async loadConversations() {
    try {
      const stored = localStorage.getItem('swissknife_conversations');
      this.conversations = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load conversations:', error);
      this.conversations = [];
    }
  }

  async saveConversation(conversation) {
    const existingIndex = this.conversations.findIndex(c => c.id === conversation.id);
    if (existingIndex >= 0) {
      this.conversations[existingIndex] = conversation;
    } else {
      this.conversations.unshift(conversation);
    }
    
    // Keep only the last 50 conversations
    this.conversations = this.conversations.slice(0, 50);
    
    try {
      localStorage.setItem('swissknife_conversations', JSON.stringify(this.conversations));
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }

  populateConversationList(containerElement) {
    const conversationList = containerElement.querySelector('.conversation-list');
    conversationList.innerHTML = '';
    
    this.conversations.forEach(conversation => {
      const item = document.createElement('div');
      item.className = 'conversation-item';
      if (this.currentConversation?.id === conversation.id) {
        item.classList.add('active');
      }
      
      item.innerHTML = `
        <div class="conversation-title">${conversation.title}</div>
        <div class="conversation-preview">${conversation.messages[conversation.messages.length - 1]?.content?.substring(0, 50) || ''}...</div>
        <div class="conversation-actions">
          <button class="delete-btn" title="Delete">🗑️</button>
        </div>
      `;
      
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-btn')) {
          this.loadConversation(containerElement, conversation);
        }
      });
      
      const deleteBtn = item.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteConversation(containerElement, conversation.id);
      });
      
      conversationList.appendChild(item);
    });
  }

  loadConversation(containerElement, conversation) {
    this.currentConversation = conversation;
    const chatMessages = containerElement.querySelector('#chat-messages');
    chatMessages.innerHTML = '';
    
    conversation.messages.forEach(message => {
      this.addMessageToChat(containerElement, message.content, message.role);
    });
    
    this.populateConversationList(containerElement);
  }

  async deleteConversation(containerElement, conversationId) {
    this.conversations = this.conversations.filter(c => c.id !== conversationId);
    
    // Save the updated conversations list
    try {
      localStorage.setItem('swissknife_conversations', JSON.stringify(this.conversations));
    } catch (error) {
      console.error('Failed to save conversations after deletion:', error);
    }
    
    if (this.currentConversation?.id === conversationId) {
      this.startNewConversation(window);
    }
    
    this.populateConversationList(window);
  }

  populateModelSelector(containerElement) {
    const modelSelect = containerElement.querySelector('#model-select');
    if (!modelSelect) {
        console.error('AIChatApp: #model-select element not found in containerElement.');
        return;
    }
    modelSelect.innerHTML = '';

    if (this.swissknife && this.swissknife.isSwissKnifeReady) {
      try {
        const models = this.swissknife.getAvailableModels(); // Fixed: Removed double swissknife
        const defaultModel = localStorage.getItem('swissknife_default_model');
        
        if (models && models.length > 0) {
          models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.provider})`;
            if (model.source === 'api') {
              const hasKey = localStorage.getItem(`swissknife_${model.provider.toLowerCase()}_key`);
              if (!hasKey) {
                option.textContent += ' - needs API key';
                option.disabled = true;
              }
            }
            if (defaultModel === model.id) {
              option.selected = true;
              this.selectedModel = model.id;
            }
            modelSelect.appendChild(option);
          });
        } else {
          const option = document.createElement('option');
          option.textContent = 'No models available';
          option.disabled = true;
          modelSelect.appendChild(option);
        }
      } catch (error) {
        console.error('AIChatApp: Failed to populate model selector:', error);
        const option = document.createElement('option');
        option.textContent = 'Error loading models';
        option.disabled = true;
        modelSelect.appendChild(option);
      }
    } else {
      const option = document.createElement('option');
      option.textContent = 'Initializing...';
      option.disabled = true;
      modelSelect.appendChild(option);
    }
  }

  updateModelStatus(containerElement) {
    const statusIndicator = containerElement.querySelector('#model-status-indicator');
    const statusText = containerElement.querySelector('#model-status-text');
    
    if (!statusIndicator || !statusText) {
        console.error('AIChatApp: Model status elements not found in containerElement.');
        return;
    }

    if (this.swissknife && this.swissknife.isSwissKnifeReady) {
      statusIndicator.textContent = '✅';
      statusText.textContent = 'Ready';
      
      // Check API key for selected model
      if (this.selectedModel) {
        try {
          const models = this.swissknife.getAvailableModels(); // Fixed: Removed double swissknife
          const model = models.find(m => m.id === this.selectedModel);
          if (model && model.source === 'api') {
            const hasKey = localStorage.getItem(`swissknife_${model.provider.toLowerCase()}_key`);
            if (!hasKey) {
              statusIndicator.textContent = '⚠️';
              statusText.textContent = 'API key required';
            }
          }
        } catch (error) {
          console.warn('AIChatApp: Could not check API key status:', error);
        }
      }
    } else {
      statusIndicator.textContent = '🔄';
      statusText.textContent = 'Initializing...';
      
      // Retry after a delay
      setTimeout(() => {
        this.updateModelStatus(containerElement);
        this.populateModelSelector(containerElement);
      }, 2000);
    }
  }
}

// Also assign to window for global access
if (typeof window !== 'undefined') {
  window.AIChatApp = AIChatApp;
}

export default AIChatApp;
