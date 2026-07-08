// CLEAN REBUILD AFTER CORRUPTION
// Minimal SwissKnife desktop bootstrap (TypeScript + Vite friendly)
// FILE INTENTIONALLY TRUNCATED – only core code below.

import '/css/aero-enhanced.css';
import '/css/desktop.css';
import '/css/windows.css';
import '/css/terminal.css';
import '/css/apps.css';
import '/css/model-browser.css';

interface DesktopApp { id:string; title:string; icon?:string; width?:number; height?:number; loader:(container:HTMLElement)=>void; }

class SwissKnifeDesktop {
  private apps = new Map<string, DesktopApp>();
  private z = 10;
  private desktop!: HTMLElement;
  private taskbar!: HTMLElement;
  constructor(){ this.init(); }

  private init(){
    this.desktop = document.getElementById('desktop') || this.mk('desktop','desktop');
    this.taskbar = document.getElementById('taskbar') || this.mk('taskbar','taskbar');
    this.registerDefaults();
    this.bindKeys();
    console.log('[SwissKnife] Desktop ready');
  }
  private mk(id:string, cls:string){ const el=document.createElement('div'); el.id=id; el.className=cls; document.body.appendChild(el); return el; }
  private register(app:DesktopApp){ this.apps.set(app.id, app); }
  private registerDefaults(){ this.register({ id:'ai-chat', title:'AI Chat', icon:'🤖', width:460, height:520, loader: c=>this.loadAIChat(c) }); }

  private loadAIChat(root:HTMLElement){
    root.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;font:13px system-ui,monospace;">
      <div style="background:#222;color:#fff;padding:6px 8px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
        <span>🤖 SwissKnife AI (placeholder)</span>
        <button data-clear style="background:#444;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">Clear</button>
      </div>
      <div class="messages" style="flex:1;overflow:auto;padding:8px;background:#111;color:#ddd;font-size:12px;">
        <div style="opacity:.65;">AI ready. Press F2 or type below...</div>
      </div>
      <form class="entry" style="display:flex;gap:4px;padding:6px;background:#1a1a1a;">
        <input name="q" autocomplete="off" placeholder="Message" style="flex:1;background:#000;border:1px solid #333;color:#ddd;padding:6px 8px;border-radius:4px;font-size:12px;" />
        <button style="background:#2563eb;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">Send</button>
      </form>
    </div>`;
    const form=root.querySelector('form') as HTMLFormElement;
    const input=form.querySelector('input') as HTMLInputElement;
    const messages=root.querySelector('.messages') as HTMLElement;
    form.addEventListener('submit', e=>{ e.preventDefault(); const t=input.value.trim(); if(!t) return; messages.insertAdjacentHTML('beforeend', `<div style="margin:4px 0;color:#4ade80;">You: ${t.replace(/</g,'&lt;')}</div>`); input.value=''; messages.scrollTop=messages.scrollHeight; setTimeout(()=>{ messages.insertAdjacentHTML('beforeend', `<div style=\"margin:4px 0;\">AI: (placeholder response)</div>`); messages.scrollTop=messages.scrollHeight; }, 300); });
    (root.querySelector('[data-clear]') as HTMLButtonElement).addEventListener('click', ()=>{ messages.innerHTML='<div style="opacity:.65;">Chat cleared.</div>'; });
  }
  private bindKeys(){ document.addEventListener('keydown', e=>{ if(e.key==='F2') this.launch('ai-chat'); }); }
  launch(id:string){ const app=this.apps.get(id); if(!app) return console.warn('[SwissKnife] App not found', id); const w=this.makeWindow(app); try{ app.loader(w.querySelector('.window-content') as HTMLElement);}catch(err){ (w.querySelector('.window-content') as HTMLElement).innerHTML=`<pre style="color:#f87171;white-space:pre-wrap;">${(err as Error).message}</pre>`; } }
  private makeWindow(app:DesktopApp){ const w=document.createElement('div'); w.className='window'; Object.assign(w.style,{position:'absolute',left:Math.round(60+Math.random()*140)+'px',top:Math.round(50+Math.random()*100)+'px',width:(app.width||420)+'px',height:(app.height||400)+'px',background:'#181818',border:'1px solid #333',display:'flex',flexDirection:'column',zIndex:String(++this.z)}); w.innerHTML=`<div class="titlebar" style="cursor:move;background:#262626;color:#eee;padding:4px 8px;font-size:12px;display:flex;align-items:center;gap:6px;"><span>${app.icon||'📦'}</span><div style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${app.title}</div><button data-close style="background:#444;color:#fff;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px;">✕</button></div><div class="window-content" style="flex:1;min-height:0;overflow:auto;background:#111;"></div>`; this.desktop.appendChild(w); this.makeDraggable(w.querySelector('.titlebar') as HTMLElement, w); (w.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click',()=>w.remove()); const btn=document.createElement('button'); btn.textContent=app.title; btn.style.cssText='margin:0 4px;padding:4px 8px;font-size:12px;cursor:pointer;background:#222;color:#ddd;border:1px solid #333;border-radius:4px;'; btn.addEventListener('click',()=>{ w.style.zIndex=String(++this.z); }); this.taskbar.appendChild(btn); return w; }
  private makeDraggable(handle:HTMLElement, win:HTMLElement){ let ox=0,oy=0,down=false,sx=0,sy=0; handle.addEventListener('mousedown', e=>{ down=true; sx=e.clientX; sy=e.clientY; const r=win.getBoundingClientRect(); ox=r.left; oy=r.top; win.style.zIndex=String(++this.z); e.preventDefault(); }); window.addEventListener('mousemove', e=>{ if(!down) return; win.style.left=(ox+(e.clientX-sx))+'px'; win.style.top=(oy+(e.clientY-sy))+'px'; }); window.addEventListener('mouseup', ()=>{ down=false; }); }
}

export function getFileContent(path:string):string {
  if(path.endsWith('.md')) return '# Placeholder Markdown\nContent pending.';
  if(path.endsWith('.json')) return '{ "placeholder": true }';
  if(path.endsWith('.txt')) return 'Plain text placeholder.';
  return 'File preview not available.';
}

function bootstrap(){ (window as any).desktop=new SwissKnifeDesktop(); (window as any).desktop.launch('ai-chat'); }
if(typeof document!=='undefined'){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootstrap); else bootstrap(); }

// END OF FILE - ensure no legacy code remains below this line.
          const typingIndicator = document.getElementById('typing-indicator');
          const clearBtn = document.getElementById('clear-chat');
          // CLEAN REBUILD AFTER CORRUPTION
          // Minimal SwissKnife desktop bootstrap (TypeScript + Vite friendly)
          // Keep this file SMALL. Only core window manager + placeholder AI Chat.

          import '/css/aero-enhanced.css';
          import '/css/desktop.css';
          import '/css/windows.css';
          import '/css/terminal.css';
          import '/css/apps.css';
          import '/css/model-browser.css';

          interface DesktopApp { id: string; title: string; icon?: string; width?: number; height?: number; loader: (container: HTMLElement) => void; }

          class SwissKnifeDesktop {
            private apps = new Map<string, DesktopApp>();
            private z = 10;
            private desktop!: HTMLElement;
            private taskbar!: HTMLElement;

            constructor() { this.init(); }

            private init() {
              this.desktop = document.getElementById('desktop') || this.mkRoot('desktop','desktop');
              this.taskbar = document.getElementById('taskbar') || this.mkRoot('taskbar','taskbar');
              this.registerDefaults();
              this.bindKeys();
              console.log('[SwissKnife] Desktop initialized');
            }

            private mkRoot(id:string,cls:string){ const el=document.createElement('div'); el.id=id; el.className=cls; document.body.appendChild(el); return el; }
            private register(app: DesktopApp){ this.apps.set(app.id, app); }

            private registerDefaults(){
              this.register({ id:'ai-chat', title:'AI Chat', icon:'🤖', width:460, height:520, loader: c => this.loadAIChat(c) });
            }

            private loadAIChat(root: HTMLElement){
              root.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;font:13px system-ui,monospace;">
                <div style="background:#222;color:#fff;padding:6px 8px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
                  <span>🤖 SwissKnife AI (placeholder)</span>
                  <button data-act="clear" style="background:#444;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">Clear</button>
                </div>
                <div class="messages" style="flex:1;overflow:auto;padding:8px;background:#111;color:#ddd;font-size:12px;">
                  <div style="opacity:.65;">AI ready. Ask something...</div>
                </div>
                <form class="entry" style="display:flex;gap:4px;padding:6px;background:#1a1a1a;">
                  <input name="q" placeholder="Message" autocomplete="off" style="flex:1;background:#000;border:1px solid #333;color:#ddd;padding:6px 8px;border-radius:4px;font-size:12px;" />
                  <button style="background:#2563eb;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">Send</button>
                </form>
              </div>`;
              const form=root.querySelector('form') as HTMLFormElement;
              const input=form.querySelector('input') as HTMLInputElement;
              const messages=root.querySelector('.messages') as HTMLElement;
              form.addEventListener('submit', e=>{ e.preventDefault(); const text=input.value.trim(); if(!text) return; messages.insertAdjacentHTML('beforeend', `<div style="margin:4px 0;color:#4ade80;">You: ${text.replace(/</g,'&lt;')}</div>`); input.value=''; messages.scrollTop=messages.scrollHeight; setTimeout(()=>{ messages.insertAdjacentHTML('beforeend', `<div style="margin:4px 0;">AI: (placeholder response)</div>`); messages.scrollTop=messages.scrollHeight; }, 320); });
              (root.querySelector('[data-act="clear"]') as HTMLButtonElement).addEventListener('click', ()=>{ messages.innerHTML='<div style="opacity:.65;">Chat cleared.</div>'; });
            }

            private bindKeys(){ document.addEventListener('keydown', e=>{ if(e.key==='F2') this.launch('ai-chat'); }); }
            launch(id:string){ const app=this.apps.get(id); if(!app) return console.warn('[SwissKnife] App not found', id); const w=this.makeWindow(app); try{ app.loader(w.querySelector('.window-content') as HTMLElement);}catch(err){ (w.querySelector('.window-content') as HTMLElement).innerHTML = `<pre style="color:#f87171;white-space:pre-wrap;">${(err as Error).message}</pre>`; } }

            private makeWindow(app: DesktopApp){
              const w=document.createElement('div');
              w.className='window';
              Object.assign(w.style,{ position:'absolute', left:Math.round(60+Math.random()*140)+'px', top:Math.round(50+Math.random()*100)+'px', width:(app.width||420)+'px', height:(app.height||400)+'px', background:'#181818', border:'1px solid #333', display:'flex', flexDirection:'column', zIndex:String(++this.z) });
              w.innerHTML=`<div class="titlebar" style="cursor:move;background:#262626;color:#eee;padding:4px 8px;font-size:12px;display:flex;align-items:center;gap:6px;">
                <span>${app.icon||'📦'}</span><div style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${app.title}</div>
                <button data-close style="background:#444;color:#fff;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
              </div><div class="window-content" style="flex:1;min-height:0;overflow:auto;background:#111;"></div>`;
              this.desktop.appendChild(w);
              this.makeDraggable(w.querySelector('.titlebar') as HTMLElement, w);
              (w.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', ()=> w.remove());
              const btn=document.createElement('button'); btn.textContent=app.title; btn.style.cssText='margin:0 4px;padding:4px 8px;font-size:12px;cursor:pointer;background:#222;color:#ddd;border:1px solid #333;border-radius:4px;'; btn.addEventListener('click', ()=>{ w.style.zIndex=String(++this.z); }); this.taskbar.appendChild(btn); return w;
            }

            private makeDraggable(handle:HTMLElement, win:HTMLElement){ let ox=0,oy=0,down=false,sx=0,sy=0; handle.addEventListener('mousedown', e=>{ down=true; sx=e.clientX; sy=e.clientY; const r=win.getBoundingClientRect(); ox=r.left; oy=r.top; win.style.zIndex=String(++this.z); e.preventDefault(); }); window.addEventListener('mousemove', e=>{ if(!down) return; win.style.left=(ox+(e.clientX-sx))+'px'; win.style.top=(oy+(e.clientY-sy))+'px'; }); window.addEventListener('mouseup', ()=>{ down=false; }); }
          }

          export function getFileContent(path:string): string {
            if(path.endsWith('.md')) return '# Placeholder Markdown\nContent pending.';
            if(path.endsWith('.json')) return '{ "placeholder": true }';
            if(path.endsWith('.txt')) return 'Plain text placeholder.';
            return 'File preview not available.';
          }

          function bootstrap(){ (window as any).desktop = new SwissKnifeDesktop(); (window as any).desktop.launch('ai-chat'); }
          if(typeof document!=='undefined'){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootstrap); else bootstrap(); }
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(\`HTTP error! status: \${response.status}\`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SwissKnifeUtils;
} else {
    window.SwissKnifeUtils = SwissKnifeUtils;
}
\`;
                  } else if (fileName.endsWith('.css')) {
                    return \`/* SwissKnife CSS Styles */

:root {
    --primary-color: #007acc;
    --secondary-color: #6f42c1;
    --success-color: #28a745;
    --warning-color: #ffc107;
    --danger-color: #dc3545;
    --info-color: #17a2b8;
    
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-dark: #343a40;
    
    --text-primary: #212529;
    --text-secondary: #6c757d;
    --text-light: #ffffff;
    
    --border-color: #dee2e6;
    --border-radius: 4px;
    
    --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --font-family-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
}

body {
    font-family: var(--font-family);
    line-height: 1.5;
    color: var(--text-primary);
    background-color: var(--bg-secondary);
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.btn {
    display: inline-block;
    padding: 8px 16px;
    margin: 4px;
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-primary {
    background-color: var(--primary-color);
    color: var(--text-light);
}

.btn-primary:hover {
    background-color: #0056b3;
}

.card {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    padding: 20px;
    margin: 10px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.code {
    font-family: var(--font-family-mono);
    background: #f4f4f4;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.9em;
}

@media (max-width: 768px) {
    .container {
        padding: 0 10px;
    }
    
    .btn {
        padding: 6px 12px;
        font-size: 14px;
    }
}
\`;
                  } else if (fileName.endsWith('.md')) {
                    if (fileName === 'README.md') {
                      return \`# SwissKnife AI Project

A comprehensive AI-powered development toolkit with voice control, collaborative features, and advanced automation capabilities.

## Features

- 🎤 **Voice Control**: Natural language commands for coding
- 🤖 **AI Assistant**: Intelligent code analysis and suggestions  
- 🌐 **P2P Collaboration**: Real-time collaborative development
- 📊 **Analytics Dashboard**: Performance monitoring and insights
- 🔧 **Multi-tool Integration**: 28+ integrated applications
- 🏗️ **Modular Architecture**: Easy to extend and customize

## Quick Start

1. **Installation**
   \\\`\\\`\\\`bash
   pip install -r requirements.txt
   \\\`\\\`\\\`

2. **Configuration**
   \\\`\\\`\\\`bash
   cp .env.example .env
   # Edit .env with your API keys
   \\\`\\\`\\\`

3. **Run the Application**
   \\\`\\\`\\\`bash
   streamlit run src/app.py
   \\\`\\\`\\\`

## Voice Commands

- "Create new file" - Creates a new file
- "Add todo: [task]" - Adds a task to the AI todo system
- "Run the code" - Executes the current code
- "Explain this code" - Get AI explanation of code
- "Fix errors" - AI-assisted error resolution
- "Generate tests" - Auto-generate unit tests

## Project Structure

\\\`\\\`\\\`
swissknife-project/
├── src/                    # Source code
│   ├── components/         # UI components
│   ├── api/               # API routes and handlers
│   ├── app.py             # Main application
│   └── config.py          # Configuration
├── tests/                 # Test files
├── static/                # Static assets
├── docs/                  # Documentation
└── requirements.txt       # Dependencies
\\\`\\\`\\\`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- 📧 Email: support@swissknife.ai
- 💬 Discord: [SwissKnife Community](https://discord.gg/swissknife)
- 📖 Docs: [docs.swissknife.ai](https://docs.swissknife.ai)
\`;
                    } else if (fileName === 'API.md') {
                      return \`# SwissKnife API Documentation

## Overview

The SwissKnife API provides programmatic access to all AI-powered features including voice control, code analysis, and collaborative development tools.

## Authentication

All API requests require an API key passed in the Authorization header:

\\\`\\\`\\\`
Authorization: Bearer YOUR_API_KEY
\\\`\\\`\\\`

## Base URL

\\\`\\\`\\\`
https://api.swissknife.ai/v1
\\\`\\\`\\\`

## Endpoints

### AI Assistant

#### POST /ai/analyze
Analyze code and get AI suggestions.

**Request:**
\\\`\\\`\\\`json
{
    "code": "def hello_world():\\n    print('Hello!')",
    "language": "python"
}
\\\`\\\`\\\`

**Response:**
\\\`\\\`\\\`json
{
    "suggestions": ["Add type hints", "Add docstring"],
    "complexity": "low",
    "score": 92
}
\\\`\\\`\\\`

#### POST /ai/generate-tests
Generate unit tests for given code.

#### POST /ai/explain
def example():
        
                
                function updateEditorTab(filePath) {
                  const fileName = filePath.split('/').pop();
                  const tab = document.querySelector('.editor-tab');
                  if (tab) {
                    const icon = getFileIcon(fileName);
                    tab.innerHTML = \`\${icon} \${fileName} <span class="close-tab" style="margin-left: 8px; cursor: pointer;">×</span>\`;
                    tab.setAttribute('data-file', filePath);
                  }
                }
                
                function getFileIcon(fileName) {
                  if (fileName.endsWith('.py')) return '🐍';
                  if (fileName.endsWith('.js')) return '📜';
                  if (fileName.endsWith('.css')) return '🎨';
                  if (fileName.endsWith('.html')) return '🌐';
                  if (fileName.endsWith('.md')) return '📝';
                  if (fileName.endsWith('.json')) return '📊';
                  if (fileName.endsWith('.txt')) return '📄';
                  if (fileName.endsWith('.png') || fileName.endsWith('.jpg')) return '🖼️';
                  if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) return '⚙️';
                  return '📄';
                }
                
                function getLanguageFromFile(fileName) {
                  if (fileName.endsWith('.py')) return 'Python';
                  if (fileName.endsWith('.js')) return 'JavaScript';
                  if (fileName.endsWith('.css')) return 'CSS';
                  if (fileName.endsWith('.html')) return 'HTML';
                  if (fileName.endsWith('.md')) return 'Markdown';
                  if (fileName.endsWith('.json')) return 'JSON';
                  return 'Text';
                }
                
                function updateStatusBarFile(fileName, language) {
                  const statusBar = document.querySelector('.status-bar span');
                  if (statusBar) {
                    const currentStatus = statusBar.textContent;
                    const updatedStatus = currentStatus.replace(/File: [^|]*/, \`File: \${fileName}\`).replace(/Language: [^|]*/, \`Language: \${language}\`);
                    statusBar.textContent = updatedStatus;
                  }
                }
              </script>
            </div>
            
            <!-- AI Todo System -->
            <div class="todo-system" style="flex: 1; border-top: 1px solid #ddd;">
              <div class="todo-header" style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                🤖 AI Todo
                <button class="add-todo-btn" style="background: none; border: none; font-size: 16px; cursor: pointer;" title="Add Todo">+</button>
              </div>
              <div class="todo-input" style="padding: 8px; border-bottom: 1px solid #ddd;">
                <input type="text" class="new-todo-input" placeholder="Tell AI what to do..." style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;">
                <div class="ai-priority" style="margin-top: 4px; font-size: 10px; color: #666;">
                  🧠 AI will prioritize and suggest tasks
                </div>
              </div>
              <div class="todo-list" style="flex: 1; overflow-y: auto; padding: 4px;">
                <div class="todo-item high-priority" style="padding: 6px; margin: 2px 0; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 3px; font-size: 12px;">
                  <div style="display: flex; align-items: center; margin-bottom: 2px;">
                    <input type="checkbox" style="margin-right: 6px;">
                    <span style="font-weight: bold;">🔥 Fix API integration</span>
                  </div>
                  <div style="color: #666; font-size: 11px;">AI Priority: High • Voice: "Fix the API"</div>
                </div>
                <div class="todo-item medium-priority" style="padding: 6px; margin: 2px 0; background: #d1ecf1; border-left: 3px solid #17a2b8; border-radius: 3px; font-size: 12px;">
                  <div style="display: flex; align-items: center; margin-bottom: 2px;">
                    <input type="checkbox" style="margin-right: 6px;">
                    <span>📊 Add data visualization</span>
                  </div>
                  <div style="color: #666; font-size: 11px;">AI Priority: Medium • Voice: "Add charts"</div>
                </div>
                <div class="todo-item low-priority" style="padding: 6px; margin: 2px 0; background: #d4edda; border-left: 3px solid #28a745; border-radius: 3px; font-size: 12px;">
                  <div style="display: flex; align-items: center; margin-bottom: 2px;">
                    <input type="checkbox" checked style="margin-right: 6px;">
                    <span style="text-decoration: line-through;">✅ Setup project structure</span>
                  </div>
                  <div style="color: #666; font-size: 11px;">AI Priority: Completed • Voice: "Setup done"</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Editor Panel -->
          <div class="editor-panel" style="flex: 1; display: flex; flex-direction: column;">
            <div class="editor-tabs" style="display: flex; background: #e9ecef; border-bottom: 1px solid #ddd;">
              <div class="editor-tab active" data-file="app.py" style="padding: 8px 16px; cursor: pointer; border-right: 1px solid #ddd; background: white;">
                🐍 app.py
                <span class="close-tab" style="margin-left: 8px; cursor: pointer;">×</span>
              </div>
            </div>
            
            <div class="editor-container" style="flex: 1; position: relative;">
              <textarea class="code-editor" style="width: 100%; height: 100%; border: none; padding: 12px; font-family: 'Consolas', 'Monaco', monospace; font-size: 14px; line-height: 1.5; resize: none; outline: none;" placeholder="# Start coding your Streamlit app here...">import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px

# SwissKnife AI-Enhanced Streamlit Application
st.set_page_config(
    page_title="SwissKnife AI App",
    page_icon="🔧",
    layout="wide"
)

def main():
    st.title("🔧 SwissKnife AI Application")
    st.sidebar.header("Navigation")
    
    # AI-powered features
    page = st.sidebar.selectbox("Choose a feature:", [
        "Dashboard", 
        "Data Analysis", 
        "AI Chat", 
        "Model Browser",
        "P2P Collaboration"
    ])
    
    if page == "Dashboard":
        st.header("📊 AI Dashboard")
        
        # Sample metrics
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Active Models", "12", "+2")
        with col2:
            st.metric("API Calls", "1,234", "+15%")
        with col3:
            st.metric("P2P Peers", "8", "+1")
        with col4:
            st.metric("GPU Usage", "76%", "-5%")
        
        # Sample chart
        data = pd.DataFrame(
            np.random.randn(20, 3),
            columns=['AI Models', 'Performance', 'Usage']
        )
        
        fig = px.line(data, title="AI System Performance")
        st.plotly_chart(fig, use_container_width=True)
        
    elif page == "Data Analysis":
        st.header("📈 AI Data Analysis")
        st.write("Upload your data for AI-powered analysis")
        
        uploaded_file = st.file_uploader("Choose a CSV file", type="csv")
        if uploaded_file is not None:
            df = pd.read_csv(uploaded_file)
            st.write("Data Preview:")
            st.dataframe(df.head())
            
            st.write("AI Analysis:")
            st.info("🤖 This data contains " + str(len(df)) + " rows and " + str(len(df.columns)) + " columns. AI suggests focusing on correlation analysis.")
    
    elif page == "AI Chat":
        st.header("🤖 AI Assistant")
        st.write("Chat with SwissKnife AI")
        
        if "messages" not in st.session_state:
            st.session_state.messages = []
        
        for message in st.session_state.messages:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])
        
        if prompt := st.chat_input("Ask me anything about SwissKnife..."):
            st.session_state.messages.append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.markdown(prompt)
            
            with st.chat_message("assistant"):
                response = f"I'm SwissKnife AI. You asked: '{prompt}'. This is a demo response - full AI integration available with API keys configured."
                st.markdown(response)
            st.session_state.messages.append({"role": "assistant", "content": response})

if __name__ == "__main__":
    main()
</textarea>
            </div>
          </div>
          
          <!-- Enhanced Output/Preview Panel -->
          <div class="preview-panel" style="width: 300px; border-left: 1px solid #ddd; background: #f8f9fa; display: flex; flex-direction: column;">
            <div class="preview-header" style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between;">
              <span>🔍 Live Preview</span>
              <div>
                <button class="voice-status" id="voice-status" style="background: none; border: none; cursor: pointer; margin-right: 4px;" title="Voice Control Status">🔴</button>
                <button class="refresh-preview" style="background: none; border: none; cursor: pointer;">🔄</button>
              </div>
            </div>
            <div class="preview-content" style="flex: 1; padding: 12px; overflow-y: auto;">
              <div class="preview-placeholder" style="text-align: center; color: #666; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;">🎯</div>
                <div>SwissKnife AI App Preview</div>
                <div style="font-size: 12px; margin-top: 8px;">Say "Run the code" or click "Run"</div>
                <div style="margin-top: 16px; padding: 12px; background: #e3f2fd; border-radius: 4px; font-size: 12px;">
                  <strong>🎤 Voice Commands:</strong><br>
                  • "Create new file"<br>
                  • "Add todo: [task]"<br>
                  • "Run the code"<br>
                  • "Explain this code"<br>
                  • "Fix errors"<br>
                  • "Generate tests"
                </div>
                <div style="margin-top: 12px; padding: 12px; background: #f3e5f5; border-radius: 4px; font-size: 12px;">
                  <strong>🤖 AI Features:</strong><br>
                  • Real-time code analysis<br>
                  • Smart autocompletion<br>
                  • Voice-to-code generation<br>
                  • Intelligent task prioritization<br>
                  • Collaborative development
                </div>
              </div>
            </div>
            
            <!-- Voice Command History -->
            <div class="voice-history" style="border-top: 1px solid #ddd; max-height: 120px; overflow-y: auto;">
              <div class="history-header" style="padding: 4px 8px; font-size: 11px; font-weight: bold; color: #666;">
                🎤 Voice History
              </div>
              <div class="history-list" style="padding: 4px;">
                <div class="history-item" style="font-size: 10px; color: #888; padding: 2px 4px;">
                  "Create a new Python file" → ✅ app.py created
                </div>
                <div class="history-item" style="font-size: 10px; color: #888; padding: 2px 4px;">
                  "Add todo fix the API" → ✅ Todo added with high priority
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Enhanced Status Bar -->
        <div class="status-bar" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 12px; background: #007acc; color: white; font-size: 12px;">
          <span>Status: Ready | File: app.py | Language: Python | Voice: 🔴 Inactive</span>
          <span>🤖 AI Assistant: Available | 📋 Todos: 2 pending | 🎤 Voice: Ready | WebGPU: Enabled</span>
        </div>
      </div>
    `;
    
    // Add enhanced VibeCode functionality with voice control
    this.setupEnhancedVibeCodeEditor(contentElement);
  }
  
  setupEnhancedVibeCodeEditor(contentElement: HTMLElement) {
    const codeEditor = contentElement.querySelector('.code-editor') as HTMLTextAreaElement;
    const runBtn = contentElement.querySelector('.run-code-btn') as HTMLButtonElement;
    const aiBtn = contentElement.querySelector('.ai-assist-btn') as HTMLButtonElement;
    const voiceBtn = contentElement.querySelector('#voice-btn') as HTMLButtonElement;
    const todoBtn = contentElement.querySelector('.todo-btn') as HTMLButtonElement;
    const voiceStatus = contentElement.querySelector('#voice-status') as HTMLButtonElement;
    const previewContent = contentElement.querySelector('.preview-content') as HTMLElement;
    const fileItems = contentElement.querySelectorAll('.file-item') as NodeListOf<HTMLElement>;
    const languageSelect = contentElement.querySelector('.editor-language') as HTMLSelectElement;
    const newTodoInput = contentElement.querySelector('.new-todo-input') as HTMLInputElement;
    const todoList = contentElement.querySelector('.todo-list') as HTMLElement;
    const historyList = contentElement.querySelector('.history-list') as HTMLElement;
    
    // Virtual Filesystem Implementation
    class VirtualFileSystem {
      private providers: { [key: string]: any } = {};
      private currentProvider = 'local';
      
      constructor() {
        this.initializeProviders();
      }
      
      private async initializeProviders() {
        // Initialize Local Provider
        this.providers['local'] = {
          type: 'local',
          connected: true,
          files: this.getDefaultFileStructure()
        };
        
        // Initialize S3 Provider (simulation)
        this.providers['s3'] = {
          type: 's3',
          connected: false,
          config: { bucket: '', region: 'us-east-1' },
          files: {}
        };
        
        // Initialize Helia (IPFS) Provider
        this.providers['helia'] = {
          type: 'helia',
          connected: false,
          node: null,
          files: {}
        };
        
        // Initialize Storacha Provider
        this.providers['storacha'] = {
          type: 'storacha',
          connected: false,
          config: { apiKey: '', endpoint: '' },
          files: {}
        };
        
        this.updateProviderTabs();
      }
      
      private getDefaultFileStructure() {
        return {
          'src/': {
            'app.py': '🐍',
            'config.py': '⚙️',
            'components/': {
              'ui.py': '🐍',
              'api.py': '🐍',
              'models.py': '🐍'
            },
            'utils/': {
              'helpers.py': '🐍',
              'validators.py': '🐍'
            }
          },
          'tests/': {
            'test_app.py': '🐍',
            'test_api.py': '🐍',
            'conftest.py': '🐍'
          },
          'docs/': {
            'README.md': '📝',
            'API.md': '📝',
            'CHANGELOG.md': '📝'
          },
          'static/': {
            'css/': {
              'style.css': '🎨',
              'bootstrap.css': '🎨'
            },
            'js/': {
              'script.js': '⚡',
              'utils.js': '⚡'
            }
          },
          'cloud/': {
            's3_files/': {},
            'ipfs_content/': {},
            'storacha_data/': {}
          },
          'requirements.txt': '📋',
          'package.json': '📋',
          '.env': '⚙️',
          '.gitignore': '📄'
        };
      }
      
      async connectProvider(provider: string, config: any = {}) {
        try {
          switch (provider) {
            case 's3':
              await this.connectS3(config);
              break;
            case 'helia':
              await this.connectHelia(config);
              break;
            case 'storacha':
              await this.connectStoracha(config);
              break;
          }
          this.updateProviderTabs();
          this.showNotification(`Connected to ${provider.toUpperCase()}`, 'success');
        } catch (error) {
          this.showNotification(`Failed to connect to ${provider}: ${error}`, 'error');
        }
      }
      
      private async connectS3(config: any) {
        // Simulate S3 connection
        this.providers['s3'].connected = true;
        this.providers['s3'].config = config;
        this.providers['s3'].files = {
          'my-bucket/': {
            'uploads/': {
              'image1.jpg': '🖼️',
              'document.pdf': '📄'
            },
            'backups/': {
              'backup.zip': '🗃️'
            },
            'config.json': '📋'
          }
        };
      }
      
      private async connectHelia(config: any) {
        // Simulate Helia/IPFS connection
        this.providers['helia'].connected = true;
        this.providers['helia'].files = {
          'ipfs/': {
            'QmHash1.../': {
              'content.md': '📝',
              'data.json': '📋'
            },
            'QmHash2.../': {
              'image.png': '🖼️'
            }
          }
        };
      }
      
      private async connectStoracha(config: any) {
        // Simulate Storacha connection
        this.providers['storacha'].connected = true;
        this.providers['storacha'].config = config;
        this.providers['storacha'].files = {
          'storacha/': {
            'encrypted/': {
              'sensitive.enc': '🔒',
              'backup.enc': '🔒'
            },
            'public/': {
              'readme.txt': '📄'
            }
          }
        };
      }
      
      private updateProviderTabs() {
        const providerTabs = contentElement.querySelector('.provider-tabs');
        if (providerTabs) {
          providerTabs.innerHTML = Object.keys(this.providers).map(provider => {
            const p = this.providers[provider];
            const status = p.connected ? '🟢' : '🔴';
            const active = provider === this.currentProvider ? 'active' : '';
            return `
              <button class="provider-tab ${active}" data-provider="${provider}">
                ${status} ${provider.toUpperCase()}
              </button>
            `;
          }).join('');
          
          // Add event listeners
          providerTabs.querySelectorAll('.provider-tab').forEach(tab => {
            tab.addEventListener('click', () => {
              this.switchProvider((tab as HTMLElement).dataset.provider!);
            });
          });
        }
      }
      
      private switchProvider(provider: string) {
        this.currentProvider = provider;
        this.updateProviderTabs();
        this.refreshFileTree();
      }
      
      private refreshFileTree() {
        const fileTree = contentElement.querySelector('.file-tree');
        if (fileTree) {
          const files = this.providers[this.currentProvider].files;
          fileTree.innerHTML = this.renderFileTree(files, '/');
          this.addFileTreeListeners();
        }
      }
      
      private renderFileTree(files: any, basePath: string, level: number = 0): string {
        if (!files || typeof files !== 'object') return '';
        
        return Object.entries(files).map(([name, content]) => {
          const isFolder = typeof content === 'object' && !name.includes('.');
          const icon = isFolder ? '📁' : (content as string);
          const path = basePath + name;
          const indent = '  '.repeat(level);
          
          if (isFolder) {
            const folderId = `folder-${Math.random().toString(36).substr(2, 9)}`;
            const folderContent = this.renderFileTree(content, path + '/', level + 1);
            return `
              <div class="file-item folder" data-path="${path}">
                <span class="folder-toggle" data-target="${folderId}" style="margin-left: ${level * 20}px; cursor: pointer;">
                  ${icon} ${name}
                </span>
                <div class="folder-content" id="${folderId}" style="display: block;">
                  ${folderContent}
                </div>
              </div>
            `;
          } else {
            return `
              <div class="file-item file" data-path="${path}" style="margin-left: ${(level + 1) * 20}px; padding: 4px 8px; cursor: pointer; border-radius: 4px;">
                ${icon} ${name}
              </div>
            `;
          }
        }).join('');
      }
      
      private addFileTreeListeners() {
        // Folder toggle listeners
        contentElement.querySelectorAll('.folder-toggle').forEach(toggle => {
          toggle.addEventListener('click', () => {
            const targetId = (toggle as HTMLElement).dataset.target;
            const content = contentElement.querySelector(`#${targetId}`);
            if (content) {
              const isVisible = (content as HTMLElement).style.display !== 'none';
              (content as HTMLElement).style.display = isVisible ? 'none' : 'block';
              const icon = toggle.textContent?.charAt(0);
              toggle.textContent = toggle.textContent?.replace(icon!, isVisible ? '📁' : '📂') || '';
            }
          });
        });
        
        // File selection listeners
        contentElement.querySelectorAll('.file-item.file').forEach(fileItem => {
          fileItem.addEventListener('click', () => {
            // Remove previous selection
            contentElement.querySelectorAll('.file-item.selected').forEach(item => {
              item.classList.remove('selected');
            });
            
            // Add selection to clicked item
            fileItem.classList.add('selected');
            
            // Load file content
            const path = (fileItem as HTMLElement).dataset.path;
            this.loadFileContent(path!);
          });
        });
      }
      
      private async loadFileContent(path: string) {
        const fileName = path.split('/').pop() || '';
        let content = '';
        
        // Generate sample content based on file type
        if (fileName.endsWith('.py')) {
          content = `# ${fileName}\nimport streamlit as st\nimport pandas as pd\n\ndef main():\n    st.title("${fileName.replace('.py', '').replace('_', ' ').toUpperCase()}")\n    st.write("Hello from ${fileName}!")\n\nif __name__ == "__main__":\n    main()`;
        } else if (fileName.endsWith('.md')) {
          content = `# ${fileName.replace('.md', '').replace('_', ' ').toUpperCase()}\n\nThis is a markdown file for ${fileName}.\n\n## Features\n\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Usage\n\n\`\`\`python\n# Example usage\nprint("Hello World")\n\`\`\``;
        } else if (fileName.endsWith('.js')) {
          content = `// ${fileName}\nconst ${fileName.replace('.js', '').replace('-', '_')} = {\n    init: function() {\n        console.log('${fileName} initialized');\n    },\n    \n    run: function() {\n        this.init();\n    }\n};\n\n${fileName.replace('.js', '').replace('-', '_')}.run();`;
        } else if (fileName.endsWith('.json')) {
          content = `{\n  "name": "${fileName.replace('.json', '')}",\n  "version": "1.0.0",\n  "description": "Generated configuration file",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "test": "jest"\n  }\n}`;
        } else {
          content = `Content of ${fileName}\n\nThis file is located at: ${path}\nProvider: ${this.currentProvider.toUpperCase()}\n\nLast modified: ${new Date().toLocaleString()}`;
        }
        
        codeEditor.value = content;
        this.updateStatusBar(`Loaded: ${fileName} from ${this.currentProvider.toUpperCase()}`);
      }
      
      private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          border-radius: 6px;
          color: white;
          font-weight: 500;
          z-index: 10000;
          animation: slideIn 0.3s ease-out;
          background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 3000);
      }
      
      private updateStatusBar(message: string) {
        const statusBar = contentElement.querySelector('.status-bar');
        if (statusBar) {
          statusBar.textContent = message;
        }
      }
      
      async uploadFile(file: File, path: string) {
        try {
          const provider = this.providers[this.currentProvider];
          // Simulate file upload
          this.showNotification(`Uploading ${file.name} to ${this.currentProvider.toUpperCase()}...`, 'info');
          
          // Simulate upload delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          this.showNotification(`Successfully uploaded ${file.name}`, 'success');
          this.refreshFileTree();
        } catch (error) {
          this.showNotification(`Upload failed: ${error}`, 'error');
        }
      }
      
      async syncBetweenProviders(fromProvider: string, toProvider: string, path: string) {
        try {
          this.showNotification(`Syncing from ${fromProvider} to ${toProvider}...`, 'info');
          
          // Simulate sync delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          this.showNotification(`Sync completed successfully`, 'success');
        } catch (error) {
          this.showNotification(`Sync failed: ${error}`, 'error');
        }
      }
    }
    
    // Initialize Virtual Filesystem
    const vfs = new VirtualFileSystem();
    
    // Voice recognition setup
    let isVoiceActive = false;
    let recognition: any = null;
    
    // Check for Web Speech API support
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        isVoiceActive = true;
        voiceBtn.style.background = '#28a745';
        voiceBtn.innerHTML = '🎤 Listening...';
        voiceStatus.innerHTML = '🟢';
        voiceStatus.title = 'Voice Control Active';
        updateStatusBar('Voice: 🟢 Active');
      };
      
      recognition.onend = () => {
        isVoiceActive = false;
        voiceBtn.style.background = '#dc3545';
        voiceBtn.innerHTML = '🎤 Voice';
        voiceStatus.innerHTML = '🔴';
        voiceStatus.title = 'Voice Control Inactive';
        updateStatusBar('Voice: 🔴 Inactive');
      };
      
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        
        if (transcript.trim()) {
          processVoiceCommand(transcript.trim());
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        addToHistory(`Voice error: ${event.error}`, false);
      };
    } else {
      voiceBtn.disabled = true;
      voiceBtn.innerHTML = '🎤 Unsupported';
      voiceBtn.title = 'Speech recognition not supported in this browser';
    }
    
    // Voice control button
    voiceBtn.addEventListener('click', () => {
      if (!recognition) return;
      
      if (isVoiceActive) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
    
    // Process voice commands
    function processVoiceCommand(command: string) {
      const cmd = command.toLowerCase();
      let success = false;
      let response = '';
      
      if (cmd.includes('run') && (cmd.includes('code') || cmd.includes('app'))) {
        runBtn.click();
        response = 'Code executed';
        success = true;
      } else if (cmd.includes('new file') || cmd.includes('create file')) {
        const fileName = extractFileName(cmd) || 'new_file.py';
        createNewFile(fileName);
        response = `${fileName} created`;
        success = true;
      } else if (cmd.includes('add todo') || cmd.includes('todo')) {
        const todoText = cmd.replace(/add todo:?|todo:?/g, '').trim();
        if (todoText) {
          addTodoItem(todoText, 'medium');
          response = 'Todo added';
          success = true;
        }
      } else if (cmd.includes('explain') || cmd.includes('what does')) {
        aiBtn.click();
        response = 'AI explanation requested';
        success = true;
      } else if (cmd.includes('fix') && cmd.includes('error')) {
        addTodoItem('Fix errors in code', 'high');
        response = 'Error fix added to todos';
        success = true;
      } else if (cmd.includes('generate test') || cmd.includes('create test')) {
        addTodoItem('Generate unit tests', 'medium');
        response = 'Test generation added to todos';
        success = true;
      } else if (cmd.includes('save') || cmd.includes('save file')) {
        // Simulate save
        updateStatusBar('Status: Saved');
        response = 'File saved';
        success = true;
      } else {
        response = `Unknown command: "${command}"`;
      }
      
      addToHistory(`"${command}" → ${success ? '✅' : '❌'} ${response}`, success);
    }
    
    // Helper functions
    function extractFileName(command: string): string | null {
      const match = command.match(/(?:file|create)\s+(\w+\.?\w*)/i);
      return match ? match[1] : null;
    }
    
    function createNewFile(fileName: string) {
      const fileTree = contentElement.querySelector('.file-tree');
      if (fileTree) {
        // Find the root folder content to add the new file
        const rootFolderContent = fileTree.querySelector('[data-path="/"] .folder-content');
        if (rootFolderContent) {
          const newFileItem = document.createElement('div');
          newFileItem.className = 'file-item';
          newFileItem.dataset.file = fileName;
          newFileItem.style.cssText = 'padding: 2px 8px; cursor: pointer; display: flex; align-items: center;';
          newFileItem.setAttribute('onclick', `selectFile(event, '${fileName}')`);
          
          const icon = getFileIcon(fileName);
          newFileItem.innerHTML = `
            <span style="margin-right: 10px;"></span>
            <span style="margin-right: 6px;">${icon}</span>${fileName}
          `;
          
          // Insert before the last root-level file to maintain order
          const rootFiles = rootFolderContent.children;
          let insertBefore = null;
          for (let i = rootFiles.length - 1; i >= 0; i--) {
            if (rootFiles[i].classList.contains('file-item')) {
              insertBefore = rootFiles[i].nextSibling;
              break;
            }
          }
          
          if (insertBefore) {
            rootFolderContent.insertBefore(newFileItem, insertBefore);
          } else {
            rootFolderContent.appendChild(newFileItem);
          }
        }
      }
      
      // Helper function to get file icon (moved inside for scope)
      function getFileIcon(fileName: string): string {
        if (fileName.endsWith('.py')) return '🐍';
        if (fileName.endsWith('.js')) return '📜';
        if (fileName.endsWith('.css')) return '🎨';
        if (fileName.endsWith('.html')) return '🌐';
        if (fileName.endsWith('.md')) return '📝';
        if (fileName.endsWith('.json')) return '📊';
        if (fileName.endsWith('.txt')) return '📄';
        if (fileName.endsWith('.png') || fileName.endsWith('.jpg')) return '🖼️';
        if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) return '⚙️';
        return '📄';
      }
    }
    
    function addTodoItem(text: string, priority: 'high' | 'medium' | 'low') {
      const priorityColors = {
        high: { bg: '#fff3cd', border: '#ffc107', icon: '🔥' },
        medium: { bg: '#d1ecf1', border: '#17a2b8', icon: '📋' },
        low: { bg: '#d4edda', border: '#28a745', icon: '💡' }
      };
      
      const color = priorityColors[priority];
      const todoItem = document.createElement('div');
      todoItem.className = `todo-item ${priority}-priority`;
      todoItem.style.cssText = `padding: 6px; margin: 2px 0; background: ${color.bg}; border-left: 3px solid ${color.border}; border-radius: 3px; font-size: 12px;`;
      
      todoItem.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 2px;">
          <input type="checkbox" style="margin-right: 6px;">
          <span>${color.icon} ${text}</span>
        </div>
        <div style="color: #666; font-size: 11px;">AI Priority: ${priority} • Voice: Added via voice</div>
      `;
      
      // Add to top of todo list
      const firstTodo = todoList.querySelector('.todo-item');
      if (firstTodo) {
        todoList.insertBefore(todoItem, firstTodo);
      } else {
        todoList.appendChild(todoItem);
      }
      
      // Update todo count in status bar
      const todoCount = todoList.querySelectorAll('.todo-item input:not(:checked)').length;
      updateStatusBar(`📋 Todos: ${todoCount} pending`);
    }
    
    function addToHistory(message: string, success: boolean) {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.style.cssText = 'font-size: 10px; color: #888; padding: 2px 4px;';
      historyItem.textContent = message;
      
      historyList.insertBefore(historyItem, historyList.firstChild);
      
      // Keep only last 10 history items
      while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild!);
      }
    }
    
    function updateStatusBar(update: string) {
      const statusBar = contentElement.querySelector('.status-bar span') as HTMLElement;
      if (statusBar) {
        const currentText = statusBar.textContent || '';
        if (update.includes('Voice:')) {
          statusBar.textContent = currentText.replace(/Voice: [^|]+/, update);
        } else if (update.includes('Status:')) {
          statusBar.textContent = currentText.replace(/Status: [^|]+/, update);
        } else if (update.includes('Todos:')) {
          const rightStatus = contentElement.querySelector('.status-bar span:last-child') as HTMLElement;
          if (rightStatus) {
            rightStatus.textContent = rightStatus.textContent?.replace(/📋 Todos: \d+ pending/, update) || '';
          }
        }
      }
    }
    
    function switchToFile(fileName: string) {
      // Update active file visual indicator
      fileItems.forEach(f => {
        f.style.background = 'transparent';
        f.style.color = '';
      });
      
      const activeFile = Array.from(fileItems).find(item => item.dataset.file === fileName);
      if (activeFile) {
        activeFile.style.background = '#007acc';
        activeFile.style.color = 'white';
      }
      
      // Load file content (using templates or creating new content)
      codeEditor.value = getFileContent(fileName);
      
      // Update tab and status
      const tab = contentElement.querySelector('.editor-tab') as HTMLElement;
      const icon = getFileIcon(fileName);
      tab.innerHTML = `${icon} ${fileName} <span class="close-tab" style="margin-left: 8px; cursor: pointer;">×</span>`;
      
      updateStatusBar(`Status: Ready | File: ${fileName}`);
    }
    
    function getFileIcon(fileName: string): string {
      if (fileName.endsWith('.py')) return '🐍';
      if (fileName.endsWith('.js')) return '📜';
      if (fileName.endsWith('.md')) return '📝';
      if (fileName.endsWith('.json')) return '⚙️';
      return '📄';
    }
    
    function getFileContent(fileName: string): string {
      // File templates with enhanced AI-powered content
      const fileTemplates: { [key: string]: string } = {
      'app.py': `import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px

# SwissKnife AI-Enhanced Streamlit Application
st.set_page_config(
    page_title="SwissKnife AI App",
    page_icon="🎯",
    layout="wide"
)

def main():
    st.title("🎯 SwissKnife AI Application")
    st.sidebar.header("Navigation")
    
    # AI-powered features
    page = st.sidebar.selectbox("Choose a feature:", [
        "Dashboard", 
        "Data Analysis", 
        "AI Chat", 
        "Voice Commands",
        "P2P Collaboration"
    ])
    
    if page == "Dashboard":
        st.header("📊 AI Dashboard")
        
        # Sample metrics
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Active Models", "12", "+2")
        with col2:
            st.metric("API Calls", "1,234", "+15%")
        with col3:
            st.metric("P2P Peers", "8", "+1")
        with col4:
            st.metric("Voice Commands", "24", "+8")
        
        # Sample chart
        data = pd.DataFrame(
            np.random.randn(20, 3),
            columns=['AI Models', 'Performance', 'Usage']
        )
        
        fig = px.line(data, title="AI System Performance")
        st.plotly_chart(fig, use_container_width=True)
        
    elif page == "Voice Commands":
        st.header("🎤 Voice Control Integration")
        st.write("Voice commands processed by VibeCode AI")
        
        # Voice command history
        voice_commands = [
            {"command": "Create new file", "status": "✅", "time": "2 min ago"},
            {"command": "Add todo fix API", "status": "✅", "time": "5 min ago"},
            {"command": "Run the code", "status": "✅", "time": "8 min ago"}
        ]
        
        st.dataframe(pd.DataFrame(voice_commands))

if __name__ == "__main__":
    main()`,
      'requirements.txt': `streamlit>=1.28.0
pandas>=1.5.0
plotly>=5.0.0
numpy>=1.24.0
scikit-learn>=1.3.0
openai>=1.0.0
anthropic>=0.8.0
requests>=2.31.0
# Voice processing
SpeechRecognition>=3.10.0
pydub>=0.25.1
# AI and ML
torch>=2.0.0
transformers>=4.35.0
sentence-transformers>=2.2.0`,
      'config.py': `# SwissKnife Enhanced Configuration

# AI Providers with voice integration
AI_PROVIDERS = {
    'openai': {
        'api_key': 'your-openai-api-key',
        'voice_model': 'whisper-1',
        'chat_model': 'gpt-4'
    },
    'anthropic': {
        'api_key': 'your-anthropic-api-key',
        'model': 'claude-3-sonnet-20240229'
    },
    'huggingface': {
        'token': 'your-huggingface-token',
        'voice_model': 'facebook/wav2vec2-large-960h',
        'text_model': 'microsoft/DialoGPT-large'
    }
}

# Voice Control Configuration
VOICE_CONFIG = {
    'enabled': True,
    'language': 'en-US',
    'continuous': True,
    'auto_todo_priority': True,
    'voice_to_code': True,
    'commands': {
        'create_file': ['create file', 'new file', 'make file'],
        'run_code': ['run code', 'execute', 'run app'],
        'add_todo': ['add todo', 'create task', 'todo'],
        'explain_code': ['explain', 'what does this do', 'describe'],
        'fix_errors': ['fix errors', 'debug', 'fix bugs'],
        'generate_tests': ['create tests', 'generate tests', 'test this']
    }
}

# P2P Configuration with voice collaboration
P2P_CONFIG = {
    'enable_collaboration': True,
    'max_peers': 10,
    'share_models': True,
    'voice_chat': True,
    'sync_todos': True,
    'collaborative_coding': True
}

# Performance Configuration
PERFORMANCE_CONFIG = {
    'use_webgpu': True,
    'cache_models': True,
    'optimize_inference': True,
    'voice_processing_threads': 2,
    'real_time_analysis': True
}

# Todo System Configuration
TODO_CONFIG = {
    'ai_prioritization': True,
    'voice_input': True,
    'smart_suggestions': True,
    'auto_categorization': True,
    'deadline_prediction': True
}`,
      'README.md': `# 🎯 SwissKnife AI Application - Voice-Enabled IDE

This is a maximally agentic AI-enhanced Streamlit application built with SwissKnife VibeCode.

## 🎤 Voice Control Features

### Voice Commands
- **"Create new file"** - Creates a new file in the project
- **"Add todo: [task]"** - Adds a new todo item with AI prioritization  
- **"Run the code"** - Executes the current application
- **"Explain this code"** - Gets AI explanation of selected code
- **"Fix errors"** - Analyzes and suggests error fixes
- **"Generate tests"** - Creates unit tests for your code

### AI Todo System
- 🧠 **Intelligent Prioritization** - AI automatically prioritizes tasks
- 🎤 **Voice Input** - Add todos via voice commands
- 📊 **Smart Categories** - Auto-categorizes tasks by type and urgency
- ⏰ **Deadline Prediction** - AI estimates completion times

## 🤖 AI Features

- **Real-time code analysis** with voice feedback
- **Smart autocompletion** based on voice context
- **Voice-to-code generation** for rapid development
- **Intelligent task prioritization** using ML algorithms
- **Collaborative development** with voice chat
- **Multi-model AI support** (OpenAI, Anthropic, Hugging Face)

## 🔧 Getting Started

1. **Install requirements**: \`pip install -r requirements.txt\`
2. **Configure API keys** in \`config.py\`
3. **Enable microphone** permissions in your browser
4. **Run the app**: \`streamlit run app.py\`
5. **Start voice control** by clicking the 🎤 Voice button

## 🌐 P2P Collaboration

- **Voice Chat** - Talk with team members while coding
- **Shared Todos** - Synchronized todo lists across peers
- **Collaborative Coding** - Real-time code sharing and editing
- **Distributed AI** - Share AI processing across the network

## 🚀 Advanced Features

- **WebGPU Acceleration** for AI inference
- **Real-time Performance Monitoring**
- **Automated Testing** with voice commands
- **Smart Error Detection** and fixes
- **Context-aware Code Suggestions**

## 📊 Voice Analytics

The system tracks and learns from your voice patterns to provide:
- Better command recognition
- Personalized task prioritization  
- Improved code suggestions
- Context-aware AI responses

---

*Built with Swiss precision for maximally agentic development* 🇨🇭`
    };
    
    return fileTemplates[fileName] || `# New file: ${fileName}\n\n# Add your content here...`;
    }
    
    // File items are now handled by inline onclick events in the tree structure
    
    // Run code button
    runBtn.addEventListener('click', () => {
      const code = codeEditor.value;
      
      // Simulate running the Streamlit app
      previewContent.innerHTML = `
        <div style="border: 1px solid #ddd; border-radius: 4px; background: white; height: 100%;">
          <div style="background: #ff4b4b; color: white; padding: 8px; font-weight: bold;">
            🔧 SwissKnife AI Application
          </div>
          <div style="padding: 16px;">
            <h3>📊 AI Dashboard</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
              <div style="background: #f0f2f6; padding: 8px; border-radius: 4px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #007acc;">12</div>
                <div style="font-size: 12px; color: #666;">Active Models</div>
              </div>
              <div style="background: #f0f2f6; padding: 8px; border-radius: 4px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #28a745;">1,234</div>
                <div style="font-size: 12px; color: #666;">API Calls</div>
              </div>
            </div>
            <div style="background: #f8f9fa; padding: 12px; border-radius: 4px; border: 1px solid #dee2e6;">
              <div style="font-size: 12px; color: #666; margin-bottom: 8px;">📈 AI System Performance</div>
              <div style="height: 60px; background: linear-gradient(45deg, #007acc, #28a745); border-radius: 4px; position: relative;">
                <div style="position: absolute; bottom: 4px; left: 4px; color: white; font-size: 10px;">Live Chart Simulation</div>
              </div>
            </div>
            <div style="margin-top: 12px; padding: 8px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; font-size: 12px;">
              ✅ Application running successfully!<br>
              🤖 AI features active | 🔗 P2P ready | 🚀 WebGPU enabled
            </div>
          </div>
        </div>
      `;
    });
    
    // AI Assist button
    aiBtn.addEventListener('click', () => {
      const currentCode = codeEditor.value;
      const suggestion = `# AI Suggestion for your code:
# - Add error handling for file uploads
# - Implement caching for better performance  
# - Add user authentication
# - Include data validation
# - Set up automated testing

# Example improvement:
@st.cache_data
def load_and_process_data(file):
    try:
        df = pd.read_csv(file)
        return df
    except Exception as e:
        st.error(f"Error loading data: {str(e)}")
        return None

`;
      
      codeEditor.value = suggestion + currentCode;
      
      // Show AI notification
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: #28a745;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
      `;
      notification.textContent = '🤖 AI suggestions added to your code!';
      contentElement.appendChild(notification);
      
      setTimeout(() => notification.remove(), 3000);
    });
    
    // Auto-save and syntax highlighting simulation
    let saveTimeout: NodeJS.Timeout;
    codeEditor.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const statusBar = contentElement.querySelector('.status-bar span') as HTMLElement;
        const currentText = statusBar.textContent || '';
        statusBar.textContent = currentText.replace('Status: Ready', 'Status: Saved');
      }, 1000);
    });
    
    // Todo system event handlers
    newTodoInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const todoText = newTodoInput.value.trim();
        if (todoText) {
          // AI-powered priority assessment
          const priority = assessTodoPriority(todoText);
          addTodoItem(todoText, priority);
          newTodoInput.value = '';
        }
      }
    });
    
    // Todo button to show/hide todo panel
    todoBtn.addEventListener('click', () => {
      const todoSystem = contentElement.querySelector('.todo-system') as HTMLElement;
      const currentDisplay = getComputedStyle(todoSystem).display;
      todoSystem.style.display = currentDisplay === 'none' ? 'flex' : 'none';
    });
    
    // Add todo button
    const addTodoBtn = contentElement.querySelector('.add-todo-btn') as HTMLButtonElement;
    addTodoBtn?.addEventListener('click', () => {
      newTodoInput.focus();
    });
    
    // New file button
    const newFileBtn = contentElement.querySelector('.new-file-btn') as HTMLButtonElement;
    newFileBtn?.addEventListener('click', () => {
      const fileName = prompt('Enter file name:');
      if (fileName) {
        createNewFile(fileName);
      }
    });
    
    // Enhanced AI Assist with voice context
    aiBtn.addEventListener('click', () => {
      const currentCode = codeEditor.value;
      const suggestion = generateAISuggestion(currentCode);
      
      // Add AI suggestions to code
      codeEditor.value = suggestion + currentCode;
      
      // Add AI assistance todo
      addTodoItem('Review AI suggestions in code', 'medium');
      addToHistory('AI assistance requested → ✅ Suggestions added', true);
      
      // Show AI notification
      showNotification('🤖 AI suggestions added to your code!', 'success');
    });
    
    // Helper function to assess todo priority using simple AI logic
    function assessTodoPriority(todoText: string): 'high' | 'medium' | 'low' {
      const text = todoText.toLowerCase();
      if (text.includes('fix') || text.includes('error') || text.includes('bug') || text.includes('urgent')) {
        return 'high';
      } else if (text.includes('test') || text.includes('review') || text.includes('optimize')) {
        return 'medium';
      } else {
        return 'low';
      }
    }
    
    // Generate AI code suggestions
    function generateAISuggestion(code: string): string {
      const suggestions = [
        `# 🤖 AI Suggestion: Error Handling Enhancement
try:
    # Your existing code here
    pass
except Exception as e:
    st.error(f"An error occurred: {str(e)}")
    
`,
        `# 🤖 AI Suggestion: Performance Optimization
@st.cache_data
def cached_computation(data):
    # Add caching for expensive operations
    return processed_data
    
`,
        `# 🤖 AI Suggestion: User Input Validation
if uploaded_file is not None:
    if uploaded_file.size > 50 * 1024 * 1024:  # 50MB limit
        st.error("File too large. Please upload a smaller file.")
        return
    
`,
        `# 🤖 AI Suggestion: Real-time Updates
placeholder = st.empty()
with placeholder.container():
    # Add real-time updates for better UX
    pass
    
`
      ];
      
      return suggestions[Math.floor(Math.random() * suggestions.length)];
    }
    
    // Show notification helper
    function showNotification(message: string, type: string = 'info') {
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007acc'};
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      notification.textContent = message;
      contentElement.appendChild(notification);
      
      setTimeout(() => notification.remove(), 3000);
    }
    
    // Language selection
    languageSelect.addEventListener('change', (e) => {
      const language = (e.target as HTMLSelectElement).value;
      const statusBar = contentElement.querySelector('.status-bar span') as HTMLElement;
      const currentText = statusBar.textContent || '';
      statusBar.textContent = currentText.replace(/Language: \w+/, `Language: ${language}`);
    });
  }
  
  loadSettingsApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="app-placeholder">
        <h2>⚙️ Settings</h2>
        <p>Configuration settings will be implemented here.</p>
        <div class="settings-demo">
          <label>
            <input type="checkbox" ${this.currentTheme === 'sunset' ? 'checked' : ''}> 
            Sunset Theme
          </label>
        </div>
        <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
      </div>
    `;
  }
  
  loadAPIKeysApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="api-keys-app">
        <div class="app-header">
          <h2>🔑 API Key Manager</h2>
          <p>Manage your API keys for various services</p>
        </div>
        
        <div class="api-keys-content">
          <div class="api-keys-list">
            <div class="api-key-item">
              <div class="api-key-service">🤖 OpenAI</div>
              <div class="api-key-status">
                <span class="status-indicator ${localStorage.getItem('swissknife_openai_key') ? 'active' : 'inactive'}">
                  ${localStorage.getItem('swissknife_openai_key') ? 'Configured' : 'Not Set'}
                </span>
              </div>
              <div class="api-key-actions">
                <button class="btn-small" onclick="this.closest('.api-keys-app').querySelector('#openai-key-input').style.display='block'">
                  ${localStorage.getItem('swissknife_openai_key') ? 'Update' : 'Set'}
                </button>
                ${localStorage.getItem('swissknife_openai_key') ? '<button class="btn-small btn-danger" onclick="localStorage.removeItem(\'swissknife_openai_key\'); location.reload();">Remove</button>' : ''}
              </div>
            </div>
            
            <div class="api-key-input-group" id="openai-key-input" style="display: none;">
              <input type="password" id="openai-key" placeholder="Enter your OpenAI API key" value="${localStorage.getItem('swissknife_openai_key') || ''}">
              <button onclick="localStorage.setItem('swissknife_openai_key', document.getElementById('openai-key').value); location.reload();" class="btn-primary">Save</button>
              <button onclick="document.getElementById('openai-key-input').style.display='none'" class="btn-secondary">Cancel</button>
            </div>
            
            <div class="api-key-item">
              <div class="api-key-service">🧠 Anthropic</div>
              <div class="api-key-status">
                <span class="status-indicator inactive">Not Set</span>
              </div>
              <div class="api-key-actions">
                <button class="btn-small">Set</button>
              </div>
            </div>
            
            <div class="api-key-item">
              <div class="api-key-service">🌐 IPFS</div>
              <div class="api-key-status">
                <span class="status-indicator inactive">Not Connected</span>
              </div>
              <div class="api-key-actions">
                <button class="btn-small">Configure</button>
              </div>
            </div>
          </div>
          
          <div class="api-keys-help">
            <h3>📖 Help</h3>
            <p>• API keys are stored locally in your browser</p>
            <p>• Keys are never transmitted except to their respective services</p>
            <p>• You can remove keys at any time</p>
          </div>
        </div>
      </div>
    `;
  }
  
  loadMCPControlApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="app-placeholder">
        <h2>🔌 MCP Control</h2>
        <p>Model Context Protocol server management will be implemented here.</p>
        <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
      </div>
    `;
  }
  
  loadTaskManagerApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="task-manager-container" style="height: 100%; display: flex; flex-direction: column; background: #f8f9fa;">
        <!-- Header with Tabs -->
        <div class="task-manager-header" style="border-bottom: 1px solid #dee2e6; background: white;">
          <div class="tab-container" style="display: flex;">
            <button class="tab-btn active" data-tab="processes" style="padding: 12px 24px; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid #007bff; color: #007bff; font-weight: 500;">
              Processes
            </button>
            <button class="tab-btn" data-tab="performance" style="padding: 12px 24px; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; color: #6c757d;">
              Performance
            </button>
            <button class="tab-btn" data-tab="services" style="padding: 12px 24px; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; color: #6c757d;">
              Services
            </button>
            <button class="tab-btn" data-tab="network" style="padding: 12px 24px; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; color: #6c757d;">
              Network
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div class="tab-content-container" style="flex: 1; overflow: hidden;">
          
          <!-- Processes Tab -->
          <div class="tab-content active" id="processes-tab" style="height: 100%; display: flex; flex-direction: column;">
            <div class="processes-toolbar" style="padding: 12px; border-bottom: 1px solid #dee2e6; background: white; display: flex; justify-content: space-between; align-items: center;">
              <div class="toolbar-left">
                <button class="action-btn" id="end-task-btn" style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;">End Task</button>
                <button class="action-btn" id="refresh-processes" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh</button>
              </div>
              <div class="toolbar-right">
                <input type="text" placeholder="Search processes..." style="padding: 6px 10px; border: 1px solid #ced4da; border-radius: 4px; width: 200px;">
              </div>
            </div>
            
            <div class="processes-table" style="flex: 1; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; background: white;">
                <thead style="background: #f8f9fa; position: sticky; top: 0;">
                  <tr>
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">Process Name</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">PID</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">CPU %</th>
                    <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">Memory</th>
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">Status</th>
                  </tr>
                </thead>
                <tbody id="processes-list">
                  <tr class="process-row" style="cursor: pointer;" data-pid="1234">
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;">🌐 Chrome Browser</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">1234</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa; color: #fd7e14;">15.2%</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">256 MB</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;"><span class="status-badge running">Running</span></td>
                  </tr>
                  <tr class="process-row" style="cursor: pointer;" data-pid="5678">
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;">💻 VS Code</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">5678</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa; color: #dc3545;">8.7%</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">512 MB</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;"><span class="status-badge running">Running</span></td>
                  </tr>
                  <tr class="process-row" style="cursor: pointer;" data-pid="9012">
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;">🖥️ SwissKnife Desktop</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">9012</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa; color: #28a745;">3.4%</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">128 MB</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;"><span class="status-badge running">Running</span></td>
                  </tr>
                  <tr class="process-row" style="cursor: pointer;" data-pid="3456">
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;">🛡️ System Security</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">3456</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa; color: #28a745;">1.2%</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">64 MB</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;"><span class="status-badge running">Running</span></td>
                  </tr>
                  <tr class="process-row" style="cursor: pointer;" data-pid="7890">
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;">📁 File Explorer</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">7890</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa; color: #28a745;">0.8%</td>
                    <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f8f9fa;">32 MB</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #f8f9fa;"><span class="status-badge running">Running</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Performance Tab -->
          <div class="tab-content" id="performance-tab" style="height: 100%; padding: 20px; display: none;">
            <div class="performance-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: 100%;">
              <div class="performance-card" style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #dee2e6;">
                <h4 style="margin: 0 0 16px 0; color: #495057;">CPU Usage</h4>
                <div class="metric-display" style="text-align: center; margin-bottom: 20px;">
                  <div class="metric-value" style="font-size: 48px; font-weight: bold; color: #007bff;" id="cpu-usage">27%</div>
                  <div class="metric-label" style="color: #6c757d;">Current Usage</div>
                </div>
                <div class="metric-details">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Base Speed:</span>
                    <span>2.4 GHz</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Cores:</span>
                    <span>4</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Threads:</span>
                    <span>8</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Cache:</span>
                    <span>8 MB</span>
                  </div>
                </div>
              </div>

              <div class="performance-card" style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #dee2e6;">
                <h4 style="margin: 0 0 16px 0; color: #495057;">Memory Usage</h4>
                <div class="metric-display" style="text-align: center; margin-bottom: 20px;">
                  <div class="metric-value" style="font-size: 48px; font-weight: bold; color: #28a745;" id="memory-usage">4.2 GB</div>
                  <div class="metric-label" style="color: #6c757d;">of 16 GB used</div>
                </div>
                <div class="memory-bar" style="background: #e9ecef; height: 8px; border-radius: 4px; margin-bottom: 16px;">
                  <div style="background: #28a745; height: 100%; width: 26%; border-radius: 4px;"></div>
                </div>
                <div class="metric-details">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Available:</span>
                    <span>11.8 GB</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Cached:</span>
                    <span>2.1 GB</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Swap Used:</span>
                    <span>256 MB</span>
                  </div>
                </div>
              </div>

              <div class="performance-card" style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #dee2e6;">
                <h4 style="margin: 0 0 16px 0; color: #495057;">Disk Usage</h4>
                <div class="disk-list">
                  <div class="disk-item" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <span>💾 System (C:)</span>
                      <span>68% used</span>
                    </div>
                    <div class="disk-bar" style="background: #e9ecef; height: 6px; border-radius: 3px;">
                      <div style="background: #fd7e14; height: 100%; width: 68%; border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">342 GB of 500 GB</div>
                  </div>
                  <div class="disk-item" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <span>📁 Data (D:)</span>
                      <span>45% used</span>
                    </div>
                    <div class="disk-bar" style="background: #e9ecef; height: 6px; border-radius: 3px;">
                      <div style="background: #28a745; height: 100%; width: 45%; border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">450 GB of 1 TB</div>
                  </div>
                </div>
              </div>

              <div class="performance-card" style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #dee2e6;">
                <h4 style="margin: 0 0 16px 0; color: #495057;">Network Activity</h4>
                <div class="network-stats">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span>📡 WiFi Adapter</span>
                    <span class="status-badge connected">Connected</span>
                  </div>
                  <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                      <span>Download:</span>
                      <span style="color: #28a745;" id="download-speed">1.2 MB/s</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                      <span>Upload:</span>
                      <span style="color: #007bff;" id="upload-speed">0.3 MB/s</span>
                    </div>
                  </div>
                  <div style="font-size: 12px; color: #6c757d;">
                    <div>Signal Strength: Excellent</div>
                    <div>IP Address: 192.168.1.102</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Services Tab -->
          <div class="tab-content" id="services-tab" style="height: 100%; display: none; padding: 12px;">
            <div style="background: white; height: 100%; border-radius: 8px; padding: 20px;">
              <h4 style="margin: 0 0 16px 0;">System Services</h4>
              <div class="services-list">
                <div class="service-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f8f9fa;">
                  <div>
                    <strong>SwissKnife Desktop Service</strong>
                    <div style="font-size: 12px; color: #6c757d;">Core desktop functionality</div>
                  </div>
                  <span class="status-badge running">Running</span>
                </div>
                <div class="service-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f8f9fa;">
                  <div>
                    <strong>AI Assistant Service</strong>
                    <div style="font-size: 12px; color: #6c757d;">AI integration and processing</div>
                  </div>
                  <span class="status-badge running">Running</span>
                </div>
                <div class="service-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f8f9fa;">
                  <div>
                    <strong>P2P Network Service</strong>
                    <div style="font-size: 12px; color: #6c757d;">Peer-to-peer connectivity</div>
                  </div>
                  <span class="status-badge stopped">Stopped</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Network Tab -->
          <div class="tab-content" id="network-tab" style="height: 100%; display: none; padding: 12px;">
            <div style="background: white; height: 100%; border-radius: 8px; padding: 20px;">
              <h4 style="margin: 0 0 16px 0;">Network Connections</h4>
              <p style="color: #6c757d;">Network monitoring functionality will be implemented here.</p>
            </div>
          </div>
        </div>
      </div>

      <style>
        .status-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
        }
        .status-badge.running { background: #d4edda; color: #155724; }
        .status-badge.stopped { background: #f8d7da; color: #721c24; }
        .status-badge.connected { background: #d1ecf1; color: #0c5460; }
        
        .process-row:hover {
          background-color: #f8f9fa;
        }
        .process-row.selected {
          background-color: #e3f2fd;
        }
        
        .tab-btn:hover {
          background-color: #f8f9fa;
        }
        .tab-btn.active {
          border-bottom-color: #007bff !important;
          color: #007bff !important;
          font-weight: 500;
        }
        
        .action-btn:hover {
          opacity: 0.9;
        }
      </style>

      <script>
        (function() {
          // Tab functionality
          const tabBtns = document.querySelectorAll('.tab-btn');
          const tabContents = document.querySelectorAll('.tab-content');
          
          tabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
              const targetTab = this.dataset.tab;
              
              // Update tab buttons
              tabBtns.forEach(b => {
                b.classList.remove('active');
                b.style.borderBottomColor = 'transparent';
                b.style.color = '#6c757d';
              });
              this.classList.add('active');
              this.style.borderBottomColor = '#007bff';
              this.style.color = '#007bff';
              
              // Update tab content
              tabContents.forEach(content => {
                content.style.display = 'none';
                content.classList.remove('active');
              });
              const targetContent = document.getElementById(targetTab + '-tab');
              if (targetContent) {
                targetContent.style.display = 'block';
                targetContent.classList.add('active');
              }
            });
          });
          
          // Process selection
          const processRows = document.querySelectorAll('.process-row');
          processRows.forEach(row => {
            row.addEventListener('click', function() {
              processRows.forEach(r => r.classList.remove('selected'));
              this.classList.add('selected');
            });
          });
          
          // Refresh processes
          document.getElementById('refresh-processes').addEventListener('click', function() {
            console.log('Refreshing process list...');
            // Update CPU and memory values randomly
            processRows.forEach(row => {
              const cpuCell = row.children[2];
              const memoryCell = row.children[3];
              
              const newCpu = (Math.random() * 20).toFixed(1) + '%';
              const newMemory = Math.floor(Math.random() * 300 + 50) + ' MB';
              
              cpuCell.textContent = newCpu;
              memoryCell.textContent = newMemory;
              
              // Update color based on usage
              const usage = parseFloat(newCpu);
              if (usage > 10) cpuCell.style.color = '#fd7e14';
              else if (usage > 5) cpuCell.style.color = '#dc3545';
              else cpuCell.style.color = '#28a745';
            });
          });
          
          // Update performance metrics periodically
          setInterval(() => {
            const cpuUsage = document.getElementById('cpu-usage');
            const memoryUsage = document.getElementById('memory-usage');
            const downloadSpeed = document.getElementById('download-speed');
            const uploadSpeed = document.getElementById('upload-speed');
            
            if (cpuUsage) {
              const newCpu = Math.floor(Math.random() * 40 + 20);
              cpuUsage.textContent = newCpu + '%';
            }
            
            if (memoryUsage) {
              const newMemory = (Math.random() * 2 + 3.5).toFixed(1);
              memoryUsage.textContent = newMemory + ' GB';
            }
            
            if (downloadSpeed) {
              const newDown = (Math.random() * 2 + 0.5).toFixed(1);
              downloadSpeed.textContent = newDown + ' MB/s';
            }
  loadIPFSExplorerApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="app-placeholder">
        <h2>🌐 IPFS Explorer</h2>
        <p>IPFS file system explorer will be implemented here.</p>
        <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
      </div>
    `;
  }
  
  // Utility method to dynamically load scripts
  private async loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if script is already loaded
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }
  
  async loadP2PNetworkApp(contentElement: HTMLElement) {
    try {
      // Load P2P Network app script and IPFS bridge
      await Promise.all([
        this.loadScript('/js/apps/p2p-network.js'),
        this.loadScript('/js/p2p-ml-bridge-ipfs.js')
      ]);
      
      // Initialize the P2P Network app
      if ((window as any).createP2PNetworkApp) {
        const p2pApp = (window as any).createP2PNetworkApp();
        p2pApp.init(contentElement);
      } else {
        throw new Error('P2P Network app not loaded properly');
      }
    } catch (error) {
      console.error('Failed to load P2P Network app:', error);
      contentElement.innerHTML = `
        <div class="app-placeholder">
          <h2>🔗 P2P Network Manager</h2>
          <p>P2P networking functionality will be implemented here.</p>
          <div class="p2p-preview">
            <h3>Features:</h3>
            <ul>
              <li>🌐 Peer Discovery & Connection</li>
              <li>🧠 Distributed ML Computing</li>
              <li>📤 Resource Sharing</li>
              <li>🔄 Task Distribution</li>
              <li>🤝 Model Collaboration</li>
              <li>💾 IPFS Model Storage</li>
              <li>📊 Network Model Discovery</li>
            </ul>
          </div>
          <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
        </div>
      `;
    }
  }
  
  loadCronApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="cron-app">
        <div class="cron-header">
          <h2>⏰ AI Cron Scheduler</h2>
          <p>Schedule AI-powered actions and automated tasks</p>
        </div>
        
        <div class="cron-tabs">
          <button class="cron-tab active" data-tab="active">Active Crons</button>
          <button class="cron-tab" data-tab="create">Create New</button>
          <button class="cron-tab" data-tab="history">History</button>
        </div>
        
        <div class="cron-content">
          <!-- Active Crons Tab -->
          <div class="cron-tab-content active" id="active-crons">
            <div class="cron-list" id="cron-list">
              <div class="cron-item">
                <div class="cron-icon">🤖</div>
                <div class="cron-details">
                  <div class="cron-name">Daily Code Review</div>
                  <div class="cron-schedule">Every day at 09:00</div>
                  <div class="cron-description">AI analyzes recent commits and provides suggestions</div>
                </div>
                <div class="cron-status active">Active</div>
                <div class="cron-actions">
                  <button class="btn-small">Edit</button>
                  <button class="btn-small btn-danger">Delete</button>
                </div>
              </div>
              
              <div class="cron-item">
                <div class="cron-icon">📊</div>
                <div class="cron-details">
                  <div class="cron-name">Weekly Performance Report</div>
                  <div class="cron-schedule">Fridays at 17:00</div>
                  <div class="cron-description">Generate and send performance analytics</div>
                </div>
                <div class="cron-status active">Active</div>
                <div class="cron-actions">
                  <button class="btn-small">Edit</button>
                  <button class="btn-small btn-danger">Delete</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Create New Cron Tab -->
          <div class="cron-tab-content" id="create-cron">
            <form class="cron-form" id="cron-form">
              <div class="form-group">
                <label>Cron Name</label>
                <input type="text" id="cron-name" placeholder="Enter a descriptive name" required>
              </div>
              
              <div class="form-group">
                <label>Schedule</label>
                <div class="schedule-builder">
                  <select id="schedule-type">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom Cron</option>
                  </select>
                  <input type="time" id="schedule-time" value="09:00">
                  <input type="text" id="cron-expression" placeholder="0 9 * * *" style="display:none;">
                </div>
              </div>
              
              <div class="form-group">
                <label>AI Action Type</label>
                <select id="action-type">
                  <option value="analysis">Code Analysis</option>
                  <option value="summary">Generate Summary</option>
                  <option value="report">Performance Report</option>
                  <option value="backup">Automated Backup</option>
                  <option value="custom">Custom AI Prompt</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>Description/Instructions</label>
                <textarea id="cron-description" rows="3" placeholder="Describe what this cron should do..."></textarea>
              </div>
              
              <div class="form-group" id="ai-prompt-group" style="display:none;">
                <label>AI Prompt</label>
                <textarea id="ai-prompt" rows="4" placeholder="Enter the AI prompt to execute..."></textarea>
              </div>
              
              <div class="form-group">
                <label>
                  <input type="checkbox" id="send-notifications"> Send notifications when executed
                </label>
              </div>
              
              <div class="form-actions">
                <button type="submit" class="btn-primary">Create Cron</button>
                <button type="button" class="btn-secondary" onclick="document.getElementById('cron-form').reset()">Reset</button>
              </div>
            </form>
          </div>
          
          <!-- History Tab -->
          <div class="cron-tab-content" id="cron-history">
            <div class="history-list">
              <div class="history-item">
                <div class="history-time">2025-06-27 09:00:15</div>
                <div class="history-name">Daily Code Review</div>
                <div class="history-status success">Success</div>
                <div class="history-result">Analyzed 15 files, found 3 suggestions</div>
              </div>
              <div class="history-item">
                <div class="history-time">2025-06-26 17:00:32</div>
                <div class="history-name">Weekly Performance Report</div>
                <div class="history-status success">Success</div>
                <div class="history-result">Report generated and sent</div>
              </div>
              <div class="history-item">
                <div class="history-time">2025-06-26 09:00:12</div>
                <div class="history-name">Daily Code Review</div>
                <div class="history-status error">Error</div>
                <div class="history-result">API rate limit exceeded</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Initialize cron app functionality
    this.initializeCronApp(contentElement);
  }
  
  initializeCronApp(contentElement: HTMLElement) {
    // Tab switching
    const tabs = contentElement.querySelectorAll('.cron-tab');
    const tabContents = contentElement.querySelectorAll('.cron-tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = (tab as HTMLElement).dataset.tab;
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        tabContents.forEach(content => content.classList.remove('active'));
        const targetContent = contentElement.querySelector(`#${tabName === 'active' ? 'active-crons' : tabName === 'create' ? 'create-cron' : 'cron-history'}`);
        if (targetContent) targetContent.classList.add('active');
      });
    });
    
    // Schedule type handling
    const scheduleType = contentElement.querySelector('#schedule-type') as HTMLSelectElement;
    const cronExpression = contentElement.querySelector('#cron-expression') as HTMLInputElement;
    const scheduleTime = contentElement.querySelector('#schedule-time') as HTMLInputElement;
    
    scheduleType?.addEventListener('change', () => {
      if (scheduleType.value === 'custom') {
        cronExpression.style.display = 'block';
        scheduleTime.style.display = 'none';
      } else {
        cronExpression.style.display = 'none';
        scheduleTime.style.display = 'block';
      }
    });
    
    // Action type handling
    const actionType = contentElement.querySelector('#action-type') as HTMLSelectElement;
    const aiPromptGroup = contentElement.querySelector('#ai-prompt-group') as HTMLElement;
    
    actionType?.addEventListener('change', () => {
      if (actionType.value === 'custom') {
        aiPromptGroup.style.display = 'block';
      } else {
        aiPromptGroup.style.display = 'none';
      }
    });
    
    // Form submission
    const cronForm = contentElement.querySelector('#cron-form') as HTMLFormElement;
    cronForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createNewCron(contentElement);
    });
  }
  
  createNewCron(contentElement: HTMLElement) {
    const form = contentElement.querySelector('#cron-form') as HTMLFormElement;
    
    const cronData = {
      id: Date.now().toString(),
      name: (contentElement.querySelector('#cron-name') as HTMLInputElement)?.value || '',
      scheduleType: (contentElement.querySelector('#schedule-type') as HTMLSelectElement)?.value || '',
      time: (contentElement.querySelector('#schedule-time') as HTMLInputElement)?.value || '',
      cronExpression: (contentElement.querySelector('#cron-expression') as HTMLInputElement)?.value || '',
      actionType: (contentElement.querySelector('#action-type') as HTMLSelectElement)?.value || '',
      description: (contentElement.querySelector('#cron-description') as HTMLTextAreaElement)?.value || '',
      aiPrompt: (contentElement.querySelector('#ai-prompt') as HTMLTextAreaElement)?.value || '',
      notifications: (contentElement.querySelector('#send-notifications') as HTMLInputElement)?.checked || false,
      created: new Date().toISOString(),
      lastRun: null,
      nextRun: this.calculateNextRun((contentElement.querySelector('#schedule-type') as HTMLSelectElement)?.value || '', (contentElement.querySelector('#schedule-time') as HTMLInputElement)?.value || ''),
      status: 'active'
    };
    
    // Store in localStorage for persistence
    let savedCrons = JSON.parse(localStorage.getItem('swissknife-crons') || '[]');
    savedCrons.push(cronData);
    localStorage.setItem('swissknife-crons', JSON.stringify(savedCrons));
    
    console.log('Creating new cron:', cronData);
    
    // Show success notification
    this.showNotification('AI Cron job created successfully! 🤖⏰', 'success');
    
    // Switch to active crons tab
    const activeTab = contentElement.querySelector('.cron-tab[data-tab="active"]') as HTMLElement;
    activeTab?.click();
    
    // Reset form
    form?.reset();
  }
  
  calculateNextRun(scheduleType: string, time: string): string {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    let nextRun = new Date();
    nextRun.setHours(hours || 0, minutes || 0, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow/next occurrence
    if (nextRun <= now) {
      switch (scheduleType) {
        case 'daily':
          nextRun.setDate(nextRun.getDate() + 1);
          break;
        case 'weekly':
          nextRun.setDate(nextRun.getDate() + 7);
          break;
        case 'monthly':
          nextRun.setMonth(nextRun.getMonth() + 1);
          break;
        default:
          nextRun.setDate(nextRun.getDate() + 1);
      }
    }
    
    return nextRun.toISOString();
  }
  
  showNotification(message: string, type: string = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span class="notification-message">${message}</span>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Hide and remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  loadMusicStudioPlaceholder(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="app-placeholder">
        <h2>🎵 Music Studio</h2>
        <p>Strudel-powered music composition will be implemented here.</p>
        <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
      </div>
    `;
  }
  
  // Window management methods
  setupWindowControls(windowElement: HTMLElement) {
    const minimizeBtn = windowElement.querySelector('.window-control.minimize');
    const maximizeBtn = windowElement.querySelector('.window-control.maximize');
    const closeBtn = windowElement.querySelector('.window-control.close');
    
    minimizeBtn?.addEventListener('click', () => {
      this.minimizeWindow(windowElement);
    });
    
    maximizeBtn?.addEventListener('click', () => {
      this.toggleMaximizeWindow(windowElement);
    });
    
    closeBtn?.addEventListener('click', () => {
      this.closeWindow(windowElement);
    });
  }
  
  makeWindowDraggable(windowElement: HTMLElement) {
    const titlebar = windowElement.querySelector('.window-titlebar') as HTMLElement;
    if (!titlebar) return;
    
    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    
    titlebar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('window-control')) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(windowElement.style.left);
      startTop = parseInt(windowElement.style.top);
      
      // Set up snapping state
      this.dragState.isDragging = true;
      this.dragState.draggedWindow = windowElement;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      e.preventDefault();
    });
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      // Check if window is currently snapped and should be unsnapped
      const windowId = windowElement.getAttribute('data-window-id') || windowElement.id;
      const windowData = this.windows.get(windowId);
      
      if (windowData && windowData.isSnapped) {
        // Unsnap the window when starting to drag
        this.unSnapWindow(windowElement);
        
        // Restore a more reasonable size for dragging
        const newWidth = Math.min(800, Math.max(400, windowData.preSnapState?.width || 600));
        const newHeight = Math.min(600, Math.max(300, windowData.preSnapState?.height || 400));
        
        // Position window under cursor
        const newLeft = e.clientX - newWidth / 2;
        const newTop = Math.max(0, e.clientY - 30); // 30px for titlebar
        
        windowElement.style.width = newWidth + 'px';
        windowElement.style.height = newHeight + 'px';
        windowElement.style.left = newLeft + 'px';
        windowElement.style.top = newTop + 'px';
        
        // Update start positions for continued dragging
        startX = e.clientX;
        startY = e.clientY;
        startLeft = newLeft;
        startTop = newTop;
        
        if (windowData) {
          windowData.x = newLeft;
          windowData.y = newTop;
          windowData.width = newWidth;
          windowData.height = newHeight;
        }
        
        return; // Don't continue with normal drag logic this frame
      }
      
      const newLeft = startLeft + deltaX;
      const newTop = Math.max(0, startTop + deltaY); // Prevent dragging above desktop
      
      windowElement.style.left = newLeft + 'px';
      windowElement.style.top = newTop + 'px';
      
      // Update window data
      if (windowData) {
        windowData.x = newLeft;
        windowData.y = newTop;
      }
    };
    
    const handleMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Snapping is handled by the global mouse handlers in setupWindowSnapping
    };
  }
  
  unSnapWindow(windowElement: HTMLElement) {
    // Remove snapped class
    windowElement.classList.remove('window-snapped');
    
    // Re-enable resize handles
    const resizeHandles = windowElement.querySelectorAll('.window-resize-handle');
    resizeHandles.forEach(handle => {
      (handle as HTMLElement).style.display = '';
    });
    
    // Update window data
    const windowId = windowElement.getAttribute('data-window-id');
    const windowData = windowId ? this.windows.get(windowId) : null;
    if (windowData) {
      windowData.isSnapped = false;
      windowData.snapZone = null;
    }
  }
  
  addResizeHandles(windowElement: HTMLElement) {
    const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    
    handles.forEach(direction => {
      const handle = document.createElement('div');
      handle.className = `window-resize-handle ${direction}`;
      windowElement.appendChild(handle);
    });
  }
  
  focusWindow(windowElement: HTMLElement) {
    // Remove focus from all windows
    document.querySelectorAll('.window').forEach(w => {
      w.classList.remove('focused');
    });
    
    // Focus the selected window
    windowElement.classList.add('focused');
    this.activeWindow = windowElement;
  }
  
  minimizeWindow(windowElement: HTMLElement) {
    windowElement.classList.add('minimized');
    const windowId = windowElement.id;
    const window = this.windows.get(windowId);
    if (window) {
      window.minimized = true;
    }
  }
  
  toggleMaximizeWindow(windowElement: HTMLElement) {
    const windowId = windowElement.id;
    const window = this.windows.get(windowId);
    
    if (window?.maximized) {
      windowElement.classList.remove('maximized');
      window.maximized = false;
    } else if (window) {
      windowElement.classList.add('maximized');
      window.maximized = true;
    }
  }
  
  closeWindow(windowElement: HTMLElement) {
    const windowId = windowElement.id;
    const window = this.windows.get(windowId);
    
    if (window) {
      // Cleanup app instance
      if (window.appInstance && window.appInstance.cleanup) {
        window.appInstance.cleanup();
      }
      
      // Remove from taskbar
      this.removeFromTaskbar(window);
      
      // Remove window
      windowElement.classList.add('window-exit');
      setTimeout(() => {
        windowElement.remove();
        this.windows.delete(windowId);
      }, 200);
    }
  }
  
  addToTaskbar(window: WindowData) {
    const taskbarApps = document.getElementById('taskbar-apps');
    if (!taskbarApps) return;
    
    const taskbarItem = document.createElement('div');
    taskbarItem.className = 'taskbar-app';
    taskbarItem.id = `taskbar-${window.id}`;
    taskbarItem.innerHTML = `
      <span class="taskbar-app-icon">${this.apps.get(window.appId)?.icon || '📱'}</span>
      <span class="taskbar-app-title">${window.title}</span>
    `;
    
    taskbarItem.addEventListener('click', () => {
      if (window.minimized) {
        window.element.classList.remove('minimized');
        window.minimized = false;
      }
      this.focusWindow(window.element);
    });
    
    taskbarApps.appendChild(taskbarItem);
  }
  
  removeFromTaskbar(window: WindowData) {
    const taskbarItem = document.getElementById(`taskbar-${window.id}`);
    if (taskbarItem) {
      taskbarItem.remove();
    }
  }
  
  updateSystemTime() {
    const timeElement = document.getElementById('system-time');
    if (!timeElement) return;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
    const dateString = now.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Add timezone info
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const shortTimezone = timezone.split('/').pop();
    
    timeElement.innerHTML = `
      <div class="system-time-main">${timeString}</div>
      <div class="system-time-date">${dateString}</div>
      <div class="system-time-zone">${shortTimezone}</div>
    `;
  }
  
  updateSystemStatus() {
    const hwStatus = this.swissknife?.getHardwareStatus ? this.swissknife.getHardwareStatus() : {
      webnn: false,
      webgpu: !!(navigator as any).gpu
    };
    
    // Update AI status
    const aiStatus = document.getElementById('ai-status');
    if (aiStatus) {
      aiStatus.className = 'status-indicator ' + (hwStatus.webnn ? 'active' : 'inactive');
      aiStatus.title = `AI Engine: ${hwStatus.webnn ? 'WebNN Available' : 'API Only'}`;
    }
    
    // Update IPFS status
    const ipfsStatus = document.getElementById('ipfs-status');
    if (ipfsStatus) {
      ipfsStatus.className = 'status-indicator inactive'; // TODO: implement IPFS detection
      ipfsStatus.title = 'IPFS: Not connected';
    }
    
    // Update GPU status
    const gpuStatus = document.getElementById('gpu-status');
    if (gpuStatus) {
      gpuStatus.className = 'status-indicator ' + (hwStatus.webgpu ? 'active' : 'inactive');
      gpuStatus.title = `GPU: ${hwStatus.webgpu ? 'WebGPU Available' : 'Not available'}`;
    }
  }
  
  setupContextMenu() {
    // Basic context menu setup
  }
  
  setupWindowManagement() {
    // Set up window snapping functionality
    this.setupWindowSnapping();
    
    // Set up window drag boundaries
    this.setupDragBoundaries();
    
    // Set up snap zones
    this.createSnapZones();
  }
  
  setupWindowSnapping() {
    // Track dragging state for snapping
    this.dragState = {
      isDragging: false,
      draggedWindow: null,
      snapZones: [],
      snapThreshold: 20
    };
    
    // Listen for window drag events
    document.addEventListener('mousemove', (e) => {
      if (this.dragState.isDragging) {
        this.handleWindowDragSnapping(e);
      }
    });
    
    document.addEventListener('mouseup', (e) => {
      if (this.dragState.isDragging) {
        this.handleWindowSnapRelease(e);
      }
    });
  }
  
  createSnapZones() {
    // Define snap zones for different window arrangements
    const desktop = document.getElementById('desktop');
    if (!desktop) return;
    
    const rect = desktop.getBoundingClientRect();
    const taskbarHeight = 40;
    const availableHeight = rect.height - taskbarHeight;
    
    // Calculate intelligent sizing based on screen thirds and minimum sizes
    const minWidth = 400;  // Minimum readable width
    const minHeight = 300; // Minimum readable height
    
    // Use thirds of screen for better content display
    const oneThirdWidth = Math.max(minWidth, rect.width / 3);
    const twoThirdsWidth = Math.max(minWidth * 1.5, (rect.width * 2) / 3);
    const halfWidth = Math.max(minWidth, rect.width / 2);
    const fullWidth = rect.width;
    
    const oneThirdHeight = Math.max(minHeight, availableHeight / 3);
    const halfHeight = Math.max(minHeight, availableHeight / 2);
    const twoThirdsHeight = Math.max(minHeight * 1.5, (availableHeight * 2) / 3);
    const fullHeight = availableHeight;
    
    this.dragState.snapZones = [
      // Full screen (top edge - larger trigger area)
      {
        name: 'fullscreen',
        x: 0, y: 0, width: fullWidth, height: fullHeight,
        trigger: { x: rect.width * 0.3, y: 0, width: rect.width * 0.4, height: 30 }
      },
      // Left third (left edge)
      {
        name: 'left-third',
        x: 0, y: 0, width: oneThirdWidth, height: fullHeight,
        trigger: { x: 0, y: 100, width: 30, height: availableHeight - 200 }
      },
      // Right third (right edge)
      {
        name: 'right-third',
        x: rect.width - oneThirdWidth, y: 0, width: oneThirdWidth, height: fullHeight,
        trigger: { x: rect.width - 30, y: 100, width: 30, height: availableHeight - 200 }
      },
      // Left half (left edge - center area)
      {
        name: 'left-half',
        x: 0, y: 0, width: halfWidth, height: fullHeight,
        trigger: { x: 0, y: 50, width: 20, height: availableHeight - 100 }
      },
      // Right half (right edge - center area)
      {
        name: 'right-half',
        x: halfWidth, y: 0, width: halfWidth, height: fullHeight,
        trigger: { x: rect.width - 20, y: 50, width: 20, height: availableHeight - 100 }
      },
      // Top-left quarter (corner - larger for easier targeting)
      {
        name: 'top-left-quarter',
        x: 0, y: 0, width: halfWidth, height: halfHeight,
        trigger: { x: 0, y: 0, width: 60, height: 60 }
      },
      // Top-right quarter
      {
        name: 'top-right-quarter',
        x: halfWidth, y: 0, width: halfWidth, height: halfHeight,
        trigger: { x: rect.width - 60, y: 0, width: 60, height: 60 }
      },
      // Bottom-left quarter
      {
        name: 'bottom-left-quarter',
        x: 0, y: halfHeight, width: halfWidth, height: halfHeight,
        trigger: { x: 0, y: availableHeight - 60, width: 60, height: 60 }
      },
      // Bottom-right quarter
      {
        name: 'bottom-right-quarter',
        x: halfWidth, y: halfHeight, width: halfWidth, height: halfHeight,
        trigger: { x: rect.width - 60, y: availableHeight - 60, width: 60, height: 60 }
      }
    ];
  }
      
  handleWindowDragSnapping(e: MouseEvent) {
    if (!this.dragState.draggedWindow) return;
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Prioritize corner snaps, then edge snaps
    const cornerZones = this.dragState.snapZones.filter(zone =>
      zone.name.includes('quarter') || zone.name.includes('corner')
    );
    const edgeZones = this.dragState.snapZones.filter(zone => 
      zone.name.includes('half') || zone.name.includes('third')
    );
    const specialZones = this.dragState.snapZones.filter(zone => 
      zone.name.includes('fullscreen') || zone.name.includes('center')
    );
    
    // Check corners first (highest priority)
    let activeZone = cornerZones.find(zone => this.isInTriggerArea(mouseX, mouseY, zone.trigger));
    
    // Then check edges if no corner match
    if (!activeZone) {
      activeZone = edgeZones.find(zone => this.isInTriggerArea(mouseX, mouseY, zone.trigger));
    }
    
    // Finally check special zones
    if (!activeZone) {
      activeZone = specialZones.find(zone => this.isInTriggerArea(mouseX, mouseY, zone.trigger));
    }
    
    // Show/hide snap preview
    this.showSnapPreview(activeZone);
  }
  
  isInTriggerArea(mouseX: number, mouseY: number, trigger: any): boolean {
    return mouseX >= trigger.x && mouseX <= trigger.x + trigger.width &&
           mouseY >= trigger.y && mouseY <= trigger.y + trigger.height;
  }
  
  showSnapPreview(zone: any) {
    // Remove existing preview
    const existingPreview = document.querySelector('.snap-preview');
    if (existingPreview) {
      existingPreview.remove();
    }
    
    if (zone) {
      // Create snap preview
      const preview = document.createElement('div');
      preview.className = 'snap-preview';
      preview.style.cssText = `
        position: fixed;
        left: ${zone.x}px;
        top: ${zone.y}px;
        width: ${zone.width}px;
        height: ${zone.height}px;
        background: rgba(220, 53, 69, 0.3);
        border: 2px solid rgba(220, 53, 69, 0.8);
        pointer-events: none;
        z-index: 10000;
        border-radius: 8px;
        backdrop-filter: blur(2px);
      `;
      document.body.appendChild(preview);
      
      // Store active zone for snap release
      this.dragState.activeSnapZone = zone;
    } else {
      this.dragState.activeSnapZone = null;
    }
  }
  
  handleWindowSnapRelease(e: MouseEvent) {
    const window = this.dragState.draggedWindow;
    const zone = this.dragState.activeSnapZone;
    
    // Remove snap preview
    const preview = document.querySelector('.snap-preview');
    if (preview) {
      preview.remove();
    }
    
    // Apply snap if in zone
    if (window && zone) {
      this.snapWindowToZone(window, zone);
    }
    
    // Reset drag state
    this.dragState.isDragging = false;
    this.dragState.draggedWindow = null;
    this.dragState.activeSnapZone = null;
  }
  
  snapWindowToZone(windowElement: HTMLElement, zone: any) {
    // Animate window to snap position
    windowElement.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    windowElement.style.left = zone.x + 'px';
    windowElement.style.top = zone.y + 'px';
    windowElement.style.width = zone.width + 'px';
    windowElement.style.height = zone.height + 'px';
    
    // Add snapped class for styling
    windowElement.classList.add('window-snapped');
    
    // Disable resize handles when snapped
    const resizeHandles = windowElement.querySelectorAll('.window-resize-handle');
    resizeHandles.forEach(handle => {
      (handle as HTMLElement).style.display = 'none';
    });
    
    // Update window data
    const windowId = windowElement.getAttribute('data-window-id');
    const windowData = windowId ? this.windows.get(windowId) : null;
    if (windowData) {
      windowData.x = zone.x;
      windowData.y = zone.y;
      windowData.width = zone.width;
      windowData.height = zone.height;
      windowData.isSnapped = true;
      windowData.snapZone = zone.name;
      windowData.preSnapState = {
        x: windowData.x,
        y: windowData.y,
        width: windowData.width,
        height: windowData.height
      };
    }
    
    // Remove transition after animation
    setTimeout(() => {
      windowElement.style.transition = '';
    }, 300);
    
    console.log(`Window snapped to ${zone.name} (${zone.width}x${zone.height})`);
  }
  
  setupDragBoundaries() {
    // Ensure windows can't be dragged outside the desktop area
    // This is handled in the window creation and drag handlers
  }
  
  handleKeyboardShortcuts(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 't':
          e.preventDefault();
          this.launchApp('terminal');
          break;
        case 'e':
          e.preventDefault();
          this.launchApp('vibecode');
          break;
        case 'w':
          if (this.activeWindow) {
            e.preventDefault();
            this.closeWindow(this.activeWindow);
          }
          break;
      }
    }
  }
  
  showContextMenu(x: number, y: number) {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
      contextMenu.style.left = x + 'px';
      contextMenu.style.top = y + 'px';
      contextMenu.classList.remove('hidden');
      
      // Hide context menu when clicking elsewhere
      const hideMenu = (e: Event) => {
        if (!contextMenu.contains(e.target as Node)) {
          contextMenu.classList.add('hidden');
          document.removeEventListener('click', hideMenu);
        }
      };
      
      setTimeout(() => {
        document.addEventListener('click', hideMenu);
      }, 10);
    }
  }
  
  private systemMonitorInterval: any = null;
  startSystemMonitoring(contentElement?: HTMLElement) {
    if (contentElement) {
      const cpuEl = contentElement.querySelector('#cpu-usage');
      const memEl = contentElement.querySelector('#memory-usage');
      if (!this.systemMonitorInterval) {
        this.systemMonitorInterval = setInterval(() => {
          if (cpuEl) cpuEl.textContent = Math.floor(Math.random() * 100) + '%';
          if (memEl) memEl.textContent = Math.floor(Math.random() * 8000) + ' MB';
          this.updateSystemMetrics();
        }, 2000);
      }
      return;
    }
    if (!this.systemMonitorInterval) {
      this.systemMonitorInterval = setInterval(() => {
        this.updateSystemMetrics();
      }, 10000);
    }
  }
  
  updateSystemMetrics() {
    // Collect and display system metrics
    const metrics = {
      memory: (performance as any).memory ? {
        used: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024)
      } : null,
      windows: this.windows.size
    };
    
    console.debug('System metrics:', metrics);
  }
  
  showDesktopProperties() {
    this.launchApp('settings');
  }
  
  openTerminalHere() {
    this.launchApp('terminal');
  }
  
  createNewFile() {
    console.log('Create new file requested');
  }
  
  createNewFolder() {
    console.log('Create new folder requested');
  }
  
  refreshDesktop() {
    location.reload();
  }
  
  showAbout() {
    // Show about dialog
    const aboutHTML = `
      <div class="app-placeholder" style="padding: 20px; text-align: center;">
        <h2>🇨🇭 SwissKnife Web Desktop</h2>
        <p>Version 1.0.0</p>
        <p>A modern AI-powered desktop environment for the browser</p>
        <p>Built with Swiss precision 🏔️</p>
        <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
      </div>
    `;
    
    this.createWindow({
      title: 'About SwissKnife Web Desktop',
      icon: '🇨🇭',
      appId: 'about',
      width: 400,
      height: 300,
      x: 200,
      y: 200
    }).then(window => {
      const contentElement = document.getElementById(`${window.id}-content`);
      if (contentElement) {
        contentElement.innerHTML = aboutHTML;
      }
    });
  }
  
  setupMockApiHandlers() {
    // Mock API handlers for development
    const originalFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      if (url.toString().includes('/status') || url.toString().includes('/api/status')) {
        console.log(`Mocking API call to: ${url}`);
        return new Response(JSON.stringify({
          status: 'ok',
          version: '1.0.0',
          services: {
            ipfs: false,
            ai: true,
            storage: true
          },
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return originalFetch(url, options);
    };
  }

  // App loading methods for additional applications
  loadCalculatorApp(contentElement: HTMLElement) {
    // Import and initialize the Calculator app
    import('./js/apps/calculator.js').then(module => {
      const calculatorApp = new module.CalculatorApp(this);
      const content = calculatorApp.createWindowConfig();
      contentElement.innerHTML = content;
      
      // Setup calculator event listeners
      this.setupCalculatorEventListeners(contentElement, calculatorApp);
    }).catch(error => {
      console.error('Failed to load Calculator app:', error);
      contentElement.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <h3>🧮 Calculator</h3>
          <p>Professional calculator with scientific functions</p>
          <div style="background: #f0f0f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <div style="font-size: 24px; margin-bottom: 10px;">Calculator functionality will be implemented here.</div>
            <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
          </div>
        </div>
      `;
    });
  }

  setupCalculatorEventListeners(contentElement: HTMLElement, calculatorApp: any) {
    // Add event listeners for calculator buttons and functionality
    const buttons = contentElement.querySelectorAll('.calc-btn');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        const value = (e.target as HTMLElement).dataset.value;
        if (value && calculatorApp.handleInput) {
          calculatorApp.handleInput(value);
        }
      });
    });
  }

  loadClockApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; height: 100%;">
        <h3>🕐 Clock & Timers</h3>
        <p>World clock, timers, and stopwatch functionality</p>
        <div style="font-size: 48px; margin: 40px 0; font-family: monospace;">
          <div id="current-time">${new Date().toLocaleTimeString()}</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p>Clock functionality will be enhanced here</p>
          <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
        </div>
      </div>
    `;
    
    // Update time every second
    const timeElement = contentElement.querySelector('#current-time');
    setInterval(() => {
      if (timeElement) {
        timeElement.textContent = new Date().toLocaleTimeString();
      }
    }, 1000);
  }

  loadNotesApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
        <h3>📝 Notes</h3>
        <textarea placeholder="Start typing your notes here..." 
                  style="flex: 1; border: 1px solid #ccc; border-radius: 4px; padding: 10px; font-family: Arial, sans-serif; resize: none;"></textarea>
        <div style="margin-top: 10px; text-align: right;">
          <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
        </div>
      </div>
    `;
  }

  loadSystemMonitorApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; background: #1a1a1a; color: #00ff00; height: 100%; font-family: monospace;">
        <h3>📊 System Monitor</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
          <div>
            <h4>CPU Usage</h4>
            <div style="background: #333; padding: 10px; border-radius: 4px;">
              <div>Usage: <span id="cpu-usage">0%</span></div>
            </div>
          </div>
          <div>
            <h4>Memory</h4>
            <div style="background: #333; padding: 10px; border-radius: 4px;">
              <div>Used: <span id="memory-usage">0 MB</span></div>
            </div>
          </div>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="this.closest('.window').remove()" style="padding: 8px 16px; background: #333; color: white; border: none;">Close</button>
        </div>
      </div>
    `;
    
    // Simulate system monitoring
    this.startSystemMonitoring(contentElement);
  }

  // (Removed duplicate startSystemMonitoring with required param; unified above)

  // Placeholder methods for other apps
  loadImageViewerApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div class="image-viewer-container" style="height: 100%; display: flex; flex-direction: column; background: #2b2b2b;">
        <!-- Toolbar -->
        <div class="image-viewer-toolbar" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #3c3c3c; border-bottom: 1px solid #555;">
          <div class="toolbar-left" style="display: flex; align-items: center; gap: 8px;">
            <button class="tool-btn" id="open-btn" title="Open Image" style="padding: 6px 12px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">📁 Open</button>
            <button class="tool-btn" id="prev-btn" title="Previous" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">◀</button>
            <button class="tool-btn" id="next-btn" title="Next" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">▶</button>
            <span class="image-info" id="image-info" style="color: #ccc; margin-left: 12px;">No image loaded</span>
          </div>
          <div class="toolbar-center" style="display: flex; align-items: center; gap: 8px;">
            <button class="tool-btn" id="zoom-out" title="Zoom Out" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">−</button>
            <span class="zoom-level" id="zoom-level" style="color: #ccc; min-width: 50px; text-align: center;">100%</span>
            <button class="tool-btn" id="zoom-in" title="Zoom In" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">+</button>
            <button class="tool-btn" id="fit-screen" title="Fit to Screen" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">⬜</button>
          </div>
          <div class="toolbar-right" style="display: flex; align-items: center; gap: 8px;">
            <button class="tool-btn" id="rotate-left" title="Rotate Left" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">↺</button>
            <button class="tool-btn" id="rotate-right" title="Rotate Right" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">↻</button>
            <button class="tool-btn" id="fullscreen-btn" title="Fullscreen" style="padding: 6px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶</button>
          </div>
        </div>

        <!-- Main Viewer Area -->
        <div class="viewer-area" style="flex: 1; position: relative; overflow: hidden; background: #1e1e1e;">
          <!-- Drop Zone -->
          <div class="drop-zone" id="drop-zone" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px dashed #555; margin: 20px; border-radius: 8px; color: #888; text-align: center; transition: all 0.3s ease;">
            <div style="font-size: 48px; margin-bottom: 16px;">🖼️</div>
            <h3 style="margin: 0 0 8px 0; color: #ccc;">Drop images here or click Open</h3>
            <p style="margin: 0; font-size: 14px;">Supports: JPG, PNG, GIF, BMP, SVG, WebP</p>
            <input type="file" id="file-input" accept="image/*" multiple style="display: none;">
          </div>

          <!-- Image Display -->
          <div class="image-display" id="image-display" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: none; align-items: center; justify-content: center; overflow: hidden;">
            <img id="main-image" style="max-width: 100%; max-height: 100%; object-fit: contain; transition: transform 0.3s ease; cursor: grab;">
          </div>

          <!-- Image Gallery -->
          <div class="image-gallery" id="image-gallery" style="position: absolute; bottom: 0; left: 0; right: 0; height: 120px; background: rgba(0,0,0,0.8); display: none; padding: 10px; overflow-x: auto; white-space: nowrap;">
            <!-- Thumbnails will be populated here -->
          </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar" style="padding: 4px 12px; background: #3c3c3c; border-top: 1px solid #555; font-size: 12px; color: #ccc; display: flex; justify-content: space-between;">
          <span id="status-left">Ready</span>
          <span id="status-right">Image Viewer v1.0</span>
        </div>
      </div>

      <style>
        .image-viewer-container .tool-btn:hover {
          background-color: #666 !important;
          transform: translateY(-1px);
        }
        
        .image-viewer-container .drop-zone.drag-over {
          border-color: #0078d4;
          background-color: rgba(0, 120, 212, 0.1);
        }

        .image-viewer-container #main-image:active {
          cursor: grabbing;
        }

        .image-viewer-container .gallery-thumb {
          width: 80px;
          height: 80px;
          object-fit: cover;
          margin-right: 8px;
          border: 2px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          transition: border-color 0.3s ease;
        }

        .image-viewer-container .gallery-thumb:hover {
          border-color: #0078d4;
        }

        .image-viewer-container .gallery-thumb.active {
          border-color: #ffd700;
        }
      </style>

      <script>
        (function() {
          let currentImages = [];
          let currentIndex = 0;
          let zoomLevel = 1;
          let rotation = 0;
          
          const dropZone = document.getElementById('drop-zone');
          const fileInput = document.getElementById('file-input');
          const imageDisplay = document.getElementById('image-display');
          const mainImage = document.getElementById('main-image');
          const imageGallery = document.getElementById('image-gallery');
          const imageInfo = document.getElementById('image-info');
          const zoomLevelSpan = document.getElementById('zoom-level');
          const statusLeft = document.getElementById('status-left');

          // Sample images for demo
          const sampleImages = [
            { name: 'sample1.jpg', url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAw' + 'IiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIg' + 'aGVpZ2h0PSIxMDAlIiBmaWxsPSIjNDE2OWU5Ii8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlh' + 'bCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2Vt' + 'Ij5TYW1wbGUgSW1hZ2UgMTwvdGV4dD4KPC9zdmc+', size: '15.2 KB', dimensions: '400x300' },
            { name: 'sample2.jpg', url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAw' + 'IiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIg' + 'aGVpZ2h0PSIxMDAlIiBmaWxsPSIjNGNhZjUwIi8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlh' + 'bCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2Vt' + 'Ij5TYW1wbGUgSW1hZ2UgMjwvdGV4dD4KPC9zdmc+', size: '12.8 KB', dimensions: '400x300' },
            { name: 'sample3.jpg', url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAw' + 'IiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIg' + 'aGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmY5ODAwIi8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlh' + 'bCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2Vt' + 'Ij5TYW1wbGUgSW1hZ2UgMzwvdGV4dD4KPC9zdmc+', size: '18.5 KB', dimensions: '400x300' }
          ];

          // Load sample images
          currentImages = sampleImages;
          loadImage(0);

          function loadImage(index) {
            if (index < 0 || index >= currentImages.length) return;
            
            currentIndex = index;
            const image = currentImages[index];
            
            mainImage.src = image.url;
            mainImage.onload = function() {
              dropZone.style.display = 'none';
              imageDisplay.style.display = 'flex';
              imageGallery.style.display = 'block';
              
              imageInfo.textContent = image.name + ' (' + (index + 1) + '/' + currentImages.length + ')';
              statusLeft.textContent = image.dimensions + ' • ' + image.size;
              
              updateZoom();
              updateGallery();
            };
          }

          function updateZoom() {
            mainImage.style.transform = \`scale(\${zoomLevel}) rotate(\${rotation}deg)\`;
            zoomLevelSpan.textContent = Math.round(zoomLevel * 100) + '%';
          }

          function updateGallery() {
            imageGallery.innerHTML = '';
            currentImages.forEach((img, index) => {
              const thumb = document.createElement('img');
              thumb.src = img.url;
              thumb.className = 'gallery-thumb' + (index === currentIndex ? ' active' : '');
              thumb.onclick = () => loadImage(index);
              imageGallery.appendChild(thumb);
            });
          }

          // Event listeners
          document.getElementById('open-btn').onclick = () => fileInput.click();
          
          document.getElementById('prev-btn').onclick = () => {
            if (currentIndex > 0) loadImage(currentIndex - 1);
          };
          
          document.getElementById('next-btn').onclick = () => {
            if (currentIndex < currentImages.length - 1) loadImage(currentIndex + 1);
          };

          document.getElementById('zoom-in').onclick = () => {
            zoomLevel = Math.min(zoomLevel * 1.2, 5);
            updateZoom();
          };

          document.getElementById('zoom-out').onclick = () => {
            zoomLevel = Math.max(zoomLevel / 1.2, 0.1);
            updateZoom();
          };

          document.getElementById('fit-screen').onclick = () => {
            zoomLevel = 1;
            rotation = 0;
            updateZoom();
          };

          document.getElementById('rotate-left').onclick = () => {
            rotation -= 90;
            updateZoom();
          };

          document.getElementById('rotate-right').onclick = () => {
            rotation += 90;
            updateZoom();
          };

          // Drag and drop
          dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
          };

          dropZone.ondragleave = () => {
            dropZone.classList.remove('drag-over');
          };

          dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            handleFiles(files);
          };

          fileInput.onchange = (e) => {
            handleFiles(e.target.files);
          };

          function handleFiles(files) {
            const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
            if (imageFiles.length === 0) return;

            currentImages = [];
            let loadedCount = 0;

            imageFiles.forEach((file, index) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                currentImages.push({
                  name: file.name,
                  url: e.target.result,
                  size: (file.size / 1024).toFixed(1) + ' KB',
                  dimensions: 'Loading...'
                });
                
                loadedCount++;
                if (loadedCount === imageFiles.length) {
                  loadImage(0);
                }
              };
              reader.readAsDataURL(file);
            });
          }

          // Pan functionality
          let isPanning = false;
          let startX = 0, startY = 0;
          let currentX = 0, currentY = 0;

          mainImage.onmousedown = (e) => {
            if (zoomLevel > 1) {
              isPanning = true;
              startX = e.clientX - currentX;
              startY = e.clientY - currentY;
              mainImage.style.cursor = 'grabbing';
            }
          };

          document.onmousemove = (e) => {
            if (isPanning) {
              currentX = e.clientX - startX;
              currentY = e.clientY - startY;
              mainImage.style.transform = \`translate(\${currentX}px, \${currentY}px) scale(\${zoomLevel}) rotate(\${rotation}deg)\`;
            }
          };

          document.onmouseup = () => {
            isPanning = false;
            if (mainImage) mainImage.style.cursor = 'grab';
          };

          // Keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            if (!imageDisplay.style.display || imageDisplay.style.display === 'none') return;
            
            switch(e.key) {
              case 'ArrowLeft':
                document.getElementById('prev-btn').click();
                break;
              case 'ArrowRight':
                document.getElementById('next-btn').click();
                break;
              case '+':
              case '=':
                document.getElementById('zoom-in').click();
                break;
              case '-':
                document.getElementById('zoom-out').click();
                break;
              case '0':
                document.getElementById('fit-screen').click();
                break;
            }
          });
        })();
      </script>
    `;
  }

  loadHuggingFaceApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🤗 Hugging Face Hub</h3>
        <p>AI model browser and integration</p>
        <div style="background: #ffeb3b; color: #333; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>Hugging Face integration will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }

  loadOpenRouterApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🔄 OpenRouter Hub</h3>
        <p>AI router and model switching</p>
        <div style="background: #2196f3; color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>OpenRouter integration will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }

  loadGitHubApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🐙 GitHub</h3>
        <p>GitHub integration and repository management</p>
        <div style="background: #333; color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>GitHub integration will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }

  loadOAuthLoginApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🔐 OAuth Login</h3>
        <p>Authentication and OAuth management</p>
        <div style="background: #4caf50; color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>OAuth functionality will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }

  loadNeuralNetworkDesignerApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🧠 Neural Network Designer</h3>
        <p>Visual neural network design and training</p>
        <div style="background: #9c27b0; color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>Neural network designer will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }

  loadTrainingManagerApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🎯 Training Manager</h3>
        <p>ML model training and monitoring</p>
        <div style="background: #ff5722; color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>Training manager will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }

  loadStrudelAIDAWApp(contentElement: HTMLElement) {
    contentElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h3>🎵 Strudel AI DAW</h3>
        <p>AI-powered digital audio workstation</p>
        <div style="background: #e91e63; color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div>Strudel AI DAW will be implemented here</div>
        </div>
        <button onclick="this.closest('.window').remove()" style="padding: 8px 16px;">Close</button>
      </div>
    `;
  }
}

// Initialize SwissKnife Desktop when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing SwissKnife Web Desktop with Vite...');
  
  // Initialize shared system components
  try {
    // Dynamic import of the browser platform keeps host-only shared/config code
    // out of browser entrypoints.
    const { configManager, aiManager, eventBus, initializeDefaultProviders } = await import('../src/platform/browser.js');
    
    // Initialize default AI providers
    initializeDefaultProviders({
      openai: {
        name: 'OpenAI',
        apiUrl: 'https://api.openai.com/v1',
        models: ['gpt-4', 'gpt-3.5-turbo'],
        enabled: true
      },
      ollama: {
        name: 'Ollama',
        apiUrl: 'http://localhost:11434',
        models: ['llama2', 'codellama'],
        enabled: true
      }
    });
    
    // Make shared system available globally for the enhanced CLI adapter
    (window as any).swissKnifeShared = {
      configManager,
      aiManager,
      eventBus,
      initialized: true
    };
    
    console.log('✅ SwissKnife shared system initialized successfully');
  } catch (error) {
    console.warn('⚠️ Failed to initialize shared system, using fallback:', error);
    (window as any).swissKnifeShared = {
      initialized: false,
      error: error.message
    };
  }
  
  window.desktop = new SwissKnifeDesktop();
});
