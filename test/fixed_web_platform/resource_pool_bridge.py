#!/usr/bin/env python3
"""
Resource Pool Bridge for WebNN/WebGPU acceleration.

This module provides a bridge between the resource pool and WebNN/WebGPU backends,
allowing for efficient allocation and utilization of browser-based acceleration resources.
"""

import os
import sys
import json
import time
import random
import logging
import asyncio
import platform
import traceback

# Check for psutil availability
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('ResourcePool')

class MockFallbackModel:
    """Mock model class used as a fallback when all else fails."""
    
    def __init__(self, model_name, model_type, hardware_type="cpu"):
        self.model_name = model_name
        self.model_type = model_type
        self.hardware_type = hardware_type
        
    def __call__(self, inputs):
        """Simulate model inference."""
        return {
            "success": True,
            "model_name": self.model_name,
            "model_type": self.model_type,
            "hardware": self.hardware_type,
            "platform": self.hardware_type,
            "is_real_hardware": False,
            "is_simulation": True,
            "processing_time": 0.1,
            "inference_time": 0.1,
            "total_time": 0.2,
            "latency_ms": 100,
            "throughput_items_per_sec": 10,
            "memory_usage_mb": 100,
            "result": "Mock fallback model result"
        }

class EnhancedWebModel:
    """
    Enhanced web model with browser-specific optimizations.
    
    This enhanced model implementation includes:
    - Browser-specific optimizations for different model types
    - Hardware platform selection based on model requirements
    - Simulation capabilities for testing and development
    - Performance tracking and telemetry
    - Tensor sharing for multi-model efficiency
    """
    
    def __init__(self, model_name, model_type, hardware_type, browser=None, **kwargs):
        self.model_name = model_name
        self.model_type = model_type
        self.hardware_type = hardware_type
        self.browser = browser or 'chrome'  # Default to Chrome if not specified
        self.inference_count = 0
        self.total_inference_time = 0
        self.avg_inference_time = 0
        
        # Set optimization flags - will be populated from kwargs
        # Note: We convert compute_shaders to compute_shader_optimized
        self.compute_shader_optimized = kwargs.get('compute_shaders', False)
        self.precompile_shaders = kwargs.get('precompile_shaders', False)
        self.parallel_loading = kwargs.get('parallel_loading', False)
        self.mixed_precision = kwargs.get('mixed_precision', False)
        self.precision = kwargs.get('precision', 16)
        
        # Get shared tensors if available
        self.shared_tensors = kwargs.get('shared_tensors', {})
        self.uses_shared_tensors = len(self.shared_tensors) > 0
        
        # Debug init
        logger.debug(f"EnhancedWebModel initialized with optimization flags: compute_shader_optimized={self.compute_shader_optimized}, precompile_shaders={self.precompile_shaders}, parallel_loading={self.parallel_loading}")
        if self.uses_shared_tensors:
            logger.debug(f"Model using shared tensors: {list(self.shared_tensors.keys())}")
        
    def __call__(self, inputs):
        """
        Simulate model inference with browser-specific optimizations.
        
        This implementation provides detailed metrics and simulates:
        - Browser-specific performance characteristics
        - Hardware platform efficiency
        - Model type optimization effects
        - Tensor sharing acceleration
        """
        # Track inference count
        self.inference_count += 1
        
        # Log optimization flags
        optimization_status = {
            'compute_shader_optimized': self.compute_shader_optimized,
            'precompile_shaders': self.precompile_shaders,
            'parallel_loading': self.parallel_loading,
            'mixed_precision': self.mixed_precision,
            'precision': self.precision,
            'using_shared_tensors': self.uses_shared_tensors
        }
        logger.debug(f"Model {self.model_name} optimization flags: {optimization_status}")
        
        # Determine inference time based on model and browser characteristics
        base_time = 0.1  # Base inference time
        
        # Apply speedup if using shared tensors
        # This simulates the performance improvement from tensor sharing
        shared_tensor_speedup = 1.0
        if self.uses_shared_tensors:
            # Using shared tensors provides significant speedup
            # Different components provide different levels of speedup
            for tensor_type in self.shared_tensors.keys():
                if 'embedding' in tensor_type:
                    shared_tensor_speedup *= 0.7  # 30% faster with shared embeddings
                elif 'attention' in tensor_type:
                    shared_tensor_speedup *= 0.8  # 20% faster with shared attention
            logger.debug(f"Using shared tensors: speedup factor {shared_tensor_speedup}")
        
        # Adjust for model type
        if 'audio' in self.model_type.lower():
            if self.browser == 'firefox':
                # Firefox is optimized for audio models
                model_factor = 0.8
            else:
                model_factor = 1.2
        elif 'vision' in self.model_type.lower():
            if self.browser == 'chrome':
                # Chrome is optimized for vision models
                model_factor = 0.85
            else:
                model_factor = 1.1
        elif 'text_embedding' in self.model_type.lower() or 'bert' in self.model_type.lower():
            if self.browser == 'edge':
                # Edge is optimized for text embedding models
                model_factor = 0.9
            else:
                model_factor = 1.0
        else:
            model_factor = 1.0
        
        # Adjust for hardware platform
        if self.hardware_type == 'webgpu':
            hardware_factor = 0.7  # WebGPU is faster
        elif self.hardware_type == 'webnn':
            hardware_factor = 0.8  # WebNN is faster
        else:
            hardware_factor = 1.2  # CPU is slower
        
        # Calculate simulated inference time with shared tensor speedup
        inference_time = base_time * model_factor * hardware_factor * shared_tensor_speedup
        
        # Update tracking metrics
        self.total_inference_time += inference_time
        self.avg_inference_time = self.total_inference_time / self.inference_count
        
        # Calculate memory usage based on precision and shared tensors
        base_memory = 100  # Base memory usage in MB
        memory_for_precision = {
            2: 0.25,  # 2-bit uses 25% of base memory
            3: 0.30,  # 3-bit uses 30% of base memory
            4: 0.4,   # 4-bit uses 40% of base memory
            8: 0.6,   # 8-bit uses 60% of base memory
            16: 1.0   # 16-bit uses 100% of base memory
        }
        precision_factor = memory_for_precision.get(self.precision, 1.0)
        
        # Calculate memory savings from shared tensors
        memory_saving_factor = 1.0
        if self.uses_shared_tensors:
            # Shared tensors save memory
            memory_saving_factor = 0.85  # 15% memory savings
        
        memory_usage = base_memory * precision_factor * memory_saving_factor
        
        # Prepare output tensors that could be shared with other models
        output_tensors = {}
        if 'text_embedding' in self.model_type.lower() or 'bert' in self.model_type.lower():
            # For text models, we could share embeddings
            output_tensors["text_embedding"] = f"Simulated text embedding tensor for {self.model_name}"
        elif 'vision' in self.model_type.lower():
            # For vision models, we could share image features
            output_tensors["vision_embedding"] = f"Simulated vision embedding tensor for {self.model_name}"
        
        # Return comprehensive result with optimization flags and shared tensor info
        result = {
            "success": True,
            "model_name": self.model_name,
            "model_type": self.model_type,
            "hardware": self.hardware_type,
            "platform": self.hardware_type,
            "browser": self.browser,
            "is_real_hardware": False,
            "is_simulation": True,
            "processing_time": inference_time * 0.8,
            "inference_time": inference_time,
            "total_time": inference_time * 1.2,
            "latency_ms": inference_time * 1000,  # Convert to ms
            "throughput_items_per_sec": 1.0 / inference_time,
            "memory_usage_mb": memory_usage,
            "compute_shader_optimized": self.compute_shader_optimized,
            "precompile_shaders": self.precompile_shaders,
            "parallel_loading": self.parallel_loading,
            "mixed_precision": self.mixed_precision,
            "precision": self.precision,
            "output_tensors": output_tensors,
            "result": "Enhanced web model result"
        }
        
        # Add shared tensor info if used
        if self.uses_shared_tensors:
            result["shared_tensors_used"] = list(self.shared_tensors.keys())
            result["shared_tensor_speedup"] = (1.0 / shared_tensor_speedup - 1.0) * 100.0  # Convert to percentage
        
        return result

class ResourcePoolBridgeIntegration:
    """Bridge integration between resource pool and WebNN/WebGPU backends."""
    
    def __init__(self, max_connections=4, enable_gpu=True, enable_cpu=True,
                 headless=True, browser_preferences=None, adaptive_scaling=True,
                 monitoring_interval=60, enable_ipfs=True, db_path=None):
        """Initialize the resource pool bridge integration."""
        self.max_connections = max_connections
        self.enable_gpu = enable_gpu
        self.enable_cpu = enable_cpu
        self.headless = headless
        self.browser_preferences = browser_preferences or {}
        self.adaptive_scaling = adaptive_scaling
        self.monitoring_interval = monitoring_interval
        self.enable_ipfs = enable_ipfs
        self.db_path = db_path
        
        # Initialize logger
        logger.info(f"ResourcePoolBridgeIntegration created with max_connections={max_connections}, adaptive_scaling={'enabled' if adaptive_scaling else 'disabled'}, IPFS={'enabled' if enable_ipfs else 'disabled'}")
    
    async def initialize(self):
        """
        Initialize the resource pool bridge with real browser integration.
        
        This enhanced implementation:
        1. Sets up real browser connections using Selenium
        2. Establishes WebSocket communication channels
        3. Configures browser-specific optimizations
        4. Manages connection pool with both real and simulated resources
        
        Returns:
            True if initialization was successful, False otherwise
        """
        try:
            # Try importing WebSocket bridge and browser automation
            from fixed_web_platform.websocket_bridge import WebSocketBridge, create_websocket_bridge
            from fixed_web_platform.browser_automation import BrowserAutomation
            
            self.websocket_bridge_class = WebSocketBridge
            self.create_websocket_bridge = create_websocket_bridge
            self.browser_automation_class = BrowserAutomation
            self.real_browser_available = True
            
            logger.info("WebSocket bridge and browser automation modules loaded successfully")
            
            # Create connection pool for browsers
            self.browser_connections = {}
            self.active_connections = 0
            
            # Create browser connection pool based on max_connections
            if self.adaptive_scaling:
                # Start with fewer connections and scale up as needed
                initial_connections = max(1, self.max_connections // 2)
                logger.info(f"Adaptive scaling enabled, starting with {initial_connections} browser connections")
                
                # Initialize adaptive manager if adaptive scaling is enabled
                from fixed_web_platform.adaptive_scaling import AdaptiveConnectionManager
                self.adaptive_manager = AdaptiveConnectionManager(
                    max_connections=self.max_connections,
                    browser_preferences=self.browser_preferences,
                    monitoring_interval=self.monitoring_interval
                )
                
                # Create browser connections
                await self._setup_initial_connections(initial_connections)
                
                # Initialize circuit breaker manager for connection health monitoring
                try:
                    from fixed_web_platform.resource_pool_circuit_breaker import ResourcePoolCircuitBreakerManager
                    self.circuit_breaker_manager = ResourcePoolCircuitBreakerManager(self.browser_connections)
                    await self.circuit_breaker_manager.initialize()
                    logger.info("Circuit breaker manager initialized for connection health monitoring")
                except ImportError as e:
                    logger.warning(f"Circuit breaker not available: {e}")
                except Exception as e:
                    logger.warning(f"Error initializing circuit breaker: {e}")
            else:
                # Create all connections at once
                logger.info(f"Adaptive scaling disabled, creating {self.max_connections} browser connections")
                await self._setup_initial_connections(self.max_connections)
            
            logger.info(f"Resource pool bridge initialized with {len(self.browser_connections)} browser connections")
            return True
            
        except ImportError as e:
            logger.warning(f"Could not import WebSocket bridge or browser automation: {e}")
            logger.info("Falling back to simulation mode")
            self.real_browser_available = False
            
            # Initialize adaptive manager if adaptive scaling is enabled (simulation mode)
            if self.adaptive_scaling:
                try:
                    from fixed_web_platform.adaptive_scaling import AdaptiveConnectionManager
                    self.adaptive_manager = AdaptiveConnectionManager(
                        max_connections=self.max_connections,
                        browser_preferences=self.browser_preferences,
                        monitoring_interval=self.monitoring_interval
                    )
                    logger.info("Adaptive scaling manager initialized in simulation mode")
                except ImportError:
                    logger.warning("Could not import AdaptiveConnectionManager, adaptive scaling disabled")
            
            return True
            
        except Exception as e:
            logger.error(f"Error initializing resource pool bridge: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def _setup_initial_connections(self, num_connections):
        """
        Set up initial browser connections with enhanced error handling.
        
        This method creates browser connections based on the desired distribution and applies
        browser-specific optimizations. It includes improved error handling with timeouts,
        retry logic, and comprehensive diagnostics.
        
        Args:
            num_connections: Number of connections to create
        """
        # Import error handling components
        from fixed_web_platform.unified_framework.error_handling import ErrorHandler, with_retry, with_timeout

        # Determine browser distribution
        browser_distribution = self._calculate_browser_distribution(num_connections)
        logger.info(f"Browser distribution: {browser_distribution}")
        
        # Track connection attempts and failures for diagnostics
        attempted_connections = 0
        failed_connections = 0
        successful_connections = 0
        connection_errors = {}
        
        # Create browser connections
        for browser, count in browser_distribution.items():
            for i in range(count):
                # Create connection with different port for each browser
                port = 8765 + len(self.browser_connections)
                
                # Determine platform to use (WebGPU or WebNN)
                # For text embedding models, WebNN on Edge is best
                # For audio models, WebGPU on Firefox is best
                # For vision models, WebGPU on Chrome is best
                platform = "webgpu"  # Default
                compute_shaders = False
                precompile_shaders = True
                parallel_loading = False
                
                if browser == "edge":
                    platform = "webnn"  # Edge has excellent WebNN support
                elif browser == "firefox":
                    compute_shaders = True  # Firefox has great compute shader performance
                
                # Launch browser and create WebSocket bridge
                connection_id = f"{browser}_{platform}_{i+1}"
                attempted_connections += 1
                
                try:
                    # Set up browser automation
                    automation = self.browser_automation_class(
                        platform=platform,
                        browser_name=browser,
                        headless=self.headless,
                        compute_shaders=compute_shaders,
                        precompile_shaders=precompile_shaders,
                        parallel_loading=parallel_loading,
                        test_port=port
                    )
                    
                    # Define retriable launch function
                    async def launch_with_retry():
                        return await automation.launch(allow_simulation=True)
                    
                    # Launch browser with timeout and retry
                    try:
                        success = await asyncio.wait_for(
                            automation.launch(allow_simulation=True),
                            timeout=30  # 30 second timeout for browser launch
                        )
                    except asyncio.TimeoutError:
                        logger.error(f"Timeout while launching browser for {connection_id}")
                        # Record the error for diagnostics
                        connection_errors[connection_id] = "browser_launch_timeout"
                        failed_connections += 1
                        continue
                    except Exception as launch_error:
                        logger.error(f"Error launching browser for {connection_id}: {launch_error}")
                        # Record the error for diagnostics
                        connection_errors[connection_id] = f"browser_launch_error: {type(launch_error).__name__}"
                        failed_connections += 1
                        continue
                    
                    if success:
                        # Create WebSocket bridge
                        try:
                            bridge = await asyncio.wait_for(
                                self.create_websocket_bridge(port=port),
                                timeout=10  # 10 second timeout for bridge creation
                            )
                        except asyncio.TimeoutError:
                            logger.error(f"Timeout while creating WebSocket bridge for {connection_id}")
                            await automation.close()
                            # Record the error for diagnostics
                            connection_errors[connection_id] = "websocket_bridge_timeout"
                            failed_connections += 1
                            continue
                        except Exception as bridge_error:
                            logger.error(f"Error creating WebSocket bridge for {connection_id}: {bridge_error}")
                            await automation.close()
                            # Record the error for diagnostics
                            connection_errors[connection_id] = f"websocket_bridge_error: {type(bridge_error).__name__}"
                            failed_connections += 1
                            continue
                        
                        if bridge:
                            # Wait for connection to be established
                            try:
                                connected = await asyncio.wait_for(
                                    bridge.wait_for_connection(timeout=10),
                                    timeout=15  # 15 second total timeout
                                )
                            except asyncio.TimeoutError:
                                logger.error(f"Timeout while waiting for WebSocket connection for {connection_id}")
                                await automation.close()
                                # Record the error for diagnostics
                                connection_errors[connection_id] = "websocket_connection_timeout"
                                failed_connections += 1
                                continue
                            except Exception as connection_error:
                                logger.error(f"Error establishing WebSocket connection for {connection_id}: {connection_error}")
                                await automation.close()
                                # Record the error for diagnostics
                                connection_errors[connection_id] = f"websocket_connection_error: {type(connection_error).__name__}"
                                failed_connections += 1
                                continue
                            
                            if connected:
                                # Store connection
                                self.browser_connections[connection_id] = {
                                    "automation": automation,
                                    "bridge": bridge,
                                    "platform": platform,
                                    "browser": browser,
                                    "port": port,
                                    "active": False,
                                    "initialized_models": set(),
                                    "compute_shaders": compute_shaders,
                                    "precompile_shaders": precompile_shaders,
                                    "parallel_loading": parallel_loading,
                                    "is_simulation": getattr(automation, "simulation_mode", True),
                                    "connection_time": time.time(),
                                    "error_count": 0,
                                    "success_count": 0,
                                    "last_error": None,
                                    "last_error_time": None,
                                    "reconnect_attempts": 0
                                }
                                
                                logger.info(f"Successfully created browser connection: {connection_id}")
                                successful_connections += 1
                                
                                # Check browser capabilities
                                try:
                                    capabilities = await asyncio.wait_for(
                                        bridge.get_browser_capabilities(),
                                        timeout=10  # 10 second timeout for capability check
                                    )
                                except (asyncio.TimeoutError, Exception) as cap_error:
                                    logger.warning(f"Error checking browser capabilities for {connection_id}: {cap_error}")
                                    capabilities = None
                                
                                if capabilities:
                                    # Update connection info with capabilities
                                    self.browser_connections[connection_id]["capabilities"] = capabilities
                                    
                                    # Log capability summary
                                    webgpu_support = capabilities.get("webgpu_supported", False)
                                    webnn_support = capabilities.get("webnn_supported", False)
                                    
                                    logger.info(f"Connection {connection_id} supports: WebGPU={webgpu_support}, WebNN={webnn_support}")
                                    
                                    if platform == "webgpu" and not webgpu_support:
                                        logger.warning(f"Connection {connection_id} is configured for WebGPU but does not support it")
                                    elif platform == "webnn" and not webnn_support:
                                        logger.warning(f"Connection {connection_id} is configured for WebNN but does not support it")
                            else:
                                logger.warning(f"Failed to establish WebSocket connection for {connection_id}")
                                await automation.close()
                                # Record the error for diagnostics
                                connection_errors[connection_id] = "websocket_connection_failed"
                                failed_connections += 1
                        else:
                            logger.warning(f"Failed to create WebSocket bridge for {connection_id}")
                            await automation.close()
                            # Record the error for diagnostics
                            connection_errors[connection_id] = "websocket_bridge_creation_failed"
                            failed_connections += 1
                    else:
                        logger.warning(f"Failed to launch browser for {connection_id}")
                        # Record the error for diagnostics
                        connection_errors[connection_id] = "browser_launch_failed"
                        failed_connections += 1
                except Exception as e:
                    logger.error(f"Error setting up browser connection {connection_id}: {e}")
                    # Record the error for diagnostics with traceback
                    connection_errors[connection_id] = {
                        "error_type": type(e).__name__,
                        "error_message": str(e),
                        "traceback": traceback.format_exc()
                    }
                    failed_connections += 1
                    
                    # Log full traceback for debugging
                    traceback.print_exc()
        
        # Log connection statistics
        logger.info(f"Connection setup complete: {successful_connections} successful, {failed_connections} failed out of {attempted_connections} attempted")
        
        # Attempt recovery if we have fewer connections than expected
        if successful_connections < num_connections // 2 and successful_connections > 0:
            logger.warning(f"Only {successful_connections} connections created. Some operations may be slower than expected.")
        
        # If we have no connections but real browser is available, fall back to simulation
        if not self.browser_connections and self.real_browser_available:
            logger.warning("No browser connections could be established, falling back to simulation mode")
            # Store diagnostic information
            self._connection_diagnostics = {
                "attempted": attempted_connections,
                "failed": failed_connections,
                "successful": successful_connections,
                "connection_errors": connection_errors,
                "timestamp": time.time()
            }
            
            # Analyze failure patterns
            if failed_connections > 0:
                error_types = {}
                for error in connection_errors.values():
                    error_type = error if isinstance(error, str) else error.get("error_type", "unknown")
                    error_types[error_type] = error_types.get(error_type, 0) + 1
                
                # Log the most common errors to help diagnose connection issues
                logger.error(f"Connection error summary: {error_types}")
            
            self.real_browser_available = False
    
    def _calculate_browser_distribution(self, num_connections):
        """
        Calculate optimal browser distribution based on preferences.
        
        Args:
            num_connections: Number of connections to distribute
            
        Returns:
            Dict with browser distribution
        """
        # Default distribution
        distribution = {
            "chrome": 0,
            "firefox": 0,
            "edge": 0
        }
        
        # Get unique browser preferences from browser_preferences dict
        preferred_browsers = set(self.browser_preferences.values())
        
        if not preferred_browsers:
            # Default distribution if no preferences
            preferred_browsers = {"chrome", "firefox", "edge"}
        
        # Ensure we have at least the browsers in preferred_browsers
        browsers_to_use = list(preferred_browsers)
        num_browsers = len(browsers_to_use)
        
        # Distribute connections evenly across browsers
        base_count = num_connections // num_browsers
        remainder = num_connections % num_browsers
        
        for i, browser in enumerate(browsers_to_use):
            if browser in distribution:
                distribution[browser] = base_count
                if i < remainder:
                    distribution[browser] += 1
        
        return distribution
    
    async def get_model(self, model_type, model_name, hardware_preferences=None):
        """
        Get a model with optimal browser and platform selection.
        
        This enhanced implementation:
        1. Uses the adaptive scaling manager for optimal browser selection
        2. Intelligently selects the best browser based on model type
        3. Applies model-specific optimizations (Firefox for audio, Edge for text)
        4. Respects user hardware preferences when provided
        5. Uses real browser connections when available
        6. Leverages tensor sharing for efficient multi-model execution
        
        Args:
            model_type: Type of model (text, vision, audio, etc.)
            model_name: Name of the model to load
            hardware_preferences: Optional dict with hardware preferences
            
        Returns:
            Model object for inference (real or simulated)
        """
        # Get user-specified hardware preferences
        hardware_priority_list = []
        if hardware_preferences and 'priority_list' in hardware_preferences:
            hardware_priority_list = hardware_preferences['priority_list']
        
        # If no user preferences, determine optimal browser based on model type
        preferred_browser = None
        if hasattr(self, 'adaptive_manager'):
            # Use adaptive manager for optimal browser selection
            preferred_browser = self.adaptive_manager.get_browser_preference(model_type)
            
            # Update model type metrics
            if len(hardware_priority_list) > 0:
                # Estimate a reasonable inference time for metrics
                self.adaptive_manager.update_model_type_metrics(model_type, 0.5)  # 500ms is a reasonable default
        else:
            # Use static browser preferences
            for key, browser in self.browser_preferences.items():
                if key in model_type.lower():
                    preferred_browser = browser
                    break
            
            # Special case handling if no match found
            if not preferred_browser:
                if 'audio' in model_type.lower() or 'whisper' in model_type.lower() or 'wav2vec' in model_type.lower():
                    preferred_browser = 'firefox'  # Firefox has better WebGPU compute shader performance for audio
                elif 'vision' in model_type.lower() or 'clip' in model_type.lower() or 'vit' in model_type.lower():
                    preferred_browser = 'chrome'  # Chrome has good WebGPU support for vision models
                elif 'embedding' in model_type.lower() or 'bert' in model_type.lower():
                    preferred_browser = 'edge'  # Edge has excellent WebNN support for text embeddings
                else:
                    # Default to Chrome for unknown types
                    preferred_browser = 'chrome'
        
        # Extract optimization settings from hardware_preferences
        kwargs = {}
        if hardware_preferences:
            # Get optimization flags
            kwargs['compute_shaders'] = hardware_preferences.get('compute_shaders', False)
            kwargs['precompile_shaders'] = hardware_preferences.get('precompile_shaders', False)
            kwargs['parallel_loading'] = hardware_preferences.get('parallel_loading', False)
            kwargs['mixed_precision'] = hardware_preferences.get('mixed_precision', False)
            kwargs['precision'] = hardware_preferences.get('precision', 16)
            
            # Debug optimization flags
            logger.debug(f"Model optimization flags: {kwargs}")
        
        # Determine preferred hardware platform
        preferred_hardware = None
        if len(hardware_priority_list) > 0:
            preferred_hardware = hardware_priority_list[0]
        else:
            # Use WebGPU by default if no preference
            preferred_hardware = 'webgpu'
        
        # Check if we have real browser connections available
        if hasattr(self, 'browser_connections') and self.browser_connections and hasattr(self, 'real_browser_available') and self.real_browser_available:
            # Try to get a connection with the preferred browser and hardware platform
            connection = await self._get_connection_for_model(model_type, model_name, preferred_browser, preferred_hardware, **kwargs)
            
            if connection:
                # Create real browser model
                return await self._create_real_browser_model(connection, model_type, model_name, **kwargs)
            else:
                # Fall back to simulation
                logger.warning(f"No suitable browser connection available for {model_name}, falling back to simulation")
        
        # Set up tensor sharing if not already initialized
        if not hasattr(self, 'tensor_sharing_manager'):
            self.setup_tensor_sharing()
        
        # Check if tensor sharing is available and if we have a shared tensor for this model
        if hasattr(self, 'tensor_sharing_manager') and self.tensor_sharing_manager:
            # Generate tensor name based on model type
            if 'text_embedding' in model_type.lower() or 'bert' in model_type.lower():
                tensor_type = "text_embedding"
            elif 'vision' in model_type.lower() or 'vit' in model_type.lower():
                tensor_type = "vision_embedding"
            elif 'audio' in model_type.lower() or 'whisper' in model_type.lower():
                tensor_type = "audio_embedding"
            else:
                tensor_type = "embedding"
            
            embedding_tensor_name = f"{model_name}_{tensor_type}"
            
            # Check if this tensor is already available
            shared_tensor = self.tensor_sharing_manager.get_shared_tensor(embedding_tensor_name, model_name)
            if shared_tensor is not None:
                logger.info(f"Found shared tensor {embedding_tensor_name} for model {model_name}")
                
                # Add tensor sharing info to kwargs for the model to use
                kwargs['shared_tensors'] = {
                    tensor_type: embedding_tensor_name
                }
        
        # Either we don't have real browser connections or we couldn't get a suitable one
        # Fall back to simulation
        logger.debug(f"Using simulated model for {model_name} ({model_type}) using {preferred_hardware} with {preferred_browser}")
        return EnhancedWebModel(model_name, model_type, preferred_hardware, preferred_browser, **kwargs)
    
    async def _get_connection_for_model(self, model_type, model_name, preferred_browser, preferred_hardware, **kwargs):
        """
        Get an optimal browser connection for the model.
        
        This method selects the best available browser connection based on:
        1. Model type (text, vision, audio)
        2. Browser preference (edge, chrome, firefox)
        3. Hardware platform preference (webnn, webgpu)
        4. Optimization flags (compute_shaders, precompile_shaders, parallel_loading)
        
        Args:
            model_type: Type of model
            model_name: Name of the model
            preferred_browser: Preferred browser
            preferred_hardware: Preferred hardware platform
            **kwargs: Additional optimization flags
            
        Returns:
            Selected connection or None if no suitable connection is available
        """
        # Score each connection for suitability
        connection_scores = {}
        
        # Get healthy connections if circuit breaker is available
        healthy_connections = []
        if hasattr(self, 'circuit_breaker_manager'):
            try:
                healthy_connections = await self.circuit_breaker_manager.circuit_breaker.get_healthy_connections()
                logger.debug(f"Healthy connections from circuit breaker: {healthy_connections}")
            except Exception as e:
                logger.warning(f"Error getting healthy connections from circuit breaker: {e}")
        
        for connection_id, connection in self.browser_connections.items():
            # Skip active connections (already in use)
            if connection["active"]:
                continue
            
            # Skip unhealthy connections if circuit breaker is available
            if hasattr(self, 'circuit_breaker_manager') and healthy_connections and connection_id not in healthy_connections:
                logger.warning(f"Skipping unhealthy connection {connection_id} based on circuit breaker health check")
                continue
            
            # Check if circuit breaker allows this connection
            if hasattr(self, 'circuit_breaker_manager'):
                try:
                    allowed, reason = await self.circuit_breaker_manager.pre_request_check(connection_id)
                    if not allowed:
                        logger.warning(f"Circuit breaker prevented use of connection {connection_id}: {reason}")
                        continue
                except Exception as e:
                    logger.warning(f"Error checking circuit breaker for connection {connection_id}: {e}")
            
            # Start with a base score
            score = 100
            
            # Check browser match
            if connection["browser"] == preferred_browser:
                score += 50
            elif connection["browser"] in ["chrome", "edge", "firefox"]:
                score += 10  # Any supported browser is better than nothing
            
            # Check platform match
            if connection["platform"] == preferred_hardware:
                score += 30
            
            # Check for compute shader support for audio models
            if 'audio' in model_type.lower() and connection["browser"] == "firefox" and connection["compute_shaders"]:
                score += 40  # Major bonus for audio models on Firefox with compute shaders
            
            # Check for WebNN support for text embedding models
            if ('text_embedding' in model_type.lower() or 'bert' in model_type.lower()) and connection["platform"] == "webnn":
                score += 35  # Bonus for text embedding models on WebNN
            
            # Check for precompile shaders for vision models
            if 'vision' in model_type.lower() and connection["precompile_shaders"]:
                score += 25  # Bonus for vision models with shader precompilation
            
            # Check for parallel loading for multimodal models
            if 'multimodal' in model_type.lower() and connection["parallel_loading"]:
                score += 30  # Bonus for multimodal models with parallel loading
            
            # Minor penalty for simulation mode
            if connection["is_simulation"]:
                score -= 15
            
            # Apply health score bonus if available from circuit breaker
            if hasattr(self, 'circuit_breaker_manager') and connection_id in self.circuit_breaker_manager.circuit_breaker.health_metrics:
                health_score = self.circuit_breaker_manager.circuit_breaker.health_metrics[connection_id].health_score
                # Normalize health score to 0-30 range and add as bonus
                health_bonus = (health_score / 100.0) * 30.0
                score += health_bonus
                logger.debug(f"Added health bonus of {health_bonus:.1f} to connection {connection_id} (health score: {health_score:.1f})")
                
            # Store score
            connection_scores[connection_id] = score
        
        # Get the best connection (highest score)
        if connection_scores:
            best_connection_id = max(connection_scores, key=connection_scores.get)
            best_score = connection_scores[best_connection_id]
            
            logger.info(f"Selected connection {best_connection_id} with score {best_score} for {model_name} ({model_type})")
            
            # Mark the connection as active
            self.browser_connections[best_connection_id]["active"] = True
            self.active_connections += 1
            
            # Return the connection
            return self.browser_connections[best_connection_id]
        
        return None
    
    async def _create_real_browser_model(self, connection, model_type, model_name, **kwargs):
        """
        Create a real browser model using the provided connection.
        
        This method initializes a model in the browser and returns a callable
        object that can be used for inference.
        
        Args:
            connection: Browser connection to use
            model_type: Type of model
            model_name: Name of the model
            **kwargs: Additional optimization flags
            
        Returns:
            Callable model object
        """
        # Extract connection components
        bridge = connection["bridge"]
        platform = connection["platform"]
        
        # Check if model is already initialized for this connection
        model_key = f"{model_name}_{platform}"
        if model_key not in connection["initialized_models"]:
            # Initialize model in browser
            logger.info(f"Initializing model {model_name} ({model_type}) in browser using {platform}")
            
            # Prepare initialization options
            options = {
                "compute_shaders": connection["compute_shaders"],
                "precompile_shaders": connection["precompile_shaders"],
                "parallel_loading": connection["parallel_loading"],
                "model_type": model_type
            }
            
            # Add additional options from kwargs
            for key, value in kwargs.items():
                if key not in options:
                    options[key] = value
            
            # Initialize model in browser
            init_result = await bridge.initialize_model(model_name, model_type, platform, options)
            
            if not init_result or init_result.get("status") != "success":
                logger.error(f"Failed to initialize model {model_name} in browser: {init_result.get('error', 'Unknown error')}")
                # Release the connection and fall back to simulation
                connection["active"] = False
                self.active_connections -= 1
                return EnhancedWebModel(model_name, model_type, platform, connection["browser"], **kwargs)
            
            # Mark model as initialized for this connection
            connection["initialized_models"].add(model_key)
            
            logger.info(f"Successfully initialized model {model_name} in browser")
        
        # Create callable model
        class RealBrowserModel:
            def __init__(self, pool, connection, bridge, model_name, model_type, platform):
                self.pool = pool
                self.connection = connection
                self.bridge = bridge
                self.model_name = model_name
                self.model_type = model_type
                self.platform = platform
                self.inference_count = 0
                
            async def __call__(self, inputs):
                """
                Run inference with the model.
                
                This enhanced implementation includes:
                - Comprehensive timeout handling
                - Error categorization and diagnostics
                - Automatic recovery for transient errors
                - Detailed performance metrics
                - Circuit breaker integration
                - Resource cleanup on failure
                
                Args:
                    inputs: The input data for inference
                    
                Returns:
                    Dictionary with inference results or error information
                """
                from fixed_web_platform.unified_framework.error_handling import ErrorHandler, ErrorCategories

                self.inference_count += 1
                connection_id = None
                start_time = time.time()
                error_handler = ErrorHandler()
                
                # Get connection ID
                for conn_id, conn in self.pool.browser_connections.items():
                    if conn is self.connection:
                        connection_id = conn_id
                        break
                
                # Track in connection stats
                if connection_id and "error_count" in self.connection:
                    self.connection["active_since"] = time.time()
                
                # Create context for error handling
                context = {
                    "model_name": self.model_name,
                    "model_type": self.model_type,
                    "platform": self.platform,
                    "connection_id": connection_id,
                    "inference_count": self.inference_count
                }
                
                try:
                    # Run inference with timeout
                    try:
                        result = await asyncio.wait_for(
                            self.bridge.run_inference(
                                self.model_name,
                                inputs,
                                self.platform
                            ),
                            timeout=60  # 60 second timeout for inference
                        )
                    except asyncio.TimeoutError:
                        logger.error(f"Inference timeout for {self.model_name} after 60 seconds")
                        
                        # Update connection stats
                        if connection_id and "error_count" in self.connection:
                            self.connection["error_count"] += 1
                            self.connection["last_error"] = "inference_timeout"
                            self.connection["last_error_time"] = time.time()
                        
                        # Record failure with circuit breaker
                        if hasattr(self.pool, 'circuit_breaker_manager') and connection_id:
                            try:
                                timeout_error = TimeoutError(f"Inference timeout after 60 seconds for {self.model_name}")
                                await self.pool.circuit_breaker_manager.handle_error(
                                    connection_id,
                                    timeout_error,
                                    {"action": "inference", "model_name": self.model_name, "error_type": "timeout"}
                                )
                            except Exception as circuit_error:
                                logger.warning(f"Error handling timeout with circuit breaker: {circuit_error}")
                        
                        return {
                            "success": False,
                            "error_type": "timeout",
                            "error": f"Inference request timed out after 60 seconds",
                            "model_name": self.model_name,
                            "model_type": self.model_type,
                            "hardware": self.platform,
                            "is_simulation": self.connection["is_simulation"],
                            "recovery_suggestion": "Try again with smaller input or when the system is less busy"
                        }
                    
                    # Calculate inference time
                    inference_time_ms = (time.time() - start_time) * 1000
                    
                    # Check for successful inference
                    if not result or result.get("status") != "success":
                        error_msg = result.get('error', 'Unknown error') if result else "Empty response"
                        logger.error(f"Inference failed for {self.model_name}: {error_msg}")
                        
                        # Update connection stats
                        if connection_id and "error_count" in self.connection:
                            self.connection["error_count"] += 1
                            self.connection["last_error"] = "inference_failed"
                            self.connection["last_error_time"] = time.time()
                            
                        # Determine error category
                        error_category = ErrorCategories.UNKNOWN
                        if "memory" in str(error_msg).lower():
                            error_category = ErrorCategories.RESOURCE
                        elif "timeout" in str(error_msg).lower():
                            error_category = ErrorCategories.TIMEOUT
                        elif "connection" in str(error_msg).lower():
                            error_category = ErrorCategories.NETWORK
                        
                        # Record failure with circuit breaker if available
                        if hasattr(self.pool, 'circuit_breaker_manager') and connection_id:
                            try:
                                await self.pool.circuit_breaker_manager.record_request_result(
                                    connection_id, 
                                    False, 
                                    error_type="inference_failed", 
                                    response_time_ms=inference_time_ms
                                )
                                
                                # Record model performance
                                await self.pool.circuit_breaker_manager.circuit_breaker.record_model_performance(
                                    connection_id,
                                    self.model_name,
                                    inference_time_ms,
                                    False
                                )
                                
                                # Handle error with circuit breaker
                                await self.pool.circuit_breaker_manager.handle_error(
                                    connection_id,
                                    Exception(error_msg),
                                    {"action": "inference", "model_name": self.model_name}
                                )
                            except Exception as e:
                                logger.warning(f"Error recording failure with circuit breaker: {e}")
                        
                        # Get recovery suggestion
                        recovery_strategy = error_handler.get_recovery_strategy(Exception(error_msg))
                        recovery_suggestion = recovery_strategy.get("strategy_description")
                        
                        return {
                            "success": False,
                            "error": error_msg,
                            "error_category": error_category,
                            "model_name": self.model_name,
                            "model_type": self.model_type,
                            "hardware": self.platform,
                            "is_simulation": self.connection["is_simulation"],
                            "inference_time_ms": inference_time_ms,
                            "recovery_suggestion": recovery_suggestion,
                            "should_retry": recovery_strategy.get("should_retry", False)
                        }
                    
                    # Record success with circuit breaker if available
                    if hasattr(self.pool, 'circuit_breaker_manager') and connection_id:
                        try:
                            await self.pool.circuit_breaker_manager.record_request_result(
                                connection_id, 
                                True, 
                                response_time_ms=inference_time_ms
                            )
                            
                            # Record model performance
                            await self.pool.circuit_breaker_manager.circuit_breaker.record_model_performance(
                                connection_id,
                                self.model_name,
                                inference_time_ms,
                                True
                            )
                        except Exception as e:
                            logger.warning(f"Error recording success with circuit breaker: {e}")
                    
                    # Update connection stats
                    if connection_id and "success_count" in self.connection:
                        self.connection["success_count"] += 1
                    
                    # Process and return result
                    output = {
                        "success": True,
                        "model_name": self.model_name,
                        "model_type": self.model_type,
                        "hardware": self.platform,
                        "browser": self.connection["browser"],
                        "is_real_hardware": not self.connection["is_simulation"],
                        "is_simulation": self.connection["is_simulation"],
                        "compute_shader_optimized": self.connection["compute_shaders"],
                        "precompile_shaders": self.connection["precompile_shaders"],
                        "parallel_loading": self.connection["parallel_loading"],
                        "inference_time_ms": inference_time_ms,
                        "total_time_ms": (time.time() - start_time) * 1000
                    }
                    
                    # Copy performance metrics if available
                    if "performance_metrics" in result:
                        for key, value in result["performance_metrics"].items():
                            output[key] = value
                    
                    # Copy memory usage if available
                    if "memory_usage" in result:
                        output["memory_usage_mb"] = result["memory_usage"]
                    
                    # Copy result if available
                    if "result" in result:
                        output["result"] = result["result"]
                    
                    # Copy output if available
                    if "output" in result:
                        output["output"] = result["output"]
                    
                    return output
                    
                except Exception as e:
                    logger.error(f"Error during inference with {self.model_name}: {e}")
                    
                    # Calculate inference time even for failures
                    inference_time_ms = (time.time() - start_time) * 1000
                    
                    # Update connection stats
                    if connection_id and "error_count" in self.connection:
                        self.connection["error_count"] += 1
                        self.connection["last_error"] = type(e).__name__
                        self.connection["last_error_time"] = time.time()
                    
                    # Categorize the error
                    error_category = error_handler.categorize_error(e)
                    is_recoverable = error_handler.is_recoverable(e)
                    
                    # Record failure with circuit breaker if available
                    if hasattr(self.pool, 'circuit_breaker_manager') and connection_id:
                        try:
                            await self.pool.circuit_breaker_manager.record_request_result(
                                connection_id, 
                                False, 
                                error_type=type(e).__name__, 
                                response_time_ms=inference_time_ms
                            )
                            
                            # Record model performance
                            await self.pool.circuit_breaker_manager.circuit_breaker.record_model_performance(
                                connection_id,
                                self.model_name,
                                inference_time_ms,
                                False
                            )
                            
                            # Handle error with circuit breaker
                            await self.pool.circuit_breaker_manager.handle_error(
                                connection_id,
                                e,
                                {"action": "inference", "model_name": self.model_name, "error_type": type(e).__name__}
                            )
                        except Exception as circuit_error:
                            logger.warning(f"Error recording failure with circuit breaker: {circuit_error}")
                    
                    # Get recovery strategy
                    recovery_strategy = error_handler.get_recovery_strategy(e)
                    recovery_suggestion = recovery_strategy.get("strategy_description")
                    
                    # Create detailed error response
                    error_response = {
                        "success": False,
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "error_category": error_category,
                        "model_name": self.model_name,
                        "model_type": self.model_type,
                        "hardware": self.platform,
                        "is_simulation": self.connection["is_simulation"],
                        "inference_time_ms": inference_time_ms,
                        "recoverable": is_recoverable,
                        "recovery_suggestion": recovery_suggestion,
                        "should_retry": recovery_strategy.get("should_retry", False)
                    }
                    
                    # For critical errors, include additional diagnostics if available
                    if not is_recoverable:
                        try:
                            # Check for websocket status
                            if hasattr(self.bridge, "websocket") and hasattr(self.bridge.websocket, "state"):
                                error_response["websocket_state"] = self.bridge.websocket.state
                            
                            # Check for browser status
                            if hasattr(self.connection["automation"], "process") and self.connection["automation"].process:
                                error_response["browser_running"] = self.connection["automation"].process.poll() is None
                        except Exception:
                            # Ignore errors while collecting diagnostics
                            pass
                    
                    return error_response
            
            def release(self):
                """Release the connection."""
                self.connection["active"] = False
                self.pool.active_connections -= 1
                logger.debug(f"Released connection for {self.model_name}")
        
        # Create a real model instance that uses the bridge for inference
        model = RealBrowserModel(self, connection, bridge, model_name, model_type, platform)
        
        # Wrap the async call method with a sync version
        def sync_call(inputs):
            if not hasattr(self, 'loop') or self.loop.is_closed():
                self.loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self.loop)
            return self.loop.run_until_complete(model(inputs))
        
        # Replace the __call__ method with the sync version
        model.__call__ = sync_call
        
        return model
    
    async def get_health_status(self):
        """
        Get health status for all connections using the circuit breaker.
        
        This method provides detailed health information about all connections,
        including circuit state, health scores, and recovery recommendations.
        
        Returns:
            Dict with health status information
        """
        if hasattr(self, 'circuit_breaker_manager'):
            try:
                return await self.circuit_breaker_manager.get_health_summary()
            except Exception as e:
                logger.error(f"Error getting health status: {e}")
                return {"error": str(e)}
        else:
            return {"error": "Circuit breaker not available"}
            
    def get_health_status_sync(self):
        """
        Synchronous wrapper for get_health_status.
        
        Returns:
            Dict with health status information
        """
        # Create event loop if needed
        if not hasattr(self, 'loop') or self.loop.is_closed():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        
        # Run async method in event loop
        return self.loop.run_until_complete(self.get_health_status())
            
    def get_metrics(self):
        """
        Get detailed performance and resource metrics for the integration.
        
        This method provides comprehensive metrics about:
        - Connection utilization and scaling events
        - Browser distribution and preferences
        - Model performance by type and hardware
        - Adaptive scaling statistics (when enabled)
        - System resource utilization
        - Circuit breaker health status (if available)
        
        Returns:
            Dict with detailed metrics
        """
        # Base metrics
        metrics = {
            "connections": {
                "current": 0,
                "max": self.max_connections,
                "active": 0,
                "idle": 0,
                "utilization": 0.0,
                "browser_distribution": {},
                "platform_distribution": {}
            },
            "models": {},
            "performance": {
                "inference_times": {},
                "throughput": {},
                "memory_usage": {}
            },
            "adaptive_scaling": {
                "enabled": self.adaptive_scaling,
                "scaling_events": [],
                "current_metrics": {}
            },
            "resources": {
                "system_memory_percent": 0,
                "process_memory_mb": 0
            }
        }
        
        # Add adaptive manager metrics if available
        if hasattr(self, 'adaptive_manager'):
            adaptive_stats = self.adaptive_manager.get_scaling_stats()
            metrics["adaptive_scaling"]["current_metrics"] = adaptive_stats
            
            # Copy key metrics to top-level
            if "scaling_history" in adaptive_stats:
                metrics["adaptive_scaling"]["scaling_events"] = adaptive_stats["scaling_history"]
            
            # Add browser preferences from adaptive manager
            metrics["browser_preferences"] = self.browser_preferences
            
            # Add model type patterns
            if "model_type_patterns" in adaptive_stats:
                metrics["models"] = adaptive_stats["model_type_patterns"]
        
        # Get system metrics if available
        if PSUTIL_AVAILABLE:
            try:
                # Get system memory usage
                vm = psutil.virtual_memory()
                metrics["resources"]["system_memory_percent"] = vm.percent
                metrics["resources"]["system_memory_available_mb"] = vm.available / (1024 * 1024)
                
                # Get process memory usage
                try:
                    process = psutil.Process()
                    metrics["resources"]["process_memory_mb"] = process.memory_info().rss / (1024 * 1024)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess) as proc_err:
                    # Handle specific process-related errors
                    logger.warning(f"Error accessing process metrics: {proc_err}")
                    metrics["resources"]["process_memory_mb"] = -1
                    metrics["resources"]["process_error"] = str(proc_err)
            except AttributeError as attr_err:
                # Handle missing attributes in psutil
                logger.warning(f"Psutil attribute error: {attr_err}")
                metrics["resources"]["error"] = f"Attribute error: {str(attr_err)}"
            except OSError as os_err:
                # Handle OS-level errors
                logger.warning(f"OS error when getting system metrics: {os_err}")
                metrics["resources"]["error"] = f"OS error: {str(os_err)}"
            except Exception as e:
                # Catch any other unexpected errors
                logger.warning(f"Unexpected error getting system metrics: {e}")
                metrics["resources"]["error"] = f"Unexpected error: {str(e)}"
        
        # Add circuit breaker metrics if available
        if hasattr(self, 'circuit_breaker_manager'):
            try:
                # Get circuit breaker states for all connections
                circuit_states = {}
                for connection_id in self.browser_connections.keys():
                    state = asyncio.run(self.circuit_breaker_manager.circuit_breaker.get_connection_state(connection_id))
                    if state:
                        circuit_states[connection_id] = {
                            "state": state["state"],
                            "failures": state["failures"],
                            "successes": state["successes"],
                            "health_score": state["health_metrics"]["health_score"] if "health_metrics" in state else 0
                        }
                
                # Add to metrics
                metrics["circuit_breaker"] = {
                    "circuit_states": circuit_states,
                    "healthy_count": len(asyncio.run(self.circuit_breaker_manager.circuit_breaker.get_healthy_connections()))
                }
            except Exception as e:
                metrics["circuit_breaker"] = {"error": str(e)}
        
        # Add timestamp
        metrics["timestamp"] = time.time()
        
        return metrics
    
    async def execute_concurrent(self, model_and_inputs_list, timeout_seconds=120):
        """
        Execute multiple models concurrently for efficient inference.
        
        This enhanced implementation provides:
        1. Comprehensive timeout handling for overall execution
        2. Detailed error categorization and diagnostics
        3. Performance tracking for each model execution
        4. Advanced error recovery options
        5. Memory usage monitoring during concurrent execution
        
        Args:
            model_and_inputs_list: List of (model, inputs) tuples to execute
            timeout_seconds: Maximum time in seconds for the entire operation (default: 120)
            
        Returns:
            List of results in the same order as inputs
        """
        # Import for error handling
        from fixed_web_platform.unified_framework.error_handling import ErrorHandler, ErrorCategories
        error_handler = ErrorHandler()
        
        # Check for empty input
        if not model_and_inputs_list:
            return []
        
        # Tracking variables
        start_time = time.time()
        execution_stats = {
            "total_models": len(model_and_inputs_list),
            "successful": 0,
            "failed": 0,
            "null_results": 0,
            "timed_out": 0,
            "failure_types": {},
            "start_time": start_time
        }
        
        # Create tasks for concurrent execution
        tasks = []
        model_infos = []  # Store model info for error reporting
        
        for i, (model, inputs) in enumerate(model_and_inputs_list):
            # Extract model info for error reporting
            model_name = getattr(model, 'model_name', 'unknown')
            model_type = getattr(model, 'model_type', 'unknown')
            
            # Store model info
            model_infos.append({
                "index": i,
                "model_name": model_name,
                "model_type": model_type,
                "input_type": type(inputs).__name__ if inputs is not None else "None"
            })
            
            if not model:
                # Use a dummy task for None models
                tasks.append(asyncio.create_task(asyncio.sleep(0)))
            else:
                # Create an inner function to capture model and inputs
                async def call_model(model, inputs, model_info):
                    model_start_time = time.time()
                    try:
                        result = model(inputs)
                        
                        # Record execution time
                        execution_time = time.time() - model_start_time
                        
                        # For async models, await the result
                        if asyncio.iscoroutine(result) or hasattr(result, "__await__"):
                            try:
                                # Use a smaller timeout for individual model execution
                                model_timeout = min(60, timeout_seconds * 0.8)  # 80% of total timeout or 60s, whichever is smaller
                                result = await asyncio.wait_for(result, timeout=model_timeout)
                            except asyncio.TimeoutError:
                                logger.error(f"Individual model timeout: {model_info['model_name']} after {model_timeout}s")
                                return {
                                    "success": False,
                                    "error_type": "model_timeout",
                                    "error_category": ErrorCategories.TIMEOUT,
                                    "error": f"Model execution timed out after {model_timeout} seconds",
                                    "model_name": model_info["model_name"],
                                    "model_type": model_info["model_type"],
                                    "execution_time": time.time() - model_start_time,
                                    "timestamp": time.time()
                                }
                        
                        # Add execution time to result if it's a dict
                        if isinstance(result, dict) and "execution_time" not in result:
                            result["execution_time"] = execution_time
                            
                        return result
                        
                    except TypeError as e:
                        # Handle invalid input types
                        logger.error(f"Type error executing model {model_info['model_name']}: {e}")
                        error_obj = error_handler.handle_error(e, model_info)
                        return {
                            "success": False,
                            "error_type": "input_type_error",
                            "error_category": ErrorCategories.INPUT,
                            "error": str(e),
                            "model_name": model_info["model_name"],
                            "model_type": model_info["model_type"],
                            "input_type": model_info["input_type"],
                            "execution_time": time.time() - model_start_time,
                            "timestamp": time.time(),
                            "recovery_suggestion": "Check input data types match model expectations"
                        }
                    except ValueError as e:
                        # Handle invalid input values
                        logger.error(f"Value error executing model {model_info['model_name']}: {e}")
                        error_obj = error_handler.handle_error(e, model_info)
                        return {
                            "success": False,
                            "error_type": "input_value_error",
                            "error_category": ErrorCategories.INPUT,
                            "error": str(e),
                            "model_name": model_info["model_name"],
                            "model_type": model_info["model_type"],
                            "input_type": model_info["input_type"],
                            "execution_time": time.time() - model_start_time,
                            "timestamp": time.time(),
                            "recovery_suggestion": "Check input values are within expected ranges"
                        }
                    except RuntimeError as e:
                        # Handle runtime execution errors
                        logger.error(f"Runtime error executing model {model_info['model_name']}: {e}")
                        error_obj = error_handler.handle_error(e, model_info)
                        return {
                            "success": False,
                            "error_type": "runtime_error",
                            "error_category": ErrorCategories.INTERNAL,
                            "error": str(e),
                            "model_name": model_info["model_name"],
                            "model_type": model_info["model_type"],
                            "execution_time": time.time() - model_start_time,
                            "timestamp": time.time(),
                            "recovery_suggestion": error_handler.get_recovery_strategy(e).get("strategy_description")
                        }
                    except Exception as e:
                        # Catch any other unexpected errors
                        logger.error(f"Unexpected error executing model {model_info['model_name']}: {e}")
                        error_category = error_handler.categorize_error(e)
                        recovery_strategy = error_handler.get_recovery_strategy(e)
                        return {
                            "success": False,
                            "error_type": type(e).__name__,
                            "error_category": error_category,
                            "error": str(e),
                            "model_name": model_info["model_name"],
                            "model_type": model_info["model_type"],
                            "execution_time": time.time() - model_start_time,
                            "timestamp": time.time(),
                            "recovery_suggestion": recovery_strategy.get("strategy_description"),
                            "should_retry": recovery_strategy.get("should_retry", False)
                        }
                
                # Create task with model info for better error reporting
                tasks.append(asyncio.create_task(call_model(model, inputs, model_infos[i])))
        
        # Wait for all tasks to complete with overall timeout
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.error(f"Concurrent execution timed out after {timeout_seconds} seconds")
            # Create timeout results for all models
            execution_stats["timed_out"] = len(model_and_inputs_list)
            
            results = []
            for info in model_infos:
                results.append({
                    'success': False,
                    'error_type': 'timeout',
                    'error_category': ErrorCategories.TIMEOUT,
                    'error': f'Concurrent execution timed out after {timeout_seconds} seconds',
                    'model_name': info["model_name"],
                    'model_type': info["model_type"],
                    'timestamp': time.time(),
                    'recovery_suggestion': 'Try with fewer models or longer timeout'
                })
            
            return results
        
        # Process results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Create detailed error result with categorization
                model_info = model_infos[i]
                
                # Update stats
                execution_stats["failed"] += 1
                error_type = type(result).__name__
                if error_type not in execution_stats["failure_types"]:
                    execution_stats["failure_types"][error_type] = 0
                execution_stats["failure_types"][error_type] += 1
                
                # Categorize the exception for better error handling
                error_category = ErrorCategories.UNKNOWN
                recovery_suggestion = None
                
                if isinstance(result, asyncio.TimeoutError):
                    error_type = "timeout"
                    error_category = ErrorCategories.TIMEOUT
                    recovery_suggestion = "Try with smaller input or longer timeout"
                elif isinstance(result, asyncio.CancelledError):
                    error_type = "cancelled"
                    error_category = ErrorCategories.EXECUTION_INTERRUPTED
                    recovery_suggestion = "Task was cancelled, try again when system is less busy"
                elif isinstance(result, (TypeError, ValueError)):
                    error_type = "input_error"
                    error_category = ErrorCategories.INPUT
                    recovery_suggestion = "Check input format and types"
                elif isinstance(result, RuntimeError):
                    error_type = "runtime_error"
                    error_category = ErrorCategories.INTERNAL
                    recovery_suggestion = "Internal error occurred, check logs for details"
                elif isinstance(result, MemoryError):
                    error_type = "memory_error"
                    error_category = ErrorCategories.RESOURCE
                    recovery_suggestion = "System is low on memory, try with smaller batch size"
                elif isinstance(result, ConnectionError):
                    error_type = "connection_error"
                    error_category = ErrorCategories.NETWORK
                    recovery_suggestion = "Network error occurred, check connectivity and retry"
                
                # Create detailed error response
                error_response = {
                    'success': False,
                    'error': str(result),
                    'error_type': error_type,
                    'error_category': error_category,
                    'model_name': model_info["model_name"],
                    'model_type': model_info["model_type"],
                    'input_type': model_info["input_type"],
                    'timestamp': time.time(),
                    'recovery_suggestion': recovery_suggestion
                }
                
                # Add traceback if available
                if hasattr(result, '__traceback__') and result.__traceback__:
                    error_response['traceback'] = ''.join(
                        traceback.format_exception(type(result), result, result.__traceback__)
                    )
                
                processed_results.append(error_response)
                
                # Log error with stack trace for debugging
                logger.error(f"Error executing model {model_info['model_name']}: {result}")
                
            elif result is None:
                # Handle None results explicitly
                model_info = model_infos[i]
                execution_stats["null_results"] += 1
                
                processed_results.append({
                    'success': False, 
                    'error_type': 'null_result',
                    'error_category': ErrorCategories.DATA,
                    'error': 'Model returned None',
                    'model_name': model_info["model_name"],
                    'model_type': model_info["model_type"],
                    'timestamp': time.time(),
                    'recovery_suggestion': 'Check model implementation returns valid results'
                })
            else:
                # Successful result
                execution_stats["successful"] += 1
                processed_results.append(result)
        
        # Add execution stats to the first successful result for debugging
        execution_stats["total_time"] = time.time() - start_time
        for i, result in enumerate(processed_results):
            if isinstance(result, dict) and result.get('success') is True:
                # Only add to the first successful result
                result['_execution_stats'] = execution_stats
                break
        
        return processed_results
    
    def execute_concurrent_sync(self, model_and_inputs_list):
        """
        Synchronous wrapper for execute_concurrent.
        
        This method provides a synchronous interface to the asynchronous
        execute_concurrent method, making it easy to use in synchronous code.
        
        Args:
            model_and_inputs_list: List of (model, inputs) tuples to execute
            
        Returns:
            List of results in the same order as inputs
        """
        # Create event loop if needed
        if not hasattr(self, 'loop') or self.loop.is_closed():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        
        # Run async method in event loop
        return self.loop.run_until_complete(self.execute_concurrent(model_and_inputs_list))
    
    async def close(self):
        """
        Close all resources and connections.
        
        This enhanced implementation provides:
        1. Comprehensive error handling during shutdown
        2. Sequential resource cleanup with status tracking
        3. Graceful degradation for partial shutdown
        4. Force cleanup for critical resources when needed
        5. Detailed cleanup reporting for diagnostics
        
        Returns:
            True if all resources were closed successfully, False if any errors occurred
        """
        from fixed_web_platform.unified_framework.error_handling import safe_resource_cleanup
        
        logger.info("Closing resource pool bridge...")
        start_time = time.time()
        
        # Track cleanup status
        cleanup_status = {
            "success": True,
            "errors": {},
            "closed_connections": 0,
            "total_connections": len(getattr(self, 'browser_connections', {})),
            "start_time": start_time
        }
        
        # First attempt graceful shutdown of circuit breaker
        if hasattr(self, 'circuit_breaker_manager'):
            logger.info("Closing circuit breaker manager")
            try:
                # Use timeout to prevent hanging
                await asyncio.wait_for(
                    self.circuit_breaker_manager.close(),
                    timeout=10  # 10 second timeout for circuit breaker closing
                )
                cleanup_status["circuit_breaker_closed"] = True
            except asyncio.TimeoutError:
                logger.error("Timeout while closing circuit breaker manager")
                cleanup_status["success"] = False
                cleanup_status["errors"]["circuit_breaker"] = "close_timeout"
                # Force cleanup if available
                if hasattr(self.circuit_breaker_manager, 'force_cleanup'):
                    try:
                        logger.warning("Attempting force cleanup of circuit breaker manager")
                        if asyncio.iscoroutinefunction(self.circuit_breaker_manager.force_cleanup):
                            await self.circuit_breaker_manager.force_cleanup()
                        else:
                            self.circuit_breaker_manager.force_cleanup()
                        cleanup_status["circuit_breaker_force_cleanup"] = True
                    except Exception as force_cleanup_error:
                        logger.critical(f"Force cleanup of circuit breaker failed: {force_cleanup_error}")
                        cleanup_status["errors"]["circuit_breaker_force_cleanup"] = str(force_cleanup_error)
            except Exception as e:
                logger.error(f"Error closing circuit breaker manager: {e}")
                cleanup_status["success"] = False
                cleanup_status["errors"]["circuit_breaker"] = str(e)
        
        # Close all active browser connections
        connection_errors = {}
        
        if hasattr(self, 'browser_connections'):
            for connection_id, connection in list(self.browser_connections.items()):
                connection_cleanup_status = {"bridge_closed": False, "automation_closed": False}
                
                try:
                    logger.info(f"Closing browser connection: {connection_id}")
                    
                    # Prepare a list of cleanup functions for this connection
                    cleanup_functions = []
                    
                    # Add bridge shutdown function if available
                    if "bridge" in connection:
                        async def cleanup_bridge():
                            try:
                                # First try to shutdown the browser via the bridge
                                await asyncio.wait_for(
                                    connection["bridge"].shutdown_browser(),
                                    timeout=5
                                )
                                connection_cleanup_status["browser_shutdown"] = True
                                
                                # Then stop the bridge itself
                                await asyncio.wait_for(
                                    connection["bridge"].stop(),
                                    timeout=5
                                )
                                connection_cleanup_status["bridge_closed"] = True
                                return True
                            except asyncio.TimeoutError:
                                logger.warning(f"Timeout shutting down bridge for {connection_id}")
                                return False
                            except Exception as bridge_error:
                                logger.warning(f"Error shutting down bridge for {connection_id}: {bridge_error}")
                                return False
                                
                        cleanup_functions.append(cleanup_bridge)
                    
                    # Add automation cleanup function if available
                    if "automation" in connection:
                        async def cleanup_automation():
                            try:
                                await asyncio.wait_for(
                                    connection["automation"].close(),
                                    timeout=5
                                )
                                connection_cleanup_status["automation_closed"] = True
                                return True
                            except asyncio.TimeoutError:
                                logger.warning(f"Timeout closing automation for {connection_id}")
                                return False
                            except Exception as automation_error:
                                logger.warning(f"Error closing automation for {connection_id}: {automation_error}")
                                return False
                                
                        cleanup_functions.append(cleanup_automation)
                    
                    # Execute all cleanup functions and check for errors
                    cleanup_results = await safe_resource_cleanup(cleanup_functions, logger)
                    
                    # Check for any errors
                    if any(result is not None for result in cleanup_results):
                        logger.warning(f"Partial cleanup for connection {connection_id}")
                        cleanup_status["success"] = False
                        
                        # Record specific errors for this connection
                        connection_errors[connection_id] = {
                            "bridge_error": str(cleanup_results[0]) if cleanup_results[0] is not None else None,
                            "automation_error": str(cleanup_results[1]) if len(cleanup_results) > 1 and cleanup_results[1] is not None else None,
                            "status": connection_cleanup_status
                        }
                    else:
                        # Successful cleanup
                        cleanup_status["closed_connections"] += 1
                    
                except Exception as e:
                    logger.error(f"Error closing connection {connection_id}: {e}")
                    cleanup_status["success"] = False
                    connection_errors[connection_id] = {
                        "error": str(e),
                        "traceback": traceback.format_exc(),
                        "status": connection_cleanup_status
                    }
            
            # Store connection errors in status
            if connection_errors:
                cleanup_status["errors"]["connections"] = connection_errors
        
        # Close adaptive manager if available
        if hasattr(self, 'adaptive_manager'):
            logger.info("Closing adaptive connection manager")
            
            # If adaptive manager has a close method, call it
            if hasattr(self.adaptive_manager, 'close'):
                try:
                    if asyncio.iscoroutinefunction(self.adaptive_manager.close):
                        await asyncio.wait_for(
                            self.adaptive_manager.close(),
                            timeout=5
                        )
                    else:
                        self.adaptive_manager.close()
                    cleanup_status["adaptive_manager_closed"] = True
                except asyncio.TimeoutError:
                    logger.error("Timeout while closing adaptive manager")
                    cleanup_status["success"] = False
                    cleanup_status["errors"]["adaptive_manager"] = "close_timeout"
                except Exception as e:
                    logger.warning(f"Error closing adaptive manager: {e}")
                    cleanup_status["success"] = False
                    cleanup_status["errors"]["adaptive_manager"] = str(e)
        
        # Clear all circular references to help garbage collection
        try:
            if hasattr(self, 'browser_connections'):
                self.browser_connections.clear()
            
            if hasattr(self, 'circuit_breaker_manager'):
                self.circuit_breaker_manager = None
                
            if hasattr(self, 'adaptive_manager'):
                self.adaptive_manager = None
                
            if hasattr(self, 'tensor_sharing_manager'):
                self.tensor_sharing_manager = None
            
            # Clear any event loops we may have created
            if hasattr(self, 'loop') and not self.loop.is_closed():
                try:
                    remaining_tasks = asyncio.all_tasks(self.loop)
                    if remaining_tasks:
                        logger.warning(f"Cancelling {len(remaining_tasks)} remaining tasks")
                        for task in remaining_tasks:
                            task.cancel()
                except Exception as e:
                    logger.warning(f"Error cancelling remaining tasks: {e}")
        except Exception as clear_error:
            logger.warning(f"Error clearing references: {clear_error}")
            cleanup_status["errors"]["reference_clearing"] = str(clear_error)
        
        # Calculate total time for cleanup
        cleanup_status["total_cleanup_time"] = time.time() - start_time
        
        # Log cleanup status summary
        if cleanup_status["success"]:
            logger.info(f"Resource pool bridge closed successfully in {cleanup_status['total_cleanup_time']:.2f}s")
        else:
            error_count = len(cleanup_status["errors"])
            logger.warning(f"Resource pool bridge closed with {error_count} errors in {cleanup_status['total_cleanup_time']:.2f}s")
            
        return cleanup_status["success"]
    
    def close_sync(self):
        """Synchronous wrapper for close."""
        # Create event loop if needed
        if not hasattr(self, 'loop') or self.loop.is_closed():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        
        # Run async close method in event loop
        return self.loop.run_until_complete(self.close())
        
    def setup_tensor_sharing(self, max_memory_mb=None):
        """
        Set up cross-model tensor sharing for this resource pool.
        
        This enables efficient tensor sharing between models, reducing memory usage
        and improving performance for multi-model workloads.
        
        Args:
            max_memory_mb: Maximum memory to allocate for shared tensors (in MB)
            
        Returns:
            TensorSharingManager instance
        """
        from fixed_web_platform.unified_framework.error_handling import ErrorHandler
        
        # Input validation
        if max_memory_mb is not None and not isinstance(max_memory_mb, (int, float)):
            logger.error(f"Invalid max_memory_mb value: {max_memory_mb}. Must be a number or None.")
            return None
            
        if max_memory_mb is not None and max_memory_mb <= 0:
            logger.error(f"Invalid max_memory_mb value: {max_memory_mb}. Must be positive.")
            return None
            
        try:
            from fixed_web_platform.cross_model_tensor_sharing import TensorSharingManager
            
            # Set default memory limit if not provided
            if max_memory_mb is None:
                # Use 25% of available system memory if possible
                try:
                    import psutil
                    available_mem = psutil.virtual_memory().available / (1024 * 1024)  # Convert to MB
                    max_memory_mb = int(available_mem * 0.25)  # Use 25% of available memory
                    logger.info(f"Automatically set tensor sharing memory limit to {max_memory_mb} MB (25% of available memory)")
                except ImportError:
                    # Default to 1GB if psutil not available
                    max_memory_mb = 1024
                    logger.info(f"Set default tensor sharing memory limit to {max_memory_mb} MB")
            
            # Create the manager with validation
            try:
                self.tensor_sharing_manager = TensorSharingManager(max_memory_mb=max_memory_mb)
                logger.info(f"Tensor sharing enabled with max memory: {max_memory_mb} MB")
                
                # Initialize tracking metrics
                self.tensor_sharing_stats = {
                    "total_tensors": 0,
                    "total_memory_used_mb": 0,
                    "tensors_by_type": {},
                    "sharing_events": 0,
                    "creation_time": time.time()
                }
                
                return self.tensor_sharing_manager
            except Exception as e:
                logger.error(f"Error initializing TensorSharingManager: {e}")
                error_handler = ErrorHandler()
                error_obj = error_handler.handle_error(e, {"max_memory_mb": max_memory_mb})
                return None
                
        except ImportError as e:
            logger.warning(f"Cross-model tensor sharing not available: {e}. The 'cross_model_tensor_sharing' module could not be imported.")
            
            # Suggest installation if needed
            if "No module named" in str(e):
                package_name = str(e).split("No module named ")[-1].strip("'")
                logger.info(f"To enable tensor sharing, install the required package: pip install {package_name}")
                
            return None
        except Exception as e:
            logger.error(f"Unexpected error setting up tensor sharing: {e}")
            return None
            
    async def share_tensor_between_models(self, tensor_data, tensor_name, producer_model, consumer_models, 
                                       shape=None, storage_type="cpu", dtype="float32"):
        """
        Share a tensor between models in the resource pool.
        
        This method enables efficient sharing of tensor data between models to reduce
        memory usage and improve performance for multi-model workflows. It includes
        comprehensive validation, error handling, and diagnostics.
        
        Args:
            tensor_data: The tensor data to share (optional if registering external tensor)
            tensor_name: Name for the shared tensor
            producer_model: Model that produced the tensor
            consumer_models: List of models that will consume the tensor
            shape: Shape of the tensor (required if tensor_data is None)
            storage_type: Storage type (cpu, webgpu, webnn)
            dtype: Data type of the tensor
            
        Returns:
            Registration result (success boolean and tensor info)
        """
        from fixed_web_platform.unified_framework.error_handling import ErrorHandler
        error_handler = ErrorHandler()
        
        # Input validation
        if not tensor_name or not isinstance(tensor_name, str):
            return {
                "success": False, 
                "error": f"Invalid tensor_name: {tensor_name}. Must be a non-empty string.",
                "error_category": ErrorCategories.INPUT
            }
            
        if not isinstance(consumer_models, (list, tuple)) and consumer_models is not None:
            return {
                "success": False, 
                "error": f"Invalid consumer_models: {consumer_models}. Must be a list, tuple, or None.",
                "error_category": ErrorCategories.INPUT
            }
            
        if storage_type not in ("cpu", "webgpu", "webnn"):
            return {
                "success": False, 
                "error": f"Invalid storage_type: {storage_type}. Must be one of: cpu, webgpu, webnn.",
                "error_category": ErrorCategories.INPUT
            }
            
        # Ensure tensor sharing manager is initialized
        if not hasattr(self, 'tensor_sharing_manager'):
            try:
                manager = self.setup_tensor_sharing()
                if manager is None:
                    return {
                        "success": False, 
                        "error": "Tensor sharing manager creation failed",
                        "error_category": ErrorCategories.INITIALIZATION,
                        "reason": "Module import or initialization error",
                        "resolution": "Check if cross_model_tensor_sharing module is available"
                    }
            except Exception as e:
                logger.error(f"Error setting up tensor sharing: {e}")
                return {
                    "success": False, 
                    "error": f"Tensor sharing setup error: {str(e)}",
                    "error_category": ErrorCategories.INITIALIZATION,
                    "exception_type": type(e).__name__,
                    "traceback": traceback.format_exc()
                }
                
        if self.tensor_sharing_manager is None:
            return {
                "success": False, 
                "error": "Tensor sharing manager not available",
                "error_category": ErrorCategories.RESOURCE_UNAVAILABLE
            }
            
        # Validate shape
        try:
            if shape is None and tensor_data is not None:
                # Infer shape from tensor_data if not provided
                if hasattr(tensor_data, 'shape'):
                    shape = list(tensor_data.shape)
                elif hasattr(tensor_data, 'size') and callable(tensor_data.size):
                    shape = list(tensor_data.size())
                elif hasattr(tensor_data, 'get_shape') and callable(tensor_data.get_shape):
                    shape = list(tensor_data.get_shape())
                else:
                    return {
                        "success": False, 
                        "error": "Could not determine tensor shape. Please provide shape parameter.",
                        "error_category": ErrorCategories.INPUT
                    }
            elif shape is None:
                return {
                    "success": False, 
                    "error": "Must provide shape when tensor_data is None",
                    "error_category": ErrorCategories.INPUT
                }
                
            # Ensure shape is a list of integers
            if not isinstance(shape, (list, tuple)):
                return {
                    "success": False, 
                    "error": f"Shape must be a list or tuple, got {type(shape).__name__}",
                    "error_category": ErrorCategories.INPUT
                }
                
            for dim in shape:
                if not isinstance(dim, int):
                    return {
                        "success": False, 
                        "error": f"Shape dimensions must be integers, got {type(dim).__name__} in {shape}",
                        "error_category": ErrorCategories.INPUT
                    }
                
        except Exception as e:
            logger.error(f"Error validating tensor shape: {e}")
            return {
                "success": False, 
                "error": f"Shape validation error: {str(e)}",
                "error_category": ErrorCategories.INPUT,
                "exception_type": type(e).__name__
            }
            
        # Register the tensor
        try:
            # Register the tensor with the manager
            shared_tensor = self.tensor_sharing_manager.register_shared_tensor(
                name=tensor_name,
                shape=shape,
                storage_type=storage_type,
                producer_model=producer_model,
                consumer_models=consumer_models,
                dtype=dtype
            )
            
            # Store the actual tensor data if provided
            if tensor_data is not None:
                try:
                    shared_tensor.data = tensor_data
                except Exception as e:
                    logger.error(f"Error storing tensor data: {e}")
                    return {
                        "success": False, 
                        "error": f"Error storing tensor data: {str(e)}",
                        "error_category": ErrorCategories.DATA,
                        "exception_type": type(e).__name__
                    }
                    
            # Update stats
            if hasattr(self, 'tensor_sharing_stats'):
                self.tensor_sharing_stats["total_tensors"] += 1
                self.tensor_sharing_stats["sharing_events"] += 1
                
                # Calculate memory usage
                try:
                    memory_mb = shared_tensor.get_memory_usage() / (1024*1024)
                    self.tensor_sharing_stats["total_memory_used_mb"] += memory_mb
                    
                    # Track by tensor type
                    tensor_type = tensor_name.split('_')[-1] if '_' in tensor_name else 'unknown'
                    if tensor_type not in self.tensor_sharing_stats["tensors_by_type"]:
                        self.tensor_sharing_stats["tensors_by_type"][tensor_type] = {
                            "count": 0,
                            "memory_mb": 0
                        }
                    self.tensor_sharing_stats["tensors_by_type"][tensor_type]["count"] += 1
                    self.tensor_sharing_stats["tensors_by_type"][tensor_type]["memory_mb"] += memory_mb
                except Exception as stat_error:
                    logger.warning(f"Error updating tensor stats: {stat_error}")
                
            logger.info(f"Registered shared tensor {tensor_name} for models: {producer_model} -> {consumer_models}")
            
            # Detailed success response
            return {
                "success": True,
                "tensor_name": tensor_name,
                "producer": producer_model,
                "consumers": consumer_models,
                "storage_type": storage_type,
                "shape": shape,
                "dtype": dtype,
                "memory_mb": shared_tensor.get_memory_usage() / (1024*1024),
                "total_shared_tensors": getattr(self, 'tensor_sharing_stats', {}).get("total_tensors", 1),
                "sharing_id": id(shared_tensor)
            }
            
        except Exception as e:
            logger.error(f"Error sharing tensor: {e}")
            
            # Create detailed error response with categorization
            error_obj = error_handler.handle_error(e, {
                "tensor_name": tensor_name,
                "shape": shape,
                "storage_type": storage_type,
                "dtype": dtype
            })
            
            return {
                "success": False,
                "error": str(e),
                "error_category": error_obj["error_category"],
                "exception_type": type(e).__name__
            }

# For testing
if __name__ == "__main__":
    import asyncio
    
    async def test_resource_pool():
        # Create and initialize with the new async interface
        integration = ResourcePoolBridgeIntegration(adaptive_scaling=True)
        success = await integration.initialize()
        
        if not success:
            print("Failed to initialize resource pool bridge")
            return
        
        print("Resource pool bridge initialized successfully")
        
        try:
            # Test single model with the new async get_model
            print("\nGetting text model (BERT)...")
            model = await integration.get_model("text", "bert-base-uncased", {"priority_list": ["webgpu", "cpu"]})
            result = model("Sample text")
            print("Single model result:")
            print(json.dumps(result, indent=2))
            
            # Test concurrent execution with different model types
            print("\nGetting vision model (ViT)...")
            model2 = await integration.get_model("vision", "vit-base", {"priority_list": ["webgpu"]})
            
            print("Getting audio model (Whisper)...")
            model3 = await integration.get_model("audio", "whisper-tiny", {
                "priority_list": ["webgpu"],
                "compute_shaders": True  # Enable compute shaders for audio models
            })
            
            models_and_inputs = [
                (model, "Text input for BERT"),
                (model2, {"image": {"width": 224, "height": 224}}),
                (model3, {"audio": {"duration": 5.0}})
            ]
            
            print("\nRunning concurrent execution...")
            results = integration.execute_concurrent_sync(models_and_inputs)
            print("Concurrent execution results:")
            for i, result in enumerate(results):
                print(f"\nModel {i+1} result:")
                print(json.dumps(result, indent=2))
            
            # Get metrics
            metrics = integration.get_metrics()
            print("\nMetrics:")
            print(json.dumps(metrics, indent=2))
            
        finally:
            # Ensure clean shutdown
            print("\nClosing resource pool bridge...")
            await integration.close()
            print("Resource pool bridge closed")
    
    # Run the async test function
    asyncio.run(test_resource_pool())
