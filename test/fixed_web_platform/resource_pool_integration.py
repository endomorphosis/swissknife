#\!/usr/bin/env python3
"""
IPFS Accelerate Web Integration for WebNN/WebGPU (May 2025)

This module provides integration between IPFS acceleration and WebNN/WebGPU
resource pool, enabling efficient hardware acceleration for AI models across browsers.
"""

import os
import sys
import json
import time
import random
import logging
import asyncio
import uuid
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Union, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import resource pool bridge
from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration, EnhancedWebModel, MockFallbackModel

class IPFSAccelerateWebIntegration:
    """IPFS Accelerate integration with WebNN/WebGPU resource pool."""
    
    def __init__(self, max_connections=4, enable_gpu=True, enable_cpu=True,
                 headless=True, browser_preferences=None, adaptive_scaling=True,
                 monitoring_interval=60, enable_ipfs=True, db_path=None,
                 enable_telemetry=True, enable_heartbeat=True, **kwargs):
        """Initialize IPFS Accelerate Web Integration."""
        self.max_connections = max_connections
        self.enable_gpu = enable_gpu
        self.enable_cpu = enable_cpu
        self.headless = headless
        self.browser_preferences = browser_preferences or {}
        self.adaptive_scaling = adaptive_scaling
        self.monitoring_interval = monitoring_interval
        self.enable_ipfs = enable_ipfs
        self.db_path = db_path
        self.enable_telemetry = enable_telemetry
        self.enable_heartbeat = enable_heartbeat
        self.session_id = str(uuid.uuid4())
        
        # Create resource pool bridge integration
        self.resource_pool = ResourcePoolBridgeIntegration(
            max_connections=max_connections,
            enable_gpu=enable_gpu,
            enable_cpu=enable_cpu,
            headless=headless,
            browser_preferences=browser_preferences,
            adaptive_scaling=adaptive_scaling,
            monitoring_interval=monitoring_interval,
            enable_ipfs=enable_ipfs,
            db_path=db_path
        )
        
        # Initialize IPFS module if available
        self.ipfs_module = None
        try:
            import ipfs_accelerate_impl
            self.ipfs_module = ipfs_accelerate_impl
            logger.info("IPFS acceleration module loaded")
        except ImportError:
            logger.warning("IPFS acceleration module not available")
        
        # Initialize database connection if specified
        self.db_connection = None
        if db_path and os.path.exists(db_path):
            try:
                import duckdb
                self.db_connection = duckdb.connect(db_path)
                logger.info(f"Database connection initialized: {db_path}")
            except ImportError:
                logger.warning("DuckDB not available. Database integration will be disabled")
            except Exception as e:
                logger.error(f"Error connecting to database: {e}")
        
        logger.info(f"IPFSAccelerateWebIntegration initialized successfully with {max_connections} connections and {'enabled' if adaptive_scaling else 'disabled'} adaptive scaling")
    
    def initialize(self):
        """Initialize the integration."""
        self.resource_pool.initialize()
        return True
    
    def get_model(self, model_type, model_name, hardware_preferences=None, platform=None, browser=None, **kwargs):
        """Get a model with the specified parameters."""
        if hardware_preferences is None:
            hardware_preferences = {}
            
        # Add platform and browser to hardware preferences if provided
        if platform:
            hardware_preferences['priority_list'] = [platform] + hardware_preferences.get('priority_list', [])
        
        if browser:
            hardware_preferences['browser'] = browser
            
        try:
            # Get model from resource pool
            model = self.resource_pool.get_model(
                model_type=model_type,
                model_name=model_name,
                hardware_preferences=hardware_preferences
            )
            return model
        except Exception as e:
            # Create a fallback model as ultimate fallback
            logger.warning(f"Creating mock model for {model_name} as ultimate fallback")
            return MockFallbackModel(model_name, model_type, platform or "cpu")
            
    def run_inference(self, model, inputs, **kwargs):
        """Run inference with the given model."""
        start_time = time.time()
        
        try:
            # Run inference
            result = model(inputs)
            
            # Add performance metrics
            inference_time = time.time() - start_time
            
            # Update result with additional metrics
            if isinstance(result, dict):
                result.update({
                    "inference_time": inference_time,
                    "execution_time": inference_time,
                    "total_time": inference_time,
                    "timestamp": datetime.now().isoformat()
                })
                
                # Add any additional kwargs
                for key, value in kwargs.items():
                    if key not in result:
                        result[key] = value
                        
                # Store result in database if available
                self.store_acceleration_result(result)
                
                return result
            else:
                # Handle non-dictionary results
                return {
                    "success": True,
                    "result": result,
                    "inference_time": inference_time,
                    "execution_time": inference_time,
                    "total_time": inference_time,
                    "timestamp": datetime.now().isoformat()
                }
                
        except Exception as e:
            error_time = time.time() - start_time
            logger.error(f"Error running inference: {e}")
            
            # Return error result
            error_result = {
                "success": False,
                "error": str(e),
                "inference_time": error_time,
                "execution_time": error_time,
                "total_time": error_time,
                "timestamp": datetime.now().isoformat()
            }
            
            # Add any additional kwargs
            for key, value in kwargs.items():
                if key not in error_result:
                    error_result[key] = value
                    
            return error_result
            
    def run_parallel_inference(self, model_data_pairs, batch_size=1, timeout=60.0, distributed=False):
        """
        Run inference on multiple models in parallel.
        
        Args:
            model_data_pairs: List of (model, input_data) tuples
            batch_size: Batch size for inference
            timeout: Timeout in seconds
            distributed: Whether to use distributed execution
            
        Returns:
            List of inference results
        """
        if not model_data_pairs:
            return []
            
        try:
            # Prepare for parallel execution
            start_time = time.time()
            
            # Convert model_data_pairs to a format that can be used with execute_concurrent
            if not hasattr(self.resource_pool, 'execute_concurrent_sync'):
                # Fall back to sequential execution
                logger.warning("Parallel execution not available, falling back to sequential")
                results = []
                for model, data in model_data_pairs:
                    result = self.run_inference(model, data, batch_size=batch_size)
                    results.append(result)
                return results
            
            # Use the resource pool's concurrent execution capability, but handle the asyncio issues
            # Instead of using execute_concurrent_sync which creates nested event loops,
            # we'll execute models one by one in a non-async way
            # This avoids the "Cannot run the event loop while another loop is running" error
            results = []
            
            if hasattr(self.resource_pool, 'execute_concurrent'):
                # Create a function to call each model directly
                for model, inputs in model_data_pairs:
                    try:
                        result = model(inputs)
                        results.append(result)
                    except Exception as model_error:
                        logger.error(f"Error executing model {getattr(model, 'model_name', 'unknown')}: {model_error}")
                        results.append({"success": False, "error": str(model_error)})
            
            # Add overall execution time
            execution_time = time.time() - start_time
            for result in results:
                if isinstance(result, dict):
                    result.update({
                        "parallel_execution_time": execution_time,
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    # Store result in database if available
                    self.store_acceleration_result(result)
            
            return results
        except Exception as e:
            logger.error(f"Error in parallel inference: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def close(self):
        """Close all resources and connections."""
        # Close database connection
        if self.db_connection:
            try:
                self.db_connection.close()
                logger.info("Database connection closed")
            except Exception as e:
                logger.error(f"Error closing database connection: {e}")
        
        # Close resource pool
        if self.resource_pool:
            self.resource_pool.close()
        
        logger.info("IPFSAccelerateWebIntegration closed successfully")
        return True
    
    def store_acceleration_result(self, result):
        """Store acceleration result in the database."""
        if not self.db_connection:
            return False
            
        try:
            # Prepare data
            timestamp = datetime.now()
            model_name = result.get('model_name', 'unknown')
            model_type = result.get('model_type', 'unknown')
            platform = result.get('platform', result.get('hardware', 'unknown'))
            browser = result.get('browser')
            
            # Generate a random ID for the record
            import random
            record_id = random.randint(1000000, 9999999)
            
            # Insert result
            self.db_connection.execute("""
            INSERT INTO acceleration_results (
                id, timestamp, session_id, model_name, model_type, platform, browser,
                is_real_hardware, is_simulation, processing_time, latency_ms,
                throughput_items_per_sec, memory_usage_mb, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                record_id,
                timestamp,
                self.session_id,
                model_name,
                model_type,
                platform,
                browser,
                result.get('is_real_hardware', False),
                result.get('is_simulation', True),
                result.get('processing_time', 0),
                result.get('latency_ms', 0),
                result.get('throughput_items_per_sec', 0),
                result.get('memory_usage_mb', 0),
                json.dumps(result)
            ])
            
            logger.info(f"Stored acceleration result for {model_name} in database")
            return True
        except Exception as e:
            logger.error(f"Error storing acceleration result in database: {e}")
            return False

# For testing
if __name__ == "__main__":
    integration = IPFSAccelerateWebIntegration()
    integration.initialize()
    model = integration.get_model("text", "bert-base-uncased", {"priority_list": ["webgpu", "cpu"]})
    result = model("Sample text")
    print(json.dumps(result, indent=2))
    integration.close()
