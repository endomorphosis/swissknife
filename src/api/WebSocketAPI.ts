// src/api/WebSocketAPI.ts
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export class WebSocketAPI {
  private wsServer: WebSocketServer;
  private connections: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();

  constructor(server: Server) {
    this.wsServer = new WebSocketServer({ server });
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wsServer.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId();
      this.connections.set(connectionId, ws);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(connectionId, message);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });

      ws.on('close', () => {
        this.cleanup(connectionId);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        connectionId: connectionId,
        timestamp: Date.now()
      }));
    });
  }

  private async handleWebSocketMessage(connectionId: string, message: any): Promise<void> {
    const ws = this.connections.get(connectionId);
    if (!ws) return;

    switch (message.type) {
      case 'subscribe':
        await this.handleSubscription(connectionId, message.channel);
        break;

      case 'agent_chat':
        await this.handleAgentChat(connectionId, message);
        break;

      case 'task_monitor':
        await this.handleTaskMonitoring(connectionId, message.taskId);
        break;

      case 'reasoning_session':
        await this.handleReasoningSession(connectionId, message);
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: `Unknown message type: ${message.type}`
        }));
    }
  }

  async broadcastToChannel(channel: string, data: any): Promise<void> {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;

    const message = JSON.stringify({
      type: 'broadcast',
      channel: channel,
      data: data,
      timestamp: Date.now()
    });

    for (const connectionId of subscribers) {
      const ws = this.connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}