#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

const validator = String.raw`
import fs from 'fs';
import path from 'path';
import MCPDaemonManager from '../hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
} from './src/services/mcp/swissknife-mcp-capability-registry.ts';

const catalogPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-mcp-dashboard-catalog.json',
);
const consumerReceiptPath = path.resolve('test', 'e2e', 'fixtures', 'hao-681-mcp-dashboard-catalog-consumer.json');
const launchReceiptPath = path.resolve('test', 'e2e', 'fixtures', 'hao-704-mcp-dashboard-launch-gate.json');
const vai512ConsumptionReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-hallucinate-swissknife-mcp-dashboard-consumption.json',
);
const hao727LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'hao-727-mcp-dashboard-launch-gate.json',
);
const mgw558LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-558-mcp-dashboard-launch-gate.json',
);
const mgw559LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-559-mcp-dashboard-launch-gate.json',
);
const mgw561LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-561-mcp-dashboard-launch-gate.json',
);
const mgw562LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-562-mcp-dashboard-launch-gate.json',
);
const mgw563LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-563-mcp-dashboard-launch-gate.json',
);
const mgw566LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-566-mcp-dashboard-launch-gate.json',
);
const vai548LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-548-mcp-dashboard-launch-gate.json',
);
const mgw564LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-564-mcp-dashboard-launch-gate.json',
);
const vai564LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-564-mcp-dashboard-launch-gate.json',
);
const vai567LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-567-mcp-dashboard-launch-gate.json',
);
const vai566LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-566-mcp-dashboard-launch-gate.json',
);
const vai569LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-569-mcp-dashboard-launch-gate.json',
);
const vai572LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-572-mcp-dashboard-launch-gate.json',
);
const vai575LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-575-mcp-dashboard-launch-gate.json',
);
const vai578LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-578-mcp-dashboard-launch-gate.json',
);
const vai581LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-581-mcp-dashboard-launch-gate.json',
);
const vai584LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-584-mcp-dashboard-launch-gate.json',
);
const vai587LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-587-mcp-dashboard-launch-gate.json',
);
const vai590LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-590-mcp-dashboard-launch-gate.json',
);
const vai591LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-591-mcp-dashboard-launch-gate.json',
);
const vai594LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-594-mcp-dashboard-launch-gate.json',
);
const vai597LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-597-mcp-dashboard-launch-gate.json',
);
const vai600LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-600-mcp-dashboard-launch-gate.json',
);
const vai603LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-603-mcp-dashboard-launch-gate.json',
);
const vai606LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-606-mcp-dashboard-launch-gate.json',
);
const vai609LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-609-mcp-dashboard-launch-gate.json',
);
const vai610LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-610-mcp-dashboard-launch-gate.json',
);
const vai613LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-613-mcp-dashboard-launch-gate.json',
);
const vai616LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-616-mcp-dashboard-launch-gate.json',
);
const vai619LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-619-mcp-dashboard-launch-gate.json',
);
const vai622LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-622-mcp-dashboard-launch-gate.json',
);
const vai625LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-625-mcp-dashboard-launch-gate.json',
);
const vai628LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-628-mcp-dashboard-launch-gate.json',
);
const vai595LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-595-mcp-dashboard-launch-gate.json',
);
const vai598LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-598-mcp-dashboard-launch-gate.json',
);
const vai601LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-601-mcp-dashboard-launch-gate.json',
);
const vai604LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-604-mcp-dashboard-launch-gate.json',
);
const vai607LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-607-mcp-dashboard-launch-gate.json',
);
const vai611LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-611-mcp-dashboard-launch-gate.json',
);
const vai614LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-614-mcp-dashboard-launch-gate.json',
);
const vai617LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-617-mcp-dashboard-launch-gate.json',
);
const vai620LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-620-mcp-dashboard-launch-gate.json',
);
const vai623LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-623-mcp-dashboard-launch-gate.json',
);
const vai626LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-626-mcp-dashboard-launch-gate.json',
);
const vai629LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-629-mcp-dashboard-launch-gate.json',
);
const vai632LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-632-mcp-dashboard-launch-gate.json',
);
const vai635LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-635-mcp-dashboard-launch-gate.json',
);
const vai638LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-638-mcp-dashboard-launch-gate.json',
);
const vai640LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-640-mcp-dashboard-launch-gate.json',
);
const vai642LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-642-mcp-dashboard-launch-gate.json',
);
const vai644LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-644-mcp-dashboard-launch-gate.json',
);
const vai647LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-647-mcp-dashboard-launch-gate.json',
);
const vai649LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-649-mcp-dashboard-launch-gate.json',
);
const vai651LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-651-mcp-dashboard-launch-gate.json',
);
const vai653LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-653-mcp-dashboard-launch-gate.json',
);
const vai655LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-655-mcp-dashboard-launch-gate.json',
);
const vai657LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-657-mcp-dashboard-launch-gate.json',
);
const vai659LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-659-mcp-dashboard-launch-gate.json',
);
const vai634LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-634-mcp-dashboard-launch-gate.json',
);
const vai637LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-637-mcp-dashboard-launch-gate.json',
);
const vai631LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-631-mcp-dashboard-launch-gate.json',
);
const vai573LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-573-mcp-dashboard-launch-gate.json',
);
const vai576LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-576-mcp-dashboard-launch-gate.json',
);
const vai579LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-579-mcp-dashboard-launch-gate.json',
);
const vai582LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-582-mcp-dashboard-launch-gate.json',
);
const vai585LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-585-mcp-dashboard-launch-gate.json',
);
const vai588LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-588-mcp-dashboard-launch-gate.json',
);
const vai592LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-592-mcp-dashboard-launch-gate.json',
);
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const consumerReceipt = JSON.parse(fs.readFileSync(consumerReceiptPath, 'utf8'));
const launchReceipt = JSON.parse(fs.readFileSync(launchReceiptPath, 'utf8'));
const vai512ConsumptionReceipt = JSON.parse(fs.readFileSync(vai512ConsumptionReceiptPath, 'utf8'));
const hao727LaunchGateReceipt = JSON.parse(fs.readFileSync(hao727LaunchGateReceiptPath, 'utf8'));
const mgw558LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw558LaunchGateReceiptPath, 'utf8'));
const mgw559LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw559LaunchGateReceiptPath, 'utf8'));
const mgw561LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw561LaunchGateReceiptPath, 'utf8'));
const mgw562LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw562LaunchGateReceiptPath, 'utf8'));
const mgw563LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw563LaunchGateReceiptPath, 'utf8'));
const mgw566LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw566LaunchGateReceiptPath, 'utf8'));
const vai548LaunchGateReceipt = JSON.parse(fs.readFileSync(vai548LaunchGateReceiptPath, 'utf8'));
const mgw564LaunchGateReceipt = JSON.parse(fs.readFileSync(mgw564LaunchGateReceiptPath, 'utf8'));
const vai564LaunchGateReceipt = JSON.parse(fs.readFileSync(vai564LaunchGateReceiptPath, 'utf8'));
const vai567LaunchGateReceipt = JSON.parse(fs.readFileSync(vai567LaunchGateReceiptPath, 'utf8'));
const vai566LaunchGateReceipt = JSON.parse(fs.readFileSync(vai566LaunchGateReceiptPath, 'utf8'));
const vai569LaunchGateReceipt = JSON.parse(fs.readFileSync(vai569LaunchGateReceiptPath, 'utf8'));
const vai572LaunchGateReceipt = JSON.parse(fs.readFileSync(vai572LaunchGateReceiptPath, 'utf8'));
const vai575LaunchGateReceipt = JSON.parse(fs.readFileSync(vai575LaunchGateReceiptPath, 'utf8'));
const vai578LaunchGateReceipt = JSON.parse(fs.readFileSync(vai578LaunchGateReceiptPath, 'utf8'));
const vai581LaunchGateReceipt = JSON.parse(fs.readFileSync(vai581LaunchGateReceiptPath, 'utf8'));
const vai584LaunchGateReceipt = JSON.parse(fs.readFileSync(vai584LaunchGateReceiptPath, 'utf8'));
const vai587LaunchGateReceipt = JSON.parse(fs.readFileSync(vai587LaunchGateReceiptPath, 'utf8'));
const vai590LaunchGateReceipt = JSON.parse(fs.readFileSync(vai590LaunchGateReceiptPath, 'utf8'));
const vai591LaunchGateReceipt = JSON.parse(fs.readFileSync(vai591LaunchGateReceiptPath, 'utf8'));
const vai594LaunchGateReceipt = JSON.parse(fs.readFileSync(vai594LaunchGateReceiptPath, 'utf8'));
const vai597LaunchGateReceipt = JSON.parse(fs.readFileSync(vai597LaunchGateReceiptPath, 'utf8'));
const vai600LaunchGateReceipt = JSON.parse(fs.readFileSync(vai600LaunchGateReceiptPath, 'utf8'));
const vai603LaunchGateReceipt = JSON.parse(fs.readFileSync(vai603LaunchGateReceiptPath, 'utf8'));
const vai606LaunchGateReceipt = JSON.parse(fs.readFileSync(vai606LaunchGateReceiptPath, 'utf8'));
const vai609LaunchGateReceipt = JSON.parse(fs.readFileSync(vai609LaunchGateReceiptPath, 'utf8'));
const vai610LaunchGateReceipt = JSON.parse(fs.readFileSync(vai610LaunchGateReceiptPath, 'utf8'));
const vai613LaunchGateReceipt = JSON.parse(fs.readFileSync(vai613LaunchGateReceiptPath, 'utf8'));
const vai616LaunchGateReceipt = JSON.parse(fs.readFileSync(vai616LaunchGateReceiptPath, 'utf8'));
const vai619LaunchGateReceipt = JSON.parse(fs.readFileSync(vai619LaunchGateReceiptPath, 'utf8'));
const vai622LaunchGateReceipt = JSON.parse(fs.readFileSync(vai622LaunchGateReceiptPath, 'utf8'));
const vai625LaunchGateReceipt = JSON.parse(fs.readFileSync(vai625LaunchGateReceiptPath, 'utf8'));
const vai628LaunchGateReceipt = JSON.parse(fs.readFileSync(vai628LaunchGateReceiptPath, 'utf8'));
const vai595LaunchGateReceipt = JSON.parse(fs.readFileSync(vai595LaunchGateReceiptPath, 'utf8'));
const vai598LaunchGateReceipt = JSON.parse(fs.readFileSync(vai598LaunchGateReceiptPath, 'utf8'));
const vai601LaunchGateReceipt = JSON.parse(fs.readFileSync(vai601LaunchGateReceiptPath, 'utf8'));
const vai604LaunchGateReceipt = JSON.parse(fs.readFileSync(vai604LaunchGateReceiptPath, 'utf8'));
const vai607LaunchGateReceipt = JSON.parse(fs.readFileSync(vai607LaunchGateReceiptPath, 'utf8'));
const vai611LaunchGateReceipt = JSON.parse(fs.readFileSync(vai611LaunchGateReceiptPath, 'utf8'));
const vai614LaunchGateReceipt = JSON.parse(fs.readFileSync(vai614LaunchGateReceiptPath, 'utf8'));
const vai617LaunchGateReceipt = JSON.parse(fs.readFileSync(vai617LaunchGateReceiptPath, 'utf8'));
const vai620LaunchGateReceipt = JSON.parse(fs.readFileSync(vai620LaunchGateReceiptPath, 'utf8'));
const vai623LaunchGateReceipt = JSON.parse(fs.readFileSync(vai623LaunchGateReceiptPath, 'utf8'));
const vai626LaunchGateReceipt = JSON.parse(fs.readFileSync(vai626LaunchGateReceiptPath, 'utf8'));
const vai629LaunchGateReceipt = JSON.parse(fs.readFileSync(vai629LaunchGateReceiptPath, 'utf8'));
const vai632LaunchGateReceipt = JSON.parse(fs.readFileSync(vai632LaunchGateReceiptPath, 'utf8'));
const vai635LaunchGateReceipt = JSON.parse(fs.readFileSync(vai635LaunchGateReceiptPath, 'utf8'));
const vai638LaunchGateReceipt = JSON.parse(fs.readFileSync(vai638LaunchGateReceiptPath, 'utf8'));
const vai640LaunchGateReceipt = JSON.parse(fs.readFileSync(vai640LaunchGateReceiptPath, 'utf8'));
const vai642LaunchGateReceipt = JSON.parse(fs.readFileSync(vai642LaunchGateReceiptPath, 'utf8'));
const vai644LaunchGateReceipt = JSON.parse(fs.readFileSync(vai644LaunchGateReceiptPath, 'utf8'));
const vai647LaunchGateReceipt = JSON.parse(fs.readFileSync(vai647LaunchGateReceiptPath, 'utf8'));
const vai649LaunchGateReceipt = JSON.parse(fs.readFileSync(vai649LaunchGateReceiptPath, 'utf8'));
const vai651LaunchGateReceipt = JSON.parse(fs.readFileSync(vai651LaunchGateReceiptPath, 'utf8'));
const vai653LaunchGateReceipt = JSON.parse(fs.readFileSync(vai653LaunchGateReceiptPath, 'utf8'));
const vai655LaunchGateReceipt = JSON.parse(fs.readFileSync(vai655LaunchGateReceiptPath, 'utf8'));
const vai657LaunchGateReceipt = JSON.parse(fs.readFileSync(vai657LaunchGateReceiptPath, 'utf8'));
const vai659LaunchGateReceipt = JSON.parse(fs.readFileSync(vai659LaunchGateReceiptPath, 'utf8'));
const vai634LaunchGateReceipt = JSON.parse(fs.readFileSync(vai634LaunchGateReceiptPath, 'utf8'));
const vai637LaunchGateReceipt = JSON.parse(fs.readFileSync(vai637LaunchGateReceiptPath, 'utf8'));
const vai631LaunchGateReceipt = JSON.parse(fs.readFileSync(vai631LaunchGateReceiptPath, 'utf8'));
const vai573LaunchGateReceipt = JSON.parse(fs.readFileSync(vai573LaunchGateReceiptPath, 'utf8'));
const vai576LaunchGateReceipt = JSON.parse(fs.readFileSync(vai576LaunchGateReceiptPath, 'utf8'));
const vai579LaunchGateReceipt = JSON.parse(fs.readFileSync(vai579LaunchGateReceiptPath, 'utf8'));
const vai582LaunchGateReceipt = JSON.parse(fs.readFileSync(vai582LaunchGateReceiptPath, 'utf8'));
const vai585LaunchGateReceipt = JSON.parse(fs.readFileSync(vai585LaunchGateReceiptPath, 'utf8'));
const vai588LaunchGateReceipt = JSON.parse(fs.readFileSync(vai588LaunchGateReceiptPath, 'utf8'));
const vai592LaunchGateReceipt = JSON.parse(fs.readFileSync(vai592LaunchGateReceiptPath, 'utf8'));
const liveCatalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
assert(JSON.stringify(catalog) === JSON.stringify(liveCatalog), 'Swissknife fixture does not match the Hallucinate App dashboard catalog');
assert(catalog.validation_task_id === 'VAI-512', 'Catalog validation task id must be VAI-512');
assert(catalog.dashboard_only_mocks === false, 'Catalog must reject dashboard-only mocks');
assert(
  JSON.stringify(catalog.launch_objective_ids) === JSON.stringify(['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728']),
  'Catalog launch objective lineage must include VAIOS-G724 and VAIOS-G728',
);
assert(catalog.launch_validation_gate?.task_id === 'MGW-533', 'Catalog launch validation gate must name MGW-533');
assert(catalog.launch_validation_gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gate must name VAIOS-G724');
assert(catalog.launch_validation_gate?.evidence_term === 'launch Playwright validation gate', 'Catalog launch validation gate evidence term mismatch');
const mgw547Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-547');
assert(mgw547Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-547 for VAIOS-G723');
assert(
  mgw547Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md',
  'MGW-547 launch gate must point at the current supervisor gap receipt',
);
assert(mgw547Gate?.attempt === 11, 'MGW-547 launch gate must expose the active attempt receipt');
assert(
  JSON.stringify(mgw547Gate?.attempt_receipts) === JSON.stringify([
    'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-547-attempt-11-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-06-28-mgw-547-attempt-11-launch-playwright-validation-gate.md',
  ]),
  'MGW-547 launch gate must point at the current attempt-11 launch receipts',
);
const mgw550Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-550');
assert(mgw550Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include MGW-550 for VAIOS-G724');
assert(
  mgw550Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md',
  'MGW-550 launch gate must point at the current supervisor gap receipt',
);
const vai529Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-529');
assert(vai529Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-529 for VAIOS-G724');
assert(
  vai529Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md',
  'VAI-529 launch gate must point at the current supervisor gap receipt',
);
const hao718Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-718');
assert(hao718Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-718 for VAIOS-G724');
assert(
  hao718Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-718-objective-gap-3e00ad2a0074.md',
  'HAO-718 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao718Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-718-mcp-dashboard-launch-gate.md',
  'HAO-718 launch gate must point at the current launch gate receipt',
);
const hao720Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-720');
assert(hao720Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-720 for VAIOS-G724');
assert(
  hao720Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-objective-gap-3e00ad2a0074.md',
  'HAO-720 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao720Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-mcp-dashboard-launch-gate.md',
  'HAO-720 launch gate must point at the current launch gate receipt',
);
const hao724Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-724');
assert(hao724Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-724 for VAIOS-G724');
assert(
  hao724Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
  'HAO-724 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao724Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
  'HAO-724 launch gate must point at the current launch gate receipt',
);
const hao742Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-742');
assert(hao742Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-742 for VAIOS-G724');
assert(
  JSON.stringify(hao742Gate?.packet_goal_ids || []) === JSON.stringify(['VAIOS-G724', 'VAIOS-G728']),
  'HAO-742 launch gate must preserve VAIOS-G724/VAIOS-G728 packet goals',
);
assert(
  hao742Gate?.packet_sibling_task_id === 'HAO-743' && hao742Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'HAO-742 launch gate must preserve the HAO-743/VAIOS-G728 packet sibling',
);
assert(
  hao742Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-742-objective-gap-3e00ad2a0074.md',
  'HAO-742 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao742Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-742-mcp-dashboard-launch-gate.md',
  'HAO-742 launch gate must point at the current launch gate receipt',
);
const hao744Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-744');
assert(hao744Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-744 for VAIOS-G724');
assert(
  JSON.stringify(hao744Gate?.packet_goal_ids || []) === JSON.stringify(['VAIOS-G724', 'VAIOS-G728']),
  'HAO-744 launch gate must preserve VAIOS-G724/VAIOS-G728 packet goals',
);
assert(
  hao744Gate?.packet_sibling_task_id === 'HAO-745' && hao744Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'HAO-744 launch gate must preserve the HAO-745/VAIOS-G728 packet sibling',
);
assert(
  hao744Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-744-objective-gap-3e00ad2a0074.md',
  'HAO-744 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao744Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-744-mcp-dashboard-launch-gate.md',
  'HAO-744 launch gate must point at the current launch gate receipt',
);
const vai535Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-535');
assert(vai535Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-535 for VAIOS-G724');
assert(
  vai535Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md',
  'VAI-535 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai535Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-535-mcp-dashboard-launch-gate.md',
  'VAI-535 launch gate must point at the current launch gate receipt',
);
const vai537Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-537');
assert(vai537Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-537 for VAIOS-G724');
assert(
  vai537Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md',
  'VAI-537 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai537Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-537-mcp-dashboard-launch-gate.md',
  'VAI-537 launch gate must point at the current launch gate receipt',
);
const vai539Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-539');
assert(vai539Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-539 for VAIOS-G724');
assert(
  vai539Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-539-objective-gap-3e00ad2a0074.md',
  'VAI-539 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai539Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-539-mcp-dashboard-launch-gate.md',
  'VAI-539 launch gate must point at the current launch gate receipt',
);
const vai548Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-548');
assert(vai548Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-548 for VAIOS-G724');
assert(
  vai548Gate?.source_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-548-objective-gap-3e00ad2a0074.md',
  'VAI-548 launch gate must point at the current source gap receipt',
);
assert(
  vai548Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-548-mcp-dashboard-launch-gate.md',
  'VAI-548 launch gate must point at the current launch gate receipt',
);
assert(
  vai548Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-548-mcp-dashboard-launch-gate.json',
  'VAI-548 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai548Gate?.required_evidence || []) === JSON.stringify(vai548LaunchGateReceipt.required_evidence),
  'VAI-548 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai548Gate?.dashboard_servers || []) === JSON.stringify(vai548LaunchGateReceipt.dashboard_servers),
  'VAI-548 launch gate must preserve all dashboard server handoff records',
);
const vai542Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-542');
assert(vai542Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-542 for VAIOS-G723');
assert(
  vai542Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-542-objective-gap-7ea369464239.md',
  'VAI-542 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai542Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-542-mcp-dashboard-launch-gate.md',
  'VAI-542 launch gate must point at the current launch gate receipt',
);
assert(
  vai542Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
  'VAI-542 launch gate must point at the HAO-724 Hallucinate receipt',
);
assert(
  vai542Gate?.hallucinate_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
  'VAI-542 launch gate must point at the HAO-724 Hallucinate gap receipt',
);
assert(
  JSON.stringify(vai542Gate?.child_goals || []) === JSON.stringify([
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks',
  ]),
  'VAI-542 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai542Gate?.follow_up_subtasks || []) === JSON.stringify(['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']),
  'VAI-542 launch gate must preserve supervisor-generated follow-up subtasks',
);
const vai543Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-543');
assert(vai543Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-543 for VAIOS-G723');
assert(
  vai543Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-543-objective-gap-7ea369464239.md',
  'VAI-543 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai543Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
  'VAI-543 launch gate must point at the current launch gate receipt',
);
assert(
  vai543Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
  'VAI-543 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  JSON.stringify(vai543Gate?.child_goals || []) === JSON.stringify([
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks',
  ]),
  'VAI-543 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai543Gate?.follow_up_subtasks || []) === JSON.stringify(['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']),
  'VAI-543 launch gate must preserve supervisor-generated follow-up subtasks',
);
const hao727Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-727');
assert(hao727Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include HAO-727 for VAIOS-G723');
assert(
  hao727Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
  'HAO-727 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao727Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
  'HAO-727 launch gate must point at the current launch gate receipt',
);
assert(
  hao727Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/hao-727-mcp-dashboard-launch-gate.json',
  'HAO-727 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(hao727Gate?.child_goals || []) === JSON.stringify(hao727LaunchGateReceipt.child_goals),
  'HAO-727 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(hao727Gate?.follow_up_subtasks || []) === JSON.stringify(hao727LaunchGateReceipt.follow_up_subtasks),
  'HAO-727 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(hao727Gate?.required_evidence || []) === JSON.stringify(hao727LaunchGateReceipt.required_evidence),
  'HAO-727 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  hao727Gate?.attempt === 5,
  'HAO-727 launch gate must expose the attempt-5 validation receipt for Swissknife consumers',
);
assert(
  JSON.stringify(hao727Gate?.attempt_receipts || []) === JSON.stringify([
    'data/hallucinate_multimodal_control/discovery/2026-06-30-hao-727-attempt-5-validation.md',
  ]),
  'HAO-727 launch gate must point at the attempt-5 validation receipt',
);
const mgw555Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-555');
assert(mgw555Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include MGW-555 for VAIOS-G724');
assert(
  mgw555Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md',
  'MGW-555 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw555Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-launch-playwright-validation-gate.md',
  'MGW-555 launch gate must point at the current launch gate receipt',
);
assert(
  mgw555Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'MGW-555 launch gate must be closed by the Hallucinate App Playwright validation gate',
);
assert(
  JSON.stringify(mgw555Gate?.validation_commands || []) === JSON.stringify([
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
  ]),
  'MGW-555 launch gate must preserve the shared packet validation commands',
);
assert(
  mgw555Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'MGW-555 launch gate must stay aligned with the VAIOS-G728 packet sibling',
);
const mgw559Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-559');
assert(mgw559Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-559 for VAIOS-G723');
assert(
  mgw559Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-objective-gap-7ea369464239.md',
  'MGW-559 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw559Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-launch-playwright-validation-gate.md',
  'MGW-559 launch gate must point at the current launch gate receipt',
);
assert(
  mgw559Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-559-mcp-dashboard-launch-gate.md',
  'MGW-559 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  mgw559Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-559-mcp-dashboard-launch-gate.json',
  'MGW-559 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(mgw559Gate?.child_goals || []) === JSON.stringify(mgw559LaunchGateReceipt.child_goals),
  'MGW-559 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(mgw559Gate?.follow_up_subtasks || []) === JSON.stringify(mgw559LaunchGateReceipt.follow_up_subtasks),
  'MGW-559 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(mgw559Gate?.required_evidence || []) === JSON.stringify(mgw559LaunchGateReceipt.required_evidence),
  'MGW-559 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
const mgw561Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-561');
assert(mgw561Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-561 for VAIOS-G723');
assert(
  mgw561Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-objective-gap-7ea369464239.md',
  'MGW-561 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw561Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-launch-playwright-validation-gate.md',
  'MGW-561 launch gate must point at the current launch gate receipt',
);
assert(
  mgw561Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-561-mcp-dashboard-launch-gate.md',
  'MGW-561 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  mgw561Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-561-mcp-dashboard-launch-gate.json',
  'MGW-561 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(mgw561Gate?.child_goals || []) === JSON.stringify(mgw561LaunchGateReceipt.child_goals),
  'MGW-561 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(mgw561Gate?.follow_up_subtasks || []) === JSON.stringify(mgw561LaunchGateReceipt.follow_up_subtasks),
  'MGW-561 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(mgw561Gate?.required_evidence || []) === JSON.stringify(mgw561LaunchGateReceipt.required_evidence),
  'MGW-561 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
const mgw562Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-562');
assert(mgw562Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-562 for VAIOS-G723');
assert(
  mgw562Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-objective-gap-7ea369464239.md',
  'MGW-562 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw562Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-launch-playwright-validation-gate.md',
  'MGW-562 launch gate must point at the current launch gate receipt',
);
assert(
  mgw562Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-562-mcp-dashboard-launch-gate.md',
  'MGW-562 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  mgw562Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-562-mcp-dashboard-launch-gate.json',
  'MGW-562 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(mgw562Gate?.child_goals || []) === JSON.stringify(mgw562LaunchGateReceipt.child_goals),
  'MGW-562 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(mgw562Gate?.follow_up_subtasks || []) === JSON.stringify(mgw562LaunchGateReceipt.follow_up_subtasks),
  'MGW-562 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(mgw562Gate?.required_evidence || []) === JSON.stringify(mgw562LaunchGateReceipt.required_evidence),
  'MGW-562 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
const mgw563Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-563');
assert(mgw563Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-563 for VAIOS-G723');
assert(
  mgw563Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-objective-gap-7ea369464239.md',
  'MGW-563 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw563Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-launch-playwright-validation-gate.md',
  'MGW-563 launch gate must point at the current launch gate receipt',
);
assert(
  mgw563Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-01-mgw-563-mcp-dashboard-launch-gate.md',
  'MGW-563 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  mgw563Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-563-mcp-dashboard-launch-gate.json',
  'MGW-563 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(mgw563Gate?.child_goals || []) === JSON.stringify(mgw563LaunchGateReceipt.child_goals),
  'MGW-563 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(mgw563Gate?.follow_up_subtasks || []) === JSON.stringify(mgw563LaunchGateReceipt.follow_up_subtasks),
  'MGW-563 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(mgw563Gate?.required_evidence || []) === JSON.stringify(mgw563LaunchGateReceipt.required_evidence),
  'MGW-563 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  mgw563Gate?.attempt === 3,
  'MGW-563 launch gate must expose the attempt-3 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(mgw563Gate?.attempt_receipts || []) === JSON.stringify([
    'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-563-attempt-3-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-563-attempt-3-validation.md',
  ]),
  'MGW-563 launch gate must point at the attempt-3 validation receipts',
);
const mgw564Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-564');
assert(mgw564Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include MGW-564 for VAIOS-G724');
assert(
  mgw564Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-564-objective-gap-3e00ad2a0074.md',
  'MGW-564 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw564Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-564-launch-playwright-validation-gate.md',
  'MGW-564 launch gate must point at the current launch gate receipt',
);
assert(
  mgw564Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-564-mcp-dashboard-launch-gate.json',
  'MGW-564 launch gate must point at the Playwright fixture',
);
assert(
  mgw564Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'MGW-564 launch gate must be closed by the Hallucinate App Playwright validation gate',
);
assert(
  JSON.stringify(mgw564Gate?.packet_goal_ids || []) === JSON.stringify(['VAIOS-G724', 'VAIOS-G728']),
  'MGW-564 launch gate must preserve VAIOS-G724/VAIOS-G728 packet goals',
);
assert(
  JSON.stringify(mgw564Gate?.validation_commands || []) === JSON.stringify(mgw564LaunchGateReceipt.validation_commands),
  'MGW-564 launch gate must preserve the shared packet validation commands',
);
const vai564Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-564');
assert(vai564Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-564 for VAIOS-G724');
assert(
  vai564Gate?.source_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-03-vai-564-objective-gap-3e00ad2a0074.md',
  'VAI-564 launch gate must point at the current source gap receipt',
);
assert(
  vai564Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-03-vai-564-mcp-dashboard-launch-gate.md',
  'VAI-564 launch gate must point at the current launch gate receipt',
);
assert(
  vai564Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-564-mcp-dashboard-launch-gate.json',
  'VAI-564 launch gate must point at the Playwright fixture',
);
assert(
  vai564Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-564 launch gate must be closed by the Hallucinate App Playwright validation gate',
);
assert(
  JSON.stringify(vai564Gate?.packet_goal_ids || []) === JSON.stringify(['VAIOS-G724', 'VAIOS-G728']),
  'VAI-564 launch gate must preserve VAIOS-G724/VAIOS-G728 packet goals',
);
assert(
  JSON.stringify(vai564Gate?.validation_commands || []) === JSON.stringify(vai564LaunchGateReceipt.validation_commands),
  'VAI-564 launch gate must preserve the shared packet validation commands',
);
assert(
  JSON.stringify(vai564Gate?.dashboard_servers || []) === JSON.stringify(vai564LaunchGateReceipt.dashboard_servers),
  'VAI-564 launch gate must preserve all dashboard server handoff records',
);
const vai567Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-567');
assert(vai567Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-567 for VAIOS-G724');
assert(
  vai567Gate?.source_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-567-objective-gap-3e00ad2a0074.md',
  'VAI-567 launch gate must point at the current source gap receipt',
);
assert(
  vai567Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-567-mcp-dashboard-launch-gate.md',
  'VAI-567 launch gate must point at the current launch gate receipt',
);
assert(
  vai567Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-567-mcp-dashboard-launch-gate.json',
  'VAI-567 launch gate must point at the Playwright fixture',
);
assert(
  vai567Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-567 launch gate must be closed by the Hallucinate App Playwright validation gate',
);
assert(
  JSON.stringify(vai567Gate?.packet_goal_ids || []) === JSON.stringify(['VAIOS-G724', 'VAIOS-G728']),
  'VAI-567 launch gate must preserve VAIOS-G724/VAIOS-G728 packet goals',
);
assert(
  JSON.stringify(vai567Gate?.validation_commands || []) === JSON.stringify(vai567LaunchGateReceipt.validation_commands),
  'VAI-567 launch gate must preserve the shared packet validation commands',
);
assert(
  JSON.stringify(vai567Gate?.dashboard_servers || []) === JSON.stringify(vai567LaunchGateReceipt.dashboard_servers),
  'VAI-567 launch gate must preserve all dashboard server handoff records',
);
const mgw566Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-566');
assert(mgw566Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-566 for VAIOS-G723');
assert(
  mgw566Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-objective-gap-7ea369464239.md',
  'MGW-566 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw566Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-launch-playwright-validation-gate.md',
  'MGW-566 launch gate must point at the current launch gate receipt',
);
assert(
  mgw566Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-566-mcp-dashboard-launch-gate.md',
  'MGW-566 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  mgw566Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-566-mcp-dashboard-launch-gate.json',
  'MGW-566 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(mgw566Gate?.child_goals || []) === JSON.stringify(mgw566LaunchGateReceipt.child_goals),
  'MGW-566 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(mgw566Gate?.follow_up_subtasks || []) === JSON.stringify(mgw566LaunchGateReceipt.follow_up_subtasks),
  'MGW-566 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(mgw566Gate?.required_evidence || []) === JSON.stringify(mgw566LaunchGateReceipt.required_evidence),
  'MGW-566 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  mgw566Gate?.attempt === 2,
  'MGW-566 launch gate must expose the attempt-2 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(mgw566Gate?.attempt_receipts || []) === JSON.stringify([
    'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-566-attempt-2-validation.md',
  ]),
  'MGW-566 launch gate must point at the attempt-2 validation receipts',
);
const vai566Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-566');
assert(vai566Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-566 for VAIOS-G723');
assert(
  vai566Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-03-vai-566-objective-gap-7ea369464239.md',
  'VAI-566 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai566Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-03-vai-566-mcp-dashboard-launch-gate.md',
  'VAI-566 launch gate must point at the current launch gate receipt',
);
assert(
  vai566Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-03-vai-566-mcp-dashboard-launch-gate.md',
  'VAI-566 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai566Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-566-mcp-dashboard-launch-gate.json',
  'VAI-566 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai566Gate?.child_goals || []) === JSON.stringify(vai566LaunchGateReceipt.child_goals),
  'VAI-566 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai566Gate?.follow_up_subtasks || []) === JSON.stringify(vai566LaunchGateReceipt.follow_up_subtasks),
  'VAI-566 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai566Gate?.required_evidence || []) === JSON.stringify(vai566LaunchGateReceipt.required_evidence),
  'VAI-566 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai566Gate?.attempt === 2,
  'VAI-566 launch gate must expose the attempt-2 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai566Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-03-vai-566-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-03-vai-566-attempt-2-validation.md',
  ]),
  'VAI-566 launch gate must point at the attempt-2 validation receipts',
);
const vai569Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-569');
assert(vai569Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-569 for VAIOS-G723');
assert(
  vai569Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-569-objective-gap-7ea369464239.md',
  'VAI-569 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai569Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-569-mcp-dashboard-launch-gate.md',
  'VAI-569 launch gate must point at the current launch gate receipt',
);
assert(
  vai569Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-569-mcp-dashboard-launch-gate.md',
  'VAI-569 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai569Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-569-mcp-dashboard-launch-gate.json',
  'VAI-569 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai569Gate?.child_goals || []) === JSON.stringify(vai569LaunchGateReceipt.child_goals),
  'VAI-569 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai569Gate?.follow_up_subtasks || []) === JSON.stringify(vai569LaunchGateReceipt.follow_up_subtasks),
  'VAI-569 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai569Gate?.required_evidence || []) === JSON.stringify(vai569LaunchGateReceipt.required_evidence),
  'VAI-569 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai569Gate?.attempt === 1,
  'VAI-569 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai569Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-569-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-569-attempt-1-validation.md',
  ]),
  'VAI-569 launch gate must point at the attempt-1 validation receipts',
);
const vai572Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-572');
assert(vai572Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-572 for VAIOS-G723');
assert(
  vai572Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-572-objective-gap-7ea369464239.md',
  'VAI-572 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai572Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-572-mcp-dashboard-launch-gate.md',
  'VAI-572 launch gate must point at the current launch gate receipt',
);
assert(
  vai572Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-572-mcp-dashboard-launch-gate.md',
  'VAI-572 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai572Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-572-mcp-dashboard-launch-gate.json',
  'VAI-572 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai572Gate?.child_goals || []) === JSON.stringify(vai572LaunchGateReceipt.child_goals),
  'VAI-572 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai572Gate?.follow_up_subtasks || []) === JSON.stringify(vai572LaunchGateReceipt.follow_up_subtasks),
  'VAI-572 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai572Gate?.required_evidence || []) === JSON.stringify(vai572LaunchGateReceipt.required_evidence),
  'VAI-572 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai572Gate?.attempt === 1,
  'VAI-572 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai572Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-572-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-572-attempt-1-validation.md',
  ]),
  'VAI-572 launch gate must point at the attempt-1 validation receipts',
);
const vai575Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-575');
assert(vai575Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-575 for VAIOS-G723');
assert(
  vai575Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-575-objective-gap-7ea369464239.md',
  'VAI-575 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai575Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-575-mcp-dashboard-launch-gate.md',
  'VAI-575 launch gate must point at the current launch gate receipt',
);
assert(
  vai575Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-575-mcp-dashboard-launch-gate.md',
  'VAI-575 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai575Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-575-mcp-dashboard-launch-gate.json',
  'VAI-575 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai575Gate?.child_goals || []) === JSON.stringify(vai575LaunchGateReceipt.child_goals),
  'VAI-575 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai575Gate?.follow_up_subtasks || []) === JSON.stringify(vai575LaunchGateReceipt.follow_up_subtasks),
  'VAI-575 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai575Gate?.required_evidence || []) === JSON.stringify(vai575LaunchGateReceipt.required_evidence),
  'VAI-575 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai575Gate?.attempt === 1,
  'VAI-575 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai575Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-575-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-575-attempt-1-validation.md',
  ]),
  'VAI-575 launch gate must point at the attempt-1 validation receipts',
);
const vai578Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-578');
assert(vai578Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-578 for VAIOS-G723');
assert(
  vai578Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-578-objective-gap-7ea369464239.md',
  'VAI-578 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai578Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-578-mcp-dashboard-launch-gate.md',
  'VAI-578 launch gate must point at the current launch gate receipt',
);
assert(
  vai578Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-578-mcp-dashboard-launch-gate.md',
  'VAI-578 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai578Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-578-mcp-dashboard-launch-gate.json',
  'VAI-578 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai578Gate?.child_goals || []) === JSON.stringify(vai578LaunchGateReceipt.child_goals),
  'VAI-578 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai578Gate?.follow_up_subtasks || []) === JSON.stringify(vai578LaunchGateReceipt.follow_up_subtasks),
  'VAI-578 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai578Gate?.required_evidence || []) === JSON.stringify(vai578LaunchGateReceipt.required_evidence),
  'VAI-578 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai578Gate?.attempt === 1,
  'VAI-578 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai578Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-578-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-578-attempt-1-validation.md',
  ]),
  'VAI-578 launch gate must point at the attempt-1 validation receipts',
);
const vai581Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-581');
assert(vai581Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-581 for VAIOS-G723');
assert(
  vai581Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-581-objective-gap-7ea369464239.md',
  'VAI-581 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai581Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-581-mcp-dashboard-launch-gate.md',
  'VAI-581 launch gate must point at the current launch gate receipt',
);
assert(
  vai581Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-581-mcp-dashboard-launch-gate.md',
  'VAI-581 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai581Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-581-mcp-dashboard-launch-gate.json',
  'VAI-581 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai581Gate?.child_goals || []) === JSON.stringify(vai581LaunchGateReceipt.child_goals),
  'VAI-581 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai581Gate?.follow_up_subtasks || []) === JSON.stringify(vai581LaunchGateReceipt.follow_up_subtasks),
  'VAI-581 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai581Gate?.required_evidence || []) === JSON.stringify(vai581LaunchGateReceipt.required_evidence),
  'VAI-581 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai581Gate?.attempt === 1,
  'VAI-581 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai581Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-581-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-581-attempt-1-validation.md',
  ]),
  'VAI-581 launch gate must point at the attempt-1 validation receipts',
);
const vai584Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-584');
assert(vai584Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-584 for VAIOS-G723');
assert(
  vai584Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-584-objective-gap-7ea369464239.md',
  'VAI-584 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai584Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-584-mcp-dashboard-launch-gate.md',
  'VAI-584 launch gate must point at the current launch gate receipt',
);
assert(
  vai584Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-584-mcp-dashboard-launch-gate.md',
  'VAI-584 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai584Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-584-mcp-dashboard-launch-gate.json',
  'VAI-584 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai584Gate?.child_goals || []) === JSON.stringify(vai584LaunchGateReceipt.child_goals),
  'VAI-584 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai584Gate?.follow_up_subtasks || []) === JSON.stringify(vai584LaunchGateReceipt.follow_up_subtasks),
  'VAI-584 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai584Gate?.required_evidence || []) === JSON.stringify(vai584LaunchGateReceipt.required_evidence),
  'VAI-584 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai584Gate?.attempt === 1,
  'VAI-584 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai584Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-584-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-584-attempt-1-validation.md',
  ]),
  'VAI-584 launch gate must point at the attempt-1 validation receipts',
);
const vai587Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-587');
assert(vai587Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-587 for VAIOS-G723');
assert(
  vai587Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-587-objective-gap-7ea369464239.md',
  'VAI-587 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai587Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-587-mcp-dashboard-launch-gate.md',
  'VAI-587 launch gate must point at the current launch gate receipt',
);
assert(
  vai587Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-587-mcp-dashboard-launch-gate.md',
  'VAI-587 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai587Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-587-mcp-dashboard-launch-gate.json',
  'VAI-587 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai587Gate?.child_goals || []) === JSON.stringify(vai587LaunchGateReceipt.child_goals),
  'VAI-587 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai587Gate?.follow_up_subtasks || []) === JSON.stringify(vai587LaunchGateReceipt.follow_up_subtasks),
  'VAI-587 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai587Gate?.required_evidence || []) === JSON.stringify(vai587LaunchGateReceipt.required_evidence),
  'VAI-587 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai587Gate?.attempt === 1,
  'VAI-587 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai587Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-587-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-587-attempt-1-validation.md',
  ]),
  'VAI-587 launch gate must point at the attempt-1 validation receipts',
);
const vai590Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-590');
assert(vai590Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-590 for VAIOS-G723');
assert(
  vai590Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-590-objective-gap-7ea369464239.md',
  'VAI-590 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai590Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-590-mcp-dashboard-launch-gate.md',
  'VAI-590 launch gate must point at the current launch gate receipt',
);
assert(
  vai590Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-590-mcp-dashboard-launch-gate.md',
  'VAI-590 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai590Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-590-mcp-dashboard-launch-gate.json',
  'VAI-590 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai590Gate?.child_goals || []) === JSON.stringify(vai590LaunchGateReceipt.child_goals),
  'VAI-590 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai590Gate?.follow_up_subtasks || []) === JSON.stringify(vai590LaunchGateReceipt.follow_up_subtasks),
  'VAI-590 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai590Gate?.required_evidence || []) === JSON.stringify(vai590LaunchGateReceipt.required_evidence),
  'VAI-590 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai590Gate?.attempt === 1,
  'VAI-590 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai590Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-590-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-590-attempt-1-validation.md',
  ]),
  'VAI-590 launch gate must point at the attempt-1 validation receipts',
);
const vai591Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-591');
assert(vai591Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-591 for VAIOS-G723');
assert(
  vai591Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-591-objective-gap-7ea369464239.md',
  'VAI-591 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai591Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-591-mcp-dashboard-launch-gate.md',
  'VAI-591 launch gate must point at the current launch gate receipt',
);
assert(
  vai591Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-591-mcp-dashboard-launch-gate.md',
  'VAI-591 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai591Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-591-mcp-dashboard-launch-gate.json',
  'VAI-591 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai591Gate?.child_goals || []) === JSON.stringify(vai591LaunchGateReceipt.child_goals),
  'VAI-591 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai591Gate?.follow_up_subtasks || []) === JSON.stringify(vai591LaunchGateReceipt.follow_up_subtasks),
  'VAI-591 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai591Gate?.required_evidence || []) === JSON.stringify(vai591LaunchGateReceipt.required_evidence),
  'VAI-591 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai591Gate?.attempt === 1,
  'VAI-591 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai591Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-591-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-591-attempt-1-validation.md',
  ]),
  'VAI-591 launch gate must point at the attempt-1 validation receipts',
);
const vai594Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-594');
assert(vai594Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-594 for VAIOS-G723');
assert(
  vai594Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-594-objective-gap-7ea369464239.md',
  'VAI-594 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai594Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-594-mcp-dashboard-launch-gate.md',
  'VAI-594 launch gate must point at the current launch gate receipt',
);
assert(
  vai594Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-594-mcp-dashboard-launch-gate.md',
  'VAI-594 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai594Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-594-mcp-dashboard-launch-gate.json',
  'VAI-594 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai594Gate?.child_goals || []) === JSON.stringify(vai594LaunchGateReceipt.child_goals),
  'VAI-594 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai594Gate?.follow_up_subtasks || []) === JSON.stringify(vai594LaunchGateReceipt.follow_up_subtasks),
  'VAI-594 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai594Gate?.required_evidence || []) === JSON.stringify(vai594LaunchGateReceipt.required_evidence),
  'VAI-594 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai594Gate?.attempt === 1,
  'VAI-594 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai594Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-594-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-594-attempt-1-validation.md',
  ]),
  'VAI-594 launch gate must point at the attempt-1 validation receipts',
);
const vai597Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-597');
assert(vai597Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-597 for VAIOS-G723');
assert(
  vai597Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-597-objective-gap-7ea369464239.md',
  'VAI-597 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai597Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-597-mcp-dashboard-launch-gate.md',
  'VAI-597 launch gate must point at the current launch gate receipt',
);
assert(
  vai597Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-597-mcp-dashboard-launch-gate.md',
  'VAI-597 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai597Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-597-mcp-dashboard-launch-gate.json',
  'VAI-597 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai597Gate?.child_goals || []) === JSON.stringify(vai597LaunchGateReceipt.child_goals),
  'VAI-597 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai597Gate?.follow_up_subtasks || []) === JSON.stringify(vai597LaunchGateReceipt.follow_up_subtasks),
  'VAI-597 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai597Gate?.required_evidence || []) === JSON.stringify(vai597LaunchGateReceipt.required_evidence),
  'VAI-597 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai597Gate?.attempt === 2,
  'VAI-597 launch gate must expose the attempt-2 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai597Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-597-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-597-attempt-2-validation.md',
  ]),
  'VAI-597 launch gate must point at the attempt-2 validation receipts',
);
const vai600Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-600');
assert(vai600Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-600 for VAIOS-G723');
assert(
  vai600Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-600-objective-gap-7ea369464239.md',
  'VAI-600 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai600Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-600-mcp-dashboard-launch-gate.md',
  'VAI-600 launch gate must point at the current launch gate receipt',
);
assert(
  vai600Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-600-mcp-dashboard-launch-gate.md',
  'VAI-600 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai600Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-600-mcp-dashboard-launch-gate.json',
  'VAI-600 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai600Gate?.child_goals || []) === JSON.stringify(vai600LaunchGateReceipt.child_goals),
  'VAI-600 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai600Gate?.follow_up_subtasks || []) === JSON.stringify(vai600LaunchGateReceipt.follow_up_subtasks),
  'VAI-600 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai600Gate?.required_evidence || []) === JSON.stringify(vai600LaunchGateReceipt.required_evidence),
  'VAI-600 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai600Gate?.attempt === 1,
  'VAI-600 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai600Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-600-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-600-attempt-1-validation.md',
  ]),
  'VAI-600 launch gate must point at the attempt-1 validation receipts',
);
const vai603Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-603');
assert(vai603Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-603 for VAIOS-G723');
assert(
  vai603Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-603-objective-gap-7ea369464239.md',
  'VAI-603 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai603Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-603-mcp-dashboard-launch-gate.md',
  'VAI-603 launch gate must point at the current launch gate receipt',
);
assert(
  vai603Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-603-mcp-dashboard-launch-gate.md',
  'VAI-603 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai603Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-603-mcp-dashboard-launch-gate.json',
  'VAI-603 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai603Gate?.child_goals || []) === JSON.stringify(vai603LaunchGateReceipt.child_goals),
  'VAI-603 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai603Gate?.follow_up_subtasks || []) === JSON.stringify(vai603LaunchGateReceipt.follow_up_subtasks),
  'VAI-603 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai603Gate?.required_evidence || []) === JSON.stringify(vai603LaunchGateReceipt.required_evidence),
  'VAI-603 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai603Gate?.attempt === 1,
  'VAI-603 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai603Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-603-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-603-attempt-1-validation.md',
  ]),
  'VAI-603 launch gate must point at the attempt-1 validation receipts',
);
const vai606Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-606');
assert(vai606Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-606 for VAIOS-G723');
assert(
  vai606Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-606-objective-gap-7ea369464239.md',
  'VAI-606 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai606Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-606-mcp-dashboard-launch-gate.md',
  'VAI-606 launch gate must point at the current launch gate receipt',
);
assert(
  vai606Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-606-mcp-dashboard-launch-gate.md',
  'VAI-606 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai606Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-606-mcp-dashboard-launch-gate.json',
  'VAI-606 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai606Gate?.child_goals || []) === JSON.stringify(vai606LaunchGateReceipt.child_goals),
  'VAI-606 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai606Gate?.follow_up_subtasks || []) === JSON.stringify(vai606LaunchGateReceipt.follow_up_subtasks),
  'VAI-606 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai606Gate?.required_evidence || []) === JSON.stringify(vai606LaunchGateReceipt.required_evidence),
  'VAI-606 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai606Gate?.attempt === 1,
  'VAI-606 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai606Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-606-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-606-attempt-1-validation.md',
  ]),
  'VAI-606 launch gate must point at the attempt-1 validation receipts',
);
const vai609Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-609');
assert(vai609Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-609 for VAIOS-G723');
assert(
  vai609Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-609-objective-gap-7ea369464239.md',
  'VAI-609 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai609Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-609-mcp-dashboard-launch-gate.md',
  'VAI-609 launch gate must point at the current launch gate receipt',
);
assert(
  vai609Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-609-mcp-dashboard-launch-gate.md',
  'VAI-609 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai609Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-609-mcp-dashboard-launch-gate.json',
  'VAI-609 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai609Gate?.child_goals || []) === JSON.stringify(vai609LaunchGateReceipt.child_goals),
  'VAI-609 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai609Gate?.follow_up_subtasks || []) === JSON.stringify(vai609LaunchGateReceipt.follow_up_subtasks),
  'VAI-609 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai609Gate?.required_evidence || []) === JSON.stringify(vai609LaunchGateReceipt.required_evidence),
  'VAI-609 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai609Gate?.attempt === 1,
  'VAI-609 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai609Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-609-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-609-attempt-1-validation.md',
  ]),
  'VAI-609 launch gate must point at the attempt-1 validation receipts',
);
const vai610Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-610');
assert(vai610Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-610 for VAIOS-G723');
assert(
  vai610Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-610-objective-gap-7ea369464239.md',
  'VAI-610 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai610Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-610-mcp-dashboard-launch-gate.md',
  'VAI-610 launch gate must point at the current launch gate receipt',
);
assert(
  vai610Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-610-mcp-dashboard-launch-gate.md',
  'VAI-610 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai610Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-610-mcp-dashboard-launch-gate.json',
  'VAI-610 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai610Gate?.child_goals || []) === JSON.stringify(vai610LaunchGateReceipt.child_goals),
  'VAI-610 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai610Gate?.follow_up_subtasks || []) === JSON.stringify(vai610LaunchGateReceipt.follow_up_subtasks),
  'VAI-610 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai610Gate?.required_evidence || []) === JSON.stringify(vai610LaunchGateReceipt.required_evidence),
  'VAI-610 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai610Gate?.attempt === 1,
  'VAI-610 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai610Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-610-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-610-attempt-1-validation.md',
  ]),
  'VAI-610 launch gate must point at the attempt-1 validation receipts',
);
const vai613Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-613');
assert(vai613Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-613 for VAIOS-G723');
assert(
  vai613Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-613-objective-gap-7ea369464239.md',
  'VAI-613 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai613Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-613-mcp-dashboard-launch-gate.md',
  'VAI-613 launch gate must point at the current launch gate receipt',
);
assert(
  vai613Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-613-mcp-dashboard-launch-gate.md',
  'VAI-613 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai613Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-613-mcp-dashboard-launch-gate.json',
  'VAI-613 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai613Gate?.child_goals || []) === JSON.stringify(vai613LaunchGateReceipt.child_goals),
  'VAI-613 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai613Gate?.follow_up_subtasks || []) === JSON.stringify(vai613LaunchGateReceipt.follow_up_subtasks),
  'VAI-613 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai613Gate?.required_evidence || []) === JSON.stringify(vai613LaunchGateReceipt.required_evidence),
  'VAI-613 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai613Gate?.attempt === 1,
  'VAI-613 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai613Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-613-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-613-attempt-1-validation.md',
  ]),
  'VAI-613 launch gate must point at the attempt-1 validation receipts',
);
const vai616Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-616');
assert(vai616Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-616 for VAIOS-G723');
assert(
  vai616Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-616-objective-gap-7ea369464239.md',
  'VAI-616 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai616Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-616-mcp-dashboard-launch-gate.md',
  'VAI-616 launch gate must point at the current launch gate receipt',
);
assert(
  vai616Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-616-mcp-dashboard-launch-gate.md',
  'VAI-616 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai616Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-616-mcp-dashboard-launch-gate.json',
  'VAI-616 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai616Gate?.child_goals || []) === JSON.stringify(vai616LaunchGateReceipt.child_goals),
  'VAI-616 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai616Gate?.follow_up_subtasks || []) === JSON.stringify(vai616LaunchGateReceipt.follow_up_subtasks),
  'VAI-616 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai616Gate?.required_evidence || []) === JSON.stringify(vai616LaunchGateReceipt.required_evidence),
  'VAI-616 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai616Gate?.attempt === 1,
  'VAI-616 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai616Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-616-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-616-attempt-1-validation.md',
  ]),
  'VAI-616 launch gate must point at the attempt-1 validation receipts',
);
const vai619Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-619');
assert(vai619Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-619 for VAIOS-G723');
assert(
  vai619Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-619-objective-gap-7ea369464239.md',
  'VAI-619 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai619Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-619-mcp-dashboard-launch-gate.md',
  'VAI-619 launch gate must point at the current launch gate receipt',
);
assert(
  vai619Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-619-mcp-dashboard-launch-gate.md',
  'VAI-619 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai619Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-619-mcp-dashboard-launch-gate.json',
  'VAI-619 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai619Gate?.child_goals || []) === JSON.stringify(vai619LaunchGateReceipt.child_goals),
  'VAI-619 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai619Gate?.follow_up_subtasks || []) === JSON.stringify(vai619LaunchGateReceipt.follow_up_subtasks),
  'VAI-619 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai619Gate?.required_evidence || []) === JSON.stringify(vai619LaunchGateReceipt.required_evidence),
  'VAI-619 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai619Gate?.attempt === 1,
  'VAI-619 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai619Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-619-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-619-attempt-1-validation.md',
  ]),
  'VAI-619 launch gate must point at the attempt-1 validation receipts',
);
const vai622Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-622');
assert(vai622Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-622 for VAIOS-G723');
assert(
  vai622Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-622-objective-gap-7ea369464239.md',
  'VAI-622 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai622Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-622-mcp-dashboard-launch-gate.md',
  'VAI-622 launch gate must point at the current launch gate receipt',
);
assert(
  vai622Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-622-mcp-dashboard-launch-gate.md',
  'VAI-622 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai622Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-622-mcp-dashboard-launch-gate.json',
  'VAI-622 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai622Gate?.child_goals || []) === JSON.stringify(vai622LaunchGateReceipt.child_goals),
  'VAI-622 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai622Gate?.follow_up_subtasks || []) === JSON.stringify(vai622LaunchGateReceipt.follow_up_subtasks),
  'VAI-622 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai622Gate?.required_evidence || []) === JSON.stringify(vai622LaunchGateReceipt.required_evidence),
  'VAI-622 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai622Gate?.attempt === 1,
  'VAI-622 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai622Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-622-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-622-attempt-1-validation.md',
  ]),
  'VAI-622 launch gate must point at the attempt-1 validation receipts',
);
const vai625Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-625');
assert(vai625Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-625 for VAIOS-G723');
assert(
  vai625Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-625-objective-gap-7ea369464239.md',
  'VAI-625 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai625Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-625-mcp-dashboard-launch-gate.md',
  'VAI-625 launch gate must point at the current launch gate receipt',
);
assert(
  vai625Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-625-mcp-dashboard-launch-gate.md',
  'VAI-625 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai625Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-625-mcp-dashboard-launch-gate.json',
  'VAI-625 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai625Gate?.child_goals || []) === JSON.stringify(vai625LaunchGateReceipt.child_goals),
  'VAI-625 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai625Gate?.follow_up_subtasks || []) === JSON.stringify(vai625LaunchGateReceipt.follow_up_subtasks),
  'VAI-625 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai625Gate?.required_evidence || []) === JSON.stringify(vai625LaunchGateReceipt.required_evidence),
  'VAI-625 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai625Gate?.attempt === 1,
  'VAI-625 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai625Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-625-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-625-attempt-1-validation.md',
  ]),
  'VAI-625 launch gate must point at the attempt-1 validation receipts',
);
const vai628Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-628');
assert(vai628Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-628 for VAIOS-G723');
assert(
  vai628Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-628-objective-gap-7ea369464239.md',
  'VAI-628 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai628Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-628-mcp-dashboard-launch-gate.md',
  'VAI-628 launch gate must point at the current launch gate receipt',
);
assert(
  vai628Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-628-mcp-dashboard-launch-gate.md',
  'VAI-628 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai628Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-628-mcp-dashboard-launch-gate.json',
  'VAI-628 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai628Gate?.child_goals || []) === JSON.stringify(vai628LaunchGateReceipt.child_goals),
  'VAI-628 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai628Gate?.follow_up_subtasks || []) === JSON.stringify(vai628LaunchGateReceipt.follow_up_subtasks),
  'VAI-628 launch gate must preserve supervisor-generated follow-up subtasks',
);
assert(
  JSON.stringify(vai628Gate?.required_evidence || []) === JSON.stringify(vai628LaunchGateReceipt.required_evidence),
  'VAI-628 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  vai628Gate?.attempt === 1,
  'VAI-628 launch gate must expose the attempt-1 validation receipts for Swissknife consumers',
);
assert(
  JSON.stringify(vai628Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-628-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-628-attempt-1-validation.md',
  ]),
  'VAI-628 launch gate must point at the attempt-1 validation receipts',
);
const vai573Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-573');
assert(vai573Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-573 for VAIOS-G724');
assert(
  vai573Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-573-objective-gap-3e00ad2a0074.md',
  'VAI-573 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai573Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-573-mcp-dashboard-launch-gate.md',
  'VAI-573 launch gate must point at the current launch gate receipt',
);
assert(
  vai573Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-573-mcp-dashboard-launch-gate.json',
  'VAI-573 launch gate must point at the Playwright fixture',
);
assert(
  vai573Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-573 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai573Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-573 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai573Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md',
  'VAI-573 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai573Gate?.required_evidence || []) === JSON.stringify(vai573LaunchGateReceipt.required_evidence),
  'VAI-573 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai576Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-576');
assert(vai576Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-576 for VAIOS-G724');
assert(
  vai576Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-576-objective-gap-3e00ad2a0074.md',
  'VAI-576 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai576Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-576-mcp-dashboard-launch-gate.md',
  'VAI-576 launch gate must point at the current launch gate receipt',
);
assert(
  vai576Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-576-mcp-dashboard-launch-gate.json',
  'VAI-576 launch gate must point at the Playwright fixture',
);
assert(
  vai576Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-576 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai576Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-576 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai576Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md',
  'VAI-576 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai576Gate?.required_evidence || []) === JSON.stringify(vai576LaunchGateReceipt.required_evidence),
  'VAI-576 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai579Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-579');
assert(vai579Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-579 for VAIOS-G724');
assert(
  vai579Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-579-objective-gap-3e00ad2a0074.md',
  'VAI-579 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai579Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-579-mcp-dashboard-launch-gate.md',
  'VAI-579 launch gate must point at the current launch gate receipt',
);
assert(
  vai579Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-579-mcp-dashboard-launch-gate.json',
  'VAI-579 launch gate must point at the Playwright fixture',
);
assert(
  vai579Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-579 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai579Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-579 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai579Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md',
  'VAI-579 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai579Gate?.required_evidence || []) === JSON.stringify(vai579LaunchGateReceipt.required_evidence),
  'VAI-579 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai582Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-582');
assert(vai582Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-582 for VAIOS-G724');
assert(
  vai582Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-582-objective-gap-3e00ad2a0074.md',
  'VAI-582 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai582Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-582-mcp-dashboard-launch-gate.md',
  'VAI-582 launch gate must point at the current launch gate receipt',
);
assert(
  vai582Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-582-mcp-dashboard-launch-gate.json',
  'VAI-582 launch gate must point at the Playwright fixture',
);
assert(
  vai582Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-582 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai582Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-582 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai582Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md',
  'VAI-582 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai582Gate?.required_evidence || []) === JSON.stringify(vai582LaunchGateReceipt.required_evidence),
  'VAI-582 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai585Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-585');
assert(vai585Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-585 for VAIOS-G724');
assert(
  vai585Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-585-objective-gap-3e00ad2a0074.md',
  'VAI-585 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai585Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-585-mcp-dashboard-launch-gate.md',
  'VAI-585 launch gate must point at the current launch gate receipt',
);
assert(
  vai585Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-585-mcp-dashboard-launch-gate.json',
  'VAI-585 launch gate must point at the Playwright fixture',
);
assert(
  vai585Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-585 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai585Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-585 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai585Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md',
  'VAI-585 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai585Gate?.required_evidence || []) === JSON.stringify(vai585LaunchGateReceipt.required_evidence),
  'VAI-585 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai588Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-588');
assert(vai588Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-588 for VAIOS-G724');
assert(
  vai588Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-588-objective-gap-3e00ad2a0074.md',
  'VAI-588 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai588Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-588-mcp-dashboard-launch-gate.md',
  'VAI-588 launch gate must point at the current launch gate receipt',
);
assert(
  vai588Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-588-mcp-dashboard-launch-gate.json',
  'VAI-588 launch gate must point at the Playwright fixture',
);
assert(
  vai588Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-588 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai588Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-588 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai588Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md',
  'VAI-588 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai588Gate?.required_evidence || []) === JSON.stringify(vai588LaunchGateReceipt.required_evidence),
  'VAI-588 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai592Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-592');
assert(vai592Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-592 for VAIOS-G724');
assert(
  vai592Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-592-objective-gap-3e00ad2a0074.md',
  'VAI-592 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai592Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-592-mcp-dashboard-launch-gate.md',
  'VAI-592 launch gate must point at the current launch gate receipt',
);
assert(
  vai592Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-592-mcp-dashboard-launch-gate.json',
  'VAI-592 launch gate must point at the Playwright fixture',
);
assert(
  vai592Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-592 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai592Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-592 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai592Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md',
  'VAI-592 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai592Gate?.required_evidence || []) === JSON.stringify(vai592LaunchGateReceipt.required_evidence),
  'VAI-592 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai595Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-595');
assert(vai595Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-595 for VAIOS-G724');
assert(
  vai595Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-595-objective-gap-3e00ad2a0074.md',
  'VAI-595 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai595Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-595-mcp-dashboard-launch-gate.md',
  'VAI-595 launch gate must point at the current launch gate receipt',
);
assert(
  vai595Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-595-mcp-dashboard-launch-gate.json',
  'VAI-595 launch gate must point at the Playwright fixture',
);
assert(
  vai595Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-595 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai595Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-595 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai595Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md',
  'VAI-595 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai595Gate?.required_evidence || []) === JSON.stringify(vai595LaunchGateReceipt.required_evidence),
  'VAI-595 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai598Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-598');
assert(vai598Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-598 for VAIOS-G724');
assert(
  vai598Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-598-objective-gap-3e00ad2a0074.md',
  'VAI-598 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai598Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-598-mcp-dashboard-launch-gate.md',
  'VAI-598 launch gate must point at the current launch gate receipt',
);
assert(
  vai598Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-598-mcp-dashboard-launch-gate.json',
  'VAI-598 launch gate must point at the Playwright fixture',
);
assert(
  vai598Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-598 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai598Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-598 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai598Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md',
  'VAI-598 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai598Gate?.required_evidence || []) === JSON.stringify(vai598LaunchGateReceipt.required_evidence),
  'VAI-598 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai601Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-601');
assert(vai601Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-601 for VAIOS-G724');
assert(
  vai601Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-601-objective-gap-3e00ad2a0074.md',
  'VAI-601 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai601Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-601-mcp-dashboard-launch-gate.md',
  'VAI-601 launch gate must point at the current launch gate receipt',
);
assert(
  vai601Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-601-mcp-dashboard-launch-gate.json',
  'VAI-601 launch gate must point at the Playwright fixture',
);
assert(
  vai601Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-601 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai601Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-601 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai601Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md',
  'VAI-601 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai601Gate?.required_evidence || []) === JSON.stringify(vai601LaunchGateReceipt.required_evidence),
  'VAI-601 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai604Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-604');
assert(vai604Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-604 for VAIOS-G724');
assert(
  vai604Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-604-objective-gap-3e00ad2a0074.md',
  'VAI-604 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai604Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-604-mcp-dashboard-launch-gate.md',
  'VAI-604 launch gate must point at the current launch gate receipt',
);
assert(
  vai604Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-604-mcp-dashboard-launch-gate.json',
  'VAI-604 launch gate must point at the Playwright fixture',
);
assert(
  vai604Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-604 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai604Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-604 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai604Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md',
  'VAI-604 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai604Gate?.required_evidence || []) === JSON.stringify(vai604LaunchGateReceipt.required_evidence),
  'VAI-604 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai607Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-607');
assert(vai607Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-607 for VAIOS-G724');
assert(
  vai607Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-607-objective-gap-3e00ad2a0074.md',
  'VAI-607 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai607Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-607-mcp-dashboard-launch-gate.md',
  'VAI-607 launch gate must point at the current launch gate receipt',
);
assert(
  vai607Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-607-mcp-dashboard-launch-gate.json',
  'VAI-607 launch gate must point at the Playwright fixture',
);
assert(
  vai607Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-607 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai607Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-607 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai607Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md',
  'VAI-607 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai607Gate?.required_evidence || []) === JSON.stringify(vai607LaunchGateReceipt.required_evidence),
  'VAI-607 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai611Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-611');
assert(vai611Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-611 for VAIOS-G724');
assert(
  vai611Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-611-objective-gap-3e00ad2a0074.md',
  'VAI-611 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai611Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-611-mcp-dashboard-launch-gate.md',
  'VAI-611 launch gate must point at the current launch gate receipt',
);
assert(
  vai611Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-611-mcp-dashboard-launch-gate.json',
  'VAI-611 launch gate must point at the Playwright fixture',
);
assert(
  vai611Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-611 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai611Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-611 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai611Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-612-daemon-launch-health-gate.md',
  'VAI-611 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai611Gate?.required_evidence || []) === JSON.stringify(vai611LaunchGateReceipt.required_evidence),
  'VAI-611 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai614Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-614');
assert(vai614Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-614 for VAIOS-G724');
assert(
  vai614Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-614-objective-gap-3e00ad2a0074.md',
  'VAI-614 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai614Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-614-mcp-dashboard-launch-gate.md',
  'VAI-614 launch gate must point at the current launch gate receipt',
);
assert(
  vai614Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-614-mcp-dashboard-launch-gate.json',
  'VAI-614 launch gate must point at the Playwright fixture',
);
assert(
  vai614Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-614 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai614Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-614 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai614Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md',
  'VAI-614 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai614Gate?.required_evidence || []) === JSON.stringify(vai614LaunchGateReceipt.required_evidence),
  'VAI-614 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
const vai617Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-617');
assert(vai617Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-617 for VAIOS-G724');
assert(
  vai617Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-617-objective-gap-3e00ad2a0074.md',
  'VAI-617 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai617Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-617-mcp-dashboard-launch-gate.md',
  'VAI-617 launch gate must point at the current launch gate receipt',
);
assert(
  vai617Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-617-mcp-dashboard-launch-gate.json',
  'VAI-617 launch gate must point at the Playwright fixture',
);
assert(
  vai617Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-617 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai617Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-617 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai617Gate?.packet_sibling_task_id === 'VAI-618',
  'VAI-617 launch gate must preserve the VAI-618 packet sibling task',
);
assert(
  vai617Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md',
  'VAI-617 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai617Gate?.required_evidence || []) === JSON.stringify(vai617LaunchGateReceipt.required_evidence),
  'VAI-617 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai617Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-617 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai620Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-620');
assert(vai620Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-620 for VAIOS-G724');
assert(
  vai620Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-620-objective-gap-3e00ad2a0074.md',
  'VAI-620 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai620Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-620-mcp-dashboard-launch-gate.md',
  'VAI-620 launch gate must point at the current launch gate receipt',
);
assert(
  vai620Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-620-mcp-dashboard-launch-gate.json',
  'VAI-620 launch gate must point at the Playwright fixture',
);
assert(
  vai620Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-620 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai620Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-620 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai620Gate?.packet_sibling_task_id === 'VAI-621',
  'VAI-620 launch gate must preserve the VAI-621 packet sibling task',
);
assert(
  vai620Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md',
  'VAI-620 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai620Gate?.required_evidence || []) === JSON.stringify(vai620LaunchGateReceipt.required_evidence),
  'VAI-620 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai620Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-620 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai623Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-623');
assert(vai623Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-623 for VAIOS-G724');
assert(
  vai623Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-623-objective-gap-3e00ad2a0074.md',
  'VAI-623 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai623Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-623-mcp-dashboard-launch-gate.md',
  'VAI-623 launch gate must point at the current launch gate receipt',
);
assert(
  vai623Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-623-mcp-dashboard-launch-gate.json',
  'VAI-623 launch gate must point at the Playwright fixture',
);
assert(
  vai623Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-623 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai623Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-623 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai623Gate?.packet_sibling_task_id === 'VAI-624',
  'VAI-623 launch gate must preserve the VAI-624 packet sibling task',
);
assert(
  vai623Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md',
  'VAI-623 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai623Gate?.required_evidence || []) === JSON.stringify(vai623LaunchGateReceipt.required_evidence),
  'VAI-623 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai623Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-623 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai626Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-626');
assert(vai626Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-626 for VAIOS-G724');
assert(
  vai626Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-626-objective-gap-3e00ad2a0074.md',
  'VAI-626 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai626Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-626-mcp-dashboard-launch-gate.md',
  'VAI-626 launch gate must point at the current launch gate receipt',
);
assert(
  vai626Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-626-mcp-dashboard-launch-gate.json',
  'VAI-626 launch gate must point at the Playwright fixture',
);
assert(
  vai626Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-626 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai626Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-626 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai626Gate?.packet_sibling_task_id === 'VAI-627',
  'VAI-626 launch gate must preserve the VAI-627 packet sibling task',
);
assert(
  vai626Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md',
  'VAI-626 launch gate must point at the packet sibling daemon gate receipt',
);
assert(
  JSON.stringify(vai626Gate?.required_evidence || []) === JSON.stringify(vai626LaunchGateReceipt.required_evidence),
  'VAI-626 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai626Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-626 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai629Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-629');
assert(vai629Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-629 for VAIOS-G724');
assert(
  vai629Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-629-objective-gap-3e00ad2a0074.md',
  'VAI-629 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai629Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-629-mcp-dashboard-launch-gate.md',
  'VAI-629 launch gate must point at the current launch gate receipt',
);
assert(
  vai629Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-629-mcp-dashboard-launch-gate.json',
  'VAI-629 launch gate must point at the Playwright fixture',
);
assert(
  vai629Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-629 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai629Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-629 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai629Gate?.packet_sibling_task_id === 'VAI-630',
  'VAI-629 launch gate must preserve the VAI-630 packet sibling task',
);
assert(
  vai629Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-630-daemon-launch-health-gate.md',
  'VAI-629 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(
  JSON.stringify(vai629Gate?.required_evidence || []) === JSON.stringify(vai629LaunchGateReceipt.required_evidence),
  'VAI-629 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai629Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-629 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai632Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-632');
assert(vai632Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-632 for VAIOS-G724');
assert(
  vai632Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-632-objective-gap-3e00ad2a0074.md',
  'VAI-632 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai632Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-632-mcp-dashboard-launch-gate.md',
  'VAI-632 launch gate must point at the current launch gate receipt',
);
assert(
  vai632Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-632-mcp-dashboard-launch-gate.json',
  'VAI-632 launch gate must point at the Playwright fixture',
);
assert(
  vai632Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-632 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai632Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-632 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai632Gate?.packet_sibling_task_id === 'VAI-633',
  'VAI-632 launch gate must preserve the VAI-633 packet sibling task',
);
assert(
  vai632Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md',
  'VAI-632 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(
  JSON.stringify(vai632Gate?.required_evidence || []) === JSON.stringify(vai632LaunchGateReceipt.required_evidence),
  'VAI-632 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai632Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-632 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai635Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-635');
assert(vai635Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-635 for VAIOS-G724');
assert(
  vai635Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-635-objective-gap-3e00ad2a0074.md',
  'VAI-635 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai635Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-635-mcp-dashboard-launch-gate.md',
  'VAI-635 launch gate must point at the current launch gate receipt',
);
assert(
  vai635Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-635-mcp-dashboard-launch-gate.json',
  'VAI-635 launch gate must point at the Playwright fixture',
);
assert(
  vai635Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-635 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai635Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-635 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai635Gate?.packet_sibling_task_id === 'VAI-636',
  'VAI-635 launch gate must preserve the VAI-636 packet sibling task',
);
assert(
  vai635Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md',
  'VAI-635 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(
  JSON.stringify(vai635Gate?.required_evidence || []) === JSON.stringify(vai635LaunchGateReceipt.required_evidence),
  'VAI-635 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai635Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-635 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai638Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-638');
assert(vai638Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-638 for VAIOS-G724');
assert(
  vai638Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-638-objective-gap-3e00ad2a0074.md',
  'VAI-638 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai638Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-638-mcp-dashboard-launch-gate.md',
  'VAI-638 launch gate must point at the current launch gate receipt',
);
assert(
  vai638Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-638-mcp-dashboard-launch-gate.json',
  'VAI-638 launch gate must point at the Playwright fixture',
);
assert(
  vai638Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-638 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai638Gate?.packet_sibling_goal_id === 'VAIOS-G728',
  'VAI-638 launch gate must preserve the VAIOS-G728 packet sibling',
);
assert(
  vai638Gate?.packet_sibling_task_id === 'VAI-639',
  'VAI-638 launch gate must preserve the VAI-639 packet sibling task',
);
assert(
  vai638Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md',
  'VAI-638 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai638Gate?.attempt === 1, 'VAI-638 launch gate must preserve the attempt-1 validation receipt number');
assert(
  JSON.stringify(vai638Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-638-attempt-1-launch-playwright-validation-gate.md',
  ]),
  'VAI-638 launch gate must expose the attempt-1 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai638Gate?.required_evidence || []) === JSON.stringify(vai638LaunchGateReceipt.required_evidence),
  'VAI-638 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai638Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-638 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai640Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-640');
assert(vai640Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-640 for VAIOS-G724');
assert(
  vai640Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-640-objective-gap-3e00ad2a0074.md',
  'VAI-640 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai640Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-640-mcp-dashboard-launch-gate.md',
  'VAI-640 launch gate must point at the current launch gate receipt',
);
assert(
  vai640Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-640-mcp-dashboard-launch-gate.json',
  'VAI-640 launch gate must point at the Playwright fixture',
);
assert(
  vai640Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-640 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai640Gate?.packet_sibling_task_id === 'VAI-641',
  'VAI-640 launch gate must preserve the VAI-641 packet sibling task',
);
assert(
  vai640Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-641-daemon-launch-health-gate.md',
  'VAI-640 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai640Gate?.attempt === 2, 'VAI-640 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai640Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-640-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-640 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai640Gate?.required_evidence || []) === JSON.stringify(vai640LaunchGateReceipt.required_evidence),
  'VAI-640 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai640Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-640 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai642Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-642');
assert(vai642Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-642 for VAIOS-G724');
assert(
  vai642Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-642-objective-gap-3e00ad2a0074.md',
  'VAI-642 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai642Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-642-mcp-dashboard-launch-gate.md',
  'VAI-642 launch gate must point at the current launch gate receipt',
);
assert(
  vai642Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-642-mcp-dashboard-launch-gate.json',
  'VAI-642 launch gate must point at the Playwright fixture',
);
assert(
  vai642Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-642 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai642Gate?.packet_sibling_task_id === 'VAI-643',
  'VAI-642 launch gate must preserve the VAI-643 packet sibling task',
);
assert(
  vai642Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-643-daemon-launch-health-gate.md',
  'VAI-642 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai642Gate?.attempt === 2, 'VAI-642 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai642Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-642-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-642 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai642Gate?.required_evidence || []) === JSON.stringify(vai642LaunchGateReceipt.required_evidence),
  'VAI-642 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai642Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-642 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai644Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-644');
assert(vai644Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-644 for VAIOS-G724');
assert(
  vai644Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-644-objective-gap-3e00ad2a0074.md',
  'VAI-644 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai644Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-644-mcp-dashboard-launch-gate.md',
  'VAI-644 launch gate must point at the current launch gate receipt',
);
assert(
  vai644Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-644-mcp-dashboard-launch-gate.json',
  'VAI-644 launch gate must point at the Playwright fixture',
);
assert(
  vai644Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-644 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai644Gate?.packet_sibling_task_id === 'VAI-645',
  'VAI-644 launch gate must preserve the VAI-645 packet sibling task',
);
assert(
  vai644Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-645-daemon-launch-health-gate.md',
  'VAI-644 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai644Gate?.attempt === 2, 'VAI-644 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai644Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-644-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-644 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai644Gate?.required_evidence || []) === JSON.stringify(vai644LaunchGateReceipt.required_evidence),
  'VAI-644 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai644Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-644 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai647Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-647');
assert(vai647Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-647 for VAIOS-G724');
assert(
  vai647Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-647-objective-gap-3e00ad2a0074.md',
  'VAI-647 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai647Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-647-mcp-dashboard-launch-gate.md',
  'VAI-647 launch gate must point at the current launch gate receipt',
);
assert(
  vai647Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-647-mcp-dashboard-launch-gate.json',
  'VAI-647 launch gate must point at the Playwright fixture',
);
assert(
  vai647Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-647 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai647Gate?.packet_sibling_task_id === 'VAI-648',
  'VAI-647 launch gate must preserve the VAI-648 packet sibling task',
);
assert(
  vai647Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-648-daemon-launch-health-gate.md',
  'VAI-647 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai647Gate?.attempt === 2, 'VAI-647 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai647Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-647-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-647 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai647Gate?.required_evidence || []) === JSON.stringify(vai647LaunchGateReceipt.required_evidence),
  'VAI-647 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai647Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-647 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai649Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-649');
assert(vai649Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-649 for VAIOS-G724');
assert(
  vai649Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-649-objective-gap-3e00ad2a0074.md',
  'VAI-649 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai649Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-649-mcp-dashboard-launch-gate.md',
  'VAI-649 launch gate must point at the current launch gate receipt',
);
assert(
  vai649Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-649-mcp-dashboard-launch-gate.json',
  'VAI-649 launch gate must point at the Playwright fixture',
);
assert(
  vai649Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-649 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai649Gate?.packet_sibling_task_id === 'VAI-650',
  'VAI-649 launch gate must preserve the VAI-650 packet sibling task',
);
assert(
  vai649Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-650-daemon-launch-health-gate.md',
  'VAI-649 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai649Gate?.attempt === 2, 'VAI-649 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai649Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-649-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-649 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai649Gate?.required_evidence || []) === JSON.stringify(vai649LaunchGateReceipt.required_evidence),
  'VAI-649 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai649Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-649 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai651Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-651');
assert(vai651Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-651 for VAIOS-G724');
assert(
  vai651Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-651-objective-gap-3e00ad2a0074.md',
  'VAI-651 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai651Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-651-mcp-dashboard-launch-gate.md',
  'VAI-651 launch gate must point at the current launch gate receipt',
);
assert(
  vai651Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-651-mcp-dashboard-launch-gate.json',
  'VAI-651 launch gate must point at the Playwright fixture',
);
assert(
  vai651Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-651 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai651Gate?.packet_sibling_task_id === 'VAI-652',
  'VAI-651 launch gate must preserve the VAI-652 packet sibling task',
);
assert(
  vai651Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-652-daemon-launch-health-gate.md',
  'VAI-651 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai651Gate?.attempt === 2, 'VAI-651 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai651Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-651-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-651 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai651Gate?.required_evidence || []) === JSON.stringify(vai651LaunchGateReceipt.required_evidence),
  'VAI-651 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai651Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-651 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai653Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-653');
assert(vai653Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-653 for VAIOS-G724');
assert(
  vai653Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-653-objective-gap-3e00ad2a0074.md',
  'VAI-653 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai653Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-653-mcp-dashboard-launch-gate.md',
  'VAI-653 launch gate must point at the current launch gate receipt',
);
assert(
  vai653Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-653-mcp-dashboard-launch-gate.json',
  'VAI-653 launch gate must point at the Playwright fixture',
);
assert(
  vai653Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-653 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai653Gate?.packet_sibling_task_id === 'VAI-654',
  'VAI-653 launch gate must preserve the VAI-654 packet sibling task',
);
assert(
  vai653Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-654-daemon-launch-health-gate.md',
  'VAI-653 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai653Gate?.attempt === 2, 'VAI-653 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai653Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-653-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-653 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai653Gate?.required_evidence || []) === JSON.stringify(vai653LaunchGateReceipt.required_evidence),
  'VAI-653 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai653Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-653 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai655Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-655');
assert(vai655Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-655 for VAIOS-G724');
assert(
  vai655Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-655-objective-gap-3e00ad2a0074.md',
  'VAI-655 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai655Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-655-mcp-dashboard-launch-gate.md',
  'VAI-655 launch gate must point at the current launch gate receipt',
);
assert(
  vai655Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-655-mcp-dashboard-launch-gate.json',
  'VAI-655 launch gate must point at the Playwright fixture',
);
assert(
  vai655Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-655 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai655Gate?.packet_sibling_task_id === 'VAI-656',
  'VAI-655 launch gate must preserve the VAI-656 packet sibling task',
);
assert(
  vai655Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-656-daemon-launch-health-gate.md',
  'VAI-655 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai655Gate?.attempt === 1, 'VAI-655 launch gate must preserve the attempt-1 validation receipt number');
assert(
  JSON.stringify(vai655Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-655-attempt-1-launch-playwright-validation-gate.md',
  ]),
  'VAI-655 launch gate must expose the attempt-1 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai655Gate?.required_evidence || []) === JSON.stringify(vai655LaunchGateReceipt.required_evidence),
  'VAI-655 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai655Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-655 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai657Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-657');
assert(vai657Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-657 for VAIOS-G724');
assert(
  vai657Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-657-objective-gap-3e00ad2a0074.md',
  'VAI-657 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai657Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-657-mcp-dashboard-launch-gate.md',
  'VAI-657 launch gate must point at the current launch gate receipt',
);
assert(
  vai657Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-657-mcp-dashboard-launch-gate.json',
  'VAI-657 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai657Gate?.todo_source || {}) === JSON.stringify({
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 8696,
  }),
  'VAI-657 launch gate must preserve the supervisor todo source line for Swissknife consumers',
);
assert(
  vai657Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-657 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai657Gate?.packet_sibling_task_id === 'VAI-658',
  'VAI-657 launch gate must preserve the VAI-658 packet sibling task',
);
assert(
  vai657Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-658-daemon-launch-health-gate.md',
  'VAI-657 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai657Gate?.attempt === 2, 'VAI-657 launch gate must preserve the attempt-2 validation receipt number');
assert(
  JSON.stringify(vai657Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-657-attempt-2-launch-playwright-validation-gate.md',
  ]),
  'VAI-657 launch gate must expose the attempt-2 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai657Gate?.required_evidence || []) === JSON.stringify(vai657LaunchGateReceipt.required_evidence),
  'VAI-657 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai657Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-657 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai659Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-659');
assert(vai659Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-659 for VAIOS-G724');
assert(
  vai659Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-659-objective-gap-3e00ad2a0074.md',
  'VAI-659 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai659Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-659-mcp-dashboard-launch-gate.md',
  'VAI-659 launch gate must point at the current launch gate receipt',
);
assert(
  vai659Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-659-mcp-dashboard-launch-gate.json',
  'VAI-659 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai659Gate?.todo_source || {}) === JSON.stringify({
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 8768,
  }),
  'VAI-659 launch gate must preserve the supervisor todo source line for Swissknife consumers',
);
assert(
  vai659Gate?.gate_state === 'gate_closed_by_playwright_validation',
  'VAI-659 launch gate must be closed by the launch Playwright validation gate',
);
assert(
  vai659Gate?.packet_sibling_task_id === 'VAI-660',
  'VAI-659 launch gate must preserve the VAI-660 packet sibling task',
);
assert(
  vai659Gate?.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-05-vai-660-daemon-launch-health-gate.md',
  'VAI-659 launch gate must point at the packet sibling daemon launch gate receipt',
);
assert(vai659Gate?.attempt === 1, 'VAI-659 launch gate must preserve the attempt-1 validation receipt number');
assert(
  JSON.stringify(vai659Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-05-vai-659-attempt-1-launch-playwright-validation-gate.md',
  ]),
  'VAI-659 launch gate must expose the attempt-1 launch Playwright validation receipt',
);
assert(
  JSON.stringify(vai659Gate?.required_evidence || []) === JSON.stringify(vai659LaunchGateReceipt.required_evidence),
  'VAI-659 launch gate must preserve dashboard capability catalog evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai659Gate?.external_backend_surfaces || []) === JSON.stringify([
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit',
  ]),
  'VAI-659 launch gate must expose the external IPFS backend surfaces for Swissknife consumers',
);
const vai631Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-631');
assert(vai631Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-631 for VAIOS-G723');
assert(
  vai631Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-631-objective-gap-7ea369464239.md',
  'VAI-631 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai631Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-631-mcp-dashboard-launch-gate.md',
  'VAI-631 launch gate must point at the current launch gate receipt',
);
assert(
  vai631Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-631-mcp-dashboard-launch-gate.md',
  'VAI-631 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai631Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-631-mcp-dashboard-launch-gate.json',
  'VAI-631 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai631Gate?.required_evidence || []) === JSON.stringify(vai631LaunchGateReceipt.required_evidence),
  'VAI-631 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai631Gate?.child_goals || []) === JSON.stringify(vai631LaunchGateReceipt.child_goals),
  'VAI-631 launch gate must expose VAIOS-G723 child goals for Swissknife consumers',
);
assert(
  JSON.stringify(vai631Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-631-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-631-attempt-1-validation.md',
  ]),
  'VAI-631 launch gate must point at the attempt-1 validation receipts',
);
const vai634Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-634');
assert(vai634Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-634 for VAIOS-G723');
assert(
  vai634Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-634-objective-gap-7ea369464239.md',
  'VAI-634 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai634Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-634-mcp-dashboard-launch-gate.md',
  'VAI-634 launch gate must point at the current launch gate receipt',
);
assert(
  vai634Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-634-mcp-dashboard-launch-gate.md',
  'VAI-634 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai634Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-634-mcp-dashboard-launch-gate.json',
  'VAI-634 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai634Gate?.required_evidence || []) === JSON.stringify(vai634LaunchGateReceipt.required_evidence),
  'VAI-634 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai634Gate?.child_goals || []) === JSON.stringify(vai634LaunchGateReceipt.child_goals),
  'VAI-634 launch gate must expose VAIOS-G723 child goals for Swissknife consumers',
);
assert(
  JSON.stringify(vai634Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-634-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-634-attempt-1-validation.md',
  ]),
  'VAI-634 launch gate must point at the attempt-1 validation receipts',
);
const vai637Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-637');
assert(vai637Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-637 for VAIOS-G723');
assert(
  vai637Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-637-objective-gap-7ea369464239.md',
  'VAI-637 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai637Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-637-mcp-dashboard-launch-gate.md',
  'VAI-637 launch gate must point at the current launch gate receipt',
);
assert(
  vai637Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-637-mcp-dashboard-launch-gate.md',
  'VAI-637 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  vai637Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-637-mcp-dashboard-launch-gate.json',
  'VAI-637 launch gate must point at the Playwright fixture',
);
assert(
  JSON.stringify(vai637Gate?.required_evidence || []) === JSON.stringify(vai637LaunchGateReceipt.required_evidence),
  'VAI-637 launch gate must preserve dashboard launch evidence terms for Swissknife consumers',
);
assert(
  JSON.stringify(vai637Gate?.child_goals || []) === JSON.stringify(vai637LaunchGateReceipt.child_goals),
  'VAI-637 launch gate must expose VAIOS-G723 child goals for Swissknife consumers',
);
assert(
  JSON.stringify(vai637Gate?.attempt_receipts || []) === JSON.stringify([
    'data/virtual_ai_os/discovery/2026-07-04-vai-637-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-637-attempt-1-validation.md',
  ]),
  'VAI-637 launch gate must point at the attempt-1 validation receipts',
);
assert(catalog.swissknife_catalog_consumer_proof?.task_id === 'HAO-681', 'Catalog must expose the HAO-681 Swissknife consumer proof');
assert(
  JSON.stringify(catalog.swissknife_catalog_consumer_proof?.depends_on) === JSON.stringify(['HAO-677', 'HAO-680']),
  'HAO-681 proof must depend on HAO-677 and HAO-680',
);
assert(
  catalog.swissknife_catalog_consumer_proof?.evidence_term === 'Hallucinate App MCP dashboard catalog consumed by Swissknife applications',
  'HAO-681 proof evidence term mismatch',
);
assert(consumerReceipt.task_id === 'HAO-681', 'Swissknife dashboard catalog consumer receipt must name HAO-681');
assert(consumerReceipt.catalog_schema === catalog.schema, 'HAO-681 consumer receipt must use the Hallucinate dashboard catalog schema');
assert(consumerReceipt.catalog_generated_by === catalog.generated_by, 'HAO-681 consumer receipt must use the Hallucinate catalog source');
assert(consumerReceipt.receipt_schema === 'mcp_server_invocation_receipt_v1', 'HAO-681 consumer receipt must use the shared receipt schema');
assert(
  consumerReceipt.validation_commands.includes('npm --prefix swissknife run test:e2e:mcp'),
  'HAO-681 consumer receipt must include the Swissknife MCP gate command',
);
assert(launchReceipt.task_id === 'HAO-704', 'Swissknife MCP dashboard launch receipt must name HAO-704');
assert(launchReceipt.goal_id === 'VAIOS-G725', 'Swissknife MCP dashboard launch receipt must name VAIOS-G725');
assert(launchReceipt.evidence_term === 'launch Playwright validation gate', 'Swissknife launch receipt evidence term mismatch');
assert(
  launchReceipt.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-704-objective-gap-1d0c6a56cf6c.md',
  'Swissknife launch receipt must point at the HAO-704 objective gap',
);
assert(
  launchReceipt.validation_commands.includes('npm --prefix swissknife run test:e2e:mcp'),
  'Swissknife launch receipt must include the MCP Playwright gate command',
);
assert(vai512ConsumptionReceipt.schema === 'launch_readiness_receipt_v1', 'VAI-512 consumption receipt schema mismatch');
assert(vai512ConsumptionReceipt.task_id === 'VAI-512', 'VAI-512 consumption receipt must name VAI-512');
assert(vai512ConsumptionReceipt.goal_id === 'VAIOS-G723', 'VAI-512 consumption receipt must name VAIOS-G723');
assert(
  vai512ConsumptionReceipt.evidence_term === 'Hallucinate dashboard to Swissknife MCP consumer launch receipt',
  'VAI-512 consumption receipt evidence term mismatch',
);
assert(vai512ConsumptionReceipt.catalog_schema === catalog.schema, 'VAI-512 receipt catalog schema must match the shared catalog');
assert(vai512ConsumptionReceipt.catalog_generated_by === catalog.generated_by, 'VAI-512 receipt catalog source must match Hallucinate App');
assert(vai512ConsumptionReceipt.dashboard_only_mocks === false, 'VAI-512 receipt must reject dashboard-only mocks');
assert(vai512ConsumptionReceipt.shared_receipt_schema === 'mcp_server_invocation_receipt_v1', 'VAI-512 shared receipt schema mismatch');
assert(
  vai512ConsumptionReceipt.validation_commands.includes('npm --prefix swissknife run test:e2e:mcp'),
  'VAI-512 receipt must include the Swissknife MCP validation command',
);
const plans = buildSwissknifeMCPDashboardConsumerPlans(catalog);
const packages = plans.map(plan => plan.server_package).sort();
const expectedPackages = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(JSON.stringify(packages) === JSON.stringify(expectedPackages), 'Swissknife did not consume all dashboard MCP packages');
assert(new Set(plans.map(plan => plan.catalog_schema)).size === 1, 'Swissknife introduced duplicate dashboard catalog schemas');
assert(
  JSON.stringify([...vai512ConsumptionReceipt.required_backends].sort()) === JSON.stringify(expectedPackages),
  'VAI-512 receipt must require all dashboard MCP packages',
);

for (const plan of plans) {
  assert(plan.catalog_schema === 'hallucinate_app.mcp_dashboard_capability_catalog.v1', 'Unexpected dashboard catalog schema');
  assert(plan.catalog_generated_by === 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog', 'Catalog is not sourced from Hallucinate App');
  assert(plan.dashboard_only_mock === false, 'Dashboard-only mock consumer plan is not allowed');
  assert(plan.receipt_schema === 'mcp_server_invocation_receipt_v1', 'Receipt schema must remain shared');
  assert(plan.tools_list.operation === 'tools/list', 'tools/list operation missing');
  assert(plan.tools_call.operation === 'tools/call', 'tools/call operation missing');
  assert(plan.tools_call.safeProbe?.mutation === false, 'tools/call safe probe must be non-mutating');
  for (const field of ['interaction_envelope', 'policy_decision', 'mediation_receipt', 'mediation_receipt_id', 'receipt_cid']) {
    assert(plan.required_receipt_fields.includes(field), 'Missing receipt field ' + field);
  }
  assert(
    plan.dashboard_receipt_consumer_refs.includes('hallucinate_app.swissknife.mcp_capability_registry'),
    'Swissknife plan must preserve dashboard receipt consumer refs for ' + plan.server_package,
  );
  assert(
    plan.dashboard_receipt_consumer_refs.includes('launch_readiness_packet:VAIOS-G723'),
    'Swissknife plan must preserve VAIOS-G723 launch receipt refs for ' + plan.server_package,
  );
  assert(
    vai512ConsumptionReceipt.required_operations.includes(plan.server_package + ':tools/list') &&
      vai512ConsumptionReceipt.required_operations.includes(plan.server_package + ':tools/call'),
    'VAI-512 receipt must include tools/list and tools/call for ' + plan.server_package,
  );
}

for (const app of consumerReceipt.applications) {
  const plan = plans.find(candidate => candidate.server_package === app.server_package);
  assert(plan, 'Missing HAO-681 consumer plan for ' + app.server_package);
  assert(plan.app_id === app.app_id, 'HAO-681 app id mismatch for ' + app.server_package);
  assert(plan.daemon_id === app.daemon_id, 'HAO-681 daemon id mismatch for ' + app.server_package);
  assert(plan.tools_list.url === app.tools_list_url, 'HAO-681 tools/list URL mismatch for ' + app.server_package);
  assert(plan.tools_call.safeProbe?.tool_name === app.safe_tools_call_probe, 'HAO-681 safe probe tool mismatch for ' + app.server_package);
  assert(plan.tools_call.safeProbe?.expected_receipt === app.safe_probe_receipt, 'HAO-681 safe probe receipt mismatch for ' + app.server_package);
}

assert(
  buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_kit_py', 'tools/list').url === 'http://127.0.0.1:8014/mcp/tools/list',
  'ipfs_kit_py tools/list URL mismatch',
);
assert(
  buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_datasets_py', 'tools/call').safe_probe?.tool_name === 'datasets_list',
  'ipfs_datasets_py tools/call safe probe mismatch',
);
assert(
  buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_accelerate_py', 'tools/call').safe_probe?.tool_name === 'hardware_profile',
  'ipfs_accelerate_py tools/call safe probe mismatch',
);

console.log(JSON.stringify({
  status: 'ok',
  task_id: 'HAO-681',
  catalog_task_id: 'VAI-512',
  consumption_receipt_task_id: vai512ConsumptionReceipt.task_id,
  consumption_evidence_term: vai512ConsumptionReceipt.evidence_term,
  launch_task_id: catalog.launch_validation_gate.task_id,
  consumer_receipt_task_id: consumerReceipt.task_id,
  swissknife_launch_task_id: launchReceipt.task_id,
  meta_glasses_launch_task_ids: [
    mgw558LaunchGateReceipt.task_id,
    mgw559LaunchGateReceipt.task_id,
    mgw561LaunchGateReceipt.task_id,
    mgw562LaunchGateReceipt.task_id,
    mgw563LaunchGateReceipt.task_id,
    mgw564LaunchGateReceipt.task_id,
    mgw566LaunchGateReceipt.task_id,
  ],
  virtual_ai_launch_task_ids: [
    vai567LaunchGateReceipt.task_id,
    vai566LaunchGateReceipt.task_id,
    vai569LaunchGateReceipt.task_id,
    vai572LaunchGateReceipt.task_id,
    vai575LaunchGateReceipt.task_id,
    vai578LaunchGateReceipt.task_id,
    vai581LaunchGateReceipt.task_id,
    vai584LaunchGateReceipt.task_id,
    vai587LaunchGateReceipt.task_id,
    vai588LaunchGateReceipt.task_id,
    vai592LaunchGateReceipt.task_id,
    vai590LaunchGateReceipt.task_id,
    vai591LaunchGateReceipt.task_id,
    vai594LaunchGateReceipt.task_id,
    vai597LaunchGateReceipt.task_id,
    vai600LaunchGateReceipt.task_id,
    vai603LaunchGateReceipt.task_id,
    vai606LaunchGateReceipt.task_id,
    vai609LaunchGateReceipt.task_id,
    vai610LaunchGateReceipt.task_id,
    vai613LaunchGateReceipt.task_id,
    vai616LaunchGateReceipt.task_id,
    vai619LaunchGateReceipt.task_id,
    vai622LaunchGateReceipt.task_id,
    vai625LaunchGateReceipt.task_id,
    vai628LaunchGateReceipt.task_id,
    vai595LaunchGateReceipt.task_id,
    vai598LaunchGateReceipt.task_id,
    vai601LaunchGateReceipt.task_id,
    vai604LaunchGateReceipt.task_id,
    vai607LaunchGateReceipt.task_id,
    vai611LaunchGateReceipt.task_id,
    vai614LaunchGateReceipt.task_id,
    vai617LaunchGateReceipt.task_id,
    vai620LaunchGateReceipt.task_id,
    vai623LaunchGateReceipt.task_id,
    vai626LaunchGateReceipt.task_id,
    vai629LaunchGateReceipt.task_id,
    vai632LaunchGateReceipt.task_id,
    vai634LaunchGateReceipt.task_id,
    vai637LaunchGateReceipt.task_id,
    vai649LaunchGateReceipt.task_id,
    vai651LaunchGateReceipt.task_id,
    vai653LaunchGateReceipt.task_id,
    vai655LaunchGateReceipt.task_id,
    vai657LaunchGateReceipt.task_id,
    vai659LaunchGateReceipt.task_id,
    vai631LaunchGateReceipt.task_id,
  ],
  launch_goal_ids: catalog.launch_objective_ids,
  swissknife_launch_goal_id: launchReceipt.goal_id,
  catalog_schema: catalog.schema,
  packages,
  operations: plans.flatMap(plan => [
    plan.server_package + ':tools/list',
    plan.server_package + ':tools/call',
  ]),
}, null, 2));
`;

const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module'], {
  cwd: root,
  encoding: 'utf8',
  input: validator,
  stdio: ['pipe', 'pipe', 'pipe'],
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(typeof result.status === 'number' ? result.status : 1);
