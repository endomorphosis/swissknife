export class VirtualFilesystem {
    async mount(path: string, backend: any): Promise<void> {
        console.log(`Mock mount: ${backend.name} at ${path}`);
    }

    async list(path: string): Promise<any[]> {
        console.log(`Mock list: ${path}`);
        return [];
    }

    async copy(src: string, dest: string): Promise<void> {
        console.log(`Mock copy: ${src} to ${dest}`);
    }

    async mirror(src: string, dest: string): Promise<void> {
        console.log(`Mock mirror: ${src} to ${dest}`);
    }

    async synchronize(): Promise<any> {
        console.log('Mock synchronize');
        return { filesUpdated: 0 };
    }
}
