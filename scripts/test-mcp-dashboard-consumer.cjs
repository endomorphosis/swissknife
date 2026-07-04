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
} from './src/services/swissknife-mcp-capability-registry.ts';

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
const vai566LaunchGateReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-566-mcp-dashboard-launch-gate.json',
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
const vai566LaunchGateReceipt = JSON.parse(fs.readFileSync(vai566LaunchGateReceiptPath, 'utf8'));
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
    vai566LaunchGateReceipt.task_id,
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

const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', validator], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(typeof result.status === 'number' ? result.status : 1);
