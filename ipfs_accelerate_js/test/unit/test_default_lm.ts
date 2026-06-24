type TensorLike = number[][];

interface GenerationOptions {
  maxNewTokens?: number;
  doSample?: boolean;
}

interface DefaultLmFixture {
  modelCandidates: string[];
  testPrompt: string;
  generationConfig: {
    maxNewTokens: number;
    temperature: number;
    topP: number;
    doSample: boolean;
  };
  createLocalTestModel: () => {
    model: SimpleLanguageModel;
    tokenizer: SimpleTokenizer;
    marker: string;
  };
}

class SimpleLanguageModel {
  readonly name = "SimpleLanguageModel";
  readonly isRealSimulation = true;
  readonly config = {
    id: "test-model",
    modelType: "gpt2",
    vocabSize: 50257,
    hiddenSize: 768,
  };

  to(): this {
    return this;
  }

  eval(): this {
    return this;
  }

  generate(_inputIds: TensorLike, options: GenerationOptions = {}): TensorLike {
    const baseTokens = [101, 102, 103, 104, 105];
    const sampledTokens = [106, 107, 108, 109, 110];
    const tokenLimit = options.maxNewTokens ?? baseTokens.length;
    const tokens = options.doSample ? baseTokens.concat(sampledTokens) : baseTokens;

    return [tokens.slice(0, tokenLimit)];
  }

  call(inputIds: TensorLike): { logits: number[][][]; hiddenStates: null; attentions: null } {
    return {
      logits: inputIds.map((tokens) => tokens.map(() => [1])),
      hiddenStates: null,
      attentions: null,
    };
  }
}

class SimpleTokenizer {
  readonly name = "SimpleTokenizer";
  readonly isRealSimulation = true;

  encode(text: string | string[]): { inputIds: TensorLike; attentionMask: TensorLike } {
    const batchSize = Array.isArray(text) ? text.length : 1;
    const inputIds = Array.from({ length: batchSize }, () => Array(10).fill(1));

    return {
      inputIds,
      attentionMask: inputIds.map((tokens) => tokens.map(() => 1)),
    };
  }

  decode(tokenIds: number[]): string {
    if (tokenIds.length > 7) {
      return "Once upon a time in a land far away, there was a magical kingdom...";
    }

    return "Once upon a time...";
  }

  batchDecode(batchTokenIds: TensorLike): string[] {
    return batchTokenIds.map((tokenIds) => this.decode(tokenIds));
  }
}

function createDefaultLmFixture(): DefaultLmFixture {
  return {
    modelCandidates: [
      "gpt2",
      "distilgpt2",
      "facebook/opt-125m",
      "EleutherAI/pythia-70m",
      "EleutherAI/gpt-neo-125m",
      "bigscience/bloom-560m",
    ],
    testPrompt: "Once upon a time",
    generationConfig: {
      maxNewTokens: 20,
      temperature: 0.7,
      topP: 0.9,
      doSample: true,
    },
    createLocalTestModel: () => ({
      model: new SimpleLanguageModel(),
      tokenizer: new SimpleTokenizer(),
      marker: "::simple_model::",
    }),
  };
}

describe("default language model conversion fixture", () => {
  it("keeps the public model candidate order from the Python source", () => {
    const fixture = createDefaultLmFixture();

    expect(fixture.modelCandidates.slice(0, 2)).toEqual(["gpt2", "distilgpt2"]);
    expect(fixture.modelCandidates).toContain("facebook/opt-125m");
    expect(fixture.modelCandidates).toContain("EleutherAI/pythia-70m");
  });

  it("keeps the default prompt and generation settings lightweight", () => {
    const fixture = createDefaultLmFixture();

    expect(fixture.testPrompt).toBe("Once upon a time");
    expect(fixture.generationConfig).toEqual({
      maxNewTokens: 20,
      temperature: 0.7,
      topP: 0.9,
      doSample: true,
    });
  });

  it("creates a deterministic local model simulation without network access", () => {
    const fixture = createDefaultLmFixture();
    const { model, tokenizer, marker } = fixture.createLocalTestModel();
    const encoded = tokenizer.encode(fixture.testPrompt);

    expect(marker).toBe("::simple_model::");
    expect(model.isRealSimulation).toBe(true);
    expect(tokenizer.isRealSimulation).toBe(true);
    expect(model.to().eval()).toBe(model);
    expect(model.generate(encoded.inputIds, { doSample: false })).toEqual([[101, 102, 103, 104, 105]]);
    expect(model.generate(encoded.inputIds, { doSample: true, maxNewTokens: 8 })).toEqual([
      [101, 102, 103, 104, 105, 106, 107, 108],
    ]);
  });

  it("decodes short and extended generated responses", () => {
    const { tokenizer } = createDefaultLmFixture().createLocalTestModel();

    expect(tokenizer.decode([101, 102, 103])).toBe("Once upon a time...");
    expect(tokenizer.batchDecode([[101, 102, 103], [101, 102, 103, 104, 105, 106, 107, 108]])).toEqual([
      "Once upon a time...",
      "Once upon a time in a land far away, there was a magical kingdom...",
    ]);
  });
});
