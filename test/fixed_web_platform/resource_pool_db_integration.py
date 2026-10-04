#!/usr/bin/env python3
"""
Resource Pool Database Integration for WebNN/WebGPU 

This module provides comprehensive DuckDB integration for the WebGPU/WebNN Resource Pool,
enabling efficient storage, analysis, and visualization of performance metrics and browser
capabilities.

Key features:
- Database integration for WebGPU/WebNN resource pool
- Performance metrics storage and analysis
- Browser capability tracking and comparison
- Time-series analysis for performance trends
- Memory and resource usage tracking
- Connection metrics and utilization tracking
- Comprehensive performance visualization

This implementation completes the Database Integration component (10%)
of the WebGPU/WebNN Resource Pool Integration.
"""

import os
import sys
import json
import time
import datetime
import logging
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('ResourcePoolDBIntegration')

# Check for DuckDB dependency
try:
    import duckdb
    DUCKDB_AVAILABLE = True
except ImportError:
    logger.warning("DuckDB not available. Install with: pip install duckdb")
    DUCKDB_AVAILABLE = False

# Check for pandas for data analysis
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    logger.warning("Pandas not available. Install with: pip install pandas")
    PANDAS_AVAILABLE = False

# Check for plotting libraries for visualization
try:
    import matplotlib.pyplot as plt
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    logger.warning("Matplotlib not available. Install with: pip install matplotlib")
    MATPLOTLIB_AVAILABLE = False

class ResourcePoolDBIntegration:
    """
    Database integration for WebGPU/WebNN resource pool with comprehensive
    metrics storage, analysis, and visualization capabilities.
    """
    
    def __init__(self, db_path: Optional[str] = None, create_tables: bool = True,
                schema_version: str = "1.0"):
        """
        Initialize database integration.
        
        Args:
            db_path: Path to DuckDB database or None for environment variable or default
            create_tables: Whether to create tables if they don't exist
            schema_version: Schema version to use
        """
        self.schema_version = schema_version
        self.connection = None
        self.initialized = False
        
        # Determine database path
        if db_path is None:
            # Check environment variable
            db_path = os.environ.get("BENCHMARK_DB_PATH")
            
            # Fall back to default if environment variable not set
            if not db_path:
                db_path = "benchmark_db.duckdb"
        
        self.db_path = db_path
        logger.info(f"Using database: {self.db_path}")
        
        # Initialize database
        if create_tables:
            self.initialize()
    
    def initialize(self) -> bool:
        """
        Initialize database connection and create tables if needed.
        
        Returns:
            True if initialization was successful, False otherwise
        """
        if not DUCKDB_AVAILABLE:
            logger.error("Cannot initialize database: DuckDB not available")
            return False
        
        try:
            # Connect to database
            self.connection = duckdb.connect(self.db_path)
            
            # Create tables if they don't exist
            self._create_tables()
            
            self.initialized = True
            logger.info(f"Database initialized with schema version {self.schema_version}")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            traceback.print_exc()
            return False
    
    def _create_tables(self):
        """Create database tables if they don't exist."""
        if not self.connection:
            return
        
        try:
            # Create browser_connections table
            self.connection.execute("""
            CREATE TABLE IF NOT EXISTS browser_connections (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                connection_id VARCHAR,
                browser VARCHAR,
                platform VARCHAR,
                startup_time_seconds FLOAT,
                connection_duration_seconds FLOAT,
                is_simulation BOOLEAN DEFAULT FALSE,
                adapter_info JSON,
                browser_info JSON,
                features JSON
            )
            """)
            
            # Create webnn_webgpu_performance table
            self.connection.execute("""
            CREATE TABLE IF NOT EXISTS webnn_webgpu_performance (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                connection_id VARCHAR,
                model_name VARCHAR,
                model_type VARCHAR,
                platform VARCHAR,
                browser VARCHAR,
                is_real_hardware BOOLEAN,
                compute_shader_optimized BOOLEAN,
                precompile_shaders BOOLEAN,
                parallel_loading BOOLEAN,
                mixed_precision BOOLEAN,
                precision_bits INTEGER,
                initialization_time_ms FLOAT,
                inference_time_ms FLOAT,
                memory_usage_mb FLOAT,
                throughput_items_per_second FLOAT,
                latency_ms FLOAT,
                batch_size INTEGER DEFAULT 1,
                adapter_info JSON,
                model_info JSON,
                simulation_mode BOOLEAN DEFAULT FALSE
            )
            """)
            
            # Create resource_pool_metrics table
            self.connection.execute("""
            CREATE TABLE IF NOT EXISTS resource_pool_metrics (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                pool_size INTEGER,
                active_connections INTEGER,
                total_connections INTEGER,
                connection_utilization FLOAT,
                browser_distribution JSON,
                platform_distribution JSON,
                model_distribution JSON,
                scaling_event BOOLEAN DEFAULT FALSE,
                scaling_reason VARCHAR,
                messages_sent INTEGER,
                messages_received INTEGER,
                errors INTEGER,
                system_memory_percent FLOAT,
                process_memory_mb FLOAT
            )
            """)
            
            # Create time_series_performance table for tracking performance over time
            self.connection.execute("""
            CREATE TABLE IF NOT EXISTS time_series_performance (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                model_name VARCHAR,
                model_type VARCHAR,
                platform VARCHAR,
                browser VARCHAR,
                batch_size INTEGER DEFAULT 1,
                throughput_items_per_second FLOAT,
                latency_ms FLOAT,
                memory_usage_mb FLOAT,
                git_commit VARCHAR,
                git_branch VARCHAR,
                system_info JSON,
                test_params JSON,
                notes VARCHAR
            )
            """)
            
            # Create performance_regression table for tracking regressions
            self.connection.execute("""
            CREATE TABLE IF NOT EXISTS performance_regression (
                id INTEGER PRIMARY KEY,
                timestamp TIMESTAMP,
                model_name VARCHAR,
                metric VARCHAR,
                previous_value FLOAT,
                current_value FLOAT,
                change_percent FLOAT,
                regression_type VARCHAR,
                severity VARCHAR,
                detected_by VARCHAR,
                status VARCHAR DEFAULT 'open',
                notes VARCHAR
            )
            """)
            
            # Create indexes for faster queries
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_perf_model_name ON webnn_webgpu_performance(model_name)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_perf_platform ON webnn_webgpu_performance(platform)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_perf_browser ON webnn_webgpu_performance(browser)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_perf_timestamp ON webnn_webgpu_performance(timestamp)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_browser_conn_timestamp ON browser_connections(timestamp)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON resource_pool_metrics(timestamp)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_ts_perf_model_name ON time_series_performance(model_name)")
            self.connection.execute("CREATE INDEX IF NOT EXISTS idx_ts_perf_timestamp ON time_series_performance(timestamp)")
            
            logger.info("Database tables created or verified")
            
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            traceback.print_exc()
    
    def store_browser_connection(self, connection_data: Dict[str, Any]) -> bool:
        """
        Store browser connection information in database.
        
        Args:
            connection_data: Dict with connection information
            
        Returns:
            True if data stored successfully, False otherwise
        """
        if not self.initialized or not self.connection:
            logger.error("Cannot store connection data: Database not initialized")
            return False
        
        try:
            # Parse input data
            timestamp = connection_data.get('timestamp', datetime.datetime.now())
            if isinstance(timestamp, (int, float)):
                timestamp = datetime.datetime.fromtimestamp(timestamp)
            
            connection_id = connection_data.get('connection_id', '')
            browser = connection_data.get('browser', '')
            platform = connection_data.get('platform', '')
            startup_time = connection_data.get('startup_time', 0.0)
            duration = connection_data.get('duration', 0.0)
            is_simulation = connection_data.get('is_simulation', False)
            
            # Serialize JSON data
            adapter_info = json.dumps(connection_data.get('adapter_info', {}))
            browser_info = json.dumps(connection_data.get('browser_info', {}))
            features = json.dumps(connection_data.get('features', {}))
            
            # Store in database
            self.connection.execute("""
            INSERT INTO browser_connections (
                timestamp, connection_id, browser, platform, startup_time_seconds,
                connection_duration_seconds, is_simulation, adapter_info, browser_info, features
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                timestamp, connection_id, browser, platform, startup_time,
                duration, is_simulation, adapter_info, browser_info, features
            ])
            
            logger.info(f"Stored browser connection data for {connection_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error storing browser connection data: {e}")
            return False
    
    def store_performance_metrics(self, performance_data: Dict[str, Any]) -> bool:
        """
        Store model performance metrics in database.
        
        Args:
            performance_data: Dict with performance metrics
            
        Returns:
            True if data stored successfully, False otherwise
        """
        if not self.initialized or not self.connection:
            logger.error("Cannot store performance metrics: Database not initialized")
            return False
        
        try:
            # Parse input data
            timestamp = performance_data.get('timestamp', datetime.datetime.now())
            if isinstance(timestamp, (int, float)):
                timestamp = datetime.datetime.fromtimestamp(timestamp)
            
            connection_id = performance_data.get('connection_id', '')
            model_name = performance_data.get('model_name', '')
            model_type = performance_data.get('model_type', '')
            platform = performance_data.get('platform', '')
            browser = performance_data.get('browser', '')
            is_real_hardware = performance_data.get('is_real_hardware', False)
            
            # Get optimization flags
            compute_shader_optimized = performance_data.get('compute_shader_optimized', False)
            precompile_shaders = performance_data.get('precompile_shaders', False)
            parallel_loading = performance_data.get('parallel_loading', False)
            mixed_precision = performance_data.get('mixed_precision', False)
            precision_bits = performance_data.get('precision', 16)
            
            # Get performance metrics
            initialization_time_ms = performance_data.get('initialization_time_ms', 0.0)
            inference_time_ms = performance_data.get('inference_time_ms', 0.0)
            memory_usage_mb = performance_data.get('memory_usage_mb', 0.0)
            throughput = performance_data.get('throughput_items_per_second', 0.0)
            latency_ms = performance_data.get('latency_ms', 0.0)
            batch_size = performance_data.get('batch_size', 1)
            
            # Check for simulation mode
            simulation_mode = performance_data.get('simulation_mode', not is_real_hardware)
            
            # Serialize JSON data
            adapter_info = json.dumps(performance_data.get('adapter_info', {}))
            model_info = json.dumps(performance_data.get('model_info', {}))
            
            # Store in database
            self.connection.execute("""
            INSERT INTO webnn_webgpu_performance (
                timestamp, connection_id, model_name, model_type, platform, browser,
                is_real_hardware, compute_shader_optimized, precompile_shaders,
                parallel_loading, mixed_precision, precision_bits,
                initialization_time_ms, inference_time_ms, memory_usage_mb,
                throughput_items_per_second, latency_ms, batch_size,
                adapter_info, model_info, simulation_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                timestamp, connection_id, model_name, model_type, platform, browser,
                is_real_hardware, compute_shader_optimized, precompile_shaders,
                parallel_loading, mixed_precision, precision_bits,
                initialization_time_ms, inference_time_ms, memory_usage_mb,
                throughput, latency_ms, batch_size,
                adapter_info, model_info, simulation_mode
            ])
            
            logger.info(f"Stored performance metrics for {model_name} on {platform}/{browser}")
            
            # Update time series performance data for trend analysis
            self._update_time_series_performance(performance_data)
            
            return True
            
        except Exception as e:
            logger.error(f"Error storing performance metrics: {e}")
            traceback.print_exc()
            return False
    
    def store_resource_pool_metrics(self, metrics_data: Dict[str, Any]) -> bool:
        """
        Store resource pool metrics in database.
        
        Args:
            metrics_data: Dict with resource pool metrics
            
        Returns:
            True if data stored successfully, False otherwise
        """
        if not self.initialized or not self.connection:
            logger.error("Cannot store resource pool metrics: Database not initialized")
            return False
        
        try:
            # Parse input data
            timestamp = metrics_data.get('timestamp', datetime.datetime.now())
            if isinstance(timestamp, (int, float)):
                timestamp = datetime.datetime.fromtimestamp(timestamp)
            
            pool_size = metrics_data.get('pool_size', 0)
            active_connections = metrics_data.get('active_connections', 0)
            total_connections = metrics_data.get('total_connections', 0)
            connection_utilization = metrics_data.get('connection_utilization', 0.0)
            
            # Check for scaling event
            scaling_event = metrics_data.get('scaling_event', False)
            scaling_reason = metrics_data.get('scaling_reason', '')
            
            # Get message stats
            messages_sent = metrics_data.get('messages_sent', 0)
            messages_received = metrics_data.get('messages_received', 0)
            errors = metrics_data.get('errors', 0)
            
            # Get memory usage
            system_memory_percent = metrics_data.get('system_memory_percent', 0.0)
            process_memory_mb = metrics_data.get('process_memory_mb', 0.0)
            
            # Serialize JSON data
            browser_distribution = json.dumps(metrics_data.get('browser_distribution', {}))
            platform_distribution = json.dumps(metrics_data.get('platform_distribution', {}))
            model_distribution = json.dumps(metrics_data.get('model_distribution', {}))
            
            # Store in database
            self.connection.execute("""
            INSERT INTO resource_pool_metrics (
                timestamp, pool_size, active_connections, total_connections,
                connection_utilization, browser_distribution, platform_distribution,
                model_distribution, scaling_event, scaling_reason,
                messages_sent, messages_received, errors,
                system_memory_percent, process_memory_mb
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                timestamp, pool_size, active_connections, total_connections,
                connection_utilization, browser_distribution, platform_distribution,
                model_distribution, scaling_event, scaling_reason,
                messages_sent, messages_received, errors,
                system_memory_percent, process_memory_mb
            ])
            
            logger.info(f"Stored resource pool metrics (util: {connection_utilization:.2f}, connections: {active_connections}/{total_connections})")
            return True
            
        except Exception as e:
            logger.error(f"Error storing resource pool metrics: {e}")
            return False
    
    def _update_time_series_performance(self, performance_data: Dict[str, Any]) -> bool:
        """
        Update time series performance data for trend analysis.
        
        Args:
            performance_data: Dict with performance metrics
            
        Returns:
            True if data stored successfully, False otherwise
        """
        if not self.initialized or not self.connection:
            return False
        
        try:
            # Parse input data
            timestamp = performance_data.get('timestamp', datetime.datetime.now())
            if isinstance(timestamp, (int, float)):
                timestamp = datetime.datetime.fromtimestamp(timestamp)
            
            model_name = performance_data.get('model_name', '')
            model_type = performance_data.get('model_type', '')
            platform = performance_data.get('platform', '')
            browser = performance_data.get('browser', '')
            batch_size = performance_data.get('batch_size', 1)
            
            # Get performance metrics
            throughput = performance_data.get('throughput_items_per_second', 0.0)
            latency_ms = performance_data.get('latency_ms', 0.0)
            memory_usage_mb = performance_data.get('memory_usage_mb', 0.0)
            
            # Get git information if available
            git_commit = performance_data.get('git_commit', '')
            git_branch = performance_data.get('git_branch', '')
            
            # Serialize JSON data
            system_info = json.dumps(performance_data.get('system_info', {}))
            test_params = json.dumps(performance_data.get('test_params', {}))
            
            # Notes field
            notes = performance_data.get('notes', '')
            
            # Store in database
            self.connection.execute("""
            INSERT INTO time_series_performance (
                timestamp, model_name, model_type, platform, browser,
                batch_size, throughput_items_per_second, latency_ms, memory_usage_mb,
                git_commit, git_branch, system_info, test_params, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                timestamp, model_name, model_type, platform, browser,
                batch_size, throughput, latency_ms, memory_usage_mb,
                git_commit, git_branch, system_info, test_params, notes
            ])
            
            # Check for performance regressions
            if model_name and (throughput > 0 or latency_ms > 0):
                self._check_for_regression(model_name, performance_data)
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating time series performance: {e}")
            return False
    
    def _check_for_regression(self, model_name: str, performance_data: Dict[str, Any]) -> bool:
        """
        Check for performance regressions compared to historical data.
        
        Args:
            model_name: Name of the model
            performance_data: Current performance data
            
        Returns:
            True if regression detected and stored, False otherwise
        """
        if not self.initialized or not self.connection:
            return False
        
        try:
            # Get key metrics from current data
            throughput = performance_data.get('throughput_items_per_second', 0.0)
            latency_ms = performance_data.get('latency_ms', 0.0)
            memory_usage_mb = performance_data.get('memory_usage_mb', 0.0)
            platform = performance_data.get('platform', '')
            browser = performance_data.get('browser', '')
            batch_size = performance_data.get('batch_size', 1)
            
            # Skip if no meaningful metrics
            if throughput <= 0 and latency_ms <= 0:
                return False
            
            # Get historical metrics for comparison (last 30 days)
            query = """
            SELECT AVG(throughput_items_per_second) as avg_throughput,
                   AVG(latency_ms) as avg_latency,
                   AVG(memory_usage_mb) as avg_memory
            FROM time_series_performance
            WHERE model_name = ?
                AND platform = ?
                AND browser = ?
                AND batch_size = ?
                AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'
                AND throughput_items_per_second > 0
            """
            
            result = self.connection.execute(query, [model_name, platform, browser, batch_size]).fetchone()
            
            if not result or result[0] is None:
                # Not enough historical data for comparison
                return False
            
            avg_throughput = result[0]
            avg_latency = result[1]
            avg_memory = result[2]
            
            # Check for regressions
            regressions = []
            
            # Throughput regression (lower is worse)
            if throughput > 0 and avg_throughput > 0:
                throughput_change = (throughput - avg_throughput) / avg_throughput * 100
                if throughput_change < -15:  # 15% decrease in throughput is significant
                    regressions.append({
                        'metric': 'throughput',
                        'previous_value': avg_throughput,
                        'current_value': throughput,
                        'change_percent': throughput_change,
                        'severity': 'high' if throughput_change < -25 else 'medium'
                    })
            
            # Latency regression (higher is worse)
            if latency_ms > 0 and avg_latency > 0:
                latency_change = (latency_ms - avg_latency) / avg_latency * 100
                if latency_change > 20:  # 20% increase in latency is significant
                    regressions.append({
                        'metric': 'latency',
                        'previous_value': avg_latency,
                        'current_value': latency_ms,
                        'change_percent': latency_change,
                        'severity': 'high' if latency_change > 35 else 'medium'
                    })
            
            # Memory regression (higher is worse)
            if memory_usage_mb > 0 and avg_memory > 0:
                memory_change = (memory_usage_mb - avg_memory) / avg_memory * 100
                if memory_change > 25:  # 25% increase in memory usage is significant
                    regressions.append({
                        'metric': 'memory',
                        'previous_value': avg_memory,
                        'current_value': memory_usage_mb,
                        'change_percent': memory_change,
                        'severity': 'high' if memory_change > 50 else 'medium'
                    })
            
            # Store regressions if any detected
            for regression in regressions:
                self.connection.execute("""
                INSERT INTO performance_regression (
                    timestamp, model_name, metric, previous_value, current_value,
                    change_percent, regression_type, severity, detected_by, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    datetime.datetime.now(),
                    model_name,
                    regression['metric'],
                    regression['previous_value'],
                    regression['current_value'],
                    regression['change_percent'],
                    'performance',
                    regression['severity'],
                    'resource_pool_db_integration',
                    f"Regression detected for {model_name} on {platform}/{browser}"
                ])
                
                logger.warning(f"Performance regression detected for {model_name}: {regression['metric']} changed by {regression['change_percent']:.1f}%")
            
            return len(regressions) > 0
            
        except Exception as e:
            logger.error(f"Error checking for regression: {e}")
            return False
    
    def get_performance_report(self, model_name: Optional[str] = None, platform: Optional[str] = None,
                           browser: Optional[str] = None, days: int = 30, 
                           output_format: str = 'dict') -> Union[Dict[str, Any], str]:
        """
        Generate a comprehensive performance report.
        
        Args:
            model_name: Optional filter by model name
            platform: Optional filter by platform
            browser: Optional filter by browser
            days: Number of days to include in report
            output_format: Output format ('dict', 'json', 'html', 'markdown')
            
        Returns:
            Performance report in specified format
        """
        if not self.initialized or not self.connection:
            logger.error("Cannot generate report: Database not initialized")
            if output_format == 'dict':
                return {'error': 'Database not initialized'}
            else:
                return "Error: Database not initialized"
        
        try:
            # Prepare filters
            filters = []
            params = []
            
            if model_name:
                filters.append("model_name = ?")
                params.append(model_name)
            
            if platform:
                filters.append("platform = ?")
                params.append(platform)
            
            if browser:
                filters.append("browser = ?")
                params.append(browser)
            
            # Add time filter
            filters.append("timestamp > CURRENT_TIMESTAMP - INTERVAL ? days")
            params.append(days)
            
            # Build filter string
            filter_str = " AND ".join(filters) if filters else "1=1"
            
            # Query performance data
            query = f"""
            SELECT 
                model_name,
                model_type,
                platform,
                browser,
                is_real_hardware,
                AVG(throughput_items_per_second) as avg_throughput,
                AVG(latency_ms) as avg_latency,
                AVG(memory_usage_mb) as avg_memory,
                MIN(latency_ms) as min_latency,
                MAX(throughput_items_per_second) as max_throughput,
                COUNT(*) as sample_count
            FROM webnn_webgpu_performance
            WHERE {filter_str}
            GROUP BY model_name, model_type, platform, browser, is_real_hardware
            ORDER BY model_name, platform, browser
            """
            
            # Execute query
            result = self.connection.execute(query, params).fetchall()
            
            # Build report
            models_data = []
            for row in result:
                models_data.append({
                    'model_name': row[0],
                    'model_type': row[1],
                    'platform': row[2],
                    'browser': row[3],
                    'is_real_hardware': row[4],
                    'avg_throughput': row[5],
                    'avg_latency': row[6],
                    'avg_memory': row[7],
                    'min_latency': row[8],
                    'max_throughput': row[9],
                    'sample_count': row[10]
                })
            
            # Get optimization impact data
            optimization_query = f"""
            SELECT 
                model_type,
                compute_shader_optimized,
                precompile_shaders,
                parallel_loading,
                AVG(latency_ms) as avg_latency,
                AVG(throughput_items_per_second) as avg_throughput
            FROM webnn_webgpu_performance
            WHERE {filter_str}
            GROUP BY model_type, compute_shader_optimized, precompile_shaders, parallel_loading
            ORDER BY model_type
            """
            
            optimization_result = self.connection.execute(optimization_query, params).fetchall()
            
            optimization_data = []
            for row in optimization_result:
                optimization_data.append({
                    'model_type': row[0],
                    'compute_shader_optimized': row[1],
                    'precompile_shaders': row[2],
                    'parallel_loading': row[3],
                    'avg_latency': row[4],
                    'avg_throughput': row[5]
                })
            
            # Get browser comparison data
            browser_query = f"""
            SELECT 
                browser,
                platform,
                COUNT(*) as tests,
                AVG(throughput_items_per_second) as avg_throughput,
                AVG(latency_ms) as avg_latency
            FROM webnn_webgpu_performance
            WHERE {filter_str}
            GROUP BY browser, platform
            ORDER BY browser, platform
            """
            
            browser_result = self.connection.execute(browser_query, params).fetchall()
            
            browser_data = []
            for row in browser_result:
                browser_data.append({
                    'browser': row[0],
                    'platform': row[1],
                    'tests': row[2],
                    'avg_throughput': row[3],
                    'avg_latency': row[4]
                })
            
            # Get regression data
            regression_query = f"""
            SELECT 
                model_name,
                metric,
                previous_value,
                current_value,
                change_percent,
                severity
            FROM performance_regression
            WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL ? days
            ORDER BY timestamp DESC
            LIMIT 10
            """
            
            regression_result = self.connection.execute(regression_query, [days]).fetchall()
            
            regression_data = []
            for row in regression_result:
                regression_data.append({
                    'model_name': row[0],
                    'metric': row[1],
                    'previous_value': row[2],
                    'current_value': row[3],
                    'change_percent': row[4],
                    'severity': row[5]
                })
            
            # Build complete report
            report = {
                'timestamp': datetime.datetime.now().isoformat(),
                'report_period': f"Last {days} days",
                'models_data': models_data,
                'optimization_data': optimization_data,
                'browser_data': browser_data,
                'regression_data': regression_data,
                'filters': {
                    'model_name': model_name,
                    'platform': platform,
                    'browser': browser
                }
            }
            
            # Return in requested format
            if output_format == 'dict':
                return report
            elif output_format == 'json':
                return json.dumps(report, indent=2)
            elif output_format == 'html':
                return self._format_report_as_html(report)
            elif output_format == 'markdown':
                return self._format_report_as_markdown(report)
            else:
                logger.warning(f"Unknown output format: {output_format}, returning dict")
                return report
                
        except Exception as e:
            logger.error(f"Error generating performance report: {e}")
            traceback.print_exc()
            
            if output_format == 'dict':
                return {'error': str(e)}
            else:
                return f"Error generating report: {e}"
    
    def _format_report_as_html(self, report: Dict[str, Any]) -> str:
        """
        Format report as HTML.
        
        Args:
            report: Report data
            
        Returns:
            HTML formatted report
        """
        # Start with basic HTML structure
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>WebNN/WebGPU Performance Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
        th, td {{ padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background-color: #f2f2f2; }}
        .warning {{ color: orange; }}
        .error {{ color: red; }}
        .success {{ color: green; }}
        h1, h2, h3 {{ color: #333; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .card {{ background-color: #f9f9f9; padding: 15px; margin-bottom: 20px; border-radius: 5px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>WebNN/WebGPU Performance Report</h1>
        <p>Generated on: {report['timestamp']}</p>
        <p>Report period: {report['report_period']}</p>
"""
        
        # Add filters section
        html += "<div class='card'><h2>Filters</h2><ul>"
        for key, value in report['filters'].items():
            if value:
                html += f"<li><strong>{key}:</strong> {value}</li>"
        html += "</ul></div>"
        
        # Add models data
        if report['models_data']:
            html += "<div class='card'><h2>Model Performance Summary</h2>"
            html += "<table><tr><th>Model</th><th>Type</th><th>Platform</th><th>Browser</th><th>Real Hardware</th><th>Avg Throughput</th><th>Avg Latency (ms)</th><th>Avg Memory (MB)</th><th>Samples</th></tr>"
            
            for model in report['models_data']:
                real_hw_class = "success" if model['is_real_hardware'] else "warning"
                html += f"<tr><td>{model['model_name']}</td><td>{model['model_type']}</td><td>{model['platform']}</td><td>{model['browser']}</td><td class='{real_hw_class}'>{model['is_real_hardware']}</td><td>{model['avg_throughput']:.2f}</td><td>{model['avg_latency']:.2f}</td><td>{model['avg_memory']:.2f}</td><td>{model['sample_count']}</td></tr>"
                
            html += "</table></div>"
        
        # Add optimization data
        if report['optimization_data']:
            html += "<div class='card'><h2>Optimization Impact</h2>"
            html += "<table><tr><th>Model Type</th><th>Compute Shaders</th><th>Precompile Shaders</th><th>Parallel Loading</th><th>Avg Latency (ms)</th><th>Avg Throughput</th></tr>"
            
            for opt in report['optimization_data']:
                html += f"<tr><td>{opt['model_type']}</td><td>{opt['compute_shader_optimized']}</td><td>{opt['precompile_shaders']}</td><td>{opt['parallel_loading']}</td><td>{opt['avg_latency']:.2f}</td><td>{opt['avg_throughput']:.2f}</td></tr>"
                
            html += "</table></div>"
        
        # Add browser comparison
        if report['browser_data']:
            html += "<div class='card'><h2>Browser Comparison</h2>"
            html += "<table><tr><th>Browser</th><th>Platform</th><th>Tests</th><th>Avg Throughput</th><th>Avg Latency (ms)</th></tr>"
            
            for browser in report['browser_data']:
                html += f"<tr><td>{browser['browser']}</td><td>{browser['platform']}</td><td>{browser['tests']}</td><td>{browser['avg_throughput']:.2f}</td><td>{browser['avg_latency']:.2f}</td></tr>"
                
            html += "</table></div>"
        
        # Add regression data
        if report['regression_data']:
            html += "<div class='card'><h2>Recent Performance Regressions</h2>"
            html += "<table><tr><th>Model</th><th>Metric</th><th>Previous Value</th><th>Current Value</th><th>Change %</th><th>Severity</th></tr>"
            
            for regression in report['regression_data']:
                severity_class = "error" if regression['severity'] == 'high' else "warning"
                html += f"<tr><td>{regression['model_name']}</td><td>{regression['metric']}</td><td>{regression['previous_value']:.2f}</td><td>{regression['current_value']:.2f}</td><td class='{severity_class}'>{regression['change_percent']:.1f}%</td><td class='{severity_class}'>{regression['severity']}</td></tr>"
                
            html += "</table></div>"
        
        # Close HTML
        html += "</div></body></html>"
        
        return html
    
    def _format_report_as_markdown(self, report: Dict[str, Any]) -> str:
        """
        Format report as Markdown.
        
        Args:
            report: Report data
            
        Returns:
            Markdown formatted report
        """
        # Start with title and metadata
        markdown = f"# WebNN/WebGPU Performance Report\n\n"
        markdown += f"Generated on: {report['timestamp']}\n"
        markdown += f"Report period: {report['report_period']}\n\n"
        
        # Add filters section
        markdown += "## Filters\n\n"
        for key, value in report['filters'].items():
            if value:
                markdown += f"- **{key}:** {value}\n"
        markdown += "\n"
        
        # Add models data
        if report['models_data']:
            markdown += "## Model Performance Summary\n\n"
            markdown += "| Model | Type | Platform | Browser | Real HW | Throughput | Latency (ms) | Memory (MB) | Samples |\n"
            markdown += "|-------|------|----------|---------|---------|------------|--------------|-------------|--------|\n"
            
            for model in report['models_data']:
                real_hw = "✅" if model['is_real_hardware'] else "⚠️"
                markdown += f"| {model['model_name']} | {model['model_type']} | {model['platform']} | {model['browser']} | {real_hw} | {model['avg_throughput']:.2f} | {model['avg_latency']:.2f} | {model['avg_memory']:.2f} | {model['sample_count']} |\n"
                
            markdown += "\n"
        
        # Add optimization data
        if report['optimization_data']:
            markdown += "## Optimization Impact\n\n"
            markdown += "| Model Type | Compute Shaders | Precompile Shaders | Parallel Loading | Latency (ms) | Throughput |\n"
            markdown += "|-----------|----------------|-------------------|----------------|-------------|------------|\n"
            
            for opt in report['optimization_data']:
                cs = "✅" if opt['compute_shader_optimized'] else "❌"
                ps = "✅" if opt['precompile_shaders'] else "❌"
                pl = "✅" if opt['parallel_loading'] else "❌"
                markdown += f"| {opt['model_type']} | {cs} | {ps} | {pl} | {opt['avg_latency']:.2f} | {opt['avg_throughput']:.2f} |\n"
                
            markdown += "\n"
        
        # Add browser comparison
        if report['browser_data']:
            markdown += "## Browser Comparison\n\n"
            markdown += "| Browser | Platform | Tests | Throughput | Latency (ms) |\n"
            markdown += "|---------|----------|-------|------------|-------------|\n"
            
            for browser in report['browser_data']:
                markdown += f"| {browser['browser']} | {browser['platform']} | {browser['tests']} | {browser['avg_throughput']:.2f} | {browser['avg_latency']:.2f} |\n"
                
            markdown += "\n"
        
        # Add regression data
        if report['regression_data']:
            markdown += "## Recent Performance Regressions\n\n"
            markdown += "| Model | Metric | Previous Value | Current Value | Change % | Severity |\n"
            markdown += "|-------|--------|----------------|--------------|----------|----------|\n"
            
            for regression in report['regression_data']:
                severity = "🔴" if regression['severity'] == 'high' else "🟠"
                markdown += f"| {regression['model_name']} | {regression['metric']} | {regression['previous_value']:.2f} | {regression['current_value']:.2f} | {regression['change_percent']:.1f}% | {severity} {regression['severity']} |\n"
                
        return markdown
    
    def close(self):
        """Close database connection."""
        if self.connection:
            self.connection.close()
            self.connection = None
            self.initialized = False
            logger.info("Database connection closed")

    def create_performance_visualization(self, model_name: Optional[str] = None, 
                                      metrics: List[str] = ['throughput', 'latency', 'memory'],
                                      days: int = 30, output_file: Optional[str] = None) -> bool:
        """
        Create performance visualization charts.
        
        Args:
            model_name: Optional filter by model name
            metrics: List of metrics to visualize
            days: Number of days to include
            output_file: Output file path or None for display
            
        Returns:
            True if visualization created successfully, False otherwise
        """
        if not self.initialized or not self.connection:
            logger.error("Cannot create visualization: Database not initialized")
            return False
        
        if not MATPLOTLIB_AVAILABLE:
            logger.error("Cannot create visualization: Matplotlib not available")
            return False
        
        if not PANDAS_AVAILABLE:
            logger.error("Cannot create visualization: Pandas not available")
            return False
        
        try:
            # Prepare filters
            filters = []
            params = []
            
            if model_name:
                filters.append("model_name = ?")
                params.append(model_name)
            
            # Add time filter
            filters.append("timestamp > CURRENT_TIMESTAMP - INTERVAL ? days")
            params.append(days)
            
            # Build filter string
            filter_str = " AND ".join(filters) if filters else "1=1"
            
            # Define SQL query for time series data
            query = f"""
            SELECT 
                timestamp,
                model_name,
                platform,
                browser,
                throughput_items_per_second,
                latency_ms,
                memory_usage_mb
            FROM time_series_performance
            WHERE {filter_str}
            ORDER BY timestamp
            """
            
            # Execute query and load into pandas DataFrame
            df = pd.read_sql(query, self.connection, parse_dates=['timestamp'])
            
            if df.empty:
                logger.warning("No data available for visualization")
                return False
            
            # Create plots
            plt.figure(figsize=(12, 10))
            
            # Plot throughput over time
            if 'throughput' in metrics and 'throughput_items_per_second' in df.columns:
                plt.subplot(len(metrics), 1, metrics.index('throughput') + 1)
                for (model, platform, browser), group in df.groupby(['model_name', 'platform', 'browser']):
                    plt.plot(group['timestamp'], group['throughput_items_per_second'], 
                            label=f"{model} ({platform}/{browser})")
                plt.title("Throughput Over Time")
                plt.ylabel("Items/second")
                plt.legend()
                plt.grid(True, linestyle='--', alpha=0.7)
            
            # Plot latency over time
            if 'latency' in metrics and 'latency_ms' in df.columns:
                plt.subplot(len(metrics), 1, metrics.index('latency') + 1)
                for (model, platform, browser), group in df.groupby(['model_name', 'platform', 'browser']):
                    plt.plot(group['timestamp'], group['latency_ms'], 
                            label=f"{model} ({platform}/{browser})")
                plt.title("Latency Over Time")
                plt.ylabel("Latency (ms)")
                plt.legend()
                plt.grid(True, linestyle='--', alpha=0.7)
            
            # Plot memory usage over time
            if 'memory' in metrics and 'memory_usage_mb' in df.columns:
                plt.subplot(len(metrics), 1, metrics.index('memory') + 1)
                for (model, platform, browser), group in df.groupby(['model_name', 'platform', 'browser']):
                    plt.plot(group['timestamp'], group['memory_usage_mb'], 
                            label=f"{model} ({platform}/{browser})")
                plt.title("Memory Usage Over Time")
                plt.ylabel("Memory (MB)")
                plt.legend()
                plt.grid(True, linestyle='--', alpha=0.7)
            
            plt.tight_layout()
            
            # Save or display
            if output_file:
                plt.savefig(output_file)
                logger.info(f"Visualization saved to {output_file}")
            else:
                plt.show()
            
            return True
            
        except Exception as e:
            logger.error(f"Error creating performance visualization: {e}")
            traceback.print_exc()
            return False

# Example usage
def test_resource_pool_db():
    """Test the resource pool database integration."""
    # Create integration with memory database for testing
    db_integration = ResourcePoolDBIntegration(":memory:")
    
    # Store sample connection data
    connection_data = {
        'timestamp': time.time(),
        'connection_id': 'firefox_webgpu_1',
        'browser': 'firefox',
        'platform': 'webgpu',
        'startup_time': 1.5,
        'duration': 120.0,
        'is_simulation': False,
        'adapter_info': {
            'vendor': 'NVIDIA',
            'device': 'GeForce RTX 3080',
            'driver_version': '531.41'
        },
        'browser_info': {
            'name': 'Firefox',
            'version': '122.0',
            'user_agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0'
        },
        'features': {
            'webgpu_supported': True,
            'webnn_supported': False,
            'compute_shaders_supported': True
        }
    }
    
    db_integration.store_browser_connection(connection_data)
    
    # Store sample performance data
    performance_data = {
        'timestamp': time.time(),
        'connection_id': 'firefox_webgpu_1',
        'model_name': 'whisper-tiny',
        'model_type': 'audio',
        'platform': 'webgpu',
        'browser': 'firefox',
        'is_real_hardware': True,
        'compute_shader_optimized': True,
        'precompile_shaders': False,
        'parallel_loading': False,
        'mixed_precision': False,
        'precision': 16,
        'initialization_time_ms': 1500.0,
        'inference_time_ms': 250.0,
        'memory_usage_mb': 350.0,
        'throughput_items_per_second': 4.0,
        'latency_ms': 250.0,
        'batch_size': 1,
        'adapter_info': {
            'vendor': 'NVIDIA',
            'device': 'GeForce RTX 3080'
        },
        'model_info': {
            'params': '39M',
            'quantized': False
        }
    }
    
    db_integration.store_performance_metrics(performance_data)
    
    # Store sample resource pool metrics
    metrics_data = {
        'timestamp': time.time(),
        'pool_size': 4,
        'active_connections': 2,
        'total_connections': 3,
        'connection_utilization': 0.67,
        'browser_distribution': {
            'firefox': 2,
            'chrome': 1,
            'edge': 0
        },
        'platform_distribution': {
            'webgpu': 2,
            'webnn': 1
        },
        'model_distribution': {
            'audio': 1,
            'vision': 1,
            'text_embedding': 1
        },
        'scaling_event': True,
        'scaling_reason': 'High utilization (0.75 > 0.7)',
        'messages_sent': 120,
        'messages_received': 110,
        'errors': 2,
        'system_memory_percent': 65.0,
        'process_memory_mb': 450.0
    }
    
    db_integration.store_resource_pool_metrics(metrics_data)
    
    # Generate report
    report = db_integration.get_performance_report(output_format='json')
    print(f"Report generated: {report[:200]}...")
    
    # Close connection
    db_integration.close()
    
    return True

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Resource Pool Database Integration for WebNN/WebGPU")
    parser.add_argument("--db-path", type=str, help="Path to DuckDB database")
    parser.add_argument("--test", action="store_true", help="Run test function")
    parser.add_argument("--report", action="store_true", help="Generate performance report")
    parser.add_argument("--model", type=str, help="Filter report by model name")
    parser.add_argument("--platform", type=str, help="Filter report by platform")
    parser.add_argument("--browser", type=str, help="Filter report by browser")
    parser.add_argument("--days", type=int, default=30, help="Number of days to include in report")
    parser.add_argument("--format", type=str, choices=["json", "html", "markdown"], default="json", help="Report format")
    parser.add_argument("--output", type=str, help="Output file path")
    parser.add_argument("--visualization", action="store_true", help="Create performance visualization")
    
    args = parser.parse_args()
    
    if args.test:
        test_resource_pool_db()
    elif args.report:
        db_integration = ResourcePoolDBIntegration(args.db_path)
        report = db_integration.get_performance_report(
            model_name=args.model,
            platform=args.platform,
            browser=args.browser,
            days=args.days,
            output_format=args.format
        )
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(report)
            print(f"Report saved to {args.output}")
        else:
            print(report)
            
        db_integration.close()
    elif args.visualization:
        db_integration = ResourcePoolDBIntegration(args.db_path)
        db_integration.create_performance_visualization(
            model_name=args.model,
            days=args.days,
            output_file=args.output
        )
        db_integration.close()
    else:
        parser.print_help()