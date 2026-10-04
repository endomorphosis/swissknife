#!/usr/bin/env python3
"""
Fault Tolerance Validation and Visualization Integration

This module integrates the fault tolerance validation system with visualization tools,
providing a unified interface for validation testing, analysis, and reporting.

Usage:
    from fixed_web_platform.fault_tolerance_visualization_integration import FaultToleranceValidationSystem
    
    # Create validation system
    validation_system = FaultToleranceValidationSystem(model_manager, output_dir="./reports")
    
    # Run validation with visualization
    await validation_system.run_validation_with_visualization(
        fault_tolerance_level="medium",
        recovery_strategy="progressive",
        test_scenarios=["connection_lost", "browser_crash"],
        generate_report=True
    )
"""

import os
import sys
import json
import time
import logging
import asyncio
import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Set

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(module)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import local modules
try:
    from fixed_web_platform.fault_tolerance_validation import FaultToleranceValidator
    from fixed_web_platform.visualization.fault_tolerance_visualizer import FaultToleranceVisualizer
    MODULES_AVAILABLE = True
except ImportError as e:
    logger.error(f"Required modules not available: {e}")
    MODULES_AVAILABLE = False

class FaultToleranceValidationSystem:
    """
    Integrated system for fault tolerance validation and visualization.
    """
    
    def __init__(self, model_manager, output_dir: Optional[str] = None):
        """
        Initialize the fault tolerance validation system.
        
        Args:
            model_manager: The model sharding manager to validate
            output_dir: Optional directory for storing reports and visualizations
        """
        self.model_manager = model_manager
        self.output_dir = output_dir
        self.logger = logger
        
        # Create output directory if specified
        if self.output_dir:
            os.makedirs(self.output_dir, exist_ok=True)
            self.logger.info(f"Set output directory to: {self.output_dir}")
        
        # Initialize components if available
        if MODULES_AVAILABLE:
            self.logger.info("Validation and visualization modules available")
        else:
            self.logger.warning("Some required modules are not available")
    
    async def run_validation_with_visualization(self, 
                                              fault_tolerance_level: str = "medium",
                                              recovery_strategy: str = "progressive",
                                              test_scenarios: Optional[List[str]] = None,
                                              generate_report: bool = True,
                                              report_name: str = "fault_tolerance_report.html",
                                              ci_compatible: bool = False) -> Dict[str, Any]:
        """
        Run fault tolerance validation with visualization.
        
        Args:
            fault_tolerance_level: Fault tolerance level to validate
            recovery_strategy: Recovery strategy to validate
            test_scenarios: List of test scenarios to run
            generate_report: Whether to generate an HTML report
            report_name: Name of the report file
            ci_compatible: Whether to generate a CI-compatible report
            
        Returns:
            Dictionary with validation results and visualization paths
        """
        if not MODULES_AVAILABLE:
            return {"error": "Required modules not available"}
        
        # Configure test scenarios
        if test_scenarios is None:
            test_scenarios = [
                "connection_lost", 
                "browser_crash", 
                "component_timeout", 
                "multi_browser_failure"
            ]
        
        # Create validator config
        validator_config = {
            "fault_tolerance_level": fault_tolerance_level,
            "recovery_strategy": recovery_strategy,
            "test_scenarios": test_scenarios
        }
        
        # Create validator
        self.logger.info(f"Creating validator with level {fault_tolerance_level} and strategy {recovery_strategy}")
        validator = FaultToleranceValidator(self.model_manager, validator_config)
        
        # Run validation
        self.logger.info(f"Running fault tolerance validation...")
        start_time = time.time()
        validation_results = await validator.validate_fault_tolerance()
        validation_time = time.time() - start_time
        
        self.logger.info(f"Validation completed in {validation_time:.2f}s with status: {validation_results.get('validation_status', 'unknown')}")
        
        # Generate visualizations if requested
        visualizations = {}
        if generate_report:
            visualizations = await self._generate_visualizations(
                validation_results, 
                report_name=report_name,
                ci_compatible=ci_compatible
            )
        
        # Combine results
        results = {
            "validation_results": validation_results,
            "validation_time_seconds": validation_time,
            "visualizations": visualizations
        }
        
        return results
    
    async def run_comparative_validation(self, 
                                       strategies: List[str] = ["simple", "progressive", "coordinated"],
                                       levels: List[str] = ["medium", "high"],
                                       test_scenarios: Optional[List[str]] = None,
                                       report_prefix: str = "comparative") -> Dict[str, Any]:
        """
        Run comparative validation across multiple strategies and fault tolerance levels.
        
        Args:
            strategies: List of recovery strategies to test
            levels: List of fault tolerance levels to test
            test_scenarios: List of test scenarios to run (all if None)
            report_prefix: Prefix for report files
            
        Returns:
            Dictionary with comparative results and visualization paths
        """
        if not MODULES_AVAILABLE:
            return {"error": "Required modules not available"}
        
        # Configure test scenarios
        if test_scenarios is None:
            test_scenarios = [
                "connection_lost", 
                "browser_crash", 
                "component_timeout", 
                "multi_browser_failure"
            ]
        
        # Initialize results
        results_by_config = {}
        comparative_results = {
            "timestamp": datetime.datetime.now().isoformat(),
            "strategies_tested": strategies,
            "levels_tested": levels,
            "scenarios_tested": test_scenarios,
            "results_by_config": results_by_config,
            "visualizations": {},
            "comparative_visualizations": {}
        }
        
        # Run validation for each configuration
        for level in levels:
            for strategy in strategies:
                config_key = f"{level}_{strategy}"
                self.logger.info(f"Running validation for level={level}, strategy={strategy}")
                
                # Create validator config
                validator_config = {
                    "fault_tolerance_level": level,
                    "recovery_strategy": strategy,
                    "test_scenarios": test_scenarios
                }
                
                # Create validator
                validator = FaultToleranceValidator(self.model_manager, validator_config)
                
                # Run validation
                start_time = time.time()
                validation_results = await validator.validate_fault_tolerance()
                validation_time = time.time() - start_time
                
                self.logger.info(f"Configuration {config_key} completed in {validation_time:.2f}s with status: {validation_results.get('validation_status', 'unknown')}")
                
                # Store results
                results_by_config[config_key] = {
                    "validation_results": validation_results,
                    "validation_time_seconds": validation_time
                }
        
        # Generate comparative visualizations
        if self.output_dir:
            await self._generate_comparative_visualizations(
                results_by_config,
                report_prefix=report_prefix
            )
        
        return comparative_results
    
    async def run_stress_test_validation(self,
                                       iterations: int = 5,
                                       fault_tolerance_level: str = "high",
                                       recovery_strategy: str = "coordinated",
                                       test_scenarios: Optional[List[str]] = None,
                                       report_name: str = "stress_test_report.html") -> Dict[str, Any]:
        """
        Run stress test validation with multiple iterations to assess resilience.
        
        Args:
            iterations: Number of validation iterations to run
            fault_tolerance_level: Fault tolerance level to validate
            recovery_strategy: Recovery strategy to validate
            test_scenarios: List of test scenarios to run
            report_name: Name of the report file
            
        Returns:
            Dictionary with stress test results
        """
        if not MODULES_AVAILABLE:
            return {"error": "Required modules not available"}
        
        # Configure test scenarios
        if test_scenarios is None:
            test_scenarios = [
                "connection_lost", 
                "browser_crash", 
                "multi_browser_failure"
            ]
        
        # Initialize results
        all_results = []
        stress_test_results = {
            "timestamp": datetime.datetime.now().isoformat(),
            "iterations": iterations,
            "fault_tolerance_level": fault_tolerance_level,
            "recovery_strategy": recovery_strategy,
            "test_scenarios": test_scenarios,
            "iteration_results": all_results,
            "summary": {},
            "visualizations": {}
        }
        
        # Create validator config
        validator_config = {
            "fault_tolerance_level": fault_tolerance_level,
            "recovery_strategy": recovery_strategy,
            "test_scenarios": test_scenarios
        }
        
        # Run multiple iterations
        success_count = 0
        recovery_times = {}
        
        for i in range(iterations):
            self.logger.info(f"Running stress test iteration {i+1}/{iterations}")
            
            # Create validator
            validator = FaultToleranceValidator(self.model_manager, validator_config)
            
            # Run validation
            start_time = time.time()
            validation_results = await validator.validate_fault_tolerance()
            validation_time = time.time() - start_time
            
            success = validation_results.get("validation_status", "") == "passed"
            if success:
                success_count += 1
            
            # Store scenario recovery times
            for scenario, result in validation_results.get("scenario_results", {}).items():
                if result.get("success", False) and "recovery_time_ms" in result:
                    if scenario not in recovery_times:
                        recovery_times[scenario] = []
                    
                    recovery_times[scenario].append(result["recovery_time_ms"])
            
            # Store iteration results
            all_results.append({
                "iteration": i + 1,
                "validation_results": validation_results,
                "validation_time_seconds": validation_time,
                "success": success
            })
            
            self.logger.info(f"Iteration {i+1} completed in {validation_time:.2f}s with status: {validation_results.get('validation_status', 'unknown')}")
        
        # Calculate summary statistics
        success_rate = success_count / iterations if iterations > 0 else 0
        avg_recovery_times = {}
        
        for scenario, times in recovery_times.items():
            if times:
                avg_recovery_times[scenario] = sum(times) / len(times)
        
        # Update summary
        stress_test_results["summary"] = {
            "success_rate": success_rate,
            "success_count": success_count,
            "total_iterations": iterations,
            "avg_recovery_times": avg_recovery_times
        }
        
        # Generate stress test report
        if self.output_dir:
            await self._generate_stress_test_report(stress_test_results, report_name)
        
        return stress_test_results
    
    async def _generate_visualizations(self, 
                                     validation_results: Dict[str, Any],
                                     report_name: str = "fault_tolerance_report.html",
                                     ci_compatible: bool = False) -> Dict[str, str]:
        """
        Generate visualizations for validation results.
        
        Args:
            validation_results: Validation results from FaultToleranceValidator
            report_name: Name of the report file
            ci_compatible: Whether to generate a CI-compatible report
            
        Returns:
            Dictionary with paths to generated visualizations
        """
        if not MODULES_AVAILABLE:
            return {}
        
        visualizations = {}
        
        try:
            # Create visualizer
            visualizer = FaultToleranceVisualizer(validation_results)
            
            # Set output directory
            if self.output_dir:
                # Make sure output_dir is an absolute path
                abs_output_dir = os.path.abspath(self.output_dir)
                visualizer.set_output_directory(abs_output_dir)
                vis_dir = os.path.join(abs_output_dir, "visualizations")
                os.makedirs(vis_dir, exist_ok=True)
            else:
                vis_dir = "visualizations"
                os.makedirs(vis_dir, exist_ok=True)
            
            # Generate visualizations
            recovery_time_path = os.path.join(vis_dir, "recovery_times.png")
            recovery_vis = await asyncio.to_thread(
                visualizer.generate_recovery_time_comparison, 
                recovery_time_path
            )
            if recovery_vis:
                visualizations["recovery_time"] = recovery_vis
            
            success_rate_path = os.path.join(vis_dir, "success_rates.png")
            success_vis = await asyncio.to_thread(
                visualizer.generate_success_rate_dashboard, 
                success_rate_path
            )
            if success_vis:
                visualizations["success_rate"] = success_vis
            
            perf_impact_path = os.path.join(vis_dir, "performance_impact.png")
            perf_vis = await asyncio.to_thread(
                visualizer.generate_performance_impact_visualization, 
                perf_impact_path
            )
            if perf_vis:
                visualizations["performance_impact"] = perf_vis
            
            # Generate report
            if self.output_dir:
                # Use absolute path to avoid nested path issues
                abs_output_dir = os.path.abspath(self.output_dir)
                report_path = os.path.join(abs_output_dir, report_name)
            else:
                report_path = report_name
            
            if ci_compatible:
                report = await asyncio.to_thread(
                    visualizer.generate_ci_compatible_report, 
                    report_path
                )
            else:
                report = await asyncio.to_thread(
                    visualizer.generate_comprehensive_report, 
                    report_path
                )
            
            if report:
                visualizations["report"] = report
            
            return visualizations
            
        except Exception as e:
            self.logger.error(f"Error generating visualizations: {e}")
            import traceback
            traceback.print_exc()
            return visualizations
    
    async def _generate_comparative_visualizations(self, 
                                                results_by_config: Dict[str, Dict[str, Any]],
                                                report_prefix: str = "comparative") -> Dict[str, str]:
        """
        Generate comparative visualizations for multiple configurations.
        
        Args:
            results_by_config: Dictionary mapping config keys to validation results
            report_prefix: Prefix for report files
            
        Returns:
            Dictionary with paths to generated comparative visualizations
        """
        if not MODULES_AVAILABLE:
            return {}
        
        visualizations = {}
        
        try:
            # Prepare results by strategy
            results_by_strategy = {}
            
            for config_key, config_data in results_by_config.items():
                validation_results = config_data.get("validation_results", {})
                if not validation_results:
                    continue
                
                # Extract strategy from config key
                parts = config_key.split("_")
                if len(parts) >= 2:
                    strategy = parts[1]
                    results_by_strategy[strategy] = validation_results
            
            # Create visualizer with first result set (any will do for initialization)
            first_config = next(iter(results_by_config.values()), {})
            first_results = first_config.get("validation_results", {})
            
            if not first_results:
                self.logger.warning("No valid results for comparative visualization")
                return {}
            
            visualizer = FaultToleranceVisualizer(first_results)
            
            # Set output directory
            if self.output_dir:
                visualizer.set_output_directory(self.output_dir)
                vis_dir = os.path.join(self.output_dir, "comparative")
                os.makedirs(vis_dir, exist_ok=True)
            else:
                vis_dir = "comparative"
                os.makedirs(vis_dir, exist_ok=True)
            
            # Generate strategy comparison
            strategy_comp_path = os.path.join(vis_dir, f"{report_prefix}_strategy_comparison.png")
            strategy_vis = await asyncio.to_thread(
                visualizer.generate_recovery_strategy_comparison, 
                strategy_comp_path,
                results_by_strategy
            )
            
            if strategy_vis:
                visualizations["strategy_comparison"] = strategy_vis
            
            return visualizations
            
        except Exception as e:
            self.logger.error(f"Error generating comparative visualizations: {e}")
            import traceback
            traceback.print_exc()
            return visualizations
    
    async def _generate_stress_test_report(self,
                                        stress_test_results: Dict[str, Any],
                                        report_name: str = "stress_test_report.html") -> Optional[str]:
        """
        Generate a report for stress test results.
        
        Args:
            stress_test_results: Results from stress test validation
            report_name: Name of the report file
            
        Returns:
            Path to the generated report or None if generation failed
        """
        if not MODULES_AVAILABLE:
            return None
        
        try:
            # TODO: Implement stress test report generation
            # This would be a specialized report showing success rates across iterations
            # and stability of recovery times
            
            # For now, just write the raw results to a JSON file
            if self.output_dir:
                json_path = os.path.join(self.output_dir, f"{report_name}.json")
            else:
                json_path = f"{report_name}.json"
            
            with open(json_path, 'w') as f:
                json.dump(stress_test_results, f, indent=2)
            
            self.logger.info(f"Stress test results saved to: {json_path}")
            return json_path
            
        except Exception as e:
            self.logger.error(f"Error generating stress test report: {e}")
            import traceback
            traceback.print_exc()
            return None


# Command-line interface
async def main():
    """Command-line interface for the fault tolerance validation system."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Fault Tolerance Validation and Visualization System"
    )
    
    # Basic options
    parser.add_argument("--model", type=str, required=True,
                      help="Model name to test")
    parser.add_argument("--browsers", type=str, default="chrome,firefox,edge",
                      help="Comma-separated list of browsers to use")
    parser.add_argument("--output-dir", type=str, default="./reports",
                      help="Directory for output files")
    
    # Validation options
    parser.add_argument("--fault-level", type=str, default="medium",
                      choices=["low", "medium", "high", "critical"],
                      help="Fault tolerance level to validate")
    parser.add_argument("--recovery-strategy", type=str, default="progressive",
                      choices=["simple", "progressive", "parallel", "coordinated"],
                      help="Recovery strategy to validate")
    parser.add_argument("--test-scenarios", type=str,
                      help="Comma-separated list of test scenarios")
    
    # Test modes
    parser.add_argument("--comparative", action="store_true",
                      help="Run comparative validation across multiple configurations")
    parser.add_argument("--stress-test", action="store_true",
                      help="Run stress test validation with multiple iterations")
    parser.add_argument("--iterations", type=int, default=5,
                      help="Number of iterations for stress testing")
    
    # Report options
    parser.add_argument("--report-name", type=str, default="fault_tolerance_report.html",
                      help="Name of the report file")
    parser.add_argument("--ci-compatible", action="store_true",
                      help="Generate CI-compatible report with embedded images")
    
    # Parse arguments
    args = parser.parse_args()
    
    # Prepare browsers list
    browsers = args.browsers.split(',')
    
    # Prepare test scenarios
    test_scenarios = None
    if args.test_scenarios:
        test_scenarios = args.test_scenarios.split(',')
    
    try:
        # Import necessary modules
        from cross_browser_model_sharding import CrossBrowserModelShardingManager
        
        # Create directory for output
        os.makedirs(args.output_dir, exist_ok=True)
        
        # Create model manager
        model_config = {
            "enable_fault_tolerance": True,
            "fault_tolerance_level": args.fault_level,
            "recovery_strategy": args.recovery_strategy,
            "timeout": 300
        }
        
        manager = CrossBrowserModelShardingManager(
            model_name=args.model,
            browsers=browsers,
            shard_type="optimal",
            num_shards=len(browsers),
            model_config=model_config
        )
        
        # Initialize model manager
        logger.info(f"Initializing model manager for {args.model}")
        initialized = await manager.initialize()
        
        if not initialized:
            logger.error(f"Failed to initialize model manager for {args.model}")
            return 1
        
        logger.info(f"Model manager initialized successfully")
        
        # Create validation system
        validation_system = FaultToleranceValidationSystem(
            model_manager=manager,
            output_dir=args.output_dir
        )
        
        # Run validation based on mode
        if args.comparative:
            logger.info("Running comparative validation")
            results = await validation_system.run_comparative_validation(
                strategies=["simple", "progressive", "coordinated"],
                levels=[args.fault_level],
                test_scenarios=test_scenarios,
                report_prefix=args.model.replace('-', '_')
            )
            
            summary_path = os.path.join(args.output_dir, f"{args.model}_comparative_summary.json")
            with open(summary_path, 'w') as f:
                json.dump(results, f, indent=2)
            
            logger.info(f"Comparative validation completed. Summary saved to: {summary_path}")
            
        elif args.stress_test:
            logger.info(f"Running stress test validation with {args.iterations} iterations")
            results = await validation_system.run_stress_test_validation(
                iterations=args.iterations,
                fault_tolerance_level=args.fault_level,
                recovery_strategy=args.recovery_strategy,
                test_scenarios=test_scenarios,
                report_name=f"{args.model}_stress_test_report.html"
            )
            
            summary_path = os.path.join(args.output_dir, f"{args.model}_stress_test_summary.json")
            with open(summary_path, 'w') as f:
                json.dump(results, f, indent=2)
            
            logger.info(f"Stress test validation completed. Summary saved to: {summary_path}")
            
        else:
            logger.info("Running standard validation")
            results = await validation_system.run_validation_with_visualization(
                fault_tolerance_level=args.fault_level,
                recovery_strategy=args.recovery_strategy,
                test_scenarios=test_scenarios,
                generate_report=True,
                report_name=args.report_name,
                ci_compatible=args.ci_compatible
            )
            
            validation_status = results.get("validation_results", {}).get("validation_status", "unknown")
            logger.info(f"Validation completed with status: {validation_status}")
            
            if "report" in results.get("visualizations", {}):
                report_path = results["visualizations"]["report"]
                logger.info(f"Report generated at: {report_path}")
        
        # Shutdown model manager
        await manager.shutdown()
        
        return 0
        
    except ImportError as e:
        logger.error(f"Required modules not available: {e}")
        return 1
    except Exception as e:
        logger.error(f"Error during validation: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    asyncio.run(main())