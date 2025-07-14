import { VirtualFilesystem } from '../../src/storage/vfs/VirtualFilesystem';
import { CommandResult } from '../../src/types/command';
import { StorageBackend } from '../../src/storage/vfs/vfs-types';

/**
 * VFS Browser App for SwissKnife Web Desktop
 */

export class VFSBrowser {
  private desktop: any;
  private vfs: VirtualFilesystem;

  constructor(desktop: any) {
    this.desktop = desktop;
    this.vfs = new VirtualFilesystem(); // Initialize VFS
  }

  async initialize() {
    console.log('VFS Browser initialized.');
  }

  private async executeCommand(command: () => Promise<CommandResult>) {
    const outputElement = this.desktop.getWindowDocument(this.desktop.currentWindow.id).getElementById('vfs-output');
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

  async mount(backend: string, path: string, config: any): Promise<CommandResult> {
    try {
      await this.vfs.mount(path, { name: backend, config: config } as StorageBackend);
      
      return {
        success: true,
        output: `✅ Mounted ${backend} at ${path}`,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to mount ${backend}: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async ls(path: string = '/'): Promise<CommandResult> {
    try {
      const entries = await this.vfs.list(path);
      const output = entries.map(entry => {
        const type = entry.isDirectory ? 'd' : '-';
        const size = entry.size ? this.formatSize(entry.size) : '';
        const backend = (entry as any).backend || ''; // Cast to any to access backend
        return `${type} ${entry.name.padEnd(30)} ${size.padStart(10)} ${backend}`;
      }).join('\n');

      return {
        success: true,
        output: `📁 ${path}\n${output}`,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list ${path}: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async cp(src: string, dest: string): Promise<CommandResult> {
    try {
      await this.vfs.copy(src, dest);
      return {
        success: true,
        output: `✅ Copied ${src} → ${dest}`,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Copy failed: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async mirror(src: string, dest: string): Promise<CommandResult> {
    try {
      await this.vfs.mirror(src, dest);
      return {
        success: true,
        output: `✅ Mirrored ${src} → ${dest}`,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Mirror failed: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async sync(): Promise<CommandResult> {
    try {
      const syncReport = await this.vfs.synchronize();
      return {
        success: true,
        output: `🔄 Sync complete: ${syncReport.filesUpdated} files updated`,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Sync failed: ${error.message}`,
        exitCode: 1
      };
    }
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  createWindow() {
    const content = `
      <div class="vfs-browser-app">
        <div class="app-header">
          <h2>🗂️ VFS Browser</h2>
        </div>
        <div class="app-content">
          <p>Welcome to VFS Browser! This application is under development.</p>
          <p>Future features will include:</p>
          <ul>
            <li>Browsing the Virtual File System</li>
            <li>Managing virtual files and directories</li>
            <li>Integrating with various storage backends</li>
          </ul>
          <h3>VFS Commands (CLI features)</h3>
          <button onclick="window.vfsBrowserApp.executeCommand(() => window.vfsBrowserApp.ls('/'))">ls /</button>
          <button onclick="window.vfsBrowserApp.executeCommand(() => window.vfsBrowserApp.mount('mock', '/mnt/mock', {}))">mount mock</button>
          <button onclick="window.vfsBrowserApp.executeCommand(() => window.vfsBrowserApp.cp('/src/file.txt', '/dest/file.txt'))">cp</button>
          <button onclick="window.vfsBrowserApp.executeCommand(() => window.vfsBrowserApp.mirror('/src', '/dest'))">mirror</button>
          <button onclick="window.vfsBrowserApp.executeCommand(() => window.vfsBrowserApp.sync())">sync</button>
          <pre id="vfs-output"></pre>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'VFS Browser',
      content: content,
      width: 800,
      height: 600,
      resizable: true
    });

    // Expose VFSBrowser instance to the window for button clicks
    window.vfsBrowserApp = this;

    return window;
  }
}