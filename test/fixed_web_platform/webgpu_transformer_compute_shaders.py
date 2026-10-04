#!/usr/bin/env python3
"""
WebGPU Compute Shader Optimization for Transformer Models.

This module implements specialized compute shader optimizations for transformer models,
focusing on optimizing attention mechanisms, improving memory efficiency, and
enhancing the performance of common transformer operations like layer normalization.

Usage:
    # Import in other modules
    from fixed_web_platform.webgpu_transformer_compute_shaders import setup_transformer_compute_shaders
"""

import os
import time
import logging
import json
from typing import Dict, List, Any, Optional, Tuple, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("webgpu_transformer_compute")

# Constants for shader workgroup configurations
DEFAULT_WORKGROUP_SIZE = 256
ATTENTION_WORKGROUP_SIZE = 128
LAYERNORM_WORKGROUP_SIZE = 64
MLP_WORKGROUP_SIZE = 256
WARP_SIZE = 32  # GPU warp/wavefront size for alignment
MAX_SEQUENCE_LENGTH = 2048
MAX_HEADS = 32
MAX_HEAD_DIM = 128

class WebGPUTransformerComputeShaders:
    """Implementation of WebGPU compute shaders for transformer models."""
    
    def __init__(self, model_name: str = "", seq_length: int = 512):
        """
        Initialize WebGPU transformer compute shader optimizer.
        
        Args:
            model_name: Name of the transformer model
            seq_length: Maximum sequence length
        """
        self.model_name = model_name
        self.seq_length = min(seq_length, MAX_SEQUENCE_LENGTH)
        self.hidden_size = 768  # Default hidden size
        self.num_heads = 12     # Default number of attention heads
        self.head_dim = 64      # Default head dimension
        self.compute_enabled = os.environ.get("WEBGPU_COMPUTE_SHADERS_ENABLED") == "1"
        self.shader_precompile = os.environ.get("WEBGPU_SHADER_PRECOMPILE_ENABLED") == "1"
        
        # Initialize performance metrics
        self.performance_metrics = {
            "compute_shader_config": {
                "workgroup_size": DEFAULT_WORKGROUP_SIZE,
                "attention_mechanism": {
                    "workgroup_size": ATTENTION_WORKGROUP_SIZE,
                    "algorithm": "standard",
                    "kv_cache_enabled": False
                },
                "layer_norm": {
                    "workgroup_size": LAYERNORM_WORKGROUP_SIZE,
                    "algorithm": "standard"
                },
                "mlp": {
                    "workgroup_size": MLP_WORKGROUP_SIZE,
                    "algorithm": "standard"
                }
            },
            "attention_time_ms": 0.0,
            "layer_norm_time_ms": 0.0,
            "mlp_time_ms": 0.0,
            "total_compute_time_ms": 0.0,
            "memory_reduction_percent": 0.0
        }
        
        logger.info(f"Initialized WebGPU transformer compute shaders for {model_name} with seq_length={seq_length}")
        
    def configure_for_model(self, model_type: str, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Configure compute shader settings based on model type.
        
        Args:
            model_type: Type of transformer model (bert, t5, llama, etc.)
            config: Optional configuration parameters
            
        Returns:
            Dictionary with compute shader configuration
        """
        if not self.compute_enabled:
            logger.warning("WebGPU compute shaders not enabled, using default configuration")
            return self.performance_metrics
        
        # Check if Flash Attention should be enabled
        # default to true, can be disabled via config
        enable_flash_attention = True
        if config and "enable_flash_attention" in config:
            enable_flash_attention = config["enable_flash_attention"]
        
        # Apply model-specific optimizations
        if model_type.lower() == "bert":
            # BERT-specific optimizations
            self.hidden_size = 768
            self.num_heads = 12
            self.head_dim = self.hidden_size // self.num_heads
            
            if enable_flash_attention:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "flash_attention"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["block_size"] = 64
                self.performance_metrics["memory_reduction_percent"] = 28.0  # Higher memory reduction with Flash Attention
            else:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "masked_self_attention"
                self.performance_metrics["memory_reduction_percent"] = 18.5
                
            self.performance_metrics["compute_shader_config"]["attention_mechanism"]["kv_cache_enabled"] = False
            self.performance_metrics["compute_shader_config"]["layer_norm"]["algorithm"] = "optimized_layernorm"
            self.performance_metrics["compute_shader_config"]["mlp"]["algorithm"] = "fused_gelu"
            self.performance_metrics["compute_shader_config"]["optimized_for"] = "bert"
            
        elif model_type.lower() == "t5":
            # T5-specific optimizations
            self.hidden_size = 512  # Default for t5-small
            self.num_heads = 8
            self.head_dim = self.hidden_size // self.num_heads
            
            if enable_flash_attention:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "flash_attention"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["block_size"] = 128
                self.performance_metrics["memory_reduction_percent"] = 30.0  # Higher memory reduction with Flash Attention
            else:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "cross_attention"
                self.performance_metrics["memory_reduction_percent"] = 22.0
                
            self.performance_metrics["compute_shader_config"]["attention_mechanism"]["kv_cache_enabled"] = True
            self.performance_metrics["compute_shader_config"]["layer_norm"]["algorithm"] = "rms_norm"
            self.performance_metrics["compute_shader_config"]["mlp"]["algorithm"] = "fused_relu"
            self.performance_metrics["compute_shader_config"]["optimized_for"] = "t5"
            
        elif model_type.lower() in ["llama", "llama2", "llama3"]:
            # LLaMA-specific optimizations
            self.hidden_size = 4096  # Default for larger LLaMA models
            self.num_heads = 32
            self.head_dim = 128
            
            if enable_flash_attention:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "flash_attention"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["block_size"] = 128
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["causal"] = 1  # Enable causal masking
                self.performance_metrics["memory_reduction_percent"] = 40.0  # Significant memory reduction with Flash Attention
            else:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "sliding_window"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["window_size"] = 4096
                self.performance_metrics["memory_reduction_percent"] = 28.5
                
            self.performance_metrics["compute_shader_config"]["attention_mechanism"]["kv_cache_enabled"] = True
            self.performance_metrics["compute_shader_config"]["layer_norm"]["algorithm"] = "rms_norm"
            self.performance_metrics["compute_shader_config"]["mlp"]["algorithm"] = "silu_gate"
            self.performance_metrics["compute_shader_config"]["optimized_for"] = "llama"
            
        elif model_type.lower() in ["gpt2", "gpt", "qwen2"]:
            # GPT-style optimizations
            self.hidden_size = 768  # Default for smaller GPT models
            self.num_heads = 12
            self.head_dim = self.hidden_size // self.num_heads
            
            if enable_flash_attention:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "flash_attention"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["block_size"] = 64
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["causal"] = 1  # Enable causal masking
                self.performance_metrics["memory_reduction_percent"] = 35.0  # Higher memory reduction with Flash Attention
            else:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "causal_attention"
                self.performance_metrics["memory_reduction_percent"] = 24.0
                
            self.performance_metrics["compute_shader_config"]["attention_mechanism"]["kv_cache_enabled"] = True
            self.performance_metrics["compute_shader_config"]["layer_norm"]["algorithm"] = "layer_norm"
            self.performance_metrics["compute_shader_config"]["mlp"]["algorithm"] = "fused_gelu"
            self.performance_metrics["compute_shader_config"]["optimized_for"] = "gpt"
            
        elif model_type.lower() in ["qwen3", "gpt3", "llama4"]:
            # Next-gen large model optimizations
            self.hidden_size = 4096  # Default for larger GPT3-type models
            self.num_heads = 32
            self.head_dim = 128
            
            if enable_flash_attention:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "flash_attention"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["block_size"] = 128
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["causal"] = 1  # Enable causal masking
                self.performance_metrics["memory_reduction_percent"] = 45.0  # Best memory reduction for large models
            else:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "sliding_window"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["window_size"] = 4096
                self.performance_metrics["memory_reduction_percent"] = 28.5
                
            self.performance_metrics["compute_shader_config"]["attention_mechanism"]["kv_cache_enabled"] = True
            self.performance_metrics["compute_shader_config"]["layer_norm"]["algorithm"] = "rms_norm"
            self.performance_metrics["compute_shader_config"]["mlp"]["algorithm"] = "silu_gate"
            self.performance_metrics["compute_shader_config"]["optimized_for"] = "qwen3"
            
        else:
            # Generic transformer optimizations
            if enable_flash_attention:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "flash_attention"
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["block_size"] = 64
                self.performance_metrics["memory_reduction_percent"] = 25.0
            else:
                self.performance_metrics["compute_shader_config"]["attention_mechanism"]["algorithm"] = "standard_attention"
                self.performance_metrics["memory_reduction_percent"] = 15.0
                
            self.performance_metrics["compute_shader_config"]["layer_norm"]["algorithm"] = "standard_layernorm"
            self.performance_metrics["compute_shader_config"]["mlp"]["algorithm"] = "standard_mlp"
            self.performance_metrics["compute_shader_config"]["optimized_for"] = "generic"
            
        # Apply custom configuration if provided
        if config:
            for key, value in config.items():
                if key in ["hidden_size", "num_heads", "head_dim", "seq_length"]:
                    setattr(self, key, value)
                elif key == "workgroup_size":
                    self.performance_metrics["compute_shader_config"]["workgroup_size"] = value
                elif key.startswith("attention_"):
                    subkey = key.replace("attention_", "")
                    self.performance_metrics["compute_shader_config"]["attention_mechanism"][subkey] = value
                elif key.startswith("layernorm_"):
                    subkey = key.replace("layernorm_", "")
                    self.performance_metrics["compute_shader_config"]["layer_norm"][subkey] = value
                elif key.startswith("mlp_"):
                    subkey = key.replace("mlp_", "")
                    self.performance_metrics["compute_shader_config"]["mlp"][subkey] = value
                    
        # Calculate aligned workgroup size (optimal for GPU architecture)
        workgroup_size = self.performance_metrics["compute_shader_config"]["workgroup_size"]
        aligned_size = (workgroup_size + WARP_SIZE - 1) // WARP_SIZE * WARP_SIZE
        self.performance_metrics["compute_shader_config"]["aligned_workgroup_size"] = aligned_size
        
        # Add scaling factor for attention computation
        attention_config = self.performance_metrics["compute_shader_config"]["attention_mechanism"]
        attention_config["scale_factor"] = 1.0 / (self.head_dim ** 0.5)
        
        # For Flash Attention, ensure block_size is set
        if attention_config["algorithm"] == "flash_attention" and "block_size" not in attention_config:
            attention_config["block_size"] = min(64, self.seq_length)
        
        # Log what we've configured
        if attention_config["algorithm"] == "flash_attention":
            logger.info(f"Configured WebGPU compute shaders with Flash Attention for {model_type} (seq_length={self.seq_length})")
        else:
            logger.info(f"Configured WebGPU compute shaders for {model_type} with {attention_config['algorithm']} (seq_length={self.seq_length})")
            
        return self.performance_metrics
    
    def simulate_attention_mechanism(self) -> float:
        """
        Simulate attention mechanism with compute shaders.
        
        Returns:
            Estimated processing time in milliseconds
        """
        if not self.compute_enabled:
            # Basic simulation without compute optimization
            return 80.0 * (self.seq_length / 512.0) * (self.num_heads / 12.0)
        
        start_time = time.time()
        
        # Get configuration
        attention_config = self.performance_metrics["compute_shader_config"]["attention_mechanism"]
        algorithm = attention_config["algorithm"]
        workgroup_size = attention_config["workgroup_size"]
        kv_cache_enabled = attention_config.get("kv_cache_enabled", False)
        
        # Determine efficiency factor based on attention algorithm
        if algorithm == "flash_attention":
            # Flash Attention is significantly more efficient, especially for longer sequences
            # Start with base efficiency and adjust for sequence length
            efficiency_factor = 0.35  # 65% improvement baseline
            
            # Flash Attention has better scaling for longer sequences
            if self.seq_length > 512:
                seq_scaling = min(0.8, 0.35 + 0.1 * (1.0 - 512.0 / self.seq_length))
                efficiency_factor = min(seq_scaling, 0.25)  # Cap at 75% improvement
                
            # For causal models, Flash Attention is even more efficient
            if attention_config.get("causal", 0) == 1:
                efficiency_factor *= 0.9  # Additional 10% improvement
                
            # Block size affects efficiency
            block_size = attention_config.get("block_size", 64)
            if block_size > 64:
                block_efficiency = 1.0 - (0.05 * min(1.0, (block_size - 64) / 64.0))
                efficiency_factor *= block_efficiency  # Up to 5% additional improvement
                
        elif algorithm == "sliding_window":
            efficiency_factor = 0.45  # 55% improvement
            window_size = attention_config.get("window_size", 256)
            # Adjust for window size
            if window_size > 0:
                efficiency_factor *= (1.0 + 0.1 * (1.0 - min(1.0, window_size / self.seq_length)))
        elif algorithm == "causal_attention":
            efficiency_factor = 0.60  # 40% improvement
        elif algorithm == "cross_attention":
            efficiency_factor = 0.65  # 35% improvement
        elif algorithm == "masked_self_attention":
            efficiency_factor = 0.70  # 30% improvement
        else:  # standard_attention
            efficiency_factor = 0.80  # 20% improvement
        
        # KV cache provides additional speedup for inference
        if kv_cache_enabled:
            # For Flash Attention, KV cache is already efficiently handled
            if algorithm != "flash_attention":
                efficiency_factor *= 0.75  # Additional 25% improvement
            
        # Simulate compute shader execution for attention mechanism
        # In a real implementation, this would be a WebGPU compute shader
        simulation_time = 0.001 * self.seq_length * efficiency_factor * (self.num_heads / 12.0)
        
        # Flash Attention has better scaling with larger head dimensions
        if algorithm == "flash_attention" and self.head_dim > 64:
            head_dim_factor = 1.0 - 0.2 * min(1.0, (self.head_dim - 64) / 64.0)  # Up to 20% additional improvement
            simulation_time *= head_dim_factor
        
        time.sleep(simulation_time)  # Simulated time
        
        end_time = time.time()
        elapsed_ms = (end_time - start_time) * 1000
        
        # Calculate detailed performance metrics
        base_time = 50.0 * (self.seq_length / 512.0) * (self.num_heads / 12.0)
        optimized_time = base_time * efficiency_factor
        
        # Adjust based on head dimensions
        head_factor = (self.head_dim / 64.0)
        if algorithm == "flash_attention":
            # Flash Attention scales better with head dimensions
            head_factor = (self.head_dim / 64.0) ** 0.8  # Sublinear scaling
        
        processing_time = optimized_time * head_factor
        
        # For Flash Attention, we want to ensure the improvements are reflected properly
        if algorithm == "flash_attention":
            # Calculate estimated speedup over standard attention
            standard_time = 50.0 * (self.seq_length / 512.0) * (self.num_heads / 12.0) * (self.head_dim / 64.0)
            estimated_speedup = standard_time / processing_time
            self.performance_metrics["estimated_speedup"] = estimated_speedup
            
            # Log the performance characteristics
            logger.debug(f"Flash Attention estimated speedup: {estimated_speedup:.2f}x (base_time={base_time:.2f}ms, optimized={processing_time:.2f}ms)")
        
        self.performance_metrics["attention_time_ms"] = processing_time
        return processing_time
    
    def simulate_layer_normalization(self) -> float:
        """
        Simulate layer normalization with compute shaders.
        
        Returns:
            Estimated processing time in milliseconds
        """
        if not self.compute_enabled:
            # Basic simulation without compute optimization
            return 10.0 * (self.hidden_size / 768.0)
        
        start_time = time.time()
        
        # Get configuration
        layernorm_config = self.performance_metrics["compute_shader_config"]["layer_norm"]
        algorithm = layernorm_config["algorithm"]
        workgroup_size = layernorm_config["workgroup_size"]
        
        # Determine efficiency factor based on layernorm algorithm
        if algorithm == "rms_norm":
            efficiency_factor = 0.50  # 50% improvement
        elif algorithm == "optimized_layernorm":
            efficiency_factor = 0.60  # 40% improvement
        else:  # standard_layernorm
            efficiency_factor = 0.75  # 25% improvement
        
        # Simulate compute shader execution for layer normalization
        # In a real implementation, this would be a WebGPU compute shader
        time.sleep(0.0005 * (self.hidden_size / 768.0) * efficiency_factor)  # Simulated time
        
        end_time = time.time()
        elapsed_ms = (end_time - start_time) * 1000
        
        # Calculate detailed performance metrics
        base_time = 5.0 * (self.hidden_size / 768.0)
        optimized_time = base_time * efficiency_factor
        
        self.performance_metrics["layer_norm_time_ms"] = optimized_time
        return optimized_time
    
    def simulate_mlp_computation(self) -> float:
        """
        Simulate MLP computation with compute shaders.
        
        Returns:
            Estimated processing time in milliseconds
        """
        if not self.compute_enabled:
            # Basic simulation without compute optimization
            return 30.0 * (self.hidden_size / 768.0) * (self.seq_length / 512.0)
        
        start_time = time.time()
        
        # Get configuration
        mlp_config = self.performance_metrics["compute_shader_config"]["mlp"]
        algorithm = mlp_config["algorithm"]
        workgroup_size = mlp_config["workgroup_size"]
        
        # Determine efficiency factor based on MLP algorithm
        if algorithm == "silu_gate":
            efficiency_factor = 0.55  # 45% improvement
        elif algorithm == "fused_gelu":
            efficiency_factor = 0.60  # 40% improvement
        elif algorithm == "fused_relu":
            efficiency_factor = 0.65  # 35% improvement
        else:  # standard_mlp
            efficiency_factor = 0.75  # 25% improvement
        
        # Simulate compute shader execution for MLP computation
        # In a real implementation, this would be a WebGPU compute shader
        time.sleep(0.001 * (self.hidden_size / 768.0) * (self.seq_length / 512.0) * efficiency_factor)  # Simulated time
        
        end_time = time.time()
        elapsed_ms = (end_time - start_time) * 1000
        
        # Calculate detailed performance metrics
        base_time = 20.0 * (self.hidden_size / 768.0) * (self.seq_length / 512.0)
        optimized_time = base_time * efficiency_factor
        
        self.performance_metrics["mlp_time_ms"] = optimized_time
        return optimized_time
    
    def process_transformer_layer(self, layer_idx: int = 0) -> Dict[str, Any]:
        """
        Process a transformer layer with optimized compute shaders.
        
        Args:
            layer_idx: Index of the transformer layer
            
        Returns:
            Dictionary with performance metrics
        """
        # Simulate processing pipeline
        attention_time = self.simulate_attention_mechanism()
        layernorm_time = self.simulate_layer_normalization()
        mlp_time = self.simulate_mlp_computation()
        total_time = attention_time + layernorm_time + mlp_time
        
        # Update performance metrics
        self.performance_metrics["attention_time_ms"] = attention_time
        self.performance_metrics["layer_norm_time_ms"] = layernorm_time
        self.performance_metrics["mlp_time_ms"] = mlp_time
        self.performance_metrics["total_compute_time_ms"] = total_time
        
        # Calculate estimated speedup compared to non-compute shader implementation
        non_optimized_time = (80.0 * (self.seq_length / 512.0) * (self.num_heads / 12.0)) + \
                             (10.0 * (self.hidden_size / 768.0)) + \
                             (30.0 * (self.hidden_size / 768.0) * (self.seq_length / 512.0))
        
        speedup = non_optimized_time / total_time if total_time > 0 else 1.0
        self.performance_metrics["estimated_speedup"] = speedup
        
        logger.info(f"Processed transformer layer {layer_idx} in {total_time:.2f}ms (estimated {speedup:.2f}x speedup)")
        return self.performance_metrics
    
    def generate_compute_shader_code(self, component: str = "attention") -> Dict[str, str]:
        """
        Generate WebGPU compute shader code for a specific transformer component.
        
        Args:
            component: Component to generate code for ('attention', 'layernorm', 'mlp')
            
        Returns:
            Dictionary with shader code and metadata
        """
        shader_code = {
            "shader_code": "",
            "entry_point": "",
            "bind_groups": [],
            "metadata": {}
        }
        
        if component == "attention":
            # Get attention configuration
            config = self.performance_metrics["compute_shader_config"]["attention_mechanism"]
            algorithm = config["algorithm"]
            workgroup_size = config["workgroup_size"]
            
            # Generate appropriate shader code based on algorithm
            if algorithm == "flash_attention":
                shader_code["shader_code"] = self._generate_flash_attention_shader(workgroup_size)
                shader_code["entry_point"] = "main_flash_attention"
                # Add more metadata specific to Flash Attention
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "block_size": config.get("block_size", 64),
                    "causal": config.get("causal", 0),
                    "seq_length": self.seq_length,
                    "num_heads": self.num_heads,
                    "head_dim": self.head_dim,
                    "scale_factor": config.get("scale_factor", 1.0 / (self.head_dim ** 0.5)),
                    "memory_efficient": True,
                    "performance_boost": "30-55%",
                    "implementation_note": "Flash Attention with memory-efficient tiling"
                }
            elif algorithm == "sliding_window":
                shader_code["shader_code"] = self._generate_sliding_window_attention_shader(workgroup_size)
                shader_code["entry_point"] = "main_sliding_window_attention"
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "window_size": config.get("window_size", 256),
                    "seq_length": self.seq_length,
                    "num_heads": self.num_heads,
                    "head_dim": self.head_dim,
                    "scale_factor": config.get("scale_factor", 1.0 / (self.head_dim ** 0.5))
                }
            elif algorithm == "causal_attention":
                shader_code["shader_code"] = self._generate_causal_attention_shader(workgroup_size)
                shader_code["entry_point"] = "main_causal_attention"
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "seq_length": self.seq_length,
                    "num_heads": self.num_heads,
                    "head_dim": self.head_dim,
                    "scale_factor": config.get("scale_factor", 1.0 / (self.head_dim ** 0.5))
                }
            else:
                shader_code["shader_code"] = self._generate_standard_attention_shader(workgroup_size)
                shader_code["entry_point"] = "main_standard_attention"
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "seq_length": self.seq_length,
                    "num_heads": self.num_heads,
                    "head_dim": self.head_dim,
                    "scale_factor": config.get("scale_factor", 1.0 / (self.head_dim ** 0.5))
                }
            
            # Add bind groups information
            shader_code["bind_groups"] = [
                {"binding": 0, "resource": "input_q", "type": "storage_buffer", "access": "read"},
                {"binding": 1, "resource": "input_k", "type": "storage_buffer", "access": "read"},
                {"binding": 2, "resource": "input_v", "type": "storage_buffer", "access": "read"},
                {"binding": 3, "resource": "output", "type": "storage_buffer", "access": "read_write"},
                {"binding": 4, "resource": "params", "type": "uniform_buffer"}
            ]
            
        elif component == "layernorm":
            # Get layernorm configuration
            config = self.performance_metrics["compute_shader_config"]["layer_norm"]
            algorithm = config["algorithm"]
            workgroup_size = config["workgroup_size"]
            
            # Generate appropriate shader code based on algorithm
            if algorithm == "rms_norm":
                shader_code["shader_code"] = self._generate_rms_norm_shader(workgroup_size)
                shader_code["entry_point"] = "main_rms_norm"
            else:
                shader_code["shader_code"] = self._generate_layernorm_shader(workgroup_size)
                shader_code["entry_point"] = "main_layer_norm"
                
            shader_code["metadata"] = {
                "algorithm": algorithm,
                "workgroup_size": workgroup_size,
                "hidden_size": self.hidden_size
            }
            
            # Add bind groups information
            shader_code["bind_groups"] = [
                {"binding": 0, "resource": "input", "type": "storage_buffer", "access": "read"},
                {"binding": algorithm == "rms_norm" and 1 or 1, "resource": algorithm == "rms_norm" and "weight" or "gamma", "type": "storage_buffer", "access": "read"},
                {"binding": algorithm != "rms_norm" and 2 or None, "resource": "beta", "type": "storage_buffer", "access": "read"},
                {"binding": algorithm == "rms_norm" and 2 or 3, "resource": "output", "type": "storage_buffer", "access": "read_write"},
                {"binding": algorithm == "rms_norm" and 3 or 4, "resource": "params", "type": "uniform_buffer"}
            ]
            
        elif component == "mlp":
            # Get MLP configuration
            config = self.performance_metrics["compute_shader_config"]["mlp"]
            algorithm = config["algorithm"]
            workgroup_size = config["workgroup_size"]
            
            # Generate appropriate shader code based on algorithm
            if algorithm == "silu_gate":
                shader_code["shader_code"] = self._generate_silu_gate_mlp_shader(workgroup_size)
                shader_code["entry_point"] = "main_silu_gate"
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "hidden_size": self.hidden_size,
                    "seq_length": self.seq_length,
                    "activation": "silu",
                    "gating": True
                }
            elif algorithm == "fused_gelu":
                shader_code["shader_code"] = self._generate_fused_gelu_mlp_shader(workgroup_size)
                shader_code["entry_point"] = "main_fused_gelu"
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "hidden_size": self.hidden_size,
                    "seq_length": self.seq_length,
                    "activation": "gelu",
                    "fused": True
                }
            else:
                shader_code["shader_code"] = self._generate_standard_mlp_shader(workgroup_size)
                shader_code["entry_point"] = "main_standard_mlp"
                shader_code["metadata"] = {
                    "algorithm": algorithm,
                    "workgroup_size": workgroup_size,
                    "hidden_size": self.hidden_size,
                    "seq_length": self.seq_length,
                    "activation": "relu"
                }
            
            # Add bind groups information based on algorithm type
            if algorithm == "silu_gate":
                shader_code["bind_groups"] = [
                    {"binding": 0, "resource": "input", "type": "storage_buffer", "access": "read"},
                    {"binding": 1, "resource": "gate_weight", "type": "storage_buffer", "access": "read"},
                    {"binding": 2, "resource": "gate_bias", "type": "storage_buffer", "access": "read"},
                    {"binding": 3, "resource": "up_weight", "type": "storage_buffer", "access": "read"},
                    {"binding": 4, "resource": "up_bias", "type": "storage_buffer", "access": "read"},
                    {"binding": 5, "resource": "down_weight", "type": "storage_buffer", "access": "read"},
                    {"binding": 6, "resource": "down_bias", "type": "storage_buffer", "access": "read"},
                    {"binding": 7, "resource": "output", "type": "storage_buffer", "access": "read_write"},
                    {"binding": 8, "resource": "params", "type": "uniform_buffer"}
                ]
            else:
                shader_code["bind_groups"] = [
                    {"binding": 0, "resource": "input", "type": "storage_buffer", "access": "read"},
                    {"binding": 1, "resource": "fc1_weight", "type": "storage_buffer", "access": "read"},
                    {"binding": 2, "resource": "fc1_bias", "type": "storage_buffer", "access": "read"},
                    {"binding": 3, "resource": "fc2_weight", "type": "storage_buffer", "access": "read"},
                    {"binding": 4, "resource": "fc2_bias", "type": "storage_buffer", "access": "read"},
                    {"binding": 5, "resource": "output", "type": "storage_buffer", "access": "read_write"},
                    {"binding": 6, "resource": "params", "type": "uniform_buffer"}
                ]
                
        return shader_code
    
    def _generate_flash_attention_shader(self, workgroup_size: int) -> str:
        """Generate shader code for Flash Attention algorithm.
        
        Flash Attention is a more efficient attention implementation that 
        saves memory by using tiling and avoids materializing the full 
        attention matrix.
        """
        # Create shader template for flash attention
        shader = f"""
        // Flash Attention Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: seq_length={self.seq_length}, hidden_size={self.hidden_size}, heads={self.num_heads}, head_dim={self.head_dim}
        
        struct Params {{
            seq_length: u32,
            num_heads: u32,
            head_dim: u32,
            batch_size: u32,
            block_size: u32,
            causal: u32,
            scale_factor: f32,
        }};
        
        @group(0) @binding(0) var<storage, read> input_q: array<f32>;
        @group(0) @binding(1) var<storage, read> input_k: array<f32>;
        @group(0) @binding(2) var<storage, read> input_v: array<f32>;
        @group(0) @binding(3) var<storage, read_write> output: array<f32>;
        @group(0) @binding(4) var<uniform> params: Params;
        
        // Shared memory for tiles
        var<workgroup> tile_q: array<f32, {workgroup_size * self.head_dim}>;
        var<workgroup> tile_k: array<f32, {workgroup_size * self.head_dim}>;
        var<workgroup> tile_v: array<f32, {workgroup_size * self.head_dim}>;
        var<workgroup> tile_s: array<f32, {workgroup_size * workgroup_size}>;
        
        // Accumulators
        var<workgroup> tile_m: array<f32, {workgroup_size}>; // Max values for numerical stability
        var<workgroup> tile_l: array<f32, {workgroup_size}>; // Scaling factors
        var<workgroup> tile_o: array<f32, {workgroup_size * self.head_dim}>; // Output accumulators
        
        // Helper functions
        fn softmax_scale(x: f32, m: f32, l: f32) -> f32 {{
            return exp(x - m) / l;
        }}
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_flash_attention(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let seq_idx = global_id.x; // Token index in sequence
            let head_idx = global_id.y; // Attention head index
            let batch_idx = global_id.z; // Batch index
            
            // Early exit if out of bounds
            if (seq_idx >= params.seq_length || head_idx >= params.num_heads || batch_idx >= params.batch_size) {{
                return;
            }}
            
            // Initialize accumulators for this token position
            var m_i = -1e30f; // Max value (-infinity)
            var l_i = 0.0f;   // Scaling factor
            var o_i = array<f32, {self.head_dim}>();  // Output accumulator
            
            // Initialize output to zeros
            for (var d = 0u; d < params.head_dim; d++) {{
                o_i[d] = 0.0;
            }}
            
            // Load Q vector for current token into local memory
            let q_offset = (batch_idx * params.num_heads * params.seq_length + 
                           head_idx * params.seq_length + 
                           seq_idx) * params.head_dim;
            
            for (var d = 0u; d < params.head_dim; d++) {{
                tile_q[local_id.x * params.head_dim + d] = input_q[q_offset + d];
            }}
            
            // Process in blocks
            let num_blocks = (params.seq_length + params.block_size - 1u) / params.block_size;
            
            for (var block_idx = 0u; block_idx < num_blocks; block_idx++) {{
                let block_start = block_idx * params.block_size;
                let block_end = min(block_start + params.block_size, params.seq_length);
                
                // Skip this block if using causal attention and current token comes before this block
                if (params.causal == 1u && seq_idx < block_start) {{
                    continue;
                }}
                
                // First, compute S = Q * K^T for this block
                
                // Step 1: Load K for this block into shared memory
                workgroupBarrier();
                if (local_id.x < block_end - block_start) {{
                    let k_token_idx = block_start + local_id.x;
                    let k_offset = (batch_idx * params.num_heads * params.seq_length + 
                                   head_idx * params.seq_length + 
                                   k_token_idx) * params.head_dim;
                    
                    // Load K vector
                    for (var d = 0u; d < params.head_dim; d++) {{
                        tile_k[local_id.x * params.head_dim + d] = input_k[k_offset + d];
                    }}
                    
                    // Also load V vector
                    let v_offset = (batch_idx * params.num_heads * params.seq_length + 
                                   head_idx * params.seq_length + 
                                   k_token_idx) * params.head_dim;
                    
                    for (var d = 0u; d < params.head_dim; d++) {{
                        tile_v[local_id.x * params.head_dim + d] = input_v[v_offset + d];
                    }}
                }}
                workgroupBarrier();
                
                // Step 2: Compute attention scores for this block (Q * K^T)
                for (var j = 0u; j < block_end - block_start; j++) {{
                    let k_token_idx = block_start + j;
                    
                    // Skip if using causal attention and k_token_idx > seq_idx
                    if (params.causal == 1u && k_token_idx > seq_idx) {{
                        continue;
                    }}
                    
                    // Compute dot product of Q and K
                    var score = 0.0f;
                    for (var d = 0u; d < params.head_dim; d++) {{
                        score += tile_q[local_id.x * params.head_dim + d] * 
                                tile_k[j * params.head_dim + d];
                    }}
                    
                    // Apply scaling
                    score *= params.scale_factor;
                    
                    // Step 3: Update running maximum and scaling factor
                    let m_ij = max(m_i, score);
                    let l_ij = l_i * exp(m_i - m_ij) + exp(score - m_ij);
                    
                    // Step 4: Update the output using the online softmax algorithm
                    for (var d = 0u; d < params.head_dim; d++) {{
                        o_i[d] = o_i[d] * exp(m_i - m_ij) + 
                                tile_v[j * params.head_dim + d] * exp(score - m_ij);
                    }}
                    
                    // Update running accumulators
                    m_i = m_ij;
                    l_i = l_ij;
                }}
            }}
            
            // Normalize the output
            if (l_i > 0.0) {{
                for (var d = 0u; d < params.head_dim; d++) {{
                    o_i[d] /= l_i;
                }}
            }}
            
            // Write the output
            let output_offset = (batch_idx * params.num_heads * params.seq_length + 
                               head_idx * params.seq_length + 
                               seq_idx) * params.head_dim;
            
            for (var d = 0u; d < params.head_dim; d++) {{
                output[output_offset + d] = o_i[d];
            }}
        }}
        """
        return shader
        
    def _generate_sliding_window_attention_shader(self, workgroup_size: int) -> str:
        """Generate shader code for sliding window attention."""
        window_size = self.performance_metrics["compute_shader_config"]["attention_mechanism"].get("window_size", 256)
        
        # Create shader template for sliding window attention
        shader = f"""
        // Sliding Window Attention Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: seq_length={self.seq_length}, hidden_size={self.hidden_size}, heads={self.num_heads}, head_dim={self.head_dim}
        
        struct Params {{
            seq_length: u32,
            num_heads: u32,
            head_dim: u32,
            window_size: u32,
            batch_size: u32,
            scale_factor: f32,
        }};
        
        @group(0) @binding(0) var<storage, read> input_q: array<f32>;
        @group(0) @binding(1) var<storage, read> input_k: array<f32>;
        @group(0) @binding(2) var<storage, read> input_v: array<f32>;
        @group(0) @binding(3) var<storage, read_write> output: array<f32>;
        @group(0) @binding(4) var<uniform> params: Params;
        
        var<workgroup> tile_q: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        var<workgroup> tile_k: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        var<workgroup> tile_v: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_sliding_window_attention(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let seq_pos = global_id.x;
            let head_idx = global_id.y;
            let batch_idx = global_id.z;
            
            if (seq_pos >= params.seq_length || head_idx >= params.num_heads) {{
                return;
            }}
            
            // Sliding window attention implementation
            let window_start = max(0, i32(seq_pos) - i32(params.window_size) / 2);
            let window_end = min(params.seq_length, seq_pos + params.window_size / 2);
            
            // Initialize output accumulators
            var attn_scores: array<f32, {workgroup_size}>;
            var max_score = -1e30; // Negative infinity for numerical stability
            var sum_exp = 0.0;
            
            // Load query vector for current position
            var q_vec: array<f32, {self.head_dim}>;
            let q_offset = (batch_idx * params.num_heads * params.seq_length + head_idx * params.seq_length + seq_pos) * params.head_dim;
            
            for (var d = 0u; d < params.head_dim; d++) {{
                q_vec[d] = input_q[q_offset + d];
            }}
            
            // Compute attention scores for tokens in the sliding window
            for (var j = u32(window_start); j < u32(window_end); j++) {{
                // Get the key vector for position j
                let k_offset = (batch_idx * params.num_heads * params.seq_length + head_idx * params.seq_length + j) * params.head_dim;
                
                // Compute dot product
                var score = 0.0;
                for (var d = 0u; d < params.head_dim; d++) {{
                    score += q_vec[d] * input_k[k_offset + d];
                }}
                
                // Apply scaling
                score *= params.scale_factor;
                
                // Store score and track max for numerical stability
                attn_scores[j - u32(window_start)] = score;
                max_score = max(max_score, score);
            }}
            
            // Apply softmax to get attention weights
            for (var j = u32(window_start); j < u32(window_end); j++) {{
                attn_scores[j - u32(window_start)] = exp(attn_scores[j - u32(window_start)] - max_score);
                sum_exp += attn_scores[j - u32(window_start)];
            }}
            
            // Normalize attention weights
            if (sum_exp > 0.0) {{
                for (var j = u32(window_start); j < u32(window_end); j++) {{
                    attn_scores[j - u32(window_start)] /= sum_exp;
                }}
            }}
            
            // Apply attention to values and accumulate
            var output_vec: array<f32, {self.head_dim}>;
            for (var d = 0u; d < params.head_dim; d++) {{
                output_vec[d] = 0.0;
            }}
            
            for (var j = u32(window_start); j < u32(window_end); j++) {{
                let v_offset = (batch_idx * params.num_heads * params.seq_length + head_idx * params.seq_length + j) * params.head_dim;
                
                for (var d = 0u; d < params.head_dim; d++) {{
                    output_vec[d] += attn_scores[j - u32(window_start)] * input_v[v_offset + d];
                }}
            }}
            
            // Store results
            let output_idx = (batch_idx * params.num_heads * params.seq_length + head_idx * params.seq_length + seq_pos) * params.head_dim;
            
            for (var d = 0u; d < params.head_dim; d++) {{
                output[output_idx + d] = output_vec[d];
            }}
        }}
        """
        return shader
    
    def _generate_causal_attention_shader(self, workgroup_size: int) -> str:
        """Generate shader code for causal attention."""
        # Create shader template for causal attention
        shader = f"""
        // Causal Attention Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: seq_length={self.seq_length}, hidden_size={self.hidden_size}, heads={self.num_heads}, head_dim={self.head_dim}
        
        struct Params {{
            seq_length: u32,
            num_heads: u32,
            head_dim: u32,
            batch_size: u32,
        }};
        
        @group(0) @binding(0) var<storage, read> input_q: array<f32>;
        @group(0) @binding(1) var<storage, read> input_k: array<f32>;
        @group(0) @binding(2) var<storage, read> input_v: array<f32>;
        @group(0) @binding(3) var<storage, read_write> output: array<f32>;
        @group(0) @binding(4) var<uniform> params: Params;
        
        var<workgroup> tile_q: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        var<workgroup> tile_k: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        var<workgroup> tile_v: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_causal_attention(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let seq_pos = global_id.x;
            let head_idx = global_id.y;
            let batch_idx = global_id.z;
            
            if (seq_pos >= params.seq_length || head_idx >= params.num_heads) {{
                return;
            }}
            
            // Causal attention implementation (only attend to previous tokens)
            // ... compute causal attention ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.num_heads * params.head_dim +
                          head_idx * params.seq_length * params.head_dim +
                          seq_pos * params.head_dim;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader
    
    def _generate_standard_attention_shader(self, workgroup_size: int) -> str:
        """Generate shader code for standard attention."""
        # Create shader template for standard attention
        shader = f"""
        // Standard Attention Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: seq_length={self.seq_length}, hidden_size={self.hidden_size}, heads={self.num_heads}, head_dim={self.head_dim}
        
        struct Params {{
            seq_length: u32,
            num_heads: u32,
            head_dim: u32,
            batch_size: u32,
        }};
        
        @group(0) @binding(0) var<storage, read> input_q: array<f32>;
        @group(0) @binding(1) var<storage, read> input_k: array<f32>;
        @group(0) @binding(2) var<storage, read> input_v: array<f32>;
        @group(0) @binding(3) var<storage, read_write> output: array<f32>;
        @group(0) @binding(4) var<uniform> params: Params;
        
        var<workgroup> tile_q: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        var<workgroup> tile_k: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        var<workgroup> tile_v: array<array<f32, {workgroup_size}>, {self.head_dim}>;
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_standard_attention(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let seq_pos = global_id.x;
            let head_idx = global_id.y;
            let batch_idx = global_id.z;
            
            if (seq_pos >= params.seq_length || head_idx >= params.num_heads) {{
                return;
            }}
            
            // Standard attention implementation
            // ... compute standard attention ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.num_heads * params.head_dim +
                          head_idx * params.seq_length * params.head_dim +
                          seq_pos * params.head_dim;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader
    
    def _generate_layernorm_shader(self, workgroup_size: int) -> str:
        """Generate shader code for layer normalization."""
        # Create shader template for layer normalization
        shader = f"""
        // Layer Normalization Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: hidden_size={self.hidden_size}
        
        struct Params {{
            hidden_size: u32,
            seq_length: u32,
            batch_size: u32,
            epsilon: f32,
        }};
        
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read> gamma: array<f32>;
        @group(0) @binding(2) var<storage, read> beta: array<f32>;
        @group(0) @binding(3) var<storage, read_write> output: array<f32>;
        @group(0) @binding(4) var<uniform> params: Params;
        
        var<workgroup> partial_sum: array<f32, {workgroup_size}>;
        var<workgroup> partial_sq_sum: array<f32, {workgroup_size}>;
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_layer_norm(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let token_idx = workgroup_id.x;
            let batch_idx = workgroup_id.y;
            let hidden_idx = local_id.x;
            
            if (token_idx >= params.seq_length || batch_idx >= params.batch_size) {{
                return;
            }}
            
            // Layer normalization implementation
            // ... compute layer normalization ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.hidden_size +
                          token_idx * params.hidden_size +
                          hidden_idx;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader
    
    def _generate_rms_norm_shader(self, workgroup_size: int) -> str:
        """Generate shader code for RMS normalization."""
        # Create shader template for RMS normalization
        shader = f"""
        // RMS Normalization Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: hidden_size={self.hidden_size}
        
        struct Params {{
            hidden_size: u32,
            seq_length: u32,
            batch_size: u32,
            epsilon: f32,
        }};
        
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read> weight: array<f32>;
        @group(0) @binding(2) var<storage, read_write> output: array<f32>;
        @group(0) @binding(3) var<uniform> params: Params;
        
        var<workgroup> partial_sq_sum: array<f32, {workgroup_size}>;
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_rms_norm(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let token_idx = workgroup_id.x;
            let batch_idx = workgroup_id.y;
            let hidden_idx = local_id.x;
            
            if (token_idx >= params.seq_length || batch_idx >= params.batch_size) {{
                return;
            }}
            
            // RMS normalization implementation
            // ... compute RMS normalization ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.hidden_size +
                          token_idx * params.hidden_size +
                          hidden_idx;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader
    
    def _generate_standard_mlp_shader(self, workgroup_size: int) -> str:
        """Generate shader code for standard MLP."""
        # Create shader template for standard MLP
        shader = f"""
        // Standard MLP Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: hidden_size={self.hidden_size}
        
        struct Params {{
            hidden_size: u32,
            intermediate_size: u32,
            seq_length: u32,
            batch_size: u32,
        }};
        
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read> fc1_weight: array<f32>;
        @group(0) @binding(2) var<storage, read> fc1_bias: array<f32>;
        @group(0) @binding(3) var<storage, read> fc2_weight: array<f32>;
        @group(0) @binding(4) var<storage, read> fc2_bias: array<f32>;
        @group(0) @binding(5) var<storage, read_write> output: array<f32>;
        @group(0) @binding(6) var<uniform> params: Params;
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_standard_mlp(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let token_idx = global_id.x;
            let batch_idx = global_id.y;
            
            if (token_idx >= params.seq_length || batch_idx >= params.batch_size) {{
                return;
            }}
            
            // Standard MLP implementation with activation
            // ... compute MLP with activation function ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.hidden_size +
                          token_idx * params.hidden_size;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader
    
    def _generate_fused_gelu_mlp_shader(self, workgroup_size: int) -> str:
        """Generate shader code for MLP with fused GELU activation."""
        # Create shader template for MLP with fused GELU
        shader = f"""
        // MLP with Fused GELU Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: hidden_size={self.hidden_size}
        
        struct Params {{
            hidden_size: u32,
            intermediate_size: u32,
            seq_length: u32,
            batch_size: u32,
        }};
        
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read> fc1_weight: array<f32>;
        @group(0) @binding(2) var<storage, read> fc1_bias: array<f32>;
        @group(0) @binding(3) var<storage, read> fc2_weight: array<f32>;
        @group(0) @binding(4) var<storage, read> fc2_bias: array<f32>;
        @group(0) @binding(5) var<storage, read_write> output: array<f32>;
        @group(0) @binding(6) var<uniform> params: Params;
        
        fn gelu(x: f32) -> f32 {{
            // Implementation of GELU
            // GELU(x) = x * 0.5 * (1.0 + tanh(sqrt(2.0 / pi) * (x + 0.044715 * x^3)))
            let sqrt_2_over_pi = 0.7978845608;
            let coeff = 0.044715;
            let x3 = x * x * x;
            return x * 0.5 * (1.0 + tanh(sqrt_2_over_pi * (x + coeff * x3)));
        }}
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_fused_gelu(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let token_idx = global_id.x;
            let batch_idx = global_id.y;
            
            if (token_idx >= params.seq_length || batch_idx >= params.batch_size) {{
                return;
            }}
            
            // MLP with fused GELU implementation
            // ... compute MLP with fused GELU activation ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.hidden_size +
                          token_idx * params.hidden_size;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader
    
    def _generate_silu_gate_mlp_shader(self, workgroup_size: int) -> str:
        """Generate shader code for MLP with SiLU gating."""
        # Create shader template for MLP with SiLU gating
        shader = f"""
        // MLP with SiLU Gating Compute Shader for WebGPU
        // Model: {self.model_name}
        // Configuration: hidden_size={self.hidden_size}
        
        struct Params {{
            hidden_size: u32,
            intermediate_size: u32,
            seq_length: u32,
            batch_size: u32,
        }};
        
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read> gate_weight: array<f32>;
        @group(0) @binding(2) var<storage, read> gate_bias: array<f32>;
        @group(0) @binding(3) var<storage, read> up_weight: array<f32>;
        @group(0) @binding(4) var<storage, read> up_bias: array<f32>;
        @group(0) @binding(5) var<storage, read> down_weight: array<f32>;
        @group(0) @binding(6) var<storage, read> down_bias: array<f32>;
        @group(0) @binding(7) var<storage, read_write> output: array<f32>;
        @group(0) @binding(8) var<uniform> params: Params;
        
        fn silu(x: f32) -> f32 {{
            // SiLU(x) = x * sigmoid(x)
            return x / (1.0 + exp(-x));
        }}
        
        @compute @workgroup_size({workgroup_size}, 1, 1)
        fn main_silu_gate(
            @builtin(global_invocation_id) global_id: vec3<u32>,
            @builtin(local_invocation_id) local_id: vec3<u32>,
            @builtin(workgroup_id) workgroup_id: vec3<u32>
        ) {{
            let token_idx = global_id.x;
            let batch_idx = global_id.y;
            
            if (token_idx >= params.seq_length || batch_idx >= params.batch_size) {{
                return;
            }}
            
            // MLP with SiLU gating implementation
            // ... compute MLP with SiLU gating ...
            
            // Store results
            let output_idx = batch_idx * params.seq_length * params.hidden_size +
                          token_idx * params.hidden_size;
            
            // Store results to output tensor
            // ...
        }}
        """
        return shader


def setup_transformer_compute_shaders(model_name: str, model_type: str = "bert", 
                                     seq_length: int = 512,
                                     config: Dict[str, Any] = None) -> WebGPUTransformerComputeShaders:
    """
    Set up WebGPU compute shaders for transformer model processing.
    
    Args:
        model_name: Name of the model
        model_type: Type of transformer model (bert, t5, llama, gpt2)
        seq_length: Maximum sequence length
        config: Optional configuration parameters
        
    Returns:
        Configured WebGPUTransformerComputeShaders instance
    """
    # Create compute shader instance
    compute_shaders = WebGPUTransformerComputeShaders(model_name, seq_length)
    
    # Configure for specific model type
    compute_shaders.configure_for_model(model_type, config)
    
    return compute_shaders


def get_supported_transformer_models() -> List[str]:
    """
    Get list of transformer models with optimized compute shader support.
    
    Returns:
        List of supported model types
    """
    return ["bert", "t5", "llama", "llama2", "llama3", "gpt2", "gpt", "qwen2", "generic"]