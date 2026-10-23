'use strict';
// Checkpoints preserve actual rows after interruption. They grant no acquisition
// or acceptance result; the final report still goes through the strict checker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeAtomicJson } = require('./vdg-atomic-json.cjs');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rowKey = value => JSON.stringify([value.app_id, value.launch_id, value.selector]);
function openCaptureCheckpoint({ directory, target, transport, inputFingerprint, fresh = false, artifactRoot = path.resolve(__dirname, '../..') }) {
  if (!/^[a-z][a-z0-9-]*$/.test(target) || !['http', 'libp2p'].includes(transport)
    || !/^[a-f0-9]{64}$/.test(inputFingerprint)) throw new Error('invalid capture checkpoint identity');
  const filename = path.join(directory, `${target}-${transport}-${inputFingerprint}.json`);
  const imageHashes = {};
  function imageHash(relative) {
    const filename = path.resolve(artifactRoot, relative);
    if (path.isAbsolute(relative) || filename === artifactRoot || !filename.startsWith(`${path.resolve(artifactRoot)}${path.sep}`)) return null;
    try { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); } catch { return null; }
  }
  let snapshot = { rows: [], observations: [], pageerrors: [] };
  if (!fresh && fs.existsSync(filename)) {
    try {
      const stored = JSON.parse(fs.readFileSync(filename, 'utf8'));
      const payload = stored.payload;
      if (stored.schema !== 'swissknife.vdg-capture-checkpoint.v1' || stored.target !== target || stored.transport !== transport
        || stored.input_fingerprint !== inputFingerprint || digest(payload) !== stored.payload_sha256
        || !Array.isArray(payload?.rows) || !Array.isArray(payload?.observations) || !Array.isArray(payload?.pageerrors)
        || payload.rows.some(row => !row.app_id || !row.launch_id || !row.selector || !Array.isArray(row.failure_reasons)
          || row.failure_reasons.includes('runner-failed'))
        || new Set(payload.rows.map(rowKey)).size !== payload.rows.length) throw new Error('checkpoint integrity rejected');
      snapshot = payload;
      // An archived status cannot stand in for deleted or changed PNG bytes.
      snapshot.rows = payload.rows.filter(row => ['screenshot_before', 'screenshot_after'].every(field =>
        !row[field] || (payload.image_hashes?.[row[field]] && imageHash(row[field]) === payload.image_hashes[row[field]])));
      Object.assign(imageHashes, payload.image_hashes || {});
    } catch (error) {
      // Damaged checkpoints cannot authorize skipping any real click.
      console.warn(`VDG checkpoint ignored: ${error.message}`);
    }
  }
  return {
    snapshot: structuredClone(snapshot),
    save(payload) {
      if (!Array.isArray(payload.rows) || !Array.isArray(payload.observations) || !Array.isArray(payload.pageerrors)
        || new Set(payload.rows.map(rowKey)).size !== payload.rows.length) throw new Error('invalid capture checkpoint rows');
      for (const row of payload.rows) for (const field of ['screenshot_before', 'screenshot_after']) {
        if (row[field] && !Object.hasOwn(imageHashes, row[field])) imageHashes[row[field]] = imageHash(row[field]);
      }
      const saved = { ...payload, image_hashes: imageHashes };
      writeAtomicJson(filename, { schema: 'swissknife.vdg-capture-checkpoint.v1', target, transport,
        input_fingerprint: inputFingerprint, observed_at: new Date().toISOString(),
        payload: saved, payload_sha256: digest(saved), capture_complete: false,
        work_complete: false, completion_authority: false });
    },
  };
}
module.exports = { openCaptureCheckpoint, rowKey };
