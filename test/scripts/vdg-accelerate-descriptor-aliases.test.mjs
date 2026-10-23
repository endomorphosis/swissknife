import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The board invokes plain node --test; load only these actual TypeScript
// dependencies through the project's declared loader without global flags.
const require = createRequire(import.meta.url);
const { require: tsxRequire } = require('tsx/cjs/api');
const fromFile = fileURLToPath(import.meta.url);
const loadTypeScript = relative => tsxRequire(fileURLToPath(new URL(relative, import.meta.url)), fromFile);
const { getIPFSAccelerateDescriptorPack, ipfsAccelerateBackendBindings, validateIPFSAccelerateDescriptorPack }
  = loadTypeScript('../../src/services/ipfs/mcp-ipfs-accelerate-descriptor-pack.ts');
const { ipfsAccelerateUIProfileDescriptor } = loadTypeScript('../../src/services/ipfs/mcp-ipfs-ui-descriptors.ts');
const { generateSchemaDrivenUI } = loadTypeScript('../../src/services/mcp/mcp-schema-ui-generator.ts');

const aliasNames = ['hardware_profile', 'telemetry', 'list_models', 'job_status', 'run_inference_job'];
const aliases = ipfsAccelerateBackendBindings.filter(binding => aliasNames.includes(binding.tool_function));
const project = path.resolve(import.meta.dirname, '../..');
const workerSource = fs.readFileSync(path.join(project, 'scripts/all-tools-evidence-lib.cjs'), 'utf8');
const match = workerSource.match(/const ACCELERATE_CONTRACT_OPS = (\{[\s\S]*?\n\});/);
assert.ok(match, 'Actual worker contract table is missing');
const runtime = vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });

test('reviewed aliases name the actual runtime entrypoint and argument mapping', () => {
  assert.deepEqual(aliases.map(binding => binding.tool_function).sort(), [...aliasNames].sort());
  for (const binding of aliases) {
    const spec = runtime[binding.tool_function]; assert.ok(spec);
    const entrypoint = [spec.module, spec.cls, spec.method || spec.func].filter(Boolean).join('.');
    assert.equal(binding.runtime_entrypoint, entrypoint, binding.tool_function);
    assert.equal(binding.tool_module, spec.module);
    assert.deepEqual(binding.runtime_argument_aliases, { ...spec.argMap });
    assert.equal(binding.runtime_required_flag, spec.require_flag);
    assert.equal(binding.read_only, spec.kind === 'read');
    assert.ok(binding.category); assert.equal(binding.inputSchema.type, 'object');
  }
});

test('hardware and telemetry aliases expose real argument-free snapshots without invented measurements', () => {
  for (const name of ['hardware_profile', 'telemetry']) {
    const binding = aliases.find(item => item.tool_function === name);
    assert.deepEqual(binding.inputSchema, { type: 'object', additionalProperties: false, properties: {} });
    assert.equal(binding.read_only, true);
    assert.equal(binding.preview_behavior, 'read-owner-result');
    assert.equal(binding.stream, undefined);
  }
  assert.match(aliases.find(item => item.tool_function === 'hardware_profile').backend_contract, /does not grant production authorization/);
  assert.match(aliases.find(item => item.tool_function === 'telemetry').backend_contract, /PrometheusMetrics\(\)\.generate_metrics\(\) -> bytes/);
  assert.equal(aliases.find(item => item.tool_function === 'telemetry').runtime_required_flag, 'HAVE_PROMETHEUS_CLIENT');
});

test('entrypoints and mapped parameter names exist in the actual owner Python source', () => {
  const requests = aliases.map(binding => ({ alias: binding.tool_function,
    file: path.resolve(project, '../external/ipfs_accelerate', ...runtime[binding.tool_function].module.split('.')) + '.py',
    class_name: runtime[binding.tool_function].cls,
    function_name: runtime[binding.tool_function].method || runtime[binding.tool_function].func,
    mapped: Object.values(binding.runtime_argument_aliases) }));
  const script = `import ast,json,sys\nfor request in json.load(sys.stdin):\n tree=ast.parse(open(request['file']).read())\n scope=tree.body\n if request.get('class_name'): scope=next(node for node in scope if isinstance(node,ast.ClassDef) and node.name==request['class_name']).body\n function=next(node for node in scope if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name==request['function_name'])\n names={arg.arg for arg in function.args.posonlyargs+function.args.args+function.args.kwonlyargs}\n assert all(name in names for name in request['mapped']),request['alias']\nprint('verified')\n`;
  assert.equal(execFileSync('python3', ['-c', script], { input: JSON.stringify(requests), encoding: 'utf8' }).trim(), 'verified');
});

test('model catalog operation is a real read and adds no local model inventory', () => {
  const pack = getIPFSAccelerateDescriptorPack();
  assert.equal(validateIPFSAccelerateDescriptorPack(pack).valid, true);
  const operation = pack.descriptors[0].data_contracts.operations.find(item => item.method === 'list_models');
  assert.equal(operation.idempotent, true);
  assert.deepEqual(operation.output_schema, { type: 'array', items: { type: 'string', minLength: 1 } });
  assert.equal(Object.hasOwn(operation.output_schema, 'minItems'), false, 'an empty actual catalog must remain valid');
  assert.equal(generateSchemaDrivenUI(pack.descriptors[0]).commands.some(command => command.operation === 'list_models'), true);
  assert.equal(ipfsAccelerateUIProfileDescriptor.methods.some(method => method.name === 'list_models'), false,
    'pack extension mutated the shared legacy descriptor');
});

test('job status requires a real ID and inference preview promises no queued job', () => {
  const status = aliases.find(binding => binding.tool_function === 'job_status');
  assert.deepEqual(status.inputSchema.anyOf, [{ required: ['task_id'] }, { required: ['job_id'] }]);
  assert.equal(Object.hasOwn(status.inputSchema.properties, 'task'), false);
  assert.equal(Object.hasOwn(status.inputSchema.properties, 'queue_path'), false);
  const inference = aliases.find(binding => binding.tool_function === 'run_inference_job');
  assert.equal(inference.preview_behavior, 'validate-callable-without-execution');
  assert.match(inference.backend_contract, /no queued job ID is promised/);
  assert.equal(inference.stream, undefined);
  assert.deepEqual(inference.runtime_argument_aliases, { input: 'input_data', model_id: 'model' });
});

test('descriptor validation rejects aliases stripped of reviewed execution provenance', () => {
  for (const name of aliasNames) {
    for (const field of ['category', 'read_only', 'inputSchema', 'runtime_entrypoint', 'runtime_argument_aliases', 'preview_behavior']) {
      const pack = getIPFSAccelerateDescriptorPack();
      const alias = pack.backend_bindings.find(binding => binding.tool_function === name);
      delete alias[field];
      assert.equal(validateIPFSAccelerateDescriptorPack(pack).valid, false, `${name}/${field}`);
    }
  }
  const pack = getIPFSAccelerateDescriptorPack();
  pack.backend_bindings.find(binding => binding.tool_function === 'job_status').runtime_entrypoint = 'unrelated.owner.get_task';
  assert.equal(validateIPFSAccelerateDescriptorPack(pack).valid, false);
});

test('pack consumers receive independent alias metadata and operation schemas', () => {
  const copy = getIPFSAccelerateDescriptorPack();
  copy.backend_bindings.find(binding => binding.tool_function === 'job_status').runtime_argument_aliases.job_id = 'invented';
  copy.descriptors[0].data_contracts.operations.find(operation => operation.method === 'list_models').output_schema.minItems = 1;
  const original = getIPFSAccelerateDescriptorPack();
  assert.equal(original.backend_bindings.find(binding => binding.tool_function === 'job_status').runtime_argument_aliases.job_id, 'task_id');
  assert.equal(original.descriptors[0].data_contracts.operations.find(operation => operation.method === 'list_models').output_schema.minItems, undefined);
});
