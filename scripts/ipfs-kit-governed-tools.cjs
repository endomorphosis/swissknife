'use strict';
const { cidForBytes, isContentCid } = require('./mcpplusplus-profile-a.cjs');
const { decodeBase64 } = require('./mcpplusplus-artifact-store.cjs');
const GOVERNED_TOOL_DEFINITIONS = require('../src/services/ipfs/mcp-ipfs-kit-governed-tools-manifest.json').tools;
const GOVERNED_TOOL_NAMES = GOVERNED_TOOL_DEFINITIONS.map(tool => tool.name);
function createGovernedKitExecutor({ persistArtifact, getArtifact, eventDag }) {
  return async (name, args = {}) => {
    if (!GOVERNED_TOOL_NAMES.includes(name) || name === 'ipfs_pubsub_publish') return null;
    try {
      let result;
      if (name === 'artifacts_put') {
        const bytes = decodeBase64(args.bytes_base64);
        if (!isContentCid(args.cid) || cidForBytes(bytes) !== args.cid) throw new Error('Artifact CID does not match the exact supplied bytes.');
        if (args.service && args.service !== 'ipfs_kit_py') throw new Error('Artifact service must be ipfs_kit_py.');
        if (args.dry_run === true) result = { validated: true, dry_run: true, persisted: false, mutation_performed: false, expected_cid: args.cid, bytes: bytes.length };
        else result = await persistArtifact(args);
      } else if (name === 'artifacts_get') {
        if (!isContentCid(args.cid)) throw new Error('A valid artifact CID is required.');
        result = await getArtifact(args.cid);
        if (result.found !== true || result.verified !== true) throw new Error(result.error || 'Artifact is absent or unverified.');
      } else if (name === 'dag_history') {
        if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 1000)) throw new Error('DAG history limit must be between 1 and 1000.');
        result = await eventDag.history(args.limit ?? 10);
      } else {
        const event = args.event;
        if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.event_type !== 'string' || !event.event_type) throw new Error('A structured event with event_type is required.');
        if (event.parents !== undefined && (!Array.isArray(event.parents) || event.parents.some(cid => !isContentCid(cid)))) throw new Error('Event parents must be valid CIDs.');
        if (args.dry_run === true) {
          const current = await eventDag.frontier();
          result = { validated: true, dry_run: true, appended: false, mutation_performed: false, event_type: event.event_type, current_frontier: current };
        } else result = await eventDag.record(event);
      }
      return { ok: true, result: { success: true, ...result } };
    } catch (error) { return { ok: false, error: error.message }; }
  };
}
module.exports = { GOVERNED_TOOL_NAMES, GOVERNED_TOOL_DEFINITIONS, createGovernedKitExecutor };
