/**
 * IPFS Meta Glasses Widget Descriptors
 * 
 * MetaGlassesWidgetDescriptor definitions for IPFS Kit, Datasets, and Accelerate
 * operations. These enable AR display of IPFS operations on Meta Ray-Ban glasses
 * with DAT-native rendering, voice/gesture input, and mobile fallback.
 * 
 * Each widget provides a constrained display layout optimized for the 600x600
 * viewport with focus-ordered navigation and action bindings to MCP-IDL methods.
 */

import type {
  MetaGlassesDisplayProfile,
  MetaGlassesDisplayRegion,
  MetaGlassesActionBinding,
  MetaGlassesWidgetDescriptor,
} from './meta-glasses-display-profile.js';
import { META_GLASSES_DISPLAY_PROFILE, META_GLASSES_DISPLAY_PROFILE_VERSION } from './meta-glasses-display-profile.js';
import { ipfsKitUIProfile, ipfsDatasetsUIProfile, ipfsAccelerateUIProfile } from '../ipfs-ui-profiles.js';

// ---------------------------------------------------------------------------
// IPFS Kit - Glasses Widget (Content Status Card)
// ---------------------------------------------------------------------------

const ipfsKitGlassesDisplay: MetaGlassesDisplayProfile = {
  profile: META_GLASSES_DISPLAY_PROFILE,
  profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
  target: {
    display_class: 'meta-ray-ban-display',
    viewport: { width: 600, height: 600 },
    input: ['voice', 'gesture', 'mobile_action'],
    render_path: 'dat-native',
  },
  layout: {
    template: 'status',
    regions: [
      {
        id: 'header',
        kind: 'text',
        bounds: { x: 20, y: 20, width: 560, height: 60 },
        text: { source: 'state.pin_count', value: 'IPFS Storage', max_lines: 2, max_chars: 40, overflow: 'truncate' },
      },
      {
        id: 'pin-count',
        kind: 'status',
        bounds: { x: 20, y: 100, width: 270, height: 120 },
        text: { source: 'state.pin_count', value: '0 pins', max_lines: 1, max_chars: 20, overflow: 'truncate' },
      },
      {
        id: 'total-size',
        kind: 'status',
        bounds: { x: 310, y: 100, width: 270, height: 120 },
        text: { source: 'state.total_size', value: '0 B', max_lines: 1, max_chars: 20, overflow: 'truncate' },
      },
      {
        id: 'recent-cid',
        kind: 'text',
        bounds: { x: 20, y: 240, width: 560, height: 80 },
        text: { source: 'state.selected_cid', value: 'No content selected', max_lines: 2, max_chars: 60, overflow: 'truncate' },
      },
      {
        id: 'action-add',
        kind: 'action',
        bounds: { x: 20, y: 340, width: 270, height: 80 },
        action_id: 'add-content',
      },
      {
        id: 'action-browse',
        kind: 'action',
        bounds: { x: 310, y: 340, width: 270, height: 80 },
        action_id: 'browse-pins',
      },
      {
        id: 'ipns-status',
        kind: 'text',
        bounds: { x: 20, y: 440, width: 560, height: 60 },
        text: { source: 'state.ipns_names', value: 'IPNS: --', max_lines: 1, max_chars: 50, overflow: 'truncate' },
        visible_if: 'state.ipns_names.length > 0',
      },
    ],
    focus_order: ['action-add', 'action-browse', 'recent-cid'],
  },
  constraints: {
    max_text_blocks: 5,
    max_actions: 3,
    requires_high_contrast: true,
    requires_focus_order: true,
    max_update_hz: 2,
    ttl_ms: 30000,
  },
  fallback: [
    { when: ['dat_native_display_unavailable'], render_path: 'mobile-card', message: 'View IPFS status on phone' },
    { when: ['session_not_ready'], render_path: 'notification', message: 'IPFS backend connecting...' },
  ],
  actions: [
    { id: 'add-content', method: 'add', backend_action_id: 'ipfs_add', label: 'Add Content', focusable: true },
    { id: 'browse-pins', method: 'list_pins', backend_action_id: 'ipfs_list_pins', label: 'Browse Pins', focusable: true },
    { id: 'resolve-name', method: 'name_resolve', backend_action_id: 'ipfs_name_resolve', label: 'Resolve Name', focusable: true },
  ],
};

export const ipfsKitGlassesWidget: MetaGlassesWidgetDescriptor = {
  ...ipfsKitUIProfile,
  meta_glasses_display: ipfsKitGlassesDisplay,
} as MetaGlassesWidgetDescriptor;

// ---------------------------------------------------------------------------
// IPFS Datasets - Glasses Widget (Search & Generate Card)
// ---------------------------------------------------------------------------

const ipfsDatasetsGlassesDisplay: MetaGlassesDisplayProfile = {
  profile: META_GLASSES_DISPLAY_PROFILE,
  profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
  target: {
    display_class: 'meta-ray-ban-display',
    viewport: { width: 600, height: 600 },
    input: ['voice', 'gesture', 'mobile_action'],
    render_path: 'dat-native',
  },
  layout: {
    template: 'stack',
    regions: [
      {
        id: 'header',
        kind: 'text',
        bounds: { x: 20, y: 20, width: 560, height: 60 },
        text: { value: 'Datasets & Search', max_lines: 1, max_chars: 30, overflow: 'truncate' },
      },
      {
        id: 'search-results',
        kind: 'list',
        bounds: { x: 20, y: 100, width: 560, height: 240 },
        text: { source: 'state.search_results', value: 'No results', max_lines: 6, max_chars: 200, overflow: 'wrap' },
      },
      {
        id: 'generation-output',
        kind: 'text',
        bounds: { x: 20, y: 360, width: 560, height: 100 },
        text: { source: 'state.generation_history', value: 'Say "generate" to create text', max_lines: 3, max_chars: 120, overflow: 'wrap' },
        visible_if: 'state.generation_history.length > 0',
      },
      {
        id: 'action-search',
        kind: 'action',
        bounds: { x: 20, y: 480, width: 180, height: 70 },
        action_id: 'voice-search',
      },
      {
        id: 'action-generate',
        kind: 'action',
        bounds: { x: 210, y: 480, width: 180, height: 70 },
        action_id: 'voice-generate',
      },
      {
        id: 'action-embed',
        kind: 'action',
        bounds: { x: 400, y: 480, width: 180, height: 70 },
        action_id: 'embed-content',
      },
    ],
    focus_order: ['action-search', 'action-generate', 'action-embed', 'search-results'],
  },
  constraints: {
    max_text_blocks: 4,
    max_actions: 3,
    requires_high_contrast: true,
    requires_focus_order: true,
    max_update_hz: 3,
    ttl_ms: 60000,
  },
  fallback: [
    { when: ['dat_native_display_unavailable'], render_path: 'mobile-card', message: 'View search results on phone' },
    { when: ['session_not_ready'], render_path: 'audio-summary', message: 'Datasets service is starting' },
  ],
  actions: [
    { id: 'voice-search', method: 'semantic_search', backend_action_id: 'ipfs_semantic_search', label: 'Search', focusable: true },
    { id: 'voice-generate', method: 'generate', backend_action_id: 'ipfs_generate', label: 'Generate', focusable: true },
    { id: 'embed-content', method: 'embed', backend_action_id: 'ipfs_embed', label: 'Embed', focusable: true },
  ],
};

export const ipfsDatasetsGlassesWidget: MetaGlassesWidgetDescriptor = {
  ...ipfsDatasetsUIProfile,
  meta_glasses_display: ipfsDatasetsGlassesDisplay,
} as MetaGlassesWidgetDescriptor;

// ---------------------------------------------------------------------------
// IPFS Accelerate - Glasses Widget (Inference Progress Card)
// ---------------------------------------------------------------------------

const ipfsAccelerateGlassesDisplay: MetaGlassesDisplayProfile = {
  profile: META_GLASSES_DISPLAY_PROFILE,
  profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
  target: {
    display_class: 'meta-ray-ban-display',
    viewport: { width: 600, height: 600 },
    input: ['voice', 'gesture', 'mobile_action'],
    render_path: 'dat-native',
  },
  layout: {
    template: 'task-progress',
    regions: [
      {
        id: 'header',
        kind: 'text',
        bounds: { x: 20, y: 20, width: 560, height: 60 },
        text: { value: 'Accelerate', max_lines: 1, max_chars: 20, overflow: 'truncate' },
      },
      {
        id: 'gpu-status',
        kind: 'status',
        bounds: { x: 20, y: 100, width: 270, height: 100 },
        text: { source: 'state.gpu_utilization', value: 'GPU: --', max_lines: 2, max_chars: 30, overflow: 'truncate' },
      },
      {
        id: 'latency-status',
        kind: 'status',
        bounds: { x: 310, y: 100, width: 270, height: 100 },
        text: { source: 'state.avg_latency', value: 'Latency: --', max_lines: 2, max_chars: 30, overflow: 'truncate' },
      },
      {
        id: 'inference-progress',
        kind: 'progress',
        bounds: { x: 20, y: 220, width: 560, height: 80 },
        text: { source: 'state.inference_queue', value: 'Idle', max_lines: 1, max_chars: 40, overflow: 'truncate' },
      },
      {
        id: 'active-model',
        kind: 'text',
        bounds: { x: 20, y: 320, width: 560, height: 60 },
        text: { source: 'state.active_model', value: 'No model loaded', max_lines: 1, max_chars: 50, overflow: 'truncate' },
      },
      {
        id: 'action-infer',
        kind: 'action',
        bounds: { x: 20, y: 400, width: 270, height: 80 },
        action_id: 'run-inference',
      },
      {
        id: 'action-metrics',
        kind: 'action',
        bounds: { x: 310, y: 400, width: 270, height: 80 },
        action_id: 'view-metrics',
      },
    ],
    focus_order: ['action-infer', 'action-metrics', 'active-model'],
  },
  constraints: {
    max_text_blocks: 5,
    max_actions: 2,
    requires_high_contrast: true,
    requires_focus_order: true,
    max_update_hz: 5,
    ttl_ms: 15000,
  },
  fallback: [
    { when: ['dat_native_display_unavailable'], render_path: 'mobile-card', message: 'View inference status on phone' },
    { when: ['session_not_ready'], render_path: 'notification', message: 'Accelerate engine starting...' },
  ],
  actions: [
    { id: 'run-inference', method: 'inference', backend_action_id: 'ipfs_inference', label: 'Run Inference', focusable: true },
    { id: 'view-metrics', method: 'metrics', backend_action_id: 'ipfs_metrics', label: 'Metrics', focusable: true },
  ],
};

export const ipfsAccelerateGlassesWidget: MetaGlassesWidgetDescriptor = {
  ...ipfsAccelerateUIProfile,
  meta_glasses_display: ipfsAccelerateGlassesDisplay,
} as MetaGlassesWidgetDescriptor;

// ---------------------------------------------------------------------------
// Export all glasses widgets
// ---------------------------------------------------------------------------

export const ipfsGlassesWidgets = [
  ipfsKitGlassesWidget,
  ipfsDatasetsGlassesWidget,
  ipfsAccelerateGlassesWidget,
];

export default ipfsGlassesWidgets;
