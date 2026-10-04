#!/usr/bin/env python3
"""
Connection Pool Manager for WebNN/WebGPU Resource Pool (May 2025)

This module provides an enhanced connection pool manager for WebNN/WebGPU
resource pool, enabling concurrent model execution across multiple browsers
with intelligent connection management and adaptive scaling.

Key features:
- Efficient connection pooling across browser instances
- Intelligent browser selection based on model type
- Automatic connection lifecycle management
- Comprehensive health monitoring and recovery
- Model-specific optimization routing
- Detailed telemetry and performance tracking
"""

import os
import sys
import time
import json
import asyncio
import logging
import threading
import traceback
from typing import Dict, List, Any, Optional, Tuple, Union, Callable

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import adaptive scaling
try:
    from fixed_web_platform.adaptive_scaling import AdaptiveConnectionManager
    ADAPTIVE_SCALING_AVAILABLE = True
except ImportError:
    logger.warning("AdaptiveConnectionManager not available, falling back to basic scaling")
    ADAPTIVE_SCALING_AVAILABLE = False

class ConnectionPoolManager:
    """
    Manages a pool of browser connections for concurrent model execution
    with intelligent routing, health monitoring, and adaptive scaling.
    
    This class provides the core connection management capabilities for
    the WebNN/WebGPU resource pool, handling connection lifecycle, health
    monitoring, and model routing across browsers.
    """
    
    def __init__(self, 
                 min_connections: int = 1,
                 max_connections: int = 8,
                 browser_preferences: Dict[str, str] = None,
                 adaptive_scaling: bool = True,
                 headless: bool = True,
                 connection_timeout: float = 30.0,
                 health_check_interval: float = 60.0,
                 cleanup_interval: float = 300.0,
                 db_path: str = None):
        """
        Initialize connection pool manager.
        
        Args:
            min_connections: Minimum number of connections to maintain
            max_connections: Maximum number of connections allowed
            browser_preferences: Dict mapping model families to preferred browsers
            adaptive_scaling: Whether to enable adaptive scaling
            headless: Whether to run browsers in headless mode
            connection_timeout: Timeout for connection operations (seconds)
            health_check_interval: Interval for health checks (seconds)
            cleanup_interval: Interval for connection cleanup (seconds)
            db_path: Path to DuckDB database for storing metrics
        """
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.headless = headless
        self.connection_timeout = connection_timeout
        self.health_check_interval = health_check_interval
        self.cleanup_interval = cleanup_interval
        self.db_path = db_path
        self.adaptive_scaling = adaptive_scaling
        
        # Default browser preferences if not provided
        self.browser_preferences = browser_preferences or {
            'audio': 'firefox',  # Firefox has better compute shader performance for audio
            'vision': 'chrome',  # Chrome has good WebGPU support for vision models
            'text_embedding': 'edge',  # Edge has excellent WebNN support for text embeddings
            'text_generation': 'chrome',  # Chrome works well for text generation
            'multimodal': 'chrome'  # Chrome is good for multimodal models
        }
        
        # Connection tracking
        self.connections = {}  # connection_id -> connection object
        self.connections_by_browser = {
            'chrome': {},
            'firefox': {},
            'edge': {},
            'safari': {}
        }
        self.connections_by_platform = {
            'webgpu': {},
            'webnn': {},
            'cpu': {}
        }
        
        # Model to connection mapping
        self.model_connections = {}  # model_id -> connection_id
        
        # Model performance tracking
        self.model_performance = {}  # model_type -> performance metrics
        
        # State tracking
        self.initialized = False
        self.last_connection_id = 0
        self.connection_semaphore = None  # Will be initialized later
        self.loop = None  # Will be initialized later
        self.lock = threading.RLock()
        
        # Connection health and performance metrics
        self.connection_health = {}
        self.connection_performance = {}
        
        # Task management
        self._cleanup_task = None
        self._health_check_task = None
        self._is_shutting_down = False
        
        # Create adaptive connection manager
        if ADAPTIVE_SCALING_AVAILABLE and adaptive_scaling:
            self.adaptive_manager = AdaptiveConnectionManager(
                min_connections=min_connections,
                max_connections=max_connections,
                browser_preferences=browser_preferences
            )
            logger.info("Adaptive Connection Manager created")
        else:
            self.adaptive_manager = None
            logger.info("Using basic connection scaling (adaptive scaling not available)")
        
        # Get or create event loop
        try:
            self.loop = asyncio.get_event_loop()
        except RuntimeError:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        
        # Initialize semaphore for connection control
        self.connection_semaphore = asyncio.Semaphore(max_connections)
        
        logger.info(f"Connection Pool Manager initialized with {min_connections}-{max_connections} connections")
    
    async def initialize(self):
        """
        Initialize the connection pool manager.
        
        This method starts the background tasks for health checks and cleanup,
        and initializes the minimum number of connections.
        
        Returns:
            True if initialization succeeded, False otherwise
        """
        with self.lock:
            if self.initialized:
                return True
            
            try:
                # Start background tasks
                self._start_background_tasks()
                
                # Initialize minimum connections
                for _ in range(self.min_connections):
                    success = await self._create_initial_connection()
                    if not success:
                        logger.warning("Failed to create initial connection")
                
                self.initialized = True
                logger.info(f"Connection Pool Manager initialized with {len(self.connections)} connections")
                return True
            except Exception as e:
                logger.error(f"Error initializing Connection Pool Manager: {e}")
                traceback.print_exc()
                return False
    
    def _start_background_tasks(self):
        """Start background tasks for health checking and cleanup."""
        # Define health check task
        async def health_check_task():
            while True:
                try:
                    await asyncio.sleep(self.health_check_interval)
                    await self._check_connection_health()
                except asyncio.CancelledError:
                    # Task is being cancelled
                    break
                except Exception as e:
                    logger.error(f"Error in health check task: {e}")
                    traceback.print_exc()
        
        # Define cleanup task
        async def cleanup_task():
            while True:
                try:
                    await asyncio.sleep(self.cleanup_interval)
                    await self._cleanup_connections()
                except asyncio.CancelledError:
                    # Task is being cancelled
                    break
                except Exception as e:
                    logger.error(f"Error in cleanup task: {e}")
                    traceback.print_exc()
        
        # Schedule tasks
        self._health_check_task = asyncio.ensure_future(health_check_task(), loop=self.loop)
        self._cleanup_task = asyncio.ensure_future(cleanup_task(), loop=self.loop)
        
        logger.info(f"Started background tasks (health check: {self.health_check_interval}s, cleanup: {self.cleanup_interval}s)")
    
    async def _create_initial_connection(self):
        """
        Create an initial connection for the pool.
        
        Returns:
            True if connection created successfully, False otherwise
        """
        # Determine initial connection browser and platform
        # For initial connection, prefer Chrome with WebGPU as it's most widely supported
        browser = 'chrome'
        platform = 'webgpu' if self.browser_preferences.get('vision') == 'chrome' else 'webnn'
        
        try:
            # Create new connection
            connection_id = self._generate_connection_id()
            
            # Create browser connection (this would be implemented by the ResourcePoolBridge)
            # This is a simplified placeholder
            connection = {
                'connection_id': connection_id,
                'browser': browser,
                'platform': platform,
                'creation_time': time.time(),
                'last_used_time': time.time(),
                'status': 'initializing',
                'loaded_models': set(),
                'health_status': 'unknown'
            }
            
            # Add to tracking collections
            self.connections[connection_id] = connection
            self.connections_by_browser[browser][connection_id] = connection
            self.connections_by_platform[platform][connection_id] = connection
            
            # Update connection status
            connection['status'] = 'ready'
            connection['health_status'] = 'healthy'
            
            logger.info(f"Created initial connection: id={connection_id}, browser={browser}, platform={platform}")
            return True
        except Exception as e:
            logger.error(f"Error creating initial connection: {e}")
            traceback.print_exc()
            return False
    
    def _generate_connection_id(self) -> str:
        """
        Generate a unique connection ID.
        
        Returns:
            Unique connection ID string
        """
        with self.lock:
            self.last_connection_id += 1
            # Format with timestamp and increment counter
            return f"conn_{int(time.time())}_{self.last_connection_id}"
    
    async def get_connection(self, 
                            model_type: str, 
                            platform: str = 'webgpu', 
                            browser: str = None,
                            hardware_preferences: Dict[str, Any] = None) -> Tuple[str, Dict[str, Any]]:
        """
        Get an optimal connection for a model type and platform.
        
        This method implements intelligent connection selection based on model type,
        platform, and hardware preferences, with adaptive scaling if enabled.
        
        Args:
            model_type: Type of model (audio, vision, text_embedding, etc.)
            platform: Platform to use (webgpu, webnn, or cpu)
            browser: Specific browser to use (if None, determined from preferences)
            hardware_preferences: Optional hardware preferences
            
        Returns:
            Tuple of (connection_id, connection_info)
        """
        with self.lock:
            # Determine preferred browser if not specified
            if browser is None:
                if self.adaptive_manager:
                    browser = self.adaptive_manager.get_browser_preference(model_type)
                else:
                    # Use browser preferences mapping
                    for key, preferred_browser in self.browser_preferences.items():
                        if key in model_type.lower():
                            browser = preferred_browser
                            break
                    
                    # Default to Chrome if no match found
                    if browser is None:
                        browser = 'chrome'
            
            # Look for existing connection with matching browser and platform
            matching_connections = []
            for conn_id, conn in self.connections.items():
                if conn['browser'] == browser and conn['platform'] == platform:
                    # Check if connection is healthy and ready
                    if conn['status'] == 'ready' and conn['health_status'] in ['healthy', 'degraded']:
                        matching_connections.append((conn_id, conn))
            
            # Sort by number of loaded models (prefer connections with fewer models)
            matching_connections.sort(key=lambda x: len(x[1]['loaded_models']))
            
            # If we have matching connections, use the best one
            if matching_connections:
                conn_id, conn = matching_connections[0]
                logger.info(f"Using existing connection {conn_id} for {model_type} model ({browser}/{platform})")
                
                # Update last used time
                conn['last_used_time'] = time.time()
                
                return conn_id, conn
            
            # No matching connection, check if we can create one
            current_connections = len(self.connections)
            
            # Check if we're at max connections
            if current_connections >= self.max_connections:
                # We're at max connections, try to find any suitable connection
                logger.warning(f"At max connections ({current_connections}/{self.max_connections}), finding best available")
                
                # Look for any healthy connection
                for conn_id, conn in self.connections.items():
                    if conn['status'] == 'ready' and conn['health_status'] in ['healthy', 'degraded']:
                        logger.info(f"Using non-optimal connection {conn_id} ({conn['browser']}/{conn['platform']}) for {model_type}")
                        
                        # Update last used time
                        conn['last_used_time'] = time.time()
                        
                        return conn_id, conn
                
                # No suitable connection found
                logger.error(f"No suitable connection found for {model_type} model")
                return None, {"error": "No suitable connection available"}
            
            # Create new connection with the right browser and platform
            logger.info(f"Creating new connection for {model_type} model ({browser}/{platform})")
            
            # Create new connection
            connection_id = self._generate_connection_id()
            
            # Create browser connection (this would be implemented by the ResourcePoolBridge)
            # This is a simplified placeholder
            connection = {
                'connection_id': connection_id,
                'browser': browser,
                'platform': platform,
                'creation_time': time.time(),
                'last_used_time': time.time(),
                'status': 'ready',
                'loaded_models': set(),
                'health_status': 'healthy'
            }
            
            # Add to tracking collections
            self.connections[connection_id] = connection
            self.connections_by_browser[browser][connection_id] = connection
            self.connections_by_platform[platform][connection_id] = connection
            
            # Update adaptive scaling metrics
            if self.adaptive_manager:
                # Update with connection change
                self.adaptive_manager.update_metrics(
                    current_connections=len(self.connections),
                    active_connections=sum(1 for c in self.connections.values() if c['last_used_time'] > time.time() - 300),
                    total_models=sum(len(c['loaded_models']) for c in self.connections.values()),
                    active_models=0,  # Will be updated when models are actually running
                    browser_counts={b: len(conns) for b, conns in self.connections_by_browser.items()},
                    memory_usage_mb=0  # Will be updated with real data when available
                )
            
            return connection_id, connection
    
    async def _check_connection_health(self):
        """
        Perform health checks on all connections.
        
        This method checks the health of all connections in the pool,
        updates their status, and triggers recovery for unhealthy connections.
        """
        with self.lock:
            # Skip if shutting down
            if self._is_shutting_down:
                return
            
            # Track metrics
            health_stats = {
                'total': len(self.connections),
                'healthy': 0,
                'degraded': 0,
                'unhealthy': 0,
                'recovery_attempts': 0,
                'recovery_successes': 0
            }
            
            # Check each connection
            for conn_id, conn in list(self.connections.items()):  # Use copy to avoid modification during iteration
                try:
                    # Perform health check (simulated in this implementation)
                    is_healthy = self._perform_connection_health_check(conn)
                    
                    # Update metrics
                    if is_healthy:
                        if conn['health_status'] == 'degraded':
                            health_stats['degraded'] += 1
                        else:
                            health_stats['healthy'] += 1
                    else:
                        health_stats['unhealthy'] += 1
                        
                        # Attempt recovery for unhealthy connections
                        if conn['health_status'] == 'unhealthy':
                            health_stats['recovery_attempts'] += 1
                            
                            # Simulate recovery attempt (would be implemented in ResourcePoolBridge)
                            recovery_success = await self._attempt_connection_recovery(conn)
                            
                            if recovery_success:
                                health_stats['recovery_successes'] += 1
                                logger.info(f"Successfully recovered connection {conn_id}")
                            else:
                                logger.warning(f"Failed to recover connection {conn_id}")
                except Exception as e:
                    logger.error(f"Error checking health of connection {conn_id}: {e}")
                    conn['health_status'] = 'unhealthy'
                    health_stats['unhealthy'] += 1
            
            # Log results
            if health_stats['unhealthy'] > 0:
                logger.warning(f"Connection health: {health_stats['healthy']} healthy, {health_stats['degraded']} degraded, {health_stats['unhealthy']} unhealthy")
            else:
                logger.info(f"Connection health: {health_stats['healthy']} healthy, {health_stats['degraded']} degraded")
            
            # Check if we need to scale connections based on health
            if health_stats['unhealthy'] > 0 and health_stats['total'] - health_stats['unhealthy'] < self.min_connections:
                # We need to create new connections to replace unhealthy ones
                needed = self.min_connections - (health_stats['total'] - health_stats['unhealthy'])
                logger.info(f"Creating {needed} new connections to replace unhealthy ones")
                
                for _ in range(needed):
                    await self._create_initial_connection()
    
    def _perform_connection_health_check(self, connection: Dict[str, Any]) -> bool:
        """
        Perform health check on a connection.
        
        Args:
            connection: Connection object
            
        Returns:
            True if connection is healthy, False otherwise
        """
        # This is a simplified implementation that would be replaced with real health checks
        # In a real implementation, this would call the connection's health check method
        
        # Simulate health check with some random degradation
        import random
        if random.random() < 0.05:  # 5% chance of degradation
            connection['health_status'] = 'degraded'
            return False
        
        # Healthy by default
        connection['health_status'] = 'healthy'
        return True
    
    async def _attempt_connection_recovery(self, connection: Dict[str, Any]) -> bool:
        """
        Attempt to recover an unhealthy connection.
        
        Args:
            connection: Connection object
            
        Returns:
            True if recovery succeeded, False otherwise
        """
        # This is a simplified implementation that would be replaced with real recovery
        # In a real implementation, this would call the connection's recovery method
        
        # Simulate recovery with 70% success rate
        import random
        if random.random() < 0.7:
            connection['health_status'] = 'healthy'
            return True
        
        return False
    
    async def _cleanup_connections(self):
        """
        Clean up idle and unhealthy connections.
        
        This method identifies connections that are idle for too long or unhealthy,
        and closes them to free up resources, with adaptive scaling if enabled.
        """
        with self.lock:
            # Skip if shutting down
            if self._is_shutting_down:
                return
            
            # Consider adaptive scaling recommendations
            if self.adaptive_manager:
                # Update metrics for adaptive scaling
                metrics = self.adaptive_manager.update_metrics(
                    current_connections=len(self.connections),
                    active_connections=sum(1 for c in self.connections.values() if c['last_used_time'] > time.time() - 300),
                    total_models=sum(len(c['loaded_models']) for c in self.connections.values()),
                    active_models=0,  # Will be updated with real data when available
                    browser_counts={b: len(conns) for b, conns in self.connections_by_browser.items()},
                    memory_usage_mb=0  # Will be updated with real data when available
                )
                
                # Get recommendation
                recommended_connections = metrics['scaling_recommendation']
                reason = metrics['reason']
                
                # Implement scaling recommendation
                if recommended_connections is not None and recommended_connections != len(self.connections):
                    if recommended_connections > len(self.connections):
                        # Scale up
                        to_add = recommended_connections - len(self.connections)
                        logger.info(f"Adaptive scaling: adding {to_add} connections ({reason})")
                        
                        for _ in range(to_add):
                            await self._create_initial_connection()
                    else:
                        # Scale down
                        to_remove = len(self.connections) - recommended_connections
                        logger.info(f"Adaptive scaling: removing {to_remove} connections ({reason})")
                        
                        # Find idle connections to remove
                        removed = 0
                        for conn_id, conn in sorted(self.connections.items(), 
                                                  key=lambda x: time.time() - x[1]['last_used_time'], 
                                                  reverse=True):  # Sort by idle time (most idle first)
                            
                            # Skip if we've removed enough
                            if removed >= to_remove:
                                break
                            
                            # Skip if not idle (don't remove active connections)
                            if time.time() - conn['last_used_time'] < 300:  # 5 minutes idle threshold
                                continue
                            
                            # Skip if below min_connections
                            if len(self.connections) <= self.min_connections:
                                break
                            
                            # Close connection
                            await self._close_connection(conn_id)
                            removed += 1
            
            # Always check for unhealthy connections to clean up
            for conn_id, conn in list(self.connections.items()):
                # Remove unhealthy connections
                if conn['health_status'] == 'unhealthy':
                    # Only remove if we have more than min_connections
                    if len(self.connections) > self.min_connections:
                        logger.info(f"Cleaning up unhealthy connection {conn_id}")
                        await self._close_connection(conn_id)
                
                # Check for very idle connections (> 30 minutes)
                if time.time() - conn['last_used_time'] > 1800:  # 30 minutes
                    # Only remove if we have more than min_connections
                    if len(self.connections) > self.min_connections:
                        logger.info(f"Cleaning up idle connection {conn_id} (idle for {(time.time() - conn['last_used_time'])/60:.1f} minutes)")
                        await self._close_connection(conn_id)
    
    async def _close_connection(self, connection_id: str):
        """
        Close a connection and clean up resources.
        
        Args:
            connection_id: ID of connection to close
        """
        # Get connection
        conn = self.connections.get(connection_id)
        if not conn:
            return
        
        try:
            # Remove from tracking collections
            self.connections.pop(connection_id, None)
            
            browser = conn.get('browser', 'unknown')
            platform = conn.get('platform', 'unknown')
            
            if browser in self.connections_by_browser:
                self.connections_by_browser[browser].pop(connection_id, None)
            
            if platform in self.connections_by_platform:
                self.connections_by_platform[platform].pop(connection_id, None)
            
            # Update model connections (remove any models loaded in this connection)
            for model_id, conn_id in list(self.model_connections.items()):
                if conn_id == connection_id:
                    self.model_connections.pop(model_id, None)
            
            # In a real implementation, this would call the connection's close method
            # Here we just log that it's closed
            logger.info(f"Closed connection {connection_id} ({browser}/{platform})")
        except Exception as e:
            logger.error(f"Error closing connection {connection_id}: {e}")
    
    async def shutdown(self):
        """
        Shutdown the connection pool manager and clean up resources.
        """
        with self.lock:
            # Mark as shutting down
            self._is_shutting_down = True
            
            # Cancel background tasks
            if self._health_check_task:
                self._health_check_task.cancel()
            
            if self._cleanup_task:
                self._cleanup_task.cancel()
            
            # Close all connections
            for conn_id in list(self.connections.keys()):
                await self._close_connection(conn_id)
            
            logger.info("Connection Pool Manager shut down")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get comprehensive statistics about the connection pool.
        
        Returns:
            Dict with detailed statistics
        """
        with self.lock:
            # Count connections by status
            status_counts = {
                'ready': 0,
                'initializing': 0,
                'error': 0,
                'closing': 0
            }
            
            health_counts = {
                'healthy': 0,
                'degraded': 0,
                'unhealthy': 0,
                'unknown': 0
            }
            
            for conn in self.connections.values():
                status = conn.get('status', 'unknown')
                health = conn.get('health_status', 'unknown')
                
                if status in status_counts:
                    status_counts[status] += 1
                
                if health in health_counts:
                    health_counts[health] += 1
            
            # Count connections by browser and platform
            browser_counts = {browser: len(conns) for browser, conns in self.connections_by_browser.items()}
            platform_counts = {platform: len(conns) for platform, conns in self.connections_by_platform.items()}
            
            # Get adaptive scaling stats
            adaptive_stats = self.adaptive_manager.get_scaling_stats() if self.adaptive_manager else {}
            
            return {
                'total_connections': len(self.connections),
                'min_connections': self.min_connections,
                'max_connections': self.max_connections,
                'adaptive_scaling_enabled': self.adaptive_scaling,
                'status_counts': status_counts,
                'health_counts': health_counts,
                'browser_counts': browser_counts,
                'platform_counts': platform_counts,
                'total_models': len(self.model_connections),
                'adaptive_stats': adaptive_stats
            }

# For testing the module directly
if __name__ == "__main__":
    async def test_pool():
        # Create connection pool manager
        pool = ConnectionPoolManager(
            min_connections=1,
            max_connections=4,
            adaptive_scaling=True
        )
        
        # Initialize pool
        await pool.initialize()
        
        # Get connections for different model types
        audio_conn, _ = await pool.get_connection(model_type="audio", platform="webgpu")
        vision_conn, _ = await pool.get_connection(model_type="vision", platform="webgpu")
        text_conn, _ = await pool.get_connection(model_type="text_embedding", platform="webnn")
        
        # Print stats
        stats = pool.get_stats()
        logger.info(f"Connection pool stats: {json.dumps(stats, indent=2)}")
        
        # Wait for health check and cleanup to run
        logger.info("Waiting for health check and cleanup...")
        await asyncio.sleep(5)
        
        # Shut down pool
        await pool.shutdown()
    
    # Run test
    asyncio.run(test_pool())