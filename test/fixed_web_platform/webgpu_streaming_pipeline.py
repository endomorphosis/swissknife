#!/usr/bin/env python3
"""
WebGPU Streaming Pipeline - August 2025

This module implements a complete streaming pipeline for WebGPU-accelerated models,
connecting WebGPU streaming inference with WebSocket communication, memory management,
and integrated framework components.

Key features:
- End-to-end streaming framework from model to client
- Memory-efficient streaming for constrained environments
- WebSocket server with automatic reconnection and error handling
- Dashboard integration for metrics and visualization
- Auto-tuning of streaming parameters based on platform capabilities
- Robust error handling with graceful degradation

Usage:
    from fixed_web_platform.webgpu_streaming_pipeline import (
        WebGPUStreamingPipeline,
        create_streaming_pipeline,
        start_streaming_server
    )
    
    # Create a streaming pipeline
    pipeline = WebGPUStreamingPipeline(
        model_path="models/llama-7b",
        config={
            "quantization": "int4",
            "memory_limit_mb": 4096,
            "max_clients": 5,
            "auto_tune": True
        }
    )
    
    # Start streaming server in a separate thread
    server = pipeline.start_server(host="localhost", port=8765)
    
    # Or use the standalone server function
    await start_streaming_server(
        model_path="models/llama-7b",
        host="localhost", 
        port=8765,
        config={"quantization": "int4"}
    )
"""

import os
import sys
import json
import time
import math
import asyncio
import logging
import threading
import traceback
import socket
import websockets
from typing import Dict, List, Any, Optional, Union, Callable, Tuple, Set, Deque
from collections import deque
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor

# Import streaming inference module
from fixed_web_platform.webgpu_streaming_inference import (
    WebGPUStreamingInference,
    optimize_for_streaming
)

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Streaming pipeline configuration defaults
DEFAULT_CONFIG = {
    "quantization": "int4",             # Default to 4-bit quantization
    "memory_limit_mb": 4096,            # 4GB default memory limit
    "max_clients": 5,                   # Maximum simultaneous clients
    "auto_tune": True,                  # Auto-tune streaming parameters
    "latency_optimized": True,          # Optimize for low latency
    "adaptive_batch_size": True,        # Use adaptive batch sizing
    "max_batch_size": 8,                # Maximum batch size
    "queuing_enabled": True,            # Enable request queuing
    "max_queue_size": 10,               # Maximum queue size
    "request_timeout_sec": 300,         # Request timeout in seconds
    "metrics_enabled": True,            # Enable metrics collection
    "dashboard_integration": True,      # Enable dashboard integration
    "debug_mode": False                 # Enable debug mode
}

@dataclass
class StreamingRequest:
    """Represents a streaming request in the pipeline."""
    id: str
    prompt: str
    max_tokens: int
    temperature: float = 0.7
    stream_options: Dict[str, Any] = field(default_factory=dict)
    client: Any = None  # WebSocket client
    start_time: float = field(default_factory=time.time)
    status: str = "pending"  # pending, processing, completed, failed, cancelled
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert request to dictionary for serialization."""
        return {
            "id": self.id,
            "prompt": self.prompt,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "stream_options": self.stream_options,
            "start_time": self.start_time,
            "status": self.status,
            "waiting_time": time.time() - self.start_time if self.status == "pending" else 0
        }


class PipelineMetrics:
    """Collects and manages metrics for the streaming pipeline."""
    
    def __init__(self, metrics_enabled: bool = True):
        """Initialize pipeline metrics."""
        self.metrics_enabled = metrics_enabled
        self.reset()
    
    def reset(self):
        """Reset all metrics to initial state."""
        self.request_count = 0
        self.completed_count = 0
        self.cancelled_count = 0
        self.failed_count = 0
        self.queue_lengths = []
        self.request_wait_times = []
        self.request_processing_times = []
        self.tokens_generated = 0
        self.tokens_per_second = []
        self.memory_pressure_events = 0
        self.batch_size_history = []
        self.websocket_latencies = []
        self.error_counts = {}
        self.concurrent_clients_history = []
        self.start_time = time.time()
    
    def record_request(self):
        """Record a new request."""
        if not self.metrics_enabled:
            return
        
        self.request_count += 1
    
    def record_completion(self, processing_time: float, tokens: int):
        """Record a completed request."""
        if not self.metrics_enabled:
            return
        
        self.completed_count += 1
        self.request_processing_times.append(processing_time)
        self.tokens_generated += tokens
        
        if processing_time > 0:
            self.tokens_per_second.append(tokens / processing_time)
    
    def record_cancellation(self):
        """Record a cancelled request."""
        if not self.metrics_enabled:
            return
        
        self.cancelled_count += 1
    
    def record_failure(self, error: str):
        """Record a failed request."""
        if not self.metrics_enabled:
            return
        
        self.failed_count += 1
        
        # Track error categories
        if error not in self.error_counts:
            self.error_counts[error] = 0
        self.error_counts[error] += 1
    
    def record_queue_length(self, length: int):
        """Record the current queue length."""
        if not self.metrics_enabled:
            return
        
        self.queue_lengths.append(length)
    
    def record_wait_time(self, wait_time: float):
        """Record request wait time."""
        if not self.metrics_enabled:
            return
        
        self.request_wait_times.append(wait_time)
    
    def record_memory_pressure(self):
        """Record a memory pressure event."""
        if not self.metrics_enabled:
            return
        
        self.memory_pressure_events += 1
    
    def record_batch_size(self, batch_size: int):
        """Record the current batch size."""
        if not self.metrics_enabled:
            return
        
        self.batch_size_history.append(batch_size)
    
    def record_websocket_latency(self, latency_ms: float):
        """Record WebSocket latency."""
        if not self.metrics_enabled:
            return
        
        self.websocket_latencies.append(latency_ms)
    
    def record_concurrent_clients(self, count: int):
        """Record the number of concurrent clients."""
        if not self.metrics_enabled:
            return
        
        self.concurrent_clients_history.append(count)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get all metrics as a dictionary."""
        if not self.metrics_enabled:
            return {"metrics_enabled": False}
        
        runtime = time.time() - self.start_time
        
        # Calculate averages and summaries
        avg_wait_time = sum(self.request_wait_times) / max(1, len(self.request_wait_times))
        avg_processing_time = sum(self.request_processing_times) / max(1, len(self.request_processing_times))
        avg_queue_length = sum(self.queue_lengths) / max(1, len(self.queue_lengths))
        avg_batch_size = sum(self.batch_size_history) / max(1, len(self.batch_size_history))
        avg_tokens_per_second = sum(self.tokens_per_second) / max(1, len(self.tokens_per_second))
        avg_websocket_latency = sum(self.websocket_latencies) / max(1, len(self.websocket_latencies))
        avg_concurrent_clients = sum(self.concurrent_clients_history) / max(1, len(self.concurrent_clients_history))
        
        return {
            "metrics_enabled": True,
            "runtime_seconds": runtime,
            "request_counts": {
                "total": self.request_count,
                "completed": self.completed_count,
                "cancelled": self.cancelled_count,
                "failed": self.failed_count,
                "completion_rate": self.completed_count / max(1, self.request_count) * 100
            },
            "performance": {
                "avg_wait_time_sec": avg_wait_time,
                "avg_processing_time_sec": avg_processing_time,
                "avg_queue_length": avg_queue_length,
                "max_queue_length": max(self.queue_lengths) if self.queue_lengths else 0,
                "avg_batch_size": avg_batch_size,
                "total_tokens_generated": self.tokens_generated,
                "avg_tokens_per_second": avg_tokens_per_second,
                "tokens_per_minute": avg_tokens_per_second * 60,
                "requests_per_minute": self.request_count / (runtime / 60) if runtime > 0 else 0
            },
            "memory": {
                "memory_pressure_events": self.memory_pressure_events,
                "memory_pressure_rate": self.memory_pressure_events / max(1, self.request_count)
            },
            "websocket": {
                "avg_latency_ms": avg_websocket_latency,
                "max_latency_ms": max(self.websocket_latencies) if self.websocket_latencies else 0
            },
            "clients": {
                "avg_concurrent_clients": avg_concurrent_clients,
                "max_concurrent_clients": max(self.concurrent_clients_history) if self.concurrent_clients_history else 0
            },
            "errors": {
                "count": self.failed_count,
                "rate": self.failed_count / max(1, self.request_count) * 100,
                "categories": self.error_counts
            }
        }


class WebGPUStreamingPipeline:
    """
    Complete streaming pipeline for WebGPU-accelerated models.
    
    This class provides an end-to-end pipeline for streaming model inference,
    handling WebSocket communication, request queuing, memory management,
    and connection to the WebGPU streaming inference backend.
    """
    
    def __init__(self, model_path: str, config: Dict[str, Any] = None):
        """
        Initialize the WebGPU streaming pipeline.
        
        Args:
            model_path: Path to the model
            config: Configuration dictionary with the following options:
                - quantization: Quantization format (int2, int3, int4, int8, fp16)
                - memory_limit_mb: Memory limit in MB
                - max_clients: Maximum number of concurrent clients
                - auto_tune: Whether to auto-tune parameters
                - latency_optimized: Whether to optimize for low latency
                - adaptive_batch_size: Whether to use adaptive batch sizing
                - max_batch_size: Maximum batch size
                - queuing_enabled: Whether to enable request queuing
                - max_queue_size: Maximum queue size
                - request_timeout_sec: Request timeout in seconds
                - metrics_enabled: Whether to enable metrics collection
                - dashboard_integration: Whether to enable dashboard integration
                - debug_mode: Whether to enable debug mode
        """
        self.model_path = model_path
        
        # Merge with default configuration
        self.config = DEFAULT_CONFIG.copy()
        if config:
            self.config.update(config)
        
        # Initialize components
        self._initialize_pipeline()
        
        # Set up logging
        level = logging.DEBUG if self.config["debug_mode"] else logging.INFO
        logger.setLevel(level)
        
        # Success message
        logger.info(f"WebGPU Streaming Pipeline initialized with {self.config['quantization']} quantization")
        logger.info(f"Memory limit: {self.config['memory_limit_mb']}MB, Max clients: {self.config['max_clients']}")
    
    def _initialize_pipeline(self):
        """Initialize the pipeline components."""
        # Create optimized configuration for streaming inference
        inference_config = optimize_for_streaming({
            "quantization": self.config["quantization"],
            "memory_limit_mb": self.config["memory_limit_mb"],
            "latency_optimized": self.config["latency_optimized"],
            "adaptive_batch_size": self.config["adaptive_batch_size"],
            "max_batch_size": self.config["max_batch_size"]
        })
        
        # Initialize the streaming inference engine
        self.inference_engine = WebGPUStreamingInference(
            self.model_path,
            config=inference_config
        )
        
        # Initialize request queue
        self.request_queue = deque()
        self.active_clients = set()
        self.queue_lock = threading.Lock()
        
        # Initialize metrics
        self.metrics = PipelineMetrics(metrics_enabled=self.config["metrics_enabled"])
        
        # Initialize server state
        self.server = None
        self.server_task = None
        self.server_thread = None
        self.is_running = False
        self.shutdown_event = threading.Event()
        
        # Initialize request timeouts
        self.timeouts = {}
        
        # Initialize executor for background tasks
        self.executor = ThreadPoolExecutor(max_workers=5)
        
        # Set up dashboard integration if enabled
        if self.config["dashboard_integration"]:
            self._setup_dashboard_integration()
    
    def _setup_dashboard_integration(self):
        """Set up dashboard integration for metrics reporting."""
        try:
            # In a real implementation, this would set up connections to the metrics dashboard
            # For simulation, we'll just log that it would occur
            logger.info("Dashboard integration enabled - would connect to metrics system")
            
            # Schedule regular metrics updates
            def update_metrics_periodically():
                while self.is_running and not self.shutdown_event.is_set():
                    if self.config["metrics_enabled"]:
                        metrics = self.metrics.get_metrics()
                        logger.debug(f"Updated dashboard metrics: {len(active_clients)} clients, "
                                   f"{metrics['request_counts']['total']} total requests")
                    time.sleep(30)  # Update every 30 seconds
            
            # Start metrics update thread
            metrics_thread = threading.Thread(target=update_metrics_periodically)
            metrics_thread.daemon = True
            metrics_thread.start()
            
        except Exception as e:
            logger.warning(f"Failed to set up dashboard integration: {e}")
    
    def _check_auto_tune_parameters(self):
        """Check and auto-tune parameters based on system performance and memory usage."""
        if not self.config["auto_tune"]:
            return
        
        # Get metrics for auto-tuning
        if not self.config["metrics_enabled"]:
            return
        
        metrics = self.metrics.get_metrics()
        
        # Only auto-tune after collecting enough data
        if metrics["request_counts"]["total"] < 10:
            return
        
        # Auto-tune max_clients based on memory pressure
        memory_pressure_rate = metrics["memory"]["memory_pressure_rate"]
        if memory_pressure_rate > 0.2:  # More than 20% of requests experience memory pressure
            # Reduce max clients
            new_max_clients = max(1, self.config["max_clients"] - 1)
            if new_max_clients != self.config["max_clients"]:
                logger.info(f"Auto-tuning: Reducing max clients from {self.config['max_clients']} to {new_max_clients} "
                          f"due to memory pressure rate of {memory_pressure_rate:.2f}")
                self.config["max_clients"] = new_max_clients
        elif memory_pressure_rate < 0.05 and len(self.active_clients) >= self.config["max_clients"]:
            # Increase max clients if we're at the limit and memory pressure is low
            new_max_clients = self.config["max_clients"] + 1
            logger.info(f"Auto-tuning: Increasing max clients from {self.config['max_clients']} to {new_max_clients} "
                      f"due to low memory pressure rate of {memory_pressure_rate:.2f}")
            self.config["max_clients"] = new_max_clients
        
        # Auto-tune max_batch_size based on token generation rate
        if "batch_size_history" in dir(self.inference_engine):
            current_max_batch = self.config["max_batch_size"]
            actual_max_used = max(self.inference_engine._batch_size_history) if self.inference_engine._batch_size_history else 1
            
            if actual_max_used < current_max_batch - 2:
                # We're consistently using a much smaller batch size than allowed
                new_max_batch = max(1, actual_max_used + 1)
                logger.info(f"Auto-tuning: Reducing max batch size from {current_max_batch} to {new_max_batch} "
                          f"based on actual usage pattern")
                self.config["max_batch_size"] = new_max_batch
                
                # Update inference engine configuration
                self.inference_engine.config["max_batch_size"] = new_max_batch
            
        # Auto-tune request_timeout_sec based on processing times
        avg_processing_time = metrics["performance"]["avg_processing_time_sec"]
        if avg_processing_time > 0:
            # Set timeout to be 3x the average processing time, but at least 60 seconds
            # and at most 600 seconds (10 minutes)
            new_timeout = max(60, min(600, avg_processing_time * 3))
            if abs(new_timeout - self.config["request_timeout_sec"]) > 30:  # Only change if difference is significant
                logger.info(f"Auto-tuning: Adjusting request timeout from {self.config['request_timeout_sec']}s "
                          f"to {new_timeout}s based on average processing time")
                self.config["request_timeout_sec"] = new_timeout
    
    async def _process_request_queue(self):
        """Process the request queue asynchronously."""
        while self.is_running and not self.shutdown_event.is_set():
            try:
                # Auto-tune parameters if enabled
                if self.config["auto_tune"] and time.time() % 60 < 1:  # Check roughly every minute
                    self._check_auto_tune_parameters()
                
                # Process timeouts
                current_time = time.time()
                timeout_ids = []
                with self.queue_lock:
                    for request_id, timeout_time in self.timeouts.items():
                        if current_time > timeout_time:
                            timeout_ids.append(request_id)
                    
                    # Remove timed out requests
                    for request_id in timeout_ids:
                        self.timeouts.pop(request_id, None)
                        
                        # Find and remove the request from the queue
                        for i, request in enumerate(self.request_queue):
                            if request.id == request_id:
                                request.status = "cancelled"
                                self.request_queue.remove(request)
                                logger.warning(f"Request {request_id} timed out after {self.config['request_timeout_sec']}s")
                                
                                # Try to notify client
                                try:
                                    if request.client and not request.client.closed:
                                        await request.client.send(json.dumps({
                                            "type": "error",
                                            "message": "Request timed out",
                                            "request_id": request_id
                                        }))
                                except Exception:
                                    pass
                                
                                # Record metrics
                                self.metrics.record_cancellation()
                                break
                
                # Check if we can process more requests
                with self.queue_lock:
                    # Get active client count with proper locking
                    active_client_count = len(self.active_clients)
                    
                    # Record metrics
                    self.metrics.record_concurrent_clients(active_client_count)
                    self.metrics.record_queue_length(len(self.request_queue))
                    
                    # Check if we're at capacity
                    if active_client_count >= self.config["max_clients"]:
                        # At capacity, wait before checking again
                        await asyncio.sleep(0.1)
                        continue
                    
                    # Check if there are requests to process
                    if not self.request_queue:
                        # Empty queue, wait before checking again
                        await asyncio.sleep(0.1)
                        continue
                    
                    # Get the next request
                    request = self.request_queue.popleft()
                    
                    # Update request status
                    request.status = "processing"
                    
                    # Remove from timeouts
                    self.timeouts.pop(request.id, None)
                    
                    # Calculate wait time
                    wait_time = time.time() - request.start_time
                    self.metrics.record_wait_time(wait_time)
                    
                    # Add to active clients
                    if request.client:
                        self.active_clients.add(request.client)
                
                # Process the request outside the lock
                logger.info(f"Processing request {request.id} after {wait_time:.2f}s wait")
                
                # Start timing the processing
                processing_start_time = time.time()
                
                try:
                    # Process the request using streaming inference
                    if request.client and not request.client.closed:
                        # Stream tokens to the client
                        await self.inference_engine.stream_websocket(
                            request.client,
                            request.prompt,
                            request.max_tokens,
                            request.temperature,
                            request.stream_options
                        )
                        
                        # Calculate processing time and record metrics
                        processing_time = time.time() - processing_start_time
                        self.metrics.record_completion(
                            processing_time,
                            self.inference_engine._tokens_generated
                        )
                        
                        # Record batch size history
                        if hasattr(self.inference_engine, "_current_batch_size"):
                            self.metrics.record_batch_size(self.inference_engine._current_batch_size)
                        
                        # Record memory pressure events
                        if hasattr(self.inference_engine, "_token_generation_stats"):
                            self.metrics.record_memory_pressure(
                                self.inference_engine._token_generation_stats.get("memory_pressure_events", 0)
                            )
                        
                        logger.info(f"Completed request {request.id} in {processing_time:.2f}s, "
                                 f"generated {self.inference_engine._tokens_generated} tokens")
                except Exception as e:
                    # Record failure
                    error_type = type(e).__name__
                    self.metrics.record_failure(error_type)
                    
                    logger.error(f"Error processing request {request.id}: {e}")
                    logger.debug(traceback.format_exc())
                    
                    # Try to notify client
                    try:
                        if request.client and not request.client.closed:
                            await request.client.send(json.dumps({
                                "type": "error",
                                "message": str(e),
                                "request_id": request.id,
                                "error_type": error_type
                            }))
                    except Exception:
                        pass
                finally:
                    # Remove from active clients
                    with self.queue_lock:
                        if request.client:
                            self.active_clients.discard(request.client)
                
            except Exception as e:
                logger.error(f"Error in queue processing: {e}")
                logger.debug(traceback.format_exc())
                await asyncio.sleep(1)  # Wait before trying again
    
    def enqueue_request(self, request: StreamingRequest) -> bool:
        """
        Enqueue a request for processing.
        
        Args:
            request: The streaming request to enqueue
            
        Returns:
            True if enqueued successfully, False if queue is full
        """
        with self.queue_lock:
            # Check if queue is full
            if len(self.request_queue) >= self.config["max_queue_size"]:
                return False
            
            # Add to queue
            self.request_queue.append(request)
            
            # Set timeout
            self.timeouts[request.id] = time.time() + self.config["request_timeout_sec"]
            
            # Record metrics
            self.metrics.record_request()
            self.metrics.record_queue_length(len(self.request_queue))
            
            logger.info(f"Enqueued request {request.id}, queue length: {len(self.request_queue)}")
            
            return True
    
    def cancel_request(self, request_id: str) -> bool:
        """
        Cancel a queued request.
        
        Args:
            request_id: The ID of the request to cancel
            
        Returns:
            True if request was found and cancelled, False otherwise
        """
        with self.queue_lock:
            # Find the request in the queue
            for i, request in enumerate(self.request_queue):
                if request.id == request_id:
                    # Remove from queue
                    self.request_queue.remove(request)
                    
                    # Remove from timeouts
                    self.timeouts.pop(request_id, None)
                    
                    # Update status
                    request.status = "cancelled"
                    
                    # Record metrics
                    self.metrics.record_cancellation()
                    
                    logger.info(f"Cancelled request {request_id}")
                    
                    return True
            
            # Request not found
            return False
    
    def get_queue_status(self) -> Dict[str, Any]:
        """
        Get the current queue status.
        
        Returns:
            Dictionary with queue statistics
        """
        with self.queue_lock:
            # Create status report
            status = {
                "queue_length": len(self.request_queue),
                "active_clients": len(self.active_clients),
                "max_clients": self.config["max_clients"],
                "max_queue_size": self.config["max_queue_size"],
                "queued_requests": [request.to_dict() for request in self.request_queue],
                "estimated_wait_time": len(self.request_queue) * 5  # Rough estimate: 5 seconds per request
            }
            
            # Add recent metrics if available
            if self.config["metrics_enabled"]:
                metrics = self.metrics.get_metrics()
                if metrics["request_counts"]["total"] > 0:
                    status["avg_processing_time"] = metrics["performance"]["avg_processing_time_sec"]
                    status["avg_wait_time"] = metrics["performance"]["avg_wait_time_sec"]
                    status["avg_tokens_per_second"] = metrics["performance"]["avg_tokens_per_second"]
                    status["estimated_wait_time"] = len(self.request_queue) * metrics["performance"]["avg_processing_time_sec"]
            
            return status
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get pipeline metrics.
        
        Returns:
            Dictionary with pipeline metrics
        """
        return self.metrics.get_metrics()
    
    async def handle_websocket(self, websocket, path: str):
        """
        Handle a WebSocket connection for a streaming request.
        
        Args:
            websocket: The WebSocket connection
            path: The connection path
        """
        client_info = {
            "id": id(websocket),
            "path": path,
            "remote": websocket.remote_address if hasattr(websocket, "remote_address") else None,
            "connect_time": time.time()
        }
        logger.info(f"New WebSocket connection from {client_info['remote']}")
        
        try:
            # Receive initial request
            request_data = await websocket.recv()
            request_json = json.loads(request_data)
            
            # Extract request parameters
            request_id = request_json.get("id", f"req_{int(time.time())}_{id(websocket)}")
            prompt = request_json.get("prompt", "")
            max_tokens = request_json.get("max_tokens", 100)
            temperature = request_json.get("temperature", 0.7)
            stream_options = request_json.get("stream_options", {})
            
            # Validate request
            if not prompt:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Prompt is required",
                    "request_id": request_id
                }))
                return
            
            # Create streaming request
            request = StreamingRequest(
                id=request_id,
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stream_options=stream_options,
                client=websocket
            )
            
            # Get queue status before enqueueing
            queue_status = self.get_queue_status()
            
            # Send initial message with queue information
            await websocket.send(json.dumps({
                "type": "queued",
                "request_id": request_id,
                "queue_position": queue_status["queue_length"] + 1,
                "estimated_wait_time": queue_status["estimated_wait_time"],
                "timestamp": time.time()
            }))
            
            # Enqueue the request
            success = self.enqueue_request(request)
            
            if not success:
                # Queue is full, reject the request
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Queue is full, please try again later",
                    "request_id": request_id,
                    "queue_status": queue_status
                }))
                return
            
            # Request is enqueued, now wait for completion
            # The queue processor will handle the actual streaming
            while True:
                # Wait for client messages (like cancellation)
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    
                    # Process client messages
                    try:
                        message_json = json.loads(message)
                        message_type = message_json.get("type", "")
                        
                        if message_type == "cancel":
                            # Cancel the request
                            success = self.cancel_request(request_id)
                            
                            if success:
                                await websocket.send(json.dumps({
                                    "type": "cancelled",
                                    "request_id": request_id,
                                    "timestamp": time.time()
                                }))
                                return
                        
                        elif message_type == "ping":
                            # Respond to ping
                            await websocket.send(json.dumps({
                                "type": "pong",
                                "request_id": request_id,
                                "timestamp": time.time()
                            }))
                        
                        elif message_type == "status":
                            # Provide status update
                            queue_status = self.get_queue_status()
                            
                            # Find this request in the queue
                            position = 0
                            for i, queued_req in enumerate(queue_status["queued_requests"]):
                                if queued_req["id"] == request_id:
                                    position = i + 1
                                    break
                            
                            await websocket.send(json.dumps({
                                "type": "status",
                                "request_id": request_id,
                                "queue_position": position,
                                "estimated_wait_time": queue_status["estimated_wait_time"] if position > 0 else 0,
                                "queue_length": queue_status["queue_length"],
                                "active_clients": queue_status["active_clients"],
                                "timestamp": time.time()
                            }))
                    
                    except json.JSONDecodeError:
                        # Invalid JSON, ignore
                        pass
                    except Exception as e:
                        logger.warning(f"Error processing client message: {e}")
                
                except asyncio.TimeoutError:
                    # No message received, continue
                    pass
                except websockets.exceptions.ConnectionClosed:
                    # Connection closed by client
                    logger.info(f"WebSocket connection closed by client, cancelling request {request_id}")
                    self.cancel_request(request_id)
                    return
                
                # Check if the connection is in active clients
                with self.queue_lock:
                    if websocket in self.active_clients:
                        # Being processed, wait for completion
                        await asyncio.sleep(0.1)
                    elif not any(req.id == request_id for req in self.request_queue):
                        # Not in queue and not in active clients - must be done or cancelled
                        break
                    else:
                        # Still in queue, continue waiting
                        pass
        
        except json.JSONDecodeError:
            # Invalid JSON request
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON request"
            }))
        except Exception as e:
            # General error handling
            logger.error(f"Error handling WebSocket connection: {e}")
            logger.debug(traceback.format_exc())
            
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Internal server error: {str(e)}"
                }))
            except:
                pass
    
    async def start_server_async(self, host: str = "localhost", port: int = 8765):
        """
        Start the WebSocket server asynchronously.
        
        Args:
            host: Host to bind the server to
            port: Port to bind the server to
        """
        # Reset server state
        self.is_running = True
        self.shutdown_event.clear()
        
        # Start queue processor
        queue_processor_task = asyncio.create_task(self._process_request_queue())
        
        # Define server stop handler for proper shutdown
        def server_close_handler():
            logger.info("Server is shutting down...")
            self.is_running = False
            self.shutdown_event.set()
        
        # Start WebSocket server
        try:
            # Create server with proper stop handler
            self.server = await websockets.serve(
                self.handle_websocket,
                host,
                port,
                ping_interval=30,
                ping_timeout=10
            )
            
            # Set close handler
            self.server._close_callback = server_close_handler
            
            # Log startup
            logger.info(f"WebSocket streaming server started at ws://{host}:{port}")
            
            # Wait for server shutdown
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"Error starting WebSocket server: {e}")
            logger.debug(traceback.format_exc())
            
            self.is_running = False
            self.shutdown_event.set()
            raise
        
        finally:
            # Ensure queue processor is stopped
            queue_processor_task.cancel()
            
            # Wait for it to complete
            try:
                await queue_processor_task
            except asyncio.CancelledError:
                pass
            
            # Clean up
            self.is_running = False
            logger.info("WebSocket server and queue processor stopped")
    
    def start_server(self, host: str = "localhost", port: int = 8765) -> threading.Thread:
        """
        Start the WebSocket server in a background thread.
        
        Args:
            host: Host to bind the server to
            port: Port to bind the server to
            
        Returns:
            Thread running the server
        """
        # Define thread function
        def run_server():
            # Create new event loop for the thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Start server in the loop
            try:
                loop.run_until_complete(self.start_server_async(host, port))
            except Exception as e:
                logger.error(f"Server error: {e}")
            finally:
                loop.close()
        
        # Create and start thread
        self.server_thread = threading.Thread(target=run_server)
        self.server_thread.daemon = True  # Daemon thread will die when the main thread exits
        self.server_thread.start()
        
        # Return the thread for reference
        return self.server_thread
    
    def stop_server(self):
        """Stop the WebSocket server."""
        logger.info("Stopping WebSocket server...")
        
        # Signal shutdown
        self.is_running = False
        self.shutdown_event.set()
        
        # Close server if running
        if self.server:
            asyncio.run(self.server.close())
            self.server = None
        
        # Wait for thread to complete if it exists
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=5)
            if self.server_thread.is_alive():
                logger.warning("Server thread did not terminate gracefully")
        
        # Clear resources
        with self.queue_lock:
            self.request_queue.clear()
            self.active_clients.clear()
            self.timeouts.clear()
        
        logger.info("WebSocket server stopped")


async def start_streaming_server(model_path: str, host: str = "localhost", port: int = 8765, 
                               config: Dict[str, Any] = None):
    """
    Start a streaming server with the given configuration.
    
    Args:
        model_path: Path to the model
        host: Host to bind the server to
        port: Port to bind the server to
        config: Configuration dictionary
    """
    # Create pipeline
    pipeline = WebGPUStreamingPipeline(model_path, config)
    
    # Start server
    await pipeline.start_server_async(host, port)


def create_streaming_pipeline(model_path: str, config: Dict[str, Any] = None) -> WebGPUStreamingPipeline:
    """
    Create a streaming pipeline with the given configuration.
    
    Args:
        model_path: Path to the model
        config: Configuration dictionary
        
    Returns:
        Configured WebGPUStreamingPipeline instance
    """
    return WebGPUStreamingPipeline(model_path, config)


if __name__ == "__main__":
    print("WebGPU Streaming Pipeline")
    print("========================")
    
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description="Start WebGPU Streaming Pipeline server")
    parser.add_argument("--model", default="models/llama-7b", help="Path to the model")
    parser.add_argument("--host", default="localhost", help="Host to bind the server to")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind the server to")
    parser.add_argument("--quantization", default="int4", choices=["int2", "int3", "int4", "int8", "fp16"],
                       help="Quantization format to use")
    parser.add_argument("--memory-limit", type=int, default=4096, help="Memory limit in MB")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    
    args = parser.parse_args()
    
    # Create configuration
    config = {
        "quantization": args.quantization,
        "memory_limit_mb": args.memory_limit,
        "debug_mode": args.debug
    }
    
    # Create and start pipeline
    pipeline = WebGPUStreamingPipeline(args.model, config)
    
    # Run server
    try:
        asyncio.run(pipeline.start_server_async(args.host, args.port))
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    finally:
        pipeline.stop_server()