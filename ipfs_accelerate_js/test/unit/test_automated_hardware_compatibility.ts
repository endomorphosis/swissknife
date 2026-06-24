const DEFAULT_TEST_MODELS = {
  embedding: ["prajjwal1/bert-tiny", "distilbert-base-uncased"],
  text_generation: ["gpt2", "google/t5-efficient-tiny"],
  vision: ["google/vit-base-patch16-224", "facebook/dinov2-small"],
  audio: ["openai/whisper-tiny", "facebook/wav2vec2-base"],
  multimodal: ["openai/clip-vit-base-patch32", "vinvino02/glpn-tiny"],
};

type HardwarePlatform =
  | "cpu"
  | "cuda"
  | "rocm"
  | "mps"
  | "openvino"
  | "webnn"
  | "webgpu"
  | "qualcomm";

type ModelFamily = keyof typeof DEFAULT_TEST_MODELS;

type HardwareAvailability = Record<HardwarePlatform, boolean>;

type CompatibilityStatus = "compatible" | "unavailable" | "unsupported";

interface CompatibilityResult {
  family: ModelFamily;
  model: string;
  platform: HardwarePlatform;
  status: CompatibilityStatus;
  reason?: string;
}

const CPU_ONLY_HARDWARE: HardwareAvailability = {
  cpu: true,
  cuda: false,
  rocm: false,
  mps: false,
  openvino: false,
  webnn: false,
  webgpu: false,
  qualcomm: false,
};

const FAMILY_PLATFORM_SUPPORT: Record<ModelFamily, HardwarePlatform[]> = {
  embedding: ["cpu", "cuda", "rocm", "mps", "openvino", "webnn", "webgpu", "qualcomm"],
  text_generation: ["cpu", "cuda", "rocm", "mps", "openvino", "webgpu", "qualcomm"],
  vision: ["cpu", "cuda", "rocm", "mps", "openvino", "webnn", "webgpu"],
  audio: ["cpu", "cuda", "rocm", "mps", "openvino", "webgpu"],
  multimodal: ["cpu", "cuda", "rocm", "mps", "webgpu"],
};

function classifyModelFamily(modelName: string): ModelFamily {
  const normalized = modelName.toLowerCase();

  if (normalized.includes("whisper") || normalized.includes("wav2vec")) {
    return "audio";
  }

  if (normalized.includes("clip") || normalized.includes("glpn")) {
    return "multimodal";
  }

  if (normalized.includes("vit") || normalized.includes("dinov2")) {
    return "vision";
  }

  if (normalized.includes("gpt") || normalized.includes("t5")) {
    return "text_generation";
  }

  return "embedding";
}

function resolveHardwareAvailability(detected?: Partial<HardwareAvailability>): HardwareAvailability {
  return {
    ...CPU_ONLY_HARDWARE,
    ...detected,
    cpu: true,
  };
}

function buildCompatibilityResult(
  model: string,
  platform: HardwarePlatform,
  detected?: Partial<HardwareAvailability>,
): CompatibilityResult {
  const family = classifyModelFamily(model);
  const hardware = resolveHardwareAvailability(detected);

  if (!hardware[platform]) {
    return {
      family,
      model,
      platform,
      status: "unavailable",
      reason: `${platform} hardware is not available`,
    };
  }

  if (!FAMILY_PLATFORM_SUPPORT[family].includes(platform)) {
    return {
      family,
      model,
      platform,
      status: "unsupported",
      reason: `${family} models are not supported on ${platform}`,
    };
  }

  return {
    family,
    model,
    platform,
    status: "compatible",
  };
}

function buildCompatibilityMatrix(
  testModels: Record<ModelFamily, string[]> = DEFAULT_TEST_MODELS,
  detected?: Partial<HardwareAvailability>,
): CompatibilityResult[] {
  const platforms = Object.keys(CPU_ONLY_HARDWARE) as HardwarePlatform[];

  return Object.values(testModels)
    .flat()
    .flatMap((model) => platforms.map((platform) => buildCompatibilityResult(model, platform, detected)));
}

function summarizeCompatibility(results: CompatibilityResult[]) {
  return results.reduce<Record<CompatibilityStatus, number>>(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    {
      compatible: 0,
      unavailable: 0,
      unsupported: 0,
    },
  );
}

describe("automated hardware compatibility testing", () => {
  it("falls back to CPU while preserving detected accelerators", () => {
    const hardware = resolveHardwareAvailability({
      cuda: true,
      webgpu: true,
    });

    expect(hardware.cpu).toBe(true);
    expect(hardware.cuda).toBe(true);
    expect(hardware.webgpu).toBe(true);
    expect(hardware.webnn).toBe(false);
  });

  it("classifies representative model names into the expected families", () => {
    expect(classifyModelFamily("prajjwal1/bert-tiny")).toBe("embedding");
    expect(classifyModelFamily("gpt2")).toBe("text_generation");
    expect(classifyModelFamily("google/vit-base-patch16-224")).toBe("vision");
    expect(classifyModelFamily("openai/whisper-tiny")).toBe("audio");
    expect(classifyModelFamily("openai/clip-vit-base-patch32")).toBe("multimodal");
  });

  it("marks unavailable hardware before checking model support", () => {
    const result = buildCompatibilityResult("openai/clip-vit-base-patch32", "webnn", {
      webnn: false,
    });

    expect(result).toEqual({
      family: "multimodal",
      model: "openai/clip-vit-base-patch32",
      platform: "webnn",
      status: "unavailable",
      reason: "webnn hardware is not available",
    });
  });

  it("marks available but unsupported family/platform pairs explicitly", () => {
    const result = buildCompatibilityResult("openai/whisper-tiny", "webnn", {
      webnn: true,
    });

    expect(result).toEqual({
      family: "audio",
      model: "openai/whisper-tiny",
      platform: "webnn",
      status: "unsupported",
      reason: "audio models are not supported on webnn",
    });
  });

  it("marks supported pairs as compatible", () => {
    const result = buildCompatibilityResult("facebook/dinov2-small", "webgpu", {
      webgpu: true,
    });

    expect(result).toEqual({
      family: "vision",
      model: "facebook/dinov2-small",
      platform: "webgpu",
      status: "compatible",
    });
  });

  it("builds a deterministic compatibility matrix and summary", () => {
    const matrix = buildCompatibilityMatrix(
      {
        embedding: ["prajjwal1/bert-tiny"],
        text_generation: [],
        vision: [],
        audio: ["openai/whisper-tiny"],
        multimodal: [],
      },
      {
        webnn: true,
        webgpu: true,
      },
    );

    expect(matrix).toHaveLength(16);
    expect(summarizeCompatibility(matrix)).toEqual({
      compatible: 5,
      unavailable: 10,
      unsupported: 1,
    });
  });
});
