/**
 * SwissKnife display contract for the legal-corpus view ids.
 *
 * View ids match the site contract `worldwide-legal-search.instrument-view-contract@1`
 * and the site views for law, caselaw, regulation, legislative act, and court,
 * plus the municipal view id. Each binding names the instrument version it
 * accepts. Any other instrument version is refused.
 *
 * Place is an argument. This module does not take a network address.
 * Jurisdiction applicability stays `not-asserted`.
 */

import { caselawView } from './caselaw.js';
import { courtView } from './court.js';
import { lawView } from './law.js';
import { legislativeActView } from './legislative-act.js';
import { municipalInstrumentView } from './municipal-instrument.js';
import { regulationView } from './regulation.js';

export const INSTRUMENT_VIEW_CONTRACT_ID =
  'worldwide-legal-search.instrument-view-contract@1' as const;

/** Shared instrument interface. Not a kind version a view accepts. */
export const INSTRUMENT_INTERFACE_ID = 'legal-corpus.instrument@1' as const;

/** The query place is an argument supplied by the caller. */
export const QUERY_PLACE = 'argument' as const;

export const JURISDICTION_APPLICABILITY = 'not-asserted' as const;

export const KIND_VERSIONS = {
  law: lawView.kindVersion,
  regulation: regulationView.kindVersion,
  legislative_act: legislativeActView.kindVersion,
  caselaw: caselawView.kindVersion,
  court: courtView.kindVersion,
  municipal_instrument: municipalInstrumentView.kindVersion,
} as const;

export type KindName = keyof typeof KIND_VERSIONS;
export type KindVersion = (typeof KIND_VERSIONS)[KindName];

export interface ViewBinding {
  viewId: string;
  kindVersion: KindVersion;
  sectionSchema?: string;
  sourceSchemaVersion?: string;
  verifySchemaVersion?: string;
  sourceSchemaId?: string;
  sourceSchemaIds?: readonly string[];
  sourceSchemaFile?: string;
  refuses?: readonly string[];
}

/**
 * Statute view, then the reserved kind views in the site contract's order.
 * The municipal id is included with the others.
 */
export const VIEW_BINDINGS: readonly ViewBinding[] = [
  {
    viewId: lawView.viewId,
    kindVersion: lawView.kindVersion,
    sectionSchema: lawView.sectionSchema,
    sourceSchemaVersion: lawView.sourceSchemaVersion,
    verifySchemaVersion: lawView.verifySchemaVersion,
    refuses: lawView.refuses,
  },
  {
    viewId: caselawView.viewId,
    kindVersion: caselawView.kindVersion,
    sourceSchemaId: caselawView.sourceSchemaId,
    refuses: caselawView.refuses,
  },
  {
    viewId: regulationView.viewId,
    kindVersion: regulationView.kindVersion,
    sourceSchemaIds: regulationView.sourceSchemaIds,
    refuses: regulationView.refuses,
  },
  {
    viewId: legislativeActView.viewId,
    kindVersion: legislativeActView.kindVersion,
    sourceSchemaIds: legislativeActView.sourceSchemaIds,
    refuses: legislativeActView.refuses,
  },
  {
    viewId: courtView.viewId,
    kindVersion: courtView.kindVersion,
    sourceSchemaId: courtView.sourceSchemaId,
    refuses: courtView.refuses,
  },
  {
    viewId: municipalInstrumentView.viewId,
    kindVersion: municipalInstrumentView.kindVersion,
    sourceSchemaFile: municipalInstrumentView.sourceSchemaFile,
  },
];

const ACCEPTED_KIND_VERSIONS: ReadonlySet<string> = new Set(Object.values(KIND_VERSIONS));

export class UnknownInstrumentVersionError extends Error {
  readonly version: string;

  constructor(version: string) {
    super(`unknown instrument version ${version}`);
    this.name = 'UnknownInstrumentVersionError';
    this.version = version;
  }
}

/** Accept a kind version this package can render. Any other string is rejected. */
export function acceptInstrumentVersion(version: string): KindVersion {
  if (!ACCEPTED_KIND_VERSIONS.has(version)) {
    throw new UnknownInstrumentVersionError(version);
  }
  return version as KindVersion;
}

/** Return the instrument version named by one exported view id. */
export function kindVersionForView(viewId: string): KindVersion {
  const binding = VIEW_BINDINGS.find((row) => row.viewId === viewId);
  if (binding === undefined) {
    throw new UnknownInstrumentVersionError(viewId);
  }
  return acceptInstrumentVersion(binding.kindVersion);
}

/**
 * Accept `version` only when it is the instrument version named by `viewId`.
 * A source schema id, a shared interface id, or any other string is refused.
 */
export function acceptViewInstrument(viewId: string, version: string): KindVersion {
  const kindVersion = kindVersionForView(viewId);
  if (version !== kindVersion) {
    throw new UnknownInstrumentVersionError(version);
  }
  return kindVersion;
}

export const instrumentViewContract = {
  schema: INSTRUMENT_VIEW_CONTRACT_ID,
  instrument: INSTRUMENT_INTERFACE_ID,
  queryPlace: QUERY_PLACE,
  applicability: JURISDICTION_APPLICABILITY,
  views: VIEW_BINDINGS,
} as const;

export const CONTRACT_FIELD_NAMES = [
  'applicability',
  'instrument',
  'queryPlace',
  'schema',
  'views',
] as const;
