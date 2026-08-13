/**
 * VGO-031 — live-DOM accessibility evaluation tests.
 *
 * Acceptance:
 * - Receipts distinguish pass, violation, unsupported, and manual review
 * - Automated tooling never claims full WCAG compliance
 * - Critical regressions are machine-readable acceptance blockers
 * - Existing facilities are used first; no unpinned audit dependency
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { CANONICAL_JSON_PROFILE } from '../../../../src/services/gui-optimizer/models.js';
import {
  ACCESSIBILITY_ACCEPTANCE_BLOCKER_CODES,
  ACCESSIBILITY_ENGINE_ID,
  ACCESSIBILITY_FINDING_DISPOSITIONS,
  ACCESSIBILITY_RECEIPT_INTERFACE,
  ACCESSIBILITY_RECEIPT_SCHEMA,
  ACCESSIBILITY_RULE_IDS,
  ACCESSIBILITY_SEVERITIES,
  AXE_CORE_DIRECT_DEPENDENCY_ADDED,
  AXE_CORE_PERMITTED_PIN,
  CONSTRAINT_CHECK_STATUSES,
  EXISTING_A11Y_FACILITIES,
  KEYBOARD_EVALUATION_INTERFACE,
  KEYBOARD_EVALUATION_SCHEMA,
  MANUAL_CHECK_IDS,
  UI_ACCESSIBILITY_CONTRACT_INTERFACE,
  UI_ACCESSIBILITY_CONTRACT_SCHEMA,
  UI_ACCESSIBILITY_EVALUATOR_INTERFACE,
  UI_ACCESSIBILITY_EVALUATOR_SCHEMA,
  UI_ACCESSIBILITY_EVALUATOR_VERSION,
  UNSUPPORTED_WCAG_CRITERIA,
  WCAG_CERTIFICATION_CLAIMED,
  WCAG_COMPLIANCE_CLAIMED,
  accessibilityReceiptDigest,
  blocksAutomaticAcceptance,
  claimsWcagCompliance,
  contrastRatio,
  createUiAccessibilityEvaluator,
  decodeAccessibilityReceipt,
  decodeUiAccessibilityContract,
  evaluateLiveDomAccessibility,
  findingsByDisposition,
  keyboardEvaluationDigest,
  listAcceptanceBlockers,
  makeAccessibilityReceipt,
  makeLiveDomNode,
  makeUiAccessibilityContract,
  parseHtmlToLiveDom,
  relativeLuminance,
  serializeAccessibilityReceipt,
  type AccessibilityReceipt,
  type UiAccessibilityEvaluateRequest,
} from '../../../../src/services/gui-optimizer/accessibility.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const REVISION = 'deadbeefcafebabe';

const CLEAN_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Agent Supervisor</title></head>
  <body style="color:#111111;background-color:#ffffff;font-size:16px">
    <h1>Goals</h1>
    <form>
      <label for="goal-title">Title</label>
      <input id="goal-title" name="title" required />
      <p id="goal-error">Title is required</p>
      <button type="submit" id="create-goal">Create goal</button>
    </form>
    <img id="status-icon" src="ok.svg" alt="Ready" />
    <img id="spacer" src="spacer.gif" alt="" />
  </body>
</html>
`;

function baseRequest(
  overrides: Partial<UiAccessibilityEvaluateRequest> = {},
): UiAccessibilityEvaluateRequest {
  return {
    application_id: APP,
    screen_id: SCREEN,
    scenario_id: 'scenario:initial-load',
    repository_revision: REVISION,
    html: CLEAN_HTML,
    ...overrides,
  };
}

describe('UiAccessibilityEvaluator@1 (VGO-031)', () => {
  it('exports sealed interface and schema identities', () => {
    expect(UI_ACCESSIBILITY_EVALUATOR_INTERFACE).toBe(
      'UiAccessibilityEvaluator@1',
    );
    expect(UI_ACCESSIBILITY_EVALUATOR_SCHEMA).toBe(
      'ui-accessibility-evaluator/v1',
    );
    expect(ACCESSIBILITY_RECEIPT_INTERFACE).toBe('AccessibilityReceipt@1');
    expect(ACCESSIBILITY_RECEIPT_SCHEMA).toBe('accessibility-receipt/v1');
    expect(KEYBOARD_EVALUATION_INTERFACE).toBe('KeyboardEvaluation@1');
    expect(KEYBOARD_EVALUATION_SCHEMA).toBe('keyboard-evaluation/v1');
    expect(UI_ACCESSIBILITY_CONTRACT_INTERFACE).toBe(
      'UiAccessibilityContract@1',
    );
    expect(UI_ACCESSIBILITY_CONTRACT_SCHEMA).toBe(
      'ui-accessibility-contract/v1',
    );
    expect(UI_ACCESSIBILITY_EVALUATOR_VERSION).toBe(
      'gui-accessibility-evaluator@1.0.0',
    );
    expect(CANONICAL_JSON_PROFILE).toBe('gui-optimizer-canonical-json/v1');
    expect(ACCESSIBILITY_FINDING_DISPOSITIONS).toEqual([
      'pass',
      'violation',
      'unsupported',
      'manual_review',
    ]);
    expect(CONSTRAINT_CHECK_STATUSES).toContain('satisfied');
    expect(ACCESSIBILITY_SEVERITIES).toEqual([
      'critical',
      'serious',
      'moderate',
      'minor',
    ]);
    expect(ACCESSIBILITY_RULE_IDS).toContain('duplicate-id');
    expect(ACCESSIBILITY_ACCEPTANCE_BLOCKER_CODES).toContain(
      'critical_regression',
    );
  });

  it('records that no direct axe-core dependency was added', () => {
    expect(AXE_CORE_DIRECT_DEPENDENCY_ADDED).toBe(false);
    expect(AXE_CORE_PERMITTED_PIN).toBe('4.6.3');
    expect(EXISTING_A11Y_FACILITIES.length).toBeGreaterThan(0);
    expect(EXISTING_A11Y_FACILITIES.join(' ')).toContain(
      'all-app-ui-ux-accessibility.spec.ts',
    );
  });

  it('never claims WCAG compliance or certification', () => {
    expect(WCAG_COMPLIANCE_CLAIMED).toBe(false);
    expect(WCAG_CERTIFICATION_CLAIMED).toBe(false);
    const result = evaluateLiveDomAccessibility(baseRequest());
    expect(result.wcag_compliance_claimed).toBe(false);
    expect(result.wcag_certification_claimed).toBe(false);
    expect(claimsWcagCompliance(result)).toBe(false);
    expect(result.tool.wcag_compliance_claimed).toBe(false);
    expect(result.tool.axe_core_imported).toBe(false);
    expect(result.tool.engine).toBe(ACCESSIBILITY_ENGINE_ID);
    expect(result.receipt.verification_status).toBe('structurally_valid');
    expect(result.receipt.verification_status).not.toBe('verified');
  });

  it('evaluates a clean live-DOM fixture as automated passes with no blockers', () => {
    const evaluator = createUiAccessibilityEvaluator();
    const result = evaluator.evaluate(baseRequest());
    expect(result.evaluator_interface).toBe(UI_ACCESSIBILITY_EVALUATOR_INTERFACE);
    expect(result.receipt.interface).toBe(ACCESSIBILITY_RECEIPT_INTERFACE);
    expect(result.receipt.automated_pass_count).toBeGreaterThan(0);
    expect(result.receipt.violation_count).toBe(0);
    expect(result.receipt.violation_ids).toEqual([]);
    expect(result.receipt.keyboard_result).toBe('satisfied');
    expect(result.receipt.screen_reader_reviewed).toBe(false);
    expect(result.keyboard.unreachable_control_ids).toEqual([]);
    expect(result.keyboard.tab_order).toEqual(['goal-title', 'create-goal']);
    expect(result.blocks_automatic_acceptance).toBe(false);
    expect(blocksAutomaticAcceptance(result)).toBe(false);
    expect(listAcceptanceBlockers(result)).toEqual([]);
  });

  it('distinguishes pass, violation, unsupported, and manual-review findings', () => {
    const result = evaluateLiveDomAccessibility(
      baseRequest({
        html: `
          <html>
            <body>
              <h1>Broken</h1>
              <h3>Skipped</h3>
              <button></button>
            </body>
          </html>
        `,
      }),
    );
    const passes = findingsByDisposition(result, 'pass');
    const violations = findingsByDisposition(result, 'violation');
    const unsupported = findingsByDisposition(result, 'unsupported');
    const manual = findingsByDisposition(result, 'manual_review');
    expect(passes.length).toBeGreaterThan(0);
    expect(violations.length).toBeGreaterThan(0);
    expect(unsupported.map(item => item.wcag_criteria[0])).toEqual([
      ...UNSUPPORTED_WCAG_CRITERIA,
    ]);
    expect(manual.map(item => item.finding_id)).toEqual([...MANUAL_CHECK_IDS]);
    expect(result.receipt.manual_check_ids).toEqual([...MANUAL_CHECK_IDS]);
    expect(result.receipt.unsupported_criteria).toEqual([
      ...UNSUPPORTED_WCAG_CRITERIA,
    ]);
    expect(result.receipt.violation_count).toBe(result.receipt.violation_ids.length);
    expect(result.receipt.violation_ids.length).toBeGreaterThan(0);
  });

  it('flags unlabeled interactive controls as critical blockers', () => {
    const result = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:unlabeled',
        html: `<html lang="en"><body><h1>X</h1><button id="save"></button></body></html>`,
      }),
    );
    expect(result.receipt.keyboard_result).toBe('satisfied');
    expect(
      result.receipt.violation_ids.some(id => id.includes('accessible-name')),
    ).toBe(true);
    expect(result.blocks_automatic_acceptance).toBe(true);
    expect(result.acceptance_blockers.some(item => item.severity === 'critical')).toBe(
      true,
    );
    expect(
      result.acceptance_blockers.some(
        item => item.code === 'unlabeled_interactive',
      ),
    ).toBe(true);
  });

  it('flags duplicate IDs as critical acceptance blockers', () => {
    const result = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:dup-id',
        html: `
          <html lang="en">
            <body>
              <h1>Goals</h1>
              <label for="goal-title">Title</label>
              <input id="goal-title" />
              <button id="goal-title">Save</button>
            </body>
          </html>
        `,
      }),
    );
    expect(
      result.receipt.violation_ids.some(id => id.includes('duplicate-id')),
    ).toBe(true);
    expect(
      result.acceptance_blockers.some(item => item.code === 'duplicate_id'),
    ).toBe(true);
    expect(result.blocks_automatic_acceptance).toBe(true);
  });

  it('flags missing form labels, required-state, and error association', () => {
    const result = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:form',
        html: `
          <html lang="en">
            <body>
              <h1>Form</h1>
              <input id="email" aria-invalid="true" />
              <label for="named">Named</label>
              <input id="named" required />
            </body>
          </html>
        `,
      }),
    );
    expect(
      result.findings.some(
        item =>
          item.rule_id === 'form-label' && item.disposition === 'violation',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        item =>
          item.rule_id === 'error-association' &&
          item.disposition === 'violation',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        item =>
          item.rule_id === 'required-state' && item.disposition === 'pass',
      ),
    ).toBe(true);
    expect(
      result.acceptance_blockers.some(item => item.code === 'missing_form_label'),
    ).toBe(true);
  });

  it('checks image alternatives and decorative hiding', () => {
    const result = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:images',
        html: `
          <html lang="en">
            <body>
              <h1>Images</h1>
              <img id="hero" src="hero.png" />
              <img id="logo" src="logo.png" alt="SwissKnife" />
              <img id="dot" src="dot.png" alt="" role="presentation" />
            </body>
          </html>
        `,
      }),
    );
    expect(
      result.findings.some(
        item => item.rule_id === 'image-alt' && item.disposition === 'violation',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        item => item.rule_id === 'image-alt' && item.disposition === 'pass',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        item =>
          item.rule_id === 'decorative-image' && item.disposition === 'pass',
      ),
    ).toBe(true);
  });

  it('detects heading-level skips', () => {
    const result = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:headings',
        html: `<html lang="en"><body><h1>Top</h1><h3>Skipped</h3></body></html>`,
      }),
    );
    expect(
      result.findings.some(
        item =>
          item.rule_id === 'heading-structure' &&
          item.disposition === 'violation',
      ),
    ).toBe(true);
  });

  it('measures contrast and records a serious violation below 4.5:1', () => {
    const fail = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:contrast-fail',
        html: `
          <html lang="en">
            <body>
              <h1 style="color:#999999;background-color:#ffffff;font-size:14px">Dim</h1>
            </body>
          </html>
        `,
      }),
    );
    expect(
      fail.findings.some(
        item => item.rule_id === 'contrast' && item.disposition === 'violation',
      ),
    ).toBe(true);
    const pass = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:contrast-pass',
        html: `
          <html lang="en">
            <body>
              <h1 style="color:#000000;background-color:#ffffff;font-size:16px">Clear</h1>
            </body>
          </html>
        `,
      }),
    );
    expect(
      pass.findings.some(
        item => item.rule_id === 'contrast' && item.disposition === 'pass',
      ),
    ).toBe(true);
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(
      21,
      5,
    );
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
  });

  it('records keyboard reachability, order, traps, and custom-control activation', () => {
    const custom = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:keyboard-custom',
        html: `
          <html lang="en">
            <body>
              <h1>Keys</h1>
              <div id="toggle" role="button">Toggle</div>
            </body>
          </html>
        `,
      }),
    );
    expect(custom.keyboard.result).toBe('violated');
    expect(custom.keyboard.unreachable_control_ids).toContain('toggle');
    expect(custom.keyboard.missing_keyboard_activation_ids).toContain('toggle');
    expect(
      custom.acceptance_blockers.some(item => item.code === 'keyboard_unreachable'),
    ).toBe(true);

    const modal = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:keyboard-modal',
        html: `
          <html lang="en">
            <body>
              <h1>Modal</h1>
              <button id="outside">Outside</button>
              <div role="dialog" aria-modal="true" id="confirm">
                <button id="inside">Confirm</button>
              </div>
            </body>
          </html>
        `,
      }),
    );
    expect(modal.keyboard.trap_contained).toBe(false);
    expect(modal.keyboard.focus_leak_ids).toContain('outside');
    expect(
      modal.acceptance_blockers.some(item => item.code === 'keyboard_trap'),
    ).toBe(true);

    const contained = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:keyboard-contained',
        expected_tab_order: ['inside'],
        html: `
          <html lang="en">
            <body>
              <h1>Modal</h1>
              <div role="dialog" aria-modal="true" id="confirm">
                <button id="inside">Confirm</button>
              </div>
            </body>
          </html>
        `,
      }),
    );
    expect(contained.keyboard.trap_contained).toBe(true);
    expect(contained.keyboard.tab_order_matches).toBe(true);
    expect(contained.keyboard.result).toBe('satisfied');
  });

  it('treats new critical findings against a baseline as machine-readable regressions', () => {
    const clean = evaluateLiveDomAccessibility(
      baseRequest({ scenario_id: 'scenario:regression' }),
    );
    expect(clean.blocks_automatic_acceptance).toBe(false);
    const regressed = evaluateLiveDomAccessibility(
      baseRequest({
        scenario_id: 'scenario:regression',
        baseline_violation_ids: clean.receipt.violation_ids,
        html: `<html lang="en"><body><h1>X</h1><button id="ghost"></button></body></html>`,
      }),
    );
    expect(regressed.blocks_automatic_acceptance).toBe(true);
    expect(
      regressed.acceptance_blockers.some(item => item.code === 'critical_regression'),
    ).toBe(true);
    expect(regressed.acceptance_blockers[0]?.violation_id).toMatch(/^violation:/);
  });

  it('keeps screen-reader review unperformed unless a human review is supplied', () => {
    const auto = evaluateLiveDomAccessibility(baseRequest());
    expect(auto.receipt.screen_reader_reviewed).toBe(false);
    expect(auto.receipt.manual_check_ids).toContain('manual:screen-reader-review');
    const reviewed = evaluateLiveDomAccessibility(
      baseRequest({ screen_reader_reviewed: true }),
    );
    expect(reviewed.receipt.screen_reader_reviewed).toBe(true);
    expect(reviewed.wcag_compliance_claimed).toBe(false);
  });

  it('evaluates an explicit live-DOM node tree and a live document-like host', () => {
    const tree = evaluateLiveDomAccessibility(
      baseRequest({
        html: undefined,
        scenario_id: 'scenario:tree',
        snapshot: {
          lang: 'en',
          title: 'Tree',
          root: makeLiveDomNode({
            tag: 'html',
            attributes: { lang: 'en' },
            children: [
              makeLiveDomNode({
                tag: 'body',
                children: [
                  makeLiveDomNode({ tag: 'h1', text: 'Tree' }),
                  makeLiveDomNode({
                    tag: 'button',
                    id: 'ok',
                    text: 'OK',
                  }),
                ],
              }),
            ],
          }),
        },
      }),
    );
    expect(tree.receipt.violation_count).toBe(0);
    expect(tree.keyboard.tab_order).toEqual(['ok']);

    const documentLike = {
      title: 'Host',
      documentElement: {
        tagName: 'HTML',
        id: '',
        textContent: 'Host Go',
        attributes: {
          length: 1,
          0: { name: 'lang', value: 'en' },
        },
        children: [
          {
            tagName: 'BODY',
            attributes: { length: 0 },
            children: [
              {
                tagName: 'H1',
                textContent: 'Host',
                attributes: { length: 0 },
                children: [],
                childNodes: [{ nodeType: 3, textContent: 'Host' }],
              },
              {
                tagName: 'BUTTON',
                id: 'go',
                textContent: 'Go',
                attributes: {
                  length: 1,
                  0: { name: 'id', value: 'go' },
                },
                children: [],
                childNodes: [{ nodeType: 3, textContent: 'Go' }],
              },
            ],
            childNodes: [],
          },
        ],
        childNodes: [],
      },
    };
    const fromDoc = evaluateLiveDomAccessibility(
      baseRequest({
        html: undefined,
        scenario_id: 'scenario:document',
        document: documentLike,
      }),
    );
    expect(fromDoc.keyboard.tab_order).toContain('go');
    expect(fromDoc.receipt.screen_id).toBe(SCREEN);
  });

  it('applies a UiAccessibilityContract@1 against live roles and names', () => {
    const contract = makeUiAccessibilityContract({
      contract_id: 'contract:agent-supervisor-a11y',
      requirement_kinds: ['accessible_name', 'role'],
      required_roles: ['button', 'heading'],
      required_names: ['Create goal'],
    });
    const pass = evaluateLiveDomAccessibility(baseRequest({ contract }));
    expect(
      pass.findings.some(
        item => item.rule_id === 'contract-name' && item.disposition === 'pass',
      ),
    ).toBe(true);
    const fail = evaluateLiveDomAccessibility(
      baseRequest({
        contract: makeUiAccessibilityContract({
          contract_id: 'contract:missing-name',
          requirement_kinds: ['accessible_name', 'role'],
          required_roles: ['tablist'],
          required_names: ['Does not exist'],
        }),
      }),
    );
    expect(
      fail.findings.some(
        item => item.rule_id === 'contract-role' && item.disposition === 'violation',
      ),
    ).toBe(true);
    expect(
      fail.findings.some(
        item => item.rule_id === 'contract-name' && item.disposition === 'violation',
      ),
    ).toBe(true);
  });

  it('produces identical receipt identities for identical live-DOM inputs', () => {
    const first = evaluateLiveDomAccessibility(baseRequest());
    const second = evaluateLiveDomAccessibility(baseRequest());
    expect(first.receipt_identity).toBe(second.receipt_identity);
    expect(first.keyboard_identity).toBe(second.keyboard_identity);
    expect(accessibilityReceiptDigest(first.receipt)).toBe(first.receipt_identity);
    expect(keyboardEvaluationDigest(first.keyboard)).toBe(first.keyboard_identity);
    expect(serializeAccessibilityReceipt(first.receipt)).toBe(
      serializeAccessibilityReceipt(second.receipt),
    );
  });

  it('decodes a closed AccessibilityReceipt@1 and rejects malformed wire input', () => {
    const receipt = makeAccessibilityReceipt({
      receipt_id: 'receipt:a11y:sample',
      application_id: APP,
      screen_id: SCREEN,
      scenario_id: 'scenario:initial-load',
      repository_revision: REVISION,
      automated_pass_count: 3,
      violation_ids: ['violation:duplicate-id:x'],
    });
    expect(receipt.violation_count).toBe(1);
    expect(decodeAccessibilityReceipt(receipt)).toEqual(receipt);

    const raw = {
      ...receipt,
    } as AccessibilityReceipt & Record<string, unknown>;
    expect(() =>
      decodeAccessibilityReceipt({ ...raw, extra: true }),
    ).toThrow(/unknown AccessibilityReceipt field/);
    expect(() =>
      decodeAccessibilityReceipt({ ...raw, violation_count: 2 }),
    ).toThrow(/violation_count must equal len\(violation_ids\)/);
    expect(() =>
      decodeAccessibilityReceipt({ ...raw, automated_pass_count: -1 }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      decodeAccessibilityReceipt({ ...raw, interface: 'Other@1' }),
    ).toThrow(/unsupported AccessibilityReceipt interface/);
    expect(() =>
      decodeAccessibilityReceipt({ ...raw, violation_ids: null }),
    ).toThrow(/must be an array/);
    expect(() =>
      decodeAccessibilityReceipt({
        ...raw,
        violation_ids: ['violation:a', 'violation:a'],
        violation_count: 2,
      }),
    ).toThrow(/duplicate/);
  });

  it('rejects empty accessibility contracts and unknown requirement kinds', () => {
    expect(() =>
      decodeUiAccessibilityContract({
        interface: UI_ACCESSIBILITY_CONTRACT_INTERFACE,
        schema_version: UI_ACCESSIBILITY_CONTRACT_SCHEMA,
        contract_id: 'contract:empty',
        requirement_kinds: [],
        required_roles: [],
        required_names: [],
        component_id: '',
        notes: '',
      }),
    ).toThrow(/at least one requirement/);
    expect(() =>
      makeUiAccessibilityContract({
        contract_id: 'contract:bad',
        requirement_kinds: ['not-a-kind' as 'other'],
      }),
    ).toThrow(/unsupported value/);
  });

  it('parses HTML into a live-DOM tree without executing scripts', () => {
    const root = parseHtmlToLiveDom(
      `<html lang="en"><body><h1>Hi</h1><script>throw new Error('no')</script></body></html>`,
    );
    expect(root.tag).toBe('html');
    const body = root.children?.[0];
    expect(body?.tag).toBe('body');
    expect(body?.children?.some(child => child.tag === 'script')).toBe(true);
    expect(root.text).toContain('Hi');
  });
});
