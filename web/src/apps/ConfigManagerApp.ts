/**
 * Config Manager App for SwissKnife Web Desktop
 */

import { getGlobalConfig, saveGlobalConfig, getCurrentProjectConfig, saveCurrentProjectConfig, setConfigForCLI, deleteConfigForCLI, getConfigForCLI, listConfigForCLI } from '../../src/utils/config';
import { CommandResult } from '../../src/types/command';

export class ConfigManagerApp {
  private desktop: any;

  constructor(desktop: any) {
    this.desktop = desktop;
  }

  async initialize() {
    console.log('Config Manager App initialized.');
  }

  private async executeCommand(command: () => Promise<CommandResult>) {
    const outputElement = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-output');
    if (outputElement) {
      outputElement.textContent = 'Executing...';
    }
    try {
      const result = await command();
      if (outputElement) {
        outputElement.textContent = result.success ? result.output || '' : `Error: ${result.error}`;
      }
    } catch (e: any) {
      if (outputElement) {
        outputElement.textContent = `Unexpected Error: ${e.message}`;
      }
    }
  }

  createWindow() {
    const content = `
      <div class="config-manager-app">
        <div class="app-header">
          <h2>⚙️ Config Manager</h2>
        </div>
        <div class="app-content">
          <h3>Config Commands (CLI features)</h3>
          <div>
            <label for="config-key">Key:</label>
            <input type="text" id="config-key" value="theme" />
          </div>
          <div>
            <label for="config-value">Value:</label>
            <input type="text" id="config-value" value="dark" />
          </div>
          <div>
            <label for="config-global">Global:</label>
            <input type="checkbox" id="config-global" />
          </div>
          <button onclick="window.configManagerApp.executeCommand(() => window.configManagerApp.get())">Get Config</button>
          <button onclick="window.configManagerApp.executeCommand(() => window.configManagerApp.set())">Set Config</button>
          <button onclick="window.configManagerApp.executeCommand(() => window.configManagerApp.remove())">Remove Config</button>
          <button onclick="window.configManagerApp.executeCommand(() => window.configManagerApp.list())">List Config</button>
          <pre id="config-output"></pre>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'Config Manager',
      content: content,
      width: 600,
      height: 400,
      resizable: true
    });

    // Expose ConfigManagerApp instance to the window for button clicks
    window.configManagerApp = this;

    return window;
  }

  async get(): Promise<CommandResult> {
    const key = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-key').value;
    const isGlobal = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-global').checked;
    try {
      const value = getConfigForCLI(key, isGlobal);
      return { success: true, output: `Config ${key}: ${JSON.stringify(value, null, 2)}`, exitCode: 0 };
    } catch (error: any) {
      return { success: false, error: `Failed to get config: ${error.message}`, exitCode: 1 };
    }
  }

  async set(): Promise<CommandResult> {
    const key = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-key').value;
    const value = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-value').value;
    const isGlobal = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-global').checked;
    try {
      setConfigForCLI(key, value, isGlobal);
      return { success: true, output: `Set config ${key} to ${value}`, exitCode: 0 };
    } catch (error: any) {
      return { success: false, error: `Failed to set config: ${error.message}`, exitCode: 1 };
    }
  }

  async remove(): Promise<CommandResult> {
    const key = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-key').value;
    const isGlobal = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-global').checked;
    try {
      deleteConfigForCLI(key, isGlobal);
      return { success: true, output: `Removed config ${key}`, exitCode: 0 };
    } catch (error: any) {
      return { success: false, error: `Failed to remove config: ${error.message}`, exitCode: 1 };
    }
  }

  async list(): Promise<CommandResult> {
    const isGlobal = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('config-global').checked;
    try {
      const config = listConfigForCLI(isGlobal);
      return { success: true, output: JSON.stringify(config, null, 2), exitCode: 0 };
    } catch (error: any) {
      return { success: false, error: `Failed to list config: ${error.message}`, exitCode: 1 };
    }
  }
}
