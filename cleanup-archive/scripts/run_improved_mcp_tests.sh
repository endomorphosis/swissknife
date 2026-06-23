#!/bin/bash
# run_improved_mcp_tests.sh - Enhanced MCP server testing script with fallbacks
# This improved script will properly handle module resolution issues, test failures,
# and provides detailed diagnostics.

set -o pipefail

# Define colors for output
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
RESET="\033[0m"

# Create log directory
LOG_DIR="./test-logs"
mkdir -p "$LOG_DIR"

# Timestamp for log files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/mcp_test_$TIMESTAMP.log"

# Log function that outputs to both terminal and log file
log() {
  local level=$1
  local message=$2
  local color="$RESET"
  
  case "$level" in
    "INFO") color="$BLUE" ;;
    "SUCCESS") color="$GREEN" ;;
    "WARNING") color="$YELLOW" ;;
    "ERROR") color="$RED" ;;
    "CRITICAL") color="$RED" ;;
  esac
  
  echo -e "${color}[$level] $message${RESET}" | tee -a "$LOG_FILE"
}

# Header
log "INFO" "========================================================"
log "INFO" "🚀 Enhanced MCP Server Test Suite"
log "INFO" "========================================================"
log "INFO" "Started at: $(date)"
log "INFO" "Log file: $LOG_FILE"

# Step 1: Check environment
log "INFO" "Checking environment..."
NODE_VERSION=$(node --version)
log "INFO" "Node.js version: $NODE_VERSION"

# Check SDK installation
log "INFO" "Checking MCP SDK installation..."
SDK_DIR="node_modules/@modelcontextprotocol/sdk"

if [ ! -d "$SDK_DIR" ]; then
  log "WARNING" "MCP SDK not found, attempting to install..."
  npm install @modelcontextprotocol/sdk --legacy-peer-deps --no-save
  
  if [ $? -ne 0 ]; then
    log "ERROR" "Failed to install MCP SDK"
    npm install @modelcontextprotocol/sdk --legacy-peer-deps --verbose --no-save > "$LOG_DIR/npm-install-$TIMESTAMP.log" 2>&1
    log "INFO" "See install log at: $LOG_DIR/npm-install-$TIMESTAMP.log"
  else
    log "SUCCESS" "MCP SDK installed successfully"
  fi
else
  # Check for SDK package.json
  if [ -f "$SDK_DIR/package.json" ]; then
    SDK_VERSION=$(node -p "require('./$SDK_DIR/package.json').version")
    log "INFO" "Found MCP SDK version $SDK_VERSION"
  else
    log "WARNING" "MCP SDK found but missing package.json"
  fi
fi

# Step 2: Build project
log "INFO" "Building project..."
npm run build > "$LOG_DIR/build-$TIMESTAMP.log" 2>&1

if [ $? -ne 0 ]; then
  log "ERROR" "Build failed"
  tail -n 20 "$LOG_DIR/build-$TIMESTAMP.log" | tee -a "$LOG_FILE"
  log "INFO" "See build log at: $LOG_DIR/build-$TIMESTAMP.log"
else
  log "SUCCESS" "Build completed successfully"
fi

# Step 3: Create test environment
TEST_DIR=$(mktemp -d)
log "INFO" "Created test directory: $TEST_DIR"

# Create test data
echo "Test file content" > "$TEST_DIR/test-file.txt"

# Step 4: Locate server implementations
log "INFO" "Locating MCP server implementations..."

# Find all potential server implementations
declare -a SERVER_PATHS
declare -a SERVER_NAMES

# Check built TypeScript server
TS_SERVER_PATH="dist/src/entrypoints/mcp.js"
if [ -f "$TS_SERVER_PATH" ]; then
  SERVER_PATHS+=("$(pwd)/$TS_SERVER_PATH")
  SERVER_NAMES+=("TypeScript MCP Server")
  log "INFO" "Found TypeScript MCP server at: $TS_SERVER_PATH"
fi

# Check alternative location
ALT_SERVER_PATH="dist/entrypoints/mcp.js"
if [ -f "$ALT_SERVER_PATH" ]; then
  SERVER_PATHS+=("$(pwd)/$ALT_SERVER_PATH")
  SERVER_NAMES+=("Alternate MCP Server")
  log "INFO" "Found alternate MCP server at: $ALT_SERVER_PATH"
fi

# Check for standalone JavaScript implementation
if [ -f "standalone-mcp-server.js" ]; then
  chmod +x standalone-mcp-server.js
  SERVER_PATHS+=("$(pwd)/standalone-mcp-server.js")
  SERVER_NAMES+=("Standalone JavaScript MCP Server")
  log "INFO" "Found standalone MCP server at: standalone-mcp-server.js"
fi

# Check for minimal MCP server implementation
if [ -f "minimal-mcp-server.js" ]; then
  chmod +x minimal-mcp-server.js
  SERVER_PATHS+=("$(pwd)/minimal-mcp-server.js")
  SERVER_NAMES+=("Minimal MCP Server")
  log "INFO" "Found minimal MCP server at: minimal-mcp-server.js"
fi

# Check for Python implementation
PYTHON_SERVER_PATH="$TEST_DIR/python-mcp-server.py"
cat > "$PYTHON_SERVER_PATH" << 'EOF'
#!/usr/bin/env python3
"""
Simple MCP Server Implementation in Python 

This is a minimal implementation of an MCP server that can be used
for testing and as a reference for the JavaScript implementation.
"""

import json
import os
import subprocess
import sys
import traceback

# Define MCP protocol constants
REQUEST_MESSAGE = "request"
RESPONSE_MESSAGE = "response"

# Available tools
TOOLS = [
    {
        "name": "bash",
        "description": "Execute a bash command",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute"
                }
            },
            "required": ["command"]
        }
    },
    {
        "name": "fileRead",
        "description": "Read a file",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read"
                }
            },
            "required": ["path"]
        }
    }
]

class MCPServer:
    def __init__(self, workspace_dir):
        self.workspace_dir = workspace_dir
        if not os.path.exists(workspace_dir):
            os.makedirs(workspace_dir)
        
    def start(self):
        print(f"Python MCP server starting in {self.workspace_dir}", file=sys.stderr)
        
        try:
            while True:
                line = sys.stdin.readline()
                if not line:
                    break
                
                try:
                    message = json.loads(line)
                    self.handle_message(message)
                except json.JSONDecodeError as e:
                    print(f"Error parsing message: {e}", file=sys.stderr)
                except Exception as e:
                    print(f"Fatal error handling message: {e}", file=sys.stderr)
                    print(traceback.format_exc(), file=sys.stderr)
                    raise
        except KeyboardInterrupt:
            pass
        
        print("Python MCP server stopping", file=sys.stderr)
    
    def handle_message(self, message):
        if message.get("type") != REQUEST_MESSAGE:
            return
        
        method = message.get("method")
        id = message.get("id")
        
        if method == "getCapabilities":
            self.send_response(id, {"tools": True})
        elif method == "tools/list":
            self.send_response(id, {"tools": TOOLS})
        elif method == "tools/call":
            self.handle_tool_call(id, message.get("params", {}))
        else:
            self.send_error(id, f"Unknown method: {method}")
    
    def handle_tool_call(self, id, params):
        name = params.get("name")
        args = params.get("arguments", {})
        
        if name == "bash":
            self.execute_bash(id, args.get("command", ""))
        elif name == "fileRead":
            self.read_file(id, args.get("path", ""))
        else:
            self.send_error(id, f"Unknown tool: {name}")
    
    def execute_bash(self, id, command):
        try:
            result = subprocess.run(
                command, shell=True, cwd=self.workspace_dir,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            output = result.stdout
            if result.stderr:
                output += "\n" + result.stderr
            
            self.send_response(id, {
                "content": [{"type": "text", "text": output}]
            })
        except Exception as e:
            self.send_error(id, str(e))
    
    def read_file(self, id, path):
        try:
            full_path = os.path.join(self.workspace_dir, path)
            with open(full_path, "r") as f:
                content = f.read()
            
            self.send_response(id, {
                "content": [{"type": "text", "text": content}]
            })
        except Exception as e:
            self.send_error(id, str(e))
    
    def send_response(self, id, result):
        response = {
            "type": RESPONSE_MESSAGE,
            "id": id,
            "result": result
        }
        print(json.dumps(response), flush=True)
    
    def send_error(self, id, message, code=-32000):
        response = {
            "type": RESPONSE_MESSAGE,
            "id": id,
            "error": {
                "code": code,
                "message": message
            }
        }
        print(json.dumps(response), flush=True)

if __name__ == "__main__":
    workspace_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    MCPServer(workspace_dir).start()
EOF
chmod +x "$PYTHON_SERVER_PATH"

if command -v python3 &> /dev/null; then
  SERVER_PATHS+=("$PYTHON_SERVER_PATH")
  SERVER_NAMES+=("Python MCP Server")
  log "INFO" "Created Python MCP server at: $PYTHON_SERVER_PATH"
else
  log "WARNING" "Python not found, skipping Python server implementation"
fi

# Check if we found any server implementations
if [ ${#SERVER_PATHS[@]} -eq 0 ]; then
  log "ERROR" "No MCP server implementations found"
  exit 1
fi

# Step 5: Create test client
log "INFO" "Creating MCP test client..."
TEST_CLIENT_PATH="$TEST_DIR/mcp-test-client.js"

cat > "$TEST_CLIENT_PATH" << 'EOF'
// Enhanced MCP test client with better error handling and diagnostics
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Find the MCP SDK
let Client, StdioClientTransport;

function findSdk() {
  console.log('Searching for MCP SDK...');
  
  // Try all possible module paths
  const possiblePaths = [
    // CommonJS paths
    {
      client: path.join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js'),
      transport: path.join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js')
    },
    // ESM paths
    {
      client: '@modelcontextprotocol/sdk/client/index.js',
      transport: '@modelcontextprotocol/sdk/client/stdio.js'
    },
    // No extension
    {
      client: '@modelcontextprotocol/sdk/client/index',
      transport: '@modelcontextprotocol/sdk/client/stdio'
    }
  ];
  
  // Try each path
  for (const paths of possiblePaths) {
    try {
      console.log(`Trying to load from: ${paths.client}`);
      const { Client: C } = require(paths.client);
      const { StdioClientTransport: T } = require(paths.transport);
      
      if (C && T) {
        console.log('✅ SDK loaded successfully');
        return { Client: C, StdioClientTransport: T };
      }
    } catch (err) {
      console.log(`❌ Failed to load from ${paths.client}: ${err.message}`);
    }
  }
  
  throw new Error('Failed to load MCP SDK');
}

// Wait for server to be ready
function waitForServerReady(serverProcess, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server startup timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Check if server is already running
    if (!serverProcess || !serverProcess.stderr) {
      clearTimeout(timeout);
      resolve();
      return;
    }
    
    let stderrData = '';
    serverProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.log(`[SERVER]: ${data.toString().trim()}`);
      
      if (stderrData.includes('server started') || 
          stderrData.includes('Server started') || 
          stderrData.includes('start') ||
          stderrData.includes('Starting MCP server')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    
    // Handle early exit
    serverProcess.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code}`));
    });
  });
}

// Test an MCP server
async function testServer(serverPath, workDir, { serverName = 'MCP Server', debug = false } = {}) {
  console.log(`\n==== Testing ${serverName} ====`);
  console.log(`Server: ${serverPath}`);
  console.log(`Working directory: ${workDir}`);
  console.log(`Debug mode: ${debug ? 'enabled' : 'disabled'}`);
  
  // Ensure server file exists
  if (!fs.existsSync(serverPath)) {
    console.error(`Server file not found: ${serverPath}`);
    return { success: false, error: 'Server file not found' };
  }
  
  let serverProcess = null;
  let transport = null;
  let client = null;
  const results = {
    success: false,
    serverPath,
    serverName,
    capabilities: null,
    tools: [],
    tests: {},
    error: null,
    logs: {
      stdout: '',
      stderr: ''
    }
  };
  
  try {
    // Load SDK
    try {
      const sdk = findSdk();
      Client = sdk.Client;
      StdioClientTransport = sdk.StdioClientTransport;
    } catch (err) {
      console.error('Failed to load SDK:', err.message);
      results.error = `SDK loading failed: ${err.message}`;
      return results;
    }
    
    // Create transport
    console.log('Creating transport...');
    transport = new StdioClientTransport({
      command: process.platform === 'win32' && serverPath.endsWith('.py') ? 'python' : 'node',
      args: [serverPath, workDir],
      stderr: 'pipe',
      env: {
        ...process.env,
        DEBUG: debug ? 'mcp:*' : '',
        NODE_PATH: path.join(process.cwd(), 'node_modules')
      }
    });
    
    // Get reference to server process
    serverProcess = transport.process;
    
    // Capture server output
    if (serverProcess) {
      serverProcess.stdout.on('data', (data) => {
        results.logs.stdout += data.toString();
        if (debug) console.log(`[SERVER STDOUT]: ${data.toString().trim()}`);
      });
      
      serverProcess.stderr.on('data', (data) => {
        results.logs.stderr += data.toString();
        if (debug) console.log(`[SERVER STDERR]: ${data.toString().trim()}`);
      });
      
      // Wait for server to be ready
      console.log('Waiting for server to start...');
      await waitForServerReady(serverProcess);
    }
    
    // Create client
    console.log('Creating client...');
    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    
    // Connect to server
    console.log('Connecting to server...');
    await client.connect(transport);
    console.log('Connected to server');
    
    // Get capabilities
    console.log('Getting capabilities...');
    results.capabilities = await client.getServerCapabilities();
    console.log('Capabilities:', JSON.stringify(results.capabilities));
    results.tests.capabilities = { success: true };
    
    // List tools
    console.log('Listing tools...');
    const toolsResult = await client.request({ method: 'tools/list' });
    results.tools = toolsResult.tools.map(t => t.name);
    console.log('Available tools:', results.tools.join(', '));
    results.tests.toolsList = { success: true };
    
    // Test bash tool
    if (results.tools.includes('bash')) {
      console.log('Testing bash tool...');
      const bashResult = await client.callTool({
        name: 'bash',
        arguments: { command: 'ls -la' }
      });
      console.log('Bash result:', JSON.stringify(bashResult));
      results.tests.bashTool = { success: true, output: bashResult };
    }
    
    // Test fileRead tool
    if (results.tools.includes('fileRead')) {
      console.log('Testing fileRead tool...');
      const fileResult = await client.callTool({
        name: 'fileRead',
        arguments: { path: 'test-file.txt' }
      });
      console.log('File read result:', JSON.stringify(fileResult));
      results.tests.fileReadTool = { success: true, output: fileResult };
    }
    
    console.log(`${serverName} tests completed successfully`);
    results.success = true;
  } catch (error) {
    console.error(`Error testing ${serverName}:`, error.message);
    results.success = false;
    results.error = error.message;
    results.tests.error = {
      message: error.message,
      stack: error.stack
    };
  } finally {
    // Disconnect client if connected
    if (client) {
      try {
        if (typeof client.disconnect === 'function') {
          await client.disconnect();
        } else if (typeof client.close === 'function') {
          await client.close();
        }
      } catch (err) {
        console.warn('Error disconnecting client:', err.message);
      }
    }
    
    // Kill server process if still running
    if (serverProcess && !serverProcess.killed) {
      try {
        serverProcess.kill();
      } catch (err) {
        console.warn('Error killing server process:', err.message);
      }
    }
  }
  
  return results;
}

async function main() {
  const serverPath = process.argv[2];
  const workDir = process.argv[3];
  const serverName = process.argv[4] || 'MCP Server';
  const debug = process.argv.includes('--debug');
  
  if (!serverPath || !workDir) {
    console.error('Usage: node mcp-test-client.js <server-path> <work-dir> [server-name] [--debug]');
    process.exit(1);
  }
  
  try {
    const results = await testServer(serverPath, workDir, { serverName, debug });
    console.log('\n==== Test Results Summary ====');
    console.log(`Server: ${results.serverName}`);
    console.log(`Success: ${results.success ? 'Yes' : 'No'}`);
    
    if (!results.success && results.error) {
      console.error(`Error: ${results.error}`);
      process.exit(1);
    }
    
    console.log('Tools:', results.tools.join(', '));
    
    // Successful exit
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
EOF

# Step 6: Test each server implementation
log "INFO" "Testing server implementations..."

# Track if at least one server passes tests
ANY_SERVER_WORKS=false

for i in "${!SERVER_PATHS[@]}"; do
  SERVER_PATH="${SERVER_PATHS[$i]}"
  SERVER_NAME="${SERVER_NAMES[$i]}"
  
  log "INFO" "Testing $SERVER_NAME..."
  OUTPUT_FILE="$TEST_DIR/${SERVER_NAME// /_}-output.log"
  
  # Run the test with debug mode enabled
  node "$TEST_CLIENT_PATH" "$SERVER_PATH" "$TEST_DIR" "$SERVER_NAME" --debug > "$OUTPUT_FILE" 2>&1
  TEST_RESULT=$?
  
  # Check the result
  if [ $TEST_RESULT -eq 0 ]; then
    log "SUCCESS" "$SERVER_NAME tests passed"
    ANY_SERVER_WORKS=true
    # Add summary to log
    grep -A 10 "==== Test Results Summary ====" "$OUTPUT_FILE" | tee -a "$LOG_FILE"
  else
    log "ERROR" "$SERVER_NAME tests failed"
    # Add error output to log
    grep -B 2 -A 10 "Error:" "$OUTPUT_FILE" | tee -a "$LOG_FILE"
  fi
  
  log "INFO" "Complete test output saved to: $OUTPUT_FILE"
done

# Step 7: Run Jest tests if any server works
if [ "$ANY_SERVER_WORKS" = true ]; then
  log "INFO" "Running Jest unit tests for MCP server..."
  npx jest test/unit/mcp-server/mcp-server.test.ts --verbose > "$TEST_DIR/jest-unit-tests.log" 2>&1
  
  if [ $? -eq 0 ]; then
    log "SUCCESS" "Jest unit tests passed"
  else
    log "ERROR" "Jest unit tests failed"
    grep -A 10 "FAIL" "$TEST_DIR/jest-unit-tests.log" | tee -a "$LOG_FILE"
  fi
  
  # Run enhanced tests if available
  if [ -f "test/unit/mcp-server/enhanced-mcp-server.test.ts" ]; then
    log "INFO" "Running enhanced MCP server tests..."
    npx jest test/unit/mcp-server/enhanced-mcp-server.test.ts --verbose > "$TEST_DIR/enhanced-tests.log" 2>&1
    
    if [ $? -eq 0 ]; then
      log "SUCCESS" "Enhanced MCP server tests passed"
    else
      log "ERROR" "Enhanced MCP server tests failed"
      grep -A 10 "FAIL" "$TEST_DIR/enhanced-tests.log" | tee -a "$LOG_FILE"
    fi
  else
    log "INFO" "Enhanced tests file not found, skipping"
  fi
else
  log "ERROR" "All server implementations failed basic tests, skipping Jest tests"
fi

# Step 8: Generate report
log "INFO" "Generating test report..."
REPORT_FILE="mcp_test_report_$TIMESTAMP.md"

cat > "$REPORT_FILE" << EOF
# MCP Server Test Report

## Test Information
- **Date:** $(date)
- **Node Version:** $NODE_VERSION
- **Platform:** $(uname -a)

## Server Implementations Tested
EOF

for i in "${!SERVER_NAMES[@]}"; do
  SERVER_PATH="${SERVER_PATHS[$i]}"
  SERVER_NAME="${SERVER_NAMES[$i]}"
  OUTPUT_FILE="$TEST_DIR/${SERVER_NAME// /_}-output.log"
  
  # Check if server passed tests
  if grep -q "Success: Yes" "$OUTPUT_FILE" 2>/dev/null; then
    RESULT="✅ PASSED"
  else
    RESULT="❌ FAILED"
  fi
  
  # Get list of tools if available
  TOOLS=$(grep -oP "Tools: \K.*" "$OUTPUT_FILE" 2>/dev/null || echo "N/A")
  
  # Get error message if failed
  if [ "$RESULT" = "❌ FAILED" ]; then
    ERROR=$(grep -oP "Error: \K.*" "$OUTPUT_FILE" 2>/dev/null || echo "Unknown error")
  else
    ERROR="None"
  fi
  
  cat >> "$REPORT_FILE" << EOF
  
### $SERVER_NAME
- **Path:** \`$SERVER_PATH\`
- **Result:** $RESULT
- **Tools:** $TOOLS
- **Error:** $ERROR
EOF
done

cat >> "$REPORT_FILE" << EOF

## Jest Test Results
- **MCP Server Unit Tests:** $(if grep -q "Jest unit tests passed" "$LOG_FILE"; then echo "✅ PASSED"; else echo "❌ FAILED"; fi)
- **Enhanced MCP Server Tests:** $(if grep -q "Enhanced MCP server tests passed" "$LOG_FILE"; then echo "✅ PASSED"; else echo "❌ FAILED"; fi)

## Issues Found
$(grep -A 1 "ERROR" "$LOG_FILE" | grep -v "^--$" | sed 's/^/- /' | sort | uniq)

## Recommendations
- Ensure @modelcontextprotocol/sdk is installed correctly (current version supports ESM)
- Fix disconnect/close method compatibility in MCP server implementation
- Fix ES Module import paths in server code
- Implement better error handling in the MCP server
- Use the standalone MCP server for testing if the main implementation fails
EOF

log "INFO" "Test report generated: $REPORT_FILE"

# Step 9: Clean up
log "INFO" "Cleaning up..."

# Save important logs before cleanup
cp "$TEST_DIR"/*.log "$LOG_DIR/" 2>/dev/null

# Remove temporary directory
rm -rf "$TEST_DIR"

# Final summary
if [ "$ANY_SERVER_WORKS" = true ]; then
  log "SUCCESS" "✅ At least one MCP server implementation passed all tests!"
else
  log "ERROR" "❌ All MCP server implementations failed tests."
fi

log "INFO" "Test completed"
log "INFO" "Report: $REPORT_FILE"
log "INFO" "Log: $LOG_FILE"
