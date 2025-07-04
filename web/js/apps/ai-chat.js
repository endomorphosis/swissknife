/**
 * AI Chat App for SwissKnife Web Desktop
 */

window.AIChatApp = class AIChatApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentConversation = null;
    this.conversations = [];
    this.selectedModel = 'gpt-4';
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadConversations();
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
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="claude-3">Claude 3</option>
            </select>
          </div>
        </div>
        <div class="chat-main">
          <div class="chat-messages" id="chat-messages">
            <div class="welcome-message">
              <h3>Welcome to SwissKnife AI Chat</h3>
              <p>Start a new conversation or select an existing one from the sidebar.</p>
            </div>
          </div>
          <div class="chat-input-container">
            <div class="chat-input-toolbar">
              <button class="tool-btn" id="attach-btn" title="Attach File">📎</button>
              <button class="tool-btn" id="voice-btn" title="Voice Input">🎤</button>
              <button class="tool-btn" id="code-btn" title="Code Mode">💻</button>
            </div>
            <div class="chat-input-wrapper">
              <textarea id="chat-input" placeholder="Type your message... (Shift+Enter for new line, Enter to send)" rows="3"></textarea>
              <button id="send-btn" class="send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'AI Chat',
      content: content,
      width: 800,
      height: 600,
      resizable: true
    });

    this.setupEventListeners(window);
    this.populateConversationList(window);
    
    return window;
  }

  setupEventListeners(window) {
    const chatInput = window.querySelector('#chat-input');
    const sendBtn = window.querySelector('#send-btn');
    const newChatBtn = window.querySelector('.new-chat-btn');
    const modelSelect = window.querySelector('#model-select');

    // Send message on Enter (but allow Shift+Enter for new lines)
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(window);
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage(window));
    newChatBtn.addEventListener('click', () => this.startNewConversation(window));
    
    modelSelect.addEventListener('change', (e) => {
      this.selectedModel = e.target.value;
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });
  }

  async sendMessage(window) {
    const chatInput = window.querySelector('#chat-input');
    const message = chatInput.value.trim();
    
    if (!message) return;

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Add user message to chat
    this.addMessageToChat(window, message, 'user');

    // Show typing indicator
    const typingIndicator = this.addTypingIndicator(window);

    try {
      // Send to SwissKnife AI
      const response = await this.swissknife.chat({
        message: message,
        model: this.selectedModel,
        conversationId: this.currentConversation?.id
      });

      // Remove typing indicator
      typingIndicator.remove();

      // Add AI response
      this.addMessageToChat(window, response.message, 'assistant');

      // Update conversation
      if (response.conversationId) {
        this.currentConversation = {
          id: response.conversationId,
          title: this.generateConversationTitle(message),
          messages: [...(this.currentConversation?.messages || []), 
                    { role: 'user', content: message },
                    { role: 'assistant', content: response.message }]
        };
        await this.saveConversation(this.currentConversation);
        this.populateConversationList(window);
      }

    } catch (error) {
      typingIndicator.remove();
      this.addMessageToChat(window, `Error: ${error.message}`, 'error');
    }
  }

  addMessageToChat(window, message, role) {
    const chatMessages = window.querySelector('#chat-messages');
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

  addTypingIndicator(window) {
    const chatMessages = window.querySelector('#chat-messages');
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

  startNewConversation(window) {
    this.currentConversation = null;
    const chatMessages = window.querySelector('#chat-messages');
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <h3>New Conversation</h3>
        <p>What would you like to talk about?</p>
      </div>
    `;
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

  populateConversationList(window) {
    const conversationList = window.querySelector('.conversation-list');
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
          this.loadConversation(window, conversation);
        }
      });
      
      const deleteBtn = item.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteConversation(window, conversation.id);
      });
      
      conversationList.appendChild(item);
    });
  }

  loadConversation(window, conversation) {
    this.currentConversation = conversation;
    const chatMessages = window.querySelector('#chat-messages');
    chatMessages.innerHTML = '';
    
    conversation.messages.forEach(message => {
      this.addMessageToChat(window, message.content, message.role);
    });
    
    this.populateConversationList(window);
  }

  async deleteConversation(window, conversationId) {
    this.conversations = this.conversations.filter(c => c.id !== conversationId);
    await this.saveConversation();
    
    if (this.currentConversation?.id === conversationId) {
      this.startNewConversation(window);
    }
    
    this.populateConversationList(window);
  }
}
