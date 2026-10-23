'use strict';

// Exact IPFS Kit operations against a configured, real Kubo owner. A missing
// owner remains an error. Mutation previews validate input and owner state,
// and explicitly report that no write occurred.
const { isContentCid, cidForBytes } = require('./mcpplusplus-profile-a.cjs');
const READS = new Set(['ipfs_cat', 'ipfs_ls', 'files_ls', 'files_read', 'swarm_peers', 'node_id']);
const WRITES = new Set(['files_write', 'ipfs_add', 'ipfs_pubsub_publish']);

function mfsPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')
      || value.split('/').some(part => part === '..')) throw new Error('A canonical absolute MFS path is required.');
  return value;
}

function createKuboKitToolExecutor({ endpoint = process.env.IPFS_KIT_KUBO_API, fetchImpl = globalThis.fetch } = {}) {
  if (!endpoint) return async () => null;
  const base = new URL(endpoint);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Kubo API must use HTTP.');
  async function request(operation, args = {}, body) {
    const url = new URL(`/api/v0/${operation}`, base);
    for (const [name, value] of Object.entries(args)) if (value !== undefined) url.searchParams.set(name, String(value));
    const response = await fetchImpl(url, { method: 'POST', ...(body ? { body } : {}), signal: AbortSignal.timeout(15_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) throw new Error(`Kubo ${operation}: ${bytes.toString('utf8').slice(0, 500)}`);
    return bytes;
  }
  return async function execute(name, args = {}) {
    if (!READS.has(name) && !WRITES.has(name)) return null;
    try {
      let result;
      if (name === 'ipfs_cat') {
        if (!isContentCid(args.cid)) throw new Error('ipfs_cat requires a valid content CID.');
        const bytes = await request('cat', { arg: args.cid, offset: args.offset, length: args.length });
        result = { cid: args.cid, bytes_base64: bytes.toString('base64'), size: bytes.length };
      } else if (name === 'ipfs_ls') {
        const value = args.path || args.cid;
        if (typeof value !== 'string' || (!value.startsWith('/ipfs/') && !/^[bQ][A-Za-z0-9]+$/.test(value))) throw new Error('ipfs_ls requires an IPFS path or CID.');
        result = JSON.parse((await request('ls', { arg: value })).toString('utf8'));
      } else if (name === 'ipfs_add') {
        if (typeof args.content !== 'string' || !args.content.length) throw new Error('ipfs_add requires nonempty content.');
        const content = Buffer.from(args.content, 'utf8');
        if (content.length > 1024 * 1024) throw new Error('ipfs_add exceeds the 1 MiB owner limit.');
        if (args.dry_run === true) {
          await request('id');
          result = { dry_run: true, validated: true, stored: false, planned_cid: cidForBytes(content), size: content.length };
        } else {
          const form = new FormData();
          form.append('file', new Blob([content]), 'content');
          const added = JSON.parse((await request('add', { 'cid-version': 1, 'raw-leaves': true }, form)).toString('utf8').trim().split('\n').at(-1));
          result = { cid: added.Hash, size: Number(added.Size), stored: true };
        }
      } else if (name === 'ipfs_pubsub_publish') {
        if (typeof args.topic !== 'string' || !args.topic || typeof args.content !== 'string' || !args.content) throw new Error('Pubsub requires a nonempty topic and content.');
        if (Buffer.byteLength(args.content) > 1024 * 1024) throw new Error('Pubsub message exceeds the 1 MiB owner limit.');
        if (args.dry_run === true) {
          await request('id');
          result = { dry_run: true, validated: true, published: false, mutation_performed: false, topic: args.topic, bytes: Buffer.byteLength(args.content) };
        } else {
          const form = new FormData();
          form.append('file', new Blob([args.content]), 'message');
          await request('pubsub/pub', { arg: args.topic }, form);
          result = { published: true, topic: args.topic, bytes: Buffer.byteLength(args.content) };
        }
      } else if (name === 'files_ls') {
        result = JSON.parse((await request('files/ls', { arg: mfsPath(args.path || '/'), long: true })).toString('utf8'));
      } else if (name === 'files_read') {
        const path = mfsPath(args.path);
        const bytes = await request('files/read', { arg: path });
        result = { path, content: bytes.toString('utf8'), bytes_base64: bytes.toString('base64'), size: bytes.length };
      } else if (name === 'files_write') {
        const path = mfsPath(args.path);
        if (typeof args.content !== 'string') throw new Error('files_write requires string content.');
        const content = Buffer.from(args.content, 'utf8');
        if (content.length > 1024 * 1024) throw new Error('files_write content exceeds the 1 MiB owner limit.');
        if (args.dry_run === true) {
          const parent = path.slice(0, path.lastIndexOf('/')) || '/';
          const stat = JSON.parse((await request('files/stat', { arg: parent })).toString('utf8'));
          if (stat.Type !== 'directory') throw new Error('files_write parent is not a directory.');
          result = { path, dry_run: true, validated: true, written: false, planned_bytes: content.length, parent_cid: stat.Hash };
        } else {
          const form = new FormData();
          form.append('file', new Blob([content]), 'content');
          await request('files/write', { arg: path, create: true, truncate: true }, form);
          const stat = JSON.parse((await request('files/stat', { arg: path })).toString('utf8'));
          result = { path, written: true, cid: stat.Hash, size: stat.Size };
        }
      } else {
        result = JSON.parse((await request(name === 'node_id' ? 'id' : 'swarm/peers')).toString('utf8'));
      }
      return { ok: true, result: { success: true, tool: name, backend: 'kubo', ...result } };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };
}

module.exports = { createKuboKitToolExecutor };
