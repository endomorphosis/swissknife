"""
Worker module for WebNN and WebGPU acceleration.

This module provides workers for WebNN and WebGPU acceleration.
"""

from fixed_web_platform.worker.web_utils import (
    initialize_web_model,
    run_web_inference,
    get_optimal_browser_for_model,
    optimize_for_audio_models,
    configure_ipfs_acceleration
)

__all__ = [
    "initialize_web_model",
    "run_web_inference",
    "get_optimal_browser_for_model",
    "optimize_for_audio_models",
    "configure_ipfs_acceleration"
]