// Ensure dependencies are installed: pnpm add merkletreejs && pnpm add -D @types/merkletreejs
// NOTE: Using relative path with .js extension for NodeNext module resolution compatibility.
// If 'Cannot find module' errors persist, check Jest's moduleNameMapper config in jest.config.cjs.
import { MerkleClock } from '../../../../src/tasks/coordination/merkle_clock.js'; // Using relative path + .js
import { MerkleTree } from 'merkletreejs';
import crypto from 'crypto'; // Use Node.js built-in crypto

// Helper function for SHA256 hashing using Node.js crypto
const sha256 = (data: string): Buffer => {
  return crypto.createHash('sha256').update(data).digest();
};

describe('MerkleClock', () => {
  const peerA = 'peerA';
  const peerB = 'peerB';
  const peerC = 'peerC';

  let clockA: MerkleClock;
  let clockB: MerkleClock;

  // Helper to create a predictable Merkle head for testing comparison
  const calculateMockHead = (timestamps: Record<string, number>): string => {
    const leaves = Object.entries(timestamps)
      .sort(([peerIdA], [peerIdB]) => peerIdA.localeCompare(peerIdB))
      // Use Node.js crypto for hashing
      .map(([peerId, time]) => sha256(`${peerId}:${time}`));
    if (leaves.length === 0) {
        // Define a hash for an empty clock, e.g., hash of an empty string or a fixed value
        return sha256('').toString('hex');
    }
    // Pass the hashing function to MerkleTree constructor
    const tree = new MerkleTree(leaves, sha256);
    return tree.getRoot().toString('hex');
  };

  beforeEach(() => {
    // Resetting mocks or spies if they were used
    // jest.restoreAllMocks(); // If using Jest spies

    // Re-initialize clocks for each test
    clockA = new MerkleClock(peerA);
    clockB = new MerkleClock(peerB);

    // Mock the internal head calculation IF NEEDED for deterministic testing
    // This replaces the internal calculation with our predictable helper
    // Ensure the mock is correctly typed and handles the 'this' context
    // jest.spyOn(MerkleClock.prototype as any, '_calculateHead').mockImplementation(function(this: MerkleClock) {
    //   // Access the internal timestamps map (might need casting or making it protected/public for testing)
    //   const currentTimestamps = (this as any).timestamps;
    //   this.head = calculateMockHead(Object.fromEntries(currentTimestamps));
    // });
    // NOTE: Mocking private methods is complex and often discouraged.
    // Prefer testing the public interface and ensuring _calculateHead works correctly
    // via its effect on getHead() after operations like tick() and merge().
    // If direct mocking is removed, the assertions checking specific head values
    // will depend on the actual implementation of _calculateHead and merkletreejs.
  });

  it('should initialize with local peer ID and timestamp 0', () => {
    expect(clockA.getTimestamps()).toEqual({ [peerA]: 0 });
    expect(clockA.getHead()).toBeDefined();
    // Example: Check against expected initial hash if known and stable
    // expect(clockA.getHead()).toBe(calculateMockHead({ [peerA]: 0 }));
  });

  it('should increment local timestamp and update head on tick()', () => {
    const initialHead = clockA.getHead();
    clockA.tick();
    const headAfterTick1 = clockA.getHead();
    expect(clockA.getTimestamps()).toEqual({ [peerA]: 1 });
    expect(headAfterTick1).not.toBe(initialHead);
    // expect(headAfterTick1).toBe(calculateMockHead({ [peerA]: 1 }));

    clockA.tick();
    const headAfterTick2 = clockA.getHead();
    expect(clockA.getTimestamps()).toEqual({ [peerA]: 2 });
    expect(headAfterTick2).not.toBe(headAfterTick1);
    // expect(headAfterTick2).toBe(calculateMockHead({ [peerA]: 2 }));
  });

  it('should merge timestamps correctly, taking max values', () => {
    clockA.tick(); // A: {A:1}
    clockB.tick();
    clockB.tick(); // B: {B:2}

    const clockBData = clockB.getTimestamps();
    const headBeforeMerge = clockA.getHead();
    clockA.merge(clockBData); // A merges B
    const headAfterMerge1 = clockA.getHead();

    expect(clockA.getTimestamps()).toEqual({ [peerA]: 1, [peerB]: 2 });
    expect(headAfterMerge1).not.toBe(headBeforeMerge);
    // expect(headAfterMerge1).toBe(calculateMockHead({ [peerA]: 1, [peerB]: 2 }));

    // Merge again (should be idempotent if no changes)
    clockA.merge(clockBData);
    expect(clockA.getHead()).toBe(headAfterMerge1); // Head should not change

    // Merge with newer data from B
    clockB.tick(); // B: {B:3}
    clockA.merge(clockB.getTimestamps());
    const headAfterMerge2 = clockA.getHead();
    expect(clockA.getTimestamps()).toEqual({ [peerA]: 1, [peerB]: 3 });
    expect(headAfterMerge2).not.toBe(headAfterMerge1);
    // expect(headAfterMerge2).toBe(calculateMockHead({ [peerA]: 1, [peerB]: 3 }));
  });

   it('should merge timestamps from a third peer', () => {
    const clockC = new MerkleClock(peerC);
    clockA.tick(); // A: {A:1}
    clockB.tick(); // B: {B:1}
    clockC.tick();
    clockC.tick(); // C: {C:2}

    clockA.merge(clockB.getTimestamps()); // A: {A:1, B:1}
    clockA.merge(clockC.getTimestamps()); // A: {A:1, B:1, C:2}

    expect(clockA.getTimestamps()).toEqual({ [peerA]: 1, [peerB]: 1, [peerC]: 2 });
    // expect(clockA.getHead()).toBe(calculateMockHead({ [peerA]: 1, [peerB]: 1, [peerC]: 2 }));
  });

  it('should compare clocks correctly (equal)', () => {
    clockA.tick();
    clockB.merge(clockA.getTimestamps());
    clockA.merge(clockB.getTimestamps()); // Make them identical

    // Ensure heads are calculated if not mocked
    clockA.tick(); clockA.merge({}); // Force recalc if needed
    clockB.tick(); clockB.merge({}); // Force recalc if needed

    expect(clockA.compare(clockB.getHead(), clockB.getTimestamps())).toBe('equal');
    expect(clockB.compare(clockA.getHead(), clockA.getTimestamps())).toBe('equal');
  });

  it('should compare clocks correctly (before/after)', () => {
    clockA.tick(); // A: {A:1}
    clockB.merge(clockA.getTimestamps()); // B: {A:1, B:0}
    clockB.tick(); // B: {A:1, B:1}

    // Ensure heads are calculated
    clockA.tick(); clockA.merge({});
    clockB.tick(); clockB.merge({});

    expect(clockA.compare(clockB.getHead(), clockB.getTimestamps())).toBe('before');
    expect(clockB.compare(clockA.getHead(), clockA.getTimestamps())).toBe('after');
  });

  it('should compare clocks correctly (concurrent)', () => {
    clockA.tick(); // A: {A:1}
    clockB.tick(); // B: {B:1}

    // Ensure heads are calculated
    clockA.tick(); clockA.merge({});
    clockB.tick(); clockB.merge({});

    expect(clockA.compare(clockB.getHead(), clockB.getTimestamps())).toBe('concurrent');
    expect(clockB.compare(clockA.getHead(), clockA.getTimestamps())).toBe('concurrent');

    // Make A know about B, but B not know about A's latest tick
    clockA.merge(clockB.getTimestamps()); // A: {A:1, B:1} -> Recalc head
    clockA.tick(); // A: {A:2, B:1} -> Recalc head
    // B is still {B:1}

    expect(clockA.compare(clockB.getHead(), clockB.getTimestamps())).toBe('concurrent');
    expect(clockB.compare(clockA.getHead(), clockA.getTimestamps())).toBe('concurrent');
  });

  it('should serialize and deserialize correctly', () => {
    clockA.tick();
    clockA.merge({ [peerB]: 5, [peerC]: 2 });
    clockA.tick();

    const json = clockA.toJSON();
    // Assuming static fromJSON takes json and localPeerId
    const deserializedClock = MerkleClock.fromJSON(json, peerA);

    expect(deserializedClock).toBeInstanceOf(MerkleClock);
    expect(deserializedClock.getTimestamps()).toEqual(clockA.getTimestamps());
    // Recalculate head on deserialized clock to ensure it matches
    deserializedClock.merge({}); // Force head recalc
    expect(deserializedClock.getHead()).toEqual(clockA.getHead());
    // Check localPeerId if accessible (e.g., via a getter or if made protected for testing)
    // expect((deserializedClock as any).localPeerId).toEqual(peerA);
  });

  // Add tests for edge cases: empty clock, merging empty data, large number of peers etc.
});
