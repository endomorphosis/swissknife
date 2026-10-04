#!/usr/bin/env python3
"""
WebGPU Low-Latency Optimizer - August 2025

This module implements specialized optimizations for minimal latency in WebGPU streaming
inference, with browser-specific optimizations, prefill/decode transition optimizations,
and compute shader workgroup tuning for latency-critical paths.

Key features:
- Inference pipeline optimizations for minimal latency
- Browser-specific optimizations for different engines
- Prefill/decode phase transition optimization
- Advanced token buffer management
- Compute shader workgroup optimization for latency-critical paths

Usage:
    from fixed_web_platform.webgpu_low_latency_optimizer import (
        optimize_for_low_latency,
        BrowserLatencyOptimizer,
        TokenBufferManager,
        PrefillDecodeOptimizer
    )
    
    # Apply low-latency optimizations to a streaming configuration
    config = {
        "quantization": "int4",
        "latency_optimized": True
    }
    
    # Apply optimizations
    optimized_config = optimize_for_low_latency(
        config,
        browser="chrome",
        device_profile="high_end"
    )
    
    # Create specialized optimizers
    buffer_manager = TokenBufferManager(buffer_size=1)
    prefill_optimizer = PrefillDecodeOptimizer()
"""

import os
import sys
import json
import math
import time
import logging
import platform
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Browser-specific workgroup configurations
BROWSER_WORKGROUPS = {
    "chrome": {
        "default": (256, 1, 1),
        "large_model": (384, 1, 1),
        "prefill": (128, 2, 1),
        "decode": (256, 1, 1),
        "high_end": (384, 1, 1),
        "mid_range": (256, 1, 1),
        "integrated": (128, 2, 1),
        "mobile": (64, 2, 1)
    },
    "edge": {
        "default": (256, 1, 1),
        "large_model": (384, 1, 1),
        "prefill": (128, 2, 1),
        "decode": (256, 1, 1),
        "high_end": (384, 1, 1),
        "mid_range": (256, 1, 1),
        "integrated": (128, 2, 1),
        "mobile": (64, 2, 1)
    },
    "firefox": {
        "default": (128, 2, 1),     # Firefox performs better with more workgroups
        "large_model": (128, 4, 1),
        "prefill": (64, 4, 1),
        "decode": (128, 2, 1),
        "high_end": (128, 4, 1),
        "mid_range": (128, 2, 1),
        "integrated": (64, 2, 1),
        "mobile": (32, 4, 1)
    },
    "safari": {
        "default": (64, 2, 1),      # Safari needs smaller workgroups
        "large_model": (64, 4, 1),
        "prefill": (32, 4, 1),
        "decode": (64, 2, 1),
        "high_end": (128, 2, 1),
        "mid_range": (64, 2, 1),
        "integrated": (32, 4, 1),
        "mobile": (16, 4, 1)
    }
}

# Browser-specific shader optimizations
BROWSER_SHADER_OPTIMIZATIONS = {
    "chrome": {
        "use_subgroups": True,
        "unroll_loops": True,
        "use_shared_memory": True,
        "prefill_optimization": "tensor_parallel",
        "decode_optimization": "kv_cache_fusion",
        "memory_optimization": "zero_copy"
    },
    "edge": {
        "use_subgroups": True,
        "unroll_loops": True,
        "use_shared_memory": True,
        "prefill_optimization": "tensor_parallel",
        "decode_optimization": "kv_cache_fusion",
        "memory_optimization": "zero_copy"
    },
    "firefox": {
        "use_subgroups": False,     # Firefox has limited subgroup support
        "unroll_loops": True,
        "use_shared_memory": True,
        "prefill_optimization": "shared_memory",
        "decode_optimization": "small_batches",
        "memory_optimization": "texture_compression"
    },
    "safari": {
        "use_subgroups": False,     # Safari doesn't support subgroups
        "unroll_loops": False,      # Safari can have issues with unrolled loops
        "use_shared_memory": True,
        "prefill_optimization": "split_batch",
        "decode_optimization": "minimal_batch",
        "memory_optimization": "early_deallocation"
    }
}

# Device profile characteristics
DEVICE_PROFILES = {
    "high_end": {
        "memory_gb": 8,
        "cores": 32,
        "batch_size_max": 16,
        "concurrent_streams": 4,
        "memory_bandwidth_gbps": 600
    },
    "mid_range": {
        "memory_gb": 4,
        "cores": 16,
        "batch_size_max": 8,
        "concurrent_streams": 2,
        "memory_bandwidth_gbps": 300
    },
    "integrated": {
        "memory_gb": 2,
        "cores": 8,
        "batch_size_max": 4,
        "concurrent_streams": 1,
        "memory_bandwidth_gbps": 100
    },
    "mobile": {
        "memory_gb": 1,
        "cores": 4,
        "batch_size_max": 2,
        "concurrent_streams": 1,
        "memory_bandwidth_gbps": 50
    }
}

class BrowserLatencyOptimizer:
    """
    Optimizes WebGPU compute configurations for minimal latency based on browser.
    
    This class provides browser-specific optimizations for different engines, compute
    shader workgroup tuning, and shader algorithm optimizations for latency-critical paths.
    """
    
    def __init__(self, browser: str = None, device_profile: str = None):
        """
        Initialize the browser-specific latency optimizer.
        
        Args:
            browser: Browser name (chrome, edge, firefox, safari) or None for auto-detection
            device_profile: Device profile (high_end, mid_range, integrated, mobile) or None for auto-detection
        """
        # Auto-detect browser if not specified
        self.browser = browser or self._detect_browser()
        self.device_profile = device_profile or self._detect_device_profile()
        
        # Get optimization profiles
        self.workgroups = self._get_workgroup_config()
        self.shader_optimizations = self._get_shader_optimizations()
        self.device_characteristics = self._get_device_characteristics()
        
        logger.info(f"Initialized latency optimizer for {self.browser} browser with {self.device_profile} profile")
    
    def _detect_browser(self) -> str:
        """
        Detect the current browser from environment variables or system information.
        
        Returns:
            Browser name (chrome, edge, firefox, safari)
        """
        # Check environment variables (set by testing framework or browser extension)
        if os.environ.get("BROWSER_TYPE"):
            browser_type = os.environ.get("BROWSER_TYPE").lower()
            if browser_type in BROWSER_WORKGROUPS:
                return browser_type
        
        # Check for TEST_BROWSER environment variable
        if os.environ.get("TEST_BROWSER"):
            browser_type = os.environ.get("TEST_BROWSER").lower()
            if browser_type in BROWSER_WORKGROUPS:
                return browser_type
        
        # Default to Chrome in simulation mode
        logger.info("Browser not detected, defaulting to Chrome")
        return "chrome"
    
    def _detect_device_profile(self) -> str:
        """
        Detect the device profile based on system information or environment variables.
        
        Returns:
            Device profile (high_end, mid_range, integrated, mobile)
        """
        # Check environment variables (set by testing framework)
        if os.environ.get("DEVICE_PROFILE"):
            profile = os.environ.get("DEVICE_PROFILE").lower()
            if profile in DEVICE_PROFILES:
                return profile
        
        # Check for other environment hints
        processing_speed = os.environ.get("PROCESSING_SPEED", "").lower()
        memory_capacity = os.environ.get("MEMORY_CAPACITY", "").lower()
        
        if processing_speed == "fast" or memory_capacity == "high":
            return "high_end"
        elif processing_speed == "medium" or memory_capacity == "medium":
            return "mid_range"
        elif processing_speed == "slow" or memory_capacity == "low":
            return "integrated"
        elif processing_speed == "very_slow" or memory_capacity == "very_low":
            return "mobile"
        
        # Try to detect based on system info
        try:
            import psutil
            memory_gb = psutil.virtual_memory().total / (1024 * 1024 * 1024)
            cpu_count = psutil.cpu_count(logical=True)
            
            if memory_gb >= 16 and cpu_count >= 16:
                return "high_end"
            elif memory_gb >= 8 and cpu_count >= 8:
                return "mid_range"
            elif memory_gb >= 4:
                return "integrated"
            else:
                return "mobile"
        except ImportError:
            # Fallback to mid-range if can't detect
            return "mid_range"
    
    def _get_workgroup_config(self) -> Dict[str, Tuple[int, int, int]]:
        """
        Get workgroup configurations for the current browser.
        
        Returns:
            Dictionary of workgroup configurations
        """
        if self.browser in BROWSER_WORKGROUPS:
            return BROWSER_WORKGROUPS[self.browser]
        else:
            # Default to Chrome if browser not recognized
            return BROWSER_WORKGROUPS["chrome"]
    
    def _get_shader_optimizations(self) -> Dict[str, Any]:
        """
        Get shader optimizations for the current browser.
        
        Returns:
            Dictionary of shader optimization settings
        """
        if self.browser in BROWSER_SHADER_OPTIMIZATIONS:
            return BROWSER_SHADER_OPTIMIZATIONS[self.browser]
        else:
            # Default to Chrome if browser not recognized
            return BROWSER_SHADER_OPTIMIZATIONS["chrome"]
    
    def _get_device_characteristics(self) -> Dict[str, Any]:
        """
        Get device characteristics for the current profile.
        
        Returns:
            Dictionary of device characteristics
        """
        if self.device_profile in DEVICE_PROFILES:
            return DEVICE_PROFILES[self.device_profile]
        else:
            # Default to mid-range if profile not recognized
            return DEVICE_PROFILES["mid_range"]
    
    def get_optimal_workgroup_size(self, operation_type: str = "default") -> Tuple[int, int, int]:
        """
        Get the optimal workgroup size for the current browser and operation type.
        
        Args:
            operation_type: Type of operation (default, large_model, prefill, decode)
            
        Returns:
            Tuple of (x, y, z) workgroup dimensions
        """
        # First check for exact operation type match
        if operation_type in self.workgroups:
            return self.workgroups[operation_type]
        
        # If not found, check device profile-specific config
        if self.device_profile in self.workgroups:
            return self.workgroups[self.device_profile]
        
        # Fallback to default
        return self.workgroups["default"]
    
    def get_prefill_workgroup_size(self) -> Tuple[int, int, int]:
        """
        Get the optimal workgroup size for prefill phase.
        
        Returns:
            Tuple of (x, y, z) workgroup dimensions
        """
        return self.get_optimal_workgroup_size("prefill")
    
    def get_decode_workgroup_size(self) -> Tuple[int, int, int]:
        """
        Get the optimal workgroup size for decode phase.
        
        Returns:
            Tuple of (x, y, z) workgroup dimensions
        """
        return self.get_optimal_workgroup_size("decode")
    
    def optimize_shader_for_browser(self, shader_code: str, operation_type: str = "default") -> str:
        """
        Apply browser-specific optimizations to a compute shader.
        
        Args:
            shader_code: WGSL shader code
            operation_type: Type of operation (default, prefill, decode)
            
        Returns:
            Optimized shader code
        """
        optimizations = self.shader_optimizations
        
        # Apply browser-specific optimizations
        modified_code = shader_code
        
        # Apply subgroup optimizations if supported
        if operation_type == "prefill" and "prefill_optimization" in optimizations:
            if optimizations.get("use_subgroups", False):
                modified_code = self._add_subgroup_optimization(modified_code)
            
            # Apply prefill-specific optimizations
            prefill_opt = optimizations["prefill_optimization"]
            if prefill_opt == "tensor_parallel":
                modified_code = self._apply_tensor_parallel_optimization(modified_code)
            elif prefill_opt == "shared_memory":
                modified_code = self._apply_shared_memory_optimization(modified_code)
            elif prefill_opt == "split_batch":
                modified_code = self._apply_split_batch_optimization(modified_code)
        
        # Apply decode-specific optimizations
        elif operation_type == "decode" and "decode_optimization" in optimizations:
            decode_opt = optimizations["decode_optimization"]
            if decode_opt == "kv_cache_fusion":
                modified_code = self._apply_kv_cache_fusion(modified_code)
            elif decode_opt == "small_batches":
                modified_code = self._apply_small_batches_optimization(modified_code)
            elif decode_opt == "minimal_batch":
                modified_code = self._apply_minimal_batch_optimization(modified_code)
        
        # Apply loop unrolling if enabled
        if optimizations.get("unroll_loops", False):
            modified_code = self._apply_loop_unrolling(modified_code)
        
        # Set appropriate workgroup size
        workgroup_size = self.get_optimal_workgroup_size(operation_type)
        modified_code = self._set_workgroup_size(modified_code, workgroup_size)
        
        return modified_code
    
    def optimize_for_low_latency(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Optimize a configuration for low latency on the current browser.
        
        Args:
            config: Base configuration dictionary
            
        Returns:
            Optimized configuration dictionary
        """
        # Start with base config
        optimized_config = config.copy()
        
        # Apply browser-specific optimizations
        optimized_config["browser"] = self.browser
        optimized_config["device_profile"] = self.device_profile
        
        # Set workgroup sizes
        optimized_config["prefill_workgroup_size"] = self.get_prefill_workgroup_size()
        optimized_config["decode_workgroup_size"] = self.get_decode_workgroup_size()
        
        # Set shader optimizations
        optimized_config["shader_optimizations"] = self.shader_optimizations
        
        # Set browser-specific batch size limits
        device_characteristics = self.device_characteristics
        optimized_config["max_batch_size"] = min(
            optimized_config.get("max_batch_size", 8),
            device_characteristics["batch_size_max"]
        )
        
        # Set buffer size for minimal latency (smaller buffer = lower latency)
        optimized_config["stream_buffer_size"] = 1  # Minimum for lowest latency
        
        # Mark as latency optimized
        optimized_config["latency_optimized"] = True
        
        # Apply browser-specific memory optimizations
        memory_opt = self.shader_optimizations.get("memory_optimization")
        if memory_opt:
            optimized_config["memory_optimization"] = memory_opt
        
        return optimized_config
    
    # Shader optimization helper methods
    def _add_subgroup_optimization(self, shader_code: str) -> str:
        """Add subgroup optimization to shader code."""
        # Example implementation - would be more complex in real code
        if "subgroupSize" not in shader_code:
            # Add subgroup extensions and declarations
            preamble = """
            // Subgroup optimization for low latency
            enable subgroups;
            
            // Use subgroup operations for faster parallel reduction
            """
            
            shader_code = preamble + shader_code
        
        return shader_code
    
    def _apply_tensor_parallel_optimization(self, shader_code: str) -> str:
        """Apply tensor parallel optimization for prefill."""
        # Real implementation would inject specialized parallel code
        # Example implementation just adds a comment
        if "// TENSOR_PARALLEL" not in shader_code:
            shader_code = "// TENSOR_PARALLEL optimization applied\n" + shader_code
        
        return shader_code
    
    def _apply_shared_memory_optimization(self, shader_code: str) -> str:
        """Apply shared memory optimization for prefill."""
        # Real implementation would add shared memory usage
        # Example implementation just adds a comment
        if "// SHARED_MEMORY" not in shader_code:
            shader_code = "// SHARED_MEMORY optimization applied\n" + shader_code
        
        return shader_code
    
    def _apply_split_batch_optimization(self, shader_code: str) -> str:
        """Apply split batch optimization for prefill."""
        # Real implementation would add batch splitting logic
        # Example implementation just adds a comment
        if "// SPLIT_BATCH" not in shader_code:
            shader_code = "// SPLIT_BATCH optimization applied\n" + shader_code
        
        return shader_code
    
    def _apply_kv_cache_fusion(self, shader_code: str) -> str:
        """Apply KV cache fusion optimization for decode."""
        # Real implementation would add KV cache fusion logic
        # Example implementation just adds a comment
        if "// KV_CACHE_FUSION" not in shader_code:
            shader_code = "// KV_CACHE_FUSION optimization applied\n" + shader_code
        
        return shader_code
    
    def _apply_small_batches_optimization(self, shader_code: str) -> str:
        """Apply small batches optimization for decode."""
        # Real implementation would optimize for small batches
        # Example implementation just adds a comment
        if "// SMALL_BATCHES" not in shader_code:
            shader_code = "// SMALL_BATCHES optimization applied\n" + shader_code
        
        return shader_code
    
    def _apply_minimal_batch_optimization(self, shader_code: str) -> str:
        """Apply minimal batch optimization for decode."""
        # Real implementation would optimize for minimal batches
        # Example implementation just adds a comment
        if "// MINIMAL_BATCH" not in shader_code:
            shader_code = "// MINIMAL_BATCH optimization applied\n" + shader_code
        
        return shader_code
    
    def _apply_loop_unrolling(self, shader_code: str) -> str:
        """Apply loop unrolling optimization."""
        # Real implementation would unroll loops
        # Example implementation just adds a comment
        if "// LOOP_UNROLLING" not in shader_code:
            shader_code = "// LOOP_UNROLLING optimization applied\n" + shader_code
        
        return shader_code
    
    def _set_workgroup_size(self, shader_code: str, workgroup_size: Tuple[int, int, int]) -> str:
        """Set workgroup size in shader code."""
        # Find and replace workgroup size declaration
        import re
        
        # Pattern to match workgroup_size declaration
        pattern = r'@workgroup_size\s*\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)'
        
        # Create replacement with new workgroup size
        replacement = f'@workgroup_size({workgroup_size[0]}, {workgroup_size[1]}, {workgroup_size[2]})'
        
        # Check if the pattern exists in the shader code
        if re.search(pattern, shader_code):
            # Replace existing workgroup size declaration
            modified_code = re.sub(pattern, replacement, shader_code)
        else:
            # If no workgroup size declaration found, find compute shader entry point and add it
            compute_pattern = r'@compute\s+fn\s+(\w+)'
            match = re.search(compute_pattern, shader_code)
            
            if match:
                compute_line = match.group(0)
                modified_code = shader_code.replace(
                    compute_line,
                    f'@compute {replacement}\nfn {match.group(1)}'
                )
            else:
                # If no compute shader entry point found, just return original code
                modified_code = shader_code
        
        return modified_code


class TokenBufferManager:
    """
    Manages token buffers for optimal streaming performance and latency.
    
    This class provides advanced token buffer management for streaming inference,
    optimizing buffer sizes and delivery timing for minimal latency.
    """
    
    def __init__(self, buffer_size: int = 1, adaptive: bool = True):
        """
        Initialize the token buffer manager.
        
        Args:
            buffer_size: Initial token buffer size (smaller = lower latency)
            adaptive: Whether to adaptively adjust buffer size based on performance
        """
        self.buffer_size = buffer_size
        self.adaptive = adaptive
        self.tokens = []
        self.last_flush_time = time.time()
        self.timing_history = []
        self.generation_times = []
        self.network_latencies = []
        self.tokens_delivered = 0
        self.tokens_generated = 0
        
        logger.info(f"Initialized token buffer with size {buffer_size}, adaptive={adaptive}")
    
    def add_token(self, token: str) -> List[str]:
        """
        Add a token to the buffer and return tokens to deliver if buffer is full.
        
        Args:
            token: New token to add to the buffer
            
        Returns:
            List of tokens to deliver (empty if buffer not full)
        """
        self.tokens.append(token)
        self.tokens_generated += 1
        
        # Record generation time
        current_time = time.time()
        if self.tokens_generated > 1:
            generation_time = current_time - self.last_flush_time
            self.generation_times.append(generation_time)
        
        # Check if buffer is full
        if len(self.tokens) >= self.buffer_size:
            return self.flush()
        
        return []
    
    def flush(self) -> List[str]:
        """
        Flush the current buffer and return all tokens.
        
        Returns:
            List of tokens in the buffer
        """
        tokens_to_deliver = self.tokens.copy()
        self.tokens = []
        self.tokens_delivered += len(tokens_to_deliver)
        
        # Record flush time for timing
        current_time = time.time()
        flush_time = current_time - self.last_flush_time
        self.last_flush_time = current_time
        
        # Record timing
        self.timing_history.append({
            "tokens_count": len(tokens_to_deliver),
            "flush_time_ms": flush_time * 1000,
            "tokens_per_second": len(tokens_to_deliver) / flush_time if flush_time > 0 else 0,
            "generated": self.tokens_generated,
            "delivered": self.tokens_delivered
        })
        
        # Adjust buffer size if adaptive
        if self.adaptive and len(self.timing_history) >= 3:
            self._adjust_buffer_size()
        
        return tokens_to_deliver
    
    def record_network_latency(self, latency_ms: float):
        """
        Record network latency for a token delivery.
        
        Args:
            latency_ms: Network latency in milliseconds
        """
        self.network_latencies.append(latency_ms)
        
        # Adjust buffer size based on network latency if adaptive
        if self.adaptive and len(self.network_latencies) >= 3:
            self._adjust_for_network_latency()
    
    def _adjust_buffer_size(self):
        """Adjust buffer size based on token generation timing."""
        # Calculate recent average generation time
        recent_times = self.generation_times[-5:] if len(self.generation_times) >= 5 else self.generation_times
        avg_gen_time = sum(recent_times) / len(recent_times)
        
        # Check if we're generating tokens faster than we can deliver them
        if len(self.timing_history) >= 3:
            # Calculate average flush time (time between deliveries)
            recent_flushes = self.timing_history[-3:]
            avg_flush_time = sum(item["flush_time_ms"] for item in recent_flushes) / (3 * 1000)  # Convert to seconds
            
            # If generation is much faster than delivery, increase buffer
            if avg_gen_time < avg_flush_time * 0.5 and self.buffer_size < 8:
                self.buffer_size += 1
                logger.debug(f"Increased buffer size to {self.buffer_size} (gen time: {avg_gen_time:.4f}s, flush time: {avg_flush_time:.4f}s)")
            # If generation is slow, decrease buffer for lower latency
            elif avg_gen_time > avg_flush_time * 1.5 and self.buffer_size > 1:
                self.buffer_size -= 1
                logger.debug(f"Decreased buffer size to {self.buffer_size} (gen time: {avg_gen_time:.4f}s, flush time: {avg_flush_time:.4f}s)")
    
    def _adjust_for_network_latency(self):
        """Adjust buffer size based on network latency."""
        # Calculate recent average network latency
        recent_latencies = self.network_latencies[-5:] if len(self.network_latencies) >= 5 else self.network_latencies
        avg_latency_ms = sum(recent_latencies) / len(recent_latencies)
        
        # If network latency is high, increase buffer size to reduce overhead
        if avg_latency_ms > 50 and self.buffer_size < 8:
            self.buffer_size += 1
            logger.debug(f"Increased buffer size to {self.buffer_size} due to high network latency ({avg_latency_ms:.2f}ms)")
        # If network is very responsive, decrease buffer size for lower latency
        elif avg_latency_ms < 10 and self.buffer_size > 1:
            self.buffer_size -= 1
            logger.debug(f"Decreased buffer size to {self.buffer_size} due to low network latency ({avg_latency_ms:.2f}ms)")
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get buffer performance metrics.
        
        Returns:
            Dictionary of performance metrics
        """
        avg_gen_time = 0
        if self.generation_times:
            avg_gen_time = sum(self.generation_times) / len(self.generation_times)
        
        avg_network_latency = 0
        if self.network_latencies:
            avg_network_latency = sum(self.network_latencies) / len(self.network_latencies)
        
        return {
            "current_buffer_size": self.buffer_size,
            "tokens_generated": self.tokens_generated,
            "tokens_delivered": self.tokens_delivered,
            "avg_token_generation_time_sec": avg_gen_time,
            "avg_network_latency_ms": avg_network_latency,
            "buffer_adjustments": len(self.timing_history),
            "estimated_end_to_end_latency_ms": (avg_gen_time * 1000) + avg_network_latency
        }


class PrefillDecodeOptimizer:
    """
    Optimizes the transition between prefill and decode phases for minimal latency.
    
    This class provides specialized optimizations for the prefill/decode phase transition,
    reducing latency between completing prefill and starting token generation.
    """
    
    def __init__(self, prefill_strategy: str = "parallel", decode_strategy: str = "eager"):
        """
        Initialize the prefill/decode optimizer.
        
        Args:
            prefill_strategy: Strategy for prefill optimization (parallel, chunked, tensor_parallel)
            decode_strategy: Strategy for decode optimization (eager, cached, fused)
        """
        self.prefill_strategy = prefill_strategy
        self.decode_strategy = decode_strategy
        self.prefill_stats = []
        self.decode_stats = []
        self.transition_times = []
        
        logger.info(f"Initialized prefill/decode optimizer with strategies: prefill={prefill_strategy}, decode={decode_strategy}")
    
    def optimize_prefill(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Optimize configuration for prefill phase.
        
        Args:
            config: Configuration dictionary
            
        Returns:
            Optimized configuration for prefill phase
        """
        # Create a new configuration optimized for prefill
        prefill_config = config.copy()
        
        # Apply strategy-specific optimizations
        if self.prefill_strategy == "parallel":
            # Optimize for parallel processing of prefill
            prefill_config["parallel_attention"] = True
            prefill_config["batch_size"] = 1  # Single batch for fastest processing
            prefill_config["max_parallel_tokens"] = 32  # Process multiple tokens in parallel
            
            # Set workgroup size for prefill if browser optimizer provided it
            if "prefill_workgroup_size" in config:
                prefill_config["workgroup_size"] = config["prefill_workgroup_size"]
            
        elif self.prefill_strategy == "chunked":
            # Optimize by processing prompt in chunks
            prefill_config["chunk_size"] = 32
            prefill_config["adaptive_chunking"] = True
            prefill_config["overlap_chunks"] = True
            
        elif self.prefill_strategy == "tensor_parallel":
            # Optimize with tensor parallelism
            prefill_config["tensor_parallel"] = True
            prefill_config["tp_degree"] = 4  # Use 4-way tensor parallelism
            prefill_config["reduce_scatter"] = True
        
        # Settings common to all strategies
        prefill_config["compute_mode"] = "prefill"
        prefill_config["optimize_memory"] = True
        prefill_config["prefill_optimized"] = True
        
        return prefill_config
    
    def optimize_decode(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Optimize configuration for decode phase.
        
        Args:
            config: Configuration dictionary
            
        Returns:
            Optimized configuration for decode phase
        """
        # Create a new configuration optimized for decode
        decode_config = config.copy()
        
        # Apply strategy-specific optimizations
        if self.decode_strategy == "eager":
            # Optimize for eager execution of decoding
            decode_config["eager_execution"] = True
            decode_config["pipeline_execution"] = False
            decode_config["decode_max_batch_size"] = 1  # Start with minimal batch size for lowest latency
            
            # Set workgroup size for decode if browser optimizer provided it
            if "decode_workgroup_size" in config:
                decode_config["workgroup_size"] = config["decode_workgroup_size"]
            
        elif self.decode_strategy == "cached":
            # Optimize with aggressive caching of intermediate results
            decode_config["cache_attention_weights"] = True
            decode_config["cache_intermediate_results"] = True
            decode_config["reuse_attention_weights"] = True
            
        elif self.decode_strategy == "fused":
            # Optimize with kernel fusion
            decode_config["fuse_attention_layers"] = True
            decode_config["fuse_ffn_layers"] = True
            decode_config["fuse_softmax_operations"] = True
        
        # Settings common to all strategies
        decode_config["compute_mode"] = "decode"
        decode_config["optimize_for_latency"] = True
        decode_config["decode_optimized"] = True
        
        return decode_config
    
    def optimize_transition(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Optimize the full configuration for both prefill and decode phases.
        
        Args:
            config: Base configuration dictionary
            
        Returns:
            Optimized configuration with prefill and decode settings
        """
        # Start with the base config
        optimized_config = config.copy()
        
        # Get prefill and decode optimized configs
        prefill_config = self.optimize_prefill(config)
        decode_config = self.optimize_decode(config)
        
        # Merge the configurations
        optimized_config["prefill"] = {
            key: value for key, value in prefill_config.items()
            if key not in optimized_config or prefill_config[key] != optimized_config[key]
        }
        
        optimized_config["decode"] = {
            key: value for key, value in decode_config.items()
            if key not in optimized_config or decode_config[key] != optimized_config[key]
        }
        
        # Add transition optimization flags
        optimized_config["optimize_transition"] = True
        optimized_config["transition_strategy"] = "early_start"
        optimized_config["pipelined_transition"] = True
        
        # These settings apply to both phases
        optimized_config["latency_optimized"] = True
        optimized_config["prefill_optimized"] = True
        optimized_config["decode_optimized"] = True
        
        return optimized_config
    
    def record_prefill_time(self, time_ms: float, tokens_processed: int):
        """
        Record prefill phase execution time for analysis.
        
        Args:
            time_ms: Time taken for prefill in milliseconds
            tokens_processed: Number of tokens processed in prefill
        """
        self.prefill_stats.append({
            "time_ms": time_ms,
            "tokens": tokens_processed,
            "tokens_per_second": (tokens_processed / (time_ms / 1000)) if time_ms > 0 else 0,
            "timestamp": time.time()
        })
    
    def record_decode_start(self, time_ms: float, batch_size: int):
        """
        Record decode phase start time for analysis.
        
        Args:
            time_ms: Time taken for first decode step in milliseconds
            batch_size: Batch size used for decoding
        """
        self.decode_stats.append({
            "time_ms": time_ms,
            "batch_size": batch_size,
            "timestamp": time.time()
        })
        
        # Calculate transition time if we have prefill and decode stats
        if self.prefill_stats and self.decode_stats:
            last_prefill = self.prefill_stats[-1]
            last_decode = self.decode_stats[-1]
            
            # Make sure these are from the same generation session
            if abs(last_prefill["timestamp"] - last_decode["timestamp"]) < 10:  # Within 10 seconds
                transition_time = (last_decode["timestamp"] - last_prefill["timestamp"]) * 1000  # ms
                self.transition_times.append(transition_time)
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get optimizer performance metrics.
        
        Returns:
            Dictionary of performance metrics
        """
        avg_prefill_time = 0
        if self.prefill_stats:
            avg_prefill_time = sum(stat["time_ms"] for stat in self.prefill_stats) / len(self.prefill_stats)
        
        avg_decode_time = 0
        if self.decode_stats:
            avg_decode_time = sum(stat["time_ms"] for stat in self.decode_stats) / len(self.decode_stats)
        
        avg_transition_time = 0
        if self.transition_times:
            avg_transition_time = sum(self.transition_times) / len(self.transition_times)
        
        return {
            "prefill_strategy": self.prefill_strategy,
            "decode_strategy": self.decode_strategy,
            "avg_prefill_time_ms": avg_prefill_time,
            "avg_first_decode_time_ms": avg_decode_time,
            "avg_transition_time_ms": avg_transition_time,
            "prefill_count": len(self.prefill_stats),
            "decode_count": len(self.decode_stats),
            "transition_efficiency": 1.0 if avg_prefill_time == 0 else (avg_decode_time / avg_prefill_time)
        }


def optimize_for_low_latency(
    config: Dict[str, Any],
    browser: str = None,
    device_profile: str = None
) -> Dict[str, Any]:
    """
    Optimize a configuration for low latency inference.
    
    This function applies comprehensive low-latency optimizations to a configuration,
    including browser-specific, token buffer, and prefill/decode optimizations.
    
    Args:
        config: Base configuration dictionary
        browser: Browser name (chrome, edge, firefox, safari) or None for auto-detection
        device_profile: Device profile (high_end, mid_range, integrated, mobile) or None for auto-detection
        
    Returns:
        Optimized configuration dictionary
    """
    # Create a copy of the config to avoid modifying the original
    optimized_config = config.copy()
    
    # Mark as latency optimized
    optimized_config["latency_optimized"] = True
    
    # Create browser optimizer and apply optimizations
    browser_optimizer = BrowserLatencyOptimizer(browser, device_profile)
    optimized_config = browser_optimizer.optimize_for_low_latency(optimized_config)
    
    # Create prefill/decode optimizer and apply optimizations
    prefill_decode_optimizer = PrefillDecodeOptimizer()
    optimized_config = prefill_decode_optimizer.optimize_transition(optimized_config)
    
    # Set token buffer size for minimal latency
    optimized_config["stream_buffer_size"] = 1  # Smallest buffer for lowest latency
    
    # Additional general low-latency optimizations
    optimized_config["prefill_optimized"] = True
    optimized_config["ultra_low_latency"] = True
    optimized_config["token_streaming"] = True
    optimized_config["use_async_execution"] = True
    optimized_config["prioritize_first_token"] = True
    
    # Add reference to optimizers for later use
    optimized_config["_browser_optimizer"] = browser_optimizer
    optimized_config["_prefill_decode_optimizer"] = prefill_decode_optimizer
    
    logger.info(f"Applied low-latency optimizations for {browser_optimizer.browser} browser on {browser_optimizer.device_profile} device")
    return optimized_config


if __name__ == "__main__":
    # Example usage
    config = {
        "quantization": "int4",
        "latency_optimized": True,
        "max_batch_size": 8
    }
    
    # Apply low-latency optimizations
    optimized_config = optimize_for_low_latency(
        config,
        browser="chrome",
        device_profile="high_end"
    )
    
    # Print results
    print("Base configuration:")
    print(json.dumps(config, indent=2))
    
    print("\nOptimized configuration:")
    # Remove optimizer objects since they're not JSON serializable
    display_config = {k: v for k, v in optimized_config.items() if not k.startswith("_")}
    print(json.dumps(display_config, indent=2))