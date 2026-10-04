"""
WebGPU/WebNN Resource Pool Performance Trend Analyzer

This module provides tools for analyzing performance trends in the WebGPU/WebNN Resource Pool.
It enables identification of performance regressions, optimization opportunities, and browser-specific trends.

Features:
1. Time-series analysis of performance metrics
2. Identification of performance regressions 
3. Browser-specific performance trend analysis
4. Model-specific performance trend analysis
5. Recommendations for browser selection based on historical performance
6. Visualization capabilities for performance metrics
7. DuckDB integration for persistent storage

Usage:
    from fixed_web_platform.performance_trend_analyzer import PerformanceTrendAnalyzer

    # Create analyzer with DuckDB storage
    analyzer = PerformanceTrendAnalyzer(db_path="./benchmark_db.duckdb")
    
    # Record performance metrics
    analyzer.record_operation(
        browser_id="browser_1",
        browser_type="chrome",
        model_type="text",
        model_name="bert-base-uncased",
        operation_type="inference",
        duration_ms=120.5,
        success=True,
        metrics={"tokens_per_second": 450}
    )
    
    # Analyze trends for a specific model
    trends = analyzer.analyze_model_trends("bert-base-uncased")
    
    # Get browser recommendations based on historical performance
    recommendations = analyzer.get_browser_recommendations()
"""

import json
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple, Union

try:
    import duckdb
    import pandas as pd
    import numpy as np
    from scipy import stats
    HAVE_ANALYTICS_DEPS = True
except ImportError:
    HAVE_ANALYTICS_DEPS = False


class PerformanceMetricType(Enum):
    """Types of performance metrics that can be analyzed."""
    LATENCY = "latency"           # Time to process a single request (lower is better)
    THROUGHPUT = "throughput"     # Requests per second (higher is better)
    ERROR_RATE = "error_rate"     # Percentage of failed requests (lower is better)
    MEMORY = "memory"             # Memory usage (lower is better)
    LOADING_TIME = "loading_time" # Time to load model (lower is better)


class TrendDirection(Enum):
    """Directions that performance trends can take."""
    IMPROVING = "improving"       # Performance is getting better
    STABLE = "stable"             # Performance is stable
    DEGRADING = "degrading"       # Performance is getting worse


class RegressionSeverity(Enum):
    """Severity levels for performance regressions."""
    NONE = "none"             # No regression
    MINOR = "minor"           # Small regression, may be normal variation
    MODERATE = "moderate"     # Noticeable regression
    SEVERE = "severe"         # Major regression requiring attention
    CRITICAL = "critical"     # Critical regression requiring immediate action


@dataclass
class PerformanceRecord:
    """Record of a performance measurement."""
    id: str
    timestamp: float
    browser_id: str
    browser_type: str
    model_type: str
    model_name: str
    operation_type: str
    duration_ms: float
    success: bool
    error: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None


@dataclass
class TrendAnalysis:
    """Analysis of a performance trend."""
    metric_type: PerformanceMetricType
    direction: TrendDirection
    magnitude: float  # Normalized magnitude of trend (0.0-1.0)
    slope: float  # Raw slope of trend
    r_value: float  # Correlation coefficient (-1.0 to 1.0)
    p_value: float  # Statistical significance (lower is more significant)
    regression_severity: RegressionSeverity
    current_value: float  # Most recent value
    baseline_value: float  # Baseline value for comparison
    percent_change: float  # Percent change from baseline
    sample_count: int  # Number of samples used in analysis
    
    @property
    def is_statistically_significant(self) -> bool:
        """Check if the trend is statistically significant (p < 0.05)."""
        return self.p_value < 0.05 and abs(self.r_value) > 0.3


class PerformanceTrendAnalyzer:
    """
    Analyzer for performance trends in WebGPU/WebNN Resource Pool.
    
    Features:
    - Records operation performance metrics
    - Analyzes trends over time
    - Identifies regressions and improvements
    - Provides recommendations based on historical performance
    - Stores data in DuckDB for persistent storage
    """
    
    def __init__(
        self,
        db_path: Optional[str] = None,
        max_memory_records: int = 10000,
        logger: Optional[logging.Logger] = None
    ):
        self.logger = logger or logging.getLogger(__name__)
        self.db_path = db_path
        self.max_memory_records = max_memory_records
        
        # In-memory storage for performance records
        self.records: List[PerformanceRecord] = []
        
        # Browser and model statistics
        self.browser_stats: Dict[str, Dict[str, Any]] = {}
        self.model_stats: Dict[str, Dict[str, Any]] = {}
        
        # Recommendations cache
        self._recommendations_cache = {}
        self._recommendations_timestamp = 0
        
        # Initialize database if specified
        self.db_conn = None
        if db_path and HAVE_ANALYTICS_DEPS:
            self._initialize_db(db_path)
            
        self.logger.info(f"PerformanceTrendAnalyzer initialized (using {'DuckDB' if db_path else 'memory'} storage)")
    
    def _initialize_db(self, db_path: str):
        """Initialize DuckDB database."""
        try:
            self.db_conn = duckdb.connect(db_path)
            
            # Create tables if they don't exist
            self.db_conn.execute("""
                CREATE TABLE IF NOT EXISTS performance_records (
                    id VARCHAR PRIMARY KEY,
                    timestamp DOUBLE,
                    browser_id VARCHAR,
                    browser_type VARCHAR,
                    model_type VARCHAR,
                    model_name VARCHAR,
                    operation_type VARCHAR,
                    duration_ms DOUBLE,
                    success BOOLEAN,
                    error VARCHAR,
                    metrics JSON
                )
            """)
            
            self.db_conn.execute("""
                CREATE TABLE IF NOT EXISTS browser_stats (
                    browser_id VARCHAR PRIMARY KEY,
                    browser_type VARCHAR,
                    stats JSON,
                    last_updated DOUBLE
                )
            """)
            
            self.db_conn.execute("""
                CREATE TABLE IF NOT EXISTS model_stats (
                    model_name VARCHAR PRIMARY KEY,
                    model_type VARCHAR,
                    stats JSON,
                    last_updated DOUBLE
                )
            """)
            
            # Create indexes for performance
            self.db_conn.execute("CREATE INDEX IF NOT EXISTS idx_performance_records_timestamp ON performance_records(timestamp)")
            self.db_conn.execute("CREATE INDEX IF NOT EXISTS idx_performance_records_browser_id ON performance_records(browser_id)")
            self.db_conn.execute("CREATE INDEX IF NOT EXISTS idx_performance_records_model_name ON performance_records(model_name)")
            
            self.logger.info(f"DuckDB database initialized at {db_path}")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize DuckDB: {e}")
            self.db_conn = None
    
    def record_operation(
        self,
        browser_id: str,
        browser_type: str,
        model_type: str,
        model_name: str,
        operation_type: str,
        duration_ms: float,
        success: bool,
        error: Optional[str] = None,
        metrics: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Record a performance measurement.
        
        Args:
            browser_id: The browser ID
            browser_type: The browser type (chrome, firefox, edge, safari)
            model_type: The model type (text, vision, audio, etc.)
            model_name: The model name (bert-base-uncased, etc.)
            operation_type: The operation type (inference, embedding, etc.)
            duration_ms: The operation duration in milliseconds
            success: Whether the operation was successful
            error: The error message if the operation failed
            metrics: Additional metrics
            
        Returns:
            The ID of the record
        """
        record_id = str(uuid.uuid4())
        
        record = PerformanceRecord(
            id=record_id,
            timestamp=time.time(),
            browser_id=browser_id,
            browser_type=browser_type,
            model_type=model_type,
            model_name=model_name,
            operation_type=operation_type,
            duration_ms=duration_ms,
            success=success,
            error=error,
            metrics=metrics
        )
        
        # Store in memory
        self.records.append(record)
        
        # Limit memory usage
        if len(self.records) > self.max_memory_records:
            self.records = self.records[-self.max_memory_records:]
        
        # Store in database if available
        if self.db_conn:
            try:
                metrics_json = json.dumps(metrics) if metrics else None
                
                self.db_conn.execute("""
                    INSERT INTO performance_records 
                    (id, timestamp, browser_id, browser_type, model_type, model_name, 
                     operation_type, duration_ms, success, error, metrics)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record.id, record.timestamp, record.browser_id, record.browser_type,
                    record.model_type, record.model_name, record.operation_type,
                    record.duration_ms, record.success, record.error, metrics_json
                ))
                
                self.logger.debug(f"Recorded operation in database: {record.id}")
                
            except Exception as e:
                self.logger.error(f"Failed to record operation in database: {e}")
        
        # Update statistics
        self._update_browser_stats(record)
        self._update_model_stats(record)
        
        # Invalidate recommendations cache
        self._recommendations_cache = {}
        
        return record_id
    
    def _update_browser_stats(self, record: PerformanceRecord):
        """Update browser statistics with a new record."""
        browser_id = record.browser_id
        
        # Initialize if needed
        if browser_id not in self.browser_stats:
            self.browser_stats[browser_id] = {
                "browser_type": record.browser_type,
                "total_operations": 0,
                "successful_operations": 0,
                "failed_operations": 0,
                "total_duration_ms": 0,
                "operation_counts": {},
                "model_counts": {},
                "last_updated": time.time()
            }
        
        stats = self.browser_stats[browser_id]
        stats["total_operations"] += 1
        if record.success:
            stats["successful_operations"] += 1
            stats["total_duration_ms"] += record.duration_ms
        else:
            stats["failed_operations"] += 1
        
        # Update operation counts
        if record.operation_type not in stats["operation_counts"]:
            stats["operation_counts"][record.operation_type] = 0
        stats["operation_counts"][record.operation_type] += 1
        
        # Update model counts
        if record.model_name not in stats["model_counts"]:
            stats["model_counts"][record.model_name] = 0
        stats["model_counts"][record.model_name] += 1
        
        stats["last_updated"] = time.time()
        
        # Store in database if available
        if self.db_conn:
            try:
                self.db_conn.execute("""
                    INSERT OR REPLACE INTO browser_stats
                    (browser_id, browser_type, stats, last_updated)
                    VALUES (?, ?, ?, ?)
                """, (
                    browser_id,
                    record.browser_type,
                    json.dumps(stats),
                    stats["last_updated"]
                ))
            except Exception as e:
                self.logger.error(f"Failed to update browser stats in database: {e}")
    
    def _update_model_stats(self, record: PerformanceRecord):
        """Update model statistics with a new record."""
        model_name = record.model_name
        
        # Initialize if needed
        if model_name not in self.model_stats:
            self.model_stats[model_name] = {
                "model_type": record.model_type,
                "total_operations": 0,
                "successful_operations": 0,
                "failed_operations": 0,
                "total_duration_ms": 0,
                "browser_counts": {},
                "operation_counts": {},
                "last_updated": time.time()
            }
        
        stats = self.model_stats[model_name]
        stats["total_operations"] += 1
        if record.success:
            stats["successful_operations"] += 1
            stats["total_duration_ms"] += record.duration_ms
        else:
            stats["failed_operations"] += 1
        
        # Update browser counts
        if record.browser_type not in stats["browser_counts"]:
            stats["browser_counts"][record.browser_type] = 0
        stats["browser_counts"][record.browser_type] += 1
        
        # Update operation counts
        if record.operation_type not in stats["operation_counts"]:
            stats["operation_counts"][record.operation_type] = 0
        stats["operation_counts"][record.operation_type] += 1
        
        stats["last_updated"] = time.time()
        
        # Store in database if available
        if self.db_conn:
            try:
                self.db_conn.execute("""
                    INSERT OR REPLACE INTO model_stats
                    (model_name, model_type, stats, last_updated)
                    VALUES (?, ?, ?, ?)
                """, (
                    model_name,
                    record.model_type,
                    json.dumps(stats),
                    stats["last_updated"]
                ))
            except Exception as e:
                self.logger.error(f"Failed to update model stats in database: {e}")
    
    def get_records_for_model(
        self,
        model_name: str,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        operation_type: Optional[str] = None,
        browser_type: Optional[str] = None,
        success_only: bool = True
    ) -> List[PerformanceRecord]:
        """
        Get performance records for a specific model.
        
        Args:
            model_name: The model name
            start_time: Filter records after this time
            end_time: Filter records before this time
            operation_type: Filter by operation type
            browser_type: Filter by browser type
            success_only: Only include successful operations
            
        Returns:
            Matching performance records
        """
        if not start_time:
            start_time = 0
        if not end_time:
            end_time = time.time()
        
        # Check if we should use the database
        if self.db_conn:
            try:
                query = """
                    SELECT 
                        id, timestamp, browser_id, browser_type, model_type, model_name,
                        operation_type, duration_ms, success, error, metrics
                    FROM performance_records
                    WHERE model_name = ?
                      AND timestamp >= ?
                      AND timestamp <= ?
                """
                params = [model_name, start_time, end_time]
                
                if operation_type:
                    query += " AND operation_type = ?"
                    params.append(operation_type)
                
                if browser_type:
                    query += " AND browser_type = ?"
                    params.append(browser_type)
                
                if success_only:
                    query += " AND success = TRUE"
                
                query += " ORDER BY timestamp ASC"
                
                result = self.db_conn.execute(query, params).fetchall()
                
                records = []
                for row in result:
                    metrics = json.loads(row[10]) if row[10] else None
                    records.append(PerformanceRecord(
                        id=row[0],
                        timestamp=row[1],
                        browser_id=row[2],
                        browser_type=row[3],
                        model_type=row[4],
                        model_name=row[5],
                        operation_type=row[6],
                        duration_ms=row[7],
                        success=row[8],
                        error=row[9],
                        metrics=metrics
                    ))
                
                return records
                
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                # Fall back to in-memory records
        
        # Use in-memory records
        return [
            record for record in self.records
            if record.model_name == model_name
            and start_time <= record.timestamp <= end_time
            and (not operation_type or record.operation_type == operation_type)
            and (not browser_type or record.browser_type == browser_type)
            and (not success_only or record.success)
        ]
    
    def get_records_for_browser(
        self,
        browser_type: str,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        model_type: Optional[str] = None,
        operation_type: Optional[str] = None,
        success_only: bool = True
    ) -> List[PerformanceRecord]:
        """
        Get performance records for a specific browser type.
        
        Args:
            browser_type: The browser type
            start_time: Filter records after this time
            end_time: Filter records before this time
            model_type: Filter by model type
            operation_type: Filter by operation type
            success_only: Only include successful operations
            
        Returns:
            Matching performance records
        """
        if not start_time:
            start_time = 0
        if not end_time:
            end_time = time.time()
        
        # Check if we should use the database
        if self.db_conn:
            try:
                query = """
                    SELECT 
                        id, timestamp, browser_id, browser_type, model_type, model_name,
                        operation_type, duration_ms, success, error, metrics
                    FROM performance_records
                    WHERE browser_type = ?
                      AND timestamp >= ?
                      AND timestamp <= ?
                """
                params = [browser_type, start_time, end_time]
                
                if model_type:
                    query += " AND model_type = ?"
                    params.append(model_type)
                
                if operation_type:
                    query += " AND operation_type = ?"
                    params.append(operation_type)
                
                if success_only:
                    query += " AND success = TRUE"
                
                query += " ORDER BY timestamp ASC"
                
                result = self.db_conn.execute(query, params).fetchall()
                
                records = []
                for row in result:
                    metrics = json.loads(row[10]) if row[10] else None
                    records.append(PerformanceRecord(
                        id=row[0],
                        timestamp=row[1],
                        browser_id=row[2],
                        browser_type=row[3],
                        model_type=row[4],
                        model_name=row[5],
                        operation_type=row[6],
                        duration_ms=row[7],
                        success=row[8],
                        error=row[9],
                        metrics=metrics
                    ))
                
                return records
                
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                # Fall back to in-memory records
        
        # Use in-memory records
        return [
            record for record in self.records
            if record.browser_type == browser_type
            and start_time <= record.timestamp <= end_time
            and (not model_type or record.model_type == model_type)
            and (not operation_type or record.operation_type == operation_type)
            and (not success_only or record.success)
        ]
    
    def analyze_model_trends(
        self,
        model_name: str,
        time_window_days: float = 7.0,
        operation_type: Optional[str] = None,
        browser_type: Optional[str] = None
    ) -> Dict[str, TrendAnalysis]:
        """
        Analyze performance trends for a specific model.
        
        Args:
            model_name: The model name
            time_window_days: Time window in days to analyze
            operation_type: Filter by operation type
            browser_type: Filter by browser type
            
        Returns:
            Dictionary of trend analyses by metric type
        """
        if not HAVE_ANALYTICS_DEPS:
            self.logger.warning("Analytics dependencies not available, cannot analyze trends")
            return {}
            
        # Get records for the time window
        end_time = time.time()
        start_time = end_time - (time_window_days * 24 * 60 * 60)
        
        records = self.get_records_for_model(
            model_name=model_name,
            start_time=start_time,
            end_time=end_time,
            operation_type=operation_type,
            browser_type=browser_type,
            success_only=True
        )
        
        if not records:
            self.logger.info(f"No records found for model {model_name} in the specified time window")
            return {}
            
        # Convert to DataFrame for easier analysis
        df_data = []
        for record in records:
            row = {
                "timestamp": record.timestamp,
                "duration_ms": record.duration_ms,
                "browser_type": record.browser_type,
                "model_type": record.model_type,
                "operation_type": record.operation_type
            }
            
            # Add metrics if available
            if record.metrics:
                for key, value in record.metrics.items():
                    if isinstance(value, (int, float)):
                        row[key] = value
            
            df_data.append(row)
        
        df = pd.DataFrame(df_data)
        
        # Calculate error rate (not based on these records, since they're success_only)
        all_records = self.get_records_for_model(
            model_name=model_name,
            start_time=start_time,
            end_time=end_time,
            operation_type=operation_type,
            browser_type=browser_type,
            success_only=False
        )
        
        # Group by day for easier trend analysis
        df["date"] = pd.to_datetime(df["timestamp"], unit="s").dt.date
        daily_stats = df.groupby("date").agg(
            duration_ms_avg=("duration_ms", "mean"),
            duration_ms_p95=("duration_ms", lambda x: np.percentile(x, 95) if len(x) > 0 else np.nan),
            count=("duration_ms", "count")
        ).reset_index()
        
        # Calculate regression trendline for latency
        x = np.array(range(len(daily_stats)))
        if len(x) > 1:  # Need at least 2 points for regression
            y = daily_stats["duration_ms_avg"].values
            slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
            
            # Calculate baseline (oldest) and current (newest) values
            baseline_value = daily_stats["duration_ms_avg"].iloc[0]
            current_value = daily_stats["duration_ms_avg"].iloc[-1]
            
            # Calculate percent change
            percent_change = ((current_value - baseline_value) / baseline_value) * 100 if baseline_value > 0 else 0
            
            # Determine trend direction
            if abs(slope) < 0.01 * np.mean(y):
                direction = TrendDirection.STABLE
            elif slope < 0:
                direction = TrendDirection.IMPROVING
            else:
                direction = TrendDirection.DEGRADING
            
            # Determine regression severity
            severity = RegressionSeverity.NONE
            if direction == TrendDirection.DEGRADING:
                normalized_slope = slope / np.mean(y)
                abs_percent_change = abs(percent_change)
                
                if abs_percent_change < 5:
                    severity = RegressionSeverity.NONE
                elif abs_percent_change < 10:
                    severity = RegressionSeverity.MINOR
                elif abs_percent_change < 20:
                    severity = RegressionSeverity.MODERATE
                elif abs_percent_change < 30:
                    severity = RegressionSeverity.SEVERE
                else:
                    severity = RegressionSeverity.CRITICAL
            
            # Normalize magnitude to 0-1 scale
            magnitude = min(1.0, abs(slope) / (np.mean(y) * 0.5))
            
            # Create trend analysis for latency
            latency_trend = TrendAnalysis(
                metric_type=PerformanceMetricType.LATENCY,
                direction=direction,
                magnitude=magnitude,
                slope=slope,
                r_value=r_value,
                p_value=p_value,
                regression_severity=severity,
                current_value=current_value,
                baseline_value=baseline_value,
                percent_change=percent_change,
                sample_count=len(daily_stats)
            )
            
            # Calculate error rate trend if we have data
            if all_records:
                # Group all records by day and calculate error rate
                error_df = pd.DataFrame([
                    {"timestamp": record.timestamp, "success": record.success}
                    for record in all_records
                ])
                
                error_df["date"] = pd.to_datetime(error_df["timestamp"], unit="s").dt.date
                error_df["success_int"] = error_df["success"].astype(int)
                
                error_daily_stats = error_df.groupby("date").agg(
                    success_rate=("success_int", "mean"),
                    count=("success_int", "count")
                ).reset_index()
                
                error_daily_stats["error_rate"] = 1 - error_daily_stats["success_rate"]
                
                # Calculate regression for error rate
                xe = np.array(range(len(error_daily_stats)))
                if len(xe) > 1:
                    ye = error_daily_stats["error_rate"].values
                    e_slope, e_intercept, e_r_value, e_p_value, e_std_err = stats.linregress(xe, ye)
                    
                    # Calculate baseline and current values
                    e_baseline_value = error_daily_stats["error_rate"].iloc[0]
                    e_current_value = error_daily_stats["error_rate"].iloc[-1]
                    
                    # Calculate percent change
                    e_percent_change = ((e_current_value - e_baseline_value) / max(0.001, e_baseline_value)) * 100
                    
                    # Determine trend direction (for error rate, positive slope is degrading)
                    if abs(e_slope) < 0.01 * max(0.001, np.mean(ye)):
                        e_direction = TrendDirection.STABLE
                    elif e_slope < 0:
                        e_direction = TrendDirection.IMPROVING
                    else:
                        e_direction = TrendDirection.DEGRADING
                    
                    # Determine severity
                    e_severity = RegressionSeverity.NONE
                    if e_direction == TrendDirection.DEGRADING:
                        if e_current_value < 0.05:
                            e_severity = RegressionSeverity.NONE
                        elif e_current_value < 0.10:
                            e_severity = RegressionSeverity.MINOR
                        elif e_current_value < 0.15:
                            e_severity = RegressionSeverity.MODERATE
                        elif e_current_value < 0.25:
                            e_severity = RegressionSeverity.SEVERE
                        else:
                            e_severity = RegressionSeverity.CRITICAL
                    
                    # Normalize magnitude
                    e_magnitude = min(1.0, abs(e_slope) * 10)  # Error rate changes are often small
                    
                    # Create trend analysis for error rate
                    error_rate_trend = TrendAnalysis(
                        metric_type=PerformanceMetricType.ERROR_RATE,
                        direction=e_direction,
                        magnitude=e_magnitude,
                        slope=e_slope,
                        r_value=e_r_value,
                        p_value=e_p_value,
                        regression_severity=e_severity,
                        current_value=e_current_value,
                        baseline_value=e_baseline_value,
                        percent_change=e_percent_change,
                        sample_count=len(error_daily_stats)
                    )
                else:
                    error_rate_trend = None
            else:
                error_rate_trend = None
            
            # Return both trend analyses
            trends = {PerformanceMetricType.LATENCY.value: latency_trend}
            if error_rate_trend:
                trends[PerformanceMetricType.ERROR_RATE.value] = error_rate_trend
                
            return trends
            
        return {}
    
    def analyze_browser_trends(
        self,
        browser_type: str,
        time_window_days: float = 7.0,
        model_type: Optional[str] = None,
        operation_type: Optional[str] = None
    ) -> Dict[str, TrendAnalysis]:
        """
        Analyze performance trends for a specific browser type.
        
        Args:
            browser_type: The browser type
            time_window_days: Time window in days to analyze
            model_type: Filter by model type
            operation_type: Filter by operation type
            
        Returns:
            Dictionary of trend analyses by metric type
        """
        if not HAVE_ANALYTICS_DEPS:
            self.logger.warning("Analytics dependencies not available, cannot analyze trends")
            return {}
            
        # Get records for the time window
        end_time = time.time()
        start_time = end_time - (time_window_days * 24 * 60 * 60)
        
        records = self.get_records_for_browser(
            browser_type=browser_type,
            start_time=start_time,
            end_time=end_time,
            model_type=model_type,
            operation_type=operation_type,
            success_only=True
        )
        
        if not records:
            self.logger.info(f"No records found for browser {browser_type} in the specified time window")
            return {}
            
        # Convert to DataFrame for easier analysis
        df_data = []
        for record in records:
            row = {
                "timestamp": record.timestamp,
                "duration_ms": record.duration_ms,
                "model_name": record.model_name,
                "model_type": record.model_type,
                "operation_type": record.operation_type
            }
            
            # Add metrics if available
            if record.metrics:
                for key, value in record.metrics.items():
                    if isinstance(value, (int, float)):
                        row[key] = value
            
            df_data.append(row)
        
        df = pd.DataFrame(df_data)
        
        # Calculate error rate (not based on these records, since they're success_only)
        all_records = self.get_records_for_browser(
            browser_type=browser_type,
            start_time=start_time,
            end_time=end_time,
            model_type=model_type,
            operation_type=operation_type,
            success_only=False
        )
        
        # Group by day for easier trend analysis
        df["date"] = pd.to_datetime(df["timestamp"], unit="s").dt.date
        daily_stats = df.groupby("date").agg(
            duration_ms_avg=("duration_ms", "mean"),
            duration_ms_p95=("duration_ms", lambda x: np.percentile(x, 95) if len(x) > 0 else np.nan),
            count=("duration_ms", "count")
        ).reset_index()
        
        # Calculate throughput (operations per day)
        daily_stats["throughput"] = daily_stats["count"]
        
        # Calculate regression trendline for latency
        x = np.array(range(len(daily_stats)))
        if len(x) > 1:  # Need at least 2 points for regression
            # Analyze latency trend
            y_latency = daily_stats["duration_ms_avg"].values
            l_slope, l_intercept, l_r_value, l_p_value, l_std_err = stats.linregress(x, y_latency)
            
            # Calculate baseline and current values
            l_baseline_value = daily_stats["duration_ms_avg"].iloc[0]
            l_current_value = daily_stats["duration_ms_avg"].iloc[-1]
            
            # Calculate percent change
            l_percent_change = ((l_current_value - l_baseline_value) / l_baseline_value) * 100 if l_baseline_value > 0 else 0
            
            # Determine trend direction
            if abs(l_slope) < 0.01 * np.mean(y_latency):
                l_direction = TrendDirection.STABLE
            elif l_slope < 0:
                l_direction = TrendDirection.IMPROVING
            else:
                l_direction = TrendDirection.DEGRADING
            
            # Determine regression severity
            l_severity = RegressionSeverity.NONE
            if l_direction == TrendDirection.DEGRADING:
                l_abs_percent_change = abs(l_percent_change)
                
                if l_abs_percent_change < 5:
                    l_severity = RegressionSeverity.NONE
                elif l_abs_percent_change < 10:
                    l_severity = RegressionSeverity.MINOR
                elif l_abs_percent_change < 20:
                    l_severity = RegressionSeverity.MODERATE
                elif l_abs_percent_change < 30:
                    l_severity = RegressionSeverity.SEVERE
                else:
                    l_severity = RegressionSeverity.CRITICAL
            
            # Normalize magnitude to 0-1 scale
            l_magnitude = min(1.0, abs(l_slope) / (np.mean(y_latency) * 0.5))
            
            # Create trend analysis for latency
            latency_trend = TrendAnalysis(
                metric_type=PerformanceMetricType.LATENCY,
                direction=l_direction,
                magnitude=l_magnitude,
                slope=l_slope,
                r_value=l_r_value,
                p_value=l_p_value,
                regression_severity=l_severity,
                current_value=l_current_value,
                baseline_value=l_baseline_value,
                percent_change=l_percent_change,
                sample_count=len(daily_stats)
            )
            
            # Analyze throughput trend
            if len(daily_stats) > 1:
                y_throughput = daily_stats["throughput"].values
                t_slope, t_intercept, t_r_value, t_p_value, t_std_err = stats.linregress(x, y_throughput)
                
                # Calculate baseline and current values
                t_baseline_value = daily_stats["throughput"].iloc[0]
                t_current_value = daily_stats["throughput"].iloc[-1]
                
                # Calculate percent change
                t_percent_change = ((t_current_value - t_baseline_value) / t_baseline_value) * 100 if t_baseline_value > 0 else 0
                
                # Determine trend direction (for throughput, negative slope is degrading)
                if abs(t_slope) < 0.01 * np.mean(y_throughput):
                    t_direction = TrendDirection.STABLE
                elif t_slope > 0:
                    t_direction = TrendDirection.IMPROVING
                else:
                    t_direction = TrendDirection.DEGRADING
                
                # Determine regression severity
                t_severity = RegressionSeverity.NONE
                if t_direction == TrendDirection.DEGRADING:
                    t_abs_percent_change = abs(t_percent_change)
                    
                    if t_abs_percent_change < 5:
                        t_severity = RegressionSeverity.NONE
                    elif t_abs_percent_change < 10:
                        t_severity = RegressionSeverity.MINOR
                    elif t_abs_percent_change < 20:
                        t_severity = RegressionSeverity.MODERATE
                    elif t_abs_percent_change < 30:
                        t_severity = RegressionSeverity.SEVERE
                    else:
                        t_severity = RegressionSeverity.CRITICAL
                
                # Normalize magnitude
                t_magnitude = min(1.0, abs(t_slope) / (np.mean(y_throughput) * 0.5))
                
                # Create trend analysis for throughput
                throughput_trend = TrendAnalysis(
                    metric_type=PerformanceMetricType.THROUGHPUT,
                    direction=t_direction,
                    magnitude=t_magnitude,
                    slope=t_slope,
                    r_value=t_r_value,
                    p_value=t_p_value,
                    regression_severity=t_severity,
                    current_value=t_current_value,
                    baseline_value=t_baseline_value,
                    percent_change=t_percent_change,
                    sample_count=len(daily_stats)
                )
            else:
                throughput_trend = None
            
            # Calculate error rate trend if we have data
            if all_records:
                # Group all records by day and calculate error rate
                error_df = pd.DataFrame([
                    {"timestamp": record.timestamp, "success": record.success}
                    for record in all_records
                ])
                
                error_df["date"] = pd.to_datetime(error_df["timestamp"], unit="s").dt.date
                error_df["success_int"] = error_df["success"].astype(int)
                
                error_daily_stats = error_df.groupby("date").agg(
                    success_rate=("success_int", "mean"),
                    count=("success_int", "count")
                ).reset_index()
                
                error_daily_stats["error_rate"] = 1 - error_daily_stats["success_rate"]
                
                # Calculate regression for error rate
                xe = np.array(range(len(error_daily_stats)))
                if len(xe) > 1:
                    ye = error_daily_stats["error_rate"].values
                    e_slope, e_intercept, e_r_value, e_p_value, e_std_err = stats.linregress(xe, ye)
                    
                    # Calculate baseline and current values
                    e_baseline_value = error_daily_stats["error_rate"].iloc[0]
                    e_current_value = error_daily_stats["error_rate"].iloc[-1]
                    
                    # Calculate percent change
                    e_percent_change = ((e_current_value - e_baseline_value) / max(0.001, e_baseline_value)) * 100
                    
                    # Determine trend direction (for error rate, positive slope is degrading)
                    if abs(e_slope) < 0.01 * max(0.001, np.mean(ye)):
                        e_direction = TrendDirection.STABLE
                    elif e_slope < 0:
                        e_direction = TrendDirection.IMPROVING
                    else:
                        e_direction = TrendDirection.DEGRADING
                    
                    # Determine severity
                    e_severity = RegressionSeverity.NONE
                    if e_direction == TrendDirection.DEGRADING:
                        if e_current_value < 0.05:
                            e_severity = RegressionSeverity.NONE
                        elif e_current_value < 0.10:
                            e_severity = RegressionSeverity.MINOR
                        elif e_current_value < 0.15:
                            e_severity = RegressionSeverity.MODERATE
                        elif e_current_value < 0.25:
                            e_severity = RegressionSeverity.SEVERE
                        else:
                            e_severity = RegressionSeverity.CRITICAL
                    
                    # Normalize magnitude
                    e_magnitude = min(1.0, abs(e_slope) * 10)  # Error rate changes are often small
                    
                    # Create trend analysis for error rate
                    error_rate_trend = TrendAnalysis(
                        metric_type=PerformanceMetricType.ERROR_RATE,
                        direction=e_direction,
                        magnitude=e_magnitude,
                        slope=e_slope,
                        r_value=e_r_value,
                        p_value=e_p_value,
                        regression_severity=e_severity,
                        current_value=e_current_value,
                        baseline_value=e_baseline_value,
                        percent_change=e_percent_change,
                        sample_count=len(error_daily_stats)
                    )
                else:
                    error_rate_trend = None
            else:
                error_rate_trend = None
            
            # Return all trend analyses
            trends = {PerformanceMetricType.LATENCY.value: latency_trend}
            if throughput_trend:
                trends[PerformanceMetricType.THROUGHPUT.value] = throughput_trend
            if error_rate_trend:
                trends[PerformanceMetricType.ERROR_RATE.value] = error_rate_trend
                
            return trends
            
        return {}
    
    def get_browser_recommendations(
        self,
        time_window_days: float = 7.0,
        min_sample_size: int = 5,
        force_refresh: bool = False
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get recommendations for the best browser to use for each model type.
        
        Args:
            time_window_days: Time window in days to analyze
            min_sample_size: Minimum number of samples required for a recommendation
            force_refresh: Force refresh of recommendations cache
            
        Returns:
            Dictionary of browser recommendations by model type
        """
        # Check if we have a recent cached result
        cache_max_age = 60 * 60  # 1 hour
        if (not force_refresh and self._recommendations_cache and 
            time.time() - self._recommendations_timestamp < cache_max_age):
            return self._recommendations_cache
        
        if not HAVE_ANALYTICS_DEPS:
            self.logger.warning("Analytics dependencies not available, cannot analyze trends")
            return {}
        
        # Get records for the time window
        end_time = time.time()
        start_time = end_time - (time_window_days * 24 * 60 * 60)
        
        # Collect all records (either from memory or database)
        if self.db_conn:
            try:
                query = """
                    SELECT 
                        browser_type, model_type, model_name, operation_type, duration_ms, success
                    FROM performance_records
                    WHERE timestamp >= ?
                      AND timestamp <= ?
                      AND success = TRUE
                """
                result = self.db_conn.execute(query, [start_time, end_time]).fetchall()
                
                # Convert to DataFrame
                df = pd.DataFrame(result, columns=[
                    "browser_type", "model_type", "model_name", "operation_type", "duration_ms", "success"
                ])
                
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                # Fall back to in-memory records
                records = [r for r in self.records if r.success and start_time <= r.timestamp <= end_time]
                
                if not records:
                    return {}
                
                # Convert to DataFrame
                df = pd.DataFrame([
                    {
                        "browser_type": r.browser_type,
                        "model_type": r.model_type,
                        "model_name": r.model_name,
                        "operation_type": r.operation_type,
                        "duration_ms": r.duration_ms,
                        "success": r.success
                    }
                    for r in records
                ])
        else:
            # Use in-memory records
            records = [r for r in self.records if r.success and start_time <= r.timestamp <= end_time]
            
            if not records:
                return {}
            
            # Convert to DataFrame
            df = pd.DataFrame([
                {
                    "browser_type": r.browser_type,
                    "model_type": r.model_type,
                    "model_name": r.model_name,
                    "operation_type": r.operation_type,
                    "duration_ms": r.duration_ms,
                    "success": r.success
                }
                for r in records
            ])
        
        if df.empty:
            return {}
        
        # Group by model type and browser type
        model_type_browser_stats = df.groupby(["model_type", "browser_type"]).agg(
            avg_duration=("duration_ms", "mean"),
            min_duration=("duration_ms", "min"),
            max_duration=("duration_ms", "max"),
            count=("duration_ms", "count")
        ).reset_index()
        
        # Filter by minimum sample size
        model_type_browser_stats = model_type_browser_stats[model_type_browser_stats["count"] >= min_sample_size]
        
        # Find the best browser for each model type
        recommendations = {}
        for model_type in model_type_browser_stats["model_type"].unique():
            model_stats = model_type_browser_stats[model_type_browser_stats["model_type"] == model_type]
            
            if model_stats.empty:
                continue
                
            # Sort by average duration (lowest first)
            model_stats = model_stats.sort_values("avg_duration")
            
            best_browser = model_stats.iloc[0]
            
            # Calculate confidence based on sample size and performance difference
            sample_size_factor = min(1.0, best_browser["count"] / 20)
            
            # If we have multiple browsers, compare the best to the second best
            if len(model_stats) > 1:
                second_best = model_stats.iloc[1]
                performance_diff = (second_best["avg_duration"] - best_browser["avg_duration"]) / second_best["avg_duration"]
                performance_factor = min(1.0, performance_diff * 5)  # Scale up for small differences
            else:
                performance_factor = 0.5  # Medium confidence if only one browser
                
            confidence = sample_size_factor * (0.5 + 0.5 * performance_factor)
            
            # Calculate percent better than average
            avg_duration = model_stats["avg_duration"].mean()
            percent_better = ((avg_duration - best_browser["avg_duration"]) / avg_duration) * 100
            
            # Add recommendation
            recommendations[model_type] = {
                "recommended_browser": best_browser["browser_type"],
                "avg_duration_ms": best_browser["avg_duration"],
                "sample_count": best_browser["count"],
                "confidence": confidence,
                "percent_better_than_avg": percent_better,
                "all_browsers": [
                    {
                        "browser_type": row["browser_type"],
                        "avg_duration_ms": row["avg_duration"],
                        "sample_count": row["count"]
                    }
                    for _, row in model_stats.iterrows()
                ]
            }
        
        # Add special recommendation for "any" model type
        if len(recommendations) > 0:
            # Calculate overall stats for each browser
            browser_stats = df.groupby("browser_type").agg(
                avg_duration=("duration_ms", "mean"),
                count=("duration_ms", "count")
            ).reset_index()
            
            browser_stats = browser_stats[browser_stats["count"] >= min_sample_size]
            
            if not browser_stats.empty:
                # Sort by average duration
                browser_stats = browser_stats.sort_values("avg_duration")
                
                best_overall = browser_stats.iloc[0]
                
                # Calculate confidence
                sample_size_factor = min(1.0, best_overall["count"] / 50)
                
                # If we have multiple browsers, compare the best to the second best
                if len(browser_stats) > 1:
                    second_best = browser_stats.iloc[1]
                    performance_diff = (second_best["avg_duration"] - best_overall["avg_duration"]) / second_best["avg_duration"]
                    performance_factor = min(1.0, performance_diff * 5)
                else:
                    performance_factor = 0.5
                    
                confidence = sample_size_factor * (0.5 + 0.5 * performance_factor)
                
                # Calculate percent better than average
                avg_duration = browser_stats["avg_duration"].mean()
                percent_better = ((avg_duration - best_overall["avg_duration"]) / avg_duration) * 100
                
                # Add recommendation
                recommendations["any"] = {
                    "recommended_browser": best_overall["browser_type"],
                    "avg_duration_ms": best_overall["avg_duration"],
                    "sample_count": best_overall["count"],
                    "confidence": confidence,
                    "percent_better_than_avg": percent_better,
                    "all_browsers": [
                        {
                            "browser_type": row["browser_type"],
                            "avg_duration_ms": row["avg_duration"],
                            "sample_count": row["count"]
                        }
                        for _, row in browser_stats.iterrows()
                    ]
                }
        
        # Cache the results
        self._recommendations_cache = recommendations
        self._recommendations_timestamp = time.time()
        
        return recommendations
    
    def get_model_type_overview(self, time_window_days: float = 7.0) -> Dict[str, Dict[str, Any]]:
        """
        Get an overview of performance metrics for each model type.
        
        Args:
            time_window_days: Time window in days to analyze
            
        Returns:
            Dictionary of performance metrics by model type
        """
        # Get records for the time window
        end_time = time.time()
        start_time = end_time - (time_window_days * 24 * 60 * 60)
        
        # Collect all records (either from memory or database)
        if self.db_conn:
            try:
                query = """
                    SELECT 
                        model_type, duration_ms, success
                    FROM performance_records
                    WHERE timestamp >= ?
                      AND timestamp <= ?
                """
                result = self.db_conn.execute(query, [start_time, end_time]).fetchall()
                
                # Convert to DataFrame
                df = pd.DataFrame(result, columns=["model_type", "duration_ms", "success"])
                
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                # Fall back to in-memory records
                records = [r for r in self.records if start_time <= r.timestamp <= end_time]
                
                if not records:
                    return {}
                
                # Convert to DataFrame
                df = pd.DataFrame([
                    {
                        "model_type": r.model_type,
                        "duration_ms": r.duration_ms,
                        "success": r.success
                    }
                    for r in records
                ])
        else:
            # Use in-memory records
            records = [r for r in self.records if start_time <= r.timestamp <= end_time]
            
            if not records:
                return {}
            
            # Convert to DataFrame
            df = pd.DataFrame([
                {
                    "model_type": r.model_type,
                    "duration_ms": r.duration_ms,
                    "success": r.success
                }
                for r in records
            ])
        
        if df.empty:
            return {}
        
        # Group by model type
        model_type_stats = df.groupby("model_type").agg(
            avg_duration=("duration_ms", "mean"),
            min_duration=("duration_ms", "min"),
            max_duration=("duration_ms", "max"),
            total_count=("duration_ms", "count"),
            success_rate=("success", "mean")
        ).reset_index()
        
        # Add error rate
        model_type_stats["error_rate"] = 1 - model_type_stats["success_rate"]
        
        # Create overview dictionary
        overview = {}
        for _, row in model_type_stats.iterrows():
            overview[row["model_type"]] = {
                "avg_latency_ms": row["avg_duration"],
                "min_latency_ms": row["min_duration"],
                "max_latency_ms": row["max_duration"],
                "operation_count": row["total_count"],
                "success_rate": row["success_rate"],
                "error_rate": row["error_rate"]
            }
        
        return overview
    
    def get_browser_type_overview(self, time_window_days: float = 7.0) -> Dict[str, Dict[str, Any]]:
        """
        Get an overview of performance metrics for each browser type.
        
        Args:
            time_window_days: Time window in days to analyze
            
        Returns:
            Dictionary of performance metrics by browser type
        """
        # Get records for the time window
        end_time = time.time()
        start_time = end_time - (time_window_days * 24 * 60 * 60)
        
        # Collect all records (either from memory or database)
        if self.db_conn:
            try:
                query = """
                    SELECT 
                        browser_type, duration_ms, success
                    FROM performance_records
                    WHERE timestamp >= ?
                      AND timestamp <= ?
                """
                result = self.db_conn.execute(query, [start_time, end_time]).fetchall()
                
                # Convert to DataFrame
                df = pd.DataFrame(result, columns=["browser_type", "duration_ms", "success"])
                
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                # Fall back to in-memory records
                records = [r for r in self.records if start_time <= r.timestamp <= end_time]
                
                if not records:
                    return {}
                
                # Convert to DataFrame
                df = pd.DataFrame([
                    {
                        "browser_type": r.browser_type,
                        "duration_ms": r.duration_ms,
                        "success": r.success
                    }
                    for r in records
                ])
        else:
            # Use in-memory records
            records = [r for r in self.records if start_time <= r.timestamp <= end_time]
            
            if not records:
                return {}
            
            # Convert to DataFrame
            df = pd.DataFrame([
                {
                    "browser_type": r.browser_type,
                    "duration_ms": r.duration_ms,
                    "success": r.success
                }
                for r in records
            ])
        
        if df.empty:
            return {}
        
        # Group by browser type
        browser_type_stats = df.groupby("browser_type").agg(
            avg_duration=("duration_ms", "mean"),
            min_duration=("duration_ms", "min"),
            max_duration=("duration_ms", "max"),
            total_count=("duration_ms", "count"),
            success_rate=("success", "mean")
        ).reset_index()
        
        # Add error rate
        browser_type_stats["error_rate"] = 1 - browser_type_stats["success_rate"]
        
        # Create overview dictionary
        overview = {}
        for _, row in browser_type_stats.iterrows():
            overview[row["browser_type"]] = {
                "avg_latency_ms": row["avg_duration"],
                "min_latency_ms": row["min_duration"],
                "max_latency_ms": row["max_duration"],
                "operation_count": row["total_count"],
                "success_rate": row["success_rate"],
                "error_rate": row["error_rate"]
            }
        
        return overview
    
    def detect_regressions(
        self,
        time_window_days: float = 7.0,
        threshold_pct: float = 10.0
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Detect performance regressions across all models and browsers.
        
        Args:
            time_window_days: Time window in days to analyze
            threshold_pct: Threshold percentage change to consider as regression
            
        Returns:
            Dictionary of regressions by severity
        """
        # Get all model names from records
        model_names = set()
        browser_types = set()
        
        if self.db_conn:
            try:
                query_models = "SELECT DISTINCT model_name FROM performance_records"
                result_models = self.db_conn.execute(query_models).fetchall()
                model_names = {row[0] for row in result_models}
                
                query_browsers = "SELECT DISTINCT browser_type FROM performance_records"
                result_browsers = self.db_conn.execute(query_browsers).fetchall()
                browser_types = {row[0] for row in result_browsers}
                
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                # Fall back to in-memory records
                model_names = {r.model_name for r in self.records}
                browser_types = {r.browser_type for r in self.records}
        else:
            # Use in-memory records
            model_names = {r.model_name for r in self.records}
            browser_types = {r.browser_type for r in self.records}
        
        # Analyze trends for each model
        regressions = {
            "critical": [],
            "severe": [],
            "moderate": [],
            "minor": []
        }
        
        for model_name in model_names:
            model_trends = self.analyze_model_trends(
                model_name=model_name,
                time_window_days=time_window_days
            )
            
            for metric_type, trend in model_trends.items():
                if (trend.direction == TrendDirection.DEGRADING and 
                   trend.regression_severity != RegressionSeverity.NONE and
                   abs(trend.percent_change) >= threshold_pct and
                   trend.sample_count >= 3):
                    
                    regression_data = {
                        "model_name": model_name,
                        "metric_type": metric_type,
                        "percent_change": trend.percent_change,
                        "current_value": trend.current_value,
                        "baseline_value": trend.baseline_value,
                        "sample_count": trend.sample_count,
                        "severity": trend.regression_severity.value,
                        "detection_time": time.time()
                    }
                    
                    # Add to appropriate severity list
                    regressions[trend.regression_severity.value].append(regression_data)
        
        # Analyze trends for each browser type
        for browser_type in browser_types:
            browser_trends = self.analyze_browser_trends(
                browser_type=browser_type,
                time_window_days=time_window_days
            )
            
            for metric_type, trend in browser_trends.items():
                if (trend.direction == TrendDirection.DEGRADING and 
                   trend.regression_severity != RegressionSeverity.NONE and
                   abs(trend.percent_change) >= threshold_pct and
                   trend.sample_count >= 3):
                    
                    regression_data = {
                        "browser_type": browser_type,
                        "metric_type": metric_type,
                        "percent_change": trend.percent_change,
                        "current_value": trend.current_value,
                        "baseline_value": trend.baseline_value,
                        "sample_count": trend.sample_count,
                        "severity": trend.regression_severity.value,
                        "detection_time": time.time()
                    }
                    
                    # Add to appropriate severity list
                    regressions[trend.regression_severity.value].append(regression_data)
        
        return regressions
    
    def get_comprehensive_report(self, time_window_days: float = 7.0) -> Dict[str, Any]:
        """
        Get a comprehensive report of performance metrics and trends.
        
        Args:
            time_window_days: Time window in days to analyze
            
        Returns:
            Dictionary with comprehensive report
        """
        # Model type overview
        model_type_overview = self.get_model_type_overview(time_window_days)
        
        # Browser type overview
        browser_type_overview = self.get_browser_type_overview(time_window_days)
        
        # Browser recommendations
        browser_recommendations = self.get_browser_recommendations(time_window_days)
        
        # Regressions
        regressions = self.detect_regressions(time_window_days)
        
        # Sample trends for key model types
        model_type_trends = {}
        for model_type in model_type_overview:
            # Get a representative model for this type
            if self.db_conn:
                try:
                    query = """
                        SELECT model_name, COUNT(*) as count
                        FROM performance_records
                        WHERE model_type = ?
                        GROUP BY model_name
                        ORDER BY count DESC
                        LIMIT 1
                    """
                    result = self.db_conn.execute(query, [model_type]).fetchone()
                    if result:
                        model_name = result[0]
                        model_trends = self.analyze_model_trends(model_name, time_window_days)
                        
                        if model_trends:
                            model_type_trends[model_type] = {
                                "model_name": model_name,
                                "trends": {
                                    metric_type: {
                                        "direction": trend.direction.value,
                                        "magnitude": trend.magnitude,
                                        "regression_severity": trend.regression_severity.value,
                                        "percent_change": trend.percent_change,
                                        "current_value": trend.current_value,
                                        "baseline_value": trend.baseline_value,
                                        "sample_count": trend.sample_count
                                    }
                                    for metric_type, trend in model_trends.items()
                                }
                            }
                except Exception as e:
                    self.logger.error(f"Failed to query database: {e}")
            else:
                # Use in-memory records
                model_counts = {}
                for record in self.records:
                    if record.model_type == model_type:
                        if record.model_name not in model_counts:
                            model_counts[record.model_name] = 0
                        model_counts[record.model_name] += 1
                
                if model_counts:
                    model_name = max(model_counts.items(), key=lambda x: x[1])[0]
                    model_trends = self.analyze_model_trends(model_name, time_window_days)
                    
                    if model_trends:
                        model_type_trends[model_type] = {
                            "model_name": model_name,
                            "trends": {
                                metric_type: {
                                    "direction": trend.direction.value,
                                    "magnitude": trend.magnitude,
                                    "regression_severity": trend.regression_severity.value,
                                    "percent_change": trend.percent_change,
                                    "current_value": trend.current_value,
                                    "baseline_value": trend.baseline_value,
                                    "sample_count": trend.sample_count
                                }
                                for metric_type, trend in model_trends.items()
                            }
                        }
        
        # Browser trends
        browser_trends = {}
        for browser_type in browser_type_overview:
            trends = self.analyze_browser_trends(browser_type, time_window_days)
            if trends:
                browser_trends[browser_type] = {
                    metric_type: {
                        "direction": trend.direction.value,
                        "magnitude": trend.magnitude,
                        "regression_severity": trend.regression_severity.value,
                        "percent_change": trend.percent_change,
                        "current_value": trend.current_value,
                        "baseline_value": trend.baseline_value,
                        "sample_count": trend.sample_count
                    }
                    for metric_type, trend in trends.items()
                }
        
        # Count records
        record_count = 0
        if self.db_conn:
            try:
                query = "SELECT COUNT(*) FROM performance_records"
                result = self.db_conn.execute(query).fetchone()
                record_count = result[0]
            except Exception as e:
                self.logger.error(f"Failed to query database: {e}")
                record_count = len(self.records)
        else:
            record_count = len(self.records)
        
        # Return comprehensive report
        return {
            "timestamp": time.time(),
            "time_window_days": time_window_days,
            "record_count": record_count,
            "model_types": model_type_overview,
            "browser_types": browser_type_overview,
            "recommendations": browser_recommendations,
            "regressions": regressions,
            "model_type_trends": model_type_trends,
            "browser_trends": browser_trends,
            "storage_type": "duckdb" if self.db_conn else "memory"
        }
    
    def close(self):
        """Close the database connection if open."""
        if self.db_conn:
            self.db_conn.close()
            self.db_conn = None
            self.logger.info("Database connection closed")
    
    def __del__(self):
        """Close the database connection when the object is deleted."""
        self.close()