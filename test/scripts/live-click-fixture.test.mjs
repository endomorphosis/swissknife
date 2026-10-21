import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import fixture from '../../scripts/live-click-fixture.cjs';
import cidTools from '../../scripts/mcpplusplus-profile-a.cjs';

async function owner(t, options = {}) {
  let stored = null;
  let puts = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'POST') {
      puts += 1;
      let data = '';
      for await (const chunk of request) data += chunk;
      stored = JSON.parse(data);
      assert.equal(cidTools.cidForBytes(Buffer.from(stored.bytes_base64, 'base64')), stored.cid);
      response.end(JSON.stringify({ persisted: true, verified: !options.rejectPut, cid: stored.cid }));
    } else if (stored) {
      response.end(JSON.stringify({
        found: true, verified: !options.unverified, cid: stored.cid,
        bytes_base64: options.corrupt ? Buffer.from('wrong bytes').toString('base64') : stored.bytes_base64,
      }));
    } else {
      response.end(JSON.stringify(options.inconclusive ? {} : { found: false, verified: false }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    endpoint: `http://127.0.0.1:${server.address().port}/mcp/artifacts`,
    puts: () => puts,
    stored: () => stored,
  };
}

test('fixture is actually persisted, hash verified, and reused without another write', async (t) => {
  const service = await owner(t);
  const cid = await fixture.ensureLiveClickFixture({ endpoint: service.endpoint });
  assert.equal(cid, fixture.LIVE_CLICK_FIXTURE_CID);
  assert.equal(service.puts(), 1);
  assert.match(Buffer.from(service.stored().bytes_base64, 'base64').toString(), /^<svg /);
  assert.equal(service.stored().pin, false);
  assert.equal(await fixture.ensureLiveClickFixture({ endpoint: service.endpoint }), cid);
  assert.equal(service.puts(), 1);
});

for (const [name, options, reason] of [
  ['unverified put', { rejectPut: true }, /persistence was not verified/],
  ['unverified readback', { unverified: true }, /not retrieved and verified/],
  ['corrupt readback', { corrupt: true }, /do not match their content CID/],
  ['inconclusive lookup', { inconclusive: true }, /lookup was inconclusive/],
]) {
  test(`fixture setup rejects ${name}`, async (t) => {
    const service = await owner(t, options);
    await assert.rejects(fixture.ensureLiveClickFixture({ endpoint: service.endpoint }), reason);
    if (options.inconclusive) assert.equal(service.puts(), 0);
  });
}

test('owner errors fail setup instead of supplying a placeholder CID', async () => {
  await assert.rejects(fixture.ensureLiveClickFixture({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /HTTP 503/);
  await assert.rejects(fixture.ensureLiveClickFixture({
    fetchImpl: async () => { throw new Error('owner unavailable'); },
  }), /owner unavailable/);
});
