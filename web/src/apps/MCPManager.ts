// web/src/apps/MCPManager.ts
export class MCPManagerApp {
  private mcpServers: Map<string, MCPServer> = new Map();
  private connectedClients: MCPClient[] = [];

  async startMCPServer(config: MCPServerConfig): Promise<MCPServer> {
    const server = new MCPServer(config);
    await server.start();
    
    this.mcpServers.set(config.name, server);
    return server;
  }

  async connectToMCPServer(endpoint: string): Promise<MCPClient> {
    const client = new MCPClient(endpoint);
    await client.connect();
    
    this.connectedClients.push(client);
    return client;
  }
}