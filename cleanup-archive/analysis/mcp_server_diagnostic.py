#!/usr/bin/env python3
"""
MCP Server Diagnostic Tool

This script provides diagnostic capabilities for the Model Context Protocol (MCP) server.
It helps identify potential issues with server configuration, connectivity, and functionality.

Features:
- Server compatibility checks
- Connection diagnostics
- Tool availability tests
- Performance benchmarking
- Configuration validation

Usage:
  python3 mcp_server_diagnostic.py [--verbose] [--target-dir DIR] [--report REPORT]
"""

import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# ANSI color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# Configure argument parser
parser = argparse.ArgumentParser(description='MCP Server Diagnostic Tool')
parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose output')
parser.add_argument('--target-dir', '-d', type=str, help='Target directory for MCP server')
parser.add_argument('--report', '-r', type=str, help='Path to save diagnostic report')
parser.add_argument('--timeout', '-t', type=int, default=10, help='Timeout in seconds for operations')

# Global diagnostics object
diagnostics = {
    'timestamp': datetime.now().isoformat(),
    'system': {
        'platform': platform.platform(),
        'python_version': platform.python_version(),
        'node_version': None,
    },
    'checks': [],
    'issues_found': 0,
    'recommendations': []
}

def log(level: str, message: str, data: Any = None) -> None:
    """Log a message with optional data."""
    timestamp = datetime.now().isoformat(timespec='milliseconds')
    
    # Determine prefix color
    prefix = f"[{timestamp}] "
    if level.upper() == "INFO":
        prefix += f"{Colors.BLUE}[INFO]{Colors.RESET} "
    elif level.upper() == "SUCCESS":
        prefix += f"{Colors.GREEN}[SUCCESS]{Colors.RESET} "
    elif level.upper() == "WARNING":
        prefix += f"{Colors.YELLOW}[WARNING]{Colors.RESET} "
    elif level.upper() == "ERROR":
        prefix += f"{Colors.RED}[ERROR]{Colors.RESET} "
    else:
        prefix += f"[{level.upper()}] "
    
    print(f"{prefix}{message}")
    
    # Print data if provided and verbose is enabled
    if args.verbose and data is not None:
        if isinstance(data, dict) or isinstance(data, list):
            print(json.dumps(data, indent=2))
        else:
            print(data)
    
    # Record in diagnostics
    check_entry = {
        'level': level.upper(),
        'timestamp': timestamp,
        'message': message
    }
    
    if data is not None:
        check_entry['data'] = data if isinstance(data, (dict, list, str, int, float, bool)) else str(data)
    
    diagnostics['checks'].append(check_entry)
    
    # Count issues
    if level.upper() in ("WARNING", "ERROR"):
        diagnostics['issues_found'] += 1

def run_command(cmd: List[str], timeout: int = None, cwd: str = None) -> Tuple[int, str, str]:
    """Run a command and return exit code, stdout, and stderr."""
    timeout = timeout or args.timeout
    
    try:
        log("INFO", f"Running command: {' '.join(cmd)}")
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=cwd,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        log("ERROR", f"Command timed out after {timeout} seconds: {' '.join(cmd)}")
        return -1, "", f"Timed out after {timeout} seconds"
    except Exception as e:
        log("ERROR", f"Error running command: {' '.join(cmd)}", str(e))
        return -2, "", str(e)

def check_node_version() -> bool:
    """Check if Node.js is installed and get its version."""
    code, stdout, stderr = run_command(["node", "--version"])
    if code == 0:
        version = stdout.strip()
        diagnostics['system']['node_version'] = version
        log("INFO", f"Node.js version: {version}")
        
        # Parse version number
        version_parts = version.lstrip('v').split('.')
        major_version = int(version_parts[0])
        
        if major_version < 18:
            log("WARNING", f"Node.js version {version} may be too old. Version 18+ is recommended.")
            diagnostics['recommendations'].append("Upgrade Node.js to version 18 or newer")
            return False
        
        return True
    else:
        log("ERROR", "Node.js is not installed or not in PATH", stderr)
        diagnostics['recommendations'].append("Install Node.js version 18 or newer")
        return False

def check_mcp_sdk() -> bool:
    """Check if the MCP SDK is installed."""
    code, stdout, stderr = run_command(
        ["npm", "list", "@modelcontextprotocol/sdk", "--json", "--depth=0"]
    )
    
    if code == 0 and "@modelcontextprotocol/sdk" in stdout:
        try:
            npm_output = json.loads(stdout)
            if "dependencies" in npm_output and "@modelcontextprotocol/sdk" in npm_output["dependencies"]:
                version = npm_output["dependencies"]["@modelcontextprotocol/sdk"]["version"]
                log("SUCCESS", f"@modelcontextprotocol/sdk found: version {version}")
                return True
        except json.JSONDecodeError:
            pass
    
    log("WARNING", "@modelcontextprotocol/sdk not found or has invalid version")
    diagnostics['recommendations'].append("Install @modelcontextprotocol/sdk package")
    return False

def create_test_mcp_client():
    """Create a minimal MCP test client file."""
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write("""
// Simple MCP test client - CommonJS format for compatibility
const path = require('path');
const fs = require('fs');

// Create a function to find the MCP SDK
function findMCPSDK() {
    // Possible paths for the SDK
    const possiblePaths = [
        path.resolve(process.cwd(), 'node_modules/@modelcontextprotocol/sdk'),
        path.resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk')
    ];
    
    // Check each path
    for (const sdkPath of possiblePaths) {
        if (fs.existsSync(sdkPath)) {
            return sdkPath;
        }
    }
    
    console.error('Could not find @modelcontextprotocol/sdk');
    return null;
}

const sdk_path = findMCPSDK();
if (!sdk_path) {
    process.exit(1);
}

// Try multiple approaches to load the modules
let Client, StdioClientTransport;

// Approach 1: Direct require from dist
try {
    Client = require(path.join(sdk_path, 'dist/client/index.js')).Client;
    StdioClientTransport = require(path.join(sdk_path, 'dist/client/stdio.js')).StdioClientTransport;
} catch (err) {
    console.error('Failed to import MCP SDK modules:', err);
    process.exit(1);
}

async function testMCPServer(serverPath, workDir) {
  console.log('Creating MCP client...');
  
  const  transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath, workDir],
    stderr: 'pipe'
  });
  
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );
  
  try {
    console.log('Connecting to MCP server...');
    await client.connect(transport);
    console.log('Connected successfully');
    
    console.log('Requesting capabilities...');
    const capabilities = await client.getServerCapabilities();
    console.log('Received capabilities:', JSON.stringify(capabilities));
    
    console.log('Listing tools...');
    const result = await client.request({ method: 'tools/list' });
    console.log('Tools available:', JSON.stringify(result.tools.map(t => t.name)));
    
    if (result.tools.find(t => t.name === 'bash')) {
      console.log('Testing bash tool...');
      const bashResult = await client.callTool({
        name: 'bash',
        arguments: { command: 'echo "Hello from MCP test client"' }
      });
      console.log('Bash result:', JSON.stringify(bashResult));
    }
    
    await client.disconnect();
    console.log('Disconnected successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Get args from process
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node test-client.js <server-path> <work-dir>');
  process.exit(1);
}

testMCPServer(args[0], args[1]);
""")
        return f.name

def find_mcp_server_file() -> str:
    """Find the MCP server file in the project."""
    possible_paths = [
        os.path.join("dist", "entrypoints", "mcp.js"),
        os.path.join("dist", "src", "entrypoints", "mcp.js"),
        os.path.join("src", "entrypoints", "mcp.ts")
    ]
    
    # Check for compiled JS first, then TS source
    for p in possible_paths:
        if os.path.exists(p):
            log("INFO", f"Found MCP server at: {p}")
            return os.path.abspath(p)
    
    log("ERROR", "Could not find MCP server file")
    return None

def test_mcp_server_connection(server_path: str, work_dir: str) -> bool:
    """Test connection to the MCP server."""
    if not server_path:
        return False
    
    # Create test work directory if needed
    if not os.path.exists(work_dir):
        os.makedirs(work_dir)
        log("INFO", f"Created test directory: {work_dir}")
    
    # Create a test file in the work directory
    test_file_path = os.path.join(work_dir, "test-file.txt")
    with open(test_file_path, "w") as f:
        f.write("Test content for MCP server")
    
    # Create test client
    test_client_path = create_test_mcp_client()
    log("INFO", f"Created test client at: {test_client_path}")
    
    # Run the test client
    start_time = time.time()
    code, stdout, stderr = run_command(
        ["node", test_client_path, server_path, work_dir],
        timeout=args.timeout * 2  # Allow extra time for the client
    )
    elapsed_time = time.time() - start_time
    
    # Cleanup
    try:
        os.unlink(test_client_path)
    except OSError as e:
        log("WARNING", f"Could not remove temporary test client: {test_client_path}", str(e))
    
    # Evaluate results
    success = code == 0
    
    if success:
        log("SUCCESS", f"Connected to MCP server successfully in {elapsed_time:.2f}s", stdout)
        
        # Check for expected tools
        if "Tools available:" in stdout:
            tools_str = stdout.split("Tools available:")[1].split("\n")[0].strip()
            try:
                tools = json.loads(tools_str)
                log("INFO", f"Server offers {len(tools)} tools: {', '.join(tools)}")
                
                # Check for minimum expected tools
                expected_tools = ["bash", "fileRead", "fileWrite"]
                missing_tools = [t for t in expected_tools if t not in tools]
                
                if missing_tools:
                    log("WARNING", f"Missing expected tools: {', '.join(missing_tools)}")
                    diagnostics['recommendations'].append(
                        f"Implement missing tools: {', '.join(missing_tools)}"
                    )
            except:
                log("WARNING", "Could not parse tools list", tools_str)
    else:
        log("ERROR", f"Failed to connect to MCP server after {elapsed_time:.2f}s", {
            "stdout": stdout,
            "stderr": stderr
        })
        
        # Analyze errors
        if "ENOENT" in stderr:
            log("ERROR", "Server file not found or not executable")
            diagnostics['recommendations'].append("Verify server file path and permissions")
        elif "SyntaxError" in stderr:
            log("ERROR", "JavaScript syntax error in server or client")
            diagnostics['recommendations'].append("Check for syntax errors in server code")
        elif "Error:" in stderr and "import" in stderr and "require" in stderr:
            log("ERROR", "Module import/require error - possible ESM/CommonJS conflict")
            diagnostics['recommendations'].append(
                "Check for ESM/CommonJS compatibility issues in the MCP server"
            )
    
    return success

def generate_report(report_path: Optional[str] = None) -> None:
    """Generate a diagnostic report."""
    if not report_path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = f"mcp-diagnostic-report-{timestamp}.json"
    
    # Summarize diagnostic results
    diagnostics["summary"] = {
        "total_checks": len(diagnostics["checks"]),
        "issues_found": diagnostics["issues_found"],
        "recommendations": len(diagnostics["recommendations"])
    }
    
    # Add severity level based on issues found
    if diagnostics["issues_found"] == 0:
        diagnostics["severity"] = "HEALTHY"
    elif diagnostics["issues_found"] < 3:
        diagnostics["severity"] = "WARNING"
    else:
        diagnostics["severity"] = "CRITICAL"
    
    # Calculate frequencies of error types
    error_types = {}
    for check in diagnostics["checks"]:
        if check["level"] in ("ERROR", "WARNING"):
            message = check["message"]
            key_word = next((w for w in ["not found", "timeout", "error", "failed"] if w in message.lower()), "other")
            error_types[key_word] = error_types.get(key_word, 0) + 1
    
    diagnostics["error_analysis"] = error_types
    
    # Write the report
    with open(report_path, 'w') as f:
        json.dump(diagnostics, f, indent=2)
    
    log("INFO", f"Diagnostic report saved to: {report_path}")
    
    # Print summary
    print("\n" + "="*60)
    print(f"{Colors.BOLD}MCP Server Diagnostic Summary{Colors.RESET}")
    print("="*60)
    print(f"Total checks run: {len(diagnostics['checks'])}")
    
    severity_color = Colors.GREEN
    if diagnostics["severity"] == "WARNING":
        severity_color = Colors.YELLOW
    elif diagnostics["severity"] == "CRITICAL":
        severity_color = Colors.RED
    
    print(f"Overall status: {severity_color}{diagnostics['severity']}{Colors.RESET}")
    print(f"Issues found: {Colors.YELLOW if diagnostics['issues_found'] > 0 else Colors.GREEN}{diagnostics['issues_found']}{Colors.RESET}")
    
    if diagnostics["recommendations"]:
        print("\nRecommendations:")
        for i, rec in enumerate(diagnostics["recommendations"], 1):
            print(f"  {i}. {rec}")
    
    print("\n" + "="*60)

def main():
    """Main diagnostic function."""
    global args
    args = parser.parse_args()
    
    print(f"\n{Colors.BOLD}{Colors.BLUE}MCP Server Diagnostic Tool{Colors.RESET}")
    print("="*40 + "\n")
    
    # Target directory for test
    target_dir = args.target_dir
    if not target_dir:
        target_dir = tempfile.mkdtemp(prefix="mcp-diagnostic-")
        log("INFO", f"Created temporary test directory: {target_dir}")
    
    # Run system checks
    log("INFO", "Starting MCP server diagnostics")
    
    # Check Node.js
    node_ok = check_node_version()
    
    # Check MCP SDK
    sdk_ok = check_mcp_sdk()
    
    # Find MCP server file
    server_path = find_mcp_server_file()
    
    # Only proceed with connection test if prerequisites are met
    if node_ok and sdk_ok and server_path:
        server_ok = test_mcp_server_connection(server_path, target_dir)
    else:
        log("ERROR", "Cannot test MCP server without prerequisites")
        server_ok = False
    
    # Generate report
    generate_report(args.report)
    
    # Return appropriate exit code
    if not server_ok:
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDiagnostic interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n{Colors.RED}Unhandled error in diagnostic tool:{Colors.RESET}")
        print(traceback.format_exc())
        sys.exit(1)
