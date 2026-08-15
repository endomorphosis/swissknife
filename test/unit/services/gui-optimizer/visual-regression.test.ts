/**
 * VGO-032 — deterministic visual-regression receipt tests.
 *
 * Acceptance:
 * - Identical captures produce identical identities
 * - Unexplained and forbidden-region changes enforce configured gates
 * - Subjective appeal remains heuristic / human-reviewed
 * - Actual browser screenshots are distinguishable from simulations
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  parseCidV1,
  rehashArtifactDigest,
  rehashIdentity,
} from '../../../../src/services/gui-optimizer/identity.js';
import { CANONICAL_JSON_PROFILE } from '../../../../src/services/gui-optimizer/models.js';
import {
  VIEWPORT_DESKTOP,
  VIEWPORT_SPEC_INTERFACE,
  VIEWPORT_SPEC_SCHEMA,
} from '../../../../src/services/gui-optimizer/scenario-catalog.js';
import {
  DEFAULT_VISUAL_DIFF_POLICY,
  DOMAIN_SCREENSHOT,
  DOMAIN_VISUAL_REGRESSION_RECEIPT,
  VISUAL_CHANGE_REGION_INTERFACE,
  VISUAL_CHANGE_REGION_SCHEMA,
  VISUAL_DECISIONS,
  VISUAL_DIFF_POLICY_INTERFACE,
  VISUAL_DIFF_POLICY_SCHEMA,
  VISUAL_REGRESSION_EVALUATOR_INTERFACE,
  VISUAL_REGRESSION_EVALUATOR_SCHEMA,
  VISUAL_REGRESSION_EVALUATOR_VERSION,
  VISUAL_REGRESSION_RECEIPT_INTERFACE,
  VISUAL_REGRESSION_RECEIPT_SCHEMA,
  VisualRegressionDecodeError,
  VisualRegressionError,
  compareImageData,
  createVisualRegressionEvaluator,
  decodeVisualChangeRegion,
  decodeVisualDiffPolicy,
  decodeVisualRegressionReceipt,
  evaluateVisualRegression,
  isBrowserCapture,
  isSimulatedCapture,
  makeVisualCapture,
  makeVisualChangeRegion,
  makeVisualDiffPolicy,
  rehashScreenshotArtifact,
  rehashVisualRegressionReceiptIdentity,
  screenshotArtifact,
  visualRegressionReceiptDigest,
  visualRegressionReceiptIdentity,
  visualRegressionReceiptToDict,
  type VisualCapture,
  type VisualRegressionEvaluateRequest,
} from '../../../../src/services/gui-optimizer/visual-regression.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const SCENARIO = 'scenario:viewport-desktop';
const REVISION = 'deadbeefcafebabe';
const VERSION = 'version:console-root';

const WHITE: readonly [number, number, number, number] = [255, 255, 255, 255];
const BLACK: readonly [number, number, number, number] = [0, 0, 0, 255];
const RED: readonly [number, number, number, number] = [200, 16, 16, 255];
const BLUE: readonly [number, number, number, number] = [16, 16, 200, 255];

function paintRect(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: readonly [number, number, number, number],
): void {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = rgba[0];
      data[offset + 1] = rgba[1];
      data[offset + 2] = rgba[2];
      data[offset + 3] = rgba[3];
    }
  }
}

function makeImage(
  width: number,
  height: number,
  fill: readonly [number, number, number, number] = WHITE,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  paintRect(data, width, 0, 0, width, height, fill);
  return data;
}

function browserCapture(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): VisualCapture {
  return makeVisualCapture({
    source: 'browser',
    width,
    height,
    data,
    browser: 'chromium',
    browser_version: '128.0.0',
  });
}

function simulationCapture(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): VisualCapture {
  return makeVisualCapture({
    source: 'simulation',
    width,
    height,
    data,
    browser: 'chromium',
    browser_version: '128.0.0',
  });
}

function solidBrowser(width = 10, height = 10): VisualCapture {
  return browserCapture(makeImage(width, height), width, height);
}

function clonePixels(capture: VisualCapture): Uint8ClampedArray {
  return new Uint8ClampedArray(capture.data);
}

function withPixel(
  capture: VisualCapture,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): VisualCapture {
  const data = clonePixels(capture);
  paintRect(data, capture.width, x, y, x + 1, y + 1, rgba);
  return makeVisualCapture({
    ...capture,
    data,
  });
}

function baseRequest(
  overrides: Partial<VisualRegressionEvaluateRequest> = {},
): VisualRegressionEvaluateRequest {
  const baseline = solidBrowser();
  return {
    application_id: APP,
    screen_id: SCREEN,
    scenario_id: SCENARIO,
    repository_revision: REVISION,
    component_version_ids: [VERSION],
    viewport: VIEWPORT_DESKTOP,
    color_scheme: 'light',
    locale: 'en-US',
    text_scale_percent: 100,
    browser: 'chromium',
    browser_version: '128.0.0',
    capture: baseline,
    baseline,
    policy: DEFAULT_VISUAL_DIFF_POLICY,
    ...overrides,
  };
}

describe('VisualRegressionEvaluator@1 identity (VGO-032)', () => {
  it('exports sealed interface and schema identities', () => {
    expect(VISUAL_REGRESSION_EVALUATOR_INTERFACE).toBe(
      'VisualRegressionEvaluator@1',
    );
    expect(VISUAL_REGRESSION_EVALUATOR_SCHEMA).toBe(
      'visual-regression-evaluator/v1',
    );
    expect(VISUAL_REGRESSION_RECEIPT_INTERFACE).toBe(
      'VisualRegressionReceipt@1',
    );
    expect(VISUAL_REGRESSION_RECEIPT_SCHEMA).toBe(
      'visual-regression-receipt/v1',
    );
    expect(VISUAL_DIFF_POLICY_INTERFACE).toBe('VisualDiffPolicy@1');
    expect(VISUAL_DIFF_POLICY_SCHEMA).toBe('visual-diff-policy/v1');
    expect(VISUAL_CHANGE_REGION_INTERFACE).toBe('VisualChangeRegion@1');
    expect(VISUAL_CHANGE_REGION_SCHEMA).toBe('visual-change-region/v1');
    expect(VIEWPORT_SPEC_INTERFACE).toBe('ViewportSpec@1');
    expect(VIEWPORT_SPEC_SCHEMA).toBe('gui-viewport-spec/v1');
    expect(CANONICAL_JSON_PROFILE).toBe('gui-optimizer-canonical-json/v1');
    expect(VISUAL_REGRESSION_EVALUATOR_VERSION).toBe(
      'gui-visual-regression-evaluator@1.0.0',
    );
    expect(VISUAL_DECISIONS).toEqual([
      'pass',
      'fail',
      'review',
      'skipped',
      'baseline_missing',
    ]);
  });

  it('identical captures produce identical receipt and screenshot identities', () => {
    const pixels = makeImage(10, 10);
    const first = evaluateVisualRegression(
      baseRequest({
        capture: browserCapture(new Uint8ClampedArray(pixels), 10, 10),
        baseline: browserCapture(new Uint8ClampedArray(pixels), 10, 10),
      }),
    );
    const second = evaluateVisualRegression(
      baseRequest({
        capture: browserCapture(new Uint8ClampedArray(pixels), 10, 10),
        baseline: browserCapture(new Uint8ClampedArray(pixels), 10, 10),
      }),
    );
    expect(first.receipt.decision).toBe('pass');
    expect(first.receipt.screenshot_digest).toBe(second.receipt.screenshot_digest);
    expect(first.receipt.baseline_digest).toBe(second.receipt.baseline_digest);
    expect(first.receipt.screenshot_digest).toBe(first.receipt.baseline_digest);
    expect(first.receipt_identity.digest).toBe(second.receipt_identity.digest);
    expect(first.receipt_identity.cid).toBe(second.receipt_identity.cid);
    expect(first.receipt.receipt_id).toBe(second.receipt.receipt_id);
    expect(visualRegressionReceiptDigest(first.receipt)).toBe(
      first.receipt_identity.digest,
    );
    expect(
      new TextDecoder().decode(first.receipt_identity.canonical_bytes),
    ).toBe(new TextDecoder().decode(second.receipt_identity.canonical_bytes));
  });

  it('binds revision, scenario, viewport, scheme, locale, scale, and browser', () => {
    const result = evaluateVisualRegression(baseRequest());
    expect(result.receipt.repository_revision).toBe(REVISION);
    expect(result.receipt.scenario_id).toBe(SCENARIO);
    expect(result.receipt.viewport).toEqual(VIEWPORT_DESKTOP);
    expect(result.receipt.color_scheme).toBe('light');
    expect(result.receipt.locale).toBe('en-US');
    expect(result.receipt.text_scale_percent).toBe(100);
    expect(result.receipt.browser).toBe('chromium');
    expect(result.receipt.browser_version).toBe('128.0.0');
    expect(result.receipt.component_version_ids).toEqual([VERSION]);
    expect(result.receipt.screenshot_width).toBe(10);
    expect(result.receipt.screenshot_height).toBe(10);
  });

  it('changes identity when bound metadata changes', () => {
    const original = evaluateVisualRegression(baseRequest());
    const locale = evaluateVisualRegression(
      baseRequest({ locale: 'fr-FR' }),
    );
    const scheme = evaluateVisualRegression(
      baseRequest({ color_scheme: 'dark' }),
    );
    const scale = evaluateVisualRegression(
      baseRequest({ text_scale_percent: 200 }),
    );
    expect(locale.receipt_identity.digest).not.toBe(
      original.receipt_identity.digest,
    );
    expect(scheme.receipt_identity.digest).not.toBe(
      original.receipt_identity.digest,
    );
    expect(scale.receipt_identity.digest).not.toBe(
      original.receipt_identity.digest,
    );
  });

  it('rehashes screenshot artifacts and receipt identities', () => {
    const result = evaluateVisualRegression(baseRequest());
    expect(result.screenshot_artifact.domain).toBe(DOMAIN_SCREENSHOT);
    expect(result.receipt_identity.domain).toBe(
      DOMAIN_VISUAL_REGRESSION_RECEIPT,
    );
    expect(rehashScreenshotArtifact(result.screenshot_artifact)).toEqual(
      result.screenshot_artifact,
    );
    expect(rehashArtifactDigest(result.screenshot_artifact).digest).toBe(
      result.screenshot_artifact.digest,
    );
    expect(rehashVisualRegressionReceiptIdentity(result.receipt_identity)).toEqual(
      result.receipt_identity,
    );
    expect(rehashIdentity(result.receipt_identity).cid).toBe(
      result.receipt_identity.cid,
    );
    expect(parseCidV1(result.receipt_identity.cid).digest_label).toBe(
      result.receipt_identity.digest,
    );
    expect(parseCidV1(result.screenshot_artifact.cid).digest_label).toBe(
      result.screenshot_artifact.digest,
    );
  });
});

describe('browser captures stay distinguishable from simulations', () => {
  it('labels browser captures automated/integrity_valid and simulations simulated', () => {
    const pixels = makeImage(10, 10);
    const browser = evaluateVisualRegression(
      baseRequest({
        capture: browserCapture(new Uint8ClampedArray(pixels), 10, 10),
        baseline: browserCapture(new Uint8ClampedArray(pixels), 10, 10),
      }),
    );
    const simulation = evaluateVisualRegression(
      baseRequest({
        capture: simulationCapture(new Uint8ClampedArray(pixels), 10, 10),
        baseline: simulationCapture(new Uint8ClampedArray(pixels), 10, 10),
      }),
    );
    expect(isBrowserCapture(browser)).toBe(true);
    expect(isSimulatedCapture(browser)).toBe(false);
    expect(isBrowserCapture(simulation)).toBe(false);
    expect(isSimulatedCapture(simulation)).toBe(true);
    expect(browser.receipt.evidence_level).toBe('automated');
    expect(browser.receipt.verification_status).toBe('integrity_valid');
    expect(simulation.receipt.evidence_level).toBe('simulated');
    expect(simulation.receipt.verification_status).toBe('simulated');
    expect(browser.receipt.screenshot_digest).not.toBe(
      simulation.receipt.screenshot_digest,
    );
    expect(browser.receipt_identity.digest).not.toBe(
      simulation.receipt_identity.digest,
    );
  });

  it('rejects synthetic placeholders and digest-only captures', () => {
    expect(() =>
      evaluateVisualRegression(
        baseRequest({
          capture: 'placeholder' as never,
        }),
      ),
    ).toThrow(VisualRegressionError);
    expect(() =>
      evaluateVisualRegression(
        baseRequest({
          capture: {
            source: 'browser',
            width: 10,
            height: 10,
            placeholder: true,
            screenshot_digest: `sha256:${'0'.repeat(64)}`,
          } as never,
        }),
      ),
    ).toThrow(/placeholder|measured/i);
    expect(() =>
      evaluateVisualRegression(
        baseRequest({
          capture: {
            source: 'browser',
            width: 10,
            height: 10,
            data: 'rgba-placeholder',
            browser: 'chromium',
            browser_version: '128.0.0',
          } as never,
        }),
      ),
    ).toThrow(VisualRegressionError);
    expect(() =>
      evaluateVisualRegression(
        baseRequest({
          capture: {
            source: 'browser',
            width: 10,
            height: 10,
            data: [0, 0, 0, 255],
            browser: 'chromium',
            browser_version: '128.0.0',
          } as never,
        }),
      ),
    ).toThrow(VisualRegressionError);
  });
});

describe('configured visual gates', () => {
  it('does not treat every pixel change as a regression', () => {
    const baseline = solidBrowser();
    const after = withPixel(baseline, 0, 0, BLACK);
    const result = evaluateVisualRegression(
      baseRequest({
        capture: after,
        baseline,
        policy: makeVisualDiffPolicy({
          max_unexplained_diff_percent: 1,
          manual_review_threshold_percent: 2,
        }),
      }),
    );
    expect(result.measurement.changed_pixels).toBe(1);
    expect(result.measurement.unexplained_pixel_diff_percent).toBe(1);
    expect(result.receipt.pixel_diff_percent).toBe(1);
    expect(result.receipt.decision).toBe('pass');
    expect(result.receipt.requires_human_review).toBe(false);
    expect(result.gate_reasons).toEqual([]);
  });

  it('fails when unexplained difference exceeds the configured maximum', () => {
    const baseline = solidBrowser();
    const after = withPixel(withPixel(baseline, 0, 0, BLACK), 1, 0, BLACK);
    const result = evaluateVisualRegression(
      baseRequest({
        capture: after,
        baseline,
        policy: makeVisualDiffPolicy({
          max_unexplained_diff_percent: 1,
          manual_review_threshold_percent: 5,
        }),
      }),
    );
    expect(result.measurement.unexplained_changed_pixels).toBe(2);
    expect(result.receipt.pixel_diff_percent).toBe(2);
    expect(result.receipt.decision).toBe('fail');
    expect(result.gate_reasons).toContain('unexplained_diff_exceeds_max');
  });

  it('reviews at the manual threshold without treating the change as a hard fail', () => {
    const baseline = solidBrowser();
    const after = withPixel(withPixel(baseline, 0, 0, BLACK), 1, 0, BLACK);
    const result = evaluateVisualRegression(
      baseRequest({
        capture: after,
        baseline,
        policy: makeVisualDiffPolicy({
          max_unexplained_diff_percent: 5,
          manual_review_threshold_percent: 2,
        }),
      }),
    );
    expect(result.receipt.pixel_diff_percent).toBe(2);
    expect(result.receipt.decision).toBe('review');
    expect(result.receipt.requires_human_review).toBe(true);
    expect(result.gate_reasons).toEqual(['manual_review_threshold']);
  });

  it('allows expected-region changes and still fails unexplained leftovers', () => {
    const expected = makeVisualChangeRegion({
      region_id: 'region:expected-banner',
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
      evidence_reason: 'declared-banner-refresh',
    });
    const baseline = solidBrowser();
    const expectedOnly = withPixel(baseline, 0, 0, RED);
    const allowed = evaluateVisualRegression(
      baseRequest({
        capture: expectedOnly,
        baseline,
        policy: makeVisualDiffPolicy({
          expected_change_regions: [expected],
          max_unexplained_diff_percent: 1,
          manual_review_threshold_percent: 2,
        }),
      }),
    );
    expect(allowed.measurement.expected_region_changed_pixels).toBe(1);
    expect(allowed.measurement.unexplained_changed_pixels).toBe(0);
    expect(allowed.receipt.pixel_diff_percent).toBe(0);
    expect(allowed.receipt.decision).toBe('pass');

    const leftover = withPixel(expectedOnly, 9, 9, BLUE);
    const blocked = evaluateVisualRegression(
      baseRequest({
        capture: leftover,
        baseline,
        policy: makeVisualDiffPolicy({
          expected_change_regions: [expected],
          max_unexplained_diff_percent: 0,
          manual_review_threshold_percent: 2,
        }),
      }),
    );
    expect(blocked.measurement.unexplained_changed_pixels).toBe(1);
    expect(blocked.receipt.decision).toBe('fail');
    expect(blocked.gate_reasons).toContain('unexplained_diff_exceeds_max');
  });

  it('fails any forbidden-region pixel change', () => {
    const forbidden = makeVisualChangeRegion({
      region_id: 'region:forbidden-confirm',
      x: 0.8,
      y: 0,
      width: 0.2,
      height: 1,
      evidence_reason: 'confirmation-control-must-not-move',
    });
    const baseline = solidBrowser();
    const after = withPixel(baseline, 9, 0, RED);
    const result = evaluateVisualRegression(
      baseRequest({
        capture: after,
        baseline,
        policy: makeVisualDiffPolicy({
          forbidden_change_regions: [forbidden],
          max_unexplained_diff_percent: 100,
          manual_review_threshold_percent: 100,
        }),
      }),
    );
    expect(result.measurement.forbidden_region_changed_pixels).toBe(1);
    expect(result.receipt.decision).toBe('fail');
    expect(result.gate_reasons).toContain('forbidden_region_change');
  });

  it('fails dimension mismatches as unexplained 100 percent diffs', () => {
    const result = evaluateVisualRegression(
      baseRequest({
        capture: solidBrowser(12, 10),
        baseline: solidBrowser(10, 10),
      }),
    );
    expect(result.measurement.dimension_mismatch).toBe(true);
    expect(result.measurement.unexplained_pixel_diff_percent).toBe(100);
    expect(result.receipt.decision).toBe('fail');
    expect(result.receipt.requires_human_review).toBe(true);
    expect(result.gate_reasons).toContain('dimension_mismatch');
  });

  it('records baseline_missing without inventing a compared pass', () => {
    const result = evaluateVisualRegression(
      baseRequest({
        baseline: null,
      }),
    );
    expect(result.receipt.decision).toBe('baseline_missing');
    expect(result.compared).toBe(false);
    expect(result.baseline_capture_source).toBe('absent');
    expect(result.receipt.pixel_diff_percent).toBe(0);
    expect(result.receipt.verification_status).toBe('unverified');
    expect(result.gate_reasons).toEqual(['baseline_missing']);
  });
});

describe('subjective appeal stays heuristic', () => {
  it('does not let appeal scores override a forbidden-region fail', () => {
    const forbidden = makeVisualChangeRegion({
      region_id: 'region:forbidden-nav',
      x: 0,
      y: 0,
      width: 0.2,
      height: 1,
      evidence_reason: 'navigation-chrome',
    });
    const baseline = solidBrowser();
    const result = evaluateVisualRegression(
      baseRequest({
        capture: withPixel(baseline, 0, 0, RED),
        baseline,
        policy: makeVisualDiffPolicy({
          forbidden_change_regions: [forbidden],
        }),
        appeal: {
          evidence_level: 'heuristic',
          scores: {
            hierarchy: 95,
            polish: 99,
            primary_action_prominence: 90,
          },
          notes: 'looks nicer',
        },
      }),
    );
    expect(result.receipt.decision).toBe('fail');
    expect(result.appeal.evidence_level).toBe('heuristic');
    expect(result.appeal.overrides_objective_gates).toBe(false);
    expect(result.appeal.scores.polish).toBe(99);
  });

  it('rejects automated authority on subjective appeal', () => {
    expect(() =>
      evaluateVisualRegression(
        baseRequest({
          appeal: {
            evidence_level: 'automated' as never,
            scores: { polish: 10 },
          },
        }),
      ),
    ).toThrow(VisualRegressionDecodeError);
  });
});

describe('structural metrics and closed decoders', () => {
  it('counts missing and extra controls from structural observations', () => {
    const baseline = solidBrowser();
    const result = evaluateVisualRegression(
      baseRequest({
        capture: baseline,
        baseline,
        structural_baseline: [
          { control_id: 'ctrl:save', x: 0, y: 0, width: 0.2, height: 0.2 },
          { control_id: 'ctrl:cancel', x: 0.3, y: 0, width: 0.2, height: 0.2 },
        ],
        structural_after: [
          { control_id: 'ctrl:save', x: 0, y: 0, width: 0.2, height: 0.2 },
          { control_id: 'ctrl:retry', x: 0.6, y: 0, width: 0.2, height: 0.2 },
        ],
      }),
    );
    expect(result.receipt.missing_control_count).toBe(1);
    expect(result.receipt.extra_control_count).toBe(1);
    expect(result.measurement.missing_control_count).toBe(1);
    expect(result.measurement.extra_control_count).toBe(1);
  });

  it('compareImageData reports pixel and structural observations independently', () => {
    const baseline = solidBrowser();
    const after = withPixel(baseline, 0, 0, BLACK);
    const measurement = compareImageData(
      baseline,
      after,
      makeVisualDiffPolicy({
        max_unexplained_diff_percent: 1,
        manual_review_threshold_percent: 2,
      }),
    );
    expect(measurement.changed_pixels).toBe(1);
    expect(measurement.unexplained_changed_pixels).toBe(1);
    expect(measurement.structural_cell_count).toBeGreaterThan(0);
    expect(measurement.structural_changed_cells).toBeGreaterThan(0);
  });

  it('rejects overlapping expected and forbidden regions', () => {
    const expected = makeVisualChangeRegion({
      region_id: 'region:a',
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
    expect(() =>
      makeVisualDiffPolicy({
        expected_change_regions: [expected],
        forbidden_change_regions: [
          makeVisualChangeRegion({
            region_id: 'region:b',
            x: 0.25,
            y: 0.25,
            width: 0.5,
            height: 0.5,
          }),
        ],
      }),
    ).toThrow(/overlap/i);
  });

  it('decodeVisualRegressionReceipt rejects unknown fields and invalid enums', () => {
    const result = evaluateVisualRegression(baseRequest());
    const wire = visualRegressionReceiptToDict(result.receipt);
    expect(() =>
      decodeVisualRegressionReceipt({ ...wire, unknown: true }),
    ).toThrow(VisualRegressionDecodeError);
    expect(() =>
      decodeVisualRegressionReceipt({ ...wire, decision: 'maybe' }),
    ).toThrow(VisualRegressionDecodeError);
    expect(() =>
      decodeVisualRegressionReceipt({
        ...wire,
        pixel_diff_percent: Number.NaN,
      }),
    ).toThrow(VisualRegressionDecodeError);
    expect(() =>
      decodeVisualChangeRegion({
        interface: VISUAL_CHANGE_REGION_INTERFACE,
        schema_version: VISUAL_CHANGE_REGION_SCHEMA,
        region_id: 'region:bad',
        x: 0.9,
        y: 0,
        width: 0.2,
        height: 1,
        evidence_reason: 'overflow',
      }),
    ).toThrow(/x \+ width/);
    expect(() =>
      decodeVisualDiffPolicy({
        ...DEFAULT_VISUAL_DIFF_POLICY,
        extra: true,
      }),
    ).toThrow(VisualRegressionDecodeError);
  });

  it('PASS receipts cannot require review or exceed the unexplained gate', () => {
    const result = evaluateVisualRegression(baseRequest());
    const wire = visualRegressionReceiptToDict(result.receipt);
    expect(() =>
      decodeVisualRegressionReceipt({
        ...wire,
        decision: 'pass',
        requires_human_review: true,
      }),
    ).toThrow(/human review/);
    expect(() =>
      decodeVisualRegressionReceipt({
        ...wire,
        decision: 'pass',
        pixel_diff_percent: 50,
        max_unexplained_diff_percent: 1,
        requires_human_review: false,
        manual_review_threshold_percent: 100,
      }),
    ).toThrow(/exceeds max_unexplained/);
  });
});

describe('createVisualRegressionEvaluator', () => {
  it('returns a frozen evaluator that matches evaluateVisualRegression', () => {
    const evaluator = createVisualRegressionEvaluator();
    expect(evaluator.interface).toBe(VISUAL_REGRESSION_EVALUATOR_INTERFACE);
    expect(evaluator.schema_version).toBe(VISUAL_REGRESSION_EVALUATOR_SCHEMA);
    expect(evaluator.evaluatorVersion).toBe(
      VISUAL_REGRESSION_EVALUATOR_VERSION,
    );
    const request = baseRequest();
    const viaFactory = evaluator.evaluate(request);
    const viaFunction = evaluateVisualRegression(request);
    expect(viaFactory.receipt_identity.digest).toBe(
      viaFunction.receipt_identity.digest,
    );
    expect(viaFactory.receipt.decision).toBe('pass');
    expect(
      visualRegressionReceiptIdentity(viaFactory.receipt).cid,
    ).toBe(viaFactory.receipt_identity.cid);
  });

  it('hashes measured screenshot bytes rather than a label', () => {
    const left = screenshotArtifact(solidBrowser());
    const rightPixels = makeImage(10, 10);
    paintRect(rightPixels, 10, 0, 0, 1, 1, BLACK);
    const right = screenshotArtifact(browserCapture(rightPixels, 10, 10));
    expect(left.digest).not.toBe(right.digest);
    expect(left.digest.startsWith('sha256:')).toBe(true);
    expect(left.digest.length).toBe(71);
  });
});
