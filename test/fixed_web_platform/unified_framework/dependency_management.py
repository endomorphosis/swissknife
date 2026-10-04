#!/usr/bin/env python3
"""
Unified Dependency Management for IPFS Accelerate Python Framework

This module provides standardized dependency management across the framework, including:
- Dependency checking and verification
- Graceful degradation when optional dependencies are unavailable
- Automated fallback mechanisms for optional features
- Clear error messaging with installation instructions
- Lazy loading of optional dependencies
"""

import os
import sys
import logging
import importlib
import subprocess
from typing import Dict, List, Set, Tuple, Optional, Union, Any, Callable

# Import error handling framework
try:
    from fixed_web_platform.unified_framework.error_handling import (
        ErrorHandler, ErrorCategories, handle_errors
    )
    HAS_ERROR_FRAMEWORK = True
except ImportError:
    # Set up basic error handling if framework not available
    HAS_ERROR_FRAMEWORK = False
    
    # Simplified error categorization
    class ErrorCategories:
        DEPENDENCY_ERROR = "dependency_error"

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Set log level from environment variable if specified
LOG_LEVEL = os.environ.get("IPFS_ACCELERATE_LOG_LEVEL", "INFO").upper()
if LOG_LEVEL in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
    logger.setLevel(getattr(logging, LOG_LEVEL))


class DependencyManager:
    """
    Centralized dependency management with verification and fallback mechanisms.
    """
    
    # Required dependencies for core functionality
    CORE_DEPENDENCIES = {
        "numpy": "numpy",
        "pandas": "pandas",
        "duckdb": "duckdb",
        "pyarrow": "pyarrow",
    }
    
    # Optional dependencies with installation instructions
    OPTIONAL_DEPENDENCIES = {
        # Web platform dependencies
        "websockets": {
            "package_name": "websockets",
            "import_name": "websockets",
            "installation": "pip install websockets",
            "features": ["websocket_bridge", "browser_connectivity"],
            "severity": "high",  # High severity means significant feature loss if missing
        },
        "selenium": {
            "package_name": "selenium",
            "import_name": "selenium",
            "installation": "pip install selenium",
            "features": ["browser_automation", "web_testing"],
            "severity": "high",
        },
        "psutil": {
            "package_name": "psutil",
            "import_name": "psutil",
            "installation": "pip install psutil",
            "features": ["resource_monitoring", "process_management"],
            "severity": "medium",
        },
        
        # Hardware acceleration dependencies
        "torch": {
            "package_name": "torch",
            "import_name": "torch",
            "installation": "pip install torch",
            "features": ["pytorch_models", "tensor_operations"],
            "severity": "high",
        },
        "onnxruntime": {
            "package_name": "onnxruntime",
            "import_name": "onnxruntime",
            "installation": "pip install onnxruntime",
            "features": ["onnx_inference", "cross_platform_models"],
            "severity": "high",
        },
        "openvino": {
            "package_name": "openvino",
            "import_name": "openvino",
            "installation": "pip install openvino",
            "features": ["openvino_acceleration", "intel_optimization"],
            "severity": "medium",
        },
        
        # Database dependencies
        "pymongo": {
            "package_name": "pymongo",
            "import_name": "pymongo",
            "installation": "pip install pymongo",
            "features": ["mongo_storage", "distributed_results"],
            "severity": "low",
        },
        
        # Visualization dependencies
        "matplotlib": {
            "package_name": "matplotlib",
            "import_name": "matplotlib",
            "installation": "pip install matplotlib",
            "features": ["data_visualization", "performance_charts"],
            "severity": "low",
        },
        "plotly": {
            "package_name": "plotly",
            "import_name": "plotly",
            "installation": "pip install plotly",
            "features": ["interactive_visualization", "dashboard_components"],
            "severity": "low",
        },
    }
    
    # Browser-specific dependencies
    BROWSER_DEPENDENCIES = {
        "chrome": {
            "package_name": "webdriver-manager",
            "import_name": "webdriver_manager",
            "installation": "pip install webdriver-manager",
            "additional_imports": ["selenium.webdriver.chrome.service", "selenium.webdriver.chrome.options"],
            "severity": "high",
        },
        "firefox": {
            "package_name": "webdriver-manager",
            "import_name": "webdriver_manager",
            "installation": "pip install webdriver-manager",
            "additional_imports": ["selenium.webdriver.firefox.service", "selenium.webdriver.firefox.options"],
            "severity": "high",
        },
        "edge": {
            "package_name": "webdriver-manager",
            "import_name": "webdriver_manager",
            "installation": "pip install webdriver-manager",
            "additional_imports": ["selenium.webdriver.edge.service", "selenium.webdriver.edge.options"],
            "severity": "high",
        },
    }
    
    # Dependency groups for features
    FEATURE_DEPENDENCIES = {
        "webnn_webgpu": ["websockets", "selenium"],
        "resource_pool": ["websockets", "selenium", "psutil"],
        "data_visualization": ["matplotlib", "plotly"],
        "database_storage": ["pymongo", "duckdb", "pyarrow"],
        "hardware_acceleration": ["torch", "onnxruntime", "openvino"],
    }
    
    # Default versions for dependencies (used for compatibility checks)
    DEFAULT_VERSIONS = {
        "numpy": "1.20.0",
        "pandas": "1.3.0",
        "torch": "1.10.0",
        "openvino": "2022.1.0",
        "onnxruntime": "1.10.0",
        "websockets": "10.0",
        "selenium": "4.0.0",
    }
    
    def __init__(self, check_core_dependencies: bool = True):
        """
        Initialize the dependency manager.
        
        Args:
            check_core_dependencies: Whether to check core dependencies at initialization
        """
        # Initialize state
        self.available_dependencies = {}
        self.missing_dependencies = {}
        
        # Features enabled based on available dependencies
        self.enabled_features = {}
        
        # Check core dependencies if requested
        if check_core_dependencies:
            self.check_core_dependencies()
            
    def check_core_dependencies(self) -> bool:
        """
        Check that all core dependencies are available.
        
        Returns:
            True if all core dependencies are available, False otherwise
        """
        all_available = True
        
        for name, package in self.CORE_DEPENDENCIES.items():
            try:
                module = importlib.import_module(package)
                self.available_dependencies[name] = {
                    "version": getattr(module, "__version__", "unknown"),
                    "path": getattr(module, "__file__", "unknown"),
                }
                logger.debug(f"Core dependency {name} is available (version: {self.available_dependencies[name]['version']})")
            except ImportError:
                all_available = False
                self.missing_dependencies[name] = {
                    "package": package,
                    "severity": "critical",
                }
                logger.error(f"Core dependency {name} ({package}) is missing")
                
        return all_available
        
    def check_optional_dependency(self, name: str) -> bool:
        """
        Check if an optional dependency is available.
        
        Args:
            name: Name of the dependency to check
            
        Returns:
            True if dependency is available, False otherwise
        """
        if name in self.available_dependencies:
            return True
            
        if name in self.missing_dependencies:
            return False
            
        # Get dependency info
        if name in self.OPTIONAL_DEPENDENCIES:
            dep_info = self.OPTIONAL_DEPENDENCIES[name]
        elif name in self.BROWSER_DEPENDENCIES:
            dep_info = self.BROWSER_DEPENDENCIES[name]
        else:
            logger.warning(f"Unknown dependency: {name}")
            return False
            
        # Try to import
        try:
            module = importlib.import_module(dep_info["import_name"])
            self.available_dependencies[name] = {
                "version": getattr(module, "__version__", "unknown"),
                "path": getattr(module, "__file__", "unknown"),
            }
            logger.debug(f"Optional dependency {name} is available (version: {self.available_dependencies[name]['version']})")
            
            # Check additional imports if specified
            if "additional_imports" in dep_info:
                for additional_import in dep_info["additional_imports"]:
                    try:
                        importlib.import_module(additional_import)
                    except ImportError:
                        logger.warning(f"Additional import {additional_import} for {name} is not available")
                        
            return True
        except ImportError:
            self.missing_dependencies[name] = {
                "package": dep_info["package_name"],
                "installation": dep_info["installation"],
                "severity": dep_info["severity"],
                "features": dep_info.get("features", []),
            }
            logger.info(f"Optional dependency {name} is not available. To install: {dep_info['installation']}")
            return False
            
    def check_feature_dependencies(self, feature: str) -> Tuple[bool, List[str]]:
        """
        Check if all dependencies for a feature are available.
        
        Args:
            feature: Feature to check dependencies for
            
        Returns:
            Tuple of (bool: all dependencies available, list: missing dependencies)
        """
        if feature not in self.FEATURE_DEPENDENCIES:
            logger.warning(f"Unknown feature: {feature}")
            return False, []
            
        dependencies = self.FEATURE_DEPENDENCIES[feature]
        missing = []
        
        for dep in dependencies:
            if not self.check_optional_dependency(dep):
                missing.append(dep)
                
        all_available = len(missing) == 0
        
        # Update enabled features
        self.enabled_features[feature] = all_available
        
        return all_available, missing
        
    def get_installation_instructions(self, missing_deps: List[str] = None) -> str:
        """
        Get installation instructions for missing dependencies.
        
        Args:
            missing_deps: List of missing dependencies to get instructions for
            
        Returns:
            Installation instructions string
        """
        if missing_deps is None:
            missing_deps = list(self.missing_dependencies.keys())
            
        instructions = []
        
        for dep in missing_deps:
            if dep in self.missing_dependencies and "installation" in self.missing_dependencies[dep]:
                instructions.append(self.missing_dependencies[dep]["installation"])
            elif dep in self.OPTIONAL_DEPENDENCIES:
                instructions.append(self.OPTIONAL_DEPENDENCIES[dep]["installation"])
            elif dep in self.BROWSER_DEPENDENCIES:
                instructions.append(self.BROWSER_DEPENDENCIES[dep]["installation"])
                
        if not instructions:
            return "No missing dependencies"
            
        return "\n".join(instructions)
        
    @handle_errors if HAS_ERROR_FRAMEWORK else lambda f: f
    def check_environment(self) -> Dict[str, Any]:
        """
        Check the Python environment and return detailed information.
        
        Returns:
            Dictionary with environment information
        """
        environment = {
            "python_version": sys.version,
            "python_path": sys.executable,
            "platform": sys.platform,
            "available_dependencies": self.available_dependencies,
            "missing_dependencies": self.missing_dependencies,
            "enabled_features": self.enabled_features,
        }
        
        # Get Python package information
        try:
            pip_list = subprocess.check_output([sys.executable, "-m", "pip", "list"], 
                                              universal_newlines=True)
            environment["installed_packages"] = pip_list
        except Exception as e:
            logger.warning(f"Failed to get installed packages: {e}")
            environment["installed_packages"] = "Error retrieving installed packages"
            
        return environment
        
    def can_fallback(self, feature: str) -> bool:
        """
        Check if a feature can fall back to an alternative implementation.
        
        Args:
            feature: Feature to check fallback for
            
        Returns:
            True if feature can fall back, False otherwise
        """
        # Define fallback options for features
        fallback_options = {
            "webnn_webgpu": ["onnxruntime"],
            "resource_pool": ["torch"],
            "data_visualization": ["pandas"],
            "database_storage": ["duckdb", "sqlite3"],
            "hardware_acceleration": ["numpy"],
        }
        
        if feature not in fallback_options:
            return False
            
        # Check if any fallback option is available
        for fallback in fallback_options[feature]:
            if fallback in self.available_dependencies:
                return True
                
        return False
        
    def lazy_import(self, module_name: str, fallback_module: str = None) -> Optional[Any]:
        """
        Lazily import a module with fallback support.
        
        Args:
            module_name: Name of the module to import
            fallback_module: Optional fallback module if the primary one is not available
            
        Returns:
            Imported module or None if not available
        """
        try:
            return importlib.import_module(module_name)
        except ImportError:
            if fallback_module:
                try:
                    return importlib.import_module(fallback_module)
                except ImportError:
                    return None
            return None
            
    def get_feature_status(self) -> Dict[str, Dict[str, Any]]:
        """
        Get the status of all features.
        
        Returns:
            Dictionary with feature status information
        """
        status = {}
        
        for feature, dependencies in self.FEATURE_DEPENDENCIES.items():
            available, missing = self.check_feature_dependencies(feature)
            
            status[feature] = {
                "available": available,
                "missing_dependencies": missing,
                "can_fallback": self.can_fallback(feature),
                "total_dependencies": len(dependencies),
                "available_dependencies": [dep for dep in dependencies if dep in self.available_dependencies],
            }
            
        return status
        
    def install_dependency(self, name: str, use_pip: bool = True) -> bool:
        """
        Attempt to install a dependency.
        
        Args:
            name: Name of the dependency to install
            use_pip: Whether to use pip for installation
            
        Returns:
            True if installation was successful, False otherwise
        """
        # Get installation command
        install_cmd = None
        
        if name in self.OPTIONAL_DEPENDENCIES:
            install_cmd = self.OPTIONAL_DEPENDENCIES[name]["installation"]
        elif name in self.BROWSER_DEPENDENCIES:
            install_cmd = self.BROWSER_DEPENDENCIES[name]["installation"]
        elif name in self.CORE_DEPENDENCIES:
            install_cmd = f"pip install {self.CORE_DEPENDENCIES[name]}"
        else:
            logger.warning(f"Unknown dependency: {name}")
            return False
            
        # Extract package from install command
        package = install_cmd.split()[-1]
        
        # Try to install
        try:
            if use_pip:
                subprocess.check_call([sys.executable, "-m", "pip", "install", package])
            else:
                subprocess.check_call(install_cmd.split())
                
            # Update dependency status
            if name in self.missing_dependencies:
                del self.missing_dependencies[name]
                
            # Try to import to verify
            if name in self.OPTIONAL_DEPENDENCIES:
                self.check_optional_dependency(name)
            else:
                logger.info(f"Installed {name}, but could not verify")
                
            return name in self.available_dependencies
        except Exception as e:
            logger.error(f"Failed to install {name}: {e}")
            return False


# Create global dependency manager instance
global_dependency_manager = DependencyManager(check_core_dependencies=False)

# Function decorator for dependency validation
def require_dependencies(*dependencies, fallback: bool = False):
    """
    Decorator to validate required dependencies with optional fallback.
    
    Args:
        *dependencies: List of required dependencies
        fallback: Whether to enable fallback behavior if dependencies are missing
        
    Returns:
        Decorated function
    """
    def decorator(func):
        import functools
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            missing = []
            
            # Check each dependency
            for dep in dependencies:
                if not global_dependency_manager.check_optional_dependency(dep):
                    missing.append(dep)
            
            if missing:
                # If fallback is enabled, try to continue
                if fallback:
                    logger.warning(f"Missing dependencies for {func.__name__}: {', '.join(missing)}, continuing with fallback")
                    kwargs['_missing_dependencies'] = missing
                    return func(*args, **kwargs)
                else:
                    # No fallback, raise error
                    error_message = f"Missing required dependencies for {func.__name__}: {', '.join(missing)}"
                    install_instructions = global_dependency_manager.get_installation_instructions(missing)
                    logger.error(f"{error_message}\nInstallation instructions:\n{install_instructions}")
                    
                    # Return structured error response
                    if HAS_ERROR_FRAMEWORK:
                        return {
                            "status": "error",
                            "error": error_message,
                            "error_type": "DependencyError",
                            "error_category": ErrorCategories.DEPENDENCY_ERROR,
                            "recoverable": False,
                            "missing_dependencies": missing,
                            "installation_instructions": install_instructions
                        }
                    else:
                        raise ImportError(error_message)
            
            # All dependencies available, proceed normally
            return func(*args, **kwargs)
        
        # For async functions
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            missing = []
            
            # Check each dependency
            for dep in dependencies:
                if not global_dependency_manager.check_optional_dependency(dep):
                    missing.append(dep)
            
            if missing:
                # If fallback is enabled, try to continue
                if fallback:
                    logger.warning(f"Missing dependencies for {func.__name__}: {', '.join(missing)}, continuing with fallback")
                    kwargs['_missing_dependencies'] = missing
                    return await func(*args, **kwargs)
                else:
                    # No fallback, raise error
                    error_message = f"Missing required dependencies for {func.__name__}: {', '.join(missing)}"
                    install_instructions = global_dependency_manager.get_installation_instructions(missing)
                    logger.error(f"{error_message}\nInstallation instructions:\n{install_instructions}")
                    
                    # Return structured error response
                    if HAS_ERROR_FRAMEWORK:
                        return {
                            "status": "error",
                            "error": error_message,
                            "error_type": "DependencyError",
                            "error_category": ErrorCategories.DEPENDENCY_ERROR,
                            "recoverable": False,
                            "missing_dependencies": missing,
                            "installation_instructions": install_instructions
                        }
                    else:
                        raise ImportError(error_message)
            
            # All dependencies available, proceed normally
            return await func(*args, **kwargs)
        
        # Determine if the function is async or not
        import inspect
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return wrapper
    
    return decorator

# Function to get a lazy module with fallback behavior
def get_module_with_fallback(module_name: str, fallback_module: str = None) -> Optional[Any]:
    """
    Get a module with fallback if the primary module is not available.
    
    Args:
        module_name: Name of the module to import
        fallback_module: Optional fallback module if the primary one is not available
        
    Returns:
        Module object or None if not available
    """
    return global_dependency_manager.lazy_import(module_name, fallback_module)


# Convenience function to check if a feature is available
def feature_is_available(feature: str) -> bool:
    """
    Check if a feature is available based on its dependencies.
    
    Args:
        feature: Feature to check
        
    Returns:
        True if feature is available, False otherwise
    """
    available, _ = global_dependency_manager.check_feature_dependencies(feature)
    return available

# Example usage
if __name__ == "__main__":
    # Initialize dependency manager
    dm = DependencyManager()
    
    # Check core dependencies
    dm.check_core_dependencies()
    
    # Check optional dependencies
    dm.check_optional_dependency("numpy")
    dm.check_optional_dependency("torch")
    dm.check_optional_dependency("websockets")
    
    # Check feature dependencies
    webnn_available, missing_webnn = dm.check_feature_dependencies("webnn_webgpu")
    print(f"WebNN/WebGPU available: {webnn_available}")
    if not webnn_available:
        print(f"Missing dependencies: {missing_webnn}")
        print(f"Installation instructions:\n{dm.get_installation_instructions(missing_webnn)}")
    
    # Check environment
    env = dm.check_environment()
    
    # Print dependency status
    print("\nDependency Status:")
    for name, info in dm.available_dependencies.items():
        print(f"  ✅ {name} (version: {info['version']})")
    
    for name, info in dm.missing_dependencies.items():
        print(f"  ❌ {name} (severity: {info['severity']})")
        
    # Print feature status
    print("\nFeature Status:")
    feature_status = dm.get_feature_status()
    for feature, status in feature_status.items():
        if status["available"]:
            print(f"  ✅ {feature}")
        elif status["can_fallback"]:
            print(f"  ⚠️ {feature} (using fallback)")
        else:
            print(f"  ❌ {feature}")