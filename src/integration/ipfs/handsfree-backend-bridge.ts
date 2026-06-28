// src/integration/ipfs/handsfree-backend-bridge.ts

/**
 * Integration bridge that routes all IPFS operations through the
 * handsfree backend's /v1/ipfs/* unified API.
 *
 * This is the primary integration path for SwissKnife CLI and web UI
 * to access ipfs_kit_py, ipfs_datasets_py, and ipfs_accelerate_py
 * capabilities without requiring native module loading.
 */

import { IntegrationBridge } from '../registry.js';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080';
const REQUEST_TIMEOUT_MS = 30000;

export interface HandsfreeBackendConfig {
  backendUrl?: string;
  timeoutMs?: number;
}

export class HandsfreeBackendBridge implements IntegrationBridge {
  id = 'handsfree-backend';
  name = 'Handsfree Backend Bridge';
  source: string = 'handsfree';
  target: string = 'current';

  private backendUrl: string;
  private timeoutMs: number;
  private initialized = false;

  constructor(config?: HandsfreeBackendConfig) {
    this.backendUrl = config?.backendUrl || process.env.HANDSFREE_BACKEND_URL || DEFAULT_BACKEND_URL;
    this.timeoutMs = config?.timeoutMs || REQUEST_TIMEOUT_MS;
  }

  async initialize(): Promise<boolean> {
    try {
      const status = await this.request('GET', '/v1/ipfs/status');
      this.initialized = !!(status.ipfs_kit || status.ipfs_datasets || status.ipfs_accelerate);
      return this.initialized;
    } catch {
      this.initialized = false;
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // --- IPFS Kit Operations ---

  async addContent(data: Buffer | string, options?: { pin?: boolean }): Promise<{ cid: string }> {
    const base64 = Buffer.isBuffer(data)
      ? data.toString('base64')
      : Buffer.from(data).toString('base64');
    const resp = await this.request('POST', '/v1/ipfs/add', {
      data_base64: base64,
      pin: options?.pin !== false,
    });
    return { cid: resp.cid };
  }

  async getContent(cid: string): Promise<Buffer> {
    const resp = await this.request('POST', '/v1/ipfs/cat', { cid });
    return Buffer.from(resp.data_base64, 'base64');
  }

  async pinContent(cid: string): Promise<{ ok: boolean }> {
    return this.request('POST', '/v1/ipfs/pin', { cid });
  }

  async unpinContent(cid: string): Promise<{ ok: boolean }> {
    return this.request('POST', '/v1/ipfs/unpin', { cid });
  }

  async resolve(cid: string): Promise<any> {
    return this.request('POST', '/v1/ipfs/resolve', { cid });
  }

  // --- IPFS Datasets Operations ---

  async embedTexts(texts: string[], options?: { model_name?: string }): Promise<{ embeddings: number[][] }> {
    return this.request('POST', '/v1/ipfs/embed', {
      texts,
      model_name: options?.model_name || null,
      provider: 'datasets',
    });
  }

  async generateText(prompt: string, options?: { model_name?: string; provider?: string }): Promise<{ text: string }> {
    return this.request('POST', '/v1/ipfs/generate', {
      prompt,
      model_name: options?.model_name || null,
      provider: options?.provider || 'datasets',
    });
  }

  async listDatasets(query?: string, limit?: number): Promise<{ datasets: any[] }> {
    return this.request('POST', '/v1/ipfs/list_datasets', {
      query: query || null,
      limit: limit || 20,
    });
  }

  // --- IPFS Accelerate Operations ---

  async getHardwareProfile(): Promise<any> {
    return this.request('GET', '/v1/ipfs/hardware_profile');
  }

  async listModels(): Promise<{ models: any[] }> {
    return this.request('GET', '/v1/ipfs/list_models');
  }

  async runInference(modelName: string, inputs: any, parameters?: Record<string, any>): Promise<any> {
    return this.request('POST', '/v1/ipfs/inference', {
      model_name: modelName,
      inputs,
      parameters: parameters || {},
    });
  }

  async getCapabilities(): Promise<any> {
    return this.request('GET', '/v1/ipfs/capabilities');
  }

  // --- ORB Capability Integration ---

  /**
   * Route an ORB capability invocation through the handsfree backend.
   * Maps ORB operation names to /v1/ipfs/* endpoints.
   */
  async routeORBCapability(operation: string, payload: any): Promise<any> {
    const routeMap: Record<string, { method: string; path: string }> = {
      // IPFS Kit
      'ipfs_add': { method: 'POST', path: '/v1/ipfs/add' },
      'ipfs_cat': { method: 'POST', path: '/v1/ipfs/cat' },
      'ipfs_pin': { method: 'POST', path: '/v1/ipfs/pin' },
      'ipfs_unpin': { method: 'POST', path: '/v1/ipfs/unpin' },
      'ipfs_resolve': { method: 'POST', path: '/v1/ipfs/resolve' },
      // IPFS Datasets
      'embed': { method: 'POST', path: '/v1/ipfs/embed' },
      'embed_texts': { method: 'POST', path: '/v1/ipfs/embed' },
      'generate': { method: 'POST', path: '/v1/ipfs/generate' },
      'generate_text': { method: 'POST', path: '/v1/ipfs/generate' },
      'list_datasets': { method: 'POST', path: '/v1/ipfs/list_datasets' },
      // IPFS Accelerate
      'hardware_profile': { method: 'GET', path: '/v1/ipfs/hardware_profile' },
      'list_models': { method: 'GET', path: '/v1/ipfs/list_models' },
      'inference': { method: 'POST', path: '/v1/ipfs/inference' },
      'run_inference': { method: 'POST', path: '/v1/ipfs/inference' },
      'capabilities': { method: 'GET', path: '/v1/ipfs/capabilities' },
      // Unified
      'status': { method: 'GET', path: '/v1/ipfs/status' },
    };

    const route = routeMap[operation];
    if (!route) {
      throw new Error(`Unknown ORB operation: ${operation}`);
    }

    return this.request(route.method, route.path, route.method === 'POST' ? payload : undefined);
  }

  // --- Private ---

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.backendUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };
      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const resp = await fetch(url, options);
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }
      return resp.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Singleton factory for the HandsfreeBackendBridge.
 */
let _instance: HandsfreeBackendBridge | null = null;

export function getHandsfreeBackendBridge(config?: HandsfreeBackendConfig): HandsfreeBackendBridge {
  if (!_instance) {
    _instance = new HandsfreeBackendBridge(config);
  }
  return _instance;
}
