#!/usr/bin/env python3
"""
Auto-tuning System for Model Parameters (July 2025)

This module provides automatic optimization of model parameters based on device capabilities:
- Runtime performance profiling for optimal configuration
- Parameter search space definition and exploration
- Bayesian optimization for efficient parameter tuning
- Reinforcement learning for dynamic adaptation
- Device-specific parameter optimization
- Performance feedback loop mechanism

Usage:
    from fixed_web_platform.auto_tuning_system import (
        AutoTuner,
        create_optimization_space,
        optimize_model_parameters,
        get_device_optimized_config
    )
    
    # Create auto-tuner with model configuration
    auto_tuner = AutoTuner(
        model_name="llama-7b",
        optimization_metric="latency",
        max_iterations=20
    )
    
    # Define parameter search space for optimization
    parameter_space = create_optimization_space(
        model_type="llm",
        device_capabilities={"memory_gb": 8, "compute_capabilities": "high"}
    )
    
    # Get device-optimized configuration
    optimized_config = get_device_optimized_config(
        model_name="llama-7b",
        hardware_info={"gpu_vendor": "nvidia", "memory_gb": 8}
    )
"""

import os
import sys
import json
import time
import math
import logging
import random
import platform
import threading
from typing import Dict, List, Any, Optional, Union, Tuple, Callable
from dataclasses import dataclass, field

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try to import optimization libraries if available
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    logger.warning("NumPy not available, using fallback optimization methods")

try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logger.warning("SciPy not available, using fallback statistical methods")

@dataclass
class Parameter:
    """Parameter definition for optimization."""
    name: str
    type: str  # "integer", "float", "categorical", "boolean"
    min_value: Optional[Union[int, float]] = None
    max_value: Optional[Union[int, float]] = None
    choices: Optional[List[Any]] = None
    default: Any = None
    step: Optional[Union[int, float]] = None
    log_scale: bool = False
    impact: str = "medium"  # "high", "medium", "low"
    depends_on: Optional[Dict[str, Any]] = None

@dataclass
class ParameterSpace:
    """Defines the search space for parameter optimization."""
    parameters: List[Parameter] = field(default_factory=list)
    constraints: List[Dict[str, Any]] = field(default_factory=list)
    
    def add_parameter(self, parameter: Parameter) -> None:
        """Add a parameter to the search space."""
        self.parameters.append(parameter)
    
    def add_constraint(self, constraint: Dict[str, Any]) -> None:
        """Add a constraint to the search space."""
        self.constraints.append(constraint)
    
    def validate_configuration(self, config: Dict[str, Any]) -> bool:
        """Validate if a configuration satisfies all constraints."""
        for constraint in self.constraints:
            if not self._check_constraint(constraint, config):
                return False
        return True
    
    def _check_constraint(self, constraint: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Check if a configuration satisfies a constraint."""
        constraint_type = constraint.get("type", "")
        
        if constraint_type == "max_sum":
            # Maximum sum constraint
            params = constraint.get("parameters", [])
            max_value = constraint.get("max_value", float("inf"))
            current_sum = sum(config.get(param, 0) for param in params)
            return current_sum <= max_value
            
        elif constraint_type == "dependency":
            # Parameter dependency constraint
            param = constraint.get("parameter", "")
            depends_on = constraint.get("depends_on", "")
            condition = constraint.get("condition", {})
            
            if param not in config or depends_on not in config:
                return False
                
            op = condition.get("operator", "==")
            value = condition.get("value")
            
            if op == "==" and config[depends_on] != value:
                return False
            elif op == "!=" and config[depends_on] == value:
                return False
            elif op == ">" and config[depends_on] <= value:
                return False
            elif op == ">=" and config[depends_on] < value:
                return False
            elif op == "<" and config[depends_on] >= value:
                return False
            elif op == "<=" and config[depends_on] > value:
                return False
                
        elif constraint_type == "exclusive":
            # Mutually exclusive parameters
            params = constraint.get("parameters", [])
            active_count = sum(1 for param in params if config.get(param, False))
            max_active = constraint.get("max_active", 1)
            return active_count <= max_active
            
        return True
    
    def sample_random_configuration(self) -> Dict[str, Any]:
        """Sample a random configuration from the parameter space."""
        config = {}
        
        for param in self.parameters:
            if param.type == "integer":
                if param.log_scale and param.min_value > 0 and param.max_value > 0:
                    # Log-scale sampling for integers
                    log_min = math.log(param.min_value)
                    log_max = math.log(param.max_value)
                    log_value = random.uniform(log_min, log_max)
                    value = int(math.exp(log_value))
                else:
                    # Linear sampling for integers
                    value = random.randint(param.min_value, param.max_value)
                    if param.step:
                        value = param.min_value + ((value - param.min_value) // param.step) * param.step
                
            elif param.type == "float":
                if param.log_scale and param.min_value > 0 and param.max_value > 0:
                    # Log-scale sampling for floats
                    log_min = math.log(param.min_value)
                    log_max = math.log(param.max_value)
                    log_value = random.uniform(log_min, log_max)
                    value = math.exp(log_value)
                else:
                    # Linear sampling for floats
                    value = random.uniform(param.min_value, param.max_value)
                    if param.step:
                        value = param.min_value + round((value - param.min_value) / param.step) * param.step
                
            elif param.type == "categorical":
                value = random.choice(param.choices)
                
            elif param.type == "boolean":
                value = random.choice([True, False])
            
            else:
                value = param.default
                
            config[param.name] = value
        
        # Ensure constraints are satisfied
        max_attempts = 100
        for _ in range(max_attempts):
            if self.validate_configuration(config):
                return config
                
            # If constraints are not satisfied, re-sample problematic parameters
            for constraint in self.constraints:
                if not self._check_constraint(constraint, config):
                    self._resample_for_constraint(constraint, config)
        
        # If we failed to satisfy constraints, return the default configuration
        return self.get_default_configuration()
    
    def _resample_for_constraint(self, constraint: Dict[str, Any], config: Dict[str, Any]) -> None:
        """Resample parameters to satisfy a constraint."""
        constraint_type = constraint.get("type", "")
        
        if constraint_type == "max_sum":
            # Resample for maximum sum constraint
            params = constraint.get("parameters", [])
            max_value = constraint.get("max_value", float("inf"))
            
            # Randomly select a parameter to reduce
            param_to_reduce = random.choice(params)
            param_def = next((p for p in self.parameters if p.name == param_to_reduce), None)
            
            if param_def:
                current_sum = sum(config.get(param, 0) for param in params)
                reduction_needed = current_sum - max_value
                
                if reduction_needed > 0:
                    # Reduce the selected parameter value
                    if param_def.type in ["integer", "float"]:
                        new_value = max(param_def.min_value, config[param_to_reduce] - reduction_needed)
                        config[param_to_reduce] = new_value
                        
        elif constraint_type == "dependency":
            # Resample for dependency constraint
            param = constraint.get("parameter", "")
            depends_on = constraint.get("depends_on", "")
            condition = constraint.get("condition", {})
            
            # We can either change the parameter or the dependency
            if random.choice([True, False]):
                # Change the parameter
                param_def = next((p for p in self.parameters if p.name == param), None)
                if param_def:
                    config[param] = self._sample_parameter(param_def)
            else:
                # Change the dependency
                depends_on_def = next((p for p in self.parameters if p.name == depends_on), None)
                if depends_on_def:
                    config[depends_on] = self._sample_parameter(depends_on_def)
                    
        elif constraint_type == "exclusive":
            # Resample for exclusive constraint
            params = constraint.get("parameters", [])
            max_active = constraint.get("max_active", 1)
            
            # Count active parameters
            active_params = [param for param in params if config.get(param, False)]
            
            if len(active_params) > max_active:
                # Randomly turn off some parameters
                params_to_deactivate = random.sample(active_params, len(active_params) - max_active)
                for param in params_to_deactivate:
                    config[param] = False
    
    def _sample_parameter(self, param: Parameter) -> Any:
        """Sample a single parameter value."""
        if param.type == "integer":
            if param.log_scale and param.min_value > 0 and param.max_value > 0:
                log_min = math.log(param.min_value)
                log_max = math.log(param.max_value)
                log_value = random.uniform(log_min, log_max)
                return int(math.exp(log_value))
            else:
                value = random.randint(param.min_value, param.max_value)
                if param.step:
                    value = param.min_value + ((value - param.min_value) // param.step) * param.step
                return value
                
        elif param.type == "float":
            if param.log_scale and param.min_value > 0 and param.max_value > 0:
                log_min = math.log(param.min_value)
                log_max = math.log(param.max_value)
                log_value = random.uniform(log_min, log_max)
                return math.exp(log_value)
            else:
                value = random.uniform(param.min_value, param.max_value)
                if param.step:
                    value = param.min_value + round((value - param.min_value) / param.step) * param.step
                return value
                
        elif param.type == "categorical":
            return random.choice(param.choices)
            
        elif param.type == "boolean":
            return random.choice([True, False])
            
        return param.default
    
    def get_default_configuration(self) -> Dict[str, Any]:
        """Get the default configuration for all parameters."""
        return {param.name: param.default for param in self.parameters}


class AutoTuner:
    """
    Auto-tuning system for model parameters based on device capabilities.
    """
    
    def __init__(self, model_name: str, optimization_metric: str = "latency", 
                max_iterations: int = 20, search_algorithm: str = "bayesian",
                device_info: Optional[Dict[str, Any]] = None):
        """
        Initialize the auto-tuning system.
        
        Args:
            model_name: Name of the model to optimize
            optimization_metric: Metric to optimize (latency, throughput, memory, quality)
            max_iterations: Maximum number of iterations for optimization
            search_algorithm: Algorithm to use for parameter search
            device_info: Device information for optimization
        """
        self.model_name = model_name
        self.optimization_metric = optimization_metric
        self.max_iterations = max_iterations
        self.search_algorithm = search_algorithm
        
        # Detect or use provided device information
        self.device_info = device_info or self._detect_device_info()
        
        # Create optimization space based on model
        self.parameter_space = self._create_parameter_space()
        
        # Tracking for optimization history
        self.evaluations = []
        self.best_configuration = None
        self.best_metric_value = float("inf") if optimization_metric in ["latency", "memory"] else float("-inf")
        self.iteration = 0
        
        # Performance tracking
        self.performance_data = {
            "start_time": time.time(),
            "end_time": None,
            "total_evaluations": 0,
            "total_time_ms": 0,
            "time_per_iteration_ms": [],
            "convergence_iteration": None,
            "improvement_trend": []
        }
        
        logger.info(f"Auto-tuner initialized for {model_name} with {self.parameter_space.parameters} parameters")
        logger.info(f"Optimizing for {optimization_metric} using {search_algorithm} algorithm")
    
    def _detect_device_info(self) -> Dict[str, Any]:
        """
        Detect device information for optimization.
        
        Returns:
            Dictionary with device information
        """
        device_info = {
            "platform": platform.system().lower(),
            "browser": self._detect_browser(),
            "memory_gb": self._detect_memory_gb(),
            "cpu_cores": os.cpu_count() or 4,
            "gpu_info": self._detect_gpu_info(),
            "network_speed": "fast",  # Assume fast network by default
            "battery_powered": self._detect_battery_powered()
        }
        
        return device_info
    
    def _detect_browser(self) -> Dict[str, Any]:
        """
        Detect browser information.
        
        Returns:
            Dictionary with browser information
        """
        # In a real implementation, this would use navigator.userAgent
        # For this simulation, use environment variables for testing
        
        browser_name = os.environ.get("TEST_BROWSER", "chrome").lower()
        browser_version = os.environ.get("TEST_BROWSER_VERSION", "115")
        
        try:
            browser_version = float(browser_version)
        except (ValueError, TypeError):
            browser_version = 115.0  # Default modern version
            
        return {
            "name": browser_name,
            "version": browser_version,
            "mobile": "mobile" in browser_name or "android" in browser_name or "ios" in browser_name
        }
    
    def _detect_memory_gb(self) -> float:
        """
        Detect available memory in GB.
        
        Returns:
            Available memory in GB
        """
        # Check for environment variable for testing
        test_memory = os.environ.get("TEST_MEMORY_GB", "")
        
        if test_memory:
            try:
                return float(test_memory)
            except (ValueError, TypeError):
                pass
        
        # Try to detect using psutil if available
        try:
            import psutil
            memory_gb = psutil.virtual_memory().available / (1024**3)
            return max(0.5, memory_gb)  # Ensure at least 0.5 GB
        except (ImportError, AttributeError):
            pass
        
        # Default value based on platform
        if platform.system() == "Darwin":  # macOS
            return 8.0
        elif platform.system() == "Windows":
            return 8.0
        else:  # Linux and others
            return 4.0
    
    def _detect_gpu_info(self) -> Dict[str, Any]:
        """
        Detect GPU information.
        
        Returns:
            Dictionary with GPU information
        """
        # Check for environment variables for testing
        test_gpu_vendor = os.environ.get("TEST_GPU_VENDOR", "").lower()
        test_gpu_model = os.environ.get("TEST_GPU_MODEL", "").lower()
        
        if test_gpu_vendor:
            return {
                "vendor": test_gpu_vendor,
                "model": test_gpu_model,
                "memory_gb": float(os.environ.get("TEST_GPU_MEMORY_GB", "4.0")),
                "compute_capabilities": os.environ.get("TEST_GPU_COMPUTE", "medium")
            }
        
        # Default values for different platforms
        if platform.system() == "Darwin":  # macOS
            return {
                "vendor": "apple",
                "model": "apple silicon",
                "memory_gb": 8.0,
                "compute_capabilities": "high"
            }
        elif platform.system() == "Windows":
            return {
                "vendor": "nvidia",  # Assume NVIDIA for simplicity
                "model": "generic",
                "memory_gb": 4.0,
                "compute_capabilities": "medium"
            }
        else:  # Linux and others
            return {
                "vendor": "generic",
                "model": "generic",
                "memory_gb": 2.0,
                "compute_capabilities": "medium"
            }
    
    def _detect_battery_powered(self) -> bool:
        """
        Detect if device is battery powered.
        
        Returns:
            Boolean indicating battery power
        """
        # Check for environment variable for testing
        test_battery = os.environ.get("TEST_BATTERY_POWERED", "").lower()
        
        if test_battery in ["true", "1", "yes"]:
            return True
        elif test_battery in ["false", "0", "no"]:
            return False
        
        # Try to detect using platform-specific methods
        if platform.system() == "Darwin":  # macOS
            # Check if it's a MacBook
            try:
                import subprocess
                result = subprocess.run(["system_profiler", "SPHardwareDataType"], 
                                       capture_output=True, text=True, check=False)
                return "MacBook" in result.stdout
            except (FileNotFoundError, subprocess.SubprocessError):
                pass
                
        elif platform.system() == "Windows":
            # Check if it's a laptop
            try:
                import subprocess
                result = subprocess.run(["powercfg", "/batteryreport"], 
                                      capture_output=True, text=True, check=False)
                return "Battery" in result.stdout
            except (FileNotFoundError, subprocess.SubprocessError):
                pass
                
        elif platform.system() == "Linux":
            # Check for battery files
            try:
                battery_path = "/sys/class/power_supply/BAT0"
                return os.path.exists(battery_path)
            except:
                pass
        
        # Default to desktop (non-battery) for safety
        return False
    
    def _create_parameter_space(self) -> ParameterSpace:
        """
        Create parameter space for optimization based on model and device.
        
        Returns:
            ParameterSpace object with parameters to optimize
        """
        # Extract model type from name
        model_type = self._detect_model_type(self.model_name)
        
        # Create parameter space based on model type
        space = ParameterSpace()
        
        if model_type == "llm":
            # LLM-specific parameters
            # Batch size has high impact on performance
            space.add_parameter(Parameter(
                name="batch_size",
                type="integer",
                min_value=1,
                max_value=32,
                default=4,
                impact="high"
            ))
            
            # Precision settings affect both performance and quality
            space.add_parameter(Parameter(
                name="precision",
                type="categorical",
                choices=["4bit", "8bit", "16bit", "mixed"],
                default="mixed",
                impact="high"
            ))
            
            # KV cache parameters for attention
            space.add_parameter(Parameter(
                name="kv_cache_precision",
                type="categorical",
                choices=["4bit", "8bit", "16bit"],
                default="8bit",
                impact="medium"
            ))
            
            space.add_parameter(Parameter(
                name="max_tokens_in_kv_cache",
                type="integer",
                min_value=512,
                max_value=8192,
                default=2048,
                step=512,
                impact="medium"
            ))
            
            # CPU threading parameters
            space.add_parameter(Parameter(
                name="cpu_threads",
                type="integer",
                min_value=1,
                max_value=max(1, self.device_info["cpu_cores"]),
                default=max(1, self.device_info["cpu_cores"] // 2),
                impact="medium"
            ))
            
            # Memory optimization parameters
            space.add_parameter(Parameter(
                name="use_memory_optimizations",
                type="boolean",
                default=True,
                impact="medium"
            ))
            
            # Add WebGPU-specific parameters if available memory is sufficient
            if self.device_info["memory_gb"] >= 2.0:
                space.add_parameter(Parameter(
                    name="use_webgpu",
                    type="boolean",
                    default=True,
                    impact="high"
                ))
                
                space.add_parameter(Parameter(
                    name="webgpu_workgroup_size",
                    type="categorical",
                    choices=[(64, 1, 1), (128, 1, 1), (256, 1, 1)],
                    default=(128, 1, 1),
                    impact="medium",
                    depends_on={"use_webgpu": True}
                ))
                
                space.add_parameter(Parameter(
                    name="shader_precompilation",
                    type="boolean",
                    default=True,
                    impact="medium",
                    depends_on={"use_webgpu": True}
                ))
                
            # Constraints
            # Maximum memory constraint
            space.add_constraint({
                "type": "max_sum",
                "parameters": ["batch_size", "max_tokens_in_kv_cache"],
                "max_value": self._calculate_max_sequence_budget()
            })
            
            # Dependency constraints
            space.add_constraint({
                "type": "dependency",
                "parameter": "webgpu_workgroup_size",
                "depends_on": "use_webgpu",
                "condition": {"operator": "==", "value": True}
            })
            
            space.add_constraint({
                "type": "dependency",
                "parameter": "shader_precompilation",
                "depends_on": "use_webgpu",
                "condition": {"operator": "==", "value": True}
            })
            
        elif model_type == "vision":
            # Vision model parameters
            space.add_parameter(Parameter(
                name="batch_size",
                type="integer",
                min_value=1,
                max_value=16,
                default=1,
                impact="high"
            ))
            
            space.add_parameter(Parameter(
                name="precision",
                type="categorical",
                choices=["8bit", "16bit", "mixed"],
                default="mixed",
                impact="high"
            ))
            
            space.add_parameter(Parameter(
                name="image_size",
                type="integer",
                min_value=224,
                max_value=512,
                default=224,
                step=32,
                impact="high"
            ))
            
            # WebGPU parameters for vision models
            if self.device_info["memory_gb"] >= 2.0:
                space.add_parameter(Parameter(
                    name="use_webgpu",
                    type="boolean",
                    default=True,
                    impact="high"
                ))
                
                space.add_parameter(Parameter(
                    name="shader_precompilation",
                    type="boolean",
                    default=True,
                    impact="medium",
                    depends_on={"use_webgpu": True}
                ))
                
                space.add_parameter(Parameter(
                    name="feature_map_optimization",
                    type="boolean",
                    default=True,
                    impact="medium",
                    depends_on={"use_webgpu": True}
                ))
            
        elif model_type == "audio":
            # Audio model parameters
            space.add_parameter(Parameter(
                name="chunk_length_seconds",
                type="float",
                min_value=1.0,
                max_value=30.0,
                default=5.0,
                impact="high"
            ))
            
            space.add_parameter(Parameter(
                name="precision",
                type="categorical",
                choices=["8bit", "16bit", "mixed"],
                default="mixed",
                impact="high"
            ))
            
            space.add_parameter(Parameter(
                name="sample_rate",
                type="integer",
                min_value=8000,
                max_value=44100,
                default=16000,
                impact="medium"
            ))
            
            # WebGPU parameters for audio models
            if self.device_info["memory_gb"] >= 2.0:
                space.add_parameter(Parameter(
                    name="use_webgpu",
                    type="boolean",
                    default=True,
                    impact="high"
                ))
                
                space.add_parameter(Parameter(
                    name="use_compute_shaders",
                    type="boolean",
                    default=True,
                    impact="high",
                    depends_on={"use_webgpu": True}
                ))
                
                space.add_parameter(Parameter(
                    name="webgpu_optimized_fft",
                    type="boolean",
                    default=True,
                    impact="medium",
                    depends_on={"use_compute_shaders": True}
                ))
        
        else:
            # Generic parameters for unknown model types
            space.add_parameter(Parameter(
                name="batch_size",
                type="integer",
                min_value=1,
                max_value=8,
                default=1,
                impact="high"
            ))
            
            space.add_parameter(Parameter(
                name="precision",
                type="categorical",
                choices=["8bit", "16bit", "mixed"],
                default="mixed",
                impact="high"
            ))
            
            space.add_parameter(Parameter(
                name="use_webgpu",
                type="boolean",
                default=True,
                impact="high"
            ))
            
        # Add common parameters for all model types
        
        # Thread chunk size affects UI responsiveness
        space.add_parameter(Parameter(
            name="thread_chunk_size_ms",
            type="integer",
            min_value=1,
            max_value=20,
            default=5,
            impact="medium"
        ))
        
        # Progressive loading for better user experience
        space.add_parameter(Parameter(
            name="progressive_loading",
            type="boolean",
            default=True,
            impact="low"
        ))
        
        # Modify parameter space based on device constraints
        self._apply_device_constraints(space)
        
        return space
    
    def _detect_model_type(self, model_name: str) -> str:
        """
        Detect model type from model name.
        
        Args:
            model_name: Name of the model
            
        Returns:
            Model type (llm, vision, audio, multimodal, etc.)
        """
        model_name_lower = model_name.lower()
        
        # Check for LLM models
        if any(name in model_name_lower for name in ["llama", "gpt", "palm", "qwen", "llm", "t5", "falcon"]):
            return "llm"
            
        # Check for vision models
        elif any(name in model_name_lower for name in ["vit", "clip", "resnet", "efficientnet", "vision"]):
            return "vision"
            
        # Check for audio models
        elif any(name in model_name_lower for name in ["whisper", "wav2vec", "hubert", "speecht5", "audio"]):
            return "audio"
            
        # Check for multimodal models
        elif any(name in model_name_lower for name in ["llava", "blip", "flava", "multimodal"]):
            return "multimodal"
            
        # Default to generic
        return "generic"
    
    def _calculate_max_sequence_budget(self) -> int:
        """
        Calculate maximum sequence budget based on available memory.
        
        Returns:
            Maximum sequence budget
        """
        # Estimate maximum tokens based on available memory
        # This is a very rough heuristic
        memory_gb = self.device_info["memory_gb"]
        
        # Base token budget: roughly 1M tokens per GB of memory
        base_budget = int(memory_gb * 1000000)
        
        # Adjust for batch size and sequence length trade-off
        # We want: batch_size * max_sequence_length <= max_token_budget
        max_token_budget = base_budget // 1000  # Simplify for easier calculation
        
        return max_token_budget
    
    def _apply_device_constraints(self, space: ParameterSpace) -> None:
        """
        Apply device-specific constraints to parameter space.
        
        Args:
            space: Parameter space to modify
        """
        # Memory constraints
        memory_gb = self.device_info["memory_gb"]
        
        # Update batch size limits based on available memory
        batch_size_param = next((p for p in space.parameters if p.name == "batch_size"), None)
        if batch_size_param:
            if memory_gb < 2.0:
                # Very limited memory
                batch_size_param.max_value = min(batch_size_param.max_value, 2)
                batch_size_param.default = 1
            elif memory_gb < 4.0:
                # Limited memory
                batch_size_param.max_value = min(batch_size_param.max_value, 4)
                batch_size_param.default = min(batch_size_param.default, 2)
        
        # Precision constraints for memory-limited devices
        precision_param = next((p for p in space.parameters if p.name == "precision"), None)
        if precision_param and memory_gb < 2.0:
            # Remove high-precision options for very limited memory
            if "16bit" in precision_param.choices:
                precision_param.choices = [c for c in precision_param.choices if c != "16bit"]
                if precision_param.default == "16bit":
                    precision_param.default = "8bit"
        
        # WebGPU constraints for browsers
        browser = self.device_info["browser"]
        webgpu_param = next((p for p in space.parameters if p.name == "use_webgpu"), None)
        
        if webgpu_param:
            if browser["name"] == "safari" and browser["version"] < 17.0:
                # Older Safari doesn't support WebGPU well
                webgpu_param.default = False
            
            # Modify workgroup size defaults based on browser vendor
            workgroup_param = next((p for p in space.parameters if p.name == "webgpu_workgroup_size"), None)
            if workgroup_param:
                if browser["name"] == "firefox":
                    # Firefox performs better with 256x1x1
                    workgroup_param.default = (256, 1, 1)
                elif browser["name"] == "safari":
                    # Safari performs better with smaller workgroups
                    workgroup_param.default = (64, 1, 1)
        
        # Battery-powered device constraints
        if self.device_info["battery_powered"]:
            # Reduce thread count for battery-powered devices
            cpu_threads_param = next((p for p in space.parameters if p.name == "cpu_threads"), None)
            if cpu_threads_param:
                cpu_threads_param.default = max(1, min(cpu_threads_param.default, 
                                                    self.device_info["cpu_cores"] // 2))
    
    def run_optimization(self, evaluation_function: Callable[[Dict[str, Any]], float],
                        callbacks: Optional[Dict[str, Callable]] = None) -> Dict[str, Any]:
        """
        Run parameter optimization using the specified algorithm.
        
        Args:
            evaluation_function: Function to evaluate a configuration
            callbacks: Optional callbacks for optimization events
            
        Returns:
            Dictionary with optimization results
        """
        # Initialize callbacks
        if callbacks is None:
            callbacks = {}
            
        # Default callbacks (do nothing)
        default_callbacks = {
            "on_iteration_complete": lambda i, config, value: None,
            "on_best_found": lambda i, config, value: None,
            "on_optimization_complete": lambda best_config, history: None
        }
        
        # Merge with provided callbacks
        for key, default_func in default_callbacks.items():
            if key not in callbacks:
                callbacks[key] = default_func
        
        # Run optimization loop
        start_time = time.time()
        
        logger.info(f"Starting {self.search_algorithm} optimization for {self.max_iterations} iterations")
        
        for i in range(self.max_iterations):
            self.iteration = i
            iteration_start = time.time()
            
            # Sample configuration based on algorithm
            if self.search_algorithm == "random":
                config = self.parameter_space.sample_random_configuration()
            elif self.search_algorithm == "bayesian":
                config = self._sample_bayesian_configuration()
            elif self.search_algorithm == "grid":
                config = self._sample_grid_configuration(i)
            else:
                # Default to random search
                config = self.parameter_space.sample_random_configuration()
            
            # Evaluate configuration
            try:
                metric_value = evaluation_function(config)
            except Exception as e:
                logger.error(f"Error evaluating configuration: {e}")
                # Use a conservative value for failures
                if self.optimization_metric in ["latency", "memory"]:
                    metric_value = float("inf")  # Bad value for metrics to minimize
                else:
                    metric_value = float("-inf")  # Bad value for metrics to maximize
            
            # Record evaluation
            evaluation = {
                "iteration": i,
                "configuration": config,
                "metric_value": metric_value,
                "timestamp": time.time()
            }
            
            self.evaluations.append(evaluation)
            
            # Update best configuration if needed
            self._update_best_configuration(config, metric_value)
            
            # Calculate improvement over default
            if i == 0:
                # First iteration is a reference point
                initial_value = metric_value
            else:
                # Calculate improvement percentage
                if self.optimization_metric in ["latency", "memory"]:
                    # For metrics to minimize, lower is better
                    improvement = (initial_value - self.best_metric_value) / initial_value
                else:
                    # For metrics to maximize, higher is better
                    improvement = (self.best_metric_value - initial_value) / abs(initial_value) if initial_value != 0 else 1.0
                    
                self.performance_data["improvement_trend"].append(improvement)
            
            # Calculate convergence
            if i >= 5 and self.performance_data["convergence_iteration"] is None:
                # Check if we've converged (no significant improvement in last 5 iterations)
                recent_values = [e["metric_value"] for e in self.evaluations[-5:]]
                
                if self.optimization_metric in ["latency", "memory"]:
                    # For metrics to minimize, check if improvement is small
                    min_recent = min(recent_values)
                    improvement_ratio = abs(min_recent - self.best_metric_value) / self.best_metric_value
                    
                    if improvement_ratio < 0.01:  # Less than 1% improvement
                        self.performance_data["convergence_iteration"] = i
                else:
                    # For metrics to maximize, check if improvement is small
                    max_recent = max(recent_values)
                    improvement_ratio = abs(max_recent - self.best_metric_value) / abs(self.best_metric_value) if self.best_metric_value != 0 else 0
                    
                    if improvement_ratio < 0.01:  # Less than 1% improvement
                        self.performance_data["convergence_iteration"] = i
            
            # Call iteration callback
            callbacks["on_iteration_complete"](i, config, metric_value)
            
            # Call best found callback if this is the current best
            if (self.optimization_metric in ["latency", "memory"] and metric_value == self.best_metric_value) or \
               (self.optimization_metric not in ["latency", "memory"] and metric_value == self.best_metric_value):
                callbacks["on_best_found"](i, config, metric_value)
            
            # Record iteration time
            iteration_time = (time.time() - iteration_start) * 1000  # in ms
            self.performance_data["time_per_iteration_ms"].append(iteration_time)
        
        # Calculate final performance data
        self.performance_data["end_time"] = time.time()
        self.performance_data["total_time_ms"] = (self.performance_data["end_time"] - self.performance_data["start_time"]) * 1000
        self.performance_data["total_evaluations"] = len(self.evaluations)
        
        # Call optimization complete callback
        callbacks["on_optimization_complete"](self.best_configuration, self.evaluations)
        
        # Create and return results
        results = {
            "best_configuration": self.best_configuration,
            "best_metric_value": self.best_metric_value,
            "improvement_over_default": self._calculate_improvement_over_default(),
            "evaluations": self.evaluations,
            "performance_data": self.performance_data,
            "parameter_importance": self._calculate_parameter_importance()
        }
        
        logger.info(f"Optimization complete. Best {self.optimization_metric}: {self.best_metric_value}")
        logger.info(f"Improvement over default: {results['improvement_over_default']:.2%}")
        
        return results
    
    def _sample_bayesian_configuration(self) -> Dict[str, Any]:
        """
        Sample next configuration using Bayesian optimization.
        
        Returns:
            Next configuration to evaluate
        """
        # If we don't have enough evaluations, use random sampling
        if len(self.evaluations) < 5:
            return self.parameter_space.sample_random_configuration()
        
        if not NUMPY_AVAILABLE or not SCIPY_AVAILABLE:
            # Fallback to random search without NumPy/SciPy
            return self.parameter_space.sample_random_configuration()
        
        # Extract evaluated configurations and values
        X = []  # Configurations as feature vectors
        y = []  # Corresponding metric values
        
        # Convert configurations to feature vectors
        for evaluation in self.evaluations:
            features = self._config_to_features(evaluation["configuration"])
            X.append(features)
            y.append(evaluation["metric_value"])
        
        # Convert to numpy arrays
        X = np.array(X)
        y = np.array(y)
        
        # Fit Gaussian Process model
        from sklearn.gaussian_process import GaussianProcessRegressor
        from sklearn.gaussian_process.kernels import Matern
        
        # Normalize y values (important for GP)
        if self.optimization_metric in ["latency", "memory"]:
            # For metrics to minimize, transform to negative for maximization
            y_norm = -1 * (y - np.min(y)) / (np.max(y) - np.min(y) + 1e-10)
        else:
            # For metrics to maximize, just normalize
            y_norm = (y - np.min(y)) / (np.max(y) - np.min(y) + 1e-10)
        
        # Fit GP model
        kernel = Matern(nu=2.5)
        gp = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=5, normalize_y=True)
        gp.fit(X, y_norm)
        
        # Sample candidate configurations
        n_candidates = 10
        candidate_configs = []
        
        for _ in range(n_candidates):
            candidate = self.parameter_space.sample_random_configuration()
            candidate_configs.append(candidate)
        
        # Convert candidates to feature vectors
        candidate_features = np.array([self._config_to_features(c) for c in candidate_configs])
        
        # Compute acquisition function (Expected Improvement)
        mu, sigma = gp.predict(candidate_features, return_std=True)
        
        # Best observed value so far
        if self.optimization_metric in ["latency", "memory"]:
            best_value = np.max(y_norm)  # Max of transformed values
        else:
            best_value = np.max(y_norm)
        
        # Calculate expected improvement
        imp = mu - best_value
        Z = np.where(sigma > 0, imp / sigma, 0)
        ei = imp * stats.norm.cdf(Z) + sigma * stats.norm.pdf(Z)
        
        # Select best candidate
        best_idx = np.argmax(ei)
        best_candidate = candidate_configs[best_idx]
        
        return best_candidate
    
    def _sample_grid_configuration(self, iteration: int) -> Dict[str, Any]:
        """
        Sample next configuration using grid search.
        
        Args:
            iteration: Current iteration
            
        Returns:
            Next configuration to evaluate
        """
        # Calculate grid size based on max iterations and number of parameters
        num_parameters = len(self.parameter_space.parameters)
        grid_points_per_dim = max(2, int(math.pow(self.max_iterations, 1.0 / num_parameters)))
        
        # Create grid configuration
        config = {}
        
        # Calculate multi-dimensional grid index
        remaining_index = iteration
        for param in self.parameter_space.parameters:
            # Calculate grid position for this parameter
            position = remaining_index % grid_points_per_dim
            remaining_index //= grid_points_per_dim
            
            if param.type == "integer":
                # Evenly spaced values across range
                if param.log_scale and param.min_value > 0:
                    log_min = math.log(param.min_value)
                    log_max = math.log(param.max_value)
                    log_step = (log_max - log_min) / (grid_points_per_dim - 1)
                    value = int(round(math.exp(log_min + position * log_step)))
                else:
                    # Linear spacing
                    value_range = param.max_value - param.min_value
                    step = value_range / (grid_points_per_dim - 1)
                    value = int(round(param.min_value + position * step))
                    if param.step:
                        value = param.min_value + ((value - param.min_value) // param.step) * param.step
                        
            elif param.type == "float":
                # Evenly spaced values across range
                if param.log_scale and param.min_value > 0:
                    log_min = math.log(param.min_value)
                    log_max = math.log(param.max_value)
                    log_step = (log_max - log_min) / (grid_points_per_dim - 1)
                    value = math.exp(log_min + position * log_step)
                else:
                    # Linear spacing
                    value_range = param.max_value - param.min_value
                    step = value_range / (grid_points_per_dim - 1)
                    value = param.min_value + position * step
                    if param.step:
                        value = param.min_value + round((value - param.min_value) / param.step) * param.step
                        
            elif param.type == "categorical":
                # Cycle through categorical choices
                num_choices = len(param.choices)
                value = param.choices[position % num_choices]
                
            elif param.type == "boolean":
                # Alternate boolean values
                value = (position % 2) == 0
                
            else:
                value = param.default
                
            config[param.name] = value
        
        # Ensure configuration satisfies all constraints
        if not self.parameter_space.validate_configuration(config):
            # If invalid, fall back to random configuration
            return self.parameter_space.sample_random_configuration()
            
        return config
    
    def _config_to_features(self, config: Dict[str, Any]) -> List[float]:
        """
        Convert configuration dictionary to feature vector for ML algorithms.
        
        Args:
            config: Configuration dictionary
            
        Returns:
            Feature vector representation
        """
        features = []
        
        for param in self.parameter_space.parameters:
            if param.name not in config:
                # Use default value if missing
                value = param.default
            else:
                value = config[param.name]
                
            if param.type == "integer" or param.type == "float":
                # Normalize to [0, 1]
                if param.max_value == param.min_value:
                    normalized = 0.5  # Default if range is zero
                else:
                    normalized = (value - param.min_value) / (param.max_value - param.min_value)
                features.append(normalized)
                
            elif param.type == "categorical":
                # One-hot encoding for categorical values
                for choice in param.choices:
                    features.append(1.0 if value == choice else 0.0)
                    
            elif param.type == "boolean":
                # Boolean as 0/1
                features.append(1.0 if value else 0.0)
                
        return features
    
    def _update_best_configuration(self, config: Dict[str, Any], metric_value: float) -> None:
        """
        Update best configuration if needed.
        
        Args:
            config: Configuration to evaluate
            metric_value: Metric value for the configuration
        """
        is_better = False
        
        if self.optimization_metric in ["latency", "memory"]:
            # For these metrics, lower is better
            if metric_value < self.best_metric_value:
                is_better = True
        else:
            # For all other metrics, higher is better
            if metric_value > self.best_metric_value:
                is_better = True
                
        if is_better:
            self.best_configuration = config.copy()
            self.best_metric_value = metric_value
            
    def _calculate_improvement_over_default(self) -> float:
        """
        Calculate improvement of best configuration over default.
        
        Returns:
            Improvement as a ratio
        """
        if not self.evaluations:
            return 0.0
            
        # Get default configuration
        default_config = self.parameter_space.get_default_configuration()
        
        # Find evaluation with default configuration or closest to it
        default_evaluation = None
        for evaluation in self.evaluations:
            config = evaluation["configuration"]
            if all(config.get(param.name) == default_config.get(param.name) for param in self.parameter_space.parameters):
                default_evaluation = evaluation
                break
                
        if not default_evaluation:
            # Use first evaluation as baseline if no default was evaluated
            default_evaluation = self.evaluations[0]
            
        default_value = default_evaluation["metric_value"]
        
        # Calculate improvement
        if self.optimization_metric in ["latency", "memory"]:
            # For metrics to minimize, improvement is reduction
            improvement = (default_value - self.best_metric_value) / default_value
        else:
            # For metrics to maximize, improvement is increase
            improvement = (self.best_metric_value - default_value) / abs(default_value) if default_value != 0 else 1.0
            
        return improvement
    
    def _calculate_parameter_importance(self) -> Dict[str, float]:
        """
        Calculate importance of each parameter based on evaluations.
        
        Returns:
            Dictionary mapping parameter names to importance scores
        """
        if len(self.evaluations) < 5:
            # Not enough data for meaningful analysis
            return {param.name: 0.0 for param in self.parameter_space.parameters}
            
        if not NUMPY_AVAILABLE:
            # Fallback without NumPy
            return {param.name: 0.0 for param in self.parameter_space.parameters}
            
        # Convert evaluations to feature matrix
        X = []  # Configurations as feature vectors
        y = []  # Corresponding metric values
        
        for evaluation in self.evaluations:
            X.append(self._config_to_features(evaluation["configuration"]))
            y.append(evaluation["metric_value"])
            
        X = np.array(X)
        y = np.array(y)
        
        # Normalize y values
        if self.optimization_metric in ["latency", "memory"]:
            # For metrics to minimize, lower is better (negate to match correlation direction)
            y_norm = -1 * (y - np.min(y)) / (np.max(y) - np.min(y) + 1e-10)
        else:
            # For metrics to maximize, higher is better
            y_norm = (y - np.min(y)) / (np.max(y) - np.min(y) + 1e-10)
            
        # Calculate correlation for each feature
        corrs = []
        for i in range(X.shape[1]):
            if np.std(X[:, i]) > 0:
                corr = np.corrcoef(X[:, i], y_norm)[0, 1]
                corrs.append((i, abs(corr)))
            else:
                corrs.append((i, 0.0))
                
        # Sort by correlation magnitude
        corrs.sort(key=lambda x: x[1], reverse=True)
        
        # Map feature indices back to parameter names
        feature_idx = 0
        param_importance = {}
        
        for param in self.parameter_space.parameters:
            if param.type in ["integer", "float"]:
                # Single numerical feature
                importance = next((corr for idx, corr in corrs if idx == feature_idx), 0.0)
                param_importance[param.name] = importance
                feature_idx += 1
                
            elif param.type == "categorical":
                # Multiple one-hot features
                importance = max((corr for idx, corr in corrs if feature_idx <= idx < feature_idx + len(param.choices)), default=0.0)
                param_importance[param.name] = importance
                feature_idx += len(param.choices)
                
            elif param.type == "boolean":
                # Single boolean feature
                importance = next((corr for idx, corr in corrs if idx == feature_idx), 0.0)
                param_importance[param.name] = importance
                feature_idx += 1
                
        # Normalize importances to sum to 1.0
        total_importance = sum(param_importance.values())
        if total_importance > 0:
            param_importance = {param: value / total_importance for param, value in param_importance.items()}
            
        return param_importance
    
    def suggest_configuration(self, hardware_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Suggest a configuration based on hardware information.
        
        Args:
            hardware_info: Hardware information for the suggestion
            
        Returns:
            Suggested configuration
        """
        # Use provided hardware info or detected info
        hw_info = hardware_info or self.device_info
        
        # If we have enough evaluations, suggest based on optimization
        if self.best_configuration:
            return self.best_configuration
            
        # Otherwise, suggest a sensible default based on hardware
        default_config = self.parameter_space.get_default_configuration()
        
        # Adjust config based on hardware
        memory_gb = hw_info.get("memory_gb", 4.0)
        if memory_gb < 2.0:
            # Limited memory
            for param in self.parameter_space.parameters:
                if param.name == "batch_size":
                    default_config[param.name] = 1
                elif param.name == "precision":
                    default_config[param.name] = "8bit" if "8bit" in param.choices else param.default
                    
        # Adjust for battery-powered devices
        if hw_info.get("battery_powered", False):
            for param in self.parameter_space.parameters:
                if param.name == "cpu_threads":
                    default_config[param.name] = max(1, hw_info.get("cpu_cores", 4) // 2)
                    
        # Adjust for WebGPU compatibility
        browser = hw_info.get("browser", {})
        browser_name = browser.get("name", "").lower()
        
        if browser_name == "safari" and browser.get("version", 0) < 17.0:
            # Older Safari doesn't support WebGPU well
            for param in self.parameter_space.parameters:
                if param.name == "use_webgpu":
                    default_config[param.name] = False
                    
        # Return adjusted configuration
        return default_config
    
    def run_self_optimization(self, model_config: Dict[str, Any], 
                            test_inputs: List[Any], iterations: int = 10) -> Dict[str, Any]:
        """
        Run self-optimization by testing actual model performance.
        
        Args:
            model_config: Base model configuration
            test_inputs: Inputs to test model performance
            iterations: Number of optimization iterations
            
        Returns:
            Optimization results
        """
        # This method would create and test actual model instances
        # In this implementation, we'll simulate it
        
        # Define evaluation function
        def evaluate_config(config):
            # In a real implementation, this would:
            # 1. Create a model with the given configuration
            # 2. Run inference on test inputs
            # 3. Measure performance metrics
            
            # Simulate latency based on configuration
            simulated_latency = self._simulate_latency(config, test_inputs)
            
            # Return appropriate metric
            if self.optimization_metric == "latency":
                return simulated_latency
            elif self.optimization_metric == "throughput":
                # Higher throughput is better
                return len(test_inputs) / simulated_latency if simulated_latency > 0 else 0
            elif self.optimization_metric == "memory":
                # Simulate memory usage
                return self._simulate_memory_usage(config)
            else:
                # Default to latency
                return simulated_latency
        
        # Run optimization with reduced number of iterations
        self.max_iterations = min(iterations, self.max_iterations)
        return self.run_optimization(evaluate_config)
    
    def _simulate_latency(self, config: Dict[str, Any], test_inputs: List[Any]) -> float:
        """
        Simulate latency for a configuration.
        
        Args:
            config: Model configuration
            test_inputs: Test inputs
            
        Returns:
            Simulated latency in seconds
        """
        # Base latency depends on model type
        model_type = self._detect_model_type(self.model_name)
        
        if model_type == "llm":
            base_latency = 1.0
        elif model_type == "vision":
            base_latency = 0.2
        elif model_type == "audio":
            base_latency = 0.5
        else:
            base_latency = 0.3
            
        # Adjust for batch size
        batch_size = config.get("batch_size", 1)
        batch_factor = math.sqrt(batch_size)  # Sub-linear scaling with batch size
        
        # Adjust for precision
        precision = config.get("precision", "mixed")
        if precision == "4bit":
            precision_factor = 0.7  # 4-bit is faster
        elif precision == "8bit":
            precision_factor = 0.8  # 8-bit is faster than 16-bit
        elif precision == "16bit":
            precision_factor = 1.0  # Base precision
        else:  # mixed
            precision_factor = 0.9
            
        # Adjust for WebGPU
        use_webgpu = config.get("use_webgpu", False)
        if use_webgpu:
            webgpu_factor = 0.5  # WebGPU is faster
            
            # Adjust for shader precompilation
            shader_precompilation = config.get("shader_precompilation", False)
            if shader_precompilation:
                webgpu_factor *= 0.9  # Precompilation improves performance
                
            # Adjust for compute shaders
            use_compute_shaders = config.get("use_compute_shaders", False)
            if use_compute_shaders and model_type == "audio":
                webgpu_factor *= 0.8  # Compute shaders improve audio performance
        else:
            webgpu_factor = 1.0
            
        # Adjust for CPU threads
        cpu_threads = config.get("cpu_threads", self.device_info["cpu_cores"])
        cpu_factor = math.sqrt(self.device_info["cpu_cores"] / max(1, cpu_threads))
        
        # Calculate final latency
        latency = base_latency * batch_factor * precision_factor * webgpu_factor * cpu_factor
        
        # Add noise for realism
        noise_factor = random.uniform(0.9, 1.1)
        latency *= noise_factor
        
        return latency
    
    def _simulate_memory_usage(self, config: Dict[str, Any]) -> float:
        """
        Simulate memory usage for a configuration.
        
        Args:
            config: Model configuration
            
        Returns:
            Simulated memory usage in MB
        """
        # Base memory depends on model type
        model_type = self._detect_model_type(self.model_name)
        
        if model_type == "llm":
            # Estimate based on name
            model_name_lower = self.model_name.lower()
            
            if "70b" in model_name_lower:
                base_memory = 70000  # 70B model in MB
            elif "13b" in model_name_lower:
                base_memory = 13000  # 13B model in MB
            elif "7b" in model_name_lower:
                base_memory = 7000   # 7B model in MB
            else:
                base_memory = 5000   # Default size
                
        elif model_type == "vision":
            base_memory = 1000
        elif model_type == "audio":
            base_memory = 2000
        else:
            base_memory = 1500
            
        # Adjust for batch size
        batch_size = config.get("batch_size", 1)
        memory_scaling = 1.0 + 0.8 * (batch_size - 1)  # Sub-linear scaling with batch size
        
        # Adjust for precision
        precision = config.get("precision", "mixed")
        if precision == "4bit":
            precision_factor = 0.25  # 4-bit uses ~1/4 the memory
        elif precision == "8bit":
            precision_factor = 0.5   # 8-bit uses ~1/2 the memory
        elif precision == "16bit":
            precision_factor = 1.0   # Base precision
        else:  # mixed
            precision_factor = 0.7
            
        # Adjust for memory optimizations
        use_memory_optimizations = config.get("use_memory_optimizations", True)
        memory_factor = 0.8 if use_memory_optimizations else 1.0
        
        # Calculate final memory usage
        memory_usage = base_memory * memory_scaling * precision_factor * memory_factor
        
        # Add noise for realism
        noise_factor = random.uniform(0.95, 1.05)
        memory_usage *= noise_factor
        
        return memory_usage


def create_optimization_space(model_type: str, device_capabilities: Dict[str, Any]) -> ParameterSpace:
    """
    Create a parameter optimization space based on model type and device capabilities.
    
    Args:
        model_type: Type of model (llm, vision, audio, multimodal)
        device_capabilities: Dictionary with device capabilities
        
    Returns:
        ParameterSpace object with parameters to optimize
    """
    space = ParameterSpace()
    
    memory_gb = device_capabilities.get("memory_gb", 4.0)
    compute_capability = device_capabilities.get("compute_capabilities", "medium")
    
    # Compute capability factor (0.5 for low, 1.0 for medium, 2.0 for high)
    compute_factor = 0.5 if compute_capability == "low" else 2.0 if compute_capability == "high" else 1.0
    
    # Add parameters based on model type
    if model_type == "llm":
        # LLM-specific parameters
        max_batch_size = max(1, min(32, int(4 * compute_factor)))
        space.add_parameter(Parameter(
            name="batch_size",
            type="integer",
            min_value=1,
            max_value=max_batch_size,
            default=min(4, max_batch_size),
            impact="high"
        ))
        
        # Add precision options based on memory
        precision_choices = ["4bit", "8bit", "mixed", "16bit"] if memory_gb >= 4.0 else ["4bit", "8bit", "mixed"]
        space.add_parameter(Parameter(
            name="precision",
            type="categorical",
            choices=precision_choices,
            default="mixed",
            impact="high"
        ))
        
        # KV cache parameters
        space.add_parameter(Parameter(
            name="kv_cache_precision",
            type="categorical",
            choices=["4bit", "8bit", "16bit"],
            default="8bit",
            impact="medium"
        ))
        
        # Token limit based on memory
        max_tokens = max(512, min(8192, int(memory_gb * 1000)))
        space.add_parameter(Parameter(
            name="max_tokens_in_kv_cache",
            type="integer",
            min_value=512,
            max_value=max_tokens,
            default=2048,
            step=512,
            impact="medium"
        ))
        
        # Add other parameters as before
        # ...
        
    # Similar blocks for vision, audio, multimodal with appropriate parameters
    # ...
    
    # Common parameters for all model types
    cpu_cores = device_capabilities.get("cpu_cores", 4)
    space.add_parameter(Parameter(
        name="cpu_threads",
        type="integer",
        min_value=1,
        max_value=cpu_cores,
        default=max(1, cpu_cores // 2),
        impact="medium"
    ))
    
    space.add_parameter(Parameter(
        name="thread_chunk_size_ms",
        type="integer",
        min_value=1,
        max_value=20,
        default=5,
        impact="medium"
    ))
    
    space.add_parameter(Parameter(
        name="progressive_loading",
        type="boolean",
        default=True,
        impact="low"
    ))
    
    # Add WebGPU if supported by device
    if memory_gb >= 2.0:
        space.add_parameter(Parameter(
            name="use_webgpu",
            type="boolean",
            default=True,
            impact="high"
        ))
        
        space.add_parameter(Parameter(
            name="webgpu_workgroup_size",
            type="categorical",
            choices=[(64, 1, 1), (128, 1, 1), (256, 1, 1)],
            default=(128, 1, 1),
            impact="medium",
            depends_on={"use_webgpu": True}
        ))
        
        space.add_parameter(Parameter(
            name="shader_precompilation",
            type="boolean",
            default=True,
            impact="medium",
            depends_on={"use_webgpu": True}
        ))
    
    return space


def optimize_model_parameters(model_name: str, optimization_metric: str = "latency",
                            max_iterations: int = 20, device_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Optimize model parameters for the given model and metric.
    
    Args:
        model_name: Name of the model to optimize
        optimization_metric: Metric to optimize (latency, throughput, memory, quality)
        max_iterations: Maximum number of iterations for optimization
        device_info: Optional device information for optimization
        
    Returns:
        Dictionary with optimization results
    """
    # Create auto-tuner with appropriate settings
    auto_tuner = AutoTuner(
        model_name=model_name,
        optimization_metric=optimization_metric,
        max_iterations=max_iterations,
        search_algorithm="bayesian",
        device_info=device_info
    )
    
    # Define a simple test input
    if auto_tuner._detect_model_type(model_name) == "llm":
        test_inputs = ["This is a test sentence for measuring LLM performance."]
    elif auto_tuner._detect_model_type(model_name) == "vision":
        test_inputs = ["test.jpg"]
    elif auto_tuner._detect_model_type(model_name) == "audio":
        test_inputs = ["test.mp3"]
    else:
        test_inputs = ["test input"]
    
    # Run optimization with simulated performance
    results = auto_tuner.run_self_optimization(model_config={}, test_inputs=test_inputs)
    
    return results


def get_device_optimized_config(model_name: str, hardware_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get an optimized configuration for the given model and hardware.
    
    Args:
        model_name: Name of the model
        hardware_info: Hardware information dictionary
        
    Returns:
        Optimized configuration dictionary
    """
    # Create auto-tuner
    auto_tuner = AutoTuner(
        model_name=model_name,
        optimization_metric="latency",
        max_iterations=1,  # We're not actually running optimization
        device_info=hardware_info
    )
    
    # Get a suggestion based on hardware
    suggested_config = auto_tuner.suggest_configuration(hardware_info)
    
    return suggested_config


def evaluate_configuration(config: Dict[str, Any], model_name: str, test_input: Any) -> Dict[str, float]:
    """
    Evaluate a configuration on the given model and input.
    
    Args:
        config: Configuration to evaluate
        model_name: Name of the model
        test_input: Input to test
        
    Returns:
        Dictionary with evaluation metrics
    """
    # In a real implementation, this would create and test the model
    # Here we'll simulate the evaluation
    
    # Create auto-tuner for simulation
    auto_tuner = AutoTuner(
        model_name=model_name,
        optimization_metric="latency",
        max_iterations=1  # We're not actually running optimization
    )
    
    # Simulate latency
    latency = auto_tuner._simulate_latency(config, [test_input])
    
    # Simulate memory usage
    memory_usage = auto_tuner._simulate_memory_usage(config)
    
    # Simulate throughput (items per second)
    throughput = 1.0 / latency if latency > 0 else 0
    
    # Return metrics
    return {
        "latency_seconds": latency,
        "memory_usage_mb": memory_usage,
        "throughput_items_per_second": throughput
    }


if __name__ == "__main__":
    print("Auto-tuning System for Model Parameters")
    
    # Test with a few different model types
    test_models = ["llama-7b", "vit-base", "whisper-tiny"]
    
    for model in test_models:
        print(f"\nOptimizing {model}:")
        
        # Create parameter space
        device_caps = {
            "memory_gb": 8.0,
            "compute_capabilities": "medium",
            "cpu_cores": 4
        }
        
        model_type = "llm" if "llama" in model.lower() else "vision" if "vit" in model.lower() else "audio"
        space = create_optimization_space(model_type, device_caps)
        
        print(f"Created parameter space with {len(space.parameters)} parameters")
        
        # Test random configuration sampling
        config = space.sample_random_configuration()
        print(f"Random configuration: {config}")
        
        # Test optimization
        print(f"Running optimization for {model}...")
        results = optimize_model_parameters(
            model_name=model,
            optimization_metric="latency",
            max_iterations=10
        )
        
        # Show optimization results
        best_config = results["best_configuration"]
        best_value = results["best_metric_value"]
        improvement = results["improvement_over_default"]
        
        print(f"Best configuration: {best_config}")
        print(f"Best latency: {best_value:.4f} seconds")
        print(f"Improvement over default: {improvement:.2%}")
        
        # Show parameter importance
        importance = results["parameter_importance"]
        sorted_importance = sorted(importance.items(), key=lambda x: x[1], reverse=True)
        print("\nParameter importance:")
        for param, imp in sorted_importance[:3]:
            print(f"  {param}: {imp:.4f}")
        
    # Test device-specific configuration
    print("\nDevice-specific configuration:")
    
    hardware_configs = [
        {"name": "High-end desktop", "gpu_vendor": "nvidia", "memory_gb": 16, "cpu_cores": 8},
        {"name": "Mobile device", "gpu_vendor": "mobile", "memory_gb": 4, "cpu_cores": 4, "battery_powered": True},
        {"name": "Low-memory device", "gpu_vendor": "generic", "memory_gb": 2, "cpu_cores": 2}
    ]
    
    for hw_config in hardware_configs:
        print(f"\n{hw_config['name']}:")
        optimized_config = get_device_optimized_config("llama-7b", hw_config)
        
        # Show key parameters
        print(f"  Batch size: {optimized_config.get('batch_size', 'N/A')}")
        print(f"  Precision: {optimized_config.get('precision', 'N/A')}")
        print(f"  Use WebGPU: {optimized_config.get('use_webgpu', 'N/A')}")
        print(f"  CPU threads: {optimized_config.get('cpu_threads', 'N/A')}")
        
        # Evaluate configuration
        metrics = evaluate_configuration(optimized_config, "llama-7b", "test input")
        print(f"  Estimated latency: {metrics['latency_seconds']:.4f} seconds")
        print(f"  Estimated memory: {metrics['memory_usage_mb']:.0f} MB")
        
    print("\nAuto-tuning system test complete.")