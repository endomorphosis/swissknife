import { VirtualFilesystem } from './VirtualFilesystem';

export class VFSManager {
  private static instance: VFSManager;
  private vfs: VirtualFilesystem;

  private constructor() {
    this.vfs = new VirtualFilesystem();
  }

  public static getInstance(): VFSManager {
    if (!VFSManager.instance) {
      VFSManager.instance = new VFSManager();
    }
    return VFSManager.instance;
  }

  public getVFS(): VirtualFilesystem {
    return this.vfs;
  }
}
