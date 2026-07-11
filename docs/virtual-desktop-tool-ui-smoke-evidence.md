# Virtual Desktop Tool UI Smoke Evidence

SWR-096 proves every virtual desktop app whose all-tools matrix row is `tool_backed` keeps a browser-compatible UI path. SWR-102 extends that evidence into an exhaustive workflow matrix for every canonical desktop app.
The Playwright smoke opens apps through desktop icon paths, records visible loading/success/fallback/error states, checks keyboard and pointer access, captures screenshots, and links each workflow to either MCP receipts or controlled fixture receipts.

## Evidence Artifacts

- `test-results/virtual-desktop-ipfs-mcp-orb/app-workflow-matrix.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/`
- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.md`
- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/`

## Validation

- `npm run test:e2e:mcp`
- `npm run evidence:mcp-glasses`

## SWR-102 Workflow Summary

- Canonical apps covered: 45/45
- Apps with pointer launch: 45
- Apps with keyboard launch: 45
- Apps with loading/success/fallback/error states: 45
- Apps with receipt or controlled-fixture evidence: 45
- Screenshot directory: `test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots`

## Complete Catalog Routing

- ipfs_accelerate_py: available; flat=122; hierarchical=122; routed through MCP Control, Supervisor Console, Terminal
- ipfs_datasets_py: available; flat=340; hierarchical=150; routed through MCP Control, Supervisor Console, Terminal
- ipfs_kit_py: available; flat=208; hierarchical=204; routed through MCP Control, Supervisor Console, Terminal

## Required UI States

- `success`: the app records an MCP-backed receipt using its intended service family and representative tool ids.
- `fallback`: the app exposes the degraded or desktop/mobile confirmation path without breaking the window shell.
- `error`: the app records an error-state receipt while keeping the desktop window interactive.

## Browser Safety Contract

Each receipt is recorded from a Playwright browser page and asserts that no Node builtins, Python wrappers, host subprocesses, physical glasses, or unavailable native adapters are required. In particular, no app smoke path requires Node builtins, Python wrappers, host subprocesses, physical glasses, or unavailable native adapters. Optional device, host, and glasses features must appear only as browser fallback, desktop/mobile confirmation, or simulator handoff paths.

## SWR-102 Per-App Workflow Matrix

| App | Backend State | Backends | Catalog Route | States | Keyboard | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| terminal | not_applicable | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Terminal | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/01-terminal.png |
| vibecode | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/02-vibecode.png |
| music-studio-unified | manifest_only | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/03-music-studio-unified.png |
| ai-chat | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/04-ai-chat.png |
| file-manager | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/05-file-manager.png |
| task-manager | manifest_only | ipfs_accelerate_py, ipfs_datasets_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/06-task-manager.png |
| todo | manifest_only | ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/07-todo.png |
| model-browser | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/08-model-browser.png |
| huggingface | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/09-huggingface.png |
| openrouter | manifest_only | ipfs_accelerate_py, ipfs_datasets_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/10-openrouter.png |
| ipfs-explorer | tool_backed | ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/11-ipfs-explorer.png |
| device-manager | tool_backed | ipfs_accelerate_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/12-device-manager.png |
| settings | manifest_only | local | local-only | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/13-settings.png |
| mcp-control | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/14-mcp-control.png |
| api-keys | tool_backed | ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/15-api-keys.png |
| github | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/16-github.png |
| oauth-login | manifest_only | local | local-only | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/17-oauth-login.png |
| cron | manifest_only | ipfs_accelerate_py, ipfs_datasets_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/18-cron.png |
| navi | tool_backed | ipfs_accelerate_py, ipfs_datasets_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/19-navi.png |
| p2p-network | tool_backed | ipfs_accelerate_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/20-p2p-network.png |
| p2p-chat-unified | tool_backed | ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/21-p2p-chat-unified.png |
| neural-network-designer | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/22-neural-network-designer.png |
| training-manager | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/23-training-manager.png |
| calculator | not_applicable | local | local-only | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/24-calculator.png |
| clock | not_applicable | local | local-only | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/25-clock.png |
| calendar | manifest_only | ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/26-calendar.png |
| peertube | tool_backed | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/27-peertube.png |
| friends-list | tool_backed | ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/28-friends-list.png |
| image-viewer | tool_backed | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/29-image-viewer.png |
| notes | tool_backed | ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/30-notes.png |
| media-player | tool_backed | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/31-media-player.png |
| system-monitor | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/32-system-monitor.png |
| neural-photoshop | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/33-neural-photoshop.png |
| cinema | tool_backed | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/34-cinema.png |
| strudel | manifest_only | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/35-strudel.png |
| strudel-ai-daw | manifest_only | ipfs_accelerate_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/36-strudel-ai-daw.png |
| music-studio | manifest_only | ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/37-music-studio.png |
| p2p-chat | tool_backed | ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/38-p2p-chat.png |
| datasets-browser | tool_backed | ipfs_datasets_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/39-datasets-browser.png |
| accelerate-panel | tool_backed | ipfs_accelerate_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/40-accelerate-panel.png |
| idl-explorer | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/41-idl-explorer.png |
| glasses-preview | not_applicable | local | local-only | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/42-glasses-preview.png |
| orb-auto-ui | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/43-orb-auto-ui.png |
| mcp-plus-plus | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | MCP Control | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/44-mcp-plus-plus.png |
| agent-supervisor | tool_backed | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | Supervisor Console | loading, success, fallback, error | yes | test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/45-agent-supervisor.png |

## Tool-Backed Current Coverage

| App | Backends | App-visible | Fallback/desktop | States | Screenshot |
| --- | --- | ---: | ---: | --- | --- |
| accelerate-panel | ipfs_accelerate_py | 4 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/accelerate-panel.png |
| agent-supervisor | ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py | 19 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/agent-supervisor.png |
| ai-chat | ipfs_accelerate_py | 5 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ai-chat.png |
<<<<<<< Updated upstream
| api-keys | ipfs_kit_py | 0 | 9 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/api-keys.png |
| cinema | ipfs_kit_py | 1 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/cinema.png |
| datasets-browser | ipfs_datasets_py | 63 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/datasets-browser.png |
| device-manager | ipfs_accelerate_py | 12 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/device-manager.png |
| file-manager | ipfs_kit_py | 110 | 8 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/file-manager.png |
| friends-list | ipfs_kit_py | 2 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/friends-list.png |
| github | ipfs_accelerate_py, ipfs_datasets_py | 27 | 2 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/github.png |
| huggingface | ipfs_accelerate_py | 7 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/huggingface.png |
| idl-explorer | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 3 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/idl-explorer.png |
| image-viewer | ipfs_kit_py | 2 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/image-viewer.png |
| ipfs-explorer | ipfs_kit_py | 19 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ipfs-explorer.png |
| mcp-control | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 40 | 4 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/mcp-control.png |
| mcp-plus-plus | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 67 | 3 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/mcp-plus-plus.png |
| media-player | ipfs_kit_py | 17 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/media-player.png |
| model-browser | ipfs_accelerate_py, ipfs_datasets_py | 38 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/model-browser.png |
| navi | ipfs_accelerate_py | 2 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/navi.png |
| neural-network-designer | ipfs_accelerate_py, ipfs_datasets_py | 27 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-network-designer.png |
| neural-photoshop | ipfs_accelerate_py, ipfs_datasets_py | 22 | 8 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-photoshop.png |
| notes | ipfs_datasets_py | 45 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/notes.png |
| orb-auto-ui | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 14 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/orb-auto-ui.png |
| p2p-chat | ipfs_kit_py | 1 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat.png |
| p2p-chat-unified | ipfs_kit_py | 1 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat-unified.png |
| p2p-network | ipfs_kit_py, ipfs_accelerate_py | 12 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-network.png |
| peertube | ipfs_kit_py | 17 | 2 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/peertube.png |
| system-monitor | ipfs_kit_py, ipfs_accelerate_py | 35 | 5 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/system-monitor.png |
| training-manager | ipfs_accelerate_py, ipfs_datasets_py | 20 | 4 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/training-manager.png |
| vibecode | ipfs_datasets_py | 33 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/vibecode.png |
=======
| api-keys | ipfs_kit_py | 0 | 10 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/api-keys.png |
| cinema | ipfs_kit_py | 3 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/cinema.png |
| device-manager | ipfs_accelerate_py | 13 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/device-manager.png |
| file-manager | ipfs_kit_py | 83 | 11 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/file-manager.png |
| friends-list | ipfs_kit_py | 0 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/friends-list.png |
| github | ipfs_accelerate_py, ipfs_datasets_py | 26 | 2 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/github.png |
| huggingface | ipfs_accelerate_py | 7 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/huggingface.png |
| image-viewer | ipfs_kit_py | 6 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/image-viewer.png |
| ipfs-explorer | ipfs_kit_py | 25 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ipfs-explorer.png |
| mcp-control | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 29 | 4 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/mcp-control.png |
| media-player | ipfs_kit_py | 24 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/media-player.png |
| model-browser | ipfs_accelerate_py, ipfs_datasets_py | 47 | 2 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/model-browser.png |
| navi | ipfs_accelerate_py | 3 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/navi.png |
| neural-network-designer | ipfs_accelerate_py, ipfs_datasets_py | 27 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-network-designer.png |
| neural-photoshop | ipfs_accelerate_py, ipfs_datasets_py | 24 | 8 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-photoshop.png |
| notes | ipfs_datasets_py | 42 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/notes.png |
| p2p-chat | ipfs_kit_py | 0 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat.png |
| p2p-chat-unified | ipfs_kit_py | 0 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat-unified.png |
| p2p-network | ipfs_kit_py, ipfs_accelerate_py | 13 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-network.png |
| peertube | ipfs_kit_py | 13 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/peertube.png |
| system-monitor | ipfs_kit_py, ipfs_accelerate_py | 39 | 5 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/system-monitor.png |
| training-manager | ipfs_accelerate_py, ipfs_datasets_py | 77 | 4 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/training-manager.png |
| vibecode | ipfs_datasets_py | 41 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/vibecode.png |
>>>>>>> Stashed changes
