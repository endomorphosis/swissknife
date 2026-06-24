type HardwareTarget = "cpu" | "cuda" | "openvino";

interface HandlerOutput {
  output: string;
  implementationType: "MOCK";
}

interface BackslashExample {
  input: string;
  output: {
    type: string;
    implementationType: HandlerOutput["implementationType"];
  };
  platform: "CPU";
  timestamp: string;
}

interface BackslashResults {
  status: Record<string, string>;
  examples: BackslashExample[];
  metadata: {
    modelName: string;
    modelType: string;
    resultFileName: string;
  };
}

class BackslashModelFixture {
  readonly modelName = "hf_\\";
  readonly modelType = "\\";
  readonly task = "feature-extraction";
  readonly testInput = "Test input for \\";

  createHandler(target: HardwareTarget): (input: string) => HandlerOutput {
    const labelByTarget: Record<HardwareTarget, string> = {
      cpu: "CPU",
      cuda: "CUDA",
      openvino: "OpenVINO",
    };

    return (input: string) => ({
      output: `Mock ${labelByTarget[target]} output for ${this.modelName}: ${input}`,
      implementationType: "MOCK",
    });
  }

  runCpuTest(now = new Date("2025-03-11T04:08:52.000Z")): BackslashResults {
    const handler = this.createHandler("cpu");
    const output = handler(this.testInput);

    return {
      status: {
        init: "Success",
        cpuInit: "Success",
        cpuHandler: `Success (${output.implementationType})`,
      },
      examples: [
        {
          input: this.testInput,
          output: {
            type: "object",
            implementationType: output.implementationType,
          },
          timestamp: now.toISOString(),
          platform: "CPU",
        },
      ],
      metadata: {
        modelName: this.modelName,
        modelType: this.modelType,
        resultFileName: this.resultFileName(),
      },
    };
  }

  resultFileName(): string {
    return `${this.modelName.replace(/\\/g, "backslash")}_test_results.json`;
  }
}

describe("hf backslash conversion fixture", () => {
  it("keeps the literal backslash model metadata escaped and parseable", () => {
    const fixture = new BackslashModelFixture();

    expect(fixture.modelName).toBe("hf_\\");
    expect(fixture.modelType).toBe("\\");
    expect(fixture.task).toBe("feature-extraction");
    expect(fixture.testInput).toBe("Test input for \\");
  });

  it("creates deterministic mock handlers for the converted hardware targets", () => {
    const fixture = new BackslashModelFixture();

    expect(fixture.createHandler("cpu")("sample")).toEqual({
      output: "Mock CPU output for hf_\\: sample",
      implementationType: "MOCK",
    });
    expect(fixture.createHandler("cuda")("sample").output).toBe("Mock CUDA output for hf_\\: sample");
    expect(fixture.createHandler("openvino")("sample").output).toBe("Mock OpenVINO output for hf_\\: sample");
  });

  it("records JSON-safe CPU results without writing collected artifacts", () => {
    const fixture = new BackslashModelFixture();
    const results = fixture.runCpuTest();

    expect(results.status).toEqual({
      init: "Success",
      cpuInit: "Success",
      cpuHandler: "Success (MOCK)",
    });
    expect(results.examples).toEqual([
      {
        input: "Test input for \\",
        output: {
          type: "object",
          implementationType: "MOCK",
        },
        timestamp: "2025-03-11T04:08:52.000Z",
        platform: "CPU",
      },
    ]);
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
  });

  it("sanitizes the generated result file name for a backslash-only model type", () => {
    const fixture = new BackslashModelFixture();

    expect(fixture.resultFileName()).toBe("hf_backslash_test_results.json");
    expect(fixture.resultFileName()).not.toContain("\\");
  });
});

export {};
