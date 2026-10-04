#!/usr/bin/env python3
"""
Adaptive Connection Scaling for WebNN/WebGPU Resource Pool (May 2025)

This module provides adaptive scaling capabilities for browser connections
in WebNN/WebGPU resource pool, enabling efficient resource utilization and
dynamic adjustment based on workload patterns.

Key features:
- Dynamic connection pool sizing based on workload patterns
- Predictive scaling based on historical usage patterns
- System resource-aware scaling to prevent resource exhaustion
- Browser-specific optimizations for different model types
- Memory pressure monitoring and adaptation
- Performance telemetry for scaling decisions
"""

import os
import sys
import time
import math
import logging
import asyncio
import threading
from typing import Dict, List, Any, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import machine learning utilities (if available)
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    
# Import system monitoring (if available)
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

class AdaptiveConnectionManager:
    """
    Manages adaptive scaling of browser connections based on workload
    and system resource availability.
    
    This class implements intelligent scaling algorithms to optimize
    browser connection pool size, balancing resource utilization with
    performance requirements.
    """
    
    def __init__(self, 
                 min_connections: int = 1,
                 max_connections: int = 8,
                 scale_up_threshold: float = 0.7,
                 scale_down_threshold: float = 0.3,
                 scaling_cooldown: float = 30.0,
                 smoothing_factor: float = 0.2,
                 enable_predictive: bool = True,
                 max_memory_percent: float = 80.0,
                 browser_preferences: Dict[str, str] = None):
        """
        Initialize adaptive connection manager.
        
        Args:
            min_connections: Minimum number of connections to maintain
            max_connections: Maximum number of connections allowed
            scale_up_threshold: Utilization threshold to trigger scaling up (0.0-1.0)
            scale_down_threshold: Utilization threshold to trigger scaling down (0.0-1.0)
            scaling_cooldown: Minimum time between scaling actions (seconds)
            smoothing_factor: Smoothing factor for exponential moving average (0.0-1.0)
            enable_predictive: Whether to enable predictive scaling
            max_memory_percent: Maximum system memory usage percentage
            browser_preferences: Dict mapping model families to preferred browsers
        """
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.scale_up_threshold = scale_up_threshold
        self.scale_down_threshold = scale_down_threshold
        self.scaling_cooldown = scaling_cooldown
        self.smoothing_factor = smoothing_factor
        self.enable_predictive = enable_predictive
        self.max_memory_percent = max_memory_percent
        
        # Default browser preferences if not provided
        self.browser_preferences = browser_preferences or {
            'audio': 'firefox',  # Firefox has better compute shader performance for audio
            'vision': 'chrome',  # Chrome has good WebGPU support for vision models
            'text_embedding': 'edge',  # Edge has excellent WebNN support for text embeddings
            'text_generation': 'chrome',  # Chrome works well for text generation
            'multimodal': 'chrome'  # Chrome is good for multimodal models
        }
        
        # Tracking metrics
        self.current_connections = 0
        self.target_connections = self.min_connections
        self.utilization_history = []
        self.scaling_history = []
        self.last_scaling_time = 0
        self.avg_utilization = 0.0
        self.peak_utilization = 0.0
        self.current_utilization = 0.0
        self.connection_startup_times = []
        self.avg_connection_startup_time = 5.0  # Initial estimate (seconds)
        self.browser_usage = {
            'chrome': 0,
            'firefox': 0,
            'edge': 0,
            'safari': 0
        }
        
        # Advanced metrics for predictive scaling
        self.time_series_data = {
            'timestamps': [],
            'utilization': [],
            'num_active_models': [],
            'memory_usage': []
        }
        
        # Workload patterns by model type
        self.model_type_patterns = {
            'audio': {'count': 0, 'avg_duration': 0, 'peak_concurrent': 0},
            'vision': {'count': 0, 'avg_duration': 0, 'peak_concurrent': 0},
            'text_embedding': {'count': 0, 'avg_duration': 0, 'peak_concurrent': 0},
            'text_generation': {'count': 0, 'avg_duration': 0, 'peak_concurrent': 0},
            'multimodal': {'count': 0, 'avg_duration': 0, 'peak_concurrent': 0}
        }
        
        # Memory monitoring
        self.memory_pressure_history = []
        self.system_memory_available_mb = 0
        self.system_memory_percent = 0
        
        # Status tracking
        self.is_scaling_up = False
        self.is_scaling_down = False
        self.last_scale_up_reason = ""
        self.last_scale_down_reason = ""
        
        logger.info(f"Adaptive Connection Manager initialized with {min_connections}-{max_connections} connections")
    
    def update_metrics(self, 
                      current_connections: int,
                      active_connections: int,
                      total_models: int,
                      active_models: int,
                      browser_counts: Dict[str, int],
                      memory_usage_mb: float = 0) -> Dict[str, Any]:
        """
        Update scaling metrics with current system state.
        
        Args:
            current_connections: Current number of connections
            active_connections: Number of active (non-idle) connections
            total_models: Total number of loaded models
            active_models: Number of active models currently in use
            browser_counts: Dict with counts of each browser type
            memory_usage_mb: Total memory usage in MB
            
        Returns:
            Dict with updated metrics and scaling recommendation
        """
        # Update current state
        self.current_connections = current_connections
        
        # Calculate utilization
        utilization = active_connections / max(current_connections, 1)
        model_per_connection = total_models / max(current_connections, 1)
        
        # Update browser usage
        self.browser_usage = browser_counts
        
        # Update time series data
        current_time = time.time()
        self.time_series_data['timestamps'].append(current_time)
        self.time_series_data['utilization'].append(utilization)
        self.time_series_data['num_active_models'].append(active_models)
        self.time_series_data['memory_usage'].append(memory_usage_mb)
        
        # Trim history to last 24 hours (or 1000 points, whichever is smaller)
        max_history = 1000
        if len(self.time_series_data['timestamps']) > max_history:
            for key in self.time_series_data:
                self.time_series_data[key] = self.time_series_data[key][-max_history:]
        
        # Update exponential moving average
        if self.avg_utilization == 0:
            self.avg_utilization = utilization
        else:
            self.avg_utilization = (self.avg_utilization * (1 - self.smoothing_factor) + 
                                    utilization * self.smoothing_factor)
        
        # Track peak utilization
        if utilization > self.peak_utilization:
            self.peak_utilization = utilization
        
        # Add to utilization history
        self.utilization_history.append((current_time, utilization))
        
        # Trim utilization history to last 100 points
        if len(self.utilization_history) > 100:
            self.utilization_history = self.utilization_history[-100:]
        
        # Check system memory (if psutil available)
        if PSUTIL_AVAILABLE:
            try:
                vm = psutil.virtual_memory()
                self.system_memory_available_mb = vm.available / (1024 * 1024)
                self.system_memory_percent = vm.percent
                
                # Track memory pressure
                memory_pressure = vm.percent > self.max_memory_percent
                self.memory_pressure_history.append((current_time, memory_pressure))
                
                # Trim memory pressure history
                if len(self.memory_pressure_history) > 100:
                    self.memory_pressure_history = self.memory_pressure_history[-100:]
            except Exception as e:
                logger.warning(f"Error getting system memory metrics: {e}")
        
        # Prepare result with metrics
        result = {
            'current_time': current_time,
            'current_connections': current_connections,
            'active_connections': active_connections,
            'utilization': utilization,
            'avg_utilization': self.avg_utilization,
            'peak_utilization': self.peak_utilization,
            'total_models': total_models,
            'active_models': active_models,
            'model_per_connection': model_per_connection,
            'memory_usage_mb': memory_usage_mb,
            'system_memory_percent': self.system_memory_percent,
            'system_memory_available_mb': self.system_memory_available_mb,
            'browser_usage': self.browser_usage,
            'scaling_recommendation': None,
            'reason': ""
        }
        
        # Get scaling recommendation
        recommendation, reason = self._get_scaling_recommendation(result)
        result['scaling_recommendation'] = recommendation
        result['reason'] = reason
        
        # Update last metrics
        self.current_utilization = utilization
        
        return result
    
    def _get_scaling_recommendation(self, metrics: Dict[str, Any]) -> Tuple[int, str]:
        """
        Get recommendation for optimal number of connections.
        
        Args:
            metrics: Dict with current metrics
            
        Returns:
            Tuple of (recommended_connections, reason)
        """
        # Get current values
        current_time = metrics['current_time']
        current_connections = metrics['current_connections']
        utilization = metrics['utilization']
        avg_utilization = metrics['avg_utilization']
        active_connections = metrics['active_connections']
        active_models = metrics['active_models']
        model_per_connection = metrics['model_per_connection']
        memory_usage_mb = metrics['memory_usage_mb']
        
        # Default to current number of connections
        recommended = current_connections
        reason = "No change needed"
        
        # Skip scaling if in cooldown period
        time_since_last_scaling = current_time - self.last_scaling_time
        if time_since_last_scaling < self.scaling_cooldown:
            return recommended, f"In scaling cooldown period ({time_since_last_scaling:.1f}s < {self.scaling_cooldown}s)"
        
        # Check memory pressure first (emergency scale down)
        if PSUTIL_AVAILABLE and self.system_memory_percent > self.max_memory_percent:
            # Scale down by one connection if under severe memory pressure
            if current_connections > self.min_connections:
                recommended = current_connections - 1
                reason = f"System memory pressure ({self.system_memory_percent:.1f}% > {self.max_memory_percent:.1f}%)"
                self.is_scaling_down = True
                self.last_scale_down_reason = reason
                self.last_scaling_time = current_time
                return recommended, reason
        
        # Scale up if utilization exceeds threshold
        if utilization > self.scale_up_threshold:
            # Only scale up if below max connections
            if current_connections < self.max_connections:
                # Calculate connections needed for current load
                ideal_connections = math.ceil(active_connections / self.scale_up_threshold)
                
                # Don't scale beyond max connections
                recommended = min(ideal_connections, self.max_connections)
                
                # Ensure we're adding at least one connection
                recommended = max(recommended, current_connections + 1)
                
                reason = f"High utilization ({utilization:.2f} > {self.scale_up_threshold})"
                self.is_scaling_up = True
                self.last_scale_up_reason = reason
                self.last_scaling_time = current_time
        
        # Scale down if utilization below threshold for sustained period
        elif utilization < self.scale_down_threshold and avg_utilization < self.scale_down_threshold:
            # Only scale down if above min connections
            if current_connections > self.min_connections:
                # Need at least this many to handle current active load
                min_needed = math.ceil(active_connections / 0.8)  # Target 80% utilization for active connections
                
                # Don't go below minimum connections
                recommended = max(min_needed, self.min_connections)
                
                # Don't scale down too aggressively (max 1 connection at a time)
                recommended = max(recommended, current_connections - 1)
                
                reason = f"Low utilization ({utilization:.2f} < {self.scale_down_threshold})"
                self.is_scaling_down = True
                self.last_scale_down_reason = reason
                self.last_scaling_time = current_time
        
        # Check predictive scaling if enabled
        elif self.enable_predictive and len(self.time_series_data['timestamps']) >= 10:
            # Perform predictive scaling based on trend analysis
            try:
                if NUMPY_AVAILABLE:
                    # Get last 10-20 data points for trend analysis
                    window = min(20, len(self.time_series_data['timestamps']))
                    recent_utils = self.time_series_data['utilization'][-window:]
                    recent_models = self.time_series_data['num_active_models'][-window:]
                    
                    # Calculate trend using simple linear regression
                    x = np.arange(window)
                    util_trend = np.polyfit(x, recent_utils, 1)[0]
                    model_trend = np.polyfit(x, recent_models, 1)[0]
                    
                    # Predict utilization and models in the next 5 minutes
                    # Assuming 1 data point per 15 seconds, 5 mins = 20 data points ahead
                    future_offset = 20
                    predicted_util = recent_utils[-1] + util_trend * future_offset
                    predicted_models = recent_models[-1] + model_trend * future_offset
                    
                    # If strong upward trend detected, scale up preemptively
                    if util_trend > 0.005 and predicted_util > self.scale_up_threshold:
                        if current_connections < self.max_connections:
                            # Project needed connections for predicted load
                            predicted_min_connections = math.ceil(predicted_models / model_per_connection)
                            
                            # Don't exceed max connections
                            recommended = min(predicted_min_connections, self.max_connections)
                            recommended = max(recommended, current_connections + 1)
                            
                            reason = f"Predictive scaling: upward trend detected (slope={util_trend:.4f})"
                            self.is_scaling_up = True
                            self.last_scale_up_reason = reason
                            self.last_scaling_time = current_time
            except Exception as e:
                logger.warning(f"Error in predictive scaling: {e}")
        
        # Add scaling decision to history
        if recommended != current_connections:
            self.scaling_history.append({
                'timestamp': current_time,
                'previous': current_connections,
                'new': recommended,
                'reason': reason,
                'metrics': {
                    'utilization': utilization,
                    'avg_utilization': avg_utilization,
                    'active_connections': active_connections,
                    'active_models': active_models,
                    'memory_usage_mb': memory_usage_mb,
                    'system_memory_percent': self.system_memory_percent
                }
            })
            
            # Trim scaling history to last 100 decisions
            if len(self.scaling_history) > 100:
                self.scaling_history = self.scaling_history[-100:]
        
        return recommended, reason
    
    def update_connection_startup_time(self, startup_time: float):
        """
        Update average connection startup time tracking.
        
        Args:
            startup_time: Time taken to start a connection (seconds)
        """
        self.connection_startup_times.append(startup_time)
        
        # Keep only last 10 startup times
        if len(self.connection_startup_times) > 10:
            self.connection_startup_times = self.connection_startup_times[-10:]
        
        # Update average
        self.avg_connection_startup_time = sum(self.connection_startup_times) / len(self.connection_startup_times)
    
    def get_browser_preference(self, model_type: str) -> str:
        """
        Get preferred browser for a model type.
        
        Args:
            model_type: Type of model (audio, vision, text_embedding, etc.)
            
        Returns:
            Preferred browser name
        """
        # Match model type to preference based on partial key match
        for key, browser in self.browser_preferences.items():
            if key in model_type.lower():
                return browser
        
        # Special case handling
        if 'audio' in model_type.lower() or 'whisper' in model_type.lower() or 'wav2vec' in model_type.lower():
            return 'firefox'  # Firefox has better compute shader performance for audio
        elif 'vision' in model_type.lower() or 'clip' in model_type.lower() or 'vit' in model_type.lower():
            return 'chrome'  # Chrome has good WebGPU support for vision models
        elif 'embedding' in model_type.lower() or 'bert' in model_type.lower():
            return 'edge'  # Edge has excellent WebNN support for text embeddings
        
        # Default to Chrome for unknown types
        return 'chrome'
    
    def update_model_type_metrics(self, model_type: str, duration: float):
        """
        Update metrics for a specific model type.
        
        Args:
            model_type: Type of model
            duration: Execution duration in seconds
        """
        # Normalize model type
        model_type_key = self._normalize_model_type(model_type)
        
        # Update metrics
        if model_type_key in self.model_type_patterns:
            metrics = self.model_type_patterns[model_type_key]
            metrics['count'] += 1
            
            # Update average duration with exponential moving average
            if metrics['avg_duration'] == 0:
                metrics['avg_duration'] = duration
            else:
                metrics['avg_duration'] = metrics['avg_duration'] * 0.8 + duration * 0.2
    
    def _normalize_model_type(self, model_type: str) -> str:
        """
        Normalize model type to one of the standard categories.
        
        Args:
            model_type: Raw model type string
            
        Returns:
            Normalized model type
        """
        model_type = model_type.lower()
        
        if 'audio' in model_type or 'whisper' in model_type or 'wav2vec' in model_type or 'clap' in model_type:
            return 'audio'
        elif 'vision' in model_type or 'image' in model_type or 'vit' in model_type or 'clip' in model_type:
            return 'vision'
        elif 'embedding' in model_type or 'bert' in model_type:
            return 'text_embedding'
        elif 'generation' in model_type or 'gpt' in model_type or 'llama' in model_type or 't5' in model_type:
            return 'text_generation'
        elif 'multimodal' in model_type or 'vision_language' in model_type or 'llava' in model_type:
            return 'multimodal'
        
        # Default to text embedding
        return 'text_embedding'
    
    def get_scaling_stats(self) -> Dict[str, Any]:
        """
        Get comprehensive scaling statistics.
        
        Returns:
            Dict with detailed scaling statistics
        """
        return {
            'current_connections': self.current_connections,
            'target_connections': self.target_connections,
            'min_connections': self.min_connections,
            'max_connections': self.max_connections,
            'current_utilization': self.current_utilization,
            'avg_utilization': self.avg_utilization,
            'peak_utilization': self.peak_utilization,
            'scale_up_threshold': self.scale_up_threshold,
            'scale_down_threshold': self.scale_down_threshold,
            'time_since_last_scaling': time.time() - self.last_scaling_time,
            'is_scaling_up': self.is_scaling_up,
            'is_scaling_down': self.is_scaling_down,
            'last_scale_up_reason': self.last_scale_up_reason,
            'last_scale_down_reason': self.last_scale_down_reason,
            'avg_connection_startup_time': self.avg_connection_startup_time,
            'browser_usage': self.browser_usage,
            'system_memory_percent': self.system_memory_percent,
            'system_memory_available_mb': self.system_memory_available_mb,
            'model_type_patterns': self.model_type_patterns,
            'scaling_history': self.scaling_history[-5:],  # Last 5 scaling decisions
            'predictive_enabled': self.enable_predictive
        }

# For testing the module directly
if __name__ == "__main__":
    # Create adaptive connection manager
    manager = AdaptiveConnectionManager(
        min_connections=1,
        max_connections=8,
        scale_up_threshold=0.7,
        scale_down_threshold=0.3
    )
    
    # Simulate different utilization scenarios
    for i in range(20):
        # Simulate increasing utilization
        utilization = min(0.9, i * 0.05)
        result = manager.update_metrics(
            current_connections=3,
            active_connections=int(3 * utilization),
            total_models=6,
            active_models=int(6 * utilization),
            browser_counts={'chrome': 2, 'firefox': 1, 'edge': 0, 'safari': 0},
            memory_usage_mb=1000
        )
        
        logger.info(f"Utilization: {utilization:.2f}, Recommendation: {result['scaling_recommendation']}, Reason: {result['reason']}")
        
        # Simulate delay between updates
        time.sleep(0.5)