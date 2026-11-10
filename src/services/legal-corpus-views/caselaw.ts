/**
 * Caselaw view id from the site caselaw view.
 *
 * Instrument version is `INTERFACE_ID` in `kinds/caselaw_v1.py`.
 * Source schema id is `UNVERSIONED_SCHEMA_ID` in that file.
 * A statute view id is not this instrument version.
 */

export const CASELAW_VIEW_ID = 'worldwide-legal-search.caselaw-view@1' as const;
export const CASELAW_KIND_VERSION = 'legal-corpus.caselaw@1' as const;
export const CASELAW_SOURCE_SCHEMA_ID = 'unversioned' as const;
export const CASELAW_REFUSED_VIEW_ID = 'worldwide-legal-search.law-source@1' as const;
export const CASELAW_REFUSED_KIND_VERSION = 'legal-corpus.law@1' as const;

export const caselawView = {
  viewId: CASELAW_VIEW_ID,
  kindVersion: CASELAW_KIND_VERSION,
  sourceSchemaId: CASELAW_SOURCE_SCHEMA_ID,
  refuses: [CASELAW_REFUSED_VIEW_ID, CASELAW_REFUSED_KIND_VERSION] as const,
} as const;
