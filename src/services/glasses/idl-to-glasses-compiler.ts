/**
 * IDL-to-Glasses Auto-Compilation Pipeline
 * 
 * Automatically generates GlassesAppEntry descriptors from MCPUIProfileDescriptors,
 * enabling any MCP service registered via IDL to have an automatically generated
 * Meta Glasses interface without manual widget authoring.
 * 
 * This is the key integration point that ensures all backend services (ipfs_kit_py,
 * ipfs_datasets_py, ipfs_accelerate_py) can be viewed and interacted with on the
 * Meta Glasses display by simply registering their IDL descriptor.
 */

import type { MetaGlassesDisplayProfile, MetaGlassesDisplayRegion, MetaGlassesActionBinding, MetaGlassesDisplayTemplate } from './meta-glasses-display-profile.js';
import type { GlassesAppEntry } from './glasses-app-control-plane.js';

// ---------------------------------------------------------------------------
// IDL Profile Types (simplified subset for auto-compilation)
// ---------------------------------------------------------------------------

export interface IDLMethodSchema {
  name: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
  outputSchema: { type: string; properties?: Record<string, unknown> };
}

export interface IDLProfileDescriptor {
  name: string;
  namespace: string;
  version: string;
  methods: IDLMethodSchema[];
  ui?: {
    primary_template?: string;
    icon?: string;
    display_name?: string;
    category?: string;
  };
}

// ---------------------------------------------------------------------------
// Auto-Compilation Options
// ---------------------------------------------------------------------------

export interface AutoCompileOptions {
  /** Maximum actions to expose on glasses (default: 3) */
  maxActions?: number;
  /** Maximum text regions (default: 4) */
  maxTextBlocks?: number;
  /** Update frequency Hz (default: 2) */
  updateHz?: number;
  /** Method priority order (first N become primary actions) */
  priorityMethods?: string[];
  /** Force a specific template */
  forceTemplate?: MetaGlassesDisplayTemplate;
  /** Custom icon override */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Template Selection Heuristics
// ---------------------------------------------------------------------------

function selectTemplate(descriptor: IDLProfileDescriptor): MetaGlassesDisplayTemplate {
  const methodCount = descriptor.methods.length;
  const category = descriptor.ui?.category || '';

  // Heuristic: select based on service category and method count
  if (category === 'browser' || category === 'explorer' || methodCount > 8) return 'list';
  if (category === 'monitor' || category === 'status') return 'status';
  if (category === 'pipeline' || category === 'workflow') return 'task-progress';
  if (methodCount <= 4) return 'single-card';
  return 'stack';
}

// ---------------------------------------------------------------------------
// Method Prioritization
// ---------------------------------------------------------------------------

/** Pick the top-N most important methods for glasses action buttons */
function prioritizeMethods(
  methods: IDLMethodSchema[],
  maxActions: number,
  priorityMethods?: string[],
): IDLMethodSchema[] {
  if (priorityMethods?.length) {
    const prioritized = priorityMethods
      .map(name => methods.find(m => m.name === name))
      .filter((m): m is IDLMethodSchema => !!m);
    // Fill remaining slots with non-prioritized methods
    const remaining = methods.filter(m => !priorityMethods.includes(m.name));
    return [...prioritized, ...remaining].slice(0, maxActions);
  }

  // Default heuristic: prefer methods with fewer required params (more usable on glasses)
  const scored = methods.map(m => ({
    method: m,
    score: (m.inputSchema.required?.length ?? 0) * -1
      + (m.name.startsWith('list') ? 2 : 0)
      + (m.name.startsWith('get') ? 1 : 0)
      + (m.name === 'status' ? 3 : 0)
      + (m.name.includes('search') ? 2 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxActions).map(s => s.method);
}

// ---------------------------------------------------------------------------
// Region Layout Generator
// ---------------------------------------------------------------------------

function generateRegions(
  descriptor: IDLProfileDescriptor,
  template: MetaGlassesDisplayTemplate,
  actions: IDLMethodSchema[],
): MetaGlassesDisplayRegion[] {
  const displayName = descriptor.ui?.display_name || descriptor.name;
  const regions: MetaGlassesDisplayRegion[] = [];

  // Title region (always present)
  regions.push({
    id: 'title',
    kind: 'text',
    bounds: { x: 20, y: 20, width: 560, height: 40 },
    text: { value: displayName, max_lines: 1, max_chars: 40, overflow: 'truncate' },
  });

  // Status region showing service connection
  regions.push({
    id: 'status',
    kind: 'status',
    bounds: { x: 20, y: 70, width: 560, height: 50 },
    text: { source: 'state.connection_status', value: 'Connecting...', max_lines: 1, max_chars: 40, overflow: 'truncate' },
  });

  // Main content region (varies by template)
  switch (template) {
    case 'list':
      regions.push({
        id: 'content',
        kind: 'list',
        bounds: { x: 20, y: 130, width: 560, height: 250 },
        text: { source: 'state.items', value: 'No items loaded', max_lines: 6, max_chars: 200, overflow: 'truncate' },
      });
      break;
    case 'status':
      // Generate status panels for output properties of first method
      const firstOutput = descriptor.methods[0]?.outputSchema?.properties || {};
      const propNames = Object.keys(firstOutput).slice(0, 4);
      propNames.forEach((prop, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        regions.push({
          id: `metric-${prop}`,
          kind: 'status',
          bounds: { x: 20 + col * 290, y: 130 + row * 90, width: 270, height: 80 },
          text: { source: `state.${prop}`, value: `${prop}: --`, max_lines: 1, max_chars: 30, overflow: 'truncate' },
        });
      });
      break;
    case 'task-progress':
      regions.push({
        id: 'progress',
        kind: 'progress',
        bounds: { x: 20, y: 130, width: 560, height: 60 },
        text: { source: 'state.progress', value: 'Idle', max_lines: 1, max_chars: 50, overflow: 'truncate' },
      });
      regions.push({
        id: 'log',
        kind: 'list',
        bounds: { x: 20, y: 200, width: 560, height: 180 },
        text: { source: 'state.log', value: 'Ready', max_lines: 5, max_chars: 150, overflow: 'truncate' },
      });
      break;
    default: // single-card, stack
      regions.push({
        id: 'content',
        kind: 'text',
        bounds: { x: 20, y: 130, width: 560, height: 250 },
        text: { source: 'state.content', value: 'Ready', max_lines: 6, max_chars: 200, overflow: 'wrap' },
      });
  }

  // Action regions (bottom row)
  const actionWidth = Math.floor(560 / Math.max(actions.length, 1));
  actions.forEach((action, i) => {
    regions.push({
      id: `action-${action.name}`,
      kind: 'action',
      bounds: { x: 20 + i * actionWidth, y: 420, width: actionWidth - 10, height: 70 },
      action_id: action.name,
    });
  });

  return regions;
}

// ---------------------------------------------------------------------------
// Action Binding Generator
// ---------------------------------------------------------------------------

function generateActions(methods: IDLMethodSchema[]): MetaGlassesActionBinding[] {
  return methods.map(m => ({
    id: m.name,
    method: m.name,
    backend_action_id: `auto_${m.name}`,
    label: formatLabel(m.name),
    focusable: true,
  }));
}

function formatLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 12); // Fit in glasses display
}

// ---------------------------------------------------------------------------
// Main Auto-Compiler
// ---------------------------------------------------------------------------

/**
 * Compile an IDL profile descriptor into a Meta Glasses display profile.
 * This enables any MCP service to be automatically displayed on glasses
 * without manual widget authoring.
 */
export function compileIDLToGlassesDisplay(
  descriptor: IDLProfileDescriptor,
  options: AutoCompileOptions = {},
): MetaGlassesDisplayProfile {
  const maxActions = options.maxActions ?? 3;
  const maxTextBlocks = options.maxTextBlocks ?? 4;
  const updateHz = options.updateHz ?? 2;

  const template = options.forceTemplate ?? selectTemplate(descriptor);
  const prioritizedMethods = prioritizeMethods(descriptor.methods, maxActions, options.priorityMethods);
  const regions = generateRegions(descriptor, template, prioritizedMethods);
  const actions = generateActions(prioritizedMethods);

  return {
    profile: 'meta-glasses-display-profile',
    profile_version: '1.0.0',
    target: {
      display_class: 'meta-ray-ban-display',
      viewport: { width: 600, height: 600 },
      input: ['voice', 'gesture', 'dpad', 'mobile_action'],
      render_path: 'dat-native',
    },
    layout: {
      template,
      regions,
      focus_order: actions.filter(a => a.focusable).map(a => a.id),
    },
    constraints: {
      max_text_blocks: maxTextBlocks,
      max_actions: maxActions,
      requires_high_contrast: true,
      requires_focus_order: true,
      max_update_hz: updateHz,
      ttl_ms: 30000,
    },
    fallback: [
      { when: ['dat_native_display_unavailable'], render_path: 'mobile-card', message: 'View on phone' },
      { when: ['session_not_ready'], render_path: 'notification', message: `${descriptor.name} loading...` },
    ],
    actions,
  };
}

/**
 * Compile an IDL profile into a full GlassesAppEntry ready for registration
 * with the GlassesAppControlPlane.
 */
export function compileIDLToAppEntry(
  descriptor: IDLProfileDescriptor,
  options: AutoCompileOptions = {},
): GlassesAppEntry {
  const display = compileIDLToGlassesDisplay(descriptor, options);
  const id = descriptor.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const name = descriptor.ui?.display_name || descriptor.name;
  const icon = options.icon || descriptor.ui?.icon || '🔧';

  return { id, name, icon, display };
}

/**
 * Batch-compile multiple IDL descriptors and register them with a control plane.
 * This is the main entry point for auto-UI generation from backend services.
 */
export function autoRegisterIDLServices(
  descriptors: IDLProfileDescriptor[],
  registerFn: (entry: GlassesAppEntry) => void,
  options?: Record<string, AutoCompileOptions>,
): { registered: string[]; errors: Array<{ name: string; error: string }> } {
  const registered: string[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const descriptor of descriptors) {
    try {
      const opts = options?.[descriptor.name] || {};
      const entry = compileIDLToAppEntry(descriptor, opts);
      registerFn(entry);
      registered.push(entry.id);
    } catch (err) {
      errors.push({ name: descriptor.name, error: String(err) });
    }
  }

  return { registered, errors };
}

// ---------------------------------------------------------------------------
// Pre-built IPFS Service Descriptors (for auto-registration)
// ---------------------------------------------------------------------------

export const IPFS_IDL_DESCRIPTORS: IDLProfileDescriptor[] = [
  {
    name: 'ipfs-explorer',
    namespace: 'dev.hallucinate.ipfs.kit',
    version: '1.0.0',
    methods: [
      { name: 'add', inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' } } } },
      { name: 'cat', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { content: { type: 'string' } } } },
      { name: 'pin', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { pinned: { type: 'boolean' } } } },
      { name: 'list_pins', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { pins: { type: 'array' } } } },
      { name: 'stat', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { size: { type: 'number' } } } },
      { name: 'dag_get', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { data: { type: 'object' } } } },
      { name: 'dag_put', inputSchema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' } } } },
      { name: 'resolve', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { resolved: { type: 'string' } } } },
      { name: 'name_publish', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
      { name: 'name_resolve', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, outputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
    ],
    ui: { primary_template: 'explorer', icon: '📦', display_name: 'IPFS Explorer', category: 'explorer' },
  },
  {
    name: 'datasets-browser',
    namespace: 'dev.hallucinate.ipfs.datasets',
    version: '1.0.0',
    methods: [
      { name: 'list_datasets', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { datasets: { type: 'array' } } } },
      { name: 'semantic_search', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
      { name: 'embed', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, outputSchema: { type: 'object', properties: { embedding: { type: 'array' } } } },
      { name: 'generate', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] }, outputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
      { name: 'vector_search', inputSchema: { type: 'object', properties: { vector: { type: 'array' } }, required: ['vector'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
      { name: 'vector_index', inputSchema: { type: 'object', properties: { collection: { type: 'string' } }, required: ['collection'] }, outputSchema: { type: 'object', properties: { indexed: { type: 'boolean' } } } },
    ],
    ui: { primary_template: 'explorer', icon: '📊', display_name: 'Datasets Browser', category: 'browser' },
  },
  {
    name: 'accelerate-panel',
    namespace: 'dev.hallucinate.ipfs.accelerate',
    version: '1.0.0',
    methods: [
      { name: 'capabilities', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { backends: { type: 'array' }, models: { type: 'array' } } } },
      { name: 'hardware_profile', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { gpus: { type: 'array' }, memory_gb: { type: 'number' } } } },
      { name: 'inference', inputSchema: { type: 'object', properties: { model: { type: 'string' }, input: { type: 'string' } }, required: ['model', 'input'] }, outputSchema: { type: 'object', properties: { output: { type: 'string' }, latency_ms: { type: 'number' } } } },
      { name: 'list_models', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { models: { type: 'array' } } } },
      { name: 'metrics', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { throughput: { type: 'number' }, utilization: { type: 'number' } } } },
      { name: 'endpoints', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { endpoints: { type: 'array' } } } },
    ],
    ui: { primary_template: 'dashboard', icon: '⚡', display_name: 'GPU Accelerate', category: 'monitor' },
  },
];

/** Priority method overrides for IPFS services */
export const IPFS_AUTO_COMPILE_OPTIONS: Record<string, AutoCompileOptions> = {
  'ipfs-explorer': { priorityMethods: ['list_pins', 'add', 'cat'], icon: '📦' },
  'datasets-browser': { priorityMethods: ['list_datasets', 'semantic_search', 'generate'], icon: '📊' },
  'accelerate-panel': { priorityMethods: ['capabilities', 'inference', 'metrics'], icon: '⚡' },
};

export default compileIDLToGlassesDisplay;
