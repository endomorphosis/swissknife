#!/usr/bin/env python3
"""
Browser Performance Optimizer for WebGPU/WebNN Resource Pool (May 2025)

This module implements dynamic browser-specific optimizations based on performance history
for the WebGPU/WebNN Resource Pool. It provides intelligent decision-making capabilities
for model placement, hardware backend selection, and runtime parameter tuning.

Key features:
- Performance-based browser selection with continuous adaptation
- Model-specific optimization strategies based on performance patterns
- Browser capability scoring and specialized strengths detection
- Adaptive execution parameter tuning based on performance history
- Dynamic workload balancing across heterogeneous browser environments

Usage:
    from fixed_web_platform.browser_performance_optimizer import BrowserPerformanceOptimizer
    
    # Create optimizer integrated with browser history
    optimizer = BrowserPerformanceOptimizer(
        browser_history=resource_pool.browser_history,
        model_types_config={
            "text_embedding": {"priority": "latency"},
            "vision": {"priority": "throughput"},
            "audio": {"priority": "memory_efficiency"}
        }
    )
    
    # Get optimized configuration for a model
    optimized_config = optimizer.get_optimized_configuration(
        model_type="text_embedding",
        model_name="bert-base-uncased",
        available_browsers=["chrome", "firefox", "edge"]
    )
    
    # Apply dynamic optimizations during model execution
    optimizer.apply_runtime_optimizations(
        model=model,
        browser_type="firefox",
        execution_context={"batch_size": 4, "dtype": "float16"}
    )
"""

import logging
import time
import json
import statistics
from typing import Dict, List, Any, Optional, Tuple, Set, Union
from dataclasses import dataclass
from enum import Enum
from collections import defaultdict

class OptimizationPriority(Enum):
    """Optimization priorities for different model types."""
    LATENCY = "latency"  # Prioritize low latency
    THROUGHPUT = "throughput"  # Prioritize high throughput
    MEMORY_EFFICIENCY = "memory_efficiency"  # Prioritize low memory usage
    RELIABILITY = "reliability"  # Prioritize high success rate
    BALANCED = "balanced"  # Balance all metrics

@dataclass
class BrowserCapabilityScore:
    """Score of a browser's capability for a specific model type."""
    browser_type: str
    model_type: str
    score: float  # 0-100 scale, higher is better
    confidence: float  # 0-1 scale, higher indicates more confidence in the score
    sample_count: int
    strengths: List[str]  # Areas where this browser excels
    weaknesses: List[str]  # Areas where this browser underperforms
    last_updated: float  # Timestamp

@dataclass
class OptimizationRecommendation:
    """Recommendation for browser and optimization parameters."""
    browser_type: str
    platform: str  # webgpu, webnn, cpu
    confidence: float
    parameters: Dict[str, Any]
    reason: str
    metrics: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "browser": self.browser_type,
            "platform": self.platform,
            "confidence": self.confidence,
            "parameters": self.parameters,
            "reason": self.reason,
            "metrics": self.metrics
        }

class BrowserPerformanceOptimizer:
    """
    Optimizer for browser-specific performance enhancements based on historical data.
    
    This class analyzes performance history from the BrowserPerformanceHistory component
    and provides intelligent optimizations for model execution across different browsers.
    It dynamically adapts to changing performance patterns and browser capabilities.
    """
    
    def __init__(
        self,
        browser_history=None,
        model_types_config: Optional[Dict[str, Dict[str, Any]]] = None,
        confidence_threshold: float = 0.6,
        min_samples_required: int = 5,
        adaptation_rate: float = 0.25,
        logger: Optional[logging.Logger] = None
    ):
        """
        Initialize the browser performance optimizer.
        
        Args:
            browser_history: BrowserPerformanceHistory instance for accessing performance data
            model_types_config: Configuration for different model types
            confidence_threshold: Threshold for confidence to apply optimizations
            min_samples_required: Minimum samples required for recommendations
            adaptation_rate: Rate at which to adapt to new performance data (0-1)
            logger: Logger instance
        """
        self.browser_history = browser_history
        self.model_types_config = model_types_config or {}
        self.confidence_threshold = confidence_threshold
        self.min_samples_required = min_samples_required
        self.adaptation_rate = adaptation_rate
        self.logger = logger or logging.getLogger(__name__)
        
        # Default model type priorities if not specified
        self.default_model_priorities = {
            "text_embedding": OptimizationPriority.LATENCY,
            "text": OptimizationPriority.LATENCY,
            "vision": OptimizationPriority.THROUGHPUT,
            "audio": OptimizationPriority.THROUGHPUT,
            "multimodal": OptimizationPriority.BALANCED
        }
        
        # Browser-specific capabilities (based on known hardware optimizations)
        self.browser_capabilities = {
            "firefox": {
                "audio": {
                    "strengths": ["compute_shaders", "audio_processing", "parallel_computations"],
                    "parameters": {
                        "compute_shader_optimization": True,
                        "audio_thread_priority": "high",
                        "optimize_audio": True
                    }
                },
                "vision": {
                    "strengths": ["texture_processing"],
                    "parameters": {
                        "pipeline_execution": "parallel",
                        "texture_processing_optimization": True
                    }
                }
            },
            "chrome": {
                "vision": {
                    "strengths": ["webgpu_compute_pipelines", "texture_processing", "parallel_execution"],
                    "parameters": {
                        "webgpu_compute_pipelines": "parallel",
                        "batch_processing": True,
                        "parallel_compute_pipelines": True,
                        "shader_precompilation": True,
                        "vision_optimized_shaders": True
                    }
                },
                "text": {
                    "strengths": ["kv_cache_optimization"],
                    "parameters": {
                        "kv_cache_optimization": True,
                        "attention_optimization": True
                    }
                }
            },
            "edge": {
                "text_embedding": {
                    "strengths": ["webnn_optimization", "integer_quantization", "text_models"],
                    "parameters": {
                        "webnn_optimization": True,
                        "quantization_level": "int8",
                        "text_model_optimizations": True
                    }
                },
                "text": {
                    "strengths": ["webnn_integration", "transformer_optimizations"],
                    "parameters": {
                        "webnn_optimization": True,
                        "transformer_optimization": True
                    }
                }
            },
            "safari": {
                "vision": {
                    "strengths": ["metal_integration", "power_efficiency"],
                    "parameters": {
                        "metal_optimization": True,
                        "power_efficient_execution": True
                    }
                },
                "audio": {
                    "strengths": ["core_audio_integration", "power_efficiency"],
                    "parameters": {
                        "core_audio_optimization": True,
                        "power_efficient_execution": True
                    }
                }
            }
        }
        
        # Dynamic optimization parameters by model type
        self.optimization_parameters = {
            "text_embedding": {
                "latency_focused": {
                    "batch_size": 1,
                    "compute_precision": "float16",
                    "priority_list": ["webnn", "webgpu", "cpu"],
                    "attention_implementation": "efficient"
                },
                "throughput_focused": {
                    "batch_size": 8,
                    "compute_precision": "int8",
                    "priority_list": ["webgpu", "webnn", "cpu"],
                    "attention_implementation": "batched"
                },
                "memory_focused": {
                    "batch_size": 1,
                    "compute_precision": "int4",
                    "priority_list": ["webgpu", "webnn", "cpu"],
                    "attention_implementation": "memory_efficient"
                }
            },
            "vision": {
                "latency_focused": {
                    "batch_size": 1,
                    "compute_precision": "float16",
                    "priority_list": ["webgpu", "webnn", "cpu"],
                    "parallel_execution": False
                },
                "throughput_focused": {
                    "batch_size": 4,
                    "compute_precision": "int8",
                    "priority_list": ["webgpu", "webnn", "cpu"],
                    "parallel_execution": True
                },
                "memory_focused": {
                    "batch_size": 1,
                    "compute_precision": "int8",
                    "priority_list": ["webnn", "webgpu", "cpu"],
                    "parallel_execution": False
                }
            },
            "audio": {
                "latency_focused": {
                    "batch_size": 1,
                    "compute_precision": "float16",
                    "priority_list": ["webgpu", "webnn", "cpu"],
                    "streaming_enabled": True
                },
                "throughput_focused": {
                    "batch_size": 2,
                    "compute_precision": "float16",
                    "priority_list": ["webgpu", "webnn", "cpu"],
                    "streaming_enabled": False
                },
                "memory_focused": {
                    "batch_size": 1,
                    "compute_precision": "int8",
                    "priority_list": ["webnn", "webgpu", "cpu"],
                    "streaming_enabled": True
                }
            }
        }
        
        # Cache for browser capability scores
        self.capability_scores_cache = {}
        
        # Cache for optimization recommendations
        self.recommendation_cache = {}
        
        # Adaptation tracking
        self.last_adaptation_time = time.time()
        
        # Statistics
        self.recommendation_count = 0
        self.cache_hit_count = 0
        self.adaptation_count = 0
        
        self.logger.info("Browser performance optimizer initialized")
    
    def get_optimization_priority(self, model_type: str) -> OptimizationPriority:
        """
        Get the optimization priority for a model type.
        
        Args:
            model_type: Type of model
            
        Returns:
            OptimizationPriority enum value
        """
        # Check if priority is specified in configuration
        if model_type in self.model_types_config and "priority" in self.model_types_config[model_type]:
            priority_str = self.model_types_config[model_type]["priority"]
            try:
                return OptimizationPriority(priority_str)
            except ValueError:
                self.logger.warning(f"Invalid priority '{priority_str}' for model type '{model_type}', using default")
        
        # Use default priority if available
        if model_type in self.default_model_priorities:
            return self.default_model_priorities[model_type]
        
        # Otherwise, use balanced priority
        return OptimizationPriority.BALANCED
    
    def get_browser_capability_score(self, browser_type: str, model_type: str) -> BrowserCapabilityScore:
        """
        Get capability score for a browser and model type.
        
        Args:
            browser_type: Type of browser
            model_type: Type of model
            
        Returns:
            BrowserCapabilityScore object
        """
        cache_key = f"{browser_type}:{model_type}"
        
        # Check cache first
        if cache_key in self.capability_scores_cache:
            # Check if cache entry is recent enough (less than 5 minutes old)
            cache_entry = self.capability_scores_cache[cache_key]
            if time.time() - cache_entry.last_updated < 300:
                return cache_entry
        
        # If browser history is available, use it to generate a score
        if self.browser_history:
            try:
                # Get capability scores from browser history
                capability_scores = self.browser_history.get_capability_scores(browser=browser_type, model_type=model_type)
                
                if capability_scores and browser_type in capability_scores:
                    browser_scores = capability_scores[browser_type]
                    if model_type in browser_scores:
                        score_data = browser_scores[model_type]
                        
                        # Create score object
                        score = BrowserCapabilityScore(
                            browser_type=browser_type,
                            model_type=model_type,
                            score=score_data.get("score", 50.0),
                            confidence=score_data.get("confidence", 0.5),
                            sample_count=score_data.get("sample_size", 0),
                            strengths=[],
                            weaknesses=[],
                            last_updated=time.time()
                        )
                        
                        # Determine strengths and weaknesses based on score
                        if score.score >= 80:
                            # High score, check if we have predefined strengths
                            if browser_type in self.browser_capabilities and model_type in self.browser_capabilities[browser_type]:
                                score.strengths = self.browser_capabilities[browser_type][model_type].get("strengths", [])
                        elif score.score <= 30:
                            # Low score, this is a weakness
                            score.weaknesses = ["general_performance"]
                        
                        # Cache the score
                        self.capability_scores_cache[cache_key] = score
                        
                        return score
            except Exception as e:
                self.logger.warning(f"Error getting capability score from browser history: {e}")
        
        # If no data available or error occurred, use predefined capabilities
        if browser_type in self.browser_capabilities and model_type in self.browser_capabilities[browser_type]:
            browser_config = self.browser_capabilities[browser_type][model_type]
            
            # Create score object with default values
            score = BrowserCapabilityScore(
                browser_type=browser_type,
                model_type=model_type,
                score=75.0,  # Default fairly high for predefined capabilities
                confidence=0.7,  # Medium-high confidence
                sample_count=0,
                strengths=browser_config.get("strengths", []),
                weaknesses=[],
                last_updated=time.time()
            )
            
            # Cache the score
            self.capability_scores_cache[cache_key] = score
            
            return score
        
        # Default score if no data available
        default_score = BrowserCapabilityScore(
            browser_type=browser_type,
            model_type=model_type,
            score=50.0,  # Neutral score
            confidence=0.3,  # Low confidence
            sample_count=0,
            strengths=[],
            weaknesses=[],
            last_updated=time.time()
        )
        
        # Cache the default score
        self.capability_scores_cache[cache_key] = default_score
        
        return default_score
    
    def get_best_browser_for_model(
        self, 
        model_type: str, 
        available_browsers: List[str]
    ) -> Tuple[str, float, str]:
        """
        Get the best browser for a model type from available browsers.
        
        Args:
            model_type: Type of model
            available_browsers: List of available browser types
            
        Returns:
            Tuple of (browser_type, confidence, reason)
        """
        if not available_browsers:
            return ("chrome", 0.0, "No browsers available, defaulting to Chrome")
        
        # Get capability scores for each browser
        browser_scores = []
        for browser_type in available_browsers:
            score = self.get_browser_capability_score(browser_type, model_type)
            browser_scores.append((browser_type, score))
        
        # Find the browser with the highest score
        sorted_browsers = sorted(browser_scores, key=lambda x: (x[1].score * x[1].confidence), reverse=True)
        best_browser, best_score = sorted_browsers[0]
        
        # Generate reason
        if best_score.sample_count > 0:
            reason = f"Based on historical performance data with score {best_score.score:.1f}/100 (confidence: {best_score.confidence:.2f})"
        elif best_score.strengths:
            reason = f"Based on predefined strengths: {', '.join(best_score.strengths)}"
        else:
            reason = "Default selection with no historical data"
        
        return (best_browser, best_score.confidence, reason)
    
    def get_best_platform_for_browser_model(
        self, 
        browser_type: str, 
        model_type: str
    ) -> Tuple[str, float, str]:
        """
        Get the best platform (WebGPU, WebNN, CPU) for a browser and model type.
        
        Args:
            browser_type: Type of browser
            model_type: Type of model
            
        Returns:
            Tuple of (platform, confidence, reason)
        """
        # Default platform preferences
        default_platforms = {
            "firefox": "webgpu",
            "chrome": "webgpu",
            "edge": "webnn" if model_type in ["text", "text_embedding"] else "webgpu",
            "safari": "webgpu"
        }
        
        # Check if browser history is available
        if self.browser_history:
            try:
                # Get recommendations from browser history
                recommendation = self.browser_history.get_browser_recommendations(model_type)
                
                if recommendation and "recommended_platform" in recommendation:
                    platform = recommendation["recommended_platform"]
                    confidence = recommendation.get("confidence", 0.5)
                    
                    if confidence >= self.confidence_threshold:
                        return (platform, confidence, "Based on historical performance data")
            except Exception as e:
                self.logger.warning(f"Error getting platform recommendation from browser history: {e}")
        
        # Use default if no history or low confidence
        if browser_type in default_platforms:
            platform = default_platforms[browser_type]
            return (platform, 0.7, f"Default platform for {browser_type}")
        
        # Generic default
        return ("webgpu", 0.5, "Default platform")
    
    def get_optimization_parameters(
        self, 
        model_type: str,
        priority: OptimizationPriority
    ) -> Dict[str, Any]:
        """
        Get optimization parameters for a model type and priority.
        
        Args:
            model_type: Type of model
            priority: Optimization priority
            
        Returns:
            Dictionary of optimization parameters
        """
        # Map priority to parameter type
        param_type = None
        if priority == OptimizationPriority.LATENCY:
            param_type = "latency_focused"
        elif priority == OptimizationPriority.THROUGHPUT:
            param_type = "throughput_focused"
        elif priority == OptimizationPriority.MEMORY_EFFICIENCY:
            param_type = "memory_focused"
        else:
            # For balanced or reliability, use latency focused as default
            param_type = "latency_focused"
        
        # Get parameters for model type and priority
        if model_type in self.optimization_parameters and param_type in self.optimization_parameters[model_type]:
            return self.optimization_parameters[model_type][param_type].copy()
        
        # Default parameters if not defined for this model type
        return {
            "batch_size": 1,
            "compute_precision": "float16",
            "priority_list": ["webgpu", "webnn", "cpu"],
        }
    
    def get_browser_specific_parameters(
        self, 
        browser_type: str, 
        model_type: str
    ) -> Dict[str, Any]:
        """
        Get browser-specific optimization parameters.
        
        Args:
            browser_type: Type of browser
            model_type: Type of model
            
        Returns:
            Dictionary of browser-specific parameters
        """
        # Check if we have predefined parameters for this browser and model type
        if browser_type in self.browser_capabilities and model_type in self.browser_capabilities[browser_type]:
            return self.browser_capabilities[browser_type][model_type].get("parameters", {}).copy()
        
        # General browser-specific optimizations that apply to all model types
        general_optimizations = {
            "firefox": {
                "compute_shader_optimization": model_type == "audio",
                "webgpu_enabled": True
            },
            "chrome": {
                "shader_precompilation": True,
                "webgpu_enabled": True
            },
            "edge": {
                "webnn_enabled": model_type in ["text", "text_embedding"],
                "webgpu_enabled": True
            },
            "safari": {
                "power_efficient_execution": True,
                "webgpu_enabled": True
            }
        }
        
        return general_optimizations.get(browser_type, {}).copy()
    
    def merge_optimization_parameters(
        self, 
        base_params: Dict[str, Any], 
        browser_params: Dict[str, Any],
        user_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Merge different sets of optimization parameters.
        
        Args:
            base_params: Base parameters from optimization priority
            browser_params: Browser-specific parameters
            user_params: User-specified parameters (highest priority)
            
        Returns:
            Merged parameters dictionary
        """
        # Start with base parameters
        merged = base_params.copy()
        
        # Add browser-specific parameters
        merged.update(browser_params)
        
        # Add user parameters (highest priority)
        if user_params:
            merged.update(user_params)
        
        return merged
    
    def get_optimized_configuration(
        self, 
        model_type: str, 
        model_name: Optional[str] = None,
        available_browsers: Optional[List[str]] = None,
        user_preferences: Optional[Dict[str, Any]] = None
    ) -> OptimizationRecommendation:
        """
        Get optimized configuration for a model.
        
        Args:
            model_type: Type of model
            model_name: Name of the model (optional)
            available_browsers: List of available browser types
            user_preferences: User-specified preferences
            
        Returns:
            OptimizationRecommendation object
        """
        self.recommendation_count += 1
        
        # Generate cache key
        cache_key = f"{model_type}:{model_name or 'unknown'}:{','.join(sorted(available_browsers or []))}"
        if user_preferences:
            cache_key += f":{json.dumps(user_preferences, sort_keys=True)}"
        
        # Check cache
        if cache_key in self.recommendation_cache:
            cache_entry = self.recommendation_cache[cache_key]
            # Cache is valid for 5 minutes
            if time.time() - cache_entry.get("timestamp", 0) < 300:
                self.cache_hit_count += 1
                return OptimizationRecommendation(**cache_entry.get("recommendation"))
        
        # Set default available browsers if not specified
        if not available_browsers:
            available_browsers = ["chrome", "firefox", "edge", "safari"]
        
        # Get optimization priority for model type
        priority = self.get_optimization_priority(model_type)
        
        # Get best browser for model type
        browser_type, browser_confidence, browser_reason = self.get_best_browser_for_model(
            model_type, 
            available_browsers
        )
        
        # Get best platform for browser and model type
        platform, platform_confidence, platform_reason = self.get_best_platform_for_browser_model(
            browser_type, 
            model_type
        )
        
        # Get base optimization parameters based on priority
        base_params = self.get_optimization_parameters(model_type, priority)
        
        # Get browser-specific parameters
        browser_params = self.get_browser_specific_parameters(browser_type, model_type)
        
        # Merge parameters
        merged_params = self.merge_optimization_parameters(base_params, browser_params, user_preferences)
        
        # Calculate overall confidence
        confidence = browser_confidence * platform_confidence
        
        # Create recommendation
        reason = f"{browser_reason}. {platform_reason}. Optimized for {priority.value}."
        
        recommendation = OptimizationRecommendation(
            browser_type=browser_type,
            platform=platform,
            confidence=confidence,
            parameters=merged_params,
            reason=reason,
            metrics={
                "browser_confidence": browser_confidence,
                "platform_confidence": platform_confidence,
                "priority": priority.value
            }
        )
        
        # Update cache
        self.recommendation_cache[cache_key] = {
            "timestamp": time.time(),
            "recommendation": recommendation.__dict__
        }
        
        return recommendation
    
    def apply_runtime_optimizations(
        self, 
        model: Any, 
        browser_type: str,
        execution_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply runtime optimizations to a model execution.
        
        Args:
            model: Model object
            browser_type: Type of browser
            execution_context: Context for execution
            
        Returns:
            Modified execution context
        """
        # Skip if model is None
        if model is None:
            return execution_context
        
        # Get model type
        model_type = None
        if hasattr(model, 'model_type'):
            model_type = model.model_type
        elif hasattr(model, '_model_type'):
            model_type = model._model_type
        else:
            # Cannot optimize without model type
            return execution_context
        
        # Get model name
        model_name = None
        if hasattr(model, 'model_name'):
            model_name = model.model_name
        elif hasattr(model, '_model_name'):
            model_name = model._model_name
        
        # Get optimization priority
        priority = self.get_optimization_priority(model_type)
        
        # Get browser-specific parameters
        browser_params = self.get_browser_specific_parameters(browser_type, model_type)
        
        # Apply browser-specific runtime optimizations
        optimized_context = execution_context.copy()
        
        # Apply batch size optimization if not specified by user
        if "batch_size" not in optimized_context and "batch_size" in browser_params:
            optimized_context["batch_size"] = browser_params["batch_size"]
        
        # Apply compute precision optimization if not specified by user
        if "compute_precision" not in optimized_context and "compute_precision" in browser_params:
            optimized_context["compute_precision"] = browser_params["compute_precision"]
        
        # Apply other browser-specific parameters
        for key, value in browser_params.items():
            if key not in optimized_context:
                optimized_context[key] = value
        
        # Special optimizations for specific browsers and model types
        if browser_type == "firefox" and model_type == "audio":
            # Firefox-specific audio optimizations
            optimized_context["audio_thread_priority"] = "high"
            optimized_context["compute_shader_optimization"] = True
        elif browser_type == "chrome" and model_type == "vision":
            # Chrome-specific vision optimizations
            optimized_context["parallel_compute_pipelines"] = True
            optimized_context["vision_optimized_shaders"] = True
        elif browser_type == "edge" and model_type in ["text", "text_embedding"]:
            # Edge-specific text optimizations
            optimized_context["webnn_optimization"] = True
            optimized_context["transformer_optimization"] = True
        
        # Update adaptation timestamp
        self._adapt_to_performance_changes()
        
        return optimized_context
    
    def _adapt_to_performance_changes(self) -> None:
        """
        Adapt to performance changes periodically.
        
        This method is called periodically to adapt optimization parameters
        based on recent performance data.
        """
        # Only adapt every 5 minutes
        now = time.time()
        if now - self.last_adaptation_time < 300:
            return
        
        self.last_adaptation_time = now
        self.adaptation_count += 1
        
        # Clear caches to force re-evaluation
        self.capability_scores_cache = {}
        self.recommendation_cache = {}
        
        # Log adaptation
        self.logger.info(f"Adapting to performance changes (adaptation #{self.adaptation_count})")
        
        # Check if browser history is available
        if not self.browser_history:
            return
        
        try:
            # Get performance recommendations from browser history
            recommendations = None
            if hasattr(self.browser_history, 'get_performance_recommendations'):
                recommendations = self.browser_history.get_performance_recommendations()
            
            if not recommendations or "recommendations" not in recommendations:
                return
            
            # Update optimization parameters based on recommendations
            for key, rec in recommendations["recommendations"].items():
                if key.startswith("browser_") and rec["issue"] == "high_failure_rate":
                    # Browser has high failure rate, reduce its score in cache
                    browser_type = key.split("_")[1]
                    for model_type in self.default_model_priorities:
                        cache_key = f"{browser_type}:{model_type}"
                        if cache_key in self.capability_scores_cache:
                            score = self.capability_scores_cache[cache_key]
                            score.score *= 0.9  # Reduce score by 10%
                            score.weaknesses.append("reliability")
                            self.logger.info(f"Reduced score for {browser_type}/{model_type} due to high failure rate")
                
                if key.startswith("model_") and rec["issue"] == "degrading_performance":
                    # Model has degrading performance, update optimization parameters
                    model_name = key.split("_")[1]
                    # Future: implement model-specific adaptation based on degrading performance
            
        except Exception as e:
            self.logger.warning(f"Error during performance adaptation: {e}")
    
    def get_optimization_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about optimization activities.
        
        Returns:
            Dictionary with statistics
        """
        return {
            "recommendation_count": self.recommendation_count,
            "cache_hit_count": self.cache_hit_count,
            "cache_hit_rate": self.cache_hit_count / max(1, self.recommendation_count),
            "adaptation_count": self.adaptation_count,
            "last_adaptation_time": self.last_adaptation_time,
            "capability_scores_cache_size": len(self.capability_scores_cache),
            "recommendation_cache_size": len(self.recommendation_cache)
        }
    
    def clear_caches(self) -> None:
        """Clear all caches to force re-evaluation."""
        self.capability_scores_cache = {}
        self.recommendation_cache = {}
        self.logger.info("Cleared all caches")

# Example usage
def run_example():
    """Run a demonstration of the browser performance optimizer."""
    logging.info("Starting browser performance optimizer example")
    
    # Create optimizer
    optimizer = BrowserPerformanceOptimizer(
        model_types_config={
            "text_embedding": {"priority": "latency"},
            "vision": {"priority": "throughput"},
            "audio": {"priority": "memory_efficiency"}
        }
    )
    
    # Get optimized configuration for different model types
    for model_type in ["text_embedding", "vision", "audio"]:
        config = optimizer.get_optimized_configuration(
            model_type=model_type,
            model_name=f"{model_type}-example",
            available_browsers=["chrome", "firefox", "edge"]
        )
        
        logging.info(f"Optimized configuration for {model_type}:")
        logging.info(f"  Browser: {config.browser_type}")
        logging.info(f"  Platform: {config.platform}")
        logging.info(f"  Confidence: {config.confidence:.2f}")
        logging.info(f"  Reason: {config.reason}")
        logging.info(f"  Parameters: {config.parameters}")
    
    # Get statistics
    stats = optimizer.get_optimization_statistics()
    logging.info(f"Optimization statistics: {stats}")

if __name__ == "__main__":
    # Configure detailed logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[logging.StreamHandler()]
    )
    
    # Run the example
    run_example()