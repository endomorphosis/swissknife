"""
Comprehensive Error Handling Framework (March 2025)

This module provides a unified error handling framework for IPFS Accelerate,
designed to standardize error handling across all project components.

Key features:
- Hierarchical error classification with error categories
- Standardized error reporting with context enrichment
- Comprehensive logging with appropriate severity levels 
- Error recovery and retry mechanisms
- Dependency validation
- Easy-to-use decorators for both sync and async functions

Usage example:
    from fixed_web_platform.unified_framework.error_handling import (
        ErrorHandler, handle_errors, handle_async_errors, with_retry,
        validate_dependencies, ErrorCategories
    )

    # Using error handler directly
    error_handler = ErrorHandler()
    try:
        # Code that might raise an exception
        result = perform_operation()
    except Exception as e:
        # Handle the error with consistent formatting
        error_response = error_handler.handle_error(e, {"operation": "example"})
        
    # Using decorators for automatic error handling
    @handle_errors  # For synchronous functions
    def process_data(data):
        # Function body
        
    @handle_async_errors  # For asynchronous functions  
    async def fetch_data(url):
        # Async function body
        
    # Using retry decorator for automatic retries
    @with_retry(max_retries=3, initial_delay=1.0, backoff_factor=2.0)
    async def connect_to_service(service_url):
        # Function that might fail temporarily
        
    # Validate dependencies before execution
    @validate_dependencies("websockets", "selenium")
    def initialize_browser():
        # Function that requires specific dependencies
"""

import os
import sys
import json
import time
import logging
import traceback
from typing import Dict, List, Optional, Union, Any, Callable, TypeVar, Awaitable
import functools
import inspect

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Type definitions for decorator functions
F = TypeVar('F', bound=Callable[..., Any])
AsyncF = TypeVar('AsyncF', bound=Callable[..., Awaitable[Any]])

class ErrorCategories:
    """Standard error categories for unified error handling."""
    NETWORK = "network_error"
    TIMEOUT = "timeout_error"
    INPUT = "input_error"
    RESOURCE = "resource_error"
    IO = "io_error"
    DATA = "data_error"
    DEPENDENCY = "dependency_error"
    INTERNAL = "internal_error"
    VALIDATION = "validation_error"
    PERMISSION = "permission_error"
    NOT_FOUND = "not_found_error"
    INITIALIZATION = "initialization_error"
    HARDWARE = "hardware_error"
    UNKNOWN = "unknown_error"

class ErrorHandler:
    """
    Standardized error handling utilities for the entire framework.
    
    This class provides consistent error handling, logging, categorization,
    and reporting across all components. It helps create structured error 
    responses with detailed context information for better diagnostics.
    """
    
    # Categorization mappings
    ERROR_TYPE_TO_CATEGORY = {
        # Network errors
        "ConnectionError": ErrorCategories.NETWORK,
        "ConnectionRefusedError": ErrorCategories.NETWORK,
        "ConnectionResetError": ErrorCategories.NETWORK,
        "ConnectionAbortedError": ErrorCategories.NETWORK,
        "ConnectionClosedError": ErrorCategories.NETWORK,
        "ConnectionClosedOK": ErrorCategories.NETWORK,
        "WebSocketException": ErrorCategories.NETWORK,
        
        # Timeout errors
        "TimeoutError": ErrorCategories.TIMEOUT,
        "asyncio.TimeoutError": ErrorCategories.TIMEOUT,
        
        # Input errors
        "ValueError": ErrorCategories.INPUT,
        "TypeError": ErrorCategories.INPUT,
        "KeyError": ErrorCategories.INPUT,
        "IndexError": ErrorCategories.INPUT,
        "AttributeError": ErrorCategories.INPUT,
        
        # Validation errors
        "AssertionError": ErrorCategories.VALIDATION,
        "ValidationError": ErrorCategories.VALIDATION,
        
        # Resource errors
        "MemoryError": ErrorCategories.RESOURCE,
        "ResourceWarning": ErrorCategories.RESOURCE,
        "ResourceError": ErrorCategories.RESOURCE,
        
        # Permission errors
        "PermissionError": ErrorCategories.PERMISSION,
        "AccessDeniedError": ErrorCategories.PERMISSION,
        
        # IO errors
        "IOError": ErrorCategories.IO,
        "FileNotFoundError": ErrorCategories.NOT_FOUND,
        "NotADirectoryError": ErrorCategories.IO,
        "IsADirectoryError": ErrorCategories.IO,
        
        # Data errors
        "JSONDecodeError": ErrorCategories.DATA,
        "UnicodeDecodeError": ErrorCategories.DATA,
        "UnicodeEncodeError": ErrorCategories.DATA,
        
        # Dependency errors
        "ImportError": ErrorCategories.DEPENDENCY,
        "ModuleNotFoundError": ErrorCategories.DEPENDENCY,
        
        # Hardware errors
        "CudaError": ErrorCategories.HARDWARE,
        "CudaOutOfMemoryError": ErrorCategories.HARDWARE,
        "HardwareError": ErrorCategories.HARDWARE,
        
        # Internal errors
        "RuntimeError": ErrorCategories.INTERNAL,
        "SystemError": ErrorCategories.INTERNAL,
        "NotImplementedError": ErrorCategories.INTERNAL,
    }
    
    # Recoverable error categories
    RECOVERABLE_CATEGORIES = {
        ErrorCategories.NETWORK,
        ErrorCategories.TIMEOUT,
        ErrorCategories.DATA,
        ErrorCategories.RESOURCE
    }
    
    # Additional recoverable error types
    RECOVERABLE_ERROR_TYPES = {
        "ConnectionResetError",
        "ConnectionRefusedError",
        "TimeoutError",
        "JSONDecodeError"
    }
    
    # Critical error categories that should trigger immediate attention
    CRITICAL_CATEGORIES = {
        ErrorCategories.HARDWARE,
        ErrorCategories.INTERNAL,
        ErrorCategories.PERMISSION
    }
    
    @staticmethod
    def format_error(error: Exception, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Format an exception into a standardized error object with rich context.
        
        Args:
            error: The exception to format
            context: Additional context information
            
        Returns:
            Dictionary with standard error format including stack trace and context
        """
        error_obj = {
            "error_type": error.__class__.__name__,
            "error_message": str(error),
            "timestamp": int(time.time() * 1000),
            "error_category": ErrorHandler.categorize_error(error),
            "recoverable": ErrorHandler.is_recoverable(error)
        }
        
        # Add stack trace if available
        if hasattr(error, "__traceback__") and error.__traceback__:
            stack_trace = traceback.format_exception(type(error), error, error.__traceback__)
            error_obj["stack_trace"] = "".join(stack_trace)
            
            # Extract the most relevant part of the stack trace (file and line where error occurred)
            try:
                tb = traceback.extract_tb(error.__traceback__)
                if tb:
                    last_frame = tb[-1]
                    error_obj["source_file"] = last_frame.filename
                    error_obj["source_line"] = last_frame.lineno
                    error_obj["source_function"] = last_frame.name
            except Exception:
                pass
            
        # Add context if provided
        if context:
            error_obj["context"] = context
            
        return error_obj
    
    @staticmethod
    def handle_error(error: Exception, context: Optional[Dict[str, Any]] = None, 
                    log_level: str = "error") -> Dict[str, Any]:
        """
        Handle an exception with standardized logging and formatting.
        
        This method provides consistent error handling with context-enriched
        logging at the appropriate level and returns a standardized error object.
        
        Args:
            error: The exception to handle
            context: Additional context information
            log_level: Logging level to use
            
        Returns:
            Dictionary with standard error format
        """
        error_obj = ErrorHandler.format_error(error, context)
        
        # Determine if this is a critical error that needs immediate attention
        category = error_obj["error_category"]
        if category in ErrorHandler.CRITICAL_CATEGORIES and log_level != "critical":
            log_level = "critical"
            
        # Construct a detailed error message with context
        error_message = f"{error_obj['error_type']}: {error_obj['error_message']}"
        
        # Add source information if available
        if "source_file" in error_obj:
            source_info = f"{error_obj['source_file']}:{error_obj['source_line']} in {error_obj['source_function']}"
            error_message += f" [{source_info}]"
            
        # Add context information
        if context:
            # Format context for readability, truncating long values
            context_items = []
            for k, v in context.items():
                # Truncate long values
                if isinstance(v, str) and len(v) > 50:
                    v_str = f"{v[:50]}..."
                else:
                    v_str = str(v)
                context_items.append(f"{k}={v_str}")
                
            context_str = ", ".join(context_items)
            error_message += f" [Context: {context_str}]"
        
        # Log with the appropriate level
        if log_level == "critical":
            logger.critical(error_message)
        elif log_level == "error":
            logger.error(error_message)
        elif log_level == "warning":
            logger.warning(error_message)
        elif log_level == "info":
            logger.info(error_message)
        elif log_level == "debug":
            logger.debug(error_message)
            
        return error_obj
        
    @staticmethod
    def categorize_error(error: Exception) -> str:
        """
        Categorize an exception into standard error categories.
        
        Args:
            error: The exception to categorize
            
        Returns:
            Error category string
        """
        error_type = type(error).__name__
        
        # Look up in mapping
        category = ErrorHandler.ERROR_TYPE_TO_CATEGORY.get(error_type)
        if category:
            return category
        
        # Try to categorize based on class hierarchy
        error_class = type(error)
        
        # Check for custom exceptions that might inherit from standard ones
        if issubclass(error_class, ConnectionError):
            return ErrorCategories.NETWORK
        elif issubclass(error_class, TimeoutError):
            return ErrorCategories.TIMEOUT
        elif issubclass(error_class, (ValueError, TypeError, KeyError, IndexError)):
            return ErrorCategories.INPUT
        elif issubclass(error_class, (MemoryError, ResourceWarning)):
            return ErrorCategories.RESOURCE
        elif issubclass(error_class, PermissionError):
            return ErrorCategories.PERMISSION
        elif issubclass(error_class, (IOError, OSError)):
            return ErrorCategories.IO
        elif issubclass(error_class, (RuntimeError, SystemError)):
            return ErrorCategories.INTERNAL
        elif issubclass(error_class, ImportError):
            return ErrorCategories.DEPENDENCY
            
        # Default
        return ErrorCategories.UNKNOWN
        
    @staticmethod
    def is_recoverable(error: Exception) -> bool:
        """
        Determine if an error is potentially recoverable.
        
        Args:
            error: The exception to check
            
        Returns:
            True if potentially recoverable, False otherwise
        """
        category = ErrorHandler.categorize_error(error)
        
        # Check if in recoverable categories
        if category in ErrorHandler.RECOVERABLE_CATEGORIES:
            return True
            
        # Check specific error types
        error_type = type(error).__name__
        if error_type in ErrorHandler.RECOVERABLE_ERROR_TYPES:
            return True
            
        return False
    
    @staticmethod
    def create_error_response(error: Exception, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Create a standardized error response suitable for API returns.
        
        Args:
            error: The exception that occurred
            context: Additional context information
            
        Returns:
            Dictionary with standardized API error response
        """
        error_obj = ErrorHandler.handle_error(error, context)
        
        # Create the API response with only necessary fields
        response = {
            "status": "error",
            "error": str(error),
            "error_type": error_obj["error_type"],
            "error_category": error_obj["error_category"],
            "recoverable": error_obj["recoverable"],
            "timestamp": error_obj["timestamp"]
        }
        
        # Add source information if available
        if "source_file" in error_obj:
            response["error_location"] = {
                "file": error_obj["source_file"],
                "line": error_obj["source_line"],
                "function": error_obj["source_function"]
            }
            
        return response
    
    @staticmethod
    def can_retry(error: Exception, retry_attempted: int, max_retries: int) -> bool:
        """
        Determine if an operation should be retried after an error.
        
        Args:
            error: The exception that occurred
            retry_attempted: Number of retries already attempted
            max_retries: Maximum number of retries allowed
            
        Returns:
            True if the operation should be retried, False otherwise
        """
        if retry_attempted >= max_retries:
            return False
            
        return ErrorHandler.is_recoverable(error)
    
    @staticmethod
    def should_log_traceback(error: Exception) -> bool:
        """
        Determine if full traceback should be logged for this error.
        
        Args:
            error: The exception to check
            
        Returns:
            True if full traceback should be logged
        """
        category = ErrorHandler.categorize_error(error)
        
        # Always log full traceback for critical errors
        if category in ErrorHandler.CRITICAL_CATEGORIES:
            return True
            
        # Don't log full traceback for recoverable errors
        if ErrorHandler.is_recoverable(error):
            return False
            
        # Default to True for most errors
        return True
    
    @staticmethod
    def get_recovery_strategy(error: Exception) -> Dict[str, Any]:
        """
        Get a recovery strategy for a specific error.
        
        Args:
            error: The exception to create a recovery strategy for
            
        Returns:
            Dictionary with recovery strategy information
        """
        error_type = type(error).__name__
        category = ErrorHandler.categorize_error(error)
        
        # Default recovery strategy
        strategy = {
            "should_retry": ErrorHandler.is_recoverable(error),
            "retry_delay": 1.0,  # seconds
            "max_retries": 3,
            "should_backoff": True,
            "strategy_type": "generic"
        }
        
        # Custom strategies based on error category
        if category == ErrorCategories.NETWORK:
            strategy.update({
                "retry_delay": 2.0,
                "max_retries": 5,
                "strategy_type": "network_retry",
                "strategy_description": "Wait and retry with exponential backoff"
            })
        
        elif category == ErrorCategories.TIMEOUT:
            strategy.update({
                "retry_delay": 3.0,
                "max_retries": 3,
                "strategy_type": "timeout_retry",
                "strategy_description": "Retry with increased timeout"
            })
            
        elif category == ErrorCategories.RESOURCE:
            strategy.update({
                "retry_delay": 5.0,
                "max_retries": 2,
                "strategy_type": "resource_cleanup",
                "strategy_description": "Free resources and retry"
            })
            
        elif category == ErrorCategories.DATA:
            strategy.update({
                "should_retry": True,
                "retry_delay": 0.5,
                "max_retries": 2,
                "strategy_type": "data_validation",
                "strategy_description": "Validate data and retry"
            })
            
        elif category == ErrorCategories.PERMISSION:
            strategy.update({
                "should_retry": False,
                "strategy_type": "permission_escalation",
                "strategy_description": "Requires manual intervention"
            })
            
        # Custom strategies based on specific error types
        if error_type in ("ConnectionResetError", "ConnectionRefusedError"):
            strategy.update({
                "retry_delay": 3.0,
                "max_retries": 5,
                "strategy_type": "connection_reset_retry",
                "strategy_description": "Reestablish connection and retry"
            })
            
        elif error_type == "JSONDecodeError":
            strategy.update({
                "retry_delay": 0.5,
                "max_retries": 2,
                "strategy_type": "json_validation",
                "strategy_description": "Validate JSON and retry"
            })
            
        return strategy

# Decorators for standardized error handling

def handle_errors(func: F) -> F:
    """
    Decorator to handle errors in a standard way for synchronous functions.
    
    Args:
        func: Function to decorate
        
    Returns:
        Wrapped function with standardized error handling
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            # Extract context from function args if possible
            context = _extract_function_context(func, args, kwargs)
            
            # Handle and log error
            error_obj = ErrorHandler.handle_error(e, context)
            
            # Return standardized error response
            return ErrorHandler.create_error_response(e, context)
    
    return wrapper

def handle_async_errors(func: AsyncF) -> AsyncF:
    """
    Decorator to handle errors in a standard way for asynchronous functions.
    
    Args:
        func: Async function to decorate
        
    Returns:
        Wrapped async function with standardized error handling
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            # Extract context from function args if possible
            context = _extract_function_context(func, args, kwargs)
            
            # Handle and log error
            error_obj = ErrorHandler.handle_error(e, context)
            
            # Return standardized error response
            return ErrorHandler.create_error_response(e, context)
    
    return wrapper

def with_retry(max_retries: int = 3, initial_delay: float = 1.0, 
              backoff_factor: float = 2.0, log_retries: bool = True):
    """
    Decorator to add retry capability with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay between retries in seconds
        backoff_factor: Factor to increase delay between retries
        log_retries: Whether to log retry attempts
        
    Returns:
        Decorator function for adding retry capability
    """
    def decorator(func):
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                last_error = None
                delay = initial_delay
                
                for retry in range(max_retries + 1):
                    try:
                        if retry > 0 and log_retries:
                            logger.info(f"Retry {retry}/{max_retries} for {func.__name__} after {delay:.2f}s delay")
                    
                        if retry > 0:
                            import asyncio
                            await asyncio.sleep(delay)
                            delay *= backoff_factor
                            
                        return await func(*args, **kwargs)
                        
                    except Exception as e:
                        last_error = e
                        
                        # Check if we should retry this error
                        if not ErrorHandler.is_recoverable(e) or retry >= max_retries:
                            # Log final error with context
                            context = _extract_function_context(func, args, kwargs)
                            context["retry_attempt"] = retry
                            ErrorHandler.handle_error(e, context)
                            break
                        
                        if log_retries:
                            logger.warning(f"Error in {func.__name__} (attempt {retry+1}/{max_retries+1}): {e}")
                            
                # If we got here, all retries failed
                if last_error:
                    context = _extract_function_context(func, args, kwargs)
                    context["retries_attempted"] = max_retries
                    return ErrorHandler.create_error_response(last_error, context)
                    
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                last_error = None
                delay = initial_delay
                
                for retry in range(max_retries + 1):
                    try:
                        if retry > 0 and log_retries:
                            logger.info(f"Retry {retry}/{max_retries} for {func.__name__} after {delay:.2f}s delay")
                    
                        if retry > 0:
                            import time
                            time.sleep(delay)
                            delay *= backoff_factor
                            
                        return func(*args, **kwargs)
                        
                    except Exception as e:
                        last_error = e
                        
                        # Check if we should retry this error
                        if not ErrorHandler.is_recoverable(e) or retry >= max_retries:
                            # Log final error with context
                            context = _extract_function_context(func, args, kwargs)
                            context["retry_attempt"] = retry
                            ErrorHandler.handle_error(e, context)
                            break
                        
                        if log_retries:
                            logger.warning(f"Error in {func.__name__} (attempt {retry+1}/{max_retries+1}): {e}")
                            
                # If we got here, all retries failed
                if last_error:
                    context = _extract_function_context(func, args, kwargs)
                    context["retries_attempted"] = max_retries
                    return ErrorHandler.create_error_response(last_error, context)
                    
            return sync_wrapper
            
    return decorator

def validate_dependencies(*dependencies):
    """
    Decorator to validate that required dependencies are available.
    
    Args:
        *dependencies: List of dependency module names to check
        
    Returns:
        Decorator function for dependency validation
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            missing = []
            
            for dep in dependencies:
                try:
                    __import__(dep)
                except ImportError:
                    missing.append(dep)
            
            if missing:
                error_msg = f"Missing required dependencies: {', '.join(missing)}"
                logger.error(error_msg)
                return {
                    "status": "error",
                    "error": error_msg,
                    "error_type": "DependencyError",
                    "error_category": ErrorCategories.DEPENDENCY,
                    "recoverable": False,
                    "timestamp": int(time.time() * 1000),
                    "missing_dependencies": missing
                }
                
            return func(*args, **kwargs)
        
        return wrapper
    
    return decorator

def _extract_function_context(func, args, kwargs):
    """Helper function to extract context information from function call."""
    context = {
        "function": func.__name__,
        "module": func.__module__
    }
    
    # Add class information if this is a method
    if len(args) > 0 and hasattr(args[0], "__class__"):
        context["class"] = args[0].__class__.__name__
    
    # Add argument information (first arg is self if method, so skip)
    if len(args) > (1 if "class" in context else 0):
        # Create safe string representation of arguments, truncating if too long
        try:
            start_idx = 1 if "class" in context else 0
            arg_strs = []
            for i, arg in enumerate(args[start_idx:]):
                # Use a safe representation that truncates large objects
                arg_strs.append(_safe_repr(arg, max_length=60))
            
            context["args"] = arg_strs
        except:
            context["args"] = "[Error serializing args]"
    
    # Add keyword argument information
    if kwargs:
        try:
            # Create dictionary with safe string representations
            kwarg_dict = {}
            for k, v in kwargs.items():
                kwarg_dict[k] = _safe_repr(v, max_length=60)
            
            context["kwargs"] = kwarg_dict
        except:
            context["kwargs"] = "[Error serializing kwargs]"
    
    return context

def _safe_repr(obj, max_length=100):
    """Create a safe string representation of an object, truncating if too long."""
    try:
        if obj is None:
            return "None"
        elif isinstance(obj, (str, int, float, bool)):
            return repr(obj)
        elif isinstance(obj, (list, tuple)):
            if len(obj) > 3:
                return f"{type(obj).__name__} with {len(obj)} items"
            return repr(obj)[:max_length] + ("..." if len(repr(obj)) > max_length else "")
        elif isinstance(obj, dict):
            if len(obj) > 3:
                return f"dict with {len(obj)} keys"
            return repr(obj)[:max_length] + ("..." if len(repr(obj)) > max_length else "")
        else:
            return f"{type(obj).__name__} object"
    except:
        return "[Error creating representation]"

# Example usage for documentation
if __name__ == "__main__":
    # Example 1: Using error handler directly
    error_handler = ErrorHandler()
    try:
        # Code that raises an exception
        result = 1 / 0
    except Exception as e:
        # Handle the error
        error_response = error_handler.handle_error(e, {"operation": "division_example"})
        print(f"Error response: {json.dumps(error_response, indent=2)}")
    
    # Example 2: Using decorators
    @handle_errors
    def example_function(a, b):
        return a / b
    
    result = example_function(10, 0)
    print(f"Function result with error handling: {result}")
    
    # Example 3: Testing error categorization
    for error_type in [ValueError, TypeError, ConnectionError, TimeoutError]:
        try:
            raise error_type("Test error")
        except Exception as e:
            category = ErrorHandler.categorize_error(e)
            print(f"Error {error_type.__name__} is categorized as: {category}")