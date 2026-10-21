'use strict';
/** Count actual route attempts separately from complete gateway observations.
 * Binding projections are identities; they are never stripped into tool names.
 */
const ROUTE = '/mcp/tools/call';
const PROTOCOL = 'swissknife.all-app-tool-gateway.v1';
const text = value => typeof value === 'string' && value.length > 0;

function gatewayEnvelopePost(post) {
  return Boolean(post && post.protocol === PROTOCOL && post.route === ROUTE && post.receipt_required === true
    && ['app_id', 'binding_id', 'owner', 'tool_id', 'correlation_id'].every(name => text(post[name]))
    && ['http', 'libp2p'].includes(post.transport) && post.input?.correlation_id === post.correlation_id
    && ['allow', 'deny', 'require_confirmation'].includes(post.input?.policy?.outcome)
    && typeof post.input?.policy?.dry_run === 'boolean');
}

function summarizeCallEvidence(calls) {
  const toolCalls = calls.filter(call => call.kind === 'tools-call' && call.pathname === ROUTE);
  const gatewayCalls = toolCalls.filter(call => gatewayEnvelopePost(call.post));
  return {
    toolCalls,
    gatewayCalls,
    newestGatewayCall: gatewayCalls.at(-1) || null,
    incompleteCallCount: toolCalls.length - gatewayCalls.length,
    privateCalls: calls.filter(call => call.kind === 'private-artifact'),
  };
}

function matchExpectedInvocation({ appId, expectedToolId, selector, observation, call }, contract) {
  const fail = reason => ({ matches: false, reason });
  if (!gatewayEnvelopePost(call)) return fail('gateway-envelope-incomplete');
  if (!observation || observation.route !== ROUTE) return fail('observation-incomplete');
  if (call.app_id !== appId) return fail('originating-app-mismatch');
  for (const name of ['tool_id', 'transport', 'correlation_id']) {
    if (call[name] !== observation[name]) return fail(`observation-${name}-mismatch`);
  }
  if (call.input.policy.dry_run !== observation.dry_run || call.input.policy.outcome !== observation.policy_outcome) return fail('observation-policy-mismatch');
  const app = contract?.apps?.find(app => app.app_id === appId);
  const binding = app?.backend_bindings?.find(binding => binding.binding_id === call.binding_id);
  if (!binding) return fail('executable-binding-unknown');
  if (binding.owner !== call.owner) return fail('executable-owner-mismatch');
  if (!binding.tool_selection?.preferred_tool_ids?.includes(call.tool_id)) return fail('executable-exact-tool-mismatch');
  if (!binding.transport_policy?.allowed_transports?.includes(call.transport)) return fail('executable-transport-mismatch');

  const selectorBinding = String(selector || '').match(/\[data-live-gateway-binding\s*=\s*['"]([^'"]+)['"]\]/)?.[1];
  if (selectorBinding && selectorBinding !== binding.binding_id) return fail('originating-control-binding-mismatch');
  if (!expectedToolId) return { matches: true, reason: 'reviewed-executable-binding' };
  const projected = app.backend_bindings.find(item => expectedToolId === `mcp++:${item.binding_id}` || expectedToolId === item.binding_id);
  if (projected) {
    return projected.binding_id === binding.binding_id
      ? { matches: true, reason: 'exact-projected-binding-and-reviewed-tool' }
      : fail('expected-binding-mismatch');
  }
  // An unknown projection naming this app cannot fall back to tool-name
  // stripping. Exact raw tool IDs remain supported for the original runner.
  if (String(expectedToolId).startsWith(`mcp++:${appId}.`) || String(expectedToolId).startsWith(`${appId}.`)) return fail('expected-binding-unknown');
  const raw = String(expectedToolId).replace(/^mcp\+\+[:/]/, '');
  const owners = Array.isArray(contract.backend_owners) ? contract.backend_owners : [];
  const owner = owners.find(owner => raw.startsWith(`${owner}:`) || raw.startsWith(`${owner}/`));
  if (owner) {
    if (owner !== call.owner) return fail('expected-tool-owner-mismatch');
    if (raw.slice(owner.length + 1) !== call.tool_id) return fail('expected-exact-tool-mismatch');
  } else if (raw !== call.tool_id) return fail('expected-exact-tool-mismatch');
  return { matches: true, reason: 'exact-tool-and-reviewed-binding' };
}
module.exports = { gatewayEnvelopePost, summarizeCallEvidence, matchExpectedInvocation };
