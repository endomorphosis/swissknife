/**
 * UIR-043: Meta-glasses and spatial projection adapter (TypeScript).
 */
import { describe, expect, it } from 'vitest';
import {
  ARROW_ENTER_TOKENS,
  UNSUPPORTED_GLASSES_ASSUMPTIONS,
  UIIRGlassesAdapter,
  UIIRGlassesAdapterError,
  UIIR_GLASSES_ADAPTER_INTERFACE,
  UIIR_GLASSES_PROJECTION_INTERFACE,
  defaultInputBindings,
  glassesCapabilityProfile,
  isSupportedArrowEnterToken,
  normalizeArrowEnterIntent,
  normalizeGlassesIntent,
  projectUIIRToGlasses,
  rejectFabricatedCapabilityClaims,
  renderPathForCapabilityPath,
  type GlassesProjectionRequest,
  type GlassesSemanticItem,
} from '../../src/services/glasses/ui-ux-ir-glasses-adapter';

function pilotItems(extraActions = 0): GlassesSemanticItem[] {
  const items: GlassesSemanticItem[] = [
    {
      item_id: 'action_primary',
      semantic_kind: 'action',
      mandatory: true,
      label: 'Primary',
      action_cost: 1,
      text_chars: 20,
      field_of_view_share: 8,
      attention_cost: 5,
      priority: 10,
      fallback_ref: 'fallback:mobile:action_primary',
      fallback_capability_ids: ['mobile_companion', 'audio'],
    },
    {
      item_id: 'confirm_delete',
      semantic_kind: 'confirmation',
      mandatory: true,
      label: 'Confirm delete',
      action_cost: 1,
      text_chars: 48,
      field_of_view_share: 10,
      attention_cost: 7,
      priority: 5,
      fallback_ref: 'fallback:audio:confirm_delete',
      fallback_capability_ids: ['audio', 'mobile_companion'],
    },
    {
      item_id: 'privacy_mic',
      semantic_kind: 'privacy',
      mandatory: true,
      label: 'Mic privacy',
      action_cost: 0,
      text_chars: 40,
      field_of_view_share: 6,
      attention_cost: 4,
      priority: 1,
      fallback_ref: 'fallback:audio:privacy_mic',
      fallback_capability_ids: ['audio', 'mobile_companion'],
    },
    {
      item_id: 'feedback_ok',
      semantic_kind: 'feedback',
      mandatory: true,
      label: 'Done',
      action_cost: 0,
      text_chars: 24,
      field_of_view_share: 4,
      attention_cost: 3,
      priority: 20,
      fallback_ref: 'fallback:audio:feedback_ok',
      fallback_capability_ids: ['audio', 'notification'],
    },
  ];
  for (let index = 0; index < extraActions; index += 1) {
    items.push({
      item_id: `action_extra_${index}`,
      semantic_kind: 'action',
      mandatory: true,
      label: `Extra ${index}`,
      action_cost: 1,
      text_chars: 30,
      field_of_view_share: 10,
      attention_cost: 5,
      priority: 50 + index,
      fallback_ref: `fallback:mobile:action_extra_${index}`,
      fallback_capability_ids: ['mobile_companion', 'audio'],
    });
  }
  return items;
}

function request(
  overrides: Partial<GlassesProjectionRequest> = {},
): GlassesProjectionRequest {
  return {
    document_id: 'doc:glasses-pilot',
    capability_path: 'web_app',
    items: pilotItems(),
    title: 'Glasses pilot',
    ...overrides,
  };
}

describe('UIIRGlassesAdapter@1 capability paths', () => {
  it('keeps DAT and Web App capability paths distinct', () => {
    const dat = glassesCapabilityProfile('dat');
    const web = glassesCapabilityProfile('web_app');
    expect(dat.profile_id).not.toBe(web.profile_id);
    expect(dat.render_path).toBe('dat-native');
    expect(web.render_path).toBe('display-webapp');
    expect(dat.input_capability_ids).toContain('hand_gesture');
    expect(web.input_capability_ids).not.toContain('hand_gesture');
    expect(renderPathForCapabilityPath('dat')).toBe('dat-native');
    expect(renderPathForCapabilityPath('web_app')).toBe('display-webapp');
    expect(dat.raw_emg).toBe(false);
    expect(web.continuous_cursor).toBe(false);
    expect(web.freeform_touch).toBe(false);
    expect(web.continuous_text_input).toBe(false);
  });

  it('rejects fabricated capability claims and collapsed paths', () => {
    expect(() =>
      rejectFabricatedCapabilityClaims({ raw_emg: true }),
    ).toThrow(UIIRGlassesAdapterError);
    expect(() =>
      rejectFabricatedCapabilityClaims({ dat_webapp_collapsed: true }),
    ).toThrow(/collapsed/);
    expect(() =>
      rejectFabricatedCapabilityClaims({ emg_raw: 'sample' }),
    ).toThrow(/Raw EMG/);
    expect(() =>
      rejectFabricatedCapabilityClaims({
        raw_emg: false,
        continuous_cursor: false,
        dat_webapp_collapsed: false,
      }),
    ).not.toThrow();
  });
});

describe('Arrow/Enter Neural Band and captouch mapping', () => {
  it('maps Arrow and Enter tokens to abstract intents only', () => {
    expect(normalizeArrowEnterIntent('ArrowUp')).toBe('navigate_up');
    expect(normalizeArrowEnterIntent('ArrowDown')).toBe('navigate_down');
    expect(normalizeArrowEnterIntent('ArrowLeft')).toBe('navigate_left');
    expect(normalizeArrowEnterIntent('ArrowRight')).toBe('navigate_right');
    expect(normalizeArrowEnterIntent('Enter')).toBe('activate');
    expect(normalizeArrowEnterIntent('enter')).toBe('activate');
    expect(isSupportedArrowEnterToken('ArrowUp')).toBe(true);
    expect(isSupportedArrowEnterToken('MouseMove')).toBe(false);
    expect(() => normalizeArrowEnterIntent('MouseMove')).toThrow(
      /Arrow\/Enter/,
    );
    expect(() => normalizeArrowEnterIntent('emg_burst')).toThrow(
      UIIRGlassesAdapterError,
    );
  });

  it('binds Neural Band/captouch/D-pad to Arrow/Enter tokens without raw EMG', () => {
    const bindings = defaultInputBindings('web_app');
    expect(bindings.map(b => b.source).sort()).toEqual([
      'captouch',
      'dpad',
      'neural_band',
    ]);
    for (const binding of bindings) {
      expect(binding.admitted_tokens).toEqual([...ARROW_ENTER_TOKENS]);
      expect(binding.raw_emg_allowed).toBe(false);
      expect(binding.continuous_cursor_allowed).toBe(false);
      expect(binding.freeform_touch_allowed).toBe(false);
      expect(binding.continuous_text_input_allowed).toBe(false);
    }
    const neural = normalizeGlassesIntent('Enter', {
      source: 'neural_band',
      capability_path: 'web_app',
    });
    expect(neural.intent).toBe('activate');
    expect(neural.raw_emg).toBe(false);
    expect(neural.continuous_cursor).toBe(false);
    const captouch = normalizeGlassesIntent('ArrowRight', {
      source: 'captouch',
    });
    expect(captouch.intent).toBe('navigate_right');
  });
});

describe('projectUIIRToGlasses', () => {
  it('preserves privacy indicators and confirmations on Web App path', () => {
    const projection = projectUIIRToGlasses(request());
    expect(projection.interface).toBe(UIIR_GLASSES_PROJECTION_INTERFACE);
    expect(projection.capability_path).toBe('web_app');
    expect(projection.capability_receipt.dat_webapp_collapsed).toBe(false);
    expect(projection.capability_receipt.render_path).toBe('display-webapp');

    const confirm = projection.nodes.find(n => n.semantic_kind === 'confirmation');
    const privacy = projection.nodes.find(n => n.semantic_kind === 'privacy');
    expect(confirm).toBeDefined();
    expect(privacy).toBeDefined();
    expect(confirm?.surface).toBe('confirmation');
    expect(privacy?.surface).toBe('privacy_indicator');
    expect(confirm?.disposition).not.toBe('omitted');
    expect(privacy?.disposition).not.toBe('omitted');

    const unsupported = new Set(
      projection.losses
        .filter(
          loss =>
            loss.category === 'unsupported' &&
            loss.semantic_id.startsWith('assumption:'),
        )
        .map(loss => loss.semantic_id.replace('assumption:', '')),
    );
    for (const assumption of UNSUPPORTED_GLASSES_ASSUMPTIONS) {
      expect(unsupported.has(assumption)).toBe(true);
    }
  });

  it('uses DAT-native render path without collapsing Web App profile', () => {
    const dat = projectUIIRToGlasses(request({ capability_path: 'dat' }));
    const web = projectUIIRToGlasses(request({ capability_path: 'web_app' }));
    expect(dat.profile_id).toBe('profile:glasses:dat');
    expect(dat.compiler_handoff.render_path).toBe('dat-native');
    expect(dat.compiler_handoff.input_kinds).toContain('gesture');
    expect(web.compiler_handoff.render_path).toBe('display-webapp');
    expect(dat.profile_id).not.toBe(web.profile_id);
  });

  it('emits action/text/update/FOV budget receipts under pressure', () => {
    const projection = projectUIIRToGlasses(
      request({ items: pilotItems(8) }),
    );
    expect(projection.budget_receipt.action_limit).toBe(4);
    expect(projection.budget_receipt.text_limit).toBe(180);
    expect(projection.budget_receipt.update_limit).toBe(10);
    expect(projection.budget_receipt.field_of_view_limit).toBe(30);
    const fallbackOrUnsat = projection.nodes.filter(
      n => n.disposition === 'fallback' || n.disposition === 'unsatisfiable',
    );
    expect(fallbackOrUnsat.length).toBeGreaterThan(0);
    expect(['fallback', 'unsatisfiable', 'degraded']).toContain(
      projection.status,
    );
  });

  it('routes continuous text input to mobile fallback rather than fabricating text entry', () => {
    const projection = projectUIIRToGlasses(
      request({
        items: [
          {
            item_id: 'privacy_core',
            semantic_kind: 'privacy',
            mandatory: true,
            label: 'Privacy',
            priority: 1,
            fallback_capability_ids: ['audio'],
          },
          {
            item_id: 'text_entry',
            semantic_kind: 'text_input',
            mandatory: true,
            label: 'Type a note',
            priority: 20,
            fallback_ref: 'fallback:mobile:text_entry',
            fallback_capability_ids: ['mobile_companion'],
          },
        ],
      }),
    );
    const textNode = projection.nodes.find(n => n.semantic_id === 'text_entry');
    expect(textNode).toBeDefined();
    expect(textNode?.disposition).toBe('fallback');
    expect(textNode?.surface).toBe('mobile_fallback');
    expect(
      projection.losses.some(
        loss =>
          loss.semantic_id === 'text_entry' && loss.category === 'fallback',
      ),
    ).toBe(true);
  });

  it('produces compiler handoff compatible with glasses display compiler inputs', () => {
    const projection = projectUIIRToGlasses(request());
    const handoff = projection.compiler_handoff;
    expect(['single-card', 'stack', 'confirmation']).toContain(handoff.template);
    expect(['dat-native', 'display-webapp', 'simulator']).toContain(
      handoff.render_path,
    );
    expect(handoff.max_actions).toBeGreaterThanOrEqual(1);
    expect(handoff.max_text_chars).toBeGreaterThan(0);
    expect(handoff.max_update_hz).toBeGreaterThan(0);
    expect(Array.isArray(handoff.actions)).toBe(true);
    expect(Array.isArray(handoff.regions)).toBe(true);
    expect(Array.isArray(handoff.fallbacks)).toBe(true);
    expect(handoff.input_kinds).toContain('dpad');
  });

  it('exposes class adapter API aligned with UIIRGlassesAdapter@1', () => {
    const adapter = new UIIRGlassesAdapter('web_app');
    expect(adapter.interface).toBe(UIIR_GLASSES_ADAPTER_INTERFACE);
    expect(adapter.normalizeIntent('Enter').intent).toBe('activate');
    const projection = adapter.project(request());
    expect(projection.capability_path).toBe('web_app');
    expect(adapter.inputBindings()).toHaveLength(3);
  });

  it('fails closed on empty items and unknown paths', () => {
    expect(() => projectUIIRToGlasses({ items: [] })).toThrow(/non-empty/);
    expect(() =>
      glassesCapabilityProfile('hololens' as 'web_app'),
    ).toThrow(/Unknown glasses capability path/);
  });
});
