"""
Cross-Component Error Propagation for Web Platform (August 2025)

This module implements standardized error propagation between different components
of the web platform framework, ensuring:
- Consistent error handling across components
- Error categorization and standardized telemetry
- Graceful degradation pathways for critical errors
- Cross-component communication for related errors

Usage:
    from fixed_web_platform.unified_framework.error_propagation import (
        ErrorPropagationManager, ErrorTelemetryCollector, register_handler
    )
    
    # Create error propagation manager
    error_manager = ErrorPropagationManager(
        components=["webgpu", "streaming", "quantization"],
        collect_telemetry=True
    )
    
    # Register component error handlers
    error_manager.register_handler("streaming", streaming_component.handle_error)
    
    # Propagate errors between components
    error_manager.propagate_error(error, source_component="webgpu")
"""

import os
import sys
import time
import logging
import traceback
import json
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Import error handling
from fixed_web_platform.unified_framework.error_handling import (
    ErrorHandler, WebPlatformError, RuntimeError, HardwareError
)

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("web_platform.error_propagation")

class ErrorCategory:
    """Enumeration of standardized error categories."""
    MEMORY = "memory"
    TIMEOUT = "timeout"
    CONNECTION = "connection"
    BROWSER_COMPATIBILITY = "browser_compatibility"
    HARDWARE = "hardware"
    CONFIGURATION = "configuration"
    RUNTIME = "runtime"
    UNKNOWN = "unknown"

class ErrorTelemetryCollector:
    """
    Collects and aggregates error telemetry data across components.
    
    Features:
    - Standardized error category tracking
    - Component-specific error frequency analysis
    - Error recovery success rate tracking
    - Temporal error pattern detection
    """
    
    def __init__(self, max_history: int = 100):
        """
        Initialize telemetry collector.
        
        Args:
            max_history: Maximum number of error records to retain
        """
        self.max_history = max_history
        self.error_history = []
        self.error_categories = {}
        self.component_errors = {}
        self.recovery_attempts = {"success": 0, "failure": 0}
        self.error_peaks = {}
        
    def record_error(self, error: Dict[str, Any]) -> None:
        """
        Record an error in telemetry.
        
        Args:
            error: Error data dictionary
        """
        # Add timestamp if not present
        if "timestamp" not in error:
            error["timestamp"] = time.time()
            
        # Add to history, maintaining max size
        self.error_history.append(error)
        if len(self.error_history) > self.max_history:
            self.error_history = self.error_history[-self.max_history:]
            
        # Track by category
        category = error.get("category", ErrorCategory.UNKNOWN)
        self.error_categories[category] = self.error_categories.get(category, 0) + 1
        
        # Track by component
        component = error.get("component", "unknown")
        if component not in self.component_errors:
            self.component_errors[component] = {}
        
        comp_category = f"{component}.{category}"
        self.component_errors[component][category] = self.component_errors[component].get(category, 0) + 1
        
        # Check for error peaks (multiple errors in short time window)
        current_time = error.get("timestamp", time.time())
        recent_window = [e for e in self.error_history 
                        if e.get("category") == category and 
                        current_time - e.get("timestamp", 0) < 60]  # 60 second window
        
        if len(recent_window) >= 3:  # 3+ errors of same type in 60 seconds
            if category not in self.error_peaks:
                self.error_peaks[category] = []
            
            self.error_peaks[category].append({
                "start_time": recent_window[0].get("timestamp"),
                "end_time": current_time,
                "count": len(recent_window),
                "components": list(set(e.get("component", "unknown") for e in recent_window))
            })
            
            # Log error peak detection
            logger.warning(f"Error peak detected: {len(recent_window)} {category} errors in {current_time - recent_window[0].get('timestamp'):.1f} seconds")
    
    def record_recovery_attempt(self, success: bool) -> None:
        """
        Record a recovery attempt outcome.
        
        Args:
            success: Whether recovery was successful
        """
        if success:
            self.recovery_attempts["success"] += 1
        else:
            self.recovery_attempts["failure"] += 1
    
    def get_summary(self) -> Dict[str, Any]:
        """
        Get a summary of telemetry data.
        
        Returns:
            Dictionary with telemetry summary
        """
        total_errors = len(self.error_history)
        total_recovery_attempts = self.recovery_attempts["success"] + self.recovery_attempts["failure"]
        recovery_success_rate = (self.recovery_attempts["success"] / total_recovery_attempts 
                               if total_recovery_attempts > 0 else 0)
        
        return {
            "total_errors": total_errors,
            "error_categories": self.error_categories,
            "component_errors": self.component_errors,
            "recovery_attempts": self.recovery_attempts,
            "recovery_success_rate": recovery_success_rate,
            "error_peaks": self.error_peaks,
            "most_common_category": max(self.error_categories.items(), key=lambda x: x[1])[0] if self.error_categories else None,
            "most_affected_component": max(self.component_errors.items(), key=lambda x: sum(x[1].values()))[0] if self.component_errors else None
        }
    
    def get_component_summary(self, component: str) -> Dict[str, Any]:
        """
        Get error summary for a specific component.
        
        Args:
            component: Component name
            
        Returns:
            Dictionary with component error summary
        """
        if component not in self.component_errors:
            return {"component": component, "errors": 0, "categories": {}}
            
        component_history = [e for e in self.error_history if e.get("component") == component]
        
        return {
            "component": component,
            "errors": len(component_history),
            "categories": self.component_errors[component],
            "recent_errors": component_history[-5:] if component_history else []
        }
    
    def clear(self) -> None:
        """Clear all telemetry data."""
        self.error_history = []
        self.error_categories = {}
        self.component_errors = {}
        self.recovery_attempts = {"success": 0, "failure": 0}
        self.error_peaks = {}


class ErrorPropagationManager:
    """
    Manages error propagation between components.
    
    Features:
    - Centralized error handling for multiple components
    - Standardized error propagation between components
    - Component-specific error handlers with prioritization
    - Error telemetry collection
    """
    
    def __init__(self, 
                components: List[str] = None,
                collect_telemetry: bool = True):
        """
        Initialize error propagation manager.
        
        Args:
            components: List of component names
            collect_telemetry: Whether to collect error telemetry
        """
        self.components = components or []
        self.handlers = {}
        self.error_handler = ErrorHandler(recovery_strategy="auto")
        self.collect_telemetry = collect_telemetry
        
        if collect_telemetry:
            self.telemetry = ErrorTelemetryCollector()
        
        # Set up component dependencies
        self.dependencies = {
            "streaming": ["webgpu", "quantization"],
            "webgpu": ["shader_registry"],
            "quantization": ["webgpu"],
            "progressive_loading": ["webgpu", "webnn"],
            "shader_registry": [],
            "webnn": []
        }
    
    def register_handler(self, component: str, handler: Callable) -> None:
        """
        Register an error handler for a component.
        
        Args:
            component: Component name
            handler: Error handler function
        """
        if component not in self.components:
            self.components.append(component)
            
        self.handlers[component] = handler
        logger.debug(f"Registered error handler for component: {component}")
    
    def categorize_error(self, error: Union[Exception, Dict[str, Any]]) -> str:
        """
        Categorize an error based on its characteristics.
        
        Args:
            error: Error object or dictionary
            
        Returns:
            Error category string
        """
        # Extract error message
        if isinstance(error, Exception):
            error_message = str(error).lower()
            error_type = type(error).__name__
        else:
            error_message = error.get("message", "").lower()
            error_type = error.get("type", "unknown")
        
        # Categorize based on message and type
        if "memory" in error_message or error_type == "MemoryError" or "out of memory" in error_message:
            return ErrorCategory.MEMORY
            
        elif "timeout" in error_message or "deadline" in error_message or "time limit" in error_message:
            return ErrorCategory.TIMEOUT
            
        elif "connection" in error_message or "network" in error_message or "websocket" in error_message:
            return ErrorCategory.CONNECTION
            
        elif "browser" in error_message or "compatibility" in error_message or "not supported" in error_message:
            return ErrorCategory.BROWSER_COMPATIBILITY
            
        elif "hardware" in error_message or "gpu" in error_message or "device" in error_message:
            return ErrorCategory.HARDWARE
            
        elif "configuration" in error_message or "settings" in error_message or "parameter" in error_message:
            return ErrorCategory.CONFIGURATION
            
        else:
            return ErrorCategory.RUNTIME
    
    def propagate_error(self, 
                       error: Union[Exception, Dict[str, Any]],
                       source_component: str,
                       context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Propagate an error to affected components.
        
        Args:
            error: Error object or dictionary
            source_component: Component where error originated
            context: Optional context information
            
        Returns:
            Error handling result dictionary
        """
        context = context or {}
        
        # Create standardized error record
        if isinstance(error, Exception):
            # Convert to web platform error if needed
            if not isinstance(error, WebPlatformError):
                error = self.error_handler._convert_exception(error, context)
                
            error_record = {
                "type": error.__class__.__name__,
                "message": str(error),
                "details": getattr(error, "details", {}),
                "severity": getattr(error, "severity", "error"),
                "timestamp": time.time(),
                "component": source_component,
                "category": self.categorize_error(error),
                "traceback": traceback.format_exc(),
                "context": context
            }
        else:
            # Already a dictionary
            error_record = error.copy()
            error_record.setdefault("timestamp", time.time())
            error_record.setdefault("component", source_component)
            error_record.setdefault("category", self.categorize_error(error))
            error_record.setdefault("context", context)
        
        # Record in telemetry
        if self.collect_telemetry:
            self.telemetry.record_error(error_record)
        
        # Determine affected components based on dependencies
        affected_components = self._get_affected_components(source_component)
        
        # Handle in source component first
        source_result = self._handle_in_component(error_record, source_component)
        
        # If source component handled successfully, we're done
        if source_result.get("handled", False):
            if self.collect_telemetry:
                self.telemetry.record_recovery_attempt(True)
            return {
                "handled": True,
                "component": source_component,
                "action": source_result.get("action", "unknown")
            }
        
        # Try handling in affected components
        for component in affected_components:
            component_result = self._handle_in_component(error_record, component)
            if component_result.get("handled", False):
                if self.collect_telemetry:
                    self.telemetry.record_recovery_attempt(True)
                return {
                    "handled": True,
                    "component": component,
                    "action": component_result.get("action", "unknown")
                }
        
        # If we got here, no component could handle the error
        if self.collect_telemetry:
            self.telemetry.record_recovery_attempt(False)
            
        # For critical errors, implement graceful degradation
        if error_record.get("severity", "error") == "error":
            degradation_result = self._implement_graceful_degradation(error_record)
            if degradation_result.get("degraded", False):
                return {
                    "handled": True,
                    "degraded": True,
                    "action": degradation_result.get("action", "unknown")
                }
        
        return {
            "handled": False,
            "error": error_record
        }
    
    def _get_affected_components(self, source_component: str) -> List[str]:
        """
        Get components affected by an error in the source component.
        
        Args:
            source_component: Component where error originated
            
        Returns:
            List of affected component names
        """
        affected = []
        
        # Add components that depend on the source component
        for component, dependencies in self.dependencies.items():
            if source_component in dependencies:
                affected.append(component)
        
        return affected
    
    def _handle_in_component(self, 
                           error_record: Dict[str, Any],
                           component: str) -> Dict[str, Any]:
        """
        Handle error in a specific component.
        
        Args:
            error_record: Error record dictionary
            component: Component name
            
        Returns:
            Handling result dictionary
        """
        # Skip if component has no handler
        if component not in self.handlers:
            return {"handled": False}
        
        # Create component-specific context
        component_context = {
            "error_category": error_record.get("category"),
            "source_component": error_record.get("component"),
            "severity": error_record.get("severity", "error"),
            "timestamp": error_record.get("timestamp")
        }
        
        # Add original error details
        if "details" in error_record:
            component_context["error_details"] = error_record["details"]
        
        try:
            # Call component handler
            handler = self.handlers[component]
            result = handler(error_record, component_context)
            
            # Return if handler provided result
            if isinstance(result, dict):
                result.setdefault("handled", False)
                return result
                
            # If handler returned True/False, construct default result
            if isinstance(result, bool):
                return {"handled": result, "action": "component_handler"}
                
            # Default to not handled
            return {"handled": False}
            
        except Exception as e:
            # Handler raised an exception
            logger.error(f"Error in component handler for {component}: {e}")
            return {"handled": False, "handler_error": str(e)}
    
    def _implement_graceful_degradation(self, 
                                     error_record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Implement graceful degradation for critical errors.
        
        Args:
            error_record: Error record dictionary
            
        Returns:
            Degradation result dictionary
        """
        category = error_record.get("category")
        source_component = error_record.get("component")
        
        # Choose degradation strategy based on error category
        if category == ErrorCategory.MEMORY:
            return self._handle_memory_degradation(source_component)
            
        elif category == ErrorCategory.TIMEOUT:
            return self._handle_timeout_degradation(source_component)
            
        elif category == ErrorCategory.CONNECTION:
            return self._handle_connection_degradation(source_component)
            
        elif category == ErrorCategory.BROWSER_COMPATIBILITY:
            return self._handle_compatibility_degradation(source_component)
            
        elif category == ErrorCategory.HARDWARE:
            return self._handle_hardware_degradation(source_component)
            
        # Default to no degradation for other categories
        return {"degraded": False}
    
    def _handle_memory_degradation(self, component: str) -> Dict[str, Any]:
        """
        Handle memory-related degradation.
        
        Args:
            component: Affected component
            
        Returns:
            Degradation result dictionary
        """
        if component == "streaming":
            # For streaming, reduce batch size and precision
            return {
                "degraded": True,
                "action": "reduce_resource_usage",
                "changes": ["reduced_batch_size", "reduced_precision"]
            }
        elif component == "webgpu":
            # For WebGPU, fall back to WebNN or WASM
            return {
                "degraded": True,
                "action": "fallback_to_alternate_backend",
                "fallback": "webnn" if "webnn" in self.components else "wasm"
            }
        else:
            # Generic memory reduction
            return {
                "degraded": True,
                "action": "reduce_memory_usage"
            }
    
    def _handle_timeout_degradation(self, component: str) -> Dict[str, Any]:
        """
        Handle timeout-related degradation.
        
        Args:
            component: Affected component
            
        Returns:
            Degradation result dictionary
        """
        if component == "streaming":
            # For streaming, reduce generation parameters and optimizations
            return {
                "degraded": True,
                "action": "simplify_generation",
                "changes": ["reduced_max_tokens", "disabled_optimizations"]
            }
        else:
            # Generic timeout handling
            return {
                "degraded": True,
                "action": "extend_timeouts",
                "multiplier": 1.5
            }
    
    def _handle_connection_degradation(self, component: str) -> Dict[str, Any]:
        """
        Handle connection-related degradation.
        
        Args:
            component: Affected component
            
        Returns:
            Degradation result dictionary
        """
        if component == "streaming":
            # For streaming, switch to non-streaming mode
            return {
                "degraded": True,
                "action": "disable_streaming",
                "changes": ["switched_to_batch_mode"]
            }
        else:
            # Generic connection handling with retry and backoff
            return {
                "degraded": True,
                "action": "implement_retry_with_backoff",
                "backoff_factor": 1.5,
                "max_retries": 3
            }
    
    def _handle_compatibility_degradation(self, component: str) -> Dict[str, Any]:
        """
        Handle browser compatibility degradation.
        
        Args:
            component: Affected component
            
        Returns:
            Degradation result dictionary
        """
        # Fall back to most widely supported implementation
        return {
            "degraded": True,
            "action": "use_compatibility_mode",
            "changes": ["disabled_advanced_features", "using_fallback_implementation"]
        }
    
    def _handle_hardware_degradation(self, component: str) -> Dict[str, Any]:
        """
        Handle hardware-related degradation.
        
        Args:
            component: Affected component
            
        Returns:
            Degradation result dictionary
        """
        if component == "webgpu":
            # Fall back to CPU implementation
            return {
                "degraded": True,
                "action": "fallback_to_cpu",
                "changes": ["disabled_gpu_features"]
            }
        else:
            # Generic hardware degradation
            return {
                "degraded": True,
                "action": "reduce_hardware_requirements",
                "changes": ["lowered_precision", "simplified_model"]
            }
    
    def get_telemetry_summary(self) -> Dict[str, Any]:
        """
        Get error telemetry summary.
        
        Returns:
            Dictionary with telemetry summary
        """
        if not self.collect_telemetry:
            return {"telemetry_disabled": True}
            
        return self.telemetry.get_summary()
    
    def get_component_telemetry(self, component: str) -> Dict[str, Any]:
        """
        Get telemetry for a specific component.
        
        Args:
            component: Component name
            
        Returns:
            Dictionary with component telemetry
        """
        if not self.collect_telemetry:
            return {"telemetry_disabled": True}
            
        return self.telemetry.get_component_summary(component)


# Register a component handler with the manager
def register_handler(manager: ErrorPropagationManager, 
                   component: str, 
                   handler: Callable) -> None:
    """
    Register a component error handler with the propagation manager.
    
    Args:
        manager: ErrorPropagationManager instance
        component: Component name
        handler: Error handler function
    """
    manager.register_handler(component, handler)


# Create standardized error object for propagation
def create_error_object(error_type: str,
                       message: str,
                       component: str,
                       details: Optional[Dict[str, Any]] = None,
                       severity: str = "error") -> Dict[str, Any]:
    """
    Create a standardized error object for propagation.
    
    Args:
        error_type: Error type name
        message: Error message
        component: Component where error occurred
        details: Optional error details
        severity: Error severity level
        
    Returns:
        Error object dictionary
    """
    category = None
    
    # Determine category based on error type and message
    if "memory" in error_type.lower() or "memory" in message.lower():
        category = ErrorCategory.MEMORY
    elif "timeout" in error_type.lower() or "timeout" in message.lower():
        category = ErrorCategory.TIMEOUT
    elif "connection" in error_type.lower() or "connection" in message.lower():
        category = ErrorCategory.CONNECTION
    elif "browser" in error_type.lower() or "compatibility" in message.lower():
        category = ErrorCategory.BROWSER_COMPATIBILITY
    elif "hardware" in error_type.lower() or "gpu" in message.lower():
        category = ErrorCategory.HARDWARE
    elif "config" in error_type.lower():
        category = ErrorCategory.CONFIGURATION
    else:
        category = ErrorCategory.RUNTIME
    
    return {
        "type": error_type,
        "message": message,
        "component": component,
        "category": category,
        "severity": severity,
        "details": details or {},
        "timestamp": time.time()
    }


# Example handler functions for different components
def streaming_error_handler(error, context):
    """Example error handler for streaming component."""
    category = error.get("category")
    
    if category == ErrorCategory.MEMORY:
        # Handle memory pressure in streaming component
        return {
            "handled": True,
            "action": "reduced_batch_size_and_precision"
        }
    elif category == ErrorCategory.TIMEOUT:
        # Handle timeout in streaming component
        return {
            "handled": True,
            "action": "simplified_generation_parameters"
        }
    
    # Couldn't handle this error
    return {"handled": False}


def webgpu_error_handler(error, context):
    """Example error handler for WebGPU component."""
    category = error.get("category")
    
    if category == ErrorCategory.MEMORY:
        # Handle memory issues in WebGPU
        return {
            "handled": True,
            "action": "reduced_model_complexity"
        }
    elif category == ErrorCategory.HARDWARE:
        # Handle hardware issues in WebGPU
        return {
            "handled": True,
            "action": "fallback_to_webnn"
        }
    
    # Couldn't handle this error
    return {"handled": False}