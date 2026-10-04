#!/usr/bin/env python3
"""
Browser Performance History Tracking and Analysis (May 2025)

This module implements browser performance history tracking and analysis
for the WebGPU/WebNN Resource Pool. It provides:

- Historical performance tracking for different browser/model combinations
- Statistical analysis of browser performance trends
- Browser-specific optimization recommendations
- Automatic adaption of resource allocation based on performance history
- Performance anomaly detection

Performance data is tracked across:
- Browser types (Chrome, Firefox, Edge, Safari)
- Model types (text, vision, audio, etc.)
- Hardware backends (WebGPU, WebNN, CPU)
- Metrics (latency, throughput, memory usage)

Usage:
    from fixed_web_platform.browser_performance_history import BrowserPerformanceHistory
    
    # Create performance history tracker
    history = BrowserPerformanceHistory(db_path="./benchmark_db.duckdb")
    
    # Record execution metrics
    history.record_execution(
        browser="chrome",
        model_type="text_embedding",
        model_name="bert-base-uncased",
        platform="webgpu",
        metrics={
            "latency_ms": 120.5,
            "throughput_tokens_per_sec": 1850.2,
            "memory_mb": 350.6
        }
    )
    
    # Get browser-specific recommendations
    recommendations = history.get_browser_recommendations(
        model_type="text_embedding",
        model_name="bert-base-uncased"
    )
    
    # Apply optimizations based on history
    optimized_browser_config = history.get_optimized_browser_config(
        model_type="text_embedding",
        model_name="bert-base-uncased"
    )
"""

import os
import sys
import json
import time
import logging
import threading
import statistics
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple, Set, Union
from pathlib import Path
from collections import defaultdict

# Try to import scipy and sklearn for advanced analysis
try:
    from scipy import stats
    from sklearn.linear_model import LinearRegression
    ADVANCED_ANALYSIS_AVAILABLE = True
except ImportError:
    ADVANCED_ANALYSIS_AVAILABLE = False

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(name)s] - %(message)s')
logger = logging.getLogger("browser_performance_history")

class BrowserPerformanceHistory:
    """Browser performance history tracking and analysis for WebGPU/WebNN resource pool."""
    
    def __init__(self, db_path: Optional[str] = None):
        """Initialize the browser performance history tracker.
        
        Args:
            db_path: Path to DuckDB database for persistent storage
        """
        self.db_path = db_path
        
        # In-memory performance history by browser, model type, model name, and platform
        # Structure: {browser: {model_type: {model_name: {platform: [metrics_list]}}}}
        self.history = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list))))
        
        # Performance baselines by browser and model type
        # Structure: {browser: {model_type: {metric: {mean, stdev, samples}}}}
        self.baselines = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
        
        # Optimization recommendations based on history
        # Structure: {model_type: {model_name: {recommended_browser, recommended_platform, config}}}
        self.recommendations = defaultdict(lambda: defaultdict(dict))
        
        # Browser capability scores based on historical performance
        # Structure: {browser: {model_type: {score, confidence, sample_size}}}
        self.capability_scores = defaultdict(lambda: defaultdict(dict))
        
        # Configuration
        self.config = {
            "min_samples_for_recommendation": 5,     # Minimum samples before making recommendations
            "history_days": 30,                      # Days of history to keep
            "update_interval_minutes": 60,           # Minutes between automatic updates
            "anomaly_detection_threshold": 2.5,      # Z-score threshold for anomaly detection
            "optimization_metrics": {                # Metrics used for optimization (lower is better)
                "latency_ms": {"weight": 1.0, "lower_better": True},
                "memory_mb": {"weight": 0.5, "lower_better": True},
                "throughput_tokens_per_sec": {"weight": 0.8, "lower_better": False}
            },
            "browser_specific_optimizations": {
                "firefox": {
                    "audio": {
                        "compute_shader_optimization": True,
                        "audio_thread_priority": "high"
                    }
                },
                "edge": {
                    "text_embedding": {
                        "webnn_optimization": True,
                        "quantization_level": "int8"
                    }
                },
                "chrome": {
                    "vision": {
                        "webgpu_compute_pipelines": "parallel",
                        "batch_processing": True
                    }
                }
            }
        }
        
        # Database connection
        self.db_manager = None
        if db_path:
            try:
                import duckdb
                self.db_conn = duckdb.connect(db_path)
                self._ensure_db_schema()
                logger.info(f"Connected to performance history database: {db_path}")
            except ImportError:
                logger.warning("DuckDB not available, operating in memory-only mode")
            except Exception as e:
                logger.error(f"Error connecting to database: {e}")
        
        # Auto-update thread
        self.update_thread = None
        self.update_stop_event = threading.Event()
        
        # Load existing history if database available
        if self.db_path and hasattr(self, 'db_conn'):
            self._load_history()
            
        # Initialize recommendations based on loaded history
        self._update_recommendations()
        logger.info("Browser performance history initialized")
    
    def _ensure_db_schema(self):
        """Ensure the database has the required tables."""
        if not hasattr(self, 'db_conn'):
            return
            
        try:
            # Create browser performance table if it doesn't exist
            self.db_conn.execute("""
                CREATE TABLE IF NOT EXISTS browser_performance (
                    id INTEGER PRIMARY KEY,
                    timestamp TIMESTAMP,
                    browser VARCHAR,
                    model_type VARCHAR,
                    model_name VARCHAR,
                    platform VARCHAR,
                    latency_ms DOUBLE,
                    throughput_tokens_per_sec DOUBLE,
                    memory_mb DOUBLE,
                    batch_size INTEGER,
                    success BOOLEAN,
                    error_type VARCHAR,
                    extra JSON
                )
            """)
            
            # Create browser recommendations table if it doesn't exist
            self.db_conn.execute("""
                CREATE TABLE IF NOT EXISTS browser_recommendations (
                    id INTEGER PRIMARY KEY,
                    timestamp TIMESTAMP,
                    model_type VARCHAR,
                    model_name VARCHAR,
                    recommended_browser VARCHAR,
                    recommended_platform VARCHAR,
                    confidence DOUBLE,
                    sample_size INTEGER,
                    config JSON
                )
            """)
            
            # Create browser capability scores table if it doesn't exist
            self.db_conn.execute("""
                CREATE TABLE IF NOT EXISTS browser_capability_scores (
                    id INTEGER PRIMARY KEY,
                    timestamp TIMESTAMP,
                    browser VARCHAR,
                    model_type VARCHAR,
                    score DOUBLE,
                    confidence DOUBLE,
                    sample_size INTEGER,
                    metrics JSON
                )
            """)
            
            # Create indices for faster queries
            self.db_conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_browser_perf_browser ON browser_performance(browser);
                CREATE INDEX IF NOT EXISTS idx_browser_perf_model_type ON browser_performance(model_type);
                CREATE INDEX IF NOT EXISTS idx_browser_perf_model_name ON browser_performance(model_name);
                CREATE INDEX IF NOT EXISTS idx_browser_perf_timestamp ON browser_performance(timestamp);
            """)
            
            logger.info("Database schema initialized")
            
        except Exception as e:
            logger.error(f"Error ensuring database schema: {e}")
    
    def _load_history(self):
        """Load existing performance history from database."""
        if not hasattr(self, 'db_conn'):
            return
            
        try:
            # Calculate cutoff date
            cutoff_date = datetime.now() - timedelta(days=self.config["history_days"])
            
            # Load browser performance history
            result = self.db_conn.execute(f"""
                SELECT browser, model_type, model_name, platform, 
                       latency_ms, throughput_tokens_per_sec, memory_mb,
                       timestamp, batch_size, success, error_type, extra
                FROM browser_performance
                WHERE timestamp >= '{cutoff_date.isoformat()}'
            """).fetchall()
            
            # Process results
            for row in result:
                browser, model_type, model_name, platform, latency, throughput, memory, \
                timestamp, batch_size, success, error_type, extra = row
                
                # Convert extra from JSON if needed
                if isinstance(extra, str):
                    try:
                        extra = json.loads(extra)
                    except:
                        extra = {}
                elif extra is None:
                    extra = {}
                
                # Create metrics dictionary
                metrics = {
                    "timestamp": timestamp,
                    "latency_ms": latency,
                    "throughput_tokens_per_sec": throughput,
                    "memory_mb": memory,
                    "batch_size": batch_size,
                    "success": success,
                    "error_type": error_type
                }
                
                # Add any extra metrics
                metrics.update(extra)
                
                # Add to history
                self.history[browser][model_type][model_name][platform].append(metrics)
            
            # Load browser recommendations
            recommendation_result = self.db_conn.execute(f"""
                SELECT model_type, model_name, recommended_browser, recommended_platform,
                       confidence, sample_size, config
                FROM browser_recommendations
                WHERE timestamp >= '{cutoff_date.isoformat()}'
                ORDER BY timestamp DESC
            """).fetchall()
            
            # Process recommendations (only keep the most recent)
            seen_combinations = set()
            for row in recommendation_result:
                model_type, model_name, browser, platform, confidence, samples, config = row
                
                # Create a unique key for this model type/name
                key = f"{model_type}:{model_name}"
                
                # Skip if we've already seen this combination (keeping only the most recent)
                if key in seen_combinations:
                    continue
                    
                seen_combinations.add(key)
                
                # Convert config from JSON if needed
                if isinstance(config, str):
                    try:
                        config = json.loads(config)
                    except:
                        config = {}
                elif config is None:
                    config = {}
                
                # Store recommendation
                self.recommendations[model_type][model_name] = {
                    "recommended_browser": browser,
                    "recommended_platform": platform,
                    "confidence": confidence,
                    "sample_size": samples,
                    "config": config
                }
            
            # Load browser capability scores
            score_result = self.db_conn.execute(f"""
                SELECT browser, model_type, score, confidence, sample_size, metrics
                FROM browser_capability_scores
                WHERE timestamp >= '{cutoff_date.isoformat()}'
                ORDER BY timestamp DESC
            """).fetchall()
            
            # Process capability scores (only keep the most recent)
            seen_combinations = set()
            for row in score_result:
                browser, model_type, score, confidence, samples, metrics = row
                
                # Create a unique key for this browser/model type
                key = f"{browser}:{model_type}"
                
                # Skip if we've already seen this combination
                if key in seen_combinations:
                    continue
                    
                seen_combinations.add(key)
                
                # Convert metrics from JSON if needed
                if isinstance(metrics, str):
                    try:
                        metrics = json.loads(metrics)
                    except:
                        metrics = {}
                elif metrics is None:
                    metrics = {}
                
                # Store capability score
                self.capability_scores[browser][model_type] = {
                    "score": score,
                    "confidence": confidence,
                    "sample_size": samples,
                    "metrics": metrics
                }
            
            logger.info(f"Loaded {len(result)} performance records, "
                        f"{len(recommendation_result)} recommendations, and "
                        f"{len(score_result)} capability scores from database")
            
        except Exception as e:
            logger.error(f"Error loading history from database: {e}")
    
    def start_automatic_updates(self):
        """Start automatic updates of recommendations and baselines."""
        if self.update_thread and self.update_thread.is_alive():
            logger.warning("Automatic updates already running")
            return
            
        self.update_stop_event.clear()
        self.update_thread = threading.Thread(
            target=self._update_loop,
            daemon=True
        )
        self.update_thread.start()
        logger.info("Started automatic updates")
    
    def stop_automatic_updates(self):
        """Stop automatic updates."""
        if not self.update_thread or not self.update_thread.is_alive():
            logger.warning("Automatic updates not running")
            return
            
        self.update_stop_event.set()
        self.update_thread.join(timeout=5.0)
        logger.info("Stopped automatic updates")
    
    def _update_loop(self):
        """Thread function for automatic updates."""
        while not self.update_stop_event.is_set():
            try:
                # Update recommendations
                self._update_recommendations()
                
                # Update baselines
                self._update_baselines()
                
                # Clean up old history
                self._clean_up_history()
                
            except Exception as e:
                logger.error(f"Error in update loop: {e}")
                
            # Wait for next update interval
            interval_seconds = self.config["update_interval_minutes"] * 60
            self.update_stop_event.wait(interval_seconds)
    
    def record_execution(self, browser: str, model_type: str, model_name: str, 
                         platform: str, metrics: Dict[str, Any]):
        """Record execution metrics for a browser/model combination.
        
        Args:
            browser: Browser name (chrome, firefox, edge, safari)
            model_type: Type of model (text, vision, audio, etc.)
            model_name: Name of the model
            platform: Hardware platform (webgpu, webnn, cpu)
            metrics: Dictionary of performance metrics
        """
        browser = browser.lower()
        model_type = model_type.lower()
        platform = platform.lower()
        
        # Add timestamp if not provided
        if "timestamp" not in metrics:
            metrics["timestamp"] = datetime.now()
            
        # Add the metrics to in-memory history
        self.history[browser][model_type][model_name][platform].append(metrics)
        
        # Store in database if available
        if hasattr(self, 'db_conn'):
            try:
                # Extract standard metrics
                latency = metrics.get("latency_ms", None)
                throughput = metrics.get("throughput_tokens_per_sec", None)
                memory = metrics.get("memory_mb", None)
                batch_size = metrics.get("batch_size", None)
                success = metrics.get("success", True)
                error_type = metrics.get("error_type", None)
                timestamp = metrics.get("timestamp")
                
                # Extract extra metrics
                extra = {k: v for k, v in metrics.items() if k not in 
                        ["latency_ms", "throughput_tokens_per_sec", "memory_mb", 
                         "batch_size", "success", "error_type", "timestamp"]}
                
                # Store in database
                self.db_conn.execute("""
                    INSERT INTO browser_performance 
                    (timestamp, browser, model_type, model_name, platform, 
                     latency_ms, throughput_tokens_per_sec, memory_mb,
                     batch_size, success, error_type, extra)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    timestamp, browser, model_type, model_name, platform,
                    latency, throughput, memory, batch_size, success, error_type,
                    json.dumps(extra)
                ])
                
            except Exception as e:
                logger.error(f"Error storing metrics in database: {e}")
        
        # Check if we need to update recommendations
        if (len(self.history[browser][model_type][model_name][platform]) >= 
                self.config["min_samples_for_recommendation"]):
            self._update_recommendations_for_model(model_type, model_name)
    
    def _update_recommendations(self):
        """Update all recommendations based on current history."""
        logger.info("Updating all browser recommendations")
        
        # Iterate over all model types and names in history
        for browser in self.history:
            for model_type in self.history[browser]:
                for model_name in self.history[browser][model_type]:
                    self._update_recommendations_for_model(model_type, model_name)
        
        # Update browser capability scores
        self._update_capability_scores()
        
        logger.info("Completed updating recommendations")
    
    def _update_recommendations_for_model(self, model_type: str, model_name: str):
        """Update recommendations for a specific model.
        
        Args:
            model_type: Type of model
            model_name: Name of model
        """
        # Collect performance data for all browsers for this model
        browser_performance = {}
        
        # Find all browsers that have run this model
        browsers_used = set()
        for browser in self.history:
            if model_type in self.history[browser] and model_name in self.history[browser][model_type]:
                browsers_used.add(browser)
        
        # Skip if no browsers used
        if not browsers_used:
            return
            
        # Calculate performance metrics for each browser
        for browser in browsers_used:
            # Get all platforms used by this browser for this model
            platforms = list(self.history[browser][model_type][model_name].keys())
            
            # Skip if no platforms
            if not platforms:
                continue
                
            # Calculate performance for each platform
            platform_performance = {}
            for platform in platforms:
                # Get metrics for this platform
                metrics_list = self.history[browser][model_type][model_name][platform]
                
                # Skip if not enough samples
                if len(metrics_list) < self.config["min_samples_for_recommendation"]:
                    continue
                    
                # Calculate statistics
                metric_stats = {}
                for metric_name in self.config["optimization_metrics"]:
                    # Skip if metric not available
                    if not any(metric_name in m for m in metrics_list):
                        continue
                        
                    # Get values for this metric
                    values = [m.get(metric_name) for m in metrics_list if metric_name in m and m.get(metric_name) is not None]
                    
                    # Skip if not enough values
                    if len(values) < self.config["min_samples_for_recommendation"]:
                        continue
                        
                    # Calculate statistics
                    metric_stats[metric_name] = {
                        "mean": statistics.mean(values),
                        "median": statistics.median(values),
                        "stdev": statistics.stdev(values) if len(values) > 1 else 0,
                        "min": min(values),
                        "max": max(values),
                        "samples": len(values)
                    }
                
                # Calculate overall performance score (lower is better)
                score = 0
                total_weight = 0
                
                for metric_name, config in self.config["optimization_metrics"].items():
                    if metric_name in metric_stats:
                        weight = config["weight"]
                        value = metric_stats[metric_name]["mean"]
                        lower_better = config["lower_better"]
                        
                        # Add to score (invert if higher is better)
                        if lower_better:
                            score += weight * value
                        else:
                            # For metrics where higher is better, invert
                            score += weight * (1.0 / max(value, 0.001))
                            
                        total_weight += weight
                
                # Normalize score
                if total_weight > 0:
                    score /= total_weight
                    
                # Store platform performance
                platform_performance[platform] = {
                    "metrics": metric_stats,
                    "score": score
                }
            
            # Skip if no platforms with metrics
            if not platform_performance:
                continue
                
            # Find the best platform for this browser
            best_platform = min(platform_performance.items(), key=lambda x: x[1]["score"])
            platform_name = best_platform[0]
            platform_data = best_platform[1]
            
            # Store browser performance with best platform
            browser_performance[browser] = {
                "platform": platform_name,
                "score": platform_data["score"],
                "metrics": platform_data["metrics"],
                "sample_size": sum(stat["samples"] for stat in platform_data["metrics"].values())
            }
        
        # Skip if no browsers with performance data
        if not browser_performance:
            return
            
        # Find the best browser
        best_browser = min(browser_performance.items(), key=lambda x: x[1]["score"])
        browser_name = best_browser[0]
        browser_data = best_browser[1]
        
        # Create configuration based on browser-specific optimizations
        config = {}
        
        # Add browser-specific optimizations if available
        if browser_name in self.config["browser_specific_optimizations"]:
            browser_opts = self.config["browser_specific_optimizations"][browser_name]
            if model_type in browser_opts:
                config.update(browser_opts[model_type])
        
        # Create recommendation
        recommendation = {
            "recommended_browser": browser_name,
            "recommended_platform": browser_data["platform"],
            "score": browser_data["score"],
            "metrics": browser_data["metrics"],
            "sample_size": browser_data["sample_size"],
            "confidence": min(1.0, browser_data["sample_size"] / 20),  # Scale confidence by sample size
            "config": config,
            "timestamp": datetime.now()
        }
        
        # Update in-memory recommendations
        self.recommendations[model_type][model_name] = recommendation
        
        # Store in database if available
        if hasattr(self, 'db_conn'):
            try:
                self.db_conn.execute("""
                    INSERT INTO browser_recommendations
                    (timestamp, model_type, model_name, recommended_browser, 
                     recommended_platform, confidence, sample_size, config)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    recommendation["timestamp"], model_type, model_name, 
                    recommendation["recommended_browser"], recommendation["recommended_platform"],
                    recommendation["confidence"], recommendation["sample_size"],
                    json.dumps(recommendation["config"])
                ])
                
            except Exception as e:
                logger.error(f"Error storing recommendation in database: {e}")
        
        logger.info(f"Updated recommendation for {model_type}/{model_name}: "
                   f"{browser_name} with {browser_data['platform']} "
                   f"(confidence: {recommendation['confidence']:.2f})")
    
    def _update_capability_scores(self):
        """Update browser capability scores based on performance history."""
        # Calculate capability scores for each browser and model type
        for browser in self.history:
            for model_type in self.history[browser]:
                # Skip if no models for this type
                if not self.history[browser][model_type]:
                    continue
                    
                # Calculate average rank across all models
                model_ranks = []
                
                # Iterate over all models of this type
                for model_name in self.history[browser][model_type]:
                    # Get all browsers that have run this model
                    browsers_used = [b for b in self.history if 
                                     model_type in self.history[b] and 
                                     model_name in self.history[b][model_type]]
                    
                    # Skip if only one browser
                    if len(browsers_used) <= 1:
                        continue
                        
                    # Calculate performance for each browser
                    browser_scores = {}
                    for b in browsers_used:
                        # Get all platforms for this browser and model
                        platforms = list(self.history[b][model_type][model_name].keys())
                        
                        # Skip if no platforms
                        if not platforms:
                            continue
                            
                        # Find best platform for this browser
                        best_score = float('inf')
                        for platform in platforms:
                            metrics_list = self.history[b][model_type][model_name][platform]
                            
                            # Skip if not enough samples
                            if len(metrics_list) < self.config["min_samples_for_recommendation"]:
                                continue
                                
                            # Calculate score for this platform
                            score = 0
                            total_weight = 0
                            
                            for metric_name, config in self.config["optimization_metrics"].items():
                                # Get values for this metric
                                values = [m.get(metric_name) for m in metrics_list 
                                         if metric_name in m and m.get(metric_name) is not None]
                                
                                # Skip if not enough values
                                if len(values) < self.config["min_samples_for_recommendation"]:
                                    continue
                                    
                                weight = config["weight"]
                                value = statistics.mean(values)
                                lower_better = config["lower_better"]
                                
                                # Add to score (invert if higher is better)
                                if lower_better:
                                    score += weight * value
                                else:
                                    # For metrics where higher is better, invert
                                    score += weight * (1.0 / max(value, 0.001))
                                    
                                total_weight += weight
                            
                            # Normalize score
                            if total_weight > 0:
                                score /= total_weight
                                
                            # Update best score
                            best_score = min(best_score, score)
                        
                        # Store best score for this browser
                        if best_score != float('inf'):
                            browser_scores[b] = best_score
                    
                    # Skip if not enough browsers with scores
                    if len(browser_scores) <= 1:
                        continue
                        
                    # Rank browsers (1 = best)
                    ranked_browsers = sorted(browser_scores.items(), key=lambda x: x[1])
                    browser_ranks = {b: i+1 for i, (b, _) in enumerate(ranked_browsers)}
                    
                    # Add rank for this browser and model
                    if browser in browser_ranks:
                        model_ranks.append((browser_ranks[browser], len(browser_ranks)))
                
                # Skip if not enough models with ranks
                if len(model_ranks) < self.config["min_samples_for_recommendation"]:
                    continue
                    
                # Calculate average normalized rank (0-1 scale, lower is better)
                normalized_ranks = [(rank - 1) / (total - 1) if total > 1 else 0.5 
                                   for rank, total in model_ranks]
                avg_normalized_rank = statistics.mean(normalized_ranks)
                
                # Calculate capability score (0-100 scale, higher is better)
                capability_score = 100 * (1 - avg_normalized_rank)
                
                # Calculate confidence (based on number of models and consistency)
                num_models = len(model_ranks)
                consistency = 1 - (statistics.stdev(normalized_ranks) if len(normalized_ranks) > 1 else 0.5)
                confidence = min(1.0, (num_models / 10) * consistency)
                
                # Store capability score
                self.capability_scores[browser][model_type] = {
                    "score": capability_score,
                    "rank": avg_normalized_rank,
                    "confidence": confidence,
                    "sample_size": num_models,
                    "consistency": consistency,
                    "timestamp": datetime.now()
                }
                
                # Store in database if available
                if hasattr(self, 'db_conn'):
                    try:
                        self.db_conn.execute("""
                            INSERT INTO browser_capability_scores
                            (timestamp, browser, model_type, score, confidence, sample_size, metrics)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, [
                            datetime.now(), browser, model_type, capability_score,
                            confidence, num_models, json.dumps({
                                "rank": avg_normalized_rank,
                                "consistency": consistency,
                                "normalized_ranks": normalized_ranks
                            })
                        ])
                        
                    except Exception as e:
                        logger.error(f"Error storing capability score in database: {e}")
                
                logger.info(f"Updated capability score for {browser} / {model_type}: "
                           f"{capability_score:.1f} (confidence: {confidence:.2f})")
    
    def _update_baselines(self):
        """Update performance baselines for anomaly detection."""
        # Update baselines for each browser, model type, model name, platform
        for browser in self.history:
            if browser not in self.baselines:
                self.baselines[browser] = defaultdict(lambda: defaultdict(dict))
                
            for model_type in self.history[browser]:
                for model_name in self.history[browser][model_type]:
                    for platform in self.history[browser][model_type][model_name]:
                        # Get metrics for this combination
                        metrics_list = self.history[browser][model_type][model_name][platform]
                        
                        # Skip if not enough metrics
                        if len(metrics_list) < self.config["min_samples_for_recommendation"]:
                            continue
                            
                        # Calculate baselines for each metric
                        for metric_name in self.config["optimization_metrics"]:
                            # Get values for this metric
                            values = [m.get(metric_name) for m in metrics_list 
                                     if metric_name in m and m.get(metric_name) is not None]
                            
                            # Skip if not enough values
                            if len(values) < self.config["min_samples_for_recommendation"]:
                                continue
                                
                            # Calculate statistics
                            baseline = {
                                "mean": statistics.mean(values),
                                "median": statistics.median(values),
                                "stdev": statistics.stdev(values) if len(values) > 1 else 0,
                                "min": min(values),
                                "max": max(values),
                                "samples": len(values),
                                "updated_at": datetime.now()
                            }
                            
                            # Store baseline
                            baseline_key = f"{model_name}:{platform}:{metric_name}"
                            self.baselines[browser][model_type][baseline_key] = baseline
        
        logger.info("Updated performance baselines")
    
    def _clean_up_history(self):
        """Clean up old history based on history_days config."""
        cutoff_date = datetime.now() - timedelta(days=self.config["history_days"])
        
        # Clean up in-memory history
        for browser in list(self.history.keys()):
            for model_type in list(self.history[browser].keys()):
                for model_name in list(self.history[browser][model_type].keys()):
                    for platform in list(self.history[browser][model_type][model_name].keys()):
                        # Filter metrics by timestamp
                        metrics_list = self.history[browser][model_type][model_name][platform]
                        filtered_metrics = [m for m in metrics_list 
                                           if m.get("timestamp") >= cutoff_date]
                        
                        # Update metrics list
                        if not filtered_metrics:
                            # Remove empty platform
                            del self.history[browser][model_type][model_name][platform]
                        else:
                            self.history[browser][model_type][model_name][platform] = filtered_metrics
                    
                    # Remove empty model name
                    if not self.history[browser][model_type][model_name]:
                        del self.history[browser][model_type][model_name]
                
                # Remove empty model type
                if not self.history[browser][model_type]:
                    del self.history[browser][model_type]
            
            # Remove empty browser
            if not self.history[browser]:
                del self.history[browser]
        
        # Clean up database if available
        if hasattr(self, 'db_conn'):
            try:
                # Delete old performance records
                self.db_conn.execute(f"""
                    DELETE FROM browser_performance
                    WHERE timestamp < '{cutoff_date.isoformat()}'
                """)
                
                # Delete old recommendations
                self.db_conn.execute(f"""
                    DELETE FROM browser_recommendations
                    WHERE timestamp < '{cutoff_date.isoformat()}'
                """)
                
                # Delete old capability scores
                self.db_conn.execute(f"""
                    DELETE FROM browser_capability_scores
                    WHERE timestamp < '{cutoff_date.isoformat()}'
                """)
                
            except Exception as e:
                logger.error(f"Error cleaning up database: {e}")
        
        logger.info(f"Cleaned up history older than {cutoff_date}")
    
    def detect_anomalies(self, browser: str, model_type: str, model_name: str,
                        platform: str, metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Detect anomalies in performance metrics.
        
        Args:
            browser: Browser name
            model_type: Type of model
            model_name: Name of model
            platform: Hardware platform
            metrics: Dictionary of performance metrics
            
        Returns:
            List of detected anomalies
        """
        browser = browser.lower()
        model_type = model_type.lower()
        platform = platform.lower()
        
        anomalies = []
        
        # Check if we have a baseline for this combination
        if (browser in self.baselines and 
            model_type in self.baselines[browser]):
            
            # Check each metric
            for metric_name in self.config["optimization_metrics"]:
                if metric_name not in metrics:
                    continue
                    
                # Get the metric value
                value = metrics[metric_name]
                
                # Get the baseline key
                baseline_key = f"{model_name}:{platform}:{metric_name}"
                
                # Check if we have a baseline for this metric
                if baseline_key in self.baselines[browser][model_type]:
                    baseline = self.baselines[browser][model_type][baseline_key]
                    
                    # Skip if standard deviation is zero
                    if baseline["stdev"] <= 0:
                        continue
                        
                    # Calculate z-score
                    z_score = (value - baseline["mean"]) / baseline["stdev"]
                    
                    # Check if anomaly
                    if abs(z_score) > self.config["anomaly_detection_threshold"]:
                        # Create anomaly record
                        anomaly = {
                            "browser": browser,
                            "model_type": model_type,
                            "model_name": model_name,
                            "platform": platform,
                            "metric": metric_name,
                            "value": value,
                            "baseline_mean": baseline["mean"],
                            "baseline_stdev": baseline["stdev"],
                            "z_score": z_score,
                            "is_high": z_score > 0,
                            "timestamp": datetime.now()
                        }
                        
                        anomalies.append(anomaly)
                        
                        logger.warning(
                            f"Detected anomaly: {browser}/{model_type}/{model_name}/{platform}, "
                            f"{metric_name}={value:.2f}, z-score={z_score:.2f}, "
                            f"baseline={baseline['mean']:.2f}±{baseline['stdev']:.2f}"
                        )
        
        return anomalies
    
    def get_browser_recommendations(self, model_type: str, model_name: str = None) -> Dict[str, Any]:
        """Get browser recommendations for a model type or specific model.
        
        Args:
            model_type: Type of model
            model_name: Optional specific model name
            
        Returns:
            Dictionary with recommendations
        """
        model_type = model_type.lower()
        
        # If model name provided, get specific recommendation
        if model_name:
            model_name = model_name.lower()
            
            # Check if we have a recommendation for this model
            if model_type in self.recommendations and model_name in self.recommendations[model_type]:
                return self.recommendations[model_type][model_name]
                
            # If no specific recommendation, fall back to model type recommendation
        
        # Get recommendations for all models of this type
        models_of_type = {}
        if model_type in self.recommendations:
            models_of_type = self.recommendations[model_type]
            
        # If no models of this type, check browser capability scores
        if not models_of_type:
            # Find best browser based on capability scores
            best_browser = None
            best_score = -1
            highest_confidence = -1
            
            for browser, model_types in self.capability_scores.items():
                if model_type in model_types:
                    score_data = model_types[model_type]
                    score = score_data.get("score", 0)
                    confidence = score_data.get("confidence", 0)
                    
                    # Check if better than current best (prioritize by confidence if scores are close)
                    if score > best_score or (abs(score - best_score) < 5 and confidence > highest_confidence):
                        best_browser = browser
                        best_score = score
                        highest_confidence = confidence
            
            # If found a best browser, create a recommendation
            if best_browser:
                # Find best platform for this browser type
                platform = "webgpu"  # Default to WebGPU
                
                # Check for browser-specific platform preferences
                if best_browser == "edge" and model_type == "text_embedding":
                    platform = "webnn"  # Edge is best for WebNN with text models
                
                # Create config based on browser-specific optimizations
                config = {}
                if best_browser in self.config["browser_specific_optimizations"]:
                    browser_opts = self.config["browser_specific_optimizations"][best_browser]
                    if model_type in browser_opts:
                        config.update(browser_opts[model_type])
                
                return {
                    "recommended_browser": best_browser,
                    "recommended_platform": platform,
                    "confidence": highest_confidence,
                    "based_on": "capability_scores",
                    "sample_size": self.capability_scores[best_browser][model_type].get("sample_size", 0),
                    "config": config
                }
        
        # If we have models of this type, aggregate recommendations
        if models_of_type:
            # Count browser recommendations
            browser_counts = {}
            platform_counts = {}
            total_models = len(models_of_type)
            
            weighted_confidence = 0
            
            for model, recommendation in models_of_type.items():
                browser = recommendation.get("recommended_browser")
                platform = recommendation.get("recommended_platform")
                confidence = recommendation.get("confidence", 0)
                
                # Update browser counts
                if browser:
                    browser_counts[browser] = browser_counts.get(browser, 0) + 1
                    weighted_confidence += confidence
                
                # Update platform counts
                if platform:
                    platform_counts[platform] = platform_counts.get(platform, 0) + 1
            
            # Find most recommended browser and platform
            best_browser = max(browser_counts.items(), key=lambda x: x[1])[0] if browser_counts else None
            best_platform = max(platform_counts.items(), key=lambda x: x[1])[0] if platform_counts else None
            
            # Calculate confidence
            confidence = weighted_confidence / total_models if total_models > 0 else 0
            
            # If we found a best browser, create a recommendation
            if best_browser:
                # Create config based on browser-specific optimizations
                config = {}
                if best_browser in self.config["browser_specific_optimizations"]:
                    browser_opts = self.config["browser_specific_optimizations"][best_browser]
                    if model_type in browser_opts:
                        config.update(browser_opts[model_type])
                
                return {
                    "recommended_browser": best_browser,
                    "recommended_platform": best_platform,
                    "confidence": confidence,
                    "based_on": "model_aggregation",
                    "sample_size": total_models,
                    "browser_distribution": browser_counts,
                    "platform_distribution": platform_counts,
                    "config": config
                }
        
        # If no recommendations, return default based on model type
        default_recommendations = {
            "text_embedding": {"browser": "edge", "platform": "webnn"},
            "vision": {"browser": "chrome", "platform": "webgpu"},
            "audio": {"browser": "firefox", "platform": "webgpu"},
            "text": {"browser": "edge", "platform": "webnn"},
            "multimodal": {"browser": "chrome", "platform": "webgpu"}
        }
        
        # Get default recommendation for this model type
        default = default_recommendations.get(model_type, {"browser": "chrome", "platform": "webgpu"})
        
        # Create config based on browser-specific optimizations
        config = {}
        if default["browser"] in self.config["browser_specific_optimizations"]:
            browser_opts = self.config["browser_specific_optimizations"][default["browser"]]
            if model_type in browser_opts:
                config.update(browser_opts[model_type])
        
        return {
            "recommended_browser": default["browser"],
            "recommended_platform": default["platform"],
            "confidence": 0.3,  # Low confidence for default recommendation
            "based_on": "default",
            "config": config
        }
    
    def get_optimized_browser_config(self, model_type: str, model_name: str = None) -> Dict[str, Any]:
        """Get optimized browser configuration based on performance history.
        
        Args:
            model_type: Type of model
            model_name: Optional specific model name
            
        Returns:
            Dictionary with optimized configuration
        """
        # Get recommendations
        recommendation = self.get_browser_recommendations(model_type, model_name)
        
        # Extract key info
        browser = recommendation.get("recommended_browser", "chrome")
        platform = recommendation.get("recommended_platform", "webgpu")
        config = recommendation.get("config", {})
        
        # Create complete configuration
        optimized_config = {
            "browser": browser,
            "platform": platform,
            "confidence": recommendation.get("confidence", 0),
            "based_on": recommendation.get("based_on", "default"),
            "model_type": model_type
        }
        
        # Add specific optimizations
        optimized_config.update(config)
        
        # Apply browser and model type specific optimizations
        if browser == "firefox" and model_type == "audio":
            optimized_config["compute_shader_optimization"] = True
            optimized_config["optimize_audio"] = True
            
        elif browser == "edge" and model_type in ["text", "text_embedding"]:
            optimized_config["webnn_optimization"] = True
            
        elif browser == "chrome" and model_type == "vision":
            optimized_config["parallel_compute_pipelines"] = True
        
        return optimized_config
    
    def get_performance_history(self, browser: str = None, model_type: str = None, 
                               model_name: str = None, days: int = None) -> Dict[str, Any]:
        """Get performance history for specified filters.
        
        Args:
            browser: Optional browser filter
            model_type: Optional model type filter
            model_name: Optional model name filter
            days: Optional number of days to limit history
            
        Returns:
            Dictionary with performance history
        """
        # Set default days if not specified
        if days is None:
            days = self.config["history_days"]
            
        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Filter history
        filtered_history = {}
        
        # Apply browser filter
        if browser:
            browser = browser.lower()
            if browser in self.history:
                filtered_history[browser] = self.history[browser]
        else:
            filtered_history = self.history
        
        # Apply model type and name filters
        result = {}
        
        for b in filtered_history:
            if model_type:
                model_type = model_type.lower()
                if model_type in filtered_history[b]:
                    if model_name:
                        model_name = model_name.lower()
                        if model_name in filtered_history[b][model_type]:
                            # Filter by timestamp
                            filtered_models = {}
                            for platform, metrics_list in filtered_history[b][model_type][model_name].items():
                                filtered_metrics = [m for m in metrics_list 
                                                  if m.get("timestamp") >= cutoff_date]
                                if filtered_metrics:
                                    filtered_models[platform] = filtered_metrics
                            
                            if filtered_models:
                                if b not in result:
                                    result[b] = {}
                                if model_type not in result[b]:
                                    result[b][model_type] = {}
                                result[b][model_type][model_name] = filtered_models
                    else:
                        # Filter by timestamp
                        filtered_types = {}
                        for model, platforms in filtered_history[b][model_type].items():
                            filtered_models = {}
                            for platform, metrics_list in platforms.items():
                                filtered_metrics = [m for m in metrics_list 
                                                  if m.get("timestamp") >= cutoff_date]
                                if filtered_metrics:
                                    filtered_models[platform] = filtered_metrics
                            
                            if filtered_models:
                                filtered_types[model] = filtered_models
                        
                        if filtered_types:
                            if b not in result:
                                result[b] = {}
                            result[b][model_type] = filtered_types
            else:
                # Apply timestamp filter only
                filtered_browser = {}
                for mt, models in filtered_history[b].items():
                    filtered_types = {}
                    for model, platforms in models.items():
                        filtered_models = {}
                        for platform, metrics_list in platforms.items():
                            filtered_metrics = [m for m in metrics_list 
                                              if m.get("timestamp") >= cutoff_date]
                            if filtered_metrics:
                                filtered_models[platform] = filtered_metrics
                        
                        if filtered_models:
                            filtered_types[model] = filtered_models
                    
                    if filtered_types:
                        filtered_browser[mt] = filtered_types
                
                if filtered_browser:
                    result[b] = filtered_browser
        
        return result
    
    def get_capability_scores(self, browser: str = None, model_type: str = None) -> Dict[str, Any]:
        """Get browser capability scores.
        
        Args:
            browser: Optional browser filter
            model_type: Optional model type filter
            
        Returns:
            Dictionary with capability scores
        """
        # Apply filters
        result = {}
        
        for b in self.capability_scores:
            if browser and b.lower() != browser.lower():
                continue
                
            browser_scores = {}
            for mt in self.capability_scores[b]:
                if model_type and mt.lower() != model_type.lower():
                    continue
                    
                browser_scores[mt] = self.capability_scores[b][mt]
            
            if browser_scores:
                result[b] = browser_scores
        
        return result
    
    def close(self):
        """Close the browser performance history tracker."""
        # Stop automatic updates
        self.stop_automatic_updates()
        
        # Close database connection if open
        if hasattr(self, 'db_conn'):
            try:
                self.db_conn.close()
                logger.info("Closed database connection")
            except Exception as e:
                logger.error(f"Error closing database connection: {e}")
        
        logger.info("Closed browser performance history tracker")

# Example usage
def run_example():
    """Run a demonstration of the browser performance history tracker."""
    logging.info("Starting browser performance history example")
    
    # Create history tracker
    history = BrowserPerformanceHistory()
    
    # Add some example performance data
    history.record_execution(
        browser="chrome",
        model_type="text_embedding",
        model_name="bert-base-uncased",
        platform="webgpu",
        metrics={
            "latency_ms": 120.5,
            "throughput_tokens_per_sec": 1850.2,
            "memory_mb": 350.6,
            "batch_size": 32,
            "success": True
        }
    )
    
    history.record_execution(
        browser="edge",
        model_type="text_embedding",
        model_name="bert-base-uncased",
        platform="webnn",
        metrics={
            "latency_ms": 95.2,
            "throughput_tokens_per_sec": 2100.8,
            "memory_mb": 320.3,
            "batch_size": 32,
            "success": True
        }
    )
    
    history.record_execution(
        browser="firefox",
        model_type="audio",
        model_name="whisper-tiny",
        platform="webgpu",
        metrics={
            "latency_ms": 210.3,
            "throughput_tokens_per_sec": 980.5,
            "memory_mb": 420.8,
            "batch_size": 8,
            "success": True
        }
    )
    
    history.record_execution(
        browser="chrome",
        model_type="audio",
        model_name="whisper-tiny",
        platform="webgpu",
        metrics={
            "latency_ms": 260.7,
            "throughput_tokens_per_sec": 850.3,
            "memory_mb": 450.2,
            "batch_size": 8,
            "success": True
        }
    )
    
    # Add more samples for better recommendations
    for _ in range(5):
        history.record_execution(
            browser="edge",
            model_type="text_embedding",
            model_name="bert-base-uncased",
            platform="webnn",
            metrics={
                "latency_ms": 90 + (10 * np.random.random()),
                "throughput_tokens_per_sec": 2050 + (100 * np.random.random()),
                "memory_mb": 315 + (20 * np.random.random()),
                "batch_size": 32,
                "success": True
            }
        )
        
        history.record_execution(
            browser="chrome",
            model_type="text_embedding",
            model_name="bert-base-uncased",
            platform="webgpu",
            metrics={
                "latency_ms": 115 + (10 * np.random.random()),
                "throughput_tokens_per_sec": 1800 + (100 * np.random.random()),
                "memory_mb": 340 + (20 * np.random.random()),
                "batch_size": 32,
                "success": True
            }
        )
        
        history.record_execution(
            browser="firefox",
            model_type="audio",
            model_name="whisper-tiny",
            platform="webgpu",
            metrics={
                "latency_ms": 200 + (20 * np.random.random()),
                "throughput_tokens_per_sec": 950 + (60 * np.random.random()),
                "memory_mb": 410 + (30 * np.random.random()),
                "batch_size": 8,
                "success": True
            }
        )
    
    # Force update recommendations
    history._update_recommendations()
    
    # Get recommendations
    text_recommendation = history.get_browser_recommendations("text_embedding", "bert-base-uncased")
    audio_recommendation = history.get_browser_recommendations("audio", "whisper-tiny")
    
    logging.info(f"Text embedding recommendation: {text_recommendation}")
    logging.info(f"Audio recommendation: {audio_recommendation}")
    
    # Get optimized browser config
    text_config = history.get_optimized_browser_config("text_embedding", "bert-base-uncased")
    audio_config = history.get_optimized_browser_config("audio", "whisper-tiny")
    
    logging.info(f"Text embedding optimized config: {text_config}")
    logging.info(f"Audio optimized config: {audio_config}")
    
    # Close history tracker
    history.close()
    
    logging.info("Browser performance history example completed")

if __name__ == "__main__":
    # Configure detailed logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[logging.StreamHandler()]
    )
    
    # Run the example
    run_example()