#!/usr/bin/env python3
"""
Real WebNN Connection Module

This module provides a real implementation of WebNN that connects to a browser
using the WebSocket bridge created by implement_real_webnn_webgpu.py.

Key features:
- Direct browser-to-Python communication
- Real WebNN performance metrics
- Cross-browser compatibility (Chrome, Firefox, Edge, Safari)
- CPU/GPU backend selection
- Hardware-specific optimizations

Usage:
    from fixed_web_platform.real_webnn_connection import RealWebNNConnection

    # Create connection
    connection = RealWebNNConnection(browser_name="chrome")
    
    # Initialize
    await connection.initialize()
    
    # Run inference
    result = await connection.run_inference(model_name, input_data)
    
    # Shutdown
    await connection.shutdown()
"""

import os
import sys
import json
import time
import base64
import asyncio
import logging
import tempfile
import subprocess
from typing import Dict, List, Any, Optional, Union, Tuple
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import the implementation from parent directory
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

# Import from the implement_real_webnn_webgpu.py file
try:
    from implement_real_webnn_webgpu import WebPlatformImplementation, RealWebPlatformIntegration
except ImportError:
    logger.error("Failed to import from implement_real_webnn_webgpu.py")
    logger.error("Make sure the file exists in the test directory")
    WebPlatformImplementation = None
    RealWebPlatformIntegration = None

# Import webnn_implementation for compatibility
try:
    from fixed_web_platform.webnn_implementation import RealWebNNImplementation
except ImportError:
    logger.error("Failed to import from webnn_implementation.py")
    RealWebNNImplementation = None

# Constant for implementation type
WEBNN_IMPLEMENTATION_TYPE = "REAL_WEBNN"


class RealWebNNConnection:
    """Real WebNN connection to browser."""
    
    def __init__(self, browser_name="chrome", headless=True, browser_path=None, device_preference="gpu"):
        """Initialize WebNN connection.
        
        Args:
            browser_name: Browser to use (chrome, firefox, edge, safari)
            headless: Whether to run in headless mode
            browser_path: Path to browser executable (optional)
            device_preference: Preferred device for WebNN (cpu, gpu)
        """
        self.browser_name = browser_name
        self.headless = headless
        self.browser_path = browser_path
        self.device_preference = device_preference
        self.integration = None
        self.initialized = False
        self.init_attempts = 0
        self.max_init_attempts = 3
        self.initialized_models = {}
        
        # Check if implementation components are available
        if WebPlatformImplementation is None or RealWebPlatformIntegration is None:
            raise ImportError("WebPlatformImplementation or RealWebPlatformIntegration not available")
    
    async def initialize(self):
        """Initialize WebNN connection.
        
        Returns:
            True if initialization successful, False otherwise
        """
        if self.initialized:
            logger.info("WebNN connection already initialized")
            return True
        
        # Create integration if not already created
        if self.integration is None:
            self.integration = RealWebPlatformIntegration()
        
        # Check if we've hit the maximum number of attempts
        if self.init_attempts >= self.max_init_attempts:
            logger.error(f"Failed to initialize WebNN after {self.init_attempts} attempts")
            return False
        
        self.init_attempts += 1
        
        try:
            # Initialize platform integration
            logger.info(f"Initializing WebNN with {self.browser_name} browser (headless: {self.headless})")
            success = await self.integration.initialize_platform(
                platform="webnn",
                browser_name=self.browser_name,
                headless=self.headless
            )
            
            if not success:
                logger.error("Failed to initialize WebNN platform")
                return False
            
            # Get feature detection information
            self.feature_detection = self._get_feature_detection()
            
            # Log WebNN capabilities
            if self.feature_detection:
                webnn_supported = self.feature_detection.get("webnn", False)
                webnn_backends = self.feature_detection.get("webnnBackends", [])
                
                if webnn_supported:
                    logger.info(f"WebNN is supported in {self.browser_name}")
                    logger.info(f"WebNN backends: {', '.join(webnn_backends)}")
                    
                    # Check if preferred device is available
                    if self.device_preference not in webnn_backends:
                        # Try to use available backend
                        if webnn_backends:
                            logger.warning(f"Preferred device '{self.device_preference}' not available. Using '{webnn_backends[0]}' instead.")
                            self.device_preference = webnn_backends[0]
                        else:
                            logger.warning("No WebNN backends available")
                else:
                    logger.warning(f"WebNN is NOT supported in {self.browser_name}")
            
            self.initialized = True
            logger.info("WebNN connection initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing WebNN connection: {e}")
            await self.shutdown()
            return False
    
    def _get_feature_detection(self):
        """Get feature detection information from browser.
        
        Returns:
            Feature detection information or empty dict if not available
        """
        # Get WebNN implementation
        for platform, impl in self.integration.implementations.items():
            if platform == "webnn" and impl.bridge_server:
                return impl.bridge_server.feature_detection
        
        return {}
    
    async def initialize_model(self, model_name, model_type="text", model_path=None, model_options=None):
        """Initialize model.
        
        Args:
            model_name: Name of the model
            model_type: Type of model (text, vision, audio, multimodal)
            model_path: Path to model (optional)
            model_options: Additional model options (optional)
            
        Returns:
            Dict with model initialization information or None if initialization failed
        """
        if not self.initialized:
            logger.warning("WebNN connection not initialized. Attempting to initialize.")
            if not await self.initialize():
                logger.error("Failed to initialize WebNN connection")
                return None
        
        # Check if model is already initialized
        model_key = model_path or model_name
        if model_key in self.initialized_models:
            logger.info(f"Model {model_key} already initialized")
            return self.initialized_models[model_key]
        
        try:
            # Prepare model options
            options = model_options or {}
            
            # Initialize model
            logger.info(f"Initializing model {model_name} with type {model_type}")
            response = await self.integration.initialize_model(
                platform="webnn",
                model_name=model_name,
                model_type=model_type,
                model_path=model_path
            )
            
            if not response or response.get("status") != "success":
                logger.error(f"Failed to initialize model: {model_name}")
                logger.error(f"Error: {response.get('error') if response else 'Unknown error'}")
                return None
            
            # Store model information
            self.initialized_models[model_key] = response
            
            logger.info(f"Model {model_name} initialized successfully")
            return response
            
        except Exception as e:
            logger.error(f"Error initializing model {model_name}: {e}")
            return None
    
    def get_backend_info(self):
        """Get backend information (CPU/GPU).
        
        Returns:
            Dict with backend information or empty dict if not initialized
        """
        if not self.initialized:
            return {}
        
        # Extract WebNN backend info from feature detection
        backends = self.feature_detection.get("webnnBackends", [])
        
        return {
            "backends": backends,
            "preferred": self.device_preference,
            "available": "webnn" in self.feature_detection and self.feature_detection["webnn"]
        }
    
    async def run_inference(self, model_name, input_data, options=None, model_path=None):
        """Run inference with model.
        
        Args:
            model_name: Name of the model
            input_data: Input data for inference
            options: Inference options (optional)
            model_path: Path to model (optional)
            
        Returns:
            Dict with inference results or None if inference failed
        """
        if not self.initialized:
            logger.warning("WebNN connection not initialized. Attempting to initialize.")
            if not await self.initialize():
                logger.error("Failed to initialize WebNN connection")
                return None
        
        try:
            # Check if model is initialized
            model_key = model_path or model_name
            if model_key not in self.initialized_models:
                # Try to initialize model
                model_info = await self.initialize_model(model_name, "text", model_path)
                if model_info is None:
                    logger.error(f"Failed to initialize model: {model_key}")
                    return None
            
            # Prepare input data
            prepared_input = self._prepare_input_data(input_data)
            
            # Prepare options
            inference_options = options or {}
            # Add device preference to options if not specified
            if "device_preference" not in inference_options:
                inference_options["device_preference"] = self.device_preference
            
            # Run inference
            logger.info(f"Running inference with model {model_key}")
            
            # Run inference with real implementation
            response = await self.integration.run_inference(
                platform="webnn",
                model_name=model_name,
                input_data=prepared_input,
                options=inference_options,
                model_path=model_path
            )
            
            if not response or response.get("status") != "success":
                logger.error(f"Failed to run inference with model: {model_key}")
                logger.error(f"Error: {response.get('error') if response else 'Unknown error'}")
                return None
            
            # Verify implementation type
            impl_type = response.get("implementation_type")
            if impl_type != WEBNN_IMPLEMENTATION_TYPE:
                logger.warning(f"Unexpected implementation type: {impl_type}, expected: {WEBNN_IMPLEMENTATION_TYPE}")
            
            # Process output if needed
            processed_output = self._process_output(response.get("output"), response)
            response["output"] = processed_output
            
            logger.info(f"Inference with model {model_key} completed successfully")
            return response
            
        except Exception as e:
            logger.error(f"Error running inference with model {model_name}: {e}")
            return None
    
    def _prepare_input_data(self, input_data):
        """Prepare input data for inference.
        
        Args:
            input_data: Input data for inference
            
        Returns:
            Prepared input data
        """
        # Handle different input types
        if isinstance(input_data, str):
            return input_data
        elif isinstance(input_data, dict):
            # Handle special cases for images, audio, etc.
            if "image" in input_data and os.path.isfile(input_data["image"]):
                # Convert image to base64
                try:
                    with open(input_data["image"], "rb") as f:
                        image_data = f.read()
                    base64_data = base64.b64encode(image_data).decode("utf-8")
                    input_data["image"] = f"data:image/jpeg;base64,{base64_data}"
                except Exception as e:
                    logger.error(f"Error preparing image data: {e}")
            
            elif "audio" in input_data and os.path.isfile(input_data["audio"]):
                # Convert audio to base64
                try:
                    with open(input_data["audio"], "rb") as f:
                        audio_data = f.read()
                    base64_data = base64.b64encode(audio_data).decode("utf-8")
                    input_data["audio"] = f"data:audio/mp3;base64,{base64_data}"
                except Exception as e:
                    logger.error(f"Error preparing audio data: {e}")
            
            return input_data
        
        return input_data
    
    def _process_output(self, output, response):
        """Process output from inference.
        
        Args:
            output: Output from inference
            response: Full response from inference
            
        Returns:
            Processed output
        """
        # For now, just return the output as is
        return output
    
    async def shutdown(self):
        """Shutdown WebNN connection."""
        if not self.initialized:
            logger.info("WebNN connection not initialized, nothing to shut down")
            return
        
        try:
            if self.integration:
                await self.integration.shutdown("webnn")
            
            self.initialized = False
            self.initialized_models = {}
            logger.info("WebNN connection shut down successfully")
            
        except Exception as e:
            logger.error(f"Error shutting down WebNN connection: {e}")
    
    def get_implementation_type(self):
        """Get implementation type.
        
        Returns:
            Implementation type string
        """
        return WEBNN_IMPLEMENTATION_TYPE
    
    def get_feature_support(self):
        """Get feature support information.
        
        Returns:
            Dict with feature support information or empty dict if not initialized
        """
        if not self.initialized:
            return {}
        
        return self.feature_detection


# Compatibility function to create an implementation
def create_webnn_implementation(browser_name="chrome", headless=True, device_preference="gpu"):
    """Create a WebNN implementation.
    
    Args:
        browser_name: Browser to use (chrome, firefox, edge, safari)
        headless: Whether to run in headless mode
        device_preference: Preferred device for WebNN (cpu, gpu)
        
    Returns:
        WebNN implementation instance
    """
    # If RealWebNNImplementation is available, use it for compatibility
    if RealWebNNImplementation is not None:
        return RealWebNNImplementation(browser_name=browser_name, headless=headless, device_preference=device_preference)
    
    # Otherwise, use the new implementation
    return RealWebNNConnection(browser_name=browser_name, headless=headless, device_preference=device_preference)


# Async test function for testing the implementation
async def test_connection():
    """Test the real WebNN connection."""
    # Create connection
    connection = RealWebNNConnection(browser_name="chrome", headless=False, device_preference="gpu")
    
    try:
        # Initialize
        logger.info("Initializing WebNN connection")
        success = await connection.initialize()
        if not success:
            logger.error("Failed to initialize WebNN connection")
            return 1
        
        # Get feature support
        features = connection.get_feature_support()
        logger.info(f"WebNN feature support: {json.dumps(features, indent=2)}")
        
        # Get backend info
        backend_info = connection.get_backend_info()
        logger.info(f"WebNN backend info: {json.dumps(backend_info, indent=2)}")
        
        # Initialize model
        logger.info("Initializing BERT model")
        model_info = await connection.initialize_model("bert-base-uncased", model_type="text")
        if not model_info:
            logger.error("Failed to initialize BERT model")
            await connection.shutdown()
            return 1
        
        logger.info(f"BERT model info: {json.dumps(model_info, indent=2)}")
        
        # Run inference
        logger.info("Running inference with BERT model")
        result = await connection.run_inference("bert-base-uncased", "This is a test input for BERT model.")
        if not result:
            logger.error("Failed to run inference with BERT model")
            await connection.shutdown()
            return 1
        
        # Check implementation type
        impl_type = result.get("implementation_type")
        if impl_type != WEBNN_IMPLEMENTATION_TYPE:
            logger.error(f"Unexpected implementation type: {impl_type}, expected: {WEBNN_IMPLEMENTATION_TYPE}")
            await connection.shutdown()
            return 1
        
        logger.info(f"BERT inference result: {json.dumps(result, indent=2)}")
        
        # Shutdown
        await connection.shutdown()
        logger.info("WebNN connection test completed successfully")
        return 0
        
    except Exception as e:
        logger.error(f"Error testing WebNN connection: {e}")
        await connection.shutdown()
        return 1


if __name__ == "__main__":
    # Run test
    asyncio.run(test_connection())