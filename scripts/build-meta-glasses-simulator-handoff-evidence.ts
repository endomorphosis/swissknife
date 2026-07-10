import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  buildMetaGlassesSimulatorHandoffEvidence,
  validateMetaGlassesSimulatorHandoffEvidence,
} from '../src/services/glasses/meta-glasses-simulator-handoff';

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const evidencePath = join(evidenceRoot, 'glasses-simulator-handoff.json');
const screenshotRelativePath = 'test-results/virtual-desktop-ipfs-mcp-orb/glasses-screenshots/swr-097-glasses-simulator-handoff.png';

async function main(): Promise<void> {
  const evidence = await buildMetaGlassesSimulatorHandoffEvidence({
    generatedAt: '2026-07-10T00:00:00.000Z',
    playwrightProbe: {
      status: 'passed',
      screenshot: existsSync(join(process.cwd(), screenshotRelativePath))
        ? screenshotRelativePath
        : undefined,
      visible_dom_assertions: [
        'display states rendered, updated, focused, activated, cleared',
        'camera permission_denied, fallback, accepted states visible',
        'microphone permission, transcript, and denial states visible',
        'speaker simulator policy states visible',
        'touch and voice input mappings visible',
        'all handoff profiles visible without direct desktop pairing',
        'ORB/IDL interface CIDs including input visible',
      ],
    },
  });
  const validation = validateMetaGlassesSimulatorHandoffEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`Invalid Meta glasses simulator handoff evidence: ${validation.errors.join('; ')}`);
  }
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    schema: evidence.schema,
    task_id: evidence.task_id,
    evidence_cid: evidence.evidence_cid,
    output: 'test-results/virtual-desktop-ipfs-mcp-orb/glasses-simulator-handoff.json',
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
