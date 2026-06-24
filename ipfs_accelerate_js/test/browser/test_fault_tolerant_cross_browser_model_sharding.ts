import { describe, expect, it } from "@jest/globals";

import CrossBrowserModelSharding, {
  createCrossBrowserModelSharding,
} from "../../src/browser/resource_pool/cross_browser_model_sharding";

type ShardingStrategy = "layer" | "attention_feedforward" | "component";
type FaultToleranceLevel = "none" | "low" | "medium" | "high" | "critical";
type RecoveryStrategy = "simple" | "progressive" | "parallel" | "coordinated";
type ModelType = "text" | "vision" | "audio" | "multimodal";

interface FaultTolerantShardingScenario {
  modelName: string;
  modelType: ModelType;
  shards: number;
  shardType: ShardingStrategy;
  faultTolerance: {
    enabled: boolean;
    level: FaultToleranceLevel;
    recoveryStrategy: RecoveryStrategy;
    checkpointIntervalMs: number;
    maxRecoveryAttempts: number;
    browserHealthCheckIntervalMs: number;
  };
  browserPreferences: Record<string, "chrome" | "edge" | "firefox">;
}

const scenarios: FaultTolerantShardingScenario[] = [
  {
    modelName: "bert-base-uncased",
    modelType: "text",
    shards: 3,
    shardType: "layer",
    faultTolerance: {
      enabled: true,
      level: "high",
      recoveryStrategy: "progressive",
      checkpointIntervalMs: 1_000,
      maxRecoveryAttempts: 3,
      browserHealthCheckIntervalMs: 500,
    },
    browserPreferences: { text_embedding: "edge" },
  },
  {
    modelName: "whisper-tiny",
    modelType: "audio",
    shards: 2,
    shardType: "component",
    faultTolerance: {
      enabled: true,
      level: "critical",
      recoveryStrategy: "parallel",
      checkpointIntervalMs: 1_000,
      maxRecoveryAttempts: 5,
      browserHealthCheckIntervalMs: 500,
    },
    browserPreferences: { audio: "firefox" },
  },
  {
    modelName: "vit-base-patch16-224",
    modelType: "vision",
    shards: 3,
    shardType: "layer",
    faultTolerance: {
      enabled: true,
      level: "medium",
      recoveryStrategy: "coordinated",
      checkpointIntervalMs: 1_000,
      maxRecoveryAttempts: 3,
      browserHealthCheckIntervalMs: 500,
    },
    browserPreferences: { vision: "chrome" },
  },
];

function createModelInput(modelType: ModelType) {
  switch (modelType) {
    case "text":
      return {
        inputIds: [101, 2023, 2003, 1037, 3231, 102],
        attentionMask: [1, 1, 1, 1, 1, 1],
      };
    case "vision":
      return { pixelValues: [[[0.5, 0.5, 0.5]]] };
    case "audio":
      return { inputFeatures: [[[0.1, 0.1, 0.1]]] };
    case "multimodal":
      return {
        inputIds: [101, 2023, 2003, 1037, 3231, 102],
        attentionMask: [1, 1, 1, 1, 1, 1],
        pixelValues: [[[0.5, 0.5, 0.5]]],
      };
  }
}

describe("fault-tolerant cross-browser model sharding", () => {
  it("creates a manager for each fault-tolerant sharding scenario", () => {
    for (const scenario of scenarios) {
      const manager = createCrossBrowserModelSharding({
        modelName: scenario.modelName,
        shards: scenario.shards,
        shardType: scenario.shardType,
        browserPreferences: scenario.browserPreferences,
        faultTolerance: scenario.faultTolerance,
      });

      expect(manager).toBeInstanceOf(CrossBrowserModelSharding);
    }
  });

  it("initializes, executes, and disposes with fault-tolerance options", async () => {
    for (const scenario of scenarios) {
      const manager = new CrossBrowserModelSharding({
        modelName: scenario.modelName,
        shards: scenario.shards,
        shardType: scenario.shardType,
        browserPreferences: scenario.browserPreferences,
        faultTolerance: scenario.faultTolerance,
      });

      await expect(manager.initialize()).resolves.toBeUndefined();
      await expect(manager.execute(createModelInput(scenario.modelType))).resolves.toEqual({
        success: true,
      });
      expect(() => manager.dispose()).not.toThrow();
    }
  });
});
