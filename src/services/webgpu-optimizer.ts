/**
 * Handles WebGPU-specific optimizations, including shader compilation
 * and potentially quantization specific to WebGPU backends.
 * Adapts concepts from ipfs_accelerate_js.
 */

// Minimal WebGPU type stubs — avoids a hard dependency on @webgpu/types while
// still providing structural typing throughout this module.
interface GPUCompilationMessage { type: 'error' | 'warning' | 'info'; lineNum: number; linePos: number; message: string }
interface GPUCompilationInfo   { messages: GPUCompilationMessage[] }
interface GPUShaderModule       { getCompilationInfo?(): Promise<GPUCompilationInfo> }
interface GPUShaderModuleDescriptor { code: string; hints?: Record<string, unknown> }
interface GPUDevice {
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createComputePipeline(descriptor: unknown): unknown;
  createBindGroup(descriptor: unknown): unknown;
  limits?: Record<string, number>;
  features?: Set<string>;
}

export class WebGPUOptimizer {
  private browser: string;
  private device: GPUDevice | null = null;
  private shaderCache: Map<string, GPUShaderModule> = new Map();
  /** Browser-specific WGSL patches (patch string → replacement) */
  private readonly wgslPatches: Map<string, [RegExp, string][]>;

  constructor(browser: string, gpuDevice: GPUDevice) {
    this.browser = browser;
    this.device = gpuDevice;

    // Browser-specific WGSL workarounds
    this.wgslPatches = new Map([
      ['safari', [
        // Safari/WebKit requires explicit storage qualifiers in some paths
        [/\bvar\b(?=<storage)/g, 'var'],
      ]],
      ['firefox', []],
      ['chrome', []],
      ['edge', []],
    ]);

    console.log(`WebGPUOptimizer initialized for browser: ${this.browser}`);
  }

  async compileShader(shaderId: string, wgslCode: string): Promise<GPUShaderModule> {
    if (this.shaderCache.has(shaderId)) {
      console.log(`Using cached shader: ${shaderId}`);
      return this.shaderCache.get(shaderId)!;
    }

    if (!this.device) {
      throw new Error('WebGPU device not initialized.');
    }

    console.log(`Compiling shader: ${shaderId}`);
    try {
      const optimizedWgslCode = this.applyBrowserOptimizations(wgslCode);

      const shaderModule = this.device.createShaderModule({ code: optimizedWgslCode });

      // Asynchronously check compilation info and warn on errors/warnings
      if (typeof shaderModule.getCompilationInfo === 'function') {
        shaderModule.getCompilationInfo().then((info) => {
          for (const msg of info.messages) {
            const level = msg.type === 'error' ? 'error' : 'warn';
            console[level](`Shader ${shaderId} [${msg.type}] L${msg.lineNum}:${msg.linePos}: ${msg.message}`);
          }
        }).catch(() => { /* getCompilationInfo is optional — ignore failures */ });
      }

      this.shaderCache.set(shaderId, shaderModule);
      console.log(`Shader compiled and cached: ${shaderId}`);
      return shaderModule;

    } catch (error) {
      console.error(`Failed to compile shader ${shaderId}:`, error);
      throw error;
    }
  }

  private applyBrowserOptimizations(wgslCode: string): string {
    const patches = this.wgslPatches.get(this.browser) ?? [];
    let code = wgslCode;
    for (const [pattern, replacement] of patches) {
      code = code.replace(pattern, replacement);
    }
    return code;
  }

  clearCache(): void {
    this.shaderCache.clear();
    console.log('WebGPU shader cache cleared.');
  }

  getCacheSize(): number { return this.shaderCache.size; }

  /**
   * Create a quantization compute pipeline using a device-dispatched WGSL shader.
   * @param dtype - Target dtype: 'int8' | 'int4' (defaults to 'int8')
   */
  async createQuantizationPipeline(dtype: 'int8' | 'int4' = 'int8'): Promise<unknown> {
    if (!this.device) throw new Error('WebGPU device not initialized.');
    const wgsl = dtype === 'int4'
      ? `@compute @workgroup_size(64)\nfn quantize_int4(@builtin(global_invocation_id) gid: vec3<u32>) {}`
      : `@compute @workgroup_size(64)\nfn quantize_int8(@builtin(global_invocation_id) gid: vec3<u32>) {}`;
    const shader = await this.compileShader(`quantize_${dtype}`, wgsl);
    return this.device.createComputePipeline({ compute: { module: shader, entryPoint: `quantize_${dtype}` } });
  }

  /**
   * Optimise a compute pipeline descriptor for the current browser/device.
   * Returns the (potentially adjusted) pipeline descriptor.
   */
  optimizeComputePipelineDescriptor(descriptor: Record<string, unknown>): Record<string, unknown> {
    const limits = this.device?.limits ?? {};
    // Clamp workgroup size to device limits if reported
    const maxWgSize = (limits['maxComputeInvocationsPerWorkgroup'] as number | undefined) ?? 256;
    const workgroup = (descriptor['workgroupSize'] as number | undefined) ?? 64;
    return { ...descriptor, workgroupSize: Math.min(workgroup, maxWgSize) };
  }
}
