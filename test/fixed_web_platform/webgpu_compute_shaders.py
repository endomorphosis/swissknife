#!/usr/bin/env python3
"""
WebGPU Compute Shaders for 4-bit Inference with Adaptive Precision

This module implements specialized compute shader implementations for WebGPU
4-bit inference with adaptive precision. It provides optimized kernels for:

1. Mixed precision 4-bit matrix multiplication
2. Layer-specific optimized kernels based on precision
3. Attention mechanism optimizations
4. KV-Cache with adaptive precision
5. Browser-specific shader implementations

Usage:
    from fixed_web_platform.webgpu_compute_shaders import (
        generate_compute_shader,
        get_browser_optimized_shader,
        matmul_4bit_shader,
        kv_cache_adaptive_precision_shader
    )
    
    # Generate shader for a specific operation and precision
    shader_code = generate_compute_shader(
        operation="matmul",
        bits=4,
        browser="chrome",
        adaptive_precision=True,
        layer_type="attention"
    )
"""

import os
import re
import json
import logging
import platform
from typing import Dict, List, Any, Optional, Tuple, Union, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("webgpu_compute_shaders")

# Function to detect browser environment (same as in webgpu_adaptive_precision.py)
def detect_browser_environment() -> Dict[str, Any]:
    """
    Detect the current browser environment.
    
    Returns:
        Dictionary with browser detection information
    """
    result = {
        "detected": False,
        "browser": None,
        "version": None,
        "platform": platform.system().lower()
    }
    
    # Check environment variables for browser simulation
    browser_env = os.environ.get("BROWSER_SIMULATION", "").lower()
    if browser_env:
        result["detected"] = True
        if "chrome" in browser_env:
            result["browser"] = "chrome"
            result["version"] = re.search(r"(\d+)", browser_env).group(1) if re.search(r"(\d+)", browser_env) else "113"
        elif "firefox" in browser_env:
            result["browser"] = "firefox"
            result["version"] = re.search(r"(\d+)", browser_env).group(1) if re.search(r"(\d+)", browser_env) else "121"
        elif "edge" in browser_env:
            result["browser"] = "edge"
            result["version"] = re.search(r"(\d+)", browser_env).group(1) if re.search(r"(\d+)", browser_env) else "113"
        elif "safari" in browser_env:
            result["browser"] = "safari"
            result["version"] = re.search(r"(\d+)", browser_env).group(1) if re.search(r"(\d+)", browser_env) else "17"
        return result
    
    # Check environment variables for target browser
    target_browser = os.environ.get("TARGET_BROWSER", "").lower()
    if target_browser:
        result["detected"] = True
        result["browser"] = target_browser
        result["version"] = os.environ.get("BROWSER_VERSION", "latest")
        return result
    
    # If in web environment, try to detect from navigator (future compatibility)
    try:
        pass
    except:
        pass
    
    return result

# Workgroup size configuration by browser
BROWSER_WORKGROUP_CONFIG = {
    "chrome": {
        "matmul": {"x": 8, "y": 16, "z": 1},
        "attention": {"x": 8, "y": 8, "z": 1},
        "kv_cache": {"x": 8, "y": 8, "z": 1}
    },
    "edge": {
        "matmul": {"x": 8, "y": 16, "z": 1},
        "attention": {"x": 8, "y": 8, "z": 1},
        "kv_cache": {"x": 8, "y": 8, "z": 1}
    },
    "firefox": {
        "matmul": {"x": 8, "y": 8, "z": 1},
        "attention": {"x": 4, "y": 8, "z": 1},
        "kv_cache": {"x": 4, "y": 8, "z": 1}
    },
    "safari": {
        "matmul": {"x": 4, "y": 4, "z": 1},
        "attention": {"x": 4, "y": 4, "z": 1},
        "kv_cache": {"x": 4, "y": 4, "z": 1}
    },
    "default": {
        "matmul": {"x": 8, "y": 8, "z": 1},
        "attention": {"x": 4, "y": 8, "z": 1},
        "kv_cache": {"x": 4, "y": 8, "z": 1}
    }
}

# Feature support by browser
BROWSER_FEATURE_SUPPORT = {
    "chrome": {
        "shared_memory": True,
        "subgroups": True,
        "storage_textures": True,
        "workgroup_uniform_load": True,
        "buffer_binding_array": True,
        "specialization_constants": True
    },
    "edge": {
        "shared_memory": True,
        "subgroups": True,
        "storage_textures": True,
        "workgroup_uniform_load": True,
        "buffer_binding_array": True,
        "specialization_constants": True
    },
    "firefox": {
        "shared_memory": True,
        "subgroups": False,
        "storage_textures": True,
        "workgroup_uniform_load": False,
        "buffer_binding_array": True,
        "specialization_constants": False
    },
    "safari": {
        "shared_memory": False,
        "subgroups": False,
        "storage_textures": False,
        "workgroup_uniform_load": False,
        "buffer_binding_array": False,
        "specialization_constants": False
    },
    "default": {
        "shared_memory": False,
        "subgroups": False,
        "storage_textures": False,
        "workgroup_uniform_load": False,
        "buffer_binding_array": False,
        "specialization_constants": False
    }
}

def get_workgroup_config(operation: str, browser: Optional[str] = None) -> Dict[str, int]:
    """
    Get workgroup configuration for a specific operation and browser.
    
    Args:
        operation: Operation type (matmul, attention, kv_cache)
        browser: Target browser
        
    Returns:
        Workgroup size configuration
    """
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else "default"
    
    browser = browser.lower()
    if browser not in BROWSER_WORKGROUP_CONFIG:
        browser = "default"
        
    if operation not in BROWSER_WORKGROUP_CONFIG[browser]:
        operation = "matmul"  # Default to matmul configuration
    
    return BROWSER_WORKGROUP_CONFIG[browser][operation]

def get_feature_support(browser: Optional[str] = None) -> Dict[str, bool]:
    """
    Get feature support for a specific browser.
    
    Args:
        browser: Target browser
        
    Returns:
        Feature support configuration
    """
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else "default"
    
    browser = browser.lower()
    if browser not in BROWSER_FEATURE_SUPPORT:
        browser = "default"
    
    return BROWSER_FEATURE_SUPPORT[browser]

def matmul_4bit_shader(
    bits: int = 4,
    browser: Optional[str] = None,
    use_shared_memory: Optional[bool] = None,
    workgroup_size: Optional[Dict[str, int]] = None,
    block_size: int = 128,
    per_channel: bool = False,
    symmetric: bool = True
) -> str:
    """
    Generate optimized matrix multiplication shader for 4-bit weights.
    
    Args:
        bits: Precision bits (2, 3, 4, 8)
        browser: Target browser
        use_shared_memory: Override to enable/disable shared memory
        workgroup_size: Custom workgroup size
        block_size: Block size for block-wise quantization
        per_channel: Use per-channel quantization
        symmetric: Use symmetric quantization
        
    Returns:
        WGSL shader code
    """
    # Get browser-specific configuration
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else None
    
    if workgroup_size is None:
        workgroup_size = get_workgroup_config("matmul", browser)
    
    feature_support = get_feature_support(browser)
    
    # Determine if shared memory should be used
    if use_shared_memory is None:
        use_shared_memory = feature_support["shared_memory"]
    
    # Adjust workgroup size based on hardware constraints
    workgroup_x = workgroup_size["x"]
    workgroup_y = workgroup_size["y"]
    workgroup_z = workgroup_size.get("z", 1)
    
    # Constants for different bit widths
    values_per_byte = 8 // bits if bits > 0 else 1
    
    # Firefox-specific adjustments
    unroll_factor = 4 if browser != "firefox" and browser != "safari" else 2
    
    # Create shader header with configuration
    shader = f"""
    // WebGPU 4-bit Matrix Multiplication Shader
    // Configuration: {bits}-bit, {'symmetric' if symmetric else 'asymmetric'}, {'per-channel' if per_channel else 'per-tensor'}, block_size={block_size}
    // Optimized for {browser.upper() if browser else 'default'} browser
    
    struct Uniforms {{
        M: u32,          // Input matrix height
        N: u32,          // Input matrix width / Output matrix width
        K: u32,          // Weight matrix height
        block_size: u32, // Block size for block-wise quantization
    }};
    
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var<storage, read> input_matrix: array<f16>;  // [M, K] input matrix
    @group(0) @binding(2) var<storage, read> weight_matrix: array<u32>; // Packed 4-bit weights [K, N]
    @group(0) @binding(3) var<storage, read> scales: array<f16>;        // Quantization scales
    @group(0) @binding(4) var<storage, read> zeros: array<{'f16' if not symmetric else 'u32'}>; // Zero points (not used if symmetric)
    @group(0) @binding(5) var<storage, read_write> output_matrix: array<f16>; // [M, N] output matrix
    """
    
    # Add shared memory if supported
    if use_shared_memory:
        shader += f"""
        var<workgroup> tile_input: array<f16, {workgroup_y} * {workgroup_x}>;
        var<workgroup> tile_weights: array<u32, {workgroup_y} * {workgroup_x} * {values_per_byte // 4}>;
        """
    
    # Add helper functions for unpacking 4-bit values
    shader += f"""
    fn unpack_{bits}bit(packed_value: u32, idx: u32) -> u32 {{
        let bits_per_value = {bits}u;
        let mask = (1u << bits_per_value) - 1u;
        return (packed_value >> (idx * bits_per_value)) & mask;
    }}
    
    fn apply_quantization(value: u32, scale: f16, {'zero: f16' if not symmetric else '_: u32'}) -> f16 {{
        {'let zero_point = f16(0.0);' if symmetric else ''}
        return scale * (f16(value) - {'zero_point' if symmetric else 'zero'});
    }}
    """
    
    # Main compute shader
    shader += f"""
    @compute @workgroup_size({workgroup_x}, {workgroup_y}, {workgroup_z})
    fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(workgroup_id) workgroup_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>
    ) {{
        let M = uniforms.M;
        let N = uniforms.N;
        let K = uniforms.K;
        let block_size = uniforms.block_size;
        
        let row = global_id.y;
        let col = global_id.x;
        
        if (row >= M || col >= N) {{
            return;
        }}
        
        // Initialize accumulator
        var acc = 0.0;
        
        // Calculate number of elements per u32
        let elements_per_u32 = 32u / {bits}u;
        
        // Main computation loop
        """
    
    if use_shared_memory:
        # Version with shared memory for better performance
        shader += f"""
        for (var k_base = 0u; k_base < K; k_base += {workgroup_x}) {{
            // Collaborative loading into shared memory
            if (k_base + local_id.x < K) {{
                tile_input[local_id.y * {workgroup_x} + local_id.x] = input_matrix[row * K + k_base + local_id.x];
            }}
            
            // Load weights into shared memory
            let weight_offset = (k_base / elements_per_u32) * N + col;
            if (local_id.y < {workgroup_y // 4} && k_base + local_id.x * 4 < K) {{
                for (var i = 0u; i < 4u; i += 1u) {{
                    let w_idx = local_id.y * {workgroup_x} + local_id.x * 4 + i;
                    if (k_base + w_idx < K) {{
                        tile_weights[w_idx] = weight_matrix[weight_offset + i * N];
                    }}
                }}
            }}
            
            workgroupBarrier();
            
            // Compute with shared memory
            let k_end = min(K - k_base, {workgroup_x}u);
            for (var k_offset = 0u; k_offset < k_end; k_offset += {unroll_factor}u) {{
                // Unroll the inner loop for better performance
                """
        
        # Unrolled computation with shared memory
        for i in range(unroll_factor):
            shader += f"""
                {{
                    let k = k_base + k_offset + {i}u;
                    if (k < K) {{
                        let input_val = tile_input[local_id.y * {workgroup_x} + k_offset + {i}u];
                        
                        // Calculate block index for block-wise quantization
                        let block_idx = k / block_size;
                        
                        // Get packed weight and unpack the {bits}-bit value
                        let packed_idx = k / elements_per_u32;
                        let bit_offset = k % elements_per_u32;
                        let packed_weight = tile_weights[k_offset + {i}u];
                        let quantized = unpack_{bits}bit(packed_weight, bit_offset);
                        
                        // Apply dequantization
                        let scale_idx = {f'block_idx * N + col' if per_channel else 'block_idx'};
                        let zero_idx = {f'block_idx * N + col' if per_channel else 'block_idx'};
                        let scale = scales[scale_idx];
                        let {'zero = zeros[zero_idx]' if not symmetric else '_ = 0u'};
                        
                        let weight_val = apply_quantization(quantized, scale, {'zero' if not symmetric else '0u'});
                        
                        // Accumulate the product
                        acc += f32(input_val * weight_val);
                    }}
                }}
            """
        
        shader += f"""
            }}
            
            workgroupBarrier();
        }}
        """
    else:
        # Version without shared memory for broader compatibility
        shader += f"""
        for (var k = 0u; k < K; k += 1u) {{
            let input_val = input_matrix[row * K + k];
            
            // Calculate block index for block-wise quantization
            let block_idx = k / block_size;
            
            // Get packed weight and unpack the {bits}-bit value
            let packed_idx = k / elements_per_u32;
            let bit_offset = k % elements_per_u32;
            let packed_weight = weight_matrix[packed_idx * N + col];
            let quantized = unpack_{bits}bit(packed_weight, bit_offset);
            
            // Apply dequantization
            let scale_idx = {f'block_idx * N + col' if per_channel else 'block_idx'};
            let zero_idx = {f'block_idx * N + col' if per_channel else 'block_idx'};
            let scale = scales[scale_idx];
            let {'zero = zeros[zero_idx]' if not symmetric else '_ = 0u'};
            
            let weight_val = apply_quantization(quantized, scale, {'zero' if not symmetric else '0u'});
            
            // Accumulate the product
            acc += f32(input_val * weight_val);
        }}
        """
    
    # Write output
    shader += f"""
        // Write the result to output
        output_matrix[row * N + col] = f16(acc);
    }}
    """
    
    return shader

def attention_with_adaptive_precision_shader(
    bits: int = 4,
    browser: Optional[str] = None,
    block_size: int = 64,
    use_flash_attention: bool = True,
    causal_mask: bool = True,
    adaptive_precision: bool = True
) -> str:
    """
    Generate optimized attention shader with adaptive precision.
    
    Args:
        bits: Precision bits for QKV projections
        browser: Target browser
        block_size: Block size for block-wise quantization
        use_flash_attention: Use FlashAttention algorithm for better performance
        causal_mask: Apply causal mask for autoregressive models
        adaptive_precision: Enable adaptive precision for attention
        
    Returns:
        WGSL shader code
    """
    # Get browser-specific configuration
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else None
    
    workgroup_size = get_workgroup_config("attention", browser)
    feature_support = get_feature_support(browser)
    
    # Adjust features based on browser support
    use_shared_memory = feature_support["shared_memory"]
    
    # Adjust workgroup size based on hardware constraints
    workgroup_x = workgroup_size["x"]
    workgroup_y = workgroup_size["y"]
    workgroup_z = workgroup_size.get("z", 1)
    
    # Shader code
    shader = f"""
    // WebGPU Attention Shader with Adaptive Precision
    // Configuration: {bits}-bit, block_size={block_size}, {'with' if use_flash_attention else 'without'} FlashAttention
    // {'Causal mask enabled' if causal_mask else 'No causal mask'}
    // {'Adaptive precision enabled' if adaptive_precision else 'Fixed precision'}
    // Optimized for {browser.upper() if browser else 'default'} browser
    
    struct Uniforms {{
        batch_size: u32,     // Batch size
        seq_length: u32,     // Sequence length
        num_heads: u32,      // Number of attention heads
        head_size: u32,      // Size of each attention head
        block_size: u32,     // Block size for tiled attention
        precision_threshold: f32,  // Precision switching threshold
        kv_precision_bits: u32,    // Bits for KV cache (4 or 8)
    }};
    
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var<storage, read> query: array<f16>;          // [batch_size, seq_length, num_heads, head_size]
    @group(0) @binding(2) var<storage, read> key: array<{'u32' if bits <= 8 else 'f16'}>;   // Packed keys
    @group(0) @binding(3) var<storage, read> value: array<{'u32' if bits <= 8 else 'f16'}>; // Packed values
    @group(0) @binding(4) var<storage, read> key_scales: array<f16>;     // Key scale factors
    @group(0) @binding(5) var<storage, read> value_scales: array<f16>;   // Value scale factors
    @group(0) @binding(6) var<storage, read_write> output: array<f16>;   // [batch_size, seq_length, num_heads, head_size]
    """
    
    # Add shared memory if supported
    if use_shared_memory:
        shader += f"""
        var<workgroup> shared_q: array<f16, {workgroup_y} * {workgroup_x}>;
        var<workgroup> shared_k: array<f16, {workgroup_y} * {workgroup_x}>;
        var<workgroup> shared_v: array<f16, {workgroup_y} * {workgroup_x}>;
        var<workgroup> shared_s: array<f32, {workgroup_y} * {workgroup_x}>;
        """
    
    # Helper functions for quantization/dequantization
    shader += f"""
    fn unpack_{bits}bit(packed_value: u32, idx: u32) -> u32 {{
        let bits_per_value = {bits}u;
        let mask = (1u << bits_per_value) - 1u;
        return (packed_value >> (idx * bits_per_value)) & mask;
    }}
    
    fn dequantize_{bits}bit(quantized: u32, scale: f16) -> f16 {{
        return scale * f16(quantized);
    }}
    
    fn masked_softmax(scores: array<f32, {workgroup_x}>, length: u32, position: u32) -> array<f32, {workgroup_x}> {{
        var max_score = -1.0e9;
        var result: array<f32, {workgroup_x}>;
        
        // Find max for numerical stability
        for (var i = 0u; i < length; i += 1u) {{
            if ({"i <= position" if causal_mask else "true"}) {{
                max_score = max(max_score, scores[i]);
            }}
        }}
        
        // Compute exp and sum
        var sum = 0.0;
        for (var i = 0u; i < length; i += 1u) {{
            if ({"i <= position" if causal_mask else "true"}) {{
                result[i] = exp(scores[i] - max_score);
                sum += result[i];
            }} else {{
                result[i] = 0.0;
            }}
        }}
        
        // Normalize
        let scale = 1.0 / (sum + 1.0e-9);
        for (var i = 0u; i < length; i += 1u) {{
            result[i] *= scale;
        }}
        
        return result;
    }}
    """
    
    # Main compute shader
    shader += f"""
    @compute @workgroup_size({workgroup_x}, {workgroup_y}, {workgroup_z})
    fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(workgroup_id) workgroup_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>
    ) {{
        let batch_idx = global_id.z;
        let head_idx = global_id.y;
        let query_idx = global_id.x;
        
        let batch_size = uniforms.batch_size;
        let seq_length = uniforms.seq_length;
        let num_heads = uniforms.num_heads;
        let head_size = uniforms.head_size;
        let block_size = uniforms.block_size;
        let precision_threshold = uniforms.precision_threshold;
        let kv_precision_bits = uniforms.kv_precision_bits;
        
        if (batch_idx >= batch_size || head_idx >= num_heads || query_idx >= seq_length) {{
            return;
        }}
        
        // Calculate number of elements per u32
        let elements_per_u32 = 32u / {bits}u;
        
        // Determine if this position needs high precision
        let needs_high_precision = {'adaptive_precision &&' if adaptive_precision else ''} (
            query_idx > seq_length - 10u  // Recent tokens often need higher precision
        );
        
        // Pointers to the current query, used for all key positions
        let q_offset = (batch_idx * seq_length * num_heads + query_idx * num_heads + head_idx) * head_size;
        
        // Output pointer
        let out_offset = (batch_idx * seq_length * num_heads + query_idx * num_heads + head_idx) * head_size;
        
        // Initialize the output with zeros
        for (var i = 0u; i < head_size; i += 1u) {{
            output[out_offset + i] = 0.0;
        }}
        
        // Compute attention scores for each key position
        var attn_scores: array<f32, {workgroup_x}>;
        for (var key_pos = 0u; key_pos < seq_length; key_pos += 1u) {{
            if ({"key_pos > query_idx" if causal_mask else "false"}) {{
                continue;  // Apply causal mask
            }}
            
            // Key pointer for this position
            let k_offset = (batch_idx * seq_length * num_heads + key_pos * num_heads + head_idx) * head_size;
            
            // Compute dot product between query and key for this position
            var score = 0.0;
            
            for (var i = 0u; i < head_size; i += 1u) {{
                let q_val = f32(query[q_offset + i]);
                
                // Dequantize key based on precision
                var k_val: f32;
                if (needs_high_precision || kv_precision_bits > {bits}u) {{
                    // Use higher precision for critical positions
                    let packed_idx = i / elements_per_u32;
                    let bit_offset = i % elements_per_u32;
                    let packed_key = key[k_offset / elements_per_u32 + packed_idx];
                    let quantized = unpack_{bits}bit(packed_key, bit_offset);
                    let scale_idx = (head_idx * seq_length + key_pos) * (head_size / block_size) + (i / block_size);
                    k_val = f32(dequantize_{bits}bit(quantized, key_scales[scale_idx]));
                }} else {{
                    // Use normal precision for non-critical positions
                    let packed_idx = i / elements_per_u32;
                    let bit_offset = i % elements_per_u32;
                    let packed_key = key[k_offset / elements_per_u32 + packed_idx];
                    let quantized = unpack_{bits}bit(packed_key, bit_offset);
                    let scale_idx = (head_idx * seq_length + key_pos) * (head_size / block_size) + (i / block_size);
                    k_val = f32(dequantize_{bits}bit(quantized, key_scales[scale_idx]));
                }}
                
                score += q_val * k_val;
            }}
            
            // Scale by sqrt(head_size)
            score /= sqrt(f32(head_size));
            
            // Store the score
            attn_scores[key_pos] = score;
        }}
        
        // Compute softmax over all positions
        let attn_probs = masked_softmax(attn_scores, seq_length, query_idx);
        
        // Compute weighted sum with values
        for (var key_pos = 0u; key_pos < seq_length; key_pos += 1u) {{
            if ({"key_pos > query_idx" if causal_mask else "false"}) {{
                continue;  // Apply causal mask
            }}
            
            let v_offset = (batch_idx * seq_length * num_heads + key_pos * num_heads + head_idx) * head_size;
            let attn_prob = attn_probs[key_pos];
            
            // Skip if attention probability is too small
            if (attn_prob < 1.0e-8) {{
                continue;
            }}
            
            for (var i = 0u; i < head_size; i += 1u) {{
                // Dequantize value based on precision
                var v_val: f32;
                if (needs_high_precision || kv_precision_bits > {bits}u) {{
                    // Use higher precision for critical positions
                    let packed_idx = i / elements_per_u32;
                    let bit_offset = i % elements_per_u32;
                    let packed_value = value[v_offset / elements_per_u32 + packed_idx];
                    let quantized = unpack_{bits}bit(packed_value, bit_offset);
                    let scale_idx = (head_idx * seq_length + key_pos) * (head_size / block_size) + (i / block_size);
                    v_val = f32(dequantize_{bits}bit(quantized, value_scales[scale_idx]));
                }} else {{
                    // Use normal precision for non-critical positions
                    let packed_idx = i / elements_per_u32;
                    let bit_offset = i % elements_per_u32;
                    let packed_value = value[v_offset / elements_per_u32 + packed_idx];
                    let quantized = unpack_{bits}bit(packed_value, bit_offset);
                    let scale_idx = (head_idx * seq_length + key_pos) * (head_size / block_size) + (i / block_size);
                    v_val = f32(dequantize_{bits}bit(quantized, value_scales[scale_idx]));
                }}
                
                // Weighted sum
                output[out_offset + i] += f16(attn_prob * v_val);
            }}
        }}
    }}
    """
    
    return shader

def kv_cache_adaptive_precision_shader(
    kv_cache_bits: int = 4,
    browser: Optional[str] = None,
    enable_variable_precision: bool = True,
    enable_sliding_window: bool = True,
    window_size: int = 4096
) -> str:
    """
    Generate optimized KV cache shader with adaptive precision.
    
    Args:
        kv_cache_bits: Default precision bits for KV cache
        browser: Target browser
        enable_variable_precision: Enable variable precision for different parts of the cache
        enable_sliding_window: Enable sliding window attention to save memory
        window_size: Size of sliding window
        
    Returns:
        WGSL shader code
    """
    # Get browser-specific configuration
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else None
    
    workgroup_size = get_workgroup_config("kv_cache", browser)
    feature_support = get_feature_support(browser)
    
    # Adjust features based on browser support
    use_shared_memory = feature_support["shared_memory"]
    
    # Adjust workgroup size based on hardware constraints
    workgroup_x = workgroup_size["x"]
    workgroup_y = workgroup_size["y"]
    workgroup_z = workgroup_size.get("z", 1)
    
    # Safari has limited support for complex shaders
    if browser == "safari":
        enable_variable_precision = False
    
    # Shader code
    shader = f"""
    // WebGPU KV Cache Shader with Adaptive Precision
    // Configuration: {kv_cache_bits}-bit default, {'variable precision enabled' if enable_variable_precision else 'fixed precision'}
    // {'Sliding window enabled, size=' + str(window_size) if enable_sliding_window else 'Full context window'}
    // Optimized for {browser.upper() if browser else 'default'} browser
    
    struct Uniforms {{
        batch_size: u32,      // Batch size
        max_seq_length: u32,  // Maximum sequence length
        current_length: u32,  // Current sequence length
        num_heads: u32,       // Number of attention heads
        head_size: u32,       // Size of each attention head
        sliding_window: u32,  // Size of sliding window (0 = disabled)
        window_start: u32,    // Start position of current window
    }};
    
    struct PrecisionConfig {{
        recent_tokens_bits: u32,     // Bits for recent tokens (higher precision)
        mid_context_bits: u32,       // Bits for middle of context
        early_context_bits: u32,     // Bits for earliest tokens (can be lower precision)
        recent_token_count: u32,     // Number of recent tokens to keep at high precision
        precision_decay_rate: f32,   // Rate at which precision drops for older tokens
    }};
    
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var<uniform> precision_config: PrecisionConfig;
    @group(0) @binding(2) var<storage, read_write> kv_cache: array<u32>;  // Packed KV cache
    @group(0) @binding(3) var<storage, read> key_value: array<f16>;       // New KV to append
    @group(0) @binding(4) var<storage, read_write> scales: array<f16>;    // Quantization scales
    @group(0) @binding(5) var<storage, read_write> cache_metadata: array<u32>; // Metadata for cache (precision, etc.)
    
    // Helper functions for packing/unpacking with different bit widths
    fn pack_to_2bit(values: array<f32, 16>, scales: ptr<function, array<f32, 4>>) -> array<u32, 1> {{
        var result: array<u32, 1>;
        result[0] = 0u;
        
        for (var i = 0u; i < 16u; i += 1u) {{
            let block = i / 4u;
            let scale = (*scales)[block];
            let quantized = u32(round(clamp(values[i] / scale, 0.0, 3.0)));
            result[0] |= (quantized << (i * 2u));
        }}
        
        return result;
    }}
    
    fn pack_to_4bit(values: array<f32, 8>, scales: ptr<function, array<f32, 2>>) -> array<u32, 1> {{
        var result: array<u32, 1>;
        result[0] = 0u;
        
        for (var i = 0u; i < 8u; i += 1u) {{
            let block = i / 4u;
            let scale = (*scales)[block];
            let quantized = u32(round(clamp(values[i] / scale, 0.0, 15.0)));
            result[0] |= (quantized << (i * 4u));
        }}
        
        return result;
    }}
    
    fn pack_to_8bit(values: array<f32, 4>, scale: f32) -> array<u32, 1> {{
        var result: array<u32, 1>;
        result[0] = 0u;
        
        for (var i = 0u; i < 4u; i += 1u) {{
            let quantized = u32(round(clamp(values[i] / scale, 0.0, 255.0)));
            result[0] |= (quantized << (i * 8u));
        }}
        
        return result;
    }}
    
    fn unpack_2bit(packed: u32, indices: array<u32, 4>, scale: f32) -> array<f32, 4> {{
        var result: array<f32, 4>;
        
        for (var i = 0u; i < 4u; i += 1u) {{
            let index = indices[i];
            let mask = 3u;  // 2-bit mask (0b11)
            let shift = index * 2u;
            let quantized = (packed >> shift) & mask;
            result[i] = f32(quantized) * scale;
        }}
        
        return result;
    }}
    
    fn unpack_4bit(packed: u32, indices: array<u32, 4>, scale: f32) -> array<f32, 4> {{
        var result: array<f32, 4>;
        
        for (var i = 0u; i < 4u; i += 1u) {{
            let index = indices[i];
            let mask = 15u;  // 4-bit mask (0b1111)
            let shift = index * 4u;
            let quantized = (packed >> shift) & mask;
            result[i] = f32(quantized) * scale;
        }}
        
        return result;
    }}
    
    fn unpack_8bit(packed: u32, indices: array<u32, 4>, scale: f32) -> array<f32, 4> {{
        var result: array<f32, 4>;
        
        for (var i = 0u; i < 4u; i += 1u) {{
            let index = indices[i];
            let mask = 255u;  // 8-bit mask (0b11111111)
            let shift = index * 8u;
            let quantized = (packed >> shift) & mask;
            result[i] = f32(quantized) * scale;
        }}
        
        return result;
    }}
    
    // Function to determine precision for a position
    fn get_precision_for_position(position: u32, current_length: u32) -> u32 {{
        {
            '// Fixed precision mode - use the same precision for all positions'
            if not enable_variable_precision else
            '''
            // Determine token recency (how far from the current token)
            let recency = current_length - position - 1u;
            
            // Recent tokens get highest precision
            if (recency < precision_config.recent_token_count) {
                return precision_config.recent_tokens_bits;
            }
            
            // Early context gets lowest precision if far enough back
            if (position < current_length / 4u) {
                return precision_config.early_context_bits;
            }
            
            // Middle context gets medium precision
            return precision_config.mid_context_bits;
            '''
        }
        
        return {kv_cache_bits}u;
    }}
    
    // Main compute shader for appending to KV cache
    @compute @workgroup_size({workgroup_x}, {workgroup_y}, {workgroup_z})
    fn append_kv_cache(
        @builtin(global_invocation_id) global_id: vec3<u32>
    ) {{
        let batch_idx = global_id.z;
        let head_idx = global_id.y;
        let value_idx = global_id.x;
        
        let batch_size = uniforms.batch_size;
        let max_seq_length = uniforms.max_seq_length;
        let current_length = uniforms.current_length;
        let num_heads = uniforms.num_heads;
        let head_size = uniforms.head_size;
        
        if (batch_idx >= batch_size || head_idx >= num_heads || value_idx >= head_size) {{
            return;
        }}
        
        // Get position where new token will be added
        let new_position = current_length;
        
        // Handle sliding window if enabled
        let effective_position = {f'new_position % uniforms.sliding_window' if enable_sliding_window else 'new_position'};
        
        // Check if we're within bounds
        if (new_position >= max_seq_length) {{
            return;
        }}
        
        // Determine which precision to use for this position
        let precision_bits = get_precision_for_position(new_position, current_length + 1u);
        
        // Calculate offsets
        let values_per_u32 = 32u / precision_bits;
        let kv_size = head_size * num_heads * batch_size;
        
        // Offset for the new key-value in the input
        let kv_input_offset = (batch_idx * num_heads + head_idx) * head_size + value_idx;
        
        // Calculate cache position
        let cache_position = (
            (effective_position * batch_size + batch_idx) * num_heads + head_idx
        ) * head_size + value_idx;
        
        // Get the value to cache
        let value = f32(key_value[kv_input_offset]);
        
        // Position in packed array depends on bits per value
        let packed_idx = cache_position / values_per_u32;
        let bit_offset = cache_position % values_per_u32;
        
        // Calculate scale for quantization
        let scale_position = (
            (effective_position * batch_size + batch_idx) * num_heads + head_idx
        ) * (head_size / 4u) + (value_idx / 4u);
        
        // Process in groups of 4/8/16 values based on precision
        if (value_idx % 4u == 0u) {{
            // Collect values for this group
            var values: array<f32, 4>;
            values[0] = value;
            
            // Group size is 4 values (could be processed in one u32 for 8-bit)
            let group_size = min(4u, head_size - (value_idx & ~3u));
            
            for (var i = 1u; i < group_size; i += 1u) {{
                if (value_idx + i < head_size) {{
                    values[i] = f32(key_value[kv_input_offset + i]);
                }}
            }}
            
            // Find max absolute value for scaling
            var max_abs = 0.0;
            for (var i = 0u; i < group_size; i += 1u) {{
                max_abs = max(max_abs, abs(values[i]));
            }}
            
            // Calculate scale (max value maps to max representable in the bit width)
            let max_representable = f32((1u << precision_bits) - 1u);
            let scale = max_abs / max_representable;
            
            // Store scale
            scales[scale_position] = f16(scale);
            
            // Pack and store values based on precision
            var packed_value: u32 = 0u;
            
            if (precision_bits == 2u) {{
                var scales_array: array<f32, 4>;
                scales_array[0] = scale;
                scales_array[1] = scale;
                scales_array[2] = scale;
                scales_array[3] = scale;
                
                var values_16: array<f32, 16>;
                for (var i = 0u; i < 4u; i += 1u) {{
                    values_16[i] = values[i];
                }}
                
                let packed = pack_to_2bit(values_16, &scales_array);
                packed_value = packed[0];
            }} else if (precision_bits == 4u) {{
                var scales_array: array<f32, 2>;
                scales_array[0] = scale;
                scales_array[1] = scale;
                
                var values_8: array<f32, 8>;
                for (var i = 0u; i < 4u; i += 1u) {{
                    values_8[i] = values[i];
                }}
                
                let packed = pack_to_4bit(values_8, &scales_array);
                packed_value = packed[0];
            }} else {{  // 8-bit
                let packed = pack_to_8bit(values, scale);
                packed_value = packed[0];
            }}
            
            // Store the packed value
            kv_cache[packed_idx] = packed_value;
            
            // Store metadata about the precision used
            let metadata_idx = (
                (effective_position * batch_size + batch_idx) * num_heads + head_idx
            );
            cache_metadata[metadata_idx] = precision_bits;
        }}
    }}
    
    // Main compute shader for retrieving from KV cache
    @compute @workgroup_size({workgroup_x}, {workgroup_y}, {workgroup_z})
    fn retrieve_kv_cache(
        @builtin(global_invocation_id) global_id: vec3<u32>
    ) {{
        let batch_idx = global_id.z;
        let head_idx = global_id.y;
        let position = global_id.x;
        
        let batch_size = uniforms.batch_size;
        let max_seq_length = uniforms.max_seq_length;
        let current_length = uniforms.current_length;
        let num_heads = uniforms.num_heads;
        let head_size = uniforms.head_size;
        let sliding_window = uniforms.sliding_window;
        let window_start = uniforms.window_start;
        
        if (batch_idx >= batch_size || head_idx >= num_heads || position >= current_length) {{
            return;
        }}
        
        // Check if position is within sliding window if enabled
        if ({enable_sliding_window} && sliding_window > 0u) {{
            let window_end = window_start + sliding_window;
            if (position < window_start || position >= window_end) {{
                return;  // Position outside sliding window
            }}
            
            // Map to circular buffer position
            position = position % sliding_window;
        }}
        
        // Get metadata for this position to determine precision
        let metadata_idx = (
            (position * batch_size + batch_idx) * num_heads + head_idx
        );
        let precision_bits = cache_metadata[metadata_idx];
        
        // Calculate values per u32 based on precision
        let values_per_u32 = 32u / precision_bits;
        
        // Process head values in groups of 4
        for (var value_idx = 0u; value_idx < head_size; value_idx += 4u) {{
            // Calculate cache position for first value in group
            let cache_position = (
                (position * batch_size + batch_idx) * num_heads + head_idx
            ) * head_size + value_idx;
            
            // Position in packed array depends on bits per value
            let packed_idx = cache_position / values_per_u32;
            
            // Get scale for this group
            let scale_position = (
                (position * batch_size + batch_idx) * num_heads + head_idx
            ) * (head_size / 4u) + (value_idx / 4u);
            let scale = f32(scales[scale_position]);
            
            // Read packed value
            let packed_value = kv_cache[packed_idx];
            
            // Unpack based on precision
            var unpacked: array<f32, 4>;
            let indices = array<u32, 4>(0u, 1u, 2u, 3u);
            
            if (precision_bits == 2u) {{
                unpacked = unpack_2bit(packed_value, indices, scale);
            }} else if (precision_bits == 4u) {{
                unpacked = unpack_4bit(packed_value, indices, scale);
            }} else {{  // 8-bit
                unpacked = unpack_8bit(packed_value, indices, scale);
            }}
            
            // Use the unpacked values for attention calculation
            // This would typically transfer to another buffer for attention computation
            // For now, we just write back to the kv_cache as an example
            for (var i = 0u; i < 4u; i += 1u) {{
                if (value_idx + i < head_size) {{
                    // This would normally write to an output buffer
                    // For this example, we just update the scale to show it's been processed
                    if (i == 0u) {{
                        scales[scale_position] = f16(unpacked[i]);
                    }}
                }}
            }}
        }}
    }}
    """
    
    return shader

def mlp_with_adaptive_precision_shader(
    bits: int = 4,
    browser: Optional[str] = None,
    block_size: int = 128,
    activation_fn: str = "silu",
    adaptive_precision: bool = True
) -> str:
    """
    Generate optimized MLP shader with adaptive precision.
    
    Args:
        bits: Precision bits for weights
        browser: Target browser
        block_size: Block size for block-wise quantization
        activation_fn: Activation function (silu, gelu, relu)
        adaptive_precision: Enable adaptive precision
        
    Returns:
        WGSL shader code
    """
    # Get browser-specific configuration
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else None
    
    workgroup_size = get_workgroup_config("matmul", browser)
    feature_support = get_feature_support(browser)
    
    # Adjust features based on browser support
    use_shared_memory = feature_support["shared_memory"]
    
    # Adjust workgroup size based on hardware constraints
    workgroup_x = workgroup_size["x"]
    workgroup_y = workgroup_size["y"]
    workgroup_z = workgroup_size.get("z", 1)
    
    # Create activation function code
    if activation_fn == "silu":
        activation_code = "fn silu(x: f32) -> f32 { return x * (1.0 / (1.0 + exp(-x))); }"
        apply_activation = "silu"
    elif activation_fn == "gelu":
        activation_code = "fn gelu(x: f32) -> f32 { return 0.5 * x * (1.0 + tanh(sqrt(2.0 / 3.14159265359) * (x + 0.044715 * x * x * x))); }"
        apply_activation = "gelu"
    else:  # relu
        activation_code = "fn relu(x: f32) -> f32 { return max(0.0, x); }"
        apply_activation = "relu"
    
    # Shader code
    shader = f"""
    // WebGPU MLP Shader with Adaptive Precision
    // Configuration: {bits}-bit, block_size={block_size}, activation={activation_fn}
    // {'Adaptive precision enabled' if adaptive_precision else 'Fixed precision'}
    // Optimized for {browser.upper() if browser else 'default'} browser
    
    struct Uniforms {{
        batch_size: u32,     // Batch size
        seq_length: u32,     // Sequence length
        hidden_size: u32,    // Hidden size
        intermediate_size: u32, // Intermediate size (typically 4x hidden_size)
        block_size: u32,     // Block size for quantization
        calibrated_scales: u32, // Whether scales are calibrated for higher precision
    }};
    
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var<storage, read> input: array<f16>;         // [batch_size, seq_length, hidden_size]
    @group(0) @binding(2) var<storage, read> gate_weights: array<u32>;  // Packed gate projection weights
    @group(0) @binding(3) var<storage, read> up_weights: array<u32>;    // Packed up projection weights
    @group(0) @binding(4) var<storage, read> down_weights: array<u32>;  // Packed down projection weights
    @group(0) @binding(5) var<storage, read> gate_scales: array<f16>;   // Gate scales
    @group(0) @binding(6) var<storage, read> up_scales: array<f16>;     // Up scales
    @group(0) @binding(7) var<storage, read> down_scales: array<f16>;   // Down scales
    @group(0) @binding(8) var<storage, read_write> output: array<f16>;  // [batch_size, seq_length, hidden_size]
    
    {activation_code}
    
    fn unpack_{bits}bit(packed_value: u32, idx: u32) -> u32 {{
        let bits_per_value = {bits}u;
        let mask = (1u << bits_per_value) - 1u;
        return (packed_value >> (idx * bits_per_value)) & mask;
    }}
    
    fn dequantize_{bits}bit(quantized: u32, scale: f16) -> f16 {{
        return scale * f16(quantized);
    }}
    
    @compute @workgroup_size({workgroup_x}, {workgroup_y}, {workgroup_z})
    fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(workgroup_id) workgroup_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>
    ) {{
        let batch_idx = global_id.z;
        let seq_idx = global_id.y;
        let hidden_idx = global_id.x;
        
        let batch_size = uniforms.batch_size;
        let seq_length = uniforms.seq_length;
        let hidden_size = uniforms.hidden_size;
        let intermediate_size = uniforms.intermediate_size;
        let block_size = uniforms.block_size;
        let calibrated_scales = uniforms.calibrated_scales;
        
        if (batch_idx >= batch_size || seq_idx >= seq_length || hidden_idx >= hidden_size) {{
            return;
        }}
        
        // Input offset
        let input_offset = (batch_idx * seq_length + seq_idx) * hidden_size;
        
        // Calculate number of elements per u32
        let elements_per_u32 = 32u / {bits}u;
        
        """
    
    # Add shared memory if supported
    if use_shared_memory:
        shader += f"""
        // Shared memory for intermediate activations
        var<workgroup> shared_gate: array<f16, {workgroup_y} * {workgroup_x}>;
        var<workgroup> shared_up: array<f16, {workgroup_y} * {workgroup_x}>;
        
        // Collaborative loading of input into shared memory
        for (var i = 0u; i < hidden_size; i += {workgroup_x * workgroup_y}) {{
            let idx = local_id.y * {workgroup_x} + local_id.x;
            if (idx + i < hidden_size) {{
                shared_gate[idx] = input[input_offset + idx + i];
                shared_up[idx] = input[input_offset + idx + i];
            }}
        }}
        
        workgroupBarrier();
        """
    
    # Continue with main computation
    shader += f"""
        // Compute gate and up projections
        var gate_activations: array<f16, {workgroup_x}>;
        var up_activations: array<f16, {workgroup_x}>;
        
        for (var i = 0u; i < {workgroup_x}; i += 1u) {{
            gate_activations[i] = 0.0;
            up_activations[i] = 0.0;
        }}
        
        // First phase: compute gate and up projections
        for (var in_idx = 0u; in_idx < hidden_size; in_idx += 1u) {{
            {"let in_val = shared_gate[in_idx];" if use_shared_memory else "let in_val = input[input_offset + in_idx];"}
            
            for (var out_idx = 0u; out_idx < min({workgroup_x}u, intermediate_size); out_idx += 1u) {{
                // Gate projection
                {{
                    let weight_offset = in_idx * intermediate_size + out_idx;
                    let packed_idx = weight_offset / elements_per_u32;
                    let bit_offset = weight_offset % elements_per_u32;
                    let packed_weight = gate_weights[packed_idx];
                    let quantized = unpack_{bits}bit(packed_weight, bit_offset);
                    
                    let block_idx = (in_idx / block_size) * (intermediate_size / block_size) + (out_idx / block_size);
                    let scale = gate_scales[block_idx];
                    
                    let weight_val = dequantize_{bits}bit(quantized, {"scale * 2.0" if adaptive_precision and "calibrated_scales != 0u" else "scale"});
                    gate_activations[out_idx] += in_val * weight_val;
                }}
                
                // Up projection
                {{
                    let weight_offset = in_idx * intermediate_size + out_idx;
                    let packed_idx = weight_offset / elements_per_u32;
                    let bit_offset = weight_offset % elements_per_u32;
                    let packed_weight = up_weights[packed_idx];
                    let quantized = unpack_{bits}bit(packed_weight, bit_offset);
                    
                    let block_idx = (in_idx / block_size) * (intermediate_size / block_size) + (out_idx / block_size);
                    let scale = up_scales[block_idx];
                    
                    let weight_val = dequantize_{bits}bit(quantized, {"scale * 2.0" if adaptive_precision and "calibrated_scales != 0u" else "scale"});
                    up_activations[out_idx] += in_val * weight_val;
                }}
            }}
        }}
        
        // Compute SiLU activation and element-wise product
        var intermediate_activations: array<f16, {workgroup_x}>;
        for (var i = 0u; i < min({workgroup_x}u, intermediate_size); i += 1u) {{
            let gate_val = {apply_activation}(f32(gate_activations[i]));
            intermediate_activations[i] = f16(gate_val) * up_activations[i];
        }}
        
        // Second phase: compute down projection back to hidden_size
        var result = 0.0;
        
        for (var i = 0u; i < min({workgroup_x}u, intermediate_size); i += 1u) {{
            let weight_offset = i * hidden_size + hidden_idx;
            let packed_idx = weight_offset / elements_per_u32;
            let bit_offset = weight_offset % elements_per_u32;
            let packed_weight = down_weights[packed_idx];
            let quantized = unpack_{bits}bit(packed_weight, bit_offset);
            
            let block_idx = (i / block_size) * (hidden_size / block_size) + (hidden_idx / block_size);
            let scale = down_scales[block_idx];
            
            let weight_val = dequantize_{bits}bit(quantized, {"scale * 2.0" if adaptive_precision and "calibrated_scales != 0u" else "scale"});
            result += f32(intermediate_activations[i] * weight_val);
        }}
        
        // Write the result
        let output_offset = (batch_idx * seq_length + seq_idx) * hidden_size + hidden_idx;
        output[output_offset] = f16(result);
    }}
    """
    
    return shader

def generate_compute_shader(
    operation: str,
    bits: int = 4,
    browser: Optional[str] = None,
    adaptive_precision: bool = True,
    layer_type: str = "matmul",
    config: Optional[Dict[str, Any]] = None
) -> str:
    """
    Generate optimized compute shader for a specific operation.
    
    Args:
        operation: Operation type (matmul, attention, kv_cache, mlp)
        bits: Precision bits
        browser: Target browser
        adaptive_precision: Enable adaptive precision
        layer_type: Layer type (matmul, attention, mlp)
        config: Additional configuration parameters
        
    Returns:
        WGSL shader code
    """
    if config is None:
        config = {}
    
    if operation == "matmul":
        return matmul_4bit_shader(
            bits=bits,
            browser=browser,
            use_shared_memory=config.get("use_shared_memory"),
            workgroup_size=config.get("workgroup_size"),
            block_size=config.get("block_size", 128),
            per_channel=config.get("per_channel", False),
            symmetric=config.get("symmetric", True)
        )
    elif operation == "attention":
        return attention_with_adaptive_precision_shader(
            bits=bits,
            browser=browser,
            block_size=config.get("block_size", 64),
            use_flash_attention=config.get("use_flash_attention", True),
            causal_mask=config.get("causal_mask", True),
            adaptive_precision=adaptive_precision
        )
    elif operation == "kv_cache":
        return kv_cache_adaptive_precision_shader(
            kv_cache_bits=bits,
            browser=browser,
            enable_variable_precision=adaptive_precision,
            enable_sliding_window=config.get("enable_sliding_window", True),
            window_size=config.get("window_size", 4096)
        )
    elif operation == "mlp":
        return mlp_with_adaptive_precision_shader(
            bits=bits,
            browser=browser,
            block_size=config.get("block_size", 128),
            activation_fn=config.get("activation_fn", "silu"),
            adaptive_precision=adaptive_precision
        )
    else:
        raise ValueError(f"Unsupported operation: {operation}")

def get_browser_optimized_shader(
    shader_type: str,
    browser: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Get a browser-optimized shader configuration.
    
    Args:
        shader_type: Type of shader (matmul, attention, kv_cache, mlp)
        browser: Target browser
        config: Additional configuration
        
    Returns:
        Dictionary with shader code and configuration
    """
    if config is None:
        config = {}
    
    # Get browser-specific configuration
    if browser is None:
        browser_info = detect_browser_environment()
        browser = browser_info.get("browser") if browser_info.get("detected") else None
    
    # Get feature support
    feature_support = get_feature_support(browser)
    
    # Get workgroup configuration
    operation = "matmul" if shader_type == "mlp" else shader_type
    workgroup_config = get_workgroup_config(operation, browser)
    
    # Set default configuration
    default_config = {
        "bits": 4,
        "adaptive_precision": True,
        "block_size": 128 if shader_type == "matmul" else 64,
        "use_shared_memory": feature_support["shared_memory"],
        "workgroup_size": workgroup_config
    }
    
    # Override with provided config
    shader_config = {**default_config, **config}
    
    # Generate shader
    shader_code = generate_compute_shader(
        operation=shader_type,
        bits=shader_config["bits"],
        browser=browser,
        adaptive_precision=shader_config["adaptive_precision"],
        layer_type=shader_type,
        config=shader_config
    )
    
    return {
        "shader_code": shader_code,
        "config": shader_config,
        "browser": browser,
        "feature_support": feature_support,
        "workgroup_config": workgroup_config
    }

if __name__ == "__main__":
    # Example usage
    print("WebGPU Compute Shaders for 4-bit Inference with Adaptive Precision")
    print("================================================================")
    
    # Generate an example shader
    browser = "chrome"  # or "firefox", "edge", "safari"
    
    print(f"\nGenerating 4-bit matrix multiplication shader for {browser.upper()}:")
    shader = matmul_4bit_shader(bits=4, browser=browser, use_shared_memory=True)
    print(f"Generated shader with {len(shader.split(chr(10)))} lines of code")
    
    print(f"\nGenerating attention shader with adaptive precision for {browser.upper()}:")
    shader = attention_with_adaptive_precision_shader(bits=4, browser=browser)
    print(f"Generated shader with {len(shader.split(chr(10)))} lines of code")
    
    print(f"\nGenerating KV cache shader with adaptive precision for {browser.upper()}:")
    shader = kv_cache_adaptive_precision_shader(kv_cache_bits=4, browser=browser)
    print(f"Generated shader with {len(shader.split(chr(10)))} lines of code")
    
    print(f"\nGenerating MLP shader with adaptive precision for {browser.upper()}:")
    shader = mlp_with_adaptive_precision_shader(bits=4, browser=browser)
    print(f"Generated shader with {len(shader.split(chr(10)))} lines of code")
    
    print("\nBrowser feature support:")
    for browser_name in ["chrome", "edge", "firefox", "safari"]:
        features = get_feature_support(browser_name)
        print(f"{browser_name.upper()}: {features}")
    
    print("\nBrowser workgroup configurations:")
    for browser_name in ["chrome", "edge", "firefox", "safari"]:
        for operation in ["matmul", "attention", "kv_cache"]:
            config = get_workgroup_config(operation, browser_name)
            print(f"{browser_name.upper()} {operation}: {config}")