# Restored Service Duplicate Inventory

Task: SWR-118

This report inventories every non-index duplicate basename currently present under `src/services`.
Index barrels are ignored; broad exemptions are not allowed. Every listed duplicate remains service ownership debt until it is removed, moved, or explicitly promoted to an approved multi-entrypoint in a future task.

## Summary

| Metric | Value |
| --- | --- |
| Duplicate basenames | 0 |
| Unapproved duplicate basenames | 0 |
| Duplicate paths | 0 |
| Restored root files after Phase 16 cleanup | 0 |
| Duplicate basenames with restored root copies | 0 |
| Duplicate basenames without restored root copies | 0 |
| Disposition counts |  |
| Runtime classifications |  |
| Browser classifications |  |
| Restored duplicate policy violations | 0 |
| Approved index barrels | 20 |
| Index implementation entrypoints | 1 |
| Index shadow copies | 0 |
| Duplicate content hashes | 2 |
| Unapproved duplicate content hashes | 0 |
| Total import specifiers targeting duplicate paths | 0 |
| Unique importer files | 0 |

## Policy

| Policy | Value |
| --- | --- |
| Ignore index basenames | true |
| Broad exemptions allowed | false |
| Non-index basename duplicates fail by default | true |
| Approved multi-entrypoints | 0 |
| Approved content hashes | 2 |
| Policy violations | 0 |

## Restored Root Files

| Path | Basename | Canonical path | Canonical owner | Disposition | Runtime | Browser classification | Importers | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Service Index Classification

| Path | Classification | Module | Runtime | Browser classification | SHA-256 | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `src/services/fol-utils/index.ts` | `approved-index-barrel` | `service-fol-utils` | `split` | `split-runtime-requires-entrypoint-review` | `4862ed81a171e26e0302dd0eea29fec4d8e9b7b1461ed32b1c2ba08c90555551` | index file contains only type imports and export-from barrel statements |
| `src/services/glasses/index.ts` | `approved-index-barrel` | `service-glasses` | `split` | `split-runtime-requires-entrypoint-review` | `9360486f6161cce95a2d927c6b8aa56a468da2e4e8243dec5dbf35f89953c12f` | index file contains only type imports and export-from barrel statements |
| `src/services/integrations/index.ts` | `approved-index-barrel` | `service-integrations` | `split` | `split-runtime-requires-entrypoint-review` | `c12b0252daa85c9f12c3205be2413e39fa103d69d48c8707dff579593fd0f5e1` | index file contains only type imports and export-from barrel statements |
| `src/services/ipfs/index.ts` | `approved-index-barrel` | `service-ipfs` | `split` | `split-runtime-requires-entrypoint-review` | `d312f872b1e0ddae62a2eb5c5b28e99f69c3a9a98a116f2d88d5358dfa771ac9` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/api/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `52d1417716dec693c63a48511a1e584303ae8459bdd9ac754540300a1e7f7afd` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/bridges/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `713d1fb5b4aeb3513e74a1596d2a9114b033d873ef83992bf40951896c3fb9ce` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/cec/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `b7d9fa0e3606916af2e9132c03b5446e69eebb0399c779330481d78ab6bac793` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/dcec/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `0de6bed9d3cbaeb64e4a007a55f26aa5d75f7e91ead119c4021b3afef542fdb4` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/deontic/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `0e578563f562723d8a1ad42c34e03a5363e81654ed6377387836893c46ff260d` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/fol/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `5554d6973174a90b5c2f28f3b85015ebb63432f3151d59870ae449fdf7a023d0` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/modal/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `d013a660241bf3ada1368a53df050982bae306e9049481955c37b2e26292ebbf` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/nl/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `3ffbfad44ec747ec50130973d23020103346c6164b447939b5ac7f755ebccbee` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/shared/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `0cab97d72cb41ce66edbf13355fda6828526b551c7716936abaa475815cfcb19` | index file contains only type imports and export-from barrel statements |
| `src/services/logic/tdfol/index.ts` | `approved-index-barrel` | `service-logic` | `split` | `split-runtime-requires-entrypoint-review` | `91290d48a5208582197eb754ed8253d2dea1cd71689eed3c6e66f8e5d5c4aa05` | index file contains only type imports and export-from barrel statements |
| `src/services/mcp/index.ts` | `approved-index-barrel` | `service-mcp` | `split` | `split-runtime-requires-entrypoint-review` | `4d5063127e829eba8eb7e385b8147cfca2364137405b03f55931121dd9515480` | index file contains only type imports and export-from barrel statements |
| `src/services/platform/index.ts` | `approved-index-barrel` | `service-platform` | `split` | `split-runtime-requires-entrypoint-review` | `4baca4c4b4aedb54ee94524c294ec883a97d16afbc02a4a18c5bca1a2cfee89c` | index file contains only type imports and export-from barrel statements |
| `src/services/proof-engine/index.ts` | `approved-index-barrel` | `service-proof-engine` | `split` | `split-runtime-requires-entrypoint-review` | `65dc4772921ee69f67cd9ed52f297a30e1c14b36c78f86272ec952819bfe419f` | index file contains only type imports and export-from barrel statements |
| `src/services/provers/index.ts` | `approved-index-barrel` | `service-provers` | `split` | `split-runtime-requires-entrypoint-review` | `f5d44c164fe0a0b2df34218a184b5d5102c5beba4325fb270f6954c99385018b` | index file contains only type imports and export-from barrel statements |
| `src/services/shared/index.ts` | `approved-index-barrel` | `service-shared` | `universal` | `runtime-neutral-module` | `d7e932fd42725694f2def6c92d605e5cb064998672922b5df8545123686d88e7` | index file contains only type imports and export-from barrel statements |
| `src/services/zkp/index.ts` | `approved-index-barrel` | `service-zkp` | `split` | `split-runtime-requires-entrypoint-review` | `ebcd9c67c9fa51516d059481050a9ee47260ab96279af9fac6a0b1faa1aa8717` | index file contains only type imports and export-from barrel statements |
| `src/services/zkp/artifacts/index.ts` | `index-implementation-entrypoint` | `service-zkp` | `split` | `browser-safe-service-file` | `33532271f6ed8b430be170afb98993028e47314348f742916ab11fddf0e03322` | nested index entrypoint contains implementation content and is tracked by content hash |

## Duplicate Content Hashes

| SHA-256 | Canonical path | Canonical owner | Restored root copies | Disposition | Paths |
| --- | --- | --- | --- | --- | --- |
| `a7661d2413b60a722b7d7ff8e52dd3efad86600553eba1c88c990a0b2c11870b` | `src/services/logic/bridges/logic-bridges-browser.ts` | `service-logic` | none | `explicitly-approved-content-hash` | `src/services/glasses/glasses-browser.ts` (service-glasses, service-implementation)<br>`src/services/integrations/integrations-host.ts` (service-integrations, service-implementation)<br>`src/services/logic/bridges/logic-bridges-browser.ts` (service-logic, service-implementation)<br>`src/services/logic/dcec/logic-dcec-browser.ts` (service-logic, service-implementation)<br>`src/services/logic/deontic/logic-deontic-browser.ts` (service-logic, service-implementation)<br>`src/services/logic/fol/logic-fol-browser.ts` (service-logic, service-implementation)<br>`src/services/logic/modal/logic-modal-browser.ts` (service-logic, service-implementation)<br>`src/services/logic/nl/logic-nl-browser.ts` (service-logic, service-implementation)<br>`src/services/logic/shared/logic-shared-browser.ts` (service-logic, service-implementation) |
| `4b3f5b62cf7fb461477447ef6c2b8aa27cb238d303b25d6e542ec31ce13e584d` | `src/services/logic/fol/fol-output-formatters.ts` | `service-logic` | none | `explicitly-approved-content-hash` | `src/services/fol-utils/fol-output-formatter.ts` (service-fol-utils, service-implementation)<br>`src/services/logic/fol/fol-output-formatters.ts` (service-logic, service-implementation) |

## Duplicate Basenames

