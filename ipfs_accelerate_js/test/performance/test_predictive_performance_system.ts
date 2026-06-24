interface PredictionResult {
  throughput: number;
  latency: number;
  memory: number;
  confidence: number;
}

interface HardwareRecommendation extends PredictionResult {
  hardware: string;
  score: number;
}

interface ActiveLearningConfiguration {
  model_name: string;
  model_type: string;
  hardware: string;
  batch_size: number;
  expected_information_gain: number;
}

const requiredPredictionFields: Array<keyof PredictionResult> = [
  "throughput",
  "latency",
  "memory",
  "confidence",
];

function missingFields<T extends object>(
  value: T,
  fields: readonly string[],
): string[] {
  return fields.filter((field) => !(field in value));
}

function isValidPrediction(prediction: PredictionResult): boolean {
  return (
    missingFields(prediction, requiredPredictionFields).length === 0 &&
    prediction.throughput > 0 &&
    prediction.latency > 0 &&
    prediction.memory > 0 &&
    prediction.confidence >= 0 &&
    prediction.confidence <= 1
  );
}

function metricAccuracy(predicted: number, actual: number): number {
  if (predicted <= 0 || actual <= 0) {
    return 0;
  }

  return Math.min(predicted, actual) / Math.max(predicted, actual);
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function areInformationGainsDescending(
  configurations: ActiveLearningConfiguration[],
): boolean {
  return configurations.every((configuration, index) => {
    if (index === 0) {
      return true;
    }

    return (
      configurations[index - 1].expected_information_gain >=
      configuration.expected_information_gain
    );
  });
}

describe("predictive performance system contracts", () => {
  it("validates prediction results returned by the predictor", () => {
    const predictions: PredictionResult[] = [
      { throughput: 6100, latency: 4.1, memory: 3020, confidence: 0.91 },
      { throughput: 22, latency: 96, memory: 2925, confidence: 0.78 },
      { throughput: 185, latency: 32, memory: 1536, confidence: 0.83 },
    ];

    expect(predictions.every(isValidPrediction)).toBe(true);
  });

  it("checks simulated benchmark accuracy with the expected tolerance", () => {
    const benchmarkPairs = [
      {
        prediction: { throughput: 6100, latency: 4.1, memory: 3020 },
        actual: { throughput: 6000, latency: 4.0, memory: 3000 },
      },
      {
        prediction: { throughput: 22, latency: 96, memory: 2925 },
        actual: { throughput: 20, latency: 100, memory: 3000 },
      },
    ];

    const accuracies = benchmarkPairs.flatMap(({ prediction, actual }) => [
      metricAccuracy(prediction.throughput, actual.throughput),
      metricAccuracy(prediction.latency, actual.latency),
      metricAccuracy(prediction.memory, actual.memory),
    ]);

    expect(average(accuracies)).toBeGreaterThanOrEqual(0.7);
  });

  it("validates hardware recommendation shape", () => {
    const recommendation: HardwareRecommendation = {
      hardware: "webgpu",
      score: 0.88,
      throughput: 185,
      latency: 32,
      memory: 1536,
      confidence: 0.83,
    };

    expect(
      missingFields(recommendation, [
        "hardware",
        "score",
        ...requiredPredictionFields,
      ]),
    ).toEqual([]);
    expect(recommendation.score).toBeGreaterThanOrEqual(0);
    expect(recommendation.score).toBeLessThanOrEqual(1);
  });

  it("validates active learning recommendations are ranked", () => {
    const configurations: ActiveLearningConfiguration[] = [
      {
        model_name: "bert-base-uncased",
        model_type: "text_embedding",
        hardware: "cuda",
        batch_size: 8,
        expected_information_gain: 0.82,
      },
      {
        model_name: "t5-small",
        model_type: "text_generation",
        hardware: "cpu",
        batch_size: 1,
        expected_information_gain: 0.43,
      },
      {
        model_name: "whisper-tiny",
        model_type: "audio",
        hardware: "webgpu",
        batch_size: 4,
        expected_information_gain: 0.31,
      },
    ];

    expect(
      configurations.every((configuration) => {
        return (
          missingFields(configuration, [
            "model_name",
            "model_type",
            "hardware",
            "batch_size",
            "expected_information_gain",
          ]).length === 0
        );
      }),
    ).toBe(true);
    expect(areInformationGainsDescending(configurations)).toBe(true);
  });
});
