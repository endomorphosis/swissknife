#!/usr/bin/env python3
"""
WebGPU Streaming Inference Pipeline - August 2025

This module implements a streaming inference pipeline for WebGPU-accelerated models,
enabling token-by-token generation with optimized latency and adaptive batch sizing.

Key features:
- WebSocket integration for real-time streaming responses
- Token-by-token generation with optimized KV-cache management
- Adaptive batch sizing based on device capabilities
- Low-latency optimization for interactive applications
- Memory-efficient streaming for large language models
- Prefill optimization for faster initial response

Usage:
    from fixed_web_platform.webgpu_streaming_inference import (
        WebGPUStreamingInference,
        create_streaming_endpoint,
        optimize_for_streaming
    )
    
    # Create streaming inference handler
    streaming_handler = WebGPUStreamingInference(
        model_path="models/llama-7b",
        config={
            "quantization": "int4",
            "optimize_kv_cache": True,
            "latency_optimized": True,
            "adaptive_batch_size": True
        }
    )
    
    # Start streaming inference with callback
    def token_callback(token, is_last=False):
        print(token, end="", flush=True)
        if is_last:
            print("\nGeneration complete!")
    
    streaming_handler.generate(
        "Explain the concept of streaming inference",
        max_tokens=100,
        temperature=0.7,
        callback=token_callback
    )
"""

import os
import sys
import json
import time
import asyncio
import logging
import threading
import traceback
import math
import websockets
import numpy as np
from typing import Dict, List, Any, Optional, Union, Callable, Tuple, Generator, AsyncGenerator

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class WebGPUStreamingInference:
    """
    Implements streaming inference for WebGPU-accelerated language models.
    """
    
    def __init__(self, model_path: str, config: Dict[str, Any] = None):
        """
        Initialize the streaming inference handler.
        
        Args:
            model_path: Path to the model
            config: Configuration dictionary with the following options:
                - quantization: Quantization format (int4, int8, fp16)
                - optimize_kv_cache: Whether to use memory-efficient KV cache
                - latency_optimized: Whether to optimize for low latency
                - adaptive_batch_size: Whether to use adaptive batch sizing
                - max_batch_size: Maximum batch size to use
                - prefill_optimized: Whether to optimize the prefill phase
                - stream_buffer_size: Size of the streaming buffer
        """
        self.model_path = model_path
        self.config = config or {}
        
        # Set default configuration values
        self.config.setdefault("quantization", "int4")  # Default to 4-bit
        self.config.setdefault("optimize_kv_cache", True)
        self.config.setdefault("latency_optimized", True)
        self.config.setdefault("adaptive_batch_size", True)
        self.config.setdefault("max_batch_size", 8)
        self.config.setdefault("prefill_optimized", True)
        self.config.setdefault("stream_buffer_size", 3)
        
        # Verify WebGPU availability
        self._webgpu_available = self._check_webgpu_available()
        if not self._webgpu_available and not os.environ.get("WEBGPU_SIMULATION", "0") == "1":
            raise RuntimeError("WebGPU is not available. Set WEBGPU_SIMULATION=1 for simulation mode.")
        
        # Set up WebGPU resources
        self._initialize_webgpu()
        
        # State variables for streaming
        self._current_stream = None
        self._is_generating = False
        self._tokens_generated = 0
        self._generation_start_time = 0
        
        logger.info(f"WebGPU Streaming Inference initialized with {self.config['quantization']} quantization")
    
    def _check_webgpu_available(self) -> bool:
        """
        Check if WebGPU is available.
        
        Returns:
            Boolean indicating WebGPU availability
        """
        # In a browser environment, this would check for navigator.gpu
        # Here we use environment variables for simulation
        if os.environ.get("WEBGPU_AVAILABLE", "0") == "1":
            return True
        
        if os.environ.get("WEBGPU_SIMULATION", "0") == "1":
            logger.info("Using WebGPU simulation mode")
            return True
        
        return False
    
    def _initialize_webgpu(self):
        """
        Initialize WebGPU resources for streaming inference with memory management.
        
        This enhanced implementation includes:
        1. WebGPU device and adapter setup
        2. Compute pipelines for optimized inference 
        3. Ultra-low precision KV cache initialization (2-bit, 3-bit, 4-bit options)
        4. Memory pressure monitoring and adaptation
        5. Adaptive batch sizing based on hardware capabilities
        6. Support for extremely long context windows
        """
        # In a real implementation, this would:
        # 1. Set up WebGPU device and adapter
        # 2. Create compute pipelines for inference
        # 3. Set up buffers for input/output
        # 4. Initialize model weights on GPU
        
        # For simulation, we'll create enhanced placeholders
        self._device = {"type": "simulation", "features": ["streaming", "compute", "memory_monitoring"]}
        self._compute_pipeline = {
            "type": "simulation", 
            "optimized": self.config["latency_optimized"],
            "compute_shaders_enabled": os.environ.get("WEBGPU_COMPUTE_SHADERS_ENABLED", "0") == "1",
            "shader_precompilation": os.environ.get("WEBGPU_SHADER_PRECOMPILE_ENABLED", "0") == "1"
        }
        
        # Initialize memory pressure handling system
        self._memory_monitor = {
            "enabled": True,
            "memory_limit_mb": self.config.get("memory_limit_mb", 4096),  # 4GB default
            "warning_threshold": 0.80,  # 80% memory usage triggers warning
            "critical_threshold": 0.90,  # 90% memory usage triggers action
            "last_check_time": time.time(),
            "check_frequency_ms": 500,  # Check every 500ms
            "memory_pressure_detected": False,
            "memory_pressure_actions": ["reduce_batch_size", "prune_kv_cache", "reduce_precision"],
            "current_action_index": 0,
            "last_action_time": 0
        }
        
        # Set up memory metrics tracking
        self._memory_metrics = {
            "total_gpu_memory_mb": self._memory_monitor["memory_limit_mb"],
            "peak_memory_usage_mb": 0,
            "current_memory_usage_mb": 0,
            "model_memory_mb": 0,
            "kv_cache_memory_mb": 0,
            "other_memory_mb": 0,
            "memory_pressure_events": 0,
            "memory_pressure_actions_taken": 0,
            "memory_pressure_timeline": []
        }
        
        # Initialize ultra-low precision KV cache if enabled
        model_name = os.path.basename(self.model_path)
        precision_bits = self._get_precision_bits()
        
        try:
            # Import the KV cache module
            from fixed_web_platform.webgpu_kv_cache_optimization import create_optimized_kv_cache
            
            # Determine model config based on model name
            if "llama" in model_name.lower():
                num_heads = 32
                head_dim = 128
            elif "7b" in model_name.lower():
                num_heads = 32
                head_dim = 128
            elif "13b" in model_name.lower():
                num_heads = 40
                head_dim = 128
            elif "70b" in model_name.lower() or "65b" in model_name.lower():
                num_heads = 64
                head_dim = 128
            elif "mistral" in model_name.lower():
                num_heads = 32
                head_dim = 128
            elif "mixtral" in model_name.lower():
                num_heads = 32
                head_dim = 128
            elif "gemma" in model_name.lower() and "2b" in model_name.lower():
                num_heads = 16
                head_dim = 128
            elif "phi-2" in model_name.lower():
                num_heads = 32
                head_dim = 80
            else:
                # Default configuration for unknown models
                num_heads = 16
                head_dim = 64
            
            # Estimate model size for memory tracking (rough estimate)
            model_param_count = 0
            if "7b" in model_name.lower():
                model_param_count = 7 * (10**9)
            elif "13b" in model_name.lower():
                model_param_count = 13 * (10**9)
            elif "70b" in model_name.lower():
                model_param_count = 70 * (10**9)
            elif "mixtral" in model_name.lower():
                model_param_count = 47 * (10**9)  # 7B * 8 experts, but with MoE architecture
            elif "2b" in model_name.lower():
                model_param_count = 2 * (10**9)
            else:
                # Estimate based on heads and dimensions
                model_param_count = num_heads * head_dim * 10**7
            
            # Estimate model memory usage based on quantization
            model_bytes_per_param = {
                "int2": 0.25,  # 2-bit
                "int3": 0.375,  # 3-bit
                "int4": 0.5,   # 4-bit
                "int8": 1.0,   # 8-bit
                "fp16": 2.0,   # 16-bit
                "fp32": 4.0    # 32-bit
            }
            
            bytes_per_param = model_bytes_per_param.get(self.config["quantization"], 2.0)
            self._memory_metrics["model_memory_mb"] = (model_param_count * bytes_per_param) / (1024 * 1024)
            
            # Update current memory usage with model size
            self._memory_metrics["current_memory_usage_mb"] = self._memory_metrics["model_memory_mb"]
            self._memory_metrics["peak_memory_usage_mb"] = self._memory_metrics["current_memory_usage_mb"]
            
            # Calculate maximum sequence length based on available memory
            # First allocate 80% of memory for the model, then use the rest for KV cache
            available_kv_cache_mb = max(
                0, 
                self._memory_monitor["memory_limit_mb"] * 0.8 - self._memory_metrics["model_memory_mb"]
            )
            
            # Calculate memory per token for KV cache
            kv_bytes_per_token = 2 * num_heads * head_dim * (precision_bits / 8)  # K + V
            max_tokens_in_memory = int((available_kv_cache_mb * 1024 * 1024) / kv_bytes_per_token)
            
            # Calculate maximum dynamic max_seq_len based on memory
            # But don't go beyond 128K tokens (practical limit for most use cases)
            max_seq_len = min(max_tokens_in_memory, 131072)  # 128K max
            
            # Use a reasonable minimum sequence length regardless of calculation
            max_seq_len = max(max_seq_len, 4096)  # At least 4K
            
            logger.info(f"Memory-based max sequence length: {max_seq_len} tokens")
            logger.info(f"Model memory usage: {self._memory_metrics['model_memory_mb']:.2f}MB")
            
            # Create optimized KV cache with memory-aware size
            self._kv_cache = create_optimized_kv_cache(
                batch_size=1,  # Start with batch size 1 for streaming
                num_heads=num_heads,
                head_dim=head_dim,
                max_seq_len=max_seq_len,  # Memory-aware size
                bits=precision_bits,
                group_size=64  # Good balance for most models
            )
            
            # Store KV cache memory metrics
            self._memory_metrics["kv_cache_memory_mb"] = (
                self._kv_cache.get("quantized_size_bytes", 0) / (1024 * 1024)
            )
            
            # Update current memory usage
            self._memory_metrics["current_memory_usage_mb"] += self._memory_metrics["kv_cache_memory_mb"]
            self._memory_metrics["peak_memory_usage_mb"] = max(
                self._memory_metrics["peak_memory_usage_mb"],
                self._memory_metrics["current_memory_usage_mb"]
            )
            
            # Log initialization success
            logger.info(f"Initialized ultra-low precision {precision_bits}-bit KV cache with "
                       f"{self._kv_cache['memory_reduction_percent']:.1f}% memory reduction")
            logger.info(f"Enabled context length: {max_seq_len} tokens")
            logger.info(f"Current memory usage: {self._memory_metrics['current_memory_usage_mb']:.2f}MB")
            
        except (ImportError, Exception) as e:
            # Fallback to simple KV cache simulation
            logger.warning(f"Failed to initialize optimized KV cache: {e}")
            self._kv_cache = {"type": "simulation", "optimized": self.config["optimize_kv_cache"]}
            self._memory_metrics["kv_cache_memory_mb"] = 100  # Placeholder
            self._memory_metrics["current_memory_usage_mb"] += self._memory_metrics["kv_cache_memory_mb"]
        
        # Load model weights (simulated)
        logger.info(f"Loading model: {model_name}")
        self._model = {
            "name": model_name,
            "type": "language_model",
            "quantization": self.config["quantization"],
            "loaded": True,
            "num_heads": num_heads if 'num_heads' in locals() else 32,
            "head_dim": head_dim if 'head_dim' in locals() else 128,
            "param_count": model_param_count if 'model_param_count' in locals() else 7 * (10**9),
            "memory_usage_mb": self._memory_metrics["model_memory_mb"]
        }
        
        # Set up streaming buffers
        self._token_buffer = []
        self._buffer_size = self.config["stream_buffer_size"]
        
        # Initialize token generation statistics tracking
        self._token_generation_stats = {
            "tokens_total": 0,
            "batch_sizes": [],
            "latencies_ms": [],
            "throughputs": [],
            "memory_pressure_events": 0
        }
        
        # Initialize memory usage tracker for dynamic growth
        self._memory_usage_tracker = [self._memory_metrics["current_memory_usage_mb"]]
        
        # Adaptive batch size settings with memory awareness
        if self.config["adaptive_batch_size"]:
            # Start with a conservative batch size and adapt based on performance and memory
            self._current_batch_size = 1
            self._batch_size_history = []
            self._perf_measurements = []
            
            # Maximum batch size based on available memory
            # This is dynamically determined based on model size and available memory
            memory_based_max_batch = max(1, int(
                (self._memory_monitor["memory_limit_mb"] * 0.15) / 
                (self._memory_metrics["model_memory_mb"] * 0.1)  # Estimate 10% of model size per batch increase
            ))
            
            # Cap at config max and hardware practical limit
            self._memory_aware_max_batch_size = min(
                self.config["max_batch_size"],  # Config limit
                memory_based_max_batch,         # Memory-based limit
                16                              # Practical limit for most hardware
            )
            
            logger.info(f"Memory-aware maximum batch size: {self._memory_aware_max_batch_size}")
        else:
            self._current_batch_size = self.config["max_batch_size"]
            self._memory_aware_max_batch_size = self._current_batch_size
        
        # Initialize memory pressure monitoring
        self._last_memory_check = time.time()
        self._memory_pressure_detected = False
        self._memory_reduction_actions_taken = []
        
        # Set up error handling callback functions
        self.on_error = None
        self.on_memory_pressure = None
        self.on_timeout = None
        self.on_connection_error = None
        
        # Set up WebGPU memory monitoring callback (simulated here)
        self._setup_memory_monitoring()
    
    def _setup_memory_monitoring(self):
        """
        Set up memory monitoring for WebGPU with pressure handling callbacks.
        
        In a real implementation, this would connect to the WebGPU memory events
        and set up callbacks for memory pressure warning/critical events.
        """
        # In a real implementation, this would:
        # 1. Set up WebGPU memory monitoring
        # 2. Register callbacks for memory pressure events
        # 3. Configure thresholds for different actions
        
        # For simulation, we'll create a simple monitoring structure
        self._memory_monitor_active = True
        
        # Memory pressure threshold callbacks
        def on_memory_warning():
            """Callback for memory warning threshold reached"""
            logger.warning(f"Memory usage warning: {self._memory_metrics['current_memory_usage_mb']:.2f}MB "
                         f"({self._memory_metrics['current_memory_usage_mb'] / self._memory_monitor['memory_limit_mb'] * 100:.1f}%)")
            
            # Track event
            self._memory_metrics["memory_pressure_events"] += 1
            self._token_generation_stats["memory_pressure_events"] += 1
            self._memory_pressure_detected = True
            
            # Log memory state
            memory_state = {
                "timestamp": time.time(),
                "level": "warning",
                "current_usage_mb": self._memory_metrics["current_memory_usage_mb"],
                "peak_usage_mb": self._memory_metrics["peak_memory_usage_mb"],
                "percent_used": self._memory_metrics["current_memory_usage_mb"] / self._memory_monitor["memory_limit_mb"] * 100,
                "tokens_generated": getattr(self, "_tokens_generated", 0)
            }
            self._memory_metrics["memory_pressure_timeline"].append(memory_state)
            
            # No action taken at warning level
            return True
        
        def on_memory_critical():
            """Callback for memory critical threshold reached"""
            logger.error(f"Memory usage critical: {self._memory_metrics['current_memory_usage_mb']:.2f}MB "
                       f"({self._memory_metrics['current_memory_usage_mb'] / self._memory_monitor['memory_limit_mb'] * 100:.1f}%)")
            
            # Take immediate action to reduce memory pressure
            self._handle_memory_pressure()
            
            # Track event
            self._memory_metrics["memory_pressure_events"] += 1
            self._memory_metrics["memory_pressure_actions_taken"] += 1
            self._token_generation_stats["memory_pressure_events"] += 1
            self._memory_pressure_detected = True
            
            # Log memory state
            memory_state = {
                "timestamp": time.time(),
                "level": "critical",
                "current_usage_mb": self._memory_metrics["current_memory_usage_mb"],
                "peak_usage_mb": self._memory_metrics["peak_memory_usage_mb"],
                "percent_used": self._memory_metrics["current_memory_usage_mb"] / self._memory_monitor["memory_limit_mb"] * 100,
                "tokens_generated": getattr(self, "_tokens_generated", 0),
                "action_taken": self._memory_reduction_actions_taken[-1] if self._memory_reduction_actions_taken else None
            }
            self._memory_metrics["memory_pressure_timeline"].append(memory_state)
            
            return True
        
        # Store callbacks
        self._memory_monitor["on_warning"] = on_memory_warning
        self._memory_monitor["on_critical"] = on_memory_critical
        
        logger.info(f"Memory monitoring initialized with {self._memory_monitor['memory_limit_mb']}MB limit")
        logger.info(f"Warning threshold: {self._memory_monitor['warning_threshold'] * 100}%")
        logger.info(f"Critical threshold: {self._memory_monitor['critical_threshold'] * 100}%")
    
    def _check_memory_pressure(self):
        """
        Check for memory pressure and trigger appropriate callbacks.
        
        In a real implementation, this would connect to the WebGPU memory API
        to get actual memory usage statistics.
        
        Returns:
            Boolean indicating if memory pressure was detected
        """
        # Skip if not enough time has passed since the last check
        current_time = time.time()
        if (current_time - self._last_memory_check) * 1000 < self._memory_monitor["check_frequency_ms"]:
            return self._memory_pressure_detected
        
        # Update last check time
        self._last_memory_check = current_time
        
        # Calculate current memory percentage
        current_percentage = (self._memory_metrics["current_memory_usage_mb"] / 
                             self._memory_monitor["memory_limit_mb"])
        
        # Check against thresholds
        if current_percentage >= self._memory_monitor["critical_threshold"]:
            # Critical threshold reached
            if self._memory_monitor["on_critical"]:
                self._memory_monitor["on_critical"]()
            return True
        elif current_percentage >= self._memory_monitor["warning_threshold"]:
            # Warning threshold reached
            if self._memory_monitor["on_warning"]:
                self._memory_monitor["on_warning"]()
            return True
        
        # Reset memory pressure flag if we've dropped below thresholds
        self._memory_pressure_detected = False
        return False
    
    def _handle_memory_pressure(self):
        """
        Handle memory pressure by taking actions to reduce memory usage.
        
        Actions are taken in sequence from least to most impactful:
        1. Reduce batch size
        2. Prune KV cache
        3. Reduce precision (as a last resort)
        
        Returns:
            Action taken to reduce memory pressure
        """
        # Check if we should use external handler
        if self.on_memory_pressure is not None:
            try:
                # Try using external handler first
                external_handled = self.on_memory_pressure()
                if external_handled:
                    logger.info("Memory pressure handled by external handler")
                    return "external_handler"
            except Exception as e:
                logger.warning(f"External memory pressure handler failed: {e}")
        
        # Select next action based on current action index
        action_index = self._memory_monitor["current_action_index"]
        available_actions = self._memory_monitor["memory_pressure_actions"]
        
        if action_index >= len(available_actions):
            # Reset to first action if we've tried all of them
            action_index = 0
        
        action = available_actions[action_index]
        logger.info(f"Taking memory pressure action: {action}")
        
        # Increment for next time
        self._memory_monitor["current_action_index"] = (action_index + 1) % len(available_actions)
        self._memory_monitor["last_action_time"] = time.time()
        
        # Perform the selected action
        if action == "reduce_batch_size" and self._current_batch_size > 1:
            # Action 1: Reduce batch size
            old_batch_size = self._current_batch_size
            self._current_batch_size = max(1, self._current_batch_size // 2)
            
            logger.info(f"Reduced batch size from {old_batch_size} to {self._current_batch_size} due to memory pressure")
            self._memory_reduction_actions_taken.append({
                "action": "reduce_batch_size",
                "from": old_batch_size,
                "to": self._current_batch_size,
                "tokens_generated": getattr(self, "_tokens_generated", 0),
                "time": time.time()
            })
            
            return "reduce_batch_size"
            
        elif action == "prune_kv_cache" and isinstance(self._kv_cache, dict) and "memory_reduction_percent" in self._kv_cache:
            # Action 2: Prune KV cache
            try:
                # Import KV cache manager functions
                from fixed_web_platform.webgpu_kv_cache_optimization import WebGPUKVCacheManager
                
                # For simulation, we'll just reduce the estimated memory
                old_kv_cache_memory = self._memory_metrics["kv_cache_memory_mb"]
                
                # Simulate 50% reduction in KV cache size
                self._memory_metrics["kv_cache_memory_mb"] *= 0.5
                
                # Update total memory usage
                self._memory_metrics["current_memory_usage_mb"] -= (old_kv_cache_memory - self._memory_metrics["kv_cache_memory_mb"])
                
                logger.info(f"Pruned KV cache from {old_kv_cache_memory:.2f}MB to "
                          f"{self._memory_metrics['kv_cache_memory_mb']:.2f}MB due to memory pressure")
                
                self._memory_reduction_actions_taken.append({
                    "action": "prune_kv_cache",
                    "from_mb": old_kv_cache_memory,
                    "to_mb": self._memory_metrics["kv_cache_memory_mb"],
                    "tokens_generated": getattr(self, "_tokens_generated", 0),
                    "time": time.time()
                })
                
                return "prune_kv_cache"
                
            except (ImportError, Exception) as e:
                logger.warning(f"Failed to prune KV cache: {e}")
                # Move to the next action
                self._memory_monitor["current_action_index"] = (action_index + 1) % len(available_actions)
                return self._handle_memory_pressure()  # Try the next action
                
        elif action == "reduce_precision" and self.config["quantization"] in ["int4", "int3"]:
            # Action 3: Reduce precision (last resort)
            old_quantization = self.config["quantization"]
            old_bits = self._get_precision_bits()
            
            if old_quantization == "int4":
                # Reduce from 4-bit to 3-bit
                self.config["quantization"] = "int3"
                new_bits = 3
            elif old_quantization == "int3":
                # Reduce from 3-bit to 2-bit
                self.config["quantization"] = "int2"
                new_bits = 2
            else:
                # Can't reduce further
                logger.warning(f"Cannot reduce precision below {old_quantization}")
                # Move to the next action
                self._memory_monitor["current_action_index"] = (action_index + 1) % len(available_actions)
                return self._handle_memory_pressure()  # Try the next action
            
            # Reinitialize KV cache with new precision
            try:
                # Import KV cache creation function
                from fixed_web_platform.webgpu_kv_cache_optimization import create_optimized_kv_cache
                
                # Get model dimensions
                num_heads = self._model.get("num_heads", 32)
                head_dim = self._model.get("head_dim", 128)
                
                # Remember the current sequence length position
                current_length = self._kv_cache.get("current_len", 0)
                
                # Create new KV cache with lower precision
                old_kv_cache_memory = self._memory_metrics["kv_cache_memory_mb"]
                
                self._kv_cache = create_optimized_kv_cache(
                    batch_size=1,
                    num_heads=num_heads,
                    head_dim=head_dim,
                    max_seq_len=self._kv_cache.get("max_seq_len", 16384),
                    bits=new_bits,
                    group_size=64
                )
                
                # Update memory usage metrics
                self._memory_metrics["kv_cache_memory_mb"] = (
                    self._kv_cache.get("quantized_size_bytes", 0) / (1024 * 1024)
                )
                
                # Update total memory usage
                self._memory_metrics["current_memory_usage_mb"] = (
                    self._memory_metrics["current_memory_usage_mb"] - old_kv_cache_memory + 
                    self._memory_metrics["kv_cache_memory_mb"]
                )
                
                logger.info(f"Reduced precision from {old_quantization} to {self.config['quantization']} "
                          f"({old_bits}-bit to {new_bits}-bit) due to memory pressure")
                logger.info(f"KV cache memory reduced from {old_kv_cache_memory:.2f}MB to "
                          f"{self._memory_metrics['kv_cache_memory_mb']:.2f}MB")
                
                self._memory_reduction_actions_taken.append({
                    "action": "reduce_precision",
                    "from": old_quantization,
                    "to": self.config["quantization"],
                    "from_bits": old_bits,
                    "to_bits": new_bits,
                    "tokens_generated": getattr(self, "_tokens_generated", 0),
                    "time": time.time()
                })
                
                return "reduce_precision"
                
            except (ImportError, Exception) as e:
                logger.warning(f"Failed to reduce precision: {e}")
                # Move to the next action
                self._memory_monitor["current_action_index"] = (action_index + 1) % len(available_actions)
                return self._handle_memory_pressure()  # Try the next action
        
        # If we reached here, the selected action was not applicable
        # Try the next one
        self._memory_monitor["current_action_index"] = (action_index + 1) % len(available_actions)
        
        # Skip recursive call if we've tried all actions
        if self._memory_reduction_actions_taken and len(self._memory_reduction_actions_taken) >= len(available_actions):
            logger.warning("All memory reduction actions attempted, but memory pressure persists")
            # Notify external error handler if available
            if self.on_error is not None:
                try:
                    self.on_error({
                        "type": "memory_pressure",
                        "message": "All memory reduction actions attempted, but memory pressure persists",
                        "component": "streaming", 
                        "recoverable": False,
                        "severity": "critical"
                    })
                except Exception as e:
                    logger.error(f"Error notifying error handler: {e}")
            return None
        
        return self._handle_memory_pressure()
            
    def _get_precision_bits(self):
        """Get precision bits based on configuration."""
        quantization = self.config["quantization"].lower()
        if quantization == "int2":
            return 2
        elif quantization == "int3":
            return 3
        elif quantization == "int4":
            return 4
        elif quantization == "int8":
            return 8
        else:
            # Default to 2-bit for ultra-low precision
            return 2
    
    def _prefill(self, prompt: str) -> Dict[str, Any]:
        """
        Run the prefill phase of generation.
        
        Args:
            prompt: The input prompt
            
        Returns:
            Dictionary with prefill results
        """
        logger.debug(f"Running prefill for prompt (length {len(prompt)})")
        
        # In a real implementation, this would:
        # 1. Tokenize the prompt
        # 2. Run the model's forward pass for all prompt tokens
        # 3. Set up the KV cache for subsequent token generation
        
        # For simulation, we'll create placeholder results
        tokens = [f"<token_{i}>" for i in range(len(prompt.split()))]
        
        # Simulate processing time
        if len(prompt) > 100:
            time.sleep(0.15)  # Longer prompts take more time
        else:
            time.sleep(0.05)
        
        return {
            "tokens": tokens,
            "kv_cache_state": {"initialized": True, "size": len(tokens)},
            "next_token_logits": [0.1] * 10,  # Placeholder
            "prefill_time_ms": 50 if self.config["prefill_optimized"] else 120
        }
    
    def _optimize_token_generation(self, model_id=None, input_tokens=None, generated_tokens=None, current_batch_size=1):
        """
        Optimize token generation with compute/transfer overlap.
        
        This implementation separates computation and transfer operations
        to allow them to proceed in parallel, reducing effective latency.
        
        Args:
            model_id: Identifier for the model
            input_tokens: List of input token IDs
            generated_tokens: List of already generated token IDs
            current_batch_size: Current batch size for generation
            
        Returns:
            Dictionary with optimization configuration
        """
        # Setup compute/transfer pipeline stages
        compute_stage = {
            "operation": "token_compute",
            "buffer_size": min(current_batch_size * 2, 8),  # Double buffering with cap
            "priority": "high",
            "dependencies": []
        }
        
        transfer_stage = {
            "operation": "token_transfer",
            "buffer_size": min(current_batch_size * 2, 8),
            "priority": "high",
            "dependencies": ["token_compute"]
        }
        
        # Configure pipeline based on browser type for optimal performance
        browser_info = {}
        if hasattr(self, "config") and "browser_info" in self.config:
            browser_info = self.config.get("browser_info", {})
        
        browser_name = browser_info.get("name", "unknown").lower()
        
        # Determine if this is first token generation
        is_first_generation = generated_tokens is None or len(generated_tokens) == 0
        
        if browser_name == "chrome" or browser_name == "edge":
            # Chrome/Edge optimization
            compute_stage["workgroup_size"] = (128, 1, 1)
            compute_stage["use_shared_memory"] = True
            transfer_stage["use_mapped_memory"] = True
        elif browser_name == "firefox":
            # Firefox optimization (256x1x1 workgroups perform better for audio models)
            compute_stage["workgroup_size"] = (256, 1, 1)
            compute_stage["use_shared_memory"] = True
            transfer_stage["use_mapped_memory"] = False
        elif browser_name == "safari":
            # Safari optimization (more conservative)
            compute_stage["workgroup_size"] = (64, 1, 1)
            compute_stage["use_shared_memory"] = False
            transfer_stage["use_mapped_memory"] = False
        else:
            # Default settings for unknown browsers
            compute_stage["workgroup_size"] = (128, 1, 1)
            compute_stage["use_shared_memory"] = True
            transfer_stage["use_mapped_memory"] = True
            
        # Set up prefetching based on generation state
        if is_first_generation:
            # First token, aggressive prefetch
            compute_stage["prefetch_size"] = 3
        else:
            # Adaptive prefetch based on recent history
            # In a real implementation, this would analyze token patterns
            # For simulation, we'll use a simple heuristic
            tokens_generated = len(generated_tokens) if generated_tokens else 0
            
            if tokens_generated < 5:
                # Early in generation, moderate prefetch
                compute_stage["prefetch_size"] = 2
            elif tokens_generated < 20:
                # Mid-generation, adaptive prefetch
                compute_stage["prefetch_size"] = 1
            else:
                # Later in generation, minimal prefetch
                compute_stage["prefetch_size"] = 1
        
        # Return optimization configuration
        return {
            "compute_stage": compute_stage,
            "transfer_stage": transfer_stage,
            "overlap_enabled": True,
            "prefetch_enabled": compute_stage["prefetch_size"] > 0,
            "browser_optimized": browser_name in ["chrome", "firefox", "safari", "edge"],
            "browser_name": browser_name
        }
    
    def _calculate_optimal_prefetch_size(self):
        """
        Calculate the optimal prefetch size using advanced token prediction.
        
        This enhanced implementation uses:
        1. Historical token generation patterns
        2. Language model prediction confidence
        3. Current context analysis
        4. Memory and performance constraints
        5. Token generation entropy analysis
        
        Returns:
            Integer representing optimal prefetch size (1-4)
        """
        # Initialize default prefetch size
        default_prefetch_size = 1
        
        # 1. Check if we have enough history for prediction
        if not hasattr(self, "_token_history") or len(self._token_history) < 3:
            # Not enough history, initialize tracking and return default
            if not hasattr(self, "_token_history"):
                self._token_history = []
                self._token_entropy_history = []
                self._token_confidence_history = []
                self._prediction_success_rate = []
                self._last_prefetch_size = default_prefetch_size
            return default_prefetch_size
        
        # 2. Analyze recent token generation performance
        recent_latencies = self._latency_tracker[-5:] if hasattr(self, "_latency_tracker") and len(self._latency_tracker) >= 5 else []
        avg_latency = sum(recent_latencies) / len(recent_latencies) if recent_latencies else 50  # Default 50ms
        
        # 3. Calculate token prediction confidence based on recent history
        # Higher confidence = more aggressive prefetching
        prediction_confidence = 0.5  # Default medium confidence
        
        if hasattr(self, "_token_confidence_history") and len(self._token_confidence_history) > 0:
            # Use actual confidence scores from recent tokens
            prediction_confidence = sum(self._token_confidence_history[-3:]) / min(3, len(self._token_confidence_history))

        # 4. Check for memory pressure - reduce prefetch under pressure
        memory_pressure = False
        if hasattr(self, "_memory_pressure_detected"):
            memory_pressure = self._memory_pressure_detected
        
        # 5. Analyze token entropy (predictability) from recent history
        # Lower entropy = more predictable = more aggressive prefetching
        token_entropy = 0.7  # Default medium entropy
        if hasattr(self, "_token_entropy_history") and len(self._token_entropy_history) > 0:
            token_entropy = sum(self._token_entropy_history[-3:]) / min(3, len(self._token_entropy_history))
        
        # 6. Check for sentence structure patterns that suggest predictable tokens
        # e.g., After a period, likely to have space + capital letter
        sentence_pattern_predictability = self._analyze_sentence_patterns()
        
        # 7. Check prediction success rate
        prediction_success = 0.5  # Default 50% success rate
        if hasattr(self, "_prediction_success_rate") and len(self._prediction_success_rate) > 0:
            prediction_success = sum(self._prediction_success_rate) / len(self._prediction_success_rate)
        
        # 8. Determine optimal prefetch size based on all factors
        prefetch_size = default_prefetch_size
        
        # Base prefetch on latency - faster system can handle more prefetching
        if avg_latency < 20:  # Very fast (< 20ms per token)
            prefetch_size = 3  # Aggressive prefetch
        elif avg_latency < 40:  # Fast (20-40ms per token)
            prefetch_size = 2  # Moderate prefetch
        else:  # Slow (> 40ms per token)
            prefetch_size = 1  # Conservative prefetch
        
        # Adjust based on prediction confidence
        if prediction_confidence > 0.8:
            prefetch_size += 1  # Very confident predictions
        elif prediction_confidence < 0.3:
            prefetch_size = max(1, prefetch_size - 1)  # Low confidence
        
        # Adjust for token entropy
        if token_entropy < 0.4:  # Low entropy = highly predictable
            prefetch_size += 1
        elif token_entropy > 0.8:  # High entropy = unpredictable
            prefetch_size = max(1, prefetch_size - 1)
        
        # Adjust for sentence patterns
        if sentence_pattern_predictability > 0.7:  # Highly predictable pattern
            prefetch_size += 1
        
        # Adjust for prediction success rate
        if prediction_success > 0.7:  # Good success rate
            prefetch_size += 1
        elif prediction_success < 0.3:  # Poor success rate
            prefetch_size = max(1, prefetch_size - 1)
        
        # Reduce prefetch under memory pressure
        if memory_pressure:
            prefetch_size = max(1, prefetch_size - 1)
        
        # Update prediction metrics for next calculation
        self._update_prediction_metrics(prefetch_size)
        
        # Cap prefetch size to reasonable range (1-4)
        prefetch_size = max(1, min(4, prefetch_size))
        
        # Store for reference
        self._last_prefetch_size = prefetch_size
        
        return prefetch_size
        
    def _analyze_sentence_patterns(self):
        """
        Analyze recent tokens for predictable sentence patterns.
        
        Identifies patterns like:
        - After period → space → capital letter
        - Common word sequences
        - List patterns
        - Repeated phrases
        
        Returns:
            Float between 0-1 indicating pattern predictability
        """
        if not hasattr(self, "_token_history") or len(self._token_history) < 3:
            return 0.5  # Default medium predictability
        
        # Get last few tokens
        recent_tokens = self._token_history[-5:] if len(self._token_history) >= 5 else self._token_history
        
        # Check for period followed by space
        period_space_pattern = False
        for i in range(len(recent_tokens) - 1):
            if "." in recent_tokens[i] and " " in recent_tokens[i+1]:
                period_space_pattern = True
                break
        
        # Check for list patterns (e.g., "1. ", "2. ", etc. or "- ", "- ", etc.)
        list_pattern = False
        list_indicators = ["1.", "2.", "3.", "4.", "-", "•", "*"]
        for token in recent_tokens:
            if any(indicator in token for indicator in list_indicators):
                list_pattern = True
                break
        
        # Check for repeated phrases
        repeated_phrase = False
        if len(self._token_history) >= 10:
            # Simple check for repetition in recent history
            for i in range(len(recent_tokens) - 1):
                if recent_tokens[i] == recent_tokens[i+1]:
                    repeated_phrase = True
                    break
        
        # Calculate overall pattern predictability
        predictability = 0.5  # Start at medium
        
        if period_space_pattern:
            predictability += 0.2  # Sentence boundary is highly predictable
        
        if list_pattern:
            predictability += 0.15  # Lists have predictable patterns
        
        if repeated_phrase:
            predictability += 0.1  # Repetition suggests predictable pattern
        
        # Cap between 0 and 1
        return min(1.0, max(0.0, predictability))

    def _update_prediction_metrics(self, current_prefetch_size):
        """
        Update token prediction metrics based on actual generation results.
        
        Args:
            current_prefetch_size: The prefetch size being used
        """
        # Only update if we've processed tokens
        if not hasattr(self, "_tokens_generated") or self._tokens_generated == 0:
            return
        
        # Get the most recent actual token
        current_token = f"token{self._tokens_generated}" if self._tokens_generated > 0 else ""
        
        # Store in history for pattern analysis (limit history size)
        if hasattr(self, "_token_history"):
            self._token_history.append(current_token)
            if len(self._token_history) > 100:
                self._token_history = self._token_history[-100:]
        
        # If we had a previous prediction, check if it was correct
        if hasattr(self, "_token_predictions") and len(self._token_predictions) > 0:
            expected_token = self._token_predictions[0].get("token", "")
            expected_confidence = self._token_predictions[0].get("confidence", 0.5)
            
            # Check if prediction was correct
            prediction_correct = (expected_token == current_token)
            
            # Record success/failure of prediction with confidence weighting
            if hasattr(self, "_prediction_success_rate"):
                # Weight by confidence - high confidence wrong predictions are penalized more
                weighted_result = 1.0 if prediction_correct else (1.0 - expected_confidence)
                self._prediction_success_rate.append(weighted_result)
                
                # Keep history manageable
                if len(self._prediction_success_rate) > 20:
                    self._prediction_success_rate = self._prediction_success_rate[-20:]
        
        # Generate new predictions based on current context
        # In real implementation, this would use the model's actual output distribution
        # For simulation, we'll create synthetic predictions
        
        import random
        if hasattr(random, "random"):
            # Simulate token prediction
            self._token_predictions = []
            
            # Number of predictions to generate (based on current prefetch size)
            num_predictions = current_prefetch_size
            
            for i in range(num_predictions):
                # Generate predicted next token
                # In real implementation, this would use the model's logits
                next_position = self._tokens_generated + i + 1
                
                # Simulate different prediction patterns
                if next_position % 10 == 0:
                    # End of sentence prediction
                    predicted_token = ". "
                    # Sentence endings are usually high confidence
                    confidence = random.uniform(0.6, 0.9)
                    # Sentence endings have low entropy (highly predictable)
                    entropy = random.uniform(0.1, 0.4)
                elif next_position % 5 == 0:
                    # Comma prediction
                    predicted_token = ", "
                    # Commas are medium-high confidence
                    confidence = random.uniform(0.4, 0.7)
                    # Commas have medium entropy
                    entropy = random.uniform(0.3, 0.6)
                else:
                    # Regular token prediction
                    predicted_token = f"token{next_position} "
                    # Regular tokens have varied confidence
                    confidence = random.uniform(0.2, 0.8)
                    # Regular tokens have varied entropy
                    entropy = random.uniform(0.4, 0.9)
                
                # Store prediction
                self._token_predictions.append({
                    "token": predicted_token,
                    "position": next_position,
                    "confidence": confidence,
                    "entropy": entropy
                })
            
            # Record confidence and entropy for the next token prediction
            if self._token_predictions:
                if hasattr(self, "_token_confidence_history"):
                    self._token_confidence_history.append(self._token_predictions[0]["confidence"])
                    if len(self._token_confidence_history) > 20:
                        self._token_confidence_history = self._token_confidence_history[-20:]
                
                if hasattr(self, "_token_entropy_history"):
                    self._token_entropy_history.append(self._token_predictions[0]["entropy"])
                    if len(self._token_entropy_history) > 20:
                        self._token_entropy_history = self._token_entropy_history[-20:]
    
    def _decode_token(self, batch_size: int = 1) -> Tuple[List[str], bool]:
        """
        Generate the next token(s) using the current model state with KV-cache integration.
        
        This implementation supports token-by-token generation with optimized KV-cache
        using 2-bit, 3-bit, or 4-bit precision for memory efficiency.
        
        Args:
            batch_size: Number of tokens to generate in parallel
            
        Returns:
            Tuple of (tokens, is_finished)
        """
        # In a real implementation, this would run inference using WebGPU
        # Here we integrate with our ultra-low precision KV cache
        
        # Check if we're using the optimized KV cache or just simulation
        using_optimized_kv_cache = isinstance(self._kv_cache, dict) and "memory_reduction_percent" in self._kv_cache
        
        tokens = []
        is_finished = False
        
        # Determine precision bits for optimization
        precision_bits = None
        if using_optimized_kv_cache:
            precision_bits = self._kv_cache.get("bits", 4)
            logger.debug(f"Using {precision_bits}-bit precision for token generation")
        
        # Get model dimensions
        num_heads = self._model.get("num_heads", 32)
        head_dim = self._model.get("head_dim", 128)
        
        # Import necessary functions if available
        try:
            import numpy as np
            from fixed_web_platform.webgpu_kv_cache_optimization import update_kv_cache
            kv_cache_module_available = True
        except ImportError:
            kv_cache_module_available = False
            logger.warning("KV cache optimization module not available")
            
        # Memory pressure handling - check if we need to prune the KV cache
        if (using_optimized_kv_cache and hasattr(self, "_tokens_generated") and 
                self._tokens_generated > 0 and self._tokens_generated % 500 == 0):
            try:
                logger.debug("Checking KV cache for pruning")
                from fixed_web_platform.webgpu_kv_cache_optimization import WebGPUKVCacheManager
                # In a real implementation, this would check and prune if needed
                # For simulation, we'll just log that it would happen
                logger.info(f"KV cache pruning would occur at token {self._tokens_generated}")
            except ImportError:
                logger.debug("KV cache pruning not available")
        
        # Track token generation performance 
        token_start_time = time.time()
        
        # Get optimization configuration using the compute/transfer overlap implementation
        optimization_config = self._optimize_token_generation(
            model_id=self._model.get("name", "unknown"),
            input_tokens=None,  # We don't track input tokens in simulation
            generated_tokens=[i for i in range(self._tokens_generated)],
            current_batch_size=batch_size
        )
        
        # Apply optimization configuration
        compute_stage = optimization_config["compute_stage"]
        transfer_stage = optimization_config["transfer_stage"]
        use_overlap = optimization_config["overlap_enabled"]
        use_prefetch = optimization_config["prefetch_enabled"]
        prefetch_size = compute_stage.get("prefetch_size", 0) if use_prefetch else 0
        
        # Track optimization usage in metrics
        if not hasattr(self, "_optimization_usage"):
            self._optimization_usage = {
                "compute_transfer_overlap": 0,
                "prefetch": 0,
                "browser_optimized": 0,
                "workgroup_size": []
            }
        
        self._optimization_usage["compute_transfer_overlap"] += 1 if use_overlap else 0
        self._optimization_usage["prefetch"] += 1 if use_prefetch else 0
        self._optimization_usage["browser_optimized"] += 1 if optimization_config["browser_optimized"] else 0
        self._optimization_usage["workgroup_size"].append(compute_stage["workgroup_size"])
        
        # Store last optimization config
        self._last_optimization_config = optimization_config
        
        # Generate up to batch_size tokens
        for i in range(batch_size):
            # Track current token position in sequence
            self._tokens_generated += 1
            current_position = self._tokens_generated - 1
            
            # Simulate end of generation conditions
            # In a real implementation, this would check for EOS token or length limits
            if self._tokens_generated >= 100:
                is_finished = True
                break
            
            # Simulate token selection with different sentence structures
            # In a real implementation, this would be the output of the model with sampling
            if self._tokens_generated % 10 == 0:
                token_text = ". "
            elif self._tokens_generated % 5 == 0:
                token_text = ", "
            else:
                token_text = f"token{self._tokens_generated} "
            
            tokens.append(token_text)
            
            # Simulate logits computation - in real implementation, this would come from the model
            import random
            if hasattr(random, "random"):
                token_logits = [random.random() for _ in range(32000)]  # Vocabulary size
            else:
                token_logits = [0.1] * 32000  # Fallback
            
            # Update KV cache with the new token if using optimized version
            # This is the core integration with webgpu_kv_cache_optimization.py
            if using_optimized_kv_cache and kv_cache_module_available:
                try:
                    # COMPUTE STAGE: Simulate model forward pass to get key/value states for this token
                    # In a real implementation, this would be a WebGPU compute operation
                    # Start tracking compute time
                    compute_start_time = time.time()
                    
                    # Create key/value tensors for this token
                    # Shape: [batch_size, num_heads, seq_len=1, head_dim]
                    batch_size_for_kv = 1
                    seq_len_per_token = 1  # One token at a time for streaming
                    
                    # Generate simulated key/value states - in real implementation these come from model
                    key_states = np.random.randn(batch_size_for_kv, num_heads, seq_len_per_token, head_dim).astype(np.float32)
                    value_states = np.random.randn(batch_size_for_kv, num_heads, seq_len_per_token, head_dim).astype(np.float32)
                    
                    # Create position array for the KV cache update
                    # This maps the token to its position in the sequence
                    position_array = np.array([current_position], dtype=np.int32)
                    
                    # Record compute completion time
                    compute_time = time.time() - compute_start_time
                    
                    # TRANSFER STAGE: Update the KV cache (data transfer operation)
                    # In a real implementation, this would overlap with the next compute operation
                    # Start tracking transfer time
                    transfer_start_time = time.time()
                    
                    # Perform the actual KV cache update
                    # This is the integration point with webgpu_kv_cache_optimization.py
                    kv_cache_before_update = self._kv_cache.copy() if isinstance(self._kv_cache, dict) else None
                    
                    # Update the KV cache with ultra-low precision
                    self._kv_cache = update_kv_cache(
                        self._kv_cache,
                        key_states,
                        value_states,
                        position_array
                    )
                    
                    # Record transfer completion time
                    transfer_time = time.time() - transfer_start_time
                    
                    # PREFETCH STAGE: If enabled, simulate prefetching of the next token
                    if use_prefetch and prefetch_size > 0:
                        # Start tracking prefetch time
                        prefetch_start_time = time.time()
                        
                        # Simulate prefetching operations
                        # In a real implementation, this would compute partial results for the next token
                        
                        # Fake prefetch computation
                        for _ in range(prefetch_size):
                            # Simulate some prefetch work
                            _ = np.random.randn(1, num_heads, 1, head_dim).astype(np.float32)
                            
                        # Record prefetch completion time
                        prefetch_time = time.time() - prefetch_start_time
                    else:
                        prefetch_time = 0
                    
                    # For debugging, check if the update was successful
                    if isinstance(self._kv_cache, dict) and isinstance(kv_cache_before_update, dict):
                        if precision_bits == 2:
                            logger.debug(f"Updated 2-bit KV cache for token at position {current_position}")
                        elif precision_bits == 3:
                            logger.debug(f"Updated 3-bit KV cache for token at position {current_position}")
                        else:
                            logger.debug(f"Updated {precision_bits}-bit KV cache for token at position {current_position}")
                        
                        # Check current context length
                        if "current_len" in self._kv_cache:
                            if self._kv_cache["current_len"] % 100 == 0:
                                logger.info(f"KV cache current length: {self._kv_cache['current_len']} tokens")
                    
                    # Track timing information
                    self._token_timing = {
                        "compute_time_ms": compute_time * 1000,
                        "transfer_time_ms": transfer_time * 1000,
                        "prefetch_time_ms": prefetch_time * 1000,
                        "overlap_efficiency": min(1.0, compute_time / (transfer_time + 1e-6)) if use_overlap else 0.0
                    }
                    
                except Exception as e:
                    # Fallback if update fails - log error and continue without update
                    logger.warning(f"Failed to update KV cache: {e}")
        
        # Calculate token generation time
        token_gen_time = time.time() - token_start_time
        token_throughput = batch_size / token_gen_time if token_gen_time > 0 else 0
        
        # Calculate base delay for token generation
        # This simulates the actual computation time for the WebGPU shader processing
        if self.config["latency_optimized"]:
            # Optimized for low latency with faster prefetch and decode
            base_delay = 0.008  # 8ms base latency (extremely good for LLMs)
        else:
            # Standard latency without optimization
            base_delay = 0.045  # 45ms standard latency
        
        # Adjust latency based on KV cache optimization
        if using_optimized_kv_cache:
            # Ultra-low precision provides significant latency improvements
            if precision_bits == 2:
                # 2-bit provides the fastest inference
                base_delay *= 0.65  # 35% latency reduction 
            elif precision_bits == 3:
                # 3-bit is still very fast
                base_delay *= 0.75  # 25% latency reduction
            elif precision_bits == 4:
                # 4-bit offers modest improvement
                base_delay *= 0.85  # 15% latency reduction
                
        # Apply compute/transfer overlap optimization if enabled
        if use_overlap and hasattr(self, "_token_timing"):
            # In real implementation, the effective latency would be reduced by the overlap factor
            overlap_efficiency = self._token_timing.get("overlap_efficiency", 0.0)
            overlap_factor = 0.75 if optimization_config["browser_optimized"] else 0.5
            
            # Apply overlap factor to reduce latency
            adjusted_delay = base_delay * (1.0 - (overlap_efficiency * overlap_factor))
            
            # Ensure we don't go below a reasonable minimum latency
            base_delay = max(adjusted_delay, base_delay * 0.5)
        
        # Apply batch processing efficiency - larger batches are more efficient
        # But with diminishing returns due to memory bandwidth limitations
        if batch_size > 1:
            # Calculate efficiency factor (non-linear scaling)
            batch_efficiency = min(1.0 + (0.5 * math.log2(batch_size)), 3.0)
            delay = base_delay / batch_efficiency
        else:
            delay = base_delay
            
        # Track latency for adaptive batch size optimization
        if hasattr(self, "_latency_tracker"):
            self._latency_tracker.append(delay * 1000)  # Convert to ms
            # Keep only recent measurements
            if len(self._latency_tracker) > 20:
                self._latency_tracker = self._latency_tracker[-20:]
        else:
            self._latency_tracker = [delay * 1000]
        
        # Simulate memory pressure detection
        # In a real implementation, this would monitor GPU memory usage
        if using_optimized_kv_cache and self._tokens_generated > 0:
            # Calculate memory usage growth
            if hasattr(self, "_memory_usage_tracker"):
                # Simulate memory growth with diminishing rate due to KV cache optimization
                memory_growth = 10 * (0.9 ** (self._tokens_generated // 100))  # In MB
                self._memory_usage_tracker.append(self._memory_usage_tracker[-1] + memory_growth)
            else:
                # Initial memory usage estimate
                self._memory_usage_tracker = [100]  # Starting at 100MB
        
        # Simulate processing time
        time.sleep(delay)
        
        # Check for memory pressure periodically and update memory metrics
        if hasattr(self, "_check_memory_pressure") and hasattr(self, "_memory_usage_tracker"):
            # Update memory usage tracking after each token batch
            # In a real implementation, this would use actual GPU memory metrics
            memory_growth = len(tokens) * 0.05  # Estimate 50KB per token
            current_memory = self._memory_usage_tracker[-1] + memory_growth
            self._memory_usage_tracker.append(current_memory)
            
            # Update memory metrics
            if hasattr(self, "_memory_metrics"):
                self._memory_metrics["current_memory_usage_mb"] = current_memory
                self._memory_metrics["peak_memory_usage_mb"] = max(
                    self._memory_metrics["peak_memory_usage_mb"],
                    current_memory
                )
                self._memory_metrics["kv_cache_memory_mb"] += memory_growth * 0.9  # 90% of growth is KV cache
            
            # Check for memory pressure - this will handle it automatically if detected
            if self._tokens_generated % 10 == 0:  # Only check periodically for efficiency
                memory_pressure_detected = self._check_memory_pressure()
                if memory_pressure_detected and hasattr(self, "_token_generation_stats"):
                    self._token_generation_stats["memory_pressure_events"] += 1
                    
                    # Adjust batch size immediately if critical pressure detected
                    if (hasattr(self, "_memory_metrics") and hasattr(self, "_memory_monitor") and
                        self._memory_metrics["current_memory_usage_mb"] / self._memory_monitor["memory_limit_mb"] >= 
                        self._memory_monitor["critical_threshold"] and self._current_batch_size > 1):
                        
                        # Reduce batch size if under critical pressure
                        old_batch_size = self._current_batch_size
                        self._current_batch_size = max(1, self._current_batch_size // 2)
                        logger.warning(f"Reduced batch size from {old_batch_size} to {self._current_batch_size} "
                                     f"due to critical memory pressure")
        
        # Track token generation statistics for performance analysis
        if not hasattr(self, "_token_generation_stats"):
            self._token_generation_stats = {
                "tokens_total": 0,
                "batch_sizes": [],
                "latencies_ms": [],
                "throughputs": [],
                "memory_pressure_events": 0
            }
        
        self._token_generation_stats["tokens_total"] += len(tokens)
        self._token_generation_stats["batch_sizes"].append(batch_size)
        self._token_generation_stats["latencies_ms"].append(delay * 1000)
        self._token_generation_stats["throughputs"].append(token_throughput)
        
        return tokens, is_finished
        
    def _generate_with_ultra_low_precision(self, prompt: str, max_tokens: int, temperature: float = 0.7) -> str:
        """
        Generate text using ultra-low precision to optimize memory usage and performance.
        
        Args:
            prompt: The input prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature
            
        Returns:
            Generated text
        """
        # This function would integrate with the WebGPU pipeline
        # For now, we'll simulate the process with our KV cache
        
        # Run prefill phase
        logger.info(f"Running prefill with ultra-low precision KV cache")
        prefill_start = time.time()
        prefill_result = self._prefill(prompt)
        prefill_time = time.time() - prefill_start
        
        # Calculate memory savings
        using_optimized_kv_cache = isinstance(self._kv_cache, dict) and "memory_reduction_percent" in self._kv_cache
        if using_optimized_kv_cache:
            bits = self._kv_cache.get("bits", 4)
            memory_reduction = self._kv_cache.get("memory_reduction_percent", 0)
            max_possible_context = self._kv_cache.get("max_seq_len", 4096)
            
            logger.info(f"Using {bits}-bit KV cache with {memory_reduction:.1f}% memory reduction")
            logger.info(f"Maximum possible context length: {max_possible_context}")
        
        # Start token generation
        full_response = ""
        self._tokens_generated = 0
        is_finished = False
        
        # Loop until finished or max tokens reached
        while not is_finished and self._tokens_generated < max_tokens:
            # Generate tokens with current batch size
            batch_start = time.time()
            tokens, is_finished = self._decode_token(self._current_batch_size)
            generation_time = time.time() - batch_start
            
            # Append tokens to response
            for token in tokens:
                full_response += token
            
            # Update adaptive batch size if enabled
            if self.config["adaptive_batch_size"]:
                token_time_ms = (generation_time * 1000) / max(1, len(tokens))
                self._update_adaptive_batch_size(token_time_ms)
        
        # Return the full response
        return full_response
    
    def _update_adaptive_batch_size(self, token_time_ms: float):
        """
        Update the batch size based on performance measurements.
        
        Args:
            token_time_ms: Time taken to generate a token in milliseconds
        """
        if not self.config["adaptive_batch_size"]:
            return
        
        # Add current measurement
        self._perf_measurements.append(token_time_ms)
        
        # Only adapt after collecting enough measurements
        if len(self._perf_measurements) < 5:
            return
        
        # Calculate recent average
        recent_avg = sum(self._perf_measurements[-5:]) / 5
        
        # Adjust batch size based on performance
        if recent_avg < 15 and self._current_batch_size < self.config["max_batch_size"]:
            # Performance is good, increase batch size
            self._current_batch_size = min(self._current_batch_size + 1, self.config["max_batch_size"])
            logger.debug(f"Increased batch size to {self._current_batch_size}")
        elif recent_avg > 40 and self._current_batch_size > 1:
            # Performance is poor, decrease batch size
            self._current_batch_size = max(self._current_batch_size - 1, 1)
            logger.debug(f"Decreased batch size to {self._current_batch_size}")
        
        # Keep history of batch sizes
        self._batch_size_history.append(self._current_batch_size)
    
    def generate(self, prompt: str, max_tokens: int = 100, temperature: float = 0.7, 
                 callback: Callable = None) -> str:
        """
        Generate text with streaming output.
        
        Args:
            prompt: The input prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature
            callback: Function called for each generated token
            
        Returns:
            The generated text
        """
        if self._is_generating:
            raise RuntimeError("Already generating. Wait for current generation to complete.")
        
        self._is_generating = True
        self._tokens_generated = 0
        self._generation_start_time = time.time()
        
        full_response = ""
        
        try:
            # Check if we should use ultra-low precision generation
            using_ultra_low_precision = (
                isinstance(self._kv_cache, dict) and 
                "bits" in self._kv_cache and 
                self._kv_cache["bits"] <= 3
            )
            
            if using_ultra_low_precision:
                # Use ultra-low precision generation for memory efficiency
                logger.info(f"Using ultra-low precision ({self._kv_cache['bits']}-bit) generation")
                
                # Run prefill phase
                prefill_result = self._prefill(prompt)
                
                # Stream tokens using ultra-low precision
                is_finished = False
                while not is_finished and self._tokens_generated < max_tokens:
                    # Generate next batch of tokens
                    batch_start_time = time.time()
                    tokens, is_finished = self._decode_token(self._current_batch_size)
                    generation_time_ms = (time.time() - batch_start_time) * 1000
                    
                    # Update adaptive batch size
                    self._update_adaptive_batch_size(generation_time_ms / max(1, len(tokens)))
                    
                    # Process generated tokens
                    for i, token in enumerate(tokens):
                        full_response += token
                        
                        # Call callback if provided
                        if callback:
                            is_last_token = is_finished and (i == len(tokens) - 1)
                            callback(token, is_last=is_last_token)
            else:
                # Use standard generation
                # Run prefill phase
                prefill_result = self._prefill(prompt)
                
                # Stream tokens
                is_finished = False
                while not is_finished and self._tokens_generated < max_tokens:
                    # Generate next batch of tokens
                    batch_start_time = time.time()
                    tokens, is_finished = self._decode_token(self._current_batch_size)
                    generation_time_ms = (time.time() - batch_start_time) * 1000
                    
                    # Update adaptive batch size
                    self._update_adaptive_batch_size(generation_time_ms / max(1, len(tokens)))
                    
                    # Process generated tokens
                    for i, token in enumerate(tokens):
                        full_response += token
                        
                        # Call callback if provided
                        if callback:
                            is_last_token = is_finished and (i == len(tokens) - 1)
                            callback(token, is_last=is_last_token)
            
            # Log final statistics
            generation_time = time.time() - self._generation_start_time
            tokens_per_second = self._tokens_generated / generation_time if generation_time > 0 else 0
            
            # Log memory efficiency if using ultra-low precision
            if using_ultra_low_precision:
                bits = self._kv_cache["bits"]
                memory_reduction = self._kv_cache.get("memory_reduction_percent", 0)
                logger.info(f"Generated {self._tokens_generated} tokens in {generation_time:.2f}s "
                           f"({tokens_per_second:.2f} tokens/sec) with {bits}-bit precision "
                           f"({memory_reduction:.1f}% memory reduction)")
            else:
                logger.info(f"Generated {self._tokens_generated} tokens in {generation_time:.2f}s "
                          f"({tokens_per_second:.2f} tokens/sec)")
            
            return full_response
            
        finally:
            self._is_generating = False
    
    async def generate_async(self, prompt: str, max_tokens: int = 100, temperature: float = 0.7) -> str:
        """
        Generate text asynchronously with streaming output.
        
        Args:
            prompt: The input prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature
            
        Returns:
            The generated text
        """
        if self._is_generating:
            raise RuntimeError("Already generating. Wait for current generation to complete.")
        
        self._is_generating = True
        self._tokens_generated = 0
        self._generation_start_time = time.time()
        
        full_response = ""
        
        try:
            # Run prefill phase (wrapped in a thread to avoid blocking)
            prefill_future = asyncio.get_event_loop().run_in_executor(
                None, self._prefill, prompt
            )
            prefill_result = await prefill_future
            
            # Stream tokens
            is_finished = False
            while not is_finished and self._tokens_generated < max_tokens:
                # Generate next batch of tokens (in thread to avoid blocking)
                batch_start_time = time.time()
                decode_future = asyncio.get_event_loop().run_in_executor(
                    None, self._decode_token, self._current_batch_size
                )
                tokens, is_finished = await decode_future
                generation_time_ms = (time.time() - batch_start_time) * 1000
                
                # Update adaptive batch size
                self._update_adaptive_batch_size(generation_time_ms / max(1, len(tokens)))
                
                # Process generated tokens
                for token in tokens:
                    full_response += token
                    
                    # Allow for cooperative multitasking
                    await asyncio.sleep(0)
            
            generation_time = time.time() - self._generation_start_time
            logger.info(f"Generated {self._tokens_generated} tokens in {generation_time:.2f}s "
                      f"({self._tokens_generated / generation_time:.2f} tokens/sec)")
            
            return full_response
            
        finally:
            self._is_generating = False
    
    async def stream_websocket(self, websocket, prompt: str, max_tokens: int = 100, 
                               temperature: float = 0.7, stream_options: Dict[str, Any] = None):
        """
        Stream generated tokens over a WebSocket connection with real-time KV-cache metrics.
        
        This enhanced implementation provides detailed metrics about the streaming process,
        including KV-cache memory usage, token generation latency, and memory pressure handling.
        
        Args:
            websocket: WebSocket connection
            prompt: The input prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature
            stream_options: Additional streaming options
                - send_stats_frequency: How often to send stats updates (token count)
                - memory_metrics: Whether to include memory usage metrics
                - latency_metrics: Whether to include detailed latency metrics
                - batch_metrics: Whether to include batch size adaptation metrics
        """
        if self._is_generating:
            await websocket.send(json.dumps({
                "error": "Already generating. Wait for current generation to complete."
            }))
            return
        
        # Set up streaming options with defaults
        stream_options = stream_options or {}
        send_stats_frequency = stream_options.get("send_stats_frequency", 50)
        memory_metrics = stream_options.get("memory_metrics", True)
        latency_metrics = stream_options.get("latency_metrics", True)
        batch_metrics = stream_options.get("batch_metrics", True)
        
        # Initialize generation state
        self._is_generating = True
        self._tokens_generated = 0
        self._generation_start_time = time.time()
        
        # Set up streaming performance tracking
        stream_stats = {
            "tokens_sent": 0,
            "total_websocket_time_ms": 0,
            "websocket_latencies_ms": [],
            "token_latencies_ms": [],
            "memory_pressure_events": 0,
            "kv_cache_updates": 0,
            "batch_size_changes": 0
        }
        
        try:
            # Check if we're using ultra-low precision KV cache
            using_ultra_low_precision = (
                isinstance(self._kv_cache, dict) and 
                "bits" in self._kv_cache and 
                self._kv_cache["bits"] <= 4  # Include 4-bit as ultra-low precision
            )
            
            # Get KV cache configuration details
            bits = self._kv_cache.get("bits", None) if using_ultra_low_precision else None
            memory_reduction = self._kv_cache.get("memory_reduction_percent", None) if using_ultra_low_precision else None
            max_context_len = self._kv_cache.get("max_seq_len", None) if using_ultra_low_precision else None
            
            # Send initial message with enhanced details
            initial_message = {
                "type": "start",
                "prompt": prompt,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "latency_optimized": self.config.get("latency_optimized", False),
                "prefill_optimized": self.config.get("prefill_optimized", False),
                "using_ultra_low_precision": using_ultra_low_precision
            }
            
            # Add precision and memory information if available
            if using_ultra_low_precision:
                initial_message.update({
                    "precision_bits": bits,
                    "memory_reduction_percent": memory_reduction,
                    "max_context_length": max_context_len,
                    "theoretical_context_extension": f"{(16/bits) if bits else 0}x"
                })
            
            # Add adaptive batch size information if enabled
            if self.config.get("adaptive_batch_size", False):
                initial_message.update({
                    "adaptive_batch_size": True,
                    "max_batch_size": self.config.get("max_batch_size", 8),
                    "current_batch_size": self._current_batch_size
                })
            
            # Send initial configuration message
            ws_send_start = time.time()
            await websocket.send(json.dumps(initial_message))
            stream_stats["total_websocket_time_ms"] += (time.time() - ws_send_start) * 1000
            
            # Run prefill phase with detailed metrics
            prefill_start_time = time.time()
            logger.info(f"Starting prefill phase for prompt with {len(prompt.split())} words")
            
            # Run prefill in a separate thread to avoid blocking the event loop
            prefill_future = asyncio.get_event_loop().run_in_executor(
                None, self._prefill, prompt
            )
            prefill_result = await prefill_future
            
            prefill_time_ms = (time.time() - prefill_start_time) * 1000
            prefill_tokens = len(prefill_result.get("tokens", []))
            
            # Send enhanced prefill completion message with detailed metrics
            prefill_message = {
                "type": "prefill_complete",
                "tokens_processed": prefill_tokens,
                "time_ms": prefill_time_ms,
                "tokens_per_second": (prefill_tokens / prefill_time_ms * 1000) if prefill_time_ms > 0 else 0
            }
            
            # Add KV cache state if using ultra-low precision
            if using_ultra_low_precision:
                prefill_message["kv_cache_state"] = {
                    "initialized": True,
                    "size_tokens": prefill_tokens,
                    "memory_used_mb": (self._kv_cache.get("quantized_size_bytes", 0) / (1024 * 1024)),
                    "bits": bits,
                    "memory_reduction_percent": memory_reduction
                }
            
            # Send prefill complete message
            ws_send_start = time.time()
            await websocket.send(json.dumps(prefill_message))
            stream_stats["total_websocket_time_ms"] += (time.time() - ws_send_start) * 1000
            
            # Initialize token generation
            is_finished = False
            full_response = ""
            last_stats_update = 0
            last_batch_size = self._current_batch_size
            
            # Main token generation and streaming loop
            while not is_finished and self._tokens_generated < max_tokens:
                # Generate next batch of tokens using the optimized _decode_token method
                # Run in a separate thread to avoid blocking the event loop
                batch_start_time = time.time()
                decode_future = asyncio.get_event_loop().run_in_executor(
                    None, self._decode_token, self._current_batch_size
                )
                tokens, is_finished = await decode_future
                generation_time_ms = (time.time() - batch_start_time) * 1000
                
                # Update adaptive batch size
                if self.config.get("adaptive_batch_size", False):
                    self._update_adaptive_batch_size(generation_time_ms / max(1, len(tokens)))
                    
                    # Track batch size changes for metrics
                    if self._current_batch_size != last_batch_size:
                        stream_stats["batch_size_changes"] += 1
                        last_batch_size = self._current_batch_size
                
                # Track token generation latency
                per_token_latency = generation_time_ms / max(1, len(tokens))
                stream_stats["token_latencies_ms"].append(per_token_latency)
                
                # Check for memory pressure and handle if needed
                # This integrates memory pressure detection with the streaming process
                if hasattr(self, "_check_memory_pressure"):
                    memory_pressure_detected = self._check_memory_pressure()
                    if memory_pressure_detected:
                        # Include memory pressure notification in stream
                        memory_warning_message = {
                            "type": "memory_pressure",
                            "level": "warning" if self._memory_metrics["current_memory_usage_mb"] / self._memory_monitor["memory_limit_mb"] < self._memory_monitor["critical_threshold"] else "critical",
                            "current_memory_mb": self._memory_metrics["current_memory_usage_mb"],
                            "memory_limit_mb": self._memory_monitor["memory_limit_mb"],
                            "percent_used": self._memory_metrics["current_memory_usage_mb"] / self._memory_monitor["memory_limit_mb"] * 100,
                            "tokens_generated": self._tokens_generated,
                            "actions_taken": self._memory_reduction_actions_taken[-1] if hasattr(self, "_memory_reduction_actions_taken") and self._memory_reduction_actions_taken else None
                        }
                        
                        # Send memory pressure notification
                        ws_send_start = time.time()
                        await websocket.send(json.dumps(memory_warning_message))
                        stream_stats["total_websocket_time_ms"] += (time.time() - ws_send_start) * 1000
                
                # Send periodic KV cache status updates
                if (using_ultra_low_precision and 
                    memory_metrics and 
                    self._tokens_generated - last_stats_update >= send_stats_frequency):
                    
                    # Get current KV cache state
                    current_length = self._kv_cache.get("current_len", 0)
                    memory_used_bytes = self._kv_cache.get("quantized_size_bytes", 0)
                    memory_used_mb = memory_used_bytes / (1024 * 1024)
                    
                    # Calculate memory efficiency compared to FP16
                    fp16_memory_mb = (current_length * 2 * self._model.get("num_heads", 32) * 
                                     self._model.get("head_dim", 128) * 2) / (1024 * 1024)
                    memory_saved_mb = fp16_memory_mb - memory_used_mb
                    
                    # Send detailed KV cache status update
                    kv_status_message = {
                        "type": "kv_cache_status",
                        "current_length": current_length,
                        "max_length": max_context_len,
                        "memory_used_mb": memory_used_mb,
                        "memory_saved_mb": memory_saved_mb,
                        "tokens_generated": self._tokens_generated,
                        "token_generation_rate": (self._tokens_generated / 
                                               (time.time() - self._generation_start_time))
                    }
                    
                    # Add memory pressure metrics if tracked
                    if hasattr(self, "_memory_usage_tracker"):
                        kv_status_message["memory_pressure"] = {
                            "current_mb": self._memory_usage_tracker[-1],
                            "growth_rate_mb_per_token": (self._memory_usage_tracker[-1] - 
                                                      self._memory_usage_tracker[0]) / max(1, self._tokens_generated)
                        }
                    
                    # Add latency metrics if tracked and requested
                    if latency_metrics and hasattr(self, "_latency_tracker"):
                        # Calculate recent and running average latencies
                        recent_latency = sum(self._latency_tracker[-10:]) / min(len(self._latency_tracker), 10)
                        overall_latency = sum(self._latency_tracker) / len(self._latency_tracker)
                        
                        kv_status_message["latency_metrics"] = {
                            "recent_avg_ms": recent_latency,
                            "overall_avg_ms": overall_latency,
                            "current_ms": self._latency_tracker[-1] if self._latency_tracker else 0
                        }
                    
                    # Add batch size metrics if tracked and requested
                    if batch_metrics and hasattr(self, "_batch_size_history") and self._batch_size_history:
                        kv_status_message["batch_metrics"] = {
                            "current_batch_size": self._current_batch_size,
                            "batch_history": self._batch_size_history[-5:],
                            "batch_changes": stream_stats["batch_size_changes"]
                        }
                    
                    # Send KV cache status update
                    ws_send_start = time.time()
                    await websocket.send(json.dumps(kv_status_message))
                    stream_stats["total_websocket_time_ms"] += (time.time() - ws_send_start) * 1000
                    
                    # Update last stats update marker
                    last_stats_update = self._tokens_generated
                    stream_stats["kv_cache_updates"] += 1
                
                # Process and stream each generated token
                for token_idx, token in enumerate(tokens):
                    # Add to full response
                    full_response += token
                    
                    # Prepare token message with enhanced metrics
                    token_message = {
                        "type": "token",
                        "token": token,
                        "token_id": self._tokens_generated - len(tokens) + token_idx + 1,
                        "is_last": is_finished and (token_idx == len(tokens) - 1)
                    }
                    
                    # Add per-token latency metrics if available and requested
                    if latency_metrics:
                        token_message["token_latency_ms"] = per_token_latency
                    
                    # Send token over WebSocket
                    ws_send_start = time.time()
                    await websocket.send(json.dumps(token_message))
                    ws_send_time_ms = (time.time() - ws_send_start) * 1000
                    
                    # Track WebSocket performance
                    stream_stats["websocket_latencies_ms"].append(ws_send_time_ms)
                    stream_stats["total_websocket_time_ms"] += ws_send_time_ms
                    stream_stats["tokens_sent"] += 1
                    
                    # Small delay to allow for cooperative multitasking in the event loop
                    # This helps ensure smooth streaming even under load
                    await asyncio.sleep(0.001)  # 1ms delay for event loop scheduling
            
            # Calculate final generation metrics
            generation_time = time.time() - self._generation_start_time
            tokens_per_second = self._tokens_generated / generation_time if generation_time > 0 else 0
            
            # Prepare comprehensive completion message with detailed metrics
            completion_message = {
                "type": "complete",
                "tokens_generated": self._tokens_generated,
                "tokens_sent": stream_stats["tokens_sent"],
                "generation_time": generation_time,
                "tokens_per_second": tokens_per_second,
                "full_text": full_response
            }
            
            # Add detailed token generation statistics if tracked
            if hasattr(self, "_token_generation_stats"):
                # Calculate average latency and throughput
                avg_latency = (sum(self._token_generation_stats["latencies_ms"]) / 
                              len(self._token_generation_stats["latencies_ms"]))
                
                avg_throughput = (sum(self._token_generation_stats["throughputs"]) / 
                                 len(self._token_generation_stats["throughputs"]))
                
                completion_message["generation_stats"] = {
                    "avg_token_latency_ms": avg_latency,
                    "avg_throughput_tokens_per_sec": avg_throughput,
                    "batch_size_changes": stream_stats["batch_size_changes"],
                    "final_batch_size": self._current_batch_size
                }
            
            # Add WebSocket streaming metrics
            if stream_stats["tokens_sent"] > 0:
                completion_message["streaming_stats"] = {
                    "avg_websocket_latency_ms": (sum(stream_stats["websocket_latencies_ms"]) / 
                                               len(stream_stats["websocket_latencies_ms"])),
                    "total_websocket_time_ms": stream_stats["total_websocket_time_ms"],
                    "websocket_overhead_percent": (stream_stats["total_websocket_time_ms"] / 
                                                (generation_time * 1000) * 100)
                }
            
            # Add ultra-low precision KV cache metrics if applicable
            if using_ultra_low_precision:
                # Get final KV cache state
                current_length = self._kv_cache.get("current_len", 0)
                memory_used_bytes = self._kv_cache.get("quantized_size_bytes", 0)
                memory_used_mb = memory_used_bytes / (1024 * 1024)
                
                completion_message["kv_cache_metrics"] = {
                    "precision_bits": bits,
                    "memory_reduction_percent": memory_reduction,
                    "current_context_length": current_length,
                    "max_context_length": max_context_len,
                    "memory_used_mb": memory_used_mb,
                    "context_extension_factor": (16/bits) if bits else 0,
                    "updates_sent": stream_stats["kv_cache_updates"]
                }
            
            # Send final completion message
            await websocket.send(json.dumps(completion_message))
            
            # Log detailed performance metrics
            if using_ultra_low_precision:
                logger.info(f"Generated {self._tokens_generated} tokens in {generation_time:.2f}s "
                           f"({tokens_per_second:.2f} tokens/sec) with {bits}-bit precision "
                           f"({memory_reduction:.1f}% memory reduction)")
            else:
                logger.info(f"Generated {self._tokens_generated} tokens in {generation_time:.2f}s "
                          f"({tokens_per_second:.2f} tokens/sec)")
            
        except asyncio.TimeoutError as timeout_error:
            # Handle timeout specifically
            error_message = f"Timeout during streaming: {str(timeout_error)}"
            logger.error(error_message)
            
            # Notify timeout handler if available
            if self.on_timeout is not None:
                try:
                    self.on_timeout()
                except Exception as handler_error:
                    logger.error(f"Error in timeout handler: {handler_error}")
            
            # Prepare error message for client
            error_info = {
                "type": "timeout",
                "message": error_message,
                "traceback": traceback.format_exc(),
                "tokens_generated_before_error": self._tokens_generated,
                "recovery_attempted": self.on_timeout is not None
            }
            
            # Send error message
            try:
                await websocket.send(json.dumps(error_info))
            except:
                logger.error("Failed to send timeout error message over WebSocket")
        
        except (websockets.exceptions.ConnectionClosedError, 
                websockets.exceptions.ConnectionClosedOK,
                ConnectionError) as conn_error:
            # Handle connection errors specifically
            error_message = f"Connection error during streaming: {str(conn_error)}"
            logger.error(error_message)
            
            # Notify connection error handler if available
            if self.on_connection_error is not None:
                try:
                    self.on_connection_error()
                except Exception as handler_error:
                    logger.error(f"Error in connection error handler: {handler_error}")
            
            # No need to send message since connection is closed
        
        except Exception as e:
            # Generic error handling
            error_message = f"Error in WebSocket streaming: {str(e)}"
            logger.error(error_message)
            logger.error(traceback.format_exc())
            
            # Notify general error handler if available
            if self.on_error is not None:
                try:
                    self.on_error({
                        "type": "streaming_error",
                        "message": error_message,
                        "component": "streaming",
                        "operation": "stream_websocket",
                        "recoverable": False,
                        "severity": "error"
                    })
                except Exception as handler_error:
                    logger.error(f"Error in error handler: {handler_error}")
            
            # Prepare detailed error message
            error_info = {
                "type": "error",
                "message": str(e),
                "traceback": traceback.format_exc(),
                "tokens_generated_before_error": self._tokens_generated
            }
            
            # Send error message
            try:
                await websocket.send(json.dumps(error_info))
            except:
                logger.error("Failed to send error message over WebSocket")
            
        finally:
            # Ensure we clean up properly
            self._is_generating = False
            
            # Send a final close message to signal completion
            try:
                await websocket.send(json.dumps({"type": "close"}))
            except:
                pass
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """
        Get performance statistics.
        
        Returns:
            Dictionary with performance statistics
        """
        return {
            "tokens_generated": self._tokens_generated,
            "generation_time": time.time() - self._generation_start_time if self._is_generating else 0,
            "tokens_per_second": self._tokens_generated / (time.time() - self._generation_start_time) 
                               if self._is_generating and (time.time() - self._generation_start_time) > 0 else 0,
            "batch_size_history": self._batch_size_history if hasattr(self, "_batch_size_history") else [],
            "current_batch_size": self._current_batch_size,
            "latency_optimized": self.config["latency_optimized"],
            "kv_cache_optimized": self.config["optimize_kv_cache"]
        }


def create_streaming_endpoint(model_path: str, config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Create a streaming inference endpoint.
    
    Args:
        model_path: Path to the model
        config: Configuration dictionary
        
    Returns:
        Dictionary with endpoint functions
    """
    # Create streaming inference handler
    streaming_handler = WebGPUStreamingInference(model_path, config)
    
    # Create endpoint functions
    endpoint = {
        "generate": streaming_handler.generate,
        "generate_async": streaming_handler.generate_async,
        "stream_websocket": streaming_handler.stream_websocket,
        "get_performance_stats": streaming_handler.get_performance_stats
    }
    
    return endpoint


def optimize_for_streaming(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Optimize configuration for streaming inference.
    
    Args:
        config: Base configuration dictionary
        
    Returns:
        Optimized configuration dictionary
    """
    # Start with base config or empty dict
    optimized_config = config.copy() if config else {}
    
    # Set streaming-optimized defaults
    optimized_config.setdefault("quantization", "int4")  # 4-bit is a good balance
    optimized_config.setdefault("optimize_kv_cache", True)  # Always beneficial
    optimized_config.setdefault("latency_optimized", True)  # Critical for streaming
    optimized_config.setdefault("adaptive_batch_size", True)  # Helps with variable conditions
    optimized_config.setdefault("prefill_optimized", True)  # Faster initial response
    
    # Set buffer size based on latency preference
    if optimized_config.get("ultra_low_latency", False):
        optimized_config["stream_buffer_size"] = 1  # Smallest buffer for lowest latency
        optimized_config["max_batch_size"] = 2  # Conservative batch size
    else:
        optimized_config["stream_buffer_size"] = 3  # Default buffer size
        optimized_config["max_batch_size"] = 8  # Default max batch size
    
    return optimized_config


async def start_websocket_server(model_path: str, host: str = "localhost", port: int = 8765):
    """
    Start a WebSocket server for streaming inference.
    
    Args:
        model_path: Path to the model
        host: Host to bind the server to
        port: Port to bind the server to
    """
    # Create streaming inference handler
    streaming_handler = WebGPUStreamingInference(model_path)
    
    async def handle_websocket(websocket, path):
        """Handle WebSocket connections."""
        try:
            # Receive initial request
            request = await websocket.recv()
            request_data = json.loads(request)
            
            # Extract parameters
            prompt = request_data.get("prompt", "")
            max_tokens = request_data.get("max_tokens", 100)
            temperature = request_data.get("temperature", 0.7)
            
            # Stream response
            await streaming_handler.stream_websocket(
                websocket, prompt, max_tokens, temperature
            )
            
        except Exception as e:
            logger.error(f"Error handling WebSocket connection: {e}")
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": str(e)
                }))
            except:
                pass
    
    # Start WebSocket server
    server = await websockets.serve(handle_websocket, host, port)
    logger.info(f"WebSocket server started at ws://{host}:{port}")
    
    # Keep the server running
    await server.wait_closed()


if __name__ == "__main__":
    print("WebGPU Streaming Inference with Ultra-Low Precision")
    print("==================================================")
    
    # Example 1: Standard usage with 4-bit quantization
    print("\nExample 1: Standard 4-bit precision")
    model_path = "models/llama-7b"
    config = {
        "quantization": "int4",
        "optimize_kv_cache": True,
        "latency_optimized": True,
        "adaptive_batch_size": True
    }
    
    # Create handler with 4-bit precision
    streaming_handler = WebGPUStreamingInference(model_path, config)
    
    # Define callback function
    def token_callback(token, is_last=False):
        print(token, end="", flush=True)
        if is_last:
            print("\nGeneration complete!")
    
    # Generate with streaming
    prompt = "Explain the concept of streaming inference in large language models"
    result = streaming_handler.generate(
        prompt,
        max_tokens=30,
        temperature=0.7,
        callback=token_callback
    )
    
    # Print performance stats
    stats = streaming_handler.get_performance_stats()
    print(f"\nGenerated {stats['tokens_generated']} tokens at {stats['tokens_per_second']:.2f} tokens/sec")
    print(f"Batch size history: {stats['batch_size_history']}")
    
    print("\n" + "-" * 80)
    
    # Example 2: Ultra-low precision with 2-bit quantization
    print("\nExample 2: Ultra-low precision (2-bit) for maximum memory efficiency")
    model_path = "models/llama-7b"
    config = {
        "quantization": "int2",  # Use 2-bit quantization
        "optimize_kv_cache": True,
        "latency_optimized": True,
        "adaptive_batch_size": True,
        "prefill_optimized": True
    }
    
    # Create handler with 2-bit precision
    ultra_low_handler = WebGPUStreamingInference(model_path, config)
    
    # Generate with streaming
    prompt = "Explain how 2-bit quantization works to reduce memory usage for LLMs"
    print(f"\nGenerating response for: '{prompt}'")
    result = ultra_low_handler.generate(
        prompt,
        max_tokens=30,
        temperature=0.7,
        callback=token_callback
    )
    
    # Print performance stats
    stats = ultra_low_handler.get_performance_stats()
    print(f"\nGenerated {stats['tokens_generated']} tokens at {stats['tokens_per_second']:.2f} tokens/sec")
    print(f"Batch size history: {stats['batch_size_history']}")
    
    print("\n" + "-" * 80)
    
    # Example 3: Ultra-low precision with 3-bit quantization
    print("\nExample 3: Ultra-low precision (3-bit) for balance of quality and memory efficiency")
    model_path = "models/llama-7b"
    config = {
        "quantization": "int3",  # Use 3-bit quantization
        "optimize_kv_cache": True,
        "latency_optimized": True,
        "adaptive_batch_size": True,
        "prefill_optimized": True
    }
    
    # Create handler with 3-bit precision
    balanced_handler = WebGPUStreamingInference(model_path, config)
    
    # Generate with streaming
    prompt = "Compare 2-bit, 3-bit, and 4-bit quantization for LLMs in terms of quality and memory usage"
    print(f"\nGenerating response for: '{prompt}'")
    result = balanced_handler.generate(
        prompt,
        max_tokens=30,
        temperature=0.7,
        callback=token_callback
    )
    
    # Print performance stats
    stats = balanced_handler.get_performance_stats()
    print(f"\nGenerated {stats['tokens_generated']} tokens at {stats['tokens_per_second']:.2f} tokens/sec")
    print(f"Batch size history: {stats['batch_size_history']}")
    
    # Print comparison of memory efficiency
    print("\nMemory Efficiency Comparison:")
    print("-----------------------------")
    print("  2-bit: 87.5% memory reduction (8x longer context windows)")
    print("  3-bit: 81.25% memory reduction (5.3x longer context windows)")
    print("  4-bit: 75% memory reduction (4x longer context windows)")