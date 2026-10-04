#!/usr/bin/env python3
"""
WebGPU Adaptive Precision System for 4-bit Inference

This module implements an adaptive precision system for WebGPU 4-bit inference,
enabling dynamic precision adjustment based on runtime conditions:
- Layer-specific precision control (keeping critical layers at higher precision)
- Dynamic precision adjustment based on available memory
- Automatic fallback mechanisms for low-memory environments
- Specialized handling for attention mechanisms

Usage:
    from fixed_web_platform.webgpu_adaptive_precision import (
        WebGPUAdaptivePrecision,
        optimize_model_with_adaptive_precision
    )
    
    # Create adaptive precision controller
    precision_controller = WebGPUAdaptivePrecision(
        default_bits=4,
        critical_layers_bits=8
    )
    
    # Apply to model
    optimized_model = optimize_model_with_adaptive_precision(
        model,
        precision_controller,
        device="webgpu"
    )
"""

import os
import sys
import time
import json
import logging
import platform
import numpy as np
import re
from typing import Dict, List, Any, Optional, Tuple, Union, Callable, Set

# Function to detect browser environment
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
    
    # If in web environment, try to detect from navigator
    # This will only work in actual browser environments, not in node/python
    # Adding this for future compatibility if this code runs in a web context
    try:
        # This would normally be JavaScript, shown here for reference
        # navigator = window.navigator
        # if navigator and navigator.userAgent:
        #    user_agent = navigator.userAgent.lower()
        pass
    except:
        pass
    
    return result

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("webgpu_adaptive_precision")

class WebGPUAdaptivePrecision:
    """Controls adaptive precision for WebGPU inference."""
    
    def __init__(
        self,
        default_bits: int = 4,
        critical_layers_bits: int = 8,
        memory_threshold_mb: int = 3800,
        dynamic_adjustment: bool = True,
        measure_accuracy: bool = True
    ):
        """
        Initialize the WebGPU adaptive precision controller.
        
        Args:
            default_bits: Default quantization bits (2, 3, 4, 8, or 16)
            critical_layers_bits: Bits for critical layers like attention
            memory_threshold_mb: Memory threshold for adaptive precision
            dynamic_adjustment: Enable dynamic precision adjustment
            measure_accuracy: Track and report accuracy impact
        """
        self.default_bits = default_bits
        self.critical_layers_bits = critical_layers_bits
        self.memory_threshold_mb = memory_threshold_mb
        self.dynamic_adjustment = dynamic_adjustment
        self.measure_accuracy = measure_accuracy
        
        # Validate precision settings
        self._validate_precision_settings()
        
        # Layer-specific precision settings
        self.layer_precision = {}
        self.layer_groups = {
            "embedding": {"bits": critical_layers_bits, "priority": 0},
            "attention": {"bits": critical_layers_bits, "priority": 1},
            "mlp": {"bits": default_bits, "priority": 2},
            "norm": {"bits": 16, "priority": 0},  # LayerNorm always at FP16
            "output": {"bits": critical_layers_bits, "priority": 0}
        }
        
        # Runtime tracking
        self.active_precision = self.default_bits
        self.memory_stats = {
            "total_memory_mb": 0,
            "peak_memory_mb": 0,
            "precision_switches": 0,
            "current_precision": self.default_bits,
            "precision_history": []
        }
        
        # Accuracy tracking
        self.accuracy_stats = {
            "baseline_metrics": {},
            "current_metrics": {},
            "degradation": {},
            "layer_impact": {}
        }
        
        # Performance tracking
        self.performance_stats = {
            "baseline_latency_ms": 0,
            "current_latency_ms": 0,
            "speedup": 1.0,
            "memory_reduction": 0.0
        }
        
        logger.info(f"Initialized WebGPU adaptive precision with default={default_bits}-bit, "
                   f"critical layers={critical_layers_bits}-bit")
    
    def set_layer_precision(self, layer_name: str, bits: int, group: Optional[str] = None):
        """
        Set precision for a specific layer.
        
        Args:
            layer_name: Name of the layer
            bits: Precision bits (2, 3, 4, 8, or 16)
            group: Optional layer group for categorization
        """
        self._validate_bits(bits)
        
        self.layer_precision[layer_name] = {
            "bits": bits,
            "group": group,
            "original_bits": bits  # Store original setting for reset
        }
        
        logger.debug(f"Set {layer_name} precision to {bits}-bit")
    
    def get_layer_precision(self, layer_name: str) -> int:
        """
        Get precision for a layer.
        
        Args:
            layer_name: Name of the layer
            
        Returns:
            Precision in bits
        """
        # If we have a specific setting for this layer, use it
        if layer_name in self.layer_precision:
            return self.layer_precision[layer_name]["bits"]
        
        # Otherwise, determine from layer name
        if "embed" in layer_name.lower():
            return self.layer_groups["embedding"]["bits"]
        elif "attention" in layer_name.lower() or "query" in layer_name.lower() or "key" in layer_name.lower() or "value" in layer_name.lower():
            return self.layer_groups["attention"]["bits"]
        elif "mlp" in layer_name.lower() or "ffn" in layer_name.lower() or "feed_forward" in layer_name.lower():
            return self.layer_groups["mlp"]["bits"]
        elif "norm" in layer_name.lower() or "ln" in layer_name.lower():
            return self.layer_groups["norm"]["bits"]
        elif "output" in layer_name.lower() or "lm_head" in layer_name.lower() or "classifier" in layer_name.lower():
            return self.layer_groups["output"]["bits"]
        else:
            return self.default_bits
    
    def create_layer_precision_map(self, model_structure: Dict) -> Dict:
        """
        Create a complete precision map for all layers in a model.
        
        Args:
            model_structure: Dictionary with model structure
            
        Returns:
            Dictionary mapping layer names to precision
        """
        precision_map = {}
        browser_map = {}
        
        # Detect browser information when available
        browser_info = detect_browser_environment()
        if browser_info["detected"]:
            browser_map["browser"] = browser_info["browser"]
            browser_map["version"] = browser_info["version"]
            
            # Add browser-specific precision adjustments
            if browser_info["browser"] == "firefox":
                # Firefox might need some layers at higher precision
                self.layer_groups["attention"]["bits"] = max(self.layer_groups["attention"]["bits"], 8)
            elif browser_info["browser"] == "safari":
                # Safari needs more conservative precision settings
                self.default_bits = max(self.default_bits, 8)
                self.layer_groups["attention"]["bits"] = max(self.layer_groups["attention"]["bits"], 8)
                self.layer_groups["embedding"]["bits"] = max(self.layer_groups["embedding"]["bits"], 16)
        
        # Process embeddings
        if "embeddings" in model_structure:
            for name in model_structure["embeddings"]:
                precision_map[f"embeddings.{name}"] = self.get_layer_precision(f"embeddings.{name}")
        
        # Process layers
        if "layers" in model_structure:
            for layer_idx, layer_info in model_structure["layers"].items():
                if "tensors" in layer_info:
                    for tensor_name in layer_info["tensors"]:
                        full_name = f"layers.{layer_idx}.{tensor_name}"
                        precision_map[full_name] = self.get_layer_precision(full_name)
                        
        # Add browser information to the map if available
        if browser_map:
            precision_map["__browser_info__"] = browser_map
        
        return precision_map
    
    def adjust_precision_for_memory(self, available_memory_mb: float, required_memory_mb: float) -> bool:
        """
        Dynamically adjust precision based on memory constraints.
        
        Args:
            available_memory_mb: Available memory in MB
            required_memory_mb: Required memory for current operation in MB
            
        Returns:
            True if adjustment was made, False otherwise
        """
        if not self.dynamic_adjustment:
            return False
        
        if available_memory_mb >= required_memory_mb:
            # We have enough memory, no adjustment needed
            return False
        
        memory_deficit_mb = required_memory_mb - available_memory_mb
        logger.warning(f"Memory deficit of {memory_deficit_mb:.2f}MB detected, adjusting precision")
        
        # Record initial precision
        original_bits = {name: info["bits"] for name, info in self.layer_precision.items()}
        
        # Adjust precision starting with lowest priority groups
        adjusted = self._lower_precision_by_group_priority(memory_deficit_mb)
        
        if adjusted:
            # Record the precision change
            self.memory_stats["precision_switches"] += 1
            self.memory_stats["precision_history"].append({
                "timestamp": time.time(),
                "memory_deficit_mb": memory_deficit_mb,
                "original_precision": original_bits,
                "new_precision": {name: info["bits"] for name, info in self.layer_precision.items()},
                "available_memory_mb": available_memory_mb,
                "required_memory_mb": required_memory_mb
            })
        
        return adjusted
    
    def estimate_memory_savings(self, current_bits: int, target_bits: int, tensor_size_mb: float) -> float:
        """
        Estimate memory savings from precision reduction.
        
        Args:
            current_bits: Current precision in bits
            target_bits: Target precision in bits
            tensor_size_mb: Tensor size in MB at current precision
            
        Returns:
            Estimated memory savings in MB
        """
        if current_bits <= target_bits:
            return 0.0  # No savings possible
        
        # Adjust for actual storage size (e.g., 4-bit might use 8-bit storage with packing)
        current_storage_bits = 16 if current_bits > 8 else 8 if current_bits > 4 else 8 if current_bits > 2 else 8
        target_storage_bits = 16 if target_bits > 8 else 8 if target_bits > 4 else 8 if target_bits > 2 else 8
        
        # For 4-bit and lower, we need to account for packing
        current_packing = current_storage_bits / current_bits
        target_packing = target_storage_bits / target_bits
        
        # Calculate adjusted sizes
        current_adjusted_size = tensor_size_mb / current_packing if current_bits < 8 else tensor_size_mb
        target_adjusted_size = tensor_size_mb * (target_storage_bits / current_storage_bits) / target_packing if target_bits < 8 else tensor_size_mb * (target_bits / current_bits)
        
        savings = current_adjusted_size - target_adjusted_size
        return max(0.0, savings)  # Ensure non-negative
    
    def reset_to_original_precision(self):
        """Reset all layers to their original precision settings."""
        for layer_name, info in self.layer_precision.items():
            if "original_bits" in info:
                info["bits"] = info["original_bits"]
        
        logger.info("Reset all layers to original precision settings")
    
    def get_memory_usage_estimate(self, model_structure: Dict, precision_map: Optional[Dict] = None) -> Dict:
        """
        Estimate memory usage for a model with current precision settings.
        
        Args:
            model_structure: Dictionary with model structure
            precision_map: Optional precision map (generated if not provided)
            
        Returns:
            Dictionary with memory usage estimates
        """
        if precision_map is None:
            precision_map = self.create_layer_precision_map(model_structure)
        
        total_fp16_mb = 0
        total_optimized_mb = 0
        layer_memory = {}
        
        # Helper function to process a tensor
        def process_tensor(name, shape, dtype):
            nonlocal total_fp16_mb, total_optimized_mb
            
            # Calculate FP16 size
            num_elements = np.prod(shape)
            fp16_size_mb = (num_elements * 2) / (1024 * 1024)  # 2 bytes per element for FP16
            
            # Get precision for this tensor
            bits = precision_map.get(name, self.default_bits)
            
            # Calculate optimized size based on precision
            if bits == 16:
                optimized_size_mb = fp16_size_mb
            elif bits == 8:
                optimized_size_mb = fp16_size_mb / 2  # Half the size
            elif bits == 4:
                optimized_size_mb = fp16_size_mb / 4  # Quarter the size
            elif bits == 3:
                optimized_size_mb = fp16_size_mb / 5.33  # 3 bits is ~5.33x smaller
            elif bits == 2:
                optimized_size_mb = fp16_size_mb / 8  # 8x smaller
            else:
                optimized_size_mb = fp16_size_mb  # Default to no change
            
            # Storage overhead (4-bit values are often stored in 8-bit containers with packing)
            if bits < 8 and bits > 0:
                # Add overhead for storage, though actual implementations may vary
                storage_bits = 8  # Most 4-bit implementations store in 8-bit containers
                packing_factor = storage_bits / bits
                packed_elements = num_elements / packing_factor
                storage_overhead_mb = (packed_elements * (storage_bits / 8)) / (1024 * 1024)
                
                # Some implementations might have extra overhead for indices or lookup tables
                index_overhead_factor = 0.01  # 1% overhead for indices/tables
                index_overhead_mb = fp16_size_mb * index_overhead_factor
                
                optimized_size_mb = storage_overhead_mb + index_overhead_mb
            
            # Update totals
            total_fp16_mb += fp16_size_mb
            total_optimized_mb += optimized_size_mb
            
            # Store layer information
            layer_memory[name] = {
                "fp16_mb": fp16_size_mb,
                "optimized_mb": optimized_size_mb,
                "bits": bits,
                "reduction_percent": (1 - (optimized_size_mb / fp16_size_mb)) * 100 if fp16_size_mb > 0 else 0
            }
        
        # Process embeddings
        if "embeddings" in model_structure:
            for name, info in model_structure["embeddings"].items():
                full_name = f"embeddings.{name}"
                process_tensor(full_name, info["shape"], info["dtype"])
        
        # Process layers
        if "layers" in model_structure:
            for layer_idx, layer_info in model_structure["layers"].items():
                if "tensors" in layer_info:
                    for tensor_name, tensor_info in layer_info["tensors"].items():
                        full_name = f"layers.{layer_idx}.{tensor_name}"
                        process_tensor(full_name, tensor_info["shape"], tensor_info["dtype"])
        
        # Calculate overall reduction
        reduction_mb = total_fp16_mb - total_optimized_mb
        reduction_percent = (reduction_mb / total_fp16_mb) * 100 if total_fp16_mb > 0 else 0
        
        # Update memory stats
        self.memory_stats["total_memory_mb"] = total_optimized_mb
        self.memory_stats["peak_memory_mb"] = max(self.memory_stats["peak_memory_mb"], total_optimized_mb)
        
        # Return detailed memory usage statistics
        return {
            "total_fp16_mb": total_fp16_mb,
            "total_optimized_mb": total_optimized_mb,
            "memory_reduction_mb": reduction_mb,
            "memory_reduction_percent": reduction_percent,
            "layer_memory": layer_memory,
            "precision_counts": self._count_precision_usage(precision_map)
        }
    
    def track_accuracy_impact(self, layer_name: str, baseline_output: Any, quantized_output: Any):
        """
        Track accuracy impact of quantization for a layer.
        
        Args:
            layer_name: Name of the layer
            baseline_output: Output with original precision
            quantized_output: Output with quantized precision
        """
        if not self.measure_accuracy:
            return
        
        # Calculate relative error
        try:
            baseline = np.array(baseline_output)
            quantized = np.array(quantized_output)
            
            if baseline.size == 0 or quantized.size == 0:
                return
            
            # Mean squared error
            if baseline.shape == quantized.shape:
                mse = np.mean((baseline - quantized) ** 2)
                # Mean absolute error
                mae = np.mean(np.abs(baseline - quantized))
                # Max absolute error
                max_err = np.max(np.abs(baseline - quantized))
                # Relative L2 error
                l2_norm = np.sqrt(np.sum(baseline ** 2))
                rel_l2_err = np.sqrt(np.sum((baseline - quantized) ** 2)) / (l2_norm if l2_norm > 0 else 1.0)
                
                # Store metrics
                bits = self.get_layer_precision(layer_name)
                self.accuracy_stats["layer_impact"][layer_name] = {
                    "bits": bits,
                    "mse": float(mse),
                    "mae": float(mae),
                    "max_err": float(max_err),
                    "rel_l2_err": float(rel_l2_err),
                    "output_shape": baseline.shape
                }
                
                logger.debug(f"Layer {layer_name} ({bits}-bit): MSE={mse:.6f}, Rel L2={rel_l2_err:.6f}")
        except Exception as e:
            logger.warning(f"Error calculating accuracy impact for {layer_name}: {e}")
    
    def get_accuracy_report(self) -> Dict:
        """
        Get a comprehensive accuracy impact report.
        
        Returns:
            Dictionary with accuracy statistics
        """
        if not self.measure_accuracy or not self.accuracy_stats["layer_impact"]:
            return {"error": "No accuracy data available"}
        
        # Group by precision
        by_precision = {}
        for layer, stats in self.accuracy_stats["layer_impact"].items():
            bits = stats["bits"]
            if bits not in by_precision:
                by_precision[bits] = []
            by_precision[bits].append({
                "layer": layer,
                **stats
            })
        
        # Calculate aggregate statistics
        precision_stats = {}
        for bits, layers in by_precision.items():
            if not layers:
                continue
                
            avg_mse = np.mean([l["mse"] for l in layers])
            avg_rel_l2 = np.mean([l["rel_l2_err"] for l in layers])
            max_rel_l2 = np.max([l["rel_l2_err"] for l in layers])
            layer_with_max_err = max(layers, key=lambda x: x["rel_l2_err"])["layer"]
            
            precision_stats[bits] = {
                "avg_mse": float(avg_mse),
                "avg_rel_l2_err": float(avg_rel_l2),
                "max_rel_l2_err": float(max_rel_l2),
                "layer_count": len(layers),
                "worst_layer": layer_with_max_err
            }
        
        # Get overall statistics
        all_rel_l2 = [stats["rel_l2_err"] for stats in self.accuracy_stats["layer_impact"].values()]
        if all_rel_l2:
            overall_avg_rel_l2 = float(np.mean(all_rel_l2))
            overall_max_rel_l2 = float(np.max(all_rel_l2))
        else:
            overall_avg_rel_l2 = 0.0
            overall_max_rel_l2 = 0.0
        
        # Layer groups statistics
        group_stats = {}
        for layer, stats in self.accuracy_stats["layer_impact"].items():
            group = self._identify_layer_group(layer)
            if group not in group_stats:
                group_stats[group] = []
            group_stats[group].append(stats)
        
        group_summary = {}
        for group, stats_list in group_stats.items():
            if not stats_list:
                continue
                
            avg_rel_l2 = np.mean([s["rel_l2_err"] for s in stats_list])
            group_summary[group] = {
                "avg_rel_l2_err": float(avg_rel_l2),
                "layer_count": len(stats_list),
                "avg_bits": np.mean([s["bits"] for s in stats_list])
            }
        
        return {
            "overall_stats": {
                "avg_rel_l2_err": overall_avg_rel_l2,
                "max_rel_l2_err": overall_max_rel_l2,
                "measured_layers": len(self.accuracy_stats["layer_impact"])
            },
            "by_precision": precision_stats,
            "by_group": group_summary,
            "measurement_timestamp": time.time()
        }
    
    def optimize_for_target_accuracy(self, target_rel_l2_err: float = 0.01) -> Dict:
        """
        Optimize precision settings to meet a target accuracy.
        
        Args:
            target_rel_l2_err: Target relative L2 error (default: 0.01 = 1%)
            
        Returns:
            Optimized precision map
        """
        if not self.measure_accuracy or not self.accuracy_stats["layer_impact"]:
            return {"error": "No accuracy data available for optimization"}
        
        # Start with all layers at minimum precision
        optimized_precision = {}
        
        # Sort layers by error impact (highest first)
        layers_by_impact = sorted(
            self.accuracy_stats["layer_impact"].items(),
            key=lambda x: x[1]["rel_l2_err"],
            reverse=True
        )
        
        # Prioritize high-impact layers for higher precision
        for layer_name, stats in layers_by_impact:
            current_bits = stats["bits"]
            rel_l2_err = stats["rel_l2_err"]
            
            # If error is already below target, keep current precision
            if rel_l2_err <= target_rel_l2_err:
                optimized_precision[layer_name] = current_bits
                continue
            
            # Otherwise, increase precision
            if current_bits < 4:
                optimized_precision[layer_name] = 4
            elif current_bits < 8:
                optimized_precision[layer_name] = 8
            else:
                optimized_precision[layer_name] = 16
        
        # Apply the optimized precision
        precision_changes = 0
        for layer_name, bits in optimized_precision.items():
            if layer_name in self.layer_precision and self.layer_precision[layer_name]["bits"] != bits:
                self.layer_precision[layer_name]["bits"] = bits
                precision_changes += 1
        
        logger.info(f"Optimized {precision_changes} layers to meet target accuracy of {target_rel_l2_err:.4f}")
        
        return {
            "optimized_precision": optimized_precision,
            "precision_changes": precision_changes,
            "target_rel_l2_err": target_rel_l2_err
        }
    
    def _validate_precision_settings(self):
        """Validate precision settings."""
        valid_bits = [2, 3, 4, 8, 16]
        if self.default_bits not in valid_bits:
            raise ValueError(f"Default bits must be one of {valid_bits}, got {self.default_bits}")
        if self.critical_layers_bits not in valid_bits:
            raise ValueError(f"Critical layers bits must be one of {valid_bits}, got {self.critical_layers_bits}")
    
    def _validate_bits(self, bits: int):
        """Validate that bits value is supported."""
        valid_bits = [2, 3, 4, 8, 16]
        if bits not in valid_bits:
            raise ValueError(f"Bits must be one of {valid_bits}, got {bits}")
    
    def _lower_precision_by_group_priority(self, required_mb: float) -> bool:
        """
        Lower precision of layers by group priority to save memory.
        
        Args:
            required_mb: Required memory savings in MB
            
        Returns:
            True if changes were made, False otherwise
        """
        # Sort layer groups by priority (higher = less important)
        groups_by_priority = sorted(
            self.layer_groups.items(),
            key=lambda x: x[1]["priority"]
        )
        
        # Filter to only include groups that can be reduced further
        reducible_groups = [
            (name, info) for name, info in groups_by_priority
            if info["bits"] > 2  # Can't go lower than 2-bit
        ]
        
        if not reducible_groups:
            logger.warning("No reducible layer groups found, cannot lower precision further")
            return False
        
        # Start reducing precision from lowest priority groups
        changes_made = False
        for group_name, group_info in reducible_groups:
            current_bits = group_info["bits"]
            
            # Determine target bits (reduce precision)
            if current_bits == 16:
                target_bits = 8
            elif current_bits == 8:
                target_bits = 4
            elif current_bits == 4:
                target_bits = 3
            elif current_bits == 3:
                target_bits = 2
            else:
                continue  # Can't reduce further
            
            # Update group setting
            logger.info(f"Reducing {group_name} group precision from {current_bits}-bit to {target_bits}-bit")
            self.layer_groups[group_name]["bits"] = target_bits
            
            # Update all layers in this group
            for layer_name, layer_info in self.layer_precision.items():
                if layer_info.get("group") == group_name:
                    layer_info["bits"] = target_bits
                    changes_made = True
            
            # Check if we've saved enough memory
            # This is just an estimate - in a real implementation we would
            # calculate the exact savings
            if changes_made:
                # Assume we've reduced memory enough for this round
                break
        
        return changes_made
    
    def _count_precision_usage(self, precision_map: Dict) -> Dict:
        """
        Count usage of different precision levels.
        
        Args:
            precision_map: Map of layer names to precision bits
            
        Returns:
            Dictionary with counts by precision level
        """
        counts = {2: 0, 3: 0, 4: 0, 8: 0, 16: 0}
        
        for _, bits in precision_map.items():
            if bits in counts:
                counts[bits] += 1
            
        return counts
    
    def _identify_layer_group(self, layer_name: str) -> str:
        """
        Identify which group a layer belongs to based on its name.
        
        Args:
            layer_name: Layer name
            
        Returns:
            Group name
        """
        name_lower = layer_name.lower()
        
        if "embed" in name_lower:
            return "embedding"
        elif "attention" in name_lower or "query" in name_lower or "key" in name_lower or "value" in name_lower:
            return "attention"
        elif "mlp" in name_lower or "ffn" in name_lower or "feed_forward" in name_lower:
            return "mlp"
        elif "norm" in name_lower or "ln" in name_lower:
            return "norm"
        elif "output" in name_lower or "lm_head" in name_lower or "classifier" in name_lower:
            return "output"
        else:
            return "other"


class WebGPU4BitLayerController:
    """Controls layer-specific 4-bit quantization optimizations for WebGPU."""
    
    def __init__(
        self,
        model_structure: Dict,
        precision_controller: Optional[WebGPUAdaptivePrecision] = None,
        enable_mixed_precision: bool = True,
        kv_cache_bits: int = 4
    ):
        """
        Initialize the 4-bit layer controller.
        
        Args:
            model_structure: Dictionary describing the model structure
            precision_controller: Adaptive precision controller
            enable_mixed_precision: Enable mixed precision optimization
            kv_cache_bits: Bits for KV cache quantization
        """
        self.model_structure = model_structure
        self.precision_controller = precision_controller or WebGPUAdaptivePrecision()
        self.enable_mixed_precision = enable_mixed_precision
        self.kv_cache_bits = kv_cache_bits
        
        # Layer-specific optimization settings
        self.layer_optimizations = {}
        
        # Identify critical layers
        self.critical_layers = self._identify_critical_layers()
        
        # Apply default mixed precision settings
        if enable_mixed_precision:
            self._apply_default_mixed_precision()
    
    def optimize_layer(self, layer_name: str, tensor_type: str, tensor_info: Dict) -> Dict:
        """
        Apply layer-specific optimization settings.
        
        Args:
            layer_name: Layer name
            tensor_type: Type of tensor (weight, bias, etc.)
            tensor_info: Tensor information
            
        Returns:
            Optimization settings for this layer
        """
        # Get precision from controller
        bits = self.precision_controller.get_layer_precision(layer_name)
        
        # Layer-specific adjustments
        is_critical = layer_name in self.critical_layers
        
        # Default optimization settings
        optimization = {
            "bits": bits,
            "use_abs_max_quantization": True,  # Default quantization method
            "symmetric": True,  # Use symmetric quantization by default
            "per_channel": False,  # Default to per-tensor quantization
            "block_size": 64,  # Default block size for block-wise quantization
            "dynamically_quantize": False,  # Dynamic quantization disabled by default
            "layer_name": layer_name,
            "tensor_type": tensor_type
        }
        
        # Get any custom settings for this layer
        if layer_name in self.layer_optimizations:
            custom_settings = self.layer_optimizations[layer_name]
            optimization.update(custom_settings)
        
        # Specialized settings based on layer type
        if "attention" in layer_name.lower() or any(k in layer_name.lower() for k in ["query", "key", "value"]):
            # Attention layers often benefit from per-channel quantization
            optimization["per_channel"] = True
            
            # KV caches benefit from specific optimizations
            if "key" in layer_name.lower() or "value" in layer_name.lower():
                optimization["bits"] = self.kv_cache_bits
        
        # Layer norm should generally use higher precision
        if "norm" in layer_name.lower() or "ln" in layer_name.lower():
            optimization["bits"] = 16  # Always use FP16 for normalization layers
        
        # Biases often benefit from higher precision
        if tensor_type == "bias":
            optimization["bits"] = max(8, bits)  # Use at least 8-bit for biases
        
        # Apply specific tensor type optimizations
        if tensor_type == "weight":
            # Weights often benefit from per-channel quantization for larger tensors
            if len(tensor_info.get("shape", [])) >= 2 and tensor_info.get("shape", [0])[0] >= 32:
                optimization["per_channel"] = True
        
        return optimization
    
    def set_layer_optimization(self, layer_name: str, **kwargs):
        """
        Set custom optimization parameters for a specific layer.
        
        Args:
            layer_name: Layer name
            **kwargs: Optimization parameters
        """
        if layer_name not in self.layer_optimizations:
            self.layer_optimizations[layer_name] = {}
        
        self.layer_optimizations[layer_name].update(kwargs)
        
        logger.debug(f"Custom optimization for {layer_name}: {kwargs}")
    
    def get_all_layer_optimizations(self) -> Dict:
        """
        Get optimization settings for all layers.
        
        Returns:
            Dictionary mapping layer names to optimization settings
        """
        all_optimizations = {}
        
        # Process embeddings
        if "embeddings" in self.model_structure:
            for name, info in self.model_structure["embeddings"].items():
                layer_name = f"embeddings.{name}"
                all_optimizations[layer_name] = self.optimize_layer(layer_name, "weight", info)
        
        # Process layers
        if "layers" in self.model_structure:
            for layer_idx, layer_info in self.model_structure["layers"].items():
                if "tensors" in layer_info:
                    for tensor_name, tensor_info in layer_info["tensors"].items():
                        layer_name = f"layers.{layer_idx}.{tensor_name}"
                        tensor_type = "weight" if "weight" in tensor_name else "bias" if "bias" in tensor_name else "other"
                        all_optimizations[layer_name] = self.optimize_layer(layer_name, tensor_type, tensor_info)
        
        return all_optimizations
    
    def _identify_critical_layers(self) -> Set[str]:
        """
        Identify critical layers that should receive higher precision.
        
        Returns:
            Set of critical layer names
        """
        critical_layers = set()
        
        # Embedding layers are critical
        if "embeddings" in self.model_structure:
            for name in self.model_structure["embeddings"]:
                critical_layers.add(f"embeddings.{name}")
        
        # Process layers to find attention and output layers
        if "layers" in self.model_structure:
            for layer_idx, layer_info in self.model_structure["layers"].items():
                if "tensors" in layer_info:
                    for tensor_name in layer_info["tensors"]:
                        if any(k in tensor_name.lower() for k in ["attention", "query", "key", "value"]):
                            critical_layers.add(f"layers.{layer_idx}.{tensor_name}")
                        elif "output" in tensor_name.lower() or "lm_head" in tensor_name.lower():
                            critical_layers.add(f"layers.{layer_idx}.{tensor_name}")
        
        return critical_layers
    
    def _apply_default_mixed_precision(self):
        """Apply default mixed precision settings based on layer types."""
        # Set higher precision for critical layers
        for layer_name in self.critical_layers:
            bits = self.precision_controller.critical_layers_bits
            self.precision_controller.set_layer_precision(layer_name, bits)
            
            if "key" in layer_name.lower() or "value" in layer_name.lower():
                # KV cache layers get special treatment
                self.set_layer_optimization(
                    layer_name,
                    bits=self.kv_cache_bits,
                    per_channel=True,
                    block_size=32
                )


def optimize_model_with_adaptive_precision(
    model: Any,
    precision_controller: Optional[WebGPUAdaptivePrecision] = None,
    model_config: Optional[Dict] = None,
    device: str = "webgpu",
    browser_specific_optimizations: bool = True
) -> Dict:
    """
    Optimize a model with adaptive precision for WebGPU 4-bit inference.
    
    Args:
        model: The model to optimize
        precision_controller: Adaptive precision controller
        model_config: Model configuration
        device: Target device
        browser_specific_optimizations: Enable browser-specific optimizations
        
    Returns:
        Optimization configuration
    """
    if model_config is None:
        model_config = {}
    
    # Create precision controller if not provided
    if precision_controller is None:
        default_bits = model_config.get("default_bits", 4)
        critical_bits = model_config.get("critical_layers_bits", 8)
        precision_controller = WebGPUAdaptivePrecision(
            default_bits=default_bits,
            critical_layers_bits=critical_bits,
            dynamic_adjustment=model_config.get("dynamic_adjustment", True)
        )
    
    # Extract model structure
    model_type = model_config.get("model_type", "llama")
    hidden_size = model_config.get("hidden_size", 4096)
    num_hidden_layers = model_config.get("num_hidden_layers", 32)
    num_attention_heads = model_config.get("num_attention_heads", 32)
    seq_length = model_config.get("max_position_embeddings", 4096)
    vocab_size = model_config.get("vocab_size", 32000)
    
    # Define model structure
    model_structure = {
        "embeddings": {},
        "layers": {}
    }
    
    # Define embedding structure based on model type
    if model_type in ["llama", "qwen2"]:
        model_structure["embeddings"] = {
            "word_embeddings": {"shape": (vocab_size, hidden_size), "dtype": "float32"}
        }
    elif model_type in ["gpt2"]:
        model_structure["embeddings"] = {
            "word_embeddings": {"shape": (vocab_size, hidden_size), "dtype": "float32"},
            "position_embeddings": {"shape": (seq_length, hidden_size), "dtype": "float32"}
        }
    
    # Define layer structure
    for i in range(num_hidden_layers):
        layer_struct = {"tensors": {}}
        
        # Attention components
        layer_struct["tensors"]["attention.query"] = {"shape": (hidden_size, hidden_size), "dtype": "float32"}
        layer_struct["tensors"]["attention.key"] = {"shape": (hidden_size, hidden_size), "dtype": "float32"}
        layer_struct["tensors"]["attention.value"] = {"shape": (hidden_size, hidden_size), "dtype": "float32"}
        layer_struct["tensors"]["attention.output"] = {"shape": (hidden_size, hidden_size), "dtype": "float32"}
        
        # MLP components
        layer_struct["tensors"]["mlp.gate"] = {"shape": (hidden_size, 4 * hidden_size), "dtype": "float32"}
        layer_struct["tensors"]["mlp.up"] = {"shape": (hidden_size, 4 * hidden_size), "dtype": "float32"}
        layer_struct["tensors"]["mlp.down"] = {"shape": (4 * hidden_size, hidden_size), "dtype": "float32"}
        
        # Normalization layers
        layer_struct["tensors"]["input_layernorm"] = {"shape": (hidden_size,), "dtype": "float32"}
        layer_struct["tensors"]["post_attention_layernorm"] = {"shape": (hidden_size,), "dtype": "float32"}
        
        model_structure["layers"][str(i)] = layer_struct
    
    # Set up layer controller
    layer_controller = WebGPU4BitLayerController(
        model_structure=model_structure,
        precision_controller=precision_controller,
        enable_mixed_precision=model_config.get("enable_mixed_precision", True),
        kv_cache_bits=model_config.get("kv_cache_bits", 4)
    )
    
    # Get precision map and layer optimizations
    precision_map = precision_controller.create_layer_precision_map(model_structure)
    layer_optimizations = layer_controller.get_all_layer_optimizations()
    
    # Calculate memory estimates
    memory_estimates = precision_controller.get_memory_usage_estimate(model_structure, precision_map)
    
    # Apply browser-specific optimizations if enabled
    browser_optimizations = {}
    if browser_specific_optimizations:
        browser_optimizations = generate_browser_specific_optimizations(model_type, device, model_config)
    
    # Prepare result
    result = {
        "model_type": model_type,
        "device": device,
        "precision_settings": {
            "default_bits": precision_controller.default_bits,
            "critical_layers_bits": precision_controller.critical_layers_bits,
            "dynamic_adjustment_enabled": precision_controller.dynamic_adjustment,
            "accuracy_monitoring_enabled": precision_controller.measure_accuracy,
            "mixed_precision_enabled": layer_controller.enable_mixed_precision,
            "kv_cache_bits": layer_controller.kv_cache_bits
        },
        "memory_estimates": memory_estimates,
        "precision_map": precision_map,
        "layer_optimizations": layer_optimizations,
        "browser_optimizations": browser_optimizations,
        "precision_controller": precision_controller,
        "layer_controller": layer_controller
    }
    
    # Log optimization summary
    logger.info(f"Optimized {model_type} model for WebGPU with default {precision_controller.default_bits}-bit precision")
    logger.info(f"Memory reduction: {memory_estimates['memory_reduction_percent']:.2f}% " + 
               f"({memory_estimates['memory_reduction_mb']:.2f}MB)")
    
    # Log precision distribution
    for bits, count in memory_estimates["precision_counts"].items():
        if count > 0:
            logger.info(f"  {bits}-bit precision: {count} tensors")
    
    return result


def generate_browser_specific_optimizations(model_type: str, device: str, model_config: Optional[Dict] = None) -> Dict[str, Dict[str, Any]]:
    """
    Generate browser-specific optimizations for different browsers.
    
    Args:
        model_type: Type of model (llama, qwen2, etc.)
        device: Target device (webgpu, webnn, etc.)
        model_config: Optional model configuration
        
    Returns:
        Dictionary of browser-specific optimizations
    """
    if model_config is None:
        model_config = {}
    
    # Default optimizations that work across browsers
    default_optimizations = {
        "shader_precompilation": True,
        "parallel_loading": True if "vision" in model_type.lower() or model_type.lower() in ["clip", "llava"] else False,
        "compute_shaders": True if "audio" in model_type.lower() or model_type.lower() in ["whisper", "wav2vec2", "clap"] else False,
        "memory_efficient_attention": True,
        "progressive_loading": True if model_config.get("hidden_size", 0) > 2048 else False
    }
    
    # Chrome-specific optimizations
    chrome_optimizations = {
        **default_optimizations,
        "matrix_multiplication_kernels": {
            "workgroup_size_x": 8,
            "workgroup_size_y": 16,
            "use_shared_memory": True,
            "buffer_prefetch": True,
            "unroll_factor": 4
        },
        "shader_specialization": True,
        "memory_optimizations": {
            "use_memory_snapshots": True,
            "use_gpu_compressed_textures": True,
            "enable_zero_copy": True
        },
        "thread_optimization": {
            "worker_threads": 4,
            "use_offscreen_canvas": True
        },
        "adaptive_precision_config": {
            "use_lookup_tables": True,
            "enable_matmul_fusion": True,
            "attention_dot_product_precision": "fp16",
            "ffn_activation_precision": "fp16",
            "softmax_precision": "fp16",
            "enable_kv_cache_compression": True,
            "matrix_compute_shader_version": "v2"
        }
    }
    
    # Firefox-specific optimizations
    firefox_optimizations = {
        **default_optimizations,
        "matrix_multiplication_kernels": {
            "workgroup_size_x": 8,
            "workgroup_size_y": 8,
            "use_shared_memory": True,
            "buffer_prefetch": False,  # Less consistent in Firefox
            "unroll_factor": 2
        },
        "shader_specialization": False,  # Limited support
        "memory_optimizations": {
            "use_memory_snapshots": False,  # Not well supported in Firefox
            "use_gpu_compressed_textures": True,
            "enable_zero_copy": False
        },
        "thread_optimization": {
            "worker_threads": 2,
            "use_offscreen_canvas": False  # Less stable in Firefox
        },
        "adaptive_precision_config": {
            "use_lookup_tables": False,  # Tends to be slower in Firefox
            "enable_matmul_fusion": True,
            "attention_dot_product_precision": "fp16",
            "ffn_activation_precision": "fp16",
            "softmax_precision": "fp16",
            "enable_kv_cache_compression": True,
            "matrix_compute_shader_version": "v1",  # Use more compatible version
            "firefox_specific_shader_flags": {
                "reduce_synchronization_barriers": True,
                "optimize_shader_compilation": True,
                "aggressive_buffer_reuse": True,
                "batch_shader_commands": True
            },
            "shader_compilation_optimizations": {
                "use_precompiled_shaders": True,
                "use_minimal_control_flow": True,
                "use_texture_arrays": False,
                "optimize_uniform_buffers": True
            }
        }
    }
    
    # Edge-specific optimizations (similar to Chrome but with some adjustments)
    edge_optimizations = {
        **default_optimizations,
        "matrix_multiplication_kernels": {
            "workgroup_size_x": 8,
            "workgroup_size_y": 16,
            "use_shared_memory": True,
            "buffer_prefetch": True,
            "unroll_factor": 4
        },
        "shader_specialization": True,
        "memory_optimizations": {
            "use_memory_snapshots": True,
            "use_gpu_compressed_textures": True,
            "enable_zero_copy": True
        },
        "thread_optimization": {
            "worker_threads": 4,
            "use_offscreen_canvas": True
        },
        "adaptive_precision_config": {
            "use_lookup_tables": True,
            "enable_matmul_fusion": True,
            "attention_dot_product_precision": "fp16",
            "ffn_activation_precision": "fp16",
            "softmax_precision": "fp16",
            "enable_kv_cache_compression": True,
            "matrix_compute_shader_version": "v2"
        }
    }
    
    # Safari-specific optimizations (more conservative)
    safari_optimizations = {
        **default_optimizations,
        "compute_shaders": False,  # Limited support in Safari
        "shader_precompilation": False,  # Less reliable in Safari
        "matrix_multiplication_kernels": {
            "workgroup_size_x": 4,
            "workgroup_size_y": 4,
            "use_shared_memory": False,  # Less performant in Safari
            "buffer_prefetch": False,
            "unroll_factor": 1
        },
        "shader_specialization": False,
        "memory_optimizations": {
            "use_memory_snapshots": False,
            "use_gpu_compressed_textures": False,
            "enable_zero_copy": False
        },
        "thread_optimization": {
            "worker_threads": 1,
            "use_offscreen_canvas": False
        },
        "adaptive_precision_config": {
            "use_lookup_tables": False,
            "enable_matmul_fusion": False,  # Safest option for Safari
            "attention_dot_product_precision": "fp32",  # Higher precision for stability
            "ffn_activation_precision": "fp32",
            "softmax_precision": "fp32",
            "enable_kv_cache_compression": False,
            "matrix_compute_shader_version": "v1",
            "use_conservative_memory_model": True,
            "safari_specific_optimizations": {
                "prefer_fp32_intermediates": True,
                "use_simplified_shaders": True,
                "split_large_kernels": True,
                "minimize_texture_operations": True,
                "use_linear_compute_path": True
            }
        }
    }
    
    # Model-specific special handling
    if model_type.lower() in ["llama", "qwen2", "mistral"]:
        # LLMs: Enhance attention kernels
        for browser in [chrome_optimizations, edge_optimizations, firefox_optimizations]:
            browser["specialized_attention"] = True
            browser["kv_cache_optimization"] = True
            browser["sliding_window_attention"] = True
            
            # Add LLM-specific shader optimizations
            browser["adaptive_precision_config"]["llm_optimizations"] = {
                "attention_block_size": 128,
                "use_flash_attention": True,
                "kv_cache_in_texture": True,
                "use_int8_intermediate_activations": True,
                "optimize_rotary_embeddings": True
            }
            
            # Firefox-specific LLM optimizations
            if browser == firefox_optimizations:
                browser["adaptive_precision_config"]["llm_optimizations"]["use_flash_attention"] = False
                browser["adaptive_precision_config"]["llm_optimizations"]["use_optimized_rotary_computation"] = True
                browser["adaptive_precision_config"]["llm_optimizations"]["optimize_layernorm"] = True
                browser["adaptive_precision_config"]["llm_optimizations"]["sync_reduction_operations"] = True
    
    elif model_type.lower() in ["clip", "llava", "llava_next"]:
        # Multimodal: Add vision-specific optimizations
        for browser in [chrome_optimizations, edge_optimizations, firefox_optimizations]:
            browser["vision_encoder_optimization"] = True
            browser["parallel_modality_processing"] = True
            
            # Add multimodal-specific optimizations
            browser["adaptive_precision_config"]["multimodal_optimizations"] = {
                "enable_vision_encoder_tiling": True,
                "vision_encoder_precision": "int8",
                "fusion_attention_feed_forward": True,
                "parallelize_modality_processing": True
            }
            
            # Firefox-specific vision optimizations
            if browser == firefox_optimizations:
                browser["adaptive_precision_config"]["multimodal_optimizations"]["vision_encoder_precision"] = "fp16"
                browser["adaptive_precision_config"]["multimodal_optimizations"]["use_separable_convolutions"] = True
                browser["adaptive_precision_config"]["multimodal_optimizations"]["optimize_image_processing"] = True
    
    elif model_type.lower() in ["whisper", "wav2vec2", "clap"]:
        # Audio: Specialized audio processing
        for browser in [chrome_optimizations, edge_optimizations]:  # Skip Firefox due to inconsistent support
            browser["audio_spectrogram_optimization"] = True
            browser["mel_filterbank_compute_shader"] = True
            
            # Add audio-specific optimizations
            browser["adaptive_precision_config"]["audio_optimizations"] = {
                "fft_optimization": True,
                "mel_filterbank_precision": "fp16",
                "fbank_compute_shader": True,
                "audio_feature_streaming": True,
                "optimize_spectrogram_computation": True
            }
        
        # Add limited Firefox audio support
        firefox_optimizations["audio_spectrogram_optimization"] = True
        firefox_optimizations["adaptive_precision_config"]["audio_optimizations"] = {
            "fft_optimization": False,
            "mel_filterbank_precision": "fp32",
            "fbank_compute_shader": False,
            "audio_feature_streaming": True,
            "optimize_spectrogram_computation": False,
            "use_simplified_audio_pipeline": True,
            "firefox_audio_workarounds": {
                "split_processing_steps": True,
                "use_webgl_fallback": True,
                "minimize_buffer_operations": True
            }
        }
    
    # Return all browser optimizations
    return {
        "chrome": chrome_optimizations,
        "edge": edge_optimizations,
        "firefox": firefox_optimizations,
        "safari": safari_optimizations
    }

if __name__ == "__main__":
    # Example usage
    print("WebGPU Adaptive Precision System for 4-bit Inference")
    print("===================================================")
    
    # Set up example model configuration
    example_config = {
        "model_type": "llama",
        "hidden_size": 4096,
        "num_hidden_layers": 32,
        "num_attention_heads": 32,
        "max_position_embeddings": 4096,
        "vocab_size": 32000,
        "default_bits": 4,
        "critical_layers_bits": 8,
        "enable_mixed_precision": True,
        "dynamic_adjustment": True
    }
    
    # Create precision controller
    precision_controller = WebGPUAdaptivePrecision(
        default_bits=example_config["default_bits"],
        critical_layers_bits=example_config["critical_layers_bits"]
    )
    
    # Optimize model
    result = optimize_model_with_adaptive_precision(
        model=None,  # No actual model in this example
        precision_controller=precision_controller,
        model_config=example_config,
        browser_specific_optimizations=True
    )
    
    # Print memory estimates
    print(f"\nMemory Estimates:")
    print(f"  Original (FP16): {result['memory_estimates']['total_fp16_mb']:.2f} MB")
    print(f"  Optimized: {result['memory_estimates']['total_optimized_mb']:.2f} MB")
    print(f"  Reduction: {result['memory_estimates']['memory_reduction_mb']:.2f} MB "
          f"({result['memory_estimates']['memory_reduction_percent']:.2f}%)")
    
    # Print precision distribution
    print("\nPrecision Distribution:")
    for bits, count in result['memory_estimates']['precision_counts'].items():
        if count > 0:
            print(f"  {bits}-bit: {count} tensors")
            
    # Print example optimizations for different layer types
    print("\nExample Layer Optimizations:")
    interesting_layers = [
        "embeddings.word_embeddings",
        "layers.0.attention.query",
        "layers.0.attention.key",
        "layers.0.mlp.gate",
        "layers.0.input_layernorm"
    ]
    
    for layer in interesting_layers:
        if layer in result['layer_optimizations']:
            opt = result['layer_optimizations'][layer]
            print(f"  {layer}: {opt['bits']}-bit, per_channel={opt['per_channel']}")
    
    # Print browser-specific optimizations
    print("\nBrowser-Specific Optimizations:")
    for browser, browser_opts in result['browser_optimizations'].items():
        print(f"  {browser.upper()}:")
        print(f"    Shader Precompilation: {browser_opts.get('shader_precompilation', False)}")
        print(f"    Compute Shaders: {browser_opts.get('compute_shaders', False)}")
        print(f"    Memory-Efficient Attention: {browser_opts.get('memory_efficient_attention', False)}")
        matrix_kernels = browser_opts.get('matrix_multiplication_kernels', {})
        if matrix_kernels:
            print(f"    Matrix Kernel Workgroup: {matrix_kernels.get('workgroup_size_x', 'N/A')}x{matrix_kernels.get('workgroup_size_y', 'N/A')}")