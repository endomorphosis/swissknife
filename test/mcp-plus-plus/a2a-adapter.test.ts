/**
 * MCPP-057: SwissKnifeA2AAdapter@1 — Agent Card extension + two-agent handoff.
 *
 * Handoff command (from SwissKnife checkout root):
 *   npm run test:run -- test/mcp-plus-plus/a2a-adapter.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  A2AExtensionError,
  EXTENSION_URI,
  ERR_MALFORMED_EXTENSION_URI,
  ERR_NOT_ACTIVATED,
  ERR_PROFILE_NOT_SUBSET,
  ERR_UNSUPPORTED_PROFILE,
  INTERFACE,
  METADATA_KEY_PREFIX,
  SCHEMA_TERMINAL_EVIDENCE,
  SwissKnifeA2AAdapter,
  TASK_ID,
  TaskState,
  WORKING_ALIAS,
  classifyExtensionUri,
  createSwissKnifeA2AAdapter,
  validateActivation,
  validateAgentExtension,
  validateTerminalEvidence,
} from "../../src/services/mcp/mcp-plus-plus-a2a.js";

describe("SwissKnifeA2AAdapter@1 interface", () => {
  it("pins interface constants and confirmed wire URI", () => {
    const adapter = createSwissKnifeA2AAdapter();
    expect(adapter.interface).toBe(INTERFACE);
    expect(adapter.interface).toBe("SwissKnifeA2AAdapter@1");
    expect(adapter.extensionUri).toBe(EXTENSION_URI);
    expect(adapter.extensionUri).toBe(
      "https://mcplusplus.io/extensions/execution/v1",
    );
    expect(adapter.workingAlias).toBe(WORKING_ALIAS);
    expect(adapter.workingAlias).toBe("io.mcplusplus.execution@1");
    expect(adapter.taskId).toBe(TASK_ID);
    expect(adapter.taskId).toBe("MCPP-057");
    expect(WORKING_ALIAS).not.toBe(EXTENSION_URI);
  });

  it("creates independent agents with distinct Event DAGs", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const client = adapter.createAgent({
      agentId: "client-a",
      name: "Client A",
    });
    const server = adapter.createAgent({
      agentId: "server-b",
      name: "Server B",
    });
    expect(client).not.toBe(server);
    expect(client.agentId).not.toBe(server.agentId);
    expect(client.eventDag).not.toBe(server.eventDag);
    expect(client.did).not.toBe(server.did);
  });

  it("presents the execution extension on the Agent Card equivalent", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const server = adapter.createAgent({ agentId: "server-card" });
    const card = server.agentCard();
    const extensions = (card.capabilities as { extensions: unknown[] })
      .extensions;
    expect(extensions).toHaveLength(1);
    expect((extensions[0] as { uri: string }).uri).toBe(EXTENSION_URI);
    const result = validateAgentExtension(extensions[0]);
    expect(result.ok).toBe(true);
    expect((extensions[0] as { params: { alias: string } }).params.alias).toBe(
      WORKING_ALIAS,
    );
    expect(
      (card.metadata as Record<string, unknown>)[
        `${METADATA_KEY_PREFIX}runtime`
      ],
    ).toBe("swissknife");
  });
});

describe("two-agent handoff", () => {
  it("completes an evidence-bearing handoff between independent agents", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const client = adapter.createAgent({
      agentId: "client-a",
      name: "Client Agent A",
    });
    const server = adapter.createAgent({
      agentId: "server-b",
      name: "Server Agent B",
    });

    const receipt = adapter.handoff(client, server, {
      text: "please run repo.status on the workspace",
      method: "repo.status",
      requestedProfiles: ["A", "B"],
    });

    expect(receipt.interface).toBe(INTERFACE);
    expect(receipt.extension_uri).toBe(EXTENSION_URI);
    expect(receipt.client_agent_id).toBe(client.agentId);
    expect(receipt.server_agent_id).toBe(server.agentId);
    expect(receipt.client_did).not.toBe(receipt.server_did);
    expect(receipt.runtime).toBe("swissknife");

    const task = receipt.task as {
      id: string;
      status: { state: string };
      extension_uri: string;
      metadata: Record<string, unknown>;
      artifacts: Array<{ metadata: Record<string, unknown> }>;
    };
    expect(task.id).toBeTruthy();
    expect(task.status.state).toBe(TaskState.COMPLETED);
    expect(task.extension_uri).toBe(EXTENSION_URI);

    expect(task.metadata[`${METADATA_KEY_PREFIX}receipt_cid`]).toBeTruthy();
    expect(task.metadata[`${METADATA_KEY_PREFIX}event_cid`]).toBeTruthy();
    expect(task.metadata[`${METADATA_KEY_PREFIX}envelope_cid`]).toBeTruthy();
    expect(task.metadata[`${METADATA_KEY_PREFIX}output_cid`]).toBeTruthy();

    const evidence = receipt.terminal_evidence as Record<string, unknown>;
    expect(evidence.schema).toBe(SCHEMA_TERMINAL_EVIDENCE);
    expect(evidence.task_state).toBe(TaskState.COMPLETED);
    expect(evidence.portable).toBe(true);
    expect(evidence.receipt_cid).toBeTruthy();
    expect(evidence.event_cid).toBeTruthy();
    expect(evidence.envelope_cid).toBeTruthy();
    expect(validateTerminalEvidence(evidence).ok).toBe(true);

    const lineage = receipt.event_lineage as string[];
    expect(lineage.length).toBeGreaterThanOrEqual(2);
    expect(server.eventDag.hasEvent(String(evidence.event_cid))).toBe(true);
    expect(client.eventDag.stats().event_count).toBe(0);

    expect(task.artifacts.length).toBeGreaterThan(0);
    expect(
      task.artifacts[0].metadata[`${METADATA_KEY_PREFIX}output_cid`],
    ).toBeTruthy();
  });

  it("accepts A2A-Extensions as a header string", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const client = adapter.createAgent({ agentId: "client-hdr" });
    const server = adapter.createAgent({ agentId: "server-hdr" });
    const receipt = adapter.handoff(client, server, {
      a2aExtensions: EXTENSION_URI,
    });
    const task = receipt.task as { status: { state: string } };
    expect(task.status.state).toBe(TaskState.COMPLETED);
    expect(receipt.activated_extensions).toContain(EXTENSION_URI);
  });

  it("rejects missing activation fail-closed", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const client = adapter.createAgent({ agentId: "client-noact" });
    const server = adapter.createAgent({ agentId: "server-noact" });
    expect(() =>
      adapter.handoff(client, server, {
        a2aExtensions: ["https://example.com/extensions/geolocation/v1"],
      }),
    ).toThrow(A2AExtensionError);
    try {
      adapter.handoff(client, server, {
        a2aExtensions: ["https://example.com/extensions/geolocation/v1"],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(A2AExtensionError);
      expect((error as A2AExtensionError).code).toBe(ERR_NOT_ACTIVATED);
    }
  });

  it("rejects reverse-DNS alias as wire URI", () => {
    const classified = classifyExtensionUri(WORKING_ALIAS);
    expect(classified.ok).toBe(false);
    expect(classified.code).toBe(ERR_MALFORMED_EXTENSION_URI);
    const activation = validateActivation([WORKING_ALIAS]);
    expect(activation.ok).toBe(false);
    expect(activation.code).toBe(ERR_MALFORMED_EXTENSION_URI);
  });

  it("rejects unsupported and non-subset profiles", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const client = adapter.createAgent({ agentId: "client-prof" });
    const server = adapter.createAgent({
      agentId: "server-prof",
      profiles: ["A", "B"],
    });
    expect(() =>
      adapter.handoff(client, server, {
        requestedProfiles: ["Z"] as unknown as string[],
      }),
    ).toThrow(A2AExtensionError);
    try {
      adapter.handoff(client, server, {
        requestedProfiles: ["Z"] as unknown as string[],
      });
    } catch (error) {
      expect((error as A2AExtensionError).code).toBe(ERR_UNSUPPORTED_PROFILE);
    }
    try {
      adapter.handoff(client, server, { requestedProfiles: ["A", "C"] });
    } catch (error) {
      expect((error as A2AExtensionError).code).toBe(ERR_PROFILE_NOT_SUBSET);
    }
  });

  it("writes Event DAG cancel records", () => {
    const adapter = new SwissKnifeA2AAdapter();
    const client = adapter.createAgent({ agentId: "client-cancel" });
    const server = adapter.createAgent({ agentId: "server-cancel" });
    const open = adapter.handoff(client, server, {
      holdOpen: true,
      execute: false,
    });
    const taskId = String((open.task as { id: string }).id);
    const canceled = adapter.cancel(server, taskId, { reason: "test-cancel" });
    expect((canceled.task as { status: { state: string } }).status.state).toBe(
      TaskState.CANCELED,
    );
    expect((canceled.cancel_events as unknown[]).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      Object.keys(canceled.durable_cancels as object).length,
    ).toBeGreaterThanOrEqual(1);
    expect((canceled.event_lineage as string[]).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
