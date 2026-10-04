#!/usr/bin/env python3
"""
Web Platform Utilities for WebNN/WebGPU Integration

This module provides comprehensive utilities for integrating with WebNN and WebGPU 
implementations in browsers, including model initialization, inference, and browser
selection optimization.

Key features:
- WebNN/WebGPU model initialization and inference via WebSocket
- Browser-specific optimization for different model types
- IPFS acceleration configuration with P2P optimization
- Precision control (4-bit, 8-bit, 16-bit) with mixed precision support
- Firefox audio optimizations with compute shader workgroups
- Edge WebNN optimizations for text models

Updated: March 2025 with enhanced browser optimizations and IPFS integration
"""

import os
import json
import time
import logging
import asyncio
import platform as platform_module
from typing import Dict, Any, Optional, List, Union, Tuple

logger = logging.getLogger(__name__)

# Browser capability database
BROWSER_CAPABILITIES = {
    "firefox": {
        "webnn": {
            "supported": False,
            "models": []
        },
        "webgpu": {
            "supported": True,
            "compute_shaders": True,
            "optimized_for": ["audio", "speech", "asr"],
            "workgroup_config": "256x1x1",
            "models": ["whisper", "wav2vec2", "clap"]
        }
    },
    "chrome": {
        "webnn": {
            "supported": True,
            "models": ["bert", "t5", "vit"]
        },
        "webgpu": {
            "supported": True,
            "compute_shaders": True,
            "optimized_for": ["vision", "image"],
            "workgroup_config": "128x2x1",
            "models": ["vit", "clip", "detr"]
        }
    },
    "edge": {
        "webnn": {
            "supported": True,
            "preferred": True,
            "models": ["bert", "t5", "vit", "whisper"]
        },
        "webgpu": {
            "supported": True,
            "compute_shaders": True,
            "models": ["vit", "clip", "bert"]
        }
    },
    "safari": {
        "webnn": {
            "supported": True,
            "models": ["bert", "vit"]
        },
        "webgpu": {
            "supported": True,
            "compute_shaders": False,
            "models": ["vit"]
        }
    }
}

# Enhanced optimization configurations for different browser+model combinations
OPTIMIZATION_CONFIGS = {
    "firefox_audio": {
        "compute_shaders": True,
        "workgroup_size": "256x1x1",  # Firefox optimized workgroup size
        "shader_precompile": True,
        "memory_optimization": "aggressive",
        "max_batch_size": 16,
        "precision": 8,
        "mixed_precision": True
    },
    "firefox_default": {
        "compute_shaders": True,
        "workgroup_size": "128x1x1",
        "shader_precompile": True,
        "memory_optimization": "balanced",
        "max_batch_size": 32
    },
    "chrome_vision": {
        "compute_shaders": True,
        "workgroup_size": "128x2x1",
        "shader_precompile": True,
        "parallel_loading": True,
        "memory_optimization": "balanced", 
        "max_batch_size": 32,
        "precision": 16,
        "mixed_precision": False
    },
    "chrome_default": {
        "compute_shaders": True,
        "workgroup_size": "128x2x1",
        "shader_precompile": True,
        "memory_optimization": "balanced",
        "max_batch_size": 16
    },
    "edge_webnn": {
        "preferred_backend": "webnn",
        "accelerator": "gpu",
        "precompile_operators": True,
        "cache_compiled_operations": True,
        "precision": 8,
        "power_mode": "balanced",
        "max_batch_size": 32
    },
    "edge_default": {
        "compute_shaders": True,
        "workgroup_size": "128x2x1",
        "shader_precompile": True,
        "memory_optimization": "balanced",
        "max_batch_size": 32
    }
}

async def initialize_web_model(model_id: str, model_type: str, platform: str, 
                              options: Optional[Dict[str, Any]] = None,
                              websocket_bridge=None):
    """
    Initialize a model in the browser via WebSocket.
    
    Args:
        model_id: Model ID
        model_type: Model type (text, vision, audio, multimodal)
        platform: WebNN or WebGPU
        options: Additional options
        websocket_bridge: WebSocket bridge instance
        
    Returns:
        Initialization result
    """
    if not websocket_bridge:
        logger.warning("No WebSocket bridge available, using simulation")
        # Simulate initialization
        await asyncio.sleep(0.5)
        return {
            "status": "success",
            "model_id": model_id,
            "platform": platform,
            "is_simulation": True
        }
    
    # Normalize platform and model type
    normalized_platform = platform.lower() if platform else "webgpu"
    if normalized_platform not in ["webgpu", "webnn"]:
        normalized_platform = "webgpu"
    
    normalized_model_type = normalize_model_type(model_type)
    
    # Apply browser-specific optimizations
    browser = getattr(websocket_bridge, "browser_name", None) or "chrome"
    optimization_config = get_browser_optimization_config(browser, normalized_model_type, normalized_platform)
    
    # Create initialization request
    request = {
        "id": f"init_{model_id}_{int(time.time() * 1000)}",
        "type": f"{normalized_platform}_init",
        "model_name": model_id,
        "model_type": normalized_model_type,
        "browser": browser
    }
    
    # Add optimization options
    request.update(optimization_config)
    
    # Add user-specified options
    if options:
        request.update(options)
    
    # Send request to browser
    logger.info(f"Sending model initialization request for {model_id} to {browser} browser")
    response = await websocket_bridge.send_and_wait(request)
    
    if not response:
        logger.warning(f"No response from browser for model initialization: {model_id}")
        # Fallback to simulation
        return {
            "status": "success",
            "model_id": model_id,
            "platform": normalized_platform,
            "is_simulation": True
        }
    
    # Log successful initialization
    logger.info(f"Model {model_id} initialized successfully with {normalized_platform} on {browser}")
    
    # Add additional context to response
    if "is_simulation" not in response:
        response["is_simulation"] = False
    
    return response

async def run_web_inference(model_id: str, inputs: Dict[str, Any], platform: str,
                          options: Optional[Dict[str, Any]] = None,
                          websocket_bridge=None):
    """
    Run inference with a model in the browser via WebSocket.
    
    Args:
        model_id: Model ID
        inputs: Model inputs
        platform: WebNN or WebGPU
        options: Additional options
        websocket_bridge: WebSocket bridge instance
        
    Returns:
        Inference result
    """
    if not websocket_bridge:
        logger.warning("No WebSocket bridge available, using simulation")
        # Simulate inference
        await asyncio.sleep(0.5)
        return {
            "success": True,
            "model_id": model_id,
            "platform": platform,
            "is_simulation": True,
            "output": {"result": [0.1, 0.2, 0.3]},
            "performance_metrics": {
                "inference_time_ms": 500,
                "throughput_items_per_sec": 2.0,
                "memory_usage_mb": 512
            }
        }
    
    # Normalize platform
    normalized_platform = platform.lower() if platform else "webgpu"
    if normalized_platform not in ["webgpu", "webnn"]:
        normalized_platform = "webgpu"
    
    # Create inference request
    request = {
        "id": f"infer_{model_id}_{int(time.time() * 1000)}",
        "type": f"{normalized_platform}_inference",
        "model_name": model_id,
        "input": inputs
    }
    
    # Add options if specified
    if options:
        request["options"] = options
    
    # Track timing
    start_time = time.time()
    
    # Send request to browser
    logger.info(f"Sending inference request for {model_id} via {normalized_platform}")
    response = await websocket_bridge.send_and_wait(request, timeout=60.0)
    
    # Calculate total time
    inference_time = time.time() - start_time
    
    if not response:
        logger.warning(f"No response from browser for inference: {model_id}")
        # Fallback to simulation
        return {
            "success": True,
            "model_id": model_id,
            "platform": platform,
            "is_simulation": True,
            "output": {"result": [0.1, 0.2, 0.3]},
            "performance_metrics": {
                "inference_time_ms": inference_time * 1000,
                "throughput_items_per_sec": 1000 / (inference_time * 1000),
                "memory_usage_mb": 512
            }
        }
    
    # Format response for consistent interface
    result = {
        "success": response.get("status") == "success",
        "model_id": model_id,
        "platform": normalized_platform,
        "output": response.get("result", {}),
        "is_real_implementation": not response.get("is_simulation", False),
        "performance_metrics": response.get("performance_metrics", {
            "inference_time_ms": inference_time * 1000,
            "throughput_items_per_sec": 1000 / (inference_time * 1000),
            "memory_usage_mb": 512
        })
    }
    
    # Log performance metrics
    logger.info(f"Inference completed in {inference_time:.3f}s for {model_id}")
    
    return result

async def load_model_with_ipfs(model_name: str, ipfs_config: Dict[str, Any], platform: str, 
                             websocket_bridge=None) -> Dict[str, Any]:
    """
    Load model with IPFS acceleration in browser.
    
    Args:
        model_name: Name of model to load
        ipfs_config: IPFS configuration
        platform: Platform (webgpu, webnn)
        websocket_bridge: WebSocket bridge instance
        
    Returns:
        Dictionary with load result
    """
    if not websocket_bridge:
        logger.warning("No WebSocket bridge available, using simulation")
        await asyncio.sleep(0.5)
        return {
            "status": "success",
            "model_name": model_name,
            "platform": platform,
            "is_simulation": True,
            "ipfs_load_time": 0.5,
            "p2p_optimized": False
        }
    
    # Create IPFS acceleration request
    request = {
        "id": f"ipfs_load_{model_name}_{int(time.time() * 1000)}",
        "type": "ipfs_accelerate",
        "model_name": model_name,
        "platform": platform,
        "ipfs_config": ipfs_config
    }
    
    # Send request and wait for response
    start_time = time.time()
    response = await websocket_bridge.send_and_wait(request)
    load_time = time.time() - start_time
    
    if not response:
        logger.warning(f"No response to IPFS acceleration request for {model_name}")
        return {
            "status": "success",
            "model_name": model_name,
            "platform": platform,
            "is_simulation": True,
            "ipfs_load_time": load_time,
            "p2p_optimized": False
        }
    
    # Add load time if not present
    if "ipfs_load_time" not in response:
        response["ipfs_load_time"] = load_time
    
    return response

def get_optimal_browser_for_model(model_type: str, platform: str) -> str:
    """
    Get the optimal browser for a model type and platform.
    
    Args:
        model_type: Model type (text, vision, audio, multimodal)
        platform: WebNN or WebGPU
        
    Returns:
        Browser name (chrome, firefox, edge, safari)
    """
    # Normalize inputs
    normalized_platform = platform.lower() if platform else "webgpu"
    if normalized_platform not in ["webgpu", "webnn"]:
        normalized_platform = "webgpu"
    
    normalized_model_type = normalize_model_type(model_type)
    
    # Platform-specific browser preferences
    if normalized_platform == "webnn":
        # Edge has the best WebNN support
        return "edge"
    
    if normalized_platform == "webgpu":
        if normalized_model_type == "audio":
            # Firefox has excellent compute shader performance for audio models
            return "firefox"
        elif normalized_model_type == "vision":
            # Chrome has good general WebGPU support for vision models
            return "chrome"
        elif normalized_model_type == "text":
            # Chrome is good for text models on WebGPU
            return "chrome"
        elif normalized_model_type == "multimodal":
            # Chrome for multimodal models
            return "chrome"
    
    # Default to Chrome for general purpose
    return "chrome"

def optimize_for_audio_models(browser: str, model_type: str) -> Dict[str, Any]:
    """
    Get optimizations for audio models on specific browsers.
    
    Args:
        browser: Browser name
        model_type: Model type
        
    Returns:
        Optimization configuration
    """
    normalized_browser = browser.lower() if browser else "chrome"
    normalized_model_type = normalize_model_type(model_type)
    
    # Get browser-specific optimizations
    if normalized_browser == "firefox" and normalized_model_type == "audio":
        # Firefox-specific optimizations for audio models
        return OPTIMIZATION_CONFIGS["firefox_audio"]
    
    if normalized_browser == "chrome" and normalized_model_type == "audio":
        # Chrome optimizations for audio
        return OPTIMIZATION_CONFIGS["chrome_default"]
    
    if normalized_browser == "edge" and normalized_model_type == "audio":
        # Edge can use WebNN for some audio models
        if browser_supports_model("edge", "webnn", model_type):
            return OPTIMIZATION_CONFIGS["edge_webnn"]
        else:
            return OPTIMIZATION_CONFIGS["edge_default"]
    
    # Default optimizations
    return {
        "compute_shaders": normalized_model_type == "audio",
        "shader_precompile": True,
        "memory_optimization": "balanced"
    }

def configure_ipfs_acceleration(model_name: str, model_type: str, 
                               platform: str, browser: str) -> Dict[str, Any]:
    """
    Configure IPFS acceleration for a specific model, platform, and browser.
    
    Args:
        model_name: Model name
        model_type: Model type
        platform: WebNN or WebGPU
        browser: Browser name
        
    Returns:
        Acceleration configuration
    """
    # Normalize inputs
    normalized_browser = browser.lower() if browser else "chrome"
    normalized_model_type = normalize_model_type(model_type)
    normalized_platform = platform.lower() if platform else "webgpu"
    
    # Base configuration
    config = {
        "model_name": model_name,
        "model_type": normalized_model_type,
        "platform": normalized_platform,
        "browser": normalized_browser,
        "p2p_optimization": True,
        "cache_optimization": True,
        "compression_enabled": True,
        "deduplication_enabled": True
    }
    
    # Add platform-specific settings
    if normalized_platform == "webgpu":
        # Add WebGPU-specific settings
        webgpu_config = {
            "precision": 8,  # Default to 8-bit precision
            "mixed_precision": True,
            "kv_cache_optimization": True,
            "compute_shaders": normalized_model_type == "audio",
            "shader_precompile": True
        }
        
        # Adjust precision based on model type
        if normalized_model_type == "vision":
            webgpu_config["precision"] = 16
            webgpu_config["mixed_precision"] = False
        elif normalized_model_type == "multimodal":
            webgpu_config["precision"] = 16
            webgpu_config["mixed_precision"] = True
        
        config.update(webgpu_config)
        
        # Add Firefox-specific optimizations for audio models
        if normalized_browser == "firefox" and normalized_model_type == "audio":
            config.update({
                "firefox_audio_optimizations": True,
                "compute_shader_workgroup_size": "256x1x1",
                "precision": 8,
                "mixed_precision": True
            })
    
    elif normalized_platform == "webnn":
        # Add WebNN-specific settings
        webnn_config = {
            "precision": 8,
            "mixed_precision": False
        }
        
        # Add Edge-specific optimizations for WebNN
        if normalized_browser == "edge":
            webnn_config.update({
                "edge_optimizations": True,
                "preferred_backend": "webnn",
                "accelerator": "gpu"
            })
        
        config.update(webnn_config)
    
    return config

def apply_precision_config(model_config: Dict[str, Any], platform: str) -> Dict[str, Any]:
    """
    Apply precision configuration for model.
    
    Args:
        model_config: Model configuration
        platform: Platform (webgpu, webnn)
        
    Returns:
        Updated model configuration
    """
    # Default precision settings
    precision_config = {
        "precision": 16,  # Default to 16-bit precision
        "mixed_precision": False,
        "experimental_precision": False
    }
    
    # Get model family/category
    model_family = model_config.get("family", "text")
    model_type = normalize_model_type(model_family)
    
    # Platform-specific precision settings
    if platform == "webgpu":
        if model_type == "text":
            # Text models work well with 8-bit precision on WebGPU
            precision_config.update({
                "precision": 8,
                "mixed_precision": True
            })
        elif model_type == "vision":
            # Vision models need higher precision for accuracy
            precision_config.update({
                "precision": 16,
                "mixed_precision": False
            })
        elif model_type == "audio":
            # Audio models can use 8-bit with mixed precision
            precision_config.update({
                "precision": 8,
                "mixed_precision": True
            })
        elif model_type == "multimodal":
            # Multimodal models need full precision
            precision_config.update({
                "precision": 16,
                "mixed_precision": False
            })
    elif platform == "webnn":
        # WebNN has more limited precision options
        precision_config.update({
            "precision": 8,
            "mixed_precision": False
        })
    
    # Override with user-specified precision if available
    if "precision" in model_config:
        precision_config["precision"] = model_config["precision"]
    if "mixed_precision" in model_config:
        precision_config["mixed_precision"] = model_config["mixed_precision"]
    if "experimental_precision" in model_config:
        precision_config["experimental_precision"] = model_config["experimental_precision"]
    
    # Update model configuration
    model_config.update(precision_config)
    
    return model_config

def get_firefox_audio_optimization() -> Dict[str, Any]:
    """
    Get Firefox-specific audio optimization configurations.
    
    Returns:
        Audio optimization configuration for Firefox
    """
    return OPTIMIZATION_CONFIGS["firefox_audio"]

def get_edge_webnn_optimization() -> Dict[str, Any]:
    """
    Get Edge-specific WebNN optimization configurations.
    
    Returns:
        WebNN optimization configuration for Edge
    """
    return OPTIMIZATION_CONFIGS["edge_webnn"]

def get_resource_requirements(model_type: str, model_size: str = 'base') -> Dict[str, Any]:
    """
    Get resource requirements for model.
    
    Args:
        model_type: Type of model
        model_size: Size of model (tiny, base, large)
        
    Returns:
        Resource requirements dictionary
    """
    # Base requirements
    requirements = {
        "memory_mb": 500,
        "compute_units": 1,
        "storage_mb": 100,
        "bandwidth_mbps": 10
    }
    
    # Adjust based on model type
    normalized_model_type = normalize_model_type(model_type)
    
    # Adjust based on model size
    size_multiplier = 1.0
    if model_size == "tiny":
        size_multiplier = 0.5
    elif model_size == "base":
        size_multiplier = 1.0
    elif model_size == "large":
        size_multiplier = 2.0
    elif model_size == "xl":
        size_multiplier = 4.0
    
    # Type-specific requirements
    if normalized_model_type == "text":
        requirements["memory_mb"] = int(500 * size_multiplier)
        requirements["compute_units"] = max(1, int(1 * size_multiplier))
    elif normalized_model_type == "vision":
        requirements["memory_mb"] = int(800 * size_multiplier)
        requirements["compute_units"] = max(1, int(2 * size_multiplier))
    elif normalized_model_type == "audio":
        requirements["memory_mb"] = int(1000 * size_multiplier)
        requirements["compute_units"] = max(1, int(2 * size_multiplier))
    elif normalized_model_type == "multimodal":
        requirements["memory_mb"] = int(1500 * size_multiplier)
        requirements["compute_units"] = max(1, int(3 * size_multiplier))
    
    return requirements

def normalize_model_type(model_type: str) -> str:
    """
    Normalize model type to one of: text, vision, audio, multimodal.
    
    Args:
        model_type: Input model type
        
    Returns:
        Normalized model type
    """
    model_type_lower = model_type.lower() if model_type else "text"
    
    if model_type_lower in ["text", "text_embedding", "text_classification", "text_generation", "summarization", "question_answering", "nlp"]:
        return "text"
    elif model_type_lower in ["vision", "image", "image_classification", "object_detection", "segmentation", "vit"]:
        return "vision"
    elif model_type_lower in ["audio", "speech", "asr", "audio_classification", "clap", "wav2vec", "whisper"]:
        return "audio"
    elif model_type_lower in ["multimodal", "vision_language", "vision_text", "llava", "clip", "vision_text"]:
        return "multimodal"
    else:
        return "text"  # Default to text for unknown types

def browser_supports_model(browser: str, platform: str, model_type: str) -> bool:
    """
    Check if browser supports model type on specific platform.
    
    Args:
        browser: Browser name
        platform: Platform (webgpu, webnn)
        model_type: Model type
        
    Returns:
        True if browser supports model type on platform, False otherwise
    """
    # Normalize inputs
    normalized_browser = browser.lower() if browser else "chrome"
    normalized_platform = platform.lower() if platform else "webgpu"
    normalized_model_type = normalize_model_type(model_type)
    
    # Check browser capabilities
    if normalized_browser in BROWSER_CAPABILITIES:
        browser_info = BROWSER_CAPABILITIES[normalized_browser]
        
        if normalized_platform in browser_info:
            platform_info = browser_info[normalized_platform]
            
            # Check if platform is supported
            if not platform_info.get("supported", False):
                return False
            
            # Check optimized categories
            if "optimized_for" in platform_info and normalized_model_type in platform_info["optimized_for"]:
                return True
            
            # Default to supported if platform is supported but no model-specific info
            return True
    
    # Default to True for Chrome WebGPU (generally well-supported)
    if normalized_browser == "chrome" and normalized_platform == "webgpu":
        return True
    
    # Default to True for Edge WebNN
    if normalized_browser == "edge" and normalized_platform == "webnn":
        return True
    
    return False

def get_browser_optimization_config(browser: str, model_type: str, platform: str) -> Dict[str, Any]:
    """
    Get optimization configuration for specific browser, model type, and platform.
    
    Args:
        browser: Browser name
        model_type: Model type
        platform: Platform (webgpu, webnn)
        
    Returns:
        Optimization configuration
    """
    # Normalize inputs
    normalized_browser = browser.lower() if browser else "chrome"
    normalized_model_type = normalize_model_type(model_type)
    normalized_platform = platform.lower() if platform else "webgpu"
    
    # WebNN platform
    if normalized_platform == "webnn":
        if normalized_browser == "edge":
            return OPTIMIZATION_CONFIGS["edge_webnn"]
        else:
            return {
                "preferred_backend": "webnn",
                "accelerator": "gpu",
                "precision": 8,
                "mixed_precision": False
            }
    
    # WebGPU platform
    if normalized_platform == "webgpu":
        # Firefox optimizations
        if normalized_browser == "firefox":
            if normalized_model_type == "audio":
                return OPTIMIZATION_CONFIGS["firefox_audio"]
            else:
                return OPTIMIZATION_CONFIGS["firefox_default"]
        
        # Chrome optimizations
        elif normalized_browser == "chrome":
            if normalized_model_type == "vision":
                return OPTIMIZATION_CONFIGS["chrome_vision"]
            else:
                return OPTIMIZATION_CONFIGS["chrome_default"]
        
        # Edge optimizations
        elif normalized_browser == "edge":
            return OPTIMIZATION_CONFIGS["edge_default"]
    
    # Default configuration
    return {
        "compute_shaders": True,
        "shader_precompile": True,
        "memory_optimization": "balanced",
        "max_batch_size": 16
    }

if __name__ == "__main__":
    # Test functionality
    print("Firefox audio optimization:", get_firefox_audio_optimization())
    print("Edge WebNN optimization:", get_edge_webnn_optimization())
    print("Optimal browser for audio on WebGPU:", get_optimal_browser_for_model("audio", "webgpu"))
    print("Optimal browser for text on WebNN:", get_optimal_browser_for_model("text_embedding", "webnn"))
    print("Browser optimizations for Firefox + Audio + WebGPU:", get_browser_optimization_config("firefox", "audio", "webgpu"))
    print("IPFS acceleration config:", configure_ipfs_acceleration("whisper-tiny", "audio", "webgpu", "firefox"))