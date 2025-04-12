# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and developers when working with code in this repository.

## SwissKnife - CLI Interface for AI Models

SwissKnife is a command-line interface tool that provides access to various AI models including Lilypad, OpenAI, Mistral, and others. It allows users to interact with these models through a unified interface for tasks like code assistance, content generation, and more.

## Quick Start for New Developers

1. **Setup Environment**:
   - Clone the repository
   - Install dependencies: `npm install` or `pnpm install`
   - Run development mode: `npm run dev` or `pnpm run dev`

2. **Configure Models**:
   - Set API keys via environment variables (e.g., `ANURA_API_KEY` for Lilypad)
   - Or use the `/model` command in the app to configure models and save API keys

3. **Documentation**:
   - See `docs/` directory for detailed developer guides
   - Run tests with: `npm test` or `pnpm test`

## Build Commands
- Development: `npm run dev` or `pnpm run dev`
- Production build: `npm run build` or `pnpm run build` 
- Formatting: `npm run format` or `pnpm run format`
- Format check: `npm run format:check` or `pnpm run format:check`
- Testing: `npm test` (runs tests in the `test/` directory)

## Project Structure
- `src/` - Main source code
  - `components/` - React components used in the CLI interface
    - `CustomSelect/` - Custom select component for model selection
    - `ModelSelector.tsx` - Component for model selection and configuration
    - `messages/` - Message display components
    - `permissions/` - Permission request components
  - `constants/` - Configuration constants and model definitions
    - `models.ts` - Model definitions for all providers 
    - `product.ts` - Product configuration and constants
  - `services/` - API service integrations (Claude, OpenAI, etc.)
    - `claude.ts` - Anthropic Claude API client
    - `openai.ts` - OpenAI API client
    - `mcpClient.ts` - MCP client for server communication
  - `utils/` - Utility functions and helpers
    - `config.ts` - Configuration management and API key handling
    - `sessionState.ts` - Session state management
  - `tools/` - Tool implementations for different functionality
    - Various tool implementations for the CLI interface
  - `commands/` - Command implementations
    - `model.tsx` - Model selection command
    - `config.tsx` - Configuration management command
    - `mcp.ts` - MCP server management command
- `docs/` - Developer documentation
  - `GETTING_STARTED.md` - Guide for new developers
  - `CONTRIBUTING.md` - Contribution guidelines
  - `API_KEY_MANAGEMENT.md` - API key management guide
  - `CODE_ARCHITECTURE.md` - Code architecture guide
- `test/` - Test files and utilities
  - `api_key_persistence.test.js` - Tests for API key persistence
  - `model_selector.test.js` - Tests for model selection
- `lilypad-docs/` - Documentation for Lilypad integration

## Key Components for Junior Developers

### API Key Management Flow
1. Keys are stored in both global config and session state
2. `getActiveApiKey()` is the central function for key retrieval with this logic:
   - First checks config file for stored keys
   - Rotates through keys when round-robin is enabled
   - Falls back to environment variables if no keys in config
   - Automatically adds environment variable keys to config
   - Handles failed keys tracked in session state
3. When implementing features that use API keys:
   - Always use `getActiveApiKey()` rather than direct access
   - Use `addApiKey()` to add new keys to configuration
   - Reset session indices when changing providers with `setSessionState()`

### Model Configuration System
1. Models are defined in `src/constants/models.ts` with these key properties:
   - `id`: Unique identifier for the model
   - `name`: Display name for the model
   - `maxTokens`: Maximum tokens the model can handle
   - `pricePerToken`: Cost in USD per token
   - `capabilities`: Features the model supports (e.g., `images`, `streaming`)
2. Providers are defined in the same file with:
   - Base URLs and API endpoints
   - Available models list
   - Authentication methods
3. When adding a new model provider:
   - Add models to the appropriate provider's array
   - Update the provider object with required details
   - Implement API client in `src/services/` directory
   - Add environment variable for API key

### Model Selection Workflow
1. `ModelSelector.tsx` manages the entire selection process:
   - Provider selection → API key input → Model selection → Parameters → Confirmation
2. Each step is managed by a screen navigation stack
3. API key verification happens during the fetch models step
4. The final configuration is saved to global config via `saveGlobalConfig()`

### MCP (Model Context Protocol) Integration
1. **Overview**:
   - MCP is a protocol for server-client communication that extends SwissKnife's capabilities
   - Enables access to external tools and services through a standardized interface
   - Can be used to integrate decentralized storage (IPFS), vector search, GraphRAG, and more

2. **Configuration System**:
   - MCP servers are defined in three possible scopes:
     - `project`: Local to the current project (stored in project config)
     - `global`: Available across all projects (stored in global config)
     - `mcprc`: Defined in the `.mcprc` file in the current directory
   - Configuration includes server type, command, arguments, and environment variables

3. **Server Types**:
   - `stdio`: Subprocess-based servers that communicate via standard IO
   - `sse`: HTTP-based servers that communicate via Server-Sent Events

4. **Core Functions**:
   - `addMcpServer(name, config, scope)`: Adds a new MCP server configuration
   - `removeMcpServer(name, scope)`: Removes an MCP server configuration
   - `listMCPServers()`: Lists all configured MCP servers
   - `getClients()`: Connects to all configured servers and returns clients
   - `getMCPTools()`: Retrieves available tools from all connected MCP servers

5. **Usage in SwissKnife**:
   - Tools from MCP servers are prefixed with `mcp__[server-name]__[tool-name]`
   - The `mcp` command shows the status of all configured MCP servers
   - MCP tools are automatically added to the available tools list

6. **Example Configuration**:
   ```javascript
   // Add an IPFS MCP server
   addMcpServer('ipfs-kit', {
     type: 'stdio',
     command: 'python',
     args: ['-m', 'ipfs_kit_py.mcp.server'],
     env: {
       'IPFS_API_KEY': process.env.IPFS_API_KEY || ''
     }
   }, 'global');
   ```

7. **Implementing a New MCP Integration**:
   - Define server configuration with appropriate command and arguments
   - Add to appropriate scope (global for system-wide, project for project-specific)
   - Use the provided tools through the standard tool interface
   - Add appropriate error handling for server connection issues

## IPFS Kit Integration Plan

SwissKnife can be enhanced with decentralized storage, retrieval, and computation capabilities by integrating with `ipfs_kit_py` using the MCP protocol:

### 1. MCP Server Configuration

Configure the IPFS MCP server using the following pattern:

```typescript
// src/services/ipfsMcpClient.ts
import { addMcpServer } from './mcpClient';

export function configureIPFSMCPServer() {
  addMcpServer('ipfs-kit', {
    type: 'stdio',
    command: 'python',
    args: ['-m', 'ipfs_kit_py.mcp.server'], 
    env: {
      'IPFS_API_KEY': process.env.IPFS_API_KEY || ''
    }
  }, 'global');
}
```

### 2. New Tools Implementation

Create tools that leverage the IPFS MCP server capabilities:

```typescript
// src/tools/IPFSTool/IPFSTool.tsx
import { Tool } from '../../Tool';
import { z } from 'zod';

export const IPFSTool: Tool = {
  name: 'ipfs',
  description: 'Perform IPFS operations',
  
  inputSchema: z.object({
    operation: z.enum(['add', 'cat', 'pin', 'unpin', 'ls']),
    content: z.string().optional(),
    cid: z.string().optional(),
    path: z.string().optional(),
  }),
  
  async *call(args) {
    // Implementation that calls MCP server
  }
};
```

### 3. Additional MCP-Based Capabilities

The following features can be added via MCP integration:

- **Storage Operations**: IPFS, S3, Filecoin, HuggingFace Hub
- **Content Management**: Metadata indexing with ParquetCIDCache
- **Vector Search**: FAISS integration for semantic similarity
- **Knowledge Graphs**: IPLD-based graph database
- **GraphRAG**: Enhanced retrieval augmented generation
- **Model Serving**: Distributed model hosting and inference

### 4. MCP Server Management Commands

Extend the `/mcp` command to support IPFS Kit server management:

```typescript
// src/commands/ipfs.tsx
export const help = 'Manage IPFS operations';
export const description = 'Work with IPFS content and services';
export const name = 'ipfs';
export const type = 'local-jsx';

export async function call(
  onDone: (result?: string) => void,
  { args }: { args?: string[] },
): Promise<React.ReactNode> {
  // Implementation for IPFS command
}
```

## Code Style Guidelines
- **TypeScript**: Use TypeScript throughout the codebase
- **Modules**: ES modules with import/export statements
- **Indentation**: 2 spaces
- **Strings**: Single quotes
- **Semicolons**: Required
- **File names**: PascalCase for components, camelCase for utilities
- **Component naming**: React components use PascalCase
- **Functions/variables**: camelCase for functions, variables, and methods
- **Types/interfaces**: PascalCase for type definitions
- **Hooks**: Custom hooks prefixed with `use`
- **Error handling**: Use try/catch with specific error messages
- **React components**: Functional components with hooks

## Documentation Standards
- Use JSDoc-style comments for functions explaining purpose and parameters
- Document complex logic with inline comments
- Create markdown documentation in the `docs/` directory for detailed guides
- Add tests in the `test/` directory that demonstrate component functionality

## Common Issues and Solutions

### API Key Persistence
When switching models or restarting the application, API keys (particularly for Lilypad) might not be properly retained. This is due to the interaction between persistent configuration and session state.

**Solution:**
1. API keys are stored in:
   - Config file via `getGlobalConfig` and `saveGlobalConfig` functions
   - Session state for temporary values like current key index
   - Environment variables as fallback (e.g., `ANURA_API_KEY` for Lilypad)
   
2. When adding functionality that uses API keys:
   - Check both the config and environment variables
   - Add environment variable values to the config when found
   - Use `addApiKey` to add keys to the appropriate array in config
   - Reset session state indices when changing providers or models

### MCP Server Connection Issues
When MCP servers fail to connect, it's often due to missing dependencies or configuration issues.

**Solution:**
1. Ensure the required packages are installed:
   ```bash
   pip install ipfs_kit_py
   ```
2. Check server configuration matches the installed package:
   ```javascript
   console.log('MCP Servers:', listMCPServers());
   ```
3. For stdio servers, ensure the command and args are correct
4. For SSE servers, verify the URL is accessible
5. Use the MCP error logs for detailed diagnostics:
   ```javascript
   // Found in utils/log.ts
   logMCPError(serverName, errorMessage);
   ```

### Round-Robin API Key Selection
SwissKnife uses a round-robin approach to rotate through available API keys to prevent rate limiting.

**Implementation:**
1. Each model size has a current index tracked in session state
2. When `getActiveApiKey()` is called with `roundRobin=true`:
   - It increments the current index
   - Returns the key at the new index
   - Wraps around to the beginning if it exceeds the array length
3. Failed keys are tracked in session state and skipped during selection

### URL Consistency
For Lilypad API endpoints, always use `https://anura-testnet.lilypad.tech/` in both code and user instructions.

### Model Configuration
Model definitions are in `src/constants/models.ts`. When adding new models:
1. Add model details to the appropriate provider's array
2. Include all standard fields (tokens, pricing, capabilities)
3. Update the provider object if adding a new provider

## Testing Guidelines
1. Use Jest for testing all components and utilities
2. Mock external dependencies like API calls and config functions
3. Test edge cases, especially for API key handling
4. Structure tests with descriptive names in describe/test blocks
5. Include integration tests that verify complete workflows
6. Follow existing patterns in `test/` directory for consistency

## Environment Variables
- `ANURA_API_KEY` - API key for Lilypad
- `OPENAI_API_KEY` - API key for OpenAI
- `MISTRAL_API_KEY` - API key for Mistral
- `SMALL_MODEL_API_KEY` - Anthropic API key for small model
- `LARGE_MODEL_API_KEY` - Anthropic API key for large model
- `IPFS_API_KEY` - API key for IPFS services (when using ipfs_kit_py)
- `HUGGINGFACE_API_KEY` - API key for HuggingFace Hub
- `FILECOIN_API_KEY` - API key for Filecoin services

## Debugging Tips
1. Use `console.log()` for basic debugging (removed in production)
2. For API key issues, check both config and session state:
   ```javascript
   console.log('Config:', getGlobalConfig());
   console.log('Session state:', getSessionState());
   ```
3. For model selection issues, trace the navigation stack:
   ```javascript
   console.log('Current screen:', this.state.currentScreen);
   console.log('Stack:', this.state.screenStack);
   ```
4. For API errors, log the complete error response:
   ```javascript
   try {
     // API call
   } catch (error) {
     console.error('Full error:', error);
   }
   ```
5. For MCP server issues, check the connection status:
   ```javascript
   getClients().then(clients => {
     console.log('MCP Clients:', clients);
   });
   ```

## Contributing
See the `docs/CONTRIBUTING.md` file for detailed contribution guidelines.