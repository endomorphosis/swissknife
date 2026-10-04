#!/usr/bin/env python3
"""
Safari WebGPU Handler with Metal API Integration (June 2025)

This module provides Safari-specific WebGPU implementations with Metal API integration
to support running machine learning models in Safari browsers:

- Detect Safari WebGPU capabilities
- Provide Metal API integration layer for optimized performance
- Fall back to WebAssembly when needed
- Optimize memory management for Safari's constraints
- Enable specialized Metal optimizations for different model types

Usage:
    from fixed_web_platform.safari_webgpu_handler import (
        SafariWebGPUHandler,
        MetalAPIIntegrationLayer,
        optimize_for_safari
    )
    
    # Create Safari handler with Metal API integration
    handler = SafariWebGPUHandler(fallback_to_wasm=True, enable_metal_api=True)
    
    # Check if specific operation is supported
    if handler.should_use_fallback("compute_shader"):
        # Use fallback implementation
        result = handler.run_with_fallback(operation)
    else:
        # Use native implementation with Metal optimizations
        result = handler.run_native(operation)
"""

import os
import sys
import time
import json
import logging
from typing import Dict, List, Any, Optional, Union, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("safari_webgpu_handler")

# Try to import WebAssembly fallback
try:
    from fixed_web_platform.webgpu_wasm_fallback import WebAssemblyFallback
    WASM_FALLBACK_AVAILABLE = True
except ImportError:
    WASM_FALLBACK_AVAILABLE = False
    logger.warning("WebAssembly fallback not available, some operations may fail in Safari")

class MetalAPIIntegrationLayer:
    """Metal API integration layer for Safari WebGPU implementation."""
    
    def __init__(self, safari_version, capabilities):
        """
        Initialize Metal API integration layer.
        
        Args:
            safari_version: Safari version string
            capabilities: Dictionary of browser capabilities
        """
        self.safari_version = safari_version
        self.capabilities = capabilities
        self.metal_device = self._initialize_metal_device()
        self.shader_cache = {}
        self.pipeline_cache = {}
        self.performance_metrics = {
            "compilation_time_ms": 0,
            "execution_time_ms": 0,
            "shader_cache_hits": 0,
            "pipeline_cache_hits": 0,
            "total_operations": 0
        }
        
        logger.info(f"Initialized Metal API integration layer for Safari {safari_version}")
    
    def _initialize_metal_device(self):
        """
        Initialize Metal device (simulated).
        
        Returns:
            Dictionary with Metal device information
        """
        # In a real implementation, this would initialize a Metal device
        # Here we just return simulated device information
        
        # Parse Safari version for feature detection
        version_parts = self.safari_version.split(".")
        major_version = int(version_parts[0]) if version_parts and version_parts[0].isdigit() else 17
        minor_version = int(version_parts[1]) if len(version_parts) > 1 and version_parts[1].isdigit() else 6
        
        # Determine Metal feature set based on Safari version
        if major_version >= 18:
            metal_family = 8  # Newest Metal feature set
        elif major_version == 17 and minor_version >= 7:
            metal_family = 7  # Metal 3.1
        elif major_version == 17:
            metal_family = 6  # Metal 3.0
        else:
            metal_family = 5  # Older Metal
        
        return {
            "name": "Apple Metal Device (simulated)",
            "feature_set_family": metal_family,
            "max_buffer_size": 1024 * 1024 * 1024,  # 1 GB
            "max_texture_size": 16384,
            "max_threadgroup_memory_length": 32768,  # 32 KB
            "max_threads_per_threadgroup": 1024,
            "supports_int8": metal_family >= 6,
            "supports_int4": metal_family >= 7,
            "supports_fp16": True,
            "supports_resource_heaps": True,
            "supports_dynamic_libraries": metal_family >= 7,
        }
    
    def compile_shader_to_metal(self, shader_code, label="unknown"):
        """
        Compile WebGPU shader to Metal shader code (simulated).
        
        Args:
            shader_code: WebGPU shader code (WGSL)
            label: Shader label for identification
            
        Returns:
            Dictionary with Metal shader information
        """
        start_time = time.time()
        
        # Check shader cache first
        cache_key = hash(shader_code)
        if cache_key in self.shader_cache:
            self.performance_metrics["shader_cache_hits"] += 1
            return self.shader_cache[cache_key]
        
        # In a real implementation, this would translate WGSL to Metal Shading Language
        # Here we just simulate the process with some Metal-specific transformations
        
        # Apply Metal-specific optimizations to the shader code
        metal_code = self._translate_to_metal(shader_code)
        
        # Simulate compilation time based on shader complexity
        complexity = len(shader_code) / 1000  # Simple complexity estimate
        compilation_time = 10 + complexity * 5  # ms
        
        # Add compilation to performance metrics
        elapsed_ms = (time.time() - start_time) * 1000
        self.performance_metrics["compilation_time_ms"] += elapsed_ms
        
        # Create simulated Metal shader
        metal_shader = {
            "original_code": shader_code,
            "metal_code": metal_code,
            "compiled": True,
            "label": label,
            "compilation_time_ms": compilation_time,
            "cache_key": cache_key
        }
        
        # Add to shader cache
        self.shader_cache[cache_key] = metal_shader
        
        return metal_shader
    
    def _translate_to_metal(self, wgsl_code):
        """
        Translate WGSL shader code to Metal Shading Language (simulated).
        
        Args:
            wgsl_code: WebGPU shader code (WGSL)
            
        Returns:
            Metal Shading Language code (simulated)
        """
        # In a real implementation, this would be a complete WGSL to MSL translator
        # Here we just do some token replacements to simulate the translation
        
        metal_code = "// Translated to Metal Shading Language\n"
        metal_code += "#include <metal_stdlib>\n"
        metal_code += "using namespace metal;\n\n"
        
        # Replace WGSL syntax with Metal syntax
        wgsl_to_metal = {
            "@group(": "[[group(",
            "@binding(": "[[binding(",
            ") var<storage,": ")]] device",
            ") var<uniform,": ")]] constant",
            ") var<": ")]] thread",
            "@builtin(": "[[builtin(",
            "@compute @workgroup_size": "kernel",
            "fn main": "kernel void main",
            "arrayLength(&": "uint(",
            "f32": "float",
            "u32": "uint",
            "i32": "int",
            "vec2": "float2",
            "vec3": "float3",
            "vec4": "float4",
            "uvec2": "uint2",
            "uvec3": "uint3",
            "uvec4": "uint4",
            "ivec2": "int2",
            "ivec3": "int3",
            "ivec4": "int4",
            "mat2x2": "float2x2",
            "mat3x3": "float3x3",
            "mat4x4": "float4x4"
        }
        
        # Apply simple replacements
        translated_code = wgsl_code
        for wgsl, metal in wgsl_to_metal.items():
            translated_code = translated_code.replace(wgsl, metal)
        
        # Add Metal-specific header and preprocessor directives
        metal_code += translated_code
        
        return metal_code
    
    def create_compute_pipeline(self, shader, workgroup_size, entry_point="main"):
        """
        Create Metal compute pipeline (simulated).
        
        Args:
            shader: Metal shader information
            workgroup_size: Workgroup size tuple (x, y, z)
            entry_point: Entry point function name
            
        Returns:
            Dictionary with Metal compute pipeline information
        """
        # Generate cache key for pipeline
        cache_key = f"{shader['cache_key']}_{workgroup_size}_{entry_point}"
        
        # Check pipeline cache first
        if cache_key in self.pipeline_cache:
            self.performance_metrics["pipeline_cache_hits"] += 1
            return self.pipeline_cache[cache_key]
        
        # Create simulated Metal compute pipeline
        pipeline = {
            "shader": shader,
            "workgroup_size": workgroup_size,
            "entry_point": entry_point,
            "metal_function": f"simulated_metal_function_{entry_point}",
            "threadgroup_memory_length": min(self.metal_device["max_threadgroup_memory_length"], 16384),
            "cache_key": cache_key
        }
        
        # Add to pipeline cache
        self.pipeline_cache[cache_key] = pipeline
        
        return pipeline
    
    def execute_compute_pipeline(self, pipeline, buffers, dispatch_size):
        """
        Execute Metal compute pipeline (simulated).
        
        Args:
            pipeline: Metal compute pipeline information
            buffers: Input and output buffers
            dispatch_size: Dispatch size tuple (x, y, z)
            
        Returns:
            Dictionary with execution results
        """
        start_time = time.time()
        
        # In a real implementation, this would execute the pipeline on the Metal device
        # Here we just simulate the execution
        
        # Simulate execution time based on dispatch size and workgroup size
        total_invocations = dispatch_size[0] * dispatch_size[1] * dispatch_size[2]
        workgroup_invocations = pipeline["workgroup_size"][0] * pipeline["workgroup_size"][1] * pipeline["workgroup_size"][2]
        workgroups = (total_invocations + workgroup_invocations - 1) // workgroup_invocations
        
        # Simulate faster execution on newer Metal feature sets
        feature_set_factor = 1.0
        if self.metal_device["feature_set_family"] >= 7:
            feature_set_factor = 0.7  # 30% faster on newer Metal
        elif self.metal_device["feature_set_family"] >= 6:
            feature_set_factor = 0.85  # 15% faster on Metal 3.0
        
        # Simulate execution time (pure estimation)
        execution_time = workgroups * 0.01 * feature_set_factor  # ms
        
        # Add execution time to performance metrics
        elapsed_ms = (time.time() - start_time) * 1000
        self.performance_metrics["execution_time_ms"] += elapsed_ms
        self.performance_metrics["total_operations"] += 1
        
        return {
            "execution_time_ms": execution_time,
            "dispatch_size": dispatch_size,
            "workgroups": workgroups,
            "success": True
        }
    
    def optimize_for_model_type(self, model_type, input_shapes=None):
        """
        Get Metal-specific optimizations for a model type.
        
        Args:
            model_type: Model type (bert, t5, vit, etc.)
            input_shapes: Dictionary of input tensor shapes
            
        Returns:
            Dictionary with Metal optimizations
        """
        # Initialize Metal optimizations for different model types
        optimizations = {
            "use_metal_performance_shaders": True,
            "metal_feature_set": self.metal_device["feature_set_family"],
            "optimize_memory_allocation": True,
            "use_heaps": self.metal_device["supports_resource_heaps"],
            "resource_sharing": True,
        }
        
        # Model type specific optimizations
        if "bert" in model_type.lower() or "t5" in model_type.lower() or "embedding" in model_type.lower():
            # Embedding models
            optimizations.update({
                "use_metal_performance_shaders_matrix": True,
                "optimize_attention_for_metal": True,
                "workgroup_size": (8, 8, 1),
                "use_int8": self.metal_device["supports_int8"],
                "use_buffer_managed_device_memory": True
            })
            
        elif "vit" in model_type.lower() or "clip" in model_type.lower() or "vision" in model_type.lower():
            # Vision models
            optimizations.update({
                "use_metal_performance_shaders_cnn": True,
                "optimize_conv_for_metal": True,
                "workgroup_size": (8, 8, 1),
                "optimize_image_processing": True,
                "precompile_vision_kernels": True
            })
            
        elif "whisper" in model_type.lower() or "wav2vec" in model_type.lower() or "audio" in model_type.lower():
            # Audio models
            optimizations.update({
                "use_metal_performance_shaders_fft": True,
                "optimize_audio_processing": True,
                "workgroup_size": (32, 1, 1),
                "precompile_fft_kernels": True,
                "batch_audio_processing": True
            })
            
        elif "llama" in model_type.lower() or "llm" in model_type.lower() or "qwen" in model_type.lower():
            # LLMs
            optimizations.update({
                "use_metal_performance_shaders_matrix": True,
                "optimize_attention_for_metal": True,
                "use_int8": self.metal_device["supports_int8"],
                "use_int4": self.metal_device["supports_int4"],
                "workgroup_size": (4, 4, 1),
                "optimize_kv_cache": True,
                "split_large_tensors": True
            })
            
        # Input shape-specific optimizations
        if input_shapes:
            # Detect large tensors and apply optimizations
            has_large_tensor = False
            max_dim = 0
            
            for shape in input_shapes.values():
                if not shape:
                    continue
                    
                tensor_size = 1
                for dim in shape:
                    tensor_size *= dim
                    max_dim = max(max_dim, dim)
                
                if tensor_size > 16777216:  # 16M elements
                    has_large_tensor = True
            
            if has_large_tensor:
                optimizations.update({
                    "tiling_strategy": "large_tensor",
                    "tile_size": 1024 if max_dim > 4096 else 2048,
                    "use_incremental_updates": True,
                    "optimize_large_tensor_memory": True
                })
        
        return optimizations
    
    def get_performance_metrics(self):
        """
        Get Metal API performance metrics.
        
        Returns:
            Dictionary with performance metrics
        """
        return self.performance_metrics.copy()


class SafariWebGPUHandler:
    """Handles Safari-specific WebGPU implementation with Metal API integration."""
    
    def __init__(self, fallback_to_wasm=True, enable_metal_api=True, safari_version=None, user_agent=None):
        """
        Initialize Safari WebGPU handler with Metal API integration.
        
        Args:
            fallback_to_wasm: Whether to fallback to WebAssembly for unsupported operations
            enable_metal_api: Whether to enable Metal API integration layer
            safari_version: Safari version string (e.g., "17.6") - if None, will be auto-detected
            user_agent: Optional user agent string for capability detection
        """
        self.fallback_to_wasm = fallback_to_wasm and WASM_FALLBACK_AVAILABLE
        self.enable_metal_api = enable_metal_api
        self.safari_version = safari_version
        self.user_agent = user_agent
        
        # Use browser capability detection if available
        self.metal_optimizations = False
        try:
            from fixed_web_platform.browser_capability_detection import detect_browser_capabilities, is_safari_with_metal_api
            self.browser_capabilities = detect_browser_capabilities(user_agent)
            
            # Override safari_version if detected from capabilities
            if not self.safari_version and self.browser_capabilities["browser_name"] == "Safari":
                self.safari_version = self.browser_capabilities["browser_version"]
                
            # Check if Safari with Metal API is available
            if is_safari_with_metal_api(self.browser_capabilities):
                self.metal_optimizations = True
                
            # Use detected capabilities
            self.capabilities = self._map_browser_capabilities()
            logger.info("Used browser capability detection for Safari detection")
        except ImportError:
            # Fall back to basic capability detection
            self.capabilities = self._detect_capabilities()
            logger.info("Used basic capability detection for Safari")
        
        # Initialize Metal API integration layer if enabled
        self.metal_api = None
        if self.enable_metal_api and (self.metal_optimizations or 
                                     (self.capabilities.get("browser_version", "0") >= "17.2")):
            try:
                self.metal_api = MetalAPIIntegrationLayer(
                    safari_version=self.capabilities["browser_version"],
                    capabilities=self.capabilities
                )
                logger.info("Metal API integration layer initialized successfully")
                self.metal_optimizations = True
            except Exception as e:
                logger.error(f"Failed to initialize Metal API integration layer: {e}")
                self.enable_metal_api = False
                self.metal_optimizations = False
        
        # Initialize progressive model loader if available
        self.progressive_loader = None
        try:
            from fixed_web_platform.progressive_model_loader import ProgressiveModelLoader
            # Will be initialized when needed
            self.progressive_loader_available = True
        except ImportError:
            self.progressive_loader_available = False
        
        # Initialize fallback if available
        self.wasm_fallback = None
        if self.fallback_to_wasm:
            try:
                self.wasm_fallback = WebAssemblyFallback()
            except Exception as e:
                logger.error(f"Failed to initialize WebAssembly fallback: {e}")
                self.fallback_to_wasm = False
        
        # Track performance and usage metrics
        self.metrics = {
            "native_operations": 0,
            "fallback_operations": 0,
            "metal_operations": 0,
            "native_time_ms": 0,
            "fallback_time_ms": 0,
            "metal_time_ms": 0,
            "operations": {}
        }
        
        logger.info(f"Initialized Safari WebGPU handler with fallback_to_wasm={fallback_to_wasm}, "
                  f"enable_metal_api={enable_metal_api}, safari_version={self.safari_version}, "
                  f"metal_optimizations={self.metal_optimizations}")
    
    def _map_browser_capabilities(self) -> Dict[str, Any]:
        """
        Map browser capabilities to Safari WebGPU capabilities.
        
        Returns:
            Dictionary with capability information
        """
        if not hasattr(self, 'browser_capabilities'):
            return self._detect_capabilities()
            
        caps = self.browser_capabilities
        safari_version = str(caps["browser_version"])
        
        # Map capabilities
        capabilities = {
            "webgpu_supported": caps["webgpu_supported"],
            "storage_buffers": True,  # Basic storage buffer support
            "uniform_buffers": True,  # Uniform buffer support
            "parallel_loading": caps["webgpu_features"]["parallel_compilation"],
            "webnn": caps["webnn_supported"],
            "compute_shaders": caps["webgpu_features"]["compute_shaders"],
            "shader_precompilation": caps["webgpu_features"]["shader_compilation"],
            "kv_cache_optimization": "kv_cache_optimization" in caps.get("special_optimizations", []),
            "quantization": {
                "fp16": True,  # FP16 support
                "int8": caps["webnn_features"].get("quantized_operations", False),
                "int4": False,  # Int4 not fully supported yet
                "int2": False   # Int2 not supported
            },
            "memory_efficient_attention": False,  # Flash Attention not fully supported
            "browser_version": safari_version,
            "metal_api_supported": caps.get("metal_api_supported", False),
            "metal_api_version": caps.get("metal_api_version", 0.0)
        }
        
        # Set advanced features based on Metal API availability
        if capabilities["metal_api_supported"]:
            capabilities["compute_shaders"] = True
            capabilities["shader_precompilation"] = True
            if capabilities["metal_api_version"] >= 2.0:
                capabilities["kv_cache_optimization"] = True
                capabilities["quantization"]["int4"] = True
                capabilities["memory_efficient_attention"] = True
        
        return capabilities
    
    def _detect_capabilities(self) -> Dict[str, Any]:
        """
        Detect Safari WebGPU capabilities.
        
        Returns:
            Dictionary with capability information
        """
        # In a real implementation, this would detect actual Safari capabilities
        # Here we use a simulation based on known Safari WebGPU support as of June 2025
        
        # Determine Safari version (use provided version or default)
        safari_version = self.safari_version or "17.6"
        version_parts = safari_version.split(".")
        major_version = int(version_parts[0]) if version_parts and version_parts[0].isdigit() else 17
        minor_version = int(version_parts[1]) if len(version_parts) > 1 and version_parts[1].isdigit() else 6
        
        # Base capabilities that are consistent across recent Safari versions
        capabilities = {
            "webgpu_supported": True,        # Basic WebGPU API support
            "storage_buffers": True,         # Basic storage buffer support
            "uniform_buffers": True,         # Uniform buffer support
            "parallel_loading": True,        # Web Workers support
            "webnn": True,                   # WebNN support
            "quantization": {
                "fp16": True,                # FP16 support
                "int8": major_version >= 17 and minor_version >= 5,  # Int8 support in Safari 17.5+
                "int4": False,               # Int4 not fully supported yet
                "int2": False                # Int2 not supported
            },
            "memory_efficient_attention": False,  # Flash Attention not fully supported
            "browser_version": safari_version,
            "metal_api_supported": major_version >= 17 and minor_version >= 2,  # Metal API in 17.2+
            "metal_api_version": 2.0 if (major_version >= 17 and minor_version >= 4) else 1.0
        }
        
        # Version-specific capabilities
        if major_version >= 18:
            # Future Safari versions (18+)
            capabilities["compute_shaders"] = True
            capabilities["shader_precompilation"] = True
            capabilities["kv_cache_optimization"] = True
            capabilities["quantization"]["int8"] = True
            
            # Safari 18+ might support int4 quantization
            if minor_version >= 2:
                capabilities["quantization"]["int4"] = True
                capabilities["memory_efficient_attention"] = True
        
        elif major_version == 17:
            # Safari 17.x capabilities
            capabilities["compute_shaders"] = minor_version >= 7  # Added in 17.7
            capabilities["shader_precompilation"] = minor_version >= 6  # Added in 17.6
            capabilities["kv_cache_optimization"] = minor_version >= 8  # Added in 17.8
            
            # Safari 17.9+ might add int4 support
            if minor_version >= 9:
                capabilities["quantization"]["int4"] = True
        
        else:
            # Older Safari versions
            capabilities["compute_shaders"] = False
            capabilities["shader_precompilation"] = False
            capabilities["kv_cache_optimization"] = False
        
        return capabilities
    
    def should_use_fallback(self, operation_type: str) -> bool:
        """
        Determine if WebAssembly fallback should be used for an operation.
        
        Args:
            operation_type: Type of operation to check
            
        Returns:
            True if fallback should be used, False if native implementation is possible
        """
        if not self.fallback_to_wasm:
            return False
        
        # Check specific operation against capabilities
        if operation_type == "compute_shader" and not self.capabilities["compute_shaders"]:
            return True
        elif operation_type == "shader_precompilation" and not self.capabilities["shader_precompilation"]:
            return True
        elif operation_type == "4bit_matmul" and not self.capabilities["quantization"]["int4"]:
            return True
        elif operation_type == "2bit_matmul" and not self.capabilities["quantization"]["int2"]:
            return True
        elif operation_type == "flash_attention" and not self.capabilities["memory_efficient_attention"]:
            return True
        
        # Default to native implementation
        return False
    
    def run_native(self, operation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run operation using native Safari WebGPU implementation.
        
        Args:
            operation: Operation specification
            
        Returns:
            Operation result
        """
        operation_type = operation.get("type", "unknown")
        start_time = time.time()
        
        # Apply Safari-specific optimizations
        optimized_operation = self._optimize_for_safari(operation)
        
        # Use Metal API if available for this operation and enabled
        if self.metal_optimizations and self.metal_api and self._can_use_metal_api(operation_type):
            # Use Metal API integration layer
            result = self._run_with_metal_api(optimized_operation)
            implementation = "metal_api"
            
            # Update Metal-specific metrics
            elapsed_ms = (time.time() - start_time) * 1000
            self.metrics["metal_operations"] += 1
            self.metrics["metal_time_ms"] += elapsed_ms
            
            if operation_type not in self.metrics["operations"]:
                self.metrics["operations"][operation_type] = {
                    "native_count": 0, "fallback_count": 0, "metal_count": 0,
                    "native_time_ms": 0, "fallback_time_ms": 0, "metal_time_ms": 0
                }
            
            self.metrics["operations"][operation_type]["metal_count"] = self.metrics["operations"][operation_type].get("metal_count", 0) + 1
            self.metrics["operations"][operation_type]["metal_time_ms"] = self.metrics["operations"][operation_type].get("metal_time_ms", 0) + elapsed_ms
            
            logger.debug(f"Ran {operation_type} with Metal API in {elapsed_ms:.2f}ms")
        else:
            # Simulate running the operation with native WebGPU
            result = self._simulate_native_operation(optimized_operation)
            implementation = "native_safari"
            
            # Update metrics for native WebGPU
            elapsed_ms = (time.time() - start_time) * 1000
            self.metrics["native_operations"] += 1
            self.metrics["native_time_ms"] += elapsed_ms
            
            if operation_type not in self.metrics["operations"]:
                self.metrics["operations"][operation_type] = {
                    "native_count": 0, "fallback_count": 0, "metal_count": 0,
                    "native_time_ms": 0, "fallback_time_ms": 0, "metal_time_ms": 0
                }
            
            self.metrics["operations"][operation_type]["native_count"] += 1
            self.metrics["operations"][operation_type]["native_time_ms"] += elapsed_ms
            
            logger.debug(f"Ran {operation_type} natively in {elapsed_ms:.2f}ms")
        
        # Include capabilities in result for analysis
        return {
            "result": result,
            "time_ms": elapsed_ms,
            "implementation": implementation,
            "operation_type": operation_type,
            "success": True,
            "metal_api_used": implementation == "metal_api",
            "metal_api_available": self.metal_optimizations,
            "safari_capabilities": {
                k: v for k, v in self.capabilities.items() 
                if k in ["compute_shaders", "shader_precompilation", "metal_api_supported"]
            }
        }
    
    def run_with_fallback(self, operation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run operation using WebAssembly fallback.
        
        Args:
            operation: Operation specification
            
        Returns:
            Operation result
        """
        if not self.fallback_to_wasm or self.wasm_fallback is None:
            raise RuntimeError("WebAssembly fallback not available")
        
        operation_type = operation.get("type", "unknown")
        start_time = time.time()
        
        # Run operation with WebAssembly fallback
        if operation_type == "matmul":
            result = self.wasm_fallback.matrix_multiply(
                operation.get("a"), operation.get("b")
            )
        elif operation_type == "4bit_matmul":
            result = self.wasm_fallback.quantized_matrix_multiply(
                operation.get("inputs"), 
                operation.get("weights_quantized"), 
                operation.get("scales")
            )
        elif operation_type == "attention":
            result = self.wasm_fallback.attention_forward(
                operation.get("query"),
                operation.get("key"),
                operation.get("value"),
                operation.get("mask")
            )
        else:
            # Generic operation execution
            result = self.wasm_fallback.execute_operation(operation)
        
        # Update metrics
        elapsed_ms = (time.time() - start_time) * 1000
        self.metrics["fallback_operations"] += 1
        self.metrics["fallback_time_ms"] += elapsed_ms
        
        if operation_type not in self.metrics["operations"]:
            self.metrics["operations"][operation_type] = {
                "native_count": 0, "fallback_count": 0, 
                "native_time_ms": 0, "fallback_time_ms": 0
            }
        
        self.metrics["operations"][operation_type]["fallback_count"] += 1
        self.metrics["operations"][operation_type]["fallback_time_ms"] += elapsed_ms
        
        logger.debug(f"Ran {operation_type} with WebAssembly fallback in {elapsed_ms:.2f}ms")
        
        return {
            "result": result,
            "time_ms": elapsed_ms,
            "implementation": "wasm_fallback",
            "operation_type": operation_type,
            "success": True
        }
    
    def _can_use_metal_api(self, operation_type: str) -> bool:
        """
        Check if Metal API can be used for this operation type.
        
        Args:
            operation_type: Type of operation
            
        Returns:
            True if Metal API can be used
        """
        if not self.metal_api or not self.metal_optimizations:
            return False
            
        # Check if operation is supported by Metal API
        if operation_type == "matmul":
            return True
        elif operation_type == "shader":
            return True
        elif operation_type == "attention":
            return True
        elif operation_type == "4bit_matmul":
            # Check if Metal API supports int4 quantization
            return self.capabilities.get("quantization", {}).get("int4", False)
        elif operation_type == "tensor_op":
            return True
        elif operation_type == "model_load":
            # Use Metal API for model loading with progressive loading
            return self.progressive_loader_available
        
        # Default for unsupported operations
        return False
    
    def _run_with_metal_api(self, operation: Dict[str, Any]) -> Any:
        """
        Run operation using Metal API integration layer.
        
        Args:
            operation: Operation specification
            
        Returns:
            Operation result
        """
        if not self.metal_api:
            raise RuntimeError("Metal API integration layer not available")
        
        operation_type = operation.get("type", "unknown")
        
        # Dispatch operation to appropriate Metal API method
        if operation_type == "shader":
            # Compile and run shader with Metal
            shader_code = operation.get("shader_code", "")
            label = operation.get("label", "unknown_shader")
            
            # Compile shader to Metal
            metal_shader = self.metal_api.compile_shader_to_metal(shader_code, label)
            
            # Create compute pipeline
            workgroup_size = operation.get("workgroup_size", (8, 8, 1))
            pipeline = self.metal_api.create_compute_pipeline(metal_shader, workgroup_size)
            
            # Execute pipeline
            dispatch_size = operation.get("dispatch_size", (1, 1, 1))
            buffers = operation.get("buffers", {})
            result = self.metal_api.execute_compute_pipeline(pipeline, buffers, dispatch_size)
            
            # Add Metal-specific metrics
            result["metal_shader"] = metal_shader["label"]
            result["metal_feature_set"] = self.metal_api.metal_device["feature_set_family"]
            
            return result
            
        elif operation_type == "matmul" or operation_type == "4bit_matmul":
            # Simulate Metal-accelerated matrix multiplication
            a = operation.get("a") if "a" in operation else operation.get("inputs")
            b = operation.get("b") if "b" in operation else operation.get("weights_quantized")
            
            # For 4-bit matmul, also get scales
            scales = operation.get("scales") if operation_type == "4bit_matmul" else None
            
            # Get model-specific optimizations
            model_type = operation.get("model_type", "unknown")
            optimizations = self.metal_api.optimize_for_model_type(model_type)
            
            # Add Metal optimizations to the result for analysis
            result = self._simulate_native_operation(operation)
            if isinstance(result, dict):
                result["metal_optimizations"] = optimizations
                result["metal_feature_set"] = self.metal_api.metal_device["feature_set_family"]
            
            return result
            
        elif operation_type == "attention":
            # Use Metal-optimized attention
            model_type = operation.get("model_type", "unknown")
            optimizations = self.metal_api.optimize_for_model_type(model_type)
            
            # Get attention inputs
            query = operation.get("query")
            key = operation.get("key")
            value = operation.get("value")
            mask = operation.get("mask")
            
            # Simulate attention computation (with Metal-specific optimizations)
            # In a real implementation, this would use Metal Performance Shaders
            result = self._simulate_native_operation(operation)
            
            # Add Metal-specific information
            if isinstance(result, dict):
                result["metal_optimizations"] = {
                    k: v for k, v in optimizations.items() 
                    if k in ["optimize_attention_for_metal", "use_metal_performance_shaders"]
                }
                result["metal_feature_set"] = self.metal_api.metal_device["feature_set_family"]
            
            return result
            
        elif operation_type == "model_load" and self.progressive_loader_available:
            # Use progressive model loader for model loading
            from fixed_web_platform.progressive_model_loader import load_model_progressively
            
            model_name = operation.get("model_name", "unknown")
            
            # Initialize progressive loader if needed
            if not self.progressive_loader:
                from fixed_web_platform.progressive_model_loader import ProgressiveModelLoader
                self.progressive_loader = ProgressiveModelLoader(
                    model_name=model_name,
                    platform="webgpu_metal",  # Special platform for Metal API
                    prioritize_components=operation.get("prioritize_components"),
                    max_chunk_size_mb=operation.get("max_chunk_size_mb", 50),
                    memory_optimization_level=operation.get("memory_optimization", "balanced")
                )
            
            # Use progress callback if provided
            progress_callback = operation.get("progress_callback")
            
            # Load model progressively
            model = self.progressive_loader.load(on_progress=progress_callback)
            
            return model
            
        else:
            # Default to simulated operation for unsupported types
            return self._simulate_native_operation(operation)
    
    def _optimize_for_safari(self, operation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply Safari-specific optimizations to operation.
        
        Args:
            operation: Operation specification
            
        Returns:
            Optimized operation
        """
        # Create a copy of the operation to modify
        optimized = operation.copy()
        operation_type = operation.get("type", "unknown")
        
        # Apply Metal optimizations if available
        if self.metal_optimizations and self.metal_api:
            model_type = operation.get("model_type", "unknown")
            input_shapes = operation.get("input_shapes", None)
            
            # Get Metal-specific optimizations for this model type
            if hasattr(self.metal_api, 'optimize_for_model_type'):
                metal_opts = self.metal_api.optimize_for_model_type(model_type, input_shapes)
                optimized["metal_optimizations"] = metal_opts
        
        # Apply optimizations based on operation type
        if operation_type == "shader":
            # Optimize shader code for Metal
            shader_code = operation.get("shader_code", "")
            optimized["shader_code"] = self._optimize_shader_for_metal(shader_code)
            
            # Adjust workgroup size for Metal
            if "workgroup_size" in operation:
                # Metal typically works better with smaller workgroup sizes
                original_size = operation["workgroup_size"]
                if isinstance(original_size, tuple) and len(original_size) >= 2:
                    # Reduce workgroup size for Metal
                    optimized["workgroup_size"] = (
                        min(original_size[0], 8),
                        min(original_size[1], 8),
                        1 if len(original_size) < 3 else min(original_size[2], 4)
                    )
        
        elif operation_type == "matmul" or operation_type == "4bit_matmul":
            # Optimize matrix multiplication for Metal
            if "block_size" in operation:
                # Use smaller block sizes for Metal
                optimized["block_size"] = min(operation["block_size"], 64)
            
            # Disable certain optimizations that don't work well in Safari
            optimized["use_shared_memory"] = False
            optimized["unroll_loops"] = False
            
            # Use Metal-specific matrix multiplication implementation if supported
            if self.capabilities.get("metal_api_supported", False):
                optimized["use_metal_performance_shaders"] = True
        
        elif operation_type == "attention":
            # Use simpler attention implementation for Safari
            use_flash = self.capabilities.get("memory_efficient_attention", False)
            optimized["use_flash_attention"] = use_flash
            optimized["use_simple_implementation"] = not use_flash
            
            # Use Metal performance shaders if available
            if self.capabilities.get("metal_api_supported", False):
                optimized["use_metal_performance_shaders"] = True
        
        elif operation_type == "model_load" and self.progressive_loader_available:
            # Enable progressive loading for Safari
            optimized["use_progressive_loading"] = True
            optimized["max_chunk_size_mb"] = min(operation.get("max_chunk_size_mb", 50), 40)
            
            # Less aggressive memory optimization for Safari 17.4+
            if self.capabilities.get("browser_version", "0") >= "17.4":
                optimized["memory_optimization"] = operation.get("memory_optimization", "balanced")
            else:
                # More aggressive for older Safari
                optimized["memory_optimization"] = "aggressive"
                
        return optimized
    
    def _optimize_shader_for_metal(self, shader_code: str) -> str:
        """
        Optimize WebGPU shader code for Metal backend.
        
        Args:
            shader_code: Original shader code
            
        Returns:
            Optimized shader code
        """
        # In a real implementation, this would apply Metal-specific optimizations
        # Here we just simulate the process with a few common adjustments
        
        # 1. Replace large workgroup declarations with smaller ones
        import re
        shader_code = re.sub(
            r'@workgroup_size\((\d+),\s*(\d+)',
            lambda m: f'@workgroup_size({min(int(m.group(1)), 8)}, {min(int(m.group(2)), 8)}',
            shader_code
        )
        
        # 2. Add Metal-specific optimization hints
        if not shader_code.startswith("// Metal optimized"):
            shader_code = "// Metal optimized\n" + shader_code
        
        # 3. Replace certain operations that may be slower on Metal
        shader_code = shader_code.replace("reverseBits", "reverse_bits_metal")
        
        # 4. Add Metal compatibility function if needed
        if "reverse_bits_metal" in shader_code:
            metal_compat = """
            fn reverse_bits_metal(x: u32) -> u32 {
                // Metal-optimized bit reversal
                var y: u32 = x;
                y = ((y >> 1) & 0x55555555u) | ((y & 0x55555555u) << 1);
                y = ((y >> 2) & 0x33333333u) | ((y & 0x33333333u) << 2);
                y = ((y >> 4) & 0x0F0F0F0Fu) | ((y & 0x0F0F0F0Fu) << 4);
                y = ((y >> 8) & 0x00FF00FFu) | ((y & 0x00FF00FFu) << 8);
                y = (y >> 16) | (y << 16);
                return y;
            }
            """
            
            # Insert the compatibility function at a suitable location
            struct_end_index = shader_code.find("};")
            if struct_end_index > 0:
                insertion_point = shader_code.find("\n", struct_end_index) + 1
                shader_code = shader_code[:insertion_point] + metal_compat + shader_code[insertion_point:]
            else:
                # No struct found, add at the top
                shader_code = metal_compat + shader_code
        
        return shader_code
    
    def _simulate_native_operation(self, operation: Dict[str, Any]) -> Any:
        """
        Simulate running a native operation in Safari WebGPU.
        
        Args:
            operation: Operation specification
            
        Returns:
            Simulated operation result
        """
        # In a real implementation, this would use the actual WebGPU API
        # Here we just simulate results
        
        operation_type = operation.get("type", "unknown")
        
        if operation_type == "matmul":
            # Simulate matrix multiplication
            a = operation.get("a", [[1, 2], [3, 4]])
            b = operation.get("b", [[5, 6], [7, 8]])
            
            # Simple matrix multiplication simulation
            rows_a = len(a)
            cols_a = len(a[0]) if rows_a > 0 else 0
            rows_b = len(b)
            cols_b = len(b[0]) if rows_b > 0 else 0
            
            if cols_a != rows_b:
                raise ValueError(f"Matrix dimensions don't match: {rows_a}x{cols_a} and {rows_b}x{cols_b}")
            
            # Initialize result matrix with zeros
            result = [[0 for _ in range(cols_b)] for _ in range(rows_a)]
            
            # Perform matrix multiplication
            for i in range(rows_a):
                for j in range(cols_b):
                    for k in range(cols_a):
                        result[i][j] += a[i][k] * b[k][j]
            
            return result
        
        elif operation_type == "4bit_matmul":
            # Simulate 4-bit quantized matrix multiplication
            # In a real implementation, this would dequantize and multiply
            return [
                [10.5, 11.2, 9.8],
                [8.7, 12.3, 10.1]
            ]
        
        elif operation_type == "shader":
            # Simulate shader execution
            # Just return a dummy result
            return {"execution_time_ms": 5.2, "success": True}
        
        elif operation_type == "attention":
            # Simulate attention computation
            # Return a simulated attention output
            batch_size = operation.get("batch_size", 1)
            seq_length = operation.get("seq_length", 10)
            num_heads = operation.get("num_heads", 8)
            head_dim = operation.get("head_dim", 64)
            
            # Return tensor of appropriate shape
            return {
                "attention_output": [
                    [
                        [0.1 * i + 0.01 * j + 0.001 * k for k in range(head_dim)]
                        for j in range(seq_length)
                    ]
                    for i in range(batch_size * num_heads)
                ]
            }
        
        # Default case: unknown operation
        return {"result": "simulated", "operation_type": operation_type}
    
    def _recover_from_memory_error(self):
        """
        Recover from memory error in Safari.
        
        Steps:
        1. Unload non-critical model components
        2. Force garbage collection
        3. Reduce quantization precision if possible
        4. Disable shader caching temporarily
        
        Returns:
            Boolean indicating if recovery was successful
        """
        logger.warning("Recovering from memory error in Safari")
        
        success = False
        recovery_actions = []
        
        # Strategy 1: Unload non-critical components if progressive loader is available
        if hasattr(self, "progressive_loader") and self.progressive_loader:
            try:
                # Unload non-critical components (middle layers can be reloaded as needed)
                self.progressive_loader.unload_components(["middle_layers"])
                recovery_actions.append("unloaded_middle_layers")
                success = True
            except Exception as e:
                logger.error(f"Failed to unload components: {e}")
        
        # Strategy 2: Force garbage collection
        try:
            import gc
            gc.collect()
            recovery_actions.append("garbage_collection")
            success = True
        except Exception as e:
            logger.error(f"Failed to run garbage collection: {e}")
        
        # Strategy 3: Reduce shader cache size if Metal API is available
        if self.metal_api and hasattr(self.metal_api, "shader_cache"):
            try:
                # Clear non-essential shaders from cache
                shader_cache_size = len(self.metal_api.shader_cache)
                if shader_cache_size > 5:  # Keep a few critical shaders
                    # Get shaders sorted by usage frequency (keep most used)
                    shader_keys = list(self.metal_api.shader_cache.keys())
                    # Remove least used shaders (keeping 5 most used)
                    for key in shader_keys[5:]:
                        del self.metal_api.shader_cache[key]
                    recovery_actions.append(f"cleared_shader_cache_{shader_cache_size-5}_entries")
                    success = True
            except Exception as e:
                logger.error(f"Failed to clear shader cache: {e}")
        
        # Strategy 4: Switch to lower precision if using Metal API
        if hasattr(self, "metal_api") and self.metal_api:
            try:
                # If using 4-bit, try to fall back to 2-bit for temporary memory savings
                if self.capabilities.get("quantization", {}).get("int4", False):
                    # Signal that we should use 2-bit for next operations temporarily
                    self._use_2bit_temporary = True
                    recovery_actions.append("reduced_precision_temporarily")
                    success = True
            except Exception as e:
                logger.error(f"Failed to adjust precision: {e}")
        
        # Log recovery attempt results
        if success:
            logger.info(f"Memory error recovery successful: {', '.join(recovery_actions)}")
        else:
            logger.error("Memory error recovery failed, no successful actions")
            
        return success
        
    def _recover_from_timeout(self):
        """
        Recover from timeout in Safari.
        
        Steps:
        1. Reduce batch size
        2. Simplify shader complexity
        3. Disable optimizations temporarily
        4. Switch to lighter compute model
        
        Returns:
            Boolean indicating if recovery was successful
        """
        logger.warning("Recovering from timeout in Safari")
        
        success = False
        recovery_actions = []
        
        # Strategy 1: Reduce batch size
        if hasattr(self, "_current_batch_size"):
            old_batch_size = self._current_batch_size
            self._current_batch_size = max(1, self._current_batch_size // 2)
            recovery_actions.append(f"reduced_batch_size_{old_batch_size}_to_{self._current_batch_size}")
            success = True
        
        # Strategy 2: Simplify shader complexity for future operations
        if self.metal_optimizations and hasattr(self, "_shader_complexity"):
            old_complexity = self._shader_complexity
            self._shader_complexity = "simple"  # Switch to simpler shaders
            recovery_actions.append(f"simplified_shaders_{old_complexity}_to_simple")
            success = True
        else:
            # Initialize shader complexity setting if not already set
            self._shader_complexity = "simple"
            recovery_actions.append("initialized_simple_shaders")
            success = True
            
        # Strategy 3: Disable compute-intensive optimizations temporarily
        if hasattr(self, "_optimizations_level"):
            old_level = self._optimizations_level
            self._optimizations_level = "minimal"  # Minimal optimizations to prevent timeouts
            recovery_actions.append(f"reduced_optimizations_{old_level}_to_minimal")
            success = True
        else:
            # Initialize optimizations level if not already set
            self._optimizations_level = "minimal"
            recovery_actions.append("initialized_minimal_optimizations")
            success = True
            
        # Log recovery attempt results
        if success:
            logger.info(f"Timeout recovery successful: {', '.join(recovery_actions)}")
        else:
            logger.error("Timeout recovery failed, no successful actions")
            
        # Wait a small amount before retrying to ensure system resources are freed
        import time
        time.sleep(0.1)
            
        return success
        
    def _recover_from_connection_error(self):
        """
        Recover from connection error in Safari.
        
        Steps:
        1. Wait with exponential backoff
        2. Check network status
        3. Reduce payload size
        4. Switch to more resilient transport mode
        
        Returns:
            Boolean indicating if recovery was successful
        """
        logger.warning("Recovering from connection error in Safari")
        
        success = False
        recovery_actions = []
        
        # Strategy 1: Implement exponential backoff
        if not hasattr(self, "_connection_retry_count"):
            self._connection_retry_count = 0
        
        # Increment retry count
        self._connection_retry_count += 1
        
        # Calculate wait time with exponential backoff (cap at 2 seconds)
        wait_time = min(0.1 * (2 ** self._connection_retry_count), 2.0)
        
        # Wait before retrying
        import time
        time.sleep(wait_time)
        recovery_actions.append(f"backoff_wait_{wait_time:.2f}s")
        
        # Strategy 2: Reduce payload size for future operations
        if not hasattr(self, "_reduced_payload_size"):
            self._reduced_payload_size = True
            recovery_actions.append("reduced_payload_size")
            success = True
            
        # Strategy 3: Switch to chunked transfer mode for large data
        if not hasattr(self, "_use_chunked_transfer"):
            self._use_chunked_transfer = True
            recovery_actions.append("enabled_chunked_transfer")
            success = True
            
        # Reset retry count after several attempts
        if self._connection_retry_count > 5:
            # After 5 retries, reset the count but try a different recovery strategy
            self._connection_retry_count = 0
            
            # Strategy 4: Switch to a more reliable but potentially slower connection method
            self._use_reliable_connection = True
            recovery_actions.append("switched_to_reliable_connection")
            success = True
            
        # Log recovery attempt results
        if success:
            logger.info(f"Connection error recovery successful: {', '.join(recovery_actions)}")
        else:
            logger.error("Connection error recovery failed, no successful actions")
            
        return True  # Always return true to encourage retry
        
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get performance and usage metrics.
        
        Returns:
            Dictionary with metrics
        """
        total_operations = self.metrics["native_operations"] + self.metrics["fallback_operations"]
        total_time_ms = self.metrics["native_time_ms"] + self.metrics["fallback_time_ms"]
        
        if total_operations > 0:
            fallback_percent = (self.metrics["fallback_operations"] / total_operations) * 100
        else:
            fallback_percent = 0
        
        # Calculate metrics for each operation type
        operation_metrics = {}
        for op_type, stats in self.metrics["operations"].items():
            op_total = stats["native_count"] + stats["fallback_count"]
            if op_total > 0:
                op_fallback_percent = (stats["fallback_count"] / op_total) * 100
                op_avg_time_native = stats["native_time_ms"] / stats["native_count"] if stats["native_count"] > 0 else 0
                op_avg_time_fallback = stats["fallback_time_ms"] / stats["fallback_count"] if stats["fallback_count"] > 0 else 0
                
                operation_metrics[op_type] = {
                    "total_count": op_total,
                    "native_count": stats["native_count"],
                    "fallback_count": stats["fallback_count"],
                    "fallback_percent": op_fallback_percent,
                    "avg_time_native_ms": op_avg_time_native,
                    "avg_time_fallback_ms": op_avg_time_fallback,
                    "speedup_factor": op_avg_time_fallback / op_avg_time_native if op_avg_time_native > 0 and stats["native_count"] > 0 and stats["fallback_count"] > 0 else 1.0
                }
        
        return {
            "total_operations": total_operations,
            "native_operations": self.metrics["native_operations"],
            "fallback_operations": self.metrics["fallback_operations"],
            "fallback_percent": fallback_percent,
            "total_time_ms": total_time_ms,
            "native_time_ms": self.metrics["native_time_ms"],
            "fallback_time_ms": self.metrics["fallback_time_ms"],
            "operations": operation_metrics,
            "browser_version": self.capabilities["browser_version"],
            "capabilities": self.capabilities
        }
    
    def create_optimized_pipeline(self, model_type: str, tensor_shapes: Dict[str, List[int]] = None) -> Dict[str, Any]:
        """
        Create WebGPU compute pipeline optimized for Safari.
        
        Args:
            model_type: Type of model (bert, t5, etc.)
            tensor_shapes: Dictionary of tensor shapes
            
        Returns:
            Optimized pipeline configuration
        """
        # Extract Safari version information for version-specific optimizations
        safari_version = self.capabilities["browser_version"]
        version_parts = safari_version.split(".")
        major_version = int(version_parts[0]) if version_parts and version_parts[0].isdigit() else 17
        minor_version = int(version_parts[1]) if len(version_parts) > 1 and version_parts[1].isdigit() else 6
        
        # Start with a default pipeline configuration
        pipeline = {
            "workgroup_size": (4, 4, 1),  # Small workgroup size for Safari
            "shared_memory_size": 0,      # No shared memory for Safari
            "use_storage_buffers": True,  # Storage buffers are well supported
            "unroll_loops": False,        # Don't unroll loops in Safari
            "optimize_for_metal": True,   # Use Metal-specific optimizations
            "precompile_shaders": self.capabilities.get("shader_precompilation", False),
            "model_type": model_type,
            "safari_version": safari_version
        }
        
        # Version-specific optimizations
        if major_version >= 18 or (major_version == 17 and minor_version >= 7):
            # Safari 17.7+ and 18.x have better compute shader support
            pipeline["workgroup_size"] = (8, 8, 1)  # Larger workgroups possible
            pipeline["shared_memory_size"] = 16384  # 16KB shared memory
            pipeline["unroll_loops"] = True         # Loop unrolling works better
        
        # Model-specific optimizations
        if model_type == "bert" or model_type == "t5":
            # Embedding models work reasonably well in Safari
            pipeline["shader_entry_points"] = [
                "main_embedding_lookup",
                "main_attention",
                "main_layer_norm"
            ]
            
            # Version 17.8+ can use flash attention for these models
            if major_version >= 18 or (major_version == 17 and minor_version >= 8):
                pipeline["use_flash_attention"] = True
            else:
                pipeline["use_flash_attention"] = False
                
        elif model_type == "llama" or model_type == "qwen":
            # LLMs need special attention in Safari
            pipeline["shader_entry_points"] = [
                "main_embedding_lookup",
                "main_simple_attention",  # Use simple attention, not flash attention
                "main_layer_norm",
                "main_mlp"
            ]
            
            # Use KV cache optimization if supported
            pipeline["use_kv_cache_optimization"] = self.capabilities.get("kv_cache_optimization", False)
            
            # Use sliding window attention as fallback for long contexts
            pipeline["use_sliding_window"] = True
            
            # Set quantization level based on capabilities
            if self.capabilities["quantization"]["int4"]:
                pipeline["quantization"] = "int4"
            elif self.capabilities["quantization"]["int8"]:
                pipeline["quantization"] = "int8"
            else:
                pipeline["quantization"] = "fp16"
                
        elif "vision" in model_type.lower() or model_type in ["vit", "clip"]:
            # Vision models need specialized pipeline
            pipeline["shader_entry_points"] = [
                "main_conv2d",
                "main_attention",
                "main_layer_norm",
                "main_pooling"
            ]
            # Vision models benefit from slightly larger workgroups
            pipeline["workgroup_size"] = (8, 8, 1)
            
            # Use more storage buffers for vision models
            pipeline["use_storage_buffer_for_weights"] = True
            
        elif "audio" in model_type.lower() or model_type in ["whisper", "wav2vec2", "clap"]:
            # Audio models need specialized compute shader support
            pipeline["shader_entry_points"] = [
                "main_audio_processing",
                "main_fft",
                "main_mel_spectrogram",
                "main_attention"
            ]
            
            # Use compute shaders if supported
            pipeline["use_compute_shaders"] = self.capabilities.get("compute_shaders", False)
            
            # Add audio-specific optimizations
            pipeline["use_audio_optimizations"] = True
            pipeline["batch_audio_processing"] = True
            
        # Tensor shape specific optimizations
        if tensor_shapes:
            # Apply shape-specific optimizations
            max_dim = 0
            for shape in tensor_shapes.values():
                if len(shape) > 0:
                    max_dim = max(max_dim, max(shape))
            
            # Adjust pipeline for large tensors
            if max_dim > 4096:
                pipeline["use_tiling"] = True
                # Adjust tile size based on Safari version
                if major_version >= 18:
                    pipeline["tile_size"] = 2048  # Larger tiles for newer Safari
                else:
                    pipeline["tile_size"] = 1024  # Smaller tiles for older Safari
            
            # Add tensor-specific memory optimizations
            pipeline["tensor_shapes"] = tensor_shapes
            pipeline["optimize_memory_layout"] = True
        
        return pipeline

def optimize_for_safari(
    operation: Dict[str, Any], 
    fallback_to_wasm: bool = True,
    user_agent: Optional[str] = None,
    enable_metal_api: bool = True,
    model_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Optimize an operation for Safari WebGPU.
    
    Args:
        operation: Operation specification
        fallback_to_wasm: Whether to check if fallback is needed
        user_agent: Optional user agent string for browser detection
        enable_metal_api: Whether to enable Metal API optimizations
        model_type: Optional model type for specialized optimizations
        
    Returns:
        Optimized operation with fallback information
    """
    # Create Safari handler with user agent detection
    handler = SafariWebGPUHandler(
        fallback_to_wasm=fallback_to_wasm,
        enable_metal_api=enable_metal_api,
        user_agent=user_agent
    )
    
    # Add model type if provided
    if model_type and "model_type" not in operation:
        operation = operation.copy()
        operation["model_type"] = model_type
    
    # Apply Safari-specific optimizations
    optimized_operation = handler._optimize_for_safari(operation)
    
    # Add fallback information
    operation_type = operation.get("type", "unknown")
    use_fallback = handler.should_use_fallback(operation_type)
    
    # Add optimization metadata
    optimized_operation["safari_optimized"] = True
    optimized_operation["use_wasm_fallback"] = use_fallback
    optimized_operation["metal_optimized"] = handler.metal_optimizations
    
    # Add browser capability information
    if hasattr(handler, 'browser_capabilities'):
        optimized_operation["browser_info"] = {
            "browser": handler.browser_capabilities.get("browser_name", "Safari"),
            "version": handler.browser_capabilities.get("browser_version", "unknown"),
            "platform": handler.browser_capabilities.get("platform", "unknown"),
            "metal_api_supported": handler.browser_capabilities.get("metal_api_supported", False)
        }
    
    # Add Metal API features if available
    if handler.metal_optimizations and handler.metal_api:
        optimized_operation["metal_api_features"] = {
            "feature_set_family": handler.metal_api.metal_device["feature_set_family"],
            "supports_int8": handler.metal_api.metal_device["supports_int8"],
            "supports_int4": handler.metal_api.metal_device["supports_int4"]
        }
    
    # Add progressive loader information if relevant
    if operation_type == "model_load" and handler.progressive_loader_available:
        optimized_operation["progressive_loading_available"] = True
    
    return optimized_operation


def get_safari_capabilities(user_agent: Optional[str] = None) -> Dict[str, Any]:
    """
    Get Safari WebGPU capabilities without creating a full handler.
    
    Args:
        user_agent: Optional user agent string for browser detection
        
    Returns:
        Dictionary with Safari capabilities
    """
    try:
        # Try to use browser capability detection first
        from fixed_web_platform.browser_capability_detection import detect_browser_capabilities
        capabilities = detect_browser_capabilities(user_agent)
        
        # Only return if it's Safari
        if capabilities["browser_name"] == "Safari":
            return {
                "browser_version": capabilities["browser_version"],
                "webgpu_supported": capabilities["webgpu_supported"],
                "compute_shaders": capabilities["webgpu_features"]["compute_shaders"],
                "shader_precompilation": capabilities["webgpu_features"]["shader_compilation"],
                "metal_api_supported": capabilities.get("metal_api_supported", False),
                "metal_api_version": capabilities.get("metal_api_version", 0.0),
                "browser_capabilities": capabilities
            }
    except ImportError:
        pass
    
    # Fall back to basic Safari handler
    handler = SafariWebGPUHandler(user_agent=user_agent)
    
    return {
        "browser_version": handler.capabilities.get("browser_version", "17.0"),
        "webgpu_supported": handler.capabilities.get("webgpu_supported", False),
        "compute_shaders": handler.capabilities.get("compute_shaders", False),
        "shader_precompilation": handler.capabilities.get("shader_precompilation", False),
        "metal_api_supported": handler.capabilities.get("metal_api_supported", False),
        "metal_api_version": handler.capabilities.get("metal_api_version", 0.0),
        "metal_optimizations": handler.metal_optimizations
    }

if __name__ == "__main__":
    # Example usage
    print("Safari WebGPU Handler - Example Usage")
    print("=====================================")
    
    # Example 1: Basic Safari handler with detected capabilities
    print("\nExample 1: Basic Safari Handler")
    handler = SafariWebGPUHandler(fallback_to_wasm=True)
    
    # Print capabilities
    print("\nSafari WebGPU Capabilities:")
    for feature, supported in handler.capabilities.items():
        if isinstance(supported, dict):
            print(f"  {feature}:")
            for subfeature, subsupported in supported.items():
                print(f"    {subfeature}: {'✅' if subsupported else '❌'}")
        else:
            print(f"  {feature}: {'✅' if supported else '❌'}")
    
    # Example 2: Matrix multiplication with Metal API integration
    print("\nExample 2: Matrix Multiplication with Metal API")
    matmul_op = {
        "type": "matmul",
        "a": [[1, 2], [3, 4]],
        "b": [[5, 6], [7, 8]],
        "model_type": "bert"  # Specify model type for optimization
    }
    
    # Metal API should be used if available
    print("  Using adaptive implementation")
    result = handler.run_native(matmul_op)
    
    print(f"  Result: {result['result']}")
    print(f"  Time: {result['time_ms']:.2f}ms")
    print(f"  Implementation: {result['implementation']}")
    print(f"  Metal API Used: {result.get('metal_api_used', False)}")
    
    # Example 3: 4-bit matrix multiplication (uses fallback on older Safari)
    print("\nExample 3: 4-bit Matrix Multiplication")
    fourbit_op = {
        "type": "4bit_matmul",
        "inputs": [[0.1, 0.2, 0.3]],
        "weights_quantized": [[10, 20], [30, 40], [50, 60]],
        "scales": [0.1, 0.1],
        "model_type": "llama"  # LLM model type
    }
    
    if handler.should_use_fallback("4bit_matmul"):
        print("  Using WebAssembly fallback")
        result = handler.run_with_fallback(fourbit_op)
    else:
        print("  Using Metal API or native implementation")
        result = handler.run_native(fourbit_op)
    
    print(f"  Result: {result['result']}")
    print(f"  Time: {result['time_ms']:.2f}ms")
    print(f"  Implementation: {result['implementation']}")
    
    # Example 4: Progressive model loading
    print("\nExample 4: Progressive Model Loading")
    model_op = {
        "type": "model_load",
        "model_name": "bert-base-uncased",
        "max_chunk_size_mb": 30,
        "memory_optimization": "balanced"
    }
    
    # Check if progressive loading is available
    if handler.progressive_loader_available:
        print("  Progressive loading is available")
        # No need to actually run this in demo
    else:
        print("  Progressive loading is not available")
    
    # Example 5: Using browser capabilities detection
    print("\nExample 5: Browser Capabilities Detection")
    
    # Test with different Safari user agents
    user_agents = [
        # Safari 17.3 on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        # Safari 17.0 on iOS
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ]
    
    for i, ua in enumerate(user_agents):
        print(f"\n  Safari Test {i+1}: {ua[:50]}...")
        caps = get_safari_capabilities(ua)
        print(f"  Detected Safari {caps['browser_version']}")
        print(f"  WebGPU Support: {'✅' if caps['webgpu_supported'] else '❌'}")
        print(f"  Metal API Support: {'✅' if caps['metal_api_supported'] else '❌'}")
        print(f"  Compute Shaders: {'✅' if caps['compute_shaders'] else '❌'}")
    
    # Example 6: Create optimized pipeline for different model types
    print("\nExample 6: Optimized Model Pipelines")
    for model_type in ["bert", "llama", "vit", "whisper"]:
        pipeline = handler.create_optimized_pipeline(model_type)
        print(f"\n  {model_type.upper()} Pipeline:")
        print(f"  - Workgroup Size: {pipeline['workgroup_size']}")
        print(f"  - Shared Memory: {pipeline['shared_memory_size']} bytes")
        print(f"  - Shader Entry Points: {pipeline.get('shader_entry_points', [])}")
        print(f"  - Metal Optimizations: {pipeline.get('optimize_for_metal', False)}")
    
    # Example 7: Performance Metrics
    print("\nExample 7: Handler Performance Metrics")
    metrics = handler.get_metrics()
    print(f"  Total Operations: {metrics['total_operations']}")
    print(f"  Native Operations: {metrics['native_operations']}")
    print(f"  Metal Operations: {metrics.get('metal_operations', 0)}")
    print(f"  Fallback Operations: {metrics['fallback_operations']}")
    print(f"  Browser Version: {metrics.get('browser_version', 'Unknown')}")
    
    if handler.metal_api:
        print("\n  Metal API Performance Metrics:")
        metal_metrics = handler.metal_api.get_performance_metrics()
        print(f"  - Compilation Time: {metal_metrics.get('compilation_time_ms', 0):.2f}ms")
        print(f"  - Execution Time: {metal_metrics.get('execution_time_ms', 0):.2f}ms")
        print(f"  - Shader Cache Hits: {metal_metrics.get('shader_cache_hits', 0)}")
        print(f"  - Total Operations: {metal_metrics.get('total_operations', 0)}")