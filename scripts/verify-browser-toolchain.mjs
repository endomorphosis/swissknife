#!/usr/bin/env node

/**
 * Verify the portable Node/npm contract used by browser-validation lanes.
 *
 * This script intentionally uses only Node built-ins: it must work in a clean
 * checkout before `npm ci` has populated node_modules.
 */

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants as fsConstants,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCHEMA = "swissknife.browser-validation-toolchain.v1";
// Helia's locked browser/libp2p transport used by the all-app evidence lane
// requires Node 22.19 or newer. Keep this exact value in lock-step with the
// root package and lockfile engine declaration.
const NODE_POLICY = ">=22.19.0";
const PACKAGE_MANAGER_NAME = "npm";
const DEFAULT_RECEIPT =
  "test-results/browser-toolchain/verification-receipt.json";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

class ToolchainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ToolchainError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ToolchainError(code, message, details);
}

function parseArgs(argv) {
  const options = {
    receipt: path.join(REPOSITORY_ROOT, DEFAULT_RECEIPT),
    checkNodeExecutable: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--receipt") {
      const value = argv[++index];
      if (!value)
        fail("usage", "--receipt requires a path (or '-' to disable the file)");
      options.receipt =
        value === "-" ? null : path.resolve(process.cwd(), value);
    } else if (argument === "--check-node-executable") {
      const value = argv[++index];
      if (!value)
        fail("usage", "--check-node-executable requires an absolute path");
      if (!path.isAbsolute(value)) {
        fail(
          "node_executable_not_absolute",
          "--check-node-executable must be absolute",
          {
            executable: value,
          },
        );
      }
      options.checkNodeExecutable = path.normalize(value);
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        [
          "Usage: node scripts/verify-browser-toolchain.mjs [options]",
          "",
          "Options:",
          `  --receipt PATH                 Receipt destination (default: ${DEFAULT_RECEIPT})`,
          "                                 Use '-' to avoid writing a receipt file.",
          "  --check-node-executable PATH   Require this absolute Node executable.",
          "  --json                         Print the complete receipt as JSON.",
          "  --help                         Show this help.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      fail("usage", `Unknown argument: ${argument}`);
    }
  }

  return options;
}

function parseSemanticVersion(raw, label) {
  const source = String(raw).trim().replace(/^v/, "");
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      source,
    );
  if (!match) {
    fail(
      "invalid_semantic_version",
      `${label} is not a semantic version: ${raw}`,
      {
        label,
        value: raw,
      },
    );
  }
  return {
    raw: source,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function isSupportedNodeVersion(version) {
  if (version.prerelease) return false;
  if (version.major === 22) return version.minor >= 19;
  return version.major > 22;
}

function compareSemanticVersions(left, right) {
  for (const part of ["major", "minor", "patch"]) {
    if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
  }
  return 0;
}

function runPolicySelfTests() {
  const cases = [
    ["20.19.1", false],
    ["21.7.3", false],
    ["22.18.9", false],
    ["22.19.0", true],
    ["22.19.1", true],
    ["23.0.0", true],
    ["24.0.0", true],
    ["22.19.0-rc.1", false],
  ];
  const results = cases.map(([candidate, expected]) => {
    const actual = isSupportedNodeVersion(
      parseSemanticVersion(candidate, "policy self-test candidate"),
    );
    return { candidate, expected, actual, passed: actual === expected };
  });
  const failures = results.filter((result) => !result.passed);
  if (failures.length) {
    fail(
      "policy_self_test_failed",
      "The built-in Node policy boundary checks failed",
      {
        failures,
      },
    );
  }
  return results;
}

function readJson(file, label) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (error) {
    fail("required_file_unreadable", `Cannot read ${label}: ${file}`, {
      file,
      cause: error.message,
    });
  }
  try {
    return { value: JSON.parse(source), source };
  } catch (error) {
    fail("invalid_json", `${label} is not valid JSON: ${file}`, {
      file,
      cause: error.message,
    });
  }
}

function canonicalExecutable(executable, label) {
  try {
    accessSync(
      executable,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    const metadata = statSync(executable);
    if (!metadata.isFile()) {
      fail(
        "not_an_executable_file",
        `${label} is not a regular file: ${executable}`,
        {
          executable,
        },
      );
    }
    return realpathSync.native(executable);
  } catch (error) {
    if (error instanceof ToolchainError) throw error;
    fail("executable_unavailable", `${label} is unavailable: ${executable}`, {
      executable,
      cause: error.message,
    });
  }
}

function executableCandidates(command) {
  if (process.platform !== "win32") return [command];
  if (path.extname(command)) return [command];
  const extensions = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  return [
    command,
    ...extensions.map((extension) => `${command}${extension.toLowerCase()}`),
  ];
}

function resolvePathCommand(command) {
  const pathValue = process.env.PATH || "";
  for (const directoryEntry of pathValue.split(path.delimiter)) {
    const directory = directoryEntry || process.cwd();
    for (const candidateName of executableCandidates(command)) {
      const candidate = path.resolve(directory, candidateName);
      try {
        accessSync(
          candidate,
          process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
        );
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue through PATH. A stale or broken entry must not hide a later valid one.
      }
    }
  }
  fail("path_command_missing", `${command} is not available on PATH`, {
    command,
  });
}

function runVersionCommand(executable, args, label) {
  const result = spawnSync(executable, args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: process.env,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    fail("version_command_failed", `Cannot determine ${label} version`, {
      executable,
      status: result.status,
      signal: result.signal,
      stderr: String(result.stderr || "").trim(),
      cause: result.error?.message || null,
    });
  }
  return String(result.stdout || "").trim();
}

function versionLabelsInPath(executable) {
  const labels = [];
  const components = path.resolve(executable).split(path.sep).filter(Boolean);
  const patterns = [
    /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/,
    /^node-v(\d+\.\d+\.\d+)(?:-[A-Za-z0-9_.-]+)?$/,
    /^node-(\d+\.\d+\.\d+)$/,
  ];
  for (const component of components) {
    for (const pattern of patterns) {
      const match = pattern.exec(component);
      if (match) {
        labels.push({ component, version: match[1] });
        break;
      }
    }
  }
  return labels;
}

function assertPathVersionLabels(executable, actualVersion) {
  const labels = versionLabelsInPath(executable);
  const mismatches = labels.filter((label) => label.version !== actualVersion);
  if (mismatches.length) {
    fail(
      "node_path_version_mismatch",
      `Node path claims a version different from the executable (${actualVersion})`,
      { executable, actualVersion, mismatches },
    );
  }
  return labels;
}

function assertSameExecutable(first, second, code, message) {
  const firstCanonical = canonicalExecutable(first, "Node executable");
  const secondCanonical = canonicalExecutable(second, "Node executable");
  if (firstCanonical !== secondCanonical) {
    fail(code, message, {
      first,
      firstCanonical,
      second,
      secondCanonical,
    });
  }
  return firstCanonical;
}

function atomicWriteJson(file, value) {
  const directory = path.dirname(file);
  mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, file);
}

function relativeOrAbsolute(file) {
  const relative = path.relative(REPOSITORY_ROOT, file);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".."
    ? relative.split(path.sep).join("/")
    : file;
}

function verify(options) {
  const selfTests = runPolicySelfTests();
  const packageJsonPath = path.join(REPOSITORY_ROOT, "package.json");
  const lockfilePath = path.join(REPOSITORY_ROOT, "package-lock.json");
  const nvmrcPath = path.join(REPOSITORY_ROOT, ".nvmrc");
  const { value: packageJson } = readJson(packageJsonPath, "package.json");
  const { value: packageLock, source: packageLockSource } = readJson(
    lockfilePath,
    "package-lock.json",
  );

  let nvmrc;
  try {
    nvmrc = readFileSync(nvmrcPath, "utf8").trim().replace(/^v/, "");
  } catch (error) {
    fail("required_file_unreadable", `Cannot read .nvmrc: ${nvmrcPath}`, {
      file: nvmrcPath,
      cause: error.message,
    });
  }
  const pinnedVersion = parseSemanticVersion(nvmrc, ".nvmrc");
  if (pinnedVersion.raw !== nvmrc || pinnedVersion.prerelease) {
    fail(
      "nvmrc_not_exact_release",
      ".nvmrc must contain one exact, stable semantic version",
      {
        value: nvmrc,
      },
    );
  }
  if (!isSupportedNodeVersion(pinnedVersion)) {
    fail(
      "nvmrc_unsupported",
      `.nvmrc ${nvmrc} does not satisfy ${NODE_POLICY}`,
    );
  }

  const packagePolicy = packageJson.engines?.node;
  const lockfilePolicy = packageLock.packages?.[""]?.engines?.node;
  if (packagePolicy !== NODE_POLICY || lockfilePolicy !== NODE_POLICY) {
    fail(
      "node_policy_drift",
      "Node policy metadata does not match the verifier",
      {
        expected: NODE_POLICY,
        packageJson: packagePolicy || null,
        packageLock: lockfilePolicy || null,
      },
    );
  }
  const declaredPackageManager = String(packageJson.packageManager || "");
  if (
    !/^npm@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(declaredPackageManager)
  ) {
    fail(
      "package_manager_policy_invalid",
      "package.json packageManager must pin an exact npm semantic version",
      { packageManager: declaredPackageManager || null },
    );
  }
  const declaredNpmVersion = parseSemanticVersion(
    declaredPackageManager.slice(`${PACKAGE_MANAGER_NAME}@`.length),
    "declared npm",
  );
  if (declaredNpmVersion.prerelease) {
    fail(
      "package_manager_policy_invalid",
      "package.json packageManager must pin a stable npm release",
      { packageManager: declaredPackageManager },
    );
  }

  const selectedNode =
    options.checkNodeExecutable || path.resolve(process.execPath);
  const canonicalNode = assertSameExecutable(
    selectedNode,
    process.execPath,
    "selected_node_mismatch",
    "The selected Node executable did not launch this verifier",
  );
  const pathNode = resolvePathCommand(
    process.platform === "win32" ? "node.exe" : "node",
  );
  assertSameExecutable(
    selectedNode,
    pathNode,
    "stale_path_node",
    "PATH resolves node to a different executable than the selected runtime",
  );

  const reportedNodeVersion = runVersionCommand(
    selectedNode,
    ["--version"],
    "Node",
  ).replace(/^v/, "");
  const runtimeNodeVersion = parseSemanticVersion(
    process.versions.node,
    "Node runtime",
  );
  const selectedNodeVersion = parseSemanticVersion(
    reportedNodeVersion,
    "selected Node",
  );
  if (selectedNodeVersion.raw !== runtimeNodeVersion.raw) {
    fail(
      "node_version_identity_mismatch",
      "Selected Node and running Node report different versions",
      {
        selected: selectedNodeVersion.raw,
        runtime: runtimeNodeVersion.raw,
      },
    );
  }
  if (!isSupportedNodeVersion(runtimeNodeVersion)) {
    fail(
      "unsupported_node_version",
      `Node ${runtimeNodeVersion.raw} does not satisfy ${NODE_POLICY}`,
      { actual: runtimeNodeVersion.raw, expected: NODE_POLICY },
    );
  }
  const selectedPathLabels = assertPathVersionLabels(
    selectedNode,
    runtimeNodeVersion.raw,
  );
  const canonicalPathLabels = assertPathVersionLabels(
    canonicalNode,
    runtimeNodeVersion.raw,
  );
  const processPathLabels = assertPathVersionLabels(
    process.execPath,
    runtimeNodeVersion.raw,
  );
  const pathCommandLabels = assertPathVersionLabels(
    pathNode,
    runtimeNodeVersion.raw,
  );

  const npmExecutable = resolvePathCommand(
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  const canonicalNpm = canonicalExecutable(npmExecutable, "npm executable");
  if (path.dirname(npmExecutable) !== path.dirname(pathNode)) {
    fail(
      "npm_node_prefix_mismatch",
      "npm and node must resolve from the same PATH directory",
      { node: pathNode, npm: npmExecutable },
    );
  }
  const npmVersionRaw = runVersionCommand(npmExecutable, ["--version"], "npm");
  const npmVersion = parseSemanticVersion(npmVersionRaw, "npm");
  if (npmVersion.prerelease || compareSemanticVersions(npmVersion, declaredNpmVersion) < 0) {
    fail(
      "unsupported_npm_version",
      `npm ${npmVersion.raw} is older than the ${declaredNpmVersion.raw} repository baseline`,
      { actual: npmVersion.raw, minimum: declaredNpmVersion.raw },
    );
  }

  const lockfileBytes = Buffer.byteLength(packageLockSource);
  const lockfileDigest = createHash("sha256")
    .update(packageLockSource)
    .digest("hex");
  const generatedAt = new Date().toISOString();
  return {
    schema: SCHEMA,
    ok: true,
    generatedAt,
    repositoryRoot: REPOSITORY_ROOT,
    policy: {
      node: NODE_POLICY,
      nvmrc: pinnedVersion.raw,
      packageManager: declaredPackageManager,
      policySelfTests: selfTests,
    },
    node: {
      executable: selectedNode,
      resolvedExecutable: selectedNode,
      canonicalExecutable: canonicalNode,
      pathExecutable: pathNode,
      semanticVersion: runtimeNodeVersion.raw,
      version: runtimeNodeVersion.raw,
      pathVersionLabels: [
        ...selectedPathLabels,
        ...canonicalPathLabels,
        ...processPathLabels,
        ...pathCommandLabels,
      ],
    },
    packageManager: {
      name: PACKAGE_MANAGER_NAME,
      executable: npmExecutable,
      canonicalExecutable: canonicalNpm,
      semanticVersion: npmVersion.raw,
      version: npmVersion.raw,
      declared: declaredPackageManager,
    },
    lockfile: {
      path: "package-lock.json",
      absolutePath: lockfilePath,
      algorithm: "sha256",
      digest: lockfileDigest,
      fingerprint: `sha256:${lockfileDigest}`,
      bytes: lockfileBytes,
      lockfileVersion: packageLock.lockfileVersion,
    },
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    const receipt = verify(options);
    if (options.receipt) atomicWriteJson(options.receipt, receipt);
    if (options.json)
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `Browser toolchain verified: node ${receipt.node.semanticVersion} (${receipt.node.executable}), ` +
        `npm ${receipt.packageManager.semanticVersion}, ${receipt.lockfile.fingerprint}` +
        `${options.receipt ? `; receipt ${relativeOrAbsolute(options.receipt)}` : ""}\n`,
    );
  } catch (error) {
    const normalized =
      error instanceof ToolchainError
        ? error
        : new ToolchainError(
            "unexpected_error",
            error?.message || String(error),
          );
    const failure = {
      schema: SCHEMA,
      ok: false,
      generatedAt: new Date().toISOString(),
      policy: { node: NODE_POLICY },
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    };
    if (options?.receipt) {
      try {
        atomicWriteJson(options.receipt, failure);
      } catch (receiptError) {
        process.stderr.write(
          `Could not write failure receipt: ${receiptError.message}\n`,
        );
      }
    }
    if (options?.json)
      process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
    process.stderr.write(
      `Browser toolchain verification failed [${normalized.code}]: ${normalized.message}\n`,
    );
    process.exitCode = normalized.code === "usage" ? 64 : 1;
  }
}

main();
