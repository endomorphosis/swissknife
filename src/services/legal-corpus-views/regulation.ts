/**
 * Regulation view id from the site regulation view.
 *
 * Instrument version is `INTERFACE_ID` in `kinds/regulation_v1.py`.
 * Source schema ids are the `SCHEMA_VERSION` assignments named by that
 * kind's register: the five versioned regulation processors. Fixture
 * schema ids are not included. The statute schema id is refused.
 */

export const REGULATION_VIEW_ID = 'worldwide-legal-search.regulation-view@1' as const;
export const REGULATION_KIND_VERSION = 'legal-corpus.regulation@1' as const;
export const REGULATION_SOURCE_SCHEMA_IDS = [
  'cfr-annual-processor-v1',
  'live-cfr-source-processor-v1',
  'ecfr-crosscheck-processor-v1',
  'federal-register-change-processor-v1',
  'federal-register-sparse-graphrag-release-schema-v2',
] as const;
export const REGULATION_REFUSED_STATUTE_SCHEMA = 'country-laws-ir-graphrag/v1' as const;
export const REGULATION_REFUSED_LAW_VIEW_ID = 'worldwide-legal-search.law-source@1' as const;

export const regulationView = {
  viewId: REGULATION_VIEW_ID,
  kindVersion: REGULATION_KIND_VERSION,
  sourceSchemaIds: REGULATION_SOURCE_SCHEMA_IDS,
  refuses: [REGULATION_REFUSED_STATUTE_SCHEMA, REGULATION_REFUSED_LAW_VIEW_ID] as const,
} as const;
