import {
  LocalORBTransportAdapter,
  MCPCapabilityRouter,
  createDefaultORBAdapters,
  type ORBDescriptorSource,
  type ORBStreamEvent,
} from '../../src/services/mcp-orb-capability-router';
import { ipfsDatasetsUIProfileDescriptor } from '../../src/services/mcp-ipfs-ui-descriptors';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp-ui-profile';

const DATASET_INTERFACE_CID = 'sha256:dataset-fixture';

function localDatasetDescriptor(): MCPUIProfileDescriptor {
  const descriptor = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)) as MCPUIProfileDescriptor;
  descriptor.services = descriptor.services.map(service => ({
    ...service,
    transport: 'local',
    endpoint: 'local://ipfs_datasets_py',
  }));
  return descriptor;
}

function source(): ORBDescriptorSource {
  return {
    cid: DATASET_INTERFACE_CID,
    descriptor: localDatasetDescriptor(),
  };
}

describe('MCP ORB capability router contracts', () => {
  it('registers the standard ORB transport adapter kinds', () => {
    const router = new MCPCapabilityRouter();

    expect(router.listAdapters()).toEqual(['http', 'local', 'mcp-server', 'websocket']);
  });

  it('discovers and binds descriptor operations through the local adapter', async () => {
    const router = new MCPCapabilityRouter();

    const capabilities = await router.discover({
      descriptors: [source()],
      operation: 'browse',
    });
    const binding = await router.bind({ capability: capabilities[0] });

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0].lifecycle.map(record => record.phase)).toEqual(['discover']);
    expect(binding.interface_cid).toBe(DATASET_INTERFACE_CID);
    expect(binding.operation.method).toBe('browse');
    expect(binding.lifecycle.map(record => record.phase)).toEqual(['discover', 'bind']);
  });

  it('denies default-deny descriptor operations when capabilities are missing', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => ({ entries: [] }));
    const router = new MCPCapabilityRouter({ adapters: createDefaultORBAdapters(local) });
    const binding = await router.bind({
      descriptors: [source()],
      operation: 'browse',
    });

    const response = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: { correlation_id: 'corr-denied', capabilities: [] },
    });

    expect(response.denied).toBe(true);
    expect(response.receipt.correlation_id).toBe('corr-denied');
    expect(response.receipt.interface_cid).toBe(DATASET_INTERFACE_CID);
    expect(response.receipt.operation).toBe('browse');
    expect(response.receipt.policy_decision.outcome).toBe('deny');
    expect(response.receipt.policy_decision.reasons).toContain('Missing capability: dataset/read');
  });

  it('invokes local operations and emits descriptor-aware receipts', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', ({ binding, context }) => ({
      output: {
        correlation_id: context.correlation_id,
        path: '/',
        entries: [
          {
            name: 'sample',
            path: '/sample',
            cid: 'bafybeigdyrzt5sample',
            type: 'dataset',
          },
        ],
        provenance: {
          source_interface_cid: binding.interface_cid,
        },
      },
    }));
    const router = new MCPCapabilityRouter({ adapters: createDefaultORBAdapters(local) });
    const binding = await router.bind({
      descriptors: [source()],
      operation: 'browse',
    });

    const response = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: { correlation_id: 'corr-allowed', capabilities: ['dataset/read'] },
    });

    expect(response.denied).toBe(false);
    expect(response.receipt.correlation_id).toBe('corr-allowed');
    expect(response.receipt.interface_cid).toBe(DATASET_INTERFACE_CID);
    expect(response.receipt.descriptor_name).toBe('ipfs-datasets-workbench');
    expect(response.receipt.operation).toBe('browse');
    expect(response.receipt.policy_decision.outcome).toBe('permit');
    expect(response.receipt.output_cid).toMatch(/^sha256:/);
    expect(response.receipt.output_refs).toContain('bafybeigdyrzt5sample');
    expect(response.receipt.provenance_refs).toEqual(
      expect.arrayContaining(['corr-allowed', DATASET_INTERFACE_CID]),
    );
    expect(response.receipt.lifecycle.map(record => record.phase)).toEqual(
      ['discover', 'bind', 'authorize', 'invoke'],
    );
  });

  it('models stream and recover lifecycle phases', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerStreamHandler('sync_status', async function* ({ binding, context }) {
      const event: ORBStreamEvent = {
        correlation_id: context.correlation_id ?? 'corr-stream',
        interface_cid: binding.interface_cid,
        operation: binding.operation.method,
        event: { status: 'running', progress: 0.5 },
        event_cid: 'sha256:event',
        generation_key: 'dataset_sync_generation',
        received_at: '2026-05-21T00:00:00.000Z',
      };
      yield event;
    });
    const router = new MCPCapabilityRouter({ adapters: createDefaultORBAdapters(local) });
    const binding = await router.bind({
      descriptors: [source()],
      operation: 'sync_status',
    });

    const subscription = await router.stream(binding.handle, {
      correlation_id: 'corr-stream',
      capabilities: ['dataset/read', 'dataset/progress'],
    });
    const iterator = subscription.events[Symbol.asyncIterator]();
    const first = await iterator.next();
    const recovery = await router.recover(binding.handle, { correlation_id: 'corr-stream' }, 'reconnect');

    expect(first.value.event).toEqual({ status: 'running', progress: 0.5 });
    expect(subscription.receipt.lifecycle.map(record => record.phase)).toEqual(
      ['discover', 'bind', 'authorize', 'stream'],
    );
    expect(recovery.recovered).toBe(true);
    expect(router.getBinding(binding.handle)?.lifecycle.map(record => record.phase)).toEqual(
      ['discover', 'bind', 'authorize', 'stream', 'recover'],
    );
  });

  it('guards stream generations so old subscriptions cannot emit after recovery', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerStreamHandler('sync_status', async function* ({ binding, context }) {
      yield {
        correlation_id: context.correlation_id ?? 'corr-stream',
        interface_cid: binding.interface_cid,
        operation: binding.operation.method,
        event: { status: 'running', progress: 0.5 },
        received_at: '2026-05-21T00:00:00.000Z',
      };
      yield {
        correlation_id: context.correlation_id ?? 'corr-stream',
        interface_cid: binding.interface_cid,
        operation: binding.operation.method,
        event: { status: 'completed', progress: 1 },
        received_at: '2026-05-21T00:00:01.000Z',
      };
    });
    const router = new MCPCapabilityRouter({ adapters: createDefaultORBAdapters(local) });
    const binding = await router.bind({
      descriptors: [source()],
      operation: 'sync_status',
    });

    const subscription = await router.stream(binding.handle, {
      correlation_id: 'corr-stream',
      capabilities: ['dataset/read', 'dataset/progress'],
    });
    const iterator = subscription.events[Symbol.asyncIterator]();
    const first = await iterator.next();
    await router.recover(binding.handle, { correlation_id: 'corr-stream' }, 'reconnect');
    const second = await iterator.next();

    expect(first.value.binding_handle).toBe(binding.handle);
    expect(first.value.binding_generation).toBe(0);
    expect(first.value.generation_key).toBe('dataset_sync_generation');
    expect(router.getBinding(binding.handle)?.binding_generation).toBe(1);
    expect(second.done).toBe(true);
  });

  it('rejects stale or unknown binding handles before invocation', async () => {
    const router = new MCPCapabilityRouter();

    await expect(router.invoke({
      handle: 'stale-handle',
      input: {},
      context: { capabilities: ['dataset/read'] },
    })).rejects.toThrow(/Unknown ORB binding handle/);
  });

  it('applies operation rate-limit policies before invocation', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => ({ entries: [] }));
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      operation_policies: {
        browse: {
          rate_limit: { max_invocations: 1, window_ms: 60_000 },
        },
      },
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    const first = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: { capabilities: ['dataset/read'] },
    });
    const second = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: { capabilities: ['dataset/read'] },
    });

    expect(first.denied).toBe(false);
    expect(second.denied).toBe(true);
    expect(second.receipt.policy_decision.reasons.join('\n')).toContain('Rate limit exceeded');
  });

  it('retries failed invocations according to operation policy', async () => {
    let attempts = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('pin', () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('transient failure');
      }
      return { job_id: 'job-1', correlation_id: 'corr-retry', cid: 'bafybeigdyrzt5sample' };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      operation_policies: {
        pin: {
          retry: { max_attempts: 2, backoff_ms: 0 },
        },
      },
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'pin' });

    const response = await router.invoke({
      handle: binding.handle,
      input: { cid: 'bafybeigdyrzt5sample' },
      context: { capabilities: ['dataset/pin'], correlation_id: 'corr-retry' },
    });

    expect(response.denied).toBe(false);
    expect(attempts).toBe(2);
  });

  it('opens circuit breakers and returns explicit denial reasons', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerHandler('get', () => {
      throw new Error('backend unavailable');
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      operation_policies: {
        get: {
          circuit_breaker: { failure_threshold: 1, cooldown_ms: 60_000 },
        },
      },
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'get' });

    await expect(router.invoke({
      handle: binding.handle,
      input: { cid: 'bafybeigdyrzt5sample' },
      context: { capabilities: ['dataset/read'] },
    })).rejects.toThrow('backend unavailable');

    const denied = await router.invoke({
      handle: binding.handle,
      input: { cid: 'bafybeigdyrzt5sample' },
      context: { capabilities: ['dataset/read'] },
    });

    expect(denied.denied).toBe(true);
    expect(denied.receipt.policy_decision.reasons.join('\n')).toContain('Circuit breaker open');
  });

  it('requires and caches idempotent operation results by key', async () => {
    let calls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('publish', () => {
      calls += 1;
      return { publication_id: `publication-${calls}`, artifact_cid: 'bafybeigdyrzt5artifact' };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      operation_policies: {
        publish: {
          idempotency: { required: true, key_field: 'request_id' },
        },
      },
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'publish' });

    const denied = await router.invoke({
      handle: binding.handle,
      input: { dataset_id: 'dataset-1', source_cid: 'bafybeigdyrzt5sample', destination: 'ipfs' },
      context: { capabilities: ['dataset/publish'] },
    });
    const first = await router.invoke({
      handle: binding.handle,
      input: { request_id: 'publish-1', dataset_id: 'dataset-1', source_cid: 'bafybeigdyrzt5sample', destination: 'ipfs' },
      context: { capabilities: ['dataset/publish'] },
    });
    const second = await router.invoke({
      handle: binding.handle,
      input: { request_id: 'publish-1', dataset_id: 'dataset-1', source_cid: 'bafybeigdyrzt5sample', destination: 'ipfs' },
      context: { capabilities: ['dataset/publish'] },
    });

    expect(denied.denied).toBe(true);
    expect(first.output).toEqual(second.output);
    expect(calls).toBe(1);
  });
});
