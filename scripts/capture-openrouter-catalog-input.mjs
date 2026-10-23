#!/usr/bin/env node
/** Capture actual public GET response bytes. No GUI or provider execution. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { SOURCE_URL, MAX_BYTES, hash, parseCatalog, validatePublicInput } = require('./vdg-openrouter-catalog-input.cjs');

export function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--output-directory' || !argv[1]) throw Error('usage: capture-openrouter-catalog-input.mjs --output-directory <private-or-public-archive>');
  return { outputDirectory: path.resolve(argv[1]) };
}
export async function capturePublicInput(options = {}, dependencies = {}) {
  const fetcher = dependencies.fetch || fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Public catalog observation deadline must be 1..30000 ms');
  const requested_at = new Date().toISOString(), controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(SOURCE_URL, { method: 'GET', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (response.status !== 200 || response.url !== SOURCE_URL) throw Error('The reviewed public catalog did not return a direct HTTP200 response');
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw Error('The public catalog response is not JSON');
        const declaredSize = response.headers.get('content-length');
        if (declaredSize !== null && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_BYTES)) throw Error('Public catalog declared body size exceeds the limit');
        if (!response.body?.getReader) throw Error('Public catalog response body is unavailable');
        const reader = response.body.getReader(), chunks = [];
        let bytes = 0;
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > MAX_BYTES) { controller.abort(); void reader.cancel().catch(() => {}); throw Error('Public catalog body exceeds the limit'); }
          chunks.push(Buffer.from(item.value));
        }
        const raw = Buffer.concat(chunks), parsed = parseCatalog(raw), raw_sha256 = hash(raw);
        const provenance = {
          schema: 'swissknife.openrouter-observed-public-input.v1', source_url: SOURCE_URL, requested_at,
          observed_at: new Date().toISOString(), http_status: response.status, final_url: response.url,
          response_headers: Object.fromEntries(['content-type', 'date', 'cache-control', 'etag', 'last-modified']
            .flatMap(name => response.headers.has(name) ? [[name, response.headers.get(name)]] : [])),
          raw_sha256, raw_bytes: raw.length, model_count: parsed.model_count, model_ids_sha256: parsed.model_ids_sha256,
          raw_filename: `${raw_sha256}.json`, reconstructed: false, provider_execution: false, gui_acceptance: false,
          work_complete: false, completion_authority: false,
        };
        const provenanceBytes = Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`);
        return { raw, provenance, provenanceBytes, provenance_sha256: hash(provenanceBytes) };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Public catalog GET or response body exceeded its bounded deadline')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}
function immutableWrite(file, bytes) {
  try { fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o644 }); }
  catch (error) {
    if (error.code !== 'EEXIST' || !fs.readFileSync(file).equals(bytes)) throw error;
  }
}
export function archivePublicInput(observation, outputDirectory) {
  const p = observation.provenance, provenance_sha256 = hash(observation.provenanceBytes);
  if (provenance_sha256 !== observation.provenance_sha256
    || JSON.stringify(JSON.parse(observation.provenanceBytes.toString('utf8'))) !== JSON.stringify(p)) throw Error('Public observation provenance is contradictory');
  validatePublicInput(observation.raw, observation.provenanceBytes, {
    schema: 'swissknife.openrouter-catalog-snapshot.v1', source_url: SOURCE_URL,
    observed_at: p.observed_at, raw_sha256: p.raw_sha256, raw_bytes: p.raw_bytes,
    model_count: p.model_count, model_ids_sha256: p.model_ids_sha256, provenance_sha256,
    local_url: `/vdg-public-inputs/openrouter/${p.raw_sha256}.json`,
    provenance_url: `/vdg-public-inputs/openrouter/provenance-${provenance_sha256}.json`,
  });
  fs.mkdirSync(outputDirectory, { recursive: true });
  const rawPath = path.join(outputDirectory, observation.provenance.raw_filename);
  const provenancePath = path.join(outputDirectory, `provenance-${observation.provenance_sha256}.json`);
  immutableWrite(rawPath, observation.raw); immutableWrite(provenancePath, observation.provenanceBytes);
  return { schema: 'swissknife.openrouter-public-input-archive.v1', raw_path: rawPath,
    provenance_path: provenancePath, raw_sha256: observation.provenance.raw_sha256,
    provenance_sha256: observation.provenance_sha256, raw_bytes: observation.provenance.raw_bytes,
    model_count: observation.provenance.model_count, model_ids_sha256: observation.provenance.model_ids_sha256,
    gui_acceptance: false, work_complete: false, completion_authority: false };
}
export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const settings = parseArguments(argv);
  const observation = await capturePublicInput({}, dependencies);
  const receipt = archivePublicInput(observation, settings.outputDirectory);
  console.log(JSON.stringify(receipt));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
