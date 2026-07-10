# Virtual Desktop Tool UI Smoke Evidence

SWR-085 covers every virtual desktop app whose SWR-084 matrix row is `tool_backed`.
The Playwright smoke opens each app through the desktop icon path, waits for the MCP capability control panel, records success/fallback/error UI receipts, and captures a screenshot for the rendered app window.

## Evidence Artifacts

- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.md`
- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/`

## Validation

- `npm run test:e2e:mcp`
- `npm run evidence:mcp-glasses`

## Required UI States

- `success`: the app records an MCP-backed receipt using its intended service family and representative tool ids.
- `fallback`: the app exposes the degraded or desktop/mobile confirmation path without breaking the window shell.
- `error`: the app records an error-state receipt while keeping the desktop window interactive.

## Current Coverage

| App | Backends | App-visible | Fallback/desktop | States | Screenshot |
| --- | --- | ---: | ---: | --- | --- |
| ai-chat | ipfs_accelerate_py | 5 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ai-chat.png |
| api-keys | ipfs_kit_py | 0 | 10 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/api-keys.png |
| cinema | ipfs_kit_py | 2 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/cinema.png |
| device-manager | ipfs_accelerate_py | 13 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/device-manager.png |
| file-manager | ipfs_kit_py | 119 | 10 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/file-manager.png |
| friends-list | ipfs_kit_py | 2 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/friends-list.png |
| github | ipfs_accelerate_py, ipfs_datasets_py | 33 | 2 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/github.png |
| huggingface | ipfs_accelerate_py | 7 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/huggingface.png |
| image-viewer | ipfs_kit_py | 6 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/image-viewer.png |
| ipfs-explorer | ipfs_kit_py | 32 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/ipfs-explorer.png |
| mcp-control | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | 53 | 5 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/mcp-control.png |
| media-player | ipfs_kit_py | 25 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/media-player.png |
| model-browser | ipfs_accelerate_py, ipfs_datasets_py | 54 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/model-browser.png |
| navi | ipfs_accelerate_py | 3 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/navi.png |
| neural-network-designer | ipfs_accelerate_py, ipfs_datasets_py | 28 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-network-designer.png |
| neural-photoshop | ipfs_accelerate_py, ipfs_datasets_py | 28 | 8 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/neural-photoshop.png |
| notes | ipfs_datasets_py | 50 | 1 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/notes.png |
| p2p-chat | ipfs_kit_py | 1 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat.png |
| p2p-chat-unified | ipfs_kit_py | 1 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-chat-unified.png |
| p2p-network | ipfs_kit_py, ipfs_accelerate_py | 14 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/p2p-network.png |
| peertube | ipfs_kit_py | 21 | 2 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/peertube.png |
| system-monitor | ipfs_kit_py, ipfs_accelerate_py | 41 | 5 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/system-monitor.png |
| training-manager | ipfs_accelerate_py, ipfs_datasets_py | 81 | 4 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/training-manager.png |
| vibecode | ipfs_datasets_py | 46 | 0 | success, fallback, error | test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/vibecode.png |
