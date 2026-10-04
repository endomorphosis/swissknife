#!/usr/bin/env python3
"""
WebGPU Shader Registry - Manages browser-specific optimized shaders for the WebGPU backend

This module provides a registry for browser-optimized WebGPU shaders that can be
used with the 4-bit inference and adaptive precision systems. It selects the appropriate
shader implementation based on the detected browser environment and model requirements.
"""

import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("webgpu_shader_registry")

class WebGPUShaderRegistry:
    """Registry for browser-specific optimized WebGPU shaders."""
    
    def __init__(self, shader_dir: Optional[str] = None):
        """
        Initialize the shader registry.
        
        Args:
            shader_dir: Directory containing shader files (default: wgsl_shaders subdirectory)
        """
        if shader_dir is None:
            # Use the wgsl_shaders directory relative to this file
            self.shader_dir = os.path.join(os.path.dirname(__file__), "wgsl_shaders")
        else:
            self.shader_dir = shader_dir
            
        # Create shader directory if it doesn't exist
        os.makedirs(self.shader_dir, exist_ok=True)
        
        # Cache of loaded shaders
        self.shader_cache: Dict[str, str] = {}
        
        # Registry of available shaders
        self.available_shaders = self._discover_available_shaders()
        
        logger.info(f"Initialized WebGPU shader registry with {len(self.available_shaders)} shaders")
    
    def _discover_available_shaders(self) -> Dict[str, str]:
        """
        Discover available shader files in the shader directory.
        
        Returns:
            Dictionary mapping shader names to file paths
        """
        shader_files = {}
        
        try:
            for file_path in Path(self.shader_dir).glob("*.wgsl"):
                shader_name = file_path.stem
                shader_files[shader_name] = str(file_path)
                logger.debug(f"Discovered shader: {shader_name} at {file_path}")
        except Exception as e:
            logger.warning(f"Error discovering shaders: {e}")
        
        return shader_files
    
    def get_shader(self, shader_name: str) -> Optional[str]:
        """
        Get a shader by name.
        
        Args:
            shader_name: Name of the shader
            
        Returns:
            Shader source code or None if not found
        """
        # Check if shader is in cache
        if shader_name in self.shader_cache:
            return self.shader_cache[shader_name]
        
        # Check if shader is available
        if shader_name not in self.available_shaders:
            logger.warning(f"Shader '{shader_name}' not found in registry")
            return None
        
        # Load shader from file
        try:
            with open(self.available_shaders[shader_name], 'r') as f:
                shader_code = f.read()
                
            # Add to cache
            self.shader_cache[shader_name] = shader_code
            
            return shader_code
        except Exception as e:
            logger.error(f"Error loading shader '{shader_name}': {e}")
            return None
    
    def get_browser_optimized_shader(
        self, 
        browser_name: str,
        operation: str,
        model_type: Optional[str] = None,
        fallback: bool = True
    ) -> Optional[str]:
        """
        Get a browser-optimized shader for a specific operation.
        
        Args:
            browser_name: Browser name (chrome, firefox, safari, edge)
            operation: Operation name (matmul_4bit, attention, etc.)
            model_type: Optional model type for more specific optimizations
            fallback: Whether to fall back to generic shader if browser-specific one is not available
            
        Returns:
            Shader source code or None if not found
        """
        # Browser-specific shader
        browser_shader_name = f"{browser_name}_optimized_{operation}"
        
        # Check for model-specific variation
        if model_type:
            model_specific_name = f"{browser_name}_optimized_{model_type}_{operation}"
            shader = self.get_shader(model_specific_name)
            if shader:
                return shader
        
        # Try browser-specific shader
        shader = self.get_shader(browser_shader_name)
        if shader:
            return shader
        
        # Fall back to generic shader if allowed
        if fallback:
            generic_shader_name = f"optimized_{operation}"
            shader = self.get_shader(generic_shader_name)
            if shader:
                return shader
                
            # Last resort: basic implementation
            basic_shader_name = operation
            return self.get_shader(basic_shader_name)
        
        return None

    def get_all_browser_shaders(self, operation: str) -> Dict[str, Optional[str]]:
        """
        Get all available browser-specific shaders for an operation.
        
        Args:
            operation: Operation name (matmul_4bit, attention, etc.)
            
        Returns:
            Dictionary mapping browser names to shader code
        """
        browsers = ["chrome", "firefox", "safari", "edge"]
        result = {}
        
        for browser in browsers:
            result[browser] = self.get_browser_optimized_shader(browser, operation)
            
        return result
    
    def register_shader(self, shader_name: str, shader_code: str) -> bool:
        """
        Register a new shader in the registry.
        
        Args:
            shader_name: Name of the shader
            shader_code: Shader source code
            
        Returns:
            True if registration was successful, False otherwise
        """
        try:
            # Save shader to file
            file_path = os.path.join(self.shader_dir, f"{shader_name}.wgsl")
            with open(file_path, 'w') as f:
                f.write(shader_code)
            
            # Update registry
            self.available_shaders[shader_name] = file_path
            self.shader_cache[shader_name] = shader_code
            
            logger.info(f"Registered shader: {shader_name}")
            return True
        except Exception as e:
            logger.error(f"Error registering shader '{shader_name}': {e}")
            return False
    
    def list_available_shaders(self) -> List[str]:
        """
        List all available shaders in the registry.
        
        Returns:
            List of shader names
        """
        return list(self.available_shaders.keys())
    
    def list_browser_optimized_shaders(self) -> Dict[str, List[str]]:
        """
        List all browser-optimized shaders by browser.
        
        Returns:
            Dictionary mapping browser names to lists of shader names
        """
        browser_shaders = {
            "chrome": [],
            "firefox": [],
            "safari": [],
            "edge": []
        }
        
        for shader_name in self.available_shaders.keys():
            for browser in browser_shaders.keys():
                if shader_name.startswith(f"{browser}_optimized_"):
                    browser_shaders[browser].append(shader_name)
        
        return browser_shaders


# Global shader registry instance
_shader_registry = None

def get_shader_registry() -> WebGPUShaderRegistry:
    """
    Get the global shader registry instance.
    
    Returns:
        WebGPUShaderRegistry instance
    """
    global _shader_registry
    if _shader_registry is None:
        _shader_registry = WebGPUShaderRegistry()
    return _shader_registry


if __name__ == "__main__":
    # Test the shader registry
    registry = get_shader_registry()
    
    # List available shaders
    shaders = registry.list_available_shaders()
    print(f"Available shaders: {', '.join(shaders)}")
    
    # List browser-optimized shaders
    browser_shaders = registry.list_browser_optimized_shaders()
    for browser, shader_list in browser_shaders.items():
        print(f"{browser.upper()} optimized shaders: {', '.join(shader_list)}")
    
    # Test getting browser-optimized shaders
    matmul_shaders = registry.get_all_browser_shaders("matmul_4bit")
    for browser, shader in matmul_shaders.items():
        if shader:
            print(f"\n{browser.upper()} optimized matmul shader available ({len(shader)} bytes)")
        else:
            print(f"\n{browser.upper()} has no optimized matmul shader")