import { DescriptorAppRuntime } from '../../../../web/js/core/descriptor-runtime.js';
import { validateDescriptor } from '../../../../web/js/core/idl-contracts.js';
import { renderTemplate } from '../../../../web/js/core/ui-templates.js';
import { mcpControlDescriptor } from '../../../../web/js/descriptors/apps/mcp-control.descriptor.js';
import { ipfsExplorerDescriptor } from '../../../../web/js/descriptors/apps/ipfs-explorer.descriptor.js';

describe('Descriptor runtime', () => {
  test('validates pilot descriptors', () => {
    expect(validateDescriptor(mcpControlDescriptor).valid).toBe(true);
    expect(validateDescriptor(ipfsExplorerDescriptor).valid).toBe(true);
  });

  test('registers desktop descriptor apps', () => {
    const runtime = new DescriptorAppRuntime({
      descriptors: [mcpControlDescriptor, ipfsExplorerDescriptor]
    });

    const registrations = runtime.getDesktopRegistrations();
    const appIds = registrations.map((entry) => entry.appId);

    expect(appIds).toContain('mcp-control');
    expect(appIds).toContain('ipfs-explorer');
    expect(registrations.every((entry) => entry.component === 'DescriptorAppComponent')).toBe(true);
  });

  test('renders template-backed descriptor app', async () => {
    const descriptor = {
      contractVersion: '1.0.0',
      lifecycle: ['discover', 'bind', 'authorize', 'invoke', 'stream_updates', 'recover'],
      compatibilityPolicy: { semver: true },
      meta: { id: 'test-app', name: 'Test App', version: '1.0.0' },
      services: [{ name: 'test-service', version: '1.0.0', operations: ['ping'], streams: [] }],
      ui: {
        template: 'dashboard',
        window: { title: 'Test App', icon: '🧪', singleton: true },
        regions: [{ name: 'Overview', description: 'overview region' }],
        commands: []
      },
      dataContracts: { entities: { test: { fields: ['id'] } } },
      stateModel: { conflictPolicy: 'last-write-wins' }
    };

    const runtime = new DescriptorAppRuntime({ descriptors: [descriptor] });
    const mount = { innerHTML: '', querySelectorAll: () => [] };
    const result = await runtime.renderApp('test-app', { contentElement: mount });

    expect(result.html).toContain('Test App');
    expect(mount.innerHTML).toContain('Overview');
  });

  test('renders named template packs', () => {
    const html = renderTemplate('explorer', {
      title: 'Explorer App',
      commands: [{ action: 'refresh', label: 'Refresh' }],
      regions: [{ name: 'Files' }],
      services: [{ name: 'ipfs_datasets', status: 'connected' }],
      policyState: 'ready'
    });

    expect(html).toContain('Explorer App');
    expect(html).toContain('Refresh');
    expect(html).toContain('ipfs_datasets');
  });
});

