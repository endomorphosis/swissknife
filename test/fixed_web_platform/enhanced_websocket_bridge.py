#!/usr/bin/env python3
"""
Enhanced WebSocket Bridge for WebNN/WebGPU Acceleration

This module provides an enhanced WebSocket bridge with improved reliability, 
automatic reconnection, and comprehensive error handling for browser communication.

Key improvements over the base WebSocket bridge:
- Exponential backoff for reconnection attempts
- Keep-alive mechanism with heartbeat messages
- Connection health monitoring with automatic recovery
- Detailed error handling and logging
- Support for message prioritization
- Large message fragmentation
- Comprehensive statistics and diagnostics
"""

import os
import sys
import json
import time
import asyncio
import logging
import random
from typing import Dict, List, Tuple, Optional, Union, Callable, Any

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try to import websockets with improved error handling
try:
    import websockets
    from websockets.exceptions import (
        ConnectionClosedError, 
        ConnectionClosedOK, 
        WebSocketException
    )
    HAS_WEBSOCKETS = True
except ImportError:
    logger.error("websockets package is required. Install with: pip install websockets")
    HAS_WEBSOCKETS = False

class MessagePriority:
    """Message priority levels for WebSocket communication."""
    HIGH = 0
    NORMAL = 1
    LOW = 2

class EnhancedWebSocketBridge:
    """
    Enhanced WebSocket bridge for browser communication with improved reliability.
    
    This class provides a reliable WebSocket server for bidirectional communication
    with browser-based WebNN/WebGPU implementations, featuring automatic reconnection,
    comprehensive error handling, and connection health monitoring.
    """
    
    def __init__(self, port: int = 8765, host: str = "127.0.0.1", 
                 connection_timeout: float = 30.0, message_timeout: float = 60.0,
                 max_reconnect_attempts: int = 5, enable_heartbeat: bool = True,
                 heartbeat_interval: float = 20.0):
        """
        Initialize enhanced WebSocket bridge.
        
        Args:
            port: Port to listen on
            host: Host to bind to
            connection_timeout: Timeout for establishing connection (seconds)
            message_timeout: Timeout for message processing (seconds)
            max_reconnect_attempts: Maximum number of reconnection attempts
            enable_heartbeat: Whether to enable heartbeat mechanism
            heartbeat_interval: Interval between heartbeat messages (seconds)
        """
        self.port = port
        self.host = host
        self.connection_timeout = connection_timeout
        self.message_timeout = message_timeout
        self.max_reconnect_attempts = max_reconnect_attempts
        self.enable_heartbeat = enable_heartbeat
        self.heartbeat_interval = heartbeat_interval
        
        # Server and connection state
        self.server = None
        self.connection = None
        self.is_connected = False
        self.connection_event = asyncio.Event()
        self.shutdown_event = asyncio.Event()
        self.last_heartbeat_time = 0
        self.last_receive_time = 0
        
        # Message handling
        self.message_queue = asyncio.PriorityQueue()
        self.response_events = {}
        self.response_data = {}
        
        # Async tasks
        self.loop = None
        self.server_task = None
        self.process_task = None
        self.heartbeat_task = None
        self.monitor_task = None
        
        # Reconnection state
        self.connection_attempts = 0
        self.reconnecting = False
        self.reconnect_delay = 1.0  # Initial delay in seconds
        
        # Statistics and diagnostics
        self.stats = {
            "messages_sent": 0,
            "messages_received": 0,
            "connection_errors": 0,
            "reconnection_attempts": 0,
            "successful_reconnections": 0,
            "message_timeouts": 0,
            "heartbeats_sent": 0,
            "heartbeats_received": 0,
            "last_error": "",
            "uptime_start": time.time(),
            "connection_stability": 1.0  # 0.0-1.0 scale
        }
    
    async def start(self) -> bool:
        """
        Start the WebSocket server with enhanced reliability features.
        
        Returns:
            bool: True if server started successfully, False otherwise
        """
        if not HAS_WEBSOCKETS:
            logger.error("Cannot start Enhanced WebSocket bridge: websockets package not installed")
            return False
            
        try:
            self.loop = asyncio.get_event_loop()
            
            # Start with specific host address to avoid binding issues
            logger.info(f"Starting Enhanced WebSocket server on {self.host}:{self.port}")
            self.server = await websockets.serve(
                self.handle_connection, 
                self.host, 
                self.port,
                ping_interval=None,  # We'll handle our own heartbeat
                ping_timeout=None,   # Disable automatic ping timeout
                max_size=20_000_000,  # 20MB max message size for large model data
                max_queue=64,        # Allow more queued messages
                close_timeout=5,     # Wait 5 seconds for graceful close
            )
            
            # Create background tasks
            self.server_task = self.loop.create_task(self.keep_server_running())
            self.process_task = self.loop.create_task(self.process_message_queue())
            
            # Start heartbeat and monitoring if enabled
            if self.enable_heartbeat:
                self.heartbeat_task = self.loop.create_task(self.send_heartbeats())
                self.monitor_task = self.loop.create_task(self.monitor_connection_health())
            
            # Reset shutdown event
            self.shutdown_event.clear()
            
            logger.info(f"Enhanced WebSocket server started on {self.host}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start Enhanced WebSocket server: {e}")
            return False
    
    async def keep_server_running(self):
        """Keep server task running to maintain context."""
        try:
            while not self.shutdown_event.is_set():
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Server task cancelled")
        except Exception as e:
            logger.error(f"Error in server task: {e}")
    
    async def handle_connection(self, websocket):
        """
        Handle WebSocket connection with enhanced error recovery.
        
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
            self.reconnect_delay = 1.0  # Reset reconnect delay
            self.last_receive_time = time.time()
            
            # Reset reconnection state
            self.reconnecting = False
            
            # Update stats
            if self.stats["reconnection_attempts"] > 0:
                self.stats["successful_reconnections"] += 1
            
            # Update connection stability metric (simple moving average)
            self.stats["connection_stability"] = 0.9 * self.stats["connection_stability"] + 0.1
            
            # Handle incoming messages with enhanced error handling
            async for message in websocket:
                try:
                    await self.handle_message(message)
                    self.last_receive_time = time.time()
                    self.stats["messages_received"] += 1
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON: {message[:100]}...")
                    self.stats["last_error"] = "Invalid JSON format"
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    self.stats["last_error"] = f"Message processing error: {str(e)}"
                    
        except ConnectionClosedOK:
            logger.info("WebSocket connection closed normally")
        except ConnectionClosedError as e:
            logger.warning(f"WebSocket connection closed with error: {e}")
            self.stats["connection_errors"] += 1
            self.stats["last_error"] = f"Connection closed: {str(e)}"
            # Update connection stability metric
            self.stats["connection_stability"] = 0.9 * self.stats["connection_stability"] - 0.1
            await self.attempt_reconnection()
        except Exception as e:
            logger.error(f"Error in connection handler: {e}")
            self.stats["connection_errors"] += 1
            self.stats["last_error"] = f"Connection handler error: {str(e)}"
            await self.attempt_reconnection()
        finally:
            # Only reset connection state if we're not in the process of reconnecting
            if not self.reconnecting:
                self.is_connected = False
                self.connection = None
                self.connection_event.clear()
    
    async def attempt_reconnection(self):
        """
        Attempt to reconnect to the client with exponential backoff.
        """
        if self.reconnecting or self.shutdown_event.is_set():
            return
            
        self.reconnecting = True
        self.connection_attempts += 1
        self.stats["reconnection_attempts"] += 1
        
        if self.connection_attempts > self.max_reconnect_attempts:
            logger.error(f"Maximum reconnection attempts ({self.max_reconnect_attempts}) reached")
            self.reconnecting = False
            return
            
        # Calculate backoff delay with jitter
        delay = min(60, self.reconnect_delay * (1.5 ** (self.connection_attempts - 1)))
        jitter = random.uniform(0, 0.1 * delay)  # 10% jitter
        total_delay = delay + jitter
        
        logger.info(f"Attempting reconnection in {total_delay:.2f} seconds (attempt {self.connection_attempts}/{self.max_reconnect_attempts})")
        
        # Wait for backoff delay
        await asyncio.sleep(total_delay)
        
        # Connection will be re-established when a client connects
        self.reconnecting = False
        
        # Double the reconnect delay for next attempt
        self.reconnect_delay = delay * 2
    
    async def handle_message(self, message_data):
        """
        Process incoming WebSocket message with enhanced error handling.
        
        Args:
            message_data: Message data (raw string)
        """
        try:
            message = json.loads(message_data)
            msg_type = message.get("type", "unknown")
            msg_id = message.get("id", "unknown")
            
            logger.debug(f"Received message: type={msg_type}, id={msg_id}")
            
            # Handle heartbeat response
            if msg_type == "heartbeat_response":
                self.last_heartbeat_time = time.time()
                self.stats["heartbeats_received"] += 1
                return
                
            # Add to message queue for processing
            priority = MessagePriority.NORMAL
            if msg_type == "error":
                priority = MessagePriority.HIGH
            elif msg_type == "log":
                priority = MessagePriority.LOW
                
            await self.message_queue.put((priority, message))
            
            # If message has a request ID, set its event
            if msg_id and msg_id in self.response_events:
                # Store response and set event
                self.response_data[msg_id] = message
                self.response_events[msg_id].set()
                
        except json.JSONDecodeError:
            logger.error(f"Failed to parse message as JSON: {message_data[:100]}...")
            raise
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            raise
    
    async def process_message_queue(self):
        """Process messages from queue with priority handling."""
        try:
            while not self.shutdown_event.is_set():
                try:
                    # Get message from queue with timeout
                    priority, message = await asyncio.wait_for(
                        self.message_queue.get(),
                        timeout=1.0
                    )
                    
                    # Process message based on type
                    msg_type = message.get("type", "unknown")
                    
                    # Log for debugging but don't handle here - handled in response events
                    logger.debug(f"Processing message type: {msg_type}, priority: {priority}")
                    
                    # Acknowledge as processed
                    self.message_queue.task_done()
                    
                except asyncio.TimeoutError:
                    # No messages in queue, just continue
                    continue
                except Exception as e:
                    logger.error(f"Error processing message from queue: {e}")
                    self.stats["last_error"] = f"Queue processing error: {str(e)}"
                    
        except asyncio.CancelledError:
            logger.info("Message processing task cancelled")
        except Exception as e:
            logger.error(f"Error in message queue processor: {e}")
            self.stats["last_error"] = f"Queue processor error: {str(e)}"
    
    async def send_heartbeats(self):
        """
        Send periodic heartbeat messages to check connection health.
        """
        try:
            while not self.shutdown_event.is_set():
                await asyncio.sleep(self.heartbeat_interval)
                
                if self.is_connected and self.connection:
                    try:
                        heartbeat_msg = {
                            "id": f"heartbeat_{int(time.time())}",
                            "type": "heartbeat",
                            "timestamp": time.time()
                        }
                        
                        await asyncio.wait_for(
                            self.connection.send(json.dumps(heartbeat_msg)),
                            timeout=5.0
                        )
                        
                        self.stats["heartbeats_sent"] += 1
                        logger.debug("Heartbeat sent")
                        
                    except Exception as e:
                        logger.warning(f"Failed to send heartbeat: {e}")
                        self.stats["last_error"] = f"Heartbeat error: {str(e)}"
        
        except asyncio.CancelledError:
            logger.info("Heartbeat task cancelled")
        except Exception as e:
            logger.error(f"Error in heartbeat task: {e}")
            self.stats["last_error"] = f"Heartbeat task error: {str(e)}"
    
    async def monitor_connection_health(self):
        """
        Monitor connection health and trigger reconnection if needed.
        """
        try:
            while not self.shutdown_event.is_set():
                await asyncio.sleep(self.heartbeat_interval / 2)
                
                if self.is_connected:
                    current_time = time.time()
                    
                    # Check if we've received any messages recently
                    receive_timeout = current_time - self.last_receive_time > self.heartbeat_interval * 3
                    
                    # Check if heartbeat response was received (if heartbeat was sent)
                    heartbeat_timeout = (self.stats["heartbeats_sent"] > 0 and 
                                       self.stats["heartbeats_received"] == 0) or (
                                       self.last_heartbeat_time > 0 and 
                                       current_time - self.last_heartbeat_time > self.heartbeat_interval * 2)
                    
                    if receive_timeout or heartbeat_timeout:
                        logger.warning(f"Connection appears unhealthy: received={not receive_timeout}, heartbeat={not heartbeat_timeout}")
                        
                        # Close the connection to trigger reconnection
                        if self.connection:
                            try:
                                await self.connection.close(code=1001, reason="Connection health check failed")
                            except Exception as e:
                                logger.error(f"Error closing unhealthy connection: {e}")
                        
                        # Reset connection state
                        self.is_connected = False
                        self.connection = None
                        self.connection_event.clear()
                        
                        # Attempt reconnection
                        await self.attempt_reconnection()
        
        except asyncio.CancelledError:
            logger.info("Health monitor task cancelled")
        except Exception as e:
            logger.error(f"Error in health monitor task: {e}")
            self.stats["last_error"] = f"Health monitor error: {str(e)}"
    
    async def stop(self):
        """Stop WebSocket server and clean up resources with enhanced reliability."""
        # Set shutdown event to stop background tasks
        self.shutdown_event.set()
        
        # Cancel background tasks
        for task in [self.process_task, self.server_task, self.heartbeat_task, self.monitor_task]:
            if task:
                try:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                except Exception as e:
                    logger.error(f"Error cancelling task: {e}")
        
        # Close active connection
        if self.connection:
            try:
                await self.connection.close(code=1000, reason="Server shutdown")
            except Exception as e:
                logger.error(f"Error closing connection during shutdown: {e}")
        
        # Close server
        if self.server:
            self.server.close()
            try:
                await self.server.wait_closed()
            except Exception as e:
                logger.error(f"Error waiting for server to close: {e}")
            
        logger.info("Enhanced WebSocket server stopped")
        
        # Reset state
        self.server = None
        self.connection = None
        self.is_connected = False
        self.connection_event.clear()
        self.process_task = None
        self.server_task = None
        self.heartbeat_task = None
        self.monitor_task = None
    
    async def wait_for_connection(self, timeout=None):
        """
        Wait for a connection to be established with improved timeout handling.
        
        Args:
            timeout: Timeout in seconds (None for default timeout)
            
        Returns:
            bool: True if connection established, False on timeout
        """
        if timeout is None:
            timeout = self.connection_timeout
            
        if self.is_connected:
            return True
            
        try:
            # Wait for connection event with timeout
            await asyncio.wait_for(self.connection_event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for WebSocket connection (timeout={timeout}s)")
            return False
    
    async def send_message(self, message, timeout=None, priority=MessagePriority.NORMAL):
        """
        Send message to connected client with enhanced error handling and retries.
        
        Args:
            message: Message to send (will be converted to JSON)
            timeout: Timeout in seconds (None for default)
            priority: Message priority (HIGH, NORMAL, LOW)
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if timeout is None:
            timeout = self.message_timeout
            
        if not self.is_connected or not self.connection:
            logger.error("Cannot send message: WebSocket not connected")
            return False
        
        # Ensure message has an ID for tracking
        if "id" not in message:
            message["id"] = f"msg_{int(time.time() * 1000)}_{id(message)}"
            
        # Add timestamp to message
        if "timestamp" not in message:
            message["timestamp"] = time.time()
            
        # Convert message to JSON
        try:
            message_json = json.dumps(message)
        except Exception as e:
            logger.error(f"Error serializing message to JSON: {e}")
            self.stats["last_error"] = f"JSON serialization error: {str(e)}"
            return False
            
        # Try to send with retry
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                # Use specified timeout for sending
                await asyncio.wait_for(
                    self.connection.send(message_json),
                    timeout=timeout
                )
                
                # Update stats
                self.stats["messages_sent"] += 1
                
                return True
                
            except asyncio.TimeoutError:
                if attempt < max_retries:
                    logger.warning(f"Timeout sending message, retrying (attempt {attempt+1}/{max_retries+1})")
                else:
                    logger.error(f"Failed to send message after {max_retries+1} attempts: timeout")
                    self.stats["message_timeouts"] += 1
                    self.stats["last_error"] = "Message send timeout"
                    return False
                    
            except Exception as e:
                if attempt < max_retries and self.is_connected:
                    logger.warning(f"Error sending message, retrying (attempt {attempt+1}/{max_retries+1}): {e}")
                else:
                    logger.error(f"Failed to send message: {e}")
                    self.stats["last_error"] = f"Message send error: {str(e)}"
                    return False
                
        return False
    
    async def send_and_wait(self, message, timeout=None, response_validator=None):
        """
        Send message and wait for response with enhanced reliability.
        
        Args:
            message: Message to send (must contain 'id' field)
            timeout: Timeout in seconds (None for default)
            response_validator: Optional function to validate response
            
        Returns:
            Response message or None on timeout/error
        """
        if timeout is None:
            timeout = self.message_timeout
            
        # Ensure message has ID
        if "id" not in message:
            message["id"] = f"msg_{int(time.time() * 1000)}_{id(message)}"
            
        msg_id = message["id"]
        
        # Create event for this request
        self.response_events[msg_id] = asyncio.Event()
        
        # Calculate priority based on message type
        priority = MessagePriority.NORMAL
        if message.get("type") == "error":
            priority = MessagePriority.HIGH
        elif message.get("type") in ["log", "status"]:
            priority = MessagePriority.LOW
        
        # Send message
        if not await self.send_message(message, timeout=timeout/2, priority=priority):
            # Clean up and return error on send failure
            del self.response_events[msg_id]
            return {"status": "error", "error": "Failed to send message", "message_id": msg_id}
            
        try:
            # Wait for response with timeout
            await asyncio.wait_for(self.response_events[msg_id].wait(), timeout=timeout)
            
            # Get response data
            response = self.response_data.get(msg_id)
            
            # Validate response if validator provided
            if response_validator and not response_validator(response):
                logger.warning(f"Response validation failed for message {msg_id}")
                response = {"status": "error", "error": "Response validation failed", "message_id": msg_id}
            
            # Clean up
            del self.response_events[msg_id]
            if msg_id in self.response_data:
                del self.response_data[msg_id]
                
            return response
            
        except asyncio.TimeoutError:
            logger.error(f"Timeout waiting for response to message {msg_id}")
            self.stats["message_timeouts"] += 1
            self.stats["last_error"] = f"Response timeout for message {msg_id}"
            
            # Clean up on timeout
            del self.response_events[msg_id]
            if msg_id in self.response_data:
                del self.response_data[msg_id]
                
            return {"status": "error", "error": "Response timeout", "message_id": msg_id}
            
        except Exception as e:
            logger.error(f"Error waiting for response: {e}")
            self.stats["last_error"] = f"Response wait error: {str(e)}"
            
            # Clean up on error
            del self.response_events[msg_id]
            if msg_id in self.response_data:
                del self.response_data[msg_id]
                
            return {"status": "error", "error": str(e), "message_id": msg_id}
    
    async def get_browser_capabilities(self):
        """
        Query browser capabilities via WebSocket with enhanced error handling.
        
        Returns:
            dict: Browser capabilities
        """
        if not self.is_connected:
            connected = await self.wait_for_connection()
            if not connected:
                logger.error("Cannot get browser capabilities: not connected")
                return {"status": "error", "error": "Not connected"}
                
        # Prepare request with retry logic
        request = {
            "id": f"cap_{int(time.time() * 1000)}",
            "type": "feature_detection",
            "command": "get_capabilities",
            "timestamp": time.time()
        }
        
        # Define response validator
        def validate_capabilities(response):
            return (response and 
                    response.get("status") == "success" and 
                    "data" in response)
        
        # Send and wait for response with validation
        response = await self.send_and_wait(
            request, 
            timeout=self.message_timeout,
            response_validator=validate_capabilities
        )
        
        if not response or response.get("status") != "success":
            error_msg = response.get("error", "Unknown error") if response else "No response"
            logger.error(f"Failed to get browser capabilities: {error_msg}")
            return {"status": "error", "error": error_msg}
            
        # Extract capabilities
        return response.get("data", {})
    
    async def initialize_model(self, model_name, model_type, platform, options=None):
        """
        Initialize model in browser with enhanced error handling and diagnostics.
        
        Args:
            model_name: Name of model to initialize
            model_type: Type of model (text, vision, audio, multimodal)
            platform: Platform to use (webnn, webgpu)
            options: Additional options
            
        Returns:
            dict: Initialization response
        """
        if not self.is_connected:
            connected = await self.wait_for_connection()
            if not connected:
                logger.error("Cannot initialize model: not connected")
                return {"status": "error", "error": "Not connected"}
                
        # Prepare request with diagnostics info
        request = {
            "id": f"init_{model_name}_{int(time.time() * 1000)}",
            "type": f"{platform}_init",
            "model_name": model_name,
            "model_type": model_type,
            "timestamp": time.time(),
            "diagnostics": {
                "connection_stability": self.stats["connection_stability"],
                "uptime": time.time() - self.stats["uptime_start"],
                "messages_processed": self.stats["messages_received"]
            }
        }
        
        # Add options if specified
        if options:
            request.update(options)
        
        # Define response validator
        def validate_init_response(response):
            return (response and 
                    response.get("status") in ["success", "error"] and
                    "model_name" in response)
            
        # Send and wait for response with validation
        response = await self.send_and_wait(
            request, 
            timeout=self.message_timeout * 2,  # Longer timeout for model initialization
            response_validator=validate_init_response
        )
        
        if not response:
            logger.error(f"Failed to initialize model {model_name}: No response")
            return {"status": "error", "error": "No response", "model_name": model_name}
            
        if response.get("status") != "success":
            error_msg = response.get("error", "Unknown error")
            logger.error(f"Failed to initialize model {model_name}: {error_msg}")
        else:
            logger.info(f"Successfully initialized model {model_name} on {platform}")
            
        return response
    
    async def run_inference(self, model_name, input_data, platform, options=None):
        """
        Run inference with model in browser with enhanced reliability features.
        
        Args:
            model_name: Name of model to use
            input_data: Input data for inference
            platform: Platform to use (webnn, webgpu)
            options: Additional options
            
        Returns:
            dict: Inference response
        """
        if not self.is_connected:
            connected = await self.wait_for_connection()
            if not connected:
                logger.error("Cannot run inference: not connected")
                return {"status": "error", "error": "Not connected"}
                
        # Prepare request with diagnostics
        request = {
            "id": f"infer_{model_name}_{int(time.time() * 1000)}",
            "type": f"{platform}_inference",
            "model_name": model_name,
            "input": input_data,
            "timestamp": time.time(),
            "diagnostics": {
                "connection_stability": self.stats["connection_stability"],
                "reconnection_count": self.stats["successful_reconnections"]
            }
        }
        
        # Add options if specified
        if options:
            request["options"] = options
            
        # Define response validator
        def validate_inference_response(response):
            return (response and 
                    response.get("status") in ["success", "error"] and
                    (response.get("status") == "error" or "result" in response))
            
        # Send and wait for response with extended timeout for inference
        response = await self.send_and_wait(
            request, 
            timeout=self.message_timeout * 3,  # Extended timeout for inference
            response_validator=validate_inference_response
        )
        
        if not response:
            logger.error(f"Failed to run inference with model {model_name}: No response")
            return {"status": "error", "error": "No response", "model_name": model_name}
            
        if response.get("status") != "success":
            error_msg = response.get("error", "Unknown error")
            logger.error(f"Failed to run inference with model {model_name}: {error_msg}")
        else:
            logger.info(f"Successfully ran inference with model {model_name} on {platform}")
            
        return response
    
    async def shutdown_browser(self):
        """
        Send shutdown command to browser with enhanced reliability.
        
        Returns:
            bool: True if command sent successfully, False otherwise
        """
        if not self.is_connected:
            return False
            
        # Prepare shutdown request with confirmation
        request = {
            "id": f"shutdown_{int(time.time() * 1000)}",
            "type": "shutdown",
            "command": "shutdown",
            "timestamp": time.time(),
            "confirm": True
        }
        
        # Just send, don't wait for response (browser may close before responding)
        return await self.send_message(request, priority=MessagePriority.HIGH)
    
    def get_stats(self):
        """
        Get detailed connection and message statistics.
        
        Returns:
            dict: Statistics and diagnostics information
        """
        # Calculate uptime
        uptime = time.time() - self.stats["uptime_start"]
        
        # Calculate messages per second
        messages_per_second = 0
        if uptime > 0:
            messages_per_second = (self.stats["messages_sent"] + self.stats["messages_received"]) / uptime
        
        # Update stats dictionary
        current_stats = {
            **self.stats,
            "uptime_seconds": uptime,
            "is_connected": self.is_connected,
            "reconnecting": self.reconnecting,
            "connection_attempts": self.connection_attempts,
            "messages_per_second": messages_per_second,
            "queue_size": self.message_queue.qsize() if self.message_queue else 0,
            "heartbeat_enabled": self.enable_heartbeat
        }
        
        return current_stats
    
    async def send_log(self, level, message, data=None):
        """
        Send log message to browser.
        
        Args:
            level: Log level (debug, info, warning, error)
            message: Log message
            data: Additional data to log
            
        Returns:
            bool: True if log sent successfully, False otherwise
        """
        log_message = {
            "id": f"log_{int(time.time() * 1000)}",
            "type": "log",
            "level": level,
            "message": message,
            "timestamp": time.time()
        }
        
        if data:
            log_message["data"] = data
            
        return await self.send_message(
            log_message, 
            timeout=5.0,  # Short timeout for logs
            priority=MessagePriority.LOW
        )
    
    async def ping(self, timeout=5.0):
        """
        Ping the browser to check connection health.
        
        Args:
            timeout: Timeout in seconds
            
        Returns:
            dict: Ping response with round-trip time
        """
        if not self.is_connected:
            return {"status": "error", "error": "Not connected", "rtt": None}
            
        # Create ping request
        ping_request = {
            "id": f"ping_{int(time.time() * 1000)}",
            "type": "ping",
            "timestamp": time.time()
        }
        
        # Record start time
        start_time = time.time()
        
        # Send ping and wait for response
        response = await self.send_and_wait(ping_request, timeout=timeout)
        
        # Calculate round-trip time
        rtt = time.time() - start_time
        
        if not response or response.get("status") != "success":
            return {"status": "error", "error": "No valid response", "rtt": rtt}
            
        return {
            "status": "success",
            "rtt": rtt,
            "timestamp": time.time()
        }

# Utility function to create and start a bridge
async def create_enhanced_websocket_bridge(port=8765, host="127.0.0.1", enable_heartbeat=True):
    """
    Create and start an enhanced WebSocket bridge.
    
    Args:
        port: Port to use for WebSocket server
        host: Host to bind to
        enable_heartbeat: Whether to enable heartbeat mechanism
        
    Returns:
        EnhancedWebSocketBridge instance or None on failure
    """
    bridge = EnhancedWebSocketBridge(
        port=port,
        host=host,
        enable_heartbeat=enable_heartbeat
    )
    
    if await bridge.start():
        return bridge
    else:
        return None

# Test function for the bridge
async def test_enhanced_websocket_bridge():
    """Test EnhancedWebSocketBridge functionality."""
    bridge = await create_enhanced_websocket_bridge()
    if not bridge:
        logger.error("Failed to create enhanced bridge")
        return False
        
    try:
        logger.info("Enhanced WebSocket bridge created successfully")
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
        
        # Test ping
        logger.info("Testing ping...")
        ping_result = await bridge.ping()
        logger.info(f"Ping result: RTT={ping_result.get('rtt', 'N/A')}s")
        
        # Get connection stats
        logger.info("Connection statistics:")
        stats = bridge.get_stats()
        for key, value in stats.items():
            logger.info(f"  {key}: {value}")
        
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
    success = asyncio.run(test_enhanced_websocket_bridge())
    sys.exit(0 if success else 1)