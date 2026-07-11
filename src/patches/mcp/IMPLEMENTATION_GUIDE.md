# MCP Server Refactoring Fixes Implementation Guide

This guide explains how to apply the patches created to fix issues that arose after the MCP server refactor. The fixes are organized in patch files in the `src/patches/mcp` directory, with corresponding tests in the `test/unit` directory.

## Overview of Changes

The MCP server components had several issues after the refactor:
1. TypeScript type errors in the MCP entrypoint
2. JSX and type issues in the MCPTool component
3. Import path issues and TypeScript errors in the MCP client
4. Missing types and error handling in the MCP transport service

## Step 1: Apply the Patch Files

Apply the patch files by copying their contents to the corresponding source files:

### 1. Update MCPTool Component

Copy the contents of `src/patches/mcp/fix-mcp-tool.tsx` to `src/tools/MCPTool/MCPTool.tsx`.

### 2. Create MCPTool Prompt File

Create the file `src/tools/MCPTool/prompt.ts` using the contents from `src/patches/mcp/fix-mcp-tool-prompt.ts`.

### 3. Update MCP Entrypoint

Copy the contents of `src/patches/mcp/fix-mcp-entrypoint.ts` to `src/entrypoints/mcp.ts`.

### 4. Update MCP Client

Copy the contents of `src/patches/mcp/fix-mcp-client.ts` to `src/services/mcp/host/mcpClient.ts`.

### 5. Update MCP Transport

Copy the contents of `src/patches/mcp/fix-mcp-transport.ts` to `src/services/mcp/mcp-transport.ts`.

## Step 2: Run Tests

After applying the patches, run the unit tests to ensure the fixes work correctly:

```bash
npm test -- --testPathPattern="test/unit/tools/MCPTool/MCPTool.test.tsx|test/unit/services/mcp/"
```

## Step 3: Verify Integration

Test the MCP server functionality by running:

```bash
# Start the MCP server
node cli.mjs mcp --cwd .

# In another terminal, test connecting to the server
node cli.mjs add-mcp-server test-server --type stdio --command "node" --args "cli.mjs" --args "mcp" --args "--cwd" --args "."

# Try using an MCP tool
node cli.mjs use -t mcp__test-server__bash -p "ls -la"
```

## Important Notes

1. All patch files are contained in the `src/patches/mcp` directory as required.
2. All tests are contained in appropriate test folders:
   - Tool tests in `test/unit/tools/MCPTool/`
   - Service tests in `test/unit/services/mcp/`
3. The patches fix TypeScript errors, JSX issues, and import path problems.
4. Each patch is well-documented and includes explanatory comments.

## Troubleshooting

If you encounter any issues after applying these patches:

1. Check the console for error messages
2. Verify that all import paths use the `.js` extension (even for TypeScript files)
3. Ensure JSX is properly configured in tsconfig.json
4. Verify that Tool interfaces are properly typed