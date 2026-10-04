#!/usr/bin/env python3
"""
Enhanced Resource Pool Bridge Integration with Performance-Based Recovery (July 2025)

This module integrates the WebNN/WebGPU Resource Pool Bridge with advanced recovery,
performance monitoring, and resource optimization systems including:
- Enhanced circuit breaker with sophisticated health monitoring
- Performance trend analysis with statistical significance testing
- Browser-specific optimizations based on historical performance
- Comprehensive reporting and metrics visualization
- Improved integration with DuckDB for historical data storage

Key features:
- Sophisticated Circuit Breaker pattern for preventing cascading failures
- Health score monitoring (0-100 scale) for browser connections
- Performance history tracking with DuckDB database integration
- Performance trend analysis with statistical significance testing
- Regression detection and severity classification
- Browser-specific optimizations based on historical performance
- Adaptive browser selection for different model types (text, vision, audio)

Usage:
    from fixed_web_platform.resource_pool_bridge_integration_enhanced import ResourcePoolBridgeIntegrationEnhanced
    
    # Create enhanced pool with recovery
    pool = ResourcePoolBridgeIntegrationEnhanced(
        max_connections=4,
        enable_circuit_breaker=True,
        enable_performance_history=True,
        db_path="./benchmark_db.duckdb"
    )
    
    # Initialize 
    pool.initialize()
    
    # Get model with automatic recovery and optimal browser selection
    model = pool.get_model(model_type="text", model_name="bert-base-uncased")
    
    # Run inference with recovery and performance tracking
    result = model(inputs)
"""

import os
import sys
import time
import json
import asyncio
import logging
import traceback
from typing import Any, Dict, List, Optional, Tuple, Union, Callable, Set

# Import circuit breaker
from fixed_web_platform.circuit_breaker import CircuitBreaker, BrowserCircuitBreakerManager
CIRCUIT_BREAKER_AVAILABLE = True

# Import performance trend analyzer
from fixed_web_platform.performance_trend_analyzer import PerformanceTrendAnalyzer, TrendDirection, RegressionSeverity
PERFORMANCE_ANALYZER_AVAILABLE = True

# Import connection pooling and health monitoring
try:
    from fixed_web_platform.connection_pool_manager import ConnectionPoolManager
    ADVANCED_POOLING_AVAILABLE = True
except ImportError:
    ADVANCED_POOLING_AVAILABLE = False

# Import tensor sharing
try:
    from fixed_web_platform.cross_model_tensor_sharing import TensorSharingManager
    TENSOR_SHARING_AVAILABLE = True
except ImportError:
    TENSOR_SHARING_AVAILABLE = False
    
# Import ultra-low precision support
try:
    from fixed_web_platform.webgpu_ultra_low_precision import UltraLowPrecisionManager
    ULTRA_LOW_PRECISION_AVAILABLE = True
except ImportError:
    ULTRA_LOW_PRECISION_AVAILABLE = False

# Import browser performance history tracking
try:
    from fixed_web_platform.browser_performance_history import BrowserPerformanceHistory
    BROWSER_HISTORY_AVAILABLE = True
except ImportError:
    BROWSER_HISTORY_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add parent directory to path to import recovery system
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Import recovery system
try:
    from resource_pool_bridge_recovery import (
        ResourcePoolBridgeRecovery,
        ResourcePoolBridgeWithRecovery,
        ErrorCategory, 
        RecoveryStrategy
    )
    RECOVERY_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Could not import resource_pool_bridge_recovery: {e}")
    logger.warning("Continuing without recovery capabilities")
    RECOVERY_AVAILABLE = False


class ResourcePoolBridgeIntegrationEnhanced:
    """
    Enhanced WebNN/WebGPU Resource Pool with Advanced Recovery and Performance Systems (July 2025).
    
    This class integrates the ResourcePoolBridgeIntegration with advanced error recovery,
    performance monitoring, and resource optimization systems.
    
    Key enhancements include:
    - Enhanced Circuit Breaker pattern with sophisticated health monitoring
    - Performance Trend Analysis with statistical significance testing
    - Browser-specific optimizations based on historical performance
    - Comprehensive reporting and metrics visualization
    - Improved integration with DuckDB for historical data storage
    
    The July 2025 enhancements include:
    - Enhanced error recovery with performance-based strategies
    - Performance history tracking and trend analysis
    - Sophisticated regression detection with severity classification
    - Browser recommendation system based on historical performance
    - Integration with DuckDB for efficient storage and analysis
    """
    
    def __init__(
        self,
        max_connections: int = 4,
        enable_gpu: bool = True,
        enable_cpu: bool = True,
        headless: bool = True,
        browser_preferences: Optional[Dict[str, str]] = None,
        adaptive_scaling: bool = True,
        enable_recovery: bool = True,
        max_retries: int = 3,
        fallback_to_simulation: bool = True,
        monitoring_interval: int = 60,
        enable_ipfs: bool = True,
        db_path: Optional[str] = None,
        enable_tensor_sharing: bool = True,
        enable_ultra_low_precision: bool = True,
        enable_circuit_breaker: bool = True,
        enable_browser_history: bool = True,
        enable_performance_trend_analysis: bool = True,
        max_memory_mb: int = 2048
    ):
        """
        Initialize the enhanced resource pool with recovery and performance analysis.
        
        Args:
            max_connections: Maximum browser connections to maintain
            enable_gpu: Whether to enable GPU acceleration
            enable_cpu: Whether to enable CPU fallback
            headless: Whether to run browsers in headless mode
            browser_preferences: Browser preferences by model type
            adaptive_scaling: Whether to dynamically scale connections based on load
            enable_recovery: Whether to enable recovery capabilities
            max_retries: Maximum number of retry attempts per operation
            fallback_to_simulation: Whether to allow fallback to simulation mode
            monitoring_interval: Interval for monitoring in seconds
            enable_ipfs: Whether to enable IPFS acceleration
            db_path: Path to database for storing results
            enable_tensor_sharing: Whether to enable cross-model tensor sharing for memory efficiency
            enable_ultra_low_precision: Whether to enable 2-bit and 3-bit quantization support
            enable_circuit_breaker: Whether to enable circuit breaker pattern for health monitoring
            enable_browser_history: Whether to enable browser performance history tracking
            enable_performance_trend_analysis: Whether to enable performance trend analysis (July 2025)
            max_memory_mb: Maximum memory usage in MB for tensor sharing and browser connections
        """
        self.max_connections = max_connections
        self.enable_gpu = enable_gpu
        self.enable_cpu = enable_cpu
        self.headless = headless
        self.browser_preferences = browser_preferences or {}
        self.adaptive_scaling = adaptive_scaling
        self.enable_recovery = enable_recovery and RECOVERY_AVAILABLE
        self.max_retries = max_retries
        self.fallback_to_simulation = fallback_to_simulation
        self.monitoring_interval = monitoring_interval
        self.enable_ipfs = enable_ipfs
        self.db_path = db_path
        
        # March 2025 enhancements
        self.enable_tensor_sharing = enable_tensor_sharing and TENSOR_SHARING_AVAILABLE
        self.enable_ultra_low_precision = enable_ultra_low_precision and ULTRA_LOW_PRECISION_AVAILABLE
        self.enable_circuit_breaker = enable_circuit_breaker and CIRCUIT_BREAKER_AVAILABLE
        self.max_memory_mb = max_memory_mb
        
        # May 2025 enhancements
        self.enable_browser_history = enable_browser_history and BROWSER_HISTORY_AVAILABLE
        
        # July 2025 enhancements - Performance trend analysis
        self.enable_performance_trend_analysis = enable_performance_trend_analysis and PERFORMANCE_ANALYZER_AVAILABLE
        
        # Initialize logger
        logger.info(f"ResourcePoolBridgeIntegrationEnhanced created with max_connections={max_connections}, "
                   f"recovery={'enabled' if self.enable_recovery else 'disabled'}, "
                   f"adaptive_scaling={'enabled' if adaptive_scaling else 'disabled'}, "
                   f"tensor_sharing={'enabled' if self.enable_tensor_sharing else 'disabled'}, "
                   f"ultra_low_precision={'enabled' if self.enable_ultra_low_precision else 'disabled'}, "
                   f"circuit_breaker={'enabled' if self.enable_circuit_breaker else 'disabled'}, "
                   f"browser_history={'enabled' if self.enable_browser_history else 'disabled'}, "
                   f"performance_trend_analysis={'enabled' if self.enable_performance_trend_analysis else 'disabled'}")
        
        # Will be initialized in initialize()
        self.bridge = None
        self.bridge_with_recovery = None
        self.initialized = False
        
        # March 2025 enhancements
        self.connection_pool = None
        self.circuit_breaker_manager = None
        self.tensor_sharing_manager = None
        self.ultra_low_precision_manager = None
        
        # May 2025 enhancements
        self.browser_history = None
        
        # July 2025 enhancements
        self.performance_analyzer = None
    
    def initialize(self) -> bool:
        """
        Initialize the resource pool bridge with recovery capabilities.
        
        Returns:
            bool: Success status
        """
        try:
            # Import core bridge implementation
            from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
            
            # Create base bridge
            self.bridge = ResourcePoolBridgeIntegration(
                max_connections=self.max_connections,
                enable_gpu=self.enable_gpu,
                enable_cpu=self.enable_cpu,
                headless=self.headless,
                browser_preferences=self.browser_preferences,
                adaptive_scaling=self.adaptive_scaling,
                monitoring_interval=self.monitoring_interval,
                enable_ipfs=self.enable_ipfs,
                db_path=self.db_path
            )
            
            # Initialize March 2025 enhancements
            
            # Initialize tensor sharing if enabled
            if self.enable_tensor_sharing and TENSOR_SHARING_AVAILABLE:
                logger.info("Initializing cross-model tensor sharing")
                self.tensor_sharing_manager = TensorSharingManager(max_memory_mb=self.max_memory_mb)
            
            # Initialize ultra-low precision if enabled
            if self.enable_ultra_low_precision and ULTRA_LOW_PRECISION_AVAILABLE:
                logger.info("Initializing ultra-low precision support")
                self.ultra_low_precision_manager = UltraLowPrecisionManager()
                
            # Initialize browser performance history if enabled
            if self.enable_browser_history and BROWSER_HISTORY_AVAILABLE:
                logger.info("Initializing browser performance history tracking (May 2025)")
                self.browser_history = BrowserPerformanceHistory(db_path=self.db_path)
                # Start automatic updates 
                self.browser_history.start_automatic_updates()
                
            # Initialize performance trend analyzer (July 2025)
            if self.enable_performance_trend_analysis and PERFORMANCE_ANALYZER_AVAILABLE:
                logger.info("Initializing performance trend analyzer (July 2025)")
                self.performance_analyzer = PerformanceTrendAnalyzer(
                    db_path=self.db_path,
                    logger=logger
                )
            
            # Initialize base bridge
            if hasattr(self.bridge, 'initialize'):
                loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
                success = loop.run_until_complete(self.bridge.initialize())
                if not success:
                    logger.error("Failed to initialize base bridge")
                    return False
            
            # Create recovery wrapper if enabled
            if self.enable_recovery:
                self.bridge_with_recovery = ResourcePoolBridgeWithRecovery(
                    integration=self.bridge,
                    max_connections=self.max_connections,
                    browser_preferences=self.browser_preferences,
                    max_retries=self.max_retries,
                    fallback_to_simulation=self.fallback_to_simulation
                )
                
                # Initialize recovery bridge
                success = self.bridge_with_recovery.initialize()
                if not success:
                    logger.error("Failed to initialize recovery bridge")
                    return False
            
            # Initialize circuit breaker manager if enabled
            if self.enable_circuit_breaker and CIRCUIT_BREAKER_AVAILABLE:
                logger.info("Initializing circuit breaker manager")
                
                # Get browser connections from bridge
                browser_connections = {}
                if hasattr(self.bridge, 'browser_connections'):
                    browser_connections = self.bridge.browser_connections
                
                if browser_connections:
                    # Create circuit breaker manager
                    self.circuit_breaker_manager = BrowserCircuitBreakerManager(
                        logger=logger,
                        db_path=self.db_path,
                        enable_performance_history=True
                    )
                    
                    # Initialize circuit breakers for each browser
                    for browser_id, browser_info in browser_connections.items():
                        browser_type = browser_info.get('type', 'unknown')
                        self.circuit_breaker_manager.get_or_create_circuit(browser_id, browser_type)
                    
                    logger.info("Circuit breaker manager initialized successfully")
            
            # Initialize connection pool if not already part of bridge
            if self.adaptive_scaling and ADVANCED_POOLING_AVAILABLE and not hasattr(self.bridge, 'connection_pool'):
                logger.info("Initializing connection pool manager")
                
                # Create connection pool manager
                self.connection_pool = ConnectionPoolManager(
                    min_connections=1,
                    max_connections=self.max_connections,
                    browser_preferences=self.browser_preferences,
                    adaptive_scaling=self.adaptive_scaling,
                    db_path=self.db_path
                )
                
                # Initialize connection pool
                loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
                loop.run_until_complete(self.connection_pool.initialize())
                
                logger.info("Connection pool manager initialized successfully")
            
            self.initialized = True
            logger.info(f"ResourcePoolBridgeIntegrationEnhanced initialized successfully "
                       f"(recovery={'enabled' if self.enable_recovery else 'disabled'}, "
                       f"tensor_sharing={'enabled' if self.tensor_sharing_manager else 'disabled'}, "
                       f"ultra_low_precision={'enabled' if self.ultra_low_precision_manager else 'disabled'}, "
                       f"circuit_breaker={'enabled' if self.circuit_breaker_manager else 'disabled'}, "
                       f"performance_analysis={'enabled' if self.performance_analyzer else 'disabled'})")
            return True
            
        except ImportError as e:
            logger.error(f"Error importing required modules: {e}")
            return False
        except Exception as e:
            logger.error(f"Error initializing resource pool bridge: {e}")
            traceback.print_exc()
            return False
    
    def get_model(self, model_type: str, model_name: str, hardware_preferences: Optional[Dict[str, Any]] = None) -> Any:
        """
        Get a model with fault-tolerant error handling and recovery.
        
        Uses performance history and trend analysis to select the optimal browser.
        
        Args:
            model_type: Type of model (text, vision, audio, etc.)
            model_name: Name of the model
            hardware_preferences: Hardware preferences for model execution
            
        Returns:
            Model object or None on failure
        """
        if not self.initialized:
            logger.error("ResourcePoolBridgeIntegrationEnhanced not initialized")
            return None
            
        # Apply browser-specific optimizations based on performance history if enabled
        if self.enable_browser_history and self.browser_history:
            try:
                # Use performance trend analyzer for smarter browser selection if available
                if self.enable_performance_trend_analysis and self.performance_analyzer:
                    try:
                        # Get browser recommendations from performance analyzer
                        recommendations = self.performance_analyzer.get_browser_recommendations(force_refresh=False)
                        
                        # Check if we have a recommendation for this model type
                        model_type_key = model_type
                        if model_type_key not in recommendations and "any" in recommendations:
                            model_type_key = "any"
                            
                        if model_type_key in recommendations:
                            recommendation = recommendations[model_type_key]
                            
                            # Only override preferences if we have high confidence
                            if recommendation.get("confidence", 0) >= 0.6:
                                # Create hardware preferences if not provided
                                if hardware_preferences is None:
                                    hardware_preferences = {}
                                
                                # Add recommended browser if not explicitly specified by user
                                if "browser" not in hardware_preferences:
                                    recommended_browser = recommendation.get("recommended_browser")
                                    if recommended_browser:
                                        hardware_preferences["browser"] = recommended_browser
                                        logger.info(f"Using trend analyzer recommended browser '{recommended_browser}' for {model_type}/{model_name} "
                                                   f"(confidence: {recommendation.get('confidence', 0):.2f})")
                                
                                # Add recommended platform if not explicitly specified by user
                                if "priority_list" not in hardware_preferences and "platform" not in hardware_preferences:
                                    # Best platform is usually related to the browser
                                    recommended_browser = recommendation.get("recommended_browser")
                                    if recommended_browser:
                                        # Create priority list based on browser type
                                        if recommended_browser == "edge":
                                            hardware_preferences["priority_list"] = ["webnn", "webgpu", "cpu"]
                                        elif recommended_browser in ["chrome", "firefox"]:
                                            hardware_preferences["priority_list"] = ["webgpu", "webnn", "cpu"]
                                        else:
                                            hardware_preferences["priority_list"] = ["webgpu", "webnn", "cpu"]
                                            
                                        logger.info(f"Using platform priority list for {recommended_browser}: {hardware_preferences['priority_list']}")
                                        
                                # Check for regressions that should affect our strategy
                                model_trends = self.performance_analyzer.analyze_model_trends(
                                    model_name=model_name,
                                    time_window_days=7.0
                                )
                                
                                if model_trends and "latency" in model_trends:
                                    latency_trend = model_trends["latency"]
                                    if (latency_trend.direction == TrendDirection.DEGRADING and 
                                        latency_trend.regression_severity in [RegressionSeverity.SEVERE, RegressionSeverity.CRITICAL]):
                                        # Severe regression detected, apply mitigation
                                        logger.warning(f"Severe performance regression detected for {model_name}: {latency_trend.percent_change:.1f}% degradation")
                                        
                                        # Mark as fallback-required to allow faster switching when performance is bad
                                        if "fallback_threshold" not in hardware_preferences:
                                            hardware_preferences["fallback_threshold"] = 1.5  # Lower threshold for faster fallback
                                        
                                        # Increase retry limit for degraded model
                                        if "retry_limit" not in hardware_preferences:
                                            hardware_preferences["retry_limit"] = 2  # Lower retry limit to fail faster
                    except Exception as e:
                        logger.warning(f"Error using performance trend analyzer for browser selection: {e}")
                        # Continue with basic browser history recommendations
                
                # Fall back to basic optimization if enhanced analytics not available or failed
                if "browser" not in (hardware_preferences or {}):
                    try:
                        # Use the basic BrowserPerformanceHistory recommendations
                        basic_recommendation = self.browser_history.get_browser_recommendations(
                            model_type=model_type,
                            model_name=model_name
                        )
                        
                        # Only override preferences if we have recommendations
                        if basic_recommendation:
                            # Create hardware preferences if not provided
                            if hardware_preferences is None:
                                hardware_preferences = {}
                            
                            # Add recommended browser if not explicitly specified by user
                            if "browser" not in hardware_preferences:
                                recommended_browser = basic_recommendation.get("recommended_browser")
                                if recommended_browser:
                                    hardware_preferences["browser"] = recommended_browser
                                    logger.info(f"Using browser history recommended browser '{recommended_browser}' for {model_type}/{model_name}")
                            
                            # Add recommended platform if not explicitly specified by user
                            if "priority_list" not in hardware_preferences and "platform" not in hardware_preferences:
                                recommended_platform = basic_recommendation.get("recommended_platform")
                                if recommended_platform:
                                    # Create priority list with recommended platform first
                                    if recommended_platform == "webnn":
                                        hardware_preferences["priority_list"] = ["webnn", "webgpu", "cpu"]
                                    elif recommended_platform == "webgpu":
                                        hardware_preferences["priority_list"] = ["webgpu", "webnn", "cpu"]
                                    else:
                                        hardware_preferences["priority_list"] = [recommended_platform, "webgpu", "webnn", "cpu"]
                    except Exception as e:
                        logger.warning(f"Error using browser history recommendations: {e}")
            
            except Exception as e:
                logger.warning(f"Error applying browser-specific optimizations: {e}")
                # Continue without optimizations
        
        # Apply circuit breaker checks if enabled
        browser_to_use = None
        if self.enable_circuit_breaker and self.circuit_breaker_manager:
            try:
                # Get browser health metrics
                browser_health = self.circuit_breaker_manager.get_browser_type_health()
                
                if browser_health:
                    # Check if requested browser is in circuit breaker OPEN state
                    requested_browser = hardware_preferences.get("browser") if hardware_preferences else None
                    
                    if requested_browser:
                        # Find all circuits for this browser type
                        open_circuits = {}
                        for browser_id, circuit in self.circuit_breaker_manager.circuit_breakers.items():
                            if circuit.name.startswith(f"{requested_browser}_") and circuit.state == "open":
                                open_circuits[browser_id] = circuit.get_metrics()
                        
                        if open_circuits:
                            # All instances of requested browser type are in OPEN state
                            # Find a healthy browser of different type
                            logger.warning(f"All {requested_browser} browser circuits are OPEN. Looking for alternative browser.")
                            
                            # Get browser recommendations
                            if self.performance_analyzer:
                                recommendations = self.performance_analyzer.get_browser_recommendations(force_refresh=True)
                                
                                # Get recommendation for this model type or "any"
                                model_type_key = model_type if model_type in recommendations else "any"
                                if model_type_key in recommendations:
                                    alternative_browsers = [
                                        b["browser_type"] for b in recommendations[model_type_key].get("all_browsers", [])
                                        if b["browser_type"] != requested_browser
                                    ]
                                    
                                    if alternative_browsers:
                                        browser_to_use = alternative_browsers[0]
                                        logger.info(f"Circuit breaker selects alternative browser: {browser_to_use}")
                                        
                                        # Update hardware preferences
                                        if hardware_preferences is None:
                                            hardware_preferences = {}
                                        hardware_preferences["browser"] = browser_to_use
                                        
                                        # Set appropriate platform priority
                                        if browser_to_use == "edge":
                                            hardware_preferences["priority_list"] = ["webnn", "webgpu", "cpu"]
                                        else:
                                            hardware_preferences["priority_list"] = ["webgpu", "webnn", "cpu"]
            except Exception as e:
                logger.warning(f"Error checking circuit breaker state: {e}")
        
        # Use recovery bridge if enabled
        if self.enable_recovery and self.bridge_with_recovery:
            model = self.bridge_with_recovery.get_model(
                model_type=model_type,
                model_name=model_name,
                hardware_preferences=hardware_preferences
            )
        # Fall back to base bridge if recovery not enabled
        elif hasattr(self.bridge, 'get_model_sync'):
            # Use synchronous version if available (for testing)
            model = self.bridge.get_model_sync(
                model_type=model_type,
                model_name=model_name,
                hardware_preferences=hardware_preferences
            )
        elif hasattr(self.bridge, 'get_model'):
            loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
            model = loop.run_until_complete(
                self.bridge.get_model(
                    model_type=model_type,
                    model_name=model_name,
                    hardware_preferences=hardware_preferences
                )
            )
        else:
            return None
            
        # Record execution metrics after model is loaded
        if model is not None:
            # Record in browser history if enabled
            if self.enable_browser_history and self.browser_history:
                try:
                    # Get browser and platform information from model if available
                    browser = None
                    platform = None
                    
                    if hasattr(model, 'browser'):
                        browser = model.browser
                    elif hasattr(model, '_browser'):
                        browser = model._browser
                    elif hardware_preferences and "browser" in hardware_preferences:
                        browser = hardware_preferences["browser"]
                        
                    if hasattr(model, 'platform'):
                        platform = model.platform
                    elif hasattr(model, '_platform'):
                        platform = model._platform
                    elif hardware_preferences and "platform" in hardware_preferences:
                        platform = hardware_preferences.get("platform")
                    elif hardware_preferences and "priority_list" in hardware_preferences:
                        # Use first item in priority list
                        platform = hardware_preferences["priority_list"][0]
                        
                    # Record model instantiation if we have browser and platform info
                    if browser and platform:
                        try:
                            # Get initial metrics if available
                            metrics = {}
                            
                            if hasattr(model, 'get_startup_metrics'):
                                startup_metrics = model.get_startup_metrics()
                                if startup_metrics:
                                    metrics.update(startup_metrics)
                            
                            # Record execution in performance history
                            self.browser_history.record_execution(
                                browser=browser,
                                model_type=model_type,
                                model_name=model_name,
                                platform=platform,
                                metrics=metrics
                            )
                        except Exception as e:
                            logger.warning(f"Error recording model instantiation in browser history: {e}")
                except Exception as e:
                    logger.warning(f"Error recording model instantiation in browser history: {e}")
            
            # Record in performance analyzer if enabled
            if self.enable_performance_trend_analysis and self.performance_analyzer:
                try:
                    # Get browser and platform information from model if available
                    browser_id = None
                    browser_type = None
                    
                    if hasattr(model, 'browser_id'):
                        browser_id = model.browser_id
                    elif hasattr(model, '_browser_id'):
                        browser_id = model._browser_id
                        
                    if hasattr(model, 'browser'):
                        browser_type = model.browser
                    elif hasattr(model, '_browser'):
                        browser_type = model._browser
                    elif hardware_preferences and "browser" in hardware_preferences:
                        browser_type = hardware_preferences["browser"]
                        
                    # Generate a browser ID if not available
                    if not browser_id and browser_type:
                        browser_id = f"{browser_type}_{id(model)}"
                        
                    # Record model instantiation if we have browser info
                    if browser_id and browser_type:
                        # Get initial metrics if available
                        metrics = {}
                        duration_ms = 0
                        
                        if hasattr(model, 'get_startup_metrics'):
                            startup_metrics = model.get_startup_metrics()
                            if startup_metrics:
                                metrics.update(startup_metrics)
                                duration_ms = startup_metrics.get("startup_time_ms", 0)
                                
                        # Record in performance analyzer
                        self.performance_analyzer.record_operation(
                            browser_id=browser_id,
                            browser_type=browser_type,
                            model_type=model_type,
                            model_name=model_name,
                            operation_type="initialization",
                            duration_ms=duration_ms,
                            success=True,
                            metrics=metrics
                        )
                except Exception as e:
                    logger.warning(f"Error recording model instantiation in performance analyzer: {e}")
        
        return model
    
    def execute_concurrent(self, model_and_inputs_list: List[Tuple[Any, Any]]) -> List[Dict[str, Any]]:
        """
        Execute multiple models concurrently with fault-tolerant error handling.
        
        Args:
            model_and_inputs_list: List of (model, inputs) tuples
            
        Returns:
            List of results corresponding to inputs
        """
        if not self.initialized:
            logger.error("ResourcePoolBridgeIntegrationEnhanced not initialized")
            return [{"success": False, "error": "Not initialized"} for _ in model_and_inputs_list]
            
        # Start time for performance tracking
        start_time = time.time()
        
        # Apply runtime optimizations if circuit breaker and performance analyzer are available
        if (self.enable_circuit_breaker and self.circuit_breaker_manager and 
            self.enable_performance_trend_analysis and self.performance_analyzer):
            try:
                # Apply model-specific optimizations to each model
                for i, (model, inputs) in enumerate(model_and_inputs_list):
                    if model is None:
                        continue
                        
                    # Extract model browser
                    browser_id = None
                    browser_type = None
                    model_type = None
                    model_name = None
                    
                    # Get browser ID
                    if hasattr(model, 'browser_id'):
                        browser_id = model.browser_id
                    elif hasattr(model, '_browser_id'):
                        browser_id = model._browser_id
                        
                    # Get browser type
                    if hasattr(model, 'browser'):
                        browser_type = model.browser
                    elif hasattr(model, '_browser'):
                        browser_type = model._browser
                        
                    # Get model type and name
                    if hasattr(model, 'model_type'):
                        model_type = model.model_type
                    elif hasattr(model, '_model_type'):
                        model_type = model._model_type
                        
                    if hasattr(model, 'model_name'):
                        model_name = model.model_name
                    elif hasattr(model, '_model_name'):
                        model_name = model._model_name
                    
                    # Skip if we don't have enough info
                    if not browser_id or not browser_type:
                        continue
                        
                    # Check if this browser has a circuit breaker
                    circuit = self.circuit_breaker_manager.get_or_create_circuit(browser_id, browser_type)
                    
                    # Check circuit health
                    if circuit.state == "open":
                        logger.warning(f"Circuit {circuit.name} is OPEN. Model {i} will likely fail.")
                        
                        # Record potential failure in performance analyzer
                        if model_type and model_name:
                            self.performance_analyzer.record_operation(
                                browser_id=browser_id,
                                browser_type=browser_type,
                                model_type=model_type,
                                model_name=model_name,
                                operation_type="inference_attempted",
                                duration_ms=0,
                                success=False,
                                error="Circuit breaker open",
                                metrics={"circuit_state": "open", "health_score": circuit.health_score}
                            )
                    elif circuit.state == "half-open":
                        logger.info(f"Circuit {circuit.name} is HALF-OPEN. Model {i} will be tested carefully.")
                        
                    # Get performance trends if we have model info
                    if model_type and model_name:
                        try:
                            model_trends = self.performance_analyzer.analyze_model_trends(
                                model_name=model_name,
                                time_window_days=7.0,
                                browser_type=browser_type
                            )
                            
                            if model_trends and "latency" in model_trends:
                                latency_trend = model_trends["latency"]
                                if latency_trend.direction == TrendDirection.DEGRADING:
                                    logger.warning(f"Model {model_name} on {browser_type} shows {latency_trend.percent_change:.1f}% "
                                                 f"performance degradation (severity: {latency_trend.regression_severity.value})")
                        except Exception as e:
                            logger.warning(f"Error analyzing model trends: {e}")
                            
            except Exception as e:
                logger.warning(f"Error applying circuit breaker checks: {e}")
        
        # Use recovery bridge if enabled
        if self.enable_recovery and self.bridge_with_recovery:
            results = self.bridge_with_recovery.execute_concurrent(model_and_inputs_list)
        # Fall back to base bridge if recovery not enabled
        elif hasattr(self.bridge, 'execute_concurrent_sync'):
            results = self.bridge.execute_concurrent_sync(model_and_inputs_list)
        elif hasattr(self.bridge, 'execute_concurrent'):
            loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
            results = loop.run_until_complete(self.bridge.execute_concurrent(model_and_inputs_list))
        else:
            return [{"success": False, "error": "execute_concurrent not available"} for _ in model_and_inputs_list]
            
        # End time for performance tracking
        end_time = time.time()
        total_duration_ms = (end_time - start_time) * 1000
        
        # Record performance metrics if enabled
        if self.enable_browser_history and self.browser_history:
            # Group models by browser, model_type, model_name, and platform
            models_by_group = {}
            
            for i, (model, _) in enumerate(model_and_inputs_list):
                if model is None:
                    continue
                    
                # Extract model info
                browser = None
                platform = None
                model_type = None
                model_name = None
                
                # Get browser
                if hasattr(model, 'browser'):
                    browser = model.browser
                elif hasattr(model, '_browser'):
                    browser = model._browser
                
                # Get platform
                if hasattr(model, 'platform'):
                    platform = model.platform
                elif hasattr(model, '_platform'):
                    platform = model._platform
                
                # Get model type and name
                if hasattr(model, 'model_type'):
                    model_type = model.model_type
                elif hasattr(model, '_model_type'):
                    model_type = model._model_type
                    
                if hasattr(model, 'model_name'):
                    model_name = model.model_name
                elif hasattr(model, '_model_name'):
                    model_name = model._model_name
                
                # Skip if we don't have all required info
                if not all([browser, platform, model_type, model_name]):
                    continue
                
                # Create group key
                group_key = (browser, model_type, model_name, platform)
                
                # Add to group
                if group_key not in models_by_group:
                    models_by_group[group_key] = []
                    
                models_by_group[group_key].append((i, model))
            
            # Record metrics for each group
            for (browser, model_type, model_name, platform), models in models_by_group.items():
                # Count successful results
                success_count = 0
                for i, _ in models:
                    if i < len(results) and results[i].get("success", False):
                        success_count += 1
                
                # Calculate performance metrics
                avg_per_model_ms = total_duration_ms / len(model_and_inputs_list)
                throughput = len(model_and_inputs_list) * 1000 / total_duration_ms if total_duration_ms > 0 else 0
                success_rate = success_count / len(models) if len(models) > 0 else 0
                
                # Create metrics dictionary
                metrics = {
                    "latency_ms": avg_per_model_ms,
                    "throughput_models_per_sec": throughput,
                    "success_rate": success_rate,
                    "batch_size": len(models),
                    "concurrent_models": len(model_and_inputs_list),
                    "total_duration_ms": total_duration_ms,
                    "success": success_rate > 0.9  # Consider successful if >90% of models succeeded
                }
                
                # Add execution metrics from results if available
                for i, model in models:
                    if i < len(results):
                        result = results[i]
                        if "execution_metrics" in result:
                            for metric, value in result["execution_metrics"].items():
                                # Add to metrics with model index
                                metrics[f"model_{i}_{metric}"] = value
                                
                        # Add optimization information if available
                        if hasattr(model, 'execution_context') and model.execution_context:
                            metrics["optimizations_applied"] = True
                            # Add key optimization parameters to metrics
                            for opt_key in ["batch_size", "compute_precision", "parallel_execution"]:
                                if opt_key in model.execution_context:
                                    metrics[f"optimization_{opt_key}"] = model.execution_context[opt_key]
                
                try:
                    # Record execution in performance history
                    self.browser_history.record_execution(
                        browser=browser,
                        model_type=model_type,
                        model_name=model_name,
                        platform=platform,
                        metrics=metrics
                    )
                    
                    # Log performance metrics at INFO level if exceptionally good
                    if throughput > 10 or avg_per_model_ms < 50:  # Very good performance
                        logger.info(f"Excellent performance for {model_type}/{model_name} on {browser}/{platform}: "
                                   f"{throughput:.1f} models/sec, {avg_per_model_ms:.1f}ms per model")
                    # Log at DEBUG level otherwise
                    elif logger.isEnabledFor(logging.DEBUG):
                        logger.debug(f"Performance for {model_type}/{model_name} on {browser}/{platform}: "
                                    f"{throughput:.1f} models/sec, {avg_per_model_ms:.1f}ms per model")
                    
                except Exception as e:
                    logger.warning(f"Error recording concurrent execution metrics: {e}")
                    
        # Record performance metrics in performance analyzer if enabled
        if self.enable_performance_trend_analysis and self.performance_analyzer:
            # Process each model individually
            for i, (model, _) in enumerate(model_and_inputs_list):
                if model is None:
                    continue
                    
                # Extract model info
                browser_id = None
                browser_type = None
                model_type = None
                model_name = None
                
                # Get browser ID
                if hasattr(model, 'browser_id'):
                    browser_id = model.browser_id
                elif hasattr(model, '_browser_id'):
                    browser_id = model._browser_id
                    
                # Get browser type
                if hasattr(model, 'browser'):
                    browser_type = model.browser
                elif hasattr(model, '_browser'):
                    browser_type = model._browser
                    
                # Get model type and name
                if hasattr(model, 'model_type'):
                    model_type = model.model_type
                elif hasattr(model, '_model_type'):
                    model_type = model._model_type
                    
                if hasattr(model, 'model_name'):
                    model_name = model.model_name
                elif hasattr(model, '_model_name'):
                    model_name = model._model_name
                
                # Generate a browser ID if not available
                if not browser_id and browser_type:
                    browser_id = f"{browser_type}_{id(model)}"
                    
                # Skip if we don't have required info
                if not browser_id or not browser_type or not model_type or not model_name:
                    continue
                    
                # Get result for this model
                if i < len(results):
                    result = results[i]
                    success = result.get("success", False)
                    
                    # Extract metrics
                    metrics = {}
                    if "execution_metrics" in result:
                        metrics.update(result["execution_metrics"])
                    
                    # Add basic metrics
                    metrics["total_batch_size"] = len(model_and_inputs_list)
                    metrics["total_duration_ms"] = total_duration_ms
                    
                    # Calculate per-model duration (if not provided in execution_metrics)
                    if "duration_ms" not in metrics:
                        metrics["duration_ms"] = total_duration_ms / len(model_and_inputs_list)
                        
                    # Extract error if present
                    error = result.get("error", None) if not success else None
                    
                    # Record operation in performance analyzer
                    self.performance_analyzer.record_operation(
                        browser_id=browser_id,
                        browser_type=browser_type,
                        model_type=model_type,
                        model_name=model_name,
                        operation_type="concurrent_inference",
                        duration_ms=metrics.get("duration_ms", 0),
                        success=success,
                        error=error,
                        metrics=metrics
                    )
                    
                    # Update circuit breaker if enabled
                    if self.enable_circuit_breaker and self.circuit_breaker_manager:
                        try:
                            # Get or create circuit breaker
                            circuit = self.circuit_breaker_manager.get_or_create_circuit(browser_id, browser_type)
                            
                            # Record performance in circuit breaker
                            self.circuit_breaker_manager.record_browser_performance(
                                browser_id=browser_id,
                                browser_type=browser_type,
                                operation_type="concurrent_inference",
                                model_type=model_type,
                                duration_ms=metrics.get("duration_ms", 0),
                                success=success,
                                error=error if not success else None,
                                metrics=metrics
                            )
                        except Exception as e:
                            logger.warning(f"Error updating circuit breaker: {e}")
        
        return results
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get comprehensive metrics including recovery statistics.
        
        Returns:
            Dict containing metrics and recovery statistics
        """
        # Start with basic metrics
        metrics = {
            "timestamp": time.time(),
            "recovery_enabled": self.enable_recovery,
            "initialized": self.initialized
        }
        
        # Add recovery metrics if enabled
        if self.enable_recovery and self.bridge_with_recovery:
            recovery_metrics = self.bridge_with_recovery.get_metrics()
            metrics.update(recovery_metrics)
        elif self.bridge and hasattr(self.bridge, 'get_metrics'):
            # Get base bridge metrics
            base_metrics = self.bridge.get_metrics()
            metrics["base_metrics"] = base_metrics
            
        # Add circuit breaker metrics if enabled
        if self.enable_circuit_breaker and self.circuit_breaker_manager:
            try:
                circuit_metrics = {
                    "global_health": self.circuit_breaker_manager.get_global_health(),
                    "browser_health": self.circuit_breaker_manager.get_browser_type_health()
                }
                metrics["circuit_breaker"] = circuit_metrics
            except Exception as e:
                logger.error(f"Error getting circuit breaker metrics: {e}")
                metrics["circuit_breaker"] = {"error": str(e)}
                
        # Add performance analyzer metrics if enabled
        if self.enable_performance_trend_analysis and self.performance_analyzer:
            try:
                # Get browser recommendations
                recommendations = self.performance_analyzer.get_browser_recommendations()
                
                # Get model type overview
                model_type_overview = self.performance_analyzer.get_model_type_overview()
                
                # Get browser type overview
                browser_type_overview = self.performance_analyzer.get_browser_type_overview()
                
                # Get regressions
                regressions = self.performance_analyzer.detect_regressions()
                
                # Add to metrics
                performance_metrics = {
                    "recommendations": recommendations,
                    "model_types": model_type_overview,
                    "browser_types": browser_type_overview,
                    "regressions": regressions
                }
                
                metrics["performance_analysis"] = performance_metrics
            except Exception as e:
                logger.error(f"Error getting performance analyzer metrics: {e}")
                metrics["performance_analysis"] = {"error": str(e)}
        
        return metrics
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get health status of the resource pool including all enhancements.
        
        Returns:
            Dict with comprehensive health status information
        """
        if not self.initialized:
            return {"status": "not_initialized"}
        
        # Get base health status
        if self.enable_recovery and self.bridge_with_recovery and hasattr(self.bridge_with_recovery, 'get_health_status_sync'):
            status = self.bridge_with_recovery.get_health_status_sync()
        elif hasattr(self.bridge, 'get_health_status_sync'):
            status = self.bridge.get_health_status_sync()
        elif hasattr(self.bridge, 'get_health_status'):
            loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
            status = loop.run_until_complete(self.bridge.get_health_status())
        else:
            status = {"status": "unknown"}
        
        # Add circuit breaker health status if enabled
        if self.enable_circuit_breaker and self.circuit_breaker_manager:
            try:
                # Get detailed report
                circuit_health = self.circuit_breaker_manager.get_detailed_report()
                status["circuit_breaker"] = circuit_health
            except Exception as e:
                logger.error(f"Error getting circuit breaker health: {e}")
                status["circuit_breaker"] = {"error": str(e)}
            
        # Add tensor sharing status if enabled
        if self.enable_tensor_sharing and self.tensor_sharing_manager:
            try:
                tensor_stats = self.tensor_sharing_manager.get_stats()
                status["tensor_sharing"] = tensor_stats
            except Exception as e:
                logger.error(f"Error getting tensor sharing stats: {e}")
                status["tensor_sharing"] = {"error": str(e)}
                
        # Add ultra-low precision status if enabled
        if self.enable_ultra_low_precision and self.ultra_low_precision_manager:
            try:
                ulp_stats = self.ultra_low_precision_manager.get_stats()
                status["ultra_low_precision"] = ulp_stats
            except Exception as e:
                logger.error(f"Error getting ultra-low precision stats: {e}")
                status["ultra_low_precision"] = {"error": str(e)}
                
        # Add browser performance history status if enabled
        if self.enable_browser_history and self.browser_history:
            try:
                # Get browser capability scores
                capability_scores = self.browser_history.get_capability_scores()
                
                # Get sample recommendations for common model types
                sample_recommendations = {
                    "text_embedding": self.browser_history.get_browser_recommendations("text_embedding"),
                    "vision": self.browser_history.get_browser_recommendations("vision"),
                    "audio": self.browser_history.get_browser_recommendations("audio")
                }
                
                # Add to status
                status["browser_performance_history"] = {
                    "status": "active",
                    "capability_scores": capability_scores,
                    "sample_recommendations": sample_recommendations
                }
            except Exception as e:
                logger.error(f"Error getting browser performance history stats: {e}")
                status["browser_performance_history"] = {"error": str(e)}
                
        # Add performance analyzer status if enabled
        if self.enable_performance_trend_analysis and self.performance_analyzer:
            try:
                # Get performance report
                performance_report = self.performance_analyzer.get_comprehensive_report()
                
                # Add to status
                status["performance_analyzer"] = {
                    "status": "active",
                    "summary": {
                        "model_types": list(performance_report.get("model_types", {}).keys()),
                        "browser_types": list(performance_report.get("browser_types", {}).keys()),
                        "record_count": performance_report.get("record_count", 0),
                        "regression_count": sum(len(v) for v in performance_report.get("regressions", {}).values()),
                        "critical_regressions": len(performance_report.get("regressions", {}).get("critical", [])),
                        "severe_regressions": len(performance_report.get("regressions", {}).get("severe", [])),
                    }
                }
                
                # Add critical and severe regressions for immediate attention
                critical_regressions = performance_report.get("regressions", {}).get("critical", [])
                severe_regressions = performance_report.get("regressions", {}).get("severe", [])
                
                if critical_regressions or severe_regressions:
                    status["performance_analyzer"]["high_priority_regressions"] = {
                        "critical": critical_regressions,
                        "severe": severe_regressions
                    }
                    
            except Exception as e:
                logger.error(f"Error getting performance analyzer stats: {e}")
                status["performance_analyzer"] = {"error": str(e)}
        
        return status
    
    def get_performance_report(self, time_window_days: float = 7.0) -> Dict[str, Any]:
        """
        Get a comprehensive performance report.
        
        Args:
            time_window_days: Time window in days to analyze
            
        Returns:
            Dict with comprehensive performance report
        """
        if not self.enable_performance_trend_analysis or not self.performance_analyzer:
            return {"error": "Performance trend analysis not enabled"}
            
        try:
            # Get comprehensive report
            report = self.performance_analyzer.get_comprehensive_report(time_window_days)
            return report
        except Exception as e:
            logger.error(f"Error getting performance report: {e}")
            return {"error": str(e)}
    
    def detect_performance_regressions(self, time_window_days: float = 7.0, threshold_pct: float = 10.0) -> Dict[str, List[Dict[str, Any]]]:
        """
        Detect performance regressions across all models and browsers.
        
        Args:
            time_window_days: Time window in days to analyze
            threshold_pct: Threshold percentage change to consider as regression
            
        Returns:
            Dictionary of regressions by severity
        """
        if not self.enable_performance_trend_analysis or not self.performance_analyzer:
            return {"error": "Performance trend analysis not enabled"}
            
        try:
            # Get regressions
            regressions = self.performance_analyzer.detect_regressions(
                time_window_days=time_window_days,
                threshold_pct=threshold_pct
            )
            return regressions
        except Exception as e:
            logger.error(f"Error detecting performance regressions: {e}")
            return {"error": str(e)}
    
    def get_browser_recommendations(self, time_window_days: float = 7.0) -> Dict[str, Dict[str, Any]]:
        """
        Get browser recommendations for each model type.
        
        Args:
            time_window_days: Time window in days to analyze
            
        Returns:
            Dictionary of browser recommendations by model type
        """
        if not self.enable_performance_trend_analysis or not self.performance_analyzer:
            return {"error": "Performance trend analysis not enabled"}
            
        try:
            # Get recommendations
            recommendations = self.performance_analyzer.get_browser_recommendations(
                time_window_days=time_window_days,
                force_refresh=True
            )
            return recommendations
        except Exception as e:
            logger.error(f"Error getting browser recommendations: {e}")
            return {"error": str(e)}
    
    def close(self) -> bool:
        """
        Close all resources with proper cleanup, including all enhancements.
        
        Returns:
            Success status
        """
        success = True
        
        # Close circuit breaker if enabled
        if self.enable_circuit_breaker and self.circuit_breaker_manager:
            try:
                logger.info("Closing circuit breaker manager")
                # Nothing to close in circuit breaker manager
                logger.info("Circuit breaker manager closed successfully")
            except Exception as e:
                logger.error(f"Error closing circuit breaker manager: {e}")
                success = False
                
        # Close performance analyzer if enabled
        if self.enable_performance_trend_analysis and self.performance_analyzer:
            try:
                logger.info("Closing performance analyzer")
                self.performance_analyzer.close()
                logger.info("Performance analyzer closed successfully")
            except Exception as e:
                logger.error(f"Error closing performance analyzer: {e}")
                success = False
        
        # Close connection pool if enabled
        if ADVANCED_POOLING_AVAILABLE and self.connection_pool:
            try:
                logger.info("Closing connection pool manager")
                loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
                loop.run_until_complete(self.connection_pool.shutdown())
                logger.info("Connection pool manager closed successfully")
            except Exception as e:
                logger.error(f"Error closing connection pool manager: {e}")
                success = False
        
        # Clean up tensor sharing if enabled
        if self.enable_tensor_sharing and self.tensor_sharing_manager:
            try:
                logger.info("Cleaning up tensor sharing manager")
                self.tensor_sharing_manager.cleanup()
                logger.info("Tensor sharing manager cleaned up successfully")
            except Exception as e:
                logger.error(f"Error cleaning up tensor sharing manager: {e}")
                success = False
        
        # Clean up ultra-low precision if enabled
        if self.enable_ultra_low_precision and self.ultra_low_precision_manager:
            try:
                logger.info("Cleaning up ultra-low precision manager")
                self.ultra_low_precision_manager.cleanup()
                logger.info("Ultra-low precision manager cleaned up successfully")
            except Exception as e:
                logger.error(f"Error cleaning up ultra-low precision manager: {e}")
                success = False
                
        # Clean up browser performance history if enabled
        if self.enable_browser_history and self.browser_history:
            try:
                logger.info("Closing browser performance history tracker")
                self.browser_history.close()
                logger.info("Browser performance history tracker closed successfully")
            except Exception as e:
                logger.error(f"Error closing browser performance history tracker: {e}")
                success = False
        
        # Close recovery bridge if enabled
        if self.enable_recovery and self.bridge_with_recovery:
            try:
                self.bridge_with_recovery.close()
                logger.info("Recovery bridge closed successfully")
            except Exception as e:
                logger.error(f"Error closing recovery bridge: {e}")
                success = False
        
        # Close base bridge
        if self.bridge:
            try:
                if hasattr(self.bridge, 'close_sync'):
                    self.bridge.close_sync()
                elif hasattr(self.bridge, 'close'):
                    loop = asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else asyncio.new_event_loop()
                    loop.run_until_complete(self.bridge.close())
                logger.info("Base bridge closed successfully")
            except Exception as e:
                logger.error(f"Error closing base bridge: {e}")
                success = False
        
        self.initialized = False
        logger.info(f"ResourcePoolBridgeIntegrationEnhanced closed (success={'yes' if success else 'no'}, "
                   f"closed tensor_sharing={'yes' if self.tensor_sharing_manager else 'n/a'}, "
                   f"closed ultra_low_precision={'yes' if self.ultra_low_precision_manager else 'n/a'}, "
                   f"closed circuit_breaker={'yes' if self.circuit_breaker_manager else 'n/a'}, "
                   f"closed performance_analyzer={'yes' if self.performance_analyzer else 'n/a'})")
        return success
    
    def setup_tensor_sharing(self, max_memory_mb: Optional[int] = None) -> Any:
        """
        Set up cross-model tensor sharing for memory efficiency.
        
        This feature enables multiple models to share tensors, significantly
        improving memory efficiency and performance for multi-model workloads.
        
        Args:
            max_memory_mb: Maximum memory in MB to use for tensor sharing (overrides the initial setting)
            
        Returns:
            TensorSharingManager instance or None if not available
        """
        if not self.initialized:
            logger.error("ResourcePoolBridgeIntegrationEnhanced not initialized")
            return None
            
        # Check if tensor sharing is enabled
        if not self.enable_tensor_sharing:
            logger.warning("Tensor sharing is not enabled")
            return None
            
        # Check if tensor sharing is available
        if not TENSOR_SHARING_AVAILABLE:
            logger.warning("Tensor sharing is not available (missing dependencies)")
            return None
        
        # Use recovery bridge if enabled
        if self.enable_recovery and self.bridge_with_recovery and hasattr(self.bridge_with_recovery, 'setup_tensor_sharing'):
            return self.bridge_with_recovery.setup_tensor_sharing(max_memory_mb=max_memory_mb)
        
        # Fall back to base bridge if recovery not enabled
        if hasattr(self.bridge, 'setup_tensor_sharing'):
            return self.bridge.setup_tensor_sharing(max_memory_mb=max_memory_mb)
            
        # Use local tensor sharing implementation if no bridge implementation available
        try:
            # Use existing manager if already created
            if self.tensor_sharing_manager:
                if max_memory_mb is not None:
                    # Update memory limit if specified
                    self.tensor_sharing_manager.set_max_memory(max_memory_mb)
                return self.tensor_sharing_manager
                
            # Create new manager if not already created
            memory_limit = max_memory_mb if max_memory_mb is not None else self.max_memory_mb
            self.tensor_sharing_manager = TensorSharingManager(max_memory_mb=memory_limit)
            logger.info(f"Tensor sharing manager created with {memory_limit} MB memory limit")
            return self.tensor_sharing_manager
            
        except Exception as e:
            logger.error(f"Error setting up tensor sharing: {e}")
            return None


# Example usage
def run_example():
    """Run a demonstration of the enhanced resource pool with recovery."""
    logging.info("Starting ResourcePoolBridgeIntegrationEnhanced example")
    
    # Create the enhanced resource pool with recovery
    pool = ResourcePoolBridgeIntegrationEnhanced(
        max_connections=2,
        adaptive_scaling=True,
        enable_recovery=True,
        max_retries=3,
        fallback_to_simulation=True,
        enable_browser_history=True,
        enable_performance_trend_analysis=True,
        db_path="./browser_performance.duckdb"
    )
    
    # Initialize 
    success = pool.initialize()
    if not success:
        logging.error("Failed to initialize resource pool")
        return
    
    try:
        # First run with explicit browser preferences for initial performance data collection
        logging.info("=== Initial Run with Explicit Browser Preferences ===")
        
        # Load models
        logging.info("Loading text model (BERT)")
        text_model = pool.get_model(
            model_type="text_embedding",
            model_name="bert-base-uncased",
            hardware_preferences={
                "priority_list": ["webgpu", "webnn", "cpu"],
                "browser": "chrome"
            }
        )
        
        logging.info("Loading vision model (ViT)")
        vision_model = pool.get_model(
            model_type="vision",
            model_name="vit-base-patch16-224",
            hardware_preferences={
                "priority_list": ["webgpu", "cpu"],
                "browser": "chrome"
            }
        )
        
        logging.info("Loading audio model (Whisper)")
        audio_model = pool.get_model(
            model_type="audio",
            model_name="whisper-tiny",
            hardware_preferences={
                "priority_list": ["webgpu", "cpu"],
                "browser": "firefox"  # Firefox is preferred for audio
            }
        )
        
        # Generate sample inputs
        text_input = {
            "input_ids": [101, 2023, 2003, 1037, 3231, 102],
            "attention_mask": [1, 1, 1, 1, 1, 1]
        }
        
        vision_input = {
            "pixel_values": [[[0.5 for _ in range(224)] for _ in range(224)] for _ in range(3)]
        }
        
        audio_input = {
            "input_features": [[0.1 for _ in range(80)] for _ in range(3000)]
        }
        
        # Run inference with resilient error handling
        logging.info("Running inference on text model")
        text_result = text_model(text_input)
        logging.info(f"Text result status: {text_result.get('success', False)}")
        
        logging.info("Running inference on vision model")
        vision_result = vision_model(vision_input)
        logging.info(f"Vision result status: {vision_result.get('success', False)}")
        
        logging.info("Running inference on audio model")
        audio_result = audio_model(audio_input)
        logging.info(f"Audio result status: {audio_result.get('success', False)}")
        
        # Run concurrent inference
        logging.info("Running concurrent inference")
        model_inputs = [
            (text_model, text_input),
            (vision_model, vision_input),
            (audio_model, audio_input)
        ]
        
        concurrent_results = pool.execute_concurrent(model_inputs)
        logging.info(f"Concurrent results count: {len(concurrent_results)}")
        
        # Run more instances to build up performance history
        logging.info("Running additional inference for performance history...")
        
        # Run models multiple times to build up performance history
        for i in range(5):
            # Text model with different browsers
            for browser in ["chrome", "edge", "firefox"]:
                text_model = pool.get_model(
                    model_type="text_embedding",
                    model_name="bert-base-uncased",
                    hardware_preferences={
                        "priority_list": ["webgpu", "webnn", "cpu"] if browser != "edge" else ["webnn", "webgpu", "cpu"],
                        "browser": browser
                    }
                )
                if text_model:
                    text_result = text_model(text_input)
            
            # Vision model with different browsers
            for browser in ["chrome", "firefox", "edge"]:
                vision_model = pool.get_model(
                    model_type="vision",
                    model_name="vit-base-patch16-224",
                    hardware_preferences={
                        "priority_list": ["webgpu", "cpu"],
                        "browser": browser
                    }
                )
                if vision_model:
                    vision_result = vision_model(vision_input)
            
            # Audio model with different browsers
            for browser in ["firefox", "chrome", "edge"]:
                audio_model = pool.get_model(
                    model_type="audio",
                    model_name="whisper-tiny",
                    hardware_preferences={
                        "priority_list": ["webgpu", "cpu"],
                        "browser": browser
                    }
                )
                if audio_model:
                    audio_result = audio_model(audio_input)
        
        # Get performance report from trend analyzer
        if pool.performance_analyzer:
            logging.info("=== Performance Analysis Report ===")
            report = pool.get_performance_report()
            
            logging.info(f"Analyzed {report.get('record_count', 0)} performance records")
            
            # Check for regressions
            regressions = report.get("regressions", {})
            critical_count = len(regressions.get("critical", []))
            severe_count = len(regressions.get("severe", []))
            moderate_count = len(regressions.get("moderate", []))
            minor_count = len(regressions.get("minor", []))
            
            logging.info(f"Detected {critical_count} critical, {severe_count} severe, "
                        f"{moderate_count} moderate, and {minor_count} minor regressions")
            
            # Show browser recommendations
            recommendations = report.get("recommendations", {})
            for model_type, recommendation in recommendations.items():
                logging.info(f"Recommended browser for {model_type}: {recommendation.get('recommended_browser', 'unknown')} "
                           f"(confidence: {recommendation.get('confidence', 0):.2f})")
        
        # Second run with automatic browser selection based on performance history
        logging.info("\n=== Second Run with Automatic Browser Selection ===")
        
        # Load models without specifying browser (will use performance history)
        logging.info("Loading text model (BERT) with automatic browser selection")
        text_model = pool.get_model(
            model_type="text_embedding",
            model_name="bert-base-uncased"
        )
        
        logging.info("Loading vision model (ViT) with automatic browser selection")
        vision_model = pool.get_model(
            model_type="vision",
            model_name="vit-base-patch16-224"
        )
        
        logging.info("Loading audio model (Whisper) with automatic browser selection")
        audio_model = pool.get_model(
            model_type="audio",
            model_name="whisper-tiny"
        )
        
        # Run inference with automatic browser selection
        logging.info("Running inference on text model")
        if text_model:
            text_result = text_model(text_input)
            logging.info(f"Text result status: {text_result.get('success', False)}")
        
        logging.info("Running inference on vision model")
        if vision_model:
            vision_result = vision_model(vision_input)
            logging.info(f"Vision result status: {vision_result.get('success', False)}")
        
        logging.info("Running inference on audio model")
        if audio_model:
            audio_result = audio_model(audio_input)
            logging.info(f"Audio result status: {audio_result.get('success', False)}")
        
        # Get health status
        health = pool.get_health_status()
        logging.info(f"Health status: {health.get('status', 'unknown')}")
        
        # Show circuit breaker status if available
        if "circuit_breaker" in health:
            circuit_health = health["circuit_breaker"].get("global_health", {})
            logging.info(f"Circuit breaker health score: {circuit_health.get('overall_health_score', 0):.1f}")
            logging.info(f"Circuit breaker status: {circuit_health.get('status', 'unknown')}")
        
        # Show performance analyzer status if available
        if "performance_analyzer" in health:
            pa_status = health["performance_analyzer"]
            if "summary" in pa_status:
                summary = pa_status["summary"]
                logging.info(f"Performance analyzer: {summary.get('record_count', 0)} records, "
                           f"{summary.get('regression_count', 0)} regressions detected")
                
                # Show critical regressions if any
                if "high_priority_regressions" in pa_status:
                    high_priority = pa_status["high_priority_regressions"]
                    critical = high_priority.get("critical", [])
                    severe = high_priority.get("severe", [])
                    
                    if critical:
                        logging.warning(f"CRITICAL REGRESSIONS DETECTED: {len(critical)}")
                        for reg in critical[:2]:  # Show first 2
                            if "model_name" in reg:
                                logging.warning(f"  - Model {reg['model_name']}: {reg['percent_change']:.1f}% degradation")
                            elif "browser_type" in reg:
                                logging.warning(f"  - Browser {reg['browser_type']}: {reg['percent_change']:.1f}% degradation")
                    
                    if severe:
                        logging.warning(f"SEVERE REGRESSIONS DETECTED: {len(severe)}")
        
    finally:
        # Close the pool
        pool.close()
        logging.info("ResourcePoolBridgeIntegrationEnhanced example completed")


if __name__ == "__main__":
    # Configure detailed logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler()
        ]
    )
    
    # Run the example
    run_example()