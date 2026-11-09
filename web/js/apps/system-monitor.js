import { runSystemNetworkLocalWorkflow } from './system-network-local-capabilities.js';
import { invokeNativeTool } from '../live-tool-gateway.js';

/**
 * Advanced System Monitor App for SwissKnife Web Desktop
 * Real-time system monitoring with detailed analytics and performance insights
 */

const VDA_G041_WORKFLOW = 'system-monitor.live-diagnostics';
// NOTE: the old VDA_G041_SAMPLE_CID fixture constant was removed in the
// no-mocks pass. Sample CIDs are only shown after a real persist to the
// ipfs_kit_py artifact store (see persistTelemetrySample()).
const VDA_G041_RECEIPTS = Object.freeze({
  liveTelemetry: 'receipt:system-monitor:live-telemetry:g041',
  diagnosticHistory: 'receipt:system-monitor:diagnostic-history:g041',
  analysis: 'receipt:system-monitor:analysis:g041',
  staleData: 'receipt:system-monitor:stale-data:g041',
  alertState: 'receipt:system-monitor:alert-state:g041',
  accessibleSummary: 'receipt:system-monitor:accessible-summary:g041'
});

export class SystemMonitorApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.updateInterval = null;
    this.chartData = {
      cpu: [],
      memory: [],
      gpu: [],
      network: [],
      disk: []
    };
    
    this.maxDataPoints = 60; // 1 minute of data at 1-second intervals
    this.alertThresholds = {
      cpu: 85,
      memory: 90,
      gpu: 95,
      temperature: 80,
      networkLatency: 1000
    };
    
    this.currentView = 'overview'; // 'overview', 'processes', 'network', 'storage', 'performance'
    this.processFilters = {
      sortBy: 'cpu', // 'cpu', 'memory', 'name', 'pid'
      sortOrder: 'desc',
      showSystemProcesses: false
    };
    this.telemetrySequence = 0;
    this.lastTelemetryAt = Date.now();
    this.hasMeasuredSample = false;
    this.ownerUnavailable = false;
    this.ownerFailureText = '';
    this.ownerRejectionNote = '';
    this.rejectedProbeBefore = null;
    this.rejectedProbeReceiptId = null;
    this.cpuHistoryExpanded = false;
    this.historyOrigin = 'fresh samples';
    this.observationStamp = 'unavailable';
    this.retainedSample = false;
    // Backend (accelerate) telemetry: refreshed at most every 30s through the
    // real descriptor gateway. Until the first successful call it honestly
    // reports "not run".
    this.backendTelemetry = { state: 'not-run', at: null, data: null, error: null };
    this.telemetrySnapshot = this.createTelemetrySample();
    this.diagnosticHistory = [];
    this.diagnosticAnalysis = null;
    this.staleThresholdMs = 30000;
    this.activeAlerts = [];
    
    // System data from browser APIs where available
    this.systemInfo = {
      os: this.detectOS(),
      version: '1.0.0',
      architecture: this.detectArchitecture(),
      uptime: 0,
      totalMemory: this.detectTotalMemory(),
      availableMemory: this.detectAvailableMemory(),
      cpuCores: navigator.hardwareConcurrency || 8,
      cpuModel: this.detectCPUModel(),
      gpuModel: this.detectGPUModel()
    };
    
    this.networkInterfaces = [
      { name: 'WiFi', type: 'wireless', status: 'connected', speed: '866 Mbps' },
      { name: 'Ethernet', type: 'wired', status: 'disconnected', speed: '1 Gbps' },
      { name: 'P2P Network', type: 'p2p', status: 'connected', peers: 12 }
    ];
    
    this.storageDevices = [
      { name: 'C: (SSD)', type: 'SSD', total: 512 * 1024 * 1024 * 1024, used: 256 * 1024 * 1024 * 1024 },
      { name: 'D: (HDD)', type: 'HDD', total: 2 * 1024 * 1024 * 1024 * 1024, used: 800 * 1024 * 1024 * 1024 },
      { name: 'IPFS Storage', type: 'Distributed', total: 0, used: 1.2 * 1024 * 1024 * 1024 }
    ];
    
    this.mockProcesses = [
      { pid: 1234, name: 'SwissKnife Desktop', cpu: 12.5, memory: 256 * 1024 * 1024, status: 'running' },
      { pid: 1235, name: 'P2P Network Manager', cpu: 8.2, memory: 128 * 1024 * 1024, status: 'running' },
      { pid: 1236, name: 'IPFS Node', cpu: 15.1, memory: 512 * 1024 * 1024, status: 'running' },
      { pid: 1237, name: 'AI Model Server', cpu: 25.3, memory: 2 * 1024 * 1024 * 1024, status: 'running' },
      { pid: 1238, name: 'Web Browser', cpu: 18.7, memory: 1.5 * 1024 * 1024 * 1024, status: 'running' },
      { pid: 1239, name: 'Terminal', cpu: 2.1, memory: 64 * 1024 * 1024, status: 'running' },
      { pid: 1240, name: 'File Manager', cpu: 1.8, memory: 96 * 1024 * 1024, status: 'running' }
    ];
    this.seedDiagnosticWorkflow();
  }

  seedDiagnosticWorkflow() {
    // No seeded samples: the diagnostic history only ever contains samples
    // actually observed in this session (local signals + real backend
    // telemetry). Seeding fabricated history was removed in the no-mocks pass.
    this.diagnosticHistory = [];
    this.updateDiagnosticAnalysis();
    this.restoreRetainedHistory();
  }

  persistRetainedHistory() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('system-monitor.retained-history.v1', JSON.stringify({
        chartData: this.chartData,
        diagnosticHistory: this.diagnosticHistory,
        lastTelemetryAt: this.lastTelemetryAt,
        observationStamp: this.observationStamp
      }));
    } catch (error) {
      /* storage unavailable; in-memory history remains */
    }
  }

  restoreRetainedHistory() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('system-monitor.retained-history.v1');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || !saved.chartData || typeof saved.chartData !== 'object') return;
      for (const key of ['cpu', 'memory', 'gpu', 'network', 'disk']) {
        if (Array.isArray(saved.chartData[key])) this.chartData[key] = saved.chartData[key].slice(-this.maxDataPoints);
      }
      if (Array.isArray(saved.diagnosticHistory)) this.diagnosticHistory = saved.diagnosticHistory.slice(-12);
      if (typeof saved.lastTelemetryAt === 'number') this.lastTelemetryAt = saved.lastTelemetryAt;
      const kept = this.diagnosticHistory.length;
      if (kept > 0) {
        this.historyOrigin = kept === 1
          ? 'retained history · 1 sample'
          : `retained history · ${kept} samples`;
      }
      const last = this.diagnosticHistory[kept - 1];
      const cpu = typeof last?.cpu === 'number' ? last.cpu : null;
      const memory = typeof last?.memory === 'number' ? last.memory : null;
      if (cpu !== null) {
        this.telemetrySnapshot = {
          ...this.telemetrySnapshot,
          cpu,
          memory,
          gpu: null,
          timestamp: typeof last.timestamp === 'number' ? last.timestamp : this.telemetrySnapshot.timestamp,
          ownerTimestamp: typeof last.ownerTimestamp === 'string' ? last.ownerTimestamp : '',
          measurementSource: typeof last.measurementSource === 'string' ? last.measurementSource : '',
          utilizationUnit: typeof last.utilizationUnit === 'string' ? last.utilizationUnit : '',
          backendState: 'ok',
          backendError: null
        };
        this.backendTelemetry = {
          state: 'ok',
          at: this.lastTelemetryAt,
          latencyMs: null,
          data: { utilization: cpu, cpu_percent: cpu, memory_percent: memory, gpu_utilization: null },
          receiptId: null,
          correlationId: null,
          error: null
        };
        this.hasMeasuredSample = true;
        this.ownerUnavailable = false;
        this.retainedSample = true;
        if (typeof saved.observationStamp === 'string' && saved.observationStamp.startsWith('measured ')) {
          this.observationStamp = saved.observationStamp;
        } else if (typeof last.timestamp === 'number') {
          this.observationStamp = `measured ${this.formatClock(last.timestamp)}`;
        }
      }
      this.updateDiagnosticAnalysis();
    } catch (error) {
      this.historyOrigin = 'fresh samples';
      this.retainedSample = false;
    }
  }

  createDiagnosticRecord(label, timestamp, cpu, memory, gpu, state) {
    const stableId = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return {
      id: `diag-${stableId}`,
      label,
      timestamp,
      cpu,
      memory,
      gpu,
      state,
      sampleCid: null,
      receiptId: VDA_G041_RECEIPTS.diagnosticHistory
    };
  }

  // Builds a telemetry sample from REAL signals only:
  //  - local: browser APIs (JS heap, CPU cores)
  //  - backend: the last real ipfs_accelerate_py telemetry envelope, if any
  // Fields that cannot be measured are null and render as "n/a" — never
  // fabricated.
  createTelemetrySample() {
    const sequence = this.telemetrySequence;
    this.telemetrySequence += 1;
    const timestamp = Date.now();
    const heap = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
    const memory = heap && heap.totalJSHeapSize > 0
      ? Number(((heap.usedJSHeapSize / heap.totalJSHeapSize) * 100).toFixed(1))
      : null;
    const backend = this.backendTelemetry && this.backendTelemetry.state === 'ok'
      ? this.backendTelemetry.data
      : null;

    return {
      sequence,
      timestamp,
      sampleId: `telemetry:system-monitor:g041:${String(sequence).padStart(3, '0')}`,
      sampleCid: null,
      receiptId: backend ? this.backendTelemetry.receiptId : null,
      correlationId: backend ? this.backendTelemetry.correlationId : null,
      // CPU % is not measurable from a browser; backend utilization is real
      // when the accelerate telemetry op has returned.
      cpu: backend && typeof backend.utilization === 'number' ? Number(backend.utilization.toFixed(1)) : null,
      cpuSource: backend ? 'ipfs_accelerate_py telemetry' : null,
      memory,
      memorySource: heap ? 'browser performance.memory' : null,
      gpu: null,
      gpuSource: null,
      network: backend && typeof backend.throughput === 'number' ? Number(backend.throughput.toFixed(1)) : null,
      networkSource: backend ? 'ipfs_accelerate_py telemetry' : null,
      download: null,
      upload: null,
      latency: this.backendTelemetry?.latencyMs ?? null,
      backendState: this.backendTelemetry?.state || 'not-run',
      backendError: this.backendTelemetry?.error || null,
      eventFrontier: backend?.event_frontier || null
    };
  }

  readOwnerTelemetry(native) {
    const owner = 'ipfs_accelerate_py', tool = 'PrometheusMetrics.generate_metrics';
    const receipt = native?.receipt;
    if (native?.ok !== true || native.isError === true || native.error || native.denied === true || native.outcome !== 'executed' || native.owner !== owner || native.tool_id !== tool
        || typeof native.correlation_id !== 'string' || !native.correlation_id.trim()
        || !receipt || typeof receipt.receipt_id !== 'string' || !receipt.receipt_id
        || receipt.owner !== owner || receipt.tool_id !== tool || receipt.outcome !== 'executed'
        || receipt.correlation_id !== native.correlation_id) throw new Error('Executed telemetry owner/correlation receipt is missing');
    let body = native.result, nativeReceipt = null;
    for (let depth = 0; depth < 8 && body && typeof body === 'object' && !Array.isArray(body); depth += 1) {
      if (body.isError === true || body.ok === false || body.success === false || body.error) throw new Error('Telemetry owner returned an error');
      if (body.receipt) nativeReceipt = body.receipt;
      if (Array.isArray(body.content)) {
        const blocks = body.content.filter(block => block.type === 'json' && block.json && typeof block.json === 'object' && !Array.isArray(block.json));
        if (blocks.length !== 1) throw new Error('Telemetry owner returned ambiguous or missing JSON data');
        body = blocks[0].json; continue;
      }
      if (body.result && typeof body.result === 'object') { body = body.result; continue; }
      break;
    }
    const proof = body?.native_provenance;
    if (!body || body.success !== true || body.tool !== tool || !nativeReceipt
        || nativeReceipt.owner !== owner || nativeReceipt.tool !== tool || nativeReceipt.status !== 'ok'
        || proof?.schema !== 'swissknife.native-accelerate-observation.v1' || proof.owner !== owner
        || proof.sdk_class !== 'ipfs_accelerate_py.hf_model_server.monitoring.metrics.PrometheusMetrics'
        || proof.sdk_method !== 'generate_metrics' || proof.correlation_id !== native.correlation_id
        || proof.simulated !== false || proof.echo_fallback !== false || proof.external_provider_called !== false
        || nativeReceipt.native_provenance?.correlation_id !== proof.correlation_id
        || nativeReceipt.native_provenance?.sdk_method !== proof.sdk_method) throw new Error('Native SDK telemetry provenance is missing or mismatched');
    const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
    if (!percent(body.utilization) || !percent(body.cpu_percent) || body.cpu_percent !== body.utilization
        || !percent(body.memory_percent) || body.gpu_utilization !== null
        || typeof body.timestamp !== 'string' || !Number.isFinite(Date.parse(body.timestamp))
        || Math.abs(Date.now() - Date.parse(body.timestamp)) > 120000
        || typeof body.metrics !== 'string' || !body.metrics.trim()) throw new Error('Telemetry has no valid measured CPU/memory sample or timestamp');
    return { output: body, receiptId: receipt.receipt_id, correlationId: native.correlation_id };
  }

  // Calls the REAL ipfs_accelerate_py telemetry operation through the app
  // capability gateway. Cached: at most one call per 30s. Failures are stored
  // verbatim and surface in the UI, never masked.
  ownerFailureMessage(native) {
    const result = native?.result;
    const nested = result && result.owner_error && typeof result.owner_error.message === 'string'
      ? result.owner_error.message.trim() : '';
    const direct = result && typeof result.error === 'string' ? result.error.trim() : '';
    const top = typeof native?.error === 'string' ? native.error.trim() : '';
    return nested || direct || top || 'Telemetry owner failed';
  }

  async refreshBackendTelemetry(force = false, options = {}) {
    const now = Date.now();
    if (!force && this.backendTelemetry.at && (now - this.backendTelemetry.at) < 30000) return this.backendTelemetry;
    const started = Date.now();
    const unsupported = options.unsupported === true;
    try {
      const mountedRoot = this.container;
      const container = mountedRoot?.closest('.window-app-content') || mountedRoot || document.querySelector('.window[data-app-id="system-monitor"] .window-app-content')
        || document.querySelector('.system-monitor-container');
      const trigger = options.trigger
        || container?.querySelector(unsupported ? '#probe-unsupported-observation' : '#refresh-backend-telemetry')
        || document.querySelector(unsupported ? '#probe-unsupported-observation' : '#refresh-backend-telemetry');
      const payload = { fixture_scope: 'svf-system-monitor-live' };
      // The workflow admits only a confirmed call with policy dry_run false.
      // observation_probe is not an observation argument, so observe_native
      // rejects it and the measured sample is left unchanged.
      if (unsupported) payload.observation_probe = 'unsupported';
      const native = await invokeNativeTool(
        container,
        'system-monitor',
        'system-monitor.ipfs_accelerate_py.inspect_telemetry',
        { executionMode: 'execute', toolId: 'PrometheusMetrics.generate_metrics', payload, trigger }
      );
      if (mountedRoot && (!mountedRoot.isConnected || this.container !== mountedRoot)) return this.backendTelemetry;
      if (!native) throw new Error('Telemetry confirmation was cancelled');
      if (native.outcome === 'failed') {
        const receiptId = native?.receipt?.receipt_id;
        // Keep the owner receipt id from this rejected call. The measured
        // sample stays unchanged; the id is not a fabricated observation.
        if (typeof receiptId === 'string' && /^b[a-z2-7]{58}$/.test(receiptId)) this.rejectedProbeReceiptId = receiptId;
        throw new Error(this.ownerFailureMessage(native));
      }
      const telemetry = this.readOwnerTelemetry(native);
      const ownerTimestamp = telemetry.output.timestamp;
      const measuredAt = Date.parse(ownerTimestamp);
      this.backendTelemetry = {
        state: 'ok',
        at: measuredAt,
        latencyMs: measuredAt - started,
        data: telemetry.output,
        receiptId: telemetry.receiptId,
        correlationId: telemetry.correlationId,
        error: null
      };
      this.ownerUnavailable = false;
      this.ownerFailureText = '';
      this.hasMeasuredSample = true;
      const keptBefore = this.diagnosticHistory.length;
      this.retainedSample = false;
      this.historyOrigin = keptBefore > 0
        ? `retained history · ${keptBefore} ${keptBefore === 1 ? 'sample' : 'samples'} · fresh sample`
        : 'measured sample';
      const sample = this.createTelemetrySample();
      sample.timestamp = measuredAt;
      sample.ownerTimestamp = ownerTimestamp;
      sample.measurementSource = typeof telemetry.output.measurement_source === 'string' ? telemetry.output.measurement_source : '';
      sample.utilizationUnit = typeof telemetry.output.utilization_unit === 'string' ? telemetry.output.utilization_unit : 'percent';
      this.telemetrySnapshot = sample;
      this.lastTelemetryAt = measuredAt;
      this.observationStamp = `measured ${this.formatClock(measuredAt)}`;
      if (this.rejectedProbeBefore) {
        const before = this.rejectedProbeBefore;
        this.ownerRejectionNote = `unavailable rejected probe before ${before.percent} ${before.stamp} fresh measured ${this.ownerPercentText(sample.cpu)} ${ownerTimestamp}`;
      } else if (this.ownerRejectionNote) {
        this.ownerRejectionNote = `fresh measured ${this.ownerPercentText(sample.cpu)} ${ownerTimestamp}`;
      }
      const observationNode = document.querySelector('#observation-stamp');
      if (observationNode) observationNode.textContent = this.observationStamp;
      this.recordDiagnosticSample(sample);
      this.chartData.cpu.push(sample.cpu);
      this.chartData.memory.push(sample.memory);
      this.chartData.gpu.push(sample.gpu);
      this.chartData.network.push(sample.network);
      Object.keys(this.chartData).forEach(key => {
        if (this.chartData[key].length > this.maxDataPoints) this.chartData[key].shift();
      });
      this.persistRetainedHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.backendTelemetry = { state: 'error', at: Date.now(), latencyMs: Date.now() - started, data: null, error: message };
      this.ownerUnavailable = true;
      this.ownerFailureText = message;
      const before = this.telemetrySnapshot || {};
      const beforePercent = this.hasMeasuredSample ? this.ownerPercentText(before.cpu) : 'no sample';
      const beforeStamp = typeof before.ownerTimestamp === 'string' && before.ownerTimestamp
        ? before.ownerTimestamp
        : (this.hasMeasuredSample ? this.formatClock(before.timestamp) : 'none');
      this.rejectedProbeBefore = { percent: beforePercent, stamp: beforeStamp };
      this.ownerRejectionNote = `unavailable rejected probe before ${beforePercent} ${beforeStamp}`;
      if (!this.hasMeasuredSample) this.observationStamp = 'unavailable';
    }
    this.collapseBackendDisclosure();
    return this.backendTelemetry;
  }

  collapseBackendDisclosure() {
    const dock = document.querySelector('.window[data-app-id="system-monitor"] [data-testid="backend-status-disclosure"]');
    if (dock) dock.open = false;
  }

  recordDiagnosticSample(sample) {
    const state = (typeof sample.cpu === 'number' && sample.cpu > this.alertThresholds.cpu)
      || (typeof sample.memory === 'number' && sample.memory > this.alertThresholds.memory)
      ? 'alert'
      : 'nominal';
    const record = this.createDiagnosticRecord(
      `live-sample-${sample.sequence}`,
      sample.timestamp,
      sample.cpu,
      sample.memory,
      sample.gpu,
      state
    );
    record.ownerTimestamp = typeof sample.ownerTimestamp === 'string' ? sample.ownerTimestamp : '';
    record.measurementSource = typeof sample.measurementSource === 'string' ? sample.measurementSource : '';
    record.utilizationUnit = typeof sample.utilizationUnit === 'string' ? sample.utilizationUnit : '';
    this.diagnosticHistory.push(record);
    if (this.diagnosticHistory.length > 12) {
      this.diagnosticHistory.shift();
    }
    this.updateDiagnosticAnalysis();
  }

  updateDiagnosticAnalysis() {
    const history = this.diagnosticHistory.length > 0 ? this.diagnosticHistory : [];
    // Averages only over real observed values; nulls (unmeasurable) are
    // excluded rather than counted as zero.
    const realValues = key => history
      .map(record => record[key])
      .filter(value => typeof value === 'number' && !Number.isNaN(value));
    const average = key => {
      const values = realValues(key);
      return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const latest = history[history.length - 1] || this.telemetrySnapshot;
    const cpuValues = realValues('cpu');
    const peakCpu = cpuValues.length ? Math.max(...cpuValues) : null;
    const latestMemory = typeof latest.memory === 'number' ? latest.memory : null;
    const risk = (peakCpu !== null && peakCpu >= this.alertThresholds.cpu)
      || (latestMemory !== null && latestMemory >= this.alertThresholds.memory)
      ? 'elevated'
      : 'normal';
    const averageCpu = average('cpu');
    const trend = (typeof latest.cpu === 'number' && averageCpu !== null)
      ? (latest.cpu >= averageCpu ? 'rising' : 'stable')
      : 'unknown';

    this.diagnosticAnalysis = {
      receiptId: VDA_G041_RECEIPTS.analysis,
      risk,
      trend,
      averageCpu: averageCpu !== null ? Number(averageCpu.toFixed(1)) : null,
      averageMemory: (() => { const v = average('memory'); return v !== null ? Number(v.toFixed(1)) : null; })(),
      averageGpu: (() => { const v = average('gpu'); return v !== null ? Number(v.toFixed(1)) : null; })(),
      peakCpu: peakCpu !== null ? Number(peakCpu.toFixed(1)) : null,
      recommendation: risk === 'elevated'
        ? 'Throttle optional AI workloads and refresh telemetry after remediation.'
        : 'Signals are within the normal range.'
    };
  }

  getStaleDataState() {
    const ageMs = Date.now() - this.lastTelemetryAt;
    const ownerMissing = !this.backendTelemetry || this.backendTelemetry.state !== 'ok';
    const agedOut = this.hasMeasuredSample && ageMs > this.staleThresholdMs;
    const stale = this.ownerUnavailable || ownerMissing || agedOut || !this.hasMeasuredSample;
    return {
      receiptId: VDA_G041_RECEIPTS.staleData,
      state: stale ? 'stale-data' : 'fresh',
      ageMs,
      staleAfterMs: this.staleThresholdMs,
      recovery: 'Refresh live telemetry to replace stale data and keep diagnostic summaries current.'
    };
  }

  staleStateLabel() {
    const stale = this.getStaleDataState();
    const kept = this.diagnosticHistory.length;
    if (stale.state === 'stale-data' && kept > 0) {
      const noun = kept === 1 ? 'sample' : 'samples';
      return `stale-data · ${kept} ${noun} kept`;
    }
    if (this.ownerUnavailable) return 'unavailable';
    return stale.state;
  }

  observedLabel() {
    const clocks = this.diagnosticHistory
      .filter(row => typeof row.timestamp === 'number')
      .map(row => this.formatClock(row.timestamp));
    if (this.ownerUnavailable) {
      const kept = this.diagnosticHistory.length;
      const noun = kept === 1 ? 'sample' : 'samples';
      const clock = clocks.length ? `retained measured ${clocks[0]} · ` : '';
      return `stale · unavailable · ${clock}${kept} ${noun} kept`;
    }
    if (clocks.length === 1) return `${this.retainedSample ? 'retained' : 'fresh'} measured ${clocks[0]}`;
    if (clocks.length > 1) return `retained measured ${clocks[0]} · fresh measured ${clocks[clocks.length - 1]}`;
    return 'stale';
  }

  ownerCpuRows() {
    return this.diagnosticHistory.filter(row => typeof row.cpu === 'number' && typeof row.ownerTimestamp === 'string' && row.ownerTimestamp);
  }

  cpuRowRole(index, count) {
    if (count === 1) return this.retainedSample ? 'retained' : 'measured';
    if (index === 0) return 'retained';
    if (count === 2) return 'fresh';
    if (index === count - 1) return 'recovered';
    return 'reopened';
  }

  seriesCaption() {
    const rows = this.ownerCpuRows();
    const prefix = this.cpuHistoryExpanded ? 'CPU history expanded · ' : 'CPU history · ';
    const at = row => `${this.ownerPercentText(row.cpu)} ${row.ownerTimestamp}`;
    if (rows.length === 0) return `${prefix}no measured CPU samples yet`;
    return prefix + rows.map((row, index) => `${this.cpuRowRole(index, rows.length)} ${at(row)}`).join(' · ');
  }

  ownerPercentText(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
    return `${value}%`;
  }

  appendBrokenIso(parent, iso) {
    const text = typeof iso === 'string' ? iso : '';
    const matched = /^(.*T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}:\d{2}|Z)$/.exec(text);
    if (!matched) {
      parent.append(text);
      return;
    }
    parent.append(matched[1], document.createElement('wbr'), matched[2]);
  }

  writeSeriesCaption(node) {
    if (!node) return;
    const rows = this.ownerCpuRows();
    const prefix = this.cpuHistoryExpanded ? 'CPU history expanded · ' : 'CPU history · ';
    node.replaceChildren();
    node.append(prefix);
    if (rows.length === 0) {
      node.append('no measured CPU samples yet');
      return;
    }
    rows.forEach((row, index) => {
      if (index > 0) node.append(' · ');
      node.append(`${this.cpuRowRole(index, rows.length)} ${this.ownerPercentText(row.cpu)} `);
      this.appendBrokenIso(node, row.ownerTimestamp);
    });
  }

  writeFailureStatus(node) {
    if (!node) return;
    const note = this.ownerRejectionNote || '';
    node.classList.toggle('owner-failure-visible', note.length > 0);
    if (typeof this.rejectedProbeReceiptId === 'string') node.dataset.ownerReceipt = this.rejectedProbeReceiptId;
    else delete node.dataset.ownerReceipt;
    node.replaceChildren();
    if (!note) return;
    const iso = typeof this.telemetrySnapshot?.ownerTimestamp === 'string' ? this.telemetrySnapshot.ownerTimestamp : '';
    if (iso && note.includes(iso)) {
      const index = note.indexOf(iso);
      node.append(note.slice(0, index));
      this.appendBrokenIso(node, iso);
      const after = note.slice(index + iso.length);
      if (after) node.append(after);
      return;
    }
    node.append(note);
  }

  writeCpuObservationMeta(node) {
    if (!node) return;
    const sample = this.telemetrySnapshot || {};
    const source = typeof sample.measurementSource === 'string' && sample.measurementSource
      ? sample.measurementSource
      : 'source not measured';
    const unit = typeof sample.utilizationUnit === 'string' && sample.utilizationUnit
      ? sample.utilizationUnit
      : 'percent';
    const stale = this.getStaleDataState();
    const age = this.hasMeasuredSample
      ? `${Math.max(0, Math.round(stale.ageMs / 1000))}s · ${stale.state}`
      : 'unavailable';
    node.replaceChildren();
    if (typeof sample.cpu === 'number' && Number.isFinite(sample.cpu)) node.append(`${this.ownerPercentText(sample.cpu)} · `);
    node.append(`unit ${unit} · ${source} · stale age ${age}`);
    if (typeof sample.ownerTimestamp === 'string' && sample.ownerTimestamp) {
      node.append(' · ');
      this.appendBrokenIso(node, sample.ownerTimestamp);
    }
  }

  getAccessibleSummaryText() {
    const stale = this.getStaleDataState();
    const alertCount = this.activeAlerts.length;
    const snapshot = this.telemetrySnapshot;
    const backendNote = snapshot.backendState === 'ok'
      ? `backend telemetry ok (${snapshot.cpuSource || 'accelerate'})`
      : `backend telemetry ${snapshot.backendState}${snapshot.backendError ? `: ${snapshot.backendError}` : ''}`;
    return [
      `Accessible summary: CPU ${this.formatMetric(snapshot.cpu, '%')}`,
      `memory ${this.formatMetric(snapshot.memory, '%')}`,
      `GPU ${this.formatMetric(snapshot.gpu, '%')}`,
      `network ${this.formatMetric(snapshot.network, ' MB/s')}`,
      backendNote,
      `${this.diagnosticHistory.length} diagnostic history samples`,
      `${alertCount} alert state ${alertCount === 1 ? 'entry' : 'entries'}`,
      `${stale.state} telemetry age ${Math.round(stale.ageMs / 1000)} seconds`,
      VDA_G041_RECEIPTS.accessibleSummary
    ].join('; ');
  }

  formatClock(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  detectOS() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Win')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown OS';
  }

  detectArchitecture() {
    // Use platform API if available
    if (navigator.platform) {
      if (navigator.platform.includes('64')) return 'x64';
      if (navigator.platform.includes('32')) return 'x86';
    }
    // Default based on common modern systems
    return 'x64';
  }

  detectTotalMemory() {
    if (navigator.deviceMemory) {
      return navigator.deviceMemory * 1024 * 1024 * 1024;
    }
    return null;
  }

  detectAvailableMemory() {
    return null;
  }

  detectCPUModel() {
    const cores = navigator.hardwareConcurrency;
    return typeof cores === 'number' && cores > 0 ? `${cores} logical processors` : 'CPU model unavailable';
  }

  detectGPUModel() {
    return 'Utilization unavailable in this browser';
  }

  createWindow() {
    const content = `
      <div class="system-monitor-container">
        <!-- Navigation Tabs -->
        <div class="monitor-header">
          <div class="view-tabs">
            <button class="view-tab ${this.currentView === 'overview' ? 'active' : ''}" data-view="overview" aria-label="Overview">
              <span class="tab-icon" aria-hidden="true">📊</span>
              <span class="tab-text">Overview</span>
            </button>
            <button class="view-tab ${this.currentView === 'processes' ? 'active' : ''}" data-view="processes" aria-label="Processes">
              <span class="tab-icon" aria-hidden="true">⚡</span>
              <span class="tab-text">Processes</span>
            </button>
            <button class="view-tab ${this.currentView === 'network' ? 'active' : ''}" data-view="network" aria-label="Network">
              <span class="tab-icon" aria-hidden="true">🌐</span>
              <span class="tab-text">Network</span>
            </button>
            <button class="view-tab ${this.currentView === 'storage' ? 'active' : ''}" data-view="storage" aria-label="Storage">
              <span class="tab-icon" aria-hidden="true">💾</span>
              <span class="tab-text">Storage</span>
            </button>
            <button class="view-tab ${this.currentView === 'performance' ? 'active' : ''}" data-view="performance" aria-label="Performance">
              <span class="tab-icon" aria-hidden="true">📈</span>
              <span class="tab-text">Performance</span>
            </button>
          </div>
          
          <div class="monitor-controls">
            <button class="control-btn" id="refresh-btn" title="Refresh" aria-label="Refresh live telemetry" data-svd-workflow="${VDA_G041_WORKFLOW}" data-svd-workflow-action="refresh-live-telemetry" data-capability-id="ipfs.accelerate.operation.telemetry">🔄</button>
            <button class="control-btn" id="alerts-btn" title="Alerts" aria-label="Review alert state" data-svd-workflow-action="review-alert-state">🚨</button>
            <button class="control-btn" id="export-btn" title="Export Data" aria-label="Export diagnostic history" data-svd-workflow-action="export-diagnostic-history">📤</button>
          </div>
        </div>

        <!-- System Status Bar -->
        <div class="status-bar">
          <div class="status-item">
            <span class="status-icon">🖥️</span>
            <span class="status-text">CPU: <span id="cpu-status">n/a</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">🧠</span>
            <span class="status-text">RAM: <span id="memory-status">n/a</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">🎮</span>
            <span class="status-text">GPU: <span id="gpu-status">n/a</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">🌐</span>
            <span class="status-text">Network: <span id="network-status">n/a</span></span>
          </div>
          <div class="status-item observation-status">
            <div class="status-text" id="cpu-series-caption">${this.seriesCaption()}</div>
            <div class="status-text" id="owner-failure-status">${this.ownerRejectionNote}</div>
          </div>
        </div>

        <div class="monitor-toolbar" id="monitor-toolbar">
          <button id="refresh-backend-telemetry" type="button">Refresh metrics</button>
          <button id="probe-unsupported-observation" type="button">Check owner availability</button>
          <button id="expand-cpu-history" type="button" aria-expanded="false">CPU history</button>
        </div>

        <!-- Main Content Area -->
        <div class="monitor-content" id="monitor-content">
          ${this.renderContentForView()}
        </div>

        <!-- Alert Panel -->
        <div class="alert-panel" id="alert-panel" style="display: none;">
          <div class="alert-header">
            <h3>🚨 System Alerts</h3>
            <button class="close-btn" id="close-alerts">×</button>
          </div>
          <div class="alert-list" id="alert-list">
            <!-- Alerts will be populated here -->
          </div>
        </div>
      </div>

      <style>
        .window[data-app-id="system-monitor"] .window-content { display:flex; flex-direction:column; min-height:0; overflow:hidden; padding-bottom:8px; }
        .window[data-app-id="system-monitor"] .window-app-content { display:flex; flex-direction:column; flex:1 1 0px; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="system-monitor"] .window-app-content > [id$="-content"] { display:flex; flex-direction:column; flex:1 1 0px; align-self:stretch; width:100%; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="system-monitor"] .system-monitor-container { flex:1 1 0px; height:auto; min-height:0; min-width:0; }
        .window[data-app-id="system-monitor"] .live-tool-gateway-host { flex:0 0 auto; min-height:0; max-height:88px; overflow:auto; position:relative; z-index:6; background:var(--sk-bg2,#101b18); }
        .window[data-app-id="system-monitor"] .observation-status { display:flex; flex-direction:column; align-items:stretch; gap:4px; flex:1 0 100%; min-width:100%; white-space:normal; overflow-wrap:normal; word-break:normal; }
        .window[data-app-id="system-monitor"] #cpu-series-caption,
        .window[data-app-id="system-monitor"] #owner-failure-status { display:block; width:100%; max-width:100%; white-space:normal; overflow-wrap:normal; word-break:normal; line-height:1.35; font-size:12px; color:#edf7f2; }
        .window[data-app-id="system-monitor"] #owner-failure-status.owner-failure-visible { color:#1c1406; background:#f3d48a; border-radius:4px; padding:2px 6px; }
        .window[data-app-id="system-monitor"] .monitor-controls { display:none; }
        .window[data-app-id="system-monitor"] #cpu-observation-meta,
        .window[data-app-id="system-monitor"] #network-observation-meta,
        .window[data-app-id="system-monitor"] #gpu-observation-meta { opacity:1; color:#d5e6de; font-size:12px; line-height:1.35; white-space:normal; overflow-wrap:normal; word-break:normal; }
        .window[data-app-id="system-monitor"] .monitor-toolbar { flex:0 0 auto; display:flex; flex-wrap:wrap; gap:6px; padding:6px 12px; background:#101b18; position:relative; z-index:5; }
        .window[data-app-id="system-monitor"] .monitor-toolbar button { position:static; min-height:32px; padding:6px 10px; background:#17352c; color:#edf7f2; border:1px solid #3d6b5e; border-radius:6px; font-size:12px; line-height:1.2; white-space:normal; overflow-wrap:normal; word-break:normal; }
        .window[data-app-id="system-monitor"] button:focus-visible { outline:2px solid #5eead4; outline-offset:2px; }
        .window[data-app-id="system-monitor"] [data-testid="backend-status-disclosure"]:not([open]) { position:absolute; width:1px; height:1px; margin:0; padding:0; overflow:hidden; clip-path:inset(50%); }
        .window[data-app-id="system-monitor"] [data-testid="backend-status-disclosure"][open] { position:relative; width:auto; height:auto; max-height:112px; overflow:auto; clip-path:none; }
        @media (max-width: 768px) {
          .window[data-app-id="system-monitor"] .monitor-controls { display:none; }
          .window[data-app-id="system-monitor"] .monitor-header { min-width:0; overflow:hidden; }
          .window[data-app-id="system-monitor"] .view-tabs { min-width:0; }
        }
        .window[data-app-id="system-monitor"] .chart-canvas { display:block; width:100%; height:100%; }
        .window[data-app-id="system-monitor"] .chart-container { height:64px; overflow:hidden; }
        .window[data-app-id="system-monitor"] .chart-container.chart-empty { height:22px; }
        .window[data-app-id="system-monitor"] .metric-card { overflow-wrap:normal; word-break:normal; }
        @media (min-width: 769px) {
          .window[data-app-id="system-monitor"] .monitor-content > .overview-content { height:100%; }
          .window[data-app-id="system-monitor"] .overview-content > .overview-grid { height:100%; grid-auto-rows:1fr; }
          .window[data-app-id="system-monitor"] .overview-grid > .metric-card { height:100%; min-height:0; }
          .window[data-app-id="system-monitor"] .chart-container { height:72px; }
        }
        .system-monitor-container > .monitor-header, .system-monitor-container > .status-bar, .system-monitor-container > .monitor-toolbar { flex:0 0 auto; }
        .system-monitor-container > .monitor-content { flex:1 1 0px; min-height:0; overflow-y:auto; overflow-x:hidden; }
        .system-monitor-container {
          height: 100%;
          background: var(--sk-bg, #0e1412);
          color: var(--sk-text, #edf7f2);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .monitor-header {
          padding: 12px 16px;
          background: var(--sk-bg2, #101b18);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--sk-border, #263a34);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .view-tabs {
          display: flex;
          gap: 4px;
          flex: 1 1 auto;
          flex-wrap: nowrap;
          min-width: 0;
          overflow-x: auto;
        }

        .view-tab {
          padding: 8px 16px;
          background: var(--sk-bg3, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px;
          color: var(--sk-text, #edf7f2);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .view-tab:hover {
          background: var(--sk-card, #17241f);
          transform: translateY(-1px);
        }

        .view-tab.active {
          background: var(--sk-accent-bg, #173029);
          color: var(--sk-accent, #8bd8bd);
          border-color: var(--sk-accent-strong, #5fb99d);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .monitor-controls {
          display: flex;
          gap: 8px;
          flex: 0 0 auto;
        }

        .control-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--sk-border, #263a34);
          background: var(--sk-bg3, #12211d);
          color: var(--sk-text, #edf7f2);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-btn:hover {
          background: var(--sk-card, #17241f);
          transform: scale(1.05);
        }

        .status-bar {
          position: relative;
          z-index: 4;
          padding: 8px 16px;
          background: var(--sk-bg2, #101b18);
          border-bottom: 1px solid var(--sk-border, #263a34);
          display: flex;
          flex-wrap: wrap;
          gap: 12px 24px;
          overflow-x: auto;
        }
        .telemetry-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 12px;
        }
        .telemetry-actions .sk-btn { position: static; }

        .status-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          white-space: nowrap;
        }

        .status-icon {
          font-size: 14px;
        }

        .monitor-content {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
        }

        /* Overview Styles */
        .overview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .metric-card {
          background: var(--sk-card, #17241f);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid var(--sk-border, #263a34);
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .metric-title {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .metric-value {
          font-size: 24px;
          font-weight: 300;
          margin-bottom: 8px;
        }

        .metric-subtitle {
          font-size: 12px;
          opacity: 0.7;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: var(--sk-bg2, #101b18);
          border-radius: 4px;
          overflow: hidden;
          margin-top: 8px;
        }

        .progress-fill {
          width: 0%;
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
          animation: none;
        }

        .progress-cpu { background: linear-gradient(90deg, #60a5fa, #3b82f6); }
        .progress-memory { background: linear-gradient(90deg, #34d399, #10b981); }
        .progress-gpu { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
        .progress-network { background: linear-gradient(90deg, #a78bfa, #8b5cf6); }

        .chart-container {
          height: 150px;
          margin-top: 12px;
          background: var(--sk-bg2, #101b18);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px;
          position: relative;
          overflow: hidden;
        }

        .chart-svg {
          width: 100%;
          height: 100%;
        }

        /* Process Table Styles */
        .process-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          gap: 16px;
        }

        .process-search {
          flex: 1;
          max-width: 300px;
        }

        .search-input {
          width: 100%;
          padding: 8px 12px;
          background: var(--sk-bg2, #101b18);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px;
          color: var(--sk-text, #edf7f2);
          font-size: 14px;
        }

        .search-input::placeholder {
          color: var(--sk-text-faint, #7c8f87);
        }

        .process-filters {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .filter-select {
          padding: 6px 12px;
          background: var(--sk-bg2, #101b18);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 6px;
          color: var(--sk-text, #edf7f2);
          font-size: 12px;
        }

        .process-table {
          width: 100%;
          background: var(--sk-card, #17241f);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px;
          overflow: hidden;
        }

        .process-table th,
        .process-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--sk-border, #263a34);
          font-size: 13px;
        }

        .process-table th {
          background: var(--sk-bg3, #12211d);
          color: var(--sk-text-dim, #a8bbb2);
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.04em;
        }

        .process-table th:hover {
          background: var(--sk-card, #17241f);
        }

        .process-table tr:hover {
          background: var(--sk-bg3, #12211d);
        }

        .process-status {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-running {
          background: rgba(94, 227, 161, 0.14);
          color: var(--sk-ok, #5ee3a1);
        }

        .status-stopped {
          background: rgba(255, 107, 107, 0.14);
          color: var(--sk-err, #ff6b6b);
        }

        /* Network Styles */
        .network-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .network-interface {
          background: var(--sk-card, #17241f);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 12px;
          padding: 16px;
          border-left: 4px solid var(--sk-ok, #5ee3a1);
        }

        .interface-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .interface-name {
          font-weight: 600;
          font-size: 16px;
        }

        .interface-status {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-connected {
          background: rgba(94, 227, 161, 0.14);
          color: var(--sk-ok, #5ee3a1);
        }

        .status-disconnected {
          background: rgba(255, 107, 107, 0.14);
          color: var(--sk-err, #ff6b6b);
        }

        .interface-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
        }

        .interface-detail {
          display: flex;
          justify-content: space-between;
        }

        /* Storage Styles */
        .storage-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .storage-device {
          background: var(--sk-card, #17241f);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 12px;
          padding: 16px;
          border-left: 4px solid var(--sk-warn, #ffd166);
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .device-name {
          font-weight: 600;
          font-size: 16px;
        }

        .device-type {
          padding: 4px 8px;
          background: rgba(255, 209, 102, 0.14);
          color: var(--sk-warn, #ffd166);
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
        }

        .storage-bar {
          margin-top: 12px;
        }

        .storage-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px;
        }

        /* Alert Panel */
        .alert-panel {
          position: absolute;
          top: 60px;
          right: 16px;
          width: 350px;
          background: var(--sk-bg2, #101b18);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid var(--sk-border, #263a34);
          max-height: 400px;
          z-index: 1000;
        }

        .alert-header {
          padding: 16px;
          border-bottom: 1px solid var(--sk-border, #263a34);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .close-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 107, 107, 0.2);
          color: var(--sk-text, #edf7f2);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .alert-list {
          max-height: 300px;
          overflow-y: auto;
          padding: 8px;
        }

        .alert-item {
          padding: 12px;
          background: rgba(255, 107, 107, 0.08);
          border-left: 4px solid var(--sk-err, #ff6b6b);
          border-radius: 6px;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .alert-item.warning {
          background: rgba(255, 209, 102, 0.08);
          border-left-color: var(--sk-warn, #ffd166);
        }

        .alert-item.info {
          background: rgba(139, 216, 189, 0.08);
          border-left-color: var(--sk-accent, #8bd8bd);
        }

        .vda-workflow {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid var(--sk-border, #263a34);
        }

        .vda-workflow h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .vda-workflow-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }

        .vda-workflow-card {
          min-height: 0;
          min-width: 0;
          height: auto;
          overflow: visible;
          overflow-wrap: anywhere;
          word-break: break-word;
          background: var(--sk-card, #17241f);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 8px;
          padding: 12px;
        }

        .vda-workflow-label {
          display: block;
          margin-bottom: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--sk-text-dim, #a8bbb2);
        }

        .vda-workflow-card strong {
          display: block;
          margin-bottom: 5px;
          font-size: 15px;
        }

        .detail-lines {
          margin-top: 12px;
          font-size: 13px;
          line-height: 1.65;
          color: var(--sk-text-dim, #a8bbb2);
        }
        .detail-lines strong {
          color: var(--sk-text, #edf7f2);
          font-weight: 600;
        }

        .vda-workflow-card span:last-child,
        .vda-workflow-card div {
          font-size: 12px;
          line-height: 1.45;
          color: var(--sk-text-dim, #a8bbb2);
        }

        .sr-telemetry-summary {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* Animations */
        .pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .monitor-header {
            align-items: stretch;
            flex-direction: column;
          }

          .view-tabs {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            overflow: visible;
          }

          .monitor-controls {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .control-btn {
            width: 100%;
          }
          
          .view-tab {
            padding: 6px 2px;
            gap: 2px;
            justify-content: center;
            text-align: center;
          }

          .tab-text {
            display: block;
            font-size: 9px;
            line-height: 1.05;
            white-space: normal;
          }
          
          .status-bar {
            flex-wrap: wrap;
          }
          
          .overview-grid {
            grid-template-columns: 1fr;
          }
          
          .process-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .chart-container { height: 56px; }
          .window[data-app-id="system-monitor"] .chart-container { height: 52px; }
          .window[data-app-id="system-monitor"] .chart-container.chart-empty { height: 22px; }
          .metric-card { padding: 8px; }
          .metric-value { font-size: 18px; }
          .vda-workflow-grid { grid-template-columns: 1fr; }
        }
      </style>
    `;

    return {
      title: 'System Monitor',
      content,
      width: 900,
      height: 650,
      x: 150,
      y: 75
    };
  }

  renderContentForView() {
    switch (this.currentView) {
      case 'overview':
        return this.renderOverviewContent();
      case 'processes':
        return this.renderProcessesContent();
      case 'network':
        return this.renderNetworkContent();
      case 'storage':
        return this.renderStorageContent();
      case 'performance':
        return this.renderPerformanceContent();
      default:
        return this.renderOverviewContent();
    }
  }

  renderOverviewContent() {
    return `
      <div class="overview-content">
        <div class="overview-grid">
          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🖥️</span>
                <span>CPU Usage</span>
              </div>
              <span class="metric-value" id="cpu-metric">n/a</span>
            </div>
            <div class="metric-subtitle" id="cpu-observation-meta">source not measured · unit percent · stale age unavailable</div>
            <div class="progress-bar">
              <div class="progress-fill progress-cpu" id="cpu-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="cpu-chart" class="chart-canvas"></canvas>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🧠</span>
                <span>Memory Usage</span>
              </div>
              <span class="metric-value" id="memory-metric">n/a</span>
            </div>
            <div class="metric-subtitle">${this.formatBytes(this.systemInfo.totalMemory)} Total</div>
            <div class="progress-bar">
              <div class="progress-fill progress-memory" id="memory-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="memory-chart" class="chart-canvas"></canvas>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🎮</span>
                <span>GPU Usage</span>
              </div>
              <span class="metric-value" id="gpu-metric">n/a</span>
            </div>
            <div class="metric-subtitle" id="gpu-observation-meta">${this.systemInfo.gpuModel} · stale age unavailable</div>
            <div class="progress-bar">
              <div class="progress-fill progress-gpu" id="gpu-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="gpu-chart" class="chart-canvas"></canvas>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🌐</span>
                <span>Network Activity</span>
              </div>
              <span class="metric-value" id="network-metric">n/a</span>
            </div>
            <div class="metric-subtitle" id="network-observation-meta">no throughput sample · stale age unavailable</div>
            <div class="progress-bar">
              <div class="progress-fill progress-network" id="network-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="network-chart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <div class="system-summary">
          <h3>System Information</h3>
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>ℹ️</span>
                <span>System Details</span>
              </div>
              <div class="detail-lines">
                <div><strong>OS:</strong> ${this.systemInfo.os} ${this.systemInfo.version}</div>
                <div><strong>Architecture:</strong> ${this.systemInfo.architecture}</div>
                <div><strong>CPU Cores:</strong> ${this.systemInfo.cpuCores}</div>
                <div><strong>Observed:</strong> <span id="detailed-uptime">stale</span></div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🔗</span>
                <span>P2P Network</span>
              </div>
              <div class="detail-lines">
                <div><strong>Status:</strong> <span id="p2p-local-status">checking…</span></div>
                <div><strong>Peers:</strong> <span id="p2p-local-peers">n/a</span></div>
                <div><strong>Note:</strong> local browser P2P state only.</div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🌐</span>
                <span>IPFS Node</span>
              </div>
              <div class="detail-lines">
                <div><strong>Status:</strong> <span id="ipfs-node-status">not queried</span></div>
                <div><strong>Peer ID:</strong> <span id="ipfs-node-id">n/a</span></div>
                <div><strong>Pins:</strong> <span id="ipfs-pin-count">n/a</span></div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>⚡</span>
                <span>Accelerate Telemetry</span>
              </div>
              <div class="detail-lines">
                <div><strong>State:</strong> <span id="accel-telemetry-state">unavailable: not run</span></div>
                <div><strong>Utilization:</strong> <span id="accel-telemetry-util">n/a</span></div>
                <div><strong>Throughput:</strong> <span id="accel-telemetry-tput">n/a</span></div>
              </div>
            </div>
          </div>
        </div>
        ${this.renderVdaG041Workflow()}
      </div>
    `;
  }

  renderVdaG041Workflow() {
    const latest = this.telemetrySnapshot;
    const analysis = this.diagnosticAnalysis;
    const stale = this.getStaleDataState();
    const latestHistory = this.diagnosticHistory[this.diagnosticHistory.length - 1] || latest;
    const alert = this.activeAlerts[0] || {
      severity: 'info',
      message: 'No active alert state entries.',
      receiptId: VDA_G041_RECEIPTS.alertState
    };
    const accessibleSummary = this.getAccessibleSummaryText();
    const sampleCidText = latest.sampleCid ? 'Persisted sample' : 'Not persisted';

    return `
      <section class="vda-workflow" data-svd-workflow="${VDA_G041_WORKFLOW}" aria-labelledby="vda-g041-title">
        <h3 id="vda-g041-title">Diagnostic Workflow</h3>
        <div class="vda-workflow-grid">
          <div class="vda-workflow-card" data-svd-vda-marker="live-telemetry">
            <span class="vda-workflow-label">Live telemetry</span>
            <strong id="vda-live-cpu">CPU ${this.formatMetric(latest.cpu, '%')} / RAM ${this.formatMetric(latest.memory, '%')}</strong>
            <div id="vda-live-sample">${sampleCidText}. Backend ${latest.backendState}${latest.backendError ? `: ${latest.backendError}` : ''}</div>
            <button id="vda-persist-sample" class="btn btn-small sk-btn" style="margin-top:6px;">Persist sample to IPFS</button>
          </div>
          <div class="vda-workflow-card" data-svd-vda-marker="diagnostic-history">
            <span class="vda-workflow-label">Diagnostic history</span>
            <strong id="vda-history-count">${this.diagnosticHistory.length} samples retained</strong>
            <div id="vda-history-origin">${this.historyOrigin}</div>
            <div id="vda-history-summary">${latestHistory.label ? `Latest sample at ${this.formatClock(latestHistory.timestamp)}` : 'No samples observed yet'}. ${latestHistory.sampleCid ? 'Persisted' : 'Not persisted'}.</div>
          </div>
          <div class="vda-workflow-card" data-svd-vda-marker="analysis">
            <span class="vda-workflow-label">Analysis</span>
            <strong id="vda-analysis-risk">${analysis.risk} risk / ${analysis.trend} trend</strong>
            <div id="vda-analysis-summary">Average CPU ${this.formatMetric(analysis.averageCpu, '%')}, memory ${this.formatMetric(analysis.averageMemory, '%')}, GPU ${this.formatMetric(analysis.averageGpu, '%')}. ${analysis.recommendation}</div>
          </div>
          <div class="vda-workflow-card" data-svd-vda-marker="stale-data">
            <span class="vda-workflow-label">Stale-data guard</span>
            <strong id="vda-stale-state">${this.staleStateLabel()}</strong>
            <div id="observation-stamp">${this.observationStamp}</div>
            <div>Age ${Math.round(stale.ageMs / 1000)}s. Stale after ${Math.round(stale.staleAfterMs / 1000)}s. ${stale.recovery}</div>
          </div>
          <div class="vda-workflow-card" data-svd-vda-marker="alert-state">
            <span class="vda-workflow-label">Alert state</span>
            <strong id="vda-alert-state">${alert.severity}</strong>
            <div>${alert.message}; ${alert.receiptId}</div>
          </div>
          <div class="vda-workflow-card" data-svd-vda-marker="accessible-summaries">
            <span class="vda-workflow-label">Accessible summaries</span>
            <strong id="vda-accessible-heading">Screen-reader telemetry summary</strong>
            <div id="vda-accessible-summary" role="status" aria-live="polite">${accessibleSummary}</div>
            <div class="sr-telemetry-summary">${accessibleSummary}</div>
          </div>
        </div>
      </section>
    `;
  }

  renderProcessesContent() {
    return `
      <div class="processes-content">
        <p class="demo-data-note sk-honest-note">Illustrative demo data — a browser cannot enumerate OS processes, so this table is a static example, not live system state.</p>
        <div class="process-controls">
          <div class="process-search">
            <input type="text" class="search-input" id="process-search" placeholder="Search processes...">
          </div>
          <div class="process-filters">
            <select class="filter-select" id="sort-by">
              <option value="cpu">Sort by CPU</option>
              <option value="memory">Sort by Memory</option>
              <option value="name">Sort by Name</option>
              <option value="pid">Sort by PID</option>
            </select>
            <select class="filter-select" id="sort-order">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <label style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
              <input type="checkbox" id="show-system"> Show System
            </label>
          </div>
        </div>

        <table class="process-table">
          <thead>
            <tr>
              <th data-sort="name">Process Name</th>
              <th data-sort="pid">PID</th>
              <th data-sort="cpu">CPU %</th>
              <th data-sort="memory">Memory</th>
              <th data-sort="status">Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="process-list">
            ${this.renderProcessList()}
          </tbody>
        </table>
      </div>
    `;
  }

  renderProcessList() {
    return this.mockProcesses.map(process => `
      <tr data-pid="${process.pid}">
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>📋</span>
            <span>${process.name}</span>
          </div>
        </td>
        <td>${process.pid}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${process.cpu}%</span>
            <div class="progress-bar" style="width: 50px; height: 4px;">
              <div class="progress-fill progress-cpu" style="width: ${process.cpu}%"></div>
            </div>
          </div>
        </td>
        <td>${this.formatBytes(process.memory)}</td>
        <td>
          <span class="process-status status-${process.status}"><span class="sk-status-dot ${process.status === 'running' ? 'is-ok' : 'is-err'}"></span>${process.status}</span>
        </td>
        <td>
          <button class="control-btn" style="width: 24px; height: 24px; font-size: 10px;" 
                  onclick="this.parentElement.parentElement.style.opacity = '0.5'"
                  title="Terminate Process">×</button>
        </td>
      </tr>
    `).join('');
  }

  renderNetworkContent() {
    return `
      <div class="network-content">
        <p class="demo-data-note sk-honest-note">Illustrative demo data — interface names and speeds are static examples; use the Overview tab's IPFS query for live node state.</p>
        <div class="network-grid">
          ${this.networkInterfaces.map(netInterface => `
            <div class="network-interface">
              <div class="interface-header">
                <div class="interface-name">${netInterface.name}</div>
                <div class="interface-status status-${netInterface.status}">${netInterface.status}</div>
              </div>
              <div class="interface-details">
                <div class="interface-detail">
                  <span>Type:</span>
                  <span>${netInterface.type}</span>
                </div>
                <div class="interface-detail">
                  <span>Speed:</span>
                  <span>${netInterface.speed || 'N/A'}</span>
                </div>
                ${netInterface.peers ? `
                  <div class="interface-detail">
                    <span>Peers:</span>
                    <span>${netInterface.peers}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="network-statistics" style="margin-top: 24px;">
          <h3>Network Statistics</h3>
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>📊</span>
                <span>Traffic Analysis</span>
              </div>
              <div class="detail-lines">
                <div class="chart-container" style="height: 200px;">
                  <canvas id="traffic-chart" class="chart-canvas"></canvas>
                </div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🔗</span>
                <span>Connection Status</span>
              </div>
              <div class="detail-lines">
                <div><strong>Active Connections:</strong> n/a</div>
                <div><strong>P2P Peers:</strong> n/a</div>
                <div><strong>IPFS Peers:</strong> n/a</div>
                <div><strong>Latency:</strong> n/a</div>
                <div><strong>Packet Loss:</strong> n/a</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderStorageContent() {
    return `
      <div class="storage-content">
        <p class="demo-data-note sk-honest-note">Illustrative demo data — drive capacities are static examples, not live disk state.</p>
        <div class="storage-list">
          ${this.storageDevices.map(device => {
            const usedPercent = device.total > 0 ? (device.used / device.total) * 100 : 0;
            const freeSpace = device.total > 0 ? device.total - device.used : 0;
            
            return `
              <div class="storage-device">
                <div class="device-header">
                  <div class="device-name">${device.name}</div>
                  <div class="device-type">${device.type}</div>
                </div>
                <div class="storage-bar">
                  <div class="storage-info">
                    <span>${this.formatBytes(device.used)} used</span>
                    <span>${device.total > 0 ? this.formatBytes(freeSpace) + ' free' : 'Distributed Storage'}</span>
                  </div>
                  ${device.total > 0 ? `
                    <div class="progress-bar">
                      <div class="progress-fill progress-memory" style="width: ${usedPercent}%"></div>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="storage-analysis" style="margin-top: 24px;">
          <h3>Storage Analysis</h3>
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>📈</span>
                <span>Disk I/O Performance</span>
              </div>
              <div class="detail-lines">
                <div class="chart-container" style="height: 150px;">
                  <canvas id="disk-io-chart" class="chart-canvas"></canvas>
                </div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🗂️</span>
                <span>File System Stats</span>
              </div>
              <div class="detail-lines">
                <div><strong>Total Files:</strong> n/a</div>
                <div><strong>Total Folders:</strong> n/a</div>
                <div><strong>Largest File:</strong> n/a</div>
                <div><strong>Avg. File Size:</strong> n/a</div>
                <div><strong>Fragmentation:</strong> n/a</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPerformanceContent() {
    return `
      <div class="performance-content">
        <div class="performance-charts">
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>📊</span>
                <span>CPU Performance History</span>
              </div>
              <div class="chart-container" style="height: 200px;">
                <canvas id="cpu-history-chart" class="chart-canvas"></canvas>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🧠</span>
                <span>Memory Performance History</span>
              </div>
              <div class="chart-container" style="height: 200px;">
                <canvas id="memory-history-chart" class="chart-canvas"></canvas>
              </div>
            </div>
          </div>

          <div class="overview-grid" style="margin-top: 16px;">
            <div class="metric-card">
              <div class="metric-title">
                <span>🌡️</span>
                <span>Temperature Monitoring</span>
              </div>
              <div class="detail-lines">
                <div><strong>CPU Temperature:</strong> n/a</div>
                <div><strong>GPU Temperature:</strong> n/a</div>
                <div><strong>System Temperature:</strong> n/a</div>
                <div><strong>Fan Speed:</strong> n/a</div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>⚡</span>
                <span>Performance Metrics</span>
              </div>
              <div class="detail-lines">
                <div><strong>Boot Time:</strong> n/a</div>
                <div><strong>AI Model Load Time:</strong> n/a</div>
                <div><strong>P2P Connection Time:</strong> n/a</div>
                <div><strong>IPFS Sync Time:</strong> n/a</div>
                <div><strong>Overall Score:</strong> n/a</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventHandlers(container) {
    this.container = container;
    if (this._toolbarRoot === container) { this.setupContentEventHandlers(container); return; }
    this._toolbarRoot = container;
    // View tab switching
    container.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchView(tab.dataset.view);
      });
    });

    // Control buttons
    container.querySelector('#refresh-btn').addEventListener('click', () => {
      this.refreshData();
    });

    container.querySelector('#alerts-btn').addEventListener('click', () => {
      this.toggleAlerts();
    });

    container.querySelector('#export-btn').addEventListener('click', () => {
      this.exportData();
    });

    this.setupContentEventHandlers(container);

    this.updateP2PLocalCard();
    this.updateBackendTelemetryCard();

    const closeAlerts = container.querySelector('#close-alerts');
    if (closeAlerts) {
      closeAlerts.addEventListener('click', () => {
        const alertPanel = container.querySelector('#alert-panel');
        if (alertPanel) alertPanel.style.display = 'none';
      });
    }

    // Process table sorting
    container.querySelectorAll('[data-sort]').forEach(header => {
      header.addEventListener('click', () => {
        this.sortProcesses(header.dataset.sort);
      });
    });

    // Process search and filters
    const searchInput = container.querySelector('#process-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.filterProcesses();
      });
    }

    // Start real-time updates
    this.startRealTimeUpdates();

    // Initialize charts
    setTimeout(() => this.initializeCharts(), 100);
  }

  switchView(newView) {
    this.currentView = newView;
    this.refreshContent();
  }

  refreshContent() {
    const container = this.container || document.querySelector('.system-monitor-container');
    if (!container || !container.isConnected) return;

    // Update active tab
    container.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === this.currentView);
    });

    // Update content
    const contentArea = container.querySelector('#monitor-content');
    contentArea.innerHTML = this.renderContentForView();

    // Re-setup event handlers for new content
    this.setupContentEventHandlers();

    // Reinitialize charts if needed
    setTimeout(() => this.initializeCharts(), 100);
  }

  setupContentEventHandlers(container = this.container || document.querySelector('.system-monitor-container')) {
    if (!container || !container.isConnected) return;
    this._contentBound ||= new WeakSet();
    const bindClick = (selector, handler) => {
      const button = container.querySelector(selector);
      if (!button || this._contentBound.has(button)) return;
      this._contentBound.add(button); button.addEventListener('click', handler);
    };
    bindClick('#vda-persist-sample', () => this.persistTelemetrySample());
    bindClick('#refresh-backend-telemetry', async () => {
      await this.refreshBackendTelemetry(true);
      if (!container.isConnected || this.container !== container) return;
      this.updateSystemMetrics(); this.updateVdaG041WorkflowDisplay(); this.updateBackendTelemetryCard(); this.updateStatusBar(); this.updateCharts();
    });
    bindClick('#expand-cpu-history', () => {
      this.cpuHistoryExpanded = true;
      const button = container.querySelector('#expand-cpu-history');
      if (button) button.setAttribute('aria-expanded', 'true');
      this.updateStatusBar();
    });
    bindClick('#probe-unsupported-observation', async () => {
      const trigger = container.querySelector('#probe-unsupported-observation');
      await this.refreshBackendTelemetry(true, { unsupported: true, trigger });
      if (!container.isConnected || this.container !== container) return;
      this.updateSystemMetrics(); this.updateVdaG041WorkflowDisplay(); this.updateBackendTelemetryCard(); this.updateStatusBar(); this.updateCharts();
    });
    bindClick('#ipfs-node-refresh', () => this.queryIpfsNode());
    
    // Process search and filters
    const searchInput = container.querySelector('#process-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.filterProcesses();
      });
    }

    const sortBy = container.querySelector('#sort-by');
    if (sortBy) {
      sortBy.addEventListener('change', () => {
        this.processFilters.sortBy = sortBy.value;
        this.updateProcessList();
      });
    }

    const sortOrder = container.querySelector('#sort-order');
    if (sortOrder) {
      sortOrder.addEventListener('change', () => {
        this.processFilters.sortOrder = sortOrder.value;
        this.updateProcessList();
      });
    }
  }

  startRealTimeUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    const ownerRoot = this.container;
    this.updateInterval = setInterval(() => {
      if (!ownerRoot?.isConnected || this.container !== ownerRoot) { this.cleanup(); return; }
      this.updateSystemMetrics();
      this.updateStatusBar();
      this.updateCharts();
      this.checkAlerts();
    }, 1000);
  }

  updateSystemMetrics() {
    const sample = this.telemetrySnapshot;
    this.updateMetricDisplays(sample.cpu, sample.memory, sample.gpu, sample.network);
    this.updateVdaG041WorkflowDisplay();
    this.updateBackendTelemetryCard();
  }

  captureLocalSample() {
    if (this.ownerUnavailable) {
      this.persistRetainedHistory();
      return;
    }
    const sample = this.createTelemetrySample();
    const measured = [sample.cpu, sample.memory, sample.network].some(value => typeof value === 'number' && Number.isFinite(value));
    if (!measured) {
      this.persistRetainedHistory();
      return;
    }
    this.telemetrySnapshot = sample;
    this.lastTelemetryAt = sample.timestamp;
    this.hasMeasuredSample = true;
    this.recordDiagnosticSample(sample);
    this.chartData.cpu.push(sample.cpu);
    this.chartData.memory.push(sample.memory);
    this.chartData.gpu.push(sample.gpu);
    this.chartData.network.push(sample.network);
    Object.keys(this.chartData).forEach(key => {
      if (this.chartData[key].length > this.maxDataPoints) this.chartData[key].shift();
    });
    this.persistRetainedHistory();
  }

  formatMetric(value, unit) {
    return (value === null || value === undefined || Number.isNaN(value)) ? 'n/a' : `${Number(value).toFixed(1)}${unit}`;
  }

  updateMetricDisplays(cpu, memory, gpu, network) {
    // Update overview cards — unmeasurable fields render as "n/a".
    const cpuMetric = document.querySelector('#cpu-metric');
    const memoryMetric = document.querySelector('#memory-metric');
    const gpuMetric = document.querySelector('#gpu-metric');
    const networkMetric = document.querySelector('#network-metric');
    const downloadSpeed = document.querySelector('#download-speed');
    const uploadSpeed = document.querySelector('#upload-speed');

    if (cpuMetric) cpuMetric.textContent = this.ownerPercentText(cpu);
    this.writeCpuObservationMeta(document.querySelector('#cpu-observation-meta'));
    const networkMeta = document.querySelector('#network-observation-meta');
    if (networkMeta) networkMeta.textContent = 'no throughput sample · stale age unavailable';
    if (memoryMetric) memoryMetric.textContent = this.formatMetric(memory, '%');
    if (gpuMetric) gpuMetric.textContent = this.formatMetric(gpu, '%');
    if (networkMetric) networkMetric.textContent = this.formatMetric(network, ' MB/s');
    if (downloadSpeed) downloadSpeed.textContent = this.formatMetric(this.telemetrySnapshot.download, ' MB/s');
    if (uploadSpeed) uploadSpeed.textContent = this.formatMetric(this.telemetrySnapshot.upload, ' MB/s');

    // Update progress bars (0 width for n/a)
    const cpuProgress = document.querySelector('#cpu-progress');
    const memoryProgress = document.querySelector('#memory-progress');
    const gpuProgress = document.querySelector('#gpu-progress');
    const networkProgress = document.querySelector('#network-progress');

    const barWidth = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${Math.max(0, Math.min(100, value))}%` : '0%');
    if (cpuProgress) cpuProgress.style.width = barWidth(cpu);
    if (memoryProgress) memoryProgress.style.width = barWidth(memory);
    if (gpuProgress) gpuProgress.style.width = barWidth(gpu);
    if (networkProgress) networkProgress.style.width = barWidth(network);
  }

  updateStatusBar() {
    const cpuStatus = document.querySelector('#cpu-status');
    const memoryStatus = document.querySelector('#memory-status');
    const gpuStatus = document.querySelector('#gpu-status');
    const networkStatus = document.querySelector('#network-status');
    const uptimeStatus = document.querySelector('#uptime-status');

    const sample = this.telemetrySnapshot;
    if (cpuStatus) cpuStatus.textContent = this.ownerPercentText(sample.cpu);
    if (memoryStatus) memoryStatus.textContent = this.formatMetric(sample.memory, '%');
    if (gpuStatus) gpuStatus.textContent = this.formatMetric(sample.gpu, '%');
    if (networkStatus) networkStatus.textContent = this.formatMetric(sample.network, ' MB/s');

    const label = this.observedLabel();
    if (uptimeStatus) uptimeStatus.textContent = label;
    const detailedUptime = document.querySelector('#detailed-uptime');
    if (detailedUptime) detailedUptime.textContent = label;
    const origin = document.querySelector('#history-origin-status');
    if (origin) origin.textContent = this.historyOrigin;
    const count = document.querySelector('#sample-count-status');
    if (count) count.textContent = `${this.diagnosticHistory.length} samples retained`;
    const caption = document.querySelector('#cpu-series-caption');
    if (caption) this.writeSeriesCaption(caption);
    const failure = document.querySelector('#owner-failure-status');
    if (failure) this.writeFailureStatus(failure);
  }

  updateVdaG041WorkflowDisplay() {
    const latest = this.telemetrySnapshot;
    const analysis = this.diagnosticAnalysis;
    const stale = this.getStaleDataState();
    const latestHistory = this.diagnosticHistory[this.diagnosticHistory.length - 1] || latest;
    const alert = this.activeAlerts[0];
    const accessibleSummary = this.getAccessibleSummaryText();

    const setText = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };

    setText('#vda-live-cpu', `CPU ${this.formatMetric(latest.cpu, '%')} / RAM ${this.formatMetric(latest.memory, '%')}`);
    setText('#vda-live-sample', `${latest.sampleCid ? 'Persisted sample' : 'Not persisted'}. Backend ${latest.backendState}${latest.backendError ? `: ${latest.backendError}` : ''}`);
    setText('#vda-history-count', `${this.diagnosticHistory.length} samples retained`);
    setText('#vda-history-summary', `${latestHistory.label ? `Latest sample at ${this.formatClock(latestHistory.timestamp)}` : 'No samples observed yet'}. ${latestHistory.sampleCid ? 'Persisted' : 'Not persisted'}.`);
    setText('#vda-analysis-risk', `${analysis.risk} risk / ${analysis.trend} trend`);
    setText('#vda-analysis-summary', `Average CPU ${this.formatMetric(analysis.averageCpu, '%')}, memory ${this.formatMetric(analysis.averageMemory, '%')}, GPU ${this.formatMetric(analysis.averageGpu, '%')}. ${analysis.recommendation}`);
    setText('#vda-stale-state', this.staleStateLabel());
    setText('#vda-alert-state', alert ? alert.severity : 'info');
    setText('#vda-accessible-summary', accessibleSummary);
    setText('#vda-history-origin', this.historyOrigin);
    setText('#observation-stamp', this.observationStamp);
    const srSummary = document.querySelector('.sr-telemetry-summary');
    if (srSummary) srSummary.textContent = accessibleSummary;
  }

  // Persists the current telemetry sample to the real ipfs_kit_py artifact
  // store with a canonical CID over the exact sample bytes. The user
  // explicitly confirms the backend write; the backend's acknowledgement (or
  // its verbatim error) is what the UI shows afterwards.
  async persistTelemetrySample() {
    let helper;
    try {
      helper = await import('./real-artifact.js');
    } catch (error) {
      this.showNotification(`Artifact helper unavailable: ${error.message}`, 'error');
      return;
    }
    if (!helper.userConfirmsBackendWrite('Persist the current telemetry sample to the ipfs_kit_py artifact store?')) {
      return;
    }
    try {
      const sample = this.telemetrySnapshot;
      const record = {
        schema: 'swissknife.system-monitor.telemetry-sample.v1',
        sample_id: sample.sampleId,
        captured_at: new Date(sample.timestamp).toISOString(),
        local: {
          memory_pct: sample.memory,
          memory_source: sample.memorySource,
          cpu_cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null
        },
        backend: {
          state: sample.backendState,
          cpu_pct: sample.cpu,
          cpu_source: sample.cpuSource,
          network: sample.network,
          network_source: sample.networkSource,
          latency_ms: sample.latency,
          event_frontier: sample.eventFrontier
        }
      };
      const persisted = await helper.persistArtifactRecord({
        record,
        profile: 'system-monitor-telemetry',
        kind: 'telemetry-sample'
      });
      sample.sampleCid = persisted.cid;
      this.telemetrySnapshot = sample;
      this.updateVdaG041WorkflowDisplay();
      this.showNotification(`Sample persisted: ${persisted.cid}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showNotification(`Persist failed: ${message}`, 'error');
    }
  }

  initializeCharts() {
    // Initialize charts for current view
    if (this.currentView === 'overview') {
      this._redrawOverviewCharts();
    }
  }

  initChart(canvasId, data, color, labels = null) {
    let node = document.getElementById(canvasId);
    if (!node) return;

    // If the node isn't a canvas (e.g., view switched or container reused), try to find a nested canvas
    if (!(node instanceof HTMLCanvasElement)) {
      const nested = node.querySelector?.('canvas');
      if (nested instanceof HTMLCanvasElement) {
        node = nested;
      } else {
        // Not a canvas; skip drawing to avoid getContext errors
        return;
      }
    }

    const canvas = node;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return;
    const numeric = (Array.isArray(data) ? data : []).filter(value => typeof value === 'number' && !Number.isNaN(value));
    canvas.parentElement?.classList.toggle('chart-empty', numeric.length === 0);

    const rect = canvas.getBoundingClientRect();
    const width = Math.floor(rect.width || canvas.clientWidth || 0);
    const height = Math.floor(rect.height || canvas.clientHeight || 0);
    // A zero rect during the first reflow would bake a 1px bitmap and hide the line.
    if (width < 8 || height < 8) {
      const tries = Number(canvas.dataset.layoutTries || 0);
      if (tries < 8) {
        canvas.dataset.layoutTries = String(tries + 1);
        setTimeout(() => this.initChart(canvasId, data, color, labels), 50);
      }
      return;
    }
    canvas.dataset.layoutTries = '0';
    canvas.width = width;
    canvas.height = height;

    this.drawChart(ctx, data, color, canvas.width, canvas.height, canvasId, labels);
  }

  drawChart(ctx, data, color, width, height, canvasId, labels = null) {
    ctx.clearRect(0, 0, width, height);

    // Only real observed values are drawn; nulls (unmeasurable) break the
    // line instead of being plotted as zero.
    const points = data.filter(value => typeof value === 'number' && !Number.isNaN(value));
    if (points.length === 0) {
      const label = canvasId === 'gpu-chart' ? 'utilization unavailable'
        : canvasId === 'network-chart' ? 'no throughput sample'
        : 'No measured samples yet';
      ctx.fillStyle = '#a8bbb2';
      ctx.font = '11px sans-serif';
      ctx.fillText(label, 8, Math.max(14, Math.min(16, height - 4)));
      return;
    }
    const top = 14;
    const usable = Math.max(8, height - top - 6);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = Math.max(max - min, 4);
    const lo = ((min + max) / 2) - span / 2;
    const xAt = index => points.length === 1 ? 16 : 8 + (index / (data.length - 1)) * Math.max(8, width - 16);
    const yAt = value => top + usable - ((value - lo) / span) * usable;
    const coords = [];
    data.forEach((value, index) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      coords.push({ x: xAt(index), y: yAt(value) });
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    coords.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    if (coords.length > 1) ctx.stroke();
    coords.forEach(point => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#edf7f2';
    ctx.font = '10px sans-serif';
    const marks = Array.isArray(labels) && labels.length === coords.length ? labels : null;
    if (marks) {
      marks.forEach((label, index) => {
        const last = index === marks.length - 1;
        ctx.textAlign = index === 0 ? 'left' : last ? 'right' : 'center';
        const x = index === 0 ? 4 : last ? width - 4 : coords[index].x;
        ctx.fillText(label, x, 11);
      });
      ctx.textAlign = 'left';
    } else if (coords.length === 1) ctx.fillText('Retained sample', 28, 11);
    else {
      ctx.fillText('retained', 8, 11);
      ctx.fillText('fresh', Math.max(52, width - 36), 11);
    }
  }

  _redrawOverviewCharts() {
    const sample = this.telemetrySnapshot || {};
    const series = (key) => (typeof sample[key] === 'number' ? this.chartData[key] : []);
    const cpuRows = this.ownerCpuRows();
    const cpuLabels = cpuRows.map(row => this.ownerPercentText(row.cpu));
    this.initChart('cpu-chart', series('cpu'), '#60a5fa', cpuLabels);
    this.initChart('memory-chart', series('memory'), '#34d399');
    this.initChart('gpu-chart', series('gpu'), '#fbbf24');
    this.initChart('network-chart', series('network'), '#a78bfa');
  }

  updateCharts() {
    // Only redraw charts when overview view is visible
    if (this.currentView !== 'overview') return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const minIntervalMs = 200; // small debounce/throttle

    // If a draw is already scheduled, skip
    if (this._chartsScheduled) return;

    if (this._lastChartsUpdate && (now - this._lastChartsUpdate) < minIntervalMs) {
      this._chartsScheduled = true;
      const delay = Math.max(0, minIntervalMs - (now - this._lastChartsUpdate));
      setTimeout(() => {
        this._chartsScheduled = false;
        this._lastChartsUpdate = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        this._redrawOverviewCharts();
      }, delay);
      return;
    }

    this._lastChartsUpdate = now;
    this._redrawOverviewCharts();
  }

  checkAlerts() {
    const alerts = [];
    const latestData = {
      cpu: this.chartData.cpu[this.chartData.cpu.length - 1] || 0,
      memory: this.chartData.memory[this.chartData.memory.length - 1] || 0,
      gpu: this.chartData.gpu[this.chartData.gpu.length - 1] || 0
    };

    if (latestData.cpu > this.alertThresholds.cpu) {
      alerts.push({
        type: 'error',
        message: `High CPU usage: ${latestData.cpu.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }

    if (latestData.memory > this.alertThresholds.memory) {
      alerts.push({
        type: 'warning',
        message: `High memory usage: ${latestData.memory.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }

    if (alerts.length > 0) {
      this.activeAlerts = alerts.map((alert, index) => ({
        id: `alert-state-live-${index}`,
        severity: alert.type === 'error' ? 'critical' : alert.type,
        message: alert.message,
        timestamp: alert.timestamp,
        receiptId: VDA_G041_RECEIPTS.alertState
      }));
      this.showAlerts(alerts);
      this.updateVdaG041WorkflowDisplay();
    }
  }

  showAlerts(alerts) {
    const alertList = document.querySelector('#alert-list');
    if (!alertList) return;

    alertList.innerHTML = alerts.map(alert => `
      <div class="alert-item ${alert.type}">
        <div>${alert.message}</div>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
          ${new Date(alert.timestamp).toLocaleTimeString()}
        </div>
      </div>
    `).join('');
  }

  toggleAlerts() {
    const alertPanel = document.querySelector('#alert-panel');
    if (alertPanel) {
      const isVisible = alertPanel.style.display !== 'none';
      alertPanel.style.display = isVisible ? 'none' : 'block';
    }
  }

  formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'n/a';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  refreshData() {
    this.captureLocalSample();
    this.updateSystemMetrics();
    this.updateStatusBar();
    
    // Visual feedback
    const refreshBtn = document.querySelector('#refresh-btn');
    if (refreshBtn) {
      refreshBtn.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        refreshBtn.style.transform = '';
      }, 500);
    }
  }

  exportData() {
    const data = {
      timestamp: new Date().toISOString(),
      systemInfo: this.systemInfo,
      telemetrySnapshot: this.telemetrySnapshot,
      diagnosticHistory: this.diagnosticHistory,
      diagnosticAnalysis: this.diagnosticAnalysis,
      staleDataState: this.getStaleDataState(),
      activeAlerts: this.activeAlerts,
      accessibleSummary: this.getAccessibleSummaryText(),
      chartData: this.chartData,
      processes: this.mockProcesses,
      networkInterfaces: this.networkInterfaces,
      storageDevices: this.storageDevices
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-monitor-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  filterProcesses() {
    const searchTerm = document.querySelector('#process-search')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#process-list tr');
    
    rows.forEach(row => {
      const processName = row.cells[0].textContent.toLowerCase();
      const shouldShow = processName.includes(searchTerm);
      row.style.display = shouldShow ? '' : 'none';
    });
  }

  sortProcesses(column) {
    this.processFilters.sortBy = column;
    this.updateProcessList();
  }

  updateProcessList() {
    const tbody = document.querySelector('#process-list');
    if (tbody) {
      tbody.innerHTML = this.renderProcessList();
    }
  }

  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Initialize method required by the desktop framework
  async initialize() {
    // App is ready for rendering
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--sk-bg2,#101b18);color:var(--sk-text,#edf7f2);border:1px solid var(--sk-border,#263a34);padding:10px 16px;border-radius:6px;z-index:10000;font-size:13px;max-width:420px;';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
  }

  // Real local P2P state: only what the browser actually knows. Never claims
  // peers that were not observed.
  updateP2PLocalCard() {
    const statusEl = document.querySelector('#p2p-local-status');
    const peersEl = document.querySelector('#p2p-local-peers');
    let peerCount = null;
    let connected = false;
    try {
      const p2p = (typeof window !== 'undefined' && (window.p2pMLSystem || window.swissknife?.p2p)) || null;
      if (p2p?.peers?.size !== undefined) {
        peerCount = p2p.peers.size;
        connected = peerCount > 0;
      }
    } catch { /* stay honest: unknown */ }
    if (statusEl) statusEl.textContent = peerCount === null ? 'unknown (no P2P system)' : (connected ? 'peers observed' : 'no peers');
    if (peersEl) peersEl.textContent = peerCount === null ? 'n/a' : String(peerCount);
  }

  updateBackendTelemetryCard() {
    const stateEl = document.querySelector('#accel-telemetry-state');
    const utilEl = document.querySelector('#accel-telemetry-util');
    const tputEl = document.querySelector('#accel-telemetry-tput');
    const backend = this.backendTelemetry || { state: 'not-run' };
    if (stateEl) {
      stateEl.textContent = this.retainedSample
        ? 'retained sample'
        : backend.state === 'ok'
          ? 'ok'
          : 'unavailable';
    }
    if (utilEl) {
      const measured = typeof backend.data?.utilization === 'number' ? backend.data.utilization : this.telemetrySnapshot?.cpu;
      utilEl.textContent = this.ownerPercentText(measured);
    }
    if (tputEl) tputEl.textContent = this.formatMetric(backend.data?.throughput, '');
  }

  // Queries the REAL IPFS node identity and pin inventory through the app
  // capability gateway. Results (or the verbatim error) are what the UI shows.
  async queryIpfsNode() {
    const statusEl = document.querySelector('#ipfs-node-status');
    const idEl = document.querySelector('#ipfs-node-id');
    const pinsEl = document.querySelector('#ipfs-pin-count');
    if (statusEl) statusEl.textContent = 'querying…';
    try {
      const { invokeDescriptorOperation } = await import('../core/mcp-descriptor-registry.js');
      const nodeEnvelope = await invokeDescriptorOperation({
        descriptor_id: 'ipfs_kit_py',
        operation: 'node_id',
        input: {},
        app_id: 'system-monitor',
        desktop: this.desktop
      });
      const pinEnvelope = await invokeDescriptorOperation({
        descriptor_id: 'ipfs_kit_py',
        operation: 'pin_ls',
        input: {},
        app_id: 'system-monitor',
        desktop: this.desktop
      });
      const nodeOut = nodeEnvelope?.output || {};
      const pinOut = pinEnvelope?.output || {};
      const pinCount = Array.isArray(pinOut.pins) ? pinOut.pins.length
        : Array.isArray(pinOut.items) ? pinOut.items.length : null;
      if (statusEl) {
        statusEl.textContent = nodeEnvelope?.status === 'ok'
          ? 'online (gateway)'
          : `unavailable: ${nodeEnvelope?.error?.message || nodeEnvelope?.summary || 'unknown'}`;
      }
      if (idEl) idEl.textContent = nodeOut.id || nodeOut.peer_id || 'n/a';
      if (pinsEl) pinsEl.textContent = pinCount === null ? 'n/a' : String(pinCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (statusEl) statusEl.textContent = `error: ${message}`;
      if (idEl) idEl.textContent = 'n/a';
      if (pinsEl) pinsEl.textContent = 'n/a';
    }
  }

  async exerciseSystemNetworkLocalGateway() {
    return runSystemNetworkLocalWorkflow({
      desktop: this.desktop,
      appId: 'system-monitor',
      localCapabilities: ['metrics', 'diagnostic-history', 'accessible-summary'],
      remoteCapabilities: ['telemetry'],
      localState: {
        workflow_id: VDA_G041_WORKFLOW,
        telemetry_sample_id: this.telemetrySnapshot.sampleId,
        telemetry_sample_cid: this.telemetrySnapshot.sampleCid,
        diagnostic_history_count: this.diagnosticHistory.length,
        analysis_risk: this.diagnosticAnalysis?.risk || 'unknown',
        stale_data_state: this.getStaleDataState().state,
        alert_count: this.activeAlerts.length,
        accessible_summary: this.getAccessibleSummaryText(),
        receipt_refs: Object.values(VDA_G041_RECEIPTS)
      },
      summary: 'System Monitor VDA-G041 live telemetry diagnostic workflow'
    });
  }

  async render() {
    this.restoreRetainedHistory();
    const windowData = this.createWindow();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = document.querySelector('.system-monitor-container');
      if (container) {
        this.setupEventHandlers(container);
      }
    }, 0);
    
    return windowData.content;
  }
}

// Register the app
if (typeof window !== 'undefined') {
  window.createSystemMonitorApp = (desktop) => new SystemMonitorApp(desktop);
}
