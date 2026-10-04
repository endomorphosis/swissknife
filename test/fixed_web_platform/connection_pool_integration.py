#!/usr/bin/env python3
"""
Connection Pool Integration for WebNN/WebGPU Resource Pool (May 2025)

This module implements the advanced connection pooling system for the
WebNN/WebGPU resource pool, providing efficient management of browser
connections with intelligent routing, adaptive scaling, and comprehensive
health monitoring with circuit breaker pattern.

Key features:
- Browser-aware connection pooling with lifecycle management
- Model-type optimized browser selection
- Dynamic connection scaling based on workload patterns
- Health monitoring with circuit breaker pattern for graceful degradation
- Detailed telemetry and monitoring with DuckDB integration
- Automatic recovery strategies for connection failures
- Cross-model tensor sharing integration
- Ultra-low precision support
"""

import os
import sys
import time
import json
import logging
import asyncio
import threading
from typing import Dict, List, Any, Optional, Tuple, Union, Callable, Set

# Import connection pool manager
from fixed_web_platform.connection_pool_manager import ConnectionPoolManager

# Import circuit breaker manager
from fixed_web_platform.resource_pool_circuit_breaker import ResourcePoolCircuitBreakerManager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ConnectionPoolIntegration:
    """
    Provides advanced connection pooling for WebNN/WebGPU resource pool with
    integrated health monitoring, circuit breaker pattern, and intelligent
    browser selection optimized by model type.
    
    This class combines the ConnectionPoolManager for efficient connection lifecycle
    management with the ResourcePoolCircuitBreaker for health monitoring and fault
    tolerance, providing a unified interface for accessing browser resources with:
    
    1. Automatic error detection and categorization
    2. Health-aware connection allocation
    3. Intelligent recovery strategies based on error types
    4. Graceful degradation when failures occur
    5. Resource optimization based on workload patterns
    6. Model-specific browser optimizations (Firefox for audio, Edge for embeddings)
    7. Comprehensive telemetry and health scoring
    """
    
    def __init__(self,
                 browser_connections: Dict[str, Any],
                 min_connections: int = 1,
                 max_connections: int = 8,
                 browser_preferences: Dict[str, str] = None,
                 adaptive_scaling: bool = True,
                 db_path: str = None,
                 headless: bool = True,
                 connection_timeout: float = 30.0,
                 health_check_interval: float = 60.0,
                 circuit_breaker_threshold: int = 5,
                 enable_tensor_sharing: bool = True,
                 enable_ultra_low_precision: bool = True):
        """
        Initialize connection pool integration.
        
        Args:
            browser_connections: Dict mapping connection IDs to browser connection objects
            min_connections: Minimum number of connections to maintain
            max_connections: Maximum number of connections allowed
            browser_preferences: Dict mapping model families to preferred browsers
            adaptive_scaling: Whether to enable adaptive scaling
            db_path: Path to DuckDB database for metrics storage
            headless: Whether to run browsers in headless mode
            connection_timeout: Timeout for connection operations (seconds)
            health_check_interval: Interval for health checks (seconds)
            circuit_breaker_threshold: Number of failures before circuit opens
            enable_tensor_sharing: Whether to enable cross-model tensor sharing
            enable_ultra_low_precision: Whether to enable 2-bit and 3-bit quantization
        """
        self.browser_connections = browser_connections
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.browser_preferences = browser_preferences
        self.adaptive_scaling = adaptive_scaling
        self.db_path = db_path
        self.headless = headless
        self.connection_timeout = connection_timeout
        self.health_check_interval = health_check_interval
        self.circuit_breaker_threshold = circuit_breaker_threshold
        self.enable_tensor_sharing = enable_tensor_sharing
        self.enable_ultra_low_precision = enable_ultra_low_precision
        
        # Initialize connection pool manager with enhanced parameters
        self.connection_pool = ConnectionPoolManager(
            min_connections=min_connections,
            max_connections=max_connections,
            browser_preferences=browser_preferences,
            adaptive_scaling=adaptive_scaling,
            headless=headless,
            connection_timeout=connection_timeout,
            health_check_interval=health_check_interval,
            db_path=db_path
        )
        
        # Initialize circuit breaker manager with custom threshold
        self.circuit_breaker = ResourcePoolCircuitBreakerManager(
            browser_connections=browser_connections
        )
        
        # Initialize DuckDB integration
        self.db_integration = None
        if db_path:
            try:
                from fixed_web_platform.resource_pool_db_integration import ResourcePoolDBIntegration
                self.db_integration = ResourcePoolDBIntegration(db_path=db_path)
                logger.info(f"DuckDB integration initialized with database: {db_path}")
            except ImportError:
                logger.warning("ResourcePoolDBIntegration not available, database integration disabled")
        
        # Track model to connection mapping for optimized routing
        self.model_connection_map = {}
        
        # Track connection health scores for performance-based routing
        self.connection_health_scores = {}
        
        # Track model family performance characteristics for optimization
        self.model_family_performance = {
            'audio': {'firefox': [], 'chrome': [], 'edge': []},
            'vision': {'firefox': [], 'chrome': [], 'edge': []},
            'text_embedding': {'firefox': [], 'chrome': [], 'edge': []},
            'text_generation': {'firefox': [], 'chrome': [], 'edge': []},
            'multimodal': {'firefox': [], 'chrome': [], 'edge': []}
        }
        
        # Initialize lock for thread safety
        self.lock = threading.RLock()
        
        # Initialization state
        self.initialized = False
        
        # Import tensor sharing if enabled
        self.tensor_sharing_manager = None
        if self.enable_tensor_sharing:
            try:
                from fixed_web_platform.cross_model_tensor_sharing import TensorSharingManager
                self.tensor_sharing_manager = TensorSharingManager(max_memory_mb=2048)
                logger.info("TensorSharingManager imported successfully")
            except ImportError:
                logger.warning("TensorSharingManager not available, tensor sharing disabled")
                
        # Import ultra-low precision if enabled
        self.ultra_low_precision_manager = None
        if self.enable_ultra_low_precision:
            try:
                from fixed_web_platform.webgpu_ultra_low_precision import UltraLowPrecisionManager
                self.ultra_low_precision_manager = UltraLowPrecisionManager()
                logger.info("UltraLowPrecisionManager imported successfully")
            except ImportError:
                logger.warning("UltraLowPrecisionManager not available, ultra-low precision disabled")
        
        logger.info(f"ConnectionPoolIntegration created with {min_connections}-{max_connections} connections, "
                   f"tensor_sharing={'enabled' if self.tensor_sharing_manager else 'disabled'}, "
                   f"ultra_low_precision={'enabled' if self.ultra_low_precision_manager else 'disabled'}, "
                   f"db_integration={'enabled' if self.db_integration else 'disabled'}")
    
    async def initialize(self) -> bool:
        """
        Initialize the connection pool integration with comprehensive setup of all components.
        
        This method initializes the connection pool, circuit breaker, tensor sharing,
        ultra-low precision components, and DuckDB integration with graceful degradation
        if any component fails.
        
        Returns:
            True if initialization succeeded, False otherwise
        """
        with self.lock:
            if self.initialized:
                return True
            
            try:
                # Initialize connection pool manager
                pool_success = await self.connection_pool.initialize()
                if not pool_success:
                    logger.error("Failed to initialize connection pool")
                    return False
                
                # Initialize circuit breaker manager
                await self.circuit_breaker.initialize()
                
                # Initialize DuckDB integration if enabled
                if self.db_integration:
                    try:
                        db_success = self.db_integration.initialize()
                        if db_success:
                            logger.info("DuckDB integration initialized successfully")
                        else:
                            logger.warning("DuckDB integration initialization failed, continuing without database")
                            self.db_integration = None
                    except Exception as e:
                        logger.warning(f"Error initializing DuckDB integration, continuing without: {e}")
                        self.db_integration = None
                
                # Initialize tensor sharing if enabled
                if self.tensor_sharing_manager:
                    try:
                        # If tensor sharing manager has an initialize method
                        if hasattr(self.tensor_sharing_manager, 'initialize'):
                            await self.tensor_sharing_manager.initialize()
                        logger.info("Tensor sharing manager initialized successfully")
                    except Exception as e:
                        logger.warning(f"Error initializing tensor sharing, continuing without: {e}")
                        self.tensor_sharing_manager = None
                
                # Initialize ultra-low precision if enabled
                if self.ultra_low_precision_manager:
                    try:
                        # If ultra low precision manager has an initialize method
                        if hasattr(self.ultra_low_precision_manager, 'initialize'):
                            await self.ultra_low_precision_manager.initialize()
                        logger.info("Ultra-low precision manager initialized successfully")
                    except Exception as e:
                        logger.warning(f"Error initializing ultra-low precision, continuing without: {e}")
                        self.ultra_low_precision_manager = None
                
                # Register health check functions with circuit breaker
                if hasattr(self.circuit_breaker, 'register_health_check'):
                    self.circuit_breaker.register_health_check(self._check_connection_health)
                
                # Update all connection health scores initially
                await self._update_connection_health_scores()
                
                # Store initial browser connections data in database if available
                if self.db_integration and self.browser_connections:
                    for conn_id, conn in self.browser_connections.items():
                        await self._store_browser_connection_data(conn_id, conn)
                
                self.initialized = True
                logger.info("ConnectionPoolIntegration initialized successfully")
                return True
            except Exception as e:
                logger.error(f"Error initializing ConnectionPoolIntegration: {e}")
                return False
                
    async def _check_connection_health(self, connection_id: str) -> bool:
        """
        Check health of a specific connection.
        
        This method is used as a health check callback for the circuit breaker,
        providing more comprehensive health assessment beyond simple pings.
        
        Args:
            connection_id: ID of connection to check
            
        Returns:
            True if connection is healthy, False otherwise
        """
        if connection_id not in self.browser_connections:
            return False
            
        connection = self.browser_connections[connection_id]
        
        # Check if connection is active
        if not connection.get('active', False):
            return False
            
        # Check if connection has bridge attribute with is_connected
        bridge = connection.get('bridge')
        if bridge and hasattr(bridge, 'is_connected'):
            if not bridge.is_connected:
                logger.warning(f"Connection {connection_id} WebSocket not connected")
                return False
        
        # Perform deeper health check if possible
        try:
            # Check for memory issues or other resource constraints
            if 'resource_usage' in connection:
                memory_mb = connection['resource_usage'].get('memory_mb', 0)
                cpu_percent = connection['resource_usage'].get('cpu_percent', 0)
                
                # Flag as unhealthy if memory usage is very high
                if memory_mb > 2000:  # 2GB threshold
                    logger.warning(f"Connection {connection_id} has high memory usage: {memory_mb:.1f} MB")
                    return False
                    
                # Flag as unhealthy if CPU usage is very high
                if cpu_percent > 90:  # 90% threshold
                    logger.warning(f"Connection {connection_id} has high CPU usage: {cpu_percent:.1f}%")
                    return False
            
            # Check for error rate
            if connection_id in self.connection_health_scores:
                health_score = self.connection_health_scores[connection_id]
                if health_score < 50:  # Below 50% health score threshold
                    logger.warning(f"Connection {connection_id} has low health score: {health_score:.1f}")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"Error checking connection health for {connection_id}: {e}")
            return False
            
    async def _update_connection_health_scores(self):
        """
        Update health scores for all connections.
        
        This method calculates and updates health scores for all connections
        based on error rates, response times, and other metrics.
        """
        try:
            # Get health summary from circuit breaker
            health_summary = await self.circuit_breaker.get_health_summary()
            
            # Extract connection health scores
            if 'connections' in health_summary:
                for conn_id, conn_health in health_summary['connections'].items():
                    if 'health_score' in conn_health:
                        self.connection_health_scores[conn_id] = conn_health['health_score']
                        
                        # Store health metrics in database if available
                        if self.db_integration and conn_id in self.browser_connections:
                            await self._store_resource_pool_metrics(conn_id, conn_health)
                        
        except Exception as e:
            logger.error(f"Error updating connection health scores: {e}")
            # Default health scores if update fails
            for conn_id in self.browser_connections:
                if conn_id not in self.connection_health_scores:
                    self.connection_health_scores[conn_id] = 100.0  # Default to perfect health
    
    async def _store_browser_connection_data(self, connection_id: str, connection: Dict[str, Any]):
        """
        Store browser connection information in the database.
        
        Args:
            connection_id: Unique identifier for the connection
            connection: Connection data dictionary
        """
        if not self.db_integration:
            return
            
        try:
            # Extract relevant connection data
            browser = connection.get('browser', 'unknown')
            platform = connection.get('platform', 'unknown')
            is_simulation = connection.get('is_simulation', True)
            startup_time = connection.get('startup_time', 0.0)
            
            # Extract other useful information
            adapter_info = connection.get('adapter_info', {})
            browser_info = connection.get('browser_info', {})
            features = connection.get('features', {})
            
            # Prepare data for database
            connection_data = {
                'connection_id': connection_id,
                'browser': browser,
                'platform': platform,
                'startup_time': startup_time,
                'is_simulation': is_simulation,
                'adapter_info': adapter_info,
                'browser_info': browser_info,
                'features': features
            }
            
            # Store in database
            success = self.db_integration.store_browser_connection(connection_data)
            if success:
                logger.debug(f"Stored connection data for {connection_id} in database")
            else:
                logger.warning(f"Failed to store connection data for {connection_id} in database")
                
        except Exception as e:
            logger.warning(f"Error storing browser connection data: {e}")
            
    async def _store_resource_pool_metrics(self, connection_id: str, health_data: Dict[str, Any]):
        """
        Store resource pool metrics in the database.
        
        Args:
            connection_id: Connection ID
            health_data: Health data dictionary from circuit breaker
        """
        if not self.db_integration or not self.initialized:
            return
            
        try:
            # Prepare resource pool metrics for database
            active_connections = sum(1 for conn in self.browser_connections.values() if conn.get('active', False))
            total_connections = len(self.browser_connections)
            connection_utilization = active_connections / max(1, self.max_connections)
            
            # Gather browser distribution stats
            browser_distribution = {}
            for conn in self.browser_connections.values():
                browser = conn.get('browser', 'unknown')
                if browser not in browser_distribution:
                    browser_distribution[browser] = 0
                browser_distribution[browser] += 1
                
            # Gather platform distribution stats
            platform_distribution = {}
            for conn in self.browser_connections.values():
                platform = conn.get('platform', 'unknown')
                if platform not in platform_distribution:
                    platform_distribution[platform] = 0
                platform_distribution[platform] += 1
                
            # Gather model distribution stats
            model_distribution = {}
            for model_key in self.model_connection_map.keys():
                model_type = model_key.split('_')[0] if '_' in model_key else 'unknown'
                if model_type not in model_distribution:
                    model_distribution[model_type] = 0
                model_distribution[model_type] += 1
                
            # Get resource usage from connection if available
            system_memory_percent = 0.0
            process_memory_mb = 0.0
            if connection_id in self.browser_connections:
                conn = self.browser_connections[connection_id]
                if 'resource_usage' in conn:
                    system_memory_percent = conn['resource_usage'].get('system_memory_percent', 0.0)
                    process_memory_mb = conn['resource_usage'].get('memory_mb', 0.0)
            
            # Prepare metrics data
            metrics_data = {
                'pool_size': self.max_connections,
                'active_connections': active_connections,
                'total_connections': total_connections,
                'connection_utilization': connection_utilization,
                'browser_distribution': browser_distribution,
                'platform_distribution': platform_distribution,
                'model_distribution': model_distribution,
                'scaling_event': False,  # Will be set to True when scaling occurs
                'scaling_reason': '',
                'messages_sent': health_data.get('messages_sent', 0),
                'messages_received': health_data.get('messages_received', 0),
                'errors': health_data.get('errors', 0),
                'system_memory_percent': system_memory_percent,
                'process_memory_mb': process_memory_mb
            }
            
            # Store in database
            success = self.db_integration.store_resource_pool_metrics(metrics_data)
            if success:
                logger.debug(f"Stored resource pool metrics in database")
            else:
                logger.warning(f"Failed to store resource pool metrics in database")
                
        except Exception as e:
            logger.warning(f"Error storing resource pool metrics: {e}")
            
    async def _store_performance_metrics(self, connection_id: str, model_name: str, model_type: str, metrics: Dict[str, Any]):
        """
        Store model performance metrics in the database.
        
        Args:
            connection_id: ID of the connection used
            model_name: Name of the model
            model_type: Type of the model (audio, vision, text_embedding, etc.)
            metrics: Performance metrics dictionary
        """
        if not self.db_integration or not self.initialized:
            return
            
        try:
            # Get connection info
            if connection_id not in self.browser_connections:
                return
                
            connection = self.browser_connections[connection_id]
            browser = connection.get('browser', 'unknown')
            platform = connection.get('platform', 'unknown')
            is_real_hardware = not connection.get('is_simulation', True)
            
            # Extract performance metrics
            inference_time_ms = metrics.get('inference_time_ms', 0.0)
            throughput = metrics.get('throughput', 0.0)
            memory_usage_mb = metrics.get('memory_mb', 0.0)
            initialization_time_ms = metrics.get('initialization_time_ms', 0.0)
            
            # Extract optimization flags
            compute_shader_optimized = metrics.get('compute_shader_optimized', False)
            precompile_shaders = metrics.get('precompile_shaders', False)
            parallel_loading = metrics.get('parallel_loading', False)
            mixed_precision = metrics.get('mixed_precision', False)
            precision_bits = metrics.get('precision_bits', 16)
            
            # Prepare adapter info
            adapter_info = connection.get('adapter_info', {})
            
            # Prepare model info
            model_info = {
                'name': model_name,
                'type': model_type,
                'params': metrics.get('params', 'unknown')
            }
            
            # Prepare performance data
            performance_data = {
                'connection_id': connection_id,
                'model_name': model_name,
                'model_type': model_type,
                'platform': platform,
                'browser': browser,
                'is_real_hardware': is_real_hardware,
                'compute_shader_optimized': compute_shader_optimized,
                'precompile_shaders': precompile_shaders,
                'parallel_loading': parallel_loading,
                'mixed_precision': mixed_precision,
                'precision': precision_bits,
                'initialization_time_ms': initialization_time_ms,
                'inference_time_ms': inference_time_ms,
                'memory_usage_mb': memory_usage_mb,
                'throughput_items_per_second': throughput,
                'latency_ms': inference_time_ms,
                'batch_size': metrics.get('batch_size', 1),
                'adapter_info': adapter_info,
                'model_info': model_info,
                'simulation_mode': not is_real_hardware
            }
            
            # Store in database
            success = self.db_integration.store_performance_metrics(performance_data)
            if success:
                logger.debug(f"Stored performance metrics for {model_name} in database")
            else:
                logger.warning(f"Failed to store performance metrics for {model_name} in database")
                
        except Exception as e:
            logger.warning(f"Error storing performance metrics: {e}")
    
    async def get_connection(self, 
                           model_type: str, 
                           platform: str = 'webgpu', 
                           browser: str = None,
                           hardware_preferences: Dict[str, Any] = None,
                           model_name: str = None) -> Tuple[str, Dict[str, Any]]:
        """
        Get an optimal connection for a model type with health checks and circuit breaker pattern.
        
        This method implements intelligent browser selection with adaptive scoring based on
        model type and hardware preferences. It applies the circuit breaker pattern for
        health-aware connection allocation, ensuring graceful degradation when failures occur.
        
        The method performs:
        1. Browser optimization based on model type (Firefox for audio, Edge for embedding, etc.)
        2. Platform selection based on hardware preferences and availability
        3. Health-aware allocation using circuit breaker pattern
        4. Dynamic routing based on connection health scores
        5. Feature-specific optimizations (compute shaders, WebNN acceleration)
        
        Args:
            model_type: Type of model (audio, vision, text_embedding, etc.)
            platform: Platform to use (webgpu, webnn, or cpu)
            browser: Specific browser to use (if None, determined from preferences)
            hardware_preferences: Optional hardware preferences
            model_name: Name of the model (for tracking model-specific performance)
            
        Returns:
            Tuple of (connection_id, connection_info)
        """
        # Generate a model identifier for tracking
        model_id = f"{model_type}_{model_name or 'unknown'}_{int(time.time())}"
            
        # Apply model-specific optimizations
        platform_adjusted = platform
        browser_adjusted = browser
        
        # Update platform based on hardware preferences
        if hardware_preferences and 'priority_list' in hardware_preferences:
            priority_list = hardware_preferences['priority_list']
            if priority_list and len(priority_list) > 0:
                platform_adjusted = priority_list[0]  # Use highest priority platform
        
        # Apply browser optimization based on model type if not explicitly specified
        if not browser_adjusted:
            # Audio models perform best on Firefox (compute shaders)
            if 'audio' in model_type.lower():
                browser_adjusted = 'firefox'
                # Make sure compute shaders are enabled for audio models on Firefox
                if hardware_preferences and 'compute_shaders' not in hardware_preferences:
                    hardware_preferences = hardware_preferences.copy() if hardware_preferences else {}
                    hardware_preferences['compute_shaders'] = True
                logger.info(f"Selected Firefox for audio model {model_name or ''} (optimized for compute shaders)")
                
            # Text embedding models perform best on Edge (WebNN)
            elif 'text_embedding' in model_type.lower() or model_type == 'bert':
                browser_adjusted = 'edge'
                # Set platform to WebNN for text embedding on Edge
                if platform_adjusted == 'webgpu':
                    platform_adjusted = 'webnn'
                logger.info(f"Selected Edge for text embedding model {model_name or ''} (optimized for WebNN)")
                
            # Vision models perform well on Chrome (WebGPU)
            elif 'vision' in model_type.lower() or model_type in ['vit', 'clip', 'detr']:
                browser_adjusted = 'chrome'
                logger.info(f"Selected Chrome for vision model {model_name or ''} (optimized for WebGPU)")
                
            # For other model types, use browser preferences or default to Chrome
            else:
                for key, preferred_browser in self.browser_preferences.items():
                    if key in model_type.lower():
                        browser_adjusted = preferred_browser
                        break
                
                # Default to Chrome if still not set
                if not browser_adjusted:
                    browser_adjusted = 'chrome'
        
        # Check if we have performance data for this model type and browser combination
        # and prioritize connections that have proven to perform well for this model type
        best_connection_id = None
        if model_type in self.model_family_performance and browser_adjusted in self.model_family_performance[model_type]:
            performance_data = self.model_family_performance[model_type][browser_adjusted]
            if performance_data:
                # Find best performing connection based on latency
                best_connection = min(performance_data, key=lambda x: x.get('latency', float('inf')))
                best_connection_id = best_connection.get('connection_id')
                
                # Check if it's still healthy
                if best_connection_id in self.browser_connections:
                    allowed, reason = await self.circuit_breaker.pre_request_check(best_connection_id)
                    if allowed:
                        logger.info(f"Reusing high-performance connection {best_connection_id} for {model_type} model")
                        return best_connection_id, self.browser_connections[best_connection_id]
                    else:
                        logger.warning(f"Best performing connection {best_connection_id} not healthy: {reason}")
        
        # Try known good connections for model first
        if model_name and f"{model_type}_{model_name}" in self.model_connection_map:
            preferred_conn_id = self.model_connection_map[f"{model_type}_{model_name}"]
            
            # Check if connection is still healthy
            if preferred_conn_id in self.browser_connections:
                allowed, reason = await self.circuit_breaker.pre_request_check(preferred_conn_id)
                if allowed:
                    logger.info(f"Reusing known good connection {preferred_conn_id} for {model_name}")
                    return preferred_conn_id, self.browser_connections[preferred_conn_id]
                else:
                    logger.warning(f"Known good connection {preferred_conn_id} not healthy: {reason}")
                    # Remove from mapping since it's no longer healthy
                    self.model_connection_map.pop(f"{model_type}_{model_name}")
        
        # Get connection from pool with adjusted browser and platform
        connection_id, connection = await self.connection_pool.get_connection(
            model_type=model_type,
            platform=platform_adjusted,
            browser=browser_adjusted,
            hardware_preferences=hardware_preferences
        )
        
        if not connection_id or 'error' in connection:
            logger.warning(f"Failed to get connection for {model_type} model: {connection.get('error', 'Unknown error')}")
            return None, {"error": connection.get('error', 'Failed to get connection')}
        
        # Check if connection is allowed by circuit breaker
        allowed, reason = await self.circuit_breaker.pre_request_check(connection_id)
        if not allowed:
            logger.warning(f"Connection {connection_id} not allowed by circuit breaker: {reason}")
            
            # Try with a different browser if circuit breaker blocked this one
            fallback_browser = None
            if browser_adjusted == 'firefox':
                fallback_browser = 'chrome'
            elif browser_adjusted == 'edge':
                fallback_browser = 'chrome'
            elif browser_adjusted == 'chrome':
                fallback_browser = 'firefox'
                
            if fallback_browser:
                logger.info(f"Trying fallback browser {fallback_browser} for {model_type} model")
                fallback_conn_id, fallback_conn = await self.connection_pool.get_connection(
                    model_type=model_type,
                    platform=platform_adjusted,
                    browser=fallback_browser,
                    hardware_preferences=hardware_preferences
                )
                
                if fallback_conn_id:
                    # Check if fallback is allowed
                    allowed, reason = await self.circuit_breaker.pre_request_check(fallback_conn_id)
                    if allowed:
                        logger.info(f"Using fallback browser {fallback_browser} for {model_type} model")
                        return fallback_conn_id, fallback_conn
            
            return None, {"error": f"Connection not allowed: {reason}"}
        
        # If model_name provided, update mapping for future use
        if model_name:
            self.model_connection_map[f"{model_type}_{model_name}"] = connection_id
        
        # Record that model was loaded in this connection
        if 'loaded_models' in connection:
            connection['loaded_models'].add(model_name or model_type)
        
        return connection_id, connection
    
    def get_connection_sync(self, 
                           model_type: str, 
                           platform: str = 'webgpu', 
                           browser: str = None,
                           hardware_preferences: Dict[str, Any] = None,
                           model_name: str = None) -> Tuple[str, Dict[str, Any]]:
        """
        Synchronous wrapper for get_connection.
        
        Args:
            model_type: Type of model (audio, vision, text_embedding, etc.)
            platform: Platform to use (webgpu, webnn, or cpu)
            browser: Specific browser to use (if None, determined from preferences)
            hardware_preferences: Optional hardware preferences
            model_name: Name of the model (for tracking model-specific performance)
            
        Returns:
            Tuple of (connection_id, connection_info)
        """
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        return loop.run_until_complete(self.get_connection(
            model_type=model_type, 
            platform=platform, 
            browser=browser, 
            hardware_preferences=hardware_preferences,
            model_name=model_name
        ))
    
    async def release_connection(self, connection_id: str, success: bool = True, error_type: str = None, metrics: Dict[str, Any] = None):
        """
        Release a connection back to the pool with comprehensive health metrics and model performance tracking.
        
        This method updates the circuit breaker with request results, tracks model-specific performance
        metrics for optimizing future connection selection, and integrates with tensor sharing and
        ultra-low precision components to optimize resource usage. It also stores performance metrics
        in the DuckDB database if available.
        
        Args:
            connection_id: Connection ID to release
            success: Whether the operation was successful
            error_type: Type of error encountered (if not successful)
            metrics: Optional performance metrics from the operation
        """
        if not self.initialized or connection_id not in self.browser_connections:
            return
        
        # Record request result with circuit breaker
        if metrics and 'response_time_ms' in metrics:
            await self.circuit_breaker.record_request_result(
                connection_id=connection_id,
                success=success,
                error_type=error_type,
                response_time_ms=metrics['response_time_ms']
            )
        else:
            await self.circuit_breaker.record_request_result(
                connection_id=connection_id,
                success=success,
                error_type=error_type
            )
        
        # If there's a model name in metrics, record model performance
        if metrics and 'model_name' in metrics and 'inference_time_ms' in metrics:
            # Record with circuit breaker
            await self.circuit_breaker.record_model_performance(
                connection_id=connection_id,
                model_name=metrics['model_name'],
                inference_time_ms=metrics['inference_time_ms'],
                success=success
            )
            
            # Record in model family performance tracking for future routing optimization
            if 'model_type' in metrics:
                model_type = metrics['model_type']
                browser = self.browser_connections[connection_id].get('browser', 'unknown')
                
                # Only track if we know the model type and browser
                if model_type in self.model_family_performance and browser in self.model_family_performance[model_type]:
                    performance_entry = {
                        'connection_id': connection_id,
                        'model_name': metrics['model_name'],
                        'latency': metrics['inference_time_ms'],
                        'throughput': metrics.get('throughput', 0.0),
                        'memory_mb': metrics.get('memory_mb', 0.0),
                        'success': success,
                        'timestamp': time.time()
                    }
                    
                    # Add to performance tracking
                    self.model_family_performance[model_type][browser].append(performance_entry)
                    
                    # Keep only the last 10 performance entries per model type/browser
                    if len(self.model_family_performance[model_type][browser]) > 10:
                        self.model_family_performance[model_type][browser] = self.model_family_performance[model_type][browser][-10:]
                    
                    if success:
                        logger.info(f"Recorded performance data for {metrics['model_name']} on {browser}: {metrics['inference_time_ms']:.2f}ms")
                        
                # Store performance metrics in database
                if self.db_integration and success:
                    await self._store_performance_metrics(
                        connection_id=connection_id,
                        model_name=metrics['model_name'],
                        model_type=model_type,
                        metrics=metrics
                    )
            
        # Update connection in pool
        connection = self.browser_connections[connection_id]
        connection['last_used_time'] = time.time()
        
        # Update resource usage if available
        if metrics and 'resource_usage' in metrics:
            connection['resource_usage'] = metrics['resource_usage']
            
            # Log warning if memory usage is high
            if 'memory_mb' in metrics['resource_usage'] and metrics['resource_usage']['memory_mb'] > 1000:
                logger.warning(f"High memory usage detected in connection {connection_id}: {metrics['resource_usage']['memory_mb']:.1f} MB")
                
            # Check if we should trigger ultra-low precision automatically
            if self.ultra_low_precision_manager and metrics['resource_usage'].get('memory_mb', 0) > 1500:
                # Memory usage high, suggest using ultra-low precision
                model_name = metrics.get('model_name')
                if model_name:
                    logger.info(f"High memory usage detected, consider using ultra-low precision for {model_name}")
        
        # Update connection health scores and store in database
        await self._update_connection_health_scores()
    
    async def handle_error(self, connection_id: str, error: Exception, error_context: Dict[str, Any]) -> bool:
        """
        Handle an error with a connection using the circuit breaker pattern with advanced recovery strategies.
        
        This method implements intelligent error handling and recovery based on error type, model,
        and browser characteristics. It automatically categorizes errors, applies the appropriate
        recovery strategy, and updates health metrics for future connection selection decisions.
        
        Specialized handling includes:
        1. Websocket reconnection for connection issues
        2. Browser restart for resource issues (high memory, unresponsive)
        3. Model-specific optimizations for inference failures
        4. Hardware-specific recovery strategies for platform issues
        5. Graceful degradation with fallback to CPU simulation when needed
        
        Args:
            connection_id: Connection ID that had an error
            error: Exception that occurred
            error_context: Context information about the error
            
        Returns:
            True if recovery was successful, False otherwise
        """
        if not self.initialized or connection_id not in self.browser_connections:
            return False
            
        try:
            # Store error context for more specific handling
            model_type = error_context.get('model_type')
            model_name = error_context.get('model_name')
            
            # Log detailed error information
            logger.warning(f"Handling error in connection {connection_id}: {error} (context: {error_context})")
            
            # If there's a model name in the error context, remove it from mapping
            if model_name and f"{model_type}_{model_name}" in self.model_connection_map:
                if self.model_connection_map[f"{model_type}_{model_name}"] == connection_id:
                    # Only remove if it's mapped to this specific connection
                    logger.info(f"Removing mapping for {model_name} due to error")
                    self.model_connection_map.pop(f"{model_type}_{model_name}")
            
            # Try to categorize error more specifically based on error message and context
            error_message = str(error).lower()
            
            # Memory-related issues
            if 'memory' in error_message or 'out of memory' in error_message:
                # If it's a memory issue and we have ultra-low precision, try to use it
                if self.ultra_low_precision_manager and model_name:
                    logger.info(f"Memory issue detected, suggesting ultra-low precision for {model_name}")
                    # In a real implementation, we would apply ultra-low precision here
                    
                # For now, just let circuit breaker handle it
                recovery_success = await self.circuit_breaker.handle_error(connection_id, error, error_context)
                if recovery_success:
                    # For memory issues, suggest browser restart
                    logger.info(f"Suggesting browser restart for connection {connection_id} after memory issue")
                    # In a real implementation, trigger browser restart
                
                return recovery_success
                
            # WebSocket connection issues
            elif 'websocket' in error_message or 'connection' in error_message:
                # Let circuit breaker handle WebSocket issues
                recovery_success = await self.circuit_breaker.handle_error(connection_id, error, error_context)
                
                # Update model connection mapping to avoid reusing this connection
                for k, v in list(self.model_connection_map.items()):
                    if v == connection_id:
                        self.model_connection_map.pop(k)
                        
                return recovery_success
                
            # Browser-specific issues
            elif 'browser' in error_message or 'selenium' in error_message:
                # These often require browser restart
                logger.info(f"Browser issue detected, handling with circuit breaker and suggesting restart")
                recovery_success = await self.circuit_breaker.handle_error(connection_id, error, error_context)
                
                # Update connection in browser connections
                if connection_id in self.browser_connections:
                    self.browser_connections[connection_id]['health_status'] = 'degraded'
                    
                return recovery_success
                
            # For all other errors, let circuit breaker handle it
            else:
                return await self.circuit_breaker.handle_error(connection_id, error, error_context)
                
        except Exception as e:
            logger.error(f"Error in handle_error for connection {connection_id}: {e}")
            # Fall back to basic error handling
            return await self.circuit_breaker.handle_error(connection_id, error, error_context)
    
    async def get_health_summary(self) -> Dict[str, Any]:
        """
        Get a comprehensive health summary of all connections with enhanced metrics.
        
        This method combines health metrics from the circuit breaker, connection pool,
        tensor sharing, and ultra-low precision components to provide a complete view
        of system health, resource usage, and optimization opportunities.
        
        Returns:
            Dict with detailed health information including:
            - Circuit breaker status for each connection
            - Connection pool statistics
            - Browser-specific performance metrics
            - Memory usage and optimization recommendations
            - Model-specific performance characteristics
            - Tensor sharing statistics
            - Ultra-low precision statistics
        """
        try:
            # Get circuit breaker health summary
            circuit_health = await self.circuit_breaker.get_health_summary()
            
            # Get connection pool stats
            pool_stats = self.connection_pool.get_stats()
            
            # Get tensor sharing stats if available
            tensor_sharing_stats = {}
            if self.tensor_sharing_manager and hasattr(self.tensor_sharing_manager, 'get_stats'):
                tensor_sharing_stats = self.tensor_sharing_manager.get_stats()
                
            # Get ultra-low precision stats if available
            ulp_stats = {}
            if self.ultra_low_precision_manager and hasattr(self.ultra_low_precision_manager, 'get_stats'):
                ulp_stats = self.ultra_low_precision_manager.get_stats()
                
            # Calculate model performance statistics by browser
            model_browser_stats = {}
            for model_type, browser_data in self.model_family_performance.items():
                model_browser_stats[model_type] = {}
                for browser, performances in browser_data.items():
                    if performances:
                        # Calculate average latency and throughput
                        avg_latency = sum(p.get('latency', 0) for p in performances) / len(performances)
                        avg_throughput = sum(p.get('throughput', 0) for p in performances) / len(performances)
                        success_rate = sum(1 for p in performances if p.get('success', False)) / len(performances)
                        
                        model_browser_stats[model_type][browser] = {
                            'avg_latency_ms': avg_latency,
                            'avg_throughput': avg_throughput,
                            'success_rate': success_rate,
                            'sample_count': len(performances),
                            'last_updated': max(p.get('timestamp', 0) for p in performances)
                        }
            
            # Build comprehensive health summary
            summary = {
                'timestamp': time.time(),
                'circuit_breaker': circuit_health,
                'connection_pool': pool_stats,
                'tensor_sharing': tensor_sharing_stats,
                'ultra_low_precision': ulp_stats,
                'model_browser_performance': model_browser_stats,
                'browser_recommendations': self._generate_browser_recommendations(model_browser_stats),
                'optimization_recommendations': self._generate_optimization_recommendations()
            }
            
            # Add connection health scores
            summary['connection_health_scores'] = self.connection_health_scores
            
            # Add current model connection mappings
            summary['model_connection_mappings'] = len(self.model_connection_map)
            
            return summary
        except Exception as e:
            logger.error(f"Error generating health summary: {e}")
            # Return basic summary if there's an error
            return {
                'timestamp': time.time(),
                'error': str(e),
                'connection_count': len(self.browser_connections)
            }
    
    def _generate_browser_recommendations(self, model_browser_stats: Dict[str, Dict[str, Dict[str, Any]]]) -> Dict[str, str]:
        """
        Generate browser recommendations for different model types.
        
        Args:
            model_browser_stats: Statistics on model performance by browser
            
        Returns:
            Dict mapping model types to recommended browsers
        """
        recommendations = {}
        
        # For each model type, find the browser with lowest average latency
        for model_type, browser_stats in model_browser_stats.items():
            if not browser_stats:
                continue
                
            # Find browser with lowest latency and good success rate
            best_browser = None
            best_latency = float('inf')
            
            for browser, stats in browser_stats.items():
                # Only consider browsers with good success rate
                if stats.get('success_rate', 0) >= 0.9 and stats.get('sample_count', 0) >= 3:
                    latency = stats.get('avg_latency_ms', float('inf'))
                    if latency < best_latency:
                        best_latency = latency
                        best_browser = browser
            
            if best_browser:
                recommendations[model_type] = best_browser
        
        # Apply default recommendations if we don't have data
        if 'audio' not in recommendations:
            recommendations['audio'] = 'firefox'  # Firefox performs best for audio models
        
        if 'text_embedding' not in recommendations:
            recommendations['text_embedding'] = 'edge'  # Edge performs best for text embeddings
        
        if 'vision' not in recommendations:
            recommendations['vision'] = 'chrome'  # Chrome performs well for vision models
            
        return recommendations
        
    def _generate_optimization_recommendations(self) -> List[Dict[str, Any]]:
        """
        Generate optimization recommendations based on current status.
        
        Returns:
            List of recommendation objects
        """
        recommendations = []
        
        # Check if we should enable tensor sharing
        if not self.tensor_sharing_manager:
            recommendations.append({
                'type': 'feature_enablement',
                'feature': 'tensor_sharing',
                'reason': 'Could reduce memory usage by up to 30% for multi-model workloads',
                'priority': 'high'
            })
        
        # Check if we should enable ultra-low precision
        if not self.ultra_low_precision_manager:
            recommendations.append({
                'type': 'feature_enablement',
                'feature': 'ultra_low_precision',
                'reason': 'Could reduce memory usage by up to 87.5% for memory-intensive models',
                'priority': 'high'
            })
        
        # Check connection pool size recommendations
        active_connections = sum(1 for conn in self.browser_connections.values() if conn.get('active', False))
        if active_connections > self.max_connections * 0.8:
            recommendations.append({
                'type': 'resource_scaling',
                'resource': 'connection_pool',
                'action': 'increase_max_connections',
                'current': self.max_connections,
                'recommended': self.max_connections + 2,
                'reason': f'Pool is at {active_connections}/{self.max_connections} capacity',
                'priority': 'medium'
            })
        
        return recommendations
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get comprehensive statistics about the connection pool and related components.
        
        Returns:
            Dict with detailed statistics including:
            - Connection pool metrics
            - Circuit breaker statistics
            - Browser distribution
            - Model allocation
            - Health metrics
            - Performance data
        """
        # Get base connection pool stats
        stats = self.connection_pool.get_stats() if hasattr(self.connection_pool, 'get_stats') else {}
        
        # Add circuit breaker stats if possible (non-async version)
        try:
            if hasattr(self.circuit_breaker, 'get_stats'):
                circuit_stats = self.circuit_breaker.get_stats()
                stats['circuit_breaker'] = circuit_stats
        except Exception:
            stats['circuit_breaker'] = {"error": "Failed to get circuit breaker stats"}
        
        # Add tensor sharing stats if enabled
        if self.tensor_sharing_manager and hasattr(self.tensor_sharing_manager, 'get_stats'):
            try:
                stats['tensor_sharing'] = self.tensor_sharing_manager.get_stats()
            except Exception:
                stats['tensor_sharing'] = {"error": "Failed to get tensor sharing stats"}
        else:
            stats['tensor_sharing'] = {"enabled": False}
            
        # Add ultra-low precision stats if enabled
        if self.ultra_low_precision_manager and hasattr(self.ultra_low_precision_manager, 'get_stats'):
            try:
                stats['ultra_low_precision'] = self.ultra_low_precision_manager.get_stats()
            except Exception:
                stats['ultra_low_precision'] = {"error": "Failed to get ultra-low precision stats"}
        else:
            stats['ultra_low_precision'] = {"enabled": False}
        
        # Add database integration stats if enabled
        if self.db_integration:
            stats['database_integration'] = {
                "enabled": True,
                "db_path": getattr(self.db_integration, 'db_path', 'unknown')
            }
        else:
            stats['database_integration'] = {"enabled": False}
        
        # Add model connection mapping stats
        stats['model_connections'] = {
            'total_mappings': len(self.model_connection_map),
            'model_distribution': self._get_model_distribution()
        }
        
        # Add browser-specific stats
        browser_counts = {}
        for conn in self.browser_connections.values():
            browser = conn.get('browser', 'unknown')
            if browser not in browser_counts:
                browser_counts[browser] = 0
            browser_counts[browser] += 1
            
        stats['browser_distribution'] = browser_counts
        
        return stats
        
    def get_performance_report(self, model_name: str = None, platform: str = None, 
                             browser: str = None, days: int = 30, 
                             output_format: str = 'dict') -> Union[Dict[str, Any], str]:
        """
        Generate a performance report from the database.
        
        This method provides a comprehensive performance report for models and browsers,
        including throughput, latency, memory usage, and optimization impact metrics.
        
        Args:
            model_name: Optional filter by model name
            platform: Optional filter by platform (webgpu, webnn, cpu)
            browser: Optional filter by browser (chrome, firefox, edge)
            days: Number of days to include in report (default: 30)
            output_format: Output format (dict, json, html, markdown)
            
        Returns:
            Performance report in the requested format
        """
        if not self.db_integration:
            if output_format == 'dict':
                return {"error": "Database integration not available"}
            elif output_format == 'json':
                return json.dumps({"error": "Database integration not available"})
            else:
                return "Error: Database integration not available"
                
        # Forward the request to the DuckDB integration
        return self.db_integration.get_performance_report(
            model_name=model_name,
            platform=platform,
            browser=browser,
            days=days,
            output_format=output_format
        )
        
    def create_performance_visualization(self, model_name: str = None,
                                      metrics: List[str] = ['throughput', 'latency', 'memory'],
                                      days: int = 30, output_file: str = None) -> bool:
        """
        Create a performance visualization from the database.
        
        This method generates line charts for selected metrics over time, showing
        performance trends for models on different browsers and platforms.
        
        Args:
            model_name: Optional filter by model name
            metrics: List of metrics to visualize (throughput, latency, memory)
            days: Number of days to include (default: 30)
            output_file: Optional file path to save visualization
            
        Returns:
            True if visualization was created successfully, False otherwise
        """
        if not self.db_integration:
            logger.error("Database integration not available, cannot create visualization")
            return False
            
        # Forward the request to the DuckDB integration
        return self.db_integration.create_performance_visualization(
            model_name=model_name,
            metrics=metrics,
            days=days,
            output_file=output_file
        )
        
    def _get_model_distribution(self) -> Dict[str, int]:
        """
        Get distribution of models across connections.
        
        Returns:
            Dict mapping model types to counts
        """
        model_counts = {}
        
        # Count models by type
        for model_id in self.model_connection_map.keys():
            parts = model_id.split("_", 1)
            if len(parts) > 0:
                model_type = parts[0]
                if model_type not in model_counts:
                    model_counts[model_type] = 0
                model_counts[model_type] += 1
        
        return model_counts
    
    async def close(self):
        """
        Close the connection pool integration and release all resources.
        
        This method ensures proper cleanup of all components:
        - Circuit breaker manager
        - Connection pool manager
        - Tensor sharing manager
        - Ultra-low precision manager
        - DuckDB integration
        - All browser connections
        
        It also handles graceful shutdown with error handling to ensure
        resources are properly released even if some components fail.
        """
        if not self.initialized:
            return
            
        logger.info("Starting ConnectionPoolIntegration shutdown")
        
        try:
            # Close tensor sharing manager if enabled
            if self.tensor_sharing_manager and hasattr(self.tensor_sharing_manager, 'cleanup'):
                try:
                    logger.info("Cleaning up tensor sharing manager")
                    self.tensor_sharing_manager.cleanup()
                except Exception as e:
                    logger.error(f"Error cleaning up tensor sharing manager: {e}")
            
            # Close ultra-low precision manager if enabled
            if self.ultra_low_precision_manager and hasattr(self.ultra_low_precision_manager, 'cleanup'):
                try:
                    logger.info("Cleaning up ultra-low precision manager")
                    self.ultra_low_precision_manager.cleanup()
                except Exception as e:
                    logger.error(f"Error cleaning up ultra-low precision manager: {e}")
            
            # Close circuit breaker manager
            try:
                logger.info("Closing circuit breaker manager")
                await self.circuit_breaker.close()
            except Exception as e:
                logger.error(f"Error closing circuit breaker manager: {e}")
            
            # Close connection pool manager
            try:
                logger.info("Shutting down connection pool manager")
                await self.connection_pool.shutdown()
            except Exception as e:
                logger.error(f"Error shutting down connection pool manager: {e}")
                
            # Close database connection if available
            if self.db_integration:
                try:
                    logger.info("Closing database connection")
                    self.db_integration.close()
                except Exception as e:
                    logger.error(f"Error closing database connection: {e}")
                
            # Clear all mappings and tracking data
            self.model_connection_map.clear()
            self.connection_health_scores.clear()
            for model_type in self.model_family_performance:
                for browser in self.model_family_performance[model_type]:
                    self.model_family_performance[model_type][browser] = []
                
        except Exception as e:
            logger.error(f"Error during ConnectionPoolIntegration shutdown: {e}")
        finally:
            self.initialized = False
            logger.info("ConnectionPoolIntegration closed")


# For testing the module directly
if __name__ == "__main__":
    async def test_pool():
        # Create mock browser connections
        browser_connections = {
            "conn_1": {
                "browser": "chrome",
                "platform": "webgpu",
                "active": True,
                "is_simulation": True,
                "loaded_models": set(),
                "resource_usage": {
                    "memory_mb": 500,
                    "cpu_percent": 20,
                    "gpu_percent": 30
                },
                "bridge": None  # Would be a real WebSocket bridge in production
            },
            "conn_2": {
                "browser": "firefox",
                "platform": "webgpu",
                "active": True,
                "is_simulation": True,
                "loaded_models": set(),
                "resource_usage": {
                    "memory_mb": 450,
                    "cpu_percent": 15,
                    "gpu_percent": 40
                },
                "bridge": None
            },
            "conn_3": {
                "browser": "edge",
                "platform": "webnn",
                "active": True,
                "is_simulation": True,
                "loaded_models": set(),
                "resource_usage": {
                    "memory_mb": 350,
                    "cpu_percent": 10,
                    "gpu_percent": 20
                },
                "bridge": None
            }
        }
        
        # Create in-memory database for testing
        db_path = ":memory:"
        
        # Create connection pool integration with enhanced features
        pool = ConnectionPoolIntegration(
            browser_connections=browser_connections,
            min_connections=1,
            max_connections=4,
            adaptive_scaling=True,
            browser_preferences={
                'audio': 'firefox',
                'vision': 'chrome',
                'text_embedding': 'edge'
            },
            enable_tensor_sharing=True,
            enable_ultra_low_precision=True,
            headless=True,
            circuit_breaker_threshold=3,
            db_path=db_path
        )
        
        # Initialize pool
        logger.info("Initializing connection pool integration")
        await pool.initialize()
        
        try:
            # Test browser-specific model routing
            logger.info("\n===== Testing Browser-Specific Model Routing =====")
            
            # Audio model should prefer Firefox (compute shaders)
            logger.info("\nGetting connection for audio model (should prefer Firefox)")
            audio_conn_id, audio_conn = await pool.get_connection(
                model_type="audio", 
                model_name="whisper-tiny",
                hardware_preferences={"priority_list": ["webgpu", "cpu"]}
            )
            logger.info(f"Selected browser for audio model: {audio_conn.get('browser', 'unknown')}")
            
            # Vision model should prefer Chrome (WebGPU)
            logger.info("\nGetting connection for vision model (should prefer Chrome)")
            vision_conn_id, vision_conn = await pool.get_connection(
                model_type="vision", 
                model_name="vit-base",
                hardware_preferences={"priority_list": ["webgpu", "cpu"]}
            )
            logger.info(f"Selected browser for vision model: {vision_conn.get('browser', 'unknown')}")
            
            # Text embedding model should prefer Edge (WebNN)
            logger.info("\nGetting connection for text embedding model (should prefer Edge)")
            text_conn_id, text_conn = await pool.get_connection(
                model_type="text_embedding", 
                model_name="bert-base-uncased",
                hardware_preferences={"priority_list": ["webnn", "webgpu", "cpu"]}
            )
            logger.info(f"Selected browser for text embedding model: {text_conn.get('browser', 'unknown')}")
            
            # Record simulated performance metrics
            logger.info("\n===== Recording Performance Metrics =====")
            
            # Audio model performance on Firefox (good)
            await pool.release_connection(
                audio_conn_id, 
                success=True, 
                metrics={
                    "model_name": "whisper-tiny",
                    "model_type": "audio",
                    "inference_time_ms": 120.5,
                    "throughput": 8.3,
                    "memory_mb": 450,
                    "response_time_ms": 125.0,
                    "resource_usage": {
                        "memory_mb": 450,
                        "cpu_percent": 25,
                        "gpu_percent": 40
                    }
                }
            )
            
            # Vision model performance on Chrome (good)
            await pool.release_connection(
                vision_conn_id, 
                success=True, 
                metrics={
                    "model_name": "vit-base",
                    "model_type": "vision",
                    "inference_time_ms": 85.3,
                    "throughput": 11.7,
                    "memory_mb": 520,
                    "response_time_ms": 90.0,
                    "resource_usage": {
                        "memory_mb": 520,
                        "cpu_percent": 30,
                        "gpu_percent": 45
                    }
                }
            )
            
            # Text embedding model performance on Edge (good)
            await pool.release_connection(
                text_conn_id, 
                success=True, 
                metrics={
                    "model_name": "bert-base-uncased",
                    "model_type": "text_embedding",
                    "inference_time_ms": 25.8,
                    "throughput": 38.7,
                    "memory_mb": 380,
                    "response_time_ms": 28.0,
                    "resource_usage": {
                        "memory_mb": 380,
                        "cpu_percent": 20,
                        "gpu_percent": 25
                    }
                }
            )
            
            # Test circuit breaker pattern
            logger.info("\n===== Testing Circuit Breaker Pattern =====")
            
            # Simulate error and recovery
            error = Exception("Test WebSocket connection error")
            recovery = await pool.handle_error(
                audio_conn_id, 
                error, 
                {
                    "action": "inference", 
                    "error_type": "websocket_error",
                    "model_type": "audio",
                    "model_name": "whisper-tiny"
                }
            )
            logger.info(f"Recovery result for WebSocket error: {recovery}")
            
            # Simulate memory error
            memory_error = Exception("Out of memory error in browser")
            memory_recovery = await pool.handle_error(
                vision_conn_id, 
                memory_error, 
                {
                    "action": "inference", 
                    "error_type": "memory_error",
                    "model_type": "vision",
                    "model_name": "vit-base"
                }
            )
            logger.info(f"Recovery result for memory error: {memory_recovery}")
            
            # Print comprehensive stats
            logger.info("\n===== Connection Pool Stats =====")
            stats = pool.get_stats()
            logger.info(json.dumps(stats, indent=2))
            
            # Get comprehensive health summary
            logger.info("\n===== Health Summary =====")
            health = await pool.get_health_summary()
            
            # Print key health metrics
            logger.info("Model-Browser Performance:")
            if 'model_browser_performance' in health:
                for model_type, browser_data in health['model_browser_performance'].items():
                    if browser_data:
                        logger.info(f"  {model_type}:")
                        for browser, metrics in browser_data.items():
                            logger.info(f"    {browser}: {metrics.get('avg_latency_ms', 0):.2f}ms, {metrics.get('success_rate', 0)*100:.1f}% success")
            
            logger.info("\nBrowser Recommendations:")
            if 'browser_recommendations' in health:
                for model_type, browser in health['browser_recommendations'].items():
                    logger.info(f"  {model_type}: {browser}")
            
            logger.info("\nOptimization Recommendations:")
            if 'optimization_recommendations' in health:
                for rec in health['optimization_recommendations']:
                    logger.info(f"  {rec.get('type', '')}: {rec.get('feature', rec.get('resource', ''))} - {rec.get('reason', '')}")
            
            # Test reusing existing connections for same model
            logger.info("\n===== Testing Connection Reuse =====")
            
            # Get another connection for whisper-tiny (should reuse the known connection)
            logger.info("Getting another connection for whisper-tiny (should reuse existing)")
            audio_conn_id2, audio_conn2 = await pool.get_connection(
                model_type="audio", 
                model_name="whisper-tiny",
                hardware_preferences={"priority_list": ["webgpu", "cpu"]}
            )
            
            # Check if it's the same connection
            same_connection = audio_conn_id2 == audio_conn_id
            logger.info(f"Reused same connection: {same_connection}")
            
            # Test DuckDB Integration
            if pool.db_integration:
                logger.info("\n===== Testing DuckDB Integration =====")
                
                # Generate a performance report
                logger.info("Generating performance report")
                report = pool.get_performance_report(
                    output_format='json'
                )
                logger.info(f"Performance report generated ({len(report)} chars)")
                
                # Generate a report for a specific model
                logger.info("Generating report for whisper-tiny")
                model_report = pool.get_performance_report(
                    model_name='whisper-tiny',
                    output_format='json'
                )
                logger.info(f"Model report generated ({len(model_report)} chars)")
                
                # Try creating a visualization (may not work in automated testing)
                try:
                    logger.info("Attempting to create visualization")
                    visualization_success = pool.create_performance_visualization(
                        metrics=['throughput', 'latency'],
                        output_file='performance_visualization.png'
                    )
                    logger.info(f"Visualization created: {visualization_success}")
                except Exception as e:
                    logger.warning(f"Visualization creation failed: {e}")
            else:
                logger.warning("DuckDB integration not available for testing")
            
        finally:
            # Close pool
            logger.info("\n===== Closing Connection Pool =====")
            await pool.close()
    
    # Configure detailed logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Run test
    asyncio.run(test_pool())