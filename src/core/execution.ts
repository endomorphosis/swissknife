/**
 * Core execution logic for running models, potentially using different backends.
 * Adapts concepts from ipfs_accelerate_js.
 */

import type { HardwareBackend } from '../types/hardware.js';
import type { WebGPUOptimizer } from '../services/webgpu-optimizer.js';

/** Minimal model-data contract. Extend per backend as needed. */
export interface ModelData {
  id: string;
  weights?: Float32Array;
  shaderCode?: string;
  config?: Record<string, unknown>;
}

/** Input/output tensor contract. */
export interface TensorData {
  shape: number[];
  data: Float32Array | number[];
}

export class ExecutionEngine {
  private activeBackend: HardwareBackend;
  private webGPUOptimizer: WebGPUOptimizer | null = null;
  private model: ModelData | null = null;

  constructor(backend: HardwareBackend, modelData: ModelData, gpuOptimizer?: WebGPUOptimizer) {
    this.activeBackend = backend;
    this.webGPUOptimizer = gpuOptimizer ?? null;
    console.log(`ExecutionEngine initialized with backend: ${this.activeBackend.name}`);
    this.initializeModel(modelData);
  }

  private initializeModel(modelData: ModelData): void {
    console.log(`Initializing model '${modelData.id}' for backend: ${this.activeBackend.name}`);
    this.model = modelData;

    if (this.activeBackend.id === 'webgpu' && this.webGPUOptimizer && modelData.shaderCode) {
      // Fire-and-forget shader pre-compilation; errors logged inside compileShader
      this.webGPUOptimizer.compileShader(`model_${modelData.id}`, modelData.shaderCode)
        .catch(err => console.warn('Shader pre-compilation failed:', err));
    }
  }

  async execute(inputData: TensorData): Promise<TensorData> {
    if (!this.model) throw new Error('Model not initialized.');
    console.log(`Executing model '${this.model.id}' via backend: ${this.activeBackend.name}`);
    switch (this.activeBackend.id) {
      case 'webgpu':  return this.executeWebGPU(inputData);
      case 'webnn':   return this.executeWebNN(inputData);
      case 'wasm':    return this.executeWASM(inputData);
      case 'cpu':
      default:        return this.executeCPU(inputData);
    }
  }

  private async executeWebGPU(inputData: TensorData): Promise<TensorData> {
    console.log('ExecutionEngine: WebGPU dispatch (stub — no live GPUDevice in Node)');
    // Steps when GPUDevice is available:
    // 1. Write inputData to GPU buffer via device.createBuffer + queue.writeBuffer
    // 2. Create output buffer and bind group
    // 3. Encode + dispatch compute pass via compiled shader pipeline
    // 4. Submit and await device.queue.onSubmittedWorkDone()
    // 5. Map output buffer and read back result
    return { shape: inputData.shape, data: new Float32Array(inputData.data.length) };
  }

  private async executeWebNN(inputData: TensorData): Promise<TensorData> {
    console.log('ExecutionEngine: WebNN dispatch (stub — not available in Node)');
    // Steps: build MLGraph via navigator.ml.createContext(), compile, compute
    return { shape: inputData.shape, data: new Float32Array(inputData.data.length) };
  }

  private async executeWASM(inputData: TensorData): Promise<TensorData> {
    console.log('ExecutionEngine: WASM dispatch (stub — bind WASM module when available)');
    // Steps: pass typed-array pointers to WASM linear memory, call exported fn
    return { shape: inputData.shape, data: new Float32Array(inputData.data.length) };
  }

  private async executeCPU(inputData: TensorData): Promise<TensorData> {
    console.log('ExecutionEngine: CPU (JS) dispatch');
    // Minimal identity pass-through — replace with real inference loop
    const out = inputData.data instanceof Float32Array
      ? new Float32Array(inputData.data)
      : new Float32Array(inputData.data);
    return { shape: inputData.shape, data: out };
  }
}
