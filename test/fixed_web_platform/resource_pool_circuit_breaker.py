#!/usr/bin/env python3
"""
Circuit Breaker Pattern for WebNN/WebGPU Resource Pool Integration

This module implements the circuit breaker pattern for browser connections in the
WebGPU/WebNN resource pool, providing:

1. Automatic detection of unhealthy browser connections
2. Graceful degradation when connection failures are detected
3. Automatic recovery of failed connections
4. Intelligent retry mechanisms with exponential backoff
5. Comprehensive health monitoring for browser connections
6. Detailed telemetry for connection health status

Core features:
- Connection health metrics collection and analysis
- Configurable circuit breaker parameters
- Progressive recovery with staged testing
- Automatic service discovery for new browser instances
- Comprehensive logging and monitoring integration
"""

from typing import Dict, List, Any, Optional, Union, Tuple, Set, Callable, TypeVar, Generic, Awaitable

import os
import sys
import time
import json
import enum
import math
import random
import logging
import asyncio
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union, Tuple, Set, Callable

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CircuitState(enum.Enum):
    """Circuit breaker state enum."""
    CLOSED = "CLOSED"        # Normal operation - requests flow through
    OPEN = "OPEN"            # Circuit is open - fast fail for all requests
    HALF_OPEN = "HALF_OPEN"  # Testing if service has recovered - limited requests

class BrowserHealthMetrics:
    """Class to track and analyze browser connection health metrics."""
    
    def __init__(self, connection_id: str):
        """
        Initialize browser health metrics tracker.
        
        Args:
            connection_id: Unique identifier for the browser connection
        """
        self.connection_id = connection_id
        
        # Connection performance metrics
        self.response_times = []
        self.error_count = 0
        self.success_count = 0
        self.consecutive_failures = 0
        self.consecutive_successes = 0
        
        # Resource metrics
        self.memory_usage_history = []
        self.cpu_usage_history = []
        self.gpu_usage_history = []
        
        # WebSocket metrics
        self.ping_times = []
        self.connection_drops = 0
        self.reconnection_attempts = 0
        self.reconnection_successes = 0
        
        # Model-specific metrics
        self.model_performance = {}
        
        # Timestamps
        self.created_at = time.time()
        self.last_updated = time.time()
        self.last_error_time = 0
        self.last_success_time = time.time()
        
        # Health score
        self.health_score = 100.0  # Start with perfect health
        
    def record_response_time(self, response_time_ms: float):
        """
        Record a response time measurement.
        
        Args:
            response_time_ms: Response time in milliseconds
        """
        self.response_times.append(response_time_ms)
        
        # Keep only the last 100 measurements
        if len(self.response_times) > 100:
            self.response_times = self.response_times[-100:]
            
        self.last_updated = time.time()
        
    def record_success(self):
        """Record a successful operation."""
        self.success_count += 1
        self.consecutive_successes += 1
        self.consecutive_failures = 0
        self.last_success_time = time.time()
        self.last_updated = time.time()
        
    def record_error(self, error_type: str):
        """
        Record an operation error.
        
        Args:
            error_type: Type of error encountered
        """
        self.error_count += 1
        self.consecutive_failures += 1
        self.consecutive_successes = 0
        self.last_error_time = time.time()
        self.last_updated = time.time()
        
    def record_resource_usage(self, memory_mb: float, cpu_percent: float, gpu_percent: Optional[float] = None):
        """
        Record resource usage measurements.
        
        Args:
            memory_mb: Memory usage in MB
            cpu_percent: CPU usage percentage
            gpu_percent: GPU usage percentage (if available)
        """
        timestamp = time.time()
        
        self.memory_usage_history.append((timestamp, memory_mb))
        self.cpu_usage_history.append((timestamp, cpu_percent))
        
        if gpu_percent is not None:
            self.gpu_usage_history.append((timestamp, gpu_percent))
            
        # Keep only the last 100 measurements
        if len(self.memory_usage_history) > 100:
            self.memory_usage_history = self.memory_usage_history[-100:]
        if len(self.cpu_usage_history) > 100:
            self.cpu_usage_history = self.cpu_usage_history[-100:]
        if len(self.gpu_usage_history) > 100:
            self.gpu_usage_history = self.gpu_usage_history[-100:]
            
        self.last_updated = timestamp
        
    def record_ping(self, ping_time_ms: float):
        """
        Record WebSocket ping time.
        
        Args:
            ping_time_ms: Ping time in milliseconds
        """
        self.ping_times.append(ping_time_ms)
        
        # Keep only the last 100 measurements
        if len(self.ping_times) > 100:
            self.ping_times = self.ping_times[-100:]
            
        self.last_updated = time.time()
        
    def record_connection_drop(self):
        """Record a WebSocket connection drop."""
        self.connection_drops += 1
        self.last_updated = time.time()
        
    def record_reconnection_attempt(self, success: bool):
        """
        Record a reconnection attempt.
        
        Args:
            success: Whether the reconnection was successful
        """
        self.reconnection_attempts += 1
        if success:
            self.reconnection_successes += 1
        self.last_updated = time.time()
        
    def record_model_performance(self, model_name: str, inference_time_ms: float, success: bool):
        """
        Record model-specific performance metrics.
        
        Args:
            model_name: Name of the model
            inference_time_ms: Inference time in milliseconds
            success: Whether the inference was successful
        """
        if model_name not in self.model_performance:
            self.model_performance[model_name] = {
                "inference_times": [],
                "success_count": 0,
                "error_count": 0
            }
            
        self.model_performance[model_name]["inference_times"].append(inference_time_ms)
        
        # Keep only the last 100 measurements
        if len(self.model_performance[model_name]["inference_times"]) > 100:
            self.model_performance[model_name]["inference_times"] = self.model_performance[model_name]["inference_times"][-100:]
            
        if success:
            self.model_performance[model_name]["success_count"] += 1
        else:
            self.model_performance[model_name]["error_count"] += 1
            
        self.last_updated = time.time()
        
    def calculate_health_score(self) -> float:
        """
        Calculate a health score for the connection based on all metrics.
        
        A score of 100 is perfect health, 0 is completely unhealthy.
        
        Returns:
            Health score from 0-100
        """
        factors = []
        
        # Factor 1: Error rate
        total_operations = max(1, self.success_count + self.error_count)
        error_rate = self.error_count / total_operations
        error_factor = max(0, 100 - (error_rate * 100 * 2))  # Heavily penalize errors
        factors.append(error_factor)
        
        # Factor 2: Response time
        if self.response_times:
            avg_response_time = sum(self.response_times) / len(self.response_times)
            # Penalize response times over 100ms
            response_factor = max(0, 100 - (avg_response_time - 100) / 10)
            factors.append(response_factor)
            
        # Factor 3: Consecutive failures
        consecutive_failure_factor = max(0, 100 - (self.consecutive_failures * 15))
        factors.append(consecutive_failure_factor)
        
        # Factor 4: Connection drops
        connection_drop_factor = max(0, 100 - (self.connection_drops * 20))
        factors.append(connection_drop_factor)
        
        # Factor 5: Resource usage (if available)
        if self.memory_usage_history:
            latest_memory = self.memory_usage_history[-1][1]
            memory_factor = max(0, 100 - (latest_memory / 20))  # Penalize high memory usage
            factors.append(memory_factor)
            
        # Factor 6: Ping time (if available)
        if self.ping_times:
            avg_ping = sum(self.ping_times) / len(self.ping_times)
            ping_factor = max(0, 100 - (avg_ping - 20) / 2)  # Penalize high ping times
            factors.append(ping_factor)
            
        # Average all factors
        if factors:
            health_score = sum(factors) / len(factors)
        else:
            health_score = 100.0  # Default if no metrics
            
        self.health_score = health_score
        return health_score
        
    def get_summary(self) -> Dict[str, Any]:
        """
        Get a summary of health metrics.
        
        Returns:
            Dict with health metric summary
        """
        health_score = self.calculate_health_score()
        
        avg_response_time = None
        if self.response_times:
            avg_response_time = sum(self.response_times) / len(self.response_times)
            
        avg_ping = None
        if self.ping_times:
            avg_ping = sum(self.ping_times) / len(self.ping_times)
            
        latest_memory = None
        if self.memory_usage_history:
            latest_memory = self.memory_usage_history[-1][1]
            
        latest_cpu = None
        if self.cpu_usage_history:
            latest_cpu = self.cpu_usage_history[-1][1]
            
        latest_gpu = None
        if self.gpu_usage_history:
            latest_gpu = self.gpu_usage_history[-1][1]
            
        return {
            "connection_id": self.connection_id,
            "health_score": health_score,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "error_rate": self.error_count / max(1, self.success_count + self.error_count),
            "consecutive_failures": self.consecutive_failures,
            "consecutive_successes": self.consecutive_successes,
            "avg_response_time_ms": avg_response_time,
            "avg_ping_ms": avg_ping,
            "connection_drops": self.connection_drops,
            "reconnection_attempts": self.reconnection_attempts,
            "reconnection_success_rate": self.reconnection_successes / max(1, self.reconnection_attempts),
            "memory_usage_mb": latest_memory,
            "cpu_usage_percent": latest_cpu,
            "gpu_usage_percent": latest_gpu,
            "age_seconds": time.time() - self.created_at,
            "last_updated_seconds_ago": time.time() - self.last_updated,
            "last_error_seconds_ago": time.time() - self.last_error_time if self.last_error_time > 0 else None,
            "model_count": len(self.model_performance),
            "models": list(self.model_performance.keys())
        }

class ResourcePoolCircuitBreaker:
    """
    Circuit breaker implementation for WebNN/WebGPU resource pool.
    
    Implements the circuit breaker pattern for browser connections to provide:
    - Automatic detection of unhealthy connections
    - Graceful degradation when failures are detected
    - Automatic recovery with staged testing
    - Comprehensive health monitoring
    """
    
    def __init__(self, 
                 failure_threshold: int = 5, 
                 success_threshold: int = 3,
                 reset_timeout_seconds: int = 30,
                 half_open_max_requests: int = 3,
                 health_check_interval_seconds: int = 15,
                 min_health_score: float = 50.0):
        """
        Initialize circuit breaker.
        
        Args:
            failure_threshold: Number of consecutive failures to open circuit
            success_threshold: Number of consecutive successes to close circuit
            reset_timeout_seconds: Time in seconds before testing if service recovered
            half_open_max_requests: Maximum concurrent requests in half-open state
            health_check_interval_seconds: Interval between health checks
            min_health_score: Minimum health score for a connection to be considered healthy
        """
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.reset_timeout_seconds = reset_timeout_seconds
        self.half_open_max_requests = half_open_max_requests
        self.health_check_interval_seconds = health_check_interval_seconds
        self.min_health_score = min_health_score
        
        # Initialize circuit breakers for connections
        self.circuits: Dict[str, Dict[str, Any]] = {}
        
        # Initialize health metrics for connections
        self.health_metrics: Dict[str, BrowserHealthMetrics] = {}
        
        # Initialize locks for thread safety
        self.circuit_locks: Dict[str, asyncio.Lock] = {}
        
        # Initialize health check task
        self.health_check_task = None
        self.running = False
        
        logger.info("ResourcePoolCircuitBreaker initialized")
        
    def register_connection(self, connection_id: str):
        """
        Register a new connection with the circuit breaker.
        
        Args:
            connection_id: Unique identifier for the connection
        """
        # Initialize circuit in closed state
        self.circuits[connection_id] = {
            "state": CircuitState.CLOSED,
            "failures": 0,
            "successes": 0,
            "last_failure_time": 0,
            "last_success_time": time.time(),
            "last_state_change_time": time.time(),
            "half_open_requests": 0
        }
        
        # Initialize health metrics
        self.health_metrics[connection_id] = BrowserHealthMetrics(connection_id)
        
        # Initialize lock for thread safety
        self.circuit_locks[connection_id] = asyncio.Lock()
        
        logger.info(f"Registered connection {connection_id} with circuit breaker")
        
    def unregister_connection(self, connection_id: str):
        """
        Unregister a connection from the circuit breaker.
        
        Args:
            connection_id: Unique identifier for the connection
        """
        if connection_id in self.circuits:
            del self.circuits[connection_id]
        
        if connection_id in self.health_metrics:
            del self.health_metrics[connection_id]
            
        if connection_id in self.circuit_locks:
            del self.circuit_locks[connection_id]
            
        logger.info(f"Unregistered connection {connection_id} from circuit breaker")
        
    async def record_success(self, connection_id: str):
        """
        Record a successful operation for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
        """
        if connection_id not in self.circuits:
            logger.warning(f"Connection {connection_id} not registered with circuit breaker")
            return
            
        # Update health metrics
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_success()
            
        # Update circuit state
        async with self.circuit_locks[connection_id]:
            circuit = self.circuits[connection_id]
            circuit["successes"] += 1
            circuit["failures"] = 0
            circuit["last_success_time"] = time.time()
            
            # If circuit is half open and we have enough successes, close it
            if circuit["state"] == CircuitState.HALF_OPEN:
                circuit["half_open_requests"] = max(0, circuit["half_open_requests"] - 1)
                
                if circuit["successes"] >= self.success_threshold:
                    circuit["state"] = CircuitState.CLOSED
                    circuit["last_state_change_time"] = time.time()
                    logger.info(f"Circuit for connection {connection_id} closed after {circuit['successes']} consecutive successes")
        
    async def record_failure(self, connection_id: str, error_type: str):
        """
        Record a failed operation for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            error_type: Type of error encountered
        """
        if connection_id not in self.circuits:
            logger.warning(f"Connection {connection_id} not registered with circuit breaker")
            return
            
        # Update health metrics
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_error(error_type)
            
        # Update circuit state
        async with self.circuit_locks[connection_id]:
            circuit = self.circuits[connection_id]
            circuit["failures"] += 1
            circuit["successes"] = 0
            circuit["last_failure_time"] = time.time()
            
            # If circuit is closed and we have enough failures, open it
            if circuit["state"] == CircuitState.CLOSED and circuit["failures"] >= self.failure_threshold:
                circuit["state"] = CircuitState.OPEN
                circuit["last_state_change_time"] = time.time()
                logger.warning(f"Circuit for connection {connection_id} opened after {circuit['failures']} consecutive failures")
                
            # If circuit is half open, any failure opens it
            elif circuit["state"] == CircuitState.HALF_OPEN:
                circuit["state"] = CircuitState.OPEN
                circuit["last_state_change_time"] = time.time()
                circuit["half_open_requests"] = 0
                logger.warning(f"Circuit for connection {connection_id} reopened after failure in half-open state")
                
    async def record_response_time(self, connection_id: str, response_time_ms: float):
        """
        Record response time for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            response_time_ms: Response time in milliseconds
        """
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_response_time(response_time_ms)
            
    async def record_resource_usage(self, connection_id: str, memory_mb: float, cpu_percent: float, gpu_percent: Optional[float] = None):
        """
        Record resource usage for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            memory_mb: Memory usage in MB
            cpu_percent: CPU usage percentage
            gpu_percent: GPU usage percentage (if available)
        """
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_resource_usage(memory_mb, cpu_percent, gpu_percent)
            
    async def record_ping(self, connection_id: str, ping_time_ms: float):
        """
        Record WebSocket ping time for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            ping_time_ms: Ping time in milliseconds
        """
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_ping(ping_time_ms)
            
    async def record_connection_drop(self, connection_id: str):
        """
        Record WebSocket connection drop for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
        """
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_connection_drop()
            
        # Record failure to potentially trigger circuit opening
        await self.record_failure(connection_id, "connection_drop")
            
    async def record_reconnection_attempt(self, connection_id: str, success: bool):
        """
        Record reconnection attempt for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            success: Whether the reconnection was successful
        """
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_reconnection_attempt(success)
            
        # Record success or failure based on reconnection result
        if success:
            await self.record_success(connection_id)
        else:
            await self.record_failure(connection_id, "reconnection_failure")
            
    async def record_model_performance(self, connection_id: str, model_name: str, inference_time_ms: float, success: bool):
        """
        Record model-specific performance metrics for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            model_name: Name of the model
            inference_time_ms: Inference time in milliseconds
            success: Whether the inference was successful
        """
        if connection_id in self.health_metrics:
            self.health_metrics[connection_id].record_model_performance(model_name, inference_time_ms, success)
            
        # Record general success or failure
        if success:
            await self.record_success(connection_id)
        else:
            await self.record_failure(connection_id, "model_inference_failure")
            
    async def allow_request(self, connection_id: str) -> bool:
        """
        Check if a request should be allowed for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            
        Returns:
            True if request should be allowed, False otherwise
        """
        if connection_id not in self.circuits:
            logger.warning(f"Connection {connection_id} not registered with circuit breaker")
            return False
            
        async with self.circuit_locks[connection_id]:
            circuit = self.circuits[connection_id]
            current_time = time.time()
            
            # If circuit is closed, allow the request
            if circuit["state"] == CircuitState.CLOSED:
                return True
                
            # If circuit is open, check if reset timeout has elapsed
            elif circuit["state"] == CircuitState.OPEN:
                time_since_last_state_change = current_time - circuit["last_state_change_time"]
                
                # If reset timeout has elapsed, transition to half-open
                if time_since_last_state_change >= self.reset_timeout_seconds:
                    circuit["state"] = CircuitState.HALF_OPEN
                    circuit["last_state_change_time"] = current_time
                    circuit["half_open_requests"] = 0
                    circuit["successes"] = 0
                    circuit["failures"] = 0
                    logger.info(f"Circuit for connection {connection_id} transitioned to half-open state for testing")
                    
                    # Allow this request
                    circuit["half_open_requests"] += 1
                    return True
                else:
                    # Circuit is still open
                    return False
                    
            # If circuit is half-open, allow limited requests
            elif circuit["state"] == CircuitState.HALF_OPEN:
                # Check if we're already testing with maximum requests
                if circuit["half_open_requests"] < self.half_open_max_requests:
                    circuit["half_open_requests"] += 1
                    return True
                else:
                    return False
                    
        # Default fallback (shouldn't reach here)
        return False
        
    async def get_connection_state(self, connection_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the current state of a connection's circuit breaker.
        
        Args:
            connection_id: Unique identifier for the connection
            
        Returns:
            Dict with circuit state or None if connection not found
        """
        if connection_id not in self.circuits:
            return None
            
        circuit = self.circuits[connection_id]
        
        # Get health metrics
        health_summary = None
        if connection_id in self.health_metrics:
            health_summary = self.health_metrics[connection_id].get_summary()
            
        return {
            "connection_id": connection_id,
            "state": circuit["state"].value,
            "failures": circuit["failures"],
            "successes": circuit["successes"],
            "last_failure_time": circuit["last_failure_time"],
            "last_success_time": circuit["last_success_time"],
            "last_state_change_time": circuit["last_state_change_time"],
            "half_open_requests": circuit["half_open_requests"],
            "time_since_last_failure": time.time() - circuit["last_failure_time"] if circuit["last_failure_time"] > 0 else None,
            "time_since_last_success": time.time() - circuit["last_success_time"],
            "time_since_last_state_change": time.time() - circuit["last_state_change_time"],
            "health_metrics": health_summary
        }
        
    async def get_all_connection_states(self) -> Dict[str, Dict[str, Any]]:
        """
        Get the current state of all connection circuit breakers.
        
        Returns:
            Dict mapping connection IDs to circuit states
        """
        result = {}
        for connection_id in self.circuits.keys():
            result[connection_id] = await self.get_connection_state(connection_id)
        return result
        
    async def get_healthy_connections(self) -> List[str]:
        """
        Get a list of healthy connection IDs.
        
        Returns:
            List of healthy connection IDs
        """
        healthy_connections = []
        
        for connection_id, circuit in self.circuits.items():
            if circuit["state"] == CircuitState.CLOSED:
                # Check health score if available
                if connection_id in self.health_metrics:
                    health_score = self.health_metrics[connection_id].calculate_health_score()
                    if health_score >= self.min_health_score:
                        healthy_connections.append(connection_id)
                else:
                    # No health metrics, assume healthy if circuit is closed
                    healthy_connections.append(connection_id)
                    
        return healthy_connections
        
    async def reset_circuit(self, connection_id: str):
        """
        Reset circuit breaker state for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
        """
        if connection_id not in self.circuits:
            logger.warning(f"Connection {connection_id} not registered with circuit breaker")
            return
            
        async with self.circuit_locks[connection_id]:
            self.circuits[connection_id] = {
                "state": CircuitState.CLOSED,
                "failures": 0,
                "successes": 0,
                "last_failure_time": 0,
                "last_success_time": time.time(),
                "last_state_change_time": time.time(),
                "half_open_requests": 0
            }
            
        logger.info(f"Reset circuit for connection {connection_id}")
        
    async def run_health_checks(self, check_callback: Callable[[str], Awaitable[bool]]):
        """
        Run health checks for all connections.
        
        Args:
            check_callback: Async callback function that takes connection_id and returns bool
        """
        logger.info("Running health checks for all connections")
        
        for connection_id in list(self.circuits.keys()):
            try:
                # Skip health check if circuit is open and reset timeout hasn't elapsed
                circuit = self.circuits[connection_id]
                if circuit["state"] == CircuitState.OPEN:
                    time_since_last_state_change = time.time() - circuit["last_state_change_time"]
                    if time_since_last_state_change < self.reset_timeout_seconds:
                        logger.debug(f"Skipping health check for connection {connection_id} (circuit open)")
                        continue
                
                # Run health check callback
                result = await check_callback(connection_id)
                
                # Record result
                if result:
                    await self.record_success(connection_id)
                    logger.debug(f"Health check passed for connection {connection_id}")
                else:
                    await self.record_failure(connection_id, "health_check_failed")
                    logger.warning(f"Health check failed for connection {connection_id}")
                    
            except Exception as e:
                logger.error(f"Error running health check for connection {connection_id}: {e}")
                await self.record_failure(connection_id, "health_check_error")
                
    async def start_health_check_task(self, check_callback: Callable[[str], Awaitable[bool]]):
        """
        Start the health check task.
        
        Args:
            check_callback: Async callback function that takes connection_id and returns bool
        """
        if self.running:
            logger.warning("Health check task already running")
            return
            
        self.running = True
        
        async def health_check_loop():
            while self.running:
                try:
                    await self.run_health_checks(check_callback)
                except Exception as e:
                    logger.error(f"Error running health checks: {e}")
                
                # Wait for next check interval
                await asyncio.sleep(self.health_check_interval_seconds)
                
        # Start health check task
        self.health_check_task = asyncio.create_task(health_check_loop())
        logger.info(f"Health check task started (interval: {self.health_check_interval_seconds}s)")
        
    async def stop_health_check_task(self):
        """Stop the health check task."""
        if not self.running:
            return
            
        self.running = False
        
        if self.health_check_task:
            self.health_check_task.cancel()
            try:
                await self.health_check_task
            except asyncio.CancelledError:
                pass
            self.health_check_task = None
            
        logger.info("Health check task stopped")
        
    async def close(self):
        """Close the circuit breaker and release resources."""
        await self.stop_health_check_task()
        logger.info("Circuit breaker closed")


class ConnectionHealthChecker:
    """
    Health checker for WebNN/WebGPU browser connections.
    
    This class implements comprehensive health checks for browser connections,
    including WebSocket connectivity, browser responsiveness, and resource usage.
    """
    
    def __init__(self, circuit_breaker: ResourcePoolCircuitBreaker, browser_connections: Dict[str, Any]):
        """
        Initialize connection health checker.
        
        Args:
            circuit_breaker: ResourcePoolCircuitBreaker instance
            browser_connections: Dict mapping connection IDs to browser connection objects
        """
        self.circuit_breaker = circuit_breaker
        self.browser_connections = browser_connections
        
    async def check_connection_health(self, connection_id: str) -> bool:
        """
        Check health of a browser connection.
        
        Args:
            connection_id: Unique identifier for the connection
            
        Returns:
            True if connection is healthy, False otherwise
        """
        if connection_id not in self.browser_connections:
            logger.warning(f"Connection {connection_id} not found in browser connections")
            return False
            
        connection = self.browser_connections[connection_id]
        
        try:
            # Check if connection is active
            if not connection.get("active", False):
                logger.debug(f"Connection {connection_id} not active")
                return True  # Not active connections are considered healthy
                
            # Get bridge object
            bridge = connection.get("bridge")
            if not bridge:
                logger.warning(f"Connection {connection_id} has no bridge object")
                return False
                
            # Check WebSocket connection
            if not bridge.is_connected:
                logger.warning(f"Connection {connection_id} WebSocket not connected")
                return False
                
            # Send health check ping
            start_time = time.time()
            response = await bridge.send_and_wait({
                "id": f"health_check_{int(time.time() * 1000)}",
                "type": "health_check",
                "timestamp": int(time.time() * 1000)
            }, timeout=5.0, retry_attempts=1)
            
            # Calculate ping time
            ping_time_ms = (time.time() - start_time) * 1000
            
            # Record ping time
            await self.circuit_breaker.record_ping(connection_id, ping_time_ms)
            
            # Check response
            if not response or response.get("status") != "success":
                logger.warning(f"Connection {connection_id} health check failed: {response}")
                return False
                
            # Get resource usage from response
            if "resource_usage" in response:
                resource_usage = response["resource_usage"]
                memory_mb = resource_usage.get("memory_mb", 0)
                cpu_percent = resource_usage.get("cpu_percent", 0)
                gpu_percent = resource_usage.get("gpu_percent")
                
                # Record resource usage
                await self.circuit_breaker.record_resource_usage(
                    connection_id, memory_mb, cpu_percent, gpu_percent
                )
                
                # Check for memory usage threshold (warning only, don't fail health check)
                if memory_mb > 1000:  # 1GB threshold
                    logger.warning(f"Connection {connection_id} high memory usage: {memory_mb:.1f} MB")
                    
            return True
            
        except Exception as e:
            logger.error(f"Error checking health for connection {connection_id}: {e}")
            return False
            
    async def check_all_connections(self) -> Dict[str, bool]:
        """
        Check health of all browser connections.
        
        Returns:
            Dict mapping connection IDs to health status
        """
        results = {}
        
        for connection_id in self.browser_connections.keys():
            try:
                health_status = await self.check_connection_health(connection_id)
                results[connection_id] = health_status
                
                # Record result with circuit breaker
                if health_status:
                    await self.circuit_breaker.record_success(connection_id)
                else:
                    await self.circuit_breaker.record_failure(connection_id, "health_check_failed")
                    
            except Exception as e:
                logger.error(f"Error checking health for connection {connection_id}: {e}")
                results[connection_id] = False
                await self.circuit_breaker.record_failure(connection_id, "health_check_error")
                
        return results
        
    async def get_connection_health_summary(self) -> Dict[str, Dict[str, Any]]:
        """
        Get health summary for all browser connections.
        
        Returns:
            Dict mapping connection IDs to health summaries
        """
        results = {}
        
        for connection_id in self.browser_connections.keys():
            # Get circuit state
            circuit_state = await self.circuit_breaker.get_connection_state(connection_id)
            
            # Get connection details
            connection = self.browser_connections[connection_id]
            
            # Build health summary
            results[connection_id] = {
                "connection_id": connection_id,
                "browser": connection.get("browser", "unknown"),
                "platform": connection.get("platform", "unknown"),
                "active": connection.get("active", False),
                "is_simulation": connection.get("is_simulation", True),
                "circuit_state": circuit_state["state"] if circuit_state else "UNKNOWN",
                "health_score": circuit_state["health_metrics"]["health_score"] if circuit_state and "health_metrics" in circuit_state else 0,
                "connection_drops": circuit_state["health_metrics"]["connection_drops"] if circuit_state and "health_metrics" in circuit_state else 0,
                "reconnection_attempts": circuit_state["health_metrics"]["reconnection_attempts"] if circuit_state and "health_metrics" in circuit_state else 0,
                "last_error_seconds_ago": circuit_state["health_metrics"]["last_error_seconds_ago"] if circuit_state and "health_metrics" in circuit_state else None,
                "initialized_models": list(connection.get("initialized_models", set())),
                "compute_shaders": connection.get("compute_shaders", False),
                "precompile_shaders": connection.get("precompile_shaders", False),
                "parallel_loading": connection.get("parallel_loading", False)
            }
            
        return results


# Define error categories for circuit breaker
class ConnectionErrorCategory(enum.Enum):
    """Error categories for connection failures."""
    TIMEOUT = "timeout"               # Request timeout
    CONNECTION_CLOSED = "connection_closed"  # WebSocket connection closed
    INITIALIZATION = "initialization"  # Error during initialization
    INFERENCE = "inference"           # Error during inference
    WEBSOCKET = "websocket"           # WebSocket communication error
    BROWSER = "browser"               # Browser-specific error
    RESOURCE = "resource"             # Resource-related error (memory, CPU)
    UNKNOWN = "unknown"               # Unknown error


class ConnectionRecoveryStrategy:
    """
    Recovery strategy for browser connections.
    
    This class implements various recovery strategies for browser connections,
    including reconnection, browser restart, and graceful degradation.
    """
    
    def __init__(self, circuit_breaker: ResourcePoolCircuitBreaker):
        """
        Initialize connection recovery strategy.
        
        Args:
            circuit_breaker: ResourcePoolCircuitBreaker instance
        """
        self.circuit_breaker = circuit_breaker
        
    async def recover_connection(self, connection_id: str, connection: Dict[str, Any], error_category: ConnectionErrorCategory) -> bool:
        """
        Attempt to recover a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            error_category: Category of error that occurred
            
        Returns:
            True if recovery was successful, False otherwise
        """
        logger.info(f"Attempting to recover connection {connection_id} from {error_category.value} error")
        
        # Get circuit state
        circuit_state = await self.circuit_breaker.get_connection_state(connection_id)
        
        if not circuit_state:
            logger.warning(f"Connection {connection_id} not registered with circuit breaker")
            return False
            
        # Choose recovery strategy based on error category and circuit state
        if error_category == ConnectionErrorCategory.TIMEOUT:
            return await self._recover_from_timeout(connection_id, connection, circuit_state)
            
        elif error_category == ConnectionErrorCategory.CONNECTION_CLOSED:
            return await self._recover_from_connection_closed(connection_id, connection, circuit_state)
            
        elif error_category == ConnectionErrorCategory.WEBSOCKET:
            return await self._recover_from_websocket_error(connection_id, connection, circuit_state)
            
        elif error_category == ConnectionErrorCategory.RESOURCE:
            return await self._recover_from_resource_error(connection_id, connection, circuit_state)
            
        elif error_category in [ConnectionErrorCategory.INITIALIZATION, ConnectionErrorCategory.INFERENCE]:
            return await self._recover_from_operation_error(connection_id, connection, circuit_state, error_category)
            
        else:  # BROWSER, UNKNOWN, etc.
            return await self._recover_from_unknown_error(connection_id, connection, circuit_state)
            
    async def _recover_from_timeout(self, connection_id: str, connection: Dict[str, Any], circuit_state: Dict[str, Any]) -> bool:
        """
        Recover from timeout error.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            circuit_state: Current circuit state
            
        Returns:
            True if recovery was successful, False otherwise
        """
        # For timeout errors, first try a simple WebSocket ping
        try:
            bridge = connection.get("bridge")
            if not bridge:
                logger.warning(f"Connection {connection_id} has no bridge object")
                return False
                
            # Send ping
            ping_success = await bridge.send_message({
                "id": f"recovery_ping_{int(time.time() * 1000)}",
                "type": "ping",
                "timestamp": int(time.time() * 1000)
            }, timeout=3.0, retry_attempts=1)
            
            if ping_success:
                logger.info(f"Connection {connection_id} recovered from timeout error (ping successful)")
                
                # Reset consecutive failures since ping was successful
                circuit = self.circuit_breaker.circuits[connection_id]
                circuit["failures"] = max(0, circuit["failures"] - 1)
                
                return True
                
        except Exception as e:
            logger.warning(f"Error during timeout recovery ping for connection {connection_id}: {e}")
            
        # If ping fails and we have multiple timeouts, try reconnection
        if circuit_state["failures"] >= 2:
            return await self._reconnect_websocket(connection_id, connection)
            
        # For first timeout, just assume temporary network issue
        return False
        
    async def _recover_from_connection_closed(self, connection_id: str, connection: Dict[str, Any], circuit_state: Dict[str, Any]) -> bool:
        """
        Recover from connection closed error.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            circuit_state: Current circuit state
            
        Returns:
            True if recovery was successful, False otherwise
        """
        # For connection closed errors, always try to reconnect WebSocket
        return await self._reconnect_websocket(connection_id, connection)
        
    async def _recover_from_websocket_error(self, connection_id: str, connection: Dict[str, Any], circuit_state: Dict[str, Any]) -> bool:
        """
        Recover from WebSocket error.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            circuit_state: Current circuit state
            
        Returns:
            True if recovery was successful, False otherwise
        """
        # For WebSocket errors, always try to reconnect WebSocket
        return await self._reconnect_websocket(connection_id, connection)
        
    async def _recover_from_resource_error(self, connection_id: str, connection: Dict[str, Any], circuit_state: Dict[str, Any]) -> bool:
        """
        Recover from resource error.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            circuit_state: Current circuit state
            
        Returns:
            True if recovery was successful, False otherwise
        """
        # For resource errors, restart the browser to free resources
        return await self._restart_browser(connection_id, connection)
        
    async def _recover_from_operation_error(self, connection_id: str, connection: Dict[str, Any], circuit_state: Dict[str, Any], error_category: ConnectionErrorCategory) -> bool:
        """
        Recover from operation error (initialization or inference).
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            circuit_state: Current circuit state
            error_category: Category of error that occurred
            
        Returns:
            True if recovery was successful, False otherwise
        """
        # For persistent errors, try restarting the browser
        if circuit_state["failures"] >= 3:
            return await self._restart_browser(connection_id, connection)
            
        # For initial errors, just try simple recovery
        else:
            return await self._reconnect_websocket(connection_id, connection)
            
    async def _recover_from_unknown_error(self, connection_id: str, connection: Dict[str, Any], circuit_state: Dict[str, Any]) -> bool:
        """
        Recover from unknown error.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            circuit_state: Current circuit state
            
        Returns:
            True if recovery was successful, False otherwise
        """
        # For unknown errors, first try WebSocket reconnection
        if await self._reconnect_websocket(connection_id, connection):
            return True
            
        # If reconnection fails, try browser restart
        return await self._restart_browser(connection_id, connection)
        
    async def _reconnect_websocket(self, connection_id: str, connection: Dict[str, Any]) -> bool:
        """
        Reconnect WebSocket for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            
        Returns:
            True if reconnection was successful, False otherwise
        """
        try:
            logger.info(f"Attempting to reconnect WebSocket for connection {connection_id}")
            
            # Get bridge object
            bridge = connection.get("bridge")
            if not bridge:
                logger.warning(f"Connection {connection_id} has no bridge object")
                return False
                
            # Record reconnection attempt
            await self.circuit_breaker.record_reconnection_attempt(connection_id, False)
            
            # Clear connection state
            # Reset WebSocket connection
            if hasattr(bridge, "connection"):
                bridge.connection = None
                
            bridge.is_connected = False
            bridge.connection_event.clear()
            
            # Wait for reconnection
            connected = await bridge.wait_for_connection(timeout=10, retry_attempts=2)
            
            if connected:
                logger.info(f"Successfully reconnected WebSocket for connection {connection_id}")
                
                # Record successful reconnection
                await self.circuit_breaker.record_reconnection_attempt(connection_id, True)
                
                return True
            else:
                logger.warning(f"Failed to reconnect WebSocket for connection {connection_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error reconnecting WebSocket for connection {connection_id}: {e}")
            return False
            
    async def _restart_browser(self, connection_id: str, connection: Dict[str, Any]) -> bool:
        """
        Restart browser for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection object
            
        Returns:
            True if restart was successful, False otherwise
        """
        try:
            logger.info(f"Attempting to restart browser for connection {connection_id}")
            
            # Mark connection as inactive
            connection["active"] = False
            
            # Get automation object
            automation = connection.get("automation")
            if not automation:
                logger.warning(f"Connection {connection_id} has no automation object")
                return False
                
            # Close current browser
            await automation.close()
            
            # Allow a brief pause for resources to be released
            await asyncio.sleep(1)
            
            # Relaunch browser
            success = await automation.launch(allow_simulation=True)
            
            if success:
                logger.info(f"Successfully restarted browser for connection {connection_id}")
                
                # Mark connection as active again
                connection["active"] = True
                
                # Reset circuit breaker state
                await self.circuit_breaker.reset_circuit(connection_id)
                
                return True
            else:
                logger.warning(f"Failed to restart browser for connection {connection_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error restarting browser for connection {connection_id}: {e}")
            return False


# Define the resource pool circuit breaker manager class
class ResourcePoolCircuitBreakerManager:
    """
    Manager for circuit breakers in the WebNN/WebGPU resource pool.
    
    This class provides a high-level interface for managing connection health,
    circuit breaker states, and recovery strategies.
    """
    
    def __init__(self, browser_connections: Dict[str, Any]):
        """
        Initialize the circuit breaker manager.
        
        Args:
            browser_connections: Dict mapping connection IDs to browser connection objects
        """
        # Create the circuit breaker
        self.circuit_breaker = ResourcePoolCircuitBreaker(
            failure_threshold=5,
            success_threshold=3,
            reset_timeout_seconds=30,
            half_open_max_requests=3,
            health_check_interval_seconds=15,
            min_health_score=50.0
        )
        
        # Create the health checker
        self.health_checker = ConnectionHealthChecker(self.circuit_breaker, browser_connections)
        
        # Create the recovery strategy
        self.recovery_strategy = ConnectionRecoveryStrategy(self.circuit_breaker)
        
        # Store reference to browser connections
        self.browser_connections = browser_connections
        
        # Initialize lock for thread safety
        self.lock = asyncio.Lock()
        
        logger.info("ResourcePoolCircuitBreakerManager initialized")
        
    async def initialize(self):
        """Initialize the circuit breaker manager."""
        # Register all connections
        for connection_id in self.browser_connections.keys():
            self.circuit_breaker.register_connection(connection_id)
            
        # Start health check task
        await self.circuit_breaker.start_health_check_task(self.health_checker.check_connection_health)
        
        logger.info(f"Circuit breaker manager initialized with {len(self.browser_connections)} connections")
        
    async def close(self):
        """Close the circuit breaker manager and release resources."""
        await self.circuit_breaker.close()
        logger.info("Circuit breaker manager closed")
        
    async def pre_request_check(self, connection_id: str) -> Tuple[bool, Optional[str]]:
        """
        Check if a request should be allowed for a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            
        Returns:
            Tuple of (allowed, reason)
        """
        if connection_id not in self.browser_connections:
            return False, "Connection not found"
            
        connection = self.browser_connections[connection_id]
        
        # Check if connection is active
        if not connection.get("active", False):
            return False, "Connection not active"
            
        # Check circuit state
        allow = await self.circuit_breaker.allow_request(connection_id)
        if not allow:
            circuit_state = await self.circuit_breaker.get_connection_state(connection_id)
            state = circuit_state["state"] if circuit_state else "UNKNOWN"
            return False, f"Circuit is {state}"
            
        return True, None
        
    async def record_request_result(self, connection_id: str, success: bool, error_type: Optional[str] = None, response_time_ms: Optional[float] = None):
        """
        Record the result of a request.
        
        Args:
            connection_id: Unique identifier for the connection
            success: Whether the request was successful
            error_type: Type of error encountered (if not successful)
            response_time_ms: Response time in milliseconds (if available)
        """
        if success:
            await self.circuit_breaker.record_success(connection_id)
        else:
            await self.circuit_breaker.record_failure(connection_id, error_type or "unknown")
            
        if response_time_ms is not None:
            await self.circuit_breaker.record_response_time(connection_id, response_time_ms)
            
    async def handle_error(self, connection_id: str, error: Exception, error_context: Dict[str, Any]) -> bool:
        """
        Handle an error for a connection and attempt recovery.
        
        Args:
            connection_id: Unique identifier for the connection
            error: Exception that occurred
            error_context: Context information about the error
            
        Returns:
            True if recovery was successful, False otherwise
        """
        if connection_id not in self.browser_connections:
            return False
            
        connection = self.browser_connections[connection_id]
        
        # Determine error category
        error_category = self._categorize_error(error, error_context)
        
        # Record failure
        await self.circuit_breaker.record_failure(connection_id, error_category.value)
        
        # Attempt recovery
        recovery_success = await self.recovery_strategy.recover_connection(connection_id, connection, error_category)
        
        if recovery_success:
            logger.info(f"Successfully recovered connection {connection_id} from {error_category.value} error")
        else:
            logger.warning(f"Failed to recover connection {connection_id} from {error_category.value} error")
            
        return recovery_success
        
    def _categorize_error(self, error: Exception, error_context: Dict[str, Any]) -> ConnectionErrorCategory:
        """
        Categorize an error based on type and context.
        
        Args:
            error: Exception that occurred
            error_context: Context information about the error
            
        Returns:
            Error category
        """
        # Check context first
        action = error_context.get("action", "")
        error_type = error_context.get("error_type", "")
        
        if "timeout" in str(error).lower() or "timeout" in error_type.lower() or isinstance(error, asyncio.TimeoutError):
            return ConnectionErrorCategory.TIMEOUT
            
        if "connection_closed" in str(error).lower() or "closed" in error_type.lower():
            return ConnectionErrorCategory.CONNECTION_CLOSED
            
        if "websocket" in str(error).lower() or "connection" in action.lower():
            return ConnectionErrorCategory.WEBSOCKET
            
        if "memory" in str(error).lower() or "resource" in error_type.lower():
            return ConnectionErrorCategory.RESOURCE
            
        if "initialize" in action.lower() or "init" in action.lower():
            return ConnectionErrorCategory.INITIALIZATION
            
        if "inference" in action.lower() or "model" in action.lower():
            return ConnectionErrorCategory.INFERENCE
            
        if "browser" in str(error).lower():
            return ConnectionErrorCategory.BROWSER
            
        # Default
        return ConnectionErrorCategory.UNKNOWN
        
    async def get_health_summary(self) -> Dict[str, Any]:
        """
        Get a summary of connection health status.
        
        Returns:
            Dict with health summary
        """
        # Get connection health summaries
        connection_health = await self.health_checker.get_connection_health_summary()
        
        # Get healthy connections
        healthy_connections = await self.circuit_breaker.get_healthy_connections()
        
        # Calculate overall health
        connection_count = len(self.browser_connections)
        healthy_count = len(healthy_connections)
        open_circuit_count = sum(1 for health in connection_health.values() if health["circuit_state"] == "OPEN")
        half_open_circuit_count = sum(1 for health in connection_health.values() if health["circuit_state"] == "HALF_OPEN")
        
        # Calculate overall health score
        if connection_count > 0:
            overall_health_score = sum(health["health_score"] for health in connection_health.values()) / connection_count
        else:
            overall_health_score = 0
            
        return {
            "timestamp": time.time(),
            "connection_count": connection_count,
            "healthy_count": healthy_count,
            "health_percentage": (healthy_count / max(1, connection_count)) * 100,
            "open_circuit_count": open_circuit_count,
            "half_open_circuit_count": half_open_circuit_count,
            "overall_health_score": overall_health_score,
            "connections": connection_health
        }
        
    async def get_connection_details(self, connection_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a connection.
        
        Args:
            connection_id: Unique identifier for the connection
            
        Returns:
            Dict with connection details or None if not found
        """
        if connection_id not in self.browser_connections:
            return None
            
        connection = self.browser_connections[connection_id]
        
        # Get circuit state
        circuit_state = await self.circuit_breaker.get_connection_state(connection_id)
        
        # Get health metrics
        health_metrics = None
        if connection_id in self.circuit_breaker.health_metrics:
            health_metrics = self.circuit_breaker.health_metrics[connection_id].get_summary()
            
        # Build connection details
        return {
            "connection_id": connection_id,
            "browser": connection.get("browser", "unknown"),
            "platform": connection.get("platform", "unknown"),
            "active": connection.get("active", False),
            "is_simulation": connection.get("is_simulation", True),
            "capabilities": connection.get("capabilities", {}),
            "initialized_models": list(connection.get("initialized_models", set())),
            "features": {
                "compute_shaders": connection.get("compute_shaders", False),
                "precompile_shaders": connection.get("precompile_shaders", False),
                "parallel_loading": connection.get("parallel_loading", False)
            },
            "circuit_state": circuit_state,
            "health_metrics": health_metrics
        }


# Example usage of the circuit breaker manager
async def example_usage():
    """Example usage of the circuit breaker manager."""
    # Mock browser connections
    browser_connections = {
        "chrome_webgpu_1": {
            "browser": "chrome",
            "platform": "webgpu",
            "active": True,
            "is_simulation": False,
            "initialized_models": set(["bert-base-uncased", "vit-base"]),
            "compute_shaders": False,
            "precompile_shaders": True,
            "parallel_loading": False,
            "bridge": None,  # Would be a real WebSocket bridge in production
            "automation": None  # Would be a real BrowserAutomation in production
        },
        "firefox_webgpu_1": {
            "browser": "firefox",
            "platform": "webgpu",
            "active": True,
            "is_simulation": False,
            "initialized_models": set(["whisper-tiny"]),
            "compute_shaders": True,
            "precompile_shaders": False,
            "parallel_loading": False,
            "bridge": None,
            "automation": None
        },
        "edge_webnn_1": {
            "browser": "edge",
            "platform": "webnn",
            "active": True,
            "is_simulation": False,
            "initialized_models": set(["bert-base-uncased"]),
            "compute_shaders": False,
            "precompile_shaders": False,
            "parallel_loading": False,
            "bridge": None,
            "automation": None
        }
    }
    
    # Create circuit breaker manager
    circuit_breaker_manager = ResourcePoolCircuitBreakerManager(browser_connections)
    
    # Initialize
    await circuit_breaker_manager.initialize()
    
    try:
        # Simulate some requests
        for i in range(10):
            connection_id = random.choice(list(browser_connections.keys()))
            
            # Check if request is allowed
            allowed, reason = await circuit_breaker_manager.pre_request_check(connection_id)
            
            if allowed:
                logger.info(f"Request {i+1} allowed for connection {connection_id}")
                
                # Simulate random success/failure
                success = random.random() > 0.2
                response_time = random.uniform(50, 500)
                
                if success:
                    logger.info(f"Request {i+1} successful (response time: {response_time:.1f}ms)")
                    await circuit_breaker_manager.record_request_result(connection_id, True, response_time_ms=response_time)
                else:
                    error_types = ["timeout", "inference_error", "memory_error"]
                    error_type = random.choice(error_types)
                    logger.warning(f"Request {i+1} failed with error: {error_type}")
                    await circuit_breaker_manager.record_request_result(connection_id, False, error_type=error_type)
                    
                    # Simulate error handling and recovery
                    error = Exception(f"Simulated {error_type}")
                    error_context = {"action": "inference", "error_type": error_type}
                    
                    recovery_success = await circuit_breaker_manager.handle_error(connection_id, error, error_context)
                    logger.info(f"Recovery {'successful' if recovery_success else 'failed'} for connection {connection_id}")
            else:
                logger.warning(f"Request {i+1} not allowed for connection {connection_id}: {reason}")
                
            # Wait a bit between requests
            await asyncio.sleep(0.5)
            
        # Get health summary
        health_summary = await circuit_breaker_manager.get_health_summary()
        print("Health Summary:")
        print(json.dumps(health_summary, indent=2))
        
        # Get connection details
        connection_id = list(browser_connections.keys())[0]
        connection_details = await circuit_breaker_manager.get_connection_details(connection_id)
        print(f"\nConnection Details for {connection_id}:")
        print(json.dumps(connection_details, indent=2))
        
    finally:
        # Close manager
        await circuit_breaker_manager.close()


# Main entry point
if __name__ == "__main__":
    asyncio.run(example_usage())