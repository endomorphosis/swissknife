import {
  InterfaceRepository,
  type CompatibilityVerdict,
  type InterfaceDescriptor,
} from './mcp-idl.js';
import {
  assertMCPUIProfileDescriptor,
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
  type InterfaceType,
  type MCPUIProfileDescriptor,
  type TemplateSelection,
} from './mcp-ui-profile.js';
import {
  verifyMCPUIProfileDescriptorTrust,
  type MCPUIDescriptorTrustPolicy,
  type MCPUIDescriptorTrustResult,
} from './mcp-descriptor-trust.js';

export const MCP_INTERFACE_METHODS = {
  list: 'interfaces/list',
  get: 'interfaces/get',
  compat: 'interfaces/compat',
  select: 'interfaces/select',
} as const;

export type MCPInterfaceMethod =
  (typeof MCP_INTERFACE_METHODS)[keyof typeof MCP_INTERFACE_METHODS];

export interface MCPInterfaceRegistryBackend {
  list(): Promise<string[]> | string[];
  get(interfaceCid: string): Promise<Buffer | string | null> | Buffer | string | null;
  compat(interfaceCid: string): Promise<CompatibilityVerdict> | CompatibilityVerdict;
  select?(taskHintCid: string, budget: number): Promise<string[]> | string[];
}

export interface DiscoveredInterface {
  cid: string;
  descriptor: InterfaceDescriptor;
  ui_profile?: MCPUIProfileDescriptor;
  compatible: boolean;
  compatibility: CompatibilityVerdict;
  template?: TemplateSelection;
}

export interface LaunchResolutionRequest {
  app_id?: string;
  interface_type?: InterfaceType;
  preferred_version?: string;
  required_methods?: string[];
  allow_compatibility_fallback?: boolean;
  trust_policy?: MCPUIDescriptorTrustPolicy;
}

export interface LaunchResolution {
  cid: string;
  descriptor: MCPUIProfileDescriptor;
  compatibility: CompatibilityVerdict;
  template: TemplateSelection;
  trust: MCPUIDescriptorTrustResult;
  fallback: boolean;
  reason: string;
}

export class LocalMCPInterfaceRegistryBackend implements MCPInterfaceRegistryBackend {
  constructor(private readonly repository: InterfaceRepository = new InterfaceRepository()) {}

  publish(descriptor: InterfaceDescriptor): string {
    return this.repository.register(descriptor);
  }

  list(): string[] {
    return this.repository.list();
  }

  get(interfaceCid: string): Buffer | null {
    return this.repository.get(interfaceCid);
  }

  compat(interfaceCid: string): CompatibilityVerdict {
    return this.repository.compat(interfaceCid);
  }

  select(taskHintCid: string, budget: number): string[] {
    return this.repository.select(taskHintCid, budget);
  }
}

export class MCPInterfaceDiscoveryRegistry {
  constructor(private readonly backend: MCPInterfaceRegistryBackend) {}

  publish(descriptor: MCPUIProfileDescriptor): string {
    assertMCPUIProfileDescriptor(descriptor);
    if (!isLocalBackend(this.backend)) {
      throw new Error('Descriptor publish requires a writable local MCP interface backend.');
    }
    return this.backend.publish(descriptor);
  }

  async discover(options: { ui_only?: boolean } = {}): Promise<DiscoveredInterface[]> {
    const cids = await this.backend.list();
    const discovered: DiscoveredInterface[] = [];

    for (const cid of cids) {
      const descriptor = await this.getDescriptor(cid);
      if (!descriptor) {
        continue;
      }
      const compatibility = await this.backend.compat(cid);
      const conformance = validateMCPUIProfileDescriptor(descriptor as Partial<MCPUIProfileDescriptor>);
      if (options.ui_only && !conformance.conformant) {
        continue;
      }

      const entry: DiscoveredInterface = {
        cid,
        descriptor,
        compatible: compatibility.compatible,
        compatibility,
      };

      if (conformance.conformant) {
        const uiDescriptor = descriptor as MCPUIProfileDescriptor;
        entry.ui_profile = uiDescriptor;
        entry.template = selectTemplateForDescriptor(uiDescriptor);
      }

      discovered.push(entry);
    }

    return discovered.sort((a, b) => compareDiscoveredInterfaces(a, b));
  }

  async getDescriptor(interfaceCid: string): Promise<InterfaceDescriptor | null> {
    const payload = await this.backend.get(interfaceCid);
    if (payload === null) {
      return null;
    }
    return decodeDescriptor(payload);
  }

  async resolveForLaunch(request: LaunchResolutionRequest): Promise<LaunchResolution | null> {
    const discovered = await this.discover({ ui_only: true });
    const candidates = discovered
      .filter((entry): entry is DiscoveredInterface & { ui_profile: MCPUIProfileDescriptor; template: TemplateSelection } => {
        return entry.ui_profile !== undefined && entry.template !== undefined;
      })
      .filter(entry => matchesLaunchRequest(entry.ui_profile, request))
      .filter(entry => trustAllowsLaunch(entry.ui_profile, request.trust_policy));

    const compatible = candidates
      .filter(entry => entry.compatible)
      .sort((a, b) => compareVersions(b.ui_profile.version, a.ui_profile.version));

    const exact = request.preferred_version
      ? compatible.find(entry => entry.ui_profile.version === request.preferred_version)
      : undefined;
    const selected = exact ?? compatible[0];
    if (selected) {
      return {
        cid: selected.cid,
        descriptor: selected.ui_profile,
        compatibility: selected.compatibility,
        template: selected.template,
        trust: verifyMCPUIProfileDescriptorTrust(selected.ui_profile, request.trust_policy),
        fallback: exact === undefined && request.preferred_version !== undefined,
        reason: exact ? 'preferred version matched' : 'latest compatible descriptor selected',
      };
    }

    if (request.allow_compatibility_fallback === false) {
      return null;
    }

    const fallback = await this.findCompatibilityFallback(candidates, request);
    if (fallback) {
      return fallback;
    }

    return null;
  }

  async call(method: MCPInterfaceMethod, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (method) {
      case MCP_INTERFACE_METHODS.list:
        return this.backend.list();
      case MCP_INTERFACE_METHODS.get:
        return this.backend.get(String(params.interface_cid ?? ''));
      case MCP_INTERFACE_METHODS.compat:
        return this.backend.compat(String(params.interface_cid ?? ''));
      case MCP_INTERFACE_METHODS.select:
        if (!this.backend.select) {
          throw new Error('interfaces/select is not supported by this backend.');
        }
        return this.backend.select(String(params.task_hint_cid ?? ''), Number(params.budget ?? 20));
      default:
        return assertNever(method);
    }
  }

  private async findCompatibilityFallback(
    candidates: Array<DiscoveredInterface & { ui_profile: MCPUIProfileDescriptor; template: TemplateSelection }>,
    request: LaunchResolutionRequest,
  ): Promise<LaunchResolution | null> {
    const suggested = new Set<string>();
    for (const candidate of candidates) {
      for (const cid of candidate.compatibility.suggestedAlternatives) {
        suggested.add(cid);
      }
      for (const cid of getDeclaredCompatibilityCids(candidate.ui_profile)) {
        suggested.add(cid);
      }
    }

    for (const cid of suggested) {
      const descriptor = await this.getDescriptor(cid);
      if (!descriptor) {
        continue;
      }
      const conformance = validateMCPUIProfileDescriptor(descriptor as Partial<MCPUIProfileDescriptor>);
      if (!conformance.conformant) {
        continue;
      }
      const uiDescriptor = descriptor as MCPUIProfileDescriptor;
      if (!matchesLaunchRequest(uiDescriptor, { ...request, preferred_version: undefined })) {
        continue;
      }
      if (!trustAllowsLaunch(uiDescriptor, request.trust_policy)) {
        continue;
      }
      const compatibility = await this.backend.compat(cid);
      if (!compatibility.compatible) {
        continue;
      }
      return {
        cid,
        descriptor: uiDescriptor,
        compatibility,
        template: selectTemplateForDescriptor(uiDescriptor),
        trust: verifyMCPUIProfileDescriptorTrust(uiDescriptor, request.trust_policy),
        fallback: true,
        reason: 'compatibility fallback selected',
      };
    }

    return null;
  }
}

function trustAllowsLaunch(
  descriptor: MCPUIProfileDescriptor,
  policy?: MCPUIDescriptorTrustPolicy,
): boolean {
  return verifyMCPUIProfileDescriptorTrust(descriptor, policy).launch_allowed;
}

function matchesLaunchRequest(
  descriptor: MCPUIProfileDescriptor,
  request: LaunchResolutionRequest,
): boolean {
  if (request.app_id && descriptor.meta.app_id !== request.app_id) {
    return false;
  }
  if (request.interface_type && !descriptor.services.some(service => service.interface_type === request.interface_type)) {
    return false;
  }
  if (request.required_methods) {
    const methods = new Set(descriptor.methods.map(method => method.name));
    for (const method of request.required_methods) {
      if (!methods.has(method)) {
        return false;
      }
    }
  }
  return true;
}

function compareDiscoveredInterfaces(a: DiscoveredInterface, b: DiscoveredInterface): number {
  const name = a.descriptor.name.localeCompare(b.descriptor.name);
  if (name !== 0) {
    return name;
  }
  return compareVersions(b.descriptor.version, a.descriptor.version);
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return a.localeCompare(b);
}

function parseVersion(version: string): number[] {
  return version
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0));
}

function decodeDescriptor(payload: Buffer | string): InterfaceDescriptor {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
  return JSON.parse(text) as InterfaceDescriptor;
}

function getDeclaredCompatibilityCids(descriptor: InterfaceDescriptor): string[] {
  return [
    ...(descriptor.compatibility.compatibleWith ?? []),
    ...(descriptor.compatibility.compatible_with ?? []),
    ...(descriptor.compatibility.supersedes ?? []),
  ];
}

function isLocalBackend(
  backend: MCPInterfaceRegistryBackend,
): backend is LocalMCPInterfaceRegistryBackend {
  return backend instanceof LocalMCPInterfaceRegistryBackend;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported MCP interface method: ${String(value)}`);
}
