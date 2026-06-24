import { spawnSync } from "child_process";

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type CommandRunner = (command: string, args: string[]) => CommandResult;

type CudaVisibleDevicesSummary = {
  raw: string | undefined;
  mode: "unset" | "all" | "none" | "filtered";
  deviceIds: string[];
};

type CudaDebugSnapshot = {
  nodeVersion: string;
  platform: NodeJS.Platform;
  cudaVisibleDevices: CudaVisibleDevicesSummary;
  nvidiaSmi: {
    available: boolean;
    status: number | null;
    stdout: string;
    stderr: string;
    error?: string;
  };
};

const defaultCommandRunner: CommandRunner = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5000,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
};

export function summarizeCudaVisibleDevices(
  value: string | undefined,
): CudaVisibleDevicesSummary {
  if (value === undefined) {
    return { raw: value, mode: "unset", deviceIds: [] };
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return { raw: value, mode: "all", deviceIds: [] };
  }

  if (trimmed === "-1" || trimmed.toLowerCase() === "none") {
    return { raw: value, mode: "none", deviceIds: [] };
  }

  return {
    raw: value,
    mode: "filtered",
    deviceIds: trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

export function collectCudaDebugSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  runCommand: CommandRunner = defaultCommandRunner,
): CudaDebugSnapshot {
  const nvidiaSmi = runCommand("nvidia-smi", [
    "--query-gpu=name,driver_version,memory.total",
    "--format=csv,noheader",
  ]);

  return {
    nodeVersion: process.version,
    platform: process.platform,
    cudaVisibleDevices: summarizeCudaVisibleDevices(env.CUDA_VISIBLE_DEVICES),
    nvidiaSmi: {
      available: nvidiaSmi.status === 0 && nvidiaSmi.error === undefined,
      status: nvidiaSmi.status,
      stdout: nvidiaSmi.stdout.trim(),
      stderr: nvidiaSmi.stderr.trim(),
      error: nvidiaSmi.error,
    },
  };
}

describe("CUDA debug diagnostics", () => {
  it("summarizes unset CUDA_VISIBLE_DEVICES as an unrestricted default", () => {
    expect(summarizeCudaVisibleDevices(undefined)).toEqual({
      raw: undefined,
      mode: "unset",
      deviceIds: [],
    });
  });

  it("summarizes explicit CUDA device filters", () => {
    expect(summarizeCudaVisibleDevices("0, 2")).toEqual({
      raw: "0, 2",
      mode: "filtered",
      deviceIds: ["0", "2"],
    });
  });

  it("summarizes disabled CUDA visibility", () => {
    expect(summarizeCudaVisibleDevices("-1")).toEqual({
      raw: "-1",
      mode: "none",
      deviceIds: [],
    });
  });

  it("collects a stable snapshot without requiring CUDA hardware", () => {
    const snapshot = collectCudaDebugSnapshot(
      { CUDA_VISIBLE_DEVICES: "1" },
      () => ({
        status: 0,
        stdout: "Example GPU, 550.54, 8192 MiB\n",
        stderr: "",
      }),
    );

    expect(snapshot.cudaVisibleDevices).toEqual({
      raw: "1",
      mode: "filtered",
      deviceIds: ["1"],
    });
    expect(snapshot.nvidiaSmi).toEqual({
      available: true,
      status: 0,
      stdout: "Example GPU, 550.54, 8192 MiB",
      stderr: "",
      error: undefined,
    });
  });

  it("reports nvidia-smi as unavailable when the probe command fails", () => {
    const snapshot = collectCudaDebugSnapshot(
      {},
      () => ({
        status: null,
        stdout: "",
        stderr: "",
        error: "spawn nvidia-smi ENOENT",
      }),
    );

    expect(snapshot.nvidiaSmi.available).toBe(false);
    expect(snapshot.nvidiaSmi.error).toBe("spawn nvidia-smi ENOENT");
  });
});
