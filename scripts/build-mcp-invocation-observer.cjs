#!/usr/bin/env node
/**
 * VDG-013: freeze the shared MCP++ observation shape.
 *
 * Gateway buttons and native controls both pass through observeMcpInvocation.
 * This writer does not click a control and does not edit the gateway panel.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const helperPath = process.env.VDG_OBSERVER_OUT
  ? path.resolve(process.env.VDG_OBSERVER_OUT)
  : path.join(projectRoot, 'test', 'e2e', 'helpers', 'mcp-invocation-observer.ts');

const source = `import type { AllAppToolGatewayResult } from '../../../src/services/mcp/all-app-tool-gateway';

/** Same-origin MCP++ route. Counts and screenshots are not observations. */
export const MCP_INVOCATION_OBSERVATION_ROUTE = '/mcp/tools/call' as const;

export const MCP_OWNER_OUTCOMES = ['executed', 'unsupported', 'failed', 'denied', 'unreachable'] as const;
export type McpOwnerOutcome = (typeof MCP_OWNER_OUTCOMES)[number] | '';

export function closedOwnerOutcome(value: unknown): McpOwnerOutcome {
  const text = typeof value === 'string' ? value : '';
  return (MCP_OWNER_OUTCOMES as readonly string[]).includes(text) ? text as McpOwnerOutcome : '';
}

export interface McpInvocationObservation {
  route: typeof MCP_INVOCATION_OBSERVATION_ROUTE | string;
  tool_id: string;
  transport: string;
  correlation_id: string;
  dry_run: boolean;
  receipt_id: string;
  event_dag_cid: string;
  outcome: McpOwnerOutcome;
  origin: 'gateway-button' | 'native-control';
}

function receiptFields(result: AllAppToolGatewayResult): { receipt_id: string; event_dag_cid: string } {
  const body = result.response && result.response.response;
  const receipt = body && typeof body === 'object'
    ? (body as { receipt?: { receipt_id?: string; event_dag_refs?: string[] } }).receipt
    : undefined;
  return {
    receipt_id: receipt && receipt.receipt_id ? receipt.receipt_id : '',
    event_dag_cid: receipt && receipt.event_dag_refs && receipt.event_dag_refs[0]
      ? receipt.event_dag_refs[0]
      : '',
  };
}

/**
 * One observation for a gateway button and for a native control.
 * Callers pass the gateway result either path already produced.
 */
export function observeMcpInvocation(
  result: AllAppToolGatewayResult,
  options: { origin: McpInvocationObservation['origin']; dry_run: boolean },
): McpInvocationObservation {
  const receipt = receiptFields(result);
  const response = result.response && result.response.response;
  const responseOutcome = response && typeof response === 'object'
    ? (response as { outcome?: unknown }).outcome
    : undefined;
  return {
    route: result.request && result.request.route
      ? result.request.route
      : MCP_INVOCATION_OBSERVATION_ROUTE,
    tool_id: result.tool_id || '',
    transport: result.transport || '',
    correlation_id: result.correlation_id,
    dry_run: options.dry_run,
    receipt_id: receipt.receipt_id,
    event_dag_cid: receipt.event_dag_cid,
    outcome: closedOwnerOutcome(responseOutcome),
    origin: options.origin,
  };
}
`;

const required = [
  'route',
  'tool_id',
  'transport',
  'correlation_id',
  'dry_run',
  'receipt_id',
  'event_dag_cid',
  'outcome',
  'closedOwnerOutcome',
  'gateway-button',
  'native-control',
  '/mcp/tools/call',
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`observer missing ${token}`);
}

fs.mkdirSync(path.dirname(helperPath), { recursive: true });
fs.writeFileSync(helperPath, source);
process.stdout.write(`${JSON.stringify({
  decision: 'observer_written',
  bytes: Buffer.byteLength(source),
  clicked: false,
  output: path.relative(projectRoot, helperPath),
})}\n`);
