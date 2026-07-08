import { join } from 'path';
import {
  META_GLASSES_MULTIMODAL_IO_CONTRACT,
  buildMetaGlassesPlaywrightFixture,
  type MetaGlassesControlPlanePlaywrightFixture,
} from '../../src/services/glasses/meta-glasses-multimodal-io-transport-contract';
<<<<<<< HEAD

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for meta-glasses fixture tests');
}
=======
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

const PLAYWRIGHT_FIXTURE_PATH = join(
  __dirname,
  '../e2e/fixtures/mgw-519-meta-glasses-control-plane.json',
);

function readPlaywrightFixture(): MetaGlassesControlPlanePlaywrightFixture {
  return JSON.parse(nodeFs.readFileSync(PLAYWRIGHT_FIXTURE_PATH, 'utf8'));
}

describe('MGW-519 Meta glasses control-plane fixtures', () => {
  it('builds reusable hardware-free mocks with physical DAT replay receipts', () => {
    const fixture = buildMetaGlassesPlaywrightFixture();

    expect(fixture.task_id).toBe('MGW-519');
    expect(fixture.contract).toBe(META_GLASSES_MULTIMODAL_IO_CONTRACT);
    expect(fixture.playwright_ready).toBe(true);
    expect(fixture.edge_session.paired_meta_glasses_required).toBe(false);
    expect(fixture.events.map(event => event.device)).toEqual(
      expect.arrayContaining([
        'camera',
        'microphone',
        'headphones',
        'display',
        'Neural Band',
      ]),
    );
    expect(fixture.events.map(event => event.event_type)).toEqual(
      expect.arrayContaining([
        'camera.photo_ref',
        'microphone.transcript_ref',
        'headphones.playback_state',
        'display.action',
        'Neural Band.intent',
      ]),
    );
    expect(fixture.events.every(event => event.control_plane.operation === 'publish_glasses_event')).toBe(true);
    expect(fixture.replay_receipts.map(receipt => receipt.receipt_cid)).toEqual(
      fixture.events.map(event => event.receipts[0]),
    );
    expect(fixture.replay_receipts.every(receipt => receipt.preserve_for_dat_replay)).toBe(true);
  });

  it('keeps the checked-in Playwright fixture aligned with the reusable builder', () => {
    const fixture = readPlaywrightFixture();
    const built = buildMetaGlassesPlaywrightFixture();

    expect(fixture.task_id).toBe('MGW-519');
    expect(fixture.fixture_id).toBe(built.fixture_id);
    expect(fixture.events.map(event => event.correlation_id)).toEqual(
      built.events.map(event => event.correlation_id),
    );
    expect(fixture.replay_receipts).toEqual(built.replay_receipts);
  });
});
