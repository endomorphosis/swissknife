#!/usr/bin/env python3
"""
Input Validation Framework for IPFS Accelerate Python Framework

This module provides standardized input validation across the framework, including:
- Parameter validation at function boundaries
- Type checking for function arguments
- Parameter constraints and validation
- Clear error messages for invalid inputs
- Validation decorators for common patterns
"""

import os
import re
import sys
import inspect
import logging
import functools
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, TypeVar, Union, cast, get_type_hints

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Set log level from environment variable if specified
LOG_LEVEL = os.environ.get("IPFS_ACCELERATE_LOG_LEVEL", "INFO").upper()
if LOG_LEVEL in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
    logger.setLevel(getattr(logging, LOG_LEVEL))


class ValidationError(ValueError):
    """
    Error raised when input validation fails.
    
    This error provides detailed information about validation failures 
    for better error reporting.
    """
    
    def __init__(self, message: str, parameter: str = None, value: Any = None, 
                constraint: str = None, function: str = None):
        """
        Initialize a validation error.
        
        Args:
            message: Error message
            parameter: Parameter that failed validation
            value: Invalid value
            constraint: Constraint that was violated
            function: Function where the validation error occurred
        """
        self.parameter = parameter
        self.value = value
        self.constraint = constraint
        self.function = function
        
        # Construct a detailed error message
        details = []
        if function:
            details.append(f"function '{function}'")
        if parameter:
            details.append(f"parameter '{parameter}'")
        if constraint:
            details.append(f"constraint '{constraint}'")
            
        # Include a safe representation of the value
        if value is not None:
            try:
                # Limit the length of the value representation
                value_str = repr(value)
                if len(value_str) > 100:
                    value_str = value_str[:97] + "..."
                details.append(f"value {value_str}")
            except:
                details.append("value <unprintable>")
        
        # Construct the full message
        full_message = message
        if details:
            full_message += f" [{', '.join(details)}]"
            
        super().__init__(full_message)


# Type for decorated functions
F = TypeVar('F', bound=Callable[..., Any])


def validate_types(func: F) -> F:
    """
    Decorator to validate argument types based on type hints.
    
    Args:
        func: Function to decorate
        
    Returns:
        Decorated function with type checking
    """
    # Get type hints for the function
    type_hints = get_type_hints(func)
    
    # Create a signature object to map arguments to parameter names
    sig = inspect.signature(func)
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Bind the arguments to the signature parameters
        try:
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()
        except TypeError as e:
            # This catches errors with missing or unexpected arguments
            raise ValidationError(str(e), function=func.__name__)
        
        # Check each argument against its type hint
        for param_name, param_value in bound_args.arguments.items():
            # Skip self/cls parameters for methods (they don't typically have type hints)
            if param_name in ('self', 'cls') and param_name not in type_hints:
                continue
                
            # Check if we have a type hint for this parameter
            if param_name in type_hints:
                expected_type = type_hints[param_name]
                
                # Skip None values for Optional types
                if param_value is None and getattr(expected_type, "__origin__", None) is Union:
                    args = getattr(expected_type, "__args__", ())
                    if type(None) in args:
                        continue
                
                # Check the type
                # Special case for Union/Optional types
                if hasattr(expected_type, "__origin__") and expected_type.__origin__ is Union:
                    # Check if value matches any of the Union types
                    allowed_types = expected_type.__args__
                    if not any(isinstance(param_value, t) for t in allowed_types if t is not type(None)):
                        type_names = [t.__name__ for t in allowed_types if t is not type(None)]
                        raise ValidationError(
                            f"Expected '{param_name}' to be one of types: {', '.join(type_names)}",
                            parameter=param_name,
                            value=param_value,
                            constraint=f"Union[{', '.join(type_names)}]",
                            function=func.__name__
                        )
                # Regular type check
                elif not isinstance(param_value, expected_type):
                    raise ValidationError(
                        f"Expected '{param_name}' to be of type {expected_type.__name__}",
                        parameter=param_name,
                        value=param_value,
                        constraint=expected_type.__name__,
                        function=func.__name__
                    )
        
        # All types are valid, call the original function
        return func(*args, **kwargs)
    
    # For async functions
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        # Bind the arguments to the signature parameters
        try:
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()
        except TypeError as e:
            # This catches errors with missing or unexpected arguments
            raise ValidationError(str(e), function=func.__name__)
        
        # Check each argument against its type hint
        for param_name, param_value in bound_args.arguments.items():
            # Skip self/cls parameters for methods (they don't typically have type hints)
            if param_name in ('self', 'cls') and param_name not in type_hints:
                continue
                
            # Check if we have a type hint for this parameter
            if param_name in type_hints:
                expected_type = type_hints[param_name]
                
                # Skip None values for Optional types
                if param_value is None and getattr(expected_type, "__origin__", None) is Union:
                    args = getattr(expected_type, "__args__", ())
                    if type(None) in args:
                        continue
                
                # Check the type
                # Special case for Union/Optional types
                if hasattr(expected_type, "__origin__") and expected_type.__origin__ is Union:
                    # Check if value matches any of the Union types
                    allowed_types = expected_type.__args__
                    if not any(isinstance(param_value, t) for t in allowed_types if t is not type(None)):
                        type_names = [t.__name__ for t in allowed_types if t is not type(None)]
                        raise ValidationError(
                            f"Expected '{param_name}' to be one of types: {', '.join(type_names)}",
                            parameter=param_name,
                            value=param_value,
                            constraint=f"Union[{', '.join(type_names)}]",
                            function=func.__name__
                        )
                # Regular type check
                elif not isinstance(param_value, expected_type):
                    raise ValidationError(
                        f"Expected '{param_name}' to be of type {expected_type.__name__}",
                        parameter=param_name,
                        value=param_value,
                        constraint=expected_type.__name__,
                        function=func.__name__
                    )
        
        # All types are valid, call the original function
        return await func(*args, **kwargs)
    
    # Return the appropriate wrapper based on whether func is async or not
    if inspect.iscoroutinefunction(func):
        return cast(F, async_wrapper)
    else:
        return cast(F, wrapper)


def validate_params(**param_validators: Callable[[Any], bool]) -> Callable[[F], F]:
    """
    Decorator to validate function parameters with custom validators.
    
    Args:
        **param_validators: Dictionary mapping parameter names to validator functions
        
    Returns:
        Decorator function that applies the validators
    """
    def decorator(func: F) -> F:
        # Create a signature object to map arguments to parameter names
        sig = inspect.signature(func)
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Bind the arguments to the signature parameters
            try:
                bound_args = sig.bind(*args, **kwargs)
                bound_args.apply_defaults()
            except TypeError as e:
                # This catches errors with missing or unexpected arguments
                raise ValidationError(str(e), function=func.__name__)
            
            # Apply validators to the specified parameters
            for param_name, validator in param_validators.items():
                if param_name in bound_args.arguments:
                    param_value = bound_args.arguments[param_name]
                    
                    # Skip None values, unless validator explicitly handles None
                    if param_value is None:
                        continue
                    
                    # Apply the validator
                    try:
                        if not validator(param_value):
                            raise ValidationError(
                                f"Validation failed for parameter '{param_name}'",
                                parameter=param_name,
                                value=param_value,
                                function=func.__name__
                            )
                    except Exception as e:
                        if isinstance(e, ValidationError):
                            raise
                        else:
                            # Wrap other exceptions from the validator
                            raise ValidationError(
                                f"Validator error for parameter '{param_name}': {str(e)}",
                                parameter=param_name,
                                value=param_value,
                                function=func.__name__
                            ) from e
            
            # All parameters are valid, call the original function
            return func(*args, **kwargs)
        
        # For async functions
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Bind the arguments to the signature parameters
            try:
                bound_args = sig.bind(*args, **kwargs)
                bound_args.apply_defaults()
            except TypeError as e:
                # This catches errors with missing or unexpected arguments
                raise ValidationError(str(e), function=func.__name__)
            
            # Apply validators to the specified parameters
            for param_name, validator in param_validators.items():
                if param_name in bound_args.arguments:
                    param_value = bound_args.arguments[param_name]
                    
                    # Skip None values, unless validator explicitly handles None
                    if param_value is None:
                        continue
                    
                    # Apply the validator
                    try:
                        if not validator(param_value):
                            raise ValidationError(
                                f"Validation failed for parameter '{param_name}'",
                                parameter=param_name,
                                value=param_value,
                                function=func.__name__
                            )
                    except Exception as e:
                        if isinstance(e, ValidationError):
                            raise
                        else:
                            # Wrap other exceptions from the validator
                            raise ValidationError(
                                f"Validator error for parameter '{param_name}': {str(e)}",
                                parameter=param_name,
                                value=param_value,
                                function=func.__name__
                            ) from e
            
            # All parameters are valid, call the original function
            return await func(*args, **kwargs)
        
        # Return the appropriate wrapper based on whether func is async or not
        if inspect.iscoroutinefunction(func):
            return cast(F, async_wrapper)
        else:
            return cast(F, wrapper)
        
    return decorator


def validate_range(min_value: Optional[Union[int, float]] = None, 
                  max_value: Optional[Union[int, float]] = None, 
                  inclusive: bool = True) -> Callable[[Any], bool]:
    """
    Create a validator function for numeric range validation.
    
    Args:
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        inclusive: Whether the range bounds are inclusive
        
    Returns:
        Validator function
    """
    def validator(value: Any) -> bool:
        if not isinstance(value, (int, float)):
            raise ValidationError(f"Expected a numeric value, got {type(value).__name__}")
            
        if min_value is not None:
            if inclusive and value < min_value:
                raise ValidationError(f"Value {value} is less than minimum {min_value}")
            elif not inclusive and value <= min_value:
                raise ValidationError(f"Value {value} is less than or equal to minimum {min_value}")
                
        if max_value is not None:
            if inclusive and value > max_value:
                raise ValidationError(f"Value {value} is greater than maximum {max_value}")
            elif not inclusive and value >= max_value:
                raise ValidationError(f"Value {value} is greater than or equal to maximum {max_value}")
                
        return True
        
    return validator


def validate_length(min_length: Optional[int] = None, 
                   max_length: Optional[int] = None) -> Callable[[Any], bool]:
    """
    Create a validator function for length validation.
    
    Args:
        min_length: Minimum length
        max_length: Maximum length
        
    Returns:
        Validator function
    """
    def validator(value: Any) -> bool:
        if not hasattr(value, '__len__'):
            raise ValidationError(f"Expected a value with length, got {type(value).__name__}")
            
        length = len(value)
        
        if min_length is not None and length < min_length:
            raise ValidationError(f"Length {length} is less than minimum {min_length}")
            
        if max_length is not None and length > max_length:
            raise ValidationError(f"Length {length} is greater than maximum {max_length}")
            
        return True
        
    return validator


def validate_pattern(pattern: str) -> Callable[[str], bool]:
    """
    Create a validator function for regex pattern matching.
    
    Args:
        pattern: Regular expression pattern
        
    Returns:
        Validator function
    """
    try:
        compiled_pattern = re.compile(pattern)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {str(e)}")
        
    def validator(value: str) -> bool:
        if not isinstance(value, str):
            raise ValidationError(f"Expected a string value, got {type(value).__name__}")
            
        if not compiled_pattern.match(value):
            raise ValidationError(f"Value '{value}' does not match pattern '{pattern}'")
            
        return True
        
    return validator


def validate_one_of(allowed_values: List[Any]) -> Callable[[Any], bool]:
    """
    Create a validator function for checking if a value is one of a set of allowed values.
    
    Args:
        allowed_values: List of allowed values
        
    Returns:
        Validator function
    """
    def validator(value: Any) -> bool:
        if value not in allowed_values:
            values_str = ", ".join(repr(v) for v in allowed_values[:5])
            if len(allowed_values) > 5:
                values_str += f", ... ({len(allowed_values) - 5} more)"
            raise ValidationError(f"Value {value!r} must be one of: {values_str}")
            
        return True
        
    return validator


def validate_file_exists(value: str) -> bool:
    """
    Validate that a file exists.
    
    Args:
        value: File path to validate
        
    Returns:
        True if file exists, False otherwise
    """
    if not isinstance(value, str):
        raise ValidationError(f"Expected a string file path, got {type(value).__name__}")
        
    if not os.path.isfile(value):
        raise ValidationError(f"File does not exist: {value}")
        
    return True


def validate_directory_exists(value: str) -> bool:
    """
    Validate that a directory exists.
    
    Args:
        value: Directory path to validate
        
    Returns:
        True if directory exists, False otherwise
    """
    if not isinstance(value, str):
        raise ValidationError(f"Expected a string directory path, got {type(value).__name__}")
        
    if not os.path.isdir(value):
        raise ValidationError(f"Directory does not exist: {value}")
        
    return True


def validate_url(value: str) -> bool:
    """
    Validate that a string is a well-formed URL.
    
    Args:
        value: URL to validate
        
    Returns:
        True if URL is valid, False otherwise
    """
    if not isinstance(value, str):
        raise ValidationError(f"Expected a string URL, got {type(value).__name__}")
        
    # Basic URL validation regex
    url_pattern = r'^(https?|ftp)://[^\s/$.?#].[^\s]*$'
    if not re.match(url_pattern, value):
        raise ValidationError(f"Invalid URL format: {value}")
        
    return True


def validate_email(value: str) -> bool:
    """
    Validate that a string is a well-formed email address.
    
    Args:
        value: Email address to validate
        
    Returns:
        True if email is valid, False otherwise
    """
    if not isinstance(value, str):
        raise ValidationError(f"Expected a string email address, got {type(value).__name__}")
        
    # Email validation regex
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, value):
        raise ValidationError(f"Invalid email format: {value}")
        
    return True


def validate_non_empty(value: Any) -> bool:
    """
    Validate that a value is not empty.
    
    This checks that collections have at least one element and 
    strings have at least one non-whitespace character.
    
    Args:
        value: Value to validate
        
    Returns:
        True if value is not empty, False otherwise
    """
    if value is None:
        raise ValidationError("Value cannot be None")
        
    if isinstance(value, str):
        if not value.strip():
            raise ValidationError("String cannot be empty or whitespace only")
    elif hasattr(value, '__len__'):
        if len(value) == 0:
            raise ValidationError(f"{type(value).__name__} cannot be empty")
    else:
        raise ValidationError(f"Cannot validate emptiness of {type(value).__name__}")
        
    return True


def validate_ip_address(value: str) -> bool:
    """
    Validate that a string is a valid IP address (IPv4 or IPv6).
    
    Args:
        value: IP address to validate
        
    Returns:
        True if IP address is valid, False otherwise
    """
    if not isinstance(value, str):
        raise ValidationError(f"Expected a string IP address, got {type(value).__name__}")
        
    # IPv4 validation regex
    ipv4_pattern = r'^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$'
    ipv4_match = re.match(ipv4_pattern, value)
    
    if ipv4_match:
        # Check that each octet is in the valid range
        octets = [int(octet) for octet in ipv4_match.groups()]
        if all(0 <= octet <= 255 for octet in octets):
            return True
    
    # IPv6 validation regex
    ipv6_pattern = r'^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$'
    if re.match(ipv6_pattern, value):
        return True
        
    raise ValidationError(f"Invalid IP address format: {value}")


def validate_hostname(value: str) -> bool:
    """
    Validate that a string is a valid hostname.
    
    Args:
        value: Hostname to validate
        
    Returns:
        True if hostname is valid, False otherwise
    """
    if not isinstance(value, str):
        raise ValidationError(f"Expected a string hostname, got {type(value).__name__}")
        
    # Hostname validation regex
    hostname_pattern = r'^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$'
    if not re.match(hostname_pattern, value):
        raise ValidationError(f"Invalid hostname format: {value}")
        
    return True


def validate_port(value: int) -> bool:
    """
    Validate that a value is a valid port number (1-65535).
    
    Args:
        value: Port number to validate
        
    Returns:
        True if port is valid, False otherwise
    """
    if not isinstance(value, int):
        raise ValidationError(f"Expected an integer port number, got {type(value).__name__}")
        
    if not (1 <= value <= 65535):
        raise ValidationError(f"Port must be between 1 and 65535, got {value}")
        
    return True


def validate_json(value: Any) -> bool:
    """
    Validate that a value is JSON-serializable.
    
    Args:
        value: Value to validate
        
    Returns:
        True if value is JSON-serializable, False otherwise
    """
    import json
    
    try:
        # Attempt to serialize to JSON
        json.dumps(value)
        return True
    except (TypeError, ValueError, OverflowError) as e:
        raise ValidationError(f"Value is not JSON-serializable: {str(e)}")


# Example usage
if __name__ == "__main__":
    # Example: Using type validation
    @validate_types
    def example_typed_function(name: str, age: int, data: Optional[Dict[str, Any]] = None) -> str:
        return f"Name: {name}, Age: {age}, Data: {data}"

    # Example: Using parameter validation
    @validate_params(
        age=validate_range(min_value=0, max_value=120),
        name=validate_length(min_length=2, max_length=50)
    )
    def example_validated_function(name, age, data=None):
        return f"Name: {name}, Age: {age}, Data: {data}"

    # Example: Combining type validation and parameter validation
    @validate_types
    @validate_params(
        age=validate_range(min_value=0, max_value=120),
        email=validate_email
    )
    def example_combined_function(name: str, age: int, email: str) -> str:
        return f"Name: {name}, Age: {age}, Email: {email}"

    # Test the functions
    try:
        print("Testing type validation...")
        print(example_typed_function("John", 30))
        print(example_typed_function("Jane", 25, {"city": "New York"}))
        
        print("\nTesting parameter validation...")
        print(example_validated_function("John", 30))
        
        print("\nTesting combined validation...")
        print(example_combined_function("John", 30, "john@example.com"))
        
        # Intentional errors to demonstrate validation
        print("\nTesting validation errors...")
        print(example_typed_function(123, "30"))  # Type error
    except ValidationError as e:
        print(f"Validation Error: {e}")
        
    try:
        print(example_validated_function("J", 150))  # Parameter validation error
    except ValidationError as e:
        print(f"Validation Error: {e}")
        
    try:
        print(example_combined_function("John", 30, "invalid-email"))  # Email validation error
    except ValidationError as e:
        print(f"Validation Error: {e}")