type HardwarePlatform = 'cpu' | 'cuda' | 'openvino' | 'apple' | 'qualcomm';

interface EmbedModelConfig {
  architectures: string[];
  hidden_size: number;
  intermediate_size: number;
  max_position_embeddings: number;
  model_type: string;
  num_attention_heads: number;
  num_hidden_layers: number;
  vocab_size: number;
}

interface DefaultEmbedFixture {
  config: EmbedModelConfig;
  files: string[];
  modelRoot: string;
  pooling: {
    pooling_mode_cls_token: boolean;
    pooling_mode_mean_tokens: boolean;
    word_embedding_dimension: number;
  };
  sentenceTransformersModules: Array<{ path: string; type: string }>;
  tokenizer: {
    do_lower_case: boolean;
    model_max_length: number;
    tokenizer_class: string;
  };
}

interface PlatformResult {
  embeddingShape: [number, number];
  implementationType: 'MOCK';
  modelName: string;
  platform: HardwarePlatform;
  status: 'success';
}

const DEFAULT_EMBED_MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_EMBED_DIMENSION = 384;
const TEST_TEXTS = [
  'The quick brown fox jumps over the lazy dog',
  'A fast auburn canine leaps above the sleepy hound',
];

function createDefaultEmbedFixture(modelRoot = '/tmp/embed_test_model'): DefaultEmbedFixture {
  const config: EmbedModelConfig = {
    architectures: ['BertModel'],
    hidden_size: DEFAULT_EMBED_DIMENSION,
    intermediate_size: DEFAULT_EMBED_DIMENSION * 4,
    max_position_embeddings: 512,
    model_type: 'bert',
    num_attention_heads: 12,
    num_hidden_layers: 6,
    vocab_size: 30522,
  };

  return {
    config,
    files: [
      'config.json',
      'tokenizer_config.json',
      'vocab.txt',
      'pytorch_model.bin',
      '1_Pooling/config.json',
      'modules.json',
      'sentence_transformers_config.json',
      'README.md',
    ],
    modelRoot,
    pooling: {
      pooling_mode_cls_token: false,
      pooling_mode_mean_tokens: true,
      word_embedding_dimension: config.hidden_size,
    },
    sentenceTransformersModules: [
      { path: '.', type: 'sentence_transformers.models.Transformer' },
      { path: '1_Pooling', type: 'sentence_transformers.models.Pooling' },
    ],
    tokenizer: {
      do_lower_case: true,
      model_max_length: config.max_position_embeddings,
      tokenizer_class: 'BertTokenizer',
    },
  };
}

function createDeterministicEmbedding(text: string, dimension = DEFAULT_EMBED_DIMENSION): number[] {
  let seed = 0;

  for (const char of text) {
    seed = (seed * 31 + char.charCodeAt(0)) % 9973;
  }

  return Array.from({ length: dimension }, (_, index) => {
    const value = ((seed + index * 17) % 2000) / 1000 - 1;
    return Number(value.toFixed(3));
  });
}

function embedText(input: string | string[]): number[] | number[][] {
  if (Array.isArray(input)) {
    return input.map((text) => createDeterministicEmbedding(text));
  }

  return createDeterministicEmbedding(input);
}

function summarizePlatformResult(
  platform: HardwarePlatform,
  embedding: number[] | number[][],
): PlatformResult {
  const isBatch = Array.isArray(embedding[0]);
  const batchSize = isBatch ? (embedding as number[][]).length : 1;
  const dimension = isBatch ? (embedding as number[][])[0].length : (embedding as number[]).length;

  return {
    embeddingShape: [batchSize, dimension],
    implementationType: 'MOCK',
    modelName: DEFAULT_EMBED_MODEL_NAME,
    platform,
    status: 'success',
  };
}

describe('default embedding test fixture', () => {
  it('describes a local MiniLM-style model without requiring remote downloads', () => {
    const fixture = createDefaultEmbedFixture();

    expect(fixture.modelRoot).toBe('/tmp/embed_test_model');
    expect(fixture.config).toMatchObject({
      architectures: ['BertModel'],
      hidden_size: 384,
      intermediate_size: 1536,
      model_type: 'bert',
      num_attention_heads: 12,
      num_hidden_layers: 6,
    });
    expect(fixture.tokenizer).toEqual({
      do_lower_case: true,
      model_max_length: 512,
      tokenizer_class: 'BertTokenizer',
    });
    expect(fixture.pooling).toEqual({
      pooling_mode_cls_token: false,
      pooling_mode_mean_tokens: true,
      word_embedding_dimension: 384,
    });
    expect(fixture.sentenceTransformersModules).toEqual([
      { path: '.', type: 'sentence_transformers.models.Transformer' },
      { path: '1_Pooling', type: 'sentence_transformers.models.Pooling' },
    ]);
    expect(fixture.files).toEqual(
      expect.arrayContaining([
        'config.json',
        'tokenizer_config.json',
        'vocab.txt',
        'pytorch_model.bin',
        '1_Pooling/config.json',
        'modules.json',
        'sentence_transformers_config.json',
      ]),
    );
  });

  it('returns stable 384-dimensional embeddings for single and batched text', () => {
    const singleEmbedding = embedText(TEST_TEXTS[0]) as number[];
    const batchEmbedding = embedText(TEST_TEXTS) as number[][];

    expect(singleEmbedding).toHaveLength(DEFAULT_EMBED_DIMENSION);
    expect(batchEmbedding).toHaveLength(TEST_TEXTS.length);
    expect(batchEmbedding[0]).toHaveLength(DEFAULT_EMBED_DIMENSION);
    expect(batchEmbedding[0]).toEqual(singleEmbedding);
    expect(batchEmbedding[1]).not.toEqual(singleEmbedding);
    expect(singleEmbedding.every((value) => value >= -1 && value < 1)).toBe(true);
  });

  it.each<HardwarePlatform>(['cpu', 'cuda', 'openvino', 'apple', 'qualcomm'])(
    'reports a successful mock embedding contract for %s',
    (platform) => {
      const result = summarizePlatformResult(platform, embedText(TEST_TEXTS));

      expect(result).toEqual({
        embeddingShape: [2, DEFAULT_EMBED_DIMENSION],
        implementationType: 'MOCK',
        modelName: DEFAULT_EMBED_MODEL_NAME,
        platform,
        status: 'success',
      });
    },
  );
});

export {};
