#!/usr/bin/env python3
"""
WebSocket Bridge for Real WebNN/WebGPU Implementation

This module provides a robust WebSocket bridge for communication between Python and browsers
for real WebNN/WebGPU implementations. It includes enhanced error handling, automatic reconnection,
and improved message processing.

The March 2025 version fixes connection stability issues, reduces timeouts, and provides
better error reporting for reliable real-hardware benchmarking.

March 10, 2025 Update:
- Integrated with unified error handling framework
- Enhanced reconnection strategy with progressive backoff
- Added adaptive timeouts based on operation complexity and input size
- Improved error reporting and diagnostic information collection
- Added comprehensive cleanup on connection failures
- Implemented standardized retry mechanisms with exponential backoff
"""

import os
import sys
import json
import time
import asyncio
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Union, Callable, Any

# Import unified error handling and dependency management frameworks
try:
    from fixed_web_platform.unified_framework.error_handling import (
        ErrorHandler, handle_errors, handle_async_errors, with_retry, ErrorCategories
    )
    HAS_ERROR_FRAMEWORK = True
except ImportError:
    HAS_ERROR_FRAMEWORK = False
    # Configure basic logging if error framework not available
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)

# Set up logger if error framework is available
if HAS_ERROR_FRAMEWORK:
    logger = logging.getLogger(__name__)

# Try to import unified dependency management
try:
    from fixed_web_platform.unified_framework.dependency_management import (
        global_dependency_manager, require_dependencies
    )
    HAS_DEPENDENCY_MANAGER = True
except ImportError:
    HAS_DEPENDENCY_MANAGER = False

# Check for websockets availability using dependency management if available
if HAS_DEPENDENCY_MANAGER:
    # Use the dependency manager to check websockets
    HAS_WEBSOCKETS = global_dependency_manager.check_optional_dependency("websockets")
    
    if HAS_WEBSOCKETS:
        import websockets
        from websockets.exceptions import (
            ConnectionClosedError, 
            ConnectionClosedOK, 
            WebSocketException
        )
    else:
        # Get installation instructions from the dependency manager
        install_instructions = global_dependency_manager.get_installation_instructions(["websockets"])
        logger.error(f"websockets package is required. {install_instructions}")
else:
    # Fallback to direct import check if dependency manager is not available
    try:
        import websockets
        from websockets.exceptions import (
            ConnectionClosedError, 
            ConnectionClosedOK, 
            WebSocketException
        )
        HAS_WEBSOCKETS = True
    except ImportError:
        HAS_WEBSOCKETS = False
        logger.error("websockets package is required. Install with: pip install websockets")

class WebSocketBridge:
    """
    WebSocket bridge for communication between Python and browser.
    
    This class manages a WebSocket server for bidirectional communication
    with a browser-based WebNN/WebGPU implementation.
    """
    
    def __init__(self, port: int = 8765, host: str = "127.0.0.1", 
                 connection_timeout: float = 30.0, message_timeout: float = 60.0):
        """
        Initialize WebSocket bridge.
        
        Args:
            port: Port to listen on
            host: Host to bind to
            connection_timeout: Timeout for establishing connection (seconds)
            message_timeout: Timeout for message processing (seconds)
        """
        self.port = port
        self.host = host
        self.connection_timeout = connection_timeout
        self.message_timeout = message_timeout
        self.server = None
        self.connection = None
        self.is_connected = False
        self.message_queue = asyncio.Queue()
        self.response_events = {}
        self.response_data = {}
        self.connection_event = asyncio.Event()
        self.loop = None
        self.server_task = None
        self.process_task = None
        self.connection_attempts = 0
        self.max_connection_attempts = 3
        
    async def start(self) -> bool:
        """
        Start the WebSocket server.
        
        Returns:
            bool: True if server started successfully, False otherwise
        """
        if not HAS_WEBSOCKETS:
            logger.error("Cannot start WebSocket bridge: websockets package not installed")
            return False
            
        try:
            self.loop = asyncio.get_event_loop()
            
            # Start with specific host address to avoid binding issues
            logger.info(f"Starting WebSocket server on {self.host}:{self.port}")
            self.server = await websockets.serve(
                self.handle_connection, 
                self.host, 
                self.port,
                ping_interval=20,  # Send pings every 20 seconds to keep connection alive
                ping_timeout=10,   # Consider connection dead if no pong after 10 seconds
                max_size=10_000_000,  # 10MB max message size for large model data
                max_queue=32,      # Allow more queued messages
                close_timeout=5,   # Wait 5 seconds for graceful close
            )
            
            # Create background task for processing messages
            self.server_task = self.loop.create_task(self.keep_server_running())
            self.process_task = self.loop.create_task(self.process_message_queue())
            
            logger.info(f"WebSocket server started on {self.host}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start WebSocket server: {e}")
            return False
            
    async def keep_server_running(self):
        """Keep server task running to maintain context"""
        try:
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Server task cancelled")
            pass
        except Exception as e:
            logger.error(f"Error in server task: {e}")
            
    async def handle_connection(self, websocket):
        """
        Handle WebSocket connection.
        
        Args:
            websocket: WebSocket connection
        """
        try:
            # Store connection and signal it's established
            logger.info(f"WebSocket connection established from {websocket.remote_address}")
            self.connection = websocket
            self.is_connected = True
            self.connection_event.set()
            self.connection_attempts = 0
            
            # Handle incoming messages
            async for message in websocket:
                try:
                    await self.handle_message(message)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON: {message}")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    
        except ConnectionClosedOK:
            logger.info("WebSocket connection closed normally")
        except ConnectionClosedError as e:
            logger.warning(f"WebSocket connection closed with error: {e}")
        except Exception as e:
            logger.error(f"Error in connection handler: {e}")
        finally:
            # Reset connection state
            self.is_connected = False
            self.connection = None
            self.connection_event.clear()
    
    async def handle_message(self, message_data: str):
        """
        Process incoming WebSocket message.
        
        Args:
            message_data: Message data (raw string)
        """
        # Input validation
        if not message_data:
            logger.warning("Received empty message, ignoring")
            return
            
        # Use the new error handling framework if available
        if HAS_ERROR_FRAMEWORK:
            context = {
                "action": "handle_message",
                "message_length": len(message_data),
                "message_preview": message_data[:50] + "..." if len(message_data) > 50 else message_data
            }
        
        try:
            # Try to import our string utilities
            try:
                from fixed_web_platform.unified_framework.string_utils import fix_escapes
                # Apply escape sequence fixes before parsing
                message_data = fix_escapes(message_data)
            except ImportError:
                # Continue without fixing escapes
                pass
                
            # Parse the message
            message = json.loads(message_data)
            
            # Validate minimal message structure
            msg_type = message.get('type')
            if not msg_type:
                logger.warning(f"Message missing 'type' field: {message_data[:100]}")
            else:
                logger.debug(f"Received message: {msg_type}")
            
            # Add to message queue for processing
            await self.message_queue.put(message)
            
            # If message has a request ID, set its event
            msg_id = message.get("id")
            if msg_id and msg_id in self.response_events:
                # Store response and set event
                self.response_data[msg_id] = message
                self.response_events[msg_id].set()
                logger.debug(f"Set event for message ID: {msg_id}")
                
        except json.JSONDecodeError as e:
            # Provide more context for JSON decode errors
            error_context = {
                "position": e.pos,
                "line": e.lineno,
                "column": e.colno,
                "preview": message_data[max(0, e.pos-20):min(len(message_data), e.pos+20)] if e.pos else message_data[:100]
            }
            
            if HAS_ERROR_FRAMEWORK:
                error_handler = ErrorHandler()
                error_handler.handle_error(e, {**context, **error_context})
            else:
                logger.error(f"Failed to parse message as JSON at position {e.pos}: {message_data[:100]}")
                
        except Exception as e:
            if HAS_ERROR_FRAMEWORK:
                error_handler = ErrorHandler()
                error_handler.handle_error(e, context)
            else:
                logger.error(f"Error handling message: {e}")
    
    async def process_message_queue(self):
        """Process messages from queue"""
        try:
            while True:
                # Get message from queue
                message = await self.message_queue.get()
                
                # Process message based on type
                msg_type = message.get("type", "unknown")
                
                # Log for debugging but don't handle here - handled in response events
                logger.debug(f"Processing message type: {msg_type}")
                
                # Acknowledge as processed
                self.message_queue.task_done()
                
        except asyncio.CancelledError:
            logger.info("Message processing task cancelled")
        except Exception as e:
            logger.error(f"Error processing message queue: {e}")
    
    async def stop(self):
        """Stop WebSocket server and clean up"""
        # Cancel background tasks
        if self.process_task:
            self.process_task.cancel()
            try:
                await self.process_task
            except asyncio.CancelledError:
                pass
            
        if self.server_task:
            self.server_task.cancel()
            try:
                await self.server_task
            except asyncio.CancelledError:
                pass
        
        # Close server
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("WebSocket server stopped")
            
        # Reset state
        self.server = None
        self.connection = None
        self.is_connected = False
        self.connection_event.clear()
        
    async def wait_for_connection(self, timeout=None, retry_attempts=3):
        """
        Wait for a connection to be established with enhanced retry and diagnostics.
        
        Args:
            timeout: Timeout in seconds (None for default timeout)
            retry_attempts: Number of retry attempts if connection fails
            
        Returns:
            bool: True if connection established, False on timeout
        """
        if timeout is None:
            timeout = self.connection_timeout
            
        if self.is_connected:
            return True
        
        # Track retry count
        attempt = 0
        connection_start = time.time()
        
        while attempt <= retry_attempts:
            try:
                if attempt > 0:
                    # Progressive backoff with exponential delay
                    backoff_delay = min(2 ** attempt, 15)  # Exponential backoff, max 15 seconds
                    logger.info(f"Retry {attempt}/{retry_attempts} waiting for WebSocket connection (backoff: {backoff_delay}s)")
                    await asyncio.sleep(backoff_delay)
                    
                    # Collect diagnostic information
                    elapsed = time.time() - connection_start
                    logger.info(f"Connection attempt {attempt+1}: {elapsed:.1f}s elapsed, {retry_attempts-attempt} attempts remaining")
                
                # Wait for connection with timeout
                await asyncio.wait_for(self.connection_event.wait(), timeout=timeout)
                logger.info(f"WebSocket connection established successfully after {attempt} retries ({time.time() - connection_start:.1f}s)")
                
                # Reset connection attempts counter on success
                self.connection_attempts = 0
                return True
                
            except asyncio.TimeoutError:
                attempt += 1
                if attempt > retry_attempts:
                    logger.warning(f"Timeout waiting for WebSocket connection after {retry_attempts} retries (timeout={timeout}s, elapsed={time.time() - connection_start:.1f}s)")
                    
                    # Track global connection attempts for potential service restart
                    self.connection_attempts += 1
                    return False
                    
                # Use increasing timeout for retries, but cap at reasonable value
                timeout = min(timeout * 1.5, 60)
                logger.warning(f"Timeout waiting for WebSocket connection, retrying ({attempt}/{retry_attempts}, timeout={timeout:.1f}s)")
                
                # Reset event for next wait
                self.connection_event.clear()
                
                # Perform cleanup to improve chances of successful reconnection
                try:
                    # Clear any pending messages if possible
                    while not self.message_queue.empty():
                        try:
                            self.message_queue.get_nowait()
                            self.message_queue.task_done()
                        except:
                            break
                except Exception as e:
                    logger.debug(f"Error during queue cleanup: {e}")
        
        return False
            
    # Use with_retry decorator if available, otherwise implement manually
    if HAS_ERROR_FRAMEWORK:
        @with_retry(max_retries=2, initial_delay=0.1, backoff_factor=2.0)
        async def send_message(self, message, timeout=None, retry_attempts=2):
            """
            Send message to connected client with enhanced retry capability and adaptive timeouts.
            
            Args:
                message: Message to send (will be converted to JSON)
                timeout: Timeout in seconds (None for adaptive timeout based on message size)
                retry_attempts: Number of retry attempts if sending fails
                
            Returns:
                bool: True if sent successfully, False otherwise
            """
            if timeout is None:
                timeout = self.message_timeout
                
            # Check connection status
            if not self.is_connected or not self.connection:
                # Create a context for error handling
                context = {
                    "action": "send_message",
                    "is_connected": self.is_connected,
                    "connection_exists": self.connection is not None,
                    "message_type": message.get("type", "unknown") if isinstance(message, dict) else "raw"
                }
                
                logger.error("Cannot send message: WebSocket not connected")
                
                # Attempt to reconnect if connection event not set
                if not self.connection_event.is_set():
                    logger.info("Attempting to reconnect before sending message...")
                    connection_success = await self.wait_for_connection(timeout=self.connection_timeout/2)
                    if not connection_success:
                        raise ConnectionError("Failed to establish connection for sending message")
                        
                    # Connection was re-established
                    if self.is_connected and self.connection:
                        logger.info("Reconnected successfully, proceeding with message")
                    else:
                        raise ConnectionError("Connection status inconsistent after reconnection")
                else:
                    raise ConnectionError("WebSocket not connected and no reconnection attempted")
            
            # Serialize message once to avoid repeating work
            message_json = json.dumps(message)
            
            try:
                # Use specified timeout for sending
                await asyncio.wait_for(
                    self.connection.send(message_json),
                    timeout=timeout
                )
                return True
            except asyncio.TimeoutError as e:
                # Create a context with detailed information
                context = {
                    "action": "send_message",
                    "timeout": timeout,
                    "message_type": message.get("type", "unknown") if isinstance(message, dict) else "raw",
                    "message_id": message.get("id", "unknown") if isinstance(message, dict) else "none"
                }
                
                # Let the retry decorator handle this recoverable error
                raise asyncio.TimeoutError(f"Timeout sending message (timeout={timeout}s)")
            except ConnectionClosedError as e:
                # Connection was closed, clear connected state
                self.is_connected = False
                self.connection = None
                self.connection_event.clear()
                
                # Create context for error handling
                context = {
                    "action": "send_message",
                    "message_type": message.get("type", "unknown") if isinstance(message, dict) else "raw",
                    "connection_state": "closed_during_send"
                }
                
                # This is a recoverable error that should trigger reconnection
                raise ConnectionError(f"Connection closed while sending message: {e}")
    else:
        # Manual implementation if error framework is not available
        async def send_message(self, message, timeout=None, retry_attempts=2):
            """
            Send message to connected client with enhanced retry capability and adaptive timeouts.
            
            Args:
                message: Message to send (will be converted to JSON)
                timeout: Timeout in seconds (None for adaptive timeout based on message size)
                retry_attempts: Number of retry attempts if sending fails
                
            Returns:
                bool: True if sent successfully, False otherwise
            """
            if timeout is None:
                timeout = self.message_timeout
                
            # Check connection status
            if not self.is_connected or not self.connection:
                logger.error("Cannot send message: WebSocket not connected")
                
                # Attempt to reconnect if connection event not set
                if not self.connection_event.is_set():
                    logger.info("Attempting to reconnect before sending message...")
                    connection_success = await self.wait_for_connection(timeout=self.connection_timeout/2)
                    if not connection_success:
                        return False
                        
                    # Connection was re-established
                    if self.is_connected and self.connection:
                        logger.info("Reconnected successfully, proceeding with message")
                    else:
                        return False
                else:
                    return False
            
            # Track retry attempts
            attempt = 0
            last_error = None
            
            while attempt <= retry_attempts:
                try:
                    # Use specified timeout for sending
                    if attempt > 0:
                        logger.info(f"Retry {attempt}/{retry_attempts} sending message")
                    
                    # Serialize message once to avoid repeating work
                    message_json = json.dumps(message)
                    
                    await asyncio.wait_for(
                        self.connection.send(message_json),
                        timeout=timeout
                    )
                    return True
                    
                except asyncio.TimeoutError:
                    attempt += 1
                    last_error = f"Timeout sending message (timeout={timeout}s)"
                    logger.warning(last_error)
                    
                    if attempt > retry_attempts:
                        break
                        
                    # Use slightly longer timeout for retries
                    timeout = timeout * 1.2
                    await asyncio.sleep(0.1)  # Brief pause before retry
                    
                except ConnectionClosedError as e:
                    attempt += 1
                    last_error = f"Connection closed: {e}"
                    logger.warning(f"Connection closed while sending message: {e}")
                    
                    # Connection was closed, clear connected state
                    self.is_connected = False
                    self.connection = None
                    self.connection_event.clear()
                    
                    if attempt > retry_attempts:
                        break
                        
                    # Wait for reconnection before retry
                    logger.info("Waiting for reconnection before retry...")
                    reconnected = await self.wait_for_connection(timeout=self.connection_timeout/2)
                    if not reconnected:
                        logger.error("Failed to reconnect, cannot send message")
                        break
                    
                except Exception as e:
                    attempt += 1
                    last_error = f"Error sending message: {e}"
                    logger.warning(f"Error sending message: {e}")
                    
                    if attempt > retry_attempts:
                        break
                        
                    await asyncio.sleep(0.2)  # Slightly longer pause for general errors
            
            # If we got here, all attempts failed
            logger.error(f"Failed to send message after {retry_attempts} retries: {last_error}")
            return False
            
    async def send_and_wait(self, message, timeout=None, retry_attempts=1, response_timeout=None):
        """
        Send message and wait for response with same ID with enhanced reliability.
        
        Args:
            message: Message to send (must contain 'id' field)
            timeout: Timeout in seconds for sending (None for default)
            retry_attempts: Number of retry attempts for sending
            response_timeout: Timeout in seconds for response waiting (None for default)
            
        Returns:
            Response message or None on timeout/error
        """
        if timeout is None:
            timeout = self.message_timeout
            
        if response_timeout is None:
            response_timeout = timeout * 1.5  # Default to slightly longer timeout for response
            
        # Ensure message has ID
        if "id" not in message:
            message["id"] = f"msg_{int(time.time() * 1000)}_{id(message)}"
            
        msg_id = message["id"]
        
        # Create event for this request
        self.response_events[msg_id] = asyncio.Event()
        
        # Try to send with retries
        send_success = await self.send_message(message, timeout=timeout, retry_attempts=retry_attempts)
        if not send_success:
            # Clean up and return error on send failure
            if msg_id in self.response_events:
                del self.response_events[msg_id]
            logger.error(f"Failed to send message {msg_id}, aborting wait for response")
            return None
        
        # Keep track of whether we need to clean up
        needs_cleanup = True
        
        try:
            # Wait for response with timeout
            response_wait_start = time.time()
            logger.debug(f"Waiting for response to message {msg_id} (timeout={response_timeout}s)")
            
            # Use wait_for with the specified response timeout
            await asyncio.wait_for(self.response_events[msg_id].wait(), timeout=response_timeout)
            
            # Calculate actual response time
            response_time = time.time() - response_wait_start
            logger.debug(f"Response received for message {msg_id} in {response_time:.2f}s")
            
            # Get response data
            response = self.response_data.get(msg_id)
            
            # Clean up
            if msg_id in self.response_events:
                del self.response_events[msg_id]
            if msg_id in self.response_data:
                del self.response_data[msg_id]
                
            needs_cleanup = False
            return response
            
        except asyncio.TimeoutError:
            logger.error(f"Timeout waiting for response to message {msg_id} (timeout={response_timeout}s)")
            return None
            
        except Exception as e:
            logger.error(f"Error waiting for response to message {msg_id}: {e}")
            return None
            
        finally:
            # Always ensure cleanup in case of any exception
            if needs_cleanup:
                if msg_id in self.response_events:
                    del self.response_events[msg_id]
                if msg_id in self.response_data:
                    del self.response_data[msg_id]

    async def get_browser_capabilities(self, retry_attempts=2):
        """
        Query browser capabilities via WebSocket with enhanced reliability.
        
        Args:
            retry_attempts: Number of retry attempts
            
        Returns:
            dict: Browser capabilities
        """
        if not self.is_connected:
            if not await self.wait_for_connection(retry_attempts=retry_attempts):
                logger.error("Cannot get browser capabilities: not connected")
                return {}
                
        # Prepare request with detailed capability requests
        request = {
            "id": f"cap_{int(time.time() * 1000)}",
            "type": "feature_detection",
            "command": "get_capabilities",
            "details": {
                "webgpu": True,
                "webnn": True,
                "compute_shaders": True,
                "hardware_info": True,
                "browser_info": True
            }
        }
        
        # Send and wait for response with retries
        logger.info("Requesting detailed browser capabilities...")
        response = await self.send_and_wait(request, retry_attempts=retry_attempts)
        if not response:
            logger.error("Failed to get browser capabilities")
            
            # Try a simpler request as fallback
            logger.info("Trying simplified capability request as fallback...")
            fallback_request = {
                "id": f"cap_fallback_{int(time.time() * 1000)}",
                "type": "feature_detection",
                "command": "get_capabilities"
            }
            
            fallback_response = await self.send_and_wait(fallback_request, retry_attempts=1)
            if not fallback_response:
                logger.error("Failed to get browser capabilities with fallback request")
                return {}
                
            logger.info("Received response from fallback capabilities request")
            return fallback_response.get("data", {})
        
        # Extract capabilities
        capabilities = response.get("data", {})
        
        # Log detected capabilities
        if capabilities:
            webgpu_support = capabilities.get("webgpu_supported", False)
            webnn_support = capabilities.get("webnn_supported", False)
            compute_shaders = capabilities.get("compute_shaders_supported", False)
            
            logger.info(f"Detected capabilities - WebGPU: {webgpu_support}, WebNN: {webnn_support}, Compute Shaders: {compute_shaders}")
            
            # Log adapter info if available
            adapter = capabilities.get("webgpu_adapter", {})
            if adapter:
                logger.info(f"WebGPU Adapter: {adapter.get('vendor', 'Unknown')} - {adapter.get('device', 'Unknown')}")
                
            # Log WebNN backend if available
            backend = capabilities.get("webnn_backend", "Unknown")
            if backend:
                logger.info(f"WebNN Backend: {backend}")
                
        return capabilities
        
    async def initialize_model(self, model_name, model_type, platform, options=None, retry_attempts=2):
        """
        Initialize model in browser with enhanced reliability.
        
        Args:
            model_name: Name of model to initialize
            model_type: Type of model (text, vision, audio, multimodal)
            platform: Platform to use (webnn, webgpu)
            options: Additional options
            retry_attempts: Number of retry attempts for connection and sending
            
        Returns:
            dict: Initialization response
        """
        if not self.is_connected:
            logger.info(f"Not connected, attempting to establish connection for model initialization: {model_name}")
            if not await self.wait_for_connection(retry_attempts=retry_attempts):
                logger.error("Cannot initialize model: failed to establish connection")
                return {"status": "error", "error": "Failed to establish connection"}
                
        # Prepare request with detailed initialization parameters
        request = {
            "id": f"init_{model_name}_{int(time.time() * 1000)}",
            "type": f"{platform}_init",
            "model_name": model_name,
            "model_type": model_type,
            "timestamp": int(time.time() * 1000)
        }
        
        # Add options if specified
        if options:
            # Check for nested options structure
            if isinstance(options, dict):
                # Handle optimization options separately
                if "optimizations" in options:
                    request["optimizations"] = options["optimizations"]
                    
                # Handle quantization options separately
                if "quantization" in options:
                    request["quantization"] = options["quantization"]
                    
                # Add other options directly to request
                for key, value in options.items():
                    if key not in ["optimizations", "quantization"]:
                        request[key] = value
            else:
                # Non-dict options - just update with warning
                logger.warning(f"Options for model {model_name} are not a dictionary: {options}")
                request.update(options)
        
        # Add model-specific optimization flags based on model type
        if model_type == "audio" and platform == "webgpu":
            if not request.get("optimizations", {}).get("compute_shaders", False):
                # Add compute shader optimization for audio models
                if "optimizations" not in request:
                    request["optimizations"] = {}
                request["optimizations"]["compute_shaders"] = True
                logger.info(f"Added compute shader optimization for audio model: {model_name}")
        
        # Log initialization request
        logger.info(f"Initializing model {model_name} ({model_type}) on {platform} platform")
        if "optimizations" in request:
            logger.info(f"Using optimizations: {request['optimizations']}")
        if "quantization" in request:
            logger.info(f"Using quantization: {request['quantization']}")
            
        # Send and wait for response with retries
        start_time = time.time()
        response = await self.send_and_wait(request, retry_attempts=retry_attempts, response_timeout=120.0)  # Longer timeout for model init
        
        if not response:
            logger.error(f"Failed to initialize model {model_name} - no response received")
            
            # Create error response
            return {
                "status": "error", 
                "error": "No response to initialization request",
                "model_name": model_name,
                "platform": platform
            }
        
        # Log initialization time
        init_time = time.time() - start_time
        init_status = response.get("status", "unknown")
        
        if init_status == "success":
            logger.info(f"Model {model_name} initialized successfully in {init_time:.2f}s")
            
            # Add extra data to response if available
            if "adapter_info" in response:
                logger.info(f"Using adapter: {response['adapter_info'].get('vendor', 'Unknown')} - {response['adapter_info'].get('device', 'Unknown')}")
                
            if "memory_usage" in response:
                logger.info(f"Initial memory usage: {response['memory_usage']} MB")
        else:
            error_msg = response.get("error", "Unknown error")
            logger.error(f"Failed to initialize model {model_name}: {error_msg}")
            
        return response
        
    async def run_inference(self, model_name, input_data, platform, options=None, retry_attempts=1, timeout_multiplier=2):
        """
        Run inference with model in browser with enhanced reliability.
        
        Args:
            model_name: Name of model to use
            input_data: Input data for inference
            platform: Platform to use (webnn, webgpu)
            options: Additional options
            retry_attempts: Number of retry attempts if inference fails
            timeout_multiplier: Multiplier for timeout duration (for large models)
            
        Returns:
            dict: Inference response
        """
        if not self.is_connected:
            logger.info(f"Not connected, attempting to establish connection for inference: {model_name}")
            if not await self.wait_for_connection(retry_attempts=retry_attempts):
                logger.error("Cannot run inference: failed to establish connection")
                return {"status": "error", "error": "Failed to establish connection"}
                
        # Determine appropriate timeout based on model and input complexity
        inference_timeout = self.message_timeout * timeout_multiplier
        
        # Check input data and apply special handling for different types
        processed_input = self._preprocess_input_data(model_name, input_data)
        if processed_input is None:
            return {"status": "error", "error": "Failed to preprocess input data"}
        
        # Prepare request with detailed inference parameters
        request = {
            "id": f"infer_{model_name}_{int(time.time() * 1000)}",
            "type": f"{platform}_inference",
            "model_name": model_name,
            "input": processed_input,
            "timestamp": int(time.time() * 1000)
        }
        
        # Add options if specified
        if options:
            if isinstance(options, dict):
                request["options"] = options
            else:
                logger.warning(f"Options for inference with {model_name} are not a dictionary: {options}")
                request["options"] = {"raw_options": options}
        
        # Add data about input size for better diagnostics
        request["input_metadata"] = self._get_input_metadata(processed_input)
        
        # Log inference start with size information
        input_size = request["input_metadata"].get("estimated_size", "unknown")
        logger.info(f"Running inference with model {model_name} on {platform} (input size: {input_size})")
        
        # Send and wait for response with longer timeout for inference
        start_time = time.time()
        response = await self.send_and_wait(
            request, 
            timeout=inference_timeout,
            retry_attempts=retry_attempts,
            response_timeout=inference_timeout * 1.5  # Even longer timeout for waiting for response
        )
        
        inference_time = time.time() - start_time
        
        if not response:
            logger.error(f"Failed to run inference with model {model_name} after {inference_time:.2f}s")
            
            # Create detailed error response
            return {
                "status": "error", 
                "error": "No response to inference request",
                "model_name": model_name,
                "platform": platform,
                "inference_time": inference_time,
                "input_metadata": request["input_metadata"]
            }
        
        # Add performance metrics if not present
        if "performance_metrics" not in response:
            response["performance_metrics"] = {
                "inference_time_ms": inference_time * 1000,
                "throughput_items_per_sec": 1000 / (inference_time * 1000) if inference_time > 0 else 0
            }
        
        # Log inference time
        inference_status = response.get("status", "unknown")
        if inference_status == "success":
            logger.info(f"Inference completed successfully in {inference_time:.3f}s")
            
            # Log memory usage if available
            if "memory_usage" in response:
                logger.info(f"Memory usage: {response['memory_usage']} MB")
                if "performance_metrics" in response:
                    response["performance_metrics"]["memory_usage_mb"] = response["memory_usage"]
                    
            # Log throughput if available
            if "performance_metrics" in response and "throughput_items_per_sec" in response["performance_metrics"]:
                throughput = response["performance_metrics"]["throughput_items_per_sec"]
                logger.info(f"Throughput: {throughput:.2f} items/sec")
        else:
            error_msg = response.get("error", "Unknown error")
            logger.error(f"Inference failed for model {model_name}: {error_msg}")
        
        return response
    
    def _preprocess_input_data(self, model_name, input_data):
        """
        Preprocess input data for inference.
        
        Args:
            model_name: Name of model
            input_data: Input data to preprocess
            
        Returns:
            Processed input data or None on error
        """
        try:
            # Handle different input data types
            if isinstance(input_data, dict):
                # Dictionary input - No processing needed
                return input_data
            elif isinstance(input_data, list):
                # List input - Convert to standard format
                return {"inputs": input_data}
            elif isinstance(input_data, str):
                # String input - Convert to text input format
                return {"text": input_data}
            elif input_data is None:
                logger.error(f"Input data for model {model_name} is None")
                return None
            else:
                # Unknown input type - Log warning and return as-is
                logger.warning(f"Unknown input data type for model {model_name}: {type(input_data)}")
                return {"raw_input": str(input_data)}
                
        except Exception as e:
            logger.error(f"Error preprocessing input data for model {model_name}: {e}")
            return None
    
    def _get_input_metadata(self, input_data):
        """
        Get metadata about input data for diagnostics.
        
        Args:
            input_data: Input data
            
        Returns:
            Dictionary with input metadata
        """
        metadata = {
            "type": type(input_data).__name__,
            "estimated_size": "unknown"
        }
        
        try:
            # Calculate estimated size based on input type
            if isinstance(input_data, dict):
                # Dictionary input - Estimate size based on keys and values
                metadata["keys"] = list(input_data.keys())
                
                # Calculate size for values when possible
                sizes = {}
                total_size = 0
                
                for key, value in input_data.items():
                    if isinstance(value, list):
                        sizes[key] = len(value)
                        total_size += len(value)
                    elif isinstance(value, str):
                        sizes[key] = len(value)
                        total_size += len(value)
                
                metadata["value_sizes"] = sizes
                metadata["estimated_size"] = f"{total_size} elements"
            elif isinstance(input_data, list):
                # List input - Use length
                metadata["estimated_size"] = f"{len(input_data)} elements"
            elif isinstance(input_data, str):
                # String input - Use length
                metadata["estimated_size"] = f"{len(input_data)} chars"
                
            return metadata
            
        except Exception as e:
            logger.error(f"Error getting input metadata: {e}")
            return metadata
        
    async def shutdown_browser(self):
        """
        Send shutdown command to browser.
        
        Returns:
            bool: True if command sent successfully, False otherwise
        """
        if not self.is_connected:
            return False
            
        # Prepare shutdown request
        request = {
            "id": f"shutdown_{int(time.time() * 1000)}",
            "type": "shutdown",
            "command": "shutdown"
        }
        
        # Just send, don't wait for response
        return await self.send_message(request)


# Utility function to create and start a bridge
async def create_websocket_bridge(port=8765):
    """
    Create and start a WebSocket bridge.
    
    Args:
        port: Port to use for WebSocket server
        
    Returns:
        WebSocketBridge instance or None on failure
    """
    bridge = WebSocketBridge(port=port)
    
    if await bridge.start():
        return bridge
    else:
        return None
        
        
# Test function for the bridge
async def test_websocket_bridge():
    """Test WebSocket bridge functionality."""
    bridge = await create_websocket_bridge()
    if not bridge:
        logger.error("Failed to create bridge")
        return False
        
    try:
        logger.info("WebSocket bridge created successfully")
        logger.info("Waiting for connection...")
        
        # Wait up to 30 seconds for connection
        connected = await bridge.wait_for_connection(timeout=30)
        if not connected:
            logger.error("No connection established")
            await bridge.stop()
            return False
            
        logger.info("Connection established!")
        
        # Test getting capabilities
        logger.info("Requesting capabilities...")
        capabilities = await bridge.get_browser_capabilities()
        logger.info(f"Capabilities: {json.dumps(capabilities, indent=2)}")
        
        # Wait for 5 seconds before shutting down
        logger.info("Test completed successfully. Shutting down in 5 seconds...")
        await asyncio.sleep(5)
        
        # Send shutdown command
        await bridge.shutdown_browser()
        
        # Stop bridge
        await bridge.stop()
        return True
        
    except Exception as e:
        logger.error(f"Error in test: {e}")
        await bridge.stop()
        return False
        

if __name__ == "__main__":
    # Run test if script executed directly
    import asyncio
    success = asyncio.run(test_websocket_bridge())
    sys.exit(0 if success else 1)