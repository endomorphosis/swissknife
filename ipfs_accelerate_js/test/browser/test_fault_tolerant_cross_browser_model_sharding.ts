import { describe, expect, it } from "@jest/globals";

import CrossBrowserModelSharding, {
  createCrossBrowserModelSharding,
} from "../../src/browser/resource_pool/cross_browser_model_sharding";

describe("fault-tolerant cross-browser model sharding", () => {
  it("creates a sharding manager with fault tolerance options", () => {
    const manager = createCrossBrowserModelSharding({
      modelName: "bert-base-uncased",
      modelType: "text",
      shards: 3,
      shardType: "layer",
      faultTolerance: {
        enabled: true,
        level: "high",
        recoveryStrategy: "progressive",
        maxRetries: 3,
      },
      browsers: ["chrome", "firefox", "edge"],
    });

    expect(manager).toBeInstanceOf(CrossBrowserModelSharding);
  });

  it("initializes, executes, and disposes when fault tolerance is enabled", async () => {
    const manager = new CrossBrowserModelSharding({
      modelName: "vit-base-patch16-224",
      modelType: "vision",
      shards: 3,
      shardType: "component",
      faultTolerance: {
        enabled: true,
        level: "medium",
        recoveryStrategy: "coordinated",
      },
    });

    await expect(manager.initialize()).resolves.toBeUndefined();
    await expect(
      manager.execute({
        pixelValues: [0.1, 0.2, 0.3],
      }),
    ).resolves.toEqual({ success: true });
    expect(() => manager.dispose()).not.toThrow();
  });
});
