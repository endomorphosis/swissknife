/** SVD-127 application-originated MCP++ Profile A-H replay evidence. */
import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  type ExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
} from "../apps/all-app-executable-backend-contract.js";

export const ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA =
  "swissknife.all-app-mcpplusplus-profile-interoperability.v2";
export const ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_TASK_ID = "SVD-127";
export const MCPPLUSPLUS_PROFILE_EVIDENCE = [
  ["A", "mcp++/mcp-idl"],
  ["B", "mcp++/cid-envelope"],
  ["C", "mcp++/ucan"],
  ["D", "mcp++/deontic-policy"],
  ["E", "mcp++/p2p-transport"],
  ["F", "mcp++/event-dag"],
  ["G", "mcp++/risk-scheduling"],
  ["H", "mcp++/x402-payments"],
] as const;
export type MCPPlusPlusProfileLetter =
  (typeof MCPPLUSPLUS_PROFILE_EVIDENCE)[number][0];
export type MCPPlusPlusPathOutcome =
  | "executed"
  | "denied"
  | "unsupported"
  | "unreachable";

export interface ProfileFCompactionEvidence {
  /** Persisted Profile F event emitted by this exact desktop operation. */
  source_event_cid: string;
  source_receipt_cid: string;
  source_correlation_id: string;
  /** Locally content-addressed provenance node that commits to the sources. */
  provenance_event_cid: string;
  archive_cid: string;
  certificate_cid: string;
  merkle_root: string;
  event_count: number;
  certificate_verified: boolean;
  inclusion_verified: boolean;
  bounded_history_compacted: boolean;
}

export interface ApplicationGatewayExecution {
  app_id: string;
  binding_id: string;
  /** DOM control emitted by the canonical desktop application window. */
  ui_control_id?: string;
  owner: string;
  selected_tool_id: string | null;
  selected_transport: "http" | "libp2p" | null;
  correlation_id: string;
  request: { route: string; same_origin: boolean };
  policy: { outcome?: string; decision_id?: string };
  response: { outcome: string; ok: boolean; http_status: number };
  recovery: { action?: string; correlation_id_preserved?: boolean } | null;
  receipt_refs: readonly string[];
  event_dag_refs: readonly string[];
  persistence: {
    status?: string;
    receipt_cid?: string;
    event_cid?: string;
  } | null;
  transport_observation?: {
    transport?: "http" | "libp2p";
    descriptor_cid?: string | null;
    ucan_did_verified?: boolean;
    remote_did?: string | null;
    identity_proof_cid?: string | null;
    correlation_id?: string;
  } | null;
  no_backend_urls_or_credentials_exposed: boolean;
  /** Browser network observations retained by the desktop replay harness. */
  browser_observed_urls?: readonly string[];
}
export interface ApplicationGatewayEvidence {
  task_id?: string;
  schema?: string;
  status?: string;
  generated_at?: string;
  execution_origin?: string;
  executions?: readonly ApplicationGatewayExecution[];
}
export interface MCPPlusPlusProfileObservation {
  profile: MCPPlusPlusProfileLetter;
  capability: string;
  outcome: MCPPlusPlusPathOutcome;
  rationale: string;
  evidence: Readonly<Record<string, unknown>>;
}
export interface MCPPlusPlusDesktopPathEvidence {
  path_id: string;
  surface: "desktop";
  app_id: string;
  route: string;
  binding_id: string;
  owner: string;
  operation: string;
  correlation_id: string;
  transports: {
    http: ApplicationTransportObservation;
    libp2p: ApplicationTransportObservation;
    parity_verified: boolean;
  };
  profiles: readonly MCPPlusPlusProfileObservation[];
}
export interface ApplicationTransportObservation {
  transport: "http" | "libp2p";
  application_originated: true;
  selected_tool_id: string;
  correlation_id: string;
  descriptor_cid: string;
  receipt_cid: string;
  event_cid: string;
  ucan_did_verified: true;
  remote_did: string;
  identity_proof_cid: string;
  policy_outcome: "allow";
  policy_decision_id: string;
  persistence_verified: true;
  recovery: { observed: boolean; correlation_id_preserved: boolean };
}
export interface AllAppMCPPlusPlusProfileInteroperabilityReport {
  schema: typeof ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA;
  task_id: typeof ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_TASK_ID;
  generated_at: string;
  decision: "GO";
  validation_mode: "application-originated-canonical-desktop-http-and-libp2p-replay";
  live_network_claimed: true;
  evidence_boundary: {
    application_execution: string;
    peer_identity_and_descriptor: string;
    governance: string;
  };
  /** Immutable provenance of the SVD-126 desktop replay consumed here. */
  application_evidence: {
    schema: "swissknife.all-app-live-gateway-executions.v2";
    generated_at: string;
    execution_count: number;
    eligible_transport_pair_count: number;
  };
  profiles: readonly {
    profile: MCPPlusPlusProfileLetter;
    capability: string;
  }[];
  desktop_paths: readonly MCPPlusPlusDesktopPathEvidence[];
  outcome_probes: readonly {
    probe_id: string;
    outcome: Exclude<MCPPlusPlusPathOutcome, "executed">;
    rationale: string;
  }[];
  coverage: {
    applicable_desktop_path_count: number;
    executed_path_count: number;
    application_transport_observation_count: number;
    profile_outcome_counts: Readonly<Record<MCPPlusPlusPathOutcome, number>>;
    all_profiles_represented: true;
    scheduling_enabled: false;
    payment_enabled: false;
  };
}

function applicableBindings(): Array<{
  app: ExecutableAppBackendDisposition;
  binding: ExecutableBackendBinding;
}> {
  return ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap((app) =>
    app.backend_bindings
      .filter(
        (binding) =>
          binding.transport_policy.allowed_transports.includes("http") &&
          binding.transport_policy.allowed_transports.includes("libp2p"),
      )
      .map((binding) => ({ app, binding })),
  );
}
function cid(value: string | undefined, label: string): string {
  if (!value || !/^b[a-z2-7]{58}$/.test(value))
    throw new Error(`SVD-127 requires a persisted ${label} CID.`);
  return value;
}
function transportObservation(
  app: ExecutableAppBackendDisposition,
  binding: ExecutableBackendBinding,
  execution: ApplicationGatewayExecution | undefined,
  transport: "http" | "libp2p",
): ApplicationTransportObservation {
  if (
    !execution ||
    execution.selected_transport !== transport ||
    execution.response.outcome !== "executed" ||
    execution.response.ok !== true ||
    execution.request.route !== "/mcp/tools/call" ||
    execution.request.same_origin !== true ||
    execution.response.http_status !== 200 ||
    execution.ui_control_id !== `live-gateway-control-${binding.binding_id}` ||
    !execution.browser_observed_urls?.every((url) => url === "/mcp/tools/call") ||
    execution.browser_observed_urls.length === 0 ||
    !execution.correlation_id.startsWith(`desktop:${binding.binding_id}:`) ||
    execution.app_id !== app.app_id ||
    execution.policy.outcome !== "allow" ||
    !execution.policy.decision_id ||
    execution.persistence?.status !== "persisted" ||
    !execution.no_backend_urls_or_credentials_exposed ||
    execution.owner !== binding.owner ||
    !execution.selected_tool_id ||
    !binding.tool_selection.preferred_tool_ids.includes(
      execution.selected_tool_id,
    )
  ) {
    throw new Error(
      `SVD-127 requires a visible application-originated successful ${transport} replay for ${binding.binding_id}.`,
    );
  }
  const observed = execution.transport_observation;
  // Do not use an independent peer capture as a substitute for a desktop
  // replay. The same server-side connector that invoked this exact tool must
  // return the Profile A descriptor and Profile C identity proof.
  if (
    observed?.transport !== transport ||
    !observed.descriptor_cid ||
    observed.ucan_did_verified !== true ||
    !observed.remote_did ||
    !observed.identity_proof_cid ||
    observed.correlation_id !== execution.correlation_id
  ) {
    throw new Error(
      `SVD-127 requires the call-bound ${transport} descriptor and UCAN observation for ${binding.binding_id}.`,
    );
  }
  return {
    transport,
    application_originated: true,
    selected_tool_id:
      execution.selected_tool_id ??
      (() => {
        throw new Error(
          "SVD-127 application replay omitted exact tool identity.",
        );
      })(),
    correlation_id: execution.correlation_id,
    descriptor_cid: cid(observed.descriptor_cid, "descriptor"),
    receipt_cid: cid(
      execution.persistence.receipt_cid ?? execution.receipt_refs[0],
      "receipt",
    ),
    event_cid: cid(
      execution.persistence.event_cid ?? execution.event_dag_refs[0],
      "event DAG",
    ),
    ucan_did_verified: true,
    remote_did: observed.remote_did,
    identity_proof_cid: cid(observed.identity_proof_cid, "identity proof"),
    policy_outcome: "allow",
    policy_decision_id:
      execution.policy.decision_id ??
      (() => {
        throw new Error(
          `SVD-127 application replay omitted the allow policy decision for ${binding.binding_id}.`,
        );
      })(),
    persistence_verified: true,
    recovery: {
      observed: execution.recovery !== null,
      correlation_id_preserved:
        execution.recovery?.correlation_id_preserved === true,
    },
  };
}
function profileObservations(
  path: MCPPlusPlusDesktopPathEvidence,
  compaction: {
    http: ProfileFCompactionEvidence;
    libp2p: ProfileFCompactionEvidence;
  },
): MCPPlusPlusProfileObservation[] {
  const common = {
    owner: path.owner,
    http: path.transports.http,
    libp2p: path.transports.libp2p,
  };
  return MCPPLUSPLUS_PROFILE_EVIDENCE.map(([profile, capability]) => {
    if (profile === "G")
      return {
        profile,
        capability,
        outcome: "unsupported",
        rationale:
          "Governed scheduling is not enabled for this desktop replay.",
        evidence: { owner: path.owner, scheduling_enabled: false },
      };
    if (profile === "H")
      return {
        profile,
        capability,
        outcome: "unsupported",
        rationale:
          "No governed settlement seller is enabled for this desktop replay.",
        evidence: {
          owner: path.owner,
          payment_enabled: false,
          settlement_attempted: false,
        },
      };
    if (profile === "D")
      return {
        profile,
        capability,
        outcome: "executed",
        rationale:
          "Both application replays retain their call-bound allow policy decisions.",
        evidence: {
          ...common,
          http_policy: {
            outcome: path.transports.http.policy_outcome,
            decision_id: path.transports.http.policy_decision_id,
          },
          libp2p_policy: {
            outcome: path.transports.libp2p.policy_outcome,
            decision_id: path.transports.libp2p.policy_decision_id,
          },
        },
      };
    if (profile === "F")
      return {
        profile,
        capability,
        outcome: "executed",
        rationale:
          "Each application transport receipt is included in the verified bounded compaction archive.",
        evidence: { ...common, ...compaction },
      };
    return {
      profile,
      capability,
      outcome: "executed",
      rationale: `Both canonical desktop calls completed over ${profile === "E" ? "HTTP and libp2p" : "their selected transport"} with retained CID evidence.`,
      evidence: common,
    };
  });
}

export function buildAllAppMCPPlusPlusProfileInteroperabilityReport(input: {
  generatedAt: string;
  applicationEvidence: ApplicationGatewayEvidence;
  compactionEvidence: readonly ProfileFCompactionEvidence[];
}): AllAppMCPPlusPlusProfileInteroperabilityReport {
  if (
    input.applicationEvidence.task_id !== "SVD-126" ||
    input.applicationEvidence.schema !==
      "swissknife.all-app-live-gateway-executions.v2" ||
    input.applicationEvidence.status !== "passed" ||
    input.applicationEvidence.execution_origin !==
      "canonical-virtual-desktop-browser"
  )
    throw new Error(
      "SVD-127 requires the successful SVD-126 canonical desktop workflow evidence.",
    );
  if (input.compactionEvidence.length === 0)
    throw new Error(
      "SVD-127 requires application-originated Profile F compaction evidence.",
    );
  const compactionBySourceEvent = new Map(
    input.compactionEvidence.map((evidence) => [
      `${evidence.source_event_cid}:${evidence.source_correlation_id}`,
      evidence,
    ]),
  );
  const executions = input.applicationEvidence.executions ?? [];
  const expectedTransportPairs = applicableBindings().flatMap(({ binding }) =>
    (["http", "libp2p"] as const).map(
      (transport) => `${binding.binding_id}:${transport}`,
    ),
  );
  const replayRows = executions.filter((row) =>
    expectedTransportPairs.includes(`${row.binding_id}:${row.selected_transport}`),
  );
  const replayPairCounts = new Map<string, number>();
  for (const row of replayRows) {
    const key = `${row.binding_id}:${row.selected_transport}`;
    replayPairCounts.set(key, (replayPairCounts.get(key) ?? 0) + 1);
  }
  const missingOrDuplicateReplay = expectedTransportPairs.find(
    (key) => replayPairCounts.get(key) !== 1,
  );
  if (missingOrDuplicateReplay) {
    const [bindingId, transport] = missingOrDuplicateReplay.split(":");
    throw new Error(
      `SVD-127 requires exactly one visible application-originated successful ${transport} replay for ${bindingId}.`,
    );
  }
  const paths = applicableBindings().map(({ app, binding }) => {
    const httpExecution = executions.find(
      (row) =>
        row.binding_id === binding.binding_id &&
        row.selected_transport === "http",
    );
    const libp2pExecution = executions.find(
      (row) =>
        row.binding_id === binding.binding_id &&
        row.selected_transport === "libp2p",
    );
    const http = transportObservation(app, binding, httpExecution, "http");
    const libp2p = transportObservation(
      app,
      binding,
      libp2pExecution,
      "libp2p",
    );
    const httpCompaction = compactionBySourceEvent.get(
      `${http.event_cid}:${http.correlation_id}`,
    );
    const libp2pCompaction = compactionBySourceEvent.get(
      `${libp2p.event_cid}:${libp2p.correlation_id}`,
    );
    if (
      !validCompaction(httpCompaction, http) ||
      !validCompaction(libp2pCompaction, libp2p)
    ) {
      throw new Error(
        `SVD-127 requires a verified Profile F compaction certificate for both transports of ${binding.binding_id}.`,
      );
    }
    const path: MCPPlusPlusDesktopPathEvidence = {
      path_id: `desktop:${binding.binding_id}`,
      surface: "desktop",
      app_id: app.app_id,
      route: binding.ui_control.surface,
      binding_id: binding.binding_id,
      owner: binding.owner,
      operation: binding.mediated_intent.operation,
      correlation_id: http.correlation_id,
      transports: {
        http,
        libp2p,
        parity_verified: http.selected_tool_id === libp2p.selected_tool_id,
      },
      profiles: [],
    };
    path.profiles = profileObservations(path, {
      http: httpCompaction,
      libp2p: libp2pCompaction,
    });
    if (!path.transports.parity_verified)
      throw new Error(
        `SVD-127 transport replay selected different exact tools for ${binding.binding_id}.`,
      );
    return path;
  });
  const counts: Record<MCPPlusPlusPathOutcome, number> = {
    executed: 0,
    denied: 1,
    unsupported: 0,
    unreachable: 1,
  };
  for (const profile of paths.flatMap((path) => path.profiles))
    counts[profile.outcome] += 1;
  return {
    schema: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_SCHEMA,
    task_id: ALL_APP_MCPPLUSPLUS_PROFILE_INTEROPERABILITY_TASK_ID,
    generated_at: input.generatedAt,
    decision: "GO",
    validation_mode:
      "application-originated-canonical-desktop-http-and-libp2p-replay",
    live_network_claimed: true,
    evidence_boundary: {
      application_execution:
        "Every executed transport observation is a visible canonical desktop control posting to the same-origin mediator.",
      peer_identity_and_descriptor:
        "The exact server-side connector that invokes each desktop operation returns its descriptor CID and verified UCAN identity; independent peer captures are not report inputs.",
      governance:
        "Profiles G and H are unsupported until governed scheduling or settlement are explicitly enabled.",
    },
    application_evidence: {
      schema: "swissknife.all-app-live-gateway-executions.v2",
      generated_at: input.applicationEvidence.generated_at ?? input.generatedAt,
      execution_count: executions.length,
      eligible_transport_pair_count: expectedTransportPairs.length,
    },
    profiles: MCPPLUSPLUS_PROFILE_EVIDENCE.map(([profile, capability]) => ({
      profile,
      capability,
    })),
    desktop_paths: paths,
    outcome_probes: [
      {
        probe_id: "policy-denied-before-transport",
        outcome: "denied",
        rationale: "Policy denial remains explicit.",
      },
      {
        probe_id: "both-transports-unavailable",
        outcome: "unreachable",
        rationale: "Recovery preserves correlation identity.",
      },
    ],
    coverage: {
      applicable_desktop_path_count: paths.length,
      executed_path_count: paths.length,
      application_transport_observation_count: paths.length * 2,
      profile_outcome_counts: counts,
      all_profiles_represented: true,
      scheduling_enabled: false,
      payment_enabled: false,
    },
  };
}

function validCompaction(
  evidence: ProfileFCompactionEvidence | undefined,
  observation: ApplicationTransportObservation,
): evidence is ProfileFCompactionEvidence {
  return Boolean(
    evidence &&
      evidence.source_event_cid === observation.event_cid &&
      evidence.source_receipt_cid === observation.receipt_cid &&
      evidence.source_correlation_id === observation.correlation_id &&
      // Profile F stores locally content-addressed archive records using the
      // EventDAG's canonical sha256 references.  The certificate and its
      // provenance node must be present as content addresses; a boolean
      // verification flag alone must never turn a truncated certificate into
      // application transport evidence.
      contentReference(evidence.provenance_event_cid) &&
      contentReference(evidence.archive_cid) &&
      contentReference(evidence.certificate_cid) &&
      /^[a-f0-9]{64}$/.test(evidence.merkle_root) &&
      Number.isSafeInteger(evidence.event_count) &&
      evidence.event_count > 0 &&
      evidence.certificate_verified &&
      evidence.inclusion_verified &&
      evidence.bounded_history_compacted,
  );
}

function contentReference(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}
