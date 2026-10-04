#!/usr/bin/env python3
"""
Browser CPU Core Detection for Web Platform (July 2025)

This module provides dynamic thread management based on available browser CPU resources:
- Runtime CPU core detection for optimal thread allocation
- Adaptive thread pool sizing for different device capabilities
- Priority-based task scheduling for multi-threaded inference
- Background processing capabilities with idle detection
- Coordination between CPU and GPU resources
- Worker thread management for parallel processing

Usage:
    from fixed_web_platform.browser_cpu_detection import (
        BrowserCPUDetector,
        create_thread_pool,
        optimize_workload_for_cores,
        get_optimal_thread_distribution
    )
    
    # Create detector and get CPU capabilities
    detector = BrowserCPUDetector()
    capabilities = detector.get_capabilities()
    
    # Create optimized thread pool
    thread_pool = create_thread_pool(
        core_count=capabilities["effective_cores"],
        scheduler_type="priority"
    )
    
    # Get optimal workload for available cores
    workload = optimize_workload_for_cores(
        core_count=capabilities["effective_cores"],
        model_size="medium"
    )
"""

import os
import sys
import json
import time
import math
import logging
import platform
import threading
from typing import Dict, List, Any, Optional, Union, Tuple, Callable

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class BrowserCPUDetector:
    """
    Detects browser CPU capabilities and optimizes thread usage.
    """
    
    def __init__(self, simulate_browser: bool = True):
        """
        Initialize the browser CPU detector.
        
        Args:
            simulate_browser: Whether to simulate browser environment (for testing)
        """
        self.simulate_browser = simulate_browser
        
        # Detect CPU capabilities
        self.capabilities = self._detect_cpu_capabilities()
        
        # Initialize thread pool configuration
        self.thread_pool_config = self._create_thread_pool_config()
        
        # Monitoring state
        self.monitoring_state = {
            "is_monitoring": False,
            "monitoring_interval_ms": 500,
            "thread_usage": [],
            "performance_data": {},
            "bottleneck_detected": False,
            "last_update_time": time.time()
        }
        
        logger.info(f"Browser CPU detection initialized with {self.capabilities['detected_cores']} cores " +
                   f"({self.capabilities['effective_cores']} effective)")
    
    def _detect_cpu_capabilities(self) -> Dict[str, Any]:
        """
        Detect CPU capabilities including core count and threading support.
        
        Returns:
            Dictionary of CPU capabilities
        """
        # Base capabilities
        capabilities = {
            "detected_cores": self._detect_core_count(),
            "effective_cores": 0,  # Will be calculated
            "logical_processors": self._detect_logical_processors(),
            "main_thread_available": True,
            "worker_threads_supported": True,
            "shared_array_buffer_supported": self._detect_shared_array_buffer_support(),
            "background_processing": self._detect_background_processing_support(),
            "thread_priorities_supported": False,
            "simd_supported": self._detect_simd_support(),
            "browser_limits": {}
        }
        
        # Detect browser-specific limitations
        browser_name = self._detect_browser_name()
        browser_version = self._detect_browser_version()
        
        # Apply browser-specific limitations
        if browser_name == "safari":
            # Safari has more conservative thread limits
            capabilities["browser_limits"] = {
                "max_workers": min(4, capabilities["detected_cores"]),
                "concurrent_tasks": 4,
                "worker_priorities": False
            }
            capabilities["thread_priorities_supported"] = False
            
        elif browser_name == "firefox":
            # Firefox has good worker support
            capabilities["browser_limits"] = {
                "max_workers": capabilities["detected_cores"] + 2,  # Firefox can handle more workers
                "concurrent_tasks": capabilities["detected_cores"] * 2,
                "worker_priorities": True
            }
            capabilities["thread_priorities_supported"] = True
            
        elif browser_name in ["chrome", "edge"]:
            # Chrome/Edge have excellent worker support
            capabilities["browser_limits"] = {
                "max_workers": capabilities["detected_cores"] * 2,  # Chrome can handle more workers
                "concurrent_tasks": capabilities["detected_cores"] * 3,
                "worker_priorities": True
            }
            capabilities["thread_priorities_supported"] = True
            
        else:
            # Default conservative limits for unknown browsers
            capabilities["browser_limits"] = {
                "max_workers": max(2, capabilities["detected_cores"] // 2),
                "concurrent_tasks": capabilities["detected_cores"],
                "worker_priorities": False
            }
        
        # Calculate effective cores (cores we should actually use)
        # This accounts for browser limitations and system load
        system_load = self._detect_system_load()
        if system_load > 0.8:  # High system load
            # Be more conservative with core usage
            capabilities["effective_cores"] = max(1, capabilities["detected_cores"] // 2)
        else:
            # Use most of the cores, but leave some for system
            capabilities["effective_cores"] = max(1, int(capabilities["detected_cores"] * 0.8))
        
        # Cap effective cores based on browser limits
        capabilities["effective_cores"] = min(
            capabilities["effective_cores"],
            capabilities["browser_limits"]["max_workers"]
        )
        
        # Check for background mode
        is_background = self._detect_background_mode()
        if is_background:
            # Reduce core usage in background
            capabilities["effective_cores"] = max(1, capabilities["effective_cores"] // 2)
            capabilities["background_mode"] = True
        else:
            capabilities["background_mode"] = False
        
        # Check for throttling (e.g., battery saving mode)
        is_throttled = self._detect_throttling()
        if is_throttled:
            # Reduce core usage when throttled
            capabilities["effective_cores"] = max(1, capabilities["effective_cores"] // 2)
            capabilities["throttled"] = True
        else:
            capabilities["throttled"] = False
        
        return capabilities
    
    def _detect_core_count(self) -> int:
        """
        Detect the number of CPU cores.
        
        Returns:
            Number of CPU cores
        """
        # Check for environment variable for testing
        test_cores = os.environ.get("TEST_CPU_CORES", "")
        if test_cores:
            try:
                return max(1, int(test_cores))
            except (ValueError, TypeError):
                pass
        
        # In a real browser environment, this would use navigator.hardwareConcurrency
        # For testing, use os.cpu_count()
        detected_cores = os.cpu_count() or 4
        
        # For simulation, cap between 2 and 16 cores for realistic browser scenarios
        if self.simulate_browser:
            return max(2, min(detected_cores, 16))
        
        return detected_cores
    
    def _detect_logical_processors(self) -> int:
        """
        Detect the number of logical processors (including hyperthreading).
        
        Returns:
            Number of logical processors
        """
        # In a real browser environment, this would use more detailed detection
        # For testing, assume logical processors = physical cores * 2 if likely hyperthreaded
        
        # Check for environment variable for testing
        test_logical = os.environ.get("TEST_LOGICAL_PROCESSORS", "")
        if test_logical:
            try:
                return max(1, int(test_logical))
            except (ValueError, TypeError):
                pass
        
        core_count = self._detect_core_count()
        
        # Heuristic: if core count is at least 4 and even, likely has hyperthreading
        if core_count >= 4 and core_count % 2 == 0:
            return core_count  # core_count already includes logical processors
        else:
            return core_count  # Just return the same as physical
    
    def _detect_shared_array_buffer_support(self) -> bool:
        """
        Detect support for SharedArrayBuffer (needed for shared memory parallelism).
        
        Returns:
            Boolean indicating support
        """
        # Check for environment variable for testing
        test_sab = os.environ.get("TEST_SHARED_ARRAY_BUFFER", "").lower()
        if test_sab in ["true", "1", "yes"]:
            return True
        elif test_sab in ["false", "0", "no"]:
            return False
        
        # In a real browser, we would check for SharedArrayBuffer
        # For testing, assume it's supported in modern browsers
        browser_name = self._detect_browser_name()
        browser_version = self._detect_browser_version()
        
        if browser_name == "safari" and browser_version < 15.2:
            return False
        elif browser_name == "firefox" and browser_version < 79:
            return False
        elif browser_name in ["chrome", "edge"] and browser_version < 92:
            return False
        
        return True
    
    def _detect_background_processing_support(self) -> bool:
        """
        Detect support for background processing.
        
        Returns:
            Boolean indicating support
        """
        # Check for environment variable for testing
        test_bg = os.environ.get("TEST_BACKGROUND_PROCESSING", "").lower()
        if test_bg in ["true", "1", "yes"]:
            return True
        elif test_bg in ["false", "0", "no"]:
            return False
        
        # In a real browser, we would check for requestIdleCallback and Background Tasks
        browser_name = self._detect_browser_name()
        
        # Safari has limited background processing support
        if browser_name == "safari":
            return False
        
        return True
    
    def _detect_simd_support(self) -> bool:
        """
        Detect support for SIMD (Single Instruction, Multiple Data).
        
        Returns:
            Boolean indicating support
        """
        # Check for environment variable for testing
        test_simd = os.environ.get("TEST_SIMD", "").lower()
        if test_simd in ["true", "1", "yes"]:
            return True
        elif test_simd in ["false", "0", "no"]:
            return False
        
        # In a real browser, we would check for WebAssembly SIMD
        browser_name = self._detect_browser_name()
        browser_version = self._detect_browser_version()
        
        if browser_name == "safari" and browser_version < 16.4:
            return False
        elif browser_name == "firefox" and browser_version < 89:
            return False
        elif browser_name in ["chrome", "edge"] and browser_version < 91:
            return False
        
        return True
    
    def _detect_browser_name(self) -> str:
        """
        Detect browser name.
        
        Returns:
            Browser name (chrome, firefox, safari, edge, or unknown)
        """
        # Check for environment variable for testing
        test_browser = os.environ.get("TEST_BROWSER", "").lower()
        if test_browser in ["chrome", "firefox", "safari", "edge"]:
            return test_browser
        
        # Default to chrome for testing
        return "chrome"
    
    def _detect_browser_version(self) -> float:
        """
        Detect browser version.
        
        Returns:
            Browser version as a float
        """
        # Check for environment variable for testing
        test_version = os.environ.get("TEST_BROWSER_VERSION", "")
        if test_version:
            try:
                return float(test_version)
            except (ValueError, TypeError):
                pass
        
        # Default to latest version for testing
        browser_name = self._detect_browser_name()
        
        if browser_name == "chrome":
            return 115.0
        elif browser_name == "firefox":
            return 118.0
        elif browser_name == "safari":
            return 17.0
        elif browser_name == "edge":
            return 115.0
        
        return 1.0  # Unknown browser, default version
    
    def _detect_system_load(self) -> float:
        """
        Detect system load (0.0 to 1.0).
        
        Returns:
            System load as a float between 0.0 and 1.0
        """
        # Check for environment variable for testing
        test_load = os.environ.get("TEST_SYSTEM_LOAD", "")
        if test_load:
            try:
                return max(0.0, min(1.0, float(test_load)))
            except (ValueError, TypeError):
                pass
        
        # In a real browser, we would use performance metrics
        # For testing, return a moderate load
        return 0.3
    
    def _detect_background_mode(self) -> bool:
        """
        Detect if the app is running in background mode.
        
        Returns:
            Boolean indicating background mode
        """
        # Check for environment variable for testing
        test_bg = os.environ.get("TEST_BACKGROUND_MODE", "").lower()
        if test_bg in ["true", "1", "yes"]:
            return True
        elif test_bg in ["false", "0", "no"]:
            return False
        
        # In a real browser, we would use Page Visibility API
        return False  # Default to foreground
    
    def _detect_throttling(self) -> bool:
        """
        Detect if CPU is being throttled (e.g. power saving mode).
        
        Returns:
            Boolean indicating throttling
        """
        # Check for environment variable for testing
        test_throttle = os.environ.get("TEST_CPU_THROTTLING", "").lower()
        if test_throttle in ["true", "1", "yes"]:
            return True
        elif test_throttle in ["false", "0", "no"]:
            return False
        
        # In a real browser, we would use performance metrics and navigator.getBattery()
        # For testing, assume not throttled
        return False
    
    def _create_thread_pool_config(self) -> Dict[str, Any]:
        """
        Create thread pool configuration based on detected capabilities.
        
        Returns:
            Dictionary with thread pool configuration
        """
        effective_cores = self.capabilities["effective_cores"]
        
        # Base configuration
        config = {
            "max_threads": effective_cores,
            "min_threads": 1,
            "scheduler_type": "priority" if self.capabilities["thread_priorities_supported"] else "round-robin",
            "worker_distribution": self._calculate_worker_distribution(effective_cores),
            "task_chunking": True,
            "chunk_size_ms": 5,
            "background_processing": self.capabilities["background_processing"],
            "simd_enabled": self.capabilities["simd_supported"],
            "shared_memory_enabled": self.capabilities["shared_array_buffer_supported"]
        }
        
        # Add browser-specific optimizations
        browser_name = self._detect_browser_name()
        
        if browser_name == "safari":
            # Safari needs smaller chunk sizes
            config["chunk_size_ms"] = 3
            
        elif browser_name == "firefox":
            # Firefox has excellent JS engine for certain workloads
            config["max_concurrent_math_ops"] = effective_cores * 2
            
        elif browser_name in ["chrome", "edge"]:
            # Chrome/Edge have good worker adoption
            config["worker_warmup"] = True
            config["max_concurrent_math_ops"] = effective_cores * 3
        
        # Adjust for background mode
        if self.capabilities.get("background_mode", False):
            config["chunk_size_ms"] = 10  # Larger chunks in background
            config["scheduler_type"] = "yield-friendly"  # More yield points
            config["background_priority"] = "low"
        
        return config
    
    def _calculate_worker_distribution(self, core_count: int) -> Dict[str, int]:
        """
        Calculate optimal worker thread distribution.
        
        Args:
            core_count: Number of available cores
            
        Returns:
            Dictionary with worker distribution
        """
        # Basic distribution strategy:
        # - At least 1 worker for compute-intensive tasks
        # - At least 1 worker for I/O operations
        # - The rest distributed based on common workloads
        
        if core_count <= 2:
            # Minimal distribution for 1-2 cores
            return {
                "compute": 1,
                "io": 1,
                "utility": 0
            }
        elif core_count <= 4:
            # Distribution for 3-4 cores
            return {
                "compute": core_count - 1,
                "io": 1,
                "utility": 0
            }
        else:
            # Distribution for 5+ cores
            utility = max(1, int(core_count * 0.2))  # 20% for utility
            io = max(1, int(core_count * 0.2))       # 20% for I/O
            compute = core_count - utility - io      # Rest for compute
            
            return {
                "compute": compute,
                "io": io,
                "utility": utility
            }
    
    def get_capabilities(self) -> Dict[str, Any]:
        """
        Get detected CPU capabilities.
        
        Returns:
            Dictionary with CPU capabilities
        """
        return self.capabilities
    
    def get_thread_pool_config(self) -> Dict[str, Any]:
        """
        Get thread pool configuration.
        
        Returns:
            Dictionary with thread pool configuration
        """
        return self.thread_pool_config
    
    def update_capabilities(self, **kwargs) -> None:
        """
        Update capabilities with new values (e.g., when environment changes).
        
        Args:
            **kwargs: New capability values
        """
        # Update capabilities
        updated = False
        for key, value in kwargs.items():
            if key in self.capabilities:
                self.capabilities[key] = value
                updated = True
        
        # Update thread pool config if needed
        if updated:
            self.thread_pool_config = self._create_thread_pool_config()
            
            logger.info(f"CPU capabilities updated. Effective cores: {self.capabilities['effective_cores']}, " +
                      f"Thread pool: {self.thread_pool_config['max_threads']}")
    
    def simulate_environment_change(self, scenario: str) -> None:
        """
        Simulate an environment change to test adaptation.
        
        Args:
            scenario: Environment change scenario (background, foreground, throttled, etc.)
        """
        if scenario == "background":
            # Simulate going to background
            os.environ["TEST_BACKGROUND_MODE"] = "true"
            os.environ["TEST_SYSTEM_LOAD"] = "0.2"  # Lower load in background
            
            # Update capabilities
            self.capabilities = self._detect_cpu_capabilities()
            self.thread_pool_config = self._create_thread_pool_config()
            
            logger.info("Simulated background mode. " +
                      f"Effective cores: {self.capabilities['effective_cores']}")
            
        elif scenario == "foreground":
            # Simulate returning to foreground
            os.environ["TEST_BACKGROUND_MODE"] = "false"
            os.environ["TEST_SYSTEM_LOAD"] = "0.3"  # Normal load
            
            # Update capabilities
            self.capabilities = self._detect_cpu_capabilities()
            self.thread_pool_config = self._create_thread_pool_config()
            
            logger.info("Simulated foreground mode. " +
                      f"Effective cores: {self.capabilities['effective_cores']}")
            
        elif scenario == "throttled":
            # Simulate CPU throttling
            os.environ["TEST_CPU_THROTTLING"] = "true"
            os.environ["TEST_SYSTEM_LOAD"] = "0.7"  # Higher load when throttled
            
            # Update capabilities
            self.capabilities = self._detect_cpu_capabilities()
            self.thread_pool_config = self._create_thread_pool_config()
            
            logger.info("Simulated CPU throttling. " +
                      f"Effective cores: {self.capabilities['effective_cores']}")
            
        elif scenario == "high_load":
            # Simulate high system load
            os.environ["TEST_SYSTEM_LOAD"] = "0.9"
            
            # Update capabilities
            self.capabilities = self._detect_cpu_capabilities()
            self.thread_pool_config = self._create_thread_pool_config()
            
            logger.info("Simulated high system load. " +
                      f"Effective cores: {self.capabilities['effective_cores']}")
            
        elif scenario == "low_load":
            # Simulate low system load
            os.environ["TEST_SYSTEM_LOAD"] = "0.2"
            
            # Update capabilities
            self.capabilities = self._detect_cpu_capabilities()
            self.thread_pool_config = self._create_thread_pool_config()
            
            logger.info("Simulated low system load. " +
                      f"Effective cores: {self.capabilities['effective_cores']}")
    
    def start_monitoring(self, interval_ms: int = 500) -> None:
        """
        Start monitoring CPU usage and thread performance.
        
        Args:
            interval_ms: Monitoring interval in milliseconds
        """
        if self.monitoring_state["is_monitoring"]:
            return  # Already monitoring
        
        # Initialize monitoring state
        self.monitoring_state = {
            "is_monitoring": True,
            "monitoring_interval_ms": interval_ms,
            "thread_usage": [],
            "performance_data": {
                "thread_utilization": [],
                "task_completion_times": [],
                "idle_periods": []
            },
            "bottleneck_detected": False,
            "last_update_time": time.time()
        }
        
        # In a real implementation, this would spawn a monitoring thread
        logger.info(f"Started CPU monitoring with interval {interval_ms}ms")
    
    def stop_monitoring(self) -> Dict[str, Any]:
        """
        Stop monitoring and return performance data.
        
        Returns:
            Dictionary with monitoring results
        """
        if not self.monitoring_state["is_monitoring"]:
            return {}  # Not monitoring
        
        # Update monitoring state
        self.monitoring_state["is_monitoring"] = False
        
        # Generate summary
        summary = {
            "monitoring_duration_sec": time.time() - self.monitoring_state["last_update_time"],
            "performance_data": self.monitoring_state["performance_data"],
            "bottleneck_detected": self.monitoring_state["bottleneck_detected"],
            "recommendations": self._generate_recommendations()
        }
        
        logger.info("Stopped CPU monitoring")
        return summary
    
    def _generate_recommendations(self) -> List[str]:
        """
        Generate recommendations based on monitoring data.
        
        Returns:
            List of recommendation strings
        """
        recommendations = []
        
        # In a real implementation, this would analyze the collected data
        # For this simulation, return some example recommendations
        if self.capabilities["effective_cores"] < self.capabilities["detected_cores"]:
            recommendations.append(f"Consider increasing thread count from {self.capabilities['effective_cores']} " +
                                 f"to {min(self.capabilities['detected_cores'], self.capabilities['effective_cores'] + 2)}")
        
        if not self.capabilities["shared_array_buffer_supported"]:
            recommendations.append("Enable SharedArrayBuffer for better parallel performance")
        
        if self.thread_pool_config["chunk_size_ms"] < 5:
            recommendations.append("Increase task chunk size for better CPU utilization")
        
        browser_name = self._detect_browser_name()
        if browser_name == "safari" and self.capabilities["effective_cores"] > 2:
            recommendations.append("Safari has limited worker performance, consider reducing worker count")
        
        return recommendations
    
    def get_optimal_thread_config(self, workload_type: str) -> Dict[str, Any]:
        """
        Get optimal thread configuration for a specific workload type.
        
        Args:
            workload_type: Type of workload (inference, training, embedding, etc.)
            
        Returns:
            Dictionary with thread configuration
        """
        effective_cores = self.capabilities["effective_cores"]
        
        # Base configuration from thread pool
        config = self.thread_pool_config.copy()
        
        # Adjust based on workload type
        if workload_type == "inference":
            # Inference can use more threads for compute
            config["worker_distribution"] = {
                "compute": max(1, int(effective_cores * 0.7)),  # 70% for compute
                "io": max(1, int(effective_cores * 0.2)),       # 20% for I/O
                "utility": max(0, effective_cores - int(effective_cores * 0.7) - max(1, int(effective_cores * 0.2)))
            }
            
        elif workload_type == "training":
            # Training needs balanced distribution
            config["worker_distribution"] = {
                "compute": max(1, int(effective_cores * 0.6)),  # 60% for compute
                "io": max(1, int(effective_cores * 0.3)),       # 30% for I/O
                "utility": max(0, effective_cores - int(effective_cores * 0.6) - max(1, int(effective_cores * 0.3)))
            }
            
        elif workload_type == "embedding":
            # Embedding is compute-intensive
            config["worker_distribution"] = {
                "compute": max(1, int(effective_cores * 0.8)),  # 80% for compute
                "io": 1,                                        # 1 for I/O
                "utility": max(0, effective_cores - int(effective_cores * 0.8) - 1)
            }
            
        elif workload_type == "preprocessing":
            # Preprocessing is I/O and utility intensive
            config["worker_distribution"] = {
                "compute": max(1, int(effective_cores * 0.3)),  # 30% for compute
                "io": max(1, int(effective_cores * 0.4)),       # 40% for I/O
                "utility": max(0, effective_cores - int(effective_cores * 0.3) - max(1, int(effective_cores * 0.4)))
            }
        
        return config
    
    def estimate_threading_benefit(self, core_count: int, model_size: str) -> Dict[str, Any]:
        """
        Estimate the benefit of using multiple threads for a given model size.
        
        Args:
            core_count: Number of cores to use
            model_size: Size of the model (small, medium, large)
            
        Returns:
            Dictionary with benefit estimation
        """
        # Base estimation
        estimation = {
            "speedup_factor": 1.0,
            "efficiency": 1.0,
            "recommended_cores": 1,
            "bottleneck": None
        }
        
        # Define scaling factors based on model size
        # This is a simplified model - real implementations would be more sophisticated
        if model_size == "small":
            # Small models have limited parallelism
            max_useful_cores = 2
            scaling_factor = 0.6
            parallel_efficiency = 0.7
            
        elif model_size == "medium":
            # Medium models benefit from moderate parallelism
            max_useful_cores = 4
            scaling_factor = 0.8
            parallel_efficiency = 0.8
            
        elif model_size == "large":
            # Large models benefit from high parallelism
            max_useful_cores = 8
            scaling_factor = 0.9
            parallel_efficiency = 0.9
            
        else:
            # Default to medium settings
            max_useful_cores = 4
            scaling_factor = 0.8
            parallel_efficiency = 0.8
        
        # Calculate recommended cores
        # This applies Amdahl's Law in a simplified form
        recommended_cores = min(core_count, max_useful_cores)
        
        # Calculate theoretical speedup using Amdahl's Law
        # S(N) = 1 / ((1 - p) + p/N) where p is parallel portion and N is core count
        parallel_portion = scaling_factor
        sequential_portion = 1 - parallel_portion
        
        # Calculate efficiency loss with more cores
        if core_count <= max_useful_cores:
            efficiency = parallel_efficiency * (1 - ((core_count - 1) * 0.05))
        else:
            # Efficiency drops rapidly beyond max_useful_cores
            efficiency = parallel_efficiency * (1 - ((max_useful_cores - 1) * 0.05) - ((core_count - max_useful_cores) * 0.15))
        
        # Clamp efficiency
        efficiency = max(0.1, min(1.0, efficiency))
        
        # Calculate realistic speedup with efficiency loss
        theoretical_speedup = 1 / (sequential_portion + (parallel_portion / core_count))
        realistic_speedup = 1 + (theoretical_speedup - 1) * efficiency
        
        # Identify bottleneck
        if core_count > max_useful_cores * 1.5:
            bottleneck = "overhead"
        elif sequential_portion > 0.5:
            bottleneck = "sequential_code"
        elif core_count <= 2:
            bottleneck = "parallelism"
        else:
            bottleneck = None
        
        # Update estimation
        estimation["speedup_factor"] = realistic_speedup
        estimation["efficiency"] = efficiency
        estimation["recommended_cores"] = recommended_cores
        estimation["bottleneck"] = bottleneck
        estimation["theoretical_max_speedup"] = 1 / sequential_portion  # Theoretical maximum with infinite cores
        
        return estimation


class ThreadPoolManager:
    """
    Manages a thread pool with priority-based scheduling for the browser environment.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the thread pool manager.
        
        Args:
            config: Thread pool configuration
        """
        self.config = config
        
        # Initialize workers
        self.workers = {
            "compute": [],
            "io": [],
            "utility": []
        }
        
        # Task queues with priorities
        self.task_queues = {
            "high": [],
            "normal": [],
            "low": [],
            "background": []
        }
        
        # Pool statistics
        self.stats = {
            "tasks_completed": 0,
            "tasks_pending": 0,
            "avg_wait_time_ms": 0,
            "avg_execution_time_ms": 0,
            "thread_utilization": 0.0
        }
        
        # Create workers
        self._create_workers()
        
        logger.info(f"Thread pool created with {sum(len(workers) for workers in self.workers.values())} workers")
    
    def _create_workers(self) -> None:
        """
        Create worker threads based on configuration.
        """
        # Create compute workers
        for i in range(self.config["worker_distribution"]["compute"]):
            self.workers["compute"].append({
                "id": f"compute_{i}",
                "type": "compute",
                "status": "idle",
                "current_task": None,
                "completed_tasks": 0,
                "total_execution_time_ms": 0
            })
        
        # Create I/O workers
        for i in range(self.config["worker_distribution"]["io"]):
            self.workers["io"].append({
                "id": f"io_{i}",
                "type": "io",
                "status": "idle",
                "current_task": None,
                "completed_tasks": 0,
                "total_execution_time_ms": 0
            })
        
        # Create utility workers
        for i in range(self.config["worker_distribution"]["utility"]):
            self.workers["utility"].append({
                "id": f"utility_{i}",
                "type": "utility",
                "status": "idle",
                "current_task": None,
                "completed_tasks": 0,
                "total_execution_time_ms": 0
            })
    
    def submit_task(self, task_type: str, priority: str = "normal", task_data: Any = None) -> str:
        """
        Submit a task to the thread pool.
        
        Args:
            task_type: Type of task (compute, io, utility)
            priority: Task priority (high, normal, low, background)
            task_data: Data associated with the task
            
        Returns:
            Task ID
        """
        # Create task
        task_id = f"task_{int(time.time() * 1000)}_{self.stats['tasks_completed'] + self.stats['tasks_pending']}"
        
        task = {
            "id": task_id,
            "type": task_type,
            "priority": priority,
            "data": task_data,
            "status": "queued",
            "submit_time": time.time(),
            "start_time": None,
            "end_time": None,
            "execution_time_ms": None
        }
        
        # Add to appropriate queue
        self.task_queues[priority].append(task)
        
        # Update stats
        self.stats["tasks_pending"] += 1
        
        logger.debug(f"Task {task_id} submitted with priority {priority}")
        
        # In a real implementation, this would trigger task processing
        # For this simulation, just return the task ID
        return task_id
    
    def get_next_task(self) -> Optional[Dict[str, Any]]:
        """
        Get the next task from the queues based on priority.
        
        Returns:
            Next task or None if no tasks are available
        """
        # Check queues in priority order
        for priority in ["high", "normal", "low", "background"]:
            if self.task_queues[priority]:
                # Return the first task in the queue
                task = self.task_queues[priority][0]
                self.task_queues[priority].remove(task)
                
                # Update task status
                task["status"] = "assigned"
                task["start_time"] = time.time()
                
                # Update stats
                self.stats["tasks_pending"] -= 1
                
                return task
        
        return None
    
    def complete_task(self, task_id: str, result: Any = None) -> None:
        """
        Mark a task as completed.
        
        Args:
            task_id: ID of the task to complete
            result: Result of the task
        """
        # Find the worker with this task
        worker = None
        for worker_type, workers in self.workers.items():
            for w in workers:
                if w["current_task"] and w["current_task"]["id"] == task_id:
                    worker = w
                    break
            if worker:
                break
        
        if not worker:
            logger.warning(f"Task {task_id} not found in any worker")
            return
        
        # Update task and worker
        task = worker["current_task"]
        task["status"] = "completed"
        task["end_time"] = time.time()
        task["execution_time_ms"] = (task["end_time"] - task["start_time"]) * 1000
        task["result"] = result
        
        # Update worker stats
        worker["status"] = "idle"
        worker["completed_tasks"] += 1
        worker["total_execution_time_ms"] += task["execution_time_ms"]
        worker["current_task"] = None
        
        # Update pool stats
        self.stats["tasks_completed"] += 1
        
        # Update average execution time (moving average)
        if self.stats["tasks_completed"] == 1:
            self.stats["avg_execution_time_ms"] = task["execution_time_ms"]
        else:
            self.stats["avg_execution_time_ms"] = (
                (self.stats["avg_execution_time_ms"] * (self.stats["tasks_completed"] - 1) + 
                 task["execution_time_ms"]) / self.stats["tasks_completed"]
            )
        
        # Update average wait time (moving average)
        wait_time_ms = (task["start_time"] - task["submit_time"]) * 1000
        if self.stats["tasks_completed"] == 1:
            self.stats["avg_wait_time_ms"] = wait_time_ms
        else:
            self.stats["avg_wait_time_ms"] = (
                (self.stats["avg_wait_time_ms"] * (self.stats["tasks_completed"] - 1) + 
                 wait_time_ms) / self.stats["tasks_completed"]
            )
        
        logger.debug(f"Task {task_id} completed in {task['execution_time_ms']:.2f}ms")
    
    def assign_tasks(self) -> int:
        """
        Assign tasks to idle workers.
        
        Returns:
            Number of tasks assigned
        """
        tasks_assigned = 0
        
        # Find idle workers
        for worker_type, workers in self.workers.items():
            for worker in workers:
                if worker["status"] == "idle":
                    # Get next task
                    task = self.get_next_task()
                    if task:
                        # Check if this worker can handle this task type
                        if task["type"] == worker["type"] or worker["type"] == "utility":
                            # Assign task to worker
                            worker["status"] = "busy"
                            worker["current_task"] = task
                            tasks_assigned += 1
                            
                            logger.debug(f"Task {task['id']} assigned to worker {worker['id']}")
        
        return tasks_assigned
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get thread pool statistics.
        
        Returns:
            Dictionary with thread pool statistics
        """
        # Calculate thread utilization
        total_workers = sum(len(workers) for workers in self.workers.values())
        busy_workers = sum(1 for worker_type, workers in self.workers.items() 
                          for worker in workers if worker["status"] == "busy")
        
        if total_workers > 0:
            self.stats["thread_utilization"] = busy_workers / total_workers
        else:
            self.stats["thread_utilization"] = 0.0
        
        # Add current queue lengths
        self.stats["queue_lengths"] = {
            priority: len(queue) for priority, queue in self.task_queues.items()
        }
        
        # Add worker status counts
        self.stats["worker_status"] = {
            "busy": busy_workers,
            "idle": total_workers - busy_workers,
            "total": total_workers
        }
        
        return self.stats
    
    def shutdown(self) -> Dict[str, Any]:
        """
        Shut down the thread pool.
        
        Returns:
            Final statistics
        """
        # Get final stats
        final_stats = self.get_stats()
        
        # Add additional shutdown statistics
        final_stats["shutdown_time"] = time.time()
        final_stats["total_execution_time_ms"] = sum(
            worker["total_execution_time_ms"] 
            for worker_type, workers in self.workers.items() 
            for worker in workers
        )
        
        logger.info(f"Thread pool shutdown. Completed {final_stats['tasks_completed']} tasks.")
        
        return final_stats


def create_thread_pool(core_count: int, scheduler_type: str = "priority") -> ThreadPoolManager:
    """
    Create a thread pool with the specified number of cores.
    
    Args:
        core_count: Number of cores to use
        scheduler_type: Type of scheduler to use
        
    Returns:
        ThreadPoolManager instance
    """
    # Calculate worker distribution
    if core_count <= 2:
        distribution = {
            "compute": max(1, core_count - 1),
            "io": 1,
            "utility": 0
        }
    elif core_count <= 4:
        distribution = {
            "compute": core_count - 2,
            "io": 1,
            "utility": 1
        }
    else:
        utility = max(1, int(core_count * 0.2))  # 20% for utility
        io = max(1, int(core_count * 0.2))       # 20% for I/O
        compute = core_count - utility - io      # Rest for compute
        
        distribution = {
            "compute": compute,
            "io": io,
            "utility": utility
        }
    
    # Create thread pool configuration
    config = {
        "max_threads": core_count,
        "min_threads": 1,
        "scheduler_type": scheduler_type,
        "worker_distribution": distribution,
        "task_chunking": True,
        "chunk_size_ms": 5,
        "background_processing": True,
        "simd_enabled": True
    }
    
    # Create thread pool
    return ThreadPoolManager(config)


def optimize_workload_for_cores(core_count: int, model_size: str = "medium") -> Dict[str, Any]:
    """
    Get optimal workload parameters for the given core count.
    
    Args:
        core_count: Number of cores to use
        model_size: Size of the model (small, medium, large)
        
    Returns:
        Dictionary with workload parameters
    """
    # Calculate batch size based on core count and model size
    if model_size == "small":
        base_batch_size = 8
    elif model_size == "medium":
        base_batch_size = 4
    else:  # large
        base_batch_size = 2
    
    # Scale batch size based on core count, but with diminishing returns
    if core_count <= 2:
        batch_scale = 1.0
    elif core_count <= 4:
        batch_scale = 1.5
    elif core_count <= 8:
        batch_scale = 2.0
    else:
        batch_scale = 2.5
    
    batch_size = max(1, int(base_batch_size * batch_scale))
    
    # Calculate chunk size based on core count
    # More cores means we can use smaller chunks for better responsiveness
    if core_count <= 2:
        chunk_size = 10  # Larger chunks for fewer cores
    elif core_count <= 4:
        chunk_size = 5
    else:
        chunk_size = 3  # Smaller chunks for many cores
    
    # Create workload parameters
    workload = {
        "batch_size": batch_size,
        "chunk_size_ms": chunk_size,
        "thread_count": core_count,
        "prioritize_main_thread": core_count <= 2,
        "worker_distribution": {
            "compute": max(1, int(core_count * 0.7)),  # 70% for compute
            "io": max(1, int(core_count * 0.2)),       # 20% for I/O
            "utility": max(0, core_count - int(core_count * 0.7) - max(1, int(core_count * 0.2)))
        },
        "scheduler_parameters": {
            "preemption": core_count >= 4,  # Enable preemption for more cores
            "task_priority_levels": 3 if core_count >= 4 else 2,
            "time_slice_ms": 50 if core_count <= 2 else 20
        }
    }
    
    return workload


def get_optimal_thread_distribution(core_count: int, workload_type: str) -> Dict[str, int]:
    """
    Get optimal thread distribution for the given workload type.
    
    Args:
        core_count: Number of cores to use
        workload_type: Type of workload (inference, training, embedding, etc.)
        
    Returns:
        Dictionary with thread distribution
    """
    if workload_type == "inference":
        # Inference is compute-heavy
        compute_factor = 0.7
        io_factor = 0.2
    elif workload_type == "training":
        # Training needs balanced resources
        compute_factor = 0.6
        io_factor = 0.3
    elif workload_type == "embedding":
        # Embedding is very compute-intensive
        compute_factor = 0.8
        io_factor = 0.1
    elif workload_type == "preprocessing":
        # Preprocessing is I/O heavy
        compute_factor = 0.3
        io_factor = 0.5
    else:
        # Default balanced distribution
        compute_factor = 0.6
        io_factor = 0.3
    
    # Calculate distribution
    compute = max(1, int(core_count * compute_factor))
    io = max(1, int(core_count * io_factor))
    
    # Ensure we don't exceed core count
    if compute + io > core_count:
        # Adjust proportionally
        total = compute + io
        compute = max(1, int((compute / total) * core_count))
        io = max(1, int((io / total) * core_count))
        
        # Final adjustment to ensure we don't exceed core count
        if compute + io > core_count:
            io = max(1, io - 1)
    
    # Calculate utility threads with remaining cores
    utility = max(0, core_count - compute - io)
    
    return {
        "compute": compute,
        "io": io,
        "utility": utility
    }


def measure_threading_overhead(core_count: int) -> Dict[str, float]:
    """
    Measure the overhead of using multiple threads.
    
    Args:
        core_count: Number of cores to use
        
    Returns:
        Dictionary with overhead measurements
    """
    # This is a simplified model for simulation purposes
    # In a real implementation, this would perform actual measurements
    
    # Base overhead model
    if core_count <= 2:
        context_switch_ms = 0.1
        communication_overhead_ms = 0.2
    elif core_count <= 4:
        context_switch_ms = 0.15
        communication_overhead_ms = 0.4
    elif core_count <= 8:
        context_switch_ms = 0.2
        communication_overhead_ms = 0.8
    else:
        context_switch_ms = 0.3
        communication_overhead_ms = 1.5
    
    # Total synchronization overhead grows with the square of thread count
    # This models the all-to-all communication pattern
    synchronization_overhead_ms = 0.05 * (core_count * (core_count - 1)) / 2
    
    # Memory contention grows with thread count
    memory_contention_ms = 0.1 * core_count
    
    # Total overhead
    total_overhead_ms = (
        context_switch_ms + 
        communication_overhead_ms + 
        synchronization_overhead_ms + 
        memory_contention_ms
    )
    
    # Overhead per task
    overhead_per_task_ms = total_overhead_ms / core_count
    
    return {
        "context_switch_ms": context_switch_ms,
        "communication_overhead_ms": communication_overhead_ms,
        "synchronization_overhead_ms": synchronization_overhead_ms,
        "memory_contention_ms": memory_contention_ms,
        "total_overhead_ms": total_overhead_ms,
        "overhead_per_task_ms": overhead_per_task_ms,
        "overhead_percent": (overhead_per_task_ms / (10 + overhead_per_task_ms)) * 100  # Assume 10ms task time
    }


if __name__ == "__main__":
    print("Browser CPU Core Detection")
    
    # Create detector
    detector = BrowserCPUDetector()
    
    # Get capabilities
    capabilities = detector.get_capabilities()
    
    print(f"Detected cores: {capabilities['detected_cores']}")
    print(f"Effective cores: {capabilities['effective_cores']}")
    print(f"Worker thread support: {capabilities['worker_threads_supported']}")
    print(f"Shared array buffer: {capabilities['shared_array_buffer_supported']}")
    print(f"SIMD support: {capabilities['simd_supported']}")
    
    # Get thread pool configuration
    thread_pool_config = detector.get_thread_pool_config()
    
    print("\nThread Pool Configuration:")
    print(f"Max threads: {thread_pool_config['max_threads']}")
    print(f"Scheduler type: {thread_pool_config['scheduler_type']}")
    print(f"Worker distribution: {thread_pool_config['worker_distribution']}")
    
    # Test different environmental scenarios
    print("\nTesting different scenarios:")
    
    # Background mode
    detector.simulate_environment_change("background")
    bg_config = detector.get_thread_pool_config()
    print(f"Background mode - Threads: {bg_config['max_threads']}, " +
          f"Chunk size: {bg_config['chunk_size_ms']}ms")
    
    # Foreground mode
    detector.simulate_environment_change("foreground")
    fg_config = detector.get_thread_pool_config()
    print(f"Foreground mode - Threads: {fg_config['max_threads']}, " +
          f"Chunk size: {fg_config['chunk_size_ms']}ms")
    
    # High load
    detector.simulate_environment_change("high_load")
    hl_config = detector.get_thread_pool_config()
    print(f"High load - Threads: {hl_config['max_threads']}, " +
          f"Worker dist: {hl_config['worker_distribution']}")
    
    # Test workload optimization
    print("\nWorkload optimization for different sizes:")
    
    for size in ["small", "medium", "large"]:
        workload = optimize_workload_for_cores(capabilities['effective_cores'], size)
        print(f"{size} model - Batch size: {workload['batch_size']}, " +
              f"Chunk size: {workload['chunk_size_ms']}ms, " +
              f"Worker dist: {workload['worker_distribution']}")
    
    # Test threading benefit estimation
    print("\nThreading benefit estimation:")
    
    for cores in [2, 4, 8]:
        for size in ["small", "large"]:
            benefit = detector.estimate_threading_benefit(cores, size)
            print(f"{cores} cores, {size} model - Speedup: {benefit['speedup_factor']:.2f}x, " +
                  f"Efficiency: {benefit['efficiency']:.2f}, " +
                  f"Recommended: {benefit['recommended_cores']} cores")
    
    # Test thread pool creation
    print("\nCreating thread pool:")
    
    pool = create_thread_pool(capabilities['effective_cores'])
    print(f"Thread pool created with {sum(len(workers) for workers in pool.workers.values())} workers")
    
    # Test task submission
    print("\nSimulating task submission:")
    
    task_id1 = pool.submit_task("compute", "high")
    task_id2 = pool.submit_task("io", "normal")
    task_id3 = pool.submit_task("compute", "low")
    
    print(f"Submitted tasks: {task_id1}, {task_id2}, {task_id3}")
    
    # Assign tasks to workers
    assigned = pool.assign_tasks()
    print(f"Assigned {assigned} tasks to workers")
    
    # Complete a task
    pool.complete_task(task_id1)
    
    # Get stats
    stats = pool.get_stats()
    print(f"Pool stats - Completed: {stats['tasks_completed']}, " +
          f"Pending: {stats['tasks_pending']}, " +
          f"Utilization: {stats['thread_utilization']:.2f}")
    
    # Shutdown pool
    final_stats = pool.shutdown()
    print(f"Final stats - Total execution time: {final_stats['total_execution_time_ms']:.2f}ms")