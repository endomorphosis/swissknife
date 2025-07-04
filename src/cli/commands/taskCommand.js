/**
 * Task Command for CLI
 * 
 * This module provides commands for managing tasks through the CLI interface.
 */

import { TaskManager } from '../tasks/manager';

export class TaskCommand {
  constructor() {
    this.taskManager = TaskManager.getInstance();
  }

  /**
   * Execute a specific task
   * @param {string} taskId - The ID of the task to execute
   * @param {Object} options - Command options
   * @returns {Promise<Object>} - Task execution result
   */
  async execute(taskId, options = {}) {
    return this.taskManager.executeTask(taskId);
  }

  /**
   * List all tasks
   * @param {Object} options - Command options
   * @returns {Array<Object>} - List of tasks
   */
  list(options = {}) {
    return this.taskManager.getAllTasks();
  }

  /**
   * Get a specific task
   * @param {string} taskId - The ID of the task to get
   * @returns {Object|null} - Task object or null if not found
   */
  get(taskId) {
    return this.taskManager.getTask(taskId);
  }

  /**
   * Register a new task
   * @param {Object} task - Task object to register
   * @returns {TaskCommand} - This instance for chaining
   */
  register(task) {
    this.taskManager.registerTask(task);
    return this;
  }
}

export default TaskCommand;
