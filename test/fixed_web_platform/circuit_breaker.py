"""
WebGPU/WebNN Resource Pool Circuit Breaker Pattern

This module implements the circuit breaker pattern for WebGPU/WebNN Resource Pool Integration.
The circuit breaker prevents cascading failures and implements performance-based recovery strategies.

Key features:
1. Three-state circuit breaker (CLOSED, OPEN, HALF-OPEN)
2. Health score calculation for browsers and connections
3. Performance-driven error recovery strategies
4. Comprehensive metrics and trend analysis
5. Browser-specific recovery strategies

Usage:
    from fixed_web_platform.circuit_breaker import CircuitBreaker, BrowserCircuitBreakerManager

    # Create a circuit breaker
    circuit = CircuitBreaker(name="browser_chrome_1", failure_threshold=5)
    
    # Use circuit breaker to protect operations
    try:
        result = await circuit.execute(lambda: some_operation())
    except CircuitBreakerError as e:
        # Handle fast fail
        print(f"Circuit is open: {e}")
"""

import asyncio
import enum
import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar, Union, Awaitable

# Type definitions
T = TypeVar('T')
AsyncCallable = Callable[[], Awaitable[T]]
SyncCallable = Callable[[], T]


class CircuitBreakerState(enum.Enum):
    """Circuit breaker states"""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Fast fail
    HALF_OPEN = "half_open"  # Testing recovery


class CircuitBreakerError(Exception):
    """Exception raised when circuit is open"""
    pass


@dataclass
class ErrorEvent:
    """Record of an error for circuit breaker analysis"""
    timestamp: float
    error_type: str
    error_message: str
    operation_type: str
    context: Dict[str, Any]


@dataclass
class SuccessEvent:
    """Record of a successful operation for circuit breaker analysis"""
    timestamp: float
    duration_ms: float
    operation_type: str
    context: Dict[str, Any]


@dataclass
class CircuitTransition:
    """Record of a circuit state transition"""
    timestamp: float
    from_state: CircuitBreakerState
    to_state: CircuitBreakerState
    reason: str


class CircuitBreaker:
    """
    Implementation of the circuit breaker pattern with performance-based recovery.
    
    The circuit breaker has three states:
    1. CLOSED: Normal operation, requests flow through
    2. OPEN: Circuit is open, requests fail fast
    3. HALF_OPEN: Testing if service has recovered
    
    Key features:
    - Adaptive failure thresholds based on historical performance
    - Sliding window for tracking failures and latency
    - Progressive backoff for recovery attempts
    - Detailed metrics and state transitions
    """
    
    def __init__(
        self, 
        name: str,
        failure_threshold: int = 5,
        recovery_timeout_seconds: float = 30.0,
        half_open_max_calls: int = 3,
        half_open_success_threshold: int = 3,
        max_history: int = 100,
        slow_call_duration_ms: float = 2000.0,
        logger: Optional[logging.Logger] = None
    ):
        # Configuration
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self.half_open_max_calls = half_open_max_calls
        self.half_open_success_threshold = half_open_success_threshold
        self.max_history = max_history
        self.slow_call_duration_ms = slow_call_duration_ms
        
        # State
        self.state = CircuitBreakerState.CLOSED
        self.consecutive_failures = 0
        self.consecutive_successes = 0
        self.last_error = None
        self.last_state_change_time = time.time()
        
        # Tracking
        self.error_history: deque[ErrorEvent] = deque(maxlen=max_history)
        self.success_history: deque[SuccessEvent] = deque(maxlen=max_history)
        self.transition_history: deque[CircuitTransition] = deque(maxlen=max_history)
        
        # Half-open state management
        self.half_open_calls = 0
        self.half_open_lock = asyncio.Lock()
        
        # Health metrics
        self.health_score = 100.0  # 0-100 score, higher is better
        self._last_health_calculation = 0
        
        # Recovery backoff
        self.recovery_attempt_count = 0
        self.last_recovery_attempt = 0
        
        # Advanced metrics
        self.total_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
        self.slow_calls = 0
        
        # Performance tracking
        self.total_duration_ms = 0
        self.min_duration_ms = float('inf')
        self.max_duration_ms = 0
        
        # Logging
        self.logger = logger or logging.getLogger(__name__)
        
        self.logger.info(f"CircuitBreaker '{name}' initialized in CLOSED state")
    
    async def execute(self, func: Union[AsyncCallable[T], SyncCallable[T]]) -> T:
        """
        Execute a function with circuit breaker protection.
        
        Args:
            func: The function to execute
            
        Returns:
            The result of the function
            
        Raises:
            CircuitBreakerError: If the circuit is open
            Exception: Any exception raised by the function
        """
        self.total_calls += 1
        
        # Check circuit state
        if self.state == CircuitBreakerState.OPEN:
            # Check if recovery timeout has elapsed
            if time.time() - self.last_state_change_time > self.recovery_timeout_seconds:
                # Transition to half-open
                await self._transition_to(CircuitBreakerState.HALF_OPEN, "Recovery timeout elapsed")
            else:
                # Fast fail
                self.logger.debug(f"CircuitBreaker '{self.name}' is OPEN, failing fast")
                raise CircuitBreakerError(f"Circuit '{self.name}' is open until {self.last_state_change_time + self.recovery_timeout_seconds}")
        
        # For HALF-OPEN state, control concurrency
        if self.state == CircuitBreakerState.HALF_OPEN:
            async with self.half_open_lock:
                # Only allow limited calls through in HALF-OPEN state
                if self.half_open_calls >= self.half_open_max_calls:
                    self.logger.debug(f"CircuitBreaker '{self.name}' is HALF-OPEN with max calls reached, failing fast")
                    raise CircuitBreakerError(f"Circuit '{self.name}' is half-open with max concurrent calls reached")
                
                self.half_open_calls += 1
        
        # Execute the function
        start_time = time.time()
        try:
            # Call the function (handle both async and sync functions)
            if asyncio.iscoroutinefunction(func):
                result = await func()
            else:
                result = func()
            
            # Record success
            duration_ms = (time.time() - start_time) * 1000
            self._record_success(duration_ms)
            
            # In HALF-OPEN state, check if we can transition back to CLOSED
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.consecutive_successes += 1
                if self.consecutive_successes >= self.half_open_success_threshold:
                    await self._transition_to(CircuitBreakerState.CLOSED, "Success threshold reached in HALF-OPEN state")
            
            return result
            
        except Exception as e:
            # Record failure
            self._record_failure(e)
            
            # Check if we need to open the circuit
            if self.state == CircuitBreakerState.CLOSED and self.consecutive_failures >= self.failure_threshold:
                await self._transition_to(CircuitBreakerState.OPEN, f"Failure threshold reached ({self.consecutive_failures} consecutive failures)")
            
            # In HALF-OPEN state, a single failure transitions back to OPEN
            elif self.state == CircuitBreakerState.HALF_OPEN:
                await self._transition_to(CircuitBreakerState.OPEN, "Failure during HALF-OPEN recovery testing")
            
            # Re-raise the exception
            raise
            
        finally:
            # Decrement the half-open calls counter if in HALF-OPEN state
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.half_open_calls = max(0, self.half_open_calls - 1)
    
    async def _transition_to(self, new_state: CircuitBreakerState, reason: str):
        """
        Transition the circuit to a new state.
        
        Args:
            new_state: The new state
            reason: The reason for the transition
        """
        old_state = self.state
        self.state = new_state
        self.last_state_change_time = time.time()
        
        # Reset counters
        if new_state == CircuitBreakerState.CLOSED:
            self.consecutive_failures = 0
            self.consecutive_successes = 0
            self.half_open_calls = 0
        elif new_state == CircuitBreakerState.OPEN:
            self.consecutive_successes = 0
            self.half_open_calls = 0
            self.recovery_attempt_count += 1
            self.last_recovery_attempt = time.time()
        elif new_state == CircuitBreakerState.HALF_OPEN:
            self.consecutive_successes = 0
            self.half_open_calls = 0
        
        # Record transition
        transition = CircuitTransition(
            timestamp=time.time(),
            from_state=old_state,
            to_state=new_state,
            reason=reason
        )
        self.transition_history.append(transition)
        
        self.logger.info(f"CircuitBreaker '{self.name}' transitioned from {old_state.value} to {new_state.value}: {reason}")
    
    def _record_success(self, duration_ms: float):
        """Record a successful call"""
        self.successful_calls += 1
        
        # Reset consecutive failures
        if self.state == CircuitBreakerState.CLOSED:
            self.consecutive_failures = 0
        
        # Update duration stats
        self.total_duration_ms += duration_ms
        self.min_duration_ms = min(self.min_duration_ms, duration_ms)
        self.max_duration_ms = max(self.max_duration_ms, duration_ms)
        
        # Check if slow call
        if duration_ms > self.slow_call_duration_ms:
            self.slow_calls += 1
        
        # Add to history
        success_event = SuccessEvent(
            timestamp=time.time(),
            duration_ms=duration_ms,
            operation_type="unknown",  # Will be set by caller if needed
            context={}
        )
        self.success_history.append(success_event)
        
        # Update health score
        self._update_health_score()
    
    def _record_failure(self, error: Exception):
        """Record a failed call"""
        self.failed_calls += 1
        self.consecutive_failures += 1
        self.last_error = str(error)
        
        # Reset consecutive successes
        self.consecutive_successes = 0
        
        # Add to history
        error_event = ErrorEvent(
            timestamp=time.time(),
            error_type=type(error).__name__,
            error_message=str(error),
            operation_type="unknown",  # Will be set by caller if needed
            context={}
        )
        self.error_history.append(error_event)
        
        # Update health score
        self._update_health_score()
    
    def _update_health_score(self):
        """
        Update the health score based on recent history.
        
        The health score is a value between 0 and 100, with higher being better.
        It's calculated based on multiple factors:
        - Error rate in recent calls
        - Response time stability
        - Consecutive failures
        - Circuit state
        """
        # Only recalculate at most once per second
        now = time.time()
        if now - self._last_health_calculation < 1.0:
            return
            
        self._last_health_calculation = now
        
        # Start with base score
        score = 100.0
        
        # Factor 1: Recent error rate (last 20 calls)
        total_recent = min(20, len(self.error_history) + len(self.success_history))
        if total_recent > 0:
            recent_errors = sum(1 for e in self.error_history if now - e.timestamp < 60)
            recent_success = sum(1 for s in self.success_history if now - s.timestamp < 60)
            recent_total = recent_errors + recent_success
            
            if recent_total > 0:
                error_rate = recent_errors / recent_total
                score -= error_rate * 50  # Up to 50 points penalty for high error rate
        
        # Factor 2: Response time stability
        recent_durations = [s.duration_ms for s in self.success_history if now - s.timestamp < 60]
        if recent_durations:
            avg_duration = sum(recent_durations) / len(recent_durations)
            if avg_duration > self.slow_call_duration_ms:
                # Penalty for slow calls
                slowness_factor = min(1.0, avg_duration / (self.slow_call_duration_ms * 2))
                score -= slowness_factor * 20  # Up to 20 points penalty for slowness
        
        # Factor 3: Consecutive failures
        if self.consecutive_failures > 0:
            failure_factor = min(1.0, self.consecutive_failures / self.failure_threshold)
            score -= failure_factor * 30  # Up to 30 points penalty for consecutive failures
        
        # Factor 4: Circuit state
        if self.state == CircuitBreakerState.OPEN:
            score = min(score, 10.0)  # Maximum 10 points when open
        elif self.state == CircuitBreakerState.HALF_OPEN:
            score = min(score, 50.0)  # Maximum 50 points when half-open
        
        # Ensure score is between 0 and 100
        self.health_score = max(0.0, min(100.0, score))
    
    def get_backoff_seconds(self) -> float:
        """
        Get the current backoff time in seconds.
        Uses exponential backoff with jitter.
        """
        if self.recovery_attempt_count == 0:
            return 0
            
        # Base backoff: 1s, 2s, 4s, 8s, etc.
        base_backoff = min(60, 2 ** (self.recovery_attempt_count - 1))
        
        # Add jitter (±20%)
        jitter_factor = 0.8 + (hash(f"{self.name}_{self.recovery_attempt_count}") % 40) / 100
        
        return base_backoff * jitter_factor
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get comprehensive metrics about the circuit breaker"""
        now = time.time()
        
        # Calculate error rate
        error_rate = 0
        if self.total_calls > 0:
            error_rate = self.failed_calls / self.total_calls
            
        # Calculate average duration
        avg_duration_ms = 0
        if self.successful_calls > 0:
            avg_duration_ms = self.total_duration_ms / self.successful_calls
        
        # Get recent error types
        recent_error_types = {}
        for error in self.error_history:
            if now - error.timestamp < 300:  # Last 5 minutes
                if error.error_type not in recent_error_types:
                    recent_error_types[error.error_type] = 0
                recent_error_types[error.error_type] += 1
        
        # Calculate recent error rate (last 5 minutes)
        recent_errors = sum(1 for e in self.error_history if now - e.timestamp < 300)
        recent_successes = sum(1 for s in self.success_history if now - s.timestamp < 300)
        recent_total = recent_errors + recent_successes
        recent_error_rate = recent_errors / recent_total if recent_total > 0 else 0
        
        return {
            "name": self.name,
            "state": self.state.value,
            "health_score": self.health_score,
            "consecutive_failures": self.consecutive_failures,
            "consecutive_successes": self.consecutive_successes,
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "slow_calls": self.slow_calls,
            "error_rate": error_rate,
            "recent_error_rate": recent_error_rate,
            "last_error": self.last_error,
            "avg_duration_ms": avg_duration_ms,
            "min_duration_ms": self.min_duration_ms if self.min_duration_ms != float('inf') else None,
            "max_duration_ms": self.max_duration_ms if self.max_duration_ms > 0 else None,
            "time_in_current_state": now - self.last_state_change_time,
            "recovery_attempt_count": self.recovery_attempt_count,
            "current_backoff_seconds": self.get_backoff_seconds(),
            "recent_error_types": recent_error_types,
            "last_state_change": self.last_state_change_time,
            "configuration": {
                "failure_threshold": self.failure_threshold,
                "recovery_timeout_seconds": self.recovery_timeout_seconds,
                "half_open_max_calls": self.half_open_max_calls,
                "half_open_success_threshold": self.half_open_success_threshold,
                "slow_call_duration_ms": self.slow_call_duration_ms
            }
        }
    
    def get_recent_errors(self, seconds: float = 300) -> List[Dict[str, Any]]:
        """Get recent errors within the specified time window"""
        now = time.time()
        return [
            {
                "timestamp": e.timestamp,
                "error_type": e.error_type,
                "error_message": e.error_message,
                "operation_type": e.operation_type,
                "age_seconds": now - e.timestamp
            }
            for e in self.error_history
            if now - e.timestamp < seconds
        ]
    
    def get_recent_operations(self, seconds: float = 300) -> List[Dict[str, Any]]:
        """Get recent operations (both successes and failures) within the specified time window"""
        now = time.time()
        
        # Collect successful operations
        successes = [
            {
                "timestamp": s.timestamp,
                "success": True,
                "duration_ms": s.duration_ms,
                "operation_type": s.operation_type,
                "age_seconds": now - s.timestamp
            }
            for s in self.success_history
            if now - s.timestamp < seconds
        ]
        
        # Collect failed operations
        failures = [
            {
                "timestamp": e.timestamp,
                "success": False,
                "error_type": e.error_type,
                "error_message": e.error_message,
                "operation_type": e.operation_type,
                "age_seconds": now - e.timestamp
            }
            for e in self.error_history
            if now - e.timestamp < seconds
        ]
        
        # Combine and sort by timestamp (newest first)
        combined = successes + failures
        return sorted(combined, key=lambda x: x["timestamp"], reverse=True)
    
    def get_state_transitions(self, max_count: int = 10) -> List[Dict[str, Any]]:
        """Get recent state transitions"""
        return [
            {
                "timestamp": t.timestamp,
                "from_state": t.from_state.value,
                "to_state": t.to_state.value,
                "reason": t.reason
            }
            for t in list(self.transition_history)[-max_count:]
        ]
    

class BrowserCircuitBreakerManager:
    """
    Manages circuit breakers for browser connections.
    
    Features:
    - Maintains a circuit breaker for each browser connection
    - Provides global health metrics
    - Implements browser-specific recovery strategies
    - Tracks browser performance history
    """
    
    def __init__(
        self,
        logger: Optional[logging.Logger] = None,
        db_path: Optional[str] = None,
        enable_performance_history: bool = True
    ):
        # All circuit breakers
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        
        # Browser-type specific settings
        self.browser_settings: Dict[str, Dict[str, Any]] = {
            "chrome": {
                "failure_threshold": 5,
                "recovery_timeout_seconds": 30.0,
                "slow_call_duration_ms": 2000.0
            },
            "firefox": {
                "failure_threshold": 4,
                "recovery_timeout_seconds": 20.0,
                "slow_call_duration_ms": 1800.0
            },
            "edge": {
                "failure_threshold": 5,
                "recovery_timeout_seconds": 25.0,
                "slow_call_duration_ms": 2000.0
            },
            "safari": {
                "failure_threshold": 3,
                "recovery_timeout_seconds": 45.0,
                "slow_call_duration_ms": 2500.0
            }
        }
        
        # Logging
        self.logger = logger or logging.getLogger(__name__)
        
        # Database path for persistent storage
        self.db_path = db_path
        
        # Performance history
        self.enable_performance_history = enable_performance_history
        self.performance_history = {}
        
        self.logger.info("BrowserCircuitBreakerManager initialized")
    
    def get_or_create_circuit(self, browser_id: str, browser_type: str) -> CircuitBreaker:
        """
        Get or create a circuit breaker for a browser.
        
        Args:
            browser_id: The browser ID
            browser_type: The browser type (chrome, firefox, edge, safari)
            
        Returns:
            The circuit breaker
        """
        if browser_id not in self.circuit_breakers:
            # Get browser-specific settings
            settings = self.browser_settings.get(browser_type.lower(), {})
            
            # Create circuit breaker with browser-specific settings
            self.circuit_breakers[browser_id] = CircuitBreaker(
                name=f"{browser_type}_{browser_id}",
                failure_threshold=settings.get("failure_threshold", 5),
                recovery_timeout_seconds=settings.get("recovery_timeout_seconds", 30.0),
                slow_call_duration_ms=settings.get("slow_call_duration_ms", 2000.0),
                logger=self.logger
            )
            
            self.logger.info(f"Created circuit breaker for {browser_type} browser {browser_id}")
        
        return self.circuit_breakers[browser_id]
    
    def remove_circuit(self, browser_id: str):
        """
        Remove a circuit breaker.
        
        Args:
            browser_id: The browser ID
        """
        if browser_id in self.circuit_breakers:
            del self.circuit_breakers[browser_id]
            self.logger.info(f"Removed circuit breaker for browser {browser_id}")
    
    def get_global_health(self) -> Dict[str, Any]:
        """
        Get global health metrics for all circuit breakers.
        
        Returns:
            Global health metrics
        """
        if not self.circuit_breakers:
            return {
                "overall_health_score": 100.0,
                "circuit_count": 0,
                "open_circuit_count": 0,
                "half_open_circuit_count": 0,
                "closed_circuit_count": 0,
                "status": "healthy"
            }
        
        # Count circuit states
        open_count = sum(1 for c in self.circuit_breakers.values() if c.state == CircuitBreakerState.OPEN)
        half_open_count = sum(1 for c in self.circuit_breakers.values() if c.state == CircuitBreakerState.HALF_OPEN)
        closed_count = sum(1 for c in self.circuit_breakers.values() if c.state == CircuitBreakerState.CLOSED)
        
        # Calculate average health score
        avg_health = sum(c.health_score for c in self.circuit_breakers.values()) / len(self.circuit_breakers)
        
        # Determine overall status
        if open_count > 0:
            if open_count == len(self.circuit_breakers):
                status = "critical"  # All circuits open
            else:
                status = "degraded"  # Some circuits open
        elif half_open_count > 0:
            status = "recovering"  # Some circuits half-open
        else:
            status = "healthy"  # All circuits closed
        
        return {
            "overall_health_score": avg_health,
            "circuit_count": len(self.circuit_breakers),
            "open_circuit_count": open_count,
            "half_open_circuit_count": half_open_count,
            "closed_circuit_count": closed_count,
            "status": status
        }
    
    def get_browser_type_health(self) -> Dict[str, Dict[str, Any]]:
        """
        Get health metrics grouped by browser type.
        
        Returns:
            Health metrics by browser type
        """
        browser_types = {}
        
        for browser_id, circuit in self.circuit_breakers.items():
            # Extract browser type from circuit name
            browser_type = circuit.name.split('_')[0].lower()
            
            if browser_type not in browser_types:
                browser_types[browser_type] = {
                    "circuits": [],
                    "health_scores": [],
                    "open_count": 0,
                    "half_open_count": 0,
                    "closed_count": 0
                }
            
            # Add circuit
            browser_types[browser_type]["circuits"].append(browser_id)
            browser_types[browser_type]["health_scores"].append(circuit.health_score)
            
            # Count by state
            if circuit.state == CircuitBreakerState.OPEN:
                browser_types[browser_type]["open_count"] += 1
            elif circuit.state == CircuitBreakerState.HALF_OPEN:
                browser_types[browser_type]["half_open_count"] += 1
            else:
                browser_types[browser_type]["closed_count"] += 1
        
        # Calculate metrics for each browser type
        result = {}
        for browser_type, data in browser_types.items():
            avg_health = sum(data["health_scores"]) / len(data["health_scores"])
            
            # Determine status
            if data["open_count"] > 0:
                if data["open_count"] == len(data["circuits"]):
                    status = "critical"  # All circuits open
                else:
                    status = "degraded"  # Some circuits open
            elif data["half_open_count"] > 0:
                status = "recovering"  # Some circuits half-open
            else:
                status = "healthy"  # All circuits closed
            
            result[browser_type] = {
                "circuit_count": len(data["circuits"]),
                "avg_health_score": avg_health,
                "open_count": data["open_count"],
                "half_open_count": data["half_open_count"],
                "closed_count": data["closed_count"],
                "status": status
            }
        
        return result
    
    def get_circuit_metrics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get metrics for all circuit breakers.
        
        Returns:
            Metrics for all circuit breakers
        """
        return {
            browser_id: circuit.get_metrics()
            for browser_id, circuit in self.circuit_breakers.items()
        }
    
    def get_detailed_report(self) -> Dict[str, Any]:
        """
        Get a detailed report of all circuit breakers.
        
        Returns:
            Detailed report
        """
        return {
            "timestamp": time.time(),
            "global_health": self.get_global_health(),
            "browser_type_health": self.get_browser_type_health(),
            "circuits": self.get_circuit_metrics(),
            "performance_metrics": self.get_performance_metrics() if self.enable_performance_history else {}
        }
    
    def record_browser_performance(self, browser_id: str, browser_type: str, 
                                  operation_type: str, model_type: str,
                                  duration_ms: float, success: bool, 
                                  error: Optional[str] = None,
                                  metrics: Optional[Dict[str, Any]] = None):
        """
        Record browser performance for a specific operation.
        
        Args:
            browser_id: The browser ID
            browser_type: The browser type
            operation_type: The operation type
            model_type: The model type
            duration_ms: The operation duration in milliseconds
            success: Whether the operation was successful
            error: The error message if the operation failed
            metrics: Additional metrics
        """
        if not self.enable_performance_history:
            return
            
        # Initialize browser performance history
        if browser_id not in self.performance_history:
            self.performance_history[browser_id] = {
                "operations": [],
                "browser_type": browser_type,
                "total_operations": 0,
                "successful_operations": 0,
                "failed_operations": 0,
                "total_duration_ms": 0,
                "avg_duration_ms": 0,
                "last_operation_time": 0
            }
        
        # Record operation
        operation = {
            "timestamp": time.time(),
            "operation_type": operation_type,
            "model_type": model_type,
            "duration_ms": duration_ms,
            "success": success
        }
        
        if error:
            operation["error"] = error
            
        if metrics:
            operation["metrics"] = metrics
        
        # Add to history with maximum size
        history = self.performance_history[browser_id]
        history["operations"].append(operation)
        if len(history["operations"]) > 100:
            history["operations"] = history["operations"][-100:]
        
        # Update metrics
        history["total_operations"] += 1
        history["last_operation_time"] = time.time()
        
        if success:
            history["successful_operations"] += 1
            history["total_duration_ms"] += duration_ms
            history["avg_duration_ms"] = history["total_duration_ms"] / history["successful_operations"]
        else:
            history["failed_operations"] += 1
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """
        Get performance metrics for all browsers.
        
        Returns:
            Performance metrics
        """
        if not self.enable_performance_history:
            return {}
            
        # Prepare metrics by browser
        browser_metrics = {
            browser_id: {
                "browser_type": data["browser_type"],
                "total_operations": data["total_operations"],
                "successful_operations": data["successful_operations"],
                "failed_operations": data["failed_operations"],
                "success_rate": data["successful_operations"] / max(1, data["total_operations"]),
                "avg_duration_ms": data["avg_duration_ms"],
                "last_operation_time": data["last_operation_time"],
                "recent_errors": self._get_recent_errors(browser_id, 300)  # Last 5 minutes
            }
            for browser_id, data in self.performance_history.items()
        }
        
        # Analyze by browser type
        browser_type_metrics = {}
        for browser_id, data in browser_metrics.items():
            browser_type = data["browser_type"]
            
            if browser_type not in browser_type_metrics:
                browser_type_metrics[browser_type] = {
                    "browser_count": 0,
                    "total_operations": 0,
                    "successful_operations": 0,
                    "failed_operations": 0,
                    "total_duration_ms": 0
                }
                
            metrics = browser_type_metrics[browser_type]
            metrics["browser_count"] += 1
            metrics["total_operations"] += data["total_operations"]
            metrics["successful_operations"] += data["successful_operations"]
            metrics["failed_operations"] += data["failed_operations"]
            metrics["total_duration_ms"] += data["avg_duration_ms"] * data["successful_operations"]
        
        # Calculate averages
        for browser_type, metrics in browser_type_metrics.items():
            if metrics["successful_operations"] > 0:
                metrics["avg_duration_ms"] = metrics["total_duration_ms"] / metrics["successful_operations"]
            else:
                metrics["avg_duration_ms"] = 0
                
            metrics["success_rate"] = metrics["successful_operations"] / max(1, metrics["total_operations"])
        
        # Analyze by model type
        model_type_metrics = self._analyze_by_model_type()
        
        # Analyze by operation type
        operation_type_metrics = self._analyze_by_operation_type()
        
        return {
            "browsers": browser_metrics,
            "browser_types": browser_type_metrics,
            "model_types": model_type_metrics,
            "operation_types": operation_type_metrics,
            "browser_recommendations": self._generate_browser_recommendations(),
            "summary": {
                "total_operations": sum(m["total_operations"] for m in browser_metrics.values()),
                "successful_operations": sum(m["successful_operations"] for m in browser_metrics.values()),
                "failed_operations": sum(m["failed_operations"] for m in browser_metrics.values()),
                "browser_count": len(browser_metrics),
                "browser_type_count": len(browser_type_metrics)
            }
        }
    
    def _get_recent_errors(self, browser_id: str, seconds: float = 300) -> List[Dict[str, Any]]:
        """Get recent errors for a browser"""
        if browser_id not in self.performance_history:
            return []
            
        now = time.time()
        return [
            {
                "timestamp": op["timestamp"],
                "operation_type": op["operation_type"],
                "model_type": op["model_type"],
                "error": op.get("error", "Unknown error"),
                "age_seconds": now - op["timestamp"]
            }
            for op in self.performance_history[browser_id]["operations"]
            if not op["success"] and now - op["timestamp"] < seconds
        ]
    
    def _analyze_by_model_type(self) -> Dict[str, Dict[str, Any]]:
        """Analyze performance by model type"""
        model_types = {}
        
        # Collect operations by model type
        for browser_data in self.performance_history.values():
            for op in browser_data["operations"]:
                model_type = op["model_type"]
                
                if model_type not in model_types:
                    model_types[model_type] = {
                        "total_operations": 0,
                        "successful_operations": 0,
                        "failed_operations": 0,
                        "total_duration_ms": 0,
                        "browser_types": {}
                    }
                
                metrics = model_types[model_type]
                metrics["total_operations"] += 1
                
                if op["success"]:
                    metrics["successful_operations"] += 1
                    metrics["total_duration_ms"] += op["duration_ms"]
                else:
                    metrics["failed_operations"] += 1
                
                # Track by browser type
                browser_type = browser_data["browser_type"]
                if browser_type not in metrics["browser_types"]:
                    metrics["browser_types"][browser_type] = {
                        "total_operations": 0,
                        "successful_operations": 0,
                        "failed_operations": 0,
                        "total_duration_ms": 0
                    }
                
                browser_metrics = metrics["browser_types"][browser_type]
                browser_metrics["total_operations"] += 1
                
                if op["success"]:
                    browser_metrics["successful_operations"] += 1
                    browser_metrics["total_duration_ms"] += op["duration_ms"]
                else:
                    browser_metrics["failed_operations"] += 1
        
        # Calculate averages
        for model_type, metrics in model_types.items():
            if metrics["successful_operations"] > 0:
                metrics["avg_duration_ms"] = metrics["total_duration_ms"] / metrics["successful_operations"]
            else:
                metrics["avg_duration_ms"] = 0
                
            metrics["success_rate"] = metrics["successful_operations"] / max(1, metrics["total_operations"])
            
            # Calculate browser type averages
            for browser_type, browser_metrics in metrics["browser_types"].items():
                if browser_metrics["successful_operations"] > 0:
                    browser_metrics["avg_duration_ms"] = browser_metrics["total_duration_ms"] / browser_metrics["successful_operations"]
                else:
                    browser_metrics["avg_duration_ms"] = 0
                    
                browser_metrics["success_rate"] = browser_metrics["successful_operations"] / max(1, browser_metrics["total_operations"])
            
            # Find best browser type for this model type
            if metrics["browser_types"]:
                best_browser = min(
                    metrics["browser_types"].items(),
                    key=lambda x: (
                        # First sort by success rate (higher is better)
                        -x[1]["success_rate"],
                        # Then by average duration (lower is better)
                        x[1]["avg_duration_ms"] if x[1]["successful_operations"] > 0 else float('inf')
                    )
                )
                
                metrics["recommended_browser"] = best_browser[0]
                metrics["recommendation_confidence"] = self._calculate_recommendation_confidence(best_browser[1])
        
        return model_types
    
    def _analyze_by_operation_type(self) -> Dict[str, Dict[str, Any]]:
        """Analyze performance by operation type"""
        operation_types = {}
        
        # Collect operations by operation type
        for browser_data in self.performance_history.values():
            for op in browser_data["operations"]:
                operation_type = op["operation_type"]
                
                if operation_type not in operation_types:
                    operation_types[operation_type] = {
                        "total_operations": 0,
                        "successful_operations": 0,
                        "failed_operations": 0,
                        "total_duration_ms": 0
                    }
                
                metrics = operation_types[operation_type]
                metrics["total_operations"] += 1
                
                if op["success"]:
                    metrics["successful_operations"] += 1
                    metrics["total_duration_ms"] += op["duration_ms"]
                else:
                    metrics["failed_operations"] += 1
        
        # Calculate averages
        for operation_type, metrics in operation_types.items():
            if metrics["successful_operations"] > 0:
                metrics["avg_duration_ms"] = metrics["total_duration_ms"] / metrics["successful_operations"]
            else:
                metrics["avg_duration_ms"] = 0
                
            metrics["success_rate"] = metrics["successful_operations"] / max(1, metrics["total_operations"])
        
        return operation_types
    
    def _calculate_recommendation_confidence(self, metrics: Dict[str, Any]) -> float:
        """
        Calculate confidence score for a recommendation.
        
        Args:
            metrics: Performance metrics
            
        Returns:
            Confidence score (0.0-1.0)
        """
        # Base confidence on sample size
        sample_size_factor = min(1.0, metrics["total_operations"] / 10)
        
        # Adjust by success rate
        success_rate_factor = metrics["success_rate"]
        
        # Confidence is a combination of factors
        confidence = sample_size_factor * success_rate_factor
        
        return confidence
    
    def _generate_browser_recommendations(self) -> Dict[str, str]:
        """
        Generate browser recommendations for each model type.
        
        Returns:
            Browser recommendations by model type
        """
        model_types = self._analyze_by_model_type()
        
        recommendations = {}
        for model_type, metrics in model_types.items():
            if "recommended_browser" in metrics:
                recommendations[model_type] = metrics["recommended_browser"]
        
        return recommendations
    
    async def execute_with_circuit_breaker(
        self, 
        browser_id: str, 
        browser_type: str,
        operation_type: str,
        model_type: str,
        func: Union[AsyncCallable[T], SyncCallable[T]]
    ) -> T:
        """
        Execute a function with circuit breaker protection.
        
        Args:
            browser_id: The browser ID
            browser_type: The browser type
            operation_type: The operation type
            model_type: The model type
            func: The function to execute
            
        Returns:
            The result of the function
            
        Raises:
            CircuitBreakerError: If the circuit is open
            Exception: Any exception raised by the function
        """
        # Get circuit breaker
        circuit = self.get_or_create_circuit(browser_id, browser_type)
        
        start_time = time.time()
        try:
            # Execute with circuit breaker
            result = await circuit.execute(func)
            
            # Record success
            duration_ms = (time.time() - start_time) * 1000
            self.record_browser_performance(
                browser_id=browser_id,
                browser_type=browser_type,
                operation_type=operation_type,
                model_type=model_type,
                duration_ms=duration_ms,
                success=True
            )
            
            return result
            
        except Exception as e:
            # Record failure
            duration_ms = (time.time() - start_time) * 1000
            self.record_browser_performance(
                browser_id=browser_id,
                browser_type=browser_type,
                operation_type=operation_type,
                model_type=model_type,
                duration_ms=duration_ms,
                success=False,
                error=str(e)
            )
            
            # Re-raise
            raise