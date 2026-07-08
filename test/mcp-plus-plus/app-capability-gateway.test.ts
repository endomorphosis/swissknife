import {
  AppCapabilityGateway,
  type AppCapabilityExecutionRequest,
  type AppCapabilityTransport,
} from '../../src/services/apps/app-capability-gateway';
import { APP_RESULT_ENVELOPE_SCHEMA } from '../../src/services/apps/app-result-envelope';

class DirectImportTransport implements AppCapabilityTransport {
  readonly mode = 'direct_import' as const;
  calls = 0;

  async invoke<TInput = unknown, TOutput = unknown>(
    request: AppCapabilityExecutionRequest<TInput>,
  ) {
    this.calls += 1;
    return {
      status: 'ok' as const,
      summary: `direct ${request.capability.capability_id}`,
      output: {
        app_id: request.app.id,
        capability_id: request.capability.capability_id,
        input: request.input,
        mode: request.execution_mode,
      } as TOutput,
      artifact_refs: [{
        kind: 'cid' as const,
        uri: 'ipfs://bafybeicapabilitytest',
        cid: 'bafybeicapabilitytest',
      }],
      transport: 'direct-import-test',
    };
  }
}

class MCPPlusPlusTransport implements AppCapabilityTransport {
  readonly mode = 'mcp_plus_plus_remote' as const;

  invoke<TInput = unknown, TOutput = unknown>(
    request: AppCapabilityExecutionRequest<TInput>,
  ) {
    return {
      status: 'ok' as const,
      summary: 'mcp++ remote result',
      output: {
        remote: true,
        capability_id: request.capability.capability_id,
      } as TOutput,
      receipt_refs: [{
        receipt_cid: 'sha256:remote-receipt',
        receipt_schema: 'mcp_server_invocation_receipt_v1',
        service_family: request.capability.service_family,
        capability_id: request.capability.capability_id,
      }],
      event_dag_refs: [{
        event_cid: 'sha256:remote-event',
        parents: request.parent_event_cids,
        event_type: 'mcp_plus_plus_remote_invocation',
      }],
      transport: 'mcp-plus-plus-test',
    };
  }
}

describe('AppCapabilityGateway', () => {
  it('invokes a manifest-declared capability through the selected execution mode', async () => {
    const direct = new DirectImportTransport();
    const gateway = new AppCapabilityGateway({
      transports: [direct],
      idFactory: () => 'corr-fixed',
      now: fixedClock(),
    });

    const envelope = await gateway.invoke({
      app_id: 'terminal',
      capability_id: 'ipfs.kit.storage',
      execution_mode: 'direct_import',
      input: { op: 'status' },
    });

    expect(direct.calls).toBe(1);
    expect(envelope.schema).toBe(APP_RESULT_ENVELOPE_SCHEMA);
    expect(envelope.status).toBe('ok');
    expect(envelope.summary).toBe('direct ipfs.kit.storage');
    expect(envelope.output).toMatchObject({
      app_id: 'terminal',
      capability_id: 'ipfs.kit.storage',
      mode: 'direct_import',
    });
    expect(envelope.artifact_refs[0].cid).toBe('bafybeicapabilitytest');
    expect(envelope.receipt_refs[0].receipt_cid).toMatch(/^sha256:/);
    expect(envelope.event_dag_refs[0].event_cid).toMatch(/^sha256:/);
    expect(envelope.trace.correlation_id).toBe('corr-fixed');
    expect(envelope.trace.execution_mode).toBe('direct_import');
    expect(envelope.trace.service_family).toBe('ipfs_kit_py');
  });

  it('resolves app aliases before capability lookup', async () => {
    const gateway = new AppCapabilityGateway({
      transports: [new DirectImportTransport()],
      idFactory: () => 'corr-alias',
      now: fixedClock(),
    });

    const envelope = await gateway.invoke({
      app_id: 'code-editor',
      capability_id: 'local.editor',
      execution_mode: 'direct_import',
      input: { file: 'main.ts' },
    });

    expect(envelope.status).toBe('ok');
    expect(envelope.trace.requested_app_id).toBe('code-editor');
    expect(envelope.trace.app_id).toBe('vibecode');
    expect(envelope.trace.capability_id).toBe('local.editor');
  });

  it('returns a denied envelope before transport when policy denies', async () => {
    const direct = new DirectImportTransport();
    const gateway = new AppCapabilityGateway({
      transports: [direct],
      idFactory: () => 'corr-denied',
      now: fixedClock(),
    });

    const envelope = await gateway.invoke({
      app_id: 'api-keys',
      capability_id: 'policy.credentials',
      execution_mode: 'direct_import',
      policy_decision: {
        decision: 'deny',
        decision_cid: 'sha256:deny',
        reasons: ['credential action requires phone confirmation'],
      },
    });

    expect(direct.calls).toBe(0);
    expect(envelope.status).toBe('denied');
    expect(envelope.summary).toBe('credential action requires phone confirmation');
    expect(envelope.policy.policy_class).toBe('credential');
    expect(envelope.policy.confirmation_policy).toBe('desktop_or_mobile_only');
    expect(envelope.receipt_refs[0].decision_cid).toBe('sha256:deny');
  });

  it('uses remote MCP++ transports and preserves transport refs', async () => {
    const gateway = new AppCapabilityGateway({
      transports: [new MCPPlusPlusTransport()],
      idFactory: () => 'corr-remote',
      now: fixedClock(),
    });

    const envelope = await gateway.invoke({
      app_id: 'mcp-plus-plus',
      capability_id: 'mcp.gateway',
      execution_mode: 'mcp_plus_plus_remote',
      parent_event_cids: ['sha256:parent'],
    });

    expect(envelope.status).toBe('ok');
    expect(envelope.trace.transport).toBe('mcp-plus-plus-test');
    expect(envelope.trace.execution_mode).toBe('mcp_plus_plus_remote');
    expect(envelope.receipt_refs).toEqual([
      expect.objectContaining({ receipt_cid: 'sha256:remote-receipt' }),
    ]);
    expect(envelope.event_dag_refs).toEqual([
      expect.objectContaining({ event_cid: 'sha256:remote-event', parents: ['sha256:parent'] }),
    ]);
  });

  it('returns error envelopes for unknown capabilities and missing transports', async () => {
    const gateway = new AppCapabilityGateway({ idFactory: () => 'corr-error', now: fixedClock() });

    const unknown = await gateway.invoke({
      app_id: 'terminal',
      capability_id: 'missing.capability',
    });
    expect(unknown.status).toBe('error');
    expect(unknown.error?.code).toBe('CAPABILITY_NOT_FOUND');

    const missingTransport = await gateway.invoke({
      app_id: 'terminal',
      capability_id: 'ipfs.kit.storage',
      execution_mode: 'mcp_remote',
    });
    expect(missingTransport.status).toBe('error');
    expect(missingTransport.error?.code).toBe('TRANSPORT_NOT_FOUND');
  });

  it('normalizes thrown transport errors into stable error envelopes', async () => {
    const broken: AppCapabilityTransport = {
      mode: 'direct_cli',
      invoke() {
        throw new Error('cli unavailable');
      },
    };
    const gateway = new AppCapabilityGateway({
      transports: [broken],
      idFactory: () => 'corr-throw',
      now: fixedClock(),
    });

    const envelope = await gateway.invoke({
      app_id: 'terminal',
      capability_id: 'ipfs.kit.storage',
      execution_mode: 'direct_cli',
    });

    expect(envelope.status).toBe('error');
    expect(envelope.error).toEqual({ code: 'TRANSPORT_ERROR', message: 'cli unavailable' });
    expect(envelope.receipt_refs[0].receipt_cid).toMatch(/^sha256:/);
    expect(envelope.trace.correlation_id).toBe('corr-throw');
  });
});

function fixedClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 7, 12, 0, tick++));
}
