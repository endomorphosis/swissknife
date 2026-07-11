const { cidForValue, isContentCid } = require('./mcpplusplus-profile-a.cjs');

const PROFILE_B_CAPABILITY = 'mcp++/cid-envelope';
const PROFILE_B_SCHEMA = 'mcp++/profile-b-execution@1';

class ProfileBRequestError extends Error {
  constructor(message) {
    super(message);
    this.code = -32602;
  }
}

function normalizeExecutionRequest(catalog, params = {}) {
  const interfaceCid = String(params.interface_cid ?? '');
  if (interfaceCid !== catalog.interface_cid || !isContentCid(interfaceCid)) {
    throw new ProfileBRequestError('mcp++/execute requires the service Profile A interface_cid.');
  }
  const tool = String(params.tool ?? params.name ?? '');
  const method = catalog.descriptor.methods.find(candidate => candidate.name === tool);
  if (!method) throw new ProfileBRequestError(`Unknown tool for Profile B execution: ${tool}`);
  const argumentsValue = params.arguments ?? params.input ?? {};
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new ProfileBRequestError('mcp++/execute arguments must be an object.');
  }
  const parents = Array.isArray(params.parents) ? params.parents : [];
  if (!parents.every(isContentCid)) throw new ProfileBRequestError('Profile B parents must be valid CIDs.');
  const timestamp = typeof params.timestamp === 'string' || typeof params.timestamp === 'number'
    ? params.timestamp
    : new Date().toISOString();
  const proofCid = params.proof_cid == null ? undefined : String(params.proof_cid);
  const policyCid = params.policy_cid == null ? undefined : String(params.policy_cid);
  if (proofCid && !isContentCid(proofCid)) throw new ProfileBRequestError('proof_cid must be a valid CID.');
  if (policyCid && !isContentCid(policyCid)) throw new ProfileBRequestError('policy_cid must be a valid CID.');
  const input = {
    schema: PROFILE_B_SCHEMA,
    interface_cid: interfaceCid,
    tool,
    arguments: argumentsValue,
  };
  const inputCid = cidForValue(input);
  const intent = {
    schema: PROFILE_B_SCHEMA,
    interface_cid: interfaceCid,
    tool,
    input_cid: inputCid,
    expected_output_schema_cid: method.output_schema_cid,
    policy_cid: policyCid ?? null,
    proof_cid: proofCid ?? null,
    parents,
    correlation_id: typeof params.correlation_id === 'string'
      ? params.correlation_id
      : `profile-b:${tool}`,
  };
  const intentCid = cidForValue(intent);
  const envelope = {
    interface_cid: interfaceCid,
    input_cid: inputCid,
    parents,
    timestamp,
    metadata: {
      schema: PROFILE_B_SCHEMA,
      intent_cid: intentCid,
      tool,
      expected_output_schema_cid: method.output_schema_cid,
      policy_cid: policyCid ?? null,
      proof_cid: proofCid ?? null,
      correlation_id: intent.correlation_id,
    },
  };
  return { tool, argumentsValue, input, intent, envelope, inputCid, intentCid };
}

async function executeProfileB({ catalog, params, invoke, artifactStore, authorize }) {
  const request = normalizeExecutionRequest(catalog, params);
  if (authorize) await authorize(request, params);
  const startedAt = Date.now();
  let output;
  let executionError = null;
  try {
    output = await invoke(request.tool, request.argumentsValue);
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
    output = { isError: true, error: executionError };
  }
  const success = executionError === null && output?.isError !== true;
  const envelopeCid = cidForValue(request.envelope);
  const outputCid = cidForValue(output);
  const receiptArtifact = {
    schema: PROFILE_B_SCHEMA,
    success,
    envelope_cid: envelopeCid,
    output_cid: outputCid,
    error: executionError,
    timestamp: request.envelope.timestamp,
  };
  const receiptCid = cidForValue(receiptArtifact);
  const event = {
    schema: PROFILE_B_SCHEMA,
    parents: request.envelope.parents,
    interface_cid: request.envelope.interface_cid,
    intent_cid: request.intentCid,
    envelope_cid: envelopeCid,
    output_cid: outputCid,
    receipt_cid: receiptCid,
    timestamp: request.envelope.timestamp,
  };
  const eventCid = cidForValue(event);
  let artifactPersistence = null;
  let persistenceError = null;
  if (artifactStore?.persistProfileB) {
    try {
      artifactPersistence = await artifactStore.persistProfileB({
        input: request.input,
        inputCid: request.inputCid,
        intent: request.intent,
        intentCid: request.intentCid,
        envelope: request.envelope,
        envelopeCid,
        output,
        outputCid,
        receiptArtifact,
        receiptCid,
        event,
        eventCid,
      });
    } catch (error) {
      persistenceError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    output,
    envelope: request.envelope,
    envelope_cid: envelopeCid,
    intent_cid: request.intentCid,
    input_cid: request.envelope.input_cid,
    output_cid: outputCid,
    event,
    event_cid: eventCid,
    receipt_artifact: receiptArtifact,
    artifact_persistence: artifactPersistence,
    receipt: {
      success,
      receipt_cid: receiptCid,
      output_cid: outputCid,
      envelope_cid: envelopeCid,
      error: executionError,
      duration_ms: Date.now() - startedAt,
      persistence_error: persistenceError,
    },
  };
}

function verifyProfileBResult(result) {
  const receipt = result?.receipt;
  if (!result || !receipt || !isContentCid(result.envelope_cid) || !isContentCid(result.input_cid)
    || !isContentCid(result.intent_cid) || !isContentCid(result.output_cid)
    || !isContentCid(result.event_cid) || !isContentCid(receipt.receipt_cid)) return false;
  return cidForValue(result.output) === result.output_cid
    && cidForValue(result.envelope) === result.envelope_cid
    && cidForValue(result.receipt_artifact) === receipt.receipt_cid
    && cidForValue(result.event) === result.event_cid
    && result.receipt_artifact?.envelope_cid === result.envelope_cid
    && result.receipt_artifact?.output_cid === result.output_cid
    && result.event?.receipt_cid === receipt.receipt_cid;
}

function verifyProfileBPersistence(result) {
  const persistence = result?.artifact_persistence;
  if (persistence?.profile !== 'B' || persistence?.complete !== true) return false;
  const artifacts = persistence.artifacts;
  const required = ['input', 'intent', 'envelope', 'output', 'receipt', 'event'];
  return required.every(kind => artifacts?.[kind]?.persisted === true && artifacts[kind].verified === true);
}

module.exports = {
  PROFILE_B_CAPABILITY,
  ProfileBRequestError,
  executeProfileB,
  verifyProfileBResult,
  verifyProfileBPersistence,
};
