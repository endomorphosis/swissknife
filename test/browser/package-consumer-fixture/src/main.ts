import swissknifeBrowser, { SwissKnifeBrowserCore } from 'swissknife';
import {
  SwissKnifeBrowserCore as SwissKnifeBrowserCoreFromBrowserSubpath,
} from 'swissknife/browser';
import {
  BrowserEventBus,
  createBrowserPlatform,
} from 'swissknife/browser/platform';
import {
  createBrowserAIService,
} from 'swissknife/browser/ai';
import {
  createBrowserModelRegistry,
} from 'swissknife/browser/models';
import {
  createBrowserStorageProvider,
  detectBrowserStorageCapabilities,
} from 'swissknife/browser/storage';
import {
  detectBrowserWorkerCapabilities,
} from 'swissknife/browser/workers';
import {
  createBrowserIPFSTransport,
  detectBrowserIPFSCapabilities,
} from 'swissknife/browser/ipfs';
import {
  buildBrowserLibp2pConfig,
} from 'swissknife/browser/mcp/libp2p';
import {
  classifyMcpDashboardRemoteEntry,
  MCP_DASHBOARD_BROWSER_POLICY,
} from 'swissknife/browser/mcp/dashboard-policy';
import {
  BrowserRuntimeSummary,
} from 'swissknife/browser/components';
import {
  createBrowserPlatformSnapshot,
} from 'swissknife/browser/hooks';
import {
  BrowserHomeScreen,
} from 'swissknife/browser/screens';

const bus = new BrowserEventBus();
const platform = createBrowserPlatform({
  web: {
    theme: 'day',
    layout: 'consumer-fixture',
    port: 0,
  },
});
const modelRegistry = createBrowserModelRegistry();
const ai = createBrowserAIService({ registry: modelRegistry });
const storageReport = detectBrowserStorageCapabilities({
  preferredAdapters: ['indexeddb', 'cache-storage'],
});
const storage = createBrowserStorageProvider({
  preferredAdapters: ['indexeddb', 'cache-storage'],
});
const workerReport = detectBrowserWorkerCapabilities();
const ipfs = createBrowserIPFSTransport({
  gateway: {
    enabled: false,
  },
  libp2p: {
    enabled: false,
  },
  fetch: globalThis.fetch?.bind(globalThis),
});
const remoteEntry = classifyMcpDashboardRemoteEntry('https://mcp.example.invalid/sse', 'https');

void bus.emit('package-consumer:loaded', {
  browserSafe: true,
  api: 'swissknife/browser',
});

void detectBrowserIPFSCapabilities({ libp2p: { enabled: false } });
void buildBrowserLibp2pConfig({ enabled: false });

const rootCore = new SwissKnifeBrowserCore();
const browserCore = new SwissKnifeBrowserCoreFromBrowserSubpath();
const rootAndSubpathMatch = rootCore.getVersion() === browserCore.getVersion();

const summary = {
  rootImport: typeof swissknifeBrowser.initialize === 'function',
  rootAndSubpathMatch,
  platformRuntime: platform.runtime,
  providers: ai.listProviders().length,
  storageAdapter: storage.kind,
  storageBrowserSafe: storage.report.browserSafe && storageReport.browserSafe,
  workerBrowserSafe: workerReport.browserSafe,
  ipfsBrowserSafe: ipfs.report.browserSafe,
  mcpRemoteExecutable: remoteEntry.browserExecutable,
  mcpPolicySchema: MCP_DASHBOARD_BROWSER_POLICY.schema,
  componentExport: typeof BrowserRuntimeSummary === 'function',
  hookExport: createBrowserPlatformSnapshot(platform).runtime,
  screenExport: typeof BrowserHomeScreen === 'function',
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Fixture root element was not found');
}

app.dataset.swissknifeBrowserPackageConsumer = JSON.stringify(summary);
app.textContent = JSON.stringify(summary, null, 2);

export { summary };
