#!/usr/bin/env python3
"""
Advanced Fault Tolerance Visualization System

This module provides comprehensive visualization tools for analyzing fault tolerance
validation results from the cross-browser model sharding system. It generates
interactive visualizations for recovery performance, success rates, and performance
impact metrics.

Usage:
    from fixed_web_platform.visualization.fault_tolerance_visualizer import FaultToleranceVisualizer
    
    # Create visualizer with validation results
    visualizer = FaultToleranceVisualizer(validation_results)
    
    # Generate visualizations
    visualizer.generate_recovery_time_comparison("recovery_times.png")
    visualizer.generate_success_rate_dashboard("success_rates.html")
    visualizer.generate_comprehensive_report("fault_tolerance_report.html")
"""

import os
import sys
import json
import time
import logging
import datetime
import traceback
from typing import Dict, List, Any, Optional, Tuple, Set
from pathlib import Path

# Import visualization libraries
try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.colors as mcolors
    from matplotlib.figure import Figure
    import numpy as np
    
    # For HTML output
    from jinja2 import Template
    
    VISUALIZATION_AVAILABLE = True
except ImportError:
    VISUALIZATION_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

class FaultToleranceVisualizer:
    """Visualizer for fault tolerance validation results."""
    
    def __init__(self, validation_results: Dict[str, Any]) -> None:
        """
        Initialize the fault tolerance visualizer.
        
        Args:
            validation_results: Dictionary with validation results from FaultToleranceValidator
        """
        self.validation_results = validation_results
        self.available = VISUALIZATION_AVAILABLE
        self.output_dir = None
        self.logger = logger
        
        if not self.available:
            self.logger.warning("Visualization libraries not available. Install matplotlib and jinja2.")
    
    def set_output_directory(self, output_dir: str) -> None:
        """
        Set output directory for visualizations.
        
        Args:
            output_dir: Path to output directory
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.logger.info(f"Set output directory to: {output_dir}")
    
    def generate_recovery_time_comparison(self, output_path: str) -> Optional[str]:
        """
        Generate a visualization comparing recovery times across different scenarios.
        
        Args:
            output_path: Path to save the visualization
            
        Returns:
            Path to the generated visualization or None if generation failed
        """
        if not self.available:
            self.logger.warning("Cannot generate visualization: required libraries not available")
            return None
        
        try:
            # Prepare output path
            if self.output_dir:
                output_path = os.path.join(self.output_dir, output_path)
            
            # Extract recovery times from scenario results
            scenario_results = self.validation_results.get("scenario_results", {})
            scenarios = []
            recovery_times = []
            colors = []
            
            for scenario, result in scenario_results.items():
                if result.get("success", False) and "recovery_time_ms" in result:
                    scenarios.append(scenario.replace("_", " "))
                    recovery_times.append(result["recovery_time_ms"])
                    # Choose color based on recovery time
                    if result["recovery_time_ms"] < 1000:
                        colors.append("green")
                    elif result["recovery_time_ms"] < 2000:
                        colors.append("orange")
                    else:
                        colors.append("red")
            
            if not scenarios:
                self.logger.warning("No recovery time data available for visualization")
                return None
            
            # Create the visualization
            plt.figure(figsize=(10, 6))
            bars = plt.bar(scenarios, recovery_times, color=colors)
            
            # Add value labels on top of each bar
            for bar in bars:
                height = bar.get_height()
                plt.text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:.1f}ms',
                        ha='center', va='bottom')
            
            plt.xlabel('Failure Scenario')
            plt.ylabel('Recovery Time (ms)')
            plt.title('Recovery Time Comparison Across Failure Scenarios')
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout()
            
            # Save the figure
            plt.savefig(output_path)
            plt.close()
            
            self.logger.info(f"Recovery time comparison visualization saved to: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Error generating recovery time comparison: {e}")
            traceback.print_exc()
            return None
    
    def generate_success_rate_dashboard(self, output_path: str) -> Optional[str]:
        """
        Generate a dashboard visualization showing success rates across scenarios.
        
        Args:
            output_path: Path to save the visualization
            
        Returns:
            Path to the generated visualization or None if generation failed
        """
        if not self.available:
            self.logger.warning("Cannot generate visualization: required libraries not available")
            return None
        
        try:
            # Prepare output path
            if self.output_dir:
                output_path = os.path.join(self.output_dir, output_path)
            
            # Extract success rates from scenario results
            scenario_results = self.validation_results.get("scenario_results", {})
            scenarios = []
            success_rates = []
            color_map = mcolors.LinearSegmentedColormap.from_list("success_gradient", ["red", "orange", "green"])
            
            # Check if there are multiple runs for scenarios
            multiple_runs = False
            for scenario, result in scenario_results.items():
                if isinstance(result, list) and len(result) > 1:
                    multiple_runs = True
                    break
            
            if multiple_runs:
                # Calculate success rates across multiple runs
                scenario_success_counts = {}
                scenario_run_counts = {}
                
                for scenario, results in scenario_results.items():
                    if not isinstance(results, list):
                        results = [results]
                    
                    if scenario not in scenario_success_counts:
                        scenario_success_counts[scenario] = 0
                        scenario_run_counts[scenario] = 0
                    
                    for result in results:
                        scenario_run_counts[scenario] += 1
                        if result.get("success", False):
                            scenario_success_counts[scenario] += 1
                
                for scenario in scenario_success_counts:
                    success_rate = scenario_success_counts[scenario] / scenario_run_counts[scenario] if scenario_run_counts[scenario] > 0 else 0
                    scenarios.append(scenario.replace("_", " "))
                    success_rates.append(success_rate)
            else:
                # Simple success/failure for each scenario
                for scenario, result in scenario_results.items():
                    scenarios.append(scenario.replace("_", " "))
                    success_rates.append(1.0 if result.get("success", False) else 0.0)
            
            if not scenarios:
                self.logger.warning("No scenario data available for visualization")
                return None
            
            # Create the visualization
            fig, ax = plt.subplots(figsize=(10, 6))
            
            # Create horizontal bar chart with success rate gradient
            bars = ax.barh(scenarios, success_rates, color=[color_map(rate) for rate in success_rates])
            
            # Add value labels to the right of each bar
            for i, bar in enumerate(bars):
                width = bar.get_width()
                label = f'{width:.1%}'
                ax.text(max(width + 0.05, 0.1), i, label, va='center')
            
            ax.set_xlabel('Success Rate')
            ax.set_title('Failure Scenario Success Rates')
            ax.set_xlim(0, 1.1)  # Scale from 0 to 110% to leave room for labels
            
            # Add vertical lines for visual reference
            ax.axvline(x=0.7, color='orange', linestyle='--', alpha=0.7, label='Warning Threshold (70%)')
            ax.axvline(x=0.9, color='green', linestyle='--', alpha=0.7, label='Success Threshold (90%)')
            ax.legend()
            
            plt.tight_layout()
            
            # Save the figure
            plt.savefig(output_path)
            plt.close()
            
            self.logger.info(f"Success rate dashboard saved to: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Error generating success rate dashboard: {e}")
            traceback.print_exc()
            return None
    
    def generate_performance_impact_visualization(self, output_path: str) -> Optional[str]:
        """
        Generate a visualization showing performance impact of fault tolerance features.
        
        Args:
            output_path: Path to save the visualization
            
        Returns:
            Path to the generated visualization or None if generation failed
        """
        if not self.available:
            self.logger.warning("Cannot generate visualization: required libraries not available")
            return None
        
        try:
            # Prepare output path
            if self.output_dir:
                output_path = os.path.join(self.output_dir, output_path)
            
            # Extract performance impact data
            perf_impact = self.validation_results.get("performance_impact", {})
            if not perf_impact or not perf_impact.get("summary", {}).get("performance_impact_measured", False):
                self.logger.warning("No performance impact data available for visualization")
                return None
            
            # Extract measurements
            measurements = perf_impact.get("measurements", [])
            successful_measurements = [m for m in measurements if not m.get("has_error", False)]
            
            if not successful_measurements:
                self.logger.warning("No successful performance measurements available")
                return None
            
            # Extract times for successful measurements
            iterations = [m["iteration"] for m in successful_measurements]
            times = [m["inference_time_ms"] for m in successful_measurements]
            
            # Create plot
            plt.figure(figsize=(10, 6))
            plt.plot(iterations, times, marker='o', linestyle='-', color='blue')
            
            # Add summary statistics
            summary = perf_impact["summary"]
            avg_time = summary.get("average_time_ms", 0)
            min_time = summary.get("min_time_ms", 0)
            max_time = summary.get("max_time_ms", 0)
            
            # Add reference lines
            plt.axhline(y=avg_time, color='red', linestyle='--', label=f'Avg: {avg_time:.1f}ms')
            plt.axhline(y=min_time, color='green', linestyle=':', label=f'Min: {min_time:.1f}ms')
            plt.axhline(y=max_time, color='orange', linestyle=':', label=f'Max: {max_time:.1f}ms')
            
            plt.xlabel('Iteration')
            plt.ylabel('Inference Time (ms)')
            plt.title('Performance Impact of Fault Tolerance Features')
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            
            # Save the figure
            plt.savefig(output_path)
            plt.close()
            
            self.logger.info(f"Performance impact visualization saved to: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Error generating performance impact visualization: {e}")
            traceback.print_exc()
            return None
    
    def generate_recovery_strategy_comparison(self, output_path: str, results_by_strategy: Dict[str, Dict[str, Any]]) -> Optional[str]:
        """
        Generate a comparison of different recovery strategies.
        
        Args:
            output_path: Path to save the visualization
            results_by_strategy: Dictionary mapping strategy names to validation results
            
        Returns:
            Path to the generated visualization or None if generation failed
        """
        if not self.available:
            self.logger.warning("Cannot generate visualization: required libraries not available")
            return None
        
        try:
            # Prepare output path
            if self.output_dir:
                output_path = os.path.join(self.output_dir, output_path)
            
            # Check if we have data for multiple strategies
            if not results_by_strategy or len(results_by_strategy) < 2:
                self.logger.warning("Not enough data for strategy comparison")
                return None
            
            # Extract recovery times by strategy and scenario
            strategies = list(results_by_strategy.keys())
            all_scenarios = set()
            recovery_data = {}
            
            for strategy, results in results_by_strategy.items():
                scenario_results = results.get("scenario_results", {})
                recovery_data[strategy] = {}
                
                for scenario, result in scenario_results.items():
                    if result.get("success", False) and "recovery_time_ms" in result:
                        recovery_data[strategy][scenario] = result["recovery_time_ms"]
                        all_scenarios.add(scenario)
            
            # Convert to ordered lists for plotting
            scenarios_list = sorted(list(all_scenarios))
            strategy_times = []
            
            for strategy in strategies:
                times = [recovery_data[strategy].get(scenario, 0) for scenario in scenarios_list]
                strategy_times.append(times)
            
            # Format x-labels
            x_labels = [s.replace("_", " ") for s in scenarios_list]
            
            # Set up the plot
            fig, ax = plt.subplots(figsize=(12, 7))
            
            # Set width of bars
            bar_width = 0.8 / len(strategies)
            
            # Set position of bars on X axis
            positions = np.arange(len(scenarios_list))
            
            # Create bars
            for i, strategy in enumerate(strategies):
                offset = (i - len(strategies)/2 + 0.5) * bar_width
                bars = ax.bar(positions + offset, strategy_times[i], bar_width, 
                        label=strategy, alpha=0.8)
                
                # Add value labels
                for bar, value in zip(bars, strategy_times[i]):
                    if value > 0:  # Only label non-zero values
                        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 50,
                              f'{value:.0f}', ha='center', va='bottom', fontsize=8)
            
            # Add labels and title
            ax.set_xlabel('Failure Scenario')
            ax.set_ylabel('Recovery Time (ms)')
            ax.set_title('Recovery Time Comparison by Strategy')
            ax.set_xticks(positions)
            ax.set_xticklabels(x_labels, rotation=45, ha='right')
            ax.legend()
            
            plt.tight_layout()
            
            # Save the figure
            plt.savefig(output_path)
            plt.close()
            
            self.logger.info(f"Recovery strategy comparison saved to: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Error generating recovery strategy comparison: {e}")
            traceback.print_exc()
            return None
    
    def generate_comprehensive_report(self, output_path: str) -> Optional[str]:
        """
        Generate a comprehensive HTML report with all visualizations and analysis.
        
        Args:
            output_path: Path to save the report
            
        Returns:
            Path to the generated report or None if generation failed
        """
        if not self.available:
            self.logger.warning("Cannot generate report: required libraries not available")
            return None
        
        try:
            # Prepare output path and directory for visualization assets
            # Ensure output_path is absolute to avoid path nesting issues
            if not os.path.isabs(output_path):
                if self.output_dir:
                    output_path = os.path.join(os.path.abspath(self.output_dir), output_path)
                else:
                    output_path = os.path.abspath(output_path)
            
            report_dir = os.path.dirname(output_path)
            assets_dir = os.path.join(report_dir, "assets")
            os.makedirs(assets_dir, exist_ok=True)
            
            # Generate individual visualizations using absolute paths
            recovery_time_path = os.path.join(assets_dir, "recovery_times.png")
            abs_recovery_path = os.path.abspath(recovery_time_path)
            self.generate_recovery_time_comparison(abs_recovery_path)
            
            success_rate_path = os.path.join(assets_dir, "success_rates.png")
            abs_success_path = os.path.abspath(success_rate_path)
            self.generate_success_rate_dashboard(abs_success_path)
            
            perf_impact_path = os.path.join(assets_dir, "performance_impact.png")
            abs_perf_path = os.path.abspath(perf_impact_path)
            self.generate_performance_impact_visualization(abs_perf_path)
            
            # Prepare data for the report
            validation_status = self.validation_results.get("validation_status", "unknown")
            status_color = self._get_status_color(validation_status)
            
            # Extract overall metrics
            overall_metrics = self.validation_results.get("overall_metrics", {})
            
            # Extract scenario results for detailed table
            scenario_results = self.validation_results.get("scenario_results", {})
            scenario_table_data = []
            
            for scenario, result in scenario_results.items():
                row = {
                    "scenario": scenario.replace("_", " "),
                    "status": result.get("status", "unknown") if "status" in result else 
                             "passed" if result.get("success", False) else "failed",
                    "recovery_time_ms": result.get("recovery_time_ms", "N/A"),
                    "details": {}
                }
                
                # Add failure details if available
                if "failure_result" in result:
                    row["details"]["failure"] = result["failure_result"]
                
                # Add recovery details if available
                if "recovery_result" in result:
                    recovery_result = result["recovery_result"]
                    row["details"]["recovery_steps"] = recovery_result.get("recovery_steps", [])
                    row["details"]["recovered"] = recovery_result.get("recovered", False)
                
                # Add integrity details if available
                if "integrity_verified" in result:
                    row["details"]["integrity_verified"] = result.get("integrity_verified", False)
                
                scenario_table_data.append(row)
            
            # Extract analysis if available
            analysis = None
            if "analysis" in self.validation_results:
                analysis = self.validation_results["analysis"]
            
            # Load the report template
            template_str = self._get_report_template()
            template = Template(template_str)
            
            # Render the template with data
            report_html = template.render(
                title="Fault Tolerance Validation Report",
                timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                validation_results=self.validation_results,
                overall_status=validation_status,
                status_color=status_color,
                overall_metrics=overall_metrics,
                scenario_table=scenario_table_data,
                analysis=analysis,
                recovery_time_chart="assets/recovery_times.png",
                success_rate_chart="assets/success_rates.png",
                performance_impact_chart="assets/performance_impact.png"
            )
            
            # Write the report to file
            with open(output_path, 'w') as f:
                f.write(report_html)
            
            self.logger.info(f"Comprehensive report saved to: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Error generating comprehensive report: {e}")
            traceback.print_exc()
            return None
    
    def generate_ci_compatible_report(self, output_path: str) -> Optional[str]:
        """
        Generate a CI-compatible HTML report with embedded visualizations for CI systems.
        
        Args:
            output_path: Path to save the report
            
        Returns:
            Path to the generated report or None if generation failed
        """
        if not self.available:
            self.logger.warning("Cannot generate CI report: required libraries not available")
            return None
        
        try:
            # Prepare output path
            if self.output_dir:
                output_path = os.path.join(self.output_dir, output_path)
            
            # Generate in-memory visualizations
            recovery_fig = self._generate_recovery_time_figure()
            success_fig = self._generate_success_rate_figure()
            perf_fig = self._generate_performance_impact_figure()
            
            # Convert figures to base64 encoded strings
            recovery_b64 = self._figure_to_base64(recovery_fig) if recovery_fig else None
            success_b64 = self._figure_to_base64(success_fig) if success_fig else None
            perf_b64 = self._figure_to_base64(perf_fig) if perf_fig else None
            
            # Prepare data for the report
            validation_status = self.validation_results.get("validation_status", "unknown")
            status_color = self._get_status_color(validation_status)
            
            # Extract overall metrics
            overall_metrics = self.validation_results.get("overall_metrics", {})
            
            # Extract scenario results for detailed table
            scenario_results = self.validation_results.get("scenario_results", {})
            scenario_table_data = []
            
            for scenario, result in scenario_results.items():
                row = {
                    "scenario": scenario.replace("_", " "),
                    "status": result.get("status", "unknown") if "status" in result else 
                             "passed" if result.get("success", False) else "failed",
                    "recovery_time_ms": result.get("recovery_time_ms", "N/A"),
                }
                scenario_table_data.append(row)
            
            # Extract analysis if available
            analysis = None
            if "analysis" in self.validation_results:
                analysis = self.validation_results["analysis"]
            
            # Load the CI report template
            template_str = self._get_ci_report_template()
            template = Template(template_str)
            
            # Render the template with data
            report_html = template.render(
                title="Fault Tolerance Validation CI Report",
                timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                validation_results=self.validation_results,
                overall_status=validation_status,
                status_color=status_color,
                overall_metrics=overall_metrics,
                scenario_table=scenario_table_data,
                analysis=analysis,
                recovery_time_b64=recovery_b64,
                success_rate_b64=success_b64,
                performance_impact_b64=perf_b64
            )
            
            # Write the report to file
            with open(output_path, 'w') as f:
                f.write(report_html)
            
            self.logger.info(f"CI-compatible report saved to: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Error generating CI-compatible report: {e}")
            traceback.print_exc()
            return None
    
    def _generate_recovery_time_figure(self) -> Optional[Figure]:
        """
        Generate a matplotlib figure for recovery time comparison.
        
        Returns:
            Matplotlib figure or None if generation failed
        """
        try:
            # Extract recovery times from scenario results
            scenario_results = self.validation_results.get("scenario_results", {})
            scenarios = []
            recovery_times = []
            colors = []
            
            for scenario, result in scenario_results.items():
                if result.get("success", False) and "recovery_time_ms" in result:
                    scenarios.append(scenario.replace("_", " "))
                    recovery_times.append(result["recovery_time_ms"])
                    # Choose color based on recovery time
                    if result["recovery_time_ms"] < 1000:
                        colors.append("green")
                    elif result["recovery_time_ms"] < 2000:
                        colors.append("orange")
                    else:
                        colors.append("red")
            
            if not scenarios:
                return None
            
            # Create the figure
            fig = Figure(figsize=(10, 6))
            ax = fig.add_subplot(111)
            bars = ax.bar(scenarios, recovery_times, color=colors)
            
            # Add value labels on top of each bar
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height,
                      f'{height:.1f}ms',
                      ha='center', va='bottom')
            
            ax.set_xlabel('Failure Scenario')
            ax.set_ylabel('Recovery Time (ms)')
            ax.set_title('Recovery Time Comparison Across Failure Scenarios')
            ax.tick_params(axis='x', rotation=45)
            fig.tight_layout()
            
            return fig
            
        except Exception as e:
            self.logger.error(f"Error generating recovery time figure: {e}")
            return None
    
    def _generate_success_rate_figure(self) -> Optional[Figure]:
        """
        Generate a matplotlib figure for success rate comparison.
        
        Returns:
            Matplotlib figure or None if generation failed
        """
        try:
            # Extract success rates from scenario results
            scenario_results = self.validation_results.get("scenario_results", {})
            scenarios = []
            success_rates = []
            color_map = mcolors.LinearSegmentedColormap.from_list("success_gradient", ["red", "orange", "green"])
            
            # Simple success/failure for each scenario
            for scenario, result in scenario_results.items():
                scenarios.append(scenario.replace("_", " "))
                success_rates.append(1.0 if result.get("success", False) else 0.0)
            
            if not scenarios:
                return None
            
            # Create the figure
            fig = Figure(figsize=(10, 6))
            ax = fig.add_subplot(111)
            
            # Create horizontal bar chart with success rate gradient
            bars = ax.barh(scenarios, success_rates, color=[color_map(rate) for rate in success_rates])
            
            # Add value labels to the right of each bar
            for i, bar in enumerate(bars):
                width = bar.get_width()
                label = f'{width:.1%}'
                ax.text(max(width + 0.05, 0.1), i, label, va='center')
            
            ax.set_xlabel('Success Rate')
            ax.set_title('Failure Scenario Success Rates')
            ax.set_xlim(0, 1.1)  # Scale from 0 to 110% to leave room for labels
            
            # Add vertical lines for visual reference
            ax.axvline(x=0.7, color='orange', linestyle='--', alpha=0.7, label='Warning Threshold (70%)')
            ax.axvline(x=0.9, color='green', linestyle='--', alpha=0.7, label='Success Threshold (90%)')
            ax.legend()
            
            fig.tight_layout()
            
            return fig
            
        except Exception as e:
            self.logger.error(f"Error generating success rate figure: {e}")
            return None
    
    def _generate_performance_impact_figure(self) -> Optional[Figure]:
        """
        Generate a matplotlib figure for performance impact.
        
        Returns:
            Matplotlib figure or None if generation failed
        """
        try:
            # Extract performance impact data
            perf_impact = self.validation_results.get("performance_impact", {})
            if not perf_impact or not perf_impact.get("summary", {}).get("performance_impact_measured", False):
                return None
            
            # Extract measurements
            measurements = perf_impact.get("measurements", [])
            successful_measurements = [m for m in measurements if not m.get("has_error", False)]
            
            if not successful_measurements:
                return None
            
            # Extract times for successful measurements
            iterations = [m["iteration"] for m in successful_measurements]
            times = [m["inference_time_ms"] for m in successful_measurements]
            
            # Create figure
            fig = Figure(figsize=(10, 6))
            ax = fig.add_subplot(111)
            ax.plot(iterations, times, marker='o', linestyle='-', color='blue')
            
            # Add summary statistics
            summary = perf_impact["summary"]
            avg_time = summary.get("average_time_ms", 0)
            min_time = summary.get("min_time_ms", 0)
            max_time = summary.get("max_time_ms", 0)
            
            # Add reference lines
            ax.axhline(y=avg_time, color='red', linestyle='--', label=f'Avg: {avg_time:.1f}ms')
            ax.axhline(y=min_time, color='green', linestyle=':', label=f'Min: {min_time:.1f}ms')
            ax.axhline(y=max_time, color='orange', linestyle=':', label=f'Max: {max_time:.1f}ms')
            
            ax.set_xlabel('Iteration')
            ax.set_ylabel('Inference Time (ms)')
            ax.set_title('Performance Impact of Fault Tolerance Features')
            ax.legend()
            ax.grid(True, alpha=0.3)
            
            fig.tight_layout()
            
            return fig
            
        except Exception as e:
            self.logger.error(f"Error generating performance impact figure: {e}")
            return None
    
    def _figure_to_base64(self, fig: Figure) -> str:
        """
        Convert a matplotlib figure to base64 encoded string.
        
        Args:
            fig: Matplotlib figure
            
        Returns:
            Base64 encoded string
        """
        import io
        import base64
        
        buf = io.BytesIO()
        fig.savefig(buf, format='png')
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode('utf-8')
        
        return f"data:image/png;base64,{img_str}"
    
    def _get_status_color(self, status: str) -> str:
        """
        Get color for status.
        
        Args:
            status: Status string
            
        Returns:
            HTML color code
        """
        status_colors = {
            "passed": "#4CAF50",  # Green
            "warning": "#FF9800",  # Orange
            "failed": "#F44336",  # Red
            "error": "#D32F2F",   # Dark Red
            "running": "#2196F3",  # Blue
            "unknown": "#9E9E9E"   # Gray
        }
        
        return status_colors.get(status, "#9E9E9E")
    
    def _get_report_template(self) -> str:
        """
        Get HTML template for the report.
        
        Returns:
            HTML template string
        """
        return """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 5px solid {{ status_color }};
        }
        .status-badge {
            display: inline-block;
            padding: 5px 10px;
            background-color: {{ status_color }};
            color: white;
            border-radius: 3px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .section {
            margin-bottom: 30px;
            border: 1px solid #e1e4e8;
            border-radius: 5px;
            padding: 20px;
        }
        .metrics-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
        }
        .metric-card {
            flex: 1 1 200px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            margin: 10px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            text-align: left;
            padding: 12px 15px;
            border-bottom: 1px solid #e1e4e8;
        }
        thead tr {
            background-color: #f8f9fa;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        .success {
            color: #4CAF50;
        }
        .warning {
            color: #FF9800;
        }
        .failure {
            color: #F44336;
        }
        .chart-container {
            margin: 20px 0;
            text-align: center;
        }
        .chart-container img {
            max-width: 100%;
            height: auto;
            border: 1px solid #e1e4e8;
            border-radius: 5px;
        }
        .strength {
            color: #4CAF50;
        }
        .weakness {
            color: #F44336;
        }
        .recommendation {
            color: #2196F3;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{ title }}</h1>
        <p>Generated: {{ timestamp }}</p>
        <p>Overall Status: <span class="status-badge">{{ overall_status }}</span></p>
    </div>
    
    <div class="section">
        <h2>Summary</h2>
        <div class="metrics-container">
            <div class="metric-card">
                <h3>Success Rate</h3>
                <div class="metric-value">{{ "%.1f"|format(overall_metrics.recovery_success_rate * 100) }}%</div>
                <p>Tests passed/total</p>
            </div>
            <div class="metric-card">
                <h3>Avg Recovery Time</h3>
                <div class="metric-value">{{ "%.1f"|format(overall_metrics.avg_recovery_time_ms) }}ms</div>
                <p>Average recovery time</p>
            </div>
            <div class="metric-card">
                <h3>Scenarios Tested</h3>
                <div class="metric-value">{{ overall_metrics.scenarios_tested }}</div>
                <p>Total test scenarios</p>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>Visualizations</h2>
        
        <h3>Recovery Time Comparison</h3>
        <div class="chart-container">
            <img src="{{ recovery_time_chart }}" alt="Recovery Time Comparison">
        </div>
        
        <h3>Success Rate Dashboard</h3>
        <div class="chart-container">
            <img src="{{ success_rate_chart }}" alt="Success Rate Dashboard">
        </div>
        
        <h3>Performance Impact</h3>
        <div class="chart-container">
            <img src="{{ performance_impact_chart }}" alt="Performance Impact">
        </div>
    </div>
    
    <div class="section">
        <h2>Scenario Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Scenario</th>
                    <th>Status</th>
                    <th>Recovery Time</th>
                </tr>
            </thead>
            <tbody>
                {% for row in scenario_table %}
                <tr>
                    <td>{{ row.scenario }}</td>
                    <td class="{% if row.status == 'passed' %}success{% elif row.status == 'warning' %}warning{% else %}failure{% endif %}">
                        {{ row.status }}
                    </td>
                    <td>
                        {% if row.recovery_time_ms != 'N/A' %}
                            {{ "%.1f"|format(row.recovery_time_ms) }}ms
                        {% else %}
                            N/A
                        {% endif %}
                    </td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
    
    {% if analysis %}
    <div class="section">
        <h2>Analysis</h2>
        
        {% if analysis.strengths %}
        <h3>Strengths</h3>
        <ul>
            {% for strength in analysis.strengths %}
            <li class="strength">{{ strength }}</li>
            {% endfor %}
        </ul>
        {% endif %}
        
        {% if analysis.weaknesses %}
        <h3>Weaknesses</h3>
        <ul>
            {% for weakness in analysis.weaknesses %}
            <li class="weakness">{{ weakness }}</li>
            {% endfor %}
        </ul>
        {% endif %}
        
        {% if analysis.recommendations %}
        <h3>Recommendations</h3>
        <ul>
            {% for recommendation in analysis.recommendations %}
            <li class="recommendation">{{ recommendation }}</li>
            {% endfor %}
        </ul>
        {% endif %}
        
        {% if analysis.avg_recovery_time_ms %}
        <h3>Recovery Metrics</h3>
        <p>Average Recovery Time: {{ "%.1f"|format(analysis.avg_recovery_time_ms) }}ms</p>
        
        {% if analysis.fastest_recovery %}
        <p>Fastest Recovery: {{ analysis.fastest_recovery.scenario.replace('_', ' ') }} ({{ "%.1f"|format(analysis.fastest_recovery.time_ms) }}ms)</p>
        {% endif %}
        
        {% if analysis.slowest_recovery %}
        <p>Slowest Recovery: {{ analysis.slowest_recovery.scenario.replace('_', ' ') }} ({{ "%.1f"|format(analysis.slowest_recovery.time_ms) }}ms)</p>
        {% endif %}
        {% endif %}
    </div>
    {% endif %}
    
    <div class="section">
        <h2>Test Configuration</h2>
        <table>
            <tr>
                <th>Fault Tolerance Level</th>
                <td>{{ validation_results.fault_tolerance_level }}</td>
            </tr>
            <tr>
                <th>Recovery Strategy</th>
                <td>{{ validation_results.recovery_strategy }}</td>
            </tr>
            <tr>
                <th>Model Manager</th>
                <td>{{ validation_results.model_manager }}</td>
            </tr>
            <tr>
                <th>Timestamp</th>
                <td>{{ validation_results.timestamp }}</td>
            </tr>
        </table>
    </div>
    
    <footer>
        <p>Generated by FaultToleranceVisualizer on {{ timestamp }}</p>
    </footer>
</body>
</html>
"""
    
    def _get_ci_report_template(self) -> str:
        """
        Get HTML template for CI-compatible report with embedded images.
        
        Returns:
            HTML template string
        """
        return """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 5px solid {{ status_color }};
        }
        .status-badge {
            display: inline-block;
            padding: 5px 10px;
            background-color: {{ status_color }};
            color: white;
            border-radius: 3px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .section {
            margin-bottom: 30px;
            border: 1px solid #e1e4e8;
            border-radius: 5px;
            padding: 20px;
        }
        .metrics-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
        }
        .metric-card {
            flex: 1 1 200px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            margin: 10px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            text-align: left;
            padding: 12px 15px;
            border-bottom: 1px solid #e1e4e8;
        }
        thead tr {
            background-color: #f8f9fa;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        .success {
            color: #4CAF50;
        }
        .warning {
            color: #FF9800;
        }
        .failure {
            color: #F44336;
        }
        .chart-container {
            margin: 20px 0;
            text-align: center;
        }
        .chart-container img {
            max-width: 100%;
            height: auto;
            border: 1px solid #e1e4e8;
            border-radius: 5px;
        }
        .strength {
            color: #4CAF50;
        }
        .weakness {
            color: #F44336;
        }
        .recommendation {
            color: #2196F3;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{ title }}</h1>
        <p>Generated: {{ timestamp }}</p>
        <p>Overall Status: <span class="status-badge">{{ overall_status }}</span></p>
    </div>
    
    <div class="section">
        <h2>Summary</h2>
        <div class="metrics-container">
            <div class="metric-card">
                <h3>Success Rate</h3>
                <div class="metric-value">{{ "%.1f"|format(overall_metrics.recovery_success_rate * 100) }}%</div>
                <p>Tests passed/total</p>
            </div>
            <div class="metric-card">
                <h3>Avg Recovery Time</h3>
                <div class="metric-value">{{ "%.1f"|format(overall_metrics.avg_recovery_time_ms) }}ms</div>
                <p>Average recovery time</p>
            </div>
            <div class="metric-card">
                <h3>Scenarios Tested</h3>
                <div class="metric-value">{{ overall_metrics.scenarios_tested }}</div>
                <p>Total test scenarios</p>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>Visualizations</h2>
        
        {% if recovery_time_b64 %}
        <h3>Recovery Time Comparison</h3>
        <div class="chart-container">
            <img src="{{ recovery_time_b64 }}" alt="Recovery Time Comparison">
        </div>
        {% endif %}
        
        {% if success_rate_b64 %}
        <h3>Success Rate Dashboard</h3>
        <div class="chart-container">
            <img src="{{ success_rate_b64 }}" alt="Success Rate Dashboard">
        </div>
        {% endif %}
        
        {% if performance_impact_b64 %}
        <h3>Performance Impact</h3>
        <div class="chart-container">
            <img src="{{ performance_impact_b64 }}" alt="Performance Impact">
        </div>
        {% endif %}
    </div>
    
    <div class="section">
        <h2>Scenario Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Scenario</th>
                    <th>Status</th>
                    <th>Recovery Time</th>
                </tr>
            </thead>
            <tbody>
                {% for row in scenario_table %}
                <tr>
                    <td>{{ row.scenario }}</td>
                    <td class="{% if row.status == 'passed' %}success{% elif row.status == 'warning' %}warning{% else %}failure{% endif %}">
                        {{ row.status }}
                    </td>
                    <td>
                        {% if row.recovery_time_ms != 'N/A' %}
                            {{ "%.1f"|format(row.recovery_time_ms) }}ms
                        {% else %}
                            N/A
                        {% endif %}
                    </td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
    
    {% if analysis %}
    <div class="section">
        <h2>Analysis</h2>
        
        {% if analysis.strengths %}
        <h3>Strengths</h3>
        <ul>
            {% for strength in analysis.strengths %}
            <li class="strength">{{ strength }}</li>
            {% endfor %}
        </ul>
        {% endif %}
        
        {% if analysis.weaknesses %}
        <h3>Weaknesses</h3>
        <ul>
            {% for weakness in analysis.weaknesses %}
            <li class="weakness">{{ weakness }}</li>
            {% endfor %}
        </ul>
        {% endif %}
        
        {% if analysis.recommendations %}
        <h3>Recommendations</h3>
        <ul>
            {% for recommendation in analysis.recommendations %}
            <li class="recommendation">{{ recommendation }}</li>
            {% endfor %}
        </ul>
        {% endif %}
    </div>
    {% endif %}
    
    <footer>
        <p>Generated by FaultToleranceVisualizer on {{ timestamp }}</p>
    </footer>
</body>
</html>
"""