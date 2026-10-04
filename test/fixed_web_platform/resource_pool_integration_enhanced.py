#!/usr/bin/env python3
"""
Enhanced Resource Pool Integration for WebNN/WebGPU (May 2025)

This module provides an enhanced integration between IPFS acceleration and
the WebNN/WebGPU resource pool, with improved connection pooling, adaptive
scaling, and efficient cross-browser resource management.

Key features:
- Advanced connection pooling with adaptive scaling
- Efficient browser resource utilization for heterogeneous models
- Intelligent model routing based on browser capabilities
- Comprehensive health monitoring and recovery
- Performance telemetry and metrics collection
- Browser-specific optimizations for different model types
- DuckDB integration for result storage and analysis
"""

import os
import sys
import time
import json
import asyncio
import logging
import threading
import traceback
from typing import Dict, List, Any, Optional, Union, Tuple

# Import resource pool
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from resource_pool import get_global_resource_pool

# Import adaptive scaling and connection pool manager
try:
    from fixed_web_platform.adaptive_scaling import AdaptiveConnectionManager
    ADAPTIVE_SCALING_AVAILABLE = True
except ImportError:
    ADAPTIVE_SCALING_AVAILABLE = False
    logger.warning("AdaptiveConnectionManager not available, using simplified scaling")

try:
    from fixed_web_platform.connection_pool_manager import ConnectionPoolManager
    CONNECTION_POOL_AVAILABLE = True
except ImportError:
    CONNECTION_POOL_AVAILABLE = False
    logger.warning("ConnectionPoolManager not available, using basic connection management")

# Import ResourcePoolBridgeIntegration (local import to avoid circular imports)
from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration, EnhancedWebModel

# Import error recovery utilities
from fixed_web_platform.resource_pool_error_recovery import ResourcePoolErrorRecovery

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class EnhancedResourcePoolIntegration:
    """
    Enhanced integration between IPFS acceleration and WebNN/WebGPU resource pool.
    
    This class provides a unified interface for accessing WebNN and WebGPU
    acceleration through an enhanced resource pool with advanced features:
    - Adaptive connection scaling based on workload
    - Intelligent browser selection for model types
    - Cross-browser model sharding capabilities
    - Comprehensive health monitoring and recovery
    - Performance telemetry and optimization
    - DuckDB integration for metrics storage and analysis
    
    May 2025 Implementation: This version focuses on connection pooling enhancements,
    adaptive scaling, and improved error recovery mechanisms.
    """
    
    def __init__(self, 
                 max_connections: int = 4,
                 min_connections: int = 1,
                 enable_gpu: bool = True, 
                 enable_cpu: bool = True,
                 headless: bool = True,
                 browser_preferences: Dict[str, str] = None,
                 adaptive_scaling: bool = True,
                 db_path: str = None,
                 use_connection_pool: bool = True,
                 enable_telemetry: bool = True,
                 enable_cross_browser_sharding: bool = False,
                 enable_health_monitoring: bool = True):
        """
        Initialize enhanced resource pool integration.
        
        Args:
            max_connections: Maximum number of browser connections
            min_connections: Minimum number of browser connections to maintain
            enable_gpu: Whether to enable GPU acceleration
            enable_cpu: Whether to enable CPU acceleration
            headless: Whether to run browsers in headless mode
            browser_preferences: Dict mapping model families to preferred browsers
            adaptive_scaling: Whether to enable adaptive connection scaling
            db_path: Path to DuckDB database for metrics storage
            use_connection_pool: Whether to use enhanced connection pooling
            enable_telemetry: Whether to collect performance telemetry
            enable_cross_browser_sharding: Whether to enable model sharding across browsers
            enable_health_monitoring: Whether to enable periodic health monitoring
        """
        self.resource_pool = get_global_resource_pool()
        self.max_connections = max_connections
        self.min_connections = min_connections
        self.enable_gpu = enable_gpu
        self.enable_cpu = enable_cpu
        self.headless = headless
        self.db_path = db_path
        self.enable_telemetry = enable_telemetry
        self.enable_cross_browser_sharding = enable_cross_browser_sharding
        self.enable_health_monitoring = enable_health_monitoring
        
        # Default browser preferences based on model type performance characteristics
        self.browser_preferences = browser_preferences or {
            'audio': 'firefox',          # Firefox has superior compute shader performance for audio
            'vision': 'chrome',          # Chrome has good WebGPU support for vision models
            'text_embedding': 'edge',    # Edge has excellent WebNN support for text embeddings
            'text_generation': 'chrome', # Chrome works well for text generation
            'multimodal': 'chrome'       # Chrome is good for multimodal models
        }
        
        # Setup adaptive scaling system
        self.adaptive_scaling = adaptive_scaling and ADAPTIVE_SCALING_AVAILABLE
        self.adaptive_manager = None
        if self.adaptive_scaling:
            self.adaptive_manager = AdaptiveConnectionManager(
                min_connections=min_connections,
                max_connections=max_connections,
                browser_preferences=self.browser_preferences,
                enable_predictive=True
            )
        
        # Setup connection pool with enhanced management
        self.use_connection_pool = use_connection_pool and CONNECTION_POOL_AVAILABLE
        self.connection_pool = None
        if self.use_connection_pool and CONNECTION_POOL_AVAILABLE:
            self.connection_pool = ConnectionPoolManager(
                min_connections=min_connections,
                max_connections=max_connections,
                enable_browser_preferences=True,
                browser_preferences=self.browser_preferences
            )
        
        # Create the base integration
        self.base_integration = None
        
        # Initialize metrics collection system
        self.metrics = {
            "models": {},
            "connections": {
                "total": 0,
                "active": 0,
                "idle": 0,
                "utilization": 0.0,
                "browser_distribution": {},
                "platform_distribution": {},
                "health_status": {
                    "healthy": 0,
                    "degraded": 0,
                    "unhealthy": 0
                }
            },
            "performance": {
                "load_times": {},
                "inference_times": {},
                "memory_usage": {},
                "throughput": {}
            },
            "error_metrics": {
                "error_count": 0,
                "error_types": {},
                "recovery_attempts": 0,
                "recovery_success": 0
            },
            "adaptive_scaling": {
                "scaling_events": [],
                "utilization_history": [],
                "target_connections": min_connections
            },
            "cross_browser_sharding": {
                "active_sharding_count": 0,
                "browser_distribution": {},
                "model_types": {}
            },
            "telemetry": {
                "startup_time": 0,
                "last_update": time.time(),
                "uptime": 0,
                "api_calls": 0
            }
        }
        
        # Database connection for metrics storage
        self.db_connection = None
        if self.db_path:
            self._initialize_database_connection()
        
        # Model cache for faster access
        self.model_cache = {}
        
        # Locks for thread safety
        self._lock = threading.RLock()
        
        # Setup health monitoring if enabled
        self.health_monitor_task = None
        self.health_monitor_running = False
        
        logger.info(f"EnhancedResourcePoolIntegration initialized with max_connections={max_connections}, "
                   f"adaptive_scaling={'enabled' if self.adaptive_scaling else 'disabled'}, "
                   f"connection_pool={'enabled' if self.use_connection_pool else 'disabled'}")
    
    def _initialize_database_connection(self):
        """Initialize database connection for metrics storage"""
        if not self.db_path:
            return False
            
        try:
            import duckdb
            
            # Connect to database
            self.db_connection = duckdb.connect(self.db_path)
            
            # Create tables for metrics storage
            self._create_database_tables()
            
            logger.info(f"Database connection initialized: {self.db_path}")
            return True
            
        except ImportError:
            logger.warning("DuckDB not available, database features disabled")
            return False
            
        except Exception as e:
            logger.error(f"Error initializing database connection: {e}")
            return False
    
    def _create_database_tables(self):
        """Create database tables for metrics storage"""
        if not self.db_connection:
            return False
        
        try:
            # Create model metrics table
            self.db_connection.execute("""
            CREATE TABLE IF NOT EXISTS enhanced_model_metrics (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                model_name VARCHAR,
                model_type VARCHAR,
                model_size VARCHAR,
                platform VARCHAR,
                browser VARCHAR,
                batch_size INTEGER,
                load_time_ms FLOAT,
                inference_time_ms FLOAT,
                throughput_items_per_sec FLOAT,
                memory_usage_mb FLOAT,
                is_real_implementation BOOLEAN,
                is_quantized BOOLEAN,
                quantization_bits INTEGER,
                compute_shaders_enabled BOOLEAN,
                shader_precompilation_enabled BOOLEAN,
                parallel_loading_enabled BOOLEAN,
                connection_id VARCHAR,
                additional_data JSON
            )
            """)
            
            # Create connection metrics table
            self.db_connection.execute("""
            CREATE TABLE IF NOT EXISTS enhanced_connection_metrics (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                connection_id VARCHAR,
                browser VARCHAR,
                platform VARCHAR,
                is_headless BOOLEAN,
                status VARCHAR,
                health_status VARCHAR,
                creation_time TIMESTAMP,
                uptime_seconds FLOAT,
                loaded_models_count INTEGER,
                memory_usage_mb FLOAT,
                inference_count INTEGER,
                error_count INTEGER,
                recovery_count INTEGER,
                browser_info JSON,
                adapter_info JSON
            )
            """)
            
            # Create scaling events table
            self.db_connection.execute("""
            CREATE TABLE IF NOT EXISTS enhanced_scaling_events (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                event_type VARCHAR,
                previous_connections INTEGER,
                new_connections INTEGER,
                utilization_rate FLOAT,
                utilization_threshold FLOAT,
                memory_pressure_percent FLOAT,
                trigger_reason VARCHAR,
                browser_distribution JSON
            )
            """)
            
            return True
            
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            return False
    
    async def initialize(self):
        """
        Initialize the enhanced resource pool integration.
        
        Returns:
            bool: True if initialization was successful, False otherwise
        """
        try:
            # Record start time for metrics
            start_time = time.time()
            
            # Create base integration with enhanced features
            self.base_integration = ResourcePoolBridgeIntegration(
                max_connections=self.max_connections,
                enable_gpu=self.enable_gpu,
                enable_cpu=self.enable_cpu,
                headless=self.headless,
                browser_preferences=self.browser_preferences,
                db_path=self.db_path,
                enable_telemetry=self.enable_telemetry
            )
            
            # Initialize base integration
            initialization_success = await self.base_integration.initialize()
            if not initialization_success:
                logger.error("Failed to initialize base ResourcePoolBridgeIntegration")
                return False
            
            # Initialize adaptive scaling if enabled
            if self.adaptive_scaling and self.adaptive_manager:
                # Initialize with current connection count
                connection_count = len(self.base_integration.connections) if hasattr(self.base_integration, 'connections') else 0
                self.adaptive_manager.current_connections = connection_count
                self.adaptive_manager.target_connections = max(self.min_connections, connection_count)
                
                # Log initialization
                logger.info(f"Adaptive scaling initialized with {connection_count} connections, " +
                           f"target: {self.adaptive_manager.target_connections}")
                
                # Record in metrics
                self.metrics["adaptive_scaling"]["target_connections"] = self.adaptive_manager.target_connections
            
            # Initialize connection pool if enabled
            if self.use_connection_pool and self.connection_pool:
                # Register existing connections with pool
                if hasattr(self.base_integration, 'connections'):
                    for conn_id, connection in self.base_integration.connections.items():
                        self.connection_pool.register_connection(connection)
                
                # Log initialization
                connection_count = self.connection_pool.get_connection_count() if hasattr(self.connection_pool, 'get_connection_count') else 0
                logger.info(f"Connection pool initialized with {connection_count} connections")
                
                # Record in metrics
                self.metrics["connections"]["total"] = connection_count
            
            # Start health monitoring if enabled
            if self.enable_health_monitoring:
                self._start_health_monitoring()
            
            # Record metrics
            self.metrics["telemetry"]["startup_time"] = time.time() - start_time
            self.metrics["telemetry"]["last_update"] = time.time()
            
            logger.info(f"EnhancedResourcePoolIntegration initialized successfully in {time.time() - start_time:.2f}s")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing EnhancedResourcePoolIntegration: {e}")
            traceback.print_exc()
            return False
    
    def _start_health_monitoring(self):
        """Start periodic health monitoring"""
        if self.health_monitor_running:
            return
        
        self.health_monitor_running = True
        
        # Create health monitoring task
        async def health_monitor_loop():
            logger.info("Health monitoring started")
            while self.health_monitor_running:
                try:
                    # Check connection health
                    await self._check_connections_health()
                    
                    # Update metrics
                    self._update_metrics()
                    
                    # Update adaptive scaling if enabled
                    if self.adaptive_scaling and self.adaptive_manager:
                        await self._update_adaptive_scaling()
                    
                    # Store metrics in database if enabled
                    if self.db_connection:
                        self._store_metrics()
                    
                except Exception as e:
                    logger.error(f"Error in health monitoring: {e}")
                
                # Wait before next check
                await asyncio.sleep(30)  # Check every 30 seconds
        
        # Start health monitoring task
        loop = asyncio.get_event_loop()
        self.health_monitor_task = asyncio.create_task(health_monitor_loop())
        logger.info("Health monitoring task created")
    
    async def _check_connections_health(self):
        """Check health of all connections and recover if needed"""
        if not hasattr(self.base_integration, 'connections'):
            return
        
        # Update metrics counters
        healthy_count = 0
        degraded_count = 0
        unhealthy_count = 0
        
        # Track browsers and platforms
        browser_distribution = {}
        platform_distribution = {}
        
        # Check each connection
        for conn_id, connection in self.base_integration.connections.items():
            try:
                # Skip if connection doesn't have health_status attribute
                if not hasattr(connection, 'health_status'):
                    continue
                
                # Update health status distribution
                if connection.health_status == "healthy":
                    healthy_count += 1
                elif connection.health_status == "degraded":
                    degraded_count += 1
                elif connection.health_status == "unhealthy":
                    unhealthy_count += 1
                    
                    # Attempt recovery for unhealthy connections
                    logger.info(f"Attempting to recover unhealthy connection {conn_id}")
                    success, method = await ResourcePoolErrorRecovery.recover_connection(connection)
                    
                    # Update metrics
                    self.metrics["error_metrics"]["recovery_attempts"] += 1
                    if success:
                        self.metrics["error_metrics"]["recovery_success"] += 1
                        logger.info(f"Successfully recovered connection {conn_id} using {method}")
                    else:
                        logger.warning(f"Failed to recover connection {conn_id}")
                
                # Update browser and platform distribution
                browser = getattr(connection, 'browser_name', 'unknown')
                browser_distribution[browser] = browser_distribution.get(browser, 0) + 1
                
                platform = getattr(connection, 'platform', 'unknown')
                platform_distribution[platform] = platform_distribution.get(platform, 0) + 1
                
            except Exception as e:
                logger.error(f"Error checking health for connection {conn_id}: {e}")
        
        # Update metrics
        self.metrics["connections"]["health_status"]["healthy"] = healthy_count
        self.metrics["connections"]["health_status"]["degraded"] = degraded_count
        self.metrics["connections"]["health_status"]["unhealthy"] = unhealthy_count
        self.metrics["connections"]["browser_distribution"] = browser_distribution
        self.metrics["connections"]["platform_distribution"] = platform_distribution
        
        # Log health status
        logger.debug(f"Connection health: {healthy_count} healthy, {degraded_count} degraded, {unhealthy_count} unhealthy")
    
    async def _update_adaptive_scaling(self):
        """Update adaptive scaling based on current utilization"""
        if not self.adaptive_scaling or not self.adaptive_manager:
            return
            
        try:
            # Get current utilization
            utilization = 0.0
            active_connections = 0
            total_connections = 0
            
            if hasattr(self.base_integration, 'connections'):
                total_connections = len(self.base_integration.connections)
                active_connections = sum(1 for conn in self.base_integration.connections.values() if getattr(conn, 'busy', False))
                
                utilization = active_connections / total_connections if total_connections > 0 else 0.0
            
            # Update adaptive manager
            previous_target = self.adaptive_manager.target_connections
            scaling_event = self.adaptive_manager.update_target_connections(
                current_utilization=utilization,
                active_connections=active_connections,
                total_connections=total_connections
            )
            
            # If target changed, trigger scaling
            if self.adaptive_manager.target_connections != previous_target:
                logger.info(f"Adaptive scaling: Changing target connections from {previous_target} to {self.adaptive_manager.target_connections} " +
                           f"(utilization: {utilization:.2f}, active: {active_connections}, total: {total_connections})")
                
                # Record scaling event
                event = {
                    "timestamp": time.time(),
                    "event_type": "scale_up" if self.adaptive_manager.target_connections > previous_target else "scale_down",
                    "previous_connections": previous_target,
                    "new_connections": self.adaptive_manager.target_connections,
                    "utilization_rate": utilization,
                    "trigger_reason": scaling_event.get("reason", "unknown")
                }
                
                self.metrics["adaptive_scaling"]["scaling_events"].append(event)
                self.metrics["adaptive_scaling"]["target_connections"] = self.adaptive_manager.target_connections
                
                # Apply scaling
                await self._apply_scaling(self.adaptive_manager.target_connections)
                
                # Store scaling event in database
                if self.db_connection:
                    try:
                        self.db_connection.execute("""
                        INSERT INTO enhanced_scaling_events (
                            timestamp, event_type, previous_connections, new_connections, 
                            utilization_rate, trigger_reason, browser_distribution
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, [
                            datetime.datetime.fromtimestamp(event["timestamp"]),
                            event["event_type"],
                            event["previous_connections"],
                            event["new_connections"],
                            event["utilization_rate"],
                            event["trigger_reason"],
                            json.dumps(self.metrics["connections"]["browser_distribution"])
                        ])
                    except Exception as db_error:
                        logger.error(f"Error storing scaling event in database: {db_error}")
            
            # Update utilization history
            self.metrics["adaptive_scaling"]["utilization_history"].append({
                "timestamp": time.time(),
                "utilization": utilization,
                "active_connections": active_connections,
                "total_connections": total_connections
            })
            
            # Keep only the last 100 entries
            if len(self.metrics["adaptive_scaling"]["utilization_history"]) > 100:
                self.metrics["adaptive_scaling"]["utilization_history"] = self.metrics["adaptive_scaling"]["utilization_history"][-100:]
            
        except Exception as e:
            logger.error(f"Error updating adaptive scaling: {e}")
    
    async def _apply_scaling(self, target_connections):
        """Apply scaling to reach the target number of connections"""
        if not hasattr(self.base_integration, 'connections'):
            logger.warning("Cannot apply scaling: base integration doesn't have connections attribute")
            return
            
        current_connections = len(self.base_integration.connections)
        
        # If we need to scale up
        if target_connections > current_connections:
            # Create new connections
            for i in range(current_connections, target_connections):
                try:
                    # Create new connection
                    logger.info(f"Creating new connection to reach target of {target_connections}")
                    
                    # Call base integration method to create new connection
                    if hasattr(self.base_integration, 'create_connection'):
                        connection = await self.base_integration.create_connection()
                        
                        # Register with connection pool
                        if self.use_connection_pool and self.connection_pool and connection:
                            self.connection_pool.register_connection(connection)
                            
                except Exception as e:
                    logger.error(f"Error creating connection during scaling: {e}")
                    break
        
        # If we need to scale down
        elif target_connections < current_connections:
            # Find idle connections to remove
            connections_to_remove = []
            
            for conn_id, connection in self.base_integration.connections.items():
                # Skip busy connections
                if getattr(connection, 'busy', False):
                    continue
                    
                # Skip connections with loaded models
                if hasattr(connection, 'loaded_models') and connection.loaded_models:
                    continue
                    
                # Add to removal list
                connections_to_remove.append(conn_id)
                
                # Stop when we have enough connections to remove
                if current_connections - len(connections_to_remove) <= target_connections:
                    break
            
            # Remove connections
            for conn_id in connections_to_remove:
                try:
                    logger.info(f"Removing connection {conn_id} to reach target of {target_connections}")
                    
                    # Call base integration method to remove connection
                    if hasattr(self.base_integration, 'remove_connection'):
                        await self.base_integration.remove_connection(conn_id)
                        
                        # Unregister from connection pool
                        if self.use_connection_pool and self.connection_pool:
                            self.connection_pool.unregister_connection(conn_id)
                            
                except Exception as e:
                    logger.error(f"Error removing connection {conn_id} during scaling: {e}")
        
        # Log final connection count
        current_connections = len(self.base_integration.connections) if hasattr(self.base_integration, 'connections') else 0
        logger.info(f"Scaling complete: {current_connections} connections (target: {target_connections})")
    
    def _update_metrics(self):
        """Update internal metrics"""
        try:
            # Update connection metrics
            if hasattr(self.base_integration, 'connections'):
                total_connections = len(self.base_integration.connections)
                active_connections = sum(1 for conn in self.base_integration.connections.values() if getattr(conn, 'busy', False))
                idle_connections = total_connections - active_connections
                
                self.metrics["connections"]["total"] = total_connections
                self.metrics["connections"]["active"] = active_connections
                self.metrics["connections"]["idle"] = idle_connections
                self.metrics["connections"]["utilization"] = active_connections / total_connections if total_connections > 0 else 0.0
            
            # Update telemetry
            current_time = time.time()
            self.metrics["telemetry"]["uptime"] = current_time - self.metrics["telemetry"]["startup_time"]
            self.metrics["telemetry"]["last_update"] = current_time
            
        except Exception as e:
            logger.error(f"Error updating metrics: {e}")
    
    def _store_metrics(self):
        """Store metrics in database"""
        if not self.db_connection:
            return
            
        try:
            # Store connection metrics
            if hasattr(self.base_integration, 'connections'):
                for conn_id, connection in self.base_integration.connections.items():
                    # Skip if connection doesn't have required attributes
                    if not hasattr(connection, 'health_status') or not hasattr(connection, 'creation_time'):
                        continue
                        
                    # Prepare connection metrics
                    browser = getattr(connection, 'browser_name', 'unknown')
                    platform = getattr(connection, 'platform', 'unknown')
                    status = getattr(connection, 'status', 'unknown')
                    health_status = getattr(connection, 'health_status', 'unknown')
                    creation_time = getattr(connection, 'creation_time', 0)
                    uptime = time.time() - creation_time
                    loaded_models_count = len(getattr(connection, 'loaded_models', set()))
                    memory_usage = getattr(connection, 'memory_usage_mb', 0)
                    error_count = getattr(connection, 'error_count', 0)
                    recovery_count = getattr(connection, 'recovery_attempts', 0)
                    browser_info = json.dumps(getattr(connection, 'browser_info', {}))
                    adapter_info = json.dumps(getattr(connection, 'adapter_info', {}))
                    
                    # Store in database
                    self.db_connection.execute("""
                    INSERT INTO enhanced_connection_metrics (
                        timestamp, connection_id, browser, platform, is_headless, 
                        status, health_status, creation_time, uptime_seconds, 
                        loaded_models_count, memory_usage_mb, error_count, 
                        recovery_count, browser_info, adapter_info
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, [
                        datetime.datetime.now(),
                        conn_id,
                        browser,
                        platform,
                        self.headless,
                        status,
                        health_status,
                        datetime.datetime.fromtimestamp(creation_time),
                        uptime,
                        loaded_models_count,
                        memory_usage,
                        error_count,
                        recovery_count,
                        browser_info,
                        adapter_info
                    ])
                    
        except Exception as e:
            logger.error(f"Error storing metrics in database: {e}")
    
    async def get_model(self, model_name, model_type='text_embedding', platform='webgpu', browser=None, 
                       batch_size=1, quantization=None, optimizations=None):
        """
        Get a model with optimal browser and platform selection.
        
        This method intelligently selects the optimal browser and hardware platform
        for the given model type, applying model-specific optimizations.
        
        Args:
            model_name: Name of the model to load
            model_type: Type of the model (text_embedding, vision, audio, etc.)
            platform: Preferred platform (webgpu, webnn, cpu)
            browser: Preferred browser (chrome, firefox, edge, safari)
            batch_size: Batch size for inference
            quantization: Quantization settings (dict with 'bits' and 'mixed_precision')
            optimizations: Optimization settings (dict with feature flags)
            
        Returns:
            EnhancedWebModel: Model instance for inference
        """
        # Track API calls
        self.metrics["telemetry"]["api_calls"] += 1
        
        # Update metrics for model type
        if model_type not in self.metrics["models"]:
            self.metrics["models"][model_type] = {
                "count": 0,
                "load_times": [],
                "inference_times": []
            }
        
        self.metrics["models"][model_type]["count"] += 1
        
        # Use browser preferences if browser not specified
        if not browser and model_type in self.browser_preferences:
            browser = self.browser_preferences[model_type]
            logger.info(f"Using preferred browser {browser} for model type {model_type}")
        
        # Check if model is already in cache
        model_key = f"{model_name}:{model_type}:{platform}:{browser}:{batch_size}"
        if model_key in self.model_cache:
            logger.info(f"Using cached model {model_key}")
            return self.model_cache[model_key]
        
        try:
            # Apply model-specific optimizations if not provided
            if optimizations is None:
                optimizations = {}
                
                # Audio models benefit from compute shader optimization in Firefox
                if model_type == 'audio' and (browser == 'firefox' or not browser):
                    optimizations['compute_shaders'] = True
                    logger.info(f"Enabling compute shader optimization for audio model {model_name}")
                
                # Vision models benefit from shader precompilation
                if model_type == 'vision':
                    optimizations['precompile_shaders'] = True
                    logger.info(f"Enabling shader precompilation for vision model {model_name}")
                
                # Multimodal models benefit from parallel loading
                if model_type == 'multimodal':
                    optimizations['parallel_loading'] = True
                    logger.info(f"Enabling parallel loading for multimodal model {model_name}")
            
            # Track start time for load time metric
            start_time = time.time()
            
            # Get model from base integration
            model_config = {
                'model_name': model_name,
                'model_type': model_type,
                'platform': platform,
                'browser': browser,
                'batch_size': batch_size,
                'quantization': quantization,
                'optimizations': optimizations
            }
            
            model = await self.base_integration.get_model(**model_config)
            
            # Calculate load time
            load_time = time.time() - start_time
            
            # Update metrics
            self.metrics["models"][model_type]["load_times"].append(load_time)
            self.metrics["performance"]["load_times"][model_name] = load_time
            
            # Keep only last 10 load times to avoid memory growth
            if len(self.metrics["models"][model_type]["load_times"]) > 10:
                self.metrics["models"][model_type]["load_times"] = self.metrics["models"][model_type]["load_times"][-10:]
            
            # Cache model for reuse
            if model:
                self.model_cache[model_key] = model
                
                # Log success
                logger.info(f"Model {model_name} ({model_type}) loaded successfully in {load_time:.2f}s "
                          f"on {platform} with {browser if browser else 'default'} browser")
                
                # Enhanced model wrapper to track metrics
                enhanced_model = EnhancedModelWrapper(
                    model=model,
                    model_name=model_name,
                    model_type=model_type,
                    platform=platform,
                    browser=browser,
                    batch_size=batch_size,
                    metrics=self.metrics,
                    db_connection=self.db_connection
                )
                
                return enhanced_model
            else:
                logger.error(f"Failed to load model {model_name}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting model {model_name}: {e}")
            traceback.print_exc()
            
            # Update error metrics
            self.metrics["error_metrics"]["error_count"] += 1
            error_type = type(e).__name__
            self.metrics["error_metrics"]["error_types"][error_type] = self.metrics["error_metrics"]["error_types"].get(error_type, 0) + 1
            
            return None
    
    async def execute_concurrent(self, model_and_inputs_list):
        """
        Execute multiple models concurrently for efficient inference.
        
        Args:
            model_and_inputs_list: List of (model, inputs) tuples
            
        Returns:
            List of inference results in the same order
        """
        if not model_and_inputs_list:
            return []
        
        # Create tasks for concurrent execution
        tasks = []
        for model, inputs in model_and_inputs_list:
            if not model:
                tasks.append(asyncio.create_task(asyncio.sleep(0)))  # Dummy task for None models
            else:
                tasks.append(asyncio.create_task(model(inputs)))
        
        # Wait for all tasks to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results (convert exceptions to error results)
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Create error result
                model, _ = model_and_inputs_list[i]
                model_name = getattr(model, 'model_name', 'unknown')
                error_result = {
                    'success': False,
                    'error': str(result),
                    'model_name': model_name,
                    'timestamp': time.time()
                }
                processed_results.append(error_result)
                
                # Update error metrics
                self.metrics["error_metrics"]["error_count"] += 1
                error_type = type(result).__name__
                self.metrics["error_metrics"]["error_types"][error_type] = self.metrics["error_metrics"]["error_types"].get(error_type, 0) + 1
                
                logger.error(f"Error executing model {model_name}: {result}")
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def close(self):
        """
        Close all resources and connections.
        
        Should be called when finished using the integration to release resources.
        """
        logger.info("Closing EnhancedResourcePoolIntegration")
        
        # Stop health monitoring
        if self.health_monitor_running:
            self.health_monitor_running = False
            
            # Cancel health monitor task
            if self.health_monitor_task:
                try:
                    self.health_monitor_task.cancel()
                    await asyncio.sleep(0.5)  # Give it time to cancel
                except Exception as e:
                    logger.error(f"Error canceling health monitor task: {e}")
        
        # Close base integration
        if self.base_integration:
            try:
                await self.base_integration.close()
            except Exception as e:
                logger.error(f"Error closing base integration: {e}")
        
        # Final metrics storage
        if self.db_connection:
            try:
                self._store_metrics()
                self.db_connection.close()
            except Exception as e:
                logger.error(f"Error closing database connection: {e}")
        
        logger.info("EnhancedResourcePoolIntegration closed successfully")
    
    def get_metrics(self):
        """
        Get current performance metrics.
        
        Returns:
            Dict containing comprehensive metrics about resource pool performance
        """
        # Update metrics before returning
        self._update_metrics()
        
        # Return copy of metrics to avoid external modification
        return dict(self.metrics)
    
    def get_connection_stats(self):
        """
        Get statistics about current connections.
        
        Returns:
            Dict containing statistics about connections
        """
        stats = {
            "total": 0,
            "active": 0,
            "idle": 0,
            "browser_distribution": {},
            "platform_distribution": {},
            "health_status": {
                "healthy": 0,
                "degraded": 0,
                "unhealthy": 0
            }
        }
        
        # Update from self.metrics
        stats.update(self.metrics["connections"])
        
        return stats
    
    def get_model_stats(self):
        """
        Get statistics about loaded models.
        
        Returns:
            Dict containing statistics about models
        """
        return dict(self.metrics["models"])

class EnhancedModelWrapper:
    """
    Wrapper for models from the resource pool with enhanced metrics tracking.
    
    This wrapper adds performance tracking and telemetry for model inference,
    while providing a seamless interface for the client code.
    """
    
    def __init__(self, model, model_name, model_type, platform, browser, batch_size, metrics, db_connection=None):
        """
        Initialize model wrapper.
        
        Args:
            model: The base model to wrap
            model_name: Name of the model
            model_type: Type of the model
            platform: Platform used for the model
            browser: Browser used for the model
            batch_size: Batch size for inference
            metrics: Metrics dictionary for tracking
            db_connection: Optional database connection for storing metrics
        """
        self.model = model
        self.model_name = model_name
        self.model_type = model_type
        self.platform = platform
        self.browser = browser
        self.batch_size = batch_size
        self.metrics = metrics
        self.db_connection = db_connection
        
        # Track inference count and performance metrics
        self.inference_count = 0
        self.total_inference_time = 0
        self.avg_inference_time = 0
        self.min_inference_time = float('inf')
        self.max_inference_time = 0
        
        # Initialize call time if not already tracking
        if model_name not in self.metrics["performance"]["inference_times"]:
            self.metrics["performance"]["inference_times"][model_name] = []
    
    async def __call__(self, inputs):
        """
        Call the model with inputs and track performance.
        
        Args:
            inputs: Input data for the model
            
        Returns:
            The result from the base model
        """
        # Track start time
        start_time = time.time()
        
        try:
            # Call the base model
            result = await self.model(inputs)
            
            # Calculate inference time
            inference_time = time.time() - start_time
            
            # Update performance metrics
            self.inference_count += 1
            self.total_inference_time += inference_time
            self.avg_inference_time = self.total_inference_time / self.inference_count
            self.min_inference_time = min(self.min_inference_time, inference_time)
            self.max_inference_time = max(self.max_inference_time, inference_time)
            
            # Update metrics
            if self.model_type in self.metrics["models"]:
                self.metrics["models"][self.model_type]["inference_times"].append(inference_time)
                
                # Keep only last 100 inference times to avoid memory growth
                if len(self.metrics["models"][self.model_type]["inference_times"]) > 100:
                    self.metrics["models"][self.model_type]["inference_times"] = self.metrics["models"][self.model_type]["inference_times"][-100:]
            
            self.metrics["performance"]["inference_times"][self.model_name].append(inference_time)
            
            # Keep only last 100 inference times to avoid memory growth
            if len(self.metrics["performance"]["inference_times"][self.model_name]) > 100:
                self.metrics["performance"]["inference_times"][self.model_name] = self.metrics["performance"]["inference_times"][self.model_name][-100:]
            
            # Get memory usage from result if available
            if isinstance(result, dict) and 'performance_metrics' in result and 'memory_usage_mb' in result['performance_metrics']:
                memory_usage = result['performance_metrics']['memory_usage_mb']
                self.metrics["performance"]["memory_usage"][self.model_name] = memory_usage
            
            # Get throughput from result if available
            if isinstance(result, dict) and 'performance_metrics' in result and 'throughput_items_per_sec' in result['performance_metrics']:
                throughput = result['performance_metrics']['throughput_items_per_sec']
                self.metrics["performance"]["throughput"][self.model_name] = throughput
            
            # Add additional metrics to result
            if isinstance(result, dict):
                result['inference_time'] = inference_time
                result['model_name'] = self.model_name
                result['model_type'] = self.model_type
                result['platform'] = self.platform
                result['browser'] = self.browser
                result['batch_size'] = self.batch_size
                result['inference_count'] = self.inference_count
                result['avg_inference_time'] = self.avg_inference_time
            
            # Store metrics in database if available
            if self.db_connection:
                try:
                    # Extract metrics
                    memory_usage = result.get('performance_metrics', {}).get('memory_usage_mb', 0)
                    throughput = result.get('performance_metrics', {}).get('throughput_items_per_sec', 0)
                    is_real = result.get('is_real_implementation', False)
                    
                    # Get optimization flags
                    compute_shaders = result.get('optimizations', {}).get('compute_shaders', False)
                    precompile_shaders = result.get('optimizations', {}).get('precompile_shaders', False)
                    parallel_loading = result.get('optimizations', {}).get('parallel_loading', False)
                    
                    # Get quantization info
                    is_quantized = False
                    quantization_bits = 16
                    
                    if 'quantization' in result:
                        is_quantized = True
                        quantization_bits = result['quantization'].get('bits', 16)
                    
                    # Store in database
                    self.db_connection.execute("""
                    INSERT INTO enhanced_model_metrics (
                        timestamp, model_name, model_type, platform, browser,
                        batch_size, load_time_ms, inference_time_ms, throughput_items_per_sec, 
                        memory_usage_mb, is_real_implementation, is_quantized, quantization_bits,
                        compute_shaders_enabled, shader_precompilation_enabled, parallel_loading_enabled
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, [
                        datetime.datetime.now(),
                        self.model_name,
                        self.model_type,
                        self.platform,
                        self.browser,
                        self.batch_size,
                        0,  # Load time not available here
                        inference_time * 1000,  # Convert to ms
                        throughput,
                        memory_usage,
                        is_real,
                        is_quantized,
                        quantization_bits,
                        compute_shaders,
                        precompile_shaders,
                        parallel_loading
                    ])
                    
                except Exception as e:
                    logger.error(f"Error storing model metrics in database: {e}")
            
            return result
            
        except Exception as e:
            # Record error
            logger.error(f"Error during model inference: {e}")
            
            # Calculate time even for errors
            inference_time = time.time() - start_time
            
            # Update error metrics
            if hasattr(self.metrics, "error_metrics"):
                self.metrics["error_metrics"]["error_count"] += 1
                error_type = type(e).__name__
                self.metrics["error_metrics"]["error_types"][error_type] = self.metrics["error_metrics"]["error_types"].get(error_type, 0) + 1
            
            # Return error result
            return {
                'success': False,
                'error': str(e),
                'model_name': self.model_name,
                'model_type': self.model_type,
                'platform': self.platform,
                'browser': self.browser,
                'inference_time': inference_time,
                'timestamp': time.time()
            }

class EnhancedResourcePoolIntegration:
    """
    Enhanced integration between IPFS acceleration and WebNN/WebGPU resource pool.
    
    This class provides a unified interface for accessing WebNN and WebGPU
    acceleration through the resource pool, with optimized resource management,
    intelligent browser selection, and adaptive scaling.
    """
    
    def __init__(self, 
                 max_connections: int = 4,
                 min_connections: int = 1,
                 enable_gpu: bool = True, 
                 enable_cpu: bool = True,
                 headless: bool = True,
                 browser_preferences: Dict[str, str] = None,
                 adaptive_scaling: bool = True,
                 use_connection_pool: bool = True,
                 db_path: str = None):
        """
        Initialize enhanced resource pool integration.
        
        Args:
            max_connections: Maximum number of browser connections
            min_connections: Minimum number of browser connections
            enable_gpu: Whether to enable GPU acceleration
            enable_cpu: Whether to enable CPU acceleration
            headless: Whether to run browsers in headless mode
            browser_preferences: Dict mapping model families to preferred browsers
            adaptive_scaling: Whether to enable adaptive scaling
            use_connection_pool: Whether to use the enhanced connection pool
            db_path: Path to DuckDB database for storing results
        """
        self.max_connections = max_connections
        self.min_connections = min_connections
        self.enable_gpu = enable_gpu
        self.enable_cpu = enable_cpu
        self.headless = headless
        self.db_path = db_path
        self.adaptive_scaling = adaptive_scaling
        self.use_connection_pool = use_connection_pool and CONNECTION_POOL_AVAILABLE
        
        # Browser preferences for routing models to appropriate browsers
        self.browser_preferences = browser_preferences or {
            'audio': 'firefox',  # Firefox has better compute shader performance for audio
            'vision': 'chrome',  # Chrome has good WebGPU support for vision models
            'text_embedding': 'edge',  # Edge has excellent WebNN support for text embeddings
            'text_generation': 'chrome',  # Chrome works well for text generation
            'multimodal': 'chrome'  # Chrome is good for multimodal models
        }
        
        # Get global resource pool
        self.resource_pool = get_global_resource_pool()
        
        # Core integration objects
        self.bridge_integration = None
        self.connection_pool = None
        
        # Loaded models tracking
        self.loaded_models = {}
        
        # Metrics collection
        self.metrics = {
            "model_load_time": {},
            "inference_time": {},
            "memory_usage": {},
            "throughput": {},
            "latency": {},
            "batch_size": {},
            "platform_distribution": {
                "webgpu": 0,
                "webnn": 0,
                "cpu": 0
            },
            "browser_distribution": {
                "chrome": 0,
                "firefox": 0,
                "edge": 0,
                "safari": 0
            }
        }
        
        # Create connection pool if available
        if self.use_connection_pool:
            try:
                self.connection_pool = ConnectionPoolManager(
                    min_connections=self.min_connections,
                    max_connections=self.max_connections,
                    browser_preferences=self.browser_preferences,
                    adaptive_scaling=self.adaptive_scaling,
                    headless=self.headless,
                    db_path=self.db_path
                )
                logger.info("Created enhanced connection pool manager")
            except Exception as e:
                logger.error(f"Error creating connection pool manager: {e}")
                self.connection_pool = None
                self.use_connection_pool = False
        
        # Create bridge integration (fallback if connection pool not available)
        self.bridge_integration = self._get_or_create_bridge_integration()
        
        logger.info("Enhanced Resource Pool Integration initialized successfully")
    
    def _get_or_create_bridge_integration(self) -> ResourcePoolBridgeIntegration:
        """
        Get or create resource pool bridge integration.
        
        Returns:
            ResourcePoolBridgeIntegration instance
        """
        # Check if integration already exists in resource pool
        integration = self.resource_pool.get_resource("web_platform_integration")
        
        if integration is None:
            # Create new integration
            integration = ResourcePoolBridgeIntegration(
                max_connections=self.max_connections,
                enable_gpu=self.enable_gpu,
                enable_cpu=self.enable_cpu,
                headless=self.headless,
                browser_preferences=self.browser_preferences,
                adaptive_scaling=self.adaptive_scaling,
                db_path=self.db_path
            )
            
            # Store in resource pool for reuse
            self.resource_pool.set_resource(
                "web_platform_integration", 
                integration
            )
        
        return integration
    
    async def initialize(self):
        """
        Initialize the resource pool integration.
        
        Returns:
            True if initialization succeeded, False otherwise
        """
        try:
            # Initialize connection pool if available
            if self.use_connection_pool and self.connection_pool:
                pool_init = await self.connection_pool.initialize()
                if not pool_init:
                    logger.warning("Failed to initialize connection pool, falling back to bridge integration")
                    self.use_connection_pool = False
            
            # Always initialize bridge integration (even as fallback)
            if hasattr(self.bridge_integration, 'initialize'):
                bridge_init = self.bridge_integration.initialize()
                if not bridge_init:
                    logger.warning("Failed to initialize bridge integration")
                    
                    # If both init failed, return failure
                    if not self.use_connection_pool:
                        return False
            
            logger.info("Enhanced Resource Pool Integration initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing Enhanced Resource Pool Integration: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def get_model(self, 
                       model_name: str, 
                       model_type: str = None,
                       platform: str = "webgpu", 
                       batch_size: int = 1,
                       quantization: Dict[str, Any] = None,
                       optimizations: Dict[str, bool] = None,
                       browser: str = None) -> Optional[EnhancedWebModel]:
        """
        Get a model with browser-based acceleration.
        
        This method provides an optimized model with the appropriate browser and
        hardware backend based on model type, with intelligent routing.
        
        Args:
            model_name: Name of the model to load
            model_type: Type of model (text, vision, audio, multimodal)
            platform: Platform to use (webgpu, webnn, or cpu)
            batch_size: Default batch size for model
            quantization: Quantization settings (bits, mixed_precision)
            optimizations: Optional optimizations to use
            browser: Specific browser to use (overrides preferences)
            
        Returns:
            EnhancedWebModel instance or None on failure
        """
        # Determine model type if not specified
        if model_type is None:
            model_type = self._infer_model_type(model_name)
        
        # Determine model family for optimal browser selection
        model_family = self._determine_model_family(model_type, model_name)
        
        # Determine browser based on model family if not specified
        if browser is None:
            browser = self.browser_preferences.get(model_family, 'chrome')
        
        # Set default optimizations based on model family
        default_optimizations = self._get_default_optimizations(model_family)
        if optimizations:
            default_optimizations.update(optimizations)
        
        # Create model key for caching
        model_key = f"{model_name}:{platform}:{batch_size}"
        if quantization:
            bits = quantization.get("bits", 16)
            mixed = quantization.get("mixed_precision", False)
            model_key += f":{bits}bit{'_mixed' if mixed else ''}"
        
        # Check if model is already loaded
        if model_key in self.loaded_models:
            logger.info(f"Reusing already loaded model: {model_key}")
            return self.loaded_models[model_key]
        
        # Create hardware preferences
        hardware_preferences = {
            'priority_list': [platform, 'cpu'],
            'model_family': model_family,
            'browser': browser,
            'quantization': quantization or {},
            'optimizations': default_optimizations
        }
        
        # Use connection pool if available
        if self.use_connection_pool and self.connection_pool:
            try:
                # Get connection from pool
                conn_id, conn_info = await self.connection_pool.get_connection(
                    model_type=model_type,
                    platform=platform,
                    browser=browser,
                    hardware_preferences=hardware_preferences
                )
                
                if conn_id is None:
                    logger.warning(f"Failed to get connection for model {model_name}, falling back to bridge integration")
                else:
                    # Add connection info to hardware preferences
                    hardware_preferences['connection_id'] = conn_id
                    hardware_preferences['connection_info'] = conn_info
                    
                    # Update metrics
                    self.metrics["browser_distribution"][browser] = self.metrics["browser_distribution"].get(browser, 0) + 1
                    self.metrics["platform_distribution"][platform] = self.metrics["platform_distribution"].get(platform, 0) + 1
            except Exception as e:
                logger.error(f"Error getting connection from pool: {e}")
                # Fall back to bridge integration
        
        # Get model from bridge integration
        start_time = time.time()
        try:
            web_model = self.bridge_integration.get_model(
                model_type=model_type,
                model_name=model_name,
                hardware_preferences=hardware_preferences
            )
            
            # Update metrics
            load_time = time.time() - start_time
            self.metrics["model_load_time"][model_key] = load_time
            
            # Cache model
            if web_model:
                self.loaded_models[model_key] = web_model
                logger.info(f"Loaded model {model_name} in {load_time:.2f}s")
                
                # Update browser and platform metrics
                actual_browser = getattr(web_model, 'browser', browser)
                actual_platform = getattr(web_model, 'platform', platform)
                
                self.metrics["browser_distribution"][actual_browser] = self.metrics["browser_distribution"].get(actual_browser, 0) + 1
                self.metrics["platform_distribution"][actual_platform] = self.metrics["platform_distribution"].get(actual_platform, 0) + 1
            
            return web_model
        except Exception as e:
            logger.error(f"Error loading model {model_name}: {e}")
            return None
    
    async def execute_concurrent(self, models_and_inputs: List[Tuple[EnhancedWebModel, Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """
        Execute multiple models concurrently with efficient resource management.
        
        Args:
            models_and_inputs: List of (model, inputs) tuples
            
        Returns:
            List of execution results
        """
        if self.bridge_integration and hasattr(self.bridge_integration, 'execute_concurrent'):
            try:
                # Forward to bridge integration
                return await self.bridge_integration.execute_concurrent(models_and_inputs)
            except Exception as e:
                logger.error(f"Error in execute_concurrent: {e}")
                # Fall back to sequential execution
        
        # Sequential execution fallback
        results = []
        for model, inputs in models_and_inputs:
            if hasattr(model, '__call__'):
                try:
                    result = await model(inputs)
                    results.append(result)
                except Exception as e:
                    logger.error(f"Error executing model: {e}")
                    results.append({"error": str(e), "success": False})
            else:
                logger.error(f"Invalid model object: {model}")
                results.append({"error": "Invalid model object", "success": False})
        
        return results
    
    def _infer_model_type(self, model_name: str) -> str:
        """
        Infer model type from model name.
        
        Args:
            model_name: Name of the model
            
        Returns:
            Inferred model type
        """
        model_name = model_name.lower()
        
        # Check for common model type patterns
        if any(name in model_name for name in ['bert', 'roberta', 'distilbert', 'albert']):
            return 'text_embedding'
        elif any(name in model_name for name in ['gpt', 'llama', 'mistral', 'falcon', 't5', 'mpt']):
            return 'text_generation'
        elif any(name in model_name for name in ['vit', 'resnet', 'efficientnet', 'clip']):
            return 'vision'
        elif any(name in model_name for name in ['whisper', 'wav2vec', 'hubert', 'clap']):
            return 'audio'
        elif any(name in model_name for name in ['llava', 'blip', 'flava']):
            return 'multimodal'
        
        # Default to text_embedding as a safe fallback
        return 'text_embedding'
    
    def _determine_model_family(self, model_type: str, model_name: str) -> str:
        """
        Determine model family for optimal hardware selection.
        
        Args:
            model_type: Type of model (text_embedding, text_generation, etc.)
            model_name: Name of the model
            
        Returns:
            Model family for hardware selection
        """
        # Normalize model type
        model_type = model_type.lower()
        model_name = model_name.lower()
        
        # Standard model families
        if 'audio' in model_type or any(name in model_name for name in ['whisper', 'wav2vec', 'hubert', 'clap']):
            return 'audio'
        elif 'vision' in model_type or any(name in model_name for name in ['vit', 'resnet', 'efficientnet']):
            return 'vision'
        elif 'embedding' in model_type or any(name in model_name for name in ['bert', 'roberta', 'distilbert', 'albert']):
            return 'text_embedding'
        elif 'generation' in model_type or any(name in model_name for name in ['gpt', 'llama', 'mistral', 'falcon', 't5']):
            return 'text_generation'
        elif 'multimodal' in model_type or any(name in model_name for name in ['llava', 'blip', 'flava', 'clip']):
            return 'multimodal'
        
        # Default to text_embedding
        return 'text_embedding'
    
    def _get_default_optimizations(self, model_family: str) -> Dict[str, bool]:
        """
        Get default optimizations for a model family.
        
        Args:
            model_family: Model family (audio, vision, text_embedding, etc.)
            
        Returns:
            Dict with default optimizations
        """
        # Start with common optimizations
        optimizations = {
            'compute_shaders': False,
            'precompile_shaders': False,
            'parallel_loading': False
        }
        
        # Model-specific optimizations
        if model_family == 'audio':
            # Audio models benefit from compute shader optimization, especially in Firefox
            optimizations['compute_shaders'] = True
        elif model_family == 'vision':
            # Vision models benefit from shader precompilation
            optimizations['precompile_shaders'] = True
        elif model_family == 'multimodal':
            # Multimodal models benefit from parallel loading
            optimizations['parallel_loading'] = True
            optimizations['precompile_shaders'] = True
        
        return optimizations
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get comprehensive metrics about resource pool usage.
        
        Returns:
            Dict with detailed metrics
        """
        metrics = self.metrics.copy()
        
        # Add connection pool metrics if available
        if self.use_connection_pool and self.connection_pool:
            try:
                pool_stats = self.connection_pool.get_stats()
                metrics['connection_pool'] = pool_stats
            except Exception as e:
                logger.error(f"Error getting connection pool stats: {e}")
        
        # Add bridge integration metrics
        if self.bridge_integration and hasattr(self.bridge_integration, 'get_stats'):
            try:
                bridge_stats = self.bridge_integration.get_stats()
                metrics['bridge_integration'] = bridge_stats
            except Exception as e:
                logger.error(f"Error getting bridge integration stats: {e}")
        
        # Add loaded models count
        metrics['loaded_models_count'] = len(self.loaded_models)
        
        return metrics
    
    async def close(self):
        """
        Close all connections and clean up resources.
        """
        # Close connection pool if available
        if self.use_connection_pool and self.connection_pool:
            try:
                await self.connection_pool.shutdown()
            except Exception as e:
                logger.error(f"Error shutting down connection pool: {e}")
        
        # Close bridge integration
        if self.bridge_integration and hasattr(self.bridge_integration, 'close'):
            try:
                await self.bridge_integration.close()
            except Exception as e:
                logger.error(f"Error closing bridge integration: {e}")
        
        # Clear loaded models
        self.loaded_models.clear()
        
        logger.info("Enhanced Resource Pool Integration closed")
    
    def store_acceleration_result(self, result: Dict[str, Any]) -> bool:
        """
        Store acceleration result in database.
        
        Args:
            result: Acceleration result to store
            
        Returns:
            True if result was stored successfully, False otherwise
        """
        if self.bridge_integration and hasattr(self.bridge_integration, 'store_acceleration_result'):
            try:
                return self.bridge_integration.store_acceleration_result(result)
            except Exception as e:
                logger.error(f"Error storing acceleration result: {e}")
        
        return False

# For testing the module directly
if __name__ == "__main__":
    async def test_enhanced_integration():
        # Create enhanced integration
        integration = EnhancedResourcePoolIntegration(
            max_connections=4,
            min_connections=1,
            adaptive_scaling=True
        )
        
        # Initialize integration
        await integration.initialize()
        
        # Get model for text embedding
        bert_model = await integration.get_model(
            model_name="bert-base-uncased",
            model_type="text_embedding",
            platform="webgpu"
        )
        
        # Get model for vision
        vit_model = await integration.get_model(
            model_name="vit-base-patch16-224",
            model_type="vision",
            platform="webgpu"
        )
        
        # Get model for audio
        whisper_model = await integration.get_model(
            model_name="whisper-tiny",
            model_type="audio",
            platform="webgpu",
            browser="firefox"  # Explicitly request Firefox for audio
        )
        
        # Print metrics
        metrics = integration.get_metrics()
        print(f"Integration metrics: {json.dumps(metrics, indent=2)}")
        
        # Close integration
        await integration.close()
    
    # Run test
    asyncio.run(test_enhanced_integration())