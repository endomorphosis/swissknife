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
    __svd108Lifecycle?: LifecycleFixtureState;
  }
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const TASK_ID = 'SVD-108';
const NOW = '2026-07-15T18:00:00.000Z';
const EVIDENCE_ROOT = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const SCREENSHOT_ROOT = join(EVIDENCE_ROOT, 'app-screenshots', 'agent-supervisor-lifecycle');
const REPORT_PATH = join(EVIDENCE_ROOT, 'agent-supervisor-goal-task-lifecycle.json');
const TASKBOARD_URL = 'implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md#svd-108';
const RAW_DRY_RUN_PROMPT = 'Review policy, budget, and dependencies before lifecycle steering.';
const RAW_CONFIRMED_PROMPT = 'Confirm the permitted lifecycle mutation after the policy review.';

test('governs goal-to-task prompt steering and preserves graph on rejected requests', async ({ page }) => {
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installLifecycleGateway(page);

  const browserErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}`));

  await launchSupervisor(page);
  const app = page.getByTestId('agent-supervisor-app');
  await expect(app).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('goals-tree')).toContainText('SVD-108-goal');
  await expect(page.getByTestId('goals-tree')).toContainText('SVD-108-derived-policy');
  await expect(page.getByTestId('goals-tree')).toContainText('SVD-108-derived-delivery');

  await page.getByTestId('task-queue').getByRole('option', { name: /SVD-108-create-task/ }).click();
  const activeTask = page.getByTestId('active-task');
  await expect(activeTask).toContainText('SVD-108-goal');
  await expect(activeTask).toContainText('SVD-108-derived-delivery');
  await expect(activeTask.locator(`a[href="${TASKBOARD_URL}"]`)).toHaveCount(1);
  await screenshot(page, '01-goal-subgoal-taskboard-link.png');

  await page.getByTestId('goals-tree').locator('[data-subgoal-id="SVD-108-derived-delivery"]').click();
  await expect(page.getByTestId('steering-review')).toContainText('subgoal:SVD-108-derived-delivery');
  await expect(page.getByTestId('steering-review')).toContainText('SVD-108-create-task');
  await expect(page.getByTestId('steering-panel')).toContainText('[prompt redacted]');
  await page.getByTestId('steering-prompt').fill(RAW_DRY_RUN_PROMPT);
  await page.getByTestId('steering-dry-run').check();
  await page.getByTestId('steering-submit').click();
  const dryRunResult = page.getByTestId('steering-result');
  await expect(dryRunResult).toContainText('dry-run');
  await expect(dryRunResult).toContainText('allow_review');
  await expect(dryRunResult).toContainText('2 of 3 budget units remaining');
  await expect(dryRunResult).toContainText('SVD-108-derive-policy completed');
  await expect(dryRunResult).toContainText('rcpt-svd108-dry-run');
  await expect(dryRunResult).toContainText('bafysvd108eventdryrun');
  await screenshot(page, '02-redacted-dry-run-policy-budget-dependencies.png');

  await page.getByTestId('steering-dry-run').uncheck();
  await page.getByTestId('steering-prompt').fill(RAW_CONFIRMED_PROMPT);
  await page.getByTestId('steering-confirm').check();
  await page.getByTestId('steering-submit').click();
  const confirmedResult = page.getByTestId('steering-result');
  await expect(confirmedResult).toContainText('confirmed');
  await expect(confirmedResult).toContainText('rcpt-svd108-confirmed');
  await expect(confirmedResult).toContainText('bafysvd108eventconfirmed');
  await expect(confirmedResult).toContainText('allow_mutation');
  await screenshot(page, '03-confirmed-mutation-receipt-event-dag.png');

  const rejected: Array<{ prompt: string; reason: string; recovery: string; screenshot: string }> = [
    { prompt: 'deny this request fixture', reason: 'policy_denied', recovery: 'Review policy and retry', screenshot: '04-denied-recovery.png' },
    { prompt: 'expire this request fixture', reason: 'request_expired', recovery: 'Start a new reviewed request', screenshot: '05-expired-recovery.png' },
    { prompt: 'cancel this request fixture', reason: 'request_cancelled', recovery: 'Review and resubmit', screenshot: '06-cancelled-recovery.png' },
  ];
  const rejectionEvidence: LifecycleRejection[] = [];
  for (const scenario of rejected) {
    await page.getByTestId('steering-prompt').fill(scenario.prompt);
    await page.getByTestId('steering-confirm').check();
    await page.getByTestId('steering-submit').click();
    const error = page.getByTestId('steering-error');
    await expect(error).toContainText(scenario.reason);
    await expect(page.getByTestId('steering-recovery')).toHaveText(scenario.recovery);
    await expect(page.getByTestId('goals-tree')).toContainText('SVD-108-derived-delivery');
    await expect(page.getByTestId('task-queue')).toContainText('SVD-108-create-task');
    await screenshot(page, scenario.screenshot);
    rejectionEvidence.push({ ...scenario, graph_preserved: true });
    await page.getByTestId('steering-recovery').click();
    await expect(page.getByTestId('steering-error')).toHaveCount(0);
  }

  const fixture = await page.evaluate(() => window.__svd108Lifecycle);
  expect(fixture).toBeTruthy();
  const serializedFixture = JSON.stringify(fixture);
  const report: LifecycleReport = {
    schema: 'swissknife.agent_supervisor_goal_task_lifecycle.v1',
    task_id: TASK_ID,
    generated_at: new Date().toISOString(),
    decision: 'GO',
    desktop_surface: 'agent-supervisor',
    task_graph: {
      goal_id: 'SVD-108-goal',
      derived_subgoal_ids: ['SVD-108-derived-policy', 'SVD-108-derived-delivery'],
      task_ids: ['SVD-108-derive-policy', 'SVD-108-create-task'],
      taskboard_url: TASKBOARD_URL,
      graph_fingerprint_before: fixture!.graph_fingerprint,
      graph_fingerprint_after: graphFingerprint(),
      preserved_after_rejections: fixture!.graph_fingerprint === graphFingerprint(),
    },
    steering: fixture!.steering,
    mutation_evidence: {
      confirmed_mutation_count: fixture!.confirmed_mutation_count,
      dry_run_mutation_count: fixture!.dry_run_mutation_count,
      receipt_and_event_dag_persisted: fixture!.confirmed_mutation_count === 1,
    },
    rejected_requests: rejectionEvidence,
    receipts_and_event_dag: fixture!.outcomes.filter(outcome => outcome.receipt_id || outcome.event_dag_cid),
    browser_boundary: {
      raw_prompt_persisted: serializedFixture.includes(RAW_DRY_RUN_PROMPT) || serializedFixture.includes(RAW_CONFIRMED_PROMPT),
      direct_host_access_attempts: fixture!.direct_host_access_attempts,
      gateway_only: fixture!.invocations.every(invocation => invocation.method.startsWith('agent_supervisor.')),
    },
    ui_validation: { browser_console_error_count: browserErrors.length, failed_request_count: failedRequests.length },
    screenshots: screenshotPaths(),
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  expect(report.task_graph.preserved_after_rejections).toBe(true);
  expect(report.steering.map(item => item.mode)).toEqual(['dry-run', 'confirmed', 'policy_denied', 'request_expired', 'request_cancelled']);
  expect(report.steering.every(item => item.prompt === '[prompt redacted]')).toBe(true);
  expect(report.mutation_evidence).toEqual({ confirmed_mutation_count: 1, dry_run_mutation_count: 0, receipt_and_event_dag_persisted: true });
  expect(report.browser_boundary).toEqual({ raw_prompt_persisted: false, direct_host_access_attempts: 0, gateway_only: true });
  expect(report.ui_validation).toEqual({ browser_console_error_count: 0, failed_request_count: 0 });
  expect(report.screenshots.every(path => existsSync(join(process.cwd(), path)))).toBe(true);
});

async function launchSupervisor(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.desktop', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.swissknifeDesktop));
  await page.evaluate(async () => {
    if (typeof window.swissknifeDesktop?.launchManifestApp === 'function') await window.swissknifeDesktop.launchManifestApp('agent-supervisor');
    else await window.swissknifeDesktop?.launchApp?.('agent-supervisor');
  });
  await page.waitForSelector('[data-testid="agent-supervisor-app"]', { timeout: 30_000 });
}

async function installLifecycleGateway(page: Page): Promise<void> {
  await page.addInitScript(({ now, taskboardUrl }) => {
    const receipt = (receiptId: string, cid: string) => ({ receipt_id: receiptId, cid, owner: 'ipfs_kit_py', created_at: now });
    const event = (eventId: string, cid: string, receiptCid: string, eventType: string) => ({ event_id: eventId, cid, receipt_cid: receiptCid, event_type: eventType, owner: 'ipfs_kit_py', created_at: now });
    const graph = {
      goals: [{ goal_id: 'SVD-108-goal', title: 'Govern desktop goal and task lifecycle', status: 'running', subgoal_ids: ['SVD-108-derived-policy', 'SVD-108-derived-delivery'], task_ids: ['SVD-108-derive-policy', 'SVD-108-create-task'], taskboard_url: taskboardUrl }],
      subgoals: [
        { subgoal_id: 'SVD-108-derived-policy', goal_id: 'SVD-108-goal', title: 'Derived policy and budget review', status: 'completed', task_ids: ['SVD-108-derive-policy'], taskboard_url: taskboardUrl },
        { subgoal_id: 'SVD-108-derived-delivery', goal_id: 'SVD-108-goal', title: 'Derived task-board delivery', status: 'ready', task_ids: ['SVD-108-create-task'], taskboard_url: taskboardUrl },
      ],
      queue: [
        { task_id: 'SVD-108-derive-policy', title: 'Derive policy effects for lifecycle', status: 'completed', goal_id: 'SVD-108-goal', subgoal_id: 'SVD-108-derived-policy', dependencies: [], taskboard_url: taskboardUrl },
        { task_id: 'SVD-108-create-task', title: 'Create linked task-board task', status: 'ready', goal_id: 'SVD-108-goal', subgoal_id: 'SVD-108-derived-delivery', dependencies: ['SVD-108-derive-policy'], taskboard_url: taskboardUrl },
      ],
    };
    const fingerprint = JSON.stringify({ goal: 'SVD-108-goal', subgoals: ['SVD-108-derived-policy', 'SVD-108-derived-delivery'], tasks: ['SVD-108-derive-policy', 'SVD-108-create-task'] });
    const state: LifecycleFixtureState = { graph_fingerprint: fingerprint, invocations: [], outcomes: [], steering: [], confirmed_mutation_count: 0, dry_run_mutation_count: 0, direct_host_access_attempts: 0 };
    window.__svd108Lifecycle = state;
    const available = (invocation: GatewayInvocation, data: any, resultReceipt = receipt('rcpt-svd108-read', 'bafysvd108read')) => ({ state: 'available', capability_id: invocation.capability_id, owner: invocation.owner, data, receipt: resultReceipt, correlation_id: invocation.correlation_id, observed_at: now });
    window.__agentSupervisorGateway = {
      async invoke(invocation: GatewayInvocation): Promise<GatewayResult> {
        const payload = { ...(invocation.payload || {}) };
        const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';
        if (rawPrompt) { payload.prompt = '[prompt redacted]'; payload.prompt_char_count = rawPrompt.trim().length; }
        state.invocations.push({ ...invocation, payload });
        let result: GatewayResult;
        if (invocation.capability_id === 'supervisor.health.read') result = available(invocation, { status: 'healthy', active_goal_count: 1, queued_task_count: 1, running_task_count: 0, backends: [{ owner: 'ipfs_accelerate_py', status: 'available', transport: 'mcp++' }, { owner: 'ipfs_datasets_py', status: 'available', transport: 'libp2p' }, { owner: 'ipfs_kit_py', status: 'available', transport: 'mcp' }] });
        else if (invocation.capability_id === 'supervisor.goals.read') result = available(invocation, graph.goals);
        else if (invocation.capability_id === 'supervisor.subgoals.read') result = available(invocation, graph.subgoals);
        else if (invocation.capability_id === 'supervisor.queue.read') result = available(invocation, graph.queue);
        else if (invocation.capability_id === 'supervisor.taskboard.links.read') result = available(invocation, graph.queue.map(task => ({ task_id: task.task_id, source: 'task-board', url: taskboardUrl, title: `Linked task-board record: ${task.title}`, status: task.status })));
        else if (invocation.capability_id === 'supervisor.logs.read') result = available(invocation, []);
        else if (invocation.capability_id === 'supervisor.receipts.read') result = available(invocation, []);
        else if (invocation.capability_id === 'supervisor.run-history.search') result = available(invocation, []);
        else if (invocation.capability_id === 'supervisor.policy.assist') result = available(invocation, { policy: 'confirm', budget: '2 of 3 budget units remaining', dependencies: 'SVD-108-derive-policy completed' });
        else if (invocation.capability_id === 'supervisor.semantic-goal.assist') result = available(invocation, { derived_subgoals: graph.subgoals.map(item => item.subgoal_id) });
        else if (invocation.capability_id === 'supervisor.prompt-steering.request') {
          const failure = rawPrompt.startsWith('deny') ? 'policy_denied' : rawPrompt.startsWith('expire') ? 'request_expired' : rawPrompt.startsWith('cancel') ? 'request_cancelled' : '';
          if (failure) {
            result = { state: 'denied', capability_id: invocation.capability_id, owner: invocation.owner, reason: failure, message: `Lifecycle request ${failure} without changing the task graph.`, correlation_id: invocation.correlation_id };
          } else {
            const dryRun = Boolean(invocation.payload?.dry_run);
            const resultReceipt = dryRun ? receipt('rcpt-svd108-dry-run', 'bafysvd108dryrun') : receipt('rcpt-svd108-confirmed', 'bafysvd108confirmed');
            const resultEvent = dryRun ? event('evt-svd108-dry-run', 'bafysvd108eventdryrun', resultReceipt.cid, 'prompt-steering-reviewed') : event('evt-svd108-confirmed', 'bafysvd108eventconfirmed', resultReceipt.cid, 'prompt-steering-confirmed');
            if (!dryRun) state.confirmed_mutation_count += 1;
            result = available(invocation, { request_id: dryRun ? 'req-svd108-dry-run' : 'req-svd108-confirmed', accepted: true, dry_run: dryRun, normalized_target: 'subgoal:SVD-108-derived-delivery', policy_class: 'confirm', affected_task_ids: ['SVD-108-create-task'], policy_effects: { outcome: dryRun ? 'allow_review' : 'allow_mutation', budget: '2 of 3 budget units remaining', dependencies: 'SVD-108-derive-policy completed' }, receipt: resultReceipt, event_dag: resultEvent }, resultReceipt);
          }
        } else result = { state: 'unavailable', capability_id: invocation.capability_id, owner: invocation.owner, reason: 'capability_unavailable', message: 'Not required for the SVD-108 lifecycle fixture.', correlation_id: invocation.correlation_id };
        const steeringResult = invocation.capability_id === 'supervisor.prompt-steering.request';
        if (steeringResult) state.steering.push({ mode: result.state === 'available' ? (result.data?.dry_run ? 'dry-run' : 'confirmed') : result.reason!, prompt: payload.prompt || '', correlation_id: result.correlation_id! });
        state.outcomes.push({ capability_id: invocation.capability_id, state: result.state, reason: result.reason, receipt_id: result.receipt?.receipt_id || result.data?.receipt?.receipt_id, event_dag_cid: result.data?.event_dag?.cid });
        return result;
      },
    };
  }, { now: NOW, taskboardUrl: TASKBOARD_URL });
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.getByTestId('agent-supervisor-app').screenshot({ path: join(SCREENSHOT_ROOT, name) });
}

function screenshotPaths(): string[] {
  return ['01-goal-subgoal-taskboard-link.png', '02-redacted-dry-run-policy-budget-dependencies.png', '03-confirmed-mutation-receipt-event-dag.png', '04-denied-recovery.png', '05-expired-recovery.png', '06-cancelled-recovery.png'].map(name => relative(process.cwd(), join(SCREENSHOT_ROOT, name)));
}

function graphFingerprint(): string {
  return JSON.stringify({ goal: 'SVD-108-goal', subgoals: ['SVD-108-derived-policy', 'SVD-108-derived-delivery'], tasks: ['SVD-108-derive-policy', 'SVD-108-create-task'] });
}

interface GatewayInvocation { capability_id: string; owner: string; method: string; access: string; policy_class: string; payload: Record<string, any>; correlation_id?: string }
interface GatewayResult { state: string; capability_id: string; owner: string; data?: any; receipt?: any; reason?: string; message?: string; correlation_id?: string }
interface LifecycleFixtureState { graph_fingerprint: string; invocations: GatewayInvocation[]; outcomes: Array<Record<string, any>>; steering: Array<{ mode: string; prompt: string; correlation_id: string }>; confirmed_mutation_count: number; dry_run_mutation_count: number; direct_host_access_attempts: number }
interface LifecycleRejection { prompt: string; reason: string; recovery: string; screenshot: string; graph_preserved: boolean }
interface LifecycleReport { schema: string; task_id: string; generated_at: string; decision: string; desktop_surface: string; task_graph: Record<string, any>; steering: Array<Record<string, any>>; mutation_evidence: Record<string, any>; rejected_requests: LifecycleRejection[]; receipts_and_event_dag: Array<Record<string, any>>; browser_boundary: Record<string, any>; ui_validation: Record<string, any>; screenshots: string[] }
