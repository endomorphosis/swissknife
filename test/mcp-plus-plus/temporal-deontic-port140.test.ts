/**
 * temporal-deontic-port140.test.ts
 *
 * Focused conformance tests for PORT-140 temporal-deontic API wrappers.
 */

import {
  analyzeTemporalObligations,
  checkDocumentConsistencyFromParameters,
  detectTemporalConflicts,
  extractTemporalClauses,
} from '../../src/services/logic/tdfol/temporal-deontic-api.js';

describe('PORT-140 temporal-deontic API wrappers', () => {
  it('extracts temporal clauses from deontic legal text', async () => {
    const text = 'The tenant must provide notice within 30 days before termination.';
    const result = await extractTemporalClauses(text);

    expect(result.clauses.length).toBeGreaterThan(0);
    expect(result.clauses.join(' ').toLowerCase()).toContain('within 30 days');
  });

  it('analyzes temporal obligations and returns deadlines', async () => {
    const text = 'The consultant must submit the report within 10 days.';
    const result = await analyzeTemporalObligations(text, 30);

    expect(result.obligations.length).toBeGreaterThan(0);
    expect(result.deadlines.length).toBeGreaterThan(0);
  });

  it('detects obligation/prohibition conflicts on similar actions', async () => {
    const text = [
      'The contractor must disclose the incident within 10 days.',
      'The contractor must not disclose the incident within 5 days.',
    ].join(' ');

    const result = await detectTemporalConflicts(text);

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].type).toBe('modal_conflict');
  });

  it('returns inconsistent document analysis when conflicts are present', async () => {
    const text = [
      'The supplier must ship the replacement parts within 7 days.',
      'The supplier shall not ship the replacement parts within 14 days.',
    ].join(' ');

    const result = await checkDocumentConsistencyFromParameters({ text, windowDays: 30 });

    expect(result.isConsistent).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.summary.toLowerCase()).toContain('found');
  });

  it('returns a clear validation error when document text is missing', async () => {
    const result = await checkDocumentConsistencyFromParameters({ text: '', windowDays: 30 });

    expect(result.isConsistent).toBe(false);
    expect(result.violations).toContain('Document text is required');
  });
});
