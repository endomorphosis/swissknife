"""
Unified Framework for WebNN and WebGPU Platforms (August 2025)

This module provides a unified framework for web-based machine learning
with standardized interfaces across different backends, comprehensive error
handling, and browser-specific optimizations.

Components:
- configuration_manager.py: Validation and management of configuration
- error_handling.py: Comprehensive error handling system
- model_sharding.py: Cross-tab model sharding system
- platform_detector.py: Browser and hardware capability detection
- result_formatter.py: Standardized API response formatting

Usage:
    from fixed_web_platform.unified_framework import UnifiedWebPlatform
    
    # Create a unified platform handler
    platform = UnifiedWebPlatform(
        model_name="bert-base-uncased",
        model_type="text",
        platform="webgpu"  # or "webnn"
    )
    
    # Run inference with unified API
    result = platform.run_inference({"input_text": "Sample text"})
"""

import os
import time
import logging
from typing import Dict, Any, Optional, Union, List

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unified_framework")

# Import submodules when available
try:
    from .configuration_manager import ConfigurationManager
    from .error_handling import ErrorHandler, WebPlatformError
    from .platform_detector import PlatformDetector
    from .result_formatter import ResultFormatter
    from .model_sharding import ModelShardingManager
    
    __all__ = [
        "UnifiedWebPlatform",
        "ConfigurationManager",
        "ErrorHandler",
        "WebPlatformError",
        "PlatformDetector",
        "ResultFormatter",
        "ModelShardingManager"
    ]
except ImportError:
    logger.warning("Unified framework submodules not fully available yet")
    __all__ = ["UnifiedWebPlatform"]

class UnifiedWebPlatform:
    """
    Unified Web Platform for ML inference across WebNN and WebGPU.
    
    This class provides a standardized interface for running inference with
    machine learning models in web environments, handling:
    
    - Configuration validation and management
    - Browser and hardware capability detection
    - Error handling with graceful degradation
    - Standardized result formatting
    - Model sharding across tabs (for large models)
    
    It uses separate submodules for each major functionality to ensure a clean
    separation of concerns and maintainability.
    """
    
    def __init__(
        self,
        model_name: str = None,
        model_type: str = "text",
        platform: str = "webgpu",
        web_api_mode: str = "simulation",
        configuration: Optional[Dict[str, Any]] = None,
        auto_detect: bool = True,
        browser_info: Optional[Dict[str, Any]] = None,
        hardware_info: Optional[Dict[str, Any]] = None,
        **kwargs
    ):
        """
        Initialize the unified web platform.
        
        Args:
            model_name: Name or path of the model
            model_type: Type of model (text, vision, audio, multimodal)
            platform: Platform to use (webnn or webgpu)
            web_api_mode: API mode (real, simulation, mock)
            configuration: Optional custom configuration
            auto_detect: Whether to automatically detect browser and hardware capabilities
            browser_info: Optional browser information for manual configuration
            hardware_info: Optional hardware information for manual configuration
            **kwargs: Additional arguments for specific platforms
        """
        self.model_name = model_name
        self.model_type = model_type
        self.platform = platform.lower()
        self.web_api_mode = web_api_mode
        self.auto_detect = auto_detect
        
        # Initialize performance tracking
        self._perf_metrics = {
            "initialization_time_ms": 0,
            "first_inference_time_ms": 0,
            "average_inference_time_ms": 0,
            "memory_usage_mb": 0,
            "feature_usage": {}
        }
        
        # Start initialization timer
        self._initialization_start = time.time()
        
        # Initialize components
        self.config = configuration or {}
        
        # Initialize platform detector if auto-detect is enabled
        if auto_detect:
            try:
                self.platform_detector = PlatformDetector(browser_info, hardware_info)
                detected_capabilities = self.platform_detector.detect_capabilities()
                self.config.update(detected_capabilities)
            except ImportError:
                logger.warning("PlatformDetector not available, using default configuration")
                self.platform_detector = None
        else:
            self.platform_detector = None
            
        # Initialize configuration manager
        try:
            browser_name = browser_info.get("name") if browser_info else None
            hardware_type = hardware_info.get("type") if hardware_info else None
            
            self.config_manager = ConfigurationManager(
                model_type=self.model_type,
                browser=browser_name,
                hardware=hardware_type,
                auto_correct=True
            )
            
            # Validate and optimize configuration
            validation_result = self.config_manager.validate_configuration(self.config)
            self.config = validation_result["config"]
        except ImportError:
            logger.warning("ConfigurationManager not available, using default configuration")
            self.config_manager = None
            
        # Initialize error handler
        try:
            self.error_handler = ErrorHandler(
                recovery_strategy=self.config.get("error_recovery", "auto"),
                collect_debug_info=self.config.get("collect_debug_info", True),
                browser=browser_info.get("name") if browser_info else None,
                hardware=hardware_info.get("type") if hardware_info else None
            )
        except ImportError:
            logger.warning("ErrorHandler not available, using basic error handling")
            self.error_handler = None
            
        # Initialize result formatter
        try:
            self.result_formatter = ResultFormatter(
                model_type=self.model_type,
                browser=browser_info.get("name") if browser_info else None,
                include_metadata=self.config.get("include_metadata", True)
            )
        except ImportError:
            logger.warning("ResultFormatter not available, using basic result formatting")
            self.result_formatter = None
            
        # Initialize model sharding if enabled and available
        if self.config.get("use_model_sharding", False):
            try:
                self.model_sharding = ModelShardingManager(
                    model_name=self.model_name,
                    num_shards=self.config.get("num_shards", 2),
                    shard_type=self.config.get("shard_type", "layer")
                )
            except ImportError:
                logger.warning("ModelShardingManager not available, disabling model sharding")
                self.model_sharding = None
                self.config["use_model_sharding"] = False
        else:
            self.model_sharding = None
        
        # Initialize WebGPU handler (if using WebGPU platform)
        if self.platform == "webgpu":
            # Import dynamically to avoid dependency issues
            try:
                from ..web_platform_handler import WebPlatformHandler
                from ..webgpu_quantization import setup_4bit_inference
                
                # Use Safari-specific handler if detected
                if browser_info and browser_info.get("name", "").lower() == "safari":
                    from ..safari_webgpu_handler import SafariWebGPUHandler
                    self.webgpu_handler = SafariWebGPUHandler(
                        model_path=self.model_name,
                        config=self.config
                    )
                else:
                    self.webgpu_handler = WebPlatformHandler(
                        model_path=self.model_name,
                        model_type=self.model_type,
                        config=self.config
                    )
                
                # Setup quantization if enabled
                if self.config.get("quantization", "16bit") != "16bit":
                    bits = int(self.config.get("quantization", "4bit").replace("bit", ""))
                    if bits <= 4:
                        self.quantizer = setup_4bit_inference(
                            model_path=self.model_name,
                            model_type=self.model_type,
                            config={
                                "bits": bits,
                                "group_size": self.config.get("group_size", 128),
                                "scheme": self.config.get("quantization_scheme", "symmetric"),
                                "mixed_precision": self.config.get("mixed_precision", True)
                            }
                        )
            except ImportError:
                logger.warning("WebGPU handler components not available")
                self.webgpu_handler = None
        
        # Initialize WebNN handler (if using WebNN platform)
        if self.platform == "webnn":
            # Import dynamically to avoid dependency issues
            try:
                from ..web_platform_handler import WebPlatformHandler
                self.webnn_handler = WebPlatformHandler(
                    model_path=self.model_name,
                    model_type=self.model_type,
                    config=self.config,
                    platform="webnn"
                )
            except ImportError:
                logger.warning("WebNN handler components not available")
                self.webnn_handler = None
        
        # Initialize WebAssembly fallback
        try:
            from ..webgpu_wasm_fallback import setup_wasm_fallback
            self.wasm_fallback = setup_wasm_fallback(
                model_path=self.model_name,
                model_type=self.model_type,
                use_simd=self.config.get("use_wasm_simd", False)
            )
        except ImportError:
            logger.warning("WebAssembly fallback not available")
            self.wasm_fallback = None
        
        # Track initialization status
        self.initialized = True
        
        # Record initialization time
        self._perf_metrics["initialization_time_ms"] = (time.time() - self._initialization_start) * 1000
        
        # Track feature usage
        self._perf_metrics["feature_usage"] = {
            "platform": self.platform,
            "model_type": self.model_type,
            "quantization": self.config.get("quantization", "16bit"),
            "model_sharding": self.config.get("use_model_sharding", False),
            "shader_precompilation": self.config.get("use_shader_precompilation", False),
            "compute_shaders": self.config.get("use_compute_shaders", False),
            "wasm_fallback": self.wasm_fallback is not None,
            "safari_handler": hasattr(self, "webgpu_handler") and "SafariWebGPUHandler" in self.webgpu_handler.__class__.__name__
        }
        
        logger.info(f"Unified Web Platform initialized for {model_name} on {platform} in {self._perf_metrics['initialization_time_ms']:.2f}ms")
        
    def initialize(self):
        """Initialize the platform components if not already initialized."""
        if self.initialized:
            return
            
        # This will initialize any components that weren't initialized in __init__
        if self.model_sharding and not self.model_sharding.initialized:
            self.model_sharding.initialize()
        
        self.initialized = True
        
    def run_inference(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run inference with the model.
        
        Args:
            inputs: Input data for the model
            
        Returns:
            Inference results in a standardized format
        """
        # Make sure platform is initialized
        if not self.initialized:
            self.initialize()
            
        # Measure first inference time
        is_first_inference = not hasattr(self, "_first_inference_done")
        if is_first_inference:
            first_inference_start = time.time()
            
        # Track inference time
        inference_start = time.time()
        
        try:
            # Process input based on model type
            processed_input = self._process_input(inputs)
            
            # Check if model sharding is being used
            if self.model_sharding and self.config.get("use_model_sharding", False):
                # Run inference using model sharding
                raw_output = self.model_sharding.run_inference_sharded(processed_input)
            else:
                # Try primary platform (WebGPU or WebNN)
                if self.platform == "webgpu" and hasattr(self, "webgpu_handler") and self.webgpu_handler:
                    try:
                        raw_output = self.webgpu_handler.run_inference(processed_input)
                    except Exception as e:
                        logger.warning(f"WebGPU inference failed: {str(e)}, falling back to WebAssembly")
                        if self.wasm_fallback:
                            raw_output = self.wasm_fallback.run_inference(processed_input)
                        else:
                            raise RuntimeError(f"WebGPU inference failed and no fallback available: {str(e)}")
                elif self.platform == "webnn" and hasattr(self, "webnn_handler") and self.webnn_handler:
                    try:
                        raw_output = self.webnn_handler.run_inference(processed_input)
                    except Exception as e:
                        logger.warning(f"WebNN inference failed: {str(e)}, falling back to WebAssembly")
                        if self.wasm_fallback:
                            raw_output = self.wasm_fallback.run_inference(processed_input)
                        else:
                            raise RuntimeError(f"WebNN inference failed and no fallback available: {str(e)}")
                elif self.wasm_fallback:
                    # Use WebAssembly fallback as primary method
                    raw_output = self.wasm_fallback.run_inference(processed_input)
                else:
                    raise RuntimeError("No inference handler available")
            
            # Format the output using the result formatter
            if self.result_formatter:
                result = self.result_formatter.format_result(raw_output, self.model_type)
            else:
                # Basic formatting if no formatter is available
                result = {
                    "success": True,
                    "output": raw_output,
                    "error": None
                }
                
            # Update performance metrics
            inference_time_ms = (time.time() - inference_start) * 1000
            if is_first_inference:
                self._first_inference_done = True
                self._perf_metrics["first_inference_time_ms"] = (time.time() - first_inference_start) * 1000
            
            # Track average inference time
            if not hasattr(self, "_inference_count"):
                self._inference_count = 0
                self._total_inference_time = 0
            
            self._inference_count += 1
            self._total_inference_time += inference_time_ms
            self._perf_metrics["average_inference_time_ms"] = self._total_inference_time / self._inference_count
            
            # Add performance metrics to result
            result["performance"] = {
                "inference_time_ms": inference_time_ms,
                "average_inference_time_ms": self._perf_metrics["average_inference_time_ms"]
            }
            
            return result
            
        except Exception as e:
            # Handle the error using error handler
            if self.error_handler:
                error_response = self.error_handler.handle_exception(e, {
                    "model_name": self.model_name,
                    "model_type": self.model_type,
                    "platform": self.platform,
                    "inputs": inputs
                })
                return error_response
            else:
                # Basic error handling if no error handler is available
                return {
                    "success": False,
                    "output": None,
                    "error": {
                        "message": str(e),
                        "type": e.__class__.__name__
                    }
                }
    
    def _process_input(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Process input data based on model type."""
        if not isinstance(inputs, dict):
            # Convert primitive types to dictionary
            if self.model_type == "text":
                return {"text": str(inputs)}
            else:
                return {"input": inputs}
                
        return inputs
    
    def validate_configuration(self) -> Dict[str, Any]:
        """
        Validate the current configuration.
        
        Returns:
            Validation result dictionary
        """
        if self.config_manager:
            return self.config_manager.validate_configuration(self.config)
        else:
            # Basic validation if no configuration manager is available
            return {
                "valid": True,
                "errors": [],
                "auto_corrected": False,
                "config": self.config
            }
            
    def get_performance_metrics(self) -> Dict[str, Any]:
        """
        Get detailed performance metrics.
        
        Returns:
            Dictionary with performance metrics
        """
        return self._perf_metrics
        
    def get_browser_compatibility(self) -> Dict[str, Any]:
        """
        Get browser compatibility information.
        
        Returns:
            Dictionary with browser compatibility details
        """
        if self.platform_detector:
            return self.platform_detector.get_browser_compatibility()
        else:
            return {
                "browser": "unknown",
                "compatibility": {}
            }
    
    def get_feature_usage(self) -> Dict[str, bool]:
        """
        Get information about which features are being used.
        
        Returns:
            Dictionary mapping feature names to usage status
        """
        return self._perf_metrics["feature_usage"]