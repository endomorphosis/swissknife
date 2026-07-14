import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../src/services/apps/virtual-desktop-app-manifest.js';
import {
  buildAgentSupervisorLiveRoutes,
  buildAllAppRoutesFromLiveBackendContract,
  compileAllAppLiveOrbIdlHandoff,
  type AllAppLiveBackendContract,
} from '../src/services/glasses/all-app-live-orb-idl-handoff.js';
import { buildVirtualDesktopOrbIdlCompleteCoverage } from '../src/services/glasses/desktop-orb-idl-contract.js';

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const liveContractPath = join(evidenceRoot, 'app-backend-contract.json');
const handoffPath = join(evidenceRoot, 'all-app-live-orb-idl-handoff.json');
const generatedAt = '2026-07-13T00:00:00.000Z';

function readLiveContract(): AllAppLiveBackendContract {
  const contract = JSON.parse(readFileSync(liveContractPath, 'utf8')) as AllAppLiveBackendContract;
  if (!contract.schema || !Array.isArray(contract.apps)) {
    throw new Error(`Invalid live app backend contract: ${liveContractPath}`);
  }
  return contract;
}

function main(): void {
  const contract = readLiveContract();
  const descriptors = buildVirtualDesktopOrbIdlCompleteCoverage(
    VIRTUAL_DESKTOP_APP_MANIFEST,
  ).descriptors;
  const routes = [
    ...buildAllAppRoutesFromLiveBackendContract(contract, VIRTUAL_DESKTOP_APP_MANIFEST),
    ...buildAgentSupervisorLiveRoutes(),
  ];
  const catalog = compileAllAppLiveOrbIdlHandoff(routes, descriptors, {
    generatedAt,
    generatedFrom: [
      'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
    ],
  });

  const temporaryPath = `${handoffPath}.tmp`;
  mkdirSync(dirname(handoffPath), { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, handoffPath);

  console.log(JSON.stringify({
    schema: catalog.schema,
    task_id: catalog.task_id,
    packet_count: catalog.packet_count,
    app_count: catalog.app_count,
    supervisor_packet_count: catalog.supervisor_packet_count,
    output: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-orb-idl-handoff.json',
  }, null, 2));
}

main();
