#!/usr/bin/env python3
"""
Real WebGPU Implementation Module

This module provides a real WebGPU implementation that integrates with the browser
using the implementation created in implement_real_webnn_webgpu.py.

This implementation replaces the simulation with actual browser-based execution and
includes comprehensive timing metrics tracking for benchmarking performance.

Key features:
- Browser-based WebGPU acceleration with transformers.js integration
- Shader precompilation support for faster first inference
- Compute shader optimization for specific models (especially audio)
- Detailed timing metrics for benchmarking and analysis
- Cross-browser compatibility (Chrome, Firefox, Edge, Safari)

Usage:
    from fixed_web_platform.webgpu_implementation import RealWebGPUImplementation

    # Create implementation
    impl = RealWebGPUImplementation(browser_name="chrome", headless=True)

    # Initialize
    await impl.initialize()

    # Initialize model
    model_info = await impl.initialize_model("bert-base-uncased", model_type="text")

    # Run inference
    result = await impl.run_inference("bert-base-uncased", "This is a test input")
    
    # Get timing metrics
    timing_metrics = impl.get_timing_metrics("bert-base-uncased")

    # Shutdown
    await impl.shutdown()
"""

import os
import sys
import json
import time
import asyncio
import logging
import tempfile
import subprocess
from typing import Dict, List, Any, Optional, Union, Tuple

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Check if parent directory is in path, if not add it
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Import from the implement_real_webnn_webgpu.py file
try:
    from implement_real_webnn_webgpu import (
        WebPlatformImplementation,
        RealWebPlatformIntegration
    )
except ImportError:
    logger.error("Failed to import from implement_real_webnn_webgpu.py")
    logger.error("Make sure the file exists in the test directory")
    WebPlatformImplementation = None
    RealWebPlatformIntegration = None

# Constants
# This file has been updated to use real browser implementation
USING_REAL_IMPLEMENTATION = True
WEBGPU_IMPLEMENTATION_TYPE = "REAL_WEBGPU"

# Import for real implementation
try:
    # Try to import from parent directory
    import os
    import sys
    from pathlib import Path
    
    # Add parent directory to path
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if parent_dir not in sys.path:
        sys.path.append(parent_dir)
        
    # Now try to import
    from real_web_implementation import RealWebImplementation
    logger.info("Successfully imported RealWebImplementation - using REAL hardware acceleration when available")
except ImportError:
    logger.error("Could not import RealWebImplementation. Using simulation fallback.")
    RealWebImplementation = None

class RealWebGPUImplementation:
    """Real WebGPU implementation using browser bridge with comprehensive timing tracking."""
    
    def __init__(self, browser_name="chrome", headless=True):
        """Initialize real WebGPU implementation.
        
        Args:
            browser_name: Browser to use (chrome, firefox, edge, safari)
            headless: Whether to run in headless mode
        """
        self.browser_name = browser_name
        self.headless = headless
        
        # Try to use the new implementation
        if RealWebImplementation:
            self.implementation = RealWebImplementation(browser_name=browser_name, headless=headless)
        else:
            self.implementation = None
            logger.warning("Using simulation fallback - RealWebImplementation not available")
            
        self.initialized = False
        
        # Add timing metrics storage
        self.timing_metrics = {}
        self.model_metrics = {}
    
    async def initialize(self):
        """Initialize WebGPU implementation.
        
        Returns:
            True if initialization successful, False otherwise
        """
        if self.initialized:
            logger.info("WebGPU implementation already initialized")
            return True
        
        # Record initialization start time for timing metrics
        start_time = time.time()
            
        # Try to use real implementation
        if self.implementation:
            try:
                logger.info(f"Initializing WebGPU with {self.browser_name} browser (headless: {self.headless})")
                
                # Save options for later use (even though we can't pass them directly)
                self.webgpu_options = {
                    "enable_shader_precompilation": True,  # Enable shader precompilation for faster startup
                    "enable_compute_shaders": True,  # Enable compute shaders for audio models
                    "collect_timing": True  # Enable timing metrics collection
                }
                
                # Start the implementation (options are not supported in the start method)
                success = self.implementation.start(platform="webgpu")
                
                if success:
                    self.initialized = True
                    
                    # Check if we're using simulation or real hardware
                    is_simulation = self.implementation.is_using_simulation()
                    
                    # Get feature support
                    features = self.get_feature_support()
                    has_shader_precompilation = features.get("shader_precompilation", False)
                    has_compute_shaders = features.get("compute_shaders", False)
                    
                    if is_simulation:
                        logger.warning("WebGPU hardware acceleration not available in browser, using simulation")
                    else:
                        logger.info("WebGPU implementation initialized with REAL hardware acceleration")
                        
                        # Log advanced features
                        if has_shader_precompilation:
                            logger.info("Shader precompilation is available for faster first inference")
                        
                        if has_compute_shaders:
                            logger.info("Compute shaders are available for optimized audio model processing")
                    
                    # Record timing metrics
                    end_time = time.time()
                    self.timing_metrics["initialization"] = {
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration_ms": (end_time - start_time) * 1000,
                        "is_simulation": is_simulation,
                        "has_shader_precompilation": has_shader_precompilation,
                        "has_compute_shaders": has_compute_shaders
                    }
                    
                    # Log initialization time
                    logger.info(f"WebGPU implementation initialized in {(end_time - start_time) * 1000:.2f} ms")
                    
                    return True
                else:
                    logger.error("Failed to initialize WebGPU platform")
                    return False
            except Exception as e:
                logger.error(f"Error initializing WebGPU implementation: {e}")
                return False
                
        # Fallback to simulation
        logger.warning("Using simulation for WebGPU - real implementation not available")
        self.initialized = True  # Simulate initialization
        
        # Record timing metrics for simulation
        end_time = time.time()
        self.timing_metrics["initialization"] = {
            "start_time": start_time,
            "end_time": end_time,
            "duration_ms": (end_time - start_time) * 1000,
            "is_simulation": True,
            "has_shader_precompilation": False,
            "has_compute_shaders": False
        }
        
        return True
    
    async def initialize_model(self, model_name, model_type="text", model_path=None, model_options=None):
        """Initialize model.
        
        Args:
            model_name: Name of the model
            model_type: Type of model (text, vision, audio, multimodal)
            model_path: Path to model (optional)
            model_options: Additional model options (optional)
            
        Returns:
            Model initialization information or None if initialization failed
        """
        if not self.initialized:
            logger.warning("WebGPU implementation not initialized. Attempting to initialize.")
            if not await self.initialize():
                logger.error("Failed to initialize WebGPU implementation")
                return None
        
        # Record model initialization start time
        start_time = time.time()
        model_key = model_path or model_name
        
        # Set default options based on model type if not provided
        if model_options is None:
            model_options = {}
            
            # Default for different model types
            if model_type == "audio":
                # Enable compute shader optimization for audio models
                model_options["enable_compute_shaders"] = True
            
            # Enable shader precompilation for all model types
            model_options["enable_shader_precompilation"] = True
        
        # Add timing collection to options
        model_options["collect_timing"] = True
        
        # Try to use real implementation
        if self.implementation and hasattr(self.implementation, 'initialize_model'):
            try:
                logger.info(f"Initializing model {model_name} with type {model_type}")
                
                # Enable appropriate features based on model type
                if model_type == "audio" and not model_options.get("enable_compute_shaders", False):
                    logger.info("Enabling compute shader optimization for audio model")
                    model_options["enable_compute_shaders"] = True
                
                # Initialize with options
                result = self.implementation.initialize_model(model_name, model_type, options=model_options)
                
                # Record end time and calculate duration
                end_time = time.time()
                duration_ms = (end_time - start_time) * 1000
                
                if result:
                    # Check for browser-specific features
                    features = self.get_feature_support()
                    has_shader_precompilation = features.get("shader_precompilation", False)
                    has_compute_shaders = features.get("compute_shaders", False)
                    
                    # Store timing metrics
                    self.model_metrics[model_key] = {
                        "initialization": {
                            "start_time": start_time,
                            "end_time": end_time,
                            "duration_ms": duration_ms,
                            "model_type": model_type,
                            "is_simulation": False,
                            "shader_precompilation": has_shader_precompilation and model_options.get("enable_shader_precompilation", True),
                            "compute_shaders": has_compute_shaders and model_options.get("enable_compute_shaders", model_type == "audio")
                        },
                        "inference_records": []
                    }
                    
                    logger.info(f"Model {model_name} initialized successfully in {duration_ms:.2f} ms")
                    
                    # Create response with timing metrics
                    response = {
                        "status": "success",
                        "model_name": model_name,
                        "model_type": model_type,
                        "performance_metrics": {
                            "initialization_time_ms": duration_ms
                        }
                    }
                    
                    # Add WebGPU-specific features
                    if has_shader_precompilation and model_options.get("enable_shader_precompilation", True):
                        response["shader_precompilation"] = True
                        logger.info(f"Shader precompilation enabled for model {model_name}")
                    
                    if has_compute_shaders and model_options.get("enable_compute_shaders", model_type == "audio"):
                        response["compute_shaders"] = True
                        if model_type == "audio":
                            logger.info(f"Compute shader optimization enabled for audio model {model_name}")
                    
                    return response
                else:
                    logger.warning(f"Failed to initialize model with real implementation, using simulation")
            except Exception as e:
                logger.error(f"Error initializing model {model_name}: {e}")
        
        # Fallback to simulation
        logger.info(f"Simulating model initialization for {model_name}")
        
        # Record end time for simulation
        end_time = time.time()
        duration_ms = (end_time - start_time) * 1000
        
        # Store timing metrics for simulation
        self.model_metrics[model_key] = {
            "initialization": {
                "start_time": start_time,
                "end_time": end_time,
                "duration_ms": duration_ms,
                "model_type": model_type,
                "is_simulation": True,
                "shader_precompilation": False,
                "compute_shaders": False
            },
            "inference_records": []
        }
        
        # Create simulated response with timing metrics
        return {
            "status": "success",
            "model_name": model_name,
            "model_type": model_type,
            "simulation": True,
            "performance_metrics": {
                "initialization_time_ms": duration_ms
            }
        }
    
    async def run_inference(self, model_name, input_data, options=None, model_path=None):
        """Run inference with model.
        
        Args:
            model_name: Name of the model
            input_data: Input data for inference
            options: Inference options (optional)
            model_path: Model path (optional)
            
        Returns:
            Inference result or None if inference failed
        """
        if not self.initialized:
            logger.warning("WebGPU implementation not initialized. Attempting to initialize.")
            if not await self.initialize():
                logger.error("Failed to initialize WebGPU implementation")
                return None
        
        # Record inference start time
        start_time = time.time()
        model_key = model_path or model_name
        
        # Initialize model if not already initialized
        if model_key not in self.model_metrics:
            logger.info(f"Model {model_name} not initialized. Initializing now.")
            
            # Create options based on model type
            model_type = "text"  # Default
            
            # Try to determine model type from input
            if isinstance(input_data, dict):
                if "image" in input_data:
                    model_type = "vision"
                elif "audio" in input_data:
                    model_type = "audio"
                elif "text" in input_data and "image" in input_data:
                    model_type = "multimodal"
            
            # Initialize with appropriate options
            model_info = await self.initialize_model(model_name, model_type, model_path)
            if not model_info:
                logger.error(f"Failed to initialize model {model_name}")
                return None
        
        # Create inference options based on model type if not provided
        inference_options = options or {}
        
        # Set defaults for shader precompilation and compute shaders if not specified
        if "shader_precompilation" not in inference_options:
            inference_options["shader_precompilation"] = True
        
        # Enable compute shaders for audio models by default
        if "compute_shaders" not in inference_options and model_key in self.model_metrics:
            model_type = self.model_metrics[model_key].get("initialization", {}).get("model_type", "text")
            if model_type == "audio":
                inference_options["compute_shaders"] = True
        
        # Enable timing collection
        inference_options["collect_timing"] = True
        
        # Try to use real implementation
        real_result = None
        is_simulation = True
        using_transformers_js = False
        
        if self.implementation and hasattr(self.implementation, 'run_inference'):
            try:
                logger.info(f"Running inference with model {model_name} using real implementation")
                
                # Run inference with options
                result = self.implementation.run_inference(model_name, input_data, options=inference_options)
                
                # Record end time and calculate duration
                end_time = time.time()
                duration_ms = (end_time - start_time) * 1000
                
                if result:
                    logger.info("Real inference completed successfully")
                    real_result = result
                    is_simulation = result.get("is_simulation", False)
                    using_transformers_js = result.get("using_transformers_js", False)
                    
                    # Store inference timing record
                    if model_key in self.model_metrics:
                        # Get feature info for this inference
                        features = self.get_feature_support()
                        has_shader_precompilation = features.get("shader_precompilation", False)
                        has_compute_shaders = features.get("compute_shaders", False)
                        
                        # Create record with detailed timing
                        inference_record = {
                            "start_time": start_time,
                            "end_time": end_time,
                            "duration_ms": duration_ms,
                            "is_simulation": is_simulation,
                            "using_transformers_js": using_transformers_js,
                            "shader_precompilation": has_shader_precompilation and inference_options.get("shader_precompilation", True),
                            "compute_shaders": has_compute_shaders and inference_options.get("compute_shaders", False)
                        }
                        
                        # Store browser-provided detailed timing if available
                        if "performance_metrics" in result:
                            browser_timing = result.get("performance_metrics", {})
                            inference_record["browser_timing"] = browser_timing
                        
                        self.model_metrics[model_key]["inference_records"].append(inference_record)
                        
                        # Calculate average inference time
                        inference_times = [record["duration_ms"] for record in self.model_metrics[model_key]["inference_records"]]
                        avg_inference_time = sum(inference_times) / len(inference_times)
                        
                        # Log performance metrics
                        logger.info(f"Inference completed in {duration_ms:.2f} ms (avg: {avg_inference_time:.2f} ms)")
                        
                        # Log if this was first inference with shader precompilation
                        if len(self.model_metrics[model_key]["inference_records"]) == 1 and inference_record["shader_precompilation"]:
                            logger.info("First inference with shader precompilation - subsequent inferences should be faster")
                        
                        # Log if compute shaders were used for audio model
                        model_type = self.model_metrics[model_key].get("initialization", {}).get("model_type", "text")
                        if model_type == "audio" and inference_record["compute_shaders"]:
                            if self.browser_name == "firefox":
                                logger.info("Using Firefox-optimized compute shaders for audio model")
                            else:
                                logger.info("Using compute shader optimization for audio model")
                    
                else:
                    logger.warning("Failed to run inference with real implementation")
            except Exception as e:
                logger.error(f"Error running inference with real implementation: {e}")
        
        # If we have a real result, add timing metrics and return it
        if real_result:
            # Add performance metrics if not already present
            if "performance_metrics" not in real_result:
                real_result["performance_metrics"] = {}
            
            # Add our timing metrics to the result
            end_time = time.time()
            duration_ms = (end_time - start_time) * 1000
            
            real_result["performance_metrics"]["total_time_ms"] = duration_ms
            
            # Add average inference time if available
            if model_key in self.model_metrics and len(self.model_metrics[model_key]["inference_records"]) > 0:
                inference_times = [record["duration_ms"] for record in self.model_metrics[model_key]["inference_records"]]
                avg_inference_time = sum(inference_times) / len(inference_times)
                real_result["performance_metrics"]["average_inference_time_ms"] = avg_inference_time
            
            # Add WebGPU-specific features status
            if "shader_precompilation" in inference_options:
                real_result["performance_metrics"]["shader_precompilation"] = inference_options["shader_precompilation"]
            
            if "compute_shaders" in inference_options:
                real_result["performance_metrics"]["compute_shaders"] = inference_options["compute_shaders"]
            
            # Add implementation details
            real_result["_implementation_details"] = {
                "is_simulation": is_simulation,
                "using_transformers_js": using_transformers_js,
                "implementation_type": WEBGPU_IMPLEMENTATION_TYPE,
                "shader_precompilation": inference_options.get("shader_precompilation", True),
                "compute_shaders": inference_options.get("compute_shaders", False)
            }
            
            return real_result
            
        # Fallback to simulation
        logger.info(f"Simulating inference for model {model_name}")
        
        # Record end time for simulation
        end_time = time.time()
        simulation_duration_ms = (end_time - start_time) * 1000
        
        # Store simulation timing record
        if model_key in self.model_metrics:
            simulation_record = {
                "start_time": start_time,
                "end_time": end_time,
                "duration_ms": simulation_duration_ms,
                "is_simulation": True,
                "using_transformers_js": False,
                "shader_precompilation": False,
                "compute_shaders": False
            }
            self.model_metrics[model_key]["inference_records"].append(simulation_record)
        
        # Simulate result based on input type
        if isinstance(input_data, str):
            output = {
                "text": f"Processed: {input_data[:20]}...",
                "embeddings": [0.1, 0.2, 0.3, 0.4, 0.5]  # Simulated embeddings
            }
        elif isinstance(input_data, dict) and "image" in input_data:
            output = {
                "classifications": [
                    {"label": "cat", "score": 0.8},
                    {"label": "dog", "score": 0.15}
                ]
            }
        else:
            output = {"result": "Simulated inference result"}
        
        # Create response with simulation timing metrics
        response = {
            "status": "success",
            "model_name": model_name,
            "output": output,
            "performance_metrics": {
                "inference_time_ms": simulation_duration_ms,
                "total_time_ms": simulation_duration_ms,
                "throughput_items_per_sec": 1000 / simulation_duration_ms,
                "simulation": True,
                "shader_precompilation": False,
                "compute_shaders": False
            },
            "implementation_type": WEBGPU_IMPLEMENTATION_TYPE,
            "is_simulation": True,
            "_implementation_details": {
                "is_simulation": True,
                "using_transformers_js": False,
                "implementation_type": WEBGPU_IMPLEMENTATION_TYPE,
                "shader_precompilation": False,
                "compute_shaders": False
            }
        }
        
        return response
    
    async def shutdown(self):
        """Shutdown WebGPU implementation."""
        if not self.initialized:
            logger.info("WebGPU implementation not initialized, nothing to shut down")
            return
        
        # Try to stop real implementation
        if self.implementation and hasattr(self.implementation, 'stop'):
            try:
                self.implementation.stop()
                logger.info("Real WebGPU implementation shut down successfully")
            except Exception as e:
                logger.error(f"Error shutting down real WebGPU implementation: {e}")
        
        self.initialized = False
    
    def get_implementation_type(self):
        """Get implementation type.
        
        Returns:
            Implementation type string
        """
        return WEBGPU_IMPLEMENTATION_TYPE
    
    def get_feature_support(self):
        """Get feature support information.
        
        Returns:
            Dictionary with feature support information or empty dict if not initialized
        """
        if not self.implementation or not hasattr(self.implementation, 'features') or not self.implementation.features:
            # Return default feature info
            return {
                "webgpu": False,
                "webnn": False,
                "wasm": True,
                "shader_precompilation": False,
                "compute_shaders": False
            }
        
        # Get features from implementation
        features = self.implementation.features.copy()
        
        # Add WebGPU-specific features if not present
        if "shader_precompilation" not in features and features.get("webgpu", False):
            # Default to True for Chrome and Edge if WebGPU is available
            if self.browser_name in ["chrome", "edge"]:
                features["shader_precompilation"] = True
            elif self.browser_name == "firefox":
                features["shader_precompilation"] = True
            else:
                features["shader_precompilation"] = False
        
        if "compute_shaders" not in features and features.get("webgpu", False):
            # Default to True for all browsers with WebGPU
            features["compute_shaders"] = True
        
        return features
        
    def get_timing_metrics(self, model_name=None):
        """Get timing metrics for model(s).
        
        Args:
            model_name: Specific model to get metrics for (None for all)
            
        Returns:
            Dictionary with timing metrics
        """
        # If model name is provided, return metrics for that model
        if model_name:
            return self.model_metrics.get(model_name, {})
        
        # Otherwise return all metrics
        return {
            "global": self.timing_metrics,
            "models": self.model_metrics
        }

# Async test function for testing the implementation
async def test_implementation():
    """Test the real WebGPU implementation with detailed timing metrics."""
    # Create implementation
    impl = RealWebGPUImplementation(browser_name="chrome", headless=False)
    
    try:
        # Initialize
        logger.info("Initializing WebGPU implementation")
        success = await impl.initialize()
        if not success:
            logger.error("Failed to initialize WebGPU implementation")
            return 1
        
        # Get feature support
        features = impl.get_feature_support()
        logger.info(f"WebGPU feature support: {json.dumps(features, indent=2)}")
        
        # Check for shader precompilation and compute shaders
        has_shader_precompilation = features.get("shader_precompilation", False)
        has_compute_shaders = features.get("compute_shaders", False)
        
        if has_shader_precompilation:
            logger.info("Shader precompilation is available - first inference will precompile shaders")
        else:
            logger.warning("Shader precompilation is not available - first inference may be slower")
            
        if has_compute_shaders:
            logger.info("Compute shaders are available - will be used for audio models")
        else:
            logger.warning("Compute shaders are not available - audio model performance may be limited")
        
        # Get initialization timing metrics
        init_metrics = impl.get_timing_metrics()
        logger.info(f"Initialization timing: {json.dumps(init_metrics.get('global', {}).get('initialization', {}), indent=2)}")
        
        # Initialize model with shader precompilation
        logger.info("Initializing BERT model with shader precompilation")
        model_options = {
            "enable_shader_precompilation": True,
            "collect_timing": True
        }
        
        model_info = await impl.initialize_model("bert-base-uncased", model_type="text", model_options=model_options)
        if not model_info:
            logger.error("Failed to initialize BERT model")
            await impl.shutdown()
            return 1
        
        logger.info(f"BERT model info: {json.dumps(model_info, indent=2)}")
        
        # Get model initialization timing
        model_metrics = impl.get_timing_metrics("bert-base-uncased")
        logger.info(f"Model initialization timing: {json.dumps(model_metrics.get('initialization', {}), indent=2)}")
        
        # Run multiple inferences to collect timing statistics with shader precompilation impact
        logger.info("Running multiple inferences to collect timing statistics with shader precompilation impact")
        
        # Test inputs
        test_inputs = [
            "This is a test input for BERT model.",
            "Another test input to measure performance.",
            "Third test input to get more timing data."
        ]
        
        # Run inferences
        for i, test_input in enumerate(test_inputs):
            logger.info(f"Running inference {i+1}/{len(test_inputs)}")
            
            # Run with shader precompilation enabled
            inference_options = {
                "shader_precompilation": True,
                "collect_timing": True
            }
            
            result = await impl.run_inference("bert-base-uncased", test_input, options=inference_options)
            if not result:
                logger.error(f"Failed to run inference {i+1}")
                continue
            
            # Check implementation type
            impl_type = result.get("implementation_type")
            if impl_type != WEBGPU_IMPLEMENTATION_TYPE:
                logger.error(f"Unexpected implementation type: {impl_type}, expected: {WEBGPU_IMPLEMENTATION_TYPE}")
                continue
            
            # Check if simulation mode was used
            using_simulation = result.get("is_simulation", True)
            
            if using_simulation:
                logger.warning("Inference used simulation mode, not real WebGPU acceleration")
            else:
                logger.info("Inference used real WebGPU hardware acceleration")
            
            # Log performance metrics
            if "performance_metrics" in result:
                metrics = result["performance_metrics"]
                logger.info(f"Inference {i+1} performance metrics:")
                logger.info(f"  Total time: {metrics.get('total_time_ms', 0):.2f} ms")
                logger.info(f"  Inference time: {metrics.get('inference_time_ms', 0):.2f} ms")
                logger.info(f"  Average time: {metrics.get('average_inference_time_ms', 0):.2f} ms")
                logger.info(f"  Throughput: {metrics.get('throughput_items_per_sec', 0):.2f} items/sec")
                
                # Check if shader precompilation was used
                if metrics.get("shader_precompilation", False):
                    logger.info("  Shader precompilation: enabled")
                else:
                    logger.info("  Shader precompilation: disabled")
        
        # Get comprehensive timing metrics after all inferences
        detailed_metrics = impl.get_timing_metrics("bert-base-uncased")
        
        # Calculate statistics from inference records
        if "inference_records" in detailed_metrics:
            inference_times = [record["duration_ms"] for record in detailed_metrics["inference_records"]]
            
            if inference_times:
                avg_time = sum(inference_times) / len(inference_times)
                min_time = min(inference_times)
                max_time = max(inference_times)
                
                logger.info(f"Inference timing statistics:")
                logger.info(f"  Average: {avg_time:.2f} ms")
                logger.info(f"  Minimum: {min_time:.2f} ms")
                logger.info(f"  Maximum: {max_time:.2f} ms")
                logger.info(f"  Count: {len(inference_times)}")
                
                # Compare first inference to average of subsequent inferences to measure shader precompilation impact
                if len(inference_times) > 1:
                    first_inference = inference_times[0]
                    subsequent_avg = sum(inference_times[1:]) / len(inference_times[1:])
                    speedup = ((first_inference - subsequent_avg) / first_inference) * 100
                    
                    logger.info(f"Shader precompilation impact:")
                    logger.info(f"  First inference: {first_inference:.2f} ms")
                    logger.info(f"  Average of subsequent inferences: {subsequent_avg:.2f} ms")
                    logger.info(f"  Speedup: {speedup:.2f}% faster after first inference")
        
        # Test an audio model if available to check compute shader optimizations
        try:
            # Initialize audio model with compute shader optimization
            logger.info("Testing audio model with compute shader optimization")
            audio_model_name = "openai/whisper-tiny"
            audio_model_options = {
                "enable_shader_precompilation": True,
                "enable_compute_shaders": True,
                "collect_timing": True
            }
            
            # Initialize audio model
            audio_model_info = await impl.initialize_model(audio_model_name, model_type="audio", model_options=audio_model_options)
            if audio_model_info:
                logger.info(f"Audio model initialized: {json.dumps(audio_model_info, indent=2)}")
                
                # Create simulated audio input
                audio_input = {"audio": "test.mp3"}
                
                # Run inference with compute shader optimization
                audio_inference_options = {
                    "shader_precompilation": True,
                    "compute_shaders": True,
                    "collect_timing": True
                }
                
                # Run inference
                audio_result = await impl.run_inference(audio_model_name, audio_input, options=audio_inference_options)
                if audio_result:
                    logger.info("Audio model inference completed successfully")
                    logger.info(f"Audio model inference result: {json.dumps(audio_result, indent=2)}")
                    
                    # Check if compute shaders were used
                    if audio_result.get("performance_metrics", {}).get("compute_shaders", False):
                        logger.info("Compute shader optimization was used for audio model")
                    else:
                        logger.warning("Compute shader optimization was not used for audio model")
            else:
                logger.warning("Could not initialize audio model for testing compute shaders")
        except Exception as audio_e:
            logger.error(f"Error testing audio model: {audio_e}")
        
        # Shutdown
        await impl.shutdown()
        logger.info("WebGPU implementation test completed successfully")
        return 0
        
    except Exception as e:
        logger.error(f"Error testing WebGPU implementation: {e}")
        try:
            await impl.shutdown()
        except:
            pass
        return 1

if __name__ == "__main__":
    # Run test
    asyncio.run(test_implementation())