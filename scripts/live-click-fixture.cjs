// Real, content-addressed input for GUI retrieval tests. Setup runs in Node,
// outside the browser's per-control MCP observation boundary.
const { cidForBytes } = require('./mcpplusplus-profile-a.cjs');

const FIXTURE_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96" viewBox="0 0 128 96">'
  + '<rect width="128" height="96" fill="#15364d"/>'
  + '<circle cx="64" cy="48" r="28" fill="#e9bd58"/></svg>',
);
const LIVE_CLICK_FIXTURE_CID = cidForBytes(FIXTURE_BYTES);

function verifyFixture(body) {
  if (body?.found !== true || body?.verified !== true || body?.cid !== LIVE_CLICK_FIXTURE_CID
      || typeof body?.bytes_base64 !== 'string') {
    throw new Error('Live-click fixture was not retrieved and verified by ipfs_kit_py.');
  }
  const bytes = Buffer.from(body.bytes_base64, 'base64');
  if (!bytes.equals(FIXTURE_BYTES) || cidForBytes(bytes) !== LIVE_CLICK_FIXTURE_CID) {
    throw new Error('Live-click fixture bytes do not match their content CID.');
  }
}

async function ensureLiveClickFixture({
  endpoint = 'http://127.0.0.1:8014/mcp/artifacts',
  fetchImpl = globalThis.fetch,
} = {}) {
  async function request(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Live-click fixture owner returned HTTP ${response.status}.`);
    return response.json();
  }
  const location = `${endpoint}/${LIVE_CLICK_FIXTURE_CID}`;
  const existing = await request(location);
  if (existing?.found === true) {
    verifyFixture(existing);
    return LIVE_CLICK_FIXTURE_CID;
  }
  if (existing?.found !== false) throw new Error('Live-click fixture lookup was inconclusive.');
  const persisted = await request(`${endpoint}/put`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cid: LIVE_CLICK_FIXTURE_CID,
      bytes_base64: FIXTURE_BYTES.toString('base64'),
      profile: 'live-click-test', kind: 'image-fixture', service: 'ipfs_kit_py', pin: false,
    }),
  });
  if (persisted?.persisted !== true || persisted?.verified !== true
      || persisted?.cid !== LIVE_CLICK_FIXTURE_CID) {
    throw new Error('Live-click fixture persistence was not verified.');
  }
  verifyFixture(await request(location));
  return LIVE_CLICK_FIXTURE_CID;
}

module.exports = { LIVE_CLICK_FIXTURE_CID, ensureLiveClickFixture };
