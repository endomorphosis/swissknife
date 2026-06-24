import FallbackManager, {
  FallbackManager as NamedFallbackManager,
  createFallbackManager,
} from '../../src/utils/fallback_manager';
import { safari_webgpu_handler } from '../../src/utils/safari_webgpu_handler';

describe('Safari WebGPU fallback surface', () => {
  it('exports the fallback manager class as both named and default APIs', () => {
    expect(FallbackManager).toBe(NamedFallbackManager);
  });

  it('creates fallback manager instances through the constructor and factory', () => {
    const constructed = new FallbackManager({
      browserInfo: { name: 'safari', version: '17.0' },
    });
    const created = createFallbackManager({
      browserInfo: { name: 'safari', version: '17.0' },
    });

    expect(constructed).toBeInstanceOf(FallbackManager);
    expect(created).toBeInstanceOf(FallbackManager);
  });

  it('keeps the async fallback manager lifecycle usable for Safari callers', async () => {
    const manager = createFallbackManager({
      browserInfo: { name: 'safari', version: '17.0' },
      modelType: 'text',
    });

    await expect(manager.initialize()).resolves.toBeUndefined();
    await expect(manager.execute({ operationType: 'matmul_4bit' })).resolves.toEqual({
      success: true,
    });
    expect(() => manager.dispose()).not.toThrow();
  });

  it('creates a Safari WebGPU handler with executable fallback hooks', async () => {
    const handler = safari_webgpu_handler({
      browserInfo: { name: 'safari', version: '17.0' },
      enableLayerProcessing: true,
    });

    expect(handler).toEqual({
      execute: expect.any(Function),
      dispose: expect.any(Function),
    });
    await expect(handler.execute({ operationType: 'attention_compute' })).resolves.toEqual({
      success: true,
    });
    expect(() => handler.dispose()).not.toThrow();
  });
});
