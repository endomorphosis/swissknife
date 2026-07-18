import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  type ExecutableBackendBinding,
  type MediatedInvocationRequest,
} from '../apps/all-app-executable-backend-contract.js';
import {
  ALL_APP_LIVE_TOOL_BINDINGS,
  getAllAppLiveToolBinding,
  invokeAllAppLiveToolBinding,
  type AllAppLiveToolBinding,
} from '../apps/all-app-live-tool-bindings.js';
import {
  AllAppToolGateway,
  createAllAppToolHttpGatewayTransport,
  type AllAppToolGatewayResult,
} from './all-app-tool-gateway.js';

/** Public browser bootstrap for the desktop's per-binding controls. */
export interface VirtualDesktopLiveGatewayBootstrapOptions {
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  correlationId?: (binding: AllAppLiveToolBinding) => string;
}

export interface VirtualDesktopBindingControl {
  binding: AllAppLiveToolBinding;
  label: string;
  owner: string;
  selected_tool_id: string;
  mutates_remote_state: boolean;
  confirmation_required: boolean;
}

export interface VirtualDesktopBindingInvocation {
  payload?: Readonly<Record<string, unknown>>;
  consent?: 'granted' | 'denied' | 'not_required';
  dry_run?: boolean;
  correlation_id?: string;
}

export class VirtualDesktopLiveGateway {
  private readonly gateway: AllAppToolGateway;
  private readonly now: () => Date;
  private readonly correlationId: (binding: AllAppLiveToolBinding) => string;

  constructor(options: VirtualDesktopLiveGatewayBootstrapOptions = {}) {
    this.gateway = new AllAppToolGateway({
      http: createAllAppToolHttpGatewayTransport({ fetch: options.fetch }),
      now: options.now,
    });
    this.now = options.now ?? (() => new Date());
    this.correlationId = options.correlationId ?? (binding =>
      `desktop:${binding.binding_id}:${this.now().getTime()}:${Math.random().toString(36).slice(2, 10)}`);
  }

  controlsForApp(appId: string): VirtualDesktopBindingControl[] {
    return ALL_APP_LIVE_TOOL_BINDINGS.bindings
      .filter(binding => binding.app_id === appId)
      .map(binding => controlFor(binding));
  }

  async invoke(bindingId: string, invocation: VirtualDesktopBindingInvocation = {}): Promise<AllAppToolGatewayResult> {
    const binding = getAllAppLiveToolBinding(bindingId);
    if (!binding) throw new Error(`Unknown virtual desktop binding: ${bindingId}`);
    const control = controlFor(binding);
    const governed = control.mutates_remote_state;
    const dryRun = invocation.dry_run ?? governed;
    const consent = invocation.consent ?? (governed ? 'granted' : 'not_required');
    const request: Omit<MediatedInvocationRequest, 'app_id' | 'intent_id' | 'owner'> = {
      correlation_id: invocation.correlation_id ?? this.correlationId(binding),
      payload: invocation.payload ?? narrowInput(control, binding),
      consent,
      dry_run: dryRun,
      policy_decision: {
        decision_id: `desktop-policy:${binding.binding_id}`,
        outcome: consent === 'denied' ? 'deny' : 'allow',
        reason: governed
          ? 'Governed desktop control is executing as an explicit dry-run.'
          : 'Narrow non-mutating desktop read request.',
      },
      discovered_tools: [{ owner: binding.owner, tool_id: control.selected_tool_id }],
      available_transports: ['http'],
    };
    return invokeAllAppLiveToolBinding(bindingId, request, this.gateway);
  }
}

export function bootstrapVirtualDesktopLiveGateway(
  options?: VirtualDesktopLiveGatewayBootstrapOptions,
): VirtualDesktopLiveGateway {
  return new VirtualDesktopLiveGateway(options);
}

function controlFor(binding: AllAppLiveToolBinding): VirtualDesktopBindingControl {
  const app = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(candidate => candidate.app_id === binding.app_id);
  const source = app?.backend_bindings.find(candidate => candidate.binding_id === binding.binding_id);
  if (!source) throw new Error(`Live binding ${binding.binding_id} has no executable source binding.`);
  return {
    binding, label: source.ui_control.label, owner: source.owner, selected_tool_id: source.tool_selection.preferred_tool_ids[0],
    mutates_remote_state: source.mediated_intent.mutates_remote_state,
    confirmation_required: source.ui_control.confirmation !== 'none',
  };
}

function narrowInput(control: VirtualDesktopBindingControl, binding: AllAppLiveToolBinding): Record<string, unknown> {
  return control.mutates_remote_state
    ? { dry_run: true, scope: binding.capability_id, limit: 1 }
    : { scope: binding.capability_id, limit: 1, cursor: 'desktop-read-only' };
}
