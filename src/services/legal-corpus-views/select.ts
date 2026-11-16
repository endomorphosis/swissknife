/**
 * Choose a landed view id only when the record already names that
 * interface and its source schema. Filter words are not interface ids.
 */

import {
  CASELAW_KIND_VERSION,
  CASELAW_SOURCE_SCHEMA_ID,
  CASELAW_VIEW_ID,
  caselawView,
} from './caselaw.js';
import {
  COURT_KIND_VERSION,
  COURT_SOURCE_SCHEMA_ID,
  COURT_VIEW_ID,
} from './court.js';
import {
  LAW_KIND_VERSION,
  LAW_SOURCE_SCHEMA_VERSION,
  LAW_SOURCE_VIEW_ID,
} from './law.js';
import {
  ACT_SOURCE_SCHEMA_IDS,
  LEGISLATIVE_ACT_KIND_VERSION,
  LEGISLATIVE_ACT_VIEW_ID,
  USCODE_LAW_SCHEMA_IDS,
} from './legislative-act.js';
import {
  MUNICIPAL_INSTRUMENT_VIEW_ID,
  MUNICIPAL_KIND_VERSION,
  MUNICIPAL_SOURCE_SCHEMA_FILE,
} from './municipal-instrument.js';
import {
  REGULATION_KIND_VERSION,
  REGULATION_SOURCE_SCHEMA_IDS,
  REGULATION_VIEW_ID,
} from './regulation.js';

export const FILTER_INSTRUMENT_TOKENS = [
  'constitution',
  'statute',
  'code',
  'regulation',
  'ordinance',
  'treaty',
  'decision',
  'notice',
  'amendment',
  'consolidation',
  'unknown',
] as const;

const FILTER_TOKENS = new Set<string>(FILTER_INSTRUMENT_TOKENS);
const REGULATION_SCHEMAS = new Set<string>(REGULATION_SOURCE_SCHEMA_IDS);
const ACT_SCHEMAS = new Set<string>(ACT_SOURCE_SCHEMA_IDS);
const USCODE_SCHEMAS = new Set<string>(USCODE_LAW_SCHEMA_IDS);
const OPINION_KEYS = ['text', 'opinion_text', 'case_text'] as const;

export interface InstrumentClaim {
  interfaceId?: unknown;
  sourceSchemaId?: unknown;
  sourceSchemaVersion?: unknown;
  row?: unknown;
}

export interface SelectedInstrumentView {
  viewId: string;
  kindVersion: string;
  sourceSchemaId: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mapping(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sourceOf(input: InstrumentClaim): string {
  return text(input.sourceSchemaId) || text(input.sourceSchemaVersion);
}

function lawRow(row: Record<string, unknown>): boolean {
  return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.text === 'string';
}

function opinionPresent(row: Record<string, unknown>): boolean {
  return OPINION_KEYS.some((key) => typeof row[key] === 'string' && row[key].trim() !== '');
}

function nullValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => value === null);
}

/**
 * Return the view id for one accepted pair. Missing ids, filter tokens,
 * crossed schemas, opinion text, and a null column return null.
 */
export function selectInstrumentView(input: InstrumentClaim): SelectedInstrumentView | null {
  const interfaceId = text(input.interfaceId);
  const source = sourceOf(input);
  const row = mapping(input.row);
  if (!interfaceId || !source || !row || FILTER_TOKENS.has(interfaceId) || FILTER_TOKENS.has(source)) {
    return null;
  }
  if (interfaceId === LAW_KIND_VERSION && source === LAW_SOURCE_SCHEMA_VERSION && lawRow(row)) {
    return { viewId: LAW_SOURCE_VIEW_ID, kindVersion: LAW_KIND_VERSION, sourceSchemaId: source };
  }
  if (interfaceId === CASELAW_KIND_VERSION && source === CASELAW_SOURCE_SCHEMA_ID && source === caselawView.sourceSchemaId) {
    return { viewId: CASELAW_VIEW_ID, kindVersion: CASELAW_KIND_VERSION, sourceSchemaId: source };
  }
  if (interfaceId === REGULATION_KIND_VERSION && REGULATION_SCHEMAS.has(source)) {
    return { viewId: REGULATION_VIEW_ID, kindVersion: REGULATION_KIND_VERSION, sourceSchemaId: source };
  }
  if (interfaceId === LEGISLATIVE_ACT_KIND_VERSION && ACT_SCHEMAS.has(source) && !USCODE_SCHEMAS.has(source)) {
    return { viewId: LEGISLATIVE_ACT_VIEW_ID, kindVersion: LEGISLATIVE_ACT_KIND_VERSION, sourceSchemaId: source };
  }
  if (interfaceId === COURT_KIND_VERSION && source === COURT_SOURCE_SCHEMA_ID && text(row.court_id) && !opinionPresent(row)) {
    return { viewId: COURT_VIEW_ID, kindVersion: COURT_KIND_VERSION, sourceSchemaId: source };
  }
  if (
    interfaceId === MUNICIPAL_KIND_VERSION
    && source === MUNICIPAL_SOURCE_SCHEMA_FILE
    && !nullValue(row)
  ) {
    return {
      viewId: MUNICIPAL_INSTRUMENT_VIEW_ID,
      kindVersion: MUNICIPAL_KIND_VERSION,
      sourceSchemaId: source,
    };
  }
  return null;
}
