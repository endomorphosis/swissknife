// NOTE: Using relative path with .js extension for NodeNext module resolution compatibility.
import {
  normalizeId,
  calculateHammingDistance,
  determineResponsibility // Assuming this function exists and handles the logic
} from '../../../../src/tasks/coordination/responsibility.js'; // Using relative path + .js
import crypto from 'crypto';

describe('Task Responsibility Calculation', () => {

  // --- normalizeId Tests ---
  describe('normalizeId', () => {
    it('should return a Buffer of fixed length (e.g., 32 bytes for SHA-256)', () => {
      const id1 = 'peerId-123';
      const id2 = 'task-abc-very-long-identifier';
      const normalized1 = normalizeId(id1);
      const normalized2 = normalizeId(id2);

      expect(normalized1).toBeInstanceOf(Buffer);
      expect(normalized2).toBeInstanceOf(Buffer);
      // Assuming SHA-256 hash is used
      expect(normalized1.length).toBe(32);
      expect(normalized2.length).toBe(32);
    });

    it('should produce different hashes for different inputs', () => {
      const id1 = 'peerA';
      const id2 = 'peerB';
      expect(normalizeId(id1)).not.toEqual(normalizeId(id2));
    });

    it('should produce the same hash for the same input', () => {
      const id1 = 'task-xyz';
      expect(normalizeId(id1)).toEqual(normalizeId(id1));
    });

    it('should handle empty string input if required', () => {
        const normalizedEmpty = normalizeId('');
        expect(normalizedEmpty).toBeInstanceOf(Buffer);
        expect(normalizedEmpty.length).toBe(32); // Should still produce a hash
        // Optionally check against known hash of empty string
        expect(normalizedEmpty.toString('hex')).toBe(crypto.createHash('sha256').update('').digest('hex'));
    });
  });

  // --- calculateHammingDistance Tests ---
  describe('calculateHammingDistance', () => {
    it('should return 0 for identical buffers', () => {
      const buf1 = Buffer.from([0b11001100, 0b01010101]);
      const buf2 = Buffer.from([0b11001100, 0b01010101]);
      expect(calculateHammingDistance(buf1, buf2)).toBe(0);
    });

    it('should return the correct Hamming distance for single bytes', () => {
      const buf1 = Buffer.from([0b11001100]); // 11001100
      const buf2 = Buffer.from([0b10101010]); // 10101010
      // XOR = 01100110 -> 4 set bits
      expect(calculateHammingDistance(buf1, buf2)).toBe(4);
    });

     it('should return the correct Hamming distance for multiple bytes', () => {
      const buf3 = Buffer.from([0xFF, 0x00]); // 11111111 00000000
      const buf4 = Buffer.from([0x00, 0xFF]); // 00000000 11111111
      // XOR = 11111111 11111111 -> 16 set bits
      expect(calculateHammingDistance(buf3, buf4)).toBe(16);

      const buf5 = Buffer.from([0b10101010, 0b00001111]);
      const buf6 = Buffer.from([0b01010101, 0b11110000]);
      // XOR =    11111111, 11111111 -> 8 + 8 = 16 bits
      expect(calculateHammingDistance(buf5, buf6)).toBe(16);
    });

    it('should throw error for buffers of different lengths', () => {
      const buf1 = Buffer.from([1, 2, 3]);
      const buf2 = Buffer.from([1, 2]);
      expect(() => calculateHammingDistance(buf1, buf2)).toThrow(/equal length/);
    });
  });

  // --- determineResponsibility Tests ---
  describe('determineResponsibility', () => {
    const targetId = 'task-123';
    const activePeers = ['peerA', 'peerB', 'peerC', 'peerD', 'peerE'];

    // Mock the distance calculation for predictable results in this test suite
    // This mock assumes distance is simply the index difference for simplicity
    const mockCalculateDistance = (peerId: string, target: string): number => {
        const peerIndex = activePeers.indexOf(peerId);
        // Let's pretend targetId is "closest" to peerC (index 2)
        const targetIndex = 2;
        return Math.abs(peerIndex - targetIndex);
    };

    // Mock normalizeId to just return the string for simplicity in mock distance calc
    const mockNormalizeId = (id: string): string => id;

    // Replace actual functions with mocks *within this describe block*
    let originalNormalizeId: typeof normalizeId;
    let originalCalculateHammingDistance: typeof calculateHammingDistance;

    beforeAll(() => {
        // Store original functions
        originalNormalizeId = normalizeId;
        originalCalculateHammingDistance = calculateHammingDistance;
        // Assign mocks (need to handle module mocking if functions aren't standalone)
        // This simple assignment might not work depending on how functions are exported/imported.
        // A more robust way involves jest.mock() at the top level.
        // For now, assuming determineResponsibility accepts these as arguments or can be spied upon.
    });

    afterAll(() => {
        // Restore original functions
        // (Again, depends on mocking strategy)
    });


    it('should identify the single closest peer as responsible', () => {
        const localPeerId = 'peerC'; // Closest peer in mock calc (distance 0)
        const isResponsible = determineResponsibility(
            localPeerId,
            targetId,
            activePeers,
            mockNormalizeId as any, // Cast needed if signature differs
            mockCalculateDistance as any
        );
        expect(isResponsible).toBe(true);
    });

    it('should identify a non-closest peer as not responsible', () => {
        const localPeerId = 'peerA'; // Distance 2 in mock calc
        const isResponsible = determineResponsibility(
            localPeerId,
            targetId,
            activePeers,
            mockNormalizeId as any,
            mockCalculateDistance as any
        );
        expect(isResponsible).toBe(false);
    });

    it('should use lexicographical tie-breaking when distances are equal', () => {
        // Mock distances: peerB=1, peerD=1. targetIndex=2
        const mockDistancesTie = (peerId: string, target: string): number => {
            if (peerId === 'peerB' || peerId === 'peerD') return 1;
            if (peerId === 'peerC') return 0; // Still closest
            return 2;
        };

        // PeerB should win tie-break against PeerD because 'peerB' < 'peerD'
        const isBResponsible = determineResponsibility('peerB', targetId, activePeers, mockNormalizeId as any, mockDistancesTie as any);
        const isDResponsible = determineResponsibility('peerD', targetId, activePeers, mockNormalizeId as any, mockDistancesTie as any);

        // Only the lowest distance wins, so C is responsible here
        expect(isBResponsible).toBe(false);
        expect(isDResponsible).toBe(false);

         // Now test tie between B and D if C wasn't present
         const peersWithoutC = ['peerA', 'peerB', 'peerD', 'peerE'];
         const isBResponsible_NoC = determineResponsibility('peerB', targetId, peersWithoutC, mockNormalizeId as any, mockDistancesTie as any);
         const isDResponsible_NoC = determineResponsibility('peerD', targetId, peersWithoutC, mockNormalizeId as any, mockDistancesTie as any);
         expect(isBResponsible_NoC).toBe(true); // B wins tie-break
         expect(isDResponsible_NoC).toBe(false);
    });

     it('should handle case where local peer is the only active peer', () => {
        const localPeerId = 'peerOnly';
        const isResponsible = determineResponsibility(
            localPeerId,
            targetId,
            [localPeerId], // Only self in active list
            mockNormalizeId as any,
            mockCalculateDistance as any
        );
        expect(isResponsible).toBe(true);
    });

    // Add tests for empty activePeers list? (Should probably not happen or throw error)
  });
});
