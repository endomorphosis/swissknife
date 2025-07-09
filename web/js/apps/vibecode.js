/**
 * VibeCode App for SwissKnife Web Desktop
 * Code editor with AI assistance and execution capabilities
 */

class VibeCodeApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.editor = null;
    this.currentFile = null;
    this.language = 'javascript';
    this.theme = 'dark';
    this.aiAssistEnabled = true;
    this.recentFiles = [];
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadRecentFiles();
  }

  createWindow() {
    this.injectStyles();
    const content = `
      <div class="vibecode-container">
        <div class="vibecode-toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn" id="new-file-btn" title="New File">📄</button>
            <button class="toolbar-btn" id="open-file-btn" title="Open File">📁</button>
            <button class="toolbar-btn" id="save-file-btn" title="Save File" disabled>💾</button>
            <button class="toolbar-btn" id="save-as-btn" title="Save As">💾+</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="undo-btn" title="Undo">↶</button>
            <button class="toolbar-btn" id="redo-btn" title="Redo">↷</button>
            <button class="toolbar-btn" id="find-btn" title="Find">🔍</button>
            <button class="toolbar-btn" id="replace-btn" title="Replace">🔄</button>
          </div>
          <div class="toolbar-section">
            <select id="language-select" title="Language">
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
              <option value="yaml">YAML</option>
            </select>
            <select id="theme-select" title="Theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="monokai">Monokai</option>
              <option value="solarized">Solarized</option>
            </select>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="run-btn" title="Run Code">▶️</button>
            <button class="toolbar-btn" id="debug-btn" title="Debug">🐛</button>
            <button class="toolbar-btn" id="format-btn" title="Format Code">🎨</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn ${this.aiAssistEnabled ? 'active' : ''}" id="ai-assist-btn" title="AI Assistance">🤖</button>
            <button class="toolbar-btn" id="ai-explain-btn" title="Explain Code">💡</button>
            <button class="toolbar-btn" id="ai-optimize-btn" title="Optimize Code">⚡</button>
          </div>
        </div>
        
        <div class="vibecode-content">
          <div class="editor-sidebar">
            <div class="sidebar-section">
              <h4>Recent Files</h4>
              <div class="recent-files" id="recent-files">
                <!-- Recent files will be populated here -->
              </div>
            </div>
            <div class="sidebar-section">
              <h4>File Explorer</h4>
              <div class="file-tree" id="file-tree">
                <div class="tree-item" data-path="/">
                  <span class="tree-icon">📁</span>
                  <span class="tree-label">Root</span>
                </div>
              </div>
            </div>
            <div class="sidebar-section">
              <h4>Outline</h4>
              <div class="code-outline" id="code-outline">
                <!-- Code outline will be populated here -->
              </div>
            </div>
          </div>
          
          <div class="editor-main">
            <div class="editor-tabs" id="editor-tabs">
              <!-- Editor tabs will be added here -->
            </div>
            <div class="editor-container">
              <div class="editor-wrapper">
                <div class="line-numbers" id="line-numbers"></div>
                <textarea id="code-editor" class="code-editor" placeholder="Start coding..."></textarea>
              </div>
              <div class="ai-suggestions" id="ai-suggestions" style="display: none;">
                <div class="suggestion-header">
                  <span>AI Suggestions</span>
                  <button class="close-btn">✕</button>
                </div>
                <div class="suggestion-content">
                  <!-- AI suggestions will appear here -->
                </div>
              </div>
            </div>
          </div>
          
          <div class="output-panel" id="output-panel">
            <div class="panel-tabs">
              <div class="panel-tab active" data-panel="console">Console</div>
              <div class="panel-tab" data-panel="output">Output</div>
              <div class="panel-tab" data-panel="problems">Problems</div>
              <div class="panel-tab" data-panel="terminal">Terminal</div>
            </div>
            <div class="panel-content">
              <div class="panel-section active" id="console-panel">
                <div class="console-output" id="console-output"></div>
                <div class="console-input">
                  <input type="text" id="console-input" placeholder="Enter command...">
                  <button id="console-send">Send</button>
                </div>
              </div>
              <div class="panel-section" id="output-panel-content">
                <pre id="output-content"></pre>
              </div>
              <div class="panel-section" id="problems-panel">
                <div class="problems-list" id="problems-list"></div>
              </div>
              <div class="panel-section" id="terminal-panel">
                <div class="terminal-output" id="terminal-output"></div>
                <div class="terminal-input">
                  <span class="terminal-prompt">$</span>
                  <input type="text" id="terminal-input" placeholder="Enter command...">
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Find and Replace Dialog -->
        <div class="find-dialog" id="find-dialog" style="display: none;">
          <div class="find-row">
            <input type="text" id="find-input" placeholder="Find">
            <button id="find-prev">⬆️</button>
            <button id="find-next">⬇️</button>
            <button id="close-find">✕</button>
          </div>
          <div class="replace-row" id="replace-row" style="display: none;">
            <input type="text" id="replace-input" placeholder="Replace">
            <button id="replace-btn">Replace</button>
            <button id="replace-all-btn">Replace All</button>
          </div>
        </div>
        
        <!-- AI Assistant Panel -->
        <div class="ai-panel" id="ai-panel" style="display: none;">
          <div class="ai-panel-header">
            <h3>AI Assistant</h3>
            <button class="close-btn" id="close-ai-panel">✕</button>
          </div>
          <div class="ai-panel-content">
            <div class="ai-chat" id="ai-chat"></div>
            <div class="ai-input">
              <textarea id="ai-input" placeholder="Ask the AI about your code..." rows="3"></textarea>
              <button id="ai-send">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'VibeCode',
      content: content,
      width: 1200,
      height: 800,
      resizable: true
    });

    this.setupEventListeners(window);
    this.initializeEditor(window);
    this.populateRecentFiles(window);
    
    return window;
  }

  setupEventListeners(window) {
    // File operations
    window.querySelector('#new-file-btn').addEventListener('click', () => this.newFile(window));
    window.querySelector('#open-file-btn').addEventListener('click', () => this.openFile(window));
    window.querySelector('#save-file-btn').addEventListener('click', () => this.saveFile(window));
    window.querySelector('#save-as-btn').addEventListener('click', () => this.saveAsFile(window));

    // Edit operations
    window.querySelector('#undo-btn').addEventListener('click', () => this.undo(window));
    window.querySelector('#redo-btn').addEventListener('click', () => this.redo(window));
    window.querySelector('#find-btn').addEventListener('click', () => this.showFind(window));
    window.querySelector('#replace-btn').addEventListener('click', () => this.showReplace(window));

    // Code operations
    window.querySelector('#run-btn').addEventListener('click', () => this.runCode(window));
    window.querySelector('#debug-btn').addEventListener('click', () => this.debugCode(window));
    window.querySelector('#format-btn').addEventListener('click', () => this.formatCode(window));

    // AI operations
    window.querySelector('#ai-assist-btn').addEventListener('click', () => this.toggleAIAssist(window));
    window.querySelector('#ai-explain-btn').addEventListener('click', () => this.explainCode(window));
    window.querySelector('#ai-optimize-btn').addEventListener('click', () => this.optimizeCode(window));

    // Language and theme
    window.querySelector('#language-select').addEventListener('change', (e) => this.setLanguage(window, e.target.value));
    window.querySelector('#theme-select').addEventListener('change', (e) => this.setTheme(window, e.target.value));

    // Editor events
    const editor = window.querySelector('#code-editor');
    editor.addEventListener('input', () => this.onEditorChange(window));
    editor.addEventListener('scroll', () => this.updateLineNumbers(window));
    editor.addEventListener('keydown', (e) => this.handleKeyDown(window, e));

    // Panel tabs
    window.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchPanel(window, tab.dataset.panel));
    });

    // Console
    window.querySelector('#console-send').addEventListener('click', () => this.sendConsoleCommand(window));
    window.querySelector('#console-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendConsoleCommand(window);
    });

    // Terminal
    window.querySelector('#terminal-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendTerminalCommand(window);
    });

    // Find/Replace
    window.querySelector('#find-next').addEventListener('click', () => this.findNext(window));
    window.querySelector('#find-prev').addEventListener('click', () => this.findPrev(window));
    window.querySelector('#close-find').addEventListener('click', () => this.hideFind(window));
    window.querySelector('#replace-btn').addEventListener('click', () => this.replace(window));
    window.querySelector('#replace-all-btn').addEventListener('click', () => this.replaceAll(window));

    // AI Panel
    window.querySelector('#ai-send').addEventListener('click', () => this.sendAIMessage(window));
    window.querySelector('#ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendAIMessage(window);
      }
    });
    window.querySelector('#close-ai-panel').addEventListener('click', () => this.hideAIPanel(window));
  }

  initializeEditor(window) {
    const editor = window.querySelector('#code-editor');
    const lineNumbers = window.querySelector('#line-numbers');
    
    // Set initial content
    editor.value = `// Welcome to VibeCode!\n// Start typing your code here...\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10));`;

    this.updateLineNumbers(window);
    this.setLanguage(window, this.language);
    this.setTheme(window, this.theme);
  }

  updateLineNumbers(window) {
    const editor = window.querySelector('#code-editor');
    const lineNumbers = window.querySelector('#line-numbers');
    
    const lines = editor.value.split('\n').length;
    const numbersHtml = Array.from({ length: lines }, (_, i) => 
      `<div class="line-number">${i + 1}</div>`
    ).join('');
    
    lineNumbers.innerHTML = numbersHtml;
    lineNumbers.scrollTop = editor.scrollTop;
  }

  onEditorChange(window) {
    this.updateLineNumbers(window);
    this.markFileAsModified(window);
    
    if (this.aiAssistEnabled) {
      this.scheduleAISuggestions(window);
    }
    
    this.updateProblems(window);
  }

  markFileAsModified(window) {
    const saveBtn = window.querySelector('#save-file-btn');
    saveBtn.disabled = false;
    
    // Update tab title to show modification
    const activeTab = window.querySelector('.editor-tab.active');
    if (activeTab && !activeTab.textContent.endsWith('*')) {
      activeTab.textContent += '*';
    }
  }

  async runCode(window) {
    const editor = window.querySelector('#code-editor');
    const code = editor.value;
    const outputContent = window.querySelector('#output-content');
    const consoleOutput = window.querySelector('#console-output');
    
    this.switchPanel(window, 'output');
    outputContent.textContent = 'Running code...\n';
    
    try {
      let result;
      
      if (this.language === 'javascript') {
        result = await this.runJavaScript(code);
      } else if (this.language === 'python') {
        result = await this.runPython(code);
      } else {
        result = { output: 'Language not supported for execution', error: null };
      }
      
      if (result.error) {
        outputContent.textContent = `Error: ${result.error}\n`;
        this.addProblem(window, 'error', result.error, 1);
      } else {
        outputContent.textContent = result.output || 'Code executed successfully';
      }
      
    } catch (error) {
      outputContent.textContent = `Execution error: ${error.message}`;
      this.addProblem(window, 'error', error.message, 1);
    }
  }

  async runJavaScript(code) {
    try {
      // Create a sandboxed environment
      const originalConsole = console;
      const logs = [];
      
      const sandboxConsole = {
        log: (...args) => logs.push(args.join(' ')),
        error: (...args) => logs.push('ERROR: ' + args.join(' ')),
        warn: (...args) => logs.push('WARNING: ' + args.join(' '))
      };
      
      // Execute code in isolated context
      const result = new Function('console', code)(sandboxConsole);
      
      return {
        output: logs.join('\n') + (result !== undefined ? '\n' + result : ''),
        error: null
      };
    } catch (error) {
      return {
        output: '',
        error: error.message
      };
    }
  }

  async runPython(code) {
    try {
      // Use SwissKnife's Python execution capability
      const result = await this.swissknife.execute({
        language: 'python',
        code: code
      });
      
      return {
        output: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        output: '',
        error: error.message
      };
    }
  }

  async formatCode(window) {
    const editor = window.querySelector('#code-editor');
    const code = editor.value;
    
    try {
      const formatted = await this.swissknife.format({
        language: this.language,
        code: code
      });
      
      if (formatted.success) {
        editor.value = formatted.code;
        this.updateLineNumbers(window);
        this.desktop.showNotification('Code formatted successfully', 'success');
      }
    } catch (error) {
      this.desktop.showNotification('Failed to format code: ' + error.message, 'error');
    }
  }

  async explainCode(window) {
    const editor = window.querySelector('#code-editor');
    const selectedText = this.getSelectedText(editor);
    const code = selectedText || editor.value;
    
    if (!code.trim()) {
      this.desktop.showNotification('No code to explain', 'warning');
      return;
    }
    
    this.showAIPanel(window);
    this.addAIMessage(window, `Please explain this ${this.language} code:`, 'user');
    this.addAIMessage(window, '```' + this.language + '\n' + code + '\n```', 'user');
    
    try {
      const explanation = await this.swissknife.chat({
        message: `Please explain this ${this.language} code:\n\n${code}`,
        model: 'gpt-4'
      });
      
      this.addAIMessage(window, explanation.message, 'assistant');
    } catch (error) {
      this.addAIMessage(window, `Error: ${error.message}`, 'error');
    }
  }

  async optimizeCode(window) {
    const editor = window.querySelector('#code-editor');
    const code = editor.value;
    
    if (!code.trim()) {
      this.desktop.showNotification('No code to optimize', 'warning');
      return;
    }
    
    this.showAIPanel(window);
    this.addAIMessage(window, `Please optimize this ${this.language} code:`, 'user');
    this.addAIMessage(window, '```' + this.language + '\n' + code + '\n```', 'user');
    
    try {
      const optimization = await this.swissknife.chat({
        message: `Please optimize this ${this.language} code and explain the improvements:\n\n${code}`,
        model: 'gpt-4'
      });
      
      this.addAIMessage(window, optimization.message, 'assistant');
    } catch (error) {
      this.addAIMessage(window, `Error: ${error.message}`, 'error');
    }
  }

  toggleAIAssist(window) {
    this.aiAssistEnabled = !this.aiAssistEnabled;
    const btn = window.querySelector('#ai-assist-btn');
    btn.classList.toggle('active', this.aiAssistEnabled);
    
    if (this.aiAssistEnabled) {
      this.desktop.showNotification('AI assistance enabled', 'success');
    } else {
      this.desktop.showNotification('AI assistance disabled', 'info');
      this.hideAISuggestions(window);
    }
  }

  showAIPanel(window) {
    const aiPanel = window.querySelector('#ai-panel');
    aiPanel.style.display = 'block';
  }

  hideAIPanel(window) {
    const aiPanel = window.querySelector('#ai-panel');
    aiPanel.style.display = 'none';
  }

  addAIMessage(window, message, role) {
    const aiChat = window.querySelector('#ai-chat');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'ai-avatar';
    avatar.textContent = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚠️';
    
    const content = document.createElement('div');
    content.className = 'ai-content';
    
    if (message.includes('```')) {
      content.innerHTML = this.formatCodeBlocks(message);
    } else {
      content.textContent = message;
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    aiChat.appendChild(messageDiv);
    aiChat.scrollTop = aiChat.scrollHeight;
  }

  async sendAIMessage(window) {
    const aiInput = window.querySelector('#ai-input');
    const message = aiInput.value.trim();
    
    if (!message) return;
    
    aiInput.value = '';
    this.addAIMessage(window, message, 'user');
    
    try {
      const response = await this.swissknife.chat({
        message: `Code context (${this.language}):\n${window.querySelector('#code-editor').value}\n\nUser question: ${message}`,
        model: 'gpt-4'
      });
      
      this.addAIMessage(window, response.message, 'assistant');
    } catch (error) {
      this.addAIMessage(window, `Error: ${error.message}`, 'error');
    }
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

  setLanguage(window, language) {
    this.language = language;
    const editor = window.querySelector('#code-editor');
    const languageSelect = window.querySelector('#language-select');
    
    languageSelect.value = language;
    editor.className = `code-editor language-${language}`;
    
    this.updateSyntaxHighlighting(window);
  }

  setTheme(window, theme) {
    this.theme = theme;
    const container = window.querySelector('.vibecode-container');
    const themeSelect = window.querySelector('#theme-select');
    
    themeSelect.value = theme;
    container.className = `vibecode-container theme-${theme}`;
  }

  updateSyntaxHighlighting(window) {
    // Basic syntax highlighting (in a real implementation, use a proper syntax highlighter)
    const editor = window.querySelector('#code-editor');
    // This would typically integrate with a library like Monaco Editor or CodeMirror
  }

  switchPanel(window, panelName) {
    const tabs = window.querySelectorAll('.panel-tab');
    const sections = window.querySelectorAll('.panel-section');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    sections.forEach(section => section.classList.remove('active'));
    
    window.querySelector(`[data-panel="${panelName}"]`).classList.add('active');
    window.querySelector(`#${panelName}-panel, #${panelName}-panel-content`).classList.add('active');
  }

  updateProblems(window) {
    const problemsList = window.querySelector('#problems-list');
    const code = window.querySelector('#code-editor').value;
    
    // Basic syntax checking
    const problems = this.checkSyntax(code);
    
    problemsList.innerHTML = '';
    problems.forEach(problem => {
      const problemItem = document.createElement('div');
      problemItem.className = `problem-item ${problem.severity}`;
      problemItem.innerHTML = `
        <span class="problem-icon">${problem.severity === 'error' ? '❌' : '⚠️'}</span>
        <span class="problem-message">${problem.message}</span>
        <span class="problem-location">Line ${problem.line}</span>
      `;
      problemsList.appendChild(problemItem);
    });
  }

  checkSyntax(code) {
    const problems = [];
    
    if (this.language === 'javascript') {
      try {
        new Function(code);
      } catch (error) {
        problems.push({
          severity: 'error',
          message: error.message,
          line: 1 // In a real implementation, parse the error for line number
        });
      }
    }
    
    return problems;
  }

  addProblem(window, severity, message, line) {
    const problemsList = window.querySelector('#problems-list');
    const problemItem = document.createElement('div');
    problemItem.className = `problem-item ${severity}`;
    problemItem.innerHTML = `
      <span class="problem-icon">${severity === 'error' ? '❌' : '⚠️'}</span>
      <span class="problem-message">${message}</span>
      <span class="problem-location">Line ${line}</span>
    `;
    problemsList.appendChild(problemItem);
  }

  async newFile(window) {
    const editor = window.querySelector('#code-editor');
    editor.value = '';
    this.currentFile = null;
    this.updateLineNumbers(window);
    window.querySelector('#save-file-btn').disabled = true;
  }

  async openFile(window) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.ts,.py,.html,.css,.json,.md,.txt';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const content = await file.text();
        const editor = window.querySelector('#code-editor');
        editor.value = content;
        this.currentFile = file;
        this.updateLineNumbers(window);
        this.addToRecentFiles(file.name);
        this.populateRecentFiles(window);
      }
    };
    
    input.click();
  }

  async saveFile(window) {
    if (!this.currentFile) {
      this.saveAsFile(window);
      return;
    }
    
    const editor = window.querySelector('#code-editor');
    const content = editor.value;
    
    try {
      // Save to SwissKnife storage
      await this.swissknife.storage.store({
        path: this.currentFile.name,
        content: content,
        type: 'text/plain'
      });
      
      window.querySelector('#save-file-btn').disabled = true;
      this.desktop.showNotification('File saved successfully', 'success');
    } catch (error) {
      this.desktop.showNotification('Failed to save file: ' + error.message, 'error');
    }
  }

  async saveAsFile(window) {
    const filename = prompt('Enter filename:');
    if (!filename) return;
    
    const editor = window.querySelector('#code-editor');
    const content = editor.value;
    
    try {
      // Save to SwissKnife storage
      await this.swissknife.storage.store({
        path: filename,
        content: content,
        type: 'text/plain'
      });
      
      this.currentFile = { name: filename };
      window.querySelector('#save-file-btn').disabled = true;
      this.addToRecentFiles(filename);
      this.populateRecentFiles(window);
      this.desktop.showNotification('File saved successfully', 'success');
    } catch (error) {
      this.desktop.showNotification('Failed to save file: ' + error.message, 'error');
    }
  }

  async loadRecentFiles() {
    try {
      const stored = localStorage.getItem('vibecode_recent_files');
      this.recentFiles = stored ? JSON.parse(stored) : [];
    } catch (error) {
      this.recentFiles = [];
    }
  }

  addToRecentFiles(filename) {
    this.recentFiles = this.recentFiles.filter(f => f !== filename);
    this.recentFiles.unshift(filename);
    this.recentFiles = this.recentFiles.slice(0, 10); // Keep only 10 recent files
    
    localStorage.setItem('vibecode_recent_files', JSON.stringify(this.recentFiles));
  }

  populateRecentFiles(window) {
    const recentFiles = window.querySelector('#recent-files');
    recentFiles.innerHTML = '';
    
    this.recentFiles.forEach(filename => {
      const fileItem = document.createElement('div');
      fileItem.className = 'recent-file-item';
      fileItem.textContent = filename;
      fileItem.addEventListener('click', () => this.openRecentFile(window, filename));
      recentFiles.appendChild(fileItem);
    });
  }

  async openRecentFile(window, filename) {
    try {
      const content = await this.swissknife.storage.retrieve({ path: filename });
      const editor = window.querySelector('#code-editor');
      editor.value = content;
      this.currentFile = { name: filename };
      this.updateLineNumbers(window);
    } catch (error) {
      this.desktop.showNotification('Failed to open file: ' + error.message, 'error');
    }
  }

  getSelectedText(editor) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    return editor.value.substring(start, end);
  }

  showFind(window) {
    const findDialog = window.querySelector('#find-dialog');
    const replaceRow = window.querySelector('#replace-row');
    
    findDialog.style.display = 'block';
    replaceRow.style.display = 'none';
    window.querySelector('#find-input').focus();
  }

  showReplace(window) {
    const findDialog = window.querySelector('#find-dialog');
    const replaceRow = window.querySelector('#replace-row');
    
    findDialog.style.display = 'block';
    replaceRow.style.display = 'block';
    window.querySelector('#find-input').focus();
  }

  hideFind(window) {
    window.querySelector('#find-dialog').style.display = 'none';
  }

  findNext(window) {
    // Implement find functionality
    const findInput = window.querySelector('#find-input');
    const searchTerm = findInput.value;
    if (searchTerm) {
      // Find next occurrence in editor
      console.log('Finding next:', searchTerm);
    }
  }

  findPrev(window) {
    // Implement find previous functionality
    const findInput = window.querySelector('#find-input');
    const searchTerm = findInput.value;
    if (searchTerm) {
      // Find previous occurrence in editor
      console.log('Finding previous:', searchTerm);
    }
  }

  replace(window) {
    // Implement replace functionality
    console.log('Replace current');
  }

  replaceAll(window) {
    // Implement replace all functionality
    console.log('Replace all');
  }

  undo(window) {
    document.execCommand('undo');
  }

  redo(window) {
    document.execCommand('redo');
  }

  handleKeyDown(window, e) {
    // Handle special key combinations
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          this.saveFile(window);
          break;
        case 'f':
          e.preventDefault();
          this.showFind(window);
          break;
        case 'h':
          e.preventDefault();
          this.showReplace(window);
          break;
        case 'Enter':
          if (e.shiftKey) {
            e.preventDefault();
            this.runCode(window);
          }
          break;
      }
    }
  }

  sendConsoleCommand(window) {
    const input = window.querySelector('#console-input');
    const output = window.querySelector('#console-output');
    const command = input.value.trim();
    
    if (command) {
      const commandDiv = document.createElement('div');
      commandDiv.className = 'console-line command';
      commandDiv.textContent = '> ' + command;
      output.appendChild(commandDiv);
      
      // Execute command
      try {
        const result = eval(command);
        const resultDiv = document.createElement('div');
        resultDiv.className = 'console-line result';
        resultDiv.textContent = result;
        output.appendChild(resultDiv);
      } catch (error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'console-line error';
        errorDiv.textContent = 'Error: ' + error.message;
        output.appendChild(errorDiv);
      }
      
      input.value = '';
      output.scrollTop = output.scrollHeight;
    }
  }

  sendTerminalCommand(window) {
    const input = window.querySelector('#terminal-input');
    const output = window.querySelector('#terminal-output');
    const command = input.value.trim();
    
    if (command) {
      const commandDiv = document.createElement('div');
      commandDiv.className = 'terminal-line';
      commandDiv.textContent = '$ ' + command;
      output.appendChild(commandDiv);
      
      // In a real implementation, this would execute the command
      const resultDiv = document.createElement('div');
      resultDiv.className = 'terminal-line';
      resultDiv.textContent = 'Command executed: ' + command;
      output.appendChild(resultDiv);
      
      input.value = '';
      output.scrollTop = output.scrollHeight;
    }
  }

  scheduleAISuggestions(window) {
    // Debounce AI suggestions
    clearTimeout(this.aiSuggestionsTimeout);
    this.aiSuggestionsTimeout = setTimeout(() => {
      this.generateAISuggestions(window);
    }, 2000);
  }

  async generateAISuggestions(window) {
    if (!this.aiAssistEnabled) return;
    
    const editor = window.querySelector('#code-editor');
    const code = editor.value;
    
    if (code.length < 10) return; // Don't suggest for very short code
    
    try {
      const suggestions = await this.swissknife.chat({
        message: `Analyze this ${this.language} code and provide brief suggestions for improvement:\n\n${code}`,
        model: 'gpt-3.5-turbo'
      });
      
      this.showAISuggestions(window, suggestions.message);
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
    }
  }

  showAISuggestions(window, suggestions) {
    const suggestionsPanel = window.querySelector('#ai-suggestions');
    const suggestionContent = suggestionsPanel.querySelector('.suggestion-content');
    
    suggestionContent.textContent = suggestions;
    suggestionsPanel.style.display = 'block';
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      this.hideAISuggestions(window);
    }, 10000);
  }

  hideAISuggestions(window) {
    const suggestionsPanel = window.querySelector('#ai-suggestions');
    suggestionsPanel.style.display = 'none';
  }

  debugCode(window) {
    // Placeholder for debug functionality
    this.desktop.showNotification('Debug functionality coming soon', 'info');
  }
}

// Export for use in main desktop
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VibeCodeApp;
} else {
    window.VibeCodeApp = VibeCodeApp;
}
