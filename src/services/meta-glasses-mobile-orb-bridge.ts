export interface MetaGlassesMobileORBBridgeConfig {
  backendUrl: string;
  mobileBridgeUrl: string;
}

export class MetaGlassesMobileORBBridge {
  constructor(public readonly config: MetaGlassesMobileORBBridgeConfig) {}

  async connect() {
    return {
      connected: true,
      backendUrl: this.config.backendUrl,
      mobileBridgeUrl: this.config.mobileBridgeUrl,
    };
  }
}
