export const VIRTUAL_DESKTOP_APP_MANIFEST_ID =
  'org.hallucinate.swissknife.virtual-desktop-app-manifest';

export type VirtualDesktopAppCategory =
  | 'development'
  | 'ai'
  | 'storage'
  | 'system'
  | 'productivity'
  | 'integration'
  | 'automation'
  | 'network'
  | 'creative'
  | 'utility'
  | 'media'
  | 'social'
  | 'generated'
  | 'glasses';

export type VirtualDesktopOwnerModule =
  | 'platform'
  | 'mcp'
  | 'glasses'
  | 'ipfs'
  | 'integrations'
  | 'shared';

export type VirtualDesktopLaunchKind =
  | 'static-app'
  | 'typescript-runtime'
  | 'idl-generated'
  | 'service-surface'
  | 'legacy-alias';

export type VirtualDesktopServiceFamily =
  | 'local'
  | 'ipfs_kit_py'
  | 'ipfs_datasets_py'
  | 'ipfs_accelerate_py'
  | 'mcp_plus_plus'
  | 'policy'
  | 'external_network'
  | 'meta_glasses'
  | 'orb';

export type VirtualDesktopSourceSet =
  | 'web-index-desktop'
  | 'web-index-start-menu'
  | 'web-js-main'
  | 'web-js-main-simple'
  | 'browser-main'
  | 'list-all-applications'
  | 'batch-test-apps'
  | 'docs-applications'
  | 'glasses-registry'
  | 'idl-generated';

export type VirtualDesktopRequiredCoverage =
  | 'manifest'
  | 'launch'
  | 'screenshot'
  | 'console'
  | 'network'
  | 'capability'
  | 'glasses'
  | 'alias';

export interface VirtualDesktopGlassesStrategy {
  kind:
    | 'manual'
    | 'idl-generated'
    | 'audio-summary'
    | 'mobile-card'
    | 'display-webapp'
    | 'fallback-only'
    | 'not-displayable';
  handoff:
    | 'native-display'
    | 'display-webapp'
    | 'mobile-card'
    | 'notification'
    | 'audio-summary'
    | 'not-displayable';
  profile_id?: string;
  fallback?: readonly ('mobile-card' | 'notification' | 'audio-summary' | 'display-webapp' | 'desktop-only')[];
  rationale?: string;
}

export interface VirtualDesktopAppManifestEntry {
  id: string;
  aliases: readonly string[];
  title: string;
  category: VirtualDesktopAppCategory;
  owner_module: VirtualDesktopOwnerModule;
  launch_kind: VirtualDesktopLaunchKind;
  component?: string;
  source_sets: readonly VirtualDesktopSourceSet[];
  capabilities: readonly string[];
  service_families: readonly VirtualDesktopServiceFamily[];
  glasses_strategy: VirtualDesktopGlassesStrategy;
  required_test_coverage: readonly VirtualDesktopRequiredCoverage[];
  notes?: readonly string[];
}

export interface VirtualDesktopAppManifest {
  manifest_id: typeof VIRTUAL_DESKTOP_APP_MANIFEST_ID;
  version: string;
  generated_from: readonly string[];
  apps: readonly VirtualDesktopAppManifestEntry[];
}

const desktopCoverage: readonly VirtualDesktopRequiredCoverage[] = [
  'manifest',
  'launch',
  'screenshot',
  'console',
  'network',
];

const capabilityCoverage: readonly VirtualDesktopRequiredCoverage[] = [
  ...desktopCoverage,
  'capability',
];

const glassesCoverage: readonly VirtualDesktopRequiredCoverage[] = [
  ...capabilityCoverage,
  'glasses',
];

const visibleDesktopSources: readonly VirtualDesktopSourceSet[] = [
  'web-index-desktop',
  'web-js-main',
  'web-js-main-simple',
  'list-all-applications',
  'batch-test-apps',
];

const idlFallback = {
  kind: 'idl-generated',
  handoff: 'native-display',
  fallback: ['mobile-card', 'notification'],
} as const satisfies VirtualDesktopGlassesStrategy;

const mobileFallback = {
  kind: 'mobile-card',
  handoff: 'mobile-card',
  fallback: ['notification', 'desktop-only'],
} as const satisfies VirtualDesktopGlassesStrategy;

const audioFallback = {
  kind: 'audio-summary',
  handoff: 'audio-summary',
  fallback: ['mobile-card', 'notification'],
} as const satisfies VirtualDesktopGlassesStrategy;

function manualGlasses(profileId: string): VirtualDesktopGlassesStrategy {
  return {
    kind: 'manual',
    handoff: 'native-display',
    profile_id: profileId,
    fallback: ['mobile-card', 'notification'],
  };
}

function app(entry: VirtualDesktopAppManifestEntry): VirtualDesktopAppManifestEntry {
  return entry;
}

export const VISIBLE_DESKTOP_APP_IDS = [
  'terminal',
  'vibecode',
  'music-studio-unified',
  'ai-chat',
  'file-manager',
  'task-manager',
  'todo',
  'model-browser',
  'huggingface',
  'openrouter',
  'ipfs-explorer',
  'device-manager',
  'settings',
  'mcp-control',
  'api-keys',
  'github',
  'oauth-login',
  'cron',
  'navi',
  'p2p-network',
  'p2p-chat-unified',
  'neural-network-designer',
  'training-manager',
  'calculator',
  'clock',
  'calendar',
  'peertube',
  'friends-list',
  'image-viewer',
  'notes',
  'media-player',
  'system-monitor',
  'neural-photoshop',
  'cinema',
  'strudel',
  'strudel-ai-daw',
  'music-studio',
  'p2p-chat',
] as const;

export const GENERATED_SERVICE_APP_IDS = [
  'datasets-browser',
  'accelerate-panel',
  'idl-explorer',
  'glasses-preview',
  'orb-auto-ui',
  'mcp-plus-plus',
] as const;

export const VIRTUAL_DESKTOP_APP_MANIFEST: VirtualDesktopAppManifest = {
  manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST_ID,
  version: '2026-07-07',
  generated_from: [
    'swissknife/test-results/virtual-desktop-ipfs-mcp-orb/app-inventory.json',
    'data/swissknife_virtual_desktop/discovery/app-inventory-baseline.md',
  ],
  apps: [
    app({
      id: 'terminal',
      aliases: [],
      title: 'SwissKnife Terminal',
      category: 'development',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'TerminalApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['local.shell', 'ipfs.kit.storage', 'ipfs.datasets.discovery', 'ipfs.accelerate.models'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
      glasses_strategy: manualGlasses('terminal'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'vibecode',
      aliases: ['code-editor'],
      title: 'VibeCode',
      category: 'development',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'VibeCodeApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['local.editor', 'ipfs.kit.vfs', 'ipfs.accelerate.inference', 'ipfs.datasets.provenance'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_accelerate_py', 'ipfs_datasets_py'],
      glasses_strategy: manualGlasses('code-editor'),
      required_test_coverage: [...glassesCoverage, 'alias'],
      notes: ['browser-main.ts and the glasses registry use the code-editor alias.'],
    }),
    app({
      id: 'music-studio-unified',
      aliases: [],
      title: 'Music Studio',
      category: 'creative',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'UnifiedMusicStudioApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu'],
      capabilities: ['local.audio', 'ipfs.kit.storage', 'ipfs.accelerate.jobs'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_accelerate_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'ai-chat',
      aliases: [],
      title: 'AI Chat',
      category: 'ai',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'AIChatApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['ipfs.datasets.discovery', 'ipfs.datasets.vector', 'ipfs.accelerate.inference', 'ipfs.kit.storage'],
      service_families: ['ipfs_datasets_py', 'ipfs_accelerate_py', 'ipfs_kit_py', 'mcp_plus_plus'],
      glasses_strategy: manualGlasses('ai-chat'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'file-manager',
      aliases: [],
      title: 'File Manager',
      category: 'storage',
      owner_module: 'ipfs',
      launch_kind: 'static-app',
      component: 'FileManagerApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['local.files', 'ipfs.kit.storage', 'ipfs.kit.vfs', 'ipfs.datasets.provenance'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_datasets_py'],
      glasses_strategy: manualGlasses('file-manager'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'task-manager',
      aliases: [],
      title: 'Task Manager',
      category: 'system',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'TaskManagerApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['local.processes', 'ipfs.accelerate.jobs', 'ipfs.datasets.provenance'],
      service_families: ['local', 'ipfs_accelerate_py', 'ipfs_datasets_py'],
      glasses_strategy: manualGlasses('task-manager'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'todo',
      aliases: [],
      title: 'Todo and Goals',
      category: 'productivity',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'TodoApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu'],
      capabilities: ['local.tasks', 'ipfs.datasets.provenance', 'ipfs.kit.storage'],
      service_families: ['local', 'ipfs_datasets_py', 'ipfs_kit_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'model-browser',
      aliases: [],
      title: 'AI Model Manager',
      category: 'ai',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'ModelBrowserApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['ipfs.accelerate.models', 'ipfs.accelerate.inference', 'ipfs.kit.storage', 'ipfs.datasets.discovery'],
      service_families: ['ipfs_accelerate_py', 'ipfs_kit_py', 'ipfs_datasets_py', 'mcp_plus_plus'],
      glasses_strategy: manualGlasses('model-browser'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'huggingface',
      aliases: [],
      title: 'Hugging Face Hub',
      category: 'ai',
      owner_module: 'integrations',
      launch_kind: 'static-app',
      component: 'HuggingFaceApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['external.huggingface', 'ipfs.accelerate.models', 'ipfs.datasets.discovery', 'ipfs.kit.storage'],
      service_families: ['external_network', 'ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'openrouter',
      aliases: [],
      title: 'OpenRouter Hub',
      category: 'ai',
      owner_module: 'integrations',
      launch_kind: 'static-app',
      component: 'OpenRouterApp',
      source_sets: [...visibleDesktopSources, 'docs-applications'],
      capabilities: ['external.openrouter', 'ipfs.accelerate.inference', 'ipfs.datasets.provenance'],
      service_families: ['external_network', 'ipfs_accelerate_py', 'ipfs_datasets_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
      notes: ['Visible as a desktop icon but currently absent from the Start menu.'],
    }),
    app({
      id: 'ipfs-explorer',
      aliases: [],
      title: 'IPFS Explorer',
      category: 'storage',
      owner_module: 'ipfs',
      launch_kind: 'idl-generated',
      component: 'IPFSExplorerApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'idl-generated'],
      capabilities: ['ipfs.kit.storage', 'ipfs.kit.vfs', 'ipfs.kit.dag', 'mcp.registry'],
      service_families: ['ipfs_kit_py', 'mcp_plus_plus'],
      glasses_strategy: idlFallback,
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'device-manager',
      aliases: [],
      title: 'Device Manager',
      category: 'system',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'DeviceManagerApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.devices', 'ipfs.accelerate.hardware', 'ipfs.kit.storage'],
      service_families: ['local', 'ipfs_accelerate_py', 'ipfs_kit_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'settings',
      aliases: [],
      title: 'Settings',
      category: 'system',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'SettingsApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'browser-main', 'docs-applications', 'glasses-registry'],
      capabilities: ['local.settings', 'policy.preferences', 'mcp.registry'],
      service_families: ['local', 'policy', 'mcp_plus_plus'],
      glasses_strategy: manualGlasses('settings'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'mcp-control',
      aliases: [],
      title: 'MCP Control',
      category: 'integration',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'MCPControlApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['mcp.registry', 'mcp.descriptor', 'mcp.gateway'],
      service_families: ['mcp_plus_plus', 'ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'api-keys',
      aliases: [],
      title: 'API Keys',
      category: 'integration',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'APIKeysApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['policy.credentials', 'local.secure_storage'],
      service_families: ['local', 'policy'],
      glasses_strategy: {
        ...mobileFallback,
        rationale: 'Credential surfaces should default to phone or desktop confirmation.',
      },
      required_test_coverage: [...desktopCoverage, 'capability'],
    }),
    app({
      id: 'github',
      aliases: [],
      title: 'GitHub',
      category: 'integration',
      owner_module: 'integrations',
      launch_kind: 'static-app',
      component: 'GitHubApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['external.github', 'ipfs.datasets.provenance', 'ipfs.kit.storage'],
      service_families: ['external_network', 'ipfs_datasets_py', 'ipfs_kit_py', 'policy'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'oauth-login',
      aliases: [],
      title: 'OAuth Login',
      category: 'integration',
      owner_module: 'integrations',
      launch_kind: 'static-app',
      component: 'OAuthLoginApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['external.oauth', 'policy.credentials'],
      service_families: ['external_network', 'policy'],
      glasses_strategy: {
        ...mobileFallback,
        rationale: 'OAuth auth flows should complete on phone or desktop, not on glasses.',
      },
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'cron',
      aliases: [],
      title: 'AI Cron',
      category: 'automation',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'CronApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.scheduler', 'ipfs.accelerate.jobs', 'ipfs.datasets.provenance'],
      service_families: ['local', 'ipfs_accelerate_py', 'ipfs_datasets_py', 'policy'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'navi',
      aliases: [],
      title: 'NAVI',
      category: 'ai',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'NaviApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.navigation', 'ipfs.datasets.discovery', 'mcp.registry', 'orb.dispatch'],
      service_families: ['local', 'ipfs_datasets_py', 'mcp_plus_plus', 'orb'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'p2p-network',
      aliases: [],
      title: 'P2P Network Manager',
      category: 'network',
      owner_module: 'ipfs',
      launch_kind: 'static-app',
      component: 'P2PNetworkApp',
      source_sets: [...visibleDesktopSources, 'docs-applications'],
      capabilities: ['ipfs.kit.swarm', 'ipfs.kit.storage', 'ipfs.accelerate.hardware'],
      service_families: ['ipfs_kit_py', 'ipfs_accelerate_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
      notes: ['Visible as a desktop icon but currently absent from the Start menu.'],
    }),
    app({
      id: 'p2p-chat-unified',
      aliases: [],
      title: 'P2P Chat',
      category: 'network',
      owner_module: 'ipfs',
      launch_kind: 'static-app',
      component: 'UnifiedP2PChatApp',
      source_sets: [...visibleDesktopSources],
      capabilities: ['ipfs.kit.pubsub', 'ipfs.datasets.provenance', 'local.notifications'],
      service_families: ['ipfs_kit_py', 'ipfs_datasets_py', 'local'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
      notes: ['Visible as a desktop icon but currently absent from the Start menu.'],
    }),
    app({
      id: 'neural-network-designer',
      aliases: [],
      title: 'Neural Network Designer',
      category: 'ai',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'NeuralNetworkDesignerApp',
      source_sets: [...visibleDesktopSources, 'docs-applications'],
      capabilities: ['ipfs.accelerate.models', 'ipfs.accelerate.jobs', 'ipfs.kit.storage'],
      service_families: ['ipfs_accelerate_py', 'ipfs_kit_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'training-manager',
      aliases: [],
      title: 'Training Manager',
      category: 'ai',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'TrainingManagerApp',
      source_sets: [...visibleDesktopSources, 'docs-applications'],
      capabilities: ['ipfs.accelerate.jobs', 'ipfs.datasets.discovery', 'ipfs.kit.storage'],
      service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'calculator',
      aliases: [],
      title: 'Calculator',
      category: 'utility',
      owner_module: 'shared',
      launch_kind: 'static-app',
      component: 'CalculatorApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.calculator'],
      service_families: ['local'],
      glasses_strategy: mobileFallback,
      required_test_coverage: desktopCoverage,
    }),
    app({
      id: 'clock',
      aliases: [],
      title: 'Clock and Timers',
      category: 'utility',
      owner_module: 'shared',
      launch_kind: 'static-app',
      component: 'ClockApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.time', 'local.notifications'],
      service_families: ['local'],
      glasses_strategy: mobileFallback,
      required_test_coverage: desktopCoverage,
    }),
    app({
      id: 'calendar',
      aliases: [],
      title: 'Calendar and Events',
      category: 'productivity',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'CalendarApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu'],
      capabilities: ['local.calendar', 'ipfs.datasets.provenance', 'ipfs.kit.storage'],
      service_families: ['local', 'ipfs_datasets_py', 'ipfs_kit_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'peertube',
      aliases: [],
      title: 'PeerTube',
      category: 'media',
      owner_module: 'integrations',
      launch_kind: 'static-app',
      component: 'PeerTubeApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu'],
      capabilities: ['external.peertube', 'ipfs.kit.storage', 'ipfs.accelerate.inference'],
      service_families: ['external_network', 'ipfs_kit_py', 'ipfs_accelerate_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'friends-list',
      aliases: [],
      title: 'Friends and Network',
      category: 'social',
      owner_module: 'ipfs',
      launch_kind: 'static-app',
      component: 'FriendsListApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu'],
      capabilities: ['local.contacts', 'ipfs.kit.pubsub', 'ipfs.datasets.provenance'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_datasets_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'image-viewer',
      aliases: [],
      title: 'Image Viewer',
      category: 'media',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'ImageViewerApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.media.image', 'ipfs.kit.storage', 'ipfs.accelerate.inference'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_accelerate_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'notes',
      aliases: [],
      title: 'Notes',
      category: 'productivity',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'NotesApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.notes', 'ipfs.kit.storage', 'ipfs.datasets.provenance'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_datasets_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'media-player',
      aliases: [],
      title: 'Media Player',
      category: 'media',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'MediaPlayer',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu'],
      capabilities: ['local.media.playback', 'ipfs.kit.storage', 'ipfs.accelerate.inference'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_accelerate_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'system-monitor',
      aliases: [],
      title: 'System Monitor',
      category: 'system',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'SystemMonitorApp',
      source_sets: [...visibleDesktopSources, 'web-index-start-menu', 'docs-applications'],
      capabilities: ['local.metrics', 'ipfs.accelerate.telemetry'],
      service_families: ['local', 'ipfs_accelerate_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'neural-photoshop',
      aliases: [],
      title: 'Neural Photoshop',
      category: 'creative',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'NeuralPhotoshopApp',
      source_sets: [...visibleDesktopSources],
      capabilities: ['ipfs.accelerate.inference', 'ipfs.accelerate.jobs', 'ipfs.kit.storage'],
      service_families: ['ipfs_accelerate_py', 'ipfs_kit_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'cinema',
      aliases: [],
      title: 'Cinema',
      category: 'creative',
      owner_module: 'mcp',
      launch_kind: 'static-app',
      component: 'CinemaApp',
      source_sets: [...visibleDesktopSources],
      capabilities: ['ipfs.accelerate.jobs', 'ipfs.kit.storage', 'local.media.video'],
      service_families: ['ipfs_accelerate_py', 'ipfs_kit_py', 'local'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'strudel',
      aliases: [],
      title: 'Strudel',
      category: 'creative',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'GrandmaStrudelDAW',
      source_sets: ['web-index-desktop', 'web-index-start-menu', 'web-js-main-simple', 'batch-test-apps', 'docs-applications'],
      capabilities: ['local.audio', 'ipfs.kit.storage', 'ipfs.accelerate.jobs'],
      service_families: ['local', 'ipfs_kit_py', 'ipfs_accelerate_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'strudel-ai-daw',
      aliases: [],
      title: 'Strudel AI DAW',
      category: 'creative',
      owner_module: 'platform',
      launch_kind: 'static-app',
      component: 'StrudelAIDAWApp',
      source_sets: ['web-index-desktop', 'web-index-start-menu', 'web-js-main-simple', 'batch-test-apps', 'docs-applications'],
      capabilities: ['local.audio', 'ipfs.accelerate.inference', 'ipfs.accelerate.jobs', 'ipfs.kit.storage'],
      service_families: ['local', 'ipfs_accelerate_py', 'ipfs_kit_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: capabilityCoverage,
    }),
    app({
      id: 'music-studio',
      aliases: ['strudel-grandma'],
      title: 'Music Studio Classic',
      category: 'creative',
      owner_module: 'platform',
      launch_kind: 'legacy-alias',
      component: 'MusicStudioApp',
      source_sets: ['web-index-desktop', 'web-index-start-menu', 'web-js-main-simple', 'batch-test-apps'],
      capabilities: ['local.audio', 'ipfs.kit.storage'],
      service_families: ['local', 'ipfs_kit_py'],
      glasses_strategy: audioFallback,
      required_test_coverage: [...capabilityCoverage, 'alias'],
      notes: ['The SVD plan previously used strudel-grandma for this classic-studio role.'],
    }),
    app({
      id: 'p2p-chat',
      aliases: ['p2p-chat-offline'],
      title: 'P2P Chat Classic',
      category: 'network',
      owner_module: 'ipfs',
      launch_kind: 'legacy-alias',
      component: 'P2PChatApp',
      source_sets: ['web-index-desktop', 'web-js-main-simple', 'batch-test-apps'],
      capabilities: ['ipfs.kit.pubsub', 'local.notifications'],
      service_families: ['ipfs_kit_py', 'local'],
      glasses_strategy: audioFallback,
      required_test_coverage: [...capabilityCoverage, 'alias'],
      notes: ['p2p-chat-offline appears in validation code but not in the current desktop icon list.'],
    }),
    app({
      id: 'datasets-browser',
      aliases: [],
      title: 'Datasets Browser',
      category: 'generated',
      owner_module: 'mcp',
      launch_kind: 'idl-generated',
      component: 'DescriptorAppComponent',
      source_sets: ['web-js-main-simple', 'browser-main', 'idl-generated'],
      capabilities: ['ipfs.datasets.discovery', 'ipfs.datasets.vector', 'ipfs.datasets.provenance', 'mcp.descriptor'],
      service_families: ['ipfs_datasets_py', 'mcp_plus_plus', 'orb'],
      glasses_strategy: idlFallback,
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'accelerate-panel',
      aliases: [],
      title: 'Accelerate Panel',
      category: 'generated',
      owner_module: 'mcp',
      launch_kind: 'idl-generated',
      component: 'DescriptorAppComponent',
      source_sets: ['web-js-main-simple', 'browser-main', 'idl-generated'],
      capabilities: ['ipfs.accelerate.models', 'ipfs.accelerate.inference', 'ipfs.accelerate.jobs', 'mcp.descriptor'],
      service_families: ['ipfs_accelerate_py', 'mcp_plus_plus', 'orb'],
      glasses_strategy: idlFallback,
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'idl-explorer',
      aliases: [],
      title: 'IDL Explorer',
      category: 'generated',
      owner_module: 'mcp',
      launch_kind: 'service-surface',
      component: 'IDLExplorerApp',
      source_sets: ['web-js-main-simple', 'browser-main', 'glasses-registry'],
      capabilities: ['mcp.descriptor', 'mcp.registry', 'orb.dispatch'],
      service_families: ['mcp_plus_plus', 'orb'],
      glasses_strategy: manualGlasses('idl-explorer'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'glasses-preview',
      aliases: [],
      title: 'Glasses Preview',
      category: 'glasses',
      owner_module: 'glasses',
      launch_kind: 'service-surface',
      component: 'GlassesPreviewApp',
      source_sets: ['web-js-main-simple', 'browser-main', 'glasses-registry'],
      capabilities: ['glasses.preview', 'glasses.edge', 'orb.dispatch'],
      service_families: ['meta_glasses', 'orb', 'local'],
      glasses_strategy: manualGlasses('glasses-preview'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'orb-auto-ui',
      aliases: [],
      title: 'ORB Auto-UI',
      category: 'generated',
      owner_module: 'glasses',
      launch_kind: 'service-surface',
      component: 'ORBAutoUILauncher',
      source_sets: ['web-js-main-simple', 'browser-main', 'glasses-registry'],
      capabilities: ['orb.auto_ui', 'mcp.descriptor', 'mcp.gateway'],
      service_families: ['orb', 'mcp_plus_plus', 'ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
      glasses_strategy: manualGlasses('orb-auto-ui'),
      required_test_coverage: glassesCoverage,
    }),
    app({
      id: 'mcp-plus-plus',
      aliases: [],
      title: 'MCP++ Explorer',
      category: 'integration',
      owner_module: 'mcp',
      launch_kind: 'service-surface',
      component: 'MCPPlusPlusExplorer',
      source_sets: ['web-js-main-simple', 'browser-main'],
      capabilities: ['mcp.registry', 'mcp.gateway', 'mcp.receipts', 'mcp.event_dag'],
      service_families: ['mcp_plus_plus', 'ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
      glasses_strategy: mobileFallback,
      required_test_coverage: capabilityCoverage,
    }),
  ],
};

export const VIRTUAL_DESKTOP_APP_IDS = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(appEntry => appEntry.id);

export const VIRTUAL_DESKTOP_APP_BY_ID = new Map(
  VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(appEntry => [appEntry.id, appEntry]),
);

export const VIRTUAL_DESKTOP_ALIAS_TO_ID = new Map(
  VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(appEntry =>
    appEntry.aliases.map(alias => [alias, appEntry.id] as const),
  ),
);

export function resolveVirtualDesktopAppId(appIdOrAlias: string): string | null {
  if (VIRTUAL_DESKTOP_APP_BY_ID.has(appIdOrAlias)) return appIdOrAlias;
  return VIRTUAL_DESKTOP_ALIAS_TO_ID.get(appIdOrAlias) ?? null;
}

export function getVirtualDesktopApp(appIdOrAlias: string): VirtualDesktopAppManifestEntry | null {
  const canonical = resolveVirtualDesktopAppId(appIdOrAlias);
  return canonical ? VIRTUAL_DESKTOP_APP_BY_ID.get(canonical) ?? null : null;
}
