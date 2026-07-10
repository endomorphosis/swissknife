const {
  classifyFlatHierarchyGap,
  classifyIpfsDatasetsDirectOnlyDescriptor,
  directOnlyReason,
  resolveHierarchicalToolAlias,
  renderIpfsDatasetsGapDoc,
  accountFlatDescriptorsInAppVisibleLedger,
} = require('../../scripts/capture-hierarchical-mcp-tools-evidence.cjs');

describe('hierarchical MCP tools evidence gap classifier', () => {
  it('classifies reviewed ipfs_datasets_py direct-only descriptor families', () => {
    expect(classifyIpfsDatasetsDirectOnlyDescriptor('policy_list')).toMatchObject({
      direct_only: true,
      policy_class: 'read',
      reason_class: 'root_governance_control_plane',
      dispatch_surface: 'tools/call',
      app_visible_ledger_policy: 'allowed_when_policy_gated',
    });
    expect(classifyIpfsDatasetsDirectOnlyDescriptor('compliance_remove_rule')).toMatchObject({
      direct_only: true,
      policy_class: 'destructive',
      reason_class: 'root_governance_control_plane',
    });
    expect(classifyIpfsDatasetsDirectOnlyDescriptor('development_tools.github_cli_tools')).toMatchObject({
      direct_only: true,
      policy_class: 'external_network',
      reason_class: 'host_development_namespace',
    });
    expect(classifyIpfsDatasetsDirectOnlyDescriptor('wallet_tools.wallet_revoke_grant')).toMatchObject({
      direct_only: true,
      policy_class: 'destructive',
      reason_class: 'credential_control_plane_namespace',
    });
  });

  it('does not silently mark unknown dataset descriptors as direct-only', () => {
    expect(directOnlyReason('future_tools.new_surface')).toMatchObject({
      direct_only: false,
      reason_class: 'unclassified_flat_descriptor',
    });
    expect(classifyIpfsDatasetsDirectOnlyDescriptor('future_tools.new_surface')).toMatchObject({
      direct_only: false,
      dispatch_surface: null,
      app_visible_ledger_policy: 'unexplained_gap_blocked',
    });
  });

  it('returns unexplained dataset gaps for unreviewed names and no unexplained gaps for reviewed names', () => {
    expect(classifyFlatHierarchyGap('ipfs_datasets_py', [
      'policy_list',
      'legacy_mcp_tools.workflow_tools',
      'future_tools.new_surface',
    ])).toMatchObject({
      directOnlyDescriptors: [
        expect.objectContaining({ name: 'policy_list', direct_only: true }),
        expect.objectContaining({ name: 'legacy_mcp_tools.workflow_tools', direct_only: true }),
      ],
      unexplainedFlatHierarchyGap: ['future_tools.new_surface'],
    });
    expect(classifyFlatHierarchyGap('ipfs_datasets_py', [
      'policy_list',
      'legacy_mcp_tools.workflow_tools',
    ])).toMatchObject({
      unexplainedFlatHierarchyGap: [],
    });
  });

  it('accounts hierarchy gaps removed from the app-visible ledger separately', () => {
    const accounting = accountFlatDescriptorsInAppVisibleLedger(
      { service: 'ipfs_datasets_py', role: 'configured' },
      ['policy_list', 'future_tools.removed_surface', 'dataset_tools.load_dataset'],
      ['policy_list', 'future_tools.removed_surface'],
      {
        available: true,
        schema: 'swissknife.all_tools_ledger.v2',
        records: [
          { service: 'ipfs_datasets_py', role: 'configured', name: 'policy_list' },
          { service: 'ipfs_datasets_py', role: 'configured', name: 'dataset_tools.load_dataset' },
          { service: 'ipfs_datasets_py', role: 'static_descriptor', name: 'future_tools.removed_surface' },
        ],
      },
    );

    expect(accounting).toMatchObject({
      app_visible_flat_descriptor_count: 2,
      removed_from_app_visible_ledger_count: 1,
      removed_from_app_visible_ledger_descriptors: ['future_tools.removed_surface'],
    });
  });

  it('uses app-visible binding rows when they are present instead of the raw all-tools ledger', () => {
    const accounting = accountFlatDescriptorsInAppVisibleLedger(
      { service: 'ipfs_datasets_py', role: 'configured' },
      ['policy_list', 'future_tools.raw_only_surface', 'dataset_tools.load_dataset'],
      ['policy_list', 'future_tools.raw_only_surface'],
      {
        available: true,
        schema: 'swissknife.all_tools_ledger.v2',
        records: [
          { service: 'ipfs_datasets_py', role: 'configured', name: 'policy_list' },
          { service: 'ipfs_datasets_py', role: 'configured', name: 'future_tools.raw_only_surface' },
          { service: 'ipfs_datasets_py', role: 'configured', name: 'dataset_tools.load_dataset' },
        ],
        app_visible_ledger_available: true,
        app_visible_ledger_source: 'all-tools-app-bindings',
        app_visible_ledger_schema: 'swissknife.all_tools_app_bindings.v2',
        app_visible_records: [
          { service: 'ipfs_datasets_py', role: 'configured', name: 'policy_list', app_visible: true },
          { service: 'ipfs_datasets_py', role: 'configured', name: 'dataset_tools.load_dataset', app_visible: true },
        ],
      },
    );

    expect(accounting).toMatchObject({
      app_visible_ledger_source: 'all-tools-app-bindings',
      app_visible_ledger_schema: 'swissknife.all_tools_app_bindings.v2',
      app_visible_flat_descriptor_count: 2,
      removed_from_app_visible_ledger_count: 1,
      removed_from_app_visible_ledger_descriptors: ['future_tools.raw_only_surface'],
    });
  });

  it('resolves canonical, category-qualified, slash-qualified, and underscore-qualified hierarchy aliases', () => {
    const categoryRows = [
      { name: 'bespoke_tools', tool_names: ['system_status'] },
      { name: 'dataset_tools', tool_names: ['load_dataset'] },
    ];

    expect(resolveHierarchicalToolAlias(categoryRows, 'system_status')).toMatchObject({
      resolved: true,
      alias_kind: 'canonical',
      category: 'bespoke_tools',
      tool: 'system_status',
      canonical_name: 'bespoke_tools.system_status',
    });
    expect(resolveHierarchicalToolAlias(categoryRows, 'bespoke_tools.system_status')).toMatchObject({
      resolved: true,
      alias_kind: 'dot_qualified',
      category: 'bespoke_tools',
      tool: 'system_status',
    });
    expect(resolveHierarchicalToolAlias(categoryRows, 'bespoke_tools/system_status')).toMatchObject({
      resolved: true,
      alias_kind: 'slash_qualified',
      category: 'bespoke_tools',
      tool: 'system_status',
    });
    expect(resolveHierarchicalToolAlias(categoryRows, 'bespoke_tools_system_status')).toMatchObject({
      resolved: true,
      alias_kind: 'underscore_qualified',
      category: 'bespoke_tools',
      tool: 'system_status',
    });
  });

  it('does not resolve ambiguous bare canonical aliases across categories', () => {
    const categoryRows = [
      { name: 'bespoke_tools', tool_names: ['status'] },
      { name: 'monitoring_tools', tool_names: ['status'] },
    ];

    expect(resolveHierarchicalToolAlias(categoryRows, 'status')).toMatchObject({
      resolved: false,
      reason: 'ambiguous_alias',
    });
    expect(resolveHierarchicalToolAlias(categoryRows, 'bespoke_tools/status')).toMatchObject({
      resolved: true,
      category: 'bespoke_tools',
      tool: 'status',
    });
  });

  it('renders the standing direct-only classifier policy into the generated doc', () => {
    const doc = renderIpfsDatasetsGapDoc({
      generated_at: '2026-07-10T00:00:00.000Z',
      decision: 'go',
    }, {
      service: 'ipfs_datasets_py',
      flat_non_meta_tool_count: 2,
      raw_flat_hierarchy_gap_count: 1,
      flat_direct_only_count: 1,
      removed_from_app_visible_ledger_count: 0,
      unexplained_flat_hierarchy_gap_count: 0,
      flat_hierarchy_gap_closure: {
        listed_through_hierarchy_count: 1,
      },
      app_visible_ledger_accounting: {
        app_visible_ledger_available: true,
        app_visible_ledger_source: 'all-tools-app-bindings',
        app_visible_ledger_schema: 'swissknife.all_tools_ledger.v2',
        app_visible_flat_descriptor_count: 2,
      },
      flat_direct_only_reason_counts: {
        root_governance_control_plane: 1,
      },
      flat_direct_only_policy_counts: {
        read: 1,
      },
      flat_direct_only_descriptors: [
        classifyIpfsDatasetsDirectOnlyDescriptor('policy_list'),
      ],
      alias_dispatch_probe_count: 4,
      alias_dispatch_pass_count: 4,
      direct_only_probe_count: 1,
      direct_only_receipt_count: 1,
      alias_dispatch_probes: [
        {
          alias: 'bespoke_tools/system_status',
          response_type: 'tools_dispatch_success',
          category: 'bespoke_tools',
          tool: 'system_status',
          receipt: { receipt_type: 'hierarchical_alias_dispatch_probe' },
        },
      ],
      direct_only_probes: [
        {
          name: 'policy_list',
          response_type: 'typed_direct_only_policy_response',
          dispatch_surface: 'tools/call',
          receipt: { receipt_type: 'direct_only_descriptor_probe' },
        },
      ],
    });

    expect(doc).toContain('## Direct-Only Classifier Policy');
    expect(doc).toContain('## App-Visible Ledger Accounting');
    expect(doc).toContain('## Dispatch Receipt Evidence');
    expect(doc).toContain('Ledger source: `all-tools-app-bindings`');
    expect(doc).toContain('`policy_*`');
    expect(doc).toContain('`development_tools.*`');
    expect(doc).toContain('`hierarchical_alias_dispatch_probe`');
    expect(doc).toContain('`direct_only_descriptor_probe`');
    expect(doc).toContain('No unexplained `ipfs_datasets_py` flat/direct descriptor gap remains.');
  });
});
