import { exec } from 'child_process.js';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ReleasePackager {
  public async packageForLinux(): Promise<void> {
    console.log('Packaging for Linux...');
    await execAsync('pkg . --targets node16-linux-x64 --output dist/swissknife-linux');
    console.log('Linux package created at dist/swissknife-linux');
  }

  public async packageForMacOS(): Promise<void> {
    console.log('Packaging for macOS...');
    await execAsync('pkg . --targets node16-macos-x64 --output dist/swissknife-macos');
    console.log('macOS package created at dist/swissknife-macos');
  }

  public async packageForWindows(): Promise<void> {
    console.log('Packaging for Windows...');
    await execAsync('pkg . --targets node16-win-x64 --output dist/swissknife-windows.exe');
    console.log('Windows package created at dist/swissknife-windows.exe');
  }

  public async createPackages(): Promise<void> {
    console.log('Starting release packaging...');
    await this.packageForLinux();
    await this.packageForMacOS();
    await this.packageForWindows();
    console.log('All packages created successfully.');
  }
}
