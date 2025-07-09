import { VirtualFilesystem } from '../src/storage/vfs/VirtualFilesystem';
import { CommandResult } from '../src/types/command';

// cli/vfs-commands.ts
export class VFSCommands {
  constructor(private vfs: VirtualFilesystem) {}

  async mount(backend: string, path: string, config: any): Promise<CommandResult> {
    try {
      const backendInstance = this.createBackend(backend, config);
      await this.vfs.mount(path, backendInstance);
      
      return {
        success: true,
        output: `✅ Mounted ${backend} at ${path}`,
        exitCode: 0
      };
    } catch (error) {
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
        const backend = entry.backend || '';
        return `${type} ${entry.name.padEnd(30)} ${size.padStart(10)} ${backend}`;
      }).join('\n');

      return {
        success: true,
        output: `📁 ${path}
${output}`,
        exitCode: 0
      };
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      return {
        success: false,
        error: `Sync failed: ${error.message}`,
        exitCode: 1
      };
    }
  }
}