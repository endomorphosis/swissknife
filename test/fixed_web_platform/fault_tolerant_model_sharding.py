#!/usr/bin/env python3
"""
Fault-Tolerant Cross-Browser Model Sharding (May 2025)

This module extends the model sharding functionality with enterprise-grade fault tolerance
capabilities for cross-browser model execution. It provides robust recovery mechanisms 
for browser crashes, disconnections, and failures, integrating with the distributed 
testing framework for enhanced reliability.

Key features:
- Transaction-based state management with distributed consensus
- Intelligent component-level recovery with dependency awareness
- Circuit breaker pattern to prevent cascading failures
- Performance history tracking for optimal browser selection
- Progressive recovery strategies with state preservation

Usage:
    from fixed_web_platform.fault_tolerant_model_sharding import (
        FaultTolerantModelSharding,
        create_fault_tolerant_sharding_config,
        run_with_fault_tolerance
    )
    
    # Create fault-tolerant sharding manager
    manager = FaultTolerantModelSharding(
        model_name="llama-70b",
        browsers=["chrome", "firefox", "edge"],
        fault_tolerance_level="high"
    )
    
    # Initialize with state replication
    await manager.initialize(enable_state_replication=True)
    
    # Run inference with automatic recovery
    result = await manager.run_inference({
        "input": "Hello, world!",
        "max_length": 100
    })
    
    # Get recovery statistics
    stats = manager.get_recovery_statistics()
"""

import os
import sys
import json
import time
import asyncio
import logging
import random
import traceback
from datetime import datetime
from typing import Dict, List, Any, Optional, Union, Tuple, Callable, Set
from enum import Enum

# Import base model sharding functionality
from fixed_web_platform.model_sharding import (
    ModelShardingManager,
    create_model_shards,
    shard_model_for_inference,
    create_sharding_config
)

# Import core components from the distributed testing framework
try:
    from distributed_testing.consensus import RaftConsensus
    from distributed_testing.circuit_breaker import CircuitBreaker
    from distributed_testing.transaction_log import TransactionLog
    from distributed_testing.state_manager import StateManager
    from distributed_testing.worker_registry import WorkerRegistry
    
    DISTRIBUTED_TESTING_AVAILABLE = True
except ImportError:
    DISTRIBUTED_TESTING_AVAILABLE = False
    # Create stub classes for testing without distributed testing framework
    class RaftConsensus:
        def __init__(self, *args, **kwargs):
            pass
        async def initialize(self):
            return True
        async def elect_leader(self):
            return "node-0"
        async def is_leader(self):
            return True
            
    class CircuitBreaker:
        def __init__(self, *args, **kwargs):
            self.state = "closed"
        async def execute(self, func, *args, **kwargs):
            return await func(*args, **kwargs)
        def record_success(self):
            pass
        def record_failure(self):
            pass
            
    class TransactionLog:
        def __init__(self, *args, **kwargs):
            self.transactions = []
        async def append(self, transaction):
            self.transactions.append(transaction)
            return True
        async def get_latest(self, count=1):
            return self.transactions[-count:]
            
    class StateManager:
        def __init__(self, *args, **kwargs):
            self.state = {}
        async def update_state(self, key, value):
            self.state[key] = value
            return True
        async def get_state(self, key):
            return self.state.get(key)
            
    class WorkerRegistry:
        def __init__(self, *args, **kwargs):
            self.workers = {}
        async def register(self, worker_id, info):
            self.workers[worker_id] = info
            return True
        async def get_all_workers(self):
            return self.workers

# Initialize logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Enums for fault tolerance
class FaultToleranceLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class RecoveryStrategy(str, Enum):
    RESTART = "restart"
    RECONNECT = "reconnect"
    FAILOVER = "failover"
    PROGRESSIVE = "progressive"
    PARALLEL = "parallel"

class BrowserState(str, Enum):
    INITIALIZING = "initializing"
    READY = "ready"
    BUSY = "busy"
    DEGRADED = "degraded"
    FAILED = "failed"
    RECOVERING = "recovering"

class ComponentStatus(str, Enum):
    UNINITIALIZED = "uninitialized"
    INITIALIZING = "initializing"
    READY = "ready"
    LOADING = "loading"
    EXECUTING = "executing"
    FAILED = "failed"
    RECOVERED = "recovered"

class FaultTolerantModelSharding:
    """
    Fault-tolerant cross-browser model sharding with enterprise-grade reliability features.
    
    This class extends the base model sharding functionality with robust fault tolerance
    capabilities that integrate with the distributed testing framework.
    """
    
    def __init__(self, 
                 model_name: str, 
                 browsers: List[str] = None,
                 shard_count: int = None,
                 fault_tolerance_level: str = "medium",
                 recovery_strategy: str = "progressive",
                 connection_pool = None):
        """
        Initialize fault-tolerant model sharding.
        
        Args:
            model_name: Name of the model to shard
            browsers: List of browsers to use (chrome, firefox, edge, safari)
            shard_count: Number of shards (calculated automatically if None)
            fault_tolerance_level: Level of fault tolerance (none, low, medium, high, critical)
            recovery_strategy: Strategy for recovery (restart, reconnect, failover, progressive, parallel)
            connection_pool: Optional connection pool for browser management
        """
        self.model_name = model_name
        self.browsers = browsers or ["chrome", "firefox", "edge"]
        self.fault_tolerance_level = FaultToleranceLevel(fault_tolerance_level)
        self.recovery_strategy = RecoveryStrategy(recovery_strategy)
        self.connection_pool = connection_pool
        
        # Create base sharding manager
        self.base_manager = None
        
        # Determine optimal shard count if not specified
        if shard_count is None:
            # Create temporary manager to get model properties
            temp_manager = ModelShardingManager(model_name, shard_count=2)
            model_properties = temp_manager.model_properties
            
            # Calculate optimal shard count based on model size and available browsers
            model_size_gb = model_properties.get("model_size_gb", 10)
            target_memory_per_shard_gb = 4.0  # 4GB per shard target
            
            # Calculate shard count with 20% extra for fault tolerance
            optimal_shard_count = max(2, int(model_size_gb / target_memory_per_shard_gb * 1.2))
            
            # Limit to number of available browsers
            self.shard_count = min(optimal_shard_count, len(self.browsers))
        else:
            self.shard_count = max(2, shard_count)  # Minimum 2 shards for fault tolerance
            
        # Create core fault tolerance components
        if DISTRIBUTED_TESTING_AVAILABLE and self.fault_tolerance_level != FaultToleranceLevel.NONE:
            # Higher-level fault tolerance uses Raft consensus
            if self.fault_tolerance_level in [FaultToleranceLevel.HIGH, FaultToleranceLevel.CRITICAL]:
                self.consensus = RaftConsensus(f"model-{model_name}", len(self.browsers))
            else:
                self.consensus = None
                
            # Create transaction log for state management
            self.transaction_log = TransactionLog(f"model-{model_name}")
            
            # Create state manager for component state tracking
            self.state_manager = StateManager(f"model-{model_name}")
            
            # Create worker registry for browser management
            self.worker_registry = WorkerRegistry(f"model-{model_name}")
            
            # Create circuit breaker for each browser to prevent cascading failures
            self.circuit_breakers = {
                browser: CircuitBreaker(
                    failure_threshold=3,
                    recovery_timeout=30,
                    half_open_timeout=5,
                    name=f"{browser}-circuit"
                )
                for browser in self.browsers
            }
        else:
            # Simplified fault tolerance without distributed testing framework
            self.consensus = None
            self.transaction_log = None
            self.state_manager = None
            self.worker_registry = None
            self.circuit_breakers = {}
        
        # Create browser state tracking
        self.browser_states = {browser: BrowserState.INITIALIZING for browser in self.browsers}
        
        # Create component state tracking
        self.component_states = {}
        
        # Create browser to shard mapping
        self.browser_shard_mapping = {}
        
        # Create shard to browser mapping
        self.shard_browser_mapping = {}
        
        # Create browser to connection mapping
        self.browser_connections = {}
        
        # Performance tracking
        self.performance_history = []
        
        # Recovery statistics
        self.recovery_stats = {
            "total_attempts": 0,
            "successful_recoveries": 0,
            "failed_recoveries": 0,
            "by_browser": {browser: {"attempts": 0, "successes": 0} for browser in self.browsers},
            "by_strategy": {strategy.value: {"attempts": 0, "successes": 0} for strategy in RecoveryStrategy},
            "recovery_times_ms": [],
            "component_recoveries": {}
        }
        
        # Logging and telemetry
        self.telemetry = {
            "initialization_time_ms": 0,
            "inference_times_ms": [],
            "browser_utilization": {browser: 0.0 for browser in self.browsers},
            "component_execution_times": {},
            "recovery_events": []
        }
        
        logger.info(f"Fault-tolerant model sharding initialized for {model_name} with {len(self.browsers)} browsers")
        logger.info(f"Fault tolerance level: {fault_tolerance_level}, recovery strategy: {recovery_strategy}")
        
    async def initialize(self, 
                        shard_type: str = "optimal", 
                        enable_state_replication: bool = True,
                        checkpoint_interval_sec: int = 30) -> bool:
        """
        Initialize fault-tolerant model sharding.
        
        Args:
            shard_type: Type of sharding to use (optimal, layer_based, browser_based)
            enable_state_replication: Whether to enable state replication for fault tolerance
            checkpoint_interval_sec: How often to create state checkpoints (seconds)
            
        Returns:
            Whether initialization was successful
        """
        start_time = time.time()
        
        try:
            # Create base sharding manager with appropriate configuration
            self.base_manager = ModelShardingManager(
                model_name=self.model_name,
                shard_count=self.shard_count,
                recovery_enabled=self.fault_tolerance_level != FaultToleranceLevel.NONE,
                network_topology="mesh" if self.fault_tolerance_level in [FaultToleranceLevel.HIGH, FaultToleranceLevel.CRITICAL] else "star",
                load_balancing_strategy="adaptive"
            )
            
            # Initialize distributed testing components if available
            if DISTRIBUTED_TESTING_AVAILABLE and self.fault_tolerance_level != FaultToleranceLevel.NONE:
                if self.consensus:
                    await self.consensus.initialize()
                    leader = await self.consensus.elect_leader()
                    logger.info(f"Consensus initialized with leader: {leader}")
                    
                # Initialize transaction log
                if self.transaction_log:
                    await self.transaction_log.append({
                        "action": "initialize",
                        "model_name": self.model_name,
                        "shard_count": self.shard_count,
                        "browsers": self.browsers,
                        "timestamp": time.time()
                    })
                    logger.info("Transaction log initialized")
                    
                # Initialize worker registry
                if self.worker_registry:
                    for i, browser in enumerate(self.browsers):
                        await self.worker_registry.register(f"browser-{i}", {
                            "type": browser,
                            "shard_indices": [],
                            "status": "initializing",
                            "startup_time": time.time()
                        })
                    logger.info(f"Worker registry initialized with {len(self.browsers)} browsers")
                    
                # Initialize state manager
                if self.state_manager:
                    await self.state_manager.update_state("model_name", self.model_name)
                    await self.state_manager.update_state("shard_count", self.shard_count)
                    await self.state_manager.update_state("fault_tolerance_level", self.fault_tolerance_level.value)
                    await self.state_manager.update_state("browsers", self.browsers)
                    logger.info("State manager initialized")
            
            # Create optimal browser-shard mapping
            await self._create_browser_shard_mapping(shard_type)
            
            # Initialize model shards and browser connections
            init_result = await self._initialize_shards(enable_state_replication)
            
            # Start health monitoring if not in "none" fault tolerance mode
            if self.fault_tolerance_level != FaultToleranceLevel.NONE:
                self._start_health_monitoring(checkpoint_interval_sec)
                
            # Record initialization time
            self.telemetry["initialization_time_ms"] = (time.time() - start_time) * 1000
            
            logger.info(f"Fault-tolerant model sharding initialized in {self.telemetry['initialization_time_ms']:.1f}ms")
            return init_result["status"] == "ready"
            
        except Exception as e:
            logger.error(f"Error initializing fault-tolerant model sharding: {e}")
            traceback.print_exc()
            return False
            
    async def _create_browser_shard_mapping(self, shard_type: str) -> Dict[str, List[int]]:
        """
        Create an optimal mapping of browsers to shards.
        
        Args:
            shard_type: Type of sharding to use
            
        Returns:
            Dictionary mapping browsers to shard indices
        """
        # Get model characteristics
        model_properties = self.base_manager.model_properties
        model_type = model_properties.get("model_type", "unknown")
        
        # Map of browser types to their strengths
        browser_strengths = {
            "chrome": ["vision", "multimodal", "parallel"],
            "firefox": ["audio", "speech", "compute_shaders"],
            "edge": ["text", "embedding", "webnn"],
            "safari": ["mobile", "power_efficiency"]
        }
        
        # Map of model components to their affinities
        component_affinities = {
            "embedding": "text",
            "attention": "parallel",
            "feedforward": "text",
            "lm_head": "text",
            "encoder": "text",
            "decoder": "text",
            "vision_encoder": "vision",
            "text_encoder": "text",
            "audio_encoder": "audio",
            "multimodal_fusion": "multimodal"
        }
        
        # Create optimal browser assignment based on shard type
        if shard_type == "browser_based":
            # Simple assignment: one browser per shard
            browser_shards = {}
            
            # Assign shards to browsers
            for i, browser in enumerate(self.browsers):
                if i < self.shard_count:
                    browser_shards[browser] = [i]
                else:
                    browser_shards[browser] = []
                    
            # Create shard to browser mapping
            for browser, shards in browser_shards.items():
                for shard_idx in shards:
                    self.shard_browser_mapping[shard_idx] = browser
                    
        elif shard_type == "layer_based":
            # Layer-based assignment, distributing layers evenly among browsers
            browser_shards = {browser: [] for browser in self.browsers}
            
            # Calculate layers per browser
            total_layers = int(model_properties.get("parameter_count_billions", 1) * 2)  # Rough estimate
            layers_per_browser = total_layers // len(self.browsers)
            
            # Create browser mapping
            browser_list = list(self.browsers)
            for i in range(self.shard_count):
                # Determine which browser should get this shard
                browser_idx = i % len(browser_list)
                browser = browser_list[browser_idx]
                
                browser_shards[browser].append(i)
                self.shard_browser_mapping[i] = browser
                
        elif shard_type == "optimal":
            # Optimal assignment based on browser strengths and component affinities
            browser_shards = {browser: [] for browser in self.browsers}
            
            # Get primary modality
            primary_modality = model_properties.get("primary_modality", "text") 
            
            # Score browsers for this model's primary modality
            browser_scores = {}
            for browser in self.browsers:
                strengths = browser_strengths.get(browser, [])
                if primary_modality in strengths:
                    browser_scores[browser] = 3  # Perfect match
                elif any(s in ["parallel", "compute_shaders"] for s in strengths):
                    browser_scores[browser] = 2  # Good for compute
                else:
                    browser_scores[browser] = 1  # Basic capability
                    
            # Sort browsers by score
            sorted_browsers = sorted(browser_scores.items(), key=lambda x: x[1], reverse=True)
            
            # Get components in the model
            components = self.base_manager.shard_config.get("shard_assignments", {}).keys()
            
            # Map components to browsers
            component_browser_map = {}
            for component in components:
                # Get affinity for this component
                affinity = component_affinities.get(component, "text")
                
                # Find best browser for this affinity
                best_browser = None
                for browser, score in sorted_browsers:
                    if affinity in browser_strengths.get(browser, []):
                        best_browser = browser
                        break
                
                # If no perfect match, use highest scored browser
                if not best_browser and sorted_browsers:
                    best_browser = sorted_browsers[0][0]
                    
                # Store mapping
                component_browser_map[component] = best_browser
            
            # Convert component mapping to shard mapping
            assignments = self.base_manager.shard_config.get("shard_assignments", {})
            for component, assignment in assignments.items():
                if isinstance(assignment, dict):
                    # For layer-based assignments
                    for layer, shard_idx in assignment.items():
                        target_browser = component_browser_map.get(component, sorted_browsers[0][0] if sorted_browsers else self.browsers[0])
                        if target_browser in browser_shards:
                            browser_shards[target_browser].append(shard_idx)
                            self.shard_browser_mapping[shard_idx] = target_browser
                elif isinstance(assignment, list):
                    # For list-based assignments
                    for shard_idx in assignment:
                        target_browser = component_browser_map.get(component, sorted_browsers[0][0] if sorted_browsers else self.browsers[0])
                        if target_browser in browser_shards:
                            browser_shards[target_browser].append(shard_idx)
                            self.shard_browser_mapping[shard_idx] = target_browser
                else:
                    # For scalar assignments
                    shard_idx = assignment
                    target_browser = component_browser_map.get(component, sorted_browsers[0][0] if sorted_browsers else self.browsers[0])
                    if target_browser in browser_shards:
                        browser_shards[target_browser].append(shard_idx)
                        self.shard_browser_mapping[shard_idx] = target_browser
                        
            # Ensure each browser has at least one shard if possible
            for browser in self.browsers:
                if not browser_shards.get(browser):
                    # Try to steal a shard from a browser with multiple shards
                    for donor_browser, donor_shards in browser_shards.items():
                        if len(donor_shards) > 1:
                            # Take a shard from the donor
                            shard_idx = donor_shards.pop()
                            browser_shards[browser] = [shard_idx]
                            self.shard_browser_mapping[shard_idx] = browser
                            break
        else:
            # Default to even distribution
            browser_shards = {browser: [] for browser in self.browsers}
            
            # Distribute shards evenly
            for i in range(self.shard_count):
                browser_idx = i % len(self.browsers)
                browser = list(self.browsers)[browser_idx]
                
                browser_shards[browser].append(i)
                self.shard_browser_mapping[i] = browser
        
        # Store browser to shard mapping
        self.browser_shard_mapping = browser_shards
        
        # Log browser assignment
        for browser, shards in browser_shards.items():
            logger.info(f"Browser {browser} assigned shards: {shards}")
            
        # Store in state manager if available
        if self.state_manager:
            await self.state_manager.update_state("browser_shard_mapping", self.browser_shard_mapping)
            await self.state_manager.update_state("shard_browser_mapping", self.shard_browser_mapping)
            
        return browser_shards
        
    async def _initialize_shards(self, enable_state_replication: bool) -> Dict[str, Any]:
        """
        Initialize model shards on each browser.
        
        Args:
            enable_state_replication: Whether to enable state replication for fault tolerance
            
        Returns:
            Dictionary with initialization results
        """
        # Initialize base manager to create shard configuration
        base_init_result = self.base_manager.initialize_shards()
        
        # Create browser connections
        browser_results = []
        
        for browser, shard_indices in self.browser_shard_mapping.items():
            if not shard_indices:
                continue
                
            try:
                # Create browser connection
                connection = await self._create_browser_connection(browser, shard_indices)
                
                if connection:
                    # Store connection
                    self.browser_connections[browser] = connection
                    
                    # Update browser state
                    self.browser_states[browser] = BrowserState.READY
                    
                    # Load model shards in this browser
                    load_result = await self._load_model_shards_in_browser(browser, shard_indices)
                    
                    browser_results.append({
                        "browser": browser,
                        "shards": shard_indices,
                        "status": "ready" if load_result.get("success", False) else "failed",
                        "load_time_ms": load_result.get("load_time_ms", 0)
                    })
                    
                    # Update component states
                    for shard_idx in shard_indices:
                        components = self._get_components_for_shard(shard_idx)
                        for component in components:
                            self.component_states[component] = ComponentStatus.READY
                            
                    # Enable state replication if requested and in high fault tolerance mode
                    if enable_state_replication and self.fault_tolerance_level in [FaultToleranceLevel.HIGH, FaultToleranceLevel.CRITICAL]:
                        await self._enable_state_replication(browser, shard_indices)
            except Exception as e:
                logger.error(f"Error initializing browser {browser}: {e}")
                browser_results.append({
                    "browser": browser,
                    "shards": shard_indices,
                    "status": "failed",
                    "error": str(e)
                })
                
                # Update browser state
                self.browser_states[browser] = BrowserState.FAILED
                
        # Check if initialization was successful
        successful_browsers = [r for r in browser_results if r["status"] == "ready"]
        
        # Calculate minimum browsers needed (for fault tolerance high we need majority of browsers)
        if self.fault_tolerance_level == FaultToleranceLevel.CRITICAL:
            min_browsers_needed = len(self.browsers)  # All browsers needed
        elif self.fault_tolerance_level == FaultToleranceLevel.HIGH:
            min_browsers_needed = len(self.browsers) // 2 + 1  # Majority needed
        else:
            min_browsers_needed = min(1, len(self.browsers))  # At least one browser needed
            
        # Determine overall status
        if len(successful_browsers) >= min_browsers_needed:
            status = "ready"
        elif len(successful_browsers) > 0:
            status = "degraded"
        else:
            status = "failed"
            
        # Log initialization result
        if status == "ready":
            logger.info(f"All shards initialized successfully across {len(successful_browsers)} browsers")
        elif status == "degraded":
            logger.warning(f"Partial initialization: {len(successful_browsers)}/{len(self.browsers)} browsers ready")
        else:
            logger.error("Failed to initialize any browsers")
            
        # Store state in transaction log if available
        if self.transaction_log:
            await self.transaction_log.append({
                "action": "shards_initialized",
                "status": status,
                "successful_browsers": len(successful_browsers),
                "total_browsers": len(self.browsers),
                "browser_results": browser_results,
                "timestamp": time.time()
            })
            
        return {
            "browser_results": browser_results,
            "status": status,
            "successful_browsers": len(successful_browsers),
            "total_browsers": len(self.browsers)
        }
        
    async def _create_browser_connection(self, browser: str, shard_indices: List[int]) -> Any:
        """
        Create a connection to a browser for model execution.
        
        Args:
            browser: Type of browser (chrome, firefox, etc.)
            shard_indices: List of shard indices to load in this browser
            
        Returns:
            Browser connection object or None on failure
        """
        # In a real implementation, this would create a connection to a browser
        # For the simulation, we'll create a mock connection
        
        # If using connection pool, get browser from pool
        if self.connection_pool:
            try:
                # Get connection from pool
                conn_id, conn_info = await self.connection_pool.get_connection(
                    browser_type=browser,
                    hardware_preferences={
                        "model_name": self.model_name,
                        "shards": shard_indices
                    }
                )
                
                # Create connection object
                if conn_id:
                    connection = {
                        "id": conn_id,
                        "browser": browser,
                        "shards": shard_indices,
                        "status": "ready",
                        "creation_time": time.time(),
                        "info": conn_info
                    }
                    
                    return connection
                else:
                    logger.warning(f"Failed to get {browser} connection from pool")
                    return None
            except Exception as e:
                logger.error(f"Error getting {browser} connection from pool: {e}")
                return None
        else:
            # Create mock connection
            connection = {
                "id": f"{browser}-{random.randint(1000, 9999)}",
                "browser": browser,
                "shards": shard_indices,
                "status": "ready",
                "creation_time": time.time(),
                "last_heartbeat": time.time(),
                "loaded_components": set()
            }
            
            return connection
            
    async def _load_model_shards_in_browser(self, browser: str, shard_indices: List[int]) -> Dict[str, Any]:
        """
        Load model shards in a browser.
        
        Args:
            browser: Type of browser
            shard_indices: List of shard indices to load
            
        Returns:
            Dictionary with load results
        """
        # In a real implementation, this would load the model shards in the browser
        # For the simulation, we'll just simulate the loading process
        
        connection = self.browser_connections.get(browser)
        if not connection:
            return {"success": False, "error": "No connection"}
            
        start_time = time.time()
        
        try:
            # Simulate loading time based on shards
            loading_time = 0
            for shard_idx in shard_indices:
                # Get components for this shard
                components = self._get_components_for_shard(shard_idx)
                
                # Update component status
                for component in components:
                    self.component_states[component] = ComponentStatus.LOADING
                    
                # Simulate loading time based on component complexity
                shard_loading_time = len(components) * 100  # 100ms per component
                
                # Add browser-specific variation
                if browser == "chrome":
                    # Chrome is faster for vision
                    if any("vision" in c for c in components):
                        shard_loading_time *= 0.8
                        
                elif browser == "firefox":
                    # Firefox is faster for audio
                    if any("audio" in c for c in components):
                        shard_loading_time *= 0.8
                        
                elif browser == "edge":
                    # Edge is faster for text
                    if any(c in ["embedding", "lm_head", "encoder", "decoder"] for c in components):
                        shard_loading_time *= 0.8
                        
                # Add random variation (±20%)
                shard_loading_time *= random.uniform(0.8, 1.2)
                
                # Add to total loading time
                loading_time += shard_loading_time
                
                # Update connection with loaded components
                if hasattr(connection, "loaded_components"):
                    connection["loaded_components"].update(components)
                    
                # Update component status
                for component in components:
                    self.component_states[component] = ComponentStatus.READY
                    
            # Simulate loading delay
            loading_time_sec = loading_time / 1000
            
            # Don't actually sleep in the simulation, just track time
            # await asyncio.sleep(loading_time_sec)
            
            # Calculate load time
            load_time = (time.time() - start_time) * 1000
            
            logger.info(f"Loaded {len(shard_indices)} shards in {browser} in {load_time:.1f}ms")
            
            return {"success": True, "load_time_ms": load_time}
        except Exception as e:
            logger.error(f"Error loading shards in {browser}: {e}")
            return {"success": False, "error": str(e), "load_time_ms": (time.time() - start_time) * 1000}
            
    def _get_components_for_shard(self, shard_idx: int) -> List[str]:
        """
        Get components assigned to a shard.
        
        Args:
            shard_idx: Index of the shard
            
        Returns:
            List of component names
        """
        components = []
        
        # Get shard assignments
        assignments = self.base_manager.shard_config.get("shard_assignments", {})
        
        # Find components assigned to this shard
        for component, assignment in assignments.items():
            if isinstance(assignment, dict):
                # For layer-based assignments
                for layer, assigned_shard in assignment.items():
                    if assigned_shard == shard_idx:
                        components.append(layer)
            elif isinstance(assignment, list):
                # For list-based assignments
                if shard_idx in assignment:
                    components.append(component)
            else:
                # For scalar assignments
                if assignment == shard_idx:
                    components.append(component)
                    
        return components
        
    async def _enable_state_replication(self, browser: str, shard_indices: List[int]) -> bool:
        """
        Enable state replication for fault tolerance.
        
        Args:
            browser: Browser type
            shard_indices: List of shard indices in this browser
            
        Returns:
            Whether state replication was enabled
        """
        # In a real implementation, this would set up state replication
        # For this simulation, we'll just track which browsers replicate state
        
        if not DISTRIBUTED_TESTING_AVAILABLE:
            return False
            
        # Get assigned components
        components = []
        for shard_idx in shard_indices:
            components.extend(self._get_components_for_shard(shard_idx))
            
        if not components:
            return False
            
        # Track component states
        for component in components:
            if component not in self.component_states:
                self.component_states[component] = ComponentStatus.READY
                
        # Update worker registry
        if self.worker_registry:
            # Find worker ID for this browser
            worker_id = None
            for i, b in enumerate(self.browsers):
                if b == browser:
                    worker_id = f"browser-{i}"
                    break
                    
            if worker_id:
                await self.worker_registry.register(worker_id, {
                    "type": browser,
                    "shard_indices": shard_indices,
                    "status": "ready",
                    "components": components,
                    "startup_time": time.time()
                })
                
        # Record in transaction log
        if self.transaction_log:
            await self.transaction_log.append({
                "action": "enable_state_replication",
                "browser": browser,
                "shard_indices": shard_indices,
                "components": components,
                "timestamp": time.time()
            })
            
        logger.info(f"Enabled state replication for {len(components)} components in {browser}")
        return True
        
    def _start_health_monitoring(self, checkpoint_interval_sec: int) -> None:
        """
        Start health monitoring for fault detection.
        
        Args:
            checkpoint_interval_sec: How often to create state checkpoints (seconds)
        """
        # In a real implementation, this would start a background health monitoring task
        # For this simulation, we'll just log that monitoring would be started
        
        logger.info(f"Health monitoring started with {checkpoint_interval_sec}s checkpoint interval")
        
        # Schedule first checkpoint
        asyncio.create_task(self._create_state_checkpoint())
        
        # Start health check loop
        asyncio.create_task(self._health_check_loop(checkpoint_interval_sec))
        
    async def _health_check_loop(self, interval_sec: int) -> None:
        """
        Run periodic health checks on all browsers.
        
        Args:
            interval_sec: Health check interval in seconds
        """
        while True:
            try:
                # Check browser health
                await self._check_browser_health()
                
                # Create state checkpoint periodically
                await self._create_state_checkpoint()
                
                # Wait for next check
                await asyncio.sleep(interval_sec)
                
            except Exception as e:
                logger.error(f"Error in health check loop: {e}")
                await asyncio.sleep(interval_sec)
                
    async def _check_browser_health(self) -> Dict[str, str]:
        """
        Check health of all browser connections.
        
        Returns:
            Dictionary mapping browsers to health status
        """
        health_status = {}
        
        for browser, connection in self.browser_connections.items():
            try:
                # In a real implementation, this would check browser status
                # For this simulation, we'll use a random check
                
                # Simulate occasional failures (5% chance)
                if random.random() < 0.05:
                    health_status[browser] = "failed"
                    self.browser_states[browser] = BrowserState.FAILED
                    
                    # Trigger recovery
                    recovery_task = asyncio.create_task(self._recover_browser(browser))
                else:
                    # Update last heartbeat
                    if "last_heartbeat" in connection:
                        connection["last_heartbeat"] = time.time()
                        
                    # Determine health status
                    if self.browser_states[browser] == BrowserState.READY:
                        health_status[browser] = "healthy"
                    elif self.browser_states[browser] == BrowserState.BUSY:
                        health_status[browser] = "busy"
                    elif self.browser_states[browser] == BrowserState.DEGRADED:
                        health_status[browser] = "degraded"
                    else:
                        health_status[browser] = "unknown"
                        
            except Exception as e:
                logger.error(f"Error checking health of {browser}: {e}")
                health_status[browser] = "error"
                
        return health_status
        
    async def _create_state_checkpoint(self) -> Dict[str, Any]:
        """
        Create a checkpoint of the current state for recovery.
        
        Returns:
            Dictionary with checkpoint information
        """
        checkpoint = {
            "id": f"checkpoint-{int(time.time())}",
            "timestamp": time.time(),
            "browser_states": {b: s.value for b, s in self.browser_states.items()},
            "component_states": {c: s.value for c, s in self.component_states.items()},
            "browser_shard_mapping": self.browser_shard_mapping,
            "shard_browser_mapping": self.shard_browser_mapping
        }
        
        # Add active browsers (those with ready or busy state)
        active_browsers = [b for b, s in self.browser_states.items() 
                        if s in [BrowserState.READY, BrowserState.BUSY]]
        checkpoint["active_browsers"] = active_browsers
        
        # Add active components (those with ready status)
        active_components = [c for c, s in self.component_states.items() 
                            if s == ComponentStatus.READY]
        checkpoint["active_components"] = active_components
        
        # Store in transaction log if available
        if self.transaction_log:
            await self.transaction_log.append({
                "action": "create_checkpoint",
                "checkpoint_id": checkpoint["id"],
                "active_browsers": len(active_browsers),
                "active_components": len(active_components),
                "timestamp": time.time()
            })
            
        logger.debug(f"Created checkpoint {checkpoint['id']} with {len(active_browsers)} active browsers")
        
        return checkpoint
        
    async def run_inference(self, inputs: Dict[str, Any], 
                           fault_tolerance_options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Run inference with fault tolerance.
        
        Args:
            inputs: Input data for inference
            fault_tolerance_options: Additional fault tolerance options
            
        Returns:
            Dictionary with inference results
        """
        start_time = time.time()
        
        # Set default fault tolerance options
        if fault_tolerance_options is None:
            fault_tolerance_options = {}
            
        recovery_timeout = fault_tolerance_options.get("recovery_timeout", 30)
        max_retries = fault_tolerance_options.get("max_retries", 3)
        recovery_strategy = fault_tolerance_options.get("recovery_strategy", self.recovery_strategy.value)
        state_preservation = fault_tolerance_options.get("state_preservation", 
                                                        self.fault_tolerance_level in [FaultToleranceLevel.HIGH, FaultToleranceLevel.CRITICAL])
                                                        
        # Create transaction for this inference
        if self.transaction_log:
            await self.transaction_log.append({
                "action": "start_inference",
                "input_hash": hash(str(inputs)),
                "active_browsers": sum(1 for b, s in self.browser_states.items() 
                                    if s in [BrowserState.READY, BrowserState.BUSY]),
                "timestamp": time.time()
            })
            
        try:
            # Check if we have enough active browsers for inference
            active_browsers = [b for b, s in self.browser_states.items() 
                            if s in [BrowserState.READY, BrowserState.BUSY]]
                            
            if not active_browsers:
                # No active browsers, try recovery
                logger.warning("No active browsers available, attempting recovery")
                
                # Start recovery for all failed browsers
                recovery_tasks = []
                for browser, state in self.browser_states.items():
                    if state in [BrowserState.FAILED, BrowserState.DEGRADED]:
                        recovery_tasks.append(self._recover_browser(browser))
                        
                # Wait for recoveries with timeout
                if recovery_tasks:
                    try:
                        await asyncio.wait(recovery_tasks, timeout=recovery_timeout)
                    except Exception as e:
                        logger.error(f"Error during recovery: {e}")
                        
                # Check if we have browsers now
                active_browsers = [b for b, s in self.browser_states.items() 
                                if s in [BrowserState.READY, BrowserState.BUSY]]
                                
                if not active_browsers:
                    raise Exception("No active browsers available after recovery attempts")
            
            # Determine if we have enough browsers for reliable inference
            required_browsers = 1  # Default
            
            if self.fault_tolerance_level == FaultToleranceLevel.CRITICAL:
                # Critical needs all browsers
                required_browsers = len(self.browsers)
            elif self.fault_tolerance_level == FaultToleranceLevel.HIGH:
                # High needs majority
                required_browsers = len(self.browsers) // 2 + 1
                
            # Check if we meet the requirements
            if len(active_browsers) < required_browsers:
                logger.warning(f"Running with reduced reliability: {len(active_browsers)}/{required_browsers} browsers available")
            
            # Run inference using circuit breakers if available
            if self.circuit_breakers and self.fault_tolerance_level != FaultToleranceLevel.NONE:
                # Run with circuit breakers for fault isolation
                browser_results = []
                
                for browser, connection in self.browser_connections.items():
                    if self.browser_states[browser] not in [BrowserState.READY, BrowserState.BUSY]:
                        continue
                        
                    # Get shard indices for this browser
                    shard_indices = self.browser_shard_mapping.get(browser, [])
                    
                    if not shard_indices:
                        continue
                        
                    try:
                        # Use circuit breaker to run browser inference
                        circuit_breaker = self.circuit_breakers.get(browser)
                        
                        if circuit_breaker:
                            # Run with circuit breaker
                            result = await circuit_breaker.execute(
                                self._run_browser_inference,
                                browser=browser,
                                connection=connection,
                                shard_indices=shard_indices,
                                inputs=inputs
                            )
                        else:
                            # Run without circuit breaker
                            result = await self._run_browser_inference(
                                browser=browser,
                                connection=connection,
                                shard_indices=shard_indices,
                                inputs=inputs
                            )
                            
                        # Record success in circuit breaker
                        if circuit_breaker:
                            circuit_breaker.record_success()
                            
                        # Add to results
                        browser_results.append(result)
                        
                    except Exception as e:
                        logger.error(f"Error running inference on {browser}: {e}")
                        
                        # Record failure in circuit breaker
                        if circuit_breaker:
                            circuit_breaker.record_failure()
                            
                        # Try recovery if fault tolerance is enabled
                        if self.fault_tolerance_level != FaultToleranceLevel.NONE:
                            try:
                                # Attempt recovery
                                recovery_result = await self._recover_browser_inference(
                                    browser=browser,
                                    shard_indices=shard_indices,
                                    inputs=inputs,
                                    error=e,
                                    recovery_strategy=RecoveryStrategy(recovery_strategy)
                                )
                                
                                if recovery_result.get("success", False):
                                    # Add recovered result
                                    browser_results.append(recovery_result.get("result", {}))
                                    
                            except Exception as recovery_error:
                                logger.error(f"Recovery failed for {browser}: {recovery_error}")
                
                # Combine results from all browsers
                if browser_results:
                    final_result = self._combine_browser_results(browser_results)
                else:
                    raise Exception("No successful inference results from any browser")
            else:
                # Simplified execution without circuit breakers
                # Use base manager's inference implementation
                input_text = inputs.get("input", inputs.get("text", ""))
                final_result = self.base_manager.run_distributed_inference(input_text)
            
            # Calculate inference time
            inference_time = (time.time() - start_time) * 1000
            
            # Track inference time
            self.telemetry["inference_times_ms"].append(inference_time)
            
            # Complete transaction
            if self.transaction_log:
                await self.transaction_log.append({
                    "action": "complete_inference",
                    "input_hash": hash(str(inputs)),
                    "inference_time_ms": inference_time,
                    "output_length": len(str(final_result.get("output", ""))) if isinstance(final_result, dict) else 0,
                    "timestamp": time.time()
                })
                
            # Add telemetry to result
            if isinstance(final_result, dict):
                final_result["fault_tolerance_metrics"] = {
                    "total_browsers": len(self.browsers),
                    "active_browsers": len(active_browsers),
                    "fault_tolerance_level": self.fault_tolerance_level.value,
                    "recovery_attempts": self.recovery_stats["total_attempts"],
                    "successful_recoveries": self.recovery_stats["successful_recoveries"]
                }
                final_result["inference_time_ms"] = inference_time
                
            logger.info(f"Inference completed in {inference_time:.1f}ms with {len(active_browsers)} active browsers")
            
            return final_result
        
        except Exception as e:
            logger.error(f"Error running inference: {e}")
            traceback.print_exc()
            
            # Record in transaction log
            if self.transaction_log:
                await self.transaction_log.append({
                    "action": "inference_error",
                    "input_hash": hash(str(inputs)),
                    "error": str(e),
                    "timestamp": time.time()
                })
                
            # Calculate time
            inference_time = (time.time() - start_time) * 1000
            
            return {
                "error": str(e),
                "success": False,
                "inference_time_ms": inference_time,
                "fault_tolerance_metrics": {
                    "total_browsers": len(self.browsers),
                    "active_browsers": len([b for b, s in self.browser_states.items() 
                                         if s in [BrowserState.READY, BrowserState.BUSY]]),
                    "fault_tolerance_level": self.fault_tolerance_level.value,
                    "recovery_attempts": self.recovery_stats["total_attempts"],
                    "successful_recoveries": self.recovery_stats["successful_recoveries"]
                }
            }
            
    async def _run_browser_inference(self, browser: str, connection: Any, 
                                   shard_indices: List[int], inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run inference on a specific browser.
        
        Args:
            browser: Browser type
            connection: Browser connection
            shard_indices: Shard indices to run on this browser
            inputs: Input data
            
        Returns:
            Dictionary with browser inference results
        """
        # In a real implementation, this would execute inference on the browser
        # For this simulation, we'll simulate the execution
        
        start_time = time.time()
        
        # Update browser state
        self.browser_states[browser] = BrowserState.BUSY
        
        try:
            # Get components for these shards
            all_components = []
            for shard_idx in shard_indices:
                components = self._get_components_for_shard(shard_idx)
                all_components.extend(components)
                
            # Update component states
            for component in all_components:
                self.component_states[component] = ComponentStatus.EXECUTING
                
            # Base execution time on component complexity
            execution_time = 0
            
            for component in all_components:
                # Determine base time for this component type
                if component == "embedding":
                    base_time = 10  # Fast
                elif component == "lm_head":
                    base_time = 10  # Fast
                elif component.startswith("layer_"):
                    base_time = 20  # Medium
                elif component == "encoder":
                    base_time = 50  # Slow
                elif component == "decoder":
                    base_time = 80  # Slowest
                else:
                    base_time = 30  # Default
                    
                # Adjust for browser specialization
                if browser == "chrome":
                    # Chrome is faster for vision
                    if "vision" in component:
                        base_time *= 0.8
                elif browser == "firefox":
                    # Firefox is faster for audio
                    if "audio" in component:
                        base_time *= 0.8
                elif browser == "edge":
                    # Edge is faster for text
                    if component in ["embedding", "lm_head", "encoder", "decoder"]:
                        base_time *= 0.8
                        
                # Add to total time
                execution_time += base_time
                
                # Update component execution time tracking
                component_key = f"{component}"
                if component_key not in self.telemetry["component_execution_times"]:
                    self.telemetry["component_execution_times"][component_key] = []
                    
                self.telemetry["component_execution_times"][component_key].append(base_time)
                
            # Add some random variation (±20%)
            execution_time *= random.uniform(0.8, 1.2)
            
            # Simulate occasional failures (5% chance) 
            if random.random() < 0.05:
                # Update browser state
                self.browser_states[browser] = BrowserState.READY
                
                # Update component states
                for component in all_components:
                    self.component_states[component] = ComponentStatus.FAILED
                    
                raise Exception(f"Simulated inference failure in {browser}")
                
            # Don't actually sleep in the simulation, just track time
            # await asyncio.sleep(execution_time / 1000)
            
            # Simulate browser output based on components
            output_text = f"Output from {browser} with {len(all_components)} components"
            
            # Calculate inference time
            inference_time = (time.time() - start_time) * 1000
            
            # Update browser utilization metrics
            self.telemetry["browser_utilization"][browser] = 1.0  # Fully utilized during inference
            
            # Update browser state
            self.browser_states[browser] = BrowserState.READY
            
            # Update component states
            for component in all_components:
                self.component_states[component] = ComponentStatus.READY
                
            # Create execution result
            result = {
                "browser": browser,
                "shards": shard_indices,
                "components": all_components,
                "output": output_text,
                "execution_time_ms": inference_time,
                "success": True
            }
            
            logger.info(f"Browser {browser} completed inference in {inference_time:.1f}ms")
            
            return result
            
        except Exception as e:
            logger.error(f"Error in browser inference {browser}: {e}")
            
            # Update browser state
            self.browser_states[browser] = BrowserState.FAILED
            
            # Get components for these shards
            all_components = []
            for shard_idx in shard_indices:
                components = self._get_components_for_shard(shard_idx)
                all_components.extend(components)
                
            # Update component states
            for component in all_components:
                self.component_states[component] = ComponentStatus.FAILED
                
            # Calculate time
            inference_time = (time.time() - start_time) * 1000
            
            raise Exception(f"Browser inference failed: {str(e)}")
            
    async def _recover_browser(self, browser: str) -> Dict[str, Any]:
        """
        Recover a failed browser.
        
        Args:
            browser: Browser to recover
            
        Returns:
            Dictionary with recovery results
        """
        start_time = time.time()
        
        # Update statistics
        self.recovery_stats["total_attempts"] += 1
        self.recovery_stats["by_browser"][browser]["attempts"] += 1
        
        # Update browser state
        self.browser_states[browser] = BrowserState.RECOVERING
        
        logger.info(f"Starting recovery for {browser}")
        
        try:
            # Get shard indices for this browser
            shard_indices = self.browser_shard_mapping.get(browser, [])
            
            if not shard_indices:
                # No shards assigned to this browser
                logger.warning(f"No shards assigned to {browser}, skipping recovery")
                return {"success": False, "error": "No shards assigned"}
                
            # Recreate browser connection
            new_connection = await self._create_browser_connection(browser, shard_indices)
            
            if not new_connection:
                # Failed to create new connection
                self.browser_states[browser] = BrowserState.FAILED
                return {"success": False, "error": "Failed to create new connection"}
                
            # Store new connection
            self.browser_connections[browser] = new_connection
            
            # Reload model shards
            load_result = await self._load_model_shards_in_browser(browser, shard_indices)
            
            if not load_result.get("success", False):
                # Failed to load shards
                self.browser_states[browser] = BrowserState.FAILED
                return {"success": False, "error": "Failed to load model shards", "details": load_result}
                
            # Update browser state
            self.browser_states[browser] = BrowserState.READY
            
            # Update recovery statistics
            self.recovery_stats["successful_recoveries"] += 1
            self.recovery_stats["by_browser"][browser]["successes"] += 1
            
            # Calculate recovery time
            recovery_time = (time.time() - start_time) * 1000
            self.recovery_stats["recovery_times_ms"].append(recovery_time)
            
            # Record recovery event
            self.telemetry["recovery_events"].append({
                "browser": browser,
                "shards": shard_indices,
                "recovery_time_ms": recovery_time,
                "timestamp": time.time()
            })
            
            # Record in transaction log
            if self.transaction_log:
                await self.transaction_log.append({
                    "action": "browser_recovered",
                    "browser": browser,
                    "shards": shard_indices,
                    "recovery_time_ms": recovery_time,
                    "timestamp": time.time()
                })
                
            logger.info(f"Successfully recovered {browser} in {recovery_time:.1f}ms")
            
            return {
                "success": True,
                "browser": browser,
                "shards": shard_indices,
                "recovery_time_ms": recovery_time
            }
            
        except Exception as e:
            logger.error(f"Error recovering browser {browser}: {e}")
            
            # Update browser state
            self.browser_states[browser] = BrowserState.FAILED
            
            # Calculate time
            recovery_time = (time.time() - start_time) * 1000
            
            return {
                "success": False,
                "browser": browser,
                "error": str(e),
                "recovery_time_ms": recovery_time
            }
            
    async def _recover_browser_inference(self, browser: str, shard_indices: List[int],
                                       inputs: Dict[str, Any], error: Exception,
                                       recovery_strategy: RecoveryStrategy) -> Dict[str, Any]:
        """
        Recover from a browser inference failure.
        
        Args:
            browser: Failed browser
            shard_indices: Shard indices to recover
            inputs: Input data
            error: Original error
            recovery_strategy: Recovery strategy to use
            
        Returns:
            Dictionary with recovery results
        """
        start_time = time.time()
        
        # Update recovery statistics
        self.recovery_stats["total_attempts"] += 1
        self.recovery_stats["by_browser"][browser]["attempts"] += 1
        self.recovery_stats["by_strategy"][recovery_strategy.value]["attempts"] += 1
        
        logger.info(f"Starting inference recovery for {browser} using {recovery_strategy.value} strategy")
        
        try:
            result = None
            
            # Apply recovery strategy
            if recovery_strategy == RecoveryStrategy.RECONNECT:
                # Try to reconnect and retry
                reconnect_result = await self._recover_browser(browser)
                
                if reconnect_result.get("success", False):
                    # Reconnected, retry inference
                    new_connection = self.browser_connections.get(browser)
                    
                    if new_connection:
                        result = await self._run_browser_inference(
                            browser=browser,
                            connection=new_connection,
                            shard_indices=shard_indices,
                            inputs=inputs
                        )
                        
            elif recovery_strategy == RecoveryStrategy.FAILOVER:
                # Find another browser to handle these shards
                backup_browser = None
                
                for b in self.browsers:
                    if b != browser and self.browser_states.get(b) == BrowserState.READY:
                        backup_browser = b
                        break
                        
                if backup_browser:
                    # Get backup browser connection
                    backup_connection = self.browser_connections.get(backup_browser)
                    
                    if backup_connection:
                        # Update browser state
                        self.browser_states[backup_browser] = BrowserState.BUSY
                        
                        # Run on backup browser
                        result = await self._run_browser_inference(
                            browser=backup_browser,
                            connection=backup_connection,
                            shard_indices=shard_indices,
                            inputs=inputs
                        )
                        
                        # Add failover information
                        if result:
                            result["failover"] = {
                                "original_browser": browser,
                                "backup_browser": backup_browser
                            }
                            
            elif recovery_strategy == RecoveryStrategy.PROGRESSIVE:
                # Try reconnect first, then failover
                reconnect_result = await self._recover_browser(browser)
                
                if reconnect_result.get("success", False):
                    # Reconnected, retry inference
                    new_connection = self.browser_connections.get(browser)
                    
                    if new_connection:
                        result = await self._run_browser_inference(
                            browser=browser,
                            connection=new_connection,
                            shard_indices=shard_indices,
                            inputs=inputs
                        )
                else:
                    # Reconnect failed, try failover
                    # Find another browser to handle these shards
                    backup_browser = None
                    
                    for b in self.browsers:
                        if b != browser and self.browser_states.get(b) == BrowserState.READY:
                            backup_browser = b
                            break
                            
                    if backup_browser:
                        # Get backup browser connection
                        backup_connection = self.browser_connections.get(backup_browser)
                        
                        if backup_connection:
                            # Update browser state
                            self.browser_states[backup_browser] = BrowserState.BUSY
                            
                            # Run on backup browser
                            result = await self._run_browser_inference(
                                browser=backup_browser,
                                connection=backup_connection,
                                shard_indices=shard_indices,
                                inputs=inputs
                            )
                            
                            # Add failover information
                            if result:
                                result["failover"] = {
                                    "original_browser": browser,
                                    "backup_browser": backup_browser
                                }
            else:
                # Default strategy (restart)
                reconnect_result = await self._recover_browser(browser)
                
                if reconnect_result.get("success", False):
                    # Restarted, retry inference
                    new_connection = self.browser_connections.get(browser)
                    
                    if new_connection:
                        result = await self._run_browser_inference(
                            browser=browser,
                            connection=new_connection,
                            shard_indices=shard_indices,
                            inputs=inputs
                        )
                        
            # Check if recovery succeeded
            if result:
                # Update recovery statistics
                self.recovery_stats["successful_recoveries"] += 1
                self.recovery_stats["by_browser"][browser]["successes"] += 1
                self.recovery_stats["by_strategy"][recovery_strategy.value]["successes"] += 1
                
                # Calculate recovery time
                recovery_time = (time.time() - start_time) * 1000
                self.recovery_stats["recovery_times_ms"].append(recovery_time)
                
                # Add recovery information to result
                result["recovery"] = {
                    "strategy": recovery_strategy.value,
                    "original_browser": browser,
                    "recovery_time_ms": recovery_time
                }
                
                # Record recovery event
                self.telemetry["recovery_events"].append({
                    "browser": browser,
                    "shards": shard_indices,
                    "recovery_time_ms": recovery_time,
                    "strategy": recovery_strategy.value,
                    "success": True,
                    "timestamp": time.time()
                })
                
                # Record in transaction log
                if self.transaction_log:
                    await self.transaction_log.append({
                        "action": "inference_recovered",
                        "browser": browser,
                        "recovery_strategy": recovery_strategy.value,
                        "recovery_time_ms": recovery_time,
                        "timestamp": time.time()
                    })
                    
                logger.info(f"Successfully recovered inference for {browser} in {recovery_time:.1f}ms using {recovery_strategy.value}")
                
                return {
                    "success": True,
                    "result": result,
                    "recovery_time_ms": recovery_time,
                    "strategy": recovery_strategy.value
                }
            else:
                # Recovery failed
                # Calculate time
                recovery_time = (time.time() - start_time) * 1000
                
                # Record failed recovery event
                self.telemetry["recovery_events"].append({
                    "browser": browser,
                    "shards": shard_indices,
                    "recovery_time_ms": recovery_time,
                    "strategy": recovery_strategy.value,
                    "success": False,
                    "timestamp": time.time()
                })
                
                logger.warning(f"Failed to recover inference for {browser} using {recovery_strategy.value}")
                
                return {
                    "success": False,
                    "error": "Recovery failed",
                    "original_error": str(error),
                    "recovery_time_ms": recovery_time,
                    "strategy": recovery_strategy.value
                }
                
        except Exception as e:
            logger.error(f"Error during inference recovery for {browser}: {e}")
            
            # Calculate time
            recovery_time = (time.time() - start_time) * 1000
            
            return {
                "success": False,
                "error": str(e),
                "original_error": str(error),
                "recovery_time_ms": recovery_time,
                "strategy": recovery_strategy.value
            }
            
    def _combine_browser_results(self, browser_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Combine results from multiple browsers.
        
        Args:
            browser_results: List of results from different browsers
            
        Returns:
            Combined result
        """
        if not browser_results:
            return {"output": "", "success": False, "error": "No browser results"}
            
        # Sort results by browser to ensure consistent ordering
        sorted_results = sorted(browser_results, key=lambda r: r.get("browser", ""))
        
        # Extract outputs
        outputs = [r.get("output", "") for r in sorted_results]
        
        # Create combined output
        if len(outputs) == 1:
            # Just one browser, use its output directly
            combined_output = outputs[0]
        else:
            # Multiple browsers, combine outputs intelligently
            # In a real implementation, this would implement proper combination logic
            # based on the model type and sharding strategy
            combined_output = self._intelligently_combine_outputs(outputs)
            
        # Calculate overall execution time (max of browser times)
        execution_times = [r.get("execution_time_ms", 0) for r in sorted_results]
        max_execution_time = max(execution_times) if execution_times else 0
        
        # Create combined result
        combined_result = {
            "output": combined_output,
            "success": True,
            "execution_time_ms": max_execution_time,
            "browser_count": len(sorted_results),
            "browsers_used": [r.get("browser") for r in sorted_results],
            "browser_outputs": {r.get("browser", f"browser-{i}"): r.get("output", "") 
                              for i, r in enumerate(sorted_results)}
        }
        
        return combined_result
        
    def _intelligently_combine_outputs(self, outputs: List[str]) -> str:
        """
        Intelligently combine outputs from multiple shards.
        
        Args:
            outputs: List of output texts
            
        Returns:
            Combined output text
        """
        # This is a simplified implementation that would be more sophisticated
        # in a real system based on the model type and sharding strategy
        
        # For demonstration, we'll just concatenate outputs with a separator
        return " ".join(outputs)
    
    def get_recovery_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about recovery attempts.
        
        Returns:
            Dictionary with recovery statistics
        """
        stats = dict(self.recovery_stats)
        
        # Calculate success rate
        total_attempts = stats["total_attempts"]
        successful_recoveries = stats["successful_recoveries"]
        success_rate = successful_recoveries / max(1, total_attempts)
        
        # Add success rate
        stats["success_rate"] = success_rate
        
        # Calculate average recovery time
        recovery_times = stats["recovery_times_ms"]
        avg_recovery_time = sum(recovery_times) / max(1, len(recovery_times))
        
        # Add average recovery time
        stats["avg_recovery_time_ms"] = avg_recovery_time
        
        # Add browser success rates
        for browser, browser_stats in stats["by_browser"].items():
            attempts = browser_stats["attempts"]
            successes = browser_stats["successes"]
            browser_success_rate = successes / max(1, attempts)
            stats["by_browser"][browser]["success_rate"] = browser_success_rate
            
        # Add strategy success rates
        for strategy, strategy_stats in stats["by_strategy"].items():
            attempts = strategy_stats["attempts"]
            successes = strategy_stats["successes"]
            strategy_success_rate = successes / max(1, attempts)
            stats["by_strategy"][strategy]["success_rate"] = strategy_success_rate
            
        # Add current browser states
        stats["current_browser_states"] = {b: s.value for b, s in self.browser_states.items()}
        
        return stats
        
    async def shutdown(self) -> Dict[str, Any]:
        """
        Shut down all browser connections and clean up resources.
        
        Returns:
            Dictionary with shutdown status
        """
        logger.info("Shutting down fault-tolerant model sharding")
        
        # Record shutdown in transaction log
        if self.transaction_log:
            await self.transaction_log.append({
                "action": "shutdown",
                "timestamp": time.time()
            })
            
        # Shut down all browsers
        for browser, connection in list(self.browser_connections.items()):
            try:
                # Close connection
                self.browser_states[browser] = BrowserState.FAILED
                
                # Remove from mapping
                self.browser_connections.pop(browser, None)
                
                logger.info(f"Shut down browser: {browser}")
                
            except Exception as e:
                logger.error(f"Error shutting down browser {browser}: {e}")
                
        # Shut down base manager
        if self.base_manager:
            self.base_manager.cleanup()
            
        # Calculate uptime
        uptime_ms = sum(self.telemetry["inference_times_ms"])
        
        return {
            "status": "shutdown_complete",
            "browsers_closed": len(self.browsers),
            "uptime_ms": uptime_ms,
            "recovery_attempts": self.recovery_stats["total_attempts"],
            "successful_recoveries": self.recovery_stats["successful_recoveries"]
        }
        
def create_fault_tolerant_sharding_config(model_name: str, browsers: List[str] = None,
                                        fault_tolerance_level: str = "medium",
                                        target_memory_per_shard_gb: float = 4.0) -> Dict[str, Any]:
    """
    Create a fault-tolerant sharding configuration.
    
    Args:
        model_name: Name of the model
        browsers: List of browsers to use
        fault_tolerance_level: Level of fault tolerance
        target_memory_per_shard_gb: Target memory per shard in GB
        
    Returns:
        Dictionary with sharding configuration
    """
    # Get default browsers if not specified
    if browsers is None:
        browsers = ["chrome", "firefox", "edge"]
        
    # Create temporary sharding manager
    temp_manager = FaultTolerantModelSharding(
        model_name=model_name,
        browsers=browsers,
        fault_tolerance_level=fault_tolerance_level
    )
    
    # Get base configuration
    base_config = create_sharding_config(
        model_name=model_name,
        target_memory_per_shard_gb=target_memory_per_shard_gb,
        network_topology="mesh" if fault_tolerance_level in ["high", "critical"] else "star"
    )
    
    # Add fault tolerance configuration
    fault_tolerance_config = {
        "fault_tolerance_level": fault_tolerance_level,
        "recovery_strategies": {
            "restart": {
                "timeout_sec": 30,
                "max_attempts": 3,
                "description": "Restart a failed browser"
            },
            "reconnect": {
                "timeout_sec": 10,
                "max_attempts": 5,
                "description": "Reconnect to a disconnected browser"
            },
            "failover": {
                "timeout_sec": 5,
                "max_attempts": 2,
                "description": "Switch to another browser"
            },
            "progressive": {
                "timeout_sec": 45,
                "max_attempts": 3,
                "description": "Try reconnect first, then failover"
            }
        },
        "state_replication": {
            "enabled": fault_tolerance_level in ["high", "critical"],
            "checkpoint_interval_sec": 30,
            "storage_mode": "distributed" if fault_tolerance_level == "critical" else "local"
        },
        "circuit_breaker": {
            "enabled": True,
            "failure_threshold": 3,
            "recovery_timeout_sec": 30,
            "half_open_timeout_sec": 5
        }
    }
    
    # Update recommended browser settings
    browser_settings = base_config.get("recommended_browser_settings", {})
    browser_settings["fault_tolerance_level"] = fault_tolerance_level
    browser_settings["state_replication"] = fault_tolerance_level in ["high", "critical"]
    browser_settings["minimum_browsers_required"] = {
        "none": 1,
        "low": 1,
        "medium": 2,
        "high": len(browsers) // 2 + 1,  # Majority
        "critical": len(browsers)  # All browsers
    }.get(fault_tolerance_level, 1)
    
    # Combine configurations
    config = {
        **base_config,
        "fault_tolerance": fault_tolerance_config,
        "recommended_browser_settings": browser_settings,
        "browsers": browsers
    }
    
    return config
    
async def run_with_fault_tolerance(model_name: str, inputs: Dict[str, Any],
                                browsers: List[str] = None,
                                fault_tolerance_level: str = "medium") -> Dict[str, Any]:
    """
    Run inference with fault tolerance.
    
    Args:
        model_name: Name of the model
        inputs: Input data
        browsers: List of browsers to use
        fault_tolerance_level: Level of fault tolerance
        
    Returns:
        Dictionary with inference results
    """
    # Create fault-tolerant sharding manager
    manager = FaultTolerantModelSharding(
        model_name=model_name,
        browsers=browsers,
        fault_tolerance_level=fault_tolerance_level
    )
    
    try:
        # Initialize sharding
        await manager.initialize()
        
        # Run inference
        result = await manager.run_inference(inputs)
        
        # Get recovery statistics
        stats = manager.get_recovery_statistics()
        
        # Add recovery statistics to result
        if isinstance(result, dict):
            result["recovery_statistics"] = {
                "total_attempts": stats["total_attempts"],
                "successful_recoveries": stats["successful_recoveries"],
                "success_rate": stats["success_rate"],
                "avg_recovery_time_ms": stats["avg_recovery_time_ms"]
            }
            
        return result
    finally:
        # Shutdown
        await manager.shutdown()
        
# Main function for testing
async def main():
    # Test fault-tolerant model sharding
    print("Testing Fault-Tolerant Cross-Browser Model Sharding")
    
    # Sample models
    test_models = ["llama-7b", "llama-70b", "t5-large"]
    
    for model in test_models:
        print(f"\nTesting model: {model}")
        
        # Create fault tolerance configuration
        config = create_fault_tolerant_sharding_config(
            model_name=model,
            browsers=["chrome", "firefox", "edge"],
            fault_tolerance_level="high"
        )
        
        print(f"Model size: {config['model_properties']['model_size_gb']:.1f} GB")
        print(f"Shard count: {config['shard_count']}")
        print(f"Fault tolerance level: {config['fault_tolerance']['fault_tolerance_level']}")
        print(f"Browsers: {config['browsers']}")
        
        # Run with fault tolerance
        result = await run_with_fault_tolerance(
            model_name=model,
            inputs={"input": "This is a test input for fault-tolerant inference."},
            browsers=["chrome", "firefox", "edge"],
            fault_tolerance_level="high"
        )
        
        print(f"Inference completed: {result.get('success', False)}")
        print(f"Output: {result.get('output', '')[:50]}...")
        print(f"Inference time: {result.get('inference_time_ms', 0):.1f}ms")
        
        if "recovery_statistics" in result:
            stats = result["recovery_statistics"]
            print(f"Recovery attempts: {stats['total_attempts']}")
            print(f"Successful recoveries: {stats['successful_recoveries']}")
            print(f"Success rate: {stats['success_rate']:.1%}")
            print(f"Avg recovery time: {stats['avg_recovery_time_ms']:.1f}ms")
            
if __name__ == "__main__":
    asyncio.run(main())