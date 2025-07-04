// web/src/apps/VFSBrowser.ts
export class VFSBrowser extends BaseApplication {
  private vfs: VirtualFilesystem;
  private currentPath: string = '/';
  private selectedFiles: Set<string> = new Set();

  async initialize(): Promise<void> {
    this.createUI();
    await this.refreshView();
    this.setupEventHandlers();
  }

  private createUI(): void {
    this.window.innerHTML = `
      <div class="vfs-browser">
        <div class="toolbar">
          <div class="path-bar">
            <input type="text" class="path-input" value="${this.currentPath}">
            <button class="nav-up">↑</button>
            <button class="refresh">🔄</button>
          </div>
          <div class="actions">
            <button class="upload">📤 Upload</button>
            <button class="download">📥 Download</button>
            <button class="new-folder">📁 New Folder</button>
            <button class="sync">🔄 Sync</button>
          </div>
        </div>
        
        <div class="content">
          <div class="sidebar">
            <div class="mounts">
              <h3>Mounted Backends</h3>
              <div class="mount-list"></div>
              <button class="add-mount">+ Add Mount</button>
            </div>
          </div>
          
          <div class="main-view">
            <div class="file-list">
              <table class="file-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Backend</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody class="file-entries"></tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div class="status-bar">
          <span class="selection-info"></span>
          <span class="backend-status"></span>
        </div>
      </div>
    `;
  }

  private async refreshView(): Promise<void> {
    try {
      const entries = await this.vfs.list(this.currentPath);
      this.renderFileList(entries);
      this.updateMountList();
    } catch (error) {
      this.showError(`Failed to load directory: ${error.message}`);
    }
  }

  private renderFileList(entries: VFSEntry[]): void {
    const tbody = this.window.querySelector('.file-entries') as HTMLElement;
    tbody.innerHTML = entries.map(entry => `
      <tr class="file-entry" data-path="${entry.path}">
        <td><input type="checkbox" class="file-select"></td>
        <td class="file-name">
          <span class="file-icon">${entry.isDirectory ? '📁' : '📄'}</span>
          <span class="name">${entry.name}</span>
        </td>
        <td class="file-size">${entry.size ? this.formatSize(entry.size) : ''}</td>
        <td class="file-modified">${entry.modified ? this.formatDate(entry.modified) : ''}</td>
        <td class="file-backend">
          <span class="backend-tag ${entry.backend}">${entry.backend}</span>
        </td>
        <td class="file-actions">
          <button class="action-download" title="Download">📥</button>
          <button class="action-share" title="Share">🔗</button>
          <button class="action-info" title="Info">ℹ️</button>
          <button class="action-delete" title="Delete">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  private async handleFileUpload(files: FileList): Promise<void> {
    for (const file of Array.from(files)) {
      try {
        const buffer = await file.arrayBuffer();
        const path = `${this.currentPath}/${file.name}`;
        await this.vfs.write(path, Buffer.from(buffer));
        this.showSuccess(`Uploaded ${file.name}`);
      } catch (error) {
        this.showError(`Failed to upload ${file.name}: ${error.message}`);
      }
    }
    await this.refreshView();
  }

  private async handleCrossBackendCopy(src: string, destBackend: string): Promise<void> {
    try {
      const destPath = src.replace(/^\/[^\/]+/, `/${destBackend}`);
      await this.vfs.copy(src, destPath);
      this.showSuccess(`Copied to ${destBackend}`);
      await this.refreshView();
    } catch (error) {
      this.showError(`Cross-backend copy failed: ${error.message}`);
    }
  }
}