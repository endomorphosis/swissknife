import { VFSCommands } from '../../../cli/vfs-commands';
import { CommandResult } from '../../../src/types/command';

const vfsCommands = new VFSCommands();

export const vfsApi = {
  mount: async (backend: string, path: string, config: any): Promise<CommandResult> => {
    return vfsCommands.mount(backend, path, config);
  },
  ls: async (path?: string): Promise<CommandResult> => {
    return vfsCommands.ls(path);
  },
  cp: async (src: string, dest: string): Promise<CommandResult> => {
    return vfsCommands.cp(src, dest);
  },
  mirror: async (src: string, dest: string): Promise<CommandResult> => {
    return vfsCommands.mirror(src, dest);
  },
  sync: async (): Promise<CommandResult> => {
    return vfsCommands.sync();
  },
};
