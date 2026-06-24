import { describe, expect, it } from "@jest/globals";

import CrossBrowserModelSharding, {
  createCrossBrowserModelSharding,
} from "../../src/browser/resource_pool/cross_browser_model_sharding";

describe("CrossBrowserModelSharding", () => {
  it("creates a sharding manager through the factory", () => {
    const manager = createCrossBrowserModelSharding({
      modelName: "bert-base-uncased",
      shards: 3,
      shardType: "layer",
    });

    expect(manager).toBeInstanceOf(CrossBrowserModelSharding);
  });

  it("initializes, executes, and disposes without requiring browser globals", async () => {
    const manager = new CrossBrowserModelSharding({
      modelName: "clip-vit-base-patch32",
      shards: 4,
      shardType: "component",
    });

    await expect(manager.initialize()).resolves.toBeUndefined();
    await expect(
      manager.execute({
        inputIds: [101, 2023, 2003, 1037, 3231, 102],
        attentionMask: [1, 1, 1, 1, 1, 1],
      }),
    ).resolves.toEqual({ success: true });
    expect(() => manager.dispose()).not.toThrow();
  });
});
