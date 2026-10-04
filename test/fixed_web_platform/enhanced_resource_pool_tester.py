#!/usr/bin/env python3
"""
Enhanced WebNN/WebGPU Resource Pool Tester (May 2025)

This module provides an enhanced tester for the WebNN/WebGPU Resource Pool Integration
with the May 2025 implementation, including adaptive scaling and advanced connection pooling.
"""

import os
import sys
import json
import time
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import the enhanced resource pool integration
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from fixed_web_platform.resource_pool_integration_enhanced import EnhancedResourcePoolIntegration
    ENHANCED_INTEGRATION_AVAILABLE = True
except ImportError:
    logger.warning("Enhanced Resource Pool Integration not available")
    ENHANCED_INTEGRATION_AVAILABLE = False

class EnhancedWebResourcePoolTester:
    """
    Enhanced tester for WebNN/WebGPU Resource Pool Integration using the May 2025 implementation
    with adaptive scaling and advanced connection pooling
    """
    
    def __init__(self, args):
        """Initialize tester with command line arguments"""
        self.args = args
        self.integration = None
        self.models = {}
        self.results = []
        
    async def initialize(self):
        """Initialize the resource pool integration with enhanced features"""
        try:
            # Create enhanced integration with advanced features
            self.integration = EnhancedResourcePoolIntegration(
                max_connections=self.args.max_connections,
                min_connections=getattr(self.args, 'min_connections', 1),
                enable_gpu=True,
                enable_cpu=True,
                headless=not getattr(self.args, 'visible', False),
                db_path=getattr(self.args, 'db_path', None),
                adaptive_scaling=getattr(self.args, 'adaptive_scaling', True),
                use_connection_pool=True
            )
            
            # Initialize integration
            success = await self.integration.initialize()
            if not success:
                logger.error("Failed to initialize EnhancedResourcePoolIntegration")
                return False
            
            logger.info("EnhancedResourcePoolIntegration initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing EnhancedResourcePoolIntegration: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def test_model(self, model_type, model_name, platform):
        """Test a model with the enhanced resource pool integration"""
        logger.info(f"Testing model {model_name} ({model_type}) on platform {platform}")
        
        try:
            # Get model with enhanced integration
            start_time = time.time()
            
            # Use browser preferences for optimal performance
            browser = None
            if model_type == 'audio' and platform == 'webgpu' and getattr(self.args, 'firefox', False):
                # Firefox is best for audio models with WebGPU
                browser = 'firefox'
                logger.info(f"Using Firefox for audio model {model_name}")
            elif model_type == 'text_embedding' and platform == 'webnn' and getattr(self.args, 'edge', False):
                # Edge is best for text models with WebNN
                browser = 'edge'
                logger.info(f"Using Edge for text model {model_name} with WebNN")
            elif model_type == 'vision' and platform == 'webgpu' and getattr(self.args, 'chrome', False):
                # Chrome is best for vision models with WebGPU
                browser = 'chrome'
                logger.info(f"Using Chrome for vision model {model_name}")
            
            # Configure model-specific optimizations
            optimizations = {}
            
            # Audio models benefit from compute shader optimization (especially in Firefox)
            if model_type == 'audio' and getattr(self.args, 'compute_shaders', False):
                optimizations['compute_shaders'] = True
                logger.info(f"Enabling compute shader optimization for audio model {model_name}")
            
            # Vision models benefit from shader precompilation
            if model_type == 'vision' and getattr(self.args, 'shader_precompile', False):
                optimizations['precompile_shaders'] = True
                logger.info(f"Enabling shader precompilation for vision model {model_name}")
            
            # Multimodal models benefit from parallel loading
            if model_type == 'multimodal' and getattr(self.args, 'parallel_loading', False):
                optimizations['parallel_loading'] = True
                logger.info(f"Enabling parallel loading for multimodal model {model_name}")
            
            # Configure quantization options
            quantization = None
            if hasattr(self.args, 'precision') and self.args.precision != 16:
                quantization = {
                    'bits': self.args.precision,
                    'mixed_precision': getattr(self.args, 'mixed_precision', False),
                }
                logger.info(f"Using {self.args.precision}-bit precision" + 
                           (" with mixed precision" if quantization['mixed_precision'] else ""))
            
            # Get model with optimal configuration
            model = await self.integration.get_model(
                model_name=model_name,
                model_type=model_type,
                platform=platform,
                browser=browser,
                batch_size=1,
                quantization=quantization,
                optimizations=optimizations
            )
            
            load_time = time.time() - start_time
            
            if model:
                logger.info(f"Model {model_name} loaded in {load_time:.2f}s")
                
                # Store model for later use
                model_key = f"{model_type}:{model_name}"
                self.models[model_key] = model
                
                # Create input based on model type
                inputs = self._create_test_inputs(model_type)
                
                # Run inference
                inference_start = time.time()
                result = await model(inputs)  # Directly call model assuming it's a callable with await
                inference_time = time.time() - inference_start
                
                logger.info(f"Inference completed in {inference_time:.2f}s")
                
                # Add relevant metrics
                result['model_name'] = model_name
                result['model_type'] = model_type
                result['load_time'] = load_time
                result['inference_time'] = inference_time
                result['execution_time'] = time.time()
                
                # Store result for later analysis
                self.results.append(result)
                
                # Log success and metrics
                logger.info(f"Test for {model_name} completed successfully:")
                logger.info(f"  - Load time: {load_time:.2f}s")
                logger.info(f"  - Inference time: {inference_time:.2f}s")
                
                # Log additional metrics
                if 'platform' in result:
                    logger.info(f"  - Platform: {result.get('platform', 'unknown')}")
                if 'browser' in result:
                    logger.info(f"  - Browser: {result.get('browser', 'unknown')}")
                if 'is_real_implementation' in result:
                    logger.info(f"  - Real implementation: {result.get('is_real_implementation', False)}")
                if 'throughput_items_per_sec' in result.get('performance_metrics', {}):
                    logger.info(f"  - Throughput: {result.get('performance_metrics', {}).get('throughput_items_per_sec', 0):.2f} items/s")
                if 'memory_usage_mb' in result.get('performance_metrics', {}):
                    logger.info(f"  - Memory usage: {result.get('performance_metrics', {}).get('memory_usage_mb', 0):.2f} MB")
                
                return True
            else:
                logger.error(f"Failed to load model {model_name}")
                return False
        except Exception as e:
            logger.error(f"Error testing model {model_name}: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def test_concurrent_models(self, models, platform):
        """Test multiple models concurrently with the enhanced resource pool integration"""
        logger.info(f"Testing {len(models)} models concurrently on platform {platform}")
        
        try:
            # Create model inputs
            models_and_inputs = []
            
            # Load each model and prepare inputs
            for model_type, model_name in models:
                # Get model with enhanced integration
                model = await self.integration.get_model(
                    model_name=model_name,
                    model_type=model_type,
                    platform=platform
                )
                
                if model:
                    # Create input based on model type
                    inputs = self._create_test_inputs(model_type)
                    
                    # Add to models and inputs list
                    models_and_inputs.append((model, inputs))
                else:
                    logger.error(f"Failed to load model {model_name}")
            
            # Run concurrent inference if we have models
            if models_and_inputs:
                logger.info(f"Running concurrent inference on {len(models_and_inputs)} models")
                
                # Start timing
                start_time = time.time()
                
                # Run concurrent inference using enhanced integration
                results = await self.integration.execute_concurrent(models_and_inputs)
                
                # Calculate total time
                total_time = time.time() - start_time
                
                logger.info(f"Concurrent inference completed in {total_time:.2f}s for {len(models_and_inputs)} models")
                
                # Process results
                for i, result in enumerate(results):
                    model, _ = models_and_inputs[i]
                    model_type, model_name = None, "unknown"
                    
                    # Extract model type and name
                    if hasattr(model, 'model_type'):
                        model_type = model.model_type
                    if hasattr(model, 'model_name'):
                        model_name = model.model_name
                    
                    # Add relevant metrics
                    result['model_name'] = model_name
                    result['model_type'] = model_type
                    result['execution_time'] = time.time()
                    
                    # Store result for later analysis
                    self.results.append(result)
                
                # Log success
                logger.info(f"Concurrent test completed successfully for {len(results)} models")
                logger.info(f"  - Average time per model: {total_time / len(results):.2f}s")
                
                # Compare to sequential execution time estimate
                sequential_estimate = sum(result.get('inference_time', 0.5) for result in results)
                speedup = sequential_estimate / total_time if total_time > 0 else 1.0
                logger.info(f"  - Estimated sequential time: {sequential_estimate:.2f}s")
                logger.info(f"  - Speedup from concurrency: {speedup:.2f}x")
                
                return True
            else:
                logger.error("No models successfully loaded for concurrent testing")
                return False
        except Exception as e:
            logger.error(f"Error in concurrent model testing: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def run_stress_test(self, duration, models):
        """
        Run a stress test on the resource pool for a specified duration.
        
        This test continuously creates and executes models to test the resource pool
        under high load conditions, with comprehensive metrics and adaptive scaling.
        """
        logger.info(f"Running enhanced stress test for {duration} seconds with {len(models)} models")
        
        try:
            # Track stress test metrics
            start_time = time.time()
            end_time = start_time + duration
            iteration = 0
            success_count = 0
            failure_count = 0
            total_load_time = 0
            total_inference_time = 0
            max_concurrent = 0
            current_concurrent = 0
            
            # Record final metrics
            final_stats = {
                'duration': duration,
                'iterations': 0,
                'success_count': 0,
                'failure_count': 0,
                'avg_load_time': 0,
                'avg_inference_time': 0,
                'max_concurrent': 0,
                'platform_distribution': {},
                'browser_distribution': {},
                'ipfs_acceleration_count': 0,
                'ipfs_cache_hits': 0
            }
            
            # Create execution loop
            while time.time() < end_time:
                # Randomly select model type and name from models list
                import random
                model_idx = random.randint(0, len(models) - 1)
                model_type, model_name = models[model_idx]
                
                # Randomly select platform
                platform = random.choice(['webgpu', 'webnn']) if random.random() > 0.2 else 'cpu'
                
                # For audio models, preferentially use Firefox
                browser = None
                if model_type == 'audio' and platform == 'webgpu':
                    browser = 'firefox'
                
                # Start load timing
                load_start = time.time()
                
                # Update concurrent count
                current_concurrent += 1
                max_concurrent = max(max_concurrent, current_concurrent)
                
                try:
                    # Load model
                    model = await self.integration.get_model(
                        model_name=model_name,
                        model_type=model_type,
                        platform=platform,
                        browser=browser
                    )
                    
                    # Record load time
                    load_time = time.time() - load_start
                    total_load_time += load_time
                    
                    if model:
                        # Create input
                        inputs = self._create_test_inputs(model_type)
                        
                        # Run inference
                        inference_start = time.time()
                        result = await model(inputs)
                        inference_time = time.time() - inference_start
                        
                        # Update metrics
                        total_inference_time += inference_time
                        success_count += 1
                        
                        # Add result data
                        result['model_name'] = model_name
                        result['model_type'] = model_type
                        result['load_time'] = load_time
                        result['inference_time'] = inference_time
                        result['execution_time'] = time.time()
                        result['iteration'] = iteration
                        
                        # Store result
                        self.results.append(result)
                        
                        # Track platform distribution
                        platform_actual = result.get('platform', platform)
                        if platform_actual not in final_stats['platform_distribution']:
                            final_stats['platform_distribution'][platform_actual] = 0
                        final_stats['platform_distribution'][platform_actual] += 1
                        
                        # Track browser distribution
                        browser_actual = result.get('browser', 'unknown')
                        if browser_actual not in final_stats['browser_distribution']:
                            final_stats['browser_distribution'][browser_actual] = 0
                        final_stats['browser_distribution'][browser_actual] += 1
                        
                        # Track IPFS acceleration
                        if result.get('ipfs_accelerated', False):
                            final_stats['ipfs_acceleration_count'] += 1
                        if result.get('ipfs_cache_hit', False):
                            final_stats['ipfs_cache_hits'] += 1
                        
                        # Log periodic progress
                        if iteration % 10 == 0:
                            elapsed = time.time() - start_time
                            remaining = max(0, end_time - time.time())
                            logger.info(f"Stress test progress: {elapsed:.1f}s elapsed, {remaining:.1f}s remaining, {success_count} successes, {failure_count} failures")
                    else:
                        # Model load failed
                        failure_count += 1
                        logger.warning(f"Failed to load model {model_name} in stress test")
                except Exception as e:
                    # Execution failed
                    failure_count += 1
                    logger.warning(f"Error in stress test iteration {iteration}: {e}")
                finally:
                    # Update concurrent count
                    current_concurrent -= 1
                
                # Increment iteration counter
                iteration += 1
                
                # Get metrics periodically
                if iteration % 5 == 0:
                    try:
                        metrics = self.integration.get_metrics()
                        if 'connection_pool' in metrics:
                            pool_stats = metrics['connection_pool']
                            logger.info(f"Connection pool: {pool_stats.get('total_connections', 0)} connections, {pool_stats.get('health_counts', {}).get('healthy', 0)} healthy")
                    except Exception as e:
                        logger.warning(f"Error getting metrics: {e}")
                
                # Small pause to avoid CPU spinning
                await asyncio.sleep(0.1)
            
            # Calculate final metrics
            final_stats['iterations'] = iteration
            final_stats['success_count'] = success_count
            final_stats['failure_count'] = failure_count
            final_stats['avg_load_time'] = total_load_time / max(success_count, 1)
            final_stats['avg_inference_time'] = total_inference_time / max(success_count, 1)
            final_stats['max_concurrent'] = max_concurrent
            
            # Log final results
            logger.info("=" * 80)
            logger.info(f"Enhanced stress test completed with {iteration} iterations:")
            logger.info(f"  - Success rate: {success_count}/{iteration} ({success_count/max(iteration,1)*100:.1f}%)")
            logger.info(f"  - Average load time: {final_stats['avg_load_time']:.3f}s")
            logger.info(f"  - Average inference time: {final_stats['avg_inference_time']:.3f}s")
            logger.info(f"  - Max concurrent models: {max_concurrent}")
            
            # Log platform distribution
            logger.info("Platform distribution:")
            for platform, count in final_stats['platform_distribution'].items():
                logger.info(f"  - {platform}: {count} ({count/max(iteration,1)*100:.1f}%)")
            
            # Log browser distribution
            logger.info("Browser distribution:")
            for browser, count in final_stats['browser_distribution'].items():
                logger.info(f"  - {browser}: {count} ({count/max(iteration,1)*100:.1f}%)")
            
            # Log IPFS acceleration metrics
            if 'ipfs_acceleration_count' in final_stats:
                logger.info(f"  - IPFS Acceleration Count: {final_stats.get('ipfs_acceleration_count', 0)}")
            if 'ipfs_cache_hits' in final_stats:
                logger.info(f"  - IPFS Cache Hits: {final_stats.get('ipfs_cache_hits', 0)}")
            
            # Log connection pool metrics
            try:
                metrics = self.integration.get_metrics()
                if 'connection_pool' in metrics:
                    pool_stats = metrics['connection_pool']
                    logger.info(f"Connection pool final state:")
                    logger.info(f"  - Connections: {pool_stats.get('total_connections', 0)}")
                    logger.info(f"  - Healthy: {pool_stats.get('health_counts', {}).get('healthy', 0)}")
                    logger.info(f"  - Degraded: {pool_stats.get('health_counts', {}).get('degraded', 0)}")
                    logger.info(f"  - Unhealthy: {pool_stats.get('health_counts', {}).get('unhealthy', 0)}")
                    
                    # Log adaptive scaling metrics if available
                    if 'adaptive_stats' in pool_stats:
                        adaptive_stats = pool_stats['adaptive_stats']
                        logger.info(f"Adaptive scaling metrics:")
                        logger.info(f"  - Current utilization: {adaptive_stats.get('current_utilization', 0):.2f}")
                        logger.info(f"  - Average utilization: {adaptive_stats.get('avg_utilization', 0):.2f}")
                        logger.info(f"  - Peak utilization: {adaptive_stats.get('peak_utilization', 0):.2f}")
                        logger.info(f"  - Scale up threshold: {adaptive_stats.get('scale_up_threshold', 0):.2f}")
                        logger.info(f"  - Scale down threshold: {adaptive_stats.get('scale_down_threshold', 0):.2f}")
                        logger.info(f"  - Connection startup time: {adaptive_stats.get('avg_connection_startup_time', 0):.2f}s")
            except Exception as e:
                logger.warning(f"Error getting final metrics: {e}")
            
            # Save final test results
            self.save_results()
            
            logger.info("=" * 80)
            logger.info("Enhanced stress test completed successfully")
            
        except Exception as e:
            logger.error(f"Error in enhanced stress test: {e}")
            import traceback
            traceback.print_exc()
    
    async def close(self):
        """Close resource pool integration"""
        if self.integration:
            await self.integration.close()
            logger.info("EnhancedResourcePoolIntegration closed")
    
    def _create_test_inputs(self, model_type):
        """Create test inputs based on model type"""
        # Create different inputs for different model types
        if model_type == 'text_embedding' or model_type == 'text':
            return {"input_text": "This is a test of the enhanced resource pool integration"}
        elif model_type == 'vision':
            # Create simple vision input (would be a proper image tensor in real usage)
            return {"image_data": [[[0.5 for _ in range(3)] for _ in range(224)] for _ in range(224)]}
        elif model_type == 'audio':
            # Create simple audio input (would be a proper audio tensor in real usage)
            return {"audio_data": [[0.1 for _ in range(16000)]]}
        elif model_type == 'multimodal':
            # Create multimodal input with both text and image
            return {
                "input_text": "This is a test of the enhanced resource pool integration",
                "image_data": [[[0.5 for _ in range(3)] for _ in range(224)] for _ in range(224)]
            }
        else:
            # Default to simple text input
            return {"input_text": "This is a test of the enhanced resource pool integration"}
    
    def save_results(self):
        """Save comprehensive results to file with enhanced metrics"""
        if not self.results:
            logger.warning("No results to save")
            return
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"enhanced_web_resource_pool_test_{timestamp}.json"
        
        # Calculate summary metrics
        total_tests = len(self.results)
        successful_tests = sum(1 for r in self.results if r.get('success', False))
        
        # Get resource pool metrics
        try:
            resource_pool_metrics = self.integration.get_metrics()
        except Exception as e:
            logger.warning(f"Error getting resource pool metrics: {e}")
            resource_pool_metrics = {}
        
        # Create comprehensive report
        report = {
            'timestamp': timestamp,
            'test_type': 'enhanced_web_resource_pool',
            'implementation_version': 'May 2025',
            'total_tests': total_tests,
            'successful_tests': successful_tests,
            'success_rate': (successful_tests / total_tests * 100) if total_tests else 0,
            'resource_pool_metrics': resource_pool_metrics,
            'detailed_results': self.results
        }
        
        # Save to file
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Enhanced test results saved to {filename}")
        
        # Also save to database if available
        if getattr(self.args, 'db_path', None):
            try:
                import duckdb
                
                # Connect to database
                conn = duckdb.connect(self.args.db_path)
                
                # Create table if not exists
                conn.execute("""
                CREATE TABLE IF NOT EXISTS enhanced_resource_pool_tests (
                    id INTEGER PRIMARY KEY,
                    timestamp TIMESTAMP,
                    test_type VARCHAR,
                    implementation_version VARCHAR,
                    total_tests INTEGER,
                    successful_tests INTEGER,
                    success_rate FLOAT,
                    resource_pool_metrics JSON,
                    detailed_results JSON
                )
                """)
                
                # Insert into database
                conn.execute("""
                INSERT INTO enhanced_resource_pool_tests (
                    timestamp,
                    test_type,
                    implementation_version,
                    total_tests,
                    successful_tests,
                    success_rate,
                    resource_pool_metrics,
                    detailed_results
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    datetime.now(),
                    'enhanced_web_resource_pool',
                    'May 2025',
                    total_tests,
                    successful_tests,
                    (successful_tests / total_tests * 100) if total_tests else 0,
                    json.dumps(resource_pool_metrics),
                    json.dumps(self.results)
                ])
                
                logger.info(f"Enhanced test results saved to database: {self.args.db_path}")
            except Exception as e:
                logger.error(f"Error saving results to database: {e}")

# For testing directly
if __name__ == "__main__":
    import argparse
    
    async def test_main():
        # Parse arguments
        parser = argparse.ArgumentParser(description="Test enhanced resource pool integration")
        parser.add_argument("--models", type=str, default="bert-base-uncased,vit-base-patch16-224,whisper-tiny",
                          help="Comma-separated list of models to test")
        parser.add_argument("--platform", type=str, choices=["webnn", "webgpu"], default="webgpu",
                          help="Platform to test")
        parser.add_argument("--concurrent", action="store_true",
                          help="Test models concurrently")
        parser.add_argument("--min-connections", type=int, default=1,
                          help="Minimum number of connections")
        parser.add_argument("--max-connections", type=int, default=4,
                          help="Maximum number of connections")
        parser.add_argument("--adaptive-scaling", action="store_true",
                          help="Enable adaptive scaling")
        args = parser.parse_args()
        
        # Parse models
        models = []
        for model_name in args.models.split(","):
            if "bert" in model_name.lower():
                model_type = "text_embedding"
            elif "vit" in model_name.lower():
                model_type = "vision"
            elif "whisper" in model_name.lower():
                model_type = "audio"
            else:
                model_type = "text"
            models.append((model_type, model_name))
        
        # Create tester
        tester = EnhancedWebResourcePoolTester(args)
        
        # Initialize tester
        if not await tester.initialize():
            logger.error("Failed to initialize tester")
            return 1
        
        # Test models
        if args.concurrent:
            await tester.test_concurrent_models(models, args.platform)
        else:
            for model_type, model_name in models:
                await tester.test_model(model_type, model_name, args.platform)
        
        # Close tester
        await tester.close()
        
        return 0
    
    # Run the test
    asyncio.run(test_main())