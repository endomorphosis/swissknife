/**
 * Simple test for task management utilities
 */

// Mock task types
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt?: Date;
}

class TaskQueue {
  private tasks = new Map<string, Task>();
  private nextId = 1;
  
  createTask(title: string, description?: string, priority: Task['priority'] = 'medium'): Task {
    const task: Task = {
      id: `task-${this.nextId++}`,
      title,
      description,
      status: 'pending',
      priority,
      createdAt: new Date()
    };
    
    this.tasks.set(task.id, task);
    return task;
  }
  
  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }
  
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }
  
  getTasksByStatus(status: Task['status']): Task[] {
    return this.getAllTasks().filter(task => task.status === status);
  }
  
  getTasksByPriority(priority: Task['priority']): Task[] {
    return this.getAllTasks().filter(task => task.priority === priority);
  }
  
  updateTaskStatus(id: string, status: Task['status']): boolean {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      if (status === 'completed' || status === 'failed') {
        task.completedAt = new Date();
      }
      return true;
    }
    return false;
  }
  
  removeTask(id: string): boolean {
    return this.tasks.delete(id);
  }
  
  getPendingTasksSorted(): Task[] {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return this.getTasksByStatus('pending')
      .sort((a, b) => {
        // Sort by priority (high first), then by creation time (oldest first)
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }
}

describe('Task Queue', () => {
  let queue: TaskQueue;
  
  beforeEach(() => {
    queue = new TaskQueue();
  });
  
  describe('task creation', () => {
    test('should create task with title', () => {
      const task = queue.createTask('Test Task');
      
      expect(task).toBeDefined();
      expect(task.id).toMatch(/^task-\d+$/);
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('medium');
      expect(task.createdAt).toBeInstanceOf(Date);
    });
    
    test('should create task with description and priority', () => {
      const task = queue.createTask('High Priority Task', 'Important work', 'high');
      
      expect(task.description).toBe('Important work');
      expect(task.priority).toBe('high');
    });
    
    test('should generate unique IDs', () => {
      const task1 = queue.createTask('Task 1');
      const task2 = queue.createTask('Task 2');
      
      expect(task1.id).not.toBe(task2.id);
    });
  });
  
  describe('task retrieval', () => {
    test('should retrieve task by ID', () => {
      const created = queue.createTask('Test Task');
      const retrieved = queue.getTask(created.id);
      
      expect(retrieved).toBe(created);
    });
    
    test('should return undefined for non-existent task', () => {
      const task = queue.getTask('non-existent');
      
      expect(task).toBeUndefined();
    });
    
    test('should get all tasks', () => {
      queue.createTask('Task 1');
      queue.createTask('Task 2');
      
      const allTasks = queue.getAllTasks();
      
      expect(allTasks).toHaveLength(2);
    });
  });
  
  describe('task filtering', () => {
    beforeEach(() => {
      const task1 = queue.createTask('Task 1', undefined, 'high');
      queue.createTask('Task 2', undefined, 'low');
      queue.createTask('Task 3', undefined, 'high');
      
      queue.updateTaskStatus(task1.id, 'completed');
    });
    
    test('should filter tasks by status', () => {
      const pendingTasks = queue.getTasksByStatus('pending');
      const completedTasks = queue.getTasksByStatus('completed');
      
      expect(pendingTasks).toHaveLength(2);
      expect(completedTasks).toHaveLength(1);
    });
    
    test('should filter tasks by priority', () => {
      const highPriorityTasks = queue.getTasksByPriority('high');
      const lowPriorityTasks = queue.getTasksByPriority('low');
      
      expect(highPriorityTasks).toHaveLength(2);
      expect(lowPriorityTasks).toHaveLength(1);
    });
  });
  
  describe('task status updates', () => {
    test('should update task status', () => {
      const task = queue.createTask('Test Task');
      const success = queue.updateTaskStatus(task.id, 'running');
      
      expect(success).toBe(true);
      expect(task.status).toBe('running');
    });
    
    test('should set completion time for completed tasks', () => {
      const task = queue.createTask('Test Task');
      queue.updateTaskStatus(task.id, 'completed');
      
      expect(task.completedAt).toBeInstanceOf(Date);
    });
    
    test('should set completion time for failed tasks', () => {
      const task = queue.createTask('Test Task');
      queue.updateTaskStatus(task.id, 'failed');
      
      expect(task.completedAt).toBeInstanceOf(Date);
    });
    
    test('should fail to update non-existent task', () => {
      const success = queue.updateTaskStatus('non-existent', 'completed');
      
      expect(success).toBe(false);
    });
  });
  
  describe('task sorting', () => {
    test('should sort pending tasks by priority and creation time', () => {
      // Create tasks with different priorities at different times
      const lowTask = queue.createTask('Low Priority', undefined, 'low');
      const highTask1 = queue.createTask('High Priority 1', undefined, 'high');
      const mediumTask = queue.createTask('Medium Priority', undefined, 'medium');
      const highTask2 = queue.createTask('High Priority 2', undefined, 'high');
      
      const sortedTasks = queue.getPendingTasksSorted();
      
      expect(sortedTasks).toHaveLength(4);
      expect(sortedTasks[0]).toBe(highTask1); // First high priority task
      expect(sortedTasks[1]).toBe(highTask2); // Second high priority task
      expect(sortedTasks[2]).toBe(mediumTask); // Medium priority task
      expect(sortedTasks[3]).toBe(lowTask);    // Low priority task
    });
  });
  
  describe('task removal', () => {
    test('should remove existing task', () => {
      const task = queue.createTask('Test Task');
      const success = queue.removeTask(task.id);
      
      expect(success).toBe(true);
      expect(queue.getTask(task.id)).toBeUndefined();
    });
    
    test('should fail to remove non-existent task', () => {
      const success = queue.removeTask('non-existent');
      
      expect(success).toBe(false);
    });
  });
});
