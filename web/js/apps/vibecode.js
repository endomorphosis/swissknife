/**
 * VibeCode App - Fixed version with working functionality
 * Simplified but functional AI-Powered Streamlit Development Environment
 */

class VibeCodeApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = desktop?.swissknife || null;
    
    // Core configuration  
    this.currentFile = null;
    this.recentFiles = [];
    this.language = 'python';
    this.theme = 'dark';
    this.editorMode = 'split';
    this.fontSize = 14;
    
    // AI features
    this.aiAssistEnabled = true;
    this.isGenerating = false;
    
    console.log('🎯 VibeCode initialized successfully');
  }

  async initialize() {
    console.log('🎯 Initializing VibeCode...');
    try {
      return this;
    } catch (error) {
      console.error('❌ VibeCode initialization failed:', error);
      return this;
    }
  }

  getDefaultStreamlitCode() {
    return `import streamlit as st

st.title("Welcome to VibeCode! 🎯")
st.markdown("### AI-Powered Streamlit Development Environment")

# Basic Streamlit components
name = st.text_input("What's your name?")
if name:
    st.write(f"Hello, {name}! 👋")

# Data visualization example
import pandas as pd
import numpy as np

data = pd.DataFrame({
    'x': np.random.randn(100),
    'y': np.random.randn(100)
})

st.line_chart(data)

st.markdown("Built with ❤️ using VibeCode - The AI-Powered Streamlit IDE")`;
  }

  async render() {
    console.log('🎯 Rendering VibeCode app...');
    const currentCode = this.currentFile ? this.currentFile.content : this.getDefaultStreamlitCode();
    
    return `
      <div class="vibecode-container" data-theme="dark">
        <style>
          .vibecode-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #1e1e1e;
            color: #ffffff;
            font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
          }
          
          .vibecode-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            background: #252526;
            border-bottom: 1px solid #3e3e42;
            min-height: 50px;
          }
          
          .header-left, .header-right {
            display: flex;
            gap: 0.5rem;
            align-items: center;
          }
          
          .vibe-btn {
            padding: 0.5rem 1rem;
            background: #3c3c3c;
            color: #ffffff;
            border: 1px solid #555;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.875rem;
            transition: all 0.2s;
          }
          
          .vibe-btn:hover {
            background: #4c4c4c;
            border-color: #777;
          }
          
          .vibe-btn.ai {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-color: #667eea;
          }
          
          .main-content {
            display: flex;
            flex: 1;
            overflow: hidden;
          }
          
          .code-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #1e1e1e;
          }
          
          .code-editor-container {
            flex: 1;
            position: relative;
          }
          
          .code-editor {
            width: 100%;
            height: 100%;
            background: #1e1e1e;
            color: #d4d4d4;
            border: none;
            padding: 1rem;
            font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            line-height: 1.5;
            resize: none;
            outline: none;
          }
          
          .preview-section {
            flex: 1;
            background: #ffffff;
            border-left: 1px solid #3e3e42;
            overflow: auto;
          }
          
          .preview-iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
          }
          
          .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.25rem 1rem;
            background: #252526;
            border-top: 1px solid #3e3e42;
            font-size: 0.75rem;
            color: #cccccc;
          }
          
          .ai-panel {
            width: 300px;
            background: #252526;
            border-left: 1px solid #3e3e42;
            display: flex;
            flex-direction: column;
          }
          
          .ai-header {
            padding: 1rem;
            border-bottom: 1px solid #3e3e42;
            font-weight: bold;
          }
          
          .ai-messages {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
          }
          
          .ai-input-container {
            padding: 1rem;
            border-top: 1px solid #3e3e42;
          }
          
          .ai-input {
            width: 100%;
            padding: 0.5rem;
            background: #3c3c3c;
            color: #ffffff;
            border: 1px solid #555;
            border-radius: 4px;
            resize: none;
          }
          
          .loading-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            color: #888;
          }
          
          .vibecode-container #send-ai-btn {
            width: 100%;
            margin-top: 0.5rem;
          }
          .vibecode-container #close-ai-btn {
            float: right;
          }
          .vibecode-container .ai-messages .spinner {
            display: inline-block;
            margin-right: 0.5rem;
          }
          .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid #3c3c3c;
            border-top: 2px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 0.5rem;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @media (max-width: 768px) {
            .main-content {
              flex-direction: column;
            }
            
            .preview-section {
              border-left: none;
              border-top: 1px solid #3e3e42;
            }
            
            .ai-panel {
              width: 100%;
              border-left: none;
              border-top: 1px solid #3e3e42;
            }
          }
        </style>

        <!-- Header -->
        <div class="vibecode-header">
          <div class="header-left">
            <button class="vibe-btn" id="new-file-btn">📄 New</button>
            <button class="vibe-btn" id="save-file-btn">💾 Save</button>
            <button class="vibe-btn" id="run-btn">▶️ Run</button>
          </div>
          
          <div class="header-right">
            <button class="vibe-btn ai" id="ai-toggle-btn" title="Toggle AI Assistant">🤖 AI</button>
            <button class="vibe-btn" id="settings-btn">⚙️</button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
          <!-- Code Editor -->
          <div class="code-section">
            <div class="code-editor-container">
              <textarea 
                id="code-editor" 
                class="code-editor" 
                placeholder="Start coding your Streamlit app here..."
              >${currentCode}</textarea>
            </div>
          </div>

          <!-- Preview Section -->
          <div class="preview-section" id="preview-section">
            <div class="loading-indicator">
              <div class="spinner"></div>
              <span>Preview will appear here when you run your Streamlit app</span>
            </div>
          </div>

          <!-- AI Assistant Panel (Hidden by default) -->
          <div class="ai-panel" id="ai-panel" style="display: none;">
            <div class="ai-header">
              🤖 AI Assistant
              <button class="vibe-btn sk-btn" id="close-ai-btn">×</button>
            </div>
            <div class="ai-messages" id="ai-messages">
              <div class="sk-empty">
                Ask me anything about Streamlit development!
              </div>
            </div>
            <div class="ai-input-container">
              <textarea 
                id="ai-input" 
                class="ai-input" 
                placeholder="Ask AI for help with your code..."
                rows="3"
              ></textarea>
              <button class="vibe-btn ai sk-btn sk-btn-primary" id="send-ai-btn">Send</button>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
          <div class="status-left">
            <span id="status-text">Ready</span>
          </div>
          <div class="status-right">
            <span>Python | Streamlit | Line 1, Col 1</span>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners(window) {
    console.log('🎯 Setting up VibeCode event listeners...');
    
    // File operations
    const newBtn = window.querySelector('#new-file-btn');
    const saveBtn = window.querySelector('#save-file-btn');
    const runBtn = window.querySelector('#run-btn');
    
    // AI functionality
    const aiToggleBtn = window.querySelector('#ai-toggle-btn');
    const closeAiBtn = window.querySelector('#close-ai-btn');
    const sendAiBtn = window.querySelector('#send-ai-btn');
    const aiInput = window.querySelector('#ai-input');
    
    // Event listeners
    if (newBtn) {
      newBtn.addEventListener('click', () => this.newFile(window));
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveFile(window));
    }
    
    if (runBtn) {
      runBtn.addEventListener('click', () => this.runStreamlitApp(window));
    }
    
    if (aiToggleBtn) {
      aiToggleBtn.addEventListener('click', () => this.toggleAI(window));
    }
    
    if (closeAiBtn) {
      closeAiBtn.addEventListener('click', () => this.closeAI(window));
    }
    
    if (sendAiBtn) {
      sendAiBtn.addEventListener('click', () => this.sendAIMessage(window));
    }
    
    if (aiInput) {
      aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          this.sendAIMessage(window);
        }
      });
    }
    
    // Code editor events
    const codeEditor = window.querySelector('#code-editor');
    if (codeEditor) {
      codeEditor.addEventListener('input', () => {
        this.updateStatus(window, 'Modified');
      });
    }
    
    console.log('✅ VibeCode event listeners setup complete');
  }

  newFile(window) {
    const codeEditor = window.querySelector('#code-editor');
    if (codeEditor) {
      codeEditor.value = this.getDefaultStreamlitCode();
      this.currentFile = null;
      this.updateStatus(window, 'New file created');
    }
  }

  saveFile(window) {
    const codeEditor = window.querySelector('#code-editor');
    if (codeEditor) {
      const content = codeEditor.value;
      const filename = prompt('Enter filename:', 'streamlit_app.py');
      if (filename) {
        // Real local persistence (browser localStorage); honestly local —
        // this surface has no backend filesystem to write to.
        try {
          const saved = JSON.parse(localStorage.getItem('vibecode-files') || '{}');
          saved[filename] = { content, savedAt: new Date().toISOString() };
          localStorage.setItem('vibecode-files', JSON.stringify(saved));
        } catch (storageError) {
          console.warn('Local save failed:', storageError);
        }
        this.updateStatus(window, `Saved: ${filename} (local)`);
        
        // Add to recent files
        this.currentFile = { name: filename, content: content };
      }
    }
  }

  async runStreamlitApp(window) {
    const codeEditor = window.querySelector('#code-editor');
    const previewSection = window.querySelector('#preview-section');
    
    if (!codeEditor || !previewSection) return;
    
    this.updateStatus(window, 'Saving code to IPFS artifact store...');
    
    // Real backend op: persist the code as a kit artifact so the Run action
    // produces a genuine content CID. Governed write: explicit user
    // confirmation before the POST, failures surfaced verbatim.
    try {
      if (!confirm('Save this Streamlit code as an IPFS artifact via ipfs_kit_py?')) {
        this.updateStatus(window, 'Ready');
        return;
      }
      const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
      const client = clientModule.getMCPPlusPlusDesktopClient();
      const { contentCidForBytes, stableStringifyValue, base64ForBytes } = clientModule;
      const record = {
        app: 'vibecode',
        kind: 'streamlit-code',
        language: 'python',
        code: codeEditor.value,
        saved_at: new Date().toISOString()
      };
      const bytes = new TextEncoder().encode(stableStringifyValue(record));
      const cid = await contentCidForBytes(bytes);
      const result = await client.post('ipfs_kit_py', '/mcp/artifacts/put', {
        cid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'vibecode-artifact',
        kind: 'streamlit-code',
        service: 'ipfs_kit_py',
        pin: true
      });
      if (!result || result.persisted !== true || result.cid !== cid) {
        throw new Error(result?.error || 'ipfs_kit_py did not verify the persisted artifact.');
      }
      previewSection.innerHTML = `
        <div style="padding: 2rem; background: white; color: black;">
          <div style="border-left: 4px solid #4caf50; padding-left: 1rem; margin-bottom: 1rem;">
            <h3>🎯 VibeCode Run Artifact</h3>
            <p>Code persisted to the IPFS artifact store.</p>
            <p><strong>CID:</strong> <code>${cid}</code>${result.verified === true ? ' (verified)' : ''}</p>
          </div>
          <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px; font-family: monospace;">
            <strong>Code Preview:</strong><br>
            <pre style="margin: 0; white-space: pre-wrap;">${codeEditor.value.slice(0, 200)}${codeEditor.value.length > 200 ? '...' : ''}</pre>
          </div>
          <div style="margin-top: 1rem; padding: 1rem; background: #fff3e0; border-radius: 4px;">
            <strong>📝 Note:</strong> executing Streamlit requires a Python backend, which this browser
            surface does not provide — nothing here was executed. The artifact above is real and
            retrievable by its CID from the ipfs_kit_py store.
          </div>
        </div>
      `;
      this.updateStatus(window, 'Ready');
    } catch (error) {
      previewSection.innerHTML = `
        <div style="padding: 2rem; background: white; color: black;">
          <h3>⚠️ Run failed</h3>
          <p style="font-family: monospace;">${String(error.message || error)}</p>
          <p>The code was not persisted. The error above is the verbatim backend response.</p>
        </div>
      `;
      this.updateStatus(window, 'Run failed');
    }
  }

  toggleAI(window) {
    const aiPanel = window.querySelector('#ai-panel');
    if (aiPanel) {
      const isVisible = aiPanel.style.display !== 'none';
      aiPanel.style.display = isVisible ? 'none' : 'flex';
      this.updateStatus(window, isVisible ? 'AI Assistant closed' : 'AI Assistant opened');
    }
  }

  closeAI(window) {
    const aiPanel = window.querySelector('#ai-panel');
    if (aiPanel) {
      aiPanel.style.display = 'none';
      this.updateStatus(window, 'AI Assistant closed');
    }
  }

  async sendAIMessage(window) {
    const aiInput = window.querySelector('#ai-input');
    const aiMessages = window.querySelector('#ai-messages');
    
    if (!aiInput || !aiMessages) return;
    
    const message = aiInput.value.trim();
    if (!message) return;
    
    // Add user message
    this.addAIMessage(window, message, 'user');
    aiInput.value = '';
    
    // Add loading message
    this.addAIMessage(window, 'Thinking...', 'assistant', true);

    // Ask the real AI backend when one is wired up; never invent a reply.
    const chat = this.swissknife?.chat || this.desktop?.swissknife?.chat || window.swissknife?.chat;
    // Remove loading message
    const loadingMessage = aiMessages.querySelector('.ai-loading');
    if (loadingMessage) {
      loadingMessage.remove();
    }
    if (typeof chat === 'function') {
      try {
        const response = await chat({ message, model: 'gpt-4' });
        this.addAIMessage(window, response?.message || response?.content || String(response), 'assistant');
      } catch (error) {
        this.addAIMessage(window, `AI request failed: ${error.message}`, 'assistant');
      }
    } else {
      this.addAIMessage(window, 'AI is not configured: no chat backend is available. Configure an AI provider (Settings → API Keys) to enable the assistant.', 'assistant');
    }
  }

  addAIMessage(window, message, role, isLoading = false) {
    const aiMessages = window.querySelector('#ai-messages');
    if (!aiMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      margin-bottom: 1rem;
      padding: 0.75rem;
      border-radius: 8px;
      background: ${role === 'user' ? '#3c3c3c' : '#2d3748'};
      ${isLoading ? 'opacity: 0.7;' : ''}
    `;
    
    if (isLoading) {
      messageDiv.className = 'ai-loading';
    }
    
    messageDiv.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 0.5rem; color: ${role === 'user' ? '#67eea' : '#81c784'};">
        ${role === 'user' ? '👤 You' : '🤖 AI Assistant'}
      </div>
      <div style="line-height: 1.4;">
        ${isLoading ? '<div class="spinner"></div>' : ''}
        ${message}
      </div>
    `;
    
    aiMessages.appendChild(messageDiv);
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }

  updateStatus(window, text) {
    const statusText = window.querySelector('#status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  }
}

// Export the class
export { VibeCodeApp };