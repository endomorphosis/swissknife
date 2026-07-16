#!/usr/bin/env node

/**
 * Materialize the two receipts that close the SVD-071 -> SVD-072 handoff.
 *
 * The handoff is a deterministic compilation of the reviewed I/O map,
 * governed envelopes, and desktop ORB/IDL descriptors.  The simulator report
 * is an equally deterministic, hardware-free replay of that exact packet
 * catalog.  Keeping the write here (rather than in a browser test hook) makes
 * SVD-066 reproducible from a clean checkout while preserving the separate
 * Playwright coverage of the visible simulator controls.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildAgentSupervisorExpandedIOEnvelopes } from '../src/services/apps/agent-supervisor-expanded-io-envelopes.js';
import {
  buildAgentSupervisorExpandedIOHandoff,
  validateAgentSupervisorExpandedIOHandoff,
} from '../src/services/glasses/agent-supervisor-expanded-io-handoff.js';
import { buildAgentSupervisorExpandedIOMap } from '../src/services/glasses/agent-supervisor-expanded-io-map.js';
import { buildVirtualDesktopOrbIdlCompleteCoverage } from '../src/services/glasses/desktop-orb-idl-contract.js';
import {
  buildMetaGlassesDeviceSimulatorValidation,
  validateMetaGlassesDeviceSimulatorValidation,
} from '../src/services/glasses/meta-glasses-expanded-io-simulator-validation.js';

const sourceGeneratedAt = '2026-07-14T00:00:00.000Z';
const simulatorGeneratedAt = '2026-07-15T00:00:00.000Z';
const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const handoffPath = join(evidenceRoot, 'agent-supervisor-expanded-io-handoff.json');
const simulatorPath = join(evidenceRoot, 'meta-glasses-device-simulator-validation.json');

function atomicWrite(filePath: string, contents: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, contents, 'utf8');
  renameSync(temporaryPath, filePath);
}

function main(): void {
  const ioMap = buildAgentSupervisorExpandedIOMap(undefined, { generatedAt: sourceGeneratedAt });
  const envelopes = buildAgentSupervisorExpandedIOEnvelopes(ioMap, {
    generatedAt: sourceGeneratedAt,
    dryRun: true,
  });
  const handoff = buildAgentSupervisorExpandedIOHandoff(
    ioMap,
    envelopes,
    buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
    { generatedAt: sourceGeneratedAt },
  );
  const handoffValidation = validateAgentSupervisorExpandedIOHandoff(handoff, ioMap, envelopes);
  if (!handoffValidation.valid) {
    throw new Error(`SVD-071 handoff validation failed: ${handoffValidation.errors.join('; ')}`);
  }

  const simulator = buildMetaGlassesDeviceSimulatorValidation(handoff, {
    generatedAt: simulatorGeneratedAt,
  });
  const simulatorValidation = validateMetaGlassesDeviceSimulatorValidation(simulator, handoff);
  if (!simulatorValidation.valid) {
    throw new Error(`SVD-072 simulator validation failed: ${simulatorValidation.errors.join('; ')}`);
  }

  atomicWrite(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  atomicWrite(simulatorPath, `${JSON.stringify(simulator, null, 2)}\n`);

  console.log(JSON.stringify({
    task_ids: [handoff.task_id, simulator.task_id],
    handoff: {
      app_count: handoff.app_count,
      packet_count: handoff.packet_count,
      catalog_cid: handoff.catalog_cid,
    },
    simulator: {
      replay_count: simulator.replays.length,
      hardware_free: simulator.boundary.hardware_free,
      physical_hardware_claimed: simulator.boundary.physical_hardware_claimed,
    },
    outputs: [
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-expanded-io-handoff.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/meta-glasses-device-simulator-validation.json',
    ],
  }, null, 2));
}

main();
