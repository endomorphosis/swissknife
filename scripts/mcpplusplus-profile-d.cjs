const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const WORKSPACE_DATASETS_ROOT = path.resolve(__dirname, '..', '..', 'external', 'ipfs_datasets');
const LEGACY_DATASETS_ROOT = '/home/barberb/ipfs_datasets_py';

class ProfileDRequestError extends Error {
  constructor(message, code = -32602) {
    super(message);
    this.name = 'ProfileDRequestError';
    this.code = code;
  }
}

function resolveDatasetsRoot() {
  const candidates = [
    process.env.IPFS_DATASETS_PY_CANONICAL_ROOT,
    WORKSPACE_DATASETS_ROOT,
    process.env.IPFS_DATASETS_PY_ROOT,
    LEGACY_DATASETS_ROOT,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    if (fs.existsSync(path.join(root, 'ipfs_datasets_py', 'logic', 'profile_d_policy.py'))) {
      return root;
    }
  }
  throw new ProfileDRequestError('The canonical ipfs_datasets_py Profile D package export is unavailable.', -32603);
}

const EVALUATOR_PROGRAM = String.raw`
import contextlib
import io
import json
import sys

payload = json.load(sys.stdin)
with contextlib.redirect_stdout(io.StringIO()):
    try:
        from ipfs_datasets_py.logic.profile_d_policy import ProfileDPolicyError, evaluate_execution_policy
        result = evaluate_execution_policy(
            actor=payload.get("actor", ""),
            action=payload.get("action", ""),
            resource=payload.get("resource"),
            policy=payload.get("policy") if isinstance(payload.get("policy"), dict) else None,
            policy_text=payload.get("policy_text"),
            evaluated_at=payload.get("evaluated_at"),
            intent_cid=payload.get("intent_cid"),
            request_zkp_certificate=bool(payload.get("request_zkp_certificate", False)),
        )
        response = {"ok": True, "result": result}
    except Exception as error:
        code = -32602 if error.__class__.__name__ == "ProfileDPolicyError" else -32603
        response = {"ok": False, "code": code, "message": str(error)}
print(json.dumps(response, separators=(",", ":")))
`;

// The canonical package explicitly supports a hermetic import mode for narrow
// logic consumers. Profile D needs its exported evaluator, not the optional
// model, FastAPI, or vector-store integrations that otherwise run during the
// package import. Keeping this opt-in at the subprocess boundary avoids
// changing normal ipfs_datasets_py process behavior.
const EVALUATOR_ENV = {
  IPFS_DATASETS_PY_MINIMAL_IMPORTS: '1',
  IPFS_DATASETS_AUTO_INSTALL: '0',
  IPFS_KIT_AUTO_INSTALL_DEPS: '0',
  MCPPLUSPLUS_PROFILE_D_INCLUDE_ARTIFACT_BLOCKS: '1',
};
const DEFAULT_EVALUATOR_TIMEOUT_MS = 30_000;

function evaluateProfileDWithDatasetsPackage(params, { artifactStore } = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return Promise.reject(new ProfileDRequestError('Profile D parameters must be an object.'));
  }
  let datasetsRoot;
  try {
    datasetsRoot = resolveDatasetsRoot();
  } catch (error) {
    return Promise.reject(error);
  }
  const python = process.env.IPFS_DATASETS_PYTHON || process.env.PYTHON || 'python3';
  const inheritedPath = process.env.PYTHONPATH || '';
  const pythonPath = [datasetsRoot, inheritedPath].filter(Boolean).join(path.delimiter);
  const timeoutMs = positiveInteger(process.env.MCPPLUSPLUS_PROFILE_D_EVALUATOR_TIMEOUT_MS, DEFAULT_EVALUATOR_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-c', EVALUATOR_PROGRAM], {
      env: { ...process.env, ...EVALUATOR_ENV, PYTHONPATH: pythonPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const finish = callback => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback();
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => finish(() => reject(new ProfileDRequestError(error.message, -32603))));
    child.on('close', async code => {
      if (settled) return;
      if (code !== 0) {
        finish(() => reject(new ProfileDRequestError(stderr.trim() || `Profile D evaluator exited with status ${code}.`, -32603)));
        return;
      }
      try {
        const response = JSON.parse(stdout);
        if (response?.ok !== true || !response.result || typeof response.result !== 'object') {
          finish(() => reject(new ProfileDRequestError(String(response?.message || 'Profile D evaluation failed.'), Number(response?.code) || -32603)));
          return;
        }
        const result = response.result;
        const blocks = result._artifact_blocks;
        delete result._artifact_blocks;
        if (artifactStore?.persistProfileD) {
          try {
            result.artifact_persistence = await artifactStore.persistProfileD(blocks);
          } catch (persistenceError) {
            result.artifact_persistence = {
              profile: 'D',
              complete: false,
              artifacts: {},
              error: persistenceError instanceof Error
                ? persistenceError.message
                : String(persistenceError),
            };
          }
        }
        finish(() => resolve(result));
      } catch (error) {
        finish(() => reject(new ProfileDRequestError(`Invalid Profile D evaluator response: ${error.message}`, -32603)));
      }
    });
    timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_error) {}
      finish(() => reject(new ProfileDRequestError(
        `Profile D evaluator timed out after ${timeoutMs}ms.`,
        -32603,
      )));
    }, timeoutMs);
    child.stdin.end(JSON.stringify(params));
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  ProfileDRequestError,
  evaluateProfileDWithDatasetsPackage,
  resolveDatasetsRoot,
};
