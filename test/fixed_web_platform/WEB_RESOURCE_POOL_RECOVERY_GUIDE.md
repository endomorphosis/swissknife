# Web Resource Pool Recovery Guide

This guide provides comprehensive documentation for the fault tolerance and recovery features of the WebGPU/WebNN Resource Pool.

## Table of Contents

1. [Introduction](#introduction)
2. [Key Components](#key-components)
3. [Fault Tolerance Architecture](#fault-tolerance-architecture)
4. [Recovery Strategies](#recovery-strategies)
5. [Performance History and Analysis](#performance-history-and-analysis)
6. [Integration with Resource Pool](#integration-with-resource-pool)
7. [Configuration Options](#configuration-options)
8. [Monitoring and Metrics](#monitoring-and-metrics)
9. [Best Practices](#best-practices)
10. [Example Usage](#example-usage)
11. [Troubleshooting](#troubleshooting)

## Introduction

The WebGPU/WebNN Resource Pool Recovery system provides fault tolerance capabilities for browser-based AI model execution. It enables resilient operation even when browsers crash, disconnect, or experience other failures. The system builds on proven distributed systems fault tolerance patterns, applying them to browser-based execution environments.

Key features include:

- Cross-browser model sharding with fault tolerance
- Transaction-based state management for browser resources
- Performance history tracking and trend analysis
- Multiple recovery strategies for different failure scenarios
- Automatic browser failover for WebGPU/WebNN operations

## Key Components

The fault tolerance system consists of three main components:

1. **ResourcePoolRecoveryManager**: Manages recovery operations and coordinates with the connection pool
2. **BrowserStateManager**: Tracks the state of browser instances, models, and operations
3. **PerformanceHistoryTracker**: Records and analyzes performance metrics for optimization

These components work together to provide comprehensive fault tolerance for browser-based model execution.

## Fault Tolerance Architecture

### Fault Tolerance Levels

The system supports multiple fault tolerance levels to balance reliability with performance overhead:

| Level | Description | Recovery Capabilities | Overhead |
|-------|-------------|----------------------|----------|
| `none` | No fault tolerance | Error reporting only | None |
| `low` | Basic recovery | Simple reconnection attempts | Very Low |
| `medium` | Standard recovery | State persistence and recovery | Low |
| `high` | Enhanced recovery | Full state replication and migration | Moderate |
| `critical` | Maximum reliability | Redundant operations with voting | High |

### State Management

The state management system tracks:

1. **Browser State**: Connection status, browser type, health
2. **Model State**: Model configuration, parameters, browser assignment
3. **Operation State**: Currently running operations and their status
4. **Resource State**: Tensor memory, WebGPU buffers, WebNN graphs
5. **Metrics**: Performance metrics for each operation and browser

### Transaction Log

All state changes are recorded in a transaction log, enabling:

1. **Audit Trail**: Complete history of state changes
2. **Recovery**: Replay of transactions during recovery
3. **Consistency**: Verification of state consistency

## Recovery Strategies

The system implements multiple recovery strategies to handle different failure scenarios:

### Progressive Recovery

Progressive recovery attempts increasingly complex strategies until recovery succeeds:

1. First try **reconnection** (fastest, least invasive)
2. If reconnection fails, try **restart**
3. If restart fails, try **failover**

Example implementation:

```python
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
```

### Restart Recovery

Restart recovery handles browser crash scenarios by restarting the browser:

1. Create checkpoint of browser state
2. Restart the browser instance
3. Restore state from checkpoint if needed

### Reconnect Recovery

Reconnect recovery handles temporary disconnections:

1. Attempt to reconnect to the existing browser
2. Verify connection is restored
3. Resume operations

### Failover Recovery

Failover recovery handles unrecoverable browser failures:

1. Find a suitable replacement browser
2. Migrate state to the new browser
3. Resume operations on the new browser

### Parallel Recovery

Parallel recovery attempts multiple strategies simultaneously for time-critical operations:

1. Launch reconnect, restart, and failover strategies in parallel
2. Use the first successful result
3. Cancel remaining recovery operations

## Performance History and Analysis

The performance history system tracks metrics for all operations and provides analysis to optimize browser selection.

### Key Metrics Tracked

- **Duration**: Operation execution time
- **Success Rate**: Percentage of successful operations
- **Browser-Specific Performance**: Performance by browser type
- **Model-Specific Performance**: Performance by model
- **Operation-Specific Performance**: Performance by operation type

### Performance Analysis

The system analyzes performance trends to identify:

- **Degrading Performance**: Models with degrading performance
- **Browser Compatibility**: Best browser types for each model
- **Failure Patterns**: Common failure scenarios
- **Optimization Opportunities**: Areas for performance improvement

Example performance trend analysis:

```python
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
```

## Integration with Resource Pool

### Automatic Recovery

The system provides a `run_with_recovery` function that integrates with the resource pool bridge for automatic recovery:

```python
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
```

### ResourcePoolBridgeIntegration

The ResourcePoolBridgeIntegration class can be configured with fault tolerance options:

```python
from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
from fixed_web_platform.resource_pool_bridge_recovery import ResourcePoolRecoveryManager

# Create resource pool with fault tolerance
pool = ResourcePoolBridgeIntegration(
    max_connections=4,
    browser_preferences={
        'audio': 'firefox',
        'vision': 'chrome',
        'text_embedding': 'edge'
    },
    adaptive_scaling=True,
    fault_tolerance_options={
        'level': 'high',
        'recovery_strategy': 'progressive',
        'checkpoint_interval': 60,  # seconds
        'max_recovery_attempts': 3
    }
)

# Initialize pool
await pool.initialize()

# Get recovery manager
recovery_manager = pool.recovery_manager

# Run with automatic recovery
result = await run_with_recovery(
    pool=pool,
    model_name="bert-base-uncased",
    operation="inference",
    inputs={"text": "Example input"},
    recovery_manager=recovery_manager
)
```

## Configuration Options

### Fault Tolerance Levels

Configure the fault tolerance level based on your reliability requirements:

```python
# Create recovery manager with high fault tolerance
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level="high",  # none, low, medium, high, critical
    recovery_strategy="progressive"
)
```

### Recovery Strategies

Choose the most appropriate recovery strategy for your use case:

```python
# Create recovery manager with specific recovery strategy
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level="medium",
    recovery_strategy="failover"  # restart, reconnect, failover, progressive, parallel
)
```

### Performance History

Configure performance history tracking:

```python
# Create performance tracker with custom settings
performance_tracker = PerformanceHistoryTracker(
    max_entries=2000,  # Store more performance entries
    logger=custom_logger
)
```

## Monitoring and Metrics

### Recovery Statistics

Monitor recovery statistics to track system health:

```python
# Get recovery statistics
stats = recovery_manager.get_recovery_statistics()

print(f"Recovery attempts: {stats['recovery_attempts']}")
print(f"Recovery successes: {stats['recovery_successes']}")
print(f"Recovery failures: {stats['recovery_failures']}")
print(f"Success rate: {stats['success_rate']:.1%}")
print(f"Active browsers: {stats['active_browsers']} / {stats['total_browsers']}")
```

### Performance Recommendations

Get performance recommendations to optimize system configuration:

```python
# Get performance recommendations
recommendations = recovery_manager.get_performance_recommendations()

for key, rec in recommendations.get("recommendations", {}).items():
    print(f"{key}: {rec['description']} - {rec['recommendation']}")
```

### Browser Performance Analysis

Analyze browser performance to identify optimal configurations:

```python
# Analyze browser performance
for browser_type in ["chrome", "firefox", "edge"]:
    trend = recovery_manager.performance_tracker.analyze_performance_trends(
        browser_type=browser_type
    )
    
    if "error" not in trend:
        print(f"Performance for {browser_type}:")
        print(f"  Avg Duration: {trend['avg_duration_ms']:.1f}ms")
        print(f"  Success Rate: {trend['success_rate']:.1%}")
        print(f"  Trend: {trend['trend_direction']} ({trend['trend_magnitude']:.2f})")
```

## Best Practices

### Fault Tolerance Level Selection

Choose the appropriate fault tolerance level based on your requirements:

- **none**: Use for development or when browser failures are acceptable
- **low**: Use for non-critical applications with minimal overhead
- **medium**: Standard level for most applications (balance of reliability and overhead)
- **high**: Use for critical applications where reliability is important
- **critical**: Use for mission-critical applications where reliability is paramount

### Recovery Strategy Selection

Choose the appropriate recovery strategy based on your requirements:

- **restart**: Use when browsers tend to crash completely
- **reconnect**: Use when network issues are common
- **failover**: Use when you have multiple available browsers
- **progressive**: Use for general-purpose recovery (recommended default)
- **parallel**: Use for time-critical operations where recovery speed is essential

### Performance Optimization

Optimize performance based on performance history:

1. Monitor performance trends for each model and browser combination
2. Identify optimal browser types for each model
3. Configure browser preferences based on performance data
4. Regularly review performance recommendations

### State Management

Best practices for state management:

1. Create regular checkpoints for critical operations
2. Keep checkpoint size small by storing only essential state
3. Use transaction logging for audit and debugging
4. Monitor state synchronization overhead

## Example Usage

### Basic Usage

```python
from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
from fixed_web_platform.resource_pool_bridge_recovery import ResourcePoolRecoveryManager, run_with_recovery

# Create resource pool
pool = ResourcePoolBridgeIntegration(
    max_connections=4,
    browser_preferences={
        'audio': 'firefox',
        'vision': 'chrome',
        'text_embedding': 'edge'
    }
)

# Initialize pool
await pool.initialize()

# Create recovery manager
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level="medium",
    recovery_strategy="progressive"
)

# Initialize recovery manager
await recovery_manager.initialize()

# Run with automatic recovery
result = await run_with_recovery(
    pool=pool,
    model_name="bert-base-uncased",
    operation="inference",
    inputs={"text": "Example input"},
    recovery_manager=recovery_manager
)

if result["success"]:
    output = result["result"]
    print(f"Inference result: {output}")
    
    if result.get("recovered"):
        print(f"Recovery was successful using {result['recovery_browser']['type']}")
else:
    print(f"Operation failed: {result['error']}")
```

### Advanced Usage with Model Sharding

```python
from fixed_web_platform.model_sharding import ModelShardingManager
from fixed_web_platform.resource_pool_bridge_recovery import ResourcePoolRecoveryManager

# Create resource pool (see previous example)

# Create recovery manager
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level="high",
    recovery_strategy="progressive"
)

# Initialize recovery manager
await recovery_manager.initialize()

# Create model sharding manager
sharding_manager = ModelShardingManager(
    model_name="llama-13b",
    sharding_strategy="layer_based",
    num_shards=3,
    fault_tolerance_level="high",
    recovery_strategy="coordinated",
    connection_pool=pool.connection_pool
)

# Initialize shards
await sharding_manager.initialize()

# Run inference with automatic recovery
result = await sharding_manager.run_inference({
    "input_text": "Explain the concept of fault tolerance in distributed systems."
})

print(f"Inference result: {result}")

# Get performance metrics
metrics = sharding_manager.get_performance_metrics()
print(f"Performance: {metrics}")

# Analyze performance
analyzer = ModelShardingAnalyzer(sharding_manager.performance_history)
trends = analyzer.analyze_performance_trends()
print(f"Performance trends: {trends}")

# Get recommendations
shard_recommendation = analyzer.recommend_shard_count()
print(f"Recommended shard count: {shard_recommendation}")

# Shut down
await sharding_manager.shutdown()
```

### Custom Recovery Strategy

```python
from fixed_web_platform.resource_pool_bridge_recovery import ResourcePoolRecoveryManager, BrowserFailureCategory

class CustomRecoveryManager(ResourcePoolRecoveryManager):
    async def handle_browser_failure(self, browser_id: str, error: Exception) -> Dict[str, Any]:
        """Custom browser failure handling."""
        # Classify error
        failure_category = self._classify_browser_failure(error)
        
        # Log failure
        self.logger.info(f"Custom recovery for browser {browser_id}: {failure_category.value}")
        
        # Choose strategy based on error category
        if failure_category == BrowserFailureCategory.CONNECTION:
            return await self._reconnect_recovery(browser_id, failure_category)
        elif failure_category == BrowserFailureCategory.CRASH:
            return await self._restart_recovery(browser_id, failure_category)
        elif failure_category == BrowserFailureCategory.MEMORY:
            return await self._failover_recovery(browser_id, failure_category)
        else:
            return await self._progressive_recovery(browser_id, failure_category)
```

## Troubleshooting

### Common Issues and Solutions

#### Browser Fails to Reconnect

**Problem**: Browser fails to reconnect after disconnection.

**Solution**:
1. Check network connectivity
2. Increase reconnection timeout
3. Try restarting the browser instead
4. Use the failover strategy to switch to another browser

#### Performance Degradation with Fault Tolerance

**Problem**: Performance degrades significantly with fault tolerance enabled.

**Solution**:
1. Reduce fault tolerance level (e.g., "high" → "medium")
2. Reduce checkpoint frequency
3. Use selective checkpointing for critical components only
4. Optimize state representation for smaller checkpoints

#### Recovery Always Fails

**Problem**: Recovery attempts consistently fail.

**Solution**:
1. Check browser availability and health
2. Increase recovery attempt limit
3. Add more browsers to the pool for better failover options
4. Check if the error is actually recoverable

#### State Inconsistency After Recovery

**Problem**: State is inconsistent after recovery.

**Solution**:
1. Enable transaction logging for all state changes
2. Use checkpoints instead of incremental state updates
3. Verify state consistency after recovery
4. Implement state reconciliation for conflicting updates

#### High Memory Usage

**Problem**: Memory usage grows over time with fault tolerance enabled.

**Solution**:
1. Limit the number of checkpoints stored
2. Implement checkpoint compression
3. Use delta checkpoints instead of full state checkpoints
4. Implement checkpoint garbage collection

### Debugging

#### Enable Verbose Logging

Enable verbose logging for detailed information:

```python
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("resource_pool_recovery")
logger.setLevel(logging.DEBUG)

# Create recovery manager with logger
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level="medium",
    recovery_strategy="progressive",
    logger=logger
)
```

#### Inspect Recovery Statistics

Inspect recovery statistics to identify issues:

```python
# Get recovery statistics
stats = recovery_manager.get_recovery_statistics()
print(f"Recovery statistics: {stats}")
```

#### Trace Transaction Log

Inspect the transaction log for debugging:

```python
# Get transaction log
transactions = recovery_manager.state_manager.transaction_log
print(f"Transaction log entries: {len(transactions)}")

# Print recent transactions
for transaction in transactions[-10:]:
    print(f"{transaction['timestamp']}: {transaction['action']} - {transaction['data']}")
```

#### Performance Analysis

Analyze performance for specific models or browsers:

```python
# Analyze specific model
model_trend = recovery_manager.performance_tracker.analyze_performance_trends(
    model_name="bert-base-uncased",
    time_window_seconds=3600
)
print(f"Model trend: {model_trend}")

# Analyze specific browser type
browser_trend = recovery_manager.performance_tracker.analyze_performance_trends(
    browser_type="chrome",
    time_window_seconds=3600
)
print(f"Browser trend: {browser_trend}")

# Analyze specific operation
operation_trend = recovery_manager.performance_tracker.analyze_performance_trends(
    operation_type="inference",
    time_window_seconds=3600
)
print(f"Operation trend: {operation_trend}")
```