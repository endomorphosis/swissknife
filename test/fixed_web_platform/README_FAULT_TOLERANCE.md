# WebGPU/WebNN Resource Pool Fault Tolerance

This document details the fault tolerance features implemented for the WebGPU/WebNN Resource Pool to enable reliable browser-based model execution even in the presence of browser crashes, disconnections, or failures.

## Overview

The fault tolerance system for the WebGPU/WebNN Resource Pool consists of three main components:

1. **Cross-Browser Model Sharding**: Distributes model execution across multiple browser instances with automatic recovery
2. **Transaction-Based State Management**: Ensures consistent state tracking for browser resources
3. **Performance History and Recovery**: Tracks performance metrics and implements recovery strategies

This implementation builds on the distributed testing framework's fault tolerance architecture, applying similar patterns to browser-based model execution.

## Cross-Browser Model Sharding

The cross-browser model sharding system allows distributing large models across multiple browser instances, with built-in fault tolerance to handle browser failures.

### Key Features

- **Layer-Based Sharding**: Distributes model layers across browser instances
- **Component-Based Sharding**: Distributes model components (encoder, decoder, attention, etc.)
- **Browser-Optimized Sharding**: Assigns components based on browser strengths
- **Fault-Tolerant Execution**: Handles browser failures during execution
- **Automatic Recovery**: Recovers from failures using checkpoints or reassignment

### Sharding Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| `layer_based` | Shards by model layers | LLMs and decoder-only models |
| `component_based` | Shards by model components | Encoder-decoder models |
| `balanced` | Balances workload evenly | General-purpose sharding |
| `hardware_aware` | Distributes based on hardware capabilities | Heterogeneous browsers |
| `browser_optimized` | Distributes based on browser strengths | Optimal performance |

### Browser Strengths

Different browsers excel at different tasks:

| Browser | Strengths | Example Models |
|---------|-----------|----------------|
| Chrome | Vision models, parallel processing | ViT, CLIP |
| Firefox | Audio models, compute shader efficiency | Whisper, CLAP |
| Edge | Text models, WebNN acceleration | BERT, T5 |

### Example Usage

```python
from fixed_web_platform.model_sharding import ModelShardingManager

# Create sharded execution manager
manager = ModelShardingManager(
    model_name="llama-13b",
    sharding_strategy="layer_based",
    num_shards=3,
    fault_tolerance_level="medium",
    recovery_strategy="coordinated",
    connection_pool=pool.connection_pool
)

# Initialize shards
await manager.initialize()

# Run inference with automatic recovery
result = await manager.run_inference({"input_text": "Hello, world!"})

# Get performance metrics
metrics = manager.get_performance_metrics()

# Analyze performance trends
analyzer = ModelShardingAnalyzer(manager.performance_history)
trends = analyzer.analyze_performance_trends()
```

## Transaction-Based State Management

The state management system tracks the state of browser instances, models, and operations with transaction-based updates for consistency and recoverability.

### Key Components

- **BrowserStateManager**: Manages browser state with transaction logging
- **BrowserState**: Tracks state of a browser instance including models and operations
- **Transaction Log**: Records all state changes for recovery

### State Tracking

The system tracks various state elements:

- **Browser Instances**: Connection status, browser type, health
- **Models**: Model state, configuration, and browser assignment
- **Operations**: Currently running operations
- **Resources**: Tensor memory and other browser resources
- **Metrics**: Performance metrics for optimization

### Example Usage

```python
from fixed_web_platform.resource_pool_bridge_recovery import BrowserStateManager

# Create state manager
state_manager = BrowserStateManager()

# Add browser
browser = state_manager.add_browser("browser-1", "chrome")

# Update browser status
state_manager.update_browser_status("browser-1", "running")

# Add model to browser
state_manager.add_model_to_browser(
    "browser-1", 
    "model-1", 
    {"model_type": "bert", "config": {...}}
)

# Create checkpoint
checkpoint = state_manager.create_browser_checkpoint("browser-1")

# Get status summary
summary = state_manager.get_status_summary()
```

## Performance History and Recovery

The performance history and recovery system tracks operation metrics and implements recovery strategies for browser failures.

### Fault Tolerance Levels

| Level | Description | Features |
|-------|-------------|----------|
| `none` | No fault tolerance | Basic error reporting |
| `low` | Basic reconnection attempts | Simple browser reconnection |
| `medium` | State persistence and recovery | Checkpoints, state restoration |
| `high` | Full recovery with state replication | Comprehensive recovery, state migration |
| `critical` | Redundant operations with voting | Highest reliability, parallel execution |

### Recovery Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| `restart` | Restart the failed browser | Complete browser crashes |
| `reconnect` | Attempt to reconnect | Network interruptions |
| `failover` | Switch to another browser | Unrecoverable failures |
| `progressive` | Try simple strategies first, then escalate | General purpose |
| `parallel` | Try multiple strategies simultaneously | Time-critical operations |

### Error Categories

The system categorizes errors to select the most appropriate recovery strategy:

- **CONNECTION**: Network disconnects, timeouts
- **CRASH**: Browser crashes
- **MEMORY**: Out of memory errors
- **TIMEOUT**: Operation timeouts
- **WEBGPU**: WebGPU-specific failures
- **WEBNN**: WebNN-specific failures
- **UNKNOWN**: Uncategorized errors

### Example Usage

```python
from fixed_web_platform.resource_pool_bridge_recovery import ResourcePoolRecoveryManager

# Create recovery manager
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level="high",
    recovery_strategy="progressive"
)

# Initialize
await recovery_manager.initialize()

# Track operation
entry_id = await recovery_manager.track_operation(
    "inference", 
    "bert-base-uncased", 
    "browser-1", 
    "chrome"
)

# Complete operation
await recovery_manager.complete_operation(
    entry_id, 
    {"duration_ms": 120, "throughput": 10}, 
    "completed"
)

# Handle browser failure
recovery_result = await recovery_manager.handle_browser_failure(
    "browser-1", 
    Exception("Browser crashed")
)

# Get performance recommendations
recommendations = recovery_manager.get_performance_recommendations()

# Get recovery statistics
stats = recovery_manager.get_recovery_statistics()
```

## Integration with Resource Pool

The fault tolerance system integrates with the resource pool bridge to provide transparent recovery for model operations.

### Automated Recovery

```python
from fixed_web_platform.resource_pool_bridge_recovery import run_with_recovery

# Run with automatic recovery
result = await run_with_recovery(
    pool=resource_pool,
    model_name="bert-base-uncased",
    operation="inference",
    inputs={"text": "Example input"},
    recovery_manager=recovery_manager
)
```

### Configuration Options

Key configuration options for the resource pool with fault tolerance:

```python
# Create resource pool with fault tolerance
from fixed_web_platform.resource_pool_bridge import ResourcePoolBridgeIntegration
from fixed_web_platform.resource_pool_bridge_recovery import ResourcePoolRecoveryManager

# Create pool with fault tolerance
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
        'max_recovery_attempts': 3,
        'browser_health_check_interval': 30  # seconds
    }
)

# Initialize pool
await pool.initialize()

# Create recovery manager
recovery_manager = ResourcePoolRecoveryManager(
    connection_pool=pool.connection_pool,
    fault_tolerance_level='high',
    recovery_strategy='progressive'
)

# Initialize recovery manager
await recovery_manager.initialize()
```

## Performance Analysis

The fault tolerance system includes comprehensive performance tracking and analysis:

### Tracking Metrics

- **Latency**: Operation execution time
- **Throughput**: Operations per second
- **Success Rate**: Percentage of successful operations
- **Recovery Rate**: Percentage of successful recoveries
- **Browser-Specific Performance**: Performance metrics by browser type
- **Model-Specific Performance**: Performance metrics by model

### Performance Analysis

```python
# Analyze performance trends
trends = recovery_manager.performance_tracker.analyze_performance_trends(
    model_name="bert-base-uncased",
    operation_type="inference",
    time_window_seconds=3600
)

# Get browser recommendations
recommendation = recovery_manager.performance_tracker.recommend_browser_type(
    model_name="bert-base-uncased",
    operation_type="inference",
    available_types=["chrome", "firefox", "edge"]
)

# Get performance statistics
stats = recovery_manager.performance_tracker.get_statistics()
```

## Browser Failure Handling

The system handles browser failures through a multi-step process:

1. **Detection**: Monitor browser health and detect failures
2. **Classification**: Categorize the failure type
3. **Recovery Strategy Selection**: Choose appropriate recovery strategy
4. **Recovery Execution**: Execute recovery strategy
5. **Verification**: Verify recovery success
6. **Fallback**: Try alternative strategies if needed

### Example Error Handling

```python
try:
    # Run inference
    result = await browser.call("inference", {"model_name": "bert", "inputs": {...}})
except Exception as e:
    # Handle browser failure
    recovery_result = await recovery_manager.handle_browser_failure(browser_id, e)
    
    if recovery_result["success"]:
        # Recovery succeeded, retry operation
        browser = await pool.connection_pool.get_browser(recovery_result["browser_id"])
        result = await browser.call("inference", {"model_name": "bert", "inputs": {...}})
    else:
        # Recovery failed
        raise Exception(f"Could not recover from browser failure: {recovery_result['error']}")
```

## Transaction Log and Recovery

The transaction log records all state changes for recovery purposes:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1620000000.123,
  "action": "add_model_to_browser",
  "data": {
    "browser_id": "browser-1",
    "model_id": "model-1",
    "model_state": {
      "model_type": "bert",
      "config": {...}
    }
  }
}
```

During recovery, the system can replay transactions or restore from checkpoints.

## Fault Tolerance and State Synchronization

For `high` and `critical` fault tolerance levels, state is synchronized across browsers:

1. **Checkpoint Creation**: Regular checkpoints of browser state
2. **State Migration**: Migration of state to backup browsers during failover
3. **State Verification**: Consistency checks for state integrity
4. **Delta Synchronization**: Efficient state updates with delta changes

## Performance Recommendations

The system provides recommendations based on performance history:

```json
{
  "recommendations": {
    "model_bert-base-uncased": {
      "issue": "degrading_performance",
      "description": "Performance for model bert-base-uncased is degrading significantly",
      "trend_magnitude": 1.2,
      "recommendation": "Consider browser type change or hardware upgrade"
    },
    "browser_firefox": {
      "issue": "high_failure_rate",
      "description": "Browser type firefox has a high failure rate (15.0%)",
      "failure_rate": 0.15,
      "recommendation": "Consider using a different browser type"
    }
  },
  "recommendation_count": 2,
  "based_on_entries": 150,
  "generation_time": 1620000000.123
}
```

## Implementation Details

### BrowserState

```python
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
```

### ResourcePoolRecoveryManager

```python
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
```

### PerformanceHistoryTracker

```python
class PerformanceHistoryTracker:
    """Tracker for browser performance history."""
    
    def __init__(self, max_entries: int = 1000, logger: Optional[logging.Logger] = None):
        self.entries: List[PerformanceEntry] = []
        self.max_entries = max_entries
        self.logger = logger or logging.getLogger(__name__)
```

## Conclusion

The WebGPU/WebNN Resource Pool fault tolerance implementation provides comprehensive protection against browser failures, ensuring reliable model execution even in challenging environments. By integrating proven fault tolerance patterns from distributed systems, it delivers robust recovery capabilities with minimal performance overhead.

Key benefits include:

- **Increased Reliability**: Automatic recovery from browser failures
- **Optimized Performance**: Browser selection based on performance history
- **Transparent Recovery**: Application code doesn't need to handle recovery
- **Detailed Metrics**: Comprehensive performance tracking for optimization
- **Flexible Configuration**: Adjustable fault tolerance levels for different needs

This system enables deployment of browser-based AI models in production environments that require high reliability and fault tolerance.