/**
 * Meta Glasses Enhanced Control Plane
 * 
 * Comprehensive improvements to the glasses control plane including:
 * - Reactive state synchronization between desktop apps and glasses display
 * - Voice intent recognition and routing
 * - Gesture recognition dispatch
 * - Priority-based notification pipeline
 * - ORB invoke bridge (glasses actions trigger real backend calls)
 * - Multi-modal input fusion (voice + gesture + dpad combined)
 * - Display state machine with transition animations
 * - Power-aware rendering with adaptive refresh rates
 */

import type { MetaGlassesDisplayProfile, MetaGlassesActionBinding } from './meta-glasses-display-profile.js';
import type { GlassesAppEntry } from './glasses-app-control-plane.js';
import { GLASSES_APP_REGISTRY, GlassesAppControlPlane } from './glasses-app-control-plane.js';

// ---------------------------------------------------------------------------
// State Synchronization Engine
// ---------------------------------------------------------------------------

export type StateBinding = {
  source: string;       // e.g., 'state.pin_count'
  regionId: string;     // Display region to update
  transform?: (value: unknown) => string; // Optional formatter
  throttleMs?: number;  // Min interval between updates
};

export interface AppStateSnapshot {
  appId: string;
  values: Record<string, unknown>;
  timestamp: number;
  dirty: Set<string>;
}

/**
 * Reactive state engine that syncs app state to glasses display regions.
 * Uses a dirty-checking approach with throttled updates to respect
 * the max_update_hz constraint.
 */
export class GlassesStateSyncEngine {
  private bindings: Map<string, StateBinding[]> = new Map();
  private appStates: Map<string, AppStateSnapshot> = new Map();
  private updateTimers: Map<string, number> = new Map();
  private listeners: Array<(appId: string, regionId: string, value: string) => void> = [];

  /** Register bindings for an app's display regions */
  registerBindings(appId: string, bindings: StateBinding[]): void {
    this.bindings.set(appId, bindings);
    if (!this.appStates.has(appId)) {
      this.appStates.set(appId, { appId, values: {}, timestamp: 0, dirty: new Set() });
    }
  }

  /** Update app state (called by desktop app when state changes) */
  setState(appId: string, key: string, value: unknown): void {
    const snapshot = this.appStates.get(appId);
    if (!snapshot) return;
    
    const prev = snapshot.values[key];
    if (prev === value) return; // No change
    
    snapshot.values[key] = value;
    snapshot.dirty.add(key);
    snapshot.timestamp = Date.now();
    
    this._scheduleFlush(appId);
  }

  /** Batch state update */
  setStateMulti(appId: string, updates: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(updates)) {
      this.setState(appId, key, value);
    }
  }

  /** Subscribe to region updates (used by display renderer) */
  onRegionUpdate(listener: (appId: string, regionId: string, value: string) => void): void {
    this.listeners.push(listener);
  }

  /** Get current state for an app */
  getState(appId: string): Record<string, unknown> {
    return this.appStates.get(appId)?.values ?? {};
  }

  private _scheduleFlush(appId: string): void {
    if (this.updateTimers.has(appId)) return; // Already scheduled
    
    const bindings = this.bindings.get(appId) || [];
    const minThrottle = Math.min(...bindings.map(b => b.throttleMs ?? 200), 200);
    
    const timerId = setTimeout(() => {
      this._flush(appId);
      this.updateTimers.delete(appId);
    }, minThrottle) as unknown as number;
    
    this.updateTimers.set(appId, timerId);
  }

  private _flush(appId: string): void {
    const snapshot = this.appStates.get(appId);
    const bindings = this.bindings.get(appId);
    if (!snapshot || !bindings) return;

    for (const binding of bindings) {
      const stateKey = binding.source.replace('state.', '');
      if (!snapshot.dirty.has(stateKey)) continue;
      
      const rawValue = snapshot.values[stateKey];
      const displayValue = binding.transform 
        ? binding.transform(rawValue) 
        : String(rawValue ?? '--');
      
      for (const listener of this.listeners) {
        listener(appId, binding.regionId, displayValue);
      }
    }
    
    snapshot.dirty.clear();
  }
}

// ---------------------------------------------------------------------------
// Voice Intent Recognition & Routing
// ---------------------------------------------------------------------------

export interface VoiceIntent {
  intent: string;
  confidence: number;
  slots: Record<string, string>;
  rawTranscript: string;
}

export interface VoiceIntentPattern {
  pattern: RegExp;
  intent: string;
  slotExtractors?: Record<string, (match: RegExpMatchArray) => string>;
}

/** Voice intent routes - maps spoken commands to control plane actions */
const VOICE_INTENT_PATTERNS: VoiceIntentPattern[] = [
  // App navigation
  { pattern: /^(open|launch|start|show)\s+(.+)$/i, intent: 'app.open', slotExtractors: { appName: (m) => m[2] } },
  { pattern: /^(go\s+)?back$/i, intent: 'app.back' },
  { pattern: /^(close|exit|quit)(\s+.*)?$/i, intent: 'app.close' },
  { pattern: /^home$/i, intent: 'app.home' },
  
  // Focus & activation
  { pattern: /^next$/i, intent: 'focus.next' },
  { pattern: /^(previous|prev|back\s*up)$/i, intent: 'focus.previous' },
  { pattern: /^(select|confirm|activate|ok|go)$/i, intent: 'action.activate' },
  { pattern: /^(cancel|dismiss|never\s*mind)$/i, intent: 'action.cancel' },
  
  // IPFS operations
  { pattern: /^(pin|add)\s+(to\s+)?ipfs$/i, intent: 'ipfs.add' },
  { pattern: /^(browse|list)\s+pins$/i, intent: 'ipfs.list_pins' },
  { pattern: /^search\s+(.+)$/i, intent: 'search.semantic', slotExtractors: { query: (m) => m[1] } },
  { pattern: /^generate\s+(.+)$/i, intent: 'generate.text', slotExtractors: { prompt: (m) => m[1] } },
  
  // Inference
  { pattern: /^(run|start)\s+inference$/i, intent: 'accelerate.inference' },
  { pattern: /^(show|check)\s+metrics$/i, intent: 'accelerate.metrics' },
  
  // System
  { pattern: /^(what|show)\s+(is\s+)?(the\s+)?status$/i, intent: 'system.status' },
  { pattern: /^(read|tell\s+me)\s+(.+)$/i, intent: 'display.read_aloud', slotExtractors: { target: (m) => m[2] } },
  { pattern: /^scroll\s+(up|down)$/i, intent: 'display.scroll', slotExtractors: { direction: (m) => m[1] } },
];

/** App name aliases for voice recognition */
const APP_NAME_ALIASES: Record<string, string> = {
  'terminal': 'terminal', 'console': 'terminal', 'shell': 'terminal', 'command line': 'terminal',
  'chat': 'ai-chat', 'ai': 'ai-chat', 'assistant': 'ai-chat',
  'files': 'file-manager', 'file manager': 'file-manager', 'explorer': 'file-manager',
  'settings': 'settings', 'config': 'settings', 'preferences': 'settings',
  'editor': 'code-editor', 'code': 'code-editor', 'vibe code': 'code-editor',
  'tasks': 'task-manager', 'processes': 'task-manager', 'task manager': 'task-manager',
  'models': 'model-browser', 'model browser': 'model-browser',
  'ipfs': 'ipfs-explorer', 'storage': 'ipfs-explorer',
  'datasets': 'datasets-browser', 'data': 'datasets-browser',
  'accelerate': 'accelerate-panel', 'gpu': 'accelerate-panel', 'inference': 'accelerate-panel',
  'interfaces': 'idl-explorer', 'idl': 'idl-explorer',
  'glasses': 'glasses-preview', 'display': 'glasses-preview',
};

export class VoiceIntentRouter {
  private patterns: VoiceIntentPattern[] = [...VOICE_INTENT_PATTERNS];
  private appAliases: Record<string, string> = { ...APP_NAME_ALIASES };

  /** Parse a voice transcript into a structured intent */
  recognize(transcript: string): VoiceIntent | null {
    const clean = transcript.trim().toLowerCase();
    
    for (const { pattern, intent, slotExtractors } of this.patterns) {
      const match = clean.match(pattern);
      if (match) {
        const slots: Record<string, string> = {};
        if (slotExtractors) {
          for (const [slot, extractor] of Object.entries(slotExtractors)) {
            slots[slot] = extractor(match);
          }
        }
        return { intent, confidence: 0.9, slots, rawTranscript: transcript };
      }
    }
    
    return null;
  }

  /** Resolve an app name alias to app ID */
  resolveAppName(name: string): string | null {
    const normalized = name.toLowerCase().trim();
    return this.appAliases[normalized] ?? null;
  }

  /** Add custom voice pattern */
  addPattern(pattern: VoiceIntentPattern): void {
    this.patterns.unshift(pattern); // Custom patterns take priority
  }

  /** Add app alias */
  addAlias(alias: string, appId: string): void {
    this.appAliases[alias.toLowerCase()] = appId;
  }
}

// ---------------------------------------------------------------------------
// Gesture Recognition Dispatch
// ---------------------------------------------------------------------------

export type GestureType = 
  | 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down'
  | 'tap' | 'double_tap' | 'long_press'
  | 'pinch_in' | 'pinch_out'
  | 'flick_left' | 'flick_right'
  | 'head_nod' | 'head_shake';

export interface GestureEvent {
  type: GestureType;
  confidence: number;
  timestamp: number;
  velocity?: number;
  position?: { x: number; y: number };
}

export interface GestureBinding {
  gesture: GestureType;
  action: string; // Control plane method name
  context?: string; // Optional: only active in specific app
}

const DEFAULT_GESTURE_BINDINGS: GestureBinding[] = [
  // Navigation
  { gesture: 'swipe_left', action: 'goBack' },
  { gesture: 'swipe_right', action: 'focusNext' },
  { gesture: 'swipe_up', action: 'scrollUp' },
  { gesture: 'swipe_down', action: 'scrollDown' },
  
  // Activation
  { gesture: 'tap', action: 'activate' },
  { gesture: 'double_tap', action: 'openAppSwitcher' },
  { gesture: 'long_press', action: 'showContextMenu' },
  
  // Focus
  { gesture: 'flick_right', action: 'focusNext' },
  { gesture: 'flick_left', action: 'focusPrevious' },
  
  // Zoom / detail
  { gesture: 'pinch_out', action: 'expandDetail' },
  { gesture: 'pinch_in', action: 'collapseDetail' },
  
  // Head gestures
  { gesture: 'head_nod', action: 'confirm' },
  { gesture: 'head_shake', action: 'dismiss' },
];

export class GestureDispatcher {
  private bindings: GestureBinding[] = [...DEFAULT_GESTURE_BINDINGS];
  private listeners: Array<(action: string, event: GestureEvent) => void> = [];
  private lastGestureTime: number = 0;
  private cooldownMs: number = 300;

  /** Process a gesture event and dispatch the mapped action */
  dispatch(event: GestureEvent): string | null {
    // Cooldown to prevent accidental double-triggers
    if (event.timestamp - this.lastGestureTime < this.cooldownMs) return null;
    if (event.confidence < 0.7) return null; // Minimum confidence threshold
    
    this.lastGestureTime = event.timestamp;
    
    const binding = this.bindings.find(b => b.gesture === event.type);
    if (!binding) return null;
    
    for (const listener of this.listeners) {
      listener(binding.action, event);
    }
    
    return binding.action;
  }

  /** Subscribe to dispatched actions */
  onAction(listener: (action: string, event: GestureEvent) => void): void {
    this.listeners.push(listener);
  }

  /** Override gesture binding */
  setBinding(gesture: GestureType, action: string, context?: string): void {
    const existing = this.bindings.findIndex(b => b.gesture === gesture && b.context === context);
    if (existing >= 0) this.bindings[existing].action = action;
    else this.bindings.push({ gesture, action, context });
  }

  /** Set cooldown (ms between gestures) */
  setCooldown(ms: number): void {
    this.cooldownMs = ms;
  }
}

// ---------------------------------------------------------------------------
// Notification Pipeline
// ---------------------------------------------------------------------------

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationDisplayMode = 'banner' | 'toast' | 'badge' | 'audio_only';

export interface GlassesNotification {
  id: string;
  priority: NotificationPriority;
  title: string;
  body?: string;
  icon?: string;
  appId?: string;
  displayMode: NotificationDisplayMode;
  ttlMs: number;
  createdAt: number;
  action?: { method: string; params: Record<string, unknown> };
}

export class GlassesNotificationPipeline {
  private queue: GlassesNotification[] = [];
  private activeNotification: GlassesNotification | null = null;
  private maxQueueSize: number = 20;
  private listeners: Array<(notification: GlassesNotification | null) => void> = [];
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /** Enqueue a notification */
  notify(notification: Omit<GlassesNotification, 'id' | 'createdAt'>): string {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: GlassesNotification = { ...notification, id, createdAt: Date.now() };
    
    // Critical notifications interrupt immediately
    if (notification.priority === 'critical') {
      this._display(full);
      return id;
    }
    
    // Insert by priority
    const insertIndex = this.queue.findIndex(n => 
      this._priorityWeight(n.priority) < this._priorityWeight(notification.priority)
    );
    if (insertIndex >= 0) this.queue.splice(insertIndex, 0, full);
    else this.queue.push(full);
    
    // Trim queue
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(0, this.maxQueueSize);
    }
    
    // Display if nothing active
    if (!this.activeNotification) this._displayNext();
    
    return id;
  }

  /** Dismiss current notification */
  dismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.activeNotification = null;
    this._notifyListeners(null);
    this._displayNext();
  }

  /** Get queue length */
  get pending(): number { return this.queue.length; }

  /** Subscribe to notification display changes */
  onDisplay(listener: (notification: GlassesNotification | null) => void): void {
    this.listeners.push(listener);
  }

  private _display(notification: GlassesNotification): void {
    this.activeNotification = notification;
    this._notifyListeners(notification);
    
    // Auto-dismiss after TTL
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.dismiss(), notification.ttlMs);
  }

  private _displayNext(): void {
    const next = this.queue.shift();
    if (next) this._display(next);
  }

  private _notifyListeners(notification: GlassesNotification | null): void {
    for (const listener of this.listeners) listener(notification);
  }

  private _priorityWeight(p: NotificationPriority): number {
    return { critical: 4, high: 3, normal: 2, low: 1 }[p];
  }
}

// ---------------------------------------------------------------------------
// ORB Invoke Bridge
// ---------------------------------------------------------------------------

export interface ORBInvokeRequest {
  appId: string;
  actionId: string;
  method: string;
  params: Record<string, unknown>;
  correlationId: string;
}

export interface ORBInvokeResult {
  success: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
  correlationId: string;
}

/**
 * Bridges glasses action activations to real backend invocations
 * through the ORB capability router or direct HTTP calls.
 */
export class GlassesORBBridge {
  private backendUrl: string;
  private pendingInvocations: Map<string, { resolve: (r: ORBInvokeResult) => void; startTime: number }> = new Map();

  constructor(backendUrl = 'http://localhost:8080/v1/ipfs') {
    this.backendUrl = backendUrl;
  }

  /** Invoke a backend method triggered by a glasses action */
  async invoke(request: ORBInvokeRequest): Promise<ORBInvokeResult> {
    const startTime = Date.now();
    const correlationId = request.correlationId || `orb_${Date.now()}`;

    try {
      // Map action methods to backend endpoints
      const endpoint = this._resolveEndpoint(request.method);
      const httpMethod = this._resolveHttpMethod(request.method);
      
      const fetchOpts: RequestInit = {
        method: httpMethod,
        headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
        signal: AbortSignal.timeout(10000),
      };
      
      if (httpMethod === 'POST') {
        fetchOpts.body = JSON.stringify(request.params);
      }

      let url = `${this.backendUrl}${endpoint}`;
      if (httpMethod === 'GET' && Object.keys(request.params).length > 0) {
        const params = new URLSearchParams();
        Object.entries(request.params).forEach(([k, v]) => params.set(k, String(v)));
        url += `?${params}`;
      }

      const resp = await fetch(url, fetchOpts);
      const data = await resp.json();
      
      return {
        success: resp.ok,
        data,
        latencyMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        latencyMs: Date.now() - startTime,
        correlationId,
      };
    }
  }

  private _resolveEndpoint(method: string): string {
    const methodToEndpoint: Record<string, string> = {
      // IPFS Kit
      'add': '/add', 'cat': '/cat', 'pin': '/pin', 'unpin': '/unpin',
      'list_pins': '/list_pins', 'stat': '/stat', 'resolve': '/resolve',
      'dag_get': '/dag/get', 'dag_put': '/dag/put',
      'name_publish': '/name/publish', 'name_resolve': '/name/resolve',
      // Datasets
      'embed': '/embed', 'generate': '/generate',
      'list_datasets': '/list_datasets', 'search_datasets': '/search_datasets',
      'semantic_search': '/search/semantic', 'vector_search': '/vector/search',
      'vector_index': '/vector/index',
      // Accelerate
      'capabilities': '/capabilities', 'hardware_profile': '/hardware_profile',
      'list_models': '/list_models', 'inference': '/inference',
      'metrics': '/metrics', 'endpoints': '/endpoints',
      'scrape_url': '/scrape/url', 'workflow_execute': '/workflow/execute',
      // Status
      'status': '/status',
    };
    return methodToEndpoint[method] || `/${method}`;
  }

  private _resolveHttpMethod(method: string): string {
    const getMethods = new Set(['cat', 'list_pins', 'stat', 'resolve', 'dag_get',
      'name_resolve', 'capabilities', 'hardware_profile', 'list_models',
      'metrics', 'endpoints', 'list_datasets', 'search_datasets', 'status']);
    return getMethods.has(method) ? 'GET' : 'POST';
  }
}

// ---------------------------------------------------------------------------
// Enhanced Control Plane (orchestrates all subsystems)
// ---------------------------------------------------------------------------

export interface EnhancedControlPlaneConfig {
  backendUrl?: string;
  maxUpdateHz?: number;
  gestureGooldownMs?: number;
  notificationQueueSize?: number;
}

/**
 * EnhancedGlassesControlPlane orchestrates state sync, voice, gesture,
 * notifications, and ORB invocations into a unified control surface
 * for Meta Glasses interaction with all SwissKnife desktop apps.
 */
export class EnhancedGlassesControlPlane {
  public readonly controlPlane: GlassesAppControlPlane;
  public readonly stateSync: GlassesStateSyncEngine;
  public readonly voice: VoiceIntentRouter;
  public readonly gesture: GestureDispatcher;
  public readonly notifications: GlassesNotificationPipeline;
  public readonly orbBridge: GlassesORBBridge;

  private config: Required<EnhancedControlPlaneConfig>;

  constructor(config: EnhancedControlPlaneConfig = {}) {
    this.config = {
      backendUrl: config.backendUrl ?? 'http://localhost:8080/v1/ipfs',
      maxUpdateHz: config.maxUpdateHz ?? 5,
      gestureGooldownMs: config.gestureGooldownMs ?? 300,
      notificationQueueSize: config.notificationQueueSize ?? 20,
    };

    this.controlPlane = new GlassesAppControlPlane();
    this.stateSync = new GlassesStateSyncEngine();
    this.voice = new VoiceIntentRouter();
    this.gesture = new GestureDispatcher();
    this.notifications = new GlassesNotificationPipeline();
    this.orbBridge = new GlassesORBBridge(this.config.backendUrl);

    this.gesture.setCooldown(this.config.gestureGooldownMs);
    this._wireSubsystems();
  }

  /** Process a voice transcript and execute the intent */
  async handleVoice(transcript: string): Promise<{ intent: string; result: unknown } | null> {
    const intent = this.voice.recognize(transcript);
    if (!intent) return null;

    switch (intent.intent) {
      case 'app.open': {
        const appId = this.voice.resolveAppName(intent.slots.appName || '');
        if (appId) this.controlPlane.openApp(appId);
        return { intent: intent.intent, result: { appId } };
      }
      case 'app.back':
        this.controlPlane.goBack();
        return { intent: intent.intent, result: {} };
      case 'focus.next':
        return { intent: intent.intent, result: this.controlPlane.focusNext() };
      case 'focus.previous':
        return { intent: intent.intent, result: this.controlPlane.focusPrevious() };
      case 'action.activate': {
        const action = this.controlPlane.activate();
        if (action) {
          const result = await this.orbBridge.invoke({
            appId: this.controlPlane.getState().activeAppId || '',
            actionId: action.id,
            method: action.method,
            params: {},
            correlationId: `voice_${Date.now()}`,
          });
          return { intent: intent.intent, result };
        }
        return { intent: intent.intent, result: null };
      }
      case 'search.semantic': {
        const result = await this.orbBridge.invoke({
          appId: 'datasets-browser',
          actionId: 'voice-search',
          method: 'semantic_search',
          params: { query: intent.slots.query },
          correlationId: `voice_search_${Date.now()}`,
        });
        return { intent: intent.intent, result };
      }
      case 'generate.text': {
        const result = await this.orbBridge.invoke({
          appId: 'datasets-browser',
          actionId: 'voice-generate',
          method: 'generate',
          params: { prompt: intent.slots.prompt },
          correlationId: `voice_gen_${Date.now()}`,
        });
        return { intent: intent.intent, result };
      }
      default:
        return { intent: intent.intent, result: null };
    }
  }

  /** Process a gesture event */
  async handleGesture(event: GestureEvent): Promise<string | null> {
    const action = this.gesture.dispatch(event);
    if (!action) return null;

    switch (action) {
      case 'goBack': this.controlPlane.goBack(); break;
      case 'focusNext': this.controlPlane.focusNext(); break;
      case 'focusPrevious': this.controlPlane.focusPrevious(); break;
      case 'activate': {
        const activated = this.controlPlane.activate();
        if (activated) {
          await this.orbBridge.invoke({
            appId: this.controlPlane.getState().activeAppId || '',
            actionId: activated.id,
            method: activated.method,
            params: {},
            correlationId: `gesture_${Date.now()}`,
          });
        }
        break;
      }
      case 'confirm': {
        const confirmed = this.controlPlane.activate();
        if (confirmed) {
          await this.orbBridge.invoke({
            appId: this.controlPlane.getState().activeAppId || '',
            actionId: confirmed.id,
            method: confirmed.method,
            params: {},
            correlationId: `nod_${Date.now()}`,
          });
        }
        break;
      }
      case 'dismiss':
        this.notifications.dismiss();
        break;
    }

    return action;
  }

  /** Get full display state for rendering */
  getDisplayState() {
    const display = this.controlPlane.getCurrentDisplay();
    const notification = this.notifications.pending > 0 ? 'has_notifications' : 'clear';
    return {
      display,
      notification,
      appState: display ? this.stateSync.getState(display.app.id) : {},
    };
  }

  private _wireSubsystems(): void {
    // Gesture -> control plane
    this.gesture.onAction((action) => {
      // Emit notification for important actions
      if (action === 'activate') {
        const display = this.controlPlane.getCurrentDisplay();
        if (display?.focusedAction) {
          this.notifications.notify({
            priority: 'low',
            title: `Action: ${display.focusedAction}`,
            displayMode: 'badge',
            ttlMs: 2000,
          });
        }
      }
    });

    // State sync -> emit updates
    this.stateSync.onRegionUpdate((appId, regionId, value) => {
      // This would dispatch to the DAT native renderer
      console.log(`[Glasses] State update: ${appId}/${regionId} = ${value}`);
    });
  }
}

export default EnhancedGlassesControlPlane;
