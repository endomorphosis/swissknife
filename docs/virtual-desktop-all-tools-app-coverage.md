# Virtual Desktop All-Tools App Coverage

Generated: 2026-07-19T06:17:29.772Z
Matrix CID: `sha256:1488655fd2501fc4c581e0e3454eefa6c721c1d7ed16ef89668b35b0a1e331a7`

## Summary

- Virtual desktop apps: 45
- Tool-backed apps with at least one binding row: 26
- Tool-backed apps with app-visible tools: 25
- Manifest-only apps: 11
- Not-applicable apps: 4
- App-visible capabilities: 547
- Desktop/mobile-only capabilities: 47
- Supervisor-only capabilities: 108
- Backend contract apps: 45
- Backend contract capabilities: 702
- Local-only apps with rationale: 19/19
- Contract CID: `sha256:de286fe5a6a4dd8b2bf13a62c6f96bbb5c4235f0ec8930a38cad56a14a1c139a`

## Coverage By App

| App | Binding state | Rationale | App-visible | Desktop/mobile-only | Supervisor-only | Services | IDL | Glasses |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| ai-chat | tool_backed | AI chat routes inference-capable MCP tools through ipfs_accelerate_py when a backend is configured. | 5 | 0 | 3 | ipfs_accelerate_py | 3 | 3 |
| api-keys | tool_backed | Secret inventory and rotation map to ipfs_kit_py secret-management tools with confirmation/receipt policy. | 0 | 9 | 0 | ipfs_kit_py | 1 | 1 |
| calculator | not_applicable | Pure client-side calculator; no MCP backend is required or intended. | 0 | 0 | 0 | - | 0 | 0 |
| calendar | manifest_only | Calendar data is local/browser storage in this desktop build; no ipfs_kit_py/datasets/accelerate binding is intended yet. | 0 | 0 | 0 | - | 0 | 0 |
| cinema | tool_backed | Media import/export and content-addressed playback use IPFS file and block retrieval capabilities. | 1 | 0 | 0 | ipfs_kit_py | 1 | 1 |
| clock | not_applicable | Pure client-side clock/timer; no MCP backend is required or intended. | 0 | 0 | 0 | - | 0 | 0 |
| cron | manifest_only | The current cron surface manages local schedules; backend dispatch remains a future supervisor workflow. | 0 | 0 | 0 | - | 0 | 0 |
| device-manager | tool_backed | Hardware inventory, recommendations, and tests are owned by ipfs_accelerate_py hardware tools. | 12 | 0 | 9 | ipfs_accelerate_py | 6 | 6 |
| file-manager | tool_backed | File, bucket, MFS, VFS, and journal operations are app-owned IPFS storage capabilities. | 69 | 7 | 7 | ipfs_kit_py | 10 | 10 |
| friends-list | tool_backed | Peer discovery and friend presence use IPFS/libp2p peer and pubsub capabilities. | 0 | 0 | 0 | ipfs_kit_py | 0 | 0 |
| github | tool_backed | GitHub repository, issue, PR, and review tools are concrete MCP capabilities surfaced with confirmation policy. | 22 | 2 | 16 | ipfs_accelerate_py, ipfs_datasets_py | 15 | 15 |
| huggingface | tool_backed | Hugging Face model metadata, downloads, and IPLD publication use ipfs_accelerate_py model tools. | 7 | 0 | 7 | ipfs_accelerate_py | 6 | 6 |
| image-viewer | tool_backed | Image loading and content-addressed media retrieval use IPFS read/file capabilities. | 0 | 0 | 0 | ipfs_kit_py | 0 | 0 |
| ipfs-explorer | tool_backed | Primary browser for IPFS block, DAG, pin, name, and gateway capabilities. | 7 | 0 | 0 | ipfs_kit_py | 6 | 6 |
| mcp-control | tool_backed | Control-plane tools, policy/IDL inspection, and supervisor-owned tools remain visible here with explicit disposition. | 20 | 3 | 11 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 14 | 14 |
| media-player | tool_backed | Content-addressed media playback uses IPFS cat/get/file-list capabilities. | 13 | 0 | 0 | ipfs_kit_py | 3 | 3 |
| model-browser | tool_backed | Model search, metadata, recommendation, and vector lookup tools are owned by this app. | 35 | 1 | 0 | ipfs_accelerate_py, ipfs_datasets_py | 9 | 9 |
| music-studio | manifest_only | Classic music studio is WebAudio/local-project based; MCP-backed export is not part of this surface. | 0 | 0 | 0 | - | 0 | 0 |
| music-studio-unified | manifest_only | Unified studio currently uses browser audio/project state; model-backed generation is not wired to these MCP services. | 0 | 0 | 0 | - | 0 | 0 |
| navi | tool_backed | Assistant dispatch and schema-driven tool execution use safe ipfs_accelerate_py dispatch/introspection tools. | 2 | 0 | 1 | ipfs_accelerate_py | 2 | 2 |
| neural-network-designer | tool_backed | Graph, workflow, and model-design capabilities map to dataset graph tools and accelerate workflow tools. | 26 | 0 | 0 | ipfs_accelerate_py, ipfs_datasets_py | 6 | 6 |
| neural-photoshop | tool_backed | Image/media analysis, conversion, embedding, and inference workflows are MCP-backed. | 18 | 8 | 0 | ipfs_accelerate_py, ipfs_datasets_py | 7 | 7 |
| notes | tool_backed | Note search, summarization, provenance, and dataset save/load use ipfs_datasets_py tools. | 39 | 0 | 0 | ipfs_datasets_py | 10 | 10 |
| oauth-login | manifest_only | OAuth login is a browser/provider flow; no direct MCP backend binding is intended. | 0 | 0 | 0 | - | 0 | 0 |
| openrouter | manifest_only | OpenRouter is an external API/provider browser surface, not one of the three MCP backend services. | 0 | 0 | 0 | - | 0 | 0 |
| p2p-chat | tool_backed | Classic P2P chat maps to pubsub and peer-discovery IPFS/libp2p tools. | 0 | 0 | 0 | ipfs_kit_py | 0 | 0 |
| p2p-chat-unified | tool_backed | Unified chat owns app-visible pubsub, peer, and offline message sync capabilities. | 0 | 0 | 0 | ipfs_kit_py | 0 | 0 |
| p2p-network | tool_backed | Swarm, DHT, network, and peer status tools belong to the network manager. | 9 | 0 | 9 | ipfs_kit_py, ipfs_accelerate_py | 2 | 2 |
| peertube | tool_backed | P2P video playback uses IPFS naming, pin, and content retrieval capabilities. | 5 | 1 | 0 | ipfs_kit_py | 1 | 1 |
| settings | manifest_only | Settings edits local/browser preferences; backend control tools remain in MCP Control. | 0 | 0 | 0 | - | 0 | 0 |
| strudel | manifest_only | The desktop launches the Strudel app under id strudel; it is WebAudio/local-code based without a direct MCP backend. | 0 | 0 | 0 | - | 0 | 0 |
| strudel-ai-daw | manifest_only | DAW state and audio rendering are browser-local in this release; no direct MCP backend binding is intended. | 0 | 0 | 0 | - | 0 | 0 |
| system-monitor | tool_backed | System, audit, performance, health, and telemetry capabilities are app-owned monitoring tools. | 33 | 5 | 8 | ipfs_kit_py, ipfs_accelerate_py | 14 | 14 |
| task-manager | manifest_only | Task Manager tracks desktop tasks locally; MCP job control belongs to Training Manager or MCP Control. | 0 | 0 | 0 | - | 0 | 0 |
| terminal | not_applicable | Terminal is a browser/host shell surface; these Python MCP tool backends are not directly exposed through it. | 0 | 0 | 0 | - | 0 | 0 |
| todo | manifest_only | Todo data is browser-local in this release; no direct MCP backend binding is intended. | 0 | 0 | 0 | - | 0 | 0 |
| training-manager | tool_backed | Training jobs, queues, workflows, and dataset preparation use accelerate and datasets tools. | 20 | 4 | 19 | ipfs_accelerate_py, ipfs_datasets_py | 13 | 13 |
| vibecode | tool_backed | Code search, documentation, linting, and review tools from ipfs_datasets_py are surfaced as app-owned developer capabilities. | 33 | 0 | 0 | ipfs_datasets_py | 6 | 6 |
| datasets-browser | tool_backed | Generated dataset descriptors expose ipfs_datasets_py discovery, index, vector, and provenance tools. | 61 | 0 | 0 | ipfs_datasets_py | 16 | 16 |
| accelerate-panel | tool_backed | Generated accelerate descriptors expose ipfs_accelerate_py model, inference, hardware, and job tools. | 4 | 0 | 4 | ipfs_accelerate_py | 2 | 2 |
| idl-explorer | tool_backed | IDL Explorer owns schema, descriptor, and MCP++ method inspection for all backend service families. | 3 | 0 | 0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 1 | 1 |
| glasses-preview | not_applicable | Glasses Preview is a simulator/display surface; it uses ORB replay data rather than direct Python MCP backend tools. | 0 | 0 | 0 | - | 0 | 0 |
| orb-auto-ui | tool_backed | ORB Auto-UI owns generated display envelopes and fallback UI for descriptors that are not manually assigned. | 14 | 1 | 0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 8 | 8 |
| mcp-plus-plus | tool_backed | MCP++ Explorer owns complete MCP/MCP++ catalog, gateway, receipt, and event-DAG inspection. | 70 | 6 | 0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 20 | 20 |
| agent-supervisor | tool_backed | Agent Supervisor exposes bounded goal, queue, taskboard, run-history, steering, and receipt workflows through typed MCP/MCP++ capabilities. | 19 | 0 | 14 | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | 6 | 6 |

## Visibility Semantics

- `app_visible`: capability is routable from the virtual desktop app, with confirmation and receipts when policy requires them.
- `desktop_mobile_only`: capability is intentionally withheld from direct browser app dispatch and must use desktop/mobile confirmation or blocked-state UX.
- `supervisor_only`: capability remains represented for release evidence and supervisor receipts, but is not directly invokable by a desktop app.
- `manifest_only` and `not_applicable`: the app is deliberately not backed by `ipfs_kit_py`, `ipfs_datasets_py`, or `ipfs_accelerate_py` for this release.

## Frozen Backend Contract

`test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json` freezes one canonical record per app, including launch owner, backend capability set, MCP/MCP++ eligibility, policy class, receipt strategy, ORB/IDL state, glasses handoff strategy, and success/fallback/error UX scenarios.

| App | Canonical aliases | Backend caps | Local-only rationale | ORB/IDL | UX scenarios |
| --- | --- | ---: | --- | --- | --- |
| ai-chat | - | 8 | - | manual:3 | success/fallback/error |
| api-keys | - | 9 | - | manual:1 | success/fallback/error |
| calculator | - | 0 | yes | not-required:0 | success/fallback/error |
| calendar | - | 0 | yes | not-required:0 | success/fallback/error |
| cinema | - | 1 | - | manual:1 | success/fallback/error |
| clock | - | 0 | yes | not-required:0 | success/fallback/error |
| cron | - | 0 | yes | not-required:0 | success/fallback/error |
| device-manager | - | 21 | - | manual:6 | success/fallback/error |
| file-manager | - | 83 | - | manual:10 | success/fallback/error |
| friends-list | - | 0 | yes | not-required:0 | success/fallback/error |
| github | - | 40 | - | manual:15 | success/fallback/error |
| huggingface | - | 14 | - | manual:6 | success/fallback/error |
| image-viewer | - | 0 | yes | not-required:0 | success/fallback/error |
| ipfs-explorer | - | 7 | - | manual:6 | success/fallback/error |
| mcp-control | - | 34 | - | manual:14 | success/fallback/error |
| media-player | - | 13 | - | manual:3 | success/fallback/error |
| model-browser | - | 36 | - | manual:9 | success/fallback/error |
| music-studio | strudel-grandma | 0 | yes | not-required:0 | success/fallback/error |
| music-studio-unified | - | 0 | yes | not-required:0 | success/fallback/error |
| navi | - | 3 | - | manual:2 | success/fallback/error |
| neural-network-designer | - | 26 | - | manual:6 | success/fallback/error |
| neural-photoshop | - | 26 | - | manual:7 | success/fallback/error |
| notes | - | 39 | - | manual:10 | success/fallback/error |
| oauth-login | - | 0 | yes | not-required:0 | success/fallback/error |
| openrouter | - | 0 | yes | not-required:0 | success/fallback/error |
| p2p-chat | p2p-chat-offline | 0 | yes | not-required:0 | success/fallback/error |
| p2p-chat-unified | - | 0 | yes | not-required:0 | success/fallback/error |
| p2p-network | - | 18 | - | manual:2 | success/fallback/error |
| peertube | - | 6 | - | manual:1 | success/fallback/error |
| settings | - | 0 | yes | not-required:0 | success/fallback/error |
| strudel | - | 0 | yes | not-required:0 | success/fallback/error |
| strudel-ai-daw | - | 0 | yes | not-required:0 | success/fallback/error |
| system-monitor | - | 46 | - | manual:14 | success/fallback/error |
| task-manager | - | 0 | yes | not-required:0 | success/fallback/error |
| terminal | - | 0 | yes | not-required:0 | success/fallback/error |
| todo | - | 0 | yes | not-required:0 | success/fallback/error |
| training-manager | - | 43 | - | manual:13 | success/fallback/error |
| vibecode | code-editor | 33 | - | manual:6 | success/fallback/error |
| datasets-browser | - | 61 | - | manual:16 | success/fallback/error |
| accelerate-panel | - | 8 | - | manual:2 | success/fallback/error |
| idl-explorer | - | 3 | - | manual:1 | success/fallback/error |
| glasses-preview | - | 0 | yes | not-required:0 | success/fallback/error |
| orb-auto-ui | - | 15 | - | manual:8 | success/fallback/error |
| mcp-plus-plus | - | 76 | - | manual:20 | success/fallback/error |
| agent-supervisor | - | 33 | - | manual:6 | success/fallback/error |

