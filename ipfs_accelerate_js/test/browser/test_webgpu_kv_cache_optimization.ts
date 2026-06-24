import WebgpuKvCacheOptimization, {
  createWebgpuKvCacheOptimization,
  WebgpuKvCacheOptimization as NamedWebgpuKvCacheOptimization,
} from '../../src/hardware/webgpu/webgpu_kv_cache_optimization';
import { webgpu_kv_cache_optimization } from '../../src/optimization/techniques/webgpu_kv_cache_optimization';

describe('WebGPU KV cache optimization browser contract', () => {
  it('exports the browser optimization class as both named and default APIs', () => {
    expect(WebgpuKvCacheOptimization).toBe(NamedWebgpuKvCacheOptimization);
  });

  it('creates browser optimization instances through the constructor and factory', () => {
    const constructed = new WebgpuKvCacheOptimization({ maxSequenceLength: 512 });
    const created = createWebgpuKvCacheOptimization({ maxSequenceLength: 512 });

    expect(constructed).toBeInstanceOf(WebgpuKvCacheOptimization);
    expect(created).toBeInstanceOf(WebgpuKvCacheOptimization);
  });

  it('supports the current async browser lifecycle contract', async () => {
    const optimizer = createWebgpuKvCacheOptimization();

    await expect(optimizer.initialize()).resolves.toBeUndefined();
    await expect(
      optimizer.execute({
        keys: new Float32Array([1, 2, 3, 4]),
        values: new Float32Array([5, 6, 7, 8]),
      }),
    ).resolves.toEqual({ success: true });
    expect(() => optimizer.dispose()).not.toThrow();
  });

  it('exposes the optimization technique factory lifecycle contract', async () => {
    const optimization = webgpu_kv_cache_optimization({ quantizationBits: 4 });

    await expect(optimization.execute({ cacheId: 'test-cache' })).resolves.toEqual({
      success: true,
    });
    expect(() => optimization.dispose()).not.toThrow();
  });
});
