/**
 * Municipal view id from the site display contract and LCM-067.
 *
 * Instrument version is `INTERFACE_ID` in `kinds/municipal_instrument_v1.py`.
 * `world_municipal/schema.py` assigns no `SCHEMA_VERSION`. The source
 * citation is `SOURCE_SCHEMA_FILE` in the kind module.
 */

export const MUNICIPAL_INSTRUMENT_VIEW_ID =
  'worldwide-legal-search.municipal-instrument-view@1' as const;
export const MUNICIPAL_KIND_VERSION = 'legal-corpus.municipal-instrument@1' as const;
export const MUNICIPAL_SOURCE_SCHEMA_FILE = 'world_municipal/schema.py' as const;

export const municipalInstrumentView = {
  viewId: MUNICIPAL_INSTRUMENT_VIEW_ID,
  kindVersion: MUNICIPAL_KIND_VERSION,
  sourceSchemaFile: MUNICIPAL_SOURCE_SCHEMA_FILE,
} as const;
