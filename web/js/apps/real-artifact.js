"use strict";

// Persist and read artifacts with POST /mcp/tools/call.
// Receipt CID and event-DAG CID stay on the observation.

const MCP_TOOLS_CALL_PATH = "/mcp/tools/call";

let rpcSeq = 1;

function nextRpcId() {
  const id = rpcSeq;
  rpcSeq += 1;
  return id;
}

function unwrapToolPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  let result = Object.prototype.hasOwnProperty.call(payload, "result") ? payload.result : payload;
  if (!result || typeof result !== "object") {
    return {};
  }
  if (result.structuredContent && typeof result.structuredContent === "object") {
    result = Object.assign({}, result, result.structuredContent);
  }
  if (Array.isArray(result.content)) {
    for (let i = 0; i < result.content.length; i += 1) {
      const part = result.content[i];
      if (!part || part.type !== "text" || typeof part.text !== "string") {
        continue;
      }
      try {
        const parsed = JSON.parse(part.text);
        if (parsed && typeof parsed === "object") {
          result = Object.assign({}, result, parsed);
        }
      } catch (_err) {
        // Text parts are not always JSON.
      }
    }
  }
  return result;
}

function cidFrom(source, keys) {
  if (!source || typeof source !== "object") {
    return null;
  }
  for (let i = 0; i < keys.length; i += 1) {
    const value = source[keys[i]];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function pickReceiptCid(source) {
  const direct = cidFrom(source, ["receipt_cid", "receiptCid"]);
  if (direct) {
    return direct;
  }
  if (source && source.receipt && typeof source.receipt === "object") {
    const nested = cidFrom(source.receipt, ["cid", "receipt_cid", "receiptCid"]);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function pickEventDagCid(source) {
  const direct = cidFrom(source, ["event_dag_cid", "eventDagCid", "dag_cid"]);
  if (direct) {
    return direct;
  }
  if (source && source.event_dag && typeof source.event_dag === "object") {
    return cidFrom(source.event_dag, ["cid", "event_dag_cid", "eventDagCid"]);
  }
  if (source && source.eventDag && typeof source.eventDag === "object") {
    return cidFrom(source.eventDag, ["cid", "event_dag_cid", "eventDagCid"]);
  }
  return null;
}

function attachCids(observation, result) {
  const target = observation && typeof observation === "object" ? observation : {};
  const receiptCid = pickReceiptCid(result) || pickReceiptCid(target);
  const eventDagCid = pickEventDagCid(result) || pickEventDagCid(target);
  target.receipt_cid = receiptCid;
  target.receiptCid = receiptCid;
  target.event_dag_cid = eventDagCid;
  target.eventDagCid = eventDagCid;
  return target;
}

async function callMcpTool(name, args) {
  const response = await fetch(MCP_TOOLS_CALL_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextRpcId(),
      method: "tools/call",
      params: {
        name: name,
        arguments: args || {},
      },
    }),
  });
  if (!response.ok) {
    throw new Error("MCP tool " + name + " failed with status " + response.status);
  }
  const payload = await response.json();
  if (payload && payload.error) {
    const message = payload.error.message || "MCP tool error";
    throw new Error(message);
  }
  return unwrapToolPayload(payload);
}

async function persistArtifact(observation) {
  const current = observation && typeof observation === "object" ? observation : {};
  const stored = await callMcpTool("artifact_put", {
    observation: {
      receipt_cid: current.receipt_cid || current.receiptCid || null,
      event_dag_cid: current.event_dag_cid || current.eventDagCid || null,
      media_type: current.media_type || current.mediaType || "application/octet-stream",
      bytes: current.bytes !== undefined ? current.bytes : null,
      text: current.text !== undefined ? current.text : null,
      cid: current.cid || null,
    },
  });
  const withReceipt = attachCids(current, {
    receipt_cid: pickReceiptCid(stored) || pickReceiptCid(current),
    event_dag_cid: pickEventDagCid(stored) || pickEventDagCid(current),
  });
  const dag = await callMcpTool("event_dag_put", {
    receipt_cid: withReceipt.receipt_cid,
    event_dag_cid: withReceipt.event_dag_cid,
  });
  return attachCids(withReceipt, {
    receipt_cid: withReceipt.receipt_cid,
    event_dag_cid: pickEventDagCid(dag) || withReceipt.event_dag_cid,
  });
}

async function readArtifact(cidOrObservation) {
  const passed = cidOrObservation && typeof cidOrObservation === "object" ? cidOrObservation : null;
  const cid = typeof cidOrObservation === "string"
    ? cidOrObservation
    : (passed && (passed.receipt_cid || passed.receiptCid || passed.cid)) || null;
  const loaded = await callMcpTool("artifact_get", {
    cid: cid,
    receipt_cid: (passed && (passed.receipt_cid || passed.receiptCid)) || cid,
    event_dag_cid: (passed && (passed.event_dag_cid || passed.eventDagCid)) || null,
  });
  const observation = passed || {};
  const nested = loaded.observation && typeof loaded.observation === "object" ? loaded.observation : null;
  const copyKeys = ["bytes", "text", "media_type", "mediaType", "cid", "body"];
  for (let i = 0; i < copyKeys.length; i += 1) {
    const key = copyKeys[i];
    if (loaded[key] !== undefined && observation[key] === undefined) {
      observation[key] = loaded[key];
    }
    if (nested && nested[key] !== undefined && observation[key] === undefined) {
      observation[key] = nested[key];
    }
  }
  if (!observation.cid && cid) {
    observation.cid = cid;
  }
  return attachCids(observation, {
    receipt_cid: pickReceiptCid(loaded) || pickReceiptCid(nested) || pickReceiptCid(observation) || cid,
    event_dag_cid: pickEventDagCid(loaded) || pickEventDagCid(nested) || pickEventDagCid(observation),
  });
}

function userConfirmsBackendWrite(message) {
  if (globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ === true) return false;
  if (typeof globalThis.confirm !== "function") return false;
  return globalThis.confirm(String(message || "Write this record to the backend?"));
}

const realArtifact = {
  persistArtifact: persistArtifact,
  readArtifact: readArtifact,
  persist: persistArtifact,
  read: readArtifact,
  callMcpTool: callMcpTool,
  userConfirmsBackendWrite: userConfirmsBackendWrite,
};

export { persistArtifact, readArtifact, callMcpTool, userConfirmsBackendWrite };

globalThis.realArtifact = realArtifact;
globalThis.persistArtifact = persistArtifact;
globalThis.readArtifact = readArtifact;

if (typeof module !== "undefined" && module.exports) {
  module.exports = realArtifact;
}
