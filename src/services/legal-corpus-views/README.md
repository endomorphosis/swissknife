# Landed display versions

View schema ids below are copied from this package. Place is explicit. GEOIP is absent from the contract fields. This note does not edit `docs/worldwide/supervisor-operations.md`. It does not claim that GitHub Pages is deployed. `tsc`, Jest, and Playwright were not run for this note.

SwissKnife `HEAD` is `e502c79de6d367ca2a04e436e6f59c107c4ffe81`. `src/services/legal-corpus-views/` is untracked at that revision. The strings below were read from the TypeScript in this directory.

## Place

`contract.ts` sets `QUERY_PLACE` to `argument` and `JURISDICTION_APPLICABILITY` to `not-asserted`. Its file comment says place is an argument and that this module does not take a network address. `index.ts` says the same: place is an argument, and the package does not take a network address. `CONTRACT_FIELD_NAMES` is `applicability`, `instrument`, `queryPlace`, `schema`, `views`. That list has no geoip name. `instrumentViewContract` assigns `queryPlace` from `QUERY_PLACE`.

## Contract

`contract.ts` exports `INSTRUMENT_VIEW_CONTRACT_ID` `worldwide-legal-search.instrument-view-contract@1` and `INSTRUMENT_INTERFACE_ID` `legal-corpus.instrument@1`. `instrumentViewContract.schema` is the contract id. `VIEW_BINDINGS` names these view ids, in order, each with the instrument version the package accepts:

| View id | Instrument version |
| --- | --- |
| `worldwide-legal-search.law-source@1` | `legal-corpus.law@1` |
| `worldwide-legal-search.caselaw-view@1` | `legal-corpus.caselaw@1` |
| `worldwide-legal-search.regulation-view@1` | `legal-corpus.regulation@1` |
| `worldwide-legal-search.legislative-act-view@1` | `legal-corpus.legislative-act@1` |
| `worldwide-legal-search.court-view@1` | `legal-corpus.court@1` |
| `worldwide-legal-search.municipal-instrument-view@1` | `legal-corpus.municipal-instrument@1` |

## Law

`law.ts` exports `LAW_SOURCE_VIEW_ID` `worldwide-legal-search.law-source@1` and `LAW_SECTION_SCHEMA_ID` `worldwide-legal-search.law-section@1`. `LAW_KIND_VERSION` is `legal-corpus.law@1`. `LAW_SOURCE_SCHEMA_VERSION` is `country-laws-ir-graphrag/v1`. `LAW_VERIFY_SCHEMA_VERSION` is `country-laws-normalize-verify/v1`. `lawView.refuses` is `legal-corpus.caselaw@1`. The file comment says this module does not read a network address.

## Caselaw

`caselaw.ts` exports `CASELAW_VIEW_ID` `worldwide-legal-search.caselaw-view@1` and `CASELAW_KIND_VERSION` `legal-corpus.caselaw@1`. `CASELAW_SOURCE_SCHEMA_ID` is `unversioned`. `caselawView.refuses` is `worldwide-legal-search.law-source@1` and `legal-corpus.law@1`.

## Regulation

`regulation.ts` exports `REGULATION_VIEW_ID` `worldwide-legal-search.regulation-view@1` and `REGULATION_KIND_VERSION` `legal-corpus.regulation@1`. `REGULATION_SOURCE_SCHEMA_IDS` is:

- `cfr-annual-processor-v1`
- `live-cfr-source-processor-v1`
- `ecfr-crosscheck-processor-v1`
- `federal-register-change-processor-v1`
- `federal-register-sparse-graphrag-release-schema-v2`

`regulationView.refuses` is `country-laws-ir-graphrag/v1` and `worldwide-legal-search.law-source@1`.

## Legislative act

`legislative-act.ts` exports `LEGISLATIVE_ACT_VIEW_ID` `worldwide-legal-search.legislative-act-view@1` and `LEGISLATIVE_ACT_KIND_VERSION` `legal-corpus.legislative-act@1`. `ACT_SOURCE_SCHEMA_IDS` is `public-law-change-processor-v1` and `public-law-change-fixture-v1`. `legislativeActView.refuses` is `legal-corpus.law@1` plus `USCODE_LAW_SCHEMA_IDS`:

- `uscode-release-processor-v1`
- `uscode-release-fixture-v1`
- `uscode-sparse-graphrag-release-schema-v2`
- `publicus-ir-graphrag/v2`

## Court

`court.ts` exports `COURT_VIEW_ID` `worldwide-legal-search.court-view@1` and `COURT_KIND_VERSION` `legal-corpus.court@1`. `COURT_SOURCE_SCHEMA_ID` is `unversioned`. The file comment says the view model names that schema id and has no opinion body field. `courtView.refuses` is `legal-corpus.caselaw@1` and `country-laws-ir-graphrag/v1`. `CourtViewModel` fields are `schema`, `kindVersion`, `sourceSchemaId`, and `row`.

## Municipal instrument

`municipal-instrument.ts` exports `MUNICIPAL_INSTRUMENT_VIEW_ID` `worldwide-legal-search.municipal-instrument-view@1` and `MUNICIPAL_KIND_VERSION` `legal-corpus.municipal-instrument@1`. `MUNICIPAL_SOURCE_SCHEMA_FILE` is `world_municipal/schema.py`. The file comment says that path assigns no `SCHEMA_VERSION`.
