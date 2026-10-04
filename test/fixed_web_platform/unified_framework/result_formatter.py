"""
Result Formatter for Unified Web Framework (August 2025)

This module provides standardized formatting for inference results across
different model types and browsers:

- Common result structure across different models
- Detailed metadata for model inference
- Performance statistics collection
- Browser-specific result formatting
- Error handling integration

Usage:
    from fixed_web_platform.unified_framework.result_formatter import (
        ResultFormatter,
        format_inference_result,
        format_error_response
    )
    
    # Create formatter for specific model type
    formatter = ResultFormatter(model_type="text")
    
    # Format raw inference result
    formatted_result = formatter.format_result(raw_result)
    
    # Add performance metrics
    formatter.add_performance_metrics(formatted_result, {
        "inference_time_ms": 120.5,
        "tokens_per_second": 45.2
    })
    
    # Format error response
    error_response = formatter.format_error(
        error_type="configuration_error",
        message="Invalid precision setting"
    )
"""

import os
import time
import json
import logging
from typing import Dict, Any, List, Optional, Union, Tuple

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unified_framework.result_formatter")

class ResultFormatter:
    """
    Standardized result formatting for web platform inference.
    
    This class provides consistent formatting for inference results
    across different model types, with detailed metadata and performance
    statistics.
    """
    
    def __init__(self, 
                model_type: str = "text",
                browser: Optional[str] = None,
                include_metadata: bool = True,
                include_raw_output: bool = False):
        """
        Initialize result formatter.
        
        Args:
            model_type: Type of model (text, vision, audio, multimodal)
            browser: Browser information for browser-specific formatting
            include_metadata: Whether to include metadata in results
            include_raw_output: Whether to include raw model output
        """
        self.model_type = model_type
        self.browser = browser
        self.include_metadata = include_metadata
        self.include_raw_output = include_raw_output
    
    def format_result(self, 
                     result: Dict[str, Any],
                     model_name: Optional[str] = None,
                     input_summary: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Format inference result into standardized structure.
        
        Args:
            result: Raw inference result from model
            model_name: Name of the model used
            input_summary: Summary of input data
            
        Returns:
            Formatted result dictionary
        """
        # Start with base structure
        formatted_result = {
            "success": True,
            "timestamp": time.time(),
            "result": self._format_output_by_type(result)
        }
        
        # Add metadata if enabled
        if self.include_metadata:
            metadata = {
                "model_type": self.model_type,
                "model_name": model_name,
                "browser": self.browser,
                "platform": os.environ.get("PLATFORM", "unknown"),
                "webgpu_enabled": os.environ.get("WEBGPU_AVAILABLE", "0") == "1",
                "webnn_enabled": os.environ.get("WEBNN_AVAILABLE", "0") == "1"
            }
            
            # Add input summary if provided
            if input_summary:
                metadata["input_summary"] = input_summary
                
            formatted_result["metadata"] = metadata
            
        # Add raw output if enabled
        if self.include_raw_output:
            formatted_result["raw_output"] = result
        
        return formatted_result
    
    def _format_output_by_type(self, result: Any) -> Dict[str, Any]:
        """
        Format output based on model type.
        
        Args:
            result: Raw result from model
            
        Returns:
            Formatted result specific to model type
        """
        # Handle dictionary results
        if isinstance(result, dict):
            # Process based on model type
            if self.model_type == "text":
                return self._format_text_result(result)
            elif self.model_type == "vision":
                return self._format_vision_result(result)
            elif self.model_type == "audio":
                return self._format_audio_result(result)
            elif self.model_type == "multimodal":
                return self._format_multimodal_result(result)
            else:
                # Default formatting for unknown types
                return result
                
        # Handle string results
        elif isinstance(result, str):
            return {"text": result}
            
        # Handle list results
        elif isinstance(result, list):
            return {"items": result}
            
        # Return as is for other types
        return {"output": result}
    
    def _format_text_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Format text model results."""
        # Extract common text output fields
        formatted = {}
        
        if "text" in result:
            formatted["text"] = result["text"]
        elif "generated_text" in result:
            formatted["text"] = result["generated_text"]
        elif "output" in result:
            formatted["text"] = result["output"]
        
        # Extract token counts if available
        if "token_count" in result:
            formatted["token_count"] = result["token_count"]
        
        # Extract embeddings if available
        if "embeddings" in result:
            formatted["embeddings"] = {
                "dimensions": len(result["embeddings"]),
                "values": result["embeddings"] if self.include_raw_output else None
            }
            
        return formatted
    
    def _format_vision_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Format vision model results."""
        # Extract common vision output fields
        formatted = {}
        
        # Handle different vision outputs
        if "classifications" in result:
            # Classification model
            formatted["classifications"] = result["classifications"]
            
        elif "bounding_boxes" in result or "detections" in result:
            # Object detection model
            formatted["detections"] = result.get("bounding_boxes", result.get("detections", []))
            
        elif "segmentation_map" in result:
            # Segmentation model
            formatted["segmentation"] = {
                "width": result.get("width", 0),
                "height": result.get("height", 0)
            }
            
            if self.include_raw_output:
                formatted["segmentation"]["map"] = result["segmentation_map"]
        
        # Extract embeddings if available
        if "image_embedding" in result:
            formatted["embeddings"] = {
                "dimensions": len(result["image_embedding"]),
                "values": result["image_embedding"] if self.include_raw_output else None
            }
            
        return formatted
    
    def _format_audio_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Format audio model results."""
        # Extract common audio output fields
        formatted = {}
        
        # Handle different audio outputs
        if "transcription" in result:
            # Speech recognition model
            formatted["transcription"] = result["transcription"]
            
        elif "classification" in result:
            # Audio classification model
            formatted["classifications"] = result["classification"]
            
        elif "embeddings" in result:
            # Audio embedding model
            formatted["embeddings"] = {
                "dimensions": len(result["embeddings"]),
                "values": result["embeddings"] if self.include_raw_output else None
            }
        
        return formatted
    
    def _format_multimodal_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Format multimodal model results."""
        # Extract common multimodal output fields
        formatted = {}
        
        # Handle different multimodal outputs
        if "text" in result or "generated_text" in result:
            # Text output from multimodal model
            formatted["text"] = result.get("text", result.get("generated_text", ""))
            
        if "visual_embeddings" in result and "text_embeddings" in result:
            # Multimodal embeddings
            formatted["embeddings"] = {
                "visual": {
                    "dimensions": len(result["visual_embeddings"]),
                    "values": result["visual_embeddings"] if self.include_raw_output else None
                },
                "text": {
                    "dimensions": len(result["text_embeddings"]),
                    "values": result["text_embeddings"] if self.include_raw_output else None
                }
            }
        
        return formatted
    
    def add_performance_metrics(self, result: Dict[str, Any], 
                               metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add performance metrics to formatted result.
        
        Args:
            result: Formatted result dictionary
            metrics: Performance metrics to add
            
        Returns:
            Updated result dictionary with performance metrics
        """
        # Create performance section if it doesn't exist
        if "performance" not in result:
            result["performance"] = {}
            
        # Process common metrics
        if "inference_time_ms" in metrics:
            result["performance"]["inference_time_ms"] = metrics["inference_time_ms"]
            
        if "preprocessing_time_ms" in metrics:
            result["performance"]["preprocessing_time_ms"] = metrics["preprocessing_time_ms"]
            
        if "postprocessing_time_ms" in metrics:
            result["performance"]["postprocessing_time_ms"] = metrics["postprocessing_time_ms"]
            
        # Calculate total time if components are available
        if all(key in result["performance"] for key in ["inference_time_ms", "preprocessing_time_ms", "postprocessing_time_ms"]):
            result["performance"]["total_time_ms"] = (
                result["performance"]["inference_time_ms"] +
                result["performance"]["preprocessing_time_ms"] +
                result["performance"]["postprocessing_time_ms"]
            )
            
        # Add text generation metrics
        if self.model_type == "text" and "tokens_per_second" in metrics:
            result["performance"]["tokens_per_second"] = metrics["tokens_per_second"]
            
        # Add memory usage metrics
        if "peak_memory_mb" in metrics:
            result["performance"]["peak_memory_mb"] = metrics["peak_memory_mb"]
            
        # Add browser-specific metrics
        if self.browser and "browser_metrics" in metrics:
            result["performance"]["browser"] = metrics["browser_metrics"]
            
        return result
        
    def format_error(self, 
                    error_type: str, 
                    message: str, 
                    details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Format error response.
        
        Args:
            error_type: Type of error
            message: Error message
            details: Optional error details
            
        Returns:
            Formatted error response
        """
        error_response = {
            "success": False,
            "timestamp": time.time(),
            "error": {
                "type": error_type,
                "message": message
            }
        }
        
        # Add details if provided
        if details:
            error_response["error"]["details"] = details
            
        # Add metadata if enabled
        if self.include_metadata:
            error_response["metadata"] = {
                "model_type": self.model_type,
                "browser": self.browser,
                "platform": os.environ.get("PLATFORM", "unknown"),
                "webgpu_enabled": os.environ.get("WEBGPU_AVAILABLE", "0") == "1",
                "webnn_enabled": os.environ.get("WEBNN_AVAILABLE", "0") == "1"
            }
            
        return error_response
    
    def create_progressive_result(self) -> Dict[str, Any]:
        """
        Create an empty result structure for progressive updates.
        
        Returns:
            Empty result dictionary for progressive updates
        """
        result = {
            "success": True,
            "timestamp": time.time(),
            "result": {},
            "complete": False,
            "progress": 0.0
        }
        
        # Add metadata if enabled
        if self.include_metadata:
            result["metadata"] = {
                "model_type": self.model_type,
                "browser": self.browser,
                "progressive": True
            }
            
        return result
    
    def update_progressive_result(self, 
                                 result: Dict[str, Any],
                                 update: Dict[str, Any],
                                 progress: float) -> Dict[str, Any]:
        """
        Update progressive result with new data.
        
        Args:
            result: Progressive result to update
            update: New data to add
            progress: Current progress (0.0-1.0)
            
        Returns:
            Updated progressive result
        """
        # Update progress
        result["progress"] = progress
        result["timestamp"] = time.time()
        
        # Merge new data into result
        if "result" in update:
            result["result"].update(update["result"])
        else:
            # Assume update is the result data directly
            result["result"].update(update)
            
        # Mark as complete if progress is 100%
        if progress >= 1.0:
            result["complete"] = True
            
        return result
    
    @classmethod
    def merge_results(cls, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge multiple formatted results into a single result.
        
        Args:
            results: List of formatted results to merge
            
        Returns:
            Merged result dictionary
        """
        if not results:
            return {"success": False, "error": {"message": "No results to merge"}}
            
        # Start with the first result as base
        merged = results[0].copy()
        
        # Track if any result failed
        all_succeeded = all(result.get("success", False) for result in results)
        merged["success"] = all_succeeded
        
        # Merge result data
        for result in results[1:]:
            if "result" in result and isinstance(result["result"], dict):
                merged["result"].update(result["result"])
                
        # Merge performance metrics
        if "performance" in merged:
            for result in results[1:]:
                if "performance" in result:
                    for key, value in result["performance"].items():
                        if key in merged["performance"]:
                            # Average numeric values
                            if isinstance(value, (int, float)) and isinstance(merged["performance"][key], (int, float)):
                                merged["performance"][key] = (merged["performance"][key] + value) / 2
                        else:
                            # Add new metrics
                            merged["performance"][key] = value
                            
        return merged


# Utility functions

def format_inference_result(result: Dict[str, Any], 
                          model_type: str = "text",
                          model_name: Optional[str] = None,
                          browser: Optional[str] = None,
                          include_metadata: bool = True) -> Dict[str, Any]:
    """
    Format inference result with standard utility function.
    
    Args:
        result: Raw inference result
        model_type: Type of model
        model_name: Name of model
        browser: Browser information
        include_metadata: Whether to include metadata
        
    Returns:
        Formatted result dictionary
    """
    formatter = ResultFormatter(
        model_type=model_type,
        browser=browser,
        include_metadata=include_metadata
    )
    
    return formatter.format_result(result, model_name)


def format_error_response(error_type: str,
                        message: str,
                        details: Optional[Dict[str, Any]] = None,
                        model_type: str = "text",
                        browser: Optional[str] = None) -> Dict[str, Any]:
    """
    Format error response with standard utility function.
    
    Args:
        error_type: Type of error
        message: Error message
        details: Optional error details
        model_type: Type of model
        browser: Browser information
        
    Returns:
        Formatted error response
    """
    formatter = ResultFormatter(
        model_type=model_type,
        browser=browser
    )
    
    return formatter.format_error(error_type, message, details)


def parse_raw_output(raw_output: Any, model_type: str = "text") -> Dict[str, Any]:
    """
    Parse raw model output into structured format.
    
    Args:
        raw_output: Raw output from model inference
        model_type: Type of model
        
    Returns:
        Parsed and structured output
    """
    # Create appropriate formatter
    formatter = ResultFormatter(model_type=model_type)
    
    # Format the output
    formatted = formatter._format_output_by_type(raw_output)
    
    return formatted