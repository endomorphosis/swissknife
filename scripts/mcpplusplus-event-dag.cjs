const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { cidForValue } = require('./mcpplusplus-profile-a.cjs');

const PROFILE_F_CAPABILITY = 'mcp++/event-dag';
const PROFILE_F_NAME = 'Profile F: Event DAG Provenance, Archival, and Compaction';
const STATE_VERSION = 1;
const DEFAULT_HOT_EVENT_MAX = 2000;
const DEFAULT_EPOCH_SIZE = 1000;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function asCount(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function normaliseEvent(event) {
  if (!event || typeof event !== 'object') throw new TypeError('Event DAG append requires an event object.');
  const parents = Array.isArray(event.parents)
    ? event.parents.filter(parent => typeof parent === 'string' && parent)
    : [];
  const payload = { ...event, parents };
  const eventCid = typeof event.event_cid === 'string' && event.event_cid
    ? event.event_cid
    : cidForValue(payload);
  return {
    ...payload,
    event_cid: eventCid,
    event_type: typeof event.event_type === 'string' ? event.event_type : 'execution',
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
}

function buildMerkleTree(eventCids) {
  if (eventCids.length === 0) return { root: sha256('empty'), layers: [[]] };
  let current = eventCids.map(cid => sha256(cid));
  const layers = [current];
  while (current.length > 1) {
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] ?? left;
      next.push(sha256(`${left}${right}`));
    }
    current = next;
    layers.push(current);
  }
  return { root: current[0], layers };
}

function merkleProof(eventCid, eventCids, layers) {
  const initialIndex = eventCids.indexOf(eventCid);
  if (initialIndex < 0) return [];
  let index = initialIndex;
  const proof = [];
  for (const layer of layers.slice(0, -1)) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : Math.min(index + 1, layer.length - 1);
    proof.push({ side: isRight ? 'left' : 'right', hash: layer[siblingIndex] });
    index = Math.floor(index / 2);
  }
  return proof;
}

function verifyMerkleProof(eventCid, proof, expectedRoot) {
  let current = sha256(eventCid);
  for (const step of proof ?? []) {
    current = step?.side === 'left'
      ? sha256(`${step.hash}${current}`)
      : sha256(`${current}${step?.hash ?? ''}`);
  }
  return current === expectedRoot;
}

class EventDagService {
  constructor(service, options = {}) {
    this.service = service;
    this.hotEventMax = asCount(options.hotEventMax ?? process.env.MCPPLUSPLUS_DAG_HOT_MAX, DEFAULT_HOT_EVENT_MAX, 1);
    this.epochSize = asCount(options.epochSize ?? process.env.MCPPLUSPLUS_DAG_EPOCH_SIZE, DEFAULT_EPOCH_SIZE, 1);
    const root = options.rootDir
      ?? process.env.MCPPLUSPLUS_EVENT_DAG_DIR
      ?? path.join(os.homedir(), '.cache', 'swissknife', 'mcpplusplus-event-dag');
    this.rootDir = path.join(root, service);
    this.archiveDir = path.join(this.rootDir, 'archives');
    this.statePath = path.join(this.rootDir, 'state.json');
    fs.mkdirSync(this.archiveDir, { recursive: true });
    this.state = this.loadState();
  }

  loadState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      if (parsed?.version === STATE_VERSION && parsed?.service === this.service) {
        return {
          version: STATE_VERSION,
          service: this.service,
          hot_events: parsed.hot_events && typeof parsed.hot_events === 'object' ? parsed.hot_events : {},
          archives: parsed.archives && typeof parsed.archives === 'object' ? parsed.archives : {},
          certificates: parsed.certificates && typeof parsed.certificates === 'object' ? parsed.certificates : {},
          event_index: parsed.event_index && typeof parsed.event_index === 'object' ? parsed.event_index : {},
        };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return {
      version: STATE_VERSION,
      service: this.service,
      hot_events: {},
      archives: {},
      certificates: {},
      event_index: {},
    };
  }

  save() {
    const tempPath = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${canonicalJson(this.state)}\n`);
    fs.renameSync(tempPath, this.statePath);
  }

  archivePath(archiveCid) {
    return path.join(this.archiveDir, `${archiveCid}.json`);
  }

  writeArchive(archiveCid, archive) {
    const target = this.archivePath(archiveCid);
    const tempPath = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${canonicalJson(archive)}\n`);
    fs.renameSync(tempPath, target);
  }

  readArchive(archiveCid) {
    const metadata = this.state.archives[archiveCid];
    if (!metadata) return null;
    try {
      return JSON.parse(fs.readFileSync(this.archivePath(archiveCid), 'utf8'));
    } catch (error) {
      return { ...metadata, unavailable: true, error: error instanceof Error ? error.message : String(error) };
    }
  }

  profile() {
    return {
      capability: PROFILE_F_CAPABILITY,
      profile_name: PROFILE_F_NAME,
      retention: {
        hot_event_max: this.hotEventMax,
        epoch_size: this.epochSize,
        archive_format: 'mcp++/event-dag-archive@1',
      },
      certificate_policy: {
        default_proof_system: 'hash-commitment-v1',
        zero_knowledge: false,
        note: 'A hash commitment proves archive integrity, not zero knowledge. A verifier-backed proof system is required before zero_knowledge can be true.',
      },
    };
  }

  record(event) {
    const normalised = normaliseEvent(event);
    if (this.state.hot_events[normalised.event_cid]) {
      return { event_cid: normalised.event_cid, status: 'already_hot', profile: this.profile() };
    }
    if (this.state.event_index[normalised.event_cid]) {
      return { event_cid: normalised.event_cid, status: 'already_archived', profile: this.profile() };
    }
    this.state.hot_events[normalised.event_cid] = normalised;
    this.save();
    let compaction = null;
    if (Object.keys(this.state.hot_events).length > this.hotEventMax) {
      compaction = this.compact({ max_events: this.epochSize, retain_recent: this.hotEventMax - this.epochSize });
    }
    return { event_cid: normalised.event_cid, status: 'recorded', profile: this.profile(), compaction };
  }

  history(limit = 50) {
    const count = asCount(limit, 50, 1);
    const events = Object.values(this.state.hot_events)
      .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)))
      .slice(0, count);
    return {
      events,
      count: Object.keys(this.state.hot_events).length,
      archived_count: Object.keys(this.state.event_index).length,
      profile: this.profile(),
    };
  }

  frontier() {
    const events = Object.values(this.state.hot_events);
    const parents = new Set(events.flatMap(event => event.parents ?? []));
    const hot = events.filter(event => !parents.has(event.event_cid)).map(event => event.event_cid);
    if (hot.length > 0) return { frontier: hot, source: 'hot', profile: this.profile() };
    const certificates = Object.values(this.state.certificates)
      .sort((left, right) => Number(right.epoch_id) - Number(left.epoch_id));
    return {
      frontier: certificates[0]?.frontier_cids ?? [],
      source: certificates.length ? 'archive' : 'empty',
      profile: this.profile(),
    };
  }

  provenance(eventCid, limit = 100) {
    const boundedLimit = asCount(limit, 100, 1);
    const chain = [];
    const seen = new Set();
    const queue = [eventCid];
    const archiveBoundaries = [];
    while (queue.length > 0 && chain.length < boundedLimit) {
      const cid = queue.shift();
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const hot = this.state.hot_events[cid];
      if (hot) {
        chain.push(hot);
        queue.push(...(hot.parents ?? []));
        continue;
      }
      const index = this.state.event_index[cid];
      if (index) {
        archiveBoundaries.push({ event_cid: cid, archive_cid: index.archive_cid, certificate_cid: index.certificate_cid });
      }
    }
    return {
      chain,
      archive_boundaries: archiveBoundaries,
      truncated: queue.length > 0,
      traversal_limit: boundedLimit,
      profile: this.profile(),
    };
  }

  compact(options = {}) {
    const entries = Object.entries(this.state.hot_events)
      .sort(([, left], [, right]) => String(left.timestamp).localeCompare(String(right.timestamp)));
    const retainRecent = asCount(options.retain_recent, Math.max(0, this.hotEventMax - this.epochSize), 0);
    const eligibleCount = Math.max(0, entries.length - retainRecent);
    const requestedCount = asCount(options.max_events, this.epochSize, 1);
    const selected = entries.slice(0, Math.min(eligibleCount, requestedCount));
    if (selected.length === 0) {
      return { compacted: false, reason: 'no_eligible_hot_events', hot_event_count: entries.length, profile: this.profile() };
    }
    const eventCids = selected.map(([cid]) => cid);
    const selectedSet = new Set(eventCids);
    const events = selected.map(([, event]) => event);
    const allHot = Object.values(this.state.hot_events);
    const frontierCids = events.filter(event => !allHot.some(candidate => (candidate.parents ?? []).includes(event.event_cid) && selectedSet.has(candidate.event_cid))).map(event => event.event_cid);
    const rootCids = events.filter(event => !(event.parents ?? []).some(parent => selectedSet.has(parent))).map(event => event.event_cid);
    const { root: merkleRoot, layers } = buildMerkleTree(eventCids);
    const epochId = Object.keys(this.state.certificates).length;
    const archiveBody = {
      schema: 'mcp++/event-dag-archive@1',
      service: this.service,
      epoch_id: epochId,
      merkle_root: merkleRoot,
      event_cids: eventCids,
      events,
      merkle_layers: layers,
      timestamp_start: events[0]?.timestamp ?? null,
      timestamp_end: events.at(-1)?.timestamp ?? null,
    };
    const archiveCid = cidForValue(archiveBody);
    const certificateBasis = {
      schema: 'mcp++/event-dag-compaction-certificate@1',
      profile: PROFILE_F_CAPABILITY,
      profile_name: PROFILE_F_NAME,
      service: this.service,
      archive_cid: archiveCid,
      merkle_root: merkleRoot,
      epoch_id: epochId,
      event_count: eventCids.length,
      root_cids: rootCids,
      frontier_cids: frontierCids,
      proof_system: 'hash-commitment-v1',
      zero_knowledge: false,
    };
    const certificateCid = cidForValue(certificateBasis);
    const certificate = {
      ...certificateBasis,
      certificate_cid: certificateCid,
      proof: sha256(canonicalJson(certificateBasis)),
      created_at: new Date().toISOString(),
      archive_available: true,
    };
    this.writeArchive(archiveCid, archiveBody);
    this.state.archives[archiveCid] = {
      archive_cid: archiveCid,
      certificate_cid: certificateCid,
      epoch_id: epochId,
      merkle_root: merkleRoot,
      event_count: eventCids.length,
      root_cids: rootCids,
      frontier_cids: frontierCids,
      archive_path: this.archivePath(archiveCid),
    };
    this.state.certificates[certificateCid] = certificate;
    for (const cid of eventCids) {
      delete this.state.hot_events[cid];
      this.state.event_index[cid] = { archive_cid: archiveCid, certificate_cid: certificateCid };
    }
    this.save();
    return { compacted: true, archive_cid: archiveCid, certificate, compacted_cids: eventCids, profile: this.profile() };
  }

  archives() {
    return { archives: Object.values(this.state.archives), profile: this.profile() };
  }

  certificate(certificateCid) {
    const certificate = this.state.certificates[certificateCid];
    return certificate ? { certificate, profile: this.profile() } : null;
  }

  inclusion(eventCid) {
    const index = this.state.event_index[eventCid];
    if (!index) return null;
    const archive = this.readArchive(index.archive_cid);
    const certificate = this.state.certificates[index.certificate_cid];
    if (!archive || !certificate || archive.unavailable) return null;
    return {
      event_cid: eventCid,
      archive_cid: index.archive_cid,
      certificate_cid: index.certificate_cid,
      merkle_root: certificate.merkle_root,
      proof: merkleProof(eventCid, archive.event_cids, archive.merkle_layers),
      profile: this.profile(),
    };
  }

  verify(certificateInput) {
    const certificateCid = typeof certificateInput === 'string'
      ? certificateInput
      : certificateInput?.certificate_cid;
    const certificate = this.state.certificates[certificateCid];
    if (!certificate) return { valid: false, reason: 'certificate_not_found', profile: this.profile() };
    const archive = this.readArchive(certificate.archive_cid);
    if (!archive || archive.unavailable) return { valid: false, reason: 'archive_unavailable', certificate, profile: this.profile() };
    const { root } = buildMerkleTree(archive.event_cids ?? []);
    const basis = {
      schema: certificate.schema,
      profile: certificate.profile,
      profile_name: certificate.profile_name,
      service: certificate.service,
      archive_cid: certificate.archive_cid,
      merkle_root: certificate.merkle_root,
      epoch_id: certificate.epoch_id,
      event_count: certificate.event_count,
      root_cids: certificate.root_cids,
      frontier_cids: certificate.frontier_cids,
      proof_system: certificate.proof_system,
      zero_knowledge: certificate.zero_knowledge,
    };
    const valid = root === certificate.merkle_root
      && archive.event_cids.length === certificate.event_count
      && certificate.proof === sha256(canonicalJson(basis));
    return {
      valid,
      certificate,
      proof_system: certificate.proof_system,
      zero_knowledge: certificate.zero_knowledge,
      profile: this.profile(),
    };
  }
}

const services = new Map();

function getEventDagService(service, options) {
  if (!services.has(service)) services.set(service, new EventDagService(service, options));
  return services.get(service);
}

module.exports = {
  PROFILE_F_CAPABILITY,
  PROFILE_F_NAME,
  EventDagService,
  getEventDagService,
  buildMerkleTree,
  merkleProof,
  verifyMerkleProof,
};
