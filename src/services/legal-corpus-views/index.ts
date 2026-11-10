/**
 * SwissKnife legal-corpus view package.
 *
 * Exports the site view ids from LCM-060 through LCM-065 and the municipal
 * view id. Each view names the instrument version it accepts. Place is an
 * argument. This package does not take a network address and does not edit
 * the visual-functional board.
 */

export {
  CONTRACT_FIELD_NAMES,
  INSTRUMENT_INTERFACE_ID,
  INSTRUMENT_VIEW_CONTRACT_ID,
  JURISDICTION_APPLICABILITY,
  KIND_VERSIONS,
  QUERY_PLACE,
  VIEW_BINDINGS,
  UnknownInstrumentVersionError,
  acceptInstrumentVersion,
  acceptViewInstrument,
  instrumentViewContract,
  kindVersionForView,
} from './contract.js';
export type { KindName, KindVersion, ViewBinding } from './contract.js';

export {
  LAW_KIND_VERSION,
  LAW_REFUSED_KIND_VERSION,
  LAW_SECTION_SCHEMA_ID,
  LAW_SOURCE_SCHEMA_VERSION,
  LAW_SOURCE_VIEW_ID,
  LAW_VERIFY_SCHEMA_VERSION,
  lawView,
} from './law.js';

export {
  CASELAW_KIND_VERSION,
  CASELAW_REFUSED_KIND_VERSION,
  CASELAW_REFUSED_VIEW_ID,
  CASELAW_SOURCE_SCHEMA_ID,
  CASELAW_VIEW_ID,
  caselawView,
} from './caselaw.js';

export {
  REGULATION_KIND_VERSION,
  REGULATION_REFUSED_LAW_VIEW_ID,
  REGULATION_REFUSED_STATUTE_SCHEMA,
  REGULATION_SOURCE_SCHEMA_IDS,
  REGULATION_VIEW_ID,
  regulationView,
} from './regulation.js';

export {
  ACT_SOURCE_SCHEMA_IDS,
  LEGISLATIVE_ACT_KIND_VERSION,
  LEGISLATIVE_ACT_REFUSED_LAW_KIND,
  LEGISLATIVE_ACT_VIEW_ID,
  USCODE_LAW_SCHEMA_IDS,
  legislativeActView,
} from './legislative-act.js';

export {
  COURT_KIND_VERSION,
  COURT_REFUSED_CASELAW_KIND,
  COURT_REFUSED_STATUTE_SCHEMA,
  COURT_SOURCE_SCHEMA_ID,
  COURT_VIEW_ID,
  courtView,
} from './court.js';
export type { CourtViewModel } from './court.js';

export {
  MUNICIPAL_INSTRUMENT_VIEW_ID,
  MUNICIPAL_KIND_VERSION,
  MUNICIPAL_SOURCE_SCHEMA_FILE,
  municipalInstrumentView,
} from './municipal-instrument.js';
