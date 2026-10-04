#!/usr/bin/env python3
"""
Unified Web Framework for ML Acceleration (August 2025)

This module provides a unified framework for integrating all web platform components,
creating a cohesive system for deploying ML models to web browsers with optimal performance.

Key features:
- Unified API for all web platform components
- Automatic feature detection and adaptation
- Standardized interfaces for model deployment
- Cross-component integration and optimization
- Progressive enhancement with fallback mechanisms
- Comprehensive configuration system
- Support for all major browsers and platforms

Usage:
    from fixed_web_platform.unified_web_framework import (
        WebPlatformAccelerator,
        create_web_endpoint,
        get_optimal_config
    )
    
    # Create web accelerator with automatic detection
    accelerator = WebPlatformAccelerator(
        model_path="models/bert-base",
        model_type="text",
        auto_detect=True  # Automatically detect and use optimal features
    )
    
    # Create inference endpoint
    endpoint = accelerator.create_endpoint()
    
    # Run inference
    result = endpoint({"text": "Example input text"})
    
    # Get detailed performance metrics
    metrics = accelerator.get_performance_metrics()
"""

import os
import sys
import json
import time
import logging
import platform
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Import web platform components
from fixed_web_platform.browser_capability_detector import BrowserCapabilityDetector
from fixed_web_platform.unified_framework.fallback_manager import FallbackManager
from fixed_web_platform.progressive_model_loader import ProgressiveModelLoader
from fixed_web_platform.webgpu_quantization import setup_4bit_inference
from fixed_web_platform.webgpu_ultra_low_precision import setup_ultra_low_precision
from fixed_web_platform.webgpu_streaming_inference import WebGPUStreamingInference
from fixed_web_platform.webgpu_wasm_fallback import setup_wasm_fallback
from fixed_web_platform.webgpu_shader_registry import WebGPUShaderRegistry
from fixed_web_platform.safari_webgpu_handler import SafariWebGPUHandler
from fixed_web_platform.webnn_inference import WebNNInference, is_webnn_supported, get_webnn_capabilities

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class WebPlatformAccelerator:
    """
    Unified framework for accelerating ML models on web platforms.
    
    This class provides a cohesive interface for all web platform components,
    integrating features like WebGPU acceleration, quantization, progressive loading,
    and WebAssembly fallback into a single comprehensive system.
    """
    
    def __init__(self, 
                 model_path: str, 
                 model_type: str,
                 config: Dict[str, Any] = None,
                 auto_detect: bool = True):
        """
        Initialize the web platform accelerator.
        
        Args:
            model_path: Path to the model
            model_type: Type of model (text, vision, audio, multimodal)
            config: Configuration dictionary (if None, uses auto-detection)
            auto_detect: Whether to automatically detect optimal features
        """
        self.model_path = model_path
        self.model_type = model_type
        self.config = config or {}
        
        # Initialize metrics tracking
        self._perf_metrics = {
            "initialization_time_ms": 0,
            "first_inference_time_ms": 0,
            "average_inference_time_ms": 0,
            "memory_usage_mb": 0,
            "feature_usage": {}
        }
        
        self._initialization_start = time.time()
        
        # Auto-detect capabilities if requested
        if auto_detect:
            self._detect_capabilities()
        
        # Initialize components based on configuration
        self._initialize_components()
        
        # Track initialization time
        self._perf_metrics["initialization_time_ms"] = (time.time() - self._initialization_start) * 1000
        logger.info(f"WebPlatformAccelerator initialized in {self._perf_metrics['initialization_time_ms']:.2f}ms")
    
    def _detect_capabilities(self):
        """
        Detect browser capabilities and set optimal configuration.
        """
        logger.info("Detecting browser capabilities...")
        
        # Create detector
        detector = BrowserCapabilityDetector()
        capabilities = detector.get_capabilities()
        
        # Get optimization profile
        profile = detector.get_optimization_profile()
        
        # Check WebNN support
        webnn_available = capabilities["webnn"]["available"]
        
        # Update configuration with detected capabilities
        self.config.update({
            "browser_capabilities": capabilities,
            "optimization_profile": profile,
            
            # Core acceleration features
            "use_webgpu": capabilities["webgpu"]["available"],
            "use_webnn": webnn_available,
            "use_wasm": True,  # Always have WASM as fallback
            
            # WebGPU features
            "compute_shaders": capabilities["webgpu"]["compute_shaders"],
            "shader_precompilation": capabilities["webgpu"]["shader_precompilation"],
            
            # WebNN features (if available)
            "webnn_gpu_backend": webnn_available and capabilities["webnn"]["gpu_backend"],
            "webnn_cpu_backend": webnn_available and capabilities["webnn"]["cpu_backend"],
            "webnn_preferred_backend": capabilities["webnn"].get("preferred_backend", "gpu") if webnn_available else None,
            
            # Precision settings
            "quantization": profile["precision"]["default"],
            "ultra_low_precision": profile["precision"]["ultra_low_precision_enabled"],
            "adaptive_precision": True if profile["precision"]["ultra_low_precision_enabled"] else False,
            
            # Loading features
            "progressive_loading": profile["loading"]["progressive_loading"],
            "parallel_loading": profile["loading"]["parallel_loading"],
            
            # Browser-specific settings
            "browser": capabilities["browser_info"]["name"],
            "browser_version": capabilities["browser_info"]["version"],
            
            # Other features
            "streaming_inference": profile["loading"]["progressive_loading"] and self.model_type == "text",
            "kv_cache_optimization": profile["memory"]["kv_cache_optimization"] and self.model_type == "text"
        })
        
        # Set workgroup size based on browser and hardware
        self.config["workgroup_size"] = profile["compute"]["workgroup_size"]
        
        # Set streaming parameters for text generation models
        if self.model_type == "text":
            self.config["latency_optimized"] = True
            self.config["adaptive_batch_size"] = True
        
        # Set model-specific optimizations
        self._set_model_specific_config()
        
        # Validate and auto-correct configuration
        self._validate_configuration()
        
        logger.info(f"Using {self.config['browser']} {self.config['browser_version']} with "
                   f"WebGPU: {self.config['use_webgpu']}, WebNN: {self.config['use_webnn']}")
    
    def _set_model_specific_config(self):
        """
        Set model-specific configuration options.
        """
        if self.model_type == "text":
            # Text models (BERT, T5, etc.)
            if "bert" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # BERT works well with 4-bit
                self.config.setdefault("shader_precompilation", True)  # BERT benefits from shader precompilation
            elif "t5" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # T5 works well with 4-bit
                self.config.setdefault("shader_precompilation", True)
            elif "llama" in self.model_path.lower() or "gpt" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # Use 4-bit for LLMs
                self.config.setdefault("kv_cache_optimization", True)
                self.config.setdefault("streaming_inference", True)
        
        elif self.model_type == "vision":
            # Vision models (ViT, ResNet, etc.)
            self.config.setdefault("shader_precompilation", True)  # Vision models benefit from shader precompilation
            if "vit" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # ViT works well with 4-bit
            elif "resnet" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # ResNet works well with 4-bit
        
        elif self.model_type == "audio":
            # Audio models (Whisper, Wav2Vec2, etc.)
            self.config.setdefault("compute_shaders", True)  # Audio models benefit from compute shaders
            if "whisper" in self.model_path.lower():
                self.config.setdefault("quantization", 8)  # Whisper needs higher precision
            elif "wav2vec" in self.model_path.lower():
                self.config.setdefault("quantization", 8)  # wav2vec2 needs higher precision
        
        elif self.model_type == "multimodal":
            # Multimodal models (CLIP, LLaVA, etc.)
            self.config.setdefault("parallel_loading", True)  # Multimodal models benefit from parallel loading
            self.config.setdefault("progressive_loading", True)  # Multimodal models benefit from progressive loading
            if "clip" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # CLIP works well with 4-bit
            elif "llava" in self.model_path.lower():
                self.config.setdefault("quantization", 4)  # LLaVA works with 4-bit
    
    def _validate_configuration(self):
        """
        Validate and auto-correct configuration settings for cross-browser compatibility.
        
        This method ensures all configuration settings are valid and compatible with
        the current browser environment, automatically correcting invalid settings
        where possible with appropriate browser-specific alternatives.
        """
        # Import ConfigurationManager for validation logic
        from .unified_framework.configuration_manager import ConfigurationManager
        
        try:
            # Create configuration manager with current browser and model information
            config_manager = ConfigurationManager(
                model_type=self.model_type,
                browser=self.config.get("browser"),
                auto_correct=True
            )
            
            # Validate configuration and get results
            validation_result = config_manager.validate_configuration(self.config)
            
            # If validation found issues and auto-corrected, update our config
            if validation_result["auto_corrected"]:
                self.config = validation_result["config"]
                
                # Log what was corrected
                for error in validation_result["errors"]:
                    logger.info(f"Auto-corrected configuration: {error['message']}")
                
            # If validation found issues that couldn't be corrected, log warnings
            elif not validation_result["valid"]:
                for error in validation_result["errors"]:
                    if error["severity"] == "error":
                        logger.warning(f"Configuration error: {error['message']}")
                    else:
                        logger.info(f"Configuration issue: {error['message']}")
                        
            # Apply browser-specific optimizations
            browser_optimized_config = config_manager.get_optimized_configuration(self.config)
            
            # Update with browser-specific optimized settings
            self.config = browser_optimized_config
            
            logger.info(f"Configuration validated and optimized for {self.config.get('browser')}")
            
        except ImportError:
            # ConfigurationManager not available, perform basic validation
            logger.warning("ConfigurationManager not available, performing basic validation")
            self._perform_basic_validation()
            
        except Exception as e:
            # Something went wrong during validation, log and use existing config
            logger.error(f"Error during configuration validation: {e}")
            # Perform minimal safety checks
            self._perform_basic_validation()
    
    def _perform_basic_validation(self):
        """
        Perform basic validation checks without the ConfigurationManager.
        """
        # Validate precision settings
        if "quantization" in self.config:
            # Ensure quantization is a valid value
            valid_bits = [2, 3, 4, 8, 16]
            quant = self.config.get("quantization")
            
            # Convert string like "4bit" to int 4
            if isinstance(quant, str):
                quant = int(quant.replace("bit", "").strip())
                self.config["quantization"] = quant
                
            # Check and correct invalid values
            if quant not in valid_bits:
                logger.warning(f"Invalid quantization value {quant}, setting to 4-bit")
                self.config["quantization"] = 4
            
            # Safari-specific checks
            if self.config.get("browser", "").lower() == "safari":
                # Safari doesn't support 2-bit/3-bit precision yet
                if quant < 4:
                    logger.warning(f"{quant}-bit precision not supported in Safari, auto-correcting to 4-bit")
                    self.config["quantization"] = 4
                    
                # Safari has limited compute shader support
                if self.config.get("compute_shaders", False):
                    logger.warning("Safari has limited compute shader support, disabling")
                    self.config["compute_shaders"] = False
        
        # Validate model type specific settings
        if self.model_type == "vision" and self.config.get("kv_cache_optimization", False):
            logger.warning("KV-cache optimization not applicable for vision models, disabling")
            self.config["kv_cache_optimization"] = False
            
        # Audio model checks
        if self.model_type == "audio":
            # Firefox is better for audio models with compute shaders
            if self.config.get("browser", "").lower() == "firefox":
                if self.config.get("compute_shaders", False):
                    # Firefox works best with 256x1x1 workgroups for audio models
                    if "workgroup_size" in self.config:
                        logger.info("Setting Firefox-optimized workgroup size for audio model")
                        self.config["workgroup_size"] = [256, 1, 1]
        
        # Ensure workgroup size is valid
        if "workgroup_size" in self.config:
            workgroup = self.config["workgroup_size"]
            
            # Check if workgroup size is a list of 3 positive integers
            if not (isinstance(workgroup, list) and len(workgroup) == 3 and 
                    all(isinstance(x, int) and x > 0 for x in workgroup)):
                logger.warning("Invalid workgroup size, setting to default [8, 8, 1]")
                self.config["workgroup_size"] = [8, 8, 1]
    
    def _initialize_components(self):
        """
        Initialize all components based on configuration.
        """
        # Track initialization of each component
        self._components = {}
        self._feature_usage = {}
        
        # Initialize shader registry if using WebGPU
        if self.config.get("use_webgpu", False):
            shader_registry = WebGPUShaderRegistry(
                model_type=self.model_type,
                precompile=self.config.get("shader_precompilation", False),
                use_compute_shaders=self.config.get("compute_shaders", False),
                workgroup_size=self.config.get("workgroup_size", (128, 1, 1))
            )
            self._components["shader_registry"] = shader_registry
            self._feature_usage["shader_precompilation"] = self.config.get("shader_precompilation", False)
            self._feature_usage["compute_shaders"] = self.config.get("compute_shaders", False)
        
        # Set up progressive loading if enabled
        if self.config.get("progressive_loading", False):
            loader = ProgressiveModelLoader(
                model_path=self.model_path,
                model_type=self.model_type,
                parallel_loading=self.config.get("parallel_loading", False),
                memory_optimized=True
            )
            self._components["loader"] = loader
            self._feature_usage["progressive_loading"] = True
            self._feature_usage["parallel_loading"] = self.config.get("parallel_loading", False)
        
        # Set up quantization based on configuration
        if self.config.get("ultra_low_precision", False):
            # Use ultra-low precision (2-bit or 3-bit)
            bits = 2 if self.config.get("quantization", 4) <= 2 else 3
            quantizer = setup_ultra_low_precision(
                model=self.model_path,
                bits=bits,
                adaptive=self.config.get("adaptive_precision", True)
            )
            self._components["quantizer"] = quantizer
            self._feature_usage["ultra_low_precision"] = True
            self._feature_usage["quantization_bits"] = bits
        elif self.config.get("quantization", 16) <= 4:
            # Use 4-bit quantization
            quantizer = setup_4bit_inference(
                model_path=self.model_path,
                model_type=self.model_type,
                config={
                    "bits": 4,
                    "group_size": 128,
                    "scheme": "symmetric",
                    "mixed_precision": True,
                    "use_specialized_kernels": True,
                    "optimize_attention": self.config.get("kv_cache_optimization", False)
                }
            )
            self._components["quantizer"] = quantizer
            self._feature_usage["4bit_quantization"] = True
        
        # Set up WebGPU based on browser type
        if self.config.get("use_webgpu", False) and self.config.get("browser") == "safari":
            # Special handling for Safari
            safari_handler = SafariWebGPUHandler(
                model_path=self.model_path,
                config={
                    "safari_version": self.config.get("browser_version", 0),
                    "model_type": self.model_type,
                    "quantization": self.config.get("quantization", 8),
                    "shader_registry": self._components.get("shader_registry")
                }
            )
            self._components["webgpu_handler"] = safari_handler
            self._feature_usage["safari_metal_integration"] = True
        
        # Set up WebNN if available
        if self.config.get("use_webnn", False):
            webnn_capabilities = get_webnn_capabilities()
            if webnn_capabilities["available"]:
                webnn_handler = WebNNInference(
                    model_path=self.model_path,
                    model_type=self.model_type,
                    config={
                        "browser_name": self.config.get("browser"),
                        "browser_version": self.config.get("browser_version", 0),
                        "preferred_backend": webnn_capabilities.get("preferred_backend", "gpu")
                    }
                )
                self._components["webnn_handler"] = webnn_handler
                self._feature_usage["webnn"] = True
                self._feature_usage["webnn_gpu_backend"] = webnn_capabilities.get("gpu_backend", False)
                self._feature_usage["webnn_cpu_backend"] = webnn_capabilities.get("cpu_backend", False)
                logger.info(f"WebNN initialized with {len(webnn_capabilities.get('operators', []))} supported operators")
        
        # Set up WebAssembly fallback if needed
        wasm_fallback = setup_wasm_fallback(
            model_path=self.model_path,
            model_type=self.model_type,
            use_simd=self.config.get("browser_capabilities", {}).get("webassembly", {}).get("simd", False)
        )
        self._components["wasm_fallback"] = wasm_fallback
        self._feature_usage["wasm_fallback"] = True
        self._feature_usage["wasm_simd"] = self.config.get("browser_capabilities", {}).get("webassembly", {}).get("simd", False)
        
        # Initialize fallback manager for specialized fallbacks
        self.browser_info = {
            "name": self.config.get("browser", ""),
            "version": self.config.get("browser_version", "")
        }
        
        # Create fallback manager
        self.fallback_manager = FallbackManager(
            browser_info=self.browser_info,
            model_type=self.model_type,
            config=self.config,
            error_handler=self.error_handler if hasattr(self, "error_handler") else None,
            enable_layer_processing=self.config.get("enable_layer_processing", True)
        )
        
        # Store in components for access
        self._components["fallback_manager"] = self.fallback_manager
        
        # Register in feature usage
        self._feature_usage["fallback_manager"] = True
        self._feature_usage["safari_fallback"] = self.browser_info.get("name", "").lower() == "safari"
        
        # Set up streaming inference for text models if enabled
        if self.model_type == "text" and self.config.get("streaming_inference", False):
            streaming_handler = WebGPUStreamingInference(
                model_path=self.model_path,
                config={
                    "quantization": f"int{self.config.get('quantization', 4)}",
                    "optimize_kv_cache": self.config.get("kv_cache_optimization", False),
                    "latency_optimized": self.config.get("latency_optimized", True),
                    "adaptive_batch_size": self.config.get("adaptive_batch_size", True)
                }
            )
            self._components["streaming"] = streaming_handler
            self._feature_usage["streaming_inference"] = True
            self._feature_usage["kv_cache_optimization"] = self.config.get("kv_cache_optimization", False)
        
        # Store feature usage in performance metrics
        self._perf_metrics["feature_usage"] = self._feature_usage
    
    def create_endpoint(self) -> Callable:
        """
        Create a unified inference endpoint function.
        
        Returns:
            Callable function for model inference
        """
        # Check if streaming inference is appropriate
        if self.model_type == "text" and self._components.get("streaming") is not None:
            endpoint = lambda input_text, **kwargs: self._handle_streaming_inference(input_text, **kwargs)
        else:
            endpoint = lambda input_data, **kwargs: self._handle_inference(input_data, **kwargs)
        
        return endpoint
    
    def _handle_streaming_inference(self, input_text, **kwargs):
        """
        Handle streaming inference for text models.
        
        Args:
            input_text: Input text or dictionary with "text" key
            kwargs: Additional parameters for inference
            
        Returns:
            Generated text or streaming iterator
        """
        # Extract prompt from input
        prompt = input_text["text"] if isinstance(input_text, dict) else input_text
        
        # Get streaming handler
        streaming = self._components["streaming"]
        
        # Get browser information if available
        browser_info = self.config.get("browser_info", {})
        
        # Enhanced configuration for streaming
        streaming_config = {
            # Pass browser information for optimizations
            "browser_info": browser_info,
            
            # Pass framework configuration
            "latency_optimized": kwargs.get("latency_optimized", True),
            "adaptive_batch_size": kwargs.get("adaptive_batch_size", True),
            "optimize_kv_cache": kwargs.get("optimize_kv_cache", True),
            
            # Framework integration settings
            "framework_integration": True,
            "resource_sharing": kwargs.get("resource_sharing", True),
            "error_propagation": kwargs.get("error_propagation", True)
        }
        
        # Check for callback
        callback = kwargs.get("callback")
        if callback:
            # Use synchronous generation with callback and enhanced configuration
            try:
                return streaming.generate(
                    prompt=prompt,
                    max_tokens=kwargs.get("max_tokens", 100),
                    temperature=kwargs.get("temperature", 0.7),
                    callback=callback,
                    config=streaming_config
                )
            except Exception as e:
                # Handle errors with cross-component propagation
                logger.error(f"Streaming error: {e}")
                self._handle_cross_component_error(
                    error=e,
                    component="streaming",
                    operation="generate",
                    recoverable=True
                )
                # Return error message or fallback to simple generation
                return f"Error during streaming generation: {str(e)}"
        elif kwargs.get("stream", False):
            # Return async generator for streaming with enhanced configuration
            async def stream_generator():
                try:
                    result = await streaming.generate_async(
                        prompt=prompt,
                        max_tokens=kwargs.get("max_tokens", 100),
                        temperature=kwargs.get("temperature", 0.7),
                        config=streaming_config
                    )
                    return result
                except Exception as e:
                    # Handle errors with cross-component propagation
                    logger.error(f"Async streaming error: {e}")
                    self._handle_cross_component_error(
                        error=e,
                        component="streaming",
                        operation="generate_async",
                        recoverable=True
                    )
                    # Return error message
                    return f"Error during async streaming generation: {str(e)}"
            return stream_generator
        else:
            # Use synchronous generation without callback but with enhanced configuration
            try:
                return streaming.generate(
                    prompt=prompt,
                    max_tokens=kwargs.get("max_tokens", 100),
                    temperature=kwargs.get("temperature", 0.7),
                    config=streaming_config
                )
            except Exception as e:
                # Handle errors with cross-component propagation
                logger.error(f"Streaming error: {e}")
                self._handle_cross_component_error(
                    error=e,
                    component="streaming",
                    operation="generate",
                    recoverable=True
                )
                # Return error message or fallback to simple generation
                return f"Error during streaming generation: {str(e)}"
    
    def _handle_inference(self, input_data, **kwargs):
        """
        Handle standard inference.
        
        Args:
            input_data: Input data (text, image, audio, etc.)
            kwargs: Additional parameters for inference
            
        Returns:
            Inference result
        """
        # Prepare input based on model type
        processed_input = self._prepare_input(input_data)
        
        # Measure first inference time
        is_first_inference = not hasattr(self, "_first_inference_done")
        if is_first_inference:
            first_inference_start = time.time()
        
        # Run inference through appropriate component
        inference_start = time.time()
        
        # Define fallback chain based on available components
        result = None
        error = None
        used_component = None
        
        # Try WebGPU first (if available)
        if self._components.get("webgpu_handler") is not None:
            try:
                result = self._components["webgpu_handler"](processed_input, **kwargs)
                used_component = "webgpu"
            except Exception as e:
                logger.warning(f"WebGPU inference failed: {e}, trying fallbacks")
                error = e
        
        # Try WebNN next if WebGPU failed or isn't available
        if result is None and self._components.get("webnn_handler") is not None:
            try:
                logger.info("Using WebNN for inference")
                result = self._components["webnn_handler"].run(processed_input)
                used_component = "webnn"
            except Exception as e:
                logger.warning(f"WebNN inference failed: {e}, falling back to WebAssembly")
                if error is None:
                    error = e
        
        # Fall back to WebAssembly as last resort
        if result is None:
            try:
                logger.info("Using WebAssembly fallback for inference")
                result = self._components["wasm_fallback"](processed_input, **kwargs)
                used_component = "wasm"
            except Exception as e:
                logger.error(f"All inference methods failed. Last error: {e}")
                if error is None:
                    error = e
                # If everything fails, return a meaningful error
                return {"error": f"Inference failed: {str(error)}"}
        
        # Update performance tracking
        if used_component and not hasattr(self, "_component_usage"):
            self._component_usage = {"webgpu": 0, "webnn": 0, "wasm": 0}
        
        if used_component:
            self._component_usage[used_component] += 1
            self._perf_metrics["component_usage"] = self._component_usage
        
        # Update inference timing metrics
        inference_time_ms = (time.time() - inference_start) * 1000
        if is_first_inference:
            self._first_inference_done = True
            self._perf_metrics["first_inference_time_ms"] = (time.time() - first_inference_start) * 1000
        
        # Update average inference time
        if not hasattr(self, "_inference_count"):
            self._inference_count = 0
            self._total_inference_time = 0
        
        self._inference_count += 1
        self._total_inference_time += inference_time_ms
        self._perf_metrics["average_inference_time_ms"] = self._total_inference_time / self._inference_count
        
        # Return processed result
        return result
    
    def _prepare_input(self, input_data):
        """
        Prepare input data based on model type.
        
        Args:
            input_data: Raw input data
            
        Returns:
            Processed input data
        """
        # Handle different input types based on model type
        if self.model_type == "text":
            # Text input
            if isinstance(input_data, dict) and "text" in input_data:
                return input_data["text"]
            return input_data
        elif self.model_type == "vision":
            # Vision input (image data)
            if isinstance(input_data, dict) and "image" in input_data:
                return input_data["image"]
            return input_data
        elif self.model_type == "audio":
            # Audio input
            if isinstance(input_data, dict) and "audio" in input_data:
                return input_data["audio"]
            return input_data
        elif self.model_type == "multimodal":
            # Multimodal input (combination of modalities)
            return input_data
        else:
            # Default case - return as is
            return input_data
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """
        Get detailed performance metrics.
        
        Returns:
            Dictionary with performance metrics
        """
        # Update memory usage if available
        try:
            import psutil
            process = psutil.Process(os.getpid())
            self._perf_metrics["memory_usage_mb"] = process.memory_info().rss / (1024 * 1024)
        except (ImportError, Exception):
            pass
        
        # Return all metrics
        return self._perf_metrics
    
    def get_feature_usage(self) -> Dict[str, bool]:
        """
        Get information about which features are being used.
        
        Returns:
            Dictionary mapping feature names to usage status
        """
        return self._feature_usage
    
    def get_components(self) -> Dict[str, Any]:
        """
        Get initialized components.
        
        Returns:
            Dictionary of components
        """
        return self._components
    
    def get_config(self) -> Dict[str, Any]:
        """
        Get current configuration.
        
        Returns:
            Configuration dictionary
        """
        return self.config
    
    def get_browser_compatibility_matrix(self) -> Dict[str, Dict[str, bool]]:
        """
        Get feature compatibility matrix for current browser.
        
        Returns:
            Dictionary with feature compatibility for current browser
        """
        from fixed_web_platform.browser_capability_detector import get_browser_feature_matrix
        return get_browser_feature_matrix()
        
    def _handle_cross_component_error(self, error, component, operation, recoverable=False):
        """
        Handle errors with cross-component propagation.
        
        This allows errors in one component to be properly handled by the framework
        and propagated to other affected components.
        
        Args:
            error: The exception that occurred
            component: The component where the error originated
            operation: The operation that was being performed
            recoverable: Whether the error is potentially recoverable
            
        Returns:
            True if the error was handled, False otherwise
        """
        # Import error handling and propagation modules
        try:
            from fixed_web_platform.unified_framework.error_propagation import (
                ErrorPropagationManager, ErrorCategory
            )
            from fixed_web_platform.unified_framework.graceful_degradation import (
                GracefulDegradationManager
            )
            has_error_propagation = True
        except ImportError:
            has_error_propagation = False
        
        # Create error context for tracking and propagation
        error_context = {
            "component": component,
            "operation": operation,
            "timestamp": time.time(),
            "recoverable": recoverable,
            "error_type": type(error).__name__,
            "error_message": str(error)
        }
        
        # Log the error
        logger.error(f"Cross-component error in {component}.{operation}: {error}")
        
        # Use error propagation system if available
        if has_error_propagation:
            # Create error manager
            error_manager = ErrorPropagationManager()
            
            # Register component handlers
            for comp_name, comp_obj in self._components.items():
                if hasattr(comp_obj, "handle_error"):
                    error_manager.register_handler(comp_name, comp_obj.handle_error)
            
            # Propagate the error to affected components
            propagation_result = error_manager.propagate_error(
                error=error,
                source_component=component,
                context=error_context
            )
            
            # If successfully handled by propagation system, we're done
            if propagation_result.get("handled", False):
                # Log the handling action
                action = propagation_result.get("action", "unknown")
                handling_component = propagation_result.get("component", component)
                logger.info(f"Error handled by {handling_component} with action: {action}")
                
                # Record error and handling in telemetry
                if hasattr(self, "_perf_metrics"):
                    if "errors" not in self._perf_metrics:
                        self._perf_metrics["errors"] = []
                    
                    self._perf_metrics["errors"].append({
                        **error_context,
                        "handled": True,
                        "handling_component": handling_component,
                        "action": action
                    })
                
                return True
            
            # If propagation couldn't handle the error, try graceful degradation
            if propagation_result.get("degraded", False):
                logger.info(f"Applied graceful degradation: {propagation_result.get('action', 'unknown')}")
                
                # Record degradation in telemetry
                if hasattr(self, "_perf_metrics"):
                    if "degradations" not in self._perf_metrics:
                        self._perf_metrics["degradations"] = []
                    
                    self._perf_metrics["degradations"].append({
                        "error": error_context,
                        "degradation": propagation_result
                    })
                
                return True
        
        # Fall back to basic categorization and handling if error propagation not available
        # or if it couldn't handle the error
        # Determine error category for handling strategy
        if "memory" in str(error).lower() or isinstance(error, MemoryError):
            # Memory-related error - try to reduce memory usage
            handled = self._handle_memory_error(error_context)
        elif "timeout" in str(error).lower() or "deadline" in str(error).lower():
            # Timeout error - try to adjust timeouts or processing
            handled = self._handle_timeout_error(error_context)
        elif "connection" in str(error).lower() or "network" in str(error).lower() or "websocket" in str(error).lower():
            # Connection error - try recovery with retries
            handled = self._handle_connection_error(error_context)
        elif "webgpu" in str(error).lower() or "gpu" in str(error).lower():
            # WebGPU-specific error - try platform-specific fallbacks
            handled = self._handle_webgpu_error(error_context)
        else:
            # General error - use generic handling
            handled = self._handle_generic_error(error_context)
            
        # Notify other components about the error
        self._notify_components_of_error(error_context)
            
        # Record error in telemetry if available
        if hasattr(self, "_perf_metrics"):
            if "errors" not in self._perf_metrics:
                self._perf_metrics["errors"] = []
            
            self._perf_metrics["errors"].append({
                **error_context,
                "handled": handled
            })
            
        return handled
    
    def _notify_components_of_error(self, error_context):
        """
        Notify other components about an error.
        
        Args:
            error_context: Error context dictionary
        """
        # Get error details
        component = error_context.get("component")
        error_type = error_context.get("error_type")
        error_message = error_context.get("error_message")
        
        # Determine affected components
        affected_components = []
        
        # Define component dependencies
        dependencies = {
            "streaming": ["webgpu", "quantization"],
            "webgpu": ["shader_registry"],
            "quantization": ["webgpu"],
            "progressive_loading": ["webgpu", "webnn"],
            "shader_registry": [],
            "webnn": []
        }
        
        # Get components that depend on the error source
        for comp, deps in dependencies.items():
            if component in deps:
                affected_components.append(comp)
        
        # Notify affected components
        for comp_name in affected_components:
            if comp_name in self._components:
                comp_obj = self._components[comp_name]
                
                # Check if component has an error notification handler
                if hasattr(comp_obj, "on_dependency_error"):
                    try:
                        comp_obj.on_dependency_error(component, error_type, error_message)
                        logger.debug(f"Notified {comp_name} of error in dependency {component}")
                    except Exception as e:
                        logger.error(f"Error notifying {comp_name} of dependency error: {e}")
    
    def _handle_connection_error(self, error_context):
        """Handle connection-related errors with retry and fallback mechanisms."""
        component = error_context.get("component")
        
        # Try to use graceful degradation if available
        try:
            from fixed_web_platform.unified_framework.graceful_degradation import (
                GracefulDegradationManager
            )
            
            # Create degradation manager and apply connection error handling
            degradation_manager = GracefulDegradationManager()
            degradation_result = degradation_manager.handle_connection_error(
                component=component,
                severity="error",
                error_count=1
            )
            
            # Apply degradation actions
            if degradation_result.get("actions"):
                logger.info(f"Applied connection error degradation for {component}")
                
                # Apply each action
                for action in degradation_result["actions"]:
                    self._apply_degradation_action(action, component)
                
                return True
        except (ImportError, Exception) as e:
            logger.warning(f"Could not use graceful degradation for connection error: {e}")
        
        # Fall back to basic retry mechanism
        if component == "streaming":
            # For streaming, disable WebSocket and use synchronous mode
            if hasattr(self, "config"):
                self.config["streaming_enabled"] = False
                self.config["use_websocket"] = False
                self.config["synchronous_mode"] = True
                logger.info(f"Disabled streaming for {component} due to connection error")
                return True
        
        # Generic retry mechanism
        try:
            # If the component has a retry method, call it
            comp_obj = self._components.get(component)
            if comp_obj and hasattr(comp_obj, "retry"):
                comp_obj.retry()
                logger.info(f"Applied retry for {component}")
                return True
        except Exception as e:
            logger.error(f"Error applying retry for {component}: {e}")
        
        return False
    
    def _apply_degradation_action(self, action, component):
        """
        Apply a degradation action to a component.
        
        Args:
            action: Degradation action dictionary
            component: Component name
        """
        # Get action details
        strategy = action.get("strategy")
        params = action.get("parameters", {})
        
        # Apply strategy-specific actions
        if strategy == "reduce_batch_size":
            # Reduce batch size
            if hasattr(self, "config"):
                new_batch_size = params.get("new_batch_size", 1)
                self.config["batch_size"] = new_batch_size
                logger.info(f"Reduced batch size to {new_batch_size} for {component}")
            
        elif strategy == "reduce_precision":
            # Reduce precision
            if hasattr(self, "config"):
                precision = params.get("precision")
                self.config["precision"] = precision
                logger.info(f"Reduced precision to {precision} for {component}")
            
        elif strategy == "disable_features":
            # Disable features
            if hasattr(self, "config"):
                features = params.get("disabled_features", [])
                for feature in features:
                    feature_key = f"use_{feature}" if not feature.startswith("use_") else feature
                    self.config[feature_key] = False
                logger.info(f"Disabled features: {', '.join(features)} for {component}")
            
        elif strategy == "fallback_backend":
            # Apply backend fallback
            if hasattr(self, "config"):
                backend = params.get("backend")
                self.config["backend"] = backend
                self.config["use_" + backend] = True
                logger.info(f"Switched to {backend} backend for {component}")
            
        elif strategy == "disable_streaming":
            # Disable streaming
            if hasattr(self, "config"):
                self.config["streaming_enabled"] = False
                self.config["use_batched_mode"] = True
                logger.info(f"Disabled streaming mode for {component}")
            
        elif strategy == "cpu_fallback":
            # Apply CPU fallback
            if hasattr(self, "config"):
                self.config["use_cpu"] = True
                self.config["use_gpu"] = False
                logger.info(f"Applied CPU fallback for {component}")
            
        elif strategy == "retry_with_backoff":
            # Apply retry with backoff
            comp_obj = self._components.get(component)
            if comp_obj and hasattr(comp_obj, "retry_with_backoff"):
                retry_count = params.get("retry_count", 1)
                backoff_factor = params.get("backoff_factor", 1.5)
                comp_obj.retry_with_backoff(retry_count, backoff_factor)
                logger.info(f"Applied retry with backoff for {component}")
        
        # Add more strategy handlers as needed
    
    def _handle_memory_error(self, error_context):
        """Handle memory-related errors with appropriate strategies."""
        component = error_context["component"]
        handled = False
        
        # Apply memory pressure handling strategies
        if component == "streaming" and "streaming" in self._components:
            # For streaming component, try to reduce batch size or precision
            streaming = self._components["streaming"]
            
            # 1. Reduce batch size if possible
            if hasattr(streaming, "_current_batch_size") and streaming._current_batch_size > 1:
                old_batch = streaming._current_batch_size
                streaming._current_batch_size = max(1, streaming._current_batch_size // 2)
                logger.info(f"Reduced batch size from {old_batch} to {streaming._current_batch_size}")
                handled = True
                
            # 2. Try switching to lower precision if batch size reduction didn't work
            elif hasattr(streaming, "config") and streaming.config.get("quantization", "") != "int2":
                # Try reducing to lowest precision
                streaming.config["quantization"] = "int2"
                logger.info("Switched to int2 precision to reduce memory usage")
                handled = True
                
        elif "quantizer" in self._components:
            # For other components, try reducing precision globally
            quantizer = self._components["quantizer"]
            
            # Try to switch to lower precision
            if hasattr(quantizer, "current_bits") and quantizer.current_bits > 2:
                old_bits = quantizer.current_bits
                quantizer.current_bits = 2  # Set to lowest precision
                logger.info(f"Reduced quantization from {old_bits}-bit to 2-bit")
                handled = True
                
        return handled
    
    def _handle_timeout_error(self, error_context):
        """Handle timeout-related errors with appropriate strategies."""
        component = error_context["component"]
        handled = False
        
        # Apply timeout handling strategies
        if component == "streaming" and "streaming" in self._components:
            streaming = self._components["streaming"]
            
            # 1. Reduce generation length
            if hasattr(streaming, "_max_new_tokens") and streaming._max_new_tokens > 20:
                streaming._max_new_tokens = min(streaming._max_new_tokens, 20)
                logger.info(f"Reduced max token count to {streaming._max_new_tokens}")
                handled = True
                
            # 2. Disable advanced features that might cause timeouts
            if hasattr(streaming, "config"):
                if streaming.config.get("latency_optimized", False):
                    streaming.config["latency_optimized"] = False
                    logger.info("Disabled latency optimization to reduce complexity")
                    handled = True
        
        return handled
    
    def _handle_webgpu_error(self, error_context):
        """Handle WebGPU-specific errors with appropriate strategies."""
        handled = False
        
        # Check if we have a fallback manager
        if hasattr(self, "fallback_manager") and self.fallback_manager:
            # Try to determine the operation that caused the error
            operation_name = error_context.get("operation", "unknown_operation")
            
            # Check if we have a Safari-specific WebGPU error
            if hasattr(self, "browser_info") and self.browser_info.get("name", "").lower() == "safari":
                logger.info(f"Using Safari-specific fallback for {operation_name}")
                
                # Apply operation-specific Safari fallback strategies
                if operation_name == "matmul" or operation_name == "matmul_4bit":
                    logger.info("Activating layer-by-layer processing for matrix operations")
                    self.config["enable_layer_processing"] = True
                    handled = True
                    
                elif operation_name == "attention_compute" or operation_name == "multi_head_attention":
                    logger.info("Activating chunked attention processing")
                    self.config["chunked_attention"] = True
                    handled = True
                    
                elif operation_name == "kv_cache_update":
                    logger.info("Activating partitioned KV cache")
                    self.config["partitioned_kv_cache"] = True
                    handled = True
                
                # Create optimal fallback strategy based on error context
                strategy = self.fallback_manager.create_optimal_fallback_strategy(
                    model_type=self.model_type,
                    browser_info=self.browser_info,
                    operation_type=operation_name,
                    config=self.config
                )
                
                # Apply strategy to configuration
                self.config.update(strategy)
                logger.info(f"Applied Safari-specific fallback strategy for {operation_name}")
                handled = True
        
        # Check for WebGPU simulation capability as fallback
        if not handled and hasattr(self, "config") and not self.config.get("webgpu_simulation", False):
            self.config["webgpu_simulation"] = True
            os.environ["WEBGPU_SIMULATION"] = "1"
            logger.info("Activated WebGPU simulation mode due to WebGPU errors")
            handled = True
            
        # Check for WebAssembly fallback as last resort
        if not handled and "wasm_fallback" in self._components:
            logger.info("Switching to WebAssembly fallback due to WebGPU errors")
            self.config["use_webgpu"] = False
            self.config["use_wasm_fallback"] = True
            handled = True
        
        return handled
    
    def _handle_generic_error(self, error_context):
        """Handle generic errors with best-effort strategies."""
        # Log the error for investigation
        logger.error(f"Unhandled error: {error_context}")
        
        # Check if we need to disable advanced features
        if hasattr(self, "config"):
            # Disable advanced optimizations that might cause issues
            optimizations = [
                "shader_precompilation", 
                "compute_shaders", 
                "parallel_loading", 
                "streaming_inference"
            ]
            
            for opt in optimizations:
                if self.config.get(opt, False):
                    self.config[opt] = False
                    logger.info(f"Disabled {opt} due to error")
            
            # Try to enable any available fallbacks
            self.config["use_wasm_fallback"] = True
            
        return False


def create_web_endpoint(model_path: str, model_type: str, config: Dict[str, Any] = None) -> Callable:
    """
    Create a web-accelerated model endpoint with a single function call.
    
    Args:
        model_path: Path to the model
        model_type: Type of model (text, vision, audio, multimodal)
        config: Optional configuration dictionary
        
    Returns:
        Callable function for model inference
    """
    # Create accelerator
    accelerator = WebPlatformAccelerator(
        model_path=model_path,
        model_type=model_type,
        config=config,
        auto_detect=True
    )
    
    # Create and return endpoint
    return accelerator.create_endpoint()


def get_optimal_config(model_path: str, model_type: str) -> Dict[str, Any]:
    """
    Get optimal configuration for a specific model.
    
    Args:
        model_path: Path to the model
        model_type: Type of model
        
    Returns:
        Dictionary with optimal configuration
    """
    # Detect capabilities
    detector = BrowserCapabilityDetector()
    capabilities = detector.get_capabilities()
    profile = detector.get_optimization_profile()
    
    # Check WebNN availability
    webnn_available = capabilities["webnn"]["available"]
    
    # Create base config
    config = {
        "browser_capabilities": capabilities,
        "optimization_profile": profile,
        "use_webgpu": capabilities["webgpu"]["available"],
        "use_webnn": webnn_available,
        "compute_shaders": capabilities["webgpu"]["compute_shaders"],
        "shader_precompilation": capabilities["webgpu"]["shader_precompilation"],
        "browser": capabilities["browser_info"]["name"],
        "browser_version": capabilities["browser_info"]["version"],
        
        # WebNN specific configuration
        "webnn_gpu_backend": webnn_available and capabilities["webnn"]["gpu_backend"],
        "webnn_cpu_backend": webnn_available and capabilities["webnn"]["cpu_backend"],
        "webnn_preferred_backend": capabilities["webnn"].get("preferred_backend", "gpu") if webnn_available else None,
        
        # For Safari, prioritize WebNN over WebGPU due to more robust implementation
        "prefer_webnn_over_webgpu": capabilities["browser_info"]["name"].lower() == "safari" and webnn_available
    }
    
    # Add model-specific optimizations
    if model_type == "text":
        if "bert" in model_path.lower() or "roberta" in model_path.lower():
            config.update({
                "quantization": 4,
                "shader_precompilation": True,
                "ultra_low_precision": False
            })
        elif "t5" in model_path.lower():
            config.update({
                "quantization": 4,
                "shader_precompilation": True,
                "ultra_low_precision": False
            })
        elif "llama" in model_path.lower() or "gpt" in model_path.lower():
            config.update({
                "quantization": 4,
                "kv_cache_optimization": True,
                "streaming_inference": True,
                "ultra_low_precision": profile["precision"]["ultra_low_precision_enabled"]
            })
    elif model_type == "vision":
        config.update({
            "quantization": 4,
            "shader_precompilation": True,
            "ultra_low_precision": False
        })
    elif model_type == "audio":
        config.update({
            "quantization": 8,
            "compute_shaders": True,
            "ultra_low_precision": False
        })
    elif model_type == "multimodal":
        config.update({
            "quantization": 4,
            "parallel_loading": True,
            "progressive_loading": True,
            "ultra_low_precision": False
        })
    
    return config


def get_browser_capabilities() -> Dict[str, Any]:
    """
    Get current browser capabilities.
    
    Returns:
        Dictionary with browser capabilities
    """
    detector = BrowserCapabilityDetector()
    return detector.get_capabilities()


class StreamingAdapter:
    """Adapter for streaming inference integration with unified framework."""
    
    def __init__(self, framework):
        """Initialize adapter with framework reference."""
        self.framework = framework
        self.streaming_pipeline = None
        self.config = framework.config.get("streaming", {})
        self.error_handler = framework.get_components().get("error_handler")
        self.telemetry = framework.get_components().get("performance_monitor")
    
    def create_pipeline(self):
        """
        Create a streaming inference pipeline.
        
        Returns:
            Dictionary with pipeline interface
        """
        try:
            # Get model information from framework
            model = self.framework.model_path
            model_type = self.framework.model_type
            
            # Create WebGPU streaming inference handler
            from fixed_web_platform.webgpu_streaming_inference import WebGPUStreamingInference
            
            # Prepare initial streaming configuration
            streaming_config = {
                "quantization": self.config.get("precision", "int4"),
                "optimize_kv_cache": self.config.get("kv_cache", True),
                "latency_optimized": self.config.get("low_latency", True),
                "adaptive_batch_size": self.config.get("adaptive_batch", True),
                "max_batch_size": self.config.get("max_batch_size", 8),
                "browser_info": self.framework.get_config().get("browser_info", {})
            }
            
            # Validate and auto-correct streaming configuration
            streaming_config = self._validate_streaming_config(streaming_config)
            
            # Create streaming handler with validated configuration
            self.streaming_pipeline = WebGPUStreamingInference(
                model_path=model,
                config=streaming_config
            )
            
            # Create pipeline interface
            pipeline = {
                "generate": self.streaming_pipeline.generate,
                "generate_async": self.streaming_pipeline.generate_async,
                "stream_websocket": self.streaming_pipeline.stream_websocket,
                "get_performance_stats": self.streaming_pipeline.get_performance_stats,
                "model_type": model_type,
                "adapter": self
            }
            
            # Register error handlers
            self._register_error_handlers()
            
            # Register telemetry collectors
            self._register_telemetry_collectors()
            
            return pipeline
            
        except Exception as e:
            if self.error_handler:
                return self.error_handler.handle_error(
                    error=e,
                    context={"component": "streaming_adapter", "operation": "create_pipeline"},
                    recoverable=False
                )
            else:
                # Basic error handling if error_handler not available
                logger.error(f"Error creating streaming pipeline: {e}")
                raise
    
    def _validate_streaming_config(self, config):
        """
        Validate and auto-correct streaming configuration based on browser compatibility.
        
        Args:
            config: Initial streaming configuration
            
        Returns:
            Validated and auto-corrected configuration
        """
        # Get browser information from the framework
        browser = self.framework.get_config().get("browser", "").lower()
        browser_version = self.framework.get_config().get("browser_version", 0)
        
        # Create a copy of the config to avoid modifying the original
        validated_config = config.copy()
        
        # Normalize quantization value
        if "quantization" in validated_config:
            quant = validated_config["quantization"]
            
            # Convert string like "int4" to "4" then to int 4
            if isinstance(quant, str):
                quant = quant.replace("int", "").replace("bit", "").strip()
                try:
                    quant = int(quant)
                    # Store as string with "int" prefix for WebGPUStreamingInference
                    validated_config["quantization"] = f"int{quant}"
                except ValueError:
                    # Invalid quantization string, set default
                    logger.warning(f"Invalid quantization format: {quant}, setting to int4")
                    validated_config["quantization"] = "int4"
        
        # Browser-specific validations and corrections
        if browser == "safari":
            # Safari has limitations with streaming and KV-cache optimization
            if validated_config.get("optimize_kv_cache", False):
                logger.warning("Safari has limited KV-cache support, disabling for streaming")
                validated_config["optimize_kv_cache"] = False
                
            # Safari may struggle with very low latency settings
            if validated_config.get("latency_optimized", False):
                # Keep it enabled but with more conservative settings
                validated_config["latency_optimized"] = True
                validated_config["conservative_latency"] = True
                logger.info("Using conservative latency optimization for Safari")
                
            # Limit maximum batch size on Safari
            max_batch = validated_config.get("max_batch_size", 8)
            if max_batch > 4:
                logger.info(f"Reducing max batch size from {max_batch} to 4 for Safari compatibility")
                validated_config["max_batch_size"] = 4
                
        elif browser == "firefox":
            # Firefox works well with compute shaders for streaming tokens
            validated_config["use_compute_shaders"] = True
            
            # Firefox-specific workgroup size for optimal performance
            validated_config["workgroup_size"] = [256, 1, 1]
            logger.info("Using Firefox-optimized workgroup size for streaming")
                
        # Validate max_tokens_per_step for all browsers
        if "max_tokens_per_step" in validated_config:
            max_tokens = validated_config["max_tokens_per_step"]
            
            # Ensure it's within reasonable bounds
            if max_tokens < 1:
                logger.warning(f"Invalid max_tokens_per_step: {max_tokens}, setting to 1")
                validated_config["max_tokens_per_step"] = 1
            elif max_tokens > 32:
                logger.warning(f"max_tokens_per_step too high: {max_tokens}, limiting to 32")
                validated_config["max_tokens_per_step"] = 32
                
        # Add configuration validation timestamp
        validated_config["validation_timestamp"] = time.time()
        
        # Log validation result
        logger.info(f"Streaming configuration validated for {browser}")
        
        return validated_config
    
    def _register_error_handlers(self):
        """Register component-specific error handlers."""
        if not self.streaming_pipeline:
            return
            
        # Register standard error handlers if supported
        if hasattr(self.streaming_pipeline, "set_error_callback"):
            self.streaming_pipeline.set_error_callback(self._on_streaming_error)
        
        # Register specialized handlers if supported
        for handler_name in ["on_memory_pressure", "on_timeout", "on_connection_error"]:
            if hasattr(self.streaming_pipeline, handler_name):
                setattr(self.streaming_pipeline, handler_name, getattr(self, f"_{handler_name}"))
    
    def _register_telemetry_collectors(self):
        """Register telemetry collectors."""
        if not self.streaming_pipeline or not self.telemetry or not hasattr(self.telemetry, "register_collector"):
            return
            
        # Register telemetry collector
        self.telemetry.register_collector(
            "streaming_inference",
            self.streaming_pipeline.get_performance_stats
        )
    
    def _on_streaming_error(self, error_info):
        """Handle streaming errors."""
        logger.error(f"Streaming error: {error_info}")
        
        # Pass to framework error handler if available
        if hasattr(self.framework, "_handle_cross_component_error"):
            self.framework._handle_cross_component_error(
                error=error_info.get("error", Exception(error_info.get("message", "Unknown error"))),
                component="streaming",
                operation=error_info.get("operation", "generate"),
                recoverable=error_info.get("recoverable", False)
            )
    
    def _on_memory_pressure(self):
        """Handle memory pressure events."""
        logger.warning("Memory pressure detected in streaming pipeline")
        
        # Reduce batch size if possible
        if hasattr(self.streaming_pipeline, "_current_batch_size") and self.streaming_pipeline._current_batch_size > 1:
            old_batch = self.streaming_pipeline._current_batch_size
            self.streaming_pipeline._current_batch_size = max(1, self.streaming_pipeline._current_batch_size // 2)
            logger.info(f"Reduced batch size from {old_batch} to {self.streaming_pipeline._current_batch_size}")
            
        # Notify framework of memory pressure
        if hasattr(self.framework, "on_memory_pressure"):
            self.framework.on_memory_pressure()
            
        return True
    
    def _on_timeout(self):
        """Handle timeout events."""
        logger.warning("Timeout detected in streaming pipeline")
        
        # Reduce generation parameters
        if hasattr(self.streaming_pipeline, "_max_new_tokens") and self.streaming_pipeline._max_new_tokens > 20:
            self.streaming_pipeline._max_new_tokens = min(self.streaming_pipeline._max_new_tokens, 20)
            logger.info(f"Reduced max token count to {self.streaming_pipeline._max_new_tokens}")
            
        # Disable optimizations that might be causing timeouts
        if hasattr(self.streaming_pipeline, "config"):
            config_changes = []
            
            if self.streaming_pipeline.config.get("latency_optimized", False):
                self.streaming_pipeline.config["latency_optimized"] = False
                config_changes.append("latency_optimized")
                
            if self.streaming_pipeline.config.get("prefill_optimized", False):
                self.streaming_pipeline.config["prefill_optimized"] = False
                config_changes.append("prefill_optimized")
                
            if config_changes:
                logger.info(f"Disabled optimizations due to timeout: {', '.join(config_changes)}")
                
        return True
    
    def _on_connection_error(self):
        """Handle connection errors."""
        logger.warning("Connection error detected in streaming pipeline")
        
        # Enable fallback modes
        if hasattr(self.streaming_pipeline, "config"):
            self.streaming_pipeline.config["use_fallback"] = True
            
        # Notify framework of connection issue
        if hasattr(self.framework, "on_connection_error"):
            self.framework.on_connection_error()
            
        return True
    
    def get_optimization_stats(self):
        """Get optimization usage statistics."""
        if not self.streaming_pipeline:
            return {}
            
        # Return optimization stats if available
        if hasattr(self.streaming_pipeline, "_optimization_usage"):
            return self.streaming_pipeline._optimization_usage
            
        # Return token timing stats if available
        if hasattr(self.streaming_pipeline, "_token_timing"):
            return {
                "token_timing": self.streaming_pipeline._token_timing
            }
            
        # Return general stats if available
        if hasattr(self.streaming_pipeline, "_token_generation_stats"):
            return {
                "generation_stats": self.streaming_pipeline._token_generation_stats
            }
            
        return {}


if __name__ == "__main__":
    print("Unified Web Framework")
    
    # Get browser capabilities 
    detector = BrowserCapabilityDetector()
    capabilities = detector.get_capabilities()
    
    print(f"Browser: {capabilities['browser_info']['name']} {capabilities['browser_info']['version']}")
    print(f"WebGPU available: {capabilities['webgpu']['available']}")
    print(f"WebNN available: {capabilities['webnn']['available']}")
    print(f"WebAssembly SIMD: {capabilities['webassembly']['simd']}")
    
    # Example usage
    model_path = "models/bert-base-uncased"
    model_type = "text"
    
    # Test configuration validation and auto-correction with deliberately invalid settings
    invalid_config = {
        "quantization": "invalid",                # Invalid quantization
        "workgroup_size": "not_a_list",           # Invalid workgroup size
        "kv_cache_optimization": True,            # Will be corrected for vision models
        "use_compute_shaders": True,              # Will be browser-specific
        "batch_size": 0,                          # Invalid batch size
        "memory_threshold_mb": 5,                 # Too low memory threshold
        "browser": "safari",                      # To test Safari-specific corrections
        "ultra_low_precision": True               # Safari doesn't support ultra-low precision
    }
    
    print("\nTesting configuration validation with deliberately invalid settings:")
    for key, value in invalid_config.items():
        print(f"  Invalid: {key} = {value}")
    
    # Create accelerator with auto-detection and invalid config to demonstrate correction
    accelerator = WebPlatformAccelerator(
        model_path=model_path,
        model_type="vision",  # Choose vision to test kv_cache_optimization removal
        config=invalid_config,
        auto_detect=True
    )
    
    # Print validated configuration
    config = accelerator.get_config()
    print("\nAuto-corrected Configuration:")
    for key, value in config.items():
        if key in invalid_config:
            print(f"  {key}: {value}")
    
    # Print feature usage
    feature_usage = accelerator.get_feature_usage()
    print("\nFeature Usage:")
    for feature, used in feature_usage.items():
        print(f"  {feature}: {'✅' if used else '❌'}")
    
    # Test streaming configuration validation
    print("\nCreating standard accelerator for BERT model with different browser:")
    standard_accelerator = WebPlatformAccelerator(
        model_path=model_path,
        model_type="text",
        config={"browser": "firefox"},  # Test Firefox-specific optimizations
        auto_detect=True
    )
    
    print("\nTesting StreamingAdapter configuration validation:")
    # Create framework with adapter
    adapter = StreamingAdapter(standard_accelerator)
    
    # Test streaming configuration validation with invalid settings
    invalid_streaming_config = {
        "quantization": "int256",  # Invalid quantization
        "max_tokens_per_step": 100,  # Too high
        "max_batch_size": 64       # Will be browser-adjusted
    }
    
    # Validate the configuration
    corrected_config = adapter._validate_streaming_config(invalid_streaming_config)
    
    # Print the corrected configuration
    print("\nCorrected streaming configuration:")
    for key, value in corrected_config.items():
        print(f"  {key}: {value}")
    
    # Get performance metrics
    metrics = standard_accelerator.get_performance_metrics()
    print("\nPerformance Metrics:")
    print(f"  Initialization time: {metrics['initialization_time_ms']:.2f}ms")
    
    # Create endpoint
    endpoint = standard_accelerator.create_endpoint()
    
    # Example inference
    print("\nRunning example inference...")
    result = endpoint("Example text for inference")
    
    # Get updated metrics
    metrics = standard_accelerator.get_performance_metrics()
    print(f"  First inference time: {metrics['first_inference_time_ms']:.2f}ms")
    print(f"  Average inference time: {metrics['average_inference_time_ms']:.2f}ms")
    print(f"  Memory usage: {metrics['memory_usage_mb']:.2f}MB")
    
    print("\nConfiguration validation and auto-correction implemented successfully!")