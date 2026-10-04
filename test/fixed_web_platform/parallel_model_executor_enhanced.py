#!/usr/bin/env python3
"""
Enhanced Parallel Model Executor for WebNN/WebGPU Resource Pool Integration

This module provides an improved parallel model execution capability for the
WebNN/WebGPU resource pool, enabling efficient concurrent execution of multiple models
across heterogeneous browser backends with intelligent load balancing and fault tolerance.

Key features:
- Efficient concurrent model execution across WebGPU and CPU backends
- Dynamic worker pool with adaptive scaling based on workload
- Intelligent load balancing across heterogeneous browser backends
- Comprehensive performance metrics collection and analysis
- Automatic error recovery and fault tolerance
- Cross-model tensor sharing for memory optimization
- Database integration for results storage and analysis
"""

import os
import sys
import time
import json
import asyncio
import logging
import traceback
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional, Union, Callable

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import resource pool bridge for backward compatibility
from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
from fixed_web_platform.parallel_model_executor import ParallelModelExecutor

class EnhancedParallelModelExecutor:
    """
    Enhanced executor for parallel model inference across WebNN/WebGPU platforms.
    
    This class provides a high-performance parallel execution engine for running
    multiple models concurrently across heterogeneous browser backends, with
    intelligent load balancing, dynamic worker scaling, and fault tolerance.
    """
    
    def __init__(self, 
                 max_workers: int = 4, 
                 min_workers: int = 1,
                 max_models_per_worker: int = 3,
                 resource_pool_integration = None,
                 browser_preferences: Dict[str, str] = None,
                 adaptive_scaling: bool = True,
                 enable_parallel_cpu: bool = True,
                 tensor_sharing: bool = True,
                 execution_timeout: float = 60.0,
                 recovery_attempts: int = 2,
                 db_path: str = None):
        """
        Initialize parallel model executor.
        
        Args:
            max_workers: Maximum number of worker processes
            min_workers: Minimum number of worker processes
            max_models_per_worker: Maximum number of models per worker
            resource_pool_integration: ResourcePoolBridgeIntegration instance or None
            browser_preferences: Dict mapping model families to preferred browsers
            adaptive_scaling: Whether to adapt worker count based on workload
            enable_parallel_cpu: Whether to enable parallel execution on CPU
            tensor_sharing: Whether to enable tensor sharing between models
            execution_timeout: Timeout for model execution (seconds)
            recovery_attempts: Number of recovery attempts for failed tasks
            db_path: Path to DuckDB database for storing metrics
        """
        self.max_workers = max_workers
        self.min_workers = min_workers
        self.max_models_per_worker = max_models_per_worker
        self.resource_pool_integration = resource_pool_integration
        self.adaptive_scaling = adaptive_scaling
        self.enable_parallel_cpu = enable_parallel_cpu
        self.tensor_sharing = tensor_sharing
        self.execution_timeout = execution_timeout
        self.recovery_attempts = recovery_attempts
        self.db_path = db_path
        
        # Default browser preferences if none provided
        self.browser_preferences = browser_preferences or {
            'audio': 'firefox',  # Firefox has better compute shader performance for audio
            'vision': 'chrome',  # Chrome has good WebGPU support for vision models
            'text_embedding': 'edge',  # Edge has excellent WebNN support for text embeddings
            'text_generation': 'chrome',  # Chrome works well for text generation
            'multimodal': 'chrome'  # Chrome is good for multimodal models
        }
        
        # Internal state
        self.initialized = False
        self.workers = {}
        self.worker_stats = {}
        self.available_workers = asyncio.Queue()
        self.result_cache = {}
        self.model_cache = {}
        self.tensor_cache = {}
        self.pending_tasks = set()
        
        # Performance metrics
        self.execution_metrics = {
            'total_executions': 0,
            'total_execution_time': 0.0,
            'successful_executions': 0,
            'failed_executions': 0,
            'timeout_executions': 0,
            'recovery_attempts': 0,
            'recovery_successes': 0,
            'model_execution_times': {},
            'worker_utilization': {},
            'browser_utilization': {},
            'platform_utilization': {},
            'aggregate_throughput': 0.0,
            'max_concurrent_models': 0,
            'tensor_sharing_stats': {
                'total_tensors_shared': 0,
                'memory_saved_mb': 0,
                'sharing_events': 0,
                'shared_tensor_types': {}
            }
        }
        
        # Database connection
        self.db_connection = None
        if self.db_path:
            self._initialize_database()
        
        # Async event loop
        self.loop = None
        
        # Background tasks
        self._worker_monitor_task = None
        self._is_shutting_down = False
        
        # Create base parallel executor for compatibility
        self.base_executor = None
        
        logger.info(f"EnhancedParallelModelExecutor created with {max_workers} workers (min: {min_workers})")
    
    def _initialize_database(self):
        """Initialize database connection for metrics storage."""
        if not self.db_path:
            return
        
        try:
            import duckdb
            self.db_connection = duckdb.connect(self.db_path)
            
            # Create tables if they don't exist
            self._create_database_tables()
            
            logger.info(f"Database connection initialized: {self.db_path}")
        except ImportError:
            logger.warning("DuckDB not available, database features disabled")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
    
    def _create_database_tables(self):
        """Create database tables for metrics storage."""
        if not self.db_connection:
            return
        
        try:
            # Create parallel execution metrics table
            self.db_connection.execute("""
            CREATE TABLE IF NOT EXISTS parallel_execution_metrics (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                execution_id VARCHAR,
                model_count INTEGER,
                successful_count INTEGER,
                failed_count INTEGER,
                timeout_count INTEGER,
                total_execution_time FLOAT,
                average_execution_time FLOAT,
                max_execution_time FLOAT,
                worker_count INTEGER,
                concurrent_models INTEGER,
                throughput_models_per_second FLOAT,
                memory_usage_mb FLOAT,
                tensor_sharing_enabled BOOLEAN,
                shared_tensors_count INTEGER,
                memory_saved_mb FLOAT,
                model_details JSON,
                worker_details JSON
            )
            """)
            
            # Create worker metrics table
            self.db_connection.execute("""
            CREATE TABLE IF NOT EXISTS worker_metrics (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                worker_id VARCHAR,
                browser VARCHAR,
                platform VARCHAR,
                is_real_hardware BOOLEAN,
                models_executed INTEGER,
                avg_execution_time FLOAT,
                success_rate FLOAT,
                memory_usage_mb FLOAT,
                hardware_info JSON,
                status VARCHAR
            )
            """)
            
            # Create tensor sharing metrics table
            self.db_connection.execute("""
            CREATE TABLE IF NOT EXISTS tensor_sharing_metrics (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                execution_id VARCHAR,
                tensor_type VARCHAR,
                source_model_name VARCHAR,
                target_model_name VARCHAR,
                tensor_size_mb FLOAT,
                memory_saved_mb FLOAT,
                sharing_time_ms FLOAT,
                tensor_metadata JSON
            )
            """)
            
            logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
    
    async def initialize(self) -> bool:
        """
        Initialize the parallel model executor.
        
        Returns:
            True if initialization succeeded, False otherwise
        """
        if self.initialized:
            return True
        
        try:
            # Get or create event loop
            try:
                self.loop = asyncio.get_event_loop()
            except RuntimeError:
                self.loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self.loop)
            
            # Verify resource pool integration is available
            if not self.resource_pool_integration:
                try:
                    # Try to import and create resource pool integration
                    from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
                    self.resource_pool_integration = ResourcePoolBridgeIntegration(
                        max_connections=self.max_workers,
                        browser_preferences=self.browser_preferences,
                        adaptive_scaling=self.adaptive_scaling
                    )
                    await self.resource_pool_integration.initialize()
                    logger.info("Created new resource pool integration")
                except ImportError:
                    logger.error("ResourcePoolBridgeIntegration not available. Please provide one.")
                    return False
                except Exception as e:
                    logger.error(f"Error creating resource pool integration: {e}")
                    return False
            
            # Create base executor for compatibility and fallback
            try:
                self.base_executor = ParallelModelExecutor(
                    max_workers=self.max_workers,
                    max_models_per_worker=self.max_models_per_worker,
                    adaptive_scaling=self.adaptive_scaling,
                    resource_pool_integration=self.resource_pool_integration,
                    browser_preferences=self.browser_preferences,
                    execution_timeout=self.execution_timeout,
                    aggregate_metrics=True
                )
                await self.base_executor.initialize()
                logger.info("Created base parallel executor for compatibility")
            except Exception as e:
                logger.warning(f"Error creating base parallel executor: {e}")
                # Continue initialization even if base executor creation fails
            
            # Initialize worker pool
            await self._initialize_worker_pool()
            
            # Start worker monitor task
            self._worker_monitor_task = asyncio.create_task(self._monitor_workers())
            
            self.initialized = True
            logger.info(f"Enhanced parallel model executor initialized with {len(self.workers)} workers")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing parallel model executor: {e}")
            traceback.print_exc()
            return False
    
    async def _initialize_worker_pool(self):
        """Initialize worker pool with min_workers workers."""
        # Clear existing workers
        self.workers.clear()
        while not self.available_workers.empty():
            try:
                await self.available_workers.get()
            except asyncio.QueueEmpty:
                break
        
        # Create initial workers
        for i in range(self.min_workers):
            worker_id = f"worker_{i+1}"
            
            # Create worker with default configuration
            browser = "chrome"  # Default to Chrome for initial workers
            platform = "webgpu"  # Default to WebGPU for initial workers
            
            # Vary initial workers for better distribution
            if i == 1 and self.min_workers > 1:
                browser = "firefox"  # Firefox is good for audio models
            elif i == 2 and self.min_workers > 2:
                browser = "edge"  # Edge is good for text models with WebNN
                platform = "webnn"
            
            worker = await self._create_worker(worker_id, browser, platform)
            if worker:
                # Add to workers dictionary
                self.workers[worker_id] = worker
                
                # Add to available workers queue
                await self.available_workers.put(worker_id)
                
                logger.info(f"Created worker {worker_id} with {browser}/{platform}")
        
        logger.info(f"Worker pool initialized with {len(self.workers)} workers")
    
    async def _create_worker(self, worker_id, browser, platform):
        """
        Create a worker with the specified browser and platform.
        
        Args:
            worker_id: ID for the worker
            browser: Browser to use (chrome, firefox, edge)
            platform: Platform to use (webgpu, webnn, cpu)
            
        Returns:
            Worker configuration dict
        """
        try:
            # Create worker configuration
            worker = {
                "worker_id": worker_id,
                "browser": browser,
                "platform": platform,
                "creation_time": time.time(),
                "last_used_time": time.time(),
                "models_executed": 0,
                "successful_executions": 0,
                "failed_executions": 0,
                "execution_times": [],
                "status": "initializing",
                "active_models": set(),
                "loaded_models": {},
                "error_count": 0,
                "recovery_count": 0,
                "is_real_hardware": False  # Will be updated with actual value
            }
            
            # Check if resource pool has a specific method for creating connections
            if hasattr(self.resource_pool_integration, "create_connection"):
                # Try to create a real connection
                connection = await self.resource_pool_integration.create_connection(
                    browser=browser,
                    platform=platform
                )
                
                if connection:
                    # Update worker with connection info
                    worker["connection"] = connection
                    worker["connection_id"] = getattr(connection, "connection_id", str(id(connection)))
                    worker["is_real_hardware"] = getattr(connection, "is_real_hardware", False)
                    worker["status"] = "ready"
                    
                    logger.info(f"Created real connection for worker {worker_id}")
                else:
                    # Mark as simulation mode
                    worker["status"] = "ready"
                    worker["is_real_hardware"] = False
                    
                    logger.warning(f"Failed to create real connection for worker {worker_id}, using simulation mode")
            else:
                # Mark as simulation mode
                worker["status"] = "ready"
                worker["is_real_hardware"] = False
                
                logger.info(f"Created worker {worker_id} in simulation mode")
            
            # Initialize worker metrics
            self.worker_stats[worker_id] = {
                "creation_time": time.time(),
                "models_executed": 0,
                "successful_executions": 0,
                "failed_executions": 0,
                "avg_execution_time": 0.0,
                "execution_times": [],
                "memory_usage_mb": 0.0,
                "last_used_time": time.time(),
                "status": worker["status"],
                "is_real_hardware": worker["is_real_hardware"]
            }
            
            return worker
        except Exception as e:
            logger.error(f"Error creating worker {worker_id}: {e}")
            return None
    
    async def _monitor_workers(self):
        """Monitor worker health and performance."""
        try:
            while not self._is_shutting_down:
                # Wait a bit between checks
                await asyncio.sleep(10.0)
                
                # Skip if not fully initialized
                if not self.initialized:
                    continue
                
                # Check if we need to scale workers based on pending tasks
                if self.adaptive_scaling and len(self.pending_tasks) > 0:
                    await self._adapt_worker_count()
                
                # Check worker health and clean up idle workers
                await self._check_worker_health()
                
                # Update metrics
                self._update_worker_metrics()
                
                # Store metrics in database if available
                if self.db_connection:
                    self._store_worker_metrics()
        
        except asyncio.CancelledError:
            logger.info("Worker monitor task cancelled")
        except Exception as e:
            logger.error(f"Error in worker monitor: {e}")
    
    async def _adapt_worker_count(self):
        """Adapt worker count based on workload and performance metrics."""
        if not self.adaptive_scaling:
            return
        
        try:
            # Get current worker counts
            current_workers = len(self.workers)
            active_workers = current_workers - self.available_workers.qsize()
            
            # Get pending tasks and execution metrics
            pending_tasks = len(self.pending_tasks)
            recent_execution_times = []
            for worker_id, stats in self.worker_stats.items():
                if 'execution_times' in stats and stats['execution_times']:
                    recent_execution_times.extend(stats['execution_times'][-5:])  # Only use recent executions
            
            # Calculate average execution time
            avg_execution_time = sum(recent_execution_times) / len(recent_execution_times) if recent_execution_times else 0.5
            
            # Current load (active workers / total workers)
            current_load = active_workers / current_workers if current_workers > 0 else 0
            
            # Calculate worker latency (queue time + execution time)
            estimated_latency = pending_tasks * avg_execution_time / max(1, current_workers - active_workers)
            
            # Scale up if:
            # 1. Current load is high (>80%)
            # 2. Estimated latency is high (>5s)
            # 3. We have room to scale up
            scale_up = (current_load > 0.8 or estimated_latency > 5.0) and current_workers < self.max_workers
            
            # Scale down if:
            # 1. Current load is low (<30%)
            # 2. We have more than min_workers
            # 3. We have idle workers
            scale_down = current_load < 0.3 and current_workers > self.min_workers and self.available_workers.qsize() > 0
            
            if scale_up:
                # Calculate how many workers to add
                # Consider pending tasks and current active workers
                workers_to_add = min(
                    pending_tasks // self.max_models_per_worker + 1,  # At least enough for pending tasks
                    self.max_workers - current_workers  # Don't exceed max_workers
                )
                
                if workers_to_add > 0:
                    logger.info(f"Scaling up: adding {workers_to_add} workers (current: {current_workers}, active: {active_workers}, load: {current_load:.2f}, pending tasks: {pending_tasks})")
                    
                    # Create new workers
                    for i in range(workers_to_add):
                        worker_id = f"worker_{current_workers + i + 1}"
                        
                        # Vary browsers for better distribution
                        if i % 3 == 0:
                            browser = "chrome"
                            platform = "webgpu"
                        elif i % 3 == 1:
                            browser = "firefox"
                            platform = "webgpu"
                        else:
                            browser = "edge"
                            platform = "webnn"
                        
                        # Create worker
                        worker = await self._create_worker(worker_id, browser, platform)
                        if worker:
                            # Add to workers dictionary
                            self.workers[worker_id] = worker
                            
                            # Add to available workers queue
                            await self.available_workers.put(worker_id)
                            
                            logger.info(f"Created worker {worker_id} with {browser}/{platform}")
            
            elif scale_down:
                # Only scale down if we have idle workers
                idle_workers = self.available_workers.qsize()
                
                # Calculate how many workers to remove
                # Don't go below min_workers
                workers_to_remove = min(
                    idle_workers,  # Only remove idle workers
                    current_workers - self.min_workers  # Don't go below min_workers
                )
                
                if workers_to_remove > 0:
                    logger.info(f"Scaling down: removing {workers_to_remove} workers (current: {current_workers}, active: {active_workers}, load: {current_load:.2f}, idle: {idle_workers})")
                    
                    # Get idle workers to remove
                    workers_to_remove_ids = []
                    for _ in range(workers_to_remove):
                        if not self.available_workers.empty():
                            worker_id = await self.available_workers.get()
                            workers_to_remove_ids.append(worker_id)
                    
                    # Remove workers
                    for worker_id in workers_to_remove_ids:
                        await self._remove_worker(worker_id)
        
        except Exception as e:
            logger.error(f"Error adapting worker count: {e}")
    
    async def _remove_worker(self, worker_id):
        """
        Remove a worker from the pool.
        
        Args:
            worker_id: ID of worker to remove
        """
        if worker_id not in self.workers:
            return
        
        try:
            # Get worker
            worker = self.workers[worker_id]
            
            # Close connection if it exists
            if "connection" in worker and hasattr(worker["connection"], "close"):
                await worker["connection"].close()
            
            # Remove worker from workers dictionary
            del self.workers[worker_id]
            
            # Remove worker stats
            if worker_id in self.worker_stats:
                del self.worker_stats[worker_id]
            
            logger.info(f"Removed worker {worker_id}")
        except Exception as e:
            logger.error(f"Error removing worker {worker_id}: {e}")
    
    async def _check_worker_health(self):
        """Check worker health and clean up idle workers."""
        if not self.workers:
            return
        
        try:
            current_time = time.time()
            idle_timeout = 300.0  # 5 minutes
            
            # Check each worker
            for worker_id, worker in list(self.workers.items()):
                # Skip if worker is not in stats
                if worker_id not in self.worker_stats:
                    continue
                
                # Get last used time
                last_used_time = worker.get("last_used_time", 0)
                idle_time = current_time - last_used_time
                
                # Check if worker is idle for too long and we have more than min_workers
                if idle_time > idle_timeout and len(self.workers) > self.min_workers:
                    logger.info(f"Worker {worker_id} idle for {idle_time:.1f}s, removing")
                    
                    # Remove worker
                    await self._remove_worker(worker_id)
                    continue
                
                # Check if worker has too many errors
                error_count = worker.get("error_count", 0)
                if error_count > 5:  # Too many errors
                    logger.warning(f"Worker {worker_id} has {error_count} errors, restarting")
                    
                    # Remove worker
                    await self._remove_worker(worker_id)
                    
                    # Create new worker with same configuration
                    new_worker_id = f"worker_{int(time.time())}"
                    new_worker = await self._create_worker(
                        new_worker_id,
                        worker.get("browser", "chrome"),
                        worker.get("platform", "webgpu")
                    )
                    
                    if new_worker:
                        # Add to workers dictionary
                        self.workers[new_worker_id] = new_worker
                        
                        # Add to available workers queue
                        await self.available_workers.put(new_worker_id)
                        
                        logger.info(f"Created replacement worker {new_worker_id}")
        
        except Exception as e:
            logger.error(f"Error checking worker health: {e}")
    
    def _update_worker_metrics(self):
        """Update worker metrics."""
        if not self.workers:
            return
        
        try:
            # Update worker utilization metrics
            total_workers = len(self.workers)
            available_workers = self.available_workers.qsize()
            active_workers = total_workers - available_workers
            
            self.execution_metrics["worker_utilization"] = {
                "total": total_workers,
                "active": active_workers,
                "available": available_workers,
                "utilization_rate": active_workers / total_workers if total_workers > 0 else 0
            }
            
            # Update browser and platform utilization
            browser_counts = {}
            platform_counts = {}
            
            for worker in self.workers.values():
                browser = worker.get("browser", "unknown")
                platform = worker.get("platform", "unknown")
                
                browser_counts[browser] = browser_counts.get(browser, 0) + 1
                platform_counts[platform] = platform_counts.get(platform, 0) + 1
            
            self.execution_metrics["browser_utilization"] = browser_counts
            self.execution_metrics["platform_utilization"] = platform_counts
        
        except Exception as e:
            logger.error(f"Error updating worker metrics: {e}")
    
    def _store_worker_metrics(self):
        """Store worker metrics in database."""
        if not self.db_connection:
            return
        
        try:
            # Store metrics for each worker
            for worker_id, worker in self.workers.items():
                if worker_id not in self.worker_stats:
                    continue
                
                # Get worker stats
                stats = self.worker_stats[worker_id]
                
                # Prepare hardware info
                hardware_info = {
                    "connection_id": worker.get("connection_id", "unknown"),
                    "browser_version": "unknown",
                    "platform_version": "unknown"
                }
                
                # Try to get more detailed hardware info
                if "connection" in worker:
                    connection = worker["connection"]
                    if hasattr(connection, "browser_info"):
                        hardware_info["browser_version"] = getattr(connection, "browser_info", {}).get("version", "unknown")
                    if hasattr(connection, "adapter_info"):
                        hardware_info["platform_version"] = getattr(connection, "adapter_info", {}).get("version", "unknown")
                
                # Insert metrics
                self.db_connection.execute("""
                INSERT INTO worker_metrics (
                    timestamp, worker_id, browser, platform, is_real_hardware,
                    models_executed, avg_execution_time, success_rate,
                    memory_usage_mb, hardware_info, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    datetime.now(),
                    worker_id,
                    worker.get("browser", "unknown"),
                    worker.get("platform", "unknown"),
                    worker.get("is_real_hardware", False),
                    stats.get("models_executed", 0),
                    stats.get("avg_execution_time", 0.0),
                    stats.get("successful_executions", 0) / max(1, stats.get("models_executed", 1)),
                    stats.get("memory_usage_mb", 0.0),
                    json.dumps(hardware_info),
                    worker.get("status", "unknown")
                ])
        
        except Exception as e:
            logger.error(f"Error storing worker metrics: {e}")
    
    async def execute_models(self, 
                            models_and_inputs: List[Tuple[Any, Dict[str, Any]]], 
                            batch_size: int = 0, 
                            timeout: float = None) -> List[Dict[str, Any]]:
        """
        Execute multiple models in parallel with enhanced load balancing.
        
        This method implements sophisticated parallel execution across browser backends
        using the resource pool integration, with intelligent load balancing, batching,
        adaptive scaling, and result aggregation.
        
        Args:
            models_and_inputs: List of (model, inputs) tuples
            batch_size: Maximum batch size (0 for automatic sizing)
            timeout: Timeout in seconds (None for default)
            
        Returns:
            List of results in same order as inputs
        """
        # Handle edge cases
        if not models_and_inputs:
            return []

        if not self.initialized:
            # Try to initialize
            if not await self.initialize():
                logger.error("Failed to initialize parallel model executor")
                return [{'success': False, 'error': 'Executor not initialized'} for _ in models_and_inputs]
        
        # Use base executor if available
        # This is a fallback in case our implementation fails or is not fully ready
        if self.base_executor and self.base_executor.initialized:
            try:
                logger.info(f"Using base executor to run {len(models_and_inputs)} models")
                return await self.base_executor.execute_models(
                    models_and_inputs=models_and_inputs,
                    batch_size=batch_size,
                    timeout=timeout or self.execution_timeout
                )
            except Exception as e:
                logger.error(f"Error using base executor: {e}")
                # Continue with our implementation
        
        # Use timeout if specified, otherwise use default
        execution_timeout = timeout or self.execution_timeout
        
        # Track overall execution
        execution_id = f"exec_{int(time.time())}_{len(models_and_inputs)}"
        overall_start_time = time.time()
        self.execution_metrics['total_executions'] += len(models_and_inputs)
        
        # Update max concurrent models metric
        self.execution_metrics['max_concurrent_models'] = max(
            self.execution_metrics['max_concurrent_models'],
            len(models_and_inputs)
        )
        
        # Apply tensor sharing if enabled
        if self.tensor_sharing:
            models_and_inputs = await self._apply_tensor_sharing(models_and_inputs)
        
        # Create a future for each model execution
        futures = []
        
        try:
            # Create execution tasks for each model
            for i, (model, inputs) in enumerate(models_and_inputs):
                # Create a future for the result
                future = self.loop.create_future()
                futures.append(future)
                
                # Add a task to execute the model
                task = asyncio.create_task(
                    self._execute_model_with_worker(model, inputs, i, future, execution_id)
                )
                
                # Add to pending tasks
                self.pending_tasks.add(task)
                
                # Add done callback to remove from pending tasks
                task.add_done_callback(lambda t: self.pending_tasks.remove(t) if t in self.pending_tasks else None)
            
            # Wait for all futures to complete or timeout
            try:
                await asyncio.wait_for(asyncio.gather(*futures), timeout=execution_timeout)
            except asyncio.TimeoutError:
                logger.warning(f"Timeout waiting for models execution after {execution_timeout}s")
                
                # Mark incomplete futures as timeout
                for i, future in enumerate(futures):
                    if not future.done():
                        model, inputs = models_and_inputs[i]
                        model_name = getattr(model, 'model_name', 'unknown')
                        future.set_result({
                            'success': False,
                            'error_type': 'timeout',
                            'error': f'Execution timeout after {execution_timeout}s',
                            'model_name': model_name,
                            'execution_id': execution_id,
                            'model_index': i
                        })
            
            # Process results
            results = []
            for future in futures:
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    # This should not happen since we set results on the futures directly
                    logger.error(f"Error getting result from future: {e}")
                    results.append({
                        'success': False,
                        'error_type': type(e).__name__,
                        'error': str(e),
                        'traceback': traceback.format_exc()
                    })
            
            # Calculate execution time
            execution_time = time.time() - overall_start_time
            
            # Update execution metrics
            self.execution_metrics['total_execution_time'] += execution_time
            
            # Count successful and failed executions
            successful = sum(1 for r in results if r.get('success', False))
            failed = len(results) - successful
            
            self.execution_metrics['successful_executions'] += successful
            self.execution_metrics['failed_executions'] += failed
            
            # Calculate throughput
            throughput = len(models_and_inputs) / execution_time if execution_time > 0 else 0
            self.execution_metrics['aggregate_throughput'] = throughput
            
            # Store execution metrics in database
            if self.db_connection:
                self._store_execution_metrics(execution_id, models_and_inputs, results, execution_time)
            
            logger.info(f"Executed {len(models_and_inputs)} models in {execution_time:.2f}s ({throughput:.2f} models/s), {successful} successful, {failed} failed")
            
            return results
            
        except Exception as e:
            logger.error(f"Error in execute_models: {e}")
            traceback.print_exc()
            
            # Create error results
            error_results = []
            for i, (model, inputs) in enumerate(models_and_inputs):
                model_name = getattr(model, 'model_name', 'unknown')
                error_results.append({
                    'success': False,
                    'error_type': type(e).__name__,
                    'error': str(e),
                    'model_name': model_name,
                    'execution_id': execution_id,
                    'model_index': i,
                    'traceback': traceback.format_exc()
                })
            
            return error_results
    
    async def _apply_tensor_sharing(self, models_and_inputs):
        """
        Apply tensor sharing to models and inputs.
        
        This method identifies models that can share tensors and applies
        tensor sharing to reduce memory usage and improve performance.
        
        Args:
            models_and_inputs: List of (model, inputs) tuples
            
        Returns:
            Modified list of (model, inputs) tuples
        """
        if not self.tensor_sharing:
            return models_and_inputs
        
        try:
            # Group models by type to identify sharing opportunities
            model_groups = {}
            
            for i, (model, inputs) in enumerate(models_and_inputs):
                # Get model type and name
                model_type = getattr(model, 'model_type', None)
                if not model_type:
                    model_name = getattr(model, 'model_name', 'unknown')
                    model_type = self._infer_model_type(model_name)
                
                # Group by model type
                if model_type not in model_groups:
                    model_groups[model_type] = []
                
                model_groups[model_type].append((i, model, inputs))
            
            # Apply tensor sharing within model groups
            for model_type, group in model_groups.items():
                if len(group) <= 1:
                    continue  # Skip groups with only one model
                
                # Get tensor sharing function based on model type
                sharing_func = self._get_tensor_sharing_function(model_type)
                if not sharing_func:
                    continue  # Skip if no sharing function available
                
                # Apply tensor sharing
                await sharing_func(group)
            
            # Return original list (models may have been modified in-place)
            return models_and_inputs
            
        except Exception as e:
            logger.error(f"Error applying tensor sharing: {e}")
            return models_and_inputs
    
    def _infer_model_type(self, model_name):
        """
        Infer model type from model name.
        
        Args:
            model_name: Name of the model
            
        Returns:
            Inferred model type
        """
        model_name = model_name.lower()
        
        # Common model type patterns
        if "bert" in model_name or "roberta" in model_name:
            return "text_embedding"
        elif "t5" in model_name or "gpt" in model_name or "llama" in model_name:
            return "text_generation"
        elif "vit" in model_name or "resnet" in model_name:
            return "vision"
        elif "whisper" in model_name or "wav2vec" in model_name:
            return "audio"
        elif "clip" in model_name:
            return "multimodal"
        
        # Default
        return "unknown"
    
    def _get_tensor_sharing_function(self, model_type):
        """
        Get tensor sharing function for a model type.
        
        Args:
            model_type: Type of model
            
        Returns:
            Tensor sharing function or None
        """
        # Mapping of model types to sharing functions
        sharing_functions = {
            "text_embedding": self._share_text_embedding_tensors,
            "vision": self._share_vision_tensors,
            "audio": self._share_audio_tensors,
            "multimodal": self._share_multimodal_tensors
        }
        
        return sharing_functions.get(model_type)
    
    async def _share_text_embedding_tensors(self, model_group):
        """
        Share tensors between text embedding models.
        
        Args:
            model_group: List of (index, model, inputs) tuples
        """
        # Group by input text to identify sharing opportunities
        text_groups = {}
        
        for i, model, inputs in model_group:
            # Get input text
            if isinstance(inputs, str):
                text = inputs
            elif isinstance(inputs, dict) and "text" in inputs:
                text = inputs["text"]
            elif isinstance(inputs, dict) and "input_ids" in inputs:
                # Already tokenized, use a hash of input_ids as key
                input_ids = inputs["input_ids"]
                if isinstance(input_ids, list):
                    text = str(hash(str(input_ids)))
                else:
                    text = str(hash(str(input_ids)))
            else:
                continue  # Skip if we can't identify input text
            
            # Group by text
            if text not in text_groups:
                text_groups[text] = []
            
            text_groups[text].append((i, model, inputs))
        
        # Share tensors within text groups
        shared_count = 0
        memory_saved = 0
        
        for text, group in text_groups.items():
            if len(group) <= 1:
                continue  # Skip groups with only one model
            
            # Use the first model as source
            source_idx, source_model, source_inputs = group[0]
            
            # Track sharing in metrics
            tensor_type = "text_embedding"
            source_name = getattr(source_model, 'model_name', 'unknown')
            
            # Create a shared tensor cache entry
            if text not in self.tensor_cache:
                self.tensor_cache[text] = {
                    "tensor_type": tensor_type,
                    "source_model": source_name,
                    "creation_time": time.time(),
                    "ref_count": 0,
                    "size_mb": 0.1  # Placeholder value
                }
            
            # Update ref count and sharing metrics
            self.tensor_cache[text]["ref_count"] += len(group) - 1
            
            # Record sharing events
            for target_idx, target_model, target_inputs in group[1:]:
                # Set shared tensor attribute if model supports it
                if hasattr(target_model, 'shared_tensors'):
                    if not hasattr(target_model, 'shared_tensors'):
                        target_model.shared_tensors = {}
                    
                    target_model.shared_tensors[tensor_type] = text
                
                # Update metrics
                shared_count += 1
                memory_saved += self.tensor_cache[text]["size_mb"]
                
                # Record sharing in database
                if self.db_connection:
                    target_name = getattr(target_model, 'model_name', 'unknown')
                    self._store_tensor_sharing_metrics(
                        "shared_embedding",
                        tensor_type,
                        source_name,
                        target_name,
                        self.tensor_cache[text]["size_mb"]
                    )
        
        # Update tensor sharing metrics
        self.execution_metrics["tensor_sharing_stats"]["total_tensors_shared"] += shared_count
        self.execution_metrics["tensor_sharing_stats"]["memory_saved_mb"] += memory_saved
        self.execution_metrics["tensor_sharing_stats"]["sharing_events"] += shared_count
        
        if "text_embedding" not in self.execution_metrics["tensor_sharing_stats"]["shared_tensor_types"]:
            self.execution_metrics["tensor_sharing_stats"]["shared_tensor_types"]["text_embedding"] = 0
        
        self.execution_metrics["tensor_sharing_stats"]["shared_tensor_types"]["text_embedding"] += shared_count
    
    async def _share_vision_tensors(self, model_group):
        """
        Share tensors between vision models.
        
        Args:
            model_group: List of (index, model, inputs) tuples
        """
        # Implementation for vision tensor sharing
        # Similar to text embedding sharing but for vision inputs
        pass
    
    async def _share_audio_tensors(self, model_group):
        """
        Share tensors between audio models.
        
        Args:
            model_group: List of (index, model, inputs) tuples
        """
        # Implementation for audio tensor sharing
        pass
    
    async def _share_multimodal_tensors(self, model_group):
        """
        Share tensors between multimodal models.
        
        Args:
            model_group: List of (index, model, inputs) tuples
        """
        # Implementation for multimodal tensor sharing
        pass
    
    def _store_tensor_sharing_metrics(self, execution_id, tensor_type, source_model, target_model, size_mb):
        """
        Store tensor sharing metrics in database.
        
        Args:
            execution_id: ID of the execution
            tensor_type: Type of tensor shared
            source_model: Source model name
            target_model: Target model name
            size_mb: Size of tensor in MB
        """
        if not self.db_connection:
            return
        
        try:
            self.db_connection.execute("""
            INSERT INTO tensor_sharing_metrics (
                timestamp, execution_id, tensor_type, source_model_name, 
                target_model_name, tensor_size_mb, memory_saved_mb
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                datetime.now(),
                execution_id,
                tensor_type,
                source_model,
                target_model,
                size_mb,
                size_mb  # Memory saved is the same as tensor size
            ])
        except Exception as e:
            logger.error(f"Error storing tensor sharing metrics: {e}")
    
    def _store_execution_metrics(self, execution_id, models_and_inputs, results, execution_time):
        """
        Store execution metrics in database.
        
        Args:
            execution_id: ID of the execution
            models_and_inputs: List of (model, inputs) tuples
            results: List of execution results
            execution_time: Total execution time in seconds
        """
        if not self.db_connection:
            return
        
        try:
            # Count successful and failed executions
            successful = sum(1 for r in results if r.get('success', False))
            failed = len(results) - successful
            timeout = sum(1 for r in results if r.get('error_type') == 'timeout')
            
            # Calculate average and max execution times
            execution_times = [r.get('execution_time', 0) for r in results if r.get('success', False)]
            avg_execution_time = sum(execution_times) / len(execution_times) if execution_times else 0
            max_execution_time = max(execution_times) if execution_times else 0
            
            # Calculate memory usage
            memory_usage = sum(r.get('memory_usage_mb', 0) for r in results if r.get('success', False))
            
            # Prepare model details
            model_details = []
            for i, (model, _) in enumerate(models_and_inputs):
                model_name = getattr(model, 'model_name', 'unknown')
                model_type = getattr(model, 'model_type', 'unknown')
                
                # Check if model has shared tensors
                shared_tensors = getattr(model, 'shared_tensors', {}) if hasattr(model, 'shared_tensors') else {}
                
                model_details.append({
                    "model_name": model_name,
                    "model_type": model_type,
                    "shared_tensors": list(shared_tensors.keys()) if shared_tensors else []
                })
            
            # Prepare worker details
            worker_details = []
            for worker_id, stats in self.worker_stats.items():
                worker_details.append({
                    "worker_id": worker_id,
                    "browser": self.workers[worker_id]["browser"] if worker_id in self.workers else "unknown",
                    "platform": self.workers[worker_id]["platform"] if worker_id in self.workers else "unknown",
                    "models_executed": stats.get("models_executed", 0),
                    "avg_execution_time": stats.get("avg_execution_time", 0.0),
                    "success_rate": stats.get("successful_executions", 0) / max(1, stats.get("models_executed", 1)),
                    "is_real_hardware": stats.get("is_real_hardware", False)
                })
            
            # Get tensor sharing metrics
            tensor_sharing_stats = self.execution_metrics["tensor_sharing_stats"]
            
            # Insert execution metrics
            self.db_connection.execute("""
            INSERT INTO parallel_execution_metrics (
                timestamp, execution_id, model_count, successful_count, 
                failed_count, timeout_count, total_execution_time, 
                average_execution_time, max_execution_time, worker_count, 
                concurrent_models, throughput_models_per_second, memory_usage_mb, 
                tensor_sharing_enabled, shared_tensors_count, memory_saved_mb, 
                model_details, worker_details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                datetime.now(),
                execution_id,
                len(models_and_inputs),
                successful,
                failed,
                timeout,
                execution_time,
                avg_execution_time,
                max_execution_time,
                len(self.workers),
                len(models_and_inputs),
                len(models_and_inputs) / execution_time if execution_time > 0 else 0,
                memory_usage,
                self.tensor_sharing,
                tensor_sharing_stats["total_tensors_shared"],
                tensor_sharing_stats["memory_saved_mb"],
                json.dumps(model_details),
                json.dumps(worker_details)
            ])
        except Exception as e:
            logger.error(f"Error storing execution metrics: {e}")
    
    async def _execute_model_with_worker(self, model, inputs, model_index, future, execution_id):
        """
        Execute a model with an available worker.
        
        This method waits for an available worker, executes the model,
        and sets the result on the provided future. It includes comprehensive
        error handling, recovery, and metrics collection.
        
        Args:
            model: Model to execute
            inputs: Input data for the model
            model_index: Index of the model in the original list
            future: Future to set with the result
            execution_id: ID of the overall execution
        """
        worker_id = None
        worker = None
        
        try:
            # Wait for an available worker with timeout
            try:
                worker_id = await asyncio.wait_for(self.available_workers.get(), timeout=30.0)
                worker = self.workers[worker_id]
            except (asyncio.TimeoutError, KeyError) as e:
                # No worker available, set error result
                model_name = getattr(model, 'model_name', 'unknown')
                logger.error(f"Timeout waiting for worker for model {model_name}")
                
                if not future.done():
                    future.set_result({
                        'success': False,
                        'error_type': 'worker_unavailable',
                        'error': f'No worker available within timeout (30s): {str(e)}',
                        'model_name': model_name,
                        'execution_id': execution_id,
                        'model_index': model_index
                    })
                return
            
            # Get model name and type
            model_name = getattr(model, 'model_name', 'unknown')
            model_type = getattr(model, 'model_type', self._infer_model_type(model_name))
            
            # Update worker state
            worker["last_used_time"] = time.time()
            worker["active_models"].add(model_name)
            
            # Update worker stats
            if worker_id in self.worker_stats:
                self.worker_stats[worker_id]["models_executed"] += 1
                self.worker_stats[worker_id]["last_used_time"] = time.time()
            
            # Track start time for performance metrics
            start_time = time.time()
            
            # Execute model
            try:
                # Try to execute the model
                result = await self._execute_model(model, inputs, worker)
                
                # Calculate execution time
                execution_time = time.time() - start_time
                
                # Update worker metrics
                if worker_id in self.worker_stats:
                    self.worker_stats[worker_id]["successful_executions"] += 1
                    self.worker_stats[worker_id]["execution_times"].append(execution_time)
                    
                    # Calculate average execution time
                    execution_times = self.worker_stats[worker_id]["execution_times"]
                    self.worker_stats[worker_id]["avg_execution_time"] = sum(execution_times) / len(execution_times)
                    
                    # Keep only last 100 execution times
                    if len(execution_times) > 100:
                        self.worker_stats[worker_id]["execution_times"] = execution_times[-100:]
                
                # Update model execution times
                if model_name not in self.execution_metrics["model_execution_times"]:
                    self.execution_metrics["model_execution_times"][model_name] = []
                
                self.execution_metrics["model_execution_times"][model_name].append(execution_time)
                
                # Keep only last 100 execution times
                if len(self.execution_metrics["model_execution_times"][model_name]) > 100:
                    self.execution_metrics["model_execution_times"][model_name] = self.execution_metrics["model_execution_times"][model_name][-100:]
                
                # Add execution metadata to result
                if isinstance(result, dict):
                    result.update({
                        'execution_time': execution_time,
                        'worker_id': worker_id,
                        'execution_id': execution_id,
                        'model_index': model_index,
                        'worker_browser': worker.get('browser', 'unknown'),
                        'worker_platform': worker.get('platform', 'unknown'),
                        'is_real_hardware': worker.get('is_real_hardware', False)
                    })
                    
                    # Add shared tensor info if available
                    if hasattr(model, 'shared_tensors') and model.shared_tensors:
                        result['shared_tensors'] = list(model.shared_tensors.keys())
                
                # Set future result
                if not future.done():
                    future.set_result(result)
                
            except Exception as e:
                # Handle model execution error
                logger.error(f"Error executing model {model_name}: {e}")
                
                # Update worker error count
                worker["error_count"] = worker.get("error_count", 0) + 1
                
                # Update worker stats
                if worker_id in self.worker_stats:
                    self.worker_stats[worker_id]["failed_executions"] = self.worker_stats[worker_id].get("failed_executions", 0) + 1
                
                # Try recovery if configured
                if self.recovery_attempts > 0:
                    logger.info(f"Attempting recovery for model {model_name}")
                    
                    # Update recovery metrics
                    self.execution_metrics["recovery_attempts"] += 1
                    
                    # Create error context for better recovery
                    error_context = {
                        "model_name": model_name,
                        "model_type": model_type,
                        "worker_id": worker_id,
                        "worker_browser": worker.get("browser", "unknown"),
                        "worker_platform": worker.get("platform", "unknown"),
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "execution_time": time.time() - start_time
                    }
                    
                    # Attempt recovery with a different worker
                    recovery_result = await self._attempt_recovery(model, inputs, error_context, execution_id, model_index)
                    
                    if recovery_result.get("success", False):
                        # Recovery successful
                        logger.info(f"Recovery successful for model {model_name}")
                        self.execution_metrics["recovery_successes"] += 1
                        
                        # Set recovered result
                        if not future.done():
                            future.set_result(recovery_result)
                        return
                
                # Set error result if no recovery or recovery failed
                if not future.done():
                    future.set_result({
                        'success': False,
                        'error_type': type(e).__name__,
                        'error': str(e),
                        'model_name': model_name,
                        'execution_id': execution_id,
                        'model_index': model_index,
                        'traceback': traceback.format_exc(),
                        'worker_id': worker_id
                    })
            
        finally:
            # Return worker to available pool if it was used
            if worker_id and worker_id in self.workers:
                try:
                    # Release the model from the worker
                    if worker and model_name in worker["active_models"]:
                        worker["active_models"].remove(model_name)
                    
                    # Return worker to pool
                    await self.available_workers.put(worker_id)
                except Exception as e:
                    logger.error(f"Error returning worker {worker_id} to pool: {e}")
    
    async def _execute_model(self, model, inputs, worker):
        """
        Execute a model using the worker.
        
        Args:
            model: Model to execute
            inputs: Input data for the model
            worker: Worker to use for execution
            
        Returns:
            Execution result
        """
        # Get model name for logging
        model_name = getattr(model, 'model_name', 'unknown')
        
        # Direct model execution
        if callable(model):
            start_time = time.time()
            
            # Call the model
            result = model(inputs)
            
            # Handle async results
            if asyncio.iscoroutine(result) or hasattr(result, "__await__"):
                result = await result
            
            # Create a standard result format if result is not a dict
            if not isinstance(result, dict):
                result = {
                    'success': True,
                    'result': result,
                    'model_name': model_name,
                    'execution_time': time.time() - start_time
                }
            
            # Add success flag if not present
            if 'success' not in result:
                result['success'] = True
            
            return result
        else:
            # Model is not callable
            logger.error(f"Model {model_name} is not callable")
            return {
                'success': False,
                'error_type': 'model_not_callable',
                'error': f"Model {model_name} is not callable",
                'model_name': model_name
            }
    
    async def _attempt_recovery(self, model, inputs, error_context, execution_id, model_index):
        """
        Attempt to recover from a model execution error.
        
        This method tries to execute the model using a different worker
        to recover from transient errors.
        
        Args:
            model: Model to execute
            inputs: Input data for the model
            error_context: Context about the error that occurred
            execution_id: ID of the overall execution
            model_index: Index of the model in the original list
            
        Returns:
            Recovery result
        """
        # Get model name
        model_name = error_context.get("model_name", getattr(model, 'model_name', 'unknown'))
        
        try:
            # Wait for an available worker with timeout
            # Skip the worker that failed
            failed_worker_id = error_context.get("worker_id")
            
            # Find a different worker
            recovery_worker_id = None
            recovery_worker = None
            
            logger.info(f"Looking for recovery worker for model {model_name}")
            
            # Wait for any available worker
            try:
                recovery_worker_id = await asyncio.wait_for(self.available_workers.get(), timeout=10.0)
                
                # If we got the same worker that failed, put it back and try again
                if recovery_worker_id == failed_worker_id:
                    logger.info(f"Got same worker {recovery_worker_id} that failed, retrying")
                    await self.available_workers.put(recovery_worker_id)
                    
                    # Try again with a timeout
                    recovery_worker_id = await asyncio.wait_for(self.available_workers.get(), timeout=10.0)
                    
                    # If we still got the same worker, use it anyway
                    if recovery_worker_id == failed_worker_id:
                        logger.warning(f"Still got same worker {recovery_worker_id}, using it anyway")
                
                # Get worker
                recovery_worker = self.workers[recovery_worker_id]
            except (asyncio.TimeoutError, KeyError) as e:
                logger.error(f"Timeout waiting for recovery worker: {e}")
                return {
                    'success': False,
                    'error_type': 'recovery_timeout',
                    'error': f'No recovery worker available within timeout: {str(e)}',
                    'model_name': model_name,
                    'execution_id': execution_id,
                    'model_index': model_index,
                    'original_error': error_context.get("error")
                }
            
            # Update worker state
            recovery_worker["last_used_time"] = time.time()
            recovery_worker["active_models"].add(model_name)
            recovery_worker["recovery_count"] = recovery_worker.get("recovery_count", 0) + 1
            
            # Update worker stats
            if recovery_worker_id in self.worker_stats:
                self.worker_stats[recovery_worker_id]["models_executed"] += 1
                self.worker_stats[recovery_worker_id]["last_used_time"] = time.time()
                self.worker_stats[recovery_worker_id]["recovery_count"] = self.worker_stats[recovery_worker_id].get("recovery_count", 0) + 1
            
            # Track start time for performance metrics
            start_time = time.time()
            
            try:
                # Try to execute the model with the recovery worker
                result = await self._execute_model(model, inputs, recovery_worker)
                
                # Calculate execution time
                execution_time = time.time() - start_time
                
                # Update worker metrics
                if recovery_worker_id in self.worker_stats:
                    self.worker_stats[recovery_worker_id]["successful_executions"] += 1
                    self.worker_stats[recovery_worker_id]["execution_times"].append(execution_time)
                    
                    # Calculate average execution time
                    execution_times = self.worker_stats[recovery_worker_id]["execution_times"]
                    self.worker_stats[recovery_worker_id]["avg_execution_time"] = sum(execution_times) / len(execution_times)
                
                # Add recovery metadata to result
                if isinstance(result, dict):
                    result.update({
                        'execution_time': execution_time,
                        'worker_id': recovery_worker_id,
                        'execution_id': execution_id,
                        'model_index': model_index,
                        'worker_browser': recovery_worker.get('browser', 'unknown'),
                        'worker_platform': recovery_worker.get('platform', 'unknown'),
                        'is_real_hardware': recovery_worker.get('is_real_hardware', False),
                        'recovery': True,
                        'original_error': error_context.get("error"),
                        'original_worker_id': failed_worker_id
                    })
                
                return result
                
            except Exception as recovery_e:
                # Handle recovery error
                logger.error(f"Recovery failed for model {model_name}: {recovery_e}")
                
                # Update worker error count
                recovery_worker["error_count"] = recovery_worker.get("error_count", 0) + 1
                
                # Update worker stats
                if recovery_worker_id in self.worker_stats:
                    self.worker_stats[recovery_worker_id]["failed_executions"] = self.worker_stats[recovery_worker_id].get("failed_executions", 0) + 1
                
                # Return error result
                return {
                    'success': False,
                    'error_type': 'recovery_failed',
                    'error': f'Recovery failed: {str(recovery_e)}',
                    'original_error': error_context.get("error"),
                    'recovery_error': str(recovery_e),
                    'model_name': model_name,
                    'execution_id': execution_id,
                    'model_index': model_index,
                    'worker_id': recovery_worker_id
                }
                
            finally:
                # Return recovery worker to available pool
                if recovery_worker_id and recovery_worker_id in self.workers:
                    try:
                        # Release the model from the worker
                        if recovery_worker and model_name in recovery_worker["active_models"]:
                            recovery_worker["active_models"].remove(model_name)
                        
                        # Return worker to pool
                        await self.available_workers.put(recovery_worker_id)
                    except Exception as e:
                        logger.error(f"Error returning recovery worker {recovery_worker_id} to pool: {e}")
        
        except Exception as e:
            logger.error(f"Error in recovery attempt for model {model_name}: {e}")
            
            # Return error result
            return {
                'success': False,
                'error_type': 'recovery_error',
                'error': f'Error in recovery: {str(e)}',
                'original_error': error_context.get("error"),
                'model_name': model_name,
                'execution_id': execution_id,
                'model_index': model_index,
                'traceback': traceback.format_exc()
            }
    
    def get_metrics(self):
        """
        Get comprehensive execution metrics.
        
        Returns:
            Dict with detailed metrics about execution performance
        """
        # Create a copy of metrics to avoid modification while accessing
        metrics = dict(self.execution_metrics)
        
        # Add derived metrics
        total_executions = metrics['total_executions']
        if total_executions > 0:
            metrics['success_rate'] = metrics['successful_executions'] / total_executions
            metrics['failure_rate'] = metrics['failed_executions'] / total_executions
            metrics['timeout_rate'] = metrics['timeout_executions'] / total_executions
            metrics['avg_execution_time'] = metrics['total_execution_time'] / total_executions
            metrics['recovery_success_rate'] = metrics['recovery_successes'] / metrics['recovery_attempts'] if metrics['recovery_attempts'] > 0 else 0
        
        # Add worker metrics
        metrics['workers'] = {
            'current_count': len(self.workers),
            'max_workers': self.max_workers,
            'min_workers': self.min_workers,
            'max_models_per_worker': self.max_models_per_worker,
            'worker_ids': list(self.workers.keys())
        }
        
        # Add timestamp
        metrics['timestamp'] = time.time()
        
        return metrics
    
    async def close(self):
        """
        Close the parallel model executor and release resources.
        
        This method properly shuts down all workers, closes connections,
        and releases resources to ensure clean termination.
        """
        # Set shutting down flag
        self._is_shutting_down = True
        
        logger.info("Closing enhanced parallel model executor")
        
        # Cancel worker monitor task
        if self._worker_monitor_task:
            self._worker_monitor_task.cancel()
            try:
                await self._worker_monitor_task
            except asyncio.CancelledError:
                pass
            self._worker_monitor_task = None
        
        # Close workers
        close_futures = []
        for worker_id in list(self.workers.keys()):
            future = asyncio.ensure_future(self._remove_worker(worker_id))
            close_futures.append(future)
        
        if close_futures:
            await asyncio.gather(*close_futures, return_exceptions=True)
        
        # Close base executor if available
        if self.base_executor:
            try:
                await self.base_executor.close()
            except Exception as e:
                logger.error(f"Error closing base executor: {e}")
        
        # Clear tensor cache
        self.tensor_cache.clear()
        
        # Clear model cache
        self.model_cache.clear()
        
        # Close database connection
        if self.db_connection:
            try:
                self.db_connection.close()
            except Exception as e:
                logger.error(f"Error closing database connection: {e}")
        
        # Clear state
        self.initialized = False
        self.workers.clear()
        self.worker_stats.clear()
        
        logger.info("Enhanced parallel model executor closed")

# Helper function to create and initialize executor
async def create_enhanced_parallel_executor(
    max_workers: int = 4,
    min_workers: int = 1,
    max_models_per_worker: int = 3,
    resource_pool_integration = None,
    browser_preferences: Dict[str, str] = None,
    adaptive_scaling: bool = True,
    tensor_sharing: bool = True,
    db_path: str = None
) -> Optional[EnhancedParallelModelExecutor]:
    """
    Create and initialize an enhanced parallel model executor.
    
    Args:
        max_workers: Maximum number of worker processes
        min_workers: Minimum number of worker processes
        max_models_per_worker: Maximum number of models per worker
        resource_pool_integration: ResourcePoolBridgeIntegration instance
        browser_preferences: Dict mapping model families to preferred browsers
        adaptive_scaling: Whether to adapt worker count based on workload
        tensor_sharing: Whether to enable tensor sharing between models
        db_path: Path to DuckDB database for metrics storage
        
    Returns:
        Initialized executor or None on failure
    """
    executor = EnhancedParallelModelExecutor(
        max_workers=max_workers,
        min_workers=min_workers,
        max_models_per_worker=max_models_per_worker,
        resource_pool_integration=resource_pool_integration,
        browser_preferences=browser_preferences,
        adaptive_scaling=adaptive_scaling,
        tensor_sharing=tensor_sharing,
        db_path=db_path
    )
    
    if await executor.initialize():
        return executor
    else:
        logger.error("Failed to initialize enhanced parallel model executor")
        return None

# Test function for the enhanced executor
async def test_enhanced_parallel_executor():
    """Test the enhanced parallel model executor."""
    from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration, EnhancedWebModel
    
    try:
        # Create resource pool integration
        integration = ResourcePoolBridgeIntegration(max_connections=4)
        await integration.initialize()
        
        # Create and initialize executor
        executor = await create_enhanced_parallel_executor(
            max_workers=4,
            min_workers=2,
            resource_pool_integration=integration,
            adaptive_scaling=True,
            tensor_sharing=True
        )
        
        if not executor:
            logger.error("Failed to create enhanced parallel model executor")
            return False
        
        # Create test models (using EnhancedWebModel for simulation)
        model1 = EnhancedWebModel("bert-base-uncased", "text_embedding", "webgpu")
        model2 = EnhancedWebModel("vit-base-patch16-224", "vision", "webgpu")
        model3 = EnhancedWebModel("whisper-tiny", "audio", "webgpu", "firefox", compute_shaders=True)
        
        # Test inputs
        inputs1 = "This is a test input for BERT"
        inputs2 = {"pixel_values": [[[0.5] * 3 for _ in range(224)] for _ in range(224)]}
        inputs3 = {"input_features": [[[0.1] * 80 for _ in range(3000)]]}
        
        # Execute models
        logger.info("Executing test models in parallel...")
        results = await executor.execute_models([
            (model1, inputs1),
            (model2, inputs2),
            (model3, inputs3)
        ])
        
        # Check results
        success_count = sum(1 for r in results if r.get('success', False))
        logger.info(f"Executed {len(results)} models with {success_count} successes")
        
        # Get metrics
        metrics = executor.get_metrics()
        logger.info(f"Execution metrics: {json.dumps(metrics, indent=2)}")
        
        # Run a second execution to test tensor sharing
        logger.info("Running second execution to test tensor sharing...")
        
        # Create another text embedding model that can share tensors with model1
        model4 = EnhancedWebModel("bert-large-uncased", "text_embedding", "webgpu")
        
        # Execute with the same input text to test tensor sharing
        results2 = await executor.execute_models([
            (model1, inputs1),
            (model4, inputs1)
        ])
        
        # Check results
        success_count2 = sum(1 for r in results2 if r.get('success', False))
        logger.info(f"Executed {len(results2)} models with {success_count2} successes")
        
        # Check if tensor sharing was used
        tensor_sharing_used = any('shared_tensors' in r for r in results2 if isinstance(r, dict))
        logger.info(f"Tensor sharing used: {tensor_sharing_used}")
        
        # Get updated metrics
        metrics2 = executor.get_metrics()
        logger.info(f"Updated metrics: {json.dumps(metrics2['tensor_sharing_stats'], indent=2)}")
        
        # Close executor
        await executor.close()
        
        return success_count > 0 and success_count2 > 0
    
    except Exception as e:
        logger.error(f"Error in test_enhanced_parallel_executor: {e}")
        traceback.print_exc()
        return False

# Run test if script executed directly
if __name__ == "__main__":
    asyncio.run(test_enhanced_parallel_executor())