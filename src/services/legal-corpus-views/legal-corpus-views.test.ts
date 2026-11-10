import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ACT_SOURCE_SCHEMA_IDS,
  CASELAW_SOURCE_SCHEMA_ID,
  CASELAW_VIEW_ID,
  CONTRACT_FIELD_NAMES,
  COURT_SOURCE_SCHEMA_ID,
  COURT_VIEW_ID,
  INSTRUMENT_INTERFACE_ID,
  INSTRUMENT_VIEW_CONTRACT_ID,
  JURISDICTION_APPLICABILITY,
  KIND_VERSIONS,
  LAW_SECTION_SCHEMA_ID,
  LAW_SOURCE_SCHEMA_VERSION,
  LAW_SOURCE_VIEW_ID,
  LAW_VERIFY_SCHEMA_VERSION,
  LEGISLATIVE_ACT_VIEW_ID,
  MUNICIPAL_INSTRUMENT_VIEW_ID,
  MUNICIPAL_SOURCE_SCHEMA_FILE,
  QUERY_PLACE,
  REGULATION_SOURCE_SCHEMA_IDS,
  REGULATION_VIEW_ID,
  USCODE_LAW_SCHEMA_IDS,
  UnknownInstrumentVersionError,
  VIEW_BINDINGS,
  acceptInstrumentVersion,
  acceptViewInstrument,
  courtView,
  instrumentViewContract,
  kindVersionForView,
  lawView,
} from './index.js';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

describe('legal corpus views', () => {
  it('exports the site view ids and the municipal view id', () => {
    assert.deepEqual(
      VIEW_BINDINGS.map((row) => [row.viewId, row.kindVersion]),
      [
        [LAW_SOURCE_VIEW_ID, 'legal-corpus.law@1'],
        [CASELAW_VIEW_ID, 'legal-corpus.caselaw@1'],
        [REGULATION_VIEW_ID, 'legal-corpus.regulation@1'],
        [LEGISLATIVE_ACT_VIEW_ID, 'legal-corpus.legislative-act@1'],
        [COURT_VIEW_ID, 'legal-corpus.court@1'],
        [MUNICIPAL_INSTRUMENT_VIEW_ID, 'legal-corpus.municipal-instrument@1'],
      ],
    );
    assert.equal(LAW_SOURCE_VIEW_ID, 'worldwide-legal-search.law-source@1');
    assert.equal(LAW_SECTION_SCHEMA_ID, 'worldwide-legal-search.law-section@1');
    assert.equal(lawView.sectionSchema, LAW_SECTION_SCHEMA_ID);
    assert.equal(CASELAW_VIEW_ID, 'worldwide-legal-search.caselaw-view@1');
    assert.equal(REGULATION_VIEW_ID, 'worldwide-legal-search.regulation-view@1');
    assert.equal(LEGISLATIVE_ACT_VIEW_ID, 'worldwide-legal-search.legislative-act-view@1');
    assert.equal(COURT_VIEW_ID, 'worldwide-legal-search.court-view@1');
    assert.equal(MUNICIPAL_INSTRUMENT_VIEW_ID, 'worldwide-legal-search.municipal-instrument-view@1');
    assert.equal(INSTRUMENT_VIEW_CONTRACT_ID, 'worldwide-legal-search.instrument-view-contract@1');
    assert.equal(instrumentViewContract.schema, INSTRUMENT_VIEW_CONTRACT_ID);
    assert.equal(instrumentViewContract.instrument, INSTRUMENT_INTERFACE_ID);
    assert.equal(instrumentViewContract.instrument, 'legal-corpus.instrument@1');
  });

  it('names the instrument version and source schema each view accepts', () => {
    assert.equal(lawView.kindVersion, KIND_VERSIONS.law);
    assert.equal(lawView.sourceSchemaVersion, LAW_SOURCE_SCHEMA_VERSION);
    assert.equal(lawView.sourceSchemaVersion, 'country-laws-ir-graphrag/v1');
    assert.equal(lawView.verifySchemaVersion, LAW_VERIFY_SCHEMA_VERSION);
    assert.equal(lawView.verifySchemaVersion, 'country-laws-normalize-verify/v1');
    assert.deepEqual(lawView.refuses, ['legal-corpus.caselaw@1']);

    const caselaw = VIEW_BINDINGS[1];
    assert.equal(caselaw?.kindVersion, 'legal-corpus.caselaw@1');
    assert.equal(caselaw?.sourceSchemaId, CASELAW_SOURCE_SCHEMA_ID);
    assert.equal(caselaw?.sourceSchemaId, 'unversioned');

    const regulation = VIEW_BINDINGS[2];
    assert.equal(regulation?.kindVersion, 'legal-corpus.regulation@1');
    assert.deepEqual(regulation?.sourceSchemaIds, [
      'cfr-annual-processor-v1',
      'live-cfr-source-processor-v1',
      'ecfr-crosscheck-processor-v1',
      'federal-register-change-processor-v1',
      'federal-register-sparse-graphrag-release-schema-v2',
    ]);
    assert.deepEqual(regulation?.sourceSchemaIds, [...REGULATION_SOURCE_SCHEMA_IDS]);

    const act = VIEW_BINDINGS[3];
    assert.equal(act?.kindVersion, 'legal-corpus.legislative-act@1');
    assert.deepEqual(act?.sourceSchemaIds, [...ACT_SOURCE_SCHEMA_IDS]);
    assert.deepEqual(act?.refuses, ['legal-corpus.law@1', ...USCODE_LAW_SCHEMA_IDS]);

    assert.equal(courtView.kindVersion, 'legal-corpus.court@1');
    assert.equal(courtView.sourceSchemaId, COURT_SOURCE_SCHEMA_ID);
    assert.equal(courtView.sourceSchemaId, 'unversioned');
    assert.equal(Object.prototype.hasOwnProperty.call(courtView, 'text'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(courtView, 'opinion_text'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(courtView, 'case_text'), false);

    const municipal = VIEW_BINDINGS[5];
    assert.equal(municipal?.kindVersion, 'legal-corpus.municipal-instrument@1');
    assert.equal(municipal?.sourceSchemaFile, MUNICIPAL_SOURCE_SCHEMA_FILE);
    assert.equal(municipal?.sourceSchemaFile, 'world_municipal/schema.py');
    assert.equal(Object.prototype.hasOwnProperty.call(municipal ?? {}, 'sourceSchemaId'), false);
  });

  it('refuses an unknown instrument version', () => {
    const refused = [
      'legal-corpus.not-landed@1',
      'legal-corpus.status@1',
      'legal-corpus.instrument@1',
      'country-laws-ir-graphrag/v1',
      'country-laws-normalize-verify/v1',
      'unversioned',
      'worldwide-legal-search.law-source@1',
      '',
      '   ',
    ];
    for (const version of refused) {
      assert.throws(
        () => acceptInstrumentVersion(version),
        (error: unknown) => {
          assert.ok(error instanceof UnknownInstrumentVersionError);
          assert.equal(error.version, version);
          assert.match(error.message, /unknown instrument version/);
          return true;
        },
      );
      assert.throws(
        () => acceptViewInstrument(LAW_SOURCE_VIEW_ID, version),
        UnknownInstrumentVersionError,
      );
    }
    for (const version of Object.values(KIND_VERSIONS)) {
      assert.equal(acceptInstrumentVersion(version), version);
    }
    assert.equal(kindVersionForView(MUNICIPAL_INSTRUMENT_VIEW_ID), KIND_VERSIONS.municipal_instrument);
    assert.equal(
      acceptViewInstrument(COURT_VIEW_ID, KIND_VERSIONS.court),
      'legal-corpus.court@1',
    );
    assert.throws(
      () => kindVersionForView('worldwide-legal-search.not-a-view@1'),
      UnknownInstrumentVersionError,
    );
    assert.throws(
      () => kindVersionForView(LAW_SECTION_SCHEMA_ID),
      UnknownInstrumentVersionError,
    );
  });

  it('keeps place as an argument and does not carry a network address', () => {
    assert.deepEqual(
      Object.keys(instrumentViewContract).sort(),
      [...CONTRACT_FIELD_NAMES].sort(),
    );
    assert.equal(instrumentViewContract.queryPlace, 'argument');
    assert.equal(instrumentViewContract.queryPlace, QUERY_PLACE);
    assert.equal(instrumentViewContract.applicability, 'not-asserted');
    assert.equal(instrumentViewContract.applicability, JURISDICTION_APPLICABILITY);
    const banned = ['geo' + 'ip', 'caller' + 'Ip', 'caller' + '_ip', 'remote' + 'Address'];
    const encoded = JSON.stringify(instrumentViewContract).toLowerCase();
    for (const token of banned) {
      assert.equal(Object.prototype.hasOwnProperty.call(instrumentViewContract, token), false);
      assert.equal(encoded.includes(token.toLowerCase()), false);
      for (const binding of instrumentViewContract.views) {
        assert.equal(Object.prototype.hasOwnProperty.call(binding, token), false);
      }
    }
    for (const name of readdirSync(PACKAGE_DIR)) {
      if (!name.endsWith('.ts')) {
        continue;
      }
      const text = readFileSync(join(PACKAGE_DIR, name), 'utf8');
      for (const token of banned) {
        assert.equal(text.includes(token), false, `${name} contains ${token}`);
      }
    }
  });
});
