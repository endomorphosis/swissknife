// Unified Streamlit Editor App - Replaces the legacy vibecode.js

import { StliteManager, StliteConfig } from '../core/stlite-manager';

export interface AppContext {
  swissknife: any;
  stlite: StliteManager;
  windows: any;
}

export class StreamlitEditorApp {
  private context: AppContext;
  private editor: HTMLTextAreaElement | null = null;
  private container: HTMLElement | null = null;

  constructor(context: AppContext) {
    this.context = context;
    console.log('✅ StreamlitEditorApp: Unified app initialized');
  }

  render(): string {
    return `
      <div class="streamlit-editor-app">
        <div class="editor-container">
          <div class="editor-header">
            <h3>🐍 Python/Streamlit Code Editor</h3>
            <div class="editor-actions">
              <button id="run-streamlit" class="btn btn-primary">▶️ Run Streamlit App</button>
              <button id="save-code" class="btn btn-secondary">💾 Save</button>
              <button id="load-template" class="btn btn-secondary">📄 Load Template</button>
            </div>
          </div>
          <div class="editor-content">
            <textarea id="python-editor" class="code-editor" placeholder="Write your Streamlit app here...">
import streamlit as st
import pandas as pd
import numpy as np

# 🎯 Welcome to the Unified Streamlit Editor!
st.title('🚀 SwissKnife Streamlit App')

st.markdown("""
This is your unified Streamlit development environment.
- ✅ Real-time code editing
- ✅ Instant preview 
- ✅ Integrated with SwissKnife AI tools
""")

# Interactive demo
if st.button('Generate Sample Data'):
    data = pd.DataFrame({
        'x': np.random.randn(100),
        'y': np.random.randn(100)
    })
    
    st.line_chart(data)
    st.success('Chart generated successfully!')

st.markdown('### 🔧 Powered by SwissKnife')
            </textarea>
          </div>
        </div>
        
        <div class="streamlit-container">
          <div class="streamlit-header">
            <h3>📊 Streamlit Output</h3>
            <div class="status-indicator" id="streamlit-status">Ready</div>
          </div>
          <div id="streamlit-app" class="streamlit-output">
            <div class="placeholder">
              <p>👈 Write your Streamlit code and click "Run" to see the output here</p>
            </div>
          </div>
          <div id="streamlit-loading" class="loading-overlay" style="display: none;">
            <div class="loading-spinner"></div>
            <p>Running Streamlit app...</p>
          </div>
        </div>
      </div>
      
      <style>
        .streamlit-editor-app {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          height: 100%;
          padding: 20px;
          background: #f5f5f5;
        }
        
        .editor-container, .streamlit-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
        }
        
        .editor-header, .streamlit-header {
          padding: 15px 20px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fafafa;
          border-radius: 8px 8px 0 0;
        }
        
        .editor-header h3, .streamlit-header h3 {
          margin: 0;
          color: #333;
        }
        
        .editor-actions {
          display: flex;
          gap: 10px;
        }
        
        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .btn-primary {
          background: #2196f3;
          color: white;
        }
        
        .btn-primary:hover {
          background: #1976d2;
        }
        
        .btn-secondary {
          background: #f0f0f0;
          color: #333;
        }
        
        .btn-secondary:hover {
          background: #e0e0e0;
        }
        
        .editor-content {
          flex: 1;
          padding: 0;
        }
        
        .code-editor {
          width: 100%;
          height: 100%;
          border: none;
          padding: 20px;
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 14px;
          line-height: 1.5;
          resize: none;
          outline: none;
          background: #fafafa;
          color: #333;
        }
        
        .streamlit-output {
          flex: 1;
          padding: 20px;
          overflow: auto;
          background: white;
        }
        
        .placeholder {
          text-align: center;
          color: #666;
          padding: 40px 20px;
        }
        
        .status-indicator {
          padding: 4px 12px;
          border-radius: 12px;
          background: #4caf50;
          color: white;
          font-size: 12px;
          font-weight: 500;
        }
        
        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255,255,255,0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }
        
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #2196f3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 10px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
  }

  onMount(window: any): void {
    this.container = window.element;
    this.setupEventListeners();
    console.log('✅ StreamlitEditorApp: Mounted and ready');
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    this.editor = this.container.querySelector('#python-editor') as HTMLTextAreaElement;
    
    // Run Streamlit button
    const runButton = this.container.querySelector('#run-streamlit');
    runButton?.addEventListener('click', () => this.runStreamlitApp());
    
    // Save code button
    const saveButton = this.container.querySelector('#save-code');
    saveButton?.addEventListener('click', () => this.saveCode());
    
    // Load template button
    const templateButton = this.container.querySelector('#load-template');
    templateButton?.addEventListener('click', () => this.loadTemplate());
    
    // Auto-save on change
    this.editor?.addEventListener('input', () => {
      this.autoSave();
    });
  }

  private async runStreamlitApp(): Promise<void> {
    if (!this.editor || !this.container) return;

    const code = this.editor.value;
    const streamlitContainer = this.container.querySelector('#streamlit-app') as HTMLElement;
    const loadingOverlay = this.container.querySelector('#streamlit-loading') as HTMLElement;
    const statusIndicator = this.container.querySelector('#streamlit-status') as HTMLElement;

    if (!streamlitContainer) return;

    try {
      // Show loading
      loadingOverlay.style.display = 'flex';
      statusIndicator.textContent = 'Running...';
      statusIndicator.style.background = '#ff9800';

      console.log('🚀 StreamlitEditorApp: Running Streamlit app...');

      // Use unified stlite manager
      const config: StliteConfig = {
        requirements: ["pandas", "numpy", "matplotlib", "plotly"],
        entrypoint: "streamlit_app.py",
        files: { "streamlit_app.py": code },
        streamlitConfig: {
          theme: {
            primaryColor: "#2196f3",
            backgroundColor: "#ffffff",
            secondaryBackgroundColor: "#f0f2f6"
          }
        }
      };

      await this.context.stlite.mount(config, streamlitContainer);

      // Update status
      statusIndicator.textContent = this.context.stlite.isRealStlite() ? 'Live' : 'Preview';
      statusIndicator.style.background = '#4caf50';

      console.log('✅ StreamlitEditorApp: App running successfully');

    } catch (error) {
      console.error('❌ StreamlitEditorApp: Error running app:', error);
      
      streamlitContainer.innerHTML = `
        <div style="padding: 20px; background: #ffebee; border-radius: 8px; border: 1px solid #f44336;">
          <h3 style="color: #d32f2f; margin-top: 0;">❌ Error Running Streamlit App</h3>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Please check your Python code and try again.</p>
        </div>
      `;
      
      statusIndicator.textContent = 'Error';
      statusIndicator.style.background = '#f44336';
      
    } finally {
      loadingOverlay.style.display = 'none';
    }
  }

  private saveCode(): void {
    if (!this.editor) return;
    
    const code = this.editor.value;
    localStorage.setItem('streamlit_editor_code', code);
    console.log('💾 StreamlitEditorApp: Code saved to localStorage');
    
    // Show save confirmation
    const btn = this.container?.querySelector('#save-code');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = '✅ Saved!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  }

  private loadTemplate(): void {
    if (!this.editor) return;
    
    const templates = [
      {
        name: 'Data Visualization',
        code: `import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px

st.title('📊 Data Visualization Dashboard')

# Generate sample data
@st.cache_data
def load_data():
    return pd.DataFrame({
        'date': pd.date_range('2023-01-01', periods=100),
        'value': np.cumsum(np.random.randn(100)),
        'category': np.random.choice(['A', 'B', 'C'], 100)
    })

data = load_data()

# Interactive chart
fig = px.line(data, x='date', y='value', color='category')
st.plotly_chart(fig, use_container_width=True)

# Data table
if st.checkbox('Show raw data'):
    st.dataframe(data)`
      }
    ];
    
    this.editor.value = templates[0].code;
    console.log('📄 StreamlitEditorApp: Template loaded');
  }

  private autoSave(): void {
    if (!this.editor) return;
    
    // Debounced auto-save
    clearTimeout((this as any).autoSaveTimeout);
    (this as any).autoSaveTimeout = setTimeout(() => {
      const code = this.editor!.value;
      localStorage.setItem('streamlit_editor_autosave', code);
    }, 2000);
  }
}
