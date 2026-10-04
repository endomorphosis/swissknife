#!/usr/bin/env python3
"""
Cross-Model Tensor Sharing for WebGPU/WebNN Resource Pool Integration

This module implements efficient tensor sharing across multiple models in the WebGPU/WebNN
resource pool, enabling:

1. Shared tensor memory across models running on the same hardware
2. Efficient multimodal applications with shared representations
3. Memory optimization through tensor reuse
4. Cached intermediate representations for common model components

Key features:
- Tensor reference counting for efficient memory management
- Support for different tensor storage formats (WebGPU, WebNN, CPU)
- Tensor view support for zero-copy tensor slicing
- Smart caching of shared embedding spaces
- Cross-model intermediate representation sharing

Usage:
    from fixed_web_platform.cross_model_tensor_sharing import (
        TensorSharingManager,
        SharedTensor,
        register_shared_tensor,
        share_tensor_between_models,
        optimize_memory_usage
    )
    
    # Create a manager for tensor sharing
    manager = TensorSharingManager()
    
    # Share an embedding tensor between two models
    shared_embedding = manager.register_shared_tensor(
        name="text_embedding",
        shape=[1, 768],
        storage_type="webgpu",
        producer_model="bert",
        consumer_models=["t5", "llama"]
    )
    
    # Access shared tensors from another model
    embedding = manager.get_shared_tensor("text_embedding")
    
    # Optimize memory usage across models
    memory_savings = manager.optimize_memory_usage()
"""

import os
import sys
import json
import time
import logging
import asyncio
import weakref
import numpy as np
from typing import Dict, List, Any, Optional, Tuple, Union, Set, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cross_model_tensor_sharing")

# Try to import WebGPU components if available
try:
    from fixed_web_platform.webgpu_adapter import WebGPUAdapter
    WEBGPU_AVAILABLE = True
except ImportError:
    WEBGPU_AVAILABLE = False
    logger.warning("WebGPU adapter not available, falling back to CPU tensors")

class SharedTensor:
    """
    A tensor that can be shared between multiple models.
    
    Implements reference counting and intelligent memory management
    to ensure tensors are only freed when no longer needed by any model.
    """
    
    def __init__(self, 
                 name: str, 
                 shape: List[int], 
                 dtype: str = "float32", 
                 storage_type: str = "cpu",
                 producer_model: Optional[str] = None):
        """
        Initialize a shared tensor.
        
        Args:
            name: Unique name for this tensor
            shape: Shape of the tensor
            dtype: Data type of the tensor
            storage_type: Where the tensor is stored ('cpu', 'webgpu', 'webnn')
            producer_model: Name of the model that created this tensor
        """
        self.name = name
        self.shape = shape
        self.dtype = dtype
        self.storage_type = storage_type
        self.producer_model = producer_model
        self.consumer_models: Set[str] = set()
        self.reference_count = 0
        self.last_accessed = time.time()
        self.data = None  # Will store the actual tensor data
        self.views: Dict[str, "SharedTensorView"] = {}
        self.is_pinned = False  # If True, will not be freed regardless of reference count
        self.metadata: Dict[str, Any] = {}
        
        # Storage-specific attributes
        if storage_type == "webgpu":
            self.gpu_buffer_id = None
        elif storage_type == "webnn":
            self.webnn_tensor_id = None
            
        logger.debug(f"Created shared tensor {name} with shape {shape} and type {storage_type}")
    
    def acquire(self, model_name: str) -> bool:
        """
        Acquire this tensor for use by a model.
        
        Args:
            model_name: Name of the model acquiring the tensor
            
        Returns:
            True if acquisition was successful
        """
        self.consumer_models.add(model_name)
        self.reference_count += 1
        self.last_accessed = time.time()
        logger.debug(f"Model {model_name} acquired tensor {self.name}, reference count: {self.reference_count}")
        return True
    
    def release(self, model_name: str) -> bool:
        """
        Release this tensor from use by a model.
        
        Args:
            model_name: Name of the model releasing the tensor
            
        Returns:
            True if release was successful
        """
        if model_name in self.consumer_models:
            self.consumer_models.remove(model_name)
            self.reference_count = max(0, self.reference_count - 1)
            logger.debug(f"Model {model_name} released tensor {self.name}, reference count: {self.reference_count}")
            return True
        return False
    
    def pin(self):
        """Pin the tensor to prevent automatic release."""
        self.is_pinned = True
        logger.debug(f"Tensor {self.name} pinned in memory")
    
    def unpin(self):
        """Unpin the tensor to allow automatic release."""
        self.is_pinned = False
        logger.debug(f"Tensor {self.name} unpinned from memory")
    
    def can_be_freed(self) -> bool:
        """
        Check if this tensor can be freed from memory.
        
        Returns:
            True if the tensor can be freed
        """
        return (not self.is_pinned and 
                self.reference_count == 0 and 
                not self.consumer_models and
                time.time() - self.last_accessed > 30)  # 30 second grace period
    
    def create_view(self, name: str, offset: List[int], size: List[int]) -> "SharedTensorView":
        """
        Create a view into this tensor.
        
        Args:
            name: Name for the view
            offset: Start indices for the view
            size: Size of the view
            
        Returns:
            SharedTensorView object
        """
        view = SharedTensorView(self, name, offset, size)
        self.views[name] = view
        return view
    
    def copy_to(self, target_storage_type: str) -> "SharedTensor":
        """
        Copy this tensor to a different storage type.
        
        Args:
            target_storage_type: The target storage type
            
        Returns:
            New SharedTensor with the copied data
        """
        # Create a new tensor with the target storage type
        new_tensor = SharedTensor(
            name=f"{self.name}_{target_storage_type}",
            shape=self.shape,
            dtype=self.dtype,
            storage_type=target_storage_type,
            producer_model=self.producer_model
        )
        
        # In a real implementation, we would copy the data between storage types
        # This would involve WebGPU/WebNN specific code
        
        # Simulate data copy
        logger.info(f"Copying tensor {self.name} from {self.storage_type} to {target_storage_type}")
        new_tensor.data = self.data  # In a real implementation, this would be a proper copy
        
        return new_tensor
    
    def get_memory_usage(self) -> int:
        """
        Get the memory usage of this tensor in bytes.
        
        Returns:
            Memory usage in bytes
        """
        element_size = 4  # Assume float32 (4 bytes)
        if self.dtype == "float16":
            element_size = 2
        elif self.dtype == "int8":
            element_size = 1
            
        num_elements = 1
        for dim in self.shape:
            num_elements *= dim
            
        return num_elements * element_size
    
    def __repr__(self) -> str:
        return (f"SharedTensor(name={self.name}, shape={self.shape}, "
                f"type={self.dtype}, storage={self.storage_type}, "
                f"refs={self.reference_count}, producer={self.producer_model})")


class SharedTensorView:
    """
    A view into a shared tensor, representing a slice or subset of the tensor.
    
    This allows multiple models to use different parts of the same tensor
    without duplicating memory.
    """
    
    def __init__(self, 
                 parent: SharedTensor, 
                 name: str, 
                 offset: List[int], 
                 size: List[int]):
        """
        Initialize a tensor view.
        
        Args:
            parent: The parent tensor this is a view into
            name: Unique name for this view
            offset: Start indices for the view
            size: Size of the view
        """
        self.parent = parent
        self.name = name
        self.offset = offset
        self.size = size
        self.consumer_models: Set[str] = set()
        self.reference_count = 0
        self.last_accessed = time.time()
        
        logger.debug(f"Created tensor view {name} into {parent.name} with offset {offset} and size {size}")
    
    def acquire(self, model_name: str) -> bool:
        """
        Acquire this tensor view for use by a model.
        
        Args:
            model_name: Name of the model acquiring the view
            
        Returns:
            True if acquisition was successful
        """
        # Acquire both the view and the parent tensor
        self.consumer_models.add(model_name)
        self.reference_count += 1
        self.last_accessed = time.time()
        self.parent.acquire(model_name)
        
        logger.debug(f"Model {model_name} acquired tensor view {self.name}, reference count: {self.reference_count}")
        return True
    
    def release(self, model_name: str) -> bool:
        """
        Release this tensor view from use by a model.
        
        Args:
            model_name: Name of the model releasing the view
            
        Returns:
            True if release was successful
        """
        if model_name in self.consumer_models:
            self.consumer_models.remove(model_name)
            self.reference_count = max(0, self.reference_count - 1)
            self.parent.release(model_name)
            
            logger.debug(f"Model {model_name} released tensor view {self.name}, reference count: {self.reference_count}")
            return True
        return False
    
    def get_data(self) -> Any:
        """
        Get the data for this view.
        
        Returns:
            The tensor view data
        """
        self.last_accessed = time.time()
        
        # In a real implementation, this would return a slice or view of the parent tensor
        # based on the offset and size
        return None  # Placeholder
    
    def __repr__(self) -> str:
        return (f"SharedTensorView(name={self.name}, parent={self.parent.name}, "
                f"offset={self.offset}, size={self.size}, refs={self.reference_count})")


class TensorSharingManager:
    """
    Manager for shared tensors across multiple models.
    
    This class handles tensor registration, sharing, memory optimization,
    and lifecycle management for tensors shared across models.
    """
    
    def __init__(self, max_memory_mb: Optional[int] = None):
        """
        Initialize the tensor sharing manager.
        
        Args:
            max_memory_mb: Maximum memory to use for shared tensors (in MB)
        """
        self.tensors: Dict[str, SharedTensor] = {}
        self.model_tensors: Dict[str, Set[str]] = {}  # Maps model names to sets of tensor names
        self.max_memory_mb = max_memory_mb
        self.current_memory_usage = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.tensor_usage_stats: Dict[str, Dict[str, Any]] = {}  # Stats for tensor usage
        
        # Set up cross-model sharing patterns
        self.sharing_patterns: Dict[str, List[str]] = {
            # Common embedding spaces that can be shared
            "text_embedding": ["bert", "t5", "llama", "bart"],
            "vision_embedding": ["vit", "clip", "detr"],
            "audio_embedding": ["whisper", "wav2vec2", "clap"],
            # Multimodal shared representations
            "vision_text_joint": ["clip", "llava", "blip"],
            "audio_text_joint": ["clap", "whisper_text"],
        }
        
        logger.info(f"TensorSharingManager initialized with max memory: {max_memory_mb} MB")
    
    def register_shared_tensor(self, 
                              name: str, 
                              shape: List[int], 
                              storage_type: str = "cpu",
                              producer_model: Optional[str] = None,
                              consumer_models: Optional[List[str]] = None,
                              dtype: str = "float32") -> SharedTensor:
        """
        Register a new shared tensor.
        
        Args:
            name: Unique name for this tensor
            shape: Shape of the tensor
            storage_type: Where the tensor is stored ('cpu', 'webgpu', 'webnn')
            producer_model: Name of the model that created this tensor
            consumer_models: List of models that will use this tensor
            dtype: Data type of the tensor
            
        Returns:
            The created SharedTensor
        """
        if name in self.tensors:
            logger.warning(f"Tensor {name} already registered. Returning existing tensor.")
            return self.tensors[name]
        
        # Create the shared tensor
        tensor = SharedTensor(
            name=name,
            shape=shape,
            dtype=dtype,
            storage_type=storage_type,
            producer_model=producer_model
        )
        
        # Register the tensor
        self.tensors[name] = tensor
        
        # Track memory usage
        tensor_memory = tensor.get_memory_usage()
        self.current_memory_usage += tensor_memory
        
        # Track by producer model
        if producer_model:
            if producer_model not in self.model_tensors:
                self.model_tensors[producer_model] = set()
            self.model_tensors[producer_model].add(name)
            
            # Acquire reference for producer
            tensor.acquire(producer_model)
        
        # Register for consumer models
        if consumer_models:
            for model in consumer_models:
                if model not in self.model_tensors:
                    self.model_tensors[model] = set()
                self.model_tensors[model].add(name)
        
        # Initialize usage stats
        self.tensor_usage_stats[name] = {
            "created_at": time.time(),
            "access_count": 0,
            "last_accessed": time.time(),
            "memory_bytes": tensor_memory,
            "producer": producer_model,
            "consumers": set(consumer_models) if consumer_models else set()
        }
        
        logger.info(f"Registered shared tensor {name} with shape {shape} and storage type {storage_type}")
        return tensor
    
    def get_shared_tensor(self, name: str, model_name: Optional[str] = None) -> Optional[SharedTensor]:
        """
        Get a shared tensor by name.
        
        Args:
            name: Name of the tensor to get
            model_name: Name of the model requesting the tensor
            
        Returns:
            The shared tensor or None if not found
        """
        if name not in self.tensors:
            logger.warning(f"Tensor {name} not found")
            self.cache_misses += 1
            return None
        
        tensor = self.tensors[name]
        
        # Update usage stats
        self.tensor_usage_stats[name]["access_count"] += 1
        self.tensor_usage_stats[name]["last_accessed"] = time.time()
        self.cache_hits += 1
        
        # If model name provided, acquire for this model
        if model_name:
            tensor.acquire(model_name)
            
            # Add to model's tensor set
            if model_name not in self.model_tensors:
                self.model_tensors[model_name] = set()
            self.model_tensors[model_name].add(name)
            
            # Update consumers in stats
            self.tensor_usage_stats[name]["consumers"].add(model_name)
        
        return tensor
    
    def create_tensor_view(self, 
                          tensor_name: str, 
                          view_name: str, 
                          offset: List[int], 
                          size: List[int],
                          model_name: Optional[str] = None) -> Optional[SharedTensorView]:
        """
        Create a view into a shared tensor.
        
        Args:
            tensor_name: Name of the parent tensor
            view_name: Name for the new view
            offset: Start indices for the view
            size: Size of the view
            model_name: Name of the model creating the view
            
        Returns:
            The created SharedTensorView or None if parent tensor not found
        """
        if tensor_name not in self.tensors:
            logger.warning(f"Parent tensor {tensor_name} not found")
            return None
        
        parent = self.tensors[tensor_name]
        
        # Create the view
        view = parent.create_view(view_name, offset, size)
        
        # If model name provided, acquire for this model
        if model_name:
            view.acquire(model_name)
        
        logger.info(f"Created tensor view {view_name} into {tensor_name} for model {model_name}")
        return view
    
    def share_tensor_between_models(self, 
                                   tensor_name: str, 
                                   from_model: str, 
                                   to_models: List[str]) -> bool:
        """
        Share a tensor from one model to others.
        
        Args:
            tensor_name: Name of the tensor to share
            from_model: Model sharing the tensor
            to_models: Models to share the tensor with
            
        Returns:
            True if sharing was successful
        """
        if tensor_name not in self.tensors:
            logger.warning(f"Tensor {tensor_name} not found for sharing")
            return False
        
        tensor = self.tensors[tensor_name]
        
        # Make sure the from_model is the producer or a consumer
        if tensor.producer_model != from_model and from_model not in tensor.consumer_models:
            logger.warning(f"Model {from_model} does not own tensor {tensor_name}")
            return False
        
        # Share with target models
        for model in to_models:
            if model not in self.model_tensors:
                self.model_tensors[model] = set()
            
            # Add to model's tensor set
            self.model_tensors[model].add(tensor_name)
            
            # Update usage stats
            self.tensor_usage_stats[tensor_name]["consumers"].add(model)
        
        logger.info(f"Shared tensor {tensor_name} from {from_model} to {to_models}")
        return True
    
    def optimize_memory_usage(self) -> Dict[str, Any]:
        """
        Optimize memory usage by freeing unused tensors.
        
        Returns:
            Dictionary with optimization results
        """
        initial_memory = self.current_memory_usage
        freed_tensors = []
        freed_memory = 0
        
        # Check for unused tensors that can be freed
        for name, tensor in list(self.tensors.items()):
            if tensor.can_be_freed():
                # Calculate memory to be freed
                tensor_memory = tensor.get_memory_usage()
                freed_memory += tensor_memory
                
                # Remove from manager
                del self.tensors[name]
                del self.tensor_usage_stats[name]
                
                # Remove from model mappings
                for model, tensor_set in self.model_tensors.items():
                    if name in tensor_set:
                        tensor_set.remove(name)
                
                freed_tensors.append(name)
                logger.info(f"Freed unused tensor {name}, saved {tensor_memory / (1024*1024):.2f} MB")
        
        # Update current memory usage
        self.current_memory_usage -= freed_memory
        
        # Prepare result dictionary
        result = {
            "initial_memory_bytes": initial_memory,
            "current_memory_bytes": self.current_memory_usage,
            "freed_memory_bytes": freed_memory,
            "freed_tensors_count": len(freed_tensors),
            "freed_tensors": freed_tensors,
            "memory_reduction_percent": (freed_memory / initial_memory * 100) if initial_memory > 0 else 0,
            "remaining_tensor_count": len(self.tensors)
        }
        
        logger.info(f"Memory optimization complete: freed {freed_memory / (1024*1024):.2f} MB ({result['memory_reduction_percent']:.1f}%)")
        return result
    
    def analyze_sharing_opportunities(self) -> Dict[str, List[str]]:
        """
        Analyze the current models and tensors to identify sharing opportunities.
        
        Returns:
            Dictionary of tensor names to lists of models that could share them
        """
        opportunities = {}
        
        # Identify potential sharing opportunities based on model combinations
        active_models = set(self.model_tensors.keys())
        
        # Check each sharing pattern
        for tensor_type, compatible_models in self.sharing_patterns.items():
            # Find active models that match this pattern
            matching_models = active_models.intersection(compatible_models)
            
            if len(matching_models) >= 2:
                # There are at least 2 active models that could share this tensor type
                opportunities[tensor_type] = list(matching_models)
        
        logger.info(f"Identified {len(opportunities)} tensor sharing opportunities")
        return opportunities
    
    def get_tensor_memory_usage(self) -> Dict[str, Dict[str, Any]]:
        """
        Get detailed memory usage by tensor.
        
        Returns:
            Dictionary mapping tensor names to memory usage info
        """
        memory_usage = {}
        
        for name, tensor in self.tensors.items():
            memory_bytes = tensor.get_memory_usage()
            memory_usage[name] = {
                "memory_bytes": memory_bytes,
                "memory_mb": memory_bytes / (1024 * 1024),
                "shape": tensor.shape,
                "dtype": tensor.dtype,
                "storage_type": tensor.storage_type,
                "reference_count": tensor.reference_count,
                "consumer_count": len(tensor.consumer_models),
                "consumers": list(tensor.consumer_models),
                "producer": tensor.producer_model
            }
        
        return memory_usage
    
    def get_model_memory_usage(self) -> Dict[str, Dict[str, Any]]:
        """
        Get detailed memory usage by model.
        
        Returns:
            Dictionary mapping model names to memory usage info
        """
        model_memory = {}
        
        for model_name, tensor_names in self.model_tensors.items():
            total_memory = 0
            tensor_details = {}
            
            for tensor_name in tensor_names:
                if tensor_name in self.tensors:
                    tensor = self.tensors[tensor_name]
                    memory_bytes = tensor.get_memory_usage()
                    total_memory += memory_bytes
                    
                    tensor_details[tensor_name] = {
                        "memory_bytes": memory_bytes,
                        "memory_mb": memory_bytes / (1024 * 1024),
                        "shape": tensor.shape
                    }
            
            model_memory[model_name] = {
                "total_memory_bytes": total_memory,
                "total_memory_mb": total_memory / (1024 * 1024),
                "tensor_count": len(tensor_names),
                "tensors": tensor_details
            }
        
        return model_memory
    
    def get_optimization_recommendations(self) -> Dict[str, Any]:
        """
        Get recommendations for memory optimization.
        
        Returns:
            Dictionary with optimization recommendations
        """
        # Analyze current memory usage
        model_memory = self.get_model_memory_usage()
        tensor_memory = self.get_tensor_memory_usage()
        
        # Find the largest tensors
        largest_tensors = sorted(
            [(name, info["memory_bytes"]) for name, info in tensor_memory.items()],
            key=lambda x: x[1],
            reverse=True
        )[:5]  # Top 5 largest tensors
        
        # Find tensors with low reference counts
        low_ref_tensors = [
            name for name, tensor in self.tensors.items()
            if tensor.reference_count <= 1 and not tensor.is_pinned
        ]
        
        # Find shared tensor opportunities
        sharing_opportunities = self.analyze_sharing_opportunities()
        
        # Prepare recommendations
        recommendations = {
            "largest_tensors": [
                {"name": name, "memory_mb": memory_bytes / (1024 * 1024)}
                for name, memory_bytes in largest_tensors
            ],
            "low_reference_tensors": low_ref_tensors,
            "sharing_opportunities": sharing_opportunities,
            "total_memory_mb": self.current_memory_usage / (1024 * 1024),
            "potential_savings_mb": sum(
                tensor.get_memory_usage() for name, tensor in self.tensors.items()
                if tensor.can_be_freed()
            ) / (1024 * 1024),
            "cache_efficiency": {
                "hits": self.cache_hits,
                "misses": self.cache_misses,
                "hit_rate": self.cache_hits / (self.cache_hits + self.cache_misses) 
                if (self.cache_hits + self.cache_misses) > 0 else 0
            }
        }
        
        return recommendations
    
    def release_model_tensors(self, model_name: str) -> int:
        """
        Release all tensors used by a model.
        
        Args:
            model_name: Name of the model to release tensors for
            
        Returns:
            Number of tensors released
        """
        if model_name not in self.model_tensors:
            logger.warning(f"Model {model_name} not found in tensor manager")
            return 0
        
        released_count = 0
        for tensor_name in list(self.model_tensors[model_name]):
            if tensor_name in self.tensors:
                tensor = self.tensors[tensor_name]
                tensor.release(model_name)
                released_count += 1
        
        # Remove model from tracking
        del self.model_tensors[model_name]
        
        logger.info(f"Released {released_count} tensors for model {model_name}")
        return released_count
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the tensor sharing manager.
        
        Returns:
            Dictionary with statistics
        """
        return {
            "total_tensors": len(self.tensors),
            "total_models": len(self.model_tensors),
            "memory_usage_bytes": self.current_memory_usage,
            "memory_usage_mb": self.current_memory_usage / (1024 * 1024),
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "hit_rate": self.cache_hits / (self.cache_hits + self.cache_misses) 
                if (self.cache_hits + self.cache_misses) > 0 else 0,
            "models": list(self.model_tensors.keys()),
            "sharing_opportunities": self.analyze_sharing_opportunities()
        }


def get_compatible_models_for_tensor(tensor_type: str) -> List[str]:
    """
    Get models that can share a tensor of the given type.
    
    Args:
        tensor_type: Type of tensor to check
        
    Returns:
        List of compatible model names
    """
    # Default sharing patterns for common tensor types
    sharing_patterns = {
        "text_embedding": ["bert", "t5", "llama", "bart", "roberta", "gpt2"],
        "vision_embedding": ["vit", "clip", "detr", "swin", "dino"],
        "audio_embedding": ["whisper", "wav2vec2", "clap", "hubert"],
        "vision_text_joint": ["clip", "llava", "blip", "xclip"],
        "audio_text_joint": ["clap", "whisper_text", "wav2vec2_text"],
    }
    
    return sharing_patterns.get(tensor_type, [])


def create_tensor_sharing_demo():
    """
    Create a demonstration of tensor sharing functionality.
    
    Returns:
        Dictionary with demonstration results
    """
    # Create tensor sharing manager
    manager = TensorSharingManager(max_memory_mb=2048)
    
    # Register example tensors
    text_embedding = manager.register_shared_tensor(
        name="bert_embedding",
        shape=[1, 768],
        storage_type="cpu",
        producer_model="bert",
        consumer_models=["t5", "llama"],
        dtype="float32"
    )
    
    vision_embedding = manager.register_shared_tensor(
        name="vit_embedding",
        shape=[1, 1024],
        storage_type="webgpu",
        producer_model="vit",
        consumer_models=["clip"],
        dtype="float32"
    )
    
    # Create a tensor view
    embedding_view = manager.create_tensor_view(
        tensor_name="bert_embedding",
        view_name="bert_embedding_first_half",
        offset=[0, 0],
        size=[1, 384],
        model_name="t5"
    )
    
    # Share tensor with additional models
    manager.share_tensor_between_models(
        tensor_name="vit_embedding",
        from_model="vit",
        to_models=["llava", "xclip"]
    )
    
    # Analyze sharing opportunities
    opportunities = manager.analyze_sharing_opportunities()
    
    # Get memory usage
    model_memory = manager.get_model_memory_usage()
    tensor_memory = manager.get_tensor_memory_usage()
    
    # Get optimization recommendations
    recommendations = manager.get_optimization_recommendations()
    
    # Release model tensors
    released_count = manager.release_model_tensors("llama")
    
    # Run memory optimization
    optimization_results = manager.optimize_memory_usage()
    
    # Get final stats
    stats = manager.get_stats()
    
    # Prepare result for demonstration
    result = {
        "registered_tensors": {
            "text_embedding": str(text_embedding),
            "vision_embedding": str(vision_embedding),
            "embedding_view": str(embedding_view)
        },
        "sharing_opportunities": opportunities,
        "model_memory_usage": model_memory,
        "tensor_memory_usage": tensor_memory,
        "optimization_recommendations": recommendations,
        "released_count": released_count,
        "optimization_results": optimization_results,
        "final_stats": stats
    }
    
    return result


# When run directly, demonstrate the functionality
if __name__ == "__main__":
    demo_results = create_tensor_sharing_demo()
    print("Cross-Model Tensor Sharing Demo")
    print("===============================\n")
    
    print("Registered Tensors:")
    for name, tensor in demo_results["registered_tensors"].items():
        print(f"  {name}: {tensor}")
    
    print("\nSharing Opportunities:")
    for tensor_type, models in demo_results["sharing_opportunities"].items():
        print(f"  {tensor_type}: {models}")
    
    print("\nOptimization Recommendations:")
    recommendations = demo_results["optimization_recommendations"]
    print(f"  Largest tensors: {recommendations['largest_tensors']}")
    print(f"  Low reference tensors: {recommendations['low_reference_tensors']}")
    print(f"  Total memory: {recommendations['total_memory_mb']:.2f} MB")
    print(f"  Potential savings: {recommendations['potential_savings_mb']:.2f} MB")
    
    print("\nOptimization Results:")
    results = demo_results["optimization_results"]
    print(f"  Initial memory: {results['initial_memory_bytes'] / (1024*1024):.2f} MB")
    print(f"  Current memory: {results['current_memory_bytes'] / (1024*1024):.2f} MB")
    print(f"  Memory reduction: {results['memory_reduction_percent']:.2f}%")
    print(f"  Freed tensors: {results['freed_tensors_count']}")
    
    print("\nFinal Stats:")
    stats = demo_results["final_stats"]
    print(f"  Total tensors: {stats['total_tensors']}")
    print(f"  Total models: {stats['total_models']}")
    print(f"  Memory usage: {stats['memory_usage_mb']:.2f} MB")
    print(f"  Cache hit rate: {stats['hit_rate'] * 100:.2f}%")