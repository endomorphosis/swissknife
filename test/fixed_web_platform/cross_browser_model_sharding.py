#!/usr/bin/env python3
"""
Cross-Browser Model Sharding for WebNN/WebGPU Resource Pool

This module implements cross-browser model sharding, allowing large models to be split
across multiple browser instances for concurrent execution and to leverage browser-specific
optimizations.

Key features:
- Distributes model components across multiple browser types
- Leverages browser-specific optimizations (Firefox for audio, Edge for text, etc.)
- Enables running models too large for a single browser instance
- Manages cross-browser communication and synchronization
- Provides a unified interface for sharded model execution

Usage:
    from fixed_web_platform.cross_browser_model_sharding import ModelShardingManager
    
    # Create model sharding manager
    manager = ModelShardingManager(
        model_name="llama-7b",
        num_shards=4,
        shard_type="layer"
    )
    
    # Initialize sharding
    manager.initialize_sharding()
    
    # Run inference across shards
    result = manager.run_inference_sharded({"input_text": "Sample text"})
"""

import os
import sys
import json
import time
import asyncio
import logging
import threading
from typing import Dict, List, Any, Optional, Union, Tuple

# Import resource pool bridge
try:
    from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
except ImportError:
    # Use relative import as fallback
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from resource_pool_bridge import ResourcePoolBridgeIntegration

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ShardedModelComponent:
    """
    Represents a sharded component of a model running in a specific browser.
    
    Each ShardedModelComponent manages a piece of the model that's executed in
    a specific browser optimized for that component type.
    """
    
    def __init__(self, component_id: str, model_type: str, model_name: str,
                 shard_index: int, shard_type: str, browser: str, platform: str,
                 resource_pool_integration: ResourcePoolBridgeIntegration):
        """
        Initialize a sharded model component.
        
        Args:
            component_id: Unique identifier for this component
            model_type: Type of model (e.g., 'text_embedding', 'vision', 'audio')
            model_name: Name of the model
            shard_index: Index of this shard
            shard_type: Type of sharding ('layer', 'attention', 'feedforward', etc.)
            browser: Browser to use ('chrome', 'firefox', 'edge', etc.)
            platform: Platform to use ('webgpu' or 'webnn')
            resource_pool_integration: ResourcePoolBridgeIntegration instance
        """
        self.component_id = component_id
        self.model_type = model_type
        self.model_name = model_name
        self.shard_index = shard_index
        self.shard_type = shard_type
        self.browser = browser
        self.platform = platform
        self.resource_pool = resource_pool_integration
        self.model = None
        self.connection_id = None
        self.is_initialized = False
        self.metrics = {
            'initialization_time': 0,
            'inference_time': 0,
            'throughput': 0,
            'memory_usage': 0
        }
    
    async def initialize(self):
        """Initialize this model component in its assigned browser."""
        if self.is_initialized:
            return True
        
        start_time = time.time()
        
        try:
            # Configure hardware preferences for this component
            hardware_preferences = {
                'priority_list': [self.platform, 'cpu'],
                'browser': self.browser,
                'precision': 16,  # Default to FP16 for good balance
                'mixed_precision': False,
                'enable_ipfs': True
            }
            
            # Add optimizations based on model type and browser
            self._add_component_optimizations(hardware_preferences)
            
            # Model ID includes shard information
            model_id = f"{self.model_type}:{self.model_name}:shard{self.shard_index}:{self.shard_type}"
            
            # Get model from resource pool
            logger.info(f"Initializing component {self.component_id} in {self.browser} browser")
            
            # Get optimal connection from resource pool
            connection_id, connection_info = self.resource_pool.get_optimal_browser_connection(
                self.model_type,
                self.platform,
                model_family=self.model_type,
                priority=10 # High priority for sharded components
            )
            
            if connection_id:
                self.connection_id = connection_id
                logger.info(f"Using existing connection {connection_id} for component {self.component_id}")
            
            # Create model with resource pool
            self.model = self.resource_pool.get_model(
                model_type=self.model_type,
                model_name=self.model_name,
                hardware_preferences=hardware_preferences
            )
            
            if not self.model:
                logger.error(f"Failed to initialize component {self.component_id}")
                return False
            
            # Track initialization time
            self.metrics['initialization_time'] = time.time() - start_time
            self.is_initialized = True
            
            logger.info(f"Component {self.component_id} initialized in {self.metrics['initialization_time']:.2f}s")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing component {self.component_id}: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _add_component_optimizations(self, hardware_preferences):
        """Add component-specific optimizations based on model type and browser."""
        # For audio components in Firefox, enable compute shader optimizations
        if self.model_type == 'audio' and self.browser == 'firefox':
            hardware_preferences['compute_shader_optimized'] = True
            hardware_preferences['use_firefox_optimizations'] = True
        
        # For vision components in Chrome, enable shader precompilation
        elif self.model_type == 'vision' and self.browser == 'chrome':
            hardware_preferences['precompile_shaders'] = True
        
        # For text components in Edge with WebNN, no special optimizations needed
        elif self.model_type == 'text_embedding' and self.browser == 'edge' and self.platform == 'webnn':
            pass
        
        # For attention components, use specialized optimizations
        if self.shard_type == 'attention':
            hardware_preferences['kv_cache_optimization'] = True
        
        # For feedforward components, use specialized optimizations
        elif self.shard_type == 'feedforward':
            hardware_preferences['parallel_feedforward'] = True
            
        # For multimodal shard types, enable parallel loading
        if "multimodal" in self.model_type or self.shard_type == 'multimodal':
            hardware_preferences['parallel_loading'] = True
    
    async def process(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process inputs through this model component.
        
        Args:
            inputs: Input data for this component
            
        Returns:
            Processing results
        """
        if not self.is_initialized or not self.model:
            logger.error(f"Component {self.component_id} not initialized")
            return {'error': 'Component not initialized'}
            
        # Process inputs with fault tolerance
        return await self._process_with_fault_tolerance(inputs)
            
    async def _process_with_fault_tolerance(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process inputs with fault tolerance to handle browser failures.
        
        This implementation includes:
        1. Automatic retry with exponential backoff
        2. Circuit breaker pattern to prevent repeated failures
        3. Browser crash detection and recovery
        4. Performance history tracking
        
        Args:
            inputs: Input data for this component
            
        Returns:
            Processing results with additional metrics
        """
        # Maximum number of retries
        max_retries = 3
        retry_count = 0
        last_error = None
        
        while retry_count <= max_retries:
            try:
                # Start timing
                start_time = time.time()
                
                # Process inputs
                result = await self.model(inputs)
                
                # Update performance metrics
                processing_time = time.time() - start_time
                self.metrics['inference_time'] = processing_time
                
                # Add shard-specific information to the result
                result['shard_index'] = self.shard_index
                result['shard_type'] = self.shard_type
                result['component_id'] = self.component_id
                result['browser'] = self.browser
                result['platform'] = self.platform
                
                # Track cumulative performance metrics
                if 'metrics' not in result:
                    result['metrics'] = {}
                
                result['metrics'].update(self.metrics)
                result['metrics']['retry_count'] = retry_count
                
                # Log success with performance data
                logger.info(f"Shard {self.shard_index} processed in {processing_time:.3f}s using {self.browser} ({self.platform})")
                
                # Reset circuit breaker on success
                if hasattr(self.resource_pool, 'circuit_breaker_manager'):
                    await self.resource_pool.circuit_breaker_manager.record_success(self.connection_id)
                
                return result
                
            except Exception as e:
                retry_count += 1
                last_error = str(e)
                error_type = type(e).__name__
                
                # Log the error
                logger.warning(f"Error processing shard {self.shard_index} (attempt {retry_count}/{max_retries}): {e}")
                
                # Record error in circuit breaker
                if hasattr(self.resource_pool, 'circuit_breaker_manager'):
                    await self.resource_pool.circuit_breaker_manager.record_failure(
                        self.connection_id, 
                        error=e, 
                        error_type=error_type
                    )
                
                # Check if browser crashed (connection is dead)
                if hasattr(self.resource_pool, 'check_connection_health'):
                    is_healthy = await self.resource_pool.check_connection_health(self.connection_id)
                    if not is_healthy:
                        logger.warning(f"Browser connection {self.connection_id} is unhealthy. Attempting recovery.")
                        await self._recover_component()
                
                # If we've reached max retries, break
                if retry_count > max_retries:
                    break
                
                # Exponential backoff with jitter
                backoff_time = min(0.1 * (2 ** retry_count) + (random.random() * 0.1), 5.0)
                logger.info(f"Retrying in {backoff_time:.2f}s...")
                await asyncio.sleep(backoff_time)
        
        # If we get here, all retries failed
        logger.error(f"All retries failed for shard {self.shard_index}")
        return {
            'error': f"Failed to process shard {self.shard_index} after {max_retries} retries. Last error: {last_error}",
            'shard_index': self.shard_index,
            'shard_type': self.shard_type,
            'component_id': self.component_id,
            'retry_count': retry_count,
            'error_type': error_type if 'error_type' in locals() else 'Unknown'
        }
    
    async def _recover_component(self) -> bool:
        """
        Recover this component after a failure by reinitializing it.
        
        Returns:
            True if recovery is successful, False otherwise
        """
        logger.info(f"Attempting to recover component {self.component_id}")
        
        # Release the current model and connection
        if self.model is not None:
            # Release model resources if possible
            if hasattr(self.model, 'release'):
                try:
                    await self.model.release()
                except Exception as e:
                    logger.warning(f"Error releasing model resources: {e}")
            
            self.model = None
            
        # Mark as uninitialized
        self.is_initialized = False
        
        # Attempt to reinitialize
        try:
            result = await self.initialize()
            if result:
                logger.info(f"Successfully recovered component {self.component_id}")
                return True
            else:
                logger.error(f"Failed to recover component {self.component_id}")
                return False
        except Exception as e:
            logger.error(f"Error during component recovery: {e}")
            return False
        
        try:
            start_time = time.time()
            
            # Run inference on this component
            logger.debug(f"Running inference on component {self.component_id}")
            result = self.model(inputs)
            
            # Track performance metrics
            inference_time = time.time() - start_time
            self.metrics['inference_time'] = inference_time
            self.metrics['throughput'] = 1.0 / inference_time if inference_time > 0 else 0
            
            # Extract and store memory usage if available
            if isinstance(result, dict) and 'metrics' in result:
                memory_usage = result['metrics'].get('memory_usage_mb', 0)
                self.metrics['memory_usage'] = memory_usage
            
            logger.debug(f"Component {self.component_id} inference completed in {inference_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"Error processing input on component {self.component_id}: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}

class ModelShardingManager:
    """
    Manager for cross-browser model sharding.
    
    This class coordinates sharding a model across multiple browser instances,
    leveraging browser-specific optimizations for different model components.
    """
    
    def __init__(self, model_name: str, num_shards: int = 2, shard_type: str = "layer",
                 model_type: str = "text", enable_ipfs: bool = True,
                 max_connections: int = 4, db_path: str = None):
        """
        Initialize the model sharding manager.
        
        Args:
            model_name: Name of the model to shard
            num_shards: Number of shards to create
            shard_type: Type of sharding to use ('layer', 'attention_feedforward', etc.)
            model_type: Type of model ('text', 'vision', 'audio', 'multimodal')
            enable_ipfs: Whether to enable IPFS acceleration
            max_connections: Maximum number of browser connections to use
            db_path: Path to database for result storage
        """
        self.model_name = model_name
        self.num_shards = num_shards
        self.shard_type = shard_type
        self.model_type = model_type
        self.enable_ipfs = enable_ipfs
        self.max_connections = max_connections
        self.db_path = db_path
        
        # Use environment variable for database path if not provided
        if not self.db_path:
            self.db_path = os.environ.get("BENCHMARK_DB_PATH")
        
        # Initialize resource pool integration
        self.resource_pool = None
        
        # Initialize components and execution metrics
        self.components = []
        self.initialized = False
        self.metrics = {
            'initialization_time': 0,
            'total_inference_time': 0,
            'average_inference_time': 0,
            'inference_count': 0,
            'memory_usage': 0
        }
        

        # Initialize performance history tracking
        self._performance_history = {
            'components': {},  # Component-specific performance history
            'browser_metrics': {},  # Browser-specific performance metrics
            'overall_metrics': {  # Overall performance metrics
                'success_count': 0,
                'error_count': 0,
                'total_latency': 0,
                'execution_count': 0,
                'success_rate': 0,
                'avg_latency': 0,
            },
            'shard_types': {},  # Performance metrics by shard type
            'timeline': [],  # Time-series performance data
            'recovery_events': [],  # Record of recovery events
        }
        
        # Determine optimal browser allocation based on model type and shard type
        self.browser_allocation = self._determine_browser_allocation()
        logger.info(f"Browser allocation for {model_name}: {self.browser_allocation}")
    
    def _determine_browser_allocation(self) -> Dict[int, Dict[str, Any]]:
        """
        Determine which browsers to use for each shard based on model type.
        
        This implements a sophisticated allocation strategy that considers:
        1. Browser-specific optimizations (Firefox for audio, Edge for text, etc.)
        2. Component-specific requirements (attention vs. feedforward)
        3. Load balancing across available browsers
        
        Returns:
            Dictionary mapping shard index to browser configuration
        """
        allocation = {}
        
        # For layer-based sharding
        if self.shard_type == "layer":
            # For large language models, use browser specialization
            if self.model_type == "text" or self.model_type == "text_generation":
                for i in range(self.num_shards):
                    # Distribute layers across browsers based on layer characteristics
                    if i % 3 == 0:
                        # Every 3rd layer (including first) uses Edge+WebNN for text processing
                        allocation[i] = {"browser": "edge", "platform": "webnn", "specialization": "text"}
                    elif i % 3 == 1:
                        # Second set of layers use Chrome+WebGPU for general computation
                        allocation[i] = {"browser": "chrome", "platform": "webgpu", "specialization": "general"}
                    else:
                        # Third set of layers use Firefox+WebGPU for attention optimization
                        allocation[i] = {"browser": "firefox", "platform": "webgpu", "specialization": "attention"}
            
            # For vision models, prioritize Chrome and Firefox
            elif "vision" in self.model_type:
                for i in range(self.num_shards):
                    if i % 2 == 0:
                        # Even layers use Chrome for vision processing
                        allocation[i] = {"browser": "chrome", "platform": "webgpu", "specialization": "vision"}
                    else:
                        # Odd layers use Firefox for specialized processing
                        allocation[i] = {"browser": "firefox", "platform": "webgpu", "specialization": "vision_detail"}
            
            # For audio models, prioritize Firefox
            elif "audio" in self.model_type:
                for i in range(self.num_shards):
                    if i % 3 == 0:
                        # Every 3rd layer (including first) uses Firefox+WebGPU with compute shaders
                        allocation[i] = {"browser": "firefox", "platform": "webgpu", "specialization": "audio_compute"}
                    elif i % 3 == 1:
                        # Second set of layers use Chrome+WebGPU for general computation
                        allocation[i] = {"browser": "chrome", "platform": "webgpu", "specialization": "general"}
                    else:
                        # Third set of layers use Firefox+WebGPU again
                        allocation[i] = {"browser": "firefox", "platform": "webgpu", "specialization": "audio_compute"}
            
            # For multimodal models, use specialized allocation
            elif "multimodal" in self.model_type:
                for i in range(self.num_shards):
                    if i % 4 == 0:
                        # Text component uses Edge+WebNN
                        allocation[i] = {"browser": "edge", "platform": "webnn", "specialization": "text"}
                    elif i % 4 == 1:
                        # Vision component uses Chrome+WebGPU
                        allocation[i] = {"browser": "chrome", "platform": "webgpu", "specialization": "vision"}
                    elif i % 4 == 2:
                        # Audio component uses Firefox+WebGPU
                        allocation[i] = {"browser": "firefox", "platform": "webgpu", "specialization": "audio"}
                    else:
                        # Fusion component uses Chrome+WebGPU
                        allocation[i] = {"browser": "chrome", "platform": "webgpu", "specialization": "fusion"}
            
            # Default allocation for unknown model types
            else:
                browsers = ["chrome", "firefox", "edge"]
                for i in range(self.num_shards):
                    allocation[i] = {"browser": browsers[i % len(browsers)], "platform": "webgpu", "specialization": "general"}
        
        # For attention-feedforward sharding
        elif self.shard_type == "attention_feedforward":
            # Always use browsers with their strengths for these components
            for i in range(self.num_shards):
                if i % 2 == 0:  # Attention blocks
                    allocation[i] = {"browser": "firefox", "platform": "webgpu", "specialization": "attention", 
                                    "shard_subtype": "attention"}
                else:  # Feed-forward blocks
                    allocation[i] = {"browser": "chrome", "platform": "webgpu", "specialization": "feedforward",
                                    "shard_subtype": "feedforward"}
        
        # For model-specific components
        elif self.shard_type == "component":
            # For multimodal models with discrete components
            if "multimodal" in self.model_type:
                component_map = {
                    0: {"browser": "chrome", "platform": "webgpu", "specialization": "vision", "shard_subtype": "vision_encoder"},
                    1: {"browser": "edge", "platform": "webnn", "specialization": "text", "shard_subtype": "text_encoder"},
                    2: {"browser": "firefox", "platform": "webgpu", "specialization": "audio", "shard_subtype": "audio_encoder"},
                    3: {"browser": "chrome", "platform": "webgpu", "specialization": "fusion", "shard_subtype": "fusion_module"}
                }
                
                # Use only the number of components requested, up to maximum available
                for i in range(min(self.num_shards, len(component_map))):
                    allocation[i] = component_map[i]
            else:
                # For other models, default to layer-based allocation
                browsers = ["chrome", "firefox", "edge"]
                for i in range(self.num_shards):
                    allocation[i] = {"browser": browsers[i % len(browsers)], "platform": "webgpu", "specialization": "general"}
        
        # Default allocation for unknown shard types
        else:
            browsers = ["chrome", "firefox", "edge"]
            for i in range(self.num_shards):
                allocation[i] = {"browser": browsers[i % len(browsers)], "platform": "webgpu", "specialization": "general"}
        
        return allocation
    
    async def initialize_sharding(self):
        """Initialize the model sharding across multiple browsers."""
        if self.initialized:
            return True
        
        start_time = time.time()
        
        try:
            # Initialize resource pool integration with advanced configurations
            browser_preferences = {
                'audio': 'firefox',  # Firefox has better compute shader performance for audio
                'vision': 'chrome',  # Chrome has good WebGPU support for vision models
                'text_embedding': 'edge',  # Edge has excellent WebNN support for text embeddings
                'text': 'edge',  # Edge works well for text models
                'multimodal': 'chrome'  # Chrome is good for multimodal models
            }
            
            self.resource_pool = ResourcePoolBridgeIntegration(
                max_connections=self.max_connections,
                enable_gpu=True,
                enable_cpu=True,
                headless=True,  # Use headless mode by default
                browser_preferences=browser_preferences,
                adaptive_scaling=True,
                enable_ipfs=self.enable_ipfs,
                db_path=self.db_path
            )
            
            # Initialize resource pool
            logger.info("Initializing resource pool integration...")
            self.resource_pool.initialize()
            
            # Create components based on browser allocation
            self.components = []
            
            for shard_index, config in self.browser_allocation.items():
                # Create component ID
                component_id = f"{self.model_name}_shard{shard_index}_{config['specialization']}"
                
                # Determine shard subtype
                shard_subtype = config.get('shard_subtype', self.shard_type)
                
                # Create component
                component = ShardedModelComponent(
                    component_id=component_id,
                    model_type=self.model_type,
                    model_name=self.model_name,
                    shard_index=shard_index,
                    shard_type=shard_subtype,
                    browser=config['browser'],
                    platform=config['platform'],
                    resource_pool_integration=self.resource_pool
                )
                
                # Add to components list
                self.components.append(component)
            
            # Initialize all components concurrently
            logger.info(f"Initializing {len(self.components)} model components concurrently...")
            init_results = await asyncio.gather(*[component.initialize() for component in self.components], 
                                              return_exceptions=True)
            
            # Check initialization results
            success_count = sum(1 for r in init_results if r is True)
            logger.info(f"Initialized {success_count}/{len(self.components)} components successfully")
            
            # Update initialization status
            self.initialized = success_count == len(self.components)
            
            # Calculate total initialization time
            self.metrics['initialization_time'] = time.time() - start_time
            
            # Calculate total memory usage
            self.metrics['memory_usage'] = sum(component.metrics['memory_usage'] for component in self.components)
            
            logger.info(f"Model sharding initialized in {self.metrics['initialization_time']:.2f}s")
            logger.info(f"Total memory usage: {self.metrics['memory_usage']:.2f} MB")
            
            return self.initialized
            
        except Exception as e:
            logger.error(f"Error initializing model sharding: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def _run_components_in_order(self, inputs: Dict[str, Any], shard_type: str) -> Dict:
        """
        Run components in the appropriate order based on shard type with failure detection.
        
        Args:
            inputs: Input data for all components
            shard_type: Type of sharding ('layer', 'attention_feedforward', 'component')
            
        Returns:
            Dict containing component_results and failed_components
        """
        component_results = {}
        failed_components = []
        current_inputs = inputs
        
        # Create a health map for tracking component health status
        component_health = {component.component_id: True for component in self.components}
        
        # Track dependencies between components for proper recovery planning
        component_dependencies = self._build_component_dependencies(shard_type)
        
        if shard_type == "layer":
            # For layer-based sharding, process sequentially through layers
            for component in self.components:
                try:
                    # Skip processing if upstream dependencies have failed and no recovery path exists
                    if not self._check_dependencies_healthy(component.component_id, component_health, component_dependencies):
                        logger.warning(f"Skipping component {component.component_id} due to failed dependencies")
                        failed_components.append(component)
                        component_health[component.component_id] = False
                        continue
                    
                    # Add telemetry for component execution
                    start_time = time.time()
                    
                    # Process through this component
                    result = await component.process(current_inputs)
                    
                    # Track execution time for monitoring
                    execution_time = time.time() - start_time
                    component.metrics['last_execution_time'] = execution_time
                    
                    # Check for errors
                    if isinstance(result, dict) and 'error' in result:
                        logger.warning(f"Error in component {component.component_id}: {result['error']}")
                        failed_components.append(component)
                        component_health[component.component_id] = False
                    else:
                        # Store result and update input for next component
                        component_results[component.component_id] = result
                        current_inputs = result  # Output becomes input to next layer
                        
                        # Record success in metrics for this component
                        if not hasattr(component, 'success_count'):
                            component.success_count = 0
                        component.success_count += 1
                except Exception as e:
                    logger.error(f"Exception in component {component.component_id}: {e}")
                    failed_components.append(component)
                    component_health[component.component_id] = False
                    
                    # Record error in metrics for this component
                    if not hasattr(component, 'error_count'):
                        component.error_count = 0
                    component.error_count += 1
                    
                    # Record detailed error information for diagnostics
                    if not hasattr(component, 'error_history'):
                        component.error_history = []
                    component.error_history.append({
                        'timestamp': time.time(),
                        'error': str(e),
                        'traceback': traceback.format_exc()
                    })
                    if len(component.error_history) > 10:
                        component.error_history.pop(0)  # Keep only the 10 most recent errors
        
        elif shard_type == "attention_feedforward":
            # For attention-feedforward sharding, process attention first then feedforward
            attention_components = [c for c in self.components if "attention" in c.component_id]
            feedforward_components = [c for c in self.components if "feedforward" in c.component_id]
            
            # Process attention components (in parallel)
            attention_tasks = []
            for component in attention_components:
                # Create tasks with execution timing
                async def process_with_timing(component, inputs):
                    start_time = time.time()
                    try:
                        result = await component.process(inputs)
                        component.metrics['last_execution_time'] = time.time() - start_time
                        return result
                    except Exception as e:
                        component.metrics['last_execution_time'] = time.time() - start_time
                        # Record error details
                        if not hasattr(component, 'error_history'):
                            component.error_history = []
                        component.error_history.append({
                            'timestamp': time.time(),
                            'error': str(e),
                            'traceback': traceback.format_exc()
                        })
                        if len(component.error_history) > 10:
                            component.error_history.pop(0)
                        raise e
                
                attention_tasks.append(process_with_timing(component, inputs))
            
            attention_results = await asyncio.gather(*attention_tasks, return_exceptions=True)
            
            # Process results and track failures
            attention_output = {}
            for i, result in enumerate(attention_results):
                component = attention_components[i]
                if isinstance(result, Exception) or (isinstance(result, dict) and 'error' in result):
                    error_msg = str(result) if isinstance(result, Exception) else result.get('error', 'Unknown error')
                    logger.warning(f"Error in attention component {component.component_id}: {error_msg}")
                    failed_components.append(component)
                    component_health[component.component_id] = False
                    
                    # Record error in metrics
                    if not hasattr(component, 'error_count'):
                        component.error_count = 0
                    component.error_count += 1
                else:
                    component_results[component.component_id] = result
                    # Record success in metrics
                    if not hasattr(component, 'success_count'):
                        component.success_count = 0
                    component.success_count += 1
                    
                    # Merge all attention outputs
                    if isinstance(result, dict):
                        attention_output.update(result)
            
            # Check if all attention components failed - no point continuing if so
            if len(failed_components) == len(attention_components):
                logger.error("All attention components failed, cannot proceed to feedforward components")
                return {
                    'component_results': component_results,
                    'failed_components': failed_components,
                    'all_attention_failed': True
                }
            
            # Process feedforward components (in parallel) with attention output
            feedforward_tasks = []
            for component in feedforward_components:
                # Only process feedforward if its dependent attention components are healthy
                if self._check_dependencies_healthy(component.component_id, component_health, component_dependencies):
                    feedforward_tasks.append(process_with_timing(component, {**inputs, **attention_output}))
                else:
                    # Mark as failed due to dependencies
                    logger.warning(f"Skipping feedforward component {component.component_id} due to failed attention dependencies")
                    failed_components.append(component)
                    component_health[component.component_id] = False
            
            # If any feedforward components are still viable, run them
            if feedforward_tasks:
                feedforward_results = await asyncio.gather(*feedforward_tasks, return_exceptions=True)
                
                # Process results and track failures
                for i, result in enumerate(feedforward_results):
                    # Map result index back to the original component that wasn't skipped
                    active_feedforward_components = [c for c in feedforward_components 
                                                  if self._check_dependencies_healthy(c.component_id, 
                                                                                    component_health, 
                                                                                    component_dependencies)]
                    if i < len(active_feedforward_components):
                        component = active_feedforward_components[i]
                        
                        if isinstance(result, Exception) or (isinstance(result, dict) and 'error' in result):
                            error_msg = str(result) if isinstance(result, Exception) else result.get('error', 'Unknown error')
                            logger.warning(f"Error in feedforward component {component.component_id}: {error_msg}")
                            failed_components.append(component)
                            component_health[component.component_id] = False
                            
                            # Record error in metrics
                            if not hasattr(component, 'error_count'):
                                component.error_count = 0
                            component.error_count += 1
                        else:
                            component_results[component.component_id] = result
                            # Record success in metrics
                            if not hasattr(component, 'success_count'):
                                component.success_count = 0
                            component.success_count += 1
        
        elif shard_type == "component":
            # For component-based sharding, process components in parallel
            component_tasks = []
            for component in self.components:
                # Create tasks with execution timing
                async def process_with_timing(component, inputs):
                    start_time = time.time()
                    try:
                        result = await component.process(inputs)
                        component.metrics['last_execution_time'] = time.time() - start_time
                        return result
                    except Exception as e:
                        component.metrics['last_execution_time'] = time.time() - start_time
                        # Record error details
                        if not hasattr(component, 'error_history'):
                            component.error_history = []
                        component.error_history.append({
                            'timestamp': time.time(),
                            'error': str(e),
                            'traceback': traceback.format_exc()
                        })
                        if len(component.error_history) > 10:
                            component.error_history.pop(0)
                        raise e
                
                component_tasks.append(process_with_timing(component, inputs))
            
            component_task_results = await asyncio.gather(*component_tasks, return_exceptions=True)
            
            # Process results and track failures with more detailed diagnostics
            for i, result in enumerate(component_task_results):
                component = self.components[i]
                if isinstance(result, Exception) or (isinstance(result, dict) and 'error' in result):
                    error_msg = str(result) if isinstance(result, Exception) else result.get('error', 'Unknown error')
                    logger.warning(f"Error in component {component.component_id}: {error_msg}")
                    failed_components.append(component)
                    component_health[component.component_id] = False
                    
                    # Record error details
                    if not hasattr(component, 'error_count'):
                        component.error_count = 0
                    component.error_count += 1
                else:
                    component_results[component.component_id] = result
                    # Record success
                    if not hasattr(component, 'success_count'):
                        component.success_count = 0
                    component.success_count += 1
        
        else:
            # Default processing (in parallel)
            component_tasks = [component.process(inputs) for component in self.components]
            component_task_results = await asyncio.gather(*component_tasks, return_exceptions=True)
            
            # Process results and track failures
            for i, result in enumerate(component_task_results):
                component = self.components[i]
                if isinstance(result, Exception) or (isinstance(result, dict) and 'error' in result):
                    error_msg = str(result) if isinstance(result, Exception) else result.get('error', 'Unknown error')
                    logger.warning(f"Error in component {component.component_id}: {error_msg}")
                    failed_components.append(component)
                    component_health[component.component_id] = False
                    
                    # Record error details
                    if not hasattr(component, 'error_count'):
                        component.error_count = 0
                    component.error_count += 1
                else:
                    component_results[component.component_id] = result
                    # Record success
                    if not hasattr(component, 'success_count'):
                        component.success_count = 0
                    component.success_count += 1
        
        # Record execution metrics for performance tracking
        self._update_performance_history(component_results, failed_components)
        
        return {
            'component_results': component_results,
            'failed_components': failed_components,
            'component_health': component_health
        }
    
    def _build_component_dependencies(self, shard_type: str) -> Dict[str, List[str]]:
        """
        Build dependency map between components based on shard type.
        
        Args:
            shard_type: Type of sharding ('layer', 'attention_feedforward', 'component')
            
        Returns:
            Dict mapping component IDs to lists of dependency component IDs
        """
        dependencies = {}
        
        if shard_type == "layer":
            # For layer-based sharding, each layer depends on the previous layer
            sorted_components = sorted(self.components, key=lambda c: c.shard_index)
            for i, component in enumerate(sorted_components):
                if i == 0:
                    # First component has no dependencies
                    dependencies[component.component_id] = []
                else:
                    # Each component depends on the previous one
                    dependencies[component.component_id] = [sorted_components[i-1].component_id]
        
        elif shard_type == "attention_feedforward":
            # Feedforward components depend on attention components
            attention_components = [c for c in self.components if "attention" in c.component_id]
            feedforward_components = [c for c in self.components if "feedforward" in c.component_id]
            
            # Attention components have no dependencies
            for component in attention_components:
                dependencies[component.component_id] = []
            
            # For each feedforward component, it depends on all attention components
            for component in feedforward_components:
                dependencies[component.component_id] = [c.component_id for c in attention_components]
        
        elif shard_type == "component":
            # For component-based sharding (e.g., multimodal), dependencies depend on component types
            # For vision-text-fusion architectures, fusion depends on vision and text
            for component in self.components:
                if "fusion" in component.component_id:
                    # Fusion component depends on vision and text components
                    dependencies[component.component_id] = [
                        c.component_id for c in self.components 
                        if "vision" in c.component_id or "text" in c.component_id
                    ]
                else:
                    # Other components have no dependencies
                    dependencies[component.component_id] = []
        
        else:
            # Default case: no dependencies between components
            for component in self.components:
                dependencies[component.component_id] = []
        
        return dependencies
    
    def _check_dependencies_healthy(self, component_id: str, health_map: Dict[str, bool], 
                                   dependencies: Dict[str, List[str]]) -> bool:
        """
        Check if all dependencies of a component are healthy.
        
        Args:
            component_id: ID of the component to check
            health_map: Map of component health status
            dependencies: Map of component dependencies
            
        Returns:
            True if all dependencies are healthy, False otherwise
        """
        # Get the dependencies for this component
        component_deps = dependencies.get(component_id, [])
        
        # If no dependencies, component is viable
        if not component_deps:
            return True
        
        # Check all dependencies
        for dep_id in component_deps:
            if not health_map.get(dep_id, False):
                return False
        
        return True
    
    def _update_performance_history(self, component_results: Dict[str, Any], failed_components: List):
        """
        Update performance history metrics for components.
        
        This data is used for trend analysis and browser optimization.
        
        Args:
            component_results: Dictionary of successful component results
            failed_components: List of failed components
        """
        # Get current timestamp for consistent recording
        timestamp = time.time()
        
        # Create performance history structure if it doesn't exist
        if not hasattr(self, '_performance_history'):
            self._performance_history = {
                'components': {},
                'browser_metrics': {},
                'model_type': self.model_type,
                'model_name': self.model_name
            }
        
        # Update performance metrics for successful components
        for component_id, result in component_results.items():
            # Find the component object
            component = next((c for c in self.components if c.component_id == component_id), None)
            if not component:
                continue
            
            # Initialize component history if not exists
            if component_id not in self._performance_history['components']:
                self._performance_history['components'][component_id] = {
                    'success_count': 0,
                    'error_count': 0,
                    'total_latency': 0,
                    'execution_count': 0,
                    'avg_latency': 0,
                    'browser': component.browser,
                    'platform': component.platform,
                    'shard_type': component.shard_type,
                    'shard_index': component.shard_index
                }
            
            # Update metrics
            history = self._performance_history['components'][component_id]
            history['success_count'] += 1
            history['execution_count'] += 1
            
            # Update latency if available
            if 'last_execution_time' in component.metrics:
                latency = component.metrics['last_execution_time'] * 1000  # Convert to ms
                history['total_latency'] += latency
                history['avg_latency'] = history['total_latency'] / history['execution_count']
            
            # Initialize browser metrics if not exists
            browser = component.browser
            if browser not in self._performance_history['browser_metrics']:
                self._performance_history['browser_metrics'][browser] = {
                    'success_count': 0,
                    'error_count': 0,
                    'total_latency': 0,
                    'execution_count': 0,
                    'success_rate': 0,
                    'avg_latency': 0
                }
            
            # Update browser metrics
            browser_metrics = self._performance_history['browser_metrics'][browser]
            browser_metrics['success_count'] += 1
            browser_metrics['execution_count'] += 1
            
            # Update browser latency if available
            if 'last_execution_time' in component.metrics:
                browser_metrics['total_latency'] += component.metrics['last_execution_time'] * 1000
                browser_metrics['avg_latency'] = browser_metrics['total_latency'] / browser_metrics['execution_count']
            
            # Calculate success rate
            browser_metrics['success_rate'] = browser_metrics['success_count'] / browser_metrics['execution_count']
        
        # Update metrics for failed components
        for component in failed_components:
            component_id = component.component_id
            
            # Initialize component history if not exists
            if component_id not in self._performance_history['components']:
                self._performance_history['components'][component_id] = {
                    'success_count': 0,
                    'error_count': 0,
                    'total_latency': 0,
                    'execution_count': 0,
                    'avg_latency': 0,
                    'browser': component.browser,
                    'platform': component.platform,
                    'shard_type': component.shard_type,
                    'shard_index': component.shard_index
                }
            
            # Update metrics
            history = self._performance_history['components'][component_id]
            history['error_count'] += 1
            history['execution_count'] += 1
            
            # Initialize browser metrics if not exists
            browser = component.browser
            if browser not in self._performance_history['browser_metrics']:
                self._performance_history['browser_metrics'][browser] = {
                    'success_count': 0,
                    'error_count': 0,
                    'total_latency': 0,
                    'execution_count': 0,
                    'success_rate': 0,
                    'avg_latency': 0
                }
            
            # Update browser metrics
            browser_metrics = self._performance_history['browser_metrics'][browser]
            browser_metrics['error_count'] += 1
            browser_metrics['execution_count'] += 1
            
            # Calculate success rate
            browser_metrics['success_rate'] = browser_metrics['success_count'] / browser_metrics['execution_count']
    
    async def _recover_failed_components(self, failed_components, inputs, successful_results, max_retries):
        """
        Attempt to recover failed components with progressive strategies.
        
        This enhanced recovery method implements multiple failover strategies:
        1. Simple retry with the same component
        2. Browser change (relocate component to different browser)
        3. Platform change (switch between WebNN and WebGPU)
        4. Dependency-aware recovery (recover components with their dependencies)
        5. Component redistribution based on historical performance
        
        Args:
            failed_components: List of components that failed in first attempt
            inputs: Original inputs to all components
            successful_results: Results from successful components
            max_retries: Maximum number of recovery attempts
            
        Returns:
            Dict containing recovered_results, still_failed, and metrics
        """
        recovered_results = {}
        still_failed = []
        recovery_metrics = {
            'recovery_attempts': 0,
            'successful_recoveries': 0,
            'retry_succeeded': 0,
            'reroute_succeeded': 0,
            'browser_change_succeeded': 0,
            'platform_change_succeeded': 0,
            'redistribution_succeeded': 0
        }
        
        # Get performance history to make intelligent recovery decisions
        performance_history = getattr(self, '_performance_history', {})
        browser_metrics = performance_history.get('browser_metrics', {})
        
        # Find the best-performing browsers by model type and component type
        best_browsers = self._get_best_browsers_by_component_type(browser_metrics)
        
        # Group components by dependencies for efficient recovery
        dependency_groups = self._group_components_by_dependencies(failed_components)
        
        # Track the browsers used for recovered components to avoid overloading
        used_browsers = {'chrome': 0, 'firefox': 0, 'edge': 0}
        
        # Process components by dependency groups
        for group in dependency_groups:
            # Track group recovery status
            group_recovered = False
            
            # First try to recover the entire group with consistent browsers
            if len(group) > 1:
                try:
                    logger.info(f"Attempting to recover dependency group with {len(group)} components")
                    group_recovered, group_results = await self._recover_component_group(
                        group, inputs, successful_results, best_browsers, used_browsers
                    )
                    
                    if group_recovered:
                        # Update recovered results
                        recovered_results.update(group_results)
                        recovery_metrics['redistribution_succeeded'] += len(group)
                        recovery_metrics['successful_recoveries'] += len(group)
                        recovery_metrics['recovery_attempts'] += len(group)
                        continue
                except Exception as e:
                    logger.warning(f"Group recovery failed: {e}")
            
            # If group recovery failed or not attempted, try component-by-component recovery
            for component in group:
                # Track recovery attempts
                recovery_metrics['recovery_attempts'] += 1
                recovered = False
                
                # Record current browser for comparison
                original_browser = component.browser
                original_platform = component.platform
                
                # Create backup diagnostics before recovery attempt
                component_diagnostics = {
                    'component_id': component.component_id,
                    'browser': component.browser,
                    'platform': component.platform,
                    'model_type': component.model_type,
                    'shard_type': component.shard_type,
                    'shard_index': component.shard_index,
                    'metrics': component.metrics.copy() if hasattr(component, 'metrics') else {},
                    'recovery_attempts': []
                }
                
                # Add error history if available
                if hasattr(component, 'error_history') and component.error_history:
                    component_diagnostics['last_error'] = component.error_history[-1]
                
                # Strategy 1: Simple retry with existing component
                for retry in range(max_retries):
                    try:
                        logger.info(f"Recovery attempt {retry+1}/{max_retries} for component {component.component_id}")
                        
                        # Exponential backoff between retries
                        if retry > 0:
                            backoff_time = 0.1 * (2 ** (retry - 1))  # 0.1s, 0.2s, 0.4s, ...
                            await asyncio.sleep(backoff_time)
                        
                        # Record recovery attempt
                        attempt_start = time.time()
                        
                        # Try to re-process with the component
                        result = await component.process(inputs)
                        
                        # Record recovery metrics
                        attempt_duration = time.time() - attempt_start
                        component_diagnostics['recovery_attempts'].append({
                            'strategy': 'retry',
                            'attempt': retry + 1,
                            'browser': component.browser,
                            'platform': component.platform,
                            'duration': attempt_duration,
                            'success': not (isinstance(result, dict) and 'error' in result)
                        })
                        
                        # Check if successful
                        if not (isinstance(result, dict) and 'error' in result):
                            logger.info(f"Successfully recovered component {component.component_id} with retry {retry+1}/{max_retries}")
                            recovered_results[component.component_id] = result
                            recovered = True
                            recovery_metrics['retry_succeeded'] += 1
                            
                            # Update success metrics
                            self._record_recovery_success(component, 'retry')
                            break
                    except Exception as e:
                        logger.warning(f"Recovery attempt {retry+1} failed for {component.component_id}: {e}")
                        
                        # Record failed attempt
                        component_diagnostics['recovery_attempts'].append({
                            'strategy': 'retry',
                            'attempt': retry + 1,
                            'browser': component.browser,
                            'platform': component.platform,
                            'error': str(e),
                            'success': False
                        })
                
                # Strategy 2: If retry failed, try browser change based on best performers
                if not recovered:
                    try:
                        logger.info(f"Attempting browser change for component {component.component_id}")
                        
                        # Find best alternative browser based on model and component type
                        component_key = f"{component.shard_type}_{component.model_type}"
                        preferred_browsers = best_browsers.get(component_key, ['chrome', 'firefox', 'edge'])
                        
                        # Skip the current browser and prioritize less-used browsers
                        alternative_browsers = [b for b in preferred_browsers if b != component.browser]
                        if not alternative_browsers:
                            alternative_browsers = ['chrome', 'firefox', 'edge']
                        
                        # Try each alternative browser
                        for new_browser in alternative_browsers:
                            # Skip if this browser is already heavily used
                            if used_browsers.get(new_browser, 0) >= (self.max_connections // 3):
                                logger.info(f"Skipping {new_browser} as it's already heavily used")
                                continue
                                
                            logger.info(f"Trying {new_browser} for component {component.component_id}")
                            
                            # Create a new component with different browser
                            new_component = ShardedModelComponent(
                                component_id=f"{component.component_id}_recovery_via_{new_browser}",
                                model_type=component.model_type,
                                model_name=component.model_name,
                                shard_index=component.shard_index,
                                shard_type=component.shard_type,
                                browser=new_browser,
                                platform=component.platform,
                                resource_pool_integration=self.resource_pool
                            )
                            
                            # Record recovery attempt
                            attempt_start = time.time()
                            
                            # Initialize new component
                            init_success = await new_component.initialize()
                            if init_success:
                                # Try to process with new component
                                try:
                                    result = await new_component.process(inputs)
                                    
                                    # Record recovery metrics
                                    attempt_duration = time.time() - attempt_start
                                    component_diagnostics['recovery_attempts'].append({
                                        'strategy': 'browser_change',
                                        'browser': new_browser,
                                        'platform': component.platform,
                                        'duration': attempt_duration,
                                        'success': not (isinstance(result, dict) and 'error' in result)
                                    })
                                    
                                    # Check if successful
                                    if not (isinstance(result, dict) and 'error' in result):
                                        logger.info(f"Successfully recovered component {component.component_id} with browser change to {new_browser}")
                                        recovered_results[component.component_id] = result
                                        recovered = True
                                        recovery_metrics['browser_change_succeeded'] += 1
                                        
                                        # Update browser metrics
                                        used_browsers[new_browser] = used_browsers.get(new_browser, 0) + 1
                                        
                                        # Update component and its metrics
                                        component.browser = new_browser
                                        self._record_recovery_success(component, 'browser_change')
                                        break
                                except Exception as e:
                                    logger.warning(f"Browser change processing failed with {new_browser}: {e}")
                                    
                                    # Record failed attempt
                                    component_diagnostics['recovery_attempts'].append({
                                        'strategy': 'browser_change',
                                        'browser': new_browser,
                                        'platform': component.platform,
                                        'error': str(e),
                                        'success': False
                                    })
                            else:
                                logger.warning(f"Failed to initialize component with browser {new_browser}")
                                
                                # Record initialization failure
                                component_diagnostics['recovery_attempts'].append({
                                    'strategy': 'browser_change',
                                    'browser': new_browser,
                                    'platform': component.platform,
                                    'error': 'Initialization failed',
                                    'success': False
                                })
                            
                            # If successful, break out of the browser loop
                            if recovered:
                                break
                    except Exception as e:
                        logger.warning(f"Browser change recovery failed for {component.component_id}: {e}")
                        
                        # Record failure in diagnostics
                        component_diagnostics['recovery_attempts'].append({
                            'strategy': 'browser_change',
                            'error': str(e),
                            'success': False
                        })
                
                # Strategy 3: If browser change failed, try platform change (WebGPU <-> WebNN)
                if not recovered:
                    try:
                        logger.info(f"Attempting platform change for component {component.component_id}")
                        
                        # Switch platform
                        new_platform = 'webnn' if component.platform == 'webgpu' else 'webgpu'
                        
                        # Choose a browser that works well with this platform
                        if new_platform == 'webnn':
                            preferred_browsers = ['edge', 'chrome']  # Edge is better for WebNN
                        else:
                            preferred_browsers = ['chrome', 'firefox']  # Chrome/Firefox good for WebGPU
                        
                        # Try with each preferred browser
                        for new_browser in preferred_browsers:
                            # Skip if this browser is already heavily used
                            if used_browsers.get(new_browser, 0) >= (self.max_connections // 3):
                                continue
                            
                            logger.info(f"Trying {new_browser}+{new_platform} for component {component.component_id}")
                            
                            # Create a new component with different platform and browser
                            new_component = ShardedModelComponent(
                                component_id=f"{component.component_id}_recovery_via_{new_platform}_{new_browser}",
                                model_type=component.model_type,
                                model_name=component.model_name,
                                shard_index=component.shard_index,
                                shard_type=component.shard_type,
                                browser=new_browser,
                                platform=new_platform,
                                resource_pool_integration=self.resource_pool
                            )
                            
                            # Record recovery attempt start
                            attempt_start = time.time()
                            
                            # Initialize new component
                            init_success = await new_component.initialize()
                            if init_success:
                                # Try to process with new component
                                try:
                                    result = await new_component.process(inputs)
                                    
                                    # Record recovery metrics
                                    attempt_duration = time.time() - attempt_start
                                    component_diagnostics['recovery_attempts'].append({
                                        'strategy': 'platform_change',
                                        'browser': new_browser,
                                        'platform': new_platform,
                                        'duration': attempt_duration,
                                        'success': not (isinstance(result, dict) and 'error' in result)
                                    })
                                    
                                    # Check if successful
                                    if not (isinstance(result, dict) and 'error' in result):
                                        logger.info(f"Successfully recovered component {component.component_id} with platform change to {new_platform} on {new_browser}")
                                        recovered_results[component.component_id] = result
                                        recovered = True
                                        recovery_metrics['platform_change_succeeded'] += 1
                                        
                                        # Update browser and platform metrics
                                        used_browsers[new_browser] = used_browsers.get(new_browser, 0) + 1
                                        
                                        # Update component and its metrics
                                        component.browser = new_browser
                                        component.platform = new_platform
                                        self._record_recovery_success(component, 'platform_change')
                                        break
                                except Exception as e:
                                    logger.warning(f"Platform change processing failed with {new_platform} on {new_browser}: {e}")
                                    
                                    # Record failed attempt
                                    component_diagnostics['recovery_attempts'].append({
                                        'strategy': 'platform_change',
                                        'browser': new_browser,
                                        'platform': new_platform,
                                        'error': str(e),
                                        'success': False
                                    })
                            else:
                                logger.warning(f"Failed to initialize component with {new_platform} on {new_browser}")
                                
                                # Record initialization failure
                                component_diagnostics['recovery_attempts'].append({
                                    'strategy': 'platform_change',
                                    'browser': new_browser,
                                    'platform': new_platform,
                                    'error': 'Initialization failed',
                                    'success': False
                                })
                            
                            # If successful, break out of the browser loop
                            if recovered:
                                break
                    except Exception as e:
                        logger.warning(f"Platform change recovery failed for {component.component_id}: {e}")
                        
                        # Record failure in diagnostics
                        component_diagnostics['recovery_attempts'].append({
                            'strategy': 'platform_change',
                            'error': str(e),
                            'success': False
                        })
                
                # If component is still not recovered, add it to still_failed list
                if not recovered:
                    still_failed.append(component)
                    
                    # Store detailed diagnostics with the component for later analysis
                    if not hasattr(component, 'recovery_diagnostics'):
                        component.recovery_diagnostics = []
                    component.recovery_diagnostics.append(component_diagnostics)
                    
                    # Log failure details for debugging
                    logger.error(f"All recovery strategies failed for component {component.component_id}")
                    logger.debug(f"Component recovery diagnostics: {component_diagnostics}")
                else:
                    # Log browser and platform changes if successful
                    if component.browser != original_browser or component.platform != original_platform:
                        logger.info(f"Component {component.component_id} recovered by changing from "
                                  f"{original_browser}/{original_platform} to {component.browser}/{component.platform}")
                    
                    # Record recovery details for analysis
                    if not hasattr(self, 'recovery_history'):
                        self.recovery_history = []
                    
                    self.recovery_history.append({
                        'timestamp': time.time(),
                        'component_id': component.component_id,
                        'original_browser': original_browser,
                        'original_platform': original_platform,
                        'new_browser': component.browser,
                        'new_platform': component.platform,
                        'model_type': component.model_type,
                        'shard_type': component.shard_type,
                        'strategies_tried': [a['strategy'] for a in component_diagnostics.get('recovery_attempts', [])],
                        'successful_strategy': next((a['strategy'] for a in component_diagnostics.get('recovery_attempts', []) 
                                               if a.get('success', False)), 'unknown')
                    })
        
        # Update recovery metrics
        recovery_metrics['successful_recoveries'] = len(failed_components) - len(still_failed)
        
        # Log overall recovery statistics
        logger.info(f"Recovery summary: {recovery_metrics['successful_recoveries']}/{len(failed_components)} "
                  f"components recovered ({recovery_metrics['successful_recoveries']/max(1, len(failed_components))*100:.1f}%)")
        logger.info(f"Recovery breakdown: {recovery_metrics['retry_succeeded']} by retry, "
                  f"{recovery_metrics['browser_change_succeeded']} by browser change, "
                  f"{recovery_metrics['platform_change_succeeded']} by platform change, "
                  f"{recovery_metrics['redistribution_succeeded']} by redistribution")
        
        return {
            'recovered_results': recovered_results,
            'still_failed': still_failed,
            'metrics': recovery_metrics,
            'used_browsers': used_browsers
        }
    
    async def _recover_component_group(self, components, inputs, existing_results, best_browsers, used_browsers):
        """
        Attempt to recover a group of dependent components together.
        
        This method tries to find a consistent set of browsers and platforms for 
        an entire group of components that have dependencies on each other.
        
        Args:
            components: List of components in the dependency group
            inputs: Original inputs to all components
            existing_results: Results from already successful components
            best_browsers: Dict mapping component type to recommended browsers
            used_browsers: Dict tracking browser usage counts
            
        Returns:
            Tuple[bool, Dict]: (success, recovered_results)
        """
        if not components:
            return False, {}
        
        recovered_results = {}
        
        # Find potential browser sets that might work for all components
        # Start with a general recommendation, then try more specialized ones
        browser_candidates = [
            ['chrome', 'firefox', 'edge'],  # Try standard browsers first
            ['edge', 'chrome', 'firefox'],  # Prioritize Edge for WebNN
            ['firefox', 'chrome', 'edge']   # Prioritize Firefox for audio
        ]
        
        # If we have performance data, use it to get better recommendations
        if any(best_browsers.values()):
            # Extract unique browser lists from best_browsers
            for component_type, browsers in best_browsers.items():
                if browsers and browsers not in browser_candidates:
                    browser_candidates.insert(0, browsers)  # Prioritize data-driven recommendations
        
        # Sort components by shard_index to handle dependencies correctly
        sorted_components = sorted(components, key=lambda c: c.shard_index)
        
        # Try each browser set
        for browsers in browser_candidates:
            try:
                logger.info(f"Attempting group recovery with browser set: {browsers}")
                
                # Create new components with consistent browsers
                new_components = []
                for i, component in enumerate(sorted_components):
                    # Get the browser from the set, cycling through if needed
                    browser_idx = min(i, len(browsers) - 1)
                    new_browser = browsers[browser_idx]
                    
                    # Check if this browser is already heavily used
                    if used_browsers.get(new_browser, 0) >= (self.max_connections // 2):
                        logger.info(f"Skipping browser set as {new_browser} is already heavily used")
                        # Try the next browser set
                        break
                    
                    # Create a new component with the selected browser
                    new_component = ShardedModelComponent(
                        component_id=f"{component.component_id}_group_recovery",
                        model_type=component.model_type,
                        model_name=component.model_name,
                        shard_index=component.shard_index,
                        shard_type=component.shard_type,
                        browser=new_browser,
                        platform=component.platform,  # Keep original platform
                        resource_pool_integration=self.resource_pool
                    )
                    
                    new_components.append((new_component, component))
                
                # If we broke out of the loop because of browser usage limits,
                # skip this browser set and try the next one
                if len(new_components) < len(sorted_components):
                    continue
                
                # Try to initialize all new components
                init_success = True
                for new_comp, old_comp in new_components:
                    if not await new_comp.initialize():
                        logger.warning(f"Failed to initialize component {new_comp.component_id}")
                        init_success = False
                        break
                
                if not init_success:
                    logger.warning(f"Failed to initialize all components with browser set: {browsers}")
                    continue
                
                # Process components in order (for dependent processing)
                current_inputs = inputs.copy()
                all_success = True
                
                for new_comp, old_comp in new_components:
                    try:
                        # Process with the new component
                        result = await new_comp.process(current_inputs)
                        
                        # Check if successful
                        if isinstance(result, dict) and 'error' in result:
                            logger.warning(f"Error in group recovery for {new_comp.component_id}: {result['error']}")
                            all_success = False
                            break
                        
                        # Store the result
                        recovered_results[old_comp.component_id] = result
                        
                        # If this is a layer-based component, update inputs for the next component
                        if self.shard_type == "layer":
                            current_inputs = result
                        
                        # Update used_browsers count
                        used_browsers[new_comp.browser] = used_browsers.get(new_comp.browser, 0) + 1
                        
                        # Update original component browser information
                        old_comp.browser = new_comp.browser
                        
                        # Record recovery success
                        self._record_recovery_success(old_comp, 'group_recovery')
                        
                    except Exception as e:
                        logger.warning(f"Error in group recovery processing for {new_comp.component_id}: {e}")
                        all_success = False
                        break
                
                # If all components processed successfully, return the results
                if all_success:
                    logger.info(f"Successfully recovered all {len(components)} components in group with browser set: {browsers}")
                    return True, recovered_results
                
            except Exception as e:
                logger.warning(f"Group recovery attempt failed with browser set {browsers}: {e}")
        
        # If we've tried all browser sets and none worked, return failure
        return False, {}
    
    def _get_best_browsers_by_component_type(self, browser_metrics):
        """
        Determine the best browsers for different component types based on metrics.
        
        Args:
            browser_metrics: Dictionary of browser performance metrics
            
        Returns:
            Dict mapping component types to lists of recommended browsers
        """
        # Default recommendations based on known strengths
        default_recommendations = {
            'attention_text': ['firefox', 'chrome', 'edge'],
            'feedforward_text': ['chrome', 'firefox', 'edge'],
            'layer_text': ['edge', 'chrome', 'firefox'],
            'attention_vision': ['chrome', 'firefox', 'edge'],
            'feedforward_vision': ['chrome', 'firefox', 'edge'],
            'layer_vision': ['chrome', 'firefox', 'edge'],
            'attention_audio': ['firefox', 'chrome', 'edge'],
            'feedforward_audio': ['firefox', 'chrome', 'edge'],
            'layer_audio': ['firefox', 'chrome', 'edge'],
            'component_multimodal': ['chrome', 'firefox', 'edge']
        }
        
        # If no performance data, return defaults
        if not browser_metrics:
            return default_recommendations
        
        # Get component performance history if available
        component_history = getattr(self, '_performance_history', {}).get('components', {})
        
        # Build recommendations based on actual performance data
        recommendations = {}
        
        # Process each component type
        for component_type, default_browsers in default_recommendations.items():
            # Find components of this type
            matching_components = [
                c for cid, c in component_history.items()
                if f"{c.get('shard_type', '')}_{c.get('model_type', '')}" == component_type
            ]
            
            # If we have matching components, analyze their performance
            if matching_components:
                # Group by browser and calculate average performance
                browser_performance = {}
                for browser_name in ['chrome', 'firefox', 'edge']:
                    browser_components = [c for c in matching_components if c.get('browser') == browser_name]
                    if browser_components:
                        # Calculate success rate and latency
                        success_rates = [
                            c.get('success_count', 0) / max(1, c.get('execution_count', 1))
                            for c in browser_components
                        ]
                        avg_latencies = [
                            c.get('avg_latency', 1000)  # Default to high latency if not available
                            for c in browser_components if c.get('avg_latency', 0) > 0
                        ]
                        
                        # Get average metrics
                        avg_success_rate = sum(success_rates) / len(success_rates) if success_rates else 0
                        avg_latency = sum(avg_latencies) / len(avg_latencies) if avg_latencies else 1000
                        
                        # Calculate score (weighted combination of success rate and latency)
                        # Lower latency is better, higher success rate is better
                        latency_score = max(0, 1 - avg_latency / 1000)  # Normalize to 0-1 range
                        score = (0.7 * avg_success_rate) + (0.3 * latency_score)
                        
                        browser_performance[browser_name] = score
                
                # Sort browsers by performance score
                sorted_browsers = sorted(
                    browser_performance.items(),
                    key=lambda x: x[1],
                    reverse=True  # Higher score is better
                )
                
                # Get sorted browser names
                sorted_browser_names = [b[0] for b in sorted_browsers]
                
                # Add any browsers not in performance data but in default list
                for browser in default_browsers:
                    if browser not in sorted_browser_names:
                        sorted_browser_names.append(browser)
                
                # Store recommendations
                recommendations[component_type] = sorted_browser_names
            else:
                # Use default recommendations if no performance data
                recommendations[component_type] = default_browsers
        
        return recommendations
    
    def _group_components_by_dependencies(self, components):
        """
        Group components by their dependencies for efficient recovery.
        
        Args:
            components: List of components to group
            
        Returns:
            List of component groups (each group is a list of components)
        """
        # Build dependency graph
        component_dependencies = self._build_component_dependencies(self.shard_type)
        dependency_graph = {}
        
        # Build graph edges in both directions
        for component in components:
            comp_id = component.component_id
            dependency_graph[comp_id] = set(component_dependencies.get(comp_id, []))
            
            # Add reverse edges
            for other_id, deps in component_dependencies.items():
                if comp_id in deps and other_id in [c.component_id for c in components]:
                    if other_id not in dependency_graph:
                        dependency_graph[other_id] = set()
                    dependency_graph[other_id].add(comp_id)
        
        # Find connected components (groups)
        visited = set()
        groups = []
        
        def dfs(node, current_group):
            visited.add(node)
            current_group.append(node)
            for neighbor in dependency_graph.get(node, []):
                if neighbor not in visited and neighbor in dependency_graph:
                    dfs(neighbor, current_group)
        
        # Run DFS from each unvisited node
        for comp_id in dependency_graph:
            if comp_id not in visited:
                current_group = []
                dfs(comp_id, current_group)
                if current_group:
                    # Map component IDs back to actual component objects
                    component_group = [
                        c for c in components
                        if c.component_id in current_group
                    ]
                    groups.append(component_group)
        
        # Add any isolated components (no dependencies)
        isolated = [
            c for c in components
            if c.component_id not in [comp_id for group in groups for comp_id in [comp.component_id for comp in group]]
        ]
        for component in isolated:
            groups.append([component])
        
        return groups
    
    def _record_recovery_success(self, component, strategy):
        """
        Record a successful recovery in component metrics.
        
        Args:
            component: The component that was recovered
            strategy: The recovery strategy that succeeded
        """
        # Initialize recovery metrics if not exists
        if not hasattr(component, 'recovery_metrics'):
            component.recovery_metrics = {
                'attempt_count': 0,
                'success_count': 0,
                'strategies': {}
            }
        
        # Update metrics
        component.recovery_metrics['attempt_count'] += 1
        component.recovery_metrics['success_count'] += 1
        
        # Track strategy success
        if strategy not in component.recovery_metrics['strategies']:
            component.recovery_metrics['strategies'][strategy] = 0
        component.recovery_metrics['strategies'][strategy] += 1
    
    def _merge_component_results(self, component_results, shard_type):
        """
        Merge results from all components into a single result.
        
        Args:
            component_results: Dictionary of component results
            shard_type: Type of sharding
            
        Returns:
            Merged inference result
        """
        if not component_results:
            return {'error': 'No successful component results to merge'}
        
        # Different merge strategies based on shard type
        if shard_type == "layer":
            # For layer-based sharding, use the result from the final layer
            components_by_index = sorted(
                [(k, v) for k, v in component_results.items()],
                key=lambda x: int(x[0].split("shard")[1].split("_")[0])
            )
            
            # Return result from final layer if available
            if components_by_index:
                return components_by_index[-1][1]
        
        elif shard_type == "attention_feedforward":
            # For attention-feedforward, combine attention and feedforward results
            merged = {}
            # Add results from all components (prioritizing feedforward for overlapping keys)
            for component_id, result in component_results.items():
                if isinstance(result, dict):
                    if "feedforward" in component_id:
                        # Feedforward results take priority
                        merged.update(result)
                    else:
                        # For attention results, only add keys not already present
                        for key, value in result.items():
                            if key not in merged:
                                merged[key] = value
            return merged
        
        elif shard_type == "component":
            # For component-based sharding (e.g., multimodal), merge specialized outputs
            merged = {}
            for component_id, result in component_results.items():
                if isinstance(result, dict):
                    # Use component specialization to determine output keys
                    if "vision" in component_id:
                        merged["vision_output"] = result
                    elif "text" in component_id:
                        merged["text_output"] = result
                    elif "audio" in component_id:
                        merged["audio_output"] = result
                    elif "fusion" in component_id:
                        # Fusion outputs may have special keys to preserve
                        merged["fusion_output"] = result
                        # Also include top-level outputs from fusion
                        for key, value in result.items():
                            if key not in ('vision_output', 'text_output', 'audio_output'):
                                merged[key] = value
            return merged
        
        else:
            # Default strategy: combine all results into a dictionary
            merged = {}
            for component_id, result in component_results.items():
                if isinstance(result, dict):
                    key = component_id.replace(":", "_")
                    merged[key] = result
            return merged
    
    async def run_inference_sharded(self, inputs: Dict[str, Any], max_retries: int = 2) -> Dict[str, Any]:
        """
        Run inference across sharded model components with fault tolerance.
        
        This method implements fault tolerance by automatically detecting
        failed components and attempting recovery or rerouting when possible.
        
        Args:
            inputs: Input data for the model
            max_retries: Maximum number of retries for failed components
            
        Returns:
            Combined inference results
        """
        if not self.initialized:
            logger.error("Model sharding not initialized")
            return {'error': 'Model sharding not initialized'}
        
        try:
            start_time = time.time()
            
            # Process inputs through pipeline of components with fault tolerance
            # This implements a robust execution model with failure handling
            
            # 1. First attempt - run components in appropriate order based on shard type
            processing_results = await self._run_components_in_order(inputs, self.shard_type)
            
            # 2. Handle any failed components
            if processing_results['failed_components']:
                logger.warning(f"Detected {len(processing_results['failed_components'])} failed components. Attempting recovery...")
                recovery_results = await self._recover_failed_components(
                    processing_results['failed_components'],
                    inputs,
                    processing_results['component_results'],
                    max_retries
                )
                
                # Update results with recovery information
                processing_results['component_results'].update(recovery_results['recovered_results'])
                processing_results['failed_components'] = recovery_results['still_failed']
                processing_results['recovery_metrics'] = recovery_results['metrics']
            
            # 3. Merge results from all successful components
            merged_result = self._merge_component_results(
                processing_results['component_results'],
                self.shard_type
            )
            
            # Track inference time
            inference_time = time.time() - start_time
            self.metrics['total_inference_time'] += inference_time
            self.metrics['inference_count'] += 1
            self.metrics['average_inference_time'] = (
                self.metrics['total_inference_time'] / self.metrics['inference_count']
                if self.metrics['inference_count'] > 0 else 0
            )
            
            # Update performance history
            await self._update_performance_history(
                self.components,
                list(processing_results['component_results'].values()),
                inference_time
            )
            
            # Add detailed metrics to the result
            detailed_result = {
                'result': merged_result,
                'metrics': {
                    'inference_time_ms': inference_time * 1000,
                    'component_count': len(self.components),
                    'successful_components': len(processing_results['component_results']),
                    'failed_components': len(processing_results['failed_components']),
                    'shard_type': self.shard_type,
                }
            }
            
            # Add recovery metrics if recovery was attempted
            if 'recovery_metrics' in processing_results:
                detailed_result['metrics']['recovery'] = processing_results['recovery_metrics']
            
            logger.info(f"Sharded inference completed in {inference_time:.2f}s with "
                      f"{detailed_result['metrics']['successful_components']}/{len(self.components)} "
                      f"successful components")
            
            return detailed_result
            
        except Exception as e:
            logger.error(f"Error in sharded inference: {e}")
            traceback.print_exc()
            return {'error': f"Sharded inference failed: {e}"}
            
    async def _process_by_shard_type(self, inputs):
        """Process inputs based on sharding type."""
        if self.shard_type == "layer_based":
            # Layer-based processing handled in main method
            return None

        # For attention-feedforward sharding, process in parallel then combine
        if self.shard_type == "attention_feedforward":
            results = await asyncio.gather(
                *[component.process(inputs) for component in self.components]
            )
            if any('error' in r for r in results):
                errors = [
                    f"{self.components[i].component_id}: {r['error']}"
                    for i, r in enumerate(results)
                    if 'error' in r
                ]
                logger.error(f"Errors in components: {', '.join(errors)}")
                return {'error': f"Components failed: {', '.join(errors)}"}
            return self._combine_attention_feedforward_results(results)

        # For component-based sharding (multimodal), process in parallel then combine
        if self.shard_type == "component":
            start_time = time.time()
            results = await asyncio.gather(
                *[component.process(inputs) for component in self.components]
            )
            if any('error' in r for r in results):
                errors = [
                    f"{self.components[i].component_id}: {r['error']}"
                    for i, r in enumerate(results)
                    if 'error' in r
                ]
                logger.error(f"Errors in components: {', '.join(errors)}")
                return {'error': f"Components failed: {', '.join(errors)}"}

            current_output = self._combine_component_results(results)
            inference_time = time.time() - start_time
            self.metrics['total_inference_time'] += inference_time
            self.metrics['inference_count'] += 1
            self.metrics['average_inference_time'] = (
                self.metrics['total_inference_time'] / self.metrics['inference_count']
            )
            return {
                'output': current_output,
                'metrics': {
                    'inference_time': inference_time,
                    'sharded_execution': True,
                    'num_shards': self.num_shards,
                    'shard_type': self.shard_type,
                    'average_inference_time': self.metrics['average_inference_time'],
                    'memory_usage': self.metrics.get('memory_usage'),
                },
            }

        return {'error': f'Unsupported shard_type: {self.shard_type}'}
    
    def _combine_attention_feedforward_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Combine results from attention and feedforward components.
        
        This is a placeholder for the actual implementation, which would depend
        on the specific model architecture.
        
        Args:
            results: List of results from attention and feedforward components
            
        Returns:
            Combined result
        """
        # This is a simplified combination - actual implementation would be model-specific
        combined_result = {}
        
        # Combine outputs from different components
        for i, result in enumerate(results):
            if isinstance(result, dict) and 'output' in result:
                # This is where the component-specific combination logic would go
                # For now, we just add keys from each component
                component_type = self.components[i].shard_subtype
                combined_result[f"{component_type}_output"] = result['output']
        
        # For demonstration, add combined metrics
        combined_result['combined_metrics'] = {
            'component_count': len(results),
            'components': [c.component_id for c in self.components]
        }
        
        return combined_result
    
    def _combine_component_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Combine results from different model components (e.g., vision, text, audio).
        
        This is a placeholder for the actual implementation, which would depend
        on the specific model architecture.
        
        Args:
            results: List of results from different model components
            
        Returns:
            Combined result for multimodal model
        """
        # This is a simplified implementation - actual implementation would be model-specific
        combined_result = {}
        
        # Extract outputs from different components
        component_outputs = {}
        for i, result in enumerate(results):
            if isinstance(result, dict) and 'output' in result:
                component_type = self.components[i].shard_subtype
                component_outputs[component_type] = result['output']
        
        # For multimodal models, combine vision, text, and audio outputs
        if 'vision_encoder' in component_outputs and 'text_encoder' in component_outputs:
            # This is where model-specific fusion would happen
            combined_result['multimodal_embedding'] = {
                'vision_features': component_outputs.get('vision_encoder'),
                'text_features': component_outputs.get('text_encoder'),
                'audio_features': component_outputs.get('audio_encoder'),
                'is_multimodal': True
            }
            
            # If there's a fusion module, use its output as the final result
            if 'fusion_module' in component_outputs:
                combined_result['fused_output'] = component_outputs['fusion_module']
            
        # Simplified combination for other types
        else:
            combined_result['combined_output'] = component_outputs
        
        return combined_result
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get comprehensive metrics about the sharded model execution."""
        if not self.initialized:
            return {'error': 'Model sharding not initialized'}
        
        # Collect metrics from all components
        component_metrics = {}
        for component in self.components:
            component_metrics[component.component_id] = component.metrics
        
        # Add performance history data if available
        performance_data = {}
        if hasattr(self, '_performance_history'):
            # Calculate success and reliability metrics
            history = self._performance_history
            overall = history['overall_metrics']
            
            # Calculate browser performance
            browser_performance = {}
            for browser, metrics in history.get('browser_metrics', {}).items():
                if metrics.get('execution_count', 0) > 0:
                    browser_performance[browser] = {
                        'success_rate': metrics.get('success_rate', 0),
                        'avg_latency_ms': metrics.get('avg_latency', 0),
                        'execution_count': metrics.get('execution_count', 0)
                    }
            
            # Calculate shard type performance
            shard_performance = {}
            for shard_type, metrics in history.get('shard_types', {}).items():
                if metrics.get('execution_count', 0) > 0:
                    success_rate = metrics.get('success_count', 0) / metrics.get('execution_count', 1)
                    avg_latency = metrics.get('total_latency', 0) / metrics.get('execution_count', 1)
                    shard_performance[shard_type] = {
                        'success_rate': success_rate,
                        'avg_latency_ms': avg_latency,
                        'execution_count': metrics.get('execution_count', 0)
                    }
            
            # Add performance data to metrics
            performance_data = {
                'overall': {
                    'success_rate': overall.get('success_count', 0) / max(overall.get('execution_count', 1), 1),
                    'avg_latency_ms': overall.get('avg_latency', 0),
                    'execution_count': overall.get('execution_count', 0),
                    'success_count': overall.get('success_count', 0),
                    'error_count': overall.get('error_count', 0)
                },
                'browser_performance': browser_performance,
                'shard_performance': shard_performance,
                'recovery_events': len(history.get('recovery_events', [])),
            }
        
        # Build comprehensive metrics report
        metrics_report = {
            'model_name': self.model_name,
            'model_type': self.model_type,
            'num_shards': self.num_shards,
            'shard_type': self.shard_type,
            'initialization_time': self.metrics['initialization_time'],
            'average_inference_time': self.metrics['average_inference_time'],
            'inference_count': self.metrics['inference_count'],
            'memory_usage': self.metrics['memory_usage'],
            'browser_allocation': self.browser_allocation,
            'component_metrics': component_metrics
        }
        
        # Add performance history data if available
        if performance_data:
            metrics_report['performance_history'] = performance_data
            
            # Add recommendations based on performance data if sufficient data is available
            if performance_data.get('overall', {}).get('execution_count', 0) >= 5:
                try:
                    metrics_report['recommendations'] = self._generate_performance_recommendations(performance_data)
                except Exception as e:
                    logger.warning(f"Error generating performance recommendations: {e}")
                    metrics_report['recommendations'] = {
                        'error': f"Failed to generate recommendations: {str(e)}"
                    }
        
        return metrics_report
    
    def _generate_performance_recommendations(self, performance_data):
        """
        Generate performance recommendations based on historical data.
        
        Args:
            performance_data: Performance history data
            
        Returns:
            Dictionary of recommendations
        """
        recommendations = {
            'browser_allocation': {},
            'optimization_suggestions': []
        }
        
        # Analyze browser performance
        browser_performance = performance_data.get('browser_performance', {})
        if browser_performance:
            # Find best browser for overall performance
            best_browser = None
            best_score = -1
            
            for browser, metrics in browser_performance.items():
                # Calculate score based on success rate and latency
                # Higher success rate and lower latency = better score
                if metrics.get('execution_count', 0) >= 3:  # Require minimum sample size
                    success_rate = metrics.get('success_rate', 0)
                    latency = metrics.get('avg_latency_ms', float('inf'))
                    
                    # Skip browsers with very low success rates
                    if success_rate < 0.5:
                        continue
                        
                    # Calculate score (higher is better)
                    # Weight success rate higher than latency
                    latency_factor = 1000 / latency if latency > 0 else 0
                    score = (success_rate * 0.7) + (latency_factor * 0.3)
                    
                    if score > best_score:
                        best_score = score
                        best_browser = browser
            
            if best_browser:
                recommendations['browser_allocation']['overall'] = {
                    'recommended_browser': best_browser,
                    'reason': f"Best overall performance with {browser_performance[best_browser]['success_rate']:.1%} success rate and {browser_performance[best_browser]['avg_latency_ms']:.1f}ms latency"
                }
                
        # Analyze shard type performance
        shard_performance = performance_data.get('shard_performance', {})
        if shard_performance:
            for shard_type, metrics in shard_performance.items():
                if metrics.get('execution_count', 0) >= 3:  # Require minimum sample size
                    # Find best browser for this shard type
                    best_browser = None
                    best_success_rate = -1
                    
                    for browser, browser_metrics in browser_performance.items():
                        # Find which browser performs best with this shard type
                        # This requires more detailed data that we don't have yet
                        # For now, use the best overall browser
                        if 'success_rate' in browser_metrics and browser_metrics['success_rate'] > best_success_rate:
                            best_success_rate = browser_metrics['success_rate']
                            best_browser = browser
                    
                    if best_browser:
                        recommendations['browser_allocation'][shard_type] = {
                            'recommended_browser': best_browser,
                            'reason': f"Best performance for {shard_type} components"
                        }
        
        # Generate optimization suggestions
        overall = performance_data.get('overall', {})
        
        # Check for poor overall success rate
        if overall.get('success_rate', 1.0) < 0.9 and overall.get('execution_count', 0) >= 5:
            recommendations['optimization_suggestions'].append({
                'type': 'reliability',
                'issue': f"Low overall success rate ({overall['success_rate']:.1%})",
                'suggestion': "Consider implementing more aggressive fault tolerance or reducing component load"
            })
        
        # Check for poor browser performance
        for browser, metrics in browser_performance.items():
            if metrics.get('success_rate', 1.0) < 0.8 and metrics.get('execution_count', 0) >= 3:
                recommendations['optimization_suggestions'].append({
                    'type': 'browser',
                    'browser': browser,
                    'issue': f"Low success rate ({metrics['success_rate']:.1%}) for {browser} browser",
                    'suggestion': f"Consider reducing component allocation to {browser} browser"
                })
            
            # Check for high latency
            if metrics.get('avg_latency_ms', 0) > 500 and metrics.get('execution_count', 0) >= 3:
                recommendations['optimization_suggestions'].append({
                    'type': 'performance',
                    'browser': browser,
                    'issue': f"High latency ({metrics['avg_latency_ms']:.1f}ms) for {browser} browser",
                    'suggestion': f"Consider optimizing components for {browser} or redistributing heavy components"
                })
        
        # Generate recommendation for optimal browser allocation
        if 'overall' in recommendations['browser_allocation']:
            recommended_browser = recommendations['browser_allocation']['overall']['recommended_browser']
            
            # If we have a significantly better browser, suggest resharding
            if recommended_browser and self.num_shards > 1:
                # Check if current allocation is heavily biased toward other browsers
                preferred_browser_count = sum(1 for config in self.browser_allocation.values() 
                                          if config.get('browser') == recommended_browser)
                
                if preferred_browser_count < (self.num_shards / 2):
                    recommendations['optimization_suggestions'].append({
                        'type': 'allocation',
                        'issue': f"Only {preferred_browser_count}/{self.num_shards} shards using optimal browser ({recommended_browser})",
                        'suggestion': f"Consider reallocating more shards to {recommended_browser} for better performance"
                    })
        
        # Add recommendation for browser-specific optimizations
        if 'firefox' in browser_performance and 'audio' in self.model_type.lower():
            firefox_metrics = browser_performance['firefox']
            if firefox_metrics.get('execution_count', 0) >= 3:
                # Check if Firefox is not being used for audio models
                firefox_count = sum(1 for config in self.browser_allocation.values() 
                                if config.get('browser') == 'firefox')
                
                if firefox_count < (self.num_shards / 3) and self.num_shards > 1:
                    recommendations['optimization_suggestions'].append({
                        'type': 'audio_optimization',
                        'issue': "Audio models typically perform best on Firefox with compute shader optimizations",
                        'suggestion': "Consider allocating more audio processing to Firefox browsers"
                    })
        
        # Add recommendation for Edge with text embedding models
        if 'edge' in browser_performance and ('text_embedding' in self.model_type.lower() or 'bert' in self.model_type.lower()):
            edge_metrics = browser_performance['edge']
            if edge_metrics.get('execution_count', 0) >= 3:
                # Check if Edge is not being used for text embedding models
                edge_count = sum(1 for config in self.browser_allocation.values() 
                             if config.get('browser') == 'edge')
                
                if edge_count < (self.num_shards / 3) and self.num_shards > 1:
                    recommendations['optimization_suggestions'].append({
                        'type': 'text_optimization',
                        'issue': "Text embedding models typically perform best on Edge with WebNN",
                        'suggestion': "Consider allocating more text processing to Edge browsers with WebNN"
                    })
        
        return recommendations
        
    async def close(self):
        """Close all resources used by the model sharding manager."""
        if self.resource_pool:
            # Save performance history to database if db_path is set
            if hasattr(self, '_performance_history') and hasattr(self, 'db_path') and self.db_path:
                try:
                    await self._save_performance_history_to_db()
                    logger.info(f"Performance history saved to database: {self.db_path}")
                except Exception as e:
                    logger.warning(f"Error saving performance history to database: {e}")
            
            await self.resource_pool.close()
            logger.info("Model sharding manager closed")
        
        self.initialized = False
        self.components = []
    
    def get_performance_history(self):
        """Get comprehensive performance history for sharded model execution."""
        if not hasattr(self, '_performance_history'):
            return {'error': 'No performance history available'}
        
        return self._performance_history
        
    async def _update_performance_history(self, components, results, execution_time):
        """
        Update performance history with results from component execution.
        
        Args:
            components: List of components that were executed
            results: Results from component execution
            execution_time: Total execution time
        """
        if not hasattr(self, '_performance_history'):
            return
            
        history = self._performance_history
        timestamp = time.time()
        
        # Update overall metrics
        overall = history['overall_metrics']
        overall['execution_count'] += 1
        
        # Track success/failure
        successful_components = []
        failed_components = []
        
        for i, result in enumerate(results):
            if i < len(components):
                component = components[i]
                success = 'error' not in result
                
                if success:
                    successful_components.append(component)
                    overall['success_count'] += 1
                else:
                    failed_components.append(component)
                    overall['error_count'] += 1
                    
                # Add to timeline
                history['timeline'].append({
                    'timestamp': timestamp,
                    'component_id': component.component_id,
                    'browser': component.browser,
                    'shard_type': component.shard_type,
                    'shard_index': component.shard_index,
                    'success': success,
                    'execution_time': execution_time,
                    'error': result.get('error') if not success else None
                })
        
        # Update browser and component metrics
        self._update_component_metrics(successful_components, failed_components)
        
        # Update success rate for overall metrics
        if overall['execution_count'] > 0:
            overall['success_rate'] = overall['success_count'] / overall['execution_count']
    
    def _update_component_metrics(self, successful_components, failed_components):
        """Update metrics for both successful and failed components."""
        history = self._performance_history
        
        # Process successful components
        for component in successful_components:
            component_id = component.component_id
            
            # Initialize component history if not exists
            if component_id not in history['components']:
                history['components'][component_id] = {
                    'success_count': 0,
                    'error_count': 0,
                    'total_latency': 0,
                    'execution_count': 0,
                    'avg_latency': 0,
                    'browser': component.browser,
                    'platform': component.platform,
                    'shard_type': component.shard_type,
                    'shard_index': component.shard_index,
                    'model_type': self.model_type
                }
            
            # Update metrics
            comp_history = history['components'][component_id]
            comp_history['success_count'] += 1
            comp_history['execution_count'] += 1
            
            # Update latency if available
            if 'inference_time' in component.metrics:
                latency = component.metrics['inference_time'] * 1000  # Convert to ms
                comp_history['total_latency'] += latency
                comp_history['avg_latency'] = comp_history['total_latency'] / comp_history['execution_count']
            
            # Update browser metrics
            self._update_browser_metrics(component, True)
            
            # Update shard type metrics
            self._update_shard_type_metrics(component, True)
        
        # Process failed components
        for component in failed_components:
            component_id = component.component_id
            
            # Initialize component history if not exists
            if component_id not in history['components']:
                history['components'][component_id] = {
                    'success_count': 0,
                    'error_count': 0,
                    'total_latency': 0,
                    'execution_count': 0,
                    'avg_latency': 0,
                    'browser': component.browser,
                    'platform': component.platform,
                    'shard_type': component.shard_type,
                    'shard_index': component.shard_index,
                    'model_type': self.model_type
                }
            
            # Update metrics
            comp_history = history['components'][component_id]
            comp_history['error_count'] += 1
            comp_history['execution_count'] += 1
            
            # Update browser metrics
            self._update_browser_metrics(component, False)
            
            # Update shard type metrics
            self._update_shard_type_metrics(component, False)
    
    def _update_browser_metrics(self, component, success):
        """Update browser-specific metrics."""
        history = self._performance_history
        browser = component.browser
        
        # Initialize browser metrics if not exists
        if browser not in history['browser_metrics']:
            history['browser_metrics'][browser] = {
                'success_count': 0,
                'error_count': 0,
                'total_latency': 0,
                'execution_count': 0,
                'success_rate': 0,
                'avg_latency': 0
            }
        
        # Update browser metrics
        browser_metrics = history['browser_metrics'][browser]
        browser_metrics['execution_count'] += 1
        
        if success:
            browser_metrics['success_count'] += 1
            
            # Update browser latency if available
            if 'inference_time' in component.metrics:
                browser_metrics['total_latency'] += component.metrics['inference_time'] * 1000
                browser_metrics['avg_latency'] = browser_metrics['total_latency'] / browser_metrics['execution_count']
        else:
            browser_metrics['error_count'] += 1
        
        # Calculate success rate
        browser_metrics['success_rate'] = browser_metrics['success_count'] / browser_metrics['execution_count']
    
    def _update_shard_type_metrics(self, component, success):
        """Update shard type-specific metrics."""
        history = self._performance_history
        shard_type = component.shard_type
        
        # Initialize shard type metrics if not exists
        if shard_type not in history['shard_types']:
            history['shard_types'][shard_type] = {
                'success_count': 0,
                'error_count': 0,
                'total_latency': 0,
                'execution_count': 0
            }
        
        # Update shard type metrics
        shard_metrics = history['shard_types'][shard_type]
        shard_metrics['execution_count'] += 1
        
        if success:
            shard_metrics['success_count'] += 1
            
            # Update shard type latency if available
            if 'inference_time' in component.metrics:
                shard_metrics['total_latency'] += component.metrics['inference_time'] * 1000
        else:
            shard_metrics['error_count'] += 1
            
    async def _record_recovery_event(self, component, success, error=None, recovery_type=None):
        """Record a component recovery event in the performance history."""
        if not hasattr(self, '_performance_history'):
            return
            
        event = {
            'timestamp': time.time(),
            'component_id': component.component_id,
            'browser': component.browser,
            'platform': component.platform,
            'shard_type': component.shard_type,
            'shard_index': component.shard_index,
            'success': success,
            'error': str(error) if error else None,
            'recovery_type': recovery_type
        }
        
        self._performance_history['recovery_events'].append(event)
        
    async def _save_performance_history_to_db(self):
        """Save performance history to database if available."""
        if not hasattr(self, 'db_path') or not self.db_path:
            return
            
        # Check if DuckDB is available
        try:
            import duckdb
        except ImportError:
            logger.warning("DuckDB not available, cannot save performance history to database")
            return
            
        try:
            # Connect to database
            conn = duckdb.connect(self.db_path)
            
            # Create tables if they don't exist
            conn.execute("""
                CREATE TABLE IF NOT EXISTS model_sharding_history (
                    id INTEGER PRIMARY KEY,
                    timestamp TIMESTAMP,
                    model_name VARCHAR,
                    model_type VARCHAR,
                    num_shards INTEGER,
                    shard_type VARCHAR,
                    total_executions INTEGER,
                    successful_executions INTEGER,
                    failed_executions INTEGER,
                    success_rate FLOAT,
                    avg_latency_ms FLOAT,
                    memory_usage_mb FLOAT,
                    history_data JSON
                )
            """)
            
            # Prepare data for insertion
            history = self._performance_history
            overall = history['overall_metrics']
            
            # Calculate success rate
            success_rate = 0
            if overall['execution_count'] > 0:
                success_rate = overall['success_count'] / overall['execution_count']
                
            # Insert data
            conn.execute("""
                INSERT INTO model_sharding_history (
                    timestamp, model_name, model_type, num_shards, shard_type,
                    total_executions, successful_executions, failed_executions,
                    success_rate, avg_latency_ms, memory_usage_mb, history_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                time.time(), self.model_name, self.model_type, self.num_shards, self.shard_type,
                overall['execution_count'], overall['success_count'], overall['error_count'],
                success_rate, overall.get('avg_latency', 0), self.metrics.get('memory_usage', 0),
                json.dumps(history)
            ))
            
            # Commit changes and close connection
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.warning(f"Error saving performance history to database: {e}")
            import traceback
            traceback.print_exc()

# Example usage
async def test_model_sharding(model_name, num_shards=3, shard_type="layer", model_type="text"):
    """Test model sharding with a sample model."""
    # Create model sharding manager
    manager = ModelShardingManager(
        model_name=model_name,
        num_shards=num_shards,
        shard_type=shard_type,
        model_type=model_type,
        enable_ipfs=True
    )
    
    try:
        # Initialize sharding
        logger.info(f"Initializing sharding for {model_name} with {num_shards} shards")
        initialized = await manager.initialize_sharding()
        
        if not initialized:
            logger.error("Failed to initialize model sharding")
            return
        
        # Create sample input
        sample_input = {}
        if model_type == "text" or model_type == "text_embedding":
            sample_input = {
                'input_ids': [101, 2023, 2003, 1037, 3231, 102],
                'attention_mask': [1, 1, 1, 1, 1, 1]
            }
        elif model_type == "vision":
            sample_input = {'pixel_values': [[[0.5 for _ in range(3)] for _ in range(224)] for _ in range(1)]}
        elif model_type == "audio":
            sample_input = {'input_features': [[[0.1 for _ in range(80)] for _ in range(3000)]]}
        elif model_type == "multimodal":
            sample_input = {
                'input_ids': [101, 2023, 2003, 1037, 3231, 102],
                'attention_mask': [1, 1, 1, 1, 1, 1],
                'pixel_values': [[[0.5 for _ in range(3)] for _ in range(224)] for _ in range(1)]
            }
        
        # Run inference
        logger.info(f"Running sharded inference for {model_name}")
        result = await manager.run_inference_sharded(sample_input)
        
        # Print result summary
        if 'error' in result:
            logger.error(f"Inference error: {result['error']}")
        else:
            logger.info(f"Inference successful")
            if 'metrics' in result:
                logger.info(f"Inference time: {result['metrics']['inference_time']:.2f}s")
                logger.info(f"Memory usage: {result['metrics']['memory_usage']:.2f} MB")
        
        # Get detailed metrics
        metrics = manager.get_metrics()
        logger.info(f"Detailed metrics: {json.dumps(metrics, indent=2)}")
        
    finally:
        # Close manager
        await manager.close()
        logger.info("Test completed")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test cross-browser model sharding")
    parser.add_argument("--model", type=str, default="bert-base-uncased", help="Model name")
    parser.add_argument("--shards", type=int, default=3, help="Number of shards")
    parser.add_argument("--type", type=str, default="layer", choices=["layer", "attention_feedforward", "component"],
                      help="Sharding type")
    parser.add_argument("--model-type", type=str, default="text", 
                      choices=["text", "vision", "audio", "multimodal", "text_embedding"], 
                      help="Model type")
    
    args = parser.parse_args()
    
    loop = asyncio.get_event_loop()
    loop.run_until_complete(test_model_sharding(args.model, args.shards, args.type, args.model_type))