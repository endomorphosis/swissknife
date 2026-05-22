/**
 * Phase 5 — Event DAG Provenance tests
 */

import { EventDAG, EventNode } from '../../src/services/event-dag';

function makeNode(overrides: Partial<EventNode> = {}): EventNode {
  return {
    intent_cid: 'sha256:intent' + '0'.repeat(57),
    interface_cid: 'sha256:iface' + '0'.repeat(58),
    proofs: [],
    outputs: [],
    parents: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('EventDAG', () => {
  let dag: EventDAG;

  beforeEach(() => {
    dag = new EventDAG();
  });

  describe('appendEvent', () => {
    it('returns a sha256: CID', () => {
      const cid = dag.appendEvent(makeNode());
      expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('same node produces the same CID', () => {
      const node = makeNode({ timestamp: '2025-01-01T00:00:00.000Z' });
      const cid1 = dag.appendEvent(node);
      // Different DAG instance for idempotency check
      const dag2 = new EventDAG();
      const cid2 = dag2.appendEvent(node);
      expect(cid1).toBe(cid2);
    });

    it('different nodes produce different CIDs', () => {
      const cid1 = dag.appendEvent(makeNode({ intent_cid: 'sha256:a' + '0'.repeat(63) }));
      const cid2 = dag.appendEvent(makeNode({ intent_cid: 'sha256:b' + '0'.repeat(63) }));
      expect(cid1).not.toBe(cid2);
    });

    it('increments size', () => {
      expect(dag.size()).toBe(0);
      dag.appendEvent(makeNode());
      expect(dag.size()).toBe(1);
      dag.appendEvent(makeNode({ intent_cid: 'sha256:other' + '0'.repeat(59) }));
      expect(dag.size()).toBe(2);
    });
  });

  describe('traverseDAG', () => {
    it('returns single root node', () => {
      const cid = dag.appendEvent(makeNode({ outputs: ['sha256:out1' + '0'.repeat(58)] }));
      const chain = dag.traverseDAG(cid);
      expect(chain.length).toBe(1);
      expect(chain[0].cid).toBe(cid);
    });

    it('traverses a linear chain', () => {
      const cid1 = dag.appendEvent(makeNode({ outputs: ['sha256:out1' + '0'.repeat(58)] }));
      const cid2 = dag.appendEvent(makeNode({ parents: [cid1], outputs: ['sha256:out2' + '0'.repeat(58)] }));
      const cid3 = dag.appendEvent(makeNode({ parents: [cid2], outputs: ['sha256:out3' + '0'.repeat(58)] }));

      const chain = dag.traverseDAG(cid3);
      const cids = chain.map(n => n.cid);
      expect(cids).toContain(cid1);
      expect(cids).toContain(cid2);
      expect(cids).toContain(cid3);
    });

    it('returns empty for an unknown CID', () => {
      expect(dag.traverseDAG('sha256:unknown' + '0'.repeat(55))).toEqual([]);
    });

    it('handles a diamond DAG without duplicates', () => {
      const root = dag.appendEvent(makeNode());
      const left = dag.appendEvent(makeNode({ parents: [root], intent_cid: 'sha256:left' + '0'.repeat(59) }));
      const right = dag.appendEvent(makeNode({ parents: [root], intent_cid: 'sha256:right' + '0'.repeat(58) }));
      const tip = dag.appendEvent(makeNode({ parents: [left, right], intent_cid: 'sha256:tip' + '0'.repeat(60) }));

      const chain = dag.traverseDAG(tip);
      const cids = chain.map(n => n.cid);
      // root should appear exactly once
      expect(cids.filter(c => c === root).length).toBe(1);
      expect(cids.length).toBe(4);
    });
  });

  describe('getProvenance', () => {
    it('returns causal chain for a known output CID', () => {
      const outputCid = 'sha256:output' + '0'.repeat(57);
      const node1Cid = dag.appendEvent(makeNode({ outputs: [outputCid] }));
      const node2Cid = dag.appendEvent(makeNode({ parents: [node1Cid] }));

      const provenance = dag.getProvenance(outputCid);
      const cids = provenance.map(n => n.cid);
      expect(cids).toContain(node1Cid);
    });

    it('returns empty for an unknown output CID', () => {
      expect(dag.getProvenance('sha256:nobody' + '0'.repeat(56))).toEqual([]);
    });

    it('deduplicated ancestors across multiple paths', () => {
      const outputCid = 'sha256:output2' + '0'.repeat(56);
      const root = dag.appendEvent(makeNode());
      const path1 = dag.appendEvent(makeNode({
        parents: [root],
        outputs: [outputCid],
        intent_cid: 'sha256:path1' + '0'.repeat(59),
      }));
      const path2 = dag.appendEvent(makeNode({
        parents: [root],
        outputs: [outputCid],
        intent_cid: 'sha256:path2' + '0'.repeat(59),
      }));

      const provenance = dag.getProvenance(outputCid);
      const cids = provenance.map(n => n.cid);
      // root should not appear twice even though both paths share it
      expect(cids.filter(c => c === root).length).toBe(1);
      expect(cids).toContain(path1);
      expect(cids).toContain(path2);
    });
  });

  describe('getTips', () => {
    it('returns only the frontier nodes', () => {
      const root = dag.appendEvent(makeNode());
      const child = dag.appendEvent(makeNode({
        parents: [root],
        intent_cid: 'sha256:child' + '0'.repeat(59),
      }));

      const tips = dag.getTips().map(n => n.cid);
      expect(tips).toContain(child);
      expect(tips).not.toContain(root); // root has a descendant
    });
  });
});
