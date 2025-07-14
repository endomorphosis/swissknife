import { BrowserEventEmitter } from '../utils/browser-utils';
import { SwissKnifeCLIAdapter } from '../adapters/cli-adapter';
import { SwissKnifeAIAdapter } from '../adapters/ai-adapter';
import { SwissKnifeTaskAdapter } from '../adapters/task-adapter';
import { SwissKnifeStorageAdapter } from '../adapters/storage-adapter';
import { SwissKnifeConfigAdapter } from '../adapters/config-adapter';
import { StateManager } from './state-manager';

export class IntegrationBridge extends BrowserEventEmitter {
  private cliAdapter: SwissKnifeCLIAdapter;
  private aiAdapter: SwissKnifeAIAdapter;
  private taskAdapter: SwissKnifeTaskAdapter;
  private storageAdapter: SwissKnifeStorageAdapter;
  private configAdapter: SwissKnifeConfigAdapter;
  private stateManager: StateManager;

  constructor() {
    super();
    this.cliAdapter = new SwissKnifeCLIAdapter();
    this.aiAdapter = new SwissKnifeAIAdapter();
    this.taskAdapter = new SwissKnifeTaskAdapter();
    this.storageAdapter = new SwissKnifeStorageAdapter();
    this.configAdapter = new SwissKnifeConfigAdapter();
    this.stateManager = new StateManager();
  }

  async initialize(): Promise<void> {
    console.log('Initializing Integration Bridge...');
    // Initialize all adapters
    await Promise.all([
      this.cliAdapter.initialize(),
      this.aiAdapter.initialize(),
      this.taskAdapter.initialize(),
      this.storageAdapter.initialize(),
      this.configAdapter.initialize()
    ]);
    
    this.setupEventHandling();
    this.setupCrossAdapterCommunication();

    console.log('✅ Integration Bridge initialized');
  }

  private setupEventHandling() {
    console.log('Setting up event handling for Integration Bridge...');
    // CLI events (example - assuming cliAdapter emits 'command:executed')
    // this.cliAdapter.on('command:executed', this.handleCommandExecuted.bind(this));
    
    // Task events
    this.taskAdapter.on('taskCreated', this.handleTaskCreated.bind(this));
    this.taskAdapter.on('taskCompleted', this.handleTaskCompleted.bind(this));
    this.taskAdapter.on('taskFailed', this.handleTaskFailed.bind(this));
    
    // AI events (example - assuming aiAdapter emits 'response:generated')
    // this.aiAdapter.on('response:generated', this.handleAIResponse.bind(this));

    // Config events
    this.configAdapter.on('configChanged', this.handleConfigChanged.bind(this));

    // Storage events
    this.storageAdapter.on('dataStored', this.handleDataStored.bind(this));
    this.storageAdapter.on('dataRetrieved', this.handleDataRetrieved.bind(this));
  }

  private setupCrossAdapterCommunication() {
    console.log('Setting up cross-adapter communication...');
    // Enable adapters to communicate with each other
    // Example: AI adapter might need to create tasks, Task adapter might need AI for certain workflows
    // this.aiAdapter.setTaskAdapter(this.taskAdapter); // Assuming such a method exists
    // this.taskAdapter.setAIAdapter(this.aiAdapter); // Assuming such a method exists
    // this.cliAdapter.setBridge(this); // Assuming CLI adapter needs access to the bridge
  }

  // Event Handlers (example implementations)
  private handleCommandExecuted(event: any) {
    console.log('CLI Command Executed:', event);
    // Update state or notify other components
    this.stateManager.updateState('terminal.lastCommandResult', event);
  }

  private handleTaskCreated(task: any) {
    console.log('Task Created:', task);
    // Update task list in state
    // This would ideally involve fetching the full list or pushing to an array in state
    // For simplicity, let's assume a direct update for now
    this.stateManager.updateState(`tasks.list.${task.id}`, task);
  }

  private handleTaskCompleted(event: any) {
    console.log('Task Completed:', event);
    this.stateManager.updateState(`tasks.list.${event.task.id}.status`, 'completed');
    this.stateManager.updateState(`tasks.list.${event.task.id}.result`, event.result);
  }

  private handleTaskFailed(event: any) {
    console.log('Task Failed:', event);
    this.stateManager.updateState(`tasks.list.${event.task.id}.status`, 'failed');
    this.stateManager.updateState(`tasks.list.${event.task.id}.error`, event.error);
  }

  private handleAIResponse(response: any) {
    console.log('AI Response Generated:', response);
    this.stateManager.updateState('ai.lastResponse', response);
  }

  private handleConfigChanged(event: { key: string; value: any }) {
    console.log('Config Changed:', event);
    this.stateManager.updateState(`config.${event.key}`, event.value);
  }

  private handleDataStored(event: { key: string; data: any }) {
    console.log('Data Stored:', event);
    // Potentially update a view of stored data
  }

  private handleDataRetrieved(event: { key: string; data: any }) {
    console.log('Data Retrieved:', event);
    // Potentially update a view of retrieved data
  }

  // Public methods to access adapters and state manager
  getCLIAdapter(): SwissKnifeCLIAdapter {
    return this.cliAdapter;
  }

  getAIAdapter(): SwissKnifeAIAdapter {
    return this.aiAdapter;
  }

  getTaskAdapter(): SwissKnifeTaskAdapter {
    return this.taskAdapter;
  }

  getStorageAdapter(): SwissKnifeStorageAdapter {
    return this.storageAdapter;
  }

  getConfigAdapter(): SwissKnifeConfigAdapter {
    return this.configAdapter;
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  // Methods for UI to query available features (as per Menu Accuracy Implementation)
  async getAvailableFeatures(): Promise<any[]> {
    // This would aggregate features from all adapters
    const aiModels = await this.aiAdapter.getModels();
    const tasks = await this.taskAdapter.listTasks();
    // ... other features
    return [
      { category: 'ai', name: 'AI Chat', models: aiModels },
      { category: 'tasks', name: 'Task Manager', tasks: tasks },
      // ...
    ];
  }

  async getCLICommands(): Promise<string[]> {
    return this.cliAdapter.getAvailableCommands();
  }

  // Dispose method for cleanup
  async dispose(): Promise<void> {
    console.log('Disposing IntegrationBridge resources...');
    await Promise.all([
      this.cliAdapter.dispose(),
      this.aiAdapter.dispose(),
      this.taskAdapter.dispose(),
      this.storageAdapter.dispose(),
      this.configAdapter.dispose()
    ]);
    // No explicit dispose for StateManager needed unless it manages external resources
  }
}
