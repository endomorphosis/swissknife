/**
 * MCP Test Utilities
 * 
 * Provides utilities for testing MCP implementations using the memory transport.
 */

import { MemoryChannel, MemoryTransport } from '../memory-transport';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { Server } from '@modelcontextprotocol/sdk/server/index';

/**
 * Creates a paired client and server using memory transport
 * This allows testing without actual network communication
 */
export function createMemoryPair(): {
  channel: MemoryChannel,
  clientTransport: MemoryTransport,
  serverTransport: MemoryTransport
} {
  // Create shared memory channel
  const channel = new MemoryChannel();
  
  // Create client-side transport
  const clientTransport = new MemoryTransport({
    type: 'memory' as any,
    endpoint: 'memory://test',
    channel,
    role: 'client'
  });
  
  // Create server-side transport
  const serverTransport = new MemoryTransport({
    type: 'memory' as any,
    endpoint: 'memory://test',
    channel,
    role: 'server'
  });
  
  return {
    channel,
    clientTransport,
    serverTransport
  };
}

/**
 * Creates a client-server pair using memory transport
 * Connects both sides and returns the initialized instances
 */
export async function createConnectedMemoryPair(): Promise<{
  client: Client,
  server: Server,
  channel: MemoryChannel
}> {
  // Create the transport pair
  const { channel, clientTransport, serverTransport } = createMemoryPair();
  
  // Create client and server instances
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );
  
  const server = new Server(
    { name: 'test-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  
  // Connect both sides
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  
  return { client, server, channel };
}