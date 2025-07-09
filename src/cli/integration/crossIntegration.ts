import { TaskCommand } from '../commands/taskCommand';
import { IPFSCommand } from '../commands/ipfsCommand';
import { AgentCommand } from '../commands/agentCommand';
import { logger } from '../../utils/logger';

/**
 * Cross-component integration for Phase 4 CLI
 * Enables seamless workflows between Task, IPFS, and Agent systems
 */
export class CrossIntegration {
  private taskCommand: TaskCommand;
  private ipfsCommand: IPFSCommand;
  private agentCommand: AgentCommand;

  constructor(
    taskCommand: TaskCommand,
    ipfsCommand: IPFSCommand,
    agentCommand: AgentCommand
  ) {
    this.taskCommand = taskCommand;
    this.ipfsCommand = ipfsCommand;
    this.agentCommand = agentCommand;
  }

  /**
   * Integrate all components to enable cross-functionality
   */
  integrate(): void {
    logger.info('Integrating CLI components for cross-functionality');

    // Add IPFS integration to task commands
    this.taskCommand.addIPFSIntegration();

    // Add task integration to IPFS commands
    this.ipfsCommand.addTaskIntegration();

    // Add task integration to agent commands
    this.agentCommand.addTaskIntegration();

    // Add IPFS integration to agent commands
    this.agentCommand.addIPFSIntegration();

    logger.info('CLI component integration completed');
  }

  /**
   * Get integrated workflow capabilities
   */
  getWorkflowCapabilities(): string[] {
    return [
      'task-with-ipfs-storage',
      'agent-driven-task-creation',
      'ipfs-content-analysis',
      'automated-task-orchestration'
    ];
  }
}
