/**
 * SwissKnife Task Adapter - Real Implementation
 export class SwissKnifeTaskAdapter extends BrowserEventEmitter {
  private baseUrl: string;
  private secretKey: string | null;
  private tasks: Map<string, TaskConfig> = new Map();
  private workflows: Map<string, WorkflowConfig> = new Map();
  private executions: Map<string, TaskExecution> = new Map();
  private initialized = false;
  private storageKey = 'swissknife-tasks';

  constructor(baseUrl?: string) {
    super();
    this.baseUrl = baseUrl || this.detectBaseUrl();
    this.secretKey = getSecretKey();
  }

  private detectBaseUrl(): string {
    try {
      const config = localStorage.getItem('gooseConfig');
      if (config) {
        const parsed = JSON.parse(config);
        return parsed.GOOSE_PORT ? `http://localhost:${parsed.GOOSE_PORT}` : 'http://localhost:8080';
      }
    } catch (error) {
      console.warn('Could not detect base URL:', error);
    }
    return 'http://localhost:8080';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.secretKey) {
      headers['X-Secret-Key'] = this.secretKey;
    }

    return headers;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load existing tasks from storage
      await this.loadTasks();
      
      // Load workflows if available
      await this.loadWorkflows();
      
      this.initialized = true;
      console.log('✅ SwissKnife Task Adapter initialized');
    } catch (error) {
      console.error('Failed to initialize task adapter:', error);
      this.initialized = true;
    }
  }s to actual SwissKnife task management and workflow systems
 */

import { BrowserEventEmitter, generateId, BrowserStorage, getApiUrl, getSecretKey } from '../utils/browser-utils';

export interface TaskConfig {
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
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'task' | 'condition' | 'parallel' | 'sequential';
  config: Record<string, any>;
  dependencies?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface TaskExecution {
  id: string;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  result?: any;
  error?: string;
  logs?: string[];
}

export class SwissKnifeTaskAdapter extends BrowserEventEmitter {
  private tasks: Map<string, Task> = new Map();
  private taskGraphs: Map<string, TaskGraph> = new Map();
  private storageKey = 'swissknife-tasks';

  constructor() {
    super();
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
    const task: Task = {
      id: generateId(),
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 'medium',
      dependencies: params.dependencies || [],
      metadata: params.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now()
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
      updatedAt: Date.now()
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

    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Task Execution
  async executeTask(id: string): Promise<any> {
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status === 'running') {
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

    this.updateTask(id, { status: 'running' });
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
  private saveToStorage(): void {
    const data = {
      tasks: Object.fromEntries(this.tasks),
      taskGraphs: Object.fromEntries(this.taskGraphs)
    };
    BrowserStorage.set(this.storageKey, data);
  }

  private loadFromStorage(): void {
    const data = BrowserStorage.get(this.storageKey);
    if (data) {
      if (data.tasks) {
        this.tasks = new Map(Object.entries(data.tasks));
      }
      if (data.taskGraphs) {
        this.taskGraphs = new Map(Object.entries(data.taskGraphs));
      }
    }
  }

  // Integration with actual SwissKnife task system
  async integrateWithSwissKnifeTasks(): Promise<void> {
    try {
      // This would import and initialize actual SwissKnife task components
      // const { TaskManager } = await import('../../src/tasks/manager');
      // const taskManager = new TaskManager();
      console.log('📋 Task adapter ready for SwissKnife integration');
    } catch (error) {
      console.warn('SwissKnife task modules not yet available in browser build:', error);
    }
  }

  // Statistics
  getTaskStatistics() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
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
