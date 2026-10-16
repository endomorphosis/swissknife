/**
 * real-artifact.js — shared "no mocks" persistence helper for Swissknife apps.
 *
 * Persists a JSON-serializable record to the ipfs_kit_py artifact store
 * (POST /mcp/artifacts/put) with a canonical CIDv1-raw+sha2-256 computed over
 * the exact bytes sent, then verifies the store's own acknowledgement.
 * Appends scheduling/provenance events to the ipfs_kit_py event DAG
 * (POST /mcp/dag/append).
 *
 * Governance: every function here performs a backend-mutating POST. Callers
 * MUST obtain an explicit user confirmation (e.g. confirm()) BEFORE calling.
 * Backend failures are thrown with the backend's own message, never masked.
 */
import {
  getMCPPlusPlusDesktopClient,
  contentCidForBytes,
  stableStringifyValue,
  base64ForBytes,
} from '../core/mcp-plus-plus-desktop-client.js';

/**
 * Persist a record to ipfs_kit_py and return the verified CID.
 * @param {{ record: object, profile: string, kind: string }} args
 * @returns {{ cid: string, verified: boolean, backend: string }}
 */
export async function persistArtifactRecord({ record, profile, kind }) {
  const client = getMCPPlusPlusDesktopClient();
  const bytes = new TextEncoder().encode(stableStringifyValue(record));
  const cid = await contentCidForBytes(bytes);
  const result = await client.post('ipfs_kit_py', '/mcp/artifacts/put', {
    cid,
    bytes_base64: base64ForBytes(bytes),
    profile,
    kind,
    service: 'ipfs_kit_py',
    pin: true,
  });
  if (!result || result.persisted !== true || result.cid !== cid) {
    throw new Error(result?.error || 'ipfs_kit_py did not verify the persisted artifact.');
  }
  return { cid, verified: result.verified === true, backend: result.backend || 'ipfs_kit_py' };
}

/**
 * Append an event to the ipfs_kit_py event DAG (scheduling/provenance ledger).
 * @param {object} event — must include event_type
 * @returns {{ event_cid: string, status: string }}
 */
export async function appendDagEvent(event) {
  if (!event || typeof event.event_type !== 'string' || !event.event_type) {
    throw new Error('A DAG event requires an event_type.');
  }
  const client = getMCPPlusPlusDesktopClient();
  const appended = await client.post('ipfs_kit_py', '/mcp/dag/append', { event });
  if (!appended?.event_cid) {
    throw new Error(appended?.error || 'ipfs_kit_py event DAG did not return an event CID.');
  }
  return { event_cid: appended.event_cid, status: appended.status || 'recorded' };
}

/**
 * Explicit user confirmation gate for backend-mutating app writes.
 * Returns true only when the user confirms in the dialog.
 */
export function userConfirmsBackendWrite(message) {
  try {
    return globalThis.confirm
      ? globalThis.confirm(message)
      : false;
  } catch {
    return false;
  }
}

/**
 * Read back a persisted artifact (evidence authority for app reads).
 */
export async function fetchArtifactRecord(cid) {
  const client = getMCPPlusPlusDesktopClient();
  const artifact = await client.get('ipfs_kit_py', `/mcp/artifacts/${encodeURIComponent(cid)}`);
  if (!artifact || artifact.found !== true) {
    throw new Error(artifact?.error || `Artifact ${cid} was not found in ipfs_kit_py.`);
  }
  return artifact;
}
