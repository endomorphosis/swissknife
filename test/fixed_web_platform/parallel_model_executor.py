#!/usr/bin/env python3
"""
Parallel Model Executor for WebNN/WebGPU

This module provides enhanced parallel model execution capabilities for WebNN and WebGPU
platforms, enabling efficient concurrent execution of multiple models across heterogeneous
browser backends.

Key features:
- Dynamic worker pool for parallel model execution
- Cross-browser model execution with intelligent load balancing
- Model-specific optimization based on browser and hardware capabilities
- Automatic batching and result aggregation
- Comprehensive performance metrics and monitoring
- Integration with resource pooling for efficient browser utilization

Usage:
    executor = ParallelModelExecutor(max_workers=4, adaptive_scaling=True)
    executor.initialize()
    results = await executor.execute_models(models_and_inputs)
"""

import os
import sys
import time
import json
import asyncio
import logging
import threading
from typing import Dict, List, Tuple, Any, Optional, Union, Callable

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ParallelModelExecutor:
    """
    Executor for parallel model inference across WebNN/WebGPU platforms.
    
    This class provides a high-performance parallel execution engine for running
    multiple models concurrently across heterogeneous browser backends, with
    intelligent load balancing and resource management.
    """
    
    def __init__(self, 
                 max_workers: int = 4, 
                 max_models_per_worker: int = 3,
                 adaptive_scaling: bool = True,
                 resource_pool_integration = None,
                 browser_preferences: Dict[str, str] = None,
                 execution_timeout: float = 60.0,
                 aggregate_metrics: bool = True):
        """
        Initialize parallel model executor.
        
        Args:
            max_workers: Maximum number of worker processes
            max_models_per_worker: Maximum number of models per worker
            adaptive_scaling: Whether to adapt worker count based on workload
            resource_pool_integration: ResourcePoolBridgeIntegration instance
            browser_preferences: Dict mapping model families to preferred browsers
            execution_timeout: Timeout for model execution (seconds)
            aggregate_metrics: Whether to aggregate performance metrics
        """
        self.max_workers = max_workers
        self.max_models_per_worker = max_models_per_worker
        self.adaptive_scaling = adaptive_scaling
        self.resource_pool_integration = resource_pool_integration
        self.execution_timeout = execution_timeout
        self.aggregate_metrics = aggregate_metrics
        
        # Default browser preferences if none provided
        self.browser_preferences = browser_preferences or {
            'audio': 'firefox',  # Firefox has better compute shader performance for audio
            'vision': 'chrome',  # Chrome has good WebGPU support for vision models
            'text_embedding': 'edge',  # Edge has excellent WebNN support for text embeddings
            'text': 'edge',      # Edge works well for text models
            'multimodal': 'chrome'  # Chrome is good for multimodal models
        }
        
        # Internal state
        self.initialized = False
        self.workers = []
        self.worker_stats = {}
        self.worker_queue = asyncio.Queue()
        self.result_cache = {}
        self.execution_metrics = {
            'total_executions': 0,
            'total_execution_time': 0.0,
            'successful_executions': 0,
            'failed_executions': 0,
            'timeout_executions': 0,
            'model_execution_times': {},
            'worker_utilization': {},
            'browser_utilization': {},
            'aggregate_throughput': 0.0,
            'max_concurrent_models': 0
        }
        
        # Threading and concurrency control
        self.loop = None
        self._worker_monitor_task = None
        self._is_shutting_down = False
    
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
                    from resource_pool_bridge import ResourcePoolBridgeIntegration
                    self.resource_pool_integration = ResourcePoolBridgeIntegration(
                        max_connections=self.max_workers,
                        browser_preferences=self.browser_preferences,
                        adaptive_scaling=self.adaptive_scaling
                    )
                    self.resource_pool_integration.initialize()
                    logger.info("Created new resource pool integration")
                except ImportError:
                    logger.error("ResourcePoolBridgeIntegration not available. Please provide one.")
                    return False
            
            # Ensure resource pool integration is initialized
            if not getattr(self.resource_pool_integration, 'initialized', False):
                if hasattr(self.resource_pool_integration, 'initialize'):
                    self.resource_pool_integration.initialize()
                else:
                    logger.error("Resource pool integration cannot be initialized")
                    return False
            
            # Start worker monitor task
            self._worker_monitor_task = asyncio.create_task(self._monitor_workers())
            
            # Initialize worker queue with max_workers placeholders
            for _ in range(self.max_workers):
                await self.worker_queue.put(None)
            
            self.initialized = True
            logger.info(f"Parallel model executor initialized with {self.max_workers} workers")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing parallel model executor: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def _monitor_workers(self):
        """Monitor worker health and performance."""
        try:
            while not self._is_shutting_down:
                # Wait a bit between checks
                await asyncio.sleep(5.0)
                
                # Skip if not fully initialized
                if not self.initialized:
                    continue
                
                # Get resource pool stats if available
                if (hasattr(self.resource_pool_integration, 'get_stats') and 
                    callable(self.resource_pool_integration.get_stats)):
                    
                    try:
                        stats = self.resource_pool_integration.get_stats()
                        
                        # Update worker utilization metrics
                        if 'current_connections' in stats and 'peak_connections' in stats:
                            current_connections = stats['current_connections']
                            peak_connections = stats['peak_connections']
                            
                            self.execution_metrics['worker_utilization'] = {
                                'current': current_connections,
                                'peak': peak_connections,
                                'utilization_rate': current_connections / self.max_workers if self.max_workers > 0 else 0
                            }
                        
                        # Update browser utilization metrics
                        if 'connection_counts' in stats:
                            self.execution_metrics['browser_utilization'] = stats['connection_counts']
                        
                        # Update aggregate throughput if available
                        if 'throughput' in stats:
                            self.execution_metrics['aggregate_throughput'] = stats['throughput']
                        
                        logger.debug(f"Current worker utilization: {self.execution_metrics['worker_utilization']}")
                    except Exception as e:
                        logger.error(f"Error getting resource pool stats: {e}")
                
                # Check if we need to scale workers based on workload
                if self.adaptive_scaling:
                    self._adapt_worker_count()
        
        except asyncio.CancelledError:
            logger.info("Worker monitor task cancelled")
        except Exception as e:
            logger.error(f"Error in worker monitor: {e}")
    
    def _adapt_worker_count(self):
        """Adapt worker count based on workload and performance metrics."""
        if not self.adaptive_scaling:
            return
        
        try:
            # Get current worker utilization
            current_workers = self.worker_queue.qsize()
            max_workers = self.max_workers
            
            # Check average execution times if available
            avg_execution_time = 0.0
            total_executions = self.execution_metrics['total_executions']
            if total_executions > 0:
                avg_execution_time = self.execution_metrics['total_execution_time'] / total_executions
            
            # Check if we need to scale up
            scale_up = False
            scale_down = False
            
            # Scale up if:
            # 1. Worker queue is empty (all workers are busy)
            # 2. We have room to scale up
            # 3. Average execution time is not too high (possible issue)
            if (self.worker_queue.qsize() == 0 and 
                current_workers < max_workers and 
                avg_execution_time < self.execution_timeout * 0.8):
                scale_up = True
            
            # Scale down if:
            # 1. More than 50% of workers are idle
            # 2. We have more than the minimum workers
            if (self.worker_queue.qsize() > max_workers * 0.5 and 
                current_workers > max(1, max_workers * 0.25)):
                scale_down = True
            
            # Apply scaling decision
            if scale_up:
                # Add a worker to the pool
                new_worker_count = min(current_workers + 1, max_workers)
                workers_to_add = new_worker_count - current_workers
                
                if workers_to_add > 0:
                    logger.info(f"Scaling up workers: {current_workers} -> {new_worker_count}")
                    for _ in range(workers_to_add):
                        await self.worker_queue.put(None)
            
            elif scale_down:
                # Remove a worker from the pool
                new_worker_count = max(1, current_workers - 1)
                workers_to_remove = current_workers - new_worker_count
                
                if workers_to_remove > 0:
                    logger.info(f"Scaling down workers: {current_workers} -> {new_worker_count}")
                    # Note: We don't actually remove from queue, we just let it naturally
                    # reduce by not replacing workers when they complete
                    pass
        
        except Exception as e:
            logger.error(f"Error adapting worker count: {e}")
    
    async def execute_models(self, 
                            models_and_inputs: List[Tuple[str, Dict[str, Any]]], 
                            batch_size: int = 0, 
                            timeout: float = None) -> List[Dict[str, Any]]:
        """
        Execute multiple models in parallel with enhanced load balancing.
        
        This method implements sophisticated parallel execution across browser backends
        using the resource pool integration, with intelligent load balancing, batching,
        and result aggregation.
        
        Args:
            models_and_inputs: List of (model_id, inputs) tuples
            batch_size: Maximum batch size (0 for automatic sizing)
            timeout: Timeout in seconds (None for default)
            
        Returns:
            List of results in same order as inputs
        """
        if not self.initialized:
            if not await self.initialize():
                logger.error("Failed to initialize parallel model executor")
                return [{'success': False, 'error': 'Executor not initialized'} for _ in models_and_inputs]
        
        if not self.resource_pool_integration:
            logger.error("Resource pool integration not available")
            return [{'success': False, 'error': 'Resource pool integration not available'} for _ in models_and_inputs]
        
        # Use timeout if specified, otherwise use default
        execution_timeout = timeout or self.execution_timeout
        
        # Automatic batch sizing if not specified
        if batch_size <= 0:
            # Size batch based on available workers and max models per worker
            available_workers = self.worker_queue.qsize()
            batch_size = max(1, min(available_workers * self.max_models_per_worker, len(models_and_inputs)))
            logger.debug(f"Auto-sized batch to {batch_size} (workers: {available_workers}, max per worker: {self.max_models_per_worker})")
        
        # Track overall execution
        overall_start_time = time.time()
        self.execution_metrics['total_executions'] += len(models_and_inputs)
        
        # Update max concurrent models metric
        self.execution_metrics['max_concurrent_models'] = max(
            self.execution_metrics['max_concurrent_models'],
            len(models_and_inputs)
        )
        
        # Split models into batches for execution
        num_batches = (len(models_and_inputs) + batch_size - 1) // batch_size
        batches = [models_and_inputs[i*batch_size:(i+1)*batch_size] for i in range(num_batches)]
        
        logger.info(f"Executing {len(models_and_inputs)} models in {num_batches} batches (batch size: {batch_size})")
        
        # Execute batches
        all_results = []
        for batch_idx, batch in enumerate(batches):
            logger.debug(f"Executing batch {batch_idx+1}/{num_batches} with {len(batch)} models")
            
            # Create futures and tasks for this batch
            futures = []
            tasks = []
            
            # Group models by family/type for optimal browser selection
            grouped_models = self._group_models_by_family(batch)
            
            # Process each group with appropriate browser
            for family, family_models in grouped_models.items():
                # Get preferred browser for this family
                browser = self.browser_preferences.get(family, self.browser_preferences.get('text', 'chrome'))
                
                # Get platform preference from models (assume all models in group use same platform)
                platform = 'webgpu'  # Default platform
                
                # Process models in this family group
                for model_id, inputs in family_models:
                    # Create future for result
                    future = self.loop.create_future()
                    futures.append((model_id, future))
                    
                    # Create task for model execution
                    task = asyncio.create_task(
                        self._execute_model_with_resource_pool(
                            model_id, inputs, family, platform, browser, future
                        )
                    )
                    tasks.append(task)
            
            # Wait for all tasks to complete with timeout
            try:
                await asyncio.wait(tasks, timeout=execution_timeout)
            except asyncio.TimeoutError:
                logger.warning(f"Timeout waiting for batch {batch_idx+1}/{num_batches}")
            
            # Get results from futures
            batch_results = []
            for model_id, future in futures:
                if future.done():
                    try:
                        result = future.result()
                        batch_results.append(result)
                        
                        # Update execution metrics for successful execution
                        if result.get('success', False):
                            self.execution_metrics['successful_executions'] += 1
                        else:
                            self.execution_metrics['failed_executions'] += 1
                    except Exception as e:
                        logger.error(f"Error getting result for model {model_id}: {e}")
                        batch_results.append({
                            'success': False, 
                            'error': str(e), 
                            'model_id': model_id
                        })
                        self.execution_metrics['failed_executions'] += 1
                else:
                    # Future not done - timeout
                    logger.warning(f"Timeout for model {model_id}")
                    batch_results.append({
                        'success': False, 
                        'error': 'Execution timeout', 
                        'model_id': model_id
                    })
                    future.cancel()  # Cancel the future
                    self.execution_metrics['timeout_executions'] += 1
            
            # Add batch results to overall results
            all_results.extend(batch_results)
        
        # Calculate and update overall metrics
        overall_execution_time = time.time() - overall_start_time
        self.execution_metrics['total_execution_time'] += overall_execution_time
        
        # Calculate throughput
        throughput = len(models_and_inputs) / overall_execution_time if overall_execution_time > 0 else 0
        
        logger.info(f"Executed {len(models_and_inputs)} models in {overall_execution_time:.2f}s ({throughput:.2f} models/s)")
        
        return all_results
    
    def _group_models_by_family(self, models_and_inputs: List[Tuple[str, Dict[str, Any]]]) -> Dict[str, List[Tuple[str, Dict[str, Any]]]]:
        """
        Group models by family/type for optimal browser selection.
        
        Args:
            models_and_inputs: List of (model_id, inputs) tuples
            
        Returns:
            Dictionary mapping family names to lists of (model_id, inputs) tuples
        """
        grouped_models = {}
        
        for model_id, inputs in models_and_inputs:
            # Determine model family from model_id if possible
            family = None
            
            # Check if model_id contains family information (format: family:model_name)
            if ':' in model_id:
                family = model_id.split(':', 1)[0]
            else:
                # Infer family from model name
                if "bert" in model_id.lower():
                    family = "text_embedding"
                elif "vit" in model_id.lower() or "clip" in model_id.lower():
                    family = "vision"
                elif "whisper" in model_id.lower() or "wav2vec" in model_id.lower():
                    family = "audio"
                elif "llava" in model_id.lower() or "flava" in model_id.lower():
                    family = "multimodal"
                else:
                    # Default to text
                    family = "text"
            
            # Add to group
            if family not in grouped_models:
                grouped_models[family] = []
            
            grouped_models[family].append((model_id, inputs))
        
        return grouped_models
    
    async def _execute_model_with_resource_pool(self, 
                                                model_id: str, 
                                                inputs: Dict[str, Any],
                                                family: str,
                                                platform: str,
                                                browser: str,
                                                future: asyncio.Future):
        """
        Execute a model using resource pool with enhanced error handling.
        
        Args:
            model_id: ID of model to execute
            inputs: Input data for model
            family: Model family/type
            platform: Platform to use (webnn, webgpu)
            browser: Browser to use
            future: Future to set with result
        """
        # Get worker from queue with timeout
        worker = None
        try:
            # Wait for available worker with timeout
            worker = await asyncio.wait_for(self.worker_queue.get(), timeout=10.0)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for worker for model {model_id}")
            if not future.done():
                future.set_result({
                    'success': False,
                    'error': 'Timeout waiting for worker',
                    'model_id': model_id
                })
            return
        
        try:
            # Execute using resource pool integration
            start_time = time.time()
            
            result = await self._execute_model(model_id, inputs, family, platform, browser)
            
            execution_time = time.time() - start_time
            
            # Update model-specific execution times
            if model_id not in self.execution_metrics['model_execution_times']:
                self.execution_metrics['model_execution_times'][model_id] = []
            
            self.execution_metrics['model_execution_times'][model_id].append(execution_time)
            
            # Limit history to last 10 executions
            self.execution_metrics['model_execution_times'][model_id] = \
                self.execution_metrics['model_execution_times'][model_id][-10:]
            
            # Set future result if not already done
            if not future.done():
                future.set_result(result)
            
        except Exception as e:
            logger.error(f"Error executing model {model_id}: {e}")
            
            # Set future result with error if not already done
            if not future.done():
                future.set_result({
                    'success': False,
                    'error': str(e),
                    'model_id': model_id
                })
        finally:
            # Return worker to queue
            await self.worker_queue.put(worker)
    
    async def _execute_model(self, 
                           model_id: str, 
                           inputs: Dict[str, Any],
                           family: str,
                           platform: str,
                           browser: str) -> Dict[str, Any]:
        """
        Execute a model using resource pool integration with optimized worker selection.
        
        Args:
            model_id: ID of model to execute
            inputs: Input data for model
            family: Model family/type
            platform: Platform to use (webnn, webgpu)
            browser: Browser to use
            
        Returns:
            Execution result
        """
        try:
            # Make sure resource pool integration is available
            if not self.resource_pool_integration:
                return {
                    'success': False,
                    'error': 'Resource pool integration not available',
                    'model_id': model_id
                }
            
            # Use run_inference method with the bridge
            if hasattr(self.resource_pool_integration, 'bridge') and self.resource_pool_integration.bridge:
                # Set up model type for bridge execution
                model_type = family
                
                # Execute with bridge run_inference
                result = await self.resource_pool_integration.bridge.run_inference(
                    model_id, inputs, retry_attempts=1
                )
                
                # Add missing fields if needed
                if 'model_id' not in result:
                    result['model_id'] = model_id
                
                return result
            
            # Alternatively, use execute_concurrent for a single model
            elif hasattr(self.resource_pool_integration, 'execute_concurrent'):
                # Execute as a single model
                results = self.resource_pool_integration.execute_concurrent([(model_id, inputs)])
                
                # Return first result
                if results and len(results) > 0:
                    return results[0]
                else:
                    return {
                        'success': False,
                        'error': 'No result from execute_concurrent',
                        'model_id': model_id
                    }
            
            # If no execution method is available, return error
            return {
                'success': False,
                'error': 'No execution method available',
                'model_id': model_id
            }
            
        except Exception as e:
            logger.error(f"Error executing model {model_id}: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                'success': False,
                'error': str(e),
                'model_id': model_id
            }
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get comprehensive execution metrics.
        
        Returns:
            Dictionary with detailed execution metrics
        """
        metrics = self.execution_metrics.copy()
        
        # Add derived metrics
        total_executions = metrics['total_executions']
        if total_executions > 0:
            metrics['success_rate'] = metrics['successful_executions'] / total_executions
            metrics['failure_rate'] = metrics['failed_executions'] / total_executions
            metrics['timeout_rate'] = metrics['timeout_executions'] / total_executions
            metrics['avg_execution_time'] = metrics['total_execution_time'] / total_executions
        
        # Add worker metrics
        metrics['workers'] = {
            'max_workers': self.max_workers,
            'max_models_per_worker': self.max_models_per_worker,
            'adaptive_scaling': self.adaptive_scaling
        }
        
        # Add resource pool metrics if available
        if self.resource_pool_integration and hasattr(self.resource_pool_integration, 'get_stats'):
            try:
                resource_pool_stats = self.resource_pool_integration.get_stats()
                metrics['resource_pool'] = resource_pool_stats
            except Exception as e:
                logger.error(f"Error getting resource pool stats: {e}")
        
        return metrics
    
    async def close(self):
        """Close the parallel model executor and release resources."""
        # Set shutting down flag
        self._is_shutting_down = True
        
        # Cancel worker monitor task
        if self._worker_monitor_task:
            self._worker_monitor_task.cancel()
            try:
                await self._worker_monitor_task
            except asyncio.CancelledError:
                pass
            self._worker_monitor_task = None
        
        # Close resource pool integration if we created it
        if self.resource_pool_integration and hasattr(self.resource_pool_integration, 'close'):
            self.resource_pool_integration.close()
        
        # Clear state
        self.initialized = False
        logger.info("Parallel model executor closed")


# Helper function to create and initialize executor
async def create_parallel_model_executor(
    max_workers: int = 4,
    adaptive_scaling: bool = True,
    resource_pool_integration = None
) -> Optional[ParallelModelExecutor]:
    """
    Create and initialize a parallel model executor.
    
    Args:
        max_workers: Maximum number of worker processes
        adaptive_scaling: Whether to adapt worker count based on workload
        resource_pool_integration: ResourcePoolBridgeIntegration instance
        
    Returns:
        Initialized executor or None on failure
    """
    executor = ParallelModelExecutor(
        max_workers=max_workers,
        adaptive_scaling=adaptive_scaling,
        resource_pool_integration=resource_pool_integration
    )
    
    if await executor.initialize():
        return executor
    else:
        logger.error("Failed to initialize parallel model executor")
        return None


# Test function for the executor
async def test_parallel_model_executor():
    """Test parallel model executor functionality."""
    # Create resource pool integration
    try:
        from resource_pool_bridge import ResourcePoolBridgeIntegration
        integration = ResourcePoolBridgeIntegration(max_connections=4)
        integration.initialize()
    except ImportError:
        logger.error("ResourcePoolBridgeIntegration not available for testing")
        return False
    
    # Create and initialize executor
    executor = await create_parallel_model_executor(
        max_workers=4,
        resource_pool_integration=integration
    )
    
    if not executor:
        logger.error("Failed to create parallel model executor")
        return False
    
    try:
        # Define test models
        test_models = [
            ("text_embedding:bert-base-uncased", {"input_ids": [101, 2023, 2003, 1037, 3231, 102], "attention_mask": [1, 1, 1, 1, 1, 1]}),
            ("vision:google/vit-base-patch16-224", {"pixel_values": [[[0.5 for _ in range(3)] for _ in range(224)] for _ in range(1)]}),
            ("audio:openai/whisper-tiny", {"input_features": [[[0.1 for _ in range(80)] for _ in range(3000)]]})
        ]
        
        # Execute models
        logger.info("Executing test models in parallel...")
        results = await executor.execute_models(test_models)
        
        # Check results
        success_count = sum(1 for r in results if r.get('success', False))
        logger.info(f"Executed {len(results)} models with {success_count} successes")
        
        # Get metrics
        metrics = executor.get_metrics()
        logger.info(f"Execution metrics: {json.dumps(metrics, indent=2)}")
        
        # Close executor
        await executor.close()
        
        return success_count > 0
    
    except Exception as e:
        logger.error(f"Error in test_parallel_model_executor: {e}")
        import traceback
        traceback.print_exc()
        
        # Close executor
        await executor.close()
        
        return False

# Run test if script executed directly
if __name__ == "__main__":
    import asyncio
    asyncio.run(test_parallel_model_executor())