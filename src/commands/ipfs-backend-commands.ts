/**
 * IPFS Backend Command Registration
 * 
 * Registers ipfs, datasets, and accelerate commands into the SwissKnife
 * command registry using the LocalCommand interface.
 */

import type { Command as PublicCommand } from '../types/command.js';

const HANDSFREE_BASE = 'http://localhost:8080';

async function fetchJson(path: string): Promise<any> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 8000);
  const resp = await fetch(`${HANDSFREE_BASE}${path}`, { signal: ctrl.signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function postJson(path: string, body: any = {}): Promise<any> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 15000);
  const resp = await fetch(`${HANDSFREE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export const ipfsCommand: PublicCommand = {
  type: 'local',
  name: 'ipfs',
  description: 'Interact with IPFS via the handsfree backend',
  aliases: ['i'],
  options: [
    { name: 'pin', type: 'boolean', description: 'Pin content after adding' },
    { name: 'cid', type: 'string', description: 'CID version (v0 or v1)' },
  ],
  isEnabled: true,
  isHidden: false,
  userFacingName() { return 'ipfs'; },
  async handler(args) {
    const sub = args._?.[0] || 'status';
    const target = args._?.[1] || '';

    switch (sub) {
      case 'status': {
        const data = await fetchJson('/v1/ipfs/status');
        return JSON.stringify(data, null, 2);
      }
      case 'add': {
        const data = await postJson('/v1/ipfs/add', { data: target, pin: args.pin });
        return `Added: ${data.cid || JSON.stringify(data)}`;
      }
      case 'cat': {
        const data = await fetchJson(`/v1/ipfs/cat?cid=${encodeURIComponent(target)}`);
        return typeof data === 'string' ? data : JSON.stringify(data);
      }
      case 'pin': {
        const data = await postJson('/v1/ipfs/pin', { cid: target });
        return `Pinned: ${target}`;
      }
      case 'unpin': {
        const data = await postJson('/v1/ipfs/unpin', { cid: target });
        return `Unpinned: ${target}`;
      }
      case 'pins': {
        const data = await fetchJson(`/v1/ipfs/list_pins?type=${target || 'all'}`);
        return JSON.stringify(data, null, 2);
      }
      case 'resolve': {
        const data = await fetchJson(`/v1/ipfs/resolve?cid=${encodeURIComponent(target)}`);
        return JSON.stringify(data, null, 2);
      }
      case 'stat': {
        const data = await fetchJson(`/v1/ipfs/stat?cid=${encodeURIComponent(target)}`);
        return JSON.stringify(data, null, 2);
      }
      default:
        return `Unknown subcommand: ${sub}. Available: status, add, cat, pin, unpin, pins, resolve, stat`;
    }
  },
};

export const datasetsCommand: PublicCommand = {
  type: 'local',
  name: 'datasets',
  description: 'Work with IPFS Datasets (embeddings, generation, search)',
  aliases: ['ds'],
  options: [
    { name: 'model', type: 'string', description: 'Model name for embeddings/generation' },
  ],
  isEnabled: true,
  isHidden: false,
  userFacingName() { return 'datasets'; },
  async handler(args) {
    const sub = args._?.[0] || 'status';
    const target = args._?.[1] || '';

    switch (sub) {
      case 'status': {
        const data = await fetchJson('/v1/ipfs/status');
        return JSON.stringify(data, null, 2);
      }
      case 'list': {
        const data = await fetchJson('/v1/ipfs/list_datasets');
        return JSON.stringify(data, null, 2);
      }
      case 'embed': {
        const data = await postJson('/v1/ipfs/embed', {
          texts: [target || 'Hello world'],
          model_name: args.model,
        });
        return JSON.stringify(data, null, 2);
      }
      case 'generate': {
        const data = await postJson('/v1/ipfs/generate', {
          prompt: target || 'Hello',
          model_name: args.model,
        });
        return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      }
      default:
        return `Unknown subcommand: ${sub}. Available: status, list, embed, generate`;
    }
  },
};

export const accelerateCommand: PublicCommand = {
  type: 'local',
  name: 'accelerate',
  description: 'IPFS Accelerate hardware profiling and inference',
  aliases: ['acc'],
  options: [
    { name: 'model', type: 'string', description: 'Model name for inference' },
    { name: 'query', type: 'string', description: 'Search query for models' },
  ],
  isEnabled: true,
  isHidden: false,
  userFacingName() { return 'accelerate'; },
  async handler(args) {
    const sub = args._?.[0] || 'status';
    const target = args._?.[1] || '';

    switch (sub) {
      case 'status': {
        const data = await fetchJson('/v1/ipfs/capabilities');
        return JSON.stringify(data, null, 2);
      }
      case 'profile': {
        const data = await fetchJson('/v1/ipfs/hardware_profile');
        return JSON.stringify(data, null, 2);
      }
      case 'models': {
        const data = await fetchJson('/v1/ipfs/list_models');
        return JSON.stringify(data, null, 2);
      }
      case 'search': {
        const q = target || args.query || '';
        const data = await fetchJson(`/v1/ipfs/search_models?query=${encodeURIComponent(q)}`);
        return JSON.stringify(data, null, 2);
      }
      case 'infer': {
        const data = await postJson('/v1/ipfs/inference', {
          model: args.model || target,
          data: args._?.[2] || '',
        });
        return JSON.stringify(data, null, 2);
      }
      case 'metrics': {
        const data = await fetchJson('/v1/ipfs/metrics');
        return JSON.stringify(data, null, 2);
      }
      case 'endpoints': {
        const data = await fetchJson('/v1/ipfs/endpoints');
        return JSON.stringify(data, null, 2);
      }
      default:
        return `Unknown subcommand: ${sub}. Available: status, profile, models, search, infer, metrics, endpoints`;
    }
  },
};

// Exported array for easy bulk registration
export const ipfsBackendCommands: PublicCommand[] = [
  ipfsCommand,
  datasetsCommand,
  accelerateCommand,
];

export default ipfsBackendCommands;
