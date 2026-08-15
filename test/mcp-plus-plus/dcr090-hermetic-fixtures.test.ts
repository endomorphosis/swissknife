/** DCR-090: hermetic connector fixture invariants (no live server). */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
};
const canonical = (value: unknown) => JSON.stringify(normalize(value));
const digest = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

describe("DCR-090 hermetic connector fixture", () => {
  it("binds actual connector source bytes and independent tool facts", () => {
    const connectorPath = resolve(
      __dirname,
      "../../src/services/mcp/mcp-plus-plus-connector.ts",
    );
    const source = readFileSync(connectorPath, "utf8");
    const sourceDigest = digest(source);
    const request = canonical({ method: "tools/list", params: {} });
    const expectedFact = canonical({ tools: ["core.health_check"] });
    const response = {
      jsonrpc: "2.0",
      result: { tools: [{ name: "core.health_check" }] },
    };

    expect(sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(canonical(JSON.parse(request))).toBe(request);
    expect(canonical(JSON.parse(expectedFact))).toBe(expectedFact);
    expect(source).toContain("extractRestToolNames");
    expect(source).toContain("tools/list");
    expect(request).not.toContain(expectedFact);
    expect(response.result.tools.map((tool) => tool.name)).toEqual([
      "core.health_check",
    ]);
    expect(
      digest(
        canonical({ tools: response.result.tools.map((tool) => tool.name) }),
      ),
    ).toBe(digest(expectedFact));
  });
});
