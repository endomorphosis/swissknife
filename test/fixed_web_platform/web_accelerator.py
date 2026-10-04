#!/usr/bin/env python3
"""
WebAccelerator - Unified WebNN/WebGPU Hardware Acceleration

This module provides a unified WebAccelerator class for browser-based WebNN and WebGPU 
hardware acceleration with IPFS content delivery integration. It automatically selects
the optimal browser and hardware backend based on model type and provides a simple API
for hardware-accelerated inference.

Key features:
- Automatic hardware selection based on model type
- Browser-specific optimizations (Firefox for audio, Edge for WebNN)
- Precision control (4-bit, 8-bit, 16-bit) with mixed precision
- Resource pooling for efficient connection reuse
- IPFS integration for model loading
"""

import os
import sys
import json
import time
import asyncio
import logging
import tempfile
import platform as platform_module
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple, Callable

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try to import required components
try:
    # Import enhanced WebSocket bridge
    from fixed_web_platform.enhanced_websocket_bridge import EnhancedWebSocketBridge, create_enhanced_websocket_bridge
    HAS_WEBSOCKET = True
except ImportError:
    logger.warning("Enhanced WebSocket bridge not available")
    HAS_WEBSOCKET = False

try:
    # Import IPFS module
    import ipfs_accelerate_impl
    HAS_IPFS = True
except ImportError:
    logger.warning("IPFS acceleration module not available")
    HAS_IPFS = False

# Constants
DEFAULT_PORT = 8765
DEFAULT_HOST = "127.0.0.1"

class ModelType:
    """Model type constants for WebAccelerator."""
    TEXT = "text"
    VISION = "vision"
    AUDIO = "audio"
    MULTIMODAL = "multimodal"

class WebAccelerator:
    """
    Unified WebNN/WebGPU hardware acceleration with IPFS integration.
    
    This class provides a high-level interface for browser-based WebNN and WebGPU
    hardware acceleration with automatic hardware selection, browser-specific 
    optimizations, and IPFS content delivery integration.
    """
    
    def __init__(self, enable_resource_pool: bool = True, 
                 max_connections: int = 4, browser_preferences: Dict[str, str] = None,
                 default_browser: str = "chrome", default_platform: str = "webgpu",
                 enable_ipfs: bool = True, websocket_port: int = DEFAULT_PORT,
                 host: str = DEFAULT_HOST, enable_heartbeat: bool = True):
        """
        Initialize WebAccelerator with configuration.
        
        Args:
            enable_resource_pool: Whether to enable connection pooling
            max_connections: Maximum number of concurrent browser connections
            browser_preferences: Dict mapping model types to preferred browsers
            default_browser: Default browser to use
            default_platform: Default platform to use (webnn or webgpu)
            enable_ipfs: Whether to enable IPFS content delivery
            websocket_port: Port for WebSocket server
            host: Host to bind to
            enable_heartbeat: Whether to enable heartbeat for connection health
        """
        self.enable_resource_pool = enable_resource_pool
        self.max_connections = max_connections
        self.default_browser = default_browser
        self.default_platform = default_platform
        self.enable_ipfs = enable_ipfs
        self.websocket_port = websocket_port
        self.host = host
        self.enable_heartbeat = enable_heartbeat
        
        # Set default browser preferences if not provided
        self.browser_preferences = browser_preferences or {
            ModelType.AUDIO: "firefox",       # Firefox for audio models (optimized compute shaders)
            ModelType.VISION: "chrome",       # Chrome for vision models
            ModelType.TEXT: "edge",           # Edge for text models (WebNN support)
            ModelType.MULTIMODAL: "chrome",   # Chrome for multimodal models
        }
        
        # State variables
        self.initialized = False
        self.loop = None
        self.bridge = None
        self.ipfs_model_cache = {}
        self.active_models = {}
        self.connection_pool = []
        self._shutting_down = False
        
        # Statistics
        self.stats = {
            "total_inferences": 0,
            "total_model_loads": 0,
            "accelerated_inferences": 0,
            "fallback_inferences": 0,
            "ipfs_cache_hits": 0,
            "ipfs_cache_misses": 0,
            "browser_connections": 0,
            "errors": 0
        }
        
        # Create event loop for async operations
        try:
            self.loop = asyncio.get_event_loop()
        except RuntimeError:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        
        # Initialize hardware detector if IPFS module is available
        self.hardware_detector = None
        if HAS_IPFS and hasattr(ipfs_accelerate_impl, "HardwareDetector"):
            self.hardware_detector = ipfs_accelerate_impl.HardwareDetector()
            
        # Import IPFS acceleration functions if available
        if HAS_IPFS:
            self.ipfs_accelerate = ipfs_accelerate_impl.accelerate
        else:
            self.ipfs_accelerate = None
    
    async def initialize(self) -> bool:
        """
        Initialize WebAccelerator with async setup.
        
        Returns:
            bool: True if initialization succeeded, False otherwise
        """
        if self.initialized:
            return True
            
        try:
            # Create WebSocket bridge
            if HAS_WEBSOCKET:
                self.bridge = await create_enhanced_websocket_bridge(
                    port=self.websocket_port,
                    host=self.host,
                    enable_heartbeat=self.enable_heartbeat
                )
                
                if not self.bridge:
                    logger.error("Failed to create WebSocket bridge")
                    return False
                    
                logger.info(f"WebSocket bridge created on {self.host}:{self.websocket_port}")
            else:
                logger.warning("WebSocket bridge not available, using simulation")
            
            # Detect hardware capabilities
            if self.hardware_detector:
                self.available_hardware = self.hardware_detector.detect_hardware()
                logger.info(f"Detected hardware: {', '.join(self.available_hardware)}")
            else:
                self.available_hardware = ["cpu"]
                logger.warning("Hardware detector not available, using CPU only")
            
            # Initialize connection pool if enabled
            if self.enable_resource_pool:
                self._initialize_connection_pool()
            
            self.initialized = True
            logger.info("WebAccelerator initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing WebAccelerator: {e}")
            return False
    
    def _initialize_connection_pool(self):
        """Initialize connection pool for browser connections."""
        # In a full implementation, this would set up a connection pool
        # For now, just initialize an empty list
        self.connection_pool = []
    
    async def _ensure_initialization(self):
        """Ensure WebAccelerator is initialized."""
        if not self.initialized:
            await self.initialize()
    
    def accelerate(self, model_name: str, input_data: Any, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Accelerate inference with optimal hardware selection.
        
        Args:
            model_name: Name of the model
            input_data: Input data for inference
            options: Additional options for acceleration
                - precision: Precision level (4, 8, 16, 32)
                - mixed_precision: Whether to use mixed precision
                - browser: Specific browser to use
                - platform: Specific platform to use (webnn, webgpu)
                - optimize_for_audio: Enable Firefox audio optimizations
                - use_ipfs: Enable IPFS content delivery
                
        Returns:
            Dict with acceleration results
        """
        # Run async accelerate in the event loop
        return self.loop.run_until_complete(self._accelerate_async(model_name, input_data, options))
    
    async def _accelerate_async(self, model_name: str, input_data: Any, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Async implementation of accelerate.
        
        Args:
            model_name: Name of the model
            input_data: Input data for inference
            options: Additional options for acceleration
            
        Returns:
            Dict with acceleration results
        """
        # Ensure initialization
        await self._ensure_initialization()
        
        # Default options
        options = options or {}
        
        # Determine model type based on model name
        model_type = options.get("model_type")
        if not model_type:
            model_type = self._get_model_type(model_name)
        
        # Get optimal hardware configuration
        hardware_config = self.get_optimal_hardware(model_name, model_type)
        
        # Override with options if specified
        platform = options.get("platform", hardware_config.get("platform"))
        browser = options.get("browser", hardware_config.get("browser"))
        precision = options.get("precision", hardware_config.get("precision", 16))
        mixed_precision = options.get("mixed_precision", hardware_config.get("mixed_precision", False))
        
        # Firefox audio optimizations
        optimize_for_audio = options.get("optimize_for_audio", False)
        if model_type == ModelType.AUDIO and browser == "firefox" and not options.get("optimize_for_audio", None):
            optimize_for_audio = True
        
        # Use IPFS if enabled and not disabled in options
        use_ipfs = self.enable_ipfs and options.get("use_ipfs", True)
        
        # Prepare acceleration configuration
        accel_config = {
            "platform": platform,
            "browser": browser,
            "precision": precision,
            "mixed_precision": mixed_precision,
            "use_firefox_optimizations": optimize_for_audio,
            "model_type": model_type
        }
        
        # If using IPFS, accelerate with IPFS
        if use_ipfs and self.ipfs_accelerate:
            result = self.ipfs_accelerate(model_name, input_data, accel_config)
            
            # Update statistics
            self.stats["total_inferences"] += 1
            if result.get("status") == "success":
                self.stats["accelerated_inferences"] += 1
            else:
                self.stats["fallback_inferences"] += 1
                self.stats["errors"] += 1
            
            if result.get("ipfs_cache_hit", False):
                self.stats["ipfs_cache_hits"] += 1
            else:
                self.stats["ipfs_cache_misses"] += 1
                
            return result
        
        # If IPFS not available, use direct WebNN/WebGPU acceleration
        # This is a simplified implementation that uses the WebSocket bridge
        return await self._accelerate_with_bridge(model_name, input_data, accel_config)
    
    async def _accelerate_with_bridge(self, model_name: str, input_data: Any, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Accelerate with WebSocket bridge.
        
        Args:
            model_name: Name of the model
            input_data: Input data for inference
            config: Acceleration configuration
            
        Returns:
            Dict with acceleration results
        """
        if not self.bridge:
            logger.error("WebSocket bridge not available")
            return {"status": "error", "error": "WebSocket bridge not available"}
        
        # Wait for bridge connection
        connected = await self.bridge.wait_for_connection()
        if not connected:
            logger.error("WebSocket bridge not connected")
            return {"status": "error", "error": "WebSocket bridge not connected"}
        
        # Initialize model
        platform = config.get("platform", self.default_platform)
        model_type = config.get("model_type", self._get_model_type(model_name))
        
        # Prepare model options
        model_options = {
            "precision": config.get("precision", 16),
            "mixed_precision": config.get("mixed_precision", False),
            "optimize_for_audio": config.get("use_firefox_optimizations", False)
        }
        
        # Initialize model in browser
        logger.info(f"Initializing model {model_name} with {platform}")
        init_result = await self.bridge.initialize_model(model_name, model_type, platform, model_options)
        
        if not init_result or init_result.get("status") != "success":
            error_msg = init_result.get("error", "Unknown error") if init_result else "No response"
            logger.error(f"Failed to initialize model {model_name}: {error_msg}")
            self.stats["errors"] += 1
            return {"status": "error", "error": error_msg, "model_name": model_name}
        
        # Run inference
        logger.info(f"Running inference with model {model_name} on {platform}")
        inference_result = await self.bridge.run_inference(model_name, input_data, platform, model_options)
        
        # Update statistics
        self.stats["total_inferences"] += 1
        if inference_result and inference_result.get("status") == "success":
            self.stats["accelerated_inferences"] += 1
        else:
            error_msg = inference_result.get("error", "Unknown error") if inference_result else "No response"
            logger.error(f"Failed to run inference with model {model_name}: {error_msg}")
            self.stats["fallback_inferences"] += 1
            self.stats["errors"] += 1
        
        return inference_result
    
    def get_optimal_hardware(self, model_name: str, model_type: str = None) -> Dict[str, Any]:
        """
        Get optimal hardware for a model.
        
        Args:
            model_name: Name of the model
            model_type: Type of model (optional, will be inferred if not provided)
            
        Returns:
            Dict with optimal hardware configuration
        """
        # Determine model type if not provided
        if not model_type:
            model_type = self._get_model_type(model_name)
        
        # Try to use hardware detector if available
        if self.hardware_detector and hasattr(self.hardware_detector, "get_optimal_hardware"):
            try:
                hardware = self.hardware_detector.get_optimal_hardware(model_name, model_type)
                logger.info(f"Optimal hardware for {model_name} ({model_type}): {hardware}")
                
                # Determine platform based on hardware
                if hardware in ["webgpu", "webnn"]:
                    platform = hardware
                else:
                    platform = self.default_platform
                
                # Get browser based on model type and platform
                browser = self._get_browser_for_model(model_type, platform)
                
                return {
                    "hardware": hardware,
                    "platform": platform,
                    "browser": browser,
                    "precision": 16,  # Default precision
                    "mixed_precision": False  # Default to no mixed precision
                }
            except Exception as e:
                logger.error(f"Error getting optimal hardware: {e}")
        
        # Fallback to default configuration
        platform = self.default_platform
        browser = self._get_browser_for_model(model_type, platform)
        
        return {
            "hardware": platform,
            "platform": platform,
            "browser": browser,
            "precision": 16,
            "mixed_precision": False
        }
    
    def _get_browser_for_model(self, model_type: str, platform: str) -> str:
        """
        Get optimal browser for a model type and platform.
        
        Args:
            model_type: Type of model
            platform: Platform to use
            
        Returns:
            Browser name
        """
        # Use browser preferences if available
        if model_type in self.browser_preferences:
            return self.browser_preferences[model_type]
        
        # Use platform-specific defaults
        if platform == "webnn":
            return "edge"  # Edge has best WebNN support
        
        # For WebGPU, use model-specific optimizations
        if model_type == ModelType.AUDIO:
            return "firefox"  # Firefox has best audio performance
        elif model_type == ModelType.VISION:
            return "chrome"  # Chrome has good vision performance
        
        # Default browser
        return self.default_browser
    
    def _get_model_type(self, model_name: str) -> str:
        """
        Determine model type based on model name.
        
        Args:
            model_name: Name of the model
            
        Returns:
            Model type
        """
        model_name_lower = model_name.lower()
        
        # Audio models
        if any(x in model_name_lower for x in ["whisper", "wav2vec", "clap", "audio"]):
            return ModelType.AUDIO
        
        # Vision models
        if any(x in model_name_lower for x in ["vit", "clip", "detr", "image", "vision"]):
            return ModelType.VISION
        
        # Multimodal models
        if any(x in model_name_lower for x in ["llava", "xclip", "multimodal"]):
            return ModelType.MULTIMODAL
        
        # Default to text
        return ModelType.TEXT
    
    async def shutdown(self):
        """Clean up resources and shutdown."""
        self._shutting_down = True
        
        # Close WebSocket bridge
        if self.bridge:
            try:
                # Send shutdown command to browser
                await self.bridge.shutdown_browser()
                
                # Stop WebSocket server
                await self.bridge.stop()
                logger.info("WebSocket bridge stopped")
            except Exception as e:
                logger.error(f"Error stopping WebSocket bridge: {e}")
        
        # Clean up connection pool
        if self.enable_resource_pool and self.connection_pool:
            try:
                for connection in self.connection_pool:
                    # In a full implementation, this would close each connection
                    pass
                logger.info("Connection pool cleaned up")
            except Exception as e:
                logger.error(f"Error cleaning up connection pool: {e}")
        
        self.initialized = False
        logger.info("WebAccelerator shutdown complete")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get acceleration statistics.
        
        Returns:
            Dict with acceleration statistics
        """
        # Add bridge stats if available
        if self.bridge:
            bridge_stats = self.bridge.get_stats()
            combined_stats = {
                **self.stats,
                "bridge": bridge_stats
            }
            return combined_stats
        
        return self.stats

# Helper function to create and initialize WebAccelerator
async def create_web_accelerator(options: Dict[str, Any] = None) -> Optional[WebAccelerator]:
    """
    Create and initialize a WebAccelerator instance.
    
    Args:
        options: Configuration options for WebAccelerator
        
    Returns:
        Initialized WebAccelerator or None if initialization failed
    """
    options = options or {}
    
    accelerator = WebAccelerator(
        enable_resource_pool=options.get("enable_resource_pool", True),
        max_connections=options.get("max_connections", 4),
        browser_preferences=options.get("browser_preferences"),
        default_browser=options.get("default_browser", "chrome"),
        default_platform=options.get("default_platform", "webgpu"),
        enable_ipfs=options.get("enable_ipfs", True),
        websocket_port=options.get("websocket_port", DEFAULT_PORT),
        host=options.get("host", DEFAULT_HOST),
        enable_heartbeat=options.get("enable_heartbeat", True)
    )
    
    # Initialize accelerator
    success = await accelerator.initialize()
    if not success:
        logger.error("Failed to initialize WebAccelerator")
        return None
    
    return accelerator

# Test function for WebAccelerator
async def test_web_accelerator():
    """Test WebAccelerator functionality."""
    # Create and initialize WebAccelerator
    accelerator = await create_web_accelerator()
    if not accelerator:
        logger.error("Failed to create WebAccelerator")
        return False
    
    try:
        logger.info("WebAccelerator created successfully")
        
        # Test with a text model
        logger.info("Testing with text model...")
        text_result = accelerator.accelerate(
            "bert-base-uncased",
            "This is a test",
            options={
                "precision": 8,
                "mixed_precision": True
            }
        )
        
        logger.info(f"Text model result: {json.dumps(text_result, indent=2)}")
        
        # Test with an audio model
        logger.info("Testing with audio model...")
        audio_result = accelerator.accelerate(
            "openai/whisper-tiny",
            {"audio": "test.mp3"},
            options={
                "browser": "firefox",
                "optimize_for_audio": True
            }
        )
        
        logger.info(f"Audio model result: {json.dumps(audio_result, indent=2)}")
        
        # Get statistics
        stats = accelerator.get_stats()
        logger.info(f"WebAccelerator stats: {json.dumps(stats, indent=2)}")
        
        # Shutdown
        await accelerator.shutdown()
        logger.info("WebAccelerator test completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error in WebAccelerator test: {e}")
        await accelerator.shutdown()
        return False

if __name__ == "__main__":
    # Run test if script executed directly
    import asyncio
    success = asyncio.run(test_web_accelerator())
    sys.exit(0 if success else 1)