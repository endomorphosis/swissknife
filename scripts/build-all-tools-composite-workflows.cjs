#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const bindingsPath = path.join(evidenceRoot, 'all-tools-app-bindings.json');
const outputPath = path.join(evidenceRoot, 'all-tools-composite-workflows.json');
const markdownPath = path.join(evidenceRoot, 'all-tools-composite-workflows.md');

const WORKFLOW_SPECS = [
  {
    id: 'workflow.wallet-credential-safe',
    title: 'Credential review and audit-safe secret workflow',
    category: 'credential',
    intent: 'Review, rotate, and audit credentials through desktop/mobile confirmation before any secret tool dispatch.',
    apps: ['api-keys', 'mcp-control'],
    services: ['ipfs_kit_py'],
    categories: ['secrets'],
    cleanup: 'revoke_grant_after_audit',
    fallback: 'desktop/mobile confirmation card with redacted secret preview',
    adapterRequired: false,
  },
  {
    id: 'workflow.hardware-selection-to-job',
    title: 'Hardware selection to accelerated job workflow',
    category: 'heavy_compute',
    intent: 'Select hardware, submit an accelerated job, and monitor the result with MCP receipts.',
    apps: ['device-manager', 'training-manager'],
    services: ['ipfs_accelerate_py'],
    categories: ['hardware', 'tasks', 'jobs'],
    cleanup: 'cancel_or_release_runner_on_failure',
    fallback: 'desktop/mobile job confirmation and progress card',
    adapterRequired: true,
  },
  {
    id: 'workflow.dataset-to-model-search',
    title: 'Dataset to model discovery workflow',
    category: 'read',
    intent: 'Find a dataset-backed model candidate and preserve provenance for model-browser review.',
    apps: ['model-browser', 'training-manager'],
    services: ['ipfs_datasets_py', 'ipfs_accelerate_py'],
    categories: ['datasets', 'models', 'search'],
    cleanup: 'drop_transient_query_state',
    fallback: 'mobile-card summary of dataset/model candidates',
    adapterRequired: false,
  },
  {
    id: 'workflow.ipfs-media-publish-playback',
    title: 'IPFS media publish and playback workflow',
    category: 'storage',
    intent: 'Resolve, pin, and open content-addressed media across IPFS Explorer and media apps.',
    apps: ['ipfs-explorer', 'media-player', 'cinema', 'image-viewer'],
    services: ['ipfs_kit_py'],
    categories: ['ipfs', 'files', 'media'],
    cleanup: 'unpin_transient_test_content',
    fallback: 'display-webapp media card with gateway fallback',
    adapterRequired: false,
  },
  {
    id: 'workflow.p2p-presence-handoff',
    title: 'P2P presence and message handoff workflow',
    category: 'network',
    intent: 'Discover peers, confirm presence, and route a P2P message through IPFS/libp2p capabilities.',
    apps: ['p2p-network', 'friends-list', 'p2p-chat', 'p2p-chat-unified'],
    services: ['ipfs_kit_py', 'ipfs_accelerate_py'],
    categories: ['p2p', 'network', 'pubsub'],
    cleanup: 'expire_presence_announcement',
    fallback: 'mobile chat card with reconnect action',
    adapterRequired: false,
  },
  {
    id: 'workflow.code-review-provenance',
    title: 'Code review provenance workflow',
    category: 'analysis',
    intent: 'Search code, attach repository context, and record review provenance from developer apps.',
    apps: ['vibecode', 'github', 'notes'],
    services: ['ipfs_datasets_py', 'ipfs_accelerate_py'],
    categories: ['code', 'github', 'documentation', 'analysis'],
    cleanup: 'delete_transient_review_index',
    fallback: 'desktop/mobile review summary with receipt links',
    adapterRequired: false,
  },
  {
    id: 'workflow.image-analysis-pipeline',
    title: 'Image analysis and content-addressed artifact workflow',
    category: 'media_analysis',
    intent: 'Analyze an image, persist generated artifacts, and expose display fallbacks.',
    apps: ['neural-photoshop', 'image-viewer', 'file-manager'],
    services: ['ipfs_datasets_py', 'ipfs_kit_py', 'ipfs_accelerate_py'],
    categories: ['image', 'media', 'embedding', 'files'],
    cleanup: 'remove_transient_media_artifacts',
    fallback: 'display-webapp image result card',
    adapterRequired: false,
  },
];

main();

function main() {
  const bindingMatrix = readJson(bindingsPath);
  const rows = bindingMatrix.rows || bindingMatrix.bindings || [];
  const workflows = WORKFLOW_SPECS.map(spec => buildWorkflow(spec, rows));
  const catalog = {
    catalog_id: 'org.hallucinate.swissknife.all-tools-composite-workflows',
    schema: 'swissknife.all-tools-composite-workflows.v1',
    version: '2026-07-08',
    generated_at: new Date().toISOString(),
    generated_from: ['all-tools-app-bindings.json'],
    workflow_count: workflows.length,
    step_count: workflows.reduce((sum, workflow) => sum + workflow.steps.length, 0),
    required_category_coverage: WORKFLOW_SPECS.map(spec => spec.category),
    service_counts: countBy(workflows.flatMap(workflow => workflow.service_chain)),
    app_counts: countBy(workflows.flatMap(workflow => workflow.app_chain)),
    policy_counts: countBy(workflows.flatMap(workflow => workflow.policy_classes)),
    adapter_required_step_count: workflows.flatMap(workflow => workflow.steps).filter(step => step.adapter_required).length,
    desktop_mobile_handoff_step_count: workflows.flatMap(workflow => workflow.steps).filter(step => !step.app_visible).length,
    workflows,
  };

  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(catalog), 'utf8');
  console.log(JSON.stringify({
    schema: catalog.schema,
    workflow_count: catalog.workflow_count,
    step_count: catalog.step_count,
    output: path.relative(repoRoot, outputPath),
  }, null, 2));
}

function buildWorkflow(spec, rows) {
  const selectedRows = selectRows(spec, rows);
  const steps = selectedRows.map((row, index) => {
    const stepId = `${spec.id}.step-${index + 1}`;
    return {
      step_id: stepId,
      order: index + 1,
      purpose: stepPurpose(spec, row, index),
      tool_id: row.tool_id,
      service_id: row.service_id || row.service,
      app_id: row.app_id || spec.apps[0],
      capability_id: row.capability_id || row.tool_id,
      mcp_tool_name: row.mcp_tool_name || row.name,
      app_visible: Boolean(row.app_visible),
      policy_class: row.policy_class || spec.category,
      confirmation_policy: row.confirmation_policy || 'required',
      receipt_policy: row.receipt_policy || 'required',
      disposition: row.disposition || 'existing_app_capability',
      normalized_disposition: row.normalized_disposition || row.disposition || 'existing_app_capability',
      adapter_required: Boolean(spec.adapterRequired && index === selectedRows.length - 1),
      input_contract: {
        consumes_state_keys: index === 0 ? ['request_ref'] : [`step_${index}_result_ref`],
      },
      output_contract: {
        produces_state_keys: [`step_${index + 1}_result_ref`, `step_${index + 1}_receipt_ref`],
      },
      rollback: {
        cleanup_tool_ids: index === selectedRows.length - 1 ? selectedRows.slice(0, index).map(candidate => candidate.tool_id) : [],
        notes: spec.cleanup,
      },
      event_node: {
        id: stepId,
        parents: index === 0 ? [] : [`${spec.id}.step-${index}`],
      },
      glasses: {
        fallback: row.app_visible ? (row.glasses_fallback || spec.fallback) : 'desktop_or_mobile_only',
        exposure: row.glasses_exposure || 'display-webapp',
      },
    };
  });

  return {
    workflow_id: spec.id,
    title: spec.title,
    category: spec.category,
    intent: spec.intent,
    service_chain: unique(steps.map(step => step.service_id)),
    app_chain: unique(steps.map(step => step.app_id)),
    policy_classes: unique(steps.map(step => step.policy_class)),
    requires_confirmation: steps.some(step => step.confirmation_policy !== 'none'),
    requires_receipt: steps.some(step => step.receipt_policy !== 'none'),
    requires_desktop_mobile_handoff: steps.some(step => !step.app_visible),
    adapter_required: steps.some(step => step.adapter_required),
    cleanup_behavior: {
      strategy: spec.cleanup,
      cleanup_tool_ids: unique(steps.flatMap(step => step.rollback.cleanup_tool_ids)),
      rollback_notes: spec.cleanup,
    },
    glasses_fallback_summary: spec.fallback,
    event_dag: {
      root: steps[0]?.step_id,
      terminal: steps[steps.length - 1]?.step_id,
      nodes: steps.map(step => step.step_id),
    },
    steps,
  };
}

function selectRows(spec, rows) {
  const matches = rows.filter(row => (
    spec.apps.includes(row.app_id)
    && spec.services.includes(row.service_id || row.service)
    && (
      spec.categories.some(category => String(row.category || '').toLowerCase().includes(category))
      || spec.categories.some(category => String(row.name || '').toLowerCase().includes(category))
      || spec.categories.some(category => String(row.tool_id || '').toLowerCase().includes(category))
    )
  ));
  const visible = matches.filter(row => row.app_visible);
  const preferred = spec.id === 'workflow.wallet-credential-safe' ? matches : visible;
  const selected = uniqueBy(preferred.length >= 2 ? preferred : matches, row => row.tool_id).slice(0, 3);
  if (selected.length > 0) return selected;

  const fallback = rows.filter(row => (
    spec.apps.includes(row.app_id)
    || spec.services.includes(row.service_id || row.service)
  ));
  return uniqueBy(fallback, row => row.tool_id).slice(0, 3);
}

function stepPurpose(spec, row, index) {
  const verb = index === 0 ? 'Prepare' : index === 1 ? 'Invoke' : 'Record';
  return `${verb} ${row.name || row.tool_id} for ${spec.title}.`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function renderMarkdown(catalog) {
  const lines = [
    '# All-Tools Composite Workflows',
    '',
    `Generated: ${catalog.generated_at}`,
    '',
    '| Workflow | Steps | Services | Apps | Cleanup |',
    '| --- | ---: | --- | --- | --- |',
  ];
  for (const workflow of catalog.workflows) {
    lines.push(`| ${workflow.workflow_id} | ${workflow.steps.length} | ${workflow.service_chain.join(', ')} | ${workflow.app_chain.join(', ')} | ${workflow.cleanup_behavior.strategy} |`);
  }
  lines.push('');
  return lines.join('\n');
}
