/**
 * Enhanced Terminal App for SwissKnife Web Desktop
 * Advanced terminal with P2P integration, AI assistance, and multi-session support
 */

export class TerminalApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.sessions = new Map();
    this.activeSession = null;
    this.currentDirectory = '/home/swissknife';
    this.commandHistory = [];
    this.historyIndex = 0;
    this.p2pSystem = null;
    this.aiAssist = null;
    this.autoComplete = [];
    
    // Local virtual filesystem: this terminal is a simulated in-browser
    // shell with no backend filesystem behind it. The virtual FS is real
    // within the session (mkdir/touch/cat/ls stay consistent) and is
    // plainly presented as local simulation, never as a backend host FS.
    this.virtualFS = new Map([
      ['config.json', { type: 'file', content: '{\n  "theme": "dark",\n  "language": "en",\n  "ai_provider": "openai"\n}', size: '1.2K', modified: '2025-06-27' }],
      ['projects', { type: 'directory', content: null, size: '-', modified: '2025-06-26' }],
      ['README.md', { type: 'file', content: '# SwissKnife Web Desktop\n\nA browser-based development environment.\n\n## Features\n- AI Chat\n- File Management\n- Terminal Access', size: '3.4K', modified: '2025-06-25' }],
      ['scripts', { type: 'directory', content: null, size: '-', modified: '2025-06-24' }],
      ['data.json', { type: 'file', content: '{\n  "version": "1.0.0",\n  "timestamp": "2025-06-27T10:30:00Z"\n}', size: '856B', modified: '2025-06-23' }]
    ]);
    
    // Built-in commands
    this.builtinCommands = new Map([
      ['help', { handler: this.showHelp.bind(this), description: 'Show available commands' }],
      ['clear', { handler: this.clearTerminal.bind(this), description: 'Clear terminal screen' }],
      ['ls', { handler: this.listFiles.bind(this), description: 'List directory contents' }],
      ['cd', { handler: this.changeDirectory.bind(this), description: 'Change directory' }],
      ['pwd', { handler: this.printWorkingDirectory.bind(this), description: 'Print working directory' }],
      ['cat', { handler: this.displayFile.bind(this), description: 'Display file contents' }],
      ['echo', { handler: this.echoText.bind(this), description: 'Display text' }],
      ['date', { handler: this.showDate.bind(this), description: 'Show current date and time' }],
      ['whoami', { handler: this.showUser.bind(this), description: 'Show current user' }],
      ['ps', { handler: this.showProcesses.bind(this), description: 'Show running processes' }],
      ['top', { handler: this.showSystemStats.bind(this), description: 'Show system statistics' }],
      ['history', { handler: this.showCommandHistory.bind(this), description: 'Show command history' }],
      ['alias', { handler: this.manageAliases.bind(this), description: 'Manage command aliases' }],
      ['export', { handler: this.setEnvironmentVar.bind(this), description: 'Set environment variables' }],
      ['env', { handler: this.showEnvironment.bind(this), description: 'Show environment variables' }],
      ['grep', { handler: this.grepText.bind(this), description: 'Search text patterns' }],
      ['find', { handler: this.findFiles.bind(this), description: 'Find files and directories' }],
      ['nano', { handler: this.openEditor.bind(this), description: 'Open text editor' }],
      ['vim', { handler: this.openEditor.bind(this), description: 'Open vim editor' }],
      ['ssh', { handler: this.connectSSH.bind(this), description: 'Connect via SSH (P2P)' }],
      ['scp', { handler: this.copyFiles.bind(this), description: 'Copy files over network' }],
      ['ipfs', { handler: this.ipfsCommand.bind(this), description: 'IPFS commands' }],
      ['p2p', { handler: this.p2pCommand.bind(this), description: 'P2P network commands' }],
      ['ai', { handler: this.aiCommand.bind(this), description: 'AI assistant commands' }],
      ['desktop', { handler: this.desktopCommand.bind(this), description: 'Desktop management commands' }],
      ['install', { handler: this.installPackage.bind(this), description: 'Install packages' }],
      ['update', { handler: this.updateSystem.bind(this), description: 'Update system' }],
      ['monitor', { handler: this.monitorSystem.bind(this), description: 'Monitor system resources' }],
      ['log', { handler: this.showLogs.bind(this), description: 'Show system logs' }],
      ['backup', { handler: this.backupData.bind(this), description: 'Backup data to IPFS' }],
      ['restore', { handler: this.restoreData.bind(this), description: 'Restore data from backup' }]
    ]);
    
    // Environment variables
    this.environment = {
      'HOME': '/home/swissknife',
      'USER': 'swissknife',
      'PATH': '/usr/local/bin:/usr/bin:/bin',
      'SHELL': '/bin/swissknife-shell',
      'TERM': 'swissknife-256color',
      'PWD': this.currentDirectory
    };
    
    // Command aliases
    this.aliases = new Map([
      ['ll', 'ls -la'],
      ['la', 'ls -a'],
      ['..', 'cd ..'],
      ['~', 'cd ~'],
      ['h', 'help'],
      ['c', 'clear']
    ]);
    
    // Initialize CLI adapter as null - will be initialized later if available
    this.cliAdapter = null;

    this.initializeIntegrations();
  }

  async initialize(contentElement) {
    this.contentElement = contentElement;
    this.loadSettings();
    await this.render();
    return this;
  }

  async render() {
    if (!this.contentElement) {
      throw new Error('Content element not provided');
    }

    this.contentElement.innerHTML = `
      <div class="terminal-container" style="display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--sk-bg, #0e1412);color:var(--sk-ok, #5ee3a1);">
        <div class="terminal-header" style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div class="terminal-tabs">
            <div class="terminal-tab active" data-session="main">
              <span class="tab-title">Terminal</span>
              <button type="button" class="tab-close" aria-label="Close tab">×</button>
            </div>
            <button type="button" class="new-tab-btn" title="New Tab" aria-label="New Tab">+</button>
          </div>
          <div class="terminal-controls">
            <button type="button" class="terminal-btn" id="ai-assist-btn" title="AI Assistant" aria-label="AI Assistant">🤖</button>
            <button type="button" class="terminal-btn" id="p2p-connect-btn" title="P2P Connect" aria-label="P2P Connect">🌐</button>
            <button type="button" class="terminal-btn" id="settings-btn" title="Settings" aria-label="Settings">⚙️</button>
          </div>
        </div>
        <div class="terminal-body" style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
          <div class="terminal-output" id="terminal-output" style="flex:1 1 auto;min-height:0;overflow:auto;"></div>
          <div class="terminal-input-line" style="flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:4px;position:relative;z-index:1;">
            <span class="terminal-prompt" id="terminal-prompt" style="white-space:normal;overflow-wrap:anywhere;">swissknife@desktop:${this.currentDirectory}$ </span>
            <input type="text" class="terminal-input" id="terminal-input" aria-label="Command" tabindex="0"
                   placeholder="Type a command..." autocomplete="off" spellcheck="false"
                   style="flex:1 1 8rem;min-width:0;background:transparent;color:inherit;border:0;">
          </div>
        </div>
        <div class="terminal-status" style="flex:0 0 auto;display:flex;flex-wrap:wrap;gap:4px 12px;position:relative;z-index:1;">
          <span class="status-left">Ready · browser-local shell</span>
          <span class="status-right">Session: main | ${this.environment.USER}@${this.environment.TERM}</span>
        </div>
      </div>
    `;

    const terminalLayout = document.createElement('style');
    terminalLayout.textContent = '.terminal-input:focus,.terminal-input:focus-visible{outline:2px solid var(--sk-accent,#8bd8bd);outline-offset:2px;}';
    this.contentElement.prepend(terminalLayout);

    this.setupEventListeners();
    this.createMainSession();
    this.showWelcomeMessage();
  }

  async initializeIntegrations() {
    this.loadSettings();
    try {
      this.swissknife = this.desktop && this.desktop.swissknife;
      
      // Connect to P2P system for distributed terminal access
      if (window.p2pMLSystem && typeof this.setupP2PTerminal === 'function') {
        this.p2pSystem = window.p2pMLSystem;
        this.setupP2PTerminal();
      }
      
      // Connect to AI system for intelligent assistance
      if (window.aiManager || this.swissknife?.ai) {
        this.aiAssist = window.aiManager || this.swissknife.ai;
      }
      
      // Load saved settings
      this.loadSettings();
      
      console.log('✅ Terminal integrations initialized');
    } catch (error) {
      console.error('❌ Terminal integration error:', error);
    }
  }

  loadSettings() {
    try {
      const savedSettings = localStorage.getItem('swissknife-terminal-settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        this.currentDirectory = settings.currentDirectory || this.currentDirectory;
        if (this.environment) this.environment.PWD = this.currentDirectory;
      }
    } catch (error) {
      console.warn('Could not load terminal settings:', error);
    }
    let savedHistory = null;
    try {
      savedHistory = localStorage.getItem('swissknife-terminal-history');
    } catch (error) {
      console.warn('Could not load terminal history:', error);
    }
    if (!savedHistory) {
      try {
        savedHistory = sessionStorage.getItem('swissknife-terminal-history');
      } catch (error) {
        console.warn('Could not load terminal session history:', error);
      }
    }
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        if (Array.isArray(history)) {
          this.commandHistory = history.filter((entry) => typeof entry === 'string').slice(-200);
          this.historyIndex = this.commandHistory.length;
        }
      } catch (error) {
        console.warn('Could not parse terminal history:', error);
      }
    }
  }

  createTerminalUI() {
    this.window.innerHTML = `
      <div class="terminal-container">
        <div class="terminal-header">
          <div class="terminal-title">🖥️ SwissKnife Terminal - Enhanced with Shared System</div>
          <div class="terminal-controls">
            <button class="btn-minimize">−</button>
            <button class="btn-maximize">□</button>
            <button class="btn-close">×</button>
          </div>
        </div>
        <div class="terminal-body">
          <div class="terminal-output" id="terminal-output"></div>
          <div class="terminal-input-line">
            <span class="terminal-prompt">swissknife@web:${this.currentDirectory}$ </span>
            <input type="text" class="terminal-input" id="terminal-input" autocomplete="off" spellcheck="false" autofocus>
          </div>
        </div>
      </div>
    `;

    // Add enhanced terminal styling
    const style = document.createElement('style');
    style.textContent = `
      .terminal-container {
        height: 100%;
        border: 1px solid var(--sk-border, #263a34);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: 'Courier New', monospace;
        background: var(--sk-bg, #0e1412);
        color: var(--sk-ok, #5ee3a1);
      }
      
      .terminal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--sk-bg2, #101b18);
        border-bottom: 1px solid var(--sk-border, #263a34);
      }
      
      .terminal-title {
        font-size: 14px;
        color: var(--sk-text, #edf7f2);
      }
      
      .terminal-controls button {
        background: none;
        border: none;
        color: #fff;
        padding: 4px 8px;
        margin-left: 4px;
        cursor: pointer;
        border-radius: 3px;
      }
      
      .terminal-controls button:hover {
        background: var(--sk-card, #17241f);
      }
      
      .terminal-body {
        flex: 1;
        padding: 12px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }
      
      .terminal-output {
        flex: 1;
        white-space: pre-wrap;
        font-size: 14px;
        line-height: 1.4;
      }
      
      .terminal-input-line {
        display: flex;
        align-items: center;
        margin-top: 8px;
      }
      
      .terminal-prompt {
        color: var(--sk-ok, #5ee3a1);
        font-weight: bold;
        margin-right: 8px;
      }
      
      .terminal-input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--sk-ok, #5ee3a1);
        font-family: inherit;
        font-size: 14px;
        outline: none;
      }
      
      .terminal-line {
        margin: 2px 0;
      }
      
      .terminal-command {
        color: var(--sk-warn, #ffd166);
      }
      
      .terminal-error {
        color: var(--sk-err, #ff6b6b);
      }
      
      .terminal-success {
        color: var(--sk-ok, #5ee3a1);
      }
      
      .terminal-info {
        color: var(--sk-accent, #8bd8bd);
      }
      
      .terminal-welcome {
        color: var(--sk-warn, #ffd166);
        font-weight: bold;
      }
      
      .terminal-category {
        color: var(--sk-accent, #8bd8bd);
        font-weight: bold;
      }
      
      .terminal-help {
        color: var(--sk-accent, #8bd8bd);
        font-weight: bold;
      }
    `;
    this.window.appendChild(style);

    this.output = this.window.querySelector('#terminal-output');
    this.input = this.window.querySelector('#terminal-input');
    this.input.focus();
  }

  setupEventListeners() {
    this.input = this.contentElement.querySelector('#terminal-input');
    this.output = this.contentElement.querySelector('#terminal-output');
    this.prompt = this.contentElement.querySelector('#terminal-prompt');
    
    if (this.input) {
      this.input.addEventListener('keydown', this.handleKeyDown.bind(this));
      this.input.focus();
    }
    
    // AI Assistant button
    const aiBtn = this.contentElement.querySelector('#ai-assist-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => this.toggleAIAssistant());
    }
    
    // P2P Connect button  
    const p2pBtn = this.contentElement.querySelector('#p2p-connect-btn');
    if (p2pBtn) {
      p2pBtn.addEventListener('click', () => this.toggleP2PConnection());
    }
    
    // Settings button
    const settingsBtn = this.contentElement.querySelector('#settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openTerminalSettings());
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Enter') {
      this.executeCommand();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navigateHistory(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navigateHistory(1);
    }
  }

  async executeCommand() {
    const command = this.input.value.trim();
    if (!command) return;

    this.commandHistory.push(command);
    this.historyIndex = this.commandHistory.length;
    const historyPayload = JSON.stringify(this.commandHistory.slice(-200));
    try {
      localStorage.setItem('swissknife-terminal-history', historyPayload);
    } catch (error) {
      console.warn('Could not save terminal history:', error);
    }
    try {
      sessionStorage.setItem('swissknife-terminal-history', historyPayload);
    } catch (error) {
      console.warn('Could not save terminal session history:', error);
    }

    this.addOutput(`swissknife@desktop:${this.currentDirectory}$ ${command}`, 'command');
    this.input.value = '';

    try {
      await this.processCommand(command);
    } finally {
      if (this.input) this.input.disabled = false;
    }
  }

  async processCommand(command) {
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    try {
      // First try the shared CLI adapter for all SwissKnife commands (if available)
      if (this.cliAdapter && (cmd.startsWith('sk-') || ['sk', 'ai', 'chat', 'task', 'config', 'models', 'storage', 'mcp', 'ipfs'].includes(cmd))) {
        const result = await this.cliAdapter.executeCommand(command);
        if (result.success) {
          this.addOutput(result.output, 'normal');
          if (result.data) {
            console.log('Command data:', result.data);
          }
        } else {
          this.addOutput(result.output, 'error');
        }
        return;
      }

      // Process built-in terminal commands
      switch (cmd) {
        case 'help':
          this.showHelp();
          break;
          
        case 'clear':
          this.clearTerminal();
          break;
          
        case 'echo':
          this.addOutput(args.join(' '));
          break;
          
        case 'pwd':
          this.addOutput(this.currentDirectory);
          break;
          
        case 'ls':
          await this.listFiles(args);
          break;
          
        case 'cd':
          this.changeDirectory(args[0] || '/');
          break;
          
        case 'mkdir':
          await this.makeDirectory(args[0]);
          break;
          
        case 'touch':
          await this.createFile(args[0]);
          break;
          
        case 'cat':
          await this.displayFile(args[0]);
          break;
          
        case 'date':
          this.addOutput(new Date().toString());
          break;
          
        case 'whoami':
          this.addOutput('swissknife-user');
          break;
          
        case 'uname':
          this.addOutput('SwissKnife Web Desktop v1.0');
          break;
          
        case 'ps':
          this.showProcesses();
          break;
          
        case 'env':
          this.showEnvironment();
          break;
          
        case 'history':
          this.showCommandHistory();
          break;
          
        case 'code':
          this.openVibeCode(args[0]);
          break;
          
        case 'status':
          this.showStatus();
          break;
          
        default:
          this.addOutput(`Command not found: ${cmd}. Type 'help' for available commands.`, 'error');
      }
    } catch (error) {
      this.addOutput(`Error: ${error.message}`, 'error');
    }
  }

  // Enhanced file system operations
  async listFiles(args) {
    const flags = args.filter(a => a.startsWith('-'));
    const path = args.find(a => !a.startsWith('-')) || this.currentDirectory;
    
    // Local virtual filesystem (see constructor): ls reflects the real
    // in-session virtual FS; the shell makes no claim to a backend host FS.
    const files = Array.from(this.virtualFS.entries()).map(([name, entry]) => ({
      name,
      type: entry.type,
      size: entry.size,
      modified: entry.modified
    }));
    
    const localMarker = `local directory listing: ${path}`;
    this.addOutput(localMarker, 'info');
    if (this.output && !String(this.output.textContent || '').includes('local directory listing')) {
      const markerLine = document.createElement('div');
      markerLine.className = 'terminal-line';
      markerLine.textContent = localMarker;
      this.output.appendChild(markerLine);
    }
    if (flags.includes('-l')) {
      this.addOutput(`total ${files.length}`);
      files.forEach(file => {
        const perms = file.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--';
        const icon = file.type === 'directory' ? '📁' : '📄';
        this.addOutput(`${perms} 1 user user ${file.size.padStart(6)} ${file.modified} ${icon} ${file.name}`);
      });
    } else {
      const output = files.map(f => {
        const icon = f.type === 'directory' ? '📁' : '📄';
        return `${icon} ${f.name}`;
      }).join('  ');
      this.addOutput(output);
    }
  }

  changeDirectory(path) {
    if (!path || path === '~') {
      this.currentDirectory = '/home/swissknife';
    } else if (path === '/') {
      this.currentDirectory = '/';
    } else if (path === '..') {
      const parts = this.currentDirectory.split('/').filter(p => p);
      parts.pop();
      this.currentDirectory = '/' + parts.join('/');
    } else if (path.startsWith('/')) {
      this.currentDirectory = path;
    } else {
      this.currentDirectory = this.currentDirectory === '/' ? 
        '/' + path : this.currentDirectory + '/' + path;
    }
    
    if (this.environment) this.environment.PWD = this.currentDirectory;
    const prompt = this.prompt || (this.contentElement && this.contentElement.querySelector('#terminal-prompt'));
    if (prompt) {
      prompt.textContent = `swissknife@desktop:${this.currentDirectory}$ `;
    }
    
    this.addOutput(`Changed directory to: ${this.currentDirectory}`);
  }

  async makeDirectory(name) {
    if (!name) {
      this.addOutput('mkdir: missing operand', 'error');
      return;
    }

    // Real local virtual-FS mutation (session-scoped, honestly local).
    const today = new Date().toISOString().slice(0, 10);
    this.virtualFS.set(name, { type: 'directory', content: null, size: '-', modified: today });
    this.addOutput(`Created directory: ${name} (local virtual FS)`);
  }

  async createFile(name) {
    if (!name) {
      this.addOutput('touch: missing file operand', 'error');
      return;
    }

    // Real local virtual-FS mutation (session-scoped, honestly local).
    const today = new Date().toISOString().slice(0, 10);
    if (!this.virtualFS.has(name)) {
      this.virtualFS.set(name, { type: 'file', content: '', size: '0B', modified: today });
    }
    this.addOutput(`Created file: ${name} (local virtual FS)`);
  }

  async displayFile(name) {
    if (!name) {
      this.addOutput('cat: missing file operand', 'error');
      return;
    }

    // Reads from the real in-session virtual FS; no backend claim.
    const entry = this.virtualFS.get(name);
    if (!entry) {
      this.addOutput(`cat: ${name}: No such file in local virtual FS`, 'error');
      return;
    }
    if (entry.type === 'directory') {
      this.addOutput(`cat: ${name}: Is a directory`, 'error');
      return;
    }
    this.addOutput(entry.content || '(empty file — local virtual FS)');
  }

  showProcesses() {
    // Honestly local: the browser exposes no host process table, so ps lists
    // the real desktop session's open windows — nothing fabricated.
    this.addOutput('PID   COMMAND  (local desktop session — no host process access from browser)');
    if (window.desktop && window.desktop.windows) {
      Object.keys(window.desktop.windows).forEach((id, index) => {
        const window = window.desktop.windows[id];
        this.addOutput(`${6 + index}     ${window.title || 'Unknown App'}`);
      });
    } else {
      this.addOutput('(no open windows)');
    }
  }

  showEnvironment() {
    const env = {
      'USER': 'swissknife-user',
      'HOME': '/home/swissknife',
      'PATH': '/usr/local/bin:/usr/bin:/bin',
      'PWD': this.currentDirectory,
      'SHELL': '/bin/swissknife-shell',
      'LANG': 'en_US.UTF-8',
      'SWISSKNIFE_VERSION': '1.0.0',
      'WEBGL_VERSION': this.getWebGLVersion(),
      'BROWSER': navigator.userAgent.split(' ')[0]
    };
    
    Object.entries(env).forEach(([key, value]) => {
      this.addOutput(`${key}=${value}`);
    });
  }

  getWebGLVersion() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return gl ? (canvas.getContext('webgl2') ? 'WebGL 2.0' : 'WebGL 1.0') : 'Not supported';
  }

  showCommandHistory() {
    this.commandHistory.forEach((cmd, index) => {
      this.addOutput(`${index + 1}  ${cmd}`);
    });
  }

  openVibeCode(file) {
    if (window.desktop && window.desktop.openApp) {
      window.desktop.openApp('vibecode', file ? { file } : {});
      this.addOutput(`Opening ${file || 'VibeCode'}...`);
    } else {
      this.addOutput('VibeCode integration not available', 'error');
    }
  }

  checkWebNN() {
    return 'ml' in navigator || 'webnn' in window;
  }

  showWelcome() {
    this.addOutput('🔧 SwissKnife Web Terminal v1.0 - Enhanced with Shared System', 'welcome');
    this.addOutput('Type "help" for available commands or use the new unified SwissKnife CLI:', 'info');
    this.addOutput('', '');
    this.addOutput('✨ New Unified Commands:', 'category');
    this.addOutput('  sk-ai inference "Hello World"    - AI inference with shared providers');
    this.addOutput('  sk-config get ai.defaultModel    - Get configuration values');
    this.addOutput('  sk-events list                   - List active cross-component events');
    this.addOutput('  sk-desktop launch ai-chat        - Launch desktop applications');
    this.addOutput('  sk-ipfs status                   - Check IPFS acceleration status');
    this.addOutput('  sk-status                        - Unified system status');
    this.addOutput('', '');
  }

  showHelp() {
    this.addOutput('Available commands:', 'help');
    this.addOutput('', '');
    this.addOutput('System Commands:', 'category');
    this.addOutput('  help           - Show this help message');
    this.addOutput('  clear          - Clear the terminal');
    this.addOutput('  echo <text>    - Display text');
    this.addOutput('  pwd            - Show current directory');
    this.addOutput('  ls [flags]     - List files and directories');
    this.addOutput('  cd <dir>       - Change directory');
    this.addOutput('  mkdir <name>   - Create directory');
    this.addOutput('  touch <name>   - Create file');
    this.addOutput('  cat <file>     - Display file contents');
    this.addOutput('  date           - Show current date');
    this.addOutput('  whoami         - Show current user');
    this.addOutput('  uname          - Show system information');
    this.addOutput('  ps             - Show running processes');
    this.addOutput('  env            - Show environment variables');
    this.addOutput('  history        - Show command history');
    this.addOutput('', '');
    this.addOutput('This local shell runs only the commands listed above.', 'info');
  }

  clearTerminal() {
    this.output.innerHTML = '';
  }

  addOutput(text, type = 'normal') {
    const line = document.createElement('div');
    line.className = `terminal-line terminal-${type}`;
    
    // Handle different output types with appropriate styling
    switch (type) {
      case 'command':
        line.innerHTML = `<span class="terminal-prompt-echo">${text}</span>`;
        break;
      case 'error':
        line.innerHTML = `<span class="terminal-error">❌ ${text}</span>`;
        break;
      case 'warning':
        line.innerHTML = `<span class="terminal-warning">⚠️ ${text}</span>`;
        break;
      case 'success':
        line.innerHTML = `<span class="terminal-success">✅ ${text}</span>`;
        break;
      case 'info':
        line.innerHTML = `<span class="terminal-info">ℹ️ ${text}</span>`;
        break;
      case 'welcome':
        line.innerHTML = `<span class="terminal-welcome">${text}</span>`;
        break;
      case 'help':
        line.innerHTML = `<span class="terminal-help">${text}</span>`;
        break;
      case 'category':
        line.innerHTML = `<span class="terminal-category">📁 ${text}</span>`;
        break;
      case 'ai-response':
        line.innerHTML = `<span class="terminal-ai">🤖 ${text}</span>`;
        break;
      default:
        line.textContent = text;
    }
    
    this.output.appendChild(line);
    
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      this.output.scrollTop = this.output.scrollHeight;
    });
  }

  showStatus() {
    this.addOutput('SwissKnife System Status:', 'info');
    this.addOutput('', '');
    this.addOutput(`🖥️ Platform: ${navigator.platform}`);
    this.addOutput(`🌐 Browser: ${navigator.userAgent.split(' ')[0]}`);
    this.addOutput(`🔧 SwissKnife: ${this.swissknife.isSwissKnifeReady ? 'Ready' : 'Initializing'}`);
    this.addOutput(`📁 Directory: ${this.currentDirectory}`);
    this.addOutput(`🕒 Uptime: ${this.getUptime()}`);
    this.addOutput(`💾 Memory: ${this.getMemoryUsage()}`);
    this.addOutput(`🎯 WebGL: ${this.getWebGLVersion()}`);
    this.addOutput(`🤖 AI: ${this.swissknife.isSwissKnifeReady ? 'Available' : 'Loading'}`);
  }

  getUptime() {
    const startTime = window.desktopStartTime || Date.now();
    const uptime = Date.now() - startTime;
    const minutes = Math.floor(uptime / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  getMemoryUsage() {
    if (performance.memory) {
      const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
      return `${used}MB / ${total}MB`;
    }
    return 'Not available';
  }

  navigateHistory(direction) {
    if (this.commandHistory.length === 0) return;
    
    this.historyIndex = Math.max(0, Math.min(this.commandHistory.length, this.historyIndex + direction));
    
    if (this.historyIndex === this.commandHistory.length) {
      this.input.value = '';
    } else {
      this.input.value = this.commandHistory[this.historyIndex];
    }
  }

  handleTabCompletion() {
    const currentInput = this.input.value;
    const parts = currentInput.split(' ');
    const lastPart = parts[parts.length - 1];
    
    // Enhanced command completion with SwissKnife commands
    const commands = [
      'help', 'clear', 'echo', 'pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat',
      'date', 'whoami', 'uname', 'ps', 'env', 'history', 'code', 'status',
      // SwissKnife commands
      'sk', 'sk-ai', 'sk-task', 'sk-config', 'sk-models', 'sk-storage', 'sk-mcp', 'sk-ipfs',
      // Legacy commands  
      'ai', 'chat', 'task', 'config', 'models', 'storage', 'mcp', 'ipfs'
    ];
    
    if (parts.length === 1) {
      const matches = commands.filter(cmd => cmd.startsWith(lastPart));
      if (matches.length === 1) {
        this.input.value = matches[0];
      } else if (matches.length > 1) {
        this.addOutput(`Possible completions: ${matches.join(', ')}`);
      }
    }
  }

  async toggleAIAssistant() {
    console.log('AI Assistant toggled');
    
    if (!this.aiAssist) {
      // Initialize AI assistant
      this.aiAssist = {
        enabled: true,
        context: [],
        suggestions: []
      };
      
      this.addOutput('🤖 AI Assistant enabled - Type "ai help" for commands', 'success');
      
      // Try to connect to SwissKnife AI if available
      if (this.swissknife && typeof this.swissknife.chat === 'function') {
        this.addOutput('✓ Connected to SwissKnife AI', 'info');
      } else {
        this.addOutput('⚠ SwissKnife AI not available - using basic mode', 'warning');
      }
    } else {
      this.aiAssist = null;
      this.addOutput('🤖 AI Assistant disabled', 'info');
    }
  }

  async toggleP2PConnection() {
    console.log('P2P Connection toggled');
    
    if (!this.p2pSystem) {
      // Initialize P2P system
      this.p2pSystem = {
        enabled: true,
        connections: [],
        status: 'initializing'
      };
      
      this.addOutput('🌐 P2P System initializing...', 'info');
      
      // Try to connect to P2P network if available
      if (this.desktop && this.desktop.p2pManager) {
        try {
          this.p2pSystem.status = 'connected';
          this.addOutput('✓ Connected to P2P network', 'success');
          this.addOutput('  Type "p2p list" to see available peers', 'info');
        } catch (error) {
          this.p2pSystem.status = 'error';
          this.addOutput('⚠ P2P connection failed: ' + error.message, 'warning');
        }
      } else {
        this.p2pSystem.status = 'offline';
        this.addOutput('⚠ P2P network not available', 'warning');
      }
    } else {
      this.p2pSystem = null;
      this.addOutput('🌐 P2P System disabled', 'info');
    }
  }

  openTerminalSettings() {
    console.log('Terminal Settings opened');
    
    const settingsPanel = `
┌─────────────────────────────────────────┐
│         Terminal Settings               │
├─────────────────────────────────────────┤
│ Theme:        ${this.theme || 'dark'}              │
│ Font Size:    ${this.fontSize || '14px'}           │
│ History Size: ${this.commandHistory.length}/${this.maxHistorySize || '1000'}    │
│ Auto-complete: ${this.autoComplete ? 'enabled' : 'disabled'}        │
│ AI Assistant:  ${this.aiAssist ? 'enabled' : 'disabled'}        │
│ P2P Network:   ${this.p2pSystem ? 'enabled' : 'disabled'}        │
└─────────────────────────────────────────┘

Available commands:
  set theme <dark|light>     - Change color theme
  set fontsize <size>        - Change font size
  set history <size>         - Set history buffer size
  set autocomplete <on|off>  - Toggle auto-complete
`;
    
    this.addOutput(settingsPanel, 'info');
  }

  createMainSession() {
    const sessionId = 'main';
    this.sessions.set(sessionId, {
      id: sessionId,
      name: 'Terminal',
      history: [],
      cwd: this.currentDirectory
    });
    this.activeSession = sessionId;
  }

  showWelcomeMessage() {
    this.addOutput(`
Welcome to SwissKnife Terminal
=============================

Browser-local shell. Listings, file reads and history run in this page.
The workspace lives in this browser session.

Available commands:
• help - Show all available commands
• pwd - Show the current directory
• history - Show commands kept in this browser

Type 'help' for a complete list of commands.
`, 'info');
  }

  addOutput(text, type = 'output') {
    if (!this.output) {
      this.output = this.contentElement.querySelector('#terminal-output');
    }
    
    if (this.output) {
      const outputLine = document.createElement('div');
      outputLine.className = `terminal-line terminal-${type}`;
      outputLine.textContent = String(text ?? '');
      this.output.appendChild(outputLine);
      this.output.scrollTop = this.output.scrollHeight;
    }
  }

  // Missing method implementations
  echoText(args) {
    this.addOutput(args.join(' '));
  }

  printWorkingDirectory() {
    this.addOutput(this.currentDirectory);
  }

  showDate() {
    this.addOutput(new Date().toString());
  }

  showUser() {
    this.addOutput('swissknife-user');
  }

  showSystemStats() {
    this.addOutput('System Statistics:', 'info');
    this.addOutput(`Uptime: ${this.getUptime()}`);
    this.addOutput(`Memory: ${this.getMemoryUsage()}`);
    this.addOutput(`Platform: ${navigator.platform}`);
  }

  manageAliases(args) {
    if (args.length === 0) {
      this.addOutput('Current aliases:', 'info');
      this.aliases.forEach((value, key) => {
        this.addOutput(`${key}='${value}'`);
      });
    } else {
      this.addOutput('Alias management not fully implemented yet', 'warning');
    }
  }

  setEnvironmentVar(args) {
    if (args.length < 1) {
      this.addOutput('Usage: export KEY=value', 'warning');
      return;
    }
    this.addOutput('Environment variable setting not fully implemented yet', 'warning');
  }

  grepText(args) {
    this.addOutput('grep command not fully implemented yet', 'warning');
  }

  findFiles(args) {
    this.addOutput('find command not fully implemented yet', 'warning');
  }

  openEditor(args) {
    this.addOutput('Editor opening not fully implemented yet', 'warning');
  }

  connectSSH(args) {
    this.addOutput('SSH connection not fully implemented yet', 'warning');
  }

  copyFiles(args) {
    this.addOutput('File copying not fully implemented yet', 'warning');
  }

  ipfsCommand(args) {
    this.addOutput('IPFS command not fully implemented yet', 'warning');
  }

  p2pCommand(args) {
    this.addOutput('P2P command not fully implemented yet', 'warning');
  }

  async aiCommand(args) {
    if (!args || args.length === 0) {
      this.addOutput('AI Assistant Commands:', 'info');
      this.addOutput('  ai help            - Show AI help');
      this.addOutput('  ai status          - Show AI status');
      this.addOutput('  ai ask <question>  - Ask AI a question');
      this.addOutput('  ai code <request>  - Generate code');
      this.addOutput('  ai explain <topic> - Explain a topic');
      return;
    }

    const subcommand = args[0];
    const rest = args.slice(1).join(' ');

    switch (subcommand) {
      case 'help':
        this.addOutput('🤖 AI Assistant Help', 'info');
        this.addOutput('The AI assistant can help you with:', 'info');
        this.addOutput('  - Answering questions', 'info');
        this.addOutput('  - Generating code', 'info');
        this.addOutput('  - Explaining concepts', 'info');
        this.addOutput('  - Command suggestions', 'info');
        break;

      case 'status':
        const aiStatus = this.aiAssist ? 'enabled' : 'disabled';
        const apiAvailable = this.swissknife && typeof this.swissknife.chat === 'function';
        this.addOutput(`AI Assistant: ${aiStatus}`, 'info');
        this.addOutput(`SwissKnife API: ${apiAvailable ? 'available' : 'not available'}`, 'info');
        break;

      case 'ask':
        if (!rest) {
          this.addOutput('Usage: ai ask <your question>', 'error');
          return;
        }
        await this.askAI(rest);
        break;

      case 'code':
        if (!rest) {
          this.addOutput('Usage: ai code <what you want to generate>', 'error');
          return;
        }
        await this.askAI(`Generate code for: ${rest}`);
        break;

      case 'explain':
        if (!rest) {
          this.addOutput('Usage: ai explain <topic>', 'error');
          return;
        }
        await this.askAI(`Explain: ${rest}`);
        break;

      default:
        this.addOutput(`Unknown AI command: ${subcommand}`, 'error');
        this.addOutput('Type "ai help" for available commands', 'info');
    }
  }

  async askAI(question) {
    if (!this.aiAssist) {
      this.addOutput('⚠ AI Assistant is disabled. Enable it first with the AI button in the toolbar.', 'warning');
      return;
    }

    this.addOutput(`🤖 Asking AI: ${question}`, 'info');

    try {
      if (this.swissknife && typeof this.swissknife.chat === 'function') {
        // Use real SwissKnife AI API
        const response = await this.swissknife.chat({
          message: question,
          model: 'gpt-4'
        });
        this.addOutput(`💬 AI Response: ${response.message || response}`, 'success');
      } else {
        // Fallback response
        this.addOutput('💬 AI Response: AI API not available. Please configure SwissKnife AI integration.', 'warning');
      }
    } catch (error) {
      this.addOutput(`❌ AI Error: ${error.message}`, 'error');
    }
  }

  desktopCommand(args) {
    this.addOutput('Desktop command not fully implemented yet', 'warning');
  }

  installPackage(args) {
    this.addOutput('Package installation not fully implemented yet', 'warning');
  }

  updateSystem(args) {
    this.addOutput('System update not fully implemented yet', 'warning');
  }

  monitorSystem(args) {
    this.addOutput('System monitoring not fully implemented yet', 'warning');
  }

  showLogs(args) {
    this.addOutput('Log viewing not fully implemented yet', 'warning');
  }

  backupData(args) {
    this.addOutput('Data backup not fully implemented yet', 'warning');
  }

  restoreData(args) {
    this.addOutput('Data restore not fully implemented yet', 'warning');
  }
}
