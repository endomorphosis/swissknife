export class FileSystemAdapter {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private currentPath: string = '/';

  async initialize(): Promise<void> {
    console.log('Initializing FileSystemAdapter...');
    try {
      // Try to get a previously granted permission
      this.directoryHandle = await navigator.storage.getDirectory();
      console.log('Retrieved previously granted directory handle.');
      this.currentPath = '/'; // Reset current path on initialization
    } catch (error) {
      console.warn('No previously granted directory handle found or error:', error);
      // If no handle, we'll request it when needed
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      this.directoryHandle = await window.showDirectoryPicker();
      console.log('User granted directory access.');
      this.currentPath = '/';
      return true;
    } catch (error) {
      console.error('User denied directory access:', error);
      this.directoryHandle = null;
      return false;
    }
  }

  private async getFileHandle(filePath: string, create: boolean = false): Promise<FileSystemFileHandle> {
    if (!this.directoryHandle) {
      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('File system access denied.');
      }
    }

    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = this.directoryHandle!;
    const pathParts = filePath.split('/').filter(part => part.length > 0);

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (i === pathParts.length - 1 && !part.includes('.')) { // Last part is a directory
        try {
          currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(part, { create: create });
        } catch (error) {
          throw new Error(`Could not get directory handle for ${part}: ${error}`);
        }
      } else if (i === pathParts.length - 1) { // Last part is a file
        try {
          return await (currentHandle as FileSystemDirectoryHandle).getFileHandle(part, { create: create });
        } catch (error) {
          throw new Error(`Could not get file handle for ${part}: ${error}`);
        }
      } else { // Intermediate part is a directory
        try {
          currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(part, { create: create });
        } catch (error) {
          throw new Error(`Could not get directory handle for ${part}: ${error}`);
        }
      }
    }
    throw new Error('Invalid file path.');
  }

  async read(filePath: string): Promise<string> {
    const fileHandle = await this.getFileHandle(filePath);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  async write(filePath: string, content: string): Promise<void> {
    const fileHandle = await this.getFileHandle(filePath, true); // Create if not exists
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async delete(filePath: string): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('File system access not initialized.');
    }
    const pathParts = filePath.split('/').filter(part => part.length > 0);
    if (pathParts.length === 0) {
      throw new Error('Cannot delete root directory.');
    }
    const fileName = pathParts.pop()!;
    let parentHandle: FileSystemDirectoryHandle = this.directoryHandle;

    for (const part of pathParts) {
      parentHandle = await parentHandle.getDirectoryHandle(part);
    }
    await parentHandle.removeEntry(fileName);
  }

  async readdir(path: string = this.currentPath): Promise<string[]> {
    if (!this.directoryHandle) {
      throw new Error('File system access not initialized.');
    }
    let targetHandle: FileSystemDirectoryHandle = this.directoryHandle;
    const pathParts = path.split('/').filter(part => part.length > 0);

    for (const part of pathParts) {
      targetHandle = await targetHandle.getDirectoryHandle(part);
    }

    const entries: string[] = [];
    for await (const entry of targetHandle.values()) {
      entries.push(entry.name);
    }
    return entries;
  }

  async cwd(): Promise<string> {
    return this.currentPath;
  }

  async chdir(path: string): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('File system access not initialized.');
    }
    // For simplicity, this chdir will only update the internal currentPath
    // A more robust implementation would validate the path against the actual file system
    // and potentially update the directoryHandle if navigating to a different top-level directory.
    // For now, we assume all operations are relative to the initial directoryHandle.
    const newPath = path.startsWith('/') ? path : `${this.currentPath === '/' ? '' : this.currentPath}/${path}`;
    // Normalize path (e.g., remove ../, ./, //)
    const normalizedPath = newPath.split('/').filter(p => p).reduce((acc: string[], p: string) => {
      if (p === '..') {
        acc.pop();
      } else if (p !== '.') {
        acc.push(p);
      }
      return acc;
    }, []).join('/');
    this.currentPath = `/${normalizedPath}`;
  }
}
