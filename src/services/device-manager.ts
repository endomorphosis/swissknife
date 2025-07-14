import { HardwareAccelerator } from '../ml/hardware/accelerator';
import { DeviceManager, Device, CompiledModel, InferenceOptions, Tensor } from '../types/device';

// Placeholder for actual Tensor type
// This should eventually be replaced by a proper Tensor class/interface
// import { Tensor } from '../tensor/tensor';

export class DefaultDeviceManager implements DeviceManager {
  private accelerator: HardwareAccelerator;

  constructor() {
    this.accelerator = new HardwareAccelerator();
  }

  async initialize(): Promise<boolean> {
    // The HardwareAccelerator already handles its own initialization/detection
    // We might want to add a method to HardwareAccelerator to explicitly wait for detection
    // For now, we'll assume it's ready after construction or its internal async detection completes.
    return true; // Assuming detection happens internally and is eventually ready
  }

  async getBestDevice(preference?: string): Promise<Device> {
    const backend = this.accelerator.getBackend(preference as any || 'auto'); // Cast to any for now due to type mismatch

    // Adapt the ExecutionBackend to the Device interface
    const device: Device = {
      id: backend.type,
      compileModel: async (modelPath: string): Promise<CompiledModel> => {
        // In a real scenario, this would involve loading and compiling the model
        // using the specific backend (e.g., WebNN's compileGraph, or WebGPU's pipeline creation)
        console.log(`Compiling model ${modelPath} for device ${backend.type}...`);
        // Placeholder for actual compilation logic
        return { id: modelPath, compiled: true };
      },
      execute: async (model: CompiledModel, input: Tensor, options?: InferenceOptions): Promise<Tensor> => {
        console.log(`Executing model ${model.id} on device ${backend.type}...`);
        // Placeholder for actual execution logic using the backend's runInference
        const preparedInput = backend.prepareInput(input);
        const backendOutput = await backend.runInference(model, preparedInput);
        return backend.formatOutput(backendOutput);
      },
    };
    return device;
  }
}
