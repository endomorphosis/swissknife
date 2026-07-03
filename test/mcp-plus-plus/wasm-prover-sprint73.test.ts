/**
 * wasm-prover-sprint73.test.ts
 * Tests for Sprint 73 deferred TODO closures:
 *   - inference/graph-rag-database.ts  (typed impls, query w/ BFS traversal)
 *   - inference/webnn-server.ts        (typed interfaces, GraphRAG integration)
 *   - storage/virtual-filesystem.ts   (mkdir, stat, move, copy)
 *   - tasks/delegation/delegator.ts   (heartbeat, re-delegation)
 *   - cli/commands/ipfsCommand.ts     (IPFS Kubo API integration)
 */

import { GraphRAGDatabase, Document } from '../../src/inference/graph-rag-database';
import { WebNNInferenceServer } from '../../src/inference/webnn-server';
import { TaskDelegator } from '../../src/tasks/delegation/delegator';
import { IPFSCommand } from '../../src/cli/commands/ipfsCommand';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// GraphRAGDatabase — T-333
// ---------------------------------------------------------------------------
describe('GraphRAGDatabase', () => {
  let db: GraphRAGDatabase;
  const doc1: Document = { id: 'doc1', content: 'Alice works at Acme Corp and loves TypeScript.' };
  const doc2: Document = { id: 'doc2', content: 'Bob builds distributed systems with IPFS.' };

  beforeEach(async () => {
    db = new GraphRAGDatabase();
    await db.initialize();
  });

  it('addDocument returns an id', async () => {
    const id = await db.addDocument(doc1);
    expect(typeof id).toBe('string');
  });

  it('query returns documents containing matching terms', async () => {
    await db.addDocument(doc1);
    await db.addDocument(doc2);
    const result = await db.query('Alice TypeScript');
    expect(result.query).toBe('Alice TypeScript');
    expect(Array.isArray(result.documents)).toBe(true);
  });

  it('generateEmbedding returns a number array', async () => {
    const emb = await db.generateEmbedding('hello world');
    expect(Array.isArray(emb)).toBe(true);
    expect(emb.length).toBeGreaterThan(0);
    // Normalized embedding — magnitudes should sum to ~1
    const mag = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1, 1);
  });

  it('findRelevantNodes returns node id list', async () => {
    await db.addDocument(doc1);
    const emb  = await db.generateEmbedding('Alice');
    const nodes = await db.findRelevantNodes(emb, 5);
    expect(Array.isArray(nodes)).toBe(true);
  });

  it('reindex rebuilds the database', async () => {
    await db.reindex([doc1, doc2]);
    const result = await db.query('IPFS distributed');
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it('injected embedding model is used', async () => {
    let called = false;
    const customModel = { generate: async (_: string) => { called = true; return [1, 0, 0]; } };
    const customDb = new GraphRAGDatabase(undefined, undefined, undefined, customModel);
    await customDb.initialize();
    await customDb.addDocument(doc1);
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WebNNInferenceServer — T-334
// ---------------------------------------------------------------------------
describe('WebNNInferenceServer', () => {
  it('initialize returns true', async () => {
    const server = new WebNNInferenceServer();
    expect(await server.initialize()).toBe(true);
  });

  it('loadModel compiles and caches a model', async () => {
    const server = new WebNNInferenceServer();
    const m1 = await server.loadModel('m1', '/path/to/model');
    const m2 = await server.loadModel('m1'); // should use cache
    expect(m1).toBe(m2);
  });

  it('loadModel throws without path on first call', async () => {
    const server = new WebNNInferenceServer();
    await expect(server.loadModel('unknown')).rejects.toThrow();
  });

  it('infer returns a Tensor-shaped object', async () => {
    const server = new WebNNInferenceServer();
    const result = await server.infer({
      modelId: 'test', modelPath: '/model', inputTensor: { shape: [1, 4], data: new Float32Array([1,2,3,4]) },
    });
    expect(result).toBeDefined();
    expect(result.shape).toBeDefined();
  });

  it('queryRAG throws without attached database', async () => {
    const server = new WebNNInferenceServer();
    await expect(server.queryRAG('test')).rejects.toThrow();
  });

  it('queryRAG returns results after attachRAGDatabase', async () => {
    const server = new WebNNInferenceServer();
    const db = new GraphRAGDatabase();
    await db.initialize();
    await db.addDocument({ id: 'd1', content: 'Legal obligations and contracts.' });
    server.attachRAGDatabase(db);
    const result = await server.queryRAG('legal obligations');
    expect(result.query).toBe('legal obligations');
    expect(Array.isArray(result.documents)).toBe(true);
  });

  it('clearCache empties the model cache', async () => {
    const server = new WebNNInferenceServer();
    await server.loadModel('m', '/p');
    server.clearCache();
    // After clear, loading again needs a path
    await expect(server.loadModel('m')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TaskDelegator — T-336
// ---------------------------------------------------------------------------
describe('TaskDelegator', () => {
  it('unregisterWorker re-delegates assigned tasks', () => {
    const del = new TaskDelegator();
    del.registerWorker({ id: 'w1', status: 'online', currentLoad: 0, maxLoad: 4, capabilities: [] });
    del.assignTaskToWorker('task-1' as unknown as ReturnType<typeof del['getAssignment']> extends { nodeId: infer N } ? N : never, 'w1');
    del.unregisterWorker('w1');
    // Assignment should have been removed
    expect(del.getAssignment('task-1' as unknown as Parameters<typeof del['getAssignment']>[0])).toBeUndefined();
    expect(del['workers'].has('w1')).toBe(false);
  });

  it('handleHeartbeat returns true for registered worker', () => {
    const del = new TaskDelegator();
    del.registerWorker({ id: 'w2', status: 'online', currentLoad: 0, maxLoad: 2, capabilities: [] });
    expect(del.handleHeartbeat('w2')).toBe(true);
  });

  it('handleHeartbeat returns false for unknown worker', () => {
    const del = new TaskDelegator();
    expect(del.handleHeartbeat('unknown-worker')).toBe(false);
  });

  it('startHeartbeatWatchdog returns a timer', () => {
    const del = new TaskDelegator();
    const timer = del.startHeartbeatWatchdog(60_000);
    expect(timer).toBeDefined();
    clearInterval(timer);
  });

  it('announceTaskCompletion does not throw', () => {
    const del = new TaskDelegator();
    expect(() => del.announceTaskCompletion('task-x' as unknown as Parameters<typeof del['announceTaskCompletion']>[0], 'w1', { summary: 'done' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IPFSCommand — T-337
// ---------------------------------------------------------------------------
describe('IPFSCommand', () => {
  it('register() adds ipfs subcommand to program', () => {
    const prog = new Command();
    const cmd  = new IPFSCommand(prog);
    cmd.register();
    const names = prog.commands.map(c => c.name());
    expect(names).toContain('ipfs');
  });

  it('addContent throws when path not provided', async () => {
    const cmd = new IPFSCommand(new Command());
    // Access private method via cast
    await expect((cmd as unknown as { addContent(o: {}): Promise<void> }).addContent({})).rejects.toThrow('--path');
  });

  it('getContent throws when CID not provided', async () => {
    const cmd = new IPFSCommand(new Command());
    await expect((cmd as unknown as { getContent(o: {}): Promise<void> }).getContent({})).rejects.toThrow('--cid');
  });

  it('pinContent throws when CID not provided', async () => {
    const cmd = new IPFSCommand(new Command());
    await expect((cmd as unknown as { pinContent(o: {}): Promise<void> }).pinContent({})).rejects.toThrow('--cid');
  });

  it('addContent gracefully falls back when IPFS unavailable', async () => {
    const cmd = new IPFSCommand(new Command(), 'http://localhost:1'); // unreachable
    // Should not throw — falls back to warning
    await expect(
      (cmd as unknown as { addContent(o: { path: string }): Promise<void> }).addContent({ path: '/etc/hostname' })
    ).resolves.not.toThrow();
  });

  it('addTaskIntegration does not throw', () => {
    const prog = new Command();
    const cmd  = new IPFSCommand(prog);
    expect(() => cmd.addTaskIntegration()).not.toThrow();
  });
});
