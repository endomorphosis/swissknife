const { cidForBytes, isContentCid } = require('./mcpplusplus-profile-a.cjs');

/** Route the existing ipfs_cat tool through real, verified artifact storage.
 *
 * The unified Python registry can contain an ipfs_cat descriptor without a
 * callable. A stored artifact still has an executable read path. Reading it is
 * safe during dry_run; no successful response is synthesized without bytes.
 */
function createKitToolExecutor({ artifactStore, callKitWorker }) {
  return async function executeKitTool(name, args = {}) {
    if (name !== 'ipfs_cat') return callKitWorker(name, args);
    const cid = args?.cid;
    if (!isContentCid(cid)) {
      return { ok: false, error: 'ipfs_cat requires a valid content CID.' };
    }
    for (const field of ['offset', 'length']) {
      if (args[field] !== undefined && (!Number.isSafeInteger(args[field]) || args[field] < 0)) {
        return { ok: false, error: `ipfs_cat ${field} must be a nonnegative integer.` };
      }
    }
    let artifact;
    let unavailable;
    try {
      artifact = await artifactStore.getArtifact(cid);
    } catch (error) {
      unavailable = error instanceof Error ? error.message : String(error);
    }
    if (artifact?.found === true) {
      if (artifact.verified !== true || artifact.cid !== cid
          || !Buffer.isBuffer(artifact.bytes) || cidForBytes(artifact.bytes) !== cid) {
        return { ok: false, error: `ipfs_cat artifact ${cid} failed content verification.` };
      }
      const offset = args.offset ?? 0;
      const bytes = artifact.bytes.subarray(offset,
        args.length === undefined ? undefined : offset + args.length);
      return {
        ok: true,
        result: {
          found: true,
          verified: true,
          backend: artifact.backend,
          cid,
          bytes_base64: bytes.toString('base64'),
          size: bytes.length,
          full_size: artifact.bytes.length,
          ...(args.offset !== undefined || args.length !== undefined
            ? { range: { offset, length: bytes.length } } : {}),
          metadata: artifact.metadata ?? null,
        },
      };
    }
    // The block may live in the owner's native IPFS backend rather than this
    // artifact store. Preserve that genuine implementation and its failures.
    const reason = unavailable || artifact?.error || `Artifact ${cid} was not found.`;
    try {
      const native = await callKitWorker(name, args);
      if (native?.ok === true && native.result?.success !== false
          && native.result?.isError !== true && !native.result?.error) return native;
      return {
        ok: false,
        error: `${reason}; ${native?.error || native?.result?.error || 'native ipfs_cat failed'}`,
      };
    } catch (error) {
      return {
        ok: false,
        error: `${reason}; ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };
}

module.exports = { createKitToolExecutor };
