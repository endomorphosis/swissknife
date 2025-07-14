export type Tensor = any; // Placeholder for actual Tensor type

export interface Device {
  id: string;
  compileModel(modelPath: string): Promise<CompiledModel>;
  execute(model: CompiledModel, input: Tensor, options?: InferenceOptions): Promise<Tensor>;
}

export interface CompiledModel {
  id: string;
  compiled: boolean;
  // Add any other properties relevant to a compiled model
}

export interface DeviceManager {
  initialize(): Promise<boolean>;
  getBestDevice(preference?: string): Promise<Device>;
}

export interface InferenceOptions {
  modelId: string; // Identifier for the model to use
  modelPath?: string; // Path or URL to load the model from (if not cached)
  inputTensor: Tensor;
  optimizationLevel?: 'balanced' | 'performance' | 'memory'; // Hint for optimization
  backendPreference?: 'webnn' | 'webgpu' | 'wasm' | 'cpu'; // Preferred backend
  batchSize?: number;
  maxTokens?: number; // For generative models
  // Add other inference parameters (e.g., sampling config)
}
