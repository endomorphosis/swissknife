/**
 * VibeCode App - Fixed version with working functionality
 * Simplified but functional AI-Powered Streamlit Development Environment
 *
 * Native owner actions use reviewed bindings and visible confirmation.
 */
import { invokeNetworkNativeTool } from './network-native-tools.js';
import { invokeNativeTool } from '../live-tool-gateway.js';

async function vibecodeParseToolResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (_parseError) {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? (payload.error?.message || payload.error || payload.message || raw)
      : (raw || ('HTTP ' + response.status));
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (payload && typeof payload === 'object' && payload.error) {
    const message = payload.error.message || payload.error;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'result')) {
    return payload.result;
  }
  return payload;
}

function vibecodeDatasetIdInsideDatasetData(dataset_data) {
  if (!dataset_data || typeof dataset_data !== 'object' || Array.isArray(dataset_data)) {
    return undefined;
  }
  return dataset_data.dataset_id;
}

function vibecodeArgumentsForDatasetPublish(tool, toolArguments) {
  const publishTool = tool === 'publish' || tool === 'save_dataset' || tool === 'dataset_tools.save_dataset';
  if (!publishTool || !toolArguments || typeof toolArguments !== 'object') {
    return toolArguments;
  }
  const args = { ...toolArguments };
  const dataset_id = vibecodeDatasetIdInsideDatasetData(args.dataset_data);
  if (args.dataset_id === undefined && dataset_id !== undefined) {
    args.dataset_id = dataset_id;
  }
  return args;
}

class VibeCodeApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = desktop?.swissknife || null;
    
    // Core configuration  
    this.currentFile = null;
    this.workspacePath = '/svf-vibecode-source/marker_fn.py';
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
    const persisted = this.readDraft();
    const currentCode = persisted !== null ? persisted : (this.currentFile ? this.currentFile.content : this.getDefaultStreamlitCode());
    let remoteNote = 'Remote file not saved yet.';
    try {
      const note = JSON.parse(localStorage.getItem('vibecode-remote-note') || 'null');
      if (note && note.content === currentCode && note.path === this.workspacePath && note.note === 'Remote file saved.') {
        remoteNote = note.note;
      }
    } catch (_noteError) {
      remoteNote = 'Remote file not saved yet.';
    }
    
    return `
      <div class="vibecode-container" data-theme="dark">
        <style>
          .vibecode-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 0;
            container-type: inline-size;
            background: #1e1e1e;
            color: #ffffff;
            font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
          }
          
          .vibecode-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.5rem;
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

          .vibe-btn:focus-visible {
            outline: 2px solid #8ab4ff;
            outline-offset: 2px;
          }
          
          .vibe-btn.ai {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-color: #667eea;
          }
          
          .main-content {
            display: flex;
            flex: 1;
            min-height: 0;
            overflow: auto;
          }
          
          .code-section {
            flex: 1 1 16rem;
            min-width: 0;
            min-height: 12rem;
            display: flex;
            flex-direction: column;
            background: #1e1e1e;
            overflow: auto;
          }
          
          .code-editor-container {
            flex: 1;
            position: relative;
          }
          
          .code-editor {
            width: 100%;
            height: 100%;
            min-height: 10rem;
            background: #1e1e1e;
            color: #d4d4d4;
            border: none;
            padding: 1rem;
            font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            line-height: 1.5;
            resize: none;
            outline: none;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            overflow: auto;
          }
          
          .preview-section {
            flex: 1 1 12rem;
            min-width: 0;
            min-height: 6rem;
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
            flex-wrap: wrap;
            gap: 0.25rem 0.75rem;
            padding: 0.25rem 1rem;
            background: #252526;
            border-top: 1px solid #3e3e42;
            font-size: 0.75rem;
            color: #cccccc;
          }

          .status-left, .status-right {
            min-width: 0;
            overflow-wrap: anywhere;
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
            justify-content: flex-start;
            padding: 0.5rem 0.75rem;
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
          
          #vibecode-diff {
            margin-left: 0.75rem;
          }

          #vibecode-save-error {
            margin-left: 0.75rem;
            color: #ffb4b4;
          }

          #vibecode-save-error:empty {
            display: none;
          }

          .vibecode-workspace {
            flex: 0 0 auto;
            overflow: visible;
            padding: 0.35rem 0.5rem;
            display: flex;
            gap: 0.35rem;
            flex-wrap: wrap;
            align-items: center;
          }

          .vibecode-workspace .vibe-btn {
            flex: 0 0 auto;
            padding: 0.35rem 0.5rem;
            font-size: 0.75rem;
          }

          .vibecode-workspace label {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            flex: 1 1 100%;
            min-width: min(100%, 16rem);
            gap: 0.2rem;
          }

          #vibecode-workspace-path {
            width: 100%;
            box-sizing: border-box;
            font-size: 0.75rem;
          }

          #vibecode-workspace-result {
            display: block;
            visibility: visible;
            flex: 1 1 100%;
            min-width: 0;
            min-height: 1.25rem;
            max-height: 1.5rem;
            overflow: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          @media (max-width: 768px) {
            .main-content {
              flex-direction: column;
            }

            .code-section {
              flex: 1 1 12rem;
              min-height: 9rem;
            }
            
            .preview-section {
              flex: 0 0 2.5rem;
              max-height: 2.5rem;
              border-left: none;
              border-top: 1px solid #3e3e42;
            }
            
            .ai-panel {
              width: 100%;
              border-left: none;
              border-top: 1px solid #3e3e42;
            }
          }

          @container (max-width: 640px) {
            .vibecode-workspace .vibe-btn {
              padding: 0.28rem 0.4rem;
              font-size: 0.7rem;
            }

            .main-content {
              flex-direction: column;
            }

            .code-section {
              flex: 1 1 12rem;
              min-height: 9rem;
            }

            .preview-section {
              flex: 0 0 2.5rem;
              max-height: 2.5rem;
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
            <button class="vibe-btn" id="settings-btn" aria-label="Settings" title="Settings">⚙️</button>
          </div>
        </div>

        <section class="vibecode-workspace" aria-label="Remote workspace">
          <label>Workspace path <input id="vibecode-workspace-path" aria-label="Virtual workspace path" value="${this.workspacePath}"></label>
          <button type="button" class="vibe-btn" id="vibecode-write-file">Save remote file</button>
          <button type="button" class="vibe-btn" id="vibecode-list-files">List workspace</button>
          <button type="button" class="vibe-btn" id="vibecode-open-file">Open remote file</button>
          <output id="vibecode-workspace-result" role="status" aria-live="polite">${remoteNote}</output>
        </section>

        <!-- Main Content -->
        <div class="main-content">
          <!-- Code Editor -->
          <div class="code-section">
            <div class="code-editor-container">
              <textarea 
                id="code-editor" 
                class="code-editor" 
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                placeholder="Start coding your Streamlit app here..."
              >${currentCode}</textarea>
            </div>
          </div>

          <!-- Preview Section -->
          <div class="preview-section" id="preview-section">
            <div class="loading-indicator">
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
              <button class="vibe-btn ai sk-btn sk-btn-primary" id="send-ai-btn" data-native-gateway-binding="vibecode.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task">Send</button>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
          <div class="status-left">
            <span id="status-text">Ready</span>
            <output id="vibecode-diff" aria-label="Function diff">No function change to describe.</output>
            <span id="vibecode-save-error" role="alert"></span>
          </div>
          <div class="status-right">
            <span>Python | Streamlit | Line 1, Col 1</span>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners(window) {
    const root = window.querySelector('.vibecode-container') || window;
    this.boundEventRoots ||= new WeakSet();
    if (this.boundEventRoots.has(root)) return;
    this.boundEventRoots.add(root);
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
    
    for (const [id, tool] of [['vibecode-list-files', 'files_ls'], ['vibecode-open-file', 'files_read'], ['vibecode-write-file', 'files_write']]) {
      const button = window.querySelector(`#${id}`);
      button?.addEventListener('click', (event) => {
        if (event.target !== button) return;
        if (button.hasAttribute('data-gateway-confirm') || this.workspaceBusy) return;
        event.preventDefault();
        this.runWorkspaceOperation(window, tool, button);
      });
    }

    // Code editor events
    const codeEditor = window.querySelector('#code-editor');
    if (codeEditor) {
      codeEditor.addEventListener('input', () => {
        this.updateStatus(window, 'Modified');
        this.updateDiff(window);
      });
    }
    this.updateDiff(window);
    
    console.log('✅ VibeCode event listeners setup complete');
  }

  async runWorkspaceOperation(container, toolId, trigger) {
    const output = container.querySelector('#vibecode-workspace-result');
    const gatewayHost = container;
    this.workspaceBusy = true;
    output?.removeAttribute('data-workspace-outcome');
    container.querySelector('#status-text')?.removeAttribute('data-workspace-outcome');
    try {
      if (!['files_ls', 'files_read', 'files_write'].includes(toolId)) throw new Error('Unsupported workspace operation.');
      const path = String(container.querySelector('#vibecode-workspace-path')?.value || '').trim();
      if (!path.startsWith('/') || path.includes('\0') || path.split('/').includes('..')) throw new Error('Choose an absolute virtual workspace path without parent traversal.');
      const content = container.querySelector('#code-editor')?.value || '';
      const persist = toolId === 'files_write';
      const bindingId = persist ? 'vibecode.ipfs_kit_py.persist_artifact' : 'vibecode.ipfs_kit_py.list_virtual_files';
      const dispatchedTool = persist ? 'artifacts_put' : toolId;
      let payload;
      if (persist) {
        const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
        const { contentCidForBytes, base64ForBytes } = clientModule;
        const bytes = new TextEncoder().encode(content);
        const cid = await contentCidForBytes(bytes);
        payload = {
          path,
          content,
          fixture_scope: 'svf-vibecode-source',
          cid,
          bytes_base64: base64ForBytes(bytes)
        };
      } else {
        payload = { path: toolId === 'files_ls' ? path.slice(0, path.lastIndexOf('/')) || '/' : path, fixture_scope: 'svf-vibecode-source' };
      }
      const response = await invokeNativeTool(gatewayHost, 'vibecode', bindingId, { executionMode: 'execute', toolId: dispatchedTool, payload, trigger });
      const liveRoot = (container && container.isConnected ? container : null)
        || (typeof document !== 'undefined' ? document.querySelector('.window[data-app-id="vibecode"]') : null)
        || container;
      const liveOutput = liveRoot?.querySelector('#vibecode-workspace-result') || output;
      if (response === null) {
        if (liveOutput) liveOutput.textContent = `${toolId} cancelled before dispatch.`;
        return null;
      }
      const outcome = typeof response?.outcome === 'string' ? response.outcome : '';
      const rejectedOutcome = ['cancelled', 'canceled', 'preview', 'dry_run', 'denied', 'failed', 'error', 'unavailable'].includes(outcome);
      const preview = response?.preview === true || response?.dry_run === true || response?.result?.preview === true || response?.result?.dry_run === true;
      const failed = response?.ok === false || !!response?.error || rejectedOutcome || preview;
      const executed = !failed && (outcome === 'executed' || outcome === 'ok' || outcome === 'success' || response?.result !== undefined);
      if (!executed) throw new Error(response?.error || response?.result?.error || outcome || 'Workspace owner did not execute the request.');
      const contentRoot = (typeof document !== 'undefined'
        ? document.querySelector('.window[data-app-id="vibecode"] .window-app-content')
        : null) || liveRoot;
      const executedOutput = contentRoot?.querySelector?.('#vibecode-workspace-result') || liveOutput;
      if (executedOutput?.setAttribute) {
        executedOutput.style.visibility = 'visible';
        executedOutput.setAttribute('data-workspace-outcome', 'executed');
      }
      this.workspacePath = path;
      const records = [response.result];
      let readContent;
      for (let index = 0; index < records.length && index < 24; index++) {
        const record = records[index];
        if (!record || typeof record !== 'object') continue;
        if (typeof record.content === 'string') readContent = record.content;
        if (typeof record.text === 'string') readContent = record.text;
        if (record.result && typeof record.result === 'object') records.push(record.result);
        const parts = Array.isArray(record.content) ? record.content : [];
        for (const item of parts) {
          if (!item || typeof item !== 'object') continue;
          if (item.json && typeof item.json === 'object') records.push(item.json);
          else if (item.type === 'text' && typeof item.text === 'string') {
            try { records.push(JSON.parse(item.text)); }
            catch { readContent = item.text; }
          }
        }
      }
      const editor = liveRoot?.querySelector('#code-editor');
      if (toolId === 'files_read' && readContent !== undefined && editor) editor.value = readContent;
      if (liveOutput) {
        liveOutput.setAttribute('data-workspace-outcome', 'executed');
        const listed = toolId === 'files_ls' && response?.result !== undefined ? ` ${JSON.stringify(response.result)}` : '';
        liveOutput.textContent = toolId === 'files_write'
          ? 'Remote file saved.'
          : (toolId === 'files_read' ? 'Remote file opened.' : `${toolId} finished.${listed}`);
        if (toolId === 'files_write') {
          try {
            localStorage.setItem('vibecode-remote-note', JSON.stringify({ path, content, note: 'Remote file saved.' }));
          } catch (_noteError) {}
          this.updateStatus(contentRoot || liveRoot || container, 'Ready');
        }
      }
      return response;
    } catch (error) {
      const liveFail = (typeof document !== 'undefined'
        ? document.querySelector('.window[data-app-id="vibecode"] .window-app-content #vibecode-workspace-result')
        : null) || output;
      if (liveFail) liveFail.textContent = `${toolId} failed: ${error.message}`;
      this.updateStatus(container, 'Workspace operation failed');
      return null;
    } finally {
      this.workspaceBusy = false;
    }
  }

  newFile(window) {
    const codeEditor = window.querySelector('#code-editor');
    if (codeEditor) {
      codeEditor.value = this.getDefaultStreamlitCode();
      this.currentFile = null;
      this.updateStatus(window, 'New file created');
    }
  }

  readDraft() {
    try {
      const value = localStorage.getItem('vibecode-draft');
      return typeof value === 'string' ? value : null;
    } catch (_error) {
      return null;
    }
  }

  sourceProblem(content) {
    let depth = 0;
    for (const ch of content) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth < 0) return 'Unbalanced ) in source.';
    }
    if (depth !== 0) return 'Unbalanced ( in source.';
    return '';
  }

  updateDiff(root) {
    const code = root.querySelector('#code-editor')?.value || '';
    const diff = root.querySelector('#vibecode-diff');
    if (!diff) return;
    const match = code.match(/(?:async\s+def|def|function)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    diff.textContent = match ? `Diff describes ${match[1]}` : 'No function change to describe.';
  }

  saveFile(window) {
    const codeEditor = window.querySelector('#code-editor');
    if (!codeEditor) return;
    const content = codeEditor.value;
    const errorEl = window.querySelector('#vibecode-save-error');
    const problem = this.sourceProblem(content);
    if (problem) {
      if (errorEl) errorEl.textContent = `${problem} Edits were kept.`;
      this.updateStatus(window, 'Save blocked: invalid source');
      this.updateDiff(window);
      return;
    }
    const path = String(window.querySelector('#vibecode-workspace-path')?.value || this.workspacePath || '').trim();
    const filename = path.split('/').filter(Boolean).pop() || 'streamlit_app.py';
    try {
      const saved = JSON.parse(localStorage.getItem('vibecode-files') || '{}');
      saved[filename] = { content, savedAt: new Date().toISOString() };
      localStorage.setItem('vibecode-files', JSON.stringify(saved));
      localStorage.setItem('vibecode-draft', content);
    } catch (storageError) {
      if (errorEl) errorEl.textContent = `Storage unavailable. Unsaved edits were kept. ${storageError.message}`;
      this.updateStatus(window, 'Save failed: storage unavailable');
      return;
    }
    if (errorEl) errorEl.textContent = '';
    this.currentFile = { name: filename, content };
    this.updateStatus(window, `Draft saved locally: ${filename}`);
    const remoteStatus = window.querySelector('#vibecode-workspace-result');
    if (remoteStatus && remoteStatus.getAttribute('data-workspace-outcome') !== 'executed') {
      let remembered = false;
      try {
        const note = JSON.parse(localStorage.getItem('vibecode-remote-note') || 'null');
        remembered = !!(note && note.content === content && note.path === path && note.note === 'Remote file saved.');
      } catch (_noteError) {
        remembered = false;
      }
      remoteStatus.textContent = remembered ? 'Remote file saved.' : 'Local draft only. Remote file not saved yet.';
    }
    this.updateDiff(window);
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
      const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
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
      const result = await invokeNetworkNativeTool(window, 'vibecode', 'mcp++:ipfs_kit_py/artifacts/put', {
        cid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'vibecode-artifact',
        kind: 'streamlit-code',
        service: 'ipfs_kit_py',
        pin: true
      }, window.querySelector('#run-btn'));
      if (result === null) { this.updateStatus(window, 'Run cancelled before dispatch'); return; }
      if (result.persisted !== true || result.cid !== cid) {
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
          <h3>${error.preview ? 'Validated artifact preview' : '⚠️ Run failed'}</h3>
          <p style="font-family: monospace;">${String(error.message || error)}</p>
          <p>${error.preview ? 'The code was not persisted or executed.' : 'The code was not persisted. The error above is the verbatim backend response.'}</p>
        </div>
      `;
      this.updateStatus(window, error.preview ? 'Artifact preview validated' : 'Run failed');
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

    try {
      const { invokeNativeTool } = await import('../live-tool-gateway.js');
      const response = await invokeNativeTool(window, 'vibecode', 'vibecode.ipfs_accelerate_py.submit_inference', {
        toolId: 'submit_task', trigger: window.querySelector('#send-ai-btn'),
        payload: { task_type: 'inference', prompt: message, payload: { prompt: message, code: window.querySelector('#code-editor')?.value || '' } },
      });
      if (response === null) {
        aiInput.value = message;
        return;
      }
      if (!response?.ok || response.outcome !== 'executed') throw new Error(response?.error || response?.result?.error || response?.outcome || 'Inference owner did not execute the request.');
      this.addAIMessage(window, `Inference request acknowledged by ipfs_accelerate_py. Correlation: ${response.correlation_id}; receipt: ${response.receipt?.receipt_id || 'unavailable'}.`, 'assistant');
    } catch (error) {
      this.addAIMessage(window, `AI request failed: ${error.message}`, 'assistant');
    } finally {
      aiMessages.querySelector('.ai-loading')?.remove();
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
