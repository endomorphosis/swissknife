#!/usr/bin/env python3
"""
Mobile Device Optimization for Web Platform (July 2025)

This module provides power-efficient inference optimizations for mobile devices:
- Battery-aware performance scaling
- Power consumption monitoring and adaptation
- Temperature-based throttling detection and management
- Background operation pause/resume functionality
- Touch-interaction optimization patterns
- Mobile GPU shader optimizations

Usage:
    from fixed_web_platform.mobile_device_optimization import (
        MobileDeviceOptimizer,
        apply_mobile_optimizations,
        detect_mobile_capabilities,
        create_power_efficient_profile
    )
    
    # Create optimizer with automatic capability detection
    optimizer = MobileDeviceOptimizer()
    
    # Apply optimizations to existing configuration
    optimized_config = apply_mobile_optimizations(base_config)
    
    # Create device-specific power profile
    power_profile = create_power_efficient_profile(
        device_type="mobile_android",
        battery_level=0.75
    )
"""

import os
import sys
import json
import time
import logging
import platform
from typing import Dict, List, Any, Optional, Union, Tuple, Callable

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MobileDeviceOptimizer:
    """
    Provides power-efficient inference optimizations for mobile devices.
    """
    
    def __init__(self, device_info: Optional[Dict[str, Any]] = None):
        """
        Initialize the mobile device optimizer.
        
        Args:
            device_info: Optional device information dictionary
        """
        # Detect or use provided device information
        self.device_info = device_info or self._detect_device_info()
        
        # Track device state
        self.device_state = {
            "battery_level": self.device_info.get("battery_level", 1.0),
            "power_state": self.device_info.get("power_state", "battery"),
            "temperature_celsius": self.device_info.get("temperature_celsius", 25.0),
            "throttling_detected": False,
            "active_cooling": False,
            "background_mode": False,
            "last_interaction_ms": time.time() * 1000,
            "performance_level": 3  # 1-5 scale, 5 being highest performance
        }
        
        # Create optimization profile based on device state
        self.optimization_profile = self._create_optimization_profile()
        
        logger.info(f"Mobile device optimization initialized for {self.device_info.get('model', 'unknown device')}")
        logger.info(f"Battery level: {self.device_state['battery_level']:.2f}, Power state: {self.device_state['power_state']}")
    
    def _detect_device_info(self) -> Dict[str, Any]:
        """
        Detect mobile device information.
        
        Returns:
            Dictionary of device information
        """
        device_info = {
            "is_mobile": self._is_mobile_device(),
            "platform": self._detect_platform(),
            "model": "unknown",
            "os_version": "unknown",
            "screen_size": (0, 0),
            "pixel_ratio": 1.0,
            "battery_level": self._detect_battery_level(),
            "power_state": self._detect_power_state(),
            "temperature_celsius": 25.0,  # Default temperature
            "memory_gb": self._detect_available_memory(),
            "gpu_info": self._detect_mobile_gpu()
        }
        
        # Detect platform-specific information
        if device_info["platform"] == "android":
            # Set Android-specific properties
            device_info["os_version"] = os.environ.get("TEST_ANDROID_VERSION", "12")
            device_info["model"] = os.environ.get("TEST_ANDROID_MODEL", "Pixel 6")
            
        elif device_info["platform"] == "ios":
            # Set iOS-specific properties
            device_info["os_version"] = os.environ.get("TEST_IOS_VERSION", "16")
            device_info["model"] = os.environ.get("TEST_IOS_MODEL", "iPhone 13")
        
        return device_info
    
    def _is_mobile_device(self) -> bool:
        """
        Detect if the current device is mobile.
        
        Returns:
            Boolean indicating if device is mobile
        """
        # In a real environment, this would use more robust detection
        # For testing, we rely on environment variables
        test_device = os.environ.get("TEST_DEVICE_TYPE", "").lower()
        
        if test_device in ["mobile", "android", "ios", "tablet"]:
            return True
        
        # User agent-based detection (simplified)
        user_agent = os.environ.get("TEST_USER_AGENT", "").lower()
        mobile_keywords = ["android", "iphone", "ipad", "mobile", "mobi"]
        
        return any(keyword in user_agent for keyword in mobile_keywords)
    
    def _detect_platform(self) -> str:
        """
        Detect the mobile platform.
        
        Returns:
            Platform name: 'android', 'ios', or 'unknown'
        """
        test_platform = os.environ.get("TEST_PLATFORM", "").lower()
        
        if test_platform in ["android", "ios"]:
            return test_platform
        
        # User agent-based detection (simplified)
        user_agent = os.environ.get("TEST_USER_AGENT", "").lower()
        
        if "android" in user_agent:
            return "android"
        elif "iphone" in user_agent or "ipad" in user_agent or "ipod" in user_agent:
            return "ios"
        
        return "unknown"
    
    def _detect_battery_level(self) -> float:
        """
        Detect battery level (0.0 to 1.0).
        
        Returns:
            Battery level as a float between 0.0 and 1.0
        """
        # In testing environment, use environment variable
        test_battery = os.environ.get("TEST_BATTERY_LEVEL", "")
        
        if test_battery:
            try:
                level = float(test_battery)
                return max(0.0, min(1.0, level))  # Clamp between 0 and 1
            except (ValueError, TypeError):
                pass
        
        # Default to full battery for testing
        return 1.0
    
    def _detect_power_state(self) -> str:
        """
        Detect if device is on battery or plugged in.
        
        Returns:
            'battery' or 'plugged_in'
        """
        test_power = os.environ.get("TEST_POWER_STATE", "").lower()
        
        if test_power in ["battery", "plugged_in", "charging"]:
            return "plugged_in" if test_power in ["plugged_in", "charging"] else "battery"
        
        # Default to battery for mobile testing
        return "battery"
    
    def _detect_available_memory(self) -> float:
        """
        Detect available memory in GB.
        
        Returns:
            Available memory in GB
        """
        test_memory = os.environ.get("TEST_MEMORY_GB", "")
        
        if test_memory:
            try:
                return float(test_memory)
            except (ValueError, TypeError):
                pass
        
        # Default values based on platform
        if self._detect_platform() == "android":
            return 4.0  # Default for Android testing
        elif self._detect_platform() == "ios":
            return 6.0  # Default for iOS testing
        
        return 4.0  # General default for mobile
    
    def _detect_mobile_gpu(self) -> Dict[str, Any]:
        """
        Detect mobile GPU information.
        
        Returns:
            Dictionary with GPU information
        """
        platform = self._detect_platform()
        gpu_info = {
            "vendor": "unknown",
            "model": "unknown",
            "supports_compute_shaders": False,
            "max_texture_size": 4096,
            "precision_support": {
                "highp": True,
                "mediump": True,
                "lowp": True
            }
        }
        
        # Set values based on platform and environment variables
        if platform == "android":
            test_gpu = os.environ.get("TEST_ANDROID_GPU", "").lower()
            
            if "adreno" in test_gpu:
                gpu_info["vendor"] = "qualcomm"
                gpu_info["model"] = test_gpu
                gpu_info["supports_compute_shaders"] = True
            elif "mali" in test_gpu:
                gpu_info["vendor"] = "arm"
                gpu_info["model"] = test_gpu
                gpu_info["supports_compute_shaders"] = True
            elif "powervrm" in test_gpu:
                gpu_info["vendor"] = "imagination"
                gpu_info["model"] = test_gpu
                gpu_info["supports_compute_shaders"] = False
            else:
                # Default to Adreno for testing
                gpu_info["vendor"] = "qualcomm"
                gpu_info["model"] = "adreno 650"
                gpu_info["supports_compute_shaders"] = True
                
        elif platform == "ios":
            # All modern iOS devices use Apple GPUs
            gpu_info["vendor"] = "apple"
            gpu_info["model"] = "apple gpu"
            gpu_info["supports_compute_shaders"] = True
        
        return gpu_info
    
    def _create_optimization_profile(self) -> Dict[str, Any]:
        """
        Create optimization profile based on device state.
        
        Returns:
            Dictionary with optimization settings
        """
        battery_level = self.device_state["battery_level"]
        power_state = self.device_state["power_state"]
        platform = self.device_info["platform"]
        is_plugged_in = power_state == "plugged_in"
        
        # Base profile with conservative settings
        profile = {
            "power_efficiency": {
                "mode": "balanced",  # balanced, performance, efficiency
                "dynamic_throttling": True,
                "background_pause": True,
                "inactivity_downscale": True,
                "cpu_cores_limit": None,  # None means no limit
                "gpu_power_level": 2,  # 1-5 scale, 5 being highest power
                "refresh_rate": "normal"  # normal, reduced
            },
            "precision": {
                "default": 4,  # 4-bit default
                "attention": 8,  # 8-bit for attention
                "kv_cache": 4,
                "embedding": 4
            },
            "batching": {
                "dynamic_batching": True,
                "max_batch_size": 4,
                "adaptive_batch_scheduling": True
            },
            "memory": {
                "texture_compression": True,
                "weight_sharing": True,
                "progressive_loading": True,
                "layer_offloading": battery_level < 0.3  # Offload layers when battery is low
            },
            "interaction": {
                "auto_restart_on_focus": True,
                "prioritize_visible_content": True,
                "defer_background_processing": True,
                "touch_responsiveness_boost": True
            },
            "scheduler": {
                "yield_to_ui_thread": True,
                "task_chunking": True,
                "idle_only_processing": battery_level < 0.2,
                "chunk_size_ms": 5 if battery_level < 0.5 else 10
            },
            "optimizations": {
                "android": {},
                "ios": {}
            }
        }
        
        # Adjust profile based on battery level and charging state
        if is_plugged_in:
            # More performance-oriented when plugged in
            profile["power_efficiency"]["mode"] = "performance"
            profile["power_efficiency"]["gpu_power_level"] = 4
            profile["scheduler"]["chunk_size_ms"] = 15
            profile["batching"]["max_batch_size"] = 8
            profile["precision"]["default"] = 4  # Still use 4-bit for efficiency
            
        else:
            # Battery level based adjustments when not plugged in
            if battery_level >= 0.7:
                # Good battery level, balanced approach
                profile["power_efficiency"]["mode"] = "balanced"
                profile["power_efficiency"]["gpu_power_level"] = 3
                
            elif battery_level >= 0.3 and battery_level < 0.7:
                # Medium battery, more conservative
                profile["power_efficiency"]["mode"] = "balanced"
                profile["power_efficiency"]["gpu_power_level"] = 2
                profile["scheduler"]["chunk_size_ms"] = 5
                profile["power_efficiency"]["refresh_rate"] = "reduced"
                
            else:
                # Low battery, very conservative
                profile["power_efficiency"]["mode"] = "efficiency"
                profile["power_efficiency"]["gpu_power_level"] = 1
                profile["scheduler"]["chunk_size_ms"] = 5
                profile["scheduler"]["idle_only_processing"] = True
                profile["power_efficiency"]["refresh_rate"] = "reduced"
                profile["precision"]["default"] = 3  # Lower precision for better efficiency
                profile["batching"]["max_batch_size"] = 2
        
        # Platform-specific optimizations
        if platform == "android":
            profile["optimizations"]["android"] = {
                "texture_compression_format": "etc2",
                "prefer_vulkan_compute": self.device_info["gpu_info"]["supports_compute_shaders"],
                "workgroup_size": [128, 1, 1] if self.device_info["gpu_info"]["vendor"] == "qualcomm" else [64, 1, 1],
                "use_cpu_delegation": battery_level < 0.2,  # Use CPU delegation when battery is very low
                "prefer_fp16_math": True
            }
        elif platform == "ios":
            profile["optimizations"]["ios"] = {
                "texture_compression_format": "astc",
                "metal_performance_shaders": True,
                "workgroup_size": [32, 1, 1],  # Optimal for Apple GPUs
                "use_aneuralnetwork_delegate": True,
                "prefer_fp16_math": True,
                "dynamic_memory_allocation": True
            }
        
        logger.debug(f"Created mobile optimization profile with mode: {profile['power_efficiency']['mode']}")
        return profile
    
    def update_device_state(self, **kwargs) -> None:
        """
        Update device state with new values.
        
        Args:
            **kwargs: Device state properties to update
        """
        valid_properties = [
            "battery_level", "power_state", "temperature_celsius",
            "throttling_detected", "active_cooling", "background_mode",
            "last_interaction_ms", "performance_level"
        ]
        
        updated = False
        
        for key, value in kwargs.items():
            if key in valid_properties:
                # Special handling for battery level to ensure it's within bounds
                if key == "battery_level":
                    value = max(0.0, min(1.0, value))
                
                # Update the state
                self.device_state[key] = value
                updated = True
        
        # If state changed, update optimization profile
        if updated:
            self.optimization_profile = self._create_optimization_profile()
            logger.info(f"Device state updated. Battery: {self.device_state['battery_level']:.2f}, "
                      f"Mode: {self.optimization_profile['power_efficiency']['mode']}")
    
    def detect_throttling(self) -> bool:
        """
        Detect if device is thermal throttling.
        
        Returns:
            Boolean indicating throttling status
        """
        # Check temperature threshold
        temperature = self.device_state["temperature_celsius"]
        
        # Simple throttling detection based on temperature thresholds
        # In a real implementation, this would be more sophisticated
        threshold = 40.0  # 40°C is a common throttling threshold
        
        # Update state
        throttling_detected = temperature >= threshold
        self.device_state["throttling_detected"] = throttling_detected
        
        if throttling_detected:
            logger.warning(f"Thermal throttling detected! Temperature: {temperature}°C")
            
            # Update profile to be more conservative
            self.optimization_profile["power_efficiency"]["mode"] = "efficiency"
            self.optimization_profile["power_efficiency"]["gpu_power_level"] = 1
            self.optimization_profile["scheduler"]["chunk_size_ms"] = 5
            self.optimization_profile["batching"]["max_batch_size"] = 2
        
        return throttling_detected
    
    def optimize_for_background(self, is_background: bool) -> None:
        """
        Optimize for background operation.
        
        Args:
            is_background: Whether app is in background
        """
        if is_background == self.device_state["background_mode"]:
            return  # No change
        
        self.device_state["background_mode"] = is_background
        
        if is_background:
            logger.info("App in background mode, applying power-saving optimizations")
            
            # Store original settings for restoration
            self._original_settings = {
                "precision": self.optimization_profile["precision"].copy(),
                "batching": {
                    "max_batch_size": self.optimization_profile["batching"]["max_batch_size"]
                },
                "power_efficiency": {
                    "mode": self.optimization_profile["power_efficiency"]["mode"],
                    "gpu_power_level": self.optimization_profile["power_efficiency"]["gpu_power_level"]
                }
            }
            
            # Apply background optimizations
            self.optimization_profile["power_efficiency"]["mode"] = "efficiency"
            self.optimization_profile["power_efficiency"]["gpu_power_level"] = 1
            self.optimization_profile["scheduler"]["idle_only_processing"] = True
            self.optimization_profile["scheduler"]["chunk_size_ms"] = 5
            self.optimization_profile["batching"]["max_batch_size"] = 1
            self.optimization_profile["precision"]["default"] = 3  # Ultra low precision
            self.optimization_profile["precision"]["kv_cache"] = 3
            self.optimization_profile["precision"]["embedding"] = 3
        else:
            logger.info("App returned to foreground, restoring normal optimizations")
            
            # Restore original settings if they exist
            if hasattr(self, "_original_settings"):
                self.optimization_profile["precision"] = self._original_settings["precision"]
                self.optimization_profile["batching"]["max_batch_size"] = self._original_settings["batching"]["max_batch_size"]
                self.optimization_profile["power_efficiency"]["mode"] = self._original_settings["power_efficiency"]["mode"]
                self.optimization_profile["power_efficiency"]["gpu_power_level"] = self._original_settings["power_efficiency"]["gpu_power_level"]
                self.optimization_profile["scheduler"]["idle_only_processing"] = False
                self.optimization_profile["scheduler"]["chunk_size_ms"] = 10
    
    def optimize_for_interaction(self) -> None:
        """
        Apply optimization boost for user interaction.
        """
        # Update last interaction time
        self.device_state["last_interaction_ms"] = time.time() * 1000
        
        # Store original settings if we haven't already
        if not hasattr(self, "_original_settings_interaction"):
            self._original_settings_interaction = {
                "scheduler": {
                    "chunk_size_ms": self.optimization_profile["scheduler"]["chunk_size_ms"],
                    "yield_to_ui_thread": self.optimization_profile["scheduler"]["yield_to_ui_thread"]
                },
                "power_efficiency": {
                    "gpu_power_level": self.optimization_profile["power_efficiency"]["gpu_power_level"]
                }
            }
            
            # Apply interaction optimizations for 500ms
            self.optimization_profile["scheduler"]["chunk_size_ms"] = 3  # Smaller chunks for more responsive UI
            self.optimization_profile["scheduler"]["yield_to_ui_thread"] = True
            self.optimization_profile["power_efficiency"]["gpu_power_level"] += 1  # Temporary boost
            
            # Schedule restoration of original settings
            def _restore_after_interaction():
                time.sleep(0.5)  # Wait 500ms
                
                # Restore original settings
                if hasattr(self, "_original_settings_interaction"):
                    self.optimization_profile["scheduler"]["chunk_size_ms"] = self._original_settings_interaction["scheduler"]["chunk_size_ms"]
                    self.optimization_profile["scheduler"]["yield_to_ui_thread"] = self._original_settings_interaction["scheduler"]["yield_to_ui_thread"]
                    self.optimization_profile["power_efficiency"]["gpu_power_level"] = self._original_settings_interaction["power_efficiency"]["gpu_power_level"]
                    
                    # Clean up
                    delattr(self, "_original_settings_interaction")
            
            # In a real implementation, this would use a proper scheduler
            # For this simulator, we'll just note that this would happen
            logger.info("Interaction boost applied, would be restored after 500ms")
    
    def get_optimization_profile(self) -> Dict[str, Any]:
        """
        Get the current optimization profile.
        
        Returns:
            Dictionary with optimization settings
        """
        return self.optimization_profile
    
    def get_battery_optimized_workload(self, operation_type: str) -> Dict[str, Any]:
        """
        Get battery-optimized workload configuration.
        
        Args:
            operation_type: Type of operation (inference, training, etc.)
            
        Returns:
            Dictionary with workload configuration
        """
        battery_level = self.device_state["battery_level"]
        power_state = self.device_state["power_state"]
        is_plugged_in = power_state == "plugged_in"
        
        # Base workload parameters
        workload = {
            "chunk_size": 128,
            "batch_size": 4,
            "precision": "float16",
            "scheduler_priority": "normal",
            "max_concurrent_jobs": 2,
            "power_profile": self.optimization_profile["power_efficiency"]["mode"]
        }
        
        # Adjust based on power state
        if is_plugged_in:
            workload["chunk_size"] = 256
            workload["batch_size"] = 8
            workload["max_concurrent_jobs"] = 4
        else:
            # Adjust based on battery level
            if battery_level < 0.2:
                # Very low battery, ultra conservative
                workload["chunk_size"] = 64
                workload["batch_size"] = 1
                workload["precision"] = "int8"
                workload["scheduler_priority"] = "low"
                workload["max_concurrent_jobs"] = 1
            elif battery_level < 0.5:
                # Medium battery, conservative
                workload["chunk_size"] = 96
                workload["batch_size"] = 2
                workload["scheduler_priority"] = "low"
                workload["max_concurrent_jobs"] = 1
        
        # Adjust based on operation type
        if operation_type == "inference":
            # Inference can be more aggressive with batching
            workload["batch_size"] *= 2
        elif operation_type == "training":
            # Training should be more conservative
            workload["batch_size"] = max(1, workload["batch_size"] // 2)
            workload["max_concurrent_jobs"] = 1
        
        return workload
    
    def estimate_power_consumption(self, workload: Dict[str, Any]) -> Dict[str, float]:
        """
        Estimate power consumption for a workload.
        
        Args:
            workload: Workload configuration
            
        Returns:
            Dictionary with power consumption estimates
        """
        # Base power consumption metrics (illustrative values)
        base_power_mw = 200  # Base power in milliwatts
        gpu_power_mw = 350   # GPU power in milliwatts
        cpu_power_mw = 300   # CPU power in milliwatts
        
        # Adjust based on workload parameters
        batch_multiplier = workload["batch_size"] / 4  # Normalize to base batch size of 4
        precision_factor = 1.0
        if workload["precision"] == "float32":
            precision_factor = 1.5
        elif workload["precision"] == "int8":
            precision_factor = 0.6
        
        # Concurrent jobs impact
        concurrency_factor = workload["max_concurrent_jobs"] / 2
        
        # Calculate power usage
        gpu_usage = gpu_power_mw * batch_multiplier * precision_factor * concurrency_factor
        cpu_usage = cpu_power_mw * batch_multiplier * concurrency_factor
        total_power_mw = base_power_mw + gpu_usage + cpu_usage
        
        # Adjust for power profile
        if workload["power_profile"] == "performance":
            total_power_mw *= 1.2
        elif workload["power_profile"] == "efficiency":
            total_power_mw *= 0.7
        
        # Temperature impact (simplified model)
        temperature = self.device_state["temperature_celsius"]
        if temperature > 35:
            # Higher temperatures lead to less efficiency
            temperature_factor = 1.0 + ((temperature - 35) * 0.03)
            total_power_mw *= temperature_factor
        
        return {
            "total_power_mw": total_power_mw,
            "gpu_power_mw": gpu_usage,
            "cpu_power_mw": cpu_usage,
            "base_power_mw": base_power_mw,
            "estimated_runtime_mins": (1.0 / batch_multiplier) * 10,  # Simplified runtime estimate
            "estimated_battery_impact_percent": (total_power_mw / 1000) * 0.3  # Simplified impact estimate
        }


def detect_mobile_capabilities() -> Dict[str, Any]:
    """
    Detect mobile device capabilities.
    
    Returns:
        Dictionary with mobile capabilities
    """
    # Create temporary optimizer to detect capabilities
    optimizer = MobileDeviceOptimizer()
    
    # Combine device info and optimization profile
    capabilities = {
        "device_info": optimizer.device_info,
        "battery_state": optimizer.device_state["battery_level"],
        "power_state": optimizer.device_state["power_state"],
        "is_throttling": optimizer.device_state["throttling_detected"],
        "optimization_profile": optimizer.optimization_profile,
        "mobile_support": {
            "dynamic_throttling": True,
            "battery_aware_scaling": True,
            "touch_interaction_boost": True,
            "background_operation": True,
            "shader_optimizations": optimizer.device_info["gpu_info"]["supports_compute_shaders"]
        }
    }
    
    return capabilities


def apply_mobile_optimizations(base_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply mobile optimizations to existing configuration.
    
    Args:
        base_config: Base configuration to optimize
        
    Returns:
        Optimized configuration with mobile device enhancements
    """
    # Create optimizer
    optimizer = MobileDeviceOptimizer()
    
    # Deep copy base config to avoid modifying original
    optimized_config = base_config.copy()
    
    # Get optimization profile
    profile = optimizer.get_optimization_profile()
    
    # Apply mobile optimizations
    if "precision" in optimized_config:
        optimized_config["precision"]["default"] = profile["precision"]["default"]
        optimized_config["precision"]["kv_cache"] = profile["precision"]["kv_cache"]
    
    # Add power efficiency settings
    optimized_config["power_efficiency"] = profile["power_efficiency"]
    
    # Add memory optimization settings
    if "memory" in optimized_config:
        for key, value in profile["memory"].items():
            optimized_config["memory"][key] = value
    else:
        optimized_config["memory"] = profile["memory"]
    
    # Add interaction optimization settings
    optimized_config["interaction"] = profile["interaction"]
    
    # Add scheduler settings
    optimized_config["scheduler"] = profile["scheduler"]
    
    # Add platform-specific optimizations
    platform = optimizer.device_info["platform"]
    if platform in ["android", "ios"] and platform in profile["optimizations"]:
        optimized_config[f"{platform}_optimizations"] = profile["optimizations"][platform]
    
    return optimized_config


def create_power_efficient_profile(device_type: str, battery_level: float = 0.5) -> Dict[str, Any]:
    """
    Create a power-efficient profile for a specific device type.
    
    Args:
        device_type: Type of device (mobile_android, mobile_ios, tablet)
        battery_level: Battery level (0.0 to 1.0)
        
    Returns:
        Power-efficient profile for the device
    """
    # Set environment variables for testing
    os.environ["TEST_DEVICE_TYPE"] = device_type
    os.environ["TEST_BATTERY_LEVEL"] = str(battery_level)
    
    if "mobile_android" in device_type:
        os.environ["TEST_PLATFORM"] = "android"
        
        # Set reasonable defaults for Android testing
        if "low_end" in device_type:
            os.environ["TEST_ANDROID_MODEL"] = "Samsung Galaxy A13"
            os.environ["TEST_MEMORY_GB"] = "3"
            os.environ["TEST_ANDROID_GPU"] = "mali g52"
        else:
            os.environ["TEST_ANDROID_MODEL"] = "Samsung Galaxy S23"
            os.environ["TEST_MEMORY_GB"] = "8"
            os.environ["TEST_ANDROID_GPU"] = "adreno 740"
            
    elif "mobile_ios" in device_type:
        os.environ["TEST_PLATFORM"] = "ios"
        
        # Set reasonable defaults for iOS testing
        if "low_end" in device_type:
            os.environ["TEST_IOS_MODEL"] = "iPhone SE"
            os.environ["TEST_MEMORY_GB"] = "3"
        else:
            os.environ["TEST_IOS_MODEL"] = "iPhone 14 Pro"
            os.environ["TEST_MEMORY_GB"] = "6"
            
    elif "tablet" in device_type:
        if "android" in device_type:
            os.environ["TEST_PLATFORM"] = "android"
            os.environ["TEST_ANDROID_MODEL"] = "Samsung Galaxy Tab S8"
            os.environ["TEST_MEMORY_GB"] = "8"
            os.environ["TEST_ANDROID_GPU"] = "adreno 730"
        else:
            os.environ["TEST_PLATFORM"] = "ios"
            os.environ["TEST_IOS_MODEL"] = "iPad Pro"
            os.environ["TEST_MEMORY_GB"] = "8"
    
    # Create optimizer with these settings
    optimizer = MobileDeviceOptimizer()
    
    # Get optimization profile
    profile = optimizer.get_optimization_profile()
    
    # Clean up environment variables
    for var in ["TEST_DEVICE_TYPE", "TEST_BATTERY_LEVEL", "TEST_PLATFORM", 
                "TEST_ANDROID_MODEL", "TEST_MEMORY_GB", "TEST_ANDROID_GPU", 
                "TEST_IOS_MODEL"]:
        if var in os.environ:
            del os.environ[var]
    
    return profile


def mobile_power_metrics_logger(operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Log and estimate power metrics for a sequence of operations.
    
    Args:
        operations: List of operations with configurations
        
    Returns:
        Dictionary with power metrics and recommendations
    """
    # Create optimizer
    optimizer = MobileDeviceOptimizer()
    
    total_power_mw = 0
    operation_metrics = []
    
    for op in operations:
        # Get operation details
        op_type = op.get("type", "inference")
        op_config = op.get("config", {})
        
        # Get workload for this operation
        workload = optimizer.get_battery_optimized_workload(op_type)
        
        # Update with any specific config
        for key, value in op_config.items():
            workload[key] = value
        
        # Estimate power consumption
        power_metrics = optimizer.estimate_power_consumption(workload)
        total_power_mw += power_metrics["total_power_mw"]
        
        # Store metrics
        operation_metrics.append({
            "type": op_type,
            "workload": workload,
            "power_metrics": power_metrics
        })
    
    # Generate overall metrics
    battery_impact = (total_power_mw / 1000) * 0.5  # Simplified impact calculation
    
    recommendations = []
    if battery_impact > 5:
        recommendations.append("Consider reducing batch sizes to conserve battery")
    if optimizer.device_state["battery_level"] < 0.3 and not any(op["workload"]["precision"] == "int8" for op in operation_metrics):
        recommendations.append("Use int8 precision when battery is low")
    if optimizer.device_state["temperature_celsius"] > 38:
        recommendations.append("Device is warm, consider throttling to prevent overheating")
    
    return {
        "total_power_mw": total_power_mw,
        "estimated_battery_impact_percent": battery_impact,
        "device_state": optimizer.device_state,
        "operation_details": operation_metrics,
        "recommendations": recommendations
    }


if __name__ == "__main__":
    print("Mobile Device Optimization")
    
    # Detect mobile capabilities
    capabilities = detect_mobile_capabilities()
    
    print(f"Device: {capabilities['device_info'].get('model', 'unknown')}")
    print(f"Platform: {capabilities['device_info'].get('platform', 'unknown')}")
    print(f"Battery level: {capabilities['battery_state']:.2f}")
    print(f"Power state: {capabilities['power_state']}")
    
    # Create optimizer
    optimizer = MobileDeviceOptimizer()
    
    # Test battery level changes
    print("\nTesting different battery levels:")
    
    for level in [0.9, 0.5, 0.2, 0.1]:
        optimizer.update_device_state(battery_level=level)
        profile = optimizer.get_optimization_profile()
        print(f"Battery level: {level:.1f}, " +
              f"Mode: {profile['power_efficiency']['mode']}, " +
              f"GPU level: {profile['power_efficiency']['gpu_power_level']}, " +
              f"Precision: {profile['precision']['default']}-bit")
    
    # Test background mode
    print("\nTesting background mode:")
    optimizer.update_device_state(battery_level=0.7)
    optimizer.optimize_for_background(True)
    bg_profile = optimizer.get_optimization_profile()
    print(f"Background mode - GPU level: {bg_profile['power_efficiency']['gpu_power_level']}, " +
          f"Precision: {bg_profile['precision']['default']}-bit, " +
          f"Mode: {bg_profile['power_efficiency']['mode']}")
    
    optimizer.optimize_for_background(False)
    fg_profile = optimizer.get_optimization_profile()
    print(f"Foreground mode - GPU level: {fg_profile['power_efficiency']['gpu_power_level']}, " +
          f"Precision: {fg_profile['precision']['default']}-bit, " +
          f"Mode: {fg_profile['power_efficiency']['mode']}")
    
    # Test device-specific profiles
    print("\nDevice-specific profiles:")
    
    devices = ["mobile_android", "mobile_android_low_end", "mobile_ios", "tablet_android"]
    for device in devices:
        profile = create_power_efficient_profile(device, battery_level=0.5)
        if device.startswith("mobile_android"):
            specific = profile.get("optimizations", {}).get("android", {})
        else:
            specific = profile.get("optimizations", {}).get("ios", {})
            
        print(f"{device}: Mode: {profile['power_efficiency']['mode']}, " +
              f"Specific: {list(specific.keys() if specific else [])}")
    
    # Test power metrics
    print("\nPower metrics example:")
    operations = [
        {"type": "inference", "config": {"batch_size": 4}},
        {"type": "inference", "config": {"batch_size": 1, "precision": "int8"}}
    ]
    
    metrics = mobile_power_metrics_logger(operations)
    print(f"Total power: {metrics['total_power_mw']:.1f} mW, " +
          f"Battery impact: {metrics['estimated_battery_impact_percent']:.1f}%")
    print(f"Recommendations: {metrics['recommendations']}")
    
    # Test advanced mobile optimization scenarios
    print("\nTesting advanced mobile optimization scenarios:")

    # Create different mobile device configurations
    mobile_scenarios = [
        {
            "name": "Android high-end (high battery)",
            "device_type": "mobile_android",
            "model": "Samsung Galaxy S24",
            "battery_level": 0.9,
            "power_state": "battery",
            "memory_gb": 8
        },
        {
            "name": "Android high-end (low battery)",
            "device_type": "mobile_android",
            "model": "Samsung Galaxy S24",
            "battery_level": 0.2,
            "power_state": "battery",
            "memory_gb": 8 
        },
        {
            "name": "iOS high-end (charging)",
            "device_type": "mobile_ios",
            "model": "iPhone 15 Pro",
            "battery_level": 0.6,
            "power_state": "plugged_in",
            "memory_gb": 6
        },
        {
            "name": "Android mid-range (background mode)",
            "device_type": "mobile_android",
            "model": "Samsung Galaxy A54",
            "battery_level": 0.5,
            "power_state": "battery",
            "memory_gb": 6,
            "background_mode": True
        },
        {
            "name": "iOS mid-range (high temperature)",
            "device_type": "mobile_ios",
            "model": "iPhone SE",
            "battery_level": 0.4,
            "power_state": "battery",
            "memory_gb": 4,
            "temperature_celsius": 41
        }
    ]

    for scenario in mobile_scenarios:
        print(f"\n{scenario['name']}:")
        
        # Configure environment variables for testing
        os.environ["TEST_DEVICE_TYPE"] = scenario["device_type"]
        os.environ["TEST_BATTERY_LEVEL"] = str(scenario["battery_level"])
        os.environ["TEST_POWER_STATE"] = scenario.get("power_state", "battery")
        os.environ["TEST_MEMORY_GB"] = str(scenario.get("memory_gb", 4))
        
        if "temperature_celsius" in scenario:
            # Add temperature handling in the test
            os.environ["TEST_TEMPERATURE"] = str(scenario["temperature_celsius"])
        
        # Create mobile optimizer with scenario settings
        optimizer = MobileDeviceOptimizer()
        
        # Apply background mode if specified
        if scenario.get("background_mode", False):
            optimizer.optimize_for_background(True)
        
        # Apply throttling detection if high temperature
        if scenario.get("temperature_celsius", 25) > 40:
            # Update device state temperature
            optimizer.update_device_state(temperature_celsius=scenario["temperature_celsius"])
            is_throttling = optimizer.detect_throttling()
            print(f"  Thermal throttling: {is_throttling}")
        
        # Get optimization profile
        profile = optimizer.get_optimization_profile()
        
        # Display key optimization parameters
        print(f"  Power efficiency mode: {profile['power_efficiency']['mode']}")
        print(f"  GPU power level: {profile['power_efficiency']['gpu_power_level']} (1-5 scale)")
        print(f"  Batch size: {profile['batching']['max_batch_size']}")
        print(f"  Precision: {profile['precision']['default']}-bit")
        print(f"  Scheduler: {'Idle-only' if profile['scheduler']['idle_only_processing'] else 'Normal'}")
        
        # Test workload optimization
        workload = optimizer.get_battery_optimized_workload("inference")
        power_metrics = optimizer.estimate_power_consumption(workload)
        
        print(f"  Power consumption: {power_metrics['total_power_mw']:.1f} mW")
        print(f"  Battery impact: {power_metrics['estimated_battery_impact_percent']:.2f}%/hour")
        
        # For iOS, show Metal-specific optimizations
        if scenario["device_type"] == "mobile_ios":
            ios_opts = profile["optimizations"]["ios"]
            print(f"  iOS optimizations: Metal Performance Shaders: {ios_opts['metal_performance_shaders']}")
            print(f"  Workgroup size: {ios_opts['workgroup_size']}")
        
        # For Android, show Vulkan-specific optimizations
        if scenario["device_type"] == "mobile_android":
            android_opts = profile["optimizations"]["android"]
            print(f"  Android optimizations: Prefer Vulkan: {android_opts['prefer_vulkan_compute']}")
            print(f"  Workgroup size: {android_opts['workgroup_size']}")

        # Clean up environment variables
        for var in ["TEST_DEVICE_TYPE", "TEST_BATTERY_LEVEL", "TEST_POWER_STATE", 
                    "TEST_MEMORY_GB", "TEST_TEMPERATURE"]:
            if var in os.environ:
                del os.environ[var]

    # Test comprehensive mobile optimization with multiple operations
    print("\nSimulating comprehensive mobile workload:")

    # Create a realistic mobile device
    os.environ["TEST_DEVICE_TYPE"] = "mobile_android"
    os.environ["TEST_BATTERY_LEVEL"] = "0.65"
    os.environ["TEST_MEMORY_GB"] = "6"
    os.environ["TEST_ANDROID_MODEL"] = "Google Pixel 7"
    os.environ["TEST_ANDROID_GPU"] = "adreno 730"

    # Create optimizer
    optimizer = MobileDeviceOptimizer()

    # Define a series of operations for a typical ML workload
    operations = [
        {"type": "inference", "config": {"batch_size": 4, "precision": "float16"}},
        {"type": "inference", "config": {"batch_size": 1, "precision": "int8"}},
        {"type": "embedding", "config": {"batch_size": 8}}
    ]

    # Get power metrics for the workload
    metrics = mobile_power_metrics_logger(operations)

    # Display results
    print(f"  Total power consumption: {metrics['total_power_mw']:.1f} mW")
    print(f"  Battery impact: {metrics['estimated_battery_impact_percent']:.2f}%/hour")
    print(f"  Device temperature: {metrics['device_state']['temperature_celsius']}°C")
    print(f"  Throttling detected: {metrics['device_state']['throttling_detected']}")

    # Display recommendations
    if metrics['recommendations']:
        print("  Recommendations:")
        for rec in metrics['recommendations']:
            print(f"    - {rec}")

    # Clean up environment
    for var in ["TEST_DEVICE_TYPE", "TEST_BATTERY_LEVEL", "TEST_MEMORY_GB", 
                "TEST_ANDROID_MODEL", "TEST_ANDROID_GPU"]:
        if var in os.environ:
            del os.environ[var]

    # Test interaction boost optimization
    print("\nTesting interaction boost optimization:")
    
    # Set up default device
    os.environ["TEST_DEVICE_TYPE"] = "mobile_android"
    os.environ["TEST_BATTERY_LEVEL"] = "0.5"
    optimizer = MobileDeviceOptimizer()
    
    # Get baseline profile
    baseline_profile = optimizer.get_optimization_profile()
    print(f"Baseline - GPU level: {baseline_profile['power_efficiency']['gpu_power_level']}, " +
          f"Chunk size: {baseline_profile['scheduler']['chunk_size_ms']}ms")
    
    # Apply interaction boost
    optimizer.optimize_for_interaction()
    
    # Show boosted settings
    print("After interaction - Boosted for user interaction (500ms)")
    print("  Note: In production, UI thread responsiveness improves by:")
    print("  - Temporarily raising GPU power level")
    print("  - Reducing thread chunk size for faster UI yielding")
    print("  - Prioritizing visible content rendering")
    
    # Clean up
    if "TEST_DEVICE_TYPE" in os.environ:
        del os.environ["TEST_DEVICE_TYPE"]
    if "TEST_BATTERY_LEVEL" in os.environ:
        del os.environ["TEST_BATTERY_LEVEL"]
        
    # Demonstrate temperature adaptation
    print("\nDemonstrating temperature adaptation:")
    
    # Create optimizer
    optimizer = MobileDeviceOptimizer()
    
    # Show normal settings
    normal_profile = optimizer.get_optimization_profile()
    print(f"Normal temperature (25°C) - Mode: {normal_profile['power_efficiency']['mode']}, " +
          f"GPU level: {normal_profile['power_efficiency']['gpu_power_level']}")
    
    # Set high temperature
    optimizer.update_device_state(temperature_celsius=43)
    is_throttling = optimizer.detect_throttling()
    
    # Show throttled settings
    throttled_profile = optimizer.get_optimization_profile()
    print(f"High temperature (43°C) - Mode: {throttled_profile['power_efficiency']['mode']}, " +
          f"GPU level: {throttled_profile['power_efficiency']['gpu_power_level']}")
    print(f"Throttling detected: {is_throttling}")
    print("  Note: In production, this prevents overheating by:")
    print("  - Dynamically reducing computing power")
    print("  - Increasing render intervals to reduce heat")
    print("  - Temporarily using more efficient but lower quality settings")
    
    print("\nMobile device optimization testing complete")