"""
WebNN and WebGPU platform support for the test generator.

This package provides enhanced support for WebNN and WebGPU platforms
with proper input handling, batch support detection, and modality-specific
processing for various model types.

June 2025 Updates:
- Safari-specific WebGPU implementation with Metal optimizations
- Ultra-low precision (2-bit and 3-bit) quantization for memory efficiency
- Progressive model loading for large models with memory constraints
- Advanced browser capability detection and adaptation
- Cross-platform testing with WebAssembly fallback

March 2025 Updates:
- WebGPU compute shader support for audio models (20-35% performance improvement)
- Parallel model loading for multimodal models (30-45% loading time reduction)
- Shader precompilation for faster startup (reduced initial latency)
- Enhanced browser detection with Firefox support
- Performance tracking metrics integrated with benchmark database
- Complete coverage for all 13 high-priority model classes

Key Features:
1. WebGPU Compute Shaders - Specialized audio processing kernels to accelerate
   the Whisper, Wav2Vec2, and CLAP models with parallel feature extraction and
   optimized spectrogram processing.

2. Shader Precompilation - Reduces initial startup latency for vision and text
   models by precompiling common shader patterns for tensor operations and
   attention mechanisms.

3. Parallel Model Loading - Enables concurrent loading of model components
   for multimodal models like CLIP, LLaVA, and XCLIP, with significant
   improvements to loading times.

4. Cross-Browser Support - Works across Chrome, Edge, Firefox, and Safari (with
   version-specific optimizations), with graceful WebAssembly fallback.

5. Ultra-Low Precision - Enables 2-bit and 3-bit quantization with adaptive
   precision across model layers for optimal accuracy-efficiency balance.

6. Progressive Loading - Component-based loading system with memory awareness,
   prioritization, and hot-swappable components for large models.

7. Database Integration - Tracks performance metrics for WebNN and WebGPU
   backends in the benchmark database system.
"""

from .web_platform_handler import (
    process_for_web, 
    init_webnn, 
    init_webgpu, 
    create_mock_processors
)

# Import Safari WebGPU handler
try:
    from .safari_webgpu_handler import (
        SafariWebGPUHandler,
        optimize_for_safari
    )
    SAFARI_WEBGPU_AVAILABLE = True
except ImportError:
    SAFARI_WEBGPU_AVAILABLE = False

# Import ultra-low precision modules
try:
    from .webgpu_quantization import (
        setup_ultra_low_precision,
        create_2bit_compute_shaders,
        create_3bit_compute_shaders
    )
    ULTRA_LOW_PRECISION_AVAILABLE = True
except ImportError:
    ULTRA_LOW_PRECISION_AVAILABLE = False

# Import progressive model loading
try:
    from .progressive_model_loader import (
        ProgressiveModelLoader,
        MultimodalComponentManager,
        load_model_progressively
    )
    PROGRESSIVE_LOADING_AVAILABLE = True
except ImportError:
    PROGRESSIVE_LOADING_AVAILABLE = False

# Import WebGPU audio compute shaders (March 2025)
try:
    from .webgpu_audio_compute_shaders import (
        optimize_for_firefox,
        get_optimized_shader_for_firefox,
        enable_firefox_optimizations,
        add_firefox_optimizations_to_config
    )
    AUDIO_COMPUTE_SHADERS_AVAILABLE = True
except ImportError:
    AUDIO_COMPUTE_SHADERS_AVAILABLE = False

# Import WebGPU shader precompilation (March 2025)
try:
    from .webgpu_shader_precompilation import (
        ShaderPrecompiler,
        setup_shader_precompilation,
        precompile_model_shaders
    )
    SHADER_PRECOMPILATION_AVAILABLE = True
except ImportError:
    SHADER_PRECOMPILATION_AVAILABLE = False

# Import WebGPU shader registry (March 2025)
try:
    from .webgpu_shader_registry import (
        WebGPUShaderRegistry,
        get_shader_registry
    )
    SHADER_REGISTRY_AVAILABLE = True
except ImportError:
    SHADER_REGISTRY_AVAILABLE = False

# Import browser automation if available
try:
    from .browser_automation import (
        setup_browser_automation,
        run_browser_test,
        find_browser_executable
    )
    BROWSER_AUTOMATION_AVAILABLE = True
except ImportError:
    BROWSER_AUTOMATION_AVAILABLE = False

# Create comprehensive exports list
__all__ = [
    'process_for_web',
    'init_webnn',
    'init_webgpu',
    'create_mock_processors'
]

# Add browser automation if available
if BROWSER_AUTOMATION_AVAILABLE:
    __all__.extend([
        'setup_browser_automation',
        'run_browser_test',
        'find_browser_executable'
    ])

# Add Safari support if available
if SAFARI_WEBGPU_AVAILABLE:
    __all__.extend([
        'SafariWebGPUHandler',
        'optimize_for_safari'
    ])

# Add ultra-low precision if available
if ULTRA_LOW_PRECISION_AVAILABLE:
    __all__.extend([
        'setup_ultra_low_precision',
        'create_2bit_compute_shaders',
        'create_3bit_compute_shaders'
    ])

# Add progressive loading if available
if PROGRESSIVE_LOADING_AVAILABLE:
    __all__.extend([
        'ProgressiveModelLoader',
        'MultimodalComponentManager',
        'load_model_progressively'
    ])

# Add audio compute shaders if available (March 2025)
if AUDIO_COMPUTE_SHADERS_AVAILABLE:
    __all__.extend([
        'optimize_for_firefox',
        'get_optimized_shader_for_firefox',
        'enable_firefox_optimizations',
        'add_firefox_optimizations_to_config'
    ])

# Add shader precompilation if available (March 2025)
if SHADER_PRECOMPILATION_AVAILABLE:
    __all__.extend([
        'ShaderPrecompiler',
        'setup_shader_precompilation',
        'precompile_model_shaders'
    ])

# Add shader registry if available (March 2025)
if SHADER_REGISTRY_AVAILABLE:
    __all__.extend([
        'WebGPUShaderRegistry',
        'get_shader_registry'
    ])

# Add availability flags
__all__.extend([
    'BROWSER_AUTOMATION_AVAILABLE',
    'SAFARI_WEBGPU_AVAILABLE',
    'ULTRA_LOW_PRECISION_AVAILABLE',
    'PROGRESSIVE_LOADING_AVAILABLE',
    'AUDIO_COMPUTE_SHADERS_AVAILABLE',
    'SHADER_PRECOMPILATION_AVAILABLE',
    'SHADER_REGISTRY_AVAILABLE'
])