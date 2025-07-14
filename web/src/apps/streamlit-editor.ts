/**
 * Streamlit Editor App for SwissKnife Web Desktop
 */

export class StreamlitEditor {
  private desktop: any;
  private codeEditor: HTMLTextAreaElement | null = null;
  private initialCode: string = `import streamlit as st

st.title("🎯 SwissKnife Streamlit Editor")
st.write("Welcome to the enhanced Streamlit editor!")

name = st.text_input("What's your name?")
if name:
    st.success(f"Hello, {name}! 👋")

st.info("This is running with the unified stlite management system.")

# Sample data visualization
import pandas as pd
import numpy as np

data = pd.DataFrame({
    'x': np.random.randn(100),
    'y': np.random.randn(100)
})

st.subheader("Sample Chart")
st.scatter_chart(data)`;

  constructor(options: { swissknife: any; stlite: any; windows: any }) {
    this.desktop = options.windows;
    // You can use options.swissknife and options.stlite if needed
  }

  async initialize() {
    console.log('Streamlit Editor initialized.');
  }

  render() {
    return `
      <div class="streamlit-editor-app" style="display: flex; flex-direction: column; height: 100%;">
        <div class="app-header" style="padding: 10px; background-color: #f0f0f0; border-bottom: 1px solid #ccc;">
          <h2>📝 Streamlit Editor</h2>
        </div>
        <div class="app-content" style="flex-grow: 1; display: flex;">
          <textarea id="streamlit-code-editor" style="flex-grow: 1; width: 100%; height: 100%; border: none; padding: 10px; font-family: monospace; font-size: 14px;"></textarea>
          <div id="streamlit-preview" style="flex-grow: 1; width: 100%; height: 100%; border-left: 1px solid #ccc;"></div>
        </div>
        <div class="app-footer" style="padding: 10px; background-color: #f0f0f0; border-top: 1px solid #ccc; text-align: right;">
          <button id="run-streamlit-code">Run Streamlit App</button>
        </div>
      </div>
    `;
  }

  onMount(windowElement: HTMLElement) {
    console.log('Streamlit Editor mounted to window', windowElement);
    this.codeEditor = windowElement.querySelector('#streamlit-code-editor') as HTMLTextAreaElement;
    if (this.codeEditor) {
      this.codeEditor.value = this.initialCode;
    }

    const runButton = windowElement.querySelector('#run-streamlit-code') as HTMLButtonElement;
    if (runButton) {
      runButton.addEventListener('click', () => this.runStreamlitApp());
    }
  }

  getCode(): string {
    return this.codeEditor ? this.codeEditor.value : '';
  }

  setCode(code: string) {
    if (this.codeEditor) {
      this.codeEditor.value = code;
    }
  }

  private runStreamlitApp() {
    const code = this.getCode();
    const previewContainer = document.getElementById('streamlit-preview');
    if (previewContainer && (window as any).stlite && (window as any).stlite.mount) {
      previewContainer.innerHTML = ''; // Clear previous app
      (window as any).stlite.mount(
        {
          entrypoint: 'streamlit_app.py',
          files: {
            'streamlit_app.py': code
          }
        },
        previewContainer
      );
    } else if (previewContainer) {
      previewContainer.innerHTML = '<p>❌ Stlite not available for preview.</p>';
    }
  }

  createWindow() {
    const content = this.render();

    const window = this.desktop.createWindow({
      title: 'Streamlit Editor',
      content: content,
      width: 1200,
      height: 800,
      resizable: true,
      app: this // Pass the app instance to the window
    });

    return window;
  }
}