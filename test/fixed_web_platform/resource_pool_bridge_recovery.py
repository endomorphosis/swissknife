"""
Resource Pool Bridge Recovery - WebGPU/WebNN Fault Tolerance Implementation

This module provides fault tolerance features for the WebGPU/WebNN Resource Pool:
1. Transaction-based state management for browser resources
2. Performance history tracking and trend analysis
3. Cross-browser recovery for browser crashes and disconnections
4. Automatic failover for WebGPU/WebNN operations

Usage:
    from fixed_web_platform.resource_pool_bridge_recovery import (
        ResourcePoolRecoveryManager,
        BrowserStateManager,
        PerformanceHistoryTracker
    )
    
    # Create recovery manager
    recovery_manager = ResourcePoolRecoveryManager(
        connection_pool=pool.connection_pool,
        fault_tolerance_level="high",
        recovery_strategy="progressive"
    )
    
    # Use with resource pool bridge for automatic recovery
    result = await pool.run_with_recovery(
        model_name="bert-base-uncased",
        operation="inference",
        inputs={"text": "Example input"},
        recovery_manager=recovery_manager
    )
"""

import asyncio
import json
import logging
import time
import uuid
from enum import Enum
from typing import Dict, List, Tuple, Any, Optional, Set, Callable

class FaultToleranceLevel(Enum):
    """Fault tolerance levels for browser resources."""
    NONE = "none"  # No fault tolerance
    LOW = "low"  # Basic reconnection attempts
    MEDIUM = "medium"  # State persistence and recovery
    HIGH = "high"  # Full recovery with state replication
    CRITICAL = "critical"  # Redundant operations with voting

class RecoveryStrategy(Enum):
    """Recovery strategies for handling browser failures."""
    RESTART = "restart"  # Restart the failed browser
    RECONNECT = "reconnect"  # Attempt to reconnect to the browser
    FAILOVER = "failover"  # Switch to another browser
    PROGRESSIVE = "progressive"  # Try simple strategies first, then more complex ones
    PARALLEL = "parallel"  # Try multiple strategies in parallel

class BrowserFailureCategory(Enum):
    """Categories of browser failures."""
    CONNECTION = "connection"  # Connection lost
    CRASH = "crash"  # Browser crashed
    MEMORY = "memory"  # Out of memory
    TIMEOUT = "timeout"  # Operation timed out
    WEBGPU = "webgpu"  # WebGPU failure
    WEBNN = "webnn"  # WebNN failure
    UNKNOWN = "unknown"  # Unknown failure

class BrowserState:
    """State of a browser instance."""
    
    def __init__(self, browser_id: str, browser_type: str):
        self.browser_id = browser_id
        self.browser_type = browser_type
        self.status = "initialized"
        self.last_heartbeat = time.time()
        self.models = {}  # model_id -> model state
        self.operations = {}  # operation_id -> operation state
        self.resources = {}  # resource_id -> resource state
        self.metrics = {}  # Metrics collected from this browser
        self.recovery_attempts = 0
        self.checkpoints = []  # List of state checkpoints for recovery
        
    def update_status(self, status: str):
        """Update the browser status."""
        self.status = status
        self.last_heartbeat = time.time()
        
    def add_model(self, model_id: str, model_state: Dict):
        """Add a model to this browser."""
        self.models[model_id] = model_state
        
    def add_operation(self, operation_id: str, operation_state: Dict):
        """Add an operation to this browser."""
        self.operations[operation_id] = operation_state
        
    def add_resource(self, resource_id: str, resource_state: Dict):
        """Add a resource to this browser."""
        self.resources[resource_id] = resource_state
        
    def update_metrics(self, metrics: Dict):
        """Update browser metrics."""
        self.metrics.update(metrics)
        
    def create_checkpoint(self):
        """Create a checkpoint of the current state."""
        checkpoint = {
            "timestamp": time.time(),
            "browser_id": self.browser_id,
            "browser_type": self.browser_type,
            "status": self.status,
            "models": self.models.copy(),
            "operations": self.operations.copy(),
            "resources": self.resources.copy(),
            "metrics": self.metrics.copy()
        }
        
        self.checkpoints.append(checkpoint)
        
        # Keep only the last 5 checkpoints
        if len(self.checkpoints) > 5:
            self.checkpoints = self.checkpoints[-5:]
            
        return checkpoint
        
    def get_latest_checkpoint(self):
        """Get the latest checkpoint."""
        if not self.checkpoints:
            return None
            
        return self.checkpoints[-1]
        
    def is_healthy(self, timeout_seconds: int = 30) -> bool:
        """Check if the browser is healthy."""
        return (time.time() - self.last_heartbeat) < timeout_seconds and self.status not in ["failed", "crashed"]
        
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        return {
            "browser_id": self.browser_id,
            "browser_type": self.browser_type,
            "status": self.status,
            "last_heartbeat": self.last_heartbeat,
            "models": self.models,
            "operations": self.operations,
            "resources": self.resources,
            "metrics": self.metrics,
            "recovery_attempts": self.recovery_attempts
        }
        
    @classmethod
    def from_dict(cls, data: Dict) -> 'BrowserState':
        """Create from dictionary."""
        browser = cls(data["browser_id"], data["browser_type"])
        browser.status = data["status"]
        browser.last_heartbeat = data["last_heartbeat"]
        browser.models = data["models"]
        browser.operations = data["operations"]
        browser.resources = data["resources"]
        browser.metrics = data["metrics"]
        browser.recovery_attempts = data["recovery_attempts"]
        return browser

class PerformanceEntry:
    """Entry in the performance history."""
    
    def __init__(self, operation_type: str, model_name: str, browser_id: str, browser_type: str):
        self.timestamp = time.time()
        self.operation_type = operation_type
        self.model_name = model_name
        self.browser_id = browser_id
        self.browser_type = browser_type
        self.metrics = {}
        self.status = "started"
        self.duration_ms = None
        
    def complete(self, metrics: Dict, status: str = "completed"):
        """Mark the entry as completed."""
        self.metrics = metrics
        self.status = status
        self.duration_ms = (time.time() - self.timestamp) * 1000
        
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        return {
            "timestamp": self.timestamp,
            "operation_type": self.operation_type,
            "model_name": self.model_name,
            "browser_id": self.browser_id,
            "browser_type": self.browser_type,
            "metrics": self.metrics,
            "status": self.status,
            "duration_ms": self.duration_ms
        }
        
    @classmethod
    def from_dict(cls, data: Dict) -> 'PerformanceEntry':
        """Create from dictionary."""
        entry = cls(
            data["operation_type"],
            data["model_name"],
            data["browser_id"],
            data["browser_type"]
        )
        entry.timestamp = data["timestamp"]
        entry.metrics = data["metrics"]
        entry.status = data["status"]
        entry.duration_ms = data["duration_ms"]
        return entry

class BrowserStateManager:
    """Manager for browser state with transaction-based updates."""
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        self.browsers: Dict[str, BrowserState] = {}
        self.transaction_log = []
        self.logger = logger or logging.getLogger(__name__)
        
    def add_browser(self, browser_id: str, browser_type: str) -> BrowserState:
        """Add a browser to the state manager."""
        browser = BrowserState(browser_id, browser_type)
        self.browsers[browser_id] = browser
        
        # Log transaction
        self._log_transaction("add_browser", {
            "browser_id": browser_id,
            "browser_type": browser_type
        })
        
        return browser
        
    def remove_browser(self, browser_id: str):
        """Remove a browser from the state manager."""
        if browser_id in self.browsers:
            del self.browsers[browser_id]
            
            # Log transaction
            self._log_transaction("remove_browser", {
                "browser_id": browser_id
            })
            
    def get_browser(self, browser_id: str) -> Optional[BrowserState]:
        """Get a browser from the state manager."""
        return self.browsers.get(browser_id)
        
    def update_browser_status(self, browser_id: str, status: str):
        """Update the status of a browser."""
        browser = self.get_browser(browser_id)
        if browser:
            browser.update_status(status)
            
            # Log transaction
            self._log_transaction("update_browser_status", {
                "browser_id": browser_id,
                "status": status
            })
            
    def add_model_to_browser(self, browser_id: str, model_id: str, model_state: Dict):
        """Add a model to a browser."""
        browser = self.get_browser(browser_id)
        if browser:
            browser.add_model(model_id, model_state)
            
            # Log transaction
            self._log_transaction("add_model_to_browser", {
                "browser_id": browser_id,
                "model_id": model_id,
                "model_state": model_state
            })
            
    def add_operation_to_browser(self, browser_id: str, operation_id: str, operation_state: Dict):
        """Add an operation to a browser."""
        browser = self.get_browser(browser_id)
        if browser:
            browser.add_operation(operation_id, operation_state)
            
            # Log transaction
            self._log_transaction("add_operation_to_browser", {
                "browser_id": browser_id,
                "operation_id": operation_id,
                "operation_state": operation_state
            })
            
    def add_resource_to_browser(self, browser_id: str, resource_id: str, resource_state: Dict):
        """Add a resource to a browser."""
        browser = self.get_browser(browser_id)
        if browser:
            browser.add_resource(resource_id, resource_state)
            
            # Log transaction
            self._log_transaction("add_resource_to_browser", {
                "browser_id": browser_id,
                "resource_id": resource_id,
                "resource_state": resource_state
            })
            
    def update_browser_metrics(self, browser_id: str, metrics: Dict):
        """Update browser metrics."""
        browser = self.get_browser(browser_id)
        if browser:
            browser.update_metrics(metrics)
            
            # Log transaction
            self._log_transaction("update_browser_metrics", {
                "browser_id": browser_id,
                "metrics": metrics
            })
            
    def create_browser_checkpoint(self, browser_id: str) -> Optional[Dict]:
        """Create a checkpoint of the browser state."""
        browser = self.get_browser(browser_id)
        if browser:
            checkpoint = browser.create_checkpoint()
            
            # Log transaction
            self._log_transaction("create_browser_checkpoint", {
                "browser_id": browser_id,
                "checkpoint_timestamp": checkpoint["timestamp"]
            })
            
            return checkpoint
            
        return None
        
    def get_browser_checkpoint(self, browser_id: str) -> Optional[Dict]:
        """Get the latest checkpoint for a browser."""
        browser = self.get_browser(browser_id)
        if browser:
            return browser.get_latest_checkpoint()
            
        return None
        
    def get_browser_by_model(self, model_id: str) -> Optional[BrowserState]:
        """Get the browser that contains a model."""
        for browser in self.browsers.values():
            if model_id in browser.models:
                return browser
                
        return None
        
    def get_healthy_browsers(self, timeout_seconds: int = 30) -> List[BrowserState]:
        """Get a list of healthy browsers."""
        return [browser for browser in self.browsers.values() if browser.is_healthy(timeout_seconds)]
        
    def get_browser_count_by_type(self) -> Dict[str, int]:
        """Get a count of browsers by type."""
        counts = {}
        for browser in self.browsers.values():
            if browser.browser_type not in counts:
                counts[browser.browser_type] = 0
                
            counts[browser.browser_type] += 1
            
        return counts
        
    def get_status_summary(self) -> Dict[str, Any]:
        """Get a summary of the browser state."""
        browser_count = len(self.browsers)
        healthy_count = len(self.get_healthy_browsers())
        
        browser_types = {}
        model_count = 0
        operation_count = 0
        resource_count = 0
        
        for browser in self.browsers.values():
            if browser.browser_type not in browser_types:
                browser_types[browser.browser_type] = 0
                
            browser_types[browser.browser_type] += 1
            model_count += len(browser.models)
            operation_count += len(browser.operations)
            resource_count += len(browser.resources)
            
        return {
            "browser_count": browser_count,
            "healthy_browser_count": healthy_count,
            "browser_types": browser_types,
            "model_count": model_count,
            "operation_count": operation_count,
            "resource_count": resource_count,
            "transaction_count": len(self.transaction_log)
        }
        
    def _log_transaction(self, action: str, data: Dict):
        """Log a transaction for recovery purposes."""
        transaction = {
            "id": str(uuid.uuid4()),
            "timestamp": time.time(),
            "action": action,
            "data": data
        }
        
        self.transaction_log.append(transaction)
        
        # Limit transaction log size
        max_transactions = 10000
        if len(self.transaction_log) > max_transactions:
            self.transaction_log = self.transaction_log[-max_transactions:]

class PerformanceHistoryTracker:
    """Tracker for browser performance history."""
    
    def __init__(self, max_entries: int = 1000, logger: Optional[logging.Logger] = None):
        self.entries: List[PerformanceEntry] = []
        self.max_entries = max_entries
        self.logger = logger or logging.getLogger(__name__)
        
    def start_operation(self, operation_type: str, model_name: str, browser_id: str, browser_type: str) -> str:
        """Start tracking a new operation."""
        entry = PerformanceEntry(operation_type, model_name, browser_id, browser_type)
        self.entries.append(entry)
        
        # Limit number of entries
        if len(self.entries) > self.max_entries:
            self.entries = self.entries[-self.max_entries:]
            
        self.logger.debug(f"Started tracking operation {operation_type} for model {model_name} on browser {browser_id}")
        
        return str(id(entry))  # Use object id as entry id
        
    def complete_operation(self, entry_id: str, metrics: Dict, status: str = "completed"):
        """Mark an operation as completed."""
        # Find entry by id
        for entry in self.entries:
            if str(id(entry)) == entry_id:
                entry.complete(metrics, status)
                self.logger.debug(f"Completed operation {entry.operation_type} with status {status}")
                return True
                
        return False
        
    def get_entries_by_model(self, model_name: str) -> List[Dict]:
        """Get performance entries for a specific model."""
        return [entry.to_dict() for entry in self.entries if entry.model_name == model_name]
        
    def get_entries_by_browser(self, browser_id: str) -> List[Dict]:
        """Get performance entries for a specific browser."""
        return [entry.to_dict() for entry in self.entries if entry.browser_id == browser_id]
        
    def get_entries_by_operation(self, operation_type: str) -> List[Dict]:
        """Get performance entries for a specific operation type."""
        return [entry.to_dict() for entry in self.entries if entry.operation_type == operation_type]
        
    def get_entries_by_time_range(self, start_time: float, end_time: float) -> List[Dict]:
        """Get performance entries within a time range."""
        return [entry.to_dict() for entry in self.entries if start_time <= entry.timestamp <= end_time]
        
    def get_latest_entries(self, count: int = 10) -> List[Dict]:
        """Get the latest performance entries."""
        sorted_entries = sorted(self.entries, key=lambda x: x.timestamp, reverse=True)
        return [entry.to_dict() for entry in sorted_entries[:count]]
        
    def get_average_duration_by_model(self, model_name: str, operation_type: Optional[str] = None) -> float:
        """Get the average duration for a model."""
        entries = [entry for entry in self.entries if entry.model_name == model_name and 
                  entry.duration_ms is not None and 
                  entry.status == "completed" and
                  (operation_type is None or entry.operation_type == operation_type)]
                  
        if not entries:
            return 0.0
            
        return sum(entry.duration_ms for entry in entries) / len(entries)
        
    def get_average_duration_by_browser_type(self, browser_type: str, operation_type: Optional[str] = None) -> float:
        """Get the average duration for a browser type."""
        entries = [entry for entry in self.entries if entry.browser_type == browser_type and 
                  entry.duration_ms is not None and 
                  entry.status == "completed" and
                  (operation_type is None or entry.operation_type == operation_type)]
                  
        if not entries:
            return 0.0
            
        return sum(entry.duration_ms for entry in entries) / len(entries)
        
    def get_failure_rate_by_model(self, model_name: str) -> float:
        """Get the failure rate for a model."""
        entries = [entry for entry in self.entries if entry.model_name == model_name]
        
        if not entries:
            return 0.0
            
        failed_entries = [entry for entry in entries if entry.status != "completed"]
        return len(failed_entries) / len(entries)
        
    def get_failure_rate_by_browser_type(self, browser_type: str) -> float:
        """Get the failure rate for a browser type."""
        entries = [entry for entry in self.entries if entry.browser_type == browser_type]
        
        if not entries:
            return 0.0
            
        failed_entries = [entry for entry in entries if entry.status != "completed"]
        return len(failed_entries) / len(entries)
        
    def analyze_performance_trends(self, model_name: Optional[str] = None, 
                                  browser_type: Optional[str] = None,
                                  operation_type: Optional[str] = None,
                                  time_window_seconds: int = 3600) -> Dict[str, Any]:
        """Analyze performance trends."""
        # Filter entries
        now = time.time()
        cutoff = now - time_window_seconds
        
        filtered_entries = [entry for entry in self.entries if entry.timestamp >= cutoff and 
                           entry.duration_ms is not None and
                           (model_name is None or entry.model_name == model_name) and
                           (browser_type is None or entry.browser_type == browser_type) and
                           (operation_type is None or entry.operation_type == operation_type)]
                           
        if not filtered_entries:
            return {"error": "No data available for the specified filters"}
            
        # Sort by timestamp
        sorted_entries = sorted(filtered_entries, key=lambda x: x.timestamp)
        
        # Calculate metrics over time
        timestamps = [entry.timestamp for entry in sorted_entries]
        durations = [entry.duration_ms for entry in sorted_entries]
        statuses = [entry.status for entry in sorted_entries]
        
        # Calculate trend
        if len(durations) >= 2:
            # Simple linear regression for trend
            n = len(durations)
            sum_x = sum(range(n))
            sum_y = sum(durations)
            sum_xy = sum(i * y for i, y in enumerate(durations))
            sum_xx = sum(i * i for i in range(n))
            
            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x) if (n * sum_xx - sum_x * sum_x) != 0 else 0
            
            trend_direction = "improving" if slope < 0 else "degrading" if slope > 0 else "stable"
            trend_magnitude = abs(slope)
        else:
            trend_direction = "stable"
            trend_magnitude = 0
            
        # Calculate success rate over time
        success_count = sum(1 for status in statuses if status == "completed")
        success_rate = success_count / len(statuses) if statuses else 0
        
        # Calculate avg, min, max durations
        avg_duration = sum(durations) / len(durations) if durations else 0
        min_duration = min(durations) if durations else 0
        max_duration = max(durations) if durations else 0
        
        # Segment by recency
        if len(durations) >= 10:
            recent_durations = durations[-10:]
            avg_recent = sum(recent_durations) / len(recent_durations)
            
            oldest_durations = durations[:10]
            avg_oldest = sum(oldest_durations) / len(oldest_durations)
            
            improvement = (avg_oldest - avg_recent) / avg_oldest if avg_oldest > 0 else 0
        else:
            avg_recent = avg_duration
            avg_oldest = avg_duration
            improvement = 0
            
        return {
            "entries_analyzed": len(filtered_entries),
            "time_window_seconds": time_window_seconds,
            "avg_duration_ms": avg_duration,
            "min_duration_ms": min_duration,
            "max_duration_ms": max_duration,
            "success_rate": success_rate,
            "trend_direction": trend_direction,
            "trend_magnitude": trend_magnitude,
            "improvement_rate": improvement,
            "avg_recent_duration_ms": avg_recent,
            "avg_oldest_duration_ms": avg_oldest
        }
        
    def recommend_browser_type(self, model_name: str, operation_type: str, 
                              available_types: List[str]) -> Dict[str, Any]:
        """Recommend the best browser type for a model and operation."""
        if not available_types:
            return {"error": "No browser types available"}
            
        # Get entries for this model and operation
        entries = [entry for entry in self.entries if entry.model_name == model_name and 
                  entry.operation_type == operation_type and
                  entry.duration_ms is not None and
                  entry.status == "completed" and
                  entry.browser_type in available_types]
                  
        if not entries:
            # No data, return the first available type
            return {
                "recommended_type": available_types[0],
                "reason": "No performance data available, using first available type",
                "confidence": 0.0
            }
            
        # Calculate average duration for each type
        type_durations = {}
        for entry in entries:
            if entry.browser_type not in type_durations:
                type_durations[entry.browser_type] = []
                
            type_durations[entry.browser_type].append(entry.duration_ms)
            
        # Calculate average duration for each type
        type_avg_durations = {}
        for browser_type, durations in type_durations.items():
            type_avg_durations[browser_type] = sum(durations) / len(durations)
            
        # Find the type with the lowest average duration
        best_type = min(type_avg_durations.items(), key=lambda x: x[1])[0]
        
        # Calculate success rate for each type
        type_success_rates = {}
        for browser_type in type_durations:
            success_entries = [entry for entry in entries if entry.browser_type == browser_type]
            success_count = sum(1 for entry in success_entries if entry.status == "completed")
            type_success_rates[browser_type] = success_count / len(success_entries) if success_entries else 0
            
        # Calculate confidence based on sample size and success rate
        confidence = min(1.0, len(type_durations[best_type]) / 10) * type_success_rates.get(best_type, 0.5)
        
        return {
            "recommended_type": best_type,
            "reason": f"Lowest average duration ({type_avg_durations[best_type]:.1f}ms) with {len(type_durations[best_type])} samples",
            "confidence": confidence,
            "avg_durations": type_avg_durations,
            "success_rates": type_success_rates,
            "sample_counts": {t: len(d) for t, d in type_durations.items()}
        }
        
    def get_statistics(self) -> Dict[str, Any]:
        """Get statistics from the performance history."""
        if not self.entries:
            return {"error": "No performance data available"}
            
        # Count entries by type
        operation_types = {}
        model_names = {}
        browser_types = {}
        
        for entry in self.entries:
            # Count operation types
            if entry.operation_type not in operation_types:
                operation_types[entry.operation_type] = 0
            operation_types[entry.operation_type] += 1
            
            # Count model names
            if entry.model_name not in model_names:
                model_names[entry.model_name] = 0
            model_names[entry.model_name] += 1
            
            # Count browser types
            if entry.browser_type not in browser_types:
                browser_types[entry.browser_type] = 0
            browser_types[entry.browser_type] += 1
            
        # Calculate success rate
        total_entries = len(self.entries)
        successful_entries = sum(1 for entry in self.entries if entry.status == "completed")
        success_rate = successful_entries / total_entries if total_entries > 0 else 0
        
        # Calculate average duration
        durations = [entry.duration_ms for entry in self.entries if entry.duration_ms is not None]
        avg_duration = sum(durations) / len(durations) if durations else 0
        
        return {
            "total_entries": total_entries,
            "successful_entries": successful_entries,
            "success_rate": success_rate,
            "avg_duration_ms": avg_duration,
            "operation_types": operation_types,
            "model_names": model_names,
            "browser_types": browser_types,
            "first_entry_time": min(entry.timestamp for entry in self.entries) if self.entries else 0,
            "last_entry_time": max(entry.timestamp for entry in self.entries) if self.entries else 0
        }

class ResourcePoolRecoveryManager:
    """Manager for resource pool fault tolerance and recovery."""
    
    def __init__(self, connection_pool=None, 
                fault_tolerance_level: str = "medium",
                recovery_strategy: str = "progressive",
                logger: Optional[logging.Logger] = None):
        self.connection_pool = connection_pool
        self.fault_tolerance_level = FaultToleranceLevel(fault_tolerance_level)
        self.recovery_strategy = RecoveryStrategy(recovery_strategy)
        self.logger = logger or logging.getLogger(__name__)
        
        # State management
        self.state_manager = BrowserStateManager(logger=self.logger)
        
        # Performance history
        self.performance_tracker = PerformanceHistoryTracker(logger=self.logger)
        
        # Recovery state
        self.recovery_in_progress = False
        self.recovery_lock = asyncio.Lock()
        
        # Counter for recovery attempts
        self.recovery_attempts = 0
        self.recovery_successes = 0
        self.recovery_failures = 0
        
        # Last error information
        self.last_error = None
        self.last_error_time = None
        self.last_recovery_time = None
        
        self.logger.info(f"Resource pool recovery manager initialized with {fault_tolerance_level} fault tolerance and {recovery_strategy} recovery strategy")
        
    async def initialize(self):
        """Initialize the recovery manager."""
        # Get available browsers from connection pool
        if self.connection_pool:
            try:
                browsers = await self.connection_pool.get_all_browsers()
                
                for browser in browsers:
                    self.state_manager.add_browser(browser["id"], browser["type"])
                    
                self.logger.info(f"Initialized recovery manager with {len(browsers)} browsers")
                
            except Exception as e:
                self.logger.error(f"Failed to initialize recovery manager: {e}")
                
    async def track_operation(self, operation_type: str, model_name: str, browser_id: str, browser_type: str) -> str:
        """Start tracking an operation."""
        # Record operation in state manager
        operation_id = str(uuid.uuid4())
        self.state_manager.add_operation_to_browser(browser_id, operation_id, {
            "operation_type": operation_type,
            "model_name": model_name,
            "start_time": time.time(),
            "status": "running"
        })
        
        # Start tracking in performance history
        entry_id = self.performance_tracker.start_operation(operation_type, model_name, browser_id, browser_type)
        
        return entry_id
        
    async def complete_operation(self, entry_id: str, metrics: Dict, status: str = "completed"):
        """Mark an operation as completed."""
        self.performance_tracker.complete_operation(entry_id, metrics, status)
        
    async def handle_browser_failure(self, browser_id: str, error: Exception) -> Dict[str, Any]:
        """Handle a browser failure."""
        async with self.recovery_lock:
            try:
                self.recovery_in_progress = True
                self.recovery_attempts += 1
                
                self.last_error = str(error)
                self.last_error_time = time.time()
                
                # Get browser state
                browser = self.state_manager.get_browser(browser_id)
                if not browser:
                    self.logger.error(f"Failed to handle browser failure: Browser {browser_id} not found")
                    self.recovery_failures += 1
                    return {
                        "success": False,
                        "error": f"Browser {browser_id} not found",
                        "recovery_attempt": self.recovery_attempts
                    }
                    
                # Update browser status
                self.state_manager.update_browser_status(browser_id, "failed")
                
                # Classify error
                failure_category = self._classify_browser_failure(error)
                
                self.logger.info(f"Handling browser failure for {browser_id}: {failure_category.value}")
                
                # Choose recovery strategy
                if self.recovery_strategy == RecoveryStrategy.PROGRESSIVE:
                    result = await self._progressive_recovery(browser_id, failure_category)
                elif self.recovery_strategy == RecoveryStrategy.RESTART:
                    result = await self._restart_recovery(browser_id, failure_category)
                elif self.recovery_strategy == RecoveryStrategy.RECONNECT:
                    result = await self._reconnect_recovery(browser_id, failure_category)
                elif self.recovery_strategy == RecoveryStrategy.FAILOVER:
                    result = await self._failover_recovery(browser_id, failure_category)
                elif self.recovery_strategy == RecoveryStrategy.PARALLEL:
                    result = await self._parallel_recovery(browser_id, failure_category)
                else:
                    result = {
                        "success": False,
                        "error": f"Unknown recovery strategy: {self.recovery_strategy}",
                        "recovery_attempt": self.recovery_attempts
                    }
                    
                # Update success/failure counts
                if result["success"]:
                    self.recovery_successes += 1
                    self.last_recovery_time = time.time()
                else:
                    self.recovery_failures += 1
                    
                return result
                
            except Exception as e:
                self.logger.error(f"Error during recovery: {e}")
                self.recovery_failures += 1
                return {
                    "success": False,
                    "error": f"Recovery error: {e}",
                    "recovery_attempt": self.recovery_attempts
                }
                
            finally:
                self.recovery_in_progress = False
                
    async def recover_operation(self, model_name: str, operation_type: str, inputs: Dict) -> Dict[str, Any]:
        """Recover an operation that failed."""
        try:
            self.logger.info(f"Recovering operation {operation_type} for model {model_name}")
            
            # Find a suitable browser for recovery
            recovery_browser = await self._find_recovery_browser(model_name, operation_type)
            
            if not recovery_browser:
                self.logger.error(f"No suitable browser found for recovery")
                return {
                    "success": False,
                    "error": "No suitable browser found for recovery",
                    "recovery_attempt": self.recovery_attempts
                }
                
            # Execute the operation on the recovery browser
            if self.connection_pool:
                browser = await self.connection_pool.get_browser(recovery_browser["id"])
                
                # Track operation
                entry_id = await self.track_operation(
                    operation_type, 
                    model_name, 
                    recovery_browser["id"], 
                    recovery_browser["type"]
                )
                
                try:
                    # Execute operation
                    start_time = time.time()
                    result = await browser.call(operation_type, {
                        "model_name": model_name,
                        "inputs": inputs,
                        "is_recovery": True
                    })
                    end_time = time.time()
                    
                    # Record metrics
                    metrics = {
                        "duration_ms": (end_time - start_time) * 1000,
                        "is_recovery": True
                    }
                    
                    if isinstance(result, dict) and "metrics" in result:
                        metrics.update(result["metrics"])
                        
                    # Complete operation tracking
                    await self.complete_operation(entry_id, metrics, "completed")
                    
                    return {
                        "success": True,
                        "result": result,
                        "recovery_browser": recovery_browser,
                        "metrics": metrics
                    }
                    
                except Exception as e:
                    self.logger.error(f"Recovery operation failed: {e}")
                    
                    # Complete operation tracking
                    await self.complete_operation(entry_id, {"error": str(e)}, "failed")
                    
                    return {
                        "success": False,
                        "error": f"Recovery operation failed: {e}",
                        "recovery_attempt": self.recovery_attempts
                    }
            else:
                # Mock execution for testing
                self.logger.info(f"Simulating recovery operation on browser {recovery_browser['id']}")
                
                # Simulate some work
                await asyncio.sleep(0.1)
                
                return {
                    "success": True,
                    "result": {
                        "output": "Mock recovery result",
                        "metrics": {
                            "duration_ms": 100,
                            "is_recovery": True
                        }
                    },
                    "recovery_browser": recovery_browser,
                    "metrics": {
                        "duration_ms": 100,
                        "is_recovery": True
                    }
                }
                
        except Exception as e:
            self.logger.error(f"Error during operation recovery: {e}")
            return {
                "success": False,
                "error": f"Recovery error: {e}",
                "recovery_attempt": self.recovery_attempts
            }
            
    async def _progressive_recovery(self, browser_id: str, failure_category: BrowserFailureCategory) -> Dict[str, Any]:
        """Progressive recovery strategy."""
        self.logger.info(f"Attempting progressive recovery for browser {browser_id}")
        
        browser = self.state_manager.get_browser(browser_id)
        
        # First try reconnection (fastest, least invasive)
        if failure_category in [BrowserFailureCategory.CONNECTION, BrowserFailureCategory.TIMEOUT]:
            try:
                reconnect_result = await self._reconnect_recovery(browser_id, failure_category)
                if reconnect_result["success"]:
                    return reconnect_result
            except Exception as e:
                self.logger.warning(f"Reconnection failed: {e}, trying restart")
                
        # If reconnection fails or not applicable, try restart
        try:
            restart_result = await self._restart_recovery(browser_id, failure_category)
            if restart_result["success"]:
                return restart_result
        except Exception as e:
            self.logger.warning(f"Restart failed: {e}, trying failover")
            
        # If restart fails, try failover
        try:
            failover_result = await self._failover_recovery(browser_id, failure_category)
            if failover_result["success"]:
                return failover_result
        except Exception as e:
            self.logger.error(f"Failover failed: {e}, all recovery strategies exhausted")
            
        # All strategies failed
        return {
            "success": False,
            "error": "All recovery strategies failed",
            "recovery_attempt": self.recovery_attempts,
            "browser_id": browser_id,
            "browser_type": browser.browser_type if browser else "unknown"
        }
        
    async def _restart_recovery(self, browser_id: str, failure_category: BrowserFailureCategory) -> Dict[str, Any]:
        """Restart recovery strategy."""
        self.logger.info(f"Attempting restart recovery for browser {browser_id}")
        
        browser = self.state_manager.get_browser(browser_id)
        if not browser:
            return {
                "success": False,
                "error": f"Browser {browser_id} not found",
                "recovery_attempt": self.recovery_attempts
            }
            
        # Create checkpoint before restart
        if self.fault_tolerance_level in [FaultToleranceLevel.MEDIUM, FaultToleranceLevel.HIGH, FaultToleranceLevel.CRITICAL]:
            checkpoint = self.state_manager.create_browser_checkpoint(browser_id)
            self.logger.info(f"Created checkpoint for browser {browser_id} before restart")
            
        # Restart browser
        if self.connection_pool:
            try:
                await self.connection_pool.restart_browser(browser_id)
                
                # Update state
                self.state_manager.update_browser_status(browser_id, "restarting")
                
                # Wait for browser to restart
                await asyncio.sleep(2)
                
                # Check if browser is back
                new_browser = await self.connection_pool.get_browser(browser_id)
                if new_browser:
                    self.state_manager.update_browser_status(browser_id, "running")
                    
                    self.logger.info(f"Successfully restarted browser {browser_id}")
                    
                    return {
                        "success": True,
                        "recovery_type": "restart",
                        "recovery_attempt": self.recovery_attempts,
                        "browser_id": browser_id,
                        "browser_type": browser.browser_type
                    }
                else:
                    self.logger.error(f"Failed to restart browser {browser_id}")
                    
                    return {
                        "success": False,
                        "error": "Failed to restart browser",
                        "recovery_attempt": self.recovery_attempts,
                        "browser_id": browser_id,
                        "browser_type": browser.browser_type
                    }
                    
            except Exception as e:
                self.logger.error(f"Error during browser restart: {e}")
                
                return {
                    "success": False,
                    "error": f"Restart error: {e}",
                    "recovery_attempt": self.recovery_attempts,
                    "browser_id": browser_id,
                    "browser_type": browser.browser_type
                }
        else:
            # Mock restart for testing
            self.logger.info(f"Simulating restart for browser {browser_id}")
            
            # Simulate some work
            await asyncio.sleep(1)
            
            # Update state
            self.state_manager.update_browser_status(browser_id, "running")
            
            return {
                "success": True,
                "recovery_type": "restart",
                "recovery_attempt": self.recovery_attempts,
                "browser_id": browser_id,
                "browser_type": browser.browser_type
            }
            
    async def _reconnect_recovery(self, browser_id: str, failure_category: BrowserFailureCategory) -> Dict[str, Any]:
        """Reconnect recovery strategy."""
        self.logger.info(f"Attempting reconnect recovery for browser {browser_id}")
        
        browser = self.state_manager.get_browser(browser_id)
        if not browser:
            return {
                "success": False,
                "error": f"Browser {browser_id} not found",
                "recovery_attempt": self.recovery_attempts
            }
            
        # Reconnect to browser
        if self.connection_pool:
            try:
                await self.connection_pool.reconnect_browser(browser_id)
                
                # Update state
                self.state_manager.update_browser_status(browser_id, "reconnecting")
                
                # Wait for reconnection
                await asyncio.sleep(1)
                
                # Check if browser is back
                new_browser = await self.connection_pool.get_browser(browser_id)
                if new_browser:
                    self.state_manager.update_browser_status(browser_id, "running")
                    
                    self.logger.info(f"Successfully reconnected to browser {browser_id}")
                    
                    return {
                        "success": True,
                        "recovery_type": "reconnect",
                        "recovery_attempt": self.recovery_attempts,
                        "browser_id": browser_id,
                        "browser_type": browser.browser_type
                    }
                else:
                    self.logger.error(f"Failed to reconnect to browser {browser_id}")
                    
                    return {
                        "success": False,
                        "error": "Failed to reconnect to browser",
                        "recovery_attempt": self.recovery_attempts,
                        "browser_id": browser_id,
                        "browser_type": browser.browser_type
                    }
                    
            except Exception as e:
                self.logger.error(f"Error during browser reconnection: {e}")
                
                return {
                    "success": False,
                    "error": f"Reconnection error: {e}",
                    "recovery_attempt": self.recovery_attempts,
                    "browser_id": browser_id,
                    "browser_type": browser.browser_type
                }
        else:
            # Mock reconnection for testing
            self.logger.info(f"Simulating reconnection for browser {browser_id}")
            
            # Simulate some work
            await asyncio.sleep(0.5)
            
            # Update state
            self.state_manager.update_browser_status(browser_id, "running")
            
            return {
                "success": True,
                "recovery_type": "reconnect",
                "recovery_attempt": self.recovery_attempts,
                "browser_id": browser_id,
                "browser_type": browser.browser_type
            }
            
    async def _failover_recovery(self, browser_id: str, failure_category: BrowserFailureCategory) -> Dict[str, Any]:
        """Failover recovery strategy."""
        self.logger.info(f"Attempting failover recovery for browser {browser_id}")
        
        browser = self.state_manager.get_browser(browser_id)
        if not browser:
            return {
                "success": False,
                "error": f"Browser {browser_id} not found",
                "recovery_attempt": self.recovery_attempts
            }
            
        # Find another browser of the same type
        same_type_browsers = [b for b in self.state_manager.get_healthy_browsers() 
                             if b.browser_type == browser.browser_type and b.browser_id != browser_id]
                             
        if not same_type_browsers:
            # Find any healthy browser
            other_browsers = [b for b in self.state_manager.get_healthy_browsers() 
                             if b.browser_id != browser_id]
                             
            if not other_browsers:
                self.logger.error(f"No healthy browsers available for failover")
                
                return {
                    "success": False,
                    "error": "No healthy browsers available for failover",
                    "recovery_attempt": self.recovery_attempts,
                    "browser_id": browser_id,
                    "browser_type": browser.browser_type
                }
                
            # Use the first available browser
            failover_browser = other_browsers[0]
        else:
            # Use a browser of the same type
            failover_browser = same_type_browsers[0]
            
        self.logger.info(f"Selected failover browser {failover_browser.browser_id} of type {failover_browser.browser_type}")
        
        # Migrate state if needed
        if self.fault_tolerance_level in [FaultToleranceLevel.HIGH, FaultToleranceLevel.CRITICAL]:
            # Get checkpoint
            checkpoint = self.state_manager.get_browser_checkpoint(browser_id)
            
            if checkpoint:
                self.logger.info(f"Migrating state from {browser_id} to {failover_browser.browser_id}")
                
                # Migrate models
                for model_id, model_state in checkpoint["models"].items():
                    self.state_manager.add_model_to_browser(failover_browser.browser_id, model_id, model_state)
                    
                # Migrate resources
                for resource_id, resource_state in checkpoint["resources"].items():
                    self.state_manager.add_resource_to_browser(failover_browser.browser_id, resource_id, resource_state)
                    
                self.logger.info(f"Migrated {len(checkpoint['models'])} models and {len(checkpoint['resources'])} resources")
                
        # Mark original browser as failed
        self.state_manager.update_browser_status(browser_id, "failed")
        
        return {
            "success": True,
            "recovery_type": "failover",
            "recovery_attempt": self.recovery_attempts,
            "browser_id": browser_id,
            "browser_type": browser.browser_type,
            "failover_browser_id": failover_browser.browser_id,
            "failover_browser_type": failover_browser.browser_type
        }
        
    async def _parallel_recovery(self, browser_id: str, failure_category: BrowserFailureCategory) -> Dict[str, Any]:
        """Parallel recovery strategy."""
        self.logger.info(f"Attempting parallel recovery for browser {browser_id}")
        
        # Try all strategies in parallel
        reconnect_task = asyncio.create_task(self._reconnect_recovery(browser_id, failure_category))
        restart_task = asyncio.create_task(self._restart_recovery(browser_id, failure_category))
        failover_task = asyncio.create_task(self._failover_recovery(browser_id, failure_category))
        
        # Wait for first successful result
        done, pending = await asyncio.wait(
            [reconnect_task, restart_task, failover_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            
        # Check results
        for task in done:
            try:
                result = task.result()
                if result["success"]:
                    self.logger.info(f"Parallel recovery succeeded with strategy {result['recovery_type']}")
                    return result
            except Exception as e:
                self.logger.warning(f"Parallel recovery task failed: {e}")
                
        # All strategies failed
        self.logger.error(f"All parallel recovery strategies failed for browser {browser_id}")
        
        return {
            "success": False,
            "error": "All parallel recovery strategies failed",
            "recovery_attempt": self.recovery_attempts,
            "browser_id": browser_id
        }
        
    async def _find_recovery_browser(self, model_name: str, operation_type: str) -> Optional[Dict]:
        """Find a suitable browser for recovery."""
        # Get browser recommendations based on performance history
        healthy_browsers = self.state_manager.get_healthy_browsers()
        
        if not healthy_browsers:
            self.logger.error("No healthy browsers available for recovery")
            return None
            
        # Get available browser types
        available_types = list(set(browser.browser_type for browser in healthy_browsers))
        
        # Get recommendation
        recommendation = self.performance_tracker.recommend_browser_type(
            model_name,
            operation_type,
            available_types
        )
        
        # Find a browser of the recommended type
        recommended_browsers = [browser for browser in healthy_browsers 
                              if browser.browser_type == recommendation["recommended_type"]]
                              
        if recommended_browsers:
            selected_browser = recommended_browsers[0]
            return {
                "id": selected_browser.browser_id,
                "type": selected_browser.browser_type,
                "reason": recommendation["reason"],
                "confidence": recommendation["confidence"]
            }
        else:
            # Fallback to any healthy browser
            selected_browser = healthy_browsers[0]
            return {
                "id": selected_browser.browser_id,
                "type": selected_browser.browser_type,
                "reason": "Fallback selection (no recommended browsers available)",
                "confidence": 0.0
            }
            
    def _classify_browser_failure(self, error: Exception) -> BrowserFailureCategory:
        """Classify browser failure based on error."""
        error_str = str(error).lower()
        
        if "connection" in error_str or "network" in error_str or "disconnected" in error_str:
            return BrowserFailureCategory.CONNECTION
            
        if "crash" in error_str or "crashed" in error_str:
            return BrowserFailureCategory.CRASH
            
        if "memory" in error_str or "out of memory" in error_str:
            return BrowserFailureCategory.MEMORY
            
        if "timeout" in error_str or "timed out" in error_str:
            return BrowserFailureCategory.TIMEOUT
            
        if "webgpu" in error_str or "gpu" in error_str:
            return BrowserFailureCategory.WEBGPU
            
        if "webnn" in error_str or "neural" in error_str:
            return BrowserFailureCategory.WEBNN
            
        return BrowserFailureCategory.UNKNOWN
        
    def get_recovery_statistics(self) -> Dict[str, Any]:
        """Get recovery statistics."""
        return {
            "recovery_attempts": self.recovery_attempts,
            "recovery_successes": self.recovery_successes,
            "recovery_failures": self.recovery_failures,
            "success_rate": self.recovery_successes / max(1, self.recovery_attempts),
            "last_error": self.last_error,
            "last_error_time": self.last_error_time,
            "last_recovery_time": self.last_recovery_time,
            "active_browsers": len(self.state_manager.get_healthy_browsers()),
            "total_browsers": len(self.state_manager.browsers),
            "browser_types": self.state_manager.get_browser_count_by_type(),
            "fault_tolerance_level": self.fault_tolerance_level.value,
            "recovery_strategy": self.recovery_strategy.value
        }
        
    def get_performance_recommendations(self) -> Dict[str, Any]:
        """Get performance recommendations based on history."""
        # Get statistics
        stats = self.performance_tracker.get_statistics()
        
        if "error" in stats:
            return {"error": "No performance data available for recommendations"}
            
        recommendations = {}
        
        # Analyze trends for each model
        for model_name in stats["model_names"]:
            model_trend = self.performance_tracker.analyze_performance_trends(model_name=model_name)
            
            if "error" not in model_trend:
                if model_trend["trend_direction"] == "degrading" and model_trend["trend_magnitude"] > 0.5:
                    # Performance is degrading significantly
                    recommendations[f"model_{model_name}"] = {
                        "issue": "degrading_performance",
                        "description": f"Performance for model {model_name} is degrading significantly",
                        "trend_magnitude": model_trend["trend_magnitude"],
                        "recommendation": "Consider browser type change or hardware upgrade"
                    }
                    
        # Analyze browser types
        for browser_type in stats["browser_types"]:
            browser_trend = self.performance_tracker.analyze_performance_trends(browser_type=browser_type)
            
            if "error" not in browser_trend:
                failure_rate = 1.0 - browser_trend["success_rate"]
                
                if failure_rate > 0.1:
                    # Failure rate is high
                    recommendations[f"browser_{browser_type}"] = {
                        "issue": "high_failure_rate",
                        "description": f"Browser type {browser_type} has a high failure rate ({failure_rate:.1%})",
                        "failure_rate": failure_rate,
                        "recommendation": "Consider using a different browser type"
                    }
                    
        # Check for specific operation issues
        for operation_type in stats["operation_types"]:
            op_trend = self.performance_tracker.analyze_performance_trends(operation_type=operation_type)
            
            if "error" not in op_trend and op_trend["avg_duration_ms"] > 1000:
                # Operation is slow
                recommendations[f"operation_{operation_type}"] = {
                    "issue": "slow_operation",
                    "description": f"Operation {operation_type} is slow ({op_trend['avg_duration_ms']:.1f}ms)",
                    "avg_duration_ms": op_trend["avg_duration_ms"],
                    "recommendation": "Optimize operation or use a faster browser type"
                }
                
        return {
            "recommendations": recommendations,
            "recommendation_count": len(recommendations),
            "based_on_entries": stats["total_entries"],
            "generation_time": time.time()
        }

async def run_with_recovery(pool, model_name: str, operation: str, inputs: Dict, 
                          recovery_manager: ResourcePoolRecoveryManager) -> Dict:
    """Run an operation with automatic recovery."""
    try:
        # Get a browser for the operation
        browser_data = await pool.get_browser_for_model(model_name)
        
        if not browser_data:
            raise Exception(f"No browser available for model {model_name}")
            
        browser_id = browser_data["id"]
        browser_type = browser_data["type"]
        browser = browser_data["browser"]
        
        # Track operation
        entry_id = await recovery_manager.track_operation(
            operation, 
            model_name, 
            browser_id, 
            browser_type
        )
        
        try:
            # Execute operation
            start_time = time.time()
            result = await browser.call(operation, {
                "model_name": model_name,
                "inputs": inputs
            })
            end_time = time.time()
            
            # Record metrics
            metrics = {
                "duration_ms": (end_time - start_time) * 1000
            }
            
            if isinstance(result, dict) and "metrics" in result:
                metrics.update(result["metrics"])
                
            # Complete operation tracking
            await recovery_manager.complete_operation(entry_id, metrics, "completed")
            
            return {
                "success": True,
                "result": result,
                "browser_id": browser_id,
                "browser_type": browser_type,
                "metrics": metrics
            }
            
        except Exception as e:
            # Operation failed
            await recovery_manager.complete_operation(entry_id, {"error": str(e)}, "failed")
            
            # Handle browser failure
            await recovery_manager.handle_browser_failure(browser_id, e)
            
            # Attempt recovery
            recovery_result = await recovery_manager.recover_operation(model_name, operation, inputs)
            
            if recovery_result["success"]:
                return {
                    "success": True,
                    "result": recovery_result["result"],
                    "recovered": True,
                    "recovery_browser": recovery_result["recovery_browser"],
                    "original_error": str(e),
                    "metrics": recovery_result["metrics"]
                }
            else:
                raise Exception(f"Operation failed and recovery failed: {recovery_result['error']}")
                
    except Exception as e:
        # Complete failure
        return {
            "success": False,
            "error": str(e)
        }

async def demo_resource_pool_recovery():
    """Demonstrate resource pool recovery features."""
    # Create recovery manager
    recovery_manager = ResourcePoolRecoveryManager(
        fault_tolerance_level="high",
        recovery_strategy="progressive"
    )
    
    # Initialize
    await recovery_manager.initialize()
    
    # Simulate browsers
    browsers = ["browser_1", "browser_2", "browser_3"]
    browser_types = ["chrome", "firefox", "edge"]
    
    for i, browser_id in enumerate(browsers):
        recovery_manager.state_manager.add_browser(browser_id, browser_types[i % len(browser_types)])
        
    print("Initialized browsers:", list(recovery_manager.state_manager.browsers.keys()))
    
    # Simulate operations
    models = ["bert-base", "gpt2-small", "t5-small"]
    operation_types = ["inference", "embedding", "generation"]
    
    for i in range(10):
        model = models[i % len(models)]
        operation = operation_types[i % len(operation_types)]
        browser_id = browsers[i % len(browsers)]
        browser_type = recovery_manager.state_manager.get_browser(browser_id).browser_type
        
        print(f"Running {operation} on {model} with browser {browser_id} ({browser_type})")
        
        # Track operation
        entry_id = await recovery_manager.track_operation(operation, model, browser_id, browser_type)
        
        # Simulate operation
        await asyncio.sleep(0.1)
        
        # Simulate success (80%) or failure (20%)
        if i % 5 != 0:
            # Success
            metrics = {
                "duration_ms": 100 + (hash(model) % 50),
                "tokens_per_second": 100 + (hash(browser_type) % 100)
            }
            
            await recovery_manager.complete_operation(entry_id, metrics, "completed")
            print(f"  Operation succeeded with metrics: {metrics}")
        else:
            # Failure
            error = Exception("Connection lost")
            
            await recovery_manager.complete_operation(entry_id, {"error": str(error)}, "failed")
            print(f"  Operation failed: {error}")
            
            # Handle failure
            recovery_result = await recovery_manager.handle_browser_failure(browser_id, error)
            print(f"  Recovery result: {recovery_result}")
            
            # If recovery succeeded, the browser should be healthy again
            browser = recovery_manager.state_manager.get_browser(browser_id)
            print(f"  Browser status after recovery: {browser.status}")
            
    # Get performance recommendations
    recommendations = recovery_manager.get_performance_recommendations()
    print("\nPerformance Recommendations:")
    for key, rec in recommendations.get("recommendations", {}).items():
        print(f"  {key}: {rec['description']} - {rec['recommendation']}")
        
    # Get recovery statistics
    stats = recovery_manager.get_recovery_statistics()
    print("\nRecovery Statistics:")
    print(f"  Attempts: {stats['recovery_attempts']}")
    print(f"  Successes: {stats['recovery_successes']}")
    print(f"  Failures: {stats['recovery_failures']}")
    print(f"  Success Rate: {stats['success_rate']:.1%}")
    print(f"  Active Browsers: {stats['active_browsers']} / {stats['total_browsers']}")
    
    # Analyze performance trends
    for model in models:
        trend = recovery_manager.performance_tracker.analyze_performance_trends(model_name=model)
        if "error" not in trend:
            print(f"\nPerformance Trend for {model}:")
            print(f"  Avg Duration: {trend['avg_duration_ms']:.1f}ms")
            print(f"  Trend Direction: {trend['trend_direction']}")
            print(f"  Success Rate: {trend['success_rate']:.1%}")
            
    # Analyze browser performance
    for browser_type in browser_types:
        trend = recovery_manager.performance_tracker.analyze_performance_trends(browser_type=browser_type)
        if "error" not in trend:
            print(f"\nPerformance Trend for {browser_type}:")
            print(f"  Avg Duration: {trend['avg_duration_ms']:.1f}ms")
            print(f"  Trend Direction: {trend['trend_direction']}")
            print(f"  Success Rate: {trend['success_rate']:.1%}")
            
    # Recommend browser type for model
    for model in models:
        for operation in operation_types:
            recommendation = recovery_manager.performance_tracker.recommend_browser_type(
                model,
                operation,
                browser_types
            )
            
            if "error" not in recommendation:
                print(f"\nRecommended browser for {model} ({operation}):")
                print(f"  Type: {recommendation['recommended_type']}")
                print(f"  Reason: {recommendation['reason']}")
                print(f"  Confidence: {recommendation['confidence']:.1%}")

if __name__ == "__main__":
    # Run the demo
    asyncio.run(demo_resource_pool_recovery())