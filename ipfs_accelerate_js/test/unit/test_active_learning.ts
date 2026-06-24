import { active_learning } from '../../src/utils/active_learning';

describe('active_learning', () => {
  it('creates an executable active learning helper', async () => {
    const helper = active_learning({ strategy: 'smoke' });

    await expect(helper.execute({ samples: [] })).resolves.toEqual({ success: true });
    expect(typeof helper.dispose).toBe('function');
  });

  it('allows disposal after execution', async () => {
    const helper = active_learning();

    await helper.execute({ sampleId: 'hao-558' });

    expect(() => helper.dispose()).not.toThrow();
  });
});
