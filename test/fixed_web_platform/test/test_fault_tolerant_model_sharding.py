#!/usr/bin/env python3
"""
Test Fault-Tolerant Cross-Browser Model Sharding

This script tests the fault-tolerant cross-browser model sharding capability,
verifying that models can be distributed across multiple browsers with robust
recovery from browser failures.

Usage:
    python test_fault_tolerant_model_sharding.py --fault-tolerance-level high --recovery-strategy progressive
    python test_fault_tolerant_model_sharding.py --model-name llama-7b --browsers chrome,firefox,edge
    python test_fault_tolerant_model_sharding.py --inject-fault browser_crash --comprehensive
"""

import os
import sys
import json
import time
import asyncio
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add parent directory to path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

# Import required modules
try:
    from fixed_web_platform.resource_pool_bridge_integration import ResourcePoolBridgeIntegration
    from fixed_web_platform.fault_tolerant_model_sharding import FaultTolerantModelSharding
    from fixed_web_platform.fault_tolerance_validation import FaultToleranceValidator
    FAULT_TOLERANCE_AVAILABLE = True
except ImportError as e:
    logger.error(f"Fault tolerance components not available: {e}")
    FAULT_TOLERANCE_AVAILABLE = False

# Try to import distributed testing components
try:
    from distributed_testing.plugins.resource_pool_plugin import ResourcePoolPlugin
    from distributed_testing.worker_registry import WorkerRegistry
    from distributed_testing.circuit_breaker import CircuitBreaker
    DISTRIBUTED_TESTING_AVAILABLE = True
except ImportError:
    logger.warning("Distributed testing framework not available, some tests will be limited")
    DISTRIBUTED_TESTING_AVAILABLE = False

# Test models
TEST_MODELS = [
    # Model name, shard count, description
    ("llama-7b", 3, "Large language model"),
    ("llama-13b", 4, "Larger language model"),
    ("t5-large", 2, "Text-to-text model"),
    ("whisper-large", 2, "Speech recognition model"),
    ("clip-vit-large", 2, "Vision-text model")
]

# Fault scenarios
FAULT_SCENARIOS = [
    "browser_crash",
    "connection_lost",
    "component_timeout",
    "multi_browser_failure",
    "staggered_failure"
]

class ModelShardingTester:
    """Tester for fault-tolerant model sharding"""
    
    def __init__(self, args):
        """Initialize with command line arguments"""
        self.args = args
        self.integration = None
        self.plugin = None
        self.results = {}
        
        # Configure logging level
        if args.verbose:
            logging.getLogger().setLevel(logging.DEBUG)
            logger.info("Verbose logging enabled")
        
        # Set test parameters
        self.model_name = args.model_name
        self.fault_tolerance_level = args.fault_tolerance_level
        self.recovery_strategy = args.recovery_strategy
        self.browsers = args.browsers.split(",") if args.browsers else ["chrome", "firefox", "edge"]
        self.inject_fault = args.inject_fault
        self.shard_type = args.shard_type
        self.enable_state_replication = args.enable_state_replication
        
        logger.info(f"Model sharding tester initialized with model: {self.model_name}")
        logger.info(f"Fault tolerance level: {self.fault_tolerance_level}")
        logger.info(f"Recovery strategy: {self.recovery_strategy}")
        logger.info(f"Browsers: {self.browsers}")
        
    async def initialize(self) -> bool:
        """Initialize the tester with required components"""
        if not FAULT_TOLERANCE_AVAILABLE:
            logger.error("Fault tolerance components not available, cannot run test")
            return False
        
        try:
            # Create resource pool integration
            self.integration = ResourcePoolBridgeIntegration(
                max_connections=len(self.browsers),
                min_connections=1,
                enable_gpu=True,
                enable_cpu=True,
                headless=not self.args.visible,
                adaptive_scaling=True,
                enable_heartbeat=True
            )
            
            # Initialize integration
            self.integration.initialize()
            logger.info("Resource pool integration initialized")
            
            # Create distributed testing plugin if available
            if DISTRIBUTED_TESTING_AVAILABLE and self.args.use_distributed_testing:
                self.plugin = ResourcePoolPlugin(
                    integration=self.integration,
                    fault_tolerance_level=self.fault_tolerance_level,
                    recovery_strategy=self.recovery_strategy
                )
                
                await self.plugin.initialize()
                logger.info("Distributed testing plugin initialized")
            
            return True
        except Exception as e:
            logger.error(f"Error initializing tester: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def close(self):
        """Close all components"""
        try:
            if self.plugin:
                await self.plugin.shutdown()
                logger.info("Distributed testing plugin shut down")
            
            if self.integration:
                self.integration.close()
                logger.info("Resource pool integration closed")
        except Exception as e:
            logger.error(f"Error closing tester: {e}")
    
    async def test_model_sharding(self) -> Dict[str, Any]:
        """Test fault-tolerant model sharding for a specific model"""
        logger.info(f"Testing model sharding for {self.model_name} with {self.fault_tolerance_level} fault tolerance")
        
        try:
            # Get shard count for the model
            shard_count = self._get_shard_count(self.model_name)
            
            # Create fault-tolerant model sharding
            model_manager = FaultTolerantModelSharding(
                model_name=self.model_name,
                browsers=self.browsers,
                shard_count=shard_count,
                fault_tolerance_level=self.fault_tolerance_level,
                recovery_strategy=self.recovery_strategy,
                connection_pool=self.integration
            )
            
            # Initialize sharding
            start_time = time.time()
            init_result = await model_manager.initialize(
                shard_type=self.shard_type,
                enable_state_replication=self.enable_state_replication
            )
            initialization_time = time.time() - start_time
            
            logger.info(f"Model sharding initialized in {initialization_time:.2f}s: {init_result['status']}")
            
            if init_result["status"] not in ["ready", "degraded"]:
                logger.error(f"Model sharding initialization failed: {init_result}")
                return {
                    "success": False,
                    "model_name": self.model_name,
                    "initialization_status": init_result["status"],
                    "error": "Initialization failed"
                }
            
            # Prepare for fault injection if requested
            if self.inject_fault:
                # Start a background task to inject fault during execution
                logger.info(f"Will inject fault: {self.inject_fault}")
                fault_task = asyncio.create_task(self._inject_fault(model_manager, self.inject_fault))
            
            # Create model input based on model type
            model_type = self._get_model_type(self.model_name)
            model_input = self._create_test_input(model_type)
            
            # Run inference
            start_time = time.time()
            inference_result = await model_manager.run_inference(
                inputs=model_input,
                fault_tolerance_options={
                    "recovery_timeout": 30,
                    "max_retries": 3,
                    "recovery_strategy": self.recovery_strategy,
                    "state_preservation": self.enable_state_replication
                }
            )
            inference_time = time.time() - start_time
            
            logger.info(f"Inference completed in {inference_time:.2f}s: {inference_result.get('success', False)}")
            
            # Wait for fault injection to complete if active
            if self.inject_fault:
                try:
                    await fault_task
                    logger.info(f"Fault injection complete: {self.inject_fault}")
                except Exception as e:
                    logger.error(f"Error in fault injection: {e}")
            
            # Get recovery statistics
            recovery_stats = model_manager.get_recovery_statistics()
            
            logger.info(f"Recovery attempts: {recovery_stats['total_attempts']}")
            logger.info(f"Successful recoveries: {recovery_stats['successful_recoveries']}")
            
            # Perform multiple inferences if comprehensive test
            additional_results = []
            if self.args.comprehensive:
                logger.info("Running comprehensive test with multiple inferences")
                
                for i in range(3):
                    # Add small delay between tests
                    await asyncio.sleep(0.5)
                    
                    # Run inference
                    start_time = time.time()
                    result = await model_manager.run_inference(
                        inputs=model_input,
                        fault_tolerance_options={
                            "recovery_timeout": 30,
                            "max_retries": 3,
                            "recovery_strategy": self.recovery_strategy,
                            "state_preservation": self.enable_state_replication
                        }
                    )
                    inference_time = time.time() - start_time
                    
                    logger.info(f"Additional inference {i+1} completed in {inference_time:.2f}s: {result.get('success', False)}")
                    
                    additional_results.append({
                        "success": result.get("success", False),
                        "inference_time": inference_time,
                        "metrics": result.get("fault_tolerance_metrics", {})
                    })
            
            # Clean up manager
            shutdown_result = await model_manager.shutdown()
            
            # Compile results
            result = {
                "success": inference_result.get("success", False),
                "model_name": self.model_name,
                "initialization_status": init_result["status"],
                "initialization_time": initialization_time,
                "inference_time": inference_time,
                "browser_count": len(self.browsers),
                "shard_count": shard_count,
                "fault_tolerance_level": self.fault_tolerance_level,
                "recovery_strategy": self.recovery_strategy,
                "recovery_stats": recovery_stats,
                "fault_injected": self.inject_fault,
                "additional_inferences": additional_results if self.args.comprehensive else []
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error in model sharding test: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "model_name": self.model_name,
                "error": str(e)
            }
    
    async def test_multiple_models(self) -> Dict[str, List[Dict[str, Any]]]:
        """Test fault-tolerant model sharding for multiple models"""
        logger.info("Testing multiple models with fault-tolerant model sharding")
        
        results = []
        
        for model_name, shard_count, description in TEST_MODELS:
            logger.info(f"Testing model: {model_name} ({description})")
            
            # Update model name for current test
            self.model_name = model_name
            
            # Run test for this model
            result = await self.test_model_sharding()
            results.append(result)
            
            # Add small delay between tests
            await asyncio.sleep(1)
        
        # Summarize results
        success_count = sum(1 for r in results if r.get("success", False))
        logger.info(f"Multiple model test complete: {success_count}/{len(results)} models successful")
        
        return {
            "success": success_count > 0,
            "models_tested": len(results),
            "successful_models": success_count,
            "models": results
        }
    
    async def test_fault_tolerance_validation(self) -> Dict[str, Any]:
        """Test fault tolerance validation for model sharding"""
        logger.info("Testing fault tolerance validation")
        
        try:
            # Get shard count for the model
            shard_count = self._get_shard_count(self.model_name)
            
            # Create fault-tolerant model sharding
            model_manager = FaultTolerantModelSharding(
                model_name=self.model_name,
                browsers=self.browsers,
                shard_count=shard_count,
                fault_tolerance_level=self.fault_tolerance_level,
                recovery_strategy=self.recovery_strategy,
                connection_pool=self.integration
            )
            
            # Initialize sharding
            await model_manager.initialize(
                shard_type=self.shard_type,
                enable_state_replication=self.enable_state_replication
            )
            
            # Create validator
            validator = FaultToleranceValidator(
                model_manager=model_manager,
                config={
                    'fault_tolerance_level': self.fault_tolerance_level,
                    'recovery_strategy': self.recovery_strategy,
                    'test_scenarios': FAULT_SCENARIOS
                }
            )
            
            # Run validation
            logger.info(f"Running validation with {self.fault_tolerance_level} fault tolerance")
            validation_results = await validator.validate_fault_tolerance()
            
            # Get analysis
            analysis = validator.analyze_results(validation_results)
            
            # Clean up
            await model_manager.shutdown()
            
            # Return validation results
            return {
                "success": validation_results.get("validation_status") != "failed",
                "validation_status": validation_results.get("validation_status"),
                "scenarios_tested": validation_results.get("scenarios_tested", []),
                "scenario_results": validation_results.get("scenario_results", {}),
                "basic_validation": validation_results.get("basic_validation", {}),
                "analysis": {
                    "strengths": analysis.get("strengths", []),
                    "weaknesses": analysis.get("weaknesses", []),
                    "recommendations": analysis.get("recommendations", [])
                }
            }
            
        except Exception as e:
            logger.error(f"Error in fault tolerance validation: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "validation_status": "error",
                "error": str(e)
            }
    
    async def test_distributed_integration(self) -> Dict[str, Any]:
        """Test integration with distributed testing framework"""
        if not DISTRIBUTED_TESTING_AVAILABLE or not self.plugin:
            logger.warning("Distributed testing framework not available, skipping integration test")
            return {"skipped": "Distributed testing framework not available"}
        
        logger.info("Testing integration with distributed testing framework")
        
        try:
            # Get status from plugin
            plugin_status = await self.plugin.get_status()
            
            # Run a task through the plugin
            task_result = await self.plugin.execute_task({
                "action": "run_model",
                "model_name": self.model_name,
                "model_type": self._get_model_type(self.model_name),
                "platform": "webgpu",
                "inputs": self._create_test_input(self._get_model_type(self.model_name))
            })
            
            # Get metrics from plugin
            plugin_metrics = await self.plugin.get_metrics()
            
            # Inject fault if requested
            if self.inject_fault:
                logger.info(f"Injecting fault through plugin: {self.inject_fault}")
                
                fault_result = await self.plugin.inject_fault({
                    "type": self.inject_fault,
                    "browser": self.browsers[0]
                })
                
                logger.info(f"Fault injection result: {fault_result.get('success', False)}")
                
                # Run another task to test recovery
                recovery_task_result = await self.plugin.execute_task({
                    "action": "run_model",
                    "model_name": self.model_name,
                    "model_type": self._get_model_type(self.model_name),
                    "platform": "webgpu",
                    "inputs": self._create_test_input(self._get_model_type(self.model_name))
                })
                
                logger.info(f"Recovery task success: {recovery_task_result.get('success', False)}")
                
                # Add recovery information to result
                task_result["recovery_task"] = {
                    "success": recovery_task_result.get("success", False),
                    "execution_time": recovery_task_result.get("execution_time", 0)
                }
            
            # Compile results
            return {
                "success": task_result.get("success", False),
                "plugin_status": plugin_status,
                "task_execution": {
                    "success": task_result.get("success", False),
                    "model_name": self.model_name,
                    "execution_time": task_result.get("execution_time", 0)
                },
                "plugin_metrics": plugin_metrics,
                "fault_injected": self.inject_fault
            }
            
        except Exception as e:
            logger.error(f"Error in distributed integration test: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _inject_fault(self, model_manager, fault_type):
        """Inject a fault during execution"""
        # Wait a short time before injecting fault
        await asyncio.sleep(0.5)
        
        logger.info(f"Injecting fault: {fault_type}")
        
        try:
            if fault_type == "browser_crash":
                # Simulate browser crash in the first browser
                if hasattr(model_manager, "_simulate_browser_crash"):
                    await model_manager._simulate_browser_crash(0)
                    return {"success": True, "fault_type": fault_type}
                else:
                    # Alternative: set browser state to failed
                    if hasattr(model_manager, "browser_states") and self.browsers:
                        model_manager.browser_states[self.browsers[0]] = "failed"
                        return {"success": True, "fault_type": fault_type}
            
            elif fault_type == "connection_lost":
                # Simulate connection loss in the first browser
                if hasattr(model_manager, "_simulate_connection_loss"):
                    await model_manager._simulate_connection_loss(0)
                    return {"success": True, "fault_type": fault_type}
                else:
                    # Alternative: set browser state to disconnected
                    if hasattr(model_manager, "browser_states") and self.browsers:
                        model_manager.browser_states[self.browsers[0]] = "disconnected"
                        return {"success": True, "fault_type": fault_type}
            
            elif fault_type == "component_timeout":
                # Simulate component timeout
                if hasattr(model_manager, "_simulate_operation_timeout"):
                    await model_manager._simulate_operation_timeout(0)
                    return {"success": True, "fault_type": fault_type}
                else:
                    # Alternative: set a component to failed state
                    if hasattr(model_manager, "component_states") and model_manager.component_states:
                        component = list(model_manager.component_states.keys())[0]
                        model_manager.component_states[component] = "failed"
                        return {"success": True, "fault_type": fault_type}
            
            elif fault_type == "multi_browser_failure":
                # Simulate failure in multiple browsers
                failures = 0
                
                # Try to fail first two browsers
                for i in range(min(2, len(self.browsers))):
                    if hasattr(model_manager, "_simulate_browser_crash"):
                        await model_manager._simulate_browser_crash(i)
                        failures += 1
                    elif hasattr(model_manager, "browser_states") and i < len(self.browsers):
                        model_manager.browser_states[self.browsers[i]] = "failed"
                        failures += 1
                
                return {"success": failures > 0, "fault_type": fault_type, "failures": failures}
            
            elif fault_type == "staggered_failure":
                # Simulate staggered failures with delays
                failures = 0
                
                # Fail first browser
                if hasattr(model_manager, "browser_states") and self.browsers:
                    model_manager.browser_states[self.browsers[0]] = "failed"
                    failures += 1
                
                # Wait before failing second browser
                await asyncio.sleep(1.0)
                
                # Fail second browser if available
                if hasattr(model_manager, "browser_states") and len(self.browsers) > 1:
                    model_manager.browser_states[self.browsers[1]] = "failed"
                    failures += 1
                
                return {"success": failures > 0, "fault_type": fault_type, "failures": failures}
            
            else:
                logger.warning(f"Unknown fault type: {fault_type}")
                return {"success": False, "error": f"Unknown fault type: {fault_type}"}
                
        except Exception as e:
            logger.error(f"Error injecting fault: {e}")
            return {"success": False, "error": str(e)}
    
    def _get_shard_count(self, model_name: str) -> int:
        """Get recommended shard count for model"""
        # Check if specified in command line
        if self.args.shard_count:
            return self.args.shard_count
        
        # Look up in test models
        for test_model, shard_count, _ in TEST_MODELS:
            if test_model == model_name:
                return shard_count
        
        # Default shard count based on model name
        if "13b" in model_name or "large" in model_name:
            return 4
        elif "7b" in model_name or "base" in model_name:
            return 3
        else:
            return 2
    
    def _get_model_type(self, model_name: str) -> str:
        """Get model type based on model name"""
        if "llama" in model_name or "llm" in model_name or "gpt" in model_name:
            return "text"
        elif "t5" in model_name or "bert" in model_name:
            return "text_embedding"
        elif "vit" in model_name or "clip" in model_name:
            return "vision"
        elif "whisper" in model_name or "wav2vec" in model_name:
            return "audio"
        else:
            return "text"
    
    def _create_test_input(self, model_type: str) -> Dict[str, Any]:
        """Create appropriate test input for model type"""
        if model_type == "text_embedding":
            return {
                "input_ids": [101, 2023, 2003, 1037, 3231, 102],
                "attention_mask": [1, 1, 1, 1, 1, 1]
            }
        elif model_type == "vision":
            return {"pixel_values": [[[0.5 for _ in range(3)] for _ in range(224)] for _ in range(1)]}
        elif model_type == "audio":
            return {"input_features": [[[0.1 for _ in range(80)] for _ in range(3000)]]}
        elif model_type == "text":
            return {"inputs": "This is a test input for the model.", "max_length": 20}
        else:
            return {"inputs": "Test input"}
    
    def save_results(self, results: Dict[str, Any]):
        """Save test results to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"fault_tolerant_model_sharding_test_{timestamp}.json"
        
        # Add summary information
        summary = {
            "timestamp": timestamp,
            "fault_tolerance_level": self.fault_tolerance_level,
            "recovery_strategy": self.recovery_strategy,
            "browsers": self.browsers,
            "model_name": self.model_name,
            "distributed_testing_available": DISTRIBUTED_TESTING_AVAILABLE,
            "fault_injected": self.inject_fault
        }
        
        # Combine results
        full_results = {
            "summary": summary,
            "results": results
        }
        
        # Save to file
        with open(filename, 'w') as f:
            json.dump(full_results, f, indent=2)
        
        logger.info(f"Test results saved to {filename}")

async def main_async():
    """Main async function"""
    parser = argparse.ArgumentParser(description="Test Fault-Tolerant Cross-Browser Model Sharding")
    
    # Test selection options
    parser.add_argument("--test-single", action="store_true",
        help="Test single model sharding")
    parser.add_argument("--test-multiple", action="store_true",
        help="Test multiple models")
    parser.add_argument("--test-validation", action="store_true",
        help="Test fault tolerance validation")
    parser.add_argument("--test-distributed", action="store_true",
        help="Test distributed testing integration")
    parser.add_argument("--comprehensive", action="store_true",
        help="Run comprehensive tests")
    
    # Model options
    parser.add_argument("--model-name", type=str, default="llama-7b",
        help="Model name to test")
    parser.add_argument("--shard-count", type=int,
        help="Number of shards (defaults to model-specific value)")
    parser.add_argument("--shard-type", type=str, default="optimal",
        choices=["optimal", "layer_based", "browser_based", "component_based"],
        help="Sharding strategy")
    
    # Fault tolerance options
    parser.add_argument("--fault-tolerance-level", type=str, 
        choices=["low", "medium", "high", "critical"], default="medium",
        help="Fault tolerance level")
    parser.add_argument("--recovery-strategy", type=str,
        choices=["simple", "progressive", "parallel", "coordinated"], default="progressive",
        help="Recovery strategy")
    parser.add_argument("--enable-state-replication", action="store_true",
        help="Enable state replication")
    parser.add_argument("--inject-fault", type=str,
        choices=["browser_crash", "connection_lost", "component_timeout", 
                "multi_browser_failure", "staggered_failure"],
        help="Inject a specific fault during testing")
    
    # Browser options
    parser.add_argument("--browsers", type=str, default="chrome,firefox,edge",
        help="Comma-separated list of browsers to use")
    parser.add_argument("--visible", action="store_true",
        help="Run browsers in visible mode (not headless)")
    
    # Integration options
    parser.add_argument("--use-distributed-testing", action="store_true",
        help="Use distributed testing framework integration")
    
    # Logging options
    parser.add_argument("--verbose", action="store_true",
        help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # If comprehensive flag is set, enable all tests
    if args.comprehensive:
        args.test_single = True
        args.test_validation = True
        if DISTRIBUTED_TESTING_AVAILABLE:
            args.test_distributed = True
        args.enable_state_replication = True
    
    # Default to single test if no test specified
    if not any([args.test_single, args.test_multiple, args.test_validation, args.test_distributed]):
        args.test_single = True
    
    # Create tester
    tester = ModelShardingTester(args)
    
    try:
        # Initialize
        if not await tester.initialize():
            logger.error("Failed to initialize tester")
            return 1
        
        all_results = {}
        
        # Run selected tests
        if args.test_single:
            logger.info("=== Running Single Model Sharding Test ===")
            result = await tester.test_model_sharding()
            all_results["single_model"] = result
            
            logger.info(f"Single model test result: {result.get('success', False)}")
            logger.info(f"Model: {result.get('model_name')}")
            logger.info(f"Initialization time: {result.get('initialization_time', 0):.2f}s")
            logger.info(f"Inference time: {result.get('inference_time', 0):.2f}s")
            
            if not result.get("success", False):
                logger.error(f"Error: {result.get('error', 'Unknown error')}")
        
        if args.test_multiple:
            logger.info("=== Running Multiple Model Sharding Test ===")
            result = await tester.test_multiple_models()
            all_results["multiple_models"] = result
            
            logger.info(f"Multiple model test result: {result.get('success', False)}")
            logger.info(f"Models tested: {result.get('models_tested', 0)}")
            logger.info(f"Successful models: {result.get('successful_models', 0)}")
        
        if args.test_validation:
            logger.info("=== Running Fault Tolerance Validation Test ===")
            result = await tester.test_fault_tolerance_validation()
            all_results["validation"] = result
            
            logger.info(f"Validation result: {result.get('validation_status', 'unknown')}")
            
            if "analysis" in result:
                logger.info("Strengths:")
                for strength in result["analysis"].get("strengths", []):
                    logger.info(f"- {strength}")
                
                logger.info("Weaknesses:")
                for weakness in result["analysis"].get("weaknesses", []):
                    logger.info(f"- {weakness}")
                
                logger.info("Recommendations:")
                for recommendation in result["analysis"].get("recommendations", []):
                    logger.info(f"- {recommendation}")
        
        if args.test_distributed:
            logger.info("=== Running Distributed Testing Integration Test ===")
            result = await tester.test_distributed_integration()
            all_results["distributed"] = result
            
            if "skipped" in result:
                logger.info(f"Distributed testing skipped: {result['skipped']}")
            else:
                logger.info(f"Distributed testing result: {result.get('success', False)}")
                
                if "task_execution" in result:
                    task = result["task_execution"]
                    logger.info(f"Task success: {task.get('success', False)}")
                    logger.info(f"Task execution time: {task.get('execution_time', 0):.2f}ms")
                
                if "recovery_task" in result.get("task_execution", {}):
                    recovery = result["task_execution"]["recovery_task"]
                    logger.info(f"Recovery task success: {recovery.get('success', False)}")
                    logger.info(f"Recovery task execution time: {recovery.get('execution_time', 0):.2f}ms")
        
        # Save results
        tester.save_results(all_results)
        
        # Close tester
        await tester.close()
        
        return 0
    except Exception as e:
        logger.error(f"Error in main: {e}")
        import traceback
        traceback.print_exc()
        
        # Ensure tester is closed
        await tester.close()
        
        return 1

def main():
    """Main entry point"""
    try:
        return asyncio.run(main_async())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        return 130

if __name__ == "__main__":
    sys.exit(main())