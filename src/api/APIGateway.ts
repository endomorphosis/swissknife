// src/api/APIGateway.ts
import { Express, Router } from 'express';
import { WebSocketServer } from 'ws';
import { APIVersion, RateLimiter, AuthenticationManager, APIMonitor } from '../types/api';

export class SwissKnifeAPIGateway {
  private expressApp: Express;
  private wsServer: WebSocketServer;
  private apiVersions: Map<string, APIVersion> = new Map();
  private rateLimiter: RateLimiter;
  private authManager: AuthenticationManager;
  private apiMonitor: APIMonitor;

  constructor() {
    this.expressApp = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSockets();
  }

  private setupRoutes(): void {
    // AI Endpoints
    this.expressApp.use('/api/v1/ai', this.createAIRouter());
    this.expressApp.use('/api/v1/agents', this.createAgentsRouter());
    this.expressApp.use('/api/v1/reasoning', this.createReasoningRouter());
    
    // Task Management
    this.expressApp.use('/api/v1/tasks', this.createTasksRouter());
    this.expressApp.use('/api/v1/workflows', this.createWorkflowsRouter());
    
    // Storage & IPFS
    this.expressApp.use('/api/v1/storage', this.createStorageRouter());
    this.expressApp.use('/api/v1/ipfs', this.createIPFSRouter());
    
    // Tools & MCP
    this.expressApp.use('/api/v1/tools', this.createToolsRouter());
    this.expressApp.use('/api/v1/mcp', this.createMCPRouter());
    
    // System & Monitoring
    this.expressApp.use('/api/v1/system', this.createSystemRouter());
    this.expressApp.use('/api/v1/metrics', this.createMetricsRouter());
  }

  private createAIRouter(): Router {
    const router = Router();

    // Chat endpoints
    router.post('/chat', async (req, res) => {
      try {
        const { message, model, temperature, tools } = req.body;
        
        const result = await this.aiService.processMessage(message, {
          model,
          temperature,
          tools
        });

        res.json({
          success: true,
          data: result,
          metadata: {
            model: model,
            timestamp: Date.now(),
            tokens: result.usage
          }
        });
      } catch (error) {
        this.handleAPIError(res, error);
      }
    });

    // Model management
    router.get('/models', async (req, res) => {
      try {
        const models = await this.modelRegistry.getAvailableModels();
        res.json({
          success: true,
          data: models.map(model => ({
            id: model.id,
            name: model.name,
            provider: model.provider,
            capabilities: model.capabilities,
            pricing: model.pricing,
            status: model.status
          }))
        });
      } catch (error) {
        this.handleAPIError(res, error);
      }
    });

    // Batch processing
    router.post('/batch', async (req, res) => {
      try {
        const { requests } = req.body;
        const results = await this.processBatchRequests(requests);
        res.json({
          success: true,
          data: results,
          metadata: {
            processed: requests.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }
        });
      } catch (error) {
        this.handleAPIError(res, error);
      }
    });

    return router;
  }

  private createAgentsRouter(): Router {
    const router = Router();

    // Create agent
    router.post('/', async (req, res) => {
      try {
        const { id, modelId, config } = req.body;
        const agent = await this.agentCoordinator.createAgent(id, modelId, config);
        
        res.status(201).json({
          success: true,
          data: {
            id: agent.id,
            modelId: agent.modelId,
            status: agent.status,
            capabilities: agent.capabilities,
            tools: agent.tools.map(t => t.name)
          }
        });
      } catch (error) {
        this.handleAPIError(res, error);
      }
    });

    // List agents
    router.get('/', async (req, res) => {
      try {
        const agents = await this.agentCoordinator.listAgents();
        res.json({
          success: true,
          data: agents
        });
      } catch (error) {
        this.handleAPIError(res, error);
      }
    });

    // Multi-agent collaboration
    router.post('/collaborate', async (req, res) => {
      try {
        const { agentIds, task, workflow } = req.body;
        const result = await this.agentCoordinator.initiateCollaboration({
          participants: agentIds,
          task,
          workflow
        });
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        this.handleAPIError(res, error);
      }
    });

    return router;
  }
}