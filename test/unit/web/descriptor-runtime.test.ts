import { DescriptorAppRuntime } from '../../../web/js/core/descriptor-runtime.js';
import { validateDescriptor } from '../../../web/js/core/idl-contracts.js';
import { renderTemplate } from '../../../web/js/core/ui-templates.js';
import { mcpControlDescriptor } from '../../../web/js/descriptors/apps/mcp-control.descriptor.js';
import { ipfsExplorerDescriptor } from '../../../web/js/descriptors/apps/ipfs-explorer.descriptor.js';

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
    const listeners = {};
    let invokeCalled = false;
    const mockOrbClient = {
      createCorrelationId: () => 'test-correlation',
      discover: async () => ({ discovered: true }),
      bind: async () => ({ bound: true }),
      authorize: async () => ({ authorized: true }),
      invoke: async () => {
        invokeCalled = true;
        return { ok: true };
      },
      stream: async () => ({ close: () => null })
    };

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
        commands: [{ action: 'ping', label: 'Ping' }]
      },
      dataContracts: { entities: { test: { fields: ['id'] } } },
      stateModel: { conflictPolicy: 'last-write-wins' },
      actions: {
        ping: { service: 'test-service', operation: 'ping' }
      }
    };

    const runtime = new DescriptorAppRuntime({ descriptors: [descriptor], orbClient: mockOrbClient });
    const button = {
      dataset: { action: 'ping' },
      addEventListener: (eventName, handler) => {
        listeners[eventName] = handler;
      }
    };
    const mount = {
      innerHTML: '',
      querySelectorAll: (selector) => selector === '[data-action]' ? [button] : []
    };
    const result = await runtime.renderApp('test-app', { contentElement: mount });

    expect(result.html).toContain('Test App');
    expect(mount.innerHTML).toContain('Overview');
    expect(typeof listeners.click).toBe('function');
    await listeners.click();
    expect(invokeCalled).toBe(true);
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
