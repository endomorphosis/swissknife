"""
Telemetry Data Collection for Web Platform (August 2025)

This module provides comprehensive telemetry data collection for WebGPU and WebNN platforms,
capturing detailed information about:
- Performance metrics across components
- Error occurrences and patterns
- Resource utilization
- Browser-specific behaviors
- Recovery success rates

Usage:
    from fixed_web_platform.unified_framework.telemetry import (
        TelemetryCollector, register_collector, TelemetryReporter
    )
    
    # Create telemetry collector
    collector = TelemetryCollector()
    
    # Register component collectors
    register_collector(collector, "streaming", streaming_component.get_metrics)
    
    # Record error events
    collector.record_error_event({
        "component": "webgpu",
        "error_type": "memory_pressure",
        "severity": "warning",
        "handled": True
    })
    
    # Generate report
    report = TelemetryReporter(collector).generate_report()
"""

import os
import time
import logging
import json
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("web_platform.telemetry")

class TelemetryCategory:
    """Telemetry data categories."""
    PERFORMANCE = "performance"
    ERRORS = "errors"
    RESOURCES = "resources"
    COMPONENT_USAGE = "component_usage"
    BROWSER_SPECIFIC = "browser_specific"
    RECOVERY = "recovery"
    SYSTEM = "system"

class TelemetryCollector:
    """
    Collects and aggregates telemetry data across all web platform components.
    
    Features:
    - Performance metrics collection
    - Error event tracking
    - Resource utilization monitoring
    - Component usage statistics
    - Browser-specific behavior tracking
    - Recovery success metrics
    """
    
    def __init__(self, max_event_history: int = 500):
        """
        Initialize telemetry collector.
        
        Args:
            max_event_history: Maximum number of error events to retain
        """
        self.max_event_history = max_event_history
        
        # Initialize telemetry data stores
        self.performance_metrics = {
            "initialization_times": {},
            "inference_times": {},
            "throughput": {},
            "latency": {},
            "memory_usage": {}
        }
        
        self.error_events = []
        self.error_categories = {}
        self.error_components = {}
        
        self.resource_metrics = {
            "memory_usage": [],
            "gpu_utilization": [],
            "cpu_utilization": []
        }
        
        self.component_usage = {}
        self.recovery_metrics = {
            "attempts": 0,
            "successes": 0,
            "failures": 0,
            "by_category": {},
            "by_component": {}
        }
        
        self.browser_metrics = {}
        self.system_info = {}
        
        # Track collector functions
        self.collectors = {}
    
    def register_collector(self, component: str, collector_func: Callable) -> None:
        """
        Register a component-specific metric collector function.
        
        Args:
            component: Component name
            collector_func: Function that returns component metrics
        """
        self.collectors[component] = collector_func
        
        # Initialize component usage tracking
        if component not in self.component_usage:
            self.component_usage[component] = {
                "invocations": 0,
                "errors": 0,
                "last_used": None
            }
            
        logger.debug(f"Registered collector for {component}")
    
    def collect_component_metrics(self) -> Dict[str, Any]:
        """
        Collect metrics from all registered component collectors.
        
        Returns:
            Dictionary with component metrics
        """
        metrics = {}
        
        for component, collector in self.collectors.items():
            try:
                # Update component usage
                self.component_usage[component]["invocations"] += 1
                self.component_usage[component]["last_used"] = time.time()
                
                # Collect metrics
                component_metrics = collector()
                if component_metrics:
                    metrics[component] = component_metrics
                    
            except Exception as e:
                logger.error(f"Error collecting metrics from {component}: {e}")
                # Update error count
                self.component_usage[component]["errors"] += 1
        
        return metrics
    
    def record_error_event(self, error_event: Dict[str, Any]) -> None:
        """
        Record an error event in telemetry.
        
        Args:
            error_event: Error event dictionary
        """
        # Add timestamp if not present
        if "timestamp" not in error_event:
            error_event["timestamp"] = time.time()
            
        # Add to history, maintaining max size
        self.error_events.append(error_event)
        if len(self.error_events) > self.max_event_history:
            self.error_events = self.error_events[-self.max_event_history:]
            
        # Track by category
        category = error_event.get("error_type", "unknown")
        self.error_categories[category] = self.error_categories.get(category, 0) + 1
        
        # Track by component
        component = error_event.get("component", "unknown")
        if component not in self.error_components:
            self.error_components[component] = {}
            
        self.error_components[component][category] = self.error_components[component].get(category, 0) + 1
        
        # Track recovery attempts if applicable
        if "handled" in error_event:
            self.recovery_metrics["attempts"] += 1
            
            if error_event["handled"]:
                self.recovery_metrics["successes"] += 1
                
                # Track by category
                cat_key = f"{category}.success"
                self.recovery_metrics["by_category"][cat_key] = self.recovery_metrics["by_category"].get(cat_key, 0) + 1
                
                # Track by component
                comp_key = f"{component}.success"
                self.recovery_metrics["by_component"][comp_key] = self.recovery_metrics["by_component"].get(comp_key, 0) + 1
            else:
                self.recovery_metrics["failures"] += 1
                
                # Track by category
                cat_key = f"{category}.failure"
                self.recovery_metrics["by_category"][cat_key] = self.recovery_metrics["by_category"].get(cat_key, 0) + 1
                
                # Track by component
                comp_key = f"{component}.failure"
                self.recovery_metrics["by_component"][comp_key] = self.recovery_metrics["by_component"].get(comp_key, 0) + 1
    
    def record_performance_metric(self, 
                                 category: str,
                                 metric_name: str,
                                 value: Union[float, int],
                                 component: Optional[str] = None) -> None:
        """
        Record a performance metric.
        
        Args:
            category: Metric category
            metric_name: Metric name
            value: Metric value
            component: Optional component name
        """
        if category not in self.performance_metrics:
            self.performance_metrics[category] = {}
            
        if metric_name not in self.performance_metrics[category]:
            self.performance_metrics[category][metric_name] = []
            
        if component:
            # Record with component information
            self.performance_metrics[category][metric_name].append({
                "value": value,
                "timestamp": time.time(),
                "component": component
            })
        else:
            # Simple value recording
            self.performance_metrics[category][metric_name].append(value)
    
    def record_resource_metric(self, 
                             metric_name: str, 
                             value: float,
                             component: Optional[str] = None) -> None:
        """
        Record a resource utilization metric.
        
        Args:
            metric_name: Resource metric name
            value: Metric value
            component: Optional component name
        """
        if metric_name not in self.resource_metrics:
            self.resource_metrics[metric_name] = []
            
        if component:
            # Record with component information
            self.resource_metrics[metric_name].append({
                "value": value,
                "timestamp": time.time(),
                "component": component
            })
        else:
            # Simple resource recording
            self.resource_metrics[metric_name].append({
                "value": value,
                "timestamp": time.time()
            })
    
    def record_browser_metric(self, 
                            browser: str,
                            metric_name: str,
                            value: Any) -> None:
        """
        Record a browser-specific metric.
        
        Args:
            browser: Browser name
            metric_name: Metric name
            value: Metric value
        """
        if browser not in self.browser_metrics:
            self.browser_metrics[browser] = {}
            
        if metric_name not in self.browser_metrics[browser]:
            self.browser_metrics[browser][metric_name] = []
            
        # Record with timestamp
        self.browser_metrics[browser][metric_name].append({
            "value": value,
            "timestamp": time.time()
        })
    
    def capture_system_info(self, system_info: Dict[str, Any]) -> None:
        """
        Capture system information.
        
        Args:
            system_info: System information dictionary
        """
        self.system_info = system_info
    
    def get_error_summary(self) -> Dict[str, Any]:
        """
        Get a summary of error telemetry.
        
        Returns:
            Dictionary with error summary
        """
        # Calculate recovery success rate
        recovery_attempts = self.recovery_metrics["attempts"]
        recovery_success_rate = (
            self.recovery_metrics["successes"] / recovery_attempts 
            if recovery_attempts > 0 else 0
        )
        
        # Find most common error category and component
        most_common_category = max(
            self.error_categories.items(), 
            key=lambda x: x[1]
        )[0] if self.error_categories else None
        
        most_affected_component = max(
            [(comp, sum(cats.values())) for comp, cats in self.error_components.items()],
            key=lambda x: x[1]
        )[0] if self.error_components else None
        
        return {
            "total_errors": len(self.error_events),
            "error_categories": self.error_categories,
            "error_components": self.error_components,
            "recovery_metrics": self.recovery_metrics,
            "recovery_success_rate": recovery_success_rate,
            "most_common_category": most_common_category,
            "most_affected_component": most_affected_component,
            "recent_errors": self.error_events[-5:] if self.error_events else []
        }
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """
        Get a summary of performance telemetry.
        
        Returns:
            Dictionary with performance summary
        """
        summary = {}
        
        # Process each metric category
        for category, metrics in self.performance_metrics.items():
            category_summary = {}
            
            for metric, values in metrics.items():
                if not values:
                    continue
                    
                # Check if values are simple or structured
                if isinstance(values[0], dict):
                    # Structured values with timestamps and possibly components
                    raw_values = [v["value"] for v in values]
                    
                    # Group by component if present
                    components = {}
                    for v in values:
                        if "component" in v:
                            comp = v["component"]
                            if comp not in components:
                                components[comp] = []
                            components[comp].append(v["value"])
                    
                    metric_summary = {
                        "avg": sum(raw_values) / len(raw_values),
                        "min": min(raw_values),
                        "max": max(raw_values),
                        "latest": raw_values[-1],
                        "samples": len(raw_values)
                    }
                    
                    # Add component-specific averages if available
                    if components:
                        metric_summary["by_component"] = {
                            comp: sum(vals) / len(vals) 
                            for comp, vals in components.items()
                        }
                else:
                    # Simple values
                    metric_summary = {
                        "avg": sum(values) / len(values),
                        "min": min(values),
                        "max": max(values),
                        "latest": values[-1],
                        "samples": len(values)
                    }
                
                category_summary[metric] = metric_summary
            
            summary[category] = category_summary
        
        return summary
    
    def get_component_usage_summary(self) -> Dict[str, Any]:
        """
        Get a summary of component usage telemetry.
        
        Returns:
            Dictionary with component usage summary
        """
        # Calculate additional metrics for each component
        for component, usage in self.component_usage.items():
            if usage["invocations"] > 0:
                usage["error_rate"] = usage["errors"] / usage["invocations"]
            else:
                usage["error_rate"] = 0
        
        # Return the enhanced component usage dictionary
        return self.component_usage
    
    def get_resource_summary(self) -> Dict[str, Any]:
        """
        Get a summary of resource usage telemetry.
        
        Returns:
            Dictionary with resource usage summary
        """
        summary = {}
        
        for resource, measurements in self.resource_metrics.items():
            if not measurements:
                continue
                
            # Extract values for simple calculation
            if isinstance(measurements[0], dict):
                values = [m["value"] for m in measurements]
                
                # Group by component if present
                components = {}
                for m in measurements:
                    if "component" in m:
                        comp = m["component"]
                        if comp not in components:
                            components[comp] = []
                        components[comp].append(m["value"])
                
                resource_summary = {
                    "avg": sum(values) / len(values),
                    "peak": max(values),
                    "latest": values[-1],
                    "samples": len(values),
                }
                
                # Add component-specific averages if available
                if components:
                    resource_summary["by_component"] = {
                        comp: {
                            "avg": sum(vals) / len(vals),
                            "peak": max(vals),
                            "latest": vals[-1]
                        }
                        for comp, vals in components.items()
                    }
            else:
                # Simple values
                resource_summary = {
                    "avg": sum(measurements) / len(measurements),
                    "peak": max(measurements),
                    "latest": measurements[-1],
                    "samples": len(measurements)
                }
            
            summary[resource] = resource_summary
        
        return summary
    
    def get_telemetry_summary(self) -> Dict[str, Any]:
        """
        Get a comprehensive summary of all telemetry data.
        
        Returns:
            Dictionary with comprehensive telemetry summary
        """
        # Collect current metrics from all components
        component_metrics = self.collect_component_metrics()
        
        return {
            "timestamp": time.time(),
            "errors": self.get_error_summary(),
            "performance": self.get_performance_summary(),
            "resources": self.get_resource_summary(),
            "component_usage": self.get_component_usage_summary(),
            "component_metrics": component_metrics,
            "browser_metrics": self.browser_metrics,
            "system_info": self.system_info
        }
    
    def clear(self) -> None:
        """Clear all telemetry data."""
        # Reset all data stores
        self.performance_metrics = {
            "initialization_times": {},
            "inference_times": {},
            "throughput": {},
            "latency": {},
            "memory_usage": {}
        }
        
        self.error_events = []
        self.error_categories = {}
        self.error_components = {}
        
        self.resource_metrics = {
            "memory_usage": [],
            "gpu_utilization": [],
            "cpu_utilization": []
        }
        
        # Preserve the component usage structure but reset counters
        for component in self.component_usage:
            self.component_usage[component] = {
                "invocations": 0,
                "errors": 0,
                "last_used": None
            }
        
        self.recovery_metrics = {
            "attempts": 0,
            "successes": 0,
            "failures": 0,
            "by_category": {},
            "by_component": {}
        }
        
        self.browser_metrics = {}
        
        # Preserve system info and collectors
        logger.info("Telemetry data cleared")


class TelemetryReporter:
    """
    Generates reports from telemetry data.
    
    Features:
    - Custom report generation with filters
    - Trend analysis and anomaly detection
    - Report formatting in various formats
    - Error correlation analysis
    """
    
    def __init__(self, collector: TelemetryCollector):
        """
        Initialize reporter with telemetry collector.
        
        Args:
            collector: TelemetryCollector instance
        """
        self.collector = collector
    
    def generate_report(self, 
                       sections: Optional[List[str]] = None,
                       format: str = "json") -> Union[Dict[str, Any], str]:
        """
        Generate a telemetry report.
        
        Args:
            sections: Specific report sections to include (None for all)
            format: Report format ("json", "markdown", "html")
            
        Returns:
            Report in requested format
        """
        # Define available sections
        all_sections = [
            "errors", "performance", "resources",
            "component_usage", "recovery", "browser"
        ]
        
        # Use specified sections or all
        sections = sections or all_sections
        
        # Build report with requested sections
        report = {
            "timestamp": time.time(),
            "report_type": "telemetry_summary",
            "sections": sections
        }
        
        # Add each requested section
        if "errors" in sections:
            report["errors"] = self.collector.get_error_summary()
            
        if "performance" in sections:
            report["performance"] = self.collector.get_performance_summary()
            
        if "resources" in sections:
            report["resources"] = self.collector.get_resource_summary()
            
        if "component_usage" in sections:
            report["component_usage"] = self.collector.get_component_usage_summary()
            
        if "recovery" in sections:
            report["recovery"] = self.collector.recovery_metrics
            
        if "browser" in sections:
            report["browser"] = self.collector.browser_metrics
        
        # Add system info
        report["system_info"] = self.collector.system_info
        
        # Format the report as requested
        if format == "json":
            return report
        elif format == "markdown":
            return self._format_markdown(report)
        elif format == "html":
            return self._format_html(report)
        else:
            # Default to JSON
            return report
    
    def analyze_error_trends(self) -> Dict[str, Any]:
        """
        Analyze error trends in telemetry data.
        
        Returns:
            Dictionary with error trend analysis
        """
        error_events = self.collector.error_events
        if not error_events:
            return {"status": "no_data"}
            
        # Group errors by time periods
        time_periods = {}
        current_time = time.time()
        
        # Define time windows (last hour, last day, last week)
        windows = {
            "last_hour": 60 * 60,
            "last_day": 24 * 60 * 60,
            "last_week": 7 * 24 * 60 * 60
        }
        
        for window_name, window_seconds in windows.items():
            # Get errors in this time window
            window_start = current_time - window_seconds
            window_errors = [e for e in error_events if e.get("timestamp", 0) >= window_start]
            
            if not window_errors:
                time_periods[window_name] = {"count": 0, "categories": {}, "components": {}}
                continue
                
            # Count errors by category and component
            categories = {}
            components = {}
            
            for error in window_errors:
                category = error.get("error_type", "unknown")
                component = error.get("component", "unknown")
                
                categories[category] = categories.get(category, 0) + 1
                components[component] = components.get(component, 0) + 1
            
            # Store statistics for this window
            time_periods[window_name] = {
                "count": len(window_errors),
                "categories": categories,
                "components": components,
                "handled_count": sum(1 for e in window_errors if e.get("handled", False)),
                "unhandled_count": sum(1 for e in window_errors if not e.get("handled", False))
            }
        
        # Identify trends
        trends = {}
        
        # Increasing error rate
        if (time_periods["last_hour"]["count"] > 0 and
            time_periods["last_day"]["count"] > time_periods["last_hour"]["count"] * 24 * 0.8):
            trends["increasing_error_rate"] = True
            
        # Recurring errors
        recurring = {}
        for event in error_events:
            category = event.get("error_type", "unknown")
            if category not in recurring:
                recurring[category] = 0
            recurring[category] += 1
            
        # Consider categories with 3+ occurrences as recurring
        trends["recurring_errors"] = {k: v for k, v in recurring.items() if v >= 3}
        
        # Calculate error patterns
        patterns = {}
        
        # Check for cascading errors (multiple components failing in sequence)
        sorted_events = sorted(error_events, key=lambda e: e.get("timestamp", 0))
        cascade_window = 10  # 10 seconds
        
        for i in range(len(sorted_events) - 1):
            current = sorted_events[i]
            next_event = sorted_events[i + 1]
            
            # Check if events are close in time but different components
            if (next_event.get("timestamp", 0) - current.get("timestamp", 0) <= cascade_window and
                next_event.get("component") != current.get("component")):
                
                cascade_key = f"{current.get('component')}_to_{next_event.get('component')}"
                patterns[cascade_key] = patterns.get(cascade_key, 0) + 1
        
        # Add patterns to trends
        trends["error_patterns"] = patterns
        
        return {
            "time_periods": time_periods,
            "trends": trends,
            "total_errors": len(error_events),
            "unique_categories": len(self.collector.error_categories),
            "unique_components": len(self.collector.error_components)
        }
    
    def _format_markdown(self, report: Dict[str, Any]) -> str:
        """Format report as Markdown."""
        # Implement Markdown formatting
        md = f"# Telemetry Report\n\nGenerated: {time.ctime(report['timestamp'])}\n\n"
        
        # Add each section
        if "errors" in report:
            md += "## Error Summary\n\n"
            errors = report["errors"]
            md += f"- Total errors: {errors['total_errors']}\n"
            md += f"- Most common error: {errors.get('most_common_category', 'N/A')}\n"
            md += f"- Most affected component: {errors.get('most_affected_component', 'N/A')}\n"
            md += f"- Recovery success rate: {errors.get('recovery_success_rate', 0):.1%}\n\n"
        
        if "performance" in report:
            md += "## Performance Summary\n\n"
            perf = report["performance"]
            for category, metrics in perf.items():
                md += f"### {category.capitalize()}\n\n"
                for metric, values in metrics.items():
                    md += f"- {metric}: Avg: {values.get('avg')}, Min: {values.get('min')}, Max: {values.get('max')}\n"
                md += "\n"
        
        # Add other sections similarly
        
        return md
    
    def _format_html(self, report: Dict[str, Any]) -> str:
        """Format report as HTML."""
        # Implement HTML formatting with basic styling
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Telemetry Report</title>
            <style>
                body {{ font-family: sans-serif; margin: 20px; }}
                h1, h2, h3 {{ color: #333; }}
                .section {{ margin-bottom: 20px; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }}
                .metric {{ margin: 5px 0; }}
                table {{ border-collapse: collapse; width: 100%; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f2f2f2; }}
            </style>
        </head>
        <body>
            <h1>Telemetry Report</h1>
            <p>Generated: {time.ctime(report['timestamp'])}</p>
        """
        
        # Add each section
        if "errors" in report:
            errors = report["errors"]
            html += """
            <div class="section">
                <h2>Error Summary</h2>
                <div class="metric">Total errors: {0}</div>
                <div class="metric">Most common error: {1}</div>
                <div class="metric">Most affected component: {2}</div>
                <div class="metric">Recovery success rate: {3:.1%}</div>
            </div>
            """.format(
                errors['total_errors'],
                errors.get('most_common_category', 'N/A'),
                errors.get('most_affected_component', 'N/A'),
                errors.get('recovery_success_rate', 0)
            )
        
        # Add other sections similarly
        
        html += """
        </body>
        </html>
        """
        
        return html


# Register a component collector with the telemetry system
def register_collector(collector: TelemetryCollector, 
                     component: str, 
                     metrics_func: Callable) -> None:
    """
    Register a component metrics collector with the telemetry system.
    
    Args:
        collector: TelemetryCollector instance
        component: Component name
        metrics_func: Function that returns component metrics
    """
    collector.register_collector(component, metrics_func)


# Utility function to create telemetry collector
def create_telemetry_collector() -> TelemetryCollector:
    """
    Create a telemetry collector with system info.
    
    Returns:
        Configured TelemetryCollector instance
    """
    collector = TelemetryCollector()
    
    # Capture basic system info
    system_info = {
        "platform": os.environ.get("PLATFORM", "unknown"),
        "python_version": os.environ.get("PYTHON_VERSION", "unknown"),
        "browser": os.environ.get("BROWSER", "unknown"),
        "browser_version": os.environ.get("BROWSER_VERSION", "unknown"),
        "webgpu_enabled": os.environ.get("WEBGPU_ENABLED", "0") == "1",
        "webnn_enabled": os.environ.get("WEBNN_ENABLED", "0") == "1",
        "timestamp": time.time()
    }
    collector.capture_system_info(system_info)
    
    return collector


# Example collector functions for different components
def streaming_metrics_collector():
    """Example metrics collector for streaming component."""
    return {
        "tokens_generated": 1000,
        "generation_speed": 10.5,
        "batch_size": 4,
        "memory_usage_mb": 500,
        "optimizations_enabled": ["kv_cache", "compute_overlap"]
    }


def webgpu_metrics_collector():
    """Example metrics collector for WebGPU component."""
    return {
        "shader_compilation_time": 25.3,
        "compute_shader_usage": 10,
        "gpu_memory_allocated_mb": 800,
        "pipeline_creation_time": 15.2
    }