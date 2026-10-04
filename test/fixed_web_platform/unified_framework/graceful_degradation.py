"""
Graceful Degradation Pathways for Web Platform (August 2025)

This module implements standardized graceful degradation pathways for
critical errors, ensuring the system can continue operating with reduced
functionality rather than failing completely:

- Memory pressure handling with progressive resource reduction
- Timeout handling with simplified processing
- Connection error handling with retry mechanisms
- Hardware limitations handling with alternative backends
- Browser compatibility issues handling with feature detection and alternatives

Usage:
    from fixed_web_platform.unified_framework.graceful_degradation import (
        GracefulDegradationManager, apply_degradation_strategy
    )
    
    # Create degradation manager
    degradation_manager = GracefulDegradationManager(
        config={"max_memory_gb": 4, "timeout_ms": 30000}
    )
    
    # Apply memory pressure degradation
    result = degradation_manager.handle_memory_pressure(
        component="streaming",
        severity="critical",
        current_memory_mb=3500
    )
"""

import os
import sys
import time
import logging
import json
import traceback
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("web_platform.graceful_degradation")

class DegradationLevel:
    """Degradation severity levels."""
    NONE = "none"
    LIGHT = "light"
    MODERATE = "moderate"
    SEVERE = "severe"
    CRITICAL = "critical"

class DegradationStrategy:
    """Available degradation strategies."""
    REDUCE_BATCH_SIZE = "reduce_batch_size"
    REDUCE_PRECISION = "reduce_precision"
    REDUCE_MODEL_SIZE = "reduce_model_size"
    SIMPLIFY_PIPELINE = "simplify_pipeline"
    DISABLE_FEATURES = "disable_features"
    FALLBACK_BACKEND = "fallback_backend"
    REDUCE_CONTEXT_LENGTH = "reduce_context_length"
    CPU_FALLBACK = "cpu_fallback"
    RETRY_WITH_BACKOFF = "retry_with_backoff"
    DISABLE_STREAMING = "disable_streaming"

class GracefulDegradationManager:
    """
    Manages graceful degradation for web platform components.
    
    Features:
    - Progressive resource reduction for memory pressure
    - Timeout handling with simplified processing
    - Connection error recovery with retry logic
    - Browser compatibility fallbacks
    - Hardware limitation handling
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize degradation manager.
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or {}
        
        # Set default configuration values
        self.config.setdefault("max_memory_gb", 4)  # Maximum memory limit in GB
        self.config.setdefault("max_batch_size", 8)  # Maximum batch size
        self.config.setdefault("min_batch_size", 1)  # Minimum batch size
        self.config.setdefault("timeout_ms", 30000)  # Timeout in milliseconds
        self.config.setdefault("max_retries", 3)  # Maximum retry attempts
        self.config.setdefault("retry_backoff_factor", 1.5)  # Backoff factor for retries
        
        # Track currently applied degradations
        self.applied_degradations = {}
        
        # Track degradation effectiveness
        self.degradation_metrics = {
            "total_degradations": 0,
            "successful_degradations": 0,
            "by_strategy": {},
            "by_component": {}
        }
    
    def handle_memory_pressure(self, 
                             component: str,
                             severity: str = "warning",
                             current_memory_mb: Optional[float] = None) -> Dict[str, Any]:
        """
        Handle memory pressure with progressive resource reduction.
        
        Args:
            component: The component experiencing memory pressure
            severity: Memory pressure severity
            current_memory_mb: Current memory usage in MB
            
        Returns:
            Dictionary with degradation actions
        """
        # Track this degradation
        self.degradation_metrics["total_degradations"] += 1
        
        # Calculate memory utilization percentage
        max_memory_mb = self.config["max_memory_gb"] * 1024
        memory_percent = (current_memory_mb / max_memory_mb) if current_memory_mb else 0.9
        
        # Determine degradation level based on memory percentage and severity
        degradation_level = self._get_degradation_level(memory_percent, severity)
        
        # Track component-specific degradation
        if component not in self.degradation_metrics["by_component"]:
            self.degradation_metrics["by_component"][component] = 0
        self.degradation_metrics["by_component"][component] += 1
        
        # Initialize response with base info
        response = {
            "component": component,
            "type": "memory_pressure",
            "severity": severity,
            "degradation_level": degradation_level,
            "memory_percent": memory_percent,
            "actions": [],
            "timestamp": time.time()
        }
        
        # Apply degradation strategies based on level and component
        if component == "streaming":
            # Streaming-specific strategies
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Just reduce batch size
                batch_reduction = self._apply_batch_size_reduction(component, 0.75)
                response["actions"].append(batch_reduction)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Reduce batch size and disable some features
                batch_reduction = self._apply_batch_size_reduction(component, 0.5)
                feature_disable = self._disable_features(component, ["prefill_optimized"])
                response["actions"].extend([batch_reduction, feature_disable])
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Aggressive batch size reduction, precision reduction, feature disabling
                batch_reduction = self._apply_batch_size_reduction(component, 0.25)
                precision_reduction = self._reduce_precision(component, "int2")
                feature_disable = self._disable_features(
                    component, ["prefill_optimized", "latency_optimized"]
                )
                response["actions"].extend([batch_reduction, precision_reduction, feature_disable])
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Maximize memory savings, reduce context length, switch to CPU
                batch_reduction = self._apply_batch_size_reduction(component, 0)  # Minimum batch size
                precision_reduction = self._reduce_precision(component, "int2")
                context_reduction = self._reduce_context_length(component, 0.25)
                cpu_fallback = self._apply_cpu_fallback(component)
                response["actions"].extend([
                    batch_reduction, precision_reduction, context_reduction, cpu_fallback
                ])
                
        elif component == "webgpu":
            # WebGPU-specific strategies
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Disable shader precompilation
                feature_disable = self._disable_features(component, ["shader_precompilation"])
                response["actions"].append(feature_disable)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Disable compute shaders and shader precompilation
                feature_disable = self._disable_features(
                    component, ["shader_precompilation", "compute_shaders"]
                )
                response["actions"].append(feature_disable)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Fall back to WebNN if available
                backend_fallback = self._apply_backend_fallback(component, "webnn")
                response["actions"].append(backend_fallback)
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Fall back to CPU-based WebAssembly
                cpu_fallback = self._apply_cpu_fallback(component)
                response["actions"].append(cpu_fallback)
                
        else:
            # Generic strategies for other components
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Disable non-essential features
                feature_disable = self._disable_features(component, ["optimizations"])
                response["actions"].append(feature_disable)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Reduce model complexity
                model_reduction = self._reduce_model_size(component, 0.75)
                response["actions"].append(model_reduction)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Significant model reduction
                model_reduction = self._reduce_model_size(component, 0.5)
                precision_reduction = self._reduce_precision(component, "int8")
                response["actions"].extend([model_reduction, precision_reduction])
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Minimum viable functionality
                model_reduction = self._reduce_model_size(component, 0.25)
                precision_reduction = self._reduce_precision(component, "int4")
                pipeline_simplification = self._simplify_pipeline(component)
                response["actions"].extend([
                    model_reduction, precision_reduction, pipeline_simplification
                ])
        
        # Store applied degradations
        self.applied_degradations[component] = {
            "type": "memory_pressure",
            "level": degradation_level,
            "actions": [a["strategy"] for a in response["actions"]],
            "timestamp": time.time()
        }
        
        # Mark as successful if actions were applied
        if response["actions"]:
            self.degradation_metrics["successful_degradations"] += 1
            
            # Track strategy-specific success
            for action in response["actions"]:
                strategy = action["strategy"]
                if strategy not in self.degradation_metrics["by_strategy"]:
                    self.degradation_metrics["by_strategy"][strategy] = 0
                self.degradation_metrics["by_strategy"][strategy] += 1
        
        return response
    
    def handle_timeout(self, 
                     component: str,
                     severity: str = "warning",
                     operation: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle timeout errors with simplified processing.
        
        Args:
            component: The component experiencing timeouts
            severity: Timeout severity
            operation: The operation that timed out
            
        Returns:
            Dictionary with degradation actions
        """
        # Track this degradation
        self.degradation_metrics["total_degradations"] += 1
        
        # Determine degradation level based on severity
        degradation_level = self._severity_to_level(severity)
        
        # Track component-specific degradation
        if component not in self.degradation_metrics["by_component"]:
            self.degradation_metrics["by_component"][component] = 0
        self.degradation_metrics["by_component"][component] += 1
        
        # Initialize response with base info
        response = {
            "component": component,
            "type": "timeout",
            "severity": severity,
            "operation": operation,
            "degradation_level": degradation_level,
            "actions": [],
            "timestamp": time.time()
        }
        
        # Apply degradation strategies based on level and component
        if component == "streaming":
            # Streaming-specific timeout handling
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Extend timeouts
                timeout_extension = self._extend_timeout(component, 1.5)
                response["actions"].append(timeout_extension)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Reduce generation complexity
                batch_reduction = self._apply_batch_size_reduction(component, 0.5)
                response["actions"].append(batch_reduction)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Disable streaming, use batched mode
                streaming_disable = self._disable_streaming(component)
                response["actions"].append(streaming_disable)
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Use simplest possible generation
                fallback = self._apply_cpu_fallback(component)
                feature_disable = self._disable_features(
                    component, ["kv_cache_optimization", "prefill_optimized", "latency_optimized"]
                )
                token_limit = self._limit_output_tokens(component, 50)
                response["actions"].extend([fallback, feature_disable, token_limit])
                
        elif component == "webgpu":
            # WebGPU-specific timeout handling
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Disable compute shaders
                feature_disable = self._disable_features(component, ["compute_shaders"])
                response["actions"].append(feature_disable)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Use simpler model
                model_reduction = self._reduce_model_size(component, 0.75)
                response["actions"].append(model_reduction)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Fall back to WebNN
                backend_fallback = self._apply_backend_fallback(component, "webnn")
                response["actions"].append(backend_fallback)
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Fall back to CPU
                cpu_fallback = self._apply_cpu_fallback(component)
                response["actions"].append(cpu_fallback)
                
        else:
            # Generic strategies for other components
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Extend timeouts
                timeout_extension = self._extend_timeout(component, 1.5)
                response["actions"].append(timeout_extension)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Simplify processing
                pipeline_simplification = self._simplify_pipeline(component)
                response["actions"].append(pipeline_simplification)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Significant simplification
                pipeline_simplification = self._simplify_pipeline(component)
                model_reduction = self._reduce_model_size(component, 0.5)
                response["actions"].extend([pipeline_simplification, model_reduction])
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Minimum viable functionality
                fallback = self._apply_cpu_fallback(component)
                feature_disable = self._disable_features(component, ["all"])
                response["actions"].extend([fallback, feature_disable])
        
        # Store applied degradations
        self.applied_degradations[component] = {
            "type": "timeout",
            "level": degradation_level,
            "actions": [a["strategy"] for a in response["actions"]],
            "timestamp": time.time()
        }
        
        # Mark as successful if actions were applied
        if response["actions"]:
            self.degradation_metrics["successful_degradations"] += 1
            
            # Track strategy-specific success
            for action in response["actions"]:
                strategy = action["strategy"]
                if strategy not in self.degradation_metrics["by_strategy"]:
                    self.degradation_metrics["by_strategy"][strategy] = 0
                self.degradation_metrics["by_strategy"][strategy] += 1
        
        return response
    
    def handle_connection_error(self, 
                              component: str,
                              severity: str = "warning",
                              error_count: Optional[int] = None) -> Dict[str, Any]:
        """
        Handle connection errors with retry and fallback mechanisms.
        
        Args:
            component: The component experiencing connection errors
            severity: Error severity
            error_count: Number of consecutive errors
            
        Returns:
            Dictionary with degradation actions
        """
        # Track this degradation
        self.degradation_metrics["total_degradations"] += 1
        
        # Determine retry count based on error count
        retry_count = error_count or 1
        
        # Determine degradation level based on retry count and severity
        if retry_count >= self.config["max_retries"]:
            degradation_level = DegradationLevel.CRITICAL
        elif retry_count > 1:
            degradation_level = DegradationLevel.SEVERE
        else:
            degradation_level = self._severity_to_level(severity)
        
        # Track component-specific degradation
        if component not in self.degradation_metrics["by_component"]:
            self.degradation_metrics["by_component"][component] = 0
        self.degradation_metrics["by_component"][component] += 1
        
        # Initialize response with base info
        response = {
            "component": component,
            "type": "connection_error",
            "severity": severity,
            "retry_count": retry_count,
            "degradation_level": degradation_level,
            "actions": [],
            "timestamp": time.time()
        }
        
        # Apply degradation strategies based on level and component
        if component == "streaming":
            # Streaming-specific connection error handling
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Simple retry
                retry = self._apply_retry(component, retry_count)
                response["actions"].append(retry)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Retry with backoff
                retry = self._apply_retry_with_backoff(
                    component, retry_count, self.config["retry_backoff_factor"]
                )
                response["actions"].append(retry)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Disable streaming
                streaming_disable = self._disable_streaming(component)
                response["actions"].append(streaming_disable)
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Fallback to non-streaming mode with limited functionality
                streaming_disable = self._disable_streaming(component)
                feature_disable = self._disable_features(
                    component, ["websocket", "progressive_generation"]
                )
                synchronous_mode = self._enable_synchronous_mode(component)
                response["actions"].extend([streaming_disable, feature_disable, synchronous_mode])
                
        elif component == "webgpu":
            # WebGPU connection issues are usually related to browser/device issues
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Simple retry
                retry = self._apply_retry(component, retry_count)
                response["actions"].append(retry)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Try reinitializing WebGPU
                reinitialize = self._reinitialize_component(component)
                response["actions"].append(reinitialize)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Fall back to WebNN
                backend_fallback = self._apply_backend_fallback(component, "webnn")
                response["actions"].append(backend_fallback)
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Fall back to CPU via WebAssembly
                cpu_fallback = self._apply_cpu_fallback(component)
                response["actions"].append(cpu_fallback)
                
        else:
            # Generic connection error strategies
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Simple retry
                retry = self._apply_retry(component, retry_count)
                response["actions"].append(retry)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Retry with backoff
                retry = self._apply_retry_with_backoff(
                    component, retry_count, self.config["retry_backoff_factor"]
                )
                response["actions"].append(retry)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Reinitialize and retry with backoff
                reinitialize = self._reinitialize_component(component)
                retry = self._apply_retry_with_backoff(
                    component, retry_count, self.config["retry_backoff_factor"]
                )
                response["actions"].extend([reinitialize, retry])
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Use most reliable fallback
                fallback = self._apply_most_reliable_fallback(component)
                response["actions"].append(fallback)
        
        # Store applied degradations
        self.applied_degradations[component] = {
            "type": "connection_error",
            "level": degradation_level,
            "actions": [a["strategy"] for a in response["actions"]],
            "timestamp": time.time()
        }
        
        # Mark as successful if actions were applied
        if response["actions"]:
            self.degradation_metrics["successful_degradations"] += 1
            
            # Track strategy-specific success
            for action in response["actions"]:
                strategy = action["strategy"]
                if strategy not in self.degradation_metrics["by_strategy"]:
                    self.degradation_metrics["by_strategy"][strategy] = 0
                self.degradation_metrics["by_strategy"][strategy] += 1
        
        return response
    
    def handle_browser_compatibility_error(self, 
                                        component: str,
                                        browser: str,
                                        feature: str,
                                        severity: str = "error") -> Dict[str, Any]:
        """
        Handle browser compatibility errors with feature fallbacks.
        
        Args:
            component: The component experiencing compatibility errors
            browser: Browser name
            feature: Unsupported feature
            severity: Error severity
            
        Returns:
            Dictionary with degradation actions
        """
        # Track this degradation
        self.degradation_metrics["total_degradations"] += 1
        
        # Determine degradation level based on severity
        degradation_level = self._severity_to_level(severity)
        
        # Track component-specific degradation
        if component not in self.degradation_metrics["by_component"]:
            self.degradation_metrics["by_component"][component] = 0
        self.degradation_metrics["by_component"][component] += 1
        
        # Initialize response with base info
        response = {
            "component": component,
            "type": "browser_compatibility",
            "browser": browser,
            "feature": feature,
            "severity": severity,
            "degradation_level": degradation_level,
            "actions": [],
            "timestamp": time.time()
        }
        
        # Apply browser-specific compatibility strategies
        if browser.lower() == "safari":
            # Safari-specific compatibility handling
            if feature.lower() == "webgpu":
                # WebGPU fallback for Safari
                if component == "streaming":
                    # Streaming without WebGPU
                    feature_disable = self._disable_features(
                        component, ["webgpu_acceleration", "compute_shaders"]
                    )
                    backend_fallback = self._apply_backend_fallback(component, "webnn")
                    response["actions"].extend([feature_disable, backend_fallback])
                else:
                    # General WebGPU fallback
                    backend_fallback = self._apply_backend_fallback(component, "webnn")
                    response["actions"].append(backend_fallback)
            
            elif feature.lower() == "compute_shaders":
                # Disable compute shaders for Safari
                feature_disable = self._disable_features(component, ["compute_shaders"])
                response["actions"].append(feature_disable)
                
            elif feature.lower() == "shared_memory":
                # Disable shared memory for Safari
                feature_disable = self._disable_features(component, ["shared_memory"])
                memory_workaround = self._apply_memory_workaround(component, browser)
                response["actions"].extend([feature_disable, memory_workaround])
                
        elif browser.lower() in ["firefox", "chrome", "edge"]:
            # Firefox/Chrome/Edge compatibility handling
            if feature.lower() == "webnn":
                # WebNN fallback
                backend_fallback = self._apply_backend_fallback(component, "webgpu")
                response["actions"].append(backend_fallback)
                
            elif feature.lower() == "wasm_simd":
                # WASM SIMD fallback
                feature_disable = self._disable_features(component, ["simd"])
                response["actions"].append(feature_disable)
                
        else:
            # Generic browser compatibility handling
            backend_fallback = self._apply_most_reliable_fallback(component)
            response["actions"].append(backend_fallback)
        
        # Store applied degradations
        self.applied_degradations[component] = {
            "type": "browser_compatibility",
            "browser": browser,
            "feature": feature,
            "level": degradation_level,
            "actions": [a["strategy"] for a in response["actions"]],
            "timestamp": time.time()
        }
        
        # Mark as successful if actions were applied
        if response["actions"]:
            self.degradation_metrics["successful_degradations"] += 1
            
            # Track strategy-specific success
            for action in response["actions"]:
                strategy = action["strategy"]
                if strategy not in self.degradation_metrics["by_strategy"]:
                    self.degradation_metrics["by_strategy"][strategy] = 0
                self.degradation_metrics["by_strategy"][strategy] += 1
        
        return response
    
    def handle_hardware_error(self, 
                            component: str,
                            hardware_type: str,
                            severity: str = "error") -> Dict[str, Any]:
        """
        Handle hardware-related errors with alternative hardware options.
        
        Args:
            component: The component experiencing hardware errors
            hardware_type: Type of hardware
            severity: Error severity
            
        Returns:
            Dictionary with degradation actions
        """
        # Track this degradation
        self.degradation_metrics["total_degradations"] += 1
        
        # Determine degradation level based on severity
        degradation_level = self._severity_to_level(severity)
        
        # Track component-specific degradation
        if component not in self.degradation_metrics["by_component"]:
            self.degradation_metrics["by_component"][component] = 0
        self.degradation_metrics["by_component"][component] += 1
        
        # Initialize response with base info
        response = {
            "component": component,
            "type": "hardware_error",
            "hardware_type": hardware_type,
            "severity": severity,
            "degradation_level": degradation_level,
            "actions": [],
            "timestamp": time.time()
        }
        
        # Apply hardware-specific degradation strategies
        if hardware_type.lower() == "gpu":
            # GPU error handling
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Reduce GPU memory usage
                feature_disable = self._disable_features(component, ["high_memory_features"])
                response["actions"].append(feature_disable)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Use smaller model
                model_reduction = self._reduce_model_size(component, 0.5)
                response["actions"].append(model_reduction)
                
            elif degradation_level == DegradationLevel.SEVERE:
                # Severe: Try alternative GPU API
                if component == "webgpu":
                    backend_fallback = self._apply_backend_fallback(component, "webnn")
                    response["actions"].append(backend_fallback)
                else:
                    # General GPU fallback
                    feature_disable = self._disable_features(component, ["advanced_gpu_features"])
                    model_reduction = self._reduce_model_size(component, 0.25)
                    response["actions"].extend([feature_disable, model_reduction])
                
            elif degradation_level == DegradationLevel.CRITICAL:
                # Critical: Fall back to CPU
                cpu_fallback = self._apply_cpu_fallback(component)
                response["actions"].append(cpu_fallback)
                
        elif hardware_type.lower() == "cpu":
            # CPU error handling
            if degradation_level == DegradationLevel.LIGHT:
                # Light: Reduce CPU usage
                feature_disable = self._disable_features(component, ["parallel_processing"])
                response["actions"].append(feature_disable)
                
            elif degradation_level == DegradationLevel.MODERATE:
                # Moderate: Use smaller model
                model_reduction = self._reduce_model_size(component, 0.5)
                response["actions"].append(model_reduction)
                
            elif degradation_level in [DegradationLevel.SEVERE, DegradationLevel.CRITICAL]:
                # Severe/Critical: Minimum functionality
                model_reduction = self._reduce_model_size(component, 0.1)  # Smallest model
                pipeline_simplification = self._simplify_pipeline(component)
                response["actions"].extend([model_reduction, pipeline_simplification])
        
        # Store applied degradations
        self.applied_degradations[component] = {
            "type": "hardware_error",
            "hardware_type": hardware_type,
            "level": degradation_level,
            "actions": [a["strategy"] for a in response["actions"]],
            "timestamp": time.time()
        }
        
        # Mark as successful if actions were applied
        if response["actions"]:
            self.degradation_metrics["successful_degradations"] += 1
            
            # Track strategy-specific success
            for action in response["actions"]:
                strategy = action["strategy"]
                if strategy not in self.degradation_metrics["by_strategy"]:
                    self.degradation_metrics["by_strategy"][strategy] = 0
                self.degradation_metrics["by_strategy"][strategy] += 1
        
        return response
    
    def get_degradation_status(self) -> Dict[str, Any]:
        """
        Get the current degradation status.
        
        Returns:
            Dictionary with degradation status
        """
        return {
            "applied_degradations": self.applied_degradations,
            "metrics": self.degradation_metrics,
            "timestamp": time.time()
        }
    
    def reset_degradations(self, component: Optional[str] = None) -> None:
        """
        Reset applied degradations.
        
        Args:
            component: Specific component to reset (None for all)
        """
        if component:
            # Reset degradations for specific component
            if component in self.applied_degradations:
                del self.applied_degradations[component]
        else:
            # Reset all degradations
            self.applied_degradations = {}
    
    def _get_degradation_level(self, 
                             utilization: float,
                             severity: str) -> str:
        """
        Determine degradation level based on utilization and severity.
        
        Args:
            utilization: Resource utilization percentage (0.0-1.0)
            severity: Error severity
            
        Returns:
            Degradation level string
        """
        # Map severity to base level
        base_level = self._severity_to_level(severity)
        
        # Adjust based on utilization
        if utilization < 0.7:
            # Low utilization, use severity-based level
            return base_level
        elif utilization < 0.8:
            # Medium utilization, ensure at least LIGHT
            return DegradationLevel.MODERATE if base_level == DegradationLevel.LIGHT else base_level
        elif utilization < 0.9:
            # High utilization, ensure at least MODERATE
            return DegradationLevel.SEVERE if base_level in [DegradationLevel.LIGHT, DegradationLevel.MODERATE] else base_level
        else:
            # Very high utilization, use CRITICAL regardless of severity
            return DegradationLevel.CRITICAL
    
    def _severity_to_level(self, severity: str) -> str:
        """Map severity to degradation level."""
        severity = severity.lower()
        if severity == "warning":
            return DegradationLevel.LIGHT
        elif severity == "error":
            return DegradationLevel.MODERATE
        elif severity == "critical":
            return DegradationLevel.SEVERE
        elif severity == "fatal":
            return DegradationLevel.CRITICAL
        else:
            return DegradationLevel.LIGHT  # Default to light degradation
    
    # Degradation action implementations
    def _apply_batch_size_reduction(self, component: str, factor: float) -> Dict[str, Any]:
        """
        Reduce batch size for a component.
        
        Args:
            component: Component name
            factor: Reduction factor (0.0-1.0, where 0.0 means minimum batch size)
            
        Returns:
            Action details dictionary
        """
        # Calculate new batch size
        max_batch = self.config["max_batch_size"]
        min_batch = self.config["min_batch_size"]
        new_batch_size = max(min_batch, round(min_batch + factor * (max_batch - min_batch)))
        
        return {
            "strategy": DegradationStrategy.REDUCE_BATCH_SIZE,
            "component": component,
            "description": f"Reduced batch size to {new_batch_size}",
            "parameters": {
                "original_batch_size": max_batch,
                "new_batch_size": new_batch_size,
                "reduction_factor": factor
            }
        }
    
    def _reduce_precision(self, component: str, precision: str) -> Dict[str, Any]:
        """
        Reduce numerical precision for a component.
        
        Args:
            component: Component name
            precision: New precision level ("int2", "int4", "int8", "fp16")
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.REDUCE_PRECISION,
            "component": component,
            "description": f"Reduced precision to {precision}",
            "parameters": {
                "precision": precision
            }
        }
    
    def _reduce_model_size(self, component: str, factor: float) -> Dict[str, Any]:
        """
        Reduce model size for a component.
        
        Args:
            component: Component name
            factor: Size factor (0.0-1.0, where 0.0 means smallest possible model)
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.REDUCE_MODEL_SIZE,
            "component": component,
            "description": f"Reduced model size to {int(factor * 100)}% of original",
            "parameters": {
                "size_factor": factor
            }
        }
    
    def _simplify_pipeline(self, component: str) -> Dict[str, Any]:
        """
        Simplify processing pipeline for a component.
        
        Args:
            component: Component name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.SIMPLIFY_PIPELINE,
            "component": component,
            "description": "Simplified processing pipeline",
            "parameters": {
                "disable_parallel_processing": True,
                "disable_optional_stages": True
            }
        }
    
    def _disable_features(self, component: str, features: List[str]) -> Dict[str, Any]:
        """
        Disable specific features for a component.
        
        Args:
            component: Component name
            features: List of feature names to disable
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.DISABLE_FEATURES,
            "component": component,
            "description": f"Disabled features: {', '.join(features)}",
            "parameters": {
                "disabled_features": features
            }
        }
    
    def _apply_backend_fallback(self, component: str, backend: str) -> Dict[str, Any]:
        """
        Apply backend fallback for a component.
        
        Args:
            component: Component name
            backend: Fallback backend name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.FALLBACK_BACKEND,
            "component": component,
            "description": f"Switched to {backend} backend",
            "parameters": {
                "backend": backend
            }
        }
    
    def _reduce_context_length(self, component: str, factor: float) -> Dict[str, Any]:
        """
        Reduce context length for a component.
        
        Args:
            component: Component name
            factor: Reduction factor (0.0-1.0)
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.REDUCE_CONTEXT_LENGTH,
            "component": component,
            "description": f"Reduced context length to {int(factor * 100)}% of original",
            "parameters": {
                "context_length_factor": factor
            }
        }
    
    def _apply_cpu_fallback(self, component: str) -> Dict[str, Any]:
        """
        Apply CPU fallback for a component.
        
        Args:
            component: Component name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.CPU_FALLBACK,
            "component": component,
            "description": "Switched to CPU-based processing",
            "parameters": {
                "cpu_fallback": True,
                "optimize_for_cpu": True
            }
        }
    
    def _apply_retry(self, component: str, retry_count: int) -> Dict[str, Any]:
        """
        Apply simple retry for a component.
        
        Args:
            component: Component name
            retry_count: Current retry count
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": "retry",
            "component": component,
            "description": f"Retrying operation (attempt {retry_count + 1})",
            "parameters": {
                "retry_count": retry_count,
                "max_retries": self.config["max_retries"]
            }
        }
    
    def _apply_retry_with_backoff(self, 
                                component: str,
                                retry_count: int,
                                backoff_factor: float) -> Dict[str, Any]:
        """
        Apply retry with exponential backoff for a component.
        
        Args:
            component: Component name
            retry_count: Current retry count
            backoff_factor: Backoff multiplication factor
            
        Returns:
            Action details dictionary
        """
        # Calculate backoff delay
        delay = (backoff_factor ** retry_count) * 1000  # in milliseconds
        
        return {
            "strategy": DegradationStrategy.RETRY_WITH_BACKOFF,
            "component": component,
            "description": f"Retrying with backoff (attempt {retry_count + 1}, delay {delay:.0f}ms)",
            "parameters": {
                "retry_count": retry_count,
                "max_retries": self.config["max_retries"],
                "backoff_factor": backoff_factor,
                "delay_ms": delay
            }
        }
    
    def _disable_streaming(self, component: str) -> Dict[str, Any]:
        """
        Disable streaming mode for a component.
        
        Args:
            component: Component name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": DegradationStrategy.DISABLE_STREAMING,
            "component": component,
            "description": "Disabled streaming mode, switched to batched mode",
            "parameters": {
                "streaming_enabled": False,
                "use_batched_mode": True
            }
        }
    
    def _enable_synchronous_mode(self, component: str) -> Dict[str, Any]:
        """
        Enable synchronous mode for a component.
        
        Args:
            component: Component name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": "enable_synchronous_mode",
            "component": component,
            "description": "Enabled synchronous processing mode",
            "parameters": {
                "synchronous_mode": True,
                "async_enabled": False
            }
        }
    
    def _apply_memory_workaround(self, component: str, browser: str) -> Dict[str, Any]:
        """
        Apply browser-specific memory workaround.
        
        Args:
            component: Component name
            browser: Browser name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": "memory_workaround",
            "component": component,
            "description": f"Applied memory workaround for {browser}",
            "parameters": {
                "browser": browser,
                "use_chunking": True,
                "avoid_shared_memory": True
            }
        }
    
    def _reinitialize_component(self, component: str) -> Dict[str, Any]:
        """
        Reinitialize a component.
        
        Args:
            component: Component name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": "reinitialize",
            "component": component,
            "description": f"Reinitialized {component} component",
            "parameters": {
                "force_reinitialize": True,
                "clear_cache": True
            }
        }
    
    def _apply_most_reliable_fallback(self, component: str) -> Dict[str, Any]:
        """
        Apply most reliable fallback for a component.
        
        Args:
            component: Component name
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": "most_reliable_fallback",
            "component": component,
            "description": "Switched to most reliable fallback implementation",
            "parameters": {
                "use_wasm": True,
                "use_simplest_model": True,
                "prioritize_reliability": True
            }
        }
    
    def _extend_timeout(self, component: str, factor: float) -> Dict[str, Any]:
        """
        Extend timeout for a component.
        
        Args:
            component: Component name
            factor: Multiplication factor for timeout
            
        Returns:
            Action details dictionary
        """
        # Calculate new timeout
        original_timeout = self.config["timeout_ms"]
        new_timeout = original_timeout * factor
        
        return {
            "strategy": "extend_timeout",
            "component": component,
            "description": f"Extended timeout by {factor}x",
            "parameters": {
                "original_timeout_ms": original_timeout,
                "new_timeout_ms": new_timeout,
                "factor": factor
            }
        }
    
    def _limit_output_tokens(self, component: str, max_tokens: int) -> Dict[str, Any]:
        """
        Limit output token count for a component.
        
        Args:
            component: Component name
            max_tokens: Maximum number of tokens
            
        Returns:
            Action details dictionary
        """
        return {
            "strategy": "limit_output_tokens",
            "component": component,
            "description": f"Limited output to {max_tokens} tokens",
            "parameters": {
                "max_tokens": max_tokens,
                "enforce_strict_limit": True
            }
        }


# Apply a degradation strategy to a component
def apply_degradation_strategy(strategy: str, component: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply a specific degradation strategy to a component.
    
    Args:
        strategy: Degradation strategy name
        component: Component name
        parameters: Strategy parameters
        
    Returns:
        Result dictionary
    """
    # Map strategy to handler function name in GracefulDegradationManager
    strategy_map = {
        DegradationStrategy.REDUCE_BATCH_SIZE: "_apply_batch_size_reduction",
        DegradationStrategy.REDUCE_PRECISION: "_reduce_precision",
        DegradationStrategy.REDUCE_MODEL_SIZE: "_reduce_model_size",
        DegradationStrategy.SIMPLIFY_PIPELINE: "_simplify_pipeline",
        DegradationStrategy.DISABLE_FEATURES: "_disable_features",
        DegradationStrategy.FALLBACK_BACKEND: "_apply_backend_fallback",
        DegradationStrategy.REDUCE_CONTEXT_LENGTH: "_reduce_context_length",
        DegradationStrategy.CPU_FALLBACK: "_apply_cpu_fallback",
        DegradationStrategy.RETRY_WITH_BACKOFF: "_apply_retry_with_backoff",
        DegradationStrategy.DISABLE_STREAMING: "_disable_streaming"
    }
    
    # Create manager and apply strategy
    manager = GracefulDegradationManager()
    
    # Get handler method if available
    if strategy in strategy_map:
        handler_name = strategy_map[strategy]
        handler = getattr(manager, handler_name, None)
        
        if handler:
            # Extract parameters based on handler method signature
            # This is a simple implementation; in practice, you'd need to handle different parameter requirements
            if handler_name == "_apply_batch_size_reduction":
                factor = parameters.get("factor", 0.5)
                return handler(component, factor)
            elif handler_name == "_reduce_precision":
                precision = parameters.get("precision", "int8")
                return handler(component, precision)
            elif handler_name == "_reduce_model_size":
                factor = parameters.get("factor", 0.5)
                return handler(component, factor)
            elif handler_name == "_disable_features":
                features = parameters.get("features", [])
                return handler(component, features)
            elif handler_name == "_apply_backend_fallback":
                backend = parameters.get("backend", "cpu")
                return handler(component, backend)
            elif handler_name == "_reduce_context_length":
                factor = parameters.get("factor", 0.5)
                return handler(component, factor)
            elif handler_name == "_apply_retry_with_backoff":
                retry_count = parameters.get("retry_count", 1)
                backoff_factor = parameters.get("backoff_factor", 1.5)
                return handler(component, retry_count, backoff_factor)
            else:
                # Default case for strategies without additional parameters
                return handler(component)
    
    # Handle unsupported strategy
    return {
        "strategy": "unknown",
        "component": component,
        "description": f"Unsupported degradation strategy: {strategy}",
        "parameters": parameters,
        "error": "Unknown degradation strategy"
    }