/**
 * Law view ids from the site law view and `data/schema.ts`.
 *
 * Instrument version is `INTERFACE_ID` in `kinds/law_v1.py`.
 * Source and verify schema ids are `SCHEMA_VERSION` in
 * `country_laws_ir/__init__.py` and `country_laws_ir/verify.py`.
 * The section id is `LAW_SECTION_SCHEMA`. This module does not read a
 * network address.
 */

export const LAW_SOURCE_VIEW_ID = 'worldwide-legal-search.law-source@1' as const;
export const LAW_SECTION_SCHEMA_ID = 'worldwide-legal-search.law-section@1' as const;
export const LAW_KIND_VERSION = 'legal-corpus.law@1' as const;
export const LAW_SOURCE_SCHEMA_VERSION = 'country-laws-ir-graphrag/v1' as const;
export const LAW_VERIFY_SCHEMA_VERSION = 'country-laws-normalize-verify/v1' as const;
export const LAW_REFUSED_KIND_VERSION = 'legal-corpus.caselaw@1' as const;

export const lawView = {
  viewId: LAW_SOURCE_VIEW_ID,
  sectionSchema: LAW_SECTION_SCHEMA_ID,
  kindVersion: LAW_KIND_VERSION,
  sourceSchemaVersion: LAW_SOURCE_SCHEMA_VERSION,
  verifySchemaVersion: LAW_VERIFY_SCHEMA_VERSION,
  refuses: [LAW_REFUSED_KIND_VERSION] as const,
} as const;
