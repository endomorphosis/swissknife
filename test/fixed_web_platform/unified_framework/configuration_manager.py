"""
Configuration Management System for Web Platform (August 2025)

This module provides a comprehensive configuration validation and management
system for WebNN and WebGPU platforms, ensuring optimal settings across
different browsers and hardware environments:

- Robust validation rules with detailed error reporting
- Automatic configuration correction for invalid settings
- Browser-specific optimization profiles
- Hardware-aware configuration
- Dynamic reconfiguration based on runtime conditions

Usage:
    from fixed_web_platform.unified_framework.configuration_manager import (
        ConfigurationManager, ConfigValidationRule, BrowserProfile
    )
    
    # Create configuration manager
    config_manager = ConfigurationManager(
        model_type="text",
        browser="chrome",
        auto_correct=True
    )
    
    # Validate configuration
    validation_result = config_manager.validate_configuration({
        "precision": "4bit",
        "batch_size": 1,
        "use_compute_shaders": True
    })
    
    # Get optimized configuration
    optimized_config = config_manager.get_optimized_configuration({
        "precision": "4bit",
        "use_kv_cache": True
    })
"""

import os
import time
import logging
import json
from typing import Dict, Any, List, Optional, Tuple, Callable, Union, Set, TypeVar

from .error_handling import ConfigurationError

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("web_platform.configuration")

# Type for configuration validation functions
T = TypeVar('T')
ValidationFunction = Callable[[Dict[str, Any]], bool]
CorrectionFunction = Callable[[Dict[str, Any]], Dict[str, Any]]

class ConfigValidationRule:
    """
    Validation rule for configuration settings.
    
    Each rule defines a condition that valid configurations must satisfy,
    along with error details and optional automatic correction function.
    """
    
    def __init__(self, 
                name: str,
                condition: ValidationFunction,
                error_message: str,
                severity: str = "error",
                can_auto_correct: bool = False,
                correction_function: Optional[CorrectionFunction] = None):
        """
        Initialize validation rule.
        
        Args:
            name: Rule name for identification
            condition: Function that tests if configuration satisfies this rule
            error_message: Human-readable error message when validation fails
            severity: Severity level of validation failure ("error", "warning", "info")
            can_auto_correct: Whether this rule violation can be automatically corrected
            correction_function: Function to automatically correct invalid configuration
        """
        self.name = name
        self.condition = condition
        self.error_message = error_message
        self.severity = severity
        self.can_auto_correct = can_auto_correct
        self.correction_function = correction_function
        
    def validate(self, config: Dict[str, Any]) -> bool:
        """
        Validate configuration against this rule.
        
        Args:
            config: Configuration dictionary to validate
            
        Returns:
            Whether the configuration passes this validation rule
        """
        try:
            return self.condition(config)
        except Exception as e:
            logger.error(f"Error validating rule {self.name}: {e}")
            # Validation errors default to failure
            return False
            
    def auto_correct(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Attempt to auto-correct configuration that violates this rule.
        
        Args:
            config: Invalid configuration dictionary
            
        Returns:
            Corrected configuration dictionary
        """
        if not self.can_auto_correct or not self.correction_function:
            return config
            
        try:
            corrected_config = self.correction_function(config)
            logger.info(f"Auto-corrected configuration for rule: {self.name}")
            return corrected_config
        except Exception as e:
            logger.error(f"Error auto-correcting for rule {self.name}: {e}")
            return config

class BrowserProfile:
    """
    Browser-specific configuration profile.
    
    Defines optimal configuration settings and compatibility constraints
    for a specific browser.
    """
    
    def __init__(self, browser_name: str, capabilities: Dict[str, Any]):
        """
        Initialize browser profile.
        
        Args:
            browser_name: Name of the browser
            capabilities: Dictionary of browser capabilities
        """
        self.browser_name = browser_name.lower()
        self.capabilities = capabilities
        
    def optimize_configuration(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Optimize configuration for this browser.
        
        Args:
            config: Configuration dictionary to optimize
            
        Returns:
            Optimized configuration dictionary
        """
        optimized = config.copy()
        
        # Apply browser-specific optimizations
        if self.browser_name == "chrome" or self.browser_name == "edge":
            # Chrome/Edge optimizations
            optimized.update({
                "use_shader_precompilation": True,
                "use_compute_shaders": True,
                "workgroup_size": [8, 8, 1],  # Optimal for Chrome/Edge
                "enable_parallel_loading": True
            })
            
        elif self.browser_name == "firefox":
            # Firefox optimizations
            optimized.update({
                "use_shader_precompilation": False,  # Limited support in Firefox
                "use_compute_shaders": True,
                "workgroup_size": [8, 4, 1],  # Better for Firefox
                "enable_parallel_loading": True,
                "firefox_audio_optimization": True  # Special Firefox audio optimization
            })
            
        elif self.browser_name == "safari":
            # Safari optimizations
            optimized.update({
                "use_shader_precompilation": True,
                "use_compute_shaders": False,  # Limited support in Safari
                "workgroup_size": [4, 4, 1],  # Better for Safari/Metal
                "enable_parallel_loading": True,
                "use_kv_cache": False,  # Not well supported in Safari
                "use_metal_optimizations": True
            })
            
        # Apply precision constraints
        if "precision" in optimized:
            precision = optimized["precision"]
            if precision in ["2bit", "3bit"] and self.browser_name == "safari":
                # Safari doesn't support 2-bit/3-bit precision
                optimized["precision"] = "4bit"
                logger.warning(f"Auto-corrected precision to 4bit for Safari compatibility")
                
        return optimized
        
    def check_compatibility(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Check configuration compatibility with browser.
        
        Args:
            config: Configuration dictionary to check
            
        Returns:
            List of compatibility issues, empty if fully compatible
        """
        compatibility_issues = []
        
        # Check precision compatibility
        if "precision" in config:
            precision = config["precision"].replace("bit", "")
            if not self.capabilities.get(f"{precision}bit", False):
                compatibility_issues.append({
                    "feature": "precision",
                    "value": config["precision"],
                    "message": f"{self.browser_name} does not support {precision}-bit precision",
                    "severity": "error"
                })
                
        # Check shader precompilation compatibility
        if config.get("use_shader_precompilation", False) and not self.capabilities.get("shader_precompilation", False):
            compatibility_issues.append({
                "feature": "shader_precompilation",
                "value": True,
                "message": f"{self.browser_name} has limited shader precompilation support",
                "severity": "warning"
            })
            
        # Check compute shader compatibility
        if config.get("use_compute_shaders", False) and not self.capabilities.get("compute_shaders", False):
            compatibility_issues.append({
                "feature": "compute_shaders",
                "value": True,
                "message": f"{self.browser_name} has limited compute shader support",
                "severity": "warning"
            })
            
        # Check model sharding compatibility
        if config.get("use_model_sharding", False) and not self.capabilities.get("model_sharding", False):
            compatibility_issues.append({
                "feature": "model_sharding",
                "value": True,
                "message": f"{self.browser_name} does not support model sharding",
                "severity": "error"
            })
            
        # Check KV-cache optimization compatibility
        if config.get("use_kv_cache", False) and not self.capabilities.get("kv_cache", False):
            compatibility_issues.append({
                "feature": "kv_cache",
                "value": True,
                "message": f"{self.browser_name} has limited KV-cache support",
                "severity": "warning"
            })
                
        return compatibility_issues

class ConfigurationManager:
    """
    Configuration validation and management system.
    
    Provides comprehensive configuration validation, optimization, and
    browser-specific adaptation for web platform ML models.
    """
    
    def __init__(self, 
                model_type: str = "text",
                browser: Optional[str] = None,
                hardware: Optional[str] = None,
                auto_correct: bool = True):
        """
        Initialize configuration manager.
        
        Args:
            model_type: Type of model (text, vision, audio, multimodal)
            browser: Browser information for browser-specific optimization
            hardware: Hardware information for hardware-specific optimization
            auto_correct: Whether to automatically correct invalid configurations
        """
        self.model_type = model_type
        self.browser = browser
        self.hardware = hardware
        self.auto_correct = auto_correct
        
        # Initialize configurations
        self._initialize_default_config()
        self._initialize_validation_rules()
        self._initialize_browser_profiles()
        
    def _initialize_default_config(self) -> None:
        """Initialize default configuration based on model type."""
        # Base default configuration
        self.default_config = {
            "precision": "4bit",  # Default to 4-bit precision
            "batch_size": 1,
            "use_kv_cache": True,
            "use_compute_shaders": True,
            "use_shader_precompilation": True,
            "enable_parallel_loading": "WEB_PARALLEL_LOADING_ENABLED" in os.environ,
            "use_model_sharding": "ENABLE_MODEL_SHARDING" in os.environ,
            "workgroup_size": [8, 8, 1],  # Default workgroup size
            "memory_threshold_mb": int(os.environ.get("WEBGPU_MEMORY_THRESHOLD_MB", "2048")),
            "error_recovery": "auto"
        }
        
        # Model-specific default configurations
        if self.model_type == "text":
            self.default_config.update({
                "use_kv_cache": True,
                "enable_parallel_loading": False
            })
        elif self.model_type == "vision":
            self.default_config.update({
                "use_kv_cache": False,
                "enable_parallel_loading": False
            })
        elif self.model_type == "audio":
            self.default_config.update({
                "use_compute_shaders": True,  # Important for audio
                "use_kv_cache": False,
                "enable_parallel_loading": False
            })
        elif self.model_type == "multimodal":
            self.default_config.update({
                "enable_parallel_loading": True,  # Important for multimodal
                "use_kv_cache": True
            })
            
    def _initialize_validation_rules(self) -> None:
        """Initialize configuration validation rules."""
        self.validation_rules = [
            # Precision rule
            ConfigValidationRule(
                name="precision",
                condition=lambda cfg: cfg.get("precision") in ["2bit", "3bit", "4bit", "8bit", "16bit"],
                error_message="Invalid precision setting. Must be one of: 2bit, 3bit, 4bit, 8bit, 16bit",
                severity="error",
                can_auto_correct=True,
                correction_function=lambda cfg: {**cfg, "precision": "4bit"}  # Default to 4bit
            ),
            
            # Memory threshold rule
            ConfigValidationRule(
                name="memory_threshold",
                condition=lambda cfg: cfg.get("memory_threshold_mb", 0) >= 100,
                error_message="Memory threshold too low. Must be at least 100MB",
                severity="warning",
                can_auto_correct=True,
                correction_function=lambda cfg: {
                    **cfg, 
                    "memory_threshold_mb": max(cfg.get("memory_threshold_mb", 0), 100)
                }
            ),
            
            # Batch size rule
            ConfigValidationRule(
                name="batch_size",
                condition=lambda cfg: cfg.get("batch_size", 1) >= 1,
                error_message="Batch size must be at least 1",
                severity="error",
                can_auto_correct=True,
                correction_function=lambda cfg: {**cfg, "batch_size": 1}
            ),
            
            # Workgroup size rule
            ConfigValidationRule(
                name="workgroup_size",
                condition=lambda cfg: (
                    isinstance(cfg.get("workgroup_size"), list) and 
                    len(cfg.get("workgroup_size", [])) == 3 and
                    all(isinstance(x, int) and x > 0 for x in cfg.get("workgroup_size", []))
                ),
                error_message="Workgroup size must be a list of 3 positive integers",
                severity="error",
                can_auto_correct=True,
                correction_function=lambda cfg: {**cfg, "workgroup_size": [8, 8, 1]}
            ),
            
            # Model-specific validation rules
            ConfigValidationRule(
                name="parallel_loading_compatibility",
                condition=lambda cfg: not (
                    self.model_type == "text" and cfg.get("enable_parallel_loading", False)
                ),
                error_message="Parallel loading not recommended for text models",
                severity="warning",
                can_auto_correct=True,
                correction_function=lambda cfg: {
                    **cfg, 
                    "enable_parallel_loading": False if self.model_type == "text" else cfg.get("enable_parallel_loading", False)
                }
            ),
            
            # KV cache compatibility rule
            ConfigValidationRule(
                name="kv_cache_compatibility",
                condition=lambda cfg: not (
                    self.model_type in ["vision", "audio"] and cfg.get("use_kv_cache", False)
                ),
                error_message="KV-cache optimization not applicable for vision/audio models",
                severity="warning",
                can_auto_correct=True,
                correction_function=lambda cfg: {
                    **cfg,
                    "use_kv_cache": False if self.model_type in ["vision", "audio"] else cfg.get("use_kv_cache", False)
                }
            )
        ]
        
    def _initialize_browser_profiles(self) -> None:
        """Initialize browser profiles for optimization."""
        # Define browser capabilities
        browser_capabilities = {
            "chrome": {
                "2bit": True,
                "3bit": True,
                "4bit": True,
                "8bit": True,
                "16bit": True,
                "shader_precompilation": True,
                "compute_shaders": True,
                "parallel_loading": True,
                "model_sharding": True,
                "kv_cache": True
            },
            "edge": {
                "2bit": True,
                "3bit": True,
                "4bit": True,
                "8bit": True,
                "16bit": True,
                "shader_precompilation": True,
                "compute_shaders": True,
                "parallel_loading": True,
                "model_sharding": True,
                "kv_cache": True
            },
            "firefox": {
                "2bit": True,
                "3bit": True,
                "4bit": True,
                "8bit": True,
                "16bit": True,
                "shader_precompilation": False,  # Limited support
                "compute_shaders": True,
                "parallel_loading": True,
                "model_sharding": True,
                "kv_cache": True
            },
            "safari": {
                "2bit": False,
                "3bit": False,
                "4bit": True,
                "8bit": True,
                "16bit": True,
                "shader_precompilation": True,
                "compute_shaders": True,  # Limited but supported
                "parallel_loading": True,
                "model_sharding": False,
                "kv_cache": False
            },
            "mobile": {
                "2bit": True,
                "3bit": True,
                "4bit": True,
                "8bit": True,
                "16bit": True,
                "shader_precompilation": True,
                "compute_shaders": False,  # Limited on mobile
                "parallel_loading": True,
                "model_sharding": False,
                "kv_cache": False
            }
        }
        
        # Create browser profiles
        self.browser_profiles = {
            browser: BrowserProfile(browser, capabilities)
            for browser, capabilities in browser_capabilities.items()
        }
    
    def validate_configuration(self, 
                              config: Dict[str, Any],
                              raise_on_error: bool = False) -> Dict[str, Any]:
        """
        Validate configuration against all rules.
        
        Args:
            config: Configuration dictionary to validate
            raise_on_error: Whether to raise exception on validation failure
            
        Returns:
            Validation result dictionary
        """
        # Merge with defaults for any missing values
        full_config = {**self.default_config, **config}
        
        validation_errors = []
        auto_corrected = False
        
        # Apply all validation rules
        for rule in self.validation_rules:
            if not rule.validate(full_config):
                # Rule failed validation
                validation_error = {
                    "rule": rule.name,
                    "message": rule.error_message,
                    "severity": rule.severity,
                    "can_auto_correct": rule.can_auto_correct
                }
                validation_errors.append(validation_error)
                
                # Apply auto-correction if enabled
                if self.auto_correct and rule.can_auto_correct:
                    full_config = rule.auto_correct(full_config)
                    auto_corrected = True
                    
        # Check browser compatibility if browser is specified
        if self.browser and self.browser in self.browser_profiles:
            browser_profile = self.browser_profiles[self.browser]
            compatibility_issues = browser_profile.check_compatibility(full_config)
            
            # Add compatibility issues to validation errors
            for issue in compatibility_issues:
                validation_error = {
                    "rule": f"browser_compatibility_{issue['feature']}",
                    "message": issue["message"],
                    "severity": issue["severity"],
                    "can_auto_correct": issue["severity"] != "error"  # Only auto-correct warnings
                }
                validation_errors.append(validation_error)
                
                # Apply browser-specific auto-correction
                if self.auto_correct and issue["severity"] != "error":
                    full_config = browser_profile.optimize_configuration(full_config)
                    auto_corrected = True
        
        # Create validation result
        validation_result = {
            "valid": len(validation_errors) == 0,
            "errors": validation_errors,
            "auto_corrected": auto_corrected,
            "config": full_config
        }
        
        # Log validation result
        if validation_errors:
            logger.warning(f"Configuration validation failed with {len(validation_errors)} errors")
            
            if auto_corrected:
                logger.info("Configuration was automatically corrected")
        
        # Raise exception if requested
        if raise_on_error and validation_errors:
            critical_errors = [e for e in validation_errors 
                              if e["severity"] == "error" and not e["can_auto_correct"]]
            
            if critical_errors:
                error_message = "; ".join(e["message"] for e in critical_errors)
                raise ConfigurationError(
                    f"Configuration validation failed: {error_message}",
                    details={"validation_result": validation_result}
                )
        
        return validation_result
    
    def get_optimized_configuration(self, 
                                   config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get browser-optimized configuration.
        
        Args:
            config: Base configuration dictionary
            
        Returns:
            Optimized configuration dictionary
        """
        # Start with default config
        optimized_config = self.default_config.copy()
        
        # Apply user config
        optimized_config.update(config)
        
        # Apply browser-specific optimizations if browser is available
        if self.browser and self.browser in self.browser_profiles:
            browser_profile = self.browser_profiles[self.browser]
            optimized_config = browser_profile.optimize_configuration(optimized_config)
            
        # Apply model-type optimizations
        self._apply_model_optimizations(optimized_config)
        
        # Apply hardware-specific optimizations if hardware is available
        if self.hardware:
            self._apply_hardware_optimizations(optimized_config)
            
        # Validate final config
        validation_result = self.validate_configuration(optimized_config)
        
        return validation_result["config"]
    
    def _apply_model_optimizations(self, config: Dict[str, Any]) -> None:
        """Apply model-specific optimizations to configuration."""
        # Audio model optimizations
        if self.model_type == "audio":
            # Audio models benefit from compute shaders, especially in Firefox
            config["use_compute_shaders"] = True
            
            if self.browser == "firefox":
                config["firefox_audio_optimization"] = True
                config["workgroup_size"] = [256, 1, 1]  # Optimal for audio in Firefox
                
        # Multimodal model optimizations
        elif self.model_type == "multimodal":
            # Multimodal models benefit from parallel loading
            config["enable_parallel_loading"] = True
            
        # Text model optimizations (LLMs)
        elif self.model_type == "text":
            # LLMs benefit from KV-cache optimization
            config["use_kv_cache"] = True
            
            # Shader precompilation helps with first token generation
            config["use_shader_precompilation"] = True
    
    def _apply_hardware_optimizations(self, config: Dict[str, Any]) -> None:
        """Apply hardware-specific optimizations to configuration."""
        # This would be a more detailed implementation in practice
        if "mobile" in self.hardware.lower():
            # Mobile optimizations
            config["precision"] = "4bit"  # Use 4-bit for mobile
            config["workgroup_size"] = [4, 4, 1]  # Smaller workgroups for mobile
            config["use_compute_shaders"] = False  # Limited on mobile
            config["use_model_sharding"] = False  # Not suitable for mobile