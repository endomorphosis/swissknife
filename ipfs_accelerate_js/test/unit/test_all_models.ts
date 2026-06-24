interface ModelFamilyMetadata {
  module: string;
  description: string;
  defaultModel: string;
  testClass: string;
  status: "complete";
}

export const MODEL_FAMILIES: Record<string, ModelFamilyMetadata> = {
  bert: {
    module: "test_hf_bert",
    description: "BERT-family masked language models",
    defaultModel: "bert-base-uncased",
    testClass: "TestBertModels",
    status: "complete",
  },
  gpt2: {
    module: "test_hf_gpt2",
    description: "GPT-2 causal language models",
    defaultModel: "gpt2",
    testClass: "TestGpt2Models",
    status: "complete",
  },
  t5: {
    module: "test_hf_t5",
    description: "T5 encoder-decoder models",
    defaultModel: "t5-small",
    testClass: "TestT5Models",
    status: "complete",
  },
  clip: {
    module: "test_hf_clip",
    description: "CLIP vision-language models",
    defaultModel: "openai/clip-vit-base-patch32",
    testClass: "TestClipModels",
    status: "complete",
  },
  llama: {
    module: "test_hf_llama",
    description: "LLaMA causal language models",
    defaultModel: "meta-llama/Llama-2-7b-hf",
    testClass: "TestLlamaModels",
    status: "complete",
  },
  whisper: {
    module: "test_hf_whisper",
    description: "Whisper speech recognition models",
    defaultModel: "openai/whisper-tiny",
    testClass: "TestWhisperModels",
    status: "complete",
  },
  wav2vec2: {
    module: "test_hf_wav2vec2",
    description: "Wav2Vec2 speech models",
    defaultModel: "facebook/wav2vec2-base",
    testClass: "TestWav2Vec2Models",
    status: "complete",
  },
  vit: {
    module: "test_hf_vit",
    description: "Vision Transformer models",
    defaultModel: "google/vit-base-patch16-224",
    testClass: "TestVitModels",
    status: "complete",
  },
  detr: {
    module: "test_hf_detr",
    description: "Detection Transformer models for object detection",
    defaultModel: "facebook/detr-resnet-50",
    testClass: "TestDetrModels",
    status: "complete",
  },
  layoutlmv2: {
    module: "test_hf_layoutlmv2",
    description: "LayoutLMv2 models for document understanding",
    defaultModel: "microsoft/layoutlmv2-base-uncased",
    testClass: "TestLayoutLMv2Models",
    status: "complete",
  },
  time_series_transformer: {
    module: "test_hf_time_series_transformer",
    description: "Time Series Transformer models for forecasting",
    defaultModel: "huggingface/time-series-transformer-tourism-monthly",
    testClass: "TestTimeSeriesTransformerModels",
    status: "complete",
  },
  llava: {
    module: "test_hf_llava",
    description: "Large Language-and-Vision Assistant models",
    defaultModel: "llava-hf/llava-1.5-7b-hf",
    testClass: "TestLlavaModels",
    status: "complete",
  },
  roberta: {
    module: "test_hf_roberta",
    description: "RoBERTa masked language models",
    defaultModel: "roberta-base",
    testClass: "TestRobertaModels",
    status: "complete",
  },
  phi: {
    module: "test_hf_phi",
    description: "Phi language models from Microsoft",
    defaultModel: "microsoft/phi-2",
    testClass: "TestPhiModels",
    status: "complete",
  },
  distilbert: {
    module: "test_hf_distilbert",
    description: "DistilBERT masked language models",
    defaultModel: "distilbert-base-uncased",
    testClass: "TestDistilBertModels",
    status: "complete",
  },
  visual_bert: {
    module: "test_hf_visual_bert",
    description: "VisualBERT for vision-language tasks",
    defaultModel: "uclanlp/visualbert-vqa-coco-pre",
    testClass: "TestVisualBertModels",
    status: "complete",
  },
  zoedepth: {
    module: "test_hf_zoedepth",
    description: "ZoeDepth monocular depth estimation models",
    defaultModel: "isl-org/ZoeDepth",
    testClass: "TestZoeDepthModels",
    status: "complete",
  },
  mistral: {
    module: "test_hf_mistral",
    description: "Mistral causal language models",
    defaultModel: "mistralai/Mistral-7B-v0.1",
    testClass: "TestMistralModels",
    status: "complete",
  },
  blip: {
    module: "test_hf_blip",
    description: "BLIP vision-language models",
    defaultModel: "Salesforce/blip-image-captioning-base",
    testClass: "TestBlipModels",
    status: "complete",
  },
  sam: {
    module: "test_hf_sam",
    description: "Segment Anything Model for image segmentation",
    defaultModel: "facebook/sam-vit-base",
    testClass: "TestSamModels",
    status: "complete",
  },
  owlvit: {
    module: "test_hf_owlvit",
    description: "Open-vocabulary object detection with Vision Transformers",
    defaultModel: "google/owlvit-base-patch32",
    testClass: "TestOwlvitModels",
    status: "complete",
  },
  gemma: {
    module: "test_hf_gemma",
    description: "Gemma language models from Google",
    defaultModel: "google/gemma-2b",
    testClass: "TestGemmaModels",
    status: "complete",
  },
  musicgen: {
    module: "test_hf_musicgen",
    description: "MusicGen music generation models from AudioCraft",
    defaultModel: "facebook/musicgen-small",
    testClass: "TestMusicgenModels",
    status: "complete",
  },
  hubert: {
    module: "test_hf_hubert",
    description: "HuBERT speech representation models",
    defaultModel: "facebook/hubert-base-ls960",
    testClass: "TestHubertModels",
    status: "complete",
  },
  donut: {
    module: "test_hf_donut",
    description: "Donut document understanding transformer",
    defaultModel: "naver-clova-ix/donut-base-finetuned-docvqa",
    testClass: "TestDonutModels",
    status: "complete",
  },
  layoutlmv3: {
    module: "test_hf_layoutlmv3",
    description: "LayoutLMv3 models for document understanding",
    defaultModel: "microsoft/layoutlmv3-base",
    testClass: "TestLayoutLMv3Models",
    status: "complete",
  },
  markuplm: {
    module: "test_hf_markuplm",
    description: "MarkupLM models for markup language understanding",
    defaultModel: "microsoft/markuplm-base",
    testClass: "TestMarkupLMModels",
    status: "complete",
  },
  mamba: {
    module: "test_hf_mamba",
    description: "Mamba state space models for language modeling",
    defaultModel: "state-spaces/mamba-2.8b",
    testClass: "TestMambaModels",
    status: "complete",
  },
  phi3: {
    module: "test_hf_phi3",
    description: "Phi-3 language models from Microsoft",
    defaultModel: "microsoft/phi-3-mini-4k-instruct",
    testClass: "TestPhi3Models",
    status: "complete",
  },
  paligemma: {
    module: "test_hf_paligemma",
    description: "PaLI-GEMMA vision-language models from Google",
    defaultModel: "google/paligemma-3b-mix-224",
    testClass: "TestPaliGemmaModels",
    status: "complete",
  },
  mixtral: {
    module: "test_hf_mixtral",
    description: "Mixtral mixture-of-experts language models",
    defaultModel: "mistralai/Mixtral-8x7B-v0.1",
    testClass: "TestMixtralModels",
    status: "complete",
  },
  blip2: {
    module: "test_hf_blip_2",
    description: "BLIP-2 vision-language models",
    defaultModel: "Salesforce/blip2-opt-2.7b",
    testClass: "TestBlip2Models",
    status: "complete",
  },
  qwen2: {
    module: "test_hf_qwen2",
    description: "Qwen2 models from Alibaba",
    defaultModel: "Qwen/Qwen2-7B-Instruct",
    testClass: "TestQwen2Models",
    status: "complete",
  },
  segformer: {
    module: "test_hf_segformer",
    description: "SegFormer models for image segmentation",
    defaultModel: "nvidia/segformer-b0-finetuned-ade-512-512",
    testClass: "TestSegformerModels",
    status: "complete",
  },
};

export function getModelFamilyNames(): string[] {
  return Object.keys(MODEL_FAMILIES).sort();
}

export function getModelFamilyMetadata(family: string): ModelFamilyMetadata | undefined {
  return MODEL_FAMILIES[family];
}

describe("MODEL_FAMILIES", () => {
  it("keeps the central registry populated with converted model families", () => {
    expect(getModelFamilyNames()).toEqual(expect.arrayContaining(["bert", "gpt2", "t5", "clip"]));
    expect(getModelFamilyNames().length).toBeGreaterThan(30);
  });

  it("uses valid module and class names for every family", () => {
    for (const [family, metadata] of Object.entries(MODEL_FAMILIES)) {
      expect(metadata.module).toMatch(/^test_hf_[a-z0-9_]+$/);
      expect(metadata.description.trim()).toBe(metadata.description);
      expect(metadata.defaultModel).toEqual(expect.any(String));
      expect(metadata.defaultModel.length).toBeGreaterThan(0);
      expect(metadata.testClass).toMatch(/^Test[A-Za-z0-9]+Models$/);
      expect(metadata.status).toBe("complete");
      expect(family.length).toBeGreaterThan(0);
    }
  });

  it("looks up metadata without importing generated sibling tests", () => {
    expect(getModelFamilyMetadata("bert")).toMatchObject({
      module: "test_hf_bert",
      defaultModel: "bert-base-uncased",
      testClass: "TestBertModels",
    });
    expect(getModelFamilyMetadata("missing-family")).toBeUndefined();
  });
});
