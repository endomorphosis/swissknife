"""
Platform Detection System for Unified Web Framework (August 2025)

This module provides a standardized interface for detecting browser and hardware
capabilities, bridging the browser_capability_detector with the unified framework:

- Detects browser capabilities (WebGPU, WebAssembly, etc.)
- Detects hardware platform features and constraints
- Creates standardized optimization profiles
- Integrates with the configuration validation system
- Supports runtime adaptation based on platform conditions

Usage:
    from fixed_web_platform.unified_framework.platform_detector import (
        PlatformDetector,
        get_browser_capabilities,
        get_hardware_capabilities,
        create_platform_profile,
        detect_platform,
        detect_browser_features
    )
    
    # Create detector
    detector = PlatformDetector()
    
    # Get platform capabilities
    platform_info = detector.detect_platform()
    
    # Get optimization profile
    profile = detector.get_optimization_profile()
    
    # Check specific feature support
    has_webgpu = detector.supports_feature("webgpu")
    
    # Simple functions for direct usage
    browser_info = detect_browser_features()
    platform_info = detect_platform()
"""

import os
import sys
import json
import logging
import importlib
from typing import Dict, Any, List, Optional, Union, Tuple

# Import from parent directory. We need to import dynamically to avoid issues
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if parent_path not in sys.path:
    sys.path.insert(0, parent_path)

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unified_framework.platform_detector")

# Try to import browser capability detector from parent package
try:
    from ..browser_capability_detector import BrowserCapabilityDetector
except ImportError:
    logger.warning("Could not import BrowserCapabilityDetector from parent package")
    BrowserCapabilityDetector = None

class PlatformDetector:
    """
    Unified platform detection for web browsers and hardware.
    
    This class provides a standardized interface to detect browser and hardware
    capabilities, create optimization profiles, and check feature support.
    """
    
    def __init__(self, browser: Optional[str] = None, version: Optional[float] = None):
        """
        Initialize platform detector.
        
        Args:
            browser: Optional browser name to override detection
            version: Optional browser version to override detection
        """
        # Set environment variables if browser and version are provided
        if browser:
            os.environ["TEST_BROWSER"] = browser
        if version:
            os.environ["TEST_BROWSER_VERSION"] = str(version)
            
        # Create underlying detector if available
        self.detector = self._create_detector()
        
        # Store detection results
        self.platform_info = self.detect_platform()
        
        # Clean up environment variables
        if browser and "TEST_BROWSER" in os.environ:
            del os.environ["TEST_BROWSER"]
        if version and "TEST_BROWSER_VERSION" in os.environ:
            del os.environ["TEST_BROWSER_VERSION"]
        
        logger.info(f"Platform detector initialized. WebGPU available: {self.supports_feature('webgpu')}")
    
    def _create_detector(self):
        """Create browser capability detector."""
        if BrowserCapabilityDetector:
            return BrowserCapabilityDetector()
        
        # Try to dynamically import from the parent module
        try:
            module = importlib.import_module('fixed_web_platform.browser_capability_detector')
            detector_class = getattr(module, 'BrowserCapabilityDetector')
            return detector_class()
        except (ImportError, AttributeError) as e:
            logger.warning(f"Could not create browser capability detector: {e}")
            return None
    
    def detect_platform(self) -> Dict[str, Any]:
        """
        Detect platform capabilities.
        
        Returns:
            Dictionary with platform capabilities
        """
        # Get capabilities from underlying detector if available
        if self.detector:
            capabilities = self.detector.get_capabilities()
        else:
            # Create simulated capabilities for testing
            capabilities = self._create_simulated_capabilities()
        
        # Create standardized platform info
        platform_info = {
            "browser": {
                "name": capabilities["browser_info"]["name"],
                "version": capabilities["browser_info"]["version"],
                "user_agent": capabilities["browser_info"].get("user_agent", "Unknown"),
                "is_mobile": capabilities["browser_info"].get("mobile", False)
            },
            "hardware": {
                "platform": capabilities["hardware_info"]["platform"],
                "cpu_cores": capabilities["hardware_info"]["cpu"]["cores"],
                "cpu_architecture": capabilities["hardware_info"]["cpu"]["architecture"],
                "memory_gb": capabilities["hardware_info"]["memory"]["total_gb"],
                "gpu_vendor": capabilities["hardware_info"]["gpu"]["vendor"],
                "gpu_model": capabilities["hardware_info"]["gpu"]["model"]
            },
            "features": {
                "webgpu": capabilities["webgpu"]["available"],
                "webgpu_features": {
                    "compute_shaders": capabilities["webgpu"].get("compute_shaders", False),
                    "shader_precompilation": capabilities["webgpu"].get("shader_precompilation", False),
                    "storage_texture_binding": capabilities["webgpu"].get("storage_texture_binding", False),
                    "texture_compression": capabilities["webgpu"].get("texture_compression", False)
                },
                "webnn": capabilities["webnn"]["available"],
                "webnn_features": {
                    "cpu_backend": capabilities["webnn"].get("cpu_backend", False),
                    "gpu_backend": capabilities["webnn"].get("gpu_backend", False)
                },
                "webassembly": True,
                "webassembly_features": {
                    "simd": capabilities["webassembly"].get("simd", False),
                    "threads": capabilities["webassembly"].get("threads", False),
                    "bulk_memory": capabilities["webassembly"].get("bulk_memory", False)
                }
            },
            "optimization_profile": self._create_optimization_profile(capabilities)
        }
        
        return platform_info
    
    
    def detect_capabilities(self) -> Dict[str, Any]:
        """
        Detect platform capabilities and return configuration options.
        
        Returns:
            Dictionary with detected capabilities as configuration options
        """
        # Get platform info
        platform_info = self.detect_platform()
        
        # Create configuration dictionary
        config = {
            "browser": platform_info["browser"]["name"],
            "browser_version": platform_info["browser"]["version"],
            "webgpu_supported": platform_info.get("features", {}).get("webgpu", True),
            "webnn_supported": platform_info.get("features", {}).get("webnn", True),
            "wasm_supported": platform_info.get("features", {}).get("wasm", True),
            "hardware_platform": platform_info["hardware"].get("platform", "unknown"),
            "hardware_memory_gb": platform_info["hardware"].get("memory_gb", 4)
        }
        
        # Set optimization flags based on capabilities
        browser = platform_info["browser"]["name"].lower()
        
        # Add WebGPU optimization flags
        if config["webgpu_supported"]:
            config["enable_shader_precompilation"] = True
            
            # Add model-type specific optimizations
            if hasattr(self, "model_type"):
                # Enable compute shaders for audio models in Firefox
                if browser == "firefox" and self.model_type == "audio":
                    config["enable_compute_shaders"] = True
                    config["firefox_audio_optimization"] = True
                    config["workgroup_size"] = [256, 1, 1]  # Optimized for Firefox
                elif self.model_type == "audio":
                    config["enable_compute_shaders"] = True
                    config["workgroup_size"] = [128, 2, 1]  # Standard size
                    
                # Enable parallel loading for multimodal models
                if self.model_type == "multimodal":
                    config["enable_parallel_loading"] = True
                    config["progressive_loading"] = True
        
        return config
    
    def _create_simulated_capabilities(self) -> Dict[str, Any]:
        """Create simulated capabilities for testing."""
        # Get browser information from environment variables or use defaults
        browser_name = os.environ.get("TEST_BROWSER", "chrome").lower()
        browser_version = float(os.environ.get("TEST_BROWSER_VERSION", "120.0"))
        is_mobile = os.environ.get("TEST_MOBILE", "0") == "1"
        
        # Set up simulated capabilities
        capabilities = {
            "browser_info": {
                "name": browser_name,
                "version": browser_version,
                "user_agent": f"Simulated {browser_name.capitalize()} {browser_version}",
                "mobile": is_mobile
            },
            "hardware_info": {
                "platform": os.environ.get("TEST_PLATFORM", sys.platform),
                "cpu": {
                    "cores": int(os.environ.get("TEST_CPU_CORES", "8")),
                    "architecture": os.environ.get("TEST_CPU_ARCH", "x86_64")
                },
                "memory": {
                    "total_gb": float(os.environ.get("TEST_MEMORY_GB", "16.0"))
                },
                "gpu": {
                    "vendor": os.environ.get("TEST_GPU_VENDOR", "Simulated GPU"),
                    "model": os.environ.get("TEST_GPU_MODEL", "Simulation Model")
                }
            },
            "webgpu": {
                "available": os.environ.get("WEBGPU_AVAILABLE", "1") == "1",
                "compute_shaders": os.environ.get("WEBGPU_COMPUTE_SHADERS", "1") == "1",
                "shader_precompilation": os.environ.get("WEBGPU_SHADER_PRECOMPILE", "1") == "1",
                "storage_texture_binding": True,
                "texture_compression": True
            },
            "webnn": {
                "available": os.environ.get("WEBNN_AVAILABLE", "1") == "1",
                "cpu_backend": True,
                "gpu_backend": True
            },
            "webassembly": {
                "simd": True,
                "threads": True,
                "bulk_memory": True
            }
        }
        
        # Apply browser-specific limitations
        if browser_name == "safari":
            capabilities["webgpu"]["compute_shaders"] = False
            capabilities["webgpu"]["shader_precompilation"] = False
        elif browser_name == "firefox":
            capabilities["webgpu"]["shader_precompilation"] = False
        
        # Apply mobile limitations
        if is_mobile:
            capabilities["webgpu"]["compute_shaders"] = False
            capabilities["webassembly"]["threads"] = False
            
        return capabilities
    
    def _create_optimization_profile(self, capabilities: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create optimization profile based on capabilities.
        
        Args:
            capabilities: Platform capabilities dictionary
            
        Returns:
            Optimization profile dictionary
        """
        browser_name = capabilities["browser_info"]["name"].lower()
        is_mobile = capabilities["browser_info"].get("mobile", False)
        
        # Determine supported precision formats
        precision_support = {
            "2bit": not (browser_name == "safari" or is_mobile),
            "3bit": not (browser_name == "safari" or is_mobile),
            "4bit": True,  # All browsers support 4-bit
            "8bit": True,  # All browsers support 8-bit
            "16bit": True  # All browsers support 16-bit
        }
        
        # Determine default precision based on browser and device
        if browser_name == "safari":
            default_precision = 8
        elif is_mobile:
            default_precision = 4
        else:
            default_precision = 4  # 4-bit default for modern browsers
        
        # Create profile
        profile = {
            "precision": {
                "supported": [f"{bits}bit" for bits, supported in precision_support.items() if supported],
                "default": default_precision,
                "ultra_low_precision_enabled": precision_support["2bit"] and precision_support["3bit"]
            },
            "compute": {
                "use_compute_shaders": capabilities["webgpu"].get("compute_shaders", False),
                "use_shader_precompilation": capabilities["webgpu"].get("shader_precompilation", False),
                "workgroup_size": self._get_optimal_workgroup_size(browser_name, is_mobile)
            },
            "loading": {
                "parallel_loading": not is_mobile,
                "progressive_loading": True
            },
            "memory": {
                "kv_cache_optimization": not (browser_name == "safari" or is_mobile),
                "memory_pressure_detection": True
            },
            "platform": {
                "name": browser_name,
                "is_mobile": is_mobile,
                "use_browser_optimizations": True
            }
        }
        
        return profile
    
    def _get_optimal_workgroup_size(self, browser_name: str, is_mobile: bool) -> List[int]:
        """
        Get optimal workgroup size for WebGPU compute shaders.
        
        Args:
            browser_name: Browser name
            is_mobile: Whether device is mobile
            
        Returns:
            Workgroup size as [x, y, z] dimensions
        """
        if is_mobile:
            return [4, 4, 1]  # Small workgroups for mobile
        
        # Browser-specific optimal sizes
        if browser_name == "chrome" or browser_name == "edge":
            return [128, 1, 1]
        elif browser_name == "firefox":
            return [256, 1, 1]  # Better for Firefox
        elif browser_name == "safari":
            return [64, 1, 1]  # Better for Safari/Metal
        else:
            return [8, 8, 1]  # Default
    
    def get_optimization_profile(self) -> Dict[str, Any]:
        """
        Get optimization profile based on platform capabilities.
        
        Returns:
            Dictionary with optimization settings
        """
        return self.platform_info["optimization_profile"]
    
    def supports_feature(self, feature_name: str) -> bool:
        """
        Check if a specific feature is supported.
        
        Args:
            feature_name: Name of the feature to check
            
        Returns:
            Boolean indicating support status
        """
        # High-level features
        if feature_name in ["webgpu", "gpu"]:
            return self.platform_info["features"]["webgpu"]
        elif feature_name in ["webnn", "ml"]:
            return self.platform_info["features"]["webnn"]
        
        # WebGPU-specific features
        elif feature_name == "compute_shaders":
            return self.platform_info["features"]["webgpu_features"]["compute_shaders"]
        elif feature_name == "shader_precompilation":
            return self.platform_info["features"]["webgpu_features"]["shader_precompilation"]
        
        # WebAssembly-specific features
        elif feature_name == "wasm_simd":
            return self.platform_info["features"]["webassembly_features"]["simd"]
        elif feature_name == "wasm_threads":
            return self.platform_info["features"]["webassembly_features"]["threads"]
        
        # Check optimization profile for other features
        elif feature_name == "ultra_low_precision":
            return self.platform_info["optimization_profile"]["precision"]["ultra_low_precision_enabled"]
        elif feature_name == "progressive_loading":
            return self.platform_info["optimization_profile"]["loading"]["progressive_loading"]
        
        # Default for unknown features
        return False
    
    def get_browser_name(self) -> str:
        """
        Get detected browser name.
        
        Returns:
            Browser name
        """
        return self.platform_info["browser"]["name"]
    
    def get_browser_version(self) -> float:
        """
        Get detected browser version.
        
        Returns:
            Browser version
        """
        return self.platform_info["browser"]["version"]
    
    def is_mobile_browser(self) -> bool:
        """
        Check if browser is running on a mobile device.
        
        Returns:
            True if browser is on mobile device
        """
        return self.platform_info["browser"]["is_mobile"]
    
    def get_hardware_platform(self) -> str:
        """
        Get hardware platform name.
        
        Returns:
            Platform name (e.g., 'linux', 'windows', 'darwin')
        """
        return self.platform_info["hardware"]["platform"]
    
    def get_available_memory_gb(self) -> float:
        """
        Get available system memory in GB.
        
        Returns:
            Available memory in GB
        """
        return self.platform_info["hardware"]["memory_gb"]
    
    def get_gpu_vendor(self) -> str:
        """
        Get GPU vendor.
        
        Returns:
            GPU vendor name
        """
        return self.platform_info["hardware"]["gpu_vendor"]
    
    def create_configuration(self, model_type: str) -> Dict[str, Any]:
        """
        Create optimized configuration for specified model type.
        
        Args:
            model_type: Type of model (text, vision, audio, multimodal)
            
        Returns:
            Optimized configuration dictionary
        """
        profile = self.get_optimization_profile()
        
        # Base configuration
        config = {
            "precision": f"{profile['precision']['default']}bit",
            "use_compute_shaders": profile["compute"]["use_compute_shaders"],
            "use_shader_precompilation": profile["compute"]["use_shader_precompilation"],
            "enable_parallel_loading": profile["loading"]["parallel_loading"],
            "use_kv_cache": profile["memory"]["kv_cache_optimization"],
            "workgroup_size": profile["compute"]["workgroup_size"],
            "browser": self.get_browser_name(),
            "browser_version": self.get_browser_version()
        }
        
        # Apply model-specific optimizations
        if model_type == "text":
            config.update({
                "use_kv_cache": profile["memory"]["kv_cache_optimization"],
                "enable_parallel_loading": False
            })
        elif model_type == "vision":
            config.update({
                "use_kv_cache": False,
                "enable_parallel_loading": False,
                "use_shader_precompilation": True
            })
        elif model_type == "audio":
            config.update({
                "use_compute_shaders": True,
                "use_kv_cache": False,
                "enable_parallel_loading": False
            })
            # Special Firefox audio optimizations
            if self.get_browser_name() == "firefox":
                config["firefox_audio_optimization"] = True
        elif model_type == "multimodal":
            config.update({
                "enable_parallel_loading": True,
                "use_kv_cache": profile["memory"]["kv_cache_optimization"]
            })
        
        # Apply hardware-specific adjustments
        if self.get_available_memory_gb() < 4:
            # Low memory devices
            config["precision"] = "4bit"
            config["offload_weights"] = True
        
        logger.info(f"Created configuration for {model_type} model on {self.get_browser_name()}")
        return config
    
    def to_json(self) -> str:
        """
        Convert platform info to JSON.
        
        Returns:
            JSON string with platform information
        """
        return json.dumps(self.platform_info, indent=2)

# Utility functions for simple access

def get_browser_capabilities() -> Dict[str, Any]:
    """
    Get current browser capabilities.
    
    Returns:
        Dictionary with browser capabilities
    """
    detector = PlatformDetector()
    return {
        "browser": detector.platform_info["browser"],
        "features": detector.platform_info["features"]
    }


def get_hardware_capabilities() -> Dict[str, Any]:
    """
    Get current hardware capabilities.
    
    Returns:
        Dictionary with hardware capabilities
    """
    detector = PlatformDetector()
    return detector.platform_info["hardware"]


def create_platform_profile(model_type: str, browser: Optional[str] = None, version: Optional[float] = None) -> Dict[str, Any]:
    """
    Create platform-specific configuration profile for a model type.
    
    Args:
        model_type: Type of model (text, vision, audio, multimodal)
        browser: Optional browser name to override detection
        version: Optional browser version to override detection
        
    Returns:
        Optimized configuration dictionary
    """
    detector = PlatformDetector(browser, version)
    return detector.create_configuration(model_type)


def detect_platform() -> Dict[str, Any]:
    """
    Detect platform capabilities.
    
    Returns:
        Dictionary with platform capabilities
    """
    detector = PlatformDetector()
    return detector.platform_info


def detect_browser_features() -> Dict[str, Any]:
    """
    Detect browser features.
    
    Returns:
        Dictionary with browser features
    """
    detector = PlatformDetector()
    return {
        "browser": detector.platform_info["browser"]["name"],
        "version": detector.platform_info["browser"]["version"],
        "mobile": detector.platform_info["browser"]["is_mobile"],
        "user_agent": detector.platform_info["browser"]["user_agent"],
        "features": detector.platform_info["features"],
        "platform": detector.platform_info["hardware"]["platform"],
        "device_type": "mobile" if detector.platform_info["browser"]["is_mobile"] else "desktop"
    }


def get_feature_support_matrix() -> Dict[str, Dict[str, bool]]:
    """
    Get feature support matrix for major browsers.
    
    Returns:
        Dictionary mapping browser names to feature support status
    """
    browsers = ["chrome", "firefox", "safari", "edge"]
    features = [
        "webgpu", "compute_shaders", "shader_precompilation", 
        "2bit_precision", "3bit_precision", "4bit_precision", 
        "parallel_loading", "kv_cache", "model_sharding"
    ]
    
    matrix = {}
    
    for browser in browsers:
        detector = PlatformDetector(browser=browser)
        browser_support = {}
        
        # Check standard features
        browser_support["webgpu"] = detector.supports_feature("webgpu")
        browser_support["compute_shaders"] = detector.supports_feature("compute_shaders")
        browser_support["shader_precompilation"] = detector.supports_feature("shader_precompilation")
        browser_support["ultra_low_precision"] = detector.supports_feature("ultra_low_precision")
        
        # Check optimization profile for precision support
        profile = detector.get_optimization_profile()
        browser_support["2bit_precision"] = "2bit" in profile["precision"]["supported"]
        browser_support["3bit_precision"] = "3bit" in profile["precision"]["supported"]
        browser_support["4bit_precision"] = "4bit" in profile["precision"]["supported"]
        
        # Check other features
        browser_support["parallel_loading"] = profile["loading"]["parallel_loading"]
        browser_support["kv_cache"] = profile["memory"]["kv_cache_optimization"]
        
        matrix[browser] = browser_support
    
    return matrix