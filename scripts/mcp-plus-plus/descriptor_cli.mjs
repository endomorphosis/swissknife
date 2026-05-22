#!/usr/bin/env node
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PROFILE = 'swissknife.mcp++/ui-profile';
const STARTER_PACKS = new Map([
  ['crud', crudStarter],
  ['explorer', explorerStarter],
  ['stream-dashboard', streamDashboardStarter],
  ['job-console', jobConsoleStarter],
  ['dataset-inference-workflow', datasetInferenceWorkflowStarter],
]);

function main(argv) {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case '--help':
      case '-h':
        return help();
      case 'lint':
        return printResult(lintTarget(requiredArg(args, 0, 'descriptor or directory')));
      case 'validate':
        return printResult(validateDescriptor(readJson(requiredArg(args, 0, 'descriptor'))));
      case 'compat':
        return printResult(compatDescriptor(
          readJson(requiredArg(args, 0, 'base descriptor')),
          readJson(requiredArg(args, 1, 'candidate descriptor')),
        ));
      case 'verify-trust':
        return printResult(verifyTrust(
          readJson(requiredArg(args, 0, 'descriptor')),
          parseFlags(args.slice(1)),
        ));
      case 'scaffold':
        return scaffold(args);
      case 'starter-packs':
        return console.log([...STARTER_PACKS.keys()].join('\n'));
      case 'help':
      case undefined:
        return help();
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function lintTarget(target) {
  const inputs = readDescriptorInputs(target);
  const issues = [];
  for (const input of inputs) {
    const report = lintDescriptor(input.descriptor);
    issues.push(...report.issues.map(issue => ({ ...issue, source: input.source })));
  }
  return { ...result(issues), checked: inputs.length };
}

function lintDescriptor(descriptor) {
  const issues = [];
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    issues.push(issue('descriptor', 'Descriptor must be a JSON object.'));
    return result(issues);
  }
  for (const key of ['name', 'namespace', 'version']) {
    if (!nonEmpty(descriptor[key])) issues.push(issue(key, `${key} is required.`));
  }
  if (descriptor.meta?.profile !== PROFILE) issues.push(issue('meta.profile', `Expected ${PROFILE}.`));
  for (const key of ['methods', 'services']) {
    if (!Array.isArray(descriptor[key]) || descriptor[key].length === 0) {
      issues.push(issue(key, `${key} must be a non-empty array.`));
    }
  }
  if (!descriptor.ui?.primary_template) issues.push(issue('ui.primary_template', 'Primary template is required.'));
  if (!Array.isArray(descriptor.data_contracts?.operations)) {
    issues.push(issue('data_contracts.operations', 'Operation contracts are required.'));
  }
  if (!descriptor.permissions?.operations) issues.push(issue('permissions.operations', 'Operation permissions are required.'));
  if (!Array.isArray(descriptor.state_model?.keys)) issues.push(issue('state_model.keys', 'State model keys are required.'));
  return result(issues);
}

function validateDescriptor(descriptor) {
  const issues = lintDescriptor(descriptor).issues;
  const methods = new Set((descriptor.methods || []).map(method => method?.name).filter(nonEmpty));
  for (const [index, operation] of (descriptor.data_contracts?.operations || []).entries()) {
    if (!methods.has(operation.method)) {
      issues.push(issue(`data_contracts.operations[${index}].method`, `Unknown method: ${operation.method}`));
    }
    if (!operation.input_schema && !operation.input_schema_cid) {
      issues.push(issue(`data_contracts.operations[${index}].input_schema`, 'Input schema or CID is required.'));
    }
    if (!operation.output_schema && !operation.output_schema_cid) {
      issues.push(issue(`data_contracts.operations[${index}].output_schema`, 'Output schema or CID is required.'));
    }
    if (operation.stream && operation.stream.kind !== 'none' && !operation.stream.event_schema && !operation.stream.event_schema_cid) {
      issues.push(issue(`data_contracts.operations[${index}].stream.event_schema`, 'Streaming operations require an event schema or CID.'));
    }
  }
  for (const [index, service] of (descriptor.services || []).entries()) {
    for (const operation of service.operations || []) {
      if (!methods.has(operation)) issues.push(issue(`services[${index}].operations`, `Unknown service operation: ${operation}`));
    }
  }
  for (const [index, template] of (descriptor.ui?.templates || []).entries()) {
    for (const operation of template.operations || []) {
      if (!methods.has(operation)) issues.push(issue(`ui.templates[${index}].operations`, `Unknown template operation: ${operation}`));
    }
  }
  for (const operation of Object.keys(descriptor.permissions?.operations || {})) {
    if (!methods.has(operation)) issues.push(issue(`permissions.operations.${operation}`, `Unknown permission operation: ${operation}`));
  }
  return result(issues);
}

function compatDescriptor(base, candidate) {
  const issues = [];
  const baseMethods = new Set((base.methods || []).map(method => method?.name).filter(nonEmpty));
  const candidateMethods = new Set((candidate.methods || []).map(method => method?.name).filter(nonEmpty));
  for (const method of baseMethods) {
    if (!candidateMethods.has(method)) issues.push(issue('methods', `Candidate removed method: ${method}`));
  }
  const basePermissions = Object.keys(base.permissions?.operations || {});
  for (const operation of basePermissions) {
    if (!candidate.permissions?.operations?.[operation]) {
      issues.push(issue('permissions.operations', `Candidate removed permissions for operation: ${operation}`));
    }
  }
  return result(issues);
}

function verifyTrust(descriptor, options = {}) {
  const issues = [];
  const publisher = descriptor?.meta?.publisher;
  const trust = descriptor?.trust;
  const allowedPublishers = splitList(options['allowed-publishers'] || options['allowed-publisher']);
  const allowedSigners = splitList(options['allowed-signers'] || options['allowed-signer']);
  if (allowedPublishers.length > 0 && (!publisher || !allowedPublishers.includes(publisher))) {
    issues.push(issue('meta.publisher', `Publisher ${publisher || '<missing>'} is not allowlisted.`));
  }
  if (!trust) {
    if (options['require-signature']) {
      issues.push(issue('trust', 'Descriptor signature is required.'));
    }
    return result(issues);
  }
  if (allowedSigners.length > 0 && !allowedSigners.includes(trust.signed_by)) {
    issues.push(issue('trust.signed_by', `Signer ${trust.signed_by} is not allowlisted.`));
  }
  if (trust.signature_algorithm !== 'Ed25519') {
    issues.push(issue('trust.signature_algorithm', `Unsupported signature algorithm: ${trust.signature_algorithm}`));
  }
  const unsigned = stripTrust(descriptor);
  const canonicalCid = computeInterfaceCID(unsigned);
  if (trust.canonical_cid !== canonicalCid) {
    issues.push(issue('trust.canonical_cid', 'Descriptor canonical CID does not match the signed payload.'));
  }
  if (!verifyDescriptorSignature(unsigned, trust)) {
    issues.push(issue('trust.signature', 'Descriptor signature verification failed.'));
  }
  return result(issues);
}

function scaffold(args) {
  const archetype = requiredArg(args, 0, 'starter pack');
  const output = requiredArg(args, 1, 'output path');
  const pack = STARTER_PACKS.get(archetype);
  if (!pack) throw new Error(`Unknown starter pack: ${archetype}`);
  const options = parseFlags(args.slice(2));
  const descriptor = pack({
    appId: options['app-id'] || archetype,
    title: options.title || titleize(archetype),
    namespace: options.namespace || `local.${archetype.replace(/-/g, '_')}`,
  });
  const target = resolve(output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
  console.log(target);
}

function crudStarter(options) {
  return descriptorBase(options, {
    template: 'explorer',
    operations: [
      operation('list_records', 'List Records', {}, { rows: { type: 'array', items: { type: 'object' } } }),
      operation('create_record', 'Create Record', { record: { type: 'object', additionalProperties: true } }, { id: { type: 'string' } }),
      operation('update_record', 'Update Record', { id: { type: 'string' }, patch: { type: 'object', additionalProperties: true } }, { id: { type: 'string' }, status: { type: 'string' } }),
      operation('delete_record', 'Delete Record', { id: { type: 'string' } }, { id: { type: 'string' }, status: { type: 'string' } }),
    ],
  });
}

function explorerStarter(options) {
  return descriptorBase(options, {
    template: 'explorer',
    operations: [
      operation('browse', 'Browse', { root_cid: { type: 'string' }, path: { type: 'string', default: '/' } }, { entries: { type: 'array', items: { type: 'object' } } }),
      operation('get', 'Get', { cid: { type: 'string' } }, { cid: { type: 'string' }, payload_ref: { type: 'object', additionalProperties: true } }),
      operation('search', 'Search', { query: { type: 'string' } }, { rows: { type: 'array', items: { type: 'object' } } }),
    ],
  });
}

function streamDashboardStarter(options) {
  return descriptorBase(options, {
    template: 'dashboard',
    operations: [
      operation('status', 'Status', {}, { status: { type: 'string' }, metrics: { type: 'object', additionalProperties: true } }),
      streamOperation('telemetry', 'Telemetry', {}, { events: { type: 'array', items: { type: 'object' } } }, 'telemetry'),
    ],
  });
}

function jobConsoleStarter(options) {
  return descriptorBase(options, {
    template: 'job-console',
    operations: [
      streamOperation('run_job', 'Run Job', { input: { type: 'object', additionalProperties: true } }, { correlation_id: { type: 'string' }, status: { type: 'string' } }, 'job-status'),
      streamOperation('job_status', 'Job Status', { correlation_id: { type: 'string' } }, { correlation_id: { type: 'string' }, status: { type: 'string' }, progress: { type: 'number' } }, 'job-status'),
    ],
  });
}

function datasetInferenceWorkflowStarter(options) {
  const descriptor = descriptorBase(options, {
    template: 'graph-viewer',
    operations: [
      operation('select_dataset', 'Select Dataset', { root_cid: { type: 'string' } }, { correlation_id: { type: 'string' }, dataset_cid: { type: 'string' } }),
      streamOperation('pin_dataset', 'Pin Dataset', { correlation_id: { type: 'string' }, dataset_cid: { type: 'string' } }, { correlation_id: { type: 'string' }, pinned_cid: { type: 'string' } }, 'progress'),
      streamOperation('run_inference_job', 'Run Inference Job', { correlation_id: { type: 'string' }, input_ref: { type: 'object', additionalProperties: true } }, { correlation_id: { type: 'string' }, job_id: { type: 'string' } }, 'job-status'),
      streamOperation('job_status', 'Job Status', { correlation_id: { type: 'string' }, job_id: { type: 'string' } }, { correlation_id: { type: 'string' }, status: { type: 'string' }, progress: { type: 'number' }, artifact_cid: { type: 'string' } }, 'job-status'),
      streamOperation('publish_artifact', 'Publish Artifact', { correlation_id: { type: 'string' }, artifact_cid: { type: 'string' } }, { correlation_id: { type: 'string' }, publication_id: { type: 'string' } }, 'progress'),
    ],
  });
  descriptor.workflow_graph = {
    id: 'dataset-inference-workflow',
    shared_state_keys: ['correlation_id', 'dataset_cid', 'pinned_cid', 'job_id', 'artifact_cid', 'publication_id'],
    steps: [
      { id: 'select_dataset', operation: 'select_dataset', write_state_keys: ['correlation_id', 'dataset_cid'] },
      { id: 'pin_dataset', operation: 'pin_dataset', depends_on: ['select_dataset'], read_state_keys: ['dataset_cid'], write_state_keys: ['pinned_cid'] },
      { id: 'run_inference_job', operation: 'run_inference_job', depends_on: ['pin_dataset'], read_state_keys: ['pinned_cid'], write_state_keys: ['job_id'] },
      { id: 'collect_artifact', operation: 'job_status', depends_on: ['run_inference_job'], read_state_keys: ['job_id'], write_state_keys: ['artifact_cid'] },
      { id: 'publish_artifact', operation: 'publish_artifact', depends_on: ['collect_artifact'], read_state_keys: ['job_id', 'artifact_cid'], write_state_keys: ['publication_id'] },
    ],
  };
  descriptor.state_model.keys.push('correlation_id', 'dataset_cid', 'pinned_cid', 'job_id', 'artifact_cid', 'publication_id');
  return descriptor;
}

function descriptorBase(options, spec) {
  const methods = spec.operations.map(op => ({
    name: op.method,
    input_schema: op.input_schema,
    output_schema: op.output_schema,
    event_schema: op.stream?.event_schema,
  }));
  return {
    name: options.appId,
    namespace: options.namespace,
    version: '0.1.0',
    methods,
    errors: [{ name: 'ValidationError', code: 422 }],
    requires: [],
    compatibility: { compatible_with: [], supersedes: [] },
    meta: {
      profile: PROFILE,
      profile_version: '0.1.0',
      app_id: options.appId,
      title: options.title,
      publisher: 'local',
    },
    services: [{
      id: 'primary',
      interface_type: spec.template === 'job-console' ? 'compute' : 'generic',
      transport: 'mcp-server',
      endpoint: `mcp://${options.appId}`,
      operations: spec.operations.map(op => op.method),
    }],
    ui: {
      primary_template: spec.template,
      templates: [{
        kind: spec.template,
        operations: spec.operations.map(op => op.method),
      }],
    },
    data_contracts: {
      operations: spec.operations,
      schemas: {},
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(spec.operations.map(op => [op.method, [`${options.appId}/${op.method}`]])),
    },
    state_model: {
      keys: ['selected_id', 'active_jobs', 'provenance_by_correlation_id'],
      events: spec.operations.some(op => op.stream) ? ['stream.event'] : [],
      projections: ['main'],
      replay: true,
    },
  };
}

function operation(method, title, inputProperties, outputProperties) {
  return {
    method,
    title,
    input_schema: schema(inputProperties),
    output_schema: schema(outputProperties),
  };
}

function streamOperation(method, title, inputProperties, outputProperties, kind) {
  const op = operation(method, title, inputProperties, outputProperties);
  op.stream = {
    kind,
    event_schema: {
      type: 'object',
      properties: {
        correlation_id: { type: 'string' },
        status: { type: 'string' },
        progress: { type: 'number' },
        metrics: { type: 'object', additionalProperties: true },
        timestamp: { type: 'string' },
      },
      required: kind === 'telemetry'
        ? ['correlation_id', 'status', 'metrics', 'timestamp']
        : ['correlation_id', 'status', 'timestamp'],
    },
    correlation_id_field: 'correlation_id',
    generation_key: `${method}_generation`,
  };
  return op;
}

function schema(properties) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties).filter(key => !properties[key].default),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function readDescriptorInputs(path) {
  const target = resolve(path);
  const stat = statSync(target);
  if (stat.isFile()) {
    return [{ source: target, descriptor: readJson(target) }];
  }
  if (!stat.isDirectory()) {
    throw new Error(`Descriptor target must be a file or directory: ${path}`);
  }
  return findJsonFiles(target)
    .sort()
    .map(source => ({ source, descriptor: readJson(source) }));
}

function findJsonFiles(directory) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      matches.push(fullPath);
    }
  }
  return matches;
}

function stripTrust(descriptor) {
  const clone = JSON.parse(JSON.stringify(descriptor));
  delete clone.trust;
  return clone;
}

function computeInterfaceCID(descriptor) {
  return `sha256:${createHash('sha256').update(canonicalize(descriptor)).digest('hex')}`;
}

function canonicalize(value) {
  return Buffer.from(stableStringify(value), 'utf8');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function verifyDescriptorSignature(unsigned, trust) {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(buildEd25519SpkiDer(didToEd25519PublicKeyBytes(trust.signed_by))),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(null, canonicalize(unsigned), publicKey, base64urlDecode(trust.signature));
  } catch {
    return false;
  }
}

function base64urlDecode(value) {
  const padded = String(value).padEnd(String(value).length + ((4 - (String(value).length % 4)) % 4), '=');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

function didToEd25519PublicKeyBytes(did) {
  if (!String(did).startsWith('did:key:z')) {
    throw new Error(`Not a did:key DID: ${did}`);
  }
  const prefixed = base58Decode(String(did).slice('did:key:z'.length));
  if (
    prefixed[0] !== ED25519_MULTICODEC_PREFIX[0]
    || prefixed[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('DID is not an Ed25519 did:key.');
  }
  return prefixed.slice(2);
}

function base58Decode(value) {
  const bytes = [0];
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length && value[index] === '1'; index += 1) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function buildEd25519SpkiDer(rawPublicKey) {
  return new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ...rawPublicKey,
  ]);
}

function splitList(value) {
  return typeof value === 'string'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : [];
}

function printResult(report) {
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

function result(issues) {
  return { valid: issues.length === 0, issues };
}

function issue(path, message) {
  return { code: issueCode(path), path, message };
}

function issueCode(path) {
  const normalized = path
    .replace(/\[\d+\]/g, '.item')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return `MCPUI_${normalized || 'DESCRIPTOR'}`;
}

function requiredArg(args, index, label) {
  if (!args[index]) throw new Error(`Missing ${label}.`);
  return args[index];
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[arg.slice(2)] = true;
      } else {
        flags[arg.slice(2)] = next;
        index += 1;
      }
    }
  }
  return flags;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function titleize(value) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function help() {
  console.log(`Usage:
  descriptor_cli.mjs lint <descriptor.json|directory>
  descriptor_cli.mjs validate <descriptor.json>
  descriptor_cli.mjs compat <base.json> <candidate.json>
  descriptor_cli.mjs verify-trust <descriptor.json> [--require-signature] [--allowed-publishers a,b] [--allowed-signers did:key:z...]
  descriptor_cli.mjs scaffold <starter-pack> <output.json> [--app-id id] [--title title] [--namespace ns]
  descriptor_cli.mjs starter-packs`);
}

main(process.argv.slice(2));
