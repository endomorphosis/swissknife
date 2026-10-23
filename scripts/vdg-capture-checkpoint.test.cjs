const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openCaptureCheckpoint } = require('./vdg-capture-checkpoint.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-checkpoint-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, target: 'storage', transport: 'http', inputFingerprint: 'a'.repeat(64) };
}
const payload = { rows: [{ app_id: 'image-viewer', launch_id: 'image-viewer', selector: '#read', failure_reasons: [], observation: { receipt_id: 'real-test-receipt-reference' } }], observations: [{ correlation_id: 'actual-correlated-test' }], pageerrors: [] };
test('interrupted actual rows and independent observations resume only for the same source and transport', t => {
  const options = fixture(t); openCaptureCheckpoint(options).save(payload);
  assert.deepEqual(openCaptureCheckpoint(options).snapshot.rows, payload.rows);
  assert.deepEqual(openCaptureCheckpoint(options).snapshot.observations, payload.observations);
  assert.equal(openCaptureCheckpoint({ ...options, inputFingerprint: 'b'.repeat(64) }).snapshot.rows.length, 0);
  assert.equal(openCaptureCheckpoint({ ...options, transport: 'libp2p' }).snapshot.rows.length, 0);
  const stored = JSON.parse(fs.readFileSync(path.join(options.directory, fs.readdirSync(options.directory)[0])));
  assert.equal(stored.capture_complete, false); assert.equal(stored.completion_authority, false);
});
test('a forced fresh capture never reuses earlier rows', t => {
  const options = fixture(t); openCaptureCheckpoint(options).save(payload);
  assert.equal(openCaptureCheckpoint({ ...options, fresh: true }).snapshot.rows.length, 0);
});
test('tampering, truncation and fatal rows never skip a real click', t => {
  const options = fixture(t); openCaptureCheckpoint(options).save(payload);
  const file = path.join(options.directory, fs.readdirSync(options.directory)[0]);
  const stored = JSON.parse(fs.readFileSync(file)); stored.payload.rows[0].selector = '#invented'; fs.writeFileSync(file, JSON.stringify(stored));
  assert.equal(openCaptureCheckpoint(options).snapshot.rows.length, 0);
  fs.writeFileSync(file, '{'); assert.equal(openCaptureCheckpoint(options).snapshot.rows.length, 0);
  openCaptureCheckpoint(options).save({ ...payload, rows: [{ ...payload.rows[0], failure_reasons: ['runner-failed'] }] });
  assert.equal(openCaptureCheckpoint(options).snapshot.rows.length, 0);
});
test('invalid identities and duplicate control rows are rejected', t => {
  const options = fixture(t);
  assert.throws(() => openCaptureCheckpoint({ ...options, target: '../other' }));
  assert.throws(() => openCaptureCheckpoint(options).save({ ...payload, rows: [...payload.rows, ...payload.rows] }));
});
test('deleted or changed original screenshots require a real click again', t => {
  const options = fixture(t); options.artifactRoot = options.directory;
  fs.writeFileSync(path.join(options.directory, 'actual.png'), 'original owned image bytes');
  const screenshotPayload = { ...payload, rows: [{ ...payload.rows[0], screenshot_before: 'actual.png' }] };
  openCaptureCheckpoint(options).save(screenshotPayload);
  assert.equal(openCaptureCheckpoint(options).snapshot.rows.length, 1);
  fs.writeFileSync(path.join(options.directory, 'actual.png'), 'changed bytes');
  assert.equal(openCaptureCheckpoint(options).snapshot.rows.length, 0);
  fs.unlinkSync(path.join(options.directory, 'actual.png'));
  assert.equal(openCaptureCheckpoint(options).snapshot.rows.length, 0);
});
