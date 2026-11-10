/**
 * Court view id from the site court view.
 *
 * Instrument version is `INTERFACE_ID` in `kinds/court_v1.py`.
 * Source schema id is `UNVERSIONED_SCHEMA_ID` in that file.
 * The view model names that schema id and has no opinion body field.
 */

export const COURT_VIEW_ID = 'worldwide-legal-search.court-view@1' as const;
export const COURT_KIND_VERSION = 'legal-corpus.court@1' as const;
export const COURT_SOURCE_SCHEMA_ID = 'unversioned' as const;
export const COURT_REFUSED_CASELAW_KIND = 'legal-corpus.caselaw@1' as const;
export const COURT_REFUSED_STATUTE_SCHEMA = 'country-laws-ir-graphrag/v1' as const;

export const courtView = {
  viewId: COURT_VIEW_ID,
  kindVersion: COURT_KIND_VERSION,
  sourceSchemaId: COURT_SOURCE_SCHEMA_ID,
  refuses: [COURT_REFUSED_CASELAW_KIND, COURT_REFUSED_STATUTE_SCHEMA] as const,
} as const;

export interface CourtViewModel {
  schema: typeof COURT_VIEW_ID;
  kindVersion: typeof COURT_KIND_VERSION;
  sourceSchemaId: typeof COURT_SOURCE_SCHEMA_ID;
  row: Record<string, unknown>;
}
