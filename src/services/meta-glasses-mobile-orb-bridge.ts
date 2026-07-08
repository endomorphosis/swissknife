export interface MetaGlassesMobileORBBridgeMessage {
  appId: string;
  action: string;
  payload?: unknown;
  arguments_hash?: string;
}

export class MetaGlassesMobileORBBridge {
  readonly allowed_surfaces = ['mobile', 'meta_glasses', 'mcp_server'] as const;

  route(message: MetaGlassesMobileORBBridgeMessage) {
    return {
      bridge: 'meta-glasses-mobile-orb-bridge',
      agent_identity: 'swissknife:meta-glasses-mobile-operator',
      ...message,
    };
  }
}

export const metaGlassesMobileORBBridge = new MetaGlassesMobileORBBridge();
