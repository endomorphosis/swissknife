# MCP++ Descriptor Authoring CLI

`scripts/mcp-plus-plus/descriptor_cli.mjs` provides offline authoring checks for generated desktop app descriptors.

Commands:

- `lint <descriptor.json|directory>` checks required MCP++ UI Profile sections.
- `validate <descriptor.json>` checks operation, service, template, permission, schema, and stream references.
- `compat <base.json> <candidate.json>` rejects removed methods or permission contracts.
- `verify-trust <descriptor.json> [--require-signature] [--allowed-publishers a,b] [--allowed-signers did:key:z...]` verifies descriptor signing metadata, canonical CID, Ed25519 did:key signatures, and allowlists.
- `scaffold <starter-pack> <output.json>` writes a starter descriptor.
- `starter-packs` lists available archetypes.

Starter packs:

- `crud`
- `explorer`
- `stream-dashboard`
- `job-console`
- `dataset-inference-workflow`

Example:

```bash
node scripts/mcp-plus-plus/descriptor_cli.mjs scaffold dataset-inference-workflow /tmp/workflow.json --app-id my-workflow --title "My Workflow"
node scripts/mcp-plus-plus/descriptor_cli.mjs validate /tmp/workflow.json
node scripts/mcp-plus-plus/descriptor_cli.mjs verify-trust /tmp/workflow.json --allowed-publishers local
```

Publishing this descriptor plus a template mapping is enough for the generated app launcher to discover and render the app shell; no bespoke virtual desktop app shell code is required.
