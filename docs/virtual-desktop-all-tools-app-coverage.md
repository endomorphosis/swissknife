# Virtual Desktop All-Tools App Coverage

<<<<<<< Updated upstream
Generated: 2026-07-10T11:35:56.783Z
Matrix CID: `sha256:75f30cbdea6e12d91b3c57b633bf7122f17f625084ad36c061095a84ecd34586`

## Summary

- Virtual desktop apps: 45
- Tool-backed apps with at least one binding row: 30
- Tool-backed apps with app-visible tools: 29
- Manifest-only apps: 11
- Not-applicable apps: 4
- App-visible capabilities: 665
- Desktop/mobile-only capabilities: 49
- Supervisor-only capabilities: 108
- Backend contract apps: 45
- Backend contract capabilities: 822
- Local-only apps with rationale: 15/15
- Contract CID: `sha256:f67c1f46aa438de1d703bb5f3b2e221908e92bd52e3ef224d245ea58d8c19f51`

## Coverage By App

| App | Binding state | Rationale | App-visible | Desktop/mobile-only | Supervisor-only | Services | IDL | Glasses |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| ai-chat | tool_backed | AI chat routes inference-capable MCP tools through ipfs_accelerate_py when a backend is configured. | 5 | 0 | 3 | ipfs_accelerate_py | 3 | 3 |
| api-keys | tool_backed | Secret inventory and rotation map to ipfs_kit_py secret-management tools with confirmation/receipt policy. | 0 | 9 | 0 | ipfs_kit_py | 0 | 0 |
| calculator | not_applicable | Pure client-side calculator; no MCP backend is required or intended. | 0 | 0 | 0 | - | 0 | 0 |
| calendar | manifest_only | Calendar data is local/browser storage in this desktop build; no ipfs_kit_py/datasets/accelerate binding is intended yet. | 0 | 0 | 0 | - | 0 | 0 |
| cinema | tool_backed | Media import/export and content-addressed playback use IPFS file and block retrieval capabilities. | 1 | 0 | 0 | ipfs_kit_py | 1 | 1 |
| clock | not_applicable | Pure client-side clock/timer; no MCP backend is required or intended. | 0 | 0 | 0 | - | 0 | 0 |
| cron | manifest_only | The current cron surface manages local schedules; backend dispatch remains a future supervisor workflow. | 0 | 0 | 0 | - | 0 | 0 |
| device-manager | tool_backed | Hardware inventory, recommendations, and tests are owned by ipfs_accelerate_py hardware tools. | 12 | 0 | 9 | ipfs_accelerate_py | 6 | 6 |
| file-manager | tool_backed | File, bucket, MFS, VFS, and journal operations are app-owned IPFS storage capabilities. | 110 | 8 | 7 | ipfs_kit_py | 13 | 13 |
| friends-list | tool_backed | Peer discovery and friend presence use IPFS/libp2p peer and pubsub capabilities. | 2 | 0 | 0 | ipfs_kit_py | 1 | 1 |
| github | tool_backed | GitHub repository, issue, PR, and review tools are concrete MCP capabilities surfaced with confirmation policy. | 27 | 2 | 16 | ipfs_accelerate_py, ipfs_datasets_py | 15 | 15 |
| huggingface | tool_backed | Hugging Face model metadata, downloads, and IPLD publication use ipfs_accelerate_py model tools. | 7 | 0 | 7 | ipfs_accelerate_py | 6 | 6 |
| image-viewer | tool_backed | Image loading and content-addressed media retrieval use IPFS read/file capabilities. | 2 | 0 | 0 | ipfs_kit_py | 1 | 1 |
| ipfs-explorer | tool_backed | Primary browser for IPFS block, DAG, pin, name, and gateway capabilities. | 19 | 1 | 0 | ipfs_kit_py | 9 | 9 |
| mcp-control | tool_backed | Control-plane tools, policy/IDL inspection, and supervisor-owned tools remain visible here with explicit disposition. | 40 | 4 | 11 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 15 | 15 |
| media-player | tool_backed | Content-addressed media playback uses IPFS cat/get/file-list capabilities. | 17 | 0 | 0 | ipfs_kit_py | 5 | 5 |
| model-browser | tool_backed | Model search, metadata, recommendation, and vector lookup tools are owned by this app. | 38 | 1 | 0 | ipfs_accelerate_py, ipfs_datasets_py | 11 | 11 |
| music-studio | manifest_only | Classic music studio is WebAudio/local-project based; MCP-backed export is not part of this surface. | 0 | 0 | 0 | - | 0 | 0 |
| music-studio-unified | manifest_only | Unified studio currently uses browser audio/project state; model-backed generation is not wired to these MCP services. | 0 | 0 | 0 | - | 0 | 0 |
| navi | tool_backed | Assistant dispatch and schema-driven tool execution use safe ipfs_accelerate_py dispatch/introspection tools. | 2 | 0 | 1 | ipfs_accelerate_py | 2 | 2 |
| neural-network-designer | tool_backed | Graph, workflow, and model-design capabilities map to dataset graph tools and accelerate workflow tools. | 27 | 0 | 0 | ipfs_accelerate_py, ipfs_datasets_py | 7 | 7 |
| neural-photoshop | tool_backed | Image/media analysis, conversion, embedding, and inference workflows are MCP-backed. | 22 | 8 | 0 | ipfs_accelerate_py, ipfs_datasets_py | 7 | 7 |
| notes | tool_backed | Note search, summarization, provenance, and dataset save/load use ipfs_datasets_py tools. | 45 | 1 | 0 | ipfs_datasets_py | 12 | 12 |
| oauth-login | manifest_only | OAuth login is a browser/provider flow; no direct MCP backend binding is intended. | 0 | 0 | 0 | - | 0 | 0 |
| openrouter | manifest_only | OpenRouter is an external API/provider browser surface, not one of the three MCP backend services. | 0 | 0 | 0 | - | 0 | 0 |
| p2p-chat | tool_backed | Classic P2P chat maps to pubsub and peer-discovery IPFS/libp2p tools. | 1 | 0 | 0 | ipfs_kit_py | 1 | 1 |
| p2p-chat-unified | tool_backed | Unified chat owns app-visible pubsub, peer, and offline message sync capabilities. | 1 | 0 | 0 | ipfs_kit_py | 1 | 1 |
| p2p-network | tool_backed | Swarm, DHT, network, and peer status tools belong to the network manager. | 12 | 0 | 9 | ipfs_kit_py, ipfs_accelerate_py | 3 | 3 |
| peertube | tool_backed | P2P video playback uses IPFS naming, pin, and content retrieval capabilities. | 17 | 2 | 0 | ipfs_kit_py | 3 | 3 |
| settings | manifest_only | Settings edits local/browser preferences; backend control tools remain in MCP Control. | 0 | 0 | 0 | - | 0 | 0 |
| strudel | manifest_only | The desktop launches the Strudel app under id strudel; it is WebAudio/local-code based without a direct MCP backend. | 0 | 0 | 0 | - | 0 | 0 |
| strudel-ai-daw | manifest_only | DAW state and audio rendering are browser-local in this release; no direct MCP backend binding is intended. | 0 | 0 | 0 | - | 0 | 0 |
| system-monitor | tool_backed | System, audit, performance, health, and telemetry capabilities are app-owned monitoring tools. | 35 | 5 | 8 | ipfs_kit_py, ipfs_accelerate_py | 14 | 14 |
| task-manager | manifest_only | Task Manager tracks desktop tasks locally; MCP job control belongs to Training Manager or MCP Control. | 0 | 0 | 0 | - | 0 | 0 |
| terminal | not_applicable | Terminal is a browser/host shell surface; these Python MCP tool backends are not directly exposed through it. | 0 | 0 | 0 | - | 0 | 0 |
| todo | manifest_only | Todo data is browser-local in this release; no direct MCP backend binding is intended. | 0 | 0 | 0 | - | 0 | 0 |
| training-manager | tool_backed | Training jobs, queues, workflows, and dataset preparation use accelerate and datasets tools. | 20 | 4 | 19 | ipfs_accelerate_py, ipfs_datasets_py | 11 | 11 |
| vibecode | tool_backed | Code search, documentation, linting, and review tools from ipfs_datasets_py are surfaced as app-owned developer capabilities. | 33 | 0 | 0 | ipfs_datasets_py | 6 | 6 |
| datasets-browser | tool_backed | Generated dataset descriptors expose ipfs_datasets_py discovery, index, vector, and provenance tools. | 63 | 0 | 0 | ipfs_datasets_py | 16 | 16 |
| accelerate-panel | tool_backed | Generated accelerate descriptors expose ipfs_accelerate_py model, inference, hardware, and job tools. | 4 | 0 | 4 | ipfs_accelerate_py | 2 | 2 |
| idl-explorer | tool_backed | IDL Explorer owns schema, descriptor, and MCP++ method inspection for all backend service families. | 3 | 0 | 0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 1 | 1 |
| glasses-preview | not_applicable | Glasses Preview is a simulator/display surface; it uses ORB replay data rather than direct Python MCP backend tools. | 0 | 0 | 0 | - | 0 | 0 |
| orb-auto-ui | tool_backed | ORB Auto-UI owns generated display envelopes and fallback UI for descriptors that are not manually assigned. | 14 | 1 | 0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 8 | 8 |
| mcp-plus-plus | tool_backed | MCP++ Explorer owns complete MCP/MCP++ catalog, gateway, receipt, and event-DAG inspection. | 67 | 3 | 0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 20 | 20 |
| agent-supervisor | tool_backed | Agent Supervisor exposes bounded goal, queue, taskboard, run-history, steering, and receipt workflows through typed MCP/MCP++ capabilities. | 19 | 0 | 14 | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | 6 | 6 |
=======
Generated: 2026-07-11T02:32:03.010Z
Manifest: `org.hallucinate.swissknife.virtual-desktop-app-manifest` (2026-07-07)

## Summary

- Canonical virtual desktop apps: 44
- Backend-contract records: 44
- Executable behavior records: 44
- Behavior rows with receipts or fixtures: 44
- Screenshot-only behavior rows: 0
- App screenshots present: 44
- ipfs_accelerate_py: 11 covered / 25 declared; ipfs_kit_py: 9 covered / 30 declared; ipfs_datasets_py: 10 covered / 21 declared

## Coverage By App

| App | Binding state | Launch | Primary behavior | Backend capabilities | States | Keyboard | Pointer | Screenshot | Receipt/fixture | ORB/IDL | Glasses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| terminal | not_applicable | desktop-icon<br>virtual-desktop://apps/terminal | SwissKnife Terminal declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/terminal.png | local-fixture:sha256:9093033b18129205 | local_only_not_required (0) | manual:native-display |
| vibecode | tool_backed | desktop-icon<br>virtual-desktop://apps/vibecode | Dispatch sample MCP capability ipfs_datasets_py:configured:ai_agent_pr_creator | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:41 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/vibecode.png | receipt:sha256:80750c4b67513eaf | covered (8) | manual:native-display |
| music-studio-unified | manifest_only | desktop-icon<br>virtual-desktop://apps/music-studio-unified | Music Studio declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/music-studio-unified.png | local-fixture:sha256:5c4f61e19e5b616f | local_only_not_required (0) | audio-summary:audio-summary |
| ai-chat | tool_backed | desktop-icon<br>virtual-desktop://apps/ai-chat | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:execute_with_payload | ipfs_accelerate:8<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ai-chat.png | receipt:sha256:3e05e4a6f65f4825 | covered (3) | manual:native-display |
| file-manager | tool_backed | desktop-icon<br>virtual-desktop://apps/file-manager | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:ipfs_files_add | ipfs_accelerate:14<br>ipfs_kit:87<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/file-manager.png | receipt:sha256:958b0771e87b75b3 | covered (11) | manual:native-display |
| task-manager | manifest_only | desktop-icon<br>virtual-desktop://apps/task-manager | Task Manager declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:not_declared<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/task-manager.png | local-fixture:sha256:6771176f99c7df6b | local_only_not_required (0) | manual:native-display |
| todo | manifest_only | desktop-icon<br>virtual-desktop://apps/todo | Todo and Goals declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/todo.png | local-fixture:sha256:861e7f1c73f8332a | local_only_not_required (0) | mobile-card:mobile-card |
| model-browser | tool_backed | desktop-icon<br>virtual-desktop://apps/model-browser | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:get_model_details | ipfs_accelerate:8<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:45 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/model-browser.png | receipt:sha256:9909eaa4956a9909 | covered (14) | manual:native-display |
| huggingface | tool_backed | desktop-icon<br>virtual-desktop://apps/huggingface | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:build_hf_inference_ipld_document | ipfs_accelerate:14<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/huggingface.png | receipt:sha256:016105654c6ac62a | covered (6) | mobile-card:mobile-card |
| openrouter | manifest_only | desktop-icon<br>virtual-desktop://apps/openrouter | OpenRouter Hub declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:not_declared<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/openrouter.png | local-fixture:sha256:ff9a730eb8153f8d | local_only_not_required (0) | mobile-card:mobile-card |
| ipfs-explorer | tool_backed | desktop-icon<br>virtual-desktop://apps/ipfs-explorer | Dispatch sample MCP capability ipfs_datasets_py:configured:enhanced_ipfs_cluster_tools | ipfs_accelerate:not_declared<br>ipfs_kit:16<br>ipfs_datasets:9 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ipfs-explorer.png | receipt:sha256:4f9d8417b05df395 | covered (13) | idl-generated:native-display |
| device-manager | tool_backed | desktop-icon<br>virtual-desktop://apps/device-manager | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:detect_hardware | ipfs_accelerate:22<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/device-manager.png | receipt:sha256:0ad35bead008da4b | covered (6) | mobile-card:mobile-card |
| settings | manifest_only | desktop-icon<br>virtual-desktop://apps/settings | Settings is governed by browser or policy confirmation state rather than a direct Python MCP backend capability. | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/settings.png | local-fixture:sha256:8696c5456f2d9862 | local_only_not_required (0) | manual:native-display |
| mcp-control | tool_backed | desktop-icon<br>virtual-desktop://apps/mcp-control | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:add_endpoint | ipfs_accelerate:24<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:20 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/mcp-control.png | receipt:sha256:f2ead8ab8896efe1 | covered (15) | mobile-card:mobile-card |
| api-keys | tool_backed | desktop-icon<br>virtual-desktop://apps/api-keys | Dispatch sample MCP capability ipfs_kit_py:configured:create_secrets_tools | ipfs_accelerate:not_declared<br>ipfs_kit:10<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/api-keys.png | receipt:sha256:b943b0fe6c8e2298 | local_only_not_required (0) | mobile-card:mobile-card |
| github | tool_backed | desktop-icon<br>virtual-desktop://apps/github | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:build_and_execute_github_repo | ipfs_accelerate:32<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:12 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/github.png | receipt:sha256:6394178ea1fc8184 | covered (18) | mobile-card:mobile-card |
| oauth-login | manifest_only | desktop-icon<br>virtual-desktop://apps/oauth-login | OAuth Login is an external provider/browser flow; Python MCP backend dispatch is not part of this release surface. | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/oauth-login.png | local-fixture:sha256:ab58de10dcc0175a | local_only_not_required (0) | mobile-card:mobile-card |
| cron | manifest_only | desktop-icon<br>virtual-desktop://apps/cron | AI Cron declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:not_declared<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/cron.png | local-fixture:sha256:259c82702b00a21b | local_only_not_required (0) | mobile-card:mobile-card |
| navi | tool_backed | desktop-icon<br>virtual-desktop://apps/navi | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:get_mcp_manifest | ipfs_accelerate:4<br>ipfs_kit:not_declared<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/navi.png | receipt:sha256:02a00d0b73eaee50 | covered (2) | audio-summary:audio-summary |
| p2p-network | tool_backed | desktop-icon<br>virtual-desktop://apps/p2p-network | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:list_peers | ipfs_accelerate:18<br>ipfs_kit:4<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-network.png | receipt:sha256:985b2044a8d584eb | covered (3) | mobile-card:mobile-card |
| p2p-chat-unified | tool_backed | desktop-icon<br>virtual-desktop://apps/p2p-chat-unified | P2P Chat declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat-unified.png | receipt:sha256:2d24e7a2df4d4457 | local_only_not_required (0) | audio-summary:audio-summary |
| neural-network-designer | tool_backed | desktop-icon<br>virtual-desktop://apps/neural-network-designer | Dispatch sample MCP capability ipfs_datasets_py:configured:entity_analysis_tools | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:27 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-network-designer.png | receipt:sha256:ed5c54b6d676ebb6 | covered (7) | mobile-card:mobile-card |
| training-manager | tool_backed | desktop-icon<br>virtual-desktop://apps/training-manager | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:create_workflow | ipfs_accelerate:70<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:43 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/training-manager.png | receipt:sha256:07034a968d25b696 | covered (23) | mobile-card:mobile-card |
| calculator | not_applicable | desktop-icon<br>virtual-desktop://apps/calculator | Calculator is browser-local for this release; success, fallback, error, and denied states are covered by a deterministic local behavior fixture. | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/calculator.png | local-fixture:sha256:cc575ee8effa1fd8 | local_only_not_required (0) | mobile-card:mobile-card |
| clock | not_applicable | desktop-icon<br>virtual-desktop://apps/clock | Clock and Timers is browser-local for this release; success, fallback, error, and denied states are covered by a deterministic local behavior fixture. | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/clock.png | local-fixture:sha256:2749ef9e8f404426 | local_only_not_required (0) | mobile-card:mobile-card |
| calendar | manifest_only | desktop-icon<br>virtual-desktop://apps/calendar | Calendar and Events declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/calendar.png | local-fixture:sha256:a962aaa07b6dd861 | local_only_not_required (0) | mobile-card:mobile-card |
| peertube | tool_backed | desktop-icon<br>virtual-desktop://apps/peertube | Dispatch sample MCP capability ipfs_kit_py:configured:handle_pin_add | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:14<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/peertube.png | receipt:sha256:49f385afe6452659 | covered (3) | audio-summary:audio-summary |
| friends-list | tool_backed | desktop-icon<br>virtual-desktop://apps/friends-list | Friends and Network declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/friends-list.png | receipt:sha256:7c6b620a892e184d | local_only_not_required (0) | mobile-card:mobile-card |
| image-viewer | tool_backed | desktop-icon<br>virtual-desktop://apps/image-viewer | Dispatch sample MCP capability ipfs_kit_py:configured:block_get | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:6<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/image-viewer.png | receipt:sha256:62f04a6e2a49010e | covered (2) | mobile-card:mobile-card |
| notes | tool_backed | desktop-icon<br>virtual-desktop://apps/notes | Dispatch sample MCP capability ipfs_datasets_py:configured:archive_is_integration | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:42 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/notes.png | receipt:sha256:8a180f9743c8904a | covered (11) | mobile-card:mobile-card |
| media-player | tool_backed | desktop-icon<br>virtual-desktop://apps/media-player | Dispatch sample MCP capability ipfs_kit_py:configured:audit_analytics_get_compliance_score | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:24<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/media-player.png | receipt:sha256:941a5d1340b48831 | covered (8) | audio-summary:audio-summary |
| system-monitor | tool_backed | desktop-icon<br>virtual-desktop://apps/system-monitor | Dispatch sample MCP capability ipfs_accelerate_py:configured_compat:get_dashboard_cache_stats | ipfs_accelerate:24<br>ipfs_kit:17<br>ipfs_datasets:12 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/system-monitor.png | receipt:sha256:917821e3d23b3d4c | covered (17) | mobile-card:mobile-card |
| neural-photoshop | tool_backed | desktop-icon<br>virtual-desktop://apps/neural-photoshop | Dispatch sample MCP capability ipfs_datasets_py:configured:analyze_detection_accuracy | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:32 | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-photoshop.png | receipt:sha256:02943d085929cb69 | covered (9) | audio-summary:audio-summary |
| cinema | tool_backed | desktop-icon<br>virtual-desktop://apps/cinema | Dispatch sample MCP capability ipfs_kit_py:configured:create_car | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:3<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/cinema.png | receipt:sha256:659aaab172ea52ba | covered (2) | audio-summary:audio-summary |
| strudel | manifest_only | desktop-icon<br>virtual-desktop://apps/strudel | Strudel declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/strudel.png | local-fixture:sha256:19942ce16fe519b1 | local_only_not_required (0) | audio-summary:audio-summary |
| strudel-ai-daw | manifest_only | desktop-icon<br>virtual-desktop://apps/strudel-ai-daw | Strudel AI DAW declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/strudel-ai-daw.png | local-fixture:sha256:136076ebdc9df8d6 | local_only_not_required (0) | audio-summary:audio-summary |
| music-studio | manifest_only | desktop-icon<br>virtual-desktop://apps/music-studio | Music Studio Classic declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/music-studio.png | local-fixture:sha256:51a57aaf6c7aa652 | local_only_not_required (0) | audio-summary:audio-summary |
| p2p-chat | tool_backed | desktop-icon<br>virtual-desktop://apps/p2p-chat | P2P Chat Classic declares Python backend families in the canonical manifest, but no app-visible all-tools binding row is currently materialized for this app. | ipfs_accelerate:not_declared<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat.png | receipt:sha256:cc407ed9746049b2 | local_only_not_required (0) | audio-summary:audio-summary |
| datasets-browser | manifest_only | desktop-hook<br>virtual-desktop://apps/datasets-browser | Render generated service surface DescriptorAppComponent | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/datasets-browser.png | local-fixture:sha256:d1f13fc5fc01b0d4 | synthesized_service_surface_descriptor (1) | idl-generated:native-display |
| accelerate-panel | manifest_only | desktop-hook<br>virtual-desktop://apps/accelerate-panel | Render generated service surface DescriptorAppComponent | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/accelerate-panel.png | local-fixture:sha256:92423db8ef582b1e | synthesized_service_surface_descriptor (1) | idl-generated:native-display |
| idl-explorer | local_only | desktop-hook<br>virtual-desktop://apps/idl-explorer | Render generated service surface IDLExplorerApp | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/idl-explorer.png | local-fixture:sha256:26423caceba69a8b | synthesized_service_surface_descriptor (1) | manual:native-display |
| glasses-preview | local_only | desktop-hook<br>virtual-desktop://apps/glasses-preview | Render generated service surface GlassesPreviewApp | ipfs_accelerate:not_declared<br>ipfs_kit:not_declared<br>ipfs_datasets:not_declared | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/glasses-preview.png | local-fixture:sha256:8461bc2e9ac534d5 | synthesized_service_surface_descriptor (1) | manual:native-display |
| orb-auto-ui | manifest_only | desktop-hook<br>virtual-desktop://apps/orb-auto-ui | Render generated service surface ORBAutoUILauncher | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/orb-auto-ui.png | local-fixture:sha256:aac738f4ea00732e | synthesized_service_surface_descriptor (1) | manual:native-display |
| mcp-plus-plus | manifest_only | desktop-hook<br>virtual-desktop://apps/mcp-plus-plus | Render generated service surface MCPPlusPlusExplorer | ipfs_accelerate:declared_no_tool_binding<br>ipfs_kit:declared_no_tool_binding<br>ipfs_datasets:declared_no_tool_binding | success:covered<br>fallback:covered<br>error:covered<br>denied:covered | covered | covered | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/mcp-plus-plus.png | local-fixture:sha256:3bd72270309804eb | local_only_not_required (0) | mobile-card:mobile-card |
>>>>>>> Stashed changes

## Release Semantics

- Every canonical manifest app has one backend-contract row and one executable behavior row.
- Backend capabilities are assigned independently for `ipfs_accelerate_py`, `ipfs_kit_py`, and `ipfs_datasets_py`; declared but unbound families remain visible as `declared_no_tool_binding` instead of disappearing into aggregate counts.
- Behavior evidence must include success, fallback, error, and denied states; keyboard and pointer checks; a screenshot reference; a receipt or deterministic fixture; ORB/IDL descriptor disposition; and glasses strategy.
- Rows represented only by screenshots are release blockers.

## Frozen Backend Contract

`test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json` freezes one canonical record per app, including launch owner, backend capability set, MCP/MCP++ eligibility, policy class, receipt strategy, ORB/IDL state, glasses handoff strategy, and success/fallback/error UX scenarios.

| App | Canonical aliases | Backend caps | Local-only rationale | ORB/IDL | UX scenarios |
| --- | --- | ---: | --- | --- | --- |
| ai-chat | - | 8 | - | manual:3 | success/fallback/error |
| api-keys | - | 9 | - | not-required:0 | success/fallback/error |
| calculator | - | 0 | yes | not-required:0 | success/fallback/error |
| calendar | - | 0 | yes | not-required:0 | success/fallback/error |
| cinema | - | 1 | - | manual:1 | success/fallback/error |
| clock | - | 0 | yes | not-required:0 | success/fallback/error |
| cron | - | 0 | yes | not-required:0 | success/fallback/error |
| device-manager | - | 21 | - | manual:6 | success/fallback/error |
| file-manager | - | 125 | - | manual:13 | success/fallback/error |
| friends-list | - | 2 | - | manual:1 | success/fallback/error |
| github | - | 45 | - | manual:15 | success/fallback/error |
| huggingface | - | 14 | - | manual:6 | success/fallback/error |
| image-viewer | - | 2 | - | manual:1 | success/fallback/error |
| ipfs-explorer | - | 20 | - | manual:9 | success/fallback/error |
| mcp-control | - | 55 | - | manual:15 | success/fallback/error |
| media-player | - | 17 | - | manual:5 | success/fallback/error |
| model-browser | - | 39 | - | manual:11 | success/fallback/error |
| music-studio | strudel-grandma | 0 | yes | not-required:0 | success/fallback/error |
| music-studio-unified | - | 0 | yes | not-required:0 | success/fallback/error |
| navi | - | 3 | - | manual:2 | success/fallback/error |
| neural-network-designer | - | 27 | - | manual:7 | success/fallback/error |
| neural-photoshop | - | 30 | - | manual:7 | success/fallback/error |
| notes | - | 46 | - | manual:12 | success/fallback/error |
| oauth-login | - | 0 | yes | not-required:0 | success/fallback/error |
| openrouter | - | 0 | yes | not-required:0 | success/fallback/error |
| p2p-chat | p2p-chat-offline | 1 | - | manual:1 | success/fallback/error |
| p2p-chat-unified | - | 1 | - | manual:1 | success/fallback/error |
| p2p-network | - | 21 | - | manual:3 | success/fallback/error |
| peertube | - | 19 | - | manual:3 | success/fallback/error |
| settings | - | 0 | yes | not-required:0 | success/fallback/error |
| strudel | - | 0 | yes | not-required:0 | success/fallback/error |
| strudel-ai-daw | - | 0 | yes | not-required:0 | success/fallback/error |
| system-monitor | - | 48 | - | manual:14 | success/fallback/error |
| task-manager | - | 0 | yes | not-required:0 | success/fallback/error |
| terminal | - | 0 | yes | not-required:0 | success/fallback/error |
| todo | - | 0 | yes | not-required:0 | success/fallback/error |
| training-manager | - | 43 | - | manual:11 | success/fallback/error |
| vibecode | code-editor | 33 | - | manual:6 | success/fallback/error |
| datasets-browser | - | 63 | - | manual:16 | success/fallback/error |
| accelerate-panel | - | 8 | - | manual:2 | success/fallback/error |
| idl-explorer | - | 3 | - | manual:1 | success/fallback/error |
| glasses-preview | - | 0 | yes | not-required:0 | success/fallback/error |
| orb-auto-ui | - | 15 | - | manual:8 | success/fallback/error |
| mcp-plus-plus | - | 70 | - | manual:20 | success/fallback/error |
| agent-supervisor | - | 33 | - | manual:6 | success/fallback/error |

