import { DIDKeystore } from '../../src/auth/did-keystore';
import { InterfaceRepository } from '../../src/services/mcp/mcp-idl';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
} from '../../src/services/mcp/mcp-interface-registry';
import {
  assertMCPUIProfileDescriptorTrusted,
  signMCPUIProfileDescriptor,
  verifyMCPUIProfileDescriptorTrust,
} from '../../src/services/mcp/mcp-descriptor-trust';
import { ipfsDatasetsUIProfileDescriptor } from '../../src/services/mcp/mcp-ipfs-ui-descriptors';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';

function descriptor(): MCPUIProfileDescriptor {
  return JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)) as MCPUIProfileDescriptor;
}

describe('MCP++ descriptor trust boundaries', () => {
  it('signs and verifies UI profile descriptors with Ed25519 did:key identities', () => {
    const keystore = new DIDKeystore();
    const signer = keystore.generateKey();
    const signed = signMCPUIProfileDescriptor(descriptor(), signer, keystore, '2026-05-21T00:00:00.000Z');

    const result = verifyMCPUIProfileDescriptorTrust(signed, { require_signature: true });

    expect(signed.trust?.signed_by).toBe(signer);
    expect(result.status).toBe('trusted');
    expect(result.launch_allowed).toBe(true);
  });

  it('rejects tampered signatures and non-allowlisted publishers or signers', () => {
    const keystore = new DIDKeystore();
    const signer = keystore.generateKey();
    const signed = signMCPUIProfileDescriptor(descriptor(), signer, keystore);
    const tampered = {
      ...signed,
      meta: {
        ...signed.meta,
        title: 'Tampered',
      },
    };

    expect(verifyMCPUIProfileDescriptorTrust(tampered, { require_signature: true }).status).toBe('invalid');
    expect(verifyMCPUIProfileDescriptorTrust(signed, { allowed_publishers: ['other'] }).status).toBe('rejected');
    expect(verifyMCPUIProfileDescriptorTrust(signed, { allowed_signers: ['did:key:zother'] }).status).toBe('rejected');
    expect(() => assertMCPUIProfileDescriptorTrusted(tampered, { require_signature: true })).toThrow(
      /trust verification failed/,
    );
  });

  it('enforces descriptor trust policy during protected launch resolution', async () => {
    const keystore = new DIDKeystore();
    const signer = keystore.generateKey();
    const unsignedRegistry = new MCPInterfaceDiscoveryRegistry(
      new LocalMCPInterfaceRegistryBackend(new InterfaceRepository()),
    );
    const signedRegistry = new MCPInterfaceDiscoveryRegistry(
      new LocalMCPInterfaceRegistryBackend(new InterfaceRepository()),
    );
    const unsigned = descriptor();
    const signed = signMCPUIProfileDescriptor({
      ...descriptor(),
      version: '0.2.0',
    }, signer, keystore);

    unsignedRegistry.publish(unsigned);
    signedRegistry.publish(signed);

    const unsignedOnly = await unsignedRegistry.resolveForLaunch({
      app_id: unsigned.meta.app_id,
      preferred_version: unsigned.version,
      required_methods: ['browse'],
      trust_policy: { require_signature: true },
    });
    const protectedLaunch = await signedRegistry.resolveForLaunch({
      app_id: signed.meta.app_id,
      required_methods: ['browse'],
      trust_policy: {
        require_signature: true,
        allowed_publishers: ['endomorphosis'],
        allowed_signers: [signer],
      },
    });

    expect(unsignedOnly).toBeNull();
    expect(protectedLaunch?.descriptor.version).toBe('0.2.0');
    expect(protectedLaunch?.trust.status).toBe('trusted');
  });

  it('rejects registry publish before storage when publish trust policy requires signatures', () => {
    const keystore = new DIDKeystore();
    const signer = keystore.generateKey();
    const registry = new MCPInterfaceDiscoveryRegistry(
      new LocalMCPInterfaceRegistryBackend(new InterfaceRepository()),
      {
        publish_trust_policy: {
          require_signature: true,
          allowed_publishers: ['endomorphosis'],
          allowed_signers: [signer],
        },
      },
    );
    const signed = signMCPUIProfileDescriptor(descriptor(), signer, keystore);

    expect(() => registry.publish(descriptor())).toThrow(/Descriptor publish rejected by trust policy/);
    expect(registry.publish(signed)).toMatch(/^sha256:/);
  });
});
