type CudaDevice = {
  id: number;
  name: string;
  computeCapability?: string;
  totalMemoryMb?: number;
};

type CudaProbe = {
  torchImported: boolean;
  cudaAvailable: boolean;
  deviceCount: number;
  currentDevice?: number;
  devices?: CudaDevice[];
  error?: string;
};

type CudaDebugReport = {
  source: "test_cuda_debug.py";
  status: "available" | "unavailable" | "error";
  torchImported: boolean;
  cudaAvailable: boolean;
  deviceCount: number;
  currentDevice: number | null;
  devices: CudaDevice[];
  messages: string[];
};

function createCudaDebugReport(probe: CudaProbe): CudaDebugReport {
  const devices = probe.devices ?? [];
  const currentDevice = probe.currentDevice ?? null;
  const messages: string[] = [];

  if (probe.error) {
    messages.push(`CUDA probe failed: ${probe.error}`);
  }

  if (!probe.torchImported) {
    messages.push("PyTorch could not be imported.");
  } else if (!probe.cudaAvailable) {
    messages.push("PyTorch imported successfully, but CUDA is not available.");
  } else {
    messages.push(`CUDA is available with ${probe.deviceCount} device(s).`);
  }

  for (const device of devices) {
    const capability = device.computeCapability ? `, compute capability ${device.computeCapability}` : "";
    const memory =
      typeof device.totalMemoryMb === "number" ? `, ${device.totalMemoryMb} MB total memory` : "";

    messages.push(`Device ${device.id}: ${device.name}${capability}${memory}.`);
  }

  return {
    source: "test_cuda_debug.py",
    status: probe.error ? "error" : probe.cudaAvailable ? "available" : "unavailable",
    torchImported: probe.torchImported,
    cudaAvailable: probe.cudaAvailable,
    deviceCount: probe.deviceCount,
    currentDevice,
    devices,
    messages,
  };
}

describe("CUDA debug conversion fixture", () => {
  it("reports unavailable CUDA without requiring a local GPU", () => {
    const report = createCudaDebugReport({
      torchImported: true,
      cudaAvailable: false,
      deviceCount: 0,
    });

    expect(report).toMatchObject({
      source: "test_cuda_debug.py",
      status: "unavailable",
      torchImported: true,
      cudaAvailable: false,
      deviceCount: 0,
      currentDevice: null,
      devices: [],
    });
    expect(report.messages).toEqual(["PyTorch imported successfully, but CUDA is not available."]);
  });

  it("summarizes available CUDA devices with stable, parseable messages", () => {
    const report = createCudaDebugReport({
      torchImported: true,
      cudaAvailable: true,
      deviceCount: 1,
      currentDevice: 0,
      devices: [
        {
          id: 0,
          name: "NVIDIA Test GPU",
          computeCapability: "8.0",
          totalMemoryMb: 16384,
        },
      ],
    });

    expect(report.status).toBe("available");
    expect(report.messages).toEqual([
      "CUDA is available with 1 device(s).",
      "Device 0: NVIDIA Test GPU, compute capability 8.0, 16384 MB total memory.",
    ]);
  });

  it("records import or probe failures as errors instead of malformed converted syntax", () => {
    const report = createCudaDebugReport({
      torchImported: false,
      cudaAvailable: false,
      deviceCount: 0,
      error: "Cannot find module torch",
    });

    expect(report.status).toBe("error");
    expect(report.messages).toEqual([
      "CUDA probe failed: Cannot find module torch",
      "PyTorch could not be imported.",
    ]);
  });
});

export {};
