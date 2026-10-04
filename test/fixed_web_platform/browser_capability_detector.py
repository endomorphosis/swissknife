#!/usr/bin/env python3
"""
Browser Capability Detector for Web Platform (June 2025)

This module provides comprehensive browser capability detection for WebGPU and WebAssembly,
with optimization profile generation for different browsers:

- Detects WebGPU feature support (compute shaders, shader precompilation, etc.)
- Detects WebAssembly capabilities (SIMD, threads, bulk memory, etc.)
- Creates browser-specific optimization profiles
- Generates adaptation strategies for different hardware/software combinations
- Provides runtime feature monitoring and adaptation

Usage:
    from fixed_web_platform.browser_capability_detector import (
        BrowserCapabilityDetector,
        create_browser_optimization_profile,
        get_hardware_capabilities
    )
    
    # Create detector and get capabilities
    detector = BrowserCapabilityDetector()
    capabilities = detector.get_capabilities()
    
    # Create optimization profile for browser
    profile = create_browser_optimization_profile(
        browser_info={"name": "chrome", "version": 115},
        capabilities=capabilities
    )
    
    # Get hardware-specific capabilities
    hardware_caps = get_hardware_capabilities()
"""

import os
import sys
import json
import time
import logging
import platform
import subprocess
from typing import Dict, List, Any, Optional, Union, Tuple

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class BrowserCapabilityDetector:
    """
    Detects browser capabilities for WebGPU and WebAssembly.
    """
    
    def __init__(self):
        """Initialize the browser capability detector."""
        # Detect capabilities on initialization
        self.capabilities = {
            "webgpu": self._detect_webgpu_support(),
            "webnn": self._detect_webnn_support(),
            "webassembly": self._detect_webassembly_support(),
            "browser_info": self._detect_browser_info(),
            "hardware_info": self._detect_hardware_info()
        }
        
        # Derived optimization settings based on capabilities
        self.optimization_profile = self._create_optimization_profile()
        
        logger.info(f"Browser capability detection complete. WebGPU available: {self.capabilities['webgpu']['available']}")
    
    def _detect_webgpu_support(self) -> Dict[str, Any]:
        """
        Detect WebGPU availability and feature support.
        
        Returns:
            Dictionary of WebGPU capabilities
        """
        webgpu_support = {
            "available": False,
            "compute_shaders": False,
            "shader_precompilation": False,
            "storage_texture_binding": False,
            "depth_texture_binding": False,
            "indirect_dispatch": False,
            "advanced_filtering": False,
            "vertex_writable_storage": False,
            "mapped_memory_usage": False,
            "byte_indexed_binding": False,
            "texture_compression": False,
            "features": []
        }
        
        browser_info = self._detect_browser_info()
        browser_name = browser_info.get("name", "").lower()
        browser_version = browser_info.get("version", 0)
        
        # Base WebGPU support by browser
        if browser_name in ["chrome", "chromium", "edge"]:
            if browser_version >= 113:  # Chrome/Edge 113+ has good WebGPU support
                webgpu_support["available"] = True
                webgpu_support["compute_shaders"] = True
                webgpu_support["shader_precompilation"] = True
                webgpu_support["storage_texture_binding"] = True
                webgpu_support["features"] = [
                    "compute_shaders", "shader_precompilation", 
                    "timestamp_query", "texture_compression_bc",
                    "depth24unorm-stencil8", "depth32float-stencil8"
                ]
        elif browser_name == "firefox":
            if browser_version >= 118:  # Firefox 118+ has WebGPU support
                webgpu_support["available"] = True
                webgpu_support["compute_shaders"] = True
                webgpu_support["shader_precompilation"] = False  # Limited support
                webgpu_support["features"] = [
                    "compute_shaders", "texture_compression_bc"
                ]
        elif browser_name == "safari":
            if browser_version >= 17.0:  # Safari 17+ has WebGPU support
                webgpu_support["available"] = True
                webgpu_support["compute_shaders"] = False  # Limited in Safari
                webgpu_support["shader_precompilation"] = False
                webgpu_support["features"] = [
                    "texture_compression_etc2"
                ]
        
        # Update with experimental features based on environment variables
        if "WEBGPU_ENABLE_UNSAFE_APIS" in os.environ:
            if browser_name in ["chrome", "chromium", "edge", "firefox"]:
                webgpu_support["indirect_dispatch"] = True
                webgpu_support["features"].append("indirect_dispatch")
        
        # Add browser-specific features
        if browser_name == "chrome" or browser_name == "edge":
            if browser_version >= 115:
                webgpu_support["mapped_memory_usage"] = True
                webgpu_support["features"].append("mapped_memory_usage")
        
        logger.debug(f"Detected WebGPU support: {webgpu_support}")
        return webgpu_support
    
    def _detect_webnn_support(self) -> Dict[str, Any]:
        """
        Detect WebNN availability and feature support.
        
        Returns:
            Dictionary of WebNN capabilities
        """
        webnn_support = {
            "available": False,
            "cpu_backend": False,
            "gpu_backend": False,
            "npu_backend": False,
            "operators": []
        }
        
        browser_info = self._detect_browser_info()
        browser_name = browser_info.get("name", "").lower()
        browser_version = browser_info.get("version", 0)
        
        # Base WebNN support by browser
        if browser_name in ["chrome", "chromium", "edge"]:
            if browser_version >= 113:
                webnn_support["available"] = True
                webnn_support["cpu_backend"] = True
                webnn_support["gpu_backend"] = True
                webnn_support["operators"] = [
                    "conv2d", "matmul", "softmax", "relu", "gelu",
                    "averagepool2d", "maxpool2d", "gemm"
                ]
        elif browser_name == "safari":
            if browser_version >= 16.4:
                webnn_support["available"] = True
                webnn_support["cpu_backend"] = True
                webnn_support["gpu_backend"] = True
                webnn_support["operators"] = [
                    "conv2d", "matmul", "softmax", "relu",
                    "averagepool2d", "maxpool2d"
                ]
        
        logger.debug(f"Detected WebNN support: {webnn_support}")
        return webnn_support
    
    def _detect_webassembly_support(self) -> Dict[str, Any]:
        """
        Detect WebAssembly features and capabilities.
        
        Returns:
            Dictionary of WebAssembly capabilities
        """
        wasm_support = {
            "available": True,  # Basic WebAssembly is widely supported
            "simd": False,
            "threads": False,
            "bulk_memory": False,
            "reference_types": False,
            "multivalue": False,
            "exception_handling": False,
            "advanced_features": []
        }
        
        browser_info = self._detect_browser_info()
        browser_name = browser_info.get("name", "").lower()
        browser_version = browser_info.get("version", 0)
        
        # SIMD support
        if browser_name in ["chrome", "chromium", "edge"]:
            if browser_version >= 91:
                wasm_support["simd"] = True
                wasm_support["threads"] = True
                wasm_support["bulk_memory"] = True
                wasm_support["reference_types"] = True
                wasm_support["advanced_features"] = [
                    "simd", "threads", "bulk-memory", "reference-types"
                ]
        elif browser_name == "firefox":
            if browser_version >= 90:
                wasm_support["simd"] = True
                wasm_support["threads"] = True
                wasm_support["bulk_memory"] = True
                wasm_support["advanced_features"] = [
                    "simd", "threads", "bulk-memory"
                ]
        elif browser_name == "safari":
            if browser_version >= 16.4:
                wasm_support["simd"] = True
                wasm_support["bulk_memory"] = True
                wasm_support["advanced_features"] = [
                    "simd", "bulk-memory"
                ]
            if browser_version >= 17.0:
                wasm_support["threads"] = True
                wasm_support["advanced_features"].append("threads")
        
        logger.debug(f"Detected WebAssembly support: {wasm_support}")
        return wasm_support
    
    def _detect_browser_info(self) -> Dict[str, Any]:
        """
        Detect browser information.
        
        Returns:
            Dictionary of browser information
        """
        # In a real web environment, this would use navigator.userAgent
        # Here we simulate browser detection for testing
        
        # Check if environment variable is set for testing
        browser_env = os.environ.get("TEST_BROWSER", "")
        browser_version_env = os.environ.get("TEST_BROWSER_VERSION", "")
        
        if browser_env and browser_version_env:
            return {
                "name": browser_env.lower(),
                "version": float(browser_version_env),
                "user_agent": f"Test Browser {browser_env} {browser_version_env}",
                "platform": platform.system().lower(),
                "mobile": False
            }
        
        # Default to Chrome for simulation when no environment variables are set
        return {
            "name": "chrome",
            "version": 115.0,
            "user_agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "platform": platform.system().lower(),
            "mobile": False
        }
    
    def _detect_hardware_info(self) -> Dict[str, Any]:
        """
        Detect hardware information.
        
        Returns:
            Dictionary of hardware information
        """
        hardware_info = {
            "platform": platform.system().lower(),
            "cpu": {
                "cores": os.cpu_count(),
                "architecture": platform.machine()
            },
            "memory": {
                "total_gb": self._get_total_memory_gb()
            },
            "gpu": self._detect_gpu_info()
        }
        
        logger.debug(f"Detected hardware info: {hardware_info}")
        return hardware_info
    
    def _get_total_memory_gb(self) -> float:
        """
        Get total system memory in GB.
        
        Returns:
            Total memory in GB
        """
        try:
            import psutil
            return round(psutil.virtual_memory().total / (1024**3), 1)
        except ImportError:
            # Fallback method
            if platform.system() == "Linux":
                try:
                    with open("/proc/meminfo", "r") as f:
                        for line in f:
                            if "MemTotal" in line:
                                kb = int(line.split()[1])
                                return round(kb / (1024**2), 1)
                except:
                    pass
            
            # Default value when detection fails
            return 8.0
    
    def _detect_gpu_info(self) -> Dict[str, Any]:
        """
        Detect GPU information.
        
        Returns:
            Dictionary of GPU information
        """
        gpu_info = {
            "vendor": "unknown",
            "model": "unknown",
            "memory_mb": 0
        }
        
        try:
            # Simple detection for common GPUs
            if platform.system() == "Linux":
                try:
                    gpu_cmd = "lspci | grep -i 'vga\\|3d\\|display'"
                    result = subprocess.run(gpu_cmd, shell=True, check=True, stdout=subprocess.PIPE, text=True)
                    
                    if "nvidia" in result.stdout.lower():
                        gpu_info["vendor"] = "nvidia"
                    elif "amd" in result.stdout.lower() or "radeon" in result.stdout.lower():
                        gpu_info["vendor"] = "amd"
                    elif "intel" in result.stdout.lower():
                        gpu_info["vendor"] = "intel"
                    
                    # Extract model name (simplified)
                    for line in result.stdout.splitlines():
                        if gpu_info["vendor"] in line.lower():
                            parts = line.split(':')
                            if len(parts) >= 3:
                                gpu_info["model"] = parts[2].strip()
                except:
                    pass
            elif platform.system() == "Darwin":  # macOS
                gpu_info["vendor"] = "apple"
                gpu_info["model"] = "apple silicon"  # or "intel integrated" for older Macs
            
            # In a real web environment, this would use the WebGPU API
            # to get detailed GPU information
            
        except Exception as e:
            logger.warning(f"Error detecting GPU info: {e}")
        
        return gpu_info
    
    def _create_optimization_profile(self) -> Dict[str, Any]:
        """
        Create optimization profile based on detected capabilities.
        
        Returns:
            Dictionary with optimization settings
        """
        browser_info = self.capabilities["browser_info"]
        webgpu_caps = self.capabilities["webgpu"]
        webnn_caps = self.capabilities["webnn"]
        wasm_caps = self.capabilities["webassembly"]
        hardware_info = self.capabilities["hardware_info"]
        
        # Base profile
        profile = {
            "precision": {
                "default": 4,  # Default to 4-bit precision
                "attention": 8, # Higher precision for attention
                "kv_cache": 4,  # KV cache precision
                "embedding": 8,  # Embedding precision
                "feed_forward": 4, # Feed-forward precision
                "ultra_low_precision_enabled": False  # 2-bit/3-bit support
            },
            "loading": {
                "progressive_loading": True,
                "parallel_loading": webgpu_caps["available"],
                "memory_optimized": True,
                "component_caching": True
            },
            "compute": {
                "use_webgpu": webgpu_caps["available"],
                "use_webnn": webnn_caps["available"],
                "use_wasm": True,
                "use_wasm_simd": wasm_caps["simd"],
                "use_compute_shaders": webgpu_caps["compute_shaders"],
                "use_shader_precompilation": webgpu_caps["shader_precompilation"],
                "workgroup_size": (128, 1, 1)  # Default workgroup size
            },
            "memory": {
                "kv_cache_optimization": webgpu_caps["available"],
                "offload_weights": hardware_info["memory"]["total_gb"] < 8,
                "dynamic_tensor_allocation": True,
                "texture_compression": webgpu_caps["texture_compression"]
            }
        }
        
        # Apply browser-specific optimizations
        browser_name = browser_info.get("name", "").lower()
        
        if browser_name == "chrome" or browser_name == "edge":
            # Chrome/Edge can handle lower precision
            profile["precision"]["default"] = 4
            profile["precision"]["ultra_low_precision_enabled"] = webgpu_caps["available"]
            profile["compute"]["workgroup_size"] = (128, 1, 1)
            
        elif browser_name == "firefox":
            # Firefox has excellent compute shader performance
            profile["compute"]["workgroup_size"] = (256, 1, 1)
            if webgpu_caps["compute_shaders"]:
                profile["compute"]["use_compute_shaders"] = True
                
        elif browser_name == "safari":
            # Safari needs higher precision and has WebGPU limitations
            profile["precision"]["default"] = 8
            profile["precision"]["kv_cache"] = 8
            profile["precision"]["ultra_low_precision_enabled"] = False
            profile["compute"]["use_shader_precompilation"] = False
            profile["compute"]["workgroup_size"] = (64, 1, 1)  # Smaller workgroups for Safari
        
        # Apply hardware-specific optimizations
        gpu_vendor = hardware_info["gpu"]["vendor"].lower()
        
        if gpu_vendor == "nvidia":
            profile["compute"]["workgroup_size"] = (128, 1, 1)
        elif gpu_vendor == "amd":
            profile["compute"]["workgroup_size"] = (64, 1, 1)
        elif gpu_vendor == "intel":
            profile["compute"]["workgroup_size"] = (32, 1, 1)
        elif gpu_vendor == "apple":
            profile["compute"]["workgroup_size"] = (32, 1, 1)
        
        # Adjust model optimization based on available memory
        total_memory_gb = hardware_info["memory"]["total_gb"]
        if total_memory_gb < 4:
            profile["precision"]["default"] = 4
            profile["precision"]["attention"] = 4
            profile["memory"]["offload_weights"] = True
            profile["loading"]["progressive_loading"] = True
        elif total_memory_gb >= 16:
            # More memory allows for more features
            profile["precision"]["ultra_low_precision_enabled"] = profile["precision"]["ultra_low_precision_enabled"] and webgpu_caps["available"]
        
        logger.debug(f"Created optimization profile: {profile}")
        return profile
    
    def get_capabilities(self) -> Dict[str, Any]:
        """
        Get all detected capabilities.
        
        Returns:
            Dictionary with all capabilities
        """
        return self.capabilities
    
    def get_optimization_profile(self) -> Dict[str, Any]:
        """
        Get optimization profile based on detected capabilities.
        
        Returns:
            Dictionary with optimization settings
        """
        return self.optimization_profile
    
    def get_feature_support(self, feature_name: str) -> bool:
        """
        Check if a specific feature is supported.
        
        Args:
            feature_name: Name of the feature to check
            
        Returns:
            Boolean indicating support status
        """
        # WebGPU features
        if feature_name in ["webgpu", "gpu"]:
            return self.capabilities["webgpu"]["available"]
        elif feature_name == "compute_shaders":
            return self.capabilities["webgpu"]["compute_shaders"]
        elif feature_name == "shader_precompilation":
            return self.capabilities["webgpu"]["shader_precompilation"]
        
        # WebNN features
        elif feature_name in ["webnn", "ml"]:
            return self.capabilities["webnn"]["available"]
        
        # WebAssembly features
        elif feature_name == "wasm_simd":
            return self.capabilities["webassembly"]["simd"]
        elif feature_name == "wasm_threads":
            return self.capabilities["webassembly"]["threads"]
        
        # Precision features
        elif feature_name == "ultra_low_precision":
            return self.optimization_profile["precision"]["ultra_low_precision_enabled"]
        
        # Default for unknown features
        return False
    
    def to_json(self) -> str:
        """
        Convert capabilities and optimization profile to JSON.
        
        Returns:
            JSON string with capabilities and optimization profile
        """
        data = {
            "capabilities": self.capabilities,
            "optimization_profile": self.optimization_profile
        }
        return json.dumps(data, indent=2)


def create_browser_optimization_profile(browser_info: Dict[str, Any], capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create optimization profile specific to browser.
    
    Args:
        browser_info: Browser information dictionary
        capabilities: Capabilities dictionary
        
    Returns:
        Dictionary with optimization settings
    """
    browser_name = browser_info.get("name", "unknown").lower()
    browser_version = browser_info.get("version", 0)
    
    # Base profile with defaults
    profile = {
        "shader_precompilation": False,
        "compute_shaders": False,
        "parallel_loading": True,
        "precision": 4,  # Default to 4-bit precision
        "memory_optimizations": {},
        "fallback_strategy": "wasm",
        "workgroup_size": (128, 1, 1)
    }
    
    # Apply browser-specific optimizations
    if browser_name == "chrome" or browser_name == "edge":
        profile.update({
            "shader_precompilation": capabilities["webgpu"]["shader_precompilation"],
            "compute_shaders": capabilities["webgpu"]["compute_shaders"],
            "precision": 2 if capabilities["webgpu"]["available"] else 4,
            "memory_optimizations": {
                "use_memory_snapshots": True,
                "enable_zero_copy": True
            },
            "workgroup_size": (128, 1, 1)
        })
    elif browser_name == "firefox":
        profile.update({
            "shader_precompilation": capabilities["webgpu"]["shader_precompilation"],
            "compute_shaders": capabilities["webgpu"]["compute_shaders"],
            "precision": 3 if capabilities["webgpu"]["available"] else 4,
            "memory_optimizations": {
                "use_gpu_compressed_textures": True
            },
            "workgroup_size": (256, 1, 1)  # Firefox performs well with larger workgroups
        })
    elif browser_name == "safari":
        profile.update({
            "shader_precompilation": False,  # Safari struggles with this
            "compute_shaders": False,  # Limited support in Safari
            "precision": 8,  # Safari has issues with 4-bit and lower
            "memory_optimizations": {
                "progressive_loading": True
            },
            "fallback_strategy": "wasm",
            "workgroup_size": (64, 1, 1)  # Safari needs smaller workgroups
        })
    
    return profile


def get_hardware_capabilities() -> Dict[str, Any]:
    """
    Get hardware-specific capabilities.
    
    Returns:
        Dictionary with hardware capabilities
    """
    hardware_caps = {
        "platform": platform.system().lower(),
        "browser": os.environ.get("TEST_BROWSER", "chrome").lower(),
        "cpu": {
            "cores": os.cpu_count() or 4,
            "architecture": platform.machine()
        },
        "memory": {
            "total_gb": 8.0  # Default value
        },
        "gpu": {
            "vendor": "unknown",
            "model": "unknown",
            "memory_mb": 0
        }
    }
    
    # Try to detect actual total memory
    try:
        import psutil
        hardware_caps["memory"]["total_gb"] = round(psutil.virtual_memory().total / (1024**3), 1)
    except ImportError:
        # Fallback for environments without psutil
        pass
    
    # Try to detect GPU information
    try:
        if platform.system() == "Linux":
            # Simple GPU detection on Linux
            try:
                gpu_cmd = "lspci | grep -i 'vga\\|3d\\|display'"
                result = subprocess.run(gpu_cmd, shell=True, check=True, stdout=subprocess.PIPE, text=True)
                
                if "nvidia" in result.stdout.lower():
                    hardware_caps["gpu"]["vendor"] = "nvidia"
                elif "amd" in result.stdout.lower() or "radeon" in result.stdout.lower():
                    hardware_caps["gpu"]["vendor"] = "amd"
                elif "intel" in result.stdout.lower():
                    hardware_caps["gpu"]["vendor"] = "intel"
            except:
                pass
        elif platform.system() == "Darwin":  # macOS
            hardware_caps["gpu"]["vendor"] = "apple"
    except Exception as e:
        logger.warning(f"Error detecting GPU info: {e}")
    
    return hardware_caps


def get_optimization_for_browser(browser: str, version: float = 0) -> Dict[str, Any]:
    """
    Get optimization settings for a specific browser.
    
    Args:
        browser: Browser name
        version: Browser version
        
    Returns:
        Dictionary with optimization settings
    """
    # Create detector
    detector = BrowserCapabilityDetector()
    
    # Override browser info for testing specific browsers
    os.environ["TEST_BROWSER"] = browser
    os.environ["TEST_BROWSER_VERSION"] = str(version)
    
    # Get capabilities with overridden browser
    detector = BrowserCapabilityDetector()
    capabilities = detector.get_capabilities()
    
    # Create optimization profile
    profile = create_browser_optimization_profile(
        browser_info=capabilities["browser_info"],
        capabilities=capabilities
    )
    
    # Clean up environment variables
    if "TEST_BROWSER" in os.environ:
        del os.environ["TEST_BROWSER"]
    if "TEST_BROWSER_VERSION" in os.environ:
        del os.environ["TEST_BROWSER_VERSION"]
    
    return profile


def get_browser_feature_matrix() -> Dict[str, Dict[str, bool]]:
    """
    Generate feature support matrix for all major browsers.
    
    Returns:
        Dictionary mapping browser names to feature support
    """
    browsers = [
        ("chrome", 115),
        ("firefox", 118),
        ("safari", 17),
        ("edge", 115)
    ]
    
    features = [
        "webgpu",
        "webnn",
        "compute_shaders",
        "shader_precompilation",
        "wasm_simd",
        "wasm_threads",
        "parallel_loading",
        "ultra_low_precision"
    ]
    
    matrix = {}
    
    for browser, version in browsers:
        # Set environment variables for browser detection
        os.environ["TEST_BROWSER"] = browser
        os.environ["TEST_BROWSER_VERSION"] = str(version)
        
        # Create detector
        detector = BrowserCapabilityDetector()
        
        # Check features
        browser_features = {}
        for feature in features:
            browser_features[feature] = detector.get_feature_support(feature)
        
        matrix[f"{browser} {version}"] = browser_features
    
    # Clean up environment variables
    if "TEST_BROWSER" in os.environ:
        del os.environ["TEST_BROWSER"]
    if "TEST_BROWSER_VERSION" in os.environ:
        del os.environ["TEST_BROWSER_VERSION"]
    
    return matrix


if __name__ == "__main__":
    print("Browser Capability Detector")
    
    # Create detector
    detector = BrowserCapabilityDetector()
    
    # Get capabilities
    capabilities = detector.get_capabilities()
    
    # Get optimization profile
    profile = detector.get_optimization_profile()
    
    print(f"WebGPU available: {capabilities['webgpu']['available']}")
    print(f"WebNN available: {capabilities['webnn']['available']}")
    print(f"WASM SIMD supported: {capabilities['webassembly']['simd']}")
    
    print("\nOptimization Profile:")
    print(f"Default precision: {profile['precision']['default']}-bit")
    print(f"Ultra-low precision enabled: {profile['precision']['ultra_low_precision_enabled']}")
    print(f"Compute settings: {profile['compute']}")
    
    print("\nBrowser Feature Matrix:")
    matrix = get_browser_feature_matrix()
    for browser, features in matrix.items():
        print(f"\n{browser}:")
        for feature, supported in features.items():
            print(f"  {feature}: {'✅' if supported else '❌'}")