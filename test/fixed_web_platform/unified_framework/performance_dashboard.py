"""
Performance Dashboard for Web Platform (August 2025)

This module provides a comprehensive performance monitoring and visualization
system for the web platform with:

- Detailed performance metrics collection
- Interactive visualization dashboard
- Historical performance comparisons
- Browser and hardware-specific reporting
- Memory usage analysis
- Integration with the unified framework

Usage:
    from fixed_web_platform.unified_framework.performance_dashboard import (
        PerformanceDashboard, MetricsCollector, create_performance_report
    )
    
    # Create metrics collector
    metrics = MetricsCollector()
    
    # Record inference metrics
    metrics.record_inference(model_name="bert-base", 
                           platform="webgpu", 
                           inference_time_ms=45.2,
                           memory_mb=120)
    
    # Create dashboard
    dashboard = PerformanceDashboard(metrics)
    
    # Generate HTML report
    html_report = dashboard.generate_html_report()
    
    # Generate model comparison chart
    comparison_chart = dashboard.create_model_comparison_chart(
        models=["bert-base", "t5-small"],
        metric="inference_time_ms"
    )
"""

import os
import time
import json
import logging
import datetime
from typing import Dict, Any, List, Optional, Union, Tuple, Set

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unified_framework.performance_dashboard")

class MetricsCollector:
    """
    Performance metrics collection for web platform models.
    
    This class provides functionality to collect and store detailed 
    performance metrics for model inference across different platforms,
    browsers, and hardware configurations.
    """
    
    def __init__(self,
                storage_path: Optional[str] = None,
                retention_days: int = 30,
                auto_save: bool = True):
        """
        Initialize metrics collector.
        
        Args:
            storage_path: Path to store metrics data
            retention_days: Number of days to retain metrics data
            auto_save: Whether to automatically save metrics
        """
        self.storage_path = storage_path
        self.retention_days = retention_days
        self.auto_save = auto_save
        
        # Initialize metrics storage
        self.inference_metrics = []
        self.initialization_metrics = []
        self.memory_metrics = []
        self.feature_usage_metrics = []
        
        # Track model and browser combinations
        self.recorded_models = set()
        self.recorded_browsers = set()
        self.recorded_platforms = set()
        
        # Initialize from storage if available
        if storage_path and os.path.exists(storage_path):
            self.load_metrics()
            
        logger.info("Metrics collector initialized")
        
    def record_inference(self,
                       model_name: str,
                       platform: str,
                       inference_time_ms: float,
                       batch_size: int = 1,
                       browser: Optional[str] = None,
                       memory_mb: Optional[float] = None,
                       details: Optional[Dict[str, Any]] = None) -> None:
        """
        Record inference performance metrics.
        
        Args:
            model_name: Name of the model
            platform: Platform used (webgpu, webnn, wasm)
            inference_time_ms: Inference time in milliseconds
            batch_size: Batch size used
            browser: Browser used
            memory_mb: Memory usage in MB
            details: Additional details
        """
        timestamp = time.time()
        
        metric = {
            "timestamp": timestamp,
            "date": datetime.datetime.fromtimestamp(timestamp).isoformat(),
            "model_name": model_name,
            "platform": platform,
            "inference_time_ms": inference_time_ms,
            "batch_size": batch_size,
            "throughput_items_per_second": 1000 * batch_size / inference_time_ms if inference_time_ms > 0 else 0
        }
        
        # Add optional fields
        if browser:
            metric["browser"] = browser
            self.recorded_browsers.add(browser)
            
        if memory_mb is not None:
            metric["memory_mb"] = memory_mb
            
            # Also record in memory metrics
            self.record_memory_usage(model_name, platform, memory_mb, "inference", browser)
            
        if details:
            metric["details"] = details
            
        # Update tracking sets
        self.recorded_models.add(model_name)
        self.recorded_platforms.add(platform)
        
        # Add to metrics
        self.inference_metrics.append(metric)
        
        # Auto-save if enabled
        if self.auto_save and self.storage_path:
            self.save_metrics()
            
        logger.debug(f"Recorded inference metrics for {model_name} on {platform}")
        
    def record_initialization(self,
                            model_name: str,
                            platform: str,
                            initialization_time_ms: float,
                            browser: Optional[str] = None,
                            memory_mb: Optional[float] = None,
                            details: Optional[Dict[str, Any]] = None) -> None:
        """
        Record model initialization performance metrics.
        
        Args:
            model_name: Name of the model
            platform: Platform used (webgpu, webnn, wasm)
            initialization_time_ms: Initialization time in milliseconds
            browser: Browser used
            memory_mb: Memory usage in MB
            details: Additional details
        """
        timestamp = time.time()
        
        metric = {
            "timestamp": timestamp,
            "date": datetime.datetime.fromtimestamp(timestamp).isoformat(),
            "model_name": model_name,
            "platform": platform,
            "initialization_time_ms": initialization_time_ms
        }
        
        # Add optional fields
        if browser:
            metric["browser"] = browser
            self.recorded_browsers.add(browser)
            
        if memory_mb is not None:
            metric["memory_mb"] = memory_mb
            
            # Also record in memory metrics
            self.record_memory_usage(model_name, platform, memory_mb, "initialization", browser)
            
        if details:
            metric["details"] = details
            
        # Update tracking sets
        self.recorded_models.add(model_name)
        self.recorded_platforms.add(platform)
        
        # Add to metrics
        self.initialization_metrics.append(metric)
        
        # Auto-save if enabled
        if self.auto_save and self.storage_path:
            self.save_metrics()
            
        logger.debug(f"Recorded initialization metrics for {model_name} on {platform}")
        
    def record_memory_usage(self,
                          model_name: str,
                          platform: str,
                          memory_mb: float,
                          operation_type: str,
                          browser: Optional[str] = None,
                          details: Optional[Dict[str, Any]] = None) -> None:
        """
        Record memory usage metrics.
        
        Args:
            model_name: Name of the model
            platform: Platform used (webgpu, webnn, wasm)
            memory_mb: Memory usage in MB
            operation_type: Type of operation (initialization, inference)
            browser: Browser used
            details: Additional details
        """
        timestamp = time.time()
        
        metric = {
            "timestamp": timestamp,
            "date": datetime.datetime.fromtimestamp(timestamp).isoformat(),
            "model_name": model_name,
            "platform": platform,
            "memory_mb": memory_mb,
            "operation_type": operation_type
        }
        
        # Add optional fields
        if browser:
            metric["browser"] = browser
            self.recorded_browsers.add(browser)
            
        if details:
            metric["details"] = details
            
        # Update tracking sets
        self.recorded_models.add(model_name)
        self.recorded_platforms.add(platform)
        
        # Add to metrics
        self.memory_metrics.append(metric)
        
        # Auto-save if enabled
        if self.auto_save and self.storage_path:
            self.save_metrics()
            
        logger.debug(f"Recorded memory metrics for {model_name} on {platform}: {memory_mb} MB")
        
    def record_feature_usage(self,
                           model_name: str,
                           platform: str,
                           features: Dict[str, bool],
                           browser: Optional[str] = None) -> None:
        """
        Record feature usage metrics.
        
        Args:
            model_name: Name of the model
            platform: Platform used (webgpu, webnn, wasm)
            features: Dictionary of feature usage
            browser: Browser used
        """
        timestamp = time.time()
        
        metric = {
            "timestamp": timestamp,
            "date": datetime.datetime.fromtimestamp(timestamp).isoformat(),
            "model_name": model_name,
            "platform": platform,
            "features": features
        }
        
        # Add optional fields
        if browser:
            metric["browser"] = browser
            self.recorded_browsers.add(browser)
            
        # Update tracking sets
        self.recorded_models.add(model_name)
        self.recorded_platforms.add(platform)
        
        # Add to metrics
        self.feature_usage_metrics.append(metric)
        
        # Auto-save if enabled
        if self.auto_save and self.storage_path:
            self.save_metrics()
            
        logger.debug(f"Recorded feature usage for {model_name} on {platform}")
        
    def save_metrics(self) -> bool:
        """
        Save metrics to storage.
        
        Returns:
            Whether save was successful
        """
        if not self.storage_path:
            logger.warning("No storage path specified for metrics")
            return False
            
        # Create metrics data
        metrics_data = {
            "inference_metrics": self.inference_metrics,
            "initialization_metrics": self.initialization_metrics,
            "memory_metrics": self.memory_metrics,
            "feature_usage_metrics": self.feature_usage_metrics,
            "last_updated": time.time()
        }
        
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            
            # Save to file
            with open(self.storage_path, "w") as f:
                json.dump(metrics_data, f)
                
            logger.info(f"Saved metrics to {self.storage_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving metrics: {e}")
            return False
            
    def load_metrics(self) -> bool:
        """
        Load metrics from storage.
        
        Returns:
            Whether load was successful
        """
        if not self.storage_path or not os.path.exists(self.storage_path):
            logger.warning(f"Metrics file not found: {self.storage_path}")
            return False
            
        try:
            # Load from file
            with open(self.storage_path, "r") as f:
                metrics_data = json.load(f)
                
            # Update metrics
            self.inference_metrics = metrics_data.get("inference_metrics", [])
            self.initialization_metrics = metrics_data.get("initialization_metrics", [])
            self.memory_metrics = metrics_data.get("memory_metrics", [])
            self.feature_usage_metrics = metrics_data.get("feature_usage_metrics", [])
            
            # Update tracking sets
            self._update_tracking_sets()
            
            # Apply retention policy
            self._apply_retention_policy()
            
            logger.info(f"Loaded metrics from {self.storage_path}")
            return True
        except Exception as e:
            logger.error(f"Error loading metrics: {e}")
            return False
            
    def _update_tracking_sets(self) -> None:
        """Update tracking sets from loaded metrics."""
        self.recorded_models = set()
        self.recorded_browsers = set()
        self.recorded_platforms = set()
        
        # Process inference metrics
        for metric in self.inference_metrics:
            self.recorded_models.add(metric.get("model_name", "unknown"))
            if "browser" in metric:
                self.recorded_browsers.add(metric["browser"])
            self.recorded_platforms.add(metric.get("platform", "unknown"))
            
        # Process initialization metrics
        for metric in self.initialization_metrics:
            self.recorded_models.add(metric.get("model_name", "unknown"))
            if "browser" in metric:
                self.recorded_browsers.add(metric["browser"])
            self.recorded_platforms.add(metric.get("platform", "unknown"))
            
    def _apply_retention_policy(self) -> None:
        """Apply retention policy to metrics."""
        if self.retention_days <= 0:
            return
            
        # Calculate cutoff timestamp
        cutoff_timestamp = time.time() - (self.retention_days * 24 * 60 * 60)
        
        # Filter metrics
        self.inference_metrics = [
            m for m in self.inference_metrics
            if m["timestamp"] >= cutoff_timestamp
        ]
        
        self.initialization_metrics = [
            m for m in self.initialization_metrics
            if m["timestamp"] >= cutoff_timestamp
        ]
        
        self.memory_metrics = [
            m for m in self.memory_metrics
            if m["timestamp"] >= cutoff_timestamp
        ]
        
        self.feature_usage_metrics = [
            m for m in self.feature_usage_metrics
            if m["timestamp"] >= cutoff_timestamp
        ]
        
        logger.info(f"Applied retention policy: {self.retention_days} days")
        
    def get_model_performance(self, 
                            model_name: str,
                            platform: Optional[str] = None,
                            browser: Optional[str] = None) -> Dict[str, Any]:
        """
        Get performance metrics for a specific model.
        
        Args:
            model_name: Name of the model
            platform: Optional platform to filter by
            browser: Optional browser to filter by
            
        Returns:
            Dictionary with performance metrics
        """
        # Filter metrics
        inference_metrics = self._filter_metrics(
            self.inference_metrics,
            model_name=model_name,
            platform=platform,
            browser=browser
        )
        
        initialization_metrics = self._filter_metrics(
            self.initialization_metrics,
            model_name=model_name,
            platform=platform,
            browser=browser
        )
        
        memory_metrics = self._filter_metrics(
            self.memory_metrics,
            model_name=model_name,
            platform=platform,
            browser=browser
        )
        
        # Calculate average metrics
        avg_inference_time = self._calculate_average(
            inference_metrics, "inference_time_ms"
        )
        
        avg_initialization_time = self._calculate_average(
            initialization_metrics, "initialization_time_ms"
        )
        
        avg_memory = self._calculate_average(
            memory_metrics, "memory_mb"
        )
        
        avg_throughput = self._calculate_average(
            inference_metrics, "throughput_items_per_second"
        )
        
        # Count metrics
        inference_count = len(inference_metrics)
        initialization_count = len(initialization_metrics)
        memory_count = len(memory_metrics)
        
        return {
            "model_name": model_name,
            "platform": platform or "all",
            "browser": browser or "all",
            "average_inference_time_ms": avg_inference_time,
            "average_initialization_time_ms": avg_initialization_time,
            "average_memory_mb": avg_memory,
            "average_throughput_items_per_second": avg_throughput,
            "inference_count": inference_count,
            "initialization_count": initialization_count,
            "memory_count": memory_count,
            "last_inference": inference_metrics[-1] if inference_metrics else None,
            "last_initialization": initialization_metrics[-1] if initialization_metrics else None,
            "historical_data": {
                "inference_times": [m.get("inference_time_ms") for m in inference_metrics],
                "initialization_times": [m.get("initialization_time_ms") for m in initialization_metrics],
                "memory_usage": [m.get("memory_mb") for m in memory_metrics],
                "dates": [m.get("date") for m in sorted(inference_metrics + initialization_metrics, key=lambda x: x["timestamp"])]
            }
        }
        
    def _filter_metrics(self,
                      metrics: List[Dict[str, Any]],
                      model_name: Optional[str] = None,
                      platform: Optional[str] = None,
                      browser: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Filter metrics based on criteria.
        
        Args:
            metrics: List of metrics to filter
            model_name: Optional model name to filter by
            platform: Optional platform to filter by
            browser: Optional browser to filter by
            
        Returns:
            Filtered list of metrics
        """
        filtered = metrics
        
        if model_name:
            filtered = [m for m in filtered if m.get("model_name") == model_name]
            
        if platform:
            filtered = [m for m in filtered if m.get("platform") == platform]
            
        if browser:
            filtered = [m for m in filtered if m.get("browser") == browser]
            
        return filtered
        
    def _calculate_average(self, 
                         metrics: List[Dict[str, Any]],
                         field: str) -> float:
        """
        Calculate average value for a field.
        
        Args:
            metrics: List of metrics
            field: Field to calculate average for
            
        Returns:
            Average value
        """
        if not metrics:
            return 0.0
            
        values = [m.get(field, 0) for m in metrics if field in m]
        if not values:
            return 0.0
            
        return sum(values) / len(values)
        
    def get_platform_comparison(self, 
                             model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get performance comparison across platforms.
        
        Args:
            model_name: Optional model name to filter by
            
        Returns:
            Dictionary with platform comparison
        """
        platforms = sorted(list(self.recorded_platforms))
        result = {
            "platforms": platforms,
            "inference_time_ms": {},
            "initialization_time_ms": {},
            "memory_mb": {},
            "throughput_items_per_second": {}
        }
        
        for platform in platforms:
            # Filter metrics for this platform
            platform_inference = self._filter_metrics(
                self.inference_metrics,
                model_name=model_name,
                platform=platform
            )
            
            platform_initialization = self._filter_metrics(
                self.initialization_metrics,
                model_name=model_name,
                platform=platform
            )
            
            platform_memory = self._filter_metrics(
                self.memory_metrics,
                model_name=model_name,
                platform=platform
            )
            
            # Calculate averages
            result["inference_time_ms"][platform] = self._calculate_average(
                platform_inference, "inference_time_ms"
            )
            
            result["initialization_time_ms"][platform] = self._calculate_average(
                platform_initialization, "initialization_time_ms"
            )
            
            result["memory_mb"][platform] = self._calculate_average(
                platform_memory, "memory_mb"
            )
            
            result["throughput_items_per_second"][platform] = self._calculate_average(
                platform_inference, "throughput_items_per_second"
            )
            
        return result
        
    def get_browser_comparison(self,
                            model_name: Optional[str] = None,
                            platform: Optional[str] = None) -> Dict[str, Any]:
        """
        Get performance comparison across browsers.
        
        Args:
            model_name: Optional model name to filter by
            platform: Optional platform to filter by
            
        Returns:
            Dictionary with browser comparison
        """
        browsers = sorted(list(self.recorded_browsers))
        if not browsers:
            return {"browsers": [], "note": "No browser data recorded"}
            
        result = {
            "browsers": browsers,
            "inference_time_ms": {},
            "initialization_time_ms": {},
            "memory_mb": {},
            "throughput_items_per_second": {}
        }
        
        for browser in browsers:
            # Filter metrics for this browser
            browser_inference = self._filter_metrics(
                self.inference_metrics,
                model_name=model_name,
                platform=platform,
                browser=browser
            )
            
            browser_initialization = self._filter_metrics(
                self.initialization_metrics,
                model_name=model_name,
                platform=platform,
                browser=browser
            )
            
            browser_memory = self._filter_metrics(
                self.memory_metrics,
                model_name=model_name,
                platform=platform,
                browser=browser
            )
            
            # Calculate averages
            result["inference_time_ms"][browser] = self._calculate_average(
                browser_inference, "inference_time_ms"
            )
            
            result["initialization_time_ms"][browser] = self._calculate_average(
                browser_initialization, "initialization_time_ms"
            )
            
            result["memory_mb"][browser] = self._calculate_average(
                browser_memory, "memory_mb"
            )
            
            result["throughput_items_per_second"][browser] = self._calculate_average(
                browser_inference, "throughput_items_per_second"
            )
            
        return result
        
    def get_feature_usage_statistics(self,
                                   browser: Optional[str] = None) -> Dict[str, Any]:
        """
        Get feature usage statistics.
        
        Args:
            browser: Optional browser to filter by
            
        Returns:
            Dictionary with feature usage statistics
        """
        # Filter metrics
        feature_metrics = self._filter_metrics(
            self.feature_usage_metrics,
            browser=browser
        )
        
        if not feature_metrics:
            return {"features": {}, "note": "No feature usage data recorded"}
            
        # Collect all feature names
        all_features = set()
        for metric in feature_metrics:
            if "features" in metric and isinstance(metric["features"], dict):
                all_features.update(metric["features"].keys())
                
        # Calculate usage percentages
        feature_usage = {}
        for feature in all_features:
            used_count = sum(
                1 for m in feature_metrics
                if "features" in m and isinstance(m["features"], dict) and m["features"].get(feature, False)
            )
            
            if feature_metrics:
                usage_percent = (used_count / len(feature_metrics)) * 100
            else:
                usage_percent = 0
                
            feature_usage[feature] = {
                "used_count": used_count,
                "total_count": len(feature_metrics),
                "usage_percent": usage_percent
            }
            
        return {
            "features": feature_usage,
            "total_records": len(feature_metrics)
        }
        
    def clear_metrics(self) -> None:
        """Clear all metrics data."""
        self.inference_metrics = []
        self.initialization_metrics = []
        self.memory_metrics = []
        self.feature_usage_metrics = []
        self.recorded_models = set()
        self.recorded_browsers = set()
        self.recorded_platforms = set()
        
        logger.info("Cleared all metrics data")
        
        # Save empty metrics if auto-save is enabled
        if self.auto_save and self.storage_path:
            self.save_metrics()


class PerformanceDashboard:
    """
    Interactive performance dashboard for web platform models.
    
    This class provides functionality to create interactive visualizations
    and reports based on collected performance metrics.
    """
    
    def __init__(self, metrics_collector: MetricsCollector):
        """
        Initialize performance dashboard.
        
        Args:
            metrics_collector: Metrics collector with performance data
        """
        self.metrics = metrics_collector
        
        # Dashboard configuration
        self.config = {
            "title": "Web Platform Performance Dashboard",
            "theme": "light",
            "show_browser_comparison": True,
            "show_platform_comparison": True,
            "show_model_comparison": True,
            "show_feature_usage": True,
            "show_historical_data": True
        }
        
        logger.info("Performance dashboard initialized")
        
    def generate_html_report(self,
                           model_filter: Optional[str] = None,
                           platform_filter: Optional[str] = None,
                           browser_filter: Optional[str] = None) -> str:
        """
        Generate HTML report with visualizations.
        
        Args:
            model_filter: Optional model name to filter by
            platform_filter: Optional platform to filter by
            browser_filter: Optional browser to filter by
            
        Returns:
            HTML report as string
        """
        # This is a simplified implementation - in a real implementation
        # this would generate a complete HTML report with charts
        
        # Generate report components
        heading = f"<h1>{self.config['title']}</h1>"
        date = f"<p>Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>"
        
        summary = self._generate_summary_section(model_filter, platform_filter, browser_filter)
        model_comparison = self._generate_model_comparison_section(platform_filter, browser_filter)
        platform_comparison = self._generate_platform_comparison_section(model_filter, browser_filter)
        browser_comparison = self._generate_browser_comparison_section(model_filter, platform_filter)
        feature_usage = self._generate_feature_usage_section(browser_filter)
        
        # Combine sections
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{self.config['title']}</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .dashboard-section {{ margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }}
                .chart-container {{ height: 300px; margin: 20px 0; }}
                table {{ border-collapse: collapse; width: 100%; }}
                th, td {{ text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }}
                th {{ background-color: #f2f2f2; }}
            </style>
        </head>
        <body>
            {heading}
            {date}
            
            {summary}
            
            {model_comparison if self.config['show_model_comparison'] else ''}
            
            {platform_comparison if self.config['show_platform_comparison'] else ''}
            
            {browser_comparison if self.config['show_browser_comparison'] else ''}
            
            {feature_usage if self.config['show_feature_usage'] else ''}
        </body>
        </html>
        """
        
        return html
        
    def _generate_summary_section(self,
                                model_filter: Optional[str] = None,
                                platform_filter: Optional[str] = None,
                                browser_filter: Optional[str] = None) -> str:
        """Generate summary section of the report."""
        # Count metrics
        inference_count = len(self._filter_metrics(
            self.metrics.inference_metrics,
            model_name=model_filter,
            platform=platform_filter,
            browser=browser_filter
        ))
        
        initialization_count = len(self._filter_metrics(
            self.metrics.initialization_metrics,
            model_name=model_filter,
            platform=platform_filter,
            browser=browser_filter
        ))
        
        # Get unique counts
        models = set()
        platforms = set()
        browsers = set()
        
        for metric in self.metrics.inference_metrics:
            if self._matches_filters(metric, model_filter, platform_filter, browser_filter):
                models.add(metric.get("model_name", "unknown"))
                platforms.add(metric.get("platform", "unknown"))
                if "browser" in metric:
                    browsers.add(metric["browser"])
                    
        for metric in self.metrics.initialization_metrics:
            if self._matches_filters(metric, model_filter, platform_filter, browser_filter):
                models.add(metric.get("model_name", "unknown"))
                platforms.add(metric.get("platform", "unknown"))
                if "browser" in metric:
                    browsers.add(metric["browser"])
                    
        # Generate summary HTML
        filters = []
        if model_filter:
            filters.append(f"Model: {model_filter}")
        if platform_filter:
            filters.append(f"Platform: {platform_filter}")
        if browser_filter:
            filters.append(f"Browser: {browser_filter}")
            
        filter_text = ", ".join(filters) if filters else "All data"
        
        html = f"""
        <div class="dashboard-section">
            <h2>Summary</h2>
            <p>Filters: {filter_text}</p>
            
            <table>
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>Total Inference Records</td>
                    <td>{inference_count}</td>
                </tr>
                <tr>
                    <td>Total Initialization Records</td>
                    <td>{initialization_count}</td>
                </tr>
                <tr>
                    <td>Unique Models</td>
                    <td>{len(models)}</td>
                </tr>
                <tr>
                    <td>Platforms</td>
                    <td>{', '.join(sorted(platforms))}</td>
                </tr>
                <tr>
                    <td>Browsers</td>
                    <td>{', '.join(sorted(browsers))}</td>
                </tr>
            </table>
        </div>
        """
        
        return html
        
    def _generate_model_comparison_section(self,
                                         platform_filter: Optional[str] = None,
                                         browser_filter: Optional[str] = None) -> str:
        """Generate model comparison section of the report."""
        models = sorted(list(self.metrics.recorded_models))
        if not models:
            return "<div class='dashboard-section'><h2>Model Comparison</h2><p>No model data available</p></div>"
            
        # Get performance data for each model
        model_data = []
        for model in models:
            performance = self.metrics.get_model_performance(
                model,
                platform=platform_filter,
                browser=browser_filter
            )
            
            model_data.append({
                "model": model,
                "inference_time_ms": performance["average_inference_time_ms"],
                "initialization_time_ms": performance["average_initialization_time_ms"],
                "memory_mb": performance["average_memory_mb"],
                "throughput": performance["average_throughput_items_per_second"],
                "inference_count": performance["inference_count"]
            })
            
        # Generate table rows
        table_rows = ""
        for data in model_data:
            table_rows += f"""
            <tr>
                <td>{data['model']}</td>
                <td>{data['inference_time_ms']:.2f}</td>
                <td>{data['initialization_time_ms']:.2f}</td>
                <td>{data['memory_mb']:.2f}</td>
                <td>{data['throughput']:.2f}</td>
                <td>{data['inference_count']}</td>
            </tr>
            """
            
        # Generate HTML
        html = f"""
        <div class="dashboard-section">
            <h2>Model Comparison</h2>
            
            <div class="chart-container">
                <!-- Chart would be rendered here in a real implementation -->
                <p>Interactive chart would display here with model comparison data</p>
            </div>
            
            <table>
                <tr>
                    <th>Model</th>
                    <th>Avg. Inference Time (ms)</th>
                    <th>Avg. Initialization Time (ms)</th>
                    <th>Avg. Memory (MB)</th>
                    <th>Avg. Throughput (items/s)</th>
                    <th>Inference Count</th>
                </tr>
                {table_rows}
            </table>
        </div>
        """
        
        return html
        
    def _generate_platform_comparison_section(self,
                                           model_filter: Optional[str] = None,
                                           browser_filter: Optional[str] = None) -> str:
        """Generate platform comparison section of the report."""
        comparison = self.metrics.get_platform_comparison(model_filter)
        platforms = comparison["platforms"]
        if not platforms:
            return "<div class='dashboard-section'><h2>Platform Comparison</h2><p>No platform data available</p></div>"
            
        # Generate table rows
        table_rows = ""
        for platform in platforms:
            inference_time = comparison["inference_time_ms"].get(platform, 0)
            init_time = comparison["initialization_time_ms"].get(platform, 0)
            memory = comparison["memory_mb"].get(platform, 0)
            throughput = comparison["throughput_items_per_second"].get(platform, 0)
            
            table_rows += f"""
            <tr>
                <td>{platform}</td>
                <td>{inference_time:.2f}</td>
                <td>{init_time:.2f}</td>
                <td>{memory:.2f}</td>
                <td>{throughput:.2f}</td>
            </tr>
            """
            
        # Generate HTML
        html = f"""
        <div class="dashboard-section">
            <h2>Platform Comparison</h2>
            
            <div class="chart-container">
                <!-- Chart would be rendered here in a real implementation -->
                <p>Interactive chart would display here with platform comparison data</p>
            </div>
            
            <table>
                <tr>
                    <th>Platform</th>
                    <th>Avg. Inference Time (ms)</th>
                    <th>Avg. Initialization Time (ms)</th>
                    <th>Avg. Memory (MB)</th>
                    <th>Avg. Throughput (items/s)</th>
                </tr>
                {table_rows}
            </table>
        </div>
        """
        
        return html
        
    def _generate_browser_comparison_section(self,
                                          model_filter: Optional[str] = None,
                                          platform_filter: Optional[str] = None) -> str:
        """Generate browser comparison section of the report."""
        comparison = self.metrics.get_browser_comparison(model_filter, platform_filter)
        browsers = comparison.get("browsers", [])
        if not browsers:
            return "<div class='dashboard-section'><h2>Browser Comparison</h2><p>No browser data available</p></div>"
            
        # Generate table rows
        table_rows = ""
        for browser in browsers:
            inference_time = comparison["inference_time_ms"].get(browser, 0)
            init_time = comparison["initialization_time_ms"].get(browser, 0)
            memory = comparison["memory_mb"].get(browser, 0)
            throughput = comparison["throughput_items_per_second"].get(browser, 0)
            
            table_rows += f"""
            <tr>
                <td>{browser}</td>
                <td>{inference_time:.2f}</td>
                <td>{init_time:.2f}</td>
                <td>{memory:.2f}</td>
                <td>{throughput:.2f}</td>
            </tr>
            """
            
        # Generate HTML
        html = f"""
        <div class="dashboard-section">
            <h2>Browser Comparison</h2>
            
            <div class="chart-container">
                <!-- Chart would be rendered here in a real implementation -->
                <p>Interactive chart would display here with browser comparison data</p>
            </div>
            
            <table>
                <tr>
                    <th>Browser</th>
                    <th>Avg. Inference Time (ms)</th>
                    <th>Avg. Initialization Time (ms)</th>
                    <th>Avg. Memory (MB)</th>
                    <th>Avg. Throughput (items/s)</th>
                </tr>
                {table_rows}
            </table>
        </div>
        """
        
        return html
        
    def _generate_feature_usage_section(self,
                                      browser_filter: Optional[str] = None) -> str:
        """Generate feature usage section of the report."""
        usage_stats = self.metrics.get_feature_usage_statistics(browser_filter)
        features = usage_stats.get("features", {})
        if not features:
            return "<div class='dashboard-section'><h2>Feature Usage</h2><p>No feature usage data available</p></div>"
            
        # Generate table rows
        table_rows = ""
        for feature, stats in features.items():
            used_count = stats["used_count"]
            total_count = stats["total_count"]
            usage_percent = stats["usage_percent"]
            
            table_rows += f"""
            <tr>
                <td>{feature}</td>
                <td>{used_count} / {total_count}</td>
                <td>{usage_percent:.2f}%</td>
            </tr>
            """
            
        # Generate HTML
        html = f"""
        <div class="dashboard-section">
            <h2>Feature Usage</h2>
            
            <div class="chart-container">
                <!-- Chart would be rendered here in a real implementation -->
                <p>Interactive chart would display here with feature usage data</p>
            </div>
            
            <table>
                <tr>
                    <th>Feature</th>
                    <th>Usage Count</th>
                    <th>Usage Percentage</th>
                </tr>
                {table_rows}
            </table>
        </div>
        """
        
        return html
        
    def create_model_comparison_chart(self,
                                    models: List[str],
                                    metric: str = "inference_time_ms",
                                    platform: Optional[str] = None,
                                    browser: Optional[str] = None) -> Dict[str, Any]:
        """
        Create model comparison chart data.
        
        Args:
            models: List of models to compare
            metric: Metric to compare
            platform: Optional platform to filter by
            browser: Optional browser to filter by
            
        Returns:
            Chart data structure
        """
        # This is a simplified implementation - in a real implementation
        # this would generate chart data suitable for a visualization library
        
        chart_data = {
            "type": "bar",
            "title": f"{metric} Comparison by Model",
            "x_axis": models,
            "y_axis": metric,
            "series": [],
            "labels": {}
        }
        
        for model in models:
            # Get performance data
            performance = self.metrics.get_model_performance(
                model,
                platform=platform,
                browser=browser
            )
            
            # Get metric value
            if metric == "inference_time_ms":
                value = performance["average_inference_time_ms"]
            elif metric == "initialization_time_ms":
                value = performance["average_initialization_time_ms"]
            elif metric == "memory_mb":
                value = performance["average_memory_mb"]
            elif metric == "throughput_items_per_second":
                value = performance["average_throughput_items_per_second"]
            else:
                value = 0
                
            # Add to chart data
            chart_data["series"].append(value)
            chart_data["labels"][model] = value
            
        return chart_data
        
    def create_comparison_chart(self,
                              compare_type: str = "platform",
                              metric: str = "inference_time_ms",
                              model_filter: Optional[str] = None,
                              platform_filter: Optional[str] = None,
                              browser_filter: Optional[str] = None) -> Dict[str, Any]:
        """
        Create comparison chart data.
        
        Args:
            compare_type: Type of comparison ('platform', 'browser', 'model')
            metric: Metric to compare
            model_filter: Optional model to filter by
            platform_filter: Optional platform to filter by
            browser_filter: Optional browser to filter by
            
        Returns:
            Chart data structure
        """
        # This is a simplified implementation - in a real implementation
        # this would generate chart data suitable for a visualization library
        
        chart_data = {
            "type": "bar",
            "title": f"{metric} Comparison by {compare_type.capitalize()}",
            "y_axis": metric,
            "series": [],
            "labels": {}
        }
        
        if compare_type == "platform":
            # Platform comparison
            comparison = self.metrics.get_platform_comparison(model_filter)
            platforms = comparison["platforms"]
            chart_data["x_axis"] = platforms
            
            for platform in platforms:
                if metric == "inference_time_ms":
                    value = comparison["inference_time_ms"].get(platform, 0)
                elif metric == "initialization_time_ms":
                    value = comparison["initialization_time_ms"].get(platform, 0)
                elif metric == "memory_mb":
                    value = comparison["memory_mb"].get(platform, 0)
                elif metric == "throughput_items_per_second":
                    value = comparison["throughput_items_per_second"].get(platform, 0)
                else:
                    value = 0
                    
                chart_data["series"].append(value)
                chart_data["labels"][platform] = value
                
        elif compare_type == "browser":
            # Browser comparison
            comparison = self.metrics.get_browser_comparison(model_filter, platform_filter)
            browsers = comparison.get("browsers", [])
            chart_data["x_axis"] = browsers
            
            for browser in browsers:
                if metric == "inference_time_ms":
                    value = comparison["inference_time_ms"].get(browser, 0)
                elif metric == "initialization_time_ms":
                    value = comparison["initialization_time_ms"].get(browser, 0)
                elif metric == "memory_mb":
                    value = comparison["memory_mb"].get(browser, 0)
                elif metric == "throughput_items_per_second":
                    value = comparison["throughput_items_per_second"].get(browser, 0)
                else:
                    value = 0
                    
                chart_data["series"].append(value)
                chart_data["labels"][browser] = value
                
        elif compare_type == "model":
            # Model comparison
            models = sorted(list(self.metrics.recorded_models))
            chart_data["x_axis"] = models
            
            for model in models:
                performance = self.metrics.get_model_performance(
                    model,
                    platform=platform_filter,
                    browser=browser_filter
                )
                
                if metric == "inference_time_ms":
                    value = performance["average_inference_time_ms"]
                elif metric == "initialization_time_ms":
                    value = performance["average_initialization_time_ms"]
                elif metric == "memory_mb":
                    value = performance["average_memory_mb"]
                elif metric == "throughput_items_per_second":
                    value = performance["average_throughput_items_per_second"]
                else:
                    value = 0
                    
                chart_data["series"].append(value)
                chart_data["labels"][model] = value
                
        return chart_data
        
    def _filter_metrics(self,
                      metrics: List[Dict[str, Any]],
                      model_name: Optional[str] = None,
                      platform: Optional[str] = None,
                      browser: Optional[str] = None) -> List[Dict[str, Any]]:
        """Filter metrics based on criteria."""
        return [
            m for m in metrics
            if self._matches_filters(m, model_name, platform, browser)
        ]
        
    def _matches_filters(self,
                       metric: Dict[str, Any],
                       model_name: Optional[str] = None,
                       platform: Optional[str] = None,
                       browser: Optional[str] = None) -> bool:
        """Check if metric matches all filters."""
        if model_name and metric.get("model_name") != model_name:
            return False
            
        if platform and metric.get("platform") != platform:
            return False
            
        if browser and metric.get("browser") != browser:
            return False
            
        return True


def create_performance_report(metrics_path: str,
                           output_path: Optional[str] = None,
                           model_filter: Optional[str] = None,
                           platform_filter: Optional[str] = None,
                           browser_filter: Optional[str] = None) -> str:
    """
    Create performance report from metrics file.
    
    Args:
        metrics_path: Path to metrics file
        output_path: Optional path to save HTML report
        model_filter: Optional model name to filter by
        platform_filter: Optional platform to filter by
        browser_filter: Optional browser to filter by
        
    Returns:
        Path to generated report or HTML string
    """
    # Load metrics
    metrics = MetricsCollector(storage_path=metrics_path)
    if not metrics.load_metrics():
        logger.error(f"Failed to load metrics from {metrics_path}")
        return "Failed to load metrics"
        
    # Create dashboard
    dashboard = PerformanceDashboard(metrics)
    
    # Generate HTML report
    html = dashboard.generate_html_report(
        model_filter=model_filter,
        platform_filter=platform_filter,
        browser_filter=browser_filter
    )
    
    # Save to file if output path is provided
    if output_path:
        try:
            with open(output_path, "w") as f:
                f.write(html)
                
            logger.info(f"Saved performance report to {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"Error saving report: {e}")
            return html
            
    return html


def record_inference_metrics(model_name: str,
                          platform: str,
                          inference_time_ms: float,
                          metrics_path: str,
                          browser: Optional[str] = None,
                          memory_mb: Optional[float] = None,
                          batch_size: int = 1,
                          details: Optional[Dict[str, Any]] = None) -> None:
    """
    Record inference metrics to file.
    
    Args:
        model_name: Name of the model
        platform: Platform used (webgpu, webnn, wasm)
        inference_time_ms: Inference time in milliseconds
        metrics_path: Path to metrics file
        browser: Optional browser used
        memory_mb: Optional memory usage in MB
        batch_size: Batch size used
        details: Additional details
    """
    # Load or create metrics collector
    metrics = MetricsCollector(storage_path=metrics_path)
    metrics.load_metrics()
    
    # Record inference metrics
    metrics.record_inference(
        model_name=model_name,
        platform=platform,
        inference_time_ms=inference_time_ms,
        batch_size=batch_size,
        browser=browser,
        memory_mb=memory_mb,
        details=details
    )
    
    # Save metrics
    metrics.save_metrics()
    
    logger.info(f"Recorded inference metrics for {model_name} on {platform}")