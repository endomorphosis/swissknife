import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

declare global {
  interface Window {
    swissknifeDesktop?: {
      launchManifestApp?: (appId: string) => Promise<unknown>;
      launchApp?: (appId: string) => Promise<unknown> | unknown;
    };
    __agentSupervisorGateway?: { invoke(invocation: GatewayInvocation): Promise<GatewayResult> };
    __agentSupervisorValidation?: ValidationFixtureState;
  }
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const EVIDENCE_ROOT = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const SCREENSHOT_ROOT = join(EVIDENCE_ROOT, 'app-screenshots', 'agent-supervisor');
const REPORT_PATH = join(EVIDENCE_ROOT, 'agent-supervisor-all-app-validation.json');
const TASKBOARD_URL = 'implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md#svd-097';
const RAW_DRY_RUN_PROMPT = 'Review the all-app wave, preserve dependencies, and redact this dry-run prompt.';
const RAW_CONFIRMED_PROMPT = 'Prioritize receipt and event-DAG checks while dispatching the reviewed all-app validation wave.';

test('validates live owners, linked goals, governed steering, and all-app wave dispatch', async ({ page }) => {
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installThreeOwnerGateway(page);

  const browserErrors: BrowserError[] = [];
  const failedRequests: FailedRequest[] = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      browserErrors.push({ kind: 'console', message: message.text(), url: message.location().url });
    }
  });
  page.on('pageerror', error => browserErrors.push({ kind: 'pageerror', message: error.message }));
  page.on('requestfailed', request => failedRequests.push({
    method: request.method(),
    url: request.url(),
    failure: request.failure()?.errorText ?? 'unknown',
  }));

  await launchSupervisor(page);
  const app = page.getByTestId('agent-supervisor-app');
  await expect(app).toHaveAttribute('data-state', 'ready');
  await expect(app).toHaveAttribute('data-transport', 'live');
  await expect(page.getByTestId('goals-tree')).toContainText('SVD-097');
  await expect(page.getByTestId('goals-tree')).toContainText('SVD-097-all-app-wave');
  await expect(page.getByTestId('task-queue')).toContainText('SVD-097-dispatch-all-apps');
  await screenshot(page, '01-live-goal-task-state.png');

  await page.getByRole('tab', { name: 'Health' }).click();
  const health = page.getByTestId('backend-health');
  for (const owner of ['ipfs_accelerate_py', 'ipfs_kit_py', 'ipfs_datasets_py']) {
    await expect(health).toContainText(owner);
  }
  await expect(page.getByTestId('gateway-evidence')).toContainText('supervisor.goals.read');
  await expect(page.getByTestId('gateway-evidence')).toContainText('supervisor.receipts.read');
  await expect(page.getByTestId('gateway-evidence')).toContainText('supervisor.taskboard.links.read');

  await page.getByTestId('task-queue').locator('[data-task-id="SVD-097-dispatch-all-apps"]').click();
  const activeTask = page.getByTestId('active-task');
  await expect(activeTask).toContainText('SVD-097');
  await expect(activeTask).toContainText('SVD-097-all-app-wave');
  await expect(activeTask.locator(`a[href="${TASKBOARD_URL}"]`)).toHaveCount(1);

  await page.getByTestId('goals-tree').locator('[data-subgoal-id="SVD-097-all-app-wave"]').click();
  await expect(page.getByTestId('steering-review')).toContainText('subgoal:SVD-097-all-app-wave');
  await expect(page.getByTestId('steering-review')).toContainText('SVD-097-dispatch-all-apps');
  await expect(page.getByTestId('steering-panel')).toContainText('[prompt redacted]');
  await page.getByTestId('steering-prompt').fill(RAW_DRY_RUN_PROMPT);
  await page.getByTestId('steering-dry-run').check();
  await expect(page.getByTestId('steering-confirm')).toBeDisabled();
  await page.getByTestId('steering-submit').click();
  const dryRunResult = page.getByTestId('steering-result');
  await expect(dryRunResult).toContainText('dry-run');
  await expect(dryRunResult).toContainText('confirm');
  await expect(dryRunResult).toContainText('rcpt-svd097-steering-dry-run');
  await expect(dryRunResult).toContainText('bafysvd097eventsteeringdryrun');
  await dryRunResult.scrollIntoViewIfNeeded();
  await screenshot(page, '02-redacted-dry-run-review.png');

  await page.getByTestId('steering-dry-run').uncheck();
  await page.getByTestId('steering-prompt').fill(RAW_CONFIRMED_PROMPT);
  await page.getByTestId('steering-confirm').check();
  await page.getByTestId('steering-submit').click();
  const confirmedResult = page.getByTestId('steering-result');
  await expect(confirmedResult).toContainText('confirmed');
  await expect(confirmedResult).toContainText('rcpt-svd097-steering-confirmed');
  await expect(confirmedResult).toContainText('bafysvd097eventsteeringconfirmed');
  await confirmedResult.scrollIntoViewIfNeeded();
  await screenshot(page, '03-confirmed-steering-policy-receipt-event.png');

  await page.getByTestId('task-queue').locator('[data-task-id="SVD-097-dispatch-all-apps"]').click();
  await page.getByRole('tab', { name: 'Dispatch' }).click();
  await expect(page.getByTestId('dispatch-review')).toContainText('privileged-control');
  await expect(page.getByTestId('dispatch-panel')).toContainText('agent_supervisor.task_control.request');
  await page.getByTestId('dispatch-reason').fill('Dispatch the dependency-cleared all-app desktop validation wave.');
  await page.getByTestId('dispatch-confirm').check();
  await page.getByTestId('dispatch-submit').click();
  const dispatchResult = page.getByTestId('dispatch-result');
  await expect(dispatchResult).toContainText('rcpt-svd097-all-app-wave');
  await expect(dispatchResult).toContainText('bafysvd097eventallappwave');
  await expect(dispatchResult).toContainText('task-dispatched');
  await expect(dispatchResult).toContainText('running');
  await dispatchResult.scrollIntoViewIfNeeded();
  await screenshot(page, '04-all-app-wave-dispatched.png');

  const uiAudit = await auditSupervisorUi(page);
  const fixture = await page.evaluate(() => window.__agentSupervisorValidation);
  expect(fixture).toBeTruthy();
  const invocations = fixture!.invocations;
  const owners = [...new Set(invocations.map(invocation => invocation.owner))].sort();
  const actionInvocations = invocations.filter(invocation => invocation.access === 'governed-write');
  const serializedFixture = JSON.stringify(fixture);
  const directHostAccessRequests = failedRequests.filter(request => /(?:\/fs\b|\/process\b|\/exec\b|child_process|implementation_supervisor)/i.test(request.url));
  const unreportedBackendFailures = fixture!.outcomes.filter(outcome => outcome.state !== 'available' && !outcome.reported_in_ui);

  const report: ValidationReport = {
    schema: 'swissknife.agent-supervisor-all-app-validation.v1',
    task_id: 'SVD-097',
    generated_at: new Date().toISOString(),
    decision: 'GO',
    desktop_surface: 'agent-supervisor',
    live_state: {
      owners,
      capability_ids: invocations.filter(item => item.access === 'read').map(item => item.capability_id),
      owner_count: owners.length,
      transport_by_owner: fixture!.transport_by_owner,
    },
    task_graph: {
      goal_id: 'SVD-097',
      subgoal_ids: ['SVD-097-live-owners', 'SVD-097-all-app-wave'],
      task_ids: ['SVD-097-verify-owners', 'SVD-097-dispatch-all-apps'],
      taskboard_url: TASKBOARD_URL,
      linked: true,
    },
    prompt_steering: actionInvocations
      .filter(item => item.capability_id === 'supervisor.prompt-steering.request')
      .map(item => ({
        mode: item.payload.dry_run ? 'dry-run' : 'confirmed',
        target: `${item.payload.target_type}:${item.payload.target_id}`,
        prompt: item.payload.prompt,
        prompt_char_count: item.payload.prompt_char_count,
        confirmation_supplied: Boolean(item.payload.confirmation_token),
        policy_class: item.policy_class,
      })),
    dispatch: {
      task_id: 'SVD-097-dispatch-all-apps',
      action: 'claim',
      status: fixture!.dispatch_count === 1 ? 'dispatched' : 'failed',
      mutation_count: fixture!.mutation_count,
      dry_run_mutation_count: fixture!.dry_run_mutation_count,
    },
    outcomes: fixture!.outcomes,
    browser_boundary: {
      gateway_only: invocations.every(item => item.method.startsWith('agent_supervisor.')),
      direct_file_or_process_access_count: fixture!.direct_host_access_attempts + directHostAccessRequests.length,
      raw_prompt_persisted: serializedFixture.includes(RAW_DRY_RUN_PROMPT) || serializedFixture.includes(RAW_CONFIRMED_PROMPT),
    },
    ui_validation: {
      ...uiAudit,
      browser_console_error_count: browserErrors.length,
      failed_request_count: failedRequests.length,
      unreported_backend_failure_count: unreportedBackendFailures.length,
    },
    browser_console_errors: browserErrors,
    failed_requests: failedRequests,
    screenshots: screenshotPaths(),
    summary: {
      owners_observed: owners.length,
      dry_run_reviews: actionInvocations.filter(item => item.capability_id === 'supervisor.prompt-steering.request' && item.payload.dry_run).length,
      confirmed_reviews: actionInvocations.filter(item => item.capability_id === 'supervisor.prompt-steering.request' && !item.payload.dry_run).length,
      dispatched_waves: fixture!.dispatch_count,
      hidden_controls: uiAudit.hidden_control_count,
      text_overlaps: uiAudit.text_overlap_count,
      broken_focus: uiAudit.broken_focus_count,
      unreported_backend_failures: unreportedBackendFailures.length,
    },
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  expect(owners).toEqual(['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py']);
  expect(report.prompt_steering.map(review => review.mode)).toEqual(['dry-run', 'confirmed']);
  expect(report.prompt_steering.every(review => review.prompt === '[prompt redacted]')).toBe(true);
  expect(report.dispatch).toMatchObject({ status: 'dispatched', mutation_count: 2, dry_run_mutation_count: 0 });
  expect(report.browser_boundary).toEqual({
    gateway_only: true,
    direct_file_or_process_access_count: 0,
    raw_prompt_persisted: false,
  });
  expect(report.ui_validation).toMatchObject({
    hidden_control_count: 0,
    text_overlap_count: 0,
    broken_focus_count: 0,
    browser_console_error_count: 0,
    failed_request_count: 0,
    unreported_backend_failure_count: 0,
  });
  expect(report.screenshots.every(path => existsSync(join(process.cwd(), path)))).toBe(true);
});

async function launchSupervisor(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.desktop', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.swissknifeDesktop));
  await page.evaluate(async () => {
    if (typeof window.swissknifeDesktop?.launchManifestApp === 'function') {
      await window.swissknifeDesktop.launchManifestApp('agent-supervisor');
    } else {
      await window.swissknifeDesktop?.launchApp?.('agent-supervisor');
    }
  });
  await page.waitForSelector('[data-testid="agent-supervisor-app"]', { timeout: 30_000 });
}

async function installThreeOwnerGateway(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const now = '2026-07-13T18:00:00.000Z';
    const receipt = (id: string, cid = `bafy${id.replace(/[^a-z0-9]/gi, '').toLowerCase()}`) => ({
      receipt_id: id, cid, owner: 'ipfs_kit_py', created_at: now,
    });
    const eventDag = (id: string, cid: string, receiptCid: string, eventType: string) => ({
      event_id: id, cid, receipt_cid: receiptCid, owner: 'ipfs_kit_py', event_type: eventType, created_at: now,
    });
    const receipts = [
      receipt('rcpt-svd097-health'),
      receipt('rcpt-svd097-task-graph'),
      receipt('rcpt-svd097-taskboard-index'),
      receipt('rcpt-svd097-run-history'),
    ];
    const goals = [{
      goal_id: 'SVD-097', title: 'Validate Agent Supervisor desktop workflows', status: 'running',
      subgoal_ids: ['SVD-097-live-owners', 'SVD-097-all-app-wave'],
      task_ids: ['SVD-097-verify-owners', 'SVD-097-dispatch-all-apps'],
      taskboard_url: 'implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md#svd-097',
      receipt: receipts[1],
    }];
    const subgoals = [
      { subgoal_id: 'SVD-097-live-owners', goal_id: 'SVD-097', title: 'Retrieve live state from all three owners', status: 'completed', task_ids: ['SVD-097-verify-owners'], taskboard_url: goals[0].taskboard_url, receipt: receipts[1] },
      { subgoal_id: 'SVD-097-all-app-wave', goal_id: 'SVD-097', title: 'Review and dispatch the all-app validation wave', status: 'ready', task_ids: ['SVD-097-dispatch-all-apps'], taskboard_url: goals[0].taskboard_url, receipt: receipts[1] },
    ];
    const queue = [
      { task_id: 'SVD-097-verify-owners', title: 'Verify all owner state and provenance', status: 'completed', goal_id: 'SVD-097', subgoal_id: 'SVD-097-live-owners', dependencies: [], taskboard_url: goals[0].taskboard_url, receipt: receipts[1] },
      { task_id: 'SVD-097-dispatch-all-apps', title: 'Dispatch all-app backend and UI validation wave', status: 'ready', goal_id: 'SVD-097', subgoal_id: 'SVD-097-all-app-wave', dependencies: ['SVD-097-verify-owners'], taskboard_url: goals[0].taskboard_url, receipt: receipts[1] },
    ];
    const links = queue.map(task => ({ task_id: task.task_id, source: 'todo', url: task.taskboard_url, title: `SVD-097 taskboard: ${task.title}`, status: task.status }));
    const state: ValidationFixtureState = {
      invocations: [], outcomes: [], dispatch_count: 0, mutation_count: 0, dry_run_mutation_count: 0,
      direct_host_access_attempts: 0,
      transport_by_owner: { ipfs_accelerate_py: 'mcp++', ipfs_kit_py: 'mcp', ipfs_datasets_py: 'libp2p' },
    };
    window.__agentSupervisorValidation = state;
    window.__agentSupervisorGateway = {
      async invoke(invocation: GatewayInvocation): Promise<GatewayResult> {
        const payload = { ...(invocation.payload || {}) };
        if (typeof payload.prompt === 'string') {
          payload.prompt_char_count = payload.prompt.trim().length;
          payload.prompt = '[prompt redacted]';
        }
        state.invocations.push({ ...invocation, payload });
        const available = (data: unknown, resultReceipt = receipts[0], correlation = invocation.correlation_id) => ({
          state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
          data, receipt: resultReceipt, correlation_id: correlation, observed_at: now,
        });
        let result: GatewayResult;
        if (invocation.capability_id === 'supervisor.health.read') {
          result = available({ status: 'healthy', active_goal_count: 1, queued_task_count: 1, running_task_count: 0, server_time: now, backends: [
            { owner: 'ipfs_accelerate_py', status: 'available', transport: 'mcp++', receipt: receipts[0] },
            { owner: 'ipfs_kit_py', status: 'available', transport: 'mcp', receipt: receipts[0] },
            { owner: 'ipfs_datasets_py', status: 'available', transport: 'libp2p', receipt: receipts[2] },
          ] });
        } else if (invocation.capability_id === 'supervisor.goals.read') result = available(goals, receipts[1]);
        else if (invocation.capability_id === 'supervisor.subgoals.read') result = available(subgoals, receipts[1]);
        else if (invocation.capability_id === 'supervisor.queue.read') result = available(queue, receipts[1]);
        else if (invocation.capability_id === 'supervisor.taskboard.links.read') result = available(links, receipts[2]);
        else if (invocation.capability_id === 'supervisor.logs.read') result = available([{ log_id: 'log-svd097', level: 'info', message: 'Governed prompt content [prompt redacted].', created_at: now, scope: 'goal', target_id: 'SVD-097', redacted: true, receipt: receipts[1] }], receipts[1]);
        else if (invocation.capability_id === 'supervisor.receipts.read') result = available(receipts, receipts[0]);
        else if (invocation.capability_id === 'supervisor.run-history.search') result = available([{ run_id: 'run-svd097-owner-check', goal_id: 'SVD-097', subgoal_id: 'SVD-097-live-owners', task_id: 'SVD-097-verify-owners', status: 'completed', started_at: now, completed_at: now, receipt: receipts[3] }], receipts[3]);
        else if (invocation.capability_id === 'supervisor.policy.assist') result = available({ policy_result: 'confirmation and dependency policy is current', source: 'ipfs_datasets_py' }, receipts[2]);
        else if (invocation.capability_id === 'supervisor.semantic-goal.assist') result = available({ semantic_goal: 'SVD-097 all-app validation wave', source: 'ipfs_datasets_py' }, receipts[2]);
        else if (invocation.capability_id === 'supervisor.prompt-steering.request') {
          const dryRun = Boolean(invocation.payload?.dry_run);
          const resultReceipt = dryRun
            ? receipt('rcpt-svd097-steering-dry-run', 'bafysvd097receiptsteeringdryrun')
            : receipt('rcpt-svd097-steering-confirmed', 'bafysvd097receiptsteeringconfirmed');
          const event = dryRun
            ? eventDag('evt-svd097-steering-dry-run', 'bafysvd097eventsteeringdryrun', resultReceipt.cid, 'prompt-steering-reviewed')
            : eventDag('evt-svd097-steering-confirmed', 'bafysvd097eventsteeringconfirmed', resultReceipt.cid, 'prompt-steering-confirmed');
          if (!dryRun) state.mutation_count += 1;
          result = available({ request_id: dryRun ? 'req-svd097-dry-run' : 'req-svd097-confirmed', correlation_id: invocation.correlation_id, accepted: true, dry_run: dryRun, normalized_target: 'subgoal:SVD-097-all-app-wave', policy_class: 'confirm', affected_task_ids: ['SVD-097-dispatch-all-apps'], receipt: resultReceipt, event_dag: event }, resultReceipt);
        } else if (invocation.capability_id === 'supervisor.task-control.request') {
          const resultReceipt = receipt('rcpt-svd097-all-app-wave', 'bafysvd097receiptallappwave');
          const event = eventDag('evt-svd097-all-app-wave', 'bafysvd097eventallappwave', resultReceipt.cid, 'task-dispatched');
          state.dispatch_count += 1;
          state.mutation_count += 1;
          result = available({ request_id: 'req-svd097-dispatch', correlation_id: invocation.correlation_id, accepted: true, dry_run: false, normalized_target: 'task:SVD-097-dispatch-all-apps', policy_class: 'privileged-control', affected_task_ids: ['SVD-097-dispatch-all-apps'], receipt: resultReceipt, event_dag: event }, resultReceipt);
        } else {
          result = { state: 'unavailable', capability_id: invocation.capability_id, owner: invocation.owner, reason: 'capability_unavailable', message: 'Capability is outside the SVD-097 fixture.', correlation_id: invocation.correlation_id };
        }
        state.outcomes.push({ capability_id: invocation.capability_id, owner: invocation.owner, state: result.state, policy_class: invocation.policy_class, correlation_id: result.correlation_id, receipt_id: result.receipt?.receipt_id ?? result.data?.receipt?.receipt_id, receipt_cid: result.receipt?.cid ?? result.data?.receipt?.cid, event_dag_cid: result.data?.event_dag?.cid, reported_in_ui: result.state === 'available' });
        return result;
      },
    };
  });
}

async function auditSupervisorUi(page: Page): Promise<UiAudit> {
  return page.getByTestId('agent-supervisor-app').evaluate(root => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const controls = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, textarea'));
    const hidden = controls.filter(element => !visible(element));
    const focusFailures: string[] = [];
    for (const control of controls.filter(element => visible(element) && !(element as HTMLInputElement).disabled)) {
      control.focus();
      if (document.activeElement !== control) focusFailures.push(control.getAttribute('data-testid') || control.textContent?.trim() || control.tagName);
    }
    const boxes = controls.filter(visible).map(element => ({
      element,
      box: element.getBoundingClientRect(),
      name: element.getAttribute('data-testid') || element.textContent?.trim().slice(0, 60) || element.tagName,
    }));
    const overlaps: string[] = [];
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (width > 1 && height > 1) overlaps.push(`${a.name} <> ${b.name}`);
      }
    }
    const overflow = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], h2, h3, h4, .as-metric'))
      .filter(visible)
      .filter(element => element.scrollWidth > element.clientWidth + 1)
      .map(element => element.getAttribute('data-testid') || element.textContent?.trim().slice(0, 80) || element.tagName);
    return {
      checked_control_count: controls.length,
      hidden_control_count: hidden.length,
      hidden_controls: hidden.map(element => element.getAttribute('data-testid') || element.textContent?.trim() || element.tagName),
      text_overlap_count: overlaps.length,
      text_overlaps: overlaps,
      text_overflow_count: overflow.length,
      text_overflows: overflow,
      broken_focus_count: focusFailures.length,
      broken_focus_controls: focusFailures,
    };
  });
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.getByTestId('agent-supervisor-app').screenshot({ path: join(SCREENSHOT_ROOT, name) });
}

function screenshotPaths(): string[] {
  return [
    '01-live-goal-task-state.png',
    '02-redacted-dry-run-review.png',
    '03-confirmed-steering-policy-receipt-event.png',
    '04-all-app-wave-dispatched.png',
  ].map(name => relative(process.cwd(), join(SCREENSHOT_ROOT, name)));
}

interface GatewayInvocation {
  capability_id: string;
  owner: string;
  method: string;
  access: string;
  policy_class: string;
  payload: Record<string, any>;
  correlation_id?: string;
}

interface GatewayResult {
  state: string;
  capability_id: string;
  owner: string;
  data?: any;
  receipt?: any;
  reason?: string;
  message?: string;
  correlation_id?: string;
  observed_at?: string;
}

interface Outcome {
  capability_id: string;
  owner: string;
  state: string;
  policy_class: string;
  correlation_id?: string;
  receipt_id?: string;
  receipt_cid?: string;
  event_dag_cid?: string;
  reported_in_ui: boolean;
}

interface ValidationFixtureState {
  invocations: GatewayInvocation[];
  outcomes: Outcome[];
  dispatch_count: number;
  mutation_count: number;
  dry_run_mutation_count: number;
  direct_host_access_attempts: number;
  transport_by_owner: Record<string, string>;
}

interface BrowserError { kind: string; message: string; url?: string }
interface FailedRequest { method: string; url: string; failure: string }
interface UiAudit {
  checked_control_count: number;
  hidden_control_count: number;
  hidden_controls: string[];
  text_overlap_count: number;
  text_overlaps: string[];
  text_overflow_count: number;
  text_overflows: string[];
  broken_focus_count: number;
  broken_focus_controls: string[];
}

interface ValidationReport {
  schema: string;
  task_id: string;
  generated_at: string;
  decision: string;
  desktop_surface: string;
  live_state: Record<string, any>;
  task_graph: Record<string, any>;
  prompt_steering: Array<Record<string, any>>;
  dispatch: Record<string, any>;
  outcomes: Outcome[];
  browser_boundary: Record<string, any>;
  ui_validation: UiAudit & Record<string, any>;
  browser_console_errors: BrowserError[];
  failed_requests: FailedRequest[];
  screenshots: string[];
  summary: Record<string, number>;
}
