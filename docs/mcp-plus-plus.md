# MCP++ Integration Guide

SwissKnife ships with a full implementation of the **MCP++** extension suite,
enabling peer-to-peer connectivity, cryptographic capability delegation (UCAN),
content-addressed execution, deontic policy evaluation, and causal provenance
tracking.

---

## Table of Contents

1. [What is MCP++?](#what-is-mcp)
2. [Profiles Overview](#profiles-overview)
3. [Feature Flags](#feature-flags)
4. [Peer-to-Peer Connection (Profile E)](#peer-to-peer-connection-profile-e)
5. [UCAN Auth (Profile C)](#ucan-auth-profile-c)
6. [MCP-IDL Interface Contracts (Profile A)](#mcp-idl-interface-contracts-profile-a)
7. [CID-Native Execution Envelopes & Receipts (Profile B)](#cid-native-execution-envelopes--receipts-profile-b)
8. [Event DAG Provenance](#event-dag-provenance)
9. [Temporal Deontic Policy Evaluation (Profile D)](#temporal-deontic-policy-evaluation-profile-d)
10. [P2P Discovery & Pub/Sub](#p2p-discovery--pubsub)
11. [Risk Scoring & Scheduling](#risk-scoring--scheduling)
12. [Audit History via CIDs](#audit-history-via-cids)
13. [CLI Commands](#cli-commands)
14. [API Reference](#api-reference)
15. [Interop & Conformance](#interop--conformance)
16. [Normative References](#normative-references)

---

## What is MCP++?

**MCP++** (Model Context Protocol Plus Plus) is an extension of MCP that adds:

- **Content-addressed artifacts** — every input, output, and interface is
  identified by its SHA-256 CID, enabling verifiable, reproducible execution.
- **Cryptographic capability delegation** — UCAN tokens sign authority chains
  using Ed25519 so tools can prove who authorised them to act.
- **Peer-to-peer transport** — libp2p-based streams replace HTTP for
  decentralised, privacy-preserving agent-to-agent communication.
- **Temporal deontic policies** — obligations, permissions and prohibitions
  with deadlines are evaluated before every invocation.
- **Causal Event DAG** — every tool call is recorded as a linked event,
  allowing full audit and replay.

Normative spec: [endomorphosis/Mcp-Plus-Plus](https://github.com/endomorphosis/Mcp-Plus-Plus)

---

## Profiles Overview

| Profile | Code | Status |
|---------|------|--------|
| MCP-IDL Interface Contracts | A | ✓ implemented |
| CID-Native Envelopes & Receipts | B | ✓ implemented |
| UCAN Capability Delegation | C | ✓ implemented |
| Temporal Deontic Policy | D | ✓ implemented |
| P2P Transport (libp2p) | E | ✓ implemented |

---

## Feature Flags

All MCP++ features are **opt-in** and controlled by the `mcpPlusPlus` config
namespace.  Disable everything by default; enable what you need.

```bash
# View current flags
swissknife mcp-plus-plus config

# Enable a feature
swissknife mcp-plus-plus config enable enableP2P
swissknife mcp-plus-plus config enable enableUCAN

# Disable a feature
swissknife mcp-plus-plus config disable enablePubSub
```

Available flags:

| Flag | Description |
|------|-------------|
| `enableP2P` | Use libp2p transport for MCP connections |
| `enableUCAN` | Require UCAN proofs for tool invocations |
| `enableIDL` | Publish and verify Interface Descriptors |
| `enableCIDEnvelopes` | Wrap tool calls in CID-native execution envelopes |
| `enableEventDAG` | Record every execution in the causal Event DAG |
| `enablePolicyEval` | Evaluate temporal deontic policies before dispatch |
| `enablePubSub` | Enable GossipSub dissemination of interface/receipt CIDs |

---

## Peer-to-Peer Connection (Profile E)

Connect to a remote MCP++ peer over a libp2p stream:

```bash
swissknife mcp-plus-plus p2p connect /ip4/192.168.1.100/tcp/4001/p2p/QmPeerId...
```

Or programmatically:

```typescript
import { MCPTransportFactory } from './src/services/mcp-transport.js';

const transport = MCPTransportFactory.create({
  type: 'libp2p',
  endpoint: '/ip4/192.168.1.100/tcp/4001/p2p/QmPeerId...',
  reconnect: true,
});

const connected = await transport.connect();
const session = (transport as Libp2pTransport).getSession();
```

### Session Lifecycle

The session performs the MCP++ initialization handshake (Profile E §3.2)
immediately after the stream opens:

1. Client sends `initialize` request with `protocolVersion` and
   `mcpPlusPlusProfiles` capabilities.
2. Server responds with its version and advertised profiles.
3. Client sends `notifications/initialized`.

### Framing

All messages are framed with a **4-byte big-endian uint32 length prefix**
followed by UTF-8 JSON-RPC body (§5.1).  The default maximum frame size is
4 MiB; configure via `mcpPlusPlus.p2pMaxFrameBytes`.

---

## UCAN Auth (Profile C)

UCAN tokens delegate capabilities cryptographically using Ed25519 keys encoded
as `did:key` DIDs.

### Create a DID and Issue a Token

```typescript
import { DIDKeystore } from './src/auth/did-keystore.js';
import { UCANAuth } from './src/auth/ucan-auth.js';

const keystore = DIDKeystore.getInstance();
const auth = new UCANAuth(keystore);

// Generate identity
const issuerDID = keystore.generateKey();
const audienceDID = keystore.generateKey();

// Issue a UCAN token
const token = auth.issueToken(
  issuerDID,
  audienceDID,
  [{ rsc: 'mcp++/tools/*', cap: 'mcp++/invoke' }],
  3600,       // lifetime seconds
);

// Validate
const isValid = await auth.validateToken(token);

// Check a specific capability
const canInvoke = await auth.can(token, 'mcp++/tools/search', 'mcp++/invoke');
```

### Capability Vocabulary (MCP++ Profile C §6)

| `rsc` | `cap` | Meaning |
|-------|-------|---------|
| `mcp++/tools/*` | `mcp++/invoke` | Invoke any tool |
| `sha256:<hex>` | `mcp++/read-cid` | Read a specific CID |
| `*` | `*` | Unrestricted (root capability) |

---

## MCP-IDL Interface Contracts (Profile A)

Interface Descriptors describe a tool's schema and are content-addressed by
their SHA-256 CID, enabling stable references and compatibility checking.

```typescript
import { InterfaceRepository, computeInterfaceCID } from './src/services/mcp-idl.js';

const repo = InterfaceRepository.getInstance();

const interfaceCid = repo.register({
  name: 'search',
  namespace: 'com.example',
  version: '1.0.0',
  methods: [{ name: 'query' }],
  errors: [],
  requires: ['mcp++/ucan'],
  compatibility: {},
});

// Compatibility check
const verdict = repo.compat(interfaceCid);
// { compatible: true/false, reasons, requiresMissing, suggestedAlternatives }
```

### CLI

```bash
swissknife mcp-plus-plus idl list
swissknife mcp-plus-plus idl get sha256:abc123...
swissknife mcp-plus-plus idl compat sha256:abc123...
```

---

## CID-Native Execution Envelopes & Receipts (Profile B)

Wrap every tool call in a content-addressed `ExecutionEnvelope` and produce a
signed `ExecutionReceipt` on completion.

```typescript
import { buildEnvelope, buildReceipt, computeReceiptCID } from './src/services/mcp-envelope.js';

// Build envelope
const envelope = buildEnvelope(
  { toolName: 'search', params: { q: 'hello' } },
  interfaceCid,
  ucanToken,    // optional UCAN proof
  parentCids,   // causal parents
  policyCid,    // optional policy CID
);
// envelope.input_cid, envelope.intent_cid, envelope.proof_cid

// After execution
const receipt = buildReceipt(envelope, output, decisionCid, signerDID, keystore);
const receiptCid = computeReceiptCID(receipt);
```

---

## Event DAG Provenance

Every tool execution is recorded as a node in the causal `EventDAG`.

```typescript
import { EventDAG } from './src/services/event-dag.js';

const dag = EventDAG.getInstance();

// Append event
const eventCid = dag.appendEvent({
  intent_cid: envelope.intent_cid,
  interface_cid: envelope.interface_cid,
  proofs: [ucanToken],
  decision_cid: decision.decision_cid,
  outputs: [receiptCid],
  parents: parentEventCids,
  timestamp: new Date().toISOString(),
  envelope_cid: envelopeCid,
});

// Get the causal chain that produced an output
const provenance = dag.getProvenance(outputCid);

// Traverse from a specific tip
const chain = dag.traverseDAG(tipCid);
```

### CLI

```bash
# Show recent execution events
swissknife mcp-plus-plus receipts

# Show provenance for a specific output CID
swissknife mcp-plus-plus receipts --output-cid sha256:abc123...
```

---

## Temporal Deontic Policy Evaluation (Profile D)

Define policies with permissions, prohibitions, obligations, and temporal
constraints.  The `PolicyEngine` evaluates invocations before dispatch.

```typescript
import { PolicyEngine } from './src/services/mcp-policy.js';

const engine = PolicyEngine.getInstance();

const policyCid = engine.registerPolicy({
  id: 'my-policy',
  version: '1.0.0',
  permissions: [{ cap: 'mcp++/invoke', rsc: 'mcp++/tools/*' }],
  prohibitions: [{ cap: 'mcp++/write', rsc: '*' }],
  obligations: [{ description: 'Log this access', deadline: Date.now()/1000 + 3600 }],
  temporal: { notAfter: Date.now()/1000 + 86400 },
});

const decision = engine.evaluatePolicy(policyCid, {
  cap: 'mcp++/invoke',
  rsc: 'mcp++/tools/search',
});
// decision.outcome: 'PERMIT' | 'DENY' | 'OBLIGATION_SPAWNED'
// decision.decision_cid: sha256:...

// Check for overdue obligations
const overdue = engine.checkObligationDeadlines();
```

---

## P2P Discovery & Pub/Sub

Discovery and pub/sub are optional and do not affect point-to-point correctness.

```typescript
import { MCPDiscovery, MCPPubSub, TOPIC_INTERFACE_ANNOUNCE } from './src/services/mcp-discovery.js';

// Discovery
const discovery = new MCPDiscovery({ mdns: true, dht: true });
await discovery.start();
discovery.on('peer:discovered', (peer) => console.log('Found peer:', peer.peerId));

// Pub/Sub (opt-in)
const pubsub = new MCPPubSub({ enabled: true });
await pubsub.start();
await pubsub.announceInterface(interfaceCid, ucanToken);
pubsub.on('message', (msg) => { /* validate and handle */ });
```

---

## Risk Scoring & Scheduling

The `MCPScheduler` orders tool calls by risk-adjusted priority, using the
`RiskScorer` to derive risk from the causal Event DAG.

```typescript
import { RiskScorer, MCPScheduler } from './src/services/mcp-scheduler.js';

const scheduler = new MCPScheduler({ maxConcurrent: 4 });
scheduler.setExecutor(async (call) => mcpClient.invoke(call));

scheduler.scheduleToolCall(
  myToolCall,
  0,            // priority hint (lower = sooner)
  parentCids,   // used for risk computation
  'cluster-A',  // optional peer cluster for neighbourhood grouping
);
```

---

## Audit History via CIDs

Every execution leaves an immutable trail:

```
input_cid  → sha256 of canonical tool params
intent_cid → sha256 of {tool, caller}
output_cid → sha256 of canonical tool output
receipt_cid → sha256 of receipt payload (signed)
event_cid   → sha256 of EventNode
```

You can verify any output by recomputing its CID:

```typescript
import { computeCID } from './src/services/mcp-envelope.js';
const verified = computeCID(JSON.stringify(output)) === expectedOutputCid;
```

---

## CLI Commands

```
swissknife mcp-plus-plus p2p connect <multiaddr>
  Dial a remote MCP++ peer via libp2p

swissknife mcp-plus-plus idl list
  List all registered Interface Descriptor CIDs

swissknife mcp-plus-plus idl get <interface-cid>
  Print canonical descriptor JSON for a CID

swissknife mcp-plus-plus idl compat <interface-cid>
  Check compatibility of an interface

swissknife mcp-plus-plus receipts
  Show recent execution events

swissknife mcp-plus-plus receipts --output-cid <cid>
  Show provenance chain for a specific output CID

swissknife mcp-plus-plus config
  Show MCP++ feature flag status

swissknife mcp-plus-plus config enable|disable <feature>
  Toggle a feature flag
```

---

## API Reference

| File | Exports |
|------|---------|
| `src/auth/did-keystore.ts` | `DIDKeystore`, `didToPublicKeyBytes`, `base64urlEncode`, `sha256` |
| `src/auth/ucan-auth.ts` | `UCANAuth`, `UCANClaim`, `ParsedUCAN` |
| `src/services/mcp-p2p-session.ts` | `MCPp2pSession`, `MCP_P2P_PROTOCOL_ID`, `P2PStream` |
| `src/services/mcp-transport.ts` | `MCPTransportFactory`, `MCPTransport`, `Libp2pTransport` |
| `src/services/mcp-idl.ts` | `InterfaceRepository`, `canonicalize`, `computeInterfaceCID`, `computeCID` |
| `src/services/mcp-envelope.ts` | `buildEnvelope`, `buildReceipt`, `computeReceiptCID`, `computeCID` |
| `src/services/event-dag.ts` | `EventDAG`, `EventNode`, `StoredEventNode` |
| `src/services/mcp-policy.ts` | `PolicyEngine`, `Policy`, `computePolicyCID` |
| `src/services/mcp-discovery.ts` | `MCPDiscovery`, `MCPPubSub`, topic constants |
| `src/services/mcp-scheduler.ts` | `MCPScheduler`, `RiskScorer` |

---

## Interop & Conformance

Tests in `test/mcp-plus-plus/` cover the MCP++ interop checklist (§9.6 of
`transport-mcp-p2p.md`):

1. **Handshake + capabilities** (`mcp-p2p-session.test.ts`)
2. **Framing & correlation** (`mcp-p2p-session.test.ts`)
3. **Rate-limiting** (`mcp-p2p-session.test.ts`)
4. **Authorization separation** (`mcp-p2p-session.test.ts`)
5. **UCAN issue / validate / can()** (`ucan-auth.test.ts`)
6. **IDL canonicalization + CID stability** (`mcp-idl.test.ts`)
7. **Receipt building + signing** (`mcp-envelope.test.ts`)
8. **Event DAG traversal + provenance** (`event-dag.test.ts`)
9. **Policy evaluation + obligations** (`policy-and-scheduler.test.ts`)

Run:
```bash
npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs
```

---

## Normative References

- [MCP++ Repository](https://github.com/endomorphosis/Mcp-Plus-Plus)
- [MCP-IDL spec](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/mcp-idl.md)
- [CID-native artifacts spec](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/cid-native-artifacts.md)
- [UCAN spec (Profile C)](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/ucan.md)
- [P2P Transport spec (Profile E)](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/transport-mcp-p2p.md)
- [Temporal Deontic Policy spec (Profile D)](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/temporal-deontic-policy.md)
- [Event DAG ordering](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/event-dag-ordering.md)
- [Risk Scheduling](https://github.com/endomorphosis/Mcp-Plus-Plus/blob/main/docs/spec/risk-scheduling.md)
- [UCAN spec (ucan.xyz)](https://ucan.xyz)
- [did:key specification](https://w3c-ccg.github.io/did-method-key/)
