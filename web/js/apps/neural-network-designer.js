/**
 * Neural Network Designer App for SwissKnife Web Desktop
 * Visual interface for designing and configuring neural networks with IPFS model versioning
 */

// SWR-042 / SWR-036-FU-005: the local IPFS Accelerate backend is a
// global-only capability. See `web/js/core/ipfs-accelerate-global-adapter.js`
// for why this app no longer dynamically imports raw
// `ipfs_accelerate_js/src` source.
import { loadLocalIPFSAccelerateClass } from '../core/ipfs-accelerate-global-adapter.js';
import {
  getMCPPlusPlusDesktopClient,
  contentCidForBytes,
  stableStringifyValue,
  base64ForBytes,
} from '../core/mcp-plus-plus-desktop-client.js';

const VDA_G031_WORKFLOW = 'neural-network-designer.design-compile-train';
const VDA_G031_ID = 'VDA-G031';
const GRAPH_SCHEMA = 'swissknife.neural-network-designer.graph.v1';

// GUI calls use POST /mcp/tools/call. Model and training reads use read_status.
// Writes use request_action and stay behind explicit confirmation.
const MCP_TOOLS_CALL_PATH = '/mcp/tools/call';

async function parseDesignerToolResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (_parseError) {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? (payload.error?.message || payload.error || payload.message || raw)
      : (raw || ('HTTP ' + response.status));
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (payload && typeof payload === 'object' && payload.error) {
    const message = payload.error.message || payload.error;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'result')) {
    return payload.result;
  }
  return payload;
}

function callDesignerMcpTool(method, tool, toolArguments) {
  return fetch(MCP_TOOLS_CALL_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method,
      tool,
      arguments: toolArguments,
    }),
  }).then(parseDesignerToolResponse);
}

export class NeuralNetworkDesignerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    
    // Application state
    this.networkConfig = {
      layers: [],
      connections: [],
      metadata: {
        name: 'Untitled Network',
        description: '',
        version: '1.0.0',
        author: '',
        created: new Date().toISOString()
      }
    };
    
    this.selectedLayer = null;
    this.draggedLayer = null;
    this.connectionMode = false;
    this.p2pSystem = null;
    this.ipfsStorage = null;
    // Live workflow state. The canvas is a genuinely local design surface;
    // every CID, validation result, and job outcome below is produced by a
    // real computation or a real backend call — nothing is prefabricated.
    this.designArtifacts = {
      graphCid: null,
      graphPersistedCid: null,
      graphVerified: false,
      validation: null,
      validationCid: null,
      plan: null,
      planCid: null,
      planPersistedCid: null,
      invalidEdges: [],
      inference: null,
      versions: this.loadVersionIndex(),
      pendingConfirm: null,
      backendStatus: 'Nothing has been persisted to the backend yet.',
      actions: [],
      trainingAvailable: false,
    };
    // Real undo/redo stacks of network snapshots (local).
    this.history = { past: [], future: [] };
    this.mcpClient = null;

    // Layer types with configurations
    this.layerTypes = {
      input: { 
        name: 'Input Layer', 
        icon: '📥', 
        color: '#4CAF50',
        params: ['inputSize', 'inputType']
      },
      dense: { 
        name: 'Dense/Linear', 
        icon: '🔗', 
        color: '#2196F3',
        params: ['units', 'activation', 'dropout']
      },
      conv2d: { 
        name: 'Conv2D', 
        icon: '🔲', 
        color: '#FF9800',
        params: ['filters', 'kernelSize', 'strides', 'padding', 'activation']
      },
      maxpool: { 
        name: 'MaxPool2D', 
        icon: '⬇️', 
        color: '#9C27B0',
        params: ['poolSize', 'strides']
      },
      dropout: { 
        name: 'Dropout', 
        icon: '🎯', 
        color: '#F44336',
        params: ['rate']
      },
      batchnorm: { 
        name: 'BatchNorm', 
        icon: '📊', 
        color: '#607D8B',
        params: ['momentum', 'epsilon']
      },
      attention: { 
        name: 'Attention', 
        icon: '👁️', 
        color: '#E91E63',
        params: ['numHeads', 'keyDim', 'dropout']
      },
      transformer: { 
        name: 'Transformer', 
        icon: '🔄', 
        color: '#3F51B5',
        params: ['numHeads', 'dModel', 'dff', 'dropout']
      },
      output: { 
        name: 'Output Layer', 
        icon: '📤', 
        color: '#795548',
        params: ['outputSize', 'activation']
      }
    };
  }

  async initialize() {
    try {
      console.log('🧠 Initializing Neural Network Designer with ML backend...');
      
      this.swissknife = this.desktop.swissknife;
      
      // Initialize ML backend capabilities
      await this.initializeMLBackend();
      
      // Initialize P2P system for distributed training
      await this.initializeP2PSystem();
      
      // Add styles and UI components
      this.addStyles();
      
      console.log('✅ Neural Network Designer with ML backend initialized');
    } catch (error) {
      console.error('❌ Neural Network Designer integration error:', error);
    }
  }

  async initializeMLBackend() {
    console.log('🧠 Initializing Neural Network Designer backends...');
    try {
      this.swissknife = this.desktop.swissknife;
    } catch {
      this.swissknife = null;
    }

    // Optional host-provided local IPFS Accelerate class (global-only
    // capability — the browser bundle never fetches it on its own).
    try {
      const IPFSAccelerate = loadLocalIPFSAccelerateClass();
      if (IPFSAccelerate) {
        this.ipfsAccelerate = new IPFSAccelerate({ backend: 'webgl', p2p: true, storage: 'ipfs' });
        await this.ipfsAccelerate.initialize();
        this.backendType = 'ipfs-accelerate-local';
        console.log('✅ Host-provided local IPFS Accelerate initialized');
      }
    } catch (error) {
      console.log('⚠️ Host IPFS Accelerate unavailable:', error.message);
      this.ipfsAccelerate = null;
    }

    // TensorFlow.js is real local compute only when the host page genuinely
    // loaded it; otherwise there is no local training engine.
    if (typeof tf !== 'undefined' && tf?.ready) {
      try {
        await tf.ready();
        this.tfjs = tf;
        this.mlBackendMode = 'tensorflow-local';
        console.log('✅ TensorFlow.js available for local compute');
      } catch (error) {
        console.log('⚠️ TensorFlow.js failed to become ready:', error.message);
        this.mlBackendMode = 'none';
      }
    } else {
      this.mlBackendMode = 'none';
    }

    // Execution goes through the real ipfs_accelerate_py descriptor, which
    // exposes inference jobs — not training. There is no simulated training
    // backend anywhere in this app. Training availability is a read_status read.
    this.designArtifacts.trainingAvailable = false;
    try {
      const training = await this.readTrainingStatus({ task: 'training' });
      this.designArtifacts.trainingAvailable = training?.available === true || training?.training_available === true;
    } catch (_trainingError) {
      this.designArtifacts.trainingAvailable = false;
    }
    this.designArtifacts.backendStatus = this.mlBackendMode === 'tensorflow-local'
      ? 'Local TensorFlow.js is available for browser-local compute. Model execution runs through the real ipfs_accelerate_py inference job queue.'
      : 'No local ML engine is loaded. Model execution runs through the real ipfs_accelerate_py inference job queue; training is not exposed by that backend.';

    await this.initializeIPFSStorage();
    console.log('✅ Neural Network Designer backends initialized');
  }

  mcp() {
    if (!this.mcpClient) this.mcpClient = getMCPPlusPlusDesktopClient();
    return this.mcpClient;
  }

  // Model catalog read. IDL method is read_status on POST /mcp/tools/call.
  readModelStatus(input) {
    return callDesignerMcpTool('read_status', 'mcp++:ipfs_accelerate_py/list_models', input || {});
  }

  // Training status read. IDL method is read_status on POST /mcp/tools/call.
  readTrainingStatus(input) {
    return callDesignerMcpTool('read_status', 'mcp++:ipfs_accelerate_py/job_status', input || { task: 'training' });
  }

  // Real content addressing: CIDv1-raw+sha2-256 over the canonical bytes,
  // the same semantics the kit artifact store verifies on ingest.
  async realContentCid(record) {
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    return contentCidForBytes(bytes);
  }

  // Backend-mutating write. Callers must have collected an explicit user
  // confirmation first; backend failures surface verbatim and are never
  // replaced with simulated success.
  async persistArtifact(record, kind) {
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    const cid = await contentCidForBytes(bytes);
    const res = await callDesignerMcpTool('request_action', 'mcp++:ipfs_kit_py/artifacts/put', {
      cid,
      bytes_base64: base64ForBytes(bytes),
      profile: 'neural-designer-artifact',
      kind,
      service: 'ipfs_kit_py',
      pin: true,
    });
    if (!res || res.persisted !== true || res.cid !== cid) {
      throw new Error(res?.error || 'ipfs_kit_py did not verify the persisted artifact.');
    }
    return { cid, response: res };
  }

  async retrieveArtifact(cid) {
    const artifact = await callDesignerMcpTool('read_status', 'mcp++:ipfs_kit_py/artifacts/get', { cid });
    if (!artifact || artifact.found !== true) {
      throw new Error(artifact?.error || `Artifact ${cid} was not found in ipfs_kit_py.`);
    }
    const bytes = Uint8Array.from(atob(artifact.bytes_base64), character => character.charCodeAt(0));
    return { record: JSON.parse(new TextDecoder().decode(bytes)), verified: artifact.verified === true };
  }

  // ---- Real graph / validation / plan / inference workflow ----
  // The canvas is a genuinely local design surface. Every CID below is
  // real content addressing over the exact bytes; every validation result
  // is computed from the current graph; inference runs as a real
  // ipfs_accelerate_py descriptor job. Nothing is prefabricated.

  recordWorkflowAction(action, detail) {
    const entry = { action, detail, at: new Date().toISOString() };
    this.designArtifacts.actions = [entry, ...this.designArtifacts.actions].slice(0, 12);
    this.updateWorkflowPanel();
  }

  graphDocument() {
    return {
      schema: GRAPH_SCHEMA,
      app_id: 'neural-network-designer',
      workflow_id: VDA_G031_WORKFLOW,
      metadata: { ...this.networkConfig.metadata, exported_at: new Date().toISOString() },
      layers: this.networkConfig.layers.map(layer => ({
        id: layer.id, type: layer.type, name: layer.name, x: layer.x, y: layer.y, params: layer.params,
      })),
      connections: this.networkConfig.connections.map(connection => ({
        id: connection.id, from: connection.from, to: connection.to,
      })),
    };
  }

  // Real parameter arithmetic from the layer configs (local computation).
  calculateParameters(layers) {
    let totalParams = 0;
    let prevSize = null;
    layers.forEach(layer => {
      if (layer.type === 'input') {
        prevSize = Number(layer.params.inputSize) || null;
      } else if (layer.type === 'dense' && prevSize) {
        const units = Number(layer.params.units) || 128;
        totalParams += (prevSize * units) + units; // weights + biases
        prevSize = units;
      } else if (layer.type === 'conv2d' && prevSize) {
        const filters = Number(layer.params.filters) || 32;
        const kernelSize = Number(layer.params.kernelSize) || 3;
        totalParams += (kernelSize * kernelSize * prevSize * filters) + filters;
        prevSize = filters;
      }
    });
    return totalParams;
  }

  // Builds the graph artifact from the REAL current canvas and assigns its
  // real content CID. Local computation; nothing is persisted yet.
  async buildGraphArtifact() {
    const graphDoc = this.graphDocument();
    const cid = await this.realContentCid(graphDoc);
    this.designArtifacts.graphCid = cid;
    this.designArtifacts.graphVerified = false;
    this.recordWorkflowAction('build-graph-artifact', `${graphDoc.layers.length} layers, ${graphDoc.connections.length} edges -> ${cid}`);
    return { graphDoc, cid };
  }

  async requestGraphPersist() {
    const { graphDoc, cid } = await this.buildGraphArtifact();
    const bytes = new TextEncoder().encode(stableStringifyValue(graphDoc));
    this.designArtifacts.pendingConfirm = {
      action: 'persist-graph', record: graphDoc, bytes: bytes.length, expectedCid: cid,
    };
    this.designArtifacts.backendStatus = `Graph artifact ready (${graphDoc.layers.length} layers, CID ${cid}). Confirm to persist it to the kit backend.`;
    this.updateWorkflowPanel();
  }

  async verifyGraphArtifact() {
    const cid = this.designArtifacts.graphPersistedCid;
    if (!cid) {
      this.designArtifacts.backendStatus = 'No graph artifact has been persisted yet.';
      this.updateWorkflowPanel();
      return;
    }
    try {
      const { record, verified } = await this.retrieveArtifact(cid);
      const roundTripCid = await this.realContentCid(record);
      this.designArtifacts.graphVerified = verified && roundTripCid === cid;
      this.designArtifacts.backendStatus = `Retrieved ${cid} from ipfs_kit_py (store-verified: ${verified}, CID round-trip: ${roundTripCid === cid}).`;
      this.recordWorkflowAction('verify-graph-artifact', `${cid} verified=${this.designArtifacts.graphVerified}`);
    } catch (error) {
      this.designArtifacts.backendStatus = `Graph artifact retrieval failed: ${error.message}`;
      this.recordWorkflowAction('verify-graph-artifact', `failed: ${error.message}`);
    }
    this.updateWorkflowPanel();
  }

  // Real local validation of the current graph: layer presence, edge
  // references, self-loops, and acyclicity.
  async validateDataContract() {
    const layers = this.networkConfig.layers;
    const connections = this.networkConfig.connections;
    const errors = [];
    const byId = new Map(layers.map(layer => [layer.id, layer]));
    if (layers.length === 0) errors.push('The graph has no layers.');
    if (!layers.some(layer => layer.type === 'input')) errors.push('No input layer present.');
    if (!layers.some(layer => layer.type === 'output')) errors.push('No output layer present.');
    for (const connection of connections) {
      if (!byId.has(connection.from)) errors.push(`Edge ${connection.id} references missing layer ${connection.from}.`);
      if (!byId.has(connection.to)) errors.push(`Edge ${connection.id} references missing layer ${connection.to}.`);
      if (connection.from === connection.to) errors.push(`Edge ${connection.id} is a self-loop.`);
    }
    const cycleEdges = this.findCycleEdges(layers, connections);
    if (cycleEdges.size > 0) errors.push(`Cycle detected involving edge(s): ${[...cycleEdges].join(', ')}.`);
    const validation = {
      schema: 'swissknife.neural-network-designer.validation.v1',
      status: errors.length === 0 ? 'valid' : 'invalid',
      errors,
      layer_count: layers.length,
      edge_count: connections.length,
      checked_at: new Date().toISOString(),
    };
    this.designArtifacts.validation = validation;
    this.designArtifacts.validationCid = await this.realContentCid(validation);
    this.recordWorkflowAction('validate-data-contract', `${validation.status}: ${errors.length} error(s), CID ${this.designArtifacts.validationCid}`);
    return validation;
  }

  // Returns the ids of edges that participate in a directed cycle.
  findCycleEdges(layers, connections) {
    const byId = new Map(layers.map(layer => [layer.id, layer]));
    const adjacency = new Map();
    for (const connection of connections) {
      if (!byId.has(connection.from) || !byId.has(connection.to) || connection.from === connection.to) continue;
      if (!adjacency.has(connection.from)) adjacency.set(connection.from, []);
      adjacency.get(connection.from).push(connection);
    }
    const state = new Map();
    const cycleEdges = new Set();
    const stack = [];
    const visit = nodeId => {
      state.set(nodeId, 1);
      for (const edge of adjacency.get(nodeId) || []) {
        const targetState = state.get(edge.to) || 0;
        if (targetState === 1) {
          cycleEdges.add(edge.id);
          for (let i = stack.length - 1; i >= 0; i -= 1) {
            cycleEdges.add(stack[i].id);
            if (stack[i].from === edge.to) break;
          }
        } else if (targetState === 0) {
          stack.push(edge);
          visit(edge.to);
          stack.pop();
        }
      }
      state.set(nodeId, 2);
    };
    for (const layer of layers) {
      if (!state.get(layer.id)) visit(layer.id);
    }
    return cycleEdges;
  }

  // Real invalid-edge detection on the user's graph: dangling references,
  // self-loops, and cycle members — not a canned example.
  detectInvalidEdges() {
    const layers = this.networkConfig.layers;
    const connections = this.networkConfig.connections;
    const byId = new Map(layers.map(layer => [layer.id, layer]));
    const cycleEdges = this.findCycleEdges(layers, connections);
    const invalid = [];
    for (const connection of connections) {
      if (!byId.has(connection.from) || !byId.has(connection.to)) {
        invalid.push({ edge: connection.id, from: connection.from, to: connection.to, reason: 'References a layer that does not exist.' });
      } else if (connection.from === connection.to) {
        invalid.push({ edge: connection.id, from: connection.from, to: connection.to, reason: 'Self-loop: a layer cannot feed itself.' });
      } else if (cycleEdges.has(connection.id)) {
        invalid.push({ edge: connection.id, from: connection.from, to: connection.to, reason: 'Participates in a directed cycle; feed-forward graphs must be acyclic.' });
      }
    }
    this.designArtifacts.invalidEdges = invalid;
    this.recordWorkflowAction('detect-invalid-edges', `${invalid.length} invalid edge(s) of ${connections.length} total`);
    return invalid;
  }

  // Real compile plan document derived from the current graph (local).
  async buildCompilePlan() {
    const parameters = this.calculateParameters(this.networkConfig.layers);
    const plan = {
      schema: 'swissknife.neural-network-designer.compile-plan.v1',
      graph_cid: this.designArtifacts.graphCid,
      optimizer: 'adam',
      learning_rate: 0.001,
      epochs: 12,
      batch_size: 32,
      parameters,
      estimated_memory_mb: Math.max(1, Math.round((parameters * 4) / (1024 * 1024))),
      backend: 'ipfs_accelerate_py (inference jobs only; no training operation is exposed)',
      planned_at: new Date().toISOString(),
    };
    this.designArtifacts.plan = plan;
    this.designArtifacts.planCid = await this.realContentCid(plan);
    this.recordWorkflowAction('build-compile-plan', `${parameters.toLocaleString()} parameters, CID ${this.designArtifacts.planCid}`);
    return plan;
  }

  async requestPlanPersist() {
    const plan = await this.buildCompilePlan();
    const bytes = new TextEncoder().encode(stableStringifyValue(plan));
    this.designArtifacts.pendingConfirm = {
      action: 'persist-plan', record: plan, bytes: bytes.length, expectedCid: this.designArtifacts.planCid,
    };
    this.designArtifacts.backendStatus = `Compile plan ready (CID ${this.designArtifacts.planCid}). Confirm to persist it to the kit backend.`;
    this.updateWorkflowPanel();
  }

  // Runs the current design through the REAL ipfs_accelerate_py inference
  // job queue (list_models -> run_inference_job -> job_status), following
  // the accelerate-panel pattern. The envelope shown is the gateway's own
  // result — never a locally claimed completion. Training is not exposed
  // by the descriptor, so this button runs inference, honestly labeled.
  async runInferenceJob() {
    const { invokeDescriptorOperation } = await import('../core/mcp-descriptor-registry.js');
    const { graphDoc, cid } = await this.buildGraphArtifact();
    this.designArtifacts.inference = { status: 'running', detail: 'Submitting inference job…' };
    this.updateWorkflowPanel();
    try {
      const modelsEnvelope = await this.readModelStatus({ task: 'inference' });
      const models = Array.isArray(modelsEnvelope)
        ? modelsEnvelope
        : (modelsEnvelope?.output?.models || modelsEnvelope?.models || []);
      if (models.length === 0) {
        throw new Error(`list_models returned no models (${modelsEnvelope?.status || 'unknown status'}); nothing to run inference against.`);
      }
      const model = models[0]?.id || models[0]?.name || String(models[0]);
      const envelope = await invokeDescriptorOperation({
        descriptor_id: 'ipfs_accelerate_py',
        operation: 'run_inference_job',
        input: { model: String(model), input: JSON.stringify(graphDoc), max_tokens: 64 },
        app_id: 'neural-network-designer',
        execution_mode: 'confirmed',
        desktop: this.desktop,
      });
      const jobId = envelope?.output?.job_id || null;
      let statusEnvelope = null;
      if (jobId) {
        statusEnvelope = await callDesignerMcpTool('read_status', 'mcp++:ipfs_accelerate_py/job_status', { job_id: jobId });
      }
      this.designArtifacts.inference = {
        status: 'complete', model: String(model), graph_cid: cid, job_id: jobId,
        envelope, status_envelope: statusEnvelope, at: new Date().toISOString(),
      };
      this.recordWorkflowAction('run-inference', `job ${jobId || '(none)'} on ${model}: ${envelope?.status || 'unknown'}`);
    } catch (error) {
      this.designArtifacts.inference = { status: 'failed', error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
      this.recordWorkflowAction('run-inference', `failed: ${this.designArtifacts.inference.error}`);
    }
    this.updateWorkflowPanel();
    return this.designArtifacts.inference;
  }

  // ---- Version index: honestly local index of real backend artifacts ----
  loadVersionIndex() {
    try {
      const raw = localStorage.getItem('neural-designer-version-index');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  saveVersionIndex(versions) {
    try {
      localStorage.setItem('neural-designer-version-index', JSON.stringify(versions));
    } catch {
      this.designArtifacts.backendStatus = 'Version index could not be written to browser storage.';
    }
  }

  async requestVersionCommit() {
    const graphDoc = this.graphDocument();
    const version = graphDoc.metadata.version || '1.0.0';
    const record = {
      schema: 'swissknife.neural-network-designer.version.v1',
      version,
      name: graphDoc.metadata.name,
      saved_at: new Date().toISOString(),
      graph: graphDoc,
    };
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    const expectedCid = await contentCidForBytes(bytes);
    this.designArtifacts.pendingConfirm = {
      action: 'commit-version', record, bytes: bytes.length, expectedCid,
    };
    this.designArtifacts.backendStatus = `Version ${version} ready (CID ${expectedCid}). Confirm to persist it to the kit backend.`;
    this.updateWorkflowPanel();
  }

  // The explicit user confirmation step every backend-mutating POST sits
  // behind. The confirmation card renders the exact write first; only the
  // "Confirm persist" click reaches this method.
  async confirmBackendWrite() {
    const pending = this.designArtifacts.pendingConfirm;
    this.designArtifacts.pendingConfirm = null;
    if (!pending) {
      this.designArtifacts.backendStatus = 'Nothing was pending confirmation.';
      this.updateWorkflowPanel();
      return;
    }
    try {
      const kind = pending.action === 'persist-graph' ? 'model-graph'
        : pending.action === 'persist-plan' ? 'compile-plan'
        : pending.action === 'deploy-graph' ? 'model-graph'
        : pending.action === 'export-graph' ? 'model-graph'
        : 'model-version';
      const { cid, response } = await this.persistArtifact(pending.record, kind);
      if (pending.action === 'persist-graph' || pending.action === 'deploy-graph' || pending.action === 'export-graph') {
        this.designArtifacts.graphPersistedCid = cid;
        this.recordWorkflowAction('persist-graph', `${cid} (store-verified: ${response.verified === true})`);
        this.designArtifacts.backendStatus = `Graph artifact persisted at ${cid} (store-verified: ${response.verified === true}).`;
        if (pending.action === 'export-graph' && pending.download) {
          this.downloadGraphFile(pending.record);
          this.designArtifacts.backendStatus += ' Local copy downloaded.';
        }
      } else if (pending.action === 'persist-plan') {
        this.designArtifacts.planPersistedCid = cid;
        this.recordWorkflowAction('persist-plan', `${cid} (store-verified: ${response.verified === true})`);
        this.designArtifacts.backendStatus = `Compile plan persisted at ${cid} (store-verified: ${response.verified === true}).`;
      } else if (pending.action === 'commit-version') {
        const versions = this.loadVersionIndex();
        versions.unshift({
          version: pending.record.version, cid, name: pending.record.name, created: pending.record.saved_at,
        });
        this.saveVersionIndex(versions.slice(0, 25));
        this.designArtifacts.versions = this.loadVersionIndex();
        this.recordWorkflowAction('commit-version', `v${pending.record.version} -> ${cid}`);
        this.designArtifacts.backendStatus = `Version ${pending.record.version} persisted at ${cid} and added to the local version index.`;
      }
      if (pending.action === 'deploy-graph') {
        await this.announceModelCid(cid, pending.record?.metadata?.name || 'neural network');
      }
    } catch (error) {
      this.designArtifacts.backendStatus = `Backend persist failed: ${error instanceof Error ? error.message : String(error)}`;
      this.recordWorkflowAction('persist-failed', this.designArtifacts.backendStatus);
    }
    this.updateWorkflowPanel();
  }

  cancelBackendWrite() {
    this.designArtifacts.pendingConfirm = null;
    this.designArtifacts.backendStatus = 'Backend write cancelled; nothing was sent.';
    this.updateWorkflowPanel();
  }

  // Announces a persisted model CID on the P2P topic through the real
  // browser transport. If no transport is registered the announce is
  // honestly reported as skipped — the CID remains retrievable from the
  // kit backend.
  async announceModelCid(cid, name) {
    const p2p = this.desktop?.swissknife?.p2p || (typeof window !== 'undefined' ? window.SwissKnife?.p2p : null) || null;
    const announcement = { type: 'model-announce', schema: 'swissknife.neural-network-designer.announce.v1', cid, name, announced_at: new Date().toISOString() };
    try {
      if (!p2p) throw new Error('No browser P2P transport is registered.');
      let ack;
      if (typeof p2p.pubsubPublish === 'function') ack = await p2p.pubsubPublish('/swissknife/models/announce', announcement);
      else if (typeof p2p.publish === 'function') ack = await p2p.publish('/swissknife/models/announce', announcement);
      else throw new Error('No browser pubsub publish method is registered.');
      this.designArtifacts.backendStatus = `Deployed: artifact ${cid} persisted and announced on /swissknife/models/announce (transport ack: ${JSON.stringify(ack ?? null)}).`;
      this.recordWorkflowAction('deploy-announce', `${cid} announced`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.designArtifacts.backendStatus = `Artifact persisted at ${cid}, but the P2P announce did not happen: ${message} The CID stays retrievable from the kit backend.`;
      this.recordWorkflowAction('deploy-announce', `skipped: ${message}`);
    }
  }

  // ---- Real undo/redo over local network snapshots ----
  snapshotNetwork() {
    return JSON.parse(JSON.stringify(this.networkConfig));
  }

  pushHistory() {
    this.history.past.push(this.snapshotNetwork());
    if (this.history.past.length > 50) this.history.past.shift();
    this.history.future = [];
  }

  restoreNetwork(snapshot) {
    this.networkConfig = snapshot;
    this.selectedLayer = null;
    this.renderCanvas();
    this.updateNetworkSummary();
    this.updatePropertiesPanel();
    this.updateWorkflowPanel();
  }

  undo() {
    if (this.history.past.length === 0) {
      this.showStatusMessage('Nothing to undo.');
      return;
    }
    this.history.future.push(this.snapshotNetwork());
    this.restoreNetwork(this.history.past.pop());
    this.showStatusMessage('Undone.');
  }

  redo() {
    if (this.history.future.length === 0) {
      this.showStatusMessage('Nothing to redo.');
      return;
    }
    this.history.past.push(this.snapshotNetwork());
    this.restoreNetwork(this.history.future.pop());
    this.showStatusMessage('Redone.');
  }

  async initializeIPFSStorage() {
    try {
      // Connect to IPFS for model versioning and sharing
      if (window.ipfsNode) {
        this.ipfsStorage = window.ipfsNode;
        console.log('✅ Connected to IPFS for model storage');
        this.modelStoragePrefix = '/models/neural-networks/';
      } else {
        console.log('⚠️ IPFS not available - using local storage only');
        this.ipfsStorage = null;
      }
    } catch (error) {
      console.error('❌ Failed to initialize IPFS storage:', error);
    }
  }

  render() {
    return `
      <div class="neural-designer-container">
        <!-- Toolbar -->
        <div class="designer-toolbar">
          <div class="toolbar-section">
            <span class="network-name" id="network-name">${this.networkConfig.metadata.name}</span>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.showMetadataModal()">✏️ Edit</button>
          </div>
          
          <div class="toolbar-section">
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.newNetwork()">🆕 New</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.loadNetwork()">📂 Load</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.saveNetwork()">💾 Save</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.exportNetwork()">📤 Export</button>
          </div>
          
          <div class="toolbar-section">
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.validateNetwork()">✅ Validate</button>
            <button class="btn btn-sm btn-success sk-btn sk-btn-primary" title="Runs the current design as a real ipfs_accelerate_py inference job. Training is not exposed by that backend." onclick="window.neuralDesignerApp?.runInferenceJob()">▶ Run inference</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.deployToP2P()">🌐 Deploy</button>
          </div>
          
          <div class="toolbar-section">
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.undo()">↶ Undo</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.redo()">↷ Redo</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.clearCanvas()">🗑️ Clear</button>
          </div>
        </div>

        <section class="vda-g031-panel" data-svd-workflow="${VDA_G031_WORKFLOW}" aria-label="VDA-G031 neural network workflow">
          <div class="vda-g031-header">
            <div>
              <h3>VDA-G031 Neural Network Workflow</h3>
              <p>Local design canvas below. Graph artifacts, validation records, and compile plans are computed locally with real content CIDs; backend persistence happens only behind your explicit confirmation. Inference runs as a real ipfs_accelerate_py job — training is not exposed by that backend, so no training outcome is ever claimed.</p>
            </div>
            <button class="btn btn-primary workflow-primary sk-btn sk-btn-primary" data-svd-workflow="${VDA_G031_WORKFLOW}" data-svd-workflow-action="generate-graph-artifacts" onclick="window.neuralDesignerApp?.requestGraphPersist()">Build + persist graph artifact</button>
          </div>
          <div id="vda-g031-confirm-slot">
            ${this.renderWorkflowConfirmCard()}
          </div>
          <div id="vda-g031-panel-content">
            ${this.renderWorkflowPanelContent()}
          </div>
        </section>

        <!-- Main Content -->
        <div class="designer-content">
          <!-- Layer Palette -->
          <div class="layer-palette">
            <h3>🧱 Layer Types</h3>
            <div class="palette-grid">
              ${Object.entries(this.layerTypes).map(([type, config]) => `
                <div class="layer-type sk-card" draggable="true" data-layer-type="${type}" style="border-left: 4px solid ${config.color}">
                  <span class="layer-icon">${config.icon}</span>
                  <span class="layer-name">${config.name}</span>
                </div>
              `).join('')}
            </div>
            
            <div class="connection-tools">
              <h4>🔗 Connection Tools</h4>
              <button class="tool-btn" id="connection-mode" onclick="window.neuralDesignerApp?.toggleConnectionMode()">
                🔗 Connect Layers
              </button>
              <button class="tool-btn" onclick="window.neuralDesignerApp?.autoConnect()">
                ⚡ Auto Connect
              </button>
              <button class="tool-btn" onclick="window.neuralDesignerApp?.clearConnections()">
                🗑️ Clear Connections
              </button>
            </div>
          </div>

          <!-- Canvas Container -->
          <div class="canvas-container">
            <div class="canvas-local-label">Local design canvas — every edit stays in this browser until you export or persist.</div>
            <canvas id="network-canvas" width="800" height="600"></canvas>
            <div class="canvas-overlay" id="canvas-overlay"></div>
          </div>

          <!-- Properties Panel -->
          <div class="properties-panel">
            <h3>⚙️ Properties</h3>
            <div id="layer-properties">
              <div class="no-selection sk-empty">
                Select a layer to view its properties
              </div>
            </div>
            
            <!-- Network Summary -->
            <div class="network-summary">
              <h4>📊 Network Summary</h4>
              <div class="summary-stats" id="network-stats">
                <div class="stat">
                  <span class="stat-label">Total Layers:</span>
                  <span class="stat-value" id="total-layers">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Parameters:</span>
                  <span class="stat-value" id="total-params">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Connections:</span>
                  <span class="stat-value" id="total-connections">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Memory:</span>
                  <span class="stat-value" id="memory-usage">0 MB</span>
                </div>
              </div>
            </div>
            
            <!-- Version Control -->
            <div class="version-control">
              <h4>📂 Version Control</h4>
              <div class="current-version">
                <span>v${this.networkConfig.metadata.version}</span>
                <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.commitVersion()">💾</button>
              </div>
              <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.viewVersionHistory()">📜 History</button>
              <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.shareToIPFS()">🌐 Share</button>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="designer-status">
          <div class="status-section">
            <span class="status-item">Layers: <span id="status-layers">0</span></span>
            <span class="status-item">P2P: <span class="sk-status-dot ${this.p2pTransportAvailable() ? 'is-ok' : 'is-idle'}"></span><span id="p2p-status">${this.p2pTransportAvailable() ? 'transport registered' : 'no transport registered'}</span></span>
            <span class="status-item">IPFS: <span class="sk-status-dot ${this.ipfsStorage ? 'is-ok' : 'is-idle'}"></span><span id="ipfs-status">${this.ipfsStorage ? 'window.ipfsNode connected' : 'not available'}</span></span>
            <span class="status-item">ML: <span class="sk-status-dot ${this.mlBackendMode === 'tensorflow-local' ? 'is-ok' : 'is-idle'}"></span><span id="ml-status">${this.mlBackendMode === 'tensorflow-local' ? 'TensorFlow.js (local)' : 'none loaded'}</span></span>
          </div>
          <div class="status-section">
            <span class="status-item">Canvas: 800x600</span>
            <span class="status-item">Zoom: 100%</span>
          </div>
        </div>
      </div>

      <!-- Metadata Modal -->
      <div id="metadata-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>📝 Network Metadata</h3>
          <form id="metadata-form" onsubmit="window.neuralDesignerApp?.saveMetadata(event)">
            <div class="form-group">
              <label for="meta-name">Network Name:</label>
              <input type="text" id="meta-name" class="sk-input" value="${this.networkConfig.metadata.name}" required>
            </div>
            <div class="form-group">
              <label for="meta-description">Description:</label>
              <textarea id="meta-description" class="sk-textarea" rows="3">${this.networkConfig.metadata.description}</textarea>
            </div>
            <div class="form-group">
              <label for="meta-author">Author:</label>
              <input type="text" id="meta-author" class="sk-input" value="${this.networkConfig.metadata.author}">
            </div>
            <div class="form-group">
              <label for="meta-version">Version:</label>
              <input type="text" id="meta-version" class="sk-input" value="${this.networkConfig.metadata.version}">
            </div>
            <div class="form-actions">
              <button type="button" class="btn sk-btn" onclick="window.neuralDesignerApp?.hideMetadataModal()">Cancel</button>
              <button type="submit" class="btn btn-primary sk-btn sk-btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  p2pTransportAvailable() {
    const p2p = this.desktop?.swissknife?.p2p || (typeof window !== 'undefined' ? window.SwissKnife?.p2p : null) || null;
    return Boolean(p2p && (typeof p2p.pubsubPublish === 'function' || typeof p2p.publish === 'function'));
  }

  renderWorkflowConfirmCard() {
    const pending = this.designArtifacts.pendingConfirm;
    if (!pending) return '';
    const what = pending.action === 'persist-graph' ? 'the graph artifact'
      : pending.action === 'persist-plan' ? 'the compile plan'
      : pending.action === 'commit-version' ? `version ${this.escapeHtml(pending.record.version)}`
      : pending.action === 'deploy-graph' ? 'the deployment artifact (persisted, then its CID announced on /swissknife/models/announce)'
      : 'the export (persisted to the backend, plus a local file download)';
    return `
      <div class="vda-g031-confirm" role="alert" aria-label="Confirm backend write">
        <div>
          <strong>Confirm backend write</strong>
          <p>This will POST ${what} (${pending.bytes} bytes, CID <code>${pending.expectedCid}</code>) to <code>ipfs_kit_py</code> through <code>/mcp/tools/call</code> with pin=true. The store verifies the CID over the exact bytes sent; a mismatch fails the write and is reported verbatim.</p>
        </div>
        <div class="vda-g031-confirm-actions">
          <button class="btn btn-primary btn-sm sk-btn sk-btn-primary" onclick="window.neuralDesignerApp?.confirmBackendWrite()">Confirm persist</button>
          <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.cancelBackendWrite()">Cancel</button>
        </div>
      </div>
    `;
  }

  renderWorkflowPanelContent() {
    const artifacts = this.designArtifacts;
    const latestActions = artifacts.actions.length > 0
      ? artifacts.actions.map(action => `<li><strong>${this.escapeHtml(action.action)}:</strong> ${this.escapeHtml(action.detail)} <span class="vda-g031-time">${this.escapeHtml(action.at)}</span></li>`).join(' ')
      : '<li>No workflow actions recorded yet.</li>';
    const inference = artifacts.inference;
    const inferenceBody = !inference
      ? '<p>Not run yet. Runs the current design as a real <code>run_inference_job</code> on ipfs_accelerate_py and polls <code>job_status</code>.</p>'
      : inference.status === 'running'
        ? `<p><span class="sk-status-dot is-warn"></span>${this.escapeHtml(inference.detail || 'Running…')}</p>`
        : inference.status === 'failed'
          ? `<p><span class="sk-status-dot is-err"></span><strong>Failed:</strong> ${this.escapeHtml(inference.error)}</p>`
          : `<p>Model <code>${this.escapeHtml(inference.model)}</code> · job <code>${this.escapeHtml(inference.job_id || 'none')}</code> · envelope status <strong>${this.escapeHtml(inference.envelope?.status || 'unknown')}</strong></p>
             <details><summary>Gateway envelope</summary><pre class="sk-code">${this.escapeHtml(JSON.stringify(inference.envelope, null, 2))}</pre></details>
             ${inference.status_envelope ? `<details><summary>job_status</summary><pre class="sk-code">${this.escapeHtml(JSON.stringify(inference.status_envelope, null, 2))}</pre></details>` : '<p>No job id was returned, so there is nothing to poll.</p>'}`;
    const versions = artifacts.versions;
    return `
      <div class="vda-g031-grid">
        <div class="vda-g031-card sk-card" data-svd-vda-marker="graph-artifacts">
          <h4>Graph Artifact</h4>
          <p>${artifacts.graphCid ? `Computed CID <code>${artifacts.graphCid}</code>` : 'Not built yet.'}</p>
          <p>${artifacts.graphPersistedCid ? `Persisted <code>${artifacts.graphPersistedCid}</code> (retrieval verified: ${artifacts.graphVerified})` : 'Not persisted to the backend yet.'}</p>
          <p>${this.networkConfig.layers.length} layers, ${this.networkConfig.connections.length} edges on the local canvas.</p>
          <button class="btn btn-sm sk-btn" data-svd-workflow-action="generate-graph-artifacts" onclick="window.neuralDesignerApp?.buildGraphArtifact()">Build graph artifact</button>
          <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.requestGraphPersist()">Persist</button>
          <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.verifyGraphArtifact()" ${artifacts.graphPersistedCid ? '' : 'disabled'}>Verify retrieve</button>
        </div>
        <div class="vda-g031-card sk-card" data-svd-vda-marker="schema-validation">
          <h4>Data Contract (local)</h4>
          ${artifacts.validation
            ? `<p>Status: <strong>${this.escapeHtml(artifacts.validation.status)}</strong> · CID <code>${artifacts.validationCid}</code></p>
               ${artifacts.validation.errors.length ? `<p>${artifacts.validation.errors.map(e => this.escapeHtml(e)).join('<br>')}</p>` : '<p>Input layer, output layer, edge references, and acyclicity all check out.</p>'}`
            : '<p>Not validated yet. Checks the current graph locally: input/output presence, edge references, cycles.</p>'}
          <button class="btn btn-sm sk-btn" data-svd-workflow-action="validate-schema-contract" onclick="window.neuralDesignerApp?.validateNetwork()">Validate contract</button>
        </div>
        <div class="vda-g031-card sk-card" data-svd-vda-marker="compile-train-planning">
          <h4>Compile Plan (local)</h4>
          ${artifacts.plan
            ? `<p>adam lr ${artifacts.plan.learning_rate}, ${artifacts.plan.epochs} epochs, batch ${artifacts.plan.batch_size}</p>
               <p>${artifacts.plan.parameters.toLocaleString()} parameters · ~${artifacts.plan.estimated_memory_mb} MB · CID <code>${artifacts.planCid}</code></p>
               <p>${artifacts.planPersistedCid ? `Persisted <code>${artifacts.planPersistedCid}</code>` : 'Not persisted yet.'}</p>`
            : '<p>Not built yet. Derived locally from the current graph; parameter counts are real arithmetic, not estimates from a run.</p>'}
          <button class="btn btn-sm sk-btn" data-svd-workflow-action="plan-compile-train" onclick="window.neuralDesignerApp?.buildCompilePlan().then(() => window.neuralDesignerApp?.updateWorkflowPanel())">Build plan</button>
          <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.requestPlanPersist()">Persist plan</button>
        </div>
        <div class="vda-g031-card ${artifacts.invalidEdges.length ? 'invalid-edge' : ''}" data-svd-vda-marker="invalid-edge-feedback">
          <h4>Invalid Edges (local)</h4>
          ${artifacts.invalidEdges.length
            ? artifacts.invalidEdges.map(edge => `<p><code>${this.escapeHtml(edge.edge)}</code> ${this.escapeHtml(edge.from)} → ${this.escapeHtml(edge.to)}<br>${this.escapeHtml(edge.reason)}</p>`).join('')
            : '<p>None detected. Runs real cycle and dangling-reference detection on the current graph.</p>'}
          <button class="btn btn-sm sk-btn" data-svd-workflow-action="surface-invalid-edge-feedback" onclick="window.neuralDesignerApp?.detectInvalidEdges()">Detect invalid edges</button>
        </div>
        <div class="vda-g031-card sk-card" data-svd-vda-marker="result-receipts">
          <h4>Inference Job (backend)</h4>
          ${inferenceBody}
          <button class="btn btn-sm btn-success sk-btn sk-btn-primary" data-svd-workflow-action="run-inference-job" onclick="window.neuralDesignerApp?.runInferenceJob()">Run inference</button>
        </div>
        <div class="vda-g031-card sk-card" data-svd-vda-marker="version-history">
          <h4>Versions</h4>
          ${versions.length
            ? versions.map(v => `<p>v${this.escapeHtml(v.version)} <code>${this.escapeHtml(v.cid)}</code><br><button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.loadNetwork('${this.escapeHtml(v.cid)}')">Load</button></p>`).join('')
            : '<p>No versions committed yet. "Save" persists the current network as a versioned backend artifact; the index itself is local browser storage.</p>'}
          <div class="vda-g031-load-row">
            <input id="nnd-load-cid" class="sk-input" placeholder="artifact CID" aria-label="Artifact CID to load">
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.loadNetwork(document.getElementById('nnd-load-cid').value.trim())">Load by CID</button>
          </div>
        </div>
      </div>
      <div class="vda-g031-ledger" role="status" aria-live="polite" data-svd-vda-marker="result-receipts">
        <div id="vda-g031-status-message">${this.escapeHtml(artifacts.backendStatus)}</div>
        <div class="vda-g031-action-log"><strong>Actions:</strong><ul>${latestActions}</ul></div>
      </div>
    `;
  }

  updateWorkflowPanel() {
    const slot = document.getElementById('vda-g031-confirm-slot');
    if (slot) slot.innerHTML = this.renderWorkflowConfirmCard();
    const panel = document.getElementById('vda-g031-panel-content');
    if (panel) panel.innerHTML = this.renderWorkflowPanelContent();
    const networkNameEl = document.getElementById('network-name');
    if (networkNameEl) networkNameEl.textContent = this.networkConfig.metadata.name;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  createWindow() {
    // Make this instance globally available for onclick handlers
    window.neuralDesignerApp = this;
    
    const content = this.render();
    
    // Setup event handlers after DOM is ready
    setTimeout(() => {
      this.setupEventHandlers();
      this.setupCanvasInteractions();
      this.updateNetworkSummary();
    }, 100);
    
    return content;
  }

  // Initialize P2P system for distributed training
  async initializeP2PSystem() {
    try {
      if (window.initializeP2PMLSystem) {
        this.p2pSystem = window.initializeP2PMLSystem({
          enableModelSharing: true,
          enableIPFS: true
        });
        this.ipfsStorage = this.p2pSystem?.getIPFSStorage();
      }
    } catch (error) {
      console.warn('P2P system not available for Neural Network Designer:', error);
    }
  }

  setupEventHandlers() {
    // Layer palette drag handlers
    const layerTypes = document.querySelectorAll('.layer-type');
    layerTypes.forEach(layer => {
      layer.addEventListener('dragstart', (e) => {
        this.draggedLayer = e.target.dataset.layerType;
      });
    });

    // Canvas drop handler
    const canvas = document.getElementById('network-canvas');
    if (canvas) {
      canvas.addEventListener('dragover', (e) => e.preventDefault());
      canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        if (this.draggedLayer) {
          this.addLayerToCanvas(this.draggedLayer, e.offsetX, e.offsetY);
          this.draggedLayer = null;
        }
      });

      canvas.addEventListener('click', (e) => {
        this.handleCanvasClick(e);
      });
    }
  }

  setupCanvasInteractions() {
    // Setup canvas drawing context
    const canvas = document.getElementById('network-canvas');
    if (canvas) {
      this.ctx = canvas.getContext('2d');
      this.renderCanvas();
    }
  }

  addLayerToCanvas(layerType, x, y) {
    const layer = {
      id: `layer_${Date.now()}`,
      type: layerType,
      x: x,
      y: y,
      params: {},
      name: `${this.layerTypes[layerType].name} ${this.networkConfig.layers.length + 1}`
    };

    this.pushHistory();
    this.networkConfig.layers.push(layer);
    this.renderCanvas();
    this.updateNetworkSummary();
    this.updateWorkflowPanel();
  }

  renderCanvas() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, 800, 600);

    // Draw grid
    this.drawGrid();

    // Draw connections
    this.drawConnections();

    // Draw layers
    this.drawLayers();
  }

  drawGrid() {
    this.ctx.strokeStyle = '#f0f0f0';
    this.ctx.lineWidth = 1;

    for (let x = 0; x <= 800; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, 600);
      this.ctx.stroke();
    }

    for (let y = 0; y <= 600; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(800, y);
      this.ctx.stroke();
    }
  }

  drawLayers() {
    this.networkConfig.layers.forEach(layer => {
      const config = this.layerTypes[layer.type];
      
      // Draw layer node
      this.ctx.fillStyle = config.color;
      this.ctx.fillRect(layer.x - 30, layer.y - 15, 60, 30);

      // Draw layer icon
      this.ctx.fillStyle = 'white';
      this.ctx.font = '16px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(config.icon, layer.x, layer.y + 5);

      // Draw layer name
      this.ctx.fillStyle = '#333';
      this.ctx.font = '10px Arial';
      this.ctx.fillText(layer.name, layer.x, layer.y + 25);

      // Highlight selected layer
      if (this.selectedLayer === layer) {
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(layer.x - 32, layer.y - 17, 64, 34);
      }
    });
  }

  drawConnections() {
    this.networkConfig.connections.forEach(connection => {
      const fromLayer = this.networkConfig.layers.find(l => l.id === connection.from);
      const toLayer = this.networkConfig.layers.find(l => l.id === connection.to);

      if (fromLayer && toLayer) {
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(fromLayer.x, fromLayer.y);
        this.ctx.lineTo(toLayer.x, toLayer.y);
        this.ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(toLayer.y - fromLayer.y, toLayer.x - fromLayer.x);
        const arrowLength = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(toLayer.x, toLayer.y);
        this.ctx.lineTo(
          toLayer.x - arrowLength * Math.cos(angle - 0.3),
          toLayer.y - arrowLength * Math.sin(angle - 0.3)
        );
        this.ctx.moveTo(toLayer.x, toLayer.y);
        this.ctx.lineTo(
          toLayer.x - arrowLength * Math.cos(angle + 0.3),
          toLayer.y - arrowLength * Math.sin(angle + 0.3)
        );
        this.ctx.stroke();
      }
    });
  }

  handleCanvasClick(e) {
    const clickX = e.offsetX;
    const clickY = e.offsetY;

    // Find clicked layer
    const clickedLayer = this.networkConfig.layers.find(layer => {
      return clickX >= layer.x - 30 && clickX <= layer.x + 30 &&
             clickY >= layer.y - 15 && clickY <= layer.y + 15;
    });

    if (clickedLayer) {
      this.selectLayer(clickedLayer);
    } else {
      this.selectedLayer = null;
      this.renderCanvas();
      this.updatePropertiesPanel();
    }
  }

  selectLayer(layer) {
    this.selectedLayer = layer;
    this.renderCanvas();
    this.updatePropertiesPanel();
  }

  updatePropertiesPanel() {
    const propertiesDiv = document.getElementById('layer-properties');
    if (!propertiesDiv) return;

    if (this.selectedLayer) {
      const config = this.layerTypes[this.selectedLayer.type];
      propertiesDiv.innerHTML = `
        <div class="layer-info">
          <h4>${config.icon} ${this.selectedLayer.name}</h4>
          <div class="form-group">
            <label>Layer Name:</label>
            <input type="text" value="${this.selectedLayer.name}" onchange="window.neuralDesignerApp?.updateLayerName(this.value)">
          </div>
          <div class="layer-params">
            <h5>Parameters</h5>
            ${config.params.map(param => `
              <div class="form-group">
                <label>${param}:</label>
                <input type="text" value="${this.selectedLayer.params[param] || ''}" 
                       onchange="window.neuralDesignerApp?.updateLayerParam('${param}', this.value)">
              </div>
            `).join('')}
          </div>
          <div class="layer-actions">
            <button class="btn btn-sm btn-danger" onclick="window.neuralDesignerApp?.deleteLayer()">🗑️ Delete</button>
            <button class="btn btn-sm sk-btn" onclick="window.neuralDesignerApp?.duplicateLayer()">📋 Duplicate</button>
          </div>
        </div>
      `;
    } else {
      propertiesDiv.innerHTML = '<div class="no-selection sk-empty">Select a layer to view its properties</div>';
    }
  }

  updateNetworkSummary() {
    const totalLayers = document.getElementById('total-layers');
    const totalConnections = document.getElementById('total-connections');
    const statusLayers = document.getElementById('status-layers');
    const totalParams = document.getElementById('total-params');
    const memoryUsage = document.getElementById('memory-usage');
    const parameters = this.calculateParameters(this.networkConfig.layers);

    if (totalLayers) totalLayers.textContent = this.networkConfig.layers.length;
    if (totalConnections) totalConnections.textContent = this.networkConfig.connections.length;
    if (statusLayers) statusLayers.textContent = this.networkConfig.layers.length;
    if (totalParams) totalParams.textContent = parameters.toLocaleString();
    if (memoryUsage) memoryUsage.textContent = `${Math.max(1, Math.round((parameters * 4) / (1024 * 1024)))} MB`;
  }

  // Action Methods
  newNetwork() {
    this.pushHistory();
    this.networkConfig = {
      layers: [],
      connections: [],
      metadata: {
        name: 'Untitled Network',
        description: '',
        version: '1.0.0',
        author: '',
        created: new Date().toISOString()
      }
    };
    this.selectedLayer = null;
    this.renderCanvas();
    this.updateNetworkSummary();
    this.updatePropertiesPanel();
    this.updateWorkflowPanel();
  }

  showMetadataModal() {
    const modal = document.getElementById('metadata-modal');
    if (modal) modal.style.display = 'block';
  }

  hideMetadataModal() {
    const modal = document.getElementById('metadata-modal');
    if (modal) modal.style.display = 'none';
  }

  saveMetadata(e) {
    e.preventDefault();
    
    const name = document.getElementById('meta-name')?.value || this.networkConfig.metadata.name;
    const description = document.getElementById('meta-description')?.value || this.networkConfig.metadata.description;
    const author = document.getElementById('meta-author')?.value || this.networkConfig.metadata.author;
    const version = document.getElementById('meta-version')?.value || this.networkConfig.metadata.version;

    this.networkConfig.metadata = {
      ...this.networkConfig.metadata,
      name,
      description,
      author,
      version,
      modified: new Date().toISOString()
    };

    const networkNameEl = document.getElementById('network-name');
    if (networkNameEl) networkNameEl.textContent = name;

    this.hideMetadataModal();
  }

  updateLayerName(name) {
    if (this.selectedLayer) {
      this.selectedLayer.name = name;
      this.renderCanvas();
    }
  }

  updateLayerParam(param, value) {
    if (this.selectedLayer) {
      this.selectedLayer.params[param] = value;
    }
  }

  deleteLayer() {
    if (this.selectedLayer) {
      this.pushHistory();
      this.networkConfig.layers = this.networkConfig.layers.filter(l => l.id !== this.selectedLayer.id);
      this.networkConfig.connections = this.networkConfig.connections.filter(
        c => c.from !== this.selectedLayer.id && c.to !== this.selectedLayer.id
      );
      this.selectedLayer = null;
      this.renderCanvas();
      this.updateNetworkSummary();
      this.updatePropertiesPanel();
      this.updateWorkflowPanel();
    }
  }

  duplicateLayer() {
    if (this.selectedLayer) {
      this.pushHistory();
      const newLayer = {
        ...this.selectedLayer,
        id: `layer_${Date.now()}`,
        x: this.selectedLayer.x + 60,
        y: this.selectedLayer.y + 40,
        name: `${this.selectedLayer.name} Copy`
      };
      this.networkConfig.layers.push(newLayer);
      this.renderCanvas();
      this.updateNetworkSummary();
      this.updateWorkflowPanel();
    }
  }

  toggleConnectionMode() {
    this.connectionMode = !this.connectionMode;
    const btn = document.getElementById('connection-mode');
    if (btn) {
      btn.classList.toggle('active', this.connectionMode);
      btn.textContent = this.connectionMode ? '✋ Exit Connect Mode' : '🔗 Connect Layers';
    }
  }

  clearCanvas() {
    if (confirm('Are you sure you want to clear the entire network?')) {
      this.newNetwork();
    }
  }

  async validateNetwork() {
    const validation = await this.validateDataContract();
    this.showStatusMessage(
      validation.status === 'valid'
        ? `Schema validation passed (${validation.layer_count} layers, ${validation.edge_count} edges): ${this.designArtifacts.validationCid}`
        : `Schema validation failed: ${(validation.errors || []).join('; ')}`
    );
    return validation;
  }

  // Loads a network from a backend CID (explicit argument, a version entry,
  // or the latest committed version). The canvas is replaced only with bytes
  // actually retrieved from the kit backend.
  async loadNetwork(cid = null) {
    const targetCid = cid || this.designArtifacts.versions[0]?.cid || null;
    if (!targetCid) {
      this.showStatusMessage('No saved versions yet — commit a version first, or paste an artifact CID in the Versions card.');
      return null;
    }
    try {
      const { record } = await this.retrieveArtifact(targetCid);
      const graph = record.graph || record;
      if (!Array.isArray(graph.layers)) throw new Error('The retrieved artifact is not a network graph document.');
      this.pushHistory();
      this.networkConfig.layers = graph.layers;
      this.networkConfig.connections = graph.connections || [];
      this.networkConfig.metadata = { ...this.networkConfig.metadata, ...(graph.metadata || {}) };
      this.selectedLayer = null;
      this.renderCanvas();
      this.updateNetworkSummary();
      this.updatePropertiesPanel();
      this.updateWorkflowPanel();
      this.showStatusMessage(`Loaded network from ${targetCid} (${graph.layers.length} layers).`);
      this.recordWorkflowAction('load-network', `${targetCid}`);
      return graph;
    } catch (error) {
      this.showStatusMessage(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // Save = versioned persist behind explicit confirmation.
  async saveNetwork() {
    await this.requestVersionCommit();
    return { pending: true };
  }

  // Export persists the REAL architecture JSON to the kit backend (real
  // CID, behind confirmation) and downloads a local copy of the same bytes.
  async exportNetwork() {
    const { graphDoc, cid } = await this.buildGraphArtifact();
    const bytes = new TextEncoder().encode(stableStringifyValue(graphDoc));
    this.designArtifacts.pendingConfirm = {
      action: 'export-graph', record: graphDoc, bytes: bytes.length, expectedCid: cid, download: true,
    };
    this.designArtifacts.backendStatus = `Export ready (${graphDoc.layers.length} layers, CID ${cid}). Confirm to persist it to the kit backend and download the local copy.`;
    this.updateWorkflowPanel();
  }

  downloadGraphFile(graphDoc) {
    try {
      const blob = new Blob([JSON.stringify(graphDoc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(graphDoc.metadata?.name || 'network').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      this.showStatusMessage(`Local download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Deploy = persist the graph (confirmed) then announce its CID on the P2P
  // topic through the real browser transport. No transport means an honest
  // skip, not a fabricated deployment.
  async deployToP2P() {
    const { graphDoc, cid } = await this.buildGraphArtifact();
    const bytes = new TextEncoder().encode(stableStringifyValue(graphDoc));
    this.designArtifacts.pendingConfirm = {
      action: 'deploy-graph', record: graphDoc, bytes: bytes.length, expectedCid: cid,
    };
    this.designArtifacts.backendStatus = `Deployment artifact ready (CID ${cid}). Confirm to persist it and announce the CID on /swissknife/models/announce.`;
    this.updateWorkflowPanel();
  }

  // Real auto-connect: links layers left-to-right, skipping edges that
  // would create a cycle. Local computation.
  autoConnect() {
    this.pushHistory();
    const layers = [...this.networkConfig.layers].sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const existing = new Set(this.networkConfig.connections.map(connection => `${connection.from}->${connection.to}`));
    let added = 0;
    for (let i = 0; i + 1 < layers.length; i += 1) {
      const from = layers[i].id;
      const to = layers[i + 1].id;
      if (from === to || existing.has(`${from}->${to}`)) continue;
      const candidate = { id: `conn-auto-${Date.now()}-${i}`, from, to };
      if (this.findCycleEdges(this.networkConfig.layers, [...this.networkConfig.connections, candidate]).size === 0) {
        this.networkConfig.connections.push(candidate);
        existing.add(`${from}->${to}`);
        added += 1;
      }
    }
    this.renderCanvas();
    this.updateNetworkSummary();
    this.updateWorkflowPanel();
    this.showStatusMessage(`Auto-connected ${added} edge(s) without creating cycles; ${this.networkConfig.connections.length} total.`);
  }

  clearConnections() {
    this.pushHistory();
    this.networkConfig.connections = [];
    this.renderCanvas();
    this.updateNetworkSummary();
    this.updateWorkflowPanel();
    this.showStatusMessage('Connections cleared. Use auto connect to rebuild the graph.');
  }

  async commitVersion() {
    await this.requestVersionCommit();
  }

  viewVersionHistory() {
    const versions = this.designArtifacts.versions;
    this.showStatusMessage(
      versions.length === 0
        ? 'No versions committed yet. "Save" persists the current network as a versioned backend artifact.'
        : `${versions.length} version(s): ${versions.map(v => `v${v.version}@${v.cid.slice(0, 12)}…`).join(', ')}.`
    );
    this.updateWorkflowPanel();
  }

  // Share = persist the graph artifact to the content-addressed kit store
  // (real CID) and report it. Nothing is uploaded anywhere else.
  async shareToIPFS() {
    if (this.designArtifacts.graphPersistedCid) {
      this.designArtifacts.backendStatus = `Already shared: graph artifact ${this.designArtifacts.graphPersistedCid} is content-addressed in the kit artifact store (retrievable via CID).`;
      this.updateWorkflowPanel();
      return;
    }
    await this.requestGraphPersist();
  }

  showStatusMessage(message) {
    const status = document.getElementById('vda-g031-status-message');
    if (status) status.textContent = message;
  }

  addStyles() {
    if (document.querySelector('#neural-designer-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'neural-designer-styles';
    style.textContent = `
      .neural-designer-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .designer-toolbar {
        background: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }

      .vda-g031-panel {
        border-bottom: 1px solid #d7dde3;
        background: #ffffff;
        padding: 12px;
      }

      .vda-g031-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 10px;
      }

      .vda-g031-header h3 {
        margin: 0 0 4px 0;
        font-size: 15px;
        color: #1f2933;
      }

      .vda-g031-header p {
        margin: 0;
        font-size: 12px;
        color: #52606d;
      }

      .workflow-primary {
        flex: 0 0 auto;
        min-height: 32px;
      }

      .vda-g031-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(150px, 1fr));
        gap: 8px;
      }

      .vda-g031-card {
        border: 1px solid #d7dde3;
        border-radius: 6px;
        padding: 8px;
        min-width: 0;
        background: #fbfcfd;
      }

      .vda-g031-card h4 {
        margin: 0 0 6px 0;
        font-size: 12px;
        color: #243b53;
      }

      .vda-g031-card p,
      .vda-g031-ledger {
        margin: 0 0 6px 0;
        font-size: 11px;
        line-height: 1.35;
        color: #334e68;
        overflow-wrap: anywhere;
      }

      .vda-g031-card code,
      .vda-g031-ledger code {
        font-size: 10px;
        color: #102a43;
        background: #edf2f7;
        border-radius: 3px;
        padding: 1px 3px;
      }

      .vda-g031-card.invalid-edge {
        border-color: #d97706;
        background: #fffaf0;
      }

      .vda-g031-ledger {
        margin-top: 8px;
        border-top: 1px solid #e4e7eb;
        padding-top: 8px;
      }

      .vda-g031-ledger ul {
        margin: 6px 0 0 16px;
        padding: 0;
      }

      .vda-g031-confirm {
        border: 1px solid #b45309;
        background: #fffbeb;
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .vda-g031-confirm p {
        margin: 4px 0 0;
        font-size: 12px;
        color: #334e68;
      }

      .vda-g031-confirm-actions {
        display: flex;
        gap: 8px;
        flex: 0 0 auto;
      }

      .vda-g031-time {
        color: #829ab1;
        font-size: 10px;
      }

      .vda-g031-load-row {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }

      .vda-g031-load-row input {
        flex: 1;
        min-width: 0;
        border: 1px solid #d7dde3;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 11px;
      }

      .canvas-local-label {
        font-size: 11px;
        color: #52606d;
        background: #f1f5f9;
        border-bottom: 1px solid #e2e8f0;
        padding: 4px 10px;
      }
      
      .toolbar-section {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .network-name {
        font-weight: 600;
        color: #333;
        min-width: 150px;
      }
      
      .designer-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      
      .layer-palette {
        width: 250px;
        background: #f8f9fa;
        border-right: 1px solid #dee2e6;
        padding: 15px;
        overflow-y: auto;
      }
      
      .layer-palette h3 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 16px;
      }
      
      .palette-grid {
        display: grid;
        gap: 8px;
        margin-bottom: 25px;
      }
      
      .layer-type {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        cursor: grab;
        transition: all 0.2s;
      }
      
      .layer-type:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      
      .layer-type:active {
        cursor: grabbing;
      }
      
      .layer-icon {
        font-size: 16px;
      }
      
      .layer-name {
        font-size: 12px;
        font-weight: 500;
      }
      
      .connection-tools h4 {
        margin: 0 0 10px 0;
        color: #333;
        font-size: 14px;
      }
      
      .tool-btn {
        display: block;
        width: 100%;
        padding: 8px;
        margin-bottom: 5px;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .tool-btn:hover {
        background: #e9ecef;
      }
      
      .tool-btn.active {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }
      
      .canvas-container {
        flex: 1;
        position: relative;
        overflow: auto;
        background: #fff;
      }
      
      #network-canvas {
        border: none;
        cursor: crosshair;
      }
      
      .canvas-overlay {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
      }
      
      .properties-panel {
        width: 300px;
        background: #f8f9fa;
        border-left: 1px solid #dee2e6;
        padding: 15px;
        overflow-y: auto;
      }
      
      .properties-panel h3 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 16px;
      }
      
      .no-selection {
        color: #6c757d;
        font-style: italic;
        text-align: center;
        padding: 20px;
      }
      
      .layer-info h4 {
        margin: 0 0 15px 0;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .form-group {
        margin-bottom: 15px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #333;
        font-size: 12px;
      }
      
      .form-group input,
      .form-group textarea {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 12px;
      }
      
      .layer-params h5 {
        margin: 20px 0 10px 0;
        color: #333;
        font-size: 14px;
      }
      
      .layer-actions {
        margin-top: 20px;
        display: flex;
        gap: 8px;
      }
      
      .network-summary {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
      }
      
      .network-summary h4 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 14px;
      }
      
      .summary-stats {
        display: grid;
        gap: 8px;
      }
      
      .stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;
        font-size: 12px;
      }
      
      .stat-label {
        color: #6c757d;
      }
      
      .stat-value {
        font-weight: 600;
        color: #333;
      }
      
      .version-control {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
      }
      
      .version-control h4 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 14px;
      }
      
      .current-version {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        font-size: 12px;
      }
      
      .designer-status {
        background: #f8f9fa;
        border-top: 1px solid #dee2e6;
        padding: 8px 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      
      .status-section {
        display: flex;
        gap: 15px;
      }
      
      .status-item {
        color: #6c757d;
      }
      
      .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      
      .modal-content {
        background: white;
        padding: 25px;
        border-radius: 8px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }
      
      .modal-content h3 {
        margin: 0 0 20px 0;
        color: #333;
      }
      
      .form-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
      }
      
      .btn {
        padding: 6px 12px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .btn:hover {
        background: #e9ecef;
      }
      
      .btn-primary {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }
      
      .btn-primary:hover {
        background: #0056b3;
        border-color: #0056b3;
      }
      
      .btn-secondary {
        background: #6c757d;
        color: white;
        border-color: #6c757d;
      }
      
      .btn-secondary:hover {
        background: #545b62;
        border-color: #545b62;
      }
      
      .btn-success {
        background: #28a745;
        color: white;
        border-color: #28a745;
      }
      
      .btn-success:hover {
        background: #1e7e34;
        border-color: #1e7e34;
      }
      
      .btn-warning {
        background: #ffc107;
        color: #212529;
        border-color: #ffc107;
      }
      
      .btn-warning:hover {
        background: #e0a800;
        border-color: #e0a800;
      }
      
      .btn-danger {
        background: #dc3545;
        color: white;
        border-color: #dc3545;
      }
      
      .btn-danger:hover {
        background: #c82333;
        border-color: #c82333;
      }
      
      .btn-sm {
        padding: 4px 8px;
        font-size: 11px;
      }

      @media (max-width: 700px) {
        .neural-designer-container {
          min-width: 0;
        }

        .designer-toolbar,
        .vda-g031-header,
        .designer-status {
          align-items: stretch;
          flex-direction: column;
        }

        .toolbar-section,
        .status-section {
          flex-wrap: wrap;
        }

        .vda-g031-grid {
          grid-template-columns: 1fr;
        }

        .designer-content {
          display: block;
          overflow: auto;
        }

        .layer-palette,
        .properties-panel {
          width: auto;
          border: 0;
          border-bottom: 1px solid #dee2e6;
        }

        .canvas-container {
          min-height: 280px;
        }

        #network-canvas {
          width: 800px;
          height: 600px;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
}
