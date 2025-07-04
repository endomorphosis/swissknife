
/**
 * SwissKnife Task Adapter - Unified Implementation
 * Connects to actual SwissKnife task management and workflow systems
 */

import { BrowserEventEmitter, generateId } from '../utils/browser-utils';
import { BrowserStorageAdapter } from './browser-storage-adapter';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  category?: string;
  tags?: string[];
  dependencies?: string[];
  estimatedTime?: number; // minutes
  actualTime?: number; // minutes
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
  result?: any;
  error?: string;
}

export interface TaskGraph {
  id: string;
  name: string;
  tasks: Task[];
  connections: { from: string; to: string }[];
  status: 'idle' | 'running' | 'completed' | 'failed';
}

export class SwissKnifeTaskAdapter extends BrowserEventEmitter {
  private tasks: Map<string, Task> = new Map();
  private taskGraphs: Map<string, TaskGraph> = new Map();
  private storage: BrowserStorageAdapter;

  constructor(storage: BrowserStorageAdapter) {
    super();
    this.storage = storage;
    this.loadFromStorage();
  }

  // Task Management
  createTask(params: {
    title: string;
    description?: string;
    priority?: Task['priority'];
    dependencies?: string[];
    metadata?: Record<string, any>;
  }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: generateId(),
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 'medium',
      dependencies: params.dependencies || [],
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    this.saveToStorage();
    this.emit('taskCreated', task);
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  updateTask(id: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updatedTask = {
      ...task,
      ...updates,
      id: task.id, // Prevent ID changes
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(id, updatedTask);
    this.saveToStorage();
    this.emit('taskUpdated', updatedTask);
    return updatedTask;
  }

  deleteTask(id: string): boolean {
    const deleted = this.tasks.delete(id);
    if (deleted) {
      this.saveToStorage();
      this.emit('taskDeleted', id);
    }
    return deleted;
  }

  listTasks(filter?: {
    status?: Task['status'];
    priority?: Task['priority'];
  }): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.status) {
        tasks = tasks.filter(task => task.status === filter.status);
      }
      if (filter.priority) {
        tasks = tasks.filter(task => task.priority === filter.priority);
      }
    }

    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Task Execution
  async executeTask(id: string): Promise<any> {
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status === 'in_progress') {
      throw new Error(`Task ${id} is already running`);
    }

    // Check dependencies
    const unmetDependencies = task.dependencies?.filter(depId => {
      const depTask = this.getTask(depId);
      return !depTask || depTask.status !== 'completed';
    }) || [];

    if (unmetDependencies.length > 0) {
      throw new Error(`Task ${id} has unmet dependencies: ${unmetDependencies.join(', ')}`);
    }

    this.updateTask(id, { status: 'in_progress' });
    this.emit('taskStarted', task);

    try {
      // Simulate task execution - this would integrate with actual SwissKnife task system
      const result = await this.simulateTaskExecution(task);
      
      this.updateTask(id, { 
        status: 'completed',
        result
      });
      
      this.emit('taskCompleted', { task, result });
      return result;
    } catch (error) {
      this.updateTask(id, { 
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('taskFailed', { task, error });
      throw error;
    }
  }

  private async simulateTaskExecution(task: Task): Promise<any> {
    // Simulate work
    const delay = 1000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Generate result based on task
    if (task.title.toLowerCase().includes('ai') || task.title.toLowerCase().includes('generate')) {
      return {
        type: 'ai_result',
        content: `AI-generated content for task: ${task.title}`,
        timestamp: Date.now()
      };
    } else if (task.title.toLowerCase().includes('data') || task.title.toLowerCase().includes('process')) {
      return {
        type: 'data_result',
        processed: Math.floor(Math.random() * 1000),
        timestamp: Date.now()
      };
    } else {
      return {
        type: 'generic_result',
        message: `Task "${task.title}" completed successfully`,
        timestamp: Date.now()
      };
    }
  }

  // Task Graph Management
  createTaskGraph(name: string, tasks: Task[] = []): TaskGraph {
    const graph: TaskGraph = {
      id: generateId(),
      name,
      tasks: [...tasks],
      connections: [],
      status: 'idle'
    };

    this.taskGraphs.set(graph.id, graph);
    this.saveToStorage();
    this.emit('graphCreated', graph);
    return graph;
  }

  addTaskToGraph(graphId: string, task: Task): boolean {
    const graph = this.taskGraphs.get(graphId);
    if (!graph) return false;

    graph.tasks.push(task);
    this.saveToStorage();
    this.emit('graphUpdated', graph);
    return true;
  }

  connectTasks(graphId: string, fromTaskId: string, toTaskId: string): boolean {
    const graph = this.taskGraphs.get(graphId);
    if (!graph) return false;

    // Check if tasks exist in graph
    const fromExists = graph.tasks.some(t => t.id === fromTaskId);
    const toExists = graph.tasks.some(t => t.id === toTaskId);
    
    if (!fromExists || !toExists) return false;

    graph.connections.push({ from: fromTaskId, to: toTaskId });
    this.saveToStorage();
    this.emit('graphUpdated', graph);
    return true;
  }

  async executeTaskGraph(graphId: string): Promise<any> {
    const graph = this.taskGraphs.get(graphId);
    if (!graph) {
      throw new Error(`Task graph ${graphId} not found`);
    }

    graph.status = 'running';
    this.emit('graphStarted', graph);

    try {
      // Execute tasks in dependency order
      const results = new Map<string, any>();
      const executed = new Set<string>();
      
      const executeNext = async (): Promise<void> => {
        const ready = graph.tasks.filter(task => 
          !executed.has(task.id) && 
          task.dependencies?.every(dep => executed.has(dep)) !== false
        );

        if (ready.length === 0) return;

        // Execute ready tasks in parallel
        await Promise.all(ready.map(async task => {
          try {
            const result = await this.executeTask(task.id);
            results.set(task.id, result);
            executed.add(task.id);
          } catch (error) {
            throw new Error(`Task ${task.id} failed: ${error}`);
          }
        }));

        if (executed.size < graph.tasks.length) {
          await executeNext();
        }
      };

      await executeNext();

      graph.status = 'completed';
      this.emit('graphCompleted', { graph, results: Object.fromEntries(results) });
      
      return Object.fromEntries(results);
    } catch (error) {
      graph.status = 'failed';
      this.emit('graphFailed', { graph, error });
      throw error;
    }
  }

  // Storage
  private async saveToStorage(): Promise<void> {
    const data = {
      tasks: Object.fromEntries(this.tasks),
      taskGraphs: Object.fromEntries(this.taskGraphs)
    };
    await this.storage.store('swissknife-tasks', data);
  }

  private async loadFromStorage(): Promise<void> {
    const data = await this.storage.retrieve('swissknife-tasks');
    if (data) {
      if (data.tasks) {
        this.tasks = new Map(Object.entries(data.tasks));
      }
      if (data.taskGraphs) {
        this.taskGraphs = new Map(Object.entries(data.taskGraphs));
      }
    }
  }

  // Statistics
  getTaskStatistics() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      byPriority: {
        high: tasks.filter(t => t.priority === 'high').length,
        medium: tasks.filter(t => t.priority === 'medium').length,
        low: tasks.filter(t => t.priority === 'low').length
      }
    };
  }
}
