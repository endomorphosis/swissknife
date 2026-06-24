import { CpuBackend, createCpuBackend } from "../../src/hardware/backends/cpu_backend";
import { WebgpuBackend, createWebgpuBackend } from "../../src/hardware/backends/webgpu_backend";
import { WebnnBackend, createWebnnBackend } from "../../src/hardware/backends/webnn_backend";
import {
  HardwareAbstraction,
  createHardwareAbstraction,
} from "../../src/hardware/hardware_abstraction";

type BackendCase = {
  name: string;
  BackendClass: new (options?: Record<string, unknown>) => {
    initialize(): Promise<void>;
    execute(input: unknown): Promise<unknown>;
    dispose(): void;
  };
  createBackend: (options?: Record<string, unknown>) => {
    initialize(): Promise<void>;
    execute(input: unknown): Promise<unknown>;
    dispose(): void;
  };
};

const backendCases: BackendCase[] = [
  {
    name: "CPU",
    BackendClass: CpuBackend,
    createBackend: createCpuBackend,
  },
  {
    name: "WebGPU",
    BackendClass: WebgpuBackend,
    createBackend: createWebgpuBackend,
  },
  {
    name: "WebNN",
    BackendClass: WebnnBackend,
    createBackend: createWebnnBackend,
  },
  {
    name: "hardware abstraction",
    BackendClass: HardwareAbstraction,
    createBackend: createHardwareAbstraction,
  },
];

describe("hardware backend placeholders", () => {
  it.each(backendCases)(
    "creates a $name backend through its factory",
    ({ BackendClass, createBackend }) => {
      expect(createBackend({ modelId: "bert-base-uncased" })).toBeInstanceOf(BackendClass);
    },
  );

  it.each(backendCases)(
    "initializes and executes the $name backend contract",
    async ({ createBackend }) => {
      const backend = createBackend({ preferRealHardware: false });

      await expect(backend.initialize()).resolves.toBeUndefined();
      await expect(backend.execute({ tokens: [101, 102] })).resolves.toEqual({
        success: true,
      });
      expect(() => backend.dispose()).not.toThrow();
    },
  );
});
