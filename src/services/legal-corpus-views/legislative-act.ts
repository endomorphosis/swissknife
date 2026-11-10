/**
 * Legislative-act view id from the site legislative-act view.
 *
 * Instrument version is `INTERFACE_ID` in `kinds/legislative_act_v1.py`.
 * Accepted source schema ids are `SCHEMA_VERSION` and
 * `FIXTURE_SCHEMA_VERSION` in `public_law_change_processor.py`.
 * US Code schema ids from the kind register are refused. They stay law.
 */

export const LEGISLATIVE_ACT_VIEW_ID = 'worldwide-legal-search.legislative-act-view@1' as const;
export const LEGISLATIVE_ACT_KIND_VERSION = 'legal-corpus.legislative-act@1' as const;
export const ACT_SOURCE_SCHEMA_IDS = [
  'public-law-change-processor-v1',
  'public-law-change-fixture-v1',
] as const;
export const USCODE_LAW_SCHEMA_IDS = [
  'uscode-release-processor-v1',
  'uscode-release-fixture-v1',
  'uscode-sparse-graphrag-release-schema-v2',
  'publicus-ir-graphrag/v2',
] as const;
export const LEGISLATIVE_ACT_REFUSED_LAW_KIND = 'legal-corpus.law@1' as const;

export const legislativeActView = {
  viewId: LEGISLATIVE_ACT_VIEW_ID,
  kindVersion: LEGISLATIVE_ACT_KIND_VERSION,
  sourceSchemaIds: ACT_SOURCE_SCHEMA_IDS,
  refuses: [LEGISLATIVE_ACT_REFUSED_LAW_KIND, ...USCODE_LAW_SCHEMA_IDS] as const,
} as const;
