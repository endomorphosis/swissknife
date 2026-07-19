/** @vitest-environment node */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EventDAG,
  verifyEventDAGInclusionProof,
} from "../../src/services/mcp/mcp-event-dag";
import {
  ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
  MCPPLUSPLUS_PROFILE_EVIDENCE,
  buildAllAppMCPPlusPlusProfileInteroperabilityReport,
  type ApplicationGatewayEvidence,
  type ProfileFCompactionEvidence,
} from "../../src/services/mcp/all-app-mcpplusplus-profile-interoperability";

const ROOT = join(
  process.cwd(),
  "test-results",
  "virtual-desktop-ipfs-mcp-orb",
);
const APPLICATION_PATH = join(ROOT, "all-app-live-gateway-executions.json");
const REPORT_PATH = join(
  ROOT,
  "all-app-mcpplusplus-profile-interoperability.json",
);

function compaction(
  application: ApplicationGatewayEvidence,
): ProfileFCompactionEvidence[] {
  const source = (application.executions ?? [])
    .filter(
      (execution) =>
        execution.response.ok && execution.persistence?.status === "persisted",
    );
  if (source.length === 0)
    throw new Error(
      "Profile F application replay compaction requires persisted desktop executions.",
    );
  // Commit every persisted desktop transport observation to one bounded
  // archive.  A certificate is therefore linked to each exact receipt/event
  // pair, rather than proving a small unrelated sample and reusing it for the
  // rest of the application replay.
  const dag = new EventDAG({ autoCompact: false });
  let parent: string | undefined;
  const eventCids = source.map((execution, index) => {
    const sourceEventCid =
      execution.persistence?.event_cid ?? execution.event_dag_refs[0];
    const sourceReceiptCid =
      execution.persistence?.receipt_cid ?? execution.receipt_refs[0];
    if (!sourceEventCid || !sourceReceiptCid)
      throw new Error("Missing persisted application event or receipt.");
    const provenanceEventCid = dag.appendEvent({
      // These are the persisted artifacts produced by the visible desktop
      // controls. The local DAG only compacts their retained provenance;
      // source_event_cid and source_receipt_cid remain the native artifacts.
      intent_cid: sourceReceiptCid,
      interface_cid:
        execution.transport_observation?.descriptor_cid ??
        (() => {
          throw new Error("Missing application descriptor.");
        })(),
      proofs: [
        execution.transport_observation?.identity_proof_cid ??
          (() => {
            throw new Error("Missing application identity proof.");
          })(),
      ],
      outputs: [sourceEventCid],
      parents: parent ? [parent] : [],
      timestamp: new Date(
        Date.parse("2026-07-18T00:00:00.000Z") + index * 1000,
      ).toISOString(),
      correlation_id: execution.correlation_id,
      operation: execution.selected_tool_id ?? "application-replay",
    });
    return { execution, sourceEventCid, sourceReceiptCid, provenanceEventCid };
  });
  const archive = dag.compact({ maxEvents: eventCids.length, retainRecent: 0 });
  if (!archive)
    throw new Error(
      "Profile F application replay compaction prerequisites are absent.",
    );
  return eventCids.map(
    ({ execution, sourceEventCid, sourceReceiptCid, provenanceEventCid }) => {
      const witness = dag.getInclusionProof(provenanceEventCid);
      if (!witness)
        throw new Error("Profile F compaction omitted an application event.");
      return {
        source_event_cid: sourceEventCid,
        source_receipt_cid: sourceReceiptCid,
        source_correlation_id: execution.correlation_id,
        provenance_event_cid: provenanceEventCid,
        archive_cid: archive.archive_cid,
        certificate_cid: archive.certificate.certificate_cid,
        merkle_root: archive.certificate.merkle_root,
        event_count: archive.certificate.event_count,
        certificate_verified: dag.verifyCertificate(
          archive.certificate.certificate_cid,
        ),
        inclusion_verified: verifyEventDAGInclusionProof(
          provenanceEventCid,
          witness.proof,
          witness.merkle_root,
        ),
        bounded_history_compacted:
          dag.traverseBounded(provenanceEventCid).events.length === 0,
      };
    },
  );
}
function report() {
  const application = JSON.parse(
    readFileSync(APPLICATION_PATH, "utf8"),
  ) as ApplicationGatewayEvidence;
  return buildAllAppMCPPlusPlusProfileInteroperabilityReport({
    generatedAt: new Date().toISOString(),
    applicationEvidence: application,
    compactionEvidence: compaction(application),
  });
}

describe("SVD-127 application-originated MCP++ Profile A-H replay", () => {
  beforeAll(() => {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report(), null, 2)}\n`);
  });
  it("accepts only visible canonical desktop HTTP and libp2p executions", () => {
    const application = JSON.parse(
      readFileSync(APPLICATION_PATH, "utf8"),
    ) as ApplicationGatewayEvidence;
    const value = report();
    expect(value).toMatchObject({
      schema: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
      task_id: "SVD-127",
      decision: "GO",
      live_network_claimed: true,
    });
    expect(value.desktop_paths.length).toBeGreaterThan(0);
    expect(value.application_evidence).toMatchObject({
      schema: "swissknife.all-app-live-gateway-executions.v2",
      execution_count: (application.executions ?? []).length,
      eligible_transport_pair_count: value.desktop_paths.length * 2,
    });
    for (const path of value.desktop_paths) {
      expect(path.transports.http).toMatchObject({
        application_originated: true,
        transport: "http",
        policy_outcome: "allow",
        persistence_verified: true,
        ucan_did_verified: true,
      });
      expect(path.transports.libp2p).toMatchObject({
        application_originated: true,
        transport: "libp2p",
        policy_outcome: "allow",
        persistence_verified: true,
        ucan_did_verified: true,
      });
      expect(path.transports.parity_verified).toBe(true);
    }
  });
  it("retains transport-specific CID, DID, policy, provenance, compaction, correlation, and recovery evidence", () => {
    for (const path of report().desktop_paths) {
      for (const transport of [path.transports.http, path.transports.libp2p]) {
        expect(transport.descriptor_cid).toMatch(/^b[a-z2-7]{58}$/);
        expect(transport.receipt_cid).toMatch(/^b[a-z2-7]{58}$/);
        expect(transport.event_cid).toMatch(/^b[a-z2-7]{58}$/);
        expect(transport.remote_did).toMatch(/^did:key:/);
        expect(transport.identity_proof_cid).toMatch(/^b[a-z2-7]{58}$/);
        expect(transport.correlation_id).toContain("desktop:");
        expect(transport.recovery.observed).toBe(true);
        expect(transport.recovery.correlation_id_preserved).toBe(true);
      }
      const profiles = path.profiles;
      expect(profiles.map((item) => item.profile)).toEqual(
        MCPPLUSPLUS_PROFILE_EVIDENCE.map(([profile]) => profile),
      );
      expect(
        profiles
          .filter((item) =>
            ["A", "B", "C", "D", "E", "F"].includes(item.profile),
          )
          .every((item) => item.outcome === "executed"),
      ).toBe(true);
      expect(
        profiles.find((item) => item.profile === "F")?.evidence,
      ).toMatchObject({
        http: {
          source_event_cid: path.transports.http.event_cid,
          source_receipt_cid: path.transports.http.receipt_cid,
          source_correlation_id: path.transports.http.correlation_id,
          certificate_verified: true,
          inclusion_verified: true,
          bounded_history_compacted: true,
        },
        libp2p: {
          source_event_cid: path.transports.libp2p.event_cid,
          source_receipt_cid: path.transports.libp2p.receipt_cid,
          source_correlation_id: path.transports.libp2p.correlation_id,
          certificate_verified: true,
          inclusion_verified: true,
          bounded_history_compacted: true,
        },
      });
      expect(
        profiles.find((item) => item.profile === "D")?.evidence,
      ).toMatchObject({
        http_policy: { outcome: "allow" },
        libp2p_policy: { outcome: "allow" },
      });
    }
  });
  it("keeps governed scheduling and settlement explicitly unsupported", () => {
    const value = report();
    expect(
      value.desktop_paths.every(
        (path) =>
          path.profiles.find((item) => item.profile === "G")?.outcome ===
            "unsupported" &&
          path.profiles.find((item) => item.profile === "H")?.outcome ===
            "unsupported",
      ),
    ).toBe(true);
    expect(value.coverage).toMatchObject({
      scheduling_enabled: false,
      payment_enabled: false,
    });
  });
  it("fails closed when an application transport replay is absent", () => {
    const application = JSON.parse(
      readFileSync(APPLICATION_PATH, "utf8"),
    ) as ApplicationGatewayEvidence;
    application.executions = application.executions?.filter(
      (row) => row.selected_transport !== "libp2p",
    );
    expect(() =>
      buildAllAppMCPPlusPlusProfileInteroperabilityReport({
        generatedAt: new Date().toISOString(),
        applicationEvidence: application,
        compactionEvidence: compaction(
          JSON.parse(
            readFileSync(APPLICATION_PATH, "utf8"),
          ) as ApplicationGatewayEvidence,
        ),
      }),
    ).toThrow(/application-originated successful libp2p replay/i);
  });
  it("fails closed when the replay is not tied to its visible desktop control", () => {
    const application = JSON.parse(
      readFileSync(APPLICATION_PATH, "utf8"),
    ) as ApplicationGatewayEvidence;
    const eligibleBindingId = report().desktop_paths[0]?.binding_id;
    const execution = application.executions?.find(
      (row) =>
        row.binding_id === eligibleBindingId && row.selected_transport === "http",
    );
    if (!execution) throw new Error("Expected canonical HTTP desktop replay.");
    execution.ui_control_id = "fixture-control";
    expect(() =>
      buildAllAppMCPPlusPlusProfileInteroperabilityReport({
        generatedAt: new Date().toISOString(),
        applicationEvidence: application,
        compactionEvidence: compaction(
          JSON.parse(
            readFileSync(APPLICATION_PATH, "utf8"),
          ) as ApplicationGatewayEvidence,
        ),
      }),
    ).toThrow(/visible application-originated successful http replay/i);
  });
  it("fails closed when duplicate transport observations are offered", () => {
    const application = JSON.parse(
      readFileSync(APPLICATION_PATH, "utf8"),
    ) as ApplicationGatewayEvidence;
    const eligibleBindingId = report().desktop_paths[0]?.binding_id;
    const execution = application.executions?.find(
      (row) =>
        row.binding_id === eligibleBindingId && row.selected_transport === "http",
    );
    if (!execution) throw new Error("Expected canonical HTTP desktop replay.");
    application.executions = [...(application.executions ?? []), execution];
    expect(() =>
      buildAllAppMCPPlusPlusProfileInteroperabilityReport({
        generatedAt: new Date().toISOString(),
        applicationEvidence: application,
        compactionEvidence: compaction(
          JSON.parse(
            readFileSync(APPLICATION_PATH, "utf8"),
          ) as ApplicationGatewayEvidence,
        ),
      }),
    ).toThrow(/exactly one visible application-originated successful http replay/i);
  });
  it("fails closed when a compaction certificate is not bound to its transport receipt", () => {
    const application = JSON.parse(
      readFileSync(APPLICATION_PATH, "utf8"),
    ) as ApplicationGatewayEvidence;
    const evidence = compaction(application);
    const corrupt = evidence.map((entry) => ({
      ...entry,
      source_receipt_cid: entry.source_event_cid,
    }));
    expect(() =>
      buildAllAppMCPPlusPlusProfileInteroperabilityReport({
        generatedAt: new Date().toISOString(),
        applicationEvidence: application,
        compactionEvidence: corrupt,
      }),
    ).toThrow(/Profile F compaction certificate for both transports/i);
  });
  it("fails closed when a verified compaction record omits its certificate reference", () => {
    const application = JSON.parse(
      readFileSync(APPLICATION_PATH, "utf8"),
    ) as ApplicationGatewayEvidence;
    const corrupt = compaction(application).map((entry) => ({
      ...entry,
      certificate_cid: "",
    }));
    expect(() =>
      buildAllAppMCPPlusPlusProfileInteroperabilityReport({
        generatedAt: new Date().toISOString(),
        applicationEvidence: application,
        compactionEvidence: corrupt,
      }),
    ).toThrow(/Profile F compaction certificate for both transports/i);
  });
});
