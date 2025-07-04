import { Command } from 'commander';
import { PerformanceOptimizer } from '../performance/optimizer';
import { TaskManager } from '../tasks/manager';
import { IPFSKitClient } from '../ipfs/client';
import { Agent } from '../ai/agent/agent';
import { Model } from '../ai/models/model';
import { StorageProvider } from '../types/storage';
import { ModelOptions } from '../types/ai';

const performanceCommand = new Command('performance')
  .description('Run performance optimization tasks')
  .action(async () => {
    const modelOptions: ModelOptions = {
      id: 'default-model',
      name: 'Default Model',
      provider: 'local',
      parameters: {},
      metadata: {},
    };
    const model = new Model(modelOptions);

    const agentOptions = { model };
    const agent = new Agent(agentOptions);

    const taskManager = new TaskManager(model);
    const ipfsClient = new IPFSKitClient();

    const optimizer = new PerformanceOptimizer(taskManager, ipfsClient, agent);
    await optimizer.optimize();
  });

export default performanceCommand;
