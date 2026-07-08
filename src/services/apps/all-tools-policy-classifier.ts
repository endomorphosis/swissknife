import type { AppRuntimeClass } from './app-manifest.js';
import { textReferencesHostOnlyCapability } from './app-manifest.js';

export interface AllToolsSchemaSummary {
  input_properties?: readonly string[];
  input_required?: readonly string[];
  output_properties?: readonly string[];
  output_required?: readonly string[];
}

export interface AllToolsLedgerTool {
  tool_id: string;
  service_id: string;
  name: string;
  unqualified_name?: string;
  normalized_unqualified_name?: string;
  category: string;
  namespace?: string;
  operation?: string;
  surface?: string;
  tool_module?: string;
  description?: string;
  read_only?: boolean;
  tags?: readonly string[];
  schemas?: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
  schema_summary?: AllToolsSchemaSummary;
  policy_classification?: {
    status?: string;
    initial_policy_hint?: string;
    reason?: string;
  };
  coverage_status?: string;
  alias_of?: string | null;
  aliases?: readonly string[];
  [key: string]: unknown;
}

export interface AllToolsLedger {
  schema?: string;
  generated_at?: string;
  timeout_ms?: number;
  services?: readonly string[];
  summary?: {
    exact_tool_record_count?: number;
    live_exact_tool_count?: number;
    static_exact_tool_count?: number;
    [key: string]: unknown;
  };
  category_counts?: Record<string, number>;
  source_counts?: Record<string, number>;
  tools: readonly AllToolsLedgerTool[];
  [key: string]: unknown;
}

export interface AllToolsPolicyRule {
  tool_id: string;
  service_id: string;
  name: string;
  category: string;
  owner_module: string;
  owner_reason?: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  fallback_rule: string;
  exposure_disposition: string;
  glasses_exposure: string;
  side_effectful: boolean;
  sensitive: boolean;
  high_risk: boolean;
  app_visible: boolean;
  live_discovered?: boolean;
  static_described?: boolean;
  alias_of?: string | null;
  aliases?: readonly string[];
  reasons?: readonly string[];
  [key: string]: unknown;
}

export interface AllToolsPolicyMatrix {
  matrix_id: string;
  schema: string;
  version?: string;
  generated_from?: readonly string[];
  generated_at?: string;
  ledger_generated_at?: string;
  tool_count: number;
  class_counts?: Record<string, number>;
  owner_counts?: Record<string, number>;
  exposure_counts?: Record<string, number>;
  service_counts?: Record<string, number>;
  rules: readonly AllToolsPolicyRule[];
}

// ---------------------------------------------------------------------------
// App runtime classification
//
// Maps a policy rule (one governed MCP/MCP++ tool) onto the AppRuntimeClass
// taxonomy used by app manifests (see ./app-manifest.ts): whether the tool's
// capability can run entirely in the browser, is browser-visible but
// host-degraded, or is host-only and must never be app_visible in a browser
// bundle.
// ---------------------------------------------------------------------------

/**
 * Classifies a single policy rule's *intrinsic* runtime requirement,
 * independent of whether it currently happens to be `app_visible`. This lets
 * {@link validateAppRuntimeClassificationExposure} catch drift: a rule whose
 * capability is inherently host-only but which was (incorrectly) marked
 * `app_visible` in the ledger/matrix.
 *
 *   - Rules referencing a host-only capability keyword (filesystem,
 *     subprocess, native, hardware, ...) are `host-only`: the capability
 *     must never be reachable from a browser bundle, regardless of the
 *     current `app_visible` flag.
 *   - `high_risk` + `sensitive` + `side_effectful` rules are treated as
 *     `host-only` even without a keyword match, since they are deliberately
 *     excluded from browser-reachable surfaces.
 *   - Everything else is `browser-safe`.
 *
 * Note: unlike `inferAppRuntimeClassFromBindingRow` in
 * `all-tools-app-binding-matrix.ts` (which describes an *already bound* app
 * surface and may legitimately report `hybrid` for a host-degraded but
 * bundled app), this classifier answers the upstream question "should this
 * capability ever be app-visible at all?" and is intentionally binary.
 */
export function classifyAppRuntimeClassFromPolicyRule(rule: AllToolsPolicyRule): AppRuntimeClass {
  const referencesHostOnlyCapability = textReferencesHostOnlyCapability(
    rule.category,
    rule.policy_class,
    rule.owner_module,
  );

  const isDeliberatelyExcludedHighRiskRule = rule.high_risk === true
    && rule.sensitive === true
    && rule.side_effectful === true;

  return (referencesHostOnlyCapability || isDeliberatelyExcludedHighRiskRule) ? 'host-only' : 'browser-safe';
}

export interface AppRuntimeClassificationRow {
  tool_id: string;
  service_id: string;
  name: string;
  app_visible: boolean;
  runtime_class: AppRuntimeClass;
}

export interface AppRuntimeClassificationSummary {
  tool_count: number;
  class_counts: Record<AppRuntimeClass, number>;
  app_visible_class_counts: Record<AppRuntimeClass, number>;
  rows: readonly AppRuntimeClassificationRow[];
}

function emptyRuntimeClassCounts(): Record<AppRuntimeClass, number> {
  return {
    'browser-safe': 0,
    hybrid: 0,
    'remote-capability': 0,
    'host-only': 0,
  };
}

/**
 * Classifies every rule in a policy matrix and summarizes the runtime-class
 * distribution, split by overall count and by `app_visible` count. Used to
 * assert that no `host-only` rule is ever counted as `app_visible` in the
 * browser-facing app surface.
 */
export function buildAppRuntimeClassificationSummary(
  matrix: AllToolsPolicyMatrix,
): AppRuntimeClassificationSummary {
  const classCounts = emptyRuntimeClassCounts();
  const appVisibleClassCounts = emptyRuntimeClassCounts();
  const rows: AppRuntimeClassificationRow[] = [];

  for (const rule of matrix.rules) {
    const runtimeClass = classifyAppRuntimeClassFromPolicyRule(rule);
    classCounts[runtimeClass] += 1;
    if (rule.app_visible) {
      appVisibleClassCounts[runtimeClass] += 1;
    }
    rows.push({
      tool_id: rule.tool_id,
      service_id: rule.service_id,
      name: rule.name,
      app_visible: rule.app_visible,
      runtime_class: runtimeClass,
    });
  }

  return {
    tool_count: matrix.rules.length,
    class_counts: classCounts,
    app_visible_class_counts: appVisibleClassCounts,
    rows,
  };
}

export interface AppRuntimeClassificationValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Fails when any rule classified `host-only` is `app_visible`: a host-only
 * capability must never be exposed as a bundled/browser-reachable app
 * surface. `remote-capability` and `hybrid` rules may be `app_visible`.
 */
export function validateAppRuntimeClassificationExposure(
  matrix: AllToolsPolicyMatrix,
): AppRuntimeClassificationValidationResult {
  const errors: string[] = [];

  for (const rule of matrix.rules) {
    const runtimeClass = classifyAppRuntimeClassFromPolicyRule(rule);
    if (runtimeClass === 'host-only' && rule.app_visible) {
      errors.push(
        `Rule "${rule.tool_id}" is classified host-only but is app_visible; host-only capabilities must not be exposed to the browser app surface.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
