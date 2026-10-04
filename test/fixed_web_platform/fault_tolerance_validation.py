#!/usr/bin/env python3
"""
Advanced Fault Tolerance Validation System for Cross-Browser Model Sharding

This module provides comprehensive validation tools for testing and verifying 
fault tolerance capabilities in cross-browser model sharding implementations.
It includes test scenarios, validation metrics, and analysis tools to ensure 
enterprise-grade fault tolerance features work correctly.

Usage:
    from fixed_web_platform.fault_tolerance_validation import FaultToleranceValidator
    
    # Create validator
    validator = FaultToleranceValidator(model_manager)
    
    # Run comprehensive validation
    validation_results = await validator.validate_fault_tolerance()
    
    # Analyze results
    analysis = validator.analyze_results(validation_results)
"""

import os
import sys
import json
import time
import asyncio
import logging
import random
import traceback
import datetime
import statistics
from typing import Dict, List, Any, Optional, Union, Tuple, Set

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define failure types for simulation
FAILURE_TYPES = {
    # Communication failures
    "connection_lost": "Simulates sudden connection loss to browser",
    "network_latency": "Simulates high network latency",
    "network_instability": "Simulates packet loss and connection flakiness",
    
    # Browser failures
    "browser_crash": "Simulates complete browser crash",
    "browser_reload": "Simulates browser tab reload",
    "browser_memory_pressure": "Simulates browser under memory pressure",
    "browser_cpu_throttling": "Simulates CPU throttling in browser",
    
    # Component failures
    "component_timeout": "Simulates component operation timeout",
    "component_error": "Simulates component throwing an error",
    "partial_result": "Simulates component returning partial results",
    
    # Multiple failures
    "cascade_failure": "Simulates cascading failures across components",
    "multi_browser_failure": "Simulates multiple browser failures simultaneously",
    "staggered_failure": "Simulates failures occurring at different times"
}

# Define recovery strategies
RECOVERY_STRATEGIES = [
    "simple",       # Simple retry with same browser
    "progressive",  # Progressive recovery with component relocation
    "parallel",     # Parallel recovery of multiple components
    "coordinated"   # Coordinated recovery with consensus protocol
]

# Define fault tolerance levels
FAULT_TOLERANCE_LEVELS = [
    "none",     # No fault tolerance
    "low",      # Basic retry mechanisms
    "medium",   # Component relocation and state recovery
    "high",     # Distributed consensus with full state replication 
    "critical"  # Maximum redundancy with coordinator replication
]

class FaultToleranceValidator:
    """Validator for fault tolerance capabilities in cross-browser model sharding."""
    
    def __init__(self, model_manager, config=None):
        """
        Initialize the fault tolerance validator.
        
        Args:
            model_manager: The model sharding manager to validate
            config: Optional configuration for validation tests
        """
        self.model_manager = model_manager
        self.config = config or {}
        self.test_results = {}
        self.metrics_collector = MetricsCollector()
        
        # Set default configuration if not provided
        if 'fault_tolerance_level' not in self.config:
            self.config['fault_tolerance_level'] = 'medium'
            
        if 'recovery_strategy' not in self.config:
            self.config['recovery_strategy'] = 'progressive'
            
        if 'test_scenarios' not in self.config:
            self.config['test_scenarios'] = [
                "connection_lost",
                "browser_crash", 
                "component_timeout", 
                "multi_browser_failure"
            ]
        
        # Logging and tracking
        self.logger = logger
        self.logger.info(f"Initialized FaultToleranceValidator with {self.config['fault_tolerance_level']} level")
        
    async def validate_fault_tolerance(self) -> Dict[str, Any]:
        """
        Run comprehensive fault tolerance validation.
        
        Returns:
            Dictionary with validation results and metrics
        """
        self.logger.info("Starting comprehensive fault tolerance validation")
        
        validation_results = {
            "timestamp": datetime.datetime.now().isoformat(),
            "model_manager": str(self.model_manager.__class__.__name__),
            "fault_tolerance_level": self.config['fault_tolerance_level'],
            "recovery_strategy": self.config['recovery_strategy'],
            "scenarios_tested": [],
            "overall_metrics": {},
            "scenario_results": {},
            "validation_status": "running"
        }
        
        try:
            # Phase 1: Basic fault tolerance capability validation
            self.logger.info("Phase 1: Basic capability validation")
            basic_validation = await self._validate_basic_capabilities()
            validation_results["basic_validation"] = basic_validation
            
            if not basic_validation.get("success", False):
                self.logger.error("Basic fault tolerance validation failed")
                validation_results["validation_status"] = "failed"
                validation_results["failure_reason"] = "basic_validation_failed"
                return validation_results
            
            # Phase 2: Scenario testing for each failure type
            self.logger.info("Phase 2: Scenario testing")
            for scenario in self.config['test_scenarios']:
                self.logger.info(f"Testing scenario: {scenario}")
                
                # Skip scenarios not applicable to current fault tolerance level
                if not self._is_scenario_applicable(scenario):
                    self.logger.info(f"Skipping {scenario} - not applicable for {self.config['fault_tolerance_level']} level")
                    continue
                
                scenario_result = await self._test_failure_scenario(scenario)
                validation_results["scenarios_tested"].append(scenario)
                validation_results["scenario_results"][scenario] = scenario_result
                
                # Allow metrics collector to process scenario results
                self.metrics_collector.collect_scenario_metrics(scenario, scenario_result)
                
                # If critical scenario fails, mark validation as failed
                if scenario in ["browser_crash", "multi_browser_failure"] and not scenario_result.get("success", False):
                    self.logger.error(f"Critical scenario {scenario} failed")
                    validation_results["validation_status"] = "failed"
                    validation_results["failure_reason"] = f"critical_scenario_{scenario}_failed"
                    # Continue testing other scenarios even if one fails
            
            # Phase 3: Performance impact assessment
            self.logger.info("Phase 3: Performance impact assessment")
            performance_impact = await self._assess_performance_impact()
            validation_results["performance_impact"] = performance_impact
            
            # Phase 4: Recovery metrics analysis
            self.logger.info("Phase 4: Recovery metrics analysis")
            recovery_metrics = self.metrics_collector.get_recovery_metrics()
            validation_results["recovery_metrics"] = recovery_metrics
            
            # Phase 5: Final validation assessment
            validation_status = self._calculate_validation_status(validation_results)
            validation_results["validation_status"] = validation_status
            validation_results["overall_metrics"] = self.metrics_collector.get_overall_metrics()
            
            self.logger.info(f"Fault tolerance validation completed with status: {validation_status}")
            return validation_results
            
        except Exception as e:
            self.logger.error(f"Error during fault tolerance validation: {e}")
            traceback.print_exc()
            validation_results["validation_status"] = "error"
            validation_results["error"] = str(e)
            validation_results["error_traceback"] = traceback.format_exc()
            return validation_results
    
    async def _validate_basic_capabilities(self) -> Dict[str, Any]:
        """
        Validate basic fault tolerance capabilities.
        
        Returns:
            Dictionary with basic validation results
        """
        result = {
            "success": False,
            "capabilities_verified": [],
            "missing_capabilities": []
        }
        
        # 1. Check for fault tolerance implementation
        try:
            ft_config = await self._get_fault_tolerance_config()
            if ft_config.get("enabled", False):
                result["capabilities_verified"].append("fault_tolerance_enabled")
            else:
                result["missing_capabilities"].append("fault_tolerance_enabled")
                return result  # Can't continue if fault tolerance is not enabled
        except Exception as e:
            self.logger.error(f"Error checking fault tolerance config: {e}")
            result["missing_capabilities"].append("fault_tolerance_config")
            result["error"] = str(e)
            return result
        
        # 2. Verify recovery strategy
        strategy = ft_config.get("recovery_strategy", "none")
        if strategy in RECOVERY_STRATEGIES:
            result["capabilities_verified"].append("recovery_strategy")
            result["recovery_strategy"] = strategy
        else:
            result["missing_capabilities"].append("recovery_strategy")
        
        # 3. Check for state management capabilities
        try:
            has_state_mgmt = await self._check_state_management()
            if has_state_mgmt:
                result["capabilities_verified"].append("state_management")
            else:
                result["missing_capabilities"].append("state_management")
        except Exception as e:
            self.logger.error(f"Error checking state management: {e}")
            result["missing_capabilities"].append("state_management")
        
        # 4. Check for component relocation capability
        try:
            has_relocation = await self._check_component_relocation()
            if has_relocation:
                result["capabilities_verified"].append("component_relocation")
            else:
                result["missing_capabilities"].append("component_relocation")
        except Exception as e:
            self.logger.error(f"Error checking component relocation: {e}")
            result["missing_capabilities"].append("component_relocation")
        
        # Determine overall success
        required_capabilities = ["fault_tolerance_enabled", "recovery_strategy"]
        
        # For medium and higher levels, state management is required
        if self.config['fault_tolerance_level'] in ["medium", "high", "critical"]:
            required_capabilities.append("state_management")
        
        # For high and critical levels, component relocation is required
        if self.config['fault_tolerance_level'] in ["high", "critical"]:
            required_capabilities.append("component_relocation")
        
        # Check if all required capabilities are verified
        for capability in required_capabilities:
            if capability not in result["capabilities_verified"]:
                result["success"] = False
                return result
        
        result["success"] = True
        return result
    
    async def _get_fault_tolerance_config(self) -> Dict[str, Any]:
        """
        Get fault tolerance configuration from the model manager.
        
        Returns:
            Dictionary with fault tolerance configuration
        """
        try:
            # Try to get fault tolerance config through standard API
            if hasattr(self.model_manager, "get_fault_tolerance_config"):
                return await self.model_manager.get_fault_tolerance_config()
            
            # Alternative: extract from metrics if available
            metrics = await self._get_manager_metrics()
            if "fault_tolerance" in metrics:
                return metrics["fault_tolerance"]
            
            # Fall back to checking instance variables
            if hasattr(self.model_manager, "fault_tolerance_enabled"):
                return {
                    "enabled": self.model_manager.fault_tolerance_enabled,
                    "level": getattr(self.model_manager, "fault_tolerance_level", "unknown"),
                    "recovery_strategy": getattr(self.model_manager, "recovery_strategy", "unknown")
                }
            
            # Default config assuming enabled
            return {
                "enabled": True,
                "level": self.config['fault_tolerance_level'],
                "recovery_strategy": self.config['recovery_strategy']
            }
        except Exception as e:
            self.logger.error(f"Error getting fault tolerance config: {e}")
            return {"enabled": False, "error": str(e)}
    
    async def _check_state_management(self) -> bool:
        """
        Check if the model manager has state management capabilities.
        
        Returns:
            Boolean indicating if state management is available
        """
        # Check for state management methods
        has_state_methods = (
            hasattr(self.model_manager, "save_state") and
            hasattr(self.model_manager, "restore_state")
        )
        
        if has_state_methods:
            return True
        
        # Check if state management is available in metrics
        metrics = await self._get_manager_metrics()
        if "state_management" in metrics:
            return metrics["state_management"].get("available", False)
        
        # Fall back to checking for state management flags
        return (
            hasattr(self.model_manager, "state_management_enabled") and
            self.model_manager.state_management_enabled
        )
    
    async def _check_component_relocation(self) -> bool:
        """
        Check if the model manager has component relocation capabilities.
        
        Returns:
            Boolean indicating if component relocation is available
        """
        # Check for component relocation methods
        has_relocation_methods = (
            hasattr(self.model_manager, "relocate_component") or
            hasattr(self.model_manager, "reassign_shard")
        )
        
        if has_relocation_methods:
            return True
        
        # Check if component relocation is mentioned in metrics
        metrics = await self._get_manager_metrics()
        if "component_relocation" in metrics:
            return metrics["component_relocation"].get("available", False)
        
        # Fall back to checking recovery strategy
        ft_config = await self._get_fault_tolerance_config()
        recovery_strategy = ft_config.get("recovery_strategy", "")
        
        return recovery_strategy in ["progressive", "coordinated"]
    
    async def _get_manager_metrics(self) -> Dict[str, Any]:
        """
        Get metrics from the model manager.
        
        Returns:
            Dictionary with metrics
        """
        try:
            if hasattr(self.model_manager, "get_metrics"):
                return await self.model_manager.get_metrics()
            
            if hasattr(self.model_manager, "get_status"):
                return await self.model_manager.get_status()
            
            return {}
        except Exception as e:
            self.logger.error(f"Error getting manager metrics: {e}")
            return {}
    
    def _is_scenario_applicable(self, scenario: str) -> bool:
        """
        Check if a scenario is applicable for the current fault tolerance level.
        
        Args:
            scenario: The failure scenario to check
            
        Returns:
            Boolean indicating if the scenario should be tested
        """
        # All scenarios are applicable for high and critical levels
        if self.config['fault_tolerance_level'] in ["high", "critical"]:
            return True
        
        # For medium level, exclude multi-failure scenarios
        if self.config['fault_tolerance_level'] == "medium":
            return scenario not in ["cascade_failure", "multi_browser_failure", "staggered_failure"]
        
        # For low level, only include basic failure scenarios
        if self.config['fault_tolerance_level'] == "low":
            return scenario in ["connection_lost", "component_timeout", "browser_reload"]
        
        # For no fault tolerance, no scenarios are applicable
        return False
    
    async def _test_failure_scenario(self, scenario: str) -> Dict[str, Any]:
        """
        Test a specific failure scenario.
        
        Args:
            scenario: The failure scenario to test
            
        Returns:
            Dictionary with test results
        """
        self.logger.info(f"Testing failure scenario: {scenario}")
        
        # Prepare result structure
        result = {
            "scenario": scenario,
            "description": FAILURE_TYPES.get(scenario, "Unknown scenario"),
            "start_time": datetime.datetime.now().isoformat(),
            "success": False,
            "recovery_time_ms": 0,
            "metrics": {}
        }
        
        try:
            # Phase 1: Setup and pre-failure state capture
            pre_failure_state = await self._capture_system_state()
            result["pre_failure_state"] = pre_failure_state
            
            # Phase 2: Induce failure based on scenario
            failure_time_start = time.time()
            failure_result = await self._induce_failure(scenario)
            result["failure_result"] = failure_result
            
            if not failure_result.get("induced", False):
                self.logger.warning(f"Failed to induce {scenario} failure")
                result["failure_reason"] = "failure_induction_failed"
                return result
            
            # Phase 3: Monitor recovery
            recovery_start = time.time()
            recovery_result = await self._monitor_recovery(scenario, failure_result)
            recovery_time = (time.time() - recovery_start) * 1000  # ms
            
            result["recovery_result"] = recovery_result
            result["recovery_time_ms"] = recovery_time
            
            # Phase 4: Verify post-recovery state
            post_recovery_state = await self._capture_system_state()
            result["post_recovery_state"] = post_recovery_state
            
            # Phase 5: Verify system integrity after recovery
            integrity_result = await self._verify_integrity(pre_failure_state, post_recovery_state)
            result["integrity_verified"] = integrity_result.get("integrity_verified", False)
            result["integrity_details"] = integrity_result
            
            # Determine overall success
            result["success"] = (
                recovery_result.get("recovered", False) and
                integrity_result.get("integrity_verified", False)
            )
            
            # Collect detailed metrics
            result["metrics"] = {
                "failure_induction_time_ms": (failure_result.get("induction_time_ms", 0)),
                "recovery_time_ms": recovery_time,
                "total_scenario_time_ms": (time.time() - failure_time_start) * 1000,
                "recovery_steps": recovery_result.get("recovery_steps", []),
                "recovery_actions": recovery_result.get("recovery_actions", {})
            }
            
            result["end_time"] = datetime.datetime.now().isoformat()
            return result
            
        except Exception as e:
            self.logger.error(f"Error during {scenario} scenario test: {e}")
            traceback.print_exc()
            result["success"] = False
            result["error"] = str(e)
            result["error_traceback"] = traceback.format_exc()
            result["end_time"] = datetime.datetime.now().isoformat()
            return result
    
    async def _capture_system_state(self) -> Dict[str, Any]:
        """
        Capture current system state for later comparison.
        
        Returns:
            Dictionary with system state
        """
        state = {
            "timestamp": datetime.datetime.now().isoformat(),
        }
        
        try:
            # Get metrics and status
            if hasattr(self.model_manager, "get_metrics"):
                state["metrics"] = await self.model_manager.get_metrics()
            
            if hasattr(self.model_manager, "get_status"):
                state["status"] = await self.model_manager.get_status()
            
            # Get browser allocation
            if hasattr(self.model_manager, "get_browser_allocation"):
                state["browser_allocation"] = await self.model_manager.get_browser_allocation()
            elif "browser_allocation" in state.get("metrics", {}):
                state["browser_allocation"] = state["metrics"]["browser_allocation"]
            
            # Get component allocation
            if hasattr(self.model_manager, "get_component_allocation"):
                state["component_allocation"] = await self.model_manager.get_component_allocation()
            elif "component_allocation" in state.get("metrics", {}):
                state["component_allocation"] = state["metrics"]["component_allocation"]
            
            # Get active browsers
            if hasattr(self.model_manager, "active_browsers"):
                state["active_browsers"] = self.model_manager.active_browsers
            elif "active_browsers" in state.get("status", {}):
                state["active_browsers"] = state["status"]["active_browsers"]
            
            # Capture state hash if available
            if hasattr(self.model_manager, "get_state_hash"):
                state["state_hash"] = await self.model_manager.get_state_hash()
            
            return state
            
        except Exception as e:
            self.logger.error(f"Error capturing system state: {e}")
            return {"error": str(e), "timestamp": datetime.datetime.now().isoformat()}
    
    async def _induce_failure(self, scenario: str) -> Dict[str, Any]:
        """
        Induce a specific failure scenario.
        
        Args:
            scenario: The failure scenario to induce
            
        Returns:
            Dictionary with details about the induced failure
        """
        self.logger.info(f"Inducing failure: {scenario}")
        result = {
            "scenario": scenario,
            "induced": False,
            "start_time": datetime.datetime.now().isoformat(),
        }
        
        start_time = time.time()
        
        try:
            # Handle different failure scenarios
            if scenario == "connection_lost":
                # Simulate connection loss
                if hasattr(self.model_manager, "_simulate_connection_loss"):
                    browser_index = await self._get_random_browser_index()
                    await self.model_manager._simulate_connection_loss(browser_index)
                    result["browser_index"] = browser_index
                    result["induced"] = True
                
                elif hasattr(self.model_manager, "_handle_connection_failure"):
                    browser_index = await self._get_random_browser_index()
                    await self.model_manager._handle_connection_failure(browser_index)
                    result["browser_index"] = browser_index
                    result["induced"] = True
                
                else:
                    # Fallback: directly manipulate active_browsers if available
                    browser_index = await self._get_random_browser_index()
                    if hasattr(self.model_manager, "active_browsers") and browser_index is not None:
                        browser = self.model_manager.browser_shards.keys()[browser_index]
                        if browser in self.model_manager.active_browsers:
                            self.model_manager.active_browsers.remove(browser)
                            result["browser"] = browser
                            result["induced"] = True
            
            elif scenario == "browser_crash":
                # Simulate browser crash
                if hasattr(self.model_manager, "_simulate_browser_crash"):
                    browser_index = await self._get_random_browser_index()
                    await self.model_manager._simulate_browser_crash(browser_index)
                    result["browser_index"] = browser_index
                    result["induced"] = True
                
                elif hasattr(self.model_manager, "browser_managers"):
                    # Fallback: directly remove a browser manager
                    browser_index = await self._get_random_browser_index()
                    browser = list(self.model_manager.browser_managers.keys())[browser_index]
                    del self.model_manager.browser_managers[browser]
                    if hasattr(self.model_manager, "active_browsers") and browser in self.model_manager.active_browsers:
                        self.model_manager.active_browsers.remove(browser)
                    result["browser"] = browser
                    result["induced"] = True
            
            elif scenario == "component_timeout":
                # Simulate component timeout
                if hasattr(self.model_manager, "_simulate_operation_timeout"):
                    browser_index = await self._get_random_browser_index()
                    await self.model_manager._simulate_operation_timeout(browser_index)
                    result["browser_index"] = browser_index
                    result["induced"] = True
                else:
                    # Fallback: set a timeout flag if available
                    browser_index = await self._get_random_browser_index()
                    if hasattr(self.model_manager, "_set_component_timeout"):
                        await self.model_manager._set_component_timeout(browser_index)
                        result["browser_index"] = browser_index
                        result["induced"] = True
            
            elif scenario == "multi_browser_failure":
                # Simulate multiple browser failures
                browser_indices = await self._get_multiple_browser_indices(2)
                induced_count = 0
                
                for idx in browser_indices:
                    if hasattr(self.model_manager, "_simulate_browser_crash"):
                        await self.model_manager._simulate_browser_crash(idx)
                        induced_count += 1
                
                result["browser_indices"] = browser_indices
                result["induced"] = induced_count > 0
                result["induced_count"] = induced_count
            
            # Add more scenarios as needed
            
            else:
                self.logger.warning(f"Unsupported failure scenario: {scenario}")
                result["induced"] = False
                result["reason"] = "unsupported_scenario"
            
            result["induction_time_ms"] = (time.time() - start_time) * 1000
            result["end_time"] = datetime.datetime.now().isoformat()
            return result
            
        except Exception as e:
            self.logger.error(f"Error inducing {scenario} failure: {e}")
            result["induced"] = False
            result["error"] = str(e)
            result["induction_time_ms"] = (time.time() - start_time) * 1000
            result["end_time"] = datetime.datetime.now().isoformat()
            return result
    
    async def _get_random_browser_index(self) -> Optional[int]:
        """
        Get a random browser index to target for failure.
        
        Returns:
            Random browser index or None if no browsers available
        """
        try:
            status = await self._get_manager_metrics()
            
            # Try different ways to get browser count
            browser_count = None
            
            if "active_browsers" in status:
                browser_count = len(status["active_browsers"])
            elif hasattr(self.model_manager, "active_browsers"):
                browser_count = len(self.model_manager.active_browsers)
            elif hasattr(self.model_manager, "browser_managers"):
                browser_count = len(self.model_manager.browser_managers)
            elif "browser_shards" in status:
                browser_count = len(status["browser_shards"])
            elif hasattr(self.model_manager, "browser_shards"):
                browser_count = len(self.model_manager.browser_shards)
            
            if not browser_count or browser_count <= 0:
                return None
                
            return random.randint(0, browser_count - 1)
            
        except Exception as e:
            self.logger.error(f"Error getting random browser index: {e}")
            return 0  # Fallback to first browser
    
    async def _get_multiple_browser_indices(self, count: int) -> List[int]:
        """
        Get multiple browser indices to target for failure.
        
        Args:
            count: Number of browser indices to return
            
        Returns:
            List of browser indices
        """
        try:
            status = await self._get_manager_metrics()
            
            # Try different ways to get browser count
            browser_count = None
            
            if "active_browsers" in status:
                browser_count = len(status["active_browsers"])
            elif hasattr(self.model_manager, "active_browsers"):
                browser_count = len(self.model_manager.active_browsers)
            elif hasattr(self.model_manager, "browser_managers"):
                browser_count = len(self.model_manager.browser_managers)
            
            if not browser_count or browser_count <= 0:
                return []
            
            # Limit count to available browsers
            count = min(count, browser_count)
            
            # Get random indices without repeats
            indices = random.sample(range(browser_count), count)
            return indices
            
        except Exception as e:
            self.logger.error(f"Error getting multiple browser indices: {e}")
            return [0] if count > 0 else []  # Fallback to first browser
    
    async def _monitor_recovery(self, scenario: str, failure_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Monitor recovery process after inducing failure.
        
        Args:
            scenario: The failure scenario that was induced
            failure_result: Result of failure induction
            
        Returns:
            Dictionary with recovery details
        """
        recovery_result = {
            "scenario": scenario,
            "recovered": False,
            "start_time": datetime.datetime.now().isoformat(),
            "recovery_steps": [],
            "recovery_actions": {}
        }
        
        try:
            # Determine how long to monitor based on scenario complexity
            if scenario in ["multi_browser_failure", "cascade_failure", "staggered_failure"]:
                max_recovery_time = 10.0  # seconds
            else:
                max_recovery_time = 5.0  # seconds
            
            # Set polling interval
            poll_interval = 0.1  # seconds
            
            # Monitor recovery by polling status
            start_time = time.time()
            recovery_complete = False
            recovery_steps = []
            
            # Based on scenario, determine what to wait for
            if scenario == "connection_lost":
                browser_index = failure_result.get("browser_index")
                browser = failure_result.get("browser")
                
                while time.time() - start_time < max_recovery_time and not recovery_complete:
                    current_state = await self._capture_system_state()
                    
                    # Check if recovery happened
                    recovery_happened = False
                    
                    # Check if browser was reconnected
                    if browser and hasattr(self.model_manager, "active_browsers"):
                        if browser in self.model_manager.active_browsers:
                            recovery_happened = True
                    
                    # Check metrics for recovery events
                    metrics = current_state.get("metrics", {})
                    if "recovery_events" in metrics:
                        recovery_events = metrics["recovery_events"]
                        # Look for connection recovery events
                        for event in recovery_events:
                            if event.get("type") == "connection_recovery":
                                recovery_steps.append(event)
                                recovery_happened = True
                    
                    if recovery_happened:
                        recovery_complete = True
                        break
                    
                    # Wait before polling again
                    await asyncio.sleep(poll_interval)
            
            elif scenario == "browser_crash":
                browser_index = failure_result.get("browser_index")
                browser = failure_result.get("browser")
                
                # For browser crash, check if component relocated or browser restarted
                while time.time() - start_time < max_recovery_time and not recovery_complete:
                    current_state = await self._capture_system_state()
                    
                    # Check for recovery events in metrics
                    metrics = current_state.get("metrics", {})
                    if "recovery_events" in metrics:
                        recovery_events = metrics["recovery_events"]
                        # Look for browser recovery or component relocation events
                        for event in recovery_events:
                            if event.get("type") in ["browser_recovery", "component_relocation"]:
                                recovery_steps.append(event)
                                recovery_complete = True
                                break
                    
                    # Wait before polling again
                    await asyncio.sleep(poll_interval)
            
            elif scenario == "component_timeout":
                browser_index = failure_result.get("browser_index")
                
                # For component timeout, check if operation retried or component relocated
                while time.time() - start_time < max_recovery_time and not recovery_complete:
                    current_state = await self._capture_system_state()
                    
                    # Check for recovery events in metrics
                    metrics = current_state.get("metrics", {})
                    if "recovery_events" in metrics:
                        recovery_events = metrics["recovery_events"]
                        # Look for retry or relocation events
                        for event in recovery_events:
                            if event.get("type") in ["operation_retry", "component_relocation"]:
                                recovery_steps.append(event)
                                recovery_complete = True
                                break
                    
                    # Wait before polling again
                    await asyncio.sleep(poll_interval)
            
            elif scenario == "multi_browser_failure":
                browser_indices = failure_result.get("browser_indices", [])
                
                # For multi-browser failure, recovery is more complex
                while time.time() - start_time < max_recovery_time and not recovery_complete:
                    current_state = await self._capture_system_state()
                    
                    # Check for recovery events in metrics
                    metrics = current_state.get("metrics", {})
                    recovery_count = 0
                    
                    if "recovery_events" in metrics:
                        recovery_events = metrics["recovery_events"]
                        # Look for multiple recovery events
                        for event in recovery_events:
                            if event.get("type") in ["browser_recovery", "component_relocation"]:
                                recovery_steps.append(event)
                                recovery_count += 1
                    
                    # Consider recovered if we have at least as many recovery events as failures
                    if recovery_count >= len(browser_indices):
                        recovery_complete = True
                        break
                    
                    # Wait before polling again
                    await asyncio.sleep(poll_interval)
            
            # Determine if recovery was successful based on collected data
            recovery_result["recovered"] = recovery_complete
            recovery_result["recovery_steps"] = recovery_steps
            recovery_result["recovery_time"] = (time.time() - start_time) * 1000  # ms
            
            # Add metrics about recovery actions
            if recovery_steps:
                action_counts = {}
                for step in recovery_steps:
                    action = step.get("action", "unknown")
                    action_counts[action] = action_counts.get(action, 0) + 1
                
                recovery_result["recovery_actions"] = action_counts
            
            recovery_result["end_time"] = datetime.datetime.now().isoformat()
            return recovery_result
            
        except Exception as e:
            self.logger.error(f"Error monitoring recovery for {scenario}: {e}")
            recovery_result["recovered"] = False
            recovery_result["error"] = str(e)
            recovery_result["end_time"] = datetime.datetime.now().isoformat()
            return recovery_result
    
    async def _verify_integrity(self, pre_failure_state: Dict[str, Any], 
                              post_recovery_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Verify system integrity after recovery.
        
        Args:
            pre_failure_state: System state before failure
            post_recovery_state: System state after recovery
            
        Returns:
            Dictionary with integrity verification results
        """
        result = {
            "integrity_verified": False,
            "checks_passed": [],
            "checks_failed": [],
            "performance_impact": {}
        }
        
        try:
            # Check 1: Model is still operational
            if "status" in post_recovery_state:
                status = post_recovery_state["status"]
                
                if status.get("initialized", False):
                    result["checks_passed"].append("model_operational")
                else:
                    result["checks_failed"].append("model_operational")
            
            # Check 2: All components are accounted for
            pre_components = self._get_component_count(pre_failure_state)
            post_components = self._get_component_count(post_recovery_state)
            
            if post_components >= pre_components:
                result["checks_passed"].append("component_count_match")
            else:
                result["checks_failed"].append("component_count_match")
                result["component_count_details"] = {
                    "pre_failure": pre_components,
                    "post_recovery": post_components
                }
            
            # Check 3: Browser count is appropriate
            pre_browsers = self._get_browser_count(pre_failure_state)
            post_browsers = self._get_browser_count(post_recovery_state)
            
            # Either same number or potentially one more browser for replacement
            if post_browsers >= pre_browsers:
                result["checks_passed"].append("browser_count_appropriate")
            else:
                result["checks_failed"].append("browser_count_appropriate")
                result["browser_count_details"] = {
                    "pre_failure": pre_browsers,
                    "post_recovery": post_browsers
                }
            
            # Check 4: No error state
            if "metrics" in post_recovery_state:
                metrics = post_recovery_state["metrics"]
                
                if not metrics.get("error_state", False):
                    result["checks_passed"].append("no_error_state")
                else:
                    result["checks_failed"].append("no_error_state")
                    result["error_state_details"] = metrics.get("error_state", {})
            
            # Check 5: Verify state integrity if applicable
            if "state_hash" in pre_failure_state and "state_hash" in post_recovery_state:
                pre_hash = pre_failure_state["state_hash"]
                post_hash = post_recovery_state["state_hash"]
                
                if pre_hash == post_hash:
                    result["checks_passed"].append("state_integrity")
                else:
                    # Note: State hash might legitimately change after recovery,
                    # so we don't necessarily count this as a failure
                    result["state_hash_changed"] = True
                    result["state_hash_details"] = {
                        "pre_failure": pre_hash,
                        "post_recovery": post_hash
                    }
            
            # Check 6: Verify browser configuration integrity
            if "browser_allocation" in pre_failure_state and "browser_allocation" in post_recovery_state:
                # Check if critical browsers are still present or properly replaced
                pre_allocation = pre_failure_state["browser_allocation"]
                post_allocation = post_recovery_state["browser_allocation"]
                
                missing_browsers = []
                replaced_browsers = []
                preserved_browsers = []
                
                for browser, allocation in pre_allocation.items():
                    if browser in post_allocation:
                        preserved_browsers.append(browser)
                    else:
                        # Check if this browser's shards were reallocated
                        pre_shards = allocation.get("shards", [])
                        reallocated = True
                        
                        for shard in pre_shards:
                            shard_reallocated = False
                            for post_browser, post_alloc in post_allocation.items():
                                if shard in post_alloc.get("shards", []):
                                    shard_reallocated = True
                                    replaced_browsers.append((browser, post_browser, shard))
                                    break
                            
                            if not shard_reallocated:
                                reallocated = False
                                missing_browsers.append((browser, shard))
                        
                        if not reallocated and missing_browsers:
                            result["checks_failed"].append("browser_reallocation")
                
                if not missing_browsers:
                    result["checks_passed"].append("browser_reallocation")
                    
                result["browser_reallocation_details"] = {
                    "preserved_browsers": preserved_browsers,
                    "replaced_browsers": replaced_browsers,
                    "missing_browsers": missing_browsers
                }
            
            # Check 7: Verify component state integrity
            if "component_states" in pre_failure_state and "component_states" in post_recovery_state:
                pre_states = pre_failure_state["component_states"]
                post_states = post_recovery_state["component_states"]
                
                # Check if all components from pre-failure are present in post-recovery
                missing_components = []
                degraded_components = []
                recovered_components = []
                
                for component, state in pre_states.items():
                    if component not in post_states:
                        missing_components.append(component)
                    elif post_states[component] in ["ready", "recovered"]:
                        recovered_components.append(component)
                    else:
                        degraded_components.append((component, post_states[component]))
                
                if not missing_components and not degraded_components:
                    result["checks_passed"].append("component_state_integrity")
                else:
                    result["checks_failed"].append("component_state_integrity")
                    
                result["component_state_details"] = {
                    "missing_components": missing_components,
                    "degraded_components": degraded_components,
                    "recovered_components": recovered_components
                }
            
            # Check 8: Performance impact assessment
            if "metrics" in pre_failure_state and "metrics" in post_recovery_state:
                pre_metrics = pre_failure_state["metrics"]
                post_metrics = post_recovery_state["metrics"]
                
                # Compare performance metrics before and after recovery
                pre_latency = pre_metrics.get("average_latency_ms", 0)
                post_latency = post_metrics.get("average_latency_ms", 0)
                
                latency_impact = (post_latency - pre_latency) / max(1, pre_latency) * 100
                
                # Performance metrics
                result["performance_impact"] = {
                    "pre_latency_ms": pre_latency,
                    "post_latency_ms": post_latency,
                    "latency_difference_ms": post_latency - pre_latency,
                    "latency_impact_percentage": latency_impact,
                    "acceptable_impact": latency_impact < 50  # Less than 50% slowdown is acceptable
                }
                
                if result["performance_impact"]["acceptable_impact"]:
                    result["checks_passed"].append("performance_impact")
                else:
                    # Performance impact is high, but not a critical failure
                    # Just note it as a warning
                    result["performance_warning"] = f"Performance degraded by {latency_impact:.2f}% after recovery"
            
            # Check 9: Resource utilization
            if "resource_utilization" in pre_failure_state and "resource_utilization" in post_recovery_state:
                pre_util = pre_failure_state["resource_utilization"]
                post_util = post_recovery_state["resource_utilization"]
                
                # Compare memory usage
                pre_memory = pre_util.get("memory_usage_mb", 0)
                post_memory = post_util.get("memory_usage_mb", 0)
                
                memory_impact = (post_memory - pre_memory) / max(1, pre_memory) * 100
                
                result["resource_impact"] = {
                    "pre_memory_mb": pre_memory,
                    "post_memory_mb": post_memory,
                    "memory_difference_mb": post_memory - pre_memory,
                    "memory_impact_percentage": memory_impact,
                    "acceptable_impact": memory_impact < 30  # Less than 30% increase is acceptable
                }
                
                if result["resource_impact"]["acceptable_impact"]:
                    result["checks_passed"].append("resource_impact")
                else:
                    # Memory impact is high, but not a critical failure
                    result["resource_warning"] = f"Memory usage increased by {memory_impact:.2f}% after recovery"
            
            # Check 10: State transition consistency
            if "transactions" in pre_failure_state and "transactions" in post_recovery_state:
                pre_tx = pre_failure_state["transactions"]
                post_tx = post_recovery_state["transactions"]
                
                # Check if all pre-failure transactions are present in post-recovery
                missing_transactions = []
                
                for tx_id in pre_tx:
                    if tx_id not in post_tx:
                        missing_transactions.append(tx_id)
                
                if not missing_transactions:
                    result["checks_passed"].append("transaction_consistency")
                else:
                    result["checks_failed"].append("transaction_consistency")
                    result["transaction_consistency_details"] = {
                        "missing_transactions": missing_transactions,
                        "pre_transaction_count": len(pre_tx),
                        "post_transaction_count": len(post_tx)
                    }
            
            # Determine overall integrity based on critical checks
            critical_checks = ["model_operational", "component_count_match", "no_error_state"]
            
            # For high fault tolerance levels, add more critical checks
            if self.config['fault_tolerance_level'] in ["high", "critical"]:
                critical_checks.extend([
                    "browser_count_appropriate", 
                    "browser_reallocation", 
                    "transaction_consistency"
                ])
            
            # For medium and above, component state integrity is important
            if self.config['fault_tolerance_level'] in ["medium", "high", "critical"]:
                critical_checks.append("component_state_integrity")
            
            # All critical checks must pass
            all_critical_passed = all(check in result["checks_passed"] for check in critical_checks)
            result["integrity_verified"] = all_critical_passed
            
            # Calculate integrity score (percentage of checks passed)
            total_checks = len(result["checks_passed"]) + len(result["checks_failed"])
            if total_checks > 0:
                integrity_score = len(result["checks_passed"]) / total_checks * 100
                result["integrity_score"] = integrity_score
            else:
                result["integrity_score"] = 0
            
            return result
            
        except Exception as e:
            self.logger.error(f"Error verifying integrity: {e}")
            result["integrity_verified"] = False
            result["error"] = str(e)
            return result
    
    def _get_component_count(self, state: Dict[str, Any]) -> int:
        """
        Extract component count from state.
        
        Args:
            state: System state dictionary
            
        Returns:
            Component count or 0 if not found
        """
        # Try different paths to find component count
        if "component_allocation" in state:
            return len(state["component_allocation"])
        
        if "metrics" in state and "component_count" in state["metrics"]:
            return state["metrics"]["component_count"]
        
        if "status" in state and "total_components" in state["status"]:
            return state["status"]["total_components"]
        
        # Default fallback based on shards
        if "status" in state and "total_shards" in state["status"]:
            return state["status"]["total_shards"] * 3  # Estimate: 3 components per shard
        
        return 0
    
    def _get_browser_count(self, state: Dict[str, Any]) -> int:
        """
        Extract browser count from state.
        
        Args:
            state: System state dictionary
            
        Returns:
            Browser count or 0 if not found
        """
        # Try different paths to find browser count
        if "active_browsers" in state:
            return len(state["active_browsers"])
        
        if "browser_allocation" in state:
            return len(state["browser_allocation"])
        
        if "metrics" in state and "browser_count" in state["metrics"]:
            return state["metrics"]["browser_count"]
        
        if "status" in state and "active_browsers_count" in state["status"]:
            return state["status"]["active_browsers_count"]
        
        if "status" in state and "active_browsers" in state["status"]:
            return len(state["status"]["active_browsers"])
        
        return 0
    
    async def _assess_performance_impact(self) -> Dict[str, Any]:
        """
        Assess performance impact of fault tolerance features.
        
        Returns:
            Dictionary with performance impact assessment
        """
        performance_result = {
            "start_time": datetime.datetime.now().isoformat(),
            "measurements": [],
            "summary": {}
        }
        
        try:
            # Skip if we don't have a model input method
            if not hasattr(self, "_get_model_input"):
                return {
                    "error": "No model input method available",
                    "performance_impact_measured": False
                }
            
            # Get model input for testing
            model_input = self._get_model_input()
            
            # Run multiple iterations
            iterations = 5
            inference_times = []
            
            for i in range(iterations):
                start_time = time.time()
                
                try:
                    # Run inference
                    if hasattr(self.model_manager, "run_inference"):
                        result = await self.model_manager.run_inference(model_input)
                    elif hasattr(self.model_manager, "run_inference_sharded"):
                        result = await self.model_manager.run_inference_sharded(model_input)
                    else:
                        return {
                            "error": "No inference method available",
                            "performance_impact_measured": False
                        }
                    
                    inference_time = (time.time() - start_time) * 1000  # ms
                    inference_times.append(inference_time)
                    
                    performance_result["measurements"].append({
                        "iteration": i + 1,
                        "inference_time_ms": inference_time,
                        "has_error": "error" in result
                    })
                    
                except Exception as e:
                    self.logger.error(f"Error during performance assessment iteration {i+1}: {e}")
                    performance_result["measurements"].append({
                        "iteration": i + 1,
                        "error": str(e),
                        "has_error": True
                    })
                
                # Wait briefly between iterations
                await asyncio.sleep(0.1)
            
            # Calculate statistics if we have successful measurements
            successful_times = [m["inference_time_ms"] for m in performance_result["measurements"] 
                              if not m.get("has_error", False)]
            
            if successful_times:
                avg_time = sum(successful_times) / len(successful_times)
                min_time = min(successful_times)
                max_time = max(successful_times)
                
                if len(successful_times) > 1:
                    std_dev = statistics.stdev(successful_times)
                else:
                    std_dev = 0
                
                performance_result["summary"] = {
                    "average_time_ms": avg_time,
                    "min_time_ms": min_time,
                    "max_time_ms": max_time,
                    "std_dev_ms": std_dev,
                    "successful_iterations": len(successful_times),
                    "total_iterations": iterations,
                    "performance_impact_measured": True
                }
            else:
                performance_result["summary"] = {
                    "performance_impact_measured": False,
                    "reason": "no_successful_measurements"
                }
            
            performance_result["end_time"] = datetime.datetime.now().isoformat()
            return performance_result
            
        except Exception as e:
            self.logger.error(f"Error during performance assessment: {e}")
            return {
                "error": str(e),
                "performance_impact_measured": False
            }
    
    def _get_model_input(self) -> Dict[str, Any]:
        """
        Get a test input for the model.
        
        Returns:
            Dictionary with model input
        """
        # Basic input for inference testing
        return {
            "text": "This is a test input for fault tolerance validation.",
            "max_length": 20,
            "temperature": 0.7
        }
    
    def _calculate_validation_status(self, validation_results: Dict[str, Any]) -> str:
        """
        Calculate overall validation status based on test results.
        
        Args:
            validation_results: Dictionary with validation results
            
        Returns:
            Validation status string
        """
        # If basic validation failed, overall validation failed
        if not validation_results.get("basic_validation", {}).get("success", False):
            return "failed"
        
        # Check scenario results
        scenario_results = validation_results.get("scenario_results", {})
        
        # Count successes/failures
        total_scenarios = len(scenario_results)
        successful_scenarios = sum(1 for result in scenario_results.values() if result.get("success", False))
        critical_scenarios = sum(1 for scenario in scenario_results.keys() 
                               if scenario in ["browser_crash", "multi_browser_failure"])
        successful_critical = sum(1 for scenario, result in scenario_results.items()
                                if scenario in ["browser_crash", "multi_browser_failure"] 
                                and result.get("success", False))
        
        # Calculate success rates
        overall_success_rate = successful_scenarios / total_scenarios if total_scenarios > 0 else 0
        critical_success_rate = successful_critical / critical_scenarios if critical_scenarios > 0 else 0
        
        # Determine status based on success rates
        if overall_success_rate >= 0.9 and critical_success_rate == 1.0:
            return "passed"
        elif overall_success_rate >= 0.7 and critical_success_rate >= 0.5:
            return "warning"
        else:
            return "failed"
    
    def analyze_results(self, validation_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze validation results to provide insights.
        
        Args:
            validation_results: Dictionary with validation results
            
        Returns:
            Dictionary with analysis insights
        """
        analysis = {
            "validation_status": validation_results.get("validation_status", "unknown"),
            "strengths": [],
            "weaknesses": [],
            "recommendations": []
        }
        
        try:
            # Extract key metrics
            scenario_results = validation_results.get("scenario_results", {})
            recovery_times = []
            
            for scenario, result in scenario_results.items():
                if result.get("success", False) and "recovery_time_ms" in result:
                    recovery_times.append((scenario, result["recovery_time_ms"]))
            
            # Calculate average recovery time
            if recovery_times:
                avg_recovery_time = sum(time for _, time in recovery_times) / len(recovery_times)
                analysis["avg_recovery_time_ms"] = avg_recovery_time
                
                # Identify fastest/slowest recovery scenarios
                fastest = min(recovery_times, key=lambda x: x[1])
                slowest = max(recovery_times, key=lambda x: x[1])
                
                analysis["fastest_recovery"] = {
                    "scenario": fastest[0],
                    "time_ms": fastest[1]
                }
                
                analysis["slowest_recovery"] = {
                    "scenario": slowest[0],
                    "time_ms": slowest[1]
                }
            
            # Analyze performance impact
            if "performance_impact" in validation_results:
                perf_impact = validation_results["performance_impact"]
                if "summary" in perf_impact and perf_impact["summary"].get("performance_impact_measured", False):
                    analysis["performance_impact_summary"] = perf_impact["summary"]
            
            # Identify strengths
            if validation_results.get("validation_status", "") == "passed":
                analysis["strengths"].append("Overall fault tolerance implementation is robust")
            
            basic_validation = validation_results.get("basic_validation", {})
            if basic_validation.get("success", False):
                analysis["strengths"].append("Core fault tolerance capabilities are properly implemented")
            
            # Add strength for each successful critical scenario
            for scenario in ["browser_crash", "multi_browser_failure"]:
                if scenario in scenario_results and scenario_results[scenario].get("success", False):
                    analysis["strengths"].append(f"Successfully handles {scenario.replace('_', ' ')} scenarios")
            
            # Identify weaknesses
            failed_scenarios = []
            for scenario, result in scenario_results.items():
                if not result.get("success", False):
                    failed_scenarios.append(scenario)
                    analysis["weaknesses"].append(f"Fails to properly recover from {scenario.replace('_', ' ')} scenarios")
            
            if "performance_impact_summary" in analysis:
                perf_summary = analysis["performance_impact_summary"]
                if perf_summary.get("average_time_ms", 0) > 500:  # Threshold could be adjusted
                    analysis["weaknesses"].append("Fault tolerance features add significant performance overhead")
            
            # Generate recommendations
            if failed_scenarios:
                analysis["recommendations"].append("Improve recovery mechanisms for: " + 
                                                 ", ".join([s.replace("_", " ") for s in failed_scenarios]))
            
            if "performance_impact_summary" in analysis:
                perf_summary = analysis["performance_impact_summary"]
                if perf_summary.get("std_dev_ms", 0) > 100:  # High variability
                    analysis["recommendations"].append("Reduce performance variability in recovery operations")
            
            # Add fault tolerance level specific recommendations
            if self.config['fault_tolerance_level'] == "low":
                analysis["recommendations"].append("Consider upgrading to medium fault tolerance level for better recovery")
            elif self.config['fault_tolerance_level'] == "medium":
                if "browser_crash" in scenario_results and not scenario_results["browser_crash"].get("success", False):
                    analysis["recommendations"].append("Implement more robust browser crash recovery mechanisms")
            
            # Add recovery strategy recommendations
            if self.config['recovery_strategy'] == "simple" and "multi_browser_failure" in failed_scenarios:
                analysis["recommendations"].append("Upgrade to progressive or coordinated recovery strategy for multiple failures")
            
            return analysis
            
        except Exception as e:
            self.logger.error(f"Error analyzing validation results: {e}")
            return {
                "error": str(e),
                "validation_status": validation_results.get("validation_status", "unknown")
            }


class MetricsCollector:
    """
    Collects and analyzes metrics from fault tolerance validation tests.
    """
    
    def __init__(self):
        """Initialize the metrics collector."""
        self.scenario_metrics = {}
        self.recovery_metrics = {}
        self.overall_metrics = {
            "scenarios_tested": 0,
            "successful_scenarios": 0,
            "total_recovery_time_ms": 0,
            "avg_recovery_time_ms": 0,
            "recovery_success_rate": 0
        }
        self.logger = logger
    
    def collect_scenario_metrics(self, scenario: str, result: Dict[str, Any]) -> None:
        """
        Collect metrics from a scenario test result.
        
        Args:
            scenario: The failure scenario that was tested
            result: Result dictionary from the scenario test
        """
        self.scenario_metrics[scenario] = result.get("metrics", {})
        
        # Update overall metrics
        self.overall_metrics["scenarios_tested"] += 1
        
        if result.get("success", False):
            self.overall_metrics["successful_scenarios"] += 1
        
        # Update recovery time metrics
        recovery_time = result.get("recovery_time_ms", 0)
        self.overall_metrics["total_recovery_time_ms"] += recovery_time
        
        # Update recovery actions
        recovery_actions = result.get("recovery_result", {}).get("recovery_actions", {})
        for action, count in recovery_actions.items():
            if action not in self.recovery_metrics:
                self.recovery_metrics[action] = 0
            self.recovery_metrics[action] += count
        
        # Update average recovery time
        if self.overall_metrics["scenarios_tested"] > 0:
            self.overall_metrics["avg_recovery_time_ms"] = (
                self.overall_metrics["total_recovery_time_ms"] / 
                self.overall_metrics["scenarios_tested"]
            )
        
        # Update success rate
        if self.overall_metrics["scenarios_tested"] > 0:
            self.overall_metrics["recovery_success_rate"] = (
                self.overall_metrics["successful_scenarios"] / 
                self.overall_metrics["scenarios_tested"]
            )
    
    def get_recovery_metrics(self) -> Dict[str, Any]:
        """
        Get detailed recovery metrics.
        
        Returns:
            Dictionary with recovery metrics
        """
        # Combine basic recovery metrics with more detailed analysis
        metrics = self.recovery_metrics.copy()
        
        # Add aggregated metrics
        metrics["total_recovery_actions"] = sum(metrics.values())
        
        # Calculate recovery action distribution
        if metrics["total_recovery_actions"] > 0:
            metrics["action_distribution"] = {
                action: count / metrics["total_recovery_actions"]
                for action, count in self.recovery_metrics.items()
            }
        else:
            metrics["action_distribution"] = {}
        
        # Add recovery success metrics
        metrics["recovery_success_rate"] = self.overall_metrics["recovery_success_rate"]
        metrics["avg_recovery_time_ms"] = self.overall_metrics["avg_recovery_time_ms"]
        
        return metrics
    
    def get_overall_metrics(self) -> Dict[str, Any]:
        """
        Get overall validation metrics.
        
        Returns:
            Dictionary with overall metrics
        """
        return self.overall_metrics