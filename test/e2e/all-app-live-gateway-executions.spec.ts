import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPORT_PATH = join(
  process.cwd(),
  "test-results",
  "virtual-desktop-ipfs-mcp-orb",
  "all-app-live-gateway-executions.json",
);

interface GatewayControl {
  app_id: string;
  binding_id: string;
  capability_id: string;
  intent_id: string;
  owner: string;
  label: string;
  mutates_remote_state: boolean;
  confirmation_required: boolean;
  confirmation_policy: "none" | "policy" | "always";
  transport: "http" | null;
  selected_tool_id: string | null;
  transports: Array<"http" | "libp2p">;
  status: "available" | "unavailable";
}

interface GatewayEvent {
  control: GatewayControl;
  call: {
    route: string;
    correlation_id: string;
    transport: "http" | "libp2p";
    input: { policy: Record<string, unknown> };
  };
  result: {
    ok: boolean;
    outcome: string;
    result?: {
      application_transport_observation?: {
        transport?: "http" | "libp2p";
        descriptor_cid?: string | null;
        ucan_did_verified?: boolean;
        remote_did?: string | null;
        identity_proof_cid?: string | null;
        correlation_id?: string;
      };
    };
    receipt?: {
      receipt_id?: string;
      transport?: "http" | "libp2p";
      receipt_refs?: string[];
      event_dag_refs?: string[];
      persistence?: {
        status?: string;
        backend?: string;
        receipt_cid?: string;
        event_cid?: string;
        error?: string;
      };
    };
  };
  http_status: number;
}

declare global {
  interface Window {
    swissknifeDesktop?: {
      launchApp(
        appId: string,
        options?: { gatewayOnly?: boolean },
      ): Promise<void> | void;
    };
    __swissknifeGatewayEvents?: GatewayEvent[];
    __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__?: boolean;
    __SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__?: "http" | "libp2p";
  }
}

test.describe.configure({ mode: "serial", timeout: 1_800_000 });
// The canonical desktop needs to load every application, then Profile E
// requests are deliberately serialized on their authenticated owner stream.
// A remote MCP++ request has a 30-second protocol timeout, so the full
// 79-control HTTP plus eligible-libp2p replay matrix needs a bound larger
// than the default end-to-end lane without weakening any observation checks.
test("executes every materialized binding from its canonical desktop application window", async ({
  page,
}) => {
  // Retain the runtime form as well as the describe-level setting: this file
  // is run from both the release config and focused local invocations.
  test.setTimeout(1_800_000);
  const observedMcpRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/mcp/tools/call")
      observedMcpRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.swissknifeDesktop));
  const controls = await page.evaluate(async () => {
    const response = await fetch("/mcp/tools/bindings", {
      cache: "no-store",
    });
    const body = await response.json();
    if (response.status >= 400) {
      throw new Error(
        `Gateway controls endpoint returned ${response.status}: ${JSON.stringify(body)}`,
      );
    }
    if (Array.isArray(body?.controls)) {
      return body.controls as GatewayControl[];
    }
    if (Array.isArray(body)) {
      return body as GatewayControl[];
    }
    if (Array.isArray(body?.result?.controls)) {
      return body.result.controls as GatewayControl[];
    }
    throw new Error(
      `Gateway controls endpoint returned unexpected payload shape: ${JSON.stringify(body)}`,
    );
  });

  expect(controls).toHaveLength(79);
  expect(
    controls.every(
      (control) =>
        control.status === "available" &&
        control.transport === "http" &&
        control.selected_tool_id,
    ),
  ).toBe(true);

  await page.evaluate(() => {
    window.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
    window.__swissknifeGatewayEvents = [];
    document.addEventListener("swissknife:live-gateway-result", (event) => {
      window.__swissknifeGatewayEvents?.push(
        (event as CustomEvent<GatewayEvent>).detail,
      );
    });
  });

  const controlsByApp = new Map<string, GatewayControl[]>();
  for (const control of controls) {
    const appControls = controlsByApp.get(control.app_id) ?? [];
    appControls.push(control);
    controlsByApp.set(control.app_id, appControls);
  }

  const replayControls = (transport: "http" | "libp2p") =>
    transport === "http"
      ? controls
      : controls.filter((control) => control.transports.includes("libp2p"));
  for (const transport of ["http", "libp2p"] as const) {
    await page.evaluate((value) => {
      window.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = value;
    }, transport);
    for (const [appId, declaredControls] of controlsByApp) {
      const appControls = declaredControls.filter((control) =>
        replayControls(transport).includes(control),
      );
      if (appControls.length === 0) continue;
      // MCP Control owns the reviewed, argument-free K/D/A registry reads.
      // Those six calls (three owners x two transports) are real reads. Every
      // other application path remains a no-side-effect dry run unless its
      // declaration is itself safely non-mutating and separately reviewed.
      await page.evaluate((realSafeReadApp) => {
        window.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = !realSafeReadApp;
      }, appId === "mcp-control");
      const icon = page.locator(`.icon[data-app="${appId}"]`).first();
      await expect(
        icon,
        `${appId} must be launchable from the canonical desktop`,
      ).toBeVisible();
      // Exercise the same canonical launcher used by an icon activation. The
      // replay-only option keeps unrelated heavyweight app runtimes from
      // obscuring the transport result; the visible app window and its real
      // same-origin MCP++ controls are still the application invocation path.
      await page.evaluate((id) => {
        void window.swissknifeDesktop?.launchApp(id, { gatewayOnly: true });
      }, appId);
      const appWindow = page.locator(`.window[data-app-id="${appId}"]`).last();
      await expect(appWindow).toBeVisible();
      const panel = appWindow.getByTestId("live-tool-gateway-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator("[data-live-gateway-binding]")).toHaveCount(
        appControls.length,
      );

      const before = await gatewayEventCount(page);
      if (transport === "http") {
        // HTTP adapters are independent. Dispatching a bounded app batch
        // keeps this release suite practical without bypassing UI handlers.
        await panel
          .locator("[data-live-gateway-binding]")
          .evaluateAll((buttons) => {
            buttons.forEach((button) => (button as HTMLButtonElement).click());
          });
        await page.waitForFunction(
          (expected) =>
            (window.__swissknifeGatewayEvents?.length ?? 0) === expected,
          before + appControls.length,
        );
      } else {
        // MCP++ Profile E has one authenticated stream per owner. Invoke
        // controls serially so each application-originated call gets its own
        // receipt before the next request reuses the verified session.
        for (const control of appControls) {
          await panel
            .locator(`[data-live-gateway-binding="${control.binding_id}"]`)
            .click();
          await page.waitForFunction(
            (expected) =>
              (window.__swissknifeGatewayEvents?.length ?? 0) === expected,
            before + appControls.indexOf(control) + 1,
          );
        }
      }
      for (const control of appControls) {
        await expect(
          panel.locator(`[data-live-gateway-result="${control.binding_id}"]`),
        ).not.toHaveText("pending");
      }

      const close = appWindow.locator(".window-control.close").first();
      if (await close.isVisible()) {
        // Long sequential replays can place later desktop windows outside the
        // viewport. This is cleanup rather than the application invocation
        // under test, so use the control's native click handler directly
        // instead of waiting for Playwright to scroll a desktop window.
        await close.evaluate((control: HTMLElement) => control.click());
        await expect(appWindow).toBeHidden();
      }
    }
  }

  const events = await page.evaluate(
    () => window.__swissknifeGatewayEvents ?? [],
  );
  const expectedReplayCount = controls.length + replayControls("libp2p").length;
  expect(events).toHaveLength(expectedReplayCount);
  expect(
    new Set(
      events.map(
        (event) =>
          `${event.control.binding_id}:${event.result.receipt?.transport ?? ""}`,
      ),
    ),
  ).toHaveProperty("size", expectedReplayCount);
  const invalidObservations = events
    .map((event) => {
      const observation = event.result.result?.application_transport_observation;
      return {
        app_id: event.control.app_id,
        binding_id: event.control.binding_id,
        transport: event.call.transport,
        outcome: event.result.outcome,
        http_status: event.http_status,
        receipt_status: event.result.receipt?.persistence?.status ?? null,
        receipt_id: event.result.receipt?.receipt_id ?? null,
        event_cid: event.result.receipt?.event_dag_refs?.[0] ?? null,
        observation: observation ?? null,
        checks: {
          route: event.call.route === "/mcp/tools/call",
          http_status: event.http_status === 200,
          persisted:
            event.result.receipt?.persistence?.status === "persisted",
          receipt_cid: /^b[a-z2-7]{58}$/.test(
            event.result.receipt?.receipt_id ?? "",
          ),
          event_cid: /^b[a-z2-7]{58}$/.test(
            event.result.receipt?.event_dag_refs?.[0] ?? "",
          ),
          // These values are collected from the server-side connector that made
          // this exact application request. Do not let a later report compiler
          // replace them with a peer fixture or descriptor projection.
          observation_transport:
            observation?.transport === event.call.transport,
          descriptor_cid: /^b[a-z2-7]{58}$/.test(
            observation?.descriptor_cid ?? "",
          ),
          ucan_did_verified: observation?.ucan_did_verified === true,
          remote_did: /^did:key:/.test(observation?.remote_did ?? ""),
          identity_proof_cid: /^b[a-z2-7]{58}$/.test(
            observation?.identity_proof_cid ?? "",
          ),
          correlation_id:
            observation?.correlation_id === event.call.correlation_id,
        },
      };
    })
    .filter((entry) => !Object.values(entry.checks).every(Boolean));
  expect(invalidObservations).toEqual([]);

  const invalidGovernance = events.filter((event) => {
    const dryRun = event.call.input.policy.dry_run === true;
    if (event.control.mutates_remote_state) {
      return !event.control.confirmation_required
        || !dryRun
        || event.call.input.policy.outcome !== "require_confirmation"
        || event.call.input.policy.consent !== "granted";
    }
    if (event.control.app_id === "mcp-control") {
      return dryRun
        || event.call.input.policy.outcome !== "allow"
        || event.call.input.policy.consent !== "not_required";
    }
    return event.call.input.policy.outcome !== "allow";
  });
  expect(invalidGovernance).toEqual([]);

  const browserOrigin = new URL(page.url()).origin;
  expect(observedMcpRequests).toHaveLength(expectedReplayCount);
  expect(
    observedMcpRequests.every((url) => new URL(url).origin === browserOrigin),
  ).toBe(true);

  const executions = events.map((event) => ({
    app_id: event.control.app_id,
    binding_id: event.control.binding_id,
    ui_control_id: `live-gateway-control-${event.control.binding_id}`,
    owner: event.control.owner,
    selected_tool_id: event.control.selected_tool_id,
    selected_transport:
      event.result.receipt?.transport ?? event.control.transport,
    correlation_id: event.call.correlation_id,
    invocation: {
      narrow_non_mutating_input: !event.control.mutates_remote_state,
      dry_run: event.call.input.policy.dry_run === true,
      operation_class: event.control.mutates_remote_state
        ? "governed_write_request"
        : "read_request",
      confirmation_required: event.control.confirmation_required,
      real_safe_read:
        !event.control.mutates_remote_state &&
        event.call.input.policy.dry_run === false,
      confirmation_or_policy: event.control.mutates_remote_state
        ? "confirmation_gated_dry_run"
        : event.call.input.policy.dry_run === false
          ? "safe_read_not_required"
          : "safe_read_dry_run",
    },
    request: { route: event.call.route, same_origin: true },
    policy: event.call.input.policy,
    response: {
      outcome: event.result.outcome,
      ok: event.result.ok,
      http_status: event.http_status,
    },
    // Successful calls explicitly record that recovery was not necessary;
    // failed calls retain the declared same-correlation recovery route.
    recovery:
      event.result.outcome === "executed"
        ? {
            action: "not_required_after_success",
            correlation_id_preserved: true,
          }
        : { action: "refresh_descriptor", correlation_id_preserved: true },
    receipt_refs: event.result.receipt?.receipt_refs ?? [],
    event_dag_refs: event.result.receipt?.event_dag_refs ?? [],
    persistence: event.result.receipt?.persistence ?? null,
    // This value is emitted by the server-side Profile E connector after the
    // same visible desktop control has completed. It carries no multiaddr,
    // endpoint, credential, or transport handle.
    transport_observation:
      event.result.result?.application_transport_observation ?? null,
    browser_observed_urls: ["/mcp/tools/call"],
    no_backend_urls_or_credentials_exposed: true,
  }));
  const report = {
    schema: "swissknife.all-app-live-gateway-executions.v2",
    task_id: "SVD-126",
    generated_at: new Date().toISOString(),
    status: "passed",
    execution_origin: "canonical-virtual-desktop-browser",
    browser_origin: browserOrigin,
    mediator_route: "/mcp/tools/call",
    summary: {
      binding_count: controls.length,
      visible_control_count: controls.length,
      transport_replay_count: events.length,
      same_origin_request_count: observedMcpRequests.length,
      persisted_receipt_count: executions.filter(
        (execution) => execution.persistence?.status === "persisted",
      ).length,
      executed_count: executions.filter(
        (execution) => execution.response.outcome === "executed",
      ).length,
      non_executed_count: executions.filter(
        (execution) => execution.response.outcome !== "executed",
      ).length,
      no_backend_exposure: true,
    },
    executions,
  };
  mkdirSync(
    join(process.cwd(), "test-results", "virtual-desktop-ipfs-mcp-orb"),
    { recursive: true },
  );
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
});

async function gatewayEventCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__swissknifeGatewayEvents?.length ?? 0);
}
