#!/usr/bin/env python3
"""
Comprehensive Metrics Collection System for Cross-Browser Model Sharding

This module provides tools for collecting, analyzing, and visualizing metrics
from cross-browser model sharding tests, with a focus on fault tolerance performance
and recovery capabilities.

Usage:
    from fixed_web_platform.cross_browser_metrics_collector import MetricsCollector
    
    # Create collector with DuckDB integration
    collector = MetricsCollector(db_path="./benchmark_db.duckdb")
    
    # Record test results
    await collector.record_test_result(test_result)
    
    # Get comparative analysis
    analysis = await collector.analyze_fault_tolerance_performance(
        models=["llama-7b", "bert-base-uncased"],
        strategies=["optimal", "layer"]
    )
    
    # Generate visualization
    await collector.generate_fault_tolerance_visualization(
        output_path="fault_tolerance_metrics.png"
    )
"""

import os
import sys
import json
import time
import asyncio
import logging
import datetime
import statistics
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple, Set

try:
    import duckdb
    import pandas as pd
    import numpy as np
    import matplotlib.pyplot as plt
    import seaborn as sns
    VISUALIZATION_AVAILABLE = True
except ImportError:
    VISUALIZATION_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MetricsCollector:
    """
    Comprehensive metrics collection and analysis system for cross-browser model sharding.
    
    This class provides tools for:
    - Recording test results to a DuckDB database
    - Analyzing fault tolerance performance across different configurations
    - Generating visualizations of performance metrics
    - Providing insights and recommendations based on collected data
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the metrics collector.
        
        Args:
            db_path: Path to DuckDB database for storing metrics (optional)
        """
        self.db_path = db_path
        self.conn = None
        self.in_memory_results = []
        
        # Initialize database connection if path provided
        if db_path:
            try:
                self.conn = duckdb.connect(db_path)
                self._initialize_database()
                logger.info(f"Connected to database at {db_path}")
            except Exception as e:
                logger.error(f"Error connecting to database: {e}")
                self.conn = None
        
        self.logger = logger
    
    def _initialize_database(self) -> None:
        """Initialize database tables if they don't exist."""
        if not self.conn:
            return
        
        try:
            # Create test results table
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS fault_tolerance_test_results (
                    id INTEGER PRIMARY KEY,
                    timestamp TIMESTAMP,
                    model_name VARCHAR,
                    model_type VARCHAR,
                    browsers VARCHAR,
                    shards INTEGER,
                    strategy VARCHAR,
                    fault_tolerance_level VARCHAR,
                    recovery_strategy VARCHAR,
                    initialization_time FLOAT,
                    validation_time FLOAT,
                    status VARCHAR,
                    scenarios_tested VARCHAR,
                    result_json VARCHAR
                )
            """)
            
            # Create recovery metrics table
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS recovery_metrics (
                    id INTEGER PRIMARY KEY,
                    test_result_id INTEGER,
                    scenario VARCHAR,
                    recovered BOOLEAN,
                    recovery_time_ms FLOAT,
                    integrity_verified BOOLEAN,
                    action_counts VARCHAR,
                    FOREIGN KEY (test_result_id) REFERENCES fault_tolerance_test_results(id)
                )
            """)
            
            # Create performance metrics table
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS performance_metrics (
                    id INTEGER PRIMARY KEY,
                    test_result_id INTEGER,
                    avg_time_ms FLOAT,
                    min_time_ms FLOAT,
                    max_time_ms FLOAT,
                    std_dev_ms FLOAT,
                    successful_iterations INTEGER,
                    total_iterations INTEGER,
                    FOREIGN KEY (test_result_id) REFERENCES fault_tolerance_test_results(id)
                )
            """)
            
            # Commit changes
            self.conn.commit()
            logger.info("Database tables initialized")
            
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
    
    async def record_test_result(self, result: Dict[str, Any]) -> bool:
        """
        Record test result to database.
        
        Args:
            result: Test result dictionary
            
        Returns:
            Boolean indicating success
        """
        # Always store in memory for queries that don't need the database
        self.in_memory_results.append(result)
        
        # If no database connection, just store in memory
        if not self.conn:
            return True
        
        try:
            # Extract key fields
            timestamp = result.get("start_time", datetime.datetime.now().isoformat())
            model_name = result.get("model_name", "unknown")
            model_type = result.get("model_type", "unknown")
            browsers = ",".join(result.get("browsers", []))
            shards = result.get("shards", 0)
            strategy = result.get("strategy", "unknown")
            fault_tolerance_level = result.get("fault_tolerance_level", "unknown")
            recovery_strategy = result.get("recovery_strategy", "unknown")
            initialization_time = result.get("initialization_time", 0.0)
            validation_time = result.get("validation_time", 0.0)
            status = result.get("status", "unknown")
            
            # Extract scenarios tested
            validation_results = result.get("validation_results", {})
            scenarios_tested = ",".join(validation_results.get("scenarios_tested", []))
            
            # Serialize entire result to JSON
            result_json = json.dumps(result)
            
            # Insert into database
            self.conn.execute("""
                INSERT INTO fault_tolerance_test_results (
                    timestamp, model_name, model_type, browsers, shards, strategy,
                    fault_tolerance_level, recovery_strategy, initialization_time,
                    validation_time, status, scenarios_tested, result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                timestamp, model_name, model_type, browsers, shards, strategy,
                fault_tolerance_level, recovery_strategy, initialization_time,
                validation_time, status, scenarios_tested, result_json
            ))
            
            # Get the ID of the inserted row
            result_id = self.conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            
            # Insert recovery metrics if available
            scenario_results = validation_results.get("scenario_results", {})
            for scenario, scenario_result in scenario_results.items():
                recovered = scenario_result.get("success", False)
                recovery_time_ms = scenario_result.get("recovery_time_ms", 0.0)
                integrity_verified = scenario_result.get("integrity_verified", False)
                
                # Convert action counts to JSON
                recovery_result = scenario_result.get("recovery_result", {})
                action_counts = json.dumps(recovery_result.get("recovery_actions", {}))
                
                # Insert recovery metrics
                self.conn.execute("""
                    INSERT INTO recovery_metrics (
                        test_result_id, scenario, recovered, recovery_time_ms,
                        integrity_verified, action_counts
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    result_id, scenario, recovered, recovery_time_ms,
                    integrity_verified, action_counts
                ))
            
            # Insert performance metrics if available
            performance_impact = validation_results.get("performance_impact", {})
            if "summary" in performance_impact and performance_impact["summary"].get("performance_impact_measured", False):
                summary = performance_impact["summary"]
                
                self.conn.execute("""
                    INSERT INTO performance_metrics (
                        test_result_id, avg_time_ms, min_time_ms, max_time_ms,
                        std_dev_ms, successful_iterations, total_iterations
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    result_id,
                    summary.get("average_time_ms", 0.0),
                    summary.get("min_time_ms", 0.0),
                    summary.get("max_time_ms", 0.0),
                    summary.get("std_dev_ms", 0.0),
                    summary.get("successful_iterations", 0),
                    summary.get("total_iterations", 0)
                ))
            
            # Commit changes
            self.conn.commit()
            logger.info(f"Recorded test result for {model_name} with {strategy} strategy")
            return True
            
        except Exception as e:
            logger.error(f"Error recording test result: {e}")
            traceback.print_exc()
            return False
    
    async def analyze_fault_tolerance_performance(self, 
                                                models: Optional[List[str]] = None,
                                                strategies: Optional[List[str]] = None,
                                                fault_levels: Optional[List[str]] = None,
                                                recovery_strategies: Optional[List[str]] = None,
                                                limit: int = 50) -> Dict[str, Any]:
        """
        Analyze fault tolerance performance across different configurations.
        
        Args:
            models: List of model names to include (None for all)
            strategies: List of sharding strategies to include (None for all)
            fault_levels: List of fault tolerance levels to include (None for all)
            recovery_strategies: List of recovery strategies to include (None for all)
            limit: Maximum number of test results to analyze
            
        Returns:
            Dictionary with analysis results
        """
        try:
            # Start building query
            query_parts = ["SELECT * FROM fault_tolerance_test_results"]
            where_clauses = []
            params = []
            
            # Add filters
            if models:
                placeholders = ", ".join(["?" for _ in models])
                where_clauses.append(f"model_name IN ({placeholders})")
                params.extend(models)
            
            if strategies:
                placeholders = ", ".join(["?" for _ in strategies])
                where_clauses.append(f"strategy IN ({placeholders})")
                params.extend(strategies)
            
            if fault_levels:
                placeholders = ", ".join(["?" for _ in fault_levels])
                where_clauses.append(f"fault_tolerance_level IN ({placeholders})")
                params.extend(fault_levels)
            
            if recovery_strategies:
                placeholders = ", ".join(["?" for _ in recovery_strategies])
                where_clauses.append(f"recovery_strategy IN ({placeholders})")
                params.extend(recovery_strategies)
            
            # Build WHERE clause
            if where_clauses:
                query_parts.append("WHERE " + " AND ".join(where_clauses))
            
            # Add order and limit
            query_parts.append("ORDER BY timestamp DESC")
            query_parts.append(f"LIMIT {limit}")
            
            # Build final query
            query = " ".join(query_parts)
            
            # If no database connection, use in-memory results
            if not self.conn:
                logger.warning("No database connection, using in-memory results for analysis")
                
                # Apply filters to in-memory results
                filtered_results = self.in_memory_results
                
                if models:
                    filtered_results = [r for r in filtered_results if r.get("model_name") in models]
                
                if strategies:
                    filtered_results = [r for r in filtered_results if r.get("strategy") in strategies]
                
                if fault_levels:
                    filtered_results = [r for r in filtered_results if r.get("fault_tolerance_level") in fault_levels]
                
                if recovery_strategies:
                    filtered_results = [r for r in filtered_results if r.get("recovery_strategy") in recovery_strategies]
                
                # Limit results
                filtered_results = filtered_results[-limit:]
                
                # Create dataframe
                test_results = pd.DataFrame(filtered_results)
            else:
                # Execute query
                result = self.conn.execute(query, params)
                
                # Convert to dataframe
                test_results = result.df()
            
            # If no results, return early
            if test_results.empty:
                return {
                    "status": "no_data",
                    "message": "No test results found matching criteria"
                }
            
            # Analyze results
            analysis = {
                "summary": {},
                "comparisons": {},
                "insights": [],
                "recommendations": []
            }
            
            # Calculate summary statistics
            if "status" in test_results.columns:
                status_counts = test_results["status"].value_counts().to_dict()
                total_tests = len(test_results)
                pass_rate = (status_counts.get("passed", 0) / total_tests) if total_tests > 0 else 0
                
                analysis["summary"]["total_tests"] = total_tests
                analysis["summary"]["status_counts"] = status_counts
                analysis["summary"]["pass_rate"] = pass_rate
            
            # Calculate average initialization and validation times
            if "initialization_time" in test_results.columns:
                analysis["summary"]["avg_initialization_time"] = test_results["initialization_time"].mean()
            
            if "validation_time" in test_results.columns:
                analysis["summary"]["avg_validation_time"] = test_results["validation_time"].mean()
            
            # Compare strategies if multiple are present
            if "strategy" in test_results.columns and len(test_results["strategy"].unique()) > 1:
                strategy_comparison = {}
                
                for strategy in test_results["strategy"].unique():
                    strategy_results = test_results[test_results["strategy"] == strategy]
                    pass_count = len(strategy_results[strategy_results["status"] == "passed"])
                    total_count = len(strategy_results)
                    pass_rate = pass_count / total_count if total_count > 0 else 0
                    
                    strategy_comparison[strategy] = {
                        "total_tests": total_count,
                        "pass_count": pass_count,
                        "pass_rate": pass_rate
                    }
                    
                    # Add average initialization and validation times
                    if "initialization_time" in strategy_results.columns:
                        strategy_comparison[strategy]["avg_initialization_time"] = strategy_results["initialization_time"].mean()
                    
                    if "validation_time" in strategy_results.columns:
                        strategy_comparison[strategy]["avg_validation_time"] = strategy_results["validation_time"].mean()
                
                analysis["comparisons"]["strategies"] = strategy_comparison
                
                # Identify best strategy based on pass rate
                best_strategy = max(strategy_comparison.items(), key=lambda x: x[1]["pass_rate"])
                analysis["insights"].append(f"The {best_strategy[0]} strategy has the highest pass rate at {best_strategy[1]['pass_rate']:.1%}")
            
            # Compare fault tolerance levels if multiple are present
            if "fault_tolerance_level" in test_results.columns and len(test_results["fault_tolerance_level"].unique()) > 1:
                ft_comparison = {}
                
                for ft_level in test_results["fault_tolerance_level"].unique():
                    ft_results = test_results[test_results["fault_tolerance_level"] == ft_level]
                    pass_count = len(ft_results[ft_results["status"] == "passed"])
                    total_count = len(ft_results)
                    pass_rate = pass_count / total_count if total_count > 0 else 0
                    
                    ft_comparison[ft_level] = {
                        "total_tests": total_count,
                        "pass_count": pass_count,
                        "pass_rate": pass_rate
                    }
                    
                    # Add average validation time
                    if "validation_time" in ft_results.columns:
                        ft_comparison[ft_level]["avg_validation_time"] = ft_results["validation_time"].mean()
                
                analysis["comparisons"]["fault_tolerance_levels"] = ft_comparison
                
                # Add insight about higher fault tolerance levels
                high_ft = [level for level in ft_comparison if level in ["high", "critical"]]
                medium_ft = [level for level in ft_comparison if level == "medium"]
                
                if high_ft and medium_ft:
                    high_pass_rate = sum(ft_comparison[level]["pass_count"] for level in high_ft) / sum(ft_comparison[level]["total_tests"] for level in high_ft)
                    medium_pass_rate = ft_comparison["medium"]["pass_rate"]
                    
                    if high_pass_rate > medium_pass_rate:
                        analysis["insights"].append(f"Higher fault tolerance levels show better recovery performance ({high_pass_rate:.1%} vs {medium_pass_rate:.1%} pass rate)")
                    else:
                        analysis["insights"].append(f"Medium fault tolerance level provides adequate recovery ({medium_pass_rate:.1%} pass rate) with potentially lower overhead")
            
            # Compare recovery strategies if multiple are present
            if "recovery_strategy" in test_results.columns and len(test_results["recovery_strategy"].unique()) > 1:
                rs_comparison = {}
                
                for rs in test_results["recovery_strategy"].unique():
                    rs_results = test_results[test_results["recovery_strategy"] == rs]
                    pass_count = len(rs_results[rs_results["status"] == "passed"])
                    total_count = len(rs_results)
                    pass_rate = pass_count / total_count if total_count > 0 else 0
                    
                    rs_comparison[rs] = {
                        "total_tests": total_count,
                        "pass_count": pass_count,
                        "pass_rate": pass_rate
                    }
                    
                    # Add average validation time
                    if "validation_time" in rs_results.columns:
                        rs_comparison[rs]["avg_validation_time"] = rs_results["validation_time"].mean()
                
                analysis["comparisons"]["recovery_strategies"] = rs_comparison
                
                # Identify best recovery strategy based on pass rate
                best_rs = max(rs_comparison.items(), key=lambda x: x[1]["pass_rate"])
                analysis["insights"].append(f"The {best_rs[0]} recovery strategy has the highest pass rate at {best_rs[1]['pass_rate']:.1%}")
            
            # Get recovery metrics analysis if available
            if self.conn:
                try:
                    # Get aggregate recovery metrics
                    recovery_metrics = self.conn.execute("""
                        SELECT 
                            scenario,
                            COUNT(*) as total_tests,
                            SUM(CASE WHEN recovered THEN 1 ELSE 0 END) as successful_recoveries,
                            AVG(recovery_time_ms) as avg_recovery_time_ms,
                            MIN(recovery_time_ms) as min_recovery_time_ms,
                            MAX(recovery_time_ms) as max_recovery_time_ms
                        FROM recovery_metrics
                        JOIN fault_tolerance_test_results ON recovery_metrics.test_result_id = fault_tolerance_test_results.id
                        GROUP BY scenario
                        ORDER BY avg_recovery_time_ms
                    """).df()
                    
                    if not recovery_metrics.empty:
                        # Calculate recovery success rates
                        recovery_metrics["success_rate"] = recovery_metrics["successful_recoveries"] / recovery_metrics["total_tests"]
                        
                        # Add to analysis
                        analysis["recovery_metrics"] = recovery_metrics.to_dict(orient="records")
                        
                        # Add insights about recovery performance
                        fastest_scenario = recovery_metrics.iloc[0]
                        slowest_scenario = recovery_metrics.iloc[-1]
                        
                        analysis["insights"].append(
                            f"Fastest recovery is for {fastest_scenario['scenario']} scenarios "
                            f"({fastest_scenario['avg_recovery_time_ms']:.1f}ms, {fastest_scenario['success_rate']:.1%} success rate)"
                        )
                        analysis["insights"].append(
                            f"Slowest recovery is for {slowest_scenario['scenario']} scenarios "
                            f"({slowest_scenario['avg_recovery_time_ms']:.1f}ms, {slowest_scenario['success_rate']:.1%} success rate)"
                        )
                        
                        # Add recommendations based on recovery metrics
                        low_success_scenarios = recovery_metrics[recovery_metrics["success_rate"] < 0.8]
                        if not low_success_scenarios.empty:
                            scenarios = ", ".join(low_success_scenarios["scenario"])
                            analysis["recommendations"].append(f"Improve recovery mechanisms for: {scenarios}")
                except Exception as e:
                    logger.error(f"Error analyzing recovery metrics: {e}")
            
            # Generate recommendations based on insights
            if analysis["comparisons"].get("strategies"):
                worst_strategy = min(analysis["comparisons"]["strategies"].items(), key=lambda x: x[1]["pass_rate"])
                if worst_strategy[1]["pass_rate"] < 0.7:
                    analysis["recommendations"].append(f"Consider alternatives to the {worst_strategy[0]} strategy which has only {worst_strategy[1]['pass_rate']:.1%} pass rate")
            
            if analysis["comparisons"].get("fault_tolerance_levels"):
                ft_levels = analysis["comparisons"]["fault_tolerance_levels"]
                if "high" in ft_levels and "medium" in ft_levels:
                    high_pass_rate = ft_levels["high"]["pass_rate"]
                    medium_pass_rate = ft_levels["medium"]["pass_rate"]
                    
                    if high_pass_rate > medium_pass_rate * 1.1:  # 10% better
                        analysis["recommendations"].append("Consider using high fault tolerance level for critical workloads")
                    else:
                        analysis["recommendations"].append("Medium fault tolerance level may be sufficient for most use cases")
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing fault tolerance performance: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def generate_fault_tolerance_visualization(self, 
                                                  output_path: str,
                                                  models: Optional[List[str]] = None,
                                                  strategies: Optional[List[str]] = None,
                                                  metric: str = "recovery_time",
                                                  limit: int = 50) -> bool:
        """
        Generate visualization of fault tolerance metrics.
        
        Args:
            output_path: Path to output file
            models: List of model names to include (None for all)
            strategies: List of sharding strategies to include (None for all)
            metric: Metric to visualize (recovery_time, success_rate, etc.)
            limit: Maximum number of test results to include
            
        Returns:
            Boolean indicating success
        """
        if not VISUALIZATION_AVAILABLE:
            logger.error("Visualization libraries not available")
            return False
        
        if not self.conn:
            logger.error("Database connection required for visualization")
            return False
        
        try:
            # Build query based on metric
            if metric == "recovery_time":
                query = """
                    SELECT 
                        ft.model_name,
                        ft.strategy,
                        ft.fault_tolerance_level,
                        rm.scenario,
                        AVG(rm.recovery_time_ms) as avg_recovery_time_ms
                    FROM fault_tolerance_test_results ft
                    JOIN recovery_metrics rm ON ft.id = rm.test_result_id
                """
                
                # Add filters
                where_clauses = []
                params = []
                
                if models:
                    placeholders = ", ".join(["?" for _ in models])
                    where_clauses.append(f"ft.model_name IN ({placeholders})")
                    params.extend(models)
                
                if strategies:
                    placeholders = ", ".join(["?" for _ in strategies])
                    where_clauses.append(f"ft.strategy IN ({placeholders})")
                    params.extend(strategies)
                
                # Add WHERE clause
                if where_clauses:
                    query += " WHERE " + " AND ".join(where_clauses)
                
                # Add grouping and ordering
                query += """
                    GROUP BY ft.model_name, ft.strategy, ft.fault_tolerance_level, rm.scenario
                    ORDER BY avg_recovery_time_ms
                    LIMIT ?
                """
                params.append(limit)
                
                # Execute query
                df = self.conn.execute(query, params).df()
                
                # If no data, return
                if df.empty:
                    logger.error("No data available for visualization")
                    return False
                
                # Create figure
                plt.figure(figsize=(12, 8))
                
                # Create grouped bar chart
                sns.set_theme(style="whitegrid")
                chart = sns.catplot(
                    data=df,
                    kind="bar",
                    x="scenario",
                    y="avg_recovery_time_ms",
                    hue="strategy",
                    col="model_name",
                    col_wrap=2,
                    height=5,
                    aspect=1.2,
                    palette="viridis"
                )
                
                # Set titles and labels
                chart.set_titles("{col_name}")
                chart.set_axis_labels("Failure Scenario", "Recovery Time (ms)")
                chart.fig.suptitle("Recovery Performance by Sharding Strategy", fontsize=16)
                chart.fig.tight_layout(rect=[0, 0.03, 1, 0.95])
                
                # Save figure
                os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                chart.savefig(output_path)
                plt.close()
                
                logger.info(f"Recovery time visualization saved to {output_path}")
                return True
            
            elif metric == "success_rate":
                query = """
                    SELECT 
                        ft.model_name,
                        ft.strategy,
                        ft.fault_tolerance_level,
                        rm.scenario,
                        COUNT(*) as total_tests,
                        SUM(CASE WHEN rm.recovered THEN 1 ELSE 0 END) as successful_recoveries
                    FROM fault_tolerance_test_results ft
                    JOIN recovery_metrics rm ON ft.id = rm.test_result_id
                """
                
                # Add filters
                where_clauses = []
                params = []
                
                if models:
                    placeholders = ", ".join(["?" for _ in models])
                    where_clauses.append(f"ft.model_name IN ({placeholders})")
                    params.extend(models)
                
                if strategies:
                    placeholders = ", ".join(["?" for _ in strategies])
                    where_clauses.append(f"ft.strategy IN ({placeholders})")
                    params.extend(strategies)
                
                # Add WHERE clause
                if where_clauses:
                    query += " WHERE " + " AND ".join(where_clauses)
                
                # Add grouping
                query += """
                    GROUP BY ft.model_name, ft.strategy, ft.fault_tolerance_level, rm.scenario
                    LIMIT ?
                """
                params.append(limit)
                
                # Execute query
                df = self.conn.execute(query, params).df()
                
                # If no data, return
                if df.empty:
                    logger.error("No data available for visualization")
                    return False
                
                # Calculate success rate
                df["success_rate"] = df["successful_recoveries"] / df["total_tests"]
                
                # Create figure
                plt.figure(figsize=(12, 8))
                
                # Create grouped bar chart
                sns.set_theme(style="whitegrid")
                chart = sns.catplot(
                    data=df,
                    kind="bar",
                    x="scenario",
                    y="success_rate",
                    hue="strategy",
                    col="model_name",
                    col_wrap=2,
                    height=5,
                    aspect=1.2,
                    palette="viridis"
                )
                
                # Set titles and labels
                chart.set_titles("{col_name}")
                chart.set_axis_labels("Failure Scenario", "Recovery Success Rate")
                chart.fig.suptitle("Recovery Success by Sharding Strategy", fontsize=16)
                chart.fig.tight_layout(rect=[0, 0.03, 1, 0.95])
                
                # Set y-axis to percentage
                for ax in chart.axes.flat:
                    ax.set_ylim(0, 1)
                    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: '{:.0%}'.format(y)))
                
                # Save figure
                os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                chart.savefig(output_path)
                plt.close()
                
                logger.info(f"Success rate visualization saved to {output_path}")
                return True
            
            elif metric == "performance_impact":
                query = """
                    SELECT 
                        ft.model_name,
                        ft.strategy,
                        ft.fault_tolerance_level,
                        pm.avg_time_ms,
                        ft.initialization_time
                    FROM fault_tolerance_test_results ft
                    JOIN performance_metrics pm ON ft.id = pm.test_result_id
                """
                
                # Add filters
                where_clauses = []
                params = []
                
                if models:
                    placeholders = ", ".join(["?" for _ in models])
                    where_clauses.append(f"ft.model_name IN ({placeholders})")
                    params.extend(models)
                
                if strategies:
                    placeholders = ", ".join(["?" for _ in strategies])
                    where_clauses.append(f"ft.strategy IN ({placeholders})")
                    params.extend(strategies)
                
                # Add WHERE clause
                if where_clauses:
                    query += " WHERE " + " AND ".join(where_clauses)
                
                # Add ordering and limit
                query += " ORDER BY ft.timestamp DESC LIMIT ?"
                params.append(limit)
                
                # Execute query
                df = self.conn.execute(query, params).df()
                
                # If no data, return
                if df.empty:
                    logger.error("No data available for visualization")
                    return False
                
                # Create figure
                plt.figure(figsize=(12, 6))
                
                # Create scatter plot
                sns.set_theme(style="whitegrid")
                g = sns.relplot(
                    data=df,
                    x="initialization_time",
                    y="avg_time_ms",
                    hue="strategy",
                    style="fault_tolerance_level",
                    size="fault_tolerance_level",
                    sizes=(50, 200),
                    col="model_name",
                    col_wrap=2,
                    kind="scatter",
                    height=5,
                    aspect=1.2,
                    palette="viridis"
                )
                
                # Set titles and labels
                g.set_titles("{col_name}")
                g.set_axis_labels("Initialization Time (s)", "Inference Time (ms)")
                g.fig.suptitle("Performance Impact of Fault Tolerance Features", fontsize=16)
                g.fig.tight_layout(rect=[0, 0.03, 1, 0.95])
                
                # Save figure
                os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                g.savefig(output_path)
                plt.close()
                
                logger.info(f"Performance impact visualization saved to {output_path}")
                return True
            
            else:
                logger.error(f"Unsupported metric: {metric}")
                return False
                
        except Exception as e:
            logger.error(f"Error generating visualization: {e}")
            traceback.print_exc()
            return False
    
    def close(self) -> None:
        """Close database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None
            logger.info("Database connection closed")

async def main():
    """Command-line interface for metrics collector."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Cross-Browser Metrics Collector")
    
    # Database options
    parser.add_argument("--db-path", type=str, default="./benchmark_db.duckdb",
                      help="Path to DuckDB database")
    
    # Analysis options
    parser.add_argument("--analyze", action="store_true",
                      help="Run analysis on collected metrics")
    parser.add_argument("--models", type=str,
                      help="Comma-separated list of models to include in analysis")
    parser.add_argument("--strategies", type=str,
                      help="Comma-separated list of strategies to include in analysis")
    
    # Visualization options
    parser.add_argument("--visualize", action="store_true",
                      help="Generate visualizations of metrics")
    parser.add_argument("--metric", type=str, choices=["recovery_time", "success_rate", "performance_impact"],
                      default="recovery_time", help="Metric to visualize")
    parser.add_argument("--output", type=str, default="./metrics_visualization.png",
                      help="Path to output file for visualization")
    
    args = parser.parse_args()
    
    # Create metrics collector
    collector = MetricsCollector(db_path=args.db_path)
    
    try:
        # Run analysis if requested
        if args.analyze:
            models = args.models.split(',') if args.models else None
            strategies = args.strategies.split(',') if args.strategies else None
            
            analysis = await collector.analyze_fault_tolerance_performance(
                models=models,
                strategies=strategies
            )
            
            print("\nFault Tolerance Performance Analysis:")
            print("=" * 50)
            
            # Print summary
            if "summary" in analysis:
                print("\nSummary:")
                for key, value in analysis["summary"].items():
                    print(f"  {key}: {value}")
            
            # Print insights
            if "insights" in analysis and analysis["insights"]:
                print("\nInsights:")
                for insight in analysis["insights"]:
                    print(f"  - {insight}")
            
            # Print recommendations
            if "recommendations" in analysis and analysis["recommendations"]:
                print("\nRecommendations:")
                for recommendation in analysis["recommendations"]:
                    print(f"  - {recommendation}")
            
            print("=" * 50)
        
        # Generate visualization if requested
        if args.visualize:
            models = args.models.split(',') if args.models else None
            strategies = args.strategies.split(',') if args.strategies else None
            
            success = await collector.generate_fault_tolerance_visualization(
                output_path=args.output,
                models=models,
                strategies=strategies,
                metric=args.metric
            )
            
            if success:
                print(f"\nVisualization saved to: {args.output}")
            else:
                print("\nFailed to generate visualization")
    
    finally:
        # Close collector
        collector.close()

if __name__ == "__main__":
    asyncio.run(main())