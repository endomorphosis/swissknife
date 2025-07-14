/**
 * Unit tests for Phase 3 components - TaskNet Enhancement
 */

import { FibonacciHeapScheduler } from '../../../src/tasks/scheduler/fibonacci-heap-scheduler';
import { ThoughtGraph, ThoughtNode } from '@ai/thinking/graph'; // Import ThoughtGraph and ThoughtNode
import { MerkleClock } from '@src/tasks/coordination/merkle_clock';
import { ThoughtNodeType } from '@src/types/task'; // Import ThoughtNodeType

jest.mock('@src/tasks/coordination/merkle_clock', () => ({
  MerkleClock: jest.fn(() => ({
    getNodeId: jest.fn(() => 'mock-node-id'),
    getTime: jest.fn(() => 0),
    tick: jest.fn(),
    merge: jest.fn(),
    getHash: jest.fn(() => 'mock-hash'),
  })),
}));

describe('Phase 3: TaskNet Enhancement Components', () => {
  describe('Fibonacci Heap Scheduler', () => {
    let scheduler: FibonacciHeapScheduler;
    let mockStorage: any;
    let mockDag: any;

    beforeEach(() => {
      jest.clearAllMocks();
      // Mock the dependencies required by the constructor
      mockStorage = {
        // Mock necessary storage methods if used by the scheduler
      };
      mockDag = {
        getNode: jest.fn(),
        // Mock other DAG methods if used by the scheduler
      };
      scheduler = new FibonacciHeapScheduler({ storage: mockStorage, dag: mockDag });
      merkleClock = new (MerkleClock as any)('node-1'); // Cast to any
    });

    it('should add tasks and retrieve them in priority order', async () => {
      // Arrange
      const task1 = { id: 'task1', priority: 10, dependencies: [] };
      const task2 = { id: 'task2', priority: 5, dependencies: [] };
      const task3 = { id: 'task3', priority: 20, dependencies: [] };

      // Mock DAG to indicate no dependencies are pending for these tasks
      mockDag.getNode.mockImplementation((id: string) => {
        if (id === 'task1') return { ...task1, status: 'COMPLETED' }; // Dependencies met
        if (id === 'task2') return { ...task2, status: 'COMPLETED' }; // Dependencies met
        if (id === 'task3') return { ...task3, status: 'COMPLETED' }; // Dependencies met
        return undefined;
      });


      // Act
      scheduler.addTask(task1 as any); // Cast to any to bypass type errors for now
      scheduler.addTask(task2 as any);
      scheduler.addTask(task3 as any);

      // Assert
      expect(scheduler.hasNext()).toBe(true);

      const nextTask1 = await scheduler.getNextTask();
      expect(nextTask1?.id).toBe('task2'); // Highest priority (lowest value)

      const nextTask2 = await scheduler.getNextTask();
      expect(nextTask2?.id).toBe('task1');

      const nextTask3 = await scheduler.getNextTask();
      expect(nextTask3?.id).toBe('task3');

      expect(scheduler.hasNext()).toBe(false);
    });

    it('should update task priority', async () => {
      // Arrange
      const task1 = { id: 'task1', priority: 10, dependencies: [] };
      const task2 = { id: 'task2', priority: 20, dependencies: [] };

        mockDag.getNode.mockImplementation((id: string) => {
            if (id === 'task1') return { ...task1, status: 'COMPLETED' };
            if (id === 'task2') return { ...task2, status: 'COMPLETED' };
            return undefined;
        });

      scheduler.addTask(task1 as any);
      scheduler.addTask(task2 as any);

      // Act
      scheduler.updatePriority('task2', 5); // Decrease priority of task2

      // Assert
      const nextTask = await scheduler.getNextTask();
      expect(nextTask?.id).toBe('task2'); // task2 should now be highest priority
    });

    it('should handle tasks with unmet dependencies', () => {
        // Arrange
        const taskWithDep = { id: 'task4', priority: 10, dependencies: ['task5'] };
        const taskDep = { id: 'task5', priority: 5, dependencies: [], status: 'PENDING' }; // Dependency is pending

        mockDag.getNode.mockImplementation((id: string) => {
            if (id === 'task4') return { ...taskWithDep, status: 'PENDING' };
            if (id === 'task5') return { ...taskDep, status: 'PENDING' };
            return undefined;
        });

        // Act
        scheduler.addTask(taskWithDep as any);

        // Assert
        expect(scheduler.hasNext()).toBe(false); // Task should not be added to heap
        // You might want to check internal pendingNodes set if it were public,
        // but since it's private, we rely on reschedulePending behavior.
    });

    it('should reschedule pending tasks when dependencies are met', async () => {
        // Arrange
        const taskWithDep = { id: 'task4', priority: 10, dependencies: ['task5'] };
        const taskDep = { id: 'task5', priority: 5, dependencies: [], status: 'pending' };

        // Initially, dependency is pending
        mockDag.getNode.mockImplementation((id: string) => {
            if (id === 'task4') return { ...taskWithDep, status: 'pending' };
            if (id === 'task5') return { ...taskDep, status: 'pending' };
            return undefined;
        });

        scheduler.addTask(taskWithDep as any);
        expect(scheduler.hasNext()).toBe(false);

        // Now, simulate dependency being completed
        mockDag.getNode.mockImplementation((id: string) => {
            if (id === 'task4') return { ...taskWithDep, status: 'pending' }; // Still pending in scheduler's view
            if (id === 'task5') return { ...taskDep, status: 'completed' }; // Dependency is completed
            return undefined;
        });

        // Act
        scheduler.reschedulePending();

        // Assert
        expect(scheduler.hasNext()).toBe(true); // Task should now be in the heap
        const nextTask = await scheduler.getNextTask();
        expect(nextTask?.id).toBe('task4');
    });
  });
  
  describe('Thought Graph', () => {
    let graph: ThoughtGraph; // Renamed 'got' to 'graph' for clarity

    beforeEach(() => {
      jest.clearAllMocks();
      graph = new ThoughtGraph();
    });

    it('should add nodes to the graph', () => {
      // Act
      const node1 = graph.addNode('Node 1 data', ThoughtNodeType.QUESTION); // Use correct ThoughtNodeType enum
      const node2 = graph.addNode('Node 2 data', ThoughtNodeType.RESEARCH); // Use correct ThoughtNodeType enum

      // Assert
      expect(graph.getNode(node1.id)).toBeDefined();
      expect(graph.getNode(node2.id)).toBeDefined();
      expect(graph.getAllNodes().length).toBe(2);
    });

    it('should connect nodes with edges (using addChild)', () => {
      // Arrange
      const node1 = graph.addNode('Node 1 data', ThoughtNodeType.QUESTION);
      const node2 = graph.addNode('Node 2 data', ThoughtNodeType.RESEARCH);

      // Act
      const success = graph.addChild(node1.id, node2.id);

      // Assert
      expect(success).toBe(true);
      const updatedNode1 = graph.getNode(node1.id);
      const updatedNode2 = graph.getNode(node2.id);
      expect(updatedNode1?.children).toContain(node2.id);
      expect(updatedNode2?.parents).toContain(node1.id);
    });

    it('should traverse the graph', () => {
      // Arrange
      const startNode = graph.addNode('Start node', ThoughtNodeType.QUESTION);
      const middleNode = graph.addNode('Middle node', ThoughtNodeType.RESEARCH);
      const endNode = graph.addNode('End node', ThoughtNodeType.QUESTION);

      graph.addChild(startNode.id, middleNode.id);
      graph.addChild(middleNode.id, endNode.id);

      const visitedNodes: string[] = [];
      const visitor = (node: ThoughtNode, _depth: number) => { // Explicitly type node as ThoughtNode
        visitedNodes.push(node.id);
      };

      // Act
      graph.traverse(visitor, startNode.id);

      // Assert
      expect(visitedNodes).toEqual([startNode.id, middleNode.id, endNode.id]);
    });

    it('should return null for topological sort if cyclic', () => {
        // Arrange
        const node1 = graph.addNode('Node 1', ThoughtNodeType.QUESTION);
        const node2 = graph.addNode('Node 2', ThoughtNodeType.QUESTION);
        graph.addChild(node1.id, node2.id);
        graph.addChild(node2.id, node1.id); // Create a cycle

        // Act
        const sorted = graph.topologicalSort();

        // Assert
        expect(sorted).toBeNull();
    });

    it('should return a topological sort for an acyclic graph', () => {
        // Arrange
        const nodeA = graph.addNode('Node A', ThoughtNodeType.QUESTION); // No parents
        const nodeB = graph.addNode('Node B', ThoughtNodeType.QUESTION); // Depends on A
        const nodeC = graph.addNode('Node C', ThoughtNodeType.QUESTION); // Depends on A
        const nodeD = graph.addNode('Node D', ThoughtNodeType.QUESTION); // Depends on B and C

        graph.addChild(nodeA.id, nodeB.id);
        graph.addChild(nodeA.id, nodeC.id);
        graph.addChild(nodeB.id, nodeD.id);
        graph.addChild(nodeC.id, nodeD.id);

        // Act
        const sorted = graph.topologicalSort();

        // Assert
        expect(sorted).not.toBeNull();
        // Verify topological order (A must come before B and C, B and C before D)
        const sortedIds = sorted!.map(node => node.id);
        expect(sortedIds.indexOf(nodeA.id)).toBeLessThan(sortedIds.indexOf(nodeB.id));
        expect(sortedIds.indexOf(nodeA.id)).toBeLessThan(sortedIds.indexOf(nodeC.id));
        expect(sortedIds.indexOf(nodeB.id)).toBeLessThan(sortedIds.indexOf(nodeD.id));
        expect(sortedIds.indexOf(nodeC.id)).toBeLessThan(sortedIds.indexOf(nodeD.id));
    });
  });

  describe('Merkle Clock Coordination', () => {
    let merkleClock: any | null = null; // Explicitly type as any | null and initialize to null
    
    beforeEach(() => {
      jest.clearAllMocks();
      merkleClock = new MerkleClock('node-1');
    });
    
    it('should initialize with a node ID', () => {
      // Assert
      expect(merkleClock.getNodeId()).toBe('node-1');
    });
    
    it('should increment logical time', () => {
      // Arrange
      const initialTime = merkleClock.getTime();
      
      // Act
      merkleClock.tick();
      
      // Assert
      expect(merkleClock.getTime()).toBe(initialTime + 1);
    });
    
    it('should merge with another clock', () => {
      // Arrange
      const clock2 = new MerkleClock('node-2');
      
      // Advance clock2 further than the main clock
      clock2.tick();
      clock2.tick();
      clock2.tick();
      
      // Act
      merkleClock.merge(clock2);
      
      // Assert
      expect(merkleClock.getTime()).toBeGreaterThanOrEqual(clock2.getTime());
    });
    
    it('should generate a hash representation', () => {
      // Act
      const hash = merkleClock.getHash();
      
      // Assert
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });
  
  // describe('Task Decomposition & Synthesis', () => {
  //   let decomposer: jest.Mocked<TaskDecomposer>;
  //   let synthesizer: jest.Mocked<TaskSynthesizer>;
    
  //   beforeEach(() => {
  //     jest.clearAllMocks();
  //     decomposer = new TaskDecomposer({} as any) as jest.Mocked<TaskDecomposer>;
  //     synthesizer = new TaskSynthesizer() as jest.Mocked<TaskSynthesizer>;
  //   });
    
  //   it('should decompose a task into subtasks', async () => {
  //     // Arrange
  //     const task = { 
  //       id: 'task-1', 
  //       title: 'Complex Task',
  //       description: 'A complex task that needs decomposition'
  //     };
      
  //     const subtasks = [
  //       { id: 'subtask-1', title: 'Subtask 1' },
  //       { id: 'subtask-2', title: 'Subtask 2' }
  //     ];
      
  //     decomposer.decomposeTask = jest.fn().mockResolvedValue(subtasks);
      
  //     // Act
  //     const result = await decomposer.decomposeTask(task);
      
  //     // Assert
  //     expect(decomposer.decomposeTask).toHaveBeenCalledWith(task);
  //     expect(result).toEqual(subtasks);
  //     expect(result.length).toBe(2);
  //   });
    
  //   it('should synthesize results from subtasks', async () => {
  //     // Arrange
  //     const subtaskResults = [
  //       { id: 'result-1', content: 'Result 1' },
  //       { id: 'result-2', content: 'Result 2' }
  //     ];
      
  //     const synthesizedResult = {
  //       id: 'final-result',
  //       content: 'Combined: Result 1, Result 2'
  //     };
      
  //     synthesizer.synthesizeResults = jest.fn().mockResolvedValue(synthesizedResult);
      
  //     // Act
  //     const result = await synthesizer.synthesizeResults(subtaskResults);
      
  //     // Assert
  //     expect(synthesizer.synthesizeResults).toHaveBeenCalledWith(subtaskResults);
      // expect(result).toEqual(synthesizedResult);
  //   });
  // });
});
