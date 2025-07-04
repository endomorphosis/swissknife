// src/ai/multi-agent/Communication.ts
export class CommunicationHub {
  private messageQueue: PriorityQueue<AgentMessage>;
  private subscriptions: Map<string, MessageHandler[]> = new Map();
  private broadcastChannels: Map<string, BroadcastChannel> = new Map();

  async sendMessage(message: AgentMessage): Promise<void> {
    // Route message based on type and priority
    if (message.type === MessageType.BROADCAST) {
      await this.broadcastMessage(message);
    } else {
      await this.directMessage(message);
    }
  }

  async broadcastMessage(message: AgentMessage): Promise<void> {
    const channel = this.getBroadcastChannel(message.channel);
    await channel.publish(message);
    
    // Log communication for debugging
    this.logCommunication(message);
  }

  subscribeToChannel(agentId: string, channel: string, handler: MessageHandler): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
    this.subscriptions.get(channel)!.push(handler);
  }
}

export interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  channel?: string;
  type: MessageType;
  content: any;
  priority: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export enum MessageType {
  DIRECT = 'direct',
  BROADCAST = 'broadcast',
  TASK_REQUEST = 'task_request',
  TASK_RESPONSE = 'task_response',
  STATUS_UPDATE = 'status_update',
  COLLABORATION_INVITE = 'collaboration_invite',
  RESOURCE_SHARE = 'resource_share'
}