import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ALL_APP_LIVE_TOOL_BINDINGS,
  validateAllAppLiveToolBindings,
} from '../src/services/apps/all-app-live-tool-bindings.js';

const outputPath = join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
  'all-app-live-tool-bindings.json',
);

const validation = validateAllAppLiveToolBindings();
if (!validation.valid) {
  throw new Error(`SVD-104 live binding capture failed: ${validation.errors.join('; ')}`);
}

const report = {
  schema: 'swissknife.all-app-live-tool-bindings-evidence.v1',
  task_id: 'SVD-104',
  generated_at: new Date().toISOString(),
  capture_mode: 'executable-browser-binding-catalog',
  source_contract: ALL_APP_LIVE_TOOL_BINDINGS.source_contract,
  bindings: ALL_APP_LIVE_TOOL_BINDINGS.bindings.map(binding => ({
    app_id: binding.app_id,
    binding_id: binding.binding_id,
    capability_id: binding.capability_id,
    intent_id: binding.intent_id,
    owner: binding.owner,
    transports: binding.gateway.transports,
    ui_control_id: binding.ui_control_id,
    recovery_errors: binding.recovery_routes.map(route => route.error),
  })),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  task_id: report.task_id,
  binding_count: report.bindings.length,
  output: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json',
}, null, 2));
