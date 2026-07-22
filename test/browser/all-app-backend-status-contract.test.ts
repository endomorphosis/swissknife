import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ALL_APP_BACKEND_STATUS_CONTRACT,
  BACKEND_STATUS_MATRIX_SCHEMA,
  buildAllAppBackendStatusContract,
  buildBackendStatusMatrixEvidence,
  getAllAppBackendStatus,
  validateAllAppBackendStatusContract,
  type AllAppBackendStatusState,
} from '../../src/services/apps/all-app-backend-status-contract';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import {
  bindAllAppBackendStatusPanel,
  renderAllAppBackendStatusPanel,
} from '../../web/src/all-app-backend-status-panel';

const MATRIX_PATH = join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
  'app-improvement',
  'backend-status-matrix.json',
);

describe('SVD-134 all-app K/D/A backend status contract', () => {
  it('covers every canonical app with a browser-safe K/D/A status row set', () => {
    const validation = validateAllAppBackendStatusContract();
    expect(validation, validation.errors.join('\n')).toEqual({ valid: true, errors: [] });
    expect(ALL_APP_BACKEND_STATUS_CONTRACT.apps).toHaveLength(45);
    expect(ALL_APP_BACKEND_STATUS_CONTRACT.apps.map(app => app.app_id))
      .toEqual(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id));

    for (const app of ALL_APP_BACKEND_STATUS_CONTRACT.apps) {
      expect(app.statuses.map(status => status.key)).toEqual(['K', 'D', 'A']);
      expect(app.display_contract.component).toBe('all-app-backend-status-panel');
      for (const status of app.statuses) {
        expect(status.gateway).toMatchObject({
          browser_boundary: 'mediated_gateway_only',
          direct_backend_access: false,
          browser_credentials: 'never_exposed_to_application',
          host_file_access: 'never_exposed_to_application',
          owner_process_access: 'never_exposed_to_application',
        });
        expect(status.correlation).toMatchObject({
          required: true,
          preservation: 'required_and_preserved',
        });
        expect(status.recovery.never_silently_fallback).toBe(true);
        expect(status.recovery.routes.length).toBeGreaterThan(0);
      }
    }
  });

  it('distinguishes live, denied, unavailable, local-only, and external-provider roles', () => {
    const observedStates = new Set<AllAppBackendStatusState>(
      ALL_APP_BACKEND_STATUS_CONTRACT.apps.flatMap(app => app.statuses.map(status => status.state)),
    );
    expect([...observedStates].sort()).toEqual([
      'denied',
      'external-provider',
      'live',
      'local-only',
      'unavailable',
    ]);

    expect(getAllAppBackendStatus('terminal')?.statuses.every(status => status.state === 'live')).toBe(true);
    expect(getAllAppBackendStatus('api-keys')?.statuses.every(status =>
      status.state === 'denied'
      && status.policy.current_outcome === 'deny'
      && status.recovery.routes[0].error === 'policy_denied',
    )).toBe(true);
    expect(getAllAppBackendStatus('calculator')?.statuses.every(status =>
      status.state === 'local-only'
      && status.receipt.persistence === 'browser_runtime',
    )).toBe(true);
    expect(getAllAppBackendStatus('oauth-login')?.statuses.every(status =>
      status.state === 'external-provider'
      && status.source === 'provider-handoff',
    )).toBe(true);
    expect(getAllAppBackendStatus('p2p-network')?.statuses.some(status => status.state === 'unavailable')).toBe(true);
  });

  it('can reflect mediated gateway catalog unavailability without changing app ownership', () => {
    const terminalKitBinding = ALL_APP_LIVE_TOOL_BINDINGS.bindings.find(binding =>
      binding.app_id === 'terminal' && binding.owner === 'ipfs_kit_py',
    );
    expect(terminalKitBinding).toBeDefined();
    const contract = buildAllAppBackendStatusContract({
      controls: [{
        binding_id: terminalKitBinding!.binding_id,
        status: 'unavailable',
        selected_tool_id: null,
        transport: null,
        transports: [],
      }],
    });
    const validation = validateAllAppBackendStatusContract(contract);
    expect(validation, validation.errors.join('\n')).toEqual({ valid: true, errors: [] });
    const terminal = contract.apps.find(app => app.app_id === 'terminal');
    expect(terminal?.statuses.find(status => status.owner === 'ipfs_kit_py')).toMatchObject({
      state: 'unavailable',
      role: 'capability-unavailable',
      source: 'mediated-gateway',
    });
    expect(terminal?.statuses.find(status => status.owner === 'ipfs_datasets_py')?.state).toBe('live');
  });

  it('renders a browser-safe status component and updates receipt data from gateway events', () => {
    const html = renderAllAppBackendStatusPanel('terminal');
    expect(html).toContain('data-testid="all-app-backend-status-panel"');
    expect(html).not.toMatch(/https?:\/\/|127\.0\.0\.1|localhost|\/home\/|authorization|password|backend_url|host_path|python_process/i);

    const host = document.createElement('div');
    host.innerHTML = html;
    bindAllAppBackendStatusPanel(host, 'terminal');
    host.dispatchEvent(new CustomEvent('swissknife:live-gateway-result', {
      bubbles: true,
      detail: {
        state: 'executed',
        owner: 'ipfs_kit_py',
        correlation_id: 'corr-status-test',
        policy_outcome: 'allow',
        response: {
          response: {
            receipt: {
              receipt_id: 'receipt-status-test',
              policy_outcome: 'allow',
            },
          },
        },
      },
    }));

    const kitRow = host.querySelector<HTMLElement>('[data-backend-owner="ipfs_kit_py"]');
    expect(kitRow?.dataset.backendState).toBe('live');
    expect(kitRow?.querySelector('[data-backend-correlation]')?.textContent).toBe('corr-status-test');
    expect(kitRow?.querySelector('[data-backend-policy]')?.textContent).toBe('allow');
    expect(kitRow?.querySelector('[data-backend-receipt]')?.textContent).toBe('receipt-status-test');
  });

  it('writes the backend status matrix evidence artifact', () => {
    const evidence = buildBackendStatusMatrixEvidence(
      ALL_APP_BACKEND_STATUS_CONTRACT,
      '2026-07-20T00:00:00.000Z',
    );
    mkdirSync(dirname(MATRIX_PATH), { recursive: true });
    writeFileSync(MATRIX_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

    const parsed = JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as {
      schema?: string;
      task_id?: string;
      app_count?: number;
      summary?: { total_statuses?: number; states?: Record<string, number>; browser_safety?: Record<string, boolean> };
      apps?: unknown[];
    };
    expect(parsed.schema).toBe(BACKEND_STATUS_MATRIX_SCHEMA);
    expect(parsed.task_id).toBe('SVD-134');
    expect(parsed.app_count).toBe(45);
    expect(parsed.summary?.total_statuses).toBe(135);
    expect(parsed.summary?.states?.live).toBeGreaterThan(0);
    expect(parsed.summary?.states?.denied).toBeGreaterThan(0);
    expect(parsed.summary?.states?.unavailable).toBeGreaterThan(0);
    expect(parsed.summary?.states?.['local-only']).toBeGreaterThan(0);
    expect(parsed.summary?.states?.['external-provider']).toBeGreaterThan(0);
    expect(parsed.summary?.browser_safety).toMatchObject({
      backend_urls_exposed: false,
      credentials_exposed: false,
      host_paths_exposed: false,
      owner_processes_exposed: false,
    });
    expect(JSON.stringify(parsed)).not.toMatch(/https?:\/\/|127\.0\.0\.1|localhost|\/home\/|\b(?:authorization|password|backend_url|host_path|python_process)\b/i);
    expect(parsed.apps).toHaveLength(45);
  });
});
