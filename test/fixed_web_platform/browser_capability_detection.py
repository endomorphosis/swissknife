#!/usr/bin/env python3
"""
Browser Capability Detection for Web Platforms (June 2025)

This module provides comprehensive browser detection and capability analysis:

- Detect browser type, version, and platform
- Analyze WebGPU, WebNN, and WebAssembly support
- Detect Metal API support for Safari
- Provide optimized configuration based on detected capabilities
- Collect and report telemetry about browser performance

Usage:
    from fixed_web_platform.browser_capability_detection import (
        detect_browser_capabilities,
        get_optimized_config,
        is_safari_with_metal_api
    )
    
    # Get all browser capabilities
    capabilities = detect_browser_capabilities()
    
    # Check if browser supports specific feature
    if capabilities['webgpu_supported']:
        # Use WebGPU backend
    elif capabilities['webnn_supported']:
        # Fall back to WebNN
    else:
        # Use WebAssembly fallback
        
    # Get optimized configuration for a model
    config = get_optimized_config(
        model_name="llama-7b",
        browser_capabilities=capabilities
    )
"""

import os
import re
import json
import logging
import platform
from typing import Dict, List, Any, Optional, Tuple, Union, Set

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("browser_capability_detection")

# Browser identification constants
CHROME_REGEX = r'Chrome/([0-9]+)'
FIREFOX_REGEX = r'Firefox/([0-9]+)'
SAFARI_REGEX = r'Safari/([0-9]+)'
EDGE_REGEX = r'Edg/([0-9]+)'

# WebGPU support minimum versions
WEBGPU_MIN_VERSIONS = {
    "Chrome": 113,
    "Firefox": 117,
    "Safari": 17,  # Safari 17 added initial WebGPU support
    "Edge": 113
}

# Metal API support minimum versions for Safari
METAL_API_MIN_VERSION = 17.2  # Safari 17.2+ has better Metal API integration

# WebNN support minimum versions
WEBNN_MIN_VERSIONS = {
    "Chrome": 122,  # Chrome/Edge got WebNN later
    "Firefox": 126,  # Firefox is still implementing WebNN
    "Safari": 17,   # Safari added early WebNN support
    "Edge": 122
}

def detect_browser_capabilities(user_agent: Optional[str] = None) -> Dict[str, Any]:
    """
    Detect browser capabilities from user agent string.
    
    Args:
        user_agent: User agent string (optional, uses simulated one if not provided)
        
    Returns:
        Dictionary of browser capabilities
    """
    # If no user agent provided, try to detect from environment or simulate
    if not user_agent:
        user_agent = os.environ.get("HTTP_USER_AGENT", "")
    
    # If still no user agent, use a simulated one
    if not user_agent:
        # In a real browser this would use the actual UA, here we simulate
        systems = {
            'darwin': 'Mac OS X 10_15_7',
            'win32': 'Windows NT 10.0',
            'linux': 'X11; Linux x86_64'
        }
        system_string = systems.get(platform.system().lower(), systems['linux'])
        
        user_agent = f"Mozilla/5.0 ({system_string}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    
    # Initialize capabilities with default values
    capabilities = {
        "browser_name": "Unknown",
        "browser_version": 0,
        "is_mobile": False,
        "platform": "Unknown",
        "os_version": "Unknown",
        "webgpu_supported": False,
        "webgpu_features": {
            "compute_shaders": False,
            "shader_compilation": False,
            "parallel_compilation": False,
            "storage_textures": False,
            "depth_clip_control": False,
            "indirect_first_instance": False
        },
        "webnn_supported": False,
        "webnn_features": {
            "gpu_acceleration": False,
            "nchw_layout": False,
            "quantized_operations": False
        },
        "wasm_supported": True,  # Most modern browsers support WebAssembly
        "wasm_features": {
            "simd": False,
            "threads": False,
            "bulk_memory": False,
            "shared_memory": False,
            "exception_handling": False
        },
        "metal_api_supported": False,
        "metal_api_version": 0.0,
        "recommended_backend": "wasm",  # Default to most compatible
        "memory_limits": {
            "estimated_total_mb": 4096,  # Reasonable default 
            "estimated_available_mb": 2048,
            "max_texture_size": 8192,
            "max_buffer_size_mb": 256
        }
    }
    
    # Detect browser name and version
    browser_info = _parse_browser_info(user_agent)
    capabilities.update(browser_info)
    
    # Detect platform and device info
    platform_info = _parse_platform_info(user_agent)
    capabilities.update(platform_info)
    
    # Check WebGPU support based on browser and version
    capabilities = _check_webgpu_support(capabilities)
    
    # Check WebNN support based on browser and version
    capabilities = _check_webnn_support(capabilities)
    
    # Check WebAssembly advanced features
    capabilities = _check_wasm_features(capabilities)
    
    # Check Safari Metal API support
    if capabilities["browser_name"] == "Safari":
        capabilities = _check_safari_metal_api_support(capabilities)
    
    # Determine memory limits based on browser and platform
    capabilities = _estimate_memory_limits(capabilities)
    
    # Determine recommended backend based on capabilities
    capabilities = _determine_recommended_backend(capabilities)
    
    logger.info(f"Detected browser: {capabilities['browser_name']} {capabilities['browser_version']}")
    logger.info(f"WebGPU supported: {capabilities['webgpu_supported']}")
    logger.info(f"WebNN supported: {capabilities['webnn_supported']}")
    logger.info(f"Recommended backend: {capabilities['recommended_backend']}")
    
    return capabilities

def _parse_browser_info(user_agent: str) -> Dict[str, Any]:
    """
    Parse browser name and version from user agent string.
    
    Args:
        user_agent: User agent string
        
    Returns:
        Dictionary with browser info
    """
    browser_info = {
        "browser_name": "Unknown",
        "browser_version": 0
    }
    
    # Check Chrome (must come before Safari due to UA overlaps)
    chrome_match = re.search(CHROME_REGEX, user_agent)
    if chrome_match:
        # Check if Edge, which also contains Chrome in UA
        edge_match = re.search(EDGE_REGEX, user_agent)
        if edge_match:
            browser_info["browser_name"] = "Edge"
            browser_info["browser_version"] = int(edge_match.group(1))
        else:
            browser_info["browser_name"] = "Chrome"
            browser_info["browser_version"] = int(chrome_match.group(1))
        return browser_info
    
    # Check Firefox
    firefox_match = re.search(FIREFOX_REGEX, user_agent)
    if firefox_match:
        browser_info["browser_name"] = "Firefox"
        browser_info["browser_version"] = int(firefox_match.group(1))
        return browser_info
    
    # Check Safari (do this last as Chrome also contains Safari in UA)
    if "Safari" in user_agent and "Chrome" not in user_agent:
        safari_version = re.search(r'Version/(\d+\.\d+)', user_agent)
        if safari_version:
            browser_info["browser_name"] = "Safari"
            browser_info["browser_version"] = float(safari_version.group(1))
        else:
            # If we can't find Version/X.Y, use Safari/XXX as fallback
            safari_match = re.search(SAFARI_REGEX, user_agent)
            if safari_match:
                browser_info["browser_name"] = "Safari"
                browser_info["browser_version"] = int(safari_match.group(1))
    
    return browser_info

def _parse_platform_info(user_agent: str) -> Dict[str, Any]:
    """
    Parse platform information from user agent string.
    
    Args:
        user_agent: User agent string
        
    Returns:
        Dictionary with platform info
    """
    platform_info = {
        "platform": "Unknown",
        "os_version": "Unknown",
        "is_mobile": False
    }
    
    # Check for mobile devices
    if any(mobile_os in user_agent for mobile_os in ["Android", "iPhone", "iPad"]):
        platform_info["is_mobile"] = True
        
        if "iPhone" in user_agent or "iPad" in user_agent:
            platform_info["platform"] = "iOS"
            ios_match = re.search(r'OS (\d+_\d+)', user_agent)
            if ios_match:
                platform_info["os_version"] = ios_match.group(1).replace('_', '.')
        elif "Android" in user_agent:
            platform_info["platform"] = "Android"
            android_match = re.search(r'Android (\d+\.\d+)', user_agent)
            if android_match:
                platform_info["os_version"] = android_match.group(1)
    else:
        # Desktop platforms
        if "Windows" in user_agent:
            platform_info["platform"] = "Windows"
            win_match = re.search(r'Windows NT (\d+\.\d+)', user_agent)
            if win_match:
                platform_info["os_version"] = win_match.group(1)
        elif "Mac OS X" in user_agent:
            platform_info["platform"] = "macOS"
            mac_match = re.search(r'Mac OS X (\d+[._]\d+)', user_agent)
            if mac_match:
                platform_info["os_version"] = mac_match.group(1).replace('_', '.')
        elif "Linux" in user_agent:
            platform_info["platform"] = "Linux"
    
    return platform_info

def _check_webgpu_support(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check WebGPU support based on browser and version.
    
    Args:
        capabilities: Current capabilities dictionary
        
    Returns:
        Updated capabilities dictionary
    """
    browser = capabilities["browser_name"]
    version = capabilities["browser_version"]
    
    # Check if browser and version support WebGPU
    min_version = WEBGPU_MIN_VERSIONS.get(browser, 999)
    capabilities["webgpu_supported"] = version >= min_version
    
    # On mobile, WebGPU support is more limited
    if capabilities["is_mobile"]:
        if browser == "Safari" and capabilities["platform"] == "iOS":
            # iOS Safari got WebGPU in 17.0
            capabilities["webgpu_supported"] = version >= 17.0
        else:
            # Limited support on other mobile browsers
            capabilities["webgpu_supported"] = False
    
    # If WebGPU is supported, determine available features
    if capabilities["webgpu_supported"]:
        # Chrome and Edge have the most complete WebGPU implementation
        if browser in ["Chrome", "Edge"]:
            capabilities["webgpu_features"] = {
                "compute_shaders": True,
                "shader_compilation": True,
                "parallel_compilation": True,
                "storage_textures": True,
                "depth_clip_control": True,
                "indirect_first_instance": version >= 115
            }
        # Firefox has good but not complete WebGPU implementation
        elif browser == "Firefox":
            capabilities["webgpu_features"] = {
                "compute_shaders": True,
                "shader_compilation": True,
                "parallel_compilation": version >= 120,
                "storage_textures": True,
                "depth_clip_control": version >= 119,
                "indirect_first_instance": False
            }
        # Safari WebGPU implementation is improving but has limitations
        elif browser == "Safari":
            capabilities["webgpu_features"] = {
                "compute_shaders": version >= 17.1,  # Available in later 17.x
                "shader_compilation": True,
                "parallel_compilation": False,
                "storage_textures": version >= 17.1,
                "depth_clip_control": False,
                "indirect_first_instance": False
            }
    
    return capabilities

def _check_webnn_support(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check WebNN support based on browser and version.
    
    Args:
        capabilities: Current capabilities dictionary
        
    Returns:
        Updated capabilities dictionary
    """
    browser = capabilities["browser_name"]
    version = capabilities["browser_version"]
    
    # Check if browser and version support WebNN
    min_version = WEBNN_MIN_VERSIONS.get(browser, 999)
    capabilities["webnn_supported"] = version >= min_version
    
    # Safari has prioritized WebNN implementation
    if browser == "Safari":
        capabilities["webnn_supported"] = version >= 17.0
        # WebNN features in Safari
        if capabilities["webnn_supported"]:
            capabilities["webnn_features"] = {
                "gpu_acceleration": True,
                "nchw_layout": True,
                "quantized_operations": version >= 17.2
            }
    # Chrome/Edge WebNN implementation
    elif browser in ["Chrome", "Edge"]:
        # WebNN features in Chrome/Edge
        if capabilities["webnn_supported"]:
            capabilities["webnn_features"] = {
                "gpu_acceleration": True,
                "nchw_layout": True,
                "quantized_operations": version >= 123
            }
    # Firefox WebNN implementation is still in progress
    elif browser == "Firefox":
        # WebNN features in Firefox
        if capabilities["webnn_supported"]:
            capabilities["webnn_features"] = {
                "gpu_acceleration": True,
                "nchw_layout": False,
                "quantized_operations": False
            }
    
    return capabilities

def _check_wasm_features(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check WebAssembly feature support.
    
    Args:
        capabilities: Current capabilities dictionary
        
    Returns:
        Updated capabilities dictionary
    """
    browser = capabilities["browser_name"]
    version = capabilities["browser_version"]
    
    # Most modern browsers support basic WebAssembly
    capabilities["wasm_supported"] = True
    
    # Chrome/Edge WASM features
    if browser in ["Chrome", "Edge"]:
        capabilities["wasm_features"] = {
            "simd": version >= 91,
            "threads": version >= 74,
            "bulk_memory": version >= 80,
            "shared_memory": version >= 74,
            "exception_handling": version >= 107
        }
    # Firefox WASM features
    elif browser == "Firefox":
        capabilities["wasm_features"] = {
            "simd": version >= 89,
            "threads": version >= 79,
            "bulk_memory": version >= 79,
            "shared_memory": version >= 79,
            "exception_handling": version >= 115
        }
    # Safari WASM features
    elif browser == "Safari":
        capabilities["wasm_features"] = {
            "simd": version >= 16.4,
            "threads": version >= 16.4,
            "bulk_memory": version >= 15.2,
            "shared_memory": version >= 16.4,
            "exception_handling": False  # Not yet supported
        }
    # Default for unknown browsers - assume basic support only
    else:
        capabilities["wasm_features"] = {
            "simd": False,
            "threads": False,
            "bulk_memory": False,
            "shared_memory": False,
            "exception_handling": False
        }
    
    return capabilities

def _check_safari_metal_api_support(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check Safari Metal API support.
    
    Args:
        capabilities: Current capabilities dictionary
        
    Returns:
        Updated capabilities dictionary
    """
    # Only relevant for Safari
    if capabilities["browser_name"] != "Safari":
        return capabilities
    
    version = capabilities["browser_version"]
    
    # Metal API available in Safari 17.2+
    if version >= METAL_API_MIN_VERSION:
        capabilities["metal_api_supported"] = True
        capabilities["metal_api_version"] = 2.0 if version >= 17.4 else 1.0
        
        # Update WebGPU features based on Metal API support
        if capabilities["webgpu_supported"]:
            capabilities["webgpu_features"]["compute_shaders"] = True
            capabilities["webgpu_features"]["storage_textures"] = True
    
    return capabilities

def _estimate_memory_limits(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Estimate memory limits based on browser and platform.
    
    Args:
        capabilities: Current capabilities dictionary
        
    Returns:
        Updated capabilities dictionary
    """
    browser = capabilities["browser_name"]
    is_mobile = capabilities["is_mobile"]
    platform = capabilities["platform"]
    
    # Default memory limits
    memory_limits = {
        "estimated_total_mb": 4096,     # 4GB default for desktop
        "estimated_available_mb": 2048, # 2GB default for ML models
        "max_texture_size": 8192,       # Default texture size
        "max_buffer_size_mb": 256       # Default buffer size
    }
    
    # Adjust based on platform
    if is_mobile:
        # Mobile devices have less memory
        memory_limits = {
            "estimated_total_mb": 2048,    # 2GB for mobile
            "estimated_available_mb": 512, # 0.5GB for ML models
            "max_texture_size": 4096,      # Reduced texture size
            "max_buffer_size_mb": 128      # Reduced buffer size
        }
        
        # iOS has additional constraints
        if platform == "iOS":
            # Safari on iOS has tighter memory constraints
            if browser == "Safari":
                memory_limits["max_buffer_size_mb"] = 96
    else:
        # Desktop-specific adjustments
        if browser == "Chrome" or browser == "Edge":
            memory_limits["max_buffer_size_mb"] = 2048  # Chrome allows larger buffers
        elif browser == "Firefox":
            memory_limits["max_buffer_size_mb"] = 1024  # Firefox is middle ground
        elif browser == "Safari":
            # Safari has historically had tighter memory constraints
            memory_limits["estimated_available_mb"] = 1536
            memory_limits["max_buffer_size_mb"] = 512
    
    capabilities["memory_limits"] = memory_limits
    return capabilities

def _determine_recommended_backend(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    """
    Determine the recommended backend based on capabilities.
    
    Args:
        capabilities: Current capabilities dictionary
        
    Returns:
        Updated capabilities dictionary with recommended backend
    """
    # Start with the most powerful backend and fall back
    if capabilities["webgpu_supported"]:
        # Safari with Metal API can use specialized backend
        if (capabilities["browser_name"] == "Safari" and 
            capabilities["metal_api_supported"]):
            capabilities["recommended_backend"] = "webgpu_metal"
        else:
            capabilities["recommended_backend"] = "webgpu"
    elif capabilities["webnn_supported"]:
        capabilities["recommended_backend"] = "webnn"
    else:
        # WebAssembly with best available features
        if capabilities["wasm_features"]["simd"] and capabilities["wasm_features"]["threads"]:
            capabilities["recommended_backend"] = "wasm_optimized"
        else:
            capabilities["recommended_backend"] = "wasm_basic"
    
    return capabilities

def is_safari_with_metal_api(capabilities: Dict[str, Any]) -> bool:
    """
    Check if the browser is Safari with Metal API support.
    
    Args:
        capabilities: Browser capabilities dictionary
        
    Returns:
        True if browser is Safari with Metal API support
    """
    return (capabilities["browser_name"] == "Safari" and 
            capabilities["metal_api_supported"])

def get_optimized_config(
    model_name: str,
    browser_capabilities: Dict[str, Any],
    model_size_mb: Optional[int] = None
) -> Dict[str, Any]:
    """
    Get optimized configuration for model based on browser capabilities.
    
    Args:
        model_name: Name of the model
        browser_capabilities: Browser capabilities dictionary
        model_size_mb: Optional model size in MB (if known)
        
    Returns:
        Optimized configuration dictionary
    """
    # Start with defaults based on browser
    config = {
        "model_name": model_name,
        "backend": browser_capabilities["recommended_backend"],
        "progressive_loading": True,
        "memory_optimization": "balanced",
        "max_chunk_size_mb": 50,
        "use_shader_precompilation": browser_capabilities["webgpu_supported"],
        "use_compute_shaders": browser_capabilities["webgpu_features"]["compute_shaders"],
        "parallel_loading": browser_capabilities["webgpu_features"]["parallel_compilation"],
        "use_quantization": False,
        "precision": "float16",
        "special_optimizations": []
    }
    
    # Estimate model size if not provided
    if not model_size_mb:
        if "bert" in model_name.lower():
            model_size_mb = 400
        elif "clip" in model_name.lower():
            model_size_mb = 600
        elif "llama" in model_name.lower() or "gpt" in model_name.lower():
            # Estimate based on parameter count in name
            if "7b" in model_name.lower():
                model_size_mb = 7000
            elif "13b" in model_name.lower():
                model_size_mb = 13000
            else:
                model_size_mb = 1000  # Default to 1GB for small LLMs
        else:
            model_size_mb = 500  # Default medium size
    
    # Check if model will fit in memory
    available_memory = browser_capabilities["memory_limits"]["estimated_available_mb"]
    memory_ratio = model_size_mb / available_memory
    
    # Adjust configuration based on memory constraints
    if memory_ratio > 2.0:
        # Severe memory constraints - aggressive optimization
        config["memory_optimization"] = "aggressive"
        config["max_chunk_size_mb"] = 20
        config["use_quantization"] = True
        config["precision"] = "int8"
        config["special_optimizations"].append("ultra_low_memory")
    elif memory_ratio > 1.0:
        # Significant memory constraints - use quantization
        config["memory_optimization"] = "aggressive"
        config["max_chunk_size_mb"] = 30
        config["use_quantization"] = True
        config["precision"] = "int8"
    elif memory_ratio > 0.6:
        # Moderate memory constraints
        config["memory_optimization"] = "balanced"
        config["use_quantization"] = browser_capabilities["webnn_features"].get("quantized_operations", False)
        
    # Safari-specific optimizations
    if browser_capabilities["browser_name"] == "Safari":
        # Apply Metal API optimizations for Safari 17.2+
        if browser_capabilities["metal_api_supported"]:
            config["special_optimizations"].append("metal_api_integration")
            
            # Metal API 2.0 has additional features
            if browser_capabilities["metal_api_version"] >= 2.0:
                config["special_optimizations"].append("metal_performance_shaders")
        
        # Safari doesn't handle parallel loading well
        config["parallel_loading"] = False
        
        # Adjust chunk size based on Safari version
        if browser_capabilities["browser_version"] < 17.0:
            config["max_chunk_size_mb"] = min(config["max_chunk_size_mb"], 30)
    
    # Chrome-specific optimizations
    elif browser_capabilities["browser_name"] == "Chrome":
        # Chrome has good compute shader support
        if browser_capabilities["webgpu_features"]["compute_shaders"]:
            config["special_optimizations"].append("optimized_compute_shaders")
            
        # Chrome benefits from SIMD WASM acceleration
        if browser_capabilities["wasm_features"]["simd"]:
            config["special_optimizations"].append("wasm_simd_acceleration")
    
    # Firefox-specific optimizations
    elif browser_capabilities["browser_name"] == "Firefox":
        # Firefox benefits from specialized shader optimizations
        if browser_capabilities["webgpu_features"]["shader_compilation"]:
            config["special_optimizations"].append("firefox_shader_optimizations")
    
    # Mobile-specific optimizations
    if browser_capabilities["is_mobile"]:
        config["memory_optimization"] = "aggressive"
        config["max_chunk_size_mb"] = min(config["max_chunk_size_mb"], 20)
        config["special_optimizations"].append("mobile_optimized")
        
        # More aggressive for iOS
        if browser_capabilities["platform"] == "iOS":
            config["use_quantization"] = True
            config["precision"] = "int8"
    
    # Add Ultra-Low Precision for very large models that support it
    if (model_size_mb > 5000 and 
        "llama" in model_name.lower() and
        browser_capabilities["webgpu_supported"] and
        browser_capabilities["webgpu_features"]["compute_shaders"]):
        config["special_optimizations"].append("ultra_low_precision")
        
    # Progressive Loading is necessary for large models
    if model_size_mb > 1000:
        config["progressive_loading"] = True
        # Adjust chunk size for very large models
        if model_size_mb > 7000:
            config["max_chunk_size_mb"] = min(config["max_chunk_size_mb"], 40)
    
    return config

if __name__ == "__main__":
    print("Browser Capability Detection for Web Platforms")
    
    # Test with different user agents
    user_agents = [
        # Chrome 120 on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        # Safari 17.3 on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        # Safari 17.0 on iOS
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        # Firefox 118 on Linux
        "Mozilla/5.0 (X11; Linux x86_64; rv:118.0) Gecko/20100101 Firefox/118.0",
        # Edge 120 on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
    ]
    
    for ua in user_agents:
        print(f"\nTesting user agent: {ua[:50]}...")
        capabilities = detect_browser_capabilities(ua)
        
        # Print key capabilities
        print(f"Browser: {capabilities['browser_name']} {capabilities['browser_version']}")
        print(f"Platform: {capabilities['platform']} (Mobile: {capabilities['is_mobile']})")
        print(f"WebGPU Support: {capabilities['webgpu_supported']}")
        print(f"WebNN Support: {capabilities['webnn_supported']}")
        print(f"Metal API Support: {capabilities['metal_api_supported']}")
        print(f"Recommended Backend: {capabilities['recommended_backend']}")
        
        # Test optimized config with different models
        for model in ["bert-base-uncased", "llama-7b"]:
            config = get_optimized_config(model, capabilities)
            print(f"\nOptimized config for {model}:")
            print(f"  Backend: {config['backend']}")
            print(f"  Memory optimization: {config['memory_optimization']}")
            print(f"  Quantization: {config['use_quantization']}")
            print(f"  Special optimizations: {', '.join(config['special_optimizations']) if config['special_optimizations'] else 'None'}")