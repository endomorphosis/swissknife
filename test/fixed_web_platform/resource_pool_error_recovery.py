#!/usr/bin/env python3
"""
Resource Pool Bridge Error Recovery Extensions

This module provides enhanced error recovery mechanisms for the WebNN/WebGPU
Resource Pool Bridge, improving reliability, diagnostics and telemetry for
browser-based connections.

Key features:
- Advanced circuit breaker pattern for failing connections
- Enhanced connection recovery and diagnostics
- Model-specific error tracking
- Comprehensive telemetry and metrics export
- Memory pressure management under high load

These utilities can be imported by the ResourcePoolBridge implementation
to enhance error handling and recovery capabilities.
"""

import os
import sys
import json
import time
import logging
import asyncio
import traceback
import datetime
from typing import Dict, List, Any, Optional, Tuple, Union, Callable

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ResourcePoolErrorRecovery:
    """
    Enhanced error recovery mechanisms for the ResourcePoolBridge.
    
    This class provides utilities for improving reliability and recoverability
    of browser connections in the ResourcePoolBridge implementation with
    adaptive load balancing and performance-aware recovery strategies.
    """
    
    # Performance history dictionary to track model performance by browser type
    # Used for intelligent load balancing and recovery decisions
    _performance_history = {
        'models': {},       # Tracks performance by model type and browser
        'connections': {},  # Tracks reliability metrics by connection
        'browsers': {       # Default performance metrics by browser type
            'chrome': {'success_rate': 0.95, 'avg_latency': 100, 'reliability': 0.9, 'samples': 10},
            'firefox': {'success_rate': 0.93, 'avg_latency': 110, 'reliability': 0.9, 'samples': 10}, 
            'edge': {'success_rate': 0.92, 'avg_latency': 120, 'reliability': 0.85, 'samples': 10},
            'safari': {'success_rate': 0.90, 'avg_latency': 150, 'reliability': 0.8, 'samples': 5}
        }
    }
    
    @classmethod
    async def recover_connection(cls, connection, retry_attempts=2, timeout=10.0, 
                                model_type=None, model_id=None):
        """
        Attempt to recover a degraded or failed connection with progressive strategies.
        
        This method implements a series of increasingly aggressive recovery steps:
        1. Ping test to verify basic connectivity
        2. WebSocket reconnection attempt
        3. Page refresh to reset browser state
        4. Browser restart (most aggressive)
        
        With model_type information, the method will apply performance-aware recovery
        strategies, selecting optimal browsers for specific model types based on
        historical performance data.
        
        Args:
            connection: The BrowserConnection to recover
            retry_attempts: Number of retry attempts per strategy
            timeout: Timeout in seconds for each recovery attempt
            model_type: Type of model being run ('text', 'vision', 'audio', etc.)
            model_id: Specific model ID for performance tracking
            
        Returns:
            Tuple[bool, str]: (success, recovery_method_used)
        """
        if not connection:
            logger.error("Cannot recover None connection")
            return False, "no_connection"
            
        # Track which recovery method worked
        recovery_method = "none"
            
        # Update connection status
        if hasattr(connection, 'status'):
            connection.status = "recovering"
            
        # Increment recovery attempts counter if it exists
        if hasattr(connection, 'recovery_attempts'):
            connection.recovery_attempts += 1
            
        logger.info(f"Attempting to recover connection {connection.connection_id}, " +
                   f"attempt {getattr(connection, 'recovery_attempts', 1)}")
        
        try:
            # === Strategy 1: Ping test ===
            if (hasattr(connection, 'browser_automation') and 
                connection.browser_automation and
                hasattr(connection.browser_automation, 'websocket_bridge') and
                connection.browser_automation.websocket_bridge and
                hasattr(connection.browser_automation.websocket_bridge, 'ping')):
                
                logger.info(f"Strategy 1: Ping test for connection {connection.connection_id}")
                
                # Try multiple ping attempts
                for attempt in range(retry_attempts):
                    try:
                        ping_response = await asyncio.wait_for(
                            connection.browser_automation.websocket_bridge.ping(),
                            timeout=timeout/2  # Use shorter timeout for ping
                        )
                        
                        if ping_response and ping_response.get('status') == 'success':
                            logger.info(f"Ping successful for connection {connection.connection_id}")
                            
                            # Verify WebSocket is fully functional with a capabilities check
                            try:
                                capabilities = await connection.browser_automation.websocket_bridge.get_browser_capabilities(
                                    retry_attempts=1  # Just try once since ping worked
                                )
                                
                                if capabilities:
                                    logger.info(f"Recovery successful using ping test for {connection.connection_id}")
                                    
                                    # Update connection status
                                    if hasattr(connection, 'health_status'):
                                        connection.health_status = "healthy"
                                        
                                    if hasattr(connection, 'status'):
                                        connection.status = "ready"
                                        
                                    # Reset some error counters
                                    if hasattr(connection, 'heartbeat_failures'):
                                        connection.heartbeat_failures = 0
                                        
                                    recovery_method = "ping_test"
                                    return True, recovery_method
                            except Exception as e:
                                logger.warning(f"Ping succeeded but capabilities check failed: {e}")
                                # Continue to next recovery strategy
                    except (asyncio.TimeoutError, Exception) as e:
                        logger.warning(f"Ping attempt {attempt+1}/{retry_attempts} failed: {e}")
                        await asyncio.sleep(0.5 * (attempt + 1))  # Exponential backoff
            
            # === Strategy 2: WebSocket reconnection ===
            if (hasattr(connection, 'browser_automation') and 
                connection.browser_automation):
                
                logger.info(f"Strategy 2: WebSocket reconnection for {connection.connection_id}")
                
                try:
                    # Stop existing WebSocket bridge
                    if (hasattr(connection.browser_automation, 'websocket_bridge') and 
                        connection.browser_automation.websocket_bridge):
                        await connection.browser_automation.websocket_bridge.stop()
                    
                    # Wait briefly
                    await asyncio.sleep(1.0)
                    
                    # Create a new WebSocket bridge
                    from websocket_bridge import create_websocket_bridge
                    new_port = 8765 + int(time.time() * 10) % 1000  # Generate random-ish port
                    
                    websocket_bridge = await create_websocket_bridge(port=new_port)
                    if not websocket_bridge:
                        logger.warning(f"Failed to create new WebSocket bridge for {connection.connection_id}")
                    else:
                        # Update connection with new bridge
                        connection.browser_automation.websocket_bridge = websocket_bridge
                        connection.websocket_port = new_port
                        
                        # Refresh browser page to reconnect
                        if hasattr(connection.browser_automation, 'refresh_page'):
                            await connection.browser_automation.refresh_page()
                        
                        # Wait for page to load and bridge to connect
                        await asyncio.sleep(3.0)
                        
                        # Test connection
                        websocket_connected = await websocket_bridge.wait_for_connection(
                            timeout=timeout,
                            retry_attempts=retry_attempts
                        )
                        
                        if websocket_connected:
                            logger.info(f"WebSocket reconnection successful for {connection.connection_id}")
                            
                            # Test capabilities
                            capabilities = await websocket_bridge.get_browser_capabilities(retry_attempts=1)
                            if capabilities:
                                # Update connection status
                                if hasattr(connection, 'health_status'):
                                    connection.health_status = "healthy"
                                    
                                if hasattr(connection, 'status'):
                                    connection.status = "ready"
                                    
                                recovery_method = "websocket_reconnection"
                                return True, recovery_method
                except Exception as e:
                    logger.warning(f"Error during WebSocket reconnection: {e}")
            
            # === Strategy 3: Browser restart ===
            if (hasattr(connection, 'browser_automation') and 
                connection.browser_automation):
                
                logger.info(f"Strategy 3: Browser restart for {connection.connection_id}")
                
                try:
                    # Close the current browser
                    await connection.browser_automation.close()
                    
                    # Wait for browser to close
                    await asyncio.sleep(2.0)
                    
                    # Reinitialize browser automation
                    success = await connection.browser_automation.launch()
                    if not success:
                        logger.warning(f"Failed to relaunch browser for {connection.connection_id}")
                    else:
                        # Wait for browser to initialize
                        await asyncio.sleep(3.0)
                        
                        # Create a new WebSocket bridge
                        from websocket_bridge import create_websocket_bridge
                        new_port = 8765 + int(time.time() * 10) % 1000
                        
                        websocket_bridge = await create_websocket_bridge(port=new_port)
                        if websocket_bridge:
                            # Update connection with new bridge
                            connection.browser_automation.websocket_bridge = websocket_bridge
                            connection.websocket_port = new_port
                            
                            # Wait for connection
                            websocket_connected = await websocket_bridge.wait_for_connection(
                                timeout=timeout,
                                retry_attempts=retry_attempts
                            )
                            
                            if websocket_connected:
                                logger.info(f"Browser restart successful for {connection.connection_id}")
                                
                                # Update connection status
                                if hasattr(connection, 'health_status'):
                                    connection.health_status = "healthy"
                                    
                                if hasattr(connection, 'status'):
                                    connection.status = "ready"
                                    
                                # Reset error counters after successful recovery
                                if hasattr(connection, 'heartbeat_failures'):
                                    connection.heartbeat_failures = 0
                                
                                if hasattr(connection, 'consecutive_failures'):
                                    connection.consecutive_failures = 0
                                
                                # Reopen the circuit breaker if it was open
                                if hasattr(connection, 'circuit_state') and connection.circuit_state == "open":
                                    connection.circuit_state = "closed"
                                    logger.info(f"Reset circuit breaker for {connection.connection_id} after successful recovery")
                                
                                recovery_method = "browser_restart"
                                return True, recovery_method
                except Exception as e:
                    logger.warning(f"Error during browser restart: {e}")
            
            # If no recovery method succeeded, mark as failed
            logger.error(f"All recovery strategies failed for connection {connection.connection_id}")
            
            # Check if we should try performance-based browser switch
            if model_type and all([
                hasattr(connection, 'browser_type'),
                hasattr(connection, 'resource_pool'),
                hasattr(connection.resource_pool, 'create_connection')
            ]):
                try:
                    # Get current browser type
                    current_browser = connection.browser_type
                    
                    # Get optimal browser for this model type from performance history
                    optimal_browser = cls.get_optimal_browser_for_model(model_type)
                    
                    # If optimal browser is different from current, try to use it
                    if optimal_browser != current_browser:
                        logger.info(f"Performance-based recovery: Switching from {current_browser} to {optimal_browser} for {model_type}")
                        
                        # Create a new connection with optimal browser
                        new_connection = await connection.resource_pool.create_connection(
                            browser_type=optimal_browser,
                            headless=getattr(connection, 'headless', True)
                        )
                        
                        if new_connection:
                            # Check if new connection is healthy
                            if hasattr(new_connection, 'browser_automation') and new_connection.browser_automation:
                                capabilities = await new_connection.browser_automation.websocket_bridge.get_browser_capabilities(
                                    retry_attempts=1
                                )
                                
                                if capabilities:
                                    logger.info(f"Performance-based browser switch successful: {current_browser} -> {optimal_browser}")
                                    
                                    # Add recovery flag to telemetry
                                    new_connection.recovery_from = connection.connection_id
                                    
                                    # Track metrics for successful recovery
                                    if model_id:
                                        cls.track_model_performance(
                                            model_id, 
                                            optimal_browser,
                                            {
                                                'success': True,
                                                'recovery_success': True,
                                                'latency_ms': 0  # Will be updated during next operation
                                            }
                                        )
                                    
                                    return True, "performance_based_browser_switch"
                        
                except Exception as e:
                    logger.warning(f"Performance-based browser switch failed: {e}")
            
            # Update connection status
            if hasattr(connection, 'status'):
                connection.status = "error"
                
            if hasattr(connection, 'health_status'):
                connection.health_status = "unhealthy"
                
            # Open circuit breaker if it exists
            if hasattr(connection, 'circuit_state'):
                connection.circuit_state = "open"
                if hasattr(connection, 'circuit_last_failure_time'):
                    connection.circuit_last_failure_time = time.time()
                logger.info(f"Opened circuit breaker for {connection.connection_id} after failed recovery")
            
            # Track metrics for failed recovery if model_id provided
            if model_id:
                browser_type = getattr(connection, 'browser_type', 'unknown')
                cls.track_model_performance(
                    model_id,
                    browser_type,
                    {
                        'success': False,
                        'recovery_success': False,
                        'error': 'recovery_failed'
                    }
                )
            
            return False, recovery_method
            
        except Exception as e:
            logger.error(f"Unexpected error during connection recovery: {e}")
            traceback.print_exc()
            
            # Update connection status
            if hasattr(connection, 'status'):
                connection.status = "error"
                
            if hasattr(connection, 'health_status'):
                connection.health_status = "unhealthy"
                
            return False, "error"
    
    @classmethod
    def track_model_performance(cls, model_id, browser_type, metrics):
        """
        Track performance metrics for a specific model/browser combination.
        
        This method accumulates performance data to enable intelligent
        load balancing and browser selection based on historical performance.
        
        Args:
            model_id: Model identifier (e.g., 'bert-base-uncased', 'vision:vit-base')
            browser_type: Browser used ('chrome', 'firefox', 'edge', 'safari')
            metrics: Dictionary of performance metrics (latency, success, etc.)
        """
        # Extract model type from model_id
        if ':' in model_id:
            model_type = model_id.split(':', 1)[0]
        else:
            # Try to identify model type from name
            model_id_lower = model_id.lower()
            if any(text in model_id_lower for text in ['bert', 't5', 'gpt', 'llama']):
                model_type = 'text'
            elif any(vision in model_id_lower for vision in ['vit', 'clip', 'resnet']):
                model_type = 'vision'
            elif any(audio in model_id_lower for audio in ['whisper', 'wav2vec', 'clap']):
                model_type = 'audio'
            else:
                model_type = 'unknown'
        
        # Initialize model type if not exists
        if model_type not in cls._performance_history['models']:
            cls._performance_history['models'][model_type] = {}
        
        # Initialize browser data if not exists for this model type
        if browser_type not in cls._performance_history['models'][model_type]:
            cls._performance_history['models'][model_type][browser_type] = {
                'success_count': 0,
                'error_count': 0,
                'total_latency': 0,
                'inference_count': 0,
                'average_latency': 0,
                'success_rate': 0,
            }
        
        # Update model-specific metrics
        browser_data = cls._performance_history['models'][model_type][browser_type]
        
        # Increment success or error count
        if metrics.get('success', True):
            browser_data['success_count'] += 1
        else:
            browser_data['error_count'] += 1
        
        # Update latency statistics if available
        if 'latency_ms' in metrics:
            browser_data['total_latency'] += metrics['latency_ms']
            browser_data['inference_count'] += 1
            browser_data['average_latency'] = (
                browser_data['total_latency'] / browser_data['inference_count']
                if browser_data['inference_count'] > 0 else 0
            )
        
        # Update success rate
        total_attempts = browser_data['success_count'] + browser_data['error_count']
        browser_data['success_rate'] = (
            browser_data['success_count'] / total_attempts
            if total_attempts > 0 else 0
        )
        
        # Update global browser metrics
        cls._update_browser_metrics(browser_type, metrics)
        
        logger.debug(f"Tracked performance for {model_type} on {browser_type}: "
                    f"Success rate {browser_data['success_rate']:.2f}, "
                    f"Avg latency {browser_data['average_latency']:.2f}ms")
    
    @classmethod
    def _update_browser_metrics(cls, browser_type, metrics):
        """Update global browser performance metrics."""
        if browser_type not in cls._performance_history['browsers']:
            cls._performance_history['browsers'][browser_type] = {
                'success_rate': 0.9,  # Default values 
                'avg_latency': 100,
                'reliability': 0.9,
                'samples': 0
            }
        
        browser_metrics = cls._performance_history['browsers'][browser_type]
        
        # Weighted update of browser metrics
        sample_weight = min(browser_metrics['samples'], 100) / 100  # Cap influence of history
        new_weight = 1 - sample_weight
        
        # Update success rate
        if 'success' in metrics:
            success_value = 1.0 if metrics['success'] else 0.0
            browser_metrics['success_rate'] = (
                browser_metrics['success_rate'] * sample_weight + 
                success_value * new_weight
            )
        
        # Update average latency
        if 'latency_ms' in metrics:
            browser_metrics['avg_latency'] = (
                browser_metrics['avg_latency'] * sample_weight +
                metrics['latency_ms'] * new_weight
            )
        
        # Update reliability metric (recovery success rate)
        if 'recovery_success' in metrics:
            recovery_value = 1.0 if metrics['recovery_success'] else 0.0
            browser_metrics['reliability'] = (
                browser_metrics['reliability'] * sample_weight +
                recovery_value * new_weight
            )
        
        # Increment sample count
        browser_metrics['samples'] += 1
    
    @classmethod
    def get_optimal_browser_for_model(cls, model_type):
        """
        Get the optimal browser for a specific model type based on performance history.
        
        Args:
            model_type: Type of model ('text', 'vision', 'audio', etc.)
            
        Returns:
            String: Name of optimal browser ('chrome', 'firefox', 'edge', etc.)
        """
        # Default browser preferences (fallback if no history)
        default_preferences = {
            'text': 'edge',      # Edge has good WebNN support for text models
            'vision': 'chrome',  # Chrome has good support for vision models
            'audio': 'firefox',  # Firefox has optimized compute shaders for audio
            'multimodal': 'chrome'  # Chrome is good all-around for multimodal
        }
        
        # If no history for this model type, return default
        if (model_type not in cls._performance_history['models'] or
            not cls._performance_history['models'][model_type]):
            return default_preferences.get(model_type, 'chrome')
        
        # Get performance data for this model type
        model_data = cls._performance_history['models'][model_type]
        
        # Find the browser with the best performance
        best_browser = None
        best_score = -1
        
        for browser, metrics in model_data.items():
            # Calculate a combined score based on success rate and latency
            # We normalize latency to 0-1 range assuming 200ms as upper bound
            latency_score = max(0, 1 - metrics['average_latency'] / 200) if metrics['average_latency'] > 0 else 0.5
            success_score = metrics['success_rate']
            
            # Combine scores (70% weight on success rate, 30% on latency)
            combined_score = 0.7 * success_score + 0.3 * latency_score
            
            # Update best browser if this one has a better score
            if combined_score > best_score:
                best_score = combined_score
                best_browser = browser
        
        # Return best browser or default if none found
        return best_browser or default_preferences.get(model_type, 'chrome')
    
    @classmethod
    def export_telemetry(cls, resource_pool, include_connections=False, include_models=False):
        """
        Export comprehensive telemetry data from the resource pool.
        
        This method collects detailed telemetry data about resource pool state,
        connection health, model performance, and system metrics for monitoring
        and debugging.
        
        Args:
            resource_pool: The ResourcePoolBridge instance
            include_connections: Whether to include detailed connection data
            include_models: Whether to include detailed model data
            
        Returns:
            Dict: Comprehensive telemetry data
        """
        telemetry = {
            'timestamp': time.time(),
            'datetime': datetime.datetime.now().isoformat()
        }
        
        # Add general resource pool metrics
        if hasattr(resource_pool, 'stats'):
            telemetry['stats'] = resource_pool.stats
            
        # Add system information if psutil is available
        try:
            import psutil
            
            # System CPU info
            telemetry['system'] = {
                'cpu_percent': psutil.cpu_percent(interval=0.1),
                'cpu_count': psutil.cpu_count(),
                'platform': sys.platform
            }
            
            # Memory info
            memory = psutil.virtual_memory()
            telemetry['system']['memory'] = {
                'percent': memory.percent,
                'available_mb': memory.available / (1024 * 1024),
                'total_mb': memory.total / (1024 * 1024)
            }
            
            # Check if system is under memory pressure
            telemetry['system']['memory_pressure'] = memory.percent > 80
        except ImportError:
            telemetry['system'] = {
                'platform': sys.platform
            }
        
        # Add connection stats
        if hasattr(resource_pool, 'connections'):
            # Count connections by status
            connection_stats = {
                'total': 0,
                'healthy': 0,
                'degraded': 0,
                'unhealthy': 0,
                'busy': 0,
                'browser_distribution': {},
                'platform_distribution': {'webgpu': 0, 'webnn': 0, 'cpu': 0}
            }
            
            # Include circuit breaker stats
            circuit_stats = {
                'open': 0,
                'half_open': 0,
                'closed': 0
            }
            
            # Track detailed connection info if requested
            detailed_connections = []
            
            # Process all connections
            for platform, connections in resource_pool.connections.items():
                connection_stats['total'] += len(connections)
                
                # Count by platform
                if platform in connection_stats['platform_distribution']:
                    connection_stats['platform_distribution'][platform] += len(connections)
                
                for conn in connections:
                    # Count by health status
                    if hasattr(conn, 'health_status'):
                        if conn.health_status == 'healthy':
                            connection_stats['healthy'] += 1
                        elif conn.health_status == 'degraded':
                            connection_stats['degraded'] += 1
                        elif conn.health_status == 'unhealthy':
                            connection_stats['unhealthy'] += 1
                    elif conn.is_healthy():
                        connection_stats['healthy'] += 1
                    else:
                        connection_stats['unhealthy'] += 1
                    
                    # Count busy connections
                    if conn.is_busy():
                        connection_stats['busy'] += 1
                    
                    # Count by browser
                    browser = conn.browser_name
                    if browser not in connection_stats['browser_distribution']:
                        connection_stats['browser_distribution'][browser] = 0
                    connection_stats['browser_distribution'][browser] += 1
                    
                    # Count circuit breaker states
                    if hasattr(conn, 'circuit_state'):
                        state = conn.circuit_state
                        if state in circuit_stats:
                            circuit_stats[state] += 1
                    
                    # Add detailed connection info if requested
                    if include_connections:
                        # Create connection summary
                        conn_summary = {
                            'connection_id': conn.connection_id,
                            'browser': conn.browser_name,
                            'platform': conn.platform,
                            'status': getattr(conn, 'status', 'unknown'),
                            'health_status': getattr(conn, 'health_status', 'unknown'),
                            'circuit_state': getattr(conn, 'circuit_state', 'unknown'),
                            'age_seconds': time.time() - conn.creation_time,
                            'idle_time_seconds': time.time() - conn.last_used_time,
                            'memory_usage_mb': getattr(conn, 'memory_usage_mb', 0),
                            'error_count': conn.error_count,
                            'recovery_attempts': getattr(conn, 'recovery_attempts', 0),
                            'loaded_model_count': len(conn.loaded_models),
                            'loaded_models': list(conn.loaded_models),
                            'startup_time': getattr(conn, 'startup_time', 0),
                            'total_inference_count': getattr(conn, 'total_inference_count', 0),
                            'total_inference_time': getattr(conn, 'total_inference_time', 0)
                        }
                        
                        # Add error history if available
                        if hasattr(conn, 'error_history') and conn.error_history:
                            conn_summary['latest_errors'] = conn.error_history[:3]  # Include last 3 errors
                        
                        detailed_connections.append(conn_summary)
            
            # Add connection stats to telemetry
            telemetry['connections'] = connection_stats
            telemetry['circuit_breaker'] = circuit_stats
            
            # Add detailed connections if requested
            if include_connections and detailed_connections:
                telemetry['connection_details'] = detailed_connections
        
        # Add model stats
        if hasattr(resource_pool, 'model_connections'):
            model_stats = {
                'total': len(resource_pool.model_connections),
                'by_platform': {'webgpu': 0, 'webnn': 0, 'cpu': 0},
                'by_browser': {}
            }
            
            detailed_models = {}
            
            # Process all models
            for model_id, conn in resource_pool.model_connections.items():
                if conn:
                    # Count by platform
                    platform = conn.platform
                    if platform in model_stats['by_platform']:
                        model_stats['by_platform'][platform] += 1
                    
                    # Count by browser
                    browser = conn.browser_name
                    if browser not in model_stats['by_browser']:
                        model_stats['by_browser'][browser] = 0
                    model_stats['by_browser'][browser] += 1
                    
                    # Add detailed model info if requested
                    if include_models:
                        # Get model performance metrics
                        model_metrics = {}
                        if hasattr(conn, 'model_performance') and model_id in conn.model_performance:
                            metrics = conn.model_performance[model_id]
                            
                            # Calculate success rate
                            execution_count = metrics.get('execution_count', 0)
                            success_count = metrics.get('success_count', 0)
                            success_rate = (success_count / max(execution_count, 1)) * 100
                            
                            # Create model summary
                            model_metrics = {
                                'execution_count': execution_count,
                                'success_count': success_count,
                                'failure_count': metrics.get('failure_count', 0),
                                'success_rate': success_rate,
                                'average_latency_ms': metrics.get('average_latency_ms', 0),
                                'memory_footprint_mb': metrics.get('memory_footprint_mb', 0),
                                'last_execution_time': metrics.get('last_execution_time', None)
                            }
                        
                        detailed_models[model_id] = {
                            'connection_id': conn.connection_id,
                            'browser': conn.browser_name,
                            'platform': conn.platform,
                            'metrics': model_metrics
                        }
            
            # Add model stats to telemetry
            telemetry['models'] = model_stats
            
            # Add detailed models if requested
            if include_models and detailed_models:
                telemetry['model_details'] = detailed_models
        
        # Add resource metrics if available
        if hasattr(resource_pool, 'resource_metrics'):
            telemetry['resource_metrics'] = resource_pool.resource_metrics
            
        # Add performance history data and analysis
        telemetry['performance_history'] = {
            'browser_performance': cls._performance_history['browsers'],
        }
        
        # Include model type performance data if requested
        if include_models:
            telemetry['performance_history']['model_type_stats'] = cls._performance_history['models']
            
            # Add performance trend analysis
            telemetry['performance_analysis'] = cls.analyze_performance_trends()
        
        return telemetry
    
    @classmethod
    def analyze_performance_trends(cls):
        """
        Analyze performance trends to provide optimized browser allocation guidance.
        
        This method analyzes accumulated performance data to identify trends
        and provide recommendations for optimizing browser allocation.
        
        Returns:
            Dict: Performance analysis and recommendations
        """
        analysis = {
            'browser_performance': {},
            'model_type_affinities': {},
            'recommendations': {}
        }
        
        # Analyze overall browser performance
        for browser, metrics in cls._performance_history['browsers'].items():
            analysis['browser_performance'][browser] = {
                'success_rate': round(metrics['success_rate'] * 100, 1),
                'avg_latency_ms': round(metrics['avg_latency'], 1),
                'reliability': round(metrics['reliability'] * 100, 1),
                'samples': metrics['samples'],
                'overall_score': round((0.6 * metrics['success_rate'] + 
                                     0.2 * (1 - metrics['avg_latency'] / 200) +
                                     0.2 * metrics['reliability']) * 100, 1)
            }
        
        # Analyze model type affinities (which browser works best for which model types)
        for model_type, browser_data in cls._performance_history['models'].items():
            browser_scores = {}
            
            for browser, metrics in browser_data.items():
                # Skip browsers with too few samples
                if metrics['inference_count'] < 5:
                    continue
                
                # Calculate score (weighted mix of success rate and latency)
                latency_factor = max(0, 1 - metrics['average_latency'] / 200) if metrics['average_latency'] > 0 else 0.5
                browser_scores[browser] = {
                    'success_rate': round(metrics['success_rate'] * 100, 1),
                    'avg_latency_ms': round(metrics['average_latency'], 1),
                    'inference_count': metrics['inference_count'],
                    'score': round((0.7 * metrics['success_rate'] + 0.3 * latency_factor) * 100, 1)
                }
            
            # Find the best browser for this model type
            if browser_scores:
                best_browser = max(browser_scores.items(), key=lambda x: x[1]['score'])[0]
                analysis['model_type_affinities'][model_type] = {
                    'optimal_browser': best_browser,
                    'scores': browser_scores
                }
                
                # Add recommendation if we have a clear winner (>5% better than second best)
                if len(browser_scores) > 1:
                    scores = [(browser, data['score']) for browser, data in browser_scores.items()]
                    scores.sort(key=lambda x: x[1], reverse=True)
                    if scores[0][1] > scores[1][1] + 5:  # Best is at least 5% better
                        analysis['recommendations'][model_type] = {
                            'recommendation': f"Use {best_browser} for {model_type} models",
                            'improvement': f"{round(scores[0][1] - scores[1][1], 1)}% better than {scores[1][0]}"
                        }
        
        # Add general recommendations based on analysis
        if not analysis['recommendations']:
            # General recommendations based on browser overall performance
            browser_ranks = [(browser, data['overall_score']) 
                           for browser, data in analysis['browser_performance'].items()]
            browser_ranks.sort(key=lambda x: x[1], reverse=True)
            
            if browser_ranks:
                analysis['recommendations']['general'] = {
                    'recommendation': f"For most workloads, prefer {browser_ranks[0][0]}",
                    'details': f"Overall performance score: {browser_ranks[0][1]}%"
                }
        
        return analysis
        
    @staticmethod
    def check_circuit_breaker(connection, model_id=None):
        """
        Check if circuit breaker allows operation to proceed.
        
        Implements the circuit breaker pattern to prevent repeated calls to failing services.
        
        Args:
            connection: The BrowserConnection to check
            model_id: Optional model ID for model-specific circuit breaker
            
        Returns:
            Tuple[bool, str]: (is_allowed, reason)
                is_allowed: True if operation is allowed, False otherwise
                reason: Reason why operation is not allowed (if applicable)
        """
        # Skip if connection doesn't have circuit breaker state
        if not hasattr(connection, 'circuit_state'):
            return True, "No circuit breaker"
        
        # Check global circuit breaker first
        current_time = time.time()
        
        # If circuit is open, check if reset timeout has elapsed
        if connection.circuit_state == "open":
            if hasattr(connection, 'circuit_last_failure_time') and hasattr(connection, 'circuit_reset_timeout'):
                if current_time - connection.circuit_last_failure_time > connection.circuit_reset_timeout:
                    # Reset to half-open state and allow a trial request
                    connection.circuit_state = "half-open"
                    logger.info(f"Circuit breaker transitioned from open to half-open for {connection.connection_id}")
                    return True, "Circuit breaker in half-open state, allowing trial request"
                else:
                    # Circuit is open and timeout not reached, fail fast
                    time_remaining = connection.circuit_reset_timeout - (current_time - connection.circuit_last_failure_time)
                    return False, f"Circuit breaker open (reset in {time_remaining:.1f}s)"
            else:
                # Missing circuit breaker configuration, default to open
                return False, "Circuit breaker open (no timeout configuration)"
        
        # Check model-specific circuit breaker
        if model_id and hasattr(connection, 'model_error_counts') and model_id in connection.model_error_counts:
            model_errors = connection.model_error_counts[model_id]
            # If model has excessive errors, fail fast
            if model_errors >= 3:  # Use a lower threshold for model-specific errors
                return False, f"Model {model_id} has excessive errors ({model_errors})"
        
        # Circuit is closed or half-open, allow operation
        return True, "Circuit breaker closed"
    
    @staticmethod
    def update_circuit_breaker(connection, success, model_id=None, error=None):
        """
        Update circuit breaker state based on operation success/failure.
        
        Args:
            connection: The BrowserConnection to update
            success: Whether the operation succeeded
            model_id: Model ID for model-specific tracking (optional)
            error: Error message if operation failed (optional)
        """
        # Skip if connection doesn't have circuit breaker state
        if not hasattr(connection, 'circuit_state'):
            return
        
        if success:
            # On success, reset failure counters
            if connection.circuit_state == "half-open":
                # Transition from half-open to closed on successful operation
                connection.circuit_state = "closed"
                logger.info(f"Circuit breaker transitioned from half-open to closed for {connection.connection_id}")
            
            # Reset counters
            if hasattr(connection, 'consecutive_failures'):
                connection.consecutive_failures = 0
            
            # Reset model-specific error count if relevant
            if model_id and hasattr(connection, 'model_error_counts') and model_id in connection.model_error_counts:
                connection.model_error_counts[model_id] = 0
                
        else:
            # On failure, increment counters
            if hasattr(connection, 'consecutive_failures'):
                connection.consecutive_failures += 1
            else:
                connection.consecutive_failures = 1
            
            # Update model-specific error count
            if model_id:
                if not hasattr(connection, 'model_error_counts'):
                    connection.model_error_counts = {}
                if model_id not in connection.model_error_counts:
                    connection.model_error_counts[model_id] = 0
                connection.model_error_counts[model_id] += 1
            
            # Track error history (keep last 10)
            if error:
                if not hasattr(connection, 'error_history'):
                    connection.error_history = []
                error_entry = {"time": time.time(), "error": error, "model_id": model_id}
                connection.error_history.append(error_entry)
                if len(connection.error_history) > 10:
                    connection.error_history.pop(0)  # Remove oldest error
            
            # Update global circuit breaker state
            if hasattr(connection, 'consecutive_failures') and hasattr(connection, 'circuit_failure_threshold'):
                if connection.consecutive_failures >= connection.circuit_failure_threshold:
                    # Open the circuit breaker
                    if connection.circuit_state != "open":
                        connection.circuit_state = "open"
                        if hasattr(connection, 'circuit_last_failure_time'):
                            connection.circuit_last_failure_time = time.time()
                        logger.warning(f"Circuit breaker opened for {connection.connection_id} due to " +
                                     f"{connection.consecutive_failures} consecutive failures")


# Example usage demonstration
if __name__ == "__main__":
    import argparse
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Resource Pool Error Recovery Tools")
    parser.add_argument("--test-recovery", action="store_true", help="Test connection recovery")
    parser.add_argument("--connection-id", type=str, help="Connection ID to recover")
    parser.add_argument("--export-telemetry", action="store_true", help="Export telemetry data")
    parser.add_argument("--detailed", action="store_true", help="Include detailed information in telemetry")
    parser.add_argument("--output", type=str, help="Output file for telemetry data")
    args = parser.parse_args()
    
    async def main():
        try:
            # Import resource pool bridge
            sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            from fixed_web_platform.resource_pool_bridge import ResourcePoolBridge
            
            # Create resource pool bridge instance
            bridge = ResourcePoolBridge(max_connections=2)
            await bridge.initialize()
            
            # Test connection recovery if requested
            if args.test_recovery:
                if not args.connection_id:
                    print("Error: --connection-id is required for testing recovery")
                    return
                
                # Find the connection
                connection = None
                for platform, connections in bridge.connections.items():
                    for conn in connections:
                        if conn.connection_id == args.connection_id:
                            connection = conn
                            break
                    if connection:
                        break
                
                if not connection:
                    print(f"Error: Connection {args.connection_id} not found")
                    return
                
                # Attempt recovery
                print(f"Testing recovery for connection {args.connection_id}...")
                success, method = await ResourcePoolErrorRecovery.recover_connection(connection)
                
                print(f"Recovery result: {'Success' if success else 'Failed'}")
                print(f"Recovery method: {method}")
                
                # Show connection health status
                if hasattr(connection, 'health_status'):
                    print(f"Health status: {connection.health_status}")
                
                # Show circuit breaker state
                if hasattr(connection, 'circuit_state'):
                    print(f"Circuit breaker state: {connection.circuit_state}")
            
            # Export telemetry if requested
            if args.export_telemetry:
                telemetry = ResourcePoolErrorRecovery.export_telemetry(
                    bridge,
                    include_connections=args.detailed,
                    include_models=args.detailed
                )
                
                # Print telemetry summary
                print("Telemetry Summary:")
                print(f"- Timestamp: {datetime.datetime.fromtimestamp(telemetry['timestamp']).strftime('%Y-%m-%d %H:%M:%S')}")
                
                if 'connections' in telemetry:
                    conn_stats = telemetry['connections']
                    print(f"- Connections: {conn_stats.get('total', 0)} total, " +
                          f"{conn_stats.get('healthy', 0)} healthy, " +
                          f"{conn_stats.get('degraded', 0)} degraded, " +
                          f"{conn_stats.get('unhealthy', 0)} unhealthy")
                
                if 'circuit_breaker' in telemetry:
                    cb_stats = telemetry['circuit_breaker']
                    print(f"- Circuit Breaker: {cb_stats.get('open', 0)} open, " +
                          f"{cb_stats.get('half_open', 0)} half-open, " +
                          f"{cb_stats.get('closed', 0)} closed")
                
                if 'models' in telemetry:
                    model_stats = telemetry['models']
                    print(f"- Models: {model_stats.get('total', 0)} total")
                    
                    if 'by_platform' in model_stats:
                        platforms = model_stats['by_platform']
                        print(f"  - By Platform: " +
                              f"WebGPU: {platforms.get('webgpu', 0)}, " +
                              f"WebNN: {platforms.get('webnn', 0)}, " +
                              f"CPU: {platforms.get('cpu', 0)}")
                
                # Save to file if output specified
                if args.output:
                    with open(args.output, 'w') as f:
                        json.dump(telemetry, f, indent=2)
                    print(f"Telemetry data saved to {args.output}")
            
            # Close the bridge
            await bridge.shutdown()
        except Exception as e:
            print(f"Error: {e}")
            traceback.print_exc()
    
    # Run the async main function
    if args.test_recovery or args.export_telemetry:
        import asyncio
        asyncio.run(main())
    else:
        print("No action specified. Use --test-recovery or --export-telemetry")
        print("Example usage:")
        print("  python resource_pool_error_recovery.py --test-recovery --connection-id abc123")
        print("  python resource_pool_error_recovery.py --export-telemetry --detailed --output telemetry.json")