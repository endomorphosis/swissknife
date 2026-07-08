export interface AllToolsCompositeWorkflowStep {
  step_id: string;
  order: number;
  purpose: string;
  tool_id: string;
  service_id: string;
  app_id: string;
  capability_id: string;
  mcp_tool_name?: string;
  app_visible: boolean;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  disposition: string;
  normalized_disposition: string;
  adapter_required: boolean;
  input_contract?: Record<string, unknown>;
  output_contract?: Record<string, unknown>;
  rollback?: Record<string, unknown>;
  event_node?: Record<string, unknown>;
  glasses?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AllToolsCompositeWorkflow {
  workflow_id: string;
  title: string;
  category: string;
  intent: string;
  service_chain: readonly string[];
  app_chain: readonly string[];
  policy_classes: readonly string[];
  requires_confirmation: boolean;
  requires_receipt: boolean;
  requires_desktop_mobile_handoff: boolean;
  adapter_required: boolean;
  cleanup_behavior: {
    strategy: string;
    cleanup_tool_ids?: readonly string[];
    rollback_notes?: string;
    [key: string]: unknown;
  };
  glasses_fallback_summary: string;
  event_dag?: Record<string, unknown>;
  steps: readonly AllToolsCompositeWorkflowStep[];
  [key: string]: unknown;
}

export interface AllToolsCompositeWorkflowCatalog {
  catalog_id: string;
  schema: string;
  version?: string;
  generated_at?: string;
  generated_from?: readonly string[];
  workflow_count: number;
  step_count: number;
  required_category_coverage?: readonly string[];
  service_counts?: Record<string, number>;
  app_counts?: Record<string, number>;
  policy_counts?: Record<string, number>;
  adapter_required_step_count?: number;
  desktop_mobile_handoff_step_count?: number;
  workflows: readonly AllToolsCompositeWorkflow[];
}
