# WebNN/WebGPU Resource Pool Error Recovery

This document describes the enhanced error recovery mechanisms implemented for the WebNN/WebGPU Resource Pool Bridge.

## Overview

The Resource Pool Error Recovery module provides advanced error handling and recovery capabilities for the WebNN/WebGPU resource pool, improving reliability, stability, and observability of browser-based connections.

Key features:
- **Circuit Breaker Pattern**: Prevent repeated calls to failing services
- **Progressive Recovery Strategies**: Multiple recovery approaches with increasing aggressiveness
- **Model-Specific Error Tracking**: Track errors at both connection and model level
- **Comprehensive Telemetry**: Detailed metrics for monitoring and diagnostics
- **Memory Pressure Management**: Handle high memory situations gracefully

## Why Enhanced Error Recovery is Needed

Browser-based AI acceleration with WebNN and WebGPU introduces unique challenges that make robust error recovery essential:

1. **Browser State Unpredictability**: Browsers can enter inconsistent states due to memory pressure, GPU resets, or background processes.

2. **WebSocket Connection Instability**: The WebSocket bridge between Python and browser can fail due to various factors:
   - Network timeout or congestion
   - Browser process suspension by OS
   - Connection pool exhaustion
   - Message size limits

3. **WebGPU/WebNN Implementation Variance**: Different browsers have varying implementations:
   - Chrome may have different error behavior than Firefox
   - Edge has superior WebNN support but different error patterns
   - Safari has unique WebGPU limitations

4. **Resource Contention**: Multiple models competing for GPU resources can lead to timeout failures or memory allocation errors.

5. **Browser Lifecycle Complexity**: Browsers have complex lifecycles that can cause intermittent failures during:
   - Page refresh
   - Tab switching
   - Device sleep/wake cycles

## Implementation

The `resource_pool_error_recovery.py` module provides a standalone class with static methods that can be integrated into the existing `ResourcePoolBridge` class. The implementation is non-invasive and can be gradually adopted.

### Integration Steps

1. **Import the Module**: Add the error recovery module to your resource pool bridge implementation:

```python
from fixed_web_platform.resource_pool_error_recovery import ResourcePoolErrorRecovery
```

2. **Add Circuit Breaker to BrowserConnection**: Before performing operations like inference, check if the circuit breaker allows it:

```python
# Inside run_inference method
circuit_allowed, circuit_reason = ResourcePoolErrorRecovery.check_circuit_breaker(self, model_id)
if not circuit_allowed:
    logger.warning(f"Circuit breaker prevented inference: {circuit_reason}")
    # Return simulated result with error info
    return {
        'success': True,  # Still return success for compatibility
        'status': 'simulated',
        'model_id': model_id,
        'is_simulation': True,
        'circuit_breaker_active': True,
        'circuit_breaker_reason': circuit_reason,
    }
```

3. **Use Recovery Mechanism**: When a connection is detected as unhealthy, attempt recovery:

```python
# When a connection is detected as unhealthy
if not connection.is_healthy():
    success, method = await ResourcePoolErrorRecovery.recover_connection(connection)
    if success:
        logger.info(f"Successfully recovered connection using {method}")
    else:
        logger.warning(f"Failed to recover connection, will create a new one")
```

4. **Update Circuit Breaker State**: After operations, update the circuit breaker state:

```python
# After inference succeeds or fails
ResourcePoolErrorRecovery.update_circuit_breaker(
    connection, 
    success=operation_succeeded, 
    model_id=model_id, 
    error=error_message if not operation_succeeded else None
)
```

5. **Export Telemetry**: Periodically export telemetry data for monitoring:

```python
# Periodically or on-demand
telemetry = ResourcePoolErrorRecovery.export_telemetry(
    resource_pool=self,
    include_connections=True,  # Include detailed connection data
    include_models=True        # Include detailed model data
)

# Log or save telemetry data
with open('telemetry.json', 'w') as f:
    json.dump(telemetry, f, indent=2)
```

## Architecture

### Circuit Breaker Pattern

The circuit breaker pattern prevents repeated calls to failing services by monitoring for failures and transitioning between states:

```
  [Success]     +------------+     [Failures exceed threshold]
 +----------->  |   CLOSED   |  -------------------------------+
 |              +------------+                                 |
 |                                                             v
 |              +------------+     [Timeout period expires]   +------------+
 +------------  | HALF-OPEN  |  <----------------------------- |    OPEN    |
  [Success]     +------------+                                 +------------+
                      |                                              ^
                      +----------------------------------------------+
                             [Failure on trial request]
```

- **Closed State**: Normal operation mode where requests are allowed to pass through.
  - Each failure increments a counter
  - When the failure counter exceeds threshold, circuit trips to OPEN

- **Open State**: Failure mode where requests are rejected immediately.
  - All requests fail fast without attempting the operation
  - After a timeout period, circuit transitions to HALF-OPEN
  - Prevents resource waste on likely-to-fail operations

- **Half-Open State**: Recovery testing mode.
  - Allows a limited number of test requests through
  - Success transitions circuit back to CLOSED
  - Failure immediately transitions back to OPEN

The implementation includes both connection-level circuit breakers (for general connection health) and model-specific circuit breakers (for tracking model-specific failures).

### Recovery Strategies

The recovery mechanism implements multiple strategies with increasing aggressiveness, applying each only when less invasive approaches fail:

1. **Ping Test**: Verify basic connectivity with WebSocket ping
   - Lightest weight approach
   - Tests if WebSocket connection is still functional
   - Includes capability check to verify full functionality
   - Minimal resource impact

2. **WebSocket Reconnection**: Create a new WebSocket connection
   - Moderate intervention
   - Closes existing WebSocket connection
   - Creates a new WebSocket bridge on a different port
   - Refreshes the browser page to reinitialize connection
   - Preserves browser state but resets WebSocket

3. **Browser Restart**: Completely restart the browser instance
   - Most aggressive approach
   - Fully closes and restarts the browser
   - Creates a fresh WebSocket connection
   - Resets all browser state
   - Used only when other methods fail

Each strategy is attempted with configurable retry attempts, timeouts, and exponential backoff to maximize chances of successful recovery.

### Advanced Telemetry System

The telemetry export provides comprehensive data across four key dimensions:

1. **System-level Metrics**
   - CPU utilization (overall and per-core)
   - Memory usage (total, available, pressure)
   - Platform information (OS, architecture)
   - Timestamp and duration information

2. **Connection Health Metrics**
   - Connection status distribution (healthy, degraded, unhealthy)
   - Circuit breaker states (open, closed, half-open)
   - Browser and platform distribution
   - Memory usage per connection
   - Error counts and history

3. **Model Performance Metrics**
   - Execution counts and success rates
   - Average latency and memory footprint
   - Platform and browser distribution
   - Error counts by model type
   - Recovery attempt history

4. **Resource Utilization**
   - Connection pool utilization
   - Browser usage distribution
   - Busy vs. idle connections
   - Resource pressure indicators
   - Queue size and wait times

This comprehensive telemetry can be exported on-demand or periodically for monitoring and debugging purposes, and supports both summary and detailed views.

## Usage

### Direct Testing

You can test the error recovery tools directly:

```bash
# Test connection recovery
python resource_pool_error_recovery.py --test-recovery --connection-id <connection_id>

# Export telemetry data
python resource_pool_error_recovery.py --export-telemetry --detailed --output telemetry.json
```

### Integration Example

Below is a simple example of integrating these tools into your resource pool bridge:

```python
from fixed_web_platform.resource_pool_error_recovery import ResourcePoolErrorRecovery

class EnhancedResourcePoolBridge(ResourcePoolBridge):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.enable_enhanced_error_recovery = True
    
    async def run_inference(self, model_id, inputs, retry_attempts=1):
        # Check circuit breaker first
        if self.enable_enhanced_error_recovery and model_id in self.model_connections:
            connection = self.model_connections[model_id]
            circuit_allowed, circuit_reason = ResourcePoolErrorRecovery.check_circuit_breaker(connection, model_id)
            
            if not circuit_allowed:
                logger.warning(f"Circuit breaker prevented inference: {circuit_reason}")
                # Return simulated result
                return {'success': True, 'status': 'simulated', 'circuit_breaker_active': True}
        
        # Normal inference logic
        result = await super().run_inference(model_id, inputs, retry_attempts)
        
        # Update circuit breaker after operation
        if self.enable_enhanced_error_recovery and model_id in self.model_connections:
            connection = self.model_connections[model_id]
            ResourcePoolErrorRecovery.update_circuit_breaker(
                connection,
                success=result.get('success', False),
                model_id=model_id,
                error=result.get('error', None) if not result.get('success', False) else None
            )
        
        return result
```

## Error Patterns and Recovery Strategies

The enhanced error recovery system addresses specific error patterns observed in WebNN/WebGPU implementations with tailored recovery strategies:

| Error Pattern | Symptoms | Root Cause | Recovery Strategy | Prevention |
|---------------|----------|------------|-------------------|------------|
| **WebSocket Timeout** | Operations hang indefinitely | Network congestion or browser suspension | Progressive timeouts with exponential backoff | Adaptive timeout calculation based on input size |
| **Connection Reset** | Abrupt connection closure | Browser process restart or network failure | WebSocket reconnection on new port | Health checks to detect degradation early |
| **Browser Memory Pressure** | Increasing latency followed by failures | Memory leaks or large model loading | Browser restart with clean state | Memory monitoring and auto-scaling |
| **GPU Context Loss** | WebGPU operations fail with context lost | Driver recovery or resource contention | Full browser restart | Circuit breaker to prevent repeated failures |
| **Browser Tab Suspension** | Long periods of inactivity followed by timeout | OS memory management or power saving | Ping-based health checks with auto-recovery | Keep-alive messages during idle periods |
| **Model Compilation Failure** | Initial model load fails but retries succeed | Race conditions or resource initialization | Retry with exponential backoff | Model-specific circuit breakers |
| **Audio Model Failures** | Failures specific to audio models in some browsers | Compute shader compatibility issues | Browser-specific model allocation (Firefox for audio) | Automatic browser selection by model type |

## Browser-Specific Optimizations

The recovery system includes browser-specific optimizations based on their known characteristics:

### Firefox
- **Strengths**: Superior compute shader performance for audio models
- **Weaknesses**: Limited WebNN support
- **Recovery Notes**: Faster recovery through page refresh, less likely to need full restart
- **Special Handling**: Preferred for audio models (Whisper, Wav2Vec2, CLAP)

### Chrome
- **Strengths**: Balanced WebGPU support for most model types
- **Weaknesses**: Memory pressure with large models
- **Recovery Notes**: May require full browser restart for memory pressure issues
- **Special Handling**: Preferred for vision models and parallel loading

### Edge
- **Strengths**: Superior WebNN implementation
- **Weaknesses**: WebGPU implementation can be less stable
- **Recovery Notes**: Responds well to WebSocket reconnection strategy
- **Special Handling**: Preferred for text embedding models

### Safari
- **Strengths**: Metal integration for WebGPU
- **Weaknesses**: Most restricted WebGPU implementation
- **Recovery Notes**: Most likely to need full browser restart
- **Special Handling**: Special fallback mechanisms for Safari-specific limitations

## Benefits

- **Increased Stability**: Prevent cascading failures with circuit breaker pattern
- **Improved Reliability**: Automatically recover from transient failures
- **Better Observability**: Comprehensive telemetry for debugging
- **Graceful Degradation**: Controlled fallback to simulation
- **Memory Management**: Prevent browser crashes due to memory pressure
- **Browser-Aware Recovery**: Tailored strategies for each browser's characteristics
- **Model-Specific Handling**: Different recovery approaches based on model type
- **Resource Efficiency**: Avoid wasting resources on known-bad configurations

## Monitoring and Troubleshooting

The telemetry system provides multiple ways to monitor and troubleshoot connection issues:

### Real-time Monitoring

```python
# Get current telemetry snapshot
telemetry = ResourcePoolErrorRecovery.export_telemetry(bridge)

# Monitor connection health distribution
health_distribution = telemetry['connections']
print(f"Connection Health: {health_distribution['healthy']} healthy, " +
      f"{health_distribution['degraded']} degraded, " +
      f"{health_distribution['unhealthy']} unhealthy")

# Check circuit breaker status
circuit_breakers = telemetry['circuit_breaker']
print(f"Circuit Breakers: {circuit_breakers['open']} open, " +
      f"{circuit_breakers['half_open']} half-open, " +
      f"{circuit_breakers['closed']} closed")
```

### Historical Analysis

The `error_history` field in connection details captures the last 10 errors with timestamps, enabling troubleshooting patterns:

```python
# Get detailed connection telemetry
telemetry = ResourcePoolErrorRecovery.export_telemetry(bridge, include_connections=True)

# Analyze error history for specific connection
for conn in telemetry['connection_details']:
    if conn['connection_id'] == target_conn_id and 'latest_errors' in conn:
        for error in conn['latest_errors']:
            print(f"[{datetime.fromtimestamp(error['time'])}] {error['error']}")
```

### Recovery Performance

Track recovery effectiveness with metrics on which strategies work best:

```python
# Track recovery statistics
recovery_stats = {
    'attempts': 0,
    'success': 0,
    'by_method': {
        'ping_test': 0,
        'websocket_reconnection': 0,
        'browser_restart': 0
    }
}

# After recovery attempt
success, method = await ResourcePoolErrorRecovery.recover_connection(connection)
recovery_stats['attempts'] += 1
if success:
    recovery_stats['success'] += 1
    recovery_stats['by_method'][method] += 1
```

## Future Enhancements

Planned future enhancements include:

1. **Predictive Recovery**: Use machine learning to predict failures before they occur
   - Train models on telemetry data to identify failure precursors
   - Proactively recover connections showing warning signs
   - Implement adaptive thresholds based on historical performance

2. **Browser-Specific Strategies**: Further optimize recovery strategies by browser type
   - Develop specialized recovery paths for each browser
   - Incorporate browser version-specific handling
   - Create detailed browser capability fingerprinting

3. **Distributed Telemetry**: Send telemetry to centralized monitoring system
   - Implement OpenTelemetry integration for standardized metrics
   - Create dashboards for cross-instance monitoring
   - Enable alerting based on circuit breaker activations

4. **Automated Testing**: Tools to stress-test and validate recovery mechanisms
   - Create chaos testing framework for browser connections
   - Simulate various failure scenarios (memory pressure, GPU resets)
   - Measure recovery success rates across browsers

5. **Resource Throttling**: Automatically adjust resource usage based on system load
   - Implement adaptive connection pool sizing
   - Add dynamic timeout adjustment based on system pressure
   - Create resource reservation system for critical models