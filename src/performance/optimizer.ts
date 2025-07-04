import { performance } from 'perf_hooks';
import { TaskManager } from '../tasks/manager';
import { IPFSKitClient } from '../ipfs/client';
import { Agent } from '../ai/agent/agent';

export class PerformanceOptimizer {
  private taskManager: TaskManager;
  private ipfsClient: IPFSKitClient;
  private agent: Agent;

  constructor(taskManager: TaskManager, ipfsClient: IPFSKitClient, agent: Agent) {
    this.taskManager = taskManager;
    this.ipfsClient = ipfsClient;
    this.agent = agent;
  }

  public async profileTaskManager(): Promise<void> {
    const start = performance.now();
    await this.taskManager.listTasks();
    const end = performance.now();
    console.log(`TaskManager profiling completed in ${end - start}ms`);
  }

  public async profileIPFSClient(): Promise<void> {
    const start = performance.now();
    await this.ipfsClient.getContent('example-cid');
    const end = performance.now();
    console.log(`IPFSClient profiling completed in ${end - start}ms`);
  }

  public async profileAgent(): Promise<void> {
    const start = performance.now();
    await this.agent.processMessage('Test message');
    const end = performance.now();
    console.log(`Agent profiling completed in ${end - start}ms`);
  }

  public async optimize(): Promise<void> {
    console.log('Starting performance optimization...');
    await this.profileTaskManager();
    await this.profileIPFSClient();
    await this.profileAgent();
    console.log('Performance optimization completed.');
  }
}
