export {};

type ModelKey =
  | "bert"
  | "t5"
  | "llama"
  | "clip"
  | "vit"
  | "clap"
  | "whisper"
  | "wav2vec2"
  | "llava"
  | "llava_next"
  | "xclip"
  | "qwen"
  | "detr";

type HardwareKey = "cpu" | "cuda" | "rocm" | "mps" | "openvino" | "webnn" | "webgpu";
type CoverageStatus = "real" | "mock" | "incompatible";

interface ModelCoverage {
  name: string;
  models: string[];
  category: string;
}

interface HardwareCoverage {
  name: string;
  compatibility: ReadonlySet<ModelKey>;
  flag: string;
}

interface HardwareStatus {
  status: CoverageStatus;
  hardwareName: string;
}

const KEY_MODELS: Record<ModelKey, ModelCoverage> = {
  bert: { name: "BERT", models: ["bert-base-uncased", "prajjwal1/bert-tiny"], category: "embedding" },
  t5: { name: "T5", models: ["t5-small", "google/t5-efficient-tiny"], category: "text_generation" },
  llama: { name: "LLAMA", models: ["facebook/opt-125m"], category: "text_generation" },
  clip: { name: "CLIP", models: ["openai/clip-vit-base-patch32"], category: "vision_text" },
  vit: { name: "ViT", models: ["google/vit-base-patch16-224"], category: "vision" },
  clap: { name: "CLAP", models: ["laion/clap-htsat-unfused"], category: "audio_text" },
  whisper: { name: "Whisper", models: ["openai/whisper-tiny"], category: "audio" },
  wav2vec2: { name: "Wav2Vec2", models: ["facebook/wav2vec2-base"], category: "audio" },
  llava: { name: "LLaVA", models: ["llava-hf/llava-1.5-7b-hf"], category: "multimodal" },
  llava_next: { name: "LLaVA-Next", models: ["llava-hf/llava-v1.6-34b-hf"], category: "multimodal" },
  xclip: { name: "XCLIP", models: ["microsoft/xclip-base-patch32"], category: "video" },
  qwen: { name: "Qwen2/3", models: ["Qwen/Qwen2-7B-Instruct", "Qwen/Qwen2-VL-Chat"], category: "text_generation" },
  detr: { name: "DETR", models: ["facebook/detr-resnet-50"], category: "vision" },
};

const ALL_MODEL_KEYS = Object.keys(KEY_MODELS) as ModelKey[];
const without = (excluded: ModelKey[]) => new Set(ALL_MODEL_KEYS.filter((model) => !excluded.includes(model)));

const HARDWARE_PLATFORMS: Record<HardwareKey, HardwareCoverage> = {
  cpu: { name: "CPU", compatibility: new Set(ALL_MODEL_KEYS), flag: "--device cpu" },
  cuda: { name: "CUDA", compatibility: new Set(ALL_MODEL_KEYS), flag: "--device cuda" },
  rocm: { name: "AMD ROCm", compatibility: without(["llava", "llava_next"]), flag: "--device rocm" },
  mps: { name: "Apple MPS", compatibility: without(["llava", "llava_next"]), flag: "--device mps" },
  openvino: { name: "OpenVINO", compatibility: without(["llava_next"]), flag: "--device openvino" },
  webnn: { name: "WebNN", compatibility: new Set<ModelKey>(["bert", "t5", "clip", "vit"]), flag: "--web-platform webnn" },
  webgpu: { name: "WebGPU", compatibility: new Set<ModelKey>(["bert", "t5", "clip", "vit"]), flag: "--web-platform webgpu" },
};

const MOCK_IMPLEMENTATIONS = new Set<string>([
  "t5:openvino",
  "clap:openvino",
  "wav2vec2:openvino",
  "llava:openvino",
  "whisper:webnn",
  "whisper:webgpu",
  "qwen:rocm",
  "qwen:mps",
  "qwen:openvino",
]);

const modelHardwareKey = (model: ModelKey, hardware: HardwareKey) => `${model}:${hardware}`;

function getHardwareCompatibilityStatus() {
  return Object.fromEntries(
    ALL_MODEL_KEYS.map((modelKey) => {
      const model = KEY_MODELS[modelKey];
      const hardwareCompatibility = Object.fromEntries(
        (Object.keys(HARDWARE_PLATFORMS) as HardwareKey[]).map((hardwareKey) => {
          const hardware = HARDWARE_PLATFORMS[hardwareKey];
          let status: CoverageStatus = "incompatible";

          if (hardware.compatibility.has(modelKey)) {
            status = MOCK_IMPLEMENTATIONS.has(modelHardwareKey(modelKey, hardwareKey)) ? "mock" : "real";
          }

          return [hardwareKey, { status, hardwareName: hardware.name }];
        }),
      ) as Record<HardwareKey, HardwareStatus>;

      return [
        modelKey,
        {
          ...model,
          hardwareCompatibility,
        },
      ];
    }),
  ) as Record<ModelKey, ModelCoverage & { hardwareCompatibility: Record<HardwareKey, HardwareStatus> }>;
}

function generateTestCommand(modelKey: ModelKey, hardwareKey: HardwareKey): string | null {
  const hardware = HARDWARE_PLATFORMS[hardwareKey];

  if (!hardware.compatibility.has(modelKey)) {
    return null;
  }

  const modelName = KEY_MODELS[modelKey].models[0];
  const webPlatformFlag = hardwareKey === "webnn" || hardwareKey === "webgpu" ? " --web-platform-test" : "";

  return `python test_hf_${modelKey}.py --model ${modelName} ${hardware.flag}${webPlatformFlag}`;
}

function generateImplementationReport(): string {
  const status = getHardwareCompatibilityStatus();
  const summary = Object.values(status).flatMap((model) => Object.values(model.hardwareCompatibility));
  const implemented = summary.filter((entry) => entry.status === "real").length;
  const mocked = summary.filter((entry) => entry.status === "mock").length;
  const incompatible = summary.filter((entry) => entry.status === "incompatible").length;

  return [
    "# Comprehensive Hardware Coverage",
    "",
    "## Summary",
    `- Total combinations: ${summary.length}`,
    `- Implemented combinations: ${implemented}`,
    `- Mock implementations: ${mocked}`,
    `- Incompatible combinations: ${incompatible}`,
    "",
    "## Implementation Plan",
    ...Array.from(MOCK_IMPLEMENTATIONS).map((pair) => {
      const [modelKey, hardwareKey] = pair.split(":") as [ModelKey, HardwareKey];
      return `- Replace ${KEY_MODELS[modelKey].name} mock on ${HARDWARE_PLATFORMS[hardwareKey].name}`;
    }),
  ].join("\n");
}

function runTestsForPhase(phase: number): string[] {
  if (phase === 1) {
    return Array.from(MOCK_IMPLEMENTATIONS)
      .map((pair) => pair.split(":") as [ModelKey, HardwareKey])
      .map(([modelKey, hardwareKey]) => generateTestCommand(modelKey, hardwareKey))
      .filter((command): command is string => command !== null);
  }

  if (phase === 2) {
    return ["llava", "llava_next"].flatMap((modelKey) =>
      ["rocm", "mps"].map((hardwareKey) => generateTestCommand(modelKey as ModelKey, hardwareKey as HardwareKey)),
    ).filter((command): command is string => command !== null);
  }

  if (phase === 3) {
    return ["xclip", "detr", "whisper"].flatMap((modelKey) =>
      ["webnn", "webgpu"].map((hardwareKey) => generateTestCommand(modelKey as ModelKey, hardwareKey as HardwareKey)),
    ).filter((command): command is string => command !== null);
  }

  return [];
}

describe("comprehensive hardware coverage planning", () => {
  it("classifies compatible hardware as real, mock, or incompatible", () => {
    const status = getHardwareCompatibilityStatus();

    expect(status.bert.hardwareCompatibility.cpu.status).toBe("real");
    expect(status.t5.hardwareCompatibility.openvino.status).toBe("mock");
    expect(status.llava_next.hardwareCompatibility.openvino.status).toBe("incompatible");
  });

  it("generates commands only for compatible model and hardware pairs", () => {
    expect(generateTestCommand("bert", "webgpu")).toBe(
      "python test_hf_bert.py --model bert-base-uncased --web-platform webgpu --web-platform-test",
    );
    expect(generateTestCommand("llava_next", "openvino")).toBeNull();
  });

  it("builds phase commands from the compatibility matrix", () => {
    expect(runTestsForPhase(1)).toEqual([
      "python test_hf_t5.py --model t5-small --device openvino",
      "python test_hf_clap.py --model laion/clap-htsat-unfused --device openvino",
      "python test_hf_wav2vec2.py --model facebook/wav2vec2-base --device openvino",
      "python test_hf_llava.py --model llava-hf/llava-1.5-7b-hf --device openvino",
      "python test_hf_qwen.py --model Qwen/Qwen2-7B-Instruct --device rocm",
      "python test_hf_qwen.py --model Qwen/Qwen2-7B-Instruct --device mps",
      "python test_hf_qwen.py --model Qwen/Qwen2-7B-Instruct --device openvino",
    ]);
    expect(runTestsForPhase(2)).toEqual([]);
    expect(runTestsForPhase(3)).toEqual([]);
  });

  it("summarizes the full coverage matrix in the implementation report", () => {
    const report = generateImplementationReport();

    expect(report).toContain("- Total combinations: 91");
    expect(report).toContain("- Implemented combinations: 61");
    expect(report).toContain("- Mock implementations: 7");
    expect(report).toContain("- Incompatible combinations: 23");
    expect(report).toContain("- Replace Qwen2/3 mock on OpenVINO");
  });
});
