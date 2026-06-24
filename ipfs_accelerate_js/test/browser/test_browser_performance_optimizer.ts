import BrowserPerformanceOptimizer, {
  BrowserPerformanceOptimizer as NamedBrowserPerformanceOptimizer,
  createBrowserPerformanceOptimizer,
} from '../../src/browser/resource_pool/browser_performance_optimizer';

describe('BrowserPerformanceOptimizer', () => {
  it('exports the optimizer class as both named and default APIs', () => {
    expect(BrowserPerformanceOptimizer).toBe(NamedBrowserPerformanceOptimizer);
  });

  it('creates optimizer instances through the constructor and factory', () => {
    const constructed = new BrowserPerformanceOptimizer({ browserHistory: {} });
    const created = createBrowserPerformanceOptimizer({ browserHistory: {} });

    expect(constructed).toBeInstanceOf(BrowserPerformanceOptimizer);
    expect(created).toBeInstanceOf(BrowserPerformanceOptimizer);
  });

  it('supports the current async lifecycle contract', async () => {
    const optimizer = createBrowserPerformanceOptimizer();

    await expect(optimizer.initialize()).resolves.toBeUndefined();
    await expect(optimizer.execute({ modelType: 'text_embedding' })).resolves.toEqual({
      success: true,
    });
    expect(() => optimizer.dispose()).not.toThrow();
  });
});
